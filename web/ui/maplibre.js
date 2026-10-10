import { categoryOf } from "../lib/categories.js";
import { ICONS } from "../lib/icons.js";
import { mapStyle } from "./map-style.js";

let loading = null;

/** Carrega o MapLibre (mapa) só quando uma tela precisa dele. */
export function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "./vendor/maplibre-gl.css";
    document.head.append(css);
    const script = document.createElement("script");
    script.src = "./vendor/maplibre-gl.js";
    script.onload = () => resolve(window.maplibregl);
    script.onerror = () => {
      loading = null;
      reject(new Error("Não foi possível carregar o mapa."));
    };
    document.head.append(script);
  });
  return loading;
}

// Zoom do MapLibre (ladrilhos de 512 px): 12 mostra uns 5 km de largura no celular; 14 mostra o quarteirão.
export const CITY_ZOOM = 12;
export const STREET_ZOOM = 14;

/** Mapa com o estilo do app, sem girar nem inclinar (só arrastar e aproximar). */
export function createMap(maplibregl, container, { center, zoom = CITY_ZOOM, interactive = true, hide = [] }) {
  const map = new maplibregl.Map({
    container,
    style: mapStyle({ hide }),
    center: [center.lng, center.lat],
    zoom,
    interactive,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: false,
  });
  if (interactive) map.touchZoomRotate.disableRotation();
  // Créditos no canto de cima (embaixo ficam o aviso e a lista), fechados num botão "i".
  map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-left");
  map.once("load", () =>
    container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"),
  );
  return map;
}

function svgIcon(name, size) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ICONS.pin}</svg>`;
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// O MapLibre move o elemento do marcador com "transform"; por isso o desenho fica num elemento de dentro.
function markerElement(className, html) {
  const outer = document.createElement("div");
  outer.className = className;
  outer.innerHTML = html;
  return outer;
}

/** Alfinete colorido com o ícone da categoria e, se houver mais de um evento no lugar, quantos são. */
export function pinMarker(maplibregl, event, { active = false, count = 1 } = {}) {
  const cat = categoryOf(event.category);
  const badge = count > 1 ? `<span class="pin-count">${Number(count)}</span>` : "";
  const element = markerElement(
    "marker-pin",
    `<div class="map-pin tone-${cat.tone}${active ? " active" : ""}">${svgIcon(cat.icon, 20)}${badge}</div>`,
  );
  return new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat([event.lng, event.lat]);
}

/** Marco da cidade (parque, bairro, museu) desenhado no mapa, como nas ilustrações. */
export function landmarkMarker(maplibregl, landmark) {
  const element = markerElement(
    "marker-landmark",
    `<div class="map-landmark tone-${escapeHtml(landmark.tone ?? "green")}"><span class="lm-icon">${svgIcon(landmark.icon, 22)}</span><b>${escapeHtml(landmark.name)}</b></div>`,
  );
  // O centro do ícone fica no ponto do marco.
  return new maplibregl.Marker({ element, anchor: "top", offset: [0, -18] }).setLngLat([landmark.lng, landmark.lat]);
}

export function youMarker(maplibregl, position) {
  const element = markerElement("marker-you", '<div class="you-dot"></div>');
  return new maplibregl.Marker({ element }).setLngLat([position.lng, position.lat]);
}
