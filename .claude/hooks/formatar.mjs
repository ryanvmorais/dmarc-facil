/**
 * @file Hook PostToolUse (Edit|Write): formata com o Prettier o arquivo que acabou de mudar.
 *
 * O pre-commit e o CI só conferem a formatação (`format:check`) e falham se um arquivo escapou;
 * formatar na hora da edição tira esse retrabalho. `--ignore-unknown` pula o que o Prettier não
 * entende, e o `.prettierignore` continua valendo. Nunca bloqueia: sempre sai com 0.
 */

import { existsSync } from "node:fs";

import { dependenciasInstaladas, lerEvento, rodar } from "./ferramentas.mjs";

const evento = await lerEvento();
const caminho = evento.tool_input?.file_path;

if (caminho && existsSync(caminho) && dependenciasInstaladas()) {
  rodar("prettier", ["--write", "--ignore-unknown", "--log-level", "silent", caminho]);
}
