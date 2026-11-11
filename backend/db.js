// db.js - durable storage (Supabase REST, service-role key, SERVER ONLY). Phase 1 persistence layer.
// Env: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY), optional SUPABASE_URL. Without the key every helper is a safe no-op
// and store.js keeps working from its local file exactly as before.
const E = process.env;
const BASE = String(E.SUPABASE_URL || "https://sovgouyroijklrygyqyc.supabase.co").replace(/\/+$/, "");
const KEY = String(E.SUPABASE_SERVICE_ROLE_KEY || E.SUPABASE_SERVICE_KEY || "").trim();
export const dbOn = () => !!KEY;

async function call(path, opt = {}) {
  if (!KEY) throw new Error("database not configured");
  const r = await fetch(BASE + "/rest/v1/" + path, {
    ...opt, signal: AbortSignal.timeout(20000),
    headers: { apikey: KEY, ...(KEY.startsWith("sb_") ? {} : { Authorization: "Bearer " + KEY }), "Content-Type": "application/json", ...(opt.headers || {}) }   // new sb_secret_ keys are not JWTs: apikey header only
  });
  if (!r.ok) throw new Error("db " + r.status + " " + (await r.text().catch(() => "")).slice(0, 160));
  return r;
}
export const dbSelect = async (table, query) => { const j = await (await call(table + "?" + query)).json(); return Array.isArray(j) ? j : []; };
export const dbUpsert = (table, rows, conflict = "id") => call(table + "?on_conflict=" + conflict, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
export const dbInsert = (table, rows) => call(table, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
export const dbDelete = (table, query) => call(table + "?" + query, { method: "DELETE" });

/* One Site Agent turn: what was asked, every tool call, store versions (content hashes) before/after, and the generated artifact. Never throws. */
export async function recordChatRun(row) {
  if (!KEY) return false;
  try { await dbInsert("ppai_ai_chat_runs", [row]); return true; }
  catch (e) { console.warn("chat run not saved:", e.message); return false; }
  }
