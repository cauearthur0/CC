// Decide quais notificações cada celular recebe. Só lógica (sem rede), para dar para testar.
//
// - Lembretes: itens da agenda com "lembrete" ligado — de manhã os de hoje, à tardinha os de amanhã.
// - Novidades (de manhã, depois de cada atualização): rolês novos que servem para a idade das crianças.
//   Com "Atualizações por IA" desligado e "Eventos grátis" ligado, só os novos gratuitos.
// - Chuva (sexta à tardinha): se a previsão for de chuva no fim de semana e o alerta estiver ligado.

import { addDays, weekday } from "../../web/lib/dates.js";
import { matchesAges } from "../../web/lib/filters.js";
import { parseTimes } from "../../web/lib/format.js";

export const NEW_EVENT_DAYS = 4;

function names(kids) {
  const list = kids.map((k) => k.name?.trim()).filter(Boolean);
  if (!list.length) return "as crianças";
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`;
}

function reminder(item, mode) {
  const event = item.event ?? {};
  const { start } = parseTimes(event.schedule);
  const details = [start, event.venue].filter(Boolean).join(" · ");
  return {
    kind: "lembrete",
    ref: `${item.id}:${item.date}:${mode}`,
    title: mode === "manha" ? "Hoje tem rolê! 🎈" : "Amanhã tem rolê! 🎈",
    body: details ? `${event.title} — ${details}` : event.title,
    url: `./#/evento/${item.event_id}`,
    tag: `lembrete-${item.id}`,
  };
}

/** Rolês novos (vistos pela primeira vez nos últimos dias) que servem para as crianças da família. */
export function newEventsFor(events, { today, ages, freeOnly = false }) {
  const since = addDays(today, -(NEW_EVENT_DAYS - 1));
  return events.filter(
    (e) =>
      e.first_seen && e.first_seen >= since && e.end_date >= today && matchesAges(e, ages) && (!freeOnly || e.is_free),
  );
}

/**
 * Notificações de um celular.
 * family: dados compartilhados (families.data); prefs: alertas escolhidos no app; events: programação da cidade.
 */
export function planNotifications({ mode, today, family, prefs = {}, events = [], rainyWeekend = false }) {
  const plans = [];
  const kids = family?.kids?.value ?? [];
  const agenda = Object.values(family?.agenda ?? {});

  const target = mode === "manha" ? today : addDays(today, 1);
  for (const item of agenda) {
    if (item.reminder && item.date === target && item.status !== "cancelado") plans.push(reminder(item, mode));
  }

  if (mode === "manha" && (prefs.ai !== false || prefs.free)) {
    const fresh = newEventsFor(events, { today, ages: kids.map((k) => k.age), freeOnly: prefs.ai === false });
    if (fresh.length) {
      const latest = fresh
        .map((e) => e.first_seen)
        .sort()
        .at(-1);
      const free = fresh.filter((e) => e.is_free).length;
      const titles = fresh.slice(0, 2).map((e) => e.title);
      const more = fresh.length > 2 ? ` e mais ${fresh.length - 2}` : "";
      plans.push({
        kind: "novidades",
        ref: latest,
        title:
          fresh.length === 1 ? `1 rolê novo para ${names(kids)}` : `${fresh.length} rolês novos para ${names(kids)}`,
        body: `${titles.join(" · ")}${more}${prefs.free && free ? ` (${free === 1 ? "1 grátis" : `${free} grátis`})` : ""}`,
        url: "./#/inicio",
        tag: "novidades",
      });
    }
  }

  // Sexta à tardinha, se for chover no sábado ou no domingo.
  if (mode === "noite" && prefs.rain !== false && rainyWeekend && weekday(today) === 5) {
    plans.push({
      kind: "chuva",
      ref: addDays(today, 1),
      title: "Fim de semana com chuva ☔",
      body: "Separamos rolês em lugar coberto para vocês. Toque para ver.",
      url: "./#/inicio",
      tag: "chuva",
    });
  }
  return plans;
}
