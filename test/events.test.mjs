import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSameEvent, makeId, mergeEvents, normalizeEvent, parseEventsJson, slugify } from "../scripts/lib/events.mjs";
import { EXTRACTION_JSON_SCHEMA, ExtractionResult, buildResearchPrompt } from "../scripts/lib/prompts.mjs";

const window = { today: "2026-10-10", maxDate: "2027-01-10" };

const raw = (overrides = {}) => ({
  title: "  O Pequeno Príncipe  ",
  description: "Teatro de bonecos.",
  category: "teatro",
  start_date: "2026-10-17",
  end_date: "2026-10-18",
  schedule: "16h",
  venue: "Theatro São Pedro",
  address: "Praça Mal. Deodoro",
  neighborhood: "Centro Histórico",
  setting: "indoor",
  organizer: "Cia. Exemplo",
  price: "R$ 40",
  is_free: false,
  age_min: 4,
  age_max: 10,
  age_estimated: false,
  url: "https://www.sympla.com.br/evento/123",
  source: "Sympla",
  ...overrides,
});

describe("normalizeEvent", () => {
  it("limpa e mantém um evento válido", () => {
    const e = normalizeEvent(raw(), window);
    assert.equal(e.title, "O Pequeno Príncipe");
    assert.equal(e.id, makeId("O Pequeno Príncipe", "2026-10-17"));
    assert.equal(e.first_seen, "2026-10-10");
    assert.equal(e.is_free, false);
    assert.equal(e.age_estimated, false);
  });

  it("descarta eventos sem fonte, sem data, passados ou longe demais", () => {
    assert.equal(normalizeEvent(raw({ url: "não tem" }), window), null);
    assert.equal(normalizeEvent(raw({ url: "javascript:alert(1)" }), window), null);
    assert.equal(normalizeEvent(raw({ start_date: "17/10/2026" }), window), null);
    assert.equal(normalizeEvent(raw({ start_date: "2025-10-17", end_date: "2025-10-18" }), window), null);
    assert.equal(normalizeEvent(raw({ start_date: "2027-03-01", end_date: "2027-03-01" }), window), null);
    assert.equal(normalizeEvent(raw({ title: "  " }), window), null);
  });

  it("mantém temporadas que começaram antes de hoje mas ainda estão em cartaz", () => {
    const e = normalizeEvent(raw({ start_date: "2026-09-01", end_date: "2026-11-30" }), window);
    assert.equal(e.end_date, "2026-11-30");
  });

  it("corrige dados inconsistentes", () => {
    const e = normalizeEvent(
      raw({
        end_date: "2026-10-01",
        age_min: 10,
        age_max: 4,
        category: "balada",
        price: "Entrada franca",
        is_free: false,
      }),
      window,
    );
    assert.equal(e.end_date, e.start_date);
    assert.deepEqual([e.age_min, e.age_max], [4, 10]);
    assert.equal(e.category, "outro");
    assert.equal(e.is_free, true);
  });

  it("trata 0 e 18+ como faixa aberta", () => {
    const e = normalizeEvent(raw({ age_min: 0, age_max: 99 }), window);
    assert.deepEqual([e.age_min, e.age_max], [null, null]);
  });

  it("usa o domínio quando a fonte não tem nome", () => {
    assert.equal(normalizeEvent(raw({ source: "" }), window).source, "sympla.com.br");
  });
});

describe("mergeEvents", () => {
  const base = normalizeEvent(raw(), { ...window, firstSeen: "2026-10-01" });

  it("atualiza eventos repetidos mantendo id e primeira aparição", () => {
    const updated = normalizeEvent(raw({ title: "O pequeno principe", schedule: "15h" }), window);
    const merged = mergeEvents([base], [updated], { today: "2026-10-10" });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].schedule, "15h");
    assert.equal(merged[0].id, base.id);
    assert.equal(merged[0].first_seen, "2026-10-01");
  });

  it("eventos da carga inicial (first_seen null) não viram 'Novo' ao serem reencontrados", () => {
    const seeded = { ...base, first_seen: null };
    const again = normalizeEvent(raw(), { ...window, today: "2026-10-15" });
    const [merged] = mergeEvents([seeded], [again], { today: "2026-10-15" });
    assert.equal(merged.first_seen, null);
  });

  it("remove eventos que já terminaram e ordena por data", () => {
    const past = { ...base, id: "velho", title: "Velho", start_date: "2026-10-01", end_date: "2026-10-05" };
    const early = normalizeEvent(raw({ title: "Oficina", start_date: "2026-10-12", end_date: "2026-10-12" }), window);
    const merged = mergeEvents([past, base], [early], { today: "2026-10-10" });
    assert.deepEqual(
      merged.map((e) => e.title),
      ["Oficina", "O Pequeno Príncipe"],
    );
  });

  it("não confunde eventos diferentes com o mesmo nome em datas distantes", () => {
    const later = normalizeEvent(raw({ start_date: "2026-11-21", end_date: "2026-11-21" }), window);
    assert.equal(isSameEvent(base, later), false);
    assert.equal(mergeEvents([base], [later], { today: "2026-10-10" }).length, 2);
  });
});

describe("prompts", () => {
  it("slugify ignora acentos e pontuação", () => {
    assert.equal(slugify("Contação de Histórias: Ação!"), "contacao de historias acao");
  });

  it("inclui cidade, período e eventos conhecidos no pedido de pesquisa", () => {
    const prompt = buildResearchPrompt({
      city: { name: "Porto Alegre", state: "RS", country: "Brasil", hints: ["Sympla"] },
      today: "2026-10-10",
      windowEnd: "2026-11-24",
      knownEvents: [{ title: "Peça X", start_date: "2026-10-17", end_date: "2026-10-17", venue: "Teatro Y" }],
    });
    assert.match(prompt, /Hoje é sábado, 2026-10-10/);
    assert.match(prompt, /Porto Alegre \(RS, Brasil\) .* entre 2026-10-10 e 2026-11-24/);
    assert.match(prompt, /- Peça X \(2026-10-17\) — Teatro Y/);
  });

  it("o esquema de extração aceita um evento completo", () => {
    const parsed = ExtractionResult.parse({ events: [raw()] });
    assert.equal(parsed.events.length, 1);
  });
});

describe("parseEventsJson", () => {
  it("aceita objeto com events, lista solta e bloco ```json", () => {
    assert.equal(parseEventsJson('{"events": [{"title": "a"}]}').length, 1);
    assert.equal(parseEventsJson('[{"title": "a"}, {"title": "b"}]').length, 2);
    assert.equal(parseEventsJson('```json\n{"events": []}\n```').length, 0);
  });

  it("recusa JSON sem lista de eventos", () => {
    assert.throws(() => parseEventsJson('{"eventos": []}'), /events/);
    assert.throws(() => parseEventsJson("não é json"));
  });
});

describe("esquema JSON enviado à API", () => {
  it("é estrito: todos os campos obrigatórios e sem campos extras", () => {
    const item = EXTRACTION_JSON_SCHEMA.properties.events.items;
    assert.equal(EXTRACTION_JSON_SCHEMA.$schema, undefined);
    assert.equal(item.additionalProperties, false);
    assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
  });
});
