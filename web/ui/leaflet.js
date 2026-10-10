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

export function baseTiles(L) {
  return L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  });
}

/** Alfinete colorido com o ícone da categoria (o HTML vem só de dados internos). */
export function pinIcon(L, event, { active = false } = {}) {
  const cat = categoryOf(event.category);
  return L.divIcon({
    className: "",
    html: `<div class="map-pin tone-${cat.tone}${active ? " active" : ""}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[cat.icon]}</svg></div>`,
    iconSize: [44, 52],
    iconAnchor: [22, 50],
  });
}

export function youIcon(L) {
  return L.divIcon({ className: "", html: '<div class="you-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
}
