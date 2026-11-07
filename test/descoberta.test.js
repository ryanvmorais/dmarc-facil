/**
 * @file Testes da descoberta e do compartilhamento: `canonical`, `hreflang`, `robots.txt`,
 * `sitemap.xml` (RF-09 da spec 007, ADR-2 e ADR-8; RF-06 da spec 008, ADR-7) e o cartão que a rede
 * social monta (`og:*`, `twitter:card`, imagem e ícone de tela inicial), nos dois idiomas.
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

// As duas páginas do site, com o que muda de uma para a outra. O endereço de cada uma sai do
// endereço da rota.
const PAGINAS = /** @type {const} */ ([
  {
    arquivo: "public/index.html",
    idioma: "pt-BR",
    caminho: "",
    locale: "pt_BR",
    imagem: "social-pt.png",
    docs: "dmarc-facil-dmarc-spf-dkim-checker-social-preview.png",
  },
  {
    arquivo: "public/en/index.html",
    idioma: "en",
    caminho: "en/",
    locale: "en_US",
    imagem: "social-en.png",
    docs: "dmarc-facil-dmarc-spf-dkim-checker-social-preview-en.png",
  },
]);

/**
 * @param {string} html - O HTML de uma página.
 * @returns {Array<[string, string]>} Os `hreflang` e `href` dos `<link rel="alternate">`.
 */
const alternativas = (html) =>
  [...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"/g)].map((m) => [
    m[1] ?? "",
    m[2] ?? "",
  ]);

// ---------------------------------------------------------------------------
// TESTES
// ---------------------------------------------------------------------------

describe("canonical", () => {
  for (const pagina of PAGINAS) {
    it(`${pagina.arquivo} aponta para si mesma, a partir do endereço da rota, sem ?dominio=`, async () => {
      const html = await ler(pagina.arquivo);
      const achados = [...html.matchAll(/<link\s+rel="canonical"\s+href="([^"]*)"/g)];
      assert.equal(achados.length, 1);
      assert.equal(achados[0]?.[1], `${await enderecoDaRota()}${pagina.caminho}`);
    });
  }

  it("as 404 não têm canonical", async () => {
    for (const arquivo of ["public/404.html", "public/en/404.html"]) {
      assert.doesNotMatch(await ler(arquivo), /rel="canonical"/, arquivo);
    }
  });
});

describe("hreflang", () => {
  it("cada página cita as duas e a si mesma, e o x-default é a portuguesa", async () => {
    const endereco = await enderecoDaRota();
    const esperado = [
      ["pt-BR", endereco],
      ["en", `${endereco}en/`],
      ["x-default", endereco],
    ];

    for (const pagina of PAGINAS) {
      assert.deepEqual(alternativas(await ler(pagina.arquivo)), esperado, pagina.arquivo);
    }
  });

  it("é recíproco: o que uma página cita para a outra, a outra cita de volta", async () => {
    const [pt, en] = await Promise.all(
      PAGINAS.map(async (p) => alternativas(await ler(p.arquivo))),
    );

    assert.deepEqual(pt, en);
    for (const pagina of PAGINAS) {
      assert.ok(
        (pt ?? []).some(
          ([idioma, href]) => idioma === pagina.idioma && href.endsWith(`/${pagina.caminho}`),
        ),
        `${pagina.arquivo} não aparece na lista que ela mesma cita`,
      );
    }
  });

  it("as 404 não têm hreflang", async () => {
    for (const arquivo of ["public/404.html", "public/en/404.html"]) {
      assert.doesNotMatch(await ler(arquivo), /hreflang=/, arquivo);
    }
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
  it("é um sitemap bem formado com exatamente as duas páginas, sem lastmod", async () => {
    const xml = await ler("public/sitemap.xml");
    const endereco = await enderecoDaRota();
    assert.match(
      xml,
      /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml">/,
    );
    assert.match(xml, /<\/urlset>\s*$/);
    assert.equal(xml.match(/<url>/g)?.length, 2);
    assert.equal(xml.match(/<\/url>/g)?.length, 2);
    assert.deepEqual(
      [...xml.matchAll(/<url>\s*<loc>([^<]*)<\/loc>/g)].map((m) => m[1]),
      [endereco, `${endereco}en/`],
    );
    assert.doesNotMatch(xml, /lastmod/);
  });

  it("cada URL lista as duas versões e a si mesma, como o hreflang das páginas", async () => {
    const xml = await ler("public/sitemap.xml");
    const endereco = await enderecoDaRota();
    const blocos = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);
    const esperado = [
      ["pt-BR", endereco],
      ["en", `${endereco}en/`],
    ];

    assert.equal(blocos.length, 2);
    for (const bloco of blocos) {
      assert.deepEqual(
        [
          ...bloco.matchAll(
            /<xhtml:link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"\s*\/>/g,
          ),
        ]
          .map((m) => [m[1], m[2]])
          .filter(([idioma]) => idioma !== "x-default"),
        esperado,
      );
    }
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
  for (const pagina of PAGINAS) {
    describe(pagina.arquivo, () => {
      it("og:url é o endereço da página, sem ?dominio=, e og:image fica na mesma origem", async () => {
        const html = await ler(pagina.arquivo);
        const endereco = await enderecoDaRota();

        assert.deepEqual(metas(html, "property", "og:url"), [`${endereco}${pagina.caminho}`]);
        assert.deepEqual(metas(html, "property", "og:image"), [`${endereco}${pagina.imagem}`]);
      });

      it("tem tipo, nome do site, título, descrição, idioma e texto alternativo da imagem", async () => {
        const html = await ler(pagina.arquivo);

        assert.deepEqual(metas(html, "property", "og:type"), ["website"]);
        assert.deepEqual(metas(html, "property", "og:locale"), [pagina.locale]);
        assert.deepEqual(metas(html, "name", "twitter:card"), ["summary_large_image"]);
        for (const chave of ["og:site_name", "og:title", "og:description", "og:image:alt"]) {
          const valores = metas(html, "property", chave);
          assert.equal(valores.length, 1, chave);
          assert.notEqual(valores[0], "", chave);
        }
      });

      it("og:title e og:description repetem o <title> e a description da página", async () => {
        const html = await ler(pagina.arquivo);
        const titulo = html.match(/<title>([^<]+)<\/title>/)?.[1];

        assert.deepEqual(metas(html, "property", "og:title"), [titulo]);
        assert.deepEqual(
          metas(html, "property", "og:description"),
          metas(html, "name", "description"),
        );
      });

      it("a imagem social é um PNG 1280 x 640, dentro do limite, igual à do repositório", async () => {
        const png = await conferirPng(`public/${pagina.imagem}`, 1280, 640);
        const doRepositorio = await readFile(
          new URL(`../docs/images/${pagina.docs}`, import.meta.url),
        );

        assert.ok(png.length <= LIMITE_BYTES_IMAGEM, `${png.length} bytes passa de 1 MB`);
        assert.ok(png.equals(doRepositorio), `public/${pagina.imagem} difere de docs/images/`);
      });
    });
  }

  it("o título e a descrição em inglês não são os do português", async () => {
    const [pt, en] = await Promise.all(PAGINAS.map((p) => ler(p.arquivo)));

    assert.notEqual(
      pt?.match(/<title>([^<]+)<\/title>/)?.[1],
      en?.match(/<title>([^<]+)<\/title>/)?.[1],
    );
    assert.notDeepEqual(
      metas(pt ?? "", "name", "description"),
      metas(en ?? "", "name", "description"),
    );
  });

  it("as 404 não têm og:* nem twitter:card", async () => {
    for (const arquivo of ["public/404.html", "public/en/404.html"]) {
      const html = await ler(arquivo);

      assert.doesNotMatch(html, /property="og:/, arquivo);
      assert.doesNotMatch(html, /name="twitter:/, arquivo);
    }
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
