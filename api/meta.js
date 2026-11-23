// Consulta a Meta Marketing API (Insights). O token fica só aqui, no servidor.
const crypto = require("crypto");

const PRESETS = ["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "maximum"];
const LEVELS = ["campaign", "adset", "ad"];
const FIELDS = "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions";
const LEVEL_FIELDS = {
  campaign: "campaign_id,campaign_name",
  adset: "adset_id,adset_name,campaign_name",
  ad: "ad_id,ad_name,campaign_name",
};

const cache = new Map();
let accountCache = null;

function keyOk(given) {
  if (process.env.PORTAL_PUBLIC === "true") return true; // painel aberto, sem chave
  const expected = process.env.PORTAL_KEY || "";
  if (expected.length < 12 || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function graph(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(body?.error?.message || `Erro ${r.status} na Graph API`);
    e.meta = true;
    throw e;
  }
  return body;
}

async function paged(url, max = 5) {
  const out = [];
  let next = url;
  for (let i = 0; i < max && next; i++) {
    const page = await graph(next);
    out.push(...(page.data || []));
    next = page.paging && page.paging.next;
  }
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const act = (actions, type) => (type ? num((actions || []).find((a) => a.action_type === type)?.value) : null);

function metrics(r, type) {
  const spend = num(r.spend);
  const results = act(r.actions, type);
  return {
    spend, impressions: num(r.impressions), reach: num(r.reach), clicks: num(r.clicks),
    ctr: num(r.ctr), cpc: num(r.cpc), cpm: num(r.cpm), frequency: num(r.frequency),
    results, costPerResult: results ? spend / results : null,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!keyOk(req.query.k)) return res.status(401).json({ error: "link inválido" });

  const preset = req.query.preset || "last_7d";
  const level = req.query.level || "campaign";
  if (!PRESETS.includes(preset) || !LEVELS.includes(level)) return res.status(400).json({ error: "parâmetros inválidos" });

  const token = process.env.META_ACCESS_TOKEN;
  const raw = process.env.META_AD_ACCOUNT_ID;
  if (!token || !raw) {
    return res.status(503).json({ code: "not_configured", error: "Meta Ads ainda não conectado (faltam META_ACCESS_TOKEN e META_AD_ACCOUNT_ID)." });
  }

  const ck = `${preset}:${level}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 30000) {
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    return res.status(200).json(hit.value);
  }

  try {
    const id = raw.startsWith("act_") ? raw : `act_${raw}`;
    const v = process.env.META_API_VERSION || "v26.0";
    const base = `https://graph.facebook.com/${v}/${id}`;
    const type = (process.env.META_RESULT_ACTION_TYPE || "").trim() || null;
    const q = (o) => `${base}/insights?${new URLSearchParams({ date_preset: preset, ...o })}`;

    if (!accountCache || Date.now() - accountCache.at > 3600000) {
      const a = await graph(`${base}?fields=name,currency,timezone_name`);
      accountCache = { at: Date.now(), v: { name: a.name || id, currency: a.currency || "BRL", timezone: a.timezone_name || "America/Sao_Paulo" } };
    }

    const [totalRows, rows, dailyRows] = await Promise.all([
      paged(q({ level: "account", fields: FIELDS })),
      paged(q({ level, fields: `${LEVEL_FIELDS[level]},${FIELDS}`, limit: "100" })),
      paged(q({ level: "account", time_increment: "1", fields: "spend,clicks,actions", limit: "100" })),
    ]);

    const total = totalRows[0] || {};
    const payload = {
      account: accountCache.v,
      fetchedAt: new Date().toISOString(),
      totals: metrics(total, type),
      rows: rows
        .map((r) => ({
          id: r.ad_id || r.adset_id || r.campaign_id || "",
          name: r.ad_name || r.adset_name || r.campaign_name || "(sem nome)",
          parent: level === "campaign" ? undefined : r.campaign_name,
          ...metrics(r, type),
        }))
        .sort((a, b) => b.spend - a.spend),
      daily: dailyRows
        .map((r) => ({ date: r.date_start || "", spend: num(r.spend), clicks: num(r.clicks), results: act(r.actions, type) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      actionTypes: (total.actions || []).map((a) => ({ type: a.action_type, value: num(a.value) })).sort((a, b) => b.value - a.value),
      resultActionType: type,
      resultLabel: (process.env.META_RESULT_LABEL || "Resultados").trim(),
    };
    cache.set(ck, { at: Date.now(), value: payload });
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    res.status(200).json(payload);
  } catch (e) {
    res.status(e.meta ? 502 : 500).json({ code: e.meta ? "meta_error" : "error", error: e.meta ? e.message : "Falha ao consultar a Meta." });
  }
};
