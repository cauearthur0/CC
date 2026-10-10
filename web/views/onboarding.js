import { MAIN_INTERESTS } from "../lib/categories.js";
import { asset, h, icon } from "../lib/dom.js";
import { BUDGET_OPTIONS, DAYS_OPTIONS, RADIUS_OPTIONS, RELATIONS, activeKid, save, store } from "../lib/store.js";
import { ageLabel, kidAvatar, logo } from "../ui/components.js";
import { interestPicker, radiusLabel } from "../ui/sheets.js";

let step = 1;

function stepper(current) {
  const steps = [
    ["Passo 1", "Sua conta"],
    ["Passo 2", "Personalização"],
    ["Passo 3", "Tudo pronto!"],
  ];
  return h(
    "ol",
    { class: "steps" },
    steps.map(([title, sub], i) => {
      const n = i + 1;
      const state = n < current ? "done" : n === current ? "current" : "next";
      return h(
        "li",
        { class: `step ${state}` },
        h("span", { class: "step-dot" }, state === "done" ? icon("check", { size: 18, strokeWidth: 3 }) : String(n)),
        h("strong", {}, title),
        h("small", {}, sub),
      );
    }),
  );
}

function select(options, value, onChange, { iconName = null } = {}) {
  return h(
    "div",
    { class: "select-wrap" },
    iconName ? icon(iconName, { size: 22, className: "c-red filled-soft" }) : null,
    h(
      "select",
      { onchange: (e) => onChange(e.target.value) },
      options.map((o) => h("option", { value: o.value, selected: String(o.value) === String(value) }, o.label)),
    ),
    icon("down", { size: 20 }),
  );
}

function header() {
  return h(
    "header",
    { class: "onb-top" },
    logo({ tagline: true }),
    h(
      "div",
      { class: "onb-hero" },
      h("h1", {}, "Vamos personalizar sua experiência?"),
      h("p", {}, "Conte um pouco sobre sua família para descobrirmos os melhores rolês para vocês."),
    ),
    asset("girl-hero", { className: "onb-girl", alt: "" }),
  );
}

function stepAccount(app) {
  const parent = store.parent;
  return [
    h(
      "section",
      { class: "onb-card tone-blue-soft" },
      h("h2", { class: "onb-card-title" }, icon("user", { size: 26, className: "c-blue filled-soft" }), "Sobre você"),
      h(
        "label",
        { class: "field" },
        h("span", { class: "field-label" }, "Como podemos te chamar?"),
        h("input", {
          type: "text",
          value: parent.name,
          maxlength: 40,
          placeholder: "Seu nome",
          oninput: (e) => (parent.name = e.target.value),
        }),
      ),
      h(
        "label",
        { class: "field" },
        h("span", { class: "field-label" }, "Você é"),
        select(
          RELATIONS.map((r) => ({ value: r, label: r })),
          parent.relation,
          (v) => (parent.relation = v),
        ),
      ),
      h("p", { class: "muted small-note" }, "Sem cadastro e sem senha: tudo fica salvo só neste celular."),
    ),
    h(
      "div",
      { class: "onb-actions" },
      h(
        "button",
        {
          type: "button",
          class: "btn btn-yellow big",
          onclick: () => {
            save();
            step = 2;
            app.rerender({ keepScroll: false });
          },
        },
        "Continuar",
        icon("arrow-right", { size: 22 }),
      ),
    ),
  ];
}

function stepPersonalize(app) {
  const kid = activeKid();
  const finish = () => {
    store.activeKid = kid.id;
    save();
    step = 3;
    app.rerender({ keepScroll: false });
  };
  return [
    h(
      "section",
      { class: "onb-card tone-pink-soft" },
      h(
        "h2",
        { class: "onb-card-title" },
        icon("star", { size: 30, className: "c-yellow filled" }),
        "Perfil da criança",
      ),
      asset("note-crianca", { className: "onb-note", alt: "Cada criança vive o mundo de um jeito único" }),
      h(
        "div",
        { class: "kid-form" },
        h(
          "div",
          { class: "kid-photo" },
          kidAvatar(kid, { size: "xxl" }),
          h(
            "button",
            { type: "button", class: "btn btn-white small", onclick: () => app.sheets.editKid(kid.id) },
            icon("camera", { size: 18 }),
            "Trocar avatar",
          ),
        ),
        h(
          "div",
          { class: "kid-fields" },
          h(
            "label",
            { class: "field" },
            h("span", { class: "field-label" }, "Nome da criança"),
            h(
              "div",
              { class: "input-clear" },
              h("input", {
                type: "text",
                value: kid.name,
                maxlength: 40,
                placeholder: "Nome",
                oninput: (e) => (kid.name = e.target.value),
              }),
            ),
          ),
          h(
            "div",
            { class: "field-row" },
            h(
              "label",
              { class: "field" },
              h("span", { class: "field-label" }, "Idade"),
              select(
                Array.from({ length: 15 }, (_, a) => ({ value: a, label: ageLabel(a) })),
                kid.age,
                (v) => (kid.age = Number(v)),
              ),
            ),
            h(
              "label",
              { class: "field" },
              h("span", { class: "field-label" }, "Cidade"),
              select(
                app.cities.map((c) => ({ value: c.slug, label: c.name })),
                store.city,
                (v) => app.setCity(v),
                { iconName: "pin" },
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      "section",
      { class: "onb-card tone-yellow-soft" },
      h(
        "h2",
        { class: "onb-card-title" },
        icon("heart", { size: 30, className: "c-red filled" }),
        `O que ${kid.gender === "m" ? "ele" : "ela"} mais gosta?`,
      ),
      h(
        "p",
        { class: "onb-card-sub" },
        `Selecione os temas que mais despertam o interesse ${kid.gender === "m" ? "dele" : "dela"}.`,
      ),
      interestPicker(kid.interests, (list) => (kid.interests = list), MAIN_INTERESTS),
    ),
    h(
      "section",
      { class: "onb-ai" },
      asset("robot-wink", { className: "onb-robot", alt: "" }),
      h(
        "div",
        { class: "bubble" },
        h("strong", {}, "A IA vai adaptar sua agenda conforme idade, clima e distância."),
        h("p", {}, "Mais tempo para o que realmente importa: viver bons momentos juntos!"),
      ),
      h("span", { class: "rays right", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
    ),
    h(
      "section",
      { class: "onb-card card prefs3" },
      h(
        "h2",
        { class: "onb-card-title" },
        icon("pin", { size: 30, className: "c-red filled-soft" }),
        "Suas preferências",
      ),
      h(
        "div",
        { class: "prefs3-grid" },
        h(
          "div",
          { class: "pref3" },
          h("span", { class: "pref3-label" }, icon("pin", { size: 22, className: "c-green" }), "Distância ideal"),
          select(
            RADIUS_OPTIONS.map((km) => ({ value: km, label: radiusLabel(km) })),
            store.radiusKm,
            (v) => (store.radiusKm = Number(v)),
          ),
          h("small", {}, `Rolês pertinho de você em ${app.city?.name ?? "sua cidade"}.`),
        ),
        h(
          "div",
          { class: "pref3" },
          h("span", { class: "pref3-label" }, icon("calendar", { size: 22, className: "c-blue" }), "Dias preferidos"),
          select(
            DAYS_OPTIONS.map((d) => ({ value: d.id, label: d.label })),
            store.days,
            (v) => {
              store.days = v;
              store.filters.when = v === "fins-de-semana" ? "fim-de-semana" : "7-dias";
            },
          ),
          h("small", {}, "Podemos priorizar esses dias na sua agenda."),
        ),
        h(
          "div",
          { class: "pref3" },
          h("span", { class: "pref3-label" }, icon("coins", { size: 22, className: "c-yellow" }), "Faixa de orçamento"),
          select(
            BUDGET_OPTIONS.map((b) => ({ value: b.id, label: b.label })),
            store.budget,
            (v) => (store.budget = v),
          ),
          h("small", {}, "Mostraremos opções gratuitas e pagas."),
        ),
      ),
    ),
    h(
      "div",
      { class: "onb-actions" },
      h("span", { class: "rays left", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h(
        "button",
        { type: "button", class: "btn btn-yellow big wide", onclick: finish },
        "Montar minha agenda",
        icon("arrow-right", { size: 24 }),
      ),
      h("span", { class: "rays right", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h("button", { type: "button", class: "btn btn-white wide", onclick: finish }, "Posso ajustar depois"),
    ),
  ];
}

function stepDone(app) {
  const kid = activeKid();
  return [
    h(
      "section",
      { class: "onb-card tone-green-soft done-card" },
      asset("family-big", { className: "done-illus", alt: "" }),
      h("h2", {}, "Tudo pronto! 🎉"),
      h(
        "p",
        {},
        `Separamos os melhores rolês de ${app.city?.name ?? "sua cidade"} para ${kid.name || "a criança"}. Toque no ♥ para salvar e em “Adicionar à agenda” para organizar o fim de semana.`,
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn btn-yellow big wide",
          onclick: () => {
            store.onboarded = true;
            save();
            step = 1;
            app.navigate("#/inicio");
          },
        },
        "Ver os rolês",
        icon("arrow-right", { size: 22 }),
      ),
    ),
  ];
}

export function renderOnboarding(app) {
  if (store.onboarded && step === 1) step = 2;
  const body = step === 1 ? stepAccount(app) : step === 2 ? stepPersonalize(app) : stepDone(app);
  return h(
    "div",
    { class: "page page-onboarding" },
    header(),
    stepper(step),
    body,
    asset("skyline-bottom", { className: "onb-skyline", alt: "" }),
    h(
      "p",
      { class: "onb-sign left" },
      app.city?.name ?? "Sua cidade",
      h("br"),
      "mais divertida",
      h("br"),
      "em família ",
      h("span", { class: "c-red" }, "♥"),
    ),
    h(
      "p",
      { class: "onb-sign right" },
      "Pequenos",
      h("br"),
      "rolês,",
      h("br"),
      "grandes",
      h("br"),
      "memórias ",
      h("span", { class: "c-red" }, "♥"),
    ),
  );
}
