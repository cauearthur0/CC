import { createHash } from "node:crypto";
import { CATEGORY_IDS } from "../../web/lib/categories.js";
import { addDays, isIsoDate, rangesOverlap } from "../../web/lib/dates.js";

// Limite de eventos guardados por cidade, para o arquivo continuar leve no celular.
export const MAX_EVENTS_PER_CITY = 200;

const FREE_PRICE = /gratuit|gr[áa]tis|entrada (franca|livre)|free/i;

/** Texto sem acentos, minúsculo e só com letras/números, para comparar títulos. */
export function slugify(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function makeId(title, startDate) {
  return createHash("sha1")
    .update(`${slugify(title)}|${startDate}`)
    .digest("hex")
    .slice(0, 12);
}

function cleanText(value, maxLength = 400) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function cleanAge(value) {
  const n = Math.round(Number(value));
  if (value === null || value === undefined || value === "" || !Number.isFinite(n) || n < 0) return null;
  // 18+ significa "sem limite" para uma agenda infantil.
  return n >= 18 ? null : n;
}

function cleanUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Valida e limpa um evento vindo da IA. Devolve null quando o evento não serve:
 * sem título, sem data válida, sem fonte, já terminou ou é longe demais no futuro.
 */
export function normalizeEvent(raw, { today, maxDate, firstSeen = today }) {
  if (!raw || typeof raw !== "object") return null;

  const title = cleanText(raw.title, 140);
  const url = cleanUrl(raw.url);
  if (!title || !url || !isIsoDate(raw.start_date)) return null;

  const start_date = raw.start_date;
  let end_date = isIsoDate(raw.end_date) ? raw.end_date : start_date;
  if (end_date < start_date) end_date = start_date;
  if (end_date < today || start_date > maxDate) return null;

  let age_min = cleanAge(raw.age_min);
  let age_max = cleanAge(raw.age_max);
  if (age_min === 0) age_min = null;
  if (age_min !== null && age_max !== null && age_min > age_max) [age_min, age_max] = [age_max, age_min];

  const price = cleanText(raw.price, 120);

  return {
    id: makeId(title, start_date),
    title,
    description: cleanText(raw.description, 400) ?? "",
    category: CATEGORY_IDS.includes(raw.category) ? raw.category : "outro",
    start_date,
    end_date,
    schedule: cleanText(raw.schedule, 160),
    venue: cleanText(raw.venue, 160) ?? "Local a confirmar",
    address: cleanText(raw.address, 200),
    price,
    is_free: raw.is_free === true || (price !== null && FREE_PRICE.test(price)),
    age_min,
    age_max,
    age_estimated: raw.age_estimated !== false,
    url,
    source: cleanText(raw.source, 80) ?? new URL(url).hostname.replace(/^www\./, ""),
    first_seen: isIsoDate(raw.first_seen) ? raw.first_seen : firstSeen,
  };
}

function rangeOf(event) {
  return { start: event.start_date, end: event.end_date };
}

/** Mesmo evento visto em duas buscas diferentes (título igual ou contido, datas que se cruzam). */
export function isSameEvent(a, b) {
  if (!rangesOverlap(rangeOf(a), rangeOf(b))) return false;
  const ta = slugify(a.title);
  const tb = slugify(b.title);
  if (ta === tb) return true;
  const sameVenue = slugify(a.venue) === slugify(b.venue);
  return sameVenue && a.start_date === b.start_date && (ta.includes(tb) || tb.includes(ta));
}

function compareEvents(a, b) {
  return a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title, "pt-BR");
}

/**
 * Junta os eventos já conhecidos com os novos: remove os que já passaram,
 * atualiza os repetidos (mantendo o id e a data em que apareceram pela
 * primeira vez) e acrescenta os inéditos.
 */
export function mergeEvents(existing, incoming, { today }) {
  const merged = existing.filter((e) => e.end_date >= today);
  for (const event of incoming) {
    const index = merged.findIndex((e) => isSameEvent(e, event));
    if (index === -1) {
      merged.push(event);
    } else {
      const previous = merged[index];
      // first_seen null = evento da carga inicial, que nunca deve aparecer como "Novo".
      const first_seen = previous.first_seen === undefined ? event.first_seen : previous.first_seen;
      merged[index] = { ...event, id: previous.id, first_seen };
    }
  }
  return merged.sort(compareEvents).slice(0, MAX_EVENTS_PER_CITY);
}

export function windowFor(today, days) {
  return { today, windowEnd: addDays(today, days), maxDate: addDays(today, days * 3) };
}

/**
 * Lê a lista de eventos devolvida pela IA. Aceita {"events": [...]} ou uma lista solta,
 * e tolera o JSON vir dentro de um bloco ```json.
 */
export function parseEventsJson(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const data = JSON.parse(cleaned);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  throw new Error('o JSON da IA não tem a lista "events"');
}
