/**
 * @file Escolhe o texto de um achado e o de uma recusa no catálogo do idioma da página.
 *
 * Os módulos puros devolvem códigos e dados; aqui o código encontra a frase. O catálogo vem
 * como parâmetro (ADR-3 da spec 008), então o mesmo código serve a qualquer idioma. Sem entrada
 * para o código, vale a frase genérica do próprio catálogo, no idioma da página (ADR-11).
 *
 * É lógica mínima, sem DOM e sem rede.
 */

// @ts-check

import { preencher } from "../preencher.js";

/** @typedef {import("./tipos.js").Textos} Textos */
/** @typedef {import("../tipos.js").Recusa} Recusa */
/** @typedef {import("./tipos.js").TextoAchado} TextoAchado */
/**
 * O achado como os módulos o devolvem (a união dos campos das specs 003 a 005).
 *
 * @typedef {{
 *   codigo: string, gravidade: "erro" | "aviso" | "info", tag?: string,
 *   detalhe?: number | string, seletor?: string, dominio?: string
 * }} AchadoLido
 */
/**
 * O achado pronto para a tela. `detalhe` já é texto (e, no `seletor-invalido`, já na língua da
 * página); quem desenha o corta e o põe como texto puro.
 *
 * @typedef {{
 *   codigo: string, gravidade: "erro" | "aviso" | "info", titulo: string, explicacao: string,
 *   acao: string, tag?: string, detalhe?: string, seletor?: string, seletores?: string[],
 *   dominio?: string
 * }} AchadoVisivel
 */

/**
 * A frase de uma recusa ou falha, a partir do código que o módulo devolveu.
 *
 * O `valor` entra onde a frase tem `{valor}` (o status HTTP, o `Status` do DNS). Código sem
 * entrada no catálogo devolve a frase de `sem-motivo`, nunca o código cru: a página não mostra
 * identificador interno ao visitante.
 *
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {Recusa} recusa - O `motivo` (código) e o `valor`, se houver.
 * @returns {string} A frase pronta para mostrar.
 */
export const textoDoMotivo = (textos, { motivo, valor }) => {
  const { motivos } = textos;
  const entrada = Object.hasOwn(motivos, motivo) ? motivos[motivo] : motivos["sem-motivo"];
  return preencher(entrada?.texto ?? "", valor === undefined ? {} : { valor });
};

/**
 * Junta o achado ao texto dele.
 *
 * O `detalhe` do `seletor-invalido` é o motivo da recusa, que o módulo devolve como código
 * (`caractere-invalido`); aqui vira a frase, e um detalhe que não é código passa como texto.
 * Os demais detalhes (números, o termo SPF que falhou) passam como texto.
 *
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {AchadoLido} achado - O achado como o módulo o devolveu.
 * @returns {AchadoVisivel} O achado com título, explicação e ação.
 */
export const textoDoAchado = (textos, achado) => {
  const { porCodigo, generico } = textos.achados;
  const codigo = String(achado.codigo);
  const entrada = Object.hasOwn(porCodigo, codigo) ? porCodigo[codigo] : undefined;
  const { titulo, explicacao, acao } =
    entrada ??
    /** @type {TextoAchado} */ ({
      titulo: generico.titulo,
      explicacao: preencher(generico.explicacao, { codigo }),
      acao: generico.acao,
    });

  const bruto = achado.detalhe;
  const detalhe =
    achado.codigo === "seletor-invalido" && typeof bruto === "string"
      ? Object.hasOwn(textos.motivos, bruto)
        ? textoDoMotivo(textos, { motivo: bruto })
        : bruto
      : bruto === undefined
        ? undefined
        : String(bruto);

  return {
    codigo,
    gravidade: achado.gravidade,
    titulo,
    explicacao,
    acao,
    ...(achado.tag === undefined ? {} : { tag: achado.tag }),
    ...(detalhe === undefined ? {} : { detalhe }),
    ...(achado.seletor === undefined ? {} : { seletor: achado.seletor }),
    ...(achado.dominio === undefined ? {} : { dominio: achado.dominio }),
  };
};
