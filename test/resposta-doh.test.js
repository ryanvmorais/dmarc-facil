/**
 * @file Testes de `lerResposta` e `textoDoRegistro`, a leitura do JSON dos resolvedores DoH.
 *
 * Toda resposta é montada aqui, no formato de cada resolvedor, com registros sintéticos.
 * Três famílias de caso: as diferenças entre Cloudflare e Google (aspas, pedaços) têm que
 * sumir; as situações do DNS (encontrado, sem registro, inexistente) têm que ser distintas;
 * e a entrada hostil ou torta tem que virar falha ou ser descartada, nunca exceção.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lerResposta,
  MAXIMO_REGISTROS,
  MAXIMO_TEXTO,
  textoDoRegistro,
} from "../public/js/resposta-doh.js";

// ---------------------------------------------------------------------------
// RESPOSTAS MONTADAS
// ---------------------------------------------------------------------------

/**
 * Monta um item TXT do `Answer`.
 *
 * @param {string} data - Campo `data`, no formato do resolvedor.
 * @returns {{ name: string, type: number, TTL: number, data: string }} Item do `Answer`.
 */
const txt = (data) => ({ name: "_dmarc.exemplo.com.br", type: 16, TTL: 300, data });

/**
 * Monta uma resposta com `Status` 0 e os itens dados.
 *
 * @param {unknown[]} answer - Itens do `Answer`.
 * @returns {{ Status: number, Answer: unknown[] }} Resposta de um resolvedor.
 */
const comResposta = (answer) => ({ Status: 0, Answer: answer });

// ---------------------------------------------------------------------------
// TEXTO DO REGISTRO
// ---------------------------------------------------------------------------

describe("textoDoRegistro", () => {
  it("Google: devolve o texto como veio", () => {
    assert.equal(textoDoRegistro("v=DMARC1; p=none", "google"), "v=DMARC1; p=none");
  });

  it("Cloudflare: tira as aspas de um pedaço só", () => {
    assert.equal(textoDoRegistro('"v=DMARC1; p=none"', "cloudflare"), "v=DMARC1; p=none");
  });

  it("Cloudflare: junta os pedaços sem separador", () => {
    assert.equal(
      textoDoRegistro('"v=DKIM1; k=rsa; p=AAAA" "BBBB"', "cloudflare"),
      "v=DKIM1; k=rsa; p=AAAABBBB",
    );
  });

  it("Cloudflare e Google dão o mesmo texto para o mesmo TXT longo", () => {
    assert.equal(
      textoDoRegistro('"parte um, " "parte dois"', "cloudflare"),
      textoDoRegistro("parte um, parte dois", "google"),
    );
  });

  it("Cloudflare: preserva espaços e escapes dentro do pedaço", () => {
    assert.equal(textoDoRegistro('"a  b \\"c\\""', "cloudflare"), 'a  b \\"c\\"');
  });

  it("Cloudflare: texto sem a forma esperada volta como veio", () => {
    assert.equal(textoDoRegistro("v=spf1 -all", "cloudflare"), "v=spf1 -all");
    assert.equal(textoDoRegistro('"a" lixo', "cloudflare"), '"a" lixo');
    assert.equal(textoDoRegistro('"a""b"', "cloudflare"), '"a""b"');
  });

  it("Google: um texto que começa e termina com aspas não é mexido", () => {
    assert.equal(textoDoRegistro('"entre aspas"', "google"), '"entre aspas"');
  });
});

// ---------------------------------------------------------------------------
// SITUAÇÕES
// ---------------------------------------------------------------------------

describe("lerResposta: situações", () => {
  it("Status 0 com TXT é encontrado (formato Cloudflare)", () => {
    assert.deepEqual(lerResposta(comResposta([txt('"v=DMARC1; p=none"')]), "cloudflare"), {
      ok: true,
      situacao: "encontrado",
      registros: ["v=DMARC1; p=none"],
    });
  });

  it("Status 0 com TXT é encontrado (formato Google, nome com ponto final)", () => {
    const item = { ...txt("v=DMARC1; p=none"), name: "_dmarc.exemplo.com.br." };
    assert.deepEqual(lerResposta(comResposta([item]), "google"), {
      ok: true,
      situacao: "encontrado",
      registros: ["v=DMARC1; p=none"],
    });
  });

  it("os dois formatos produzem o mesmo resultado", () => {
    const cloudflare = lerResposta(comResposta([txt('"v=spf1 " "-all"')]), "cloudflare");
    const google = lerResposta(comResposta([txt("v=spf1 -all")]), "google");
    assert.deepEqual(cloudflare, google);
  });

  it("mantém todos os TXT, na ordem", () => {
    const resultado = lerResposta(comResposta([txt("um"), txt("dois")]), "google");
    assert.deepEqual(resultado, { ok: true, situacao: "encontrado", registros: ["um", "dois"] });
  });

  it("ignora o CNAME misturado com o TXT (seletor DKIM)", () => {
    const cname = {
      name: "s1._domainkey.exemplo.com.br",
      type: 5,
      TTL: 300,
      data: "s1.provedor.example.",
    };
    const resposta = comResposta([cname, txt('"v=DKIM1; k=rsa; p=AAAA"')]);
    assert.deepEqual(lerResposta(resposta, "cloudflare"), {
      ok: true,
      situacao: "encontrado",
      registros: ["v=DKIM1; k=rsa; p=AAAA"],
    });
  });

  it("Status 0 sem Answer é sem-registro", () => {
    assert.deepEqual(lerResposta({ Status: 0 }, "google"), {
      ok: true,
      situacao: "sem-registro",
      registros: [],
    });
  });

  it("Status 0 com Answer vazio ou só de outros tipos é sem-registro", () => {
    const soCname = comResposta([{ name: "x.exemplo.com.br", type: 5, data: "y.exemplo.com.br." }]);
    for (const resposta of [comResposta([]), soCname]) {
      assert.deepEqual(lerResposta(resposta, "cloudflare"), {
        ok: true,
        situacao: "sem-registro",
        registros: [],
      });
    }
  });

  it("Status 3 é inexistente, com ou sem Answer", () => {
    for (const resposta of [{ Status: 3 }, { Status: 3, Answer: [txt("ignorado")] }]) {
      assert.deepEqual(lerResposta(resposta, "google"), {
        ok: true,
        situacao: "inexistente",
        registros: [],
      });
    }
  });

  it("Status de falha do resolvedor (1, 2, 4 e 5) é falha", () => {
    for (const status of [1, 2, 4, 5]) {
      const resultado = lerResposta({ Status: status }, "cloudflare");
      assert.equal(resultado.ok, false);
    }
  });
});

// ---------------------------------------------------------------------------
// ENTRADA TORTA OU HOSTIL
// ---------------------------------------------------------------------------

describe("lerResposta: entrada torta ou hostil", () => {
  it("o que não é objeto é falha", () => {
    for (const json of [null, undefined, 42, "texto", true, [], [{ Status: 0 }]]) {
      assert.equal(lerResposta(json, "google").ok, false);
    }
  });

  it("Status ausente, texto ou fracionário é falha", () => {
    for (const json of [{}, { Status: "0" }, { Status: 0.5 }, { Status: null }, { Answer: [] }]) {
      assert.equal(lerResposta(json, "google").ok, false);
    }
  });

  it("Answer que não é lista é falha", () => {
    for (const answer of [null, "texto", 7, { type: 16, data: "x" }]) {
      assert.equal(lerResposta({ Status: 0, Answer: answer }, "google").ok, false);
    }
  });

  it("descarta o item malformado e mantém os demais", () => {
    const resposta = comResposta([
      null,
      "texto",
      42,
      { type: 16 },
      { type: 16, data: 7 },
      { type: "16", data: "tipo como texto" },
      txt("bom"),
    ]);
    assert.deepEqual(lerResposta(resposta, "google"), {
      ok: true,
      situacao: "encontrado",
      registros: ["bom"],
    });
  });

  it("guarda no máximo 50 registros", () => {
    const itens = Array.from({ length: MAXIMO_REGISTROS + 10 }, (_, i) => txt(`registro ${i}`));
    const resultado = lerResposta(comResposta(itens), "google");
    assert.equal(resultado.ok, true);
    if (resultado.ok) {
      assert.equal(resultado.registros.length, MAXIMO_REGISTROS);
      assert.equal(resultado.registros[0], "registro 0");
    }
  });

  it("descarta o registro acima do limite de texto e mantém o resto", () => {
    const grande = "a".repeat(MAXIMO_TEXTO + 1);
    const noLimite = "b".repeat(MAXIMO_TEXTO);
    const resultado = lerResposta(comResposta([txt(grande), txt(noLimite)]), "google");
    assert.deepEqual(resultado, { ok: true, situacao: "encontrado", registros: [noLimite] });
  });

  it("descarta o registro enorme antes de processar o texto bruto", () => {
    const enorme = `"${"a".repeat(100_000)}"`;
    const resultado = lerResposta(comResposta([txt(enorme)]), "cloudflare");
    assert.deepEqual(resultado, { ok: true, situacao: "sem-registro", registros: [] });
  });

  it("devolve marcação HTML intacta, como texto", () => {
    const hostil = "<script>alert(1)</script><img src=x onerror=alert(2)>";
    const resultado = lerResposta(comResposta([txt(`"${hostil}"`)]), "cloudflare");
    assert.deepEqual(resultado, { ok: true, situacao: "encontrado", registros: [hostil] });
  });
});
