// Completa os eventos depois da IA: foto de capa (og:image da página de origem) e coordenadas
// (geocodificação pelo OpenStreetMap/Nominatim). Só processa eventos que ainda não foram
// tentados, porque o resultado (inclusive null) fica salvo no arquivo da cidade.

const USER_AGENT = "PequenosRoles/1.0 (agenda infantil; https://github.com/cauearthur0/CC)";
const PAGE_TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 1_500_000;
const NOMINATIM_INTERVAL_MS = 1_100; // a política do Nominatim pede no máximo 1 pedido por segundo

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Procura a imagem de compartilhamento (og:image ou twitter:image) no HTML. */
export function extractOgImage(html, pageUrl) {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const wanted of ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
    for (const tag of metas) {
      const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (key !== wanted) continue;
      const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!content) continue;
      try {
        const url = new URL(decodeEntities(content.trim()), pageUrl);
        if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
      } catch {
        // URL inválida: tenta a próxima.
      }
    }
  }
  return null;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    while (html.length < MAX_PAGE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      // O og:image fica no <head>; não precisa baixar a página inteira.
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    return { html, finalUrl: response.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Busca a foto de capa de cada evento novo. Páginas repetidas são lidas uma vez só. */
export async function addImages(events, { limit = 60 } = {}) {
  const cache = new Map();
  let fetched = 0;
  for (const event of events) {
    if (event.image !== undefined || fetched >= limit) continue;
    if (!cache.has(event.url)) {
      fetched++;
      const page = await fetchText(event.url);
      cache.set(event.url, page ? extractOgImage(page.html, page.finalUrl) : null);
    }
    event.image = cache.get(event.url);
  }
  return fetched;
}

function geocodeQueries(event, city) {
  const place = `${city.name}, ${city.state}, Brasil`;
  const cityName = city.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const queries = [];
  // Tira o nome da cidade (e o que vem depois) do endereço, para não repetir na busca.
  if (event.address) queries.push(`${event.address.replace(new RegExp(`,?\\s*${cityName}.*$`, "i"), "")}, ${place}`);
  queries.push(`${event.venue}, ${place}`);
  if (event.neighborhood) queries.push(`${event.neighborhood}, ${place}`);
  return [...new Set(queries)];
}

async function nominatim(query, city) {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", countrycodes: "br" });
  if (city.bbox) {
    // Restringe à região da cidade para não achar um lugar homônimo em outro estado.
    params.set("viewbox", city.bbox.join(","));
    params.set("bounded", "1");
  }
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
    });
    if (!response.ok) return null;
    const [first] = await response.json();
    return first ? { lat: Number(Number(first.lat).toFixed(5)), lng: Number(Number(first.lon).toFixed(5)) } : null;
  } catch {
    return null;
  }
}

/** Descobre as coordenadas dos eventos novos (endereço, depois nome do local, depois bairro). */
export async function addCoordinates(events, city, { limit = 40 } = {}) {
  const cache = new Map();
  let lookups = 0;
  for (const event of events) {
    if (event.lat !== undefined || lookups >= limit) continue;
    let found = null;
    for (const query of geocodeQueries(event, city)) {
      if (cache.has(query)) {
        found = cache.get(query);
      } else {
        lookups++;
        await sleep(NOMINATIM_INTERVAL_MS);
        found = await nominatim(query, city);
        cache.set(query, found);
      }
      if (found) break;
    }
    event.lat = found?.lat ?? null;
    event.lng = found?.lng ?? null;
  }
  return lookups;
}
