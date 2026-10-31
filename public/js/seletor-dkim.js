/**
 * @file Validação do seletor DKIM digitado pelo visitante e montagem da lista de seletores.
 *
 * O seletor é a primeira parte do nome `<seletor>._domainkey.<domínio>`. Como o nome vai dentro
 * de uma URL de consulta DoH, o que o visitante digita passa por aqui antes de virar consulta.
 * A RFC 6376 (3.1) define o seletor como `sub-domain *( "." sub-domain )`: pontos são
 * permitidos e separam componentes. Aqui também se aceita sublinhado, que provedores usam,
 * embora o `sub-domain` da RFC 5321 não o tenha.
 *
 * O módulo é puro (sem DOM, sem rede), e nenhuma entrada lança exceção.
 */

// @ts-check

/**
 * @typedef {"vazio" | "parece-nome-completo" | "grande-demais" | "componente-vazio"
 *   | "componente-grande-demais" | "caractere-invalido"} MotivoSeletor
 */
/**
 * @typedef {{ ok: true, seletor: string } | { ok: false, motivo: MotivoSeletor }}
 *   ResultadoSeletor
 */

// ---------------------------------------------------------------------------
// LIMITES E PADRÕES
// ---------------------------------------------------------------------------

// Seletores reais têm poucos caracteres; 100 deixa folga e, somado a `._domainkey.` e ao
// domínio, ainda cabe nos 253 caracteres de um nome DNS (quem confere é `validarNomeDns`).
export const TAMANHO_MAXIMO_SELETOR = 100;
// Teto da lista inteira (comuns e digitados), para o visitante não disparar centenas de
// consultas ao resolvedor.
export const MAXIMO_SELETORES = 40;
// Tamanho máximo de um rótulo DNS.
const TAMANHO_MAXIMO_COMPONENTE = 63;
// Letras, dígitos, hífen e sublinhado, já em minúsculas. Ancorada e sem repetição aninhada.
const PADRAO_COMPONENTE = /^[a-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// SELETOR DIGITADO
// ---------------------------------------------------------------------------

/**
 * Valida e normaliza um seletor digitado.
 *
 * Passa para minúsculas e tira os espaços das pontas. Recusa o que não é seletor: vazio,
 * grande demais, com componente vazio (`a..b`, `.a`, `a.`) ou grande demais, com caractere
 * fora do conjunto aceito (o que também barra `/`, `?`, `#`, `:`, `@`, `%` e controle) e o
 * nome completo (`google._domainkey.exemplo.com.br`), porque a ferramenta monta o resto.
 *
 * @param {unknown} entrada - O que o visitante digitou.
 * @returns {ResultadoSeletor} ``{ ok: true, seletor }``, ou ``{ ok: false, motivo }`` com o
 *   motivo em código estável.
 */
export const normalizarSeletor = (entrada) => {
  if (typeof entrada !== "string") {
    return { ok: false, motivo: "vazio" };
  }

  const seletor = entrada.trim().toLowerCase();
  if (seletor === "") {
    return { ok: false, motivo: "vazio" };
  }
  // Nenhum seletor real tem esse trecho; quem digita o nome inteiro quase sempre o inclui.
  if (seletor.includes("_domainkey")) {
    return { ok: false, motivo: "parece-nome-completo" };
  }
  if (seletor.length > TAMANHO_MAXIMO_SELETOR) {
    return { ok: false, motivo: "grande-demais" };
  }

  for (const componente of seletor.split(".")) {
    if (componente === "") {
      return { ok: false, motivo: "componente-vazio" };
    }
    if (componente.length > TAMANHO_MAXIMO_COMPONENTE) {
      return { ok: false, motivo: "componente-grande-demais" };
    }
    if (!PADRAO_COMPONENTE.test(componente)) {
      return { ok: false, motivo: "caractere-invalido" };
    }
  }

  return { ok: true, seletor };
};

// ---------------------------------------------------------------------------
// LISTA FINAL
// ---------------------------------------------------------------------------

/**
 * Junta os seletores comuns e os digitados numa lista só.
 *
 * A ordem é a dos comuns e depois a dos digitados. Cada um passa por `normalizarSeletor`:
 * o inválido é descartado (a página já o mostrou ao visitante na hora da digitação), o
 * repetido sai, e o que passa de `MAXIMO_SELETORES` é cortado e contado em `cortados`.
 *
 * @param {unknown} comuns - Seletores da lista comum.
 * @param {unknown} digitados - Seletores que o visitante digitou.
 * @returns {{ seletores: string[], cortados: number }} A lista final e quantos passaram do teto.
 */
export const juntarSeletores = (comuns, digitados) => {
  const brutos = [
    ...(Array.isArray(comuns) ? comuns : []),
    ...(Array.isArray(digitados) ? digitados : []),
  ];
  const vistos = new Set();
  /** @type {string[]} */
  const seletores = [];
  let cortados = 0;

  for (const bruto of brutos) {
    const lido = normalizarSeletor(bruto);
    if (!lido.ok || vistos.has(lido.seletor)) {
      continue;
    }
    vistos.add(lido.seletor);
    if (seletores.length >= MAXIMO_SELETORES) {
      cortados += 1;
      continue;
    }
    seletores.push(lido.seletor);
  }

  return { seletores, cortados };
};
