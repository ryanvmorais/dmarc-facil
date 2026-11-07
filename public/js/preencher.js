/**
 * @file Encaixe de valores nos textos do catálogo (`{nome}` vira o valor).
 *
 * Mora num módulo próprio porque dois lados precisam dele: `textos-achados.js` (a frase de cada
 * motivo de recusa, com o `{valor}`) e `apresentacao.js` (as frases dos cartões). Se ficasse em
 * `apresentacao.js`, que já importa `textos-achados.js`, os dois se importariam em círculo.
 *
 * É puro: sem DOM, sem rede.
 */

// @ts-check

/**
 * Troca `{nome}` pelos valores. Os valores entram como estão e não são expandidos de novo.
 *
 * @param {string} modelo - Texto com marcadores `{nome}`.
 * @param {Record<string, string | number>} [valores] - Valor de cada marcador.
 * @returns {string} O texto montado; marcador sem valor vira vazio.
 */
export const preencher = (modelo, valores = {}) =>
  modelo.replace(/\{([a-z]+)\}/g, (_, nome) => String(valores[nome] ?? ""));
