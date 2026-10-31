/**
 * @file Hook PreToolUse (Edit|Write): bloqueia a edição manual de arquivo gerado por ferramenta.
 *
 * O `pnpm-lock.yaml` é escrito pelo pnpm; editar à mão corrompe o grafo de dependências e quebra
 * a instalação reprodutível. Em violação, sai com 2 e devolve a orientação pelo stderr, que o
 * Claude Code repassa ao agente para ele seguir o caminho certo.
 */

import { lerEvento } from "./ferramentas.mjs";

// Sufixos protegidos (comparados em minúsculas e com "/") e o caminho certo de cada um.
const PROTEGIDOS = {
  "pnpm-lock.yaml":
    "use `pnpm install`, `pnpm add` ou `pnpm remove`; nunca edite o lockfile à mão.",
};

const evento = await lerEvento();
const caminho = String(evento.tool_input?.file_path ?? "")
  .replaceAll("\\", "/")
  .toLowerCase();

for (const [alvo, orientacao] of Object.entries(PROTEGIDOS)) {
  if (caminho.endsWith(alvo)) {
    process.stderr.write(`Edição bloqueada: '${alvo}' é arquivo gerado. ${orientacao}`);
    process.exit(2);
  }
}
