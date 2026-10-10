import { addDays } from "./dates.js";

function escapeIcs(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const compact = (iso) => iso.replaceAll("-", "");

/**
 * Arquivo .ics (evento de dia inteiro) para o pai/mãe salvar na agenda do celular.
 * Os horários vão na descrição, porque a fonte nem sempre traz um horário exato.
 */
export function buildIcs(event, now = new Date()) {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const description = [event.schedule, event.price, event.description, event.url].filter(Boolean).join("\n");
  const location = [event.venue, event.address].filter(Boolean).join(" - ");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Programinha//Agenda infantil//PT-BR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@programinha`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(event.start_date)}`,
    `DTEND;VALUE=DATE:${compact(addDays(event.end_date ?? event.start_date, 1))}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs(location)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${event.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
