/**
 * @file Verificador: dispara as três partes (DMARC, SPF e DKIM) em paralelo, entrega o estado de
 * cada uma quando ela termina e descarta o que sobrou de uma verificação anterior.
 *
 * É a orquestração da spec 006. Ele não conhece o DOM nem o `fetch`: recebe a função de
 * consulta (`consultarTxt` no navegador, uma falsa nos testes) e chama `aoMudar` a cada
 * transição com um estado novo. Três garantias:
 *
 * - **Nunca mistura dois domínios** (RF-02, ADR-4): cada verificação tem um número de geração;
 *   resposta de geração antiga é descartada sem chamar `aoMudar`. As consultas em andamento
 *   terminam sozinhas e o resultado não é usado.
 * - **O domínio vai dentro de uma URL** (CLAUDE.md): o texto digitado passa por
 *   `normalizarDominio` antes de qualquer consulta.
 * - **"Domínio não existe" vem do próprio domínio** (ADR-5): NXDOMAIN em `_dmarc.` ou em
 *   `<seletor>._domainkey.` é normal; só o NXDOMAIN da consulta do domínio sem prefixo, a que o
 *   SPF faz primeiro, marca `dominioInexistente`.
 */

// @ts-check

import { buscarDkim } from "./dkim-busca.js";
import { lerDmarc } from "./dmarc.js";
import { normalizarDominio } from "./dominio.js";
import { lerSpfComConsultas } from "./spf-consultas.js";
import { TEXTOS_FALHA } from "./textos-interface.js";

/** @typedef {import("./spf-consultas.js").Consulta} Consulta */
/** @typedef {import("./tipos.js").NomeParte} NomeParte */
/** @typedef {import("./tipos.js").EstadoVerificacao} EstadoVerificacao */
/** @typedef {import("./tipos.js").EstadoDmarc} EstadoDmarc */
/** @typedef {import("./tipos.js").EstadoSpf} EstadoSpf */
/** @typedef {import("./tipos.js").EstadoDkim} EstadoDkim */
/** @typedef {{ ok: true, dominio: string } | { ok: false, motivo: string }} ResultadoEnvio */
/**
 * @typedef {{
 *   consulta: Consulta, seletoresComuns: ReadonlyArray<string>,
 *   aoMudar: (estado: EstadoVerificacao) => void
 * }} OpcoesVerificador
 */

// ---------------------------------------------------------------------------
// PARTES
// ---------------------------------------------------------------------------

/**
 * @param {Consulta} consultar - A consulta (já envolvida pela geração).
 * @param {string} dominio - O domínio normalizado.
 * @returns {Promise<EstadoDmarc>} O estado final do DMARC.
 */
const rodarDmarc = async (consultar, dominio) => {
  const resposta = await consultar(`_dmarc.${dominio}`);
  if (!resposta.ok) {
    return { parte: "dmarc", fase: "falha", motivo: resposta.motivo };
  }
  return {
    parte: "dmarc",
    fase: "pronto",
    resultado: lerDmarc(resposta.registros),
    resolvedores: resposta.resolvedor === undefined ? [] : [resposta.resolvedor],
  };
};

/**
 * @param {Consulta} consultar - A consulta (já envolvida pela geração).
 * @param {string} dominio - O domínio normalizado.
 * @returns {Promise<EstadoSpf>} O estado final do SPF.
 */
const rodarSpf = async (consultar, dominio) => {
  const caminhada = await lerSpfComConsultas(dominio, consultar);
  return caminhada.ok
    ? { parte: "spf", fase: "pronto", resultado: caminhada, resolvedores: caminhada.resolvedores }
    : { parte: "spf", fase: "falha", motivo: caminhada.motivo };
};

/**
 * @param {Consulta} consultar - A consulta (já envolvida pela geração).
 * @param {string} dominio - O domínio normalizado.
 * @param {string[]} seletores - A lista comum mais os seletores digitados.
 * @returns {Promise<EstadoDkim>} O estado final do DKIM.
 */
const rodarDkim = async (consultar, dominio, seletores) => {
  const busca = await buscarDkim(dominio, seletores, consultar);
  return busca.ok
    ? { parte: "dkim", fase: "pronto", resultado: busca, resolvedores: busca.resolvedores }
    : { parte: "dkim", fase: "falha", motivo: busca.motivo };
};

// ---------------------------------------------------------------------------
// VERIFICADOR
// ---------------------------------------------------------------------------

/**
 * Cria o verificador.
 *
 * `verificar` normaliza o domínio, descarta a verificação anterior e dispara as três partes;
 * `refazer` e `refazerDkim` repetem só uma parte, sobre o mesmo domínio. Quem chama é a página,
 * que desenha o que `aoMudar` entrega.
 *
 * @param {OpcoesVerificador} opcoes - A consulta TXT, a lista de seletores comuns e o callback
 *   de mudança de estado.
 * @returns {{
 *   verificar: (dominioDigitado: string, seletoresExtras?: string[]) => Promise<ResultadoEnvio>,
 *   refazer: (parte: NomeParte) => Promise<void>,
 *   refazerDkim: (seletoresExtras: string[]) => Promise<void>
 * }} As três operações. ``verificar`` devolve ``{ ok: false, motivo }`` (sem consultar nada) se o
 *   domínio é recusado, e ``{ ok: true, dominio }`` quando as três partes terminam.
 */
export const criarVerificador = ({ consulta, seletoresComuns, aoMudar }) => {
  // O número da verificação atual; resposta de número antigo é descartada.
  let geracao = 0;
  // O número da última execução de cada parte: `refazer` descarta a anterior da própria parte
  // sem derrubar as outras da mesma verificação.
  let sequencia = 0;
  /** @type {Record<NomeParte, number>} */
  const execucao = { dmarc: 0, spf: 0, dkim: 0 };
  /** @type {{ dominio: string, extras: string[] } | null} */
  let alvo = null;
  /** @type {EstadoVerificacao | null} */
  let estado = null;
  /** @type {{ chave: string, promessa: Promise<ResultadoEnvio> } | null} */
  let emAndamento = null;

  /** Entrega ao `aoMudar` uma cópia, para ninguém alterar o estado guardado. */
  const publicar = () => {
    if (estado !== null) {
      aoMudar({ ...estado, partes: { ...estado.partes } });
    }
  };

  /**
   * Troca o estado de uma parte, se a execução ainda é a atual.
   *
   * @param {number} minhaGeracao - A verificação que pediu.
   * @param {number} minhaExecucao - A execução da parte que pediu.
   * @param {EstadoDmarc | EstadoSpf | EstadoDkim} novo - O novo estado da parte.
   * @returns {void}
   */
  const aplicar = (minhaGeracao, minhaExecucao, novo) => {
    if (estado === null || minhaGeracao !== geracao || minhaExecucao !== execucao[novo.parte]) {
      return;
    }
    estado = { ...estado, partes: { ...estado.partes, [novo.parte]: novo } };
    publicar();
  };

  /**
   * A consulta que a verificação usa: a mesma, mais o olho na resposta do próprio domínio.
   *
   * @param {number} minhaGeracao - A verificação que pediu.
   * @param {string} dominio - O domínio normalizado.
   * @returns {Consulta} A consulta envolvida. Uma exceção da consulta vira falha.
   */
  const consultaDa = (minhaGeracao, dominio) => async (nome) => {
    try {
      const resposta = await consulta(nome);
      const inexistente = resposta.ok && resposta.situacao === "inexistente";
      if (nome === dominio && inexistente && estado !== null && minhaGeracao === geracao) {
        estado = { ...estado, dominioInexistente: true };
        publicar();
      }
      return resposta;
    } catch {
      return { ok: false, motivo: TEXTOS_FALHA.semMotivo.texto };
    }
  };

  /**
   * Roda uma parte e entrega o resultado quando termina.
   *
   * @param {NomeParte} parte - Qual parte.
   * @param {number} minhaGeracao - A verificação que pediu.
   * @param {{ dominio: string, extras: string[] }} pedido - O domínio e os seletores extras.
   * @returns {Promise<void>} Pronta quando a parte termina (ou é descartada).
   */
  const rodar = async (parte, minhaGeracao, { dominio, extras }) => {
    sequencia += 1;
    const minhaExecucao = sequencia;
    execucao[parte] = minhaExecucao;
    const consultar = consultaDa(minhaGeracao, dominio);

    const novo =
      parte === "dmarc"
        ? await rodarDmarc(consultar, dominio)
        : parte === "spf"
          ? await rodarSpf(consultar, dominio)
          : await rodarDkim(consultar, dominio, [...seletoresComuns, ...extras]);
    aplicar(minhaGeracao, minhaExecucao, novo);
  };

  /**
   * @param {string} dominioDigitado - O que o visitante digitou.
   * @param {string[]} [seletoresExtras] - Os seletores do campo livre, já validados.
   * @returns {Promise<ResultadoEnvio>} O domínio normalizado quando as três partes terminam, ou
   *   o motivo da recusa.
   */
  const verificar = async (dominioDigitado, seletoresExtras = []) => {
    const normalizado = normalizarDominio(String(dominioDigitado));
    if (!normalizado.ok) {
      return { ok: false, motivo: normalizado.motivo };
    }
    const { dominio } = normalizado;
    const extras = seletoresExtras.filter((item) => typeof item === "string");

    // Uma verificação idêntica em andamento não dispara consulta repetida.
    const chave = `${dominio}|${extras.join(",")}`;
    if (emAndamento?.chave === chave) {
      return emAndamento.promessa;
    }

    geracao += 1;
    const minhaGeracao = geracao;
    alvo = { dominio, extras };
    estado = {
      dominio,
      geracao: minhaGeracao,
      dominioInexistente: false,
      partes: {
        dmarc: { parte: "dmarc", fase: "verificando" },
        spf: { parte: "spf", fase: "verificando" },
        dkim: { parte: "dkim", fase: "verificando" },
      },
    };
    publicar();

    const promessa = Promise.all([
      rodar("dmarc", minhaGeracao, alvo),
      rodar("spf", minhaGeracao, alvo),
      rodar("dkim", minhaGeracao, alvo),
    ]).then(() => /** @type {ResultadoEnvio} */ ({ ok: true, dominio }));
    emAndamento = { chave, promessa };
    void promessa.then(() => {
      if (emAndamento?.promessa === promessa) {
        emAndamento = null;
      }
    });
    return promessa;
  };

  /**
   * Repete uma parte só, sobre o mesmo domínio.
   *
   * @param {NomeParte} parte - Qual parte refazer.
   * @returns {Promise<void>} Pronta quando a parte termina.
   */
  const refazer = async (parte) => {
    if (alvo === null || estado === null) {
      return;
    }
    // O domínio inexistente é do SPF (ADR-5): refazê-lo recomeça essa dúvida.
    estado = {
      ...estado,
      dominioInexistente: parte === "spf" ? false : estado.dominioInexistente,
      partes: { ...estado.partes, [parte]: { parte, fase: "verificando" } },
    };
    publicar();
    await rodar(parte, geracao, alvo);
  };

  /**
   * @param {string[]} seletoresExtras - Os seletores do campo livre, já validados.
   * @returns {Promise<void>} Pronta quando o DKIM termina; DMARC e SPF não são consultados.
   */
  const refazerDkim = async (seletoresExtras) => {
    if (alvo === null) {
      return;
    }
    alvo = { ...alvo, extras: seletoresExtras.filter((item) => typeof item === "string") };
    await refazer("dkim");
  };

  return { verificar, refazer, refazerDkim };
};
