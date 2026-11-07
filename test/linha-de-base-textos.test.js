/**
 * @file Linha de base dos textos: uma troca de catálogo ou de assinatura não pode mudar uma
 * frase da página em português sem que o diff mostre (ADR-12 da spec 008).
 *
 * Compara com `ajudas/linha-de-base-pt.json` tudo o que o domínio sintético mostra (selos,
 * degraus, achados, falhas, anúncios) e a lista das frases do catálogo. Mudou um texto de
 * propósito: regrave o JSON no mesmo commit, e a revisão vê a frase nova no diff.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { montarLinhaDeBase } from "./ajudas/linha-de-base.js";

describe("linha de base dos textos em português", () => {
  it("a saída de apresentação do domínio sintético é a gravada", async () => {
    const gravada = JSON.parse(
      await readFile(new URL("ajudas/linha-de-base-pt.json", import.meta.url), "utf8"),
    );

    // Passa por JSON para comparar o que o JSON guarda (`undefined` some, como na gravação).
    assert.deepEqual(JSON.parse(JSON.stringify(await montarLinhaDeBase())), gravada);
  });
});
