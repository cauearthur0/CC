import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyShared, mergeShared, sameShared, stampChanges, toShared } from "../web/lib/sync.js";

const event = (id) => ({ id, title: `Evento ${id}`, start_date: "2026-10-17", end_date: "2026-10-17" });

function device(overrides = {}) {
  const state = {
    kids: [{ id: "k1", name: "Maitê", age: 6 }],
    city: "porto-alegre",
    favorites: {},
    agenda: [],
    ...overrides,
  };
  stampChanges(state, 1000);
  return state;
}

/** Simula a sincronização de um aparelho com a nuvem: junta, aplica e devolve o novo documento. */
function sync(state, cloud) {
  const merged = mergeShared(cloud ?? {}, toShared(state));
  applyShared(state, merged);
  return merged;
}

describe("sincronização da família", () => {
  it("leva favoritos e agenda de um celular para o outro", () => {
    const pai = device();
    const mae = device();
    pai.favorites.e1 = { saved_at: "2026-10-10", event: event("e1") };
    pai.agenda.push({ id: "a1", event_id: "e1", date: "2026-10-17", status: "salvo", added_at: "2026-10-10" });
    stampChanges(pai, 2000);
    let cloud = sync(pai, null);
    cloud = sync(mae, cloud);
    assert.deepEqual(Object.keys(mae.favorites), ["e1"]);
    assert.equal(mae.agenda[0].id, "a1");
  });

  it("não perde o que cada um fez ao mesmo tempo", () => {
    const pai = device();
    const mae = device();
    let cloud = sync(pai, null);
    cloud = sync(mae, cloud);
    pai.favorites.e1 = { saved_at: "2026-10-10", event: event("e1") };
    stampChanges(pai, 3000);
    mae.favorites.e2 = { saved_at: "2026-10-10", event: event("e2") };
    stampChanges(mae, 3001);
    cloud = sync(pai, cloud);
    cloud = sync(mae, cloud);
    sync(pai, cloud);
    assert.deepEqual(Object.keys(pai.favorites).sort(), ["e1", "e2"]);
    assert.deepEqual(Object.keys(mae.favorites).sort(), ["e1", "e2"]);
  });

  it("apagar num celular apaga no outro, e voltar a salvar depois vale", () => {
    const pai = device({ favorites: { e1: { saved_at: "2026-10-10", event: event("e1") } } });
    const mae = device();
    let cloud = sync(pai, null);
    cloud = sync(mae, cloud);
    delete mae.favorites.e1;
    stampChanges(mae, 5000);
    cloud = sync(mae, cloud);
    cloud = sync(pai, cloud);
    assert.deepEqual(pai.favorites, {});
    pai.favorites.e1 = { saved_at: "2026-10-11", event: event("e1") };
    stampChanges(pai, 6000);
    cloud = sync(pai, cloud);
    sync(mae, cloud);
    assert.equal(mae.favorites.e1.saved_at, "2026-10-11");
  });

  it("a mudança mais recente de um item da agenda vence", () => {
    const item = {
      id: "a1",
      event_id: "e1",
      date: "2026-10-17",
      status: "salvo",
      reminder: false,
      added_at: "2026-10-10",
    };
    const pai = device({ agenda: [{ ...item }] });
    const mae = device();
    let cloud = sync(pai, null);
    cloud = sync(mae, cloud);
    pai.agenda[0].status = "confirmado";
    stampChanges(pai, 7000);
    mae.agenda[0].reminder = true;
    stampChanges(mae, 7500);
    cloud = sync(pai, cloud);
    cloud = sync(mae, cloud);
    sync(pai, cloud);
    assert.equal(pai.agenda[0].reminder, true);
    assert.equal(pai.agenda.length, 1);
  });

  it("as crianças e a cidade seguem a última mudança, e o que veio da nuvem não vira mudança local", () => {
    const pai = device();
    const mae = device();
    let cloud = sync(pai, null);
    cloud = sync(mae, cloud);
    mae.kids = [...mae.kids, { id: "k2", name: "Davi", age: 3 }];
    stampChanges(mae, 9000);
    cloud = sync(mae, cloud);
    const changed = applyShared(pai, mergeShared(cloud, toShared(pai)));
    assert.equal(changed.kids, true);
    assert.equal(pai.kids.length, 2);
    stampChanges(pai, 9999);
    assert.equal(pai.sync.ts.kids, 9000, "aplicar a nuvem não deve contar como mudança deste aparelho");
  });

  it("dá o mesmo resultado em qualquer ordem", () => {
    const a = device({ favorites: { e1: { saved_at: "x", event: event("e1"), ts: 10 } } });
    const b = device({ favorites: { e2: { saved_at: "y", event: event("e2"), ts: 20 } } });
    b.sync.removed.favorites.e1 = 5;
    const ab = mergeShared(toShared(a), toShared(b));
    const ba = mergeShared(toShared(b), toShared(a));
    assert.ok(sameShared(ab, ba));
    assert.deepEqual(Object.keys(ab.favorites).sort(), ["e1", "e2"]);
  });

  it("nunca deixa o app sem crianças nem sem cidade", () => {
    const state = device();
    applyShared(state, { kids: { value: [], ts: 99999 }, city: { value: null, ts: 99999 } });
    assert.equal(state.kids.length, 1);
    assert.equal(state.city, "porto-alegre");
  });
});

describe("entrar numa família", () => {
  it("as crianças da família valem mais que as de um celular novo", () => {
    const pai = device();
    const cloud = sync(pai, null);
    const novo = { kids: [{ id: "x", name: "", age: 6 }], city: "porto-alegre", favorites: {}, agenda: [] };
    stampChanges(novo, 50_000); // primeira gravação do celular novo
    novo.sync.ts.kids = 0; // o que o app faz ao entrar
    novo.sync.ts.city = 0;
    stampChanges(novo, 60_000); // gravar de novo não pode carimbar as crianças outra vez
    sync(novo, cloud);
    assert.equal(novo.kids[0].name, "Maitê");
  });
});
