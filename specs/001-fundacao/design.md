---
feature: Fundação — esqueleto sem build, validação do domínio, portão de qualidade, CI e marca
status: concluído
date: 2026-10-31
related:
  - 001-fundacao/requirements.md
origin: conception
---

# 001 — Fundação — design

## Visão geral da abordagem

A fundação é uma árvore pequena em que cada peça tem um dono só. O código do navegador mora em `public/js/` como módulos ES carregados direto, sem etapa de build: o arquivo do repositório é o arquivo que o navegador executa. A lógica que decide algo (validar, normalizar) fica em módulos puros, sem DOM nem rede, para o Node a testar do mesmo jeito que o navegador a roda. O TypeScript entra só como verificador do JSDoc, e nada é emitido.

A qualidade é uma sequência de quatro comandos (`format:check`, `lint`, `typecheck`, `test`) declarada uma vez nos scripts do `package.json` e chamada por dois consumidores, o hook de pre-commit e o job `qualidade` do CI. Os dois não compartilham um script, compartilham os nomes dos scripts: mudar o que `pnpm lint` faz muda os dois ao mesmo tempo. A segurança da cadeia de suprimentos é uma camada em volta: lockfile com cooldown de uma semana, Dependabot, `pnpm audit`, CodeQL e `dependency-review`, e o ruleset que decide quais desses checks travam a `main`.

Esta spec descreve uma fundação que já existe (ver "Impacto no código existente"): o design registra o que foi construído e por quê, para qualquer mudança futura nele ser deliberada.

## Layout de módulos / componentes

```text
public/js/dominio.js              # RF-01, RF-02, RF-03: a porta de entrada do domínio
test/dominio.test.js              # RF-01, RF-02, RNF-03
test/logo.test.js                 # RF-08
docs/images/*.svg                 # RF-08: o logo oficial
package.json                      # RF-04, RNF-01: scripts do portão, só devDependencies
pnpm-lock.yaml                    # RF-06: instalação reprodutível
pnpm-workspace.yaml               # RF-06: minimumReleaseAge e exceções do audit
tsconfig.json                     # RNF-02
eslint.config.mjs                 # RF-04: lint por ambiente (navegador / Node)
.prettierrc.json, .prettierignore # RF-04: formatação
.githooks/pre-commit              # RF-04: o portão local
.github/workflows/ci.yml          # RF-04, RF-05: jobs qualidade e seguranca
.github/workflows/codeql.yml      # RF-05
.github/workflows/dependency-review.yml  # RF-05
.github/dependabot.yml            # RF-06
.gitignore                        # RNF-04
```

O ruleset `proteger-main` (RF-07) vive nas configurações do GitHub, não no repositório; esta spec é o único registro versionado dele.

## Modelo de dados

O único dado que a fundação define é o resultado da validação do domínio:

```js
/** @typedef {{ ok: true, dominio: string } | { ok: false, motivo: string }} ResultadoDominio */
```

| Campo     | Tipo      | Quando existe | Conteúdo                                                         |
| --------- | --------- | ------------- | ---------------------------------------------------------------- |
| `ok`      | `boolean` | sempre        | discriminante da união: `true` aceito, `false` recusado          |
| `dominio` | `string`  | `ok: true`    | só o nome, em ASCII minúsculo, punycode nos nomes internacionais |
| `motivo`  | `string`  | `ok: false`   | explicação em português, própria para mostrar ao visitante       |

A forma é uma união discriminada, e não uma exceção, de propósito: recusar um domínio é o caso comum e esperado da página, não uma falha. O `tsc` em `strict` obriga o chamador a tratar os dois ramos.

## Componentes

### `normalizarDominio` (`public/js/dominio.js`)

Única função exportada. Recebe texto cru e devolve `ResultadoDominio`. Em ordem:

1. **Extrai o host** (`extrairHost`): tira espaços e esquema, corta no primeiro `/`, `?` ou `#`, fica com o que vem depois do último `@` e descarta um ponto final. Atende RF-01.
2. **Recusa o vazio e a porta**: host vazio pede um domínio com exemplo; qualquer `:` recusa porta e IPv6. Atende RF-02.
3. **Converte para ASCII** (`paraAscii`) com o analisador de URL da plataforma (`new URL`), que minusculiza e converte domínio internacional em punycode. Se a plataforma rejeita, recusa.
4. **Confere os limites**: 253 caracteres no nome, pelo menos dois rótulos, último rótulo não numérico (endereço IP), cada rótulo com até 63 caracteres e só letras, números e hífen sem hífen nas pontas. Atende RF-02.

O módulo não importa nada, não lê `document` nem `window` e não guarda estado entre chamadas (RF-03). As constantes (`TAMANHO_MAXIMO_ROTULO`, `TAMANHO_MAXIMO_DOMINIO`, `PADRAO_ROTULO`, `PADRAO_ESQUEMA`) são do módulo e não exportadas.

### Portão de qualidade (`package.json`, `.githooks/pre-commit`, job `qualidade`)

Os quatro scripts são a interface: `format:check` (Prettier), `lint` (ESLint 10, flat config, globais do navegador em `public/` e do Node em `test/` e `*.mjs`), `typecheck` (`tsc --noEmit`) e `test` (`node --test`, o runner nativo). O hook e o CI chamam os mesmos quatro, na mesma ordem, em modo verificação: nenhum altera arquivo. `pnpm format` e `pnpm test:coverage` existem para o desenvolvimento e ficam fora do portão.

### Cadeia de suprimentos

- **Lockfile e cooldown.** `pnpm install --frozen-lockfile` no CI; `minimumReleaseAge: 10080` (uma semana, em minutos) no `pnpm-workspace.yaml`; `cooldown.default-days: 7` no Dependabot. Os dois prazos são iguais de propósito.
- **Dependabot.** Um PR por ecossistema (npm e GitHub Actions), minor e patch agrupados, major em PR separado, domingo às 09:00 de Brasília.
- **`pnpm audit`** no job `seguranca`. Exceção aceita fica em `auditConfig.ignoreGhsas` com motivo e condição de saída comentados.
- **CodeQL** (workflow próprio, um job por linguagem: `actions` e `javascript-typescript`) e **`dependency-review`**: rodam em PR, não são exigidos.
- **Actions fixadas por SHA**, com a versão em comentário, `runs-on: ubuntu-26.04` e `permissions: contents: read` por padrão.

### Proteção da `main`

Duas camadas, uma em cada lugar:

- **Ruleset `proteger-main`**: exige PR, histórico linear, bloqueia deleção e force-push, e exige os checks `qualidade` e `seguranca`.
- **Configuração do repositório**: só o squash está habilitado (merge commit e rebase desligados) e a branch é apagada depois do merge. É daqui que vem o "só squash"; o ruleset sozinho aceitaria os três métodos.

### Logo oficial (`docs/images/`)

Um SVG com um `<path>` só, `fill-rule="evenodd"`, cor `#2563eb`, `role="img"`, `aria-label` e `<title>`. O teste `test/logo.test.js` lê o arquivo e confere cada propriedade, e recusa `mask`, `clipPath`, `script` e `style`.

## Interfaces

- **`normalizarDominio(entrada: string): ResultadoDominio`**, exportada de `public/js/dominio.js`. É o contrato de que as specs seguintes dependem: toda consulta DoH monta a URL a partir de `dominio` de um `ok: true`, nunca de texto cru.
- **Scripts do `package.json`** (`format:check`, `lint`, `typecheck`, `test`): o contrato entre o portão local, o CI e quem contribui.
- **Nomes dos checks** `qualidade` e `seguranca`: o ruleset os exige por nome. Renomear um job no `ci.yml` sem atualizar o ruleset trava todo PR.

Esta spec não define URL, API nem payload: não há consulta de rede neste marco.

## ADRs

### ADR-1 — JavaScript puro com módulos ES, sem build

**Decisão.** O código do navegador é `.js` em `public/js/`, carregado por `<script type="module">`, sem bundler nem transpilador.
**Alternativas.** (a) TypeScript compilado; (b) JavaScript com bundler (Vite, esbuild).
**Porquê.** O arquivo versionado é o arquivo executado: o visitante pode ler o código-fonte real no navegador, a promessa de privacidade é verificável, e não há ferramenta de build para manter, atualizar ou comprometer.
**Trade-off.** Sem tree-shaking, minificação nem sintaxe além da que o navegador entende. Para um site pequeno, sem dependência de runtime, o custo é nulo hoje; se a página crescer, o peso dos módulos vira medida de Lighthouse e pode reabrir esta decisão.

### ADR-2 — TypeScript só como verificador de JSDoc

**Decisão.** `tsc --noEmit` com `allowJs` e `checkJs`, em `strict` e `noUncheckedIndexedAccess`; os tipos moram no JSDoc.
**Alternativas.** (a) sem checagem de tipos; (b) arquivos `.ts` com build.
**Porquê.** Pega a classe de erro que mais morde em parsing de texto (índice fora do limite, `undefined`, ramo da união esquecido) sem tirar o ADR-1.
**Trade-off.** JSDoc é mais verboso que anotação inline e o TypeScript vira dependência de desenvolvimento.

### ADR-3 — Resultado como união discriminada, sem exceção

**Decisão.** `normalizarDominio` devolve `{ ok, dominio }` ou `{ ok: false, motivo }` e nunca lança.
**Alternativas.** (a) lançar um erro com a mensagem; (b) devolver `null` para o inválido.
**Porquê.** Entrada inválida é o fluxo normal de um campo de texto. A união leva o motivo junto, para a página mostrar ao visitante sem tradução de erro, e o `tsc` obriga a tratar os dois casos.
**Trade-off.** Todo chamador faz um `if (!resultado.ok)`; em troca não existe `try/catch` esquecido.

### ADR-4 — Normalizar com `new URL`, não com biblioteca de punycode

**Decisão.** A conversão para ASCII usa `new URL("http://" + host).hostname`.
**Alternativas.** (a) a biblioteca `punycode`/`tr46`; (b) escrever o algoritmo.
**Porquê.** O analisador de URL da plataforma implementa o UTS 46 e é o mesmo no navegador e no Node (RF-03), sem dependência de runtime (RNF-01). Ele também converte formas de IP como `0x7f.1`, que a regra de "último rótulo numérico" pega em seguida.
**Trade-off.** O comportamento acompanha a plataforma: uma mudança de especificação no WHATWG URL muda a saída. Os testes de entrada aceita e recusada são o seguro contra isso.

### ADR-5 — Recusar sublinhado, endereço IP e nome sem ponto

**Decisão.** Rótulo só com letras, números e hífen; último rótulo numérico recusa como IP; menos de dois rótulos recusa.
**Alternativas.** (a) aceitar o que o DNS aceita tecnicamente (sublinhado); (b) aceitar IP e mostrar "sem DMARC".
**Porquê.** O sublinhado só existe em nomes de serviço (`_dmarc`, `_domainkey`) que a ferramenta monta sozinha: aceitá-lo do visitante deixaria ele consultar nomes que a ferramenta nunca pretendeu consultar. IP e `localhost` não têm DMARC e consultá-los só gera ruído no resolvedor.
**Trade-off.** Um domínio legítimo e raro com sublinhado num rótulo de host é recusado. Para um verificador de DMARC de domínio de e-mail, o custo é praticamente zero.

### ADR-6 — Um portão, declarado nos scripts, chamado por dois consumidores

**Decisão.** A sequência vive como scripts do `package.json`; o hook e o CI chamam os scripts, não os binários.
**Alternativas.** (a) comandos duplicados no hook e no workflow; (b) um runner de hooks (Husky, lefthook).
**Porquê.** Um lugar só para mudar o que cada etapa faz; sem dependência de runner de hooks, só `git config core.hooksPath .githooks`.
**Trade-off.** O hook precisa ser ativado uma vez por clone. O CI é a rede de segurança para quem não ativou.

### ADR-7 — CodeQL e `dependency-review` informam, não bloqueiam

**Decisão.** Só `qualidade` e `seguranca` são checks exigidos no ruleset.
**Alternativas.** (a) exigir todos os checks.
**Porquê.** Um alerta novo do CodeQL ou uma vulnerabilidade na `dependency-review` não pode travar o PR que justamente a conserta, e um check instável ensina a ignorar os checks.
**Trade-off.** Um PR com alerta novo pode ser mergeado. A leitura do resultado é do mantenedor, na revisão do PR.

### ADR-8 — Squash garantido pela configuração do repositório, não pelo ruleset

**Decisão.** Merge commit e rebase ficam desligados nas configurações do repositório; o ruleset exige PR e histórico linear.
**Alternativas.** (a) restringir `allowed_merge_methods` no ruleset.
**Porquê.** Hoje o ruleset lista os três métodos, mas só o squash está habilitado no repositório, então só ele existe na prática. O histórico linear da `main` e o título do PR como mensagem do commit seguem dessa combinação.
**Trade-off.** São dois lugares para manter consistentes. Quem religar o merge commit ou o rebase nas configurações reabre o método, e o ruleset não impede.

### ADR-9 — Repositório público desde o primeiro commit

**Decisão.** O repositório nasceu público, com `.gitignore` cobrindo `.env`, `.env.*` e o estado local do Wrangler, e arquivos de trabalho locais fora do git.
**Alternativas.** (a) nascer privado e abrir depois.
**Porquê.** É um projeto aberto e educativo; abrir depois exigiria auditar o histórico inteiro em busca de segredo, e um segredo que entrou no histórico já está comprometido.
**Trade-off.** O primeiro commit já é visível e o histórico não se desfaz: erro de conteúdo vira commit corretivo, não reescrita.

## Impacto no código existente

Nenhum. A fundação já existe e esta spec a descreve; nenhuma tarefa de `tasks.md` altera código. O que a spec acrescenta é o registro versionado do que hoje só está nas configurações do GitHub: o ruleset `proteger-main` e as opções de merge do repositório (ADR-8).

## Riscos

| Risco                                                                            | Efeito                                         | Mitigação                                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Renomear um job do `ci.yml` (`qualidade` ou `seguranca`) sem atualizar o ruleset | Todo PR fica esperando um check que nunca roda | Interfaces registram os nomes; a mudança de nome é uma tarefa que cita o ruleset     |
| Mudança do WHATWG URL altera a normalização (ADR-4)                              | Domínio aceito ou recusado de forma diferente  | Testes de entradas aceitas e recusadas rodam no CI com o Node 26 corrente            |
| Alguém reabre merge commit ou rebase nas configurações (ADR-8)                   | Histórico deixa de ser só squash               | O ruleset ainda exige histórico linear, que o merge commit viola                     |
| A exceção do `pnpm audit` (`ignoreGhsas`) fica esquecida                         | Aviso real passa a ser ignorado                | Cada exceção carrega o motivo e a condição de saída no próprio `pnpm-workspace.yaml` |
| Hook de pre-commit não ativado em um clone                                       | Mudança quebrada chega a abrir PR              | O CI roda o mesmo portão e o ruleset o exige                                         |

## Estratégia de testes

- **Unidade, sem mock.** `normalizarDominio` é função pura: o teste chama com a entrada montada e compara com a saída. Não há o que simular.
- **Tabelas de entrada.** `test/dominio.test.js` tem uma tabela de entradas aceitas com o valor esperado (URL, e-mail, maiúsculas, ponto final, acento) e uma de recusadas (vazio, só esquema, IP, porta, `localhost`, rótulo malformado, comprimentos-limite), um `it` por linha para a falha apontar a entrada. Entrada hostil é testada, não presumida (RF-02).
- **Logo.** `test/logo.test.js` lê o SVG real do repositório e confere a construção (RF-08).
- **Offline e determinístico** (RNF-03): sem rede, sem relógio e sem dado real; `node --test` direto, sem biblioteca de teste.
- **Workflows, Dependabot e ruleset:** são verificados pelo próprio CI rodando num PR e pela leitura das configurações (`gh api`), registrada na tarefa de conferência de `tasks.md`.
