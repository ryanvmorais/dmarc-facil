---
feature: DKIM — procurar a chave pública do domínio em seletores comuns, lê-la e apontar os achados
status: concluído
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh, 003-parser-dmarc, 004-parser-spf]
origin: conception
---

# 005 — DKIM — Tasks

Tarefas pequenas, na ordem. Cada etapa fecha com o portão de qualidade (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) e o resultado real registrado na própria tarefa. Registro DKIM em teste é sempre sintético (`exemplo.com.br`, `exemplo.net`, chaves fabricadas no teste), e a consulta é um mapa nome → resposta montado no teste.

## Etapa 1 — Seletores: normalização e dados

- [x] Confirmar cada link de `documentacao` do design: abrir a página e ver se o nome do seletor aparece nela. Os seletores dos 15 iniciais que não passarem saem da lista, e `brevo1`, `brevo2`, `zoho` e `zmail` só entram se passarem; a lista final fica entre 15 e 20. Registrar nesta tarefa o que foi confirmado, o que saiu e o que mudou de link. — RF-01, ADR-3
      Resultado (2026-10-31): os 15 seletores iniciais foram confirmados em página oficial (`google`, `selector1` e `selector2`, `s1` e `s2` no exemplo de registros do SendGrid, `fm1` a `fm3`, `protonmail` a `protonmail3`, `mte1` e `mte2`). Dois links mudaram: `resend` passou para `resend.com/docs/knowledge-base/cloudflare` (a página de introdução dos domínios não cita DKIM) e `mailjet` para `dev.mailjet.com/docs/email-api/senders-domains/spf-dkim-validation` (a documentação do Mailjet responde 403 a leitura automática). `brevo1` e `brevo2` ficaram de fora (a página oficial do Brevo respondeu 403 e nenhuma outra página oficial mostrou o nome) e `zoho` e `zmail` também (a página do Zoho só define o termo). Lista final: 15 seletores.
- [x] `public/js/seletores-dkim.js`: tipos `SeletorComum` e `Orientacao`, `@ts-check`, JSDoc completo; `SELETORES_COMUNS` e `ORIENTACOES` conforme a tarefa anterior (Mailgun, Mailchimp marketing e HubSpot nas orientações). — RF-01, ADR-2
- [x] `public/js/seletor-dkim.js`: constantes `TAMANHO_MAXIMO_SELETOR` (100) e `MAXIMO_SELETORES` (40); `normalizarSeletor` com os motivos `vazio`, `parece-nome-completo`, `grande-demais`, `componente-vazio`, `componente-grande-demais` e `caractere-invalido`; entrada que não é texto não lança. — RF-02, RF-08, RNF-01, RNF-02
- [x] `public/js/seletor-dkim.js`: `juntarSeletores(comuns, digitados)` com a ordem comuns e depois digitados, inválidos descartados, repetidos fora e corte em `MAXIMO_SELETORES` com `cortados`. — RF-02
- [x] `test/seletor-dkim.test.js`: os válidos e os recusados da estratégia de testes do design, e `juntarSeletores` (ordem, repetido normalizado, inválido descartado, teto e `cortados`). — RF-02, RF-08, RNF-03
- [x] `test/seletores-dkim-dados.test.js`: de 15 a 20 itens, cada `seletor` já normalizado e sem repetição, `documentacao` em `https` sem credencial nem fragmento, `ORIENTACOES` com provedor e link e sem seletor repetido na lista comum. — RF-01, RNF-03
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes (313 testes, 53 novos: `test/seletor-dkim.test.js` e `test/seletores-dkim-dados.test.js`).

## Etapa 2 — Tamanho da chave RSA

- [x] `public/js/chave-rsa.js`: tipos, `@ts-check`, JSDoc; limpeza do base64 (espaços fora, vazio e acima de `MAXIMO_BASE64` recusados, `atob` dentro de `try`); `lerElemento` com comprimento curto e longo (`0x81`, `0x82`) que recusa o que sai do buffer. — RF-05, RF-08, ADR-8
- [x] `public/js/chave-rsa.js`: `lerChaveRsa` com a estrutura `SubjectPublicKeyInfo` de RSA (OID `rsaEncryption`, `NULL`, `BIT STRING` com byte `0x00`, `SEQUENCE` de dois `INTEGER`), cada elemento fechando exatamente no pai, `n` positivo e sem zeros à esquerda; `bits` pelo primeiro byte com `Math.clz32`. — RF-05, ADR-8
- [x] `test/chave-rsa.test.js`: função auxiliar que monta a chave sintética de N bits; os tamanhos 512, 1024, 1536, 2048, 3072 e 4096; primeiro byte `0x01` e `0x80`; comprimento curto e longo; e todas as entradas recusadas da estratégia de testes (base64 inválido, acima de 2048 caracteres, OID de outro algoritmo, bits sobrando, `SEQUENCE` maior que o pai, sobra no fim, `n` negativo, `n` só de zeros, `RSAPublicKey` cru, comprimento de 3 bytes, texto aleatório); nenhuma entrada lança. — RF-05, RNF-02, RNF-03
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes (357 testes, 44 novos em `test/chave-rsa.test.js`); cobertura de linhas 100% em `chave-rsa.js`. Além do design, o módulo exporta `decodificarChave`, que a etapa 3 reusa para conferir os 32 bytes do Ed25519.

## Etapa 3 — Leitura do registro de um seletor

- [x] `public/js/dkim.js`: tipos (`Gravidade`, `Achado`, `TipoChave`, `DkimValido` e as demais variantes, `ResultadoDkim`), `@ts-check` e JSDoc completo; entrada defensiva (o que não é lista vira lista vazia, o que não é texto é descartado); constantes `MAXIMO_TAGS` (32) e `MAXIMO_VALOR` (2048 para `p`, 255 para as outras). — RF-08, RNF-01, RNF-02
- [x] `public/js/dkim.js`: `dividirTags` (separa por `;`, parte no primeiro `=`, apara, ignora fragmento vazio e sem `=`); escolha dos candidatos (`v` com valor começando por `dkim`, em qualquer caixa, ou tag `p`), com `ausente`, `multiplos` e `registros-multiplos`, e o candidato acima de `MAXIMO_TEXTO` virando `invalido` com `registro-grande-demais`. — RF-03, RF-08, ADR-6, ADR-7
- [x] `public/js/dkim.js`: tag repetida, `v` fora do primeiro lugar ou diferente de `DKIM1`, valor e número de tags acima do teto, `p` ausente (`chave-ausente`) e `p` vazio (`revogado`, `chave-revogada`); nomes de tag sensíveis à caixa. — RF-03, RF-04, ADR-7
- [x] `public/js/dkim.js`: interpretação de `k` (`rsa` com `lerChaveRsa` e os achados `chave-fraca`, `chave-abaixo-do-recomendado` e `chave-maior-que-4096`; `ed25519` com 32 bytes; desconhecido com `tipo-de-chave-desconhecido`), `chave-ilegivel`, `h`, `s`, `t` e `n`, e os achados de higiene `so-sha1`, `servico-nao-e-email` e `modo-de-teste`; ordenação estável dos achados por gravidade e ordem de geração. — RF-04, RF-05, ADR-8, ADR-9
- [x] `test/dkim.test.js`: cada caso da estratégia de testes do design (escolha entre TXT alheios, `v` ausente, errada e fora do lugar, tag repetida e desconhecida, caixa, `;` final, `p` ausente e vazio, RSA de 512 a 4097 bits, `p` quebrado em espaços e torto, Ed25519 com 31, 32 e 33 bytes, `k` desconhecido, `h`, `s`, `t` e `n`, registro de ponta a ponta com a ordem dos achados), mais a entrada hostil (`<script>` no registro, num valor e na nota, 2000 tags em tempo curto, valor de 5000 caracteres, candidato acima de `MAXIMO_TEXTO`, itens que não são texto; nenhuma entrada lança). — RF-03, RF-04, RF-05, RF-08, RNF-02, RNF-03
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes (417 testes: 59 novos em `test/dkim.test.js`, mais o arquivo de ajudas `test/ajudas/chave-sintetica.js`, que o runner conta como um); cobertura de linhas 100% em `dkim.js`. As ajudas de chave sintética saíram do `chave-rsa.test.js` para esse arquivo, que a etapa 4 também usa.

## Etapa 4 — Busca com concorrência limitada

- [x] `public/js/dkim-busca.js`: tipos (`Consulta`, `SeletorTentado`, `BuscaDkim`, `ResultadoBusca`), `@ts-check` e JSDoc; constantes `CONCORRENCIA_PADRAO` (6) e `MAXIMO_FALHAS` (3); `opcoes` com valor fora do intervalo voltando ao padrão; `normalizarDominio` antes de qualquer nome, com `{ ok: false, motivo }` sem consulta. — RF-06, RF-08, RNF-01, RNF-02
- [x] `public/js/dkim-busca.js`: lista de seletores (`normalizarSeletor`, inválidos fora com `seletor-invalido`, repetidos fora, corte em `MAXIMO_SELETORES` com `seletores-demais`) e nome `${seletor}._domainkey.${dominio}`. — RF-02, RF-06, RF-08
- [x] `public/js/dkim-busca.js`: pool de trabalhadores que gravam o resultado na posição do seletor, `lerDkim` em cada resposta, `nao-verificado` com `motivo` na falha, parada na terceira falha com `interrompido` e `busca-interrompida`, e `resolvedores` sem repetição. — RF-06, RNF-04, ADR-4, ADR-5
- [x] `public/js/dkim-busca.js`: `situacao` (`encontrado`, `nao-encontrado`, `indeterminado`) e `incompleta`, `nenhum-seletor-encontrado`, achados etiquetados com `seletor` e ordenados por gravidade, posição do seletor e ordem de geração. — RF-06, RF-07, ADR-9, ADR-10
- [x] `test/dkim-busca.test.js`: cada caso da estratégia de testes do design (concorrência nunca acima de 6 e de 2, pico de 6 com 19 seletores, ordem do resultado com respostas invertidas, os três valores de `situacao` e os casos de registro revogado, inválido e múltiplo sozinhos, uma a três falhas, nome nunca consultado duas vezes, seletor inválido, 100 seletores, `a&b=c`, domínio com maiúsculas e domínio recusado, achados etiquetados e ordenados, `resolvedores` sem repetição). — RF-06, RF-07, RF-08, RNF-03, RNF-04
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes (459 testes, 42 novos em `test/dkim-busca.test.js`); cobertura de linhas 100% em `dkim-busca.js`; o arquivo de teste rodou 6 vezes seguidas sem falha (a concorrência usa temporizadores). Com 6 consultas em andamento, as que terminam antes da terceira falha abrem outras, então a parada deixa terminar as em andamento e nada novo sai depois dela (ADR-5).

## Etapa 5 — Documentação e fechamento

- [x] `CLAUDE.md`: acrescentar `seletor-dkim.js`, `chave-rsa.js`, `dkim.js`, `dkim-busca.js` e `seletores-dkim.js` ao mapa de arquitetura. — ADR-1
- [x] `specs/005-dkim/requirements.md`: acrescentar `test/chave-rsa.test.js` à seção Testes. — ADR-1
- [x] `specs/README.md`: linha `005-dkim` no roadmap com entrega `v0.5` e `concluído`; a tabela de marcos do `README.md` e do `README.en.md`, nos dois idiomas. — fluxo `/spec implementar`
- [x] Frontmatter dos três documentos para `status: concluído`.
- [x] Portão de qualidade final. — `format:check`, `lint`, `typecheck` e `test` verdes (459 testes, 160 novos na spec); cobertura de linhas 100% nos cinco módulos (`chave-rsa.js`, `dkim-busca.js`, `dkim.js`, `seletor-dkim.js`, `seletores-dkim.js`).

## Etapa 6 — Data de conferência e workflow dos links

Acrescentada depois do fechamento das etapas 1 a 5, por decisão do mantenedor (os links dos provedores podem envelhecer).

- [x] `public/js/seletores-dkim.js`: campo `conferido` (`AAAA-MM-DD`) em cada item de `SELETORES_COMUNS` e `ORIENTACOES`; `test/seletores-dkim-dados.test.js` confere formato, data que existe e não futura; `requirements.md` (RF-01) e `design.md` (tipos) atualizados. — RF-01
- [x] `scripts/conferir-links-dkim.mjs`: abre cada `documentacao` uma vez só; 404, 410 e erro de rede são falha; página que abre mas não cita `seletor._domainkey` é falha; 401, 403, 429, 5xx e tempo esgotado são inconclusivos (aviso); `conferido` com mais de um ano é aviso; anotações `::error`/`::warning` e resumo do run. Primeira execução nas páginas reais: os 15 seletores e as 3 orientações ok. — RF-01
- [x] `.github/workflows/links-dkim.yml`: segunda-feira 09:00 de São Paulo e `workflow_dispatch`, `ubuntu-26.04`, ações fixadas por SHA, `permissions: contents: read`, sem instalar dependência. `tsconfig.json`, `eslint.config.mjs` e `package.json` (`links:dkim`) cobrem o script. — RF-01
- [x] `test/conferir-links-dkim.test.js`: status, `paginaCitaSeletor` (caixa, barra do Markdown, fim de outro seletor, expressão regular), data velha e `conferirTudo` com `fetch` falso (tudo ok, endereço aberto uma vez, 404, página sem o seletor, 403/503, rede e tempo esgotado, data velha). — RNF-03
- [x] `CLAUDE.md`: mapa de arquitetura (`scripts/`, `test/ajudas/`) e a linha do workflow na seção de automação.
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes (485 testes: 26 novos em `test/conferir-links-dkim.test.js` e `test/seletores-dkim-dados.test.js`). O workflow em si só roda no GitHub: a primeira execução real é no PR (`workflow_dispatch`).
