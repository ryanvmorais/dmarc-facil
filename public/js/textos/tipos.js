/**
 * @file Tipos do catálogo de textos: só `typedef`, nenhum código.
 *
 * O tipo do catálogo vem do português (ADR-4 da spec 008): `Textos` é o que `textos/pt/index.js`
 * exporta. O catálogo de outro idioma é anotado com `@type {Textos}` e o `tsc` recusa chave
 * faltando ou sobrando; o que o tipo não vê (os marcadores `{nome}`, os trechos entre crases, o
 * texto vazio) o teste de paridade confere.
 */

// @ts-check

/** @typedef {typeof import("./pt/index.js").textos} Textos */
/** @typedef {{ texto: string }} TextoFixo */
/** @typedef {{ titulo: string, resumo: string }} TextoDegrau */
/** @typedef {{ titulo: string, explicacao: string, acao: string }} TextoAchado */
