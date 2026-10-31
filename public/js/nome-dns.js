/**
 * @file Validação do nome DNS que vira consulta DoH.
 *
 * Quem monta o nome (`_dmarc.exemplo.com.br`, `seletor._domainkey.exemplo.com.br`) é a
 * ferramenta, a partir de um domínio já normalizado por `normalizarDominio`. Mesmo assim o
 * módulo da consulta não confia nisso: o nome vai dentro de uma URL, então esta é a segunda
 * barreira (defesa em profundidade) contra um texto que injete parâmetro ou quebre a consulta.
 *
 * Diferente de `normalizarDominio`, aceita sublinhado (`_dmarc`, `_domainkey`) e não exige
 * dois rótulos nem recusa endereço IP: aqui só importa que o nome seja seguro de pôr na URL.
 * O módulo é puro (sem DOM, sem rede).
 */

// @ts-check

import { TAMANHO_MAXIMO_DOMINIO, TAMANHO_MAXIMO_ROTULO } from "./dominio.js";

// Letras, dígitos, hífen, sublinhado e ponto. Tudo o que a URL trata como separador ou
// escape (`& = ? # / % :`) e o espaço ficam de fora.
const PADRAO_NOME = /^[a-z0-9_.-]+$/i;

/**
 * @typedef {{ ok: true, nome: string } | { ok: false, motivo: string }} ResultadoNome
 */

/**
 * Valida um nome DNS já montado e o devolve em minúsculas, sem o ponto final.
 *
 * @param {string} entrada - Nome montado pela ferramenta, ex.: ``"_dmarc.exemplo.com.br"``.
 * @returns {ResultadoNome} ``{ ok: true, nome }`` pronto para a consulta, ou ``{ ok: false,
 *   motivo }`` com a explicação em português.
 */
export const validarNomeDns = (entrada) => {
  // Um único ponto final é a forma absoluta do nome; descartá-lo não muda a consulta.
  const nome = entrada.replace(/\.$/, "").toLowerCase();

  if (nome === "") {
    return { ok: false, motivo: "O nome da consulta está vazio." };
  }
  if (nome.length > TAMANHO_MAXIMO_DOMINIO) {
    return {
      ok: false,
      motivo: "O nome da consulta é comprido demais (o limite é 253 caracteres).",
    };
  }
  if (!PADRAO_NOME.test(nome)) {
    return { ok: false, motivo: "O nome da consulta tem um caractere que não é permitido." };
  }

  for (const rotulo of nome.split(".")) {
    if (rotulo === "") {
      return {
        ok: false,
        motivo: "O nome da consulta tem uma parte vazia (dois pontos seguidos).",
      };
    }
    if (rotulo.length > TAMANHO_MAXIMO_ROTULO) {
      return { ok: false, motivo: "Uma parte do nome da consulta passa de 63 caracteres." };
    }
  }

  return { ok: true, nome };
};
