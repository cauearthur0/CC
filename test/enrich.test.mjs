import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractOgImage, neighborhoodFrom, neighborhoodFromAddress } from "../scripts/lib/enrich.mjs";
import { mergeEvents, normalizeEvent } from "../scripts/lib/events.mjs";
import { cleanSuggestions, upcomingForSuggestions } from "../scripts/lib/suggestions.mjs";

describe("extractOgImage", () => {
  it("acha og:image em qualquer ordem de atributos e resolve URL relativa", () => {
    assert.equal(
      extractOgImage('<meta content="/img/capa.jpg" property="og:image">', "https://site.com/evento/1"),
      "https://site.com/img/capa.jpg",
    );
    assert.equal(
      extractOgImage('<meta property="og:image" content="https://cdn.com/a.png?x=1&amp;y=2" />', "https://site.com"),
      "https://cdn.com/a.png?x=1&y=2",
    );
  });

  it("usa twitter:image quando não há og:image e ignora esquemas estranhos", () => {
    assert.equal(
      extractOgImage('<meta name="twitter:image" content="https://cdn.com/t.jpg">', "https://site.com"),
      "https://cdn.com/t.jpg",
    );
    assert.equal(extractOgImage('<meta property="og:image" content="javascript:alert(1)">', "https://site.com"), null);
    assert.equal(extractOgImage("<title>sem imagem</title>", "https://site.com"), null);
  });
});

describe("mergeEvents com dados completados", () => {
  const base = {
    title: "Peça",
    description: "",
    category: "teatro",
    start_date: "2026-10-17",
    end_date: "2026-10-17",
    venue: "Teatro",
    address: "Rua A, 1",
    url: "https://example.com",
  };
  const window = { today: "2026-10-10", maxDate: "2027-01-10" };

  it("mantém foto e coordenadas quando o evento é reencontrado", () => {
    const old = { ...normalizeEvent(base, window), image: "https://img/1.jpg", lat: -30, lng: -51 };
    const [merged] = mergeEvents([old], [normalizeEvent(base, window)], { today: "2026-10-10" });
    assert.equal(merged.image, "https://img/1.jpg");
    assert.deepEqual([merged.lat, merged.lng], [-30, -51]);
  });

  it("descarta coordenadas antigas se o endereço mudou", () => {
    const old = { ...normalizeEvent(base, window), image: null, lat: -30, lng: -51 };
    const moved = normalizeEvent({ ...base, address: "Rua B, 2" }, window);
    const [merged] = mergeEvents([old], [moved], { today: "2026-10-10" });
    assert.equal(merged.image, null);
    assert.equal(merged.lat, undefined);
  });
});

describe("sugestões", () => {
  const events = [
    { id: "a", start_date: "2026-10-11", end_date: "2026-10-11" },
    { id: "b", start_date: "2026-10-30", end_date: "2026-10-30" },
    { id: "c", start_date: "2026-09-01", end_date: "2026-12-01" },
  ];

  it("considera só os próximos dias", () => {
    assert.deepEqual(
      upcomingForSuggestions(events, "2026-10-10").map((e) => e.id),
      ["a", "c"],
    );
  });

  it("descarta ids inexistentes e sugestões vazias", () => {
    const cleaned = cleanSuggestions(
      [
        { age_min: 4, age_max: 6, title: "T", text: "Que tal?", tagline: "Oba", event_ids: ["a", "zzz", "a"] },
        { age_min: 7, age_max: 9, title: "T", text: "Vamos?", tagline: "", event_ids: ["zzz"] },
      ],
      events,
    );
    assert.equal(cleaned.length, 1);
    assert.deepEqual(cleaned[0].event_ids, ["a"]);
  });
});

describe("bairro", () => {
  it("lê o bairro escrito no endereço", () => {
    assert.equal(
      neighborhoodFromAddress("Rua João Caetano, 440 - Três Figueiras, Porto Alegre", "Porto Alegre"),
      "Três Figueiras",
    );
    assert.equal(neighborhoodFromAddress("Av. Érico Veríssimo, 307, Centro, Porto Alegre", "Porto Alegre"), "Centro");
    assert.equal(neighborhoodFromAddress("Cidade Baixa, Porto Alegre", "Porto Alegre"), "Cidade Baixa");
  });

  it("não confunde rua ou número com bairro", () => {
    assert.equal(neighborhoodFromAddress("R. 24 de Outubro, 112, Porto Alegre", "Porto Alegre"), null);
    assert.equal(neighborhoodFromAddress("Av. João Pessoa, 1831, Porto Alegre", "Porto Alegre"), null);
    assert.equal(neighborhoodFromAddress("Rua dos Andradas, 736", "Porto Alegre"), null);
    assert.equal(neighborhoodFromAddress(null, "Porto Alegre"), null);
  });

  it("usa o bairro do OpenStreetMap", () => {
    assert.equal(neighborhoodFrom({ suburb: "Moinhos de Vento", city: "Porto Alegre" }), "Moinhos de Vento");
    assert.equal(neighborhoodFrom({ city: "Porto Alegre" }), null);
  });

  it("mantém bairro e ambiente já conhecidos quando a nova pesquisa não traz", () => {
    const window = { today: "2026-10-10", maxDate: "2027-01-10" };
    const raw = {
      title: "Peça",
      category: "teatro",
      start_date: "2026-10-17",
      venue: "Teatro",
      url: "https://example.com",
    };
    const before = normalizeEvent({ ...raw, neighborhood: "Bom Fim", setting: "indoor" }, window);
    const [merged] = mergeEvents([before], [normalizeEvent({ ...raw, schedule: "16h" }, window)], window);
    assert.equal(merged.neighborhood, "Bom Fim");
    assert.equal(merged.setting, "indoor");
    assert.equal(merged.schedule, "16h");
  });
});
