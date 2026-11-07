/**
 * @file Testes de `normalizarDominio`, a porta de entrada de tudo o que o visitante digita.
 *
 * Duas famílias de caso: o que as pessoas colam de verdade (URL, e-mail, maiúsculas, ponto
 * final, acento) tem que virar um domínio limpo; o que não é domínio (IP, porta, `localhost`,
 * rótulo malformado) tem que ser recusado com uma explicação.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizarDominio } from "../public/js/dominio.js";

// ---------------------------------------------------------------------------
// ENTRADAS ACEITAS
// ---------------------------------------------------------------------------

describe("normalizarDominio: entradas aceitas", () => {
  /** @type {Array<[string, string]>} Entrada digitada e o domínio esperado. */
  const casos = [
    ["exemplo.com.br", "exemplo.com.br"],
    ["  Exemplo.COM.br  ", "exemplo.com.br"],
    ["https://exemplo.com.br/pagina?x=1#topo", "exemplo.com.br"],
    ["HTTP://www.exemplo.com.br", "www.exemplo.com.br"],
    ["contato@exemplo.com.br", "exemplo.com.br"],
    ["exemplo.com.br.", "exemplo.com.br"],
    ["sub.dominio.exemplo.com.br", "sub.dominio.exemplo.com.br"],
    ["bücher.de", "xn--bcher-kva.de"],
    ["a-b.example", "a-b.example"],
  ];

  for (const [entrada, esperado] of casos) {
    it(`"${entrada}" vira "${esperado}"`, () => {
      assert.deepEqual(normalizarDominio(entrada), { ok: true, dominio: esperado });
    });
  }
});

// ---------------------------------------------------------------------------
// ENTRADAS RECUSADAS
// ---------------------------------------------------------------------------

describe("normalizarDominio: entradas recusadas", () => {
  /** @type {Array<[string, string]>} Entrada digitada e o código da recusa. */
  const casos = [
    ["", "dominio-vazio"],
    ["   ", "dominio-vazio"],
    ["https://", "dominio-vazio"],
    ["localhost", "dominio-incompleto"],
    ["exemplo", "dominio-incompleto"],
    ["192.168.0.1", "dominio-e-ip"],
    ["0x7f.1", "dominio-e-ip"],
    ["exemplo.com:8080", "dominio-com-porta-ou-ipv6"],
    ["[::1]", "dominio-com-porta-ou-ipv6"],
    ["exem plo.com", "dominio-invalido"],
    ["exemplo_.com", "dominio-caractere-invalido"],
    ["-exemplo.com", "dominio-caractere-invalido"],
    ["exemplo-.com", "dominio-caractere-invalido"],
    ["exemplo..com", "dominio-caractere-invalido"],
    [`${"a".repeat(64)}.com`, "dominio-parte-comprida-demais"],
    [`${"a.".repeat(130)}com`, "dominio-comprido-demais"],
  ];

  for (const [entrada, codigo] of casos) {
    it(`recusa "${entrada.slice(0, 30)}"`, () => {
      assert.deepEqual(normalizarDominio(entrada), { ok: false, motivo: codigo });
    });
  }
});
