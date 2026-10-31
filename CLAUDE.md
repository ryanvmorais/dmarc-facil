# CLAUDE.md

Este arquivo orienta o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## Visão geral do projeto

**DMARC Fácil** é um site estático que consulta o DMARC, o SPF e o DKIM de um domínio, explica cada registro em português e diz o próximo passo (de `p=none` para `quarantine` e `reject`). Tudo roda no navegador do visitante, por DNS-over-HTTPS: nenhum servidor nosso vê o domínio. É o funil do MailVigil e material de conteúdo do canal.

Stack: JavaScript puro (módulos ES, sem build), HTML e CSS, Node 26 e pnpm 12 só para as ferramentas de desenvolvimento. Público, Apache-2.0. Ainda não lançado: o primeiro lançamento será a `1.0.0`; hospedagem em `dmarcfacil.ryanmorais.com.br`, a decidir na fase de operação.

## Comandos comuns

```bash
# Instala as dependências de desenvolvimento
pnpm install

# Ativa o hook de pre-commit (uma vez por clone)
git config core.hooksPath .githooks

# Roda todos os testes
pnpm test

# Roda um arquivo de teste só
node --test test/dominio.test.js

# Testes com cobertura
pnpm test:coverage
```

O portão de qualidade, na ordem do CI e do pre-commit:

```bash
# Confere a formatação (sem alterar arquivos)
pnpm format:check

# Lint
pnpm lint

# Checagem de tipos do JSDoc (nada é compilado)
pnpm typecheck

# Testes
pnpm test
```

```bash
# Corrige a formatação
pnpm format
```

## Arquitetura

```text
public/                  # o site: é o que vai para a hospedagem, sem build
  js/                    # módulos ES carregados direto pelo navegador
    dominio.js           # valida e normaliza o domínio digitado (módulo puro: sem DOM, sem rede)
    nome-dns.js          # valida o nome DNS montado pela ferramenta antes de virar URL (puro)
    resposta-doh.js      # lê o JSON do resolvedor: situação e textos TXT, igual nos dois (puro)
    doh.js               # consultarTxt: fetch com tempo limite, privacidade e fallback Cloudflare → Google
    dmarc.js             # lerDmarc: escolhe o registro entre os TXT, lê as tags e aponta os achados (puro)
test/                    # testes com o runner nativo do Node (node:test)
docs/                    # documentação do projeto
  stack.md               # mapa de cada tecnologia: o que faz, por que, o que estudar
  images/                # logo oficial (SVG)
specs/                   # specs de cada marco (requirements, design, tasks)
.githooks/pre-commit     # portão de qualidade local, o mesmo do CI
.claude/                 # hooks do Claude Code (scripts em hooks/, ligados por settings.json)
.github/                 # workflows (ci, codeql, dependency-review), Dependabot, templates
```

Camadas: a lógica de parsing (SPF, DMARC) e de validação mora em módulos puros de `public/js/`, sem DOM nem rede, para rodar igual no navegador e nos testes. O que toca o DOM e a rede fica em módulos separados, finos. Detalhe da stack em [docs/stack.md](docs/stack.md); o porquê de cada decisão, nas specs de [specs/](specs/).

> ⚠️ **Não regredir: conteúdo de registro TXT é dado de terceiros.** Todo texto vindo de DNS entra na página só com `textContent`, nunca `innerHTML`. Um registro TXT pode conter `<script>`.

> ⚠️ **Não regredir: o domínio vai dentro de uma URL.** Tudo o que o visitante digita passa por `normalizarDominio` antes de virar consulta DoH. Nenhum módulo monta URL de consulta com texto cru.

> ⚠️ **Não regredir: sem log e sem rastreador.** Nenhum log de domínios consultados, nenhum script de terceiro na página. Só a estatística agregada da hospedagem. A página diz ao visitante que o resolvedor DoH (Cloudflare, ou Google no fallback) vê o domínio e o IP.

## Convenções

- **Idioma do código, comentários, commits e specs: português** (projeto público educativo da home; regra em `/idioma`). Strings visíveis, em português. Nomes técnicos universais (`DoH`, `TXT`, `DKIM`) ficam como são.
- **Estilo dos arquivos:** `/estilo-arquivos`.
- **Marca:** logo A (escudo com olho aberto), da família MailVigil/WebVigil: azul `#2563eb`, `Sora` 800 no nome, `JetBrains Mono` no código. SVG oficial em `docs/images/`, um `<path>` só com `evenodd`; o teste `test/logo.test.js` o guarda. Fontes locais na página final, nunca CDN.
- **Interface:** decidida (interface C: escada `none` → `quarantine` → `reject` com a etiqueta "Próximo passo" no degrau seguinte ao atual; o cartão de DMARC fica só com registro e selo). A spec da página traz o mockup aprovado. Texto de interface que ainda não é final fica marcado `[provisório]`.
- **DKIM:** nunca dizer "você não tem DKIM"; dizer "não encontrei nesses seletores" (o seletor é escolha do remetente e não dá para listar). 15 a 20 seletores comuns em arquivo de dados, com link da doc de cada provedor, mais campo livre.

## Qualidade e automação

- **CI** (`.github/workflows/ci.yml`): job `qualidade` (Prettier, ESLint, `tsc`, testes) e job `seguranca` (`pnpm audit`). Mais CodeQL e `dependency-review`. Toda `uses:` fixada por SHA, `runs-on: ubuntu-26.04`.
- **Ruleset `proteger-main`:** PR obrigatório, só squash, histórico linear, `qualidade` e `seguranca` exigidos. Nada de commit direto na `main`.
- **Pre-commit** (`.githooks/pre-commit`): o mesmo portão do CI em modo verificação.
- **Hooks do Claude** em `.claude/` (scripts `.mjs` em `.claude/hooks/`, ligados por `.claude/settings.json`): `proteger-gerados` (PreToolUse, bloqueia edição manual do `pnpm-lock.yaml`), `formatar` (PostToolUse, Prettier no arquivo editado) e `validar` (Stop, ESLint + `tsc` se há `.js`/`.mjs` alterado; testes ficam no pre-commit).

## Fluxo de trabalho

Spec-driven (`/spec`): requirements, design e tasks com portão de aprovação em cada um, uma pasta `specs/NNN-nome/` por marco. Convenções de numeração e status em [specs/README.md](specs/README.md). Uma issue, uma branch, um PR; o merge é do Ryan. Ao fim da sessão: `/atualizar-docs` e `/fechar-sessao`.

## Gestão de dependências

pnpm 12 (campo `packageManager` do `package.json`); `package.json` e `pnpm-lock.yaml` sempre juntos no commit. **Não há dependência de runtime**: o que vai ao navegador é código nosso, sem biblioteca. Só ferramentas de desenvolvimento (ESLint, Prettier, TypeScript como verificador de JSDoc, `@types/node`).

> Cuidado: `pnpm-workspace.yaml` guarda a configuração do pnpm 12 (o campo `pnpm` do `package.json` é ignorado): `minimumReleaseAge` de uma semana e as exceções aceitas do `pnpm audit`, cada uma com o motivo e a condição de saída comentados ali.

> Cuidado: o Dependabot agrupa minor e patch num PR por ecossistema, com cooldown de 7 dias. Revise com `/revisar-dependabot`.
