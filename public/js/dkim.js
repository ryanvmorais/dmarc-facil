/**
 * @file Leitura do registro DKIM de um seletor: escolhe o registro entre os TXT de
 * `<seletor>._domainkey.<domínio>`, lê as tags, mede a chave e aponta os achados.
 *
 * O registro é texto escrito por quem controla o DNS do domínio, então é entrada não
 * confiável: nada que sai daqui é HTML, e nenhuma entrada lança exceção. O resultado é uma
 * união discriminada por `situacao` (`valido`, `revogado`, `invalido`, `multiplos`, `ausente`),
 * e os achados são dados (`codigo`, `gravidade`, `tag`, `detalhe`), nunca frases: o português é
 * da página. O formato segue a RFC 6376 (3.6.1 e 3.6.2), a RFC 8301 (tamanho da chave e
 * `rsa-sha1`) e a RFC 8463 (Ed25519).
 *
 * Esta leitura não conhece o seletor nem a rede: quem etiqueta os achados com o seletor é
 * `dkim-busca.js`. O módulo é puro (sem DOM, sem rede, sem relógio), para rodar igual no
 * navegador e nos testes.
 */

// @ts-check

import { decodificarChave, lerChaveRsa } from "./chave-rsa.js";
import { MAXIMO_TEXTO } from "./resposta-doh.js";

/** @typedef {"erro" | "aviso" | "info"} Gravidade */
/**
 * @typedef {{
 *   codigo: string, gravidade: Gravidade, seletor?: string, tag?: string,
 *   detalhe?: number | string
 * }} Achado
 */
/** @typedef {"rsa" | "ed25519" | "desconhecido"} TipoChave */
/**
 * @typedef {{
 *   situacao: "valido", registro: string, versao: "DKIM1", tipo: TipoChave,
 *   hashes: string[] | null, servicos: string[], flags: string[],
 *   tamanhoBits?: number, nota?: string, achados: Achado[]
 * }} DkimValido
 */
/** @typedef {{ situacao: "revogado", registro: string, achados: Achado[] }} DkimRevogado */
/** @typedef {{ situacao: "invalido", registro: string, achados: Achado[] }} DkimInvalido */
/** @typedef {{ situacao: "multiplos", quantidade: number, achados: Achado[] }} DkimMultiplos */
/** @typedef {{ situacao: "ausente" }} DkimAusente */
/**
 * @typedef {DkimValido | DkimRevogado | DkimInvalido | DkimMultiplos | DkimAusente}
 *   ResultadoDkim
 */
/** @typedef {{ nome: string, valor: string }} Tag */
/** @typedef {{ texto: string, tags: Tag[], grande: boolean, tagsDemais: boolean }} Candidato */

// ---------------------------------------------------------------------------
// LIMITES E PADRÕES
// ---------------------------------------------------------------------------

// Um registro DKIM real tem 7 tags no máximo (`v`, `h`, `k`, `n`, `p`, `s`, `t`); 32 deixa folga
// para tags de extensão e corta o registro que só quer encher a página.
export const MAXIMO_TAGS = 32;
// A chave de 4096 bits tem uns 720 caracteres; as demais tags lidas são curtas.
const MAXIMO_VALOR_CHAVE = 2048;
const MAXIMO_VALOR = 255;
const MAXIMO_NOTA = 255;
// Tipo de chave guardado no `detalhe` do achado de tipo desconhecido.
const MAXIMO_DETALHE = 64;
// Chave Ed25519: 32 bytes (RFC 8463).
const TAMANHO_ED25519 = 32;
// Tamanhos de chave RSA da RFC 8301 (3.2): o verificador não deve aceitar menos de 1024, o
// signatário deveria usar 2048, e o verificador só é obrigado a validar até 4096.
const MINIMO_RSA = 1024;
const RECOMENDADO_RSA = 2048;
const MAXIMO_RSA = 4096;

// Erro antes de aviso antes de info; a busca reaproveita a ordem para juntar os achados.
/** @type {Record<Gravidade, number>} */
export const ORDEM_GRAVIDADE = { erro: 0, aviso: 1, info: 2 };

// Começo de um registro grande demais para ser separado em tags: a tag `v` com valor `dkim…`.
// Ancorada e sem repetição aninhada: não há retrocesso catastrófico.
const PADRAO_INICIO = /^[ \t]*v[ \t]*=[ \t]*dkim/i;
// Valor de `v` que ainda parece versão do DKIM (`DKIM1.0`, `dkim1`): vira `versao-invalida`.
const PADRAO_VERSAO = /^dkim/i;
// Tags cujo valor entra no resultado (as outras são ignoradas e nunca guardadas).
const TAGS_LIDAS = ["v", "h", "k", "p", "s", "t"];

// ---------------------------------------------------------------------------
// AUXILIARES
// ---------------------------------------------------------------------------

/**
 * Ordena os achados por gravidade e, dentro dela, na ordem em que foram gerados (o `sort` é
 * estável).
 *
 * @param {Achado[]} achados - Achados na ordem de geração.
 * @returns {Achado[]} Cópia ordenada.
 */
const ordenar = (achados) =>
  [...achados].sort((a, b) => ORDEM_GRAVIDADE[a.gravidade] - ORDEM_GRAVIDADE[b.gravidade]);

/**
 * @param {string} valor - Valor de uma tag de lista, ex.: ``"sha1:sha256"``.
 * @returns {string[]} Os itens aparados, sem os vazios.
 */
const lerLista = (valor) =>
  valor
    .split(":")
    .map((item) => item.trim())
    .filter((item) => item !== "");

/**
 * Separa o texto em tags: parte por `;`, cada fragmento no primeiro `=`, e apara nome e valor.
 * Fragmento vazio (o `;` final, `;;`), sem `=` ou sem nome é ignorado. Os nomes não mudam de
 * caixa: a RFC os trata como sensíveis.
 *
 * @param {string} texto - Registro, com no máximo `MAXIMO_TEXTO` caracteres.
 * @returns {{ tags: Tag[], tagsDemais: boolean }} As tags na ordem do registro e se passaram
 *   de `MAXIMO_TAGS`.
 */
const dividirTags = (texto) => {
  /** @type {Tag[]} */
  const tags = [];
  for (const fragmento of texto.split(";")) {
    const igual = fragmento.indexOf("=");
    const nome = igual < 0 ? "" : fragmento.slice(0, igual).trim();
    if (nome !== "") {
      tags.push({ nome, valor: fragmento.slice(igual + 1).trim() });
    }
  }
  return { tags: tags.slice(0, MAXIMO_TAGS), tagsDemais: tags.length > MAXIMO_TAGS };
};

// ---------------------------------------------------------------------------
// ESCOLHA DO REGISTRO
// ---------------------------------------------------------------------------

/**
 * Diz se o texto tem cara de registro DKIM e, se tem, já o separa em tags.
 *
 * Tem cara de DKIM quem começa pela tag `v` com valor `dkim…` (em qualquer caixa, para pegar
 * `DKIM1.0` e `dkim1` como erro) ou quem tem uma tag `p`. O resto (um TXT curinga sob
 * `_domainkey`, uma verificação de domínio) é ignorado. O texto acima de `MAXIMO_TEXTO` não é
 * separado em tags: só se olha o começo, e ele vira registro grande demais.
 *
 * @param {string} texto - Um dos textos TXT.
 * @returns {Candidato | undefined} O candidato, ou `undefined` se não é DKIM.
 */
const lerCandidato = (texto) => {
  if (texto.length > MAXIMO_TEXTO) {
    return PADRAO_INICIO.test(texto)
      ? { texto: texto.slice(0, MAXIMO_TEXTO), tags: [], grande: true, tagsDemais: false }
      : undefined;
  }

  const { tags, tagsDemais } = dividirTags(texto);
  const primeira = tags[0];
  const comecaPorVersao =
    primeira !== undefined &&
    primeira.nome.toLowerCase() === "v" &&
    PADRAO_VERSAO.test(primeira.valor);
  if (!comecaPorVersao && !tags.some((tag) => tag.nome === "p")) {
    return undefined;
  }
  return { texto, tags, grande: false, tagsDemais };
};

// ---------------------------------------------------------------------------
// LEITURA DAS TAGS
// ---------------------------------------------------------------------------

/**
 * @param {Candidato} candidato - O registro escolhido.
 * @param {Achado} achado - O achado que o invalida.
 * @returns {DkimInvalido} O resultado inválido.
 */
const invalidar = (candidato, achado) => ({
  situacao: "invalido",
  registro: candidato.texto,
  achados: [achado],
});

/**
 * Confere a estrutura do registro: tamanho, tag repetida, valor grande, versão e chave.
 *
 * @param {Candidato} candidato - O registro escolhido.
 * @param {Map<string, string>} valores - Tags do registro por nome (preenchido aqui).
 * @returns {DkimInvalido | undefined} O resultado inválido, ou `undefined` se a estrutura vale.
 */
const conferirEstrutura = (candidato, valores) => {
  if (candidato.grande || candidato.tagsDemais) {
    return invalidar(candidato, { codigo: "registro-grande-demais", gravidade: "erro" });
  }

  for (const { nome, valor } of candidato.tags) {
    if (valores.has(nome)) {
      return invalidar(candidato, { codigo: "tag-repetida", gravidade: "erro", tag: nome });
    }
    const maximo = nome === "p" ? MAXIMO_VALOR_CHAVE : MAXIMO_VALOR;
    if (TAGS_LIDAS.includes(nome) && valor.length > maximo) {
      return invalidar(candidato, { codigo: "valor-grande-demais", gravidade: "erro", tag: nome });
    }
    valores.set(nome, valor);
  }

  // A RFC manda descartar o registro cuja versão não é `DKIM1` exato ou não vem primeiro.
  if (valores.has("v") && (candidato.tags[0]?.nome !== "v" || valores.get("v") !== "DKIM1")) {
    return invalidar(candidato, {
      codigo: "versao-invalida",
      gravidade: "erro",
      tag: "v",
      detalhe: (valores.get("v") ?? "").slice(0, MAXIMO_DETALHE),
    });
  }

  if (!valores.has("p")) {
    // `P=` em outra caixa não é lido pelo verificador: o nome da variante vai no detalhe.
    const variante = candidato.tags.find((tag) => tag.nome.toLowerCase() === "p");
    return invalidar(candidato, {
      codigo: "chave-ausente",
      gravidade: "erro",
      tag: "p",
      ...(variante === undefined ? {} : { detalhe: variante.nome.slice(0, MAXIMO_DETALHE) }),
    });
  }

  return undefined;
};

/**
 * Mede a chave de acordo com o tipo e devolve o tamanho e os achados dela.
 *
 * @param {TipoChave} tipo - Tipo da chave (`k`).
 * @param {string} tipoTexto - Valor de `k` como escrito.
 * @param {string} chave - Valor de `p`, sem os espaços.
 * @returns {{ tamanhoBits?: number, achados: Achado[] }} O tamanho (só RSA legível) e os achados.
 */
const lerChave = (tipo, tipoTexto, chave) => {
  /** @type {Achado[]} */
  const achados = [];

  if (tipo === "desconhecido") {
    achados.push({
      codigo: "tipo-de-chave-desconhecido",
      gravidade: "info",
      tag: "k",
      detalhe: tipoTexto.slice(0, MAXIMO_DETALHE),
    });
    return { achados };
  }

  if (tipo === "ed25519") {
    if (decodificarChave(chave)?.length !== TAMANHO_ED25519) {
      achados.push({ codigo: "chave-ilegivel", gravidade: "erro", tag: "p", detalhe: "ed25519" });
    }
    return { achados };
  }

  const rsa = lerChaveRsa(chave);
  if (!rsa.ok) {
    achados.push({ codigo: "chave-ilegivel", gravidade: "erro", tag: "p", detalhe: "rsa" });
    return { achados };
  }
  if (rsa.bits < MINIMO_RSA) {
    achados.push({ codigo: "chave-fraca", gravidade: "erro", tag: "p", detalhe: rsa.bits });
  } else if (rsa.bits < RECOMENDADO_RSA) {
    achados.push({
      codigo: "chave-abaixo-do-recomendado",
      gravidade: "aviso",
      tag: "p",
      detalhe: rsa.bits,
    });
  } else if (rsa.bits > MAXIMO_RSA) {
    achados.push({
      codigo: "chave-maior-que-4096",
      gravidade: "aviso",
      tag: "p",
      detalhe: rsa.bits,
    });
  }
  return { tamanhoBits: rsa.bits, achados };
};

/**
 * Lê as tags de um registro escolhido.
 *
 * @param {Candidato} candidato - O registro escolhido.
 * @returns {DkimValido | DkimRevogado | DkimInvalido} O registro lido.
 */
const lerRegistro = (candidato) => {
  /** @type {Map<string, string>} */
  const valores = new Map();

  // 1. Estrutura: tamanho, tag repetida, valor grande, versão e `p` presente.
  const invalido = conferirEstrutura(candidato, valores);
  if (invalido !== undefined) {
    return invalido;
  }

  // 2. Chave vazia é chave revogada: o dono a retirou de propósito.
  const chave = (valores.get("p") ?? "").replace(/\s+/g, "");
  if (chave === "") {
    return {
      situacao: "revogado",
      registro: candidato.texto,
      achados: [{ codigo: "chave-revogada", gravidade: "aviso", tag: "p" }],
    };
  }

  // 3. Tipo e tamanho da chave.
  const tipoTexto = valores.get("k") ?? "rsa";
  /** @type {TipoChave} */
  const tipo = tipoTexto === "rsa" || tipoTexto === "ed25519" ? tipoTexto : "desconhecido";
  const { tamanhoBits, achados } = lerChave(tipo, tipoTexto, chave);

  // 4. Hash, serviço, flags e nota, com os padrões da RFC quando a tag falta.
  const hashes = valores.has("h") ? lerLista(valores.get("h") ?? "") : null;
  const servicos = valores.has("s") ? lerLista(valores.get("s") ?? "") : ["*"];
  const flags = lerLista(valores.get("t") ?? "");
  const nota = (valores.get("n") ?? "").slice(0, MAXIMO_NOTA);

  // 5. Higiene.
  if (hashes?.includes("sha1") && !hashes.includes("sha256")) {
    achados.push({ codigo: "so-sha1", gravidade: "aviso", tag: "h" });
  }
  if (!servicos.includes("email") && !servicos.includes("*")) {
    achados.push({ codigo: "servico-nao-e-email", gravidade: "aviso", tag: "s" });
  }
  if (flags.includes("y")) {
    achados.push({ codigo: "modo-de-teste", gravidade: "aviso", tag: "t" });
  }

  return {
    situacao: "valido",
    registro: candidato.texto,
    versao: "DKIM1",
    tipo,
    hashes,
    servicos,
    flags,
    ...(tamanhoBits === undefined ? {} : { tamanhoBits }),
    ...(nota === "" ? {} : { nota }),
    achados: ordenar(achados),
  };
};

// ---------------------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------------------

/**
 * Lê os textos TXT de um seletor e devolve o que há ali.
 *
 * A entrada é defensiva: o que não é lista vira lista vazia e o item que não é texto é
 * descartado. Zero registros com cara de DKIM é `ausente`; dois ou mais, `multiplos` (a RFC
 * deixa o resultado indefinido e nenhum é lido).
 *
 * @param {unknown} textos - Textos TXT de ``<seletor>._domainkey.<domínio>`` (o `registros`
 *   de `consultarTxt`).
 * @returns {ResultadoDkim} O registro lido, ou o motivo de não haver um.
 */
export const lerDkim = (textos) => {
  const lista = Array.isArray(textos) ? textos : [];
  /** @type {Candidato[]} */
  const candidatos = [];
  for (const item of lista) {
    const candidato = typeof item === "string" ? lerCandidato(item) : undefined;
    if (candidato !== undefined) {
      candidatos.push(candidato);
    }
  }

  if (candidatos.length === 0) {
    return { situacao: "ausente" };
  }
  const [unico] = candidatos;
  if (candidatos.length === 1 && unico !== undefined) {
    return lerRegistro(unico);
  }
  return {
    situacao: "multiplos",
    quantidade: candidatos.length,
    achados: [{ codigo: "registros-multiplos", gravidade: "erro", detalhe: candidatos.length }],
  };
};
