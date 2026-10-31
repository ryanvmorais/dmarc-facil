/**
 * @file Testes de `criarVerificador`, a orquestração das três partes (RF-02, ADR-4 e ADR-5 da
 * spec 006).
 *
 * A consulta é uma função falsa com roteiro por nome e "portões": uma resposta presa num portão
 * só sai quando o teste a libera, o que deixa montar as corridas (a resposta velha chegando
 * depois da nova) sem relógio. Os registros são sintéticos (`exemplo.com.br`).
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { criarVerificador } from "../public/js/verificador.js";
import { chaveRsa } from "./ajudas/chave-sintetica.js";

/** @typedef {import("../public/js/spf-consultas.js").Consulta} Consulta */
/** @typedef {import("../public/js/tipos.js").EstadoVerificacao} EstadoVerificacao */
/** @typedef {Awaited<ReturnType<Consulta>>} Resposta */

const COMUNS = ["google", "selector1"];
const REGISTRO_DKIM = `v=DKIM1; k=rsa; p=${chaveRsa(2048)}`;

// ---------------------------------------------------------------------------
// APOIO
// ---------------------------------------------------------------------------

/**
 * @param {string[]} registros - Textos TXT.
 * @returns {Resposta} Uma resposta com registros.
 */
const com = (registros) => ({
  ok: true,
  situacao: "encontrado",
  registros,
  resolvedor: "cloudflare",
});

/** @type {Resposta} */
const SEM_REGISTRO = {
  ok: true,
  situacao: "sem-registro",
  registros: [],
  resolvedor: "cloudflare",
};
/** @type {Resposta} */
const INEXISTENTE = { ok: true, situacao: "inexistente", registros: [], resolvedor: "cloudflare" };
/** @type {Resposta} */
const FALHA = { ok: false, motivo: "A consulta ao resolvedor falhou." };

/**
 * Um portão: a resposta presa nele só sai quando `abrir` é chamado.
 *
 * @returns {{ promessa: Promise<void>, abrir: () => void }} O portão.
 */
const portao = () => {
  /** @type {() => void} */
  let abrir = () => {};
  const promessa = new Promise((resolver) => {
    abrir = () => resolver(undefined);
  });
  return { promessa, abrir };
};

/**
 * Cria a consulta falsa.
 *
 * @param {Record<string, Array<{ resposta: Resposta, portao?: { promessa: Promise<void> } }>>} [roteiro]
 *   Respostas por nome, uma por chamada, na ordem; o que falta é sem registro.
 * @returns {{ consulta: Consulta, chamadas: string[] }} A função e os nomes pedidos.
 */
const criarConsulta = (roteiro = {}) => {
  /** @type {string[]} */
  const chamadas = [];
  /** @type {Record<string, number>} */
  const contagem = {};

  /** @type {Consulta} */
  const consulta = async (nome) => {
    chamadas.push(nome);
    const indice = contagem[nome] ?? 0;
    contagem[nome] = indice + 1;
    const passo = roteiro[nome]?.[indice] ?? roteiro[nome]?.at(-1);
    await passo?.portao?.promessa;
    return passo?.resposta ?? SEM_REGISTRO;
  };
  return { consulta, chamadas };
};

/**
 * Cria o verificador e guarda tudo o que `aoMudar` recebeu.
 *
 * @param {Consulta} consulta - A consulta falsa.
 * @returns {{
 *   verificador: ReturnType<typeof criarVerificador>, estados: EstadoVerificacao[],
 *   ultimo: () => EstadoVerificacao
 * }} O verificador e o histórico de estados.
 */
const criar = (consulta) => {
  /** @type {EstadoVerificacao[]} */
  const estados = [];
  const verificador = criarVerificador({
    consulta,
    seletoresComuns: COMUNS,
    aoMudar: (estado) => estados.push(estado),
  });
  const ultimo = () => /** @type {EstadoVerificacao} */ (estados.at(-1));
  return { verificador, estados, ultimo };
};

/** Cede a vez para as consultas que não estão presas num portão terminarem. */
const aguardar = () => new Promise((resolver) => setTimeout(resolver, 15));

// ---------------------------------------------------------------------------
// FLUXO
// ---------------------------------------------------------------------------

describe("criarVerificador: as três partes", () => {
  it("começa com as três em verificando e termina com as três prontas", async () => {
    const { consulta } = criarConsulta({
      "_dmarc.exemplo.com.br": [
        { resposta: com(["v=DMARC1; p=reject; rua=mailto:d@exemplo.com.br"]) },
      ],
      "exemplo.com.br": [{ resposta: com(["v=spf1 -all"]) }],
      "google._domainkey.exemplo.com.br": [{ resposta: com([REGISTRO_DKIM]) }],
    });
    const { verificador, estados, ultimo } = criar(consulta);

    const resultado = await verificador.verificar("exemplo.com.br");

    assert.deepEqual(resultado, { ok: true, dominio: "exemplo.com.br" });
    assert.deepEqual(
      Object.values(estados[0]?.partes ?? {}).map((parte) => parte.fase),
      ["verificando", "verificando", "verificando"],
    );
    assert.equal(ultimo().dominio, "exemplo.com.br");
    assert.deepEqual(
      Object.values(ultimo().partes).map((parte) => parte.fase),
      ["pronto", "pronto", "pronto"],
    );
    assert.equal(ultimo().dominioInexistente, false);
  });

  it("dispara as três ao mesmo tempo, sem esperar uma terminar para começar a outra", async () => {
    const preso = portao();
    const { consulta, chamadas } = criarConsulta({
      "_dmarc.exemplo.com.br": [{ resposta: SEM_REGISTRO, portao: preso }],
    });
    const { verificador } = criar(consulta);

    const envio = verificador.verificar("exemplo.com.br");
    await aguardar();

    // O DMARC está preso, e o SPF e o DKIM já consultaram.
    assert.ok(chamadas.includes("_dmarc.exemplo.com.br"));
    assert.ok(chamadas.includes("exemplo.com.br"));
    assert.ok(chamadas.includes("google._domainkey.exemplo.com.br"));
    preso.abrir();
    await envio;
  });

  it("cada parte entrega quando termina, sem esperar as outras", async () => {
    const preso = portao();
    const { consulta } = criarConsulta({
      "_dmarc.exemplo.com.br": [{ resposta: SEM_REGISTRO, portao: preso }],
    });
    const { verificador, ultimo } = criar(consulta);

    const envio = verificador.verificar("exemplo.com.br");
    await aguardar();

    assert.equal(ultimo().partes.dmarc.fase, "verificando");
    assert.equal(ultimo().partes.spf.fase, "pronto");
    assert.equal(ultimo().partes.dkim.fase, "pronto");

    preso.abrir();
    await envio;
    assert.equal(ultimo().partes.dmarc.fase, "pronto");
  });

  it("a falha de uma parte não derruba as outras", async () => {
    const { consulta } = criarConsulta({
      "_dmarc.exemplo.com.br": [{ resposta: FALHA }],
      "exemplo.com.br": [{ resposta: com(["v=spf1 -all"]) }],
    });
    const { verificador, ultimo } = criar(consulta);

    await verificador.verificar("exemplo.com.br");

    const dmarc = ultimo().partes.dmarc;
    assert.equal(dmarc.fase, "falha");
    assert.equal(dmarc.fase === "falha" ? dmarc.motivo : "", FALHA.ok ? "" : FALHA.motivo);
    assert.equal(ultimo().partes.spf.fase, "pronto");
    assert.equal(ultimo().partes.dkim.fase, "pronto");
  });

  it("consulta que lança exceção vira falha da parte, não rejeição", async () => {
    /** @type {Consulta} */
    const consulta = async (nome) => {
      if (nome.startsWith("_dmarc.")) {
        throw new Error("rede");
      }
      return SEM_REGISTRO;
    };
    const { verificador, ultimo } = criar(consulta);

    await verificador.verificar("exemplo.com.br");

    assert.equal(ultimo().partes.dmarc.fase, "falha");
    assert.equal(ultimo().partes.spf.fase, "pronto");
  });

  it("junta os seletores comuns e os digitados na busca do DKIM", async () => {
    const { consulta, chamadas } = criarConsulta();
    const { verificador } = criar(consulta);

    await verificador.verificar("exemplo.com.br", ["meuprovedor"]);

    const dkim = chamadas.filter((nome) => nome.includes("._domainkey."));
    assert.deepEqual(dkim.sort(), [
      "google._domainkey.exemplo.com.br",
      "meuprovedor._domainkey.exemplo.com.br",
      "selector1._domainkey.exemplo.com.br",
    ]);
  });
});

// ---------------------------------------------------------------------------
// DOMÍNIO DIGITADO
// ---------------------------------------------------------------------------

describe("criarVerificador: o domínio digitado", () => {
  it("normaliza antes de consultar", async () => {
    const { consulta, chamadas } = criarConsulta();
    const { verificador, ultimo } = criar(consulta);

    const resultado = await verificador.verificar("  https://Exemplo.COM.br/pagina ");

    assert.deepEqual(resultado, { ok: true, dominio: "exemplo.com.br" });
    assert.equal(ultimo().dominio, "exemplo.com.br");
    assert.ok(chamadas.every((nome) => nome === nome.toLowerCase() && !nome.includes("/")));
  });

  /** @type {string[]} */
  const recusados = ["", "   ", "localhost", "192.168.0.1", "exemplo.com.br:8080", "a b.com.br"];

  for (const entrada of recusados) {
    it(`recusa "${entrada}" sem consultar nem mudar o estado`, async () => {
      const { consulta, chamadas } = criarConsulta();
      const { verificador, estados } = criar(consulta);

      const resultado = await verificador.verificar(entrada);

      assert.equal(resultado.ok, false);
      assert.ok(!resultado.ok && resultado.motivo.length > 0);
      assert.deepEqual(chamadas, []);
      assert.deepEqual(estados, []);
    });
  }

  it("recusa o que não é texto", async () => {
    const { consulta, chamadas } = criarConsulta();
    const { verificador } = criar(consulta);

    const resultado = await verificador.verificar(/** @type {any} */ (undefined));

    assert.equal(resultado.ok, false);
    assert.deepEqual(chamadas, []);
  });

  it("uma entrada recusada no meio de uma verificação não a cancela", async () => {
    const preso = portao();
    const { consulta } = criarConsulta({
      "_dmarc.exemplo.com.br": [{ resposta: SEM_REGISTRO, portao: preso }],
    });
    const { verificador, ultimo } = criar(consulta);

    const envio = verificador.verificar("exemplo.com.br");
    await verificador.verificar("localhost");
    preso.abrir();
    await envio;

    assert.equal(ultimo().partes.dmarc.fase, "pronto");
  });
});

// ---------------------------------------------------------------------------
// CANCELAMENTO POR GERAÇÃO
// ---------------------------------------------------------------------------

describe("criarVerificador: nunca mistura dois domínios", () => {
  it("a resposta da verificação anterior nunca chega ao aoMudar", async () => {
    const preso = portao();
    const { consulta } = criarConsulta({
      "_dmarc.velho.com.br": [{ resposta: com(["v=DMARC1; p=none"]), portao: preso }],
      "_dmarc.novo.com.br": [{ resposta: com(["v=DMARC1; p=reject; rua=mailto:d@novo.com.br"]) }],
    });
    const { verificador, estados, ultimo } = criar(consulta);

    const velho = verificador.verificar("velho.com.br");
    await aguardar();
    await verificador.verificar("novo.com.br");
    const quantidade = estados.length;

    preso.abrir();
    await velho;

    // Depois de liberar a resposta velha, nada mudou: nenhum aoMudar novo.
    assert.equal(estados.length, quantidade);
    assert.equal(ultimo().dominio, "novo.com.br");
    const dmarc = ultimo().partes.dmarc;
    assert.ok(dmarc.fase === "pronto" && dmarc.resultado.situacao === "valido");
    assert.equal(dmarc.resultado.estagio, "reject");
  });

  it("depois da troca, todo estado entregue é do domínio novo", async () => {
    const preso = portao();
    const { consulta } = criarConsulta({
      "exemplo.com.br": [{ resposta: com(["v=spf1 -all"]), portao: preso }],
    });
    const { verificador, estados } = criar(consulta);

    const velho = verificador.verificar("exemplo.com.br");
    await aguardar();
    const indiceDaTroca = estados.length;
    await verificador.verificar("outro.com.br");
    preso.abrir();
    await velho;

    assert.ok(estados.slice(indiceDaTroca).every((estado) => estado.dominio === "outro.com.br"));
  });

  it("a geração cresce a cada verificação", async () => {
    const { consulta } = criarConsulta();
    const { verificador, estados } = criar(consulta);

    await verificador.verificar("a.com.br");
    await verificador.verificar("b.com.br");

    const geracoes = new Set(estados.map((estado) => estado.geracao));
    assert.deepEqual([...geracoes], [1, 2]);
  });

  it("uma verificação idêntica em andamento não dispara consulta repetida", async () => {
    const preso = portao();
    const { consulta, chamadas } = criarConsulta({
      "_dmarc.exemplo.com.br": [{ resposta: SEM_REGISTRO, portao: preso }],
    });
    const { verificador } = criar(consulta);

    const primeira = verificador.verificar("exemplo.com.br");
    await aguardar();
    const pedidosAntes = chamadas.length;
    const segunda = verificador.verificar("Exemplo.com.br");
    await aguardar();

    assert.equal(chamadas.length, pedidosAntes);
    preso.abrir();
    assert.deepEqual(await primeira, await segunda);
  });

  it("com outros seletores extras, a verificação já não é idêntica", async () => {
    const preso = portao();
    const { consulta, chamadas } = criarConsulta({
      "_dmarc.exemplo.com.br": [{ resposta: SEM_REGISTRO, portao: preso }],
    });
    const { verificador } = criar(consulta);

    const primeira = verificador.verificar("exemplo.com.br");
    await aguardar();
    const pedidosAntes = chamadas.length;
    const segunda = verificador.verificar("exemplo.com.br", ["novo"]);
    await aguardar();

    assert.ok(chamadas.length > pedidosAntes);
    preso.abrir();
    await Promise.all([primeira, segunda]);
  });

  it("terminada a verificação, a mesma pode ser pedida de novo e consulta outra vez", async () => {
    const { consulta, chamadas } = criarConsulta();
    const { verificador } = criar(consulta);

    await verificador.verificar("exemplo.com.br");
    const primeiras = chamadas.length;
    await verificador.verificar("exemplo.com.br");

    assert.equal(chamadas.length, primeiras * 2);
  });
});

// ---------------------------------------------------------------------------
// DOMÍNIO QUE NÃO EXISTE
// ---------------------------------------------------------------------------

describe("criarVerificador: domínio inexistente (ADR-5)", () => {
  it("NXDOMAIN só em _dmarc. e nos seletores não marca o domínio como inexistente", async () => {
    const { consulta } = criarConsulta({
      "_dmarc.exemplo.com.br": [{ resposta: INEXISTENTE }],
      "google._domainkey.exemplo.com.br": [{ resposta: INEXISTENTE }],
      "selector1._domainkey.exemplo.com.br": [{ resposta: INEXISTENTE }],
      "exemplo.com.br": [{ resposta: com(["v=spf1 -all"]) }],
    });
    const { verificador, ultimo } = criar(consulta);

    await verificador.verificar("exemplo.com.br");

    assert.equal(ultimo().dominioInexistente, false);
  });

  it("NXDOMAIN no próprio domínio marca", async () => {
    const { consulta } = criarConsulta({ "exemplo.com.br": [{ resposta: INEXISTENTE }] });
    const { verificador, ultimo } = criar(consulta);

    await verificador.verificar("exemplo.com.br");

    assert.equal(ultimo().dominioInexistente, true);
  });

  it("se a consulta do próprio domínio falha, não marca (a falha aparece no SPF)", async () => {
    const { consulta } = criarConsulta({ "exemplo.com.br": [{ resposta: FALHA }] });
    const { verificador, ultimo } = criar(consulta);

    await verificador.verificar("exemplo.com.br");

    assert.equal(ultimo().dominioInexistente, false);
    assert.equal(ultimo().partes.spf.fase, "falha");
  });

  it("o NXDOMAIN de uma verificação velha não marca a nova", async () => {
    const preso = portao();
    const { consulta } = criarConsulta({
      "velho.com.br": [{ resposta: INEXISTENTE, portao: preso }],
    });
    const { verificador, ultimo } = criar(consulta);

    const velho = verificador.verificar("velho.com.br");
    await aguardar();
    await verificador.verificar("novo.com.br");
    preso.abrir();
    await velho;

    assert.equal(ultimo().dominio, "novo.com.br");
    assert.equal(ultimo().dominioInexistente, false);
  });
});

// ---------------------------------------------------------------------------
// REFAZER UMA PARTE
// ---------------------------------------------------------------------------

describe("criarVerificador: refazer uma parte só", () => {
  it("refazer('spf') consulta só o SPF e deixa DMARC e DKIM como estavam", async () => {
    const { consulta, chamadas } = criarConsulta({
      "exemplo.com.br": [{ resposta: FALHA }, { resposta: com(["v=spf1 -all"]) }],
    });
    const { verificador, ultimo } = criar(consulta);
    await verificador.verificar("exemplo.com.br");
    assert.equal(ultimo().partes.spf.fase, "falha");
    const dmarcAntes = ultimo().partes.dmarc;
    const dkimAntes = ultimo().partes.dkim;
    chamadas.length = 0;

    await verificador.refazer("spf");

    assert.deepEqual(chamadas, ["exemplo.com.br"]);
    assert.equal(ultimo().partes.spf.fase, "pronto");
    assert.equal(ultimo().partes.dmarc, dmarcAntes);
    assert.equal(ultimo().partes.dkim, dkimAntes);
  });

  it("refazer('dmarc') consulta só o DMARC", async () => {
    const { consulta, chamadas } = criarConsulta();
    const { verificador } = criar(consulta);
    await verificador.verificar("exemplo.com.br");
    chamadas.length = 0;

    await verificador.refazer("dmarc");

    assert.deepEqual(chamadas, ["_dmarc.exemplo.com.br"]);
  });

  it("refazerDkim consulta só o DKIM, com os seletores novos, sem tocar DMARC e SPF", async () => {
    const { consulta, chamadas } = criarConsulta();
    const { verificador, ultimo } = criar(consulta);
    await verificador.verificar("exemplo.com.br");
    const dmarcAntes = ultimo().partes.dmarc;
    const spfAntes = ultimo().partes.spf;
    chamadas.length = 0;

    await verificador.refazerDkim(["k1"]);

    assert.deepEqual(chamadas.sort(), [
      "google._domainkey.exemplo.com.br",
      "k1._domainkey.exemplo.com.br",
      "selector1._domainkey.exemplo.com.br",
    ]);
    assert.equal(ultimo().partes.dmarc, dmarcAntes);
    assert.equal(ultimo().partes.spf, spfAntes);
  });

  it("a parte volta a verificando enquanto refaz, e a geração não muda", async () => {
    const preso = portao();
    const { consulta } = criarConsulta({
      "_dmarc.exemplo.com.br": [
        { resposta: SEM_REGISTRO },
        { resposta: SEM_REGISTRO, portao: preso },
      ],
    });
    const { verificador, ultimo } = criar(consulta);
    await verificador.verificar("exemplo.com.br");
    const geracao = ultimo().geracao;

    const refeito = verificador.refazer("dmarc");
    await aguardar();

    assert.equal(ultimo().partes.dmarc.fase, "verificando");
    assert.equal(ultimo().geracao, geracao);
    preso.abrir();
    await refeito;
    assert.equal(ultimo().partes.dmarc.fase, "pronto");
  });

  it("a resposta antiga da mesma parte não vence a nova", async () => {
    const preso = portao();
    const { consulta } = criarConsulta({
      "_dmarc.exemplo.com.br": [
        { resposta: com(["v=DMARC1; p=none; rua=mailto:d@exemplo.com.br"]), portao: preso },
        { resposta: com(["v=DMARC1; p=reject; rua=mailto:d@exemplo.com.br"]) },
      ],
    });
    const { verificador, ultimo } = criar(consulta);

    const envio = verificador.verificar("exemplo.com.br");
    await aguardar();
    await verificador.refazer("dmarc");
    preso.abrir();
    await envio;

    const dmarc = ultimo().partes.dmarc;
    assert.ok(dmarc.fase === "pronto" && dmarc.resultado.situacao === "valido");
    assert.equal(dmarc.resultado.estagio, "reject");
  });

  it("refazer o SPF recomeça a dúvida do domínio inexistente", async () => {
    const { consulta } = criarConsulta({
      "exemplo.com.br": [{ resposta: INEXISTENTE }, { resposta: com(["v=spf1 -all"]) }],
    });
    const { verificador, ultimo } = criar(consulta);
    await verificador.verificar("exemplo.com.br");
    assert.equal(ultimo().dominioInexistente, true);

    await verificador.refazer("spf");

    assert.equal(ultimo().dominioInexistente, false);
  });

  it("refazer sem verificação anterior não faz nada", async () => {
    const { consulta, chamadas } = criarConsulta();
    const { verificador, estados } = criar(consulta);

    await verificador.refazer("spf");
    await verificador.refazerDkim(["k1"]);

    assert.deepEqual(chamadas, []);
    assert.deepEqual(estados, []);
  });
});
