/**
 * @file Testes de `montarEscada`, a escada do DMARC da interface C (RF-03 da spec 006).
 *
 * Seis situações de registro (`none`, `quarantine`, `reject`, ausente, inválido e múltiplos),
 * mais as duas ressalvas que impedem a página de afirmar proteção completa. Os registros são
 * sintéticos e passam por `lerDmarc`, o leitor real.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lerDmarc } from "../public/js/dmarc.js";
import { montarEscada, textoDoFim } from "../public/js/escada.js";

const RUA = "rua=mailto:dmarc@exemplo.com.br";

/**
 * @param {string[]} registros - Textos TXT de `_dmarc.exemplo.com.br`.
 * @returns {import("../public/js/escada.js").Escada} A escada do registro.
 */
const escadaDe = (registros) => montarEscada(lerDmarc(registros));

/**
 * @param {import("../public/js/escada.js").Escada} escada - A escada.
 * @returns {string[]} Os papéis dos três degraus, na ordem.
 */
const papeis = (escada) => escada.degraus.map((degrau) => degrau.papel);

// ---------------------------------------------------------------------------
// REGISTRO VÁLIDO
// ---------------------------------------------------------------------------

describe("montarEscada: registro válido", () => {
  it("none: atual no 1º degrau, próximo é quarantine", () => {
    const escada = escadaDe([`v=DMARC1; p=none; ${RUA}`]);

    assert.deepEqual(papeis(escada), ["atual", "proximo", "outro"]);
    assert.equal(escada.proximo, "quarantine");
    assert.equal(escada.semAtual, false);
  });

  it("quarantine: atual no 2º degrau, próximo é reject", () => {
    const escada = escadaDe([`v=DMARC1; p=quarantine; ${RUA}`]);

    assert.deepEqual(papeis(escada), ["outro", "atual", "proximo"]);
    assert.equal(escada.proximo, "reject");
  });

  it("reject: atual no último degrau e nenhum próximo passo", () => {
    const escada = escadaDe([`v=DMARC1; p=reject; ${RUA}`]);

    assert.deepEqual(papeis(escada), ["outro", "outro", "atual"]);
    assert.equal(escada.proximo, null);
    assert.ok(escada.degraus.every((degrau) => degrau.acao === undefined));
    assert.match(textoDoFim(escada) ?? "", /degrau final/);
  });

  it("os degraus vêm na ordem none, quarantine, reject", () => {
    const escada = escadaDe([`v=DMARC1; p=none; ${RUA}`]);

    assert.deepEqual(
      escada.degraus.map((degrau) => degrau.politica),
      ["none", "quarantine", "reject"],
    );
  });

  it("só o degrau seguinte traz o que fazer, e a etiqueta marca atual e próximo", () => {
    const escada = escadaDe([`v=DMARC1; p=none; ${RUA}`]);
    const [atual, proximo, outro] = escada.degraus;

    assert.equal(atual?.acao, undefined);
    assert.match(proximo?.acao ?? "", /p=quarantine/);
    assert.equal(outro?.acao, undefined);
    assert.equal(atual?.etiqueta, "você está aqui");
    assert.equal(proximo?.etiqueta, "Próximo passo");
    assert.equal(outro?.etiqueta, undefined);
  });

  it("textoDoFim só existe no degrau final", () => {
    assert.equal(textoDoFim(escadaDe([`v=DMARC1; p=none; ${RUA}`])), null);
    assert.equal(textoDoFim(escadaDe([])), null);
  });
});

// ---------------------------------------------------------------------------
// SEM REGISTRO QUE VALHA
// ---------------------------------------------------------------------------

describe("montarEscada: sem registro válido", () => {
  /** @type {Array<[string, string[]]>} Rótulo e registros. */
  const casos = [
    ["ausente", []],
    ["inválido", ["v=DMARC1; p=talvez"]],
    ["múltiplos", ["v=DMARC1; p=none", "v=DMARC1; p=reject"]],
  ];

  for (const [rotulo, registros] of casos) {
    it(`${rotulo}: nenhum degrau é o atual e o próximo passo é publicar`, () => {
      const escada = escadaDe(registros);

      assert.equal(escada.semAtual, true);
      assert.equal(escada.proximo, "publicar");
      assert.ok(escada.degraus.every((degrau) => degrau.papel !== "atual"));
      assert.deepEqual(papeis(escada), ["proximo", "outro", "outro"]);
      assert.deepEqual(escada.ressalvas, []);
    });
  }

  it("cada um dos três casos tem a sua instrução", () => {
    const acoes = casos.map(([, registros]) => escadaDe(registros).degraus[0]?.acao);

    assert.equal(new Set(acoes).size, 3);
    assert.ok(acoes.every((acao) => typeof acao === "string" && acao.length > 0));
  });
});

// ---------------------------------------------------------------------------
// RESSALVAS
// ---------------------------------------------------------------------------

describe("montarEscada: ressalvas", () => {
  it("sp mais fraco que p vira subdominios-mais-fracos", () => {
    const escada = escadaDe([`v=DMARC1; p=reject; sp=none; ${RUA}`]);

    assert.deepEqual(escada.ressalvas, ["subdominios-mais-fracos"]);
  });

  it("pct abaixo de 100 vira aplicacao-parcial", () => {
    const escada = escadaDe([`v=DMARC1; p=quarantine; pct=25; ${RUA}`]);

    assert.deepEqual(escada.ressalvas, ["aplicacao-parcial"]);
  });

  it("as duas juntas aparecem juntas", () => {
    const escada = escadaDe([`v=DMARC1; p=reject; sp=none; pct=50; ${RUA}`]);

    assert.deepEqual(escada.ressalvas, ["subdominios-mais-fracos", "aplicacao-parcial"]);
  });

  it("registro sem restrição não tem ressalva", () => {
    assert.deepEqual(escadaDe([`v=DMARC1; p=reject; ${RUA}`]).ressalvas, []);
  });
});
