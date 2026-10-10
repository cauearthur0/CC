// Monta o relatório de audiência a partir dos totais anônimos (tabela event_stats). Só lógica, para testar.

export const KINDS = ["impression", "view", "ticket", "route", "share", "favorite", "agenda"];
const LABELS = {
  impression: "Viram o destaque",
  view: "Abriram",
  ticket: "Link/ingresso",
  route: "Caminho",
  share: "Compart.",
  favorite: "Favoritos",
  agenda: "Agenda",
};

/** Soma os totais por evento e o uso do app por dia. */
export function summarize(rows) {
  const byEvent = new Map();
  const opens = new Map();
  for (const { day, event_id: id, kind, count } of rows) {
    if (kind === "open") {
      opens.set(day, (opens.get(day) ?? 0) + count);
      continue;
    }
    if (!byEvent.has(id)) byEvent.set(id, Object.fromEntries(KINDS.map((k) => [k, 0])));
    const totals = byEvent.get(id);
    if (kind in totals) totals[kind] += count;
  }
  const days = [...opens.values()];
  return {
    byEvent,
    usage: {
      days: days.length,
      total: days.reduce((a, b) => a + b, 0),
      average: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0,
      max: days.length ? Math.max(...days) : 0,
    },
  };
}

function table(entries, titles, kinds) {
  const head = `| Rolê | ${kinds.map((k) => LABELS[k]).join(" | ")} |`;
  const line = `|---|${kinds.map(() => "---:").join("|")}|`;
  const body = entries.map(
    ([id, totals]) => `| ${(titles.get(id) ?? id).replace(/\|/g, "/")} | ${kinds.map((k) => totals[k]).join(" | ")} |`,
  );
  return [head, line, ...body].join("\n");
}

/** Relatório em Markdown (vai para o resumo da execução no GitHub). */
export function renderReport({ rows, titles, sponsored = [], days, requests = 0, top = 20 }) {
  const { byEvent, usage } = summarize(rows);
  const parts = [`# Relatório do Pequenos Rolês — últimos ${days} dias`];
  parts.push(
    "## Uso do app",
    usage.days
      ? `Celulares que abriram o app, por dia: **média de ${usage.average}**, máximo de ${usage.max} ` +
          `(${usage.total} aberturas em ${usage.days} dias com uso).`
      : "Ainda não há uso registrado.",
  );

  const sponsoredIds = new Set(sponsored.map((s) => s.eventId));
  if (sponsored.length) {
    const entries = sponsored.map((s) => [
      s.eventId,
      byEvent.get(s.eventId) ?? Object.fromEntries(KINDS.map((k) => [k, 0])),
    ]);
    const named = new Map(sponsored.map((s) => [s.eventId, `${titles.get(s.eventId) ?? s.eventId} (${s.sponsor})`]));
    parts.push("## Destaques patrocinados", table(entries, named, KINDS));
  }

  const ranked = [...byEvent.entries()]
    .filter(([id, t]) => !sponsoredIds.has(id) && t.view + t.ticket + t.route + t.share + t.favorite + t.agenda > 0)
    .sort(([, a], [, b]) => b.view - a.view || b.ticket - a.ticket)
    .slice(0, top);
  if (ranked.length) {
    parts.push(
      `## Rolês mais vistos (até ${top})`,
      table(
        ranked,
        titles,
        KINDS.filter((k) => k !== "impression"),
      ),
    );
  }

  parts.push(
    "## Pedidos de anúncio",
    requests
      ? `${requests} pedido(s) novo(s) no período. Veja os contatos no Supabase: Table Editor → ad_requests ` +
          "(eles não aparecem aqui porque este relatório é público)."
      : "Nenhum pedido novo no período.",
  );
  parts.push("_Os números são totais anônimos por dia; cada tipo conta no máximo uma vez por sessão do app._");
  return parts.join("\n\n");
}
