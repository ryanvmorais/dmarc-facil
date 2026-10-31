/**
 * @file Documento falso para testar `criar` sem navegador nem `jsdom`.
 *
 * Implementa só o que `dom.js` usa (`createElement`, `createElementNS`, `createTextNode`,
 * `setAttribute`, `hasAttribute`, `append`), registra o que foi criado e **lança** se alguém
 * atribuir `innerHTML` ou `outerHTML`: um módulo que tentasse interpretar texto como marcação
 * derruba o teste. Ver o ADR-9 da spec 006 para o que isto prova e o que não prova.
 */

// @ts-check

export class NoFalso {
  /**
   * @param {string} tag - Tag do elemento, ou `#texto` para nó de texto.
   * @param {string} [namespace=""] - Namespace usado na criação (SVG).
   * @param {string} [conteudo=""] - Texto, quando o nó é de texto.
   */
  constructor(tag, namespace = "", conteudo = "") {
    this.tag = tag;
    this.namespace = namespace;
    this.conteudo = conteudo;
    /** @type {Record<string, string>} */
    this.atributos = {};
    /** @type {NoFalso[]} */
    this.filhos = [];
  }

  /** @param {string} nome @param {string} valor */
  setAttribute(nome, valor) {
    this.atributos[nome] = valor;
  }

  /** @param {string} nome */
  hasAttribute(nome) {
    return nome in this.atributos;
  }

  /** @param {...NoFalso} nos */
  append(...nos) {
    this.filhos.push(...nos);
  }

  /** @param {string} _valor */
  set innerHTML(_valor) {
    throw new Error("innerHTML atribuído: texto virou marcação.");
  }

  /** @param {string} _valor */
  set outerHTML(_valor) {
    throw new Error("outerHTML atribuído: texto virou marcação.");
  }

  /** @returns {NoFalso[]} Este nó e todos os descendentes, em ordem. */
  todos() {
    return [this, ...this.filhos.flatMap((filho) => filho.todos())];
  }

  /** @returns {string} Todo o texto abaixo deste nó. */
  texto() {
    return this.todos()
      .filter((no) => no.tag === "#texto")
      .map((no) => no.conteudo)
      .join("");
  }
}

/** @returns {Document} Um documento falso (o tipo é forçado: ele implementa só o necessário). */
export const criarDocumentoFalso = () => {
  const documento = {
    createElement: (/** @type {string} */ tag) => new NoFalso(tag),
    createElementNS: (/** @type {string} */ namespace, /** @type {string} */ tag) =>
      new NoFalso(tag, namespace),
    createTextNode: (/** @type {string} */ texto) => new NoFalso("#texto", "", texto),
  };
  return /** @type {any} */ (documento);
};
