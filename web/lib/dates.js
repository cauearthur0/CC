// Datas são sempre strings "AAAA-MM-DD" (sem fuso), para evitar que um evento
// "pule" de dia por causa do horário de verão ou do fuso do celular.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = toUtcDate(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function toUtcDate(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

export function fromUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

/** Data de hoje ("AAAA-MM-DD") no fuso da cidade, não no fuso do servidor. */
export function todayIn(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(iso, days) {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

/** 0 = domingo ... 6 = sábado */
export function weekday(iso) {
  return toUtcDate(iso).getUTCDay();
}

export function diffDays(fromIso, toIso) {
  return Math.round((toUtcDate(toIso).getTime() - toUtcDate(fromIso).getTime()) / 86_400_000);
}

/** Próximo fim de semana (ou o atual, se hoje já for sábado/domingo). */
export function weekendRange(today) {
  const wd = weekday(today);
  if (wd === 6) return { start: today, end: addDays(today, 1) };
  if (wd === 0) return { start: today, end: today };
  const saturday = addDays(today, 6 - wd);
  return { start: saturday, end: addDays(saturday, 1) };
}

export function rangesOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}
