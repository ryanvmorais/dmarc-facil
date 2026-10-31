---
feature: Hospedagem — a pasta public/ no ar em dmarcfacil.ryanmorais.com.br, com cabeçalhos de segurança e a 404 certa
status: aprovado
date: 2026-10-31
related: [001-fundacao, 006-pagina]
origin: conception
---

# 007 — Hospedagem — Tasks

Tarefas pequenas, na ordem. Cada etapa de código fecha com o portão de qualidade (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) e o resultado real registrado na própria tarefa. Nenhuma tarefa publica nada: o token, o ambiente `producao`, o domínio e o primeiro deploy são do Ryan (etapa 5), e só a etapa 5 muda o que está no ar. Os testes não acessam a rede (RNF-04); endereço e registros em teste são sintéticos, menos o endereço público, que é o da rota do `wrangler.json`. Sem mockup: esta spec não muda tela.

## Etapa 1 — Configuração, cabeçalhos e descoberta

- [ ] `wrangler.json`: JSON estrito, sem `main`; `name` `dmarc-facil`, `compatibility_date` `2026-10-31`, `workers_dev` e `preview_urls` `false`, rota `custom_domain` para `dmarcfacil.ryanmorais.com.br`, `assets` com `./public`, `404-page` e `auto-trailing-slash`, `observability` desligada. — RF-01, RF-03, ADR-1, ADR-2
- [ ] `test/hospedagem.test.js`: cada chave do `wrangler.json` conforme o ADR-1; sem `main`; rota `custom_domain`; `package.json` sem `wrangler` entre as dependências. — RF-01, RF-03, RNF-03, RNF-04
- [ ] `public/_headers`: regra `/*` com os sete cabeçalhos do ADR-3 (CSP igual à `<meta>` do `index.html` mais `frame-ancestors 'none'`, HSTS só com `max-age=31536000`) e regra `/fonts/*` com o cache longo do ADR-4. — RF-02, RF-04, ADR-3, ADR-4
- [ ] `test/cabecalhos.test.js`: lê o `_headers` e confere cada cabeçalho; a CSP do cabeçalho igual à `<meta>` do `index.html` mais `frame-ancestors`; `connect-src` com exatamente `RESOLVEDORES` de `doh.js`; a `<meta>` da `404.html` não é mais frouxa que o cabeçalho; sem `unsafe-inline` e `unsafe-eval`; HSTS sem `includeSubDomains` e sem `preload`; `Cache-Control` longo só em `/fonts/*`; no máximo 100 regras e 2.000 caracteres por linha. — RF-02, RF-04, RNF-04, ADR-3
- [ ] `public/index.html`: `<link rel="canonical">` com o endereço da rota, logo depois do `description`. A `404.html` não muda. — RF-09, ADR-8
- [ ] `public/robots.txt` e `public/sitemap.xml` conforme o modelo de dados do design (sem `lastmod`). — RF-09, ADR-8
- [ ] `test/descoberta.test.js`: `canonical`, `robots.txt` e `sitemap.xml` com o endereço da rota; sitemap bem formado e com uma URL só; `Sitemap:` do `robots.txt` aponta para o sitemap; `404.html` sem `canonical`. — RF-09, ADR-2, ADR-8
- [ ] Portão de qualidade. — registrar o resultado e conferir que `test/pagina-estatica.test.js` segue verde sem mudança (resultado: _a preencher_).

## Etapa 2 — Conferência do que está no ar

- [ ] `scripts/conferir-hospedagem.mjs`: `@ts-check`, JSDoc; `lerCabecalhosEsperados(textoHeaders, regra)` e `compararCabecalhos(esperados, recebidos)` puros; `conferirHospedagem({ endereco, pasta, buscar })` com as sete verificações do design (`/`, 404, JavaScript, fonte, `robots.txt` e `sitemap.xml`, `/_headers`, `http://`); o endereço vem da rota do `wrangler.json`; tabela no `$GITHUB_STEP_SUMMARY` quando existir; código de saída 1 se algo falhar; executa só quando chamado direto, como o `conferir-links-dkim.mjs`. — RF-07, RF-06, ADR-6, ADR-7
- [ ] `package.json`: script `hospedagem:conferir`. `tsconfig.json` e `eslint.config.mjs` cobrem o script, se ainda não cobrem. — RF-07
- [ ] `test/conferir-hospedagem.test.js`: `lerCabecalhosEsperados` e `compararCabecalhos` com `_headers` sintético (faltando, valor diferente, repetido, caixa do nome); `conferirHospedagem` com `buscar` falso que responde tudo certo e uma variação por falha: HTML com `<script>` injetado, 404 com status 200, cabeçalho ausente na 404, `http://` servido em 200, `/_headers` público, `Cache-Control` das fontes diferente, `robots.txt` alterado. — RF-06, RF-07, RNF-04, ADR-6, ADR-7
- [ ] Portão de qualidade, com a cobertura de `conferir-hospedagem.mjs`. — registrar o resultado (resultado: _a preencher_).

## Etapa 3 — Workflow de deploy e Lighthouse de produção

- [ ] `.github/lighthouse/producao-mobile.json` e `producao-desktop.json`: as asserções de `mobile.json` e `desktop.json`, com `collect.url` no endereço da rota, o `numberOfRuns` e a auditoria `robots-txt` ignorada como nos de origem (ADR-8), `outputDir` próprio. — RF-07, ADR-6, ADR-8
- [ ] `test/lighthouse-producao.test.js`: `collect.url` igual ao endereço da rota; asserções iguais às dos limites da pasta estática. — RF-07, ADR-2
- [ ] `.github/workflows/deploy.yml`: gatilhos `workflow_run` do `CI` na `main` e `workflow_dispatch`; condição de sucesso, `push` e mesmo repositório; `permissions: contents: read`; ambiente `producao`; concorrência no grupo `deploy` sem cancelar; checkout do `head_sha`, passo que só segue se ele ainda for a ponta da `main`; `WRANGLER_VERSION` `4.152.0` e `npx --yes wrangler@${{ env.WRANGLER_VERSION }} deploy`; `pnpm hospedagem:conferir`; Lighthouse de produção por `npx` com o `LHCI_VERSION` do `lighthouse.yml`; `uses:` por SHA, `runs-on: ubuntu-26.04`, `timeout-minutes`. O comentário de topo diz por que `workflow_run` e por que o `wrangler` não é dependência. — RF-05, RF-07, ADR-5, ADR-6
- [ ] `test/workflow-deploy.test.js`: gatilhos e condição; nenhum `pull_request`; toda `uses:` por SHA; `runs-on`; `permissions`; ambiente `producao`; segredos só no job de deploy; `WRANGLER_VERSION` fixa; `LHCI_VERSION` igual à do `lighthouse.yml`; concorrência sem cancelamento. — RF-05, RNF-04, ADR-5
- [ ] Portão de qualidade. — registrar o resultado (resultado: _a preencher_). O `deploy.yml` não roda antes do merge (`workflow_run` usa o arquivo da `main`); a leitura de cada passo é conferida pelo teste e pela revisão do PR.

## Etapa 4 — Documentação

- [ ] `docs/hospedagem.md`: passo a passo do Ryan em ordem, cada passo dizendo quem faz e o que conferir — criar o token (modelo "Edit Cloudflare Workers", só a conta e a zona), criar o ambiente `producao` restrito à `main` com os dois segredos, desligar Web Analytics, Rocket Loader e ofuscação de e-mail e ligar "Always Use HTTPS", primeiro deploy por `workflow_dispatch`, ler o resumo da conferência, abrir a página no navegador e olhar a rede, conferir que `*.workers.dev` não serve o site; a regra das fontes (arquivo muda, nome muda); os dois caminhos de volta do ADR-9; revisão mensal da versão do `wrangler`. — RF-08, ADR-7, ADR-9
- [ ] `CLAUDE.md` (manter abaixo de ~20 KB): árvore de arquitetura com `wrangler.json`, `deploy.yml`, `producao-*.json`, `conferir-hospedagem.mjs` e `docs/hospedagem.md`; a linha de visão geral deixa de dizer "a decidir"; a seção de qualidade cita o deploy e a conferência. — Impacto, RF-08
- [ ] `docs/stack.md`: Workers Static Assets, `wrangler` por `npx`, `_headers`, HSTS, ambiente `producao`. — Impacto
- [ ] `README.md` e `README.en.md`: o endereço do site, sem data de lançamento, e a linha `v0.7` na tabela de marcos nos dois idiomas. — Impacto, RF-08
- [ ] `specs/README.md`: linha da 007 no roadmap (`v0.7`). — Impacto
- [ ] Portão de qualidade final, com a cobertura e o total de testes. — registrar o resultado (resultado: _a preencher_). A spec fica `em andamento` até a etapa 5.

## Etapa 5 — Publicação (o Ryan; Claude acompanha e confere)

Etapa sem código, por isso sem portão de qualidade: o que ela entrega é o site no ar, conferido pelo `deploy.yml` (RF-07).

- [ ] Ryan segue `docs/hospedagem.md` até o primeiro deploy por `workflow_dispatch`. — RF-01, RF-05, RF-08
- [ ] Resumo da conferência lido: todas as verificações verdes, ou cada falha tratada (cabeçalho na 404, `Cache-Control` das fontes, permissão do token, os riscos do design) com o desvio registrado em "Ajustes feitos na implementação" do `design.md`. — RF-02, RF-03, RF-04, RF-06, RF-07
- [ ] Lighthouse de produção verde nos dois modos, com as notas e o peso registrados aqui. — RF-07, RNF-04
- [ ] Um rollback real feito e voltado, antes de divulgar o endereço. — RF-05, ADR-9
- [ ] `*.workers.dev` e o endereço de pré-visualização conferidos como fora do ar. — RF-01
- [ ] Os três arquivos da spec com `status: concluído` e a linha da 007 em `specs/README.md` como `concluído`. — Impacto
