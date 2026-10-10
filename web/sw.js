// Service worker: deixa o app abrir rápido e funcionar sem internet.
// - Arquivos do app: responde do cache e atualiza em segundo plano.
// - Programação (data/*.json): tenta a internet primeiro, cai no cache se estiver offline.
// - Fotos dos eventos e mapa (outros sites): só pela internet, com cache do próprio navegador.
// - Notificações: mostra o aviso e, ao tocar, abre o app na tela do evento.

const CACHE = "pequenos-roles-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./lib/categories.js",
  "./lib/dates.js",
  "./lib/dom.js",
  "./lib/filters.js",
  "./lib/format.js",
  "./lib/geo.js",
  "./lib/cloud.js",
  "./lib/config.js",
  "./lib/icons.js",
  "./lib/ics.js",
  "./lib/price.js",
  "./lib/ranking.js",
  "./lib/store.js",
  "./lib/sync.js",
  "./lib/text.js",
  "./lib/weather.js",
  "./ui/components.js",
  "./ui/map-style.js",
  "./ui/maplibre.js",
  "./ui/sheets.js",
  "./views/agenda.js",
  "./views/event.js",
  "./views/favorites.js",
  "./views/home.js",
  "./views/map.js",
  "./views/onboarding.js",
  "./views/profile.js",
  "./assets/avatar-girl.webp",
  "./assets/family-big.webp",
  "./assets/family-small.webp",
  "./assets/footer-family.webp",
  "./assets/girl-hero.webp",
  "./assets/glasshouse.webp",
  "./assets/logo.webp",
  "./assets/note-aventuras.webp",
  "./assets/note-crianca.webp",
  "./assets/note-familias.webp",
  "./assets/note-historias.webp",
  "./assets/note-infancias.webp",
  "./assets/pref-calendar.webp",
  "./assets/pref-city.webp",
  "./assets/pref-coins.webp",
  "./assets/pref-kids.webp",
  "./assets/pref-palette.webp",
  "./assets/pref-radius.webp",
  "./assets/robot-wink.webp",
  "./assets/skyline-bottom.webp",
  "./assets/skyline-footer.webp",
  "./assets/skyline-header.webp",
  "./assets/sticker-infancia.webp",
  "./assets/sun-doodle.webp",
  "./vendor/fonts/baloo-2-latin-700-normal.woff2",
  "./vendor/fonts/baloo-2-latin-800-normal.woff2",
  "./vendor/fonts/caveat-latin-700-normal.woff2",
  "./vendor/fonts/nunito-latin-400-normal.woff2",
  "./vendor/fonts/nunito-latin-600-normal.woff2",
  "./vendor/fonts/nunito-latin-700-normal.woff2",
  "./vendor/fonts/nunito-latin-800-normal.woff2",
  "./vendor/fonts/nunito-latin-900-normal.woff2",
];
// O mapa (Leaflet) não entra aqui: é baixado só quando alguém abre o mapa e fica no cache depois disso.

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request, { ignoreSearch: true });
  const update = fetch(event.request)
    .then((response) => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
    .catch(() => cached ?? Response.error());
  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  return update;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.includes("/data/")) event.respondWith(networkFirst(event.request));
  else event.respondWith(staleWhileRevalidate(event));
});

// Notificações (lembretes da agenda, novidades e chuva), enviadas pelo robô do GitHub Actions.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Pequenos Rolês", {
      body: data.body || "",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "./" },
    }),
  );
});

// Tocar na notificação abre o app (ou a janela já aberta) na tela certa.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) return open.navigate(url).then((w) => (w ?? open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
