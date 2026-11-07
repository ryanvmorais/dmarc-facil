/**
 * @file Catálogo em inglês dos motivos de recusa e falha: a frase de cada código.
 *
 * Mesmas chaves do catálogo em português (`../pt/motivos.js`), a referência. Os módulos puros
 * devolvem o motivo como código estável, nunca como frase; a frase mora aqui, por idioma, e quem
 * a escolhe é `textoDoMotivo` (`textos/resolver.js`). `{valor}` marca o dado que a recusa traz (o
 * status HTTP, o `Status` do DNS).
 *
 * É dado puro: sem DOM, sem rede, sem lógica.
 */

// @ts-check

/** @typedef {import("../tipos.js").TextoFixo} TextoFixo */

// Os códigos do seletor digitado (`vazio`, `caractere-invalido`) vêm depois de "I did not accept
// `{texto}`:", então cada um é uma oração que termina essa frase.
/** @type {Record<string, TextoFixo>} */
export const motivos = {
  // dominio.js
  "dominio-vazio": { texto: "Type a domain, for example example.com." },
  "dominio-com-porta-ou-ipv6": {
    texto: "Type only the domain, without a port or an IPv6 address.",
  },
  "dominio-invalido": { texto: "That text is not a valid domain." },
  "dominio-comprido-demais": {
    texto: "The domain is too long (the limit is 253 characters).",
  },
  "dominio-incompleto": { texto: "Use the full domain, for example example.com." },
  "dominio-e-ip": { texto: "An IP address has no DMARC: type the domain name." },
  "dominio-parte-comprida-demais": { texto: "A part of the domain is over 63 characters." },
  "dominio-caractere-invalido": { texto: "The domain can only have letters, numbers and hyphens." },
  // nome-dns.js
  "nome-vazio": { texto: "The query name is empty." },
  "nome-comprido-demais": {
    texto: "The query name is too long (the limit is 253 characters).",
  },
  "nome-caractere-invalido": {
    texto: "The query name has a character that is not allowed.",
  },
  "nome-parte-vazia": {
    texto: "The query name has an empty part (two dots in a row).",
  },
  "nome-parte-comprida-demais": {
    texto: "A part of the query name is over 63 characters.",
  },
  // resposta-doh.js
  "resposta-nao-objeto": { texto: "The resolver's response is not an object." },
  "resposta-sem-status": { texto: "The resolver's response has no Status." },
  "resposta-status-dns": {
    texto: "The resolver could not resolve the name (Status {valor}).",
  },
  "resposta-answer-invalido": { texto: "The Answer in the response is not a list." },
  // doh.js
  "resolvedor-http": { texto: "The resolver answered HTTP {valor}." },
  "consulta-falhou": {
    texto: "The query to the resolver failed (network, timeout or invalid response).",
  },
  "resolvedores-indisponiveis": {
    texto:
      "I could not query DNS right now, neither through Cloudflare nor through Google. Check your connection and try again.",
  },
  // dkim-busca.js
  "sem-seletores": { texto: "There is no selector to search for." },
  // verificador.js e a guarda de `textoDoMotivo`
  "sem-motivo": { texto: "I could not query DNS right now." },
  // seletor-dkim.js: o motivo vem depois de "I did not accept `{texto}`:"
  vazio: { texto: "it is empty" },
  "parece-nome-completo": {
    texto: "it looks like the full name; type only the selector and I will build the rest",
  },
  "grande-demais": { texto: "it is too large" },
  "componente-vazio": { texto: "it has an extra dot" },
  "componente-grande-demais": { texto: "it has a part that is too large" },
  "caractere-invalido": {
    texto:
      "it has a character that a selector does not accept (use letters, numbers, hyphens and underscores)",
  },
};
