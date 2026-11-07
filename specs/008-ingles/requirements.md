---
feature: Inglês — o DMARC Fácil inteiro em /en/, com o mesmo código e os textos por idioma
status: aprovado
date: 2026-11-07
related: [006-pagina, 007-hospedagem]
origin: conception
---

# 008 — Inglês

## Contexto e problema

O DMARC Fácil só existe em português. O DMARC, o SPF e o DKIM não são problema brasileiro: quem administra o e-mail de um domínio em qualquer país precisa da mesma explicação e do mesmo próximo passo (de `p=none` para `quarantine` e `reject`). Quem chega de uma página em inglês (o MailVigil, os posts, as listas de ferramentas) cai numa página que não lê.

Hoje o português está espalhado em três lugares:

- **HTML estático** de `index.html` e `404.html`: título, descrição, `og:*`, cabeçalho, formulário, texto de apoio, rodapé e `<noscript>`.
- **Catálogos de dados** de `public/js/`: `textos-achados.js` (um texto por código de achado), `textos-interface.js` (selos, degraus da escada, falhas, anúncios do `aria-live`, motivos do seletor) e as orientações de `seletores-dkim.js`.
- **Frases dentro da lógica**: o campo `motivo` de `dominio.js`, `nome-dns.js`, `doh.js`, `resposta-doh.js` e `dkim-busca.js` carrega uma frase pronta em português (uns 18 textos), porque nasceu quando só havia um idioma. Os parsers de DMARC, SPF e DKIM já são o modelo certo: devolvem códigos estáveis, e a frase fica no catálogo.

Decisões já tomadas (o mantenedor, 2026-11-07), que esta spec registra e não reabre:

- O inglês mora em `/en/` (`/en/index.html` e `/en/404.html`); o português continua na raiz, e o `x-default` do `hreflang` aponta para o português.
- O nome "DMARC Fácil" fica igual no inglês: é marca.
- O seletor de idioma (PT e EN) fica no cabeçalho e no rodapé e leva o `?dominio=` junto, só preenchendo o campo, como a spec 006 já faz (ADR-8).
- O convite do MailVigil, no rodapé e no cartão do resultado, continua apontando para o repositório, nos dois idiomas.
- Os textos em inglês e o texto de apoio em português são provisórios: o mantenedor os revisa antes do merge.

Quatro regras do projeto pesam aqui (`CLAUDE.md`):

- **Conteúdo de TXT é dado de terceiros.** Texto de DNS entra na página só com `textContent`. O inglês não muda isso: catálogo novo é dado, nunca HTML.
- **Sem log e sem rastreador.** Nada de cookie, `localStorage` ou detecção por `navigator.language` para lembrar ou adivinhar o idioma. O idioma é o endereço.
- **Sem build e sem dependência de runtime.** Nada de biblioteca de i18n, gerador de páginas ou passo de compilação.
- **O endereço público tem uma fonte só** (a rota do `wrangler.json`): `canonical`, `hreflang`, `og:url`, `og:image`, `robots.txt` e `sitemap.xml` das duas línguas derivam dele.

## Objetivos

- **Duas páginas equivalentes**, em `/` (português) e `/en/` (inglês), com a mesma verificação, a mesma escada e os mesmos cartões.
- **A lógica não fala idioma nenhum.** Os módulos puros devolvem códigos e dados; a frase vive em catálogo por idioma.
- **Troca de idioma sem perder o domínio digitado**, e sem o navegador do visitante mandar nada a ninguém por causa disso.
- **Descoberta nos dois idiomas**: cada página com o seu `canonical`, o seu `og:*` e o seu `hreflang`, e o português como padrão.
- **Paridade garantida por teste**: uma chave que existe em um idioma e falta no outro quebra o CI.
- **O que já vale no português continua valendo no inglês**: a acessibilidade, os pesos do Lighthouse, a CSP, os cabeçalhos e o que "não afirma o que não sabe" (nada de "você não tem DKIM", nada de "protegido").

## Não-objetivos

- **Terceiro idioma** (espanhol, etc.) ou tradução do código, das specs, do `CLAUDE.md` e dos commits. O README já é bilíngue.
- **Detecção automática de idioma**: nada de redirecionar por `Accept-Language`, por `navigator.language` ou por país; nada de lembrar a escolha em cookie ou armazenamento do navegador.
- **Biblioteca de i18n**, formato de mensagem com plural e gênero, ou passo de build que gere as páginas. As duas páginas HTML são arquivos escritos e versionados.
- **Traduzir a documentação dos provedores de DKIM** (os links apontam para a doc oficial de cada um, no idioma que ela tiver) ou o site do MailVigil.
- **Mudar o que a ferramenta verifica** ou a regra de qualquer achado: é a mesma lógica, com outro texto.
- **Domínio ou subdomínio por idioma.**
- **Tradução do cartão de compartilhamento além do `social-en.png`** e das tags `og:*` em inglês.

## Personas

- Como **administrador de e-mail que lê inglês**, quero abrir `/en/`, digitar meu domínio e receber a explicação de cada registro e o próximo passo, no meu idioma.
- Como **visitante que chegou por um link em português** e lê inglês, quero trocar de idioma com um clique e encontrar o domínio que já digitei no campo.
- Como **leitor de uma lista de ferramentas ou de um post em inglês**, quero que o link leve direto à versão em inglês, e que o compartilhamento mostre título, descrição e imagem em inglês.
- Como **leitor de tela**, quero que cada página declare o idioma certo e que o seletor de idioma diga em que idioma cada opção está.
- Como **mantenedor**, quero que um texto novo em português sem o par em inglês não passe no CI, e que traduzir seja editar um catálogo, sem tocar na lógica.
- Como **dev que lê o repositório**, quero ver onde mora cada frase e por que a lógica não tem texto.

## Requisitos funcionais

### RF-01 — A página em inglês

- **Given** o deploy feito
  **When** o visitante abre `https://dmarc-facil.ryanmorais.com.br/en/`
  **Then** recebe `public/en/index.html`, com `lang="en"`, `<title>` e `description` em inglês, e o formulário, a escada, os três cartões, o texto de apoio e o rodapé todos em inglês.
- **Given** um caminho que não existe sob `/en/`
  **When** o visitante o abre
  **Then** recebe a `public/en/404.html` (em inglês, com o link de volta para `/en/`) com status 404, e não a 404 em português.
- **Given** um caminho que não existe fora de `/en/`
  **When** o visitante o abre
  **Then** continua recebendo a 404 em português, como na spec 007.
- **Given** o `index.html` e o `en/index.html`
  **When** são comparados
  **Then** têm a mesma estrutura (os mesmos ids, as mesmas regiões, a mesma ordem), as mesmas folhas e os mesmos módulos; muda o texto, o `lang` e os endereços de idioma.
- **Given** as duas páginas em inglês e em português
  **When** o nome do produto aparece
  **Then** é "DMARC Fácil", sem tradução.

### RF-02 — O resultado em inglês

- **Given** a página em inglês
  **When** a verificação termina
  **Then** os selos, os degraus da escada, as etiquetas ("you are here", "Next step"), os títulos, explicações e ações dos achados, as orientações de DKIM, as mensagens de falha e as frases do `aria-live` saem em inglês, todos do catálogo em inglês.
- **Given** o mesmo domínio verificado nas duas páginas, com a mesma resposta de DNS
  **When** os resultados são comparados
  **Then** têm os mesmos selos, os mesmos degraus, os mesmos códigos de achado e os mesmos seletores; só os textos mudam.
- **Given** um registro com texto de terceiros (marcação, `<script>`)
  **When** a página em inglês o mostra
  **Then** o trata como texto puro, igual à página em português.
- **Given** os textos em inglês
  **When** o resultado é DKIM sem registro nos seletores tentados
  **Then** dizem o equivalente de "não encontrei nesses seletores" (o seletor é escolha do remetente), nunca "you don't have DKIM".
- **Given** os termos técnicos universais (`DMARC`, `SPF`, `DKIM`, `TXT`, `DoH`, `p=none`)
  **When** aparecem em qualquer idioma
  **Then** ficam como são.

### RF-03 — Recusas e falhas sem frase na lógica

- **Given** os módulos puros e de consulta (`dominio.js`, `nome-dns.js`, `doh.js`, `resposta-doh.js`, `dkim-busca.js`, `seletor-dkim.js`, `spf-consultas.js`, `verificador.js`)
  **When** recusam uma entrada ou uma consulta falha
  **Then** devolvem um **código estável** (e, quando o texto precisa de um número ou nome, o dado), nunca uma frase em idioma nenhum.
- **Given** um código de recusa ou de falha
  **When** a página o mostra
  **Then** o texto vem do catálogo do idioma da página, com o dado encaixado.
- **Given** a refatoração
  **When** a página em português roda
  **Then** mostra exatamente as mesmas frases de antes: a mudança não é visível (a parte do plano que a faz é separada e entra antes da tradução).
- **Given** o teste de cobertura de códigos
  **When** o CI roda
  **Then** falha se um código de recusa ou de falha emitido não tem entrada no catálogo, ou se há entrada sem código que a emita.

### RF-04 — Catálogos por idioma e paridade

- **Given** os catálogos de texto (achados, interface, orientações de DKIM, recusas e falhas)
  **When** o CI roda
  **Then** um teste de paridade falha se o conjunto de chaves, os campos de cada entrada ou os marcadores de código (trechos entre crases, valores encaixados) diferem entre o português e o inglês.
- **Given** o catálogo de um idioma
  **When** o navegador carrega a página daquele idioma
  **Then** baixa só o catálogo daquele idioma (o peso da página em inglês não carrega o português, e vice-versa).
- **Given** uma entrada com o marcador de código (crases) ou com valor encaixado
  **When** é traduzida
  **Then** o trecho de código e o valor ficam intactos (o teste de paridade confere).

### RF-05 — O seletor de idioma

- **Given** qualquer uma das duas páginas
  **When** o visitante a abre
  **Then** o cabeçalho e o rodapé trazem as duas opções de idioma (PT e EN), a do idioma atual marcada como página atual (`aria-current="page"`) e a outra como link para a página equivalente.
- **Given** um link de idioma
  **When** é lido por um leitor de tela
  **Then** o nome da opção diz o idioma por extenso e está no próprio idioma ("Português", "English"), com `lang` e `hreflang` no link.
- **Given** um domínio digitado ou já verificado, e a página em português
  **When** o visitante troca para o inglês
  **Then** chega a `/en/?dominio=<domínio normalizado ou o texto como está no campo>` com o campo preenchido e **nada consultado**; quem decide verificar é o visitante (ADR-8 da spec 006). O mesmo vale no sentido contrário.
- **Given** nenhum domínio no campo
  **When** o visitante troca de idioma
  **Then** o link vai à página equivalente sem parâmetro.
- **Given** o parâmetro `?dominio=` de um link montado por qualquer pessoa
  **When** o link de idioma é montado com ele
  **Then** é tratado como entrada hostil: codificado, cortado no limite do `endereco.js` e nunca interpretado como marcação.
- **Given** a página 404 de cada idioma
  **When** é aberta
  **Then** o link de volta leva ao início do mesmo idioma.

### RF-06 — Descoberta nos dois idiomas

- **Given** `index.html` e `en/index.html`
  **When** o `<head>` é lido
  **Then** cada um tem o seu `canonical` (a própria página, sem `?dominio=`), `og:url`, `og:locale` (`pt_BR` e `en_US`), `og:title`, `og:description`, `description` e `og:image` no idioma, e os dois trazem os três `<link rel="alternate" hreflang>`: `pt-BR` para `/`, `en` para `/en/` e `x-default` para `/`.
- **Given** a imagem de compartilhamento em inglês
  **When** o `og:image` do inglês é lido
  **Then** aponta para `social-en.png` (1280 × 640, o mesmo desenho com o texto em inglês), e o `social-pt.png` continua só no português.
- **Given** `sitemap.xml` e `robots.txt`
  **When** são lidos
  **Then** listam as duas páginas (e só elas), com os `hreflang` de uma para a outra, e citam o endereço da rota do `wrangler.json`.
- **Given** a `404.html` de cada idioma
  **When** o `<head>` é lido
  **Then** não tem `canonical`, `og:*` nem `hreflang`: não se indexa nem se compartilha, como hoje.

### RF-07 — O idioma é o endereço

- **Given** qualquer visita
  **When** a página carrega
  **Then** o idioma é o da página aberta: nenhum script lê `navigator.language`, nenhum redirecionamento é feito por idioma, e nada é gravado em cookie, `localStorage`, `sessionStorage` ou `IndexedDB`.
- **Given** a CSP e os cabeçalhos
  **When** as páginas em inglês são servidas
  **Then** valem os mesmos de hoje (`default-src 'none'`, os dois resolvedores no `connect-src`, `frame-ancestors 'none'`); a página em inglês não abre nenhuma origem nova.

### RF-08 — Hospedagem e conferência do que está no ar

- **Given** a pasta `public/en/`
  **When** o deploy publica `public/`
  **Then** `/en/` e `/en` (sem a barra) servem a página em inglês, os módulos e as folhas são os mesmos da raiz (um arquivo, uma cópia: nada duplicado em `public/en/`), e o cache e os cabeçalhos da spec 007 valem para os dois.
- **Given** a conferência pós-deploy (`scripts/conferir-hospedagem.mjs`)
  **When** roda
  **Then** confere também `/en/` (HTML byte a byte contra `public/en/index.html`, cabeçalhos) e a 404 sob `/en/`, e o Lighthouse mede as páginas em inglês com os mesmos limites.

## Requisitos não-funcionais

### RNF-01 — Qualidade

o portão (`format:check`, `lint`, `typecheck`, `test`) fica verde, e os testes novos cobrem a paridade, a cobertura de códigos, a estrutura idêntica das duas páginas e os atributos de idioma e `hreflang`.

### RNF-02 — Segurança

nenhum catálogo vira HTML; a regra de lint de `public/**` (`innerHTML` e afins) e o `criar` de `dom.js` continuam sem exceção; nenhuma origem nova na CSP.

### RNF-03 — Desempenho

cada página mede acessibilidade 1 e as outras notas ≥ 0,95, com peso abaixo de 150 KB, como hoje. A página em inglês não baixa o catálogo do português, e o idioma não vira um passo de rede a mais antes de a página funcionar.

### RNF-04 — Acessibilidade

`lang` correto no `<html>` de cada página; o seletor de idioma operável por teclado, com alvo de toque do tamanho dos outros links, e conferido com o NVDA em inglês e em português.

### RNF-05 — Sem dependência nova

zero pacote de runtime e zero ferramenta de build; o que vai ao navegador continua sendo código nosso.

### RNF-06 — Qualidade do texto

o inglês é natural e curto, direto como o português, e revisado pelo mantenedor antes do merge; textos ainda sem revisão levam o marcador `[provisório]` na spec e nunca vão ao ar assim.

### RNF-07 — Manutenção

um texto novo exige a entrada nos dois idiomas no mesmo PR (o teste de paridade impõe).

### RNF-08 — Uma fonte

o endereço público de cada página deriva da rota do `wrangler.json`; os testes de descoberta e de Lighthouse de produção falham se divergirem, também para `/en/`.

### RNF-09 — Privacidade

a frase de privacidade (quem vê o domínio e o IP) existe em inglês com o mesmo conteúdo da portuguesa, junto do botão, nos dois idiomas.

## Perguntas em aberto

Nenhuma.

## Perguntas resolvidas

1. **O seletor de idioma no cabeçalho está no mockup aprovado?** Sim: o mockup aprovado traz o seletor "PT EN" no cabeçalho e no rodapé de duas pontas. Não é preciso mockup novo (design, seção Interface).
2. **Chave de idioma faltando em produção:** o teste de paridade e o tipo do catálogo impedem; o que sobra é a frase genérica de falha no idioma da página, nunca o código cru (design, ADR-11).
3. **`social-en.png`:** o PNG português é gerado pelo Chrome a partir do HTML ao lado dele; o inglês segue o mesmo método, com teste igual (design, ADR-8).

## Testes

1. **A lógica tem teste unitário** com o catálogo de cada idioma, sobre as mesmas entradas, e o teste compara o resultado estrutural (selo, degrau, códigos de achado, seletores) entre os idiomas (RF-02).
2. **Cada código de recusa e de falha tem um teste** que o provoca e confere o código e o `valor`; um teste de cobertura varre o código-fonte pelos códigos emitidos (RF-03).
3. **A paridade dos catálogos é testada**: chaves, marcadores `{nome}`, trechos entre crases e textos não vazios (RF-04, RNF-07).
4. **Entrada hostil é testada, não presumida:** o `?dominio=` com marcação ou `javascript:` no link de idioma e um registro TXT com `<script>` na página em inglês (RF-02, RF-05).
5. **As páginas são testadas**: esqueleto idêntico, `lang`, `hreflang` recíproco, `canonical`, sitemap, CSP igual, sem armazenamento nem detecção de idioma (RF-01, RF-06, RF-07).
6. **Registro DNS em teste é sempre sintético**, montado no próprio teste (RNF-01).
7. **O portão de qualidade é a última tarefa de cada etapa**, com o resultado real registrado.
