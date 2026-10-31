---
feature: Parser DMARC — escolher o registro DMARC entre os TXT de `_dmarc.<domínio>`, lê-lo e apontar os achados
status: aprovado
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh]
origin: conception
---

# 003 — Parser DMARC — Tasks

Tarefas pequenas, na ordem. Cada etapa fecha com o portão de qualidade (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) e o resultado real registrado na própria tarefa. Registro DMARC em teste é sempre sintético (`exemplo.com.br`, `dmarc@exemplo.com.br`, `v=DMARC1; p=none`).

## Etapa 1 — Escolha do registro e leitura das tags

- [ ] `public/js/dmarc.js`: tipos (`Politica`, `Estagio`, `Gravidade`, `Achado`, `DestinoRelatorio`, `ResultadoDmarc` e suas variantes), `@ts-check` e JSDoc completo; entrada defensiva (o que não é lista vira lista vazia, o que não é texto é descartado). — RF-06, RNF-01, RNF-02
- [ ] `public/js/dmarc.js`: escolha dos candidatos por `v=DMARC1` (tag `v` em qualquer caixa, valor exato, seguido de `;` ou do fim), com `ausente`, `multiplos` (com `quantidade`) e o candidato acima de `MAXIMO_TEXTO` virando `invalido` com `registro-grande-demais`. — RF-01, RF-06, ADR-2, ADR-8
- [ ] `public/js/dmarc.js`: divisão em tags (primeiro `=`, nome em minúsculas, pedaço vazio e pedaço sem `=` ignorados, tag desconhecida ignorada, tag conhecida repetida vale a primeira com `tag-duplicada`). — RF-02, ADR-4, ADR-9
- [ ] `test/dmarc.test.js`: casos de escolha (um registro entre TXT alheios, nenhum, vários, `v` fora do começo, espaços ao redor do `=`, `V=DMARC1` aceito, `v=dmarc1` e `v=DMARC10` recusados, lista que não é lista, itens que não são texto, candidato de 5000 caracteres) e de divisão em tags (`;` final, espaços extras, `;;`, tag desconhecida, pedaço sem `=`, tag duplicada). — RF-01, RF-02, RF-06
- [ ] Portão de qualidade. — _resultado a registrar_

## Etapa 2 — Valores das tags, política e destinos

- [ ] `public/js/dmarc.js`: interpretação de `sp`, `adkim`, `aspf`, `pct`, `fo`, `rf` e `ri` com o padrão da RFC e `valor-invalido` (e `padrao` com os nomes das tags que ficaram no padrão); `sp` inválido cai em `p`. — RF-02, RF-03, ADR-4
- [ ] `public/js/dmarc.js`: `lerDestinos` (`mailto:` em qualquer caixa, tamanho opcional `!10m`, usuário de 1 a 64 caracteres sem caracteres proibidos, domínio por `validarNomeDns` com ao menos dois rótulos, endereço de até 254, limite de 20, sem decodificar percent-encoding) e `MAXIMO_DESTINOS`; `endereco-invalido` com a quantidade descartada. — RF-04, RF-06, ADR-7
- [ ] `public/js/dmarc.js`: política (`p` válido; ausente salvo por `rua` válido vira `none` com `politica-ausente` aviso; ausente sem `rua` válido é `invalido` com `politica-ausente` erro; fora dos três valores é `invalido` com `politica-invalida`, mesmo com `rua` válido). — RF-03, ADR-5
- [ ] `test/dmarc.test.js`: valores por tag (`pct` com `abc`, `150`, `-1`; `adkim`, `aspf`, `fo`, `rf`, `ri`, `sp` inválidos e válidos), política (os três valores, `p` ausente com e sem `rua`, `p` inválido com `rua` válida continua `invalido`), destinos (dois endereços com `!10m`, `http://`, sem `@`, vazio, `localhost`, `a@b`, 25 válidos devolvem 20 com `detalhe` 5, `<script>` no endereço recusado). — RF-02, RF-03, RF-04, RF-06
- [ ] Portão de qualidade. — _resultado a registrar_

## Etapa 3 — Estágio, achados e entrada hostil

- [ ] `public/js/dmarc.js`: `estagio` igual à política efetiva (`nenhum` fora de `valido`) e os achados derivados `monitoramento-apenas`, `aplicacao-parcial` (com o `pct` em `detalhe`, só fora de `none`), `subdominios-mais-fracos`, `sem-relatorio-agregado` e `caixa-fora-do-padrao` (valores de `p`, `sp`, `adkim`, `aspf` normalizados em minúsculas). — RF-05, ADR-6
- [ ] `public/js/dmarc.js`: ordenação estável dos achados por gravidade (`erro`, `aviso`, `info`) e, dentro dela, pela ordem de geração (estrutura, tags na ordem fixa, derivados). — RF-05, ADR-3
- [ ] `test/dmarc.test.js`: os quatro valores de `estagio`; cada código da tabela do design; ordem dos achados com vários juntos; `pct` ignorado com `p=none`; `p=reject; sp=none`; registro de ponta a ponta com todas as tags; entrada hostil (HTML no valor de uma tag desconhecida com o texto intacto em `registro`, 4000 `;` em tempo curto, nenhuma entrada lança). — RF-05, RF-06, RNF-03
- [ ] Portão de qualidade. — _resultado a registrar_

## Etapa 4 — Documentação e fechamento

- [ ] `CLAUDE.md`: acrescentar `dmarc.js` ao mapa de arquitetura. — ADR-1
- [ ] `specs/README.md`: linha `003-parser-dmarc` no roadmap (entrega `v0.3`, `concluído`); a tabela de marcos do `README.md` e do `README.en.md`, nos dois idiomas. — fluxo `/spec implementar`
- [ ] Frontmatter dos três documentos para `status: concluído`.
- [ ] Portão de qualidade final. — _resultado a registrar_
