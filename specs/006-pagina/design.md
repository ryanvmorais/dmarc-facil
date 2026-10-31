---
feature: Página — o visitante digita o domínio e vê DMARC, SPF e DKIM explicados em português, com o próximo passo
status: aprovado
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh, 003-parser-dmarc, 004-parser-spf, 005-dkim]
origin: conception
---

# 006 — Página — design

## Visão geral

A página é **uma tela só** (`public/index.html`) mais a `public/404.html`, com um CSS (`public/css/pagina.css`) e módulos ES em `public/js/`, sem build. A lógica de decisão (qual selo, qual degrau, qual texto, que mensagem de falha) mora em **módulos puros**, testados com `node --test`; só dois arquivos tocam o DOM (`dom.js` e `pagina.js`), e o que lê a rede recebe a função de consulta por parâmetro, como nas specs 004 e 005.

```text
                          pagina.js  (liga eventos, desenha; único que usa document e history)
                               │
        ┌──────────────┬───────┴────────┬───────────────┐
     dom.js        verificador.js    endereco.js   apresentacao.js ── selo.js
 (criar nós,      (orquestra as 3     (?dominio=)    (view models)  └─ escada.js
  só textContent)  partes, cancela)                       │
                         │                       textos-achados.js, textos-interface.js (dados)
          consultarTxt · lerDmarc · lerSpfComConsultas · buscarDkim   (specs 002 a 005, sem mudança)
```

### Mockup aprovado

O Ryan aprovou em 2026-10-31 o mockup no [Artifact](https://claude.ai/artifact/VPDUjkidb1Fr6rGu3MpFSH), nestas artboards:

| Artboard                         | Largura | Decisão                                                                                                                  |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Celular-C.dc.html`              | 390 px  | Interface C: escada, cartões, bloco do MailVigil                                                                         |
| `Desktop-C-coluna.dc.html`       | 1280 px | **Aprovado**: coluna única de 720 px, mesma ordem do celular                                                             |
| `Desktop-C-duas-colunas.dc.html` | 1280 px | Descartado (ADR-3)                                                                                                       |
| `Celular-C-estados.dc.html`      | 390 px  | **Aprovado**: recusa do domínio, verificando, SPF com problema, DKIM não achado, falha de uma parte, domínio inexistente |
| `Erro-404-celular.dc.html`       | 390 px  | **Aprovado**                                                                                                             |
| `Erro-404-desktop.dc.html`       | 1280 px | **Aprovado**                                                                                                             |

O mockup desenha com Google Fonts e `style=""`; a página real não faz nenhuma das duas coisas (ADR-9 e ADR-10). Os tokens do mockup viram custom properties no CSS (azul `#2563eb`, fundo `#f8fafc`, cartão branco com borda `#e2e8f0` e raio 12 px, botão de 48 px com raio 10 px, selos com ícone). Texto `[provisório]` do mockup vira o atributo `data-provisorio` (ADR-7); o visitante não vê a marca.

## Componentes

### Arquivos novos

| Arquivo                                 | O que faz                                                                                                                 | Toca DOM/rede |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `public/index.html`                     | Cabeçalho com logo, formulário, região de resultado vazia, rodapé, `<noscript>`, CSP por `<meta>`                         | —             |
| `public/404.html`                       | Logo, frase, link de volta; sem script; caminhos absolutos                                                                | —             |
| `public/css/pagina.css`                 | Tokens, layout, cartões, selos, escada, foco, `prefers-reduced-motion`; sem `@import` nem URL externa                     | —             |
| `public/fonts/*.woff2`                  | Sora 800 e JetBrains Mono 400, subconjunto latino, com a licença OFL ao lado                                              | —             |
| `public/js/selo.js`                     | `calcularSelo` (puro)                                                                                                     | não           |
| `public/js/escada.js`                   | `montarEscada` (puro)                                                                                                     | não           |
| `public/js/textos-achados.js`           | Dados: `TEXTOS_ACHADOS` e `textoDoAchado` (com texto genérico para código desconhecido)                                   | não           |
| `public/js/textos-interface.js`         | Dados: textos fixos montados por script (degraus, mensagens de falha, rótulos de estado)                                  | não           |
| `public/js/apresentacao.js`             | View models de cada cartão, `lerSeletoresDigitados`, `cortarTexto`, `resumoConsultas`, `mensagemDeFalha`                  | não           |
| `public/js/endereco.js`                 | `lerDominioDoEndereco` e `montarEndereco` (puros, recebem e devolvem texto)                                               | não           |
| `public/js/verificador.js`              | `criarVerificador({ consulta })`: dispara as três partes, cancela a verificação anterior, devolve o estado por parte      | rede injetada |
| `public/js/dom.js`                      | `criar`, `urlHttps`: monta nós com `textContent`, lista de tags e atributos permitidos; recebe o `document` por parâmetro | DOM injetado  |
| `public/js/pagina.js`                   | Liga formulário, `history.replaceState`, `aria-live`, foco; desenha os view models com `dom.js`                           | DOM, rede     |
| `scripts/listar-textos-provisorios.mjs` | Lista os textos marcados (`pnpm textos:provisorios`)                                                                      | —             |
| `lighthouserc.json`                     | Limites do Lighthouse CI                                                                                                  | —             |

### Mudanças em arquivos existentes

- `public/js/doh.js`: **só** exporta `RESOLVEDORES` (para o teste da CSP comparar os hosts). Nenhum comportamento muda.
- `eslint.config.mjs`: regra de lint de RF-11 para `public/**`.
- `package.json`: script `textos:provisorios` e, na etapa do Lighthouse CI, a ferramenta como dependência de desenvolvimento.
- `.github/workflows/`: job de Lighthouse CI.
- `specs/README.md`, `README.md`, `README.en.md`, `CLAUDE.md`, `docs/stack.md`: `v0.6`, arquitetura e a nova stack, na etapa de fechamento.

## Modelo de dados

### Estado de cada parte

Cada uma das três partes (`dmarc`, `spf`, `dkim`) passa por `verificando` → `pronto` ou `falha`. O `verificador` entrega ao `pagina.js` este objeto, a cada mudança:

```js
/** @typedef {{ parte: "dmarc" | "spf" | "dkim", fase: "verificando" | "pronto" | "falha",
 *              resultado?: object, motivo?: string, resolvedores?: string[] }} EstadoParte */
/** @typedef {{ dominio: string, geracao: number, dominioInexistente: boolean,
 *              partes: { dmarc: EstadoParte, spf: EstadoParte, dkim: EstadoParte } }} EstadoVerificacao */
```

`resultado` é o que a função da spec 003, 004 ou 005 devolveu, sem tradução. `motivo` é o texto em português que `consultarTxt` já devolve quando falha.

### View model de um cartão

```js
/** @typedef {{ estado: "ok" | "atencao" | "problema" | "nao-verificado", texto: string }} Selo */
/** @typedef {{ codigo: string, gravidade: "erro"|"aviso"|"info", titulo: string, explicacao: string,
 *              acao: string, tag?: string, detalhe?: string, seletor?: string }} AchadoVisivel */
/** @typedef {{ id: "dmarc"|"spf"|"dkim", titulo: string, fase: "verificando"|"pronto"|"falha",
 *              selo: Selo, resumo: string, registro?: string, achados: AchadoVisivel[],
 *              extra?: object }} Cartao */
```

`texto` do selo é uma de quatro palavras fixas ("OK", "Atenção", "Problema", "Não verificado"). `registro` é o texto cru do TXT, já cortado por `cortarTexto` (RF-11). `extra` carrega o que é de uma parte só: no DKIM, a lista de seletores tentados e as recusas do campo livre.

### Degrau da escada

```js
/** @typedef {{ politica: "none"|"quarantine"|"reject", papel: "atual"|"proximo"|"outro",
 *              titulo: string, resumo: string, acao?: string }} Degrau */
/** @typedef {{ degraus: Degrau[], semAtual: boolean, proximo: "quarantine"|"reject"|"publicar"|null,
 *              ressalvas: ("subdominios-mais-fracos"|"aplicacao-parcial")[] }} Escada */
```

`acao` só existe no degrau com `papel: "proximo"`. `proximo: "publicar"` vale quando o registro está ausente, inválido ou duplicado (RF-03); `null` quando o `estagio` já é `reject`.

### Entrada do catálogo

```js
/** @typedef {{ titulo: string, explicacao: string, acao: string, provisorio: boolean }} TextoAchado */
export const TEXTOS_ACHADOS = { "monitoramento-apenas": {/* ... */} /* ... um por código */ };
```

## Interfaces

```js
// selo.js
calcularSelo(parte, estadoParte) → Selo

// escada.js
montarEscada(dmarc) → Escada           // dmarc = resultado de lerDmarc

// apresentacao.js
apresentarDmarc(estadoParte)  → Cartao
apresentarSpf(estadoParte)    → Cartao   // resumo: "N de 10 consultas", "pelo menos N" se incompleta
apresentarDkim(estadoParte, extras) → Cartao
lerSeletoresDigitados(texto) → { validos: string[], recusados: { texto: string, motivo: string }[] }
cortarTexto(texto, maximo) → { texto: string, cortado: boolean }
mensagemDeFalha(estadoParte) → string

// textos-achados.js
textoDoAchado(achado) → AchadoVisivel   // texto genérico com o código quando não está no catálogo

// endereco.js
lerDominioDoEndereco(busca) → string                 // "" quando não há ou não é texto
montarEndereco(dominio) → string                     // "?dominio=exemplo.com.br"

// verificador.js
criarVerificador({ consulta, seletoresComuns, aoMudar }) → {
  verificar(dominioDigitado, seletoresExtras?) → Promise<void>,   // normaliza, dispara, cancela a anterior
  refazer(parte) → Promise<void>,                                 // tenta de novo uma parte só
  refazerDkim(seletoresExtras) → Promise<void>                    // RF-06: só o DKIM
}

// dom.js
criar(documento, tag, atributos?, filhos?) → Node
urlHttps(texto) → string | null                       // só https vira href
```

`consulta` é `consultarTxt` no navegador e uma falsa nos testes. `aoMudar(estado: EstadoVerificacao)` é chamado a cada transição, sempre com a `geracao` atual.

## Decisões (ADRs)

### ADR-1 — Duas páginas HTML, módulos ES, sem framework nem build

**Decisão.** `index.html` carrega `js/pagina.js` com `<script type="module">`; sem bundler, sem biblioteca, sem componente. O HTML tem o que existe antes do JavaScript (cabeçalho, formulário, aviso de privacidade, `<noscript>`); o resultado é desenhado por script dentro de uma região vazia.
**Alternativas.** um framework de componentes (peso e dependência de runtime, contra a regra do projeto); renderizar tudo no servidor (não há servidor).
**Porquê.** o projeto é JavaScript puro por decisão (`CLAUDE.md`), e a tela tem quatro regiões. O formulário e o texto de privacidade existirem no HTML estático deixa o Lighthouse e quem desliga o JavaScript verem a página de verdade.
**Trade-off.** o desenho do resultado é código imperativo (`criar(...)` aninhado). Compensa a pouca variação: três cartões e uma escada.

### ADR-2 — Lógica pura de um lado, DOM do outro

**Decisão.** `selo`, `escada`, `apresentacao`, `textos-*`, `endereco` e `verificador` não importam `document`, `window` nem `fetch`. `dom.js` recebe o `document` por parâmetro. Só `pagina.js` usa os globais.
**Alternativas.** testar a página inteira num navegador (lento, frágil, fora do que o projeto já usa); `jsdom` (ADR-9).
**Porquê.** é o padrão das specs 001 a 005 (RNF-02) e o que deixa cada regra de RF-03 a RF-08 testável por chamada de função.
**Trade-off.** o `pagina.js` fica sem teste unitário direto; por isso ele é fino (liga evento, chama `apresentar*`, chama `criar`) e o ataque do TXT hostil é testado no `criar` com um documento falso (ADR-9).

### ADR-3 — Interface C em coluna única, 720 px

**Decisão.** no desktop, a página é uma coluna centrada de 720 px (formulário, resultado), na mesma ordem do celular. O Ryan aprovou o "Desktop 1" em 2026-10-31.
**Alternativas.** "Desktop 2", escada à esquerda e cartões à direita (usa melhor os 1280 px).
**Porquê.** um único layout para testar nas duas larguras, a escada continua sendo o destaque (no Desktop 2 ela ficaria do mesmo peso visual dos cartões e o "Próximo passo" perderia força) e o texto longo dos achados lê melhor em 720 px.
**Trade-off.** sobra espaço nas laterais em tela larga. Aceito: é o preço da leitura e da simplicidade.

### ADR-4 — Cancelar a verificação anterior por geração, sem `AbortSignal`

**Decisão.** o `verificador` guarda um contador `geracao`. Cada `verificar` incrementa o contador e cada resposta confere se ainda é a atual antes de chamar `aoMudar`; resposta de geração antiga é descartada. As consultas em andamento terminam sozinhas e o resultado não é usado.
**Alternativas.** passar `AbortSignal` a `consultarTxt` e aos módulos 004 e 005 (muda as specs 002, 004 e 005, que não aceitam sinal hoje).
**Porquê.** RF-02 pede "nunca mistura dois domínios", e descartar a resposta garante isso sem mexer em módulo concluído.
**Trade-off.** consultas descartadas ainda consomem a rede até acabarem (no pior caso, o tempo limite de 5 s por resolvedor). O botão de verificar não se repete com a mesma consulta idêntica em andamento (RF-02), então não há acúmulo.

### ADR-5 — "Domínio não existe" vem da consulta do próprio domínio

**Decisão.** o `verificador` envolve a `consulta` e anota a `situacao` da consulta cujo nome é o domínio sem prefixo (a primeira que a caminhada do SPF faz). `inexistente` (NXDOMAIN) ali marca `dominioInexistente: true`, e a página troca os três cartões pelo aviso "não encontrei esse domínio". Se essa consulta falhar por rede, a flag fica falsa e a falha aparece no cartão do SPF.
**Alternativas.** olhar NXDOMAIN nos três (como o RF-02 dizia): errado, porque `_dmarc.exemplo.com.br` e `<seletor>._domainkey.exemplo.com.br` dão NXDOMAIN em qualquer domínio que existe mas não publica esses nomes; consulta extra só para existência (uma consulta a mais sem necessidade).
**Porquê.** NXDOMAIN no próprio domínio é o único sinal de que ele não existe; o SPF já faz essa consulta.
**Trade-off.** DMARC e DKIM já estão em andamento quando a flag chega; seus resultados são descartados. O RF-02 foi ajustado para dizer isso.

### ADR-6 — Selo: função pura, uma regra para as três partes

**Decisão.** `calcularSelo(parte, estadoParte)`:

1. `fase: "falha"` → `nao-verificado`.
2. DMARC e SPF: `situacao` `ausente`, `invalido` ou `multiplos` → `problema`; `valido` → o pior `gravidade` dos achados (`erro` → `problema`, `aviso` → `atencao`, senão `ok`).
3. DKIM: `encontrado` → o pior `gravidade` dos achados; `nao-encontrado` → `atencao` (o achado `nenhum-seletor-encontrado` é `info`, mas o resultado precisa de aviso: não achar não é erro, mas também não é "tudo bem"); `indeterminado` → `nao-verificado`.
4. `incompleta: true` sem achado pior sobe `ok` para `atencao`.
   **Alternativas.** o selo calculado dentro de cada `apresentar*` (três cópias da mesma regra); selo vindo dos módulos (eles não têm texto de interface, e gravidade ≠ selo).
   **Porquê.** RF-07 quer uma regra testada que valha para os três cartões.
   **Trade-off.** `nao-encontrado` sendo `atencao` é uma decisão de produto codificada aqui, com teste que a nomeia (para não ser "corrigida" sem querer).

### ADR-7 — Catálogo de textos em arquivo de dados, cobertura por varredura do código

**Decisão.** `TEXTOS_ACHADOS` tem uma entrada por código de achado, com `titulo`, `explicacao`, `acao` e `provisorio`. O teste de cobertura lê as fontes de `dmarc.js`, `spf.js`, `spf-consultas.js`, `dkim.js` e `dkim-busca.js` e extrai os códigos pelos três padrões que o código usa (`codigo: "x"`, `achar("x"` e `("x", "gravidade"`); falha se faltar entrada ou sobrar entrada. Os textos fixos da interface ficam em `textos-interface.js` quando montados por script e no HTML quando estáticos; ambos usam `provisorio` (campo) ou `data-provisorio` (atributo HTML), e `pnpm textos:provisorios` lista os dois.
**Alternativas.** exportar `CODIGOS` de cada módulo (mexe em módulos concluídos e a lista pode divergir do que é emitido); rodar os parsers com fixtures e coletar os códigos (só pega o que a fixture provoca).
**Porquê.** a varredura enxerga todo código escrito no fonte, inclusive os que nenhum teste provoca. Um quarto padrão no futuro faria o teste falhar por entrada que sobra, não calar.
**Trade-off.** a varredura é textual e acopla o teste ao jeito de escrever achados. Mitigado por um teste que confere que cada um dos cinco arquivos rende pelo menos um código (se o padrão mudar, a varredura vazia falha alto).

### ADR-8 — Endereço compartilhável: preencher, não verificar

**Decisão.** ao abrir `?dominio=x`, `pagina.js` preenche o campo (via `.value`) e **não** consulta. Ao verificar, atualiza o endereço com `history.replaceState` (sem criar entrada no histórico). `lerDominioDoEndereco` devolve só texto; a normalização continua sendo do `normalizarDominio` no envio.
**Alternativas.** verificar ao abrir (um link alheio dispararia consulta ao resolvedor sem o visitante pedir); `pushState` (o botão Voltar andaria por verificações).
**Porquê.** decisão do Ryan (RF-01 e perguntas resolvidas) e coerente com a privacidade: o visitante decide quando o domínio sai do navegador.
**Trade-off.** o link compartilhado exige um clique a mais de quem recebe.

### ADR-9 — DOM sem `innerHTML`: `criar` com `textContent`, regra de lint e documento falso nos testes

**Decisão.** todo nó sai de `criar(documento, tag, atributos, filhos)`: `createElement` para uma lista fixa de tags (`div`, `p`, `h2`, `h3`, `ol`, `ul`, `li`, `span`, `a`, `details`, `summary`, `button`, `form`, `label`, `input`, `svg`, `path`), atributos de uma lista fixa (`class`, `id`, `href`, `rel`, `type`, `value`, `for`, `aria-*`, `role`, `disabled`, `tabindex`, atributos de SVG), filhos como texto (`createTextNode`/`textContent`) ou nós. Atributo `on*`, `style` ou fora da lista é recusado. `href` só passa por `urlHttps`. A regra de lint de RF-11 (`no-restricted-properties` para `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, mais `no-eval` e `no-new-func`) vale para `public/**`. O teste de lint roda a API do ESLint sobre trechos com cada forma proibida e espera erro. O teste de DOM usa um **documento falso** de umas 40 linhas que registra o que foi criado e **lança** se alguém atribuir `innerHTML`; alimenta TXT com `<script>`, `<img onerror>`, `javascript:` e texto de 100 KB e confere que tudo virou texto.
**Alternativas.** `jsdom` ou `linkedom` como dependência de desenvolvimento (peso, superfície de cadeia de suprimentos e atraso de uma semana do `minimumReleaseAge` por dependência nova, para testar uma função de 60 linhas); só a regra de lint (não pega `setAttribute("onerror", ...)` nem `href` perigoso).
**Porquê.** o ⚠️ do `CLAUDE.md` pede defesa em duas camadas (proibir a forma e testar o ataque), e o `criar` fecha também atributo e URL, que o lint não vê.
**Trade-off.** o documento falso não prova que o navegador real se comporta igual. Mitigado por `criar` só usar `createElement`, `createElementNS` (SVG), `createTextNode`, `setAttribute` e `append`, todas triviais.

### ADR-10 — Content-Security-Policy por `<meta>`, sem estilo inline

**Decisão.** `index.html` e `404.html` declaram `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src https://cloudflare-dns.com https://dns.google; base-uri 'none'; form-action 'none'` (o `404.html` não precisa de `connect-src` nem de `script-src`). Por isso a página **não usa `style=""`**: tudo é classe do `pagina.css`, inclusive a largura dos "esqueletos" do estado verificando; o SVG do logo usa o atributo `fill-rule="evenodd"`. Um teste confere o `connect-src` contra os hosts de `RESOLVEDORES` e que nenhum arquivo de `public/` tem `style=` nem `<script>` com origem externa.
**Alternativas.** `style-src 'unsafe-inline'` (enfraquece a política por conveniência); cabeçalho HTTP (depende da hospedagem).
**Porquê.** é a defesa em profundidade contra o que o ADR-9 não previr, e custa só disciplina de CSS.
**Trade-off.** `<meta>` não aceita `frame-ancestors` nem `report-uri`; a hospedagem pode reforçar com cabeçalhos.

### ADR-11 — Fontes: sistema no corpo, Sora 800 e JetBrains Mono locais

**Decisão.** o corpo usa `system-ui` (decisão do Ryan). Sora 800 (títulos e nome) e JetBrains Mono 400 (registros) vêm de `public/fonts/` em `woff2`, subconjunto latino, com `font-display: swap`, mais o arquivo de licença OFL. O CSS declara `@font-face` com URL relativa à própria folha.
**Alternativas.** Inter local (+100 KB); Google Fonts por CDN (proibido).
**Porquê.** zero byte de fonte no corpo e só dois arquivos pequenos, o que ajuda o orçamento de 150 KB (RNF-04).
**Trade-off.** o texto do corpo muda de aparência por sistema operacional. Aceito.

### ADR-12 — Região `aria-live` e foco no resultado

**Decisão.** uma região `role="status"` (`aria-live="polite"`) fora da área de resultado recebe frases curtas ("Verificando exemplo.com.br", "Resultado pronto: DMARC em atenção, SPF ok, DKIM ok"). Quando as três partes terminam, o `h2` "Resultado para <domínio>" recebe `tabindex="-1"` e o foco. Cartões que mudam de estado não são `aria-live` (seriam três anúncios simultâneos).
**Alternativas.** `aria-live` em cada cartão; sem anúncio.
**Porquê.** RF-13; um único anúncio resumido é o que um leitor de tela consegue acompanhar.
**Trade-off.** o resumo falado é montado por `apresentacao.js` e precisa de teste para não afirmar mais do que o selo.

### ADR-13 — Lighthouse CI sobre a pasta estática

**Decisão.** `lighthouserc.json` com `staticDistDir: ./public`, as duas páginas, `assert`: acessibilidade = 1, desempenho, boas práticas e SEO ≥ 0.95 (erro abaixo), mobile e desktop. O job roda no CI, no mesmo padrão dos outros workflows (ações fixadas por SHA, `ubuntu-26.04`). `index.html` leva `<title>`, `<meta name="description">` e `<link rel="icon">` (o SVG do logo) para o SEO.
**Alternativas.** medir só no deploy (a hospedagem ainda não existe); limites mais frouxos.
**Porquê.** a regra do Ryan manda medir todo projeto que serve página; medir sobre a pasta pega regressão antes do deploy.
**Trade-off.** não exercita a consulta real (o DoH fica de fora); a medida vale para carga, acessibilidade e estrutura.

### ADR-14 — A 404 é estática, com caminhos absolutos

**Decisão.** `404.html` referencia `/css/pagina.css`, `/fonts/...` e `/` (link de volta); não tem script. O logo é o mesmo `<svg>` em linha do `index.html`, e um teste compara o `d` do `<path>` com o de `docs/images/` (o teste `logo.test.js` já guarda esse SVG).
**Alternativas.** caminhos relativos (quebram em `/a/b/c`); logo como arquivo `.svg` externo (uma requisição a mais).
**Porquê.** a hospedagem serve a mesma `404.html` em qualquer caminho (RF-14); o que ela faz com o arquivo é conferido na doc oficial da hospedagem escolhida.
**Trade-off.** o `<path>` do logo fica duplicado em duas páginas; o teste de igualdade evita a divergência.

## Impacto

- **Specs 002 a 005:** nenhuma mudança de comportamento. `doh.js` ganha uma exportação.
- **`CLAUDE.md`:** a árvore de arquitetura ganha os arquivos novos; o ⚠️ de `innerHTML` passa a citar a regra de lint; a seção de qualidade cita o Lighthouse CI.
- **`docs/stack.md`:** Lighthouse CI, fontes locais, CSP por `<meta>`, History API.
- **READMEs:** o status deixa de dizer "a página ainda não existe" quando a spec concluir; linha `v0.6` na tabela de marcos.
- **Memória do projeto:** estado da spec 006 e do Lighthouse CI.

## Riscos

- **Fonte `woff2` de origem externa.** Os dois arquivos precisam vir de uma fonte confiável (o repositório oficial de cada fonte) e ser conferidos por hash; a licença OFL vai junto. Mitigação: baixar uma vez, registrar a origem e o hash no `docs/stack.md`.
- **Varredura textual do ADR-7 frágil.** Mitigada pelo teste que exige código em cada um dos cinco arquivos.
- **Texto do catálogo com afirmação demais.** O teste de frases proibidas (RF-09) pega "você não tem DKIM" e "está protegido", mas não o resto; a revisão dos textos pelo Ryan antes da `1.0.0` é o portão final.
- **Lighthouse CI instável.** Notas variam por execução. Mitigação: limites de 0.95 (não 1.0, exceto acessibilidade) e três execuções por página.
- **`<meta>` de CSP não protege o `<head>` antes dele.** A política vem como a primeira tag depois de `charset`.

## Testes

- `test/selo.test.js`: ADR-6, incluindo `nao-encontrado` → `atencao` com a regra nomeada no teste.
- `test/escada.test.js`: RF-03 (os seis casos), `ressalvas` por `subdominios-mais-fracos` e `aplicacao-parcial`.
- `test/textos-achados.test.js`: ADR-7 (cobertura nos dois sentidos, varredura não vazia, frases proibidas, fallback de código desconhecido).
- `test/apresentacao.test.js`: contagem do SPF ("pelo menos"), seletores digitados (válidos, recusados com motivo, repetidos), lista dos tentados, `cortarTexto`, `mensagemDeFalha` por causa, frase do `aria-live`.
- `test/verificador.test.js`: consulta falsa; as três partes em paralelo e cada uma entrega quando termina; falha de uma parte não derruba as outras; cancelamento por geração (resposta velha descartada); `dominioInexistente` pelo ADR-5 (NXDOMAIN em `_dmarc` sozinho não conta); `refazer` e `refazerDkim` consultam só a parte pedida.
- `test/endereco.test.js`: `?dominio=` presente, ausente, repetido, com texto hostil (só devolve texto).
- `test/dom.test.js`: `criar` recusa tag, atributo e `on*` fora da lista; `urlHttps` (`https` passa; `http`, `javascript:`, `data:`, relativa e malformada não); documento falso lança em `innerHTML`; TXT hostil vira texto.
- `test/lint-dom.test.js`: a API do ESLint recusa cada forma proibida de RF-11 em trechos de `public/`.
- `test/pagina-estatica.test.js`: `lang="pt-BR"`, um `h1`, `label` ligado ao campo, CSP com os hosts de `RESOLVEDORES`, sem `style=` e sem script externo em `public/`, sem `localStorage`/`sessionStorage`/`document.cookie`/`IndexedDB` em `public/js/`, `404.html` com caminhos absolutos e sem `<script>`, `<path>` do logo igual ao de `docs/images/`.
- `scripts/listar-textos-provisorios.mjs` tem teste que o executa sobre um catálogo sintético.
- O Lighthouse CI roda no PR (ADR-13). O portão de qualidade completo roda em todo PR.
