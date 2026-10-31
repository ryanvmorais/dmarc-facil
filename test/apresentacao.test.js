/**
 * @file Testes de `apresentacao.js`, a camada que decide o que cada cartão mostra (RF-04 a
 * RF-08, RF-11 e RF-13 da spec 006).
 *
 * Os estados vêm dos leitores reais sobre registros sintéticos (`exemplo.com.br`). O que mais
 * pesa: o DKIM nunca diz "você não tem", a contagem do SPF é "pelo menos N" quando incompleta,
 * texto de terceiros sai cortado e como texto puro, e a frase do `aria-live` não afirma mais
 * do que o selo.
 */

// @ts-check

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  anunciarFim,
  anunciarInexistente,
  anunciarInicio,
  apresentarDkim,
  apresentarDmarc,
  apresentarSpf,
  cortarTexto,
  lerSeletoresDigitados,
  mensagemDeFalha,
  partirCodigo,
  preencher,
  resumoConsultas,
  rodapeDosResolvedores,
} from "../public/js/apresentacao.js";
import { ORIENTACOES, SELETORES_COMUNS } from "../public/js/seletores-dkim.js";
import { chaveEd25519 } from "./ajudas/chave-sintetica.js";
import {
  DOMINIO,
  estadoDkim,
  estadoDmarc,
  estadoSpf,
  falha,
  REGISTRO_DKIM,
  verificando,
} from "./ajudas/estados.js";

const NOME_GOOGLE = "google._domainkey.exemplo.com.br";
const DMARC_NONE = "v=DMARC1; p=none; rua=mailto:dmarc@exemplo.com.br";

// ---------------------------------------------------------------------------
// TEXTO
// ---------------------------------------------------------------------------

describe("cortarTexto", () => {
  it("deixa o texto curto como está", () => {
    assert.deepEqual(cortarTexto("v=DMARC1; p=none", 100), {
      texto: "v=DMARC1; p=none",
      cortado: false,
    });
  });

  it("não corta no limite exato", () => {
    assert.deepEqual(cortarTexto("abcde", 5), { texto: "abcde", cortado: false });
  });

  it("corta o que passa e marca com reticências", () => {
    assert.deepEqual(cortarTexto("abcdefgh", 5), { texto: "abcde…", cortado: true });
  });

  it("troca caracteres de controle e de inversão de sentido por um marcador visível", () => {
    const { texto } = cortarTexto("a\u0000b\u001bc‮d⁦e", 100);

    assert.equal(texto, "a�b�c�d�e");
  });

  it("não parte um emoji ao meio", () => {
    const { texto } = cortarTexto("😀😀😀", 2);

    assert.equal(texto, "😀😀…");
  });

  it("aguenta 100 KB", () => {
    const { texto, cortado } = cortarTexto("a".repeat(100_000), 1000);

    assert.equal(cortado, true);
    assert.equal(texto.length, 1001);
  });
});

describe("preencher", () => {
  it("troca os marcadores e deixa vazio o que não tem valor", () => {
    assert.equal(preencher("{a} de {b} e {c}", { a: 7, b: "10" }), "7 de 10 e ");
  });

  it("não expande de novo um valor que parece marcador", () => {
    assert.equal(preencher("x {a}", { a: "{b}", b: "ataque" }), "x {b}");
  });
});

describe("partirCodigo", () => {
  it("separa texto e código entre crases", () => {
    assert.deepEqual(partirCodigo("troque `p=none` por `p=quarantine`."), [
      { texto: "troque ", codigo: false },
      { texto: "p=none", codigo: true },
      { texto: " por ", codigo: false },
      { texto: "p=quarantine", codigo: true },
      { texto: ".", codigo: false },
    ]);
  });

  it("texto sem crase é um trecho só", () => {
    assert.deepEqual(partirCodigo("só texto"), [{ texto: "só texto", codigo: false }]);
  });

  it("crase sem par deixa o resto como texto", () => {
    assert.deepEqual(partirCodigo("a `b"), [
      { texto: "a ", codigo: false },
      { texto: "b", codigo: false },
    ]);
  });
});

// ---------------------------------------------------------------------------
// SELETORES DIGITADOS
// ---------------------------------------------------------------------------

describe("lerSeletoresDigitados", () => {
  it("separa por vírgula, espaço e quebra de linha", () => {
    const { validos, recusados } = lerSeletoresDigitados("k1, meuprovedor\nsel2   sel3,,\n");

    assert.deepEqual(validos, ["k1", "meuprovedor", "sel2", "sel3"]);
    assert.deepEqual(recusados, []);
  });

  it("passa para minúsculas e tira os repetidos", () => {
    assert.deepEqual(lerSeletoresDigitados("K1, k1, K1").validos, ["k1"]);
  });

  it("recusa o inválido com o motivo em português e segue com os demais", () => {
    const { validos, recusados } = lerSeletoresDigitados(
      "bom, google._domainkey.exemplo.com.br, a/b",
    );

    assert.deepEqual(validos, ["bom"]);
    assert.equal(recusados.length, 2);
    assert.match(recusados[0]?.motivo ?? "", /nome completo/);
    assert.match(recusados[1]?.motivo ?? "", /não aceita/);
    assert.ok(recusados.every((item) => !/^[a-z]+(-[a-z]+)+$/.test(item.motivo)));
  });

  it("texto vazio não dá seletor nem recusa", () => {
    assert.deepEqual(lerSeletoresDigitados("  \n , "), { validos: [], recusados: [] });
  });

  it("texto hostil sai recusado, cortado e sem virar seletor", () => {
    const { validos, recusados } = lerSeletoresDigitados(
      `<script>alert(1)</script> ${"x".repeat(500)}`,
    );

    assert.deepEqual(validos, []);
    assert.equal(recusados[0]?.texto, "<script>alert(1)</script>");
    assert.ok((recusados[1]?.texto.length ?? 0) <= 41);
  });
});

// ---------------------------------------------------------------------------
// FALHA E CONTAGEM
// ---------------------------------------------------------------------------

describe("mensagemDeFalha", () => {
  it("usa a causa que a consulta devolveu e diz que não é defeito do registro", () => {
    const mensagem = mensagemDeFalha(
      falha("spf", "Não consegui consultar o DNS agora, nem pela Cloudflare nem pelo Google."),
    );

    assert.match(mensagem, /nem pela Cloudflare nem pelo Google/);
    assert.match(mensagem, /Isso não diz nada sobre o seu SPF/);
  });

  it("outra causa, outra mensagem", () => {
    const mensagem = mensagemDeFalha(falha("dkim", "O nome consultado não é válido."));

    assert.match(mensagem, /O nome consultado não é válido\./);
    assert.match(mensagem, /seu DKIM/);
    assert.doesNotMatch(mensagem, /Cloudflare/);
  });

  it("sem causa, usa o texto geral", () => {
    assert.match(mensagemDeFalha(falha("dmarc", "  ")), /Não consegui consultar o DNS agora\./);
  });

  it("parte que não falhou não tem mensagem de falha", () => {
    assert.equal(mensagemDeFalha(verificando("spf")), "");
  });
});

describe("resumoConsultas", () => {
  it("diz N de 10", () => {
    assert.equal(
      resumoConsultas({ total: 7, limite: 10, incompleta: false }),
      "7 de 10 consultas DNS, no pior caso.",
    );
  });

  it("diz pelo menos N quando a contagem ficou incompleta", () => {
    const texto = resumoConsultas({ total: 4, limite: 10, incompleta: true });

    assert.match(texto, /^Pelo menos 4 de 10 consultas DNS/);
    assert.match(texto, /pode ser maior/);
  });

  it("acima de 10 mostra o número real", () => {
    assert.match(resumoConsultas({ total: 13, limite: 10, incompleta: false }), /^13 de 10/);
  });
});

// ---------------------------------------------------------------------------
// CARTÃO DE DMARC
// ---------------------------------------------------------------------------

describe("apresentarDmarc", () => {
  it("válido: selo, registro cru e achados com texto; sem resumo repetido", () => {
    const cartao = apresentarDmarc(estadoDmarc([DMARC_NONE]));

    assert.equal(cartao.id, "dmarc");
    assert.equal(cartao.titulo, "DMARC");
    assert.equal(cartao.selo.estado, "atencao");
    assert.equal(cartao.registro?.texto, DMARC_NONE);
    assert.equal(cartao.resumo, "");
    assert.deepEqual(
      cartao.achados.map((achado) => achado.codigo),
      ["monitoramento-apenas"],
    );
    assert.ok((cartao.achados[0]?.titulo ?? "").length > 0);
  });

  it("ausente: selo problema, texto do que a ausência causa e sem registro cru", () => {
    const cartao = apresentarDmarc(estadoDmarc([]));

    assert.equal(cartao.selo.estado, "problema");
    assert.match(cartao.resumo, /não publica DMARC/);
    assert.equal(cartao.registro, undefined);
    assert.deepEqual(cartao.achados, []);
  });

  it("inválido: mostra o registro e os achados, com o resumo de erro", () => {
    const cartao = apresentarDmarc(estadoDmarc(["v=DMARC1; p=talvez"]));

    assert.equal(cartao.selo.estado, "problema");
    assert.equal(cartao.registro?.texto, "v=DMARC1; p=talvez");
    assert.match(cartao.resumo, /tem erro/);
    assert.equal(cartao.achados[0]?.codigo, "politica-invalida");
  });

  it("múltiplos: diz quantos registros há", () => {
    const cartao = apresentarDmarc(estadoDmarc(["v=DMARC1; p=none", "v=DMARC1; p=reject"]));

    assert.equal(cartao.selo.estado, "problema");
    assert.match(cartao.resumo, /2 registros DMARC/);
  });

  it("verificando e falha não têm registro nem achado", () => {
    const espera = apresentarDmarc(verificando("dmarc"));
    const caiu = apresentarDmarc(falha("dmarc"));

    assert.equal(espera.fase, "verificando");
    assert.match(espera.resumo, /Consultando/);
    assert.equal(caiu.fase, "falha");
    assert.equal(caiu.selo.estado, "nao-verificado");
    assert.equal(caiu.registro, undefined);
  });

  it("registro hostil e enorme vira texto cortado, sem marcação", () => {
    const hostil = `v=DMARC1; p=none; <script>alert(1)</script> ${"a".repeat(3000)}`;
    const cartao = apresentarDmarc(estadoDmarc([hostil]));

    assert.equal(cartao.registro?.cortado, true);
    assert.ok((cartao.registro?.texto.length ?? 0) <= 1001);
    assert.match(cartao.registro?.texto ?? "", /^v=DMARC1; p=none; <script>/);
  });

  it("rua aparece como texto no registro e nenhum campo do cartão é link mailto:", () => {
    const cartao = apresentarDmarc(estadoDmarc([DMARC_NONE]));
    const json = JSON.stringify(cartao);

    assert.match(cartao.registro?.texto ?? "", /rua=mailto:dmarc@exemplo\.com\.br/);
    assert.doesNotMatch(json, /"href"|"url"|"link"/);
  });

  it("o detalhe de um achado vem como texto cortado", () => {
    const estado = estadoDmarc([DMARC_NONE]);
    assert.ok(estado.resultado.situacao === "valido");
    estado.resultado.achados.push({
      codigo: "x",
      gravidade: "info",
      detalhe: /** @type {any} */ ("z".repeat(500)),
    });
    const cartao = apresentarDmarc(estado);
    const ultimo = cartao.achados.at(-1);

    assert.ok((ultimo?.detalhe?.length ?? 0) <= 121);
  });

  it("mantém os achados na ordem do módulo", () => {
    const estado = estadoDmarc([DMARC_NONE]);
    assert.ok(estado.resultado.situacao === "valido");
    estado.resultado.achados.splice(
      0,
      estado.resultado.achados.length,
      { codigo: "sem-relatorio-agregado", gravidade: "aviso" },
      { codigo: "caixa-fora-do-padrao", gravidade: "info" },
      { codigo: "tag-duplicada", gravidade: "aviso" },
    );

    assert.deepEqual(
      apresentarDmarc(estado).achados.map((achado) => achado.codigo),
      ["sem-relatorio-agregado", "caixa-fora-do-padrao", "tag-duplicada"],
    );
  });
});

// ---------------------------------------------------------------------------
// CARTÃO DE SPF
// ---------------------------------------------------------------------------

describe("apresentarSpf", () => {
  it("válido: contagem, terminação em português e registro cru", async () => {
    const cartao = apresentarSpf(await estadoSpf({ [DOMINIO]: ["v=spf1 ip4:203.0.113.10 ~all"] }));

    assert.equal(cartao.selo.estado, "ok");
    assert.match(cartao.resumo, /^0 de 10 consultas DNS/);
    assert.match(cartao.resumo, /Termina em `~all`\./);
    assert.equal(cartao.registro?.texto, "v=spf1 ip4:203.0.113.10 ~all");
  });

  it("cada terminação aparece com o seu sinal", async () => {
    for (const sinal of ["-", "~", "?", "+"]) {
      const cartao = apresentarSpf(await estadoSpf({ [DOMINIO]: [`v=spf1 ${sinal}all`] }));

      assert.match(cartao.resumo, new RegExp(`Termina em \`\\${sinal}all\``));
    }
  });

  it("sem all: diz que não termina em all", async () => {
    const cartao = apresentarSpf(await estadoSpf({ [DOMINIO]: ["v=spf1 ip4:203.0.113.10"] }));

    assert.match(cartao.resumo, /Não termina em `all`/);
  });

  it("passou de 10: selo problema e diz que falha por limite, não por sintaxe", async () => {
    const includes = Array.from({ length: 11 }, (_, i) => `include:s${i}.exemplo.com.br`);
    /** @type {Record<string, string[]>} */
    const mapa = { [DOMINIO]: [`v=spf1 ${includes.join(" ")} -all`] };
    for (let i = 0; i < 11; i += 1) {
      mapa[`s${i}.exemplo.com.br`] = ["v=spf1 ip4:203.0.113.10 -all"];
    }
    const cartao = apresentarSpf(await estadoSpf(mapa));

    assert.equal(cartao.selo.estado, "problema");
    assert.match(cartao.resumo, /^11 de 10 consultas DNS/);
    assert.match(cartao.resumo, /limite de consultas, e não por erro de sintaxe/);
    assert.ok(cartao.achados.some((achado) => achado.codigo === "limite-de-consultas"));
  });

  it("incompleta: diz pelo menos N", async () => {
    const cartao = apresentarSpf(
      await estadoSpf({
        [DOMINIO]: ["v=spf1 include:filho.exemplo.com.br -all"],
        "filho.exemplo.com.br": "FALHA",
      }),
    );

    assert.match(cartao.resumo, /^Pelo menos 1 de 10 consultas DNS/);
    assert.equal(cartao.selo.estado, "atencao");
  });

  it("ausente, inválido e múltiplos têm o seu texto", async () => {
    const ausente = apresentarSpf(await estadoSpf({}));
    const invalido = apresentarSpf(await estadoSpf({ [DOMINIO]: ["v=spf1 foo:bar -all"] }));
    const multiplos = apresentarSpf(await estadoSpf({ [DOMINIO]: ["v=spf1 -all", "v=spf1 ~all"] }));

    assert.match(ausente.resumo, /não publica SPF/);
    assert.equal(ausente.registro, undefined);
    assert.match(invalido.resumo, /tem erro/);
    assert.equal(invalido.registro?.texto, "v=spf1 foo:bar -all");
    assert.match(multiplos.resumo, /2 registros SPF/);
    for (const cartao of [ausente, invalido, multiplos]) {
      assert.equal(cartao.selo.estado, "problema");
    }
  });

  it("falha da raiz: não verificado, com a causa", async () => {
    const cartao = apresentarSpf(await estadoSpf({ [DOMINIO]: "FALHA" }));

    assert.equal(cartao.fase, "falha");
    assert.equal(cartao.selo.estado, "nao-verificado");
    assert.match(cartao.resumo, /seu SPF/);
  });
});

// ---------------------------------------------------------------------------
// CARTÃO DE DKIM
// ---------------------------------------------------------------------------

describe("apresentarDkim", () => {
  it("encontrado: diz o seletor, o tipo e o tamanho da chave e quantos tentou", async () => {
    const cartao = apresentarDkim(
      await estadoDkim(["google", "selector1"], { [NOME_GOOGLE]: [REGISTRO_DKIM] }),
    );

    assert.equal(cartao.selo.estado, "ok");
    assert.match(cartao.resumo, /seletor `google` \(RSA de 2048 bits\)/);
    assert.match(cartao.resumo, /Procurei em 2 seletores/);
    assert.equal(cartao.extra?.encontrados[0]?.provedor, "Google Workspace");
  });

  it("encontrado em mais de um seletor cita todos", async () => {
    const cartao = apresentarDkim(
      await estadoDkim(["google", "selector1"], {
        [NOME_GOOGLE]: [REGISTRO_DKIM],
        "selector1._domainkey.exemplo.com.br": [REGISTRO_DKIM],
      }),
    );

    assert.match(cartao.resumo, /2 seletores: `google`, `selector1`/);
  });

  it("não encontrado: 'não encontrei', nunca 'você não tem'; selo atenção", async () => {
    const cartao = apresentarDkim(await estadoDkim(["google", "selector1", "s1"], {}));

    assert.equal(cartao.selo.estado, "atencao");
    assert.match(cartao.resumo, /Não encontrei chave DKIM nesses 3 seletores/);
    assert.match(cartao.resumo, /quem envia o e-mail escolhe o nome do seletor/);
    assert.doesNotMatch(JSON.stringify(cartao), /você não tem/i);
    assert.equal(cartao.extra?.mostrarCampo, true);
  });

  it("indeterminado: diz que a lista não foi toda verificada", async () => {
    const cartao = apresentarDkim(
      await estadoDkim(["a", "b", "c", "d"], {
        "a._domainkey.exemplo.com.br": "FALHA",
        "b._domainkey.exemplo.com.br": "FALHA",
        "c._domainkey.exemplo.com.br": "FALHA",
        "d._domainkey.exemplo.com.br": "FALHA",
      }),
    );

    assert.equal(cartao.selo.estado, "nao-verificado");
    assert.match(cartao.resumo, /Parte das consultas falhou e a lista não foi toda verificada/);
    assert.match(cartao.resumo, /0 de 4 seletores/);
  });

  it("lista dos tentados com provedor e link só https; digitado não tem provedor", async () => {
    const cartao = apresentarDkim(await estadoDkim(["google", "meu-seletor"], {}));
    const [comum, digitado] = cartao.extra?.tentados ?? [];

    assert.equal(comum?.provedor, "Google Workspace");
    assert.match(comum?.documentacao ?? "", /^https:\/\//);
    assert.equal(digitado?.provedor, undefined);
    assert.equal(digitado?.documentacao, undefined);
    for (const item of cartao.extra?.tentados ?? []) {
      assert.ok(item.documentacao === undefined || item.documentacao.startsWith("https://"));
    }
  });

  it("os links dos dados da lista comum passam todos pelo filtro https", async () => {
    const seletores = SELETORES_COMUNS.map((item) => item.seletor);
    const cartao = apresentarDkim(await estadoDkim(seletores, {}));

    assert.equal(cartao.extra?.tentados.length, seletores.length);
    assert.ok(cartao.extra?.tentados.every((item) => item.documentacao?.startsWith("https://")));
  });

  it("as orientações dos provedores sem seletor fixo pedem para digitar o seletor", async () => {
    const cartao = apresentarDkim(await estadoDkim(["google"], {}));

    assert.equal(cartao.extra?.orientacoes.length, ORIENTACOES.length);
    for (const orientacao of cartao.extra?.orientacoes ?? []) {
      assert.ok(orientacao.provedor.length > 0);
      assert.match(orientacao.texto, /digite o seletor que o painel do provedor mostra/);
      assert.ok(orientacao.documentacao?.startsWith("https://"));
    }
  });

  it("as recusas do campo livre chegam com o texto e o motivo", async () => {
    const { recusados } = lerSeletoresDigitados("a/b");
    const cartao = apresentarDkim(await estadoDkim(["google"], {}), { recusados });

    assert.match(cartao.extra?.recusados[0]?.texto ?? "", /Não aceitei `a\/b`: .*não aceita/);
  });

  it("verificando cita quantos seletores comuns procura", () => {
    const cartao = apresentarDkim(verificando("dkim"), { totalSeletores: 18 });

    assert.equal(cartao.fase, "verificando");
    assert.match(cartao.resumo, /Procurando em 18 seletores/);
    assert.equal(cartao.extra, undefined);
  });

  it("descreve cada tipo de chave: Ed25519, RSA ilegível e tipo desconhecido", async () => {
    /** @type {Array<[string, RegExp]>} Registro e o que o resumo deve citar. */
    const casos = [
      [`v=DKIM1; k=ed25519; p=${chaveEd25519()}`, /\(Ed25519\)/],
      ["v=DKIM1; k=rsa; p=AAAAAAAA", /\(RSA, tamanho não lido\)/],
      ["v=DKIM1; k=xyz; p=AAAAAAAA", /\(tipo de chave que não conheço\)/],
    ];

    for (const [registro, esperado] of casos) {
      const cartao = apresentarDkim(await estadoDkim(["google"], { [NOME_GOOGLE]: [registro] }));

      assert.match(cartao.resumo, esperado);
    }
  });

  it("parte dos seletores sem verificar, mas com chave achada, cita as duas coisas", async () => {
    const cartao = apresentarDkim(
      await estadoDkim(["google", "a", "b", "c", "d"], {
        [NOME_GOOGLE]: [REGISTRO_DKIM],
        "a._domainkey.exemplo.com.br": "FALHA",
        "b._domainkey.exemplo.com.br": "FALHA",
        "c._domainkey.exemplo.com.br": "FALHA",
      }),
    );

    assert.match(cartao.resumo, /Encontrei a chave no seletor `google`/);
    assert.match(cartao.resumo, /Parte das consultas falhou/);
  });

  it("agrupa o mesmo achado de seletores diferentes num só, na ordem da primeira aparição", async () => {
    const revogado = "v=DKIM1; p=";
    const cartao = apresentarDkim(
      await estadoDkim(["google", "selector1", "s1"], {
        [NOME_GOOGLE]: [revogado],
        "selector1._domainkey.exemplo.com.br": [revogado],
        "s1._domainkey.exemplo.com.br": [revogado],
      }),
    );
    const revogados = cartao.achados.filter((achado) => achado.codigo === "chave-revogada");

    assert.equal(revogados.length, 1);
    assert.deepEqual(revogados[0]?.seletores, ["google", "selector1", "s1"]);
    assert.equal(revogados[0]?.seletor, "google");
  });

  it("não agrupa achados de seletores diferentes quando o detalhe é diferente", async () => {
    const cartao = apresentarDkim(
      await estadoDkim(["google", "selector1"], {
        [NOME_GOOGLE]: [`v=DKIM1; k=xyz; p=AAAAAAAA`],
        "selector1._domainkey.exemplo.com.br": [`v=DKIM1; k=abc; p=AAAAAAAA`],
      }),
    );
    const desconhecidos = cartao.achados.filter(
      (achado) => achado.codigo === "tipo-de-chave-desconhecido",
    );

    assert.equal(desconhecidos.length, 2);
    assert.equal(desconhecidos[0]?.seletores, undefined);
  });

  it("os achados de cada seletor vêm com o seletor", async () => {
    const estado = await estadoDkim(["google"], {
      [NOME_GOOGLE]: [`v=DKIM1; k=rsa; t=y; p=${REGISTRO_DKIM.split("p=")[1]}`],
    });
    const cartao = apresentarDkim(estado);
    const modo = cartao.achados.find((achado) => achado.codigo === "modo-de-teste");

    assert.equal(modo?.seletor, "google");
  });
});

// ---------------------------------------------------------------------------
// RESULTADO E ANÚNCIOS
// ---------------------------------------------------------------------------

/**
 * @param {import("../public/js/tipos.js").EstadoSpf} spf - Estado do SPF.
 * @param {import("../public/js/tipos.js").EstadoDkim} dkim - Estado do DKIM.
 * @param {import("../public/js/tipos.js").EstadoDmarc} dmarc - Estado do DMARC.
 * @returns {import("../public/js/tipos.js").EstadoVerificacao} O estado das três partes.
 */
const verificacao = (spf, dkim, dmarc) => ({
  dominio: DOMINIO,
  geracao: 1,
  dominioInexistente: false,
  partes: { dmarc, spf, dkim },
});

describe("anúncios para leitor de tela", () => {
  it("anuncia o início com o domínio", () => {
    assert.equal(anunciarInicio("exemplo.com.br"), "Verificando exemplo.com.br.");
  });

  it("anuncia o domínio que não existe", () => {
    assert.equal(anunciarInexistente("exmplo.com.br"), "Não encontrei o domínio exmplo.com.br.");
  });

  it("o resumo falado usa só a palavra do selo de cada cartão", async () => {
    const cartoes = {
      dmarc: apresentarDmarc(estadoDmarc([DMARC_NONE])),
      spf: apresentarSpf(await estadoSpf({ [DOMINIO]: ["v=spf1 ip4:203.0.113.10 -all"] })),
      dkim: apresentarDkim(await estadoDkim(["google"], {})),
    };

    assert.equal(
      anunciarFim("exemplo.com.br", cartoes),
      "Resultado pronto para exemplo.com.br. DMARC: atenção. SPF: ok. DKIM: atenção.",
    );
  });

  it("não diz 'ok' de parte que falhou", async () => {
    const cartoes = {
      dmarc: apresentarDmarc(falha("dmarc")),
      spf: apresentarSpf(await estadoSpf({})),
      dkim: apresentarDkim(falha("dkim")),
    };
    const frase = anunciarFim("exemplo.com.br", cartoes);

    assert.doesNotMatch(frase, /: ok/);
    assert.match(frase, /DMARC: não verificado\. SPF: problema\. DKIM: não verificado\./);
  });
});

describe("rodapeDosResolvedores", () => {
  it("cita a Cloudflare quando só ela respondeu", async () => {
    const estado = verificacao(
      await estadoSpf({ [DOMINIO]: ["v=spf1 -all"] }),
      await estadoDkim(["google"], {}),
      estadoDmarc([DMARC_NONE]),
    );

    assert.match(rodapeDosResolvedores(estado) ?? "", /DNS público da Cloudflare\./);
  });

  it("cita o Google quando só ele respondeu", async () => {
    const estado = verificacao(
      await estadoSpf({ [DOMINIO]: ["v=spf1 -all"] }),
      await estadoDkim(["google"], {}),
      estadoDmarc([DMARC_NONE]),
    );
    for (const parte of Object.values(estado.partes)) {
      assert.equal(parte.fase, "pronto");
      /** @type {any} */ (parte).resolvedores = ["google"];
    }

    assert.match(rodapeDosResolvedores(estado) ?? "", /DNS público do Google\./);
  });

  it("cita os dois quando houve fallback no meio", async () => {
    const estado = verificacao(
      await estadoSpf({ [DOMINIO]: ["v=spf1 -all"] }),
      await estadoDkim(["google"], {}),
      estadoDmarc([DMARC_NONE]),
    );
    /** @type {any} */ (estado.partes.dmarc).resolvedores = ["google"];

    assert.match(rodapeDosResolvedores(estado) ?? "", /da Cloudflare e do Google/);
  });

  it("não diz nada se nenhuma parte chegou a um resolvedor", () => {
    const estado = verificacao(falha("spf", "x"), falha("dkim", "x"), falha("dmarc", "x"));

    assert.equal(rodapeDosResolvedores(estado), null);
  });
});
