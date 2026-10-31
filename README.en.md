# <img align="bottom" alt="DMARC Fácil logo: a shield with an open eye" src="docs/images/dmarc-facil-dmarc-checker-logo.svg" width="29"> DMARC Fácil

[Português (Brasil)](README.md) · **English**

![JavaScript](https://img.shields.io/badge/JavaScript-ES2024-F7DF1E?logo=javascript&logoColor=black)
![deps](https://img.shields.io/badge/deps-pnpm-F69220?logo=pnpm&logoColor=white)
![runtime deps](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
[![CI](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/ci.yml/badge.svg)](https://github.com/ryanvmorais/dmarc-facil/actions/workflows/ci.yml)
![lint](https://img.shields.io/badge/lint-ESLint-4B32C3?logo=eslint&logoColor=white)
![style](https://img.shields.io/badge/style-Prettier-F7B93E?logo=prettier&logoColor=black)
![types](https://img.shields.io/badge/types-JSDoc%20%2B%20tsc-3178C6?logo=typescript&logoColor=white)
![license](https://img.shields.io/badge/license-Apache%202.0-blue)

**DMARC Fácil is a DMARC, SPF and DKIM checker that runs in your browser: you type a domain, it queries the DNS, explains each record in plain Brazilian Portuguese and tells you the next step to stop your email from being spoofed.**

Anyone searching for "verificar DMARC" or "meu e-mail cai no spam" mostly lands on English-language tools that show the record and leave the rest to the reader. Here the record comes translated, with the state of each part and the DMARC ladder (`p=none`, `p=quarantine`, `p=reject`) showing which step the domain is on and what to do to move up.

It is built for site owners, developers and small agencies in Brazil. It is plain JavaScript, with no build step and no runtime dependency, and has no server: the page queries public DNS straight from your browser. The interface is in Portuguese.

> **Status:** under construction. Not released yet: the first release will be `1.0.0`, and the page is not online yet. What exists today is the page (form, DMARC ladder, DMARC, SPF and DKIM cards, and the 404 page) on top of the modules that query the DNS and read the three records, with tests and CI.

## Privacy and use

- **The query leaves your browser.** The domain goes to a public DNS-over-HTTPS resolver (Cloudflare or Google), which sees the domain and your IP address. No project server receives what you type, and the project keeps no log of domains.
- **Public DNS only.** The tool reads records anyone can query. It does not scan, does not connect to and does not send anything to the server of the domain being checked.
- **No trackers.** The page loads no third-party script, font or image.
- **DKIM:** the selector is chosen by whoever sends the email, and DNS does not allow listing them. So the page looks at common selectors and says "I did not find it in these selectors", never "you have no DKIM". You can also enter your own selector.

## What it does

DMARC Fácil is built milestone by milestone, each one designed first as a spec, in [`specs/`](specs/) (in Portuguese). The milestones are the construction history, not published versions: `1.0.0` is the first release and will contain all of them.

| Milestone | Focus                                                                                                                                                        | Status  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `v0.1`    | Foundation: validation and normalization of the typed domain, skeleton with no build step, tests, CI and quality gate                                        | shipped |
| `v0.2`    | DoH query: TXT records of a name over DNS-over-HTTPS, with fallback between resolvers                                                                        | shipped |
| `v0.3`    | DMARC parser: picks the record among the TXT strings, reads the tags and reports the findings and the stage on the ladder                                    | shipped |
| `v0.4`    | SPF parser: reads the record, follows `include` and `redirect`, counts the DNS lookups and reports the findings                                              | shipped |
| `v0.5`    | DKIM: looks for the key in common and typed selectors with a bounded number of parallel lookups, reads the record, measures the key and reports the findings | shipped |
| `v0.6`    | Page: form, DMARC ladder, DMARC, SPF and DKIM cards with a badge, finding texts, privacy on screen, 404 page and Lighthouse CI                               | shipped |

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

More on how to contribute in [CONTRIBUTING.md](CONTRIBUTING.md); the stack, in [docs/stack.md](docs/stack.md) (in Portuguese); the guide for Claude Code users, in [CLAUDE.md](CLAUDE.md) (in Portuguese). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE).
