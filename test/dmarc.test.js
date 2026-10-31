/**
 * @file Testes de `lerDmarc` e `lerDestinos`, a leitura do registro DMARC.
 *
 * Todo registro é montado aqui, sintético (`exemplo.com.br`, `dmarc@exemplo.com.br`). Seis
 * famílias de caso, uma por requisito: a escolha do registro entre os TXT, a leitura das
 * tags, a política, os endereços de relatório, o estágio com os achados e a entrada hostil,
 * que tem de virar resultado e nunca exceção.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lerDestinos, lerDmarc, MAXIMO_DESTINOS } from "../public/js/dmarc.js";
import { MAXIMO_TEXTO } from "../public/js/resposta-doh.js";

// ---------------------------------------------------------------------------
// AUXILIARES
// ---------------------------------------------------------------------------

const RUA = "rua=mailto:dmarc@exemplo.com.br";

/**
 * Lê um registro que o teste espera válido, já com o tipo estreitado.
 *
 * @param {string} registro - Texto do registro.
 * @returns {import("../public/js/dmarc.js").DmarcValido} O resultado `valido`.
 */
const lerValido = (registro) => {
  const resultado = lerDmarc([registro]);
  if (resultado.situacao !== "valido") {
    throw new Error(`Esperava registro válido, veio ${resultado.situacao}: ${registro}`);
  }
  return resultado;
};

/**
 * Lê um registro que o teste espera inválido, já com o tipo estreitado.
 *
 * @param {string} registro - Texto do registro.
 * @returns {import("../public/js/dmarc.js").DmarcInvalido} O resultado `invalido`.
 */
const lerInvalido = (registro) => {
  const resultado = lerDmarc([registro]);
  if (resultado.situacao !== "invalido") {
    throw new Error(`Esperava registro inválido, veio ${resultado.situacao}: ${registro}`);
  }
  return resultado;
};

/**
 * @param {{ achados: import("../public/js/dmarc.js").Achado[] }} resultado - Leitura feita.
 * @returns {string[]} Só os códigos dos achados, na ordem.
 */
const codigos = (resultado) => resultado.achados.map((achado) => achado.codigo);

// ---------------------------------------------------------------------------
// RF-01 — ESCOLHA DO REGISTRO
// ---------------------------------------------------------------------------

describe("lerDmarc: escolha do registro", () => {
  it("escolhe o registro DMARC entre TXT alheios, que somem sem achado", () => {
    const resultado = lerDmarc(["google-site-verification=abc", `v=DMARC1; p=none; ${RUA}`]);
    assert.equal(resultado.situacao, "valido");
    assert.equal(resultado.situacao === "valido" && resultado.registro, `v=DMARC1; p=none; ${RUA}`);
    assert.equal(
      resultado.situacao === "valido" && !codigos(resultado).includes("tag-duplicada"),
      true,
    );
  });

  it("lista vazia ou sem candidato é ausente", () => {
    assert.deepEqual(lerDmarc([]), { situacao: "ausente", estagio: "nenhum" });
    assert.deepEqual(lerDmarc(["v=spf1 -all", "outra coisa"]), {
      situacao: "ausente",
      estagio: "nenhum",
    });
  });

  it("dois ou mais registros são múltiplos, sem política e sem leitura", () => {
    const resultado = lerDmarc(["v=DMARC1; p=none", "v=DMARC1; p=reject", "v=DMARC1; p=none"]);
    assert.deepEqual(resultado, { situacao: "multiplos", quantidade: 3, estagio: "nenhum" });
  });

  it("v fora do começo não é registro DMARC", () => {
    assert.equal(lerDmarc(["p=none; v=DMARC1"]).situacao, "ausente");
    assert.equal(lerDmarc(["x=1; v=DMARC1; p=none"]).situacao, "ausente");
  });

  it("aceita espaços antes do v e ao redor do =", () => {
    assert.equal(lerDmarc(["  v = DMARC1 ; p=none"]).situacao, "valido");
    assert.equal(lerDmarc(["\tv=DMARC1;p=none"]).situacao, "valido");
  });

  it("aceita V=DMARC1 com o achado de caixa; recusa v=dmarc1 e v=DMARC10", () => {
    const aceito = lerValido(`V=DMARC1; p=none; ${RUA}`);
    assert.deepEqual(codigos(aceito), ["monitoramento-apenas", "caixa-fora-do-padrao"]);
    assert.equal(lerDmarc(["v=dmarc1; p=none"]).situacao, "ausente");
    assert.equal(lerDmarc(["v=DMARC10; p=none"]).situacao, "ausente");
    assert.equal(lerDmarc(["v=DMARC1x; p=none"]).situacao, "ausente");
  });

  it("v=DMARC1 sozinho é candidato (e inválido por falta de p)", () => {
    assert.deepEqual(codigos(lerInvalido("v=DMARC1")), ["politica-ausente"]);
  });

  it("o que não é lista vira lista vazia e o que não é texto é descartado", () => {
    assert.equal(lerDmarc(/** @type {any} */ (undefined)).situacao, "ausente");
    assert.equal(lerDmarc(/** @type {any} */ ("v=DMARC1; p=none")).situacao, "ausente");
    assert.equal(lerDmarc(/** @type {any} */ (null)).situacao, "ausente");
    const misturado = [
      42,
      null,
      undefined,
      { v: "DMARC1" },
      ["v=DMARC1; p=none"],
      "v=DMARC1; p=none",
    ];
    assert.equal(lerDmarc(/** @type {any} */ (misturado)).situacao, "valido");
  });

  it("candidato acima do limite é inválido e grande demais, sem ler as tags", () => {
    const grande = `v=DMARC1; p=none; x=${"a".repeat(MAXIMO_TEXTO)}`;
    const resultado = lerInvalido(grande);
    assert.deepEqual(resultado.achados, [{ codigo: "registro-grande-demais", gravidade: "erro" }]);
    assert.equal(resultado.estagio, "nenhum");
  });
});

// ---------------------------------------------------------------------------
// RF-02 — TAGS
// ---------------------------------------------------------------------------

describe("lerDmarc: tags", () => {
  it("registro mínimo traz os padrões da RFC e os nomes que ficaram no padrão", () => {
    const r = lerValido(`v=DMARC1; p=none; ${RUA}`);
    assert.equal(r.subdominios, "none");
    assert.equal(r.alinhamentoDkim, "r");
    assert.equal(r.alinhamentoSpf, "r");
    assert.equal(r.porcentagem, 100);
    assert.deepEqual(r.opcoesFalha, ["0"]);
    assert.deepEqual(r.formatos, ["afrf"]);
    assert.equal(r.intervaloSegundos, 86400);
    assert.deepEqual(r.rua, [{ endereco: "dmarc@exemplo.com.br" }]);
    assert.deepEqual(r.ruf, []);
    assert.deepEqual(r.padrao, ["sp", "adkim", "aspf", "pct", "fo", "rf", "ri", "ruf"]);
  });

  it("registro completo lê todas as tags, sem nada no padrão", () => {
    const r = lerValido(
      "v=DMARC1; p=quarantine; sp=reject; adkim=s; aspf=s; pct=50; fo=0:1:d:s; rf=afrf; ri=3600; " +
        "rua=mailto:a@exemplo.com.br; ruf=mailto:b@exemplo.com.br!5m",
    );
    assert.equal(r.politica, "quarantine");
    assert.equal(r.subdominios, "reject");
    assert.equal(r.alinhamentoDkim, "s");
    assert.equal(r.alinhamentoSpf, "s");
    assert.equal(r.porcentagem, 50);
    assert.deepEqual(r.opcoesFalha, ["0", "1", "d", "s"]);
    assert.deepEqual(r.formatos, ["afrf"]);
    assert.equal(r.intervaloSegundos, 3600);
    assert.deepEqual(r.ruf, [{ endereco: "b@exemplo.com.br", tamanhoMaximo: "5m" }]);
    assert.deepEqual(r.padrao, []);
    assert.deepEqual(codigos(r), ["aplicacao-parcial"]);
  });

  it("; final, espaços extras e ;; não atrapalham", () => {
    const r = lerValido(`v=DMARC1;; p = none ;  ${RUA} ;;`);
    assert.equal(r.politica, "none");
    assert.equal(r.rua.length, 1);
  });

  it("tag desconhecida e pedaço sem = são ignorados, sem achado", () => {
    const r = lerValido(`v=DMARC1; foo; x=1; np=reject; t=y; p=none; ${RUA}`);
    assert.deepEqual(codigos(r), ["monitoramento-apenas"]);
  });

  it("tag conhecida repetida vale a primeira, com um achado por tag", () => {
    const r = lerValido(`v=DMARC1; p=none; p=reject; p=reject; pct=10; pct=20; ${RUA}`);
    assert.equal(r.politica, "none");
    assert.equal(r.porcentagem, 10);
    assert.deepEqual(
      r.achados.filter((a) => a.codigo === "tag-duplicada").map((a) => a.tag),
      ["p", "pct"],
    );
  });

  it("a primeira ocorrência é dividida no primeiro =", () => {
    const r = lerValido(`v=DMARC1; p=none; rua=mailto:a@exemplo.com.br; x=a=b=c`);
    assert.equal(r.rua.length, 1);
  });

  it("pct inválido usa 100, com valor-invalido e pct no padrão", () => {
    for (const ruim of ["abc", "150", "-1", "", "10.5", "1000", "+5"]) {
      const r = lerValido(`v=DMARC1; p=reject; pct=${ruim}; ${RUA}`);
      assert.equal(r.porcentagem, 100, `pct=${ruim}`);
      assert.deepEqual(r.achados, [{ codigo: "valor-invalido", gravidade: "aviso", tag: "pct" }]);
      assert.ok(r.padrao.includes("pct"));
    }
    assert.equal(lerValido(`v=DMARC1; p=reject; pct=0; ${RUA}`).porcentagem, 0);
  });

  it("adkim, aspf, fo, rf, ri e sp inválidos usam o padrão e acusam só a própria tag", () => {
    const casos = [
      ["adkim=x", "adkim"],
      ["aspf=", "aspf"],
      ["fo=2", "fo"],
      ["fo=0::1", "fo"],
      ["rf=a b", "rf"],
      ["ri=abc", "ri"],
      ["ri=99999999999", "ri"],
      ["sp=bloqueie", "sp"],
    ];
    for (const [tag, nome] of casos) {
      const r = lerValido(`v=DMARC1; p=reject; ${tag}; ${RUA}`);
      assert.deepEqual(r.achados, [{ codigo: "valor-invalido", gravidade: "aviso", tag: nome }]);
      assert.ok(r.padrao.includes(nome ?? ""));
    }
  });

  it("sp inválido cai em p", () => {
    assert.equal(lerValido(`v=DMARC1; p=quarantine; sp=xx; ${RUA}`).subdominios, "quarantine");
  });

  it("valores válidos de adkim, aspf, fo, rf e ri são lidos", () => {
    const r = lerValido(`v=DMARC1; p=reject; adkim=S; aspf=s; fo=1; rf=afrf:iodef; ri=0; ${RUA}`);
    assert.equal(r.alinhamentoDkim, "s");
    assert.equal(r.alinhamentoSpf, "s");
    assert.deepEqual(r.opcoesFalha, ["1"]);
    assert.deepEqual(r.formatos, ["afrf", "iodef"]);
    assert.equal(r.intervaloSegundos, 0);
  });

  it("caixa: nome de tag e valor de p, sp, adkim e aspf são aceitos e acusados uma vez só", () => {
    const r = lerValido("V=DMARC1; P=NONE; Rua=mailto:dmarc@exemplo.com.br; SP=Reject; ADKIM=S");
    assert.equal(r.politica, "none");
    assert.equal(r.subdominios, "reject");
    assert.equal(r.alinhamentoDkim, "s");
    assert.equal(r.rua.length, 1);
    assert.equal(codigos(r).filter((c) => c === "caixa-fora-do-padrao").length, 1);
  });

  it("caixa em tag desconhecida e em valor de fo não gera achado", () => {
    const r = lerValido(`v=DMARC1; p=none; X=1; fo=D; ${RUA}`);
    assert.deepEqual(codigos(r), ["monitoramento-apenas"]);
    assert.deepEqual(r.opcoesFalha, ["d"]);
  });
});

// ---------------------------------------------------------------------------
// RF-03 — POLÍTICA
// ---------------------------------------------------------------------------

describe("lerDmarc: política", () => {
  it("lê os três valores e o estágio é a própria política", () => {
    for (const p of /** @type {const} */ (["none", "quarantine", "reject"])) {
      const r = lerValido(`v=DMARC1; p=${p}; ${RUA}`);
      assert.equal(r.politica, p);
      assert.equal(r.estagio, p);
    }
  });

  it("p ausente salvo por rua válido vale none, com aviso e p no padrão", () => {
    const r = lerValido(`v=DMARC1; ${RUA}`);
    assert.equal(r.politica, "none");
    assert.equal(r.estagio, "none");
    assert.deepEqual(r.achados[0], { codigo: "politica-ausente", gravidade: "aviso", tag: "p" });
    assert.ok(r.padrao.includes("p"));
  });

  it("p ausente sem rua válido é inválido, com erro", () => {
    for (const registro of ["v=DMARC1; sp=none", "v=DMARC1; rua=http://exemplo.com.br/x"]) {
      const r = lerInvalido(registro);
      assert.deepEqual(r.achados[0], { codigo: "politica-ausente", gravidade: "erro", tag: "p" });
      assert.equal(r.estagio, "nenhum");
      assert.equal(r.registro, registro);
    }
  });

  it("p fora dos três valores é inválido, mesmo com rua válido", () => {
    for (const ruim of ["reeject", "", "block", "none quarantine"]) {
      const r = lerInvalido(`v=DMARC1; p=${ruim}; ${RUA}`);
      assert.deepEqual(r.achados, [{ codigo: "politica-invalida", gravidade: "erro", tag: "p" }]);
    }
  });

  it("registro inválido guarda também os achados de estrutura, erro primeiro", () => {
    const r = lerInvalido("v=DMARC1; sp=none; sp=reject");
    assert.deepEqual(codigos(r), ["politica-ausente", "tag-duplicada"]);
  });
});

// ---------------------------------------------------------------------------
// RF-04 — ENDEREÇOS DE RELATÓRIO
// ---------------------------------------------------------------------------

describe("lerDestinos", () => {
  it("lê dois endereços, um com tamanho máximo", () => {
    const { destinos, descartados } = lerDestinos(
      "mailto:a@exemplo.com.br, mailto:b@exemplo.com.br!10m",
    );
    assert.deepEqual(destinos, [
      { endereco: "a@exemplo.com.br" },
      { endereco: "b@exemplo.com.br", tamanhoMaximo: "10m" },
    ]);
    assert.equal(descartados, 0);
  });

  it("aceita mailto: em qualquer caixa e tamanho sem unidade", () => {
    const { destinos } = lerDestinos("MAILTO:a@exemplo.com.br!500");
    assert.deepEqual(destinos, [{ endereco: "a@exemplo.com.br", tamanhoMaximo: "500" }]);
  });

  it("descarta e conta o que não tem a forma de endereço", () => {
    const ruins = [
      "http://exemplo.com.br/relatorio",
      "dmarc@exemplo.com.br",
      "mailto:semarroba",
      "mailto:",
      "",
      "mailto:a@localhost",
      "mailto:a@b",
      "mailto:@exemplo.com.br",
      "mailto:a b@exemplo.com.br",
      "mailto:<script>@exemplo.com.br",
      "mailto:a@exemplo.com.br!",
      "mailto:a@exemplo.com.br!10x",
      "mailto:a@exemplo..com.br",
      "mailto:a@exemplo.com.br/<script>",
    ];
    for (const ruim of ruins) {
      const { destinos, descartados } = lerDestinos(ruim);
      assert.deepEqual(destinos, [], ruim);
      assert.equal(descartados, 1, ruim);
    }
  });

  it("não decodifica percent-encoding: guarda como veio", () => {
    const { destinos } = lerDestinos("mailto:a%40b@exemplo.com.br");
    assert.deepEqual(destinos, [{ endereco: "a%40b@exemplo.com.br" }]);
  });

  it("recusa usuário de 65 caracteres e endereço acima de 254", () => {
    assert.equal(lerDestinos(`mailto:${"u".repeat(64)}@exemplo.com.br`).destinos.length, 1);
    assert.equal(lerDestinos(`mailto:${"u".repeat(65)}@exemplo.com.br`).destinos.length, 0);
    const longo = `${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.com`;
    assert.equal(lerDestinos(`mailto:${"u".repeat(64)}@${longo}`).destinos.length, 0);
    assert.equal(lerDestinos(`mailto:u@${longo}`).destinos.length, 1);
  });

  it("25 endereços válidos devolvem 20, com 5 descartados", () => {
    const vinteCinco = Array.from({ length: 25 }, (_, i) => `mailto:u${i}@exemplo.com.br`);
    const { destinos, descartados } = lerDestinos(vinteCinco.join(","));
    assert.equal(destinos.length, MAXIMO_DESTINOS);
    assert.equal(descartados, 5);
  });
});

describe("lerDmarc: rua e ruf", () => {
  it("sem rua: sem-relatorio-agregado e rua no padrão", () => {
    const r = lerValido("v=DMARC1; p=none");
    assert.ok(codigos(r).includes("sem-relatorio-agregado"));
    assert.ok(r.padrao.includes("rua"));
    assert.deepEqual(r.rua, []);
  });

  it("item inválido vira endereco-invalido com a quantidade, e o válido fica", () => {
    const r = lerValido("v=DMARC1; p=none; rua=mailto:a@exemplo.com.br,http://x.com,,semarroba");
    assert.equal(r.rua.length, 1);
    assert.deepEqual(
      r.achados.find((a) => a.codigo === "endereco-invalido"),
      { codigo: "endereco-invalido", gravidade: "aviso", tag: "rua", detalhe: 3 },
    );
    assert.ok(!codigos(r).includes("sem-relatorio-agregado"));
  });

  it("ruf inválido acusa a própria tag", () => {
    const r = lerValido(`v=DMARC1; p=none; ${RUA}; ruf=http://x.com`);
    assert.deepEqual(
      r.achados.find((a) => a.codigo === "endereco-invalido"),
      { codigo: "endereco-invalido", gravidade: "aviso", tag: "ruf", detalhe: 1 },
    );
    assert.deepEqual(r.ruf, []);
  });

  it("rua com só endereço inválido é sem-relatorio-agregado", () => {
    const r = lerValido("v=DMARC1; p=none; rua=http://x.com");
    assert.ok(codigos(r).includes("endereco-invalido"));
    assert.ok(codigos(r).includes("sem-relatorio-agregado"));
  });
});

// ---------------------------------------------------------------------------
// RF-05 — ESTÁGIO E ACHADOS
// ---------------------------------------------------------------------------

describe("lerDmarc: estágio e achados", () => {
  it("estágio tem os quatro valores", () => {
    assert.equal(lerDmarc([]).estagio, "nenhum");
    assert.equal(lerDmarc(["v=DMARC1; p=none", "v=DMARC1; p=none"]).estagio, "nenhum");
    assert.equal(lerInvalido("v=DMARC1; p=x").estagio, "nenhum");
    assert.equal(lerValido(`v=DMARC1; p=none; ${RUA}`).estagio, "none");
    assert.equal(lerValido(`v=DMARC1; p=quarantine; ${RUA}`).estagio, "quarantine");
    assert.equal(lerValido(`v=DMARC1; p=reject; ${RUA}`).estagio, "reject");
  });

  it("p=none é monitoramento-apenas e ignora o pct", () => {
    const r = lerValido(`v=DMARC1; p=none; pct=10; ${RUA}`);
    assert.deepEqual(r.achados, [{ codigo: "monitoramento-apenas", gravidade: "aviso", tag: "p" }]);
  });

  it("quarantine e reject abaixo de 100 são aplicacao-parcial com o pct", () => {
    for (const p of ["quarantine", "reject"]) {
      const r = lerValido(`v=DMARC1; p=${p}; pct=25; ${RUA}`);
      assert.deepEqual(r.achados, [
        { codigo: "aplicacao-parcial", gravidade: "aviso", tag: "pct", detalhe: 25 },
      ]);
    }
    assert.deepEqual(lerValido(`v=DMARC1; p=reject; pct=100; ${RUA}`).achados, []);
  });

  it("sp mais fraco que p é subdominios-mais-fracos", () => {
    const r = lerValido(`v=DMARC1; p=reject; sp=none; ${RUA}`);
    assert.deepEqual(r.achados, [
      { codigo: "subdominios-mais-fracos", gravidade: "aviso", tag: "sp" },
    ]);
    assert.deepEqual(codigos(lerValido(`v=DMARC1; p=quarantine; sp=reject; ${RUA}`)), []);
    assert.deepEqual(codigos(lerValido(`v=DMARC1; p=quarantine; sp=quarantine; ${RUA}`)), []);
  });

  it("registro sem nenhum achado é possível", () => {
    assert.deepEqual(lerValido(`v=DMARC1; p=reject; ${RUA}`).achados, []);
  });

  it("vários achados saem por gravidade e, dentro dela, na ordem de geração", () => {
    const r = lerValido(
      "V=DMARC1; P=Quarantine; p=none; pct=abc; sp=none; adkim=z; ruf=http://x.com",
    );
    assert.deepEqual(
      r.achados.map((a) => `${a.gravidade}:${a.codigo}:${a.tag ?? ""}`),
      [
        "aviso:tag-duplicada:p",
        "aviso:valor-invalido:adkim",
        "aviso:valor-invalido:pct",
        "aviso:endereco-invalido:ruf",
        "aviso:subdominios-mais-fracos:sp",
        "aviso:sem-relatorio-agregado:rua",
        "info:caixa-fora-do-padrao:",
      ],
    );
  });

  it("a mesma entrada dá sempre a mesma saída", () => {
    const registro = "v=DMARC1; p=quarantine; pct=30; sp=none; adkim=q";
    assert.deepEqual(lerDmarc([registro]), lerDmarc([registro]));
  });
});

// ---------------------------------------------------------------------------
// RF-06 — ENTRADA HOSTIL
// ---------------------------------------------------------------------------

describe("lerDmarc: entrada hostil", () => {
  it("HTML no valor de uma tag desconhecida não é interpretado: o texto fica intacto", () => {
    const registro = `v=DMARC1; p=none; x=<script>alert(1)</script>; ${RUA}`;
    const r = lerValido(registro);
    assert.equal(r.registro, registro);
    assert.deepEqual(codigos(r), ["monitoramento-apenas"]);
  });

  it("HTML em tag conhecida só vira valor inválido ou endereço descartado", () => {
    const r = lerValido("v=DMARC1; p=none; pct=<b>1</b>; rua=mailto:<script>@exemplo.com.br");
    assert.equal(r.porcentagem, 100);
    assert.deepEqual(r.rua, []);
    assert.equal(lerInvalido("v=DMARC1; p=<script>").achados[0]?.codigo, "politica-invalida");
  });

  it("4000 ponto e vírgula seguidos são lidos em tempo curto", () => {
    const inicio = performance.now();
    const r = lerDmarc([`v=DMARC1${";".repeat(4000)}`]);
    assert.equal(r.situacao, "invalido");
    assert.ok(performance.now() - inicio < 500);
  });

  it("4000 pedaços sem = e milhares de vírgulas em rua não travam", () => {
    const inicio = performance.now();
    lerDmarc([`v=DMARC1; p=none; ${"a;".repeat(1500)}rua=${",".repeat(900)}`]);
    assert.ok(performance.now() - inicio < 500);
  });

  it("caracteres de controle e espaços em excesso não lançam", () => {
    const estranhos = [
      "v=DMARC1; p=none\u0000; rua=mailto:a\u0007@exemplo.com.br",
      `v=DMARC1;${" ".repeat(3000)}p=none`,
      "v=DMARC1; p=none;\n\r\tpct=50",
      `v=DMARC1; ${"=".repeat(500)}`,
    ];
    for (const estranho of estranhos) {
      assert.doesNotThrow(() => lerDmarc([estranho]));
    }
    assert.deepEqual(lerDestinos("mailto:a\u0007@exemplo.com.br").destinos, []);
  });

  it("nenhuma entrada de tipo errado lança", () => {
    const entradas = [undefined, null, 0, "texto", {}, [[]], [Symbol.iterator], [() => 1]];
    for (const entrada of entradas) {
      assert.doesNotThrow(() => lerDmarc(/** @type {any} */ (entrada)));
    }
  });
});
