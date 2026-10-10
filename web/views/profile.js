import { interestOf } from "../lib/categories.js";
import { asset, h, icon } from "../lib/dom.js";
import { BUDGET_OPTIONS, DAYS_OPTIONS, activeKid, save, savedThisMonth, store } from "../lib/store.js";
import { ageLabel, eventImage, kidAvatar, logo, sectionTitle, seeAll } from "../ui/components.js";
import { radiusLabel } from "../ui/sheets.js";

function kidNoun(kid) {
  return kid.gender === "m" ? "filho" : kid.gender === "x" ? "criança" : "filha";
}

function kidEyebrow(kid) {
  return kid.gender === "m" ? "Meu filho" : kid.gender === "x" ? "Minha criança" : "Minha filha";
}

/** "da Maitê" / "do Theo" */
function ofKid(kid) {
  return `${kid.gender === "m" ? "do" : "da"} ${kid.name || kidNoun(kid)}`;
}

function parentAvatar() {
  const p = store.parent;
  return p.photo
    ? h("img", { class: "avatar avatar-xl", src: p.photo, alt: "" })
    : h("span", { class: "avatar avatar-xl avatar-initial" }, (p.name || "?").charAt(0).toUpperCase());
}

function prefCard({ iconName, tone, title, value, hint, illustration, onclick }) {
  return h(
    "button",
    { type: "button", class: "pref-card card", onclick },
    h("span", { class: `pref-icon tone-${tone}` }, icon(iconName, { size: 24, className: "filled-soft" })),
    h(
      "span",
      { class: "pref-text" },
      h("strong", {}, title),
      h("span", { class: "pref-value" }, value, icon("next", { size: 18 })),
      hint ? h("small", {}, hint) : null,
    ),
    asset(illustration, { className: `pref-illus pref-illus-${illustration}`, alt: "" }),
  );
}

function toggleRow({ iconName, tone, title, badge, hint, key, app }) {
  const input = h("input", {
    type: "checkbox",
    role: "switch",
    checked: store.alerts[key],
    onchange: (e) => {
      store.alerts[key] = e.target.checked;
      save();
      app.toast(e.target.checked ? "Ativado" : "Desativado");
    },
  });
  return h(
    "label",
    { class: "toggle-row" },
    h("span", { class: `toggle-icon c-${tone}` }, icon(iconName, { size: 26, className: "filled-soft" })),
    h(
      "span",
      { class: "toggle-text" },
      h("strong", {}, title, badge ? h("span", { class: "badge-yellow" }, badge) : null),
      h("small", {}, hint),
    ),
    h("span", { class: "switch" }, input, h("span", { class: "slider" })),
  );
}

function historyTile(app, { event, label }) {
  return h(
    "a",
    { class: "mini-tile card", href: `#/evento/${event.id}` },
    h(
      "div",
      { class: "mini-media" },
      eventImage(event),
      h("span", { class: "heart on on-photo small static" }, icon("heart", { size: 18 })),
    ),
    h("div", { class: "mini-body" }, h("strong", {}, event.title), h("small", {}, label)),
  );
}

export function renderProfile(app) {
  const kid = activeKid();
  const parent = store.parent;
  const interests = kid.interests.map(interestOf).filter(Boolean);
  const days = DAYS_OPTIONS.find((d) => d.id === store.days) ?? DAYS_OPTIONS[0];
  const budget = BUDGET_OPTIONS.find((b) => b.id === store.budget) ?? BUDGET_OPTIONS.at(-1);
  const saved = savedThisMonth(app.today);

  const dateLabel = (iso) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
  const history = [
    ...Object.values(store.favorites).map((f) => ({
      event: f.event,
      when: f.saved_at,
      label: `Salvo em ${dateLabel(f.saved_at)}`,
    })),
    ...store.agenda
      .filter((item) => item.date < app.today)
      .map((item) => ({ event: item.event, when: item.date, label: `Visitado em ${dateLabel(item.date)}` })),
  ]
    .sort((a, b) => b.when.localeCompare(a.when))
    .filter((entry, i, all) => all.findIndex((x) => x.event.id === entry.event.id) === i)
    .slice(0, 6);

  return h(
    "div",
    { class: "page page-profile" },
    h(
      "header",
      { class: "profile-top" },
      logo(),
      h(
        "div",
        { class: "profile-note" },
        asset("sun-doodle", { className: "sun", alt: "" }),
        asset("note-infancias", { className: "note", alt: "Infâncias mais felizes todos os dias" }),
      ),
    ),
    h(
      "section",
      { class: "parent-card" },
      h(
        "div",
        { class: "photo-wrap" },
        parentAvatar(),
        h(
          "button",
          { type: "button", class: "camera", "aria-label": "Trocar foto", onclick: () => app.sheets.editParent() },
          icon("camera", { size: 18 }),
        ),
      ),
      h(
        "div",
        { class: "parent-text" },
        h("span", { class: "eyebrow" }, "Meu perfil"),
        h("h1", {}, parent.name || "Seu nome"),
        h("p", { class: "relation" }, `${parent.relation} ${ofKid(kid)} `, h("span", { class: "c-red" }, "♥")),
        h("p", { class: "bio" }, parent.bio || "Explorando um mundo mais divertido para nossa família."),
      ),
      h(
        "button",
        { type: "button", class: "btn btn-soft", onclick: () => app.sheets.editParent() },
        icon("pencil", { size: 18 }),
        "Editar perfil",
        icon("next", { size: 18 }),
      ),
    ),
    h(
      "section",
      { class: "kid-card" },
      h(
        "div",
        { class: "photo-wrap" },
        h("span", { class: "crown" }, icon("crown", { size: 30, className: "filled-yellow" })),
        kidAvatar(kid, { size: "xl" }),
        h(
          "button",
          { type: "button", class: "camera", "aria-label": "Trocar foto", onclick: () => app.sheets.editKid(kid.id) },
          icon("camera", { size: 18 }),
        ),
      ),
      h(
        "div",
        { class: "kid-text" },
        h("span", { class: "eyebrow" }, kidEyebrow(kid)),
        h("h2", {}, kid.name || "Nome", " • ", ageLabel(kid.age)),
        h("p", {}, kid.bio || "Curiosa, criativa e ama aventuras!"),
        h(
          "div",
          { class: "tags" },
          interests.slice(0, 4).map((i) => h("span", { class: `tag tone-${i.tone}` }, i.label)),
        ),
      ),
      h(
        "div",
        { class: "kid-side" },
        h(
          "button",
          { type: "button", class: "btn btn-white", onclick: () => app.sheets.editKid(kid.id) },
          icon("pencil", { size: 18 }),
          "Editar",
          icon("next", { size: 18 }),
        ),
        asset("note-aventuras", { className: "kid-note", alt: "Grandes aventuras começam pequenas" }),
      ),
    ),
    h(
      "div",
      { class: "kid-switch" },
      store.kids.length > 1
        ? h("button", { type: "button", class: "link", onclick: () => app.sheets.kids() }, "Trocar criança")
        : null,
      h(
        "button",
        { type: "button", class: "link", onclick: () => app.sheets.editKid(null) },
        icon("plus", { size: 16 }),
        "Adicionar outra criança",
      ),
    ),
    sectionTitle("Minhas preferências", {
      iconName: "sun",
      subtitle: "Personalize para receber as melhores recomendações",
    }),
    h(
      "div",
      { class: "pref-grid" },
      prefCard({
        iconName: "pin",
        tone: "red",
        title: "Cidade",
        value: app.city?.name ?? "",
        hint: app.city?.state,
        illustration: "pref-city",
        onclick: () => app.sheets.city(),
      }),
      prefCard({
        iconName: "target",
        tone: "green",
        title: "Raio de busca",
        value: radiusLabel(store.radiusKm),
        hint: "Rolês pertinho de vocês",
        illustration: "pref-radius",
        onclick: () => app.sheets.radius(),
      }),
      prefCard({
        iconName: "users",
        tone: "yellow",
        title: "Idade das crianças",
        value: store.kids.map((k) => ageLabel(k.age)).join(", "),
        hint: "Eventos ideais para a idade",
        illustration: "pref-kids",
        onclick: () => (store.kids.length > 1 ? app.sheets.kids() : app.sheets.editKid(kid.id)),
      }),
      prefCard({
        iconName: "heart",
        tone: "red",
        title: kid.name ? `Interesses ${ofKid(kid)}` : "Interesses",
        value: `${interests.length} selecionados`,
        hint: interests.map((i) => i.label).join(", "),
        illustration: "pref-palette",
        onclick: () => app.sheets.interests(),
      }),
      prefCard({
        iconName: "tag",
        tone: "green",
        title: "Faixa de preço",
        value: budget.label,
        hint: budget.hint,
        illustration: "pref-coins",
        onclick: () => app.sheets.budget(),
      }),
      prefCard({
        iconName: "calendar",
        tone: "pink",
        title: "Dias e horários",
        value: days.label,
        hint: days.hint,
        illustration: "pref-calendar",
        onclick: () => app.sheets.days(),
      }),
    ),
    sectionTitle("Notificações e alertas", { iconName: "bell", subtitle: "Escolha o que aparece em destaque no app" }),
    h(
      "section",
      { class: "card toggles" },
      toggleRow({
        app,
        key: "ai",
        iconName: "sparkles",
        tone: "yellow",
        title: "Atualizações por IA",
        badge: "Recomendado",
        hint: `Sugestões personalizadas para ${kid.name || "a criança"} e novidades da semana`,
      }),
      toggleRow({
        app,
        key: "free",
        iconName: "gift",
        tone: "red",
        title: "Eventos grátis",
        hint: `Destacar rolês gratuitos em ${app.city?.name ?? "sua cidade"}`,
      }),
      toggleRow({
        app,
        key: "rain",
        iconName: "umbrella",
        tone: "blue",
        title: "Chuva? sugerir opção indoor",
        hint: "Em dias de chuva, mostrar alternativas em ambientes fechados",
      }),
    ),
    h(
      "section",
      { class: "achievements" },
      h("span", { class: "ach-star c-yellow" }, icon("star", { size: 40, className: "filled" })),
      h(
        "div",
        { class: "ach-text" },
        h("strong", {}, "Minhas conquistas"),
        h(
          "p",
          { class: "ach-big" },
          saved
            ? [
                "Você salvou ",
                h("span", { class: "c-red" }, String(saved)),
                saved === 1 ? " rolê este mês!" : " rolês este mês!",
              ]
            : "Salve seu primeiro rolê do mês!",
        ),
        h("small", {}, "Mais tempo de qualidade, mais memórias incríveis ", h("span", { class: "c-red" }, "♥")),
      ),
      asset("family-big", { className: "ach-illus", alt: "" }),
      asset("note-historias", { className: "ach-note", alt: "Aqui também moram boas histórias" }),
    ),
    sectionTitle("Meus favoritos e histórico", {
      iconName: "heart",
      iconClass: "c-red",
      subtitle: "Seus rolês salvos e que você já participou",
      action: seeAll("#/favoritos"),
    }),
    history.length
      ? h(
          "div",
          { class: "mini-scroll" },
          history.map((entry) => historyTile(app, entry)),
        )
      : h("p", { class: "muted empty-inline" }, "Toque no ♥ de um rolê para guardar aqui."),
  );
}
