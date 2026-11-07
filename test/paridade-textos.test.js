/**
 * @file Testes de paridade entre os catálogos de textos dos idiomas (RF-04, ADR-4 e ADR-12 da
 * spec 008).
 *
 * O `tsc` já recusa chave faltando ou sobrando em `textos/<idioma>/index.js` (o tipo `Textos` vem
 * do português). O que o tipo não vê, porque `string` é `string`, este teste confere: as mesmas
 * chaves, os mesmos marcadores `{nome}` em cada texto, o mesmo número de trechos entre crases e
 * nenhum texto vazio. Os idiomas comparados são os de `IDIOMAS`, e cada um é comparado com o
 * primeiro, a referência. Com um idioma só, a comparação com a referência é trivial, então os
 * testes de `compararCatalogos` a alimentam com catálogos defeituosos de propósito: a conferência
 * precisa falhar quando deve, senão a paridade passaria sem comparar nada.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// IDIOMAS
// ---------------------------------------------------------------------------

// A referência vem primeiro: acrescentar texto começa por ela (ADR-4).
const REFERENCIA = "pt";
const IDIOMAS = ["pt"];

/** @type {Record<string, unknown>} */
const CATALOGOS = Object.fromEntries(
  await Promise.all(
    IDIOMAS.map(async (idioma) => [
      idioma,
      (await import(`../public/js/textos/${idioma}/index.js`)).textos,
    ]),
  ),
);

// ---------------------------------------------------------------------------
// COMPARAÇÃO
// ---------------------------------------------------------------------------

/**
 * Todo texto de um catálogo, com o caminho até ele.
 *
 * @param {unknown} no - Um objeto do catálogo, ou um texto.
 * @param {string} [caminho] - O caminho até aqui, com pontos.
 * @returns {Record<string, string>} O caminho de cada texto e o texto.
 */
const achatar = (no, caminho = "") => {
  if (typeof no === "string") {
    return { [caminho]: no };
  }
  if (typeof no !== "object" || no === null) {
    return {};
  }
  return Object.assign(
    {},
    ...Object.entries(no).map(([chave, valor]) =>
      achatar(valor, caminho === "" ? chave : `${caminho}.${chave}`),
    ),
  );
};

/**
 * @param {string} texto - Um texto do catálogo.
 * @returns {string[]} Os marcadores `{nome}` dele, em ordem alfabética e com repetição.
 */
const marcadores = (texto) => (texto.match(/\{[A-Za-z0-9_]+\}/g) ?? []).sort();

/**
 * @param {string} texto - Um texto do catálogo.
 * @returns {number} Quantos trechos entre crases ele tem (um par de crases, um trecho).
 */
const trechosEntreCrases = (texto) => Math.floor((texto.split("`").length - 1) / 2);

/**
 * Compara um catálogo com a referência.
 *
 * @param {unknown} referencia - O catálogo de referência.
 * @param {unknown} outro - O catálogo a conferir.
 * @returns {string[]} Os problemas, um por linha; vazio se há paridade.
 */
const compararCatalogos = (referencia, outro) => {
  const base = achatar(referencia);
  const alvo = achatar(outro);
  /** @type {string[]} */
  const problemas = [];

  for (const caminho of Object.keys(base)) {
    if (!Object.hasOwn(alvo, caminho)) {
      problemas.push(`falta a chave ${caminho}`);
    }
  }
  for (const caminho of Object.keys(alvo)) {
    if (!Object.hasOwn(base, caminho)) {
      problemas.push(`sobra a chave ${caminho}`);
    }
  }
  for (const [caminho, texto] of Object.entries(alvo)) {
    const original = base[caminho];
    if (original === undefined) {
      continue;
    }
    if (marcadores(original).join() !== marcadores(texto).join()) {
      problemas.push(
        `${caminho}: marcadores [${marcadores(texto)}] no lugar de [${marcadores(original)}]`,
      );
    }
    if (trechosEntreCrases(original) !== trechosEntreCrases(texto)) {
      problemas.push(
        `${caminho}: ${trechosEntreCrases(texto)} trechos entre crases no lugar de ${trechosEntreCrases(original)}`,
      );
    }
  }
  return problemas;
};

/**
 * @param {unknown} catalogo - Um catálogo.
 * @returns {string[]} Os caminhos dos textos vazios (ou só de espaço).
 */
const textosVazios = (catalogo) =>
  Object.entries(achatar(catalogo))
    .filter(([, texto]) => texto.trim() === "")
    .map(([caminho]) => caminho);

// ---------------------------------------------------------------------------
// OS CATÁLOGOS DE VERDADE
// ---------------------------------------------------------------------------

describe("paridade dos catálogos de textos", () => {
  it("a lista de idiomas começa pela referência", () => {
    assert.equal(IDIOMAS[0], REFERENCIA);
  });

  it("o catálogo de referência tem texto para conferir", () => {
    const textos = Object.keys(achatar(CATALOGOS[REFERENCIA]));

    assert.ok(textos.length > 100, `só ${textos.length} textos`);
  });

  for (const idioma of IDIOMAS) {
    it(`${idioma}: mesmas chaves, marcadores e trechos de código que a referência`, () => {
      assert.deepEqual(compararCatalogos(CATALOGOS[REFERENCIA], CATALOGOS[idioma]), []);
    });

    it(`${idioma}: nenhum texto vazio`, () => {
      assert.deepEqual(textosVazios(CATALOGOS[idioma]), []);
    });
  }
});

// ---------------------------------------------------------------------------
// A CONFERÊNCIA FALHA QUANDO DEVE
// ---------------------------------------------------------------------------

describe("compararCatalogos", () => {
  const referencia = {
    a: { texto: "Resultado para {dominio}." },
    b: { texto: "Troque `p=none` por `p=quarantine`." },
  };

  it("não acusa catálogo igual, nem texto traduzido que mantém marcadores e código", () => {
    const traduzido = {
      a: { texto: "Result for {dominio}." },
      b: { texto: "Replace `p=none` with `p=quarantine`." },
    };

    assert.deepEqual(compararCatalogos(referencia, referencia), []);
    assert.deepEqual(compararCatalogos(referencia, traduzido), []);
  });

  it("acusa chave que falta e chave que sobra", () => {
    const outro = { a: { texto: "x {dominio}" }, c: { texto: "y" } };

    assert.deepEqual(compararCatalogos(referencia, outro).sort(), [
      "falta a chave b.texto",
      "sobra a chave c.texto",
    ]);
  });

  it("acusa marcador trocado, perdido ou repetido", () => {
    for (const texto of ["Result for {domain}.", "Result.", "{dominio} {dominio}"]) {
      const problemas = compararCatalogos(referencia, { ...referencia, a: { texto } });

      assert.equal(problemas.length, 1, texto);
      assert.match(problemas[0] ?? "", /^a\.texto: marcadores/);
    }
  });

  it("acusa trecho de código perdido ou acrescentado", () => {
    const sem = { ...referencia, b: { texto: "Replace p=none with p=quarantine." } };
    const demais = {
      ...referencia,
      b: { texto: "Replace `p=none` with `p=quarantine` in `_dmarc`." },
    };

    assert.match(compararCatalogos(referencia, sem)[0] ?? "", /^b\.texto: 0 trechos/);
    assert.match(compararCatalogos(referencia, demais)[0] ?? "", /^b\.texto: 3 trechos/);
  });

  it("acha o texto vazio", () => {
    assert.deepEqual(textosVazios({ a: { texto: "ok" }, b: { texto: "  " } }), ["b.texto"]);
  });
});
