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

/** Versão curta para etiquetas: "5 – 10 anos", "+5 anos", "Até 3 anos", "Todas as idades". */
export function formatAgeShort(event) {
  const min = event.age_min || null;
  const max = event.age_max ?? null;
  if (min === null && max === null) return "Todas as idades";
  if (min !== null && max !== null) return min === max ? `${min} anos` : `${min} – ${max} anos`;
  if (min !== null) return `+${min} anos`;
  return `Até ${max} ${max === 1 ? "ano" : "anos"}`;
}

const TIME = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/gi;

/**
 * Horário de início e, se for um intervalo, de fim: "14h às 18h" → { start: "14h", end: "18h" }.
 * Só considera intervalo quando entre os dois horários há apenas "às", "a", "até" ou um traço.
 */
export function parseTimes(schedule) {
  if (!schedule) return { start: null, end: null };
  const matches = [...schedule.matchAll(TIME)].filter((m) => Number(m[1]) <= 23);
  const label = (m) => `${Number(m[1])}h${m[2] && m[2] !== "00" ? m[2] : ""}`;
  if (!matches.length) return { start: null, end: null };
  const [first, second] = matches;
  const between = second ? schedule.slice(first.index + first[0].length, second.index) : "";
  const isRange = second && /^\s*(às|as|a|até|–|-)\s*$/i.test(between);
  return { start: label(first), end: isRange ? label(second) : null };
}

const longDay = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const weekdayName = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });
const weekdayShort = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });
const dayMonthShort = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

export const cap = capitalize;

/** "Sexta-feira, 26 de abril" */
export function formatLongDay(day) {
  return capitalize(longDay.format(toUtcDate(day)));
}

/** "Hoje", "Amanhã" ou "Sábado" */
export function formatRelativeDay(day, today) {
  if (day === today) return "Hoje";
  if (day === addDays(today, 1)) return "Amanhã";
  return capitalize(weekdayName.format(toUtcDate(day)));
}

/** "26 de abril" */
export function formatDayMonth(day) {
  return dayMonth.format(toUtcDate(day));
}

/** "Sáb, 26 de out" */
export function formatShortDay(day) {
  const weekday = capitalize(weekdayShort.format(toUtcDate(day)).replace(".", ""));
  return `${weekday}, ${dayMonthShort.format(toUtcDate(day)).replace(".", "")}`;
}

/** "SEG" */
export function formatWeekdayAbbr(day) {
  return weekdayShort.format(toUtcDate(day)).replace(".", "").slice(0, 3).toUpperCase();
}

/** "Outubro de 2026" */
export function formatMonthYear(day) {
  return capitalize(monthYear.format(toUtcDate(day)));
}

/** Quando o evento acontece, do ponto de vista de "today": "Hoje — 14h às 18h", "Sáb, 17 de out — 16h", "Até 30 de nov". */
export function formatWhen(event, today) {
  const { start, end } = parseTimes(event.schedule);
  const time = start ? (end ? `${start} às ${end}` : start) : null;
  let day;
  if (event.start_date <= today && event.end_date >= today) day = "Hoje";
  else if (event.start_date === addDays(today, 1)) day = "Amanhã";
  else day = formatShortDay(event.start_date);
  const longRun =
    event.end_date !== event.start_date
      ? ` · até ${dayMonthShort.format(toUtcDate(event.end_date)).replace(".", "")}`
      : "";
  return [day, time].filter(Boolean).join(" — ") + longRun;
}
