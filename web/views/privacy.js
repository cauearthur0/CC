import { OWNER } from "../lib/config.js";
import { h, icon } from "../lib/dom.js";
import { logo } from "../ui/components.js";

const UPDATED = "10 de outubro de 2026";

function section(title, ...paragraphs) {
  return h("section", { class: "card policy-section" }, h("h2", {}, title), ...paragraphs.map((p) => h("p", {}, p)));
}

function contactLine() {
  const parts = [];
  if (OWNER.email) parts.push(h("a", { href: `mailto:${OWNER.email}` }, OWNER.email));
  if (OWNER.whatsapp) {
    parts.push(
      h("a", { href: `https://wa.me/${OWNER.whatsapp}`, target: "_blank", rel: "noopener noreferrer" }, "WhatsApp"),
    );
  }
  if (!parts.length) return "Para dúvidas sobre privacidade, use o formulário da página “Anuncie aqui”.";
  return ["Contato: ", ...parts.flatMap((p, i) => (i ? [" · ", p] : [p]))];
}

/** Política de privacidade (também exigida pelas lojas de aplicativos). */
export function renderPrivacy(app) {
  return h(
    "div",
    { class: "page page-policy" },
    h(
      "header",
      { class: "detail-top" },
      h(
        "button",
        {
          type: "button",
          class: "round-button",
          "aria-label": "Voltar",
          onclick: () => (history.length > 1 ? history.back() : app.navigate("#/perfil")),
        },
        icon("back", { size: 24 }),
      ),
      logo(),
      h("span"),
    ),
    h("h1", {}, "Privacidade"),
    h("p", { class: "muted" }, `Atualizada em ${UPDATED}.`),
    section(
      "Quem cuida dos dados",
      `O Pequenos Rolês é mantido por ${OWNER.name || "uma pessoa física, pai de uma criança em Porto Alegre"}.`,
      contactLine(),
    ),
    section(
      "O que fica só no seu celular",
      "Seu nome e foto, as crianças (nome, idade, foto e interesses), a cidade, as preferências, os favoritos e a agenda ficam guardados no próprio aparelho. Sem família conectada, nada disso sai do celular.",
      "Se você permitir a localização, ela é usada só no aparelho, para calcular a distância até os rolês. Não é enviada para nós.",
    ),
    section(
      "Família conectada (opcional)",
      "Se você conectar a família, o nome, a idade e os interesses das crianças, a cidade, os favoritos e a agenda passam a ser guardados também no nosso banco de dados (Supabase), para aparecerem nos outros celulares da família. As fotos das crianças, o seu nome e a sua foto continuam só no aparelho.",
      "A entrada é anônima: não pedimos e-mail, telefone nem senha. Só os celulares que têm o código da família conseguem ver esses dados.",
    ),
    section(
      "Notificações (opcional)",
      "Se você ligar as notificações, guardamos o endereço de notificação do navegador e os alertas que você escolheu, só para enviar os avisos. Ao desligar, esse endereço é apagado.",
    ),
    section(
      "Estatísticas anônimas",
      "Contamos, por dia, quantas vezes cada rolê foi visto, compartilhado ou teve o link aberto, e quantos aparelhos abriram o app. Esses totais não identificam ninguém e servem para melhorar o app e mostrar resultados a quem anuncia.",
    ),
    section(
      "Anúncios",
      "Alguns rolês podem ser destaques pagos. Eles sempre aparecem com a etiqueta “Patrocinado”. Anunciantes recebem apenas os totais anônimos acima, nunca dados das famílias.",
    ),
    section(
      "Outros serviços usados",
      "A programação é pesquisada por inteligência artificial (Kimi, da Moonshot AI) em sites públicos; ela não recebe dados das famílias. O app usa ainda GitHub Pages (hospedagem), OpenFreeMap e OpenStreetMap (mapa), Open-Meteo (previsão do tempo da cidade) e carrega as fotos dos eventos dos sites de origem.",
    ),
    section(
      "Seus direitos",
      "Você pode apagar tudo a qualquer momento em Perfil → Apagar meus dados: isso limpa o aparelho e apaga do nosso banco o seu acesso e, se você for o último da família, os dados da família.",
      "Você também pode pedir informações ou a correção de dados pelo contato acima, como prevê a Lei Geral de Proteção de Dados (LGPD).",
    ),
  );
}
