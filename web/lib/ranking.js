import { interestOf, matchesInterest } from "./categories.js";
import { diffDays, rangesOverlap, weekendRange } from "./dates.js";
import { matchesAges } from "./filters.js";
import { formatKm } from "./geo.js";

const NEW_DAYS = 3;

export function isNewEvent(event, today) {
  return Boolean(event.first_seen) && diffDays(event.first_seen, today) <= NEW_DAYS;
}

function interestsMatched(event, kid) {
  return (kid?.interests ?? []).map(interestOf).filter((interest) => matchesInterest(event, interest));
}

/** Pontuação para ordenar "o que mais combina" com a criança. */
export function eventScore(event, { kid, today, distance = null }) {
  let score = 0;
  score += interestsMatched(event, kid).length * 3;
  if (kid && event.age_min != null && event.age_max != null && matchesAges(event, [kid.age])) score += 2;
  if (isNewEvent(event, today)) score += 1;
  if (distance != null) score += distance < 3 ? 2 : distance < 8 ? 1 : 0;
  const daysAway = Math.max(0, diffDays(today, event.start_date));
  score += Math.max(0, 2 - daysAway / 4);
  return score;
}

function joinPt(parts) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

/** Frase com os motivos de o evento ter sido indicado (só fatos que conhecemos). */
export function reasonsFor(event, { kid, today, distance = null, rainy = false }) {
  const reasons = [];
  if (kid && matchesAges(event, [kid.age])) {
    reasons.push(`combina com ${kid.age === 0 ? "bebês" : `${kid.age} anos`}`);
  }
  if (distance != null && distance <= 5) reasons.push(`fica a ${formatKm(distance)} de vocês`);
  const interest = interestsMatched(event, kid).find((i) => !i.free);
  if (interest && kid?.name) reasons.push(`tem ${interest.label.toLowerCase()}, que ${kid.name} curte`);
  if (event.is_free) reasons.push("é gratuito");
  if (rainy && (event.setting === "indoor" || event.setting === "misto"))
    reasons.push("é em lugar coberto, bom para dia de chuva");
  if (rangesOverlap({ start: event.start_date, end: event.end_date }, weekendRange(today))) {
    reasons.push("acontece neste fim de semana");
  }
  if (isNewEvent(event, today)) reasons.push("acabou de entrar na agenda");
  if (!reasons.length) return "Encontramos esse rolê pesquisando a agenda infantil da cidade.";
  const text = joinPt(reasons.slice(0, 3));
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
