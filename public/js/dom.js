/**
 * @file Montagem segura de nós do DOM: o único caminho para texto de fora virar página.
 *
 * Conteúdo de registro TXT é dado de terceiros e pode conter `<script>`. Por isso nenhum módulo
 * de `public/` transforma texto em HTML (o lint proíbe `innerHTML` e afins); todo nó nasce de
 * `criar`, que só usa `createElement`, `createTextNode`, `setAttribute` e `append`. Filho em
 * texto vira nó de texto, nunca marcação. A tag e o atributo vêm de uma lista fixa: `on*`,
 * `style` e qualquer nome fora da lista são recusados, e `href` só passa por `urlHttps`.
 *
 * O `document` entra por parâmetro, como o `fetch` nos módulos de rede: o teste usa um
 * documento falso (`test/ajudas/documento-falso.js`) e prova o ataque sem navegador.
 */

// @ts-check

// ---------------------------------------------------------------------------
// LISTAS FIXAS
// ---------------------------------------------------------------------------

// Só o que a página desenha. Tag nova é decisão consciente: entra aqui e no teste.
const TAGS_HTML = new Set([
  "div",
  "section",
  "p",
  "h2",
  "h3",
  "ol",
  "ul",
  "li",
  "span",
  "strong",
  "code",
  "a",
  "details",
  "summary",
  "button",
  "form",
  "label",
  "input",
]);

// SVG precisa de `createElementNS`; com `createElement` o navegador cria um elemento HTML
// desconhecido e o desenho some.
const TAGS_SVG = new Set(["svg", "path"]);
const NAMESPACE_SVG = "http://www.w3.org/2000/svg";

// Atributos de conteúdo e de acessibilidade, mais os de SVG (que distinguem maiúscula:
// `viewBox`). `aria-*` é tratado à parte. Nada de `style` (a CSP não o aceita) nem `on*`.
const ATRIBUTOS = new Set([
  "class",
  "id",
  "href",
  "rel",
  "type",
  "value",
  "for",
  "name",
  "role",
  "disabled",
  "hidden",
  "tabindex",
  "autocomplete",
  "placeholder",
  "viewBox",
  "d",
  "fill",
  "fill-rule",
  "width",
  "height",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "focusable",
]);

const ATRIBUTO_ARIA = /^aria-[a-z]+$/;

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

/**
 * Aceita uma URL como destino de link só se for `https` e sem credencial.
 *
 * Os endereços vêm do arquivo de dados dos provedores DKIM, mas passam por aqui assim mesmo:
 * `javascript:`, `data:`, `http:` e caminho relativo nunca viram `href`.
 *
 * @param {unknown} texto - Endereço a conferir.
 * @returns {string | null} O endereço normalizado, ou `null` se não for `https` válido.
 */
export const urlHttps = (texto) => {
  if (typeof texto !== "string") {
    return null;
  }
  try {
    const url = new URL(texto);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
      return null;
    }
    return url.href;
  } catch {
    // Relativa ou malformada.
    return null;
  }
};

// ---------------------------------------------------------------------------
// ATRIBUTOS
// ---------------------------------------------------------------------------

/**
 * Confere o nome do atributo contra a lista fixa.
 *
 * @param {string} nome - Nome do atributo.
 * @throws {TypeError} Se for `on*`, `style` ou estiver fora da lista.
 */
const conferirAtributo = (nome) => {
  if (/^on/i.test(nome) || nome.toLowerCase() === "style") {
    throw new TypeError(`Atributo recusado: "${nome}".`);
  }
  if (!ATRIBUTOS.has(nome) && !ATRIBUTO_ARIA.test(nome)) {
    throw new TypeError(`Atributo fora da lista: "${nome}".`);
  }
};

/**
 * Aplica os atributos ao elemento. `true` vira atributo sem valor (`disabled`); `false`,
 * `null` e `undefined` omitem o atributo, para a chamada poder escrever `disabled: ocupado`.
 *
 * @param {Element} elemento - Elemento recém-criado.
 * @param {string} tag - Tag do elemento (o `a` ganha `rel` fixo quando tem `href`).
 * @param {Record<string, string | number | boolean | null | undefined>} atributos - Atributos pedidos.
 * @throws {TypeError} Se algum atributo for recusado ou o `href` não for `https`.
 */
const aplicarAtributos = (elemento, tag, atributos) => {
  for (const [nome, valor] of Object.entries(atributos)) {
    conferirAtributo(nome);
    if (valor === false || valor === null || valor === undefined) {
      continue;
    }
    if (nome === "href") {
      const url = urlHttps(valor);
      if (url === null) {
        throw new TypeError("href recusado: só https é aceito.");
      }
      elemento.setAttribute("href", url);
      continue;
    }
    elemento.setAttribute(nome, valor === true ? "" : String(valor));
  }

  // Link para fora nunca entrega o `window` de origem nem o `Referer`.
  if (tag === "a" && elemento.hasAttribute("href") && !elemento.hasAttribute("rel")) {
    elemento.setAttribute("rel", "noopener noreferrer");
  }
};

// ---------------------------------------------------------------------------
// CRIAR
// ---------------------------------------------------------------------------

/**
 * Cria um elemento com atributos e filhos, sem nunca interpretar texto como marcação.
 *
 * Filho em texto (ou número) vira nó de texto; filho que já é nó entra como está; `null`,
 * `undefined` e `false` são ignorados, para a chamada poder escrever `cond && criar(...)`.
 *
 * @param {Document} documento - O `document` (ou um falso nos testes).
 * @param {string} tag - Tag da lista fixa (HTML ou SVG).
 * @param {Record<string, string | number | boolean | null | undefined>} [atributos={}] - Atributos
 *   da lista fixa; `href` só aceita `https`.
 * @param {Array<Node | string | number | false | null | undefined> | Node | string | number} [filhos=[]]
 *   Filhos do elemento.
 * @returns {Element} O elemento criado.
 * @throws {TypeError} Se a tag ou algum atributo estiver fora da lista, ou o `href` não for `https`.
 */
export const criar = (documento, tag, atributos = {}, filhos = []) => {
  const svg = TAGS_SVG.has(tag);
  if (!svg && !TAGS_HTML.has(tag)) {
    throw new TypeError(`Tag fora da lista: "${tag}".`);
  }

  const elemento = svg
    ? documento.createElementNS(NAMESPACE_SVG, tag)
    : documento.createElement(tag);
  aplicarAtributos(elemento, tag, atributos);

  const lista = Array.isArray(filhos) ? filhos : [filhos];
  for (const filho of lista) {
    if (filho === null || filho === undefined || filho === false) {
      continue;
    }
    elemento.append(
      typeof filho === "string" || typeof filho === "number"
        ? documento.createTextNode(String(filho))
        : filho,
    );
  }
  return elemento;
};
