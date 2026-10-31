/**
 * @file Escada do DMARC (interface C): em que degrau o domínio está e qual é o próximo.
 *
 * A escada tem três degraus (`none`, `quarantine`, `reject`). O do `estagio` do registro é o
 * atual, o seguinte é o "Próximo passo" e só ele traz o que fazer. Sem registro válido
 * (ausente, inválido ou duplicado) nenhum degrau é o atual e o próximo passo é publicar o
 * registro com `p=none`. Um `reject` que vale só para parte do tráfego ou dos subdomínios
 * ganha uma ressalva, para a página não afirmar proteção completa. O módulo é puro (sem DOM,
 * sem rede); o português dos degraus vem de `textos-interface.js`.
 */

// @ts-check

import {
  ACOES_PROXIMO,
  ETIQUETAS_DEGRAU,
  TEXTOS_DEGRAUS,
  TEXTOS_ESCADA,
} from "./textos-interface.js";

/** @typedef {import("./dmarc.js").ResultadoDmarc} ResultadoDmarc */
/** @typedef {"none" | "quarantine" | "reject"} PoliticaDegrau */
/**
 * Um degrau. `etiqueta` é a palavra que marca o degrau atual ("você está aqui") ou o seguinte
 * ("Próximo passo"); `acao` só existe no degrau com `papel: "proximo"`.
 *
 * @typedef {{
 *   politica: PoliticaDegrau, papel: "atual" | "proximo" | "outro",
 *   titulo: string, resumo: string, etiqueta?: string, acao?: string
 * }} Degrau
 */
/**
 * @typedef {{
 *   degraus: Degrau[], semAtual: boolean,
 *   proximo: "quarantine" | "reject" | "publicar" | null,
 *   ressalvas: Array<"subdominios-mais-fracos" | "aplicacao-parcial">
 * }} Escada
 */

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------

/** @type {ReadonlyArray<PoliticaDegrau>} */
const ORDEM = ["none", "quarantine", "reject"];

// O degrau que vem depois de cada um; no último não há próximo.
/** @type {Record<PoliticaDegrau, "quarantine" | "reject" | null>} */
const SEGUINTE = { none: "quarantine", quarantine: "reject", reject: null };

const RESSALVAS = /** @type {const} */ (["subdominios-mais-fracos", "aplicacao-parcial"]);

// ---------------------------------------------------------------------------
// MONTAGEM
// ---------------------------------------------------------------------------

/**
 * @param {PoliticaDegrau} politica - Política do degrau.
 * @param {Degrau["papel"]} papel - Papel do degrau nesta escada.
 * @param {string} [acao] - O que fazer, só para o degrau seguinte.
 * @returns {Degrau} O degrau com os textos.
 */
const degrau = (politica, papel, acao) => {
  const { titulo, resumo } = TEXTOS_DEGRAUS[politica];
  return {
    politica,
    papel,
    titulo,
    resumo,
    ...(papel === "outro" ? {} : { etiqueta: ETIQUETAS_DEGRAU[papel].texto }),
    ...(acao === undefined ? {} : { acao }),
  };
};

/**
 * Monta a escada a partir da leitura do DMARC.
 *
 * @param {ResultadoDmarc} dmarc - O resultado de `lerDmarc`.
 * @returns {Escada} Os três degraus, o próximo passo e as ressalvas.
 */
export const montarEscada = (dmarc) => {
  if (dmarc.situacao !== "valido") {
    // Sem registro que valha: o primeiro degrau é o destino, e publicar é o passo.
    const acao = ACOES_PROXIMO.publicar[dmarc.situacao].texto;
    return {
      degraus: ORDEM.map((politica) =>
        politica === "none" ? degrau(politica, "proximo", acao) : degrau(politica, "outro"),
      ),
      semAtual: true,
      proximo: "publicar",
      ressalvas: [],
    };
  }

  const atual = dmarc.estagio;
  const seguinte = SEGUINTE[atual];
  const codigos = dmarc.achados.map((achado) => achado.codigo);
  return {
    degraus: ORDEM.map((politica) => {
      if (politica === atual) {
        return degrau(politica, "atual");
      }
      if (politica === seguinte) {
        return degrau(politica, "proximo", ACOES_PROXIMO[politica].texto);
      }
      return degrau(politica, "outro");
    }),
    semAtual: false,
    proximo: seguinte,
    ressalvas: RESSALVAS.filter((ressalva) => codigos.includes(ressalva)),
  };
};

/**
 * O texto que a página mostra no lugar do "Próximo passo" quando não há mais degrau.
 *
 * @param {Escada} escada - A escada montada.
 * @returns {string | null} A frase do degrau final, ou `null` se há próximo passo.
 */
export const textoDoFim = (escada) =>
  escada.proximo === null && !escada.semAtual ? TEXTOS_ESCADA.final.texto : null;
