/**
 * @file Testes das imagens sociais (a do GitHub e a de `og:image`), em português e em inglês: o
 * PNG tem o tamanho que o GitHub pede, a fonte do PNG usa o mesmo logo do SVG oficial, os textos
 * da escada são os do catálogo do idioma e a cópia de `public/` é idêntica à de `docs/images/`.
 *
 * O GitHub recomenda 1280 x 640 e aceita até 1 MB. O PNG é gerado do HTML ao lado dele pelo
 * Chrome (o comando está no cabeçalho do HTML); o teste não gera nada, só confere o que está
 * versionado, para um PNG trocado por engano, um logo redesenhado à mão ou um texto que saiu do
 * catálogo não passarem.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { describe, it } from "node:test";

import { catalogos } from "./ajudas/textos.js";

// ---------------------------------------------------------------------------
// ARQUIVOS
// ---------------------------------------------------------------------------

// Relativo a este arquivo (e não ao diretório atual), para o teste rodar de qualquer pasta.
const CAMINHO_LOGO = new URL("../docs/images/dmarc-facil-dmarc-checker-logo.svg", import.meta.url);

// Uma imagem por idioma: a fonte HTML e o PNG de `docs/images/`, e a cópia que a página serve.
const IMAGENS = /** @type {const} */ ([
  {
    idioma: "pt",
    png: "../docs/images/dmarc-facil-dmarc-checker-social-preview.png",
    html: "../docs/images/dmarc-facil-dmarc-checker-social-preview.html",
    copia: "../public/social-pt.png",
  },
  {
    idioma: "en",
    png: "../docs/images/dmarc-facil-dmarc-checker-social-preview-en.png",
    html: "../docs/images/dmarc-facil-dmarc-checker-social-preview-en.html",
    copia: "../public/social-en.png",
  },
]);

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

/**
 * @param {string} html - O HTML da imagem.
 * @returns {string} O texto visível dele, numa linha só, sem espaço repetido.
 */
const textoVisivel = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// TESTES
// ---------------------------------------------------------------------------

for (const { idioma, png, html, copia } of IMAGENS) {
  const CAMINHO_PNG = new URL(png, import.meta.url);
  const CAMINHO_HTML = new URL(html, import.meta.url);

  describe(`imagem social (${idioma})`, () => {
    it("é um PNG de 1280 x 640", async () => {
      const bytes = await readFile(CAMINHO_PNG);

      // Assinatura do PNG (8 bytes) e, no chunk IHDR, largura e altura em 4 bytes cada.
      assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(bytes.readUInt32BE(16), 1280);
      assert.equal(bytes.readUInt32BE(20), 640);
    });

    it("pesa menos de 1 MB", async () => {
      const { size } = await stat(CAMINHO_PNG);

      assert.ok(size < LIMITE_BYTES, `o PNG tem ${size} bytes`);
    });

    it("usa o mesmo caminho do logo oficial", async () => {
      const oficial = await lerCaminhoD(CAMINHO_LOGO);
      const copiaDoLogo = await lerCaminhoD(CAMINHO_HTML);

      assert.ok(oficial);
      assert.equal(copiaDoLogo, oficial);
    });

    it("a escada da imagem tem os títulos e os resumos do catálogo do idioma", async () => {
      const texto = textoVisivel(await readFile(CAMINHO_HTML, "utf8"));
      const { degraus, etiquetas, escada } = catalogos[idioma].interface;

      assert.ok(texto.includes(`${degraus.none.titulo}`), "p=none");
      for (const degrau of [degraus.none, degraus.quarantine, degraus.reject]) {
        assert.ok(texto.includes(degrau.titulo), degrau.titulo);
        assert.ok(texto.includes(degrau.resumo), degrau.resumo);
      }
      assert.ok(texto.includes(etiquetas.atual.texto), etiquetas.atual.texto);
      assert.ok(texto.includes(etiquetas.proximo.texto), etiquetas.proximo.texto);
      assert.ok(texto.includes(catalogos[idioma].interface.resultado.escada.texto));
      assert.ok(escada.final.texto.length > 0);
    });

    it("a cópia de public/ é idêntica, byte a byte, à de docs/images/", async () => {
      const original = await readFile(CAMINHO_PNG);
      const servida = await readFile(new URL(copia, import.meta.url));

      assert.ok(servida.equals(original), `${copia} difere de ${png}`);
    });
  });
}
