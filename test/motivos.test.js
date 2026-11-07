/**
 * @file Testes do catálogo de motivos de recusa e falha (RF-03 da spec 008, ADR-5 e ADR-11).
 *
 * Os módulos puros devolvem o motivo como código estável, e a frase mora em `MOTIVOS`. Três
 * garantias: todo código que um módulo emite tem entrada (senão a página cairia na frase de
 * `sem-motivo`), toda entrada é emitida por alguém (senão é texto morto), e cada código dá a
 * mesma frase que a página mostrava antes da troca. A varredura é textual, como a dos achados;
 * outro teste exige que ela ache código, para a varredura vazia não calar.
 */

// @ts-check

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { textoDoMotivo } from "../public/js/textos/resolver.js";
import { textos } from "./ajudas/textos.js";

// Os motivos do catálogo em português, o idioma de referência.
const MOTIVOS = textos.motivos;

// ---------------------------------------------------------------------------
// VARREDURA DOS MÓDULOS
// ---------------------------------------------------------------------------

// `motivo: "codigo"`: o único jeito de um módulo escrever um código de recusa.
const PADRAO_MOTIVO = /motivo: "([a-z0-9-]+)"/g;

/** @returns {Promise<Map<string, string[]>>} Os códigos emitidos, com os arquivos que os emitem. */
const codigosEmitidos = async () => {
  const pasta = new URL("../public/js/", import.meta.url);
  const arquivos = (await readdir(pasta)).filter((arquivo) => arquivo.endsWith(".js"));
  /** @type {Map<string, string[]>} */
  const emitidos = new Map();
  for (const arquivo of arquivos) {
    const fonte = await readFile(new URL(arquivo, pasta), "utf8");
    for (const [, codigo] of fonte.matchAll(PADRAO_MOTIVO)) {
      emitidos.set(String(codigo), [...(emitidos.get(String(codigo)) ?? []), arquivo]);
    }
  }
  return emitidos;
};

// ---------------------------------------------------------------------------
// COBERTURA
// ---------------------------------------------------------------------------

describe("motivos: cobertura dos códigos", () => {
  it("a varredura acha os códigos dos módulos que recusam", async () => {
    const emitidos = await codigosEmitidos();

    for (const arquivo of [
      "dominio.js",
      "nome-dns.js",
      "resposta-doh.js",
      "doh.js",
      "dkim-busca.js",
      "verificador.js",
      "seletor-dkim.js",
    ]) {
      assert.ok(
        [...emitidos.values()].some((arquivos) => arquivos.includes(arquivo)),
        `a varredura não achou nenhum código em ${arquivo}`,
      );
    }
  });

  it("todo código emitido pelos módulos tem entrada em MOTIVOS", async () => {
    const semEntrada = [...(await codigosEmitidos()).keys()].filter(
      (codigo) => !Object.hasOwn(MOTIVOS, codigo),
    );

    assert.deepEqual(semEntrada, []);
  });

  it("toda entrada de MOTIVOS é emitida por algum módulo", async () => {
    const emitidos = await codigosEmitidos();
    const mortas = Object.keys(MOTIVOS).filter((codigo) => !emitidos.has(codigo));

    assert.deepEqual(mortas, []);
  });

  it("nenhuma entrada de MOTIVOS tem texto vazio", () => {
    for (const [codigo, { texto }] of Object.entries(MOTIVOS)) {
      assert.notEqual(texto.trim(), "", codigo);
    }
  });
});

// ---------------------------------------------------------------------------
// AS FRASES DE ANTES
// ---------------------------------------------------------------------------

// Cada frase por extenso, como a página a mostrava antes de a recusa virar código (apêndice A
// da spec 008). Escritas aqui de propósito: se alguém mudar o texto do catálogo, o teste pede
// que mude também a frase esperada, e a mudança não passa despercebida.
/** @type {Array<[string, string | number | undefined, string]>} Código, valor e a frase. */
const FRASES = [
  ["dominio-vazio", undefined, "Digite um domínio, por exemplo exemplo.com.br."],
  ["dominio-com-porta-ou-ipv6", undefined, "Digite só o domínio, sem porta nem endereço IPv6."],
  ["dominio-invalido", undefined, "Esse texto não é um domínio válido."],
  [
    "dominio-comprido-demais",
    undefined,
    "O domínio é comprido demais (o limite é 253 caracteres).",
  ],
  ["dominio-incompleto", undefined, "Use o domínio completo, por exemplo exemplo.com.br."],
  ["dominio-e-ip", undefined, "Endereço IP não tem DMARC: digite o nome do domínio."],
  ["dominio-parte-comprida-demais", undefined, "Uma parte do domínio passa de 63 caracteres."],
  ["dominio-caractere-invalido", undefined, "O domínio só pode ter letras, números e hífen."],
  ["nome-vazio", undefined, "O nome da consulta está vazio."],
  [
    "nome-comprido-demais",
    undefined,
    "O nome da consulta é comprido demais (o limite é 253 caracteres).",
  ],
  [
    "nome-caractere-invalido",
    undefined,
    "O nome da consulta tem um caractere que não é permitido.",
  ],
  ["nome-parte-vazia", undefined, "O nome da consulta tem uma parte vazia (dois pontos seguidos)."],
  [
    "nome-parte-comprida-demais",
    undefined,
    "Uma parte do nome da consulta passa de 63 caracteres.",
  ],
  ["resposta-nao-objeto", undefined, "A resposta do resolvedor não é um objeto."],
  ["resposta-sem-status", undefined, "A resposta do resolvedor não traz o Status."],
  ["resposta-status-dns", 2, "O resolvedor não conseguiu resolver o nome (Status 2)."],
  ["resposta-answer-invalido", undefined, "O Answer da resposta não é uma lista."],
  ["resolvedor-http", 503, "O resolvedor respondeu HTTP 503."],
  [
    "consulta-falhou",
    undefined,
    "A consulta ao resolvedor falhou (rede, tempo ou resposta inválida).",
  ],
  [
    "resolvedores-indisponiveis",
    undefined,
    "Não consegui consultar o DNS agora, nem pela Cloudflare nem pelo Google. Confira sua conexão e tente de novo.",
  ],
  ["sem-seletores", undefined, "Não há seletor para procurar."],
  ["sem-motivo", undefined, "Não consegui consultar o DNS agora."],
  // O motivo do seletor digitado: a frase que vem depois de "Não aceitei `x`:".
  ["vazio", undefined, "está vazio"],
  [
    "parece-nome-completo",
    undefined,
    "parece o nome completo; digite só o seletor, que eu monto o resto",
  ],
  ["grande-demais", undefined, "é grande demais"],
  ["componente-vazio", undefined, "tem um ponto sobrando"],
  ["componente-grande-demais", undefined, "tem uma parte grande demais"],
  [
    "caractere-invalido",
    undefined,
    "tem caractere que um seletor não aceita (use letras, números, hífen e sublinhado)",
  ],
];

describe("textoDoMotivo: as frases de antes", () => {
  for (const [codigo, valor, frase] of FRASES) {
    it(`${codigo} dá a mesma frase`, () => {
      assert.equal(
        textoDoMotivo(textos, { motivo: codigo, ...(valor === undefined ? {} : { valor }) }),
        frase,
      );
    });
  }

  it("as frases por extenso cobrem exatamente as entradas de MOTIVOS", () => {
    assert.deepEqual(FRASES.map(([codigo]) => codigo).sort(), Object.keys(MOTIVOS).sort());
  });

  it("código sem entrada devolve a frase de sem-motivo, nunca o código", () => {
    for (const motivo of ["", "  ", "codigo-que-ninguem-cadastrou", "constructor", "__proto__"]) {
      assert.equal(textoDoMotivo(textos, { motivo }), "Não consegui consultar o DNS agora.");
    }
  });

  it("o valor entra onde a frase pede e é ignorado onde ela não pede", () => {
    assert.equal(
      textoDoMotivo(textos, { motivo: "resolvedor-http", valor: 429 }),
      "O resolvedor respondeu HTTP 429.",
    );
    assert.equal(
      textoDoMotivo(textos, { motivo: "nome-vazio", valor: 9 }),
      "O nome da consulta está vazio.",
    );
  });

  it("o valor não é expandido de novo como marcador", () => {
    assert.equal(
      textoDoMotivo(textos, { motivo: "resolvedor-http", valor: "{valor}" }),
      "O resolvedor respondeu HTTP {valor}.",
    );
  });
});
