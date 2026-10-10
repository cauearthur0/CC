import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySponsored, pickHighlight } from "../web/lib/sponsored.js";

const today = "2026-10-10";
const agenda = [
  {
    id: "a",
    title: "Peça A",
    start_date: "2026-10-11",
    end_date: "2026-10-11",
    venue: "Teatro",
    age_min: 3,
    age_max: 8,
  },
  {
    id: "b",
    title: "Show B",
    start_date: "2026-10-12",
    end_date: "2026-10-12",
    venue: "Praça",
    age_min: 10,
    age_max: 14,
  },
];

describe("destaques patrocinados", () => {
  it("marca um evento da agenda e inclui um evento que só existe no destaque", () => {
    const entries = [
      {
        id: "camp1",
        city: "porto-alegre",
        sponsor: "Teatro X",
        from: "2026-10-01",
        until: "2026-10-20",
        event_id: "a",
      },
      {
        id: "camp2",
        city: "porto-alegre",
        sponsor: "Oficina Y",
        until: "2026-10-31",
        event: { title: "Oficina de robótica", start_date: "2026-10-17", venue: "Espaço Y", age_min: 6, age_max: 10 },
      },
    ];
    const { events, highlights } = applySponsored(agenda, entries, { city: "porto-alegre", today });
    assert.equal(events.length, 3);
    assert.equal(events.find((e) => e.id === "a").sponsored.sponsor, "Teatro X");
    const extra = events.find((e) => e.id === "patrocinado-camp2");
    assert.equal(extra.end_date, "2026-10-17");
    assert.equal(extra.first_seen, null, "não aparece como 'novo'");
    assert.equal(highlights.length, 2);
    assert.equal(agenda[0].sponsored, undefined, "não altera a lista original");
  });

  it("ignora destaques de outra cidade, fora do período ou incompletos", () => {
    const entries = [
      { id: "1", city: "florianopolis", event_id: "a" },
      { id: "2", city: "porto-alegre", until: "2026-10-09", event_id: "a" },
      { id: "3", city: "porto-alegre", from: "2026-10-11", event_id: "a" },
      { id: "4", city: "porto-alegre", event: { title: "Sem data" } },
      { id: "5", city: "porto-alegre", event_id: "nao-existe" },
    ];
    const { events, highlights } = applySponsored(agenda, entries, { city: "porto-alegre", today });
    assert.equal(highlights.length, 0);
    assert.ok(events.every((e) => !e.sponsored));
  });

  it("escolhe só destaques da idade da criança, em rodízio diário", () => {
    const { highlights } = applySponsored(
      agenda,
      [
        { id: "1", event_id: "a" },
        { id: "2", event_id: "b" },
      ],
      { city: "porto-alegre", today },
    );
    assert.equal(pickHighlight(highlights, { ages: [6], today }).id, "a");
    assert.equal(pickHighlight(highlights, { ages: [2], today }), null);
    const days = new Set(["2026-10-10", "2026-10-11"].map((d) => pickHighlight(highlights, { ages: [], today: d }).id));
    assert.equal(days.size, 2, "muda de um dia para o outro");
  });
});
