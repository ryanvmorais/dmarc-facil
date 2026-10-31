/**
 * @file Testes de `lerChaveRsa` e `decodificarChave`, que medem a chave pública de um registro
 * DKIM.
 *
 * Nenhuma chave real entra aqui: `ajudas/chave-sintetica.js` monta um `SubjectPublicKeyInfo` de
 * RSA com módulo de N bits (bytes fabricados) e o expoente 65537. Os casos recusados quebram uma
 * peça de cada vez, e o último grupo alimenta a leitura com toda truncagem e toda alteração de
 * byte da chave certa para provar que nenhuma entrada lança.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodificarChave, lerChaveRsa, MAXIMO_BASE64 } from "../public/js/chave-rsa.js";
import { der, emBase64, inteiro, modulo, OID_RSA, spki } from "./ajudas/chave-sintetica.js";

// ---------------------------------------------------------------------------
// TAMANHOS
// ---------------------------------------------------------------------------

describe("lerChaveRsa: tamanho do módulo", () => {
  for (const bits of [512, 1024, 1536, 2048, 3072, 4096]) {
    it(`mede uma chave de ${bits} bits`, () => {
      assert.deepEqual(lerChaveRsa(emBase64(spki({ modulo: modulo(bits) }))), { ok: true, bits });
    });
  }

  it("mede um módulo que não é múltiplo de 8 bits", () => {
    assert.deepEqual(lerChaveRsa(emBase64(spki({ modulo: modulo(2047) }))), {
      ok: true,
      bits: 2047,
    });
  });

  it("conta os bits do primeiro byte nos dois extremos", () => {
    // 128 bytes: o primeiro com só o bit mais baixo ligado, e com o bit mais alto ligado.
    assert.deepEqual(lerChaveRsa(emBase64(spki({ modulo: modulo(1024, 0x01) }))), {
      ok: true,
      bits: 1017,
    });
    assert.deepEqual(lerChaveRsa(emBase64(spki({ modulo: modulo(1024, 0x80) }))), {
      ok: true,
      bits: 1024,
    });
    assert.deepEqual(lerChaveRsa(emBase64(spki({ modulo: modulo(1024, 0x7f) }))), {
      ok: true,
      bits: 1023,
    });
  });

  it("ignora zeros a mais na frente do módulo", () => {
    const comZeros = der(0x02, [0, 0, 0, ...modulo(1024)]);
    assert.deepEqual(lerChaveRsa(emBase64(spki({ moduloDer: comZeros }))), {
      ok: true,
      bits: 1024,
    });
  });

  it("lê comprimento curto, longo de um byte e longo de dois bytes", () => {
    // O OID tem comprimento curto; o módulo de 1024 bits tem 129 bytes (um byte de
    // comprimento longo); o envelope de 4096 bits passa de 255 (dois bytes).
    const pequena = spki({ modulo: modulo(1024) });
    const grande = spki({ modulo: modulo(4096) });
    assert.ok(pequena.includes(0x81));
    assert.ok(grande.includes(0x82));
    assert.deepEqual(lerChaveRsa(emBase64(pequena)), { ok: true, bits: 1024 });
    assert.deepEqual(lerChaveRsa(emBase64(grande)), { ok: true, bits: 4096 });
  });

  it("aceita o base64 quebrado em pedaços por espaços e quebras de linha", () => {
    const base64 = emBase64(spki({ modulo: modulo(2048) }));
    const quebrado = (base64.match(/.{1,64}/g) ?? []).join(" \n ");
    assert.deepEqual(lerChaveRsa(quebrado), { ok: true, bits: 2048 });
  });
});

// ---------------------------------------------------------------------------
// CHAVES RECUSADAS
// ---------------------------------------------------------------------------

describe("lerChaveRsa: chaves recusadas", () => {
  const recusada = { ok: false };

  /** @type {Array<[string, string]>} Descrição e o base64 recusado. */
  const casos = [
    ["vazio", ""],
    ["só espaços", "   \n "],
    ["base64 inválido", "!!!!"],
    ["base64 com caractere de URL", "a&b=c"],
    ["base64 com `=` no meio", "AAAA=AAA"],
    ["base64 com três `=`", "AAA==="],
    ["texto que não é DER", "bm90IGEga2V5"],
    ["acima do tamanho máximo", "A".repeat(MAXIMO_BASE64 + 1)],
    ["OID de outro algoritmo", emBase64(spki({ oid: [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01] }))],
    ["OID de RSA com um byte a menos", emBase64(spki({ oid: OID_RSA.slice(0, -1) }))],
    ["sem o NULL do algoritmo", emBase64(spki({ nulo: false }))],
    ["com bits sobrando no BIT STRING", emBase64(spki({ bitsSobrando: 1 }))],
    ["com bytes a mais no fim", emBase64(spki({ sobra: [0x00] }))],
    ["módulo negativo", emBase64(spki({ moduloDer: der(0x02, modulo(1024, 0x80)) }))],
    ["módulo só de zeros", emBase64(spki({ moduloDer: der(0x02, [0, 0, 0, 0]) }))],
    ["bytes a mais depois do expoente", emBase64(spki({ sobraNaChave: [0x00] }))],
    ["expoente que não é INTEGER", emBase64(spki({ expoente: der(0x04, [1, 0, 1]) }))],
    ["expoente vazio", emBase64(spki({ expoente: der(0x02, []) }))],
    ["base64 com resto impossível", "AAAAA"],
    ["módulo vazio", emBase64(spki({ moduloDer: der(0x02, []) }))],
    ["módulo que não é INTEGER", emBase64(spki({ moduloDer: der(0x04, modulo(1024, 0x40)) }))],
    [
      "RSAPublicKey cru (PKCS#1)",
      emBase64(der(0x30, [...inteiro(modulo(2048)), ...der(0x02, [1, 0, 1])])),
    ],
    ["comprimento de 3 bytes", emBase64([0x30, 0x83, 0x00, 0x01, 0x00, 0x30, 0x00])],
    ["comprimento indefinido", emBase64([0x30, 0x80, 0x00, 0x00])],
    ["sequência vazia", emBase64([0x30, 0x00])],
  ];

  for (const [descricao, base64] of casos) {
    it(`recusa ${descricao}`, () => {
      assert.deepEqual(lerChaveRsa(base64), recusada);
    });
  }

  it("recusa o que não é texto", () => {
    for (const entrada of [undefined, null, 42, {}, ["AAAA"]]) {
      assert.deepEqual(lerChaveRsa(/** @type {*} */ (entrada)), recusada);
    }
  });

  it("recusa um comprimento interno maior que o do pai", () => {
    const bytes = spki();
    // Depois da etiqueta do BIT STRING vêm 3 bytes de comprimento e o byte de bits sobrando; a
    // sequência interna começa em seguida, com comprimento longo de dois bytes.
    const posicao = bytes.indexOf(0x03) + 6;
    assert.equal(bytes[posicao - 1], 0x30);
    assert.equal(bytes[posicao], 0x82);
    bytes[posicao + 1] = 0xff;
    assert.deepEqual(lerChaveRsa(emBase64(bytes)), recusada);
  });
});

// ---------------------------------------------------------------------------
// ENTRADA HOSTIL
// ---------------------------------------------------------------------------

describe("lerChaveRsa: entrada hostil", () => {
  const valida = spki({ modulo: modulo(1024) });

  it("recusa toda truncagem da chave certa sem lançar", () => {
    for (let tamanho = 0; tamanho < valida.length; tamanho += 1) {
      assert.deepEqual(
        lerChaveRsa(emBase64(valida.slice(0, tamanho))),
        { ok: false },
        `${tamanho}`,
      );
    }
  });

  it("nunca lança ao alterar qualquer byte da chave certa", () => {
    for (let posicao = 0; posicao < valida.length; posicao += 1) {
      for (const valor of [0x00, 0x7f, 0x80, 0xff]) {
        const alterada = [...valida];
        alterada[posicao] = valor;
        const resultado = lerChaveRsa(emBase64(alterada));
        assert.equal(typeof resultado.ok, "boolean");
      }
    }
  });

  it("lê uma entrada grande em tempo curto", () => {
    const inicio = performance.now();
    lerChaveRsa("A".repeat(MAXIMO_BASE64));
    lerChaveRsa("A".repeat(100_000));
    assert.ok(performance.now() - inicio < 200);
  });
});

// ---------------------------------------------------------------------------
// DECODIFICAÇÃO
// ---------------------------------------------------------------------------

describe("decodificarChave", () => {
  it("devolve os bytes do base64, sem os espaços", () => {
    assert.deepEqual(decodificarChave(" AQID\nBA== "), Uint8Array.of(1, 2, 3, 4));
  });

  it("aceita os 32 bytes de uma chave Ed25519", () => {
    const bytes = Array.from({ length: 32 }, (_, i) => i);
    assert.equal(decodificarChave(emBase64(bytes))?.length, 32);
  });

  it("devolve `undefined` para o que não decodifica", () => {
    for (const entrada of ["", "   ", "!!!", "A".repeat(MAXIMO_BASE64 + 1), undefined, 7]) {
      assert.equal(decodificarChave(/** @type {*} */ (entrada)), undefined);
    }
  });
});
