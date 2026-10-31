---
feature: Parser DMARC — escolher o registro DMARC entre os TXT de `_dmarc.<domínio>`, lê-lo e apontar os achados
status: aprovado
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh]
origin: conception
---

# 003 — Parser DMARC — design

## Visão geral da abordagem

Um módulo puro, `dmarc.js`, com uma função de entrada, `lerDmarc`, que recebe a lista de textos que a spec 002 entregou e devolve um valor descrevendo o que há ali. Sem DOM, sem rede, sem relógio: mesma entrada, mesma saída, como `nome-dns.js` e `resposta-doh.js`.

A leitura segue quatro passos, sempre nesta ordem:

1. **Escolher o registro** entre os textos (RFC 7489, 6.6.3): só conta quem começa com `v=DMARC1`. Zero candidatos é `ausente`; dois ou mais é `multiplos`, e nenhum deles é lido.
2. **Dividir em tags** (`tag=valor` separadas por `;`), com a primeira ocorrência valendo e o resto virando achado.
3. **Interpretar cada tag conhecida** com o valor padrão da RFC quando ausente ou inválida.
4. **Derivar o estágio e os achados** de política, `pct`, `sp` e `rua`.

O resultado é uma união discriminada por `situacao`, sem exceção: o `tsc` em `strict` obriga a página a tratar cada ramo. Os achados são dados (`codigo`, `gravidade`, `tag`, `detalhe`), nunca frases: o português é da spec da página (RNF-05).

Feature sem interface: não há mockup nesta spec.

## Layout de módulos / componentes

```text
public/js/dmarc.js             # RF-01 a RF-06: escolher, ler e apontar achados (puro)
public/js/resposta-doh.js      # muda pouco: já exporta MAXIMO_TEXTO; nada a alterar (ADR-8)
public/js/nome-dns.js          # reaproveitado: valida o domínio dos endereços de rua/ruf (ADR-7)
test/dmarc.test.js             # RF-01 a RF-06
```

Nenhum arquivo de configuração muda: `tsc`, ESLint e o runner já cobrem `public/js/` e `test/`.

## Modelo de dados

```js
/** @typedef {"none" | "quarantine" | "reject"} Politica */
/** @typedef {"nenhum" | Politica} Estagio */
/** @typedef {"erro" | "aviso" | "info"} Gravidade */

/** Algo notável no registro; o texto em português é da página. */
/** @typedef {{ codigo: string, gravidade: Gravidade, tag?: string, detalhe?: number }} Achado */

/** Um endereço de relatório: `mailto:a@exemplo.com.br!10m`. */
/** @typedef {{ endereco: string, tamanhoMaximo?: string }} DestinoRelatorio */

/** @typedef {{
 *   situacao: "valido",
 *   registro: string, estagio: Politica, politica: Politica, subdominios: Politica,
 *   alinhamentoDkim: "r" | "s", alinhamentoSpf: "r" | "s", porcentagem: number,
 *   opcoesFalha: string[], formatos: string[], intervaloSegundos: number,
 *   rua: DestinoRelatorio[], ruf: DestinoRelatorio[],
 *   padrao: string[], achados: Achado[]
 * }} DmarcValido */
/** @typedef {{ situacao: "invalido", registro: string, estagio: "nenhum", achados: Achado[] }} DmarcInvalido */
/** @typedef {{ situacao: "multiplos", quantidade: number, estagio: "nenhum" }} DmarcMultiplos */
/** @typedef {{ situacao: "ausente", estagio: "nenhum" }} DmarcAusente */
/** @typedef {DmarcValido | DmarcInvalido | DmarcMultiplos | DmarcAusente} ResultadoDmarc */
```

| Campo               | Existe em            | Conteúdo                                                                                                    |
| ------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `situacao`          | sempre               | discriminante: `valido`, `invalido`, `multiplos` ou `ausente`                                               |
| `estagio`           | sempre               | degrau da escada; `nenhum` fora de `valido`, e a própria política em `valido`                               |
| `registro`          | `valido`, `invalido` | o texto escolhido, para a página mostrar com `textContent`                                                  |
| `politica`          | `valido`             | `p` efetivo (`none` quando `p` faltou e a `rua` salvou o registro)                                          |
| `subdominios`       | `valido`             | `sp` efetivo; igual a `politica` quando `sp` falta ou é inválido                                            |
| `porcentagem`       | `valido`             | `pct` de 0 a 100 (padrão 100)                                                                               |
| `opcoesFalha`       | `valido`             | `fo` em lista de `0`, `1`, `d`, `s` (padrão `["0"]`)                                                        |
| `formatos`          | `valido`             | `rf` em lista (padrão `["afrf"]`)                                                                           |
| `intervaloSegundos` | `valido`             | `ri` (padrão 86400)                                                                                         |
| `rua`, `ruf`        | `valido`             | destinos válidos, no máximo 20 cada; vazio quando a tag falta                                               |
| `padrao`            | `valido`             | nomes das tags que ficaram com o valor padrão (ausentes ou inválidas), para a página dizer "padrão" ao lado |
| `achados`           | `valido`, `invalido` | lista ordenada (ADR-3)                                                                                      |
| `quantidade`        | `multiplos`          | quantos registros DMARC apareceram                                                                          |

`ausente` e `multiplos` não têm `achados`: a `situacao` já diz tudo, e a página escreve o texto de cada uma.

## Componentes

### `lerDmarc` (`public/js/dmarc.js`)

Recebe a lista de textos (`readonly unknown[]`) e devolve `ResultadoDmarc`. Em ordem:

1. **Entrada.** O que não é lista vira lista vazia; o que não é texto é descartado. O módulo não confia que a camada de baixo filtrou. Atende RF-06.
2. **Candidatos.** Fica quem casa com `^[ \t]*[vV][ \t]*=[ \t]*DMARC1[ \t]*(?:;|$)` (o valor `DMARC1` exato, seguido de `;` ou do fim). Nenhum candidato: `ausente`. Dois ou mais: `multiplos` com a `quantidade`. Os outros TXT (verificação de domínio, por exemplo) são ignorados sem achado. Atende RF-01.
3. **Tamanho.** Um único candidato com mais de `MAXIMO_TEXTO` (4096) caracteres vira `invalido` com o achado `registro-grande-demais`, sem ler as tags. Atende RF-06, ADR-8.
4. **Tags.** Divide por `;`, descarta pedaço vazio, e em cada pedaço separa no **primeiro** `=` (ADR-9). O nome sai sem espaços e em minúsculas; o valor, sem espaços nas pontas. Tag conhecida repetida: vale a primeira, e `tag-duplicada` é registrado uma vez por tag. Tag desconhecida é ignorada sem achado. Atende RF-02.
5. **Cada tag conhecida**, na ordem fixa `p`, `sp`, `adkim`, `aspf`, `pct`, `fo`, `rf`, `ri`, `rua`, `ruf`, com o valor padrão da RFC se ausente ou inválida (a inválida acrescenta `valor-invalido` com o nome da tag). Atende RF-02, RF-03, RF-04.
6. **Política.** Decidida depois de ler `rua` (ADR-5): `p` válido vale; `p` ausente com `rua` válido vira `none` com `politica-ausente` (`aviso`); `p` ausente sem `rua` válido é `invalido` com `politica-ausente` (`erro`); `p` presente e fora dos três valores é `invalido` com `politica-invalida`. Atende RF-03.
7. **Achados derivados** (RF-05): `monitoramento-apenas` se `politica` é `none`; `aplicacao-parcial` com `detalhe` igual ao `pct` se a política não é `none` e `pct < 100`; `subdominios-mais-fracos` se o degrau de `sp` é menor que o de `p` (`none` < `quarantine` < `reject`); `sem-relatorio-agregado` se `rua` ficou sem destino válido; `caixa-fora-do-padrao` (`info`) se algum nome de tag ou o valor de `p`, `sp`, `adkim` ou `aspf` tinha letra maiúscula (ADR-6). Atende RF-05.
8. **Ordem.** Os achados saem ordenados por gravidade (`erro`, `aviso`, `info`) e, dentro dela, na ordem em que foram gerados; a ordem de geração é fixa (estrutura, depois cada tag na ordem do passo 5, depois os derivados). Atende RF-05.

Exporta `lerDmarc` e, para teste direto, `lerDestinos`. Constantes do módulo: `MAXIMO_DESTINOS = 20`. Importa `MAXIMO_TEXTO` de `resposta-doh.js` e `validarNomeDns` de `nome-dns.js`. Não lê `document` nem `window` e não guarda estado entre chamadas.

### `lerDestinos` (interna, exportada para teste)

Recebe o valor de `rua` ou `ruf` e devolve `{ destinos, descartados }`. Divide por vírgula e, para cada item aparado, exige a forma `mailto:<usuário>@<domínio>` com tamanho opcional `!<número><k|m|g|t>`:

- esquema `mailto:` em qualquer caixa;
- usuário de 1 a 64 caracteres, sem espaço, `@`, `<`, `>`, `"`, `,`, `;` nem `!`;
- domínio aceito por `validarNomeDns` **e** com ao menos dois rótulos (`exemplo.com.br`, nunca `localhost`);
- endereço inteiro de até 254 caracteres;
- percent-encoding **não** é decodificado: o endereço é guardado como veio.

O item que não tem essa forma, o vazio e tudo o que passa do 20º destino válido entram na contagem de `descartados`, que vira o `detalhe` do achado `endereco-invalido`. Atende RF-04, RF-06.

## Interfaces

```js
import { consultarTxt } from "./doh.js";
import { lerDmarc } from "./dmarc.js";

const r = await consultarTxt("_dmarc.exemplo.com.br");
if (r.ok) {
  const dmarc = lerDmarc(r.registros);
  // { situacao: "valido", estagio: "none", politica: "none", subdominios: "none",
  //   porcentagem: 100, rua: [{ endereco: "dmarc@exemplo.com.br" }], ruf: [],
  //   padrao: ["adkim", "aspf", "pct", "fo", "rf", "ri", "ruf", "sp"],
  //   achados: [{ codigo: "monitoramento-apenas", gravidade: "aviso" }], ... }
}
```

Tabela dos códigos de achado, o contrato que a spec da página consome:

| Código                    | Gravidade      | Quando                                                                 | `tag` | `detalhe`             |
| ------------------------- | -------------- | ---------------------------------------------------------------------- | ----- | --------------------- |
| `registro-grande-demais`  | `erro`         | candidato acima de 4096 caracteres                                     |       |                       |
| `politica-ausente`        | `erro`/`aviso` | sem `p`; `aviso` se a `rua` válida o salva (vale `none`), senão `erro` | `p`   |                       |
| `politica-invalida`       | `erro`         | `p` fora de `none`, `quarantine`, `reject`                             | `p`   |                       |
| `tag-duplicada`           | `aviso`        | tag conhecida repetida; vale a primeira                                | a tag |                       |
| `valor-invalido`          | `aviso`        | valor de tag opcional inválido; usa o padrão                           | a tag |                       |
| `endereco-invalido`       | `aviso`        | itens de `rua`/`ruf` descartados (inválidos ou acima do limite)        | a tag | quantidade descartada |
| `sem-relatorio-agregado`  | `aviso`        | `rua` ausente ou sem destino válido                                    | `rua` |                       |
| `monitoramento-apenas`    | `aviso`        | política efetiva `none`                                                | `p`   |                       |
| `aplicacao-parcial`       | `aviso`        | `quarantine` ou `reject` com `pct < 100`                               | `pct` | o `pct`               |
| `subdominios-mais-fracos` | `aviso`        | `sp` abaixo de `p` na escada                                           | `sp`  |                       |
| `caixa-fora-do-padrao`    | `info`         | maiúsculas em nome de tag ou valor de `p`, `sp`, `adkim`, `aspf`       |       |                       |

## ADRs

### ADR-1 — Um módulo, uma função de entrada

**Decisão.** Tudo fica em `dmarc.js`, com `lerDmarc` como entrada e `lerDestinos` como auxiliar exportada só para teste.
**Alternativas.** (a) Separar o tokenizador de `tag=valor` num módulo reutilizável pelo SPF; (b) um módulo por tag.
**Porquê.** O formato do SPF é outro (termos separados por espaço, com qualificadores), então o tokenizador não seria reaproveitado. Um arquivo de uma responsabilidade (ler DMARC) lê melhor que vários de dez linhas.
**Trade-off.** O arquivo passa de 200 linhas; as seções comentadas (candidatos, tags, destinos, achados) mantêm a leitura.

### ADR-2 — O registro é escolhido pelo começo `v=DMARC1`, e vários registros não são desempatados

**Decisão.** Candidato é o texto que começa com `v=DMARC1` (tag `v` em qualquer caixa, valor exato, seguido de `;` ou do fim). Com mais de um candidato, `situacao: "multiplos"` e nenhum é lido.
**Alternativas.** (a) Usar o primeiro; (b) usar o mais restritivo; (c) juntar as tags.
**Porquê.** É a regra de descoberta da RFC 7489 (6.6.3): com vários registros a política não vale. Escolher um esconderia ao dono o erro que faz o receptor ignorar o DMARC dele, e esse é um defeito real e comum (dois provedores de e-mail, cada um pedindo seu registro).
**Trade-off.** O visitante não vê a análise de nenhum dos dois até corrigir. Isso é correto: o receptor também não aplica nenhum.

### ADR-3 — Achados são dados, com ordem estável

**Decisão.** Cada achado é `{ codigo, gravidade, tag?, detalhe? }`. A ordem é gravidade (`erro`, `aviso`, `info`) e, dentro dela, a ordem de geração do passo 8.
**Alternativas.** (a) Texto em português dentro do módulo; (b) um campo booleano por situação (`semRua: true`, `parcial: true`…).
**Porquê.** RNF-05: o texto é revisado pelo Ryan antes do `1.0.0` e vive na spec da página; o código é o contrato estável. Uma lista de achados cresce sem mudar o tipo de retorno, e a ordem estável torna o teste e a tela determinísticos.
**Trade-off.** A página precisa de uma tabela código → texto (e o teste da página deve garantir que todo código tem texto). Custo pequeno, e é onde a decisão de redação deve ficar.

### ADR-4 — Valor inválido de tag opcional usa o padrão, com achado; tag duplicada vale a primeira

**Decisão.** `pct`, `adkim`, `aspf`, `fo`, `rf`, `ri` e `sp` com valor fora do domínio válido caem no padrão da RFC (`sp` cai em `p`) e geram `valor-invalido` com a `tag`. Tag conhecida repetida vale a primeira, com `tag-duplicada`.
**Alternativas.** (a) Invalidar o registro inteiro; (b) esconder o erro e usar o padrão em silêncio; (c) na duplicata, escolher a mais forte.
**Porquê.** A RFC manda descartar o erro de sintaxe e usar o padrão. O achado impede que o erro passe em silêncio, e a "mais forte" seria inventar uma regra que o receptor não usa.
**Trade-off.** Receptores diferentes podem divergir num registro assim; a ferramenta mostra o que a RFC manda e avisa que há erro.

### ADR-5 — `p` ausente é salvo por `rua` válido; `p` inválido não é

**Decisão.** Sem `p`, com ao menos um destino válido em `rua`, a política é `none` com `politica-ausente` (`aviso`). Sem `p` e sem destino válido, o registro é `invalido` com `politica-ausente` (`erro`). `p` presente e fora dos três valores é `invalido` com `politica-invalida`, **mesmo que haja `rua` válido**.
**Alternativas.** (a) Tratar `p` inválido como ausente, dando a `none` se houver `rua` (leitura mais literal do texto da RFC: "no valid p tag"); (b) nunca salvar.
**Porquê.** O RF-03 aprovado separa os dois casos. O `p` inválido é provavelmente um erro de digitação do dono (`p=reeject`), e mostrar "monitorando" a quem tentou bloquear esconderia o erro.
**Trade-off.** Num ponto de borda, a ferramenta é mais rígida que a leitura literal da RFC.

### ADR-6 — Caixa tolerada e normalizada

**Decisão.** Nome de tag e valor de `p`, `sp`, `adkim` e `aspf` são comparados em minúsculas; o valor sai em minúsculas e a presença de maiúsculas gera um único `caixa-fora-do-padrao` (`info`). O valor da tag `v` tem de ser `DMARC1` exato.
**Alternativas.** (a) Exigir minúsculas em tudo; (b) aceitar sem avisar.
**Porquê.** Registro real com `P=NONE` é comum e a ABNF da RFC aceita as duas caixas nas palavras. O aviso informativo dá ao dono a chance de padronizar sem dizer que está errado. `DMARC1` é a única palavra que a RFC fixa letra a letra.
**Trade-off.** Um receptor estrito pode recusar `P=NONE`; por isso o achado existe.

### ADR-7 — Endereços de relatório validados com `validarNomeDns`

**Decisão.** O domínio de cada endereço de `rua`/`ruf` passa por `validarNomeDns` e precisa de ao menos dois rótulos; o usuário só precisa estar dentro de uma lista de caracteres proibidos e de 64 caracteres. O limite é 20 destinos por tag.
**Alternativas.** (a) Uma expressão regular completa de e-mail da RFC 5322; (b) aceitar qualquer coisa depois de `mailto:`.
**Porquê.** A ferramenta mostra o endereço ao visitante e não envia nada a ele: basta saber se é plausível. Reaproveitar `validarNomeDns` mantém uma definição de nome DNS no projeto e evita uma expressão regular grande e arriscada. Aceitar tudo deixaria uma `rua` hostil encher a página.
**Trade-off.** Endereços exóticos mas legais (usuário entre aspas, IDN em Unicode) viram `endereco-invalido`. Para e-mail de relatório DMARC, isso é raro.

### ADR-8 — O limite de tamanho vem do módulo da resposta

**Decisão.** `dmarc.js` importa `MAXIMO_TEXTO` de `resposta-doh.js`; um candidato acima disso é `invalido` com `registro-grande-demais`. O limite de tamanho dos valores guardados decorre dele: o texto tem no máximo 4096 caracteres, e todo valor guardado é enumeração, número ou destino validado e limitado.
**Alternativas.** (a) Repetir 4096; (b) ignorar o candidato grande.
**Porquê.** A spec 002 já descarta textos acima do limite, então na prática o caso não chega; a defesa em profundidade (RF-06) cobre quem chamar `lerDmarc` sem passar pela consulta. Ignorar o candidato produziria `ausente`, e dizer ao dono que "não existe" um registro que existe é pior que dizer que está grande demais.
**Trade-off.** `dmarc.js` passa a depender de `resposta-doh.js` por uma constante; a dependência é de dado, não de comportamento.

### ADR-9 — Pedaço sem `=` é ignorado

**Decisão.** Um pedaço entre `;` sem `=` (`v=DMARC1; foo; p=none`) é tratado como tag desconhecida: ignorado, sem achado.
**Alternativas.** (a) Achado de sintaxe; (b) invalidar o registro.
**Porquê.** A RFC manda ignorar erro de sintaxe fora de `v` e `p`, e os requisitos aprovados não definem um achado para isso; acrescentar um sem pedido mudaria o contrato.
**Trade-off.** Um `;` extra mal colocado passa sem aviso.

## Impacto no código existente

- `public/js/resposta-doh.js` e `public/js/nome-dns.js`: só são importados, sem alteração.
- `CLAUDE.md`: a seção de arquitetura ganha a linha de `dmarc.js`. Feito no `/atualizar-docs` de fim de sessão.
- `docs/stack.md`: nenhuma tecnologia nova (só JavaScript puro).
- README (os dois idiomas) e roadmap de `specs/README.md`: marco `v0.3` ao concluir.
- Nada muda em CI, hooks, dependências nem configuração.

## Riscos

- **Divergência entre receptores.** Cada provedor (Google, Microsoft, Yahoo) tem tolerâncias próprias. A ferramenta segue a RFC 7489 e avisa o que desvia dela; o texto da página não deve prometer o comportamento de um receptor específico.
- **Mudança do protocolo.** A revisão da RFC (DMARCbis) troca tags: `np`, `psd` e `t` entram, `pct`, `rf` e `ri` saem. Hoje as novas são ignoradas como desconhecidas (decisão 6 dos requisitos).
- **Conteúdo hostil.** Tudo o que sai de `lerDmarc` é enumeração, número, destino validado ou o texto do registro; o texto só entra na página por `textContent`, regra do `CLAUDE.md`. Teste com `<script>` no registro e no endereço.
- **Desempenho.** O texto tem no máximo 4096 caracteres e a leitura é um laço linear com expressões sem retrocesso; teste com 4000 `;` seguidos.

## Estratégia de testes

Todos offline, com registros sintéticos montados no teste (`exemplo.com.br`, `dmarc@exemplo.com.br`), seguindo a regra do `specs/README.md`.

- **`test/dmarc.test.js`**
  - Escolha (RF-01): um registro entre TXT alheios; nenhum; vários; `v` fora do começo; espaços ao redor do `=`; `V=DMARC1` aceito; `v=dmarc1` e `v=DMARC10` recusados; lista que não é lista e itens que não são texto.
  - Tags (RF-02): registro completo com todos os padrões; `;` final, espaços extras e `;;`; tag desconhecida; pedaço sem `=`; tag duplicada; valor inválido em `pct` (`abc`, `150`, `-1`), `adkim`, `aspf`, `fo`, `rf`, `ri`, `sp`.
  - Política (RF-03): os três valores; `p` ausente com e sem `rua` válida; `p` inválido com `rua` válida (continua `invalido`); `sp` válido e inválido.
  - Destinos (RF-04): dois endereços com `!10m`; `http://`, sem `@`, vazio, `localhost`, `a@b`; 25 endereços válidos devolvem 20 e `detalhe` 5; ausência de `rua`; `<script>` no endereço recusado.
  - Estágio e achados (RF-05): os quatro valores de `estagio`; cada código da tabela; ordem estável dos achados com vários juntos; `pct` ignorado com `p=none`; `subdominios-mais-fracos` em `p=reject; sp=none`.
  - Hostil (RF-06): registro com HTML no valor de uma tag desconhecida (nada é interpretado, texto intacto em `registro`); candidato de 5000 caracteres; 4000 `;` em tempo curto; nenhuma entrada lança.
- O portão (`format:check`, `lint`, `typecheck`, `test`) é a última tarefa de cada etapa.

## Rastreabilidade

| Requisito | Onde é atendido                                       |
| --------- | ----------------------------------------------------- |
| RF-01     | `lerDmarc` (1, 2), ADR-2                              |
| RF-02     | `lerDmarc` (4, 5), ADR-4, ADR-6, ADR-9                |
| RF-03     | `lerDmarc` (6), ADR-5                                 |
| RF-04     | `lerDestinos`, ADR-7                                  |
| RF-05     | `lerDmarc` (7, 8), ADR-3, tabela de códigos de achado |
| RF-06     | `lerDmarc` (1, 3), ADR-7, ADR-8                       |
| RNF-01    | módulo puro, sem DOM nem rede (ADR-1)                 |
| RNF-02    | união discriminada, ADR-3                             |
| RNF-03    | estratégia de testes                                  |
| RNF-04    | `dmarc.js` importa só módulos do projeto              |
| RNF-05    | ADR-3                                                 |
