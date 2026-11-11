// siteagent/tools.js - the Site Agent's hands. Every tool edits a PRIVATE COPY of the store spec and routes the
// result through store.js sanitizeSpec(), so the output is always a valid, escaped, renderable store.
// Nothing here publishes, charges, or touches PayPal/Groq/network. Pure functions on a spec.
import { sanitizeSpec, renderSite } from "../store.js";
import { V, SITE_HELP } from "./vocab.js";

const pick = (o, keys) => { const r = {}; for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) r[k] = o[k]; return r; };
const HEX = /^#[0-9a-f]{6}$/i;
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const EMOJI = /\p{Extended_Pictographic}/u, FILLER = /lorem|ipsum|placeholder|describe your|your text here|coming soon/i;
const SECTIONS = ["theme", "hero", "about", "menu", "plugins"];

const obj = (properties, required = []) => ({ type: "object", properties, required });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const tool = (name, description, parameters) => ({ type: "function", function: { name, description, parameters } });
const prod = { id: str("existing product id (omit for a new product)"), name: str("max 60"), desc: str("max 120"), price: { type: "number", description: "0.5 to 99999" }, art: str("icon art", { enum: V.art }), badge: str("max 16"), image: str("https image URL, optional") };

export const TOOLS = [
  tool("get_site", "Read the current store. section=summary (default) is compact; section=full returns all copy.", obj({ section: str("summary or full", { enum: ["summary", "full"] }) })),
  tool("replace_site", "Write or rewrite the WHOLE store in one call (best for a new store). Sections you omit stay unchanged. " + SITE_HELP, obj({ site: { type: "object", description: "the site object" } }, ["site"])),
  tool("set_brand", "Update name, tagline, announcement bar, section titles, footer or contact email.", obj({ name: str("max 40"), tagline: str("max 90"), announcement: str("max 100, empty to hide"), shopTitle: str(""), faqTitle: str(""), footer: str("max 120"), contactEmail: str("") })),
  tool("set_theme", "Change palette, font, corner radius, hero layout or look. Colours are #rrggbb with strong text contrast.", obj({ primary: str("#rrggbb"), accent: str("#rrggbb"), bg: str("#rrggbb page background"), font: str("", { enum: V.fonts }), radius: str("", { enum: V.radii }), hero_layout: str("", { enum: V.heroLayouts }), look: str("classic or sang", { enum: V.looks }) })),
  tool("set_hero", "Update the hero headline, sub text and button label.", obj({ title: str("max 90"), sub: str("max 220"), cta: str("max 24") })),
  tool("set_features", "Replace the feature strip (max 4).", obj({ features: { type: "array", items: obj({ icon: str("", { enum: V.icons }), title: str("max 36"), text: str("max 110") }, ["title"]) } }, ["features"])),
  tool("set_products", "Replace the whole product list (max 24). Existing images are kept for matching ids.", obj({ products: { type: "array", items: obj(prod, ["name", "price"]) } }, ["products"])),
  tool("upsert_product", "Add a product, or update the one with the same id or name.", obj(prod, ["name"])),
  tool("remove_product", "Remove a product by id or name. The store keeps at least one product.", obj({ id: str("product id or exact name") }, ["id"])),
  tool("set_about", "Update the About section.", obj({ title: str("max 60"), text: str("max 520") })),
  tool("set_faqs", "Replace the FAQ list (max 6).", obj({ faqs: { type: "array", items: obj({ q: str("max 100"), a: str("max 300") }, ["q", "a"]) } }, ["faqs"])),
  tool("set_commerce", "Currency, shipping fee, tax percent, paypal.me handle.", obj({ currency: str("", { enum: V.currencies }), shipping: { type: "number" }, taxPct: { type: "number" }, paypalMe: str("handle only") })),
  tool("set_plugins", "Switch store plugins on or off.", obj(Object.fromEntries(V.plugins.map(k => [k, { type: "boolean" }])))),
  tool("publish_store", "Ask the app to publish (or update) this store. The user must tap Approve in the chat, so it is safe to call once the store is ready and audited. Never claim it is live; say it is waiting for approval.", obj({})),
  tool("automate_store", "Ask the app to create the post-purchase automation workflow for this store (receipt, email, ledger, alerts). Runs after the store is published; the user taps Approve.", obj({})),
  tool("open_page", "Ask the app to open one of its pages for the user.", obj({ page: str("page to open", { enum: ["store", "flow", "payouts", "tx", "sm", "pp", "home"] }) }, ["page"])),
  tool("audit_site", "Check contrast, filler text, emoji, thin sections and that the page renders. Call before finishing a build.", obj({}))
];


/* ---- transparency helpers: what a step was given, and what it changed (shown live to the user) ---- */
const cl = (v, n) => String(v ?? "").replace(/\s+/g, " ").slice(0, n);
export const brief = a => {
  const o = {}; if (!a || typeof a !== "object") return o;
  for (const k of Object.keys(a).slice(0, 8)) { const v = a[k]; o[k] = Array.isArray(v) ? v.length + " items" : v && typeof v === "object" ? "{" + Object.keys(v).length + " fields}" : cl(v, 70); }
  return o;
};
export const snap = s => {
  const o = {};
  for (const k of ["name", "tagline", "announcement", "shopTitle", "faqTitle", "footer", "look", "currency", "shipping", "taxPct", "contactEmail", "paypalMe"]) o[k] = s[k];
  for (const sec of ["theme", "hero", "about"]) for (const k of Object.keys(s[sec] || {})) o[sec + "." + k] = s[sec][k];
  o.features = s.features.map(f => f.title).join(" | "); o.products = s.products.map(p => p.name + " (" + p.price + ")").join(" | ");
  o.faqs = s.faqs.length + " questions"; o.plugins = Object.keys(s.plugins).filter(k => s.plugins[k]).join(", ");
  return o;
};
export const diffSpec = (a, b) => { const out = []; for (const k of Object.keys(b)) if (String(a[k]) !== String(b[k])) out.push({ k, from: cl(a[k], 90), to: cl(b[k], 90) }); return out.slice(0, 10); };
export const resultNote = (name, out) => {
  if (out.error) return out.error;
  if (name === "audit_site") return out.ok ? (out.issues.length ? "Passed with " + out.issues.length + " minor notes: " + out.issues.map(i => i.msg).join(" ") : "No problems found") : "Found: " + out.issues.map(i => i.msg).join(" ");
  if (name === "get_site") return "Read " + (out.products ? out.products.length + " products" : "the full store");
  if (out.rejected) return "Some values were not allowed: " + out.rejected.join(", ");
  return "";
};

export const LABELS = {
  get_site: "Reading your store", replace_site: "Writing the full store", set_brand: "Updating brand copy", set_theme: "Updating colours and type",
  set_hero: "Rewriting the hero", set_features: "Updating features", set_products: "Updating the product list", upsert_product: "Saving a product",
  remove_product: "Removing a product", set_about: "Updating About", set_faqs: "Updating FAQs", set_commerce: "Updating currency and fees",
  set_plugins: "Updating plugins", audit_site: "Auditing the store",
  publish_store: "Requesting publish", automate_store: "Requesting automation", open_page: "Preparing to open a page"
};

export class SiteEditor {
  constructor(spec) { this.spec = sanitizeSpec(spec); this.changed = false; this.log = []; this.ui = []; }
  ask(a) { if (!this.ui.some(x => x.type === a.type && x.page === a.page)) this.ui.push(a); return { ok: true, status: "waiting for the user to approve in the chat" }; }
  t_publish_store() { return this.ask({ type: "publish" }); }
  t_automate_store() { return this.ask({ type: "automate" }); }
  t_open_page(a) { const ok = ["store", "flow", "payouts", "tx", "sm", "pp", "home"]; if (!ok.includes(a.page)) return { error: "unknown page" }; return this.ask({ type: "open", page: a.page }); }

  commit(p, label) {
    const before = JSON.stringify(this.spec);
    this.spec = sanitizeSpec({ ...this.spec, ...p });
    if (JSON.stringify(this.spec) !== before) { this.changed = true; if (!this.log.includes(label)) this.log.push(label); }
  }
  merge(p) { const m = { ...p }; for (const k of SECTIONS) if (p[k] && typeof p[k] === "object" && !Array.isArray(p[k])) m[k] = { ...this.spec[k], ...p[k] }; return m; }

  summary(full) {
    const s = this.spec, strip = p => ({ ...p, img: p.img ? "[uploaded image]" : "" });
    if (full) return { ...s, products: s.products.map(strip), st: undefined };
    return {
      name: s.name, tagline: s.tagline, announcement: s.announcement, theme: s.theme, look: s.look, hero: s.hero,
      features: s.features.map(f => f.title), products: s.products.map(p => ({ id: p.id, name: p.name, price: p.price, art: p.art, badge: p.badge || undefined, image: !!(p.image || p.img) })),
      about: !!s.about.text, faqs: s.faqs.length, plugins: Object.keys(s.plugins).filter(k => s.plugins[k]), currency: s.currency, shipping: s.shipping, taxPct: s.taxPct, contactEmail: !!s.contactEmail, paypalMe: !!s.paypalMe
    };
  }

  run(name, a) {
    a = a && typeof a === "object" ? a : {};
    const f = this["t_" + name];
    if (typeof f !== "function") return { error: "unknown tool " + name };
    try { return f.call(this, a); } catch (e) { return { error: String(e?.message || e).slice(0, 200) }; }
  }

  t_get_site(a) { return this.summary(a.section === "full"); }

  t_replace_site(a) {
    const site = a.site && typeof a.site === "object" && !Array.isArray(a.site) ? { ...a.site } : null;
    if (!site) return { error: "site object required" };
    if (Array.isArray(site.products)) {
      const old = new Map(this.spec.products.map(p => [p.id, p]));
      site.products = site.products.map(p => { const o = old.get(p && p.id); return o && p && !p.image && !p.img ? { ...p, image: o.image, img: o.img } : p; });
    }
    this.commit(this.merge(site), "Built the store content");
    return { ok: true, products: this.spec.products.length, theme: this.spec.theme };
  }

  t_set_brand(a) { this.commit(pick(a, ["name", "tagline", "announcement", "shopTitle", "faqTitle", "footer", "contactEmail"]), "Updated brand copy"); return { ok: true, name: this.spec.name, tagline: this.spec.tagline }; }

  t_set_theme(a) {
    const ok = { primary: v => HEX.test(v), accent: v => HEX.test(v), bg: v => HEX.test(v), font: v => V.fonts.includes(v), radius: v => V.radii.includes(v), hero: v => V.heroLayouts.includes(v) };
    const t = {}, bad = [], want = { ...pick(a, ["primary", "accent", "bg", "font", "radius"]), ...(a.hero_layout != null ? { hero: a.hero_layout } : {}) };
    for (const k of Object.keys(want)) (ok[k](String(want[k])) ? (t[k] = String(want[k]).toLowerCase()) : bad.push(k === "hero" ? "hero_layout" : k));
    const p = {}; if (Object.keys(t).length) p.theme = { ...this.spec.theme, ...t };
    if (a.look != null) (V.looks.includes(a.look) ? (p.look = a.look) : bad.push("look"));
    this.commit(p, "Updated colours, type and layout");
    return { ok: !bad.length, theme: this.spec.theme, look: this.spec.look, ...(bad.length ? { rejected: bad, allowed: { fonts: V.fonts, radii: V.radii, hero_layout: V.heroLayouts, looks: V.looks, colours: "#rrggbb" } } : {}) };
  }

  t_set_hero(a) { this.commit({ hero: { ...this.spec.hero, ...pick(a, ["title", "sub", "cta"]) } }, "Rewrote the hero"); return { ok: true, hero: this.spec.hero }; }
  t_set_features(a) { if (!Array.isArray(a.features)) return { error: "features array required" }; this.commit({ features: a.features }, "Updated features"); return { ok: true, count: this.spec.features.length }; }
  t_set_products(a) {
    if (!Array.isArray(a.products) || !a.products.length) return { error: "products array required" };
    const old = new Map(this.spec.products.map(p => [p.id, p]));
    this.commit({ products: a.products.map(p => { const o = old.get(p && p.id); return o && p && !p.image && !p.img ? { ...p, image: o.image, img: o.img } : p; }) }, "Updated the product list");
    return { ok: true, products: this.spec.products.map(p => ({ id: p.id, name: p.name, price: p.price })) };
  }
  t_upsert_product(a) {
    const key = String(a.id || a.name || "").trim().toLowerCase(), list = this.spec.products.map(p => ({ ...p }));
    const i = list.findIndex(p => p.id.toLowerCase() === key || p.name.toLowerCase() === key);
    const data = pick(a, ["name", "desc", "price", "art", "badge", "image"]);
    if (i >= 0) list[i] = { ...list[i], ...data };
    else { if (list.length >= 24) return { error: "24 products is the maximum" }; list.push({ ...data, id: "p" + (list.length + 1 + Math.floor(Math.random() * 90)) }); }
    this.commit({ products: list }, i >= 0 ? "Updated a product" : "Added a product");
    const at = this.spec.products[i >= 0 ? i : this.spec.products.length - 1];
    return { ok: true, product: at && { id: at.id, name: at.name, price: at.price, art: at.art } };
  }
  t_remove_product(a) {
    const key = String(a.id || "").trim().toLowerCase(), list = this.spec.products;
    if (list.length <= 1) return { error: "a store needs at least one product" };
    const keep = list.filter(p => p.id.toLowerCase() !== key && p.name.toLowerCase() !== key);
    if (keep.length === list.length) return { error: "no product with that id or name" };
    this.commit({ products: keep }, "Removed a product"); return { ok: true, left: keep.length };
  }
  t_set_about(a) { this.commit({ about: { ...this.spec.about, ...pick(a, ["title", "text"]) } }, "Updated About"); return { ok: true }; }
  t_set_faqs(a) { if (!Array.isArray(a.faqs)) return { error: "faqs array required" }; this.commit({ faqs: a.faqs }, "Updated FAQs"); return { ok: true, count: this.spec.faqs.length }; }
  t_set_commerce(a) {
    const p = pick(a, ["shipping", "taxPct", "paypalMe"]); let bad;
    if (a.currency != null) { const c = String(a.currency).toUpperCase(); V.currencies.includes(c) ? (p.currency = c) : (bad = "currency"); }
    this.commit(p, "Updated currency and fees"); const s = this.spec;
    return { ok: !bad, currency: s.currency, shipping: s.shipping, taxPct: s.taxPct, ...(bad ? { rejected: [bad], allowed: V.currencies } : {}) };
  }
  t_set_plugins(a) { const p = {}; for (const k of V.plugins) if (typeof a[k] === "boolean") p[k] = a[k]; this.commit({ plugins: { ...this.spec.plugins, ...p } }, "Updated plugins"); return { ok: true, plugins: this.spec.plugins }; }

  t_audit_site() {
    const s = this.spec, is = [], add = (level, msg) => is.push({ level, msg });
    const blob = JSON.stringify({ ...s, st: undefined, products: s.products.map(p => ({ ...p, img: "" })) });
    if (EMOJI.test(blob)) add("error", "Emoji found in copy. Remove it.");
    if (FILLER.test(blob)) add("error", "Placeholder or filler wording found. Write real copy.");
    if (/^my store$/i.test(s.name)) add("error", "Store still has the default name.");
    const th = s.theme;
    if (HEX.test(th.primary) && HEX.test(th.bg) && ratio(th.primary, th.bg) < 3) add("error", `Primary colour is too close to the background (contrast ${ratio(th.primary, th.bg).toFixed(1)}, need 3+).`);
    if (HEX.test(th.accent) && HEX.test(th.bg) && ratio(th.accent, th.bg) < 2) add("warn", "Accent colour is hard to see on the background.");
    if (s.products.length < 3) add("warn", "Fewer than 3 products.");
    if (new Set(s.products.map(p => p.name.toLowerCase())).size < s.products.length) add("warn", "Duplicate product names.");
    if (s.products.some(p => !p.desc)) add("warn", "Some products have no description.");
    if (!s.hero.sub) add("warn", "Hero has no sub text."); if (s.features.length < 3) add("warn", "Fewer than 3 features.");
    if (s.faqs.length < 3) add("warn", "Fewer than 3 FAQs."); if (!s.about.text) add("warn", "About section is empty.");
    if (!s.contactEmail) add("info", "No contact email set.");
    try { const h = renderSite(s, { preview: true, nonce: "" }); if (typeof h !== "string" || h.length < 1500) add("error", "Page rendered too small."); else if (/undefined|\[object Object\]|NaN/.test(h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, ""))) add("error", "Rendered page contains broken values."); }
    catch (e) { add("error", "Page failed to render: " + String(e.message).slice(0, 80)); }
    return { ok: !is.some(i => i.level === "error"), issues: is.slice(0, 12) };
  }
  }
