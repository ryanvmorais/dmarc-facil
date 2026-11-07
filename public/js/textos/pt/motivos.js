/**
 * @file Catálogo em português dos motivos de recusa e falha: a frase de cada código.
 *
 * Os módulos puros (`dominio.js`, `doh.js`, `dkim-busca.js`, `seletor-dkim.js` e os demais)
 * devolvem o motivo como código estável, nunca como frase; a frase mora aqui, por idioma, e quem
 * a escolhe é `textoDoMotivo` (`textos/resolver.js`).
 *
 * É dado puro: sem DOM, sem rede, sem lógica.
 */

// @ts-check

/** @typedef {import("../tipos.js").TextoFixo} TextoFixo */

// Os módulos puros devolvem o motivo como código estável (`dominio-vazio`, `resolvedor-http`),
// nunca como frase; aqui cada código vira a frase que a página mostra. `{valor}` marca o dado
// que a recusa traz (o status HTTP, o `Status` do DNS). O código do seletor digitado
// (`vazio`, `caractere-invalido`) divide a tabela com os demais, sem colisão de nome. Código
// sem entrada cai em `sem-motivo` (`textoDoMotivo`), nunca aparece cru. O teste de cobertura
// falha se um módulo emite um código que não está aqui, ou se sobra entrada que ninguém emite.
/** @type {Record<string, TextoFixo>} */
export const motivos = {
  // dominio.js
  "dominio-vazio": { texto: "Digite um domínio, por exemplo exemplo.com.br." },
  "dominio-com-porta-ou-ipv6": { texto: "Digite só o domínio, sem porta nem endereço IPv6." },
  "dominio-invalido": { texto: "Esse texto não é um domínio válido." },
  "dominio-comprido-demais": {
    texto: "O domínio é comprido demais (o limite é 253 caracteres).",
  },
  "dominio-incompleto": { texto: "Use o domínio completo, por exemplo exemplo.com.br." },
  "dominio-e-ip": { texto: "Endereço IP não tem DMARC: digite o nome do domínio." },
  "dominio-parte-comprida-demais": { texto: "Uma parte do domínio passa de 63 caracteres." },
  "dominio-caractere-invalido": { texto: "O domínio só pode ter letras, números e hífen." },
  // nome-dns.js
  "nome-vazio": { texto: "O nome da consulta está vazio." },
  "nome-comprido-demais": {
    texto: "O nome da consulta é comprido demais (o limite é 253 caracteres).",
  },
  "nome-caractere-invalido": {
    texto: "O nome da consulta tem um caractere que não é permitido.",
  },
  "nome-parte-vazia": {
    texto: "O nome da consulta tem uma parte vazia (dois pontos seguidos).",
  },
  "nome-parte-comprida-demais": {
    texto: "Uma parte do nome da consulta passa de 63 caracteres.",
  },
  // resposta-doh.js
  "resposta-nao-objeto": { texto: "A resposta do resolvedor não é um objeto." },
  "resposta-sem-status": { texto: "A resposta do resolvedor não traz o Status." },
  "resposta-status-dns": {
    texto: "O resolvedor não conseguiu resolver o nome (Status {valor}).",
  },
  "resposta-answer-invalido": { texto: "O Answer da resposta não é uma lista." },
  // doh.js
  "resolvedor-http": { texto: "O resolvedor respondeu HTTP {valor}." },
  "consulta-falhou": {
    texto: "A consulta ao resolvedor falhou (rede, tempo ou resposta inválida).",
  },
  "resolvedores-indisponiveis": {
    texto:
      "Não consegui consultar o DNS agora, nem pela Cloudflare nem pelo Google. Confira sua conexão e tente de novo.",
  },
  // dkim-busca.js
  "sem-seletores": { texto: "Não há seletor para procurar." },
  // verificador.js e a guarda de `textoDoMotivo`
  "sem-motivo": { texto: "Não consegui consultar o DNS agora." },
  // seletor-dkim.js: o motivo vem depois de "Não aceitei `{texto}`:"
  vazio: { texto: "está vazio" },
  "parece-nome-completo": {
    texto: "parece o nome completo; digite só o seletor, que eu monto o resto",
  },
  "grande-demais": { texto: "é grande demais" },
  "componente-vazio": { texto: "tem um ponto sobrando" },
  "componente-grande-demais": { texto: "tem uma parte grande demais" },
  "caractere-invalido": {
    texto: "tem caractere que um seletor não aceita (use letras, números, hífen e sublinhado)",
  },
};
