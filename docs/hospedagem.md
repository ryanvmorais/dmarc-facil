# Publicar o site e desfazer um deploy

Passo a passo para pôr o DMARC Fácil no ar em `dmarcfacil.ryanmorais.com.br` e para operar a hospedagem depois. O site é a pasta `public/` servida como **Workers Static Assets** da Cloudflare, publicada pelo workflow [`deploy.yml`](../.github/workflows/deploy.yml) depois de cada merge na `main`. O porquê de cada decisão está nos ADRs de [`specs/007-hospedagem/design.md`](../specs/007-hospedagem/design.md).

Siga as seções na ordem em que aparecem. Quem faz cada passo está marcado: **Ryan** mexe em contas e no painel (publicar é ato dele); **workflow** é o que o `deploy.yml` faz sozinho. Os nomes de menu da Cloudflare mudam de tempos em tempos; o que vale é o recurso citado em cada passo.

## Antes de começar

- O PR da spec 007 está mergeado na `main`. O `workflow_run` roda o arquivo da `main`, e o disparo à mão também precisa dele lá.
- A zona `ryanmorais.com.br` está na conta Cloudflare do Ryan.
- Nada abaixo é divulgação: o primeiro deploy já deixa o endereço no ar. Só avise alguém depois da seção "Divulgar".

## Criar o token da Cloudflare — Ryan

Um segredo vazado deve poder, no máximo, trocar o conteúdo deste site (ADR-9).

1. No painel, abra **My Profile → API Tokens → Create Token**.
2. Use o modelo **Edit Cloudflare Workers**.
3. Em **Account Resources**, escolha **Include → a sua conta** (nunca "All accounts").
4. Em **Zone Resources**, escolha **Include → Specific zone → `ryanmorais.com.br`** (nunca "All zones").
5. Crie o token e copie o valor: ele aparece uma vez só.
6. Copie também o **Account ID** (na página inicial da conta ou na barra de endereço do painel).

**Conferir:** a tela de resumo do token lista uma conta e uma zona, e mais nada.

> ⚠️ Se o primeiro deploy falhar ao criar o domínio com um erro de permissão de DNS, edite o token e acrescente **Zone → DNS → Edit**, só para a zona `ryanmorais.com.br`. Não troque por um token mais largo.

## Criar o ambiente `producao` no GitHub — Ryan

1. No repositório: **Settings → Environments → New environment**, com o nome `producao`.
2. Em **Deployment branches and tags**, escolha **Selected branches and tags** e adicione só `main`.
3. Em **Environment secrets**, crie `CLOUDFLARE_API_TOKEN` (o token de "Criar o token da Cloudflare") e `CLOUDFLARE_ACCOUNT_ID`.

**Conferir:** os dois segredos estão no **ambiente**, e não em "Repository secrets": assim só o job que declara `environment: producao`, e só a partir da `main`, os recebe. Nenhum PR os vê.

## Conferir o que a zona faz sozinha com o subdomínio — Ryan

A zona `ryanmorais.com.br` também serve o site principal (Django, no Railway, atrás da Cloudflare). Por isso **nada desta seção mexe na zona inteira**: o que já está ligado para o site principal continua como está. A regra do projeto é "sem rastreador": nada pode ser injetado na página (ADR-7). Olhado em 2026-10-31, o HTML do site principal não traz Rocket Loader nem o beacon da Web Analytics, e a zona só reescreve e-mails (ofuscação).

### Recursos que reescrevem o conteúdo

Confira o estado de cada um. Só precisa agir se algum deles **reescrever o HTML deste site**; a seção "Ler o resumo da conferência" (comparação byte a byte) é o que prova isso.

| Recurso                   | Onde ver no painel                                            | O que fazer                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rocket Loader             | **Speed**, em Optimization ou Settings (Content Optimization) | Hoje desligado. Se um dia ligar, crie uma Configuration Rule só para o host `dmarcfacil.ryanmorais.com.br`.                                                                             |
| Email Address Obfuscation | **Security → Settings** (busque "Email")                      | **Ligada para o site principal: não desligue na zona.** `public/` não tem endereço de e-mail, então não há o que reescrever aqui; se um dia houver, use uma Configuration Rule do host. |
| Web Analytics             | **Analytics → Web Analytics** (a lista é por conta)           | Confirme que `dmarcfacil` não está na lista de sites.                                                                                                                                   |
| Always Use HTTPS          | **SSL/TLS → Edge Certificates**                               | Já ligado na zona; só confirme (RF-01).                                                                                                                                                 |
| HSTS                      | **SSL/TLS → Edge Certificates**                               | Não ligue na Cloudflare: o site principal manda o dele (com `includeSubDomains`, que já cobre este host) e este site manda o do `_headers`.                                             |

No painel novo, as regras de todos os tipos ficam em **Rules → Overview** (a lista mostra nome e tipo), e uma regra nova sai do botão **Create rule**, que oferece Configuration Rule, Request Header Transform e os outros. Não há item de submenu para Transform Rules nem para Configuration Rules.

**Conferir:** a conferência de "Ler o resumo da conferência" acusa qualquer reescrita do HTML, do JavaScript ou do CSS.

### O que a zona já faz com todo host

1. **Regra "Segredo de origem" (Request Header Transform).** Em **Rules → Overview**, a regra vale para "All incoming requests" (conferido em 2026-10-31): o cabeçalho `X-Origin-Verify` também chega ao Worker deste site. Está certo deixar assim: o Worker só devolve arquivos, não lê nem devolve o cabeçalho e não registra nada (`observability` desligada), e o valor não sai da Cloudflare. **Não edite essa regra para isso**: um filtro errado derruba o site principal com 403 para todos.
2. **`robots.txt` gerenciado.** O toggle **Enable Bot Preference Sync** (Overview da zona, e **AI Crawl Control**) está ligado e a Cloudflare põe um bloco de content signals na frente do `robots.txt`. Ele vale para a zona, então o `robots.txt` deste site também o recebe (confirmado no primeiro deploy), e a comparação byte a byte falharia, se a conferência não ignorasse esse bloco. Não desligue o toggle (protege o site principal): a conferência já ignora o bloco da Cloudflare (ele termina em `# END Cloudflare Managed Content`) e compara só o que vem depois.

Não precisam de ajuste: o rate limit de `POST /contato/` e `POST /newsletter/` e o redirecionamento do `www`, que não alcançam este host.

**Não crie registro DNS à mão** para `dmarcfacil`: o domínio personalizado do Worker cria o dele no primeiro deploy.

## Primeiro deploy — Ryan aciona, workflow executa

1. No repositório: **Actions → Deploy → Run workflow**, na branch `main`.
2. Aprove o ambiente `producao`, se o GitHub pedir.
3. O workflow publica o commit com `npx wrangler@4.152.0 deploy`, confere o que ficou no ar e mede o endereço real com o Lighthouse.

O domínio personalizado é criado nesse primeiro deploy, e o certificado pode levar alguns minutos. Se a conferência acusar "não foi possível abrir o endereço", espere e rode o workflow de novo antes de procurar outro defeito.

Depois disso, todo merge na `main` publica sozinho, quando o CI termina verde.

## Ler o resumo da conferência — Ryan

Abra o run e leia a tabela do resumo. Cada linha é uma verificação do [`conferir-hospedagem.mjs`](../scripts/conferir-hospedagem.mjs) (também roda à mão: `pnpm hospedagem:conferir`):

| Verificação                  | Se falhar, provavelmente é                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Página inicial               | O corpo difere: algo da zona está reescrevendo o HTML (volte a "Recursos que reescrevem o conteúdo"). Cabeçalho ausente: `_headers` não foi aplicado. |
| Página 404                   | Status diferente de 404: o `not_found_handling` não pegou. Cabeçalho ausente só aqui: o `_headers` não cobre a 404 (risco do design).                 |
| JavaScript e CSS             | Corpo diferente: otimização automática ligada. `cache-control` sem revalidar: regra de cache errada.                                                  |
| Fonte                        | `cache-control` diferente do `_headers`: a plataforma juntou o valor ao padrão (risco do ADR-4).                                                      |
| `robots.txt` e `sitemap.xml` | Corpo diferente do repositório (provável: o `robots.txt` gerenciado da zona, seção "O que a zona já faz com todo host").                              |
| `_headers` não é público     | O arquivo está sendo servido ao visitante.                                                                                                            |
| `http://` não é servido      | "Always Use HTTPS" desligado.                                                                                                                         |

Falha **não desfaz o deploy**: o site já está no ar. Trate a causa, ou volte à versão anterior (seção "Desfazer um deploy ruim"). Um desvio do design (por exemplo, cabeçalho que a plataforma não aplica na 404) vai para "Ajustes feitos na implementação" do `design.md`.

## Abrir a página num navegador — Ryan

A conferência vê o que o runner do GitHub recebe, que pode diferir do que um navegador recebe (ADR-7).

1. Abra `https://dmarcfacil.ryanmorais.com.br/` com as ferramentas do navegador na aba **Rede**.
2. Digite um domínio de teste e verifique.

**Conferir:** a rede mostra só o próprio site e os dois resolvedores (`cloudflare-dns.com`, `dns.google`). Nenhum `cloudflareinsights.com`, nenhum `beacon.min.js`, nenhum erro de CSP no console.

## Conferir que o `workers.dev` não serve o site — Ryan

O `wrangler.json` desliga o `workers.dev` e as pré-visualizações públicas. Abra `https://dmarc-facil.<seu-subdominio>.workers.dev/` (o subdomínio da conta aparece no painel, em **Workers & Pages**): não pode servir o site (RF-01).

## Divulgar — Ryan

Só agora o endereço pode ser compartilhado, e só depois de um rollback real feito e desfeito (seção "Desfazer um deploy ruim"). Divulgar é ato do Ryan; o Claude não faz.

## Desfazer um deploy ruim — Ryan

Há dois caminhos (ADR-9). Faça o 2 uma vez antes de divulgar, para saber que funciona.

**Caminho 1: reverter o commit (o normal, em minutos).**

```bash
# Crie uma branch, reverta o commit que quebrou e abra o PR
git switch -c fix/reverter-deploy
git revert <sha-do-commit-ruim>
```

Mergeie o PR: o CI roda e o `deploy.yml` republica o estado anterior sozinho.

**Caminho 2: emergência, direto na Cloudflare.** Da máquina do Ryan, com o token de "Criar o token da Cloudflare" em `CLOUDFLARE_API_TOKEN` e o Account ID em `CLOUDFLARE_ACCOUNT_ID`:

```bash
# Volta o site à versão anterior (peça confirmação e anote o número da versão)
npx wrangler@4.152.0 rollback
```

Depois, corrija a `main` pelo caminho 1, senão o próximo deploy republica a versão ruim.

**Conferir o rollback:** rode `pnpm hospedagem:conferir` e abra a página.

## Regras de manutenção

- **Fontes.** O `_headers` guarda `/fonts/*` por um ano e como `immutable`. Se um arquivo de fonte mudar, ele **ganha outro nome** e o CSS aponta para o novo. Nunca troque os bytes mantendo o nome.
- **Código.** HTML, CSS e JavaScript ficam com o cache padrão da plataforma (o navegador revalida a cada visita). Não ponha `max-age` neles: os módulos importam uns aos outros por caminho fixo, e um deploy novo não pode se misturar com módulos antigos.
- **Revisão mensal das versões.** O Dependabot não vê `npx`. Uma vez por mês confira o `WRANGLER_VERSION` e o `LHCI_VERSION` do [`deploy.yml`](../.github/workflows/deploy.yml) (o do Lighthouse também está no `lighthouse.yml`). Use uma versão com mais de 7 dias de publicada (`npm view wrangler time`), troque nos dois lugares e atualize os comandos `wrangler@…` deste arquivo; um teste falha se este arquivo e o workflow divergirem.
- **Desfazer tudo (RNF-05).** Apague o Worker `dmarc-facil` em **Workers & Pages** e o registro DNS do subdomínio `dmarcfacil`: a zona volta ao que era.
