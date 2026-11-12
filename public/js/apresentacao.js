/**
 * @file Apresentação: transforma o estado de cada parte em um "cartão" pronto para desenhar.
 *
 * É a camada que decide **o que mostrar**: o selo, o resumo em português, o registro cortado,
 * os achados com texto, a lista de seletores DKIM com o link da documentação de cada provedor
 * e as frases do `aria-live`. Não toca o DOM nem a rede (RNF-02 da spec 006); quem desenha é
 * `pagina.js`, com `criar` de `dom.js`. Não carrega frase: toda função que escolhe texto
 * recebe o catálogo do idioma da página (`textos`) como primeiro parâmetro (ADR-3 da spec 008).
 * Todo texto de terceiros (o registro TXT, o `detalhe` de um achado, o seletor digitado) sai
 * daqui como texto puro e cortado: nada é marcação.
 */

// @ts-check

import { urlHttps } from "./dom.js";
import { calcularSelo } from "./selo.js";
import { ajustarChaveFixa, ehChaveFixaCurta, seletorComChaveFixa } from "./chave-fixa.js";
import { normalizarSeletor } from "./seletor-dkim.js";
import { ORIENTACOES, SELETORES_COMUNS } from "./seletores-dkim.js";
import { preencher } from "./preencher.js";
import { textoDoAchado, textoDoMotivo } from "./textos/resolver.js";

/** @typedef {import("./selo.js").Selo} Selo */
/** @typedef {import("./textos/tipos.js").Textos} Textos */
/** @typedef {import("./textos/resolver.js").AchadoVisivel} AchadoVisivel */
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
const PADRAO_CONTROLE = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;
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

// `preencher` mora em `preencher.js` (a frase dos motivos também o usa); segue exportado
// daqui para quem já o importa de `apresentacao.js`.
export { preencher };

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
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {string} texto - O que o visitante digitou.
 * @returns {{ validos: string[], recusados: SeletorRecusado[] }} Os seletores aceitos (sem
 *   repetição) e os recusados com o motivo na língua da página. O texto recusado vai cortado.
 */
export const lerSeletoresDigitados = (textos, texto) => {
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
        motivo: textoDoMotivo(textos, { motivo: lido.motivo }),
      });
    }
  }
  return { validos, recusados };
};

// ---------------------------------------------------------------------------
// FALHA E CONTAGEM
// ---------------------------------------------------------------------------

/**
 * A mensagem de uma parte que não conseguiu consultar: a frase do motivo que a consulta
 * devolveu (por código) e a frase que diz que isso não é um defeito do registro.
 *
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {EstadoParte} estadoParte - O estado da parte.
 * @returns {string} A mensagem, ou ``""`` se a parte não falhou.
 */
export const mensagemDeFalha = (textos, estadoParte) => {
  if (estadoParte.fase !== "falha") {
    return "";
  }
  const { falha, titulosCartao } = textos.interface;
  const causa = textoDoMotivo(textos, estadoParte);
  const naoDiz = preencher(falha.naoDiz.texto, { parte: titulosCartao[estadoParte.parte].texto });
  return `${causa} ${naoDiz}`;
};

/**
 * A frase da contagem de consultas DNS do SPF.
 *
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {{ total: number, limite: number, incompleta: boolean }} consultas - A contagem.
 * @returns {string} "N de 10 consultas DNS", ou "Pelo menos N de 10" se a contagem ficou
 *   incompleta. Acima de 10 mostra o número real (ex.: "13 de 10").
 */
export const resumoConsultas = (textos, consultas) => {
  const { spf } = textos.interface;
  const modelo = consultas.incompleta ? spf.consultasPeloMenos : spf.consultas;
  return preencher(modelo.texto, { total: consultas.total, limite: consultas.limite });
};

// ---------------------------------------------------------------------------
// CARTÕES
// ---------------------------------------------------------------------------

/**
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {"dmarc" | "spf" | "dkim"} id - Qual cartão.
 * @param {EstadoParte} estado - O estado da parte.
 * @param {Partial<Cartao>} resto - O que muda de cartão para cartão.
 * @returns {Cartao} O cartão com o que todos têm em comum.
 */
const cartao = (textos, id, estado, resto) => ({
  id,
  titulo: textos.interface.titulosCartao[id].texto,
  fase: estado.fase,
  selo: calcularSelo(textos, id, estado),
  resumo: "",
  achados: [],
  ...resto,
});

/**
 * Junta os achados iguais de seletores diferentes num só (`seletores` lista todos). Um domínio
 * com um coringa `*._domainkey` revogado teria o mesmo achado repetido em cada seletor tentado.
 * A ordem é a da primeira aparição, a mesma que o módulo devolveu. A ação e o link entram na
 * comparação: o mesmo código com um conselho próprio do provedor (`chaveFixa`) não se junta ao
 * genérico, senão um dos dois seletores ficaria com o conselho errado.
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
    const chave = [
      achado.codigo,
      achado.tag,
      achado.detalhe,
      achado.dominio,
      achado.acao,
      achado.documentacao,
    ].join("|");
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
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {Array<import("./textos/resolver.js").AchadoLido>} achados - Achados do módulo.
 * @param {(achado: AchadoVisivel) => AchadoVisivel} [ajustar=identidade] - Troca o texto de um
 *   achado antes do agrupamento (o DKIM a usa para o conselho de `chaveFixa`); por padrão, a
 *   identidade, que devolve o achado como veio.
 * @returns {AchadoVisivel[]} Os achados com texto, o `detalhe` cortado e os de seletores
 *   diferentes agrupados, na ordem do módulo.
 */
const achadosVisiveis = (textos, achados, ajustar = (achado) => achado) =>
  agruparPorSeletor(
    achados.map((achado) => {
      const visivel = ajustar(textoDoAchado(textos, achado));
      return visivel.detalhe === undefined
        ? visivel
        : { ...visivel, detalhe: cortarTexto(visivel.detalhe, MAXIMO_DETALHE).texto };
    }),
  );

/**
 * O estado que não é "pronto": o cartão mostra a espera ou a falha.
 *
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {"dmarc" | "spf" | "dkim"} id - Qual cartão.
 * @param {EstadoParte} estado - O estado da parte.
 * @param {number} [total] - Quantos seletores a espera do DKIM cita.
 * @returns {Cartao | null} O cartão de espera ou de falha, ou ``null`` se a parte está pronta.
 */
const cartaoSemResultado = (textos, id, estado, total = SELETORES_COMUNS.length) => {
  if (estado.fase === "verificando") {
    return cartao(textos, id, estado, {
      resumo: preencher(textos.interface.verificando[id].texto, { total }),
    });
  }
  if (estado.fase === "falha") {
    return cartao(textos, id, estado, { resumo: mensagemDeFalha(textos, estado) });
  }
  return null;
};

/**
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {EstadoDmarc} estado - O estado do DMARC.
 * @returns {Cartao} O cartão do DMARC: selo, registro cru cortado e achados.
 */
export const apresentarDmarc = (textos, estado) => {
  const frases = textos.interface.dmarc;
  const espera = cartaoSemResultado(textos, "dmarc", estado);
  if (espera !== null || estado.fase !== "pronto") {
    return /** @type {Cartao} */ (espera);
  }

  const dmarc = estado.resultado;
  if (dmarc.situacao === "ausente") {
    return cartao(textos, "dmarc", estado, { resumo: frases.ausente.texto });
  }
  if (dmarc.situacao === "multiplos") {
    return cartao(textos, "dmarc", estado, {
      resumo: preencher(frases.multiplos.texto, { quantidade: dmarc.quantidade }),
    });
  }
  return cartao(textos, "dmarc", estado, {
    resumo: dmarc.situacao === "invalido" ? frases.invalido.texto : "",
    registro: cortarTexto(dmarc.registro, MAXIMO_REGISTRO),
    achados: achadosVisiveis(textos, dmarc.achados),
  });
};

/**
 * Como o registro SPF termina: o `all` que vale, ou o `redirect`.
 *
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {import("./spf.js").SpfValido} spf - O registro SPF lido.
 * @returns {string} A frase de terminação.
 */
const terminacaoDoSpf = (textos, spf) => {
  const frases = textos.interface.spf;
  const todos = spf.termos.find((termo) => termo.tipo === "all" && termo.ignorado === undefined);
  if (todos !== undefined) {
    return preencher(frases.terminaEm.texto, { all: `${todos.qualificador ?? "+"}all` });
  }
  return (spf.estagio === "redirecionado" ? frases.redirecionado : frases.semAll).texto;
};

/**
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {EstadoSpf} estado - O estado do SPF.
 * @returns {Cartao} O cartão do SPF: selo, contagem de consultas, terminação, registro e achados.
 */
export const apresentarSpf = (textos, estado) => {
  const frases = textos.interface.spf;
  const espera = cartaoSemResultado(textos, "spf", estado);
  if (espera !== null || estado.fase !== "pronto") {
    return /** @type {Cartao} */ (espera);
  }

  const { spf, consultas, achados } = estado.resultado;
  if (spf.situacao === "ausente") {
    return cartao(textos, "spf", estado, { resumo: frases.ausente.texto });
  }
  if (spf.situacao === "multiplos") {
    return cartao(textos, "spf", estado, {
      resumo: preencher(frases.multiplos.texto, { quantidade: spf.quantidade }),
    });
  }
  if (spf.situacao === "invalido") {
    return cartao(textos, "spf", estado, {
      resumo: frases.invalido.texto,
      registro: cortarTexto(spf.registro, MAXIMO_REGISTRO),
      achados: achadosVisiveis(textos, achados),
    });
  }

  const partes = [resumoConsultas(textos, consultas), terminacaoDoSpf(textos, spf)];
  if (consultas.passouDoLimite) {
    partes.push(frases.passouDoLimite.texto);
  }
  return cartao(textos, "spf", estado, {
    resumo: partes.join(" "),
    registro: cortarTexto(spf.registro, MAXIMO_REGISTRO),
    achados: achadosVisiveis(textos, achados),
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
 * Troca a ação do achado de chave abaixo de 2048 bits quando o seletor é de um provedor que
 * define a chave e não deixa o cliente trocar o tamanho (`chaveFixa` em seletores-dkim.js): ali o
 * conselho genérico, gerar uma chave de 2048 bits no painel, não tem como ser seguido. A
 * gravidade (`info`) já vem de `ajustarChaveFixa`; aqui muda a ação, com o link da página
 * oficial do provedor.
 *
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {AchadoVisivel} achado - Um achado do DKIM, já com texto.
 * @returns {AchadoVisivel} O mesmo achado, ou com a ação e o link do provedor.
 */
const conselhoDaChaveFixa = (textos, achado) => {
  const comum = ehChaveFixaCurta(achado) ? seletorComChaveFixa(achado.seletor) : undefined;
  if (comum?.chaveFixa === undefined) {
    return achado;
  }
  const documentacao = urlHttps(comum.chaveFixa.documentacao);
  return {
    ...achado,
    acao: preencher(textos.interface.dkim.acaoChaveFixa.texto, { provedor: comum.provedor }),
    provedor: comum.provedor,
    ...(documentacao === null ? {} : { documentacao }),
  };
};

/**
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {import("./dkim.js").DkimValido} dkim - A leitura de um seletor com registro válido.
 * @returns {string} O tipo e o tamanho da chave, na língua da página.
 */
const descreverChave = (textos, dkim) => {
  const frases = textos.interface.dkim;
  if (dkim.tipo === "ed25519") {
    return frases.chaveEd25519.texto;
  }
  if (dkim.tipo === "rsa") {
    return dkim.tamanhoBits === undefined
      ? frases.chaveRsaSemTamanho.texto
      : preencher(frases.chaveRsa.texto, { bits: dkim.tamanhoBits });
  }
  return frases.chaveOutra.texto;
};

/**
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {import("./dkim-busca.js").BuscaDkim} busca - O resultado da busca.
 * @param {ExtraDkim["encontrados"]} encontrados - Os seletores com chave.
 * @returns {string} O resumo do cartão para o que a busca achou.
 */
const resumoDoDkim = (textos, busca, encontrados) => {
  const frases = textos.interface.dkim;
  const total = busca.seletores.length;
  const [primeiro] = encontrados;
  if (busca.situacao === "encontrado" && primeiro !== undefined) {
    // Com mais de um seletor, o resumo só conta: a página lista cada seletor com a chave dele
    // (`extra.encontrados`), para ficar claro qual chave gerou um aviso e que a outra foi lida.
    const cabecalho =
      encontrados.length === 1
        ? preencher(frases.encontrado.texto, {
            seletor: primeiro.seletor,
            chave: primeiro.chave,
            total,
          })
        : preencher(frases.encontradoVarios.texto, { quantidade: encontrados.length, total });
    return busca.incompleta ? `${cabecalho} ${parcial(textos, busca)}` : cabecalho;
  }
  return busca.situacao === "nao-encontrado"
    ? preencher(frases.naoEncontrado.texto, { total })
    : parcial(textos, busca);
};

/**
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {import("./dkim-busca.js").BuscaDkim} busca - O resultado da busca.
 * @returns {string} A frase de que parte dos seletores não foi verificada.
 */
const parcial = (textos, busca) =>
  preencher(textos.interface.dkim.parcial.texto, {
    verificados: busca.seletores.filter((item) => item.estado !== "nao-verificado").length,
    total: busca.seletores.length,
  });

/**
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {EstadoDkim} estado - O estado do DKIM.
 * @param {{ recusados?: SeletorRecusado[], totalSeletores?: number }} [extras] - As recusas do
 *   campo livre (de `lerSeletoresDigitados`) e quantos seletores a espera cita.
 * @returns {Cartao} O cartão do DKIM: selo, resumo, lista dos tentados com o provedor e o link,
 *   e os achados de cada seletor.
 */
export const apresentarDkim = (textos, estado, { recusados = [], totalSeletores } = {}) => {
  const frases = textos.interface.dkim;
  const espera = cartaoSemResultado(textos, "dkim", estado, totalSeletores);
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
        chave: descreverChave(textos, dkim),
        ...(comum === undefined ? {} : { provedor: comum.provedor }),
      },
    ];
  });

  return cartao(textos, "dkim", estado, {
    resumo: resumoDoDkim(textos, busca, encontrados),
    achados: achadosVisiveis(textos, ajustarChaveFixa(busca.achados), (achado) =>
      conselhoDaChaveFixa(textos, achado),
    ),
    extra: {
      total: busca.seletores.length,
      tentados: seletoresMostrados(busca.seletores),
      encontrados,
      orientacoes: ORIENTACOES.map(({ provedor, documentacao }) => {
        const url = urlHttps(documentacao);
        return {
          provedor,
          texto: preencher(frases.orientacao.texto, { provedor }),
          ...(url === null ? {} : { documentacao: url }),
        };
      }),
      recusados: recusados.map(({ texto, motivo }) => ({
        texto: preencher(frases.recusado.texto, { texto, motivo }),
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
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {EstadoVerificacao} estado - O estado das três partes.
 * @returns {string | null} A frase, ou ``null`` se nenhum resolvedor respondeu.
 */
export const rodapeDosResolvedores = (textos, estado) => {
  const frases = textos.interface.resultado;
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
      ? frases.resolvedorAmbos
      : cloudflare
        ? frases.resolvedorCloudflare
        : frases.resolvedorGoogle;
  return preencher(frases.resolvedores.texto, { quem: quem.texto });
};

// ---------------------------------------------------------------------------
// ANÚNCIOS PARA LEITOR DE TELA
// ---------------------------------------------------------------------------

/**
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {string} dominio - O domínio em verificação.
 * @returns {string} A frase do início da verificação.
 */
export const anunciarInicio = (textos, dominio) =>
  preencher(textos.interface.anuncio.inicio.texto, { dominio });

/**
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {string} dominio - O domínio verificado.
 * @returns {string} A frase de que o domínio não existe.
 */
export const anunciarInexistente = (textos, dominio) =>
  preencher(textos.interface.anuncio.inexistente.texto, { dominio });

/**
 * A frase do fim da verificação. Usa só a palavra do selo de cada cartão, em minúsculas, para
 * não afirmar mais do que ele.
 *
 * @param {Textos} textos - O catálogo do idioma da página.
 * @param {string} dominio - O domínio verificado.
 * @param {{ dmarc: Cartao, spf: Cartao, dkim: Cartao }} cartoes - Os três cartões.
 * @returns {string} A frase de resultado pronto.
 */
export const anunciarFim = (textos, dominio, cartoes) =>
  preencher(textos.interface.anuncio.fim.texto, {
    dominio,
    dmarc: cartoes.dmarc.selo.texto.toLowerCase(),
    spf: cartoes.spf.selo.texto.toLowerCase(),
    dkim: cartoes.dkim.selo.texto.toLowerCase(),
  });
