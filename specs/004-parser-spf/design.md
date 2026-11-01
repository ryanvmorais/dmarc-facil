---
feature: Parser SPF — escolher o registro SPF entre os TXT do domínio, lê-lo, contar as consultas DNS e apontar os achados
status: concluído
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh, 003-parser-dmarc]
origin: conception
---

# 004 — Parser SPF — design

## Visão geral da abordagem

Dois módulos, separados pela rede:

- `spf.js`, **puro**: `lerSpf` recebe a lista de textos TXT de um domínio e devolve o que há ali (registro escolhido, termos lidos, estágio, achados). Sem DOM, sem rede, sem relógio, como `dmarc.js`.
- `spf-consultas.js`, fino: `lerSpfComConsultas` recebe o domínio e uma **função de consulta injetada** (`consultarTxt` no navegador, uma falsa nos testes), lê o registro do domínio com `lerSpf` e **caminha pelos `include` e `redirect`**, contando as consultas que um receptor faria. Não importa `fetch`.

A leitura de um registro segue quatro passos:

1. **Escolher o registro** (RFC 7208, 4.5): só conta quem começa com `v=spf1` seguido de espaço ou do fim. Zero é `ausente`; dois ou mais é `multiplos`.
2. **Dividir em termos** por espaço e classificar cada um (diretiva com qualificador, ou modificador).
3. **Validar cada termo** pela gramática da RFC (seção 12): uma sintaxe inválida invalida o registro inteiro, como o `permerror` do receptor.
4. **Derivar o estágio e os achados** do `all` final e da higiene do registro.

A caminhada, por cima disso, é uma busca em profundidade, sequencial, que soma 1 a cada termo que gasta consulta e para num teto. O resultado de cada módulo é uma união discriminada, sem exceção, e os achados são dados (`codigo`, `gravidade`, `tag`, `detalhe`, `dominio`), nunca frases.

Feature sem interface: não há mockup nesta spec.

## Layout de módulos / componentes

```text
public/js/spf.js               # RF-01, RF-02, RF-03, RF-05, RF-06: escolher, ler e apontar achados (puro)
public/js/spf-consultas.js     # RF-04, RF-06: caminhar pelos include/redirect e contar (consulta injetada)
public/js/nome-dns.js          # reaproveitado: valida o alvo de include/redirect antes de consultar (ADR-3)
public/js/resposta-doh.js      # só importado: MAXIMO_TEXTO
test/spf.test.js               # RF-01, RF-02, RF-03, RF-05, RF-06
test/spf-consultas.test.js     # RF-04, RF-06
```

Nenhum arquivo de configuração muda: `tsc`, ESLint e o runner já cobrem `public/js/` e `test/`.

## Modelo de dados

```js
/** @typedef {"erro" | "aviso" | "info"} Gravidade */

/** Algo notável; o texto em português é da página. `dominio` diz em que registro foi achado. */
/** @typedef {{ codigo: string, gravidade: Gravidade, tag?: string, detalhe?: number | string, dominio?: string }} Achado */

/** @typedef {"all" | "include" | "a" | "mx" | "ptr" | "ip4" | "ip6" | "exists" | "redirect" | "exp"} TipoTermo */

/** Um termo lido. `ignorado` marca o que o receptor não avalia (ADR-3). */
/** @typedef {{
 *   texto: string, tipo: TipoTermo, qualificador?: "+" | "-" | "~" | "?",
 *   dominio?: string, macro?: boolean, rede?: string,
 *   ignorado?: "apos-all" | "redirect-com-all"
 * }} Termo */

/** @typedef {"nenhum" | "permissivo" | "suave" | "rigido" | "redirecionado"} EstagioSpf */

/** @typedef {{
 *   situacao: "valido", registro: string, estagio: Exclude<EstagioSpf, "nenhum">,
 *   termos: Termo[], achados: Achado[]
 * }} SpfValido */
/** @typedef {{ situacao: "invalido", registro: string, estagio: "nenhum", achados: Achado[] }} SpfInvalido */
/** @typedef {{ situacao: "multiplos", quantidade: number, estagio: "nenhum" }} SpfMultiplos */
/** @typedef {{ situacao: "ausente", estagio: "nenhum" }} SpfAusente */
/** @typedef {SpfValido | SpfInvalido | SpfMultiplos | SpfAusente} ResultadoSpf */
```

`lerSpf` devolve `estagio: "redirecionado"` quando o registro não tem `all` mas tem `redirect=` efetivo: sem rede ele não sabe o do destino. É a caminhada que resolve (ADR-9).

| Campo      | Existe em            | Conteúdo                                                                                                     |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `situacao` | sempre               | discriminante: `valido`, `invalido`, `multiplos` ou `ausente`                                                |
| `estagio`  | sempre               | degrau do `all` final; `nenhum` fora de `valido`                                                             |
| `registro` | `valido`, `invalido` | o texto escolhido, para a página mostrar com `textContent`                                                   |
| `termos`   | `valido`             | os termos na ordem do registro; modificador desconhecido não entra; `texto` truncado em 255                  |
| `achados`  | `valido`, `invalido` | lista ordenada (ADR-10)                                                                                      |
| `dominio`  | termo                | alvo já validado, em minúsculas e sem ponto final; ausente em `a`/`mx`/`ptr` sem alvo (vale o domínio atual) |
| `macro`    | termo                | `true` se o alvo tem macro; o alvo não é guardado em `dominio` (nunca vira consulta)                         |
| `rede`     | `ip4`, `ip6`         | a rede como escrita (`203.0.113.0/24`), já validada                                                          |

O resultado da caminhada:

```js
/** @typedef {{ tipo: TipoTermo, alvo?: string, macro?: boolean, caminho: string[] }} ItemConsulta */
/** @typedef {{
 *   total: number, limite: 10, passouDoLimite: boolean,
 *   incompleta: boolean, interrompida: boolean, itens: ItemConsulta[]
 * }} Consultas */
/** @typedef {{
 *   ok: true, spf: ResultadoSpf, estagio: EstagioSpf | "indeterminado",
 *   consultas: Consultas, achados: Achado[], resolvedores: string[]
 * }} CaminhadaSpf */
/** @typedef {CaminhadaSpf | { ok: false, motivo: string }} ResultadoCaminhada */
```

| Campo                      | Conteúdo                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `spf`                      | o resultado de `lerSpf` do domínio digitado, intacto                                                                    |
| `estagio`                  | o do `all`; com `redirect`, o do destino (ADR-9); `indeterminado` se o destino não pôde ser verificado                  |
| `consultas.total`          | termos que gastam consulta, em todos os níveis, até o teto (ADR-6)                                                      |
| `consultas.passouDoLimite` | `total > 10`                                                                                                            |
| `consultas.incompleta`     | `true` se algo não foi verificado (falha de rede, macro) ou a caminhada parou; a contagem pode ser maior que a mostrada |
| `consultas.interrompida`   | `true` se a caminhada parou no teto ou nas falhas (ADR-6)                                                               |
| `consultas.itens`          | cada consulta contada, na ordem do receptor; `caminho` vai do domínio digitado até o domínio que tem o termo            |
| `achados`                  | os de `spf` mais os da caminhada, deduplicados e ordenados (ADR-10)                                                     |
| `resolvedores`             | quem respondeu (`cloudflare`, `google`), sem repetição, para a página dizer quem viu os domínios (RNF-04)               |

## Componentes

### `lerSpf` (`public/js/spf.js`)

Recebe a lista de textos (`readonly unknown[]`) e devolve `ResultadoSpf`. Em ordem:

1. **Entrada.** O que não é lista vira lista vazia; o que não é texto é descartado. Atende RF-06.
2. **Candidatos.** Casa com `^v=spf1(?: |$)` sem distinguir caixa (ADR-2). Nenhum: `ausente`. Dois ou mais: `multiplos` com a `quantidade`. Os outros TXT são ignorados sem achado. Atende RF-01.
3. **Tamanho.** Um candidato com mais de `MAXIMO_TEXTO` (4096) vira `invalido` com `registro-grande-demais`, sem ler os termos. Como cada termo tem ao menos um caractere e um espaço, o teto de termos lidos é 2048 (4096 ÷ 2), e a leitura é linear (RF-06).
4. **Termos.** Divide por espaços (`/ +/`), descarta pedaço vazio e pula o `v=spf1`. Cada termo é classificado (ADR-3): modificador (`nome=valor`, em que `nome` é `[a-z][a-z0-9._-]*`) ou diretiva (`[qualificador]mecanismo...`). Modificador desconhecido é ignorado sem achado. `redirect` e `exp` repetidos geram `modificador-repetido` e invalidam. Termo fora da gramática gera `termo-invalido` (só o primeiro, com o texto truncado em 64 caracteres no `detalhe`) e invalida. Atende RF-02.
5. **Marcas de "ignorado".** Depois do primeiro `all`, as diretivas seguintes ganham `ignorado: "apos-all"` e o achado `termos-apos-all`; com `all` em qualquer posição, o `redirect` ganha `ignorado: "redirect-com-all"` e o achado `redirect-ignorado`. Atende RF-02.
6. **Estágio e achados do `all`.** Pelo qualificador do primeiro `all`: `-` é `rigido` (`all-rigido`, `info`), `~` é `suave` (`all-suave`, `info`), `?` é `permissivo` (`all-neutro`, `aviso`), `+` ou sem qualificador é `permissivo` (`all-libera-tudo`, `erro`). Sem `all` e com `redirect` efetivo: `redirecionado`. Sem `all` e sem `redirect`: `permissivo` com `sem-all` (`aviso`). Atende RF-03.
7. **Higiene.** `ptr-em-uso` (`aviso`, `tag: "ptr"`); `registro-grande` (`aviso`, `detalhe` com o tamanho) acima de 512; `termo-repetido` (`info`, `detalhe` com o texto) para `ip4`, `ip6` ou `include` idênticos já vistos; `caixa-fora-do-padrao` (`info`) se a versão, um qualificador de modificador ou um nome de mecanismo ou modificador tinha maiúscula (o alvo não conta). Atende RF-05.
8. **Ordem.** Gravidade (`erro`, `aviso`, `info`) e, dentro dela, a ordem de geração: estrutura (`modificador-repetido`, `termo-invalido`), depois cada termo na ordem do registro (`ptr-em-uso`, `termo-repetido`), depois `termos-apos-all`, `redirect-ignorado`, o do `all`, `registro-grande`, `caixa-fora-do-padrao`. Atende RF-05.

Exporta `lerSpf`, `LIMITE_CONSULTAS` (10) e `TIPOS_QUE_CONSULTAM` (`include`, `a`, `mx`, `ptr`, `exists`, `redirect`). Importa `MAXIMO_TEXTO` de `resposta-doh.js` e `validarNomeDns` de `nome-dns.js`. Não lê `document` nem `window` e não guarda estado entre chamadas.

### Gramática de termo (interna a `spf.js`)

Segue a seção 12 da RFC 7208, sem distinguir caixa nos nomes:

| Termo               | Forma aceita                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `all`               | nada depois do nome                                                                                      |
| `include`, `exists` | `:` e um alvo (obrigatório)                                                                              |
| `a`, `mx`           | opcionalmente `:alvo`, e opcionalmente `/n` e `//m` (`n` de 0 a 32, `m` de 0 a 128, sem zero à esquerda) |
| `ptr`               | opcionalmente `:alvo`                                                                                    |
| `ip4`, `ip6`        | `:` e a rede, com `/n` opcional; octetos sem zero à esquerda; `ip6` validado por função própria (ADR-3)  |
| `redirect`          | `=` e um alvo (obrigatório); sem qualificador                                                            |
| `exp`               | `=` e um texto qualquer não vazio (não é consultado); sem qualificador                                   |
| qualificador        | `+`, `-`, `~` ou `?`, só antes de mecanismo; ausente vale `+`                                            |

**Alvo.** Sem `%`: passa por `validarNomeDns` e precisa ter ao menos dois rótulos e o último não pode ser só número (a RFC exige `.` e um rótulo de topo no fim); guarda-se em minúsculas, sem ponto final. Com `%`: precisa seguir `%%`, `%_`, `%-` ou `%{letra...}` com letra de `s l o d i p h v`; guarda-se `macro: true` e **nenhum** `dominio` (ADR-8). Qualquer outro `%` é `termo-invalido`.

### `lerSpfComConsultas` (`public/js/spf-consultas.js`)

Recebe o domínio já normalizado e a função de consulta, e devolve `Promise<ResultadoCaminhada>`:

```js
/** @typedef {(nome: string) => Promise<
 *   { ok: true, situacao: "encontrado" | "sem-registro" | "inexistente", registros: string[], resolvedor?: string }
 *   | { ok: false, motivo: string }>} Consulta */
```

É o formato de `consultarTxt` da spec 002, que serve direto. Em ordem:

1. **Domínio.** Passa por `validarNomeDns`; inválido devolve `{ ok: false, motivo }`. Consulta o TXT do domínio; `ok: false` volta como `{ ok: false, motivo }`; `sem-registro` ou `inexistente` volta `spf: ausente`, sem caminhada.
2. **Leitura.** `lerSpf(registros)`. Se não é `valido`, devolve sem caminhar: `consultas.total` é 0.
3. **Caminhada** (ADR-5), em profundidade e **sequencial**, com o caminho (lista de domínios) da raiz até o registro atual:
   1. Para cada diretiva não ignorada, na ordem do registro, e depois para o `redirect` não ignorado (o receptor o aplica por último): se o tipo está em `TIPOS_QUE_CONSULTAM`, soma 1 e registra o item. Ao chegar a `TETO_CONSULTAS`, marca `interrompida` e `incompleta` e encerra tudo (ADR-6).
   2. `include` e `redirect` com `dominio` são seguidos. Com `macro`, não: `macro-nao-avaliada` (`info`) e `incompleta`. `a`, `mx`, `ptr` e `exists` não são seguidos (ADR-7).
   3. Alvo já no caminho: `ciclo` (`erro`), não consulta de novo, segue o resto. Alvo já consultado em outro ramo (diamante): usa o resultado em cache, mas **conta de novo** os termos dele, porque o receptor os avalia de novo (ADR-5).
   4. Consulta com `ok: false`: `consulta-falhou` (`aviso`, `dominio` do alvo), `incompleta`; ao chegar a `MAXIMO_FALHAS` falhas, `interrompida` e encerra.
   5. `sem-registro` ou `inexistente`: soma uma consulta vazia e gera `include-sem-registro` ou `redirect-sem-registro` (`erro`). `encontrado` sem registro SPF: o mesmo achado, mas **não** soma consulta vazia (ADR-11). Com vários: `include-com-varios-registros` ou `redirect-com-varios-registros` (`erro`). Registro inválido: `include-invalido` ou `redirect-invalido` (`erro`). Registro válido: recursão.
4. **Fechamento.** `consultas-vazias` (`erro`, `detalhe` com a quantidade) se passou de 2. `limite-de-consultas` (`erro`, `detalhe` com o total) se `total > 10`; `perto-do-limite` (`aviso`, `detalhe` com o total) se `total` de 8 a 10. Resolve o estágio (ADR-9) e junta os achados.

Exporta `lerSpfComConsultas`, `TETO_CONSULTAS` (30) e `MAXIMO_FALHAS` (3). Importa `lerSpf`, `LIMITE_CONSULTAS` e `TIPOS_QUE_CONSULTAM` de `spf.js` e `validarNomeDns` de `nome-dns.js`. Não importa `fetch`; não guarda estado fora da chamada; não registra nenhum nome percorrido (RNF-04).

## Interfaces

```js
import { consultarTxt } from "./doh.js";
import { lerSpfComConsultas } from "./spf-consultas.js";

const r = await lerSpfComConsultas("exemplo.com.br", consultarTxt);
if (r.ok) {
  // { spf: { situacao: "valido", estagio: "rigido", termos: [...], ... },
  //   estagio: "rigido",
  //   consultas: { total: 3, limite: 10, passouDoLimite: false, incompleta: false,
  //     interrompida: false,
  //     itens: [{ tipo: "include", alvo: "spf.exemplo.net", caminho: ["exemplo.com.br"] }, ...] },
  //   achados: [{ codigo: "all-rigido", gravidade: "info", dominio: "exemplo.com.br" }],
  //   resolvedores: ["cloudflare"] }
}
```

Tabela dos códigos de achado, o contrato que a spec da página consome (`dominio` só aparece nos achados vindos da caminhada):

| Código                          | Gravidade | Quando                                                                                    | `tag`      | `detalhe`    |
| ------------------------------- | --------- | ----------------------------------------------------------------------------------------- | ---------- | ------------ |
| `registro-grande-demais`        | `erro`    | candidato acima de 4096 caracteres                                                        |            |              |
| `termo-invalido`                | `erro`    | termo fora da gramática; invalida o registro                                              |            | o termo (64) |
| `modificador-repetido`          | `erro`    | `redirect` ou `exp` mais de uma vez                                                       | o nome     |              |
| `all-libera-tudo`               | `erro`    | `+all` (ou `all` sem qualificador)                                                        | `all`      |              |
| `all-neutro`                    | `aviso`   | `?all`                                                                                    | `all`      |              |
| `all-suave`                     | `info`    | `~all`                                                                                    | `all`      |              |
| `all-rigido`                    | `info`    | `-all`                                                                                    | `all`      |              |
| `sem-all`                       | `aviso`   | nem `all` nem `redirect` efetivo                                                          |            |              |
| `termos-apos-all`               | `aviso`   | diretivas depois do `all`, que o receptor ignora                                          | `all`      | quantas      |
| `redirect-ignorado`             | `aviso`   | `redirect` num registro que tem `all`                                                     | `redirect` |              |
| `ptr-em-uso`                    | `aviso`   | mecanismo `ptr`                                                                           | `ptr`      |              |
| `registro-grande`               | `aviso`   | texto acima de 512 caracteres                                                             |            | o tamanho    |
| `termo-repetido`                | `info`    | `ip4`, `ip6` ou `include` idêntico repetido                                               | o tipo     | o termo (64) |
| `caixa-fora-do-padrao`          | `info`    | maiúsculas na versão, em qualificador de modificador, em nome de mecanismo ou modificador |            |              |
| `limite-de-consultas`           | `erro`    | `total > 10` (o receptor devolve `permerror`)                                             |            | o total      |
| `perto-do-limite`               | `aviso`   | `total` de 8 a 10                                                                         |            | o total      |
| `consultas-vazias`              | `erro`    | mais de 2 consultas vazias                                                                |            | quantas      |
| `include-sem-registro`          | `erro`    | alvo do `include` sem SPF (`permerror`)                                                   | `include`  |              |
| `redirect-sem-registro`         | `erro`    | alvo do `redirect` sem SPF                                                                | `redirect` |              |
| `include-com-varios-registros`  | `erro`    | alvo do `include` com mais de um SPF                                                      | `include`  |              |
| `redirect-com-varios-registros` | `erro`    | alvo do `redirect` com mais de um SPF                                                     | `redirect` |              |
| `include-invalido`              | `erro`    | alvo do `include` com registro inválido                                                   | `include`  |              |
| `redirect-invalido`             | `erro`    | alvo do `redirect` com registro inválido                                                  | `redirect` |              |
| `ciclo`                         | `erro`    | alvo que já está no caminho                                                               | o tipo     |              |
| `consulta-falhou`               | `aviso`   | a função de consulta devolveu `ok: false`                                                 | o tipo     |              |
| `macro-nao-avaliada`            | `info`    | alvo com macro, contado e não seguido                                                     | o tipo     |              |
| `caminhada-interrompida`        | `aviso`   | parou no teto de consultas ou nas falhas                                                  |            | o total      |

## ADRs

### ADR-1 — Dois módulos: leitura pura e caminhada com consulta injetada

**Decisão.** `spf.js` lê um registro e não conhece a rede; `spf-consultas.js` caminha e recebe a função de consulta por parâmetro. A caminhada usa `lerSpf` para cada registro que encontra.
**Alternativas.** (a) Um módulo só, importando `consultarTxt`; (b) a página faz a caminhada.
**Porquê.** O RNF-01 pede a leitura pura e testável com texto montado; a injeção deixa testar ciclo, falha e teto com um mapa de respostas, sem `fetch` falso aninhado. Pôr a lógica de contagem na página a deixaria sem teste unitário e repetida para o DKIM.
**Trade-off.** Dois arquivos e um tipo (`Consulta`) que repete o formato de `consultarTxt` de forma estrutural. O `tsc` confere que `consultarTxt` cabe nele.

### ADR-2 — O registro é escolhido por `v=spf1` no começo, sem espaço antes, e vários não são desempatados

**Decisão.** Candidato é o texto que começa com `v=spf1` (qualquer caixa) seguido de espaço ou do fim. Espaço antes do `v` **não** é aceito. Com mais de um candidato: `multiplos`, e nenhum é lido.
**Alternativas.** (a) Aceitar espaço antes, como no DMARC; (b) usar o primeiro; (c) juntar os termos dos dois.
**Porquê.** A gramática do SPF não tem espaço inicial (a do DMARC tem), e a RFC 7208 manda `permerror` para dois registros. Desempatar esconderia ao dono o erro que faz o receptor ignorar o SPF dele (dois provedores, cada um pedindo seu registro, é o caso real mais comum).
**Trade-off.** Um registro com espaço antes aparece como `ausente`, que é o que um receptor estrito também enxerga.

### ADR-3 — Gramática validada termo a termo, sem expressão regular de registro inteiro

**Decisão.** O registro é dividido por espaços e cada termo é validado por uma expressão pequena, ancorada e sem repetição aninhada. O `ip6` é validado por uma função própria (grupos hexadecimais de 1 a 4 dígitos, um só `::`, quarteto IPv4 final opcional). Um erro invalida o registro todo.
**Alternativas.** (a) Uma expressão única para o registro; (b) `URL`/`net` para IP; (c) aceitar o termo torto e só avisar.
**Porquê.** Termos pequenos dão achado por termo e não têm retrocesso catastrófico (RF-06). `net.isIPv6` não existe no navegador. Aceitar o torto contrariaria a RFC (`permerror`) e esconderia que o receptor descarta o registro.
**Trade-off.** A função de IPv6 é código nosso a manter; o teste cobre os casos (`::`, `::1`, `2001:db8::/32`, `1::2::3`, quarteto IPv4, grupo com 5 dígitos).

### ADR-4 — A contagem é o pior caso

**Decisão.** Todo termo que gasta consulta e não é ignorado é contado, sem tentar casar um IP. O `redirect` é contado por último.
**Alternativas.** (a) Simular um remetente; (b) parar no primeiro mecanismo que "casaria".
**Porquê.** A ferramenta olha o registro publicado, não uma mensagem (não-objetivo dos requisitos): um receptor para quando um termo casa, então o gasto real é igual ou menor. O pior caso é o que decide se o registro **pode** quebrar, que é a pergunta do dono.
**Trade-off.** A página tem de dizer "pode usar até N consultas", nunca "usa N".

### ADR-5 — Caminhada em profundidade, sequencial, com cache por nome e detecção de ciclo pelo caminho

**Decisão.** Uma busca em profundidade, uma consulta por vez, na ordem do receptor. Cada nome é consultado no máximo uma vez (cache num `Map` dentro da chamada). Ciclo é alvo que já está **no caminho atual**; alvo repetido em ramos diferentes (diamante) não é ciclo: reusa o cache e os termos dele contam de novo.
**Alternativas.** (a) Consultas em paralelo por nível; (b) marcar todo alvo já visto como ciclo; (c) contar o termo do diamante uma vez.
**Porquê.** Sequencial dá ordem determinística (o `caminho` de cada item fica exato) e testes simples, e o custo é pequeno: cada consulta leva 30 a 120 ms nas medições da spec 002 e o teto é 30. O receptor avalia o `include` repetido de novo, então contar uma vez só subestimaria o gasto. Marcar o diamante como ciclo seria acusar erro onde não há.
**Trade-off.** No pior caso (30 consultas em série) a espera chega a poucos segundos. Paralelizar mudaria só a ordem das chamadas, não o contrato.

### ADR-6 — Um teto de 30 termos contados e 3 falhas

**Decisão.** `TETO_CONSULTAS = 30` termos contados, em todos os níveis; `MAXIMO_FALHAS = 3`. Passando de qualquer um, a caminhada para com `interrompida` e `incompleta` e o achado `caminhada-interrompida`; o `total` fica no teto.
**Alternativas.** (a) Parar no 11º termo; (b) teto separado de profundidade e de consultas de rede; (c) sem teto de falhas.
**Porquê.** Parar no 11º é a opção descartada (decisão 4 dos requisitos): o total real e o caminho ajudam a decidir o que cortar. Todo `include` ou `redirect` seguido já foi contado, então 30 termos limitam as consultas de rede (no máximo 30), a profundidade (no máximo 30) e a CPU de um registro que se repete em ramos; não é preciso um segundo teto. 30 é o triplo do limite da RFC. Três falhas (cada uma pode esperar o tempo dos dois resolvedores) limitam a espera quando a rede caiu.
**Trade-off.** Registro com mais de 30 termos mostra "30 ou mais". Para quem já passou de 10, o ponto é o mesmo.

### ADR-7 — Só TXT: `a`, `mx`, `ptr` e `exists` contam e não são resolvidos

**Decisão.** Esses termos somam 1 e não geram consulta. Os "void lookups" e os 10 endereços do `mx` ficam fora (não-objetivo).
**Alternativas.** (a) Estender a `consultarTxt` para `A` e `MX`; (b) não contar esses termos.
**Porquê.** O limite de 10 conta termos, não respostas, então a contagem fica correta sem rede. Estender a spec 002 aumentaria a carga e a superfície sem mudar o veredito do erro mais comum.
**Trade-off.** Um `a:nome-que-nao-existe` não é pego. A página diz "não verifiquei se esses nomes existem".

### ADR-8 — Macros são detectadas, nunca expandidas

**Decisão.** Alvo com `%` bem formado vira `macro: true`, sem `dominio`; conta 1 consulta, não é seguido, gera `macro-nao-avaliada` e marca `incompleta`. Alvo com `%` malformado é `termo-invalido`.
**Alternativas.** (a) Expandir com valores fictícios; (b) recusar o registro.
**Porquê.** A expansão usa o IP e o remetente de uma mensagem real, que a ferramenta não tem. Valores fictícios dariam um alvo inventado e uma consulta sem sentido. Como o texto vira consulta só depois de `validarNomeDns`, um alvo com macro nunca chega à URL.
**Trade-off.** Registros com macros (raros, usados por serviços de listas) têm a contagem marcada como incompleta.

### ADR-9 — O estágio é o do `all`, e o `redirect` entrega o do destino

**Decisão.** `lerSpf` calcula o estágio pelo primeiro `all`. Sem `all` e com `redirect` efetivo, devolve `redirecionado`, e a caminhada o troca pelo estágio do registro de destino (seguindo `redirect` encadeado). Se o destino é inválido, ausente ou em ciclo, o estágio é `nenhum`; se não foi verificado (falha, macro, teto), é `indeterminado`.
**Alternativas.** (a) Estágio só do registro digitado; (b) estágio que também considera o limite de 10.
**Porquê.** Com `redirect`, o registro do destino é que vale (RFC 6.1); mostrar `permissivo` para um domínio que redireciona a um `-all` seria falso. Misturar o limite no estágio apagaria dois fatos diferentes (o que o dono declarou e se isso funciona); a página junta os dois com `consultas.passouDoLimite`.
**Trade-off.** `estagio` pode dizer `rigido` num registro que passa do limite e, portanto, não vale; quem exibe deve olhar `passouDoLimite` junto.

### ADR-10 — Achados com `dominio`, ordem estável e lista permitida para os registros incluídos

**Decisão.** Os achados da caminhada ganham `dominio` (o registro onde foram achados). Dos registros **incluídos** (não o digitado), só entram `ptr-em-uso`, `termo-invalido`, `modificador-repetido`, `all-libera-tudo` e `registro-grande-demais`; o resto (`all-rigido`, `sem-all`, `termo-repetido`…) é ruído, porque o `all` de um registro incluído não vale para o domínio. Duplicatas (mesmo `codigo`, `dominio` e `tag`) saem. A ordem é gravidade e, dentro dela, a de geração.
**Alternativas.** (a) Todos os achados de todos os registros; (b) só os do registro digitado.
**Porquê.** O dono precisa saber de um `+all` ou de um `ptr` no provedor que ele inclui, mas não de "o provedor termina com `~all`". A lista é um contrato pequeno e testável (RF-05, ADR-3 da spec 003: achado é dado, a ordem é determinística).
**Trade-off.** Um achado novo em `spf.js` só aparece para registros incluídos se entrar na lista; o teste da lista cobre cada código.

### ADR-11 — "Consulta vazia" é resposta vazia do DNS, não registro que não é SPF

**Decisão.** Soma consulta vazia quem recebe `sem-registro` ou `inexistente` do resolvedor. Um TXT que existe mas não tem SPF (`encontrado` sem `v=spf1`) gera `include-sem-registro` e **não** soma.
**Alternativas.** (a) Somar os dois; (b) não implementar `consultas-vazias`.
**Porquê.** A RFC 4.6.4 limita consultas que voltam sem dado (ou NXDOMAIN); um TXT com dados voltou dado. Os dois casos já são `permerror` pelo `include-sem-registro`, então `consultas-vazias` só acrescenta o motivo exato quando há três ou mais alvos mortos.
**Trade-off.** O achado é raro e secundário, mas custa pouco e acompanha a RFC.

## Impacto no código existente

- `public/js/resposta-doh.js` e `public/js/nome-dns.js`: só importados, sem alteração. `public/js/doh.js`: sem alteração; `consultarTxt` já serve de função de consulta.
- `CLAUDE.md`: a seção de arquitetura ganha as linhas de `spf.js` e `spf-consultas.js`. Feito no `/atualizar-docs` de fim de sessão.
- `docs/stack.md`: nenhuma tecnologia nova (só JavaScript puro).
- README (os dois idiomas) e roadmap de `specs/README.md`: marco `v0.4` ao concluir.
- Nada muda em CI, hooks, dependências nem configuração.

## Riscos

- **Divergência entre receptores.** Cada provedor tem tolerâncias próprias (limite de consultas vazias, `ptr`, espaço inicial). A ferramenta segue a RFC 7208 e o texto da página não promete o comportamento de um receptor específico.
- **Conta que parece exata.** O pior caso (ADR-4) e as partes não verificadas (ADR-7, ADR-8) fazem o número ser um teto, não uma medida. Por isso `incompleta` existe e a página deve dizer "pode usar até".
- **Superfície de ataque da caminhada.** Um registro hostil pode apontar para si, formar ciclo, repetir-se em ramos ou apontar para centenas de alvos. As defesas são o caminho (ciclo), o cache por nome, `TETO_CONSULTAS`, `MAXIMO_FALHAS` e `validarNomeDns` em todo alvo antes de consultar; cada uma tem teste que alimenta o ataque.
- **Privacidade.** Os alvos dos `include` também chegam ao resolvedor DoH. Nada é registrado (RNF-04) e a página deve dizer isso.
- **Conteúdo hostil.** Tudo o que sai dos módulos é enumeração, número, o texto do registro, o texto de um termo (truncado) ou um nome DNS validado; entra na página só por `textContent`, regra do `CLAUDE.md`. Teste com `<script>` no registro, num termo e num alvo.
- **Desempenho.** O texto tem no máximo 4096 caracteres e a leitura é linear; teste com 2000 termos e com um registro grande cheio de espaços.

## Estratégia de testes

Todos offline, com registros sintéticos montados no teste (`exemplo.com.br`, `exemplo.net`, redes `203.0.113.0/24` e `2001:db8::/32`), seguindo a regra do `specs/README.md`. A consulta é um mapa nome → resposta, e o teste confere a lista de nomes consultados.

- **`test/spf.test.js`**
  - Escolha (RF-01): um registro entre TXT alheios; nenhum; vários; `v=spf10` e `v=spf1x` recusados; `V=SPF1` aceito com `caixa-fora-do-padrao`; espaço antes do `v` recusado; itens que não são texto.
  - Termos (RF-02): todos os mecanismos válidos com e sem qualificador; `a/24`, `mx:exemplo.net//64`, `a:exemplo.net/24//64`; espaços repetidos; cada termo inválido (`ip4:` vazio, `ip4:300.1.1.1`, `ip4:1.2.3.4/33`, `ip6:1::2::3`, `include:`, `exists`, mecanismo desconhecido, `+redirect=`, alvo de um rótulo, alvo só numérico); modificador desconhecido ignorado; `redirect` e `exp` repetidos; termos depois de `all`; `redirect` com `all`.
  - Estágio e `all` (RF-03): os quatro qualificadores; `sem-all`; `redirect` sem `all` (`redirecionado`); `redirect` com `all`; `ausente`, `multiplos` e `invalido` (`nenhum`).
  - Higiene (RF-05): `ptr-em-uso`; 513 caracteres; `ip4` repetido; `include` repetido; ordem dos achados com vários juntos.
  - Hostil (RF-06): `<script>` no registro, num termo e num alvo (texto intacto em `registro`, alvo recusado); 2000 termos em tempo curto; candidato de 5000 caracteres; nenhuma entrada lança.
- **`test/spf-consultas.test.js`**
  - Contagem (RF-04): cada tipo de termo soma 1; `all`, `ip4`, `ip6`, `exp` não somam; termos depois de `all` e `redirect` ignorado não somam; `include` em vários níveis com `caminho` exato; `redirect` contado por último; 10 e 11 termos; 8 a 10 (`perto-do-limite`); diamante conta duas vezes e consulta uma.
  - Alvos (RF-04): `include` e `redirect` sem registro, com vários, inválido; `encontrado` sem SPF não soma consulta vazia; 2 e 3 consultas vazias; achados dos registros incluídos (a lista do ADR-10, com `dominio`).
  - Ciclo e falha (RF-04): A→B→A; registro que inclui o próprio domínio; `ok: false` no meio da caminhada (o resto continua, `incompleta`); 3 falhas encerram; falha no domínio digitado devolve `{ ok: false }`.
  - Macro (RF-04): conta, não é seguida, `incompleta`; `%` malformado é `termo-invalido`.
  - Teto e hostil (RF-06): registro que inclui 100 alvos; cadeia de 40; diamantes que dariam milhares de contagens param em 30; nenhum nome consultado duas vezes; alvo com caracteres de URL (`a&b=c`) nunca chega à função de consulta; estágio por `redirect` (destino rígido, inválido, ausente, não verificado, em ciclo); `resolvedores` sem repetição.
- O portão (`format:check`, `lint`, `typecheck`, `test`) é a última tarefa de cada etapa.

## Rastreabilidade

| Requisito | Onde é atendido                                                                     |
| --------- | ----------------------------------------------------------------------------------- |
| RF-01     | `lerSpf` (1, 2), ADR-2                                                              |
| RF-02     | `lerSpf` (4, 5), gramática de termo, ADR-3                                          |
| RF-03     | `lerSpf` (6), `lerSpfComConsultas` (4), ADR-9                                       |
| RF-04     | `lerSpfComConsultas`, ADR-4 a ADR-8, ADR-10, ADR-11                                 |
| RF-05     | `lerSpf` (7, 8), tabela de códigos, ADR-10                                          |
| RF-06     | `lerSpf` (1, 3), `lerSpfComConsultas` (1, 3), gramática (alvo), ADR-3, ADR-5, ADR-6 |
| RNF-01    | ADR-1                                                                               |
| RNF-02    | uniões discriminadas, `lerSpfComConsultas` (1, 3)                                   |
| RNF-03    | estratégia de testes                                                                |
| RNF-04    | `lerSpfComConsultas` (sem registro de nomes), `resolvedores`, riscos                |
| RNF-05    | só `package.json` sem `dependencies`; módulos importam só código do projeto         |
| RNF-06    | ADR-10, tabela de códigos                                                           |
