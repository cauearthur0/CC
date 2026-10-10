import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractJsonLdEvents,
  extractNextDataEvents,
  htmlToText,
  imagesByUrl,
  linksToFollow,
  sourcesToNotes,
  toIsoDay,
} from "../scripts/lib/sources.mjs";

describe("fontes fixas", () => {
  it("lê eventos em JSON-LD, inclusive dentro de @graph e listas", () => {
    const html = `
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"TheaterEvent","name":"O Pequeno &amp; Grande",
        "startDate":"2026-10-17T16:00:00-03:00","endDate":"2026-10-18","url":"/e/1","image":{"url":"/img/1.jpg"},
        "location":{"@type":"Place","name":"Teatro X","address":{"streetAddress":"Rua A, 1","addressLocality":"Porto Alegre"}},
        "offers":{"price":"0"}}</script>
      <script type="application/ld+json">{"@graph":[{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"Event","name":"Oficina","startDate":"2026-10-20","offers":[{"price":"25.5"}]}}]}]}</script>
      <script type="application/ld+json">{ quebrado </script>`;
    const events = extractJsonLdEvents(html, "https://site.com/agenda");
    assert.equal(events.length, 2);
    assert.deepEqual(
      { ...events[0], description: undefined },
      {
        title: "O Pequeno & Grande",
        start_date: "2026-10-17",
        end_date: "2026-10-18",
        time: "16h",
        venue: "Teatro X",
        address: "Rua A, 1, Porto Alegre",
        url: "https://site.com/e/1",
        image: "https://site.com/img/1.jpg",
        description: undefined,
        price: "Gratuito",
      },
    );
    assert.equal(events[1].price, "R$ 25,5");
    assert.equal(events[1].end_date, "2026-10-20");
  });

  it("acha eventos nos dados de páginas Next.js sem repetir", () => {
    const data = {
      props: {
        pageProps: {
          list: [
            { name: "Show infantil", start_date: "2026-10-12T15:00:00Z", url: "https://sympla.com/1", images: { original: "https://img/1.jpg" } },
            { name: "Show infantil", start_date: "2026-10-12T15:00:00Z", url: "https://sympla.com/1" },
            { name: "Sem data" },
          ],
        },
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
    const events = extractNextDataEvents(html, "https://sympla.com");
    assert.equal(events.length, 1);
    assert.equal(events[0].start_date, "2026-10-12");
    assert.equal(events[0].url, "https://sympla.com/1");
  });

  it("transforma a página em texto com os links", () => {
    const html = `<html><head><style>.x{}</style></head><body><nav>Menu</nav>
      <h2>Agenda</h2><p>S&aacute;bado, 17/10 &ndash; <a href="/peca">Peça para crianças</a></p><script>alert(1)</script>
      <footer>Rodapé</footer></body></html>`;
    const text = htmlToText(html, "https://teatro.com/agenda");
    assert.match(text, /Agenda\nSábado, 17\/10 – Peça para crianças \(https:\/\/teatro\.com\/peca\)/);
    assert.doesNotMatch(text, /Menu|Rodapé|alert/);
    assert.equal(htmlToText("<p>abcdef</p>", "https://x.com", 3), "abc…");
    assert.equal(htmlToText("<p>A&Ccedil;&Atilde;O &#233; &#x41;</p>", "https://x.com"), "AÇÃO é A");
  });

  it("entende datas em vários formatos", () => {
    assert.equal(toIsoDay("2026-10-17T10:00:00Z"), "2026-10-17");
    assert.equal(toIsoDay("7/9/2026"), "2026-09-07");
    assert.equal(toIsoDay(Date.UTC(2026, 9, 17) / 1000), "2026-10-17");
    assert.equal(toIsoDay("amanhã"), null);
  });

  it("monta as anotações só com eventos futuros e guarda as fotos por endereço", () => {
    const results = [
      {
        ok: true,
        source: { name: "Teatro", url: "https://t.com" },
        text: "texto",
        events: [
          { title: "Antigo", start_date: "2026-10-01", end_date: "2026-10-01", url: "https://t.com/a", image: "https://t.com/a.jpg" },
          { title: "Novo", start_date: "2026-10-17", end_date: "2026-10-17", time: "16h", venue: "Teatro", url: "https://t.com/n" },
        ],
      },
      { ok: false, source: { name: "Fora do ar", url: "https://f.com" }, events: [], text: "" },
    ];
    const notes = sourcesToNotes(results, { today: "2026-10-10" });
    assert.match(notes, /Fonte fixa: Teatro/);
    assert.match(notes, /- Novo \| 2026-10-17 16h \| Teatro/);
    assert.doesNotMatch(notes, /Antigo|Fora do ar/);
    assert.equal(imagesByUrl(results).get("https://t.com/a"), "https://t.com/a.jpg");
  });
});

describe("matérias ligadas", () => {
  const html = `<main><a href="/noticias/teatro-infantil">Teatro infantil no sábado</a>
    <a href="/noticias/show-rock">Show de rock</a>
    <a href="https://outro.site/criancas">Crianças em outro site</a>
    <a href="/noticias/teatro-infantil">Teatro infantil no sábado</a>
    <a href="/familia"><span>Programa para a família</span></a></main>`;

  it("escolhe só links do mesmo site que falam de crianças, sem repetir", () => {
    const links = linksToFollow(html, "https://www.jornal.com/cultura");
    assert.deepEqual(
      links.map((l) => l.url),
      ["https://www.jornal.com/noticias/teatro-infantil", "https://www.jornal.com/familia"],
    );
    assert.equal(links[1].text, "Programa para a família");
    assert.equal(linksToFollow(html, "https://www.jornal.com/cultura", { limit: 1 }).length, 1);
  });

  it("põe as matérias abertas nas anotações", () => {
    const notes = sourcesToNotes(
      [
        {
          ok: true,
          source: { name: "Jornal", url: "https://jornal.com" },
          text: "manchetes",
          events: [],
          followed: [{ title: "Teatro infantil", url: "https://jornal.com/t", text: "Sábado, 16h, no Teatro X." }],
        },
      ],
      { today: "2026-10-10" },
    );
    assert.match(notes, /#### Matéria ligada: Teatro infantil \(https:\/\/jornal\.com\/t\)\nSábado, 16h/);
  });

  it("prefere o conteúdo principal da página quando ele existe", () => {
    const page = `<div class="menu">${"Menu ".repeat(50)}</div><main><p>${"Programação infantil. ".repeat(30)}</p></main>`;
    assert.doesNotMatch(htmlToText(page, "https://x.com"), /Menu/);
    assert.match(htmlToText("<div>Menu</div><main><p>curto</p></main>", "https://x.com"), /Menu/);
  });
});
