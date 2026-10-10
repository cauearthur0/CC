import { h, icon } from "../lib/dom.js";
import { WHEN_OPTIONS } from "../lib/filters.js";
import { activeKid, save, store } from "../lib/store.js";
import { ageLabel, appHeader, emptyState, eventTile, kidAvatar, sectionTitle, seeAll } from "../ui/components.js";
import {
  CITY_ZOOM,
  STREET_ZOOM,
  createMap,
  landmarkMarker,
  loadMapLibre,
  pinMarker,
  youMarker,
} from "../ui/maplibre.js";
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

  loadMapLibre()
    .then((maplibregl) => {
      if (!mapBox.isConnected) return;
      const landmarks = app.city?.landmarks ?? [];
      const map = createMap(maplibregl, mapBox, {
        center: app.position ?? app.cityCenter(),
        hide: landmarks.map((l) => l.name),
      });
      app.cleanup = () => map.remove();
      // Marcos da cidade ficam atrás dos alfinetes e somem quando o mapa está longe (para não se amontoarem).
      for (const landmark of landmarks) landmarkMarker(maplibregl, landmark).addTo(map);
      const showLandmarks = () => mapBox.classList.toggle("far", map.getZoom() < CITY_ZOOM - 0.5);
      map.on("zoomend", showLandmarks);
      if (app.position?.source === "gps") youMarker(maplibregl, app.position).addTo(map);
      // Eventos no mesmo endereço viram um alfinete só, com o número de eventos.
      const places = new Map();
      for (const { event } of located) {
        const key = `${event.lat.toFixed(4)},${event.lng.toFixed(4)}`;
        if (!places.has(key)) places.set(key, []);
        places.get(key).push(event);
      }
      for (const group of places.values()) {
        const [first] = group;
        const marker = pinMarker(maplibregl, first, {
          active: group.some((e) => e.id === selectedId),
          count: group.length,
        }).addTo(map);
        const element = marker.getElement();
        element.title = group.map((e) => e.title).join(" · ");
        element.addEventListener("click", (e) => {
          e.stopPropagation();
          // Tocar de novo no mesmo lugar passa para o próximo evento dele.
          const index = group.findIndex((ev) => ev.id === selectedId);
          selectedId = group[(index + 1) % group.length].id;
          list.querySelectorAll(".tile").forEach((t) => t.classList.toggle("highlight", t.dataset.id === selectedId));
          list
            .querySelector(`[data-id="${CSS.escape(selectedId)}"]`)
            ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        });
      }
      // Abre perto dos rolês mais próximos (perto o bastante para ver os marcos da cidade).
      const nearest = located.slice(0, 6).map(({ event }) => [event.lng, event.lat]);
      if (nearest.length > 1 && !selectedId) {
        const bounds = nearest.reduce(
          (b, point) => b.extend(point),
          new maplibregl.LngLatBounds(nearest[0], nearest[0]),
        );
        map.fitBounds(bounds, { padding: 50, maxZoom: STREET_ZOOM - 1, duration: 0 });
        if (map.getZoom() < CITY_ZOOM) map.setZoom(CITY_ZOOM);
      } else if (nearest.length === 1) {
        map.jumpTo({ center: nearest[0], zoom: STREET_ZOOM - 1 });
      }
      showLandmarks();
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
        "p",
        { class: "map-note note-top", "aria-hidden": "true" },
        "Brincar também",
        h("br"),
        "é descobrir",
        h("br"),
        "a cidade ",
        h("span", { class: "c-red" }, "♥"),
      ),
      h(
        "p",
        { class: "map-note note-left", "aria-hidden": "true" },
        "Mais",
        h("br"),
        "infâncias",
        h("br"),
        "mais cidades",
        h("br"),
        "felizes ",
        h("span", { class: "c-red" }, "♥"),
      ),
      h(
        "p",
        { class: "map-note note-right", "aria-hidden": "true" },
        "Pequenos",
        h("br"),
        "rolês",
        h("br"),
        "grandes",
        h("br"),
        "memórias ",
        h("span", { class: "c-red" }, "♥"),
      ),
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
