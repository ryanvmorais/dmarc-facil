/**
 * @file Testes da regra de lint que proíbe transformar texto em HTML ou em código em `public/`.
 *
 * Conteúdo de registro TXT é dado de terceiros (um registro pode conter `<script>`), então a
 * primeira camada de defesa é o lint recusar as formas de inserir HTML. O teste usa a API do
 * ESLint com a configuração real do repositório, sobre trechos que fingem ser um arquivo de
 * `public/js/`: se alguém afrouxar a regra, o portão deixa de pegar a forma proibida e este
 * teste falha. A segunda camada (atributo e URL) é do `criar` e fica em `dom.test.js`.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";

// ---------------------------------------------------------------------------
// APOIO
// ---------------------------------------------------------------------------

// Raiz do repositório, para o ESLint achar o `eslint.config.mjs` de verdade.
const RAIZ = fileURLToPath(new URL("../", import.meta.url));

const eslint = new ESLint({ cwd: RAIZ });

/**
 * @param {string} codigo - Trecho a analisar.
 * @param {string} [arquivo="public/js/x.js"] - Caminho que o trecho finge ter.
 * @returns {Promise<string[]>} As regras que acusaram erro.
 */
const regrasQueFalham = async (codigo, arquivo = "public/js/x.js") => {
  const [resultado] = await eslint.lintText(codigo, { filePath: arquivo });
  return (resultado?.messages ?? [])
    .filter((mensagem) => mensagem.severity === 2)
    .map((mensagem) => mensagem.ruleId ?? "erro-de-sintaxe");
};

// ---------------------------------------------------------------------------
// FORMAS PROIBIDAS
// ---------------------------------------------------------------------------

describe("lint de public/: formas de inserir HTML ou código", () => {
  /** @type {Array<[string, string, string]>} Rótulo, trecho e regra esperada. */
  const casos = [
    ["innerHTML", "const f = (el, t) => { el.innerHTML = t; };", "no-restricted-properties"],
    ["outerHTML", "const f = (el, t) => { el.outerHTML = t; };", "no-restricted-properties"],
    [
      "insertAdjacentHTML",
      'const f = (el, t) => { el.insertAdjacentHTML("beforeend", t); };',
      "no-restricted-properties",
    ],
    ["document.write", "const f = (t) => { document.write(t); };", "no-restricted-properties"],
    ["document.writeln", "const f = (t) => { document.writeln(t); };", "no-restricted-properties"],
    ["eval", "const f = (t) => eval(t);", "no-eval"],
    ["new Function", "const f = (t) => new Function(t);", "no-new-func"],
    ["setTimeout com texto", 'setTimeout("alert(1)", 10);', "no-implied-eval"],
  ];

  for (const [rotulo, trecho, regra] of casos) {
    it(`recusa ${rotulo}`, async () => {
      assert.ok((await regrasQueFalham(trecho)).includes(regra));
    });
  }

  it("a recusa vale também em módulo de public/ fora de js/", async () => {
    const regras = await regrasQueFalham(
      "const f = (el) => { el.innerHTML = ''; };",
      "public/x.js",
    );

    assert.ok(regras.includes("no-restricted-properties"));
  });
});

// ---------------------------------------------------------------------------
// FORMAS PERMITIDAS
// ---------------------------------------------------------------------------

describe("lint de public/: o que é permitido", () => {
  it("aceita textContent e createElement", async () => {
    const trecho = `
      export const montar = (documento, texto) => {
        const p = documento.createElement("p");
        p.textContent = texto;
        return p;
      };
    `;

    assert.deepEqual(await regrasQueFalham(trecho), []);
  });

  it("não cobra a regra dos testes, que citam innerHTML em documentos falsos", async () => {
    const regras = await regrasQueFalham("const f = (el) => { el.innerHTML = ''; };", "test/x.js");

    assert.ok(!regras.includes("no-restricted-properties"));
  });
});
