// Destaques patrocinados (web/data/destaques.json). Cada destaque vale para uma cidade e um período e
// aponta para um evento da agenda ("event_id") ou traz o próprio evento ("event"), no mesmo formato dos
// eventos do app. O app sempre mostra a etiqueta "Patrocinado".

import { diffDays } from "./dates.js";
import { matchesAges } from "./filters.js";

function activeEntries(entries, { city, today }) {
  return (entries ?? []).filter(
    (d) => d && (!d.city || d.city === city) && (!d.from || d.from <= today) && (!d.until || d.until >= today),
  );
}

function sponsorInfo(entry) {
  return { sponsor: String(entry.sponsor ?? "").slice(0, 60), campaign: entry.id };
}

/**
 * Junta os destaques à programação: marca os eventos patrocinados e inclui os que vêm só no arquivo
 * de destaques. Devolve a programação nova e a lista de destaques (para o cartão do Início).
 */
export function applySponsored(events, entries, { city, today }) {
  const list = [...events];
  const highlights = [];
  for (const entry of activeEntries(entries, { city, today })) {
    let event = null;
    if (entry.event_id) {
      const index = list.findIndex((e) => e.id === entry.event_id);
      if (index !== -1) {
        event = { ...list[index], sponsored: sponsorInfo(entry) };
        list[index] = event;
      }
    } else if (entry.event?.title && entry.event?.start_date && entry.event?.venue) {
      event = {
        category: "outro",
        end_date: entry.event.start_date,
        description: "",
        ...entry.event,
        id: entry.event.id ?? `patrocinado-${entry.id}`,
        first_seen: null,
        sponsored: sponsorInfo(entry),
      };
      if (!list.some((e) => e.id === event.id)) list.push(event);
    }
    if (event && event.end_date >= today) highlights.push(event);
  }
  return { events: list, highlights };
}

/** O destaque do dia para esta criança: só os da idade dela, um por dia em rodízio. */
export function pickHighlight(highlights, { ages, today }) {
  const fitting = highlights.filter((e) => matchesAges(e, ages) && e.end_date >= today);
  if (!fitting.length) return null;
  return fitting[Math.abs(diffDays("2026-01-01", today)) % fitting.length];
}
