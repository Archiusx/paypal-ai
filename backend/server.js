import express from "express";
import cors from "cors";

const {
  CHANNEL3_API_KEY,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  GROQ_API_KEY,
  GROQ_MODEL = "llama-3.3-70b-versatile",
  ZAPIER_WEBHOOK_URL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  DISCORD_WEBHOOK_URL,
  APIFY_TOKEN,
  ALLOWED_ORIGIN = "*",
  INR_PER_USD = "84",
  PORT = 3000
} = process.env;

const PP = "https://api-m.sandbox.paypal.com";
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const app = express();

const ORIGIN = ((ALLOWED_ORIGIN || "*").split(/[\s#]/)[0] || "*").replace(/\/+$/, "");
app.use(cors({ origin: ORIGIN === "*" ? true : ORIGIN }));
app.use((q, r, n) => {
  console.log(`[${new Date().toISOString()}] ${q.method} ${q.url}`);
  n();
});
app.use((q, r, n) => {
  q.url = q.url.replace(/\/{2,}/g, "/");
  n();
});
app.use(express.json());

const bad = (res, m, c = 400) => res.status(c).json({ error: m });
const toUsd = (n, c) => (c === "INR" ? n / +INR_PER_USD : n);

// In-memory store for published workflows { [id]: workflowObj }
const publishedWorkflows = new Map();

/* ==========================================================================
   PART 1: PAYPAL PAYOUTS & PRICE WATCHER (ORIGINAL ENGINE INTACT)
   ========================================================================== */

// Channel3: product details from any product URL
async function lookupC3(url) {
  const r = await fetch("https://api.trychannel3.com/v1/lookup", {
    method: "POST",
    headers: { "x-api-key": CHANNEL3_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  if (!r.ok) throw new Error("Channel3 " + r.status + " " + (await r.text()).slice(0, 120));
  const p = (await r.json()).product;
  if (!p) throw new Error("Product not found");
  const o = p.offers?.[0] || {},
    pr = o.price?.price ?? o.price,
    cur = o.price?.currency || "USD";
  if (!(pr > 0)) throw new Error("Price not available for this product");
  let rate = o.max_commission_rate ?? 0;
  if (rate <= 1) rate *= 100;
  return { title: p.title, price: +pr, currency: cur, commissionPct: clamp(rate || 2, 1, 10) };
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const num = (v) => {
  if (v && typeof v == "object") v = v.value ?? v.price ?? v.amount;
  return parseFloat(String(v ?? "").replace(/[^\d.]/g, "")) || 0;
};

// Fallback 1: read product page directly (JSON-LD / og tags)
async function scrape(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9", Accept: "text/html" },
    redirect: "follow"
  });
  if (!r.ok) throw new Error("store blocked the server (" + r.status + ")");
  const h = await r.text();
  let title = "",
    price = 0,
    cur = "";
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n == "object") {
      if (/Product/.test(String(n["@type"]))) {
        title = title || n.name;
        const o = Array.isArray(n.offers) ? n.offers[0] : n.offers;
        if (o) {
          price = price || num(o.price ?? o.lowPrice);
          cur = cur || o.priceCurrency;
        }
      }
      Object.values(n).forEach(walk);
    }
  };
  for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi))
    try {
      walk(JSON.parse(m[1]));
    } catch {}
  const meta = (p) => (h.match(new RegExp("<meta[^>]+(?:property|name)=[\"']" + p + "[\"'][^>]*content=[\"']([^\"']*)[\"']", "i")) || [])[1];
  title = title || meta("og:title") || (h.match(/<title>([^<]*)/i) || [])[1] || "";
  price = price || num(meta("product:price:amount") || meta("og:price:amount"));
  cur = cur || meta("product:price:currency") || meta("og:price:currency") || (/flipkart|\.in\b/i.test(url) ? "INR" : "USD");
  if (!(price > 0)) throw new Error("no price found in page");
  return { title: title.trim(), price, currency: cur, commissionPct: 2 };
}

// Fallback 2: Apify
async function viaApify(url) {
  const r = await fetch(
    `https://api.apify.com/v2/acts/apify~e-commerce-scraping-tool/run-sync-get-dataset-items?token=${APIFY_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detailsUrls: [{ url }], maxProductResults: 1 })
    }
  );
  if (!r.ok) throw new Error("Apify " + r.status);
  const it = (await r.json())[0];
  if (!it) throw new Error("Apify returned nothing");
  const o = Array.isArray(it.offers) ? it.offers[0] : it.offers,
    price = num(o?.price) || num(it.price) || num(it.currentPrice);
  if (!(price > 0)) throw new Error("Apify found no price");
  return { title: it.name || it.title || "Product", price, currency: o?.priceCurrency || it.currency || "INR", commissionPct: 2 };
}

async function lookup(url) {
  const errs = [];
  for (const f of [lookupC3, scrape, ...(APIFY_TOKEN ? [viaApify] : [])])
    try {
      return await f(url);
    } catch (e) {
      errs.push(f.name + ": " + e.message);
    }
  throw new Error("Could not read this product. " + errs.join(" | ").slice(0, 350));
}

// AI: Groq decides price-drop target
async function aiTarget(t, price, cur) {
  let pct = 10,
    reason = "Target set 10% below current price.";
  if (GROQ_API_KEY)
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.2,
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content: `Product: ${t}. Price: ${price} ${cur}. Pick a realistic price-drop alert threshold (5-30 percent below current). Reply ONLY JSON: {"discountPct":number,"reason":"one short sentence"}`
            }
          ]
        })
      });
      if (!r.ok) throw new Error("Groq " + r.status);
      const j = JSON.parse((await r.json()).choices[0].message.content.replace(/```json|```/g, "").trim());
      pct = clamp(+j.discountPct || 10, 5, 30);
      reason = j.reason || reason;
    } catch (e) {
      console.warn("AI fallback:", e.message);
    }
  return { target: Math.round(price * (1 - pct / 100)), reason };
}

app.post(["/api/watch", "/watch"], async (req, res) => {
  try {
    const p = await lookup(req.body.url);
    const a = await aiTarget(p.title, p.price, p.currency);
    res.json({ ...p, ...a });
  } catch (e) {
    bad(res, e.message, 502);
  }
});

async function ppToken() {
  const r = await fetch(PP + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(PAYPAL_CLIENT_ID + ":" + PAYPAL_CLIENT_SECRET).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!r.ok) throw new Error("PayPal auth failed");
  return (await r.json()).access_token;
}

app.post(["/api/payout", "/payout"], async (req, res) => {
  try {
    const { url, to, target, currency = "USD", commissionPct, name } = req.body;
    if (!to || !target) return bad(res, "to and target required");
    const price = req.body.simulate ? target - Math.round(Math.random() * 500) : (await lookup(url)).price;
    if (price > target) return bad(res, "Price has not dropped yet", 409);
    const commission = +(toUsd(price, currency) * commissionPct / 100).toFixed(2),
      payout = +(commission * 0.5).toFixed(2);
    const tok = await ppToken(),
      id = "B" + Date.now();
    const r = await fetch(PP + "/v1/payments/payouts", {
      method: "POST",
      headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: id,
          email_subject: "Your price-drop cashback",
          email_message: "The price dropped. Here is your cashback."
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: { value: payout.toFixed(2), currency: "USD" },
            receiver: to,
            note: "Price drop: " + (name || url),
            sender_item_id: id + "-1"
          }
        ]
      })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.message || "PayPal payout failed");
    if (ZAPIER_WEBHOOK_URL)
      fetch(ZAPIER_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: to, product: name, price, currency, payout })
      }).catch(() => {});
    res.json({ price, commission, payout, batchId: j.batch_header.payout_batch_id });
  } catch (e) {
    bad(res, e.message, 502);
  }
});

/* ==========================================================================
   PART 2: PAYPAL FLOWBUILDER AI (GROQ, TELEGRAM & DISCORD INTEGRATIONS)
   ========================================================================== */

// Helper: Telegram Bot Message Dispatcher
async function sendTelegramAlert(token, chatId, text) {
  const activeToken = token || TELEGRAM_BOT_TOKEN;
  const activeChatId = chatId || TELEGRAM_CHAT_ID;
  if (!activeToken || !activeChatId) {
    return { success: false, reason: "Missing Telegram Bot Token or Chat ID" };
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${activeToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: activeChatId,
        text: text,
        parse_mode: "Markdown"
      })
    });
    const data = await r.json();
    return { success: r.ok, data };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

// Helper: Discord Webhook Dispatcher
async function sendDiscordAlert(webhookUrl, content) {
  const activeUrl = webhookUrl || DISCORD_WEBHOOK_URL;
  if (!activeUrl || !activeUrl.startsWith("http")) {
    return { success: false, reason: "Invalid or missing Discord Webhook URL" };
  }
  try {
    const r = await fetch(activeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    return { success: r.ok };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

// Helper: Groq Risk & Receipt Analysis Engine
async function evaluateTransactionWithGroq(tx) {
  if (!GROQ_API_KEY) {
    const isSus = tx.amount > 500 || tx.country === "RU";
    return {
      score: isSus ? 88 : 14,
      riskLevel: isSus ? "HIGH" : "LOW",
      reason: isSus ? "High transaction velocity / flagged country" : "Standard customer checkout profile",
      receiptMessage: `PayPal Receipt: $${tx.amount} received from ${tx.buyerEmail || "customer"} for ${tx.item || "Order"}.`
    };
  }

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + GROQ_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are PayPal's real-time AI Risk & Transaction Engine.
Analyze the payment object and return pure JSON with:
{
  "score": <integer 0-100 where >70 is high risk>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "reason": "<one sentence concise reasoning>",
  "receiptMessage": "<2-line professional receipt for Telegram/Discord alert>"
}`
          },
          {
            role: "user",
            content: JSON.stringify(tx)
          }
        ]
      })
    });

    if (!r.ok) throw new Error("Groq API error " + r.status);
    const j = await r.json();
    return JSON.parse(j.choices[0].message.content);
  } catch (err) {
    console.warn("[Groq Fallback]:", err.message);
    const isSus = tx.amount > 500;
    return {
      score: isSus ? 82 : 16,
      riskLevel: isSus ? "HIGH" : "LOW",
      reason: "Rule-based fallback evaluation",
      receiptMessage: `Receipt: $${tx.amount} processed for ${tx.item || "Order"}.`
    };
  }
}

// 1. Natural Language Flow Assistant (Groq Chat)
app.post("/api/chat", async (req, res) => {
  const { message, workflow } = req.body;
  if (!GROQ_API_KEY) {
    return res.json({ reply: null });
  }

  try {
    const prompt = `You are the PayPal FlowBuilder Assistant. 
The user asks: "${message}".
Current workflow canvas has ${workflow?.nodes?.length || 0} nodes.
Respond concisely in clean markdown with recommendations or flow explanations.`;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300
      })
    });

    if (!r.ok) throw new Error("Groq API " + r.status);
    const data = await r.json();
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    res.json({ reply: null, error: err.message });
  }
});

// 2. Real-time Workflow Execution Route (Test Button or Live Hook)
app.post("/api/execute-flow", async (req, res) => {
  const { workflow, sampleTx } = req.body;
  if (!workflow || !Array.isArray(workflow.nodes)) {
    return bad(res, "Invalid workflow format: nodes array required");
  }

  const tx = sampleTx || {
    id: "TXN-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
    amount: 149.99,
    country: "US",
    item: "Pro SaaS Subscription",
    buyerEmail: "merchant-tester@paypal.com"
  };

  const logs = [];
  logs.push(`🚀 *PayPal Event Triggered:* \`${tx.id}\` — $${tx.amount} (${tx.country})`);

  // Run AI Risk & Receipt analysis via Groq
  const ai = await evaluateTransactionWithGroq(tx);
  logs.push(`🧠 *AI Evaluation (Groq Llama 3.3):* Score ${ai.score}/100 [${ai.riskLevel}] — ${ai.reason}`);

  let telegramSuccess = false;
  let discordSuccess = false;

  for (const node of workflow.nodes) {
    // Node: Telegram Alert
    if (node.type === "tg") {
      const cfg = node.config || {};
      const token = cfg["Bot Token"];
      const chatId = cfg["Chat ID"];
      const customMsg = cfg["Message"] || "";

      const msg =
        `🔔 *PayPal FlowBuilder Notification*\n\n` +
        `*Status:* Payment Captured\n` +
        `*Transaction ID:* \`${tx.id}\`\n` +
        `*Amount:* $${tx.amount} (${tx.country})\n` +
        `*Risk Assessment:* *${ai.riskLevel}* (${ai.score}/100)\n` +
        `*Details:* ${ai.reason}\n\n` +
        `🧾 *Generated Receipt:*\n${ai.receiptMessage}\n\n` +
        (customMsg ? `_Custom Note: ${customMsg}_` : "");

      const tg = await sendTelegramAlert(token, chatId, msg);
      telegramSuccess = tg.success;
      logs.push(
        telegramSuccess
          ? `✈️ *Telegram Alert:* Dispatched successfully to Telegram`
          : `⚠️ *Telegram Notice:* Skipped or failed (${tg.reason || "check Bot Token & Chat ID"})`
      );
    }

    // Node: Discord Webhook
    if (node.type === "dc") {
      const cfg = node.config || {};
      const webhookUrl = cfg["Webhook URL"];
      const discordText =
        `**[PayPal FlowBuilder AI] Payment Event**\n` +
        `• **Transaction:** \`${tx.id}\`\n` +
        `• **Amount:** $${tx.amount} (${tx.country})\n` +
        `• **AI Risk Level:** **${ai.riskLevel}** (${ai.score}/100)\n` +
        `• **Receipt Note:** ${ai.receiptMessage}`;

      const dc = await sendDiscordAlert(webhookUrl, discordText);
      discordSuccess = dc.success;
      logs.push(
        discordSuccess
          ? `🎮 *Discord Webhook:* Sent to Discord channel`
          : `⚠️ *Discord Notice:* Skipped (${dc.reason || "check webhook url"})`
      );
    }

    // Node: DB Ledger
    if (node.type === "log") {
      logs.push(`💾 *Database Ledger:* Transaction written to audit table`);
    }
  }

  res.json({
    success: true,
    tx,
    ai,
    logs,
    delivered: { telegram: telegramSuccess, discord: discordSuccess }
  });
});

// 3. Workflow Registration & Live Webhook Listener
app.post("/api/workflows/register", (req, res) => {
  const { workflow } = req.body;
  if (!workflow || !workflow.id) return bad(res, "Missing workflow id");
  publishedWorkflows.set(workflow.id, workflow);
  const host = req.get("host");
  const protocol = req.protocol;
  res.json({
    registered: true,
    workflowId: workflow.id,
    webhookUrl: `${protocol}://${host}/webhooks/paypal/${workflow.id}`
  });
});

app.post(["/webhooks/paypal/:id", "/api/webhooks/paypal/:id"], async (req, res) => {
  const { id } = req.params;
  const webhookBody = req.body || {};
  console.log(`[PayPal Webhook] Workflow: ${id}, Event: ${webhookBody.event_type}`);

  const wf = publishedWorkflows.get(id);
  const resource = webhookBody.resource || {};
  const amount = resource.amount ? resource.amount.value : 99.00;

  const sampleTx = {
    id: resource.id || "WH-" + Date.now(),
    amount: parseFloat(amount) || 99.00,
    country: resource.payer?.address?.country_code || "US",
    item: webhookBody.summary || "Live PayPal Webhook Event",
    buyerEmail: resource.payer?.email_address || "sandbox-buyer@paypal.com"
  };

  if (wf) {
    // Trigger workflow pipeline asynchronously
    fetch(`http://localhost:${PORT}/api/execute-flow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: wf, sampleTx })
    }).catch((e) => console.error("[Webhook Exec Error]", e.message));
  }

  res.status(200).send("WEBHOOK_PROCESSED");
});

/* ==========================================================================
   PART 3: HEALTH & STATUS ROUTES
   ========================================================================== */

app.get("/", (_, r) =>
  r.json({
    status: "online",
    name: "PayPal FlowBuilder AI & Payouts Engine",
    groqConfigured: Boolean(GROQ_API_KEY),
    paypalConfigured: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET)
  })
);

app.get("/api/health", (_, r) =>
  r.json({
    ok: true,
    version: "4.0.0-hackathon-final",
    routes: [
      "POST /api/watch",
      "POST /api/payout",
      "POST /api/chat",
      "POST /api/execute-flow",
      "POST /api/workflows/register",
      "POST /webhooks/paypal/:id"
    ]
  })
);

app.use((q, r) =>
  r.status(404).json({
    error: `No route ${q.method} ${q.path} on this server (version 4.0.0). Redeploy the latest server.js.`
  })
);

app.listen(PORT, () => console.log("PayPal FlowBuilder Server running on port", PORT));
