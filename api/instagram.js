// Seguidores do Instagram (Graph API). O token fica só aqui, no servidor.
// ATENÇÃO: ainda não foi testado com token real. Veja o README, seção "Instagram".
const crypto = require("crypto");

const PRESETS = ["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "maximum"];
const TZ = "America/Sao_Paulo";
const MAX_DAYS = 29; // a Meta só entrega follower_count dos últimos 30 dias, sem o dia de hoje
const cache = new Map();

function keyOk(given) {
  if (process.env.PORTAL_PUBLIC === "true") return true; // painel aberto, sem chave
  const expected = process.env.PORTAL_KEY || "";
  if (expected.length < 12 || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const todaySP = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const unix = (s) => Math.floor(Date.parse(`${s}T00:00:00-03:00`) / 1000); // Brasil sem horário de verão desde 2019

// Mesmo recorte do date_preset dos anúncios, mas sem o dia de hoje.
function range(preset, today) {
  const y = addDays(today, -1);
  let since, until = y;
  if (preset === "today") return null;
  if (preset === "yesterday") since = y;
  else if (preset === "last_7d") since = addDays(today, -7);
  else if (preset === "last_14d") since = addDays(today, -14);
  else if (preset === "last_30d") since = addDays(today, -30);
  else if (preset === "this_month") since = `${today.slice(0, 8)}01`;
  else if (preset === "last_month") {
    const first = `${today.slice(0, 8)}01`;
    until = addDays(first, -1);
    since = `${until.slice(0, 8)}01`;
  } else since = addDays(today, -MAX_DAYS);
  if (since > until) return null;
  const floor = addDays(today, -MAX_DAYS);
  const clamped = since < floor || until < floor || preset === "maximum";
  if (until < floor) return { unavailable: "too_old" };
  if (since < floor) since = floor;
  return { since, until, clamped };
}

async function graph(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(body?.error?.message || `Erro ${r.status}`);
    e.meta = true;
    throw e;
  }
  return body;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!keyOk(req.query.k)) return res.status(401).json({ error: "link inválido" });
  const preset = req.query.preset || "last_7d";
  if (!PRESETS.includes(preset)) return res.status(400).json({ error: "parâmetros inválidos" });

  const igId = (process.env.META_IG_USER_ID || "").trim();
  if (!process.env.META_ACCESS_TOKEN || !igId) {
    return res.status(503).json({ code: "not_configured", error: "Instagram ainda não conectado (faltam META_ACCESS_TOKEN e META_IG_USER_ID)." });
  }

  const hit = cache.get(preset);
  if (hit && Date.now() - hit.at < 60000) return res.status(200).json(hit.value);

  const v = process.env.META_API_VERSION || "v26.0";
  const base = `https://graph.facebook.com/${v}/${igId}`;
  const today = todaySP();
  const rg = range(preset, today);
  const errors = {};
  const out = { fetchedAt: new Date().toISOString(), username: null, total: null, newFollowers: null, since: null, until: null, days: null, clamped: false, unavailable: null, errors };

  const jobs = [
    graph(`${base}?fields=username,followers_count`)
      .then((a) => { out.username = a.username ?? null; out.total = Number.isFinite(a.followers_count) ? a.followers_count : null; })
      .catch((e) => { errors.total = e.message; }),
  ];

  if (!rg) out.unavailable = "today";
  else if (rg.unavailable) out.unavailable = rg.unavailable;
  else {
    out.since = rg.since; out.until = rg.until; out.clamped = rg.clamped;
    out.days = Math.round((Date.parse(`${rg.until}T12:00:00Z`) - Date.parse(`${rg.since}T12:00:00Z`)) / 86400000) + 1;
    const qs = new URLSearchParams({ metric: "follower_count", period: "day", since: String(unix(rg.since)), until: String(unix(addDays(rg.until, 1))) });
    jobs.push(
      graph(`${base}/insights?${qs}`)
        .then((r) => {
          const vals = r?.data?.[0]?.values;
          if (!Array.isArray(vals) || !vals.length) throw new Error("A Meta não devolveu novos seguidores para este período.");
          out.newFollowers = vals.reduce((a, x) => a + (Number(x.value) || 0), 0);
        })
        .catch((e) => { errors.newFollowers = e.message; })
    );
  }

  await Promise.all(jobs);
  cache.set(preset, { at: Date.now(), value: out });
  res.status(200).json(out);
};
