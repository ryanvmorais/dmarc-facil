/**
 * @file Testes da descoberta pelo buscador: `canonical`, `robots.txt` e `sitemap.xml` (RF-09 da
 * spec 007; ADR-2 e ADR-8).
 *
 * O endereço público tem uma fonte só, a rota do `wrangler.json`. `public/` é estático e não
 * pode lê-lo, então os arquivos repetem o texto e estes testes fazem a ligação.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// APOIO
// ---------------------------------------------------------------------------

/**
 * @param {string} caminho - Caminho relativo à raiz do repositório.
 * @returns {Promise<string>} O conteúdo do arquivo.
 */
const ler = (caminho) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8");

/** @returns {Promise<string>} O endereço público, com `https://` e a barra final. */
const enderecoDaRota = async () => {
  const { routes } = JSON.parse(await ler("wrangler.json"));
  return `https://${routes[0].pattern}/`;
};

// ---------------------------------------------------------------------------
// TESTES
// ---------------------------------------------------------------------------

describe("canonical", () => {
  it("o index.html aponta para o endereço da rota, sem ?dominio=", async () => {
    const html = await ler("public/index.html");
    const achados = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"/g)];
    assert.equal(achados.length, 1);
    assert.equal(achados[0]?.[1], await enderecoDaRota());
  });

  it("a 404.html não tem canonical", async () => {
    assert.doesNotMatch(await ler("public/404.html"), /rel="canonical"/);
  });
});

describe("robots.txt", () => {
  it("libera tudo e aponta para o sitemap do endereço da rota", async () => {
    const linhas = (await ler("public/robots.txt")).split("\n").map((l) => l.trim());
    assert.ok(linhas.includes("User-agent: *"));
    assert.ok(linhas.includes("Allow: /"));
    assert.ok(linhas.includes(`Sitemap: ${await enderecoDaRota()}sitemap.xml`));
  });
});

describe("sitemap.xml", () => {
  it("é um sitemap bem formado com uma URL só, a da página inicial, sem lastmod", async () => {
    const xml = await ler("public/sitemap.xml");
    assert.match(
      xml,
      /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
    );
    assert.match(xml, /<\/urlset>\s*$/);
    assert.equal(xml.match(/<url>/g)?.length, 1);
    assert.equal(xml.match(/<\/url>/g)?.length, 1);
    assert.deepEqual(
      [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]),
      [await enderecoDaRota()],
    );
    assert.doesNotMatch(xml, /lastmod/);
  });
});
