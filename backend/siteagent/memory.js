// siteagent/memory.js - Phase 2: retrieval (RAG) over the user's own saved chat runs. Lexical scoring, no embedding service needed.
// Only runs for a verified Firebase user and only reads rows where user_id = that uid, so one user can never read another's chats.
import { dbOn, dbSelect } from "../db.js";
const clip = (s, n) => String(s ?? "").slice(0, n);
const STOP = new Set("the a an and or to of in on for with is are was be it this that my me i you your add make change set use put from at as by".split(" "));
export const tokens = s => String(s || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f ]+/g, " ").split(/\s+/).filter(t => t.length > 2 && !STOP.has(t));
export function rank(query, rows, k = 4) {
  const q = new Set(tokens(query)); if (!q.size) return [];
  return rows.map(r => { const t = tokens([r.message, r.reply, (r.actions || []).join(" ")].join(" ")); let hit = 0; for (const w of t) if (q.has(w)) hit++; return { r, s: hit / Math.sqrt(t.length + 5) }; })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map(x => x.r);
}
const line = r => "- user: " + clip(r.message, 160) + " | did: " + clip((r.actions || []).join("; ") || r.reply, 200);
/* returns { notes, lastSpec } - lastSpec is the newest store built in THIS chat, so a follow-up edits it instead of starting a new store */
export async function recall({ chatId, uid, query }) {
  if (!dbOn() || !uid) return { notes: "", lastSpec: null };
  const u = "user_id=eq." + encodeURIComponent(uid), cols = "select=chat_id,message,reply,actions,created_at";
  try {
    const [mine, others, art] = await Promise.all([
      chatId ? dbSelect("ppai_ai_chat_runs", cols + "&" + u + "&chat_id=eq." + encodeURIComponent(chatId) + "&order=created_at.desc&limit=6") : [],
      dbSelect("ppai_ai_chat_runs", cols + "&" + u + (chatId ? "&chat_id=neq." + encodeURIComponent(chatId) : "") + "&changed=eq.true&order=created_at.desc&limit=40"),
      chatId ? dbSelect("ppai_ai_chat_runs", "select=artifacts&" + u + "&chat_id=eq." + encodeURIComponent(chatId) + "&changed=eq.true&order=created_at.desc&limit=1") : []
    ]);
    const lastSpec = art[0]?.artifacts?.find?.(a => a && a.type === "store_spec")?.spec || null;
    const parts = [];
    if (mine.length) parts.push("This chat so far (newest first):\n" + mine.slice(0, 4).map(line).join("\n"));
    const rel = rank(query, others, 3); if (rel.length) parts.push("Related earlier work in the user's other chats:\n" + rel.map(line).join("\n"));
    return { notes: clip(parts.join("\n"), 1400), lastSpec };
  } catch (e) { console.warn("recall failed:", e.message); return { notes: "", lastSpec: null }; }
}
