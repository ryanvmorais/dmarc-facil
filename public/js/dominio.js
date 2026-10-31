/**
 * @file Validação e normalização do domínio digitado pelo visitante.
 *
 * Tudo o que o visitante digita passa por aqui antes de virar consulta DNS: o domínio vai
 * dentro de uma URL de DoH, então um texto malformado nunca pode chegar ao resolvedor.
 * O módulo é puro (sem DOM, sem rede) para rodar igual no navegador e nos testes.
 *
 * Aceita o que as pessoas colam de fato (`https://exemplo.com.br/pagina`,
 * `contato@exemplo.com.br`, `Exemplo.com.br.`) e devolve só o nome de domínio em ASCII
 * minúsculo, com domínios internacionais já em punycode (`xn--...`).
 */

// @ts-check

// ---------------------------------------------------------------------------
// LIMITES DO DNS
// RFC 1035: 63 caracteres por rótulo e 253 no nome inteiro em texto.
// ---------------------------------------------------------------------------

// Rótulo é cada trecho entre pontos (`exemplo` em `exemplo.com.br`).
const TAMANHO_MAXIMO_ROTULO = 63;
// Nome inteiro em texto, sem contar o ponto final.
const TAMANHO_MAXIMO_DOMINIO = 253;

// Letras, dígitos e hífen, sem hífen nas pontas. Sublinhado fica de fora de propósito: ele
// só existe em nomes de serviço (`_dmarc`), que a ferramenta monta sozinha.
const PADRAO_ROTULO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// Esquema no início (`https://`), para descartar o que o visitante copiou da barra de endereço.
const PADRAO_ESQUEMA = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * @typedef {{ ok: true, dominio: string } | { ok: false, motivo: string }} ResultadoDominio
 */

// ---------------------------------------------------------------------------
// NORMALIZAÇÃO
// ---------------------------------------------------------------------------

/**
 * Extrai o nome de host do que o visitante digitou, sem validar.
 *
 * Passos: tira espaços e esquema, corta no primeiro `/`, `?` ou `#`, fica com o que vem
 * depois do último `@` (e-mail colado) e descarta um ponto final.
 *
 * @param {string} entrada - Texto digitado, ex.: ``"https://Exemplo.com.br/x"``.
 * @returns {string} Host ainda não validado, ex.: ``"Exemplo.com.br"``.
 */
const extrairHost = (entrada) => {
  const semEsquema = entrada.trim().replace(PADRAO_ESQUEMA, "");
  const semCaminho = semEsquema.split(/[/?#]/, 1)[0] ?? "";
  const aposArroba = semCaminho.slice(semCaminho.lastIndexOf("@") + 1);
  return aposArroba.replace(/\.$/, "");
};

/**
 * Converte para ASCII minúsculo, com domínios internacionais em punycode.
 *
 * Usa o analisador de URL da plataforma, que o navegador e o Node implementam do mesmo
 * jeito, em vez de uma biblioteca de punycode: zero dependência de runtime.
 *
 * @param {string} host - Host extraído, ex.: ``"Exemplo.com.br"`` ou ``"bücher.de"``.
 * @returns {string | null} Host em ASCII, ou ``null`` se a plataforma o rejeitar.
 */
const paraAscii = (host) => {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// VALIDAÇÃO
// ---------------------------------------------------------------------------

/**
 * Valida e normaliza um domínio digitado pelo visitante.
 *
 * Rejeita o que não é um nome de domínio consultável: vazio, porta, endereço IP, nome sem
 * ponto (`localhost`), rótulo inválido ou comprido demais. Endereço IP é detectado pelo
 * último rótulo numérico, porque nenhuma TLD é só dígitos; o analisador de URL também
 * converte formas como `0x7f.1` em `127.0.0.1`, e essas caem na mesma regra.
 *
 * @param {string} entrada - Texto digitado, ex.: ``"https://Exemplo.com.br/"``.
 * @returns {ResultadoDominio} ``{ ok: true, dominio }`` normalizado, ou ``{ ok: false,
 *   motivo }`` com a explicação em português para mostrar ao visitante.
 */
export const normalizarDominio = (entrada) => {
  const host = extrairHost(entrada);
  if (host === "") {
    return { ok: false, motivo: "Digite um domínio, por exemplo exemplo.com.br." };
  }
  if (host.includes(":")) {
    return { ok: false, motivo: "Digite só o domínio, sem porta nem endereço IPv6." };
  }

  const dominio = paraAscii(host);
  if (dominio === null || dominio === "") {
    return { ok: false, motivo: "Esse texto não é um domínio válido." };
  }
  if (dominio.length > TAMANHO_MAXIMO_DOMINIO) {
    return { ok: false, motivo: "O domínio é comprido demais (o limite é 253 caracteres)." };
  }

  const rotulos = dominio.split(".");
  if (rotulos.length < 2) {
    return { ok: false, motivo: "Use o domínio completo, por exemplo exemplo.com.br." };
  }
  if (/^\d+$/.test(rotulos[rotulos.length - 1] ?? "")) {
    return { ok: false, motivo: "Endereço IP não tem DMARC: digite o nome do domínio." };
  }
  for (const rotulo of rotulos) {
    if (rotulo.length > TAMANHO_MAXIMO_ROTULO) {
      return { ok: false, motivo: "Uma parte do domínio passa de 63 caracteres." };
    }
    if (!PADRAO_ROTULO.test(rotulo)) {
      return { ok: false, motivo: "O domínio só pode ter letras, números e hífen." };
    }
  }

  return { ok: true, dominio };
};
