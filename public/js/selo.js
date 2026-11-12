/**
 * @file Selo de cada cartão: uma regra só, pura, para DMARC, SPF e DKIM.
 *
 * O selo resume o cartão em quatro estados (`ok`, `atencao`, `problema`, `nao-verificado`).
 * Os módulos das specs 003 a 005 devolvem `gravidade` por achado, e gravidade não é selo: o
 * selo também depende de o registro existir e de a consulta ter funcionado. As regras estão no
 * ADR-6 da spec 006 e cada uma tem teste. O módulo é puro (sem DOM, sem rede) e não carrega
 * frase: a palavra do selo vem do catálogo que a chamada recebe.
 */

// @ts-check

import { ajustarChaveFixa } from "./chave-fixa.js";

/** @typedef {import("./textos/tipos.js").Textos} Textos */
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
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {EstadoSelo} estado - Estado do selo.
 * @returns {Selo} O selo com a palavra fixa do estado.
 */
const selo = (textos, estado) => ({ estado, texto: textos.interface.selo[estado].texto });

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
 * 3. DKIM: `encontrado` vale o pior achado, com a gravidade ajustada pela regra da chave fixa
 *    (chave-fixa.js); `nao-encontrado` é `atencao` (não achar não é erro, mas também não é
 *    "tudo bem": o seletor é escolha de quem envia); `indeterminado` é `nao-verificado`.
 * 4. Leitura `incompleta` sobe `ok` para `atencao`.
 *
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {NomeParte} parte - Qual parte é.
 * @param {EstadoParte} estadoParte - O estado da parte, como o `verificador` o entrega.
 * @returns {Selo} O selo do cartão.
 */
export const calcularSelo = (textos, parte, estadoParte) => {
  if (estadoParte.fase !== "pronto") {
    return selo(textos, "nao-verificado");
  }

  if (parte === "dkim") {
    const busca = /** @type {import("./tipos.js").ResultadoDkimBusca} */ (estadoParte.resultado);
    if (busca.situacao === "indeterminado") {
      return selo(textos, "nao-verificado");
    }
    if (busca.situacao === "nao-encontrado") {
      return selo(textos, "atencao");
    }
    // A gravidade que conta é a da tela: a chave curta de quem tem `chaveFixa` é `info`.
    return selo(
      textos,
      comIncompleta(pelaGravidade(ajustarChaveFixa(busca.achados)), busca.incompleta),
    );
  }

  if (parte === "spf") {
    const caminhada = /** @type {import("./tipos.js").ResultadoSpfCompleto} */ (
      estadoParte.resultado
    );
    if (caminhada.spf.situacao !== "valido") {
      return selo(textos, "problema");
    }
    return selo(
      textos,
      comIncompleta(pelaGravidade(caminhada.achados), caminhada.consultas.incompleta),
    );
  }

  const dmarc = /** @type {import("./tipos.js").ResultadoDmarc} */ (estadoParte.resultado);
  return selo(textos, dmarc.situacao === "valido" ? pelaGravidade(dmarc.achados) : "problema");
};
