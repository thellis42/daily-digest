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
const MAX_SEARCHES = Number(process.env.MAX_SEARCHES || 6); // per grouped call — lower = cheaper

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const now = new Date();

// ---- dates & timestamp (Pacific) ----
const humanDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long", year: "numeric", month: "long", day: "numeric",
}).format(now);
const dateKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);
const generatedAt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
}).format(now);

// ---- shared prompt pieces ----
const persona = `You are the editor of a daily news digest for a reader in Las Vegas interested in national
security, defense, geopolitics, the Indo-Pacific, and frontier AI. Today is ${humanDate}. Use web search to
find the most important developments from roughly the last 36 hours. Paraphrase in your own words — never
copy sentences from sources. Each summary is 2-4 sentences, analytical and specific (names, numbers, dates).`;

const RULES = `
FORMATTING RULES — the output MUST be valid JSON:
- Return ONLY the JSON object described. No markdown fences, no preamble, no commentary.
- Do NOT include citation markup: no <cite> tags, no index numbers, no footnotes.
- NEVER use the double-quote character (") inside any text value; use single quotes (') for quotations.
  Double quotes may only be JSON's own string delimiters.
- Each story object MUST have exactly: "headline", "body", "source", "url" — where "url" is the article
  link from your search results (if unsure, use the outlet homepage; never invent a URL).`;

// ---- JSON extractor ----
function extractJSON(s) {
  let t = s.replace(/```json/gi, "```").replace(/```/g, "").trim();
  t = t.replace(/<\/?cite[^>]*>/gi, "");
  const first = t.indexOf("{"), last = t.lastIndexOf("}");
  if (first === -1 || last === -1) throw new Error("No JSON found in model output");
  return JSON.parse(t.slice(first, last + 1));
}

// ---- one grouped call (small output → finishes cleanly). Handles pause_turn. ----
async function ask(prompt, { search = true } = {}) {
  const messages = [{ role: "user", content: prompt }];
  const texts = [];
  for (let i = 0; i < 15; i++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      ...(search ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES }] } : {}),
      messages,
    });
    for (const b of resp.content) if (b.type === "text") texts.push(b.text);
    if (resp.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: resp.content });
      continue;
    }
    break;
  }
  return extractJSON(texts.join(""));
}

// ---- assemble the digest one group at a time ----
const digest = {
  date: humanDate,
  generatedAt,
  breaking: null,
  tabs: {
    defense: [], us: [], pacific: [], europe: [], middleEast: [],
    techAI: { aiCompetition: [], cyberEmerging: [] },
    cities: [], feelGood: [], onThisDay: [],
  },
  topPicks: [],
};

console.log("Fetching: breaking + defense…");
const g1 = await ask(`${persona}
Return JSON with two keys:
- "breaking": ONE object — the single biggest news story of the day (any topic).
- "defense": array of exactly 5 defense / military stories.
Shape: {"breaking": { }, "defense": [ ]}
${RULES}`);
digest.breaking = g1.breaking;
digest.tabs.defense = g1.defense;

console.log("Fetching: US…");
const g2 = await ask(`${persona}
Return JSON: {"us": [ exactly 4 US politics / economy / courts stories ]}
${RULES}`);
digest.tabs.us = g2.us;

console.log("Fetching: Pacific…");
const g3 = await ask(`${persona}
Return JSON: {"pacific": [ exactly 5 China / Taiwan / Korea / Japan / Indo-Pacific stories ]}
${RULES}`);
digest.tabs.pacific = g3.pacific;

console.log("Fetching: Europe + Middle East…");
const g4 = await ask(`${persona}
Return JSON with two keys:
- "europe": array of exactly 4 Europe stories (including Russia / Ukraine).
- "middleEast": array of exactly 3 Middle East stories.
Shape: {"europe": [ ], "middleEast": [ ]}
${RULES}`);
digest.tabs.europe = g4.europe;
digest.tabs.middleEast = g4.middleEast;

console.log("Fetching: Tech & AI…");
const g5 = await ask(`${persona}
Return JSON with two keys:
- "aiCompetition": array of exactly 3 frontier-AI / labs / funding stories.
- "cyberEmerging": array of exactly 2 cyber / AI-policy / emerging-tech stories.
Shape: {"aiCompetition": [ ], "cyberEmerging": [ ]}
${RULES}`);
digest.tabs.techAI.aiCompetition = g5.aiCompetition;
digest.tabs.techAI.cyberEmerging = g5.cyberEmerging;

console.log("Fetching: Las Vegas + Feel Good…");
const g6 = await ask(`${persona}
Return JSON with two keys:
- "cities": array of exactly 3 Las Vegas / Nevada local news stories.
- "feelGood": array of exactly 3 genuine acts-of-humanity stories that leave the reader feeling 'humanity
  remains good' — charitable giving (a large donation, a community rallying for a stranger), humanitarian
  efforts (including US military or service members doing good — disaster relief, rescues, aid), a long-held
  dream coming true for someone facing illness or hardship, or acts of generosity, kindness or rescue. Real,
  recent, specific stories with named people or organizations.
Shape: {"cities": [ ], "feelGood": [ ]}
${RULES}`);
digest.tabs.cities = g6.cities;
digest.tabs.feelGood = g6.feelGood;

// ---- final no-search call: On This Day + Top Picks (chosen from today's headlines) ----
console.log("Fetching: On This Day + Top Picks…");
const allStories = [
  digest.breaking,
  ...digest.tabs.defense, ...digest.tabs.us, ...digest.tabs.pacific,
  ...digest.tabs.europe, ...digest.tabs.middleEast,
  ...digest.tabs.techAI.aiCompetition, ...digest.tabs.techAI.cyberEmerging,
  ...digest.tabs.cities, ...digest.tabs.feelGood,
].filter(Boolean);
const headlines = allStories.map((s) => s.headline);

const extras = await ask(`Today is ${humanDate}. Return JSON with two keys:
- "onThisDay": array of exactly 4 real historical events that happened on this calendar date, each
  {"year": "", "event": ""} (a one-sentence description).
- "topPicks": choose the 3 highest-impact stories from the headline list below and write a one-sentence
  teaser for each (max ~20 words, written to make a reader want to click), each {"headline": "", "teaser": ""}.
  Use the headline text exactly as given.
Headlines:
${headlines.map((h) => "- " + h).join("\n")}

FORMATTING RULES: return ONLY the JSON object; no fences, preamble, or commentary; never use the
double-quote character (") inside any text value (use single quotes).`, { search: false });
digest.tabs.onThisDay = extras.onThisDay || [];
digest.topPicks = extras.topPicks || [];

// ---- persist today's data ----
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

// ---- share blurb (link + 3 biggest) ----
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
