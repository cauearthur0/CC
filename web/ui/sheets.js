import { CATEGORIES, INTERESTS } from "../lib/categories.js";
import { deleteMyData, family, formatCode, joinFamily, leaveFamily, pushStatus } from "../lib/cloud.js";
import { addDays } from "../lib/dates.js";
import { h, icon, openSheet } from "../lib/dom.js";
import { formatAgeShort, formatShortDay } from "../lib/format.js";
import { buildIcs } from "../lib/ics.js";
import { WHEN_OPTIONS } from "../lib/filters.js";
import {
  BUDGET_OPTIONS,
  DAYS_OPTIONS,
  RADIUS_OPTIONS,
  RELATIONS,
  activeKid,
  addToAgenda,
  newKid,
  removeAgendaItem,
  save,
  store,
  updateAgendaItem,
} from "../lib/store.js";
import { ageLabel, eventTile, kidAvatar } from "./components.js";

const MAX_AGE = 14;

function optionList(options, { selected, onSelect }) {
  return h(
    "div",
    { class: "option-list", role: "listbox" },
    options.map((opt) =>
      h(
        "button",
        {
          type: "button",
          class: `option ${opt.id === selected ? "selected" : ""}`,
          role: "option",
          "aria-selected": String(opt.id === selected),
          onclick: () => onSelect(opt.id),
        },
        h("span", {}, h("strong", {}, opt.label), opt.hint ? h("small", {}, opt.hint) : null),
        opt.id === selected ? icon("check", { size: 20, className: "c-blue" }) : null,
      ),
    ),
  );
}

export function radiusLabel(km) {
  return km ? `Até ${km} km` : "Qualquer distância";
}

/** Reduz a foto escolhida para 320px e devolve como data URL (fica só no aparelho). */
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.onload = () => {
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const hgt = img.height * scale;
        canvas.getContext("2d").drawImage(img, (size - w) / 2, (size - hgt) / 2, w, hgt);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function photoPicker(current, onChange, { fallback }) {
  const input = h("input", { type: "file", accept: "image/*", class: "visually-hidden" });
  const preview = h("div", { class: "photo-preview" }, current ? h("img", { src: current, alt: "" }) : fallback());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const dataUrl = await readPhoto(file);
    preview.replaceChildren(h("img", { src: dataUrl, alt: "" }));
    onChange(dataUrl);
  });
  return h(
    "div",
    { class: "photo-picker" },
    preview,
    h("label", { class: "btn btn-white small" }, icon("camera", { size: 18 }), "Trocar foto", input),
    current
      ? h(
          "button",
          {
            type: "button",
            class: "link",
            onclick: () => {
              onChange(null);
              preview.replaceChildren(fallback());
            },
          },
          "Remover foto",
        )
      : null,
  );
}

function stepper(value, onChange) {
  const out = h("output", {}, ageLabel(value));
  let current = value;
  const set = (v) => {
    current = Math.max(0, Math.min(MAX_AGE, v));
    out.textContent = ageLabel(current);
    onChange(current);
  };
  return h(
    "div",
    { class: "stepper" },
    h(
      "button",
      { type: "button", class: "round", "aria-label": "Diminuir idade", onclick: () => set(current - 1) },
      "−",
    ),
    out,
    h(
      "button",
      { type: "button", class: "round", "aria-label": "Aumentar idade", onclick: () => set(current + 1) },
      "+",
    ),
  );
}

export function interestPicker(selected, onChange, list = INTERESTS) {
  const chosen = new Set(selected);
  return h(
    "div",
    { class: "interest-grid" },
    list.map((interest) => {
      const button = h(
        "button",
        {
          type: "button",
          class: `interest tone-${interest.tone} ${chosen.has(interest.id) ? "on" : ""}`,
          "aria-pressed": String(chosen.has(interest.id)),
        },
        h("span", { class: "interest-icon" }, icon(interest.icon, { size: 26, strokeWidth: 2 })),
        h("span", { class: "interest-label" }, interest.label),
        h("span", { class: "interest-check" }, icon("check", { size: 14, strokeWidth: 3 })),
      );
      button.addEventListener("click", () => {
        if (chosen.has(interest.id)) chosen.delete(interest.id);
        else chosen.add(interest.id);
        button.classList.toggle("on", chosen.has(interest.id));
        button.setAttribute("aria-pressed", String(chosen.has(interest.id)));
        onChange([...chosen]);
      });
      return button;
    }),
  );
}

function field(label, control, hint = null) {
  return h(
    "label",
    { class: "field" },
    h("span", { class: "field-label" }, label),
    control,
    hint ? h("small", {}, hint) : null,
  );
}

export function createSheets(app) {
  const sheets = {
    city() {
      const { close } = openSheet({
        title: "Escolha a cidade",
        subtitle: "Mostramos os rolês da cidade escolhida.",
        content: optionList(
          app.cities.map((c) => ({ id: c.slug, label: c.name, hint: c.state })),
          {
            selected: store.city,
            onSelect: async (slug) => {
              close();
              await app.setCity(slug);
            },
          },
        ),
      });
    },

    kids() {
      const kid = activeKid();
      const content = h(
        "div",
        { class: "kid-list" },
        store.kids.map((k) =>
          h(
            "button",
            {
              type: "button",
              class: `kid-option ${k.id === kid.id ? "selected" : ""}`,
              onclick: () => {
                store.activeKid = k.id;
                save();
                close();
                app.rerender();
              },
            },
            kidAvatar(k, { size: "md" }),
            h("span", {}, h("strong", {}, k.name || "Criança"), h("small", {}, ageLabel(k.age))),
            k.id === kid.id ? icon("check", { size: 20, className: "c-blue" }) : null,
          ),
        ),
        h(
          "div",
          { class: "sheet-actions" },
          h(
            "button",
            {
              type: "button",
              class: "btn btn-white",
              onclick: () => {
                close();
                sheets.editKid(kid.id);
              },
            },
            icon("pencil", { size: 18 }),
            `Editar ${kid.name || "criança"}`,
          ),
          h(
            "button",
            {
              type: "button",
              class: "btn btn-white",
              onclick: () => {
                close();
                sheets.editKid(null);
              },
            },
            icon("plus", { size: 18 }),
            "Adicionar criança",
          ),
        ),
      );
      const { close } = openSheet({
        title: "Para quem é o rolê?",
        subtitle: "Os eventos são filtrados pela idade.",
        content,
      });
    },

    editKid(kidId) {
      const original = store.kids.find((k) => k.id === kidId);
      const draft = original ? structuredClone(original) : newKid({ name: "" });
      const content = h(
        "div",
        { class: "form" },
        photoPicker(draft.photo, (photo) => (draft.photo = photo), {
          fallback: () => kidAvatar({ photo: null }, { size: "xl" }),
        }),
        field(
          "Nome",
          h("input", {
            type: "text",
            value: draft.name,
            maxlength: 40,
            placeholder: "Nome da criança",
            oninput: (e) => (draft.name = e.target.value),
          }),
        ),
        field(
          "Idade",
          stepper(draft.age, (v) => (draft.age = v)),
        ),
        field(
          "É",
          h(
            "select",
            { onchange: (e) => (draft.gender = e.target.value) },
            h("option", { value: "f", selected: draft.gender === "f" }, "Menina"),
            h("option", { value: "m", selected: draft.gender === "m" }, "Menino"),
            h("option", { value: "x", selected: draft.gender === "x" }, "Prefiro não dizer"),
          ),
        ),
        field(
          "Uma frase sobre ela/ele",
          h("input", {
            type: "text",
            value: draft.bio,
            maxlength: 80,
            placeholder: "Curiosa, criativa e ama aventuras!",
            oninput: (e) => (draft.bio = e.target.value),
          }),
        ),
        h(
          "div",
          { class: "field" },
          h("span", { class: "field-label" }, "Interesses"),
          interestPicker(draft.interests, (list) => (draft.interests = list)),
        ),
      );
      const footer = h(
        "div",
        { class: "sheet-actions" },
        original && store.kids.length > 1
          ? h(
              "button",
              {
                type: "button",
                class: "btn btn-white danger",
                onclick: () => {
                  store.kids = store.kids.filter((k) => k.id !== original.id);
                  if (store.activeKid === original.id) store.activeKid = store.kids[0].id;
                  save();
                  close();
                  app.rerender();
                },
              },
              icon("trash", { size: 18 }),
              "Remover",
            )
          : null,
        h(
          "button",
          {
            type: "button",
            class: "btn btn-yellow",
            onclick: () => {
              if (original) Object.assign(original, draft);
              else {
                store.kids.push(draft);
                store.activeKid = draft.id;
              }
              save();
              close();
              app.rerender();
            },
          },
          "Salvar",
        ),
      );
      const { close } = openSheet({
        title: original ? `Editar ${original.name || "criança"}` : "Nova criança",
        content,
        footer,
      });
    },

    editParent() {
      const draft = structuredClone(store.parent);
      const content = h(
        "div",
        { class: "form" },
        photoPicker(draft.photo, (photo) => (draft.photo = photo), {
          fallback: () =>
            h("span", { class: "avatar avatar-xl avatar-initial" }, (draft.name || "?").charAt(0).toUpperCase()),
        }),
        field(
          "Seu nome",
          h("input", {
            type: "text",
            value: draft.name,
            maxlength: 40,
            placeholder: "Como podemos te chamar?",
            oninput: (e) => (draft.name = e.target.value),
          }),
        ),
        field(
          "Você é",
          h(
            "select",
            { onchange: (e) => (draft.relation = e.target.value) },
            RELATIONS.map((r) => h("option", { value: r, selected: draft.relation === r }, r)),
          ),
        ),
        field(
          "Uma frase sobre você",
          h("input", {
            type: "text",
            value: draft.bio,
            maxlength: 90,
            placeholder: "Explorando um mundo mais divertido para nossa família.",
            oninput: (e) => (draft.bio = e.target.value),
          }),
        ),
      );
      const footer = h(
        "button",
        {
          type: "button",
          class: "btn btn-yellow",
          onclick: () => {
            Object.assign(store.parent, draft);
            save();
            close();
            app.rerender();
          },
        },
        "Salvar",
      );
      const { close } = openSheet({ title: "Editar perfil", content, footer });
    },

    interests() {
      const kid = activeKid();
      let chosen = kid.interests;
      const footer = h(
        "button",
        {
          type: "button",
          class: "btn btn-yellow",
          onclick: () => {
            kid.interests = chosen;
            save();
            close();
            app.rerender();
          },
        },
        "Salvar",
      );
      const { close } = openSheet({
        title: `Interesses ${kid.name ? `de ${kid.name}` : "da criança"}`,
        subtitle: "Usamos para destacar os rolês que mais combinam.",
        content: interestPicker(kid.interests, (list) => (chosen = list)),
        footer,
      });
    },

    choice({ title, subtitle, options, selected, onSelect }) {
      const { close } = openSheet({
        title,
        subtitle,
        content: optionList(options, {
          selected,
          onSelect: (id) => {
            close();
            onSelect(id);
          },
        }),
      });
    },

    radius() {
      const content = h(
        "div",
        { class: "form" },
        optionList(
          RADIUS_OPTIONS.map((km) => ({ id: String(km), label: radiusLabel(km) })),
          {
            selected: String(store.radiusKm),
            onSelect: (id) => {
              store.radiusKm = Number(id);
              save();
              close();
              app.rerender();
            },
          },
        ),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-white",
            onclick: async () => {
              close();
              await app.locate();
            },
          },
          icon("locate", { size: 18 }),
          store.useGps ? "Atualizar minha localização" : "Usar minha localização",
        ),
        h(
          "small",
          { class: "muted" },
          store.useGps
            ? "Distâncias calculadas a partir de onde você está."
            : `Sem a sua localização, as distâncias são calculadas a partir do centro de ${app.city?.name ?? "da cidade"}.`,
        ),
      );
      const { close } = openSheet({ title: "Raio de busca", subtitle: "Encontrar rolês pertinho de vocês.", content });
    },

    days() {
      sheets.choice({
        title: "Dias e horários",
        subtitle: "Usamos para escolher o período que aparece primeiro.",
        options: DAYS_OPTIONS,
        selected: store.days,
        onSelect: (id) => {
          store.days = id;
          store.filters.when = id === "fins-de-semana" ? "fim-de-semana" : "7-dias";
          save();
          app.rerender();
        },
      });
    },

    budget() {
      sheets.choice({
        title: "Faixa de preço",
        subtitle: "Rolês acima desse valor ficam escondidos.",
        options: BUDGET_OPTIONS,
        selected: store.budget,
        onSelect: (id) => {
          store.budget = id;
          save();
          app.rerender();
        },
      });
    },

    when() {
      sheets.choice({
        title: "Quando?",
        options: WHEN_OPTIONS,
        selected: store.filters.when,
        onSelect: (id) => {
          store.filters.when = id;
          save();
          app.rerender();
        },
      });
    },

    filters() {
      const f = store.filters;
      const draft = { ...f };
      const toggleChip = (label, iconName, key, onValue = true) => {
        const button = h(
          "button",
          { type: "button", class: `fchip ${draft[key] === onValue ? "on tone-red" : ""}` },
          icon(iconName, { size: 18 }),
          label,
        );
        button.addEventListener("click", () => {
          draft[key] = draft[key] === onValue ? (key === "category" ? null : false) : onValue;
          if (key === "outdoor" && draft.outdoor) draft.indoor = false;
          if (key === "indoor" && draft.indoor) draft.outdoor = false;
          refresh();
        });
        return button;
      };
      const body = h("div", { class: "form" });
      const refresh = () => {
        body.replaceChildren(
          h(
            "div",
            { class: "field" },
            h("span", { class: "field-label" }, "Quando"),
            h(
              "div",
              { class: "fchips wrap" },
              WHEN_OPTIONS.map((o) => toggleChip(o.label, "calendar", "when", o.id)),
            ),
          ),
          h(
            "div",
            { class: "field" },
            h("span", { class: "field-label" }, "Tipo de rolê"),
            h(
              "div",
              { class: "fchips wrap" },
              CATEGORIES.filter((c) => c.id !== "outro").map((c) => toggleChip(c.label, c.icon, "category", c.id)),
            ),
          ),
          h(
            "div",
            { class: "field" },
            h("span", { class: "field-label" }, "Mais filtros"),
            h(
              "div",
              { class: "fchips wrap" },
              toggleChip("Grátis", "gift", "free"),
              toggleChip("Ao ar livre", "leaf", "outdoor"),
              toggleChip("Lugar coberto", "home", "indoor"),
              toggleChip(`Só para ${ageLabel(activeKid().age)}`, "users", "byAge"),
            ),
          ),
        );
      };
      refresh();
      const footer = h(
        "div",
        { class: "sheet-actions" },
        h(
          "button",
          {
            type: "button",
            class: "btn btn-white",
            onclick: () => {
              Object.assign(store.filters, { free: false, outdoor: false, indoor: false, category: null, byAge: true });
              save();
              close();
              app.rerender();
            },
          },
          "Limpar",
        ),
        h(
          "button",
          {
            type: "button",
            class: "btn btn-yellow",
            onclick: () => {
              Object.assign(store.filters, draft);
              save();
              close();
              app.rerender();
            },
          },
          "Aplicar filtros",
        ),
      );
      const { close } = openSheet({ title: "Filtros", content: body, footer });
    },

    suggestion(suggestion) {
      const events = suggestion.event_ids.map((id) => app.findEvent(id)).filter(Boolean);
      const content = h(
        "div",
        { class: "form" },
        h("p", { class: "lead" }, suggestion.text),
        suggestion.tagline ? h("p", { class: "muted" }, suggestion.tagline) : null,
        h(
          "div",
          { class: "tile-scroll in-sheet" },
          events.map((e) => eventTile(app, e)),
        ),
      );
      const footer = h(
        "button",
        {
          type: "button",
          class: "btn btn-yellow",
          onclick: () => {
            close();
            sheets.addMany(events);
          },
        },
        icon("calendar-plus", { size: 20 }),
        "Adicionar tudo à agenda",
      );
      const { close } = openSheet({
        title: suggestion.title || "Sugestão da IA",
        subtitle: "Combinação montada pela IA com a agenda da semana.",
        content,
        footer,
      });
    },

    async addMany(events) {
      for (const event of events) await sheets.addToAgenda(event, { quiet: true });
      app.toast("Adicionado à sua agenda 📅");
      app.rerender();
    },

    /** Pergunta o dia quando o evento dura vários dias; senão adiciona direto. */
    addToAgenda(event, { quiet = false } = {}) {
      return new Promise((resolve) => {
        const first = event.start_date > app.today ? event.start_date : app.today;
        const days = [];
        for (let d = first; d <= event.end_date && days.length < 14; d = addDays(d, 1)) days.push(d);
        const finish = (date) => {
          addToAgenda(event, date, app.today);
          if (!quiet) app.toast("Adicionado à sua agenda 📅");
          app.rerender();
          resolve(date);
        };
        if (days.length <= 1) return finish(days[0] ?? event.start_date);
        const { close } = openSheet({
          title: "Qual dia vocês vão?",
          subtitle: event.title,
          content: h(
            "div",
            { class: "day-chips" },
            days.map((d) =>
              h(
                "button",
                {
                  type: "button",
                  class: "day-chip",
                  onclick: () => {
                    close();
                    finish(d);
                  },
                },
                formatShortDay(d),
              ),
            ),
          ),
        });
      });
    },

    agendaItem(item) {
      const event = app.findEvent(item.event_id) ?? item.event;
      const content = h(
        "div",
        { class: "menu-list" },
        h(
          "a",
          { class: "menu-item", href: `#/evento/${item.event_id}`, onclick: () => close() },
          icon("info", { size: 20 }),
          "Ver detalhes",
        ),
        h(
          "button",
          {
            type: "button",
            class: "menu-item",
            onclick: () => {
              updateAgendaItem(item.id, { status: item.status === "confirmado" ? "salvo" : "confirmado" });
              close();
              app.rerender();
            },
          },
          icon("check-circle", { size: 20 }),
          item.status === "confirmado" ? "Desmarcar confirmado" : "Marcar como confirmado (já tenho ingresso)",
        ),
        pushStatus() === "ligado"
          ? h(
              "button",
              {
                type: "button",
                class: "menu-item",
                onclick: () => {
                  updateAgendaItem(item.id, { reminder: !item.reminder });
                  close();
                  app.toast(
                    item.reminder
                      ? "Vamos avisar na véspera, às 18h, e no dia, às 8h 🔔"
                      : "Aviso desligado para este rolê",
                  );
                  app.rerender();
                },
              },
              icon("bell", { size: 20 }),
              item.reminder ? "Não avisar mais" : "Avisar por notificação",
            )
          : h(
              "button",
              {
                type: "button",
                class: "menu-item",
                onclick: () => {
                  downloadIcs({ ...event, start_date: item.date, end_date: item.date }, { alarm: true });
                  updateAgendaItem(item.id, { reminder: true });
                  close();
                  app.toast("Abra o arquivo baixado para criar o lembrete no celular.");
                  app.rerender();
                },
              },
              icon("bell", { size: 20 }),
              "Criar lembrete no celular",
            ),
        h(
          "button",
          {
            type: "button",
            class: "menu-item danger",
            onclick: () => {
              removeAgendaItem(item.id);
              close();
              app.toast("Removido da agenda");
              app.rerender();
            },
          },
          icon("trash", { size: 20 }),
          "Remover da agenda",
        ),
      );
      const { close } = openSheet({
        title: event.title,
        subtitle: `${formatShortDay(item.date)} · ${formatAgeShort(event)}`,
        content,
      });
    },

    /** Entrar numa família com o código que outro celular mostra. */
    joinFamily({ onJoined } = {}) {
      const message = h("p", { class: "form-error", role: "alert" });
      const input = h("input", {
        type: "text",
        inputmode: "text",
        autocapitalize: "characters",
        autocomplete: "off",
        spellcheck: "false",
        maxlength: 12,
        placeholder: "Ex.: K7MQ-3XPA",
        class: "code-input",
        oninput: (e) => {
          const clean = e.target.value
            .toUpperCase()
            .replace(/[^0-9A-Z]/g, "")
            .slice(0, 8);
          e.target.value = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
          message.textContent = "";
        },
      });
      const button = h(
        "button",
        {
          type: "button",
          class: "btn btn-yellow",
          onclick: async () => {
            const code = input.value.replace(/[^0-9A-Z]/gi, "");
            if (code.length !== 8) {
              message.textContent = "O código tem 8 letras e números.";
              return;
            }
            button.disabled = true;
            button.textContent = "Entrando…";
            try {
              await joinFamily(app, code);
              close();
              app.toast("Pronto! Agora vocês veem a mesma agenda 💛");
              onJoined?.();
              app.rerender();
            } catch (error) {
              message.textContent = error.message;
              button.disabled = false;
              button.textContent = "Entrar na família";
            }
          },
        },
        "Entrar na família",
      );
      const { close } = openSheet({
        title: "Entrar na família",
        subtitle: "Digite o código que aparece no Perfil do outro celular.",
        content: h(
          "div",
          { class: "form" },
          field("Código da família", input),
          message,
          h(
            "p",
            { class: "muted small-note" },
            "As crianças, a cidade, os favoritos e a agenda da família passam a aparecer neste celular. " +
              "O que você já salvou aqui também vai para a família.",
          ),
        ),
        footer: button,
      });
      setTimeout(() => input.focus(), 50);
    },

    /** Mostra o código para outro celular entrar. */
    familyInvite() {
      const code = formatCode(family()?.code);
      const link = new URL("./", location.href).href;
      const text = `Entre na nossa família no Pequenos Rolês (${link}): no Perfil, toque em "Tenho um código" e digite ${code}.`;
      openSheet({
        title: "Convidar para a família",
        subtitle: "Mostre ou envie este código para quem vai usar o app junto com você.",
        content: h(
          "div",
          { class: "invite" },
          h("p", { class: "family-code big", "aria-label": `Código ${code.split("").join(" ")}` }, code),
          h(
            "ol",
            { class: "invite-steps" },
            h("li", {}, "No outro celular, abra o Pequenos Rolês."),
            h("li", {}, "Vá em Perfil → Família → ", h("strong", {}, "Tenho um código"), "."),
            h("li", {}, "Digite o código acima. Pronto!"),
          ),
        ),
        footer: h(
          "button",
          {
            type: "button",
            class: "btn btn-yellow",
            onclick: async () => {
              try {
                if (navigator.share) await navigator.share({ title: "Pequenos Rolês", text });
                else {
                  await navigator.clipboard.writeText(text);
                  app.toast("Convite copiado");
                }
              } catch {
                // A pessoa fechou o compartilhamento.
              }
            },
          },
          icon("share", { size: 20 }),
          "Enviar convite",
        ),
      });
    },

    /** Apagar tudo: este celular e o que estiver na nuvem (LGPD). */
    deleteData() {
      const button = h(
        "button",
        {
          type: "button",
          class: "btn btn-red-soft",
          onclick: async () => {
            button.disabled = true;
            button.textContent = "Apagando…";
            try {
              await deleteMyData();
              location.replace("./#/boas-vindas");
              location.reload();
            } catch (error) {
              button.disabled = false;
              button.textContent = "Apagar tudo";
              app.toast(error.message);
            }
          },
        },
        "Apagar tudo",
      );
      openSheet({
        title: "Apagar meus dados?",
        subtitle: "Não dá para desfazer.",
        content: h(
          "p",
          { class: "muted" },
          "Vamos apagar deste celular o perfil, as crianças, os favoritos e a agenda, e desligar as notificações. " +
            (family()
              ? "Este celular também sai da família; os outros celulares continuam com os dados deles."
              : "Nada fica guardado na nuvem."),
        ),
        footer: button,
      });
    },

    /** Sair da família (os dados continuam neste celular). */
    leaveFamily() {
      const button = h(
        "button",
        {
          type: "button",
          class: "btn btn-red-soft",
          onclick: async () => {
            button.disabled = true;
            try {
              await leaveFamily(app);
              close();
              app.toast("Este celular saiu da família");
            } catch (error) {
              button.disabled = false;
              app.toast(error.message);
            }
          },
        },
        "Sair da família",
      );
      const { close } = openSheet({
        title: "Sair da família?",
        subtitle: "Este celular para de sincronizar com os outros.",
        content: h(
          "p",
          { class: "muted" },
          "O que já está aqui (crianças, favoritos e agenda) continua neste celular. Os outros celulares da família " +
            "não perdem nada. Para voltar, é só entrar de novo com o código.",
        ),
        footer: button,
      });
    },
  };
  return sheets;
}

export function downloadIcs(event, { alarm = false } = {}) {
  const blob = new Blob([buildIcs(event, new Date(), { alarm })], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const fileName =
    event.title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "evento";
  const link = h("a", { href: url, download: `${fileName}.ics` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
