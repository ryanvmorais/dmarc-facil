/**
 * @file Testes da imagem social do GitHub: o PNG tem o tamanho que o GitHub pede e a fonte
 * do PNG usa o mesmo logo do SVG oficial.
 *
 * O GitHub recomenda 1280 x 640 e aceita até 1 MB. O PNG é gerado do HTML ao lado dele pelo
 * Chrome (o comando está no cabeçalho do HTML); o teste não gera nada, só confere o que está
 * versionado, para um PNG trocado por engano ou um logo redesenhado à mão não passarem.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// ARQUIVOS
// ---------------------------------------------------------------------------

// Relativo a este arquivo (e não ao diretório atual), para o teste rodar de qualquer pasta.
const CAMINHO_PNG = new URL(
  "../docs/images/dmarc-facil-dmarc-checker-social-preview.png",
  import.meta.url,
);
const CAMINHO_HTML = new URL(
  "../docs/images/dmarc-facil-dmarc-checker-social-preview.html",
  import.meta.url,
);
const CAMINHO_LOGO = new URL("../docs/images/dmarc-facil-dmarc-checker-logo.svg", import.meta.url);

// O limite de envio do GitHub para a imagem social.
const LIMITE_BYTES = 1024 * 1024;

// ---------------------------------------------------------------------------
// AJUDAS
// ---------------------------------------------------------------------------

/**
 * Lê o caminho `d` do único `<path>` de um arquivo.
 *
 * @param {URL} caminho - Arquivo SVG ou HTML com um `<path ... d="...">`.
 * @returns {Promise<string | undefined>} O valor de `d`, ou `undefined` se não houver.
 */
const lerCaminhoD = async (caminho) => {
  const texto = await readFile(caminho, "utf8");
  return texto.match(/<path\b[^>]*?\sd="([^"]+)"/s)?.[1];
};

// ---------------------------------------------------------------------------
// TESTES
// ---------------------------------------------------------------------------

describe("imagem social", () => {
  it("é um PNG de 1280 x 640", async () => {
    const png = await readFile(CAMINHO_PNG);

    // Assinatura do PNG (8 bytes) e, no chunk IHDR, largura e altura em 4 bytes cada.
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 640);
  });

  it("pesa menos de 1 MB", async () => {
    const { size } = await stat(CAMINHO_PNG);

    assert.ok(size < LIMITE_BYTES, `o PNG tem ${size} bytes`);
  });

  it("usa o mesmo caminho do logo oficial", async () => {
    const oficial = await lerCaminhoD(CAMINHO_LOGO);
    const copia = await lerCaminhoD(CAMINHO_HTML);

    assert.ok(oficial);
    assert.equal(copia, oficial);
  });
});
