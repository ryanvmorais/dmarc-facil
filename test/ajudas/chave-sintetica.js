/**
 * @file Chaves DKIM sintéticas para os testes: monta um `SubjectPublicKeyInfo` de RSA com
 * módulo de N bits (bytes fabricados) e expoente 65537, e a chave Ed25519 de 32 bytes.
 *
 * Nenhuma chave real entra no repositório. Cada opção de `spki` quebra uma peça da estrutura,
 * para os testes de chave recusada.
 */

// @ts-check

export const OID_RSA = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];

/**
 * @param {number} tamanho - Tamanho do conteúdo.
 * @returns {number[]} Os bytes de comprimento DER (curto, ou longo de um ou dois bytes).
 */
const comprimento = (tamanho) => {
  if (tamanho < 0x80) {
    return [tamanho];
  }
  return tamanho < 0x100 ? [0x81, tamanho] : [0x82, tamanho >> 8, tamanho & 0xff];
};

/**
 * @param {number} tag - Etiqueta DER.
 * @param {number[]} conteudo - Bytes do conteúdo.
 * @returns {number[]} O elemento DER inteiro.
 */
export const der = (tag, conteudo) => [tag, ...comprimento(conteudo.length), ...conteudo];

/**
 * Bytes de um módulo de `bits` bits: o bit mais alto ligado e o resto fabricado.
 *
 * @param {number} bits - Tamanho do módulo.
 * @param {number} [primeiroByte] - Troca o primeiro byte (para os extremos do cálculo).
 * @returns {number[]} Os bytes do módulo.
 */
export const modulo = (bits, primeiroByte) => {
  const bytes = Array.from({ length: Math.ceil(bits / 8) }, (_, i) => (i * 37 + 11) & 0xff);
  const alto = bits % 8 === 0 ? 8 : bits % 8;
  bytes[0] = primeiroByte ?? (1 << (alto - 1)) | ((bytes[0] ?? 0) & ((1 << (alto - 1)) - 1));
  return bytes;
};

/**
 * @param {number[]} bytes - Valor sem sinal.
 * @returns {number[]} O INTEGER DER, com o `0x00` de sinal se o primeiro bit está ligado.
 */
export const inteiro = (bytes) => der(0x02, (bytes[0] ?? 0) >= 0x80 ? [0, ...bytes] : bytes);

/**
 * Monta um `SubjectPublicKeyInfo`; cada opção quebra uma peça.
 *
 * @param {{
 *   modulo?: number[], moduloDer?: number[], oid?: number[], nulo?: boolean,
 *   bitsSobrando?: number, sobra?: number[], sobraNaChave?: number[], expoente?: number[]
 * }} [opcoes] - O módulo em bytes (ou o INTEGER já pronto), o OID, se leva NULL, o byte de
 *   bits sobrando do BIT STRING, bytes a mais no fim, bytes a mais dentro da sequência da
 *   chave e o INTEGER do expoente já pronto.
 * @returns {number[]} O DER inteiro.
 */
export const spki = ({
  modulo: bytesModulo = modulo(2048),
  moduloDer,
  oid = OID_RSA,
  nulo = true,
  bitsSobrando = 0,
  sobra = [],
  sobraNaChave = [],
  expoente = der(0x02, [1, 0, 1]),
} = {}) => {
  const algoritmo = der(0x30, [...der(0x06, oid), ...(nulo ? [0x05, 0x00] : [])]);
  const chave = der(0x30, [...(moduloDer ?? inteiro(bytesModulo)), ...expoente, ...sobraNaChave]);
  const campo = der(0x03, [bitsSobrando, ...chave]);
  return der(0x30, [...algoritmo, ...campo, ...sobra]);
};

/**
 * @param {number[]} bytes - Bytes quaisquer.
 * @returns {string} Os bytes em base64.
 */
export const emBase64 = (bytes) => Buffer.from(bytes).toString("base64");

/**
 * @param {number} [semente] - Muda os bytes para chaves diferentes.
 * @returns {string} Uma chave Ed25519 de 32 bytes em base64.
 */
export const chaveEd25519 = (semente = 0) =>
  emBase64(Array.from({ length: 32 }, (_, i) => (i * 5 + semente) & 0xff));

/**
 * @param {number} bits - Tamanho do módulo.
 * @returns {string} Uma chave RSA sintética do tamanho pedido, em base64.
 */
export const chaveRsa = (bits) => emBase64(spki({ modulo: modulo(bits) }));
