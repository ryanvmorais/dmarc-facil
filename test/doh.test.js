/**
 * @file Testes de `consultarTxt`, a consulta DoH com fallback entre resolvedores.
 *
 * Nenhum teste usa a rede: o `fetch` é trocado por um falso que registra cada chamada e
 * responde com JSON montado aqui, com registros sintéticos. Famílias de caso: o caminho feliz
 * e as situações do DNS; cada gatilho do fallback; o que NÃO dispara fallback; a defesa contra
 * nome malformado; e as opções de privacidade da requisição.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { consultarTxt } from "../public/js/doh.js";

// ---------------------------------------------------------------------------
// FETCH FALSO
// ---------------------------------------------------------------------------

/**
 * Monta uma resposta HTTP com corpo JSON.
 *
 * @param {unknown} corpo - Objeto devolvido pelo resolvedor.
 * @param {number} [status=200] - Código HTTP.
 * @returns {Response} Resposta pronta para o `fetch` falso.
 */
const respostaJson = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/dns-json" },
  });

/**
 * Resposta DNS com um TXT, no formato da Cloudflare (com aspas).
 *
 * @param {string} texto - Conteúdo do TXT, sem aspas.
 * @returns {{ Status: number, Answer: unknown[] }} Corpo da resposta.
 */
const comTxt = (texto) => ({
  Status: 0,
  Answer: [{ name: "_dmarc.exemplo.com.br", type: 16, TTL: 300, data: `"${texto}"` }],
});

/**
 * @typedef {{ url: string, opcoes: RequestInit }} Chamada
 */

/**
 * Cria um `fetch` falso que escolhe a resposta pelo host da URL e registra as chamadas.
 *
 * @param {{ cloudflare: (opcoes: RequestInit) => Promise<Response> | Response, google?: (opcoes: RequestInit) => Promise<Response> | Response }} respostas - Comportamento de cada resolvedor.
 * @returns {{ buscar: typeof fetch, chamadas: Chamada[] }} A função falsa e o registro.
 */
const criarBuscar = (respostas) => {
  /** @type {Chamada[]} */
  const chamadas = [];
  /** @type {typeof fetch} */
  const buscar = async (entrada, opcoes = {}) => {
    const url = String(entrada);
    chamadas.push({ url, opcoes });
    if (url.startsWith("https://cloudflare-dns.com/")) {
      return respostas.cloudflare(opcoes);
    }
    if (url.startsWith("https://dns.google/") && respostas.google) {
      return respostas.google(opcoes);
    }
    throw new Error(`chamada inesperada: ${url}`);
  };
  return { buscar, chamadas };
};

/** Falha de rede do navegador. */
const semRede = () => {
  throw new TypeError("Failed to fetch");
};

/**
 * Resposta que só termina quando o tempo limite aborta a requisição.
 *
 * @param {RequestInit} opcoes - Opções recebidas pelo `fetch` falso.
 * @returns {Promise<Response>} Promessa que rejeita quando o sinal aborta.
 */
const travado = (opcoes) =>
  new Promise((_resolver, rejeitar) => {
    opcoes.signal?.addEventListener("abort", () => rejeitar(opcoes.signal?.reason));
  });

// ---------------------------------------------------------------------------
// CAMINHO FELIZ
// ---------------------------------------------------------------------------

describe("consultarTxt: caminho feliz", () => {
  it("encontra o TXT na Cloudflare sem consultar o Google", async () => {
    const { buscar, chamadas } = criarBuscar({
      cloudflare: () => respostaJson(comTxt("v=DMARC1; p=none")),
    });

    const resultado = await consultarTxt("_dmarc.exemplo.com.br", { buscar });

    assert.deepEqual(resultado, {
      ok: true,
      situacao: "encontrado",
      registros: ["v=DMARC1; p=none"],
      resolvedor: "cloudflare",
    });
    assert.equal(chamadas.length, 1);
  });

  it("monta a URL com só dois parâmetros, name e type", async () => {
    const { buscar, chamadas } = criarBuscar({ cloudflare: () => respostaJson({ Status: 0 }) });

    await consultarTxt("_DMARC.Exemplo.com.br.", { buscar });

    const url = new URL(chamadas[0]?.url ?? "");
    assert.equal(url.origin + url.pathname, "https://cloudflare-dns.com/dns-query");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["name", "type"]);
    assert.equal(url.searchParams.get("name"), "_dmarc.exemplo.com.br");
    assert.equal(url.searchParams.get("type"), "TXT");
  });

  it("devolve sem-registro quando o nome existe e não tem TXT", async () => {
    const { buscar } = criarBuscar({ cloudflare: () => respostaJson({ Status: 0 }) });

    const resultado = await consultarTxt("_dmarc.exemplo.com.br", { buscar });

    assert.deepEqual(resultado, {
      ok: true,
      situacao: "sem-registro",
      registros: [],
      resolvedor: "cloudflare",
    });
  });
});

// ---------------------------------------------------------------------------
// FALLBACK
// ---------------------------------------------------------------------------

describe("consultarTxt: fallback para o Google", () => {
  /** @type {Array<[string, (opcoes: RequestInit) => Promise<Response> | Response]>} Gatilho e o comportamento da Cloudflare. */
  const gatilhos = [
    ["falha de rede (TypeError)", semRede],
    ["HTTP 500", () => respostaJson({}, 500)],
    ["HTTP 429", () => respostaJson({}, 429)],
    ["corpo que não é JSON", () => new Response("<html>não é json</html>")],
    ["corpo JSON que não é objeto", () => respostaJson([1, 2, 3])],
    ["Status 2 (SERVFAIL)", () => respostaJson({ Status: 2 })],
    ["Status 5 (REFUSED)", () => respostaJson({ Status: 5 })],
  ];

  for (const [gatilho, cloudflare] of gatilhos) {
    it(`cai para o Google por ${gatilho}`, async () => {
      const { buscar, chamadas } = criarBuscar({
        cloudflare,
        google: () =>
          respostaJson({ Status: 0, Answer: [{ type: 16, data: "v=DMARC1; p=reject" }] }),
      });

      const resultado = await consultarTxt("_dmarc.exemplo.com.br", { buscar });

      assert.deepEqual(resultado, {
        ok: true,
        situacao: "encontrado",
        registros: ["v=DMARC1; p=reject"],
        resolvedor: "google",
      });
      assert.equal(chamadas.length, 2);
      assert.ok(chamadas[1]?.url.startsWith("https://dns.google/resolve?"));
    });
  }

  it("cai para o Google quando o tempo esgota", async () => {
    const { buscar } = criarBuscar({
      cloudflare: travado,
      google: () => respostaJson({ Status: 0, Answer: [{ type: 16, data: "v=spf1 -all" }] }),
    });

    const resultado = await consultarTxt("exemplo.com.br", { buscar, tempoLimiteMs: 10 });

    assert.deepEqual(resultado, {
      ok: true,
      situacao: "encontrado",
      registros: ["v=spf1 -all"],
      resolvedor: "google",
    });
  });

  it("devolve falha com motivo em português quando os dois falham", async () => {
    const { buscar, chamadas } = criarBuscar({
      cloudflare: semRede,
      google: () => respostaJson({}, 503),
    });

    const resultado = await consultarTxt("_dmarc.exemplo.com.br", { buscar });

    assert.equal(resultado.ok, false);
    if (!resultado.ok) {
      assert.match(resultado.motivo, /Não consegui consultar o DNS/);
    }
    assert.equal(chamadas.length, 2);
  });

  it("devolve falha quando os dois travam até o tempo esgotar", async () => {
    const { buscar } = criarBuscar({ cloudflare: travado, google: travado });

    const resultado = await consultarTxt("_dmarc.exemplo.com.br", { buscar, tempoLimiteMs: 10 });

    assert.equal(resultado.ok, false);
  });
});

// ---------------------------------------------------------------------------
// SEM FALLBACK
// ---------------------------------------------------------------------------

describe("consultarTxt: respostas definitivas não fazem fallback", () => {
  it("NXDOMAIN (Status 3) é inexistente e não consulta o Google", async () => {
    const { buscar, chamadas } = criarBuscar({ cloudflare: () => respostaJson({ Status: 3 }) });

    const resultado = await consultarTxt("_dmarc.exemplo.com.br", { buscar });

    assert.deepEqual(resultado, {
      ok: true,
      situacao: "inexistente",
      registros: [],
      resolvedor: "cloudflare",
    });
    assert.equal(chamadas.length, 1);
  });

  it("sem-registro não consulta o Google", async () => {
    const { buscar, chamadas } = criarBuscar({
      cloudflare: () => respostaJson({ Status: 0, Answer: [] }),
    });

    await consultarTxt("_dmarc.exemplo.com.br", { buscar });

    assert.equal(chamadas.length, 1);
  });
});

// ---------------------------------------------------------------------------
// NOME MALFORMADO
// ---------------------------------------------------------------------------

describe("consultarTxt: nome malformado", () => {
  /** @type {string[]} */
  const nomes = [
    "",
    "exemplo .com.br",
    "exemplo.com&name=outro.com",
    "exemplo.com?x=1",
    "exemplo.com#topo",
    "exemplo.com/pagina",
    "exemplo%2ecom",
    "a..b",
    `${"a".repeat(64)}.com`,
  ];

  for (const nome of nomes) {
    it(`recusa "${nome.slice(0, 30)}" sem chamar o fetch`, async () => {
      const { buscar, chamadas } = criarBuscar({ cloudflare: () => respostaJson({ Status: 0 }) });

      const resultado = await consultarTxt(nome, { buscar });

      assert.equal(resultado.ok, false);
      assert.equal(chamadas.length, 0);
    });
  }

  it("lança TypeError se o nome nem é texto (erro de programação)", async () => {
    await assert.rejects(() => consultarTxt(/** @type {any} */ (42)), TypeError);
  });
});

// ---------------------------------------------------------------------------
// PRIVACIDADE
// ---------------------------------------------------------------------------

describe("consultarTxt: privacidade", () => {
  it("manda a requisição sem cookie, sem Referer e sem seguir redirecionamento", async () => {
    const { buscar, chamadas } = criarBuscar({ cloudflare: () => respostaJson({ Status: 0 }) });

    await consultarTxt("_dmarc.exemplo.com.br", { buscar });

    const opcoes = chamadas[0]?.opcoes;
    assert.equal(opcoes?.method, "GET");
    assert.equal(opcoes?.credentials, "omit");
    assert.equal(opcoes?.referrerPolicy, "no-referrer");
    assert.equal(opcoes?.redirect, "error");
    assert.deepEqual(opcoes?.headers, { accept: "application/dns-json" });
    assert.ok(opcoes?.signal instanceof AbortSignal);
  });

  it("não escreve o nome consultado no console", async () => {
    const espioes = /** @type {Array<"log" | "info" | "warn" | "error" | "debug">} */ ([
      "log",
      "info",
      "warn",
      "error",
      "debug",
    ]).map((metodo) => mock.method(console, metodo, () => {}));
    const { buscar } = criarBuscar({
      cloudflare: semRede,
      google: () => respostaJson({ Status: 0 }),
    });

    try {
      await consultarTxt("_dmarc.exemplo.com.br", { buscar });
      for (const espiao of espioes) {
        assert.equal(espiao.mock.callCount(), 0);
      }
    } finally {
      mock.restoreAll();
    }
  });
});
