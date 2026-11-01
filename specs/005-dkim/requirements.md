---
feature: DKIM — procurar a chave pública do domínio em seletores comuns, lê-la e apontar os achados
status: concluído
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh, 003-parser-dmarc, 004-parser-spf]
origin: conception
---

# 005 — DKIM

## Contexto e problema

O DKIM é o terceiro registro que a página explica: o remetente assina cada e-mail com uma chave privada, e o domínio publica a chave **pública** como TXT em `<seletor>._domainkey.<domínio>`. O DMARC (spec 003) só protege se o SPF ou o DKIM passar **e estiver alinhado**; por isso o visitante quer saber se há chave publicada, se ela é válida e se é forte o bastante.

Ao contrário do DMARC e do SPF, **o nome do registro DKIM não é conhecido**: o seletor é escolha de quem envia (cada provedor usa o seu, e um domínio pode ter vários) e o DNS não permite listar os nomes sob `_domainkey`. A ferramenta só consegue **tentar uma lista de seletores comuns** e o que o visitante digitar. Por isso o resultado honesto de "nada achado" é **"não encontrei nesses seletores"**, nunca "você não tem DKIM" (regra do `CLAUDE.md`).

O custo também é diferente: são 15 a 20 consultas TXT por domínio (uma por seletor comum), não uma ou duas. Disparar tudo de uma vez é rude com o resolvedor e esconde as falhas; sequencial deixa a página lenta. Esta spec define a consulta com **concorrência limitada** (pendência registrada na spec 002).

Pontos das RFCs que mudam o resultado, conferidos no texto em 2026-10-31:

- O registro está em `<seletor>._domainkey.<domínio>`, só TXT; as strings TXT são juntadas sem espaço; deve haver **um** registro por seletor, e com vários o resultado é indefinido (RFC 6376, 3.6.2).
- O seletor é `sub-domain *( "." sub-domain )`: pontos são permitidos e separam componentes (RFC 6376, 3.1).
- Tags do registro (RFC 6376, 3.6.1): `v` (versão; se presente deve ser `DKIM1` e a primeira tag; registro com outra versão é descartado), `h` (algoritmos de hash aceitos: `sha1`, `sha256`; padrão todos), `k` (tipo da chave; padrão `rsa`; tipo desconhecido é ignorado), `n` (nota para humanos), `p` (chave pública em base64, obrigatória; **vazia significa chave revogada**), `s` (serviços: `email` e `*`; padrão `*`), `t` (flags: `y` = domínio em teste, `s` = `i=` deve ser exatamente o `d=`). Tag desconhecida é ignorada; tag repetida invalida a lista inteira; nomes e valores são sensíveis à caixa.
- Chave RSA (RFC 8301, 3.2): quem assina **deve** usar pelo menos 1024 bits e **deveria** usar 2048; o verificador **deve** validar de 1024 a 4096 bits e **não deve** considerar válida assinatura com chave RSA menor que 1024. Acima de 4096 o verificador pode não validar.
- `rsa-sha1` **não** deve ser usado para assinar nem para verificar (RFC 8301, 3.1); a RFC 8301 não trata a tag `h=` do registro, então `h=sha1` é uma leitura nossa da proibição, marcada como aviso.
- Chave Ed25519 (RFC 8463): `k=ed25519`, e o `p=` é a chave de 32 bytes em base64 (44 caracteres).

O conteúdo do registro é dado de terceiros, escrito por quem controla o DNS: o módulo trata como texto qualquer, nunca interpreta marcação, e nada que sai dele é HTML. O seletor digitado pelo visitante vai dentro de um nome DNS e, por ele, dentro de uma URL: passa por validação antes de qualquer consulta.

## Objetivos

- **Procurar** a chave DKIM do domínio numa lista de seletores comuns (arquivo de dados, com o provedor e o link da documentação de cada um) mais os seletores que o visitante digitar, com **concorrência limitada** e resultado na ordem da lista, não na ordem de chegada.
- **Ler** cada registro encontrado em dados estruturados: versão, tipo de chave, hash, serviços, flags, chave revogada, tamanho da chave.
- **Medir o tamanho da chave RSA** a partir do `p=`, para a página dizer se está abaixo do mínimo ou do recomendado.
- **Achados com código estável**, no formato das specs 003 e 004 (`{ codigo, gravidade, tag?, detalhe? }`, sem texto de interface).
- **Resumo honesto**: `encontrado`, `nao-encontrado` ("não encontrei nesses seletores") ou `indeterminado` (consultas falharam e nada foi achado), com a lista dos seletores tentados e o resultado de cada um.
- Leitura do registro e validação do seletor são **puras** (sem DOM, sem rede); a busca recebe a função de consulta por parâmetro, para testar sem rede.

## Não-objetivos

- **Verificar uma assinatura** de e-mail real (`DKIM-Signature`, canonização, hash do corpo): a ferramenta olha a chave publicada, não mensagens.
- **Listar** os seletores do domínio ou descobrir o seletor de um provedor que gera nomes aleatórios por conta. Um seletor fora da lista só aparece se o visitante o digitar.
- Seguir CNAME à mão: o resolvedor já segue o CNAME de um seletor delegado ao provedor e devolve o TXT do destino (a spec 002 ignora o CNAME misturado). Saber **que** o seletor é um CNAME não é objetivo.
- Dizer qual provedor assina de fato os e-mails do domínio, ou se o alinhamento com o DMARC (`d=` contra o domínio do `From`) passa.
- Os textos em português que explicam cada achado e o que fazer (rotacionar uma chave de 1024 bits, por exemplo): são da spec da página.
- Gerar chave ou registro novo.
- SPF e DMARC: specs 003 e 004.

## Personas

- Como **dono de site ou dev**, quero saber se meu domínio publica chave DKIM nos seletores dos provedores que uso, se a chave é forte e se ela não foi revogada, sem ler a RFC.
- Como **autor da página**, quero, para cada seletor tentado, um resultado com código estável (achado, ausente ou não verificado), para escrever o texto de cada caso e nunca afirmar "você não tem DKIM".
- Como **mantenedor**, quero cada regra das RFCs e cada defesa coberta por teste com registro sintético e consulta falsa, e a lista de seletores em arquivo de dados que se edita sem mexer na lógica.

## Requisitos funcionais

### RF-01 — Lista de seletores comuns

- **Given** o arquivo de dados dos seletores
  **When** é carregado
  **Then** traz de 15 a 20 seletores comuns, cada um com `seletor`, `provedor`, `documentacao` (URL `https` da documentação oficial do provedor sobre o DKIM) e `conferido` (data AAAA-MM-DD em que alguém abriu a página e viu o nome nela), sem repetição.
- **Given** um seletor que o provedor gera por conta, sem nome fixo (não dá para tentar sem o dado do visitante)
  **When** a lista é montada
  **Then** ele **não** entra como seletor; o provedor pode aparecer só como orientação no arquivo de dados, para a página dizer "digite o seletor que o seu provedor mostra".
- **Given** a lista
  **When** o teste de dados roda
  **Then** cada `seletor` é um nome válido (RF-02), cada `documentacao` é uma URL `https` bem formada e não há duas entradas com o mesmo `seletor`.

### RF-02 — Seletor digitado pelo visitante

- **Given** um seletor digitado em qualquer caixa e com espaços nas pontas (` Selector1`)
  **When** `normalizarSeletor` é chamada
  **Then** devolve `{ ok: true, seletor: "selector1" }`, em minúsculas e sem espaços.
- **Given** um seletor com pontos (`marco2005.reykjavik`)
  **When** é normalizado
  **Then** é aceito, cada componente com no máximo 63 caracteres (RFC 6376, 3.1).
- **Given** um seletor vazio, com caractere fora de letras, dígitos, hífen, sublinhado e ponto, com componente vazio (`a..b`, `.a`, `a.`), com `/`, `?`, `#`, `:`, `@`, espaço no meio, caractere de controle, ou grande demais
  **When** é normalizado
  **Then** `{ ok: false, motivo }` com a razão em código estável, e nada é consultado.
- **Given** o visitante que digita o nome completo (`google._domainkey.exemplo.com.br`) em vez do seletor
  **When** é normalizado
  **Then** é recusado com o motivo `parece-nome-completo`, porque o seletor é só a primeira parte e o resto a ferramenta monta.
- **Given** a lista de seletores digitados e a lista comum
  **When** são juntadas
  **Then** a ordem é a da lista comum e depois a dos digitados, sem repetição (comparação já normalizada), e o total tem teto (definido no design).

### RF-03 — Ler o registro de um seletor

- **Given** os textos TXT de `<seletor>._domainkey.exemplo.com.br` com um registro `v=DKIM1; k=rsa; p=<base64>`
  **When** `lerDkim` é chamada
  **Then** devolve `situacao: "valido"` com `versao`, `tipo` (`rsa`), `chave` (`presente`), `hashes`, `servicos`, `flags` e o `tamanhoBits` da chave.
- **Given** um registro sem `v=` mas com `p=`
  **When** é lido
  **Then** é aceito como DKIM (a versão é opcional na RFC) e `versao` fica `DKIM1` por padrão.
- **Given** um registro com `v=` que não é a primeira tag, ou com versão diferente de `DKIM1` (`DKIM1.0`, `DKIM2`, `dkim1`)
  **When** é lido
  **Then** `situacao: "invalido"` com o achado `versao-invalida`: a RFC manda descartar.
- **Given** textos TXT que não parecem DKIM (não começam com `v=DKIM` e não têm tag `p`, como um TXT curinga qualquer sob `_domainkey`)
  **When** são lidos
  **Then** o seletor conta como ausente, sem achado.
- **Given** dois ou mais registros com cara de DKIM no mesmo seletor
  **When** são lidos
  **Then** `situacao: "multiplos"`, com a quantidade, nenhum registro escolhido e o achado `registros-multiplos` (a RFC deixa o resultado indefinido).
- **Given** uma tag repetida (`p=...; p=...`)
  **When** é lido
  **Then** `situacao: "invalido"` com o achado `tag-repetida` (a RFC invalida a lista inteira).
- **Given** tags desconhecidas, espaços e `;` final
  **When** são lidos
  **Then** a tag desconhecida é ignorada sem achado, e espaços e o `;` final são aceitos.
- **Given** tag escrita em outra caixa (`P=`, `V=DKIM1`)
  **When** é lido
  **Then** é tratada como tag desconhecida, porque os nomes de tag são sensíveis à caixa na RFC (consequência: sem `p`, o registro é `invalido` com `chave-ausente`).
- **Given** um registro sem a tag `p`
  **When** é lido
  **Then** `situacao: "invalido"` com o achado `chave-ausente` (a tag é obrigatória).

### RF-04 — Chave revogada, tipo, hash, serviço e teste

- **Given** `p=` vazio
  **When** é lido
  **Then** `situacao: "revogado"` (a chave foi retirada de propósito), com o achado `chave-revogada` de gravidade `aviso`; não conta como DKIM ativo no resumo.
- **Given** `k=ed25519` com `p=` de 32 bytes em base64
  **When** é lido
  **Then** `tipo: "ed25519"`, sem `tamanhoBits` de RSA e sem achado de tamanho; um `p=` de Ed25519 que não decodifica para 32 bytes é `chave-ilegivel`.
- **Given** um `k=` que não é `rsa` nem `ed25519`
  **When** é lido
  **Then** o tipo é guardado como desconhecido, a RFC manda ignorar o registro para verificação, e há o achado `tipo-de-chave-desconhecido` de gravidade `info`.
- **Given** `h=sha1` (e nenhum `sha256`)
  **When** é lido
  **Then** o achado `so-sha1` de gravidade `aviso`: `rsa-sha1` não deve ser usado nem para assinar nem para verificar (RFC 8301).
- **Given** `s=` que não lista `email` nem `*`
  **When** é lido
  **Then** o achado `servico-nao-e-email` de gravidade `aviso`: um verificador de e-mail ignora esse registro.
- **Given** `t=y` entre as flags
  **When** é lido
  **Then** o achado `modo-de-teste` de gravidade `aviso`: o domínio diz que está testando e os verificadores não devem tratar a falha como diferente de não assinado.
- **Given** `n=` com texto
  **When** é lido
  **Then** a nota é guardada, truncada, como texto puro e nunca interpretada.

### RF-05 — Tamanho da chave RSA

- **Given** um `p=` RSA válido (estrutura `SubjectPublicKeyInfo` do RFC 3279 em base64)
  **When** é lido
  **Then** `tamanhoBits` é o número de bits do módulo (2048 para uma chave de 2048 bits), lido sem biblioteca, só com a plataforma.
- **Given** `tamanhoBits` menor que 1024
  **When** é lido
  **Then** o achado `chave-fraca` de gravidade `erro`: o verificador não deve considerar válida a assinatura (RFC 8301).
- **Given** `tamanhoBits` de 1024 a 2047
  **When** é lido
  **Then** o achado `chave-abaixo-do-recomendado` de gravidade `aviso` (a RFC recomenda 2048).
- **Given** `tamanhoBits` de 2048 a 4096
  **When** é lido
  **Then** nenhum achado de tamanho.
- **Given** `tamanhoBits` acima de 4096
  **When** é lido
  **Then** o achado `chave-maior-que-4096` de gravidade `aviso`: o verificador só é obrigado a validar até 4096, e uma chave maior pode não ser validada.
- **Given** um `p=` que não é base64, não é a estrutura esperada, tem tamanho de campo incoerente ou é grande demais
  **When** é lido
  **Then** `situacao` continua `valido` quanto à leitura das tags, `tamanhoBits` fica ausente e há o achado `chave-ilegivel` de gravidade `erro`; nunca lança exceção. Espaços dentro do `p=` (base64 quebrado em pedaços) são ignorados antes da leitura.

### RF-06 — Buscar nos seletores com concorrência limitada

- **Given** `buscarDkim` com o domínio, a lista de seletores e uma função de consulta TXT
  **When** é executada
  **Then** consulta `<seletor>._domainkey.<domínio>` para cada seletor, com no máximo N consultas em andamento ao mesmo tempo (N definido no design), e lê cada resposta com as regras de RF-03 a RF-05.
- **Given** respostas que chegam fora de ordem
  **When** o resultado é devolvido
  **Then** `seletores` vem na ordem da lista de entrada, não na de chegada.
- **Given** um seletor sem registro ou de domínio inexistente
  **When** é consultado
  **Then** o seletor fica `ausente`, sem achado.
- **Given** uma falha de rede ao consultar um seletor (função de consulta devolve `ok: false`)
  **When** acontece
  **Then** o seletor fica `nao-verificado` com o motivo, e as outras consultas continuam; o resultado marca `incompleta: true`.
- **Given** falhas de rede acima do limite tolerado (definido no design, como na spec 004)
  **When** acontece
  **Then** a busca para de disparar consultas novas, os seletores que ficaram sem tentar saem como `nao-verificado` e há o achado `busca-interrompida` de gravidade `aviso`.
- **Given** o resumo
  **When** é calculado
  **Then** `situacao` é `encontrado` se ao menos um seletor tem registro `valido` (um registro `revogado`, `invalido` ou `multiplos` sozinho não basta); `nao-encontrado` se todos foram verificados e nenhum tem registro; `indeterminado` se algum ficou `nao-verificado` e nenhum seletor tem registro.
- **Given** `situacao: "nao-encontrado"`
  **When** o resultado é devolvido
  **Then** traz o achado `nenhum-seletor-encontrado` de gravidade `info` e a lista dos seletores tentados, para a página dizer "não encontrei nesses seletores" e listá-los. Nenhum campo do resultado afirma que o domínio "não tem DKIM".
- **Given** `situacao: "encontrado"` com algum seletor `nao-verificado`
  **When** o resultado é devolvido
  **Then** continua `encontrado` e `incompleta: true`: o que foi achado vale; só não se afirma que a lista está completa.
- **Given** o mesmo nome nunca consultado duas vezes
  **When** a lista tem seletores repetidos ou equivalentes
  **Then** cada nome DNS é consultado uma vez só.

### RF-07 — Achados e saída

- **Given** os achados de todos os seletores
  **When** são devolvidos
  **Then** cada um tem `codigo`, `gravidade` (`erro`, `aviso` ou `info`), `seletor` (a que registro se refere) e, quando couber, `tag` e `detalhe`, em ordem estável (gravidade, depois ordem da lista de seletores, depois código), para teste e para a página.
- **Given** o resultado de `buscarDkim`
  **When** é devolvido
  **Then** traz `situacao`, `incompleta`, `seletores` (cada um com `seletor`, `nome`, `estado`, o registro lido quando houver e o motivo quando não verificado), `achados` e `resolvedores` (quais resolvedores responderam, para a página dizer quem viu o domínio).

### RF-08 — Entrada hostil e limites

- **Given** um TXT com marcação HTML, caracteres de controle, texto muito longo ou milhares de tags
  **When** é lido
  **Then** nenhum valor devolvido é interpretado como HTML, o tempo de leitura é linear no tamanho, o número de tags lidas tem teto (design) e o resultado é válido ou inválido, nunca exceção.
- **Given** uma lista com itens que não são texto
  **When** é recebida por `lerDkim`
  **Then** os que não são texto são descartados, sem exceção.
- **Given** um domínio que não passou por `normalizarDominio`
  **When** é entregue a `buscarDkim`
  **Then** a busca o normaliza de novo e recusa o que não for domínio válido, sem consultar (⚠️ do `CLAUDE.md`); o nome montado ainda passa por `validarNomeDns` dentro de `consultarTxt`.
- **Given** uma lista de seletores enorme (centenas de digitados)
  **When** `buscarDkim` é chamada
  **Then** aplica o teto de seletores (design), descarta o excesso e devolve o achado `seletores-demais`, em vez de disparar centenas de consultas.
- **Given** valores de tag arbitrariamente longos
  **When** são lidos
  **Then** o valor guardado tem limite de tamanho (design) e o que passa disso é `invalido`.

## Requisitos não-funcionais

### RNF-01 — Leitura pura, rede por injeção

`normalizarSeletor`, `lerDkim` e a leitura do tamanho da chave são puras: sem DOM, sem rede, sem relógio, sem estado global. `buscarDkim` recebe a função de consulta por parâmetro (a `consultarTxt` da spec 002 no navegador, uma falsa nos testes) e não importa `fetch`.

### RNF-02 — Nunca lança para dado de terceiros

Texto malformado, lista vazia, valor de tipo errado, registro hostil e falha de consulta são resultados devolvidos. Só erro de programação (chamar sem argumento) pode lançar.

### RNF-03 — Testes com registro sintético

Todo registro nos testes é montado no próprio teste (`exemplo.com.br`, chaves geradas no teste ou bytes fabricados, nunca uma chave de domínio ou provedor real). Cada regra das RFCs citada acima tem ao menos um teste, e cada defesa (RF-02 e RF-08) tem um teste que alimenta o ataque.

### RNF-04 — Privacidade e carga

Cada seletor tentado entrega ao resolvedor DoH o nome `<seletor>._domainkey.<domínio>`: o domínio já é conhecido por ele, mas a página diz que os seletores também vão. Nada é registrado: nenhum log de domínios nem de seletores. A concorrência limitada e o teto de seletores (RF-06, RF-08) mantêm a carga por domínio previsível; as medições da spec 002 (rajadas de 40 e 200 consultas sem 429 nos dois resolvedores) não são licença para disparar tudo de uma vez.

### RNF-05 — Zero dependência de runtime

Só JavaScript da plataforma (`atob`, `Uint8Array`). O `package.json` continua sem `dependencies`.

### RNF-06 — Sem texto de interface

Os módulos devolvem códigos e dados, nunca frases para o visitante. O português da explicação é da spec da página, onde ficam os textos da interface. Os nomes de provedor e os links do arquivo de dados são dados, não texto de interface.

## Perguntas em aberto

Nenhuma.

## Decisões resolvidas

1. Fontes: RFC 6376 (3.1, 3.2, 3.6.1 e 3.6.2), RFC 8301 (3.1 e 3.2) e RFC 8463, conferidas em 2026-10-31. A parte da RFC 6376 depois do caractere 100000 do texto (assinatura, canonização, apêndices) não foi lida: a ferramenta não verifica assinatura.
2. O resultado sem registro é "não encontrei nesses seletores", nunca "você não tem DKIM" (decisão do mantenedor em 2026-10-31, no `CLAUDE.md`).
3. Lista de 15 a 20 seletores em arquivo de dados com link da documentação de cada provedor, mais campo livre (decisão do mantenedor em 2026-10-31). Quais seletores entram e a verificação de cada link são do design.
4. A caixa das tags segue a RFC (sensível), ao contrário das specs 003 e 004: lá a RFC define os literais em ABNF (insensível à caixa); aqui a RFC 6376 diz que nomes de tag são sensíveis, e um registro com `P=` não funciona de fato para o verificador.
5. `h=sha1` é aviso, não erro: a RFC 8301 proíbe `rsa-sha1` na assinatura, mas não trata a tag do registro.
6. O tamanho da chave RSA (RF-05) fica nesta spec, com o leitor ASN.1 isolado em `chave-rsa.js`. Aprovado em 2026-10-31.

## Testes

- `test/seletor-dkim.test.js`: seletor válido, caixa e espaços, pontos, componente de 63 e de 64, vazio, caractere inválido, `a..b`, `.a`, `a.`, nome completo digitado, junção das listas sem repetição e o teto.
- `test/chave-rsa.test.js`: base64 do `p=`, tamanhos de chave de 512 a 4096 bits, estrutura ASN.1 certa e cada peça quebrada, entrada que não lança (truncagem e alteração de byte).
- `test/dkim.test.js`: escolha do registro (TXT alheio, nenhum, vários), `v` ausente, errada e fora da primeira posição, tag repetida, tag desconhecida, caixa das tags, `p` ausente, vazio (revogado), RSA de 512, 1024, 2048 e 4096 bits e acima (módulos sintéticos), `p` torto, Ed25519 certo e curto, `k` desconhecido, `h=sha1`, `s` sem `email`, `t=y`, `n` com marcação, entrada hostil (HTML, controle, texto longo, milhares de tags, itens que não são texto).
- `test/dkim-busca.test.js`: concorrência nunca acima do limite (consulta falsa que mede quantas estão em andamento), ordem do resultado com respostas fora de ordem, seletor ausente, falha de rede, falhas acima do limite, resumo nos três valores, "nenhum seletor encontrado", `encontrado` com busca incompleta, nome nunca consultado duas vezes, domínio sem normalizar, teto de seletores.
- `test/seletores-dkim-dados.test.js`: o arquivo de dados (RF-01).
- O CI roda o portão completo em todo PR.
