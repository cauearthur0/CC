import { CATEGORIES, categoryOf } from "./lib/categories.js";
import { todayIn } from "./lib/dates.js";
import { DEFAULT_WHEN, WHEN_OPTIONS, filterEvents, groupEvents, isNew, rangeFor } from "./lib/filters.js";
import { formatAgeRange, formatAges, formatDateSpan, formatDayHeading, formatShortDate } from "./lib/format.js";
import { buildIcs } from "./lib/ics.js";

const STORAGE_KEY = "programinha:prefs:v1";
const MIN_AGE = 0;
const MAX_AGE = 14;
const DEFAULT_PREFS = { city: null, ages: [6], when: DEFAULT_WHEN, freeOnly: false, category: null, onboarded: false };

const $ = (selector) => document.querySelector(selector);

const state = {
  cities: [],
  events: [],
  generatedAt: null,
  loadedAt: 0,
  loadError: null,
  prefs: loadPrefs(),
  draftAges: [],
};

// ---------- Preferências (ficam só neste aparelho) ----------

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...DEFAULT_PREFS, ...saved };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.prefs));
  } catch {
    // Navegação privada pode bloquear o armazenamento; o app segue funcionando.
  }
}

function currentCity() {
  return state.cities.find((c) => c.slug === state.prefs.city) ?? state.cities[0];
}

// ---------- Dados ----------

async function loadCities() {
  const response = await fetch("./data/cities.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Não foi possível carregar a lista de cidades.");
  const data = await response.json();
  state.cities = data.cities;
  if (!state.cities.some((c) => c.slug === state.prefs.city)) state.prefs.city = data.default ?? data.cities[0]?.slug;
}

async function loadEvents() {
  state.events = [];
  state.generatedAt = null;
  state.loadError = null;
  const city = currentCity();
  if (!city) return;
  try {
    const response = await fetch(`./data/events/${city.slug}.json`, { cache: "no-cache" });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.events = data.events ?? [];
    state.generatedAt = data.generated_at ?? null;
    state.loadedAt = Date.now();
  } catch {
    state.loadError = "Não foi possível carregar a programação. Verifique a internet e tente de novo.";
  }
}

// ---------- Renderização ----------

function renderProfile() {
  const city = currentCity();
  $("#profile-label").textContent = city ? `${city.name} · ${formatAges(state.prefs.ages)}` : "Escolher cidade e idade";
}

function renderFilters() {
  const when = $("#when-filter");
  when.replaceChildren(
    ...WHEN_OPTIONS.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.label;
      button.setAttribute("aria-pressed", String(state.prefs.when === option.id));
      button.addEventListener("click", () => updatePrefs({ when: option.id }));
      return button;
    }),
  );

  const chips = [];
  const free = document.createElement("button");
  free.type = "button";
  free.className = "chip free";
  free.textContent = "Grátis";
  free.setAttribute("aria-pressed", String(state.prefs.freeOnly));
  free.addEventListener("click", () => updatePrefs({ freeOnly: !state.prefs.freeOnly }));
  chips.push(free);

  // Só mostra as categorias que existem na programação da cidade.
  const present = new Set(state.events.map((e) => e.category));
  for (const category of CATEGORIES.filter((c) => present.has(c.id))) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = `${category.emoji} ${category.label}`;
    const active = state.prefs.category === category.id;
    chip.setAttribute("aria-pressed", String(active));
    chip.addEventListener("click", () => updatePrefs({ category: active ? null : category.id }));
    chips.push(chip);
  }
  $("#category-filter").replaceChildren(...chips);
}

function badge(text, className = "", title = "") {
  const span = document.createElement("span");
  span.className = `badge ${className}`.trim();
  span.textContent = text;
  if (title) span.title = title;
  return span;
}

function renderCard(event, { today, showDates }) {
  const node = $("#event-card").content.firstElementChild.cloneNode(true);
  const category = categoryOf(event.category);
  node.querySelector(".card-emoji").textContent = category.emoji;
  node.querySelector(".card-title").textContent = event.title;

  const when = showDates
    ? `até ${formatShortDate(event.end_date)}`
    : event.end_date !== event.start_date
      ? formatDateSpan(event)
      : null;
  node.querySelector(".card-meta").textContent = [when, event.schedule, event.venue].filter(Boolean).join(" · ");

  const description = node.querySelector(".card-description");
  if (event.description) description.textContent = event.description;
  else description.remove();

  const badges = node.querySelector(".card-badges");
  if (isNew(event, today)) badges.append(badge("Novo", "new"));
  const age = formatAgeRange(event);
  badges.append(
    event.age_estimated
      ? badge(`👧 ~${age}`, "", "Faixa etária estimada pela IA")
      : badge(`👧 ${age}`, "", "Faixa etária informada pela fonte"),
  );
  if (event.is_free) badges.append(badge("Gratuito", "free"));
  else if (event.price) badges.append(badge(event.price, "", event.price));

  const source = node.querySelector('[data-action="source"]');
  source.href = safeUrl(event.url);
  const sourceName = event.source && event.source.length <= 24 ? event.source : "Fonte";
  source.textContent = `${sourceName} ↗`;
  source.title = event.source ? `Fonte: ${event.source}` : "Ver a fonte";
  node.querySelector('[data-action="share"]').addEventListener("click", () => shareEvent(event));
  const calendar = node.querySelector('[data-action="calendar"]');
  calendar.title = "Salvar na agenda do celular";
  calendar.addEventListener("click", () => downloadIcs(event));
  return node;
}

function emptyState(title, text, action) {
  const box = document.createElement("div");
  box.className = "empty";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const p = document.createElement("p");
  p.textContent = text;
  box.append(strong, p);
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary";
    button.textContent = action.label;
    button.addEventListener("click", action.onClick);
    box.append(button);
  }
  return box;
}

function renderList() {
  const main = $("#content");
  const city = currentCity();
  if (!city) {
    main.replaceChildren(emptyState("Nenhuma cidade configurada", "Adicione uma cidade em web/data/cities.json."));
    return;
  }
  if (state.loadError) {
    main.replaceChildren(emptyState("Sem conexão", state.loadError, { label: "Tentar de novo", onClick: refresh }));
    return;
  }
  if (!state.events.length) {
    main.replaceChildren(
      emptyState(
        `Ainda não há programação para ${city.name}`,
        "A busca automática de eventos ainda não rodou para esta cidade. Volte mais tarde!",
      ),
    );
    return;
  }

  const today = todayIn(city.timezone);
  const range = rangeFor(state.prefs.when, today);
  const events = filterEvents(state.events, {
    range,
    ages: state.prefs.ages,
    freeOnly: state.prefs.freeOnly,
    category: state.prefs.category,
  });
  const { days, ongoing } = groupEvents(events, range);
  const nodes = [];

  const summary = document.createElement("p");
  summary.className = "summary";
  const whenLabel = WHEN_OPTIONS.find((o) => o.id === state.prefs.when)?.label.toLowerCase();
  summary.textContent =
    events.length === 1
      ? `1 programa para ${formatAges(state.prefs.ages)} · ${whenLabel}`
      : `${events.length} programas para ${formatAges(state.prefs.ages)} · ${whenLabel}`;
  nodes.push(summary);

  if (!events.length) {
    const filtered = state.prefs.freeOnly || state.prefs.category;
    nodes.push(
      emptyState(
        "Nada encontrado com esses filtros",
        filtered ? "Tente tirar algum filtro ou olhar um período maior." : "Tente olhar um período maior.",
        state.prefs.when !== "30-dias"
          ? { label: "Ver próximos 30 dias", onClick: () => updatePrefs({ when: "30-dias" }) }
          : null,
      ),
    );
  }

  for (const { day, events: dayEvents } of days) {
    const heading = document.createElement("h2");
    heading.className = "day-heading";
    heading.textContent = formatDayHeading(day, today);
    nodes.push(heading, ...dayEvents.map((e) => renderCard(e, { today, showDates: false })));
  }

  if (ongoing.length) {
    const heading = document.createElement("h2");
    heading.className = "section-heading";
    heading.textContent = "🗓️ Em cartaz";
    const hint = document.createElement("p");
    hint.className = "section-hint";
    hint.textContent = "Exposições e temporadas que dá para visitar em vários dias.";
    nodes.push(heading, hint, ...ongoing.map((e) => renderCard(e, { today, showDates: true })));
  }

  main.replaceChildren(...nodes);
}

function renderFooter() {
  const updated = $("#updated-at");
  if (!state.generatedAt) {
    updated.textContent = "";
    return;
  }
  const date = new Date(state.generatedAt);
  updated.textContent = `Programação atualizada em ${date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
}

function render() {
  renderProfile();
  renderFilters();
  renderList();
  renderFooter();
}

function updatePrefs(patch) {
  Object.assign(state.prefs, patch);
  savePrefs();
  render();
}

async function refresh() {
  await loadEvents();
  render();
}

// ---------- Ações dos cartões ----------

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "#";
  } catch {
    return "#";
  }
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2500);
}

async function shareEvent(event) {
  const details = [formatDateSpan(event), event.schedule, event.venue].filter(Boolean).join(" · ");
  const text = `${event.title}\n${details}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: event.title, text, url: safeUrl(event.url) });
    } catch {
      // Compartilhamento cancelado.
    }
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${safeUrl(event.url)}`)}`, "_blank", "noopener");
}

function downloadIcs(event) {
  const blob = new Blob([buildIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const fileName = event.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  link.download = `${fileName || "evento"}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Abra o arquivo baixado para salvar na sua agenda.");
}

// ---------- Configurações ----------

function renderAgesEditor() {
  const list = $("#ages-list");
  list.replaceChildren(
    ...state.draftAges.map((age, index) => {
      const row = document.createElement("li");
      row.className = "age-row";

      const who = document.createElement("span");
      who.className = "who";
      who.textContent = `Criança ${index + 1}`;

      const minus = document.createElement("button");
      minus.type = "button";
      minus.className = "round";
      minus.textContent = "−";
      minus.setAttribute("aria-label", `Diminuir idade da criança ${index + 1}`);
      minus.disabled = age <= MIN_AGE;
      minus.addEventListener("click", () => setDraftAge(index, age - 1));

      const value = document.createElement("output");
      value.textContent = age === 0 ? "bebê" : `${age} ${age === 1 ? "ano" : "anos"}`;

      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "round";
      plus.textContent = "+";
      plus.setAttribute("aria-label", `Aumentar idade da criança ${index + 1}`);
      plus.disabled = age >= MAX_AGE;
      plus.addEventListener("click", () => setDraftAge(index, age + 1));

      row.append(who, minus, value, plus);
      if (state.draftAges.length > 1) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove";
        remove.textContent = "✕";
        remove.setAttribute("aria-label", `Remover criança ${index + 1}`);
        remove.addEventListener("click", () => {
          state.draftAges.splice(index, 1);
          renderAgesEditor();
        });
        row.append(remove);
      }
      return row;
    }),
  );
}

function setDraftAge(index, age) {
  state.draftAges[index] = Math.min(MAX_AGE, Math.max(MIN_AGE, age));
  renderAgesEditor();
}

function openSettings() {
  const select = $("#city-select");
  select.replaceChildren(
    ...state.cities.map((city) => {
      const option = document.createElement("option");
      option.value = city.slug;
      option.textContent = `${city.name} (${city.state})`;
      option.selected = city.slug === state.prefs.city;
      return option;
    }),
  );
  state.draftAges = state.prefs.ages.length ? [...state.prefs.ages] : [6];
  renderAgesEditor();
  $("#settings").showModal();
}

async function saveSettings() {
  const city = $("#city-select").value;
  const cityChanged = city !== state.prefs.city;
  Object.assign(state.prefs, { city, ages: [...state.draftAges], onboarded: true });
  if (cityChanged) state.prefs.category = null;
  savePrefs();
  if (cityChanged) await loadEvents();
  render();
}

function setupSettings() {
  $("#profile-button").addEventListener("click", openSettings);
  $("#add-kid").addEventListener("click", () => {
    state.draftAges.push(state.draftAges.at(-1) ?? 6);
    renderAgesEditor();
  });
  $("#settings-form").addEventListener("submit", () => saveSettings());
  // Fechar com Esc conta como "salvar" só depois do primeiro uso.
  $("#settings").addEventListener("cancel", (e) => {
    if (!state.prefs.onboarded) e.preventDefault();
  });
}

// ---------- Início ----------

async function init() {
  setupSettings();
  try {
    await loadCities();
  } catch (error) {
    $("#content").replaceChildren(emptyState("Ops!", error.message));
    return;
  }
  await loadEvents();
  render();
  if (!state.prefs.onboarded) openSettings();

  // Ao voltar para o app depois de um tempo, busca a programação mais recente.
  document.addEventListener("visibilitychange", () => {
    const stale = Date.now() - state.loadedAt > 30 * 60 * 1000;
    if (document.visibilityState === "visible" && stale) refresh();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

init();
