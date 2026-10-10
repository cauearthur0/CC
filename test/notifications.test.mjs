import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newEventsFor, planNotifications } from "../scripts/lib/notifications.mjs";

const today = "2026-10-16"; // sexta-feira
const family = {
  kids: { value: [{ name: "Maitê", age: 6 }], ts: 1 },
  agenda: {
    a1: {
      id: "a1",
      event_id: "e1",
      date: "2026-10-17",
      reminder: true,
      event: { title: "Peça de bonecos", schedule: "Sábado, 16h", venue: "Teatro X" },
    },
    a2: { id: "a2", event_id: "e2", date: "2026-10-17", reminder: false, event: { title: "Sem lembrete" } },
    a3: { id: "a3", event_id: "e3", date: "2026-10-16", reminder: true, event: { title: "Oficina", venue: "CCMQ" } },
  },
};
const ev = (over) => ({
  id: "x",
  title: "Evento",
  start_date: "2026-10-18",
  end_date: "2026-10-18",
  age_min: 3,
  age_max: 10,
  is_free: false,
  first_seen: "2026-10-15",
  ...over,
});

describe("notificações", () => {
  it("lembra à tardinha dos rolês de amanhã e de manhã dos de hoje", () => {
    const noite = planNotifications({ mode: "noite", today, family });
    assert.deepEqual(
      noite.map((p) => [p.kind, p.title, p.body, p.url]),
      [["lembrete", "Amanhã tem rolê! 🎈", "Peça de bonecos — 16h · Teatro X", "./#/evento/e1"]],
    );
    const manha = planNotifications({ mode: "manha", today, family, prefs: { ai: false } });
    assert.deepEqual(
      manha.map((p) => p.body),
      ["Oficina — CCMQ"],
    );
  });

  it("avisa de manhã os rolês novos que servem para a idade das crianças", () => {
    const events = [
      ev({ id: "1", title: "Novo A" }),
      ev({ id: "2", title: "Novo B", is_free: true }),
      ev({ id: "3", title: "Para adolescentes", age_min: 12, age_max: 16 }),
      ev({ id: "4", title: "Antigo", first_seen: "2026-10-01" }),
      ev({ id: "5", title: "Carga inicial", first_seen: null }),
      ev({ id: "6", title: "Já acabou", end_date: "2026-10-15" }),
    ];
    const [plan] = planNotifications({
      mode: "manha",
      today,
      family: { ...family, agenda: {} },
      prefs: { ai: true, free: true },
      events,
    });
    assert.equal(plan.title, "2 rolês novos para Maitê");
    assert.equal(plan.body, "Novo A · Novo B (1 grátis)");
    assert.equal(plan.ref, "2026-10-15");

    const onlyFree = planNotifications({
      mode: "manha",
      today,
      family: { ...family, agenda: {} },
      prefs: { ai: false, free: true },
      events,
    });
    assert.equal(onlyFree[0].title, "1 rolê novo para Maitê");

    const none = planNotifications({
      mode: "manha",
      today,
      family: { ...family, agenda: {} },
      prefs: { ai: false, free: false },
      events,
    });
    assert.equal(none.length, 0);
  });

  it("na sexta à tardinha avisa da chuva no fim de semana, se o alerta estiver ligado", () => {
    const base = { mode: "noite", family: { kids: family.kids }, rainyWeekend: true };
    assert.equal(planNotifications({ ...base, today }).at(-1).kind, "chuva");
    assert.equal(planNotifications({ ...base, today, prefs: { rain: false } }).length, 0);
    assert.equal(planNotifications({ ...base, today: "2026-10-15" }).length, 0, "só na sexta");
  });

  it("considera todas as crianças da família", () => {
    const events = [ev({ id: "1", age_min: 0, age_max: 2 })];
    assert.equal(newEventsFor(events, { today, ages: [6] }).length, 0);
    assert.equal(newEventsFor(events, { today, ages: [6, 1] }).length, 1);
  });
});
