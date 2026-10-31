/**
 * @file Testes de forma do workflow `deploy.yml` (RF-05, RNF-04 da spec 007; ADR-5).
 *
 * O workflow publica o site e mexe num segredo, e `workflow_run` só roda o arquivo da `main`:
 * não dá para testá-lo antes do merge. Estes testes leem o YAML como texto e guardam o que não
 * pode regredir — nada de `pull_request`, toda ação por SHA, o segredo só no passo que fala com
 * a Cloudflare, a versão do `wrangler` fixa e a concorrência sem cancelamento.
 */

// @ts-check

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// APOIO
// ---------------------------------------------------------------------------

/**
 * @param {string} caminho - Caminho relativo à raiz do repositório.
 * @returns {Promise<string>} O conteúdo do arquivo.
 */
const ler = (caminho) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8");

/**
 * Tira os comentários `#` do YAML, para os testes não casarem com o que só está explicado.
 *
 * @param {string} yaml - O workflow.
 * @returns {string} O YAML sem comentários de linha inteira nem de fim de linha.
 */
const semComentarios = (yaml) =>
  yaml
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("#"))
    .map((linha) => linha.replace(/\s+#\s.*$/, ""))
    .join("\n");

const deploy = semComentarios(await ler(".github/workflows/deploy.yml"));

// ---------------------------------------------------------------------------
// GATILHOS E CONDIÇÃO
// ---------------------------------------------------------------------------

describe("deploy.yml: quem dispara", () => {
  it("roda depois do CI na main e à mão, e só", () => {
    const gatilhos = deploy.slice(deploy.indexOf("\non:"), deploy.indexOf("\npermissions:"));
    assert.match(
      gatilhos,
      /workflow_run:\n\s+workflows: \[CI\]\n\s+types: \[completed\]\n\s+branches: \[main\]/,
    );
    assert.match(gatilhos, /workflow_dispatch:/);
    assert.deepEqual(gatilhos.match(/^ {2}[a-z_]+:/gm), [
      "  workflow_run:",
      "  workflow_dispatch:",
    ]);
  });

  it("nunca roda em pull_request nem em push (RF-05)", () => {
    assert.doesNotMatch(deploy, /pull_request/);
    assert.doesNotMatch(deploy, /^ {2}push:/m);
  });

  it("só segue com CI bem-sucedido, vindo de push do próprio repositório", () => {
    assert.match(deploy, /github\.event\.workflow_run\.conclusion == 'success'/);
    assert.match(deploy, /github\.event\.workflow_run\.event == 'push'/);
    assert.match(
      deploy,
      /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/,
    );
  });

  it("o disparo à mão só vale na main", () => {
    assert.match(
      deploy,
      /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/,
    );
  });

  it("publica o commit que passou no CI, e só se ele ainda for a ponta da main (ADR-5)", () => {
    assert.match(deploy, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
    assert.match(deploy, /commits\/main/);
    assert.match(deploy, /steps\.ponta\.outputs\.atual == 'true'/);
  });
});

// ---------------------------------------------------------------------------
// SEGURANÇA
// ---------------------------------------------------------------------------

describe("deploy.yml: segurança", () => {
  it("toda ação (`uses:`) está fixada por SHA de 40 caracteres", () => {
    const usos = [...deploy.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1] ?? "");
    assert.ok(usos.length >= 3);
    for (const uso of usos) {
      assert.match(uso, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, uso);
    }
  });

  it("roda em ubuntu-26.04, nunca em ubuntu-latest", () => {
    assert.match(deploy, /runs-on: ubuntu-26\.04/);
    assert.doesNotMatch(deploy, /ubuntu-latest/);
  });

  it("tem só a permissão contents: read, no workflow e em nenhum job", () => {
    assert.match(deploy, /\npermissions:\n {2}contents: read\n/);
    assert.equal(deploy.match(/permissions:/g)?.length, 1);
    assert.doesNotMatch(deploy, /write/);
  });

  it("usa o ambiente producao", () => {
    assert.match(deploy, /environment: producao/);
  });

  it("não deixa o token do GitHub no disco depois do checkout", () => {
    assert.match(deploy, /persist-credentials: false/);
  });

  it("os segredos da Cloudflare aparecem só no passo que publica", () => {
    const passos = deploy.split(/\n {6}- name: /).slice(1);
    const comSegredo = passos.filter((passo) => passo.includes("secrets."));
    assert.equal(comSegredo.length, 1);
    assert.match(comSegredo[0] ?? "", /^Publicar na Cloudflare/);
    assert.deepEqual([...deploy.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]).sort(), [
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
    ]);
  });
});

// ---------------------------------------------------------------------------
// FERRAMENTAS E CONCORRÊNCIA
// ---------------------------------------------------------------------------

describe("deploy.yml: ferramentas e concorrência", () => {
  it("fixa a versão do wrangler e a usa por npx", () => {
    assert.match(deploy, /WRANGLER_VERSION: "\d+\.\d+\.\d+"/);
    assert.match(deploy, /npx --yes wrangler@\$\{\{ env\.WRANGLER_VERSION \}\} deploy/);
  });

  it("os comandos de docs/hospedagem.md usam a mesma versão do wrangler (ADR-9)", async () => {
    const versao = deploy.match(/WRANGLER_VERSION: "([^"]+)"/)?.[1];
    const usos = [...(await ler("docs/hospedagem.md")).matchAll(/wrangler@([\d.]+)/g)];
    assert.ok(usos.length >= 2);
    for (const uso of usos) {
      assert.equal(uso[1], versao);
    }
  });

  it("usa a mesma versão do Lighthouse CI que o lighthouse.yml", async () => {
    const lighthouse = semComentarios(await ler(".github/workflows/lighthouse.yml"));
    const doDeploy = deploy.match(/LHCI_VERSION: "([^"]+)"/)?.[1];
    assert.ok(doDeploy);
    assert.equal(lighthouse.match(/LHCI_VERSION: "([^"]+)"/)?.[1], doDeploy);
  });

  it("confere o que está no ar e mede os dois modos depois de publicar", () => {
    assert.match(deploy, /run: node scripts\/conferir-hospedagem\.mjs/);
    assert.match(deploy, /--config=\.github\/lighthouse\/producao-mobile\.json/);
    assert.match(deploy, /--config=\.github\/lighthouse\/producao-desktop\.json/);
    assert.ok(
      deploy.indexOf("wrangler@") < deploy.indexOf("conferir-hospedagem") &&
        deploy.indexOf("conferir-hospedagem") < deploy.indexOf("producao-mobile"),
    );
  });

  it("a concorrência espera o deploy em curso, sem cancelá-lo", () => {
    assert.match(deploy, /concurrency:\n {2}group: deploy\n {2}cancel-in-progress: false/);
  });

  it("limita o tempo do job", () => {
    assert.match(deploy, /timeout-minutes: \d+/);
  });
});
