/**
 * @file Apresentação: transforma o estado de cada parte em um "cartão" pronto para desenhar.
 *
 * É a camada que decide **o que mostrar**: o selo, o resumo em português, o registro cortado,
 * os achados com texto, a lista de seletores DKIM com o link da documentação de cada provedor
 * e as frases do `aria-live`. Não toca o DOM nem a rede (RNF-02 da spec 006); quem desenha é
 * `pagina.js`, com `criar` de `dom.js`. Todo texto de terceiros (o registro TXT, o `detalhe`
 * de um achado, o seletor digitado) sai daqui como texto puro e cortado: nada é marcação.
 */

// @ts-check

import { urlHttps } from "./dom.js";
import { calcularSelo } from "./selo.js";
import { normalizarSeletor } from "./seletor-dkim.js";
import { ORIENTACOES, SELETORES_COMUNS } from "./seletores-dkim.js";
import { textoDoAchado } from "./textos-achados.js";
import {
  MOTIVOS_SELETOR,
  TEXTOS_ANUNCIO,
  TEXTOS_DKIM,
  TEXTOS_DMARC,
  TEXTOS_FALHA,
  TEXTOS_RESULTADO,
  TEXTOS_SPF,
  TEXTOS_VERIFICANDO,
  TITULOS_CARTAO,
} from "./textos-interface.js";

/** @typedef {import("./selo.js").Selo} Selo */
/** @typedef {import("./textos-achados.js").AchadoVisivel} AchadoVisivel */
/** @typedef {import("./tipos.js").EstadoDmarc} EstadoDmarc */
/** @typedef {import("./tipos.js").EstadoSpf} EstadoSpf */
/** @typedef {import("./tipos.js").EstadoDkim} EstadoDkim */
/** @typedef {import("./tipos.js").EstadoParte} EstadoParte */
/** @typedef {import("./tipos.js").EstadoVerificacao} EstadoVerificacao */
/** @typedef {{ texto: string, cortado: boolean }} TextoCortado */
/** @typedef {{ texto: string, motivo: string }} SeletorRecusado */
/**
 * Um seletor da lista tentada. `provedor` e `documentacao` vêm do arquivo de dados e só
 * existem para os seletores comuns; `documentacao` só é `https`.
 *
 * @typedef {{
 *   seletor: string, estado: string, provedor?: string, documentacao?: string
 * }} SeletorMostrado
 */
/**
 * O que só o DKIM tem: a lista tentada, as chaves achadas, as orientações dos provedores sem
 * seletor fixo, as recusas do campo livre e se o campo livre deve aparecer.
 *
 * @typedef {{
 *   total: number, tentados: SeletorMostrado[],
 *   encontrados: Array<{ seletor: string, provedor?: string, chave: string }>,
 *   orientacoes: Array<{ provedor: string, texto: string, documentacao?: string }>,
 *   recusados: Array<{ texto: string }>, mostrarCampo: boolean
 * }} ExtraDkim
 */
/**
 * @typedef {{
 *   id: "dmarc" | "spf" | "dkim", titulo: string, fase: "verificando" | "pronto" | "falha",
 *   selo: Selo, resumo: string, registro?: TextoCortado, achados: AchadoVisivel[],
 *   extra?: ExtraDkim
 * }} Cartao
 */
/** @typedef {{ texto: string, codigo: boolean }} Trecho */

// ---------------------------------------------------------------------------
// LIMITES
// ---------------------------------------------------------------------------

// O registro mais comprido que o leitor aceita tem 4096 caracteres; 1000 enche a tela do
// celular umas dez vezes e já mostra o essencial. O resto vai com o indicador de corte.
export const MAXIMO_REGISTRO = 1000;
// O `detalhe` de um achado é curto por construção (os módulos o cortam em 64); o limite aqui
// é a segunda barreira, caso um dia deixe de ser.
export const MAXIMO_DETALHE = 120;
// O seletor digitado aparece na lista de recusados; um texto colado enorme não deve inundá-la.
const MAXIMO_RECUSADO = 40;
// Caracteres de controle e de inversão de sentido de escrita (U+202A a 202E, U+2066 a 2069)
// disfarçam texto: viram um marcador visível em vez de mudar a leitura do que está em volta.
const PADRAO_CONTROLE = /[\p{Cc}‪-‮⁦-⁩]/gu;
const MARCADOR = "�";
const RETICENCIAS = "…";

// ---------------------------------------------------------------------------
// TEXTO
// ---------------------------------------------------------------------------

/**
 * Corta um texto de terceiros e troca os caracteres de controle por um marcador visível.
 *
 * @param {string} texto - O texto original (um registro TXT, um detalhe, um seletor digitado).
 * @param {number} maximo - Quantos caracteres cabem.
 * @returns {TextoCortado} O texto limpo, com reticências no fim se foi cortado.
 */
export const cortarTexto = (texto, maximo) => {
  const limpo = String(texto).replace(PADRAO_CONTROLE, MARCADOR);
  // `Array.from` conta pontos de código, para não partir um emoji ao meio.
  const pontos = Array.from(limpo);
  if (pontos.length <= maximo) {
    return { texto: limpo, cortado: false };
  }
  return { texto: pontos.slice(0, maximo).join("") + RETICENCIAS, cortado: true };
};

/**
 * Troca `{nome}` pelos valores. Os valores entram como estão e não são expandidos de novo.
 *
 * @param {string} modelo - Texto com marcadores `{nome}`.
 * @param {Record<string, string | number>} [valores] - Valor de cada marcador.
 * @returns {string} O texto montado; marcador sem valor vira vazio.
 */
export const preencher = (modelo, valores = {}) =>
  modelo.replace(/\{([a-z]+)\}/g, (_, nome) => String(valores[nome] ?? ""));

/**
 * Parte um texto do catálogo em trechos de texto e de código (o que está entre crases).
 *
 * @param {string} texto - Texto com trechos entre crases.
 * @returns {Trecho[]} Os trechos, na ordem. Crase sem par deixa o resto como texto.
 */
export const partirCodigo = (texto) => {
  const partes = texto.split("`");
  // Número par de partes = número ímpar de crases: a última não fechou e vale como texto.
  const semPar = partes.length % 2 === 0;
  return partes
    .map((parte, indice) => ({
      texto: parte,
      codigo: indice % 2 === 1 && !(semPar && indice === partes.length - 1),
    }))
    .filter((trecho) => trecho.texto !== "");
};

// ---------------------------------------------------------------------------
// SELETORES DIGITADOS
// ---------------------------------------------------------------------------

/**
 * Lê o campo "Seletores extras": separa por vírgula, espaço ou quebra de linha e passa cada
 * item por `normalizarSeletor`.
 *
 * @param {string} texto - O que o visitante digitou.
 * @returns {{ validos: string[], recusados: SeletorRecusado[] }} Os seletores aceitos (sem
 *   repetição) e os recusados com o motivo em português. O texto recusado vai cortado.
 */
export const lerSeletoresDigitados = (texto) => {
  /** @type {string[]} */
  const validos = [];
  /** @type {SeletorRecusado[]} */
  const recusados = [];

  for (const item of String(texto).split(/[\s,;]+/)) {
    if (item === "") {
      continue;
    }
    const lido = normalizarSeletor(item);
    if (lido.ok) {
      if (!validos.includes(lido.seletor)) {
        validos.push(lido.seletor);
      }
    } else {
      recusados.push({
        texto: cortarTexto(item, MAXIMO_RECUSADO).texto,
        motivo: MOTIVOS_SELETOR[lido.motivo]?.texto ?? lido.motivo,
      });
    }
  }
  return { validos, recusados };
};

// ---------------------------------------------------------------------------
// FALHA E CONTAGEM
// ---------------------------------------------------------------------------

/**
 * A mensagem de uma parte que não conseguiu consultar: a causa em português, que a consulta
 * já devolveu, e a frase que diz que isso não é um defeito do registro.
 *
 * @param {EstadoParte} estadoParte - O estado da parte.
 * @returns {string} A mensagem, ou ``""`` se a parte não falhou.
 */
export const mensagemDeFalha = (estadoParte) => {
  if (estadoParte.fase !== "falha") {
    return "";
  }
  const causa = estadoParte.motivo.trim() || TEXTOS_FALHA.semMotivo.texto;
  const naoDiz = preencher(TEXTOS_FALHA.naoDiz.texto, {
    parte: TITULOS_CARTAO[estadoParte.parte].texto,
  });
  return `${causa} ${naoDiz}`;
};

/**
 * A frase da contagem de consultas DNS do SPF.
 *
 * @param {{ total: number, limite: number, incompleta: boolean }} consultas - A contagem.
 * @returns {string} "N de 10 consultas DNS", ou "Pelo menos N de 10" se a contagem ficou
 *   incompleta. Acima de 10 mostra o número real (ex.: "13 de 10").
 */
export const resumoConsultas = (consultas) => {
  const modelo = consultas.incompleta ? TEXTOS_SPF.consultasPeloMenos : TEXTOS_SPF.consultas;
  return preencher(modelo.texto, { total: consultas.total, limite: consultas.limite });
};

// ---------------------------------------------------------------------------
// CARTÕES
// ---------------------------------------------------------------------------

/**
 * @param {"dmarc" | "spf" | "dkim"} id - Qual cartão.
 * @param {EstadoParte} estado - O estado da parte.
 * @param {Partial<Cartao>} resto - O que muda de cartão para cartão.
 * @returns {Cartao} O cartão com o que todos têm em comum.
 */
const cartao = (id, estado, resto) => ({
  id,
  titulo: TITULOS_CARTAO[id].texto,
  fase: estado.fase,
  selo: calcularSelo(id, estado),
  resumo: "",
  achados: [],
  ...resto,
});

/**
 * Junta os achados iguais de seletores diferentes num só (`seletores` lista todos). Um domínio
 * com um coringa `*._domainkey` revogado teria o mesmo achado repetido em cada seletor tentado.
 * A ordem é a da primeira aparição, a mesma que o módulo devolveu.
 *
 * @param {AchadoVisivel[]} achados - Achados com texto, na ordem do módulo.
 * @returns {AchadoVisivel[]} Os achados, sem repetição por seletor.
 */
const agruparPorSeletor = (achados) => {
  /** @type {Map<string, AchadoVisivel>} */
  const grupos = new Map();
  /** @type {AchadoVisivel[]} */
  const lista = [];
  for (const achado of achados) {
    const chave = [achado.codigo, achado.tag, achado.detalhe, achado.dominio].join("|");
    const grupo = achado.seletor === undefined ? undefined : grupos.get(chave);
    if (grupo !== undefined && achado.seletor !== undefined) {
      grupo.seletores = [...(grupo.seletores ?? [grupo.seletor ?? ""]), achado.seletor];
      continue;
    }
    const novo = { ...achado };
    lista.push(novo);
    if (achado.seletor !== undefined) {
      grupos.set(chave, novo);
    }
  }
  return lista;
};

/**
 * @param {Array<import("./textos-achados.js").AchadoLido>} achados - Achados do módulo.
 * @returns {AchadoVisivel[]} Os achados com texto, o `detalhe` cortado e os de seletores
 *   diferentes agrupados, na ordem do módulo.
 */
const achadosVisiveis = (achados) =>
  agruparPorSeletor(
    achados.map((achado) => {
      const visivel = textoDoAchado(achado);
      return visivel.detalhe === undefined
        ? visivel
        : { ...visivel, detalhe: cortarTexto(visivel.detalhe, MAXIMO_DETALHE).texto };
    }),
  );

/**
 * O estado que não é "pronto": o cartão mostra a espera ou a falha.
 *
 * @param {"dmarc" | "spf" | "dkim"} id - Qual cartão.
 * @param {EstadoParte} estado - O estado da parte.
 * @param {number} [total] - Quantos seletores a espera do DKIM cita.
 * @returns {Cartao | null} O cartão de espera ou de falha, ou ``null`` se a parte está pronta.
 */
const cartaoSemResultado = (id, estado, total = SELETORES_COMUNS.length) => {
  if (estado.fase === "verificando") {
    return cartao(id, estado, { resumo: preencher(TEXTOS_VERIFICANDO[id].texto, { total }) });
  }
  if (estado.fase === "falha") {
    return cartao(id, estado, { resumo: mensagemDeFalha(estado) });
  }
  return null;
};

/**
 * @param {EstadoDmarc} estado - O estado do DMARC.
 * @returns {Cartao} O cartão do DMARC: selo, registro cru cortado e achados.
 */
export const apresentarDmarc = (estado) => {
  const espera = cartaoSemResultado("dmarc", estado);
  if (espera !== null || estado.fase !== "pronto") {
    return /** @type {Cartao} */ (espera);
  }

  const dmarc = estado.resultado;
  if (dmarc.situacao === "ausente") {
    return cartao("dmarc", estado, { resumo: TEXTOS_DMARC.ausente.texto });
  }
  if (dmarc.situacao === "multiplos") {
    return cartao("dmarc", estado, {
      resumo: preencher(TEXTOS_DMARC.multiplos.texto, { quantidade: dmarc.quantidade }),
    });
  }
  return cartao("dmarc", estado, {
    resumo: dmarc.situacao === "invalido" ? TEXTOS_DMARC.invalido.texto : "",
    registro: cortarTexto(dmarc.registro, MAXIMO_REGISTRO),
    achados: achadosVisiveis(dmarc.achados),
  });
};

/**
 * Como o registro SPF termina, em português: o `all` que vale, ou o `redirect`.
 *
 * @param {import("./spf.js").SpfValido} spf - O registro SPF lido.
 * @returns {string} A frase de terminação.
 */
const terminacaoDoSpf = (spf) => {
  const todos = spf.termos.find((termo) => termo.tipo === "all" && termo.ignorado === undefined);
  if (todos !== undefined) {
    return preencher(TEXTOS_SPF.terminaEm.texto, { all: `${todos.qualificador ?? "+"}all` });
  }
  return (spf.estagio === "redirecionado" ? TEXTOS_SPF.redirecionado : TEXTOS_SPF.semAll).texto;
};

/**
 * @param {EstadoSpf} estado - O estado do SPF.
 * @returns {Cartao} O cartão do SPF: selo, contagem de consultas, terminação, registro e achados.
 */
export const apresentarSpf = (estado) => {
  const espera = cartaoSemResultado("spf", estado);
  if (espera !== null || estado.fase !== "pronto") {
    return /** @type {Cartao} */ (espera);
  }

  const { spf, consultas, achados } = estado.resultado;
  if (spf.situacao === "ausente") {
    return cartao("spf", estado, { resumo: TEXTOS_SPF.ausente.texto });
  }
  if (spf.situacao === "multiplos") {
    return cartao("spf", estado, {
      resumo: preencher(TEXTOS_SPF.multiplos.texto, { quantidade: spf.quantidade }),
    });
  }
  if (spf.situacao === "invalido") {
    return cartao("spf", estado, {
      resumo: TEXTOS_SPF.invalido.texto,
      registro: cortarTexto(spf.registro, MAXIMO_REGISTRO),
      achados: achadosVisiveis(achados),
    });
  }

  const frases = [resumoConsultas(consultas), terminacaoDoSpf(spf)];
  if (consultas.passouDoLimite) {
    frases.push(TEXTOS_SPF.passouDoLimite.texto);
  }
  return cartao("spf", estado, {
    resumo: frases.join(" "),
    registro: cortarTexto(spf.registro, MAXIMO_REGISTRO),
    achados: achadosVisiveis(achados),
  });
};

/**
 * @param {import("./dkim-busca.js").SeletorTentado[]} tentados - Os seletores da busca.
 * @returns {SeletorMostrado[]} Cada um com o provedor e o link da documentação, se for comum.
 */
const seletoresMostrados = (tentados) =>
  tentados.map(({ seletor, estado }) => {
    const comum = SELETORES_COMUNS.find((item) => item.seletor === seletor);
    const documentacao = comum === undefined ? null : urlHttps(comum.documentacao);
    return {
      seletor,
      estado,
      ...(comum === undefined ? {} : { provedor: comum.provedor }),
      ...(documentacao === null ? {} : { documentacao }),
    };
  });

/**
 * @param {import("./dkim.js").DkimValido} dkim - A leitura de um seletor com registro válido.
 * @returns {string} O tipo e o tamanho da chave, em português.
 */
const descreverChave = (dkim) => {
  if (dkim.tipo === "ed25519") {
    return TEXTOS_DKIM.chaveEd25519.texto;
  }
  if (dkim.tipo === "rsa") {
    return dkim.tamanhoBits === undefined
      ? TEXTOS_DKIM.chaveRsaSemTamanho.texto
      : preencher(TEXTOS_DKIM.chaveRsa.texto, { bits: dkim.tamanhoBits });
  }
  return TEXTOS_DKIM.chaveOutra.texto;
};

/**
 * @param {import("./dkim-busca.js").BuscaDkim} busca - O resultado da busca.
 * @param {ExtraDkim["encontrados"]} encontrados - Os seletores com chave.
 * @returns {string} O resumo do cartão para o que a busca achou.
 */
const resumoDoDkim = (busca, encontrados) => {
  const total = busca.seletores.length;
  const [primeiro] = encontrados;
  if (busca.situacao === "encontrado" && primeiro !== undefined) {
    const cabecalho =
      encontrados.length === 1
        ? preencher(TEXTOS_DKIM.encontrado.texto, {
            seletor: primeiro.seletor,
            chave: primeiro.chave,
            total,
          })
        : preencher(TEXTOS_DKIM.encontradoVarios.texto, {
            quantidade: encontrados.length,
            seletores: encontrados.map((item) => `\`${item.seletor}\``).join(", "),
            total,
          });
    return busca.incompleta ? `${cabecalho} ${parcial(busca)}` : cabecalho;
  }
  return busca.situacao === "nao-encontrado"
    ? preencher(TEXTOS_DKIM.naoEncontrado.texto, { total })
    : parcial(busca);
};

/**
 * @param {import("./dkim-busca.js").BuscaDkim} busca - O resultado da busca.
 * @returns {string} A frase de que parte dos seletores não foi verificada.
 */
const parcial = (busca) =>
  preencher(TEXTOS_DKIM.parcial.texto, {
    verificados: busca.seletores.filter((item) => item.estado !== "nao-verificado").length,
    total: busca.seletores.length,
  });

/**
 * @param {EstadoDkim} estado - O estado do DKIM.
 * @param {{ recusados?: SeletorRecusado[], totalSeletores?: number }} [extras] - As recusas do
 *   campo livre (de `lerSeletoresDigitados`) e quantos seletores a espera cita.
 * @returns {Cartao} O cartão do DKIM: selo, resumo, lista dos tentados com o provedor e o link,
 *   e os achados de cada seletor.
 */
export const apresentarDkim = (estado, { recusados = [], totalSeletores } = {}) => {
  const espera = cartaoSemResultado("dkim", estado, totalSeletores);
  if (espera !== null || estado.fase !== "pronto") {
    return /** @type {Cartao} */ (espera);
  }

  const busca = estado.resultado;
  const encontrados = busca.seletores.flatMap(({ seletor, dkim }) => {
    if (dkim?.situacao !== "valido") {
      return [];
    }
    const comum = SELETORES_COMUNS.find((item) => item.seletor === seletor);
    return [
      {
        seletor,
        chave: descreverChave(dkim),
        ...(comum === undefined ? {} : { provedor: comum.provedor }),
      },
    ];
  });

  return cartao("dkim", estado, {
    resumo: resumoDoDkim(busca, encontrados),
    achados: achadosVisiveis(busca.achados),
    extra: {
      total: busca.seletores.length,
      tentados: seletoresMostrados(busca.seletores),
      encontrados,
      orientacoes: ORIENTACOES.map(({ provedor, documentacao }) => {
        const url = urlHttps(documentacao);
        return {
          provedor,
          texto: preencher(TEXTOS_DKIM.orientacao.texto, { provedor }),
          ...(url === null ? {} : { documentacao: url }),
        };
      }),
      recusados: recusados.map(({ texto, motivo }) => ({
        texto: preencher(TEXTOS_DKIM.recusado.texto, { texto, motivo }),
      })),
      mostrarCampo: true,
    },
  });
};

// ---------------------------------------------------------------------------
// RESULTADO
// ---------------------------------------------------------------------------

/**
 * Quem viu o domínio nesta verificação, para o rodapé do resultado.
 *
 * @param {EstadoVerificacao} estado - O estado das três partes.
 * @returns {string | null} A frase, ou ``null`` se nenhum resolvedor respondeu.
 */
export const rodapeDosResolvedores = (estado) => {
  const nomes = new Set();
  for (const parte of Object.values(estado.partes)) {
    if (parte.fase === "pronto") {
      for (const resolvedor of parte.resolvedores) {
        nomes.add(resolvedor);
      }
    }
  }
  const cloudflare = nomes.has("cloudflare");
  const google = nomes.has("google");
  if (!cloudflare && !google) {
    return null;
  }
  const quem =
    cloudflare && google
      ? TEXTOS_RESULTADO.resolvedorAmbos
      : cloudflare
        ? TEXTOS_RESULTADO.resolvedorCloudflare
        : TEXTOS_RESULTADO.resolvedorGoogle;
  return preencher(TEXTOS_RESULTADO.resolvedores.texto, { quem: quem.texto });
};

// ---------------------------------------------------------------------------
// ANÚNCIOS PARA LEITOR DE TELA
// ---------------------------------------------------------------------------

/**
 * @param {string} dominio - O domínio em verificação.
 * @returns {string} A frase do início da verificação.
 */
export const anunciarInicio = (dominio) => preencher(TEXTOS_ANUNCIO.inicio.texto, { dominio });

/**
 * @param {string} dominio - O domínio verificado.
 * @returns {string} A frase de que o domínio não existe.
 */
export const anunciarInexistente = (dominio) =>
  preencher(TEXTOS_ANUNCIO.inexistente.texto, { dominio });

/**
 * A frase do fim da verificação. Usa só a palavra do selo de cada cartão, em minúsculas, para
 * não afirmar mais do que ele.
 *
 * @param {string} dominio - O domínio verificado.
 * @param {{ dmarc: Cartao, spf: Cartao, dkim: Cartao }} cartoes - Os três cartões.
 * @returns {string} A frase de resultado pronto.
 */
export const anunciarFim = (dominio, cartoes) =>
  preencher(TEXTOS_ANUNCIO.fim.texto, {
    dominio,
    dmarc: cartoes.dmarc.selo.texto.toLowerCase(),
    spf: cartoes.spf.selo.texto.toLowerCase(),
    dkim: cartoes.dkim.selo.texto.toLowerCase(),
  });
