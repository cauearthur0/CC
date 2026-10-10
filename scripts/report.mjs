#!/usr/bin/env node
// Relatório de audiência: quantas famílias usaram o app e quantas viram, abriram e clicaram em cada rolê
// (inclusive nos destaques patrocinados). Só totais anônimos. Roda no GitHub Actions (workflow "Relatório").
//
// Uso: SUPABASE_SECRET_KEY=... node scripts/report.mjs [--days 30]

import { appendFile, readFile, readdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../web/lib/config.js";
import { renderReport } from "./lib/report.mjs";

const { values } = parseArgs({ options: { days: { type: "string", default: "30" } } });
const days = Math.max(1, Math.min(365, Number(values.days) || 30));

const secret = process.env.SUPABASE_SECRET_KEY;
if (!secret) {
  console.log("SUPABASE_SECRET_KEY não configurada: não há como ler os números. Veja o README.");
  process.exit(0);
}
const sb = createClient(process.env.SUPABASE_URL || SUPABASE_URL, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const since = new Date(Date.now() - days * 86_400_000);
const sinceDay = since.toISOString().slice(0, 10);

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function allRows() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await must(
      sb
        .from("event_stats")
        .select("day, event_id, kind, count")
        .gte("day", sinceDay)
        .range(from, from + 999),
      "ler os números",
    );
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function main() {
  const dataDir = new URL("../web/data/", import.meta.url);
  const titles = new Map();
  for (const file of await readdir(new URL("events/", dataDir))) {
    const { events = [] } = JSON.parse(await readFile(new URL(`events/${file}`, dataDir), "utf8"));
    for (const e of events) titles.set(e.id, e.title);
  }
  const { destaques = [] } = JSON.parse(await readFile(new URL("destaques.json", dataDir), "utf8"));
  const sponsored = destaques
    .filter((d) => !d.until || d.until >= sinceDay)
    .map((d) => {
      const eventId = d.event_id ?? d.event?.id ?? `patrocinado-${d.id}`;
      if (d.event?.title) titles.set(eventId, d.event.title);
      return { eventId, sponsor: d.sponsor ?? "" };
    });

  const rows = await allRows();
  const { count: requests } = await sb
    .from("ad_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString());

  const report = renderReport({ rows, titles, sponsored, days, requests: requests ?? 0 });
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
