/**
 * @file Testes de `buscarDkim`, que procura a chave DKIM de um domínio numa lista de seletores
 * com consultas simultâneas em número limitado.
 *
 * A consulta é uma função falsa sobre um mapa nome → resposta, que registra os nomes pedidos e
 * quantas consultas estavam em andamento ao mesmo tempo. Os registros são sintéticos
 * (`exemplo.com.br`, chaves de `ajudas/chave-sintetica.js`).
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buscarDkim } from "../public/js/dkim-busca.js";
import { MAXIMO_SELETORES } from "../public/js/seletor-dkim.js";
import { chaveRsa } from "./ajudas/chave-sintetica.js";

const REGISTRO = `v=DKIM1; k=rsa; p=${chaveRsa(2048)}`;

/** @typedef {import("../public/js/spf-consultas.js").Consulta} Consulta */

/** @param {string} seletor - Seletor. @returns {string} O nome DNS consultado. */
const nome = (seletor) => `${seletor}._domainkey.exemplo.com.br`;

/**
 * @param {string} [resolvedor] - Quem respondeu.
 * @returns {Awaited<ReturnType<Consulta>>} Uma resposta de nome sem registro.
 */
const ausente = (resolvedor = "cloudflare") => ({
  ok: true,
  situacao: "sem-registro",
  registros: [],
  resolvedor,
});

/**
 * @param {string[]} registros - Textos TXT da resposta.
 * @param {string} [resolvedor] - Quem respondeu.
 * @returns {Awaited<ReturnType<Consulta>>} Uma resposta com registros.
 */
const com = (registros, resolvedor = "cloudflare") => ({
  ok: true,
  situacao: "encontrado",
  registros,
  resolvedor,
});

/**
 * Cria a consulta falsa.
 *
 * @param {Record<string, Awaited<ReturnType<Consulta>>>} [respostas] - Resposta por nome; o que
 *   falta é sem registro.
 * @param {{ atrasos?: Record<string, number>, atrasoPadrao?: number }} [opcoes] - Atraso por
 *   nome e o padrão, em milissegundos.
 * @returns {{ consulta: Consulta, chamadas: string[], pico: () => number }} A função e o que ela
 *   viu: nomes pedidos e o maior número de consultas em andamento.
 */
const criarConsulta = (respostas = {}, { atrasos = {}, atrasoPadrao = 1 } = {}) => {
  /** @type {string[]} */
  const chamadas = [];
  let emAndamento = 0;
  let pico = 0;

  /** @type {Consulta} */
  const consulta = async (pedido) => {
    chamadas.push(pedido);
    emAndamento += 1;
    pico = Math.max(pico, emAndamento);
    await new Promise((resolver) => setTimeout(resolver, atrasos[pedido] ?? atrasoPadrao));
    emAndamento -= 1;
    return respostas[pedido] ?? ausente();
  };
  return { consulta, chamadas, pico: () => pico };
};

/**
 * @param {number} quantidade - Quantos seletores.
 * @returns {string[]} Seletores `s0`, `s1`…
 */
const seletoresNumerados = (quantidade) => Array.from({ length: quantidade }, (_, i) => `s${i}`);

/**
 * @param {Awaited<ReturnType<typeof buscarDkim>>} busca - Resultado da busca.
 * @returns {import("../public/js/dkim-busca.js").BuscaDkim} O mesmo, depois de conferir `ok`.
 */
const aceita = (busca) => {
  assert.equal(busca.ok, true);
  return /** @type {import("../public/js/dkim-busca.js").BuscaDkim} */ (busca);
};

// ---------------------------------------------------------------------------
// CONCORRÊNCIA
// ---------------------------------------------------------------------------

describe("RF-06 — concorrência limitada", () => {
  it("nunca passa de 6 consultas em andamento e chega a 6 com 19 seletores", async () => {
    const falsa = criarConsulta({}, { atrasoPadrao: 5 });
    aceita(await buscarDkim("exemplo.com.br", seletoresNumerados(19), falsa.consulta));
    assert.equal(falsa.pico(), 6);
    assert.equal(falsa.chamadas.length, 19);
  });

  for (const concorrencia of [1, 2, 3]) {
    it(`respeita a opção concorrencia: ${concorrencia}`, async () => {
      const falsa = criarConsulta({}, { atrasoPadrao: 3 });
      aceita(
        await buscarDkim("exemplo.com.br", seletoresNumerados(10), falsa.consulta, {
          concorrencia,
        }),
      );
      assert.equal(falsa.pico(), concorrencia);
    });
  }

  for (const concorrencia of [0, -1, 2.5, 99, "3", null, NaN]) {
    it(`volta ao padrão de 6 com concorrencia ${String(concorrencia)}`, async () => {
      const falsa = criarConsulta({}, { atrasoPadrao: 3 });
      aceita(
        await buscarDkim("exemplo.com.br", seletoresNumerados(12), falsa.consulta, {
          concorrencia: /** @type {*} */ (concorrencia),
        }),
      );
      assert.equal(falsa.pico(), 6);
    });
  }

  it("devolve os seletores na ordem da lista, mesmo com as respostas fora de ordem", async () => {
    const seletores = seletoresNumerados(6);
    const atrasos = Object.fromEntries(seletores.map((s, i) => [nome(s), (6 - i) * 8]));
    const falsa = criarConsulta({ [nome("s0")]: com([REGISTRO]) }, { atrasos });

    const busca = aceita(await buscarDkim("exemplo.com.br", seletores, falsa.consulta));

    assert.deepEqual(
      busca.seletores.map((item) => item.seletor),
      seletores,
    );
    assert.deepEqual(
      busca.seletores.map((item) => item.nome),
      seletores.map(nome),
    );
    assert.equal(busca.seletores[0]?.estado, "valido");
  });
});

// ---------------------------------------------------------------------------
// RESUMO
// ---------------------------------------------------------------------------

describe("RF-06 — resumo da busca", () => {
  it("é encontrado quando um seletor tem registro válido", async () => {
    const falsa = criarConsulta({ [nome("google")]: com([REGISTRO]) });
    const busca = aceita(
      await buscarDkim("exemplo.com.br", ["s1", "google", "s2"], falsa.consulta),
    );

    assert.equal(busca.situacao, "encontrado");
    assert.equal(busca.incompleta, false);
    assert.deepEqual(
      busca.seletores.map((item) => item.estado),
      ["ausente", "valido", "ausente"],
    );
    assert.equal(busca.seletores[1]?.dkim?.situacao, "valido");
    assert.deepEqual(busca.achados, []);
  });

  it("é nao-encontrado, com a lista dos tentados, quando todos foram verificados e nenhum tem registro", async () => {
    const falsa = criarConsulta();
    const busca = aceita(await buscarDkim("exemplo.com.br", ["a", "b", "c"], falsa.consulta));

    assert.equal(busca.situacao, "nao-encontrado");
    assert.equal(busca.incompleta, false);
    assert.deepEqual(
      busca.seletores.map((item) => item.seletor),
      ["a", "b", "c"],
    );
    assert.deepEqual(busca.achados, [{ codigo: "nenhum-seletor-encontrado", gravidade: "info" }]);
  });

  it("não afirma que o domínio não tem DKIM em nenhum campo", async () => {
    const busca = aceita(await buscarDkim("exemplo.com.br", ["a"], criarConsulta().consulta));
    const nomes = Object.keys(busca).join(" ");
    assert.doesNotMatch(nomes, /tem|possui|sem-?dkim/i);
  });

  for (const [descricao, registro, estado, achado] of /** @type {const} */ ([
    ["revogado", "v=DKIM1; p=", "revogado", "chave-revogada"],
    ["inválido", "v=DKIM1; k=rsa", "invalido", "chave-ausente"],
  ])) {
    it(`não conta um registro ${descricao} sozinho como encontrado`, async () => {
      const falsa = criarConsulta({ [nome("a")]: com([registro]) });
      const busca = aceita(await buscarDkim("exemplo.com.br", ["a", "b"], falsa.consulta));

      assert.equal(busca.situacao, "nao-encontrado");
      assert.equal(busca.seletores[0]?.estado, estado);
      assert.equal(busca.seletores[0]?.dkim?.situacao, estado);
      assert.deepEqual(
        busca.achados.map((item) => [item.codigo, item.seletor]),
        [
          [achado, "a"],
          ["nenhum-seletor-encontrado", undefined],
        ],
      );
    });
  }

  it("não conta dois registros no mesmo seletor como encontrado", async () => {
    const falsa = criarConsulta({ [nome("a")]: com([REGISTRO, REGISTRO]) });
    const busca = aceita(await buscarDkim("exemplo.com.br", ["a"], falsa.consulta));

    assert.equal(busca.situacao, "nao-encontrado");
    assert.equal(busca.seletores[0]?.estado, "multiplos");
    assert.equal(busca.achados[0]?.codigo, "registros-multiplos");
  });

  it("trata o TXT que não é DKIM como seletor ausente", async () => {
    const falsa = criarConsulta({ [nome("a")]: com(["v=spf1 -all", "qualquer texto"]) });
    const busca = aceita(await buscarDkim("exemplo.com.br", ["a"], falsa.consulta));

    assert.equal(busca.seletores[0]?.estado, "ausente");
    assert.equal(busca.seletores[0]?.dkim, undefined);
  });

  it("é indeterminado quando um seletor falhou e nenhum tem registro", async () => {
    const falsa = criarConsulta({ [nome("b")]: { ok: false, motivo: "rede fora" } });
    const busca = aceita(await buscarDkim("exemplo.com.br", ["a", "b", "c"], falsa.consulta));

    assert.equal(busca.situacao, "indeterminado");
    assert.equal(busca.incompleta, true);
    assert.equal(busca.seletores[1]?.estado, "nao-verificado");
    assert.equal(busca.seletores[1]?.motivo, "rede fora");
    assert.equal(busca.seletores[1]?.interrompido, undefined);
    assert.deepEqual(busca.achados, []);
  });

  it("continua encontrado, mas incompleta, quando um seletor falhou e outro tem registro", async () => {
    const falsa = criarConsulta({
      [nome("a")]: { ok: false, motivo: "rede fora" },
      [nome("b")]: com([REGISTRO]),
    });
    const busca = aceita(await buscarDkim("exemplo.com.br", ["a", "b"], falsa.consulta));

    assert.equal(busca.situacao, "encontrado");
    assert.equal(busca.incompleta, true);
  });
});

// ---------------------------------------------------------------------------
// FALHAS
// ---------------------------------------------------------------------------

describe("RF-06 — falhas de rede", () => {
  const falha = /** @type {const} */ ({ ok: false, motivo: "rede fora" });

  it("para de abrir consultas na terceira falha e marca os não tentados", async () => {
    const seletores = seletoresNumerados(10);
    const falsa = criarConsulta({
      [nome("s0")]: falha,
      [nome("s1")]: falha,
      [nome("s2")]: falha,
    });
    const busca = aceita(
      await buscarDkim("exemplo.com.br", seletores, falsa.consulta, { concorrencia: 1 }),
    );

    assert.equal(falsa.chamadas.length, 3);
    assert.equal(busca.situacao, "indeterminado");
    assert.equal(busca.incompleta, true);
    assert.deepEqual(
      busca.seletores.map((item) => item.interrompido === true),
      seletores.map((_, i) => i >= 3),
    );
    assert.equal(busca.seletores[0]?.motivo, "rede fora");
    assert.equal(busca.seletores[5]?.motivo, undefined);
    assert.deepEqual(busca.achados, [{ codigo: "busca-interrompida", gravidade: "aviso" }]);
  });

  it("segue até o fim com duas falhas", async () => {
    const falsa = criarConsulta({ [nome("s0")]: falha, [nome("s1")]: falha });
    const busca = aceita(
      await buscarDkim("exemplo.com.br", seletoresNumerados(10), falsa.consulta, {
        concorrencia: 1,
      }),
    );

    assert.equal(falsa.chamadas.length, 10);
    assert.equal(
      busca.seletores.some((item) => item.interrompido === true),
      false,
    );
    assert.deepEqual(busca.achados, []);
  });

  it("respeita a opção maximoFalhas", async () => {
    const falsa = criarConsulta(
      Object.fromEntries(seletoresNumerados(10).map((s) => [nome(s), falha])),
    );
    aceita(
      await buscarDkim("exemplo.com.br", seletoresNumerados(10), falsa.consulta, {
        concorrencia: 1,
        maximoFalhas: 1,
      }),
    );
    assert.equal(falsa.chamadas.length, 1);
  });

  it("não abre consulta nova depois da terceira falha, só deixa terminar as em andamento", async () => {
    // As três primeiras falham cedo e as outras demoram: quando a terceira falha chega, duas
    // consultas novas já tinham saído no lugar das duas primeiras e mais três ainda corriam.
    const seletores = seletoresNumerados(30);
    const falsa = criarConsulta(
      {
        [nome("s0")]: falha,
        [nome("s1")]: falha,
        [nome("s2")]: falha,
      },
      { atrasos: { [nome("s0")]: 2, [nome("s1")]: 4, [nome("s2")]: 6 }, atrasoPadrao: 40 },
    );
    const busca = aceita(await buscarDkim("exemplo.com.br", seletores, falsa.consulta));

    assert.deepEqual([...falsa.chamadas].sort(), seletores.slice(0, 8).map(nome).sort());
    assert.equal(busca.seletores.filter((item) => item.interrompido === true).length, 22);
    assert.equal(busca.seletores[7]?.estado, "ausente");
  });
});

// ---------------------------------------------------------------------------
// LISTA DE SELETORES E DOMÍNIO
// ---------------------------------------------------------------------------

describe("RF-06 e RF-08 — lista de seletores", () => {
  it("consulta cada nome uma vez só, mesmo com seletores repetidos ou equivalentes", async () => {
    const falsa = criarConsulta();
    const busca = aceita(
      await buscarDkim("exemplo.com.br", ["google", "GOOGLE", " google ", "s1"], falsa.consulta),
    );

    assert.deepEqual([...falsa.chamadas].sort(), [nome("google"), nome("s1")]);
    assert.equal(busca.seletores.length, 2);
  });

  it("nunca consulta um seletor inválido e o aponta nos achados", async () => {
    const falsa = criarConsulta();
    const busca = aceita(
      await buscarDkim("exemplo.com.br", ["a&b=c", "a/b", "google", ""], falsa.consulta),
    );

    assert.deepEqual(falsa.chamadas, [nome("google")]);
    assert.deepEqual(
      busca.achados.filter((item) => item.codigo === "seletor-invalido"),
      [
        { codigo: "seletor-invalido", gravidade: "info", detalhe: "caractere-invalido" },
        { codigo: "seletor-invalido", gravidade: "info", detalhe: "caractere-invalido" },
        { codigo: "seletor-invalido", gravidade: "info", detalhe: "vazio" },
      ],
    );
  });

  it("corta a lista no teto e aponta quantos ficaram de fora", async () => {
    const falsa = criarConsulta();
    const busca = aceita(
      await buscarDkim("exemplo.com.br", seletoresNumerados(100), falsa.consulta),
    );

    assert.equal(falsa.chamadas.length, MAXIMO_SELETORES);
    assert.equal(busca.seletores.length, MAXIMO_SELETORES);
    assert.deepEqual(
      busca.achados.filter((item) => item.codigo === "seletores-demais"),
      [{ codigo: "seletores-demais", gravidade: "info", detalhe: 100 - MAXIMO_SELETORES }],
    );
  });

  it("recusa a lista vazia ou só de inválidos sem consultar", async () => {
    for (const lista of [[], ["a/b"], undefined, null, "google", [42]]) {
      const falsa = criarConsulta();
      const busca = await buscarDkim("exemplo.com.br", lista, falsa.consulta);
      assert.equal(busca.ok, false);
      assert.equal(falsa.chamadas.length, 0);
    }
  });
});

describe("RF-08 — domínio", () => {
  it("normaliza o domínio antes de montar o nome", async () => {
    const falsa = criarConsulta();
    aceita(await buscarDkim("  HTTPS://Exemplo.COM.br/caminho ", ["google"], falsa.consulta));
    assert.deepEqual(falsa.chamadas, [nome("google")]);
  });

  for (const dominio of [
    "",
    "exemplo",
    "localhost",
    "192.0.2.1",
    "exemplo.com.br:8080",
    "a b.com",
  ]) {
    it(`recusa o domínio "${dominio}" sem consultar`, async () => {
      const falsa = criarConsulta();
      const busca = await buscarDkim(dominio, ["google"], falsa.consulta);
      assert.equal(busca.ok, false);
      assert.equal(typeof (!busca.ok && busca.motivo), "string");
      assert.equal(falsa.chamadas.length, 0);
    });
  }

  it("recusa o que não é texto sem consultar", async () => {
    for (const dominio of [undefined, null, 42, {}, ["exemplo.com.br"]]) {
      const falsa = criarConsulta();
      const busca = await buscarDkim(dominio, ["google"], falsa.consulta);
      assert.equal(busca.ok, false);
      assert.equal(falsa.chamadas.length, 0);
    }
  });

  it("lança TypeError se a consulta não é função (erro de programação)", async () => {
    await assert.rejects(
      buscarDkim("exemplo.com.br", ["google"], /** @type {*} */ (undefined)),
      TypeError,
    );
  });
});

// ---------------------------------------------------------------------------
// ACHADOS E RESOLVEDORES
// ---------------------------------------------------------------------------

describe("RF-07 — achados e resolvedores", () => {
  it("etiqueta os achados com o seletor e os ordena por gravidade e posição", async () => {
    const falsa = criarConsulta({
      [nome("a")]: com([`v=DKIM1; t=y; p=${chaveRsa(2048)}`]),
      [nome("b")]: com([`v=DKIM1; p=${chaveRsa(512)}`]),
      [nome("c")]: com([`v=DKIM1; k=foo; p=${chaveRsa(2048)}`]),
    });
    const busca = aceita(
      await buscarDkim("exemplo.com.br", ["a", "b", "c", "a/b"], falsa.consulta),
    );

    assert.deepEqual(
      busca.achados.map((item) => [item.codigo, item.seletor]),
      [
        ["chave-fraca", "b"],
        ["modo-de-teste", "a"],
        ["tipo-de-chave-desconhecido", "c"],
        ["seletor-invalido", undefined],
      ],
    );
    assert.deepEqual(
      busca.achados.map((item) => item.gravidade),
      ["erro", "aviso", "info", "info"],
    );
  });

  it("lista os resolvedores sem repetição e em ordem estável", async () => {
    const falsa = criarConsulta({
      [nome("a")]: ausente("google"),
      [nome("b")]: ausente("cloudflare"),
      [nome("c")]: ausente("google"),
    });
    const busca = aceita(await buscarDkim("exemplo.com.br", ["a", "b", "c"], falsa.consulta));
    assert.deepEqual(busca.resolvedores, ["cloudflare", "google"]);
  });

  it("aceita uma resposta sem a informação do resolvedor", async () => {
    const semResolvedor = { ok: true, situacao: "sem-registro", registros: [] };
    const falsa = criarConsulta({ [nome("a")]: /** @type {*} */ (semResolvedor) });
    const busca = aceita(await buscarDkim("exemplo.com.br", ["a"], falsa.consulta));
    assert.deepEqual(busca.resolvedores, []);
  });

  it("devolve o texto do registro intacto, sem interpretar marcação", async () => {
    const hostil = "v=DKIM1; k=<script>alert(1)</script>; p=<img src=x>";
    const falsa = criarConsulta({ [nome("a")]: com([hostil]) });
    const busca = aceita(await buscarDkim("exemplo.com.br", ["a"], falsa.consulta));

    const dkim = busca.seletores[0]?.dkim;
    assert.equal(dkim?.situacao === "valido" && dkim.registro, hostil);
  });
});
