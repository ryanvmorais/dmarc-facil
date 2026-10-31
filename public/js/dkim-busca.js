/**
 * @file Busca da chave DKIM de um domínio numa lista de seletores, com consultas simultâneas
 * em número limitado.
 *
 * O DKIM não tem como listar os seletores de um domínio: o nome `<seletor>._domainkey.<domínio>`
 * é escolha de quem envia. A ferramenta tenta uma lista de seletores comuns mais os que o
 * visitante digitar, e por isso o resultado honesto de "nada achado" é `nao-encontrado`
 * ("não encontrei nesses seletores"), junto da lista dos seletores tentados. Nenhum campo do
 * resultado afirma que o domínio "não tem DKIM".
 *
 * São 15 a 40 consultas por busca. Fazê-las uma a uma deixa a página lenta, e dispará-las todas
 * de uma vez abre conexões demais e impede parar quando o resolvedor está falhando; por isso um
 * pequeno grupo de trabalhadores consome a lista, cada um gravando o resultado na posição do
 * seletor (a ordem da lista, não a de chegada).
 *
 * A função de consulta chega por parâmetro (`consultarTxt` no navegador, uma falsa nos testes):
 * o módulo não importa `fetch` e não registra nenhum nome consultado. Nada aqui lança exceção
 * para dado de terceiros.
 */

// @ts-check

import { lerDkim, ORDEM_GRAVIDADE } from "./dkim.js";
import { normalizarDominio } from "./dominio.js";
import { MAXIMO_SELETORES, normalizarSeletor } from "./seletor-dkim.js";

/** @typedef {import("./dkim.js").Achado} Achado */
/** @typedef {import("./dkim.js").ResultadoDkim} ResultadoDkim */
/** @typedef {import("./spf-consultas.js").Consulta} Consulta */
/**
 * Um seletor tentado. `dkim` existe quando há registro (qualquer situação menos `ausente`);
 * `motivo` vem da consulta que falhou; `interrompido` marca o seletor que nem foi tentado
 * porque a busca parou.
 *
 * @typedef {{
 *   seletor: string, nome: string, estado: ResultadoDkim["situacao"] | "nao-verificado",
 *   dkim?: Exclude<ResultadoDkim, { situacao: "ausente" }>, motivo?: string,
 *   interrompido?: true
 * }} SeletorTentado
 */
/**
 * @typedef {{
 *   ok: true, situacao: "encontrado" | "nao-encontrado" | "indeterminado", incompleta: boolean,
 *   seletores: SeletorTentado[], achados: Achado[], resolvedores: string[]
 * }} BuscaDkim
 */
/** @typedef {BuscaDkim | { ok: false, motivo: string }} ResultadoBusca */
/** @typedef {{ concorrencia?: number, maximoFalhas?: number }} OpcoesBusca */

// ---------------------------------------------------------------------------
// LIMITES
// ---------------------------------------------------------------------------

// Consultas em andamento ao mesmo tempo (ADR-4). 6 é o limite clássico de conexões por host do
// HTTP/1.1: 19 seletores levam 4 rodadas, a ~100 ms cada. As medições da spec 002 (200 em
// paralelo sem 429) não são licença para disparar tudo de uma vez.
export const CONCORRENCIA_PADRAO = 6;
const CONCORRENCIA_MAXIMA = 10;
// Falhas de rede toleradas antes de parar de abrir consultas (ADR-5): cada uma pode esperar o
// tempo dos dois resolvedores, e com a rede fora do ar as outras também falhariam.
export const MAXIMO_FALHAS = 3;
const FALHAS_MAXIMAS = 10;

const MOTIVO_SEM_SELETORES = "Não há seletor para procurar.";
const MOTIVO_SEM_DOMINIO = "Digite um domínio, por exemplo exemplo.com.br.";

// ---------------------------------------------------------------------------
// AUXILIARES
// ---------------------------------------------------------------------------

/**
 * @param {unknown} valor - Opção recebida.
 * @param {number} maximo - Maior valor aceito.
 * @param {number} padrao - Valor usado quando a opção falta ou está fora do intervalo.
 * @returns {number} Um inteiro de 1 a `maximo`.
 */
const limitar = (valor, maximo, padrao) =>
  typeof valor === "number" && Number.isInteger(valor) && valor >= 1 && valor <= maximo
    ? valor
    : padrao;

/**
 * Prepara a lista: normaliza cada seletor, tira os inválidos e os repetidos e corta no teto.
 *
 * @param {unknown} seletores - Seletores recebidos.
 * @returns {{ lista: string[], achados: Achado[] }} A lista pronta e os achados de quem sobrou
 *   de fora (`seletor-invalido`, `seletores-demais`).
 */
const prepararLista = (seletores) => {
  /** @type {string[]} */
  const lista = [];
  /** @type {Achado[]} */
  const achados = [];
  const vistos = new Set();
  let cortados = 0;

  for (const bruto of Array.isArray(seletores) ? seletores : []) {
    const lido = normalizarSeletor(bruto);
    if (!lido.ok) {
      achados.push({ codigo: "seletor-invalido", gravidade: "info", detalhe: lido.motivo });
      continue;
    }
    if (vistos.has(lido.seletor)) {
      continue;
    }
    vistos.add(lido.seletor);
    if (lista.length >= MAXIMO_SELETORES) {
      cortados += 1;
      continue;
    }
    lista.push(lido.seletor);
  }

  if (cortados > 0) {
    achados.push({ codigo: "seletores-demais", gravidade: "info", detalhe: cortados });
  }
  return { lista, achados };
};

/**
 * Junta os achados dos seletores (etiquetados com o seletor) e os da busca, e os ordena por
 * gravidade, depois pela posição do seletor na lista (os da busca vão depois dos seletores) e
 * por fim pela ordem de geração (o `sort` é estável).
 *
 * @param {SeletorTentado[]} tentados - Os seletores, na ordem da lista.
 * @param {Achado[]} daBusca - Achados que não pertencem a um seletor.
 * @returns {Achado[]} Os achados ordenados.
 */
const reunirAchados = (tentados, daBusca) => {
  /** @type {Array<{ achado: Achado, posicao: number }>} */
  const todos = [];
  tentados.forEach((tentado, posicao) => {
    for (const achado of tentado.dkim?.achados ?? []) {
      todos.push({ achado: { ...achado, seletor: tentado.seletor }, posicao });
    }
  });
  for (const achado of daBusca) {
    todos.push({ achado, posicao: tentados.length });
  }

  return todos
    .sort(
      (a, b) =>
        ORDEM_GRAVIDADE[a.achado.gravidade] - ORDEM_GRAVIDADE[b.achado.gravidade] ||
        a.posicao - b.posicao,
    )
    .map(({ achado }) => achado);
};

// ---------------------------------------------------------------------------
// BUSCA
// ---------------------------------------------------------------------------

/**
 * Procura a chave DKIM do domínio nos seletores dados.
 *
 * Passos: normaliza o domínio (recusa o que não for domínio, sem consultar); prepara a lista
 * de seletores; consulta `<seletor>._domainkey.<domínio>` com no máximo `concorrencia`
 * consultas em andamento; lê cada resposta com `lerDkim`; e resume. Depois de `maximoFalhas`
 * falhas de rede ninguém abre consulta nova: os seletores que sobraram saem `nao-verificado`
 * com `interrompido`, e há o achado `busca-interrompida`.
 *
 * @param {unknown} dominio - Domínio digitado; é normalizado aqui, antes de qualquer nome.
 * @param {unknown} seletores - Seletores a tentar (a lista comum mais os digitados).
 * @param {Consulta} consulta - Função de consulta TXT (a `consultarTxt` no navegador).
 * @param {OpcoesBusca} [opcoes={}] - ``concorrencia`` (padrão 6) e ``maximoFalhas`` (padrão 3).
 * @returns {Promise<ResultadoBusca>} A busca, ou ``{ ok: false, motivo }`` se o domínio não vale
 *   ou não há seletor.
 * @throws {TypeError} Se ``consulta`` não for função (erro de programação, não de dado).
 */
export const buscarDkim = async (dominio, seletores, consulta, opcoes = {}) => {
  if (typeof consulta !== "function") {
    throw new TypeError("buscarDkim espera a função de consulta.");
  }

  // 1. O domínio vira nome DNS só depois de normalizado.
  const normalizado = typeof dominio === "string" ? normalizarDominio(dominio) : undefined;
  if (normalizado === undefined) {
    return { ok: false, motivo: MOTIVO_SEM_DOMINIO };
  }
  if (!normalizado.ok) {
    return { ok: false, motivo: normalizado.motivo };
  }

  // 2. A lista de seletores.
  const { lista, achados: daBusca } = prepararLista(seletores);
  if (lista.length === 0) {
    return { ok: false, motivo: MOTIVO_SEM_SELETORES };
  }
  const concorrencia = limitar(opcoes.concorrencia, CONCORRENCIA_MAXIMA, CONCORRENCIA_PADRAO);
  const maximoFalhas = limitar(opcoes.maximoFalhas, FALHAS_MAXIMAS, MAXIMO_FALHAS);

  // 3. Todo seletor começa "não tentado"; cada trabalhador troca o seu pelo resultado.
  /** @type {SeletorTentado[]} */
  const tentados = lista.map((seletor) => ({
    seletor,
    nome: `${seletor}._domainkey.${normalizado.dominio}`,
    estado: "nao-verificado",
    interrompido: true,
  }));
  const resolvedores = new Set();
  let proximo = 0;
  let falhas = 0;

  // Cada trabalhador pega o próximo índice até a lista acabar ou as falhas passarem do limite.
  // O JavaScript tem uma thread só, então `proximo` não corre risco entre os trabalhadores.
  const trabalhar = async () => {
    while (falhas < maximoFalhas && proximo < tentados.length) {
      const indice = proximo;
      proximo += 1;
      const { seletor, nome } = tentados[indice] ?? { seletor: "", nome: "" };
      const resposta = await consulta(nome);

      if (!resposta.ok) {
        falhas += 1;
        tentados[indice] = { seletor, nome, estado: "nao-verificado", motivo: resposta.motivo };
        continue;
      }
      if (resposta.resolvedor !== undefined) {
        resolvedores.add(resposta.resolvedor);
      }
      const dkim = lerDkim(resposta.registros);
      tentados[indice] =
        dkim.situacao === "ausente"
          ? { seletor, nome, estado: "ausente" }
          : { seletor, nome, estado: dkim.situacao, dkim };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concorrencia, tentados.length) }, trabalhar));

  // 4. O resumo: só `encontrado` com ao menos um registro válido; `nao-encontrado` só com todos
  // os seletores verificados.
  if (tentados.some((tentado) => tentado.interrompido)) {
    daBusca.push({ codigo: "busca-interrompida", gravidade: "aviso" });
  }
  const incompleta = tentados.some((tentado) => tentado.estado === "nao-verificado");
  /** @type {BuscaDkim["situacao"]} */
  let situacao = incompleta ? "indeterminado" : "nao-encontrado";
  if (tentados.some((tentado) => tentado.estado === "valido")) {
    situacao = "encontrado";
  }
  if (situacao === "nao-encontrado") {
    daBusca.push({ codigo: "nenhum-seletor-encontrado", gravidade: "info" });
  }

  return {
    ok: true,
    situacao,
    incompleta,
    seletores: tentados,
    achados: reunirAchados(tentados, daBusca),
    resolvedores: [...resolvedores].sort(),
  };
};
