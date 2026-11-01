---
feature: Consulta DoH — buscar registros TXT de um nome por DNS-over-HTTPS, com fallback
status: concluído
date: 2026-10-31
related: [001-fundacao]
origin: conception
---

# 002 — Consulta DoH — design

## Visão geral da abordagem

A consulta é dividida em três módulos pequenos, cada um com um dono só, na mesma separação que a fundação estabeleceu: o que decide algo é puro, o que toca a rede é fino.

1. **`nome-dns.js`** (puro) decide se um texto é um nome DNS que pode virar consulta. É a defesa em profundidade do RF-05: o chamador monta o nome, mas o módulo da consulta não confia nisso.
2. **`resposta-doh.js`** (puro) transforma o JSON de um resolvedor em um valor: situação e lista de textos, ou falha. É onde moram as diferenças entre Cloudflare e Google, de modo que tudo o que vem depois recebe o mesmo formato.
3. **`doh.js`** (fino) monta a URL, chama o `fetch` com tempo limite e privacidade, aplica o fallback e junta tudo em `consultarTxt`.

O resultado é sempre um valor, nunca uma exceção: rede fora do ar, resposta torta e domínio inexistente são casos comuns da página, e o `tsc` em `strict` obriga o chamador a tratar cada ramo. O `fetch` entra por parâmetro, então a suíte inteira roda sem rede.

## Layout de módulos / componentes

```text
public/js/nome-dns.js          # RF-05: valida o nome antes de qualquer rede
public/js/resposta-doh.js      # RF-01, RF-02, RF-03, RF-06: JSON do resolvedor → resultado
public/js/doh.js               # RF-01, RF-04, RF-05, RF-07, RNF-01, RNF-02: a consulta
public/js/dominio.js           # muda pouco: passa a exportar os dois limites do DNS (ADR-8)
test/nome-dns.test.js          # RF-05
test/resposta-doh.test.js      # RF-02, RF-03, RF-06
test/doh.test.js               # RF-01, RF-04, RF-05, RF-07
```

Nenhum arquivo de configuração muda: `tsc`, ESLint e o runner já cobrem `public/js/` e `test/`.

## Modelo de dados

```js
/** @typedef {"cloudflare" | "google"} Resolvedor */
/** @typedef {"encontrado" | "sem-registro" | "inexistente"} Situacao */

/** Leitura de uma resposta de um resolvedor (sai de resposta-doh.js). */
/** @typedef {{ ok: true, situacao: Situacao, registros: string[] } | { ok: false, motivo: string }} RespostaLida */

/** Resultado final da consulta (sai de doh.js). */
/** @typedef {{ ok: true, situacao: Situacao, registros: string[], resolvedor: Resolvedor } | { ok: false, motivo: string }} ResultadoTxt */
```

| Campo        | Tipo         | Quando existe | Conteúdo                                                                    |
| ------------ | ------------ | ------------- | --------------------------------------------------------------------------- |
| `ok`         | `boolean`    | sempre        | discriminante: `true` houve resposta definitiva, `false` não foi possível   |
| `situacao`   | `Situacao`   | `ok: true`    | `encontrado`, `sem-registro` ou `inexistente`                               |
| `registros`  | `string[]`   | `ok: true`    | textos TXT já sem aspas e com os pedaços juntos; vazio fora de `encontrado` |
| `resolvedor` | `Resolvedor` | `ok: true`    | quem respondeu, para a página dizer quem viu o domínio                      |
| `motivo`     | `string`     | `ok: false`   | explicação em português, própria para mostrar ao visitante                  |

`RespostaLida` não tem `resolvedor` de propósito: quem leu a resposta já sabe de qual resolvedor veio, e `consultarTxt` carimba o resultado final.

## Componentes

### `validarNomeDns` (`public/js/nome-dns.js`)

Recebe texto e devolve `{ ok: true, nome } | { ok: false, motivo }`. Em ordem:

1. recusa vazio, nome acima de 253 caracteres e qualquer caractere fora de `a-z`, `A-Z`, `0-9`, hífen, sublinhado e ponto (o que cobre `& = ? # / % :` e espaço);
2. divide por ponto e recusa rótulo vazio (`a..b`) ou com mais de 63 caracteres;
3. aceita um ponto final único, que descarta, e devolve o nome em minúsculas.

Diferente de `normalizarDominio`, aceita sublinhado (`_dmarc`, `_domainkey`) e não exige dois rótulos nem recusa IP: o nome já foi montado pela ferramenta a partir de um domínio normalizado, e esta camada só garante que ele é seguro de pôr numa URL. Atende RF-05.

### `lerResposta` (`public/js/resposta-doh.js`)

Recebe o JSON já decodificado (tipo `unknown`) e o `Resolvedor`, e devolve `RespostaLida`. Em ordem:

1. **Forma.** Se não é objeto, ou `Status` não é inteiro, é falha (aciona o fallback). Atende RF-06.
2. **Situação.** `Status` 3 devolve `inexistente` com `registros` vazio, sem olhar o `Answer`. `Status` diferente de 0 e de 3 (FORMERR, SERVFAIL, NOTIMP, REFUSED…) é falha. `Status` 0 segue. Atende RF-02, RF-04.
3. **Registros.** Com `Status` 0, `Answer` ausente conta como vazio; `Answer` que existe e não é lista é falha. Percorre o `Answer` e guarda o texto de cada item com `type === 16` e `data` string, na ordem; ignora CNAME e qualquer outro tipo. Atende RF-01, RF-06.
4. **Texto.** Aplica `textoDoRegistro(data, resolvedor)` (ADR-4). Descarta o item cujo texto passa de 4096 caracteres ou cujo `data` bruto passa de 8192, e para no 50º registro guardado. Atende RF-03, RF-06.
5. **Desfecho.** Com ao menos um registro, `encontrado`; sem nenhum, `sem-registro`. Atende RF-02.

Exporta `lerResposta` e, para teste direto, `textoDoRegistro`. Constantes do módulo: `MAXIMO_REGISTROS = 50`, `MAXIMO_TEXTO = 4096`, `MAXIMO_TEXTO_BRUTO = 8192`.

### `consultarTxt` (`public/js/doh.js`)

Assinatura: `consultarTxt(nome, { buscar, tempoLimiteMs } = {})`, devolvendo `Promise<ResultadoTxt>`. Em ordem:

1. Valida o nome com `validarNomeDns`; se recusado, devolve `{ ok: false, motivo }` sem chamar `buscar`. Atende RF-05.
2. Percorre a lista fixa de resolvedores (Cloudflare, depois Google). Para cada um, `consultarUm`: monta a URL com `new URL` e `searchParams` (`name`, `type=TXT`), chama `buscar` com as opções do ADR-7 e um `AbortSignal.timeout`, exige HTTP 2xx, decodifica o JSON e entrega a `lerResposta`. Qualquer exceção (rede, tempo, JSON inválido) vira falha, nunca sobe. Atende RF-01, RF-04, RF-06, RF-07.
3. A primeira leitura `ok` encerra o laço e devolve o resultado com `resolvedor`. Se o primeiro respondeu `inexistente` ou `sem-registro`, o segundo não é consultado. Atende RF-04.
4. Se todos falharam, devolve um `motivo` único em português. O motivo de cada tentativa não é exposto: o visitante não precisa distinguir "tempo esgotado" de "JSON torto", e o que a página diz é o mesmo nos dois casos. Atende RF-04.

`buscar` tem como padrão uma função que chama o `fetch` global **na hora da chamada** (`(...args) => fetch(...args)`), para o teste poder substituir e para não perder o `this` do `fetch`. `tempoLimiteMs` tem como padrão 5000 (ADR-5). O módulo não importa nada além de `nome-dns.js` e `resposta-doh.js`, não lê `document` nem `window` e não guarda estado entre chamadas. Atende RNF-02, RNF-03, RNF-04.

## Interfaces

```js
import { consultarTxt } from "./doh.js";

const r = await consultarTxt("_dmarc.exemplo.com.br");
// { ok: true, situacao: "encontrado", registros: ["v=DMARC1; p=none"], resolvedor: "cloudflare" }
// { ok: true, situacao: "sem-registro", registros: [], resolvedor: "cloudflare" }
// { ok: true, situacao: "inexistente",  registros: [], resolvedor: "google" }
// { ok: false, motivo: "Não consegui consultar o DNS agora. ..." }
```

Contrato da requisição, igual nos dois resolvedores:

| Resolvedor | URL base                               | Parâmetros             | Cabeçalho                      |
| ---------- | -------------------------------------- | ---------------------- | ------------------------------ |
| Cloudflare | `https://cloudflare-dns.com/dns-query` | `name=<nome>&type=TXT` | `accept: application/dns-json` |
| Google     | `https://dns.google/resolve`           | `name=<nome>&type=TXT` | `accept: application/dns-json` |

Opções do `fetch`: `method: "GET"`, `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `redirect: "error"`, `signal`. Os motivos em português ficam como constantes do módulo.

## ADRs

### ADR-1 — Cloudflare primeiro, Google como fallback

**Decisão.** A lista de resolvedores é fixa e ordenada: Cloudflare, depois Google. O fallback só dispara por falha do resolvedor: erro de rede, tempo esgotado, HTTP fora de 2xx, corpo inválido, forma inesperada, e `Status` diferente de 0 e 3. NXDOMAIN e NOERROR sem registro são respostas definitivas e não disparam fallback.
**Alternativas.** (a) Consultar os dois em paralelo e usar o mais rápido; (b) escolher o resolvedor por sorteio; (c) fallback também em NXDOMAIN.
**Porquê.** A ordem vem da decisão da Fase 0 e as duas medições de CORS mostraram que os dois servem o navegador. Em paralelo dobraria o número de resolvedores que veem cada domínio, contra a promessa de privacidade (quanto menos gente vê o domínio, melhor). NXDOMAIN é um fato do DNS, não uma falha do resolvedor: repetir a consulta no segundo só atrasaria a resposta.
**Trade-off.** Um resolvedor lento mas vivo (acima do tempo limite) atrasa a consulta até o fallback. SERVFAIL real do domínio (DNSSEC quebrado, por exemplo) gera uma segunda consulta inútil. Aceitável: é um caso raro e custa uma consulta.

### ADR-2 — Resultado como união discriminada, sem exceção

**Decisão.** `consultarTxt` nunca rejeita a promessa por causa de rede ou de resposta; devolve `ResultadoTxt`. Só parâmetro de tipo errado (programação) pode lançar.
**Alternativas.** (a) Lançar `Error` por falha e deixar a página usar `try/catch`; (b) devolver `null` em falha.
**Porquê.** Mesma escolha do `normalizarDominio`: falha de consulta é o caso comum, e o `tsc` obriga o chamador a tratar o ramo `ok: false`. Mantém RNF-05.
**Trade-off.** Cada chamador escreve um `if (!r.ok)`. É o custo desejado.

### ADR-3 — Três módulos em vez de um

**Decisão.** `nome-dns.js`, `resposta-doh.js` e `doh.js`, com a lógica pura nos dois primeiros.
**Alternativas.** (a) Um `doh.js` com tudo; (b) dois módulos, deixando a validação do nome em `doh.js`.
**Porquê.** RNF-03 pede a leitura da resposta pura e testável com JSON montado. A validação do nome também é pura e será reaproveitada: o DKIM e o DMARC montam nomes e podem querer validar antes de chamar. Três arquivos de uma responsabilidade cada leem melhor que um de 200 linhas.
**Trade-off.** Mais arquivos e três testes em vez de um.

### ADR-4 — Aspas só são removidas para a Cloudflare

**Decisão.** `textoDoRegistro(data, resolvedor)`: para `google`, o texto é `data` como veio. Para `cloudflare`, se `data` inteiro tem a forma de uma ou mais strings entre aspas separadas por espaço (`"a"` ou `"a" "b"`), os conteúdos são juntos sem separador; se não tem essa forma, o texto é `data` como veio. O conteúdo de cada pedaço é preservado sem desfazer escape.
**Alternativas.** (a) Remover aspas das pontas de qualquer resposta; (b) interpretar a sintaxe completa de apresentação do DNS (escapes `\"`, `\\`, `\DDD`).
**Porquê.** O Google já entrega o texto limpo, e um registro que de fato comece e termine com aspas ficaria corrompido se tirássemos as aspas dele por engano, por isso o `resolvedor` entra na decisão. Para a Cloudflare, o casamento é feito por expressão regular linear (`"((?:[^"\\]|\\.)*)"`, alternativas disjuntas, sem retrocesso catastrófico) varrendo a string inteira e recusando a forma se sobrar texto fora das aspas. Desfazer escapes seria inventar uma regra sem medida: DMARC, SPF e DKIM praticamente não têm aspas nem barra invertida no valor.
**Trade-off.** Um TXT da Cloudflare com `\"` dentro mostra a barra no texto. Registro de e-mail raramente tem isso; se aparecer um caso real, vira teste e regra nova. A forma inesperada cai no "como veio" em vez de sumir, porque exibir o texto cru (sempre via `textContent`) é mais honesto que esconder um registro.

### ADR-5 — Tempo limite com `AbortSignal.timeout`, injetável

**Decisão.** Cada consulta a um resolvedor usa `AbortSignal.timeout(tempoLimiteMs)`, com 5000 ms por padrão, cobrindo a requisição **e** a leitura do corpo. O pior caso de uma consulta é a soma dos dois: 10 segundos.
**Alternativas.** (a) `AbortController` com `setTimeout` manual; (b) um tempo para a consulta inteira; (c) sem tempo limite.
**Porquê.** As medições deram de 30 a 120 ms, então 5 s é uma folga de dezenas de vezes que ainda corta o resolvedor travado. `AbortSignal.timeout` existe nos navegadores atuais e no Node 26, não deixa temporizador pendente e rejeita com `TimeoutError`, que cai na mesma captura das demais falhas. Um tempo por resolvedor (e não pela consulta toda) dá ao fallback a chance real de responder. O parâmetro permite o teste usar poucos milissegundos com um `buscar` falso que obedece ao sinal, sem relógio falso.
**Trade-off.** No pior caso (os dois resolvedores travados) o visitante espera 10 s antes do erro. A página mostra o estado "consultando" nesse intervalo (spec da página).

### ADR-6 — Limites de registros e de tamanho

**Decisão.** No máximo 50 registros por consulta e 4096 caracteres por registro depois de juntos; o `data` bruto passa antes por um corte de 8192. O que passa do limite é descartado, sem erro.
**Alternativas.** (a) Sem limite; (b) truncar o texto em vez de descartar; (c) falhar a consulta inteira quando algo passar.
**Porquê.** Um domínio hostil escolhe o que o DNS dele responde, e a mensagem DNS já é limitada pelo protocolo a cerca de 64 KB, então o pior caso é pequeno, mas a página não deve renderizar centenas de linhas por causa disso. Truncar produziria um registro cortado no meio que o parser poderia ler errado; descartar é inequívoco. O corte bruto evita rodar a expressão regular sobre uma entrada enorme.
**Trade-off.** Um registro legítimo acima de 4096 caracteres some da análise. SPF e DMARC cabem com folga; um DKIM de 4096 bits ocupa cerca de 800 caracteres.

### ADR-7 — Opções do `fetch` para a privacidade

**Decisão.** `credentials: "omit"`, `referrerPolicy: "no-referrer"` e `redirect: "error"`, mais o `accept: application/dns-json`. Nenhum cabeçalho personalizado além do `accept`.
**Alternativas.** (a) Padrões do `fetch`; (b) `cache: "no-store"`.
**Porquê.** Os padrões já não enviam cookie a outra origem nem o caminho do `Referer`, mas dizer explicitamente é o que o teste do RF-07 pode afirmar, e protege contra mudança de padrão. `redirect: "error"` impede que um resolvedor comprometido ou mal configurado redirecione a consulta para um terceiro. O `accept` é um cabeçalho que o CORS já trata como seguro, então a consulta é um GET simples, sem preflight (e as medições mostraram que os dois resolvedores também respondem ao preflight, se um dia ele for necessário). O cache fica no padrão do navegador: respeitar o TTL do DNS é correto, e uma segunda consulta ao mesmo nome logo em seguida é a página refazendo a análise, não um vazamento.
**Trade-off.** `redirect: "error"` transforma um redirecionamento legítimo futuro de um resolvedor em falha (e portanto em fallback). Aceitável: os endereços fixos de DoH não redirecionam.

### ADR-8 — Os limites do DNS vêm de um lugar só

**Decisão.** `dominio.js` passa a exportar `TAMANHO_MAXIMO_ROTULO` e `TAMANHO_MAXIMO_DOMINIO`, e `nome-dns.js` os importa.
**Alternativas.** (a) Repetir 63 e 253 em `nome-dns.js`; (b) mover as constantes para um terceiro módulo.
**Porquê.** São duas constantes da RFC 1035 que devem valer igual nos dois validadores; um terceiro módulo para duas linhas seria cerimônia. Exportar o que já existe é a menor mudança.
**Trade-off.** `nome-dns.js` passa a depender de `dominio.js`; a dependência é de constantes, não de comportamento, e o `dominio.js` continua puro (RF-03 da fundação).

### ADR-9 — CNAME ignorado por tipo, sem conferir o nome

**Decisão.** Um item do `Answer` conta como registro se `type === 16` e `data` é string; o campo `name` não é conferido.
**Alternativas.** (a) Exigir que `name` seja igual ao nome consultado; (b) seguir a cadeia de CNAME manualmente.
**Porquê.** O resolvedor já resolve o CNAME e devolve o TXT do alvo com o nome do alvo, então conferir o nome derrubaria exatamente o caso comum do DKIM. A cadeia é problema do resolvedor, não nosso.
**Trade-off.** Confiamos em que o resolvedor só devolve no `Answer` o que responde à pergunta. Uma resposta adulterada já derrotaria qualquer conferência feita no cliente, porque a integridade vem do HTTPS até o resolvedor.

## Impacto no código existente

- `public/js/dominio.js`: acrescenta `export` a duas constantes (ADR-8). Nenhum comportamento muda; `test/dominio.test.js` continua passando sem alteração.
- `CLAUDE.md`: a seção de arquitetura ganha as três linhas dos módulos novos. Feito no `/atualizar-docs` de fim de sessão.
- `docs/stack.md`: acrescenta `fetch`, `AbortSignal.timeout` e DNS-over-HTTPS (JSON) à stack.
- Nada muda em CI, hooks, dependências nem configuração.

## Riscos

- **Formato dos resolvedores muda.** Os dois são APIs de produção, mas a forma do `data` já difere entre eles. Mitigação: o formato de cada um é um teste com resposta montada; mudança vira teste que falha no CI, não bug em produção silencioso.
- **Limite de taxa de longo prazo.** Medido só até 200 consultas em rajada, sem 429. A spec do DKIM (dezenas de consultas por análise) controla a concorrência; esta spec garante que um 429 vira falha e aciona o fallback (HTTP fora de 2xx).
- **Escape no TXT da Cloudflare.** Não há medição do que ela faz com uma aspas dentro do registro (ADR-4). Impacto baixo; se um caso aparecer, é um teste e uma regra.
- **Bloqueio por rede corporativa.** Redes que bloqueiam DoH fazem as duas tentativas falharem; a mensagem de falha manda conferir a conexão e a página não consegue fazer mais que isso.

## Estratégia de testes

Todos offline, com respostas sintéticas montadas no teste (`exemplo.com.br`, `v=DMARC1; p=none`), seguindo a regra do `specs/README.md`.

- **`test/nome-dns.test.js`** — tabela de nomes aceitos (`_dmarc.exemplo.com.br`, `seletor1._domainkey.exemplo.com.br`, maiúsculas, ponto final) e recusados (vazio, espaço, `&`, `=`, `?`, `#`, `/`, `%`, `:`, `a..b`, rótulo de 64, nome de 254). Entrada hostil: `exemplo.com&name=outro.com` recusado. RF-05.
- **`test/resposta-doh.test.js`** — uma resposta por caso: formato Cloudflare (aspas, dois pedaços), formato Google (sem aspas, `name` com ponto final), os dois produzindo o mesmo `registros`; CNAME misturado com TXT; `Status` 0 sem `Answer` e com `Answer: []`; `Status` 3 com e sem `Answer`; `Status` 2 e 5 como falha; não-objeto, `Status` ausente ou texto, `Answer` que não é lista; item sem `data`; 60 registros devolvem 50; texto de 5000 descartado; TXT com `<script>` devolvido intacto como texto. RF-02, RF-03, RF-06.
- **`test/doh.test.js`** — `buscar` falso que registra URL e opções: caminho feliz na Cloudflare sem tocar o Google; `TypeError` com resposta do Google; tempo esgotado (tempo de 10 ms e `buscar` que obedece ao sinal); HTTP 500; corpo que não é JSON; `Status` 2; sem fallback em `Status` 3 e em `sem-registro`; falha dos dois; nome mal formado sem nenhuma chamada a `buscar`; nome com `&` não vira parâmetro (a URL tem exatamente `name` e `type`); opções de privacidade presentes. RF-01, RF-04, RF-05, RF-07.
- O portão (`format:check`, `lint`, `typecheck`, `test`) é a última tarefa de cada etapa.

## Rastreabilidade

| Requisito | Onde é atendido                             |
| --------- | ------------------------------------------- |
| RF-01     | `consultarTxt`, `lerResposta` (3), ADR-9    |
| RF-02     | `lerResposta` (2, 5), ADR-1                 |
| RF-03     | `textoDoRegistro`, ADR-4                    |
| RF-04     | `consultarTxt` (2 a 4), ADR-1               |
| RF-05     | `validarNomeDns`, `consultarTxt` (1), ADR-8 |
| RF-06     | `lerResposta` (1, 3, 4), ADR-6              |
| RF-07     | opções do `fetch`, ADR-7                    |
| RNF-01    | ADR-5                                       |
| RNF-02    | parâmetro `buscar`, estratégia de testes    |
| RNF-03    | ADR-3                                       |
| RNF-04    | `doh.js` sem importar pacote                |
| RNF-05    | ADR-2                                       |
