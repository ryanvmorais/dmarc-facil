/**
 * @file Testes dos limites do Lighthouse CI sobre o endereço real (RF-07 da spec 007; ADR-2 e
 * ADR-6).
 *
 * Os dois arquivos `producao-*.json` medem a URL publicada com os mesmos limites que
 * `mobile.json` e `desktop.json` aplicam à pasta estática: se um limite mudar lá, tem de mudar
 * aqui, e este teste falha na hora. O endereço é o da rota do `wrangler.json`.
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
 * @returns {Promise<any>} O JSON do arquivo.
 */
const lerJson = async (caminho) =>
  JSON.parse(await readFile(new URL(`../${caminho}`, import.meta.url), "utf8"));

// ---------------------------------------------------------------------------
// TESTES
// ---------------------------------------------------------------------------

for (const modo of ["mobile", "desktop"]) {
  describe(`lighthouse producao-${modo}.json`, () => {
    it("mede o endereço da rota do wrangler.json, e não a pasta estática", async () => {
      const { routes } = await lerJson("wrangler.json");
      const { ci } = await lerJson(`.github/lighthouse/producao-${modo}.json`);
      assert.deepEqual(ci.collect.url, [`https://${routes[0].pattern}/`]);
      assert.equal("staticDistDir" in ci.collect, false);
    });

    it(`tem as mesmas asserções, as mesmas medições e as mesmas configurações de ${modo}.json`, async () => {
      const origem = (await lerJson(`.github/lighthouse/${modo}.json`)).ci;
      const producao = (await lerJson(`.github/lighthouse/producao-${modo}.json`)).ci;
      assert.deepEqual(producao.assert, origem.assert);
      assert.equal(producao.collect.numberOfRuns, origem.collect.numberOfRuns);
      assert.deepEqual(producao.collect.settings, origem.collect.settings);
    });

    it("ignora a auditoria robots-txt, como a pasta estática (ADR-8)", async () => {
      const { ci } = await lerJson(`.github/lighthouse/producao-${modo}.json`);
      assert.deepEqual(ci.collect.settings.skipAudits, ["robots-txt"]);
    });

    it("guarda os relatórios numa pasta própria, que o workflow de deploy envia", async () => {
      const { ci } = await lerJson(`.github/lighthouse/producao-${modo}.json`);
      const deploy = await readFile(
        new URL("../.github/workflows/deploy.yml", import.meta.url),
        "utf8",
      );
      assert.equal(ci.upload.outputDir, `.lighthouseci/producao-${modo}`);
      assert.ok(deploy.includes(`.lighthouseci/producao-${modo}`));
    });
  });
}
