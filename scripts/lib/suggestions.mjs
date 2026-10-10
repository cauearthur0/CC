import { z } from "zod";
import { addDays } from "../../web/lib/dates.js";

// Faixas de idade para as quais a IA monta uma sugestão de programa.
export const AGE_BANDS = [
  [0, 3],
  [4, 6],
  [7, 9],
  [10, 12],
];

const SUGGESTION_DAYS = 10;

export const SUGGESTIONS_SYSTEM = `Você ajuda pais e mães a montar o programa dos próximos dias com as crianças.
Para cada faixa de idade pedida, escolha 1 ou 2 eventos da lista que combinem bem juntos (por exemplo, um passeio ao ar livre e uma atividade no mesmo dia ou no mesmo bairro) e escreva uma sugestão curta e carinhosa, em português do Brasil.

Regras:
- Use apenas eventos da lista, indicando os ids exatos em event_ids.
- Só escolha eventos adequados à faixa de idade.
- title: 2 a 5 palavras (ex.: "Sábado de teatro e parque").
- text: uma pergunta ou convite de até 2 frases (ex.: "Que tal combinar um passeio no Parque da Redenção com uma contação de histórias à tarde?").
- tagline: frase curta e divertida (ex.: "Natureza + imaginação = dia perfeito!").
- Responda somente com JSON no formato {"suggestions": [{"age_min", "age_max", "title", "text", "tagline", "event_ids"}]}.`;

export const SuggestionsResult = z.object({
  suggestions: z.array(
    z.object({
      age_min: z.number(),
      age_max: z.number(),
      title: z.string(),
      text: z.string(),
      tagline: z.string(),
      event_ids: z.array(z.string()),
    }),
  ),
});

const { $schema, ...suggestionsJsonSchema } = z.toJSONSchema(SuggestionsResult);
export const SUGGESTIONS_JSON_SCHEMA = suggestionsJsonSchema;

/** Eventos dos próximos dias, em formato compacto para o prompt. */
export function upcomingForSuggestions(events, today) {
  const until = addDays(today, SUGGESTION_DAYS);
  return events.filter((e) => e.end_date >= today && e.start_date <= until);
}

export function buildSuggestionsPrompt({ city, today, events }) {
  const lines = events.map((e) => {
    const dates = e.end_date !== e.start_date ? `${e.start_date} a ${e.end_date}` : e.start_date;
    const ages =
      e.age_min === null && e.age_max === null ? "todas as idades" : `${e.age_min ?? 0}-${e.age_max ?? "+"} anos`;
    const extras = [e.schedule, e.neighborhood, e.setting, e.is_free ? "grátis" : e.price].filter(Boolean).join("; ");
    return `- id ${e.id} | ${e.title} | ${dates} | ${e.venue} | ${e.category} | ${ages} | ${extras}`;
  });
  const bands = AGE_BANDS.map(([min, max]) => `${min} a ${max} anos`).join(", ");
  return `Cidade: ${city.name}. Hoje é ${today}.
Faixas de idade: ${bands}.

Eventos disponíveis:
${lines.join("\n")}`;
}

/** Mantém só sugestões com eventos que existem; corta textos longos. */
export function cleanSuggestions(raw, events) {
  const ids = new Set(events.map((e) => e.id));
  return (raw ?? [])
    .map((s) => ({
      age_min: Math.max(0, Math.round(Number(s.age_min) || 0)),
      age_max: Math.min(17, Math.round(Number(s.age_max) || 12)),
      title: String(s.title ?? "")
        .trim()
        .slice(0, 60),
      text: String(s.text ?? "")
        .trim()
        .slice(0, 280),
      tagline: String(s.tagline ?? "")
        .trim()
        .slice(0, 80),
      event_ids: [...new Set((s.event_ids ?? []).filter((id) => ids.has(id)))].slice(0, 3),
    }))
    .filter((s) => s.text && s.event_ids.length);
}
