/**
 * @file Testes de `normalizarSeletor` e `juntarSeletores`, a barreira entre o que o visitante
 * digita no campo de seletor e o nome DNS que vira consulta.
 *
 * Duas famílias de caso: os seletores reais têm que passar, normalizados; tudo o que poderia
 * injetar parâmetro na URL, montar outro nome ou disparar consultas demais tem que ser
 * recusado ou cortado.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  juntarSeletores,
  MAXIMO_SELETORES,
  normalizarSeletor,
  TAMANHO_MAXIMO_SELETOR,
} from "../public/js/seletor-dkim.js";

// ---------------------------------------------------------------------------
// SELETORES ACEITOS
// ---------------------------------------------------------------------------

describe("normalizarSeletor: seletores aceitos", () => {
  /** @type {Array<[string, string]>} O que foi digitado e o seletor esperado. */
  const casos = [
    ["google", "google"],
    ["selector1", "selector1"],
    ["Selector1", "selector1"],
    ["  s1 ", "s1"],
    ["marco2005.reykjavik", "marco2005.reykjavik"],
    ["k_1", "k_1"],
    ["a-b", "a-b"],
    ["2024", "2024"],
  ];

  for (const [entrada, esperado] of casos) {
    it(`"${entrada}" vira "${esperado}"`, () => {
      assert.deepEqual(normalizarSeletor(entrada), { ok: true, seletor: esperado });
    });
  }

  it("aceita componente de 63 caracteres", () => {
    assert.equal(normalizarSeletor("a".repeat(63)).ok, true);
  });

  it("aceita o tamanho máximo do seletor", () => {
    // 63 + 1 + 36 = 100 caracteres, em dois componentes.
    const seletor = `${"a".repeat(63)}.${"b".repeat(36)}`;
    assert.equal(seletor.length, TAMANHO_MAXIMO_SELETOR);
    assert.equal(normalizarSeletor(seletor).ok, true);
  });
});

// ---------------------------------------------------------------------------
// SELETORES RECUSADOS
// ---------------------------------------------------------------------------

describe("normalizarSeletor: seletores recusados", () => {
  /** @type {Array<[string, unknown, string]>} Descrição, entrada e motivo esperado. */
  const casos = [
    ["vazio", "", "vazio"],
    ["só espaços", "   ", "vazio"],
    ["número", 42, "vazio"],
    ["indefinido", undefined, "vazio"],
    ["nulo", null, "vazio"],
    ["lista", ["google"], "vazio"],
    ["nome completo", "google._domainkey.exemplo.com.br", "parece-nome-completo"],
    ["nome completo em maiúsculas", "Google._DomainKey.exemplo.com.br", "parece-nome-completo"],
    ["só _domainkey", "_domainkey", "parece-nome-completo"],
    ["101 caracteres", `${"a".repeat(63)}.${"b".repeat(37)}`, "grande-demais"],
    ["componente de 64", "a".repeat(64), "componente-grande-demais"],
    ["dois pontos seguidos", "a..b", "componente-vazio"],
    ["ponto no começo", ".a", "componente-vazio"],
    ["ponto no fim", "a.", "componente-vazio"],
    ["só um ponto", ".", "componente-vazio"],
    ["espaço no meio", "a b", "caractere-invalido"],
    ["barra", "a/b", "caractere-invalido"],
    ["interrogação", "a?b", "caractere-invalido"],
    ["jogo da velha", "a#b", "caractere-invalido"],
    ["dois-pontos", "a:b", "caractere-invalido"],
    ["arroba", "a@b", "caractere-invalido"],
    ["porcentagem", "a%b", "caractere-invalido"],
    ["e comercial", "a&name=b", "caractere-invalido"],
    ["igual", "name=b", "caractere-invalido"],
    ["aspas", 'a"b', "caractere-invalido"],
    ["menor que", "<script>", "caractere-invalido"],
    ["caractere de controle", "a\u0000b", "caractere-invalido"],
    ["quebra de linha no meio", "a\nb", "caractere-invalido"],
    ["acentuado", "seleção", "caractere-invalido"],
  ];

  for (const [descricao, entrada, motivo] of casos) {
    it(`recusa ${descricao} com "${motivo}"`, () => {
      assert.deepEqual(normalizarSeletor(entrada), { ok: false, motivo });
    });
  }
});

// ---------------------------------------------------------------------------
// LISTA FINAL
// ---------------------------------------------------------------------------

describe("juntarSeletores", () => {
  it("põe os comuns antes dos digitados", () => {
    assert.deepEqual(juntarSeletores(["google", "s1"], ["meu", "k1"]), {
      seletores: ["google", "s1", "meu", "k1"],
      cortados: 0,
    });
  });

  it("tira o repetido depois de normalizar", () => {
    assert.deepEqual(juntarSeletores(["google", "s1"], ["GOOGLE", " s1 ", "meu", "Meu"]), {
      seletores: ["google", "s1", "meu"],
      cortados: 0,
    });
  });

  it("descarta o digitado inválido sem afetar os outros", () => {
    assert.deepEqual(juntarSeletores(["google"], ["a/b", "", "meu", "a..b"]), {
      seletores: ["google", "meu"],
      cortados: 0,
    });
  });

  it("corta o que passa do teto e conta quantos foram cortados", () => {
    const digitados = Array.from({ length: 50 }, (_, i) => `sel${i}`);
    const resultado = juntarSeletores(["google"], digitados);

    assert.equal(resultado.seletores.length, MAXIMO_SELETORES);
    assert.equal(resultado.seletores[0], "google");
    assert.equal(resultado.cortados, 51 - MAXIMO_SELETORES);
  });

  it("não conta como cortado o repetido nem o inválido", () => {
    const comuns = Array.from({ length: MAXIMO_SELETORES }, (_, i) => `c${i}`);
    assert.deepEqual(juntarSeletores(comuns, ["c0", "a/b", "novo"]), {
      seletores: comuns,
      cortados: 1,
    });
  });

  it("trata entrada que não é lista como lista vazia", () => {
    assert.deepEqual(juntarSeletores(undefined, null), { seletores: [], cortados: 0 });
    assert.deepEqual(juntarSeletores("google", { 0: "s1" }), { seletores: [], cortados: 0 });
  });

  it("ignora item que não é texto", () => {
    assert.deepEqual(juntarSeletores([42, null, "google"], [{}, "meu"]), {
      seletores: ["google", "meu"],
      cortados: 0,
    });
  });
});
