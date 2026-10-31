/**
 * @file Estados de parte montados com os leitores reais e registros sintéticos, para os testes
 * de `selo`, `escada` e `apresentacao`.
 *
 * Em vez de escrever à mão o objeto que cada função devolve, o teste escreve o registro TXT
 * (`exemplo.com.br`) e passa por `lerDmarc`, `lerSpfComConsultas` e `buscarDkim`: se um leitor
 * mudar de forma, o teste de tela quebra junto, em vez de continuar verde sobre um formato velho.
 */

// @ts-check

import { buscarDkim } from "../../public/js/dkim-busca.js";
import { lerDmarc } from "../../public/js/dmarc.js";
import { lerSpfComConsultas } from "../../public/js/spf-consultas.js";
import { chaveRsa } from "./chave-sintetica.js";

/** @typedef {import("../../public/js/spf-consultas.js").Consulta} Consulta */
/** @typedef {import("../../public/js/tipos.js").EstadoDmarc} EstadoDmarc */
/** @typedef {import("../../public/js/tipos.js").EstadoSpf} EstadoSpf */
/** @typedef {import("../../public/js/tipos.js").EstadoDkim} EstadoDkim */

// Domínio dos testes: o reservado para exemplo no Brasil, nunca um domínio real de terceiros.
export const DOMINIO = "exemplo.com.br";
// Registro DKIM sintético (chave RSA de 2048 bits fabricada em chave-sintetica.js).
export const REGISTRO_DKIM = `v=DKIM1; k=rsa; p=${chaveRsa(2048)}`;

/**
 * Consulta falsa: nome → registros TXT; o nome que falta não tem registro, e `FALHA` faz a
 * consulta falhar como falha a rede.
 *
 * @param {Record<string, string[] | "FALHA">} [mapa] - Registros por nome DNS.
 * @returns {Consulta} A função de consulta.
 */
export const consultaDe =
  (mapa = {}) =>
  async (nome) => {
    const resposta = mapa[nome];
    if (resposta === "FALHA") {
      return {
        ok: false,
        motivo: "A consulta ao resolvedor falhou (rede, tempo ou resposta inválida).",
      };
    }
    return {
      ok: true,
      situacao: resposta === undefined ? "sem-registro" : "encontrado",
      registros: resposta ?? [],
      resolvedor: "cloudflare",
    };
  };

/**
 * @param {string[]} registros - Textos TXT de `_dmarc.exemplo.com.br`.
 * @returns {Extract<EstadoDmarc, { fase: "pronto" }>} O estado pronto do DMARC.
 */
export const estadoDmarc = (registros) => ({
  parte: "dmarc",
  fase: "pronto",
  resultado: lerDmarc(registros),
  resolvedores: ["cloudflare"],
});

/**
 * @param {Record<string, string[] | "FALHA">} mapa - Registros por nome DNS.
 * @returns {Promise<EstadoSpf>} O estado pronto do SPF (ou `falha` se a raiz não respondeu).
 */
export const estadoSpf = async (mapa) => {
  const caminhada = await lerSpfComConsultas(DOMINIO, consultaDe(mapa));
  return caminhada.ok
    ? { parte: "spf", fase: "pronto", resultado: caminhada, resolvedores: caminhada.resolvedores }
    : { parte: "spf", fase: "falha", motivo: caminhada.motivo };
};

/**
 * @param {string[]} seletores - Seletores a tentar.
 * @param {Record<string, string[] | "FALHA">} mapa - Registros por nome DNS.
 * @returns {Promise<EstadoDkim>} O estado pronto do DKIM (ou `falha`).
 */
export const estadoDkim = async (seletores, mapa) => {
  const busca = await buscarDkim(DOMINIO, seletores, consultaDe(mapa));
  return busca.ok
    ? { parte: "dkim", fase: "pronto", resultado: busca, resolvedores: busca.resolvedores }
    : { parte: "dkim", fase: "falha", motivo: busca.motivo };
};

/**
 * @template {"dmarc" | "spf" | "dkim"} P
 * @param {P} parte - Qual parte falhou.
 * @param {string} [motivo] - Motivo em português.
 * @returns {{ parte: P, fase: "falha", motivo: string }} O estado de falha.
 */
export const falha = (
  parte,
  motivo = "A consulta ao resolvedor falhou (rede, tempo ou resposta inválida).",
) => ({
  parte,
  fase: "falha",
  motivo,
});

/**
 * @template {"dmarc" | "spf" | "dkim"} P
 * @param {P} parte - Qual parte está em andamento.
 * @returns {{ parte: P, fase: "verificando" }} O estado de espera.
 */
export const verificando = (parte) => ({ parte, fase: "verificando" });
