/**
 * @file Testes da regra da chave fixa: a chave abaixo de 2048 bits num seletor de provedor que
 * define a chave vira `info`, nos outros seletores fica `aviso`, e o selo segue a mesma regra.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ajustarChaveFixa,
  ehChaveFixaCurta,
  seletorComChaveFixa,
} from "../public/js/chave-fixa.js";
import { SELETORES_COMUNS } from "../public/js/seletores-dkim.js";
import { calcularSelo } from "../public/js/selo.js";
import { chaveRsa } from "./ajudas/chave-sintetica.js";
import { estadoDkim } from "./ajudas/estados.js";
import { textos } from "./ajudas/textos.js";

/** @typedef {import("../public/js/dkim.js").Achado} Achado */

const CURTA = `v=DKIM1; k=rsa; p=${chaveRsa(1024)}`;

/**
 * @param {string} seletor - O seletor do achado.
 * @param {"erro" | "aviso" | "info"} [gravidade="aviso"] - A gravidade de partida.
 * @returns {Achado} O achado de chave abaixo de 2048 bits.
 */
const curta = (seletor, gravidade = "aviso") => ({
  codigo: "chave-abaixo-do-recomendado",
  gravidade,
  seletor,
  tag: "p",
  detalhe: 1024,
});

describe("seletorComChaveFixa", () => {
  it("acha o resend, que tem chaveFixa", () => {
    assert.equal(seletorComChaveFixa("resend")?.provedor, "Resend");
  });

  it("não acha seletor comum sem chaveFixa, seletor digitado nem achado sem seletor", () => {
    assert.equal(seletorComChaveFixa("google"), undefined);
    assert.equal(seletorComChaveFixa("zoho2026"), undefined);
    assert.equal(seletorComChaveFixa(undefined), undefined);
  });

  it("só o resend tem chaveFixa hoje (troque este teste ao incluir outro provedor)", () => {
    assert.deepEqual(
      SELETORES_COMUNS.filter((item) => item.chaveFixa !== undefined).map((item) => item.seletor),
      ["resend"],
    );
  });
});

describe("ehChaveFixaCurta", () => {
  it("só vale para a chave abaixo de 2048 bits", () => {
    assert.equal(ehChaveFixaCurta(curta("resend")), true);
    assert.equal(ehChaveFixaCurta({ codigo: "chave-fraca", seletor: "resend" }), false);
    assert.equal(ehChaveFixaCurta({ codigo: "so-sha1", seletor: "resend" }), false);
  });
});

describe("ajustarChaveFixa", () => {
  it("rebaixa a chave curta do resend para info e deixa a do google como aviso", () => {
    const ajustados = ajustarChaveFixa([curta("resend"), curta("google")]);

    assert.deepEqual(
      ajustados.map((achado) => [achado.seletor, achado.gravidade]),
      [
        ["google", "aviso"],
        ["resend", "info"],
      ],
    );
  });

  it("não rebaixa outro código no mesmo seletor", () => {
    /** @type {Achado} */
    const fraca = { codigo: "chave-fraca", gravidade: "erro", seletor: "resend" };
    assert.deepEqual(ajustarChaveFixa([fraca]), [fraca]);
  });

  it("devolve lista nova e não altera a de entrada", () => {
    const entrada = [curta("resend")];
    ajustarChaveFixa(entrada);
    assert.equal(entrada[0]?.gravidade, "aviso");
  });

  it("põe a informação rebaixada depois dos avisos, sem embaralhar o resto", () => {
    /** @type {Achado[]} */
    const achados = [
      curta("resend"),
      curta("google"),
      { codigo: "modo-de-teste", gravidade: "info", seletor: "s1" },
    ];
    assert.deepEqual(
      ajustarChaveFixa(achados).map((achado) => [achado.seletor, achado.gravidade]),
      [
        ["google", "aviso"],
        ["resend", "info"],
        ["s1", "info"],
      ],
    );
  });
});

describe("calcularSelo com a chave fixa", () => {
  it("chave de 1024 bits só no resend: selo ok", async () => {
    const estado = await estadoDkim(["resend"], {
      "resend._domainkey.exemplo.com.br": [CURTA],
    });
    assert.equal(calcularSelo(textos, "dkim", estado).estado, "ok");
  });

  it("chave de 1024 bits no google: selo atenção", async () => {
    const estado = await estadoDkim(["google"], {
      "google._domainkey.exemplo.com.br": [CURTA],
    });
    assert.equal(calcularSelo(textos, "dkim", estado).estado, "atencao");
  });

  it("chave de 512 bits no resend continua erro: o provedor não protege de chave fraca", async () => {
    const estado = await estadoDkim(["resend"], {
      "resend._domainkey.exemplo.com.br": [`v=DKIM1; k=rsa; p=${chaveRsa(512)}`],
    });
    assert.equal(calcularSelo(textos, "dkim", estado).estado, "problema");
  });
});
