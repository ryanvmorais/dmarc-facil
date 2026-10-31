/**
 * @file Lista os textos da interface que ainda não são finais.
 *
 * Os textos de `public/` nascem provisórios de propósito e o Ryan os revisa antes da `1.0.0`
 * (RF-09 da spec 006). Cada texto montado por script leva `provisorio: true` nos catálogos
 * (`textos-achados.js`, `textos-interface.js`), e cada texto do HTML leva o atributo
 * `data-provisorio`. Este script junta os dois num relatório, para a revisão não depender de
 * procurar na página. Rodar: `pnpm textos:provisorios`.
 *
 * Só lê arquivos do repositório; não grava nada e não faz rede.
 */

// @ts-check

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** @typedef {{ onde: string, texto: string }} TextoProvisorio */

// ---------------------------------------------------------------------------
// CAMINHOS
// ---------------------------------------------------------------------------

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const CATALOGOS = ["public/js/textos-achados.js", "public/js/textos-interface.js"];
const PASTA_HTML = "public";

// ---------------------------------------------------------------------------
// CATÁLOGOS
// ---------------------------------------------------------------------------

/**
 * Anda pelo valor exportado de um catálogo e junta tudo o que está marcado `provisorio: true`.
 *
 * Um texto é um objeto com `provisorio` booleano; o que se mostra dele é o `texto` (texto
 * fixo) ou o `titulo` (entrada do catálogo de achados e degraus).
 *
 * @param {unknown} valor - Um valor exportado do catálogo.
 * @param {string} caminho - Onde ele está, para o relatório (`arquivo:exportacao.chave`).
 * @returns {TextoProvisorio[]} Os textos marcados.
 */
export const coletarProvisorios = (valor, caminho) => {
  if (typeof valor !== "object" || valor === null) {
    return [];
  }
  const objeto = /** @type {Record<string, unknown>} */ (valor);
  if (typeof objeto["provisorio"] === "boolean") {
    const mostra = objeto["texto"] ?? objeto["titulo"];
    return objeto["provisorio"] ? [{ onde: caminho, texto: String(mostra ?? "") }] : [];
  }
  return Object.entries(objeto).flatMap(([chave, filho]) =>
    coletarProvisorios(filho, `${caminho}.${chave}`),
  );
};

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/**
 * Acha os elementos com `data-provisorio` num HTML e devolve o texto de cada um.
 *
 * É uma leitura textual, boa para o HTML simples desta página: pega o elemento do atributo
 * até o fecho da mesma tag e tira as marcas de dentro.
 *
 * @param {string} html - O conteúdo de um arquivo HTML.
 * @param {string} arquivo - O caminho dele, para o relatório.
 * @returns {TextoProvisorio[]} Os textos marcados.
 */
export const coletarProvisoriosDoHtml = (html, arquivo) => {
  const padrao = /<([a-z][a-z0-9]*)\b[^>]*\bdata-provisorio\b[^>]*>([\s\S]*?)<\/\1>/gi;
  return [...html.matchAll(padrao)].map((achado) => ({
    onde: arquivo,
    texto: (achado[2] ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  }));
};

/**
 * @param {string} pasta - Pasta a percorrer.
 * @returns {Promise<string[]>} Os arquivos `.html` dela, em qualquer profundidade.
 */
const acharHtml = async (pasta) => {
  const itens = await readdir(pasta, { withFileTypes: true });
  const achados = await Promise.all(
    itens.map(async (item) => {
      const caminho = join(pasta, item.name);
      if (item.isDirectory()) {
        return acharHtml(caminho);
      }
      return item.name.endsWith(".html") ? [caminho] : [];
    }),
  );
  return achados.flat().sort();
};

// ---------------------------------------------------------------------------
// RELATÓRIO
// ---------------------------------------------------------------------------

/**
 * Junta os textos provisórios dos catálogos e dos HTML.
 *
 * @param {{ catalogos?: string[], pastaHtml?: string, raiz?: string }} [opcoes] - Os módulos de
 *   catálogo e a pasta dos HTML, relativos a ``raiz`` (padrão: a raiz do repositório).
 * @returns {Promise<TextoProvisorio[]>} Todos os textos marcados.
 */
export const listarProvisorios = async ({
  catalogos = CATALOGOS,
  pastaHtml = PASTA_HTML,
  raiz = RAIZ,
} = {}) => {
  /** @type {TextoProvisorio[]} */
  const lista = [];

  for (const catalogo of catalogos) {
    const modulo = await import(pathToFileURL(join(raiz, catalogo)).href);
    for (const [nome, valor] of Object.entries(modulo)) {
      lista.push(...coletarProvisorios(valor, `${catalogo}:${nome}`));
    }
  }

  for (const arquivo of await acharHtml(join(raiz, pastaHtml))) {
    const html = await readFile(arquivo, "utf8");
    const nome = relative(raiz, arquivo).replaceAll("\\", "/");
    lista.push(...coletarProvisoriosDoHtml(html, nome));
  }
  return lista;
};

const principal = async () => {
  const lista = await listarProvisorios();
  for (const { onde, texto } of lista) {
    console.log(`${onde}\n    ${texto}`);
  }
  console.log(`\n${lista.length} texto(s) provisório(s) para revisar antes da 1.0.0.`);
};

// Só executa quando chamado como script, não quando os testes importam as funções.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
