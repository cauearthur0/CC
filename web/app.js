import { todayIn } from "./lib/dates.js";
import { h, toast } from "./lib/dom.js";
import { filterEvents, matchesAges, rangeFor } from "./lib/filters.js";
import { currentPosition, distanceKm } from "./lib/geo.js";
import { fitsBudget } from "./lib/price.js";
import { cloudConfigured, startCloud } from "./lib/cloud.js";
import { BUDGET_OPTIONS, activeKid, kidAges, save, store } from "./lib/store.js";
import { applySponsored, pickHighlight } from "./lib/sponsored.js";
import { trackDailyOpen } from "./lib/stats.js";
import { rainForecast } from "./lib/weather.js";
import { tabBar } from "./ui/components.js";
import { createSheets } from "./ui/sheets.js";
import { renderAdvertise } from "./views/advertise.js";
import { renderAgenda } from "./views/agenda.js";
import { renderEvent } from "./views/event.js";
import { renderFavorites } from "./views/favorites.js";
import { renderHome } from "./views/home.js";
import { renderMap } from "./views/map.js";
import { renderOnboarding } from "./views/onboarding.js";
import { renderPrivacy } from "./views/privacy.js";
import { renderProfile } from "./views/profile.js";

const VIEWS = {
  inicio: renderHome,
  mapa: renderMap,
  agenda: renderAgenda,
  favoritos: renderFavorites,
  perfil: renderProfile,
  evento: renderEvent,
  "boas-vindas": renderOnboarding,
  anuncie: renderAdvertise,
  privacidade: renderPrivacy,
};
const TAB_OF = { evento: null, "boas-vindas": null, anuncie: "perfil", privacidade: "perfil" };

const root = document.getElementById("app");

export const app = {
  cities: [],
  city: null,
  events: [],
  highlights: [], // destaques patrocinados ativos
  suggestions: [],
  generatedAt: null,
  loadError: null,
  loadedAt: 0,
  today: null,
  position: null, // { lat, lng, source: "gps" | "cidade" }
  forecast: {},
  route: { name: "inicio", param: null },
  cleanup: null,
  toast,

  navigate(hash) {
    if (location.hash === hash) this.rerender();
    else location.hash = hash;
  },

  rerender({ keepScroll = true } = {}) {
    render({ keepScroll });
  },

  async setCity(slug) {
    store.city = slug;
    save();
    this.city = this.cities.find((c) => c.slug === slug) ?? this.cities[0];
    if (!store.useGps) this.position = this.cityCenter();
    await loadEvents();
    this.forecast = await rainForecast(this.city);
    this.rerender();
  },

  cityCenter() {
    return this.city?.lat != null ? { lat: this.city.lat, lng: this.city.lng, source: "cidade" } : null;
  },

  async locate() {
    try {
      const pos = await currentPosition();
      this.position = { ...pos, source: "gps" };
      store.useGps = true;
      save();
      toast("Usando sua localização 📍");
      this.rerender();
      return this.position;
    } catch (error) {
      toast(error.message);
      return null;
    }
  },

  distanceTo(event) {
    if (event?.lat == null || !this.position) return null;
    return distanceKm(this.position, event);
  },

  findEvent(id) {
    return (
      this.events.find((e) => e.id === id) ??
      store.favorites[id]?.event ??
      store.agenda.find((item) => item.event_id === id)?.event ??
      null
    );
  },

  /** Eventos que ainda não terminaram e cabem no orçamento escolhido. */
  upcoming() {
    const max = BUDGET_OPTIONS.find((b) => b.id === store.budget)?.max ?? Infinity;
    return this.events.filter((e) => e.end_date >= this.today && fitsBudget(e, max));
  },

  /** Aplica os filtros da tela (período, idade, grátis, ambiente, categoria). */
  filtered({ when = store.filters.when, ignore = [] } = {}) {
    const f = store.filters;
    const range = rangeFor(when, this.today);
    let list = filterEvents(this.upcoming(), {
      range,
      ages: f.byAge && !ignore.includes("age") ? [activeKid().age] : [],
      freeOnly: f.free && !ignore.includes("free"),
      category: ignore.includes("category") ? null : f.category,
    });
    if (f.outdoor && !ignore.includes("setting"))
      list = list.filter((e) => e.setting === "outdoor" || e.setting === "misto" || e.category === "ao-ar-livre");
    if (f.indoor && !ignore.includes("setting"))
      list = list.filter((e) => e.setting === "indoor" || e.setting === "misto");
    return list;
  },

  /** Eventos adequados a alguma criança da família (para sugestões e destaques). */
  forKids(list) {
    return list.filter((e) => matchesAges(e, kidAges()));
  },

  /** Sugestão da IA para a idade da criança, com eventos que ainda existem. */
  /** Destaque patrocinado do dia para a criança (ou null). */
  highlightFor(kid = activeKid()) {
    return pickHighlight(this.highlights, { ages: store.filters.byAge ? [kid.age] : [], today: this.today });
  },

  suggestionForKid(kid = activeKid()) {
    const ids = new Set(this.events.filter((e) => e.end_date >= this.today).map((e) => e.id));
    return this.suggestions.find(
      (s) => kid.age >= s.age_min && kid.age <= s.age_max && s.event_ids.some((id) => ids.has(id)),
    );
  },
};
app.sheets = createSheets(app);

async function loadCities() {
  const response = await fetch("./data/cities.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Não foi possível carregar a lista de cidades.");
  const data = await response.json();
  app.cities = data.cities;
  if (!app.cities.some((c) => c.slug === store.city)) store.city = data.default ?? app.cities[0]?.slug;
  app.city = app.cities.find((c) => c.slug === store.city) ?? app.cities[0];
}

/** Destaques patrocinados (web/data/destaques.json); sem eles, o app segue normal. */
async function loadSponsored() {
  try {
    const response = await fetch("./data/destaques.json", { cache: "no-cache" });
    return response.ok ? ((await response.json()).destaques ?? []) : [];
  } catch {
    return [];
  }
}

async function loadEvents() {
  app.events = [];
  app.highlights = [];
  app.suggestions = [];
  app.generatedAt = null;
  app.loadError = null;
  if (!app.city) return;
  try {
    const response = await fetch(`./data/events/${app.city.slug}.json`, { cache: "no-cache" });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const [data, sponsored] = await Promise.all([response.json(), loadSponsored()]);
    const today = todayIn(app.city.timezone);
    const merged = applySponsored(data.events ?? [], sponsored, { city: app.city.slug, today });
    app.events = merged.events;
    app.highlights = merged.highlights;
    app.suggestions = data.suggestions ?? [];
    app.generatedAt = data.generated_at ?? null;
    app.loadedAt = Date.now();
  } catch {
    app.loadError = "Não foi possível carregar a programação. Verifique a internet e tente de novo.";
  }
}

function parseRoute() {
  const [name, param] = location.hash.replace(/^#\/?/, "").split("/");
  return { name: VIEWS[name] ? name : "inicio", param: param ? decodeURIComponent(param) : null };
}

function render({ keepScroll = false } = {}) {
  const scroll = window.scrollY;
  app.today = todayIn(app.city?.timezone ?? "America/Sao_Paulo");
  app.route = parseRoute();
  // A política de privacidade e a página de anúncios abrem mesmo antes das boas-vindas (links externos).
  if (!store.onboarded && !["boas-vindas", "privacidade", "anuncie"].includes(app.route.name)) {
    location.replace("#/boas-vindas");
    return;
  }
  app.cleanup?.();
  app.cleanup = null;
  const view = VIEWS[app.route.name](app, app.route.param);
  const tab = app.route.name in TAB_OF ? TAB_OF[app.route.name] : app.route.name;
  document.body.dataset.view = app.route.name;
  root.replaceChildren(
    ...[h("main", { class: `view view-${app.route.name}` }, view), tab ? tabBar(tab) : null].filter(Boolean),
  );
  window.scrollTo(0, keepScroll ? scroll : 0);
}

async function init() {
  try {
    await loadCities();
  } catch (error) {
    root.replaceChildren(h("p", { class: "fatal" }, error.message));
    return;
  }
  app.today = todayIn(app.city.timezone);
  app.position = app.cityCenter();
  await loadEvents();
  render();
  trackDailyOpen(app.today);

  window.addEventListener("hashchange", () => {
    // Um painel aberto não deve continuar por cima da nova página.
    document.querySelectorAll("dialog.sheet").forEach((d) => d.remove());
    render();
  });

  // Localização e clima chegam depois, sem atrasar a primeira tela.
  if (store.useGps) {
    currentPosition()
      .then((pos) => {
        app.position = { ...pos, source: "gps" };
        app.rerender();
      })
      .catch(() => {});
  }
  rainForecast(app.city).then((forecast) => {
    app.forecast = forecast;
    if (Object.keys(forecast).length) app.rerender();
  });

  // Ao voltar para o app depois de um tempo, busca a programação mais recente.
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && Date.now() - app.loadedAt > 30 * 60 * 1000) {
      await loadEvents();
      app.rerender();
    }
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});

  // Família conectada: junta a agenda e os favoritos com os outros celulares da família.
  if (cloudConfigured) startCloud(app);
}

init();
