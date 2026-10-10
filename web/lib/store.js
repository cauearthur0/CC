// Tudo o que a família escolhe fica só neste aparelho (localStorage): perfil, favoritos e agenda.

const KEY = "pequenos-roles:v1";

export const RADIUS_OPTIONS = [2, 5, 10, 20, 0]; // 0 = sem limite
export const DAYS_OPTIONS = [
  { id: "fins-de-semana", label: "Fins de semana", hint: "Sáb e Dom, o dia todo" },
  { id: "qualquer-dia", label: "Qualquer dia", hint: "Todos os dias da semana" },
  { id: "dias-de-semana", label: "Dias de semana", hint: "De segunda a sexta" },
];
export const BUDGET_OPTIONS = [
  { id: "gratis", label: "Só grátis", hint: "Apenas rolês gratuitos", max: 0 },
  { id: "ate-30", label: "Até R$ 30", hint: "Gratuitos e até R$ 30", max: 30 },
  { id: "ate-60", label: "Até R$ 60", hint: "Gratuitos e até R$ 60", max: 60 },
  { id: "qualquer", label: "Qualquer valor", hint: "De gratuitos a pagos", max: Infinity },
];
export const RELATIONS = ["Pai", "Mãe", "Responsável", "Avô", "Avó", "Tio", "Tia"];

export function newKid(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: "",
    age: 6,
    gender: "f",
    photo: null,
    bio: "",
    interests: ["teatro", "parques", "oficinas", "museus", "ao-ar-livre", "gratis"],
    ...overrides,
  };
}

function defaults() {
  return {
    onboarded: false,
    parent: { name: "", relation: "Pai", photo: null, bio: "" },
    kids: [newKid()],
    activeKid: null,
    city: null,
    radiusKm: 10,
    days: "fins-de-semana",
    budget: "qualquer",
    useGps: false,
    alerts: { ai: true, free: true, rain: true },
    favorites: {}, // id → { saved_at, event }
    agenda: [], // { id, event_id, date, status, reminder, added_at, event }
    filters: { when: "fim-de-semana", free: false, outdoor: false, indoor: false, category: null, byAge: true },
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved) return defaults();
    const base = defaults();
    return {
      ...base,
      ...saved,
      parent: { ...base.parent, ...saved.parent },
      alerts: { ...base.alerts, ...saved.alerts },
      filters: { ...base.filters, ...saved.filters },
      kids: saved.kids?.length ? saved.kids : base.kids,
    };
  } catch {
    return defaults();
  }
}

export const store = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Sem espaço ou navegação privada: o app segue funcionando nesta sessão.
  }
}

export function activeKid() {
  return store.kids.find((k) => k.id === store.activeKid) ?? store.kids[0];
}

export function kidAges() {
  return store.kids.map((k) => k.age);
}

/** Cópia enxuta do evento, para favoritos e agenda continuarem aparecendo depois que ele sair da programação. */
function snapshot(event) {
  const { id, title, description, category, start_date, end_date, schedule, venue, neighborhood, image, url } = event;
  return { id, title, description, category, start_date, end_date, schedule, venue, neighborhood, image, url };
}

export function isFavorite(id) {
  return Boolean(store.favorites[id]);
}

export function toggleFavorite(event, today) {
  if (store.favorites[event.id]) delete store.favorites[event.id];
  else store.favorites[event.id] = { saved_at: today, event: snapshot(event) };
  save();
  return isFavorite(event.id);
}

export function agendaFor(eventId) {
  return store.agenda.filter((item) => item.event_id === eventId);
}

export function addToAgenda(event, date, today) {
  const existing = store.agenda.find((item) => item.event_id === event.id && item.date === date);
  if (existing) return existing;
  const item = {
    id: Math.random().toString(36).slice(2, 10),
    event_id: event.id,
    date,
    status: "salvo",
    reminder: false,
    added_at: today,
    event: snapshot(event),
  };
  store.agenda.push(item);
  save();
  return item;
}

export function updateAgendaItem(id, patch) {
  const item = store.agenda.find((i) => i.id === id);
  if (item) Object.assign(item, patch);
  save();
}

export function removeAgendaItem(id) {
  store.agenda = store.agenda.filter((i) => i.id !== id);
  save();
}

/** Quantos rolês foram salvos (favoritos ou agenda) no mês de "today". */
export function savedThisMonth(today) {
  const month = today.slice(0, 7);
  const ids = new Set();
  for (const [id, fav] of Object.entries(store.favorites)) if (fav.saved_at?.startsWith(month)) ids.add(id);
  for (const item of store.agenda) if (item.added_at?.startsWith(month)) ids.add(item.event_id);
  return ids.size;
}
