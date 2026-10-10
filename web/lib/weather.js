// Previsão de chuva pelo Open-Meteo (gratuito, sem chave). Guardada por 3 horas no aparelho.

const CACHE_KEY = "pequenos-roles:weather";
const MAX_AGE_MS = 3 * 60 * 60 * 1000;
export const RAIN_THRESHOLD = 60; // % de chance de chuva para sugerir lugares fechados

export async function rainForecast(city) {
  if (city?.lat == null) return {};
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached?.city === city.slug && Date.now() - cached.at < MAX_AGE_MS) return cached.days;
  } catch {
    // ignora cache inválido
  }
  const params = new URLSearchParams({
    latitude: city.lat,
    longitude: city.lng,
    daily: "precipitation_probability_max",
    timezone: city.timezone,
    forecast_days: "10",
  });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) return {};
    const data = await response.json();
    const days = Object.fromEntries(
      (data.daily?.time ?? []).map((day, i) => [day, data.daily.precipitation_probability_max?.[i] ?? 0]),
    );
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ city: city.slug, at: Date.now(), days }));
    } catch {
      // sem espaço: tudo bem
    }
    return days;
  } catch {
    return {};
  }
}

/** Primeiro dia com chuva provável dentro do período. */
export function rainyDayIn(forecast, range) {
  return Object.keys(forecast)
    .sort()
    .find((day) => day >= range.start && day <= range.end && forecast[day] >= RAIN_THRESHOLD);
}
