/**
 * @file Selo de cada cartão: uma regra só, pura, para DMARC, SPF e DKIM.
 *
 * O selo resume o cartão em quatro estados (`ok`, `atencao`, `problema`, `nao-verificado`).
 * Os módulos das specs 003 a 005 devolvem `gravidade` por achado, e gravidade não é selo: o
 * selo também depende de o registro existir e de a consulta ter funcionado. As regras estão no
 * ADR-6 da spec 006 e cada uma tem teste. O módulo é puro (sem DOM, sem rede).
 */

// @ts-check

import { TEXTOS_SELO } from "./textos-interface.js";

/** @typedef {import("./tipos.js").EstadoParte} EstadoParte */
/** @typedef {import("./tipos.js").EstadoDe<unknown>} EstadoQualquer */
/** @typedef {import("./tipos.js").NomeParte} NomeParte */
/** @typedef {"ok" | "atencao" | "problema" | "nao-verificado"} EstadoSelo */
/** @typedef {{ estado: EstadoSelo, texto: string }} Selo */
/** @typedef {{ gravidade: "erro" | "aviso" | "info" }} ComGravidade */

// ---------------------------------------------------------------------------
// AUXILIARES
// ---------------------------------------------------------------------------

/**
 * @param {EstadoSelo} estado - Estado do selo.
 * @returns {Selo} O selo com a palavra fixa do estado.
 */
const selo = (estado) => ({ estado, texto: TEXTOS_SELO[estado].texto });

/**
 * O selo que o pior achado pede: `erro` é problema, `aviso` é atenção, o resto está ok.
 *
 * @param {ComGravidade[]} achados - Achados do cartão.
 * @returns {EstadoSelo} `problema`, `atencao` ou `ok`.
 */
const pelaGravidade = (achados) => {
  if (achados.some((achado) => achado.gravidade === "erro")) {
    return "problema";
  }
  return achados.some((achado) => achado.gravidade === "aviso") ? "atencao" : "ok";
};

/**
 * Regra 4: uma leitura incompleta nunca fica `ok`, porque faltou olhar parte do que existe.
 *
 * @param {EstadoSelo} estado - Estado já calculado.
 * @param {boolean} incompleta - Se a leitura ficou incompleta.
 * @returns {EstadoSelo} `atencao` se estava `ok` e incompleta, senão o mesmo estado.
 */
const comIncompleta = (estado, incompleta) => (incompleta && estado === "ok" ? "atencao" : estado);

// ---------------------------------------------------------------------------
// CÁLCULO
// ---------------------------------------------------------------------------

/**
 * Calcula o selo de uma das três partes.
 *
 * 1. Parte que não terminou (`verificando`) ou falhou: `nao-verificado`.
 * 2. DMARC e SPF: registro `ausente`, `invalido` ou `multiplos` é `problema`; `valido` vale o
 *    pior achado.
 * 3. DKIM: `encontrado` vale o pior achado; `nao-encontrado` é `atencao` (não achar não é erro,
 *    mas também não é "tudo bem": o seletor é escolha de quem envia); `indeterminado` é
 *    `nao-verificado`.
 * 4. Leitura `incompleta` sobe `ok` para `atencao`.
 *
 * @param {NomeParte} parte - Qual parte é.
 * @param {EstadoParte} estadoParte - O estado da parte, como o `verificador` o entrega.
 * @returns {Selo} O selo do cartão.
 */
export const calcularSelo = (parte, estadoParte) => {
  if (estadoParte.fase !== "pronto") {
    return selo("nao-verificado");
  }

  if (parte === "dkim") {
    const busca = /** @type {import("./tipos.js").ResultadoDkimBusca} */ (estadoParte.resultado);
    if (busca.situacao === "indeterminado") {
      return selo("nao-verificado");
    }
    if (busca.situacao === "nao-encontrado") {
      return selo("atencao");
    }
    return selo(comIncompleta(pelaGravidade(busca.achados), busca.incompleta));
  }

  if (parte === "spf") {
    const caminhada = /** @type {import("./tipos.js").ResultadoSpfCompleto} */ (
      estadoParte.resultado
    );
    if (caminhada.spf.situacao !== "valido") {
      return selo("problema");
    }
    return selo(comIncompleta(pelaGravidade(caminhada.achados), caminhada.consultas.incompleta));
  }

  const dmarc = /** @type {import("./tipos.js").ResultadoDmarc} */ (estadoParte.resultado);
  return selo(dmarc.situacao === "valido" ? pelaGravidade(dmarc.achados) : "problema");
};
