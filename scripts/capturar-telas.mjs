#!/usr/bin/env node
// Tira fotos das telas do app com um perfil de exemplo (para conferir o visual sem abrir o celular).
// Precisa do Playwright: npm i --no-save playwright && npx playwright install chromium
// Uso: node scripts/capturar-telas.mjs --base http://localhost:4173/ --out telas [--routes inicio,mapa] [--preview mapa]
//
// --preview NOME também escreve a tela NOME, em JPEG pequeno, como anotações do GitHub Actions
// (em pedaços de texto base64), para ser vista por quem não consegue baixar os artefatos.

import { mkdir, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:4173/" },
    out: { type: "string", default: "telas" },
    routes: { type: "string", default: "inicio,mapa,agenda,favoritos,perfil,evento,boas-vindas" },
    preview: { type: "string", default: "" },
  },
});

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
  await page.goto(`${values.base}#/${route}`);
  await page.waitForTimeout(1500);
  if (name === "mapa" || name === "evento") {
    // Espera as imagens do mapa carregarem.
    await page
      .waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length >= 4, null, { timeout: 15_000 })
      .catch(() => problems.push(`${route}: mapa sem imagens`));
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${values.out}/${name}.png`, fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) {
    problems.push(`${route}: a página passa da largura da tela`);
  }
  if (name === values.preview) {
    const jpeg = await page.screenshot({ type: "jpeg", quality: 72, scale: "css" });
    const data = jpeg.toString("base64");
    const size = 30_000;
    const parts = Math.ceil(data.length / size);
    for (let i = 0; i < parts; i++) {
      console.log(`::notice title=preview ${name} ${i + 1}/${parts}::${data.slice(i * size, (i + 1) * size)}`);
    }
  }
  await context.close();
}

await browser.close();
console.log(problems.length ? `Problemas:\n${problems.join("\n")}` : "Telas capturadas sem problemas.");
