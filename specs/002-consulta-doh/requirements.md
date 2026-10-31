---
feature: Consulta DoH — buscar registros TXT de um nome por DNS-over-HTTPS, com fallback
status: concluído
date: 2026-10-31
related: [001-fundacao]
origin: conception
---

# 002 — Consulta DoH

## Contexto e problema

O DMARC, o SPF e o DKIM de um domínio moram em registros TXT: o DMARC em `_dmarc.<domínio>`, o SPF no próprio domínio e o DKIM em `<seletor>._domainkey.<domínio>`. O navegador não fala DNS direto, então o DMARC Fácil pergunta a um resolvedor público por DNS-over-HTTPS (DoH), com `fetch`, sem servidor nosso no meio. Todo o resto do produto (parser de DMARC, parser de SPF, DKIM, página) depende de uma única capacidade: **dado um nome DNS já montado pela ferramenta, devolver os registros TXT dele, ou dizer com clareza por que não foi possível.**

Os dois resolvedores candidatos foram medidos em 2026-10-31 (por `curl` e no Chrome, com origem `example.com`):

- Cloudflare (`cloudflare-dns.com/dns-query`) e Google (`dns.google/resolve`) respondem com `Access-Control-Allow-Origin: *`, em GET e em preflight; o `fetch` de uma página qualquer funciona nos dois.
- Domínio inexistente (NXDOMAIN) volta como HTTP 200 com `Status` 3; falha de rede volta como `TypeError: Failed to fetch`, que é o gatilho natural do fallback.
- Rajadas de 40 e de 200 consultas em paralelo não receberam 429 em nenhum dos dois (30 a 120 ms por consulta). O limite de taxa de longo prazo não foi medido.
- As respostas **não têm o mesmo formato**: a Cloudflare devolve o `data` do TXT com aspas (`"v=DMARC1; ..."`) e, num TXT longo, em pedaços entre aspas (`"pedaço1" "pedaço2"`); o Google devolve sem aspas e já junta os pedaços sem separador; o nome no Google vem com ponto final.
- Quando o seletor DKIM é um CNAME para o provedor (o caso comum), a resposta traz o CNAME **e** o TXT para o qual ele aponta, misturados no mesmo `Answer`.

O conteúdo de um registro TXT é dado de terceiros: quem controla o DNS de um domínio escreve o que quiser ali, inclusive marcação HTML. Esta spec entrega a camada de rede e a leitura da resposta; interpretar o que está dentro do registro é das specs seguintes.

## Objetivos

- Uma função que, dado um nome DNS, devolve os registros TXT dele como lista de textos prontos para os parsers, com os pedaços já juntos e sem aspas.
- **Fallback** automático da Cloudflare para o Google quando o primeiro resolvedor não consegue responder, dizendo ao chamador qual resolvedor respondeu (a página precisa dizer ao visitante quem viu o domínio dele).
- **Resultado tipado e sem exceção para o que é esperado**: registro encontrado, nome sem registro TXT, domínio inexistente e falha de consulta são resultados distintos, cada um com um motivo em português quando é falha.
- **Leitura defensiva da resposta**: o JSON do resolvedor é tratado como entrada não confiável, e o que não tem a forma esperada é descartado ou vira falha, nunca exceção solta.
- **Privacidade por construção**: a consulta não leva cookie, nem `Referer`, e o módulo não registra nada.

## Não-objetivos

- Interpretar o conteúdo dos registros (DMARC, SPF, DKIM): specs seguintes.
- Montar os nomes `_dmarc.`, `_domainkey` e a lista de seletores DKIM: o chamador monta; esta spec só valida que o nome é um nome DNS bem formado.
- Controle de concorrência para as dezenas de consultas do DKIM: fica com a spec do DKIM, que é quem as dispara.
- Validação DNSSEC (flag `AD`) e outros tipos de registro além de TXT.
- Cache próprio, repetição automática da mesma consulta, ou qualquer armazenamento do que foi consultado.
- A interface: nenhum DOM neste marco.

## Personas

- Como **visitante**, quero que a consulta funcione mesmo quando um dos resolvedores está fora do ar, e quero saber qual deles viu o meu domínio.
- Como **autor dos parsers e da página**, quero um resultado previsível, sem diferenças entre Cloudflare e Google, para escrever cada parser uma vez só.
- Como **mantenedor**, quero testes sem rede e sem registro real, para que a suíte seja determinística e um formato novo de resposta vire um teste, não uma surpresa.

## Requisitos funcionais

### RF-01 — Consultar registros TXT de um nome

- **Given** um nome DNS bem formado (`_dmarc.exemplo.com.br`)
  **When** `consultarTxt` é chamada
  **Then** faz uma consulta DoH do tipo TXT ao primeiro resolvedor e devolve `{ ok: true, situacao: "encontrado", registros, resolvedor }`, com `registros` sendo a lista dos textos TXT da resposta.
- **Given** uma resposta cujo `Answer` mistura CNAME e TXT (seletor DKIM apontando para o provedor)
  **When** a resposta é lida
  **Then** `registros` traz só os TXT; os CNAME são ignorados.

### RF-02 — Distinguir as situações de uma resposta bem-sucedida

- **Given** uma resposta com `Status` 0 e ao menos um TXT
  **When** é lida
  **Then** a situação é `encontrado`.
- **Given** uma resposta com `Status` 0 e nenhum TXT (`Answer` ausente, vazio ou só com outros tipos)
  **When** é lida
  **Then** a situação é `sem-registro`, com `registros` vazio.
- **Given** uma resposta com `Status` 3 (NXDOMAIN)
  **When** é lida
  **Then** a situação é `inexistente`, com `registros` vazio, e **não** há fallback: o NXDOMAIN é uma resposta válida.

### RF-03 — Normalizar o texto do registro

- **Given** um TXT que a Cloudflare devolve com aspas (`"v=DMARC1; p=none"`)
  **When** é lido
  **Then** o texto sai sem as aspas externas (`v=DMARC1; p=none`).
- **Given** um TXT longo em pedaços (`"pedaço1" "pedaço2"` na Cloudflare, ou já junto no Google)
  **When** é lido
  **Then** os pedaços saem juntos, sem espaço nem aspas entre eles, e o resultado é igual nos dois resolvedores.
- **Given** um TXT com aspas escapadas ou espaços dentro de um pedaço
  **When** é lido
  **Then** o conteúdo do pedaço é preservado como veio, sem reescrever.

### RF-04 — Fallback entre resolvedores

- **Given** que o primeiro resolvedor (Cloudflare) falhou por rede (`TypeError`), por tempo esgotado, por HTTP diferente de 200, por corpo que não é JSON válido, ou por `Status` de falha do resolvedor (SERVFAIL ou REFUSED)
  **When** `consultarTxt` trata a falha
  **Then** repete a mesma consulta no segundo resolvedor (Google) e devolve o resultado dele, com `resolvedor: "google"`.
- **Given** que os dois resolvedores falharam
  **When** `consultarTxt` termina
  **Then** devolve `{ ok: false, motivo }`, com uma explicação em português que pode ser mostrada ao visitante, e sem lançar exceção.
- **Given** que o primeiro resolvedor respondeu (inclusive com NXDOMAIN ou sem registro)
  **When** `consultarTxt` termina
  **Then** o segundo resolvedor não é consultado e `resolvedor` é `"cloudflare"`.

### RF-05 — Recusar nome mal formado antes de qualquer rede

- **Given** um nome vazio, com espaço, com caractere fora de letras, números, hífen, sublinhado e ponto, com rótulo vazio (`a..b`), com rótulo de mais de 63 caracteres ou com mais de 253 no total
  **When** `consultarTxt` o recebe
  **Then** devolve `{ ok: false, motivo }` sem chamar `fetch`.
- **Given** um nome com `&`, `=`, `?`, `#`, `/` ou `%`
  **When** `consultarTxt` o recebe
  **Then** é recusado como qualquer outro caractere inválido, de modo que o nome nunca possa injetar parâmetro na URL do resolvedor.
- **Given** um nome bem formado
  **When** a URL é montada
  **Then** o nome entra como parâmetro codificado da URL, nunca por concatenação de texto.

### RF-06 — Leitura defensiva da resposta

- **Given** uma resposta que não é um objeto JSON, sem `Status` numérico, ou com `Answer` que não é lista
  **When** é lida
  **Then** conta como falha do resolvedor (aciona o fallback do RF-04), sem lançar exceção.
- **Given** um item de `Answer` sem `type` e `data` do tipo esperado
  **When** é lido
  **Then** o item é descartado e os demais seguem valendo.
- **Given** uma resposta com mais registros ou com textos maiores que o limite
  **When** é lida
  **Then** guarda no máximo 50 registros de no máximo 4096 caracteres cada, e o que passar disso é descartado, para que um domínio hostil não encha a página nem a memória.

### RF-07 — Privacidade da requisição

- **Given** uma consulta feita pelo navegador
  **When** o `fetch` é chamado
  **Then** vai sem cookies nem credenciais, sem enviar `Referer`, e pede `application/dns-json`.
- **Given** o módulo da consulta
  **When** executa
  **Then** não registra em console, armazenamento nem em lugar algum o nome consultado.

## Requisitos não-funcionais

### RNF-01 — Tempo limite

Cada consulta a um resolvedor tem tempo limite finito, para que um resolvedor travado não deixe a página esperando para sempre; esgotar o tempo é uma falha que aciona o fallback. O valor é decidido no design.

### RNF-02 — Rede injetável e testes offline

A função de rede (`fetch`) é recebida como parâmetro, com o `fetch` global como padrão. A suíte nunca usa a rede real: toda resposta é montada no próprio teste, com registros sintéticos (`exemplo.com.br`, `v=DMARC1; p=none`), nunca de domínio real.

### RNF-03 — Separação entre lógica e rede

A leitura da resposta (JSON → lista de textos) é função pura, sem rede nem DOM, testável com respostas montadas; só a chamada ao `fetch` fica em módulo fino. Mesma camada que o resto do projeto usa.

### RNF-04 — Zero dependência de runtime

Só `fetch`, `URL`, `AbortController` e o que a plataforma já traz. O `package.json` continua sem `dependencies`.

### RNF-05 — Resultado e erro nunca se confundem com exceção

Tudo o que é esperado (rede fora do ar, resposta torta, NXDOMAIN) é um valor devolvido. Só erro de programação (parâmetro de tipo errado) pode lançar.

## Perguntas em aberto

Nenhuma.

## Decisões resolvidas

1. A ordem dos resolvedores é Cloudflare primeiro, Google como fallback (decisão da Fase 0).
2. O resolvedor que respondeu é parte do resultado, porque a página diz ao visitante quem viu o domínio e o IP dele.
3. O nome DNS é montado pelo chamador e validado aqui como defesa em profundidade; este módulo aceita sublinhado (`_dmarc`), ao contrário de `normalizarDominio`.
4. O fallback também dispara em SERVFAIL e REFUSED: esses `Status` indicam que o resolvedor não conseguiu resolver, e o outro pode conseguir. NXDOMAIN e NOERROR são definitivos e não disparam fallback. Aprovado em 2026-10-31.
5. Os limites do RF-06 (50 registros e 4096 caracteres por registro) ficam como propostos: um registro SPF ou DMARC cabe com folga, e um registro acima disso some da análise. Aprovado em 2026-10-31.

## Testes

- `test/resposta-doh.test.js`: respostas sintéticas no formato da Cloudflare (aspas, pedaços) e do Google (sem aspas, nome com ponto final), CNAME misturado com TXT, `Status` 0 sem `Answer`, `Status` 3, item malformado, resposta que não é objeto, limite de registros e de tamanho.
- `test/doh.test.js`: `fetch` falso cobrindo o caminho feliz, fallback por `TypeError`, por tempo esgotado, por HTTP 500, por JSON inválido e por SERVFAIL; sem fallback em NXDOMAIN; falha dos dois; nomes malformados recusados sem chamar `fetch`; URL montada com o nome codificado; opções de privacidade do `fetch`.
- O CI roda o portão completo em todo PR.
