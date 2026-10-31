/**
 * @file Leitura da resposta JSON de um resolvedor DoH (Cloudflare ou Google).
 *
 * O JSON que o resolvedor devolve é entrada não confiável: o conteúdo de um registro TXT é
 * escrito por quem controla o DNS do domínio, e o formato muda de um resolvedor para outro.
 * Este módulo absorve as diferenças e entrega sempre a mesma coisa (situação e lista de
 * textos), para o resto do projeto escrever cada parser uma vez só. Nunca lança exceção:
 * o que não tem a forma esperada vira falha ou é descartado.
 *
 * O módulo é puro (sem DOM, sem rede), para rodar igual no navegador e nos testes.
 */

// @ts-check

/** @typedef {"cloudflare" | "google"} Resolvedor */
/** @typedef {"encontrado" | "sem-registro" | "inexistente"} Situacao */
/**
 * @typedef {{ ok: true, situacao: Situacao, registros: string[] } | { ok: false, motivo: string }} RespostaLida
 */

// ---------------------------------------------------------------------------
// LIMITES E CÓDIGOS
// ---------------------------------------------------------------------------

// Um domínio hostil escolhe o que o DNS dele responde. A mensagem DNS já é limitada pelo
// protocolo (cerca de 64 KB), mas a página não deve renderizar centenas de linhas por isso.
// Passou do limite, o registro é descartado (truncar deixaria um registro cortado no meio,
// que um parser leria errado).
export const MAXIMO_REGISTROS = 50;
// Texto do registro depois de juntos os pedaços. SPF e DMARC cabem com folga; um DKIM de
// 4096 bits tem cerca de 800 caracteres.
export const MAXIMO_TEXTO = 4096;
// Corte do `data` bruto, antes de rodar a expressão regular sobre ele. Folga para as aspas
// e espaços que a Cloudflare acrescenta a cada pedaço de 255 caracteres.
export const MAXIMO_TEXTO_BRUTO = 8192;

// Tipo TXT na tabela de tipos de registro do DNS.
const TIPO_TXT = 16;
// Códigos de `Status` do DNS (RCODE) que são respostas definitivas.
const STATUS_SEM_ERRO = 0;
const STATUS_INEXISTENTE = 3;

// Texto inteiro no formato da Cloudflare: uma ou mais strings entre aspas, separadas por
// espaço. Dentro das aspas vale `\x` (escape), e as alternativas são disjuntas, então não há
// retrocesso catastrófico.
const PADRAO_TXT_COM_ASPAS = /^\s*"(?:[^"\\]|\\.)*"(?:\s+"(?:[^"\\]|\\.)*")*\s*$/;
// Cada pedaço entre aspas, com o conteúdo capturado.
const PADRAO_PEDACO = /"((?:[^"\\]|\\.)*)"/g;

// ---------------------------------------------------------------------------
// TEXTO DO REGISTRO
// ---------------------------------------------------------------------------

/**
 * Extrai o texto de um registro TXT, igual nos dois resolvedores.
 *
 * O Google já entrega o texto limpo. A Cloudflare entrega em formato de apresentação do DNS:
 * `"v=DMARC1; p=none"`, e um TXT longo em pedaços (`"pedaço1" "pedaço2"`). Só no caso da
 * Cloudflare as aspas são removidas e os pedaços juntados, sem separador. O conteúdo de cada
 * pedaço fica como veio (escapes não são desfeitos). Se o texto da Cloudflare não tem a forma
 * esperada, volta como veio: exibir o texto cru é mais honesto que esconder um registro.
 *
 * @param {string} data - Campo `data` do item do `Answer`.
 * @param {Resolvedor} resolvedor - Quem respondeu, porque o formato depende disso.
 * @returns {string} Texto do registro, ex.: ``"v=DMARC1; p=none"``.
 */
export const textoDoRegistro = (data, resolvedor) => {
  if (resolvedor !== "cloudflare" || !PADRAO_TXT_COM_ASPAS.test(data)) {
    return data;
  }
  return Array.from(data.matchAll(PADRAO_PEDACO), (pedaco) => pedaco[1] ?? "").join("");
};

// ---------------------------------------------------------------------------
// RESPOSTA
// ---------------------------------------------------------------------------

/**
 * Lê a resposta JSON de um resolvedor.
 *
 * `Status` 0 com TXT é `encontrado`, sem TXT é `sem-registro`; `Status` 3 (NXDOMAIN) é
 * `inexistente`. Qualquer outro `Status` (SERVFAIL, REFUSED...) ou uma forma inesperada é
 * falha, e quem chamou decide o fallback. No `Answer`, só entram os itens do tipo TXT: o
 * CNAME que aponta um seletor DKIM para o provedor vem misturado e é ignorado.
 *
 * @param {unknown} json - Corpo da resposta, já decodificado.
 * @param {Resolvedor} resolvedor - Quem respondeu.
 * @returns {RespostaLida} A situação e os textos, ou ``{ ok: false, motivo }``.
 */
export const lerResposta = (json, resolvedor) => {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, motivo: "A resposta do resolvedor não é um objeto." };
  }
  const { Status: status, Answer: resposta } = /** @type {Record<string, unknown>} */ (json);

  if (typeof status !== "number" || !Number.isInteger(status)) {
    return { ok: false, motivo: "A resposta do resolvedor não traz o Status." };
  }
  if (status === STATUS_INEXISTENTE) {
    return { ok: true, situacao: "inexistente", registros: [] };
  }
  if (status !== STATUS_SEM_ERRO) {
    return { ok: false, motivo: `O resolvedor não conseguiu resolver o nome (Status ${status}).` };
  }
  if (resposta !== undefined && !Array.isArray(resposta)) {
    return { ok: false, motivo: "O Answer da resposta não é uma lista." };
  }

  /** @type {string[]} */
  const registros = [];
  for (const item of resposta ?? []) {
    if (registros.length >= MAXIMO_REGISTROS) {
      break;
    }
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const { type: tipo, data } = /** @type {Record<string, unknown>} */ (item);
    if (tipo !== TIPO_TXT || typeof data !== "string" || data.length > MAXIMO_TEXTO_BRUTO) {
      continue;
    }
    const texto = textoDoRegistro(data, resolvedor);
    if (texto.length <= MAXIMO_TEXTO) {
      registros.push(texto);
    }
  }

  return {
    ok: true,
    situacao: registros.length > 0 ? "encontrado" : "sem-registro",
    registros,
  };
};
