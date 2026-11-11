// siteagent/vocab.js - the design vocabulary the Site Agent may use.
// Every candidate is verified against store.js's OWN sanitizer when this file loads, so the agent can never
// offer a value the store renderer would reject, even if store.js changes later. Read-only: touches nothing.
import { sanitizeSpec as S } from "../store.js";

const keep = (list, test) => list.filter(v => { try { return !!test(v); } catch { return false; } });

export const V = {
  currencies: keep(["USD", "EUR", "GBP", "CAD", "AUD"], c => S({ currency: c }).currency === c),
  fonts: keep(["poppins", "sans", "serif", "mono", "rounded"], f => S({ theme: { font: f } }).theme.font === f),
  radii: keep(["sharp", "soft", "round"], r => S({ theme: { radius: r } }).theme.radius === r),
  heroLayouts: keep(["split", "center"], h => S({ theme: { hero: h } }).theme.hero === h),
  looks: keep(["classic", "sang"], l => S({ look: l }).look === l),
  icons: keep(["truck", "shield", "refresh", "star", "leaf", "spark", "clock", "heart", "gift", "lock", "chat", "globe"],
    n => S({ features: [{ icon: n }] }).features[0].icon === n),
  art: keep(["bag", "shirt", "watch", "mug", "headphones", "book", "plant", "shoe", "candle", "bottle", "camera", "laptop", "chair", "ring", "gift", "box"],
    n => S({ products: [{ art: n }] }).products[0].art === n),
  plugins: ["sidebar", "wishlist", "appnav", "buttons", "paylater", "cardbtn", "qr"]
};

export const SITE_HELP = `site object (all keys optional, omitted sections stay as they are):
{"name":"max 40","tagline":"max 90","announcement":"max 100 or empty","shopTitle":"","faqTitle":"","footer":"",
"theme":{"primary":"#rrggbb","accent":"#rrggbb","bg":"#rrggbb","font":"${V.fonts.join("|")}","radius":"${V.radii.join("|")}","hero":"${V.heroLayouts.join("|")}"},
"hero":{"title":"","sub":"","cta":""},"features":[{"icon":"${V.icons.join("|")}","title":"","text":""}] (max 4),
"products":[{"id":"p1","name":"","desc":"max 120","price":29.5,"art":"${V.art.join("|")}","badge":"max 16"}] (max 24),
"about":{"title":"","text":""},"faqs":[{"q":"","a":""}] (max 6),"contactEmail":"","currency":"${V.currencies.join("|")}","shipping":0,"taxPct":0}`;
