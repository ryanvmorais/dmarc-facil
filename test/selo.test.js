/**
 * @file Testes de `calcularSelo`, a regra única do selo dos três cartões (ADR-6 da spec 006).
 *
 * Os estados vêm dos leitores reais sobre registros sintéticos (`exemplo.com.br`). Uma das
 * regras é decisão de produto e tem nome no teste, para ninguém "corrigi-la" sem querer: DKIM
 * `nao-encontrado` é `atencao`, não `problema` nem `ok`.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calcularSelo } from "../public/js/selo.js";
import {
  DOMINIO,
  estadoDkim,
  estadoDmarc,
  estadoSpf,
  falha,
  REGISTRO_DKIM,
  verificando,
} from "./ajudas/estados.js";

const DMARC_REJECT = "v=DMARC1; p=reject; rua=mailto:dmarc@exemplo.com.br";
const NOME_GOOGLE = "google._domainkey.exemplo.com.br";

// ---------------------------------------------------------------------------
// PARTE QUE NÃO TERMINOU
// ---------------------------------------------------------------------------

describe("calcularSelo: consulta que falhou ou não terminou", () => {
  for (const parte of /** @type {const} */ (["dmarc", "spf", "dkim"])) {
    it(`${parte} com falha é "Não verificado"`, () => {
      assert.deepEqual(calcularSelo(parte, falha(parte)), {
        estado: "nao-verificado",
        texto: "Não verificado",
      });
    });

    it(`${parte} ainda verificando é "Não verificado"`, () => {
      assert.equal(calcularSelo(parte, verificando(parte)).estado, "nao-verificado");
    });
  }
});

// ---------------------------------------------------------------------------
// DMARC
// ---------------------------------------------------------------------------

describe("calcularSelo: DMARC", () => {
  it("registro ausente é problema", () => {
    assert.deepEqual(calcularSelo("dmarc", estadoDmarc([])), {
      estado: "problema",
      texto: "Problema",
    });
  });

  it("registro inválido é problema", () => {
    assert.equal(calcularSelo("dmarc", estadoDmarc(["v=DMARC1; p=talvez"])).estado, "problema");
  });

  it("dois registros são problema", () => {
    const dois = ["v=DMARC1; p=none", "v=DMARC1; p=reject"];

    assert.equal(calcularSelo("dmarc", estadoDmarc(dois)).estado, "problema");
  });

  it("válido com pior achado aviso (p=none) é atenção", () => {
    const estado = estadoDmarc(["v=DMARC1; p=none; rua=mailto:dmarc@exemplo.com.br"]);

    assert.deepEqual(calcularSelo("dmarc", estado), { estado: "atencao", texto: "Atenção" });
  });

  it("válido sem achado nenhum é OK", () => {
    assert.deepEqual(calcularSelo("dmarc", estadoDmarc([DMARC_REJECT])), {
      estado: "ok",
      texto: "OK",
    });
  });

  it("válido só com achado info (caixa fora do padrão) é OK", () => {
    const estado = estadoDmarc(["v=DMARC1; P=reject; rua=mailto:dmarc@exemplo.com.br"]);

    assert.ok(estado.resultado.situacao === "valido");
    assert.ok(estado.resultado.achados.length > 0);
    assert.ok(estado.resultado.achados.every((achado) => achado.gravidade === "info"));
    assert.equal(calcularSelo("dmarc", estado).estado, "ok");
  });

  it("achado de erro num registro válido é problema", () => {
    const estado = estadoDmarc([DMARC_REJECT]);
    assert.ok(estado.resultado.situacao === "valido");
    estado.resultado.achados.push({ codigo: "x", gravidade: "erro" });

    assert.equal(calcularSelo("dmarc", estado).estado, "problema");
  });
});

// ---------------------------------------------------------------------------
// SPF
// ---------------------------------------------------------------------------

describe("calcularSelo: SPF", () => {
  it("registro ausente é problema", async () => {
    assert.equal(calcularSelo("spf", await estadoSpf({})).estado, "problema");
  });

  it("registro inválido é problema", async () => {
    const estado = await estadoSpf({ [DOMINIO]: ["v=spf1 foo:bar -all"] });

    assert.equal(calcularSelo("spf", estado).estado, "problema");
  });

  it("dois registros são problema", async () => {
    const estado = await estadoSpf({ [DOMINIO]: ["v=spf1 -all", "v=spf1 ~all"] });

    assert.equal(calcularSelo("spf", estado).estado, "problema");
  });

  it("-all sem achado de gravidade é OK", async () => {
    const estado = await estadoSpf({ [DOMINIO]: ["v=spf1 ip4:203.0.113.10 -all"] });

    assert.equal(calcularSelo("spf", estado).estado, "ok");
  });

  it("sem all (aviso) é atenção", async () => {
    const estado = await estadoSpf({ [DOMINIO]: ["v=spf1 ip4:203.0.113.10"] });

    assert.equal(calcularSelo("spf", estado).estado, "atencao");
  });

  it("+all (erro) é problema", async () => {
    const estado = await estadoSpf({ [DOMINIO]: ["v=spf1 +all"] });

    assert.equal(calcularSelo("spf", estado).estado, "problema");
  });

  it("passar de 10 consultas é problema", async () => {
    const includes = Array.from({ length: 11 }, (_, i) => `include:s${i}.exemplo.com.br`);
    /** @type {Record<string, string[]>} */
    const mapa = { [DOMINIO]: [`v=spf1 ${includes.join(" ")} -all`] };
    for (let i = 0; i < 11; i += 1) {
      mapa[`s${i}.exemplo.com.br`] = ["v=spf1 ip4:203.0.113.10 -all"];
    }
    const estado = await estadoSpf(mapa);
    assert.ok(estado.fase === "pronto");
    assert.equal(estado.resultado.consultas.passouDoLimite, true);

    assert.equal(calcularSelo("spf", estado).estado, "problema");
  });

  it("leitura incompleta nunca fica OK: sobe para atenção", async () => {
    const estado = await estadoSpf({
      [DOMINIO]: ["v=spf1 include:filho.exemplo.com.br -all"],
      "filho.exemplo.com.br": "FALHA",
    });
    assert.ok(estado.fase === "pronto");
    assert.equal(estado.resultado.consultas.incompleta, true);

    assert.equal(calcularSelo("spf", estado).estado, "atencao");
  });
});

// ---------------------------------------------------------------------------
// DKIM
// ---------------------------------------------------------------------------

describe("calcularSelo: DKIM", () => {
  it("encontrado sem achado pior que info é OK", async () => {
    const estado = await estadoDkim(["google"], { [NOME_GOOGLE]: [REGISTRO_DKIM] });

    assert.equal(calcularSelo("dkim", estado).estado, "ok");
  });

  it("encontrado com achado de aviso é atenção", async () => {
    const estado = await estadoDkim(["google"], { [NOME_GOOGLE]: [REGISTRO_DKIM] });
    assert.ok(estado.fase === "pronto");
    estado.resultado.achados.push({ codigo: "chave-abaixo-do-recomendado", gravidade: "aviso" });

    assert.equal(calcularSelo("dkim", estado).estado, "atencao");
  });

  it("encontrado com achado de erro é problema", async () => {
    const estado = await estadoDkim(["google"], { [NOME_GOOGLE]: [REGISTRO_DKIM] });
    assert.ok(estado.fase === "pronto");
    estado.resultado.achados.push({ codigo: "chave-fraca", gravidade: "erro" });

    assert.equal(calcularSelo("dkim", estado).estado, "problema");
  });

  it("regra de produto: nao-encontrado é atenção, nem problema nem OK", async () => {
    const estado = await estadoDkim(["google", "selector1"], {});
    assert.ok(estado.fase === "pronto");
    assert.equal(estado.resultado.situacao, "nao-encontrado");

    assert.deepEqual(calcularSelo("dkim", estado), { estado: "atencao", texto: "Atenção" });
  });

  it("indeterminado (consultas falharam) é não verificado", async () => {
    const estado = await estadoDkim(["a", "b", "c", "d"], {
      "a._domainkey.exemplo.com.br": "FALHA",
      "b._domainkey.exemplo.com.br": "FALHA",
      "c._domainkey.exemplo.com.br": "FALHA",
      "d._domainkey.exemplo.com.br": "FALHA",
    });
    assert.ok(estado.fase === "pronto");
    assert.equal(estado.resultado.situacao, "indeterminado");

    assert.equal(calcularSelo("dkim", estado).estado, "nao-verificado");
  });

  it("encontrado com parte dos seletores sem verificar nunca é OK", async () => {
    const estado = await estadoDkim(["google", "a", "b", "c", "d"], {
      [NOME_GOOGLE]: [REGISTRO_DKIM],
      "a._domainkey.exemplo.com.br": "FALHA",
      "b._domainkey.exemplo.com.br": "FALHA",
      "c._domainkey.exemplo.com.br": "FALHA",
    });
    assert.ok(estado.fase === "pronto");
    assert.equal(estado.resultado.situacao, "encontrado");
    assert.equal(estado.resultado.incompleta, true);

    assert.notEqual(calcularSelo("dkim", estado).estado, "ok");
  });
});
