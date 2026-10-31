/**
 * @file Testes da lógica de `scripts/conferir-hospedagem.mjs`, a conferência do que está no ar
 * (RF-06, RF-07, RNF-04 da spec 007; ADR-6 e ADR-7).
 *
 * Offline: o `fetch` é um site falso que serve os arquivos reais de `public/` com os cabeçalhos
 * do `_headers` real, e cada teste de falha estraga uma coisa só. O que importa é que cada
 * estrago derrube a verificação certa e que o site íntegro passe em todas.
 */

// @ts-check

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  compararCabecalhos,
  conferirHospedagem,
  enderecoDaRota,
  lerCabecalhosEsperados,
} from "../scripts/conferir-hospedagem.mjs";

// ---------------------------------------------------------------------------
// APOIO: UM SITE FALSO FEITO COM OS ARQUIVOS REAIS
// ---------------------------------------------------------------------------

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const PASTA = `${RAIZ}public`;
const ENDERECO = "https://dmarcfacil.ryanmorais.com.br/";

const TEXTO_HEADERS = await readFile(`${PASTA}/_headers`, "utf8");
const GERAIS = lerCabecalhosEsperados(TEXTO_HEADERS, "/*");
const FONTES = lerCabecalhosEsperados(TEXTO_HEADERS, "/fonts/*");
const FONTE = (await readdir(`${PASTA}/fonts`)).filter((f) => f.endsWith(".woff2")).sort()[0];
// O que a Cloudflare põe na frente do `robots.txt` com o "Bot Preference Sync" ligado.
const BLOCO_GERENCIADO = [
  "# As a condition of accessing this website, you agree to abide by the following",
  "# content signals:",
  "",
  "User-agent: *",
  "Content-Signal: search=yes,ai-train=no",
  "",
  "User-agent: GPTBot",
  "Disallow: /",
  "",
  "# END Cloudflare Managed Content",
  "",
].join("\n");
// O código é revalidado a cada visita, sem `max-age` (ADR-4): o padrão da plataforma para assets.
const REVALIDAR = "public, max-age=0, must-revalidate";

/** @type {Record<string, { arquivo: string, tipo: string }>} */
const ROTAS = {
  "/": { arquivo: "index.html", tipo: "text/html; charset=utf-8" },
  "/js/pagina.js": { arquivo: "js/pagina.js", tipo: "text/javascript; charset=utf-8" },
  "/css/pagina.css": { arquivo: "css/pagina.css", tipo: "text/css; charset=utf-8" },
  [`/fonts/${FONTE}`]: { arquivo: `fonts/${FONTE}`, tipo: "font/woff2" },
  "/robots.txt": { arquivo: "robots.txt", tipo: "text/plain; charset=utf-8" },
  "/sitemap.xml": { arquivo: "sitemap.xml", tipo: "application/xml" },
};

/**
 * @param {string} caminho - Caminho relativo a `public/`.
 * @returns {Promise<Uint8Array<ArrayBuffer>>} Os bytes do arquivo.
 */
const arquivo = async (caminho) => new Uint8Array(await readFile(`${PASTA}/${caminho}`));

/**
 * @param {Uint8Array<ArrayBuffer> | string} corpo - Corpo da resposta.
 * @param {number} status - Status HTTP.
 * @param {Record<string, string>} cabecalhos - Cabeçalhos da resposta.
 * @returns {Response} A resposta.
 */
const resposta = (corpo, status, cabecalhos) =>
  new Response(corpo, { status, headers: { ...Object.fromEntries(GERAIS), ...cabecalhos } });

/** @typedef {(url: URL) => Promise<Response | Error | undefined>} Estrago */

/**
 * O site íntegro, com um estrago opcional.
 *
 * @param {Estrago} [estragar] - Recebe a URL pedida; devolve a resposta que a substitui, um
 *   erro a lançar (conexão recusada) ou `undefined` para deixar o site íntegro responder.
 * @returns {typeof fetch} O `fetch` falso.
 */
const criarBuscar = (estragar = async () => undefined) =>
  /** @type {typeof fetch} */ (
    async (/** @type {string | URL | Request} */ entrada) => {
      const url = new URL(String(entrada));
      const estrago = await estragar(url);
      if (estrago instanceof Error) {
        throw estrago;
      }
      if (estrago !== undefined) {
        return estrago;
      }
      if (url.protocol === "http:") {
        return new Response(null, { status: 301, headers: { location: `https://${url.host}/` } });
      }
      const rota = ROTAS[url.pathname];
      if (rota === undefined) {
        // Inclui `/_headers`: a plataforma consome o arquivo e responde 404 como em qualquer
        // caminho que não existe.
        return resposta(await arquivo("404.html"), 404, { "content-type": "text/html" });
      }
      const fonte = url.pathname.startsWith("/fonts/");
      return resposta(await arquivo(rota.arquivo), 200, {
        "content-type": rota.tipo,
        "cache-control": fonte ? (FONTES.get("cache-control") ?? "") : REVALIDAR,
      });
    }
  );

/**
 * @param {Estrago} [estragar] - Ver {@link criarBuscar}.
 * @returns {Promise<import("../scripts/conferir-hospedagem.mjs").ResultadoConferencia>} O
 *   resultado da conferência.
 */
const conferir = (estragar) =>
  conferirHospedagem({ endereco: ENDERECO, pasta: PASTA, buscar: criarBuscar(estragar) });

/**
 * @param {import("../scripts/conferir-hospedagem.mjs").ResultadoConferencia} resultado - O
 *   resultado.
 * @returns {string[]} Os nomes das verificações que falharam.
 */
const falhas = (resultado) => resultado.verificacoes.filter((v) => !v.ok).map((v) => v.nome);

// ---------------------------------------------------------------------------
// FUNÇÕES PURAS
// ---------------------------------------------------------------------------

describe("lerCabecalhosEsperados", () => {
  const texto = [
    "# comentário",
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: no-referrer",
    "",
    "/fonts/*",
    "  Cache-Control: public, max-age=31536000, immutable",
  ].join("\n");

  it("lê só os cabeçalhos da regra pedida, com o nome em minúsculas", () => {
    assert.deepEqual(
      [...lerCabecalhosEsperados(texto, "/*")],
      [
        ["x-content-type-options", "nosniff"],
        ["referrer-policy", "no-referrer"],
      ],
    );
    assert.deepEqual(
      [...lerCabecalhosEsperados(texto, "/fonts/*")],
      [["cache-control", "public, max-age=31536000, immutable"]],
    );
  });

  it("junta com vírgula o cabeçalho repetido na mesma regra", () => {
    const repetido = "/*\n  Vary: accept\n  vary: origin\n";
    assert.equal(lerCabecalhosEsperados(repetido, "/*").get("vary"), "accept, origin");
  });

  it("devolve vazio para uma regra que não existe e aceita o fim de linha do Windows", () => {
    assert.equal(lerCabecalhosEsperados(texto, "/nada/*").size, 0);
    assert.equal(
      lerCabecalhosEsperados("/*\r\n  Referrer-Policy: no-referrer\r\n", "/*").get(
        "referrer-policy",
      ),
      "no-referrer",
    );
  });
});

describe("compararCabecalhos", () => {
  const esperados = new Map([
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "no-referrer"],
  ]);

  it("não aponta nada quando tudo bate, mesmo com cabeçalho a mais e caixa diferente", () => {
    const recebidos = new Headers({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      Server: "cloudflare",
    });
    assert.deepEqual(compararCabecalhos(esperados, recebidos), []);
  });

  it("aponta o cabeçalho que faltou", () => {
    const problemas = compararCabecalhos(
      esperados,
      new Headers({ "referrer-policy": "no-referrer" }),
    );
    assert.deepEqual(problemas, ["falta o cabeçalho x-content-type-options"]);
  });

  it("aponta o valor diferente, com o esperado e o recebido", () => {
    const recebidos = new Headers({
      "x-content-type-options": "nosniff",
      "referrer-policy": "origin",
    });
    assert.deepEqual(compararCabecalhos(esperados, recebidos), [
      'referrer-policy: esperado "no-referrer", recebido "origin"',
    ]);
  });

  it("aponta o valor repetido pela plataforma", () => {
    const recebidos = new Headers();
    recebidos.append("x-content-type-options", "nosniff");
    recebidos.append("x-content-type-options", "nosniff");
    recebidos.append("referrer-policy", "no-referrer");
    assert.deepEqual(compararCabecalhos(esperados, recebidos), [
      'x-content-type-options: esperado "nosniff", recebido "nosniff, nosniff"',
    ]);
  });
});

describe("enderecoDaRota", () => {
  it("monta o endereço público a partir da rota do wrangler.json", async () => {
    assert.equal(await enderecoDaRota(RAIZ), ENDERECO);
  });
});

// ---------------------------------------------------------------------------
// CONFERÊNCIA DO SITE
// ---------------------------------------------------------------------------

describe("conferirHospedagem: site íntegro", () => {
  it("passa nas sete verificações", async () => {
    const resultado = await conferir();
    assert.deepEqual(falhas(resultado), []);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.verificacoes.length, 7);
  });

  it("aceita o http:// recusado, como a conexão que não abre", async () => {
    const resultado = await conferir(async (url) =>
      url.protocol === "http:" ? new Error("ECONNREFUSED") : undefined,
    );
    assert.deepEqual(falhas(resultado), []);
  });

  it("pede o endereço da rota e mais nada fora dele", async () => {
    /** @type {string[]} */
    const pedidos = [];
    await conferir(async (url) => {
      pedidos.push(url.href);
      return undefined;
    });
    assert.ok(pedidos.length >= 8);
    for (const pedido of pedidos) {
      assert.equal(new URL(pedido).hostname, "dmarcfacil.ryanmorais.com.br", pedido);
    }
  });
});

describe("conferirHospedagem: o que derruba cada verificação", () => {
  it("HTML com script injetado (RF-06)", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname === "/" && url.protocol === "https:"
        ? resposta(
            `${await arquivo("index.html")}<script src="https://beacon.exemplo/a.js"></script>`,
            200,
            { "content-type": "text/html" },
          )
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["Página inicial"]);
    assert.match(resultado.verificacoes[0]?.detalhe ?? "", /corpo difere/);
  });

  it("JavaScript reescrito pela hospedagem (RF-06)", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname === "/js/pagina.js"
        ? resposta("export {};", 200, {
            "content-type": "text/javascript",
            "cache-control": REVALIDAR,
          })
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["JavaScript e CSS"]);
  });

  it("404 com status 200 (RF-03)", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname.startsWith("/conferencia-")
        ? resposta(await arquivo("404.html"), 200, { "content-type": "text/html" })
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["Página 404"]);
    assert.match(resultado.verificacoes[1]?.detalhe ?? "", /status 200, esperado 404/);
  });

  it("cabeçalho de segurança ausente na 404 (RF-02)", async () => {
    const resultado = await conferir(async (url) => {
      if (!url.pathname.startsWith("/conferencia-")) {
        return undefined;
      }
      const sem = new Response(await arquivo("404.html"), { status: 404 });
      return sem;
    });
    assert.deepEqual(falhas(resultado), ["Página 404"]);
    assert.match(
      resultado.verificacoes[1]?.detalhe ?? "",
      /falta o cabeçalho content-security-policy/,
    );
  });

  it("http:// servido em 200 (RF-01)", async () => {
    const resultado = await conferir(async (url) =>
      url.protocol === "http:"
        ? resposta(await arquivo("index.html"), 200, { "content-type": "text/html" })
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["http:// não é servido"]);
  });

  it("http:// redirecionado para outro http:// (RF-01)", async () => {
    const resultado = await conferir(async (url) =>
      url.protocol === "http:"
        ? new Response(null, { status: 301, headers: { location: "http://outro.exemplo/" } })
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["http:// não é servido"]);
  });

  it("/_headers público (ADR-3)", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname === "/_headers" ? resposta(TEXTO_HEADERS, 200, {}) : undefined,
    );
    assert.deepEqual(falhas(resultado), ["_headers não é público"]);
  });

  it("Cache-Control das fontes diferente do _headers (ADR-4)", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname.startsWith("/fonts/")
        ? resposta(await arquivo(`fonts/${FONTE}`), 200, {
            "content-type": "font/woff2",
            "cache-control": `${REVALIDAR}, ${FONTES.get("cache-control")}`,
          })
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["Fonte"]);
    assert.match(resultado.verificacoes[3]?.detalhe ?? "", /cache-control: esperado/);
  });

  it("código JavaScript guardado sem revalidar (ADR-4)", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname === "/js/pagina.js"
        ? resposta(await arquivo("js/pagina.js"), 200, {
            "content-type": "text/javascript",
            "cache-control": "public, max-age=31536000, immutable",
          })
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["JavaScript e CSS"]);
    assert.match(resultado.verificacoes[2]?.detalhe ?? "", /não obriga a revalidar/);
  });

  it("JavaScript com content-type de texto comum", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname === "/js/pagina.js"
        ? resposta(await arquivo("js/pagina.js"), 200, {
            "content-type": "text/plain",
            "cache-control": REVALIDAR,
          })
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["JavaScript e CSS"]);
  });

  it("robots.txt alterado (RF-09)", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname === "/robots.txt"
        ? resposta("User-agent: *\nDisallow: /\n", 200, { "content-type": "text/plain" })
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["robots.txt e sitemap.xml"]);
    assert.match(resultado.verificacoes[4]?.detalhe ?? "", /^robots\.txt: /);
  });

  it("robots.txt com o bloco gerenciado da Cloudflare na frente passa (Bot Preference Sync)", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname === "/robots.txt"
        ? resposta(
            `${BLOCO_GERENCIADO}
${await arquivo("robots.txt").then((b) => new TextDecoder().decode(b))}`,
            200,
            {
              "content-type": "text/plain",
            },
          )
        : undefined,
    );
    assert.deepEqual(falhas(resultado), []);
  });

  it("robots.txt com o bloco gerenciado, mas com o resto alterado, falha", async () => {
    const resultado = await conferir(async (url) =>
      url.pathname === "/robots.txt"
        ? resposta(
            `${BLOCO_GERENCIADO}
User-agent: *
Disallow: /
`,
            200,
            {
              "content-type": "text/plain",
            },
          )
        : undefined,
    );
    assert.deepEqual(falhas(resultado), ["robots.txt e sitemap.xml"]);
  });

  it("nenhuma conexão abre: o http:// também falha, porque a recusa não prova nada", async () => {
    const resultado = await conferir(async () => new Error("getaddrinfo ENOTFOUND"));
    assert.deepEqual(falhas(resultado), [
      "Página inicial",
      "Página 404",
      "JavaScript e CSS",
      "Fonte",
      "robots.txt e sitemap.xml",
      "_headers não é público",
      "http:// não é servido",
    ]);
  });

  it("endereço que não abre falha em vez de passar (conexão, certificado, tempo)", async () => {
    const resultado = await conferir(async (url) =>
      url.protocol === "https:" ? new Error("certificado inválido") : undefined,
    );
    assert.equal(resultado.ok, false);
    assert.deepEqual(falhas(resultado), [
      "Página inicial",
      "Página 404",
      "JavaScript e CSS",
      "Fonte",
      "robots.txt e sitemap.xml",
      "_headers não é público",
    ]);
  });
});
