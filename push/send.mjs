// Prazos — daily push sender (GitHub Actions). Reads subscriptions from Make, computes today's reminders
// with the same core.js the pages use, sends Web Push (VAPID). Expired subscriptions are cleared in Make.
// Env: PRAZOS_FEED (Make feed URL with token), VAPID_PRIVATE_KEY, TZ=Atlantic/Madeira.
// Optional: ONLY_ID (send only to this id), MODE=test (send the next reminder now, regardless of the date).
import { createRequire } from "node:module";
import webpush from "web-push";
const require = createRequire(import.meta.url);
const C = require("../core.js");
const CAL = require("../data/calendar.json");
const L = Object.fromEntries(["pt", "en", "ru", "es", "de"].map((l) => [l, require(`../ui.${l}.json`)]));
const INTAKE = "https://hook.eu1.make.com/h9f3r1x7ltqgzv7eenkym5c90bi2aeff";
const VAPID_PUBLIC = "BAbRt4UjsPAPDAUp-9AMhp1awelvhFl551PY_j0CW4PeeOyJLUUhcvojNakkZ3nnYBglp6gLNjbYO3mn2SdYGfo";

const { PRAZOS_FEED, VAPID_PRIVATE_KEY, ONLY_ID = "", MODE = "daily" } = process.env;
if (!PRAZOS_FEED || !VAPID_PRIVATE_KEY) { console.error("secrets PRAZOS_FEED / VAPID_PRIVATE_KEY are missing"); process.exit(1); }
webpush.setVapidDetails("mailto:igor@seedwave.pt", VAPID_PUBLIC, VAPID_PRIVATE_KEY);

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const feed = await (await fetch(PRAZOS_FEED)).text();
const rows = feed.split("\n").map((l) => l.split("\t")).filter((r) => r[0] && r[0].startsWith("pz_") && r[1]);
let sent = 0, skipped = 0, gone = 0;

for (const [id, b64] of rows) {
  if (ONLY_ID && id !== ONLY_ID) continue;
  let st;
  try { st = JSON.parse(Buffer.from(b64, "base64").toString("utf8")); } catch { skipped++; continue; }
  if (!st || !st.sub || !st.a || !st.a.start) { skipped++; continue; }
  const lang = L[st.lang] ? st.lang : "pt";
  let items = C.due(st.a, today, CAL, st.done || {});
  if (MODE === "test" && !items.length) {
    const e = C.build(st.a, today, CAL).ev.find((x) => !x.light && !(st.done || {})[C.uid(x)]);
    if (e) items = [{ e, why: e.isOpen ? "open" : "soon" }];
  }
  for (const { e, why } of items) {
    const msg = C.notify(e, why, L[lang], CAL, lang, st.mode === "clara" ? "clara.html" : "lite.html");
    try {
      await webpush.sendNotification(st.sub, JSON.stringify(msg), { TTL: 60 * 60 * 20, urgency: "normal" });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        gone++;
        await fetch(INTAKE, { method: "POST", body: new URLSearchParams({ id, state: "" }) }).catch(() => {});
        break;
      }
      console.error(id, err.statusCode || "", err.body || err.message);
    }
  }
}
console.log(`date ${C.ymd(today)} · subscriptions ${rows.length} · sent ${sent} · skipped ${skipped} · expired ${gone}`);
