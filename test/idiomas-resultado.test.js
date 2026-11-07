/**
 * @file O mesmo resultado, nos dois idiomas, tem a mesma estrutura (RF-02 da spec 008).
 *
 * O idioma só troca a frase: selos, degraus da escada, códigos de achado, seletores e ordem têm de
 * sair iguais com o catálogo `pt` e com o `en`. Um domínio sintético passa pelas funções de
 * apresentação com cada catálogo, e o teste compara o que não é texto. Um registro TXT com
 * marcação continua virando texto puro na página em inglês.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { apresentarDkim, apresentarDmarc, apresentarSpf } from "../public/js/apresentacao.js";
import { criar } from "../public/js/dom.js";
import { montarEscada } from "../public/js/escada.js";
import { chaveRsa } from "./ajudas/chave-sintetica.js";
import { criarDocumentoFalso } from "./ajudas/documento-falso.js";
import { DOMINIO, estadoDkim, estadoDmarc, estadoSpf } from "./ajudas/estados.js";
import { catalogos } from "./ajudas/textos.js";

// Os registros DMARC que cobrem cada degrau, cada ressalva e cada situação sem registro válido.
const REGISTROS_DMARC = [
  ["v=DMARC1; p=none; rua=mailto:dmarc@exemplo.com.br"],
  ["v=DMARC1; p=quarantine; pct=50; sp=none; rua=mailto:dmarc@exemplo.com.br"],
  ["v=DMARC1; p=reject; rua=mailto:dmarc@exemplo.com.br"],
  [],
  ["v=DMARC1; p=talvez"],
  ["v=DMARC1; p=none", "v=DMARC1; p=reject"],
];

/**
 * @param {{ achados: Array<{ codigo: string, gravidade: string, tag?: string }> }} cartao
 * @returns {string[]} O código, a gravidade e a tag de cada achado, na ordem.
 */
const achadosDe = (cartao) =>
  cartao.achados.map((achado) => `${achado.codigo}/${achado.gravidade}/${achado.tag ?? ""}`);

/**
 * O que um cartão tem de igual em qualquer idioma: o estado do selo, a fase e os achados.
 *
 * @param {import("../public/js/apresentacao.js").Cartao} cartao
 * @returns {unknown}
 */
const estruturaDoCartao = (cartao) => ({
  id: cartao.id,
  fase: cartao.fase,
  selo: cartao.selo.estado,
  achados: achadosDe(cartao),
  registro: cartao.registro?.texto,
});

/** @param {import("../public/js/escada.js").Escada} escada */
const estruturaDaEscada = (escada) => ({
  semAtual: escada.semAtual,
  proximo: escada.proximo,
  ressalvas: escada.ressalvas,
  degraus: escada.degraus.map((degrau) => ({
    politica: degrau.politica,
    papel: degrau.papel,
    titulo: degrau.titulo,
    comEtiqueta: degrau.etiqueta !== undefined,
    comAcao: degrau.acao !== undefined,
  })),
});

describe("o mesmo resultado nos dois idiomas", () => {
  it("DMARC e escada: mesmos selos, degraus, ressalvas e códigos de achado", () => {
    for (const registros of REGISTROS_DMARC) {
      const estado = estadoDmarc(registros);
      const pt = catalogos.pt;
      const en = catalogos.en;

      assert.deepEqual(
        estruturaDoCartao(apresentarDmarc(en, estado)),
        estruturaDoCartao(apresentarDmarc(pt, estado)),
        JSON.stringify(registros),
      );
      assert.deepEqual(
        estruturaDaEscada(montarEscada(en, estado.resultado)),
        estruturaDaEscada(montarEscada(pt, estado.resultado)),
        JSON.stringify(registros),
      );
    }
  });

  it("os títulos dos degraus são os mesmos (nome técnico de política)", () => {
    for (const idioma of /** @type {const} */ (["pt", "en"])) {
      const escada = montarEscada(
        catalogos[idioma],
        estadoDmarc(REGISTROS_DMARC[0] ?? []).resultado,
      );

      assert.deepEqual(
        escada.degraus.map((degrau) => degrau.titulo),
        ["p=none", "p=quarantine", "p=reject"],
        idioma,
      );
    }
  });

  it("os textos mudam de verdade: nada do inglês é igual ao português", () => {
    const estado = estadoDmarc(REGISTROS_DMARC[1] ?? []);
    const pt = montarEscada(catalogos.pt, estado.resultado);
    const en = montarEscada(catalogos.en, estado.resultado);

    for (const [indice, degrau] of en.degraus.entries()) {
      assert.notEqual(degrau.resumo, pt.degraus[indice]?.resumo);
    }
  });

  it("SPF: mesmo selo e mesmos achados", async () => {
    const estado = await estadoSpf({
      [DOMINIO]: ["v=spf1 include:_spf.exemplo.net ptr ~all"],
      "_spf.exemplo.net": ["v=spf1 ip4:192.0.2.0/24 -all"],
    });

    assert.deepEqual(
      estruturaDoCartao(apresentarSpf(catalogos.en, estado)),
      estruturaDoCartao(apresentarSpf(catalogos.pt, estado)),
    );
  });

  it("DKIM: mesmos seletores tentados, encontrados e recusados", async () => {
    const estado = await estadoDkim(["google", "k1"], {
      [`google._domainkey.${DOMINIO}`]: [`v=DKIM1; k=rsa; p=${chaveRsa(1024)}`],
    });
    const opcoes = { recusados: [], totalSeletores: 2 };
    const pt = apresentarDkim(catalogos.pt, estado, opcoes);
    const en = apresentarDkim(catalogos.en, estado, opcoes);

    assert.deepEqual(estruturaDoCartao(en), estruturaDoCartao(pt));
    assert.deepEqual(
      en.extra?.tentados.map(({ seletor, estado: situacao }) => [seletor, situacao]),
      pt.extra?.tentados.map(({ seletor, estado: situacao }) => [seletor, situacao]),
    );
    assert.deepEqual(
      en.extra?.encontrados.map(({ seletor }) => seletor),
      pt.extra?.encontrados.map(({ seletor }) => seletor),
    );
    assert.equal(en.extra?.total, pt.extra?.total);
  });

  it("DKIM em inglês diz que não encontrou nesses seletores, nunca que o domínio não tem", async () => {
    const estado = await estadoDkim(["google"], {});
    const cartao = apresentarDkim(catalogos.en, estado, { recusados: [], totalSeletores: 1 });
    const falado = `${cartao.resumo} ${cartao.achados.map((achado) => achado.titulo).join(" ")}`;

    assert.match(falado, /did not find|not found/i);
    assert.doesNotMatch(falado, /you (?:do not|don't) have|has no DKIM/i);
  });

  it("registro TXT com marcação vira texto puro em inglês", () => {
    const hostil = 'v=DMARC1; p=none; rua=mailto:<script>alert("x")</script>@exemplo.com.br';
    const cartao = apresentarDmarc(catalogos.en, estadoDmarc([hostil]));
    const documento = criarDocumentoFalso();
    const no = /** @type {import("./ajudas/documento-falso.js").NoFalso} */ (
      /** @type {unknown} */ (criar(documento, "code", {}, [cartao.registro?.texto ?? ""]))
    );

    assert.equal(cartao.registro?.texto, hostil);
    assert.equal(no.texto(), hostil);
    assert.equal(
      no.todos().filter((filho) => filho.tag === "script").length,
      0,
      "o texto do registro virou elemento",
    );
  });
});
