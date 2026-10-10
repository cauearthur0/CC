#!/usr/bin/env node
// Atualiza a agenda: para cada cidade, lê as páginas de agenda fixas (cities.json → sources), o Kimi
// (Moonshot AI) pesquisa outros eventos infantis na web, e tudo é convertido em JSON, validado e
// juntado aos eventos que já existem.
//
// Uso:
//   MOONSHOT_API_KEY=... npm run update-events
//   MOONSHOT_API_KEY=... npm run update-events -- --city porto-alegre
//   npm run update-events -- --enrich-only    (só fotos e mapa, sem IA)
//
// Variáveis opcionais:
//   KIMI_MODEL                  modelo principal (padrão kimi-k3)
//   KIMI_SEARCH_FALLBACK_MODEL  modelo reserva para a busca na web (padrão kimi-k2.6; vazio desliga)
//   KIMI_SEARCH_FORMULA         ferramenta oficial de busca da Moonshot (padrão moonshot/web-search:latest)
//   MAX_SEARCHES                máximo de buscas na web por cidade (padrão 15)
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
import { addCoordinates, addImages, addNeighborhoods } from "./lib/enrich.mjs";
import { mergeEvents, normalizeEvent, parseEventsJson, windowFor } from "./lib/events.mjs";
import { batchNotes, imagesByUrl, readSource, sourceNotes } from "./lib/sources.mjs";
import {
  SUGGESTIONS_JSON_SCHEMA,
  SUGGESTIONS_SYSTEM,
  buildSuggestionsPrompt,
  cleanSuggestions,
  upcomingForSuggestions,
} from "./lib/suggestions.mjs";
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
const MAX_SEARCHES = Number(process.env.MAX_SEARCHES || 15);
const MAX_TOKENS = 16_384;
// Contas novas da Moonshot aceitam só 3 pedidos por minuto; espaçamos os pedidos para não estourar.
const MIN_REQUEST_INTERVAL_MS = Math.ceil(60_000 / Number(process.env.MOONSHOT_RPM || 3)) + 500;
const MAX_ATTEMPTS = 5;

// Busca na web pelas "ferramentas oficiais" (Formulas) da Moonshot: o modelo pede a busca,
// o script a executa na API da Moonshot e devolve o resultado. A busca embutida ($web_search)
// falha no kimi-k3 com "tokenization failed" e a Moonshot não a recomenda por enquanto.
const SEARCH_FORMULA = process.env.KIMI_SEARCH_FORMULA || "moonshot/web-search:latest";

// Preços (US$) só para estimar o custo no log: por milhão de tokens e por busca.
const PRICES = { "kimi-k3": { input: 3, cached: 0.3, output: 15 } };
const WEB_SEARCH_PRICE = 0.005;

/** O Kimi K3 sempre "pensa"; reasoning_effort controla o quanto (low, high ou max). */
function modelOptions(model, effort) {
  return model.startsWith("kimi-k3") ? { reasoning_effort: effort } : {};
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
        error.status === 429 ||
        error.status >= 500 ||
        error instanceof OpenAI.APIConnectionError ||
        error instanceof TypeError; // falha de rede no fetch
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

class FormulaError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${body}`);
    this.status = status;
  }
}

/** Chama a API de ferramentas oficiais (Formulas) da Moonshot. */
async function formulaRequest(client, suffix, init = {}) {
  const url = `${client.baseURL.replace(/\/$/, "")}/formulas/${SEARCH_FORMULA}/${suffix}`;
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${client.apiKey}`, "Content-Type": "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new FormulaError(response.status, text.slice(0, 300));
  return JSON.parse(text);
}

/** Declarações da ferramenta de busca, no formato de "tools" do chat. */
async function loadSearchTools(client) {
  const { tools } = await callApi(() => formulaRequest(client, "tools"));
  if (!tools?.length) throw new Error(`a ferramenta ${SEARCH_FORMULA} não devolveu nenhuma declaração`);
  return tools;
}

/** Executa uma busca pedida pelo modelo e devolve o texto para a mensagem "tool". */
async function runSearch(client, name, args) {
  try {
    const fiber = await callApi(() =>
      formulaRequest(client, "fibers", { method: "POST", body: JSON.stringify({ name, arguments: args }) }),
    );
    if (fiber.status === "succeeded") {
      // A busca é "protegida": o resultado vem criptografado e vai assim mesmo para o modelo.
      return fiber.context?.output || fiber.context?.encrypted_output || "Nenhum resultado.";
    }
    return `Erro na busca: ${JSON.stringify(fiber.error ?? fiber.context?.error ?? fiber.status)}`;
  } catch (error) {
    console.warn(`  busca falhou: ${error.message}`);
    return `Erro na busca: ${error.message}`;
  }
}

/** Passo 1: a IA pesquisa na web e devolve anotações em texto, com as fontes. */
async function research(client, model, { city, today, windowEnd, knownEvents, readSources, searchTools }, usage) {
  const messages = [
    { role: "system", content: RESEARCH_SYSTEM },
    { role: "user", content: buildResearchPrompt({ city, today, windowEnd, knownEvents, readSources }) },
  ];

  const searchToolNames = new Set(searchTools.map((tool) => tool.function?.name));
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
        ...(lastRound ? {} : { tools: searchTools }),
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
            "Você ainda não pesquisou na internet. Use a ferramenta de busca na web agora, com várias buscas, " +
            "e só depois escreva as anotações com os eventos encontrados e suas URLs.",
        });
        continue;
      }
      return choice.message.content ?? "";
    }

    for (const call of toolCalls) {
      const name = call.function?.name;
      let content;
      if (!searchToolNames.has(name)) {
        content = `Erro: ferramenta desconhecida (${name}).`;
      } else if (searches >= MAX_SEARCHES) {
        content = "Limite de buscas atingido. Escreva agora as anotações com o que já encontrou.";
      } else {
        searches++;
        usage.searches++;
        content = await runSearch(client, name, call.function.arguments);
      }
      messages.push({ role: "tool", tool_call_id: call.id, name, content });
    }
  }
  return "";
}

/** Se a pesquisa falhar no modelo principal por um pedido recusado, tenta o modelo reserva. */
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

/** Pede uma resposta em JSON (saída estruturada; se for recusada, modo JSON simples). */
async function jsonCompletion(client, { system, user, name, schema }, usage) {
  const request = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: MAX_TOKENS,
    ...modelOptions(MODEL, "low"),
  };

  let completion;
  try {
    completion = await callApi(() =>
      client.chat.completions.create({
        ...request,
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      }),
    );
  } catch (error) {
    if (!(error instanceof OpenAI.BadRequestError)) throw error;
    console.warn(`⚠ Saída estruturada recusada (${error.message}); usando modo JSON simples.`);
    completion = await callApi(() =>
      client.chat.completions.create({ ...request, response_format: { type: "json_object" } }),
    );
  }
  addUsage(usage, completion.usage, MODEL);

  const choice = completion.choices[0];
  if (choice.finish_reason === "length") throw new Error("a resposta da IA veio cortada (max_tokens)");
  return choice.message.content;
}

/** Passo 2: as anotações viram uma lista de eventos em JSON, no formato do app. */
async function extract(client, { city, today, windowEnd, notes }, usage) {
  const content = await jsonCompletion(
    client,
    {
      system: EXTRACTION_SYSTEM,
      user: buildExtractionPrompt({ city, today, windowEnd, notes }),
      name: "eventos",
      schema: EXTRACTION_JSON_SCHEMA,
    },
    usage,
  );
  return parseEventsJson(content);
}

/** Extrai os eventos das anotações da pesquisa e das fontes fixas, em lotes. Um lote que falha não derruba os outros. */
async function extractAll(client, { city, today, windowEnd, notes, sourceParts }, usage) {
  const batches = [
    ...(notes?.trim() ? [{ label: "pesquisa", text: notes }] : []),
    ...batchNotes(sourceParts).map((text, i) => ({ label: `fontes fixas ${i + 1}`, text })),
  ];
  const events = [];
  let failures = 0;
  for (const { label, text } of batches) {
    try {
      const found = await extract(client, { city, today, windowEnd, notes: text }, usage);
      console.log(`  extração (${label}): ${found.length} eventos`);
      events.push(...found);
    } catch (error) {
      failures++;
      console.warn(`⚠ Extração (${label}) falhou: ${error.message}`);
    }
  }
  if (failures === batches.length) throw new Error("nenhuma extração deu certo");
  return events;
}

/** Passo 3: a IA sugere combinações de programas para cada faixa de idade. */
async function suggest(client, { city, today, events }, usage) {
  const upcoming = upcomingForSuggestions(events, today);
  if (!upcoming.length) return [];
  const content = await jsonCompletion(
    client,
    {
      system: SUGGESTIONS_SYSTEM,
      user: buildSuggestionsPrompt({ city, today, events: upcoming }),
      name: "sugestoes",
      schema: SUGGESTIONS_JSON_SCHEMA,
    },
    usage,
  );
  const raw = JSON.parse(
    content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
  return cleanSuggestions(raw.suggestions, upcoming);
}

/** Passo 0: lê as páginas de agenda fixas da cidade (todas ao mesmo tempo; são sites diferentes). */
async function readSources(city) {
  const sources = city.sources ?? [];
  if (!sources.length) return [];
  const results = await Promise.all(sources.map((source) => readSource(source)));
  const ok = results.filter((r) => r.ok);
  const structured = ok.reduce((sum, r) => sum + r.events.length, 0);
  console.log(`  fontes fixas: ${ok.length}/${results.length} lidas, ${structured} eventos estruturados`);
  for (const r of results.filter((r) => !r.ok)) {
    console.warn(`⚠ Fonte fixa fora do ar: ${r.source.name} (status ${r.status} ${r.error ?? ""})`);
  }
  return results;
}

/** Foto de capa, coordenadas e bairro para os eventos que ainda não têm. */
async function enrich(events, city) {
  const pages = await addImages(events);
  const lookups = await addCoordinates(events, city);
  const reverse = await addNeighborhoods(events, city);
  const withImage = events.filter((e) => e.image).length;
  const withCoords = events.filter((e) => e.lat != null).length;
  console.log(
    `  fotos: ${withImage}/${events.length} (${pages} páginas lidas); ` +
      `no mapa: ${withCoords}/${events.length} (${lookups} buscas de endereço); ` +
      `com bairro: ${events.filter((e) => e.neighborhood).length}/${events.length} (${reverse} buscas de bairro)`,
  );
}

async function saveCity(file, city, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ city: city.slug, generated_at: new Date().toISOString(), ...data }, null, 2)}\n`,
  );
}

/** Só completa fotos e coordenadas, sem chamar a IA (útil para testar ou quando a IA falha). */
async function enrichCity(city) {
  const today = todayIn(city.timezone);
  const file = path.join(DATA_DIR, "events", `${city.slug}.json`);
  const current = await readJson(file, { events: [] });
  const events = current.events.filter((e) => e.end_date >= today);
  console.log(`\n▶ ${city.name}: completando fotos e mapa de ${events.length} eventos`);
  await enrich(events, city);
  await saveCity(file, city, { events, suggestions: current.suggestions ?? [] });
}

async function updateCity(client, city, searchTools) {
  const today = todayIn(city.timezone);
  const { windowEnd, maxDate } = windowFor(today, WINDOW_DAYS);
  const file = path.join(DATA_DIR, "events", `${city.slug}.json`);
  const current = await readJson(file, { events: [] });
  const knownEvents = current.events.filter((e) => e.end_date >= today);
  const usage = emptyUsage();

  console.log(`\n▶ ${city.name}: pesquisando de ${today} a ${windowEnd} (${knownEvents.length} eventos já conhecidos)`);
  const sourceResults = await readSources(city);
  const readNames = sourceResults.filter((r) => r.ok).map((r) => `${r.source.name} (${r.source.url})`);
  const sourceParts = sourceResults.map((r) => sourceNotes(r, { today })).filter(Boolean);

  let notes = "";
  try {
    notes = await researchWithFallback(
      client,
      { city, today, windowEnd, knownEvents, readSources: readNames, searchTools },
      usage,
    );
    console.log(`  anotações (início): ${notes.replace(/\s+/g, " ").slice(0, 500)}`);
  } catch (error) {
    // Com as fontes fixas ainda dá para atualizar a agenda; sem elas, a execução falha.
    if (!sourceParts.length) throw error;
    console.warn(`⚠ A pesquisa na web falhou (${error.message}); seguindo só com as fontes fixas.`);
  }
  if (!notes.trim() && !sourceParts.length) throw new Error("a pesquisa não trouxe resultados");

  const extracted = await extractAll(client, { city, today, windowEnd, notes, sourceParts }, usage);
  // Sem nenhum evento, algo deu errado na pesquisa: mantém a agenda como está e marca a execução como falha.
  if (!extracted.length) throw new Error("a IA não encontrou nenhum evento (a agenda anterior foi mantida)");
  const valid = extracted.map((raw) => normalizeEvent(raw, { today, maxDate })).filter(Boolean);
  const events = mergeEvents(current.events, valid, { today });

  // Fotos que já vieram nas fontes fixas poupam uma leitura de página.
  const images = imagesByUrl(sourceResults);
  for (const event of events) if (event.image === undefined && images.has(event.url)) event.image = images.get(event.url);

  await enrich(events, city);

  let suggestions = cleanSuggestions(current.suggestions, events);
  try {
    suggestions = await suggest(client, { city, today, events }, usage);
    console.log(`  sugestões da IA: ${suggestions.length}`);
  } catch (error) {
    // Sugestões são um extra: se falharem, mantém as anteriores que ainda valem.
    console.warn(`⚠ Não foi possível gerar sugestões (${error.message}); mantendo as anteriores.`);
  }

  await saveCity(file, city, { events, suggestions });

  const cost = usage.cost + usage.searches * WEB_SEARCH_PRICE;
  console.log(
    `✔ ${city.name}: ${extracted.length} encontrados, ${valid.length} válidos, ${events.length} na agenda.` +
      ` Uso: ${usage.searches} buscas, ${usage.input + usage.cached} tokens de entrada` +
      ` (${usage.cached} em cache), ${usage.output} de saída` +
      (usage.costKnown ? ` (≈ US$ ${cost.toFixed(2)}).` : "."),
  );
}

async function main() {
  const { values } = parseArgs({ options: { city: { type: "string" }, "enrich-only": { type: "boolean" } } });
  const { cities } = await readJson(path.join(DATA_DIR, "cities.json"), { cities: [] });
  const selected = values.city ? cities.filter((c) => c.slug === values.city) : cities;
  if (!selected.length) {
    console.error(
      values.city ? `Cidade "${values.city}" não está em web/data/cities.json.` : "Nenhuma cidade configurada.",
    );
    process.exit(1);
  }

  if (values["enrich-only"]) {
    for (const city of selected) await enrichCity(city);
    return;
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
  let searchTools;
  try {
    client = await connect(apiKey);
    searchTools = await loadSearchTools(client);
  } catch (error) {
    console.error(`✖ Não foi possível conectar na Moonshot: ${error.message}`);
    process.exit(1);
  }

  let failures = 0;
  for (const city of selected) {
    try {
      await updateCity(client, city, searchTools);
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
