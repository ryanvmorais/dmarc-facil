/**
 * @file Leitura do registro SPF: escolhe o registro entre os TXT do domínio, lê os termos e
 * aponta os achados.
 *
 * O registro é texto escrito por quem controla o DNS do domínio, então é entrada não
 * confiável: nada que sai daqui é HTML, e nenhuma entrada lança exceção. O resultado é uma
 * união discriminada por `situacao` (`valido`, `invalido`, `multiplos`, `ausente`), e os
 * achados são dados (`codigo`, `gravidade`, `tag`, `detalhe`), nunca frases: o português é da
 * página. O formato segue a RFC 7208 (seções 4.5, 4.6, 5, 6 e 12).
 *
 * O módulo lê um registro só. Seguir os `include` e o `redirect` para contar as consultas DNS
 * é de `spf-consultas.js`, que recebe a função de consulta por parâmetro. Este é puro (sem
 * DOM, sem rede, sem relógio), para rodar igual no navegador e nos testes.
 */

// @ts-check

import { TAMANHO_MAXIMO_DOMINIO } from "./dominio.js";
import { validarNomeDns } from "./nome-dns.js";
import { MAXIMO_TEXTO } from "./resposta-doh.js";

/** @typedef {"erro" | "aviso" | "info"} Gravidade */
/**
 * Algo notável no registro. `dominio` diz em que registro foi achado (só a caminhada o põe).
 *
 * @typedef {{
 *   codigo: string, gravidade: Gravidade, tag?: string, detalhe?: number | string,
 *   dominio?: string
 * }} Achado
 */
/** @typedef {"all" | "include" | "a" | "mx" | "ptr" | "ip4" | "ip6" | "exists" | "redirect" | "exp"} TipoTermo */
/**
 * Um termo lido. `ignorado` marca o que o receptor não avalia: as diretivas depois do `all` e o
 * `redirect` de um registro que tem `all`.
 *
 * @typedef {{
 *   texto: string, tipo: TipoTermo, qualificador?: "+" | "-" | "~" | "?",
 *   dominio?: string, macro?: boolean, rede?: string,
 *   ignorado?: "apos-all" | "redirect-com-all"
 * }} Termo
 */
/** @typedef {"nenhum" | "permissivo" | "suave" | "rigido" | "redirecionado"} EstagioSpf */
/**
 * @typedef {{
 *   situacao: "valido", registro: string, estagio: Exclude<EstagioSpf, "nenhum">,
 *   termos: Termo[], achados: Achado[]
 * }} SpfValido
 */
/**
 * @typedef {{
 *   situacao: "invalido", registro: string, estagio: "nenhum", achados: Achado[]
 * }} SpfInvalido
 */
/** @typedef {{ situacao: "multiplos", quantidade: number, estagio: "nenhum" }} SpfMultiplos */
/** @typedef {{ situacao: "ausente", estagio: "nenhum" }} SpfAusente */
/** @typedef {SpfValido | SpfInvalido | SpfMultiplos | SpfAusente} ResultadoSpf */

// ---------------------------------------------------------------------------
// LIMITES E PADRÕES
// ---------------------------------------------------------------------------

// Limite de termos que gastam consulta DNS (RFC 7208, 4.6.4). Passar dele é `permerror`.
export const LIMITE_CONSULTAS = 10;
// Os termos que gastam consulta: o `all`, o `ip4`, o `ip6` e o `exp` não gastam.
export const TIPOS_QUE_CONSULTAM = /** @type {const} */ ([
  "include",
  "a",
  "mx",
  "ptr",
  "exists",
  "redirect",
]);

// O texto de um termo guardado em `Termo.texto`, e o que vai em `detalhe` de um achado. Um
// termo hostil não deve encher a página; o alvo de um nome DNS já tem o próprio limite (253).
const MAXIMO_TEXTO_TERMO = 255;
const MAXIMO_DETALHE = 64;
// A RFC recomenda que o registro caiba em 512 octetos, para a resposta caber num pacote UDP.
const TAMANHO_RECOMENDADO = 512;

// Posição de cada gravidade na lista de achados: os erros vêm primeiro.
/** @type {Record<Gravidade, number>} */
const ORDEM_GRAVIDADE = { erro: 0, aviso: 1, info: 2 };

// O registro começa por `v=spf1` (qualquer caixa) seguido de espaço ou do fim. Sem espaço
// antes: a gramática do SPF não tem (ADR-2). Ancorada e sem repetição: sem retrocesso.
const PADRAO_CANDIDATO = /^v=spf1(?: |$)/i;
// Modificador: `nome=valor`. O nome começa por letra, então `+redirect=` não casa e cai na
// leitura de diretiva, onde é recusado.
const PADRAO_MODIFICADOR = /^([a-z][a-z0-9._-]*)=(.*)$/i;
// Diretiva: qualificador opcional, nome do mecanismo e o resto (alvo, rede, tamanhos).
const PADRAO_DIRETIVA = /^([+\-~?]?)([a-z][a-z0-9]*)(.*)$/i;
// Os tamanhos de rede que fecham `a` e `mx`: `/n`, `//m` ou os dois. Ancorado no fim, com no
// máximo três dígitos cada, para o custo ficar linear.
const PADRAO_TAMANHOS = /(?:\/(\d{1,3}))?(?:\/\/(\d{1,3}))?$/;
// Número sem zero à esquerda (RFC 7208, seção 12), usado em octetos e em tamanhos de rede.
const PADRAO_NUMERO = /^(?:0|[1-9]\d{0,2})$/;
const PADRAO_GRUPO_IPV6 = /^[0-9a-f]{1,4}$/i;
const PADRAO_SO_DIGITOS = /^\d+$/;
// Macro (seção 7): `%%`, `%_`, `%-` ou `%{letra, dígitos, r, delimitadores}`.
const PADRAO_MACRO = /%(?:[%_-]|\{[slodipvh]\d*r?[.\-+,/_=]*\})/gi;
// O que sobra de um alvo depois de tirar as macros: só caracteres de nome DNS.
const PADRAO_LITERAL_DE_ALVO = /^[a-z0-9._-]*$/i;

// ---------------------------------------------------------------------------
// AUXILIARES
// ---------------------------------------------------------------------------

/**
 * Ordena os achados por gravidade e, dentro dela, na ordem em que foram gerados (o `sort` é
 * estável).
 *
 * @param {Achado[]} achados - Achados na ordem de geração.
 * @returns {Achado[]} Cópia ordenada.
 */
export const ordenarAchados = (achados) =>
  [...achados].sort((a, b) => ORDEM_GRAVIDADE[a.gravidade] - ORDEM_GRAVIDADE[b.gravidade]);

/**
 * @param {string} texto - Texto do termo.
 * @param {number} [maximo=MAXIMO_TEXTO_TERMO] - Tamanho máximo.
 * @returns {string} O texto cortado em `maximo` caracteres.
 */
const cortar = (texto, maximo = MAXIMO_TEXTO_TERMO) => texto.slice(0, maximo);

// ---------------------------------------------------------------------------
// ENDEREÇOS E ALVOS
// ---------------------------------------------------------------------------

/**
 * @param {string} texto - Número de um octeto ou de um tamanho de rede.
 * @param {number} maximo - Maior valor aceito.
 * @returns {boolean} `true` se é decimal, sem zero à esquerda e até `maximo`.
 */
const numeroAte = (texto, maximo) => PADRAO_NUMERO.test(texto) && Number(texto) <= maximo;

/**
 * @param {string} endereco - Texto após `ip4:`, sem o tamanho da rede.
 * @returns {boolean} `true` se são quatro octetos decimais de 0 a 255 sem zero à esquerda.
 */
const ipv4Valido = (endereco) => {
  const octetos = endereco.split(".");
  return octetos.length === 4 && octetos.every((octeto) => numeroAte(octeto, 255));
};

/**
 * Conta os grupos de 16 bits de um lado do `::`.
 *
 * @param {string} texto - Os grupos separados por `:`, ex.: ``"2001:db8"``; vazio conta zero.
 * @param {boolean} final - `true` no último lado, onde o quarteto IPv4 pode fechar o endereço.
 * @returns {number} A quantidade de grupos (o quarteto IPv4 vale dois), ou -1 se algum é inválido.
 */
const contarGrupos = (texto, final) => {
  if (texto === "") {
    return 0;
  }
  const grupos = texto.split(":");
  let contagem = 0;
  for (const [indice, grupo] of grupos.entries()) {
    if (final && indice === grupos.length - 1 && grupo.includes(".")) {
      if (!ipv4Valido(grupo)) {
        return -1;
      }
      contagem += 2;
    } else if (PADRAO_GRUPO_IPV6.test(grupo)) {
      contagem += 1;
    } else {
      return -1;
    }
  }
  return contagem;
};

/**
 * Valida um endereço IPv6 sem tamanho de rede. O `net.isIPv6` do Node não existe no navegador
 * (ADR-3), então a conferência é nossa: grupos de 1 a 4 dígitos hexadecimais, no máximo um
 * `::` (que vale um ou mais grupos zerados) e, no fim, um quarteto IPv4 opcional.
 *
 * @param {string} endereco - Texto após `ip6:`, ex.: ``"2001:db8::"``.
 * @returns {boolean} `true` se o endereço é IPv6 bem formado.
 */
const ipv6Valido = (endereco) => {
  const lados = endereco.split("::");
  if (lados.length > 2) {
    return false;
  }
  if (lados.length === 1) {
    return contarGrupos(endereco, true) === 8;
  }
  const antes = contarGrupos(lados[0] ?? "", false);
  const depois = contarGrupos(lados[1] ?? "", true);
  return antes >= 0 && depois >= 0 && antes + depois <= 7;
};

/**
 * Lê o `:rede[/n]` de um `ip4` ou `ip6`.
 *
 * @param {string} resto - O que vem depois do nome do mecanismo, ex.: ``":203.0.113.0/24"``.
 * @param {(endereco: string) => boolean} enderecoValido - Confere o endereço sem o tamanho.
 * @param {number} maximo - Maior tamanho de rede (32 ou 128).
 * @returns {Pick<Termo, "rede"> | undefined} A rede como escrita, ou `undefined` se é inválida.
 */
const lerRede = (resto, enderecoValido, maximo) => {
  if (!resto.startsWith(":")) {
    return undefined;
  }
  const rede = resto.slice(1);
  const barra = rede.indexOf("/");
  const endereco = barra === -1 ? rede : rede.slice(0, barra);
  if (!enderecoValido(endereco)) {
    return undefined;
  }
  if (barra !== -1 && !numeroAte(rede.slice(barra + 1), maximo)) {
    return undefined;
  }
  return { rede };
};

/**
 * Confere uma macro: tudo o que tem `%` precisa ser uma das formas da RFC, e o resto do alvo
 * só pode ter caracteres de nome DNS. A macro nunca é expandida (ADR-8).
 *
 * @param {string} alvo - Alvo com ao menos um `%`.
 * @returns {boolean} `true` se a macro está bem formada.
 */
const macroBemFormada = (alvo) =>
  alvo.length <= TAMANHO_MAXIMO_DOMINIO &&
  PADRAO_LITERAL_DE_ALVO.test(alvo.replace(PADRAO_MACRO, ""));

/**
 * Lê o alvo de um `include`, `a`, `mx`, `ptr`, `exists` ou `redirect`.
 *
 * Sem `%`, passa por `validarNomeDns` (o alvo vira consulta, então nada de URL crua), precisa
 * de ao menos dois rótulos e o último não pode ser só número (a RFC exige o rótulo de topo).
 * Com `%`, o alvo é uma macro: não vira `dominio`, e portanto nunca vira consulta.
 *
 * @param {string} texto - O alvo, ex.: ``"spf.exemplo.net"``.
 * @returns {Pick<Termo, "dominio" | "macro"> | undefined} O alvo lido, ou `undefined` se é
 *   inválido.
 */
const lerAlvo = (texto) => {
  if (texto.includes("%")) {
    return macroBemFormada(texto) ? { macro: true } : undefined;
  }
  const validado = validarNomeDns(texto);
  if (!validado.ok) {
    return undefined;
  }
  const rotulos = validado.nome.split(".");
  if (rotulos.length < 2 || PADRAO_SO_DIGITOS.test(rotulos[rotulos.length - 1] ?? "")) {
    return undefined;
  }
  return { dominio: validado.nome };
};

// ---------------------------------------------------------------------------
// TERMOS
// ---------------------------------------------------------------------------

/**
 * @param {string} resto - O que vem depois do nome do mecanismo.
 * @returns {Pick<Termo, "dominio" | "macro"> | undefined} O alvo de `:alvo` (obrigatório), ou
 *   `undefined` se falta ou é inválido.
 */
const alvoObrigatorio = (resto) => (resto.startsWith(":") ? lerAlvo(resto.slice(1)) : undefined);

/**
 * @param {string} resto - O que vem depois de `ptr`.
 * @returns {Pick<Termo, "dominio" | "macro"> | undefined} O alvo de `:alvo` (opcional; sem ele
 *   vale o domínio atual), ou `undefined` se é inválido.
 */
const alvoOpcional = (resto) => (resto === "" ? {} : alvoObrigatorio(resto));

/**
 * Lê o `[:alvo][/n][//m]` de `a` e `mx`.
 *
 * @param {string} resto - O que vem depois de `a` ou `mx`, ex.: ``":exemplo.net/24//64"``.
 * @returns {Pick<Termo, "dominio" | "macro"> | undefined} O alvo (opcional), ou `undefined` se
 *   o alvo ou algum tamanho é inválido.
 */
const alvoComTamanhos = (resto) => {
  const tamanhos = PADRAO_TAMANHOS.exec(resto);
  const ipv4 = tamanhos?.[1];
  const ipv6 = tamanhos?.[2];
  if (tamanhos === null || (ipv4 !== undefined && !numeroAte(ipv4, 32))) {
    return undefined;
  }
  if (ipv6 !== undefined && !numeroAte(ipv6, 128)) {
    return undefined;
  }
  return alvoOpcional(resto.slice(0, tamanhos.index));
};

// A forma aceita depois do nome de cada mecanismo (seção 12 da RFC). O `Map` evita que um
// nome como `constructor` seja achado no protótipo de um objeto.
/** @type {Map<string, (resto: string) => Partial<Termo> | undefined>} */
const LEITORES = new Map([
  ["all", (resto) => (resto === "" ? {} : undefined)],
  ["include", alvoObrigatorio],
  ["exists", alvoObrigatorio],
  ["a", alvoComTamanhos],
  ["mx", alvoComTamanhos],
  ["ptr", alvoOpcional],
  ["ip4", (resto) => lerRede(resto, ipv4Valido, 32)],
  ["ip6", (resto) => lerRede(resto, ipv6Valido, 128)],
]);

/**
 * @typedef {{ termo?: Termo, caixa: boolean }} TermoLido
 * `termo` falta num modificador desconhecido, que a RFC manda ignorar; `caixa` marca nome com
 * maiúscula.
 */

/**
 * Lê um modificador `nome=valor`.
 *
 * @param {string} texto - O termo inteiro.
 * @param {string} nomeOriginal - O nome como escrito.
 * @param {string} valor - O que vem depois do `=`.
 * @returns {TermoLido | undefined} O termo lido, ou `undefined` se é inválido.
 */
const lerModificador = (texto, nomeOriginal, valor) => {
  const nome = nomeOriginal.toLowerCase();
  const caixa = nome !== nomeOriginal;
  if (nome === "redirect") {
    const alvo = lerAlvo(valor);
    return alvo === undefined
      ? undefined
      : { termo: { texto: cortar(texto), tipo: "redirect", ...alvo }, caixa };
  }
  if (nome === "exp") {
    // O texto de explicação não é consultado nem expandido; só precisa existir.
    return valor === "" ? undefined : { termo: { texto: cortar(texto), tipo: "exp" }, caixa };
  }
  return { caixa: false };
};

/**
 * Lê uma diretiva `[qualificador]mecanismo...`.
 *
 * @param {string} texto - O termo inteiro.
 * @returns {TermoLido | undefined} O termo lido, ou `undefined` se é inválido.
 */
const lerDiretiva = (texto) => {
  const casou = PADRAO_DIRETIVA.exec(texto);
  if (casou === null) {
    return undefined;
  }
  const [, qualificador = "", nomeOriginal = "", resto = ""] = casou;
  const nome = nomeOriginal.toLowerCase();
  const alvo = LEITORES.get(nome)?.(resto);
  if (alvo === undefined) {
    return undefined;
  }
  return {
    termo: {
      texto: cortar(texto),
      tipo: /** @type {TipoTermo} */ (nome),
      qualificador: /** @type {"+" | "-" | "~" | "?"} */ (qualificador === "" ? "+" : qualificador),
      ...alvo,
    },
    caixa: nome !== nomeOriginal,
  };
};

/**
 * Divide o registro em termos e lê cada um.
 *
 * Um termo fora da gramática invalida o registro (`permerror` no receptor): só o primeiro vira
 * achado. `redirect` e `exp` repetidos também invalidam. Modificador desconhecido é ignorado.
 *
 * @param {string} registro - Texto do registro, já com no máximo `MAXIMO_TEXTO` caracteres.
 * @returns {{ termos: Termo[], estrutura: Achado[], caixa: boolean }} Os termos na ordem, os
 *   achados de estrutura (vazio se a gramática está certa) e a marca de caixa fora do padrão.
 */
const lerTermos = (registro) => {
  // O primeiro pedaço é o `v=spf1`. Cada termo tem ao menos um caractere e um espaço, então
  // há no máximo 2048 termos.
  const pedacos = registro
    .split(/ +/)
    .filter((pedaco) => pedaco !== "")
    .slice(1);
  /** @type {Termo[]} */
  const termos = [];
  const repetidos = new Set();
  const vistos = new Set();
  let primeiroInvalido;
  let caixa = false;

  for (const pedaco of pedacos) {
    const modificador = PADRAO_MODIFICADOR.exec(pedaco);
    const lido = modificador
      ? lerModificador(pedaco, modificador[1] ?? "", modificador[2] ?? "")
      : lerDiretiva(pedaco);
    if (lido === undefined) {
      primeiroInvalido ??= pedaco;
      continue;
    }
    caixa ||= lido.caixa;
    const { termo } = lido;
    if (termo === undefined) {
      continue;
    }
    if (termo.tipo === "redirect" || termo.tipo === "exp") {
      if (vistos.has(termo.tipo)) {
        repetidos.add(termo.tipo);
      }
      vistos.add(termo.tipo);
    }
    termos.push(termo);
  }

  /** @type {Achado[]} */
  const estrutura = [...repetidos].map((tag) => ({
    codigo: "modificador-repetido",
    gravidade: "erro",
    tag,
  }));
  if (primeiroInvalido !== undefined) {
    estrutura.push({
      codigo: "termo-invalido",
      gravidade: "erro",
      detalhe: cortar(primeiroInvalido, MAXIMO_DETALHE),
    });
  }
  return { termos, estrutura, caixa };
};

// ---------------------------------------------------------------------------
// ESTÁGIO E ACHADOS
// ---------------------------------------------------------------------------

// O que o qualificador do `all` diz: estágio, código do achado e gravidade. `+all` (ou `all`
// sem qualificador) libera o envio por qualquer um, por isso é erro.
/** @type {Record<"+" | "-" | "~" | "?", [Exclude<EstagioSpf, "nenhum" | "redirecionado">, string, Gravidade]>} */
const POR_QUALIFICADOR = {
  "-": ["rigido", "all-rigido", "info"],
  "~": ["suave", "all-suave", "info"],
  "?": ["permissivo", "all-neutro", "aviso"],
  "+": ["permissivo", "all-libera-tudo", "erro"],
};

// Termos cuja repetição no mesmo registro é desperdício (o `include` gasta consulta à toa).
const TIPOS_REPETIVEIS = ["ip4", "ip6", "include"];

/**
 * Marca o que o receptor não avalia: as diretivas depois do primeiro `all` e o `redirect` de
 * um registro que tem `all`. Muda os termos que recebe.
 *
 * @param {Termo[]} termos - Os termos na ordem do registro.
 * @returns {{ aposAll: number, redirectIgnorado: boolean }} Quantas diretivas vieram depois do
 *   `all` e se o `redirect` foi ignorado.
 */
const marcarIgnorados = (termos) => {
  const indiceAll = termos.findIndex((termo) => termo.tipo === "all");
  if (indiceAll === -1) {
    return { aposAll: 0, redirectIgnorado: false };
  }
  let aposAll = 0;
  let redirectIgnorado = false;
  for (const termo of termos.slice(indiceAll + 1)) {
    if (termo.tipo !== "redirect" && termo.tipo !== "exp") {
      termo.ignorado = "apos-all";
      aposAll += 1;
    }
  }
  for (const termo of termos) {
    if (termo.tipo === "redirect") {
      termo.ignorado = "redirect-com-all";
      redirectIgnorado = true;
    }
  }
  return { aposAll, redirectIgnorado };
};

/**
 * Achados de higiene dos termos que o receptor avalia: `ptr` e termo repetido.
 *
 * @param {Termo[]} termos - Os termos, já com as marcas de ignorado.
 * @returns {Achado[]} Os achados, na ordem do registro.
 */
const higieneDosTermos = (termos) => {
  /** @type {Achado[]} */
  const achados = [];
  const vistos = new Set();
  const avisados = new Set();
  let ptrAchado = false;

  for (const termo of termos) {
    if (termo.ignorado !== undefined) {
      continue;
    }
    if (termo.tipo === "ptr" && !ptrAchado) {
      ptrAchado = true;
      achados.push({ codigo: "ptr-em-uso", gravidade: "aviso", tag: "ptr" });
    }
    if (TIPOS_REPETIVEIS.includes(termo.tipo)) {
      const chave =
        `${termo.tipo}|${termo.qualificador}|${termo.dominio ?? termo.rede ?? termo.texto}`.toLowerCase();
      // Um achado por termo repetido, não por ocorrência: `ip4:x` três vezes avisa uma vez.
      if (vistos.has(chave) && !avisados.has(chave)) {
        avisados.add(chave);
        achados.push({
          codigo: "termo-repetido",
          gravidade: "info",
          tag: termo.tipo,
          detalhe: cortar(termo.texto, MAXIMO_DETALHE),
        });
      }
      vistos.add(chave);
    }
  }
  return achados;
};

// ---------------------------------------------------------------------------
// LEITURA DO REGISTRO
// ---------------------------------------------------------------------------

/**
 * Lê o registro SPF entre os textos TXT do domínio.
 *
 * Só conta quem começa com `v=spf1`; os outros TXT são ignorados sem achado. Nenhum candidato é
 * `ausente`; dois ou mais é `multiplos` e nenhum é lido (`permerror`, RFC 7208 4.5). Nunca lança
 * exceção: o que não é lista vira lista vazia e o que não é texto é descartado.
 *
 * Sem rede, o estágio de um registro sem `all` e com `redirect` é `redirecionado`: quem sabe o
 * do destino é a caminhada de `spf-consultas.js`.
 *
 * @param {readonly unknown[]} textos - Textos TXT, ex.: o `registros` de `consultarTxt`.
 * @returns {ResultadoSpf} O que há ali: `valido`, `invalido`, `multiplos` ou `ausente`.
 */
export const lerSpf = (textos) => {
  // 1. Entrada: o módulo não confia que a camada de baixo filtrou.
  const candidatos = (Array.isArray(textos) ? textos : []).filter(
    (texto) => typeof texto === "string" && PADRAO_CANDIDATO.test(texto),
  );

  // 2. Candidatos.
  if (candidatos.length === 0) {
    return { situacao: "ausente", estagio: "nenhum" };
  }
  if (candidatos.length > 1) {
    return { situacao: "multiplos", quantidade: candidatos.length, estagio: "nenhum" };
  }
  const registro = String(candidatos[0]);

  // 3. Tamanho: um registro acima do limite é dito grande demais, não ausente.
  if (registro.length > MAXIMO_TEXTO) {
    return invalido(registro, [{ codigo: "registro-grande-demais", gravidade: "erro" }]);
  }

  // 4. Termos.
  const { termos, estrutura, caixa } = lerTermos(registro);
  if (estrutura.length > 0) {
    return invalido(registro, estrutura);
  }

  // 5. Marcas de "ignorado".
  const { aposAll, redirectIgnorado } = marcarIgnorados(termos);

  /** @type {Achado[]} */
  const achados = higieneDosTermos(termos);
  if (aposAll > 0) {
    achados.push({ codigo: "termos-apos-all", gravidade: "aviso", tag: "all", detalhe: aposAll });
  }
  if (redirectIgnorado) {
    achados.push({ codigo: "redirect-ignorado", gravidade: "aviso", tag: "redirect" });
  }

  // 6. Estágio e achado do `all`.
  const todos = termos.find((termo) => termo.tipo === "all");
  /** @type {Exclude<EstagioSpf, "nenhum">} */
  let estagio = "redirecionado";
  if (todos !== undefined) {
    const [grau, codigo, gravidade] = POR_QUALIFICADOR[todos.qualificador ?? "+"];
    estagio = grau;
    achados.push({ codigo, gravidade, tag: "all" });
  } else if (!termos.some((termo) => termo.tipo === "redirect")) {
    estagio = "permissivo";
    achados.push({ codigo: "sem-all", gravidade: "aviso" });
  }

  // 7. Higiene do registro.
  if (registro.length > TAMANHO_RECOMENDADO) {
    achados.push({ codigo: "registro-grande", gravidade: "aviso", detalhe: registro.length });
  }
  if (caixa || !registro.startsWith("v=spf1")) {
    achados.push({ codigo: "caixa-fora-do-padrao", gravidade: "info" });
  }

  // 8. Ordem estável.
  return { situacao: "valido", registro, estagio, termos, achados: ordenarAchados(achados) };
};

/**
 * Monta o resultado de um registro que a RFC manda descartar.
 *
 * @param {string} registro - Texto do registro.
 * @param {Achado[]} achados - Achados na ordem de geração.
 * @returns {SpfInvalido} Resultado `invalido` com os achados ordenados.
 */
const invalido = (registro, achados) => ({
  situacao: "invalido",
  registro,
  estagio: "nenhum",
  achados: ordenarAchados(achados),
});
