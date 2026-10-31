/**
 * @file Os seletores DKIM que a ferramenta tenta por conta própria, e os provedores cujo
 * seletor o visitante precisa descobrir no painel.
 *
 * O DKIM não tem como listar os seletores de um domínio: o nome é escolha de quem envia. Cada
 * seletor desta lista é uma consulta ao resolvedor e um nome entregue a ele, então só entra
 * quem tem o nome fixo numa página oficial do provedor, e `documentacao` é essa página.
 * `conferido` é a data (AAAA-MM-DD) em que alguém abriu a página e viu o nome nela: os
 * provedores trocam de seletor e de endereço, então é o ponto de revisão de cada item.
 * Nome genérico (`default`, `mail`, `smtp`), nome só de fonte de terceiros e nome que
 * depende da conta ficam de fora: o visitante os digita no campo livre.
 *
 * É um módulo e não um JSON para carregar junto com o resto, sem requisição nem estado de
 * falha, e para o `tsc` conferir a forma. Editar a lista é editar este arquivo; o teste de
 * dados guarda a forma, não a verdade.
 */

// @ts-check

/**
 * @typedef {{
 *   seletor: string, provedor: string, documentacao: string, conferido: string
 * }} SeletorComum
 */
/** @typedef {{ provedor: string, documentacao: string, conferido: string }} Orientacao */

// ---------------------------------------------------------------------------
// SELETORES COMUNS
// ---------------------------------------------------------------------------

/** @type {ReadonlyArray<SeletorComum>} */
export const SELETORES_COMUNS = [
  {
    seletor: "google",
    provedor: "Google Workspace",
    documentacao: "https://knowledge.workspace.google.com/admin/security/set-up-dkim",
    conferido: "2026-10-31",
  },
  {
    seletor: "selector1",
    provedor: "Microsoft 365",
    documentacao:
      "https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dkim-configure",
    conferido: "2026-10-31",
  },
  {
    seletor: "selector2",
    provedor: "Microsoft 365",
    documentacao:
      "https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dkim-configure",
    conferido: "2026-10-31",
  },
  {
    seletor: "s1",
    provedor: "SendGrid",
    documentacao:
      "https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication",
    conferido: "2026-10-31",
  },
  {
    seletor: "s2",
    provedor: "SendGrid",
    documentacao:
      "https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication",
    conferido: "2026-10-31",
  },
  {
    seletor: "resend",
    provedor: "Resend",
    documentacao: "https://resend.com/docs/knowledge-base/cloudflare",
    conferido: "2026-10-31",
  },
  {
    seletor: "fm1",
    provedor: "Fastmail",
    documentacao: "https://www.fastmail.help/hc/en-us/articles/1500000280261-Domain-set-up-MX-only",
    conferido: "2026-10-31",
  },
  {
    seletor: "fm2",
    provedor: "Fastmail",
    documentacao: "https://www.fastmail.help/hc/en-us/articles/1500000280261-Domain-set-up-MX-only",
    conferido: "2026-10-31",
  },
  {
    seletor: "fm3",
    provedor: "Fastmail",
    documentacao: "https://www.fastmail.help/hc/en-us/articles/1500000280261-Domain-set-up-MX-only",
    conferido: "2026-10-31",
  },
  {
    seletor: "protonmail",
    provedor: "Proton Mail",
    documentacao: "https://proton.me/support/easy-switch-for-business-google",
    conferido: "2026-10-31",
  },
  {
    seletor: "protonmail2",
    provedor: "Proton Mail",
    documentacao: "https://proton.me/support/easy-switch-for-business-google",
    conferido: "2026-10-31",
  },
  {
    seletor: "protonmail3",
    provedor: "Proton Mail",
    documentacao: "https://proton.me/support/easy-switch-for-business-google",
    conferido: "2026-10-31",
  },
  {
    seletor: "mailjet",
    provedor: "Mailjet",
    documentacao: "https://dev.mailjet.com/docs/email-api/senders-domains/spf-dkim-validation",
    conferido: "2026-10-31",
  },
  {
    seletor: "mte1",
    provedor: "Mailchimp Transactional (Mandrill)",
    documentacao: "https://mailchimp.com/developer/transactional/docs/authentication-delivery/",
    conferido: "2026-10-31",
  },
  {
    seletor: "mte2",
    provedor: "Mailchimp Transactional (Mandrill)",
    documentacao: "https://mailchimp.com/developer/transactional/docs/authentication-delivery/",
    conferido: "2026-10-31",
  },
];

// ---------------------------------------------------------------------------
// ORIENTAÇÕES
// ---------------------------------------------------------------------------

// Provedores em que o seletor depende da conta ou não está numa página oficial: a página diz
// "digite o seletor que o painel do provedor mostra", com o link de onde achá-lo.
/** @type {ReadonlyArray<Orientacao>} */
export const ORIENTACOES = [
  {
    provedor: "Mailgun",
    documentacao:
      "https://documentation.mailgun.com/docs/mailgun/user-manual/domains/domains-verify",
    conferido: "2026-10-31",
  },
  {
    provedor: "Mailchimp (marketing)",
    documentacao: "https://mailchimp.com/help/set-up-email-domain-authentication/",
    conferido: "2026-10-31",
  },
  {
    provedor: "HubSpot",
    documentacao: "https://knowledge.hubspot.com/email/overview-of-email-authentication",
    conferido: "2026-10-31",
  },
];
