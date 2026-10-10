import { addDays, diffDays, rangesOverlap, weekendRange } from "./dates.js";

export const WHEN_OPTIONS = [
  { id: "hoje", label: "Hoje" },
  { id: "fim-de-semana", label: "Fim de semana" },
  { id: "7-dias", label: "7 dias" },
  { id: "30-dias", label: "30 dias" },
];

export const DEFAULT_WHEN = "7-dias";

// Eventos que duram uma semana ou mais (exposições, temporadas) vão para
// a seção "Em cartaz", em vez de se repetirem em todos os dias.
const LONG_RUN_DAYS = 7;

export function rangeFor(when, today) {
  switch (when) {
    case "hoje":
      return { start: today, end: today };
    case "fim-de-semana":
      return weekendRange(today);
    case "30-dias":
      return { start: today, end: addDays(today, 29) };
    case "7-dias":
    default:
      return { start: today, end: addDays(today, 6) };
  }
}

export function eventRange(event) {
  return { start: event.start_date, end: event.end_date ?? event.start_date };
}

/** Sem faixa etária definida = serve para qualquer idade. */
export function matchesAges(event, ages) {
  if (!ages?.length) return true;
  const min = event.age_min ?? 0;
  const max = event.age_max ?? Infinity;
  return ages.some((age) => age >= min && age <= max);
}

export function filterEvents(events, { range, ages = [], freeOnly = false, category = null }) {
  return events.filter(
    (e) =>
      rangesOverlap(eventRange(e), range) &&
      matchesAges(e, ages) &&
      (!freeOnly || e.is_free) &&
      (!category || e.category === category),
  );
}

export function isLongRunning(event) {
  return diffDays(event.start_date, event.end_date ?? event.start_date) >= LONG_RUN_DAYS;
}

/** Minutos desde meia-noite do primeiro horário citado ("16h", "14h30", "9:00"), ou null. */
export function startMinutes(schedule) {
  if (!schedule) return null;
  const m = schedule.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
  if (!m) return null;
  const hours = Number(m[1]);
  if (hours > 23) return null;
  return hours * 60 + Number(m[2] ?? 0);
}

function byTimeThenTitle(a, b) {
  const ta = startMinutes(a.schedule) ?? Infinity;
  const tb = startMinutes(b.schedule) ?? Infinity;
  return ta - tb || a.title.localeCompare(b.title, "pt-BR");
}

/**
 * Agrupa os eventos por dia. Um evento que começou antes do período aparece
 * no primeiro dia do período; temporadas longas ficam em `ongoing`.
 */
export function groupEvents(events, range) {
  const byDay = new Map();
  const ongoing = [];
  for (const e of events) {
    if (isLongRunning(e)) {
      ongoing.push(e);
      continue;
    }
    const day = e.start_date < range.start ? range.start : e.start_date;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }
  const days = [...byDay.keys()].sort().map((day) => ({ day, events: byDay.get(day).sort(byTimeThenTitle) }));
  ongoing.sort((a, b) => a.end_date.localeCompare(b.end_date) || a.title.localeCompare(b.title, "pt-BR"));
  return { days, ongoing };
}

export function isNew(event, today, days = 3) {
  return Boolean(event.first_seen) && diffDays(event.first_seen, today) <= days;
}
