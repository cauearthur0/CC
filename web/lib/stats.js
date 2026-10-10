// Contagem anônima de uso, para mostrar a anunciantes quantas famílias viram e clicaram nos rolês.
// Só manda o tipo e o evento (ex.: "view" do evento abc123); nada sobre quem está usando.
// O banco soma por dia (supabase/schema.sql → track).

import { SUPABASE_KEY, SUPABASE_URL } from "./config.js";

const OPEN_KEY = "pequenos-roles:aberto-em";
const sent = new Set();

/**
 * Conta um uso. Por padrão, cada combinação (tipo + evento) conta uma vez por sessão, para que
 * abrir o mesmo evento várias vezes não infle os números.
 */
export function track(kind, eventId = "app", { once = true } = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !eventId) return;
  const key = `${kind}:${eventId}`;
  if (once && sent.has(key)) return;
  sent.add(key);
  fetch(`${SUPABASE_URL}/rest/v1/rpc/track`, {
    method: "POST",
    keepalive: true,
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_event: String(eventId).slice(0, 60), p_kind: kind }),
  }).catch(() => {});
}

/** Conta este aparelho uma vez por dia (dá o número de famílias que usam o app em cada dia). */
export function trackDailyOpen(today) {
  try {
    if (localStorage.getItem(OPEN_KEY) === today) return;
    localStorage.setItem(OPEN_KEY, today);
  } catch {
    // Sem armazenamento (navegação privada): conta mesmo assim, uma vez por sessão.
  }
  track("open", "app");
}
