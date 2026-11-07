/**
 * @file Teste da regra "módulo puro não carrega frase" (RF-03 e ADR-3 da spec 008).
 *
 * Os módulos de `public/js/` não importam o catálogo de nenhum idioma: quem escolhe o idioma é a
 * entrada de cada idioma (`entrada-<idioma>.js`), que passa o catálogo adiante como parâmetro. Se um
 * módulo importasse `textos/pt/...`, a página em inglês mostraria português sem que nenhum teste
 * de tipo ou de paridade percebesse.
 */

// @ts-check

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const PASTA = new URL("../public/js/", import.meta.url);

// O que um módulo pode importar da pasta de textos: o resolvedor (código que escolhe a frase) e
// os tipos. Nenhum arquivo de `textos/<idioma>/`.
const IMPORT_DE_CATALOGO = /from "(?:\.\.?\/)+textos\/(?:pt|en)\//;

/** @returns {Promise<string[]>} Os módulos de `public/js/` que não são entrada de idioma. */
const modulos = async () =>
  (await readdir(PASTA)).filter((nome) => nome.endsWith(".js") && !nome.startsWith("entrada-"));

describe("módulos sem frase", () => {
  it("a varredura acha os módulos de apresentação", async () => {
    const nomes = await modulos();

    for (const esperado of ["apresentacao.js", "selo.js", "escada.js", "pagina.js"]) {
      assert.ok(nomes.includes(esperado), `faltou ${esperado}`);
    }
  });

  it("nenhum módulo importa o catálogo de um idioma", async () => {
    /** @type {string[]} */
    const culpados = [];
    for (const nome of await modulos()) {
      if (IMPORT_DE_CATALOGO.test(await readFile(new URL(nome, PASTA), "utf8"))) {
        culpados.push(nome);
      }
    }

    assert.deepEqual(culpados, []);
  });

  it("só a entrada de cada idioma importa o catálogo dele", async () => {
    const entradas = (await readdir(PASTA)).filter((nome) => nome.startsWith("entrada-"));

    assert.ok(entradas.length > 0);
    for (const entrada of entradas) {
      const idioma = /^entrada-(\w+)\.js$/.exec(entrada)?.[1];
      assert.match(
        await readFile(new URL(entrada, PASTA), "utf8"),
        new RegExp(`from "\\./textos/${idioma}/index\\.js"`),
        entrada,
      );
    }
  });

  it("os catálogos são dado puro: só importam o próprio idioma e os tipos", async () => {
    for (const idioma of ["pt"]) {
      const pasta = new URL(`textos/${idioma}/`, PASTA);
      for (const nome of (await readdir(pasta)).filter((arquivo) => arquivo.endsWith(".js"))) {
        const fonte = await readFile(new URL(nome, pasta), "utf8");
        const imports = [...fonte.matchAll(/^import .* from "([^"]+)";/gm)].map((m) => m[1]);

        for (const origem of imports) {
          assert.match(origem ?? "", /^\.\/[a-z]+\.js$/, `${idioma}/${nome} importa ${origem}`);
        }
      }
    }
  });
});
