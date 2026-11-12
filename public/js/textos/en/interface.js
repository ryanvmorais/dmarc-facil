/**
 * @file Catálogo em inglês dos textos fixos da interface que o script monta (rótulos dos selos,
 * degraus da escada, mensagens de falha, frases do `aria-live`).
 *
 * Mesmas chaves do catálogo em português (`../pt/interface.js`), a referência; o `tsc` e o teste
 * de paridade conferem. Os textos do HTML estático ficam no próprio `en/index.html`. Em texto com
 * trecho de código, o trecho vai entre crases e a página o desenha em fonte monoespaçada. `{nome}`
 * marca o lugar de um valor, trocado por `preencher`.
 *
 * É dado puro: sem DOM, sem rede, sem lógica.
 */

// @ts-check

/** @typedef {import("../tipos.js").TextoFixo} TextoFixo */
/** @typedef {import("../tipos.js").TextoDegrau} TextoDegrau */

// ---------------------------------------------------------------------------
// SELOS
// ---------------------------------------------------------------------------

// As quatro palavras fixas do selo. O ícone e a cor vêm do CSS; a palavra é o que distingue os
// estados também para quem não vê a cor. "Attention" (e não "Warning") para não colidir com a
// gravidade `aviso`, que é "Warning".
/** @type {Record<"ok" | "atencao" | "problema" | "nao-verificado", TextoFixo>} */
const selo = {
  ok: { texto: "OK" },
  atencao: { texto: "Attention" },
  problema: { texto: "Problem" },
  "nao-verificado": { texto: "Not checked" },
};

// ---------------------------------------------------------------------------
// ESCADA DO DMARC
// ---------------------------------------------------------------------------

/** @type {Record<"none" | "quarantine" | "reject", TextoDegrau>} */
const degraus = {
  none: {
    titulo: "p=none",
    resumo: "Only monitors. Spoofed email still reaches the inbox.",
  },
  quarantine: {
    titulo: "p=quarantine",
    resumo: "Spoofed email goes to spam.",
  },
  reject: {
    titulo: "p=reject",
    resumo: "Spoofed email is rejected. Full protection.",
  },
};

/** @type {Record<"atual" | "proximo", TextoFixo>} */
const etiquetas = {
  atual: { texto: "you are here" },
  proximo: { texto: "Next step" },
};

/**
 * @type {{
 *   quarantine: TextoFixo, reject: TextoFixo,
 *   publicar: Record<"ausente" | "invalido" | "multiplos", TextoFixo>
 * }}
 */
const acoesProximo = {
  quarantine: {
    texto:
      "Read the reports for 2 to 4 weeks, confirm that your senders pass SPF or DKIM and then change `p=none` to `p=quarantine`.",
  },
  reject: {
    texto:
      "Keep reading the reports for another 2 to 4 weeks and check that none of your senders is going to spam. If everything is fine, change `p=quarantine` to `p=reject`.",
  },
  publicar: {
    ausente: {
      texto:
        "Create a TXT record at the name `_dmarc` of your domain, with `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`. With `p=none` nothing changes in how your email is delivered: you just start receiving the reports.",
    },
    invalido: {
      texto:
        "The record exists, but it is written in a way that receivers ignore. Fix the record at the name `_dmarc` (the findings below say what) and start with `p=none`.",
    },
    multiplos: {
      texto:
        "There is more than one DMARC record at the name `_dmarc`, and receivers ignore all of them. Delete the extras and keep a single one, starting with `v=DMARC1; p=none`.",
    },
  },
};

/** @type {{ final: TextoFixo, semAtual: TextoFixo }} */
const escada = {
  final: { texto: "You are already at the final step." },
  semAtual: {
    texto: "No step applies yet: there is no DMARC record in use.",
  },
};

/** @type {Record<"subdominios-mais-fracos" | "aplicacao-parcial", TextoFixo>} */
const ressalvas = {
  "subdominios-mais-fracos": {
    texto: "Subdomains follow a weaker rule (`sp=`) than the domain does.",
  },
  "aplicacao-parcial": {
    texto: "The policy applies to only part of the messages (`pct=` below 100).",
  },
};

// ---------------------------------------------------------------------------
// CARTÕES
// ---------------------------------------------------------------------------

/** @type {Record<"dmarc" | "spf" | "dkim", TextoFixo>} */
const titulosCartao = {
  dmarc: { texto: "DMARC" },
  spf: { texto: "SPF" },
  dkim: { texto: "DKIM" },
};

/** @type {Record<"dmarc" | "spf" | "dkim", TextoFixo>} */
const verificando = {
  dmarc: { texto: "Looking up the DMARC record…" },
  spf: { texto: "Following the `include` terms and counting the lookups…" },
  dkim: { texto: "Searching {total} common selectors…" },
};

// `{parte}` recebe "DMARC", "SPF" ou "DKIM" (nomes técnicos, iguais nos dois idiomas).
/** @type {{ naoDiz: TextoFixo }} */
const falha = {
  naoDiz: { texto: "This says nothing about your {parte}." },
};

/** @type {Record<"ausente" | "invalido" | "multiplos", TextoFixo>} */
const dmarc = {
  ausente: {
    texto:
      "This domain does not publish DMARC. Receivers have no instruction from the domain owner about spoofed messages, and each one decides on its own.",
  },
  invalido: {
    texto: "There is a DMARC record, but it has an error and receivers ignore it.",
  },
  multiplos: {
    texto:
      "There are {quantidade} DMARC records at the same name. Receivers ignore all of them, as if there were none.",
  },
};

/**
 * @type {{
 *   ausente: TextoFixo, invalido: TextoFixo, multiplos: TextoFixo,
 *   consultas: TextoFixo, consultasPeloMenos: TextoFixo, passouDoLimite: TextoFixo,
 *   terminaEm: TextoFixo, semAll: TextoFixo, redirecionado: TextoFixo
 * }}
 */
const spf = {
  ausente: {
    texto:
      "This domain does not publish SPF. Receivers do not know which servers may send email on its behalf.",
  },
  invalido: {
    texto: "There is an SPF record, but it has an error and, because of that, SPF stops working.",
  },
  multiplos: {
    texto:
      "There are {quantidade} SPF records at the same name. That is an error: receivers return `permerror` and SPF stops working.",
  },
  consultas: {
    texto: "{total} of {limite} DNS lookups, in the worst case.",
  },
  consultasPeloMenos: {
    texto:
      "At least {total} of {limite} DNS lookups. I could not follow everything, so the number may be higher.",
  },
  passouDoLimite: {
    texto: "SPF will fail for going over the lookup limit, not for a syntax error.",
  },
  terminaEm: { texto: "Ends with `{all}`." },
  semAll: { texto: "Does not end with `all`." },
  redirecionado: { texto: "Follows the `redirect` to another domain." },
};

/**
 * @type {{
 *   encontrado: TextoFixo, encontradoVarios: TextoFixo, naoEncontrado: TextoFixo,
 *   parcial: TextoFixo, chaveRsa: TextoFixo, chaveRsaSemTamanho: TextoFixo, chaveEd25519: TextoFixo, chaveOutra: TextoFixo,
 *   verTentados: TextoFixo, documentacao: TextoFixo, documentacaoDe: TextoFixo, seletorDigitado: TextoFixo,
 *   orientacaoTitulo: TextoFixo,
 *   orientacao: TextoFixo, recusado: TextoFixo, acaoChaveFixa: TextoFixo,
 *   documentacaoDoProvedor: TextoFixo
 * }}
 */
const dkim = {
  encontrado: {
    texto: "I found the key at the selector `{seletor}` ({chave}). I searched {total} selectors.",
  },
  encontradoVarios: {
    texto: "I found keys at {quantidade} selectors. I searched {total} selectors.",
  },
  naoEncontrado: {
    texto:
      "I did not find a DKIM key in these {total} selectors. That does not mean the domain has none: whoever sends the email chooses the selector name.",
  },
  parcial: {
    texto:
      "Some of the lookups failed and the list was not fully checked: I was able to look at {verificados} of {total} selectors.",
  },
  chaveRsa: { texto: "{bits}-bit RSA" },
  chaveRsaSemTamanho: { texto: "RSA, size not read" },
  chaveEd25519: { texto: "Ed25519" },
  chaveOutra: { texto: "key type that I do not know" },
  verTentados: { texto: "See the {total} selectors tried" },
  documentacao: { texto: "documentation" },
  // Nome acessível do link: o leitor de tela lista os links fora do contexto da linha.
  documentacaoDe: { texto: "{provedor} documentation" },
  seletorDigitado: { texto: "typed by you" },
  orientacaoTitulo: {
    texto: "Providers where the selector depends on your account",
  },
  orientacao: {
    texto: "{provedor}: type the selector that the provider's panel shows.",
  },
  recusado: { texto: "I did not accept `{texto}`: {motivo}." },
  // A ação do achado `chave-abaixo-do-recomendado` no seletor de um provedor com `chaveFixa`
  // (seletores-dkim.js): o conselho genérico manda gerar uma chave que o provedor não oferece.
  acaoChaveFixa: {
    texto:
      "With {provedor}, the provider itself sets the key: there is no way to generate a 2048-bit key in the panel. 1024-bit keys are still accepted by the major mailbox providers.",
  },
  // O link que acompanha essa ação; o texto visível já diz de qual provedor é.
  documentacaoDoProvedor: { texto: "{provedor} documentation" },
};

// ---------------------------------------------------------------------------
// ACHADOS
// ---------------------------------------------------------------------------

// A gravidade em texto: a cor do achado nunca é a única diferença.
/** @type {Record<"erro" | "aviso" | "info", TextoFixo>} */
const gravidade = {
  erro: { texto: "Error" },
  aviso: { texto: "Warning" },
  info: { texto: "Information" },
};

// Os rótulos das linhas de dado que acompanham um achado (onde ele foi achado).
/** @type {Record<"seletor" | "seletores" | "dominio" | "tag" | "detalhe", TextoFixo>} */
const dadoDoAchado = {
  seletor: { texto: "Selector" },
  seletores: { texto: "Selectors" },
  dominio: { texto: "Domain" },
  tag: { texto: "Tag" },
  detalhe: { texto: "Detail" },
};

// ---------------------------------------------------------------------------
// RESULTADO E FORMULÁRIO
// ---------------------------------------------------------------------------

/** @type {Record<"titulo" | "escada" | "inexistenteTitulo" | "inexistenteTexto" | "resolvedores" | "resolvedorCloudflare" | "resolvedorGoogle" | "resolvedorAmbos" | "mailvigilTitulo" | "mailvigilTexto" | "mailvigilBotao", TextoFixo>} */
const resultado = {
  titulo: { texto: "Result for {dominio}" },
  escada: { texto: "Which DMARC step you are at" },
  inexistenteTitulo: { texto: "I did not find that domain" },
  inexistenteTexto: {
    texto: "DNS does not know `{dominio}`. Check that you typed it correctly and try again.",
  },
  resolvedores: {
    texto: "Who saw the domain in this check: {quem} public DNS.",
  },
  resolvedorCloudflare: { texto: "Cloudflare's" },
  resolvedorGoogle: { texto: "Google's" },
  resolvedorAmbos: { texto: "Cloudflare's and Google's" },
  mailvigilTitulo: { texto: "Want to read those reports without opening XML?" },
  mailvigilTexto: { texto: "MailVigil reads the reports for you." },
  mailvigilBotao: { texto: "Meet MailVigil" },
};

/** @type {Record<"botao" | "botaoOcupado" | "tentarDeNovo" | "seletoresRotulo" | "seletoresExemplo" | "seletoresAjuda" | "seletoresBotao", TextoFixo>} */
const formulario = {
  botao: { texto: "Check" },
  botaoOcupado: { texto: "Checking…" },
  tentarDeNovo: { texto: "Try again" },
  seletoresRotulo: { texto: "Extra selectors (separate with commas)" },
  seletoresExemplo: { texto: "e.g. k1, myprovider" },
  seletoresAjuda: {
    texto:
      "Your email provider shows the selector name in its panel. Mailgun, Mailchimp and HubSpot use a different name for each account.",
  },
  seletoresBotao: { texto: "Search these selectors" },
};

// ---------------------------------------------------------------------------
// ANÚNCIOS PARA LEITOR DE TELA
// ---------------------------------------------------------------------------

// Frases curtas da região `aria-live`. O resumo falado usa só a palavra do selo, para não
// afirmar mais do que ele.
/** @type {Record<"inicio" | "fim" | "inexistente", TextoFixo>} */
const anuncio = {
  inicio: { texto: "Checking {dominio}." },
  fim: {
    texto: "Result ready for {dominio}. DMARC: {dmarc}. SPF: {spf}. DKIM: {dkim}.",
  },
  inexistente: { texto: "I did not find the domain {dominio}." },
};

// ---------------------------------------------------------------------------
// CATÁLOGO
// ---------------------------------------------------------------------------

// As mesmas chaves do português. `interface` é palavra reservada, por isso o nome da constante
// é outro.
export const interfacePagina = {
  selo,
  degraus,
  etiquetas,
  acoesProximo,
  escada,
  ressalvas,
  titulosCartao,
  verificando,
  falha,
  dmarc,
  spf,
  dkim,
  gravidade,
  dadoDoAchado,
  resultado,
  formulario,
  anuncio,
};
