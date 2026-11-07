---
feature: Inglês — o DMARC Fácil inteiro em /en/, com o mesmo código e os textos por idioma
status: concluído
date: 2026-11-07
related: [006-pagina, 007-hospedagem]
origin: conception
---

# 008 — Inglês: tarefas

Cinco etapas, um PR cada (ADR-12); a etapa 0 é a da própria spec. Até a etapa 3 a página em português fica idêntica ao que está no ar. Cada etapa termina com o portão de qualidade (`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) e o resultado real é registrado na tarefa.

Convenções: o código e os comentários seguem em português; o texto visível segue o idioma da página. A lista de códigos de recusa está no apêndice A, e o mapa das chaves do catálogo, no apêndice B.

## Etapa 0 — A spec

- [x] 0.1 `specs/008-ingles/requirements.md` aprovado e `design.md` aprovado. — ADR-12
- [x] 0.2 `specs/README.md`: acrescentar a linha `008-ingles` ao roadmap (escopo: catálogo por idioma, páginas em `/en/`, seletor de idioma, `hreflang`, imagem social em inglês), status `em andamento`. — RF-01, RF-08
- [x] 0.3 **Portão de qualidade:** `pnpm format:check` e `pnpm test` verdes. Resultado: `format:check`, `lint` e `typecheck` limpos; 831 testes, 831 passam.

## Etapa 1 — A recusa vira código (ADR-5, RF-03)

A página em português mostra exatamente as mesmas frases de antes. Só muda o que os módulos devolvem.

- [x] 1.1 Conferir o apêndice A contra o código: `grep -n "motivo" public/js/*.js` e a lista de frases fixas; acrescentar ao apêndice o que faltar. Conferido: as 22 frases batem; faltavam só os 6 códigos do seletor digitado (`seletor-dkim.js`), que já eram código e entraram na `MOTIVOS` (apêndice abaixo). — RF-03
- [x] 1.2 `public/js/tipos.js`: typedef `Recusa` (`{ motivo: string, valor?: string | number }`) e o `EstadoParte` de falha com `motivo` e `valor?`. — ADR-5
- [x] 1.3 `public/js/textos-interface.js`: tabela `MOTIVOS` com os códigos do apêndice A (as frases de hoje, com `{valor}` onde há dado) e o `MOTIVOS_SELETOR` atual incorporado a ela; `TEXTOS_FALHA.semMotivo` sai (vira o código `sem-motivo`). — ADR-5
- [x] 1.4 `public/js/textos-achados.js`: `textoDoMotivo(recusa)`, que devolve a frase com o `valor` encaixado por `preencher`; código sem entrada devolve a frase de `sem-motivo`, nunca o código. O `preencher` saiu de `apresentacao.js` para `public/js/preencher.js` (reexportado por `apresentacao.js`), porque `apresentacao.js` já importa `textos-achados.js` e os dois se importariam em círculo. — ADR-5, ADR-11
- [x] 1.5 `public/js/dominio.js` e `test/dominio.test.js`: devolver o código; os testes comparam o código, não a frase. — RF-03
- [x] 1.6 `public/js/nome-dns.js` e `test/nome-dns.test.js`: idem. — RF-03
- [x] 1.7 `public/js/resposta-doh.js`, `public/js/doh.js`, `test/resposta-doh.test.js` e `test/doh.test.js`: idem, com `valor` no status HTTP e no `Status` do DNS. O `consultarUm` do `doh.js` passou a ser exportado, só para os testes: o `consultarTxt` junta as falhas em `resolvedores-indisponiveis`, e `resolvedor-http` e `resposta-status-dns` (com `valor`) só se veem nele. — RF-03
- [x] 1.8 `public/js/spf-consultas.js`, `public/js/dkim-busca.js`, `public/js/verificador.js` e os testes `spf-consultas`, `dkim-busca` e `verificador`: propagar `motivo` **e** `valor` da consulta que falhou (o `tentados[].motivo` do DKIM inclusive); o `catch` do verificador devolve `sem-motivo`; o `verificador.js` deixa de importar `textos-interface.js`. — RF-03, ADR-3
- [x] 1.9 `public/js/apresentacao.js` (`mensagemDeFalha`, e onde mais ler `.motivo`: conferir com `grep -n "\.motivo" public/js`), `public/js/pagina.js` (`mostrarErroDoCampo`) e `test/ajudas/estados.js`: mostrar o texto por `textoDoMotivo`. — RF-03
- [x] 1.10 `test/motivos.test.js`: teste de cobertura que varre o código-fonte dos módulos pelos códigos emitidos (`motivo: "..."`) e falha se algum não tem entrada em `MOTIVOS`, ou se há entrada que ninguém emite; e um teste com as frases do apêndice A escritas por extenso, que prova que `textoDoMotivo` devolve a mesma frase de antes para cada código. — RF-03
- [x] 1.11 **Portão de qualidade.** Resultado: `format:check`, `lint` e `typecheck` limpos; 871 testes, 871 passam.

## Etapa 2 — O catálogo vira `textos/pt/` e entra como parâmetro (ADR-2, ADR-3, ADR-4, ADR-12)

Nenhuma frase muda. O catálogo ainda tem um idioma só.

- [x] 2.1 **Linha de base antes de mexer:** um teste que monta o resultado de um domínio sintético (DMARC, SPF com `include`, DKIM com chave de 1024 bits e uma falha de consulta) com as funções de apresentação de hoje e grava a saída (selos, degraus, textos de achado, frases de falha, anúncios) como fixture literal em `test/ajudas/`. Ele passa na `main` e continua passando ao fim da etapa. Gravada com o código de antes da troca: `test/linha-de-base-textos.test.js` compara a saída de `test/ajudas/linha-de-base.js` (seis registros DMARC com a escada de cada um, SPF com `include`, DKIM de 1024 bits, consulta que falha, seletores digitados, anúncios, achado genérico, a frase de cada motivo e a lista ordenada de todas as frases do catálogo) com `test/ajudas/linha-de-base-pt.json`. — RF-03, ADR-12
- [x] 2.2 `git mv` de `public/js/textos-achados.js` para `public/js/textos/pt/achados.js`, de `public/js/textos-interface.js` para `public/js/textos/pt/interface.js`, e a `MOTIVOS` para `public/js/textos/pt/motivos.js`; as chaves de `interface` em camelCase, pelo apêndice B. O `MOTIVOS` virou `motivos` e as constantes de `interface` viraram as chaves do apêndice B, num objeto só (`interfacePagina`, porque `interface` é palavra reservada). — ADR-3
- [x] 2.3 `public/js/textos/pt/index.js`: `export const textos = { achados, interface, motivos }`. — ADR-3
- [x] 2.4 `public/js/textos/tipos.js`: `Textos` = `typeof import("./pt/index.js").textos`. Também guarda `TextoFixo`, `TextoDegrau` e `TextoAchado`. — ADR-4
- [x] 2.5 `public/js/textos/resolver.js`: `textoDoAchado(textos, achado)` e `textoDoMotivo(textos, recusa)` (código movido de `textos-achados.js`); `textoGenerico` vira `achados.generico` no catálogo. `achados.generico` guarda `{codigo}`, trocado por `preencher`; o `AchadoLido` e o `AchadoVisivel` moram em `resolver.js`. — ADR-3, ADR-11
- [x] 2.6 `public/js/selo.js` e `public/js/escada.js`: `textos` como primeiro parâmetro; sem `import` de texto. — ADR-3
- [x] 2.7 `public/js/apresentacao.js`: `textos` como primeiro parâmetro em cada export que usa texto (`apresentarDmarc`, `apresentarSpf`, `apresentarDkim`, `mensagemDeFalha`, `resumoConsultas`, `rodapeDosResolvedores`, `lerSeletoresDigitados`, `anunciarInicio`, `anunciarInexistente`, `anunciarFim`); sem `import` de texto. — ADR-3
- [x] 2.8 `public/js/pagina.js`: exportar `iniciarPagina(textos)` e passar o catálogo adiante; continua o único módulo com `document`, `location` e `history`. Tudo o que usa elemento da página e estado ficou dentro de `iniciarPagina`; as funções de desenho recebem `textos`. O elemento do formulário de domínio passou a se chamar `formularioDominio`, porque `formulario` é o bloco de textos. — ADR-2
- [x] 2.9 `public/js/entrada-pt.js` (três linhas) e `public/index.html` apontando para `/js/entrada-pt.js`; atualizar `scripts/conferir-hospedagem.mjs` e os testes `conferir-hospedagem`, `pagina-estatica`, `hospedagem` e `cabecalhos` que citam `/js/pagina.js` como a entrada. O `pagina-estatica` ganhou o teste de que a entrada importa o catálogo do mesmo idioma; `hospedagem` e `cabecalhos` não citavam a entrada. — ADR-2
- [x] 2.10 `test/ajudas/textos.js` (entrega o catálogo `pt`) e atualização dos testes `apresentacao`, `escada`, `selo`, `textos-achados`, `verificador` e do que mais chamar as funções do ADR-3. `test/textos-injecao.test.js` (novo) guarda a regra "módulo puro não carrega frase". — ADR-3
- [x] 2.11 `test/paridade-textos.test.js`: sobre a lista de idiomas do teste (`["pt"]` agora): chaves iguais, marcadores `{nome}` iguais, mesmo número de trechos entre crases, nenhum texto vazio; roda de verdade já aqui e passa a comparar pares na etapa 3. `compararCatalogos` é alimentado com catálogos defeituosos de propósito, para a conferência da etapa 3 não passar em branco. — RF-04, ADR-4, ADR-12
- [x] 2.12 `CLAUDE.md`: mapa de `public/js/` com `textos/`, `entrada-*.js` e a nova regra "módulo puro não carrega frase". — RF-03, ADR-3
- [x] 2.13 **Portão de qualidade**, incluindo a linha de base da 2.1 intacta. Resultado: `format:check`, `lint` e `typecheck` limpos; 888 testes, 888 passam; o JSON da linha de base não mudou. Conferido também no Chrome (`index.html` servido de `public/`, `example.com` verificado): sem erro de console, resultado e anúncios em português como antes.

## Etapa 3 — O inglês (RF-01 a RF-08)

Um PR só. Os textos em inglês foram revisados e aprovados na 3.19.

### 3A — O catálogo em inglês

- [x] 3.1 `public/js/textos/en/interface.js` e `motivos.js`: a tradução de cada chave, com o nome "DMARC Fácil", `p=none`, `~all` e demais trechos técnicos intactos; "não encontrei nesses seletores" vira o equivalente (nunca "you don't have DKIM"). Feito em `public/js/textos/en/interface.js` e `motivos.js`; "Atenção" virou "Attention" (e não "Warning", que é a gravidade `aviso`). — RF-02, RNF-06
- [x] 3.2 `public/js/textos/en/achados.js` e `index.js`, anotados com `@type {Textos}`: a tradução de cada achado (título, explicação, ação) e de `generico`. — RF-02, ADR-4
- [x] 3.3 `test/paridade-textos.test.js`: lista de idiomas `["pt", "en"]`; os testes de cobertura de achados e de motivos passam a rodar para cada idioma. `ajudas/textos.js` ganhou `catalogos = { pt, en }`; `textos-injecao.test.js` também confere o `en`. — RF-04
- [x] 3.4 `test/` (novo, com `test/ajudas/`): o mesmo resultado sintético montado com `pt` e com `en` tem os mesmos selos, degraus, códigos de achado e seletores; um registro TXT com `<script>` vira texto puro em inglês. Em `test/idiomas-resultado.test.js`. — RF-02
- [x] 3.5 `public/js/entrada-en.js`. — ADR-2

### 3B — As páginas e o seletor

- [x] 3.6 `public/js/endereco.js` e `test/endereco.test.js`: `montarEnderecoIdioma(base, texto)`: campo vazio (sem parâmetro), texto longo (cortado no limite), texto com `<script>`, `javascript:` e `%00` (codificado e inerte). — RF-05, ADR-6
- [x] 3.7 `public/js/pagina.js` e `test/ajudas/documento-falso.js`: guardar a base do `href` de cada link de idioma e regravá-lo no `input` do campo e ao fim da verificação; teste com o documento falso (campo vazio, digitado, verificado). A ligação é `ligarLinksDeIdioma(links, campo)`, exportada de `pagina.js` e testada em `test/idiomas-links.test.js` com o `NoFalso` ampliado (`getAttribute`, `addEventListener`, `disparar`, `value`). — RF-05, ADR-6
- [x] 3.8 `public/css/pagina.css`: o `.idioma` do mockup (alvo de 44 px, `aria-current` sublinhado, tokens claros e escuros). — RF-05, RNF-04
- [x] 3.9 `public/index.html`: o `nav` de idioma no cabeçalho e no rodapé (`aria-label` do `nav`, `lang`, `hreflang`, nome acessível "PT: Português" e "EN: English"), os três `link rel="alternate" hreflang` e a entrada `/js/entrada-pt.js`. — RF-05, RF-06, ADR-6
- [x] 3.10 `public/en/index.html`: a mesma estrutura do `index.html`, com `lang="en"`, `title`, `description`, `canonical` (`/en/`), `og:*` (`og:locale` `en_US`, `og:image` `social-en.png`), os mesmos `hreflang`, a entrada `/js/entrada-en.js`, o texto de apoio, o rodapé e o `<noscript>` em inglês. Caminhos absolutos para CSS, fontes, favicon e módulos. — RF-01, RF-06, ADR-1, ADR-9
- [x] 3.11 `public/en/404.html`: a 404 em inglês, sem script, com o link de volta para `/en/`, sem `canonical`, `og:*` nem `hreflang`; a CSP igual à da 404 atual. — RF-01, RF-06
- [x] 3.12 `test/pagina-estatica.test.js` e `test/cabecalhos.test.js`: as páginas em inglês sem `style=` nem script inline, com o `lang` certo, a CSP da `<meta>` igual à do `index.html`, a entrada e o catálogo do mesmo idioma; o esqueleto de `index.html` e `en/index.html` (ids, classes e ordem) idêntico; idem para as duas 404. — RF-01, ADR-1

### 3C — Descoberta e imagem

- [x] 3.13 `public/sitemap.xml`: as duas URLs com `xhtml:link` recíproco (o `x-default` fica só nas páginas); `test/descoberta.test.js`: `canonical` de cada página é ela mesma, `hreflang` recíproco, `x-default` para `/`, sitemap com exatamente as duas páginas, tudo derivado da rota do `wrangler.json`, e a ausência dessas tags nas 404. — RF-06, ADR-7, RNF-08
- [x] 3.14 `docs/images/dmarc-facil-dmarc-checker-social-preview-en.html` (mesmo desenho, texto da escada e da frase em inglês), o PNG gerado pelo comando do cabeçalho do HTML e `public/social-en.png` idêntico a ele; `test/imagem-social.test.js` rodando para os dois (1280 × 640, até 1 MB, mesmo `<path>` do logo, cópia idêntica byte a byte). — RF-06, ADR-8
- [x] 3.15 `eslint.config.mjs` e `test/lint-dom.test.js`: proibir `navigator.language`, `navigator.languages`, `localStorage`, `sessionStorage`, `indexedDB` e `document.cookie` em `public/**`, com um teste que alimenta cada um e espera a recusa. — RF-07, ADR-10

### 3D — Hospedagem e CI

- [x] 3.16 `.github/lighthouse/mobile.json`, `desktop.json` e `.github/workflows/lighthouse.yml`: medir `en/index.html` e `en/404.html` sobre `public/` (o `staticDistDir` já mede todo HTML da pasta, então `mobile.json` e `desktop.json` não mudaram; o teste confere que não há lista de URLs e que as quatro páginas existem); `producao-mobile.json` e `producao-desktop.json`: acrescentar `/en/`; `test/lighthouse-producao.test.js` derivando as URLs do `wrangler.json`. — RF-08, RNF-03
- [x] 3.17 `scripts/conferir-hospedagem.mjs` e `test/conferir-hospedagem.test.js`: conferir `/en/` (200, corpo idêntico a `en/index.html`, cabeçalhos), `/en` (redirecionamento para `/en/` ou 200) e um caminho inexistente sob `/en/` (404, corpo idêntico a `en/404.html`). O script passou de sete para dez verificações; a de JavaScript cobre as duas entradas. — RF-08, ADR-9
- [x] 3.18 `CLAUDE.md`, `docs/stack.md`, `README.md` e `README.en.md`: a página em inglês, `textos/`, as entradas, o seletor de idioma, a linha de convenção "strings visíveis, no idioma da página", o `social-en.png`. — RF-05, RF-06, RNF-07

### Revisão e fechamento da etapa

- [x] 3.19 O mantenedor revisa os textos em inglês (catálogo `en/`, `en/index.html`, `en/404.html`, `social-en.png`); as correções entram no mesmo PR e nenhum texto vai ao ar com marca de provisório. Revisados e aprovados sem correção; a marca `[provisório]` saiu dos dois `motivos.js`. — RNF-06
- [x] 3.20 **Portão de qualidade.** Resultado: `format:check`, `lint` e `typecheck` limpos; 974 testes, 974 passam. Conferido também no Chrome (`public/` servido, `/en/`): sem erro de console, sem rolagem horizontal em 390 px, os links PT/EN levam o domínio digitado, o resultado de `github.com` e o anúncio saem em inglês, claro e escuro.

## Etapa 4 — Conferência no ar e fechamento (RF-08, RNF-03, RNF-04)

Roda depois do merge da etapa 3 e do deploy.

- [x] 4.1 `pnpm hospedagem:conferir` contra o endereço real, com `/en/`, `/en` e a 404 sob `/en/`. Se `/en` ou a 404 se comportarem diferente do que o ADR-9 supõe, ajustar a spec e o teste, e não o `public/`. Resultado: as dez verificações passam no deploy do `main` (`6585b4d` e depois `e3aab56`): `/en/` 200 com o corpo idêntico a `en/index.html`; `/en` responde 307 com `location` para `/en/` (como o ADR-9 supôs); um caminho inexistente sob `/en/` responde 404 com o corpo de `en/404.html`; `entrada-en.js` idêntica e revalidando. Nada a ajustar na spec nem em `public/`. — RF-08
- [x] 4.2 Lighthouse do endereço real em `/en/` (mobile e desktop): acessibilidade 1, demais ≥ 0,95, peso abaixo de 150 KB. Resultado: no deploy de `e3aab56`, as quatro medições (celular e desktop, `/` e `/en/`, mediana de três) dão acessibilidade, desempenho, boas práticas e SEO em 100, e peso de 142 KB (142 288 e 142 241 bytes no desktop; 142 578 e 142 269 no celular). A primeira medição, em `6585b4d`, reprovou só o peso (156 190 bytes em `/` e 155 924 em `/en/`, contra 153 600; já eram 154 823 em `/` no deploy da etapa 2). A causa estava na `JetBrains Mono` (21 KB): reduzida a ASCII e Latin-1, sem ligaduras, caiu para 7 KB. — RNF-03
- [x] 4.3 leitor de tela (NVDA) em português e em inglês: cada página anuncia o idioma certo, o seletor de idioma é lido como "PT: Português" e "EN: English", o campo de domínio, o resultado e as frases do `aria-live` saem no idioma da página. Resultado: NVDA 2026.3 com o log de fala, sobre o endereço real. Em português: `lang="pt-BR"`, navegação "Idioma", links lidos como "PT: Português, página atual" e "EN: English", campo "Domínio, edição" com a nota de privacidade, anúncios "Verificando ryanmorais.com.br." e "Resultado pronto para ryanmorais.com.br. DMARC: ok. SPF: atenção. DKIM: atenção.", título "Resultado para ryanmorais.com.br, nível 2". Em inglês: navegação "Language", mesmos links, campo "Domain, edição", "Checking ryanmorais.com.br." e "Result ready for ryanmorais.com.br. DMARC: ok. SPF: attention. DKIM: attention.", "Result for ryanmorais.com.br", botão "See the 15 selectors tried". O NVDA reconhece o `lang="en"` (troca de idioma no título e no nome da marca), mas a instalação de teste não tem voz em inglês ("Inglês (não suportado)"), então a pronúncia em inglês não foi ouvida e o rótulo "EN: English" foi falado na voz em português. — RF-05, RNF-04
- [x] 4.4 Conferir pelo endereço real as tags de compartilhamento e `hreflang` das duas páginas e a imagem `social-en.png` (200, `image/png`, 1280 × 640). Resultado: no ar, `/` e `/en/` têm `canonical` próprio, os três `hreflang` iguais nas duas, `og:url`, `og:locale` (`pt_BR` e `en_US`) e `og:image` (`social-pt.png` e `social-en.png`); o sitemap lista as duas URLs; as duas imagens respondem 200, `image/png`, 1280 × 640 (65 359 e 61 363 bytes). — RF-06
- [x] 4.5 `specs/README.md`: linha `008-ingles` com entrega `v0.8` e status `concluído`; os três documentos da spec com `status: concluído`; conferir `CLAUDE.md`, `docs/stack.md` e os dois READMEs contra o que foi entregue. Conferidos: `docs/stack.md` já traz a fonte reduzida (PR #34) e a seção de idiomas; `CLAUDE.md` e os READMEs descrevem a página em inglês, sem número de peso nem tamanho de fonte a corrigir. — RF-06, RF-08
- [x] 4.6 **Portão de qualidade final.** Resultado: `format:check`, `lint` e `typecheck` limpos; 974 testes, 974 passam.

## Apêndice A — Códigos de recusa e falha (etapa 1)

Frases de hoje, em português, e o código que as substitui. `valor` indica o dado que o texto encaixa. São 22 códigos; o "Digite um domínio" de `dominio.js` e de `dkim-busca.js` é um só. Os 6 códigos do seletor digitado (`vazio`, `parece-nome-completo`, `grande-demais`, `componente-vazio`, `componente-grande-demais`, `caractere-invalido`) já eram código antes desta etapa e dividem a tabela `MOTIVOS`, que fica com 28 entradas.

| Origem            | Frase de hoje                                                                  | Código                          | `valor`       |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------- | ------------- |
| `dominio.js`      | Digite um domínio, por exemplo exemplo.com.br.                                 | `dominio-vazio`                 |               |
| `dominio.js`      | Digite só o domínio, sem porta nem endereço IPv6.                              | `dominio-com-porta-ou-ipv6`     |               |
| `dominio.js`      | Esse texto não é um domínio válido.                                            | `dominio-invalido`              |               |
| `dominio.js`      | O domínio é comprido demais (o limite é 253 caracteres).                       | `dominio-comprido-demais`       |               |
| `dominio.js`      | Use o domínio completo, por exemplo exemplo.com.br.                            | `dominio-incompleto`            |               |
| `dominio.js`      | Endereço IP não tem DMARC: digite o nome do domínio.                           | `dominio-e-ip`                  |               |
| `dominio.js`      | Uma parte do domínio passa de 63 caracteres.                                   | `dominio-parte-comprida-demais` |               |
| `dominio.js`      | O domínio só pode ter letras, números e hífen.                                 | `dominio-caractere-invalido`    |               |
| `nome-dns.js`     | O nome da consulta está vazio.                                                 | `nome-vazio`                    |               |
| `nome-dns.js`     | O nome da consulta é comprido demais (o limite é 253 caracteres).              | `nome-comprido-demais`          |               |
| `nome-dns.js`     | O nome da consulta tem um caractere que não é permitido.                       | `nome-caractere-invalido`       |               |
| `nome-dns.js`     | O nome da consulta tem uma parte vazia (dois pontos seguidos).                 | `nome-parte-vazia`              |               |
| `nome-dns.js`     | Uma parte do nome da consulta passa de 63 caracteres.                          | `nome-parte-comprida-demais`    |               |
| `resposta-doh.js` | A resposta do resolvedor não é um objeto.                                      | `resposta-nao-objeto`           |               |
| `resposta-doh.js` | A resposta do resolvedor não traz o Status.                                    | `resposta-sem-status`           |               |
| `resposta-doh.js` | O resolvedor não conseguiu resolver o nome (Status N).                         | `resposta-status-dns`           | o `Status`    |
| `resposta-doh.js` | O Answer da resposta não é uma lista.                                          | `resposta-answer-invalido`      |               |
| `doh.js`          | O resolvedor respondeu HTTP N.                                                 | `resolvedor-http`               | o status HTTP |
| `doh.js`          | A consulta ao resolvedor falhou (rede, tempo ou resposta inválida).            | `consulta-falhou`               |               |
| `doh.js`          | Não consegui consultar o DNS agora, nem pela Cloudflare nem pelo Google. (...) | `resolvedores-indisponiveis`    |               |
| `dkim-busca.js`   | Não há seletor para procurar.                                                  | `sem-seletores`                 |               |
| `verificador.js`  | Não consegui consultar o DNS agora.                                            | `sem-motivo`                    |               |

A tarefa 1.1 confere esta tabela com o código e a corrige se faltar uma frase. O texto completo de `resolvedores-indisponiveis` é o de `MOTIVO_FALHA_GERAL` em `doh.js`.

## Apêndice B — Chaves do catálogo (etapa 2)

| Constante atual (`textos-interface.js`)     | Chave em `textos.interface`                                         |
| ------------------------------------------- | ------------------------------------------------------------------- |
| `TEXTOS_SELO`                               | `selo`                                                              |
| `TEXTOS_DEGRAUS`                            | `degraus`                                                           |
| `ETIQUETAS_DEGRAU`                          | `etiquetas`                                                         |
| `ACOES_PROXIMO`                             | `acoesProximo`                                                      |
| `TEXTOS_ESCADA`                             | `escada`                                                            |
| `RESSALVAS_ESCADA`                          | `ressalvas`                                                         |
| `TITULOS_CARTAO`                            | `titulosCartao`                                                     |
| `TEXTOS_VERIFICANDO`                        | `verificando`                                                       |
| `TEXTOS_FALHA`                              | `falha` (só `naoDiz`; o `semMotivo` virou o código `sem-motivo`)    |
| `TEXTOS_DMARC`, `TEXTOS_SPF`, `TEXTOS_DKIM` | `dmarc`, `spf`, `dkim`                                              |
| `ROTULOS_GRAVIDADE`                         | `gravidade`                                                         |
| `ROTULOS_DADO_DO_ACHADO`                    | `dadoDoAchado`                                                      |
| `TEXTOS_RESULTADO`                          | `resultado`                                                         |
| `TEXTOS_FORMULARIO`                         | `formulario`                                                        |
| `TEXTOS_ANUNCIO`                            | `anuncio`                                                           |
| `MOTIVOS_SELETOR`                           | entra em `textos.motivos` (mesma tabela dos códigos de recusa)      |
| `TEXTOS_ACHADOS` (`textos-achados.js`)      | `textos.achados.porCodigo`; `textoGenerico` vira `achados.generico` |
