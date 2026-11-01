# <img align="bottom" alt="DMARC Fácil logo: a shield with an open eye" src="docs/images/dmarc-facil-dmarc-checker-logo.svg" width="29"> DMARC Fácil

[Português (Brasil)](README.md) · **English**

![JavaScript](https://img.shields.io/badge/JavaScript-ES2024-F7DF1E?logo=javascript&logoColor=black)
![deps](https://img.shields.io/badge/deps-pnpm-F69220?logo=pnpm&logoColor=white)
![runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
[![CI](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/ci.yml/badge.svg)](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/codeql.yml/badge.svg)](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/codeql.yml)
[![Lighthouse CI](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/lighthouse.yml)
![lint](https://img.shields.io/badge/lint-ESLint-4B32C3?logo=eslint&logoColor=white)
![style](https://img.shields.io/badge/style-Prettier-F7B93E?logo=prettier&logoColor=black)
![types](https://img.shields.io/badge/types-JSDoc%20%2B%20tsc-3178C6?logo=typescript&logoColor=white)
![license](https://img.shields.io/badge/license-Apache%202.0-blue)

**DMARC Fácil is a DMARC, SPF and DKIM checker that runs in your browser: you type a domain, it queries the DNS, explains each record in plain Brazilian Portuguese and tells you the next step to stop your email from being spoofed.**

Anyone searching for "verificar DMARC" or "meu e-mail cai no spam" mostly lands on English-language tools that show the record and leave the rest to the reader. Here the record comes translated, with the state of each part and the DMARC ladder (`p=none`, `p=quarantine`, `p=reject`) showing which step the domain is on and what to do to move up.

It is built for site owners, developers and small agencies who work in Portuguese, in Brazil or elsewhere, and anyone can use it from anywhere: the tool only queries public DNS. It is plain JavaScript, with no build step and no runtime dependency, and has no server: the page queries DNS straight from your browser. The interface is in Portuguese.

> **Status:** live at [dmarcfacil.ryanmorais.com.br](https://dmarcfacil.ryanmorais.com.br). It checks the DMARC, SPF and DKIM of a domain, and the check runs entirely in the browser of whoever uses it.

**Use it now:** [dmarcfacil.ryanmorais.com.br](https://dmarcfacil.ryanmorais.com.br). No install and no account needed.

![DMARC Fácil: page with the result for ryanmorais.com.br, the DMARC ladder (domain at p=quarantine, next step at p=reject) and the DMARC (OK), SPF (Atenção) and DKIM (Atenção) cards](docs/images/dmarc-facil-dmarc-checker-result.png)

_The whole page on a real check of `ryanmorais.com.br`, the maintainer's domain: DMARC is at `p=quarantine` and the next step is `p=reject`; SPF and DKIM have one warning each. The interface is in Portuguese._

## How to read the result

The page shows three cards, one for each record (DMARC, SPF and DKIM), and the DMARC ladder. Each card carries a badge with a word, so that color is not the only clue. The words are in Portuguese, as in the interface:

<img alt="DMARC Fácil: the four badges of a card, OK, Atenção, Problema and Não verificado, each with an icon, a word and a color" src="docs/images/dmarc-facil-dmarc-checker-badges.png" width="409">

- **OK:** the record exists and has nothing to fix.
- **Atenção** (attention): the record works but could be safer or clearer. For DKIM, it also shows up when the key was not found in the selectors tried.
- **Problema** (problem): the record has an error that stops the protection from working, or does not exist.
- **Não verificado** (not checked): the query did not finish or the resolver did not answer.

The **ladder** shows which step your DMARC is on (`p=none`, `p=quarantine` or `p=reject`) and marks the next one with the "Próximo passo" (next step) label. Each finding comes with a sentence in Portuguese saying what it means and what to do.

## Privacy and use

- **The query leaves your browser.** The domain goes to a public DNS-over-HTTPS resolver (Cloudflare or Google), which sees the domain and your IP address. No project server receives what you type, and the project keeps no log of domains.
- **Public DNS only.** The tool reads records anyone can query. It does not scan, does not connect to and does not send anything to the server of the domain being checked.
- **No trackers.** The page loads no third-party script, font or image. It is served by Cloudflare, which measures access only in aggregate.
- **DKIM:** the selector is chosen by whoever sends the email, and DNS does not allow listing them. So the page looks at common selectors and says "I did not find it in these selectors", never "you have no DKIM". You can also enter your own selector.

## Scope and limitations

DMARC Fácil is small on purpose: it reads the DNS and explains what it finds. For each limit, what to use instead.

- **It reads DNS only.** It does not send email or test whether a message reaches the inbox. _Instead:_ use an email deliverability testing tool.
- **It does not read DMARC reports.** Aggregate (RUA) reports tell you who sends email on behalf of the domain. _Instead:_ [MailVigil](https://github.com/ryanvmorais/mailvigil) reads those reports on your machine.
- **DKIM depends on the selector.** The page only finds the key in common selectors and in the one you type. _Instead:_ find the selector in the header of an email of yours (`DKIM-Signature`, the `s=` field) and enter it on the page.
- **It shows what the public resolver returned right now.** A recent DNS change may take a while to show up because of caching. _Instead:_ wait for the record's TTL and check again.

## What it checks

- **DMARC:** finds the record, reads the tags and tells you which step of the ladder the domain is on (`p=none`, `p=quarantine` or `p=reject`) and what to do to move up.
- **SPF:** reads the record, follows `include` and `redirect`, counts the DNS lookups (the limit is 10) and points out what is wrong.
- **DKIM:** looks for the key in 15 common selectors and in the ones you type, and measures the key size.
- **Each finding** comes with a sentence saying what it means and what to do.

How the tool was built, one step at a time, is in [`specs/`](specs/) (in Portuguese).

## Development

Prerequisites: Node 26 or newer and pnpm 12.

```bash
# Clone the repository
git clone https://github.com/ryanvmorais/dmarc-facil.git
cd dmarc-facil

# Install the development tools
pnpm install

# Enable the pre-commit hook (once per clone)
git config core.hooksPath .githooks

# Run the tests
pnpm test
```

The quality gate is the same in the hook and in CI:

```bash
# Check formatting
pnpm format:check

# Lint
pnpm lint

# Type-check the JSDoc
pnpm typecheck

# Tests
pnpm test
```

Other commands:

```bash
# Fix the formatting
pnpm format

# Tests with coverage
pnpm test:coverage

# Check the links of the DKIM selector list (network)
pnpm links:dkim

# Check what is live against public/ (network)
pnpm hospedagem:conferir
```

The code, the commits and the technical documentation of the repository are in Portuguese; this README is the English version of [README.md](README.md). Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). The stack is in [docs/stack.md](docs/stack.md) (in Portuguese); how to publish the site and roll back a deploy, in [docs/hospedagem.md](docs/hospedagem.md) (in Portuguese); the guide for Claude Code users, in [CLAUDE.md](CLAUDE.md) (in Portuguese). To report a vulnerability, see [SECURITY.md](SECURITY.md), never a public issue.

## License

[Apache-2.0](LICENSE).
