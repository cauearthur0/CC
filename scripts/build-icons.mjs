#!/usr/bin/env node
// Gera web/lib/icons.js só com os ícones do Lucide usados no app (o pacote completo tem ~350 KB).
// Uso: npm run build-icons (rode de novo ao incluir um ícone novo na lista abaixo).

import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const lucide = require("lucide");

// nome usado no app → nome do ícone no Lucide
const USED = {
  home: "House",
  map: "Map",
  calendar: "CalendarDays",
  heart: "Heart",
  user: "User",
  pin: "MapPin",
  search: "Search",
  sliders: "SlidersHorizontal",
  locate: "LocateFixed",
  share: "Share2",
  back: "ChevronLeft",
  next: "ChevronRight",
  down: "ChevronDown",
  bell: "Bell",
  check: "Check",
  "check-circle": "CircleCheck",
  pencil: "Pencil",
  camera: "Camera",
  sparkles: "Sparkles",
  star: "Star",
  gift: "Gift",
  umbrella: "Umbrella",
  navigation: "Navigation",
  plus: "Plus",
  more: "Ellipsis",
  clock: "Clock",
  users: "Users",
  walk: "Footprints",
  building: "Building2",
  trees: "Trees",
  tree: "TreeDeciduous",
  leaf: "Leaf",
  palette: "Palette",
  landmark: "Landmark",
  drama: "Drama",
  music: "Music",
  film: "Clapperboard",
  book: "BookOpen",
  flask: "FlaskConical",
  party: "PartyPopper",
  tent: "Tent",
  ticket: "Ticket",
  tag: "Tag",
  target: "Target",
  crown: "Crown",
  sun: "Sun",
  x: "X",
  "arrow-right": "ArrowRight",
  info: "Info",
  trophy: "Trophy",
  "calendar-plus": "CalendarPlus",
  "calendar-check": "CalendarCheck",
  "external-link": "ExternalLink",
  door: "DoorOpen",
  globe: "Globe",
  dumbbell: "Dumbbell",
  "heart-handshake": "HeartHandshake",
  shapes: "Shapes",
  coins: "Coins",
  trash: "Trash2",
};

// Os elementos dos ícones do Lucide (path, circle, rect…) não têm filhos.
function render([tag, attrs]) {
  const attrText = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  return `<${tag} ${attrText}/>`;
}

const entries = Object.entries(USED).map(([name, lucideName]) => {
  const icon = lucide[lucideName];
  if (!icon) throw new Error(`Ícone ${lucideName} não existe no Lucide`);
  const [, , children] = icon;
  return `  ${JSON.stringify(name)}: ${JSON.stringify(children.map(render).join(""))},`;
});

const out = `// Gerado por scripts/build-icons.mjs a partir do Lucide (licença em web/vendor/licenses). Não edite à mão.
export const ICONS = {
${entries.join("\n")}
};
`;

const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/lib/icons.js");
await writeFile(target, out);
console.log(`${entries.length} ícones gravados em ${path.relative(process.cwd(), target)}`);
