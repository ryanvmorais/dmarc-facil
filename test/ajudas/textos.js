/**
 * @file O catálogo de textos que os testes passam às funções de apresentação (ADR-3 da spec 008).
 *
 * As funções que escolhem texto recebem o catálogo como primeiro parâmetro, em vez de o
 * importarem; este arquivo entrega os catálogos dos idiomas. `textos` é o português, o mesmo da
 * página em português, para os testes que conferem a frase; os testes que só precisam de "um
 * catálogo" usam o mesmo. `catalogos` traz os dois idiomas, para os testes que rodam em cada um.
 */

// @ts-check

import { textos as textosEn } from "../../public/js/textos/en/index.js";
import { textos } from "../../public/js/textos/pt/index.js";

export { textos };

/** @type {Record<"pt" | "en", import("../../public/js/textos/tipos.js").Textos>} */
export const catalogos = { pt: textos, en: textosEn };
