import { categoryOf } from "../lib/categories.js";
import { ICONS } from "../lib/icons.js";

let loading = null;

/** Carrega o Leaflet (mapa) só quando uma tela precisa dele. */
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "./vendor/leaflet.css";
    document.head.append(css);
    const script = document.createElement("script");
    script.src = "./vendor/leaflet.js";
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Não foi possível carregar o mapa."));
    document.head.append(script);
  });
  return loading;
}

const CARTO = "https://{s}.basemaps.cartocdn.com/rastertiles";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
// Abaixo deste zoom o mapa fica só com o desenho da cidade e os marcos; os nomes das ruas aparecem de perto.
export const STREET_LABELS_ZOOM = 15;

/** Fundo do mapa: cidade sem nomes (mais limpo, como uma ilustração) + nomes das ruas ao aproximar. */
export function baseTiles(L) {
  return L.layerGroup([
    L.tileLayer(`${CARTO}/voyager_nolabels/{z}/{x}/{y}{r}.png`, {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: ATTRIBUTION,
      className: "tiles-base",
    }),
    L.tileLayer(`${CARTO}/voyager_only_labels/{z}/{x}/{y}{r}.png`, {
      subdomains: "abcd",
      maxZoom: 19,
      minZoom: STREET_LABELS_ZOOM,
      className: "tiles-labels",
    }),
  ]);
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Marco da cidade (parque, bairro, museu) desenhado no mapa, como nas ilustrações. */
export function landmarkIcon(L, landmark) {
  const svg = ICONS[landmark.icon] ?? ICONS.pin;
  return L.divIcon({
    className: "",
    html: `<div class="map-landmark tone-${escapeHtml(landmark.tone ?? "green")}"><span class="lm-icon"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg></span><b>${escapeHtml(landmark.name)}</b></div>`,
    iconSize: [130, 70],
    iconAnchor: [65, 22],
  });
}

/** Alfinete colorido com o ícone da categoria e, se houver mais de um evento no lugar, quantos são. */
export function pinIcon(L, event, { active = false, count = 1 } = {}) {
  const cat = categoryOf(event.category);
  const badge = count > 1 ? `<span class="pin-count">${Number(count)}</span>` : "";
  return L.divIcon({
    className: "",
    html: `<div class="map-pin tone-${cat.tone}${active ? " active" : ""}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[cat.icon]}</svg>${badge}</div>`,
    iconSize: [44, 52],
    iconAnchor: [22, 50],
  });
}

export function youIcon(L) {
  return L.divIcon({ className: "", html: '<div class="you-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
}
