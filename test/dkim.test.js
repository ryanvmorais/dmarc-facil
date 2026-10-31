/**
 * @file Testes de `lerDkim`, que escolhe o registro DKIM entre os TXT de um seletor, lê as tags,
 * mede a chave e aponta os achados.
 *
 * Todo registro é montado aqui, com chaves sintéticas (`ajudas/chave-sintetica.js`): nenhum
 * registro de domínio ou provedor real. O último grupo alimenta o módulo com entrada hostil.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lerDkim, MAXIMO_TAGS } from "../public/js/dkim.js";
import { MAXIMO_TEXTO } from "../public/js/resposta-doh.js";
import { chaveEd25519, chaveRsa, emBase64 } from "./ajudas/chave-sintetica.js";

const CHAVE = chaveRsa(2048);

/**
 * @param {string} [extra] - Tags a mais, já com o `;` na frente.
 * @returns {string} Um registro DKIM válido com a chave de 2048 bits.
 */
const registro = (extra = "") => `v=DKIM1; k=rsa; p=${CHAVE}${extra}`;

/**
 * @param {unknown} resultado - Resultado de `lerDkim`.
 * @returns {string[]} Os códigos dos achados, na ordem.
 */
const codigos = (resultado) => {
  const achados = /** @type {{ achados?: Array<{ codigo: string }> }} */ (resultado).achados;
  return (achados ?? []).map((achado) => achado.codigo);
};

// ---------------------------------------------------------------------------
// ESCOLHA DO REGISTRO
// ---------------------------------------------------------------------------

describe("RF-03 — escolher o registro DKIM entre os TXT", () => {
  it("lê o registro e ignora os TXT alheios", () => {
    const resultado = lerDkim(["google-site-verification=abc123", "v=spf1 -all", registro()]);
    assert.equal(resultado.situacao, "valido");
    assert.equal(resultado.situacao === "valido" && resultado.registro, registro());
  });

  it("devolve o resultado completo de um registro válido", () => {
    assert.deepEqual(lerDkim([registro()]), {
      situacao: "valido",
      registro: registro(),
      versao: "DKIM1",
      tipo: "rsa",
      hashes: null,
      servicos: ["*"],
      flags: [],
      tamanhoBits: 2048,
      achados: [],
    });
  });

  for (const [descricao, textos] of /** @type {Array<[string, unknown]>} */ ([
    ["lista vazia", []],
    ["texto vazio", [""]],
    ["só TXT alheios", ["v=spf1 -all", "google-site-verification=abc"]],
    ["TXT curinga qualquer", ["qualquer texto sob _domainkey"]],
    ["lista que não é lista", "v=DKIM1; p=abc"],
    ["indefinido", undefined],
    ["nulo", null],
  ])) {
    it(`devolve ausente para ${descricao}`, () => {
      assert.deepEqual(lerDkim(textos), { situacao: "ausente" });
    });
  }

  it("devolve múltiplos para dois registros, sem escolher nenhum", () => {
    assert.deepEqual(lerDkim([registro(), registro("; t=y")]), {
      situacao: "multiplos",
      quantidade: 2,
      achados: [{ codigo: "registros-multiplos", gravidade: "erro", detalhe: 2 }],
    });
  });

  it("aceita o registro sem a tag v, que é opcional na RFC", () => {
    const resultado = lerDkim([`k=rsa; p=${CHAVE}`]);
    assert.equal(resultado.situacao, "valido");
    assert.equal(resultado.situacao === "valido" && resultado.versao, "DKIM1");
  });

  it("aceita espaços em volta das tags, tag desconhecida, `;` final e `;;`", () => {
    for (const texto of [
      `v=DKIM1 ;  k = rsa ;p= ${CHAVE} ;`,
      `v=DKIM1; x=1; p=${CHAVE};;`,
      `v=DKIM1;p=${CHAVE};x=<qualquer coisa>`,
      `  v=DKIM1; p=${CHAVE}`,
    ]) {
      const resultado = lerDkim([texto]);
      assert.equal(resultado.situacao, "valido", texto);
      assert.deepEqual(codigos(resultado), [], texto);
    }
  });

  it("ignora o fragmento sem igual e o sem nome", () => {
    assert.equal(lerDkim([`v=DKIM1; solto; =valor; p=${CHAVE}`]).situacao, "valido");
  });
});

// ---------------------------------------------------------------------------
// VERSÃO, TAG REPETIDA E CHAVE AUSENTE
// ---------------------------------------------------------------------------

describe("RF-03 — registro inválido", () => {
  for (const versao of ["DKIM1.0", "DKIM2", "dkim1", "DKIM", "Dkim1"]) {
    it(`recusa a versão "${versao}"`, () => {
      assert.deepEqual(lerDkim([`v=${versao}; p=${CHAVE}`]), {
        situacao: "invalido",
        registro: `v=${versao}; p=${CHAVE}`,
        achados: [{ codigo: "versao-invalida", gravidade: "erro", tag: "v", detalhe: versao }],
      });
    });
  }

  it("recusa a tag v que não é a primeira", () => {
    const resultado = lerDkim([`k=rsa; v=DKIM1; p=${CHAVE}`]);
    assert.equal(resultado.situacao, "invalido");
    assert.deepEqual(codigos(resultado), ["versao-invalida"]);
  });

  it("recusa a tag repetida, com o nome dela", () => {
    for (const nome of ["p", "k", "v", "x"]) {
      const resultado = lerDkim([`v=DKIM1; ${nome}=a; k=rsa; p=${CHAVE}; ${nome}=b`]);
      assert.equal(resultado.situacao, "invalido", nome);
      assert.deepEqual(
        resultado.situacao === "invalido" && resultado.achados,
        [{ codigo: "tag-repetida", gravidade: "erro", tag: nome }],
        nome,
      );
    }
  });

  it("recusa o registro sem a tag p", () => {
    assert.deepEqual(lerDkim(["v=DKIM1; k=rsa"]), {
      situacao: "invalido",
      registro: "v=DKIM1; k=rsa",
      achados: [{ codigo: "chave-ausente", gravidade: "erro", tag: "p" }],
    });
  });

  it("trata P= e V= como tags desconhecidas, porque os nomes são sensíveis à caixa", () => {
    const resultado = lerDkim([`V=DKIM1; P=${CHAVE}`]);
    assert.deepEqual(resultado.situacao === "invalido" && resultado.achados, [
      { codigo: "chave-ausente", gravidade: "erro", tag: "p", detalhe: "P" },
    ]);
  });

  it("ignora K= em outra caixa e usa o tipo padrão", () => {
    const resultado = lerDkim([`v=DKIM1; K=ed25519; p=${CHAVE}`]);
    assert.equal(resultado.situacao === "valido" && resultado.tipo, "rsa");
  });
});

// ---------------------------------------------------------------------------
// CHAVE
// ---------------------------------------------------------------------------

describe("RF-04 e RF-05 — chave revogada, tipo e tamanho", () => {
  it("lê p vazio como chave revogada", () => {
    for (const texto of ["v=DKIM1; k=rsa; p=", "v=DKIM1; p=   ", "p="]) {
      assert.deepEqual(lerDkim([texto]), {
        situacao: "revogado",
        registro: texto,
        achados: [{ codigo: "chave-revogada", gravidade: "aviso", tag: "p" }],
      });
    }
  });

  for (const [bits, achado] of /** @type {Array<[number, string | undefined]>} */ ([
    [512, "chave-fraca"],
    [1023, "chave-fraca"],
    [1024, "chave-abaixo-do-recomendado"],
    [1536, "chave-abaixo-do-recomendado"],
    [2047, "chave-abaixo-do-recomendado"],
    [2048, undefined],
    [3072, undefined],
    [4096, undefined],
    [4097, "chave-maior-que-4096"],
    [8192, "chave-maior-que-4096"],
  ])) {
    it(`mede uma chave RSA de ${bits} bits`, () => {
      const resultado = lerDkim([`v=DKIM1; k=rsa; p=${chaveRsa(bits)}`]);
      assert.equal(resultado.situacao, "valido");
      assert.equal(resultado.situacao === "valido" && resultado.tamanhoBits, bits);
      assert.deepEqual(codigos(resultado), achado === undefined ? [] : [achado]);
    });
  }

  it("dá a gravidade e o tamanho de cada achado de tamanho", () => {
    const achados = (/** @type {number} */ bits) => {
      const resultado = lerDkim([`v=DKIM1; p=${chaveRsa(bits)}`]);
      return resultado.situacao === "valido" ? resultado.achados : [];
    };
    assert.deepEqual(achados(512), [
      { codigo: "chave-fraca", gravidade: "erro", tag: "p", detalhe: 512 },
    ]);
    assert.deepEqual(achados(1024), [
      { codigo: "chave-abaixo-do-recomendado", gravidade: "aviso", tag: "p", detalhe: 1024 },
    ]);
    assert.deepEqual(achados(4097), [
      { codigo: "chave-maior-que-4096", gravidade: "aviso", tag: "p", detalhe: 4097 },
    ]);
  });

  it("usa RSA quando k não aparece", () => {
    const resultado = lerDkim([`v=DKIM1; p=${CHAVE}`]);
    assert.equal(resultado.situacao === "valido" && resultado.tipo, "rsa");
  });

  it("lê o p quebrado em pedaços por espaços", () => {
    const quebrado = (CHAVE.match(/.{1,40}/g) ?? []).join(" ");
    const resultado = lerDkim([`v=DKIM1; p=${quebrado}`]);
    assert.equal(resultado.situacao === "valido" && resultado.tamanhoBits, 2048);
  });

  it("aponta a chave ilegível e continua válido, sem tamanho", () => {
    for (const p of ["naoebase64!", "bm90IGEga2V5", "AAAA", CHAVE.slice(0, 100)]) {
      const resultado = lerDkim([`v=DKIM1; k=rsa; p=${p}`]);
      assert.equal(resultado.situacao, "valido", p);
      assert.equal(resultado.situacao === "valido" && resultado.tamanhoBits, undefined, p);
      assert.deepEqual(
        resultado.situacao === "valido" && resultado.achados,
        [{ codigo: "chave-ilegivel", gravidade: "erro", tag: "p", detalhe: "rsa" }],
        p,
      );
    }
  });

  it("lê a chave Ed25519 de 32 bytes, sem tamanho nem achado", () => {
    const resultado = lerDkim([`v=DKIM1; k=ed25519; p=${chaveEd25519()}`]);
    assert.equal(resultado.situacao, "valido");
    assert.equal(resultado.situacao === "valido" && resultado.tipo, "ed25519");
    assert.equal(resultado.situacao === "valido" && resultado.tamanhoBits, undefined);
    assert.deepEqual(codigos(resultado), []);
  });

  it("aponta a chave Ed25519 de 31 e de 33 bytes", () => {
    for (const bytes of [1, 31, 33, 64]) {
      const p = emBase64(Array.from({ length: bytes }, (_, i) => i + 1));
      const resultado = lerDkim([`v=DKIM1; k=ed25519; p=${p}`]);
      assert.deepEqual(
        resultado.situacao === "valido" && resultado.achados,
        [{ codigo: "chave-ilegivel", gravidade: "erro", tag: "p", detalhe: "ed25519" }],
        `${bytes}`,
      );
    }
  });

  it("guarda o tipo desconhecido e avisa que a RFC manda ignorar", () => {
    for (const k of ["foo", "", "RSA", "ed448"]) {
      const resultado = lerDkim([`v=DKIM1; k=${k}; p=${CHAVE}`]);
      assert.equal(resultado.situacao === "valido" && resultado.tipo, "desconhecido", k);
      assert.deepEqual(
        resultado.situacao === "valido" && resultado.achados,
        [{ codigo: "tipo-de-chave-desconhecido", gravidade: "info", tag: "k", detalhe: k }],
        k,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// HASH, SERVIÇO, FLAGS E NOTA
// ---------------------------------------------------------------------------

describe("RF-04 — h, s, t e n", () => {
  it("avisa quando h só tem sha1", () => {
    for (const h of ["sha1", "sha1:foo", " sha1 ", "foo:sha1"]) {
      const resultado = lerDkim([registro(`; h=${h}`)]);
      assert.deepEqual(codigos(resultado), ["so-sha1"], h);
    }
  });

  it("não avisa quando h tem sha256 ou falta", () => {
    for (const extra of ["; h=sha256", "; h=sha1:sha256", "; h=foo", ""]) {
      assert.deepEqual(codigos(lerDkim([registro(extra)])), [], extra);
    }
    const resultado = lerDkim([registro("; h=sha1:sha256")]);
    assert.deepEqual(resultado.situacao === "valido" && resultado.hashes, ["sha1", "sha256"]);
  });

  it("avisa quando s não lista email nem *", () => {
    for (const s of ["outro", "", "sms:outro"]) {
      assert.deepEqual(codigos(lerDkim([registro(`; s=${s}`)])), ["servico-nao-e-email"], s);
    }
  });

  it("não avisa quando s lista email ou *", () => {
    for (const s of ["*", "email", "email:*", "outro:email"]) {
      assert.deepEqual(codigos(lerDkim([registro(`; s=${s}`)])), [], s);
    }
  });

  it("avisa o modo de teste quando t tem y", () => {
    for (const t of ["y", "y:s", "s:y"]) {
      const resultado = lerDkim([registro(`; t=${t}`)]);
      assert.deepEqual(codigos(resultado), ["modo-de-teste"], t);
    }
  });

  it("lê t=s como flag, sem achado", () => {
    const resultado = lerDkim([registro("; t=s")]);
    assert.deepEqual(resultado.situacao === "valido" && resultado.flags, ["s"]);
    assert.deepEqual(codigos(resultado), []);
  });

  it("guarda a nota como texto e corta a nota longa sem invalidar o registro", () => {
    const comMarcacao = lerDkim([registro("; n=<b>teste</b>")]);
    assert.equal(comMarcacao.situacao === "valido" && comMarcacao.nota, "<b>teste</b>");

    const longa = lerDkim([registro(`; n=${"a".repeat(300)}`)]);
    assert.equal(longa.situacao, "valido");
    assert.equal(longa.situacao === "valido" && longa.nota?.length, 255);
  });

  it("não traz nota quando n falta ou está vazio", () => {
    for (const extra of ["", "; n="]) {
      const resultado = lerDkim([registro(extra)]);
      assert.equal(resultado.situacao === "valido" && "nota" in resultado, false, extra);
    }
  });

  it("ordena os achados por gravidade e, dentro dela, pela ordem de geração", () => {
    const resultado = lerDkim([`v=DKIM1; k=rsa; p=${chaveRsa(512)}; h=sha1; s=outro; t=y`]);
    assert.deepEqual(codigos(resultado), [
      "chave-fraca",
      "so-sha1",
      "servico-nao-e-email",
      "modo-de-teste",
    ]);
  });
});

// ---------------------------------------------------------------------------
// ENTRADA HOSTIL
// ---------------------------------------------------------------------------

describe("RF-08 — entrada hostil", () => {
  it("não interpreta marcação: o texto fica intacto", () => {
    const hostil = "v=DKIM1; k=<img src=x onerror=alert(1)>; p=<script>alert(1)</script>";
    const resultado = lerDkim([hostil]);
    assert.equal(resultado.situacao, "valido");
    assert.equal(resultado.situacao === "valido" && resultado.registro, hostil);
    assert.deepEqual(resultado.situacao === "valido" && resultado.achados.map((a) => a.codigo), [
      "tipo-de-chave-desconhecido",
    ]);
    assert.equal(
      resultado.situacao === "valido" && resultado.achados[0]?.detalhe,
      "<img src=x onerror=alert(1)>",
    );
  });

  it("recusa o registro com mais tags que o teto, em tempo curto", () => {
    const tags = Array.from({ length: 1000 }, () => "a=1").join(";");
    const inicio = performance.now();
    const resultado = lerDkim([`v=DKIM1; ${tags}; p=${CHAVE.slice(0, 20)}`]);
    assert.ok(performance.now() - inicio < 200);
    assert.equal(resultado.situacao, "invalido");
    assert.deepEqual(codigos(resultado), ["registro-grande-demais"]);
  });

  it("aceita o registro com exatamente o teto de tags", () => {
    const extras = Array.from({ length: MAXIMO_TAGS - 3 }, (_, i) => `x${i}=1`).join("; ");
    assert.equal(lerDkim([`v=DKIM1; k=rsa; ${extras}; p=${CHAVE}`]).situacao, "valido");
  });

  it("recusa o registro acima de MAXIMO_TEXTO e corta o texto guardado", () => {
    const resultado = lerDkim([`v=DKIM1; p=${"A".repeat(MAXIMO_TEXTO + 100)}`]);
    assert.equal(resultado.situacao, "invalido");
    assert.equal(resultado.situacao === "invalido" && resultado.registro.length, MAXIMO_TEXTO);
    assert.deepEqual(codigos(resultado), ["registro-grande-demais"]);
  });

  it("trata o texto enorme que não começa como DKIM como ausente", () => {
    assert.deepEqual(lerDkim([`p=${"A".repeat(MAXIMO_TEXTO + 100)}`]), { situacao: "ausente" });
  });

  it("recusa o valor de tag lida acima do limite", () => {
    const k = lerDkim([`v=DKIM1; k=${"a".repeat(256)}; p=${CHAVE}`]);
    assert.deepEqual(k.situacao === "invalido" && k.achados, [
      { codigo: "valor-grande-demais", gravidade: "erro", tag: "k" },
    ]);

    const p = lerDkim([`v=DKIM1; p=${"A".repeat(2049)}`]);
    assert.deepEqual(p.situacao === "invalido" && p.achados, [
      { codigo: "valor-grande-demais", gravidade: "erro", tag: "p" },
    ]);
  });

  it("não guarda nem limita o valor de uma tag desconhecida", () => {
    assert.equal(lerDkim([registro(`; x=${"a".repeat(1000)}`)]).situacao, "valido");
  });

  it("descarta os itens que não são texto", () => {
    const resultado = lerDkim([42, null, undefined, {}, ["v=DKIM1"], registro()]);
    assert.equal(resultado.situacao, "valido");
  });

  it("nenhuma entrada estranha lança", () => {
    const entradas = [
      undefined,
      null,
      0,
      "",
      "texto",
      {},
      [[]],
      [null, undefined],
      ["v=DKIM1;"],
      ["v=DKIM1; p"],
      ["=;=;=;"],
      [";;;;;;"],
      ["v=DKIM1; p=;p=;"],
      ["\u0000v=DKIM1; p=\u0000"],
      ["v=DKIM1; k=rsa; p=" + "=".repeat(50)],
      ["p=" + "%".repeat(100)],
    ];
    for (const entrada of entradas) {
      assert.doesNotThrow(() => lerDkim(entrada), JSON.stringify(entrada));
    }
  });
});
