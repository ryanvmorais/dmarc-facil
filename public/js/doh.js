/**
 * @file Consulta de registros TXT por DNS-over-HTTPS, com fallback entre resolvedores.
 *
 * O navegador não fala DNS direto, então a página pergunta a um resolvedor público por
 * `fetch`, sem servidor nosso no meio. Tenta a Cloudflare e, se ela não conseguir responder,
 * o Google. O resolvedor que respondeu faz parte do resultado: a página diz ao visitante
 * quem viu o domínio e o IP dele.
 *
 * Este é o módulo fino da rede. A validação do nome (`nome-dns.js`) e a leitura da resposta
 * (`resposta-doh.js`) são puras. O resultado é sempre um valor, nunca uma exceção: rede fora
 * do ar, resposta torta e domínio inexistente são casos comuns da página.
 *
 * Privacidade: a consulta vai sem cookie e sem `Referer`, e o módulo não registra o nome
 * consultado em console, armazenamento nem em lugar algum.
 */

// @ts-check

import { validarNomeDns } from "./nome-dns.js";
import { lerResposta } from "./resposta-doh.js";

/** @typedef {import("./resposta-doh.js").Resolvedor} Resolvedor */
/** @typedef {import("./resposta-doh.js").Situacao} Situacao */
/**
 * @typedef {{ ok: true, situacao: Situacao, registros: string[], resolvedor: Resolvedor } | { ok: false, motivo: string }} ResultadoTxt
 */
/**
 * @typedef {{ buscar?: typeof fetch, tempoLimiteMs?: number }} OpcoesConsulta
 */

// ---------------------------------------------------------------------------
// RESOLVEDORES
// ---------------------------------------------------------------------------

// A ordem é a do fallback: Cloudflare primeiro, Google se ela falhar. Consultar os dois em
// paralelo dobraria quem vê cada domínio, contra a promessa de privacidade da página.
/** @type {ReadonlyArray<{ id: Resolvedor, url: string }>} */
const RESOLVEDORES = [
  { id: "cloudflare", url: "https://cloudflare-dns.com/dns-query" },
  { id: "google", url: "https://dns.google/resolve" },
];

// Cada resolvedor responde em 30 a 120 ms nas medições; 5 s corta o que travou e ainda deixa
// o fallback ter a sua vez. Vale por resolvedor, então o pior caso é o dobro.
const TEMPO_LIMITE_PADRAO_MS = 5000;

// Mesmo texto para qualquer falha: o visitante não precisa distinguir tempo esgotado de
// resposta torta. [provisório]
const MOTIVO_FALHA_GERAL =
  "Não consegui consultar o DNS agora, nem pela Cloudflare nem pelo Google. Confira sua conexão e tente de novo.";

// ---------------------------------------------------------------------------
// CONSULTA
// ---------------------------------------------------------------------------

/**
 * Pergunta o TXT de um nome a um resolvedor só.
 *
 * Qualquer exceção (rede, tempo esgotado, JSON inválido) vira falha: quem chama decide o
 * fallback. O tempo limite cobre a requisição e a leitura do corpo.
 *
 * @param {{ id: Resolvedor, url: string }} resolvedor - Resolvedor a consultar.
 * @param {string} nome - Nome DNS já validado.
 * @param {typeof fetch} buscar - Função de rede (o `fetch`, ou um falso nos testes).
 * @param {number} tempoLimiteMs - Tempo máximo desta consulta, em milissegundos.
 * @returns {Promise<import("./resposta-doh.js").RespostaLida>} A leitura da resposta.
 */
const consultarUm = async (resolvedor, nome, buscar, tempoLimiteMs) => {
  // O nome entra como parâmetro codificado da URL, nunca por concatenação de texto.
  const url = new URL(resolvedor.url);
  url.searchParams.set("name", nome);
  url.searchParams.set("type", "TXT");

  try {
    const resposta = await buscar(url.href, {
      method: "GET",
      headers: { accept: "application/dns-json" },
      // Sem cookie, sem Referer e sem seguir redirecionamento para um terceiro.
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      signal: AbortSignal.timeout(tempoLimiteMs),
    });
    if (!resposta.ok) {
      return { ok: false, motivo: `O resolvedor respondeu HTTP ${resposta.status}.` };
    }
    return lerResposta(await resposta.json(), resolvedor.id);
  } catch {
    return {
      ok: false,
      motivo: "A consulta ao resolvedor falhou (rede, tempo ou resposta inválida).",
    };
  }
};

/**
 * Busca os registros TXT de um nome, com fallback da Cloudflare para o Google.
 *
 * O fallback só dispara quando o resolvedor não consegue responder (rede, tempo esgotado,
 * HTTP fora de 2xx, corpo inválido ou `Status` de falha). Domínio inexistente e nome sem
 * registro são respostas definitivas e não consultam o segundo resolvedor.
 *
 * @param {string} nome - Nome DNS montado pela ferramenta, ex.: ``"_dmarc.exemplo.com.br"``.
 * @param {OpcoesConsulta} [opcoes={}] - ``buscar`` troca o `fetch` (testes); ``tempoLimiteMs``
 *   troca o tempo por resolvedor.
 * @returns {Promise<ResultadoTxt>} ``{ ok: true, situacao, registros, resolvedor }``, ou
 *   ``{ ok: false, motivo }`` com a explicação em português para mostrar ao visitante.
 * @throws {TypeError} Se ``nome`` não for texto (erro de programação, não de consulta).
 */
export const consultarTxt = async (
  nome,
  { buscar, tempoLimiteMs = TEMPO_LIMITE_PADRAO_MS } = {},
) => {
  if (typeof nome !== "string") {
    throw new TypeError("consultarTxt espera o nome como texto.");
  }

  // 1. Valida o nome antes de qualquer rede.
  const validado = validarNomeDns(nome);
  if (!validado.ok) {
    return { ok: false, motivo: validado.motivo };
  }

  // O `fetch` global é chamado na hora, para não perder o `this` e para o teste poder trocá-lo.
  const rede = buscar ?? ((...argumentos) => fetch(...argumentos));

  // 2. Tenta cada resolvedor na ordem; a primeira leitura bem-sucedida encerra.
  for (const resolvedor of RESOLVEDORES) {
    const leitura = await consultarUm(resolvedor, validado.nome, rede, tempoLimiteMs);
    if (leitura.ok) {
      return { ...leitura, resolvedor: resolvedor.id };
    }
  }

  // 3. Todos falharam.
  return { ok: false, motivo: MOTIVO_FALHA_GERAL };
};
