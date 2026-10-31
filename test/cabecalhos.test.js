/**
 * @file Testes de `public/_headers`, os cabeçalhos de segurança e de cache do site (RF-02, RF-04,
 * RNF-04 da spec 007; ADR-3 e ADR-4).
 *
 * Sem rede: lê o arquivo como texto. A CSP do cabeçalho tem de ser a da `<meta>` do `index.html`
 * mais `frame-ancestors 'none'`; o `connect-src` tem de listar exatamente os resolvedores de
 * `doh.js`; a `<meta>` da 404 nunca pode ser mais frouxa que o cabeçalho. Que a plataforma de
 * fato aplique o arquivo (inclusive na 404) é conferido depois do deploy.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { RESOLVEDORES } from "../public/js/doh.js";
import { lerCabecalhosEsperados } from "../scripts/conferir-hospedagem.mjs";

// ---------------------------------------------------------------------------
// APOIO
// ---------------------------------------------------------------------------

/**
 * @param {string} caminho - Caminho relativo a `public/`.
 * @returns {Promise<string>} O conteúdo do arquivo.
 */
const ler = (caminho) => readFile(new URL(`../public/${caminho}`, import.meta.url), "utf8");

/**
 * @param {string} html - Página HTML.
 * @returns {string} O conteúdo da `<meta http-equiv="Content-Security-Policy">`.
 */
const cspDaMeta = (html) => {
  const achado = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(achado?.[1], "a página não tem <meta> de CSP");
  return achado[1];
};

/**
 * @param {string} csp - Uma Content-Security-Policy.
 * @returns {Map<string, string[]>} Diretiva → valores.
 */
const diretivas = (csp) =>
  new Map(
    csp
      .split(";")
      .map((parte) => parte.trim().split(/\s+/))
      .filter((partes) => partes[0] !== "")
      .map(([nome, ...valores]) => [/** @type {string} */ (nome), valores]),
  );

const cabecalhosGerais = async () => lerCabecalhosEsperados(await ler("_headers"), "/*");

// ---------------------------------------------------------------------------
// CABEÇALHOS DE SEGURANÇA
// ---------------------------------------------------------------------------

describe("_headers: regra /*", () => {
  it("traz os sete cabeçalhos de segurança (RF-02)", async () => {
    const cabecalhos = await cabecalhosGerais();
    assert.deepEqual(
      [...cabecalhos.keys()].sort(),
      [
        "content-security-policy",
        "cross-origin-opener-policy",
        "cross-origin-resource-policy",
        "permissions-policy",
        "referrer-policy",
        "strict-transport-security",
        "x-content-type-options",
      ].sort(),
    );
  });

  it("usa os valores decididos para os cabeçalhos simples (ADR-3)", async () => {
    const cabecalhos = await cabecalhosGerais();
    assert.equal(cabecalhos.get("x-content-type-options"), "nosniff");
    assert.equal(cabecalhos.get("referrer-policy"), "no-referrer");
    assert.equal(cabecalhos.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(cabecalhos.get("cross-origin-resource-policy"), "same-origin");
  });

  it("desliga os recursos de hardware que a página não usa", async () => {
    const politica = (await cabecalhosGerais()).get("permissions-policy") ?? "";
    for (const recurso of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      assert.match(politica, new RegExp(`${recurso}=\\(\\)`));
    }
  });

  it("manda o HSTS por um ano, sem includeSubDomains e sem preload (ADR-3)", async () => {
    const hsts = (await cabecalhosGerais()).get("strict-transport-security");
    assert.equal(hsts, "max-age=31536000");
  });
});

// ---------------------------------------------------------------------------
// CSP
// ---------------------------------------------------------------------------

describe("_headers: Content-Security-Policy", () => {
  it("repete a <meta> do index.html e acrescenta frame-ancestors 'none' (RF-02)", async () => {
    const cabecalho = (await cabecalhosGerais()).get("content-security-policy");
    const meta = cspDaMeta(await ler("index.html"));
    assert.equal(cabecalho, `${meta}; frame-ancestors 'none'`);
  });

  it("lista no connect-src exatamente os resolvedores de doh.js", async () => {
    const cabecalho = (await cabecalhosGerais()).get("content-security-policy") ?? "";
    const hosts = RESOLVEDORES.map((r) => new URL(r.url).origin).sort();
    assert.deepEqual([...(diretivas(cabecalho).get("connect-src") ?? [])].sort(), hosts);
  });

  it("não tem unsafe-inline nem unsafe-eval, no cabeçalho nem nas <meta>", async () => {
    const politicas = [
      (await cabecalhosGerais()).get("content-security-policy") ?? "",
      cspDaMeta(await ler("index.html")),
      cspDaMeta(await ler("404.html")),
    ];
    for (const politica of politicas) {
      assert.doesNotMatch(politica, /unsafe-inline|unsafe-eval/);
    }
  });

  it("não deixa a <meta> da 404 mais frouxa que o cabeçalho", async () => {
    const cabecalho = diretivas((await cabecalhosGerais()).get("content-security-policy") ?? "");
    const meta404 = diretivas(cspDaMeta(await ler("404.html")));
    for (const [nome, valores] of meta404) {
      const permitidos = cabecalho.get(nome) ?? cabecalho.get("default-src") ?? [];
      for (const valor of valores) {
        assert.ok(permitidos.includes(valor), `${nome} ${valor} da 404 não está no cabeçalho`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// CACHE E LIMITES DA PLATAFORMA
// ---------------------------------------------------------------------------

describe("_headers: cache e limites", () => {
  it("guarda as fontes por um ano e não toca no cache de mais nada (ADR-4)", async () => {
    const texto = await ler("_headers");
    const fontes = lerCabecalhosEsperados(texto, "/fonts/*");
    assert.equal(fontes.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal((await cabecalhosGerais()).has("cache-control"), false);
    assert.equal(texto.match(/cache-control/gi)?.length, 1);
  });

  it("respeita os limites da plataforma: 100 regras e 2.000 caracteres por linha", async () => {
    const linhas = (await ler("_headers")).split("\n");
    const regras = linhas.filter((l) => l.startsWith("/")).length;
    assert.ok(regras <= 100, `${regras} regras`);
    for (const linha of linhas) {
      assert.ok(linha.length <= 2000, `linha de ${linha.length} caracteres`);
    }
  });
});
