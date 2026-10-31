---
feature: Hospedagem — a pasta public/ no ar em dmarcfacil.ryanmorais.com.br, com cabeçalhos de segurança e a 404 certa
status: aprovado
date: 2026-10-31
related: [001-fundacao, 006-pagina]
origin: conception
---

# 007 — Hospedagem — design

## Visão geral

O site é a pasta `public/` servida como **Workers Static Assets**, um Worker só de arquivos (sem `main`, sem código de servidor) ligado ao domínio `dmarcfacil.ryanmorais.com.br` por uma rota de domínio personalizado. Tudo o que dá para versionar mora no repositório: `wrangler.json` (projeto, rota, pasta e tratamento da 404), `public/_headers` (cabeçalhos e cache), `public/robots.txt` e `public/sitemap.xml`, o workflow `deploy.yml` e o script de conferência. O que só existe no painel (criar o token, o ambiente `producao` e os segredos, desligar recursos da zona) fica em `docs/hospedagem.md`, passo a passo.

```text
 PR ─▶ ci.yml (qualidade + seguranca) ─┐
                                        │ merge na main
 main ─▶ ci.yml verde ─▶ deploy.yml ────┘
              │
              ├─ confere que o commit ainda é a ponta da main
              ├─ npx wrangler@4.152.0 deploy          (ambiente `producao`, token em segredo)
              ├─ scripts/conferir-hospedagem.mjs      (cabeçalhos, 404, HTML byte a byte, http→https)
              └─ Lighthouse CI sobre o endereço real  (mobile e desktop)
```

A conferência do que está no ar (RF-07) é um passo do workflow, não do portão: o `pnpm test` continua sem rede (RNF-04). O que o portão confere são os **arquivos** (a configuração, os cabeçalhos, o workflow, o endereço único).

**Sem mockup.** Esta spec não cria nem muda tela: o único toque em `public/index.html` é um `<link rel="canonical">` no `<head>`. Por isso não há artboard, e a regra de interface do projeto não se aplica.

## Componentes

| Arquivo                                             | O que é                                                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrangler.json`                                     | Projeto `dmarc-facil`: rota do domínio, pasta `./public`, `404-page`, `workers_dev` e `preview_urls` desligados. **Fonte única do endereço.**  |
| `public/_headers`                                   | Cabeçalhos de segurança para `/*` e cache longo para `/fonts/*`. Não é servido ao visitante.                                                   |
| `public/robots.txt`, `public/sitemap.xml`           | Descoberta (RF-09). Os dois citam o endereço absoluto.                                                                                         |
| `public/index.html`                                 | Ganha `<link rel="canonical">`. A `404.html` não muda.                                                                                         |
| `.github/workflows/deploy.yml`                      | Deploy depois do CI verde na `main`, conferência e Lighthouse sobre o endereço real. Ambiente `producao`.                                      |
| `.github/lighthouse/producao-{mobile,desktop}.json` | Os limites de `mobile.json` e `desktop.json`, mas medindo a URL real em vez de `staticDistDir`.                                                |
| `scripts/conferir-hospedagem.mjs`                   | Lê `public/_headers` e `public/`, consulta o endereço real e diz o que difere. Lógica em funções puras exportadas; a rede entra por parâmetro. |
| `docs/hospedagem.md`                                | Passo a passo do Ryan (token, ambiente, painel, primeiro deploy), conferência e como desfazer um deploy.                                       |

## Modelo de dados

### `wrangler.json`

```json
{
  "name": "dmarc-facil",
  "compatibility_date": "2026-10-31",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "dmarcfacil.ryanmorais.com.br", "custom_domain": true }],
  "assets": {
    "directory": "./public",
    "not_found_handling": "404-page",
    "html_handling": "auto-trailing-slash"
  },
  "observability": { "enabled": false }
}
```

Sem `main` (assets-only) e sem `$schema`: o `wrangler` não é dependência do projeto, e o schema oficial vem dentro do pacote. JSON estrito, sem comentário: o porquê de cada chave está nos ADRs e em `docs/hospedagem.md`.

### `public/_headers`

```text
/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src https://cloudflare-dns.com https://dns.google; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

Limites da plataforma: 100 regras e 2.000 caracteres por linha; a linha da CSP tem menos de 400.

### `public/sitemap.xml` e `public/robots.txt`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://dmarcfacil.ryanmorais.com.br/</loc></url>
</urlset>
```

```text
User-agent: *
Allow: /

Sitemap: https://dmarcfacil.ryanmorais.com.br/sitemap.xml
```

Sem `<lastmod>`: uma data à mão envelhece sozinha e o buscador a desconfia.

## Interfaces

### Resultado da conferência (`scripts/conferir-hospedagem.mjs`)

```js
/** @typedef {{ nome: string, ok: boolean, detalhe: string }} Verificacao */
/** @typedef {{ ok: boolean, verificacoes: Verificacao[] }} ResultadoConferencia */

/** Lê `public/_headers` e devolve os cabeçalhos de uma regra (`/*` ou `/fonts/*`). */
export const lerCabecalhosEsperados = (textoHeaders, regra) => {};

/** Compara os cabeçalhos esperados com os de uma resposta; devolve o que faltou ou diferiu. */
export const compararCabecalhos = (esperados, recebidos) => {};

/** Roda as verificações de RF-07 contra `endereco`; `buscar` é o `fetch`, injetado nos testes. */
export const conferirHospedagem = async ({ endereco, pasta, buscar = fetch }) => {};
```

Roda à mão com `pnpm hospedagem:conferir` (endereço lido de `wrangler.json`) e no `deploy.yml`. Sai com código 1 se alguma verificação falhar, e escreve a tabela no resumo do run (`$GITHUB_STEP_SUMMARY`), como o `links-dkim.yml`.

As verificações, na ordem:

1. `GET /`: status 200; corpo idêntico ao `public/index.html` (hash SHA-256); cabeçalhos de `/*` presentes e iguais.
2. `GET /<caminho-inexistente>/a/b`: status **404**; corpo idêntico ao `public/404.html`; cabeçalhos de `/*` presentes.
3. `GET /js/pagina.js`: 200; `Content-Type` de JavaScript; corpo idêntico; `Cache-Control` que obriga a revalidar.
4. `GET /fonts/<uma fonte>`: 200; `Cache-Control` igual ao de `/fonts/*`.
5. `GET /robots.txt` e `GET /sitemap.xml`: 200 e corpo idêntico.
6. `GET /_headers`: **não** devolve o arquivo (a hospedagem o consome e não o publica).
7. `http://` no mesmo host: redireciona para `https://` (301/302/307/308) ou a conexão é recusada; nunca 200.

Passos do `deploy.yml` (resumo; o arquivo traz o texto completo):

```yaml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]

jobs:
  publicar:
    if: >-
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push' &&
      github.event.workflow_run.head_repository.full_name == github.repository
    environment: producao
    permissions: { contents: read }
    # checkout em github.event.workflow_run.head_sha; segue só se ainda for a ponta da main
```

## Decisões (ADRs)

### ADR-1 — Workers Static Assets, sem Worker de código

**Decisão.** O site é um Worker só de assets: `wrangler.json` sem `main`, `assets.directory` em `./public`. Nada de função, nada de roteamento por código.
**Alternativas.** Cloudflare Pages (a doc da Cloudflare diz "Start new projects with Workers"); outra hospedagem estática (a zona já está na Cloudflare, e o custo é zero nos dois).
**Porquê.** Requisição a asset é gratuita e ilimitada; `_headers` vale; a 404 é explícita (`not_found_handling = "404-page"` serve a `404.html` mais próxima com status 404); o domínio personalizado é uma linha na configuração. O Ryan decidiu em 2026-10-31.
**Trade-off.** A plataforma é a da Cloudflare, e a doc dela muda; por isso o `wrangler` é fixado numa versão (ADR-5) e a conferência do que está no ar (ADR-6) falha alto se algo mudar. A doc não diz se `_headers` cobre a resposta da 404: a conferência testa e o risco está registrado.

### ADR-2 — O endereço tem uma fonte só: a rota do `wrangler.json`

**Decisão.** `routes[0].pattern` é o endereço público. O `canonical`, o `robots.txt`, o `sitemap.xml`, o `deploy.yml`, os limites do Lighthouse de produção e a conferência derivam dele ou são comparados com ele por teste.
**Alternativas.** Constante num módulo de `public/js/` (código de produção para servir um teste); repetir o texto em cada arquivo sem teste (o endereço diverge em silêncio).
**Porquê.** RF-09 pede um endereço só. O `wrangler.json` é o arquivo que, de fato, põe o site no ar: se ele mudar, o resto precisa mudar junto, e o teste falha na hora.
**Trade-off.** `public/` não pode ler o `wrangler.json` (é estático); os arquivos de `public/` repetem o texto, e o teste faz o papel de ligar um ao outro.

### ADR-3 — Cabeçalhos em `public/_headers`, CSP do cabeçalho = a da `index.html` + `frame-ancestors`

**Decisão.** A CSP do cabeçalho repete as diretivas da `<meta>` do `index.html` e acrescenta `frame-ancestors 'none'` (a `<meta>` não suporta essa diretiva). Vale para `/*`, inclusive a 404, cuja `<meta>` é mais estrita (sem `script-src`): o navegador aplica as duas, e vale a interseção. HSTS só com `max-age=31536000` (Ryan, 2026-10-31). `Referrer-Policy: no-referrer`, `Permissions-Policy` desligando os recursos de hardware que a página não usa, e `Cross-Origin-Opener-Policy`/`Cross-Origin-Resource-Policy: same-origin`.
**Alternativas.** Uma regra por página (duas CSPs para manter); só a `<meta>` (sem `frame-ancestors`, sem os outros cabeçalhos); `includeSubDomains` e `preload` no HSTS (afetariam o que mais morar em `ryanmorais.com.br`, e `preload` é quase irreversível).
**Porquê.** Um cabeçalho só para o site todo é o mais simples de testar: o teste lê o `_headers` e compara a CSP com a `<meta>` do `index.html` e o `connect-src` com os hosts de `doh.js` (a mesma fonte da spec 006). `no-referrer` basta porque a página não precisa saber de onde veio o visitante, e os links externos já levam `noopener noreferrer`.
**Trade-off.** A `404.html` recebe `connect-src` que não usa. Sem efeito, porque a `<meta>` dela já nega tudo. Uma `Permissions-Policy` enumerada envelhece quando o navegador cria recursos novos; a lista cobre o que existe hoje e a revisão é a da Lighthouse (boas práticas).

### ADR-4 — Cache: revalidar o código, guardar as fontes

**Decisão.** HTML, CSS e JavaScript ficam com o padrão da plataforma para assets (`public, max-age=0, must-revalidate` e `ETag`): o navegador pergunta antes de reusar e recebe 304 se nada mudou. Só `/fonts/*` leva `Cache-Control: public, max-age=31536000, immutable`.
**Alternativas.** Nomes com _hash_ e cache longo em tudo (exige build, contra o projeto); `max-age` curto no código (deploy novo demora a chegar e pode misturar módulos de versões diferentes).
**Porquê.** Os módulos ES importam uns aos outros por caminho fixo: com `must-revalidate` o navegador valida cada arquivo a cada visita e não monta uma página com um `dominio.js` novo e um `pagina.js` velho. As fontes são `woff2` que não mudam; se mudarem, o arquivo ganha outro nome e o CSS aponta para ele (regra escrita no `docs/hospedagem.md`).
**Trade-off.** Cada visita revalida ~20 arquivos (304, sem corpo). Aceito: o peso é de cabeçalho, e a alternativa quebra a regra de consistência. A doc não diz se um `Cache-Control` do `_headers` substitui ou se junta ao padrão nas fontes; a conferência compara o valor exato e o risco está registrado.

### ADR-5 — Deploy por workflow do GitHub Actions, depois do CI verde, com `wrangler` por `npx`

**Decisão.** `deploy.yml` roda em `workflow_run` do `CI` na `main`, só quando o run terminou com sucesso, veio de `push` e do próprio repositório. O job usa o ambiente `producao` (segredos `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`, branch de deploy restrita à `main`), faz checkout do `head_sha` do run e só segue se esse commit ainda for a ponta da `main`. A ferramenta entra por `npx --yes wrangler@${{ env.WRANGLER_VERSION }} deploy`, com a versão numa variável do workflow (**4.152.0**, de 2026-10-22; a 4.156.0, a mais nova, saiu há menos de 7 dias e o `minimumReleaseAge` do projeto é de uma semana). Concorrência: grupo `deploy`, sem cancelar o que está rodando.
**Alternativas.** Workers Builds, a integração Git da Cloudflare (sem token no GitHub, mas o build e a conferência ficam fora do nosso CI); `cloudflare/wrangler-action` (mais uma ação de terceiro no caminho do segredo, sem ganho sobre `npx`); `push` com um job `needs` repetindo o portão (duplica o CI); `wrangler` como devDependency (a árvore dele engordaria o `pnpm audit` obrigatório, como a do `@lhci/cli`).
**Porquê.** `workflow_run` encadeia no CI sem repeti-lo: se `qualidade` ou `seguranca` falham, o deploy não roda. O filtro `push` na `main` do próprio repositório impede que um PR (ou fork) dispare deploy ou toque o segredo. O teste da ponta da `main` evita que dois merges seguidos publiquem o mais velho por último. O Ryan decidiu por `npx` e segredo em 2026-10-31.
**Trade-off.** O Dependabot não vê `npx`: a revisão da versão do `wrangler` é manual (mesmo caso do `LHCI_VERSION`). `workflow_run` roda o arquivo da branch padrão, então mexer no workflow só vale depois do merge, e o primeiro deploy é por `workflow_dispatch`, que o Ryan aciona.

### ADR-6 — Conferir o que está no ar, no mesmo run

**Decisão.** Depois do deploy, `conferir-hospedagem.mjs` e o Lighthouse sobre o endereço real rodam no mesmo job. Falha deixa o run vermelho e o resumo mostra a tabela; o deploy não é desfeito sozinho (RF-07).
**Alternativas.** Reverter automático em caso de falha (um deploy "bom" pode falhar a conferência por rede, e reverter sozinho esconde o motivo); só conferir à mão (o que está no ar passaria a depender de lembrar).
**Porquê.** A conferência é o que prova RF-01 a RF-04 e RF-06 no mundo real: o `_headers` pode estar certo no arquivo e a plataforma não aplicar na 404; o HTML pode estar certo no repositório e a zona injetar um script. Sem essa prova, os testes de arquivo só garantem o que enviamos, não o que chega.
**Trade-off.** O visitante já está vendo o deploy ruim enquanto o run avisa. Aceito para um site de duas páginas; o caminho de volta é o de ADR-9.

### ADR-7 — Nada injetado: comparar o HTML byte a byte e desligar o que mexe na zona

**Decisão.** A conferência compara o hash do HTML, do JavaScript, do CSS, do `robots.txt` e do `sitemap.xml` servidos com o dos arquivos de `public/`. O passo a passo do Ryan desliga, para o subdomínio ou a zona: Web Analytics da Cloudflare, Rocket Loader, Email Address Obfuscation e qualquer otimização automática que reescreva HTML ou JavaScript, e liga "Always Use HTTPS" (RF-01).
**Alternativas.** Confiar que o plano gratuito não injeta nada (a Web Analytics pode ser ativada pelo painel sem nenhum commit); só olhar o HTML no navegador (a injeção às vezes depende do cabeçalho `Accept` ou do agente).
**Porquê.** A regra "sem rastreador" é do projeto, e a CSP bloquearia um `<script>` injetado, mas quebraria a página em silêncio. A comparação transforma "nada foi injetado" de promessa em fato verificado a cada deploy.
**Trade-off.** A conferência vê o que o runner do GitHub recebe, que pode diferir do que um navegador recebe (por exemplo, otimizações por agente). Por isso o passo a passo também manda abrir a página uma vez no navegador e ver o painel de rede.

### ADR-8 — Descoberta: `canonical`, `robots.txt`, `sitemap.xml`

**Decisão.** `index.html` leva `<link rel="canonical" href="https://dmarcfacil.ryanmorais.com.br/">`. `robots.txt` permite tudo e aponta o sitemap. `sitemap.xml` lista só a página inicial, sem `lastmod`. A `404.html` não leva `canonical` (a resposta 404 já tira a página do índice).
**Alternativas.** Não ter nada disso (o buscador adivinha); `canonical` relativo (o padrão exige o endereço absoluto); `noindex` na 404 (redundante com o status 404).
**Porquê.** O endereço compartilhável `?dominio=exemplo.com.br` seria outra URL para o buscador; o `canonical` as junta na página inicial. A Lighthouse (SEO) pede o `canonical` e um `robots.txt` válido.
**Trade-off.** A auditoria `robots-txt` do Lighthouse continua ignorada: a CSP sem `connect-src 'self'` impede o Lighthouse de baixar o arquivo (spec 006). A validade do `robots.txt` e do sitemap passa a ser conferida pelos nossos testes e pela conferência do que está no ar.

### ADR-9 — Token com o menor escopo e caminho de volta documentado

**Decisão.** O token é da conta do Ryan, criado a partir do modelo "Edit Cloudflare Workers", restrito à conta e à zona `ryanmorais.com.br`, guardado só como segredo do ambiente `producao`. O `docs/hospedagem.md` descreve dois caminhos de volta: **(1)** reverter o commit por PR e deixar o deploy automático republicar; **(2)** emergência, `npx wrangler@4.152.0 rollback` da máquina do Ryan para a versão anterior. Um rollback real é feito uma vez antes do lançamento.
**Alternativas.** Token de conta inteira (alcance maior que o necessário); chave global (nunca); sem caminho documentado (o problema aparece às duas da manhã).
**Porquê.** Um segredo vazado deve poder, no máximo, trocar o conteúdo deste site. A doc da Cloudflare recomenda limitar o token à conta que recebe o deploy.
**Trade-off.** Criar o domínio personalizado pode pedir permissão de DNS na zona além da do modelo; isso só aparece no primeiro deploy e o passo a passo diz como ampliar o escopo o mínimo necessário (risco registrado).

## Impacto

- **`public/index.html`:** uma linha (`canonical`). A `404.html` e o `public/js/` não mudam; os testes de `pagina-estatica` continuam valendo.
- **`public/`:** quatro arquivos novos (`_headers`, `robots.txt`, `sitemap.xml`), que o Lighthouse CI mede junto da pasta; o peso da página inicial não muda.
- **`wrangler.json`, `deploy.yml`, `producao-*.json`, `conferir-hospedagem.mjs`, `docs/hospedagem.md`:** novos.
- **`package.json`:** script `hospedagem:conferir`. Nenhuma dependência nova.
- **`CLAUDE.md`:** a árvore ganha os arquivos novos; "hospedagem a decidir" passa a dizer Workers Static Assets; a seção de qualidade cita o deploy e a conferência.
- **`docs/stack.md`:** Workers Static Assets, `wrangler`, `_headers`, HSTS e o ambiente `producao`.
- **READMEs:** o endereço do site, sem data de lançamento, e a linha `v0.7` na tabela de marcos (nos dois idiomas).
- **`specs/README.md`:** linha 007 no roadmap.
- **Specs 001 a 006:** nenhuma mudança de comportamento.
- **Memória do projeto:** estado da spec 007 e o que ficou com o Ryan.

## Riscos

- **O `_headers` pode não cobrir a resposta da 404.** A doc não afirma. Mitigação: a conferência checa os cabeçalhos na 404; se faltar, o plano B é uma regra explícita para o caminho ou aceitar a `<meta>` da `404.html` (que já nega tudo) como defesa, registrando o desvio.
- **`Cache-Control` do `_headers` pode se juntar ao padrão** (`public, max-age=0, must-revalidate, public, max-age=...`) em vez de substituí-lo nas fontes. Mitigação: a conferência compara o valor recebido; se juntar, as fontes ficam com o padrão (revalidar) e o ADR-4 muda.
- **Token com permissão curta para criar o domínio.** Mitigação: ADR-9; descobrir no primeiro deploy, que é manual.
- **Zona com recursos automáticos ligados** (Rocket Loader, ofuscação de e-mail, Web Analytics) que alteram o HTML. Mitigação: ADR-7, e a comparação byte a byte.
- **Dois merges seguidos.** O mais velho não pode publicar por último. Mitigação: o passo da ponta da `main` (ADR-5).
- **`workflow_run` e segredo.** O workflow só roda a partir da `main`, com checkout do commit já mergeado. Mitigação: a condição `event == 'push'` e `head_repository`, o ambiente restrito à `main`, e um teste que falha se o deploy aceitar `pull_request`.
- **`wrangler` e a doc mudam.** Mitigação: versão fixa, revisão manual a cada mês junto do Lighthouse, conferência do que está no ar a cada deploy.
- **HSTS publicado é difícil de desfazer.** Mitigação: `max-age` de um ano, sem `includeSubDomains` nem `preload`; o escopo é um subdomínio só deste site.
- **Domínio apontado para o Worker antes de o conteúdo estar certo.** O primeiro deploy já publica. Mitigação: `docs/hospedagem.md` manda conferir o `workflow_dispatch` com o resumo antes de divulgar o endereço; divulgar é ato do Ryan.

## Testes

- `test/hospedagem.test.js`: `wrangler.json` sem `main`; `assets.directory` é `./public`; `not_found_handling` é `404-page`; `workers_dev` e `preview_urls` são `false`; a rota é `custom_domain` com o endereço de `dmarcfacil.ryanmorais.com.br`; `observability` desligada; `package.json` sem `wrangler` entre as dependências.
- `test/cabecalhos.test.js`: `_headers` traz cada cabeçalho de RF-02; a CSP do cabeçalho é igual à `<meta>` do `index.html` mais `frame-ancestors 'none'`; o `connect-src` lista exatamente `RESOLVEDORES` de `doh.js`; a `<meta>` da `404.html` não é mais frouxa que o cabeçalho; nenhuma tem `unsafe-inline` ou `unsafe-eval`; HSTS sem `includeSubDomains` e sem `preload`; `Cache-Control` longo só em `/fonts/*`; nenhuma linha passa de 2.000 caracteres e há no máximo 100 regras.
- `test/descoberta.test.js`: `canonical` do `index.html`, `robots.txt` e `sitemap.xml` com o endereço da rota; sitemap bem formado, com uma só URL; `404.html` sem `canonical`.
- `test/workflow-deploy.test.js`: toda `uses:` por SHA; `runs-on: ubuntu-26.04`; gatilho só `workflow_run` do `CI` na `main` e `workflow_dispatch` (nenhum `pull_request`); condição de sucesso, `push` e repositório; ambiente `producao`; `permissions` só `contents: read`; o segredo só no job de deploy; `WRANGLER_VERSION` fixa; `LHCI_VERSION` igual à do `lighthouse.yml`; concorrência sem cancelamento.
- `test/lighthouse-producao.test.js`: `collect.url` igual ao endereço da rota; as asserções iguais às de `mobile.json` e `desktop.json`.
- `test/conferir-hospedagem.test.js`: `lerCabecalhosEsperados` e `compararCabecalhos` com `_headers` sintético (cabeçalho faltando, valor diferente, valor repetido); `conferirHospedagem` com um `buscar` falso que responde bem e com variações que o fazem falhar: HTML alterado (script injetado), 404 com status 200, cabeçalho ausente na 404, `http://` servido em 200, `_headers` público, `Cache-Control` diferente nas fontes.
- Conferência real: passo do `deploy.yml` (RF-07), fora do `pnpm test`.
- O CI roda o portão completo em todo PR.
