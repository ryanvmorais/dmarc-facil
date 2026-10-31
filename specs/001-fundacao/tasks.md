---
feature: Fundação — esqueleto sem build, validação do domínio, portão de qualidade, CI e marca
status: concluído
date: 2026-10-31
related:
  - 001-fundacao/requirements.md
  - 001-fundacao/design.md
origin: conception
---

# 001 — Fundação — Tasks

A fundação foi construída antes desta spec (PRs #1 e #2). As tarefas abaixo são o histórico de construção, já marcadas `[x]`, e cada etapa fecha com a conferência feita em 2026-10-31 contra o repositório e o GitHub.

## Etapa 0 — Esqueleto e ferramentas

- [x] `package.json`, `pnpm-lock.yaml`: projeto `type: module`, `packageManager` pnpm 12, `engines` Node 26, só `devDependencies`. — RNF-01
- [x] `pnpm-workspace.yaml`: `minimumReleaseAge` de uma semana e a exceção do `pnpm audit` com motivo e condição de saída. — RF-06
- [x] `tsconfig.json`: `checkJs`, `noEmit`, `strict` e `noUncheckedIndexedAccess`. — RNF-02, ADR-2
- [x] `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`: lint por ambiente (navegador em `public/`, Node em `test/` e `*.mjs`) e formatação. — RF-04
- [x] `.gitignore`: `.env`, `.env.*`, estado local do Wrangler, caches e cobertura. — RNF-04, ADR-9
- [x] Portão de qualidade. — prettier, eslint e tsc sem aviso; 28 testes, 28 passam

## Etapa 1 — Validação do domínio

- [x] `public/js/dominio.js`: `normalizarDominio` com `extrairHost` e `paraAscii` (esquema, caminho, e-mail e ponto final descartados; punycode pelo `new URL`). — RF-01, RF-03, ADR-3, ADR-4
- [x] `public/js/dominio.js`: recusas com motivo em português (vazio, porta e IPv6, IP, sem ponto, rótulo malformado, rótulo de mais de 63 e nome de mais de 253 caracteres). — RF-02, ADR-5
- [x] `test/dominio.test.js`: tabelas de entradas aceitas e recusadas, um `it` por linha, com registros e domínios sintéticos. — RF-01, RF-02, RNF-03
- [x] Portão de qualidade. — prettier, eslint e tsc sem aviso; 28 testes, 28 passam (25 de domínio e 3 de logo)

## Etapa 2 — Portão local e CI

- [x] `.githooks/pre-commit`: `format:check`, `lint`, `typecheck` e `test`, nessa ordem, abortando no primeiro que falha; ativo com `core.hooksPath`. — RF-04, ADR-6
- [x] `.github/workflows/ci.yml`: jobs `qualidade` (mesma sequência do hook) e `seguranca` (`pnpm audit`), `permissions: contents: read`, `runs-on: ubuntu-26.04`, `uses:` fixadas por SHA com a versão em comentário. — RF-04, RF-05
- [x] `.github/workflows/codeql.yml` e `dependency-review.yml`: rodam em PR, fora dos checks exigidos. — RF-05, ADR-7
- [x] `.github/dependabot.yml`: npm e GitHub Actions, domingo 09:00 de Brasília, minor e patch agrupados, cooldown de 7 dias. — RF-06
- [x] Portão de qualidade. — `pnpm audit`: "1 ignored: 1 moderate" (a exceção registrada em `pnpm-workspace.yaml`); CI verde nos PRs #1 e #2

## Etapa 3 — Proteção da `main`

- [x] Ruleset `proteger-main` (configuração do GitHub): PR obrigatório, histórico linear, sem deleção nem force-push, checks `qualidade` e `seguranca` exigidos. — RF-07
- [x] Configuração do repositório: só squash habilitado (merge commit e rebase desligados) e branch apagada após o merge. — RF-07, ADR-8
- [x] Portão de qualidade. — conferência via `gh api`: ruleset `active` com os cinco tipos de regra; `allow_squash_merge: true`, `allow_merge_commit: false`, `allow_rebase_merge: false`

## Etapa 4 — Marca

- [x] `docs/images/dmarc-facil-dmarc-checker-logo.svg`: logo A (escudo com olho aberto), um `<path>` só com `evenodd`, cor `#2563eb`, `role="img"`, `aria-label` e `<title>`. — RF-08
- [x] `test/logo.test.js`: confere a construção e recusa `mask`, `clipPath`, `script` e `style`. — RF-08
- [x] Portão de qualidade final. — prettier, eslint e tsc sem aviso; `node --test`: 28 testes, 28 passam, 0 falham
