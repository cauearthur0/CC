// Categorias dos eventos: rótulo, ícone (web/lib/icons.js) e família de cor (tons definidos em styles.css).
export const CATEGORIES = [
  { id: "teatro", label: "Teatro", icon: "drama", tone: "pink" },
  { id: "circo", label: "Circo", icon: "tent", tone: "red" },
  { id: "musica", label: "Música", icon: "music", tone: "purple" },
  { id: "cinema", label: "Cinema", icon: "film", tone: "indigo" },
  { id: "oficina", label: "Oficina", icon: "palette", tone: "purple" },
  { id: "exposicao", label: "Exposição", icon: "landmark", tone: "yellow" },
  { id: "ciencia", label: "Ciência", icon: "flask", tone: "blue" },
  { id: "ao-ar-livre", label: "Ao ar livre", icon: "trees", tone: "green" },
  { id: "festa", label: "Festa", icon: "party", tone: "orange" },
  { id: "leitura", label: "Histórias", icon: "book", tone: "teal" },
  { id: "esporte", label: "Esporte", icon: "dumbbell", tone: "green" },
  { id: "outro", label: "Outros", icon: "sparkles", tone: "gray" },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function categoryOf(id) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

// Interesses que a família escolhe; cada um casa com categorias e/ou características do evento.
export const INTERESTS = [
  { id: "teatro", label: "Teatro", icon: "drama", tone: "red", categories: ["teatro", "circo"] },
  { id: "parques", label: "Parques", icon: "tree", tone: "green", categories: ["ao-ar-livre"] },
  { id: "oficinas", label: "Oficinas", icon: "palette", tone: "orange", categories: ["oficina"] },
  { id: "museus", label: "Museus", icon: "landmark", tone: "purple", categories: ["exposicao", "ciencia"] },
  { id: "ao-ar-livre", label: "Ao ar livre", icon: "leaf", tone: "green", outdoor: true },
  { id: "gratis", label: "Eventos grátis", icon: "gift", tone: "blue", free: true },
  { id: "musica", label: "Música", icon: "music", tone: "purple", categories: ["musica"] },
  { id: "cinema", label: "Cinema", icon: "film", tone: "indigo", categories: ["cinema"] },
  { id: "historias", label: "Histórias", icon: "book", tone: "teal", categories: ["leitura"] },
  { id: "ciencia", label: "Ciência", icon: "flask", tone: "blue", categories: ["ciencia"] },
  { id: "festas", label: "Festas", icon: "party", tone: "orange", categories: ["festa"] },
  { id: "esportes", label: "Esportes", icon: "dumbbell", tone: "green", categories: ["esporte"] },
];

// Os seis da tela de boas-vindas.
export const MAIN_INTERESTS = INTERESTS.slice(0, 6);

export function interestOf(id) {
  return INTERESTS.find((i) => i.id === id);
}

/** O evento combina com o interesse? */
export function matchesInterest(event, interest) {
  if (!interest) return false;
  if (interest.free) return Boolean(event.is_free);
  if (interest.outdoor)
    return event.setting === "outdoor" || event.setting === "misto" || event.category === "ao-ar-livre";
  return interest.categories?.includes(event.category) ?? false;
}
