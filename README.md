# <img align="bottom" alt="Logotipo do DMARC Fácil: um escudo com um olho aberto" src="docs/images/dmarc-facil-dmarc-checker-logo.svg" width="29"> DMARC Fácil

**Português (Brasil)** · [English](README.en.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2024-F7DF1E?logo=javascript&logoColor=black)
![deps](https://img.shields.io/badge/deps-pnpm-F69220?logo=pnpm&logoColor=white)
![runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
[![CI](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/ci.yml/badge.svg)](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/ci.yml)
![lint](https://img.shields.io/badge/lint-ESLint-4B32C3?logo=eslint&logoColor=white)
![style](https://img.shields.io/badge/style-Prettier-F7B93E?logo=prettier&logoColor=black)
![types](https://img.shields.io/badge/types-JSDoc%20%2B%20tsc-3178C6?logo=typescript&logoColor=white)
![license](https://img.shields.io/badge/license-Apache%202.0-blue)

**O DMARC Fácil é um verificador de DMARC, SPF e DKIM que roda no navegador: você digita o domínio, ele consulta o DNS, explica cada registro em português e diz qual é o próximo passo para o seu e-mail deixar de ser falsificado.**

Quem pesquisa "verificar DMARC" ou "meu e-mail cai no spam" encontra, quase sempre, ferramentas em inglês que mostram o registro e deixam o resto por conta de quem lê. Aqui o registro vem traduzido, com o estado de cada parte e a escada do DMARC (`p=none`, `p=quarantine`, `p=reject`) mostrando em que degrau o domínio está e o que fazer para subir.

Ele é feito para donos de site, desenvolvedores e agências pequenas no Brasil. É JavaScript puro, sem build e sem dependência de runtime, e não tem servidor: a página consulta o DNS público direto do seu navegador.

> **Status:** em construção. Ainda não lançado: o primeiro lançamento será a `1.0.0`. O site fica em [dmarcfacil.ryanmorais.com.br](https://dmarcfacil.ryanmorais.com.br), hospedado na Cloudflare. O que existe hoje é a página (formulário, escada do DMARC, cartões de DMARC, SPF e DKIM, e a 404) sobre os módulos que consultam o DNS e leem os três registros, com testes, CI e a configuração da hospedagem.

## Privacidade e uso

- **A consulta sai do seu navegador.** O domínio vai a um resolvedor DNS-over-HTTPS público (Cloudflare ou Google), que enxerga o domínio e o seu endereço IP. Nenhum servidor do projeto recebe o que você digita, e o projeto não guarda log de domínios.
- **Só DNS público.** A ferramenta lê registros que qualquer pessoa pode consultar. Ela não escaneia, não conecta e não envia nada ao servidor do domínio verificado.
- **Sem rastreador.** A página não carrega script, fonte nem imagem de terceiros.
- **DKIM:** o seletor é escolha de quem envia o e-mail e o DNS não permite listá-los. Por isso a página procura em seletores comuns e diz "não encontrei nesses seletores", nunca "você não tem DKIM". Você também pode informar o seu seletor.

## O que ele faz

O DMARC Fácil é construído marco a marco, cada um desenhado antes como uma spec, em [`specs/`](specs/). Os marcos são o histórico da construção, não versões publicadas: a `1.0.0` é o primeiro lançamento e vai conter todos eles.

| Marco  | Foco                                                                                                                                            | Status       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `v0.1` | Fundação: validação e normalização do domínio digitado, esqueleto sem build, testes, CI e portão de qualidade                                   | entregue     |
| `v0.2` | Consulta DoH: registros TXT de um nome por DNS-over-HTTPS, com fallback entre resolvedores                                                      | entregue     |
| `v0.3` | Parser DMARC: escolhe o registro entre os TXT, lê as tags e aponta os achados e o estágio na escada                                             | entregue     |
| `v0.4` | Parser SPF: lê o registro, segue os `include` e o `redirect`, conta as consultas DNS e aponta os achados                                        | entregue     |
| `v0.5` | DKIM: procura a chave em seletores comuns e digitados com consultas simultâneas limitadas, lê o registro, mede a chave e aponta os achados      | entregue     |
| `v0.6` | Página: formulário, escada do DMARC, cartões de DMARC, SPF e DKIM com selo, textos dos achados, privacidade na tela, página 404 e Lighthouse CI | entregue     |
| `v0.7` | Hospedagem: Workers Static Assets, cabeçalhos de segurança, 404 com status 404, deploy pelo GitHub Actions e conferência do que está no ar      | em andamento |

## Desenvolvimento

Pré-requisitos: Node 26 ou mais novo e pnpm 12.

```bash
# Clone o repositório
git clone https://github.com/ryanvmorais/dmarc-facil.git
cd dmarc-facil

# Instale as ferramentas de desenvolvimento
pnpm install

# Ative o hook de pre-commit (uma vez por clone)
git config core.hooksPath .githooks

# Rode os testes
pnpm test
```

O portão de qualidade é o mesmo no hook e no CI:

```bash
# Confira a formatação
pnpm format:check

# Lint
pnpm lint

# Checagem de tipos do JSDoc
pnpm typecheck

# Testes
pnpm test
```

Mais sobre como contribuir em [CONTRIBUTING.md](CONTRIBUTING.md); a stack, em [docs/stack.md](docs/stack.md); o guia para quem usa o Claude Code, em [CLAUDE.md](CLAUDE.md). Para relatar uma vulnerabilidade, veja [SECURITY.md](SECURITY.md).

## Licença

[Apache-2.0](LICENSE).
