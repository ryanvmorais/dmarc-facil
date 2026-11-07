/**
 * @file Catálogo de textos em inglês: o que `entrada-en.js` entrega à página.
 *
 * Junta as três partes do catálogo num objeto só, com a mesma forma do português. A anotação
 * `@type {Textos}` faz o `tsc` recusar chave faltando ou sobrando (ADR-4 da spec 008); o que o
 * tipo não vê (marcadores `{nome}`, trechos entre crases, texto vazio) o teste de paridade confere.
 */

// @ts-check

import { achados } from "./achados.js";
import { interfacePagina } from "./interface.js";
import { motivos } from "./motivos.js";

/** @typedef {import("../tipos.js").Textos} Textos */

/** @type {Textos} */
export const textos = { achados, interface: interfacePagina, motivos };
