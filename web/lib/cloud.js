// Família conectada: o mesmo perfil das crianças, favoritos e agenda em vários celulares, e as
// notificações. Usa o Supabase (configurado em config.js); o código do banco está em supabase/schema.sql.
//
// Cada celular entra de forma anônima (sem e-mail). Um celular cria a família e recebe um código; os
// outros entram com ele. A cada mudança, o app junta o que está na nuvem com o que está no aparelho
// (ver sync.js) e salva de volta.

import { SUPABASE_KEY, SUPABASE_URL } from "./config.js";
import { onSave, save, store } from "./store.js";
import { applyShared, hashString, mergeShared, sameShared, syncState, toShared } from "./sync.js";

export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

let clientPromise = null;
let muted = false;
let running = null;
let runAgain = false;
let timer = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to fetch"));
    document.head.append(script);
  });
}

function client() {
  clientPromise ??= (async () => {
    if (!window.supabase) await loadScript("./vendor/supabase.js");
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "pequenos-roles:sessao",
      },
    });
  })().catch((error) => {
    clientPromise = null;
    throw error;
  });
  return clientPromise;
}

/** Erro em português para mostrar na tela (o original vai para o console). */
function friendly(error) {
  console.warn("Família conectada:", error);
  const message = String(error?.message ?? error);
  if (/codigo_invalido/.test(message)) return new Error("Código não encontrado. Confira as letras e tente de novo.");
  if (/anonymous/i.test(message)) return new Error("A entrada sem e-mail ainda não foi ligada no Supabase.");
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(message)) {
    return new Error("Sem conexão com a internet. Tente de novo quando estiver on-line.");
  }
  if (/does not exist|schema cache/i.test(message)) return new Error("O banco do Supabase ainda não foi preparado.");
  return new Error("Não deu certo agora. Tente de novo em instantes.");
}

let sessionPromise = null;

/**
 * Cliente com sessão (anônima). A sessão fica guardada no aparelho e é renovada sozinha.
 * Pedidos ao mesmo tempo esperam a mesma entrada, para não criar dois usuários.
 * Só cria um usuário novo quando "allowNew" (criar, entrar ou ligar avisos): numa sincronização comum,
 * sem sessão, é melhor tentar de novo depois do que virar outro usuário e perder a família.
 */
async function signedIn({ allowNew = false } = {}) {
  const sb = await client();
  sessionPromise ??= (async () => {
    const { data } = await sb.auth.getSession();
    if (data.session) return;
    if (family() && !allowNew) throw new Error("sem sessão; tentando de novo mais tarde");
    const { error } = await sb.auth.signInAnonymously();
    if (error) throw error;
  })().catch((error) => {
    sessionPromise = null;
    throw error;
  });
  await sessionPromise;
  return sb;
}

/** Salva sem disparar uma nova sincronização (para o que veio da própria nuvem). */
function quietSave() {
  muted = true;
  try {
    save();
  } finally {
    muted = false;
  }
}

export function family() {
  return store.sync?.family ?? null;
}

/** Garante os dados de controle da sincronização (num celular novo eles ainda não existem). */
function meta() {
  return syncState(store);
}

/** Código no formato de leitura fácil: K7MQ3XPA → K7MQ-3XPA. */
export function formatCode(code) {
  return code ? `${code.slice(0, 4)}-${code.slice(4)}` : "";
}

export async function createFamily(app) {
  try {
    const sb = await signedIn({ allowNew: true });
    quietSave(); // carimba o horário de tudo o que já existe neste celular
    const { data, error } = await sb.rpc("create_family", { p_data: toShared(store) });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    meta().family = { id: row.id, code: row.code, version: row.version };
    store.sync.lastSync = Date.now();
    quietSave();
    if (store.sync.push) await refreshPush();
    app.rerender();
    return row.code;
  } catch (error) {
    throw friendly(error);
  }
}

export async function joinFamily(app, code) {
  try {
    const sb = await signedIn({ allowNew: true });
    const { data: id, error } = await sb.rpc("join_family", { p_code: code });
    if (error) throw error;
    // Na hora de entrar, as crianças e a cidade da família valem mais que as deste celular;
    // favoritos e agenda se somam. Primeiro carimba o que existe aqui; depois zera crianças e cidade.
    quietSave();
    const sync = meta();
    sync.ts = { ...sync.ts, kids: 0, city: 0 };
    sync.family = { id, code: "", version: 0 };
    quietSave();
    await syncNow(app, { throwErrors: true });
    if (store.sync.push) await refreshPush();
  } catch (error) {
    if (family() && !family().code) store.sync.family = null;
    quietSave();
    throw error.friendly ? error : friendly(error);
  }
}

export async function leaveFamily(app) {
  try {
    const sb = await signedIn();
    await unsubscribeHere();
    const { error } = await sb.rpc("leave_family");
    if (error) throw error;
  } catch (error) {
    // Sem internet, não dá para avisar a família: melhor tentar de novo. Outros erros (sessão perdida,
    // família que já não existe) não impedem de desligar este celular.
    if (/Failed to fetch|NetworkError|network|Load failed/i.test(String(error?.message ?? error)))
      throw friendly(error);
    console.warn("Sair da família:", error);
  }
  store.sync.family = null;
  store.sync.push = false;
  quietSave();
  app.rerender();
}

/** Junta o que está na nuvem com o que está aqui e salva o resultado nos dois lugares. */
export function syncNow(app, { throwErrors = false } = {}) {
  if (!cloudConfigured || !family()) return Promise.resolve();
  if (running) {
    runAgain = true;
    return running;
  }
  running = (async () => {
    try {
      const sb = await signedIn();
      // Se outro celular salvar no meio do caminho, busca de novo e junta outra vez.
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data: row, error } = await sb
          .from("families")
          .select("id, code, data, version")
          .eq("id", family().id)
          .maybeSingle();
        if (error) throw error;
        if (!row) {
          store.sync.family = null;
          store.sync.push = false;
          quietSave();
          app.toast?.("Este celular não está mais na família.");
          app.rerender();
          return;
        }
        const merged = mergeShared(row.data ?? {}, toShared(store));
        const changed = applyShared(store, merged);
        store.sync.family = { id: row.id, code: row.code, version: row.version };
        if (!sameShared(merged, row.data)) {
          const { data: version, error: saveError } = await sb.rpc("save_family_data", {
            p_family: row.id,
            p_data: merged,
            p_version: row.version,
          });
          if (saveError) throw saveError;
          if (version == null) continue;
          store.sync.family.version = version;
        }
        store.sync.lastSync = Date.now();
        quietSave();
        if (changed.city) {
          muted = true;
          try {
            await app.setCity(store.city);
          } finally {
            muted = false;
          }
        } else if (changed.kids || changed.favorites || changed.agenda) {
          app.rerender();
        }
        return;
      }
    } catch (error) {
      if (throwErrors) {
        const err = friendly(error);
        err.friendly = true;
        throw err;
      }
      console.warn("Sincronização:", error);
    } finally {
      running = null;
      if (runAgain) {
        runAgain = false;
        syncNow(app);
      }
    }
  })();
  return running;
}

/** Liga a sincronização: ao abrir, ao voltar para o app, a cada minuto e logo depois de cada mudança. */
export function startCloud(app) {
  if (!cloudConfigured) return;
  onSave(() => {
    if (muted || !family()) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(app), 1500);
    if (store.sync.push && hashString(JSON.stringify(store.alerts)) !== store.sync.pushPrefs) refreshPush();
  });
  const visible = () => document.visibilityState === "visible";
  document.addEventListener("visibilitychange", () => visible() && syncNow(app));
  setInterval(() => visible() && syncNow(app), 60_000);
  syncNow(app);
}

// ---------- Notificações ----------

function isIos() {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isInstalled() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

/** "ligado", "desligado", "instalar" (iPhone fora da Tela de Início), "bloqueado" ou "sem-suporte". */
export function pushStatus() {
  if (!cloudConfigured) return "sem-suporte";
  if (isIos() && !isInstalled()) return "instalar";
  if (!("serviceWorker" in navigator && "PushManager" in window && "Notification" in window)) return "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  return store.sync?.push && Notification.permission === "granted" ? "ligado" : "desligado";
}

function keyBytes(base64url) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function saveSubscription(sb, subscription) {
  const { endpoint, keys } = subscription.toJSON();
  const prefs = { ...store.alerts };
  const { error } = await sb.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_prefs: prefs,
  });
  if (error) throw error;
  store.sync.pushPrefs = hashString(JSON.stringify(prefs));
}

/** Liga as notificações neste celular (cria a família, se ainda não houver, para guardar a agenda). */
export async function enablePush(app) {
  // O pedido de permissão precisa vir direto do toque na tela (exigência do iPhone): fica antes de tudo.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("O celular não deu permissão. Libere as notificações do app nas configurações.");
  }
  if (!family()) await createFamily(app);
  try {
    const sb = await signedIn();
    const { data: key, error } = await sb.rpc("get_vapid_public_key");
    if (error) throw error;
    if (!key) {
      const err = new Error("As notificações ainda estão sendo preparadas. Tente de novo mais tarde.");
      err.friendly = true;
      throw err;
    }
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    const current = subscription?.options?.applicationServerKey;
    if (
      subscription &&
      current &&
      btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(key)))
    ) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    });
    await saveSubscription(sb, subscription);
    meta().push = true;
    quietSave();
  } catch (error) {
    throw error.friendly ? error : friendly(error);
  }
}

async function unsubscribeHere() {
  const registration = await navigator.serviceWorker?.getRegistration?.();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  try {
    const sb = await signedIn();
    await sb.rpc("delete_push_subscription", { p_endpoint: subscription.endpoint });
  } finally {
    await subscription.unsubscribe().catch(() => {});
  }
}

export async function disablePush() {
  try {
    await unsubscribeHere();
  } catch (error) {
    throw friendly(error);
  }
  store.sync.push = false;
  quietSave();
}

/** Atualiza na nuvem os alertas escolhidos (ou a família) desta assinatura. */
async function refreshPush() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await saveSubscription(await signedIn(), subscription);
    quietSave();
  } catch (error) {
    console.warn("Notificações:", error);
  }
}
