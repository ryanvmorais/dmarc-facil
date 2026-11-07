/**
 * @file Monta a saída de apresentação de um domínio sintético, para a linha de base dos textos.
 *
 * O resultado de `exemplo.com.br` (DMARC em `quarantine` com ressalvas, SPF com `include`, DKIM
 * com chave de 1024 bits e uma falha de consulta) passa por todas as funções que escolhem texto:
 * selos, degraus, achados, frases de falha, resumos e anúncios. Também entra a lista de todas as
 * frases do catálogo. O `linha-de-base-pt.json` guarda o que isso devolve: se uma frase da página
 * em português mudar, sumir ou aparecer, o teste da linha de base falha.
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
  mensagemDeFalha,
  resumoConsultas,
  rodapeDosResolvedores,
} from "../../public/js/apresentacao.js";
import { montarEscada, textoDoFim } from "../../public/js/escada.js";
import { SELETORES_COMUNS } from "../../public/js/seletores-dkim.js";
import { textoDoAchado, textoDoMotivo } from "../../public/js/textos/resolver.js";
import { chaveRsa } from "./chave-sintetica.js";
import { DOMINIO, estadoDkim, estadoDmarc, estadoSpf, falha, verificando } from "./estados.js";
import { textos } from "./textos.js";

const NOME_GOOGLE = `google._domainkey.${DOMINIO}`;
const NOME_K1 = `k1._domainkey.${DOMINIO}`;

// Os registros DMARC que cobrem cada degrau, cada ressalva e cada situação sem registro válido.
/** @type {Record<string, string[]>} */
const REGISTROS_DMARC = {
  none: ["v=DMARC1; p=none; rua=mailto:dmarc@exemplo.com.br"],
  quarantineComRessalvas: [
    "v=DMARC1; p=quarantine; pct=50; sp=none; rua=mailto:dmarc@exemplo.com.br",
  ],
  reject: ["v=DMARC1; p=reject; rua=mailto:dmarc@exemplo.com.br"],
  ausente: [],
  invalido: ["v=DMARC1; p=talvez"],
  multiplos: ["v=DMARC1; p=none", "v=DMARC1; p=reject"],
};

/**
 * Todo texto folha de um objeto de catálogo, sem as chaves: o que a página pode mostrar.
 *
 * @param {unknown} no - Um objeto, uma lista ou um texto.
 * @returns {string[]} Os textos folha, na ordem em que aparecem.
 */
const folhas = (no) => {
  if (typeof no === "string") {
    return [no];
  }
  return typeof no === "object" && no !== null ? Object.values(no).flatMap(folhas) : [];
};

/**
 * Monta a saída com o catálogo em português, passado como primeiro argumento.
 *
 * @returns {Promise<unknown>} Um objeto simples, para comparar com o JSON da linha de base.
 */
export const montarLinhaDeBase = async () => {
  const dmarcs = Object.entries(REGISTROS_DMARC).map(([nome, registros]) => {
    const estado = estadoDmarc(registros);
    const escada = montarEscada(textos, estado.resultado);
    return {
      nome,
      cartao: apresentarDmarc(textos, estado),
      escada,
      fimDaEscada: textoDoFim(textos, escada),
    };
  });

  const spf = await estadoSpf({
    [DOMINIO]: ["v=spf1 include:_spf.exemplo.net ~all"],
    "_spf.exemplo.net": ["v=spf1 ip4:192.0.2.0/24 -all"],
  });
  const dkim = await estadoDkim(["google", "k1"], {
    [NOME_GOOGLE]: [`v=DKIM1; k=rsa; p=${chaveRsa(1024)}`],
  });
  const dkimComFalha = await estadoDkim(["google", "k1"], {
    [NOME_GOOGLE]: [`v=DKIM1; k=rsa; p=${chaveRsa(1024)}`],
    [NOME_K1]: "FALHA",
  });
  const digitados = lerSeletoresDigitados(
    textos,
    "k1, a/b, google._domainkey.exemplo.com.br, .x, é",
  );

  const cartoes = {
    dmarc: apresentarDmarc(textos, estadoDmarc(REGISTROS_DMARC["quarantineComRessalvas"] ?? [])),
    spf: apresentarSpf(textos, spf),
    dkim: apresentarDkim(textos, dkim, { recusados: digitados.recusados, totalSeletores: 2 }),
  };

  // A frase de cada código, com o `valor` 503 onde a frase o encaixa.
  const motivos = Object.fromEntries(
    Object.keys(textos.motivos).map((codigo) => [
      codigo,
      textoDoMotivo(textos, { motivo: codigo, valor: 503 }),
    ]),
  );

  const resolvedores = (/** @type {Array<"cloudflare" | "google">} */ nomes) => ({
    partes: { dmarc: { fase: "pronto", resolvedores: nomes } },
  });

  return {
    cartoes,
    dmarcs,
    dkimComFalha: apresentarDkim(textos, dkimComFalha),
    digitados,
    falhas: {
      http: mensagemDeFalha(textos, falha("spf", "resolvedor-http", 503)),
      dnsStatus: mensagemDeFalha(textos, falha("dmarc", "resposta-status-dns", 2)),
      semMotivo: mensagemDeFalha(textos, falha("dkim", "codigo-que-nao-existe")),
      cartaoFalha: apresentarSpf(textos, falha("spf", "resolvedores-indisponiveis")),
      cartaoVerificando: [
        apresentarDmarc(textos, verificando("dmarc")),
        apresentarSpf(textos, verificando("spf")),
        apresentarDkim(textos, verificando("dkim"), {
          totalSeletores: SELETORES_COMUNS.length + 2,
        }),
      ],
    },
    consultas: [
      resumoConsultas(textos, { total: 3, limite: 10, incompleta: false }),
      resumoConsultas(textos, { total: 5, limite: 10, incompleta: true }),
      resumoConsultas(textos, { total: 13, limite: 10, incompleta: false }),
    ],
    resolvedores: [
      rodapeDosResolvedores(textos, /** @type {never} */ (resolvedores(["cloudflare"]))),
      rodapeDosResolvedores(textos, /** @type {never} */ (resolvedores(["google"]))),
      rodapeDosResolvedores(textos, /** @type {never} */ (resolvedores(["cloudflare", "google"]))),
      rodapeDosResolvedores(textos, /** @type {never} */ (resolvedores([]))),
    ],
    anuncios: {
      inicio: anunciarInicio(textos, DOMINIO),
      fim: anunciarFim(textos, DOMINIO, cartoes),
      inexistente: anunciarInexistente(textos, DOMINIO),
    },
    achadosSoltos: {
      generico: textoDoAchado(textos, { codigo: "codigo-que-nao-existe", gravidade: "info" }),
      seletorInvalido: textoDoAchado(textos, {
        codigo: "seletor-invalido",
        gravidade: "aviso",
        seletor: "a/b",
        detalhe: "caractere-invalido",
      }),
      comDetalhe: textoDoAchado(textos, {
        codigo: "termo-invalido",
        gravidade: "erro",
        detalhe: "ip4:999.0.0.1",
      }),
    },
    motivos,
    // O que a página pode mostrar, sem a chave de cada texto: a lista vale mesmo se uma chave for
    // renomeada, e só falha se uma frase mudar, sumir ou aparecer. O
    // texto genérico do achado fica de fora: ele tem `{codigo}`, e a saída dele está em
    // `achadosSoltos.generico`.
    frases: [
      ...new Set([
        ...folhas(textos.interface),
        ...folhas(textos.achados.porCodigo),
        ...folhas(textos.motivos),
      ]),
    ].sort(),
  };
};
