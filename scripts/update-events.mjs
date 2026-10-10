#!/usr/bin/env node
// Atualiza a agenda: para cada cidade, a IA pesquisa eventos infantis na web,
// os resultados são convertidos em JSON, validados e juntados aos que já existem.
//
// Uso:
//   ANTHROPIC_API_KEY=... npm run update-events
//   ANTHROPIC_API_KEY=... npm run update-events -- --city porto-alegre
//
// Variáveis opcionais: CLAUDE_MODEL, WINDOW_DAYS (padrão 45), MAX_SEARCHES (padrão 15).

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { todayIn } from "../web/lib/dates.js";
import { mergeEvents, normalizeEvent, windowFor } from "./lib/events.mjs";
import {
  EXTRACTION_SYSTEM,
  ExtractionResult,
  RESEARCH_SYSTEM,
  buildExtractionPrompt,
  buildResearchPrompt,
} from "./lib/prompts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "web", "data");

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const WINDOW_DAYS = Number(process.env.WINDOW_DAYS || 45);
const MAX_SEARCHES = Number(process.env.MAX_SEARCHES || 15);
const MAX_CONTINUATIONS = 4;
// Se o modelo principal recusar um pedido, a própria API tenta de novo com o modelo recomendado.
const BETAS = ["server-side-fallback-2026-07-01"];

// Preços por milhão de tokens (US$), só para estimar o custo no log.
const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
const WEB_SEARCH_PRICE = 10 / 1000;

function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, fetches: 0 };
}

function addUsage(total, usage) {
  if (!usage) return;
  total.input += usage.input_tokens ?? 0;
  total.output += usage.output_tokens ?? 0;
  total.cacheRead += usage.cache_read_input_tokens ?? 0;
  total.cacheWrite += usage.cache_creation_input_tokens ?? 0;
  total.searches += usage.server_tool_use?.web_search_requests ?? 0;
  total.fetches += usage.server_tool_use?.web_fetch_requests ?? 0;
}

function estimateCost(usage) {
  const price = PRICES[MODEL];
  if (!price) return null;
  const tokens =
    (usage.input * price.input +
      usage.cacheWrite * price.input * 1.25 +
      usage.cacheRead * price.input * 0.1 +
      usage.output * price.output) /
    1_000_000;
  return tokens + usage.searches * WEB_SEARCH_PRICE;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function textOf(message) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Passo 1: a IA pesquisa na web e devolve anotações em texto, com as fontes. */
async function research(client, { city, today, windowEnd, knownEvents }, usage) {
  const messages = [{ role: "user", content: buildResearchPrompt({ city, today, windowEnd, knownEvents }) }];
  const tools = [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: MAX_SEARCHES,
      user_location: {
        type: "approximate",
        city: city.name,
        region: city.state,
        country: city.country_code,
        timezone: city.timezone,
      },
    },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8, max_content_tokens: 20_000 },
  ];

  let notes = "";
  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64_000,
        betas: BETAS,
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: RESEARCH_SYSTEM,
        tools,
        messages,
      })
      .finalMessage();
    addUsage(usage, message.usage);
    notes += textOf(message);

    if (message.stop_reason === "refusal") throw new Error("a IA recusou o pedido de pesquisa");
    // Pesquisas longas pausam no meio; reenviamos a resposta parcial para continuar.
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    return notes;
  }
  return notes;
}

/** Passo 2: as anotações viram uma lista de eventos em JSON, no formato do app. */
async function extract(client, { city, today, notes }, usage) {
  const message = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 32_000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ExtractionResult) },
      system: EXTRACTION_SYSTEM,
      messages: [{ role: "user", content: buildExtractionPrompt({ city, today, notes }) }],
    })
    .finalMessage();
  addUsage(usage, message.usage);

  if (message.stop_reason === "refusal") throw new Error("a IA recusou o pedido de organização");
  if (message.stop_reason === "max_tokens") throw new Error("a resposta da IA veio cortada (max_tokens)");
  if (!message.parsed_output) throw new Error("a IA não devolveu um JSON válido");
  return message.parsed_output.events;
}

async function updateCity(client, city) {
  const today = todayIn(city.timezone);
  const { windowEnd, maxDate } = windowFor(today, WINDOW_DAYS);
  const file = path.join(DATA_DIR, "events", `${city.slug}.json`);
  const current = await readJson(file, { events: [] });
  const knownEvents = current.events.filter((e) => e.end_date >= today);
  const usage = emptyUsage();

  console.log(`\n▶ ${city.name}: pesquisando de ${today} a ${windowEnd} (${knownEvents.length} eventos já conhecidos)`);
  const notes = await research(client, { city, today, windowEnd, knownEvents }, usage);
  if (!notes.trim()) throw new Error("a pesquisa não trouxe resultados");

  const extracted = await extract(client, { city, today, notes }, usage);
  const valid = extracted.map((raw) => normalizeEvent(raw, { today, maxDate })).filter(Boolean);
  const events = mergeEvents(current.events, valid, { today });

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ city: city.slug, generated_at: new Date().toISOString(), events }, null, 2)}\n`,
  );

  const cost = estimateCost(usage);
  console.log(
    `✔ ${city.name}: ${extracted.length} encontrados, ${valid.length} válidos, ${events.length} na agenda.` +
      ` Uso: ${usage.searches} buscas, ${usage.fetches} páginas lidas,` +
      ` ${usage.input + usage.cacheRead + usage.cacheWrite} tokens de entrada, ${usage.output} de saída` +
      (cost === null ? "." : ` (≈ US$ ${cost.toFixed(2)}).`),
  );
}

async function main() {
  const { values } = parseArgs({ options: { city: { type: "string" } } });
  const { cities } = await readJson(path.join(DATA_DIR, "cities.json"), { cities: [] });
  const selected = values.city ? cities.filter((c) => c.slug === values.city) : cities;
  if (!selected.length) {
    console.error(
      values.city ? `Cidade "${values.city}" não está em web/data/cities.json.` : "Nenhuma cidade configurada.",
    );
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn(
      "⚠ ANTHROPIC_API_KEY não está definida. No GitHub, crie o segredo em" +
        " Settings → Secrets and variables → Actions (veja o README).",
    );
  }
  const client = new Anthropic();
  let failures = 0;
  for (const city of selected) {
    try {
      await updateCity(client, city);
    } catch (error) {
      failures++;
      if (error instanceof Anthropic.AuthenticationError) {
        console.error("✖ Chave da API inválida ou ausente. Configure ANTHROPIC_API_KEY.");
        process.exit(1);
      } else if (error instanceof Anthropic.RateLimitError) {
        console.error(`✖ ${city.name}: limite de uso da API atingido; tente mais tarde.`);
      } else if (error instanceof Anthropic.APIError) {
        console.error(`✖ ${city.name}: erro da API (${error.status}): ${error.message}`);
      } else {
        console.error(`✖ ${city.name}: ${error.message}`);
      }
    }
  }
  // Falha só se nenhuma cidade foi atualizada; as outras continuam com os dados de antes.
  if (failures === selected.length) process.exit(1);
}

await main();
