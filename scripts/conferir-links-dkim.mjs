/**
 * @file Confere os links de documentação da lista de seletores DKIM.
 *
 * Os provedores trocam de seletor e de endereço. Este script abre cada `documentacao` de
 * `public/js/seletores-dkim.js` e diz o que mudou: o link quebrou (falha), a página abriu mas
 * não cita mais o seletor (falha), o site bloqueou a leitura automática ou estava fora do ar
 * (inconclusivo: não derruba nada, porque vários sites respondem 403 a robô), ou a data
 * `conferido` do item já tem mais de um ano (aviso).
 *
 * Roda toda semana no workflow `links-dkim.yml` e à mão com `pnpm links:dkim`. Nenhum dado do
 * visitante entra aqui: a lista é a do repositório, e nada é gravado fora do resumo do run.
 */

// @ts-check

import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { ORIENTACOES, SELETORES_COMUNS } from "../public/js/seletores-dkim.js";

/** @typedef {"ok" | "falha" | "inconclusivo"} Veredito */
/** @typedef {{ veredito: Veredito, detalhe: string, texto?: string }} LeituraDaPagina */
/** @typedef {{ nome: string, url: string, veredito: Veredito, detalhe: string }} Linha */

// ---------------------------------------------------------------------------
// LIMITES
// ---------------------------------------------------------------------------

// Uma página que não responde em 20 segundos não vai responder no próximo run também.
const TEMPO_LIMITE_MS = 20_000;
// Depois de um ano sem conferir, a data deixa de dizer que o item vale.
const DIAS_PARA_REVISAR = 365;
const MS_POR_DIA = 86_400_000;
// Identifica o robô para quem lê o log do servidor.
const AGENTE = "dmarc-facil-conferir-links (+https://github.com/ryanvmorais/dmarc-facil)";

// ---------------------------------------------------------------------------
// CLASSIFICAÇÃO
// ---------------------------------------------------------------------------

/**
 * Diz o que um código HTTP significa para este script.
 *
 * Só 404 e 410 provam que o link quebrou. 401, 403 e 429 são o site barrando robô e 5xx é o
 * site fora do ar: nenhum diz que a página mudou, então ficam inconclusivos.
 *
 * @param {number} status - Código HTTP da resposta final, depois dos redirecionamentos.
 * @returns {Veredito} O veredito do código.
 */
export const classificarStatus = (status) => {
  if (status >= 200 && status < 300) {
    return "ok";
  }
  if (status === 404 || status === 410) {
    return "falha";
  }
  return "inconclusivo";
};

/**
 * Diz se a página cita o seletor como parte do nome do registro (`seletor._domainkey`).
 *
 * Aceita a barra invertida de Markdown (`seletor.\_domainkey`). Não distingue caixa, e o
 * seletor é tratado como texto, não como expressão regular.
 *
 * @param {string} texto - Corpo da página.
 * @param {string} seletor - Seletor, ex.: ``"selector1"``.
 * @returns {boolean} `true` se o nome aparece.
 */
export const paginaCitaSeletor = (texto, seletor) => {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9_-])${escapado}\\.\\\\?_domainkey`, "i").test(texto);
};

/**
 * @param {string} conferido - Data `AAAA-MM-DD` do item.
 * @param {Date} agora - O dia de hoje.
 * @returns {boolean} `true` se a data tem mais de `DIAS_PARA_REVISAR` dias.
 */
export const estaVelha = (conferido, agora) =>
  agora.getTime() - new Date(`${conferido}T00:00:00Z`).getTime() > DIAS_PARA_REVISAR * MS_POR_DIA;

// ---------------------------------------------------------------------------
// LEITURA DAS PÁGINAS
// ---------------------------------------------------------------------------

/**
 * Abre uma página e devolve o veredito do endereço e o texto, se leu.
 *
 * @param {string} url - Endereço `https` da documentação.
 * @param {typeof fetch} buscar - O `fetch`, ou um falso nos testes.
 * @returns {Promise<LeituraDaPagina>} A leitura. Erro de rede (DNS, certificado, tempo) é falha:
 *   o endereço deixou de existir ou de responder.
 */
export const lerPagina = async (url, buscar) => {
  try {
    const resposta = await buscar(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { "user-agent": AGENTE, accept: "text/html,text/markdown,*/*" },
    });
    const veredito = classificarStatus(resposta.status);
    if (veredito !== "ok") {
      return { veredito, detalhe: `HTTP ${resposta.status}` };
    }
    return { veredito, detalhe: `HTTP ${resposta.status}`, texto: await resposta.text() };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.name : "erro";
    // O tempo esgotado pode ser o site lento hoje; DNS e certificado, não.
    return motivo === "TimeoutError"
      ? { veredito: "inconclusivo", detalhe: "tempo esgotado" }
      : { veredito: "falha", detalhe: "não foi possível abrir o endereço" };
  }
};

/**
 * Confere todos os itens da lista.
 *
 * Cada endereço é aberto uma vez só, mesmo quando vários seletores o usam. Seletor comum
 * precisa ser citado na página; orientação só precisa abrir.
 *
 * @param {{ buscar?: typeof fetch, agora?: Date }} [opcoes={}] - ``buscar`` troca o `fetch`
 *   (testes); ``agora`` troca o relógio (testes).
 * @returns {Promise<{ linhas: Linha[], avisos: string[] }>} Uma linha por item e os avisos de
 *   data velha.
 */
export const conferirTudo = async ({ buscar = fetch, agora = new Date() } = {}) => {
  /** @type {Map<string, LeituraDaPagina>} */
  const paginas = new Map();
  /** @type {Linha[]} */
  const linhas = [];
  /** @type {string[]} */
  const avisos = [];

  const abrir = async (/** @type {string} */ url) => {
    const lida = paginas.get(url) ?? (await lerPagina(url, buscar));
    paginas.set(url, lida);
    return lida;
  };

  for (const item of SELETORES_COMUNS) {
    const pagina = await abrir(item.documentacao);
    if (pagina.veredito === "ok" && !paginaCitaSeletor(pagina.texto ?? "", item.seletor)) {
      linhas.push({
        nome: item.seletor,
        url: item.documentacao,
        veredito: "falha",
        detalhe: "a página abriu, mas não cita mais o seletor",
      });
    } else {
      linhas.push({
        nome: item.seletor,
        url: item.documentacao,
        veredito: pagina.veredito,
        detalhe: pagina.detalhe,
      });
    }
    if (estaVelha(item.conferido, agora)) {
      avisos.push(`${item.seletor}: conferido em ${item.conferido}, reabra a página`);
    }
  }

  for (const item of ORIENTACOES) {
    const pagina = await abrir(item.documentacao);
    linhas.push({
      nome: item.provedor,
      url: item.documentacao,
      veredito: pagina.veredito,
      detalhe: pagina.detalhe,
    });
    if (estaVelha(item.conferido, agora)) {
      avisos.push(`${item.provedor}: conferido em ${item.conferido}, reabra a página`);
    }
  }

  return { linhas, avisos };
};

// ---------------------------------------------------------------------------
// EXECUÇÃO
// ---------------------------------------------------------------------------

const SIMBOLO = { ok: "✔", falha: "✖", inconclusivo: "?" };

/**
 * Roda a conferência, imprime o resultado, escreve o resumo do run e define o código de saída:
 * 1 se algum link quebrou ou perdeu o seletor, 0 no resto.
 */
const principal = async () => {
  const { linhas, avisos } = await conferirTudo();

  for (const linha of linhas) {
    console.log(`${SIMBOLO[linha.veredito]} ${linha.nome}: ${linha.detalhe} (${linha.url})`);
    if (linha.veredito === "falha") {
      console.log(`::error title=Link DKIM::${linha.nome}: ${linha.detalhe} (${linha.url})`);
    } else if (linha.veredito === "inconclusivo") {
      console.log(`::warning title=Link DKIM::${linha.nome}: ${linha.detalhe} (${linha.url})`);
    }
  }
  for (const aviso of avisos) {
    console.log(`::warning title=Conferência velha::${aviso}`);
  }

  const resumo = process.env["GITHUB_STEP_SUMMARY"];
  if (resumo !== undefined && resumo !== "") {
    const tabela = linhas
      .map((l) => `| ${SIMBOLO[l.veredito]} | ${l.nome} | ${l.detalhe} | ${l.url} |`)
      .join("\n");
    await appendFile(
      resumo,
      `| | Item | Resultado | Endereço |\n| --- | --- | --- | --- |\n${tabela}\n`,
    );
  }

  const falhas = linhas.filter((linha) => linha.veredito === "falha").length;
  process.exitCode = falhas > 0 ? 1 : 0;
};

// Só executa quando chamado como script, não quando os testes importam as funções.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
