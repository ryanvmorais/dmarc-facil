# Contribuindo com o DMARC Fácil

Obrigado pelo interesse em melhorar o DMARC Fácil. Ao participar, você concorda em seguir o [Código de Conduta](CODE_OF_CONDUCT.md).

O projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/) a partir da `1.0.0`. Abra uma issue antes de começar qualquer coisa grande.

## Desenvolvimento

O projeto usa [pnpm](https://pnpm.io/pt/). `pnpm install` instala as ferramentas de desenvolvimento (ESLint, Prettier, TypeScript como verificador de JSDoc e `@types/node`). O site **não tem dependência de runtime** e precisa continuar assim: é a promessa do produto. O que vai ao navegador é código do repositório, sem biblioteca e sem build.

O preparo do ambiente e os comandos do portão de qualidade estão na seção [Desenvolvimento](README.md#desenvolvimento) do README.

## Antes de abrir um pull request

Rode o portão de qualidade inteiro e confira que ele está verde: o hook de pre-commit e o CI rodam a mesma sequência. Ative o hook uma vez por clone com `git config core.hooksPath .githooks`.

## Convenções

- **Idioma:** código, comentários, mensagens de commit e documentação são em português. Veja o [CLAUDE.md](CLAUDE.md).
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Os pull requests são integrados com squash.
- **Issues e PRs:** um bug ou uma ideia começa como issue (os formulários estão em `.github/ISSUE_TEMPLATE/`); o PR que a resolve diz `Closes #N`, para a issue fechar no merge. Uma correção trivial pode ir direto para um PR.
- **Mudanças de design:** funcionalidades que não são triviais são desenhadas como spec em [specs/](specs/) antes da implementação (requirements, design, tasks).
- **Estilo do código:** módulos ES com JSDoc e `// @ts-check`; a lógica de parsing e de validação fica em módulos puros, sem DOM nem rede, com teste.

## Nunca use dado real de terceiros

Testes, documentação, issues e pull requests usam só registros DNS **sintéticos** e domínios de exemplo (`exemplo.com.br`, `example.com`). Nunca cole registros de domínios de outras pessoas.

## Claude Code

Se você abrir o projeto com o [Claude Code](https://claude.com/claude-code), leia o [CLAUDE.md](CLAUDE.md): ele descreve os comandos e as armadilhas do repositório. O uso é opcional: nada depende dele.

## Relatando problemas de segurança

Não abra issue pública para vulnerabilidade no próprio DMARC Fácil: veja o [SECURITY.md](SECURITY.md).
