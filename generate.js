import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { renderPage } from "./template.js";

// ---- config ----
const MODEL = process.env.DIGEST_MODEL || "claude-sonnet-5"; // or "claude-opus-4-8"
const KEEP_DAYS = 7;
const OUT = "public";
const ARCHIVE = path.join(OUT, "archive");
const DATA = "data";
const SITE_URL = (process.env.SITE_URL || "https://YOUR-SITE.netlify.app").replace(/\/+$/, "");
const MAX_SEARCHES = Number(process.env.MAX_SEARCHES || 5); // per grouped call — lower = cheaper

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const now = new Date();

// ---- build at most once per Pacific day (extra backup-cron triggers exit for free) ----
const FORCE = process.env.FORCE === "true"; // manual runs bypass the guard
const dateKeyGuard = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);
if (!FORCE && fs.existsSync(path.join(DATA, `${dateKeyGuard}.json`))) {
  console.log(`Digest for ${dateKeyGuard} already built today. Skipping.`);
  process.exit(0);
}

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

// ---- repair pass: ask the model (no tools) to fix invalid JSON ----
async function repairJSON(broken) {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [{ role: "user", content:
`The text below is meant to be ONE valid JSON object but has errors (commonly an unescaped double-quote
inside a string value, or stray tags). Return ONLY the corrected, valid JSON object — no commentary, no
code fences. Replace any double-quote characters that appear INSIDE string values with single quotes;
do not otherwise change the data.

` + broken }],
  });
  return resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

// ---- one grouped call (small output → finishes cleanly). Handles pause_turn + a JSON repair retry. ----
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
    if (resp.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: resp.content }); continue; }
    break;
  }
  const raw = texts.join("");
  try {
    return extractJSON(raw);
  } catch (e) {
    console.warn("JSON parse failed; attempting a repair pass…");
    const fixed = await repairJSON(raw);
    return extractJSON(fixed); // if this still fails, the error propagates and the build stops
  }
}

// ---- digest skeleton ----
const digest = {
  date: humanDate,
  generatedAt,
  breaking: null,
  tabs: {
    defense: { defense: [], acquisitions: [] },
    us: [],
    pacific: { pacificCommand: [], pacingThreat: [] },
    europe: { ukraineRussia: [], europe: [] },
    middleEast: [],
    techAI: { aiCompetition: [], cyberEmerging: [] },
    cities: { lasVegas: [], nellis: [] },
    feelGood: [],
    onThisDay: [],
  },
  topPicks: [],
};

// ---- Call 1: breaking + US Defense ----
console.log("Fetching: breaking + US Defense…");
const g1 = await ask(`${persona}
Return JSON with these keys:
- "breaking": ONE object — the single most important news story of the day (any topic). For its "url",
  include a direct link to the SPECIFIC article ONLY if you have one from your search results; if you only
  have a homepage or section link, set "url" to an empty string "".
- "defense": array of 3 US Defense stories — 2 directly about US military updates and 1 about a coalition
  (allied / NATO) update.
- "acquisitions": array of 2 stories directly about US military acquisitions (programs, contracts, procurement).
Keep "defense" and "acquisitions" limited to US and NATO/allied topics; push anything centered on other
nations (China, Russia, etc.) to their own regions — do not place them here.
Shape: {"breaking": { }, "defense": [ ], "acquisitions": [ ]}
${RULES}`);
digest.breaking = g1.breaking;
digest.tabs.defense = { defense: g1.defense || [], acquisitions: g1.acquisitions || [] };

const EXCLUDE = digest.breaking && digest.breaking.headline
  ? `Do NOT include the day's already-covered top story: '${digest.breaking.headline}'.`
  : "";

// ---- Call 2: US ----
console.log("Fetching: US…");
const g2 = await ask(`${persona}
${EXCLUDE}
Return JSON: {"us": [ exactly 4 US politics / economy / courts stories ]}
${RULES}`);
digest.tabs.us = g2.us;

// ---- Call 3: Pacific ----
console.log("Fetching: Pacific…");
const g3 = await ask(`${persona}
${EXCLUDE}
Return JSON with two keys:
- "pacificCommand": array of 3 stories about countries in the Pacific region (Japan, Korea, the Philippines,
  Australia, India, other Indo-Pacific nations). You MAY include other nations' actions toward China, but do
  NOT make any of these 3 directly about China/PRC's own actions.
- "pacingThreat": array of 3 stories — 2 specifically about China/PRC actions or notable open-source
  intelligence on the PLA, and 1 about Taiwan.
Shape: {"pacificCommand": [ ], "pacingThreat": [ ]}
${RULES}`);
digest.tabs.pacific = { pacificCommand: g3.pacificCommand || [], pacingThreat: g3.pacingThreat || [] };

// ---- Call 4: Europe + Middle East ----
console.log("Fetching: Europe + Middle East…");
const g4 = await ask(`${persona}
${EXCLUDE}
Return JSON with three keys:
- "ukraineRussia": array of 2 stories directly about the Russia-Ukraine war.
- "europe": array of 2 stories — 1 about NATO defense and 1 about the single biggest current issue/topic
  facing European countries (non-defense is fine).
- "middleEast": array of 3 Middle East stories.
Shape: {"ukraineRussia": [ ], "europe": [ ], "middleEast": [ ]}
${RULES}`);
digest.tabs.europe = { ukraineRussia: g4.ukraineRussia || [], europe: g4.europe || [] };
digest.tabs.middleEast = g4.middleEast || [];

// ---- Call 5: Tech & AI ----
console.log("Fetching: Tech & AI…");
const g5 = await ask(`${persona}
${EXCLUDE}
Return JSON with two keys:
- "aiCompetition": array of 2 frontier-AI / labs / funding stories.
- "cyberEmerging": array of 2 cyber / AI-policy / emerging-tech stories.
Shape: {"aiCompetition": [ ], "cyberEmerging": [ ]}
${RULES}`);
digest.tabs.techAI.aiCompetition = g5.aiCompetition || [];
digest.tabs.techAI.cyberEmerging = g5.cyberEmerging || [];

// ---- Call 6: Las Vegas + Feel Good ----
console.log("Fetching: Las Vegas + Feel Good…");
const g6 = await ask(`${persona}
${EXCLUDE}
Return JSON with three keys:
- "lasVegas": array of 3 Las Vegas / Nevada local news stories.
- "nellis": array of 1 story specifically about Nellis Air Force Base, Creech Air Force Base, or the Nevada
  Test and Training Range (NTTR) — or notable military relations/activity in the Las Vegas area.
- "feelGood": array of 3 genuine acts-of-humanity stories that leave the reader feeling 'humanity remains
  good' — charitable giving (a large donation, a community rallying for a stranger), humanitarian efforts
  (including US military or service members doing good — disaster relief, rescues, aid), a long-held dream
  coming true for someone facing illness or hardship, or acts of generosity, kindness or rescue. Real,
  recent, specific stories with named people or organizations.
Shape: {"lasVegas": [ ], "nellis": [ ], "feelGood": [ ]}
${RULES}`);
digest.tabs.cities = { lasVegas: g6.lasVegas || [], nellis: g6.nellis || [] };
digest.tabs.feelGood = g6.feelGood || [];

// ---- Call 7: On This Day + Top Picks (no search) ----
console.log("Fetching: On This Day + Top Picks…");
const allStories = [
  digest.breaking,
  ...digest.tabs.defense.defense, ...digest.tabs.defense.acquisitions,
  ...digest.tabs.us,
  ...digest.tabs.pacific.pacificCommand, ...digest.tabs.pacific.pacingThreat,
  ...digest.tabs.europe.ukraineRussia, ...digest.tabs.europe.europe, ...digest.tabs.middleEast,
  ...digest.tabs.techAI.aiCompetition, ...digest.tabs.techAI.cyberEmerging,
  ...digest.tabs.cities.lasVegas, ...digest.tabs.cities.nellis,
  ...digest.tabs.feelGood,
].filter(Boolean);
const headlines = allStories.map((s) => s.headline);

const extras = await ask(`Today is ${humanDate}. Return JSON with two keys:
- "onThisDay": array of exactly 4 real historical events that happened on this calendar date, each
  {"year": "", "event": ""} (a one-sentence description).
- "topPicks": choose the 3 highest-impact stories from the headline list below and write a one-sentence
  teaser for each (max ~20 words), each {"headline": "", "teaser": ""}. Use the headline text exactly as given.
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

// ---- render every kept day ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(ARCHIVE, { recursive: true });
for (const key of keptKeys) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, `${key}.json`), "utf8"));
  const pageUrl = key === keptKeys[0] ? SITE_URL : `${SITE_URL}/archive/${key}.html`;
  const html = renderPage({ digest: d, navDates, currentKey: key, pageUrl });
  fs.writeFileSync(path.join(ARCHIVE, `${key}.html`), html);
  if (key === keptKeys[0]) fs.writeFileSync(path.join(OUT, "index.html"), html);
}

// ---- share blurb ----
const picks = Array.isArray(digest.topPicks) ? digest.topPicks.slice(0, 3) : [];
const share =
  `📰 Daily Digest — ${humanDate}\n${SITE_URL}\n\nToday's 3 biggest:\n` +
  picks.map((p, i) => `${i + 1}. ${p.headline} — ${p.teaser}`).join("\n");
fs.writeFileSync(path.join(OUT, "share.txt"), share);
console.log("\n----- SHARE BLURB (copy me) -----\n" + share + "\n---------------------------------\n");

// ---- optional email via Resend ----
if (process.env.RESEND_API_KEY && process.env.EMAIL_TO) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
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
