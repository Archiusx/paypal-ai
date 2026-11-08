// flow.js — Phase 1b: PayPal-side nodes (triggers, Capture, Refund, Fetch Balance, Condition) + per-user "Connect PayPal"
import crypto from "node:crypto";
const PP = "https://api-m.sandbox.paypal.com"; // sandbox only, so live credentials can never work here
const E = process.env;
const store = { workflows: new Map(), runs: [], seen: new Map(), logs: [], reviews: [], flags: [], customers: new Map() };
const rid = () => Math.random().toString(36).slice(2, 8);

// ---------- PayPal auth (env app, or a user's own sandbox app connected from the UI) ----------
const envConn = { id: E.PAYPAL_CLIENT_ID, secret: E.PAYPAL_CLIENT_SECRET, t: "", exp: 0 };
const conns = new Map();      // connection token -> {id, secret, t, exp, scope}   (memory only, never written to disk)
const orderConn = new Map();
const orderMeta = new Map();  // order id -> { back: frontend url to return to, wf: workflow id }  // order id -> connection token (so the return URL captures with the same app)

async function ppToken(c = envConn) {
  if (c.t && Date.now() < c.exp) return c.t;
  if (!c.id || !c.secret) throw new Error("PayPal credentials missing. Click Connect PayPal.");
  const r = await fetch(PP + "/v1/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(c.id + ":" + c.secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(10000) });
  if (!r.ok) { const e = new Error("PayPal auth failed " + r.status); e.status = r.status; throw e; }
  const j = await r.json();
  c.t = j.access_token; c.exp = Date.now() + (j.expires_in - 60) * 1000; c.scope = j.scope || "";
  return c.t;
}
async function pp(method, path, body, extra = {}, c = envConn) {
  const r = await fetch(PP + path, { method, headers: { Authorization: "Bearer " + await ppToken(c), "Content-Type": "application/json", ...extra }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.details?.[0]?.description || j.message || "PayPal " + r.status); e.status = r.status; e.name2 = j.name; throw e; }
  return j;
}
const balHint = e => (e.status === 403 || e.status === 401 || /NOT_AUTHORIZED|permission/i.test(e.message + (e.name2 || "")))
  ? "PayPal says this app cannot read balances. Open your sandbox app on developer.paypal.com, tick Transaction Search under Features and save. For an app that already exists it can take up to 9 hours to apply."
  : e.message;
async function getBalances(c, currency = "INR") {
  const cur = String(currency || "INR").toUpperCase();
  const j = await pp("GET", "/v1/reporting/balances?currency_code=" + encodeURIComponent(cur), null, {}, c);
  return { account_id: j.account_id, as_of: j.as_of_time, balances: (j.balances || []).map(b => ({ currency: b.currency, available: b.available_balance?.value, total: b.total_balance?.value, withheld: b.withheld_balance?.value })) };
}

// ---------- engine ----------
const ALIAS = { "BILLING.SUBSCRIPTION.PAYMENT.COMPLETED": "PAYMENT.SALE.COMPLETED" }; // UI name -> real PayPal event
const realEvent = e => ALIAS[e] || e;
const PHASE1 = new Set(["pay", "ref", "dis", "sub", "cond", "cap", "rf", "bal", "risk", "fraud", "seg", "ext", "txt", "delay", "tg", "sl", "dc", "em", "log", "upd", "rev", "flag", "gor", "gcap", "cor", "payout", "txs", "gdis"]);

function triggerMatches(n, ctx) {
  if (n.kind !== "trigger" || n.type === "sch") return false;
  if (realEvent(n.config?.Event) !== ctx.event_type) return false;
  const min = parseFloat(n.config?.["Min amount (USD)"]);
  return !(min > 0 && ctx.amount < min);
}


// ---------- Phase 2 helpers: templates, AI (Groq optional, heuristic fallback), outbound messages ----------
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const fill = (t, ctx) => String(t ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => { const v = getPath(ctx, k); return v == null || typeof v === "object" ? "" : String(v); });
const waitMs = v => { const m = String(v || "").trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)?$/i); if (!m) return 0; const n = parseFloat(m[1]), u = (m[2] || "s").toLowerCase(); return n * (u[0] === "h" ? 3600e3 : u[0] === "m" ? 60e3 : 1e3); };
const HIGH_RISK = new Set(["RU", "KP", "IR", "NG", "SY", "BY", "VE"]);
const heuristicRisk = ctx => {
  let s = 8; const a = +ctx.amount || 0, h = new Date().getUTCHours();
  s += a > 2000 ? 55 : a > 1000 ? 42 : a > 500 ? 30 : a > 200 ? 14 : 0;
  if (HIGH_RISK.has(String(ctx.country || "").toUpperCase())) s += 30;
  if (!ctx.country) s += 4;
  if (h < 5) s += 8;
  return Math.min(99, s);
};
const levelOf = s => (s >= 70 ? "High" : s >= 35 ? "Medium" : "Low");
async function groqJson(system, user, fallback) {
  if (!E.GROQ_API_KEY) return fallback;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + E.GROQ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: E.GROQ_MODEL || "llama-3.3-70b-versatile", temperature: 0.2, max_tokens: 400, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) return fallback;
    return JSON.parse(((await r.json()).choices?.[0]?.message?.content || "").replace(/^```json|```$/g, "").trim());
  } catch { return fallback; }
}
const safeCtx = ctx => ({ event: ctx.event_type, amount: ctx.amount, currency: ctx.currency, country: ctx.country, item: ctx.item, buyer_email_domain: String(ctx.buyer?.email || "").split("@")[1] || "" });
async function post(url, body, headers = {}) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text().catch(() => "")).slice(0, 120));
  return r;
}
// Outbound message: skipped in dry runs (shows the rendered text), warns if the env var for that channel is missing
async function notify(kind, n, ctx, dry) {
  const c = n.config || {}, msg = fill(c.Message, ctx).slice(0, 3500);
  const need = { tg: ["TELEGRAM_BOT_TOKEN"], sl: ["SLACK_WEBHOOK_URL"], dc: ["DISCORD_WEBHOOK_URL"], em: ["RESEND_API_KEY", "EMAIL_FROM"] }[kind];
  const label = { tg: "Telegram", sl: "Slack", dc: "Discord", em: "Email" }[kind];
  const missing = need.filter(k => !E[k]);
  if (dry) return { status: "skipped", detail: `dry run: ${label} not sent${missing.length ? " (set " + missing.join(", ") + " to enable)" : ""} · “${(kind === "em" ? fill(c.Subject, ctx) : msg).slice(0, 140)}”` };
  if (missing.length) return { status: "warn", detail: `${label} not configured: set ${missing.join(", ")} on the server` };
  if (kind === "tg") {
    const chat = fill(c.Chat, ctx).trim();
    if (!chat) return { status: "warn", detail: "Telegram chat is empty" };
    await post(`https://api.telegram.org/bot${E.TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: chat, text: msg });
  } else if (kind === "sl") await post(E.SLACK_WEBHOOK_URL, { text: msg });
  else if (kind === "dc") await post(E.DISCORD_WEBHOOK_URL, { content: msg.slice(0, 1900) });
  else {
    const to = fill(c.To, ctx).trim();
    if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(to)) return { status: "warn", detail: "no valid recipient email (" + (to || "empty") + ")" };
    const body = ctx.draft || "Thank you for your order" + (ctx.item ? ": " + ctx.item : "") + ".";
    await post("https://api.resend.com/emails", { from: E.EMAIL_FROM, to: [to], subject: fill(c.Subject, ctx).slice(0, 200) || "Notification", text: body }, { Authorization: "Bearer " + E.RESEND_API_KEY });
  }
  return { detail: `${label} sent` };
}

async function step(n, ctx, dry, conn) {
  const c = n.config || {};
  if (n.kind === "trigger") return { detail: `${ctx.event_type} · ${ctx.amount} ${ctx.currency} · ${ctx.country || "?"}` };
  if (n.type === "bal") { // read-only, so it runs for real even in a dry run
    try {
      const r = await getBalances(conn, c.Currency);
      ctx.balances = r.balances; ctx.balance = parseFloat(r.balances[0]?.available);
      return { detail: r.balances.length ? r.balances.map(b => `${b.currency} available ${b.available} (total ${b.total}, withheld ${b.withheld})`).join(" · ") : "PayPal returned no balance for " + (c.Currency || "USD") + (r.account_id ? " · account " + r.account_id : ""), data: r };
    } catch (e) { e.message = balHint(e); throw e; }
  }
  if (n.type === "cond") {
    const L = { "Risk score": ctx.score, Amount: ctx.amount, Country: ctx.country, Balance: ctx.balance }[c.Check];
    if (L === undefined) return { status: "warn", detail: `"${c.Check}" not available yet (AI nodes come in phase 2) → took No branch`, branch: 1 };
    const R = isNaN(c.Value) ? c.Value : +c.Value;
    const y = c.Operator === ">" ? L > R : c.Operator === "<" ? L < R : L == R;
    return { detail: `${c.Check} ${c.Operator} ${c.Value} ? ${y ? "YES" : "NO"}`, branch: y ? 0 : 1 };
  }
  if (n.type === "cap") {
    if (ctx.capture?.id) return { detail: "already captured · " + ctx.capture.id };
    if (!ctx.order?.id) return { status: "warn", detail: "no order id in this event" };
    if (dry) return { status: "skipped", detail: "dry run: capture not called" };
    const j = await pp("POST", `/v2/checkout/orders/${ctx.order.id}/capture`, null, { "PayPal-Request-Id": "cap-" + ctx.order.id }, conn);
    const cp = j.purchase_units?.[0]?.payments?.captures?.[0];
    ctx.capture = { id: cp?.id };
    return { detail: `captured ${cp?.amount?.value} ${cp?.amount?.currency_code} · ${cp?.id} (${cp?.status})` };
  }
  if (n.type === "rf") {
    if (!ctx.capture?.id) return { status: "warn", detail: "no capture id to refund" };
    if (dry) return { status: "skipped", detail: "dry run: refund not called" };
    const amt = parseFloat(c.Amount);
    const body = amt > 0 ? { amount: { value: amt.toFixed(2), currency_code: ctx.currency } } : {};
    const j = await pp("POST", `/v2/payments/captures/${ctx.capture.id}/refund`, body, { "PayPal-Request-Id": "rf-" + ctx.capture.id + "-" + (amt || "full") }, conn);
    return { detail: `refund ${j.id} · ${j.status}` };
  }
  // ---------- PayPal API nodes ----------
  const isTest = v => !v || /^TEST-/i.test(String(v));
  const apiHint = e => (e.status === 403 || e.status === 401) ? "PayPal says this sandbox app lacks permission for this call. Enable the matching feature (Payouts / Transaction Search / Disputes) on developer.paypal.com and save. " + e.message : e.message;
  try {
    if (n.type === "gor") {
      const oid = fill(c.Order, ctx).trim();
      if (isTest(oid)) return { status: "skipped", detail: "test order id: nothing to look up (works on a real sandbox payment)" };
      const o = await pp("GET", "/v2/checkout/orders/" + encodeURIComponent(oid), null, {}, conn);
      const u = o.purchase_units?.[0] || {};
      ctx.orderStatus = o.status;
      if (!ctx.buyer?.email && o.payer?.email_address) ctx.buyer = { email: o.payer.email_address, name: [o.payer?.name?.given_name, o.payer?.name?.surname].filter(Boolean).join(" ") };
      if (!ctx.country) ctx.country = u.shipping?.address?.country_code || o.payer?.address?.country_code || "";
      if (!ctx.item) ctx.item = u.description || u.items?.[0]?.name || "";
      return { detail: `order ${oid} · ${o.status} · ${u.amount?.value || "?"} ${u.amount?.currency_code || ""} · payer ${o.payer?.email_address || "n/a"}`, data: { id: o.id, status: o.status } };
    }
    if (n.type === "gcap") {
      const cid = fill(c.Capture, ctx).trim() || ctx.capture?.id;
      if (isTest(cid)) return { status: "skipped", detail: "test capture id: nothing to look up (works on a real sandbox payment)" };
      const j = await pp("GET", "/v2/payments/captures/" + encodeURIComponent(cid), null, {}, conn);
      const b = j.seller_receivable_breakdown || {};
      ctx.captureStatus = j.status; ctx.fee = parseFloat(b.paypal_fee?.value) || 0; ctx.net = parseFloat(b.net_amount?.value) || 0;
      return { detail: `capture ${cid} · ${j.status} · gross ${j.amount?.value} ${j.amount?.currency_code} · fee ${b.paypal_fee?.value ?? "?"} · net ${b.net_amount?.value ?? "?"}`, data: { id: j.id, status: j.status } };
    }
    if (n.type === "cor") {
      const amt = parseFloat(fill(c.Amount, ctx)), cur = String(c.Currency || ctx.currency || "USD").toUpperCase();
      if (!(amt > 0) || amt > 5000) return { status: "warn", detail: "Amount must be between 0.01 and 5000" };
      if (!/^[A-Z]{3}$/.test(cur)) return { status: "warn", detail: "bad currency " + cur };
      if (dry) return { status: "skipped", detail: `dry run: would create a ${amt.toFixed(2)} ${cur} order` };
      const base = E.PUBLIC_API_URL; if (!base) return { status: "warn", detail: "set PUBLIC_API_URL on the server so PayPal can return the buyer" };
      const j = await pp("POST", "/v2/checkout/orders", { intent: "CAPTURE", purchase_units: [{ amount: { currency_code: cur, value: amt.toFixed(2) }, description: fill(c.Description, ctx).slice(0, 120) || "Flow order" }],
        payment_source: { paypal: { experience_context: { return_url: base + "/api/paypal/return", cancel_url: base + "/api/paypal/return?cancel=1", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" } } } }, { "PayPal-Request-Id": "cor-" + ctx.id + "-" + n.id }, conn);
      const link = j.links?.find(l => l.rel === "payer-action" || l.rel === "approve")?.href;
      const tok = [...conns.entries()].find(([, v]) => v === conn)?.[0]; if (tok) orderConn.set(j.id, tok);
      ctx.newOrder = { id: j.id, approveUrl: link };
      return { detail: `order ${j.id} created · pay link: ${link}`, data: ctx.newOrder };
    }
    if (n.type === "payout") {
      const to = fill(c.To, ctx).trim(), amt = parseFloat(fill(c.Amount, ctx)), cur = String(c.Currency || "USD").toUpperCase();
      if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(to)) return { status: "warn", detail: "no valid recipient email (" + (to || "empty") + ")" };
      if (!(amt > 0) || amt > 1000) return { status: "warn", detail: "Amount must be between 0.01 and 1000" };
      if (dry) return { status: "skipped", detail: `dry run: would send ${amt.toFixed(2)} ${cur} to ${to}` };
      const bid = "fb-" + crypto.createHash("sha1").update(ctx.id + n.id + to + amt).digest("hex").slice(0, 24);
      const j = await pp("POST", "/v1/payments/payouts", { sender_batch_header: { sender_batch_id: bid, email_subject: "You have a payout", email_message: fill(c.Note, ctx).slice(0, 200) || "Payout from your automation" },
        items: [{ recipient_type: "EMAIL", amount: { value: amt.toFixed(2), currency: cur }, receiver: to, note: fill(c.Note, ctx).slice(0, 200) || "Payout", sender_item_id: bid + "-1" }] }, {}, conn);
      ctx.payout = { batchId: j.batch_header?.payout_batch_id };
      return { detail: `payout ${amt.toFixed(2)} ${cur} → ${to} · batch ${ctx.payout.batchId} (${j.batch_header?.batch_status})`, data: ctx.payout };
    }
    if (n.type === "txs") { // read-only, runs for real even in a dry run
      const days = Math.min(31, Math.max(1, parseInt(c.Days) || 1)), f = d => d.toISOString().replace(/\.\d{3}Z$/, "+0000");
      const j = await pp("GET", `/v1/reporting/transactions?start_date=${encodeURIComponent(f(new Date(Date.now() - days * 864e5)))}&end_date=${encodeURIComponent(f(new Date()))}&fields=transaction_info&page_size=100`, null, {}, conn);
      const list = j.transaction_details || [], total = list.reduce((a, t) => a + (parseFloat(t.transaction_info?.transaction_amount?.value) || 0), 0);
      ctx.txCount = list.length; ctx.txTotal = +total.toFixed(2);
      return { detail: `${list.length} transaction(s) in the last ${days} day(s) · net total ${ctx.txTotal}`, data: { count: list.length, total: ctx.txTotal } };
    }
    if (n.type === "gdis") {
      const did = fill(c.Dispute, ctx).trim() || ctx.id;
      if (isTest(did) || !/^PP-/i.test(did)) return { status: "skipped", detail: "no real dispute id (PP-D-…): nothing to look up" };
      const j = await pp("GET", "/v1/customer/disputes/" + encodeURIComponent(did), null, {}, conn);
      ctx.disputeReason = j.reason; ctx.disputeStatus = j.status;
      return { detail: `dispute ${did} · ${j.status} · reason ${j.reason} · ${j.dispute_amount?.value || "?"} ${j.dispute_amount?.currency_code || ""}`, data: { id: did, status: j.status, reason: j.reason } };
    }
  } catch (e) { e.message = apiHint(e); throw e; }
  if (n.type === "risk" || n.type === "fraud") {
    let score = heuristicRisk(ctx), why = "amount/country/time rules";
    if (E.GROQ_API_KEY) {
      const j = await groqJson('You are a payment risk analyst. Reply ONLY JSON: {"score":0-100,"reason":"one short sentence"}. Higher = riskier.', JSON.stringify(safeCtx(ctx)) + (n.type === "fraud" ? ` Sensitivity: ${c.Sensitivity || "Balanced"}.` : ""), null);
      if (j && Number.isFinite(+j.score)) { score = Math.round(Math.min(100, Math.max(0, +j.score))); why = String(j.reason || "AI").slice(0, 140); }
    }
    if (n.type === "fraud") { const d = { Strict: 10, Lenient: -10 }[c.Sensitivity] || 0; score = Math.min(99, Math.max(0, score + d)); ctx.fraud = score >= 70; }
    ctx.score = score; ctx.risk = levelOf(score);
    return { detail: `score ${score} → ${levelOf(score).toUpperCase()} (${why})` };
  }
  if (n.type === "seg") {
    const key = String(ctx.buyer?.email || "").toLowerCase(), prev = key ? store.customers.get(key) : null;
    ctx.segment = (prev?.orders || 0) >= 5 || ctx.amount >= 1000 ? "VIP" : prev ? "Repeat" : "New";
    return { detail: `buyer segment: ${ctx.segment}${prev ? " · " + prev.orders + " earlier order(s)" : ""}` };
  }
  if (n.type === "ext") {
    const want = String(c.Fields || "item, amount").split(",").map(x => x.trim()).filter(Boolean).slice(0, 10);
    const out = {}; for (const f of want) { const v = getPath(ctx, f); if (v != null && typeof v !== "object") out[f] = v; }
    ctx.extracted = out;
    return { detail: Object.keys(out).length ? "extracted " + JSON.stringify(out) : "none of the requested fields were found", data: out };
  }
  if (n.type === "txt") {
    const tone = c.Tone || "Friendly", who = ctx.buyer?.name || "there", item = ctx.item || "your order";
    const base = tone === "Formal" ? `Dear ${who}, thank you for your purchase of ${item}. Your payment of ${ctx.amount} ${ctx.currency} has been received.` : tone === "Short" ? `Thanks, ${who}! ${item} is confirmed.` : `Hi ${who}! Thanks for buying ${item}. Your order is confirmed and we are getting it ready.`;
    const j = await groqJson(`Write a ${tone} thank-you email body, max 70 words, plain text. Reply ONLY JSON: {"text":"..."}`, JSON.stringify(safeCtx(ctx)), { text: base });
    ctx.draft = String(j?.text || base).replace(/[<>]/g, "").slice(0, 1200);
    return { detail: "drafted: “" + ctx.draft.slice(0, 120) + (ctx.draft.length > 120 ? "…" : "") + "”" };
  }
  if (n.type === "delay") {
    const ms = waitMs(c.Wait);
    if (!ms) return { status: "warn", detail: `could not read wait “${c.Wait}”. Use e.g. 30 sec or 5 min` };
    if (dry) return { status: "skipped", detail: `dry run: would wait ${c.Wait}` };
    const w = Math.min(ms, 25000); await new Promise(r => setTimeout(r, w));
    return { detail: ms > w ? `waited ${w / 1000}s (long waits are capped at 25s on this server)` : `waited ${c.Wait}` };
  }
  if (n.type === "tg" || n.type === "sl" || n.type === "dc" || n.type === "em") return notify(n.type, n, ctx, dry);
  if (n.type === "log") {
    const row = { at: Date.now(), table: String(c.Table || "payments_log").slice(0, 60), event: ctx.event_type, id: ctx.id, amount: ctx.amount, currency: ctx.currency, country: ctx.country, item: ctx.item, score: ctx.score, buyer: ctx.buyer?.email || "" };
    if (dry) return { status: "skipped", detail: `dry run: would write a row to ${row.table}` };
    store.logs.unshift(row); store.logs.length = Math.min(store.logs.length, 500);
    return { detail: `row written to ${row.table} (${store.logs.length} stored)` };
  }
  if (n.type === "upd") {
    const key = String(ctx.buyer?.email || "").toLowerCase();
    if (!key) return { status: "warn", detail: "no buyer email to update" };
    if (dry) return { status: "skipped", detail: "dry run: customer not updated" };
    const prev = store.customers.get(key) || { orders: 0, total: 0 };
    const rec = { ...prev, orders: prev.orders + 1, total: +(prev.total + (+ctx.amount || 0)).toFixed(2), last: fill(c.Field, ctx), at: Date.now() };
    store.customers.set(key, rec); if (store.customers.size > 2000) store.customers.delete(store.customers.keys().next().value);
    return { detail: `customer ${key} updated · ${rec.orders} order(s) · ${rec.last}` };
  }
  if (n.type === "rev" || n.type === "flag") {
    const q = n.type === "rev" ? store.reviews : store.flags;
    const item = { at: Date.now(), id: ctx.id, amount: ctx.amount, currency: ctx.currency, country: ctx.country, score: ctx.score, ...(n.type === "rev" ? { priority: c.Priority || "Normal" } : { reason: fill(c.Reason, ctx) }) };
    if (dry) return { status: "skipped", detail: `dry run: would ${n.type === "rev" ? "queue for review (" + item.priority + ")" : "flag: " + item.reason}` };
    q.unshift(item); q.length = Math.min(q.length, 300);
    return { detail: n.type === "rev" ? `queued for manual review (${item.priority} priority)` : `flagged: ${item.reason}` };
  }
  return { status: "skipped", detail: "node runs in a later phase" };
}

async function execute(flow, ctx, { dry = false, source = "webhook", conn = envConn, roots = null } = {}) {
  const nodes = new Map(flow.nodes.map(n => [n.id, n]));
  const run = { id: "run_" + rid(), wf: flow.id, name: flow.name, source, event: ctx.event_type, at: Date.now(), status: "running", steps: [] };
  store.runs.unshift(run); store.runs.length = Math.min(store.runs.length, 100);
  const q = roots ? [...roots] : flow.nodes.filter(n => triggerMatches(n, ctx)).map(n => n.id), seen = new Set();
  let errors = 0;
  while (q.length && seen.size < 50) {
    const id = q.shift(); if (seen.has(id)) continue; seen.add(id);
    const n = nodes.get(id); if (!n) continue;
    const t0 = Date.now(); let r;
    try { r = await step(n, ctx, dry, conn); }
    catch (e) { r = { status: "error", detail: e.message }; errors++; }
    run.steps.push({ id, name: n.name, status: r.status || "ok", detail: r.detail, data: r.data, ms: Date.now() - t0 });
    if (r.status === "error") continue;
    flow.edges.filter(e => e.from === id && (n.type !== "cond" || e.branch === (r.branch ? "no" : "yes"))).forEach(e => q.push(e.to));
  }
  run.status = errors ? "completed_with_errors" : "completed";
  return run;
}

async function fire(ctx, onlyWf) {
  const key = ctx.event_type + ":" + (ctx.capture?.id || ctx.id);
  if (store.seen.has(key)) return [];            // webhook + return-URL both report the same capture
  store.seen.set(key, Date.now());
  for (const [k, t] of store.seen) if (Date.now() - t > 864e5) store.seen.delete(k);
  const flows = [...store.workflows.values()].filter(f => (!onlyWf || f.id === onlyWf) && f.nodes.some(n => triggerMatches(n, ctx)));
  return Promise.all(flows.map(f => execute(f, { ...ctx }, { conn: conns.get(f.conn) || envConn })));
}

// ---------- PayPal event -> context ----------
async function ctxFromWebhook(ev) {
  const r = ev.resource || {}, t = ev.event_type;
  const ctx = { event_type: t, id: ev.id, currency: r.amount?.currency_code || r.amount?.currency || "INR", amount: parseFloat(r.amount?.value ?? r.amount?.total ?? r.dispute_amount?.value ?? 0), country: "", buyer: {}, order: {}, capture: {} };
  if (t === "PAYMENT.CAPTURE.COMPLETED") { ctx.capture.id = r.id; ctx.order.id = r.supplementary_data?.related_ids?.order_id; }
  else if (t === "PAYMENT.CAPTURE.REFUNDED") { ctx.capture.id = (r.links?.find(l => l.rel === "up")?.href || "").split("/").pop(); ctx.order.id = r.supplementary_data?.related_ids?.order_id; }
  else if (t === "CUSTOMER.DISPUTE.CREATED") { ctx.capture.id = r.disputed_transactions?.[0]?.seller_transaction_id; ctx.id = r.dispute_id; ctx.currency = r.dispute_amount?.currency_code || "USD"; }
  else if (t === "PAYMENT.SALE.COMPLETED") { ctx.capture.id = r.id; ctx.currency = r.amount?.currency || "USD"; }
  if (ctx.order.id) try { // enrich with buyer details (best effort)
    const o = await pp("GET", "/v2/checkout/orders/" + ctx.order.id);
    ctx.buyer = { email: o.payer?.email_address, name: [o.payer?.name?.given_name, o.payer?.name?.surname].filter(Boolean).join(" ") };
    ctx.country = o.payer?.address?.country_code || ""; ctx.item = o.purchase_units?.[0]?.description;
  } catch {}
  return ctx;
}

async function verifySig(req) {
  if (!E.PAYPAL_WEBHOOK_ID) return E.ALLOW_UNVERIFIED === "1";
  const h = k => req.headers[k];
  const body = `{"auth_algo":${JSON.stringify(h("paypal-auth-algo"))},"cert_url":${JSON.stringify(h("paypal-cert-url"))},"transmission_id":${JSON.stringify(h("paypal-transmission-id"))},"transmission_sig":${JSON.stringify(h("paypal-transmission-sig"))},"transmission_time":${JSON.stringify(h("paypal-transmission-time"))},"webhook_id":${JSON.stringify(E.PAYPAL_WEBHOOK_ID)},"webhook_event":${req.raw}}`; // raw body keeps PayPal's CRC check valid
  const r = await fetch(PP + "/v1/notifications/verify-webhook-signature", { method: "POST", headers: { Authorization: "Bearer " + await ppToken(), "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(10000) });
  return (await r.json().catch(() => ({}))).verification_status === "SUCCESS";
}

// ---------- routes ----------
const hits = new Map();
const limited = (req, key, max) => { // tiny per-IP limiter: max requests per minute
  const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim() + key, now = Date.now();
  const a = (hits.get(ip) || []).filter(t => now - t < 6e4); a.push(now); hits.set(ip, a);
  if (hits.size > 5000) hits.clear();
  return a.length > max;
};
// header x-conn = a user's connected sandbox app; empty = server's own env credentials
const connOf = (req, res) => {
  const t = req.headers["x-conn"]; if (!t) return envConn;
  const c = conns.get(t); if (c) return c;
  res.status(401).json({ error: "PayPal connection expired. Click Connect PayPal again.", code: "conn_expired" }); return null;
};

// frontend to send the buyer back to: the browser-set Origin of the request that created the order (only if it matches ALLOWED_ORIGIN when that is set to a real origin)
const backUrl = req => {
  try {
    const o = new URL(String(req.headers.origin || "")); if (!/^https?:$/.test(o.protocol)) return "";
    const al = String(E.ALLOWED_ORIGIN || "*").split(/[\s#]/)[0].replace(/\/+$/, "");
    if (/^https?:\/\//.test(al) && !/your-frontend|netlify\.app$/.test(al) && new URL(al).origin !== o.origin) return "";
    const p = String(req.body?.returnPath || "/"); return o.origin + (/^\/[\w\-./]*$/.test(p) ? p : "/");
  } catch { return ""; }
};
const htmlEsc = x => String(x).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function mountFlow(app) {
  app.post("/api/flow/connect", async (req, res) => {
    if (limited(req, "c", 10)) return res.status(429).json({ error: "Too many attempts. Wait a minute." });
    const id = String(req.body?.clientId || "").trim(), secret = String(req.body?.clientSecret || "").trim();
    if (!id || !secret || id.length > 200 || secret.length > 400) return res.status(400).json({ error: "Enter both Client ID and Client Secret." });
    const c = { id, secret, t: "", exp: 0 };
    try { await ppToken(c); } catch { return res.status(401).json({ error: "PayPal rejected these credentials. Use the SANDBOX app's Client ID and Secret." }); }
    const token = "cn_" + crypto.randomBytes(18).toString("hex");
    conns.set(token, c); if (conns.size > 200) conns.delete(conns.keys().next().value);
    res.json({ token, balanceScope: /reporting\/balances/.test(c.scope || "") });
  });
  app.post("/api/flow/disconnect", (req, res) => { conns.delete(req.headers["x-conn"]); res.json({ ok: true }); });

  app.get("/api/flow/balance", async (req, res) => {
    const c = connOf(req, res); if (!c) return;
    try { res.json(await getBalances(c, req.query.currency)); }
    catch (e) { res.status(e.status === 403 ? 403 : 502).json({ error: balHint(e) }); }
  });

  app.post("/api/flow/publish", (req, res) => {
    const w = req.body?.workflow;
    if (!w?.id || !Array.isArray(w.nodes) || !Array.isArray(w.edges)) return res.status(400).json({ error: "invalid workflow" });
    if (w.nodes.length > 60) return res.status(400).json({ error: "too many nodes" });
    const c = connOf(req, res); if (!c) return;
    store.workflows.set(w.id, { id: w.id, name: w.name, nodes: w.nodes, edges: w.edges, conn: req.headers["x-conn"] || "" });
    res.json({ ok: true, id: w.id, supported: w.nodes.map(n => ({ id: n.id, phase1: PHASE1.has(n.type) || n.kind === "trigger" })) });
  });

  // Create a REAL sandbox order; buyer approves with a sandbox personal account, then PayPal sends them to /api/paypal/return
  app.post("/api/flow/order", async (req, res) => {
    const c = connOf(req, res); if (!c) return;
    try {
      const amount = Math.min(Math.max(parseFloat(req.body?.amount) || 10, 1), 5000).toFixed(2);
      const base = E.PUBLIC_API_URL || (req.protocol + "://" + req.get("host"));
      const j = await pp("POST", "/v2/checkout/orders", {
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value: amount }, description: String(req.body?.description || "FlowBuilder demo order").slice(0, 120) }],
        payment_source: { paypal: { experience_context: { return_url: base + "/api/paypal/return", cancel_url: base + "/api/paypal/return?cancel=1", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" } } }
      }, { "PayPal-Request-Id": "ord-" + rid() + Date.now() }, c);
      if (req.headers["x-conn"]) orderConn.set(j.id, req.headers["x-conn"]);
      orderMeta.set(j.id, { back: backUrl(req), wf: String(req.body?.workflowId || "") });
      if (orderMeta.size > 500) orderMeta.delete(orderMeta.keys().next().value);
      if (orderConn.size > 500) orderConn.delete(orderConn.keys().next().value);
      const link = j.links?.find(l => l.rel === "payer-action" || l.rel === "approve")?.href;
      res.json({ orderId: j.id, approveUrl: link });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.get("/api/paypal/return", async (req, res) => {
    const id = String(req.query.token || ""), meta = orderMeta.get(id) || {}, back = meta.back ? meta.back + "#flow-paid" : "";
    const page = (ok, t, m, steps = []) => res.set("Cache-Control", "no-store").send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEsc(t)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:48px 20px;text-align:center;color:#111">
<div style="width:56px;height:56px;border-radius:50%;margin:0 auto 14px;display:grid;place-items:center;font-size:28px;background:${ok ? "#dcfce7;color:#15803d" : "#fee2e2;color:#b91c1c"}">${ok ? "&#10003;" : "&#10005;"}</div>
<h2 style="margin:0 0 8px">${htmlEsc(t)}</h2><p style="color:#555;line-height:1.5">${htmlEsc(m)}</p>
${steps.length ? `<div style="text-align:left;border:1px solid #e5e7eb;border-radius:12px;padding:12px 16px;margin:18px 0;font-size:.9rem"><b>Your flow ran:</b>${steps.map(x => `<div style="margin-top:6px"><b>${htmlEsc(x.name)}</b> <span style="color:#666">[${htmlEsc(x.status)}] ${htmlEsc(String(x.detail || "").slice(0, 160))}</span></div>`).join("")}</div>` : ""}
${back ? `<a href="${htmlEsc(back)}" style="display:inline-block;margin-top:8px;padding:12px 22px;border-radius:10px;background:#2b5cff;color:#fff;text-decoration:none;font-weight:600">Back to Flow Builder</a><p id="s" style="color:#888;font-size:.85rem;margin-top:12px">Returning automatically…</p>` : `<p style="color:#888;font-size:.85rem">You can close this tab and go back to the Flow Builder.</p>`}
<script>setTimeout(function(){try{window.close()}catch(e){}${back ? `setTimeout(function(){location.href=${JSON.stringify(back)}},400)` : ""}},${ok ? 3500 : 6000});</script></body></html>`);
    if (req.query.cancel) return page(false, "Payment cancelled", "No payment was taken.");
    try {
      const t0 = Date.now(), c = conns.get(orderConn.get(id)) || envConn;
      let cp, j = null;
      try { j = await pp("POST", `/v2/checkout/orders/${id}/capture`, null, { "PayPal-Request-Id": "cap-" + id }, c); cp = j.purchase_units?.[0]?.payments?.captures?.[0]; }
      catch (e) { // already captured (reload / webhook) -> read the order instead of failing
        const o = await pp("GET", "/v2/checkout/orders/" + encodeURIComponent(id), null, {}, c).catch(() => null);
        if (o?.status !== "COMPLETED") throw e; j = o; cp = o.purchase_units?.[0]?.payments?.captures?.[0];
      }
      let steps = [];
      if (cp?.status === "COMPLETED") {
        const ctx = { event_type: "PAYMENT.CAPTURE.COMPLETED", id: cp.id, amount: parseFloat(cp.amount.value), currency: cp.amount.currency_code, country: j.payer?.address?.country_code || "", item: j.purchase_units[0].description, buyer: { email: j.payer?.email_address, name: [j.payer?.name?.given_name, j.payer?.name?.surname].filter(Boolean).join(" ") }, order: { id }, capture: { id: cp.id } };
        // run only the workflow this payment was started from (falls back to all matching ones for older clients); wait for it, but never longer than 20s
        const wfId = meta.wf && store.workflows.has(meta.wf) ? meta.wf : undefined;
        await Promise.race([fire(ctx, wfId).catch(console.error), new Promise(r => setTimeout(r, 20000))]);
        steps = store.runs.filter(r => r.at >= t0 - 1000 && r.event === "PAYMENT.CAPTURE.COMPLETED" && (!wfId || r.wf === wfId)).flatMap(r => r.steps).slice(0, 12);
      }
      page(true, "Payment captured", "Sandbox payment " + (cp?.id || "") + " is done." + (back ? " Taking you back to the Flow Builder." : " Go back to the Flow Builder."), steps);
    } catch (e) { page(false, "Capture failed", e.message); }
  });

  const hook = async (req, res) => {
    try {
      if (!(await verifySig(req))) return res.status(400).json({ error: "signature not verified (set PAYPAL_WEBHOOK_ID)" });
      res.json({ ok: true }); // ack fast, then run
      fire(await ctxFromWebhook(req.body)).catch(console.error);
    } catch (e) { console.error("webhook", e.message); if (!res.headersSent) res.status(500).json({ error: e.message }); }
  };
  app.post(["/webhooks/paypal", "/webhooks/paypal/:id"], hook);

  app.get("/api/flow/runs", (req, res) => {
    const since = +req.query.since || 0;
    res.json(store.runs.filter(r => (!req.query.wf || r.wf === req.query.wf) && r.at > since));
  });

  // Proves backend -> PayPal sandbox connection by doing a real OAuth login
  app.get("/api/flow/selftest", async (req, res) => {
    const c = connOf(req, res); if (!c) return;
    const out = { backend: true, usingOwnApp: !!req.headers["x-conn"], paypalCreds: !!(c.id && c.secret), paypalAuth: false, webhookId: !!E.PAYPAL_WEBHOOK_ID, workflows: store.workflows.size };
    try { c.t = ""; await ppToken(c); out.paypalAuth = true; } catch (e) { out.paypalError = e.message; }
    res.json(out);
  });

  // Dry run on the real engine. Capture/refund are NOT called (no money moves); Fetch Balance is read-only so it is real.
  app.post("/api/flow/run", async (req, res) => {
    const w = req.body?.workflow;
    if (!w || !Array.isArray(w.nodes) || !Array.isArray(w.edges) || w.nodes.length > 60) return res.status(400).json({ error: "invalid workflow" });
    if (!w.nodes.length) return res.status(400).json({ error: "add a node first" });
    const c = connOf(req, res); if (!c) return;
    const trg = w.nodes.find(n => n.kind === "trigger" && n.type !== "sch");
    const hi = req.body.sample === "high";
    const ctx = { event_type: trg ? realEvent(trg.config?.Event) : "MANUAL.RUN", id: "TEST-" + rid(), amount: hi ? 1840 : 42.5, currency: "USD", country: hi ? "RU" : "IN", item: "Wireless Earbuds", buyer: { email: "buyer@example.com" }, order: { id: "TEST-ORDER" }, capture: { id: "TEST-CAPTURE" } };
    const roots = trg ? null : w.nodes.filter(n => !w.edges.some(e => e.to === n.id)).map(n => n.id); // no trigger: start from nodes with no input
    res.json(await execute({ id: w.id || "test", name: w.name, nodes: w.nodes, edges: w.edges }, ctx, { dry: true, source: "test", conn: c, roots }));
  });
  app.get("/api/flow/logs", (_, res) => res.json({ logs: store.logs.slice(0, 100), reviews: store.reviews.slice(0, 100), flags: store.flags.slice(0, 100) }));
  app.get("/api/flow/status", (_, res) => res.json({ paypal: !!(E.PAYPAL_CLIENT_ID && E.PAYPAL_CLIENT_SECRET), webhookVerify: !!E.PAYPAL_WEBHOOK_ID, ai: !!E.GROQ_API_KEY, telegram: !!E.TELEGRAM_BOT_TOKEN, slack: !!E.SLACK_WEBHOOK_URL, discord: !!E.DISCORD_WEBHOOK_URL, email: !!(E.RESEND_API_KEY && E.EMAIL_FROM), workflows: store.workflows.size }));
}
export { execute, ctxFromWebhook, store, pp, ppToken, envConn, connOf, limited, fire };
