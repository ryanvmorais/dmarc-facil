# A stack, e o porquê

Cada tecnologia que sustenta o DMARC Fácil: o que faz, por que foi escolhida no lugar da alternativa e os poucos conceitos que valem estudar primeiro.

Este mapa não é exaustivo: o grafo completo de versões está no `pnpm-lock.yaml` e as decisões de cada marco vão nos blocos `### ADR-N` de `specs/*/design.md`. Aqui está a forma do projeto e o raciocínio por trás de cada peça. Hoje ele descreve a fundação e a consulta DoH (`v0.1` e `v0.2`).

O projeto é um site estático e um conjunto de ferramentas que só existem na máquina de quem desenvolve:

```text
public/js/*.js (módulos ES, sem build)  ──►  o navegador carrega direto
        ▲
        │ os mesmos arquivos
test/*.test.js (node:test, Node 26)
        ▲
        │ conferidos por
Prettier · ESLint · tsc (JSDoc)  ──►  pre-commit local e job `qualidade` do CI
```

---

## Linguagem e módulos

### JavaScript (ES2024, módulos nativos)

O código do site. Cada arquivo de `public/js/` é um módulo ES (`import`/`export`) que o navegador carrega direto, sem bundler. O `"type": "module"` do `package.json` faz o Node ler os mesmos arquivos do mesmo jeito nos testes.

**Por que esta:** o site é pequeno e a promessa é "sem dependência de runtime". Um framework ou um bundler custaria peso, superfície de ataque e um passo de build para uma página que faz uma consulta e mostra o resultado. Alternativa descartada: TypeScript compilado, que exigiria build.

**Estudar:** `import`/`export` e módulos ES no navegador (`<script type="module">`), `fetch`, `URL` (a plataforma já converte domínio internacional em punycode), `textContent` contra `innerHTML`.

**Docs:** [MDN: módulos JavaScript](https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Guide/Modules).

### JSDoc com `// @ts-check` e TypeScript como verificador

Os tipos vivem em comentários JSDoc (`@param {string}`, `@returns`, `@typedef`) dentro dos próprios `.js`. O `tsc --noEmit` lê os comentários e confere o código em modo `strict`; nada é compilado, e o que vai ao navegador é o arquivo que está no repositório.

**Por que esta:** dá a segurança de tipos do TypeScript sem o passo de build. Alternativa descartada: arquivos `.ts`, que o navegador não executa sem transpilar. O `tsconfig.json` liga `noUncheckedIndexedAccess`, que obriga a tratar o `undefined` de um índice fora do limite.

**Estudar:** `@typedef` e `@param` com tipos de união, `// @ts-check`, `strict` e `noUncheckedIndexedAccess`.

**Docs:** [TypeScript: JSDoc em arquivos JS](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html).

---

## Rede

### DNS-over-HTTPS (DoH) com `fetch`

O navegador não fala DNS direto, então a página pergunta a um resolvedor público por HTTPS: `fetch` de uma URL com `name` e `type=TXT`, e o resolvedor devolve JSON. A Cloudflare (`cloudflare-dns.com/dns-query`) é a primeira; o Google (`dns.google/resolve`) é o fallback. A consulta vai sem cookie nem `Referer`, com tempo limite (`AbortSignal.timeout`) e sem seguir redirecionamento.

**Por que esta:** não há servidor nosso no meio, então nenhum servidor nosso vê o domínio consultado. Os dois resolvedores liberam CORS para qualquer origem, o que foi medido no navegador. Alternativa descartada: um backend que fizesse a consulta, que passaria a ver (e a poder registrar) cada domínio. O resolvedor vê o domínio e o IP do visitante, e a página diz isso.

**Estudar:** `fetch` e `AbortSignal.timeout`, CORS (por que `Accept` não dispara preflight), os códigos de `Status` do DNS (0 sem erro, 2 SERVFAIL, 3 NXDOMAIN), tipo de registro TXT e como um TXT longo vira vários pedaços de 255 bytes.

**Docs:** [Cloudflare: DNS sobre HTTPS em JSON](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/) · [Google: DNS-over-HTTPS (JSON)](https://developers.google.com/speed/public-dns/docs/doh/json).

---

## Ferramentas de desenvolvimento

### Node 26 e `node:test`

O Node só roda as ferramentas e os testes; ele não está no site. O runner nativo (`node --test`) acha os arquivos `test/*.test.js` e roda sem instalar nada; `--experimental-test-coverage` dá a cobertura.

**Por que esta:** zero dependência de teste. Alternativas descartadas: Jest e Vitest, que trariam uma árvore grande de dependências para testar funções puras.

**Estudar:** `describe`/`it`, `node:assert/strict` (`assert.equal`, `assert.match`, `assert.doesNotMatch`), tabelas de casos (um array de pares entrada/saída percorrido num laço).

**Docs:** [Node.js: test runner](https://nodejs.org/api/test.html).

### pnpm 12

O gerenciador de pacotes das ferramentas de desenvolvimento. A versão fica no campo `packageManager` do `package.json`, e o CI a lê de lá. A configuração mora em `pnpm-workspace.yaml`: `minimumReleaseAge` (espera uma semana antes de aceitar uma release nova) e a lista de exceções do `pnpm audit`.

**Por que esta:** lockfile estrito e o `minimumReleaseAge`, que dá ao `pnpm install` o mesmo cooldown de uma semana do Dependabot: uma release recém-publicada pode estar quebrada ou comprometida no dia em que sai.

**Estudar:** `pnpm install --frozen-lockfile` (o que o CI roda), `pnpm audit`, `minimumReleaseAge`.

**Docs:** [pnpm](https://pnpm.io/pt/).

### ESLint 10

Encontra erro de lógica no código (variável não definida, `==` no lugar de `===`, `var`). A configuração em `eslint.config.mjs` separa os globais do navegador (`public/`) dos do Node (`test/`), para o `no-undef` não reclamar do que cada ambiente tem.

**Por que esta:** é o linter padrão do ecossistema. O estilo fica com o Prettier, então não há regra de formatação no ESLint. As regras extras são `eqeqeq`, `no-var` e `prefer-const`.

**Estudar:** configuração flat (`eslint.config.mjs`), `globals`, `no-undef`.

**Docs:** [ESLint](https://eslint.org/docs/latest/).

### Prettier 3

Formata JavaScript, JSON, YAML e Markdown. O `pnpm format:check` falha se algum arquivo estiver fora do padrão e o `pnpm format` corrige.

**Por que esta:** acaba com a discussão de estilo e deixa o diff do PR só com mudança de verdade.

**Estudar:** `.prettierrc.json`, `.prettierignore`, a diferença entre `--check` e `--write`.

**Docs:** [Prettier](https://prettier.io/docs/).

---

## Automação e segurança

### GitHub Actions

O CI tem o job `qualidade` (Prettier, ESLint, `tsc`, testes: o mesmo do pre-commit) e o job `seguranca` (`pnpm audit`). Toda `uses:` é fixada por SHA de commit, com a versão no comentário, e o runner é `ubuntu-26.04`, nunca `ubuntu-latest`.

**Por que esta:** é grátis em repositório público e fica ao lado do código. Fixar por SHA impede que uma tag movida troque o código que roda no CI sem ninguém ver.

**Estudar:** `on: pull_request`, `permissions: contents: read`, `concurrency`, pin por SHA.

**Docs:** [GitHub Actions](https://docs.github.com/pt/actions).

### CodeQL e `dependency-review`

O CodeQL analisa o código-fonte em busca de padrões de vulnerabilidade (sem build, `build-mode: none`). O `dependency-review` avisa no PR quando uma dependência nova traz vulnerabilidade conhecida. Nenhum dos dois é exigido pelo ruleset: um alerta novo não deve travar o PR que o conserta.

**Estudar:** a aba Security do GitHub, o que é um alerta de code scanning.

**Docs:** [CodeQL](https://docs.github.com/pt/code-security/code-scanning).

### Dependabot

Abre um PR por semana (domingo, 09:00, horário de Brasília) com as atualizações minor e patch agrupadas, para o npm e para as Actions. Release nova espera sete dias antes de ser proposta.

**Por que esta:** os SHAs fixados das Actions envelhecem sozinhos; sem o Dependabot ninguém os atualiza. O cooldown dá tempo de uma versão quebrada ou comprometida ser retirada.

**Estudar:** `groups`, `cooldown`, a diferença entre atualização de versão e de segurança.

**Docs:** [Dependabot](https://docs.github.com/pt/code-security/dependabot).

---

## Peças menores

| Peça             | Para quê                                                           |
| ---------------- | ------------------------------------------------------------------ |
| `@eslint/js`     | Preset `recommended` do ESLint.                                    |
| `globals`        | Lista dos globais do navegador e do Node para o `no-undef`.        |
| `@types/node`    | Tipos do Node para o `tsc` entender `node:test` e `node:assert`.   |
| `.githooks/`     | Hook de pre-commit versionado: o mesmo portão do CI.               |
| `.gitattributes` | Fim de linha `LF` em todo arquivo de texto, no Windows e no Linux. |

---

## O que deliberadamente não está na stack

- **Framework de interface (React, Vue, Svelte):** a página é uma entrada e um resultado; o framework custaria peso e um build.
- **Bundler (Vite, esbuild, webpack):** os módulos ES rodam no navegador sem empacotar.
- **Biblioteca de DNS ou de punycode:** o `URL` da plataforma converte domínio internacional, e a consulta é um `fetch`.
- **Servidor ou banco de dados:** a promessa é que nenhum servidor nosso vê o domínio digitado.
- **Rastreador, analytics de terceiros, CDN de fonte ou de script:** a página não carrega nada de fora; só a estatística agregada da hospedagem.
- **Jest ou Vitest:** o `node:test` basta para funções puras.
