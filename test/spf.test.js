/**
 * @file Testes de `lerSpf`, a leitura do registro SPF.
 *
 * Todo registro é montado aqui, sintético (`exemplo.com.br`, `exemplo.net`, `203.0.113.0/24`,
 * `2001:db8::/32`). Cinco famílias de caso: a escolha do registro entre os TXT, os termos e a
 * gramática de cada um, o estágio e os achados do `all`, a higiene do registro e a entrada
 * hostil, que tem de virar resultado e nunca exceção.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lerSpf, LIMITE_CONSULTAS, TIPOS_QUE_CONSULTAM } from "../public/js/spf.js";
import { MAXIMO_TEXTO } from "../public/js/resposta-doh.js";

// ---------------------------------------------------------------------------
// AUXILIARES
// ---------------------------------------------------------------------------

/**
 * Lê um registro que o teste espera válido, já com o tipo estreitado.
 *
 * @param {string} registro - Texto do registro.
 * @returns {import("../public/js/spf.js").SpfValido} O resultado `valido`.
 */
const lerValido = (registro) => {
  const resultado = lerSpf([registro]);
  if (resultado.situacao !== "valido") {
    throw new Error(`Esperava registro válido, veio ${resultado.situacao}: ${registro}`);
  }
  return resultado;
};

/**
 * Lê um registro que o teste espera inválido, já com o tipo estreitado.
 *
 * @param {string} registro - Texto do registro.
 * @returns {import("../public/js/spf.js").SpfInvalido} O resultado `invalido`.
 */
const lerInvalido = (registro) => {
  const resultado = lerSpf([registro]);
  if (resultado.situacao !== "invalido") {
    throw new Error(`Esperava registro inválido, veio ${resultado.situacao}: ${registro}`);
  }
  return resultado;
};

/**
 * @param {{ achados: import("../public/js/spf.js").Achado[] }} resultado - Leitura feita.
 * @returns {string[]} Só os códigos dos achados, na ordem.
 */
const codigos = (resultado) => resultado.achados.map((achado) => achado.codigo);

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------

describe("constantes exportadas", () => {
  it("o limite é 10 e os tipos que consultam são os seis da RFC", () => {
    assert.equal(LIMITE_CONSULTAS, 10);
    assert.deepEqual([...TIPOS_QUE_CONSULTAM].sort(), [
      "a",
      "exists",
      "include",
      "mx",
      "ptr",
      "redirect",
    ]);
  });
});

// ---------------------------------------------------------------------------
// RF-01 — ESCOLHA DO REGISTRO
// ---------------------------------------------------------------------------

describe("RF-01 — escolha do registro", () => {
  it("escolhe o registro SPF e ignora os TXT alheios sem achado", () => {
    const resultado = lerSpf(["google-site-verification=abc123", "v=spf1 -all", "MS=ms12345678"]);
    assert.equal(resultado.situacao, "valido");
    assert.equal(resultado.situacao === "valido" && resultado.registro, "v=spf1 -all");
    assert.deepEqual(codigos(/** @type {any} */ (resultado)), ["all-rigido"]);
  });

  it("lista vazia e TXT sem SPF são ausentes", () => {
    assert.deepEqual(lerSpf([]), { situacao: "ausente", estagio: "nenhum" });
    assert.deepEqual(lerSpf(["verificacao=1", "outro texto"]), {
      situacao: "ausente",
      estagio: "nenhum",
    });
  });

  it("dois ou mais registros são múltiplos, e nenhum é lido", () => {
    assert.deepEqual(lerSpf(["v=spf1 -all", "v=spf1 include:spf.exemplo.net ~all"]), {
      situacao: "multiplos",
      quantidade: 2,
      estagio: "nenhum",
    });
    const tres = lerSpf(["v=spf1 -all", "v=spf1 ~all", "v=SPF1 ?all"]);
    assert.equal(tres.situacao === "multiplos" && tres.quantidade, 3);
  });

  it("recusa a versão que não é seguida de espaço ou do fim", () => {
    for (const texto of ["v=spf10 -all", "v=spf1x", "v=spf1-all", "v=spf2.0/pra -all"]) {
      assert.equal(lerSpf([texto]).situacao, "ausente", texto);
    }
  });

  it("recusa espaço, tabulação ou outro caractere antes do v", () => {
    for (const texto of [" v=spf1 -all", "\tv=spf1 -all", "x v=spf1 -all", "v=spf1\t-all"]) {
      assert.equal(lerSpf([texto]).situacao, "ausente", texto);
    }
  });

  it("aceita a versão em outra caixa, com achado informativo", () => {
    const resultado = lerValido("V=SPF1 -all");
    assert.deepEqual(codigos(resultado), ["all-rigido", "caixa-fora-do-padrao"]);
    assert.equal(lerValido("v=Spf1 -all").achados.at(-1)?.codigo, "caixa-fora-do-padrao");
  });

  it("aceita a versão sozinha, como registro sem all", () => {
    const resultado = lerValido("v=spf1");
    assert.deepEqual(resultado.termos, []);
    assert.deepEqual(codigos(resultado), ["sem-all"]);
  });

  it("descarta o que não é texto e aceita o que sobra", () => {
    const itens = [42, null, undefined, {}, ["v=spf1 -all"], true, "v=spf1 -all"];
    assert.equal(lerSpf(itens).situacao, "valido");
  });

  it("o que não é lista vira lista vazia", () => {
    for (const entrada of [undefined, null, "v=spf1 -all", 7, {}]) {
      assert.deepEqual(lerSpf(/** @type {any} */ (entrada)), {
        situacao: "ausente",
        estagio: "nenhum",
      });
    }
  });

  it("um registro acima do limite é dito grande demais, não ausente", () => {
    const resultado = lerInvalido(`v=spf1 ${"a ".repeat(2500)}-all`);
    assert.deepEqual(resultado.achados, [{ codigo: "registro-grande-demais", gravidade: "erro" }]);
    assert.equal(resultado.estagio, "nenhum");
  });

  it("um registro de exatamente o limite ainda é lido", () => {
    const registro = `v=spf1 -all${" ".repeat(MAXIMO_TEXTO - "v=spf1 -all".length)}`;
    assert.equal(registro.length, MAXIMO_TEXTO);
    assert.equal(lerSpf([registro]).situacao, "valido");
  });
});

// ---------------------------------------------------------------------------
// RF-02 — TERMOS
// ---------------------------------------------------------------------------

describe("RF-02 — leitura dos termos", () => {
  it("devolve os termos na ordem, com qualificador, tipo e alvo", () => {
    const registro = "v=spf1 ip4:203.0.113.0/24 include:spf.exemplo.net -all";
    assert.deepEqual(lerSpf([registro]), {
      situacao: "valido",
      registro,
      estagio: "rigido",
      termos: [
        { texto: "ip4:203.0.113.0/24", tipo: "ip4", qualificador: "+", rede: "203.0.113.0/24" },
        {
          texto: "include:spf.exemplo.net",
          tipo: "include",
          qualificador: "+",
          dominio: "spf.exemplo.net",
        },
        { texto: "-all", tipo: "all", qualificador: "-" },
      ],
      achados: [{ codigo: "all-rigido", gravidade: "info", tag: "all" }],
    });
  });

  it("aceita cada mecanismo válido, com e sem qualificador", () => {
    const mecanismos = [
      "all",
      "a",
      "a:exemplo.net",
      "a/24",
      "a//64",
      "a/24//64",
      "a:exemplo.net/24",
      "a:exemplo.net//64",
      "a:exemplo.net/24//64",
      "a/0",
      "a//0",
      "a/32//128",
      "mx",
      "mx:exemplo.net",
      "mx/24",
      "mx:exemplo.net//64",
      "ptr",
      "ptr:exemplo.net",
      "ip4:203.0.113.0",
      "ip4:203.0.113.0/24",
      "ip4:0.0.0.0/0",
      "ip6:2001:db8::/32",
      "ip6:2001:db8:0:0:0:0:0:1",
      "ip6:::",
      "ip6:::1",
      "ip6:1::",
      "ip6:::ffff:203.0.113.5",
      "ip6:64:ff9b::203.0.113.5/96",
      "exists:exemplo.net",
      "include:spf.exemplo.net",
    ];
    for (const mecanismo of mecanismos) {
      for (const qualificador of ["", "+", "-", "~", "?"]) {
        const termo = `${qualificador}${mecanismo}`;
        const resultado = lerValido(`v=spf1 ${termo}`);
        assert.equal(resultado.termos[0]?.texto, termo);
        assert.equal(resultado.termos[0]?.qualificador, qualificador === "" ? "+" : qualificador);
      }
    }
  });

  it("separa o alvo, a rede e os tamanhos de a e mx", () => {
    const { termos } = lerValido(
      "v=spf1 a a/24 mx:Exemplo.NET//64 a:exemplo.net/24//64 ip6:2001:db8::/32 ptr:exemplo.net.",
    );
    assert.equal(termos[0]?.dominio, undefined);
    assert.equal(termos[1]?.dominio, undefined);
    assert.equal(termos[2]?.dominio, "exemplo.net");
    assert.equal(termos[3]?.dominio, "exemplo.net");
    assert.equal(termos[4]?.rede, "2001:db8::/32");
    assert.equal(termos[5]?.dominio, "exemplo.net");
  });

  it("os espaços repetidos entre os termos são ignorados", () => {
    const resultado = lerValido("v=spf1   ip4:203.0.113.1    include:spf.exemplo.net   -all  ");
    assert.deepEqual(
      resultado.termos.map((termo) => termo.tipo),
      ["ip4", "include", "all"],
    );
  });

  it("aceita os nomes de mecanismo e de modificador em qualquer caixa, com achado", () => {
    const resultado = lerValido("v=spf1 INCLUDE:spf.exemplo.net Redirect=exemplo.net");
    assert.deepEqual(
      resultado.termos.map((termo) => termo.tipo),
      ["include", "redirect"],
    );
    assert.deepEqual(codigos(resultado), ["caixa-fora-do-padrao"]);
    assert.ok(codigos(lerValido("v=spf1 IP4:203.0.113.1 -ALL")).includes("caixa-fora-do-padrao"));
    assert.ok(
      codigos(lerValido("v=spf1 -all EXP=aviso.exemplo.net")).includes("caixa-fora-do-padrao"),
    );
  });

  it("a caixa do alvo não conta e o alvo sai em minúsculas e sem ponto final", () => {
    const resultado = lerValido("v=spf1 include:SPF.Exemplo.NET. -all");
    assert.equal(resultado.termos[0]?.dominio, "spf.exemplo.net");
    assert.deepEqual(codigos(resultado), ["all-rigido"]);
  });

  it("ignora o modificador desconhecido, sem achado", () => {
    const resultado = lerValido("v=spf1 foo=bar Outro.Mod=%{d} vazio= -all");
    assert.deepEqual(
      resultado.termos.map((termo) => termo.tipo),
      ["all"],
    );
    assert.deepEqual(codigos(resultado), ["all-rigido"]);
  });

  it("lê o redirect e o exp", () => {
    const { termos } = lerValido("v=spf1 redirect=_spf.exemplo.net exp=explica.exemplo.net");
    assert.deepEqual(termos[0], {
      texto: "redirect=_spf.exemplo.net",
      tipo: "redirect",
      dominio: "_spf.exemplo.net",
    });
    assert.deepEqual(termos[1], { texto: "exp=explica.exemplo.net", tipo: "exp" });
  });

  it("o exp aceita um texto qualquer, que não é consultado", () => {
    const { termos } = lerValido("v=spf1 -all exp=<b>texto</b>");
    assert.equal(termos[1]?.tipo, "exp");
    assert.equal(termos[1]?.dominio, undefined);
  });

  it("cada termo fora da gramática invalida o registro, com o termo em detalhe", () => {
    const invalidos = [
      "ip4:",
      "ip4",
      "ip4:300.1.1.1",
      "ip4:1.2.3.4/33",
      "ip4:01.2.3.4",
      "ip4:1.2.3",
      "ip4:1.2.3.4/024",
      "ip4:1.2.3.4/",
      "ip4:exemplo.net",
      "ip6:",
      "ip6:xyz",
      "ip6:1::2::3",
      "ip6:2001:db8::/129",
      "ip6:12345::",
      "ip6:1:2:3:4:5:6:7",
      "ip6:1:2:3:4:5:6:7:8:9",
      "ip6:1:2:3:4:5:6:7:8::",
      "ip6:1.2.3.4",
      "ip6:::1.2.3.999",
      "ip6:1.2.3.4::",
      "ip6::1",
      "ip6:1:",
      "ip6:::::",
      "include:",
      "include",
      "include:exemplo",
      "include:123.456",
      "include:exemplo.net/24",
      "include:a&b=c.exemplo.net",
      "exists",
      "exists:",
      "foo",
      "foo:exemplo.net",
      "+",
      "-",
      "all:exemplo.net",
      "-all=x",
      "+redirect=exemplo.net",
      "redirect=",
      "redirect=exemplo",
      "redirect=203.0.113.1",
      "exp=",
      "a:",
      "a/33",
      "a//129",
      "a/024",
      "a/",
      "a//",
      "a:exemplo.net/24/64",
      "a/24x",
      "mx:",
      "ptr:",
      "ptr/24",
      "constructor",
      "__proto__:exemplo.net",
    ];
    for (const termo of invalidos) {
      const resultado = lerInvalido(`v=spf1 ${termo} -all`);
      assert.deepEqual(
        resultado.achados,
        [{ codigo: "termo-invalido", gravidade: "erro", detalhe: termo }],
        termo,
      );
      assert.equal(resultado.estagio, "nenhum");
    }
  });

  it("só o primeiro termo inválido vira achado", () => {
    const resultado = lerInvalido("v=spf1 ip4: include: foo -all");
    assert.deepEqual(resultado.achados, [
      { codigo: "termo-invalido", gravidade: "erro", detalhe: "ip4:" },
    ]);
  });

  it("um termo inválido depois do all também invalida (a RFC lê o registro inteiro)", () => {
    assert.equal(lerSpf(["v=spf1 -all ip4:300.1.1.1"]).situacao, "invalido");
  });

  it("o texto do termo inválido em detalhe é cortado em 64 caracteres", () => {
    const resultado = lerInvalido(`v=spf1 ${"x".repeat(300)}`);
    assert.equal(String(resultado.achados[0]?.detalhe).length, 64);
  });

  it("o texto guardado de um termo é cortado em 255 caracteres", () => {
    const { termos } = lerValido(`v=spf1 exp=${"x".repeat(300)}`);
    assert.equal(termos[0]?.texto.length, 255);
  });

  it("redirect e exp repetidos invalidam, com o nome em tag", () => {
    const resultado = lerInvalido("v=spf1 redirect=a.exemplo.net redirect=b.exemplo.net");
    assert.deepEqual(resultado.achados, [
      { codigo: "modificador-repetido", gravidade: "erro", tag: "redirect" },
    ]);
    assert.deepEqual(lerInvalido("v=spf1 exp=a.exemplo.net -all EXP=b.exemplo.net").achados[0], {
      codigo: "modificador-repetido",
      gravidade: "erro",
      tag: "exp",
    });
  });

  it("modificador repetido vem antes do termo inválido", () => {
    const resultado = lerInvalido("v=spf1 foo:x exp=a.exemplo.net exp=b.exemplo.net");
    assert.deepEqual(codigos(resultado), ["modificador-repetido", "termo-invalido"]);
  });

  it("macro bem formada conta como macro e não vira domínio", () => {
    const { termos } = lerValido(
      "v=spf1 include:%{d}._spf.exemplo.net exists:%{i}._spf.%{d2}.exemplo.net a:%{d} -all",
    );
    assert.equal(termos[0]?.macro, true);
    assert.equal(termos[0]?.dominio, undefined);
    assert.equal(termos[1]?.macro, true);
    assert.equal(termos[2]?.macro, true);
    assert.equal(termos[3]?.macro, undefined);
  });

  it("macro mal formada invalida o registro", () => {
    for (const alvo of [
      "%{d._spf.exemplo.net",
      "%{x}.exemplo.net",
      "%.exemplo.net",
      "%{d}%.exemplo.net",
      "%{dd}.exemplo.net",
      "%{d}.exemplo.net/24",
      "%{d}<b>.exemplo.net",
    ]) {
      assert.equal(lerSpf([`v=spf1 include:${alvo} -all`]).situacao, "invalido", alvo);
    }
  });

  it("o redirect também aceita macro", () => {
    const { termos } = lerValido("v=spf1 redirect=%{d}._spf.exemplo.net");
    assert.equal(termos[0]?.macro, true);
    assert.equal(termos[0]?.dominio, undefined);
  });
});

// ---------------------------------------------------------------------------
// RF-03 — ESTÁGIO E ACHADOS DO ALL
// ---------------------------------------------------------------------------

describe("RF-03 — estágio e achados do all", () => {
  it("cada qualificador do all dá o seu estágio e o seu achado", () => {
    const esperado = [
      { termo: "-all", estagio: "rigido", codigo: "all-rigido", gravidade: "info" },
      { termo: "~all", estagio: "suave", codigo: "all-suave", gravidade: "info" },
      { termo: "?all", estagio: "permissivo", codigo: "all-neutro", gravidade: "aviso" },
      { termo: "+all", estagio: "permissivo", codigo: "all-libera-tudo", gravidade: "erro" },
      { termo: "all", estagio: "permissivo", codigo: "all-libera-tudo", gravidade: "erro" },
    ];
    for (const { termo, estagio, codigo, gravidade } of esperado) {
      const resultado = lerValido(`v=spf1 ip4:203.0.113.1 ${termo}`);
      assert.equal(resultado.estagio, estagio, termo);
      assert.deepEqual(resultado.achados, [{ codigo, gravidade, tag: "all" }], termo);
    }
  });

  it("sem all e sem redirect é permissivo, com sem-all", () => {
    const resultado = lerValido("v=spf1 ip4:203.0.113.0/24");
    assert.equal(resultado.estagio, "permissivo");
    assert.deepEqual(resultado.achados, [{ codigo: "sem-all", gravidade: "aviso" }]);
  });

  it("sem all e com redirect é redirecionado, sem sem-all", () => {
    const resultado = lerValido("v=spf1 ip4:203.0.113.1 redirect=_spf.exemplo.net");
    assert.equal(resultado.estagio, "redirecionado");
    assert.deepEqual(resultado.achados, []);
    assert.equal(resultado.termos[1]?.ignorado, undefined);
  });

  it("o estágio é o do primeiro all", () => {
    assert.equal(lerValido("v=spf1 -all +all").estagio, "rigido");
    assert.equal(lerValido("v=spf1 ?all -all").estagio, "permissivo");
  });

  it("redirect num registro com all é ignorado, antes ou depois do all", () => {
    for (const registro of [
      "v=spf1 -all redirect=_spf.exemplo.net",
      "v=spf1 redirect=_spf.exemplo.net -all",
    ]) {
      const resultado = lerValido(registro);
      assert.equal(resultado.estagio, "rigido", registro);
      assert.deepEqual(
        resultado.termos.find((termo) => termo.tipo === "redirect")?.ignorado,
        "redirect-com-all",
      );
      assert.deepEqual(resultado.achados, [
        { codigo: "redirect-ignorado", gravidade: "aviso", tag: "redirect" },
        { codigo: "all-rigido", gravidade: "info", tag: "all" },
      ]);
    }
  });

  it("as diretivas depois do all são ignoradas, com a contagem", () => {
    const { termos, achados } = lerValido(
      "v=spf1 -all ip4:203.0.113.1 include:spf.exemplo.net ~all exp=aviso.exemplo.net",
    );
    assert.deepEqual(
      termos.map((termo) => termo.ignorado),
      [undefined, "apos-all", "apos-all", "apos-all", undefined],
    );
    assert.deepEqual(achados, [
      { codigo: "termos-apos-all", gravidade: "aviso", tag: "all", detalhe: 3 },
      { codigo: "all-rigido", gravidade: "info", tag: "all" },
    ]);
  });

  it("ausente, múltiplos e inválido não têm estágio", () => {
    assert.equal(lerSpf([]).estagio, "nenhum");
    assert.equal(lerSpf(["v=spf1 -all", "v=spf1 ~all"]).estagio, "nenhum");
    assert.equal(lerInvalido("v=spf1 foo").estagio, "nenhum");
  });
});

// ---------------------------------------------------------------------------
// RF-05 — HIGIENE
// ---------------------------------------------------------------------------

describe("RF-05 — higiene do registro", () => {
  it("ptr em uso é aviso, uma vez só", () => {
    const resultado = lerValido("v=spf1 ptr ptr:exemplo.net -all");
    assert.deepEqual(resultado.achados, [
      { codigo: "ptr-em-uso", gravidade: "aviso", tag: "ptr" },
      { codigo: "all-rigido", gravidade: "info", tag: "all" },
    ]);
  });

  it("ptr depois do all não conta: o receptor o ignora", () => {
    assert.ok(!codigos(lerValido("v=spf1 -all ptr")).includes("ptr-em-uso"));
  });

  it("513 caracteres é registro grande; 512 não", () => {
    const base = "v=spf1 -all";
    const com512 = lerValido(base + " ".repeat(512 - base.length));
    const com513 = lerValido(base + " ".repeat(513 - base.length));
    assert.ok(!codigos(com512).includes("registro-grande"));
    assert.deepEqual(
      com513.achados.find((achado) => achado.codigo === "registro-grande"),
      { codigo: "registro-grande", gravidade: "aviso", detalhe: 513 },
    );
  });

  it("ip4, ip6 e include repetidos são aviso informativo, uma vez por termo", () => {
    const resultado = lerValido(
      "v=spf1 ip4:203.0.113.1 ip4:203.0.113.1 ip4:203.0.113.1 include:spf.exemplo.net INCLUDE:SPF.exemplo.net ip6:2001:db8::/32 ip6:2001:DB8::/32 -all",
    );
    assert.deepEqual(
      resultado.achados.filter((achado) => achado.codigo === "termo-repetido"),
      [
        { codigo: "termo-repetido", gravidade: "info", tag: "ip4", detalhe: "ip4:203.0.113.1" },
        {
          codigo: "termo-repetido",
          gravidade: "info",
          tag: "include",
          detalhe: "INCLUDE:SPF.exemplo.net",
        },
        {
          codigo: "termo-repetido",
          gravidade: "info",
          tag: "ip6",
          detalhe: "ip6:2001:DB8::/32",
        },
      ],
    );
  });

  it("redes diferentes ou qualificadores diferentes não são repetição", () => {
    const resultado = lerValido("v=spf1 ip4:203.0.113.1 ip4:203.0.113.1/32 -ip4:203.0.113.1 -all");
    assert.ok(!codigos(resultado).includes("termo-repetido"));
  });

  it("a e mx repetidos não são avisados", () => {
    assert.ok(!codigos(lerValido("v=spf1 a a mx mx -all")).includes("termo-repetido"));
  });

  it("os achados vêm por gravidade e, dentro dela, na ordem de geração", () => {
    const resultado = lerValido(
      "V=SPF1 ip4:203.0.113.1 ip4:203.0.113.1 ptr redirect=_spf.exemplo.net +all ip4:198.51.100.1",
    );
    assert.deepEqual(codigos(resultado), [
      "all-libera-tudo",
      "ptr-em-uso",
      "termos-apos-all",
      "redirect-ignorado",
      "termo-repetido",
      "caixa-fora-do-padrao",
    ]);
    assert.deepEqual(
      resultado.achados.map((achado) => achado.gravidade),
      ["erro", "aviso", "aviso", "aviso", "info", "info"],
    );
  });
});

// ---------------------------------------------------------------------------
// RF-06 — ENTRADA HOSTIL
// ---------------------------------------------------------------------------

describe("RF-06 — entrada hostil", () => {
  it("marcação no registro fica como texto, e o registro volta intacto", () => {
    const registro = "v=spf1 <script>alert(1)</script> -all";
    const resultado = lerInvalido(registro);
    assert.equal(resultado.registro, registro);
    assert.equal(resultado.achados[0]?.detalhe, "<script>alert(1)</script>");
  });

  it("marcação num termo ou num alvo recusa o alvo, sem exceção", () => {
    for (const termo of [
      "include:<script>.exemplo.net",
      "a:exemplo.net<img",
      "ip4:<b>",
      "redirect=<script>",
      'include:"><svg/onload=1>.exemplo.net',
    ]) {
      const resultado = lerSpf([`v=spf1 ${termo} -all`]);
      assert.equal(resultado.situacao, "invalido", termo);
    }
  });

  it("marcação no exp passa como texto e não vira alvo", () => {
    const { termos } = lerValido("v=spf1 -all exp=<script>alert(1)</script>");
    assert.equal(termos[1]?.dominio, undefined);
    assert.equal(termos[1]?.texto, "exp=<script>alert(1)</script>");
  });

  it("caracteres de controle invalidam o termo", () => {
    for (const texto of ["v=spf1 \u0000 -all", "v=spf1 a\nb -all", "v=spf1 include:ex\u0007.net"]) {
      assert.equal(lerSpf([texto]).situacao, "invalido", JSON.stringify(texto));
    }
  });

  it("2000 termos são lidos em tempo curto", () => {
    const registro = `v=spf1${" a".repeat(2000)}`;
    const inicio = performance.now();
    const resultado = lerValido(registro);
    assert.equal(resultado.termos.length, 2000);
    assert.ok(performance.now() - inicio < 1000);
  });

  it("padrões que dariam retrocesso são lidos em tempo curto", () => {
    const entradas = [
      `v=spf1 a:${"x".repeat(60)}${"/1".repeat(1500)}`,
      `v=spf1 a${"/".repeat(4000)}`,
      `v=spf1 include:${"%".repeat(4000)}`,
      `v=spf1 include:${"%{d}".repeat(800)}`,
      `v=spf1 ip6:${"1:".repeat(2000)}`,
      `v=spf1 ${"+".repeat(4000)}`,
      `v=spf1 ${"a=".repeat(2000)}`,
    ];
    const inicio = performance.now();
    for (const entrada of entradas) {
      assert.ok(["valido", "invalido"].includes(lerSpf([entrada]).situacao));
    }
    assert.ok(performance.now() - inicio < 1000);
  });

  it("nenhuma entrada estranha lança", () => {
    const estranhas = [
      undefined,
      null,
      0,
      NaN,
      "",
      "v=spf1",
      [],
      [[]],
      [{}],
      [Symbol.iterator.toString()],
      [new String("v=spf1 -all")],
      ["v=spf1 " + "\u{1F600}".repeat(500)],
      ["v=spf1 include:" + "\u0000".repeat(100)],
      ["v=spf1 ip6:" + ":".repeat(300)],
    ];
    for (const entrada of estranhas) {
      assert.doesNotThrow(() => lerSpf(/** @type {any} */ (entrada)));
    }
  });
});
