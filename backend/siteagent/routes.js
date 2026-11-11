// siteagent/routes.js - HTTP surface for the Site Agent. Only ADDS routes under /api/sa/*.
// Nothing in server.js, flow.js, store.js or agent.js changes behaviour.
import { limited } from "../flow.js";
import { runSiteAgent, hasKeys, PICKABLE, chain } from "./loop.js";

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
    const stream = b.stream === true; let started = false;
    const emit = ev => { if (stream) { if (!started) { started = true; res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" }); res.flushHeaders?.(); } res.write(JSON.stringify(ev) + "\n"); } };
    try {
      const out = await runSiteAgent({ message, history, spec: b.spec, tpl: t, auto, model: clip(b.model, 60), effort: clip(b.effort, 10), emit });
      if (started) { res.write(JSON.stringify({ type: "done", ...out }) + "\n"); res.end(); } else res.json(out);
    } catch (e) {
      const code = e.code >= 400 && e.code < 600 ? e.code : 502;
      if (started) { res.write(JSON.stringify({ type: "error", error: e.message, code }) + "\n"); res.end(); } else res.status(code).json({ error: e.message });
    }
  });
        }
