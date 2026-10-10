import { addDays, weekday } from "../lib/dates.js";
import { asset, h, icon } from "../lib/dom.js";
import { formatLongDay, formatMonthYear, formatRelativeDay, formatWeekdayAbbr, parseTimes } from "../lib/format.js";
import { store } from "../lib/store.js";
import { RAIN_THRESHOLD } from "../lib/weather.js";
import { appHeader, doodle, emptyState, eventRow, promoBanner, statusBadge, suggestionCard } from "../ui/components.js";

// Semana mostrada (segunda-feira) e dia selecionado; ficam entre uma renderização e outra.
let weekStart = null;
let selectedDay = null;

function mondayOf(day) {
  const wd = weekday(day); // 0 = domingo
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

function minutes(item, event) {
  const { start } = parseTimes(event.schedule);
  if (!start) return -1;
  const [, hh, mm = "0"] = start.match(/(\d+)h(\d+)?/);
  return Number(hh) * 60 + Number(mm);
}

export function renderAgenda(app) {
  selectedDay ??= app.today;
  weekStart ??= mondayOf(app.today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];

  const items = store.agenda
    .filter((item) => item.date >= weekStart && item.date <= weekEnd)
    .map((item) => ({ item, event: app.findEvent(item.event_id) ?? item.event }))
    .sort((a, b) => a.item.date.localeCompare(b.item.date) || minutes(a.item, a.event) - minutes(b.item, b.event));
  const daysWithItems = new Set(items.map(({ item }) => item.date));

  const changeWeek = (delta) => {
    weekStart = addDays(weekStart, delta * 7);
    selectedDay = delta > 0 ? weekStart : addDays(weekStart, 6);
    if (weekStart <= app.today && app.today <= addDays(weekStart, 6)) selectedDay = app.today;
    app.rerender();
  };

  const weekCard = h(
    "section",
    { class: "week-card card" },
    h(
      "div",
      { class: "week-head" },
      h("h2", {}, formatMonthYear(selectedDay)),
      h(
        "div",
        { class: "week-arrows" },
        h(
          "button",
          { type: "button", class: "icon-button", "aria-label": "Semana anterior", onclick: () => changeWeek(-1) },
          icon("back", { size: 22 }),
        ),
        h(
          "button",
          { type: "button", class: "icon-button", "aria-label": "Próxima semana", onclick: () => changeWeek(1) },
          icon("next", { size: 22 }),
        ),
      ),
    ),
    h(
      "div",
      { class: "week-days" },
      days.map((day) =>
        h(
          "button",
          {
            type: "button",
            class: `week-day ${day === selectedDay ? "selected" : ""} ${day === app.today ? "today" : ""}`,
            "aria-pressed": String(day === selectedDay),
            onclick: () => {
              selectedDay = day;
              app.rerender();
              document.getElementById(`dia-${day}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
          h("span", { class: "wd" }, formatWeekdayAbbr(day)),
          h("strong", {}, String(Number(day.slice(8)))),
          h("span", { class: `dot ${daysWithItems.has(day) ? "on" : ""}` }),
        ),
      ),
    ),
  );

  const weekendOnly = items.length > 0 && items.every(({ item }) => [0, 5, 6].includes(weekday(item.date)));
  const groups = days
    .filter((day) => daysWithItems.has(day))
    .map((day) => {
      const dayItems = items.filter(({ item }) => item.date === day);
      const rain = (app.forecast[day] ?? 0) >= RAIN_THRESHOLD;
      return h(
        "section",
        { class: `day-group ${day === selectedDay ? "selected" : ""}`, id: `dia-${day}` },
        h(
          "header",
          { class: "day-head" },
          h(
            "div",
            {},
            h("h3", {}, formatRelativeDay(day, app.today), doodle()),
            h(
              "p",
              {},
              day === app.today || day === addDays(app.today, 1)
                ? formatLongDay(day)
                : formatLongDay(day).split(", ")[1],
            ),
          ),
          rain ? h("span", { class: "rain-pill" }, icon("umbrella", { size: 16 }), "Chuva") : null,
          h("span", { class: "count-pill" }, dayItems.length === 1 ? "1 atividade" : `${dayItems.length} atividades`),
        ),
        dayItems.map(({ item, event }) =>
          eventRow(app, event, {
            side: h(
              "div",
              { class: "row-actions" },
              statusBadge(item),
              h(
                "button",
                {
                  type: "button",
                  class: "icon-button more",
                  "aria-label": "Opções",
                  onclick: () => app.sheets.agendaItem(item),
                },
                icon("more", { size: 22 }),
              ),
            ),
          }),
        ),
      );
    });

  return h(
    "div",
    { class: "page" },
    appHeader(app, {
      extra: h("a", { class: "chip-link", href: "#/inicio" }, icon("sparkles", { size: 16 }), "Organize mais momentos"),
    }),
    h(
      "section",
      { class: "hero" },
      h(
        "div",
        { class: "hero-text" },
        h("h1", {}, "Minha Agenda", doodle()),
        h("p", {}, "Mais tempo juntos, mais boas memórias."),
      ),
      asset("skyline-header", { className: "hero-illus", alt: "" }),
    ),
    weekCard,
    store.alerts.ai ? suggestionCard(app, app.suggestionForKid()) : null,
    h(
      "div",
      { class: "section-title with-button" },
      h("span", { class: "section-icon c-yellow" }, icon("star", { size: 30, className: "filled" })),
      h(
        "div",
        { class: "section-title-text" },
        h("h2", {}, weekendOnly ? "Seu fim de semana" : "Sua semana"),
        h("p", {}, `${items.length === 1 ? "1 atividade" : `${items.length} atividades`} · ${app.city?.name ?? ""}`),
      ),
      h("a", { class: "btn btn-yellow", href: "#/inicio" }, icon("plus", { size: 20 }), "Adicionar atividade"),
    ),
    groups.length
      ? groups
      : emptyState({
          title: "Nada marcado nesta semana",
          text: "Toque em “Adicionar à agenda” em qualquer rolê para ele aparecer aqui.",
          illustration: "family-big",
          action: h(
            "a",
            { class: "btn btn-yellow", href: "#/inicio" },
            "Descobrir rolês",
            icon("arrow-right", { size: 18 }),
          ),
        }),
    promoBanner(app),
  );
}
