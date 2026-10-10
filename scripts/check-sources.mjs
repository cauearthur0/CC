#!/usr/bin/env node
// Mostra o que dá para ler de cada fonte fixa (status, eventos estruturados e começo do texto).
// Uso: npm run check-sources [-- --city porto-alegre] [-- --url https://... --url https://... [--follow]]

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { readSource } from "./lib/sources.mjs";

const { values } = parseArgs({
  options: {
    city: { type: "string" },
    url: { type: "string", multiple: true },
    follow: { type: "boolean" },
    chars: { type: "string" },
  },
});
const { cities } = JSON.parse(await readFile(new URL("../web/data/cities.json", import.meta.url), "utf8"));
const sources = values.url?.length
  ? values.url.map((url) => ({ name: url, url, follow: values.follow }))
  : cities.filter((c) => !values.city || c.slug === values.city).flatMap((c) => c.sources ?? []);
const previewChars = Number(values.chars ?? 1500);

const summary = [];
for (const source of sources) {
  const r = await readSource(source);
  console.log(`\n=== ${source.name} — ${source.url}`);
  if (!r.ok) {
    console.log(`  falhou: status ${r.status} ${r.error ?? ""}`);
    summary.push(`✗ ${source.name}: status ${r.status} ${r.error ?? ""}`);
    continue;
  }
  console.log(`  status ${r.status} | título: ${r.title} | endereço final: ${r.finalUrl}`);
  console.log(`  eventos estruturados: ${r.events.length} | texto: ${r.text.length} caracteres`);
  for (const e of r.events.slice(0, 8)) {
    console.log(
      `    • ${e.title} | ${e.start_date}→${e.end_date} ${e.time ?? ""} | ${e.venue ?? "?"} | ${e.url ?? "sem url"} | foto: ${e.image ? "sim" : "não"}`,
    );
  }
  console.log(`  texto (início): ${r.text.slice(0, previewChars).replace(/\n/g, " ⏎ ")}`);
  for (const page of r.followed) {
    console.log(`  ↳ matéria: ${page.title} — ${page.url}`);
    console.log(`    ${page.text.slice(0, 800).replace(/\n/g, " ⏎ ")}`);
  }
  summary.push(
    `✓ ${source.name}: ${r.events.length} estruturados, ${r.text.length} caracteres de texto` +
      (r.followed.length ? `, ${r.followed.length} matérias abertas` : ""),
  );
}
console.log(`\n=== Resumo\n${summary.join("\n")}`);
