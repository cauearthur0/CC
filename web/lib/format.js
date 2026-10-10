import { addDays, toUtcDate } from "./dates.js";

const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const shortFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Hoje", "Amanhã" ou "Sábado, 17 de outubro". */
export function formatDayHeading(day, today) {
  const full = capitalize(dayFormat.format(toUtcDate(day)));
  if (day === today) return `Hoje · ${full}`;
  if (day === addDays(today, 1)) return `Amanhã · ${full}`;
  return full;
}

/** "17/10" */
export function formatShortDate(day) {
  return shortFormat.format(toUtcDate(day));
}

export function formatDateSpan(event) {
  if (!event.end_date || event.end_date === event.start_date) return formatShortDate(event.start_date);
  return `${formatShortDate(event.start_date)} a ${formatShortDate(event.end_date)}`;
}

export function formatAgeRange(event) {
  const min = event.age_min || null;
  const max = event.age_max ?? null;
  const years = (n) => `${n} ${n === 1 ? "ano" : "anos"}`;
  if (min === null && max === null) return "Todas as idades";
  if (min !== null && max !== null) return min === max ? years(min) : `${min} a ${years(max)}`;
  if (min !== null) return `A partir de ${years(min)}`;
  return `Até ${years(max)}`;
}

export function formatAges(ages) {
  if (!ages.length) return "Todas as idades";
  const sorted = [...new Set(ages)].sort((a, b) => a - b);
  const label = (n) => (n === 0 ? "bebê" : `${n} ${n === 1 ? "ano" : "anos"}`);
  if (sorted.length === 1) return label(sorted[0]);
  return `${sorted.slice(0, -1).map(label).join(", ")} e ${label(sorted.at(-1))}`;
}
