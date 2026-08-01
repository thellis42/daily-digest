import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { renderPage } from "./template.js";

// ---- config ----
const MODEL = process.env.DIGEST_MODEL || "claude-sonnet-5"; // or "claude-opus-4-8" for richer writing
const KEEP_DAYS = 7;
const OUT = "public";
const ARCHIVE = path.join(OUT, "archive");
const DATA = "data";
const SITE_URL = (process.env.SITE_URL || "https://YOUR-SITE.netlify.app").replace(/\/+$/, "");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const now = new Date();

// This script builds every time it runs. Scheduling (twice daily) lives in the two
// cron entries in .github/workflows/daily.yml. A later run on the same Pacific day
// overwrites — i.e. refreshes — that day's page and its archive entry.

// ---- dates & timestamp (Pacific) ----
const humanDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long", year: "numeric", month: "long", day: "numeric",
}).format(now);
const dateKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(now); // "2026-07-28"
const generatedAt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
}).format(now); // "Tue, Jul 28, 8:00 AM PDT"

// ---- the editorial brief ----
const prompt = `You are the editor of a personal daily news digest for a reader in Las Vegas with strong
interests in national security, defense policy, geopolitics, the Indo-Pacific, and frontier AI.

Today is ${humanDate}. Using web search, research the most important developments from roughly the
last 36 hours and write concise, original summaries. PARAPHRASE everything in your own words — never
copy sentences from sources. Keep each summary 2-4 sentences, analytical and specific (names, numbers,
dates). Cover these sections and item counts:

- breaking: the single biggest story (1 item)
- defense: 5 items
- us: 4 items (US politics/economy/courts)
- pacific: 5 items (China, Taiwan, Korea, Japan, Indo-Pacific)
- europe: 4 items (incl. Russia/Ukraine)
- middleEast: 3 items
- techAI.aiCompetition: 3 items (frontier models, labs, funding)
- techAI.cyberEmerging: 2 items (cyber, AI policy, emerging tech)
- cities: 3 items (Las Vegas / Nevada local news)
- feelGood: 3 items — genuine acts-of-humanity stories that leave the reader feeling
  'humanity remains good.' Prioritize: charitable giving (someone donates a large sum,
  a community rallies for a stranger), humanitarian efforts (including US military or
  service members doing good — disaster relief, rescues, aid), a long-held dream coming
  true for someone facing illness or hardship, acts of generosity, kindness, or rescue.
  Avoid generic science/space/tech items here unless they directly help people in a
  moving, human way. Each should be a real, recent, specific story with named people or
  organizations where possible.
- onThisDay: 4 real historical events that occurred on this calendar date
- topPicks: the 3 HIGHEST-IMPACT stories of the day, each with a one-sentence teaser (max ~20 words)
  written to make a reader want to click. Editorial picks across all sections.

Each story object MUST have exactly: "headline", "body", "source". onThisDay items MUST have exactly:
"year", "event". topPicks items MUST have exactly: "headline", "teaser".

FORMATTING RULES — the output MUST be valid JSON, so follow these exactly:
- Return ONLY a single JSON object. No markdown fences, no preamble, no commentary.
- Do NOT include citation markup of any kind: no <cite> tags, no index numbers, no footnotes.
- NEVER use the double-quote character (") inside any text value. If you need to quote a
  word or phrase, use single quotes ('). Double quotes may only be JSON's own string delimiters.

Return the JSON in exactly this shape:
{
  "breaking": { "headline": "", "body": "", "source": "" },
  "tabs": {
    "defense": [], "us": [], "pacific": [], "europe": [], "middleEast": [],
    "techAI": { "aiCompetition": [], "cyberEmerging": [] },
    "cities": [], "feelGood": [], "onThisDay": []
  },
  "topPicks": []
}`;

// ---- call the API (loop to handle web-search "pause_turn" continuations) ----
async function research() {
  const messages = [{ role: "user", content: prompt }];
  const texts = [];
  let lastStop = null;
  // Loop ceiling (25) sits comfortably above the search budget (max_uses 12), so the
  // model always finishes searching and writes its JSON before the loop ends.
  for (let i = 0; i < 25; i++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 }],
      messages,
    });
    lastStop = resp.stop_reason;
    for (const b of resp.content) if (b.type === "text") texts.push(b.text);
    if (resp.stop_reason === "pause_turn") {
      // model paused mid-turn (still searching): feed its progress back and continue
      messages.push({ role: "assistant", content: resp.content });
      continue;
    }
    break; // end_turn (or max_tokens) — the turn is complete
  }
  const out = texts.join("\n");
  if (!out.trim()) {
    console.error(`No text returned. Last stop_reason: ${lastStop}. The model may still have been searching when the loop ended.`);
  }
  return out;
}

const rawText = await research();

function extractJSON(s) {
  let t = s.replace(/```json/gi, "```").replace(/```/g, "").trim();
  t = t.replace(/<\/?cite[^>]*>/gi, ""); // strip any citation tags the model added
  const first = t.indexOf("{"), last = t.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON found in model output");
  return JSON.parse(t.slice(first, last + 1));
}

let digest;
try {
  digest = extractJSON(rawText);
} catch (e) {
  console.error("Failed to parse model output. Raw text was:\n", rawText);
  throw e; // fail the run so a broken page never deploys
}

digest.date = humanDate;
digest.generatedAt = generatedAt;

// ---- persist today's data (source of truth) ----
fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(path.join(DATA, `${dateKey}.json`), JSON.stringify(digest, null, 2));

// ---- prune to KEEP_DAYS ----
const dataFiles = fs.readdirSync(DATA).filter((f) => f.endsWith(".json")).sort().reverse();
for (const f of dataFiles.slice(KEEP_DAYS)) fs.rmSync(path.join(DATA, f));
const keptKeys = dataFiles.slice(0, KEEP_DAYS).map((f) => f.replace(".json", ""));

// ---- nav (newest first) ----
function labelFor(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(dt);
}
const navDates = keptKeys.map((key, i) => ({
  key, label: labelFor(key),
  href: i === 0 ? "/" : `/archive/${key}.html`,
  isNewest: i === 0,
}));

// ---- render every kept day (rebuild public/ from scratch) ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(ARCHIVE, { recursive: true });
for (const key of keptKeys) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, `${key}.json`), "utf8"));
  const pageUrl = key === keptKeys[0] ? SITE_URL : `${SITE_URL}/archive/${key}.html`;
  const html = renderPage({ digest: d, navDates, currentKey: key, pageUrl });
  fs.writeFileSync(path.join(ARCHIVE, `${key}.html`), html);
  if (key === keptKeys[0]) fs.writeFileSync(path.join(OUT, "index.html"), html);
}

// ---- build the share blurb (link + 3 biggest) ----
const picks = Array.isArray(digest.topPicks) ? digest.topPicks.slice(0, 3) : [];
const share =
  `📰 Daily Digest — ${humanDate}\n${SITE_URL}\n\nToday's 3 biggest:\n` +
  picks.map((p, i) => `${i + 1}. ${p.headline} — ${p.teaser}`).join("\n");
fs.writeFileSync(path.join(OUT, "share.txt"), share);
console.log("\n----- SHARE BLURB (copy me) -----\n" + share + "\n---------------------------------\n");

// ---- optional: email the blurb via Resend ----
if (process.env.RESEND_API_KEY && process.env.EMAIL_TO) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Daily Digest <onboarding@resend.dev>",
      to: [process.env.EMAIL_TO],
      subject: `📰 Daily Digest — ${humanDate}`,
      text: share + `\n\nGenerated ${generatedAt}`,
    }),
  });
  console.log("Email send status:", r.status);
}

console.log(`Done. Days live: ${keptKeys.join(", ")}`);
