import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { describe, it } from "node:test";

describe("service worker", () => {
  it("guarda no cache todos os arquivos do app (para funcionar offline)", async () => {
    const sw = await readFile(new URL("../web/sw.js", import.meta.url), "utf8");
    const missing = [];
    for (const dir of ["lib", "ui", "views", "assets", "vendor/fonts"]) {
      for (const file of await readdir(new URL(`../web/${dir}/`, import.meta.url))) {
        if (!sw.includes(`"./${dir}/${file}"`)) missing.push(`${dir}/${file}`);
      }
    }
    assert.deepEqual(missing, [], "rode o gerador da lista do sw.js ou inclua os arquivos à mão");
  });
});
