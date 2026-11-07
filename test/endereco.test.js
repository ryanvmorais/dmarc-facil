/**
 * @file Testes de `lerDominioDoEndereco`, `montarEndereco` e `montarEnderecoIdioma` (RF-01 e ADR-8
 * da spec 006; RF-05 e ADR-6 da spec 008).
 *
 * O link `?dominio=` é montado por qualquer pessoa, então o parâmetro é entrada hostil: a
 * função tem de devolver só texto, sem interpretar nada, e o campo é quem o recebe como valor.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lerDominioDoEndereco,
  montarEndereco,
  montarEnderecoIdioma,
} from "../public/js/endereco.js";

// ---------------------------------------------------------------------------
// LEITURA
// ---------------------------------------------------------------------------

describe("lerDominioDoEndereco", () => {
  /** @type {Array<[string, unknown, string]>} Rótulo, busca e o texto esperado. */
  const casos = [
    ["presente", "?dominio=exemplo.com.br", "exemplo.com.br"],
    ["ausente", "", ""],
    ["outros parâmetros só", "?x=1&y=2", ""],
    ["vazio", "?dominio=", ""],
    ["repetido vale o primeiro", "?dominio=a.com.br&dominio=b.com.br", "a.com.br"],
    ["com %-escape", "?dominio=b%C3%BCcher.de", "bücher.de"],
    ["junto de outros", "?x=1&dominio=exemplo.com.br&y=2", "exemplo.com.br"],
    ["sem o ponto de interrogação", "dominio=exemplo.com.br", "exemplo.com.br"],
    ["não é texto (undefined)", undefined, ""],
    ["não é texto (número)", 42, ""],
  ];

  for (const [rotulo, busca, esperado] of casos) {
    it(`${rotulo}`, () => {
      assert.equal(lerDominioDoEndereco(busca), esperado);
    });
  }

  it("com marcação devolve o texto, sem interpretar", () => {
    const busca = `?dominio=${encodeURIComponent('"><script>alert(1)</script>')}`;

    assert.equal(lerDominioDoEndereco(busca), '"><script>alert(1)</script>');
  });

  it("corta um parâmetro gigante", () => {
    const busca = `?dominio=${"a".repeat(100_000)}`;

    assert.ok(lerDominioDoEndereco(busca).length <= 512);
  });
});

// ---------------------------------------------------------------------------
// MONTAGEM
// ---------------------------------------------------------------------------

describe("montarEndereco", () => {
  it("monta a busca do domínio", () => {
    assert.equal(montarEndereco("exemplo.com.br"), "?dominio=exemplo.com.br");
  });

  it("codifica o que não é seguro numa URL", () => {
    const busca = montarEndereco("a&b=c d");

    assert.equal(busca, "?dominio=a%26b%3Dc+d");
    assert.equal(lerDominioDoEndereco(busca), "a&b=c d");
  });

  it("o que monta, lê de volta igual", () => {
    assert.equal(lerDominioDoEndereco(montarEndereco("xn--bcher-kva.de")), "xn--bcher-kva.de");
  });
});

// ---------------------------------------------------------------------------
// LINK DE IDIOMA
// ---------------------------------------------------------------------------

describe("montarEnderecoIdioma", () => {
  it("campo vazio: só a base, sem parâmetro", () => {
    assert.equal(montarEnderecoIdioma("/en/", ""), "/en/");
    assert.equal(montarEnderecoIdioma("/", "   "), "/");
  });

  it("campo preenchido: a base e o ?dominio= com o texto aparado", () => {
    assert.equal(montarEnderecoIdioma("/en/", "  exemplo.com.br "), "/en/?dominio=exemplo.com.br");
    assert.equal(montarEnderecoIdioma("/", "exemplo.com.br"), "/?dominio=exemplo.com.br");
  });

  it("o texto do campo, e não o domínio normalizado, é o que vai", () => {
    assert.equal(
      montarEnderecoIdioma("/en/", "HTTPS://Exemplo.COM/x"),
      "/en/?dominio=HTTPS%3A%2F%2FExemplo.COM%2Fx",
    );
  });

  it("texto longo é cortado no limite do endereço", () => {
    const endereco = montarEnderecoIdioma("/en/", "a".repeat(100_000));

    assert.ok(endereco.startsWith("/en/?dominio=aaa"));
    assert.equal(lerDominioDoEndereco(endereco.slice("/en/".length)).length, 512);
    assert.ok(endereco.length < 600);
  });

  it("texto hostil fica codificado e inerte, depois da base fixa", () => {
    for (const texto of [
      "<script>alert(1)</script>",
      "javascript:alert(1)",
      "%00",
      "\u0000",
      '"><img src=x onerror=alert(1)>',
      "//evil.example",
    ]) {
      const endereco = montarEnderecoIdioma("/en/", texto);

      assert.ok(endereco.startsWith("/en/?dominio="), texto);
      assert.doesNotMatch(endereco, /[<>"' ]/, texto);
      assert.equal(endereco.indexOf("?"), "/en/".length, texto);
      assert.equal(lerDominioDoEndereco(endereco.slice("/en/".length)), texto);
    }
  });

  it("%00 digitado vira %2500, nunca um byte nulo", () => {
    assert.equal(montarEnderecoIdioma("/", "%00"), "/?dominio=%2500");
  });

  it("o que não é texto conta como campo vazio", () => {
    assert.equal(montarEnderecoIdioma("/en/", undefined), "/en/");
    assert.equal(montarEnderecoIdioma("/en/", 42), "/en/");
  });
});
