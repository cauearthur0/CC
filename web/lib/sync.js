// Junta os dados da família entre celulares. O que é compartilhado: crianças, cidade, favoritos e agenda.
// O resto (quem é o responsável neste celular, filtros, raio, alertas) fica só no aparelho.
//
// Cada mudança ganha um carimbo de tempo: nas crianças e na cidade vale a mudança mais recente; nos
// favoritos e na agenda, item a item, e o que foi apagado vira uma "lápide" com a hora em que saiu.
// Assim dois celulares podem mudar coisas diferentes ao mesmo tempo sem um apagar o do outro.

const SHARED_VALUES = ["kids", "city"];
const TOMBSTONE_DAYS = 120;

/** Resumo curto de um texto (FNV-1a), para saber se algo mudou sem guardar uma cópia inteira. */
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

const hashOf = (value) => hashString(JSON.stringify(value ?? null));

function withoutTs(item) {
  const { ts, ...rest } = item;
  return rest;
}

/** Dados de controle da sincronização (criados na primeira vez). */
export function syncState(state) {
  state.sync ??= {};
  const sync = state.sync;
  sync.ts ??= {};
  sync.seen ??= {};
  sync.seen.favorites ??= [];
  sync.seen.agenda ??= {};
  sync.removed ??= {};
  sync.removed.favorites ??= {};
  sync.removed.agenda ??= {};
  return sync;
}

function pruneTombstones(removed, now) {
  const limit = now - TOMBSTONE_DAYS * 86_400_000;
  for (const list of Object.values(removed)) {
    for (const [id, ts] of Object.entries(list)) if (ts < limit) delete list[id];
  }
}

/**
 * Anota o horário do que mudou neste aparelho desde a última vez. Chamado a cada gravação local;
 * não precisa saber quem mudou o quê.
 */
export function stampChanges(state, now = Date.now()) {
  const sync = syncState(state);
  for (const key of SHARED_VALUES) {
    const hash = hashOf(state[key]);
    if (sync.seen[key] !== hash) {
      sync.ts[key] = now;
      sync.seen[key] = hash;
    }
  }

  const favoriteIds = Object.keys(state.favorites ?? {});
  for (const id of favoriteIds) state.favorites[id].ts ??= now;
  for (const id of sync.seen.favorites) if (!state.favorites?.[id]) sync.removed.favorites[id] = now;
  for (const id of favoriteIds) delete sync.removed.favorites[id];
  sync.seen.favorites = favoriteIds;

  const agendaIds = new Set();
  for (const item of state.agenda ?? []) {
    agendaIds.add(item.id);
    const hash = hashOf(withoutTs(item));
    if (sync.seen.agenda[item.id] !== hash || item.ts == null) {
      item.ts = now;
      sync.seen.agenda[item.id] = hash;
    }
    delete sync.removed.agenda[item.id];
  }
  for (const id of Object.keys(sync.seen.agenda)) {
    if (!agendaIds.has(id)) {
      sync.removed.agenda[id] = now;
      delete sync.seen.agenda[id];
    }
  }
  pruneTombstones(sync.removed, now);
}

/** Documento compartilhado (o que vai para a nuvem) a partir do estado deste aparelho. */
export function toShared(state) {
  const sync = syncState(state);
  const doc = { favorites: {}, agenda: {}, removed: structuredClone(sync.removed) };
  for (const key of SHARED_VALUES) doc[key] = { value: state[key] ?? null, ts: sync.ts[key] ?? 0 };
  // As fotos das crianças ficam só no aparelho (não vão para a nuvem).
  if (Array.isArray(doc.kids.value)) doc.kids.value = doc.kids.value.map((kid) => ({ ...kid, photo: null }));
  for (const [id, fav] of Object.entries(state.favorites ?? {})) doc.favorites[id] = fav;
  for (const item of state.agenda ?? []) doc.agenda[item.id] = item;
  return doc;
}

function mergeItems(a = {}, b = {}, removedA = {}, removedB = {}) {
  const items = {};
  const removed = {};
  for (const id of new Set([
    ...Object.keys(a),
    ...Object.keys(b),
    ...Object.keys(removedA),
    ...Object.keys(removedB),
  ])) {
    const candidates = [a[id], b[id]].filter(Boolean);
    const newest = candidates.sort((x, y) => (y.ts ?? 0) - (x.ts ?? 0))[0];
    const removedAt = Math.max(removedA[id] ?? 0, removedB[id] ?? 0);
    if (newest && (newest.ts ?? 0) > removedAt) items[id] = newest;
    else if (removedAt) removed[id] = removedAt;
  }
  return { items, removed };
}

/** Junta dois documentos compartilhados (dá o mesmo resultado em qualquer ordem). */
export function mergeShared(a = {}, b = {}) {
  const doc = {};
  for (const key of SHARED_VALUES) {
    const x = a[key];
    const y = b[key];
    doc[key] = !x ? y : !y ? x : (y.ts ?? 0) > (x.ts ?? 0) ? y : x;
  }
  const favorites = mergeItems(a.favorites, b.favorites, a.removed?.favorites, b.removed?.favorites);
  const agenda = mergeItems(a.agenda, b.agenda, a.removed?.agenda, b.removed?.agenda);
  doc.favorites = favorites.items;
  doc.agenda = agenda.items;
  doc.removed = { favorites: favorites.removed, agenda: agenda.removed };
  for (const key of SHARED_VALUES) if (doc[key] === undefined) delete doc[key];
  return doc;
}

/**
 * Coloca no aparelho o documento juntado. Devolve o que mudou ({ kids, city, favorites, agenda }) para o
 * app saber o que redesenhar. Não gera carimbos novos: o que veio da nuvem não conta como mudança local.
 */
export function applyShared(state, doc) {
  const sync = syncState(state);
  const before = {
    kidsList: state.kids,
    kids: hashOf(state.kids),
    city: state.city,
    favorites: hashOf(state.favorites),
    agenda: hashOf(state.agenda),
  };
  for (const key of SHARED_VALUES) {
    if (!doc[key]) continue;
    if (key === "kids" && !doc.kids.value?.length) continue; // nunca deixa o app sem nenhuma criança
    if (key === "city" && !doc.city.value) continue;
    state[key] = doc[key].value;
    if (key === "kids") {
      // A foto de cada criança continua a que está neste aparelho.
      const photos = new Map((before.kidsList ?? []).map((kid) => [kid.id, kid.photo]));
      state.kids = state.kids.map((kid) => ({ ...kid, photo: photos.get(kid.id) ?? kid.photo ?? null }));
    }
    sync.ts[key] = doc[key].ts ?? 0;
    sync.seen[key] = hashOf(state[key]);
  }
  state.favorites = { ...(doc.favorites ?? {}) };
  state.agenda = Object.values(doc.agenda ?? {}).sort(
    (x, y) => x.date.localeCompare(y.date) || String(x.added_at).localeCompare(String(y.added_at)),
  );
  sync.removed = structuredClone(doc.removed ?? { favorites: {}, agenda: {} });
  sync.removed.favorites ??= {};
  sync.removed.agenda ??= {};
  sync.seen.favorites = Object.keys(state.favorites);
  sync.seen.agenda = Object.fromEntries(state.agenda.map((item) => [item.id, hashOf(withoutTs(item))]));
  return {
    kids: hashOf(state.kids) !== before.kids,
    city: state.city !== before.city,
    favorites: hashOf(state.favorites) !== before.favorites,
    agenda: hashOf(state.agenda) !== before.agenda,
  };
}

/** Se dois documentos têm o mesmo conteúdo (para não salvar na nuvem sem necessidade). */
export function sameShared(a, b) {
  const normalize = (doc) => {
    const sorted = (obj) => Object.fromEntries(Object.entries(obj ?? {}).sort(([x], [y]) => x.localeCompare(y)));
    return JSON.stringify({
      kids: doc?.kids ?? null,
      city: doc?.city ?? null,
      favorites: sorted(doc?.favorites),
      agenda: sorted(doc?.agenda),
      removed: { favorites: sorted(doc?.removed?.favorites), agenda: sorted(doc?.removed?.agenda) },
    });
  };
  return normalize(a) === normalize(b);
}
