---
feature: Fundação — esqueleto sem build, validação do domínio, portão de qualidade, CI e marca
status: aprovado
date: 2026-10-31
related: []
origin: conception
---

# 001 — Fundação

## Contexto e problema

O DMARC Fácil será um site estático que consulta o DMARC, o SPF e o DKIM de um domínio, por DNS-over-HTTPS, direto do navegador do visitante, e explica cada registro em português. Antes de qualquer consulta existir, toda funcionalidade precisa do mesmo chão: uma página que carrega código sem build, uma porta de entrada que impede texto malformado de virar consulta, uma sequência de qualidade que significa o mesmo no computador e no CI, e uma cadeia de suprimentos que mantém honesta a promessa de zero dependência de runtime.

Hoje (2026-10-31) o repositório tem esse chão na primeira forma: `public/js/dominio.js` com `normalizarDominio` e seus testes, a configuração de Prettier, ESLint e `tsc`, um hook de pre-commit versionado, o CI (`qualidade` e `seguranca`), CodeQL, `dependency-review`, Dependabot, o ruleset `proteger-main` e o logo oficial com o teste que o guarda. Foi construído a partir de uma lista de conferência e nunca foi escrito como contrato. Esta spec registra o que a fundação garante, para o que for construído sobre ela poder contar com isso e para qualquer mudança nela ser deliberada.

O repositório é público desde o começo. Isso define vários requisitos: o primeiro commit já é visível, o histórico não se desfaz e os arquivos de comunidade e segurança nascem com o projeto.

## Objetivos

- Um **site sem build e sem dependência de runtime**: o que vai ao navegador é o próprio `.js` do repositório.
- **Uma porta de entrada para tudo que o visitante digita**: `normalizarDominio` devolve um domínio limpo em ASCII ou uma explicação em português do motivo da recusa. Nenhum texto cru chega a uma URL de consulta.
- **Uma sequência de qualidade** (Prettier, ESLint, `tsc` em modo `strict`, testes) que roda igual no hook de pre-commit e no CI.
- **Higiene de cadeia de suprimentos**: lockfile, PRs semanais do Dependabot com cooldown, `pnpm audit`, CodeQL, `dependency-review` e Actions fixadas por SHA.
- **Proteção da `main`**: PR obrigatório, só squash, histórico linear e os checks de qualidade exigidos.
- **Uma marca com fonte única**: o logo oficial é um `<path>` só e um teste o guarda.

## Não-objetivos

- Qualquer consulta DNS, parsing de SPF ou DMARC e a interface da página: fora deste marco.
- Publicação, hospedagem e domínio: fora deste marco.

## Personas

- Como **mantenedor**, quero um portão local e um CI que concordem, para que um check verde signifique o mesmo que um clone limpo e uma mudança quebrada nunca chegue à `main`.
- Como **contribuidor**, quero uma sequência de comandos documentada e um hook que a execute, para saber se a minha mudança passa antes de abrir o PR.
- Como **visitante** do site, quero que o que eu digito seja tratado como texto de risco, para que um domínio malformado nunca vire uma consulta estranha.

## Requisitos funcionais

### RF-01 — Normalizar o que o visitante digita

- **Given** um texto que o visitante colou (`https://Exemplo.com.br/pagina?x=1#topo`, `contato@exemplo.com.br`, `Exemplo.com.br.`, `bücher.de`)
  **When** `normalizarDominio` o recebe
  **Then** devolve `{ ok: true, dominio }` com só o nome de domínio, em ASCII minúsculo, com domínio internacional em punycode (`xn--...`).
- **Given** um texto com esquema, caminho, consulta, fragmento ou e-mail
  **When** `normalizarDominio` o recebe
  **Then** descarta tudo menos o host, e remove um ponto final.

### RF-02 — Recusar o que não é um domínio consultável

- **Given** texto vazio, só espaços ou só um esquema (`https://`)
  **When** `normalizarDominio` o recebe
  **Then** devolve `{ ok: false, motivo }` pedindo um domínio, com um exemplo.
- **Given** um nome com porta, endereço IPv6, endereço IP (inclusive formas como `0x7f.1`), nome sem ponto (`localhost`), rótulo com caractere fora de letras, números e hífen, hífen nas pontas, rótulo vazio (`exemplo..com`), rótulo com mais de 63 caracteres ou nome com mais de 253
  **When** `normalizarDominio` o recebe
  **Then** devolve `{ ok: false, motivo }` com uma explicação em português que pode ser mostrada ao visitante, sem lançar exceção.

### RF-03 — Módulo puro

- **Given** o módulo `public/js/dominio.js`
  **When** é importado no navegador ou no Node
  **Then** não acessa DOM, rede nem estado global, e se comporta igual nos dois.

### RF-04 — Portão de qualidade único

- **Given** um clone com as dependências instaladas
  **When** se roda `pnpm format:check`, `pnpm lint`, `pnpm typecheck` e `pnpm test`, nessa ordem
  **Then** cada etapa sai com código 0, e é exatamente a sequência do hook `.githooks/pre-commit` e do job `qualidade` do CI.
- **Given** o hook ativado com `git config core.hooksPath .githooks`
  **When** uma etapa falha
  **Then** o commit é abortado.

### RF-05 — CI e segurança de dependências

- **Given** um PR aberto contra a `main`
  **When** o CI roda
  **Then** o job `qualidade` executa o portão do RF-04 e o job `seguranca` executa `pnpm audit` sobre o lockfile.
- **Given** os workflows em `.github/workflows/`
  **When** são lidos
  **Then** toda `uses:` está fixada por SHA de commit com a versão em comentário, o runner é `ubuntu-26.04` e as permissões são somente leitura por padrão.
- **Given** o CodeQL e o `dependency-review`
  **When** um PR altera código ou dependências
  **Then** rodam, mas não são exigidos pelo ruleset: um alerta novo não trava o PR que o conserta.

### RF-06 — Atualização de dependências

- **Given** o `dependabot.yml`
  **When** a agenda semanal (domingo, 09:00, horário de Brasília) dispara
  **Then** abre um PR por ecossistema (npm e GitHub Actions) com minor e patch agrupados, major em PR separado, e uma release nova só é proposta depois de sete dias.
- **Given** o `pnpm-workspace.yaml`
  **When** o pnpm resolve uma release
  **Then** respeita `minimumReleaseAge` de uma semana, e toda exceção aceita do `pnpm audit` tem o motivo e a condição de saída comentados.

### RF-07 — Proteção da `main`

- **Given** o ruleset `proteger-main`
  **When** alguém tenta alterar a `main`
  **Then** só um PR passa: squash, histórico linear, sem deleção nem force-push, e com `qualidade` e `seguranca` aprovados.

### RF-08 — Logo oficial com fonte única

- **Given** `docs/images/dmarc-facil-dmarc-checker-logo.svg`
  **When** o teste de logo roda
  **Then** o arquivo tem um único `<path>` com `fill-rule="evenodd"`, cor `#2563eb`, `role="img"`, `aria-label` e `<title>`, e nenhum `mask`, `clipPath`, `script` ou `style`.

## Requisitos não-funcionais

### RNF-01 — Zero dependência de runtime

O `package.json` não declara `dependencies`: só `devDependencies`. Nenhum módulo importa um pacote de fora de `node:` e de `public/js/`.

### RNF-02 — Tipos sem compilar

O `tsc --noEmit` confere o JSDoc em modo `strict` com `noUncheckedIndexedAccess`, e nada é emitido: o arquivo do repositório é o que o navegador executa.

### RNF-03 — Testes offline e determinísticos

A suíte não usa rede, relógio nem dado real: entradas são montadas no próprio teste.

### RNF-04 — Repositório público desde o primeiro commit

Nenhum segredo, dado real ou arquivo privado no histórico. O `.gitignore` cobre `.env`, `.env.*` e o estado local do Wrangler, e arquivos de trabalho locais ficam fora do git.

## Perguntas em aberto

Nenhuma.

## Decisões resolvidas

1. O projeto é JavaScript puro, sem build, e o TypeScript serve só de verificador de JSDoc.
2. Domínio com sublinhado é recusado de propósito: o sublinhado só existe em nomes de serviço (`_dmarc`), que a ferramenta monta sozinha.
3. Endereço IP é recusado porque não tem DMARC; a regra detecta o último rótulo numérico, o que também pega formas como `0x7f.1`.
4. CodeQL e `dependency-review` não são checks exigidos.

## Testes

- `test/dominio.test.js`: tabela de entradas aceitas (URL, e-mail, maiúsculas, ponto final, acento) e de entradas recusadas (vazio, IP, porta, `localhost`, rótulo malformado, comprimentos-limite).
- `test/logo.test.js`: a construção do SVG oficial.
- O CI roda o portão completo em todo PR.
