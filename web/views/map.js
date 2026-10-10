import { h, icon } from "../lib/dom.js";
import { WHEN_OPTIONS } from "../lib/filters.js";
import { activeKid, save, store } from "../lib/store.js";
import { ageLabel, appHeader, emptyState, eventTile, kidAvatar, sectionTitle, seeAll } from "../ui/components.js";
import { baseTiles, loadLeaflet, pinIcon, youIcon } from "../ui/leaflet.js";
import { radiusLabel } from "../ui/sheets.js";

let selectedId = null;

function chip({ label, iconName, on, onclick, avatar = null, tone = "red" }) {
  return h(
    "button",
    { type: "button", class: `fchip ${on ? `on tone-${tone}` : ""}`, "aria-pressed": String(Boolean(on)), onclick },
    avatar ?? (iconName ? icon(iconName, { size: 20 }) : null),
    label,
  );
}

export function renderMap(app) {
  const kid = activeKid();
  const f = store.filters;
  const radius = store.radiusKm;
  const whenLabel = WHEN_OPTIONS.find((o) => o.id === f.when)?.label ?? "Quando";

  const base = app.filtered();
  const located = base
    .map((event) => ({ event, distance: app.distanceTo(event) }))
    .filter(({ event, distance }) => event.lat != null && (!radius || distance == null || distance <= radius))
    .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99));
  const withoutCoords = base.filter((e) => e.lat == null).length;

  const toggle = (key) => () => {
    f[key] = !f[key];
    if (key === "outdoor" && f.outdoor) f.indoor = false;
    save();
    app.rerender();
  };

  const filters = h(
    "div",
    { class: "fchips" },
    chip({ label: whenLabel, iconName: "calendar", on: true, onclick: () => app.sheets.when() }),
    chip({
      label: ageLabel(kid.age),
      avatar: kidAvatar(kid, { size: "xs" }),
      on: f.byAge,
      onclick: toggle("byAge"),
      tone: "soft",
    }),
    chip({
      label: radiusLabel(radius),
      iconName: "pin",
      on: Boolean(radius),
      onclick: () => app.sheets.radius(),
      tone: "soft-blue",
    }),
    chip({ label: "Grátis", iconName: "gift", on: f.free, onclick: toggle("free"), tone: "green" }),
    chip({ label: "Ao ar livre", iconName: "leaf", on: f.outdoor, onclick: toggle("outdoor"), tone: "green" }),
  );

  const mapBox = h("div", { class: "map-canvas", role: "region", "aria-label": "Mapa dos rolês" });
  const list = h(
    "div",
    { class: "tile-scroll" },
    located.slice(0, 20).map(({ event }) => eventTile(app, event, { highlight: event.id === selectedId })),
  );

  loadLeaflet()
    .then((L) => {
      if (!mapBox.isConnected) return;
      const center = app.position ?? app.cityCenter();
      const map = L.map(mapBox, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], 13);
      baseTiles(L).addTo(map);
      if (app.position?.source === "gps")
        L.marker([app.position.lat, app.position.lng], { icon: youIcon(L), interactive: false }).addTo(map);
      const bounds = [];
      for (const { event } of located) {
        const marker = L.marker([event.lat, event.lng], {
          icon: pinIcon(L, event, { active: event.id === selectedId }),
          title: event.title,
        }).addTo(map);
        marker.on("click", () => {
          selectedId = event.id;
          list.querySelectorAll(".tile").forEach((t) => t.classList.toggle("highlight", t.dataset.id === event.id));
          list
            .querySelector(`[data-id="${CSS.escape(event.id)}"]`)
            ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        });
        bounds.push([event.lat, event.lng]);
      }
      if (bounds.length > 1 && !selectedId) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      app.cleanup = () => map.remove();
    })
    .catch(() => mapBox.replaceChildren(h("p", { class: "map-error" }, "Não foi possível carregar o mapa.")));

  return h(
    "div",
    { class: "page page-map" },
    appHeader(app, { tagline: true }),
    h(
      "label",
      { class: "search" },
      icon("search", { size: 24 }),
      h("input", {
        type: "search",
        placeholder: "O que vocês querem explorar hoje?",
        onkeydown: (e) => {
          if (e.key === "Enter") {
            app.searchQuery = e.target.value;
            app.navigate("#/inicio");
          }
        },
      }),
      h("span", { class: "search-spark", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
    ),
    filters,
    h(
      "div",
      { class: "map-wrap" },
      mapBox,
      h(
        "div",
        { class: "map-buttons" },
        h(
          "button",
          { type: "button", class: "map-btn", "aria-label": "Usar minha localização", onclick: () => app.locate() },
          icon("locate", { size: 26 }),
        ),
        h(
          "button",
          { type: "button", class: "map-btn labeled", onclick: () => app.sheets.filters() },
          icon("sliders", { size: 24 }),
          h("span", {}, "Filtros"),
          f.free || f.outdoor || f.indoor || f.category ? h("i", { class: "dot-red" }) : null,
        ),
      ),
      h(
        "div",
        { class: "map-banner" },
        kidAvatar(kid, { size: "sm" }),
        h(
          "span",
          { class: "banner-text" },
          "Resultados personalizados para ",
          h("strong", {}, `${kid.name || "a criança"} • ${ageLabel(kid.age)}`),
        ),
        h(
          "button",
          { type: "button", class: "btn btn-soft-blue small", onclick: () => app.sheets.kids() },
          icon("pencil", { size: 16 }),
          "Alterar",
        ),
      ),
    ),
    h(
      "section",
      { class: "map-sheet" },
      h("span", { class: "grip", "aria-hidden": "true" }),
      sectionTitle("Pertinho de vocês", { iconName: "star", action: seeAll("#/inicio") }),
      located.length
        ? list
        : emptyState({
            title: "Nenhum rolê no mapa com esses filtros",
            text: radius
              ? "Tente aumentar o raio de busca ou mudar o período."
              : "Tente mudar o período ou os filtros.",
            illustration: "pref-radius",
          }),
      withoutCoords
        ? h(
            "p",
            { class: "muted small-note" },
            `${withoutCoords} ${withoutCoords === 1 ? "rolê ainda não tem" : "rolês ainda não têm"} localização no mapa — eles aparecem na aba Início.`,
          )
        : null,
    ),
  );
}
