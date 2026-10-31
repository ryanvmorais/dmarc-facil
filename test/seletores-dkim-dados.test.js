/**
 * @file Testes do arquivo de dados dos seletores DKIM.
 *
 * O teste guarda a forma da lista (tamanho, nomes válidos e sem repetição, links `https`, data
 * da conferência), não a verdade: se o provedor trocar o seletor, a conferência é a página do
 * `documentacao`, que o workflow semanal abre.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizarSeletor } from "../public/js/seletor-dkim.js";
import { ORIENTACOES, SELETORES_COMUNS } from "../public/js/seletores-dkim.js";

/**
 * @param {string} texto - Endereço a conferir.
 * @returns {boolean} `true` se é uma URL `https` bem formada, sem credencial nem fragmento.
 */
const ehLinkSeguro = (texto) => {
  try {
    const url = new URL(texto);
    return (
      url.protocol === "https:" && url.username === "" && url.password === "" && url.hash === ""
    );
  } catch {
    return false;
  }
};

/**
 * @param {string} texto - Data a conferir.
 * @returns {boolean} `true` se é `AAAA-MM-DD`, uma data que existe, e não é futura.
 */
const ehDataConferida = (texto) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return false;
  }
  const data = new Date(`${texto}T00:00:00Z`);
  return (
    !Number.isNaN(data.getTime()) && data.toISOString().startsWith(texto) && data <= new Date()
  );
};

describe("SELETORES_COMUNS", () => {
  it("tem de 15 a 20 seletores", () => {
    assert.ok(SELETORES_COMUNS.length >= 15 && SELETORES_COMUNS.length <= 20);
  });

  it("tem só seletores já normalizados", () => {
    for (const { seletor } of SELETORES_COMUNS) {
      assert.deepEqual(normalizarSeletor(seletor), { ok: true, seletor }, seletor);
    }
  });

  it("não repete seletor", () => {
    const seletores = SELETORES_COMUNS.map((item) => item.seletor);
    assert.equal(new Set(seletores).size, seletores.length);
  });

  it("tem provedor e link https da documentação em cada item", () => {
    for (const { seletor, provedor, documentacao } of SELETORES_COMUNS) {
      assert.ok(provedor.trim() !== "", `${seletor}: provedor vazio`);
      assert.ok(ehLinkSeguro(documentacao), `${seletor}: link inválido (${documentacao})`);
    }
  });

  it("tem a data da conferência em cada item", () => {
    for (const { seletor, conferido } of SELETORES_COMUNS) {
      assert.ok(ehDataConferida(conferido), `${seletor}: data inválida (${conferido})`);
    }
  });
});

describe("ORIENTACOES", () => {
  it("tem provedor e link https da documentação em cada item", () => {
    assert.ok(ORIENTACOES.length > 0);
    for (const { provedor, documentacao } of ORIENTACOES) {
      assert.ok(provedor.trim() !== "", "provedor vazio");
      assert.ok(ehLinkSeguro(documentacao), `${provedor}: link inválido (${documentacao})`);
    }
  });

  it("tem a data da conferência em cada item", () => {
    for (const { provedor, conferido } of ORIENTACOES) {
      assert.ok(ehDataConferida(conferido), `${provedor}: data inválida (${conferido})`);
    }
  });

  it("não repete provedor nem repete o provedor de um seletor comum", () => {
    const provedores = ORIENTACOES.map((item) => item.provedor);
    assert.equal(new Set(provedores).size, provedores.length);

    const comuns = new Set(SELETORES_COMUNS.map((item) => item.provedor));
    for (const provedor of provedores) {
      assert.ok(!comuns.has(provedor), `${provedor} está nas duas listas`);
    }
  });

  it("não traz seletor, só provedor, documentação e data", () => {
    for (const orientacao of ORIENTACOES) {
      assert.deepEqual(Object.keys(orientacao).toSorted(), [
        "conferido",
        "documentacao",
        "provedor",
      ]);
    }
  });
});
