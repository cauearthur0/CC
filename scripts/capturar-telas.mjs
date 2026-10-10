#!/usr/bin/env node
// Tira fotos das telas do app com um perfil de exemplo (para conferir o visual sem abrir o celular).
// Precisa do Playwright: npm i --no-save playwright && npx playwright install chromium
// Uso: node scripts/capturar-telas.mjs --base http://localhost:4173/ --out telas [--routes inicio,mapa] [--preview mapa]
//
// --preview NOME guarda a tela NOME também como JPEG em texto base64 (telas/preview.b64). Depois,
// --emit N escreve os pedaços N a N+9 desse texto como anotações do GitHub Actions (cada passo do
// workflow aceita só 10 anotações de até 4 mil caracteres), para quem não consegue baixar os artefatos.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:4173/" },
    out: { type: "string", default: "telas" },
    routes: { type: "string", default: "inicio,mapa,agenda,favoritos,perfil,evento,boas-vindas" },
    preview: { type: "string", default: "" },
    emit: { type: "string" },
  },
});

const CHUNK = 4_000;
if (values.emit) {
  const data = await readFile(`${values.out}/preview.b64`, "utf8").catch(() => "");
  const total = Math.ceil(data.length / CHUNK);
  const first = Number(values.emit);
  for (let i = first; i < first + 10 && i <= total; i++) {
    console.log(`::notice title=preview ${i}/${total}::${data.slice((i - 1) * CHUNK, i * CHUNK)}`);
  }
  process.exit(0);
}

const { chromium } = await import("playwright");

const { events } = JSON.parse(await readFile(new URL("../web/data/events/porto-alegre.json", import.meta.url), "utf8"));
const upcoming = events.filter((e) => e.image && e.lat != null);
const pick = (i) => upcoming[i % upcoming.length];
const snap = (e) => {
  const { id, title, description, category, start_date, end_date, schedule, venue, neighborhood, image, url } = e;
  return { id, title, description, category, start_date, end_date, schedule, venue, neighborhood, image, url };
};
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const profile = {
  onboarded: true,
  parent: { name: "Cauê", relation: "Pai", photo: null, bio: "Explorando um mundo mais divertido para nossa família." },
  kids: [
    {
      id: "k1",
      name: "Maitê",
      age: 6,
      gender: "f",
      photo: null,
      bio: "Curiosa, criativa e ama aventuras!",
      interests: ["teatro", "parques", "oficinas", "museus", "historias"],
    },
  ],
  activeKid: "k1",
  city: "porto-alegre",
  radiusKm: 10,
  days: "fins-de-semana",
  budget: "qualquer",
  useGps: false,
  alerts: { ai: true, free: true, rain: true },
  favorites: Object.fromEntries([0, 1, 2].map((i) => [pick(i).id, { saved_at: today, event: snap(pick(i)) }])),
  agenda: [3, 4].map((i, n) => ({
    id: `a${n}`,
    event_id: pick(i).id,
    date: pick(i).start_date < today ? today : pick(i).start_date,
    status: n === 0 ? "confirmado" : "salvo",
    reminder: n === 1,
    added_at: today,
    event: snap(pick(i)),
  })),
  filters: { when: "30-dias", free: false, outdoor: false, indoor: false, category: null, byAge: true },
};

const routes = values.routes.split(",").map((r) => (r === "evento" ? `evento/${pick(0).id}` : r));
await mkdir(values.out, { recursive: true });
const browser = await chromium.launch();
const problems = [];

for (const route of routes) {
  const name = route.split("/")[0];
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  const state = name === "boas-vindas" ? { ...profile, onboarded: false } : profile;
  await context.addInitScript((p) => {
    if (!localStorage.getItem("pequenos-roles:v1")) localStorage.setItem("pequenos-roles:v1", JSON.stringify(p));
  }, state);
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`${route}: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`${route}: falhou ${r.url().slice(0, 100)}`));
  await page.goto(`${values.base}#/${route}`);
  await page.waitForTimeout(1500);
  if (name === "mapa" || name === "evento") {
    // Espera o mapa aparecer e os pedaços do mapa terminarem de chegar.
    await page
      .waitForSelector(".maplibregl-canvas", { timeout: 15_000 })
      .catch(() => problems.push(`${route}: o mapa não abriu`));
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${values.out}/${name}.png`, fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
    problems.push(`${route}: a página passa da largura da tela`);
  }
  if (name === values.preview) {
    // O GitHub guarda no máximo 50 anotações por execução (contando avisos do próprio GitHub).
    let quality = 75;
    let data = "";
    do {
      data = (await page.screenshot({ type: "jpeg", quality, scale: "css" })).toString("base64");
      quality -= 10;
    } while (data.length > 45 * CHUNK && quality > 20);
    await writeFile(`${values.out}/preview.b64`, data);
    console.log(`Prévia de ${name}: ${Math.ceil(data.length / CHUNK)} pedaços.`);
  }
  await context.close();
}

await browser.close();
console.log(problems.length ? `Problemas:\n${problems.join("\n")}` : "Telas capturadas sem problemas.");
