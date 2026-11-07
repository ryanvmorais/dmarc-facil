/**
 * @file Testes dos links de idioma: levam o que está no campo para a outra página (RF-05 e ADR-6
 * da spec 008).
 *
 * Com o documento falso: o campo vazio, o campo digitado e o campo depois de uma verificação (o
 * `atualizar` que `ligarLinksDeIdioma` devolve). O texto hostil nunca vira esquema nem marcação:
 * o `href` é a base do HTML mais um `?dominio=` codificado.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ligarLinksDeIdioma } from "../public/js/pagina.js";
import { NoFalso } from "./ajudas/documento-falso.js";

/**
 * @param {string} href - O `href` de partida do link.
 * @returns {NoFalso} Um link falso.
 */
const link = (href) => {
  const no = new NoFalso("a");
  no.setAttribute("href", href);
  return no;
};

/** @returns {{ campo: NoFalso, pt: NoFalso, en: NoFalso, atualizar: () => void }} A montagem. */
const montar = () => {
  const campo = new NoFalso("input");
  const pt = link("/");
  const en = link("/en/");
  const atualizar = ligarLinksDeIdioma([pt, en], /** @type {any} */ (campo));
  return { campo, pt, en, atualizar };
};

/** @param {NoFalso} no @param {string} texto Digita no campo, como o visitante. */
const digitar = (no, texto) => {
  no.value = texto;
  no.disparar("input");
};

describe("ligarLinksDeIdioma", () => {
  it("campo vazio: os links ficam com a base do HTML", () => {
    const { pt, en } = montar();

    assert.equal(pt.getAttribute("href"), "/");
    assert.equal(en.getAttribute("href"), "/en/");
  });

  it("campo já preenchido ao ligar (o ?dominio= do endereço): os links levam o domínio", () => {
    const campo = new NoFalso("input");
    campo.value = "exemplo.com.br";
    const en = link("/en/");

    ligarLinksDeIdioma([en], /** @type {any} */ (campo));

    assert.equal(en.getAttribute("href"), "/en/?dominio=exemplo.com.br");
  });

  it("digitado: a cada tecla os dois links levam o texto do campo", () => {
    const { campo, pt, en } = montar();

    digitar(campo, "exemplo");
    assert.equal(en.getAttribute("href"), "/en/?dominio=exemplo");
    digitar(campo, "exemplo.com.br");
    assert.equal(pt.getAttribute("href"), "/?dominio=exemplo.com.br");
    assert.equal(en.getAttribute("href"), "/en/?dominio=exemplo.com.br");
  });

  it("apagar o campo volta o link para a base, sem parâmetro", () => {
    const { campo, pt, en } = montar();

    digitar(campo, "exemplo.com.br");
    digitar(campo, "");

    assert.equal(pt.getAttribute("href"), "/");
    assert.equal(en.getAttribute("href"), "/en/");
  });

  it("verificado: o atualizar regrava o link com o domínio normalizado que o campo recebeu", () => {
    const { campo, en, atualizar } = montar();

    digitar(campo, "  EXEMPLO.com.br ");
    campo.value = "exemplo.com.br";
    atualizar();

    assert.equal(en.getAttribute("href"), "/en/?dominio=exemplo.com.br");
  });

  it("a base não se acumula: cada regravação parte do href original", () => {
    const { campo, en } = montar();

    for (const texto of ["a", "ab", "abc", ""]) {
      digitar(campo, texto);
    }

    assert.equal(en.getAttribute("href"), "/en/");
  });

  it("texto hostil não vira esquema nem marcação no href", () => {
    const { campo, pt, en } = montar();

    for (const texto of ["javascript:alert(1)", "<script>alert(1)</script>", "%00", '"><b>']) {
      digitar(campo, texto);

      for (const [no, base] of /** @type {const} */ ([
        [pt, "/"],
        [en, "/en/"],
      ])) {
        const href = no.getAttribute("href") ?? "";

        assert.ok(href.startsWith(`${base}?dominio=`), `${texto} -> ${href}`);
        assert.doesNotMatch(href, /[<>"' ]/, href);
        assert.equal(new URL(href, "https://exemplo.test").origin, "https://exemplo.test", href);
        assert.equal(new URL(href, "https://exemplo.test").searchParams.get("dominio"), texto);
      }
    }
  });
});

describe("pagina.js", () => {
  it("não faz nada ao ser importado: ligarLinksDeIdioma não toca o documento", () => {
    assert.equal(typeof ligarLinksDeIdioma, "function");
    assert.equal(typeof globalThis.document, "undefined");
  });
});
