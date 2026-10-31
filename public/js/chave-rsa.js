/**
 * @file Leitura do tamanho da chave pública RSA de um registro DKIM.
 *
 * O `p=` do registro é o `SubjectPublicKeyInfo` (RFC 3279 e RFC 5280) em base64. O tamanho que
 * importa é o do módulo `n`, em bits: abaixo de 1024 o verificador não deve aceitar a
 * assinatura, e 2048 é o recomendado (RFC 8301, 3.2). Em vez do WebCrypto, que é assíncrono e
 * depende de a plataforma aceitar chaves pequenas, o módulo lê o DER na mão, só no que precisa.
 *
 * A chave é texto escrito por quem controla o DNS, então é entrada não confiável: cada
 * comprimento é conferido contra o elemento que o contém, a estrutura tem de fechar
 * exatamente, e nenhuma entrada lança exceção. O módulo é puro (sem DOM, sem rede).
 */

// @ts-check

/** @typedef {{ ok: true, bits: number } | { ok: false }} ResultadoChaveRsa */
/** @typedef {{ tag: number, inicio: number, fim: number }} Elemento */

// ---------------------------------------------------------------------------
// LIMITES E CONSTANTES
// ---------------------------------------------------------------------------

// Uma chave de 4096 bits tem uns 720 caracteres em base64; 2048 deixa folga para as maiores e
// corta o que seria só peso.
export const MAXIMO_BASE64 = 2048;
// Só os caracteres do base64 padrão, com até dois `=` no fim. Ancorada e sem repetição
// aninhada: não há retrocesso catastrófico.
const PADRAO_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

// Etiquetas DER usadas pelo `SubjectPublicKeyInfo` de RSA.
const TAG_INTEIRO = 0x02;
const TAG_BIT_STRING = 0x03;
const TAG_NULO = 0x05;
const TAG_OID = 0x06;
const TAG_SEQUENCIA = 0x30;

// OID 1.2.840.113549.1.1.1 (`rsaEncryption`), já em bytes.
const OID_RSA = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];

// ---------------------------------------------------------------------------
// BASE64 E DER
// ---------------------------------------------------------------------------

/**
 * @param {Uint8Array} bytes - O DER inteiro.
 * @param {number} posicao - Índice já conferido contra o limite do elemento.
 * @returns {number} O byte, ou 0 se o índice não existe (o `tsc` exige o caso; as leituras só
 *   chegam aqui depois de conferir os limites).
 */
const byteEm = (bytes, posicao) => bytes[posicao] ?? 0;

/**
 * Decodifica o `p=` de um registro DKIM.
 *
 * Tira os espaços (o base64 quebrado em pedaços é comum em DNS), recusa o vazio, o que passa de
 * `MAXIMO_BASE64` e o que não é base64 padrão.
 *
 * @param {string} base64 - Valor da tag `p`.
 * @returns {Uint8Array | undefined} Os bytes, ou `undefined` se a chave não decodifica.
 */
export const decodificarChave = (base64) => {
  if (typeof base64 !== "string") {
    return undefined;
  }
  const limpo = base64.replace(/\s+/g, "");
  if (limpo === "" || limpo.length > MAXIMO_BASE64 || !PADRAO_BASE64.test(limpo)) {
    return undefined;
  }
  try {
    return Uint8Array.from(atob(limpo), (caractere) => caractere.charCodeAt(0));
  } catch {
    return undefined;
  }
};

/**
 * Lê o cabeçalho de um elemento DER (etiqueta e comprimento) e diz onde o conteúdo começa e
 * termina.
 *
 * Aceita o comprimento curto (um byte, abaixo de 0x80) e o longo de um ou dois bytes (`0x81`,
 * `0x82`), que cobre qualquer chave RSA real. O elemento tem de caber em `limite`.
 *
 * @param {Uint8Array} bytes - O DER inteiro.
 * @param {number} posicao - Onde o elemento começa.
 * @param {number} limite - Fim do elemento que o contém; o novo elemento não pode passar daqui.
 * @returns {Elemento | undefined} A etiqueta e os limites do conteúdo, ou `undefined` se o
 *   cabeçalho está torto ou o elemento não cabe.
 */
const lerElemento = (bytes, posicao, limite) => {
  if (posicao + 2 > limite) {
    return undefined;
  }
  const tag = byteEm(bytes, posicao);
  const primeiro = byteEm(bytes, posicao + 1);
  let comprimento = primeiro;
  let inicio = posicao + 2;

  if (primeiro >= 0x80) {
    const quantidade = primeiro - 0x80;
    if (quantidade < 1 || quantidade > 2 || inicio + quantidade > limite) {
      return undefined;
    }
    comprimento = 0;
    for (let i = 0; i < quantidade; i += 1) {
      comprimento = comprimento * 256 + byteEm(bytes, inicio + i);
    }
    inicio += quantidade;
  }

  const fim = inicio + comprimento;
  return fim <= limite ? { tag, inicio, fim } : undefined;
};

/**
 * @param {Uint8Array} bytes - O DER inteiro.
 * @param {Elemento} elemento - Elemento com o OID.
 * @returns {boolean} `true` se o OID é o de `rsaEncryption`.
 */
const ehOidRsa = (bytes, elemento) =>
  elemento.fim - elemento.inicio === OID_RSA.length &&
  OID_RSA.every((valor, i) => byteEm(bytes, elemento.inicio + i) === valor);

// ---------------------------------------------------------------------------
// TAMANHO DA CHAVE
// ---------------------------------------------------------------------------

/**
 * Mede o módulo RSA de um `p=` em bits.
 *
 * A estrutura exigida é a do RFC 3279: `SEQUENCE { SEQUENCE { OID rsaEncryption, NULL },
 * BIT STRING { 0x00, SEQUENCE { INTEGER n, INTEGER e } } }`, cada elemento terminando
 * exatamente onde o pai termina. O `RSAPublicKey` cru (PKCS#1) não é aceito, porque a RFC 6376
 * manda o `SubjectPublicKeyInfo`.
 *
 * @param {string} base64 - Valor da tag `p`, de uma chave com `k=rsa`.
 * @returns {ResultadoChaveRsa} ``{ ok: true, bits }`` (2048 para uma chave de 2048 bits), ou
 *   ``{ ok: false }`` se a chave não decodifica ou não tem a estrutura esperada.
 */
export const lerChaveRsa = (base64) => {
  const bytes = decodificarChave(base64);
  if (bytes === undefined) {
    return { ok: false };
  }

  // 1. O envelope: uma sequência que ocupa os bytes todos.
  const raiz = lerElemento(bytes, 0, bytes.length);
  if (raiz?.tag !== TAG_SEQUENCIA || raiz.fim !== bytes.length) {
    return { ok: false };
  }

  // 2. O algoritmo: sequência com o OID de RSA e um NULL, e nada mais.
  const algoritmo = lerElemento(bytes, raiz.inicio, raiz.fim);
  if (algoritmo?.tag !== TAG_SEQUENCIA) {
    return { ok: false };
  }
  const oid = lerElemento(bytes, algoritmo.inicio, algoritmo.fim);
  if (oid?.tag !== TAG_OID || !ehOidRsa(bytes, oid)) {
    return { ok: false };
  }
  const nulo = lerElemento(bytes, oid.fim, algoritmo.fim);
  if (nulo?.tag !== TAG_NULO || nulo.inicio !== nulo.fim || nulo.fim !== algoritmo.fim) {
    return { ok: false };
  }

  // 3. A chave: um BIT STRING sem bits sobrando que guarda a sequência de `n` e `e`.
  const campo = lerElemento(bytes, algoritmo.fim, raiz.fim);
  if (campo?.tag !== TAG_BIT_STRING || campo.fim !== raiz.fim || campo.fim - campo.inicio < 2) {
    return { ok: false };
  }
  if (byteEm(bytes, campo.inicio) !== 0) {
    return { ok: false };
  }
  const chave = lerElemento(bytes, campo.inicio + 1, campo.fim);
  if (chave?.tag !== TAG_SEQUENCIA || chave.fim !== campo.fim) {
    return { ok: false };
  }

  // 4. Os dois inteiros, e só eles.
  const modulo = lerElemento(bytes, chave.inicio, chave.fim);
  if (modulo?.tag !== TAG_INTEIRO || modulo.inicio === modulo.fim) {
    return { ok: false };
  }
  const expoente = lerElemento(bytes, modulo.fim, chave.fim);
  if (expoente?.tag !== TAG_INTEIRO || expoente.inicio === expoente.fim) {
    return { ok: false };
  }
  if (expoente.fim !== chave.fim) {
    return { ok: false };
  }

  // 5. O módulo é positivo (primeiro bit zero); tira os zeros da frente e conta os bits.
  if (byteEm(bytes, modulo.inicio) >= 0x80) {
    return { ok: false };
  }
  let inicio = modulo.inicio;
  while (inicio < modulo.fim && byteEm(bytes, inicio) === 0) {
    inicio += 1;
  }
  if (inicio === modulo.fim) {
    return { ok: false };
  }
  const bits = (modulo.fim - inicio - 1) * 8 + (32 - Math.clz32(byteEm(bytes, inicio)));
  return { ok: true, bits };
};
