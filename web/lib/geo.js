/** Distância em km entre dois pontos (fórmula de Haversine). */
export function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
}

export function formatKm(km) {
  if (km == null) return null;
  if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/** Posição atual pelo GPS do celular (pede permissão na primeira vez). */
export function currentPosition({ timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Este aparelho não informa a localização."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (error) =>
        reject(
          new Error(error.code === 1 ? "Permissão de localização negada." : "Não foi possível achar sua localização."),
        ),
      { enableHighAccuracy: false, timeout, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export function directionsUrl(event) {
  const destination =
    event.lat != null ? `${event.lat},${event.lng}` : [event.venue, event.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function mapsUrl(event) {
  const query =
    event.lat != null ? `${event.lat},${event.lng}` : [event.venue, event.address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
