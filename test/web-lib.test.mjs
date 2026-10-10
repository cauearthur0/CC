import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, isIsoDate, todayIn, weekendRange } from "../web/lib/dates.js";
import { filterEvents, groupEvents, matchesAges, rangeFor, startMinutes } from "../web/lib/filters.js";
import { formatAgeRange, formatAges, formatDayHeading } from "../web/lib/format.js";
import { buildIcs } from "../web/lib/ics.js";

const event = (overrides = {}) => ({
  id: "abc",
  title: "Peça",
  category: "teatro",
  start_date: "2026-10-17",
  end_date: "2026-10-17",
  schedule: "16h",
  venue: "Teatro",
  is_free: false,
  age_min: 3,
  age_max: 10,
  url: "https://example.com",
  ...overrides,
});

describe("datas", () => {
  it("valida datas ISO de verdade", () => {
    assert.equal(isIsoDate("2026-10-10"), true);
    assert.equal(isIsoDate("2026-02-30"), false);
    assert.equal(isIsoDate("10/10/2026"), false);
    assert.equal(isIsoDate(null), false);
  });

  it("calcula o dia de hoje no fuso da cidade", () => {
    // 02:00 UTC de 11/10 ainda é 10/10 em Porto Alegre (UTC-3).
    assert.equal(todayIn("America/Sao_Paulo", new Date("2026-10-11T02:00:00Z")), "2026-10-10");
  });

  it("acha o fim de semana certo para cada dia", () => {
    assert.deepEqual(weekendRange("2026-10-08"), { start: "2026-10-10", end: "2026-10-11" }); // quinta
    assert.deepEqual(weekendRange("2026-10-10"), { start: "2026-10-10", end: "2026-10-11" }); // sábado
    assert.deepEqual(weekendRange("2026-10-11"), { start: "2026-10-11", end: "2026-10-11" }); // domingo
    assert.deepEqual(weekendRange("2026-10-12"), { start: "2026-10-17", end: "2026-10-18" }); // segunda
  });

  it("soma dias atravessando o mês", () => {
    assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  });
});

describe("filtros", () => {
  it("filtra por idade, considerando faixas abertas", () => {
    assert.equal(matchesAges(event(), [6]), true);
    assert.equal(matchesAges(event(), [12]), false);
    assert.equal(matchesAges(event({ age_min: null, age_max: null }), [12]), true);
    assert.equal(matchesAges(event({ age_min: 8, age_max: null }), [6]), false);
    assert.equal(matchesAges(event(), [1, 6]), true);
    assert.equal(matchesAges(event(), []), true);
  });

  it("filtra por período, gratuidade e categoria", () => {
    const events = [
      event({ id: "a" }),
      event({ id: "b", start_date: "2026-11-20", end_date: "2026-11-20" }),
      event({ id: "c", is_free: true, category: "oficina" }),
      event({ id: "d", start_date: "2026-10-01", end_date: "2026-10-31", category: "exposicao" }),
    ];
    const range = rangeFor("7-dias", "2026-10-12");
    const ids = (list) => list.map((e) => e.id).sort();
    assert.deepEqual(ids(filterEvents(events, { range })), ["a", "c", "d"]);
    assert.deepEqual(ids(filterEvents(events, { range, freeOnly: true })), ["c"]);
    assert.deepEqual(ids(filterEvents(events, { range, category: "exposicao" })), ["d"]);
  });

  it("agrupa por dia e separa temporadas longas", () => {
    const range = { start: "2026-10-12", end: "2026-10-18" };
    const { days, ongoing } = groupEvents(
      [
        event({ id: "tarde", schedule: "16h" }),
        event({ id: "manha", schedule: "10h30" }),
        event({ id: "comecou-antes", start_date: "2026-10-10", end_date: "2026-10-13" }),
        event({ id: "expo", start_date: "2026-10-01", end_date: "2026-11-30" }),
      ],
      range,
    );
    assert.deepEqual(
      days.map((d) => [d.day, d.events.map((e) => e.id)]),
      [
        ["2026-10-12", ["comecou-antes"]],
        ["2026-10-17", ["manha", "tarde"]],
      ],
    );
    assert.deepEqual(
      ongoing.map((e) => e.id),
      ["expo"],
    );
  });

  it("lê o primeiro horário do texto", () => {
    assert.equal(startMinutes("Sábados, 16h"), 960);
    assert.equal(startMinutes("14h30 às 18h"), 870);
    assert.equal(startMinutes("às 9:15"), 555);
    assert.equal(startMinutes("Dia todo"), null);
    assert.equal(startMinutes(null), null);
  });
});

describe("formatação", () => {
  it("descreve a faixa etária", () => {
    assert.equal(formatAgeRange(event()), "3 a 10 anos");
    assert.equal(formatAgeRange(event({ age_min: 5, age_max: null })), "A partir de 5 anos");
    assert.equal(formatAgeRange(event({ age_min: null, age_max: 4 })), "Até 4 anos");
    assert.equal(formatAgeRange(event({ age_min: null, age_max: null })), "Todas as idades");
    assert.equal(formatAgeRange(event({ age_min: 0, age_max: 1 })), "Até 1 ano");
  });

  it("descreve as idades das crianças", () => {
    assert.equal(formatAges([6]), "6 anos");
    assert.equal(formatAges([6, 0, 3]), "bebê, 3 anos e 6 anos");
    assert.equal(formatAges([2, 2]), "2 anos");
  });

  it("escreve o cabeçalho do dia", () => {
    assert.equal(formatDayHeading("2026-10-10", "2026-10-10"), "Hoje · Sábado, 10 de outubro");
    assert.equal(formatDayHeading("2026-10-11", "2026-10-10"), "Amanhã · Domingo, 11 de outubro");
    assert.equal(formatDayHeading("2026-10-17", "2026-10-10"), "Sábado, 17 de outubro");
  });
});

describe("arquivo de agenda (.ics)", () => {
  it("gera um evento de dia inteiro com texto escapado", () => {
    const ics = buildIcs(
      event({
        title: "Show; com vírgula, e barra\\",
        start_date: "2026-10-31",
        end_date: "2026-10-31",
        schedule: null,
      }),
      new Date("2026-10-10T12:00:00Z"),
    );
    assert.match(ics, /DTSTART;VALUE=DATE:20261031\r\n/);
    assert.match(ics, /DTEND;VALUE=DATE:20261101\r\n/);
    assert.match(ics, /SUMMARY:Show\\; com vírgula\\, e barra\\\\\r\n/);
    assert.match(ics, /DTSTAMP:20261010T120000Z/);
    assert.doesNotMatch(ics, /VALARM/);
  });

  it("usa o horário quando o evento é de um dia só e cria lembrete se pedido", () => {
    const ics = buildIcs(event({ schedule: "14h30 às 16h" }), new Date("2026-10-10T12:00:00Z"), { alarm: true });
    assert.match(ics, /DTSTART:20261017T143000\r\n/);
    assert.match(ics, /DTEND:20261017T160000\r\n/);
    assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY/);
    assert.match(ics, /TRIGGER:-PT2H/);
  });

  it("sem horário final, dura uma hora", () => {
    const ics = buildIcs(event({ schedule: "Sábado, 16h" }));
    assert.match(ics, /DTEND:20261017T170000/);
  });
});
