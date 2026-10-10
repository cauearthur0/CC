// Fontes fixas: páginas de agenda conhecidas de cada cidade, lidas direto a cada atualização.
// De cada página tiramos (1) eventos estruturados (JSON-LD schema.org ou dados embutidos de sites
// Next.js, como o Sympla) e (2) o texto visível, que a IA usa para achar o que não veio estruturado.

const USER_AGENT =
  "Mozilla/5.0 (compatible; PequenosRoles/1.0; agenda infantil; +https://github.com/cauearthur0/CC)";
const TIMEOUT_MS = 25_000;
const MAX_BYTES = 3_000_000;

export async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "pt-BR" },
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (reader && html.length < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader?.cancel().catch(() => {});
    return { ok: response.ok, status: response.status, url: response.url || url, html };
  } catch (error) {
    return { ok: false, status: 0, url, html: "", error: [error.message, error.cause?.code ?? error.cause?.message].filter(Boolean).join(": ") };
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  middot: "·",
  bull: "•",
};
// Letras acentuadas (&aacute;, &ccedil;, &Atilde; ...): letra + acento combinado.
const ACCENTS = { acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", uml: "\u0308", cedil: "\u0327" };

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    const accented = code.match(/^([a-z])(acute|grave|circ|tilde|uml|cedil)$/i);
    if (accented) return (accented[1] + ACCENTS[accented[2].toLowerCase()]).normalize("NFC");
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function pageTitle(html) {
  return decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
}

/** Conteúdo principal (<main> ou <article>), quando a página marca um com texto suficiente. */
function mainContent(html) {
  for (const tag of ["main", "article"]) {
    const start = html.search(new RegExp(`<${tag}\\b`, "i"));
    const end = html.toLowerCase().lastIndexOf(`</${tag}>`);
    if (start === -1 || end <= start) continue;
    const inner = html.slice(start, end);
    if (inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").length >= 400) return inner;
  }
  return html;
}

/** Texto visível da página, com os links como "texto (url)" para a IA saber a fonte de cada evento. */
export function htmlToText(html, pageUrl, maxChars = 12_000) {
  const body = mainContent(html)
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withLinks = body.replace(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 4) return ` ${text} `;
    try {
      return ` ${text} (${new URL(decodeEntities(href), pageUrl).toString()}) `;
    } catch {
      return ` ${text} `;
    }
  });
  const text = decodeEntities(
    withLinks
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/article|\/section)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function firstString(...values) {
  for (const value of values.flat()) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = firstString(value.url, value["@id"], value.name, value.contentUrl);
      if (nested) return nested;
    }
  }
  return null;
}

function absolute(url, base) {
  if (!url) return null;
  try {
    const u = new URL(url, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Data "AAAA-MM-DD" a partir de ISO, timestamp ou "DD/MM/AAAA". */
export function toIsoDay(value) {
  if (value == null) return null;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Horário "16h"/"16h30" a partir de um ISO com hora (ignora meia-noite, que costuma ser "sem horário"). */
function timeOf(value) {
  const m = typeof value === "string" ? value.match(/T(\d{2}):(\d{2})/) : null;
  if (!m || (m[1] === "00" && m[2] === "00")) return null;
  return `${Number(m[1])}h${m[2] === "00" ? "" : m[2]}`;
}

function normalizeStructured(item, pageUrl) {
  const title = firstString(item.name, item.title);
  const start = toIsoDay(item.startDate ?? item.start_date ?? item.start ?? item.date ?? item.startTime);
  if (!title || !start) return null;
  const location = asArray(item.location)[0] ?? {};
  const address = location.address;
  const addressText =
    typeof address === "string"
      ? address
      : address
        ? [address.streetAddress, address.addressLocality].filter(Boolean).join(", ")
        : (item.address ?? null);
  const offers = asArray(item.offers)[0];
  const price =
    offers && offers.price != null
      ? Number(offers.price) === 0
        ? "Gratuito"
        : `R$ ${String(offers.price).replace(".", ",")}`
      : null;
  return {
    title: decodeEntities(title),
    start_date: start,
    end_date: toIsoDay(item.endDate ?? item.end_date ?? item.end) ?? start,
    time: timeOf(item.startDate ?? item.start_date),
    venue: firstString(location.name, item.venue?.name, item.place?.name, item.location_name),
    address: addressText ? decodeEntities(String(addressText)) : null,
    url: absolute(firstString(item.url, item["@id"], item.link, item.permalink), pageUrl),
    image: absolute(firstString(item.image, item.images, item.thumbnail, item.banner, item.cover), pageUrl),
    description: item.description ? decodeEntities(String(item.description)).slice(0, 300) : null,
    price,
  };
}

/** Eventos descritos em JSON-LD (schema.org/Event e listas que contêm eventos). */
export function extractJsonLdEvents(html, pageUrl) {
  const events = [];
  const blocks = html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of blocks) {
    let data;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const queue = asArray(data);
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const types = asArray(node["@type"]).map(String);
      if (types.some((t) => /Event$/i.test(t))) {
        const event = normalizeStructured(node, pageUrl);
        if (event) events.push(event);
      }
      for (const key of ["@graph", "itemListElement", "item", "subEvent", "event", "events"]) {
        queue.push(...asArray(node[key]));
      }
    }
  }
  return events;
}

/** Eventos dentro dos dados de páginas Next.js (__NEXT_DATA__), procurando objetos com nome + data. */
export function extractNextDataEvents(html, pageUrl, { max = 200 } = {}) {
  const raw = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!raw) return [];
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const events = [];
  const seen = new Set();
  const stack = [data];
  while (stack.length && events.length < max) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      stack.push(...node);
    } else if (node && typeof node === "object") {
      const hasName = typeof (node.name ?? node.title) === "string";
      const hasDate = ["start_date", "startDate", "start", "date", "start_date_formats"].some((k) => node[k] != null);
      if (hasName && hasDate) {
        const event = normalizeStructured(
          { ...node, startDate: node.start_date ?? node.startDate ?? node.start ?? node.date },
          pageUrl,
        );
        const key = event && `${event.title}|${event.start_date}`;
        if (event && !seen.has(key)) {
          seen.add(key);
          events.push(event);
        }
      }
      stack.push(...Object.values(node));
    }
  }
  return events;
}

/** Links da página (texto + endereço absoluto), sem repetir. */
export function extractLinks(html, pageUrl) {
  const links = new Map();
  for (const [, href, inner] of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absolute(decodeEntities(href), pageUrl);
    const text = decodeEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (url && text && !links.has(url)) links.set(url, { text, url });
  }
  return [...links.values()];
}

// Assuntos que valem abrir a matéria inteira em páginas de notícias.
export const KIDS_PATTERN = /infan|crian[çc]a|fam[íi]lia|kids|beb[êe]s?\b|bonecos|conta[çc][ãa]o de hist|f[ée]rias/i;

const siteOf = (url) => new URL(url).hostname.replace(/^www\./, "");

/** Links da mesma página que falam de crianças (para fontes com "follow"). */
export function linksToFollow(html, pageUrl, { pattern = KIDS_PATTERN, limit = 4 } = {}) {
  const site = siteOf(pageUrl);
  return extractLinks(html, pageUrl)
    .filter((link) => link.url !== pageUrl && siteOf(link.url) === site && pattern.test(link.text))
    .slice(0, limit);
}

/**
 * Lê uma fonte e devolve eventos estruturados + texto para a IA.
 * Com "follow" (true ou uma expressão regular em texto), também abre as matérias ligadas que falam de crianças.
 */
export async function readSource(source) {
  const page = await fetchPage(source.url);
  if (!page.ok || !page.html) return { source, ok: false, status: page.status, error: page.error, events: [], text: "" };
  const events = [...extractJsonLdEvents(page.html, page.url), ...extractNextDataEvents(page.html, page.url)];
  const followed = [];
  if (source.follow) {
    const pattern = source.follow === true ? KIDS_PATTERN : new RegExp(source.follow, "i");
    for (const link of linksToFollow(page.html, page.url, { pattern, limit: source.followLimit ?? 4 })) {
      const sub = await fetchPage(link.url);
      if (!sub.ok || !sub.html) continue;
      events.push(...extractJsonLdEvents(sub.html, sub.url));
      followed.push({ title: link.text, url: sub.url, text: htmlToText(sub.html, sub.url, 5_000) });
    }
  }
  return {
    source,
    ok: true,
    status: page.status,
    title: pageTitle(page.html),
    finalUrl: page.url,
    events,
    text: htmlToText(page.html, page.url, source.maxChars ?? 12_000),
    followed,
  };
}

function eventLine(e) {
  const dates = e.end_date && e.end_date !== e.start_date ? `${e.start_date} a ${e.end_date}` : e.start_date;
  return `- ${e.title} | ${dates}${e.time ? ` ${e.time}` : ""} | ${[e.venue, e.address].filter(Boolean).join(", ")} | ${e.price ?? ""} | ${e.url ?? ""}`;
}

/** Anotações para a IA com o que foi lido de uma fonte fixa (só eventos de hoje em diante). */
export function sourceNotes(result, { today }) {
  if (!result.ok) return "";
  const upcoming = result.events.filter((e) => (e.end_date ?? e.start_date) >= today);
  const lines = [`### Fonte fixa: ${result.source.name} (${result.source.url})`];
  if (upcoming.length) lines.push("Eventos estruturados encontrados na página:", ...upcoming.slice(0, 80).map(eventLine));
  if (result.text) lines.push("Texto da página:", result.text);
  for (const page of result.followed ?? []) lines.push(`#### Matéria ligada: ${page.title} (${page.url})`, page.text);
  return lines.join("\n");
}

export function sourcesToNotes(results, { today }) {
  return results
    .map((r) => sourceNotes(r, { today }))
    .filter(Boolean)
    .join("\n\n");
}

/** Junta as anotações em lotes de até maxChars, para cada pedido de extração caber na resposta da IA. */
export function batchNotes(parts, maxChars = 30_000) {
  const batches = [];
  let current = "";
  for (const part of parts.filter(Boolean)) {
    if (current && current.length + part.length + 2 > maxChars) {
      batches.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${part}` : part;
  }
  if (current) batches.push(current);
  return batches;
}

/** Foto de cada URL de evento vista nas fontes, para completar o que a IA extrair. */
export function imagesByUrl(results) {
  const map = new Map();
  for (const r of results) for (const e of r.events) if (e.url && e.image) map.set(e.url, e.image);
  return map;
}
