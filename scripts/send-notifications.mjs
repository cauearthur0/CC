#!/usr/bin/env node
// Envia as notificações do dia (lembretes da agenda, novidades e chuva) para os celulares que ligaram
// os avisos no app. Roda no GitHub Actions de manhã e à tardinha (workflow "Notificações").
//
// Precisa da chave secreta do Supabase em SUPABASE_SECRET_KEY (segredo do repositório no GitHub).
// Na primeira vez, cria as chaves das notificações (VAPID) e guarda no próprio banco.
//
// Uso: SUPABASE_SECRET_KEY=... node scripts/send-notifications.mjs [--mode manha|noite] [--dry-run]

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { SUPABASE_URL } from "../web/lib/config.js";
import { addDays, todayIn } from "../web/lib/dates.js";
import { planNotifications } from "./lib/notifications.mjs";

const RAIN_THRESHOLD = 60;
const APP_URL = "https://cauearthur0.github.io/CC/";

const { values } = parseArgs({ options: { mode: { type: "string" }, "dry-run": { type: "boolean" } } });

const secret = process.env.SUPABASE_SECRET_KEY;
if (!secret) {
  console.log("SUPABASE_SECRET_KEY não configurada: as notificações ficam desligadas. Veja o README.");
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL || SUPABASE_URL;
const sb = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/** Chaves VAPID: lê do banco ou, na primeira vez, cria e guarda. */
async function vapidKeys() {
  const rows = await must(sb.from("app_secrets").select("name, value"), "ler as chaves");
  const get = (name) => rows.find((r) => r.name === name)?.value;
  if (get("vapid_public") && get("vapid_private"))
    return { publicKey: get("vapid_public"), privateKey: get("vapid_private") };
  const keys = webpush.generateVAPIDKeys();
  await must(
    sb.from("app_secrets").upsert([
      { name: "vapid_public", value: keys.publicKey },
      { name: "vapid_private", value: keys.privateKey },
    ]),
    "guardar as chaves",
  );
  console.log("Chaves das notificações criadas e guardadas no banco.");
  return keys;
}

/** Se vai chover (probabilidade máxima ≥ 60%) no sábado ou no domingo seguintes. */
async function rainyWeekend(city, today) {
  try {
    const params = new URLSearchParams({
      latitude: city.lat,
      longitude: city.lng,
      daily: "precipitation_probability_max",
      timezone: city.timezone,
      forecast_days: "4",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    const { daily } = await response.json();
    const weekend = [addDays(today, 1), addDays(today, 2)];
    return daily.time.some(
      (day, i) => weekend.includes(day) && daily.precipitation_probability_max[i] >= RAIN_THRESHOLD,
    );
  } catch {
    return false;
  }
}

async function main() {
  const { cities, default: defaultSlug } = JSON.parse(
    await readFile(new URL("../web/data/cities.json", import.meta.url), "utf8"),
  );
  const cityOf = (slug) => cities.find((c) => c.slug === slug) ?? cities.find((c) => c.slug === defaultSlug);

  const subscriptions = await must(
    sb.from("push_subscriptions").select("endpoint, family_id, p256dh, auth, prefs"),
    "ler as assinaturas",
  );
  const keys = await vapidKeys();
  if (!subscriptions.length) {
    console.log("Nenhum celular com notificações ligadas.");
    return;
  }
  webpush.setVapidDetails(APP_URL, keys.publicKey, keys.privateKey);

  const familyIds = [...new Set(subscriptions.map((s) => s.family_id))];
  const families = await must(sb.from("families").select("id, data").in("id", familyIds), "ler as famílias");
  const familyById = new Map(families.map((f) => [f.id, f.data ?? {}]));
  const sent = await must(
    sb
      .from("notification_log")
      .select("endpoint, kind, ref")
      .in(
        "endpoint",
        subscriptions.map((s) => s.endpoint),
      ),
    "ler o histórico",
  );
  const alreadySent = new Set(sent.map((r) => `${r.endpoint}|${r.kind}|${r.ref}`));

  const eventsBySlug = new Map();
  const rainBySlug = new Map();
  let delivered = 0;
  let removed = 0;

  for (const sub of subscriptions) {
    const data = familyById.get(sub.family_id) ?? {};
    const city = cityOf(data.city?.value);
    const today = todayIn(city.timezone);
    const hour = Number(
      new Date().toLocaleString("en-US", { timeZone: city.timezone, hour: "numeric", hour12: false }),
    );
    const mode = values.mode || process.env.NOTIFY_MODE || (hour < 14 ? "manha" : "noite");

    if (!eventsBySlug.has(city.slug)) {
      const file = new URL(`../web/data/events/${city.slug}.json`, import.meta.url);
      eventsBySlug.set(city.slug, JSON.parse(await readFile(file, "utf8").catch(() => '{"events":[]}')).events);
    }
    if (mode === "noite" && !rainBySlug.has(city.slug)) rainBySlug.set(city.slug, await rainyWeekend(city, today));

    const plans = planNotifications({
      mode,
      today,
      family: data,
      prefs: sub.prefs ?? {},
      events: eventsBySlug.get(city.slug),
      rainyWeekend: rainBySlug.get(city.slug) ?? false,
    }).filter((p) => !alreadySent.has(`${sub.endpoint}|${p.kind}|${p.ref}`));

    for (const plan of plans) {
      if (values["dry-run"]) {
        console.log(`(teste) ${plan.kind}: ${plan.title} — ${plan.body}`);
        continue;
      }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: plan.title, body: plan.body, url: plan.url, tag: plan.tag }),
          { TTL: 6 * 3600, urgency: plan.kind === "lembrete" ? "high" : "normal" },
        );
        await must(
          sb.from("notification_log").insert({ endpoint: sub.endpoint, kind: plan.kind, ref: plan.ref }),
          "anotar o envio",
        );
        delivered++;
      } catch (error) {
        // 404/410: o celular desligou as notificações ou desinstalou o app.
        if (error.statusCode === 404 || error.statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          removed++;
          break;
        }
        console.warn(`⚠ Não foi possível enviar (${error.statusCode ?? ""} ${error.message})`);
      }
    }
  }

  // Histórico de mais de 60 dias não é mais necessário.
  const limit = new Date(Date.now() - 60 * 86_400_000).toISOString();
  await sb.from("notification_log").delete().lt("sent_at", limit);

  console.log(
    `✔ ${subscriptions.length} celular(es); ${delivered} notificação(ões) enviada(s)` +
      (removed ? `; ${removed} celular(es) sem notificações removido(s)` : "") +
      ".",
  );
}

main().catch((error) => {
  console.error(`✖ ${error.message}`);
  process.exit(1);
});
