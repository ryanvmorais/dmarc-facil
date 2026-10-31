---
feature: Parser DMARC — escolher o registro DMARC entre os TXT de `_dmarc.<domínio>`, lê-lo e apontar os achados
status: aprovado
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh]
origin: conception
---

# 003 — Parser DMARC

## Contexto e problema

A spec 002 entrega, para um nome como `_dmarc.exemplo.com.br`, a lista de textos TXT já limpos (sem aspas, pedaços juntos). Falta transformar esse texto em algo que a página consiga explicar: **qual dessas strings é o registro DMARC, o que cada tag diz e o que há de errado ou de incompleto nele.** É o coração do produto: o visitante quer saber em que degrau da escada `none` → `quarantine` → `reject` o domínio está.

O formato é o da RFC 7489 (seção 6.3 e 6.4). Pontos que mudam o resultado, conferidos no texto da RFC em 2026-10-31:

- O registro é uma lista `tag=valor` separada por `;`, com espaços opcionais em volta de `=` e `;`, e `;` final permitido.
- `v=DMARC1` é obrigatório e **tem de ser a primeira tag**; o valor é escrito com as letras exatas `DMARC1`. Uma string que não começa assim **não é registro DMARC** e é descartada.
- `p` é obrigatório (`none`, `quarantine` ou `reject`) e vem logo depois de `v`. Se faltar `p` mas houver um `rua` com URI válido, o receptor age como se fosse `p=none`.
- Se depois do descarte sobrarem **vários** registros DMARC, ou nenhum, a política não vale (a RFC manda encerrar a descoberta). O mesmo nome com dois registros DMARC é um erro comum de configuração e precisa ser dito ao visitante.
- Tags desconhecidas são ignoradas; erro de sintaxe numa tag opcional manda usar o padrão (`adkim=r`, `aspf=r`, `pct=100`, `fo=0`, `ri=86400`, `rf=afrf`).
- `sp` vale para os subdomínios (se ausente, vale `p`); `pct` é a porcentagem das mensagens a que a política se aplica; `rua` e `ruf` são listas de URIs `mailto:` separadas por vírgula, com tamanho máximo opcional (`mailto:x@y.com!10m`).

O conteúdo do registro é dado de terceiros, escrito por quem controla o DNS: o parser trata como texto qualquer, jamais interpreta marcação, e nada que sai dele é HTML.

## Objetivos

- Uma função que, dada a lista de textos TXT de `_dmarc.<domínio>`, **escolhe o registro DMARC** (ou diz que não há, ou que há mais de um) e devolve as tags lidas, já com os valores padrão da RFC aplicados e a marcação de quais foram padrão e quais foram escritas.
- **Achados com código estável**: cada coisa notável no registro (política `none`, `pct` abaixo de 100, falta de `rua`, `p` ausente, tag duplicada, valor inválido…) é um objeto `{ codigo, gravidade, tag }` sem texto de interface, para a página (spec futura) escrever a explicação em português e o próximo passo.
- **Estágio atual** do domínio na escada (`nenhum`, `none`, `quarantine`, `reject`), calculado a partir do registro, para a página saber em que degrau pôr a etiqueta "Próximo passo".
- **Leitura tolerante e honesta**: o que a RFC manda ignorar é ignorado; o que está torto vira achado, não exceção nem silêncio.
- Módulo **puro** (sem DOM, sem rede), testável só com textos montados.

## Não-objetivos

- Fazer a consulta: é da spec 002. Este módulo recebe a lista de textos que ela entregou.
- Os textos em português que explicam cada achado e cada tag, e o passo-a-passo de como mudar o registro: são da spec da página.
- Verificar se os endereços de `rua`/`ruf` existem, se aceitam relatórios (autorização de domínio externo por `<domínio>._report._dmarc`) ou se a caixa funciona: exigiria consultas extras e não faz parte do registro.
- Descobrir o registro do domínio organizacional quando o subdomínio não tem DMARC próprio (a RFC manda tentar o domínio de cima). Quem monta e consulta os nomes é o chamador.
- Avaliar alinhamento de uma mensagem real (SPF/DKIM contra o `From`): a ferramenta olha o registro publicado, não e-mails.
- SPF e DKIM: specs seguintes.

## Personas

- Como **dono de site ou dev**, quero saber se meu DMARC existe, se está válido e em que degrau da escada estou, em português, sem precisar ler a RFC.
- Como **autor da página**, quero achados com código estável e um estágio já calculado, para escrever o texto de cada caso sem refazer a lógica do registro.
- Como **mantenedor**, quero cada regra da RFC coberta por um teste com registro sintético, para que mudar o parser nunca quebre em silêncio um caso que já funcionava.

## Requisitos funcionais

### RF-01 — Escolher o registro DMARC entre os TXT

- **Given** a lista de textos de `_dmarc.exemplo.com.br` com um texto que começa com `v=DMARC1` e outros TXT que não (ex.: uma verificação de domínio)
  **When** `lerDmarc` é chamada
  **Then** só o que começa com `v=DMARC1` é tratado como registro, e os outros são ignorados sem virar achado.
- **Given** uma lista com **dois ou mais** textos que começam com `v=DMARC1`
  **When** é lida
  **Then** o resultado é `situacao: "multiplos"`, com a quantidade, e **nenhuma política é aplicada**, igual à RFC; o registro não é escolhido por chute.
- **Given** uma lista vazia ou sem nenhum texto começando com `v=DMARC1`
  **When** é lida
  **Then** o resultado é `situacao: "ausente"` (a página distingue "não existe" de "existe errado").
- **Given** um texto com espaços antes do `v` ou `v =DMARC1` com espaços ao redor do `=`
  **When** é lido
  **Then** é aceito, porque a ABNF da RFC permite espaço em volta de `=` e `;`. Se o `v` não for a primeira tag, **não** é registro DMARC.
- **Given** `V=DMARC1` (nome da tag em maiúscula) ou `v=dmarc1` (valor em minúscula)
  **When** é lido
  **Then** `V=DMARC1` é aceito, porque o nome da tag aceita qualquer caixa (RF-02); `v=dmarc1` **não** é registro DMARC, porque o valor tem de ser `DMARC1` exato.

### RF-02 — Ler as tags

- **Given** um registro bem formado (`v=DMARC1; p=none; rua=mailto:dmarc@exemplo.com.br`)
  **When** é lido
  **Then** devolve `situacao: "valido"` e as tags lidas com os padrões da RFC aplicados nas ausentes: `sp` igual a `p`, `adkim` e `aspf` `r`, `pct` 100, `fo` `0`, `ri` 86400, `rf` `afrf`.
- **Given** um registro com `;` final, espaços extras, ou tag vazia entre dois `;;`
  **When** é lido
  **Then** continua válido; o excesso de separador e de espaço é ignorado.
- **Given** um registro com nome de tag ou valor de `p`, `sp`, `adkim` ou `aspf` em caixa fora do usual (`P=NONE`, `Rua=…`)
  **When** é lido
  **Then** é aceito em qualquer caixa e o achado informativo `caixa-fora-do-padrao` é registrado; o valor sai normalizado em minúsculas.
- **Given** um registro com tag desconhecida (`x=1`)
  **When** é lido
  **Then** a tag é ignorada e o registro segue válido (a RFC manda ignorar), sem achado.
- **Given** um registro com a mesma tag duas vezes (`p=none; p=reject`)
  **When** é lido
  **Then** vale a **primeira** ocorrência e o achado `tag-duplicada` é registrado; não se escolhe a "mais forte" por conta própria.
- **Given** um registro cujo valor de uma tag opcional é inválido (`pct=abc`, `pct=150`, `adkim=x`)
  **When** é lido
  **Then** o valor padrão da RFC é usado nessa tag, com o achado `valor-invalido` e o nome da tag; as outras tags não são afetadas.

### RF-03 — Política: obrigatória, e o caso de `p` ausente

- **Given** um registro com `p=none`, `p=quarantine` ou `p=reject`
  **When** é lido
  **Then** a política sai com esse valor.
- **Given** um registro sem `p` mas com `rua` contendo ao menos uma URI `mailto:` válida
  **When** é lido
  **Then** a política efetiva é `none`, o registro é considerado válido e o achado `politica-ausente` é registrado (a RFC manda tratar como `p=none`).
- **Given** um registro sem `p` e sem `rua` válido, ou com `p` fora dos três valores
  **When** é lido
  **Then** `situacao: "invalido"`, sem política, com o achado `politica-ausente` ou `politica-invalida`: para a RFC esse registro não vale.
- **Given** `sp` com valor válido ou inválido
  **When** é lido
  **Then** `sp` válido vale para os subdomínios; `sp` inválido cai para `p`, com o achado `valor-invalido`.

### RF-04 — Endereços de relatório (`rua` e `ruf`)

- **Given** `rua=mailto:a@exemplo.com.br,mailto:b@exemplo.com.br!10m`
  **When** é lido
  **Then** devolve a lista de URIs com o endereço e o tamanho máximo opcional (`!10m`) separados.
- **Given** um item de `rua`/`ruf` que não é `mailto:` ou que não é um e-mail de forma válida (`http://…`, sem `@`, vazio)
  **When** é lido
  **Then** o item é descartado e o achado `endereco-invalido` é registrado, com o número de itens descartados.
- **Given** um registro sem `rua`
  **When** é lido
  **Then** o achado `sem-relatorio-agregado` é registrado: sem `rua` o dono não recebe relatório e não tem como subir a política com segurança.
- **Given** mais de um número razoável de endereços (limite no design) ou um endereço muito longo
  **When** é lido
  **Then** o excesso é descartado, para que um registro hostil não encha a página.

### RF-05 — Estágio e achados para o próximo passo

- **Given** o registro lido
  **When** `lerDmarc` devolve o resultado
  **Then** traz `estagio`: `"nenhum"` (sem registro válido), `"none"`, `"quarantine"` ou `"reject"`, igual à política efetiva do domínio.
- **Given** política `none`
  **When** é lido
  **Then** o achado `monitoramento-apenas` indica que o domínio só observa e não bloqueia nada.
- **Given** política `quarantine` ou `reject` com `pct` abaixo de 100
  **When** é lido
  **Then** o achado `aplicacao-parcial` traz o `pct`: a política só vale para essa fração das mensagens.
- **Given** `sp` mais fraco que `p` (ex.: `p=reject; sp=none`)
  **When** é lido
  **Then** o achado `subdominios-mais-fracos` indica que os subdomínios têm proteção menor que o domínio.
- **Given** os achados
  **When** são devolvidos
  **Then** cada um tem `codigo` (texto estável), `gravidade` (`erro`, `aviso` ou `info`) e, quando couber, `tag`, e vêm em ordem estável, para teste e para a página.

### RF-06 — Entrada hostil e limites

- **Given** um texto com marcação HTML, caracteres de controle, texto muito longo ou milhares de `;`
  **When** é lido
  **Then** nenhum valor devolvido é interpretado como HTML, o tempo de leitura é linear no tamanho e o resultado é válido ou inválido, nunca exceção.
- **Given** uma lista com mais itens do que a spec 002 permite, ou itens que não são texto
  **When** é recebida
  **Then** itens que não são texto são descartados e o módulo não lança exceção (defesa em profundidade: o módulo não confia que a camada de baixo filtrou).
- **Given** valores de tag arbitrariamente longos
  **When** são lidos
  **Then** o valor guardado tem limite de tamanho (decidido no design), e o que passa disso conta como `valor-invalido`.

## Requisitos não-funcionais

### RNF-01 — Módulo puro

Sem DOM, sem rede, sem relógio e sem estado global: mesma entrada, mesma saída. Roda igual no navegador e no Node, como `nome-dns.js` e `resposta-doh.js`.

### RNF-02 — Nunca lança para dado de terceiros

Texto malformado, lista vazia, valor de tipo errado e registro hostil são resultados devolvidos. Só erro de programação (chamar sem argumento) pode lançar.

### RNF-03 — Testes com registro sintético

Todo registro nos testes é montado no próprio teste (`exemplo.com.br`, `dmarc@exemplo.com.br`), nunca de domínio real. Cada regra da RFC citada acima tem ao menos um teste, e cada defesa (RF-06) tem um teste que alimenta o ataque.

### RNF-04 — Zero dependência de runtime

Só JavaScript da plataforma. O `package.json` continua sem `dependencies`.

### RNF-05 — Sem texto de interface

O módulo devolve códigos e dados, nunca frases para o visitante. O português da explicação é da spec da página, onde o Ryan revisa os textos `[provisório]` antes do `1.0.0`.

## Perguntas em aberto

Nenhuma.

## Decisões resolvidas

1. A fonte do formato é a RFC 7489 (seções 6.3, 6.4 e 6.6.3), conferida em 2026-10-31.
2. Vários registros DMARC no mesmo nome: não se escolhe um; a situação é `multiplos`, como manda a RFC (a descoberta de política termina).
3. Tag duplicada: vale a primeira, com achado. Decisão do projeto, porque a RFC não regula esse caso e escolher a mais forte esconderia o erro.
4. Os achados e o `estagio` entram nesta spec (RF-05), porque são lógica pura e testável sem DOM; a página só traduz código em texto. Aprovado em 2026-10-31.
5. Caixa: nome de tag e valores de `p`, `sp`, `adkim` e `aspf` aceitam qualquer caixa, com o achado informativo `caixa-fora-do-padrao`; o valor de `v` tem de ser `DMARC1` exato (`v=dmarc1` não é registro DMARC). Aprovado em 2026-10-31.
6. Só as tags da RFC 7489 são lidas; as da revisão do protocolo (`np`, `psd`, `t`) contam como tag desconhecida: ignoradas, sem achado. A `pct` continua lida e explicada. Aprovado em 2026-10-31.

## Testes

- `test/dmarc.test.js`: escolha do registro (com TXT alheios misturados, nenhum, vários, `v` fora do começo, espaços), tags e padrões, `;` final e tag vazia, tag desconhecida, tag duplicada, valor inválido por tag, `p` ausente com e sem `rua`, `sp`, URIs de `rua`/`ruf` (válidas, `!10m`, inválidas, excesso), `estagio` nos quatro valores, cada achado do RF-05, entrada hostil (HTML, controle, texto longo, muitos `;`, itens que não são texto).
- O CI roda o portão completo em todo PR.
