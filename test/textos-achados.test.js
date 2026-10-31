/**
 * @file Testes do catálogo de textos dos achados (RF-08 e RF-09 da spec 006, ADR-7).
 *
 * O catálogo tem de cobrir exatamente os códigos que os cinco módulos de leitura emitem. O
 * teste lê o fonte desses módulos e extrai os códigos por padrões de texto, nos dois sentidos:
 * código sem entrada (a página mostraria o texto genérico) e entrada sem código (texto
 * morto). A varredura é textual, então outro teste exige que cada arquivo renda ao menos um
 * código: se alguém mudar o jeito de escrever achados, a varredura vazia falha alto em vez de
 * calar.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { TEXTOS_ACHADOS, textoDoAchado } from "../public/js/textos-achados.js";

// ---------------------------------------------------------------------------
// VARREDURA DOS MÓDULOS
// ---------------------------------------------------------------------------

const ARQUIVOS = ["dmarc", "spf", "spf-consultas", "dkim", "dkim-busca"];

// Os jeitos de escrever um achado nos módulos. O quarto padrão amplia o terceiro do ADR-7
// (`("x", "gravidade"`): o `spf.js` guarda os códigos do `all` numa tabela, como
// `["rigido", "all-rigido", "info"]`, sem o parêntese. O quinto cobre os códigos montados por
// `${tipo}-...`, que só `include` e `redirect` usam.
const PADROES = [
  /codigo: "([a-z0-9-]+)"/g,
  /achar\(\s*"([a-z0-9-]+)"/g,
  /"([a-z0-9-]+)",\s*"(?:erro|aviso|info)"/g,
];
const PADRAO_MODELO = /achar\(`\$\{tipo\}-([a-z0-9-]+)`/g;
const TIPOS_SEGUIDOS = ["include", "redirect"];

/**
 * @param {string} nome - Nome do módulo, sem extensão.
 * @returns {Promise<Set<string>>} Os códigos de achado escritos no fonte dele.
 */
const codigosDe = async (nome) => {
  const fonte = await readFile(new URL(`../public/js/${nome}.js`, import.meta.url), "utf8");
  const codigos = new Set();
  for (const padrao of PADROES) {
    for (const achado of fonte.matchAll(padrao)) {
      codigos.add(achado[1]);
    }
  }
  for (const achado of fonte.matchAll(PADRAO_MODELO)) {
    for (const tipo of TIPOS_SEGUIDOS) {
      codigos.add(`${tipo}-${achado[1]}`);
    }
  }
  return codigos;
};

/** @returns {Promise<Set<string>>} Os códigos dos cinco módulos juntos. */
const todosOsCodigos = async () => {
  const conjuntos = await Promise.all(ARQUIVOS.map(codigosDe));
  return new Set(conjuntos.flatMap((conjunto) => [...conjunto]));
};

// ---------------------------------------------------------------------------
// COBERTURA
// ---------------------------------------------------------------------------

describe("catálogo de textos: cobertura dos códigos", () => {
  for (const arquivo of ARQUIVOS) {
    it(`a varredura de ${arquivo}.js acha ao menos um código`, async () => {
      assert.ok((await codigosDe(arquivo)).size > 0);
    });
  }

  it("todo código emitido pelos módulos tem entrada no catálogo", async () => {
    const semEntrada = [...(await todosOsCodigos())].filter(
      (codigo) => !Object.hasOwn(TEXTOS_ACHADOS, codigo),
    );

    assert.deepEqual(semEntrada, []);
  });

  it("toda entrada do catálogo é de um código que algum módulo emite", async () => {
    const emitidos = await todosOsCodigos();
    const sobrando = Object.keys(TEXTOS_ACHADOS).filter((codigo) => !emitidos.has(codigo));

    assert.deepEqual(sobrando, []);
  });
});

// ---------------------------------------------------------------------------
// CONTEÚDO
// ---------------------------------------------------------------------------

describe("catálogo de textos: conteúdo", () => {
  it("nenhuma entrada tem campo vazio e todas dizem se são provisórias", () => {
    for (const [codigo, entrada] of Object.entries(TEXTOS_ACHADOS)) {
      for (const campo of /** @type {const} */ (["titulo", "explicacao", "acao"])) {
        assert.ok(entrada[campo].trim().length > 0, `${codigo}.${campo} está vazio`);
      }
      assert.equal(typeof entrada.provisorio, "boolean", `${codigo}.provisorio`);
    }
  });

  it("nenhum texto afirma o que a ferramenta não sabe", () => {
    // "Você não tem DKIM", "protegido" e "garante" são promessas que a ferramenta não cumpre.
    const proibidas = /você não tem dkim|não tem dkim|protegid[oa]|garant(?:e|ia|ido)|100 ?%/i;

    for (const [codigo, entrada] of Object.entries(TEXTOS_ACHADOS)) {
      const texto = `${entrada.titulo} ${entrada.explicacao} ${entrada.acao}`;
      assert.doesNotMatch(texto, proibidas, `${codigo} tem frase proibida`);
    }
  });

  it("os crases abrem e fecham em pares, para o trecho de código não ficar solto", () => {
    for (const [codigo, entrada] of Object.entries(TEXTOS_ACHADOS)) {
      for (const campo of /** @type {const} */ (["titulo", "explicacao", "acao"])) {
        const crases = entrada[campo].split("`").length - 1;
        assert.equal(crases % 2, 0, `${codigo}.${campo} tem crase sem par`);
      }
    }
  });

  it("o texto do DKIM não achado diz que não encontrou nesses seletores", () => {
    const entrada = TEXTOS_ACHADOS["nenhum-seletor-encontrado"];

    assert.match(entrada?.titulo ?? "", /não encontrei nesses seletores/i);
  });
});

// ---------------------------------------------------------------------------
// textoDoAchado
// ---------------------------------------------------------------------------

describe("textoDoAchado", () => {
  it("junta o achado ao texto do catálogo e guarda gravidade, tag e detalhe", () => {
    const visivel = textoDoAchado({
      codigo: "aplicacao-parcial",
      gravidade: "aviso",
      tag: "pct",
      detalhe: 50,
    });

    assert.equal(visivel.titulo, TEXTOS_ACHADOS["aplicacao-parcial"]?.titulo);
    assert.equal(visivel.gravidade, "aviso");
    assert.equal(visivel.tag, "pct");
    assert.equal(visivel.detalhe, "50");
  });

  it("não inventa campos que o achado não tem", () => {
    const visivel = textoDoAchado({ codigo: "sem-all", gravidade: "aviso" });

    assert.deepEqual(Object.keys(visivel).sort(), [
      "acao",
      "codigo",
      "explicacao",
      "gravidade",
      "titulo",
    ]);
  });

  it("código desconhecido vira texto genérico com o código, sem quebrar", () => {
    const visivel = textoDoAchado({ codigo: "codigo-que-nao-existe", gravidade: "info" });

    assert.match(visivel.explicacao, /`codigo-que-nao-existe`/);
    assert.equal(visivel.gravidade, "info");
    assert.ok(visivel.titulo.length > 0 && visivel.acao.length > 0);
  });

  it("nomes que existem em todo objeto não contam como código do catálogo", () => {
    for (const codigo of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const visivel = textoDoAchado({ codigo, gravidade: "info" });

      assert.match(visivel.explicacao, /Código:/);
    }
  });

  it("traduz o motivo do seletor digitado recusado", () => {
    const visivel = textoDoAchado({
      codigo: "seletor-invalido",
      gravidade: "info",
      detalhe: "caractere-invalido",
    });

    assert.doesNotMatch(visivel.detalhe ?? "", /caractere-invalido/);
    assert.match(visivel.detalhe ?? "", /não aceita/);
  });

  it("deixa passar o detalhe de motivo desconhecido como texto", () => {
    const visivel = textoDoAchado({
      codigo: "seletor-invalido",
      gravidade: "info",
      detalhe: "<b>x</b>",
    });

    assert.equal(visivel.detalhe, "<b>x</b>");
  });
});
