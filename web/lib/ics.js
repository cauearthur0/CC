import { addDays } from "./dates.js";
import { parseTimes } from "./format.js";

function escapeIcs(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const compact = (iso) => iso.replaceAll("-", "");

/** "16h30" → "163000" */
function clock(label) {
  const [, hours, minutes = "00"] = label.match(/(\d{1,2})h(\d{2})?/);
  return `${hours.padStart(2, "0")}${minutes}00`;
}

function plusOneHour(label) {
  const [, hours, minutes = "00"] = label.match(/(\d{1,2})h(\d{2})?/);
  return `${String(Math.min(23, Number(hours) + 1)).padStart(2, "0")}${minutes}00`;
}

/**
 * Arquivo .ics para salvar o evento na agenda do celular. Se o evento for de um dia só e tiver horário,
 * cria um compromisso com hora (no fuso do celular); senão, um evento de dia inteiro.
 */
export function buildIcs(event, now = new Date(), { alarm = false } = {}) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const description = [event.schedule, event.price, event.description, event.url].filter(Boolean).join("\n");
  const location = [event.venue, event.address].filter(Boolean).join(" - ");
  const endDate = event.end_date ?? event.start_date;
  const { start, end } = parseTimes(event.schedule);
  const timed = start && endDate === event.start_date;

  const when = timed
    ? [
        `DTSTART:${compact(event.start_date)}T${clock(start)}`,
        `DTEND:${compact(event.start_date)}T${end ? clock(end) : plusOneHour(start)}`,
      ]
    : [`DTSTART;VALUE=DATE:${compact(event.start_date)}`, `DTEND;VALUE=DATE:${compact(addDays(endDate, 1))}`];

  const reminder = alarm
    ? [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcs(event.title)}`,
        // 2 horas antes do horário, ou às 9h da véspera para eventos de dia inteiro.
        timed ? "TRIGGER:-PT2H" : "TRIGGER:-PT15H",
        "END:VALARM",
      ]
    : [];

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pequenos Roles//Agenda infantil//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}-${compact(event.start_date)}@pequenos-roles`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs(location)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${event.url}`,
    ...reminder,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
