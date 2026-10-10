import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderReport, summarize } from "../scripts/lib/report.mjs";

const rows = [
  { day: "2026-10-10", event_id: "app", kind: "open", count: 40 },
  { day: "2026-10-11", event_id: "app", kind: "open", count: 60 },
  { day: "2026-10-10", event_id: "e1", kind: "view", count: 12 },
  { day: "2026-10-11", event_id: "e1", kind: "view", count: 8 },
  { day: "2026-10-11", event_id: "e1", kind: "ticket", count: 5 },
  { day: "2026-10-11", event_id: "e2", kind: "view", count: 30 },
  { day: "2026-10-11", event_id: "pat", kind: "impression", count: 90 },
  { day: "2026-10-11", event_id: "pat", kind: "view", count: 9 },
];

describe("relatório", () => {
  it("soma por evento e calcula o uso diário", () => {
    const { byEvent, usage } = summarize(rows);
    assert.equal(byEvent.get("e1").view, 20);
    assert.equal(byEvent.get("e1").ticket, 5);
    assert.deepEqual(usage, { days: 2, total: 100, average: 50, max: 60 });
  });

  it("mostra destaques à parte, ranking por visualizações e nunca os contatos", () => {
    const titles = new Map([
      ["e1", "Peça | A"],
      ["e2", "Show B"],
      ["pat", "Oficina Y"],
    ]);
    const text = renderReport({
      rows,
      titles,
      sponsored: [{ eventId: "pat", sponsor: "Espaço Y" }],
      days: 30,
      requests: 2,
    });
    assert.match(text, /média de 50/);
    assert.match(text, /\| Oficina Y \(Espaço Y\) \| 90 \| 9 \|/);
    assert.ok(text.indexOf("Show B") < text.indexOf("Peça / A"), "mais vistos primeiro");
    assert.doesNotMatch(text, /Rolês mais vistos[\s\S]*Oficina Y/, "destaque não se repete no ranking");
    assert.match(text, /2 pedido\(s\) novo\(s\)/);
  });
});
