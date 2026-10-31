/**
 * @file Testes do `wrangler.json`, a configuração do projeto de hospedagem (RF-01, RF-03,
 * RNF-03 e RNF-04 da spec 007; ADR-1).
 *
 * Sem rede e sem o `wrangler`: lê o arquivo como JSON e confere cada chave que decide o que vai
 * ao ar. O que a plataforma de fato serve é conferido depois do deploy, por
 * `scripts/conferir-hospedagem.mjs`.
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
 * @returns {Promise<any>} O JSON do arquivo.
 */
const lerJson = async (caminho) =>
  JSON.parse(await readFile(new URL(`../${caminho}`, import.meta.url), "utf8"));

// ---------------------------------------------------------------------------
// wrangler.json
// ---------------------------------------------------------------------------

describe("wrangler.json", () => {
  it("é um Worker só de assets: sem `main`, sem código de servidor", async () => {
    const config = await lerJson("wrangler.json");
    assert.equal(config.name, "dmarc-facil");
    assert.equal("main" in config, false);
  });

  it("envia só a pasta public/ (RF-01)", async () => {
    const { assets } = await lerJson("wrangler.json");
    assert.equal(assets.directory, "./public");
  });

  it("serve a 404.html com status 404 e sem fallback de SPA (RF-03)", async () => {
    const { assets } = await lerJson("wrangler.json");
    assert.equal(assets.not_found_handling, "404-page");
    assert.equal(assets.html_handling, "auto-trailing-slash");
  });

  it("desliga o endereço workers.dev e as pré-visualizações públicas (RF-01)", async () => {
    const config = await lerJson("wrangler.json");
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
  });

  it("liga o site a um domínio personalizado, o único endereço (ADR-2)", async () => {
    const { routes } = await lerJson("wrangler.json");
    assert.deepEqual(routes, [{ pattern: "dmarcfacil.ryanmorais.com.br", custom_domain: true }]);
  });

  it("deixa a observabilidade desligada (RNF-01)", async () => {
    const { observability } = await lerJson("wrangler.json");
    assert.deepEqual(observability, { enabled: false });
  });

  it("tem uma data de compatibilidade no formato da plataforma", async () => {
    const { compatibility_date: data } = await lerJson("wrangler.json");
    assert.match(data, /^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

describe("package.json", () => {
  it("não traz o wrangler como dependência: a árvore dele derrubaria o pnpm audit (ADR-5)", async () => {
    const pacote = await lerJson("package.json");
    for (const grupo of ["dependencies", "devDependencies", "optionalDependencies"]) {
      assert.equal(pacote[grupo]?.["wrangler"], undefined, `wrangler em ${grupo}`);
    }
  });
});
