/**
 * @file Testes de impessoalidade: o que está versionado é escrito para quem clona o repositório.
 *
 * Nenhum arquivo versionado cita o mantenedor pelo nome, a não ser os de autoria e licença, e o
 * `CLAUDE.md` e o `.claude/` não dependem de comandos (skills) que só existem na máquina de
 * quem mantém o projeto. Instrução e operação que só o mantenedor executa (conta, token,
 * divulgação) ficam fora do repositório. O papel vem no lugar do nome: "o mantenedor".
 */

// @ts-check

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// APOIO
// ---------------------------------------------------------------------------

// Relativo a este arquivo (e não ao diretório atual), para o teste rodar de qualquer pasta.
const RAIZ = new URL("../", import.meta.url);

// Binários não têm texto a conferir.
const EXTENSOES_BINARIAS = /\.(woff2?|png|jpe?g|webp|ico)$/i;

/**
 * Lista os arquivos versionados. Fora de um clone (um tarball, por exemplo) não há `git`, e o
 * teste não tem o que conferir.
 *
 * @returns {string[] | null} Os caminhos relativos à raiz, ou `null` sem repositório git.
 */
const listarVersionados = () => {
  try {
    const saida = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8" });
    return saida.split("\0").filter(Boolean);
  } catch {
    return null;
  }
};

const versionados = listarVersionados();
const opcoes = { skip: versionados === null ? "sem repositório git" : false };

// ---------------------------------------------------------------------------
// O NOME DO MANTENEDOR
// ---------------------------------------------------------------------------

// Autoria e licença são metadados: o nome fica. Este arquivo cita o nome na regra abaixo.
const PODEM_CITAR_O_NOME = new Set(["LICENSE", "package.json", "test/impessoalidade.test.js"]);

describe("impessoalidade: o nome do mantenedor", () => {
  it("só aparece nos arquivos de autoria e licença", opcoes, async () => {
    /** @type {string[]} */
    const achados = [];
    for (const arquivo of versionados ?? []) {
      if (PODEM_CITAR_O_NOME.has(arquivo) || EXTENSOES_BINARIAS.test(arquivo)) continue;
      const linhas = (await readFile(new URL(arquivo, RAIZ), "utf8")).split("\n");
      linhas.forEach((linha, indice) => {
        if (/\bRyan\b/.test(linha)) achados.push(`${arquivo}:${indice + 1}`);
      });
    }

    assert.deepEqual(
      achados,
      [],
      `Cite o papel ("o mantenedor") em vez do nome, ou tire o trecho do repositório:\n${achados.join("\n")}`,
    );
  });
});

// ---------------------------------------------------------------------------
// ORIENTAÇÃO PARA O CLAUDE CODE
// ---------------------------------------------------------------------------

// Comandos de skills pessoais: quem clona o repositório não os tem.
const COMANDOS_PESSOAIS =
  /(?<![\w/.-])\/(spec|idioma|estilo-arquivos|fechar-sessao|atualizar-docs|revisar-dependabot|nova-interface|stack|novo-projeto)(?![\w-])/;

describe("impessoalidade: orientação para o Claude Code", () => {
  it("o CLAUDE.md e o .claude/ não citam skills pessoais", opcoes, async () => {
    const alvos = (versionados ?? []).filter(
      (arquivo) => arquivo === "CLAUDE.md" || arquivo.startsWith(".claude/"),
    );
    assert.ok(alvos.length >= 2, "esperava o CLAUDE.md e arquivos em .claude/");

    /** @type {string[]} */
    const achados = [];
    for (const arquivo of alvos) {
      const linhas = (await readFile(new URL(arquivo, RAIZ), "utf8")).split("\n");
      linhas.forEach((linha, indice) => {
        const casou = COMANDOS_PESSOAIS.exec(linha);
        if (casou) achados.push(`${arquivo}:${indice + 1} (${casou[0]})`);
      });
    }

    assert.deepEqual(achados, [], `Descreva a regra no próprio arquivo:\n${achados.join("\n")}`);
  });
});
