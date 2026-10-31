/**
 * @file Página: liga o formulário ao verificador e desenha o resultado.
 *
 * É o único módulo que usa `document`, `location` e `history` (ADR-2 da spec 006), e por isso é
 * fino: a decisão do que mostrar vem pronta de `apresentacao.js`, `escada.js` e `selo.js`, e
 * todo nó nasce de `criar` (dom.js), que só usa `textContent`. Registro TXT é dado de terceiros
 * e pode conter `<script>`: nenhuma linha daqui transforma texto em HTML (o lint proíbe).
 *
 * Fluxo: o envio normaliza o domínio, atualiza o endereço com `history.replaceState` e chama o
 * verificador; a cada mudança de estado só o cartão que mudou é redesenhado, para o campo de
 * seletores extras não perder o texto no meio da digitação. Ao terminar, a região `aria-live`
 * anuncia o resumo e o título do resultado recebe o foco (ADR-12).
 */

// @ts-check

import {
  anunciarFim,
  anunciarInexistente,
  anunciarInicio,
  apresentarDkim,
  apresentarDmarc,
  apresentarSpf,
  lerSeletoresDigitados,
  partirCodigo,
  preencher,
  rodapeDosResolvedores,
} from "./apresentacao.js";
import { consultarTxt } from "./doh.js";
import { criar, urlHttps } from "./dom.js";
import { normalizarDominio } from "./dominio.js";
import { lerDominioDoEndereco, montarEndereco } from "./endereco.js";
import { montarEscada, textoDoFim } from "./escada.js";
import { SELETORES_COMUNS } from "./seletores-dkim.js";
import {
  ROTULOS_DADO_DO_ACHADO,
  ROTULOS_GRAVIDADE,
  TEXTOS_DKIM,
  TEXTOS_ESCADA,
  TEXTOS_FORMULARIO,
  TEXTOS_RESULTADO,
  RESSALVAS_ESCADA,
} from "./textos-interface.js";
import { criarVerificador } from "./verificador.js";

/** @typedef {import("./apresentacao.js").Cartao} Cartao */
/** @typedef {import("./tipos.js").EstadoVerificacao} EstadoVerificacao */
/** @typedef {import("./tipos.js").NomeParte} NomeParte */
/** @typedef {import("./escada.js").Escada} Escada */

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------

// Link do bloco do MailVigil (RF-12): o repositório, sem parâmetro de origem. O MailVigil não
// tem site próprio.
const ENDERECO_MAILVIGIL = "https://github.com/ryanvmorais/mailvigil";

// Traços de cada ícone do selo (viewBox 14x14, traço de 2): a forma distingue os quatro
// estados também para quem não vê a cor (RF-07).
const ICONES_SELO = {
  ok: "M2.5 7.5l3 3 6-7",
  atencao: "M7 1.5L13 12H1Z",
  problema: "M3.5 3.5l7 7M10.5 3.5l-7 7",
  "nao-verificado": "M3 7h8",
};

const PARTES = /** @type {const} */ (["dmarc", "spf", "dkim"]);

// ---------------------------------------------------------------------------
// ELEMENTOS DA PÁGINA
// ---------------------------------------------------------------------------

/**
 * @template {HTMLElement} T
 * @param {string} id - O `id` de um elemento do index.html.
 * @returns {T} O elemento.
 * @throws {Error} Se o index.html não o tem (erro de programação).
 */
const pegar = (id) => {
  const elemento = document.getElementById(id);
  if (elemento === null) {
    throw new Error(`Faltou #${id} no index.html.`);
  }
  return /** @type {T} */ (elemento);
};

/** @type {HTMLFormElement} */
const formulario = pegar("formulario");
/** @type {HTMLInputElement} */
const campo = pegar("dominio");
/** @type {HTMLButtonElement} */
const botao = pegar("botao-verificar");
const erroDominio = pegar("erro-dominio");
const erroDominioTexto = pegar("erro-dominio-texto");
const anuncio = pegar("anuncio");
const resultado = pegar("resultado");

// ---------------------------------------------------------------------------
// DESENHO
// ---------------------------------------------------------------------------

/**
 * @param {string} tag - Tag da lista de `criar`.
 * @param {Record<string, string | number | boolean | null | undefined>} [atributos] - Atributos.
 * @param {Parameters<typeof criar>[3]} [filhos] - Filhos.
 * @returns {Element} O elemento.
 */
const c = (tag, atributos, filhos) => criar(document, tag, atributos, filhos);

/**
 * Texto do catálogo com os trechos entre crases em fonte monoespaçada.
 *
 * @param {string} texto - O texto.
 * @returns {Array<Node | string>} Texto e elementos `code`.
 */
const trechos = (texto) =>
  partirCodigo(texto).map((trecho) =>
    trecho.codigo ? c("code", { class: "codigo" }, trecho.texto) : trecho.texto,
  );

/**
 * @param {string} tracado - O traço do ícone (atributo `d`).
 * @param {boolean} [comoEnfeite=true] - Se o ícone é decorativo.
 * @returns {Element} O `<svg>`.
 */
const icone = (tracado, comoEnfeite = true) =>
  c(
    "svg",
    {
      viewBox: "0 0 14 14",
      width: 14,
      height: 14,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": comoEnfeite ? "true" : null,
      focusable: "false",
    },
    [c("path", { d: tracado })],
  );

/**
 * @param {Cartao["selo"]} selo - O selo do cartão.
 * @returns {Element} O selo: ícone e palavra.
 */
const desenharSelo = (selo) =>
  c("span", { class: `selo selo-${selo.estado}` }, [icone(ICONES_SELO[selo.estado]), selo.texto]);

/**
 * @param {import("./textos-achados.js").AchadoVisivel} achado - O achado com texto.
 * @returns {Element} O item da lista de achados.
 */
const desenharAchado = (achado) => {
  /** @type {Array<[keyof typeof ROTULOS_DADO_DO_ACHADO, string | undefined]>} */
  const dados = [
    achado.seletores === undefined
      ? ["seletor", achado.seletor]
      : ["seletores", achado.seletores.join(", ")],
    ["dominio", achado.dominio],
    ["tag", achado.tag],
    ["detalhe", achado.detalhe],
  ];
  const linhas = dados.flatMap(([chave, valor]) =>
    valor === undefined
      ? []
      : [[`${ROTULOS_DADO_DO_ACHADO[chave].texto}: `, c("code", { class: "codigo" }, valor)]],
  );

  return c("li", { class: "achado" }, [
    c("div", { class: "achado-linha" }, [
      c(
        "span",
        { class: `gravidade gravidade-${achado.gravidade}` },
        ROTULOS_GRAVIDADE[achado.gravidade].texto,
      ),
      c("p", { class: "achado-titulo" }, trechos(achado.titulo)),
    ]),
    c("p", { class: "achado-explicacao" }, trechos(achado.explicacao)),
    c("p", { class: "achado-acao" }, trechos(achado.acao)),
    linhas.length === 0
      ? null
      : c(
          "p",
          { class: "achado-detalhe" },
          linhas.flatMap((linha, indice) => (indice === 0 ? linha : ["  ·  ", ...linha])),
        ),
  ]);
};

/**
 * O link da documentação de um provedor. O nome acessível diz de qual provedor é, porque o
 * leitor de tela lista os links fora da linha onde estão e 18 "documentação" iguais não
 * servem de nada. O rótulo visível continua no começo do nome (WCAG 2.5.3).
 *
 * @param {string} endereco - Endereço do link; só `https` vira `href`.
 * @param {string} provedor - O provedor da documentação.
 * @returns {Array<Node | string>} O link, ou nada se o endereço não é `https`.
 */
const linkDoc = (endereco, provedor) => {
  const url = urlHttps(endereco);
  return url === null
    ? []
    : [
        c(
          "a",
          {
            class: "link-doc",
            href: url,
            "aria-label": preencher(TEXTOS_DKIM.documentacaoDe.texto, { provedor }),
          },
          TEXTOS_DKIM.documentacao.texto,
        ),
      ];
};

/**
 * A lista dos seletores tentados e, em outra lista, as orientações dos provedores sem seletor
 * fixo.
 *
 * @param {NonNullable<Cartao["extra"]>} extra - O que só o DKIM tem.
 * @returns {Element} O `details` com as listas.
 */
const desenharTentados = (extra) =>
  c("details", { class: "tentados" }, [
    c("summary", {}, preencher(TEXTOS_DKIM.verTentados.texto, { total: extra.total })),
    c(
      "ul",
      { class: "lista-seletores" },
      extra.tentados.map((item) =>
        c("li", {}, [
          c("code", { class: "codigo" }, item.seletor),
          item.provedor === undefined
            ? ` · ${TEXTOS_DKIM.seletorDigitado.texto}`
            : ` · ${item.provedor} · `,
          ...(item.documentacao === undefined || item.provedor === undefined
            ? []
            : linkDoc(item.documentacao, item.provedor)),
        ]),
      ),
    ),
    c("p", { class: "titulo-orientacoes" }, TEXTOS_DKIM.orientacaoTitulo.texto),
    c(
      "ul",
      { class: "lista-seletores" },
      extra.orientacoes.map((item) =>
        c("li", {}, [
          item.texto,
          " ",
          ...(item.documentacao === undefined ? [] : linkDoc(item.documentacao, item.provedor)),
        ]),
      ),
    ),
  ]);

/**
 * @param {NonNullable<Cartao["extra"]>} extra - O que só o DKIM tem.
 * @param {string} textoDigitado - O que o visitante digitou da última vez.
 * @param {(texto: string) => void} aoEnviar - Chamado com o texto do campo ao enviar.
 * @returns {Element} O formulário do campo livre de seletores.
 */
const desenharCampoSeletores = (extra, textoDigitado, aoEnviar) => {
  const entrada = /** @type {HTMLInputElement} */ (
    c("input", {
      class: "campo",
      id: "seletores-extras",
      name: "seletores",
      type: "text",
      value: textoDigitado,
      autocomplete: "off",
      placeholder: TEXTOS_FORMULARIO.seletoresExemplo.texto,
      "aria-describedby": "ajuda-seletores",
    })
  );
  const formularioSeletores = c("form", { class: "seletores-extras" }, [
    c(
      "label",
      { class: "rotulo", for: "seletores-extras" },
      TEXTOS_FORMULARIO.seletoresRotulo.texto,
    ),
    entrada,
    extra.recusados.length === 0
      ? null
      : c(
          "ul",
          { class: "recusados", role: "alert" },
          extra.recusados.map((item) => c("li", {}, trechos(item.texto))),
        ),
    c("p", { class: "nota", id: "ajuda-seletores" }, TEXTOS_FORMULARIO.seletoresAjuda.texto),
    c(
      "button",
      { class: "botao-secundario", type: "submit" },
      TEXTOS_FORMULARIO.seletoresBotao.texto,
    ),
  ]);
  formularioSeletores.addEventListener("submit", (evento) => {
    evento.preventDefault();
    aoEnviar(entrada.value);
  });
  return formularioSeletores;
};

/**
 * @typedef {{
 *   aoTentarDeNovo: (parte: NomeParte) => void,
 *   aoEnviarSeletores: (texto: string) => void, textoDigitado: string
 * }} Acoes
 */

/**
 * Desenha um cartão: nome e selo, resumo, registro, achados e o que é só do DKIM.
 *
 * @param {Cartao} cartao - O cartão pronto, de `apresentacao.js`.
 * @param {Acoes} acoes - O que os botões do cartão fazem.
 * @returns {Element} O cartão.
 */
const desenharCartao = (cartao, acoes) => {
  const filhos = [
    c("div", { class: "cartao-cabecalho" }, [
      c("h3", {}, cartao.titulo),
      desenharSelo(cartao.selo),
    ]),
  ];

  if (cartao.resumo !== "") {
    filhos.push(c("p", { class: "resumo" }, trechos(cartao.resumo)));
  }
  if (cartao.fase === "verificando") {
    filhos.push(c("div", { class: "esqueleto esqueleto-80" }));
  }
  if (cartao.registro !== undefined) {
    filhos.push(c("p", { class: "registro" }, cartao.registro.texto));
  }
  // Parte que falhou, ou que terminou sem conseguir verificar nada (DKIM `indeterminado`).
  if (
    cartao.fase === "falha" ||
    (cartao.fase === "pronto" && cartao.selo.estado === "nao-verificado")
  ) {
    const botaoDeNovo = c(
      "button",
      { class: "botao-secundario", type: "button" },
      TEXTOS_FORMULARIO.tentarDeNovo.texto,
    );
    botaoDeNovo.addEventListener("click", () => acoes.aoTentarDeNovo(cartao.id));
    filhos.push(botaoDeNovo);
  }
  if (cartao.achados.length > 0) {
    filhos.push(c("ul", { class: "achados" }, cartao.achados.map(desenharAchado)));
  }
  if (cartao.extra !== undefined) {
    filhos.push(desenharTentados(cartao.extra));
    if (cartao.extra.mostrarCampo) {
      filhos.push(
        desenharCampoSeletores(cartao.extra, acoes.textoDigitado, acoes.aoEnviarSeletores),
      );
    }
  }
  return c("div", { class: `cartao cartao-${cartao.id}` }, filhos);
};

/**
 * @param {Escada} escada - A escada montada a partir do DMARC.
 * @returns {Element} O cartão da escada.
 */
const desenharEscada = (escada) => {
  const fim = textoDoFim(escada);
  const degraus = escada.degraus.map((degrau, indice) =>
    c("li", { class: `degrau${degrau.papel === "outro" ? "" : ` degrau-${degrau.papel}`}` }, [
      c("span", { class: "degrau-numero", "aria-hidden": "true" }, indice + 1),
      c("div", { class: "degrau-corpo" }, [
        c("div", { class: "degrau-linha" }, [
          c(
            "p",
            { class: "degrau-titulo" },
            degrau.papel === "atual" ? `${degrau.titulo} · ${degrau.etiqueta}` : degrau.titulo,
          ),
          degrau.papel === "proximo" ? c("span", { class: "etiqueta" }, degrau.etiqueta) : null,
        ]),
        c("p", { class: "degrau-resumo" }, degrau.resumo),
        degrau.acao === undefined ? null : c("p", { class: "degrau-acao" }, trechos(degrau.acao)),
      ]),
    ]),
  );

  return c("div", { class: "cartao cartao-escada" }, [
    c("h3", {}, TEXTOS_RESULTADO.escada.texto),
    c("ol", { class: "escada" }, degraus),
    escada.semAtual ? c("p", { class: "resumo" }, TEXTOS_ESCADA.semAtual.texto) : null,
    fim === null ? null : c("p", { class: "resumo" }, fim),
    escada.ressalvas.length === 0
      ? null
      : c(
          "ul",
          { class: "ressalvas" },
          escada.ressalvas.map((ressalva) =>
            c("li", {}, trechos(RESSALVAS_ESCADA[ressalva].texto)),
          ),
        ),
  ]);
};

/**
 * @param {string} dominio - O domínio que o DNS não conhece.
 * @returns {Element} O cartão de "não encontrei esse domínio".
 */
const desenharInexistente = (dominio) =>
  c("div", { class: "cartao" }, [
    c("h3", {}, TEXTOS_RESULTADO.inexistenteTitulo.texto),
    c(
      "p",
      { class: "resumo" },
      trechos(preencher(TEXTOS_RESULTADO.inexistenteTexto.texto, { dominio })),
    ),
  ]);

/** @returns {Element} O bloco do MailVigil, abaixo dos cartões (RF-12). */
const desenharMailvigil = () =>
  c("div", { class: "cartao cartao-mailvigil" }, [
    c("div", {}, [
      c("h3", {}, TEXTOS_RESULTADO.mailvigilTitulo.texto),
      c("p", { class: "resumo resumo-suave" }, TEXTOS_RESULTADO.mailvigilTexto.texto),
    ]),
    c("a", { class: "botao", href: ENDERECO_MAILVIGIL }, TEXTOS_RESULTADO.mailvigilBotao.texto),
  ]);

// ---------------------------------------------------------------------------
// ESTADO DA TELA
// ---------------------------------------------------------------------------

/** @type {Record<string, HTMLElement>} */
let lugares = {};
/** @type {Partial<Record<NomeParte, unknown>>} */
let desenhados = {};
let geracaoDesenhada = 0;
let geracaoAnunciada = 0;
let mostrandoInexistente = false;
let dominioAtual = "";
let textoDigitado = "";
/** @type {string[]} */
let seletoresExtras = [];
/** @type {Array<{ texto: string, motivo: string }>} */
let recusadosExtras = [];
/** @type {EstadoVerificacao | null} */
let ultimoEstado = null;

/**
 * Põe um nó num lugar do resultado; lugar vazio some, para não deixar vão na coluna.
 *
 * @param {HTMLElement} lugar - O lugar.
 * @param {Element | null} no - O que desenhar ali, ou ``null`` para esvaziar.
 */
const colocar = (lugar, no) => {
  lugar.replaceChildren(...(no === null ? [] : [no]));
  lugar.hidden = no === null;
};

/**
 * Monta o esqueleto do resultado: título e um lugar para cada parte.
 *
 * @param {string} dominio - O domínio verificado.
 */
const montarEstrutura = (dominio) => {
  const titulo = c(
    "h2",
    { class: "titulo resultado-titulo", id: "titulo-resultado", tabindex: -1 },
    preencher(TEXTOS_RESULTADO.titulo.texto, { dominio }),
  );
  lugares = Object.fromEntries(
    ["escada", ...PARTES, "rodape", "mailvigil"].map((nome) => {
      const lugar = /** @type {HTMLElement} */ (c("div"));
      lugar.hidden = true;
      return [nome, lugar];
    }),
  );
  resultado.replaceChildren(titulo, ...Object.values(lugares));
  resultado.hidden = false;
  desenhados = {};
  mostrandoInexistente = false;
};

/**
 * @param {EstadoVerificacao} estado - O estado.
 * @returns {boolean} Se alguma parte ainda está sendo verificada.
 */
const emAndamento = (estado) => PARTES.some((parte) => estado.partes[parte].fase === "verificando");

/**
 * @param {NomeParte} parte - Qual cartão.
 * @param {EstadoVerificacao} estado - O estado.
 * @returns {Cartao} O cartão pronto para desenhar.
 */
const cartaoDe = (parte, estado) => {
  if (parte === "dmarc") {
    return apresentarDmarc(estado.partes.dmarc);
  }
  if (parte === "spf") {
    return apresentarSpf(estado.partes.spf);
  }
  return apresentarDkim(estado.partes.dkim, {
    recusados: recusadosExtras,
    totalSeletores: SELETORES_COMUNS.length + seletoresExtras.length,
  });
};

/**
 * Redesenha só o que mudou desde a última vez.
 *
 * @param {EstadoVerificacao} estado - O estado.
 * @param {boolean} [forcarDkim=false] - Redesenha o DKIM mesmo sem mudança de estado (as
 *   recusas do campo livre mudaram).
 */
const atualizarPartes = (estado, forcarDkim = false) => {
  const acoes = { aoTentarDeNovo, aoEnviarSeletores, textoDigitado };

  for (const parte of PARTES) {
    const lugar = lugares[parte];
    if (
      lugar === undefined ||
      (desenhados[parte] === estado.partes[parte] && !(forcarDkim && parte === "dkim"))
    ) {
      continue;
    }
    desenhados[parte] = estado.partes[parte];
    colocar(lugar, desenharCartao(cartaoDe(parte, estado), acoes));
    if (parte === "dmarc") {
      const dmarc = estado.partes.dmarc;
      colocar(
        /** @type {HTMLElement} */ (lugares["escada"]),
        dmarc.fase === "pronto" ? desenharEscada(montarEscada(dmarc.resultado)) : null,
      );
    }
  }

  // O rodapé e o convite só aparecem com o resultado inteiro (RF-12).
  const terminou = !emAndamento(estado);
  const rodape = terminou ? rodapeDosResolvedores(estado) : null;
  colocar(
    /** @type {HTMLElement} */ (lugares["rodape"]),
    rodape === null ? null : c("p", { class: "nota" }, rodape),
  );
  colocar(/** @type {HTMLElement} */ (lugares["mailvigil"]), terminou ? desenharMailvigil() : null);
};

/**
 * Anuncia o fim da verificação e leva o foco ao título do resultado, uma vez por verificação.
 *
 * @param {EstadoVerificacao} estado - O estado.
 */
const concluir = (estado) => {
  const pronto = estado.dominioInexistente || !emAndamento(estado);
  if (!pronto || geracaoAnunciada === estado.geracao) {
    return;
  }
  geracaoAnunciada = estado.geracao;
  anuncio.textContent = estado.dominioInexistente
    ? anunciarInexistente(estado.dominio)
    : anunciarFim(estado.dominio, {
        dmarc: apresentarDmarc(estado.partes.dmarc),
        spf: apresentarSpf(estado.partes.spf),
        dkim: apresentarDkim(estado.partes.dkim),
      });
  document.getElementById("titulo-resultado")?.focus();
};

/**
 * A cada mudança de estado do verificador.
 *
 * @param {EstadoVerificacao} estado - O estado novo.
 */
const aoMudar = (estado) => {
  ultimoEstado = estado;
  if (estado.geracao !== geracaoDesenhada) {
    geracaoDesenhada = estado.geracao;
    montarEstrutura(estado.dominio);
    anuncio.textContent = anunciarInicio(estado.dominio);
  }

  if (estado.dominioInexistente) {
    if (!mostrandoInexistente) {
      montarEstrutura(estado.dominio);
      mostrandoInexistente = true;
      colocar(/** @type {HTMLElement} */ (lugares["escada"]), desenharInexistente(estado.dominio));
    }
  } else {
    if (mostrandoInexistente) {
      montarEstrutura(estado.dominio);
    }
    atualizarPartes(estado);
  }

  // Enquanto verifica o botão avisa e não dispara outra consulta idêntica (RF-02).
  const ocupado = !estado.dominioInexistente && emAndamento(estado);
  botao.disabled = ocupado;
  botao.textContent = ocupado
    ? TEXTOS_FORMULARIO.botaoOcupado.texto
    : TEXTOS_FORMULARIO.botao.texto;
  concluir(estado);
};

// ---------------------------------------------------------------------------
// AÇÕES
// ---------------------------------------------------------------------------

const verificador = criarVerificador({
  consulta: consultarTxt,
  seletoresComuns: SELETORES_COMUNS.map((item) => item.seletor),
  aoMudar,
});

// As duas ações abaixo são `function` (içadas) porque `atualizarPartes`, mais acima, as entrega
// aos cartões e é chamada por `aoMudar`, que o verificador precisa já na criação.
/** @param {NomeParte} parte - O cartão cujo botão "Tentar de novo" foi acionado. */
function aoTentarDeNovo(parte) {
  void verificador.refazer(parte);
}

/**
 * O campo livre de seletores do DKIM foi enviado: refaz só o DKIM, sem consultar DMARC nem SPF.
 *
 * @param {string} texto - O que o visitante digitou.
 */
function aoEnviarSeletores(texto) {
  const lido = lerSeletoresDigitados(texto);
  textoDigitado = texto;
  seletoresExtras = lido.validos;
  recusadosExtras = lido.recusados;

  if (lido.validos.length === 0 && ultimoEstado !== null) {
    // Nada novo para procurar: só mostra as recusas.
    atualizarPartes(ultimoEstado, true);
    document.getElementById("seletores-extras")?.focus();
    return;
  }
  void verificador.refazerDkim(lido.validos).then(() => {
    document.getElementById("seletores-extras")?.focus();
  });
}

/** @param {string} motivo - Por que o domínio foi recusado, em português. */
const mostrarErroDoCampo = (motivo) => {
  erroDominioTexto.textContent = motivo;
  erroDominio.hidden = false;
  campo.setAttribute("aria-invalid", "true");
  // O erro é anunciado por `role="alert"`; refocar um campo já focado faria o leitor repetir
  // a descrição inteira de privacidade.
  if (document.activeElement !== campo) {
    campo.focus();
  }
};

const limparErroDoCampo = () => {
  erroDominio.hidden = true;
  erroDominioTexto.textContent = "";
  campo.removeAttribute("aria-invalid");
};

/**
 * Põe o domínio verificado no endereço, sem criar entrada no histórico (ADR-8).
 *
 * @param {string} dominio - O domínio normalizado.
 */
const atualizarEndereco = (dominio) => {
  try {
    history.replaceState(null, "", montarEndereco(dominio));
  } catch {
    // Contextos sem History API (arquivo local, moldura restrita): o endereço fica como está.
  }
};

formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  const lido = normalizarDominio(campo.value);
  if (!lido.ok) {
    mostrarErroDoCampo(lido.motivo);
    return;
  }
  limparErroDoCampo();
  campo.value = lido.dominio;
  if (lido.dominio !== dominioAtual) {
    dominioAtual = lido.dominio;
    textoDigitado = "";
    seletoresExtras = [];
    recusadosExtras = [];
  }
  atualizarEndereco(lido.dominio);
  void verificador.verificar(lido.dominio, seletoresExtras);
});

// ---------------------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------------------

// O endereço compartilhável só preenche o campo: quem decide quando o domínio sai do navegador
// é o visitante, apertando o botão (ADR-8).
campo.value = lerDominioDoEndereco(location.search);
