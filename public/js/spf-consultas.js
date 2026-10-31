/**
 * @file Caminhada pelos `include` e `redirect` de um registro SPF para contar as consultas DNS
 * que um receptor faria.
 *
 * O limite do SPF é de 10 termos que gastam consulta (`include`, `a`, `mx`, `ptr`, `exists` e
 * `redirect`), contados em todos os níveis: os `include` de provedores trazem os próprios
 * termos para a conta. Passou de 10, o receptor devolve `permerror` e o SPF todo deixa de
 * valer. Contar exige seguir os `include` e o `redirect`, ou seja, consultar o TXT de outros
 * domínios.
 *
 * A função de consulta chega por parâmetro (`consultarTxt` no navegador, uma falsa nos
 * testes): o módulo não importa `fetch` e não registra nenhum nome percorrido. A contagem é o
 * pior caso, sem tentar casar um IP, então a página deve dizer "pode usar até N consultas".
 * Nada aqui lança exceção para dado de terceiros.
 */

// @ts-check

import { validarNomeDns } from "./nome-dns.js";
import { LIMITE_CONSULTAS, lerSpf, ordenarAchados, TIPOS_QUE_CONSULTAM } from "./spf.js";

/** @typedef {import("./spf.js").Achado} Achado */
/** @typedef {import("./spf.js").EstagioSpf} EstagioSpf */
/** @typedef {import("./spf.js").ResultadoSpf} ResultadoSpf */
/** @typedef {import("./spf.js").Termo} Termo */
/** @typedef {import("./spf.js").TipoTermo} TipoTermo */
/** @typedef {EstagioSpf | "indeterminado"} EstagioFinal */
/**
 * A função de consulta TXT. É o formato de `consultarTxt`, que serve direto.
 *
 * @typedef {(nome: string) => Promise<
 *   | { ok: true, situacao: "encontrado" | "sem-registro" | "inexistente", registros: string[], resolvedor?: string }
 *   | { ok: false, motivo: string }
 * >} Consulta
 */
/**
 * Uma consulta contada. `caminho` vai do domínio digitado até o domínio que tem o termo; `alvo`
 * falta em `a`, `mx` e `ptr` sem alvo (vale o domínio atual) e em macro.
 *
 * @typedef {{ tipo: TipoTermo, alvo?: string, macro?: boolean, caminho: string[] }} ItemConsulta
 */
/**
 * @typedef {{
 *   total: number, limite: typeof LIMITE_CONSULTAS, passouDoLimite: boolean,
 *   incompleta: boolean, interrompida: boolean, itens: ItemConsulta[]
 * }} Consultas
 */
/**
 * @typedef {{
 *   ok: true, spf: ResultadoSpf, estagio: EstagioFinal,
 *   consultas: Consultas, achados: Achado[], resolvedores: string[]
 * }} CaminhadaSpf
 */
/** @typedef {CaminhadaSpf | { ok: false, motivo: string }} ResultadoCaminhada */
/** @typedef {{ spf: ResultadoSpf | undefined }} Entrada */

// ---------------------------------------------------------------------------
// LIMITES
// ---------------------------------------------------------------------------

// Teto de termos contados, em todos os níveis (ADR-6). É o triplo do limite da RFC: passando de
// 10 a caminhada continua para mostrar o total real, mas um registro hostil não faz a página
// disparar consultas sem fim. Cada `include` e `redirect` seguido já foi contado, então o teto
// também limita as consultas de rede e a profundidade.
export const TETO_CONSULTAS = 30;
// Falhas de rede toleradas antes de desistir: cada uma pode esperar o tempo dos dois
// resolvedores, e com a rede fora do ar o resto também falharia.
export const MAXIMO_FALHAS = 3;
// Acima disso, as consultas que voltam vazias já são `permerror` (RFC 7208, 4.6.4).
const MAXIMO_CONSULTAS_VAZIAS = 2;
// A partir daqui a página avisa que uma inclusão nova pode quebrar o SPF.
const PERTO_DO_LIMITE = 8;

// Dos registros incluídos só importa o que quebra ou escancara o domínio de quem inclui. O
// `all` de um provedor não vale para o domínio, então `all-rigido`, `sem-all` e o resto são
// ruído (ADR-10).
const CODIGOS_DE_INCLUIDOS = [
  "ptr-em-uso",
  "termo-invalido",
  "modificador-repetido",
  "all-libera-tudo",
  "registro-grande-demais",
];

// ---------------------------------------------------------------------------
// ACHADOS
// ---------------------------------------------------------------------------

/**
 * Tira os achados repetidos. Dois achados são o mesmo se têm o mesmo código, domínio, tag e
 * detalhe (o detalhe entra para dois termos repetidos diferentes não virarem um só).
 *
 * @param {Achado[]} achados - Achados na ordem de geração.
 * @returns {Achado[]} Os achados sem repetição, na mesma ordem.
 */
const semRepeticao = (achados) => {
  const vistos = new Set();
  return achados.filter((achado) => {
    const chave = [achado.codigo, achado.dominio, achado.tag, achado.detalhe].join("|");
    if (vistos.has(chave)) {
      return false;
    }
    vistos.add(chave);
    return true;
  });
};

/**
 * @param {ResultadoSpf} spf - Resultado de `lerSpf`.
 * @returns {Achado[]} Os achados do registro, ou nenhum se o resultado não os tem.
 */
const achadosDe = (spf) =>
  spf.situacao === "valido" || spf.situacao === "invalido" ? spf.achados : [];

// ---------------------------------------------------------------------------
// CAMINHADA
// ---------------------------------------------------------------------------

/**
 * Caminha pelo registro da raiz, em profundidade e uma consulta por vez, na ordem do receptor:
 * as diretivas na ordem do registro e, por último, o `redirect`.
 *
 * @param {string} raiz - Domínio digitado, já validado.
 * @param {import("./spf.js").SpfValido} spfRaiz - O registro da raiz, já lido.
 * @param {Consulta} consultar - A função de consulta TXT.
 * @param {Set<string>} resolvedores - Recebe quem respondeu, na ordem.
 * @returns {Promise<{
 *   estagio: EstagioFinal, total: number, vazias: number, incompleta: boolean,
 *   interrompida: boolean, itens: ItemConsulta[], achados: Achado[]
 * }>} O que a caminhada contou e achou.
 */
const caminhar = async (raiz, spfRaiz, consultar, resolvedores) => {
  const estado = { total: 0, falhas: 0, vazias: 0, incompleta: false, interrompida: false };
  /** @type {ItemConsulta[]} */
  const itens = [];
  /** @type {Achado[]} */
  const achados = [];
  // Cada nome é consultado no máximo uma vez; o `include` repetido em outro ramo (diamante)
  // reaproveita a resposta, mas os termos dele contam de novo (ADR-5).
  /** @type {Map<string, Entrada>} */
  const cache = new Map([[raiz, { spf: spfRaiz }]]);

  /**
   * @param {string} codigo - Código do achado.
   * @param {import("./spf.js").Achado["gravidade"]} gravidade - Gravidade.
   * @param {string} tag - O tipo do termo.
   * @param {string} dominio - O domínio a que o achado se refere.
   * @returns {void}
   */
  const achar = (codigo, gravidade, tag, dominio) => {
    achados.push({ codigo, gravidade, tag, dominio });
  };

  /** Para tudo: a contagem passa a ser parcial. */
  const interromper = () => {
    estado.interrompida = true;
    estado.incompleta = true;
  };

  /**
   * Consulta um nome ainda não visto e guarda a leitura. `spf` fica `undefined` na falha.
   *
   * @param {string} nome - Nome já validado por `lerSpf`.
   * @returns {Promise<Entrada>} A leitura do nome.
   */
  const buscar = async (nome) => {
    const guardada = cache.get(nome);
    if (guardada !== undefined) {
      return guardada;
    }
    const resposta = await consultar(nome);
    /** @type {Entrada} */
    let entrada = { spf: undefined };
    if (resposta.ok) {
      if (resposta.resolvedor !== undefined) {
        resolvedores.add(resposta.resolvedor);
      }
      if (resposta.situacao !== "encontrado") {
        estado.vazias += 1;
      }
      entrada = { spf: lerSpf(resposta.registros) };
    } else {
      estado.falhas += 1;
      estado.incompleta = true;
      if (estado.falhas >= MAXIMO_FALHAS) {
        interromper();
      }
    }
    cache.set(nome, entrada);
    return entrada;
  };

  /**
   * Junta os achados de um registro incluído que valem para quem o inclui.
   *
   * @param {Achado[]} doRegistro - Achados do registro incluído.
   * @param {string} dominio - O domínio desse registro.
   * @returns {void}
   */
  const juntarDoIncluido = (doRegistro, dominio) => {
    for (const achado of doRegistro) {
      if (CODIGOS_DE_INCLUIDOS.includes(achado.codigo)) {
        achados.push({ ...achado, dominio });
      }
    }
  };

  /**
   * Segue um `include` ou `redirect`.
   *
   * O alvo já foi validado por `lerSpf` (nome DNS ou macro), então nunca chega à consulta um
   * texto cru. `dominio` do achado é o do alvo, menos em `ciclo` e macro, que ficam no registro
   * onde o termo está.
   *
   * @param {Termo} termo - O `include` ou `redirect`.
   * @param {string} atual - O domínio do registro que tem o termo.
   * @param {string[]} caminho - Da raiz até `atual`.
   * @returns {Promise<EstagioFinal>} O estágio do registro de destino (só o `redirect` usa).
   */
  const seguir = async (termo, atual, caminho) => {
    const tipo = termo.tipo;
    const alvo = termo.dominio;
    if (alvo === undefined) {
      achar("macro-nao-avaliada", "info", tipo, atual);
      estado.incompleta = true;
      return "indeterminado";
    }
    if (caminho.includes(alvo)) {
      achar("ciclo", "erro", tipo, atual);
      return "nenhum";
    }

    const { spf } = await buscar(alvo);
    if (spf === undefined) {
      achar("consulta-falhou", "aviso", tipo, alvo);
      return "indeterminado";
    }
    if (spf.situacao === "ausente") {
      achar(`${tipo}-sem-registro`, "erro", tipo, alvo);
      return "nenhum";
    }
    if (spf.situacao === "multiplos") {
      achar(`${tipo}-com-varios-registros`, "erro", tipo, alvo);
      return "nenhum";
    }
    juntarDoIncluido(spf.achados, alvo);
    if (spf.situacao === "invalido") {
      achar(`${tipo}-invalido`, "erro", tipo, alvo);
      return "nenhum";
    }
    return percorrer(alvo, spf, [...caminho, alvo]);
  };

  /**
   * Conta os termos de um registro e segue os `include` e o `redirect`.
   *
   * @param {string} atual - O domínio do registro.
   * @param {import("./spf.js").SpfValido} spf - O registro, já lido.
   * @param {string[]} caminho - Da raiz até `atual`.
   * @returns {Promise<EstagioFinal>} O estágio do registro: o do `all`, ou o do destino do
   *   `redirect`.
   */
  const percorrer = async (atual, spf, caminho) => {
    const avaliados = spf.termos.filter((termo) => termo.ignorado === undefined);
    const redirect = avaliados.find((termo) => termo.tipo === "redirect");
    // O receptor aplica o `redirect` depois de todas as diretivas, onde quer que ele esteja.
    const ordem = avaliados.filter((termo) => termo.tipo !== "redirect" && termo.tipo !== "exp");
    if (redirect !== undefined) {
      ordem.push(redirect);
    }

    let estagioDoRedirect = /** @type {EstagioFinal} */ ("indeterminado");
    for (const termo of ordem) {
      if (estado.interrompida) {
        break;
      }
      if (!TIPOS_QUE_CONSULTAM.includes(/** @type {never} */ (termo.tipo))) {
        continue;
      }
      if (estado.total >= TETO_CONSULTAS) {
        interromper();
        break;
      }
      estado.total += 1;
      /** @type {ItemConsulta} */
      const item = { tipo: termo.tipo, caminho: [...caminho] };
      if (termo.dominio !== undefined) {
        item.alvo = termo.dominio;
      }
      if (termo.macro === true) {
        item.macro = true;
      }
      itens.push(item);

      // `a`, `mx`, `ptr` e `exists` contam, mas só TXT é consultado (ADR-7).
      if (termo.tipo === "include" || termo.tipo === "redirect") {
        const estagio = await seguir(termo, atual, caminho);
        if (termo === redirect) {
          estagioDoRedirect = estagio;
        }
      }
    }
    return spf.estagio === "redirecionado" ? estagioDoRedirect : spf.estagio;
  };

  const estagio = await percorrer(raiz, spfRaiz, [raiz]);
  return { estagio, ...estado, itens, achados };
};

// ---------------------------------------------------------------------------
// LEITURA COM CONSULTAS
// ---------------------------------------------------------------------------

/**
 * Lê o registro SPF de um domínio, segue os `include` e o `redirect` e conta as consultas DNS.
 *
 * Passou de 10, a caminhada continua até `TETO_CONSULTAS` ou `MAXIMO_FALHAS`, para mostrar o
 * total real e o caminho de cada termo. O que não pôde ser verificado (falha de rede, macro,
 * parada no teto) marca a contagem como `incompleta`.
 *
 * @param {string} dominio - Domínio já normalizado, ex.: ``"exemplo.com.br"``.
 * @param {Consulta} consultar - A função de consulta TXT, ex.: `consultarTxt`.
 * @returns {Promise<ResultadoCaminhada>} ``{ ok: true, ... }`` com o registro, o estágio, as
 *   consultas e os achados, ou ``{ ok: false, motivo }`` se o domínio é inválido ou a consulta
 *   dele falhou.
 * @throws {TypeError} Se ``dominio`` não for texto (erro de programação, não de consulta).
 */
export const lerSpfComConsultas = async (dominio, consultar) => {
  if (typeof dominio !== "string") {
    throw new TypeError("lerSpfComConsultas espera o domínio como texto.");
  }

  // 1. Domínio digitado.
  const validado = validarNomeDns(dominio);
  if (!validado.ok) {
    return { ok: false, motivo: validado.motivo };
  }
  const raiz = validado.nome;
  const resposta = await consultar(raiz);
  if (!resposta.ok) {
    return { ok: false, motivo: resposta.motivo };
  }
  const resolvedores = new Set(resposta.resolvedor === undefined ? [] : [resposta.resolvedor]);

  // 2. Leitura: registro ausente, múltiplo ou inválido não tem o que percorrer.
  const spf = lerSpf(resposta.registros);
  const noRaiz = achadosDe(spf).map((achado) => ({ ...achado, dominio: raiz }));
  if (spf.situacao !== "valido") {
    return {
      ok: true,
      spf,
      estagio: spf.estagio,
      consultas: {
        total: 0,
        limite: LIMITE_CONSULTAS,
        passouDoLimite: false,
        incompleta: false,
        interrompida: false,
        itens: [],
      },
      achados: noRaiz,
      resolvedores: [...resolvedores],
    };
  }

  // 3. Caminhada.
  const caminhada = await caminhar(raiz, spf, consultar, resolvedores);

  // 4. Fechamento: os achados do conjunto, ligados ao domínio digitado.
  /** @type {Achado[]} */
  const doConjunto = [];
  const fechar = (
    /** @type {string} */ codigo,
    /** @type {Achado["gravidade"]} */ gravidade,
    /** @type {number} */ detalhe,
  ) => {
    doConjunto.push({ codigo, gravidade, detalhe, dominio: raiz });
  };
  if (caminhada.vazias > MAXIMO_CONSULTAS_VAZIAS) {
    fechar("consultas-vazias", "erro", caminhada.vazias);
  }
  if (caminhada.total > LIMITE_CONSULTAS) {
    fechar("limite-de-consultas", "erro", caminhada.total);
  } else if (caminhada.total >= PERTO_DO_LIMITE) {
    fechar("perto-do-limite", "aviso", caminhada.total);
  }
  if (caminhada.interrompida) {
    fechar("caminhada-interrompida", "aviso", caminhada.total);
  }

  return {
    ok: true,
    spf,
    estagio: caminhada.estagio,
    consultas: {
      total: caminhada.total,
      limite: LIMITE_CONSULTAS,
      passouDoLimite: caminhada.total > LIMITE_CONSULTAS,
      incompleta: caminhada.incompleta,
      interrompida: caminhada.interrompida,
      itens: caminhada.itens,
    },
    achados: ordenarAchados(semRepeticao([...noRaiz, ...caminhada.achados, ...doConjunto])),
    resolvedores: [...resolvedores],
  };
};
