/**
 * @file Entrada da página em português: liga a página com o catálogo de textos do idioma.
 *
 * O `index.html` carrega só este arquivo. O import é estático de propósito: o navegador baixa a
 * página e o catálogo em paralelo (ADR-2 da spec 008).
 */

// @ts-check

import { iniciarPagina } from "./pagina.js";
import { textos } from "./textos/pt/index.js";

iniciarPagina(textos);
