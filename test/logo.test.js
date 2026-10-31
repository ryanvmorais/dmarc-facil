/**
 * @file Testes do logo oficial: o SVG tem de seguir a construção da marca.
 *
 * O desenho vive num `<path>` só, com `fill-rule="evenodd"` (a forma externa, o olho e a
 * pupila são recortes). Sem `mask` nem `clipPath`: as CSPs e os leitores de e-mail não os
 * aceitam, e `evenodd` funciona em todo lugar. Quando o logo ganhar cópias (favicon, imagem
 * social), o caminho `d` de todas precisa ser idêntico ao do arquivo oficial; o teste das
 * cópias entra aqui, junto da primeira cópia.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// ARQUIVO OFICIAL
// ---------------------------------------------------------------------------

// Relativo a este arquivo (e não ao diretório atual), para o teste rodar de qualquer pasta.
const CAMINHO_LOGO = new URL("../docs/images/dmarc-facil-dmarc-checker-logo.svg", import.meta.url);

describe("logo oficial", () => {
  it("usa um único <path> com fill-rule evenodd", async () => {
    const svg = await readFile(CAMINHO_LOGO, "utf8");

    assert.equal(svg.match(/<path\b/g)?.length, 1);
    assert.match(svg, /fill-rule="evenodd"/);
  });

  it("não usa mask, clipPath nem script", async () => {
    const svg = await readFile(CAMINHO_LOGO, "utf8");

    assert.doesNotMatch(svg, /<(mask|clipPath|script|style)\b/i);
  });

  it("tem a cor da marca e o texto alternativo", async () => {
    const svg = await readFile(CAMINHO_LOGO, "utf8");

    assert.match(svg, /fill="#2563eb"/);
    assert.match(svg, /role="img"/);
    assert.match(svg, /aria-label="[^"]+"/);
    assert.match(svg, /<title>DMARC Fácil<\/title>/);
  });
});
