import { ICONS } from "./icons.js";

/**
 * Cria elementos com segurança: textos viram nós de texto (nunca HTML), então dados
 * vindos da internet não conseguem injetar código na página.
 *   h("button", { class: "pill", onclick: fn }, "Texto", icon("heart"))
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Ícone do Lucide como SVG (o desenho vem do arquivo gerado, não de dados externos). */
export function icon(name, { size = 20, className = "", strokeWidth = 2 } = {}) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", strokeWidth);
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", `icon ${className}`.trim());
  svg.innerHTML = ICONS[name] ?? ICONS.sparkles;
  return svg;
}

export function asset(name, { alt = "", className = "", width, height } = {}) {
  return h("img", {
    src: `./assets/${name}.webp`,
    alt,
    class: className,
    width,
    height,
    decoding: "async",
    draggable: "false",
  });
}

let toastTimer;
export function toast(message) {
  document.querySelector(".toast")?.remove();
  const el = h("div", { class: "toast", role: "status" }, message);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

/** Painel que sobe de baixo (configurações, filtros, menus). Fecha ao tocar fora ou no X. */
export function openSheet({ title, subtitle, content, footer, className = "" }) {
  document.querySelector("dialog.sheet")?.remove();
  const dialog = h(
    "dialog",
    { class: `sheet ${className}`.trim(), "aria-label": title },
    h(
      "div",
      { class: "sheet-panel" },
      h("div", { class: "sheet-grip", "aria-hidden": "true" }),
      h(
        "header",
        { class: "sheet-header" },
        h("div", {}, h("h2", {}, title), subtitle ? h("p", {}, subtitle) : null),
        h(
          "button",
          { class: "icon-button", type: "button", "aria-label": "Fechar", onclick: () => close() },
          icon("x"),
        ),
      ),
      h("div", { class: "sheet-body" }, content),
      footer ? h("footer", { class: "sheet-footer" }, footer) : null,
    ),
  );
  function close() {
    dialog.classList.add("closing");
    setTimeout(() => {
      dialog.close();
      dialog.remove();
    }, 180);
  }
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { close, dialog };
}
