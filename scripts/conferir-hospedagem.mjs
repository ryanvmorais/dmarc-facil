/**
 * @file Confere o que está no ar contra o que está em `public/` (RF-06 e RF-07 da spec 007).
 *
 * Os testes do portão só provam o que o repositório envia: o `_headers` pode estar certo no
 * arquivo e a plataforma não aplicá-lo na 404, ou a zona pode injetar um script no HTML. Este
 * script abre o endereço real e diz o que difere: cabeçalhos, status da 404, o corpo de cada
 * arquivo comparado por SHA-256 (nada foi injetado nem reescrito), o cache das fontes, o
 * `_headers` que não pode ser público e o `http://` que não pode ser servido.
 *
 * Roda no `deploy.yml`, depois do deploy, e à mão com `pnpm hospedagem:conferir`. O endereço vem
 * da rota do `wrangler.json`, a fonte única (ADR-2). Falha deixa o run vermelho; o deploy já
 * feito não é desfeito sozinho (ADR-6). A rede entra por parâmetro para os testes não a usarem.
 */

// @ts-check

import { createHash } from "node:crypto";
import { appendFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** @typedef {{ nome: string, ok: boolean, detalhe: string }} Verificacao */
/** @typedef {{ ok: boolean, verificacoes: Verificacao[] }} ResultadoConferencia */
/** @typedef {{ resposta: Response, corpo: Buffer }} Aberto */

// ---------------------------------------------------------------------------
// LIMITES
// ---------------------------------------------------------------------------

// Um site de arquivos estáticos que não responde em 20 segundos está fora do ar.
const TEMPO_LIMITE_MS = 20_000;
// Identifica o robô para quem lê o log da hospedagem.
const AGENTE = "dmarc-facil-conferir-hospedagem (+https://github.com/ryanvmorais/dmarc-facil)";
// Um caminho que não existe em `public/` e é aninhado, para provar a 404 em qualquer nível.
const CAMINHO_INEXISTENTE = "/conferencia-caminho-inexistente/a/b";
// `http://` só pode terminar em redirecionamento (para `https://`) ou em conexão recusada; nunca em 200.
const REDIRECIONAMENTOS = [301, 302, 307, 308];
// A zona tem o "Bot Preference Sync" ligado: a Cloudflare põe o seu bloco de content signals na
// frente de todo `robots.txt`, e o bloco termina nesta linha. Só o que vem depois é nosso.
const FIM_BLOCO_GERENCIADO = "# END Cloudflare Managed Content";

// ---------------------------------------------------------------------------
// CABEÇALHOS
// ---------------------------------------------------------------------------

/**
 * Lê os cabeçalhos que uma regra do `_headers` manda para as respostas.
 *
 * Linha sem recuo abre uma regra; linha com recuo é um cabeçalho da regra aberta. Nome em
 * minúsculas, porque o HTTP não distingue caixa. Cabeçalho repetido na regra junta os valores
 * com `, `, como a plataforma faz.
 *
 * @param {string} textoHeaders - O conteúdo do `public/_headers`.
 * @param {string} regra - A regra, ex.: ``"/*"`` ou ``"/fonts/*"``.
 * @returns {Map<string, string>} Nome (minúsculo) → valor.
 */
export const lerCabecalhosEsperados = (textoHeaders, regra) => {
  /** @type {Map<string, string>} */
  const cabecalhos = new Map();
  let naRegra = false;
  for (const linha of textoHeaders.split(/\r?\n/)) {
    if (linha.trim() === "" || linha.trimStart().startsWith("#")) {
      continue;
    }
    if (!/^\s/.test(linha)) {
      naRegra = linha.trim() === regra;
      continue;
    }
    const separador = linha.indexOf(":");
    if (!naRegra || separador === -1) {
      continue;
    }
    const nome = linha.slice(0, separador).trim().toLowerCase();
    const valor = linha.slice(separador + 1).trim();
    const anterior = cabecalhos.get(nome);
    cabecalhos.set(nome, anterior === undefined ? valor : `${anterior}, ${valor}`);
  }
  return cabecalhos;
};

/**
 * Compara os cabeçalhos esperados com os de uma resposta.
 *
 * @param {Map<string, string>} esperados - Saída de {@link lerCabecalhosEsperados}.
 * @param {Headers} recebidos - Os cabeçalhos da resposta.
 * @returns {string[]} Um texto por cabeçalho que faltou ou veio com outro valor; vazio se tudo
 *   bate. Cabeçalho a mais na resposta não é problema.
 */
export const compararCabecalhos = (esperados, recebidos) => {
  /** @type {string[]} */
  const problemas = [];
  for (const [nome, esperado] of esperados) {
    const recebido = recebidos.get(nome);
    if (recebido === null) {
      problemas.push(`falta o cabeçalho ${nome}`);
    } else if (recebido !== esperado) {
      problemas.push(`${nome}: esperado "${esperado}", recebido "${recebido}"`);
    }
  }
  return problemas;
};

// ---------------------------------------------------------------------------
// ENDEREÇO
// ---------------------------------------------------------------------------

/**
 * @param {string} raiz - Pasta do repositório, com a barra final.
 * @returns {Promise<string>} O endereço público da rota do `wrangler.json`, com `https://` e a
 *   barra final.
 */
export const enderecoDaRota = async (raiz) => {
  const { routes } = JSON.parse(await readFile(join(raiz, "wrangler.json"), "utf8"));
  return `https://${routes[0].pattern}/`;
};

// ---------------------------------------------------------------------------
// VERIFICAÇÕES
// ---------------------------------------------------------------------------

/**
 * @param {Buffer | string} conteudo - Bytes ou texto.
 * @returns {string} O SHA-256 em hexadecimal.
 */
const hash = (conteudo) => createHash("sha256").update(conteudo).digest("hex");

/**
 * Abre um endereço sem seguir redirecionamento: um redirecionamento onde se esperava o arquivo
 * é um problema a mostrar, não a esconder.
 *
 * @param {string} url - Endereço absoluto.
 * @param {typeof fetch} buscar - O `fetch`, ou um falso nos testes.
 * @returns {Promise<Aberto | null>} A resposta e o corpo, ou `null` se não foi possível abrir
 *   (DNS, certificado, conexão recusada, tempo).
 */
const abrir = async (url, buscar) => {
  try {
    const resposta = await buscar(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { "user-agent": AGENTE, "cache-control": "no-cache" },
    });
    return { resposta, corpo: Buffer.from(await resposta.arrayBuffer()) };
  } catch {
    return null;
  }
};

/**
 * @param {string} nome - Nome da verificação.
 * @param {string[]} problemas - O que deu errado; vazio se nada.
 * @param {string} ok - Detalhe quando passa.
 * @returns {Verificacao} A verificação pronta.
 */
const resultado = (nome, problemas, ok) => ({
  nome,
  ok: problemas.length === 0,
  detalhe: problemas.length === 0 ? ok : problemas.join("; "),
});

/**
 * Confere status e corpo de uma resposta contra o arquivo de `public/`.
 *
 * @param {Aberto} aberto - A resposta.
 * @param {number} statusEsperado - O status que o arquivo deve ter.
 * @param {Buffer} arquivo - Os bytes do arquivo no repositório.
 * @returns {string[]} Os problemas.
 */
const conferirCorpo = (aberto, statusEsperado, arquivo) => {
  /** @type {string[]} */
  const problemas = [];
  if (aberto.resposta.status !== statusEsperado) {
    problemas.push(`status ${aberto.resposta.status}, esperado ${statusEsperado}`);
  }
  if (hash(aberto.corpo) !== hash(arquivo)) {
    problemas.push(
      `o corpo difere do arquivo de public/ (SHA-256 ${hash(aberto.corpo).slice(0, 12)} em vez de ${hash(arquivo).slice(0, 12)})`,
    );
  }
  return problemas;
};

/**
 * Tira da resposta o bloco que a Cloudflare acrescenta na frente do `robots.txt`.
 *
 * @param {Aberto} aberto - A resposta do `robots.txt`.
 * @returns {Aberto} A mesma resposta com o corpo a partir do fim do bloco; sem o bloco, a
 *   resposta como veio (e a comparação com o arquivo decide).
 */
const semBlocoGerenciado = (aberto) => {
  const texto = aberto.corpo.toString("utf8");
  const fim = texto.indexOf(FIM_BLOCO_GERENCIADO);
  if (fim === -1) {
    return aberto;
  }
  // Só o bloco e a linha em branco depois dele ficam de fora.
  const resto = texto.slice(fim + FIM_BLOCO_GERENCIADO.length).trimStart();
  return { ...aberto, corpo: Buffer.from(resto, "utf8") };
};

/**
 * Roda as verificações de RF-07 contra o endereço publicado.
 *
 * @param {{ endereco: string, pasta: string, buscar?: typeof fetch }} opcoes - ``endereco`` é a
 *   raiz do site, com `https://` e a barra final; ``pasta`` é o caminho da pasta `public/` do
 *   repositório; ``buscar`` troca o `fetch` (testes).
 * @returns {Promise<ResultadoConferencia>} O resultado de cada verificação.
 */
export const conferirHospedagem = async ({ endereco, pasta, buscar = fetch }) => {
  const arquivo = (/** @type {string} */ caminho) => readFile(join(pasta, caminho));
  const textoHeaders = await readFile(join(pasta, "_headers"), "utf8");
  const gerais = lerCabecalhosEsperados(textoHeaders, "/*");
  const fontesEsperadas = lerCabecalhosEsperados(textoHeaders, "/fonts/*");
  const url = (/** @type {string} */ caminho) => new URL(caminho, endereco).href;
  const naoAbriu = ["não foi possível abrir o endereço"];

  /** @type {Verificacao[]} */
  const verificacoes = [];

  // 1. A página inicial: idêntica ao arquivo e com todos os cabeçalhos.
  const inicial = await abrir(url("/"), buscar);
  verificacoes.push(
    resultado(
      "Página inicial",
      inicial === null
        ? naoAbriu
        : [
            ...conferirCorpo(inicial, 200, await arquivo("index.html")),
            ...compararCabecalhos(gerais, inicial.resposta.headers),
          ],
      "200, corpo idêntico ao index.html, cabeçalhos de segurança presentes",
    ),
  );

  // 2. Um caminho que não existe: 404 de verdade, com a 404.html e os mesmos cabeçalhos.
  const inexistente = await abrir(url(CAMINHO_INEXISTENTE), buscar);
  verificacoes.push(
    resultado(
      "Página 404",
      inexistente === null
        ? naoAbriu
        : [
            ...conferirCorpo(inexistente, 404, await arquivo("404.html")),
            ...compararCabecalhos(gerais, inexistente.resposta.headers),
          ],
      "status 404, corpo idêntico ao 404.html, cabeçalhos de segurança presentes",
    ),
  );

  // 3. JavaScript e CSS: idênticos (nada reescrito) e, no código, cache que obriga a revalidar.
  const js = await abrir(url("/js/pagina.js"), buscar);
  const css = await abrir(url("/css/pagina.css"), buscar);
  /** @type {string[]} */
  const problemasCodigo = [];
  if (js === null) {
    problemasCodigo.push("js/pagina.js: não foi possível abrir o endereço");
  } else {
    problemasCodigo.push(
      ...conferirCorpo(js, 200, await arquivo("js/pagina.js")).map((p) => `js/pagina.js: ${p}`),
    );
    if (!/javascript/i.test(js.resposta.headers.get("content-type") ?? "")) {
      problemasCodigo.push(
        `js/pagina.js: content-type "${js.resposta.headers.get("content-type")}" não é JavaScript`,
      );
    }
    const cache = js.resposta.headers.get("cache-control") ?? "";
    if (!/no-cache|must-revalidate|max-age=0/i.test(cache) || /immutable/i.test(cache)) {
      problemasCodigo.push(`js/pagina.js: cache-control "${cache}" não obriga a revalidar`);
    }
  }
  if (css === null) {
    problemasCodigo.push("css/pagina.css: não foi possível abrir o endereço");
  } else {
    problemasCodigo.push(
      ...conferirCorpo(css, 200, await arquivo("css/pagina.css")).map(
        (p) => `css/pagina.css: ${p}`,
      ),
    );
  }
  verificacoes.push(
    resultado("JavaScript e CSS", problemasCodigo, "200, corpos idênticos, cache revalida"),
  );

  // 4. Uma fonte: idêntica e com o cache longo do `_headers` (a plataforma pode juntá-lo ao padrão).
  const fonte = (await readdir(join(pasta, "fonts"))).filter((f) => f.endsWith(".woff2")).sort()[0];
  const aberta = fonte === undefined ? null : await abrir(url(`/fonts/${fonte}`), buscar);
  verificacoes.push(
    resultado(
      "Fonte",
      fonte === undefined
        ? ["public/fonts/ não tem nenhuma fonte .woff2 para conferir"]
        : aberta === null
          ? naoAbriu
          : [
              ...conferirCorpo(aberta, 200, await arquivo(`fonts/${fonte}`)),
              ...compararCabecalhos(fontesEsperadas, aberta.resposta.headers),
            ],
      "200, corpo idêntico, cache-control igual ao do _headers",
    ),
  );

  // 5. Descoberta: robots.txt e sitemap.xml idênticos aos arquivos.
  /** @type {string[]} */
  const problemasDescoberta = [];
  for (const nome of ["robots.txt", "sitemap.xml"]) {
    const recebido = await abrir(url(`/${nome}`), buscar);
    // O `robots.txt` chega com o bloco gerenciado da zona na frente; o resto tem de ser o nosso.
    const aberto =
      recebido !== null && nome === "robots.txt" ? semBlocoGerenciado(recebido) : recebido;
    problemasDescoberta.push(
      ...(aberto === null ? naoAbriu : conferirCorpo(aberto, 200, await arquivo(nome))).map(
        (p) => `${nome}: ${p}`,
      ),
    );
  }
  verificacoes.push(
    resultado(
      "robots.txt e sitemap.xml",
      problemasDescoberta,
      "200, corpos idênticos (o bloco gerenciado da Cloudflare no robots.txt não conta)",
    ),
  );

  // 6. O `_headers` é consumido pela plataforma e não pode ser publicado.
  const headers = await abrir(url("/_headers"), buscar);
  verificacoes.push(
    resultado(
      "_headers não é público",
      headers === null
        ? naoAbriu
        : headers.resposta.ok && headers.corpo.toString("utf8") === textoHeaders
          ? ["/_headers devolveu o conteúdo do arquivo"]
          : [],
      "o arquivo não é servido",
    ),
  );

  // 7. `http://` redireciona para `https://` ou é recusado; nunca é servido. Se nem o https abre
  //    (DNS, certificado), "recusado" seria um falso verde: não dá para afirmar nada.
  const claro = new URL("/", endereco);
  claro.protocol = "http:";
  const semTls = await abrir(claro.href, buscar);
  const destino = semTls?.resposta.headers.get("location") ?? "";
  verificacoes.push(
    resultado(
      "http:// não é servido",
      semTls === null
        ? inicial === null
          ? ["o endereço não abre nem por https://, e a recusa do http:// não prova nada"]
          : [] // conexão recusada
        : REDIRECIONAMENTOS.includes(semTls.resposta.status) && destino.startsWith("https://")
          ? []
          : [`http:// respondeu ${semTls.resposta.status} sem redirecionar para https://`],
      semTls === null ? "conexão recusada" : "redireciona para https://",
    ),
  );

  return { ok: verificacoes.every((v) => v.ok), verificacoes };
};

// ---------------------------------------------------------------------------
// EXECUÇÃO
// ---------------------------------------------------------------------------

/**
 * Roda a conferência, imprime o resultado, escreve o resumo do run e define o código de saída:
 * 1 se alguma verificação falhou, 0 se todas passaram.
 */
const principal = async () => {
  const raiz = fileURLToPath(new URL("../", import.meta.url));
  const endereco = await enderecoDaRota(raiz);
  const { ok, verificacoes } = await conferirHospedagem({
    endereco,
    pasta: join(raiz, "public"),
  });

  console.log(`Conferindo ${endereco}`);
  for (const v of verificacoes) {
    console.log(`${v.ok ? "✔" : "✖"} ${v.nome}: ${v.detalhe}`);
    if (!v.ok) {
      console.log(`::error title=Hospedagem::${v.nome}: ${v.detalhe}`);
    }
  }

  const resumo = process.env["GITHUB_STEP_SUMMARY"];
  if (resumo !== undefined && resumo !== "") {
    const tabela = verificacoes
      .map((v) => `| ${v.ok ? "✔" : "✖"} | ${v.nome} | ${v.detalhe.replaceAll("|", "\\|")} |`)
      .join("\n");
    await appendFile(
      resumo,
      `### Conferência de ${endereco}\n\n| | Verificação | Resultado |\n| --- | --- | --- |\n${tabela}\n`,
    );
  }

  process.exitCode = ok ? 0 : 1;
};

// Só executa quando chamado como script, não quando os testes importam as funções.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}
