---
feature: DKIM — procurar a chave pública do domínio em seletores comuns, lê-la e apontar os achados
status: concluído
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh, 003-parser-dmarc, 004-parser-spf]
origin: conception
---

# 005 — DKIM — design

## Visão geral da abordagem

Cinco arquivos, separados pelo que tocam:

- `seletor-dkim.js`, **puro**: `normalizarSeletor` valida o seletor digitado e `juntarSeletores` monta a lista final (comuns primeiro, digitados depois, sem repetição, com teto).
- `chave-rsa.js`, **puro**: `lerChaveRsa` decodifica o `p=` e mede o módulo RSA. É a parte de maior risco (ASN.1 à mão), por isso mora sozinha, com teste próprio.
- `dkim.js`, **puro**: `lerDkim` recebe os textos TXT de **um** seletor e devolve o que há ali (registro escolhido, tags lidas, tamanho da chave, achados). Sem DOM, sem rede, sem relógio, como `dmarc.js` e `spf.js`.
- `dkim-busca.js`, fino: `buscarDkim` recebe o domínio, a lista de seletores e uma **função de consulta injetada** (`consultarTxt` no navegador, uma falsa nos testes), consulta cada `<seletor>._domainkey.<domínio>` com **concorrência limitada** e junta o resumo. Não importa `fetch`.
- `seletores-dkim.js`: os dados (seletor, provedor, link da documentação).

A leitura de um registro segue quatro passos:

1. **Escolher o candidato** entre os TXT: começa com `v=DKIM` (qualquer caixa, para pegar `DKIM1.0` e `dkim1`) ou tem uma tag `p`. O resto é ignorado. Zero candidatos é `ausente`; dois ou mais é `multiplos`.
2. **Dividir em tags** por `;`, com `nome=valor` aparado. Tag repetida, `v` fora do primeiro lugar, versão diferente de `DKIM1`, tag ou valor grande demais invalidam o registro.
3. **Interpretar as tags** conhecidas (`v`, `h`, `k`, `p`, `s`, `t`, `n`); as desconhecidas são ignoradas.
4. **Medir a chave** (RSA pelo módulo; Ed25519 pelos 32 bytes) e derivar os achados.

A busca é um pool de tarefas: até N consultas em andamento, cada uma grava o resultado na posição do seletor, e o resumo sai da lista pronta. O resultado de cada módulo é uma união discriminada, sem exceção, e os achados são dados (`codigo`, `gravidade`, `seletor`, `tag`, `detalhe`), nunca frases.

Feature sem interface: não há mockup nesta spec.

## Layout de módulos / componentes

```text
public/js/seletor-dkim.js       # RF-02: normalizar o seletor digitado e juntar as listas (puro)
public/js/chave-rsa.js          # RF-05: decodificar o p= e medir o módulo RSA (puro)
public/js/dkim.js               # RF-03, RF-04, RF-05, RF-08: escolher, ler e apontar achados de um seletor (puro)
public/js/dkim-busca.js         # RF-06, RF-07, RF-08: buscar nos seletores com concorrência limitada (consulta injetada)
public/js/seletores-dkim.js     # RF-01: seletores comuns e orientações, com a documentação de cada provedor
public/js/dominio.js            # reaproveitado: normalizarDominio, antes de montar qualquer nome (RF-08)
public/js/resposta-doh.js       # só importado: MAXIMO_TEXTO
test/seletor-dkim.test.js       # RF-02
test/chave-rsa.test.js          # RF-05
test/dkim.test.js               # RF-03, RF-04, RF-05, RF-08
test/dkim-busca.test.js         # RF-06, RF-07, RF-08
test/seletores-dkim-dados.test.js  # RF-01
```

Nenhum arquivo de configuração muda: `tsc`, ESLint e o runner já cobrem `public/js/` e `test/`.

## Modelo de dados

```js
/** @typedef {"erro" | "aviso" | "info"} Gravidade */

/** Algo notável; o texto em português é da página. `seletor` diz em que registro foi achado. */
/** @typedef {{ codigo: string, gravidade: Gravidade, seletor?: string, tag?: string, detalhe?: number | string }} Achado */

/** @typedef {"rsa" | "ed25519" | "desconhecido"} TipoChave */

/** @typedef {{
 *   situacao: "valido", registro: string, versao: "DKIM1", tipo: TipoChave,
 *   hashes: string[] | null, servicos: string[], flags: string[],
 *   tamanhoBits?: number, nota?: string, achados: Achado[]
 * }} DkimValido */
/** @typedef {{ situacao: "revogado", registro: string, achados: Achado[] }} DkimRevogado */
/** @typedef {{ situacao: "invalido", registro: string, achados: Achado[] }} DkimInvalido */
/** @typedef {{ situacao: "multiplos", quantidade: number, achados: Achado[] }} DkimMultiplos */
/** @typedef {{ situacao: "ausente" }} DkimAusente */
/** @typedef {DkimValido | DkimRevogado | DkimInvalido | DkimMultiplos | DkimAusente} ResultadoDkim */
```

| Campo         | Existe em                        | Conteúdo                                                                     |
| ------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `situacao`    | sempre                           | discriminante: `valido`, `revogado`, `invalido`, `multiplos` ou `ausente`    |
| `registro`    | `valido`, `revogado`, `invalido` | o texto escolhido, para a página mostrar com `textContent`                   |
| `hashes`      | `valido`                         | lista de `h=` sem os vazios; `null` quando a tag falta (a RFC aceita todos)  |
| `servicos`    | `valido`                         | lista de `s=`; `["*"]` quando a tag falta                                    |
| `flags`       | `valido`                         | lista de `t=`; vazia quando a tag falta                                      |
| `tamanhoBits` | `valido` RSA legível             | bits do módulo; ausente em Ed25519, em chave ilegível e em tipo desconhecido |
| `nota`        | `valido`                         | o `n=` cortado em 255 caracteres, como texto puro                            |
| `achados`     | todos menos `ausente`            | lista ordenada (ADR-9), ainda sem `seletor`: quem preenche é a busca         |

O resultado da busca:

```js
/** @typedef {{ seletor: string, nome: string, estado: ResultadoDkim["situacao"] | "nao-verificado",
 *   dkim?: Exclude<ResultadoDkim, { situacao: "ausente" }>, motivo?: string, interrompido?: true }} SeletorTentado */
/** @typedef {{
 *   ok: true, situacao: "encontrado" | "nao-encontrado" | "indeterminado", incompleta: boolean,
 *   seletores: SeletorTentado[], achados: Achado[], resolvedores: string[]
 * }} BuscaDkim */
/** @typedef {BuscaDkim | { ok: false, motivo: string }} ResultadoBusca */
```

| Campo          | Conteúdo                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `situacao`     | `encontrado` se ao menos um seletor tem registro `valido`; `nao-encontrado` se todos foram verificados e nenhum tem registro; `indeterminado` se algum ficou `nao-verificado` e nenhum seletor tem registro (RF-06) |
| `incompleta`   | `true` se algum seletor ficou `nao-verificado`                                                                                                                                                                      |
| `seletores`    | um item por seletor tentado, na ordem da lista de entrada; `nome` é o nome DNS consultado; `motivo` vem da consulta que falhou                                                                                      |
| `interrompido` | `true` no seletor que nem foi tentado porque a busca parou (ADR-5)                                                                                                                                                  |
| `achados`      | os de cada `dkim`, com `seletor`, mais os da busca (`nenhum-seletor-encontrado`, `busca-interrompida`, `seletores-demais`, `seletor-invalido`), ordenados                                                           |
| `resolvedores` | quem respondeu (`cloudflare`, `google`), sem repetição, para a página dizer quem viu o domínio e os seletores (RNF-04)                                                                                              |

Nenhum campo se chama `temDkim`, `possuiDkim` ou parecido: o único jeito de ler "não achei" é `situacao: "nao-encontrado"` junto da lista de `seletores`.

## Componentes

### `normalizarSeletor` e `juntarSeletores` (`public/js/seletor-dkim.js`)

`normalizarSeletor(entrada)` → `{ ok: true, seletor }` ou `{ ok: false, motivo }`:

1. Entrada que não é texto, ou vazia depois de aparar: `motivo: "vazio"`.
2. Passa para minúsculas e apara. Contém `_domainkey`: `motivo: "parece-nome-completo"` (nenhum seletor real tem esse trecho, e quem digita o nome inteiro quase sempre o inclui).
3. Tamanho total acima de `TAMANHO_MAXIMO_SELETOR` (100): `motivo: "grande-demais"`.
4. Divide por `.`. Componente vazio: `motivo: "componente-vazio"`. Componente com mais de 63 caracteres: `motivo: "componente-grande-demais"`. Componente fora de `^[a-z0-9_-]+$`: `motivo: "caractere-invalido"`.
5. Devolve o seletor.

`juntarSeletores(comuns, digitados)` normaliza os digitados (descarta os inválidos, que a página já mostrou ao visitante), junta comuns e digitados nessa ordem, tira repetidos e corta em `MAXIMO_SELETORES` (40). Devolve `{ seletores, cortados }` (`cortados` é o número que passou do teto).

### `lerChaveRsa` (`public/js/chave-rsa.js`)

`lerChaveRsa(base64)` → `{ ok: true, bits }` ou `{ ok: false }`. O módulo também exporta `decodificarChave(base64)` (limpeza e decodificação), que `lerDkim` reusa para conferir os 32 bytes da chave Ed25519. Passos:

1. Tira os espaços; recusa vazio, acima de `MAXIMO_BASE64` (2048 caracteres) ou fora de `^[A-Za-z0-9+/]*={0,2}$`. Decodifica com `atob` dentro de `try`.
2. Lê o DER por um cursor com `lerElemento(bytes, posicao)` → `{ tag, inicio, fim }`: tag de um byte, comprimento curto (`< 0x80`) ou longo de até 2 bytes (`0x81`, `0x82`); recusa comprimento que sai do buffer.
3. Estrutura exigida (`SubjectPublicKeyInfo`, RFC 3279 e RFC 5280): `SEQUENCE { SEQUENCE { OID 1.2.840.113549.1.1.1, NULL }, BIT STRING { 0x00, SEQUENCE { INTEGER n, INTEGER e } } }`. O `BIT STRING` tem de começar com o byte `0x00` (nenhum bit sobrando). Cada elemento tem de terminar exatamente onde o pai termina: sobra ou falta é ilegível.
4. `n` é positivo (primeiro bit zero) e, depois de tirar o `0x00` de sinal, o primeiro byte é diferente de zero. `bits = (bytes - 1) * 8 + (32 - Math.clz32(primeiroByte))`.

Só aceita `SubjectPublicKeyInfo`: o `RSAPublicKey` cru (PKCS#1) que alguns domínios publicam é recusado, porque a RFC 6376 manda o `SubjectPublicKeyInfo` e os verificadores grandes o recusam.

### `lerDkim` (`public/js/dkim.js`)

`lerDkim(textos)` → `ResultadoDkim`. Entrada defensiva: o que não é lista vira lista vazia, o que não é texto é descartado.

1. **Candidatos.** Para cada texto: divide em tags (`dividirTags`, abaixo); é candidato se a primeira tag é `v` com valor começando por `dkim` (qualquer caixa) ou se existe uma tag `p`. Texto acima de `MAXIMO_TEXTO` com cara de candidato vira `invalido` com `registro-grande-demais` (como em `spf.js` e `dmarc.js`).
2. **Escolha.** Nenhum: `ausente`. Dois ou mais: `multiplos` com `quantidade` e `registros-multiplos`.
3. **Tags.** `dividirTags(texto)` separa por `;`, descarta fragmentos vazios (o `;` final e `;;`), parte cada um no primeiro `=` e apara nome e valor. Fragmento sem `=` é ignorado. Mais de `MAXIMO_TAGS` (32) fragmentos, ou valor acima de `MAXIMO_VALOR` (2048 para `p`, 255 para as outras): `invalido`, `registro-grande-demais` ou `valor-grande-demais`. Tag repetida: `invalido`, `tag-repetida` com a tag em `tag`. Nomes de tag **sensíveis à caixa** (decisão 4 dos requisitos).
4. **Versão.** `v` presente e fora da primeira posição, ou com valor diferente de `DKIM1` exato: `invalido`, `versao-invalida`.
5. **Chave.** Sem tag `p`: `invalido`, `chave-ausente`. `p` vazio (depois de tirar os espaços): `revogado`, `chave-revogada`.
6. **Interpretação.** `k` (padrão `rsa`); `h`, `s` e `t` como listas separadas por `:`; `n` cortado em 255. Tipo `rsa`: `lerChaveRsa` e os achados de tamanho (tabela abaixo). Tipo `ed25519`: o `p` tem de decodificar para 32 bytes, senão `chave-ilegivel`. Outro tipo: `tipo: "desconhecido"` e `tipo-de-chave-desconhecido`.
7. **Higiene.** `so-sha1` (`h` presente, com `sha1` e sem `sha256`), `servico-nao-e-email` (`s` presente, sem `email` nem `*`), `modo-de-teste` (`t` com `y`).

Tabela de códigos de achado:

| Código                        | Gravidade | Onde nasce                                      |
| ----------------------------- | --------- | ----------------------------------------------- |
| `chave-fraca`                 | `erro`    | RSA abaixo de 1024 bits                         |
| `chave-ilegivel`              | `erro`    | `p` que não decodifica como a chave do tipo     |
| `versao-invalida`             | `erro`    | `v` errada ou fora do primeiro lugar            |
| `tag-repetida`                | `erro`    | mesma tag duas vezes                            |
| `chave-ausente`               | `erro`    | sem a tag `p`                                   |
| `registro-grande-demais`      | `erro`    | texto ou número de tags acima do teto           |
| `valor-grande-demais`         | `erro`    | valor de tag acima do teto                      |
| `registros-multiplos`         | `erro`    | dois ou mais candidatos no mesmo seletor        |
| `chave-revogada`              | `aviso`   | `p` vazio                                       |
| `chave-abaixo-do-recomendado` | `aviso`   | RSA de 1024 a 2047 bits                         |
| `chave-maior-que-4096`        | `aviso`   | RSA acima de 4096 bits                          |
| `so-sha1`                     | `aviso`   | `h=sha1` sem `sha256`                           |
| `servico-nao-e-email`         | `aviso`   | `s` sem `email` nem `*`                         |
| `modo-de-teste`               | `aviso`   | `t=y`                                           |
| `busca-interrompida`          | `aviso`   | falhas acima do limite (busca)                  |
| `tipo-de-chave-desconhecido`  | `info`    | `k` que não é `rsa` nem `ed25519`               |
| `nenhum-seletor-encontrado`   | `info`    | `situacao: "nao-encontrado"` (busca)            |
| `seletores-demais`            | `info`    | lista acima do teto (busca)                     |
| `seletor-invalido`            | `info`    | seletor que `normalizarSeletor` recusou (busca) |

### `buscarDkim` (`public/js/dkim-busca.js`)

`buscarDkim(dominio, seletores, consulta, opcoes?)`, com `opcoes = { concorrencia = 6, maximoFalhas = 3 }` (os dois limitados a um intervalo seguro; valor fora vira o padrão).

1. **Domínio.** `normalizarDominio(dominio)`; se recusar, devolve `{ ok: false, motivo }` sem consultar. O nome consultado é sempre o domínio **normalizado**.
2. **Lista.** `normalizarSeletor` em cada entrada; as inválidas saem e entram como `seletor-invalido` (com o motivo em `detalhe`); repetidos saem; passando de `MAXIMO_SELETORES` o excesso é cortado e entra `seletores-demais`. O nome de cada um é `${seletor}._domainkey.${dominio}`.
3. **Pool.** `Math.min(concorrencia, n)` trabalhadores compartilham um índice `proximo`. Cada um pega o próximo índice, chama `consulta(nome)` e grava o resultado **na posição do índice**; para de pegar quando a lista acaba ou quando `falhas >= maximoFalhas`. Como o JavaScript é de uma thread só, `proximo++` não corre risco.
4. **Cada resposta.** `ok: false`: `estado: "nao-verificado"`, `motivo`, `falhas += 1`. `ok: true`: `lerDkim(registros)`; `ausente` vira `estado: "ausente"`; os outros viram `estado` igual à `situacao` e `dkim`. O `resolvedor` entra no conjunto de `resolvedores`.
5. **Interrupção.** Se o pool parou por falhas, os índices que ninguém pegou ficam `nao-verificado` com `interrompido: true`, e entra `busca-interrompida`. Consultas já em andamento terminam.
6. **Resumo.** `situacao` e `incompleta` pela tabela do modelo de dados; `nenhum-seletor-encontrado` quando `nao-encontrado`.
7. **Achados.** Os de cada `dkim` ganham `seletor`; com os da busca, são ordenados por gravidade, depois pela posição do seletor, depois pela ordem de geração (a ordenação do `Array.prototype.sort` é estável).

## Interfaces

A página (spec futura) usa assim:

```js
import { consultarTxt } from "./doh.js";
import { buscarDkim } from "./dkim-busca.js";
import { juntarSeletores } from "./seletor-dkim.js";
import { SELETORES_COMUNS } from "./seletores-dkim.js";

const { seletores } = juntarSeletores(
  SELETORES_COMUNS.map((s) => s.seletor),
  seletoresDigitados,
);
const busca = await buscarDkim(dominio, seletores, consultarTxt);
```

`consultarTxt` cabe no tipo `Consulta` (o mesmo de `spf-consultas.js`; o `tsc` confere). O módulo de dados:

```js
/** @typedef {{ seletor: string, provedor: string, documentacao: string, conferido: string }} SeletorComum */
/** @typedef {{ provedor: string, documentacao: string, conferido: string }} Orientacao */
export const SELETORES_COMUNS = [/* ... */];
export const ORIENTACOES = [/* ... */];
```

### Os seletores (RF-01)

**Critério (ADR-3):** só entra seletor cujo nome fixo aparece numa página oficial do provedor, e o `documentacao` é essa página. Conferido por pesquisa em 2026-10-31; a tarefa 1 da etapa 1 abre cada link e confirma que o nome está na página antes de o arquivo ser escrito.

Entram (15):

| Seletor                                    | Provedor                           | Documentação                                                                                       |
| ------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `google`                                   | Google Workspace                   | `https://knowledge.workspace.google.com/admin/security/set-up-dkim`                                |
| `selector1`, `selector2`                   | Microsoft 365                      | `https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dkim-configure`        |
| `s1`, `s2`                                 | SendGrid (Twilio)                  | `https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication` |
| `resend`                                   | Resend                             | `https://resend.com/docs/knowledge-base/cloudflare`                                                |
| `fm1`, `fm2`, `fm3`                        | Fastmail                           | `https://www.fastmail.help/hc/en-us/articles/1500000280261-Domain-set-up-MX-only`                  |
| `protonmail`, `protonmail2`, `protonmail3` | Proton Mail                        | `https://proton.me/support/easy-switch-for-business-google`                                        |
| `mailjet`                                  | Mailjet                            | `https://dev.mailjet.com/docs/email-api/senders-domains/spf-dkim-validation`                       |
| `mte1`, `mte2`                             | Mailchimp Transactional (Mandrill) | `https://mailchimp.com/developer/transactional/docs/authentication-delivery/`                      |

Ficaram de fora na confirmação da tarefa 1 (2026-10-31): `brevo1` e `brevo2` (a página oficial do Brevo respondeu 403 à leitura automática e nenhuma outra página oficial mostrou o nome) e `zoho` e `zmail` (a página do Zoho só define o termo; o administrador escolhe o nome). A lista final tem os 15 seletores acima.

Fora da lista, por decisão: `default`, `dkim`, `mail`, `smtp`, `k1` e semelhantes (nomes genéricos sem provedor dono: acertar um deles não diz qual provedor assina, e cada tentativa é consulta e privacidade a mais); `k2`/`k3` do Mailchimp Marketing e `smtp`/`krs`/`mx` do Mailgun (só fontes de terceiros, e conflitantes); `hs1-<número>` do HubSpot e os de Amazon SES e Postmark (nome que depende da conta). O visitante que usa um desses digita o seletor no campo livre.

`ORIENTACOES` (provedor e link, sem seletor) cobre os que o visitante precisa descobrir no painel do provedor:

| Provedor              | Documentação                                                                        |
| --------------------- | ----------------------------------------------------------------------------------- |
| Mailgun               | `https://documentation.mailgun.com/docs/mailgun/user-manual/domains/domains-verify` |
| Mailchimp (marketing) | `https://mailchimp.com/help/set-up-email-domain-authentication/`                    |
| HubSpot               | `https://knowledge.hubspot.com/email/overview-of-email-authentication`              |

## ADRs

### ADR-1 — Quatro módulos de lógica, com a chave RSA isolada

**Decisão.** `seletor-dkim.js`, `chave-rsa.js`, `dkim.js` e `dkim-busca.js`, mais o arquivo de dados. `dkim.js` importa `chave-rsa.js`; só `dkim-busca.js` conhece a consulta.
**Alternativas.** (a) Um `dkim.js` com tudo; (b) a busca dentro da página.
**Porquê.** A leitura ASN.1 é a parte de maior risco e a única que o Ryan deixou como pergunta; isolada, ela tem teste de entrada torta próprio e sai inteira se um dia for removida. A busca com injeção testa a concorrência com uma consulta falsa que mede quantas estão em andamento, o que não se faz com `fetch` de verdade. A lógica na página ficaria sem teste unitário (ver ADR-1 da spec 004).
**Trade-off.** Cinco arquivos para uma funcionalidade; cada um é curto e o `CLAUDE.md` ganha uma linha por módulo.

### ADR-2 — Os dados são um módulo ES, não JSON

**Decisão.** `seletores-dkim.js` exporta as listas com `@type`, e o `tsc` confere a forma.
**Alternativas.** (a) `seletores.json` carregado por `fetch`; (b) `import ... with { type: "json" }`.
**Porquê.** O `fetch` de um JSON do próprio site acrescenta uma requisição, um estado de falha e um carregamento assíncrono antes da primeira busca. O `import` de JSON depende de um suporte dos navegadores que o projeto, sem build, não controla. Um módulo ES carrega junto com o resto, sem passo novo.
**Trade-off.** Quem edita a lista edita JavaScript, não JSON; o teste de dados (RF-01) pega erro de forma.

### ADR-3 — Um seletor só entra se o nome estiver numa página oficial

**Decisão.** Critério de entrada: o nome fixo do seletor aparece numa página do próprio provedor, que vira o `documentacao`. Nome genérico, nome de fonte de terceiros e nome que depende da conta ficam fora; os dois últimos grupos aparecem como `ORIENTACOES` ou ficam para o campo livre.
**Alternativas.** (a) Lista grande de tudo que se vê em guias (`default`, `mail`, `smtp`, `k1`…); (b) lista mínima só de Google e Microsoft.
**Porquê.** Cada seletor é uma consulta e um nome entregue ao resolvedor (RNF-04), então a lista tem de render. Um nome genérico que acerta não diz ao visitante de quem é a chave; um nome de terceiros, ao errar, faz a página dizer "não encontrei" de um provedor que o visitante usa com outro nome. Com a fonte oficial, o link da página é também a prova.
**Trade-off.** Provedores com seletor por conta (Mailgun, HubSpot, SES, Postmark) dependem do campo livre. A página diz isso com `ORIENTACOES`.

### ADR-4 — Pool de 6 consultas, resultado por posição

**Decisão.** `concorrencia = 6` por padrão, com um pool de trabalhadores que gravam o resultado na posição do seletor.
**Alternativas.** (a) Sequencial; (b) `Promise.all` com todos de uma vez; (c) por lotes de N.
**Porquê.** Sequencial, com 19 seletores a 30 a 120 ms cada (medições da spec 002), levaria de 0,6 a 2,3 s, e cada consulta que cai no fallback acrescenta o tempo do primeiro resolvedor. `Promise.all` nas 19 (ou nas 40 do teto) cabe nas medições (200 em paralelo sem 429), mas não deixa parar nas falhas, dispara tudo contra um resolvedor que já está falhando e abre mais conexões do que os 6 por host que o HTTP/1.1 usa como referência. Por lotes espera o mais lento de cada lote; o pool não. Com 6, 19 seletores levam 4 rodadas.
**Trade-off.** O número 6 é uma escolha, não uma medição de limite. Está em `opcoes.concorrencia` e a spec da página pode mudá-lo se o uso real mostrar outra coisa.

### ADR-5 — Para de abrir consultas depois de 3 falhas

**Decisão.** `maximoFalhas = 3`, como `MAXIMO_FALHAS` da spec 004. Depois da terceira falha ninguém pega consulta nova; as que já saíram terminam; os seletores sem tentar ficam `nao-verificado` com `interrompido: true`, e há `busca-interrompida`.
**Alternativas.** (a) Tentar todos mesmo com a rede fora; (b) parar na primeira falha.
**Porquê.** Cada falha pode esperar o tempo dos dois resolvedores (10 s), e com a rede fora do ar as outras 15 também falhariam; três falhas separam uma falha isolada de um problema geral. Parar na primeira jogaria fora a busca por causa de um tropeço.
**Trade-off.** Com 6 em andamento, até 5 consultas além da terceira falha ainda terminam; é o custo de não cancelar requisições no meio.

### ADR-6 — Candidato é `v=DKIM…` ou ter a tag `p`; o resto é ausente

**Decisão.** Um TXT é candidato se começar com `v` de valor `dkim…` (qualquer caixa) ou tiver uma tag `p`. Os demais não geram achado e o seletor fica `ausente`.
**Alternativas.** (a) Todo TXT sob o seletor é candidato; (b) só `v=DKIM1` exato.
**Porquê.** Um DNS com curinga sob `_domainkey` (ou um TXT de verificação por engano) devolve texto qualquer para qualquer seletor; tratar tudo como candidato mostraria `invalido` em 19 seletores. Só `v=DKIM1` exato esconderia o registro com `DKIM1.0` ou `dkim1`, que o dono precisa ver como erro. A versão é opcional na RFC, então a tag `p` salva o registro sem `v`.
**Trade-off.** Um registro DKIM sem `v` e sem `p` (que é inválido de qualquer jeito) aparece como ausente, em vez de `chave-ausente`. Um registro com `v=dkim1` em minúsculas aparece como `versao-invalida`, que é o que um verificador exato enxerga.

### ADR-7 — Tags sensíveis à caixa, `;` como separador, sem expressão regular de registro inteiro

**Decisão.** `dividirTags` parte por `;`, cada fragmento no primeiro `=`, e compara nomes e valores exatamente. Tag repetida invalida; tag desconhecida é ignorada.
**Alternativas.** (a) Nomes insensíveis à caixa, como em `dmarc.js` e `spf.js`; (b) uma expressão para o registro inteiro.
**Porquê.** A RFC 6376 diz que nomes de tag são sensíveis (decisão 4 dos requisitos), e um `P=` não é lido pelo verificador. Uma expressão única daria um achado só e arriscaria retrocesso em entrada hostil; partir em fragmentos dá achado por tag e custo linear.
**Trade-off.** Um registro `V=DKIM1; P=...` aparece como `chave-ausente`, em vez de "mesma coisa em outra caixa". O `detalhe` do achado traz as tags lidas, para a página explicar.

### ADR-8 — O tamanho da chave sai de um leitor ASN.1 mínimo, não do WebCrypto

**Decisão.** `chave-rsa.js` lê o DER à mão: só `SubjectPublicKeyInfo` de RSA, com comprimento curto ou de até 2 bytes, estrutura fechando exatamente. O resultado é o número de bits do módulo.
**Alternativas.** (a) `crypto.subtle.importKey` + `exportKey("jwk")` e medir o `n`; (b) aceitar também `RSAPublicKey` cru; (c) estimar pelo comprimento do base64.
**Porquê.** O WebCrypto é assíncrono (tornaria `lerDkim` assíncrona e quebraria a pureza do RNF-01), depende de contexto seguro e de cada plataforma aceitar chaves pequenas (512 bits), justo o que se quer medir. Estimar pelo comprimento erra com `e` maior ou campos extras, e daria um número que a página afirma. A leitura à mão tem 40 a 60 linhas, é determinística, roda igual no navegador e no Node e tem teste de entrada torta.
**Trade-off.** Código nosso para manter; o teste cobre chaves de 512, 1024, 2048 e 4096 bits (módulos sintéticos), comprimento longo, base64 inválido, `OID` errado, `BIT STRING` com bits sobrando, sobra no final, `n` negativo e `n` com zeros à esquerda. `RSAPublicKey` cru vira `chave-ilegivel`.

### ADR-9 — Achados sem `seletor` na leitura; a busca os etiqueta e os ordena

**Decisão.** `lerDkim` não conhece o seletor e devolve achados sem ele; `buscarDkim` copia cada achado com o `seletor` e ordena por gravidade, posição do seletor e ordem de geração. Dentro de `lerDkim`, a ordem de geração é estrutura (candidatos, tags), versão, chave, interpretação, higiene.
**Alternativas.** (a) Passar o seletor para `lerDkim`; (b) a página junta e ordena.
**Porquê.** O seletor é dado de quem consulta, não do registro; `lerDkim` fica testável só com textos. A ordem estável é contrato com a página e com os testes (como na spec 003, ADR-3).
**Trade-off.** Uma cópia por achado na busca; no máximo algumas dezenas.

### ADR-10 — O resumo diz "encontrei", "não encontrei nesses seletores" ou "não deu para saber"

**Decisão.** `situacao` tem três valores e a lista de `seletores` tentados vai junto. Nada no resultado afirma ausência de DKIM; `nao-encontrado` só existe quando **todos** os seletores foram verificados. Registro `revogado`, `invalido` ou `multiplos` sozinho não conta como `encontrado`.
**Alternativas.** (a) Booleano `temDkim`; (b) `encontrado` para qualquer registro, mesmo revogado.
**Porquê.** O seletor é escolha do remetente e não dá para listá-los (regra do `CLAUDE.md`). Um booleano convida a página a escrever "você não tem DKIM". Contar um registro revogado ou quebrado como "tem DKIM" esconderia justamente o problema que o visitante veio ver; ele aparece nos `seletores` e nos `achados`.
**Trade-off.** A página precisa tratar três casos e lê dois campos (`situacao`, `seletores`); é o custo de ser honesta.

## Impacto no código existente

- `public/js/doh.js`, `public/js/resposta-doh.js`, `public/js/nome-dns.js` e `public/js/dominio.js`: só importados, sem alteração. `consultarTxt` já serve de função de consulta, e a `resposta-doh.js` já descarta o CNAME misturado na resposta (o seletor delegado ao provedor chega como o TXT de destino).
- `CLAUDE.md`: a seção de arquitetura ganha as linhas dos cinco módulos. Feito no `/atualizar-docs` de fim de sessão.
- `docs/stack.md`: nenhuma tecnologia nova (só JavaScript puro; `atob` e `Uint8Array` da plataforma).
- README (os dois idiomas) e roadmap de `specs/README.md`: marco `v0.5` ao concluir.
- `specs/005-dkim/requirements.md`: a seção Testes lista quatro arquivos; o design acrescenta `test/chave-rsa.test.js` (ADR-1). Ajuste feito na etapa de fechamento.
- Acrescentado depois do fechamento das etapas 1 a 5 (etapa 6 das tasks): a data `conferido` em cada item da lista e o workflow semanal `links-dkim.yml`, com o script `scripts/conferir-links-dkim.mjs` (veredito por link: 404/410/rede é falha, página que não cita mais o seletor é falha, 403/5xx/tempo esgotado é aviso, `conferido` com mais de um ano é aviso). `tsconfig.json` e `eslint.config.mjs` passam a cobrir `scripts/`, e o `package.json` ganha `links:dkim`. Nenhuma dependência nova; o workflow não é check obrigatório.

## Riscos

- **Lista que envelhece.** Provedores trocam seletores e endereços. O teste de dados confere a forma e a data `conferido` de cada item, não a verdade; o `documentacao` e o `conferido` são o ponto de revisão (o workflow semanal `links-dkim.yml` abre cada link e acusa o que quebrou ou deixou de citar o seletor), e a manutenção é editar o arquivo. Nenhuma promessa de completude: a página diz "nesses seletores".
- **Falso "não encontrei".** Muitos domínios usam seletor próprio. A mitigação é o campo livre e o texto da página; o módulo nunca afirma ausência (ADR-10).
- **Carga e privacidade.** Até 40 nomes por busca (19 da lista, mais os digitados, no teto) chegam ao resolvedor DoH, junto do domínio que ele já vê. Nada é registrado (RNF-04) e a página deve dizer que os seletores também vão ao resolvedor.
- **Divergência entre verificadores.** Cada receptor tem tolerâncias próprias (chave de 512 bits aceita ou não, `h=sha1`, `RSAPublicKey` cru). A ferramenta segue as RFCs 6376 e 8301; o texto da página não promete o comportamento de um receptor específico.
- **Leitor ASN.1 próprio.** É o ponto de bug mais provável. Fica isolado, com teste de entrada torta (ADR-8), e uma falha vira `chave-ilegivel`, nunca exceção.
- **Conteúdo hostil.** Tudo o que sai dos módulos é enumeração, número, o texto do registro, o texto de uma tag (cortado) ou um nome DNS validado; entra na página só por `textContent`, regra do `CLAUDE.md`. Teste com `<script>` no registro, num valor de tag e na nota `n=`.
- **Seletor digitado.** Vira nome DNS e URL. As barreiras são `normalizarSeletor`, `normalizarDominio` e `validarNomeDns` em `consultarTxt`; cada uma tem teste que alimenta o ataque (`a&b=c`, `/`, `?`, `#`, `%`, controle).
- **Desempenho.** O texto tem no máximo 4096 caracteres, a leitura é linear e as tags têm teto; teste com 2000 tags e com um valor de 5000 caracteres.

## Estratégia de testes

Todos offline, com registros sintéticos montados no teste (`exemplo.com.br`, `exemplo.net`). As chaves são fabricadas no teste: uma função auxiliar monta um `SubjectPublicKeyInfo` de RSA com módulo de N bits (bytes pseudoaleatórios com o bit mais alto ligado) e `e = 65537`, e outra monta os 32 bytes do Ed25519; nenhuma chave real entra no repositório. A consulta é um mapa nome → resposta, e o teste confere a lista de nomes consultados.

- **`test/seletor-dkim.test.js`** (RF-02)
  - Válidos: `google`, `selector1`, `Selector1` (minúsculas), ` s1` (apara), `marco2005.reykjavik`, `k_1`, componente de 63; recusados: vazio, só espaços, componente de 64, `a..b`, `.a`, `a.`, `a b`, `a/b`, `a?b`, `a#b`, `a:b`, `a@b`, `a%b`, caractere de controle, `google._domainkey.exemplo.com.br`, 101 caracteres, entrada que não é texto.
  - `juntarSeletores`: ordem comuns e depois digitados, repetido normalizado, digitado inválido descartado, teto de 40 e `cortados`.
- **`test/chave-rsa.test.js`** (RF-05)
  - Chaves de 512, 1024, 1536, 2048, 3072 e 4096 bits devolvem o número certo; módulo cujo primeiro byte é `0x01` e `0x80` (os dois extremos do `clz32`); comprimento curto e longo (`0x81`, `0x82`).
  - Recusadas: vazio, base64 inválido, base64 com quebra em espaços (aceito depois de limpar), acima de 2048 caracteres, OID de outro algoritmo, `BIT STRING` com byte de bits sobrando diferente de zero, `SEQUENCE` interna maior que a externa, sobra de bytes no fim, `n` negativo, `n` só com zeros, `RSAPublicKey` cru, comprimento de 3 bytes, texto aleatório; nenhuma entrada lança.
- **`test/dkim.test.js`** (RF-03, RF-04, RF-05, RF-08)
  - Escolha (RF-03): um registro entre TXT alheios (`google-site-verification=...`, `v=spf1 ...`), nenhum, vários; `v` ausente com `p`; `v=DKIM1.0`, `DKIM2`, `dkim1`; `v` depois de `k`; tag repetida; tag desconhecida ignorada; `;` final e `;;`; `P=` e `V=DKIM1` em outra caixa; sem `p`; itens que não são texto.
  - Chave (RF-04, RF-05): `p` vazio (`revogado`); RSA de 512 (`chave-fraca`), 1024, 1536 (`chave-abaixo-do-recomendado`), 2048 e 4096 (sem achado), 4097 e acima (`chave-maior-que-4096`); `p` quebrado com espaços; `p` torto (`chave-ilegivel` e ainda `valido`); Ed25519 certo e com 31 e 33 bytes; `k=` desconhecido; `h=sha1`, `h=sha1:sha256`, `h=sha256`; `s=*`, `s=email`, `s=outro`; `t=y`, `t=s`, `t=y:s`; `n=` com `<script>`.
  - Hostil (RF-08): `<script>` no registro, num valor e na nota (texto intacto em `registro`, nada interpretado); 2000 tags em tempo curto; valor de 5000 caracteres; candidato acima de `MAXIMO_TEXTO`; nenhuma entrada lança.
- **`test/dkim-busca.test.js`** (RF-06, RF-07, RF-08)
  - Concorrência: consulta falsa que conta quantas estão em andamento e nunca passa de 6 (e de 2, com `concorrencia: 2`); com 19 seletores o pico chega a 6; respostas que chegam em ordem inversa saem na ordem da lista.
  - Resumo: um seletor `valido` entre ausentes (`encontrado`); todos ausentes (`nao-encontrado`, `nenhum-seletor-encontrado`); só revogado, só inválido e só múltiplo (`nao-encontrado`, com os achados); falha em um e nenhum registro (`indeterminado`); falha em um e registro em outro (`encontrado`, `incompleta`).
  - Falhas: uma, duas e três falhas; depois da terceira nenhuma consulta nova sai, os não tentados saem `nao-verificado` com `interrompido`, `busca-interrompida`.
  - Lista: nome nunca consultado duas vezes; seletor repetido; seletor inválido (`seletor-invalido`) que nunca chega à função de consulta; 100 seletores (`seletores-demais`, no máximo 40 consultas); `a&b=c` nunca consultado.
  - Domínio: `exemplo.com.br` com maiúsculas e espaços é normalizado antes de montar o nome; `exemplo` e `http://x/y` recusados sem consulta (`ok: false`).
  - Achados: etiquetados com `seletor`, ordenados por gravidade e posição; `resolvedores` sem repetição.
- **`test/seletores-dkim-dados.test.js`** (RF-01)
  - De 15 a 20 itens; cada `seletor` passa por `normalizarSeletor` e já está normalizado; sem repetição; cada `documentacao` é URL `https` sem credencial nem fragmento; `ORIENTACOES` com provedor e link; nenhum seletor de `ORIENTACOES` na lista comum.
- O portão (`format:check`, `lint`, `typecheck`, `test`) é a última tarefa de cada etapa.

## Rastreabilidade

| Requisito | Onde é atendido                                                             |
| --------- | --------------------------------------------------------------------------- |
| RF-01     | `seletores-dkim.js`, "Os seletores", ADR-2, ADR-3                           |
| RF-02     | `normalizarSeletor`, `juntarSeletores`                                      |
| RF-03     | `lerDkim` (1 a 5), ADR-6, ADR-7                                             |
| RF-04     | `lerDkim` (5 a 7), tabela de códigos                                        |
| RF-05     | `lerChaveRsa`, `lerDkim` (6), ADR-8                                         |
| RF-06     | `buscarDkim` (3 a 6), ADR-4, ADR-5, ADR-10                                  |
| RF-07     | `buscarDkim` (7), modelo de dados, ADR-9                                    |
| RF-08     | `lerDkim` (1, 3), `buscarDkim` (1, 2), `normalizarSeletor`, ADR-7           |
| RNF-01    | ADR-1                                                                       |
| RNF-02    | uniões discriminadas, `lerChaveRsa` (`ok: false`), `buscarDkim` (1, 4)      |
| RNF-03    | estratégia de testes                                                        |
| RNF-04    | `buscarDkim` (sem registro de nomes), `resolvedores`, ADR-4, riscos         |
| RNF-05    | só `package.json` sem `dependencies`; módulos importam só código do projeto |
| RNF-06    | ADR-9, ADR-10, tabela de códigos                                            |
