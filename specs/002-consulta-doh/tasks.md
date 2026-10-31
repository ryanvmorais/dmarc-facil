---
feature: Consulta DoH — buscar registros TXT de um nome por DNS-over-HTTPS, com fallback
status: concluído
date: 2026-10-31
related: [001-fundacao]
origin: conception
---

# 002 — Consulta DoH — Tasks

Tarefas pequenas, na ordem. Cada etapa fecha com o portão de qualidade (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) e o resultado real registrado na própria tarefa. Registro DNS em teste é sempre sintético (`exemplo.com.br`, `v=DMARC1; p=none`).

## Etapa 1 — Validação do nome DNS

- [x] `public/js/dominio.js`: exportar `TAMANHO_MAXIMO_ROTULO` e `TAMANHO_MAXIMO_DOMINIO`, sem mudar comportamento. — ADR-8
- [x] `public/js/nome-dns.js`: `validarNomeDns` (tamanho, caracteres `a-z A-Z 0-9 - _ .`, rótulo vazio ou acima de 63, ponto final único descartado, saída em minúsculas); `@ts-check`, JSDoc completo e `ResultadoNome`. — RF-05, ADR-3, ADR-8
- [x] `test/nome-dns.test.js`: tabela de aceitos (`_dmarc.exemplo.com.br`, `seletor1._domainkey.exemplo.com.br`, maiúsculas, ponto final) e recusados (vazio, espaço, `& = ? # / % :`, `a..b`, rótulo de 64, nome de 254) e a entrada hostil `exemplo.com&name=outro.com`. — RF-05
- [x] Portão de qualidade. — prettier, eslint e tsc sem aviso; 53 testes, 53 passam (`test/dominio.test.js` sem alteração)

## Etapa 2 — Leitura da resposta

- [x] `public/js/resposta-doh.js`: tipos `Resolvedor`, `Situacao` e `RespostaLida`; constantes `MAXIMO_REGISTROS`, `MAXIMO_TEXTO` e `MAXIMO_TEXTO_BRUTO` com o porquê. — RF-06, ADR-6
- [x] `public/js/resposta-doh.js`: `textoDoRegistro(data, resolvedor)`: Google como veio; Cloudflare junta os pedaços entre aspas sem separador, com a forma inesperada caindo no texto como veio. — RF-03, ADR-4
- [x] `public/js/resposta-doh.js`: `lerResposta(json, resolvedor)`: forma do objeto, `Status` 0 e 3, falha nos demais, `Answer` ausente ou lista, só `type === 16` com `data` string, limite de 50 registros e descarte por tamanho. — RF-01, RF-02, RF-06, ADR-1, ADR-9
- [x] `test/resposta-doh.test.js`: um caso por linha da estratégia de testes do design: formatos Cloudflare e Google com o mesmo `registros`, CNAME misturado, `Status` 0 sem `Answer` e com `Answer: []`, `Status` 3 com e sem `Answer`, `Status` 2 e 5 como falha, não-objeto, `Status` ausente ou texto, `Answer` que não é lista, item sem `data`, 60 registros devolvem 50, texto de 5000 descartado e TXT com `<script>` devolvido intacto. — RF-02, RF-03, RF-06
- [x] Portão de qualidade. — prettier, eslint e tsc sem aviso; 77 testes, 77 passam

## Etapa 3 — Consulta com fallback

- [x] `public/js/doh.js`: lista fixa de resolvedores (Cloudflare, Google), motivos em português como constantes marcadas `[provisório]`, e `consultarUm` (URL por `new URL` e `searchParams`, opções do `fetch` do ADR-7, `AbortSignal.timeout`, HTTP 2xx, JSON, `lerResposta`; toda exceção vira falha). — RF-01, RF-06, RF-07, ADR-5, ADR-7
- [x] `public/js/doh.js`: `consultarTxt(nome, { buscar, tempoLimiteMs })`: valida o nome sem tocar a rede, percorre os resolvedores, carimba o `resolvedor`, para na primeira leitura `ok` e devolve o motivo único quando todos falham. — RF-04, RF-05, RNF-02, ADR-1, ADR-2
- [x] `test/doh.test.js`: `buscar` falso que registra URL e opções; caminho feliz na Cloudflare sem tocar o Google; fallback por `TypeError`, por tempo esgotado (10 ms, `buscar` que obedece ao sinal), por HTTP 500, por corpo que não é JSON e por `Status` 2; sem fallback em `Status` 3 e em `sem-registro`; falha dos dois; nome mal formado sem nenhuma chamada a `buscar`; nome com `&` não vira parâmetro (só `name` e `type`); opções de privacidade presentes; nada escrito no console. — RF-01, RF-04, RF-05, RF-07
- [x] Portão de qualidade. — prettier, eslint e tsc sem aviso; 104 testes, 104 passam; cobertura de linhas 100% nos três módulos (a função de `fetch` padrão de `doh.js` não é exercida: os testes sempre injetam `buscar`)

## Etapa 4 — Documentação e fechamento

- [x] `CLAUDE.md`: acrescentar `nome-dns.js`, `resposta-doh.js` e `doh.js` ao mapa de arquitetura. — ADR-3
- [x] `docs/stack.md`: acrescentar `fetch`, `AbortSignal.timeout` e DNS-over-HTTPS (JSON) à stack, com o que estudar. — ADR-5, ADR-7
- [x] `specs/README.md`: linha `002-consulta-doh` no roadmap (entrega `v0.2`, `concluído`); a tabela de marcos do `README.md` e do `README.en.md` só se o texto atual já listar marcos. — fluxo `/spec implementar`
- [x] Frontmatter dos três documentos para `status: concluído`.
- [x] Portão de qualidade final. — prettier, eslint e tsc sem aviso; 104 testes, 104 passam, 0 falham
