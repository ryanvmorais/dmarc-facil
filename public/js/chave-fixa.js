/**
 * @file A regra da chave fixa: o que muda nos achados do DKIM quando o seletor é de um provedor
 * que define a chave e não deixa o cliente trocar o tamanho (`chaveFixa` em seletores-dkim.js).
 *
 * Ali a chave de 1024 a 2047 bits continua apontada, mas como `info`, não como `aviso`: não há
 * próximo passo possível, e um aviso permanente ensinaria o visitante a ignorar o selo. Nos
 * demais seletores o aviso fica, porque o provedor deixa gerar a chave de 2048 bits que a
 * RFC 8301 recomenda.
 *
 * O selo (selo.js) e o cartão (apresentacao.js) passam os achados por esta mesma função, para
 * os dois nunca discordarem. É puro: sem DOM, sem rede e sem frase.
 */

// @ts-check

import { ORDEM_GRAVIDADE } from "./dkim.js";
import { SELETORES_COMUNS } from "./seletores-dkim.js";

/** @typedef {import("./seletores-dkim.js").SeletorComum} SeletorComum */
/** @typedef {import("./dkim.js").Achado} Achado */

// ---------------------------------------------------------------------------
// CONSULTA
// ---------------------------------------------------------------------------

/**
 * @param {string | undefined} seletor - O seletor de um achado, se houver.
 * @returns {SeletorComum | undefined} O seletor comum, se ele tem `chaveFixa`; senão nada.
 */
export const seletorComChaveFixa = (seletor) =>
  seletor === undefined
    ? undefined
    : SELETORES_COMUNS.find((item) => item.seletor === seletor && item.chaveFixa !== undefined);

/**
 * @param {{ codigo: string, seletor?: string }} achado - Um achado do DKIM.
 * @returns {boolean} `true` se é a chave abaixo de 2048 bits num seletor com `chaveFixa`.
 */
export const ehChaveFixaCurta = (achado) =>
  achado.codigo === "chave-abaixo-do-recomendado" &&
  seletorComChaveFixa(achado.seletor) !== undefined;

// ---------------------------------------------------------------------------
// AJUSTE
// ---------------------------------------------------------------------------

/**
 * Rebaixa a `info` o achado de chave abaixo de 2048 bits nos seletores com `chaveFixa` e
 * reordena por gravidade (o `sort` é estável: dentro da mesma gravidade, a ordem da busca
 * fica), para uma informação nunca aparecer acima de um aviso.
 *
 * @param {Achado[]} achados - Os achados da busca do DKIM, já ordenados por ela.
 * @returns {Achado[]} Uma lista nova com as gravidades ajustadas; a de entrada não muda.
 */
export const ajustarChaveFixa = (achados) =>
  achados
    .map((achado) =>
      ehChaveFixaCurta(achado) ? { ...achado, gravidade: /** @type {const} */ ("info") } : achado,
    )
    .sort((a, b) => ORDEM_GRAVIDADE[a.gravidade] - ORDEM_GRAVIDADE[b.gravidade]);
