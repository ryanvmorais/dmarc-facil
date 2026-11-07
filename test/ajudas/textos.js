/**
 * @file O catálogo de textos que os testes passam às funções de apresentação (ADR-3 da spec 008).
 *
 * As funções que escolhem texto recebem o catálogo como primeiro parâmetro, em vez de o
 * importarem; este arquivo entrega o catálogo em português, o mesmo da página, para os testes que
 * conferem a frase. Os testes que só precisam de "um catálogo" usam o mesmo.
 */

// @ts-check

export { textos } from "../../public/js/textos/pt/index.js";
