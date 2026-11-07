/**
 * @file Testes da descoberta e do compartilhamento: `canonical`, `robots.txt`, `sitemap.xml` (RF-09
 * da spec 007; ADR-2 e ADR-8) e o cartão que a rede social monta (`og:*`, `twitter:card`, imagem
 * e ícone de tela inicial).
 *
 * O endereço público tem uma fonte só, a rota do `wrangler.json`. `public/` é estático e não
 * pode lê-lo, então os arquivos repetem o texto e estes testes fazem a ligação.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// APOIO
// ---------------------------------------------------------------------------

/**
 * @param {string} caminho - Caminho relativo à raiz do repositório.
 * @returns {Promise<string>} O conteúdo do arquivo.
 */
const ler = (caminho) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8");

/** @returns {Promise<string>} O endereço público, com `https://` e a barra final. */
const enderecoDaRota = async () => {
  const { routes } = JSON.parse(await ler("wrangler.json"));
  return `https://${routes[0].pattern}/`;
};

// ---------------------------------------------------------------------------
// TESTES
// ---------------------------------------------------------------------------

describe("canonical", () => {
  it("o index.html aponta para o endereço da rota, sem ?dominio=", async () => {
    const html = await ler("public/index.html");
    const achados = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"/g)];
    assert.equal(achados.length, 1);
    assert.equal(achados[0]?.[1], await enderecoDaRota());
  });

  it("a 404.html não tem canonical", async () => {
    assert.doesNotMatch(await ler("public/404.html"), /rel="canonical"/);
  });
});

describe("robots.txt", () => {
  it("libera tudo e aponta para o sitemap do endereço da rota", async () => {
    const linhas = (await ler("public/robots.txt")).split("\n").map((l) => l.trim());
    assert.ok(linhas.includes("User-agent: *"));
    assert.ok(linhas.includes("Allow: /"));
    assert.ok(linhas.includes(`Sitemap: ${await enderecoDaRota()}sitemap.xml`));
  });
});

describe("sitemap.xml", () => {
  it("é um sitemap bem formado com uma URL só, a da página inicial, sem lastmod", async () => {
    const xml = await ler("public/sitemap.xml");
    assert.match(
      xml,
      /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
    );
    assert.match(xml, /<\/urlset>\s*$/);
    assert.equal(xml.match(/<url>/g)?.length, 1);
    assert.equal(xml.match(/<\/url>/g)?.length, 1);
    assert.deepEqual(
      [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]),
      [await enderecoDaRota()],
    );
    assert.doesNotMatch(xml, /lastmod/);
  });
});

// ---------------------------------------------------------------------------
// COMPARTILHAMENTO
// ---------------------------------------------------------------------------

// O robô da rede social lê só o HTML: a imagem tem de existir, ter o tamanho que os cartões
// pedem e caber no limite de 1 MB do GitHub (a mesma imagem serve aos dois).
const LIMITE_BYTES_IMAGEM = 1024 * 1024;

/**
 * Lê o conteúdo de uma `<meta>` pelo atributo que a identifica.
 *
 * @param {string} html - O HTML da página.
 * @param {"property" | "name"} atributo - Como a `<meta>` se identifica.
 * @param {string} chave - O valor desse atributo, como `og:url`.
 * @returns {string[]} Os `content` de todas as `<meta>` com essa chave (um só, se estiver certo).
 */
const metas = (html, atributo, chave) =>
  [...html.matchAll(new RegExp(`<meta\\s+${atributo}="${chave}"\\s+content="([^"]*)"`, "g"))].map(
    (m) => m[1] ?? "",
  );

/**
 * Confere que um arquivo é um PNG do tamanho dado.
 *
 * @param {string} caminho - Caminho relativo à raiz do repositório.
 * @param {number} largura - Largura esperada, em pixels.
 * @param {number} altura - Altura esperada, em pixels.
 * @returns {Promise<Buffer>} Os bytes do arquivo, para quem quiser conferir mais.
 */
const conferirPng = async (caminho, largura, altura) => {
  const png = await readFile(new URL(`../${caminho}`, import.meta.url));
  // Assinatura do PNG (8 bytes) e, no chunk IHDR, largura e altura em 4 bytes cada.
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${caminho} não é PNG`);
  assert.equal(png.readUInt32BE(16), largura, `${caminho}: largura`);
  assert.equal(png.readUInt32BE(20), altura, `${caminho}: altura`);
  return png;
};

describe("cartão de compartilhamento", () => {
  it("og:url é o endereço da rota, sem ?dominio=, e og:image fica na mesma origem", async () => {
    const html = await ler("public/index.html");
    const endereco = await enderecoDaRota();

    assert.deepEqual(metas(html, "property", "og:url"), [endereco]);
    assert.deepEqual(metas(html, "property", "og:image"), [`${endereco}social-pt.png`]);
  });

  it("tem tipo, nome do site, título, descrição, idioma e texto alternativo da imagem", async () => {
    const html = await ler("public/index.html");

    assert.deepEqual(metas(html, "property", "og:type"), ["website"]);
    assert.deepEqual(metas(html, "property", "og:locale"), ["pt_BR"]);
    assert.deepEqual(metas(html, "name", "twitter:card"), ["summary_large_image"]);
    for (const chave of ["og:site_name", "og:title", "og:description", "og:image:alt"]) {
      const valores = metas(html, "property", chave);
      assert.equal(valores.length, 1, chave);
      assert.notEqual(valores[0], "", chave);
    }
  });

  it("og:title e og:description repetem o <title> e a description da página", async () => {
    const html = await ler("public/index.html");
    const titulo = html.match(/<title>([^<]+)<\/title>/)?.[1];

    assert.deepEqual(metas(html, "property", "og:title"), [titulo]);
    assert.deepEqual(metas(html, "property", "og:description"), metas(html, "name", "description"));
  });

  it("a imagem social é um PNG 1280 x 640, dentro do limite, igual à do repositório", async () => {
    const png = await conferirPng("public/social-pt.png", 1280, 640);
    const doRepositorio = await readFile(
      new URL("../docs/images/dmarc-facil-dmarc-checker-social-preview.png", import.meta.url),
    );

    assert.ok(png.length <= LIMITE_BYTES_IMAGEM, `${png.length} bytes passa de 1 MB`);
    assert.ok(png.equals(doRepositorio), "public/social-pt.png difere da imagem de docs/images/");
  });

  it("a 404 não tem og:* nem twitter:card", async () => {
    const html = await ler("public/404.html");

    assert.doesNotMatch(html, /property="og:/);
    assert.doesNotMatch(html, /name="twitter:/);
  });
});

describe("ícone de tela inicial", () => {
  it("o index aponta para um PNG 180 x 180 que existe", async () => {
    const html = await ler("public/index.html");
    const alvos = [...html.matchAll(/<link\s+rel="apple-touch-icon"\s+href="([^"]*)"/g)];

    assert.equal(alvos.length, 1);
    assert.equal(alvos[0]?.[1], "/apple-touch-icon.png");
    await conferirPng("public/apple-touch-icon.png", 180, 180);
    assert.ok((await stat(new URL("../public/apple-touch-icon.png", import.meta.url))).size > 0);
  });
});
