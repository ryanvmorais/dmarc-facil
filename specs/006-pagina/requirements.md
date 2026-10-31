---
feature: Página — o visitante digita o domínio e vê DMARC, SPF e DKIM explicados em português, com o próximo passo
status: aprovado
date: 2026-10-31
related: [001-fundacao, 002-consulta-doh, 003-parser-dmarc, 004-parser-spf, 005-dkim]
origin: conception
---

# 006 — Página

## Contexto e problema

As specs 001 a 005 entregam a lógica: validar o domínio, consultar TXT por DNS-over-HTTPS, ler DMARC, SPF e DKIM e devolver **códigos e dados**, nunca frases (RNF-06 da spec 005, e o mesmo nas specs 003 e 004). Falta a parte que o visitante usa: a página que junta tudo, **escreve o português** de cada achado e diz o próximo passo.

O visitante é quem recebeu "seu DMARC está em `p=none`" de um provedor de e-mail e não sabe o que fazer. A página precisa responder, sem jargão antes da hora, três coisas: **o que o meu domínio publica**, **está certo?** e **o que eu faço agora?** (de `p=none` para `quarantine` e depois `reject`).

A interface foi decidida antes desta spec (mockup no [Artifact](https://claude.ai/artifact/VPDUjkidb1Fr6rGu3MpFSH), aprovado pelo Ryan em 2026-10-31): **interface C**, com a escada `none` → `quarantine` → `reject`, a etiqueta "Próximo passo" no degrau seguinte ao atual, e o cartão de DMARC só com o registro e o selo. O mockup existe em 390 px; o de 1280 px (e o 404) entram no design, antes de qualquer HTML ou CSS (`/nova-interface`).

Quatro regras do projeto pesam aqui e nenhuma pode regredir (`CLAUDE.md`):

- **TXT é dado de terceiros.** Todo texto vindo do DNS entra na página só com `textContent`. Um registro pode conter `<script>`.
- **O domínio vai dentro de uma URL.** O que o visitante digita passa por `normalizarDominio`, e o seletor por `normalizarSeletor`, antes de virar consulta.
- **Sem log e sem rastreador.** Nenhum script de terceiro, nenhum registro de domínios consultados. A página diz ao visitante que o resolvedor DoH (Cloudflare, ou Google no fallback) vê o domínio e o IP, e que os seletores DKIM também vão.
- **DKIM nunca é "você não tem".** O texto é "não encontrei nesses seletores", com a lista dos tentados.

## Objetivos

- **Formulário** de um campo (domínio) e um botão, que dispara as três verificações juntas e mostra cada resultado num cartão que aparece quando a sua parte termina.
- **Escada do DMARC** (interface C): onde o domínio está, qual é o próximo degrau e o que fazer para chegar nele.
- **Cartões de DMARC, SPF e DKIM** com selo (OK, Atenção, Problema ou Não verificado), o dado principal e os achados, cada um explicado em português com o que fazer.
- **DKIM com seletores**: a lista comum já vem tentada; o visitante pode acrescentar os seus (campo livre) e ver a lista dos tentados.
- **Catálogo de textos** de todos os achados, em arquivo de dados, fora da lógica de tela, com cobertura conferida por teste.
- **Privacidade dita na tela**, no lugar onde o visitante decide digitar.
- **Páginas de erro necessárias**: `404.html` com o logo e o link de volta (decisão do Ryan, 2026-10-31).
- **Acessível e responsiva**: de 320 a 1440 px, por teclado, com leitor de tela.
- **Defesa contra marcação**: regra de lint que proíbe as formas de inserir HTML a partir de texto, e um teste que alimenta um TXT hostil.

## Não-objetivos

- **Hospedagem, cabeçalhos HTTP e domínio** `dmarcfacil.ryanmorais.com.br`: fora desta spec. Ela entrega arquivos estáticos que funcionam em qualquer hospedagem; o que a hospedagem faz com a 404 é conferido na doc oficial da hospedagem escolhida.
- **Imagem de pré-visualização social** e `og:image`: só com a página real pronta.
- **Gerar o registro** pronto para colar, ou verificar o alinhamento do DMARC com o `From` de uma mensagem.
- **Ler relatórios DMARC** (`rua`/`ruf`): é o produto MailVigil; a página só aponta para ele.
- **Salvar histórico**, conta, e-mail de aviso ou qualquer estado do visitante entre visitas.
- **Estatística própria**: só a agregada da hospedagem.
- **Internacionalização**: a página é em português do Brasil.
- Mudar o que as specs 002 a 005 devolvem. A página consome as funções como estão.

## Personas

- Como **dono de site ou responsável por TI de empresa pequena**, quero digitar meu domínio e saber em linguagem comum se estou protegido contra falsificação e qual é o próximo passo, sem ler RFC.
- Como **dev ou consultor**, quero ver o registro cru, os achados e a contagem de consultas do SPF, e copiar o endereço do resultado para mandar a um cliente.
- Como **visitante que usa leitor de tela ou só o teclado**, quero preencher, verificar e ler o resultado sem o mouse.
- Como **autor e mantenedor**, quero cada texto de achado num arquivo que se edita sem mexer na lógica, e um teste que falha se um achado novo nascer sem texto.

## Requisitos funcionais

### RF-01 — Formulário e validação do domínio

- **Given** a página aberta
  **When** é carregada
  **Then** mostra o campo "Domínio", o botão "Verificar" e o aviso de privacidade (RF-10) junto do botão, sem resultado e sem nenhuma consulta feita.
- **Given** um domínio digitado
  **When** o visitante aperta o botão ou a tecla Enter
  **Then** o texto passa por `normalizarDominio` e só um resultado `ok: true` dispara consultas.
- **Given** um texto que `normalizarDominio` recusa
  **When** o visitante envia
  **Then** nenhuma consulta sai, e o `motivo` (já em português) aparece junto do campo, ligado a ele por `aria-describedby`, com o foco de volta no campo.
- **Given** um domínio válido digitado com caixa ou espaços diferentes (`Exemplo.COM.br`)
  **When** é verificado
  **Then** o campo e o título do resultado passam a mostrar o domínio normalizado.

### RF-02 — Fluxo da verificação

- **Given** um domínio válido
  **When** a verificação começa
  **Then** as três partes rodam em paralelo (DMARC em `_dmarc.<domínio>` com `consultarTxt` e `lerDmarc`; SPF com `lerSpfComConsultas`; DKIM com `buscarDkim` sobre a lista de RF-06), cada cartão aparece em estado "verificando" e vira resultado quando a sua parte termina, sem esperar as outras.
- **Given** uma das três partes que falha (rede, tempo limite, os dois resolvedores fora)
  **When** acontece
  **Then** só o cartão dela mostra "não consegui consultar" com a causa em português e o botão "Tentar de novo" daquele cartão; os outros cartões seguem.
- **Given** uma verificação em andamento
  **When** o visitante inicia outra (outro domínio, ou o mesmo de novo)
  **Then** a anterior é descartada e nenhuma resposta dela aparece depois: a tela nunca mistura dois domínios.
- **Given** uma verificação em andamento
  **When** o visitante olha o botão
  **Then** ele indica que está verificando e não dispara uma segunda consulta idêntica ao mesmo tempo.
- **Given** um domínio que não existe (NXDOMAIN na consulta do próprio domínio; NXDOMAIN em `_dmarc.` ou `_domainkey.` sozinho é normal e não conta)
  **When** o resultado chega
  **Then** a página diz que não encontrou esse domínio (e sugere conferir a digitação) em vez de mostrar três cartões de "sem registro".

### RF-03 — Escada do DMARC (interface C)

- **Given** um DMARC válido com `estagio` `none`, `quarantine` ou `reject`
  **When** o resultado é mostrado
  **Then** a escada tem os três degraus; o do `estagio` é marcado "você está aqui" (por texto e por forma, não só por cor), o seguinte leva a etiqueta "Próximo passo", e só o degrau seguinte traz as instruções do que fazer para chegar nele.
- **Given** `estagio: "reject"`
  **When** o resultado é mostrado
  **Then** não há "Próximo passo": a escada diz que é o degrau final e a página aponta só os achados que sobraram.
- **Given** `situacao: "ausente"`, `"invalido"` ou `"multiplos"` (`estagio: "nenhum"`)
  **When** o resultado é mostrado
  **Then** nenhum degrau é "você está aqui"; o próximo passo é publicar (ou corrigir) o registro com `p=none`, com o que fazer em cada um dos três casos.
- **Given** a `politica` diferente de `subdominios` (`sp=`) ou um `pct` abaixo de 100 entre os achados
  **When** o resultado é mostrado
  **Then** o texto do degrau diz que a política vale só para parte do tráfego ou dos subdomínios, em vez de afirmar proteção completa.
- **Given** a escada
  **When** o visitante a usa com leitor de tela
  **Then** é uma lista ordenada em que o degrau atual e o próximo são anunciados em texto.

### RF-04 — Cartão de DMARC

- **Given** um registro DMARC lido
  **When** o cartão é mostrado
  **Then** traz o nome "DMARC", o selo (RF-07), o registro cru em fonte monoespaçada e os achados (RF-08); a política, os destinos e o resto explicados ficam nos textos da escada e dos achados, não repetidos no cartão (decisão do mockup).
- **Given** `situacao: "ausente"`
  **When** o cartão é mostrado
  **Then** o selo é "Problema" e o texto diz o que a ausência causa; o registro cru não aparece.
- **Given** os destinos de relatório (`rua`)
  **When** aparecem em algum texto
  **Then** são mostrados como texto puro, nunca como link `mailto:` clicável.

### RF-05 — Cartão de SPF

- **Given** um SPF lido com contagem
  **When** o cartão é mostrado
  **Then** traz o selo, "N de 10 consultas DNS usadas", como o registro termina (`-all`, `~all`, `?all`, `+all` ou sem `all`) em português, o registro cru e os achados.
- **Given** a contagem passa de 10
  **When** o cartão é mostrado
  **Then** o selo é "Problema" e o texto explica que o SPF vai falhar por limite, não por erro de sintaxe.
- **Given** `incompleta: true` (falha de rede ou macro não avaliada no meio da caminhada)
  **When** o cartão é mostrado
  **Then** o número aparece como "pelo menos N" e o texto diz que a contagem pode estar maior.
- **Given** `situacao: "ausente"`
  **When** o cartão é mostrado
  **Then** o selo é "Problema" e o texto diz o que a ausência causa.

### RF-06 — Cartão de DKIM e seletores

- **Given** o DKIM
  **When** a verificação começa
  **Then** tenta a lista comum de `SELETORES_COMUNS` e os seletores que o visitante digitou no campo "Seletores extras" (separados por vírgula, espaço ou quebra de linha), passados por `normalizarSeletor` e `juntarSeletores`; cada seletor recusado é apontado com o motivo, e os demais seguem.
- **Given** `situacao: "encontrado"`
  **When** o cartão é mostrado
  **Then** diz em qual(is) seletor(es) a chave foi achada, o tipo e o tamanho dela, os achados de cada seletor e quantos seletores foram tentados.
- **Given** `situacao: "nao-encontrado"`
  **When** o cartão é mostrado
  **Then** o texto diz **"não encontrei nesses seletores"** (nunca "você não tem DKIM"), lista os seletores tentados com o provedor de cada um, explica que o seletor é escolha de quem envia e mostra o campo para o visitante tentar o seu; o selo é "Atenção", não "Problema".
- **Given** `situacao: "indeterminado"` ou `incompleta: true`
  **When** o cartão é mostrado
  **Then** o texto diz que parte das consultas falhou e que a lista não foi toda verificada.
- **Given** a lista de seletores tentados
  **When** é mostrada
  **Then** cada provedor aparece com o link da sua documentação (do arquivo de dados, `https`, `rel="noopener noreferrer"`), e as `ORIENTACOES` (provedores sem seletor fixo) aparecem como "digite o seletor que o seu provedor mostra".
- **Given** o visitante que acrescenta um seletor depois do resultado
  **When** reenvia
  **Then** só o DKIM é refeito (o DMARC e o SPF não são consultados de novo).

### RF-07 — Selo de cada cartão

- **Given** os achados de um cartão
  **When** o selo é calculado
  **Then** é "Problema" se há achado de gravidade `erro` ou o registro é essencial e está ausente ou inválido; "Atenção" se o pior é `aviso`; "OK" se só há `info` ou nenhum; "Não verificado" se a consulta falhou. A regra é uma função pura, testada, e vale para os três cartões (com a exceção do DKIM em RF-06).
- **Given** o selo
  **When** é mostrado
  **Then** a cor nunca é a única diferença: o texto do selo e um ícone ou forma distinguem os quatro estados, e o contraste do texto é de pelo menos 4,5:1.

### RF-08 — Achados explicados

- **Given** um achado (`codigo`, `gravidade`, `tag?`, `detalhe?`)
  **When** é mostrado
  **Then** traz o título, a explicação e o que fazer, em português, vindos do catálogo (RF-09), com a gravidade em texto; o `detalhe` entra como texto puro, truncado, depois da explicação.
- **Given** vários achados
  **When** são mostrados
  **Then** vêm na ordem que o módulo devolveu (gravidade, depois ordem do registro), sem reordenar na tela.
- **Given** um cartão sem achados
  **When** é mostrado
  **Then** não mostra lista vazia.
- **Given** um código de achado que o catálogo não tem
  **When** aparece
  **Then** a página mostra um texto genérico com o código em fonte monoespaçada, em vez de quebrar ou esconder o achado.

### RF-09 — Catálogo de textos

- **Given** o arquivo de dados dos textos
  **When** é carregado
  **Then** tem uma entrada por código de achado de `lerDmarc`, `lerSpf`, `lerSpfComConsultas`, `lerDkim` e `buscarDkim`, com `titulo`, `explicacao` e `acao`, e um campo que marca o texto ainda não final.
- **Given** os códigos de achado que os módulos podem emitir
  **When** o teste de dados roda
  **Then** falha se algum código não tem entrada no catálogo, ou se o catálogo tem entrada de código que nenhum módulo emite.
- **Given** o texto não final
  **When** a revisão do Ryan antes da `1.0.0` chegar
  **Then** um comando lista todos os textos ainda marcados, para a revisão não depender de procurar na página.
- **Given** o catálogo
  **When** é lido
  **Then** nenhum texto afirma o que a ferramenta não sabe: não diz "você não tem DKIM", não diz que o domínio "está protegido" quando só `p=none` foi lido, e não promete resultado de entrega de e-mail.

### RF-10 — Privacidade na tela

- **Given** o formulário
  **When** é mostrado
  **Then** o aviso diz, em linguagem simples, que a consulta sai do navegador direto para o DNS público da Cloudflare (ou do Google, se a primeira falhar), que esse resolvedor vê o domínio, os seletores tentados e o IP do visitante, e que o DMARC Fácil não guarda nada.
- **Given** um resultado
  **When** é mostrado
  **Then** o rodapé do resultado diz qual resolvedor respondeu (`resolvedores`), para o texto ser verdadeiro também no fallback.
- **Given** a página inteira
  **When** o teste a examina
  **Then** não há `<script>` com origem externa, nenhum `fetch` para fora dos dois resolvedores e nenhum uso de `localStorage`, `sessionStorage`, `document.cookie` ou `IndexedDB`.

### RF-11 — Dado de terceiros na página

- **Given** um registro TXT com `<script>`, `<img onerror>`, aspas, `javascript:`, texto muito longo ou caracteres de controle
  **When** é mostrado em qualquer cartão
  **Then** aparece como texto, nada executa, e o texto longo é cortado com um indicador e quebra linha sem estourar a tela.
- **Given** o código de `public/js/`
  **When** o lint roda
  **Then** falha em `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` e `new Function`.
- **Given** os nomes de provedor e os links do arquivo de dados DKIM
  **When** são montados na página
  **Then** o link passa por `URL` e só `https` vira `href`.

### RF-12 — Chamada para o MailVigil

- **Given** um resultado
  **When** é mostrado
  **Then** aparece, abaixo dos cartões, um bloco com um link para o MailVigil ("Quer ler esses relatórios sem abrir XML?"), em texto sem pressão, sem pop-up, sem contagem regressiva e sem aparecer antes do resultado.

### RF-13 — Layout, acessibilidade e movimento

- **Given** larguras de 320 a 1440 px
  **When** a página é aberta
  **Then** não há rolagem horizontal da página; o registro cru quebra linha ou rola dentro da própria caixa; o desktop usa o mesmo conteúdo do celular em coluna(s) conforme o mockup de 1280 px.
- **Given** o uso só por teclado
  **When** o visitante percorre a página
  **Then** a ordem do Tab segue a leitura, todo controle tem foco visível, e Enter envia o formulário.
- **Given** o resultado que aparece depois do envio
  **When** o leitor de tela está ligado
  **Then** o início e o fim da verificação são anunciados numa região `aria-live` polida, e o título "Resultado para <domínio>" recebe o foco ao terminar.
- **Given** `prefers-reduced-motion`
  **When** está ativo
  **Then** não há animação além da troca de estado.
- **Given** o HTML
  **When** é examinado
  **Then** tem `lang="pt-BR"`, um único `h1`, hierarquia de títulos sem saltos, `label` ligado ao campo, e alvos de toque de pelo menos 44 px.
- **Given** JavaScript desligado ou módulo que não carrega
  **When** a página é aberta
  **Then** um aviso em `<noscript>` diz que a verificação precisa de JavaScript porque a consulta sai do navegador.

### RF-14 — Página 404

- **Given** um endereço que não existe no site
  **When** a hospedagem serve a `404.html`
  **Then** a página mostra o logo, uma frase curta em português e um link de volta para a página inicial, com os mesmos estilos, sem script e sem dependência externa.
- **Given** a `404.html` servida num caminho aninhado (`/a/b/c`)
  **When** é carregada
  **Then** o CSS, o logo e o link funcionam, porque os caminhos são absolutos a partir da raiz.

## Requisitos não-funcionais

### RNF-01 — Sem build, sem dependência de runtime

HTML, CSS e módulos ES carregados direto pelo navegador (`public/`), sem bundler nem biblioteca. As fontes (Sora 800, JetBrains Mono e, se houver, a do corpo) são arquivos locais em `public/`, nunca CDN: o mockup usa o Google Fonts só para desenhar.

### RNF-02 — Lógica de tela testável

A decisão de **o que mostrar** (selo, degrau, texto escolhido, agrupamento de seletores, mensagem de falha) mora em funções puras de `public/js/`, testadas com `node --test`. O módulo que toca o DOM é fino: monta os nós com `textContent`/`createElement` e liga os eventos.

### RNF-03 — Política de conteúdo restritiva

A página declara uma Content-Security-Policy por `<meta http-equiv>` que permite `script-src 'self'`, `style-src 'self'`, `img-src 'self'`, `font-src 'self'` e `connect-src` só para os dois resolvedores DoH, sem `unsafe-inline` nem `unsafe-eval`. Um teste confere que o `connect-src` lista exatamente os hosts de `doh.js`. A hospedagem pode reforçar com cabeçalhos.

### RNF-04 — Desempenho

Sem JavaScript de terceiros nem imagem raster. O peso da página inicial (HTML, CSS, JS e fontes) fica abaixo de 150 KB transferidos, e o Lighthouse mede desempenho, acessibilidade, boas práticas e SEO no CI (o limite de cada nota é do design).

### RNF-05 — Testes com registro sintético

Todo registro nos testes é montado no próprio teste (`exemplo.com.br`), nunca de domínio real. Cada regra de RF-03, RF-07 e RF-08 tem teste de função pura; RF-11 tem um teste que alimenta o ataque.

### RNF-06 — Texto de interface

Todo texto novo da página é em português do Brasil, direto, sem jargão antes de explicar o termo, sem tom de alarme e sem promessa que a ferramenta não cumpre. O que ainda não é final fica marcado no catálogo (RF-09) e é revisado pelo Ryan antes da `1.0.0`.

## Perguntas em aberto

Nenhuma.

## Decisões resolvidas

1. Interface C (escada com "Próximo passo" no degrau seguinte; cartão de DMARC só com registro e selo), logo A, marca e fontes: Ryan, 2026-10-31.
2. As páginas de erro necessárias entram nesta spec, com mockup junto do da página (Ryan, 2026-10-31). A 5xx não se personaliza.
3. Os textos da interface são provisórios de propósito e o Ryan os revisa antes do `1.0.0`, com o produto pronto (Ryan, 2026-10-31).
4. DKIM: "não encontrei nesses seletores", nunca "você não tem DKIM" (`CLAUDE.md`).
5. A regra de lint contra `innerHTML` e afins vem para esta spec (decidido ao descartar o hook de `innerHTML`, 2026-10-31).
6. Endereço compartilhável: `?dominio=` preenche o campo ao abrir e só verifica quando o visitante aperta o botão; o endereço é atualizado a cada verificação (Ryan, 2026-10-31).
7. Fonte do corpo: a do sistema; só Sora 800 e JetBrains Mono são locais (Ryan, 2026-10-31).
8. Link do MailVigil: [repositório do MailVigil](https://github.com/ryanvmorais/mailvigil), sem parâmetro de origem. O MailVigil não tem site próprio (o `Homepage` do `pyproject.toml` é o repositório; a página do PyPI é [https://pypi.org/project/mailvigil/](https://pypi.org/project/mailvigil/)), e o GitHub não devolveria a origem do clique de qualquer jeito. Conferido no repositório dele em 2026-10-31.
9. Lighthouse CI entra nesta spec, como a última etapa do `tasks.md` (Ryan, 2026-10-31).
10. Texto não final: campo `provisorio` no catálogo, invisível ao visitante, e `pnpm textos:provisorios` lista o que falta revisar antes da `1.0.0` (Ryan, 2026-10-31).

## Testes

- `test/selo.test.js`: o selo pela gravidade, ausente, inválido, falha de consulta e a exceção do DKIM.
- `test/escada.test.js`: degrau atual e próximo para `none`, `quarantine`, `reject`, ausente, inválido e múltiplos; `sp` e `pct`.
- `test/textos-achados.test.js`: o catálogo cobre todos os códigos dos módulos (RF-09), sem código sobrando e sem frase proibida.
- `test/apresentacao.test.js`: contagem do SPF ("pelo menos"), seletores tentados, seletor digitado recusado, mensagem de falha por causa, texto longo cortado.
- `test/pagina-estatica.test.js`: `lang`, um `h1`, CSP com os hosts certos, nenhum script externo, nenhum armazenamento, `404.html` com caminhos absolutos.
- `test/seguranca-dom.test.js`: TXT hostil (`<script>`, `<img onerror>`, `javascript:`) vira texto; link só `https`.
- ESLint com a regra contra `innerHTML` e afins, no portão.
- O CI roda o portão completo em todo PR.
