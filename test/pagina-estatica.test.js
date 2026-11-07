/**
 * @file Testes de forma das páginas estáticas (RF-10, RF-13, RF-14 e RNF-03 da spec 006).
 *
 * Sem navegador: lê `public/` como texto e confere o que o contrato exige. A Content-Security-
 * Policy lista exatamente os resolvedores de `doh.js`; nenhum arquivo usa `style=` nem script de
 * fora; nenhum módulo guarda dado do visitante no navegador; a 404 não tem script e só usa
 * caminhos absolutos; o logo das páginas é o mesmo `<path>` do arquivo oficial. O comportamento
 * no navegador de verdade (foco, leitor de tela, largura) é conferido à mão e no Lighthouse CI.
 */

// @ts-check

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { RESOLVEDORES } from "../public/js/doh.js";

// ---------------------------------------------------------------------------
// APOIO
// ---------------------------------------------------------------------------

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));

// As quatro páginas: as duas em português e as duas em inglês (spec 008).
const PAGINAS = ["index.html", "404.html", "en/index.html", "en/404.html"];

/**
 * @param {string} caminho - Caminho relativo a `public/`.
 * @returns {Promise<string>} O conteúdo do arquivo.
 */
const ler = (caminho) => readFile(new URL(`../public/${caminho}`, import.meta.url), "utf8");

/**
 * Tira de um texto tudo o que está entre `abre` e `fecha`, sem regex: o comentário que não fecha
 * leva o resto do texto junto, como o navegador faz.
 *
 * @param {string} texto - O texto.
 * @param {string} abre - Como o trecho começa.
 * @param {string} fecha - Como o trecho termina.
 * @returns {string} O texto sem os trechos.
 */
const tirarTrechos = (texto, abre, fecha) => {
  let saida = "";
  let posicao = 0;
  for (;;) {
    const inicio = texto.indexOf(abre, posicao);
    if (inicio === -1) {
      return saida + texto.slice(posicao);
    }
    saida += texto.slice(posicao, inicio);
    const fim = texto.indexOf(fecha, inicio + abre.length);
    if (fim === -1) {
      return saida;
    }
    posicao = fim + fecha.length;
  }
};

/**
 * @param {string} texto - Conteúdo de um HTML ou de um CSS.
 * @returns {string} O mesmo sem os comentários, que podem citar `style=`, `<script>` ou `@import`.
 */
const semComentarios = (texto) => tirarTrechos(tirarTrechos(texto, "<!--", "-->"), "/*", "*/");

/**
 * @param {string} pasta - Pasta a percorrer.
 * @returns {Promise<string[]>} Os arquivos de texto (.html, .css, .js) abaixo dela.
 */
const arquivosDeTexto = async (pasta) => {
  const itens = await readdir(pasta, { withFileTypes: true });
  const lista = await Promise.all(
    itens.map(async (item) => {
      const caminho = `${pasta}${item.name}`;
      if (item.isDirectory()) {
        return arquivosDeTexto(`${caminho}/`);
      }
      return /\.(html|css|js)$/.test(item.name) ? [caminho] : [];
    }),
  );
  return lista.flat();
};

/**
 * @param {string} html - Conteúdo de um HTML.
 * @param {string} diretiva - Nome da diretiva da CSP.
 * @returns {string[] | null} Os valores da diretiva, ou ``null`` se ela não existe.
 */
const diretivaDaCsp = (html, diretiva) => {
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
  const achada = csp
    .split(";")
    .map((parte) => parte.trim().split(/\s+/))
    .find(([nome]) => nome === diretiva);
  return achada === undefined ? null : achada.slice(1);
};

// ---------------------------------------------------------------------------
// index.html
// ---------------------------------------------------------------------------

describe("index.html", () => {
  it("tem lang pt-BR, um único h1 e um único main", async () => {
    const html = semComentarios(await ler("index.html"));

    assert.match(html, /<html lang="pt-BR">/);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.equal(html.match(/<main\b/g)?.length, 1);
  });

  it("liga o rótulo ao campo do domínio", async () => {
    const html = await ler("index.html");

    assert.match(html, /<label[^>]*\bfor="dominio"/);
    assert.match(html, /<input[^>]*\bid="dominio"/);
  });

  it("junta o aviso de privacidade ao campo por aria-describedby", async () => {
    const html = await ler("index.html");

    assert.match(html, /aria-describedby="erro-dominio privacidade"/);
    assert.match(html, /id="privacidade"[\s\S]*?Cloudflare[\s\S]*?Google[\s\S]*?seu IP/);
  });

  it("tem a região aria-live, o resultado vazio e o aviso de noscript", async () => {
    const html = await ler("index.html");

    assert.match(html, /<p[^>]*id="anuncio"[^>]*role="status"[^>]*aria-live="polite"/);
    assert.match(html, /<div[^>]*id="resultado"[^>]*hidden/);
    assert.match(html, /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/);
  });

  it("o erro do domínio é anunciado por role alert e começa oculto", async () => {
    const html = await ler("index.html");

    assert.match(html, /<p[^>]*id="erro-dominio"[^>]*role="alert"[^>]*hidden/);
  });

  it("carrega o JavaScript como módulo próprio e o CSS do próprio site", async () => {
    const html = await ler("index.html");

    assert.match(html, /<script type="module" src="\/js\/entrada-pt\.js"><\/script>/);
    assert.match(html, /<link rel="stylesheet" href="\/css\/pagina\.css"/);
  });

  it("a entrada do idioma liga a página com o catálogo do mesmo idioma", async () => {
    const entrada = semComentarios(await ler("js/entrada-pt.js"));

    assert.match(entrada, /import \{ iniciarPagina \} from "\.\/pagina\.js";/);
    assert.match(entrada, /import \{ textos \} from "\.\/textos\/pt\/index\.js";/);
    assert.match(entrada, /iniciarPagina\(textos\);/);
  });

  it("tem título, descrição e ícone (SEO e Lighthouse)", async () => {
    const html = await ler("index.html");

    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta\s+name="description"/);
    assert.match(html, /<link rel="icon"/);
  });

  it("tem o apoio no HTML, dentro do main e fora do resultado, com um cartão por registro", async () => {
    const html = semComentarios(await ler("index.html"));
    const principal = html.match(/<main\b[\s\S]*<\/main>/)?.[0] ?? "";
    const apoio = principal.match(/<section class="apoio"[\s\S]*?<\/section>/)?.[0] ?? "";

    assert.match(apoio, /aria-labelledby="titulo-apoio"/);
    assert.match(apoio, /<h2 id="titulo-apoio"/);
    assert.deepEqual(
      [...apoio.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]),
      ["DMARC", "SPF", "DKIM"],
    );
    // O resultado é desenhado por pagina.js; o apoio não pode morar dentro dele.
    assert.ok(principal.indexOf('id="resultado"') < principal.indexOf('class="apoio"'));
    assert.doesNotMatch(
      principal.match(/<div[^>]*id="resultado"[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "",
      /apoio/,
    );
  });

  it("tem o rodapé fora do main, com nome, licença e os links do GitHub e do MailVigil", async () => {
    const html = semComentarios(await ler("index.html"));
    const rodape = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? "";
    const pagina = await ler("js/pagina.js");
    const mailvigil = pagina.match(/ENDERECO_MAILVIGIL = "([^"]+)"/)?.[1] ?? "";

    assert.ok(html.indexOf("</main>") < html.indexOf("<footer"));
    assert.match(rodape, /DMARC Fácil · Apache-2\.0/);
    assert.match(rodape, /href="https:\/\/github\.com\/ryanvmorais\/dmarc-facil">GitHub</);
    // O MailVigil do rodapé aponta para o mesmo lugar do cartão do resultado.
    assert.notEqual(mailvigil, "");
    assert.match(rodape, new RegExp(`href="${mailvigil}">MailVigil<`));
  });

  it("não repete a promessa de privacidade fora do aviso junto do botão", async () => {
    const html = semComentarios(await ler("index.html"));
    const foraDoAviso = html.replace(/<p id="privacidade"[\s\S]*?<\/p>/, "");

    assert.doesNotMatch(foraDoAviso, /não guarda|nenhum domínio/i);
  });
});

// ---------------------------------------------------------------------------
// CSP
// ---------------------------------------------------------------------------

describe("Content-Security-Policy", () => {
  it("vem logo depois do charset, antes de qualquer outra tag do head", async () => {
    for (const arquivo of PAGINAS) {
      const cabeca = semComentarios(await ler(arquivo)).split("<head>")[1] ?? "";
      const tags = cabeca.match(/<\/?(?:meta|link|script|title)\b[^>]*>/gi) ?? [];

      assert.match(tags[0] ?? "", /charset/, arquivo);
      assert.match(tags[1] ?? "", /Content-Security-Policy/, arquivo);
    }
  });

  it("o connect-src do index lista exatamente os hosts de RESOLVEDORES", async () => {
    const html = await ler("index.html");
    const hosts = RESOLVEDORES.map((resolvedor) => new URL(resolvedor.url).origin).sort();

    assert.deepEqual(diretivaDaCsp(html, "connect-src")?.sort(), hosts);
  });

  it("não usa unsafe-inline nem unsafe-eval em nenhuma das páginas", async () => {
    for (const arquivo of PAGINAS) {
      const html = await ler(arquivo);

      assert.doesNotMatch(html, /unsafe-(inline|eval)/, arquivo);
    }
  });

  it("o index só aceita script, estilo, imagem e fonte do próprio site", async () => {
    const html = await ler("index.html");

    assert.deepEqual(diretivaDaCsp(html, "default-src"), ["'none'"]);
    for (const diretiva of ["script-src", "style-src", "img-src", "font-src"]) {
      assert.deepEqual(diretivaDaCsp(html, diretiva), ["'self'"], diretiva);
    }
    assert.deepEqual(diretivaDaCsp(html, "base-uri"), ["'none'"]);
    assert.deepEqual(diretivaDaCsp(html, "form-action"), ["'none'"]);
  });

  it("a 404 não tem script-src nem connect-src", async () => {
    const html = await ler("404.html");

    assert.equal(diretivaDaCsp(html, "script-src"), null);
    assert.equal(diretivaDaCsp(html, "connect-src"), null);
  });
});

// ---------------------------------------------------------------------------
// public/ INTEIRO
// ---------------------------------------------------------------------------

describe("public/: nada de fora e nada inline", () => {
  it("nenhum HTML tem atributo style nem script inline ou de fora", async () => {
    for (const arquivo of PAGINAS) {
      const html = semComentarios(await ler(arquivo));

      assert.doesNotMatch(html, /<[^>]*\sstyle\s*=/i, `${arquivo} tem style=`);
      assert.doesNotMatch(html, /<style\b/i, `${arquivo} tem <style>`);
      for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi)) {
        assert.match(script[1] ?? "", /\bsrc="\/[^"/]/, `${arquivo}: script sem caminho local`);
        assert.equal((script[2] ?? "").trim(), "", `${arquivo}: script inline`);
      }
    }
  });

  it("nenhum atributo de evento on* nos HTML", async () => {
    for (const arquivo of PAGINAS) {
      assert.doesNotMatch(semComentarios(await ler(arquivo)), /<[^>]*\son[a-z]+\s*=/i, arquivo);
    }
  });

  it("nenhum recurso externo em HTML nem CSS (só os dois resolvedores, no JavaScript)", async () => {
    for (const arquivo of await arquivosDeTexto(PUBLIC)) {
      if (arquivo.endsWith(".js")) {
        continue;
      }
      const texto = semComentarios(await readFile(arquivo, "utf8"));

      assert.doesNotMatch(texto, /@import/, arquivo);
      assert.doesNotMatch(texto, /url\(\s*["']?(?:https?:)?\/\//, arquivo);
      // Âncora para fora (rodapé, MailVigil) é link que o visitante clica; o que o navegador
      // carrega sozinho (script, imagem, moldura, folha de estilo) nunca é de fora. O
      // `<link rel="canonical">` (spec 007, ADR-8) e os `rel="alternate" hreflang` (spec 008, ADR-7)
      // são endereço absoluto por exigência do padrão, mas é metadado: o navegador não baixa
      // nada deles.
      assert.doesNotMatch(
        texto.replace(/<link\s+rel="(?:canonical|alternate)"[^>]*>/gi, ""),
        /<(?:script|img|iframe|link)\b[^>]*(?:src|href)="(?:https?:)?\/\//i,
        arquivo,
      );
    }
  });

  it("nenhum módulo guarda dado do visitante no navegador", async () => {
    const proibidos =
      /localStorage|sessionStorage|document\.cookie|indexedDB|caches\.|navigator\.sendBeacon/i;

    for (const arquivo of await arquivosDeTexto(`${PUBLIC}js/`)) {
      assert.doesNotMatch(await readFile(arquivo, "utf8"), proibidos, arquivo);
    }
  });

  it("nenhum módulo chama fetch fora de doh.js", async () => {
    for (const arquivo of await arquivosDeTexto(`${PUBLIC}js/`)) {
      if (arquivo.endsWith("/doh.js")) {
        continue;
      }
      assert.doesNotMatch(
        await readFile(arquivo, "utf8"),
        /\bfetch\s*\(|XMLHttpRequest|WebSocket/,
        arquivo,
      );
    }
  });

  it("nenhum módulo imprime no console (sem log de domínio consultado)", async () => {
    for (const arquivo of await arquivosDeTexto(`${PUBLIC}js/`)) {
      assert.doesNotMatch(await readFile(arquivo, "utf8"), /\bconsole\./, arquivo);
    }
  });
});

// ---------------------------------------------------------------------------
// 404.html
// ---------------------------------------------------------------------------

describe("404.html", () => {
  it("não tem script", async () => {
    assert.doesNotMatch(semComentarios(await ler("404.html")), /<script\b/i);
  });

  it("usa só caminhos absolutos a partir da raiz", async () => {
    const html = semComentarios(await ler("404.html"));
    const caminhos = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(
      (achado) => achado[1] ?? "",
    );

    assert.ok(caminhos.length >= 3);
    for (const caminho of caminhos) {
      assert.match(caminho, /^\/(?!\/)/, `caminho não absoluto: ${caminho}`);
    }
  });

  it("tem lang, um h1, o link de volta para a página inicial e o logo em linha", async () => {
    const html = semComentarios(await ler("404.html"));

    assert.match(html, /<html lang="pt-BR">/);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.match(html, /<a class="botao" href="\/">/);
    assert.match(html, /<svg[\s\S]*<path[\s\S]*<\/svg>/);
  });
});

// ---------------------------------------------------------------------------
// PÁGINAS EM INGLÊS (spec 008)
// ---------------------------------------------------------------------------

/**
 * O esqueleto de um HTML: a sequência de tags com `id` e `class`, sem texto nem comentário nem
 * os atributos que mudam com o idioma. É o que o teste compara entre os dois idiomas (ADR-1).
 *
 * @param {string} html - O HTML de uma página.
 * @returns {string[]} Uma linha por tag de abertura: `tag#id.classe`.
 */
const esqueleto = (html) =>
  [...semComentarios(html).matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)].map(([, tag, atributos]) => {
    const id = /\sid="([^"]+)"/.exec(atributos ?? "")?.[1] ?? "";
    const classe = /\sclass="([^"]+)"/.exec(atributos ?? "")?.[1] ?? "";
    return `${tag}#${id}.${classe}`;
  });

describe("páginas em inglês", () => {
  it("en/index.html tem lang en, um único h1 e um único main", async () => {
    const html = semComentarios(await ler("en/index.html"));

    assert.match(html, /<html lang="en">/);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.equal(html.match(/<main\b/g)?.length, 1);
  });

  it("en/404.html tem lang en, um h1, o link de volta para /en/ e nenhum script", async () => {
    const html = semComentarios(await ler("en/404.html"));

    assert.match(html, /<html lang="en">/);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.match(html, /<a class="botao" href="\/en\/">/);
    assert.doesNotMatch(html, /<script\b/i);
  });

  it("en/404.html usa só caminhos absolutos a partir da raiz", async () => {
    const html = semComentarios(await ler("en/404.html"));
    const caminhos = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(
      (achado) => achado[1] ?? "",
    );

    assert.ok(caminhos.length >= 3);
    for (const caminho of caminhos) {
      assert.match(caminho, /^\/(?!\/)/, `caminho não absoluto: ${caminho}`);
    }
  });

  it("en/index.html carrega a entrada em inglês, e a entrada importa o catálogo em inglês", async () => {
    const html = await ler("en/index.html");
    const entrada = semComentarios(await ler("js/entrada-en.js"));

    assert.match(html, /<script type="module" src="\/js\/entrada-en\.js"><\/script>/);
    assert.doesNotMatch(html, /entrada-pt/);
    assert.match(html, /<link rel="stylesheet" href="\/css\/pagina\.css"/);
    assert.match(entrada, /import \{ iniciarPagina \} from "\.\/pagina\.js";/);
    assert.match(entrada, /import \{ textos \} from "\.\/textos\/en\/index\.js";/);
    assert.match(entrada, /iniciarPagina\(textos\);/);
  });

  it("a CSP da <meta> de cada página em inglês é igual à da página em português", async () => {
    const politica = async (/** @type {string} */ arquivo) =>
      /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(await ler(arquivo))?.[1];

    assert.ok((await politica("index.html")) !== undefined);
    assert.equal(await politica("en/index.html"), await politica("index.html"));
    assert.equal(await politica("en/404.html"), await politica("404.html"));
  });

  it("o esqueleto de en/index.html é o de index.html (ids, classes e ordem)", async () => {
    assert.deepEqual(esqueleto(await ler("en/index.html")), esqueleto(await ler("index.html")));
  });

  it("o esqueleto de en/404.html é o de 404.html", async () => {
    assert.deepEqual(esqueleto(await ler("en/404.html")), esqueleto(await ler("404.html")));
  });

  it("o texto da página em inglês não é o da portuguesa", async () => {
    const texto = async (/** @type {string} */ arquivo) =>
      semComentarios(await ler(arquivo))
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");

    assert.doesNotMatch(await texto("en/index.html"), /Verificar|Domínio|Próximo|seletores/);
    assert.doesNotMatch(await texto("en/404.html"), /Voltar|Erro 404|não achei/i);
  });
});

// ---------------------------------------------------------------------------
// SELETOR DE IDIOMA (spec 008)
// ---------------------------------------------------------------------------

describe("seletor de idioma", () => {
  /** @param {string} html @returns {string[]} Os `<nav class="idioma">` com o que há dentro. */
  const navs = (html) => [...html.matchAll(/<nav class="idioma"[\s\S]*?<\/nav>/g)].map((m) => m[0]);

  for (const [arquivo, atual, outro, rotulos] of /** @type {const} */ ([
    ["index.html", "PT", "EN", ["Idioma", "Idioma (rodapé)"]],
    ["en/index.html", "EN", "PT", ["Language", "Language (footer)"]],
  ])) {
    describe(arquivo, () => {
      it("tem um seletor no cabeçalho e outro no rodapé, com nomes diferentes", async () => {
        const html = semComentarios(await ler(arquivo));
        const encontrados = navs(html);

        assert.equal(encontrados.length, 2);
        assert.deepEqual(
          encontrados.map((nav) => /aria-label="([^"]+)"/.exec(nav)?.[1]),
          rotulos,
        );
        assert.ok(html.indexOf(encontrados[0] ?? "") < html.indexOf("<main"));
        assert.ok(html.indexOf(encontrados[1] ?? "") > html.indexOf("</main>"));
      });

      it(`marca ${atual} como a página atual e só ele`, async () => {
        for (const nav of navs(semComentarios(await ler(arquivo)))) {
          assert.equal(nav.match(/aria-current="page"/g)?.length, 1);
          assert.match(nav, new RegExp(`aria-current="page"[^>]*>\\s*${atual}\\s*</a`));
          assert.doesNotMatch(nav, new RegExp(`aria-current="page"[^>]*>\\s*${outro}\\s*</a`));
        }
      });

      it("os dois links são links reais, com o nome do idioma por extenso no próprio idioma", async () => {
        for (const nav of navs(semComentarios(await ler(arquivo)))) {
          assert.match(
            nav,
            /<a href="\/" lang="pt-BR" hreflang="pt-BR"[^>]*aria-label="PT: Português"/,
          );
          assert.match(
            nav,
            /<a href="\/en\/" lang="en" hreflang="en"[^>]*aria-label="EN: English"/,
          );
        }
      });
    });
  }

  it("as 404 não têm seletor de idioma", async () => {
    for (const arquivo of ["404.html", "en/404.html"]) {
      assert.doesNotMatch(await ler(arquivo), /class="idioma"/, arquivo);
    }
  });
});

// ---------------------------------------------------------------------------
// LOGO
// ---------------------------------------------------------------------------

describe("logo nas páginas", () => {
  /** @param {string} svg @returns {string | undefined} O atributo `d` do primeiro `<path>`. */
  const caminhoDoLogo = (svg) => /<path\b[^>]*\sd="([^"]+)"/.exec(svg)?.[1];

  it("o <path> do index, da 404 e do favicon é o do arquivo oficial", async () => {
    const oficial = caminhoDoLogo(
      await readFile(
        new URL("../docs/images/dmarc-facil-dmarc-checker-logo.svg", import.meta.url),
        "utf8",
      ),
    );

    assert.ok(oficial !== undefined && oficial.length > 20);
    for (const arquivo of [...PAGINAS, "favicon.svg"]) {
      assert.equal(caminhoDoLogo(await ler(arquivo)), oficial, arquivo);
    }
  });

  it("usa fill-rule como atributo (style= não passa na CSP)", async () => {
    for (const arquivo of PAGINAS) {
      assert.match(await ler(arquivo), /<path[^>]*fill-rule="evenodd"/, arquivo);
    }
  });
});

// ---------------------------------------------------------------------------
// FONTES E CSS
// ---------------------------------------------------------------------------

describe("fontes locais", () => {
  it("o CSS aponta para as duas fontes locais, que existem e trazem a licença ao lado", async () => {
    const css = await ler("css/pagina.css");
    const arquivos = [...css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map((achado) => achado[1]);

    assert.deepEqual(arquivos.sort(), ["JetBrainsMono-400-latin.woff2", "Sora-800-latin.woff2"]);
    const presentes = await readdir(`${PUBLIC}fonts/`);
    for (const arquivo of [...arquivos, "OFL-Sora.txt", "OFL-JetBrainsMono.txt"]) {
      assert.ok(presentes.includes(arquivo ?? ""), `falta ${arquivo}`);
    }
  });

  it("as fontes são woff2 de verdade", async () => {
    for (const nome of ["Sora-800-latin.woff2", "JetBrainsMono-400-latin.woff2"]) {
      const bytes = await readFile(`${PUBLIC}fonts/${nome}`);

      assert.equal(bytes.subarray(0, 4).toString("latin1"), "wOF2", nome);
    }
  });
});
