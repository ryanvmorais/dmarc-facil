/**
 * @file Endereço compartilhável: `?dominio=exemplo.com.br` preenche o campo ao abrir a página.
 *
 * Abrir um link não consulta nada: o campo é preenchido e o visitante decide quando o domínio
 * sai do navegador (ADR-8 da spec 006). Ao verificar, a página atualiza o endereço com
 * `history.replaceState`. Estas duas funções só leem e montam texto; quem normaliza o domínio é
 * `normalizarDominio`, no envio, e quem mexe no `history` é `pagina.js`.
 *
 * O parâmetro vem de um link que qualquer pessoa pode montar, então é entrada hostil: a
 * função devolve o texto como veio (`<script>` incluído), e a página só o põe em `value`.
 *
 * Os links de idioma levam o que está no campo para a outra página (ADR-6 da spec 008):
 * `montarEnderecoIdioma` junta a base fixa do link com o texto digitado, sem nunca deixar o texto
 * virar esquema nem marcação.
 */

// @ts-check

// ---------------------------------------------------------------------------
// LIMITES
// ---------------------------------------------------------------------------

// Um domínio tem até 253 caracteres; o dobro cobre a URL colada inteira que o campo aceita e
// ainda corta um parâmetro de megabytes.
const MAXIMO_PARAMETRO = 512;

// ---------------------------------------------------------------------------
// LEITURA E MONTAGEM
// ---------------------------------------------------------------------------

/**
 * Lê o domínio do `?dominio=` do endereço.
 *
 * Com o parâmetro repetido vale o primeiro. O `%`-escape é decodificado e o resultado é só
 * texto: nada aqui interpreta marcação.
 *
 * @param {unknown} busca - A parte de busca do endereço (``location.search``).
 * @returns {string} O valor do parâmetro, ou ``""`` se não há ou a entrada não é texto.
 */
export const lerDominioDoEndereco = (busca) => {
  if (typeof busca !== "string") {
    return "";
  }
  return (new URLSearchParams(busca).get("dominio") ?? "").slice(0, MAXIMO_PARAMETRO);
};

/**
 * Monta a busca do endereço para um domínio verificado.
 *
 * @param {string} dominio - O domínio já normalizado.
 * @returns {string} Por exemplo ``"?dominio=exemplo.com.br"``, com o domínio codificado.
 */
export const montarEndereco = (dominio) => `?${new URLSearchParams({ dominio }).toString()}`;

/**
 * Monta o endereço do link de idioma: a base do link mais o que está no campo.
 *
 * O texto é o do campo (digitado, ainda não verificado): quem normaliza é o envio da outra
 * página. Vai aparado, cortado no mesmo limite de `lerDominioDoEndereco` e codificado por
 * `URLSearchParams`, então `javascript:`, `<script>` e `%00` só aparecem codificados, depois do
 * `?dominio=`, e a base (`/` ou `/en/`) é a que veio do HTML.
 *
 * @param {string} base - O `href` do link como veio do HTML (`"/"` ou `"/en/"`).
 * @param {unknown} texto - O que está no campo de domínio.
 * @returns {string} A base sozinha se o campo está vazio; senão a base e o `?dominio=`.
 */
export const montarEnderecoIdioma = (base, texto) => {
  const aparado = typeof texto === "string" ? texto.trim().slice(0, MAXIMO_PARAMETRO) : "";
  return aparado === "" ? base : `${base}${montarEndereco(aparado)}`;
};
