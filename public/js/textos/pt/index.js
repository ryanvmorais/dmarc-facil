/**
 * @file Catálogo de textos em português: o que `entrada-pt.js` entrega à página.
 *
 * Junta as três partes do catálogo num objeto só, que as funções de apresentação recebem como
 * primeiro parâmetro (`textos`). O catálogo de cada idioma tem esta mesma forma (ADR-3 e ADR-4
 * da spec 008).
 */

// @ts-check

import { achados } from "./achados.js";
import { interfacePagina } from "./interface.js";
import { motivos } from "./motivos.js";

export const textos = { achados, interface: interfacePagina, motivos };
