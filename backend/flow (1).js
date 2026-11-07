// flow.js — Phase 1: PayPal-side nodes only (triggers via webhook, Capture, Refund, Condition on amount/country)
// All other node types are skipped with a clear "later phase" note, so existing flows never break.
const PP = "https://api-m.sandbox.paypal.com";
const E = process.env;
const store = { workflows: new Map(), runs: [], seen: new Map() };
const rid = () => Math.random().toString(36).slice(2, 8);

let tokCache = { t: "", exp: 0 };
async function ppToken() {
  if (tokCache.t && Date.now() < tokCache.exp) return tokCache.t;
  if (!E.PAYPAL_CLIENT_ID || !E.PAYPAL_CLIENT_SECRET) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set");
  const r = await fetch(PP + "/v1/oauth2/token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(E.PAYPAL_CLIENT_ID + ":" + E.PAYPAL_CLIENT_SECRET).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("PayPal auth failed " + r.status);
  const j = await r.json();
  tokCache = { t: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return tokCache.t;
}
async function pp(method, path, body, extra = {}) {
  const r = await fetch(PP + path, { method, headers: { Authorization: "Bearer " + await ppToken(), "Content-Type": "application/json", ...extra }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.details?.[0]?.description || j.message || "PayPal " + r.status));
  return j;
}

// ---------- engine ----------
const ALIAS = { "BILLING.SUBSCRIPTION.PAYMENT.COMPLETED": "PAYMENT.SALE.COMPLETED" }; // UI name -> real PayPal event
const realEvent = e => ALIAS[e] || e;
const PHASE1 = new Set(["pay", "ref", "dis", "sub", "cond", "cap", "rf"]);

function triggerMatches(n, ctx) {
  if (n.kind !== "trigger") return false;
  if (n.type === "sch") return false; // scheduler comes later
  if (realEvent(n.config?.Event) !== ctx.event_type) return false;
  const min = parseFloat(n.config?.["Min amount (USD)"]);
  return !(min > 0 && ctx.amount < min);
}

async function step(n, ctx, dry) {
  const c = n.config || {};
  if (n.kind === "trigger") return { detail: `${ctx.event_type} · ${ctx.amount} ${ctx.currency} · ${ctx.country || "?"}` };
  if (n.type === "cond") {
    const L = { "Risk score": ctx.score, Amount: ctx.amount, Country: ctx.country }[c.Check];
    if (L === undefined) return { status: "warn", detail: `"${c.Check}" not available yet (AI nodes come in phase 2) → took No branch`, branch: 1 };
    const R = isNaN(c.Value) ? c.Value : +c.Value;
    const y = c.Operator === ">" ? L > R : c.Operator === "<" ? L < R : L == R;
    return { detail: `${c.Check} ${c.Operator} ${c.Value} ? ${y ? "YES" : "NO"}`, branch: y ? 0 : 1 };
  }
  if (n.type === "cap") {
    if (ctx.capture?.id) return { detail: "already captured · " + ctx.capture.id };
    if (!ctx.order?.id) return { status: "warn", detail: "no order id in this event" };
    if (dry) return { status: "skipped", detail: "dry run: capture not called" };
    const j = await pp("POST", `/v2/checkout/orders/${ctx.order.id}/capture`, null, { "PayPal-Request-Id": "cap-" + ctx.order.id });
    const cp = j.purchase_units?.[0]?.payments?.captures?.[0];
    ctx.capture = { id: cp?.id };
    return { detail: `captured ${cp?.amount?.value} ${cp?.amount?.currency_code} · ${cp?.id} (${cp?.status})` };
  }
  if (n.type === "rf") {
    if (!ctx.capture?.id) return { status: "warn", detail: "no capture id to refund" };
    if (dry) return { status: "skipped", detail: "dry run: refund not called" };
    const amt = parseFloat(c.Amount);
    const body = amt > 0 ? { amount: { value: amt.toFixed(2), currency_code: ctx.currency } } : {};
    const j = await pp("POST", `/v2/payments/captures/${ctx.capture.id}/refund`, body, { "PayPal-Request-Id": "rf-" + ctx.capture.id + "-" + (amt || "full") });
    return { detail: `refund ${j.id} · ${j.status}` };
  }
  return { status: "skipped", detail: "node runs in a later phase" };
}

async function execute(flow, ctx, { dry = false, source = "webhook" } = {}) {
  const nodes = new Map(flow.nodes.map(n => [n.id, n]));
  const run = { id: "run_" + rid(), wf: flow.id, name: flow.name, source, event: ctx.event_type, at: Date.now(), status: "running", steps: [] };
  store.runs.unshift(run); store.runs.length = Math.min(store.runs.length, 100);
  const q = flow.nodes.filter(n => triggerMatches(n, ctx)).map(n => n.id), seen = new Set();
  let errors = 0;
  while (q.length && seen.size < 50) {
    const id = q.shift(); if (seen.has(id)) continue; seen.add(id);
    const n = nodes.get(id), t0 = Date.now(); let r;
    try { r = await step(n, ctx, dry); }
    catch (e) { r = { status: "error", detail: e.message }; errors++; }
    run.steps.push({ id, name: n.name, status: r.status || "ok", detail: r.detail, ms: Date.now() - t0 });
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
  return Promise.all(flows.map(f => execute(f, { ...ctx })));
}

// ---------- PayPal event -> context ----------
async function ctxFromWebhook(ev) {
  const r = ev.resource || {}, t = ev.event_type;
  const ctx = { event_type: t, id: ev.id, currency: r.amount?.currency_code || r.amount?.currency || "USD", amount: parseFloat(r.amount?.value ?? r.amount?.total ?? r.dispute_amount?.value ?? 0), country: "", buyer: {}, order: {}, capture: {} };
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
export function mountFlow(app) {
  app.post("/api/flow/publish", (req, res) => {
    const w = req.body?.workflow;
    if (!w?.id || !Array.isArray(w.nodes) || !Array.isArray(w.edges)) return res.status(400).json({ error: "invalid workflow" });
    if (w.nodes.length > 60) return res.status(400).json({ error: "too many nodes" });
    store.workflows.set(w.id, { id: w.id, name: w.name, nodes: w.nodes, edges: w.edges });
    res.json({ ok: true, id: w.id, supported: w.nodes.map(n => ({ id: n.id, phase1: PHASE1.has(n.type) || n.kind === "trigger" })) });
  });

  // Create a REAL sandbox order; buyer approves with a sandbox personal account, then PayPal sends them to /api/paypal/return
  app.post("/api/flow/order", async (req, res) => {
    try {
      const amount = Math.min(Math.max(parseFloat(req.body?.amount) || 10, 1), 5000).toFixed(2);
      const base = E.PUBLIC_API_URL || (req.protocol + "://" + req.get("host"));
      const j = await pp("POST", "/v2/checkout/orders", {
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value: amount }, description: String(req.body?.description || "FlowBuilder demo order").slice(0, 120) }],
        payment_source: { paypal: { experience_context: { return_url: base + "/api/paypal/return", cancel_url: base + "/api/paypal/return?cancel=1", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" } } }
      }, { "PayPal-Request-Id": "ord-" + rid() + Date.now() });
      const link = j.links?.find(l => l.rel === "payer-action" || l.rel === "approve")?.href;
      res.json({ orderId: j.id, approveUrl: link });
    } catch (e) { res.status(502).json({ error: e.message }); }
  });

  app.get("/api/paypal/return", async (req, res) => {
    const page = (t, m) => res.send(`<body style="font-family:system-ui;text-align:center;padding:60px"><h2>${t}</h2><p>${m}</p></body>`);
    if (req.query.cancel) return page("Payment cancelled", "You can close this tab.");
    try {
      const id = String(req.query.token || "");
      const j = await pp("POST", `/v2/checkout/orders/${id}/capture`, null, { "PayPal-Request-Id": "cap-" + id });
      const cp = j.purchase_units?.[0]?.payments?.captures?.[0];
      if (cp?.status === "COMPLETED") fire({ event_type: "PAYMENT.CAPTURE.COMPLETED", id: cp.id, amount: parseFloat(cp.amount.value), currency: cp.amount.currency_code, country: j.payer?.address?.country_code || "", item: j.purchase_units[0].description, buyer: { email: j.payer?.email_address, name: [j.payer?.name?.given_name, j.payer?.name?.surname].filter(Boolean).join(" ") }, order: { id }, capture: { id: cp.id } }).catch(console.error);
      page("Payment captured ✓", "Sandbox payment " + (cp?.id || "") + " is done. Go back to the Workflow Builder; your flow is running.");
    } catch (e) { page("Capture failed", e.message.replace(/</g, "&lt;")); }
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
  app.get("/api/flow/selftest", async (_, res) => {
    const out = { backend: true, paypalCreds: !!(E.PAYPAL_CLIENT_ID && E.PAYPAL_CLIENT_SECRET), paypalAuth: false, webhookId: !!E.PAYPAL_WEBHOOK_ID, workflows: store.workflows.size };
    try { tokCache = { t: "", exp: 0 }; await ppToken(); out.paypalAuth = true; } catch (e) { out.paypalError = e.message; }
    res.json(out);
  });
  // Safe dry run on the real engine (capture/refund are NOT called, no money moves)
  app.post("/api/flow/run", async (req, res) => {
    const w = req.body?.workflow;
    if (!w || !Array.isArray(w.nodes) || !Array.isArray(w.edges) || w.nodes.length > 60) return res.status(400).json({ error: "invalid workflow" });
    const trg = w.nodes.find(n => n.kind === "trigger" && n.type !== "sch");
    if (!trg) return res.status(400).json({ error: "add a payment trigger first" });
    const hi = req.body.sample === "high";
    const ctx = { event_type: realEvent(trg.config?.Event), id: "TEST-" + rid(), amount: hi ? 1840 : 42.5, currency: "USD", country: hi ? "RU" : "IN", item: "Wireless Earbuds", buyer: { email: "buyer@example.com" }, order: { id: "TEST-ORDER" }, capture: { id: "TEST-CAPTURE" } };
    res.json(await execute({ id: w.id || "test", name: w.name, nodes: w.nodes, edges: w.edges }, ctx, { dry: true, source: "test" }));
  });
  app.get("/api/flow/status", (_, res) => res.json({ paypal: !!(E.PAYPAL_CLIENT_ID && E.PAYPAL_CLIENT_SECRET), webhookVerify: !!E.PAYPAL_WEBHOOK_ID, workflows: store.workflows.size }));
}
export { execute, ctxFromWebhook, store };
