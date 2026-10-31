/**
 * @file Utilitários compartilhados pelos hooks do Claude: raiz do projeto, leitura do evento
 * e execução das ferramentas de desenvolvimento.
 *
 * As ferramentas rodam pelo `node` direto nos binários de `node_modules`, e não por
 * `pnpm exec`: o hook roda a cada edição, e assim evita o custo de subir o pnpm e a diferença
 * entre `.cmd` (Windows) e shell script (Unix).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// RAIZ E BINÁRIOS
// ---------------------------------------------------------------------------

// <raiz>/.claude/hooks/ferramentas.mjs  ->  <raiz>
export const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

// Caminhos fixos dentro do `node_modules`: é o que dispensa o `pnpm exec` (ver o cabeçalho).
const BINARIOS = {
  prettier: "node_modules/prettier/bin/prettier.cjs",
  eslint: "node_modules/eslint/bin/eslint.js",
  tsc: "node_modules/typescript/bin/tsc",
};

// ---------------------------------------------------------------------------
// EVENTO E EXECUÇÃO
// ---------------------------------------------------------------------------

/**
 * Lê o evento que o Claude Code envia ao hook pelo stdin.
 *
 * @returns {Promise<Record<string, any>>} O evento, ou `{}` se o JSON for inválido.
 */
export const lerEvento = async () => {
  let texto = "";
  for await (const pedaco of process.stdin) texto += pedaco;
  try {
    return JSON.parse(texto);
  } catch {
    return {};
  }
};

/**
 * Diz se as dependências de desenvolvimento estão instaladas.
 *
 * Sem `node_modules` o hook não faz nada: um problema de ambiente não deve prender o agente.
 *
 * @returns {boolean} `true` se o `node_modules` existe.
 */
export const dependenciasInstaladas = () => existsSync(join(RAIZ, "node_modules"));

/**
 * Roda uma ferramenta de desenvolvimento a partir da raiz do projeto.
 *
 * @param {"prettier" | "eslint" | "tsc"} nome A ferramenta.
 * @param {string[]} argumentos Argumentos da linha de comando.
 * @returns {{ status: number, saida: string }} O código de saída e stdout + stderr juntos.
 */
export const rodar = (nome, argumentos) => {
  const resultado = spawnSync(process.execPath, [BINARIOS[nome], ...argumentos], {
    cwd: RAIZ,
    encoding: "utf8",
  });
  return {
    status: resultado.status ?? 1,
    saida: `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`,
  };
};
