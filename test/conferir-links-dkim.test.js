/**
 * @file Testes da lógica de `scripts/conferir-links-dkim.mjs`, o script do workflow semanal que
 * confere os links da lista de seletores DKIM.
 *
 * Offline: o `fetch` é um falso que responde por endereço. O que importa é o veredito de cada
 * caso: só link quebrado e página que deixou de citar o seletor derrubam o run; site que barra
 * o robô ou está fora do ar é aviso.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ORIENTACOES, SELETORES_COMUNS } from "../public/js/seletores-dkim.js";
import {
  classificarStatus,
  conferirTudo,
  estaVelha,
  paginaCitaSeletor,
} from "../scripts/conferir-links-dkim.mjs";

/** Corpo de página que cita todos os seletores da lista. */
const CORPO = SELETORES_COMUNS.map((item) => `${item.seletor}._domainkey.exemplo.com`).join(" ");

/**
 * @param {Record<string, number | Error>} [excecoes] - Resposta por endereço: um código HTTP
 *   ou o erro a lançar; o que falta responde 200 com `CORPO`.
 * @param {Record<string, string>} [corpos] - Corpo por endereço, no lugar de `CORPO`.
 * @returns {{ buscar: typeof fetch, pedidos: string[] }} O `fetch` falso e os endereços pedidos.
 */
const criarBuscar = (excecoes = {}, corpos = {}) => {
  /** @type {string[]} */
  const pedidos = [];
  const buscar = /** @type {typeof fetch} */ (
    async (/** @type {string} */ url) => {
      pedidos.push(url);
      const excecao = excecoes[url];
      if (excecao instanceof Error) {
        throw excecao;
      }
      return /** @type {Response} */ (
        /** @type {unknown} */ ({
          status: excecao ?? 200,
          text: async () => corpos[url] ?? CORPO,
        })
      );
    }
  );
  return { buscar, pedidos };
};

/** @param {{ linhas: Array<{ nome: string, veredito: string }> }} resultado @param {string} nome */
const vereditoDe = (resultado, nome) => resultado.linhas.find((l) => l.nome === nome)?.veredito;

// ---------------------------------------------------------------------------
// FUNÇÕES PURAS
// ---------------------------------------------------------------------------

describe("classificarStatus", () => {
  for (const [status, esperado] of /** @type {const} */ ([
    [200, "ok"],
    [204, "ok"],
    [404, "falha"],
    [410, "falha"],
    [401, "inconclusivo"],
    [403, "inconclusivo"],
    [429, "inconclusivo"],
    [500, "inconclusivo"],
    [503, "inconclusivo"],
    [301, "inconclusivo"],
  ])) {
    it(`HTTP ${status} é ${esperado}`, () => {
      assert.equal(classificarStatus(status), esperado);
    });
  }
});

describe("paginaCitaSeletor", () => {
  it("acha o seletor no nome do registro, em qualquer caixa", () => {
    assert.equal(paginaCitaSeletor("Host: selector1._domainkey", "selector1"), true);
    assert.equal(paginaCitaSeletor("Host: SELECTOR1._DomainKey", "selector1"), true);
  });

  it("aceita a barra invertida do Markdown", () => {
    assert.equal(paginaCitaSeletor("protonmail.\\_domainkey", "protonmail"), true);
  });

  it("não confunde um seletor com o fim de outro", () => {
    assert.equal(paginaCitaSeletor("xs1._domainkey", "s1"), false);
    assert.equal(paginaCitaSeletor("protonmail2._domainkey", "protonmail"), false);
    assert.equal(paginaCitaSeletor("protonmail2._domainkey", "protonmail2"), true);
  });

  it("não acha o seletor só pelo nome solto, sem o `_domainkey`", () => {
    assert.equal(paginaCitaSeletor("o seletor google é o padrão", "google"), false);
  });

  it("trata o seletor como texto, não como expressão regular", () => {
    assert.equal(paginaCitaSeletor("axb._domainkey", "a.b"), false);
    assert.equal(paginaCitaSeletor("a.b._domainkey", "a.b"), true);
  });
});

describe("estaVelha", () => {
  const agora = new Date("2027-11-01T00:00:00Z");

  it("é velha depois de um ano", () => {
    assert.equal(estaVelha("2026-10-31", agora), true);
  });

  it("não é velha dentro de um ano", () => {
    assert.equal(estaVelha("2026-11-02", agora), false);
    assert.equal(estaVelha("2027-10-31", agora), false);
  });
});

// ---------------------------------------------------------------------------
// CONFERÊNCIA
// ---------------------------------------------------------------------------

describe("conferirTudo", () => {
  const agora = new Date("2026-11-01T00:00:00Z");

  it("dá ok para tudo quando as páginas abrem e citam os seletores", async () => {
    const { buscar } = criarBuscar();
    const resultado = await conferirTudo({ buscar, agora });

    assert.equal(resultado.linhas.length, SELETORES_COMUNS.length + ORIENTACOES.length);
    assert.ok(resultado.linhas.every((linha) => linha.veredito === "ok"));
    assert.deepEqual(resultado.avisos, []);
  });

  it("abre cada endereço uma vez só", async () => {
    const { buscar, pedidos } = criarBuscar();
    await conferirTudo({ buscar, agora });

    const distintos = new Set([
      ...SELETORES_COMUNS.map((item) => item.documentacao),
      ...ORIENTACOES.map((item) => item.documentacao),
    ]);
    assert.equal(pedidos.length, distintos.size);
    assert.equal(new Set(pedidos).size, pedidos.length);
  });

  it("dá falha para o link quebrado, em todos os seletores que o usam", async () => {
    const quebrado = SELETORES_COMUNS[3]?.documentacao ?? "";
    const { buscar } = criarBuscar({ [quebrado]: 404 });
    const resultado = await conferirTudo({ buscar, agora });

    const falhos = resultado.linhas.filter((linha) => linha.veredito === "falha");
    assert.deepEqual(
      falhos.map((linha) => linha.url),
      SELETORES_COMUNS.filter((item) => item.documentacao === quebrado).map(() => quebrado),
    );
    assert.ok(falhos.length >= 1);
  });

  it("dá falha para a página que abriu mas não cita mais o seletor", async () => {
    const alvo = SELETORES_COMUNS.find((item) => item.seletor === "resend");
    assert.ok(alvo);
    const { buscar } = criarBuscar({}, { [alvo.documentacao]: "página sem o nome do registro" });
    const resultado = await conferirTudo({ buscar, agora });

    assert.equal(vereditoDe(resultado, "resend"), "falha");
    assert.equal(vereditoDe(resultado, "google"), "ok");
  });

  it("dá inconclusivo, não falha, quando o site barra o robô ou está fora do ar", async () => {
    const [primeiro, segundo] = [SELETORES_COMUNS[0], ORIENTACOES[0]];
    assert.ok(primeiro && segundo);
    const { buscar } = criarBuscar({ [primeiro.documentacao]: 403, [segundo.documentacao]: 503 });
    const resultado = await conferirTudo({ buscar, agora });

    assert.equal(vereditoDe(resultado, primeiro.seletor), "inconclusivo");
    assert.equal(vereditoDe(resultado, segundo.provedor), "inconclusivo");
    assert.equal(resultado.linhas.filter((linha) => linha.veredito === "falha").length, 0);
  });

  it("dá falha para erro de rede e inconclusivo para tempo esgotado", async () => {
    const [primeiro, segundo] = [SELETORES_COMUNS[0], ORIENTACOES[0]];
    assert.ok(primeiro && segundo);
    const tempo = new Error("demorou");
    tempo.name = "TimeoutError";
    const { buscar } = criarBuscar({
      [primeiro.documentacao]: new TypeError("fetch failed"),
      [segundo.documentacao]: tempo,
    });
    const resultado = await conferirTudo({ buscar, agora });

    assert.equal(vereditoDe(resultado, primeiro.seletor), "falha");
    assert.equal(vereditoDe(resultado, segundo.provedor), "inconclusivo");
  });

  it("avisa o item cuja data de conferência passou de um ano", async () => {
    const { buscar } = criarBuscar();
    const resultado = await conferirTudo({ buscar, agora: new Date("2028-01-01T00:00:00Z") });

    assert.equal(resultado.avisos.length, SELETORES_COMUNS.length + ORIENTACOES.length);
    assert.match(resultado.avisos[0] ?? "", /conferido em 2026-10-31/);
  });
});
