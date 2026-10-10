import { OWNER, SUPABASE_KEY, SUPABASE_URL } from "../lib/config.js";
import { asset, h, icon } from "../lib/dom.js";
import { logo } from "../ui/components.js";

let sent = false;

function backButton(app) {
  return h(
    "button",
    {
      type: "button",
      class: "round-button",
      "aria-label": "Voltar",
      onclick: () => (history.length > 1 ? history.back() : app.navigate("#/perfil")),
    },
    icon("back", { size: 24 }),
  );
}

function infoCard(iconName, tone, title, text) {
  return h(
    "section",
    { class: "card ad-info" },
    h("span", { class: `pref-icon tone-${tone}` }, icon(iconName, { size: 22 })),
    h("div", {}, h("strong", {}, title), h("p", {}, text)),
  );
}

async function sendRequest(fields) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_ad`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_name: fields.name,
      p_business: fields.business,
      p_contact: fields.contact,
      p_message: fields.message,
    }),
  });
  if (!response.ok) throw new Error(String(response.status));
}

function requestForm(app) {
  if (sent) {
    return h(
      "section",
      { class: "card ad-form ad-sent" },
      icon("check-circle", { size: 40, className: "c-green" }),
      h("h2", {}, "Pedido recebido!"),
      h("p", {}, "Vamos entrar em contato pelo WhatsApp ou e-mail que você deixou. Obrigado!"),
    );
  }
  const fields = { name: "", business: "", contact: "", message: "" };
  const error = h("p", { class: "form-error", role: "alert" });
  const input = (key, label, attrs = {}) =>
    h(
      "label",
      { class: "field" },
      h("span", { class: "field-label" }, label),
      h(attrs.multiline ? "textarea" : "input", {
        type: "text",
        maxlength: attrs.multiline ? 2000 : 120,
        rows: attrs.multiline ? 4 : null,
        placeholder: attrs.placeholder ?? "",
        autocomplete: attrs.autocomplete ?? "off",
        oninput: (e) => {
          fields[key] = e.target.value;
          error.textContent = "";
        },
      }),
    );
  const button = h(
    "button",
    {
      type: "submit",
      class: "btn btn-yellow wide",
    },
    "Quero anunciar",
    icon("arrow-right", { size: 18 }),
  );
  return h(
    "form",
    {
      class: "card ad-form form",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!fields.name.trim() || !fields.business.trim() || !fields.contact.trim()) {
          error.textContent = "Preencha seu nome, o nome do espaço ou grupo e um contato.";
          return;
        }
        button.disabled = true;
        try {
          await sendRequest(fields);
          sent = true;
          app.rerender();
        } catch {
          error.textContent = "Não deu para enviar agora. Confira a internet e tente de novo.";
          button.disabled = false;
        }
      },
    },
    h("h2", {}, "Fale com a gente"),
    input("name", "Seu nome", { autocomplete: "name" }),
    input("business", "Espaço, grupo ou empresa", { placeholder: "Ex.: Cia. de Teatro Faz de Conta" }),
    input("contact", "WhatsApp ou e-mail", { placeholder: "Para respondermos" }),
    input("message", "O que você quer divulgar?", {
      multiline: true,
      placeholder: "Atividade, datas, local e idade das crianças.",
    }),
    error,
    button,
    h(
      "small",
      { class: "muted" },
      "Usamos esses dados só para responder ao seu pedido. ",
      h("a", { href: "#/privacidade" }, "Privacidade"),
    ),
  );
}

/** Página para quem quer divulgar atividades infantis no app. */
export function renderAdvertise(app) {
  const city = app.city?.name ?? "sua cidade";
  return h(
    "div",
    { class: "page page-advertise" },
    h("header", { class: "detail-top" }, backButton(app), logo(), h("span")),
    h(
      "section",
      { class: "hero compact" },
      h(
        "div",
        { class: "hero-text" },
        h("h1", {}, "Anuncie no Pequenos Rolês"),
        h(
          "p",
          {},
          `Mostre sua peça, oficina, festa ou espaço para famílias com crianças em ${city}, no momento em que elas estão escolhendo o que fazer.`,
        ),
      ),
    ),
    asset("family-small", { className: "ad-illus", alt: "" }),
    infoCard(
      "users",
      "purple",
      "Para a idade certa",
      "O destaque aparece no Início só para famílias com crianças na faixa de idade da sua atividade.",
    ),
    infoCard(
      "star",
      "yellow",
      "Onde aparece",
      "Cartão de destaque no Início, com foto, data e local, e a página do evento com o link para os ingressos.",
    ),
    infoCard(
      "target",
      "blue",
      "Resultado medido",
      "Você recebe quantas vezes o destaque foi visto, quantas famílias abriram o evento, pediram o caminho e tocaram no link de ingressos.",
    ),
    infoCard(
      "heart-handshake",
      "green",
      "Sempre transparente",
      "Todo anúncio leva a etiqueta “Patrocinado”, e só divulgamos atividades adequadas para crianças.",
    ),
    OWNER.whatsapp
      ? h(
          "a",
          {
            class: "btn btn-soft-blue wide ad-whatsapp",
            href: `https://wa.me/${OWNER.whatsapp}?text=${encodeURIComponent("Olá! Quero anunciar no Pequenos Rolês.")}`,
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "Chamar no WhatsApp",
        )
      : null,
    requestForm(app),
  );
}
