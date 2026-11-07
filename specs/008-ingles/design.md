---
feature: Inglês — o DMARC Fácil inteiro em /en/, com o mesmo código e os textos por idioma
status: concluído
date: 2026-11-07
related: [006-pagina, 007-hospedagem]
origin: conception
---

# 008 — Inglês: design

## Visão geral

A lógica (parsers, validação, verificador) não muda de regra e passa a **não conter frase nenhuma**. Todo texto vive em um catálogo por idioma, `public/js/textos/pt/` e `public/js/textos/en/`, com a mesma forma. Cada página HTML carrega um arquivo de entrada de uma linha que liga o catálogo do idioma dela à página; os módulos de apresentação recebem o catálogo como parâmetro. O seletor de idioma são dois links reais entre as duas páginas, e o script só acrescenta o `?dominio=` neles.

```text
index.html ──► /js/entrada-pt.js ──┬─► pagina.js ──► apresentacao, escada, selo, verificador ... (puros)
                                   └─► textos/pt/index.js  (o catálogo, injetado como parâmetro)
en/index.html ─► /js/entrada-en.js ─┬─► pagina.js   (o mesmo módulo)
                                    └─► textos/en/index.js
```

A lógica, o CSS, as fontes, o favicon e o `pagina.js` são **um arquivo só**, servidos pelos mesmos caminhos absolutos às duas páginas. Só mudam os dois HTMLs, o catálogo, a imagem social e a entrada.

### Interface (mockup aprovado)

O mockup aprovado (390 px e largura do painel, claro e escuro, com e sem resultado, em PT e EN) fixa a interface. Decisão e motivo:

- **Seletor no cabeçalho e no rodapé**, como dois links de texto "PT" e "EN", no canto direito do cabeçalho e na ponta direita do rodapé de duas pontas. O atual leva `aria-current="page"` e o sublinhado da marca. Texto, e não bandeira: bandeira é país, não idioma, e não se lê em leitor de tela.
- **Link, e não botão**: cada idioma é uma página com endereço próprio, então o clique, o clique do meio e o "copiar endereço do link" funcionam sem script.
- O texto de apoio, o rodapé e o tema escuro do mockup já estão na `main` (PRs #28 e #29). O que esta spec acrescenta ao desenho é o seletor e os textos em inglês; o resto da tela é o da página em português.

## Componentes

| Componente                                                                                                      | O que faz                                                                                                                                                                   | Muda como                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `public/en/index.html`, `public/en/404.html`                                                                    | As páginas em inglês, escritas à mão (ADR-1)                                                                                                                                | Novos                                                                                                       |
| `public/js/entrada-pt.js`, `entrada-en.js`                                                                      | Importam o catálogo do idioma e chamam `iniciarPagina(textos)` (ADR-2)                                                                                                      | Novos                                                                                                       |
| `public/js/textos/<idioma>/{achados,interface,motivos,index}.js`                                                | O catálogo: dado puro, sem DOM, sem rede, sem lógica                                                                                                                        | Os dois arquivos `textos-*.js` atuais viram o `pt/` (com `git mv`), e ganham o `motivos.js`; o `en/` é novo |
| `public/js/textos/resolver.js`                                                                                  | `textoDoAchado(textos, achado)` e `textoDoMotivo(textos, recusa)`: a escolha do texto, a única lógica que sobra perto do catálogo (sai de `textos-achados.js`)              | Novo (código movido)                                                                                        |
| `public/js/textos/tipos.js`                                                                                     | Só typedef: `Textos`, o tipo do catálogo, derivado do catálogo em português (ADR-4)                                                                                         | Novo                                                                                                        |
| `dominio.js`, `nome-dns.js`, `doh.js`, `resposta-doh.js`, `dkim-busca.js`, `verificador.js`, `spf-consultas.js` | Devolvem `{ ok: false, motivo: "<código>", valor? }` em vez de uma frase (ADR-5)                                                                                            | Mudam o valor de `motivo`; o resto fica                                                                     |
| `apresentacao.js`, `escada.js`, `selo.js`                                                                       | Recebem `textos` como **primeiro parâmetro** onde precisam de texto (ADR-3)                                                                                                 | Mudam a assinatura                                                                                          |
| `pagina.js`                                                                                                     | Exporta `iniciarPagina(textos)`: o que hoje roda ao importar passa a rodar na chamada. Continua o único módulo com `document`, `location` e `history`                       | Muda                                                                                                        |
| `endereco.js`                                                                                                   | Ganha `montarEnderecoIdioma(base, texto)` (ADR-6)                                                                                                                           | Muda                                                                                                        |
| `seletores-dkim.js`                                                                                             | Fica como está: o `provedor` é nome próprio e a `documentacao` é link, sem frase para traduzir (o plano previa um catálogo de orientações; o código mostra que não precisa) | Não muda                                                                                                    |
| `public/css/pagina.css`                                                                                         | Ganha o `.idioma` do mockup (alvo de 44 px, `aria-current` sublinhado)                                                                                                      | Muda                                                                                                        |
| `public/social-en.png` e `docs/images/dmarc-facil-dmarc-spf-dkim-checker-social-preview-en.{html,png}`          | A imagem de compartilhamento em inglês (ADR-8)                                                                                                                              | Novos                                                                                                       |
| `sitemap.xml`, `robots.txt`, `wrangler.json`                                                                    | O sitemap lista as duas páginas com os `hreflang`; a rota do `wrangler.json` continua a fonte do endereço                                                                   | `sitemap.xml` muda                                                                                          |
| `scripts/conferir-hospedagem.mjs`, `.github/lighthouse/*.json`, `.github/workflows/lighthouse.yml`              | Conferem e medem também `/en/` e a 404 em inglês                                                                                                                            | Mudam                                                                                                       |

## Modelo de dados

**O catálogo** (`Textos`) tem três áreas, cada uma um objeto de dados:

```js
// public/js/textos/pt/index.js (o en/ tem exatamente as mesmas chaves)
export const textos = {
  achados: { generico, porCodigo },        // um { titulo, explicacao, acao } por código de achado
  interface: { selo, degraus, etiquetas, acoesProximo, escada, ressalvas, titulosCartao,
               verificando, falha, dmarc, spf, dkim, gravidade, dadoDoAchado, resultado,
               formulario, anuncio },        // o que hoje é textos-interface.js
  motivos: { "dominio-vazio": { texto }, "resolvedor-http": { texto: "... HTTP {valor}." }, ... },
};
```

As chaves de `interface` são as constantes atuais de `textos-interface.js` em camelCase (`TEXTOS_SELO` vira `selo`, `ACOES_PROXIMO` vira `acoesProximo`, e assim por diante); a tarefa lista a tabela exata. O `MOTIVOS_SELETOR` atual vira uma entrada de `motivos` (o código do seletor e o da recusa de domínio dividem a mesma tabela, sem colisão de nome).

**A recusa e a falha** passam a ser um código estável, com o dado quando o texto precisa de um:

```js
/** @typedef {{ motivo: string, valor?: string | number }} Recusa */
// { ok: false, motivo: "resolvedor-http", valor: 503 }   → "O resolvedor respondeu HTTP 503."
// { ok: false, motivo: "dominio-vazio" }                 → "Digite um domínio, por exemplo ..."
```

O `EstadoParte` de falha (`tipos.js`) guarda `motivo` e `valor?` do mesmo jeito, no lugar da frase. São cerca de 20 códigos, do mesmo estilo de `seletor-dkim.js` (que já devolve `"caractere-invalido"`): `dominio-vazio`, `dominio-com-porta-ou-ipv6`, `rotulo-grande-demais`, `resolvedor-http`, `resolvedor-sem-status`, `consulta-falhou`, `sem-seletores`, `sem-motivo`... A lista fechada, com o texto de cada um e a origem, é a primeira tarefa da etapa 1 (a tabela está no apêndice A do `tasks.md`). Dois textos de hoje são iguais e viram um código só (o "Digite um domínio" de `dominio.js` e de `dkim-busca.js`).

## Interfaces

- **Endereços:** `/` e `/en/` (páginas), `/en/<qualquer outro caminho>` (404 em inglês), `/js/entrada-pt.js` e `/js/entrada-en.js`. O `?dominio=` só preenche o campo, nos dois idiomas.
- **`iniciarPagina(textos)`**: o único contrato entre entrada e página. A entrada não lê `document`.
- **`textoDoMotivo(textos, recusa)`**: devolve o texto do código com o `valor` encaixado por `preencher`. Código sem entrada devolve `textos.interface.falha.semMotivo` (ADR-11), nunca o código cru.
- **Seletor de idioma (HTML):**

  ```html
  <nav class="idioma" aria-label="Idioma">
    <a href="/" lang="pt-BR" hreflang="pt-BR" aria-current="page" aria-label="PT: Português">PT</a>
    <a href="/en/" lang="en" hreflang="en" aria-label="EN: English">EN</a>
  </nav>
  ```

  Na página em inglês o `aria-label` do `nav` é "Language" e os dois links são os mesmos, com o `aria-current` no EN. O rodapé repete o mesmo `nav` com um `aria-label` próprio ("Idioma (rodapé)" e "Language (footer)"), para os dois landmarks terem nomes diferentes.

- **`<head>` de cada página:** `canonical` próprio, os três `link rel="alternate" hreflang` (`pt-BR` → `/`, `en` → `/en/`, `x-default` → `/`), `og:locale` (`pt_BR`, `en_US`) e `og:image` (`social-pt.png`, `social-en.png`). A 404 de cada idioma não tem nenhum deles.
- **Sitemap:** as duas URLs, cada uma com `xhtml:link` para as duas (a si mesma inclusive), no formato do protocolo do Google para versões por idioma.

## ADRs

### ADR-1 — Dois HTMLs escritos à mão, sem gerador (RF-01, RNF-05)

**Decisão.** `index.html` e `en/index.html` (e as duas 404) são arquivos versionados, com a mesma estrutura. Um teste compara os esqueletos.

**Alternativas.** (a) gerar os HTMLs de um modelo com um script de build; (b) uma página só, com o texto trocado por JavaScript conforme o idioma.

**Porquê.** o projeto é "sem build" de propósito, e o texto de apoio, o rodapé e o `<noscript>` têm de existir no HTML para a busca e para quem está sem JavaScript. A opção (b) entrega uma página sem texto até o script rodar e dá um endereço só para dois idiomas, o que quebra o `hreflang`.

**Trade-off.** cerca de 200 linhas de HTML duplicadas. O teste de esqueleto (RF-01) falha se um id, uma classe ou a ordem divergirem, então a duplicação não envelhece sozinha.

### ADR-2 — Uma entrada por idioma, com o catálogo importado de forma estática (RF-02, RF-07, RNF-03)

**Decisão.** `entrada-pt.js` e `entrada-en.js` têm três linhas: importam `iniciarPagina` e o `textos` do idioma e chamam um com o outro. Cada HTML carrega só a sua entrada.

**Alternativas.** (a) `pagina.js` lê `<html lang>` e faz `import()` dinâmico do catálogo; (b) os dois catálogos juntos, escolhidos em tempo de execução; (c) `navigator.language`.

**Porquê.** com `import` estático o navegador baixa a página e o catálogo em paralelo; com `import()` dinâmico o catálogo só começa depois de a página executar, um passo de rede a mais antes de o formulário funcionar (RNF-03). A (b) faz a página em inglês baixar o português e o contrário. A (c) é proibida (RF-07).

**Trade-off.** dois arquivos de três linhas. O teste confere que cada HTML aponta para a entrada do próprio idioma e que a entrada importa o catálogo do mesmo idioma.

### ADR-3 — O catálogo entra como parâmetro, não como `import` dos módulos (RF-03, RF-04)

**Decisão.** `apresentacao.js`, `escada.js` e `selo.js` deixam de importar texto e passam a receber `textos` como primeiro parâmetro (`apresentarDmarc(textos, estado)`, `montarEscada(textos, dmarc)`). O `verificador.js` não precisa de `textos`: o único texto que ele importava (`semMotivo`) vira o código `sem-motivo` pelo ADR-5, e a frase sai do catálogo na hora de mostrar.

**Alternativas.** (a) uma variável do módulo que a entrada preenche (`definirIdioma`); (b) cada módulo importa o catálogo e uma chave de idioma escolhe o arquivo.

**Porquê.** é o mesmo estilo de injeção que o projeto já usa para a rede (`consulta`); dá teste de cada função com o catálogo que o teste escolher, nos dois idiomas, sem estado global para limpar entre testes.

**Trade-off.** muda a assinatura de uns 12 exports e a chamada de cada um nos testes. A mudança é mecânica e entra numa etapa só, sem mudar nenhuma frase (a página em português fica idêntica).

### ADR-4 — O tipo do catálogo vem do português; a paridade é conferida em dois níveis (RF-04)

**Decisão.** `Textos` é `typeof import("./pt/index.js").textos`, e `en/index.js` é anotado com `@type {Textos}`. O `tsc` (já no portão) recusa chave faltando ou sobrando. Um teste de paridade confere o que o tipo não vê: os marcadores `{nome}` de cada texto, o número de trechos entre crases e a ausência de texto vazio.

**Alternativas.** só o teste; ou um esquema JSON separado.

**Porquê.** o tipo pega o erro no editor, antes do CI, e não custa um arquivo novo. O teste cobre os valores, que o tipo não alcança (`string` é `string`).

**Trade-off.** o português é a referência: acrescentar texto começa por ele. Isso já é o fluxo do projeto.

### ADR-5 — Recusa e falha viram código estável mais dado, com o texto no catálogo (RF-03)

**Decisão.** os oito módulos listados em RF-03 devolvem `{ ok: false, motivo: "<código>", valor? }`. O número que o texto precisa (o status HTTP, o `Status` do DNS) vai em `valor` e é encaixado pelo `preencher` que já existe (`{valor}`). Os números fixos (253 caracteres, 63 por parte, 10 consultas) ficam escritos nos dois catálogos, como hoje.

**Alternativas.** (a) devolver uma função que monta a frase por idioma; (b) manter a frase em português e traduzir por tabela reversa (frase → inglês); (c) um objeto `{ codigo, dados: {...} }`.

**Porquê.** a (a) põe lógica de texto de volta nos módulos puros; a (b) quebra se alguém mudar uma vírgula. A (c) é mais geral do que os 20 códigos pedem: só duas recusas carregam um dado, e é um dado só. O código segue o precedente de `seletor-dkim.js`.

**Trade-off.** o campo `motivo` muda de significado (de frase para código), então todo consumidor muda de uma vez: `pagina.js` (erro do campo), `apresentacao.js` (`mensagemDeFalha`, seletores recusados) e `tipos.js`. O teste de cobertura de códigos (RF-03) falha se um código emitido não tem texto ou o contrário, e roda para cada idioma.

### ADR-6 — Links reais, com o `?dominio=` acrescentado pelo script (RF-05, RF-07)

**Decisão.** os links de idioma são `<a href="/">` e `<a href="/en/">` no HTML estático, e funcionam sem JavaScript. O `pagina.js` guarda o `href` de cada link como base e, no evento `input` do campo e ao fim de cada verificação, regrava o `href` como `base + montarEnderecoIdioma(texto)`: `""` se o campo está vazio, senão `?dominio=` com o texto do campo, aparado, cortado no limite do `endereco.js` e codificado por `URLSearchParams`.

**Alternativas.** (a) botões que chamam `location.assign` na hora do clique; (b) gerar os links por script.

**Porquê.** com o `href` já pronto, o clique do meio, "abrir em nova aba" e "copiar link" levam o domínio junto; com a (a) só o clique simples levaria. O texto do campo (e não o normalizado) é o que vai: o visitante pode ter digitado e ainda não verificado, e quem normaliza é o envio da outra página, como sempre (ADR-8 da spec 006). Montar o `href` com a base fixa e `URLSearchParams` não deixa o texto digitado virar esquema (`javascript:`) nem marcação.

**Trade-off.** o script reescreve dois atributos a cada tecla. É barato e o teste cobre o caso vazio, o caso longo e o caso hostil (`<script>`, `javascript:`, `%00`).

**Acessibilidade.** o nome acessível é `"PT: Português"` e `"EN: English"`: contém o texto visível (WCAG 2.5.3, quem fala "clicar PT" funciona) e diz o idioma por extenso, no próprio idioma (RF-05). O `lang` do link faz o leitor de tela pronunciar cada nome na língua certa.

### ADR-7 — `hreflang`, `canonical` e sitemap escritos à mão e conferidos por teste (RF-06, RNF-08)

**Decisão.** as tags e o sitemap são arquivos escritos; o `test/descoberta.test.js` deriva os endereços esperados da rota do `wrangler.json`, confere que o `canonical` de cada página é ela mesma, que os `hreflang` são recíprocos (cada página cita a outra e a si mesma), que o `x-default` aponta para `/` e que o sitemap lista exatamente as duas páginas.

**Alternativa.** gerar o sitemap por script.

**Porquê.** são duas URLs; um gerador custa mais que o teste. O erro típico de `hreflang` (uma ponta sem a volta) é o que o teste pega.

**Trade-off.** acrescentar um terceiro idioma, um dia, exige tocar todos os `<head>` (o teste diz quais).

### ADR-8 — A imagem social em inglês nasce do mesmo método da portuguesa (RF-06; pergunta 3)

**Decisão.** a `social-pt.png` é gerada pelo Chrome a partir do HTML ao lado dela (o comando está no cabeçalho do HTML). A inglesa segue igual: um `…-social-preview-en.html` com o mesmo desenho e o texto traduzido, gerado para `docs/images/…-en.png` e copiado para `public/social-en.png`. O `test/imagem-social.test.js` passa a rodar para os dois: 1280 × 640, até 1 MB, mesmo `<path>` do logo, e o PNG de `public/` idêntico, byte a byte, ao de `docs/images/`.

**Alternativa.** desenhar o PNG à mão ou em outra ferramenta.

**Porquê.** o logo e a escada continuam vindo do mesmo SVG e dos mesmos textos; a versão em inglês não pode envelhecer sem aviso do teste.

**Trade-off.** o HTML da imagem em inglês copia o da portuguesa (236 linhas) e muda só o texto; o texto da escada na imagem é o do catálogo da página, e o teste de imagem confere os títulos dos degraus, como já confere para o português.

### ADR-9 — `/en/` dentro de `public/`, com tudo o mais compartilhado (RF-01, RF-08)

**Decisão.** `public/en/` só tem `index.html` e `404.html`. CSS, fontes, favicon, ícone e módulos são os da raiz, citados por caminho absoluto (como a 404 já faz). Nada é copiado para dentro de `en/`.

**Alternativas.** um projeto de hospedagem por idioma; copiar os assets para `en/`.

**Porquê.** a rota do `wrangler.json` e o `_headers` (`/*`) já cobrem `/en/*`; a 404 "mais próxima" da hospedagem (spec 007, `not_found_handling: "404-page"`) serve `en/404.html` para qualquer caminho sob `/en/`. Com os assets compartilhados, um módulo corrigido vale nos dois idiomas no mesmo deploy.

**Trade-off e o que ainda não foi medido.** o `html_handling: "auto-trailing-slash"` deve responder `/en` com um redirecionamento para `/en/`; o RF-08 trata o redirecionamento como "servir". Isso, e a 404 de `/en/…`, são conferidos no endereço real na etapa da hospedagem (`scripts/conferir-hospedagem.mjs`), não presumidos aqui.

### ADR-10 — O idioma é o endereço; o que o proíbe é o lint (RF-07)

**Decisão.** a regra de ESLint de `public/**` (a mesma que proíbe `innerHTML`) passa a proibir também `navigator.language`, `navigator.languages`, `localStorage`, `sessionStorage`, `indexedDB` e `document.cookie`, com um teste em `test/lint-dom.test.js` que alimenta cada um e espera a recusa.

**Alternativa.** só convenção no `CLAUDE.md`.

**Porquê.** "sem rastreador" é uma promessa da página; promessa vira teste (a regra de `innerHTML` é o precedente).

**Trade-off.** se um dia o projeto precisar de armazenamento local, a regra é desligada de propósito, numa spec.

### ADR-11 — Chave faltando é erro de CI; o que sobra em produção é a frase genérica no idioma da página (RF-03, RF-04; pergunta 2)

**Decisão.** não há camada de "cair para o outro idioma". O tipo (ADR-4) e o teste de paridade tornam a chave faltando impossível de mesclar. As guardas que já existem ficam, escritas no catálogo e no idioma da página: o achado sem entrada usa `achados.generico` (sem o código cru além do trecho em fonte de código que ele já mostra), e a recusa ou falha sem entrada usa `interface.falha.semMotivo`.

**Alternativa.** cair para o português.

**Porquê.** mostrar o português numa página em inglês esconde o erro de quem deveria vê-lo no CI, e para um leitor de tela é uma frase na língua errada.

**Trade-off.** nenhum comportamento novo a manter; o `textoGenerico` de hoje só muda de lugar.

### ADR-12 — Entrega em etapas que deixam a `main` verde e a página em português idêntica até o fim (RF-03, RNF-01)

**Decisão.** quatro etapas, um PR cada: (1) o `motivo` vira código; (2) o catálogo vira `textos/pt/`, com injeção, `iniciarPagina` e a entrada em português; (3) o inglês (catálogo, páginas, seletor, descoberta, imagem); (4) a conferência de ponta a ponta no ar. Até a etapa 3, quem visita vê exatamente a página de hoje.

**Alternativa.** um PR só.

**Porquê.** as etapas 1 e 2 mexem em quase todo módulo sem mudar uma frase; separadas, a revisão confere "nada mudou" com os testes que já existem, e o inglês entra num PR que só soma.

**Trade-off.** a etapa 2 deixa o catálogo com um idioma só, e a paridade fica trivial até a etapa 3. O teste de paridade já é escrito na etapa 2, sobre a lista de idiomas do teste (`["pt"]`), e a etapa 3 acrescenta `"en"`.

## Impacto

- **Código:** `pagina.js` (de módulo com efeito ao importar para `iniciarPagina`), as assinaturas listadas no ADR-3 e os oito módulos do ADR-5. Os parsers de DMARC, SPF e DKIM só mudam se emitirem `motivo`; nada nas regras.
- **Testes:** os que chamam as funções do ADR-3 passam o catálogo em português (um ajudante em `test/ajudas/` o entrega); os que comparam `motivo` com frase passam a comparar com código; novos: paridade, estrutura das duas páginas, `hreflang` e sitemap, link de idioma, lint do ADR-10, imagem em inglês, conferência de `/en/`.
- **Documentação:** `CLAUDE.md` (mapa de `public/`, `textos/`, as entradas, a linha de convenção "strings visíveis em português" passa a "no idioma da página"), `docs/stack.md`, `specs/README.md` (linha 008), os dois READMEs (o inglês e a nota do português sobre a página em inglês).
- **Hospedagem e CI:** `_headers` e `wrangler.json` não mudam. `producao-*.json` e `mobile.json`/`desktop.json` ganham as URLs em inglês; a conferência pós-deploy ganha três verificações (`/en/`, `/en` e `/en/<inexistente>`).

## Riscos

| Risco                                                                      | Mitigação                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A refatoração das etapas 1 e 2 muda uma frase em português sem ninguém ver | Os testes atuais comparam as frases; a etapa 2 acrescenta um teste que monta o resultado de um domínio sintético com o catálogo `pt` e compara com a saída de antes |
| Os dois HTMLs divergem com o tempo                                         | O teste de esqueleto (ADR-1) compara ids, classes e a ordem                                                                                                         |
| Tradução ruim ou termo técnico traduzido por engano                        | O mantenedor revisa o catálogo `en/` antes do merge (RNF-06); o teste de paridade garante que `p=none`, `~all` e demais trechos entre crases ficam intactos         |
| `/en` e a 404 sob `/en/` não se comportarem como a spec 007 supõe          | Conferidos no endereço real na etapa 4; se diferirem, o ajuste é na spec e no teste, sem mudar `public/`                                                            |
| Link de idioma com texto hostil do campo                                   | `href` montado com base fixa e `URLSearchParams`; teste com `javascript:`, `<script>` e `%00`                                                                       |
| Lighthouse da página em inglês cair abaixo dos limites                     | A página em inglês mede-se em CI como a portuguesa (RF-08); o peso não cresce, porque cada página baixa um catálogo só                                              |
| O plano previa um catálogo de orientações de DKIM                          | O código mostrou que `seletores-dkim.js` não tem frase; a spec não cria catálogo sem texto para traduzir (ver Componentes)                                          |

## Testes

1. **Lógica:** cada função do ADR-3 tem teste com o catálogo `pt` e, a partir da etapa 3, com o `en`, sobre as mesmas entradas, e os testes comparam o **resultado estrutural** (selo, degrau, códigos de achado, seletores) entre os idiomas (RF-02).
2. **Recusa e falha:** cada código do ADR-5 tem um teste que provoca a recusa e confere o código e o `valor`; o teste de cobertura varre o código-fonte dos módulos pelos códigos emitidos, como o de achados já faz.
3. **Paridade:** chaves (pelo tipo), marcadores `{nome}`, trechos entre crases e textos não vazios, para cada par de idiomas.
4. **Entrada hostil:** o `?dominio=` com `<script>` e `javascript:` no link de idioma (ADR-6); um registro TXT com marcação continua virando texto puro na página em inglês (RF-02).
5. **Páginas:** esqueleto idêntico, `lang`, `title`, `description`, `canonical`, `og:*`, `hreflang` recíproco, ausência dessas tags nas 404, entrada e catálogo do mesmo idioma, sem `style=` nem script inline, CSP igual à de `_headers`.
6. **Registro DNS em teste é sempre sintético**, como em todas as specs.
7. **Qualidade:** `format:check`, `lint`, `typecheck` e `test` verdes ao fim de cada etapa, com o resultado real registrado nas tarefas; na etapa 4, NVDA em português e em inglês e o Lighthouse do endereço real.
