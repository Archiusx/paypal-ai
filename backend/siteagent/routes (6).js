// siteagent/routes.js - HTTP surface for the Site Agent. Only ADDS routes under /api/sa/*.
// Nothing in server.js, flow.js, store.js or agent.js changes behaviour.
import crypto from "node:crypto";
import { limited } from "../flow.js";
import { runSiteAgent, hasKeys, PICKABLE, chain, scrub } from "./loop.js";
import { dbOn, recordChatRun } from "../db.js";
import { recall } from "./memory.js";
import { verifyUid } from "../sync.js";

const clip = (s, n) => String(s ?? "").slice(0, n);

export function mountSiteAgent(app) {
  app.get("/api/sa/status", (_, res) => res.json({ ready: hasKeys(), models: PICKABLE, chain: chain().slice(0, 3), version: 1 }));

  app.post("/api/sa/chat", async (req, res) => {
    if (limited(req, "sachat", 14)) return res.status(429).json({ error: "Too many messages. Wait a minute." });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const message = clip(b.message, 1500).trim(); if (!message) return res.status(400).json({ error: "message required" });
    if (!hasKeys()) return res.status(503).json({ error: "AI is not configured on the server (set GROQ_API_KEY)." });
    const history = (Array.isArray(b.history) ? b.history : []).filter(h => h && (h.role === "user" || h.role === "assistant")).slice(-10);
    const t = b.tpl && typeof b.tpl === "object" ? { name: clip(b.tpl.name, 40), tag: clip(b.tpl.tag, 60) } : null;
    const auto = (Array.isArray(b.auto) ? b.auto : []).map(x => clip(x, 12).replace(/[^a-z]/g, "")).filter(Boolean).slice(0, 9);
    const sid = clip(b.sessionId, 64).replace(/[^\w-]/g, ""), ti = Number.isInteger(b.turnIndex) ? b.turnIndex : null;
    const uid = await verifyUid(req).catch(() => null);
    const mem = sid && uid && dbOn() ? await Promise.race([recall({ chatId: sid, uid, query: message }), new Promise(r => setTimeout(() => r({ notes: "", lastSpec: null }), 3500))]) : { notes: "", lastSpec: null };
    const stream = b.stream === true; let started = false;
    const emit = ev => { if (stream) { if (!started) { started = true; res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" }); res.flushHeaders?.(); } res.write(JSON.stringify(ev) + "\n"); } };
    try {
      const books = b.books && typeof b.books === "object" ? clip(JSON.stringify(b.books), 9000) : "";
      const out = await runSiteAgent({ books, message, history, spec: b.resume === true && mem.lastSpec ? mem.lastSpec : b.spec, memory: mem.notes, live: b.live === true, tpl: t, auto, model: clip(b.model, 60), effort: clip(b.effort, 10), emit });
      if (dbOn()) {   // Phase 1: persist the full execution record of this turn (fire-and-forget, never blocks or breaks the chat)
        Promise.resolve(uid).then(uid => recordChatRun({
          chat_id: sid || null, user_id: uid || null, turn_index: ti, message: scrub(message), reply: out.reply, model: out.model || null, partial: !!out.partial,
          actions: out.actions || [], tool_calls: out.trace || [], ui_requests: out.ui || [],
          artifacts: out.spec ? [{ type: "store_spec", hash: out.run?.after, spec: out.spec }] : [],
          spec_hash_before: out.run?.before || null, spec_hash_after: out.run?.after || null, changed: !!out.run?.changed, duration_ms: out.run?.ms ?? null,
          meta: { tpl: t, auto, effort: clip(b.effort, 10), requestedModel: clip(b.model, 60) }
        }));
      }
      if (started) { res.write(JSON.stringify({ type: "done", ...out }) + "\n"); res.end(); } else res.json(out);
    } catch (e) {
      const code = e.code >= 400 && e.code < 600 ? e.code : 502;
      if (started) { res.write(JSON.stringify({ type: "error", error: e.message, code }) + "\n"); res.end(); } else res.status(code).json({ error: e.message });
    }
  });
        
  /* ---- photo storage (Cloudinary). Signed upload with the server-side key, so the secret never reaches the browser. ----
     Env: CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (CLOUDINARY_SECRET_KEY also works), CLOUDINARY_CLOUD_NAME (default sdvziotr),
     or a single CLOUDINARY_URL=cloudinary://key:secret@cloud. */
  const cloud = () => {
    const E = process.env; let name = E.CLOUDINARY_CLOUD_NAME || "sdvziotr", key = E.CLOUDINARY_API_KEY, secret = E.CLOUDINARY_API_SECRET || E.CLOUDINARY_SECRET_KEY || E.CLOUDINARY_SECRET;
    const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(String(E.CLOUDINARY_URL || "").trim());
    if (m) { key = key || m[1]; secret = secret || m[2]; name = E.CLOUDINARY_CLOUD_NAME || m[3]; }
    return key && secret ? { name: String(name).trim(), key: String(key).trim(), secret: String(secret).trim() } : null;
  };
  const DATA_IMG = /^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+\/=]+$/i;
  async function toCloud(cfg, data) {
    const ts = Math.floor(Date.now() / 1000), folder = "paypal-ai/site-agent";
    const sig = crypto.createHash("sha1").update("folder=" + folder + "&timestamp=" + ts + cfg.secret).digest("hex");
    const fd = new FormData(); fd.append("file", data); fd.append("api_key", cfg.key); fd.append("timestamp", String(ts)); fd.append("folder", folder); fd.append("signature", sig);
    const r = await fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(cfg.name) + "/image/upload", { method: "POST", body: fd, signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.secure_url) throw new Error(String(j?.error?.message || "upload failed").slice(0, 120));
    /* f_auto,q_auto,w_1000: smaller, faster images in the published store */
    return String(j.secure_url).replace("/upload/", "/upload/f_auto,q_auto,w_1000/");
  }
  app.get("/api/sa/upload", (_, res) => res.json({ ready: !!cloud() }));
  app.post("/api/sa/upload", async (req, res) => {
    if (limited(req, "saup", 30)) return res.status(429).json({ error: "Too many uploads. Wait a minute." });
    const cfg = cloud(); if (!cfg) return res.status(503).json({ error: "Image storage is not configured on the server." });
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const list = (Array.isArray(b.images) ? b.images : []).slice(0, 4).map(x => ({ name: clip(x && x.name, 40) || "photo", data: String((x && x.data) || "") }));
    if (!list.length) return res.status(400).json({ error: "images required" });
    const out = await Promise.all(list.map(async x => {
      if (x.data.length > 700000 || !DATA_IMG.test(x.data)) return { name: x.name, error: "Unsupported or too large image" };
      try { return { name: x.name, url: await toCloud(cfg, x.data) }; } catch (e) { return { name: x.name, error: e.message }; }
    }));
    res.json({ images: out });
  });
}
