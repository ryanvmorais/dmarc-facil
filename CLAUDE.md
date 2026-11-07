# CLAUDE.md

Este arquivo orienta o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## Visão geral do projeto

**DMARC Fácil** é um site estático que consulta o DMARC, o SPF e o DKIM de um domínio, explica cada registro em português e em inglês (duas páginas, `/` e `/en/`) e diz o próximo passo (de `p=none` para `quarantine` e `reject`). Tudo roda no navegador do visitante, por DNS-over-HTTPS: nenhum servidor nosso vê o domínio. É a porta de entrada do MailVigil.

Stack: JavaScript puro (módulos ES, sem build), HTML e CSS, Node 26 e pnpm 12 só para as ferramentas de desenvolvimento. Público, Apache-2.0. Não tem versão numerada: é uma página que se atualiza sozinha, e cada merge na `main` com o CI verde publica a nova (spec 007). Hospedado como Workers Static Assets da Cloudflare em `dmarc-facil.ryanmorais.com.br`.

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

# Confere os links da lista de seletores DKIM
pnpm links:dkim

# Confere o que está no ar contra public/ (rede; endereço lido do wrangler.json)
pnpm hospedagem:conferir
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
wrangler.json            # projeto de hospedagem (Worker só de assets): rota do domínio, ./public, 404-page; FONTE ÚNICA do endereço
public/                  # o site: é o que vai para a hospedagem, sem build
  index.html, 404.html   # as páginas em português (CSP por <meta>, sem style= nem script inline; caminhos absolutos; canonical, hreflang e og:* só no index; o texto de apoio, o rodapé e o seletor de idioma são HTML estático, fora do pagina.js)
  en/index.html, en/404.html # as mesmas em inglês, escritas à mão com o mesmo esqueleto (ids, classes e ordem; `test/pagina-estatica.test.js` compara); só mudam o texto, o `lang`, o `canonical` (`/en/`), a entrada (`entrada-en.js`) e a imagem social; CSS, fontes, favicon e módulos são os da raiz, por caminho absoluto
  _headers               # cabeçalhos de segurança (/*) e cache longo das fontes (/fonts/*); a plataforma o consome, não o publica
  robots.txt, sitemap.xml # descoberta; citam o endereço da rota do wrangler.json; o sitemap lista as duas páginas, cada uma com os `xhtml:link` de idioma
  favicon.svg            # ícone da aba (troca de cor no tema escuro), referenciado pelas duas páginas
  apple-touch-icon.png   # ícone de tela inicial (180 x 180, o logo em branco sobre o azul da marca); só o index o cita
  social-pt.png          # og:image do index (1280 x 640); igual, byte a byte, à social preview do GitHub em docs/images/
  social-en.png          # og:image de en/index.html; igual, byte a byte, a docs/images/dmarc-facil-dmarc-spf-dkim-checker-social-preview-en.png (gerado do HTML ao lado pelo Chrome)
  css/pagina.css         # a folha das duas páginas (tokens claros e escuros, cartões, escada); fontes em fonts/ (OFL ao lado)
  js/                    # módulos ES carregados direto pelo navegador
    dominio.js           # valida e normaliza o domínio digitado (módulo puro: sem DOM, sem rede)
    nome-dns.js          # valida o nome DNS montado pela ferramenta antes de virar URL (puro)
    resposta-doh.js      # lê o JSON do resolvedor: situação e textos TXT, igual nos dois (puro)
    doh.js               # consultarTxt: fetch com tempo limite, privacidade e fallback Cloudflare → Google
    dmarc.js             # lerDmarc: escolhe o registro entre os TXT, lê as tags e aponta os achados (puro)
    spf.js               # lerSpf: escolhe o registro SPF, valida cada termo e aponta os achados (puro)
    spf-consultas.js     # lerSpfComConsultas: segue include/redirect e conta as consultas (consulta injetada, sem fetch)
    seletor-dkim.js      # normalizarSeletor, juntarSeletores: valida o seletor digitado e monta a lista (puro)
    seletores-dkim.js    # dados: seletores comuns com a documentação do provedor, e orientações
    chave-rsa.js         # lerChaveRsa: mede o módulo da chave pública RSA do p= (leitor ASN.1 mínimo, puro)
    dkim.js              # lerDkim: escolhe o registro de um seletor, lê as tags e aponta os achados (puro)
    dkim-busca.js        # buscarDkim: tenta os seletores com concorrência limitada (consulta injetada, sem fetch)
    tipos.js             # só typedef: a recusa (motivo em código + valor), o estado de cada parte (verificando, pronto, falha) e da verificação
    selo.js              # calcularSelo: a regra única do selo dos três cartões (puro)
    escada.js            # montarEscada: degraus none/quarantine/reject, próximo passo e ressalvas (puro)
    textos/              # o catálogo de textos: dado puro por idioma, mais o código que escolhe a frase
      en/                # o inglês: as mesmas chaves do `pt/` (o tipo `Textos` e `test/paridade-textos.test.js` conferem); chaves em português, valores em inglês
      pt/                # o português, a referência: index.js (`textos = { achados, interface, motivos }`), achados.js (um texto por código de achado, mais o `generico`), interface.js (selos, degraus, anúncios e demais frases montadas por script), motivos.js (a frase de cada código de recusa e falha)
      resolver.js        # textoDoAchado(textos, achado) e textoDoMotivo(textos, recusa): o código vira frase, com a guarda de código sem entrada
      tipos.js           # só typedef: `Textos` (o tipo do catálogo vem do português) e a forma de cada texto
    preencher.js         # preencher: troca {nome} pelo valor nos textos do catálogo (puro)
    apresentacao.js      # cartões de DMARC, SPF e DKIM prontos para desenhar, seletores digitados, anúncios (puro)
    endereco.js          # ?dominio= do endereço compartilhável e `montarEnderecoIdioma` (a base do link de idioma mais o texto do campo, codificado; puro: preenche o campo, não verifica)
    verificador.js       # criarVerificador: as três partes em paralelo, descarta a verificação anterior (consulta injetada)
    dom.js               # criar, urlHttps: o único jeito de um texto virar nó (lista fixa de tags e atributos)
    pagina.js            # o único módulo com document/history: `iniciarPagina(textos)` liga o formulário e desenha o resultado, e `ligarLinksDeIdioma` faz os links PT/EN levarem o texto do campo; não faz nada ao ser importado
    entrada-pt.js, entrada-en.js # a entrada de cada HTML: chama iniciarPagina com o catálogo do idioma (três linhas; um idioma, uma entrada)
test/                    # testes com o runner nativo do Node (node:test); ajudas/ monta chaves, estados, o catálogo (textos.js), a linha de base dos textos e um documento falso
scripts/                 # scripts em Node (conferir-links-dkim.mjs: links dos provedores; conferir-hospedagem.mjs: o que está no ar)
docs/                    # documentação do projeto
  stack.md               # mapa de cada tecnologia: o que faz, por que, o que estudar
  images/                # logo oficial (SVG), as capturas usadas nos README e as fontes das imagens sociais (HTML e PNG)
specs/                   # specs de cada marco (requirements, design, tasks)
.githooks/pre-commit     # portão de qualidade local, o mesmo do CI
.claude/                 # hooks do Claude Code (scripts em hooks/, ligados por settings.json)
.github/                 # workflows (ci, codeql, dependency-review, links-dkim, lighthouse, deploy), Dependabot, templates; lighthouse/ tem os limites (producao-*.json medem o endereço real)
```

Camadas: a lógica de parsing (DMARC, SPF, DKIM) e de validação mora em módulos puros de `public/js/`, sem DOM nem rede, para rodar igual no navegador e nos testes. O que toca o DOM e a rede fica em módulos separados, finos. **Módulo puro não carrega frase:** os módulos devolvem códigos e dados, e a frase mora no catálogo de `textos/<idioma>/`, que `selo.js`, `escada.js` e `apresentacao.js` recebem como primeiro parâmetro (`textos`); só a entrada do idioma importa o catálogo (`test/textos-injecao.test.js`). Detalhe da stack em [docs/stack.md](docs/stack.md); o porquê de cada decisão, nas specs de [specs/](specs/).

> ⚠️ **Não regredir: conteúdo de registro TXT é dado de terceiros.** Todo texto vindo de DNS entra na página só com `textContent`, nunca `innerHTML`. Um registro TXT pode conter `<script>`. Duas camadas: a regra de lint de `public/**` (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`; `test/lint-dom.test.js`) e `criar` de `dom.js`, que recusa tag, atributo e `href` fora da lista (`test/dom.test.js`).

> ⚠️ **Não regredir: o domínio vai dentro de uma URL.** Tudo o que o visitante digita passa por `normalizarDominio` antes de virar consulta DoH. Nenhum módulo monta URL de consulta com texto cru.

> ⚠️ **Não regredir: o endereço público tem uma fonte só, a rota do `wrangler.json`.** `canonical`, `og:url`, `og:image`, `robots.txt`, `sitemap.xml`, os limites `producao-*.json` e a conferência derivam dele; os testes (`descoberta`, `lighthouse-producao`) falham se divergirem. A CSP de `public/_headers` é a da `<meta>` do `index.html` mais `frame-ancestors 'none'` (`test/cabecalhos.test.js`).

> ⚠️ **Não regredir: o idioma é o endereço.** A página em cada idioma é um endereço (`/` e `/en/`); nunca se escolhe o idioma por `navigator.language`, cookie ou armazenamento do navegador (a regra de lint de `public/**` proíbe, `test/lint-dom.test.js`). O seletor PT/EN são links reais, e o `pagina.js` só acrescenta o `?dominio=` neles, com base fixa e `URLSearchParams` (`test/idiomas-links.test.js`). Texto novo no catálogo começa pelo `pt/`; o `en/` tem de ter as mesmas chaves, marcadores `{nome}` e trechos entre crases.

> ⚠️ **Não regredir: sem log e sem rastreador.** Nenhum log de domínios consultados, nenhum script de terceiro na página. Só a estatística agregada da hospedagem. A página diz ao visitante que o resolvedor DoH (Cloudflare, ou Google no fallback) vê o domínio e o IP.

## Convenções

- **Idioma do código, comentários, commits e specs: português** (projeto público e educativo). Strings visíveis, no idioma da página (`textos/pt/` e `textos/en/`; o português é a referência: texto novo começa por ele). Nomes técnicos universais (`DoH`, `TXT`, `DKIM`) ficam como são.
- **Estilo dos arquivos:** siga o do restante do repositório: cabeçalho `@file` e JSDoc completo nas funções exportadas, `// @ts-check`, comentários que explicam o porquê, formatação pelo Prettier (`pnpm format`).
- **Marca:** logo A (escudo com olho aberto), da família MailVigil/WebVigil: azul `#2563eb`, `Sora` 800 no nome, `JetBrains Mono` no código. SVG oficial em `docs/images/`, um `<path>` só com `evenodd`; o teste `test/logo.test.js` o guarda. Fontes locais na página final, nunca CDN.
- **Interface:** decidida (interface C: escada `none` → `quarantine` → `reject` com a etiqueta "Próximo passo" no degrau seguinte ao atual; o cartão de DMARC fica só com registro e selo). A spec da página traz o mockup aprovado. Mudança de interface parte de um mockup, não do código.
- **DKIM:** nunca dizer "você não tem DKIM"; dizer "não encontrei nesses seletores" (o seletor é escolha do remetente e não dá para listar). 15 a 20 seletores comuns em arquivo de dados, com link da doc de cada provedor, mais campo livre.

## Qualidade e automação

- **CI** (`.github/workflows/ci.yml`): job `qualidade` (Prettier, ESLint, `tsc`, testes) e job `seguranca` (`pnpm audit`). Mais CodeQL e `dependency-review`. Toda `uses:` fixada por SHA, `runs-on: ubuntu-26.04`, todo `actions/checkout` com `persist-credentials: false`.
- **Links DKIM** (`.github/workflows/links-dkim.yml`, `pnpm links:dkim`): toda segunda abre cada `documentacao` de `public/js/seletores-dkim.js`; run vermelho = link quebrado (404/410/rede) ou página que não cita mais o seletor; 403 e site fora do ar são só aviso. Não é check obrigatório. Ao mexer na lista, atualize o `conferido` do item.
- **Lighthouse CI** (`.github/workflows/lighthouse.yml`, limites em `.github/lighthouse/{mobile,desktop}.json`): mede as quatro páginas (`index.html`, `404.html` e as duas de `en/`) sobre `public/`; acessibilidade = 1 e as outras notas ≥ 0,95, peso abaixo de 150 KB. Não é check obrigatório. O `@lhci/cli` entra por `npx` numa variável do workflow, nunca como dependência (a árvore dele derruba o `pnpm audit`).
- **Deploy** (`.github/workflows/deploy.yml`, spec 007): roda depois do `CI` verde na `main` (`workflow_run`, só `push` do próprio repositório) e por `workflow_dispatch`; ambiente `producao` com os segredos da Cloudflare; publica com `npx wrangler@<WRANGLER_VERSION>` (não é dependência: a árvore derrubaria o `pnpm audit`), confere o que ficou no ar (`scripts/conferir-hospedagem.mjs`: cabeçalhos, 404, HTML byte a byte, `/en/`, `/en` e a 404 sob `/en/`) e mede o endereço real com o Lighthouse (`producao-{mobile,desktop}.json`). As versões do `wrangler` e do `@lhci/cli` são revistas à mão todo mês (o Dependabot não vê `npx`). Para desfazer um deploy ruim, reverta o commit na `main` (o `wrangler rollback`, com credencial da conta, é só o caminho de emergência).
- **Ruleset `proteger-main`:** PR obrigatório, só squash, histórico linear, `qualidade` e `seguranca` exigidos. Nada de commit direto na `main`.
- **Pre-commit** (`.githooks/pre-commit`): o mesmo portão do CI em modo verificação.
- **Hooks do Claude** em `.claude/` (scripts `.mjs` em `.claude/hooks/`, ligados por `.claude/settings.json`): `proteger-gerados` (PreToolUse, bloqueia edição manual do `pnpm-lock.yaml`), `formatar` (PostToolUse, Prettier no arquivo editado) e `validar` (Stop, ESLint + `tsc` se há `.js`/`.mjs` alterado; testes ficam no pre-commit); `ferramentas.mjs` guarda os utilitários que os três usam.

## Fluxo de trabalho

Desenvolvimento guiado por specs: requirements, design e tasks, cada um aprovado antes do seguinte, numa pasta `specs/NNN-nome/` por marco. Convenções de numeração e status em [specs/README.md](specs/README.md). Uma issue, uma branch, um PR; o PR é mesclado pelo mantenedor depois da revisão. Antes de abrir o PR, rode o portão de qualidade e confira se o README (nas duas línguas), este arquivo e `docs/stack.md` refletem a mudança.

## Gestão de dependências

pnpm 12 (campo `packageManager` do `package.json`); `package.json` e `pnpm-lock.yaml` sempre juntos no commit. **Não há dependência de runtime**: o que vai ao navegador é código nosso, sem biblioteca. Só ferramentas de desenvolvimento (ESLint, Prettier, TypeScript como verificador de JSDoc, `@types/node`).

> Cuidado: `pnpm-workspace.yaml` guarda a configuração do pnpm 12 (o campo `pnpm` do `package.json` é ignorado): `minimumReleaseAge` de uma semana e as exceções aceitas do `pnpm audit`, cada uma com o motivo e a condição de saída comentados ali.

> Cuidado: o Dependabot agrupa minor e patch num PR por ecossistema, com cooldown de 7 dias. Revise cada PR pelo diff e pelo changelog do pacote.
