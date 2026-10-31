/**
 * @file Leitura do registro DMARC: escolhe o registro entre os TXT de `_dmarc.<domínio>`, lê
 * as tags e aponta os achados.
 *
 * O registro é texto escrito por quem controla o DNS do domínio, então é entrada não
 * confiável: nada que sai daqui é HTML, e nenhuma entrada lança exceção. O resultado é uma
 * união discriminada por `situacao` (`valido`, `invalido`, `multiplos`, `ausente`), e os
 * achados são dados (`codigo`, `gravidade`, `tag`, `detalhe`), nunca frases: o português é da
 * página. O formato segue a RFC 7489 (seções 6.3, 6.4 e 6.6.3).
 *
 * O módulo é puro (sem DOM, sem rede, sem relógio), para rodar igual no navegador e nos testes.
 */

// @ts-check

import { validarNomeDns } from "./nome-dns.js";
import { MAXIMO_TEXTO } from "./resposta-doh.js";

/** @typedef {"none" | "quarantine" | "reject"} Politica */
/** @typedef {"nenhum" | Politica} Estagio */
/** @typedef {"erro" | "aviso" | "info"} Gravidade */
/** @typedef {{ codigo: string, gravidade: Gravidade, tag?: string, detalhe?: number }} Achado */
/** @typedef {{ endereco: string, tamanhoMaximo?: string }} DestinoRelatorio */
/**
 * @typedef {{
 *   situacao: "valido",
 *   registro: string, estagio: Politica, politica: Politica, subdominios: Politica,
 *   alinhamentoDkim: "r" | "s", alinhamentoSpf: "r" | "s", porcentagem: number,
 *   opcoesFalha: string[], formatos: string[], intervaloSegundos: number,
 *   rua: DestinoRelatorio[], ruf: DestinoRelatorio[],
 *   padrao: string[], achados: Achado[]
 * }} DmarcValido
 */
/**
 * @typedef {{
 *   situacao: "invalido", registro: string, estagio: "nenhum", achados: Achado[]
 * }} DmarcInvalido
 */
/** @typedef {{ situacao: "multiplos", quantidade: number, estagio: "nenhum" }} DmarcMultiplos */
/** @typedef {{ situacao: "ausente", estagio: "nenhum" }} DmarcAusente */
/** @typedef {DmarcValido | DmarcInvalido | DmarcMultiplos | DmarcAusente} ResultadoDmarc */

// ---------------------------------------------------------------------------
// LIMITES E PADRÕES
// ---------------------------------------------------------------------------

// Um registro hostil não deve encher a página de endereços. A RFC não fixa limite; 20 é
// folga para qualquer configuração real.
export const MAXIMO_DESTINOS = 20;
// Limites do e-mail (RFC 5321): endereço inteiro e parte local.
const MAXIMO_ENDERECO = 254;
const MAXIMO_USUARIO = 64;
// `ri` é um inteiro sem sinal de 32 bits.
const MAXIMO_INTERVALO = 4294967295;

// Valores padrão da RFC 7489 para as tags opcionais ausentes ou inválidas.
/** @type {"r" | "s"} */
const PADRAO_ALINHAMENTO = "r";
const PADRAO_PORCENTAGEM = 100;
const PADRAO_OPCOES_FALHA = ["0"];
const PADRAO_FORMATOS = ["afrf"];
const PADRAO_INTERVALO = 86400;

// Tags lidas, na ordem fixa em que os achados são gerados. As do DMARCbis (`np`, `psd`, `t`)
// ficam de fora de propósito: contam como tag desconhecida.
const TAGS_CONHECIDAS = ["p", "sp", "adkim", "aspf", "pct", "fo", "rf", "ri", "rua", "ruf"];
const OPCOES_FALHA_VALIDAS = ["0", "1", "d", "s"];

// Degrau de cada política na escada, para comparar `sp` com `p`.
/** @type {Record<Politica, number>} */
const GRAU = { none: 0, quarantine: 1, reject: 2 };
/** @type {Record<Gravidade, number>} */
const ORDEM_GRAVIDADE = { erro: 0, aviso: 1, info: 2 };

// O registro começa pela tag `v`, de nome em qualquer caixa e valor `DMARC1` exato, seguido
// de `;` ou do fim. Ancorada e sem repetição aninhada: não há retrocesso catastrófico.
const PADRAO_CANDIDATO = /^[ \t]*[vV][ \t]*=[ \t]*DMARC1[ \t]*(?:;|$)/;
// Só dígitos ASCII, sem sinal nem ponto: valida `pct` e `ri` antes de virar número.
const PADRAO_DIGITOS = /^\d+$/;
// Palavra-chave de formato de relatório de `rf` (`afrf`, `iodef`), já em minúsculas.
const PADRAO_FORMATO = /^[a-z][a-z0-9-]*$/;
// `mailto:` em qualquer caixa e tamanho máximo opcional (`!10m`, RFC 7489 6.2).
const PADRAO_DESTINO = /^mailto:([^!]*)(?:!(\d+[kmgt]?))?$/i;
// Parte local: sem controle, espaço nem os caracteres que quebram a leitura do endereço.
const PADRAO_USUARIO = new RegExp(`^[^\\p{Cc}\\s@<>",;!]{1,${MAXIMO_USUARIO}}$`, "u");

// ---------------------------------------------------------------------------
// AUXILIARES
// ---------------------------------------------------------------------------

/**
 * @param {string} valor - Texto já em minúsculas.
 * @returns {valor is Politica} `true` se é uma das três políticas.
 */
const ehPolitica = (valor) => valor === "none" || valor === "quarantine" || valor === "reject";

/**
 * Ordena os achados por gravidade e, dentro dela, na ordem em que foram gerados (o `sort` é
 * estável).
 *
 * @param {Achado[]} achados - Achados na ordem de geração.
 * @returns {Achado[]} Cópia ordenada.
 */
const ordenar = (achados) =>
  [...achados].sort((a, b) => ORDEM_GRAVIDADE[a.gravidade] - ORDEM_GRAVIDADE[b.gravidade]);

// ---------------------------------------------------------------------------
// DESTINOS DE RELATÓRIO (rua e ruf)
// ---------------------------------------------------------------------------

/**
 * Lê a lista de endereços de `rua` ou `ruf`.
 *
 * Cada item tem de ser `mailto:<usuário>@<domínio>`, com tamanho máximo opcional. O domínio
 * passa por `validarNomeDns` e precisa de ao menos dois rótulos (nunca `localhost`). O item
 * que não tem essa forma, o vazio e tudo o que passa do 20º destino válido são contados em
 * `descartados`. O percent-encoding não é decodificado: o endereço fica como veio.
 *
 * @param {string} valor - Valor da tag, ex.: ``"mailto:a@exemplo.com.br!10m"``.
 * @returns {{ destinos: DestinoRelatorio[], descartados: number }} Os destinos válidos e a
 *   quantidade descartada.
 */
export const lerDestinos = (valor) => {
  /** @type {DestinoRelatorio[]} */
  const destinos = [];
  let descartados = 0;

  for (const item of valor.split(",")) {
    const destino = destinos.length < MAXIMO_DESTINOS ? lerDestino(item.trim()) : undefined;
    if (destino === undefined) {
      descartados += 1;
    } else {
      destinos.push(destino);
    }
  }
  return { destinos, descartados };
};

/**
 * Lê um item de `rua`/`ruf`.
 *
 * @param {string} item - Item já aparado, ex.: ``"mailto:a@exemplo.com.br!10m"``.
 * @returns {DestinoRelatorio | undefined} O destino, ou `undefined` se o item não é válido.
 */
const lerDestino = (item) => {
  const casou = PADRAO_DESTINO.exec(item);
  const endereco = casou?.[1];
  if (endereco === undefined || endereco.length > MAXIMO_ENDERECO) {
    return undefined;
  }
  const arroba = endereco.lastIndexOf("@");
  if (arroba === -1 || !PADRAO_USUARIO.test(endereco.slice(0, arroba))) {
    return undefined;
  }
  const dominio = validarNomeDns(endereco.slice(arroba + 1));
  if (!dominio.ok || dominio.nome.split(".").length < 2) {
    return undefined;
  }
  const tamanhoMaximo = casou?.[2];
  return tamanhoMaximo === undefined ? { endereco } : { endereco, tamanhoMaximo };
};

// ---------------------------------------------------------------------------
// TAGS
// ---------------------------------------------------------------------------

/**
 * Divide o registro em tags `nome=valor`.
 *
 * Separa no primeiro `=`; pedaço vazio e pedaço sem `=` são ignorados, e tag desconhecida
 * também (sem achado). Tag conhecida repetida vale a primeira, com `tag-duplicada` uma vez por
 * tag. O nome sai em minúsculas e o valor sem espaços nas pontas. `caixa` indica nome de tag
 * conhecida (ou `v`) com maiúscula.
 *
 * @param {string} registro - Texto do registro.
 * @returns {{ valores: Map<string, string>, achados: Achado[], caixa: boolean }} As tags
 *   conhecidas, os achados de estrutura e a marca de caixa fora do padrão.
 */
const dividirTags = (registro) => {
  /** @type {Map<string, string>} */
  const valores = new Map();
  /** @type {Achado[]} */
  const achados = [];
  const duplicadas = new Set();
  let caixa = false;
  let versaoVista = false;

  for (const pedaco of registro.split(";")) {
    const igual = pedaco.indexOf("=");
    if (igual === -1) {
      continue;
    }
    const nomeOriginal = pedaco.slice(0, igual).trim();
    const nome = nomeOriginal.toLowerCase();
    if (nome === "v") {
      // A tag `v` é a primeira (garantido pela escolha do candidato); repetida, é ignorada.
      caixa ||= !versaoVista && nome !== nomeOriginal;
      versaoVista = true;
      continue;
    }
    if (!TAGS_CONHECIDAS.includes(nome)) {
      continue;
    }
    if (valores.has(nome)) {
      if (!duplicadas.has(nome)) {
        duplicadas.add(nome);
        achados.push({ codigo: "tag-duplicada", gravidade: "aviso", tag: nome });
      }
      continue;
    }
    caixa ||= nome !== nomeOriginal;
    valores.set(nome, pedaco.slice(igual + 1).trim());
  }
  return { valores, achados, caixa };
};

/**
 * Lê uma lista separada por `:` (`fo`, `rf`) e confere cada item.
 *
 * @param {string} valor - Valor da tag, ex.: ``"0:s"``.
 * @param {(item: string) => boolean} valido - Diz se um item (em minúsculas) é aceito.
 * @returns {string[] | undefined} Os itens em minúsculas, ou `undefined` se algum é inválido.
 */
const lerLista = (valor, valido) => {
  const itens = valor.split(":").map((item) => item.trim().toLowerCase());
  return itens.every(valido) ? itens : undefined;
};

/**
 * Interpretação de cada tag opcional: devolve o valor lido ou `undefined` se é inválido.
 *
 * @type {Record<string, (valor: string) => unknown>}
 */
const INTERPRETES = {
  sp: (valor) => (ehPolitica(valor.toLowerCase()) ? valor.toLowerCase() : undefined),
  adkim: (valor) => (["r", "s"].includes(valor.toLowerCase()) ? valor.toLowerCase() : undefined),
  aspf: (valor) => (["r", "s"].includes(valor.toLowerCase()) ? valor.toLowerCase() : undefined),
  pct: (valor) =>
    PADRAO_DIGITOS.test(valor) && valor.length <= 3 && Number(valor) <= 100
      ? Number(valor)
      : undefined,
  fo: (valor) => lerLista(valor, (item) => OPCOES_FALHA_VALIDAS.includes(item)),
  rf: (valor) => lerLista(valor, (item) => PADRAO_FORMATO.test(item)),
  ri: (valor) =>
    PADRAO_DIGITOS.test(valor) && valor.length <= 10 && Number(valor) <= MAXIMO_INTERVALO
      ? Number(valor)
      : undefined,
};

// Tags cujo valor, escrito com maiúscula, gera `caixa-fora-do-padrao`.
const TAGS_COM_CAIXA = ["p", "sp", "adkim", "aspf"];

// ---------------------------------------------------------------------------
// LEITURA DO REGISTRO
// ---------------------------------------------------------------------------

/**
 * Lê o registro DMARC entre os textos TXT de `_dmarc.<domínio>`.
 *
 * Só conta quem começa com `v=DMARC1`; os outros TXT são ignorados sem achado. Nenhum
 * candidato é `ausente`; dois ou mais é `multiplos` e nenhum é lido (RFC 7489 6.6.3). Nunca
 * lança exceção: o que não é lista vira lista vazia e o que não é texto é descartado.
 *
 * @param {readonly unknown[]} textos - Textos TXT, ex.: o `registros` de `consultarTxt`.
 * @returns {ResultadoDmarc} O que há ali: `valido`, `invalido`, `multiplos` ou `ausente`.
 */
export const lerDmarc = (textos) => {
  // 1. Entrada: o módulo não confia que a camada de baixo filtrou.
  const candidatos = (Array.isArray(textos) ? textos : []).filter(
    (texto) => typeof texto === "string" && PADRAO_CANDIDATO.test(texto),
  );

  // 2. Candidatos.
  if (candidatos.length === 0) {
    return { situacao: "ausente", estagio: "nenhum" };
  }
  if (candidatos.length > 1) {
    return { situacao: "multiplos", quantidade: candidatos.length, estagio: "nenhum" };
  }
  const registro = String(candidatos[0]);

  // 3. Tamanho: um registro acima do limite é dito grande demais, não ausente.
  if (registro.length > MAXIMO_TEXTO) {
    return invalido(registro, [{ codigo: "registro-grande-demais", gravidade: "erro" }]);
  }

  // 4. Tags.
  const { valores, achados: estrutura, caixa } = dividirTags(registro);
  /** @type {Achado[]} */
  const achados = [...estrutura];
  /** @type {string[]} */
  const padrao = [];
  let caixaForaDoPadrao = caixa;

  // Os destinos entram antes da política: um `rua` válido salva um `p` ausente (ADR-5).
  // Tag ausente não tem item a descartar; `rua=` vazia tem um (o item vazio).
  const destinosDe = (/** @type {string} */ tag) => {
    const valor = valores.get(tag);
    return valor === undefined ? { destinos: [], descartados: 0 } : lerDestinos(valor);
  };
  const rua = destinosDe("rua");
  const ruf = destinosDe("ruf");

  // 5. Política.
  const brutoP = valores.get("p");
  /** @type {Politica} */
  let politica = "none";
  if (brutoP === undefined) {
    const gravidade = rua.destinos.length > 0 ? "aviso" : "erro";
    achados.push({ codigo: "politica-ausente", gravidade, tag: "p" });
    if (gravidade === "erro") {
      return invalido(registro, achados);
    }
    padrao.push("p");
  } else {
    const minusculo = brutoP.toLowerCase();
    if (!ehPolitica(minusculo)) {
      achados.push({ codigo: "politica-invalida", gravidade: "erro", tag: "p" });
      return invalido(registro, achados);
    }
    politica = minusculo;
    caixaForaDoPadrao ||= brutoP !== minusculo;
  }

  // 6. Tags opcionais, com o padrão da RFC quando ausentes ou inválidas.
  /**
   * @template T
   * @param {string} tag - Nome da tag.
   * @param {T} valorPadrao - Valor usado quando a tag falta ou é inválida.
   * @returns {T} O valor lido, ou o padrão (com `valor-invalido` se a tag existia).
   */
  const opcional = (tag, valorPadrao) => {
    const bruto = valores.get(tag);
    const lido = bruto === undefined ? undefined : INTERPRETES[tag]?.(bruto);
    if (bruto !== undefined && lido === undefined) {
      achados.push({ codigo: "valor-invalido", gravidade: "aviso", tag });
    }
    if (lido === undefined) {
      padrao.push(tag);
      return valorPadrao;
    }
    caixaForaDoPadrao ||= TAGS_COM_CAIXA.includes(tag) && bruto !== bruto?.toLowerCase();
    return /** @type {T} */ (lido);
  };

  const subdominios = opcional("sp", politica);
  const alinhamentoDkim = opcional("adkim", PADRAO_ALINHAMENTO);
  const alinhamentoSpf = opcional("aspf", PADRAO_ALINHAMENTO);
  const porcentagem = opcional("pct", PADRAO_PORCENTAGEM);
  const opcoesFalha = opcional("fo", PADRAO_OPCOES_FALHA);
  const formatos = opcional("rf", PADRAO_FORMATOS);
  const intervaloSegundos = opcional("ri", PADRAO_INTERVALO);
  for (const [tag, lidos] of /** @type {const} */ ([
    ["rua", rua],
    ["ruf", ruf],
  ])) {
    if (lidos.descartados > 0) {
      achados.push({
        codigo: "endereco-invalido",
        gravidade: "aviso",
        tag,
        detalhe: lidos.descartados,
      });
    }
    if (lidos.destinos.length === 0) {
      padrao.push(tag);
    }
  }

  // 7. Achados derivados.
  if (politica === "none") {
    achados.push({ codigo: "monitoramento-apenas", gravidade: "aviso", tag: "p" });
  } else if (porcentagem < PADRAO_PORCENTAGEM) {
    achados.push({
      codigo: "aplicacao-parcial",
      gravidade: "aviso",
      tag: "pct",
      detalhe: porcentagem,
    });
  }
  if (GRAU[subdominios] < GRAU[politica]) {
    achados.push({ codigo: "subdominios-mais-fracos", gravidade: "aviso", tag: "sp" });
  }
  if (rua.destinos.length === 0) {
    achados.push({ codigo: "sem-relatorio-agregado", gravidade: "aviso", tag: "rua" });
  }
  if (caixaForaDoPadrao) {
    achados.push({ codigo: "caixa-fora-do-padrao", gravidade: "info" });
  }

  // 8. Ordem estável.
  return {
    situacao: "valido",
    registro,
    estagio: politica,
    politica,
    subdominios,
    alinhamentoDkim,
    alinhamentoSpf,
    porcentagem,
    opcoesFalha,
    formatos,
    intervaloSegundos,
    rua: rua.destinos,
    ruf: ruf.destinos,
    padrao,
    achados: ordenar(achados),
  };
};

/**
 * Monta o resultado de um registro que a RFC manda descartar.
 *
 * @param {string} registro - Texto do registro.
 * @param {Achado[]} achados - Achados na ordem de geração.
 * @returns {DmarcInvalido} Resultado `invalido` com os achados ordenados.
 */
const invalido = (registro, achados) => ({
  situacao: "invalido",
  registro,
  estagio: "nenhum",
  achados: ordenar(achados),
});
