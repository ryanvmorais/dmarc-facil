---
feature: Hospedagem — a pasta public/ no ar em dmarcfacil.ryanmorais.com.br, com cabeçalhos de segurança e a 404 certa
status: concluído
date: 2026-10-31
related: [001-fundacao, 006-pagina]
origin: conception
---

# 007 — Hospedagem

## Contexto e problema

A spec 006 entrega `public/` pronto: duas páginas estáticas, sem build, que funcionam em qualquer hospedagem (`index.html`, `404.html`, CSS, módulos ES e fontes). Falta pô-las no ar. O endereço decidido é `dmarcfacil.ryanmorais.com.br` (subdomínio, grátis), e a zona `ryanmorais.com.br` já está na Cloudflare (conferido pelos servidores de nome em 2026-10-31).

A doc oficial da Cloudflare foi lida em 2026-10-31: a página do Pages diz "Start new projects with Workers" (sem aviso de descontinuação), e o **Workers Static Assets** serve arquivos estáticos sem código, com requisição a asset grátis e ilimitada, `_headers` e `_redirects` na pasta de assets, e `assets.not_found_handling = "404-page"` para servir a `404.html` mais próxima com status 404. A configuração mínima não tem `main`: `name`, `compatibility_date` e `assets.directory`.

O que a spec 006 deixou para esta: a CSP da página vai por `<meta>`, que **não** cobre `frame-ancestors`, nem os cabeçalhos `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`; a 404 depende de como a hospedagem a serve; e o deploy hoje não existe, então nada garante que o que está na `main` é o que está no ar.

Três regras do projeto pesam aqui (`CLAUDE.md`):

- **Sem log e sem rastreador.** Só a estatística agregada da hospedagem. Nenhum recurso da hospedagem pode injetar script na página (a Web Analytics da Cloudflare injeta um _beacon_ e, se ligada, quebra a regra e a CSP).
- **Publicar é ato do mantenedor.** A configuração e o workflow ficam no repositório e o passo a passo, fora dele; criar o projeto na Cloudflare, conectar o domínio, criar o token e o primeiro deploy são do mantenedor.
- **Sem dependência de runtime.** O que vai ao navegador continua sendo código nosso. A ferramenta de deploy é só de desenvolvimento e não pode derrubar o `pnpm audit` obrigatório (o mesmo cuidado do `@lhci/cli`).

## Objetivos

- **Site no ar** em `dmarcfacil.ryanmorais.com.br`, em HTTPS, servindo o conteúdo de `public/` exatamente como está na `main`.
- **Cabeçalhos de segurança** do servidor, que a `<meta>` não consegue dar, sem enfraquecer a CSP que já existe.
- **404 com status 404**, servindo a `404.html`, inclusive em caminho aninhado.
- **Um endereço só**: o `*.workers.dev` e qualquer pré-visualização pública desligados ou fora do ar.
- **Deploy repetível e auditável**: o que está no ar é o commit da `main`, sem passo manual escondido.
- **Cache coerente** com arquivos sem _hash_ no nome: o visitante nunca fica com módulos de versões diferentes misturados.
- **Medição do que está no ar**: o Lighthouse e a conferência de cabeçalhos rodam contra o endereço real depois do deploy.

## Não-objetivos

- **Imagem de pré-visualização social** e `og:image`: só com a página real, em spec própria, quando for decidida.
- **Estatística própria**, Web Analytics da Cloudflare, ou qualquer rastreador.
- **Função, API ou código de servidor** (`main` no `wrangler`): o site é só arquivo.
- **E-mail do domínio**, outros subdomínios, redirecionamento do domínio raiz e qualquer outra coisa de `ryanmorais.com.br`.
- **Domínio próprio novo** ou compra de domínio.
- **Pré-visualização por PR** com endereço público.
- **Mudar o conteúdo de `public/`** além do que a hospedagem e a descoberta exigem (`<link rel="canonical">`, `robots.txt`, `sitemap.xml`, `_headers`).

## Personas

- Como **visitante**, quero abrir `https://dmarcfacil.ryanmorais.com.br`, ver a página carregar rápido e confiar que nada além dos dois resolvedores DoH recebe o domínio que digitei.
- Como **visitante que errou o endereço**, quero ver a 404 do site com o link de volta, e não a página de erro da hospedagem.
- Como **autor e mantenedor**, quero que o merge na `main` publique sozinho, que eu consiga desfazer um deploy ruim em minutos, e que um segredo vazado tenha o menor alcance possível.
- Como **dev que lê o repositório**, quero ver em um lugar só quais cabeçalhos o site manda e por quê.

## Requisitos funcionais

### RF-01 — O site no endereço decidido

- **Given** o deploy feito
  **When** o visitante abre `https://dmarcfacil.ryanmorais.com.br/`
  **Then** recebe o `index.html` de `public/`, com HTTPS válido e status 200.
- **Given** uma requisição `http://`
  **When** chega ao domínio
  **Then** é redirecionada para `https://` ou recusada, nunca servida em texto claro.
- **Given** o endereço `*.workers.dev` do projeto (ou equivalente da plataforma)
  **When** alguém o abre
  **Then** não serve o site: o `dmarcfacil.ryanmorais.com.br` é o único endereço.
- **Given** a configuração do projeto de hospedagem
  **When** é lida
  **Then** aponta para `./public` e não envia nada fora dela (`node_modules`, `specs/`, `.git`).

### RF-02 — Cabeçalhos de segurança

- **Given** qualquer resposta do site
  **When** o cabeçalho é examinado
  **Then** traz `X-Content-Type-Options: nosniff`, `Referrer-Policy` restritiva (`no-referrer` ou `strict-origin-when-cross-origin`, decidida no design) e `Permissions-Policy` desligando os recursos que a página não usa.
- **Given** as páginas HTML
  **When** o cabeçalho é examinado
  **Then** traz `Content-Security-Policy` com `frame-ancestors 'none'` além das diretivas da `<meta>`, e o `connect-src` lista exatamente os mesmos hosts de `public/js/doh.js`.
- **Given** a CSP do cabeçalho e a da `<meta>`
  **When** o teste as compara
  **Then** o cabeçalho repete as diretivas da `<meta>` do `index.html` e acrescenta `frame-ancestors 'none'`; a `<meta>` da `404.html` pode ser mais estrita (não tem script), nunca mais frouxa que o cabeçalho; e nenhuma das políticas tem `unsafe-inline` ou `unsafe-eval`.
- **Given** o domínio com HTTPS
  **When** a resposta chega
  **Then** traz `Strict-Transport-Security`, com o prazo e a decisão sobre `includeSubDomains` e `preload` registrados no design (afeta `ryanmorais.com.br` inteiro se for no domínio raiz; aqui só vale para o subdomínio).
- **Given** o arquivo de cabeçalhos
  **When** a hospedagem o aplica
  **Then** os cabeçalhos valem também para os arquivos de `css/`, `js/` e `fonts/`, e para a 404.

### RF-03 — Página 404

- **Given** um endereço que não existe (`/nada`, `/a/b/c.js`)
  **When** é aberto
  **Then** a resposta tem **status 404** e o corpo é o `404.html`, com CSS, logo e link de volta funcionando (caminhos absolutos).
- **Given** um arquivo que existe
  **When** é aberto
  **Then** não vira 404 nem redireciona para a página inicial (nada de _fallback_ de SPA).
- **Given** um erro 5xx da plataforma
  **When** acontece
  **Then** a página de erro é a da plataforma, sem personalização (decisão da spec 006).

### RF-04 — Cache

- **Given** os arquivos de `css/`, `js/` e a página inicial, cujos nomes não mudam entre versões
  **When** o cabeçalho de cache é definido
  **Then** o navegador revalida antes de reusar (por exemplo `Cache-Control: no-cache` com validador), de modo que um deploy novo chega a todos sem deixar módulos antigos e novos misturados.
- **Given** as fontes em `fonts/`, que não mudam
  **When** o cabeçalho de cache é definido
  **Then** podem ser guardadas por longo prazo, e o nome do arquivo muda se o arquivo mudar.
- **Given** o desempenho medido
  **When** o Lighthouse roda contra o endereço real
  **Then** a página continua abaixo de 150 KB transferidos e com as notas da spec 006.

### RF-05 — Deploy

- **Given** um merge na `main`
  **When** o CI de qualidade termina verde
  **Then** o deploy publica o commit exato da `main`, e o log do deploy registra o commit.
- **Given** um PR aberto ou a branch de um fork
  **When** o CI roda
  **Then** nenhum deploy de produção acontece e o segredo de deploy nunca é entregue ao código do PR.
- **Given** o segredo de deploy (token da Cloudflare)
  **When** é criado
  **Then** tem o menor escopo possível (só o deploy desse projeto, na conta do mantenedor), vive só como segredo de ambiente do GitHub, e nunca aparece em log, no repositório ou em `.claude/`.
- **Given** um deploy com falha ou um site quebrado no ar
  **When** o mantenedor precisa desfazer
  **Then** existe um caminho documentado para voltar à versão anterior em minutos (reverter o commit e redeployar, ou _rollback_ da plataforma), testado uma vez antes do lançamento.
- **Given** as ações do workflow de deploy
  **When** o workflow é lido
  **Then** cada `uses:` está fixada por SHA, o job roda em `ubuntu-26.04`, e a ferramenta de deploy não entra como dependência do `package.json` se isso derrubar o `pnpm audit`.

### RF-06 — Sem rastreador injetado

- **Given** o site no ar
  **When** o HTML servido é comparado ao de `public/index.html`
  **Then** é idêntico byte a byte: a hospedagem não injetou script, _beacon_ nem reescreveu nada (inclusive nenhuma minificação ou "otimização" automática da Cloudflare que altere o HTML ou o JavaScript).
- **Given** a configuração da conta e da zona
  **When** o mantenedor segue o passo a passo
  **Then** a Web Analytics e as otimizações automáticas que mexem no conteúdo estão desligadas para o subdomínio, e isso é conferido pela comparação acima.

### RF-07 — Conferência do que está no ar

- **Given** o site recém-publicado
  **When** o passo de conferência roda
  **Then** busca `/`, um caminho inexistente e um arquivo de `js/`, e falha se faltar um cabeçalho de RF-02, se a 404 não tiver status 404, ou se o HTML diferir do de `public/`.
- **Given** o Lighthouse CI da spec 006
  **When** o deploy termina
  **Then** mede também o endereço real (mobile e desktop), com os mesmos limites de `.github/lighthouse/`.
- **Given** a falha dessa conferência
  **When** acontece depois do deploy
  **Then** o run fica vermelho e avisa o mantenedor; o deploy já feito não é desfeito sozinho.

### RF-08 — Documentação da operação

- **Given** o repositório
  **When** o mantenedor precisa publicar pela primeira vez
  **Then** o guia operacional do mantenedor (mantido fora do repositório) traz o passo a passo em ordem (criar o projeto, conectar o domínio, criar o token com o escopo certo, guardar o segredo, desligar o `workers.dev` e a Web Analytics, primeiro deploy, conferência), cada passo dizendo quem faz e o que conferir.
- **Given** o `README.md`, o `README.en.md`, o `CLAUDE.md` e o `docs/stack.md`
  **When** a spec é concluída
  **Then** dizem onde o site está e qual tecnologia o serve, sem prometer data de lançamento.

### RF-09 — Descoberta pelo buscador

- **Given** o `index.html`
  **When** é examinado
  **Then** tem `<link rel="canonical">` apontando para `https://dmarcfacil.ryanmorais.com.br/` (sem `?dominio=`), de modo que o endereço compartilhável de um resultado conta como a página inicial.
- **Given** a requisição a `/robots.txt`
  **When** o site responde
  **Then** devolve 200 com `User-agent: *`, `Allow: /` e a linha `Sitemap:` com o endereço absoluto do sitemap.
- **Given** a requisição a `/sitemap.xml`
  **When** o site responde
  **Then** devolve 200 com um sitemap válido que lista só a página inicial, no mesmo endereço do `canonical`.
- **Given** o endereço público
  **When** aparece em `wrangler.json`, no `canonical`, no `robots.txt`, no `sitemap.xml`, no workflow e nos limites do Lighthouse
  **Then** é o mesmo em todos, com uma fonte só (a rota do `wrangler.json`) e um teste que compara os demais com ela.
- **Given** a `404.html`
  **When** é examinada
  **Then** não tem `canonical` nem entra no sitemap.

## Requisitos não-funcionais

### RNF-01 — Privacidade

A hospedagem guarda, no máximo, a estatística agregada e o log de requisição de arquivo estático da própria Cloudflare. O repositório e a página dizem isso sem prometer o que a plataforma controla. Nenhum log de domínios consultados existe, porque a consulta nunca passa pelo nosso servidor.

### RNF-02 — Custo zero

Plano gratuito da Cloudflare e do GitHub. Se a plataforma exigir cartão ou tiver limite que o site possa atingir, vira pergunta antes de seguir.

### RNF-03 — Configuração como arquivo

Tudo que dá para versionar (projeto, pasta de assets, tratamento da 404, cabeçalhos, workflow) mora no repositório. O que só existe no painel (conexão do domínio, token, desligar a Web Analytics) é listado em RF-08, com como conferir.

### RNF-04 — Testes sem rede

Os testes que o portão roda (`pnpm test`) não acessam a rede nem a Cloudflare: conferem os arquivos de configuração (cabeçalhos, CSP contra a `<meta>` e contra `doh.js`, `not_found_handling`, pasta de assets). A conferência do que está no ar (RF-07) é um passo do workflow de deploy, não do portão.

### RNF-05 — Reversibilidade

Nenhuma etapa desta spec deixa o domínio num estado que o mantenedor não consiga voltar: apagar o projeto de hospedagem e o registro DNS do subdomínio devolve a zona ao que era antes.

## Perguntas em aberto

Nenhuma.

## Decisões resolvidas

1. Endereço `dmarcfacil.ryanmorais.com.br`, subdomínio grátis (decisão do mantenedor, 2026-10-31).
2. A zona `ryanmorais.com.br` está na Cloudflare, conferido pelos servidores de nome (2026-10-31).
3. A 404 é conferida na doc oficial da hospedagem escolhida, e a 5xx não se personaliza (spec 006, decisão do mantenedor, 2026-10-31).
4. Publicar, criar token e conectar domínio são atos do mantenedor.
5. Plataforma: **Workers Static Assets** (decisão do mantenedor, 2026-10-31).
6. Deploy por workflow do GitHub Actions com `wrangler` por `npx` e token em segredo; o portão e a conferência do que está no ar ficam no mesmo lugar (decisão do mantenedor, 2026-10-31).
7. `canonical`, `robots.txt` e `sitemap.xml` entram nesta spec (RF-09) (decisão do mantenedor, 2026-10-31).
8. HSTS: só `max-age`, sem `includeSubDomains` e sem `preload` (decisão do mantenedor, 2026-10-31).

## Testes

- `test/hospedagem.test.js`: a pasta de assets é `./public`; `not_found_handling` é `404-page`; `workers.dev` desligado; nada fora de `public/` é enviado.
- `test/cabecalhos.test.js`: `_headers` traz os cabeçalhos de RF-02; a CSP do cabeçalho tem `frame-ancestors 'none'` e o mesmo `connect-src` de `doh.js`; nenhuma CSP tem `unsafe-inline` ou `unsafe-eval`; a CSP do cabeçalho não é mais frouxa que a da `<meta>`.
- `test/workflow-deploy.test.js`: toda `uses:` por SHA, `runs-on: ubuntu-26.04`, o deploy só na `main`, o segredo só no ambiente de produção.
- `test/descoberta.test.js`: `canonical` do `index.html`, `robots.txt` e `sitemap.xml` com o mesmo endereço da rota do `wrangler.json`; sitemap só com a página inicial; `404.html` sem `canonical`.
- Conferência do que está no ar (RF-07): passo do workflow de deploy, com o resultado no log; não entra em `pnpm test`.
- O CI roda o portão completo em todo PR.
