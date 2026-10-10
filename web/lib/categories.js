export const CATEGORIES = [
  { id: "teatro", label: "Teatro", emoji: "🎭" },
  { id: "musica", label: "Música", emoji: "🎵" },
  { id: "cinema", label: "Cinema", emoji: "🎬" },
  { id: "oficina", label: "Oficina", emoji: "✂️" },
  { id: "exposicao", label: "Exposição", emoji: "🖼️" },
  { id: "ciencia", label: "Ciência", emoji: "🔭" },
  { id: "ao-ar-livre", label: "Ao ar livre", emoji: "🌳" },
  { id: "festa", label: "Festa", emoji: "🎉" },
  { id: "circo", label: "Circo", emoji: "🎪" },
  { id: "leitura", label: "Leitura", emoji: "📚" },
  { id: "esporte", label: "Esporte", emoji: "⚽" },
  { id: "outro", label: "Outros", emoji: "✨" },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function categoryOf(id) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
