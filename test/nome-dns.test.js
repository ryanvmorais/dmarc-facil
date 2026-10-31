/**
 * @file Testes de `validarNomeDns`, a barreira entre o nome montado e a URL do resolvedor.
 *
 * Duas famílias de caso: os nomes que a ferramenta monta de verdade (`_dmarc`, seletor DKIM)
 * têm que passar; tudo o que poderia injetar parâmetro na URL ou quebrar a consulta tem que
 * ser recusado.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validarNomeDns } from "../public/js/nome-dns.js";

// ---------------------------------------------------------------------------
// NOMES ACEITOS
// ---------------------------------------------------------------------------

describe("validarNomeDns: nomes aceitos", () => {
  /** @type {Array<[string, string]>} Nome montado e o nome esperado na consulta. */
  const casos = [
    ["_dmarc.exemplo.com.br", "_dmarc.exemplo.com.br"],
    ["seletor1._domainkey.exemplo.com.br", "seletor1._domainkey.exemplo.com.br"],
    ["_DMARC.Exemplo.COM.br", "_dmarc.exemplo.com.br"],
    ["exemplo.com.br.", "exemplo.com.br"],
    ["a-b.exemplo.com", "a-b.exemplo.com"],
    ["xn--bcher-kva.de", "xn--bcher-kva.de"],
  ];

  for (const [entrada, esperado] of casos) {
    it(`"${entrada}" vira "${esperado}"`, () => {
      assert.deepEqual(validarNomeDns(entrada), { ok: true, nome: esperado });
    });
  }

  it("aceita rótulo de 63 e nome de 253 caracteres", () => {
    const rotulo = "a".repeat(63);
    assert.equal(validarNomeDns(`${rotulo}.com`).ok, true);

    // 3 rótulos de 63 + 1 de 61, com 3 pontos: 189 + 61 + 3 = 253.
    const nome = [rotulo, rotulo, rotulo, "a".repeat(61)].join(".");
    assert.equal(nome.length, 253);
    assert.equal(validarNomeDns(nome).ok, true);
  });
});

// ---------------------------------------------------------------------------
// NOMES RECUSADOS
// ---------------------------------------------------------------------------

describe("validarNomeDns: nomes recusados", () => {
  /** @type {Array<[string, string]>} Descrição do caso e o nome recusado. */
  const casos = [
    ["vazio", ""],
    ["só o ponto final", "."],
    ["com espaço", "exemplo .com.br"],
    ["com espaço nas pontas", " exemplo.com.br"],
    ["com &", "exemplo.com&name=outro.com"],
    ["com =", "name=exemplo.com"],
    ["com ?", "exemplo.com?x=1"],
    ["com #", "exemplo.com#topo"],
    ["com /", "exemplo.com/pagina"],
    ["com %", "exemplo%2ecom"],
    ["com :", "exemplo.com:443"],
    ["com acento", "bücher.de"],
    ["com rótulo vazio", "a..b"],
    ["começando em ponto", ".exemplo.com"],
    ["com dois pontos finais", "exemplo.com.."],
    ["com rótulo de 64 caracteres", `${"a".repeat(64)}.com`],
    [
      "com nome de 254 caracteres",
      `${"a".repeat(63)}.${"a".repeat(63)}.${"a".repeat(63)}.${"a".repeat(62)}`,
    ],
  ];

  for (const [descricao, entrada] of casos) {
    it(`recusa nome ${descricao}`, () => {
      const resultado = validarNomeDns(entrada);
      assert.equal(resultado.ok, false);
      if (!resultado.ok) {
        assert.notEqual(resultado.motivo, "");
      }
    });
  }

  it("a entrada hostil que tenta injetar um segundo parâmetro é recusada", () => {
    assert.equal(validarNomeDns("exemplo.com&name=outro.com").ok, false);
  });
});
