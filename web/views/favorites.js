import { h, icon } from "../lib/dom.js";
import { formatShortDay } from "../lib/format.js";
import { store } from "../lib/store.js";
import { appHeader, emptyState, eventImage, heartButton } from "../ui/components.js";

let tab = "proximos";

function favoriteCard(app, { event, savedAt }) {
  const live = app.findEvent(event.id) ?? event;
  const ended = live.end_date < app.today;
  return h(
    "a",
    { class: `fav-card card ${ended ? "ended" : ""}`, href: `#/evento/${live.id}` },
    h("div", { class: "fav-media" }, eventImage(live), heartButton(app, live, { className: "on-photo" })),
    h(
      "div",
      { class: "fav-body" },
      h("strong", {}, live.title),
      h(
        "small",
        {},
        ended
          ? `Aconteceu em ${formatShortDay(live.start_date)}`
          : `${formatShortDay(live.start_date)} · ${live.venue}`,
      ),
      h("small", { class: "muted" }, `Salvo em ${formatShortDay(savedAt)}`),
    ),
  );
}

export function renderFavorites(app) {
  const all = Object.values(store.favorites)
    .map((f) => ({ event: f.event, savedAt: f.saved_at }))
    .sort((a, b) => a.event.start_date.localeCompare(b.event.start_date));
  const upcoming = all.filter(({ event }) => (app.findEvent(event.id) ?? event).end_date >= app.today);
  const past = all.filter(({ event }) => (app.findEvent(event.id) ?? event).end_date < app.today).reverse();
  const list = tab === "proximos" ? upcoming : past;

  const tabButton = (id, label, count) =>
    h(
      "button",
      {
        type: "button",
        class: tab === id ? "on" : "",
        "aria-pressed": String(tab === id),
        onclick: () => {
          tab = id;
          app.rerender();
        },
      },
      label,
      h("span", { class: "count" }, String(count)),
    );

  return h(
    "div",
    { class: "page page-favorites" },
    appHeader(app),
    h(
      "section",
      { class: "hero compact" },
      h(
        "div",
        { class: "hero-text" },
        h("h1", {}, "Meus favoritos ", h("span", { class: "c-red" }, "♥")),
        h("p", {}, "Os rolês que vocês salvaram para não esquecer."),
      ),
    ),
    h(
      "div",
      { class: "segmented" },
      tabButton("proximos", "Próximos", upcoming.length),
      tabButton("passados", "Já passaram", past.length),
    ),
    list.length
      ? h(
          "div",
          { class: "fav-grid" },
          list.map((entry) => favoriteCard(app, entry)),
        )
      : emptyState({
          title: tab === "proximos" ? "Nenhum favorito ainda" : "Nada por aqui ainda",
          text:
            tab === "proximos"
              ? "Toque no coração ♥ de um rolê para guardar ele aqui."
              : "Os favoritos que já aconteceram aparecem aqui, como lembrança.",
          illustration: "family-big",
          action:
            tab === "proximos"
              ? h("a", { class: "btn btn-yellow", href: "#/inicio" }, icon("search", { size: 18 }), "Descobrir rolês")
              : null,
        }),
  );
}
