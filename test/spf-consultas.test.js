/**
 * @file Testes de `lerSpfComConsultas`, a caminhada pelos `include` e `redirect` do SPF.
 *
 * A consulta é um mapa nome → resposta montado aqui, e cada teste confere também a lista de
 * nomes consultados. Todo registro é sintético (`exemplo.com.br`, `exemplo.net`). Cinco
 * famílias de caso: a contagem, os alvos que não servem, o ciclo e a falha, a macro e o teto
 * com a entrada hostil, mais o estágio que o `redirect` herda do destino.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lerSpfComConsultas, MAXIMO_FALHAS, TETO_CONSULTAS } from "../public/js/spf-consultas.js";

/** @typedef {import("../public/js/spf-consultas.js").Consulta} Consulta */
/** @typedef {import("../public/js/spf-consultas.js").CaminhadaSpf} CaminhadaSpf */
/** @typedef {Awaited<ReturnType<Consulta>>} Resposta */

// ---------------------------------------------------------------------------
// AUXILIARES
// ---------------------------------------------------------------------------

// Domínio sintético do teste: nunca é consultado de verdade, só a função falsa o recebe.
const RAIZ = "exemplo.com.br";

/**
 * @param {...string} registros - Os textos TXT do nome.
 * @returns {Resposta} Resposta de um nome que tem esses registros.
 */
const txt = (...registros) => ({
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
const FALHA = { ok: false, motivo: "A consulta falhou." };

/**
 * Monta a consulta falsa. Nome fora do mapa é domínio inexistente.
 *
 * @param {Record<string, Resposta | string>} mapa - Nome → resposta; um texto vale por
 *   `txt(texto)`.
 * @returns {{ consultar: Consulta, chamadas: string[] }} A função e a lista dos nomes
 *   consultados, na ordem.
 */
const montar = (mapa) => {
  /** @type {string[]} */
  const chamadas = [];
  /** @type {Consulta} */
  const consultar = async (nome) => {
    chamadas.push(nome);
    const resposta = mapa[nome];
    return typeof resposta === "string" ? txt(resposta) : (resposta ?? INEXISTENTE);
  };
  return { consultar, chamadas };
};

/**
 * Roda a caminhada e confere que a consulta do domínio digitado deu certo.
 *
 * @param {Record<string, Resposta | string>} mapa - Ver `montar`.
 * @returns {Promise<{ r: CaminhadaSpf, chamadas: string[] }>} O resultado e os nomes consultados.
 */
const caminhar = async (mapa) => {
  const { consultar, chamadas } = montar(mapa);
  const r = await lerSpfComConsultas(RAIZ, consultar);
  if (!r.ok) {
    throw new Error(`Esperava ok, veio: ${r.motivo}`);
  }
  return { r, chamadas };
};

/**
 * @param {CaminhadaSpf} r - Resultado da caminhada.
 * @returns {string[]} Os códigos dos achados, na ordem.
 */
const codigos = (r) => r.achados.map((achado) => achado.codigo);

/**
 * @param {CaminhadaSpf} r - Resultado da caminhada.
 * @param {string} codigo - Código do achado.
 * @returns {import("../public/js/spf.js").Achado[]} Os achados com esse código.
 */
const achadosDe = (r, codigo) => r.achados.filter((achado) => achado.codigo === codigo);

/**
 * @param {CaminhadaSpf} r - Resultado da caminhada.
 * @returns {string[]} Os tipos das consultas contadas, na ordem.
 */
const tipos = (r) => r.consultas.itens.map((item) => item.tipo);

/**
 * @param {string[]} nomes - Nomes consultados.
 * @returns {boolean} `true` se nenhum nome foi consultado duas vezes.
 */
const semRepeticao = (nomes) => new Set(nomes).size === nomes.length;

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------

describe("constantes exportadas", () => {
  it("o teto é 30 termos e 3 falhas", () => {
    assert.equal(TETO_CONSULTAS, 30);
    assert.equal(MAXIMO_FALHAS, 3);
  });
});

// ---------------------------------------------------------------------------
// DOMÍNIO DIGITADO
// ---------------------------------------------------------------------------

describe("domínio digitado", () => {
  it("domínio inválido volta ok: false e não consulta", async () => {
    const { consultar, chamadas } = montar({});
    for (const dominio of ["", "a&b=c.exemplo.net", "exemplo..net", "exemplo net"]) {
      const r = await lerSpfComConsultas(dominio, consultar);
      assert.equal(r.ok, false, dominio);
    }
    assert.deepEqual(chamadas, []);
  });

  it("o que não é texto é erro de programação", async () => {
    const { consultar } = montar({});
    await assert.rejects(lerSpfComConsultas(/** @type {any} */ (42), consultar), TypeError);
  });

  it("falha na consulta do domínio digitado volta ok: false com o motivo", async () => {
    const r = await lerSpfComConsultas(RAIZ, montar({ [RAIZ]: FALHA }).consultar);
    assert.deepEqual(r, { ok: false, motivo: "A consulta falhou." });
  });

  it("o domínio é normalizado antes de consultar", async () => {
    const { consultar, chamadas } = montar({ [RAIZ]: "v=spf1 -all" });
    const r = await lerSpfComConsultas("Exemplo.COM.br.", consultar);
    assert.equal(r.ok, true);
    assert.deepEqual(chamadas, [RAIZ]);
  });

  it("sem registro ou inexistente é ausente, sem caminhada", async () => {
    for (const resposta of [SEM_REGISTRO, INEXISTENTE]) {
      const { r, chamadas } = await caminhar({ [RAIZ]: resposta });
      assert.deepEqual(r.spf, { situacao: "ausente", estagio: "nenhum" });
      assert.equal(r.estagio, "nenhum");
      assert.equal(r.consultas.total, 0);
      assert.deepEqual(r.achados, []);
      assert.deepEqual(chamadas, [RAIZ]);
    }
  });

  it("registro múltiplo ou inválido volta sem caminhar, com total 0", async () => {
    const multiplos = await caminhar({
      [RAIZ]: txt("v=spf1 -all", "v=spf1 include:a.exemplo.net"),
    });
    assert.equal(multiplos.r.spf.situacao, "multiplos");
    assert.equal(multiplos.r.estagio, "nenhum");
    assert.equal(multiplos.r.consultas.total, 0);
    assert.deepEqual(multiplos.chamadas, [RAIZ]);

    const invalido = await caminhar({ [RAIZ]: "v=spf1 include:a.exemplo.net foo" });
    assert.equal(invalido.r.spf.situacao, "invalido");
    assert.equal(invalido.r.consultas.total, 0);
    assert.deepEqual(invalido.r.achados, [
      { codigo: "termo-invalido", gravidade: "erro", detalhe: "foo", dominio: RAIZ },
    ]);
    assert.deepEqual(invalido.chamadas, [RAIZ]);
  });

  it("o resultado de lerSpf do domínio digitado vem intacto em spf", async () => {
    const { r } = await caminhar({ [RAIZ]: "v=spf1 -all" });
    assert.deepEqual(r.spf, {
      situacao: "valido",
      registro: "v=spf1 -all",
      estagio: "rigido",
      termos: [{ texto: "-all", tipo: "all", qualificador: "-" }],
      achados: [{ codigo: "all-rigido", gravidade: "info", tag: "all" }],
    });
    assert.deepEqual(r.achados, [
      { codigo: "all-rigido", gravidade: "info", tag: "all", dominio: RAIZ },
    ]);
  });
});

// ---------------------------------------------------------------------------
// RF-04 — CONTAGEM
// ---------------------------------------------------------------------------

describe("RF-04 — contagem das consultas", () => {
  it("cada include, a, mx, ptr, exists e redirect soma 1, e só eles", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]:
        "v=spf1 ip4:203.0.113.0/24 ip6:2001:db8::/32 a mx ptr exists:teste.exemplo.net include:spf.exemplo.net exp=explica.exemplo.net redirect=_r.exemplo.net",
      "spf.exemplo.net": "v=spf1 -all",
      "_r.exemplo.net": "v=spf1 -all",
    });
    assert.deepEqual(tipos(r), ["a", "mx", "ptr", "exists", "include", "redirect"]);
    assert.equal(r.consultas.total, 6);
    assert.equal(r.consultas.limite, 10);
    assert.equal(r.consultas.passouDoLimite, false);
    assert.equal(r.consultas.incompleta, false);
    assert.equal(r.consultas.interrompida, false);
    // Só TXT é consultado: a, mx, ptr e exists contam e não resolvem nada.
    assert.deepEqual(chamadas, [RAIZ, "spf.exemplo.net", "_r.exemplo.net"]);
  });

  it("all, ip4, ip6 e exp não somam", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]: "v=spf1 ip4:203.0.113.1 ip6:2001:db8::1 exp=explica.exemplo.net -all",
    });
    assert.equal(r.consultas.total, 0);
    assert.deepEqual(r.consultas.itens, []);
    assert.deepEqual(chamadas, [RAIZ]);
  });

  it("os termos depois do all e o redirect de um registro com all não somam", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]: "v=spf1 -all a mx include:spf.exemplo.net redirect=_r.exemplo.net",
    });
    assert.equal(r.consultas.total, 0);
    assert.deepEqual(chamadas, [RAIZ]);
    assert.deepEqual(codigos(r), ["termos-apos-all", "redirect-ignorado", "all-rigido"]);
  });

  it("o redirect é contado por último, onde quer que esteja no registro", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 redirect=_r.exemplo.net a mx",
      "_r.exemplo.net": "v=spf1 -all",
    });
    assert.deepEqual(tipos(r), ["a", "mx", "redirect"]);
  });

  it("a, mx e ptr sem alvo valem o domínio atual; com alvo, guardam o alvo", async () => {
    const { r } = await caminhar({ [RAIZ]: "v=spf1 a mx:Mail.Exemplo.net ptr -all" });
    assert.deepEqual(r.consultas.itens, [
      { tipo: "a", caminho: [RAIZ] },
      { tipo: "mx", alvo: "mail.exemplo.net", caminho: [RAIZ] },
      { tipo: "ptr", caminho: [RAIZ] },
    ]);
  });

  it("include em vários níveis registra o caminho exato, em profundidade", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]: "v=spf1 include:a.exemplo.net -all",
      "a.exemplo.net": "v=spf1 include:b.exemplo.net mx -all",
      "b.exemplo.net": "v=spf1 a -all",
    });
    assert.deepEqual(r.consultas.itens, [
      { tipo: "include", alvo: "a.exemplo.net", caminho: [RAIZ] },
      { tipo: "include", alvo: "b.exemplo.net", caminho: [RAIZ, "a.exemplo.net"] },
      { tipo: "a", caminho: [RAIZ, "a.exemplo.net", "b.exemplo.net"] },
      { tipo: "mx", caminho: [RAIZ, "a.exemplo.net"] },
    ]);
    assert.equal(r.consultas.total, 4);
    assert.deepEqual(chamadas, [RAIZ, "a.exemplo.net", "b.exemplo.net"]);
  });

  it("o caminho de um item é uma cópia: mudar um não muda os outros", async () => {
    const { r } = await caminhar({ [RAIZ]: "v=spf1 a mx -all" });
    r.consultas.itens[0]?.caminho.push("outro.exemplo.net");
    assert.deepEqual(r.consultas.itens[1]?.caminho, [RAIZ]);
  });

  it("10 consultas ainda estão dentro do limite; 11 passam", async () => {
    const com = (/** @type {number} */ n) => `v=spf1 ${"a ".repeat(n)}-all`;

    const dez = (await caminhar({ [RAIZ]: com(10) })).r;
    assert.equal(dez.consultas.total, 10);
    assert.equal(dez.consultas.passouDoLimite, false);
    assert.deepEqual(achadosDe(dez, "perto-do-limite"), [
      { codigo: "perto-do-limite", gravidade: "aviso", detalhe: 10, dominio: RAIZ },
    ]);
    assert.deepEqual(achadosDe(dez, "limite-de-consultas"), []);

    const onze = (await caminhar({ [RAIZ]: com(11) })).r;
    assert.equal(onze.consultas.total, 11);
    assert.equal(onze.consultas.passouDoLimite, true);
    assert.deepEqual(achadosDe(onze, "limite-de-consultas"), [
      { codigo: "limite-de-consultas", gravidade: "erro", detalhe: 11, dominio: RAIZ },
    ]);
    assert.deepEqual(achadosDe(onze, "perto-do-limite"), []);
    // Passou de 10 e a caminhada não parou: o total é o real.
    assert.equal(onze.consultas.interrompida, false);
  });

  it("de 8 a 10 avisa que está perto; 7 não avisa", async () => {
    for (const [quantas, avisa] of /** @type {const} */ ([
      [7, false],
      [8, true],
      [9, true],
      [10, true],
    ])) {
      const { r } = await caminhar({ [RAIZ]: `v=spf1 ${"mx ".repeat(quantas)}-all` });
      assert.equal(achadosDe(r, "perto-do-limite").length === 1, avisa, String(quantas));
    }
  });

  it("os include contam nos níveis de baixo e somam ao limite", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:a.exemplo.net include:b.exemplo.net -all",
      "a.exemplo.net": `v=spf1 ${"a ".repeat(5)}-all`,
      "b.exemplo.net": `v=spf1 ${"mx ".repeat(5)}-all`,
    });
    assert.equal(r.consultas.total, 12);
    assert.equal(r.consultas.passouDoLimite, true);
  });

  it("o diamante consulta uma vez e conta de novo os termos dele", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]: "v=spf1 include:b.exemplo.net include:c.exemplo.net -all",
      "b.exemplo.net": "v=spf1 include:d.exemplo.net -all",
      "c.exemplo.net": "v=spf1 include:d.exemplo.net -all",
      "d.exemplo.net": "v=spf1 a -all",
    });
    assert.equal(r.consultas.total, 6);
    assert.deepEqual(chamadas, [RAIZ, "b.exemplo.net", "d.exemplo.net", "c.exemplo.net"]);
    assert.deepEqual(codigos(r), ["all-rigido"]);
  });

  it("os resolvedores que responderam vêm sem repetição, na ordem", async () => {
    const google = (/** @type {string} */ registro) => ({ ...txt(registro), resolvedor: "google" });
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:a.exemplo.net include:b.exemplo.net include:c.exemplo.net -all",
      "a.exemplo.net": "v=spf1 -all",
      "b.exemplo.net": google("v=spf1 -all"),
      "c.exemplo.net": "v=spf1 -all",
    });
    assert.deepEqual(r.resolvedores, ["cloudflare", "google"]);
  });
});

// ---------------------------------------------------------------------------
// RF-04 — ALVOS QUE NÃO SERVEM
// ---------------------------------------------------------------------------

describe("RF-04 — alvos sem registro, com vários ou inválidos", () => {
  it("include e redirect sem registro são erro, com o domínio do alvo", async () => {
    const include = (await caminhar({ [RAIZ]: "v=spf1 include:morto.exemplo.net -all" })).r;
    assert.deepEqual(achadosDe(include, "include-sem-registro"), [
      {
        codigo: "include-sem-registro",
        gravidade: "erro",
        tag: "include",
        dominio: "morto.exemplo.net",
      },
    ]);

    const redirect = (await caminhar({ [RAIZ]: "v=spf1 redirect=morto.exemplo.net" })).r;
    assert.deepEqual(achadosDe(redirect, "redirect-sem-registro"), [
      {
        codigo: "redirect-sem-registro",
        gravidade: "erro",
        tag: "redirect",
        dominio: "morto.exemplo.net",
      },
    ]);
  });

  it("um TXT que existe mas não é SPF também é alvo sem registro", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:outro.exemplo.net -all",
      "outro.exemplo.net": "google-site-verification=abc",
    });
    assert.equal(achadosDe(r, "include-sem-registro").length, 1);
  });

  it("alvo com vários registros SPF é erro", async () => {
    const include = (
      await caminhar({
        [RAIZ]: "v=spf1 include:dobro.exemplo.net -all",
        "dobro.exemplo.net": txt("v=spf1 -all", "v=spf1 ~all"),
      })
    ).r;
    assert.equal(
      achadosDe(include, "include-com-varios-registros")[0]?.dominio,
      "dobro.exemplo.net",
    );

    const redirect = (
      await caminhar({
        [RAIZ]: "v=spf1 redirect=dobro.exemplo.net",
        "dobro.exemplo.net": txt("v=spf1 -all", "v=spf1 ~all"),
      })
    ).r;
    assert.equal(achadosDe(redirect, "redirect-com-varios-registros").length, 1);
  });

  it("alvo com registro inválido é erro, e o termo torto aparece com o domínio dele", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:torto.exemplo.net -all",
      "torto.exemplo.net": "v=spf1 ip4:300.1.1.1 -all",
    });
    assert.deepEqual(achadosDe(r, "include-invalido"), [
      {
        codigo: "include-invalido",
        gravidade: "erro",
        tag: "include",
        dominio: "torto.exemplo.net",
      },
    ]);
    assert.deepEqual(achadosDe(r, "termo-invalido"), [
      {
        codigo: "termo-invalido",
        gravidade: "erro",
        detalhe: "ip4:300.1.1.1",
        dominio: "torto.exemplo.net",
      },
    ]);
    const redirect = (
      await caminhar({
        [RAIZ]: "v=spf1 redirect=torto.exemplo.net",
        "torto.exemplo.net": "v=spf1 foo",
      })
    ).r;
    assert.equal(achadosDe(redirect, "redirect-invalido").length, 1);
  });

  it("até 2 consultas vazias não geram achado; 3 geram", async () => {
    const mortos = (/** @type {number} */ n) =>
      Array.from({ length: n }, (_, i) => `include:m${i}.exemplo.net`).join(" ");
    for (const [quantos, esperado] of /** @type {const} */ ([
      [2, false],
      [3, true],
    ])) {
      const { r } = await caminhar({
        [RAIZ]: `v=spf1 ${mortos(quantos)} -all`,
        "m0.exemplo.net": SEM_REGISTRO,
        "m1.exemplo.net": INEXISTENTE,
        "m2.exemplo.net": SEM_REGISTRO,
      });
      assert.equal(r.consultas.total, quantos);
      assert.equal(achadosDe(r, "include-sem-registro").length, quantos);
      assert.deepEqual(
        achadosDe(r, "consultas-vazias"),
        esperado
          ? [{ codigo: "consultas-vazias", gravidade: "erro", detalhe: 3, dominio: RAIZ }]
          : [],
      );
    }
  });

  it("TXT que existe sem SPF não é consulta vazia", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:a.exemplo.net include:b.exemplo.net include:c.exemplo.net -all",
      "a.exemplo.net": "verificacao=1",
      "b.exemplo.net": "verificacao=2",
      "c.exemplo.net": "verificacao=3",
    });
    assert.equal(achadosDe(r, "include-sem-registro").length, 3);
    assert.deepEqual(achadosDe(r, "consultas-vazias"), []);
  });

  it("os achados dos registros incluídos entram só pela lista permitida, com o domínio", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:prov.exemplo.net -all",
      "prov.exemplo.net": "v=spf1 ptr ip4:203.0.113.1 ip4:203.0.113.1 ~all",
    });
    // `ptr-em-uso` vale; `all-suave`, `termo-repetido` e o resto são ruído do provedor.
    assert.deepEqual(codigos(r), ["ptr-em-uso", "all-rigido"]);
    assert.equal(achadosDe(r, "ptr-em-uso")[0]?.dominio, "prov.exemplo.net");
  });

  it("um +all num registro incluído é erro, e o -all dele não aparece", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:aberto.exemplo.net -all",
      "aberto.exemplo.net": "v=spf1 +all",
    });
    assert.deepEqual(achadosDe(r, "all-libera-tudo"), [
      { codigo: "all-libera-tudo", gravidade: "erro", tag: "all", dominio: "aberto.exemplo.net" },
    ]);
  });

  it("cada código fora da lista permitida some, e cada um da lista aparece", async () => {
    // Um registro incluído que dispara quase tudo o que `lerSpf` sabe dizer.
    const incluido =
      "V=SPF1 ptr ip4:203.0.113.1 ip4:203.0.113.1 -all a redirect=_r.exemplo.net" + " ".repeat(500);
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:prov.exemplo.net ~all",
      "prov.exemplo.net": incluido,
    });
    assert.deepEqual(
      r.achados.filter((a) => a.dominio === "prov.exemplo.net").map((a) => a.codigo),
      ["ptr-em-uso"],
    );

    const grande = (
      await caminhar({
        [RAIZ]: "v=spf1 include:grande.exemplo.net -all",
        "grande.exemplo.net": `v=spf1 ${"a ".repeat(2100)}-all`,
      })
    ).r;
    assert.deepEqual(
      grande.achados.filter((a) => a.dominio === "grande.exemplo.net").map((a) => a.codigo),
      ["registro-grande-demais", "include-invalido"],
    );

    const repetido = (
      await caminhar({
        [RAIZ]: "v=spf1 include:rep.exemplo.net -all",
        "rep.exemplo.net": "v=spf1 redirect=a.exemplo.net redirect=b.exemplo.net",
      })
    ).r;
    assert.equal(achadosDe(repetido, "modificador-repetido")[0]?.dominio, "rep.exemplo.net");
  });

  it("o achado de um registro que aparece em dois ramos sai uma vez", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:b.exemplo.net include:c.exemplo.net -all",
      "b.exemplo.net": "v=spf1 include:d.exemplo.net -all",
      "c.exemplo.net": "v=spf1 include:d.exemplo.net -all",
      "d.exemplo.net": "v=spf1 ptr -all",
    });
    assert.equal(achadosDe(r, "ptr-em-uso").length, 1);
  });

  it("os achados do registro digitado ficam todos, e os erros vêm primeiro", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 ptr include:morto.exemplo.net ~all ip4:203.0.113.1",
    });
    assert.deepEqual(codigos(r), [
      "include-sem-registro",
      "ptr-em-uso",
      "termos-apos-all",
      "all-suave",
    ]);
    assert.ok(r.achados.every((achado) => achado.dominio !== undefined));
  });
});

// ---------------------------------------------------------------------------
// RF-04 — CICLO E FALHA
// ---------------------------------------------------------------------------

describe("RF-04 — ciclo e falha de rede", () => {
  it("A → B → A não consulta de novo e segue o resto", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]: "v=spf1 include:b.exemplo.net a -all",
      "b.exemplo.net": `v=spf1 include:${RAIZ} -all`,
    });
    assert.deepEqual(chamadas, [RAIZ, "b.exemplo.net"]);
    assert.deepEqual(achadosDe(r, "ciclo"), [
      { codigo: "ciclo", gravidade: "erro", tag: "include", dominio: "b.exemplo.net" },
    ]);
    // O include que fecha o ciclo e o `a` depois dele são contados.
    assert.deepEqual(tipos(r), ["include", "include", "a"]);
  });

  it("um registro que inclui o próprio domínio é ciclo", async () => {
    const { r, chamadas } = await caminhar({ [RAIZ]: `v=spf1 include:${RAIZ} -all` });
    assert.deepEqual(chamadas, [RAIZ]);
    assert.equal(r.consultas.total, 1);
    assert.deepEqual(achadosDe(r, "ciclo"), [
      { codigo: "ciclo", gravidade: "erro", tag: "include", dominio: RAIZ },
    ]);
  });

  it("o mesmo alvo em ramos diferentes (diamante) não é ciclo", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:b.exemplo.net include:b.exemplo.net -all",
      "b.exemplo.net": "v=spf1 -all",
    });
    assert.deepEqual(achadosDe(r, "ciclo"), []);
    assert.equal(r.consultas.total, 2);
  });

  it("falha no meio: o resto continua, a contagem fica incompleta", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]: "v=spf1 include:a.exemplo.net include:b.exemplo.net include:c.exemplo.net -all",
      "a.exemplo.net": "v=spf1 -all",
      "b.exemplo.net": FALHA,
      "c.exemplo.net": "v=spf1 mx -all",
    });
    assert.deepEqual(chamadas, [RAIZ, "a.exemplo.net", "b.exemplo.net", "c.exemplo.net"]);
    assert.equal(r.consultas.total, 4);
    assert.equal(r.consultas.incompleta, true);
    assert.equal(r.consultas.interrompida, false);
    assert.deepEqual(achadosDe(r, "consulta-falhou"), [
      { codigo: "consulta-falhou", gravidade: "aviso", tag: "include", dominio: "b.exemplo.net" },
    ]);
    assert.equal(r.estagio, "rigido");
  });

  it("a falha de um nome visto de novo não é consultada nem contada outra vez", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]: "v=spf1 include:b.exemplo.net include:b.exemplo.net include:b.exemplo.net -all",
      "b.exemplo.net": FALHA,
    });
    assert.deepEqual(chamadas, [RAIZ, "b.exemplo.net"]);
    assert.equal(r.consultas.interrompida, false);
    assert.equal(achadosDe(r, "consulta-falhou").length, 1);
  });

  it("três falhas encerram a caminhada", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]:
        "v=spf1 include:f1.exemplo.net include:f2.exemplo.net include:f3.exemplo.net include:f4.exemplo.net -all",
      "f1.exemplo.net": FALHA,
      "f2.exemplo.net": FALHA,
      "f3.exemplo.net": FALHA,
      "f4.exemplo.net": "v=spf1 -all",
    });
    assert.deepEqual(chamadas, [RAIZ, "f1.exemplo.net", "f2.exemplo.net", "f3.exemplo.net"]);
    assert.equal(r.consultas.total, 3);
    assert.equal(r.consultas.interrompida, true);
    assert.equal(r.consultas.incompleta, true);
    assert.equal(achadosDe(r, "consulta-falhou").length, 3);
    assert.deepEqual(achadosDe(r, "caminhada-interrompida"), [
      { codigo: "caminhada-interrompida", gravidade: "aviso", detalhe: 3, dominio: RAIZ },
    ]);
  });

  it("duas falhas não encerram", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:f1.exemplo.net include:f2.exemplo.net include:ok.exemplo.net -all",
      "f1.exemplo.net": FALHA,
      "f2.exemplo.net": FALHA,
      "ok.exemplo.net": "v=spf1 -all",
    });
    assert.equal(r.consultas.interrompida, false);
    assert.equal(r.consultas.total, 3);
  });
});

// ---------------------------------------------------------------------------
// RF-04 — MACRO
// ---------------------------------------------------------------------------

describe("RF-04 — macro", () => {
  it("conta 1, não é seguida e deixa a contagem incompleta", async () => {
    const { r, chamadas } = await caminhar({
      [RAIZ]: "v=spf1 include:%{d}._spf.exemplo.net a -all",
    });
    assert.deepEqual(chamadas, [RAIZ]);
    assert.equal(r.consultas.total, 2);
    assert.equal(r.consultas.incompleta, true);
    assert.equal(r.consultas.interrompida, false);
    assert.deepEqual(r.consultas.itens[0], { tipo: "include", macro: true, caminho: [RAIZ] });
    assert.deepEqual(achadosDe(r, "macro-nao-avaliada"), [
      { codigo: "macro-nao-avaliada", gravidade: "info", tag: "include", dominio: RAIZ },
    ]);
  });

  it("macro num redirect deixa o estágio indeterminado", async () => {
    const { r, chamadas } = await caminhar({ [RAIZ]: "v=spf1 redirect=%{d}._spf.exemplo.net" });
    assert.deepEqual(chamadas, [RAIZ]);
    assert.equal(r.estagio, "indeterminado");
    assert.equal(r.consultas.incompleta, true);
  });

  it("macro em exists conta e não é seguida, sem tornar a contagem incompleta", async () => {
    const { r, chamadas } = await caminhar({ [RAIZ]: "v=spf1 exists:%{i}._rbl.exemplo.net -all" });
    assert.deepEqual(chamadas, [RAIZ]);
    assert.equal(r.consultas.total, 1);
    assert.equal(r.consultas.incompleta, false);
    assert.equal(r.consultas.itens[0]?.macro, true);
  });

  it("macro mal formada invalida o registro, sem caminhada", async () => {
    const { r, chamadas } = await caminhar({ [RAIZ]: "v=spf1 include:%{x}.exemplo.net -all" });
    assert.equal(r.spf.situacao, "invalido");
    assert.equal(r.consultas.total, 0);
    assert.deepEqual(chamadas, [RAIZ]);
  });
});

// ---------------------------------------------------------------------------
// RF-06 — TETO E ENTRADA HOSTIL
// ---------------------------------------------------------------------------

describe("RF-06 — teto e entrada hostil", () => {
  it("um registro que inclui 100 alvos para em 30 termos", async () => {
    const mapa = /** @type {Record<string, string>} */ ({});
    const includes = Array.from({ length: 100 }, (_, i) => {
      mapa[`i${i}.exemplo.net`] = "v=spf1 -all";
      return `include:i${i}.exemplo.net`;
    });
    mapa[RAIZ] = `v=spf1 ${includes.join(" ")} -all`;
    const { r, chamadas } = await caminhar(mapa);
    assert.equal(r.consultas.total, TETO_CONSULTAS);
    assert.equal(r.consultas.itens.length, TETO_CONSULTAS);
    assert.equal(r.consultas.interrompida, true);
    assert.equal(r.consultas.incompleta, true);
    assert.equal(r.consultas.passouDoLimite, true);
    assert.equal(chamadas.length, TETO_CONSULTAS + 1);
    assert.ok(semRepeticao(chamadas));
    assert.deepEqual(achadosDe(r, "caminhada-interrompida"), [
      { codigo: "caminhada-interrompida", gravidade: "aviso", detalhe: 30, dominio: RAIZ },
    ]);
    assert.equal(achadosDe(r, "limite-de-consultas")[0]?.detalhe, 30);
  });

  it("exatamente 30 termos não é interrompido", async () => {
    const { r } = await caminhar({ [RAIZ]: `v=spf1 ${"a ".repeat(30)}-all` });
    assert.equal(r.consultas.total, 30);
    assert.equal(r.consultas.interrompida, false);
    assert.equal(r.consultas.incompleta, false);
    assert.deepEqual(achadosDe(r, "caminhada-interrompida"), []);
  });

  it("uma cadeia de 40 include para em 30", async () => {
    const mapa = /** @type {Record<string, string>} */ ({
      [RAIZ]: "v=spf1 include:n1.exemplo.net -all",
    });
    for (let i = 1; i <= 40; i += 1) {
      mapa[`n${i}.exemplo.net`] = `v=spf1 include:n${i + 1}.exemplo.net -all`;
    }
    const { r, chamadas } = await caminhar(mapa);
    assert.equal(r.consultas.total, TETO_CONSULTAS);
    assert.equal(r.consultas.interrompida, true);
    assert.ok(chamadas.length <= TETO_CONSULTAS + 1);
    assert.ok(semRepeticao(chamadas));
    const fundo = r.consultas.itens.at(-1)?.caminho.length ?? 0;
    assert.ok(fundo <= TETO_CONSULTAS);
  });

  it("diamantes que dariam milhares de contagens param em 30, sem repetir consulta", async () => {
    const mapa = /** @type {Record<string, string>} */ ({
      [RAIZ]: "v=spf1 include:l1a.exemplo.net include:l1b.exemplo.net -all",
    });
    for (let nivel = 1; nivel <= 20; nivel += 1) {
      for (const lado of ["a", "b"]) {
        mapa[`l${nivel}${lado}.exemplo.net`] =
          `v=spf1 include:l${nivel + 1}a.exemplo.net include:l${nivel + 1}b.exemplo.net -all`;
      }
    }
    const { r, chamadas } = await caminhar(mapa);
    assert.equal(r.consultas.total, TETO_CONSULTAS);
    assert.equal(r.consultas.interrompida, true);
    assert.ok(semRepeticao(chamadas));
  });

  it("alvo com caracteres de URL nunca chega à função de consulta", async () => {
    const raiz = await caminhar({ [RAIZ]: "v=spf1 include:a&b=c.exemplo.net -all" });
    assert.deepEqual(raiz.chamadas, [RAIZ]);
    assert.equal(raiz.r.spf.situacao, "invalido");

    for (const alvo of [
      "a&b=c.exemplo.net",
      "x?y.exemplo.net",
      "x/../y.exemplo.net",
      "x#y.exemplo.net",
    ]) {
      const { r, chamadas } = await caminhar({
        [RAIZ]: "v=spf1 include:ok.exemplo.net -all",
        "ok.exemplo.net": `v=spf1 include:${alvo} -all`,
      });
      assert.deepEqual(chamadas, [RAIZ, "ok.exemplo.net"], alvo);
      assert.equal(achadosDe(r, "include-invalido").length, 1, alvo);
    }
  });

  it("marcação no registro e nos alvos fica como texto e não gera consulta", async () => {
    const registro = "v=spf1 include:<script>alert(1)</script>.exemplo.net -all";
    const { r, chamadas } = await caminhar({ [RAIZ]: registro });
    assert.equal(r.spf.situacao === "invalido" && r.spf.registro, registro);
    assert.deepEqual(chamadas, [RAIZ]);

    const incluido = await caminhar({
      [RAIZ]: "v=spf1 include:ok.exemplo.net -all",
      "ok.exemplo.net": "v=spf1 <img src=x onerror=1> -all",
    });
    assert.equal(achadosDe(incluido.r, "termo-invalido")[0]?.detalhe, "<img");
    assert.deepEqual(incluido.chamadas, [RAIZ, "ok.exemplo.net"]);
  });

  it("uma consulta que devolve lixo no lugar do registro não lança", async () => {
    /** @type {Consulta} */
    const consultar = async (nome) =>
      nome === RAIZ
        ? txt("v=spf1 include:lixo.exemplo.net -all")
        : /** @type {any} */ ({ ok: true, situacao: "encontrado", registros: [42, null, {}] });
    const r = await lerSpfComConsultas(RAIZ, consultar);
    assert.equal(r.ok && achadosDe(r, "include-sem-registro").length, 1);
  });
});

// ---------------------------------------------------------------------------
// RF-03 — ESTÁGIO POR REDIRECT
// ---------------------------------------------------------------------------

describe("RF-03 — o estágio de um registro com redirect é o do destino", () => {
  it("destino rígido, suave e permissivo", async () => {
    for (const [destino, esperado] of /** @type {const} */ ([
      ["v=spf1 -all", "rigido"],
      ["v=spf1 ~all", "suave"],
      ["v=spf1 ?all", "permissivo"],
      ["v=spf1 ip4:203.0.113.1", "permissivo"],
    ])) {
      const { r } = await caminhar({
        [RAIZ]: "v=spf1 redirect=_r.exemplo.net",
        "_r.exemplo.net": destino,
      });
      assert.equal(r.spf.estagio, "redirecionado");
      assert.equal(r.estagio, esperado, destino);
    }
  });

  it("redirect encadeado vale o do último destino", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 redirect=b.exemplo.net",
      "b.exemplo.net": "v=spf1 redirect=c.exemplo.net",
      "c.exemplo.net": "v=spf1 -all",
    });
    assert.equal(r.estagio, "rigido");
    assert.equal(r.consultas.total, 2);
  });

  it("destino inválido, ausente ou em ciclo não tem estágio", async () => {
    const invalido = await caminhar({
      [RAIZ]: "v=spf1 redirect=b.exemplo.net",
      "b.exemplo.net": "v=spf1 foo",
    });
    assert.equal(invalido.r.estagio, "nenhum");

    const ausente = await caminhar({ [RAIZ]: "v=spf1 redirect=b.exemplo.net" });
    assert.equal(ausente.r.estagio, "nenhum");

    const ciclo = await caminhar({
      [RAIZ]: "v=spf1 redirect=b.exemplo.net",
      "b.exemplo.net": `v=spf1 redirect=${RAIZ}`,
    });
    assert.equal(ciclo.r.estagio, "nenhum");
    assert.equal(achadosDe(ciclo.r, "ciclo").length, 1);
  });

  it("destino que não pôde ser verificado é indeterminado", async () => {
    const falha = await caminhar({
      [RAIZ]: "v=spf1 redirect=b.exemplo.net",
      "b.exemplo.net": FALHA,
    });
    assert.equal(falha.r.estagio, "indeterminado");
    assert.equal(falha.r.consultas.incompleta, true);

    // O teto é atingido antes de chegar ao redirect, que é o último a ser avaliado.
    const teto = await caminhar({
      [RAIZ]: `v=spf1 ${"include:x.exemplo.net ".repeat(30)}redirect=b.exemplo.net`,
      "x.exemplo.net": "v=spf1 -all",
      "b.exemplo.net": "v=spf1 -all",
    });
    assert.equal(teto.r.consultas.interrompida, true);
    assert.equal(teto.r.estagio, "indeterminado");
    assert.deepEqual(teto.chamadas, [RAIZ, "x.exemplo.net"]);
  });

  it("sem redirect, o estágio é o do próprio all, mesmo passando do limite", async () => {
    const { r } = await caminhar({ [RAIZ]: `v=spf1 ${"a ".repeat(11)}-all` });
    assert.equal(r.estagio, "rigido");
    assert.equal(r.consultas.passouDoLimite, true);
  });

  it("o redirect de um registro incluído não muda o estágio do domínio digitado", async () => {
    const { r } = await caminhar({
      [RAIZ]: "v=spf1 include:b.exemplo.net ~all",
      "b.exemplo.net": "v=spf1 redirect=c.exemplo.net",
      "c.exemplo.net": "v=spf1 -all",
    });
    assert.equal(r.estagio, "suave");
    assert.equal(r.consultas.total, 2);
  });
});
