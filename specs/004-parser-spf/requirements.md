---
feature: Parser SPF — escolher o registro SPF entre os TXT do domínio, lê-lo, contar as consultas DNS e apontar os achados
status: concluído
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh, 003-parser-dmarc]
origin: conception
---

# 004 — Parser SPF

## Contexto e problema

O SPF é o segundo registro que a página explica: uma lista, publicada como TXT no próprio domínio, de quem pode enviar e-mail por ele. O DMARC (spec 003) só protege se o SPF ou o DKIM passar **e estiver alinhado**; por isso o visitante quer saber se o SPF existe, se está válido e se vai quebrar. Esta spec transforma a lista de textos TXT de `<domínio>` (spec 002) em algo que a página consiga explicar.

O erro mais comum e mais caro de SPF não é de sintaxe: é **passar do limite de 10 consultas DNS**. Cada `include`, `a`, `mx`, `ptr`, `exists` e `redirect` conta, e os `include` de provedores (Google, Microsoft, ferramentas de marketing) trazem os seus próprios termos para dentro da conta. Passou de 10, o receptor devolve `permerror` e o SPF inteiro deixa de valer, sem aviso ao dono. Contar isso exige **seguir os `include` e `redirect`**, ou seja, consultar o TXT de outros domínios.

Pontos da RFC 7208 que mudam o resultado, conferidos no texto da RFC em 2026-10-31:

- O registro SPF é o TXT que começa com a versão `v=spf1` (seção 4.5). Se o conjunto tiver **mais de um** registro SPF, o resultado é `permerror`; se não tiver nenhum, `none`.
- Depois da versão vêm termos separados por espaço: mecanismos (`all`, `include`, `a`, `mx`, `ptr`, `ip4`, `ip6`, `exists`), com qualificador opcional (`+`, `-`, `~`, `?`), e modificadores (`redirect=`, `exp=`, e outros desconhecidos). Modificador desconhecido é ignorado; erro de sintaxe em qualquer termo dá `permerror`.
- Só `include`, `a`, `mx`, `ptr`, `exists` e o modificador `redirect` contam para o limite de **10**; `all`, `ip4`, `ip6` e `exp` não contam. Passar de 10 é `permerror` (seção 4.6.4).
- Consulta que volta vazia ou inexistente ("void lookup") é limitada a **2** (seção 4.6.4, `SHOULD`); passar disso é `permerror`.
- `mx` não pode resultar em mais de 10 consultas de endereço (`permerror`); no `ptr` só valem os 10 primeiros nomes.
- `redirect` é **ignorado** se houver `all` em qualquer lugar do registro; os termos depois de `all` são ignorados; `redirect` e `exp` não podem aparecer mais de uma vez (`permerror`).
- `include` cujo alvo não tem registro SPF dá `permerror`, não `none` (seção 5.2).
- `ptr` está marcado "do not use" (`SHOULD NOT` ser publicado), mas continua válido.
- O nome do domínio de `include`, `a`, `mx`, `ptr`, `exists` e `redirect` pode ter **macros** (`%{d}`, `%{i}`…), que só se expandem com os dados de uma mensagem real (IP, remetente).
- Strings TXT de até 255 octetos são juntadas sem espaço (a spec 002 já entrega o texto junto). A RFC recomenda o registro caber em 512 octetos para a resposta caber num pacote UDP (`SHOULD`, não é erro).
- A RFC escreve `v=spf1` como literal ABNF, e literal ABNF é insensível à caixa (RFC 5234); a seção 4.5 não trata a caixa de forma explícita. Esta spec aceita qualquer caixa e registra o achado informativo `caixa-fora-do-padrao`, como na spec 003.

O conteúdo do registro é dado de terceiros, escrito por quem controla o DNS: o módulo trata como texto qualquer, nunca interpreta marcação, e nada que sai dele é HTML. A caminhada pelos `include` é também uma superfície de ataque: um registro pode apontar para si mesmo, formar ciclo ou apontar para uma árvore enorme, para fazer a página disparar consultas sem fim.

## Objetivos

- **Escolher o registro SPF** entre os TXT do domínio (ou dizer que não há, ou que há mais de um) e **lê-lo** em termos estruturados: qualificador, tipo de mecanismo, alvo, e os modificadores.
- **Contar as consultas DNS** que um receptor faria, seguindo `include` e `redirect` por consultas TXT reais, e dizer se passa de 10, com o caminho que levou a cada termo contado, para a página mostrar de onde veio a conta.
- **Achados com código estável**, no mesmo formato da spec 003 (`{ codigo, gravidade, tag?, detalhe? }`, sem texto de interface): `all` ausente, `+all`, `?all`, `~all` e `-all`, `ptr` em uso, limite de consultas passado, `include` sem registro, ciclo, macro, e os demais casos abaixo.
- **Estágio atual** do SPF (`nenhum`, `permissivo`, `suave`, `rigido`) calculado do mecanismo `all` final, para a página saber a situação do domínio de relance.
- **Leitura tolerante e honesta**: o que a RFC manda ignorar é ignorado; o que está torto vira achado, não exceção nem silêncio.
- A leitura do registro é **pura** (sem DOM, sem rede); a caminhada pelos `include` é um módulo à parte que recebe a função de consulta por parâmetro, para testar sem rede.

## Não-objetivos

- **Avaliar um e-mail real** (`check_host()` com IP e remetente): a ferramenta olha o registro publicado, não mensagens. Por isso não se resolve `a`/`mx` para comparar IP, não se faz a consulta reversa do `ptr` e não se expandem macros.
- Consultar `A`, `AAAA` ou `MX` dos alvos de `a`, `mx` e `exists` para contar os "void lookups" dessas consultas ou os 10 endereços do `mx`: só TXT é consultado (a spec 002 só faz TXT). O que dá para contar sem rede (o número de termos) é contado; o que exige resolver endereços fica fora e a página não promete essa parte.
- Os textos em português que explicam cada achado e o passo-a-passo de como consertar (por exemplo, achatar um `include`): são da spec da página.
- Sugerir ou gerar um registro novo.
- Descobrir se um `include` é "de confiança", o que o provedor autoriza, ou listar os IPs que o registro libera.
- DKIM e DMARC: specs 003 e seguinte.

## Personas

- Como **dono de site ou dev**, quero saber se meu SPF existe, está válido e se estou perto ou além do limite de 10 consultas, e de qual `include` vem cada uma, sem ler a RFC.
- Como **autor da página**, quero achados com código estável, a lista de consultas contadas e o estágio já calculado, para escrever o texto de cada caso sem refazer a lógica.
- Como **mantenedor**, quero cada regra da RFC e cada defesa coberta por teste com registro sintético e consulta falsa, para que mudar o módulo nunca quebre em silêncio um caso que já funcionava.

## Requisitos funcionais

### RF-01 — Escolher o registro SPF entre os TXT

- **Given** a lista de textos de `exemplo.com.br` com um texto que começa com `v=spf1` e outros TXT que não (verificação de domínio, por exemplo)
  **When** `lerSpf` é chamada
  **Then** só o que começa com `v=spf1` (seguido de espaço ou fim do texto) é tratado como registro, e os outros são ignorados sem virar achado.
- **Given** dois ou mais textos que começam com `v=spf1`
  **When** é lida
  **Then** o resultado é `situacao: "multiplos"`, com a quantidade, e **nenhum registro é escolhido**: para o receptor é `permerror`.
- **Given** uma lista vazia ou sem nenhum texto começando com `v=spf1`
  **When** é lida
  **Then** o resultado é `situacao: "ausente"`.
- **Given** `v=spf10 ...` ou `v=spf1x`
  **When** é lido
  **Then** **não** é registro SPF (a versão é `v=spf1` seguida de espaço ou fim do texto).
- **Given** `V=SPF1 ...` (outra caixa)
  **When** é lido
  **Then** é aceito, com o achado informativo `caixa-fora-do-padrao`.

### RF-02 — Ler os termos

- **Given** `v=spf1 ip4:203.0.113.0/24 include:spf.exemplo.com.br -all`
  **When** é lido
  **Then** devolve `situacao: "valido"` e a lista de termos na ordem do registro, cada um com `qualificador` (`+` quando ausente), `tipo` e o alvo (`dominio`, `rede`), e o mecanismo `all` com o seu qualificador.
- **Given** espaços repetidos entre os termos
  **When** é lido
  **Then** continua válido, o excesso de espaço é ignorado.
- **Given** mecanismos e modificadores em qualquer caixa (`INCLUDE:`, `Redirect=`)
  **When** são lidos
  **Then** são aceitos (os nomes são insensíveis à caixa na RFC), com `caixa-fora-do-padrao`.
- **Given** um termo com sintaxe inválida (mecanismo desconhecido, `ip4:` sem rede, `include:` sem domínio, qualificador sem mecanismo)
  **When** é lido
  **Then** `situacao: "invalido"`, sem estágio, com o achado `termo-invalido` e o termo (truncado) em `detalhe`: para a RFC o registro inteiro dá `permerror`.
- **Given** um modificador desconhecido (`foo=bar`)
  **When** é lido
  **Then** é ignorado, sem achado (a RFC manda ignorar).
- **Given** `redirect` ou `exp` repetido
  **When** é lido
  **Then** `situacao: "invalido"` com o achado `modificador-repetido`.
- **Given** termos depois de `all`
  **When** é lido
  **Then** o registro continua válido, os termos depois do `all` são marcados como ignorados e há o achado `termos-apos-all`.
- **Given** `redirect=` junto de um `all` no registro
  **When** é lido
  **Then** o `redirect` é marcado como ignorado e há o achado `redirect-ignorado`.

### RF-03 — Estágio e achados do `all`

- **Given** um registro válido terminado em `-all`, `~all`, `?all` ou `+all`
  **When** é lido
  **Then** `estagio` é, respectivamente, `rigido`, `suave`, `permissivo`, `permissivo`, com o achado correspondente (`all-rigido`, `all-suave`, `all-neutro`, `all-libera-tudo`); `+all` tem gravidade `erro` (qualquer um pode enviar por esse domínio).
- **Given** um registro válido sem `all` e sem `redirect`
  **When** é lido
  **Then** `estagio` é `permissivo` e há o achado `sem-all` (sem o fecho, o que não casa com nenhum termo cai em `neutral`).
- **Given** um registro válido sem `all` mas com `redirect=`
  **When** é lido e as consultas são contadas (RF-04)
  **Then** o `estagio` é o do registro de destino do `redirect`, que vale no lugar deste.
- **Given** nenhum registro válido (`ausente`, `multiplos`, `invalido`)
  **When** é lido
  **Then** `estagio` é `nenhum`.

### RF-04 — Contar as consultas DNS e seguir `include` e `redirect`

- **Given** `lerSpfComConsultas` com uma função de consulta TXT e um registro com `include` e `redirect`
  **When** é executada
  **Then** consulta o TXT de cada alvo, lê o registro do alvo com as mesmas regras de RF-01 e RF-02, e segue os `include` dele em profundidade, na ordem do registro.
- **Given** os termos `include`, `a`, `mx`, `ptr`, `exists` e o modificador `redirect`
  **When** são encontrados, em qualquer nível
  **Then** cada um soma **1** à contagem; `all`, `ip4`, `ip6` e `exp` não somam. O `exp` não é consultado.
- **Given** a contagem total chegando a 11 ou mais
  **When** é calculada
  **Then** o resultado traz `consultas.total`, `consultas.limite` (10), `consultas.passouDoLimite: true` e o achado `limite-de-consultas` com gravidade `erro`, porque o receptor devolve `permerror` e o SPF todo deixa de valer.
- **Given** a contagem entre 8 e 10
  **When** é calculada
  **Then** o achado `perto-do-limite` com gravidade `aviso` (a página dirá que uma inclusão nova pode quebrar o SPF).
- **Given** cada consulta contada
  **When** o resultado é devolvido
  **Then** a lista `consultas.itens` traz, para cada uma, o termo, o domínio de origem (quem tem o termo) e o caminho de `include` que levou até ele, na ordem em que o receptor as faria.
- **Given** um `include` ou `redirect` cujo alvo não tem registro SPF
  **When** é seguido
  **Then** o achado `include-sem-registro` (ou `redirect-sem-registro`) com gravidade `erro` e o domínio do alvo, porque a RFC manda `permerror`.
- **Given** um alvo que tem mais de um registro SPF
  **When** é seguido
  **Then** o achado `include-com-varios-registros` com gravidade `erro` (também `permerror` na RFC).
- **Given** consultas que voltam vazias ou com domínio inexistente
  **When** passam de 2 no total
  **Then** o achado `consultas-vazias` com gravidade `erro`; até 2 não há achado.
- **Given** um `include` ou `redirect` que leva de volta a um domínio já visitado no caminho (A inclui B que inclui A, ou um registro que inclui o próprio domínio)
  **When** é seguido
  **Then** não consulta de novo, registra o achado `ciclo` com gravidade `erro` e continua o resto da conta.
- **Given** uma falha de rede ao consultar um alvo (função de consulta devolve `ok: false`)
  **When** é seguido
  **Then** o alvo vira "não verificado" com o achado `consulta-falhou`, a contagem é marcada `incompleta: true`, e o resto dos termos continua sendo lido e contado. A página nunca afirma que o SPF "passa do limite" nem que "está dentro" quando a contagem é incompleta sem ter passado de 10.
- **Given** um termo com macro (`include:%{d}._spf.exemplo.com.br`)
  **When** é lido
  **Then** conta como 1 consulta, **não** é seguido (não há como expandir sem mensagem real), e há o achado `macro-nao-avaliada` com gravidade `info`; a contagem é marcada `incompleta: true`.

### RF-05 — Achados de higiene

- **Given** o mecanismo `ptr`
  **When** é lido
  **Then** o achado `ptr-em-uso` com gravidade `aviso` (a RFC diz que não deve ser publicado; é lento e pouco confiável).
- **Given** um registro maior que 512 caracteres (somando o texto inteiro)
  **When** é lido
  **Then** o achado `registro-grande` com gravidade `aviso` (`SHOULD` da RFC; pode não caber num pacote UDP).
- **Given** o mesmo mecanismo `ip4`/`ip6` ou o mesmo `include` repetido no mesmo registro
  **When** é lido
  **Then** o achado `termo-repetido` com gravidade `info`, porque o `include` repetido gasta consulta à toa.
- **Given** um `ip4`/`ip6` com formato inválido (`ip4:999.1.1.1`, `ip6:xyz`, máscara fora da faixa)
  **When** é lido
  **Then** é tratado como erro de sintaxe (RF-02, `termo-invalido`).
- **Given** `exists` ou `ptr` ou `mx` ou `a` sem alvo (`a`, `mx`, `ptr` aceitam alvo ausente e usam o domínio atual; `exists` exige alvo)
  **When** é lido
  **Then** os três primeiros ficam válidos com o domínio atual como alvo; `exists` sem alvo é `termo-invalido`.
- **Given** os achados
  **When** são devolvidos
  **Then** cada um tem `codigo`, `gravidade` (`erro`, `aviso` ou `info`) e, quando couber, `tag` (o termo) e `detalhe`, e vêm em ordem estável, para teste e para a página.

### RF-06 — Entrada hostil e limites

- **Given** um texto com marcação HTML, caracteres de controle, texto muito longo ou milhares de termos
  **When** é lido
  **Then** nenhum valor devolvido é interpretado como HTML, o tempo de leitura é linear no tamanho, o número de termos lidos tem teto (definido no design) e o resultado é válido ou inválido, nunca exceção.
- **Given** uma lista com itens que não são texto
  **When** é recebida
  **Then** os itens que não são texto são descartados, sem exceção (defesa em profundidade, como na spec 003).
- **Given** um registro que inclui centenas de domínios, ou uma cadeia de `include` muito funda
  **When** a caminhada roda
  **Then** ela **para** num teto de consultas de rede e de profundidade (definidos no design, com folga acima de 10), devolve o que contou até ali com `incompleta: true` e o achado `caminhada-interrompida`, e nunca dispara consultas sem fim. A caminhada nunca faz duas consultas ao mesmo nome.
- **Given** um alvo de `include`/`redirect` que não é um nome DNS válido
  **When** é seguido
  **Then** não é consultado (passa por `validarNomeDns`, ver ⚠️ no `CLAUDE.md`), o termo vira `termo-invalido` e o alvo nunca monta URL sem validação.
- **Given** valores de termo arbitrariamente longos
  **When** são lidos
  **Then** o valor guardado tem limite de tamanho (design) e o que passa disso é `termo-invalido`.

## Requisitos não-funcionais

### RNF-01 — Leitura pura, rede por injeção

`lerSpf` (leitura e achados de um registro) é pura: sem DOM, sem rede, sem relógio, sem estado global. A caminhada pelos `include` recebe a função de consulta por parâmetro (a `consultarTxt` da spec 002 no navegador, uma falsa nos testes) e não importa `fetch`.

### RNF-02 — Nunca lança para dado de terceiros

Texto malformado, lista vazia, valor de tipo errado, registro hostil e falha de consulta são resultados devolvidos. Só erro de programação (chamar sem argumento) pode lançar.

### RNF-03 — Testes com registro sintético

Todo registro nos testes é montado no próprio teste (`exemplo.com.br`, `203.0.113.0/24` e outros blocos de documentação da RFC 5737 e RFC 3849), nunca de domínio real nem de provedor real. Cada regra da RFC citada acima tem ao menos um teste, e cada defesa (RF-06) tem um teste que alimenta o ataque.

### RNF-04 — Privacidade e carga

Seguir um `include` entrega o nome do alvo ao resolvedor DoH, como o domínio digitado já entrega. Nada é registrado: nenhum log dos domínios percorridos. A caminhada não repete consulta ao mesmo nome e tem teto (RF-06). A página dirá ao visitante que os domínios dos `include` também vão ao resolvedor.

### RNF-05 — Zero dependência de runtime

Só JavaScript da plataforma. O `package.json` continua sem `dependencies`.

### RNF-06 — Sem texto de interface

Os módulos devolvem códigos e dados, nunca frases para o visitante. O português da explicação é da spec da página, onde o Ryan revisa os textos `[provisório]` antes do `1.0.0`.

## Perguntas em aberto

Nenhuma.

## Decisões resolvidas

1. A fonte do formato e dos limites é a RFC 7208 (seções 3, 4.5, 4.6, 5, 6 e 7), conferida em 2026-10-31. A parte final da RFC (seção 7 em diante, macros em detalhe) não foi lida por inteiro; as macros só são **detectadas** (`%{`), nunca expandidas, então o detalhe não muda o comportamento.
2. A caixa de `v=spf1` e dos nomes de mecanismo é aceita em qualquer forma, com achado informativo: a RFC define os literais em ABNF (insensível à caixa), mesma escolha pragmática da spec 003 para as tags.
3. O limite de 10 e o de 2 consultas vazias vêm da seção 4.6.4; o de 2 é `SHOULD` na RFC e é tratado como erro aqui porque os receptores relevantes o aplicam.
4. Passou de 10, a caminhada **continua** até o teto de consultas (definido no design), para mostrar o total real e o caminho de cada termo. Aprovado em 2026-10-31.
5. Só TXT é consultado: `a`, `mx`, `ptr` e `exists` contam como 1 consulta sem resolver nada, e a página diz que não verificou se esses nomes existem. Aprovado em 2026-10-31.
6. `ptr` em uso é achado de gravidade `aviso` (a RFC diz `SHOULD NOT`, não proíbe). Aprovado em 2026-10-31.

## Testes

- `test/spf.test.js`: escolha do registro (TXT alheios misturados, nenhum, vários, `v=spf10`, caixa), termos e qualificadores, espaços, sintaxe inválida por tipo de termo, modificadores (desconhecido, repetido, `redirect` com `all`), termos depois de `all`, estágio nos quatro valores, `sem-all`, `ptr`, registro grande, termo repetido, `ip4`/`ip6` inválidos, entrada hostil (HTML, controle, texto longo, milhares de termos, itens que não são texto).
- `test/spf-consultas.test.js`: contagem (cada tipo de termo, `all`/`ip4`/`ip6`/`exp` que não somam), `include` e `redirect` em vários níveis, limite 10 e 11, perto do limite, `include` sem registro, alvo com vários registros, consultas vazias (até 2 e 3), ciclo (A→B→A e o próprio domínio), falha de rede, macro, teto de consultas e de profundidade, nome nunca consultado duas vezes, alvo com nome inválido.
- O CI roda o portão completo em todo PR.
