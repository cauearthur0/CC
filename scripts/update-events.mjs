#!/usr/bin/env node
// Atualiza a agenda: para cada cidade, o Kimi (Moonshot AI) pesquisa eventos infantis na web,
// os resultados são convertidos em JSON, validados e juntados aos que já existem.
//
// Uso:
//   MOONSHOT_API_KEY=... npm run update-events
//   MOONSHOT_API_KEY=... npm run update-events -- --city porto-alegre
//
// Variáveis opcionais:
//   KIMI_MODEL                  modelo principal (padrão kimi-k3)
//   KIMI_SEARCH_FALLBACK_MODEL  modelo reserva para a busca na web (padrão kimi-k2.6; vazio desliga)
//   MOONSHOT_BASE_URL           endereço(s) da API, separados por vírgula (padrão: api.moonshot.ai, depois .cn)
//   WINDOW_DAYS                 quantos dias à frente pesquisar (padrão 45)
//   MAX_SEARCH_ROUNDS           máximo de rodadas de busca por cidade (padrão 8)
//   MOONSHOT_RPM                pedidos por minuto permitidos pela sua conta (padrão 3, o limite do nível inicial)

import OpenAI from "openai";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { todayIn } from "../web/lib/dates.js";
import { mergeEvents, normalizeEvent, parseEventsJson, windowFor } from "./lib/events.mjs";
import {
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM,
  RESEARCH_SYSTEM,
  buildExtractionPrompt,
  buildResearchPrompt,
} from "./lib/prompts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "web", "data");

const BASE_URLS = (process.env.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1,https://api.moonshot.cn/v1").split(",");
const MODEL = process.env.KIMI_MODEL || "kimi-k3";
const SEARCH_FALLBACK_MODEL = process.env.KIMI_SEARCH_FALLBACK_MODEL ?? "kimi-k2.6";
const WINDOW_DAYS = Number(process.env.WINDOW_DAYS || 45);
const MAX_SEARCH_ROUNDS = Number(process.env.MAX_SEARCH_ROUNDS || 8);
const MAX_TOKENS = 16_384;
// Contas novas da Moonshot aceitam só 3 pedidos por minuto; espaçamos os pedidos para não estourar.
const MIN_REQUEST_INTERVAL_MS = Math.ceil(60_000 / Number(process.env.MOONSHOT_RPM || 3)) + 500;
const MAX_ATTEMPTS = 5;

// Busca na web embutida do Kimi: o modelo pede a busca e a própria Moonshot a executa.
const WEB_SEARCH_TOOL = { type: "builtin_function", function: { name: "$web_search" } };

// Preços (US$) só para estimar o custo no log: por milhão de tokens e por busca.
const PRICES = { "kimi-k3": { input: 3, cached: 0.3, output: 15 } };
const WEB_SEARCH_PRICE = 0.005;

/**
 * O Kimi K3 sempre "pensa"; reasoning_effort controla o quanto (low, high ou max).
 * Nos modelos K2.x o pensamento precisa ficar desligado para a busca $web_search funcionar.
 */
function modelOptions(model, effort) {
  if (model.startsWith("kimi-k3")) return { reasoning_effort: effort };
  if (model.startsWith("kimi-k2")) return { thinking: { type: "disabled" } };
  return {};
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nextRequestAt = 0;

/** Faz um pedido à API respeitando o limite por minuto e tentando de novo em erros passageiros. */
async function callApi(request) {
  for (let attempt = 1; ; attempt++) {
    const wait = nextRequestAt - Date.now();
    if (wait > 0) await sleep(wait);
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    try {
      return await request();
    } catch (error) {
      const transient =
        error instanceof OpenAI.RateLimitError ||
        error instanceof OpenAI.InternalServerError ||
        error instanceof OpenAI.APIConnectionError;
      if (!transient || attempt >= MAX_ATTEMPTS) throw error;
      const delay = 20_000 * attempt;
      console.warn(`  aguardando ${delay / 1000}s antes de tentar de novo (${error.message})`);
      await sleep(delay);
    }
  }
}

function emptyUsage() {
  return { input: 0, cached: 0, output: 0, searches: 0, cost: 0, costKnown: true };
}

function addUsage(total, usage, model) {
  if (!usage) return;
  const cached = usage.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;
  const input = Math.max(0, (usage.prompt_tokens ?? 0) - cached);
  const output = usage.completion_tokens ?? 0;
  total.input += input;
  total.cached += cached;
  total.output += output;
  const price = PRICES[model];
  if (price) total.cost += (input * price.input + cached * price.cached + output * price.output) / 1_000_000;
  else total.costKnown = false;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

/** Conecta na API; chaves da China só funcionam em api.moonshot.cn, então testamos os dois endereços. */
async function connect(apiKey) {
  for (const baseURL of BASE_URLS) {
    // As novas tentativas ficam por conta do callApi, que respeita o limite de pedidos por minuto.
    const client = new OpenAI({ apiKey, baseURL, timeout: 15 * 60 * 1000, maxRetries: 0 });
    try {
      await callApi(() => client.models.list());
      return client;
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) continue;
      if (error instanceof OpenAI.NotFoundError) return client;
      throw error;
    }
  }
  throw new Error("a Moonshot recusou a chave. Confira o segredo MOONSHOT_API_KEY.");
}

/** Passo 1: a IA pesquisa na web e devolve anotações em texto, com as fontes. */
async function research(client, model, { city, today, windowEnd, knownEvents }, usage) {
  const messages = [
    { role: "system", content: RESEARCH_SYSTEM },
    { role: "user", content: buildResearchPrompt({ city, today, windowEnd, knownEvents }) },
  ];

  let searches = 0;
  let nudged = false;
  for (let round = 0; round <= MAX_SEARCH_ROUNDS; round++) {
    const lastRound = round === MAX_SEARCH_ROUNDS;
    if (lastRound) {
      messages.push({
        role: "user",
        content: "Pare de pesquisar e escreva agora as anotações com o que já encontrou.",
      });
    }
    const completion = await callApi(() =>
      client.chat.completions.create({
        model,
        messages,
        ...(lastRound ? {} : { tools: [WEB_SEARCH_TOOL] }),
        max_tokens: MAX_TOKENS,
        ...modelOptions(model, "high"),
      }),
    );
    addUsage(usage, completion.usage, model);
    const choice = completion.choices[0];
    // O Kimi K3 exige que a resposta volte inteira para o histórico (com reasoning_content e tool_calls).
    messages.push(choice.message);

    const toolCalls = choice.message.tool_calls ?? [];
    console.log(`  rodada ${round + 1} (${model}): ${choice.finish_reason}, ${toolCalls.length} busca(s) pedida(s)`);
    if (choice.finish_reason === "length") throw new Error("a resposta da pesquisa veio cortada (max_tokens)");
    if (!toolCalls.length) {
      // Se o modelo respondeu sem pesquisar, pede uma vez que ele use a busca na web.
      if (searches === 0 && !nudged && !lastRound) {
        nudged = true;
        messages.push({
          role: "user",
          content:
            "Você ainda não pesquisou na internet. Use a ferramenta $web_search agora, com várias buscas, " +
            "e só depois escreva as anotações com os eventos encontrados e suas URLs.",
        });
        continue;
      }
      return choice.message.content ?? "";
    }

    for (const call of toolCalls) {
      const isSearch = call.function?.name === WEB_SEARCH_TOOL.function.name;
      if (isSearch) {
        searches++;
        usage.searches++;
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function?.name,
        // Para o $web_search basta devolver os próprios argumentos; a Moonshot injeta os resultados.
        content: isSearch ? call.function.arguments : JSON.stringify({ error: "ferramenta desconhecida" }),
      });
    }
  }
  return "";
}

/** Se a busca falhar no modelo principal, tenta o modelo reserva (há relatos de falha do $web_search no K3). */
async function researchWithFallback(client, context, usage) {
  try {
    return await research(client, MODEL, context, usage);
  } catch (error) {
    const canFallback =
      SEARCH_FALLBACK_MODEL && SEARCH_FALLBACK_MODEL !== MODEL && error instanceof OpenAI.BadRequestError;
    if (!canFallback) throw error;
    console.warn(`⚠ A busca com ${MODEL} falhou (${error.message}). Tentando com ${SEARCH_FALLBACK_MODEL}…`);
    return research(client, SEARCH_FALLBACK_MODEL, context, usage);
  }
}

/** Passo 2: as anotações viram uma lista de eventos em JSON, no formato do app. */
async function extract(client, { city, today, notes }, usage) {
  const request = {
    model: MODEL,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM },
      { role: "user", content: buildExtractionPrompt({ city, today, notes }) },
    ],
    max_tokens: MAX_TOKENS,
    ...modelOptions(MODEL, "low"),
  };

  let completion;
  try {
    completion = await callApi(() =>
      client.chat.completions.create({
        ...request,
        response_format: {
          type: "json_schema",
          json_schema: { name: "eventos", strict: true, schema: EXTRACTION_JSON_SCHEMA },
        },
      }),
    );
  } catch (error) {
    if (!(error instanceof OpenAI.BadRequestError)) throw error;
    // Se o modo estruturado não for aceito, usa o modo JSON simples (o formato vai descrito no prompt).
    console.warn(`⚠ Saída estruturada recusada (${error.message}); usando modo JSON simples.`);
    completion = await callApi(() =>
      client.chat.completions.create({ ...request, response_format: { type: "json_object" } }),
    );
  }
  addUsage(usage, completion.usage, MODEL);

  const choice = completion.choices[0];
  if (choice.finish_reason === "length") throw new Error("a resposta da IA veio cortada (max_tokens)");
  return parseEventsJson(choice.message.content);
}

async function updateCity(client, city) {
  const today = todayIn(city.timezone);
  const { windowEnd, maxDate } = windowFor(today, WINDOW_DAYS);
  const file = path.join(DATA_DIR, "events", `${city.slug}.json`);
  const current = await readJson(file, { events: [] });
  const knownEvents = current.events.filter((e) => e.end_date >= today);
  const usage = emptyUsage();

  console.log(`\n▶ ${city.name}: pesquisando de ${today} a ${windowEnd} (${knownEvents.length} eventos já conhecidos)`);
  const notes = await researchWithFallback(client, { city, today, windowEnd, knownEvents }, usage);
  if (!notes.trim()) throw new Error("a pesquisa não trouxe resultados");

  console.log(`  anotações (início): ${notes.replace(/\s+/g, " ").slice(0, 500)}`);

  const extracted = await extract(client, { city, today, notes }, usage);
  // Sem nenhum evento, algo deu errado na pesquisa: mantém a agenda como está e marca a execução como falha.
  if (!extracted.length) throw new Error("a IA não encontrou nenhum evento (a agenda anterior foi mantida)");
  const valid = extracted.map((raw) => normalizeEvent(raw, { today, maxDate })).filter(Boolean);
  const events = mergeEvents(current.events, valid, { today });

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ city: city.slug, generated_at: new Date().toISOString(), events }, null, 2)}\n`,
  );

  const cost = usage.cost + usage.searches * WEB_SEARCH_PRICE;
  console.log(
    `✔ ${city.name}: ${extracted.length} encontrados, ${valid.length} válidos, ${events.length} na agenda.` +
      ` Uso: ${usage.searches} buscas, ${usage.input + usage.cached} tokens de entrada` +
      ` (${usage.cached} em cache), ${usage.output} de saída` +
      (usage.costKnown ? ` (≈ US$ ${cost.toFixed(2)}).` : "."),
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

  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    console.error(
      "✖ MOONSHOT_API_KEY não está definida. No GitHub, crie o segredo em" +
        " Settings → Secrets and variables → Actions (veja o README).",
    );
    process.exit(1);
  }

  let client;
  try {
    client = await connect(apiKey);
  } catch (error) {
    console.error(`✖ Não foi possível conectar na Moonshot: ${error.message}`);
    process.exit(1);
  }

  let failures = 0;
  for (const city of selected) {
    try {
      await updateCity(client, city);
    } catch (error) {
      failures++;
      if (error instanceof OpenAI.RateLimitError) {
        console.error(`✖ ${city.name}: limite de uso ou saldo da API esgotado (${error.message}).`);
      } else if (error instanceof OpenAI.APIError) {
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
