/**
 * @file Tipos compartilhados da página: o estado de cada uma das três partes da verificação.
 *
 * Não há código aqui, só `typedef` para o `tsc` conferir o que o `verificador` entrega e o que
 * `selo`, `escada` e `apresentacao` consomem. Cada parte passa por `verificando`, e termina em
 * `pronto` (com o resultado da função da spec 003, 004 ou 005, sem tradução) ou em `falha`
 * (com o `motivo`, o código estável que a consulta devolveu, e o `valor` que a frase encaixa).
 * Quem desenha troca o código pela frase (`textoDoMotivo`).
 */

// @ts-check

/**
 * A recusa ou falha de uma etapa: `motivo` é um código estável (`dominio-vazio`,
 * `resolvedor-http`) e `valor`, quando há, é o dado que a frase do catálogo encaixa em
 * `{valor}`.
 *
 * @typedef {{ motivo: string, valor?: string | number }} Recusa
 */
/** @typedef {import("./dmarc.js").ResultadoDmarc} ResultadoDmarc */
/** @typedef {import("./spf-consultas.js").CaminhadaSpf} ResultadoSpfCompleto */
/** @typedef {import("./dkim-busca.js").BuscaDkim} ResultadoDkimBusca */
/** @typedef {"dmarc" | "spf" | "dkim"} NomeParte */
/**
 * @template R
 * @typedef {{ fase: "verificando" }
 *   | ({ fase: "falha" } & Recusa)
 *   | { fase: "pronto", resultado: R, resolvedores: string[] }} EstadoDe
 */
/** @typedef {{ parte: "dmarc" } & EstadoDe<ResultadoDmarc>} EstadoDmarc */
/** @typedef {{ parte: "spf" } & EstadoDe<ResultadoSpfCompleto>} EstadoSpf */
/** @typedef {{ parte: "dkim" } & EstadoDe<ResultadoDkimBusca>} EstadoDkim */
/** @typedef {EstadoDmarc | EstadoSpf | EstadoDkim} EstadoParte */
/**
 * @typedef {{
 *   dominio: string, geracao: number, dominioInexistente: boolean,
 *   partes: { dmarc: EstadoDmarc, spf: EstadoSpf, dkim: EstadoDkim }
 * }} EstadoVerificacao
 */

export {};
