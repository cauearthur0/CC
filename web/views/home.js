import { CATEGORIES, categoryOf } from "../lib/categories.js";
import { asset, h, icon } from "../lib/dom.js";
import { WHEN_OPTIONS, groupEvents, rangeFor } from "../lib/filters.js";
import { formatLongDay, formatRelativeDay } from "../lib/format.js";
import { eventScore, isNewEvent } from "../lib/ranking.js";
import { slugifyText } from "../lib/text.js";
import { activeKid, agendaFor, save, store } from "../lib/store.js";
import { rainyDayIn } from "../lib/weather.js";
import {
  appHeader,
  doodle,
  emptyState,
  eventRow,
  eventTile,
  pageFooter,
  promoBanner,
  sponsoredCard,
  sectionTitle,
  seeAll,
  suggestionCard,
} from "../ui/components.js";

function addButton(app, event) {
  const inAgenda = agendaFor(event.id).length > 0;
  return h(
    "button",
    {
      type: "button",
      class: `add-btn ${inAgenda ? "done" : ""}`,
      "aria-label": inAgenda ? "Já está na agenda" : "Adicionar à agenda",
      onclick: () => (inAgenda ? app.navigate("#/agenda") : app.sheets.addToAgenda(event)),
    },
    icon(inAgenda ? "calendar-check" : "calendar-plus", { size: 22 }),
  );
}

function tiles(app, list) {
  return h(
    "div",
    { class: "tile-scroll" },
    list.map((e) => eventTile(app, e)),
  );
}

function matchesSearch(event, query) {
  const haystack = slugifyText(
    [
      event.title,
      event.venue,
      event.neighborhood,
      event.description,
      event.organizer,
      categoryOf(event.category).label,
    ].join(" "),
  );
  return slugifyText(query)
    .split(" ")
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function renderHome(app) {
  const kid = activeKid();
  const f = store.filters;
  const query = app.searchQuery ?? "";
  const range = rangeFor(f.when, app.today);
  const base = app.filtered();
  const list = query
    ? app.filtered({ when: "30-dias", ignore: ["category"] }).filter((e) => matchesSearch(e, query))
    : base;
  const score = (e) => eventScore(e, { kid, today: app.today, distance: app.distanceTo(e) });
  const ranked = [...list].sort((a, b) => score(b) - score(a));

  const setFilter = (patch) => {
    Object.assign(f, patch);
    save();
    app.rerender();
  };

  const searchInput = h("input", {
    type: "search",
    value: query,
    placeholder: "O que vocês querem explorar hoje?",
    "aria-label": "Buscar rolês",
    onchange: (e) => {
      app.searchQuery = e.target.value.trim();
      app.rerender();
    },
  });

  const whenChips = h(
    "div",
    { class: "fchips" },
    WHEN_OPTIONS.map((o) =>
      h(
        "button",
        {
          type: "button",
          class: `fchip ${f.when === o.id ? "on tone-red" : ""}`,
          onclick: () => setFilter({ when: o.id }),
        },
        o.id === "hoje" ? icon("calendar", { size: 20 }) : null,
        o.label,
      ),
    ),
  );

  const presentCategories = new Set(app.filtered({ ignore: ["category"] }).map((e) => e.category));
  const quickChips = h(
    "div",
    { class: "fchips small" },
    h(
      "button",
      { type: "button", class: `fchip ${f.free ? "on tone-green" : ""}`, onclick: () => setFilter({ free: !f.free }) },
      icon("gift", { size: 18 }),
      "Grátis",
    ),
    h(
      "button",
      {
        type: "button",
        class: `fchip ${f.outdoor ? "on tone-green" : ""}`,
        onclick: () => setFilter({ outdoor: !f.outdoor, indoor: false }),
      },
      icon("leaf", { size: 18 }),
      "Ao ar livre",
    ),
    h(
      "button",
      {
        type: "button",
        class: `fchip ${f.indoor ? "on tone-purple" : ""}`,
        onclick: () => setFilter({ indoor: !f.indoor, outdoor: false }),
      },
      icon("home", { size: 18 }),
      "Lugar coberto",
    ),
    CATEGORIES.filter((c) => presentCategories.has(c.id) || f.category === c.id).map((c) =>
      h(
        "button",
        {
          type: "button",
          class: `fchip ${f.category === c.id ? `on tone-${c.tone}` : ""}`,
          onclick: () => setFilter({ category: f.category === c.id ? null : c.id }),
        },
        icon(c.icon, { size: 18 }),
        c.label,
      ),
    ),
  );

  const rainyDay = store.alerts.rain ? rainyDayIn(app.forecast, range) : null;
  const rainBanner =
    rainyDay && !f.indoor
      ? h(
          "section",
          { class: "rain-banner" },
          icon("umbrella", { size: 30 }),
          h(
            "p",
            {},
            h("strong", {}, `Previsão de chuva ${formatRelativeDay(rainyDay, app.today).toLowerCase()}! `),
            "Que tal um rolê em lugar coberto?",
          ),
          h(
            "button",
            {
              type: "button",
              class: "btn btn-white small",
              onclick: () => setFilter({ indoor: true, outdoor: false }),
            },
            "Ver opções",
          ),
        )
      : null;

  const newOnes = ranked.filter((e) => isNewEvent(e, app.today));
  const near = list
    .map((e) => ({ e, d: app.distanceTo(e) }))
    .filter(({ d }) => d != null && (!store.radiusKm || d <= store.radiusKm))
    .sort((a, b) => a.d - b.d)
    .map(({ e }) => e);
  const free = ranked.filter((e) => e.is_free);
  const { days, ongoing } = groupEvents(list, query ? rangeFor("30-dias", app.today) : range);

  const dayGroups = days.map(({ day, events }) =>
    h(
      "section",
      { class: "day-group" },
      h(
        "header",
        { class: "day-head" },
        h(
          "div",
          {},
          h("h3", {}, formatRelativeDay(day, app.today), doodle()),
          h("p", {}, formatLongDay(day).split(", ")[1]),
        ),
        h("span", { class: "count-pill" }, events.length === 1 ? "1 rolê" : `${events.length} rolês`),
      ),
      events.map((e) => eventRow(app, e, { side: addButton(app, e) })),
    ),
  );

  const whenLabel = WHEN_OPTIONS.find((o) => o.id === f.when)?.label.toLowerCase();
  const nothing = !list.length;

  return h(
    "div",
    { class: "page page-home" },
    appHeader(app),
    h(
      "section",
      { class: "hero" },
      h(
        "div",
        { class: "hero-text" },
        store.parent.name ? h("span", { class: "eyebrow" }, `Oi, ${store.parent.name}! 👋`) : null,
        h(
          "h1",
          {},
          kid.name ? `Rolês para ${kid.gender === "m" ? "o" : "a"} ${kid.name}` : "Rolês em família",
          doodle(),
        ),
        h("p", {}, "Mais tempo juntos, mais boas memórias."),
      ),
      asset("skyline-header", { className: "hero-illus", alt: "" }),
    ),
    h(
      "label",
      { class: "search" },
      icon("search", { size: 24 }),
      searchInput,
      query
        ? h(
            "button",
            {
              type: "button",
              class: "icon-button",
              "aria-label": "Limpar busca",
              onclick: () => {
                app.searchQuery = "";
                app.rerender();
              },
            },
            icon("x", { size: 20 }),
          )
        : h("span", { class: "search-spark", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
    ),
    query ? null : whenChips,
    quickChips,
    rainBanner,
    !query && store.alerts.ai ? suggestionCard(app, app.suggestionForKid(kid)) : null,
    !query ? sponsoredCard(app, app.highlightFor(kid)) : null,
    app.loadError
      ? emptyState({ title: "Sem conexão", text: app.loadError, illustration: "sticker-infancia" })
      : !app.events.length
        ? emptyState({
            title: `Ainda não há rolês para ${app.city?.name ?? "essa cidade"}`,
            text: "A busca automática ainda não rodou para esta cidade. Volte mais tarde!",
          })
        : null,
    query
      ? [
          sectionTitle(`Resultados para “${query}”`, {
            iconName: "search",
            iconClass: "c-blue",
            subtitle: `${list.length} ${list.length === 1 ? "rolê" : "rolês"} nos próximos 30 dias`,
          }),
          list.length
            ? ranked.map((e) => eventRow(app, e, { side: addButton(app, e) }))
            : emptyState({
                title: "Nada encontrado",
                text: "Tente outra palavra, como “teatro”, “oficina” ou o nome de um bairro.",
              }),
        ]
      : [
          store.alerts.ai && newOnes.length
            ? [
                sectionTitle("Novidades da semana", {
                  iconName: "sparkles",
                  iconClass: "c-purple",
                  subtitle: "Acabaram de entrar na agenda",
                }),
                tiles(app, newOnes.slice(0, 8)),
              ]
            : null,
          near.length
            ? [
                sectionTitle("Pertinho de vocês", { iconName: "star", action: seeAll("#/mapa", "Ver no mapa") }),
                tiles(app, near.slice(0, 8)),
              ]
            : null,
          store.alerts.free && free.length && !f.free
            ? [
                sectionTitle("Rolês grátis", {
                  iconName: "gift",
                  iconClass: "c-red",
                  subtitle: `Sem gastar nada em ${app.city?.name ?? "sua cidade"}`,
                }),
                tiles(app, free.slice(0, 8)),
              ]
            : null,
          app.events.length
            ? sectionTitle(`Agenda de rolês`, {
                iconName: "calendar",
                iconClass: "c-red",
                subtitle: `${list.length} ${list.length === 1 ? "rolê" : "rolês"} · ${whenLabel} · ${kid.name || "criança"} (${kid.age} ${kid.age === 1 ? "ano" : "anos"})`,
              })
            : null,
          app.events.length && nothing
            ? emptyState({
                title: "Nada encontrado com esses filtros",
                text: "Tente olhar um período maior ou tirar algum filtro.",
                action:
                  f.when !== "30-dias"
                    ? h(
                        "button",
                        { type: "button", class: "btn btn-yellow", onclick: () => setFilter({ when: "30-dias" }) },
                        "Ver próximos 30 dias",
                      )
                    : null,
              })
            : null,
          dayGroups,
          ongoing.length
            ? [
                sectionTitle("Em cartaz", {
                  iconName: "landmark",
                  iconClass: "c-purple",
                  subtitle: "Exposições e temporadas para visitar em vários dias",
                }),
                ongoing.map((e) => eventRow(app, e, { side: addButton(app, e) })),
              ]
            : null,
        ],
    promoBanner(app),
    pageFooter(app),
  );
}
