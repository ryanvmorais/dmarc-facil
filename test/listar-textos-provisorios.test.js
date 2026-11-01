/**
 * @file Testes de `scripts/listar-textos-provisorios.mjs`, que lista o que o Ryan ainda precisa
 * revisar antes da `1.0.0`.
 *
 * O script roda sobre um catálogo e um HTML sintéticos, montados numa pasta temporária: só os
 * textos marcados entram na lista, e os já revisados ficam de fora.
 */

// @ts-check

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import {
  coletarProvisorios,
  coletarProvisoriosDoHtml,
  listarProvisorios,
} from "../scripts/listar-textos-provisorios.mjs";

// ---------------------------------------------------------------------------
// COLETA EM DADOS
// ---------------------------------------------------------------------------

describe("coletarProvisorios", () => {
  it("pega só o que está marcado, no texto fixo e na entrada de achado", () => {
    const catalogo = {
      final: { texto: "Já revisado", provisorio: false },
      aberto: { texto: "Falta revisar", provisorio: true },
      grupo: {
        achado: { titulo: "Título provisório", explicacao: "x", acao: "y", provisorio: true },
        outro: { titulo: "Título final", explicacao: "x", acao: "y", provisorio: false },
      },
    };

    assert.deepEqual(coletarProvisorios(catalogo, "c.js:CATALOGO"), [
      { onde: "c.js:CATALOGO.aberto", texto: "Falta revisar" },
      { onde: "c.js:CATALOGO.grupo.achado", texto: "Título provisório" },
    ]);
  });

  it("ignora o que não é objeto", () => {
    assert.deepEqual(coletarProvisorios("texto", "x"), []);
    assert.deepEqual(coletarProvisorios(null, "x"), []);
    assert.deepEqual(coletarProvisorios(42, "x"), []);
  });
});

// ---------------------------------------------------------------------------
// COLETA EM HTML
// ---------------------------------------------------------------------------

describe("coletarProvisoriosDoHtml", () => {
  it("devolve o texto de cada elemento com data-provisorio, sem as marcas de dentro", () => {
    const html = `<p>final</p>
      <p data-provisorio>Texto  <strong>provisório</strong>
        em duas linhas</p>
      <small class="x" data-provisorio="">Outro</small>`;

    assert.deepEqual(coletarProvisoriosDoHtml(html, "public/index.html"), [
      { onde: "public/index.html", texto: "Texto provisório em duas linhas" },
      { onde: "public/index.html", texto: "Outro" },
    ]);
  });

  it("não acha nada num HTML sem marcação", () => {
    assert.deepEqual(coletarProvisoriosDoHtml("<p>tudo final</p>", "a.html"), []);
  });
});

// ---------------------------------------------------------------------------
// LISTA INTEIRA
// ---------------------------------------------------------------------------

describe("listarProvisorios: catálogo e HTML sintéticos", () => {
  /** @type {string} */
  let raiz = "";

  before(async () => {
    raiz = await mkdtemp(join(tmpdir(), "textos-provisorios-"));
    await mkdir(join(raiz, "js"));
    await mkdir(join(raiz, "site", "dentro"), { recursive: true });
    await writeFile(
      join(raiz, "js", "catalogo.mjs"),
      `export const TEXTOS = { a: { texto: "Um", provisorio: true }, b: { texto: "Dois", provisorio: false } };`,
    );
    await writeFile(join(raiz, "site", "index.html"), "<p data-provisorio>Na raiz</p>");
    await writeFile(
      join(raiz, "site", "dentro", "404.html"),
      "<p>final</p><h1 data-provisorio>Na pasta</h1>",
    );
  });

  after(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  it("junta catálogo e HTML, e conta só os marcados", async () => {
    const lista = await listarProvisorios({
      catalogos: ["js/catalogo.mjs"],
      pastaHtml: "site",
      raiz,
    });

    assert.deepEqual(lista, [
      { onde: "js/catalogo.mjs:TEXTOS.a", texto: "Um" },
      { onde: "site/dentro/404.html", texto: "Na pasta" },
      { onde: "site/index.html", texto: "Na raiz" },
    ]);
  });
});

describe("listarProvisorios: o repositório de verdade", () => {
  it("lista os catálogos reais sem lançar, e cada item diz onde está e o texto", async () => {
    const lista = await listarProvisorios();

    assert.ok(Array.isArray(lista));
    for (const item of lista) {
      assert.equal(typeof item.onde, "string");
      assert.equal(typeof item.texto, "string");
    }
  });
});
