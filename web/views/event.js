import { categoryOf } from "../lib/categories.js";
import { diffDays } from "../lib/dates.js";
import { asset, h, icon } from "../lib/dom.js";
import { matchesAges } from "../lib/filters.js";
import { formatAgeShort, formatShortDay, parseTimes } from "../lib/format.js";
import { directionsUrl, formatKm, mapsUrl } from "../lib/geo.js";
import { isNewEvent, reasonsFor } from "../lib/ranking.js";
import { activeKid, agendaFor, isFavorite, toggleFavorite } from "../lib/store.js";
import { RAIN_THRESHOLD } from "../lib/weather.js";
import { emptyState, eventImage, logo, tag } from "../ui/components.js";
import { STREET_ZOOM, createMap, loadMapLibre, pinMarker } from "../ui/maplibre.js";

async function share(app, event) {
  const text = `${event.title} — ${formatShortDay(event.start_date)}${event.schedule ? `, ${event.schedule}` : ""} · ${event.venue}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: event.title, text, url: event.url });
    } catch {
      // cancelado
    }
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${event.url}`)}`, "_blank", "noopener");
}

function whenText(event, app) {
  const { start, end } = parseTimes(event.schedule);
  const first = event.start_date > app.today ? event.start_date : app.today;
  const span =
    event.end_date !== event.start_date && diffDays(first, event.end_date) > 0
      ? `até ${formatShortDay(event.end_date)}`
      : null;
  return {
    day: event.start_date <= app.today && event.end_date >= app.today ? "Hoje" : formatShortDay(event.start_date),
    time: start ? (end ? `${start} às ${end}` : start) : (span ?? event.schedule ?? "Horário na fonte"),
    extra: start ? span : null,
  };
}

function miniMap(app, event) {
  const box = h("div", { class: "mini-map" });
  if (event.lat == null) {
    box.classList.add("no-coords");
    box.append(icon("pin", { size: 34, className: "c-red filled-soft" }));
    return box;
  }
  loadMapLibre()
    .then((maplibregl) => {
      if (!box.isConnected) return;
      const map = createMap(maplibregl, box, { center: event, zoom: STREET_ZOOM, interactive: false });
      pinMarker(maplibregl, event).addTo(map);
      app.cleanup = () => map.remove();
    })
    .catch(() => {
      box.classList.add("no-coords");
      box.replaceChildren(icon("pin", { size: 34, className: "c-red filled-soft" }));
    });
  return box;
}

export function renderEvent(app, id) {
  const event = app.findEvent(id);
  const back = h(
    "button",
    {
      type: "button",
      class: "round-button",
      "aria-label": "Voltar",
      onclick: () => (history.length > 1 ? history.back() : app.navigate("#/inicio")),
    },
    icon("back", { size: 24 }),
  );
  if (!event) {
    return h(
      "div",
      { class: "page" },
      h("header", { class: "detail-top" }, back, logo(), h("span")),
      emptyState({
        title: "Rolê não encontrado",
        text: "Ele pode já ter acontecido ou saído da programação.",
        action: h("a", { class: "btn btn-yellow", href: "#/inicio" }, "Ver outros rolês"),
      }),
    );
  }

  const kid = activeKid();
  const cat = categoryOf(event.category);
  const distance = app.distanceTo(event);
  const when = whenText(event, app);
  const rainy = Object.entries(app.forecast).some(
    ([day, p]) => day >= event.start_date && day <= event.end_date && day >= app.today && p >= RAIN_THRESHOLD,
  );
  const inAgenda = agendaFor(event.id).length > 0;
  const ended = event.end_date < app.today;

  const heart = h(
    "button",
    {
      type: "button",
      class: `round-button heart-big ${isFavorite(event.id) ? "on" : ""}`,
      "aria-label": "Salvar nos favoritos",
    },
    icon("heart", { size: 24 }),
  );
  const saveButton = h(
    "button",
    { type: "button", class: `action-tile ${isFavorite(event.id) ? "on" : ""}` },
    icon("heart", { size: 28 }),
    h("span", {}, "Salvar"),
  );
  const toggle = () => {
    const on = toggleFavorite(event, app.today);
    heart.classList.toggle("on", on);
    saveButton.classList.toggle("on", on);
    app.toast(on ? "Salvo nos favoritos ❤" : "Removido dos favoritos");
  };
  heart.addEventListener("click", toggle);
  saveButton.addEventListener("click", toggle);

  const highlight = event.is_free
    ? h("span", { class: "badge-pill yellow" }, icon("gift", { size: 18 }), "Grátis")
    : isNewEvent(event, app.today)
      ? h("span", { class: "badge-pill yellow" }, icon("sparkles", { size: 18 }), "Novo")
      : null;

  // Subtítulo = primeira frase; o parágrafo de descrição mostra o restante (se houver).
  const [, firstSentence = "", rest = ""] = (event.description ?? "").match(/^(.+?[.!?])(?:\s+(.*))?$/s) ?? [
    null,
    event.description ?? "",
    "",
  ];

  const placeLine = [
    event.neighborhood ? `${event.neighborhood} – ${app.city?.name ?? ""}` : app.city?.name,
    distance != null ? formatKm(distance) : null,
  ].filter(Boolean);

  return h(
    "div",
    { class: "page page-detail" },
    h(
      "header",
      { class: "detail-top" },
      back,
      logo(),
      h(
        "div",
        { class: "detail-top-actions" },
        heart,
        h(
          "button",
          { type: "button", class: "round-button", "aria-label": "Compartilhar", onclick: () => share(app, event) },
          icon("share", { size: 22 }),
        ),
      ),
    ),
    h(
      "div",
      { class: "detail-hero" },
      eventImage(event),
      event.image
        ? [
            h(
              "p",
              { class: "hero-note left" },
              icon("star", { size: 26, className: "filled-yellow" }),
              h("span", {}, "Sonhe", h("br"), "brinque", h("br"), "explore", h("br"), "juntos"),
            ),
            h(
              "p",
              { class: "hero-note right" },
              "Pequenas",
              h("br"),
              "experiências",
              h("br"),
              "grandes",
              h("br"),
              "memórias ♡",
            ),
          ]
        : null,
    ),
    h(
      "section",
      { class: "detail-head" },
      h("span", { class: `cat-pill tone-${cat.tone}` }, icon(cat.icon, { size: 18 }), cat.label),
      h("div", { class: "detail-title-row" }, h("h1", {}, event.title), highlight),
      firstSentence ? h("p", { class: "detail-sub" }, firstSentence) : null,
    ),
    h(
      "section",
      { class: "info-row" },
      h(
        "div",
        { class: "info" },
        icon("calendar", { size: 30, className: "c-red" }),
        h(
          "div",
          {},
          h("strong", {}, when.day),
          h("span", {}, when.time),
          when.extra ? h("span", {}, when.extra) : null,
        ),
      ),
      h(
        "div",
        { class: "info" },
        icon("users", { size: 30, className: "c-red filled-soft" }),
        h("div", {}, h("span", {}, "Ideal para"), h("strong", {}, formatAgeShort(event))),
      ),
      h(
        "div",
        { class: "info" },
        icon("pin", { size: 30, className: "c-red filled-soft" }),
        h(
          "div",
          {},
          h("strong", {}, event.venue),
          placeLine.map((t) => h("span", {}, t)),
        ),
      ),
    ),
    h(
      "div",
      { class: "tags big" },
      tag(formatAgeShort(event), "green", "users"),
      event.setting === "indoor"
        ? tag("Indoor", "purple", "home")
        : event.setting === "outdoor"
          ? tag("Ao ar livre", "purple", "trees")
          : event.setting === "misto"
            ? tag("Coberto e ao ar livre", "purple", "home")
            : null,
      event.is_free ? tag("Gratuito", "blue", "gift") : event.price ? tag(event.price, "blue", "ticket") : null,
      kid && matchesAges(event, [kid.age]) ? tag("Ideal para famílias", "pink", "heart") : null,
    ),
    h(
      "section",
      { class: "detail-desc" },
      h("span", { class: "rays", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h(
        "p",
        {},
        rest || (event.schedule ? `Quando: ${event.schedule}.` : "Confira todos os detalhes na página do evento."),
      ),
      asset("sticker-infancia", { className: "desc-sticker", alt: "" }),
    ),
    h(
      "section",
      { class: "why-card" },
      asset("robot-wink", { className: "why-robot", alt: "" }),
      h(
        "div",
        {},
        h("h2", {}, "Por que indicamos?"),
        h("p", {}, reasonsFor(event, { kid, today: app.today, distance, rainy })),
      ),
      h(
        "a",
        { class: "btn btn-soft-blue", href: event.url, target: "_blank", rel: "noopener noreferrer" },
        "Saiba mais",
        icon("next", { size: 18 }),
      ),
    ),
    h(
      "div",
      { class: "detail-grid" },
      h(
        "section",
        { class: "card place-card" },
        h(
          "header",
          {},
          h("h2", {}, icon("pin", { size: 22, className: "c-red filled-soft" }), "Local do evento"),
          h(
            "a",
            { href: mapsUrl(event), target: "_blank", rel: "noopener noreferrer" },
            "Abrir no mapa",
            icon("arrow-right", { size: 18 }),
          ),
        ),
        h("strong", {}, event.venue),
        event.address ? h("p", {}, event.address) : null,
        h(
          "div",
          { class: "mini-map-wrap" },
          miniMap(app, event),
          distance != null
            ? h(
                "span",
                { class: "walk-chip" },
                icon("walk", { size: 20 }),
                h(
                  "span",
                  {},
                  h("strong", {}, formatKm(distance)),
                  h("br"),
                  app.position?.source === "gps" ? "de você" : "do centro",
                ),
              )
            : null,
        ),
      ),
      h(
        "section",
        { class: "card org-card" },
        h("h2", {}, icon("users", { size: 22, className: "c-red filled-soft" }), "Realização"),
        h(
          "div",
          { class: "org" },
          h("span", { class: `org-avatar tone-${cat.tone}` }, icon(cat.icon, { size: 30 })),
          h(
            "div",
            {},
            h("strong", {}, event.organizer ?? event.venue),
            h("small", {}, event.organizer ? `No ${event.venue}` : `Programação de ${app.city?.name ?? "da cidade"}`),
          ),
        ),
        h(
          "a",
          {
            class: "btn btn-soft-blue",
            href: `#/inicio?local=${encodeURIComponent(event.venue)}`,
            onclick: (e) => {
              e.preventDefault();
              app.searchQuery = event.venue;
              app.navigate("#/inicio");
            },
          },
          "Ver mais eventos",
          icon("next", { size: 18 }),
        ),
        h(
          "a",
          { class: "source-row", href: event.url, target: "_blank", rel: "noopener noreferrer" },
          icon("external-link", { size: 18, className: "c-blue" }),
          h("span", {}, "Fonte: ", h("strong", {}, event.source || "site do evento")),
          icon("next", { size: 18 }),
        ),
      ),
    ),
    h(
      "section",
      { class: "detail-actions" },
      saveButton,
      h(
        "a",
        { class: "action-tile", href: directionsUrl(event), target: "_blank", rel: "noopener noreferrer" },
        icon("navigation", { size: 28 }),
        h("span", {}, "Traçar rota"),
      ),
      h(
        "button",
        { type: "button", class: "action-tile", onclick: () => share(app, event) },
        icon("share", { size: 28 }),
        h("span", {}, "Compartilhar"),
      ),
      ended
        ? h("span", { class: "btn btn-yellow big disabled" }, "Esse rolê já passou")
        : h(
            "button",
            { type: "button", class: "btn btn-yellow big", onclick: () => app.sheets.addToAgenda(event) },
            icon(inAgenda ? "calendar-check" : "calendar-plus", { size: 26 }),
            inAgenda ? "Na sua agenda ✓" : "Adicionar à agenda",
          ),
    ),
    h(
      "footer",
      { class: "detail-footer" },
      asset("footer-family", { className: "ff-family", alt: "" }),
      h("p", { class: "ff-title" }, "Mais rolês,", h("br"), "mais memórias ", h("span", { class: "c-red" }, "♥")),
      asset("note-familias", { className: "ff-note", alt: "Famílias que vivem a cidade juntas, crescem juntas." }),
      asset("skyline-footer", { className: "ff-skyline", alt: "" }),
    ),
  );
}
