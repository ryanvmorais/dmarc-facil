---
feature: Parser SPF — escolher o registro SPF entre os TXT do domínio, lê-lo, contar as consultas DNS e apontar os achados
status: rascunho
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh, 003-parser-dmarc]
origin: conception
---

# 004 — Parser SPF — Tasks

Tarefas pequenas, na ordem. Cada etapa fecha com o portão de qualidade (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) e o resultado real registrado na própria tarefa. Registro SPF em teste é sempre sintético (`exemplo.com.br`, `exemplo.net`, `203.0.113.0/24`, `2001:db8::/32`, `v=spf1 include:spf.exemplo.net -all`), e a consulta é um mapa nome → resposta montado no teste.

## Etapa 1 — Escolha do registro e gramática dos termos

- [ ] `public/js/spf.js`: tipos (`Gravidade`, `Achado`, `TipoTermo`, `Termo`, `EstagioSpf`, `ResultadoSpf` e suas variantes), `@ts-check` e JSDoc completo; entrada defensiva (o que não é lista vira lista vazia, o que não é texto é descartado); constantes `LIMITE_CONSULTAS` e `TIPOS_QUE_CONSULTAM`. — RF-06, RNF-01, RNF-02
- [ ] `public/js/spf.js`: escolha dos candidatos por `^v=spf1(?: |$)` sem distinguir caixa (sem espaço antes), com `ausente`, `multiplos` (com `quantidade`) e o candidato acima de `MAXIMO_TEXTO` virando `invalido` com `registro-grande-demais`. — RF-01, RF-06, ADR-2
- [ ] `public/js/spf.js`: divisão em termos por espaços e classificação em modificador (`nome=valor`) ou diretiva (`[qualificador]mecanismo`); modificador desconhecido ignorado, `redirect` e `exp` repetidos com `modificador-repetido`. — RF-02, ADR-3
- [ ] `public/js/spf.js`: gramática de cada termo (`all`, `include`/`exists` com alvo obrigatório, `a`/`mx` com alvo e `/n` `//m` opcionais sem zero à esquerda, `ptr`, `ip4` com octetos sem zero à esquerda, `ip6` por função própria, `redirect`, `exp`), alvo por `validarNomeDns` com ao menos dois rótulos e último não numérico, macro bem formada com `macro: true` e sem `dominio`, `termo-invalido` só para o primeiro (texto truncado em 64). — RF-02, RF-06, ADR-3, ADR-8
- [ ] `test/spf.test.js`: escolha (um registro entre TXT alheios, nenhum, vários, `v=spf10` e `v=spf1x` recusados, `V=SPF1` aceito, espaço antes do `v` recusado, itens que não são texto, candidato de 5000 caracteres) e termos (todos os mecanismos com e sem qualificador, `a/24`, `mx:exemplo.net//64`, `a:exemplo.net/24//64`, espaços repetidos, cada termo inválido da estratégia de testes do design, modificador desconhecido ignorado, `redirect` e `exp` repetidos, macro bem e mal formada, casos do `ip6`: `::`, `::1`, `2001:db8::/32`, `1::2::3`, quarteto IPv4, grupo com 5 dígitos). — RF-01, RF-02, RF-06
- [ ] Portão de qualidade. — resultado a registrar.

## Etapa 2 — Estágio, achados e entrada hostil

- [ ] `public/js/spf.js`: marcas `ignorado` (`apos-all`, `redirect-com-all`) com `termos-apos-all` e `redirect-ignorado`; `estagio` pelo primeiro `all` (`rigido`, `suave`, `permissivo`), `redirecionado` sem `all` e com `redirect` efetivo, `sem-all` sem os dois; achados `all-rigido`, `all-suave`, `all-neutro` e `all-libera-tudo`. — RF-02, RF-03, ADR-9
- [ ] `public/js/spf.js`: achados de higiene `ptr-em-uso`, `registro-grande` (acima de 512), `termo-repetido` (`ip4`, `ip6`, `include` idênticos) e `caixa-fora-do-padrao` (versão, qualificador de modificador, nomes de mecanismo e modificador; o alvo não conta). — RF-05
- [ ] `public/js/spf.js`: ordenação estável dos achados por gravidade e, dentro dela, pela ordem de geração do design (estrutura, termos, `termos-apos-all`, `redirect-ignorado`, `all`, `registro-grande`, caixa). — RF-05, ADR-10
- [ ] `test/spf.test.js`: os quatro qualificadores do `all` e o `estagio` de cada um; `sem-all`; `redirect` sem `all` (`redirecionado`) e com `all`; `ausente`, `multiplos` e `invalido` (`nenhum`); `ptr-em-uso`; 513 caracteres; `ip4` e `include` repetidos; ordem dos achados com vários juntos; registro de ponta a ponta; entrada hostil (`<script>` no registro, num termo e num alvo com o texto intacto em `registro` e o alvo recusado, 2000 termos em tempo curto, nenhuma entrada lança). — RF-03, RF-05, RF-06, RNF-03
- [ ] Portão de qualidade. — resultado a registrar.

## Etapa 3 — Caminhada pelos include e redirect

- [ ] `public/js/spf-consultas.js`: tipos (`Consulta`, `ItemConsulta`, `Consultas`, `CaminhadaSpf`, `ResultadoCaminhada`), `@ts-check` e JSDoc; constantes `TETO_CONSULTAS` (30) e `MAXIMO_FALHAS` (3); validação do domínio com `validarNomeDns`, consulta do domínio digitado, `{ ok: false, motivo }` na falha, `ausente` sem caminhada, e `spf` não válido devolvido com `total` 0. — RF-04, RF-06, RNF-01, RNF-02
- [ ] `public/js/spf-consultas.js`: caminhada em profundidade e sequencial, contagem de `include`, `a`, `mx`, `ptr`, `exists` e `redirect` (este por último, só se não ignorado), `itens` com `caminho`, cache por nome, ciclo pelo caminho atual, diamante que consulta uma vez e conta de novo, macro contada e não seguida. — RF-04, ADR-4, ADR-5, ADR-7, ADR-8
- [ ] `public/js/spf-consultas.js`: alvos mortos (`include-sem-registro`, `redirect-sem-registro`, `*-com-varios-registros`, `*-invalido`), consulta vazia só para `sem-registro` e `inexistente`, `consulta-falhou` com continuação, teto de termos e de falhas com `caminhada-interrompida`, `incompleta` e `interrompida`. — RF-04, RF-06, ADR-6, ADR-11
- [ ] `public/js/spf-consultas.js`: fechamento com `consultas-vazias`, `limite-de-consultas` e `perto-do-limite`; estágio do `redirect` (destino rígido, inválido, ausente, em ciclo, não verificado); achados dos registros incluídos pela lista permitida, com `dominio`, deduplicados e ordenados; `resolvedores` sem repetição. — RF-03, RF-04, ADR-9, ADR-10
- [ ] `test/spf-consultas.test.js`: cada caso da estratégia de testes do design (contagem por tipo, `all`/`ip4`/`ip6`/`exp` que não somam, ignorados que não somam, vários níveis com `caminho` exato, 10 e 11 termos, 8 a 10, diamante, alvos mortos, 2 e 3 consultas vazias, A→B→A e o próprio domínio, falha no meio, 3 falhas, falha no domínio digitado, macro, 100 alvos, cadeia de 40, diamantes que param em 30, nome nunca consultado duas vezes, alvo com `a&b=c` que não chega à função de consulta, estágio por `redirect`, lista permitida dos achados incluídos). — RF-03, RF-04, RF-06, RNF-03, RNF-04
- [ ] Portão de qualidade. — resultado a registrar.

## Etapa 4 — Documentação e fechamento

- [ ] `CLAUDE.md`: acrescentar `spf.js` e `spf-consultas.js` ao mapa de arquitetura. — ADR-1
- [ ] `specs/README.md`: linha `004-parser-spf` no roadmap (entrega `v0.4`, `concluído`); a tabela de marcos do `README.md` e do `README.en.md`, nos dois idiomas. — fluxo `/spec implementar`
- [ ] Frontmatter dos três documentos para `status: concluído`.
- [ ] Portão de qualidade final. — resultado a registrar.
