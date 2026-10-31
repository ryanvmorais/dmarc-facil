/**
 * @file Testes de `criar` e `urlHttps`, a defesa do DOM contra dado de terceiros.
 *
 * Um registro TXT é texto de quem controla o DNS do domínio e pode trazer `<script>`,
 * `<img onerror>`, `javascript:`, aspas, caracteres de controle ou 100 KB. Aqui o ataque é
 * alimentado de verdade num documento falso que lança se alguém atribuir `innerHTML`: o
 * conteúdo hostil tem de virar um nó de texto, sem criar nenhum nó extra nem atributo.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { criar, urlHttps } from "../public/js/dom.js";
import { criarDocumentoFalso, NoFalso } from "./ajudas/documento-falso.js";

/** @param {unknown} no @returns {NoFalso} */
const falso = (no) => /** @type {NoFalso} */ (no);

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

describe("urlHttps", () => {
  it("aceita https e normaliza", () => {
    assert.equal(urlHttps("https://exemplo.com.br/doc"), "https://exemplo.com.br/doc");
  });

  /** @type {Array<[string, unknown]>} Rótulo e entrada recusada. */
  const recusadas = [
    ["http", "http://exemplo.com.br/"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["relativa", "/pagina"],
    ["malformada", "https://"],
    ["com credencial", "https://usuario:senha@exemplo.com.br/"],
    ["vazia", ""],
    ["não é texto", 42],
  ];

  for (const [rotulo, entrada] of recusadas) {
    it(`recusa ${rotulo}`, () => {
      assert.equal(urlHttps(entrada), null);
    });
  }
});

// ---------------------------------------------------------------------------
// TAGS E ATRIBUTOS
// ---------------------------------------------------------------------------

describe("criar: tags e atributos", () => {
  it("monta elemento com atributos e filhos", () => {
    const documento = criarDocumentoFalso();
    const filho = criar(documento, "span", {}, "dentro");
    const no = falso(
      criar(documento, "div", { class: "cartao", "aria-live": "polite" }, ["texto ", filho]),
    );

    assert.equal(no.tag, "div");
    assert.deepEqual(no.atributos, { class: "cartao", "aria-live": "polite" });
    assert.equal(no.texto(), "texto dentro");
  });

  /** @type {string[]} */
  const tagsRecusadas = ["script", "iframe", "img", "style", "object", "link", "meta", "SCRIPT"];

  for (const tag of tagsRecusadas) {
    it(`recusa a tag ${tag}`, () => {
      assert.throws(() => criar(criarDocumentoFalso(), tag), TypeError);
    });
  }

  /** @type {string[]} */
  const atributosRecusados = ["onclick", "onerror", "ONLOAD", "style", "srcdoc", "src", "target"];

  for (const nome of atributosRecusados) {
    it(`recusa o atributo ${nome}`, () => {
      assert.throws(() => criar(criarDocumentoFalso(), "div", { [nome]: "x" }), TypeError);
    });
  }

  it("omite o atributo com false, null e undefined, e deixa true sem valor", () => {
    const no = falso(
      criar(criarDocumentoFalso(), "button", { disabled: true, hidden: false, id: null }),
    );

    assert.deepEqual(no.atributos, { disabled: "" });
  });

  it("cria SVG com createElementNS", () => {
    const svg = falso(
      criar(criarDocumentoFalso(), "svg", { viewBox: "0 0 10 10" }, [
        criar(criarDocumentoFalso(), "path", { d: "M0 0", "fill-rule": "evenodd" }),
      ]),
    );

    assert.equal(svg.namespace, "http://www.w3.org/2000/svg");
    assert.equal(svg.filhos[0]?.namespace, "http://www.w3.org/2000/svg");
    assert.equal(svg.filhos[0]?.atributos["fill-rule"], "evenodd");
  });

  it("ignora filho null, undefined e false", () => {
    const no = falso(criar(criarDocumentoFalso(), "p", {}, [null, "a", undefined, false, 2]));

    assert.equal(no.texto(), "a2");
  });
});

// ---------------------------------------------------------------------------
// LINKS
// ---------------------------------------------------------------------------

describe("criar: href", () => {
  it("aceita https e fixa rel noopener noreferrer", () => {
    const no = falso(criar(criarDocumentoFalso(), "a", { href: "https://exemplo.com.br/" }, "doc"));

    assert.equal(no.atributos["href"], "https://exemplo.com.br/");
    assert.equal(no.atributos["rel"], "noopener noreferrer");
  });

  /** @type {string[]} */
  const hrefsRecusados = [
    "javascript:alert(1)",
    "data:text/html,x",
    "http://exemplo.com.br/",
    "/relativo",
    "mailto:relatorios@exemplo.com.br",
  ];

  for (const href of hrefsRecusados) {
    it(`recusa href ${href}`, () => {
      assert.throws(() => criar(criarDocumentoFalso(), "a", { href }, "x"), TypeError);
    });
  }
});

// ---------------------------------------------------------------------------
// DADO DE TERCEIROS
// ---------------------------------------------------------------------------

describe("criar: TXT hostil vira texto", () => {
  /** @type {Array<[string, string]>} Rótulo e conteúdo de um registro TXT malicioso. */
  const hostis = [
    ["script", "v=DMARC1; p=none; <script>alert(1)</script>"],
    ["img onerror", 'v=DMARC1; <img src=x onerror="alert(1)">'],
    ["javascript:", "v=DMARC1; rua=javascript:alert(1)"],
    ["aspas e sinais", `v=DMARC1; "';--></div><div onclick='x'>`],
    ["controle", "v=DMARC1;\u0000\u0007\u001b[31m‮"],
    ["100 KB", `v=DMARC1; ${"a".repeat(100_000)}`],
  ];

  for (const [rotulo, registro] of hostis) {
    it(`${rotulo}: um único nó de texto, sem elemento nem atributo extra`, () => {
      const documento = criarDocumentoFalso();
      const no = falso(criar(documento, "code", { class: "registro" }, registro));

      // Só o `code` e o nó de texto com o registro inteiro, intocado.
      assert.deepEqual(
        no.todos().map((n) => n.tag),
        ["code", "#texto"],
      );
      assert.equal(no.texto(), registro);
      assert.deepEqual(no.atributos, { class: "registro" });
    });
  }

  it("o texto hostil também é inofensivo como valor de atributo", () => {
    const hostil = '"><script>alert(1)</script>';
    const no = falso(criar(criarDocumentoFalso(), "span", { "aria-label": hostil }, "x"));

    assert.equal(no.atributos["aria-label"], hostil);
    assert.equal(no.filhos.length, 1);
  });

  it("o documento falso lança se alguém atribuir innerHTML ou outerHTML", () => {
    const no = new NoFalso("div");

    assert.throws(() => {
      /** @type {any} */ (no).innerHTML = "<script>";
    }, /innerHTML/);
    assert.throws(() => {
      /** @type {any} */ (no).outerHTML = "<script>";
    }, /outerHTML/);
  });
});
