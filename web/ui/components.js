import { categoryOf } from "../lib/categories.js";
import { asset, h, icon } from "../lib/dom.js";
import { formatAgeShort, formatWhen, parseTimes } from "../lib/format.js";
import { formatKm } from "../lib/geo.js";
import { activeKid, isFavorite, toggleFavorite } from "../lib/store.js";
import { track } from "../lib/stats.js";

// ---------- Cabeçalho e navegação ----------

export function logo({ tagline = false } = {}) {
  return h(
    "a",
    { href: "#/inicio", class: "logo", "aria-label": "Pequenos Rolês — início" },
    asset("logo", { alt: "Pequenos Rolês", className: "logo-img" }),
    tagline ? h("span", { class: "logo-tagline" }, "Grandes", h("br"), "histórias", h("br"), "em família") : null,
  );
}

export function kidAvatar(kid, { size = "md" } = {}) {
  return kid?.photo
    ? h("img", { class: `avatar avatar-${size}`, src: kid.photo, alt: "" })
    : h("span", { class: `avatar avatar-${size} avatar-default` }, asset("avatar-girl", { alt: "" }));
}

export function appHeader(app, { tagline = false, extra = null } = {}) {
  const kid = activeKid();
  return h(
    "header",
    { class: "app-header" },
    logo({ tagline }),
    h(
      "div",
      { class: "header-actions" },
      h(
        "div",
        { class: "header-pills" },
        h(
          "button",
          { class: "pill pill-soft", type: "button", onclick: () => app.sheets.city() },
          icon("pin", { className: "c-red" }),
          h("span", {}, app.city?.name ?? "Cidade"),
          icon("down", { size: 16 }),
        ),
        h(
          "button",
          { class: "pill pill-soft pill-kid", type: "button", onclick: () => app.sheets.kids() },
          kidAvatar(kid, { size: "sm" }),
          kid?.name
            ? h("span", { class: "pill-kid-text" }, h("strong", {}, kid.name), h("small", {}, ageLabel(kid.age)))
            : h("span", {}, ageLabel(kid?.age ?? 6)),
          icon("down", { size: 16 }),
        ),
      ),
      extra,
    ),
  );
}

export function ageLabel(age) {
  return age === 0 ? "Bebê" : `${age} ${age === 1 ? "ano" : "anos"}`;
}

const TABS = [
  { id: "inicio", label: "Início", icon: "home" },
  { id: "mapa", label: "Mapa", icon: "map" },
  { id: "agenda", label: "Agenda", icon: "calendar" },
  { id: "favoritos", label: "Favoritos", icon: "heart" },
  { id: "perfil", label: "Perfil", icon: "user" },
];

export function tabBar(active) {
  return h(
    "nav",
    { class: "tabbar", "aria-label": "Navegação principal" },
    TABS.map((tab) =>
      h(
        "a",
        {
          href: `#/${tab.id}`,
          class: `tab ${tab.id === active ? "active" : ""}`,
          "aria-current": tab.id === active ? "page" : null,
        },
        icon(tab.icon, { size: 26, strokeWidth: 1.8 }),
        h("span", {}, tab.label),
      ),
    ),
  );
}

export function sectionTitle(title, { iconName, iconClass = "c-yellow", subtitle, action } = {}) {
  return h(
    "div",
    { class: "section-title" },
    iconName
      ? h("span", { class: `section-icon ${iconClass}` }, icon(iconName, { size: 26, className: "filled" }))
      : null,
    h("div", { class: "section-title-text" }, h("h2", {}, title), subtitle ? h("p", {}, subtitle) : null),
    action ?? null,
  );
}

export function seeAll(href, label = "Ver todos") {
  return h("a", { class: "see-all", href }, label, icon("arrow-right", { size: 18 }));
}

/** Rabisco amarelo ao lado dos títulos ("Hoje ⁄⁄"). */
export function doodle() {
  return h("span", { class: "doodle", "aria-hidden": "true" }, h("i"), h("i"), h("i"));
}

// ---------- Etiquetas ----------

export function tag(text, tone = "gray", iconName = null) {
  return h("span", { class: `tag tone-${tone}` }, iconName ? icon(iconName, { size: 15 }) : null, text);
}

export function categoryTag(event) {
  const cat = categoryOf(event.category);
  return tag(cat.label, cat.tone);
}

export function ageTag(event) {
  return tag(formatAgeShort(event), "blue");
}

export function settingTag(event) {
  if (event.setting === "outdoor") return tag("Ao ar livre", "green");
  if (event.setting === "indoor") return tag("Lugar coberto", "purple");
  if (event.setting === "misto") return tag("Coberto e ao ar livre", "purple");
  return null;
}

export function priceTag(event) {
  if (event.is_free) return tag("Grátis", "sky");
  return null;
}

// ---------- Imagem do evento ----------

/** Foto do evento (da página de origem) ou, sem foto, uma arte com o ícone da categoria. */
export function eventImage(event, { className = "" } = {}) {
  const cat = categoryOf(event.category);
  const fallback = () =>
    h(
      "div",
      { class: `event-art tone-${cat.tone} ${className}`.trim() },
      icon(cat.icon, { size: 40, strokeWidth: 1.6 }),
    );
  if (!event.image) return fallback();
  const img = h("img", {
    class: `event-photo ${className}`.trim(),
    src: event.image,
    alt: "",
    loading: "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
  });
  img.addEventListener("error", () => img.replaceWith(fallback()), { once: true });
  return img;
}

export function heartButton(app, event, { className = "" } = {}) {
  const button = h("button", {
    class: `heart ${isFavorite(event.id) ? "on" : ""} ${className}`.trim(),
    type: "button",
    "aria-label": "Salvar nos favoritos",
    "aria-pressed": String(isFavorite(event.id)),
  });
  button.append(icon("heart", { size: 20 }));
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = toggleFavorite(event, app.today);
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
    app.toast(on ? "Salvo nos favoritos ❤" : "Removido dos favoritos");
  });
  return button;
}

// ---------- Cartões ----------

/** Cartão vertical (como "Pertinho de vocês"). */
export function eventTile(app, event, { highlight = false } = {}) {
  const distance = app.distanceTo(event);
  return h(
    "a",
    { class: `tile ${highlight ? "highlight" : ""}`, href: `#/evento/${event.id}`, dataset: { id: event.id } },
    h(
      "div",
      { class: "tile-media" },
      eventImage(event),
      distance != null ? h("span", { class: "chip-float" }, icon("pin", { size: 15 }), formatKm(distance)) : null,
      heartButton(app, event, { className: "on-photo" }),
    ),
    h(
      "div",
      { class: "tile-body" },
      sponsoredTag(event),
      h("h3", {}, event.title),
      event.description ? h("p", { class: "tile-desc" }, event.description) : null,
      h("p", { class: "meta-line" }, icon("calendar", { size: 17, className: "c-red" }), formatWhen(event, app.today)),
      h(
        "p",
        { class: "meta-line" },
        icon("pin", { size: 17, className: "c-red" }),
        distance != null ? `${event.neighborhood ?? event.venue} · ${formatKm(distance)}` : event.venue,
      ),
      h("div", { class: "tags" }, settingTag(event) ?? categoryTag(event), priceTag(event) ?? ageTag(event)),
    ),
  );
}

const BAR_TONES = {
  pink: "#d83d83",
  red: "#ef4f5b",
  purple: "#8b6cf6",
  indigo: "#5b6cf0",
  yellow: "#f6b93b",
  blue: "#3b82f6",
  green: "#2fb07a",
  orange: "#f59e42",
  teal: "#14b8a6",
  gray: "#9aa0b4",
  sky: "#3b82f6",
};

/** Linha horizontal (como na "Minha Agenda"): foto, horário, faixa colorida, título, local e etiquetas. */
export function eventRow(app, event, { side = null } = {}) {
  const cat = categoryOf(event.category);
  const distance = app.distanceTo(event);
  const { start, end } = parseTimes(event.schedule);
  const place = [event.neighborhood, distance != null ? formatKm(distance) : null].filter(Boolean).join(" · ");
  return h(
    "article",
    { class: "row-card", dataset: { id: event.id } },
    h("div", { class: "row-media" }, eventImage(event), heartButton(app, event, { className: "on-photo small" })),
    h(
      "div",
      { class: "row-time" },
      h("strong", {}, start ?? "Dia"),
      start ? (end ? h("span", {}, `às ${end}`) : null) : h("span", {}, "todo"),
    ),
    h("span", { class: "row-bar", style: { background: BAR_TONES[cat.tone] } }),
    h(
      "div",
      { class: "row-body" },
      h("h3", {}, h("a", { class: "row-link", href: `#/evento/${event.id}` }, event.title)),
      h(
        "div",
        { class: "row-main" },
        h(
          "div",
          { class: "row-info" },
          h(
            "div",
            { class: "row-place" },
            icon("pin", { size: 18, className: "c-red filled-soft" }),
            h("div", {}, h("span", {}, event.venue), place ? h("small", {}, place) : null),
          ),
          h("div", { class: "tags" }, sponsoredTag(event), categoryTag(event), ageTag(event)),
        ),
        side ? h("div", { class: "row-side" }, side) : null,
      ),
    ),
  );
}

export function statusBadge(item) {
  if (item.status === "confirmado")
    return h(
      "span",
      { class: "status tone-green" },
      icon("check-circle", { size: 18, className: "filled-green" }),
      "Confirmado",
    );
  if (item.reminder) return h("span", { class: "status tone-blue" }, icon("bell", { size: 18 }), "Lembrete ativado");
  return h(
    "span",
    { class: "status tone-green" },
    icon("check-circle", { size: 18, className: "filled-green" }),
    "Salvo",
  );
}

// ---------- Blocos ilustrados ----------

export function suggestionCard(app, suggestion) {
  if (!suggestion) return null;
  return h(
    "section",
    { class: "ai-card" },
    asset("robot-wink", { className: "ai-robot", alt: "" }),
    h(
      "div",
      { class: "ai-text" },
      h("span", { class: "ai-chip" }, icon("sparkles", { size: 16 }), "Sugestão da IA"),
      h("p", { class: "ai-main" }, suggestion.text),
      suggestion.tagline ? h("p", { class: "ai-tagline" }, suggestion.tagline, " 💛") : null,
    ),
    h(
      "div",
      { class: "ai-side" },
      asset("glasshouse", { className: "ai-illus", alt: "" }),
      h(
        "button",
        { class: "btn btn-outline-blue", type: "button", onclick: () => app.sheets.suggestion(suggestion) },
        "Ver sugestão",
      ),
    ),
  );
}

export function promoBanner(app) {
  return h(
    "section",
    { class: "promo" },
    asset("family-small", { className: "promo-illus", alt: "" }),
    h("p", { class: "promo-title" }, "Pequenos planos, grandes descobertas ", h("span", { class: "c-red" }, "♥")),
    h(
      "p",
      { class: "promo-text" },
      `Organize hoje os próximos rolês da sua família e viva mais momentos incríveis em ${app.city?.name ?? "sua cidade"}.`,
    ),
    h("a", { class: "btn btn-yellow", href: "#/inicio" }, "Criar novo plano", icon("arrow-right", { size: 18 })),
  );
}

/** Etiqueta "Patrocinado" (sempre visível nos rolês pagos). */
export function sponsoredTag(event) {
  return event.sponsored ? h("span", { class: "sponsored-tag" }, "Patrocinado") : null;
}

/** Cartão do destaque patrocinado no Início (conta uma visualização por sessão). */
export function sponsoredCard(app, event) {
  if (!event) return null;
  track("impression", event.id);
  return h(
    "a",
    { class: "sponsored-card card", href: `#/evento/${event.id}` },
    h("div", { class: "sponsored-media" }, eventImage(event), h("span", { class: "sponsored-label" }, "Patrocinado")),
    h(
      "div",
      { class: "sponsored-body" },
      h("small", { class: "eyebrow" }, event.sponsored?.sponsor ? `Destaque · ${event.sponsored.sponsor}` : "Destaque"),
      h("h3", {}, event.title),
      h("p", { class: "meta-line" }, icon("calendar", { size: 17, className: "c-red" }), formatWhen(event, app.today)),
      h("p", { class: "meta-line" }, icon("pin", { size: 17, className: "c-red" }), event.neighborhood ?? event.venue),
      h("div", { class: "tags" }, ageTag(event), priceTag(event)),
    ),
  );
}

export function emptyState({ title, text, illustration = "family-big", action = null }) {
  return h(
    "div",
    { class: "empty" },
    asset(illustration, { className: "empty-illus", alt: "" }),
    h("h3", {}, title),
    h("p", {}, text),
    action,
  );
}

export function pageFooter(app) {
  const updated = app.generatedAt ? new Date(app.generatedAt) : null;
  return h(
    "footer",
    { class: "page-footer" },
    updated
      ? h(
          "p",
          {},
          `Programação atualizada em ${updated.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${updated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`,
        )
      : null,
    h(
      "p",
      {},
      "As informações são reunidas automaticamente por inteligência artificial a partir de sites públicos e podem conter erros. Confirme na fonte antes de sair de casa.",
    ),
    h(
      "p",
      { class: "footer-links" },
      h("a", { href: "#/anuncie" }, "Anuncie aqui"),
      " · ",
      h("a", { href: "#/privacidade" }, "Privacidade"),
    ),
  );
}
