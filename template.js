// Renders one full standalone HTML page from a digest object.
export function renderPage({ digest, navDates, currentKey, pageUrl }) {
  const TAB_CONFIG = [
    { key: "defense", label: "🛡️ US Defense", color: "#1d4ed8" },
    { key: "us", label: "🇺🇸 US", color: "#7c3aed" },
    { key: "pacific", label: "🌏 Pacific", color: "#0f766e" },
    { key: "europe", label: "🌍 Europe", color: "#b45309" },
    { key: "middleEast", label: "🕌 Middle East", color: "#be185d" },
    { key: "techAI", label: "⚡ Tech & AI", color: "#0369a1" },
    { key: "cities", label: "🏙️ Las Vegas", color: "#ea580c" },
    { key: "feelGood", label: "✨ Feel Good", color: "#15803d" },
  ];
  // Tabs whose content is split into labeled sub-sections. Each: data key + heading + accent.
  const SUBSECTIONS = {
    defense: [
      { key: "defense", label: "Defense", color: "#1d4ed8" },
      { key: "acquisitions", label: "Acquisitions", color: "#0ea5e9" },
    ],
    pacific: [
      { key: "pacificCommand", label: "Pacific Command", color: "#0f766e" },
      { key: "pacingThreat", label: "Pacing Threat", color: "#dc2626" },
    ],
    europe: [
      { key: "ukraineRussia", label: "Ukraine-Russia War", color: "#b45309" },
      { key: "europe", label: "Europe", color: "#0ea5e9" },
    ],
    techAI: [
      { key: "aiCompetition", label: "AI & Competition", color: "#0369a1" },
      { key: "cyberEmerging", label: "Cyber & Emerging Tech", color: "#0ea5e9" },
    ],
    cities: [
      { key: "lasVegas", label: "Las Vegas", color: "#ea580c" },
      { key: "nellis", label: "Nellis/Creech/NTTR", color: "#0ea5e9" },
    ],
  };
  const payload = JSON.stringify({ digest, navDates, currentKey, pageUrl, TAB_CONFIG, SUBSECTIONS }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Daily Digest — ${digest.date}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:#0f172a; font-family:'Inter',system-ui,-apple-system,sans-serif; color:#e2e8f0; padding-bottom:40px; }
  .wrap { max-width:720px; margin:0 auto; }
  .header { background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%); padding:20px 20px 16px; border-bottom:1px solid #1e293b; }
  .header-row { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .eyebrow { font-size:11px; color:#475569; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:4px; }
  .date { font-size:22px; font-weight:800; color:#f8fafc; letter-spacing:-0.5px; }
  .share-btn { margin-top:12px; background:#1e3a5f; color:#93c5fd; border:1px solid #2c4a6e; border-radius:8px; padding:8px 14px; font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s ease; }
  .share-btn:hover { background:#24466f; }
  .share-btn.copied { background:#14532d; color:#86efac; border-color:#166534; }
  .badge { background:#1e3a5f; border-radius:8px; padding:6px 12px; font-size:11px; color:#60a5fa; font-weight:700; text-align:center; white-space:nowrap; }
  .badge span { display:block; font-weight:400; color:#94a3b8; font-size:10px; margin-top:2px; }
  .navbar { background:#0f172a; border-bottom:1px solid #1e293b; overflow-x:auto; }
  .navbar-inner { display:flex; align-items:center; gap:6px; padding:10px 16px; max-width:720px; margin:0 auto; width:max-content; min-width:100%; }
  .nav-caption { font-size:10px; color:#475569; font-weight:700; letter-spacing:1px; text-transform:uppercase; margin-right:4px; white-space:nowrap; }
  .nav-day { text-decoration:none; background:#1e293b; color:#94a3b8; border-radius:6px; padding:5px 10px; font-size:12px; font-weight:600; white-space:nowrap; }
  .nav-day.current { background:#334155; color:#f1f5f9; }
  .breaking { background:linear-gradient(90deg,#7f1d1d 0%,#991b1b 100%); border-bottom:2px solid #dc2626; padding:12px 20px; }
  .breaking-inner { display:flex; align-items:flex-start; gap:12px; }
  .breaking-tag { background:#dc2626; color:#fff; font-size:10px; font-weight:800; letter-spacing:1px; padding:3px 8px; border-radius:4px; white-space:nowrap; margin-top:1px; flex-shrink:0; }
  .breaking-head { font-weight:700; color:#fecaca; font-size:14px; margin-bottom:4px; }
  .breaking-body { color:#fca5a5; font-size:12.5px; line-height:1.55; }
  .breaking-src { margin-top:6px; font-size:11px; color:#f87171; font-weight:600; }
  .breaking-link { display:none; margin-top:6px; margin-left:10px; font-size:11px; font-weight:700; color:#fecaca; text-decoration:underline; }
  .tabbar { overflow-x:auto; background:#0f172a; border-bottom:1px solid #1e293b; -webkit-overflow-scrolling:touch; }
  .tabbar-inner { display:flex; gap:6px; padding:12px 16px; max-width:720px; margin:0 auto; width:max-content; min-width:100%; }
  .tab { background:#1e293b; color:#94a3b8; border:none; border-radius:8px; padding:8px 14px; font-size:12.5px; font-weight:500; cursor:pointer; white-space:nowrap; transition:all .15s ease; font-family:inherit; }
  .tab.active { color:#fff; font-weight:700; }
  .content { max-width:720px; margin:0 auto; padding:16px 16px 0; }
  .tab-label { display:flex; align-items:center; gap:8px; margin-bottom:16px; }
  .tab-bar-accent { width:4px; height:20px; border-radius:2px; flex-shrink:0; }
  .tab-title { font-weight:700; color:#f1f5f9; font-size:16px; }
  .card { background:#1e293b; border-radius:10px; padding:16px 18px; margin-bottom:12px; box-shadow:0 1px 4px rgba(0,0,0,.3); }
  .card-head { font-weight:700; color:#f1f5f9; font-size:15px; line-height:1.4; margin-bottom:8px; }
  .card-body { color:#94a3b8; font-size:13.5px; line-height:1.65; }
  .toggle { margin-top:8px; background:none; border:none; font-size:12px; cursor:pointer; padding:0; font-weight:600; font-family:inherit; }
  .card-src { display:inline-block; background:rgba(255,255,255,.06); border-radius:4px; padding:2px 8px; font-size:11px; color:#64748b; font-weight:600; letter-spacing:.3px; }
  .card-footer { margin-top:10px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
  .read-link { font-size:12px; font-weight:700; text-decoration:none; white-space:nowrap; }
  .read-link:hover { text-decoration:underline; }
  .section-head { font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; margin-bottom:10px; margin-top:18px; padding-bottom:6px; }
  .otd { background:#1e293b; border-radius:10px; padding:16px 18px; margin-top:4px; }
  .otd-head { font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; margin-bottom:12px; padding-bottom:6px; }
  .otd-row { display:flex; gap:12px; margin-bottom:10px; }
  .otd-year { min-width:42px; font-weight:700; font-size:13px; }
  .otd-event { color:#94a3b8; font-size:13px; line-height:1.5; }
  .toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:#14532d; color:#dcfce7; border:1px solid #166534; padding:10px 18px; border-radius:10px; font-size:13px; font-weight:600; opacity:0; pointer-events:none; transition:opacity .2s ease; z-index:50; }
  .toast.show { opacity:1; }
  .footer { margin-top:24px; padding-top:16px; border-top:1px solid #1e293b; color:#334155; font-size:11px; text-align:center; line-height:1.7; }
</style>
</head>
<body>
  <div class="header"><div class="wrap"><div class="header-row">
    <div>
      <div class="eyebrow">Daily Digest</div>
      <div class="date" id="digest-date"></div>
      <button class="share-btn" id="share-btn" onclick="copyShare()">▸ Share this digest</button>
    </div>
    <div class="badge">🔄 updated<span id="stamp"></span></div>
  </div></div></div>

  <div class="breaking"><div class="wrap"><div class="breaking-inner">
    <div class="breaking-tag">⚡ BREAKING</div>
    <div>
      <div class="breaking-head" id="breaking-head"></div>
      <div class="breaking-body" id="breaking-body"></div>
      <span class="breaking-src" id="breaking-src"></span>
      <a class="breaking-link" id="breaking-link" target="_blank" rel="noopener noreferrer">Read full article →</a>
    </div>
  </div></div></div>

  <div class="navbar"><div class="navbar-inner" id="navbar"></div></div>

  <div class="tabbar"><div class="tabbar-inner" id="tabbar"></div></div>

  <div class="content">
    <div class="tab-label"><div class="tab-bar-accent" id="tab-accent"></div><div class="tab-title" id="tab-title"></div></div>
    <div id="tab-content"></div>
    <div class="footer" id="footer"></div>
  </div>

  <div class="toast" id="toast">✓ Copied to clipboard</div>

<script>
const STATE = ${payload};
const DIGEST = STATE.digest, NAV = STATE.navDates, CURRENT = STATE.currentKey, PAGE_URL = STATE.pageUrl;
const TAB_CONFIG = STATE.TAB_CONFIG, SUBSECTIONS = STATE.SUBSECTIONS;
let activeTab = "defense";

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

// ---- share ----
function buildBlurb(){
  const picks = (DIGEST.topPicks||[]).slice(0,3);
  return "📰 Daily Digest — " + DIGEST.date + "\\n" + PAGE_URL + "\\n\\nToday's 3 biggest:\\n" +
    picks.map((p,i)=>(i+1)+". "+p.headline+" — "+p.teaser).join("\\n");
}
function flashCopied(){
  const btn = document.getElementById("share-btn"), toast = document.getElementById("toast");
  btn.classList.add("copied"); btn.textContent = "✓ Copied!"; toast.classList.add("show");
  setTimeout(()=>{ btn.classList.remove("copied"); btn.textContent = "▸ Share this digest"; toast.classList.remove("show"); }, 2000);
}
function fallbackCopy(text){
  const ta = document.createElement("textarea");
  ta.value = text; ta.setAttribute("readonly",""); ta.style.position="fixed"; ta.style.opacity="0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); flashCopied(); } catch(e){ window.prompt("Copy this:", text); }
  document.body.removeChild(ta);
}
function copyShare(){
  const text = buildBlurb();
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(flashCopied).catch(()=>fallbackCopy(text)); }
  else { fallbackCopy(text); }
}

// ---- render ----
function cardHTML(story, accent){
  const long = story.body.length > 160;
  const preview = long ? story.body.slice(0,160).replace(/\\s+$/,"") + "…" : story.body;
  const hasUrl = story.url && /^https?:\\/\\//.test(story.url);
  const link = hasUrl
    ? '<a class="read-link" style="color:'+accent+'" href="'+esc(story.url)+'" target="_blank" rel="noopener noreferrer">Read full article →</a>'
    : '';
  return '<div class="card" style="border-left:3px solid '+accent+'">'
    + '<div class="card-head">'+esc(story.headline)+'</div>'
    + '<div class="card-body" data-full="'+esc(story.body)+'" data-preview="'+esc(preview)+'" data-expanded="false">'+esc(preview)+'</div>'
    + (long ? '<button class="toggle" style="color:'+accent+'" onclick="toggleCard(this)">Read more ▼</button>' : '')
    + '<div class="card-footer"><div class="card-src">'+esc(story.source)+'</div>'+link+'</div></div>';
}
function toggleCard(btn){
  const body = btn.previousElementSibling;
  const exp = body.getAttribute("data-expanded")==="true";
  body.textContent = exp ? body.getAttribute("data-preview") : body.getAttribute("data-full");
  body.setAttribute("data-expanded", exp ? "false" : "true");
  btn.textContent = exp ? "Read more ▼" : "Show less ▲";
}
function sectionHead(label, color){
  return '<div class="section-head" style="color:'+color+';border-bottom:1px solid '+color+'33">'+esc(label)+'</div>';
}
function renderNav(){
  document.getElementById("navbar").innerHTML =
    '<span class="nav-caption">Archive</span>' +
    NAV.map(d => '<a class="nav-day'+(d.key===CURRENT?" current":"")+'" href="'+d.href+'">'+esc(d.label)+(d.isNewest?" •":"")+'</a>').join("");
}
function renderTabs(){
  document.getElementById("tabbar").innerHTML = TAB_CONFIG.map(t=>{
    const on = t.key===activeTab;
    const style = on ? "background:"+t.color+";box-shadow:0 2px 8px "+t.color+"60" : "";
    return '<button class="tab'+(on?" active":"")+'" style="'+style+'" onclick="setTab(\\''+t.key+'\\')">'+t.label+'</button>';
  }).join("");
}
function renderContent(){
  const cfg = TAB_CONFIG.find(t=>t.key===activeTab), accent = cfg.color, data = DIGEST.tabs;
  document.getElementById("tab-accent").style.background = accent;
  document.getElementById("tab-title").textContent = cfg.label;
  let html = "";
  const subs = SUBSECTIONS[activeTab];
  if(subs){
    for(const sub of subs){
      html += sectionHead(sub.label, sub.color);
      html += ((data[activeTab] && data[activeTab][sub.key]) || []).map(s=>cardHTML(s, sub.color)).join("");
    }
  } else if(activeTab==="feelGood"){
    html += (data.feelGood||[]).map(s=>cardHTML(s,accent)).join("");
    html += '<div class="otd"><div class="otd-head" style="color:'+accent+';border-bottom:1px solid '+accent+'33">📅 On This Day in History</div>';
    html += (data.onThisDay||[]).map(it=>'<div class="otd-row"><span class="otd-year" style="color:'+accent+'">'+esc(it.year)+'</span><span class="otd-event">'+esc(it.event)+'</span></div>').join("");
    html += '</div>';
  } else {
    html += (data[activeTab]||[]).map(s=>cardHTML(s,accent)).join("");
  }
  document.getElementById("tab-content").innerHTML = html;
}
function setTab(k){ activeTab=k; renderTabs(); renderContent(); }

document.getElementById("digest-date").textContent = DIGEST.date;
document.getElementById("stamp").textContent = DIGEST.generatedAt || "";
document.getElementById("breaking-head").textContent = DIGEST.breaking.headline;
document.getElementById("breaking-body").textContent = DIGEST.breaking.body;
document.getElementById("breaking-src").textContent = DIGEST.breaking.source;
(function(){
  const u = DIGEST.breaking.url, bl = document.getElementById("breaking-link");
  if(u && /^https?:\\/\\//.test(u)){ bl.href = u; bl.style.display = "inline-block"; }
})();
document.getElementById("footer").textContent =
  "Generated " + (DIGEST.generatedAt || "") + " · AI-summarized from public reporting — verify anything important against the original source.";
renderNav(); renderTabs(); renderContent();
</script>
</body>
</html>`;
}
