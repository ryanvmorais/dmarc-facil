/**
 * @file Testes do tema escuro de `public/css/pagina.css` (segue `prefers-color-scheme`, sem botão).
 *
 * Sem navegador: lê o CSS como texto. O bloco escuro tem de redefinir todo token de cor do
 * bloco claro (um token esquecido deixaria uma cor clara sobre o fundo escuro), e os pares de
 * texto e fundo têm de passar nos mesmos limites nos dois temas: 4,5:1 para texto (RF-07 da
 * spec 006) e 3:1 para borda de campo e foco. As duas páginas e o favicon têm de avisar o
 * navegador de que aceitam os dois temas.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// APOIO
// ---------------------------------------------------------------------------

/**
 * @param {string} caminho - Caminho relativo a `public/`.
 * @returns {Promise<string>} O conteúdo do arquivo.
 */
const ler = (caminho) => readFile(new URL(`../public/${caminho}`, import.meta.url), "utf8");

/**
 * Lê as declarações `--nome: valor;` de um bloco de CSS.
 *
 * @param {string} bloco - O texto de dentro das chaves.
 * @returns {Map<string, string>} Nome do token (sem `--`) e valor.
 */
const lerTokens = (bloco) => {
  /** @type {Map<string, string>} */
  const tokens = new Map();
  for (const achado of bloco.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const [, nome = "", valor = ""] = achado;
    tokens.set(nome, valor.trim());
  }
  return tokens;
};

/**
 * Pega o corpo da primeira regra que começa em `abertura`, contando as chaves.
 *
 * @param {string} css - A folha de estilo.
 * @param {string} abertura - O texto que abre a regra, até a `{` (inclusive).
 * @returns {string} O que está entre as chaves da regra.
 */
const corpoDa = (css, abertura) => {
  const inicio = css.indexOf(abertura);
  assert.notEqual(inicio, -1, `não achei "${abertura}"`);
  let fundo = 1;
  let fim = inicio + abertura.length;
  while (fundo > 0 && fim < css.length) {
    if (css[fim] === "{") fundo += 1;
    if (css[fim] === "}") fundo -= 1;
    fim += 1;
  }
  return css.slice(inicio + abertura.length, fim - 1);
};

/**
 * @param {string} cor - Cor `#rrggbb`.
 * @returns {number} Luminância relativa (WCAG 2).
 */
const luminancia = (cor) => {
  assert.match(cor, /^#[0-9a-f]{6}$/i, `cor inesperada: ${cor}`);
  /** @param {number} inicio - Posição do canal em `#rrggbb`. */
  const canalLinear = (inicio) => {
    const canal = Number.parseInt(cor.slice(inicio, inicio + 2), 16) / 255;
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canalLinear(1) + 0.7152 * canalLinear(3) + 0.0722 * canalLinear(5);
};

/**
 * @param {string} a - Uma cor `#rrggbb`.
 * @param {string} b - Outra cor `#rrggbb`.
 * @returns {number} A razão de contraste (1 a 21).
 */
const contraste = (a, b) => {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// O CSS é lido como texto, sem navegador: o teste roda em qualquer máquina e compara os dois
// blocos de tokens (claro e escuro) pelo que está escrito na folha, que é o que o site publica.
const css = await ler("css/pagina.css");
const CLARO = lerTokens(corpoDa(css, ":root {"));
const ESCURO = lerTokens(corpoDa(corpoDa(css, "@media (prefers-color-scheme: dark) {"), ":root {"));

// Tokens de cor do tema claro: os que o escuro tem de redefinir.
const TOKENS_DE_COR = [...CLARO].filter(([, valor]) => valor.startsWith("#")).map(([nome]) => nome);

// ---------------------------------------------------------------------------
// TOKENS
// ---------------------------------------------------------------------------

describe("tokens do tema escuro", () => {
  it("o bloco escuro redefine todo token de cor do bloco claro", () => {
    assert.ok(TOKENS_DE_COR.length > 20, "o bloco claro deveria ter os tokens de cor");
    for (const nome of TOKENS_DE_COR) {
      assert.ok(ESCURO.has(nome), `--${nome} não foi redefinido no tema escuro`);
    }
  });

  it("o bloco escuro não inventa token que o claro não tem", () => {
    for (const nome of ESCURO.keys()) {
      assert.ok(CLARO.has(nome), `--${nome} existe só no tema escuro`);
    }
  });

  it("avisa o navegador do tema de cada bloco", () => {
    assert.match(corpoDa(css, ":root {"), /color-scheme: light;/);
    assert.match(
      corpoDa(corpoDa(css, "@media (prefers-color-scheme: dark) {"), ":root {"),
      /color-scheme: dark;/,
    );
  });

  it("nenhuma regra fora dos tokens fixa cor em hexadecimal, com a exceção do branco do botão", () => {
    const resto = css
      .replace(corpoDa(css, ":root {"), "")
      .replace(corpoDa(css, "@media (prefers-color-scheme: dark) {"), "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const fixas = [...resto.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((achado) => achado[0]);

    assert.ok(
      fixas.every((cor) => cor.toLowerCase() === "#ffffff"),
      `cor fixa fora dos tokens: ${fixas.filter((cor) => cor.toLowerCase() !== "#ffffff").join(", ")}`,
    );
  });
});

// ---------------------------------------------------------------------------
// CONTRASTE
// ---------------------------------------------------------------------------

/**
 * Texto: pares de [primeiro plano, fundo], mínimo de 4,5:1.
 *
 * @type {[string, string][]}
 */
const PARES_DE_TEXTO = [
  ["cor-texto", "cor-fundo"],
  ["cor-texto-2", "cor-fundo"],
  ["cor-texto-3", "cor-fundo"],
  ["cor-texto", "cor-cartao"],
  ["cor-texto-2", "cor-cartao"],
  ["cor-texto-3", "cor-cartao"],
  ["cor-texto", "cor-codigo-fundo"],
  ["cor-marca-escura", "cor-fundo"],
  ["cor-marca-escura", "cor-cartao"],
  ["cor-marca-escura", "cor-marca-fundo"],
  ["cor-texto-2", "cor-marca-fundo"],
  ["cor-texto-2", "cor-borda"],
  ["cor-texto", "cor-botao-desabilitado"],
  ["selo-ok-texto", "selo-ok-fundo"],
  ["selo-atencao-texto", "selo-atencao-fundo"],
  ["selo-problema-texto", "selo-problema-fundo"],
  ["selo-neutro-texto", "selo-neutro-fundo"],
  ["selo-ok-texto", "cor-cartao"],
  ["selo-atencao-texto", "cor-cartao"],
  ["selo-problema-texto", "cor-cartao"],
  ["selo-problema-texto", "cor-fundo"],
  ["selo-atencao-texto", "cor-fundo"],
];

// O botão e a etiqueta têm texto branco sobre estes fundos.
const FUNDOS_COM_TEXTO_BRANCO = ["cor-marca", "cor-marca-hover"];

/**
 * Não texto: bordas de campo e foco, mínimo de 3:1 (WCAG 1.4.11).
 *
 * @type {[string, string][]}
 */
const PARES_DE_FORMA = [
  ["cor-campo-borda", "cor-cartao"],
  ["cor-foco", "cor-fundo"],
  ["cor-foco", "cor-cartao"],
  ["cor-marca", "cor-fundo"],
  ["cor-logo", "cor-fundo"],
];

for (const [tema, tokens] of /** @type {const} */ ([
  ["claro", CLARO],
  ["escuro", ESCURO],
])) {
  describe(`contraste do tema ${tema}`, () => {
    /**
     * O tema escuro só redefine parte dos tokens; o resto vale como no claro.
     *
     * @param {string} nome - Nome do token, sem `--`.
     * @returns {string} A cor do token neste tema.
     */
    const cor = (nome) => {
      const valor = tokens.get(nome) ?? CLARO.get(nome);
      assert.ok(valor, `--${nome} não existe`);
      return valor;
    };

    it("texto: 4,5:1 ou mais em cada par de texto e fundo", () => {
      for (const [frente, fundo] of PARES_DE_TEXTO) {
        const razao = contraste(cor(frente), cor(fundo));
        assert.ok(razao >= 4.5, `${frente} sobre ${fundo}: ${razao.toFixed(2)}:1`);
      }
    });

    it("texto branco sobre o botão e a etiqueta (também no hover): 4,5:1 ou mais", () => {
      for (const fundo of FUNDOS_COM_TEXTO_BRANCO) {
        const razao = contraste("#ffffff", cor(fundo));
        assert.ok(razao >= 4.5, `branco sobre ${fundo}: ${razao.toFixed(2)}:1`);
      }
    });

    it("forma: 3:1 ou mais na borda do campo, no foco, na marca e no logo", () => {
      for (const [frente, fundo] of PARES_DE_FORMA) {
        const razao = contraste(cor(frente), cor(fundo));
        assert.ok(razao >= 3, `${frente} sobre ${fundo}: ${razao.toFixed(2)}:1`);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// PÁGINAS E FAVICON
// ---------------------------------------------------------------------------

describe("páginas e favicon aceitam os dois temas", () => {
  it("index e 404 declaram color-scheme: light dark", async () => {
    for (const arquivo of ["index.html", "404.html"]) {
      assert.match(
        await ler(arquivo),
        /<meta name="color-scheme" content="light dark" \/>/,
        arquivo,
      );
    }
  });

  it("o logo das páginas ganha a cor do token (o atributo fill é só reserva)", () => {
    assert.match(css, /\.marca svg path\s*\{\s*fill: var\(--cor-logo\);/);
  });

  it("o favicon troca de cor no tema escuro", async () => {
    const svg = await ler("favicon.svg");

    assert.match(svg, /@media \(prefers-color-scheme: dark\)\s*\{\s*path\s*\{\s*fill:\s*#60a5fa;/);
    assert.match(svg, /path\s*\{\s*fill:\s*#2563eb;/);
  });

  it("o hover do botão usa token próprio, e não o azul claro do texto no escuro", () => {
    const hover = corpoDa(css, ".botao:hover:not(:disabled) {");

    assert.match(hover, /var\(--cor-marca-hover\)/);
  });
});
