---
feature: Página — o visitante digita o domínio e vê DMARC, SPF e DKIM explicados em português, com o próximo passo
status: concluído
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh, 003-parser-dmarc, 004-parser-spf, 005-dkim]
origin: conception
---

# 006 — Página — Tasks

Tarefas pequenas, na ordem. Cada etapa fecha com o portão de qualidade (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) e o resultado real registrado na própria tarefa. Registro DNS em teste é sempre sintético (`exemplo.com.br`). Nenhum HTML ou CSS é escrito antes da etapa 6, e só a partir do mockup aprovado (`Desktop-C-coluna`, `Celular-C`, `Celular-C-estados`, `Erro-404-*`); texto de interface não final leva `provisorio`/`data-provisorio`.

## Etapa 1 — Defesa do DOM

- [x] `public/js/doh.js`: exportar `RESOLVEDORES` (só a exportação; `test/doh.test.js` continua verde sem mudança). — ADR-10
- [x] `eslint.config.mjs`: para `public/**/*.js`, `no-restricted-properties` com `innerHTML`, `outerHTML`, `insertAdjacentHTML` e `document.write`, mais `no-eval`, `no-new-func` e `no-implied-eval`. — RF-11, ADR-9
- [x] `test/lint-dom.test.js`: pela API do `ESLint`, cada forma proibida em um trecho de `public/js/x.js` dá erro; um trecho com `textContent` e `createElement` não dá. — RF-11, RNF-05
- [x] `public/js/dom.js`: `@ts-check`, JSDoc; `urlHttps` (só `https`, sem credencial; `http`, `javascript:`, `data:`, relativa e malformada devolvem `null`); `criar(documento, tag, atributos, filhos)` com a lista fixa de tags e de atributos do ADR-9, recusa de `on*` e `style`, filhos como texto ou nó, `createElementNS` para SVG. — RF-11, ADR-9
- [x] `test/ajudas/documento-falso.js`: documento falso de uns 40 linhas (`createElement`, `createElementNS`, `createTextNode`, `setAttribute`, `append`) que registra o que foi criado e lança se alguém atribuir `innerHTML` ou `outerHTML`.
- [x] `test/dom.test.js`: tag, atributo e `on*` fora da lista recusados; `urlHttps` nos oito casos; TXT hostil (`<script>`, `<img onerror>`, `javascript:`, aspas, 100 KB, caracteres de controle) vira texto sem criar nó extra. — RF-11, RNF-05
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes: 539 testes, 0 falhas.

## Etapa 2 — Selo e escada

- [x] `public/js/selo.js`: `Selo`, `calcularSelo(parte, estadoParte)` com as quatro regras do ADR-6, incluindo `incompleta` subindo `ok` para `atencao`. — RF-07, ADR-6
- [x] `test/selo.test.js`: falha → `nao-verificado`; DMARC e SPF ausente, inválido e múltiplos → `problema`; válido pelo pior achado (`erro`, `aviso`, `info`, nenhum); DKIM `encontrado`, `nao-encontrado` (→ `atencao`, com o nome da regra no teste), `indeterminado`; `incompleta`. — RF-07
- [x] `public/js/escada.js`: `Degrau`, `Escada`, `montarEscada(dmarc)`: papéis `atual`/`proximo`/`outro`, `semAtual`, `proximo` (`quarantine`, `reject`, `publicar`, `null`) e `ressalvas` por `subdominios-mais-fracos` e `aplicacao-parcial`. — RF-03, ADR-6
- [x] `test/escada.test.js`: `none`, `quarantine`, `reject`, ausente, inválido e múltiplos; só o degrau seguinte traz `acao`; `reject` sem próximo; as duas ressalvas. — RF-03
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes: 581 testes, 0 falhas; cobertura de `selo.js` e `escada.js` em 100% (linhas, ramos e funções). O `textos-interface.js` nasceu aqui (rótulos dos selos e textos dos degraus) porque `selo.js` e `escada.js` o importam; a etapa 3 o completa.

## Etapa 3 — Catálogo de textos

- [x] `public/js/textos-achados.js`: `TextoAchado`, `TEXTOS_ACHADOS` com uma entrada por código dos cinco módulos (`titulo`, `explicacao`, `acao`, `provisorio: true`), sem afirmar o que a ferramenta não sabe; `textoDoAchado(achado)` com texto genérico e o código quando o catálogo não tem. — RF-08, RF-09, ADR-7
- [x] `public/js/textos-interface.js`: textos montados por script (títulos e resumos dos degraus, rótulos dos quatro selos, mensagens de falha por causa, frases do `aria-live`, "não encontrei esse domínio"), cada um com `provisorio`. — RF-02, RF-03, RF-13, ADR-7
- [x] `test/textos-achados.test.js`: varredura das fontes pelos três padrões do ADR-7, nos dois sentidos (código sem entrada, entrada sem código); cada um dos cinco arquivos rende ao menos um código; nenhuma entrada vazia; frases proibidas ("você não tem DKIM", "protegido", "garante"); `textoDoAchado` com código desconhecido. — RF-08, RF-09
- [x] `scripts/listar-textos-provisorios.mjs` e o script `textos:provisorios` no `package.json`: lista os textos marcados nos catálogos e os `data-provisorio` dos HTML de `public/`; `tsconfig.json` e `eslint.config.mjs` cobrem o script. — RF-09, ADR-7
- [x] `test/listar-textos-provisorios.test.js`: roda sobre um catálogo e um HTML sintéticos e confere a lista. — RF-09
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes: 604 testes, 0 falhas; 104 textos ficaram marcados (`pnpm textos:provisorios`). A varredura do ADR-7 ganhou um quarto padrão (`"x", "gravidade"` sem o parêntese, para os códigos `all-*` do `spf.js`) e um quinto para os códigos montados por `${tipo}-...` (6 códigos de `include`/`redirect`); 54 códigos no total.

## Etapa 4 — Apresentação e endereço

- [x] `public/js/endereco.js`: `lerDominioDoEndereco(busca)` e `montarEndereco(dominio)`, só texto (a normalização é do `normalizarDominio`). — RF-01, ADR-8
- [x] `test/endereco.test.js`: `?dominio=` presente, ausente, repetido, vazio, com `%`-escape, com marcação (devolve texto, não interpreta); `montarEndereco` codifica o domínio. — RF-01
- [x] `public/js/apresentacao.js`: `cortarTexto`, `lerSeletoresDigitados` (separa por vírgula, espaço e quebra de linha; usa `normalizarSeletor`; recusados com motivo), `mensagemDeFalha`, `resumoConsultas`. — RF-05, RF-06, RF-11
- [x] `public/js/apresentacao.js`: `apresentarDmarc`, `apresentarSpf` e `apresentarDkim` devolvendo `Cartao` (selo, resumo, `registro` cortado, achados por `textoDoAchado`, `extra` do DKIM com seletores tentados, provedor e link por `urlHttps`, `ORIENTACOES`), mais a frase do `aria-live`. — RF-04, RF-05, RF-06, RF-08, RF-13, ADR-12
- [x] `test/apresentacao.test.js`: contagem do SPF ("N de 10", "pelo menos N" se incompleta, acima de 10), DKIM nos três resumos e a frase "não encontrei nesses seletores" (nunca "você não tem"), seletor digitado válido/recusado/repetido, lista dos tentados com link só `https`, `cortarTexto`, `mensagemDeFalha` por causa, `rua` como texto e nunca `mailto:`, frase do `aria-live` sem afirmar mais que o selo. — RF-04 a RF-08, RF-11, RF-13
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes: 678 testes, 0 falhas; cobertura de `apresentacao.js` em 100% das linhas (96% dos ramos) e de `endereco.js` em 100%. A frase da contagem do SPF diz "N de 10 consultas DNS, no pior caso" (a contagem é o pior caso, como o `spf-consultas.js` pede), e a aplicação de `preencher` e `partirCodigo` (texto com trecho entre crases) entrou em `apresentacao.js`.

## Etapa 5 — Verificador

- [x] `public/js/verificador.js`: `criarVerificador({ consulta, seletoresComuns, aoMudar })` com `verificar`, `refazer` e `refazerDkim`; `normalizarDominio` antes de qualquer consulta; as três partes em paralelo; contador de geração que descarta resposta velha; consulta envolvida que anota a `situacao` do nome sem prefixo e marca `dominioInexistente`. — RF-01, RF-02, RF-06, ADR-4, ADR-5
- [x] `test/verificador.test.js`: consulta falsa com atrasos controlados; cada parte entrega quando termina; falha de uma não derruba as outras; a resposta da geração anterior nunca chama `aoMudar`; NXDOMAIN só em `_dmarc.` não marca o domínio como inexistente e no próprio domínio marca; domínio recusado não consulta; `refazer("spf")` e `refazerDkim` consultam só a parte pedida; segunda verificação idêntica em andamento não duplica consulta. — RF-02, RF-06, RNF-05
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes: 710 testes, 0 falhas; cobertura de `verificador.js` em 100% das linhas e 96% dos ramos. `verificar` devolve `{ ok, dominio | motivo }` (em vez de `void`) para a página mostrar o motivo da recusa sem normalizar duas vezes; a página passa a lista comum como texto (`seletoresComuns: string[]`) e a busca DKIM recebe comuns e extras juntos (`buscarDkim` já normaliza, tira repetidos e corta no teto).

## Etapa 6 — Páginas, CSS e fontes

Começa só com os mockups aprovados à mão. Carregar a checklist de `.html`, `.css` e `.js` de `/estilo-arquivos` antes de escrever.

- [x] `public/fonts/`: copiar `Sora-800-latin.woff2` e `JetBrainsMono-400-latin.woff2` (baixados em 2026-10-31 de `fonts.gstatic.com`, o endereço que o CSS do Google Fonts devolve para o subconjunto latino, `wOF2` conferido; 14 864 e 21 168 bytes; sha256 `b3058cd0…f176e` e `14425ba9…d89eb`) e os dois `OFL-*.txt` baixados dos repositórios oficiais (`sora-xor/sora-font` e `JetBrains/JetBrainsMono`); registrar origem, hash e licença em `docs/stack.md`. — RNF-01, ADR-11
- [x] `public/css/pagina.css`: tokens como custom properties, `@font-face` com URL relativa, fonte do corpo `system-ui`, layout de 320 a 1440 px (coluna de 720 px), cartões, selos com ícone, escada (papéis `atual`/`proximo`), esqueletos e larguras por classe, foco visível, alvos de 44 px, `prefers-reduced-motion`; sem `@import`, sem URL externa, sem `style=` nas páginas. — RF-07, RF-13, ADR-3, ADR-10, ADR-11
- [x] `public/index.html`: `lang="pt-BR"`, CSP por `<meta>` logo depois do `charset`, `<title>`, descrição, ícone, logo em `<svg>` com `fill-rule` como atributo, `h1`, formulário (domínio e "Verificar") com o aviso de privacidade, região `role="status"`, região de resultado vazia, rodapé, `<noscript>`, `data-provisorio` nos textos não finais, `<script type="module" src="/js/pagina.js">`. — RF-01, RF-10, RF-13, ADR-1, ADR-10, ADR-12
- [x] `public/js/pagina.js`: liga o envio (Enter e botão), preenche o campo pelo endereço sem verificar, `history.replaceState` ao verificar, desenha os cartões, a escada, o bloco do MailVigil (link do repositório, sem parâmetro) e o rodapé dos resolvedores com `criar`, anuncia pelo `aria-live`, devolve o foco ao `h2` do resultado, mostra o campo de seletores extras, "Tentar de novo" por cartão e o aviso de domínio inexistente. — RF-01 a RF-06, RF-10, RF-12, RF-13, ADR-8, ADR-12
- [x] `public/404.html`: CSP sem `script-src`/`connect-src`, caminhos absolutos, logo em `<svg>`, frase e link para `/`, sem script. — RF-14, ADR-14
- [x] `test/pagina-estatica.test.js`: `lang`, um `h1`, `label` ligado ao campo, CSP com os hosts de `RESOLVEDORES`, nenhum `style=` nem `<script>` externo em `public/`, nenhum `localStorage`/`sessionStorage`/`document.cookie`/`IndexedDB` em `public/js/`, `404.html` sem `<script>` e com caminhos absolutos, `<path>` do logo igual ao de `docs/images/`. — RF-10, RF-13, RF-14, RNF-03
- [x] Conferir em navegador real: 360, 390, 430 e 1280 px (sem rolagem horizontal), as seis situações do mockup de estados e a 404 (também num caminho aninhado, servindo a pasta com um servidor estático local), Tab/Enter/foco, leitor de tela no anúncio, `auditar_proporcoes.py` nas telas tocadas; comparar lado a lado com os mockups e corrigir até 3 rodadas. Registrar os 3 maiores desvios achados. — RF-13, RF-14
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes: 736 testes, 0 falhas. Conferido no Chrome real (headless, protocolo DevTools, servidor estático local, DoH de verdade): 360, 390, 430 e 1280 px sem rolagem horizontal; recusa do domínio (foco no campo), fim da verificação (foco no título e anúncio), Enter pelo teclado, campo de seletores extras refazendo só o DKIM, falha de rede nas três partes, domínio inexistente e a 404 num caminho aninhado (CSS e fontes carregam). Maiores desvios achados e corrigidos: (1) 15 achados idênticos de seletores diferentes (agora agrupados num só); (2) DKIM `indeterminado` sem o botão "Tentar de novo"; (3) padding do link do rodapé desalinhado. Leitor de tela e proporções, conferidos depois (sem NVDA/VoiceOver na máquina): pela árvore de acessibilidade do Chrome real e pelo teclado de verdade (Tab, Enter, foco visível de 3 px, foco no título, `status` com o resumo, zero controle sem nome); o `auditar_proporcoes.py` (que mora em `~/.claude/skills/auditoria-interface/scripts/`) deu 0 reprovações, e o botão de cartão esticado no desktop foi corrigido. Depois, com o NVDA 2026.3 de verdade (cópia portátil, assinatura da NV Access conferida, removida ao fim) e teclas reais: o NVDA leu os marcos, o título, o campo com a descrição de privacidade, "Verificando example.com.", o resumo "Resultado pronto…", "Resultado para example.com, título nível 2" e o botão dos seletores; o erro de domínio recusado é falado primeiro. O erro ganhou `role="alert"` e não refoca um campo já focado.

## Etapa 7 — Lighthouse CI

- [x] `lighthouserc.json`: `staticDistDir: ./public`, as duas páginas, mobile e desktop, três execuções; `assert` com acessibilidade = 1 e desempenho, boas práticas e SEO ≥ 0.95. — RNF-04, ADR-13
- [x] `.github/workflows/lighthouse.yml` e a ferramenta como dependência de desenvolvimento (versão com mais de 7 dias, `uses:` por SHA, `runs-on: ubuntu-26.04`, `permissions: contents: read`); medir o peso transferido da página inicial e registrar (meta: abaixo de 150 KB). — RNF-04, ADR-13
- [x] Portão de qualidade. — `format:check`, `lint`, `typecheck` e `test` verdes (736 testes). O workflow só roda no GitHub, mas as mesmas configs rodaram aqui com `npx @lhci/cli@0.15.1 autorun` (Chrome 140+, 3 medições, mediana): celular e desktop, `index.html` e `404.html`, desempenho 1, acessibilidade 1, boas práticas 1 e SEO 1; CLS 0 (celular) e 0,0006 (desktop); peso transferido do `index.html` 107 KB (meta: abaixo de 150 KB; a 404, 22 KB). Desvios do texto da tarefa: (1) as configs ficaram em `.github/lighthouse/{mobile,desktop}.json`, o layout da regra global, e não num `lighthouserc.json`, porque cada modo precisa da sua; (2) o `@lhci/cli` NÃO entrou como devDependency: `pnpm add -D @lhci/cli@0.15.1` trouxe 5 vulnerabilidades altas (`uuid`, `tmp` e outras) que derrubariam o `pnpm audit` do job `seguranca`, que é check obrigatório; a versão fica numa variável do workflow e entra por `npx`, como manda a regra global; (3) a auditoria `robots-txt` fica de fora (`skipAudits`): a CSP `connect-src` sem `'self'` impede o Lighthouse de baixar o arquivo e a nota de SEO cairia a 0,91 por um arquivo que a página nem precisa. A primeira execução real no GitHub é no PR.

## Etapa 8 — Fechamento

- [x] `CLAUDE.md`: árvore de arquitetura com os arquivos novos, o ⚠️ de `innerHTML` citando a regra de lint, a seção de qualidade com o Lighthouse CI (manter abaixo de ~20 KB). — Impacto
- [x] `docs/stack.md`: Lighthouse CI, fontes locais (origem e hash), CSP por `<meta>`, History API, `pnpm textos:provisorios`. — Impacto
- [x] `README.md` e `README.en.md`: status sem "a página ainda não existe", linha `v0.6` na tabela de marcos nos dois idiomas. — Impacto
- [x] `specs/README.md`: linha da 006 com `v0.6` e `concluído`; os três arquivos da spec com `status: concluído`. — Impacto
- [x] Portão de qualidade final. — `format:check`, `lint`, `typecheck` e `test` verdes: 736 testes (251 novos nesta spec, sobre os 485 que já existiam), 0 falhas; cobertura de linhas em 100% em `dom.js`, `selo.js`, `escada.js`, `endereco.js`, `apresentacao.js`, `verificador.js`, `textos-achados.js` e `textos-interface.js`, e 95% em `listar-textos-provisorios.mjs` (só o ramo de execução direta); 99,35% no repositório todo.
