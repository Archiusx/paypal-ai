// store.js — PayPal Dev · Web Store Builder
// Adds: AI store generation (Groq), safe server-side site rendering, hosted storefronts at /s/:id,
// and a PayPal Orders v2 checkout that runs entirely in this backend (sandbox only, like flow.js).
// It only ADDS routes. Nothing in server.js or flow.js changes behaviour.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pp, ppToken, envConn, connOf, limited, fire, store as flowStore } from "./flow.js";

const E = process.env;
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];
const FONTS = ["sans", "serif", "mono", "rounded"];
const RADII = ["sharp", "soft", "round"];

/* ------------------------------------------------------------------ icons (inline SVG, no emoji) */
const ICONS = {
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5L16 9.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19l8-8"/>',
  spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  gift: '<path d="M4 9h16v4H4zM6 13v7h12v-7M12 9v11M12 9c-3 0-4-4-1.5-4S12 8 12 9zM12 9c3 0 4-4 1.5-4S12 8 12 9z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'
};
const ART = {
  bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  shirt: '<path d="M9 4L3 7l2 4 3-1v10h8V10l3 1 2-4-6-3c-.5 1.2-1.7 2-3 2s-2.5-.8-3-2z"/>',
  watch: '<rect x="7" y="7" width="10" height="10" rx="3"/><path d="M9 7l1-4h4l1 4M9 17l1 4h4l1-4M12 10v2l1.5 1"/>',
  mug: '<path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10h2a2 2 0 0 1 0 5h-2M8 4c0 1 1 1 1 2M12 4c0 1 1 1 1 2"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13M9 7h6"/>',
  plant: '<path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5zM8 21h8"/>',
  shoe: '<path d="M3 16l2-8h4l1 3 6 2c3 .8 5 1 5 3v1H3zM3 19h18"/>',
  candle: '<rect x="7" y="10" width="10" height="10" rx="1.5"/><path d="M12 3c2 2 2 4 0 5-2-1-2-3 0-5zM12 8v2"/>',
  bottle: '<path d="M10 3h4v3l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3zM8 13h8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2 19h20"/>',
  chair: '<path d="M7 3h10v8H7zM5 11h14v3H5zM7 14v7M17 14v7"/>',
  ring: '<circle cx="12" cy="15" r="5"/><path d="M9 6l3-3 3 3-3 3z"/>',
  gift: ICONS.gift,
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"/>'
};
const svg = (inner, cls = "", sw = 1.6) =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/* ------------------------------------------------------------------ sanitising (everything from the client or the AI is untrusted) */
const NOISE = /[\p{Extended_Pictographic}\uFE0F\u200D]/gu;
const txt = (v, max, fb = "") => {
  let s = typeof v === "string" || typeof v === "number" ? String(v) : "";
  s = s.replace(NOISE, "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  return (s || fb).slice(0, max);
};
const color = (v, fb) => {
  const s = String(v || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ("#" + [...s.slice(1)].map(c => c + c).join("")).toLowerCase();
  return fb;
};
const oneOf = (v, list, fb) => (list.includes(v) ? v : fb);
const money2 = (v, min, max, fb) => {
  const n = Math.round(parseFloat(v) * 100) / 100;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
};
const httpsUrl = v => {
  try { const u = new URL(String(v || "")); return u.protocol === "https:" && String(v).length < 500 ? u.href : ""; } catch { return ""; }
};

export function sanitizeSpec(x) {
  x = x && typeof x === "object" ? x : {};
  const t = x.theme || {}, h = x.hero || {}, a = x.about || {};
  const used = new Set();
  const products = (Array.isArray(x.products) ? x.products : []).slice(0, 24).map((p, i) => {
    p = p || {};
    let id = /^[a-z0-9_-]{1,20}$/i.test(p.id || "") ? p.id : "p" + (i + 1);
    while (used.has(id)) id += "x";
    used.add(id);
    return {
      id,
      name: txt(p.name, 60, "Product " + (i + 1)),
      desc: txt(p.desc, 140),
      price: money2(p.price, 0.5, 99999, 19),
      art: oneOf(p.art, Object.keys(ART), "box"),
      image: httpsUrl(p.image),
      badge: txt(p.badge, 16)
    };
  });
  if (!products.length) products.push({ id: "p1", name: "Signature item", desc: "Describe your first product.", price: 29, art: "box", image: "", badge: "" });
  const name = txt(x.name, 40, "My Store");
  return {
    name,
    tagline: txt(x.tagline, 90),
    announcement: txt(x.announcement, 100),
    theme: {
      primary: color(t.primary, "#2b5cff"),
      accent: color(t.accent, "#7c3aed"),
      bg: color(t.bg, "#ffffff"),
      font: oneOf(t.font, FONTS, "sans"),
      radius: oneOf(t.radius, RADII, "soft"),
      hero: oneOf(t.hero, ["split", "center"], "split")
    },
    hero: { title: txt(h.title, 90, name), sub: txt(h.sub, 220), cta: txt(h.cta, 24, "Shop now") },
    features: (Array.isArray(x.features) ? x.features : []).slice(0, 4).map(f => ({
      icon: oneOf(f && f.icon, Object.keys(ICONS), "star"), title: txt(f && f.title, 36, "Feature"), text: txt(f && f.text, 110)
    })),
    products,
    about: { title: txt(a.title, 60), text: txt(a.text, 520) },
    faqs: (Array.isArray(x.faqs) ? x.faqs : []).slice(0, 6).map(f => ({ q: txt(f && f.q, 100), a: txt(f && f.a, 300) })).filter(f => f.q && f.a),
    contactEmail: /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(String(x.contactEmail || "")) ? String(x.contactEmail).slice(0, 120) : "",
    footer: txt(x.footer, 120),
    currency: oneOf(String(x.currency || "").toUpperCase(), CURRENCIES, "USD"),
    shipping: money2(x.shipping, 0, 500, 0),
    taxPct: money2(x.taxPct, 0, 30, 0)
  };
}

/* ------------------------------------------------------------------ colour helpers */
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = a => "#" + a.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v * (1 - t) + B[i] * t)); };
const lum = h => {
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n, cur) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);

/* ------------------------------------------------------------------ site renderer */
const SANS = 'Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
const HEAD = {
  sans: SANS,
  serif: '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif',
  mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  rounded: 'ui-rounded,"SF Pro Rounded","Nunito","Varela Round",system-ui,sans-serif'
};
const RAD = { sharp: ["2px", "4px"], soft: ["10px", "16px"], round: ["999px", "26px"] };

function themeVars(s) {
  const { primary: p, accent: a, bg } = s.theme, dark = lum(bg) < 0.25;
  const fg = dark ? "#f5f7fb" : "#111827";
  return {
    dark, p, a, bg, fg,
    pt: lum(p) > 0.5 ? "#0b1220" : "#ffffff",
    sf: dark ? mix(bg, "#ffffff", 0.06) : mix(bg, "#ffffff", 0.7),
    bd: mix(bg, fg, 0.13),
    mut: mix(fg, bg, 0.42),
    soft: mix(p, bg, 0.9)
  };
}

function tile(p, i, v, cls = "art") {
  const t1 = mix(v.p, v.bg, 0.8 + (i % 3) * 0.03), t2 = mix(v.a, v.bg, 0.74 + (i % 2) * 0.05);
  const inner = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer">`
    : svg(ART[p.art] || ART.box, "ai", 1.2);
  return `<div class="${cls}" style="--t1:${t1};--t2:${t2}">${p.badge ? `<span class="bdg">${esc(p.badge)}</span>` : ""}${inner}</div>`;
}

const CSS = `
*{box-sizing:border-box;margin:0}html{scroll-behavior:smooth;scroll-padding-top:76px}
body{font-family:${SANS};background:var(--bg);color:var(--fg);line-height:1.6;-webkit-font-smoothing:antialiased;min-height:100vh}
h1,h2,h3{font-family:var(--hf);line-height:1.12;letter-spacing:-.02em;font-weight:700}
a{color:inherit;text-decoration:none}button,input{font:inherit;color:inherit}button{cursor:pointer;border:0;background:none}
img,svg{display:block;max-width:100%}.wrap{max-width:1160px;margin:0 auto;padding:0 clamp(16px,4vw,32px)}
.ann{background:var(--p);color:var(--pt);text-align:center;font-size:.82rem;font-weight:600;padding:9px 14px;letter-spacing:.02em}
.nav{position:sticky;top:0;z-index:20;background:var(--bg);background:color-mix(in srgb,var(--bg) 84%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--bd)}
.nav .wrap{display:flex;align-items:center;gap:22px;height:64px}
.brand{display:flex;align-items:center;gap:10px;font-family:var(--hf);font-weight:800;font-size:1.15rem;letter-spacing:-.02em}
.mark{width:32px;height:32px;border-radius:var(--rc2);background:var(--p);color:var(--pt);display:grid;place-items:center;font-size:.95rem}
.links{display:flex;gap:22px;margin-left:auto;font-size:.92rem;font-weight:500;color:var(--mut)}.links a:hover{color:var(--fg)}
.cartb{position:relative;width:42px;height:42px;display:grid;place-items:center;border:1px solid var(--bd);border-radius:var(--r);background:var(--sf)}
.cartb svg{width:20px;height:20px}.cartb:hover{border-color:var(--p)}
.cnt{position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:var(--p);color:var(--pt);font-size:.7rem;font-weight:700;display:none;place-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 24px;border-radius:var(--r);font-weight:600;background:var(--p);color:var(--pt);transition:transform .15s,box-shadow .15s,opacity .15s}
.btn:hover{transform:translateY(-1px);box-shadow:0 12px 26px color-mix(in srgb,var(--p) 34%,transparent)}.btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.btn.ghost{background:transparent;color:var(--fg);border:1px solid var(--bd)}.btn.ghost:hover{border-color:var(--p);box-shadow:none}
.btn svg{width:18px;height:18px}
.hero{position:relative;overflow:hidden;padding:clamp(48px,8vw,104px) 0;background:radial-gradient(900px 440px at 88% -8%,color-mix(in srgb,var(--a) 24%,transparent),transparent 70%),radial-gradient(640px 360px at 4% 8%,color-mix(in srgb,var(--p) 12%,transparent),transparent 70%)}.hero:after{content:"";position:absolute;left:0;right:0;bottom:0;height:140px;background:linear-gradient(transparent,var(--bg));pointer-events:none}.hero .wrap{position:relative;z-index:1}
.hero .wrap{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(24px,5vw,64px);align-items:center}
.hero.center .wrap{grid-template-columns:1fr;text-align:center;justify-items:center}.hero.center .sub{margin-inline:auto}
.eyebrow{display:inline-flex;gap:8px;align-items:center;font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--p);background:var(--soft);padding:6px 12px;border-radius:99px;margin-bottom:18px}
.hero h1{font-size:clamp(2.1rem,5.4vw,3.9rem)}.hero .sub{font-size:clamp(1rem,1.6vw,1.2rem);color:var(--mut);margin:18px 0 28px;max-width:540px}
.stack{position:relative;aspect-ratio:1/1;max-width:460px;width:100%;justify-self:center}
.stack .art{position:absolute;width:56%;aspect-ratio:1/1;box-shadow:0 24px 50px color-mix(in srgb,var(--fg) 16%,transparent)}
.stack .art:nth-child(1){left:2%;top:4%;transform:rotate(-6deg)}.stack .art:nth-child(2){right:0;top:22%;transform:rotate(5deg);z-index:2}.stack .art:nth-child(3){left:18%;bottom:0;transform:rotate(-2deg);z-index:3}
.art{position:relative;border-radius:var(--rc);background:linear-gradient(145deg,var(--t1),var(--t2));display:grid;place-items:center;overflow:hidden;border:1px solid var(--bd)}
.art:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,var(--hl),transparent 55%)}
.art .ai{width:42%;height:auto;color:var(--p);position:relative;opacity:.92}.art img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0}
.bdg{position:absolute;left:12px;top:12px;z-index:2;background:var(--p);color:var(--pt);font-size:.7rem;font-weight:700;padding:4px 10px;border-radius:99px;letter-spacing:.04em}
section{padding:clamp(44px,7vw,88px) 0}.sh{max-width:620px;margin-bottom:34px}.sh h2{font-size:clamp(1.6rem,3.4vw,2.4rem)}.sh p{color:var(--mut);margin-top:10px}
.feat{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:18px}
.f{padding:22px;border:1px solid var(--bd);border-radius:var(--rc);background:var(--sf)}.f .ic{width:44px;height:44px;border-radius:var(--rc2);background:var(--soft);color:var(--p);display:grid;place-items:center;margin-bottom:14px}.f .ic svg{width:22px;height:22px}.f h3{font-size:1.02rem;margin-bottom:6px;letter-spacing:-.01em}.f p{color:var(--mut);font-size:.92rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:22px}
.card{display:flex;flex-direction:column;border:1px solid var(--bd);border-radius:var(--rc);background:var(--sf);overflow:hidden;transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-4px);box-shadow:0 18px 40px color-mix(in srgb,var(--fg) 12%,transparent)}
.card .art{border:0;border-radius:0;aspect-ratio:4/3}.cb{padding:18px;display:flex;flex-direction:column;gap:8px;flex:1}.cb h3{font-size:1.05rem;letter-spacing:-.01em}.cb p{color:var(--mut);font-size:.88rem;flex:1}
.pr{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px}.price{font-size:1.12rem;font-weight:700}
.add{padding:9px 16px;border-radius:var(--r);background:var(--p);color:var(--pt);font-weight:600;font-size:.88rem;transition:transform .15s,opacity .15s}.add:hover{transform:translateY(-1px)}.add.ok{opacity:.7}
.about{display:grid;grid-template-columns:1fr 1fr;gap:clamp(24px,5vw,64px);align-items:center}.about p{color:var(--mut);font-size:1.04rem;margin-top:14px}
.panel{aspect-ratio:5/4;border-radius:var(--rc);background:linear-gradient(145deg,var(--t1),var(--t2));border:1px solid var(--bd);display:grid;place-items:center;color:var(--p)}.panel svg{width:34%;height:auto;opacity:.9}
details{border:1px solid var(--bd);border-radius:var(--rc2);background:var(--sf);margin-bottom:10px;padding:0 18px}summary{cursor:pointer;font-weight:600;padding:16px 0;list-style:none;display:flex;justify-content:space-between;gap:14px}summary::-webkit-details-marker{display:none}
summary:after{content:"+";font-size:1.3rem;line-height:1;color:var(--p)}details[open] summary:after{content:"\\2212"}details p{color:var(--mut);padding:0 0 16px;font-size:.95rem}
footer{border-top:1px solid var(--bd);padding:36px 0 44px;color:var(--mut);font-size:.9rem}footer .wrap{display:flex;gap:18px;flex-wrap:wrap;justify-content:space-between;align-items:center}
.sec{display:inline-flex;align-items:center;gap:8px}.sec svg{width:16px;height:16px;color:var(--p)}
.ov{position:fixed;inset:0;background:#0008;opacity:0;pointer-events:none;transition:opacity .25s;z-index:40}.ov.on{opacity:1;pointer-events:auto}
.dr{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);background:var(--bg);border-left:1px solid var(--bd);z-index:41;display:flex;flex-direction:column;transform:translateX(104%);visibility:hidden;transition:transform .3s cubic-bezier(.2,.8,.2,1),visibility 0s .3s}.dr.on{transform:none;visibility:visible;box-shadow:-20px 0 50px #0003;transition-delay:0s}
.dh{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--bd)}.dh h3{font-size:1.1rem}.x{width:36px;height:36px;border-radius:var(--r);display:grid;place-items:center}.x:hover{background:var(--sf)}.x svg{width:18px;height:18px}
#lines{flex:1;overflow:auto;padding:8px 20px}.ln{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--bd)}.ln-n b{display:block;font-size:.95rem}.ln-n span{color:var(--mut);font-size:.85rem}
.qty{display:flex;align-items:center;gap:4px;border:1px solid var(--bd);border-radius:var(--r);padding:2px}.qty button{width:30px;height:30px;border-radius:var(--r);font-size:1.1rem}.qty button:hover{background:var(--sf)}.qty span{min-width:22px;text-align:center;font-weight:600;font-size:.9rem}
.emp{color:var(--mut);text-align:center;padding:48px 0}
.df{padding:18px 20px;border-top:1px solid var(--bd);background:var(--sf)}.tr{display:flex;justify-content:space-between;font-size:.9rem;color:var(--mut);margin-bottom:6px}.tr.t{color:var(--fg);font-weight:700;font-size:1.05rem;margin:10px 0 14px}
.df .btn{width:100%}.er{color:#dc2626;font-size:.85rem;margin-top:10px;min-height:1.1em}.nt{font-size:.78rem;color:var(--mut);margin-top:12px;text-align:center}
.notice{max-width:520px;margin:12vh auto;padding:36px;border:1px solid var(--bd);border-radius:var(--rc);background:var(--sf);text-align:center}.notice h1{font-size:1.7rem;margin:14px 0 10px}.notice p{color:var(--mut);margin-bottom:22px}
.notice .ok,.notice .no{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;margin:0 auto}.notice .ok{background:#dcfce7;color:#15803d}.notice .no{background:#fee2e2;color:#b91c1c}.notice svg{width:28px;height:28px}
.sum{text-align:left;border-top:1px solid var(--bd);margin:0 0 22px;padding-top:14px;font-size:.9rem}.sum div{display:flex;justify-content:space-between;gap:12px;padding:4px 0;color:var(--mut)}.sum b{color:var(--fg)}
@media(max-width:820px){.hero .wrap,.about{grid-template-columns:1fr}.stack{max-width:340px;margin-top:10px}.links{display:none}.nav .wrap{justify-content:space-between}.cartb{margin-left:auto}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}`;

function pageHead(s, v, nonce, extraTitle = "") {
  const rad = RAD[s.theme.radius];
  const fav = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${v.p}"/><text x="16" y="22" text-anchor="middle" font-family="Arial" font-weight="700" font-size="18" fill="${v.pt}">${esc(s.name.charAt(0).toUpperCase())}</text></svg>`);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(s.name)}${extraTitle ? " · " + esc(extraTitle) : s.tagline ? " · " + esc(s.tagline) : ""}</title><meta name="description" content="${esc(s.hero.sub || s.tagline || s.name)}">
<meta name="color-scheme" content="${v.dark ? "dark" : "light"}"><link rel="icon" href="data:image/svg+xml,${fav}">
<style>:root{--p:${v.p};--pt:${v.pt};--a:${v.a};--bg:${v.bg};--fg:${v.fg};--sf:${v.sf};--bd:${v.bd};--mut:${v.mut};--soft:${v.soft};--hl:${v.dark ? "#ffffff14" : "#ffffff66"};--r:${rad[0]};--rc:${rad[1]};--rc2:${s.theme.radius === "round" ? "14px" : rad[0]};--hf:${HEAD[s.theme.font]}}${CSS}</style></head>`;
}

export function renderSite(s, { id = "preview", preview = false, nonce = "" } = {}) {
  const v = themeVars(s), cur = s.currency;
  const hasAbout = s.about.title || s.about.text, links = [["#shop", "Shop"], hasAbout && ["#about", "About"], s.faqs.length && ["#faq", "FAQ"]].filter(Boolean);
  const stack = s.products.slice(0, 3).map((p, i) => tile(p, i, v)).join("");
  const cfg = JSON.stringify({ id, currency: cur, shipping: s.shipping, taxPct: s.taxPct, preview, products: s.products.map(p => ({ id: p.id, name: p.name, price: p.price })) }).replace(/</g, "\\u003c");
  return pageHead(s, v, nonce) + `<body>
${s.announcement ? `<div class="ann">${esc(s.announcement)}</div>` : ""}
<header class="nav"><div class="wrap"><a class="brand" href="#top"><span class="mark">${esc(s.name.charAt(0).toUpperCase())}</span>${esc(s.name)}</a>
<nav class="links" aria-label="Primary">${links.map(l => `<a href="${l[0]}">${l[1]}</a>`).join("")}</nav>
<button class="cartb" id="cb" aria-label="Open cart">${svg('<path d="M3 4h3l2 12h10l2-8H7"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/>')}<span class="cnt" id="cn">0</span></button></div></header>
<main id="top">
<section class="hero ${s.theme.hero === "center" ? "center" : ""}"><div class="wrap"><div>
${s.tagline ? `<span class="eyebrow">${esc(s.tagline)}</span>` : ""}<h1>${esc(s.hero.title)}</h1>${s.hero.sub ? `<p class="sub">${esc(s.hero.sub)}</p>` : ""}
<a class="btn" href="#shop">${esc(s.hero.cta)}${svg('<path d="M5 12h14M13 6l6 6-6 6"/>')}</a></div>
${s.theme.hero === "center" ? "" : `<div class="stack" aria-hidden="true">${stack}</div>`}</div></section>
${s.features.length ? `<section style="padding-top:0"><div class="wrap feat">${s.features.map(f => `<div class="f"><div class="ic">${svg(ICONS[f.icon])}</div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></div>`).join("")}</div></section>` : ""}
<section id="shop"><div class="wrap"><div class="sh"><h2>Shop the collection</h2><p>${s.products.length} ${s.products.length === 1 ? "product" : "products"}. Secure checkout with PayPal.</p></div>
<div class="grid">${s.products.map((p, i) => `<article class="card">${tile(p, i, v)}<div class="cb"><h3>${esc(p.name)}</h3>${p.desc ? `<p>${esc(p.desc)}</p>` : ""}<div class="pr"><span class="price">${money(p.price, cur)}</span><button class="add" data-add="${esc(p.id)}">Add to cart</button></div></div></article>`).join("")}</div></div></section>
${hasAbout ? `<section id="about" style="background:var(--sf);border-block:1px solid var(--bd)"><div class="wrap about"><div><h2>${esc(s.about.title || "Our story")}</h2><p>${esc(s.about.text)}</p></div><div class="panel" style="--t1:${mix(v.p, v.bg, 0.82)};--t2:${mix(v.a, v.bg, 0.76)}" aria-hidden="true">${svg(ICONS.heart, "", 1.1)}</div></div></section>` : ""}
${s.faqs.length ? `<section id="faq"><div class="wrap" style="max-width:780px"><div class="sh"><h2>Questions, answered</h2></div>${s.faqs.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div></section>` : ""}
</main>
<footer><div class="wrap"><span>${esc(s.footer || "© " + new Date().getFullYear() + " " + s.name)}${s.contactEmail ? ` · <a href="mailto:${esc(s.contactEmail)}">${esc(s.contactEmail)}</a>` : ""}</span><span class="sec">${svg(ICONS.lock)}Payments processed securely by PayPal</span></div></footer>
<div class="ov" id="ov"></div>
<aside class="dr" id="dr" aria-label="Shopping cart" aria-hidden="true"><div class="dh"><h3>Your cart</h3><button class="x" id="dx" aria-label="Close cart">${svg('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div><div id="lines"></div>
<div class="df"><div class="tr"><span>Subtotal</span><span id="ts">-</span></div><div class="tr"><span>Shipping</span><span id="th">-</span></div><div class="tr"><span>Tax</span><span id="tt">-</span></div><div class="tr t"><span>Total</span><span id="tg">-</span></div>
<button class="btn" id="co" disabled>${svg(ICONS.lock)}Checkout with PayPal</button><div class="er" id="er" role="alert"></div><div class="nt">${preview ? "Preview mode: checkout is disabled until you publish." : "You will be redirected to PayPal to complete your payment."}</div></div></aside>
<script type="application/json" id="cfg">${cfg}</script>
<script nonce="${nonce}">${CLIENT_JS}</script></body></html>`;
}

const CLIENT_JS = `(function(){
var C=JSON.parse(document.getElementById("cfg").textContent),P={},K="sb:"+C.id,cart={};
C.products.forEach(function(p){P[p.id]=p});
try{cart=JSON.parse(localStorage.getItem(K)||"{}")||{}}catch(e){cart={}}
var $=function(s){return document.querySelector(s)},F=new Intl.NumberFormat(undefined,{style:"currency",currency:C.currency});
function save(){try{localStorage.setItem(K,JSON.stringify(cart))}catch(e){}}
function tot(){var n=0,sub=0;Object.keys(cart).forEach(function(id){if(!P[id]||!(cart[id]>0)){delete cart[id];return}n+=cart[id];sub+=Math.round(P[id].price*100)*cart[id]});
var sh=n?Math.round(C.shipping*100):0,tx=Math.round(sub*C.taxPct/100);return{n:n,sub:sub,sh:sh,tx:tx,t:sub+sh+tx}}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function draw(){var t=tot(),L=$("#lines");L.textContent="";
Object.keys(cart).forEach(function(id){var p=P[id],r=el("div","ln"),n=el("div","ln-n"),q=el("div","qty");
n.append(el("b",0,p.name),el("span",0,F.format(p.price)));
var m=el("button",0,"\\u2212"),a=el("button",0,"+");m.setAttribute("aria-label","Decrease quantity");a.setAttribute("aria-label","Increase quantity");
m.onclick=function(){chg(id,-1)};a.onclick=function(){chg(id,1)};q.append(m,el("span",0,cart[id]),a);r.append(n,q);L.append(r)});
if(!t.n)L.append(el("div","emp","Your cart is empty."));
var c=$("#cn");c.textContent=t.n;c.style.display=t.n?"grid":"none";
$("#ts").textContent=F.format(t.sub/100);$("#th").textContent=F.format(t.sh/100);$("#tt").textContent=F.format(t.tx/100);$("#tg").textContent=F.format(t.t/100);
$("#co").disabled=!t.n;save()}
function chg(id,d){cart[id]=Math.min(20,Math.max(0,(cart[id]||0)+d));if(!cart[id])delete cart[id];draw()}
function open(o){$("#dr").classList.toggle("on",o);$("#ov").classList.toggle("on",o);$("#dr").setAttribute("aria-hidden",o?"false":"true");$("#er").textContent=""}
$("#cb").onclick=function(){open(true)};$("#dx").onclick=$("#ov").onclick=function(){open(false)};
document.addEventListener("keydown",function(e){if(e.key==="Escape")open(false)});
document.querySelectorAll("[data-add]").forEach(function(b){b.onclick=function(){chg(b.dataset.add,1);b.textContent="Added";b.classList.add("ok");setTimeout(function(){b.textContent="Add to cart";b.classList.remove("ok")},900);open(true)}});
$("#co").onclick=function(){var b=this,er=$("#er");er.textContent="";
if(C.preview){er.textContent="Checkout is disabled in preview. Publish the store to accept payments.";return}
if(!tot().n)return;var lbl=b.textContent;b.disabled=true;b.textContent="Connecting to PayPal";
fetch("/api/store/"+encodeURIComponent(C.id)+"/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:Object.keys(cart).map(function(id){return{id:id,qty:cart[id]}})})})
.then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
.then(function(x){if(!x.ok||!x.j.approveUrl)throw new Error(x.j.error||"Checkout failed. Please try again.");location.href=x.j.approveUrl})
.catch(function(e){er.textContent=e.message;b.disabled=false;b.textContent=lbl})};
draw()})();`;

function renderNotice(s, { ok, title, msg, id, rows = [], nonce = "", clear = false }) {
  const v = themeVars(s);
  return pageHead(s, v, nonce, title) + `<body><div class="notice"><div class="${ok ? "ok" : "no"}">${svg(ok ? '<path d="M5 12l5 5 9-10"/>' : '<path d="M6 6l12 12M18 6L6 18"/>', "", 2)}</div>
<h1>${esc(title)}</h1><p>${esc(msg)}</p>${rows.length ? `<div class="sum">${rows.map(r => `<div><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join("")}</div>` : ""}
<a class="btn" href="${id ? "/s/" + esc(id) : "/"}">${ok ? "Continue shopping" : "Back to store"}</a></div>
${clear ? `<script nonce="${nonce}">try{localStorage.removeItem("sb:${esc(id)}")}catch(e){}</script>` : ""}</body></html>`;
}

/* ------------------------------------------------------------------ persistence (stores on disk; PayPal secrets only if STORE_SECRET is set, encrypted) */
const FILE = E.STORE_DATA_FILE || path.join(process.cwd(), "data", "stores.json");
const KEY = E.STORE_SECRET ? crypto.createHash("sha256").update(E.STORE_SECRET).digest() : null;
const stores = new Map();   // id -> { id, keyHash, spec, gw:{mode, enc?}, orders:[], live, createdAt, updatedAt }
const gwCache = new Map();  // id -> connection object understood by flow.js pp()
const seal = o => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", KEY, iv), ct = Buffer.concat([c.update(JSON.stringify(o), "utf8"), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64"); };
const unseal = b => { const d = Buffer.from(b, "base64"), c = crypto.createDecipheriv("aes-256-gcm", KEY, d.subarray(0, 12)); c.setAuthTag(d.subarray(12, 28)); return JSON.parse(Buffer.concat([c.update(d.subarray(28)), c.final()]).toString("utf8")); };
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

try {
  if (fs.existsSync(FILE)) {
    for (const s of JSON.parse(fs.readFileSync(FILE, "utf8")).stores || []) {
      stores.set(s.id, s);
      if (s.gw?.enc && KEY) try { const c = unseal(s.gw.enc); gwCache.set(s.id, { id: c.id, secret: c.secret, t: "", exp: 0 }); } catch { console.warn("store", s.id, "gateway key could not be decrypted"); }
    }
    console.log("store builder: loaded", stores.size, "store(s)");
  }
} catch (e) { console.warn("store builder: could not read", FILE, e.message); }

let timer = null;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const out = [...stores.values()].map(s => ({ ...s, gw: { mode: s.gw.mode, ...(s.gw.enc ? { enc: s.gw.enc } : {}) } }));
      fs.writeFileSync(FILE + ".tmp", JSON.stringify({ v: 1, stores: out }));
      fs.renameSync(FILE + ".tmp", FILE);
    } catch (e) { console.warn("store builder: persist failed", e.message); }
  }, 400);
}

const gwOf = s => (s.gw.mode === "env" ? (envConn.id && envConn.secret ? envConn : null) : gwCache.get(s.id) || null);
const baseUrl = req => E.PUBLIC_API_URL || ((req.headers["x-forwarded-proto"] || req.protocol) + "://" + req.get("host"));
const nonceOf = () => crypto.randomBytes(16).toString("base64");
const csp = n => `default-src 'none'; script-src 'nonce-${n}'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
const sendHtml = (res, html, n, code = 200) => res.status(code).set({ "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp(n), "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Cache-Control": "no-store" }).send(html);
const fail = (res, m, c = 400) => res.status(c).json({ error: m });

/* ------------------------------------------------------------------ Groq */
const SCHEMA_HELP = `{
 "name": "brand name (max 40 chars)", "tagline": "short positioning line (max 90)", "announcement": "optional promo bar text or empty string",
 "theme": {"primary":"#rrggbb","accent":"#rrggbb","bg":"#rrggbb page background (light or dark)","font":"${FONTS.join("|")}","radius":"${RADII.join("|")}","hero":"split|center"},
 "hero": {"title":"headline","sub":"one or two sentences","cta":"button label"},
 "features": [{"icon":"${Object.keys(ICONS).join("|")}","title":"","text":""}],
 "products": [{"id":"p1","name":"","desc":"max 120 chars","price":29.0,"art":"${Object.keys(ART).join("|")}","badge":"optional, max 16 chars"}],
 "about": {"title":"","text":""}, "faqs": [{"q":"","a":""}], "contactEmail": "", "footer": "",
 "currency": "${CURRENCIES.join("|")}", "shipping": 0, "taxPct": 0 }`;
const GEN_SYS = `You are a senior e-commerce brand designer and conversion copywriter. Reply with ONE JSON object and nothing else (no markdown, no commentary).
Schema:\n${SCHEMA_HELP}
Rules: write specific, believable copy for the requested business; 3 or 4 features; 6 to 8 products with realistic prices in the chosen currency and a fitting "art" value; 3 or 4 FAQs about shipping, returns and payment; choose a cohesive palette with strong contrast between text and background (dark backgrounds are allowed); plain text only, no HTML, no emoji, no placeholder words like "Lorem".`;

async function groq(key, system, user) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: E.GROQ_MODEL || "llama-3.3-70b-versatile", temperature: 0.7, max_tokens: 4000, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(50000)
  });
  if (r.status === 401 || r.status === 403) { const e = new Error("Groq rejected this API key. Check it in console.groq.com."); e.code = 401; throw e; }
  if (r.status === 429) { const e = new Error("Groq rate limit reached. Wait a few seconds and try again."); e.code = 429; throw e; }
  if (!r.ok) { const e = new Error("Groq error " + r.status); e.code = 502; throw e; }
  const raw = (await r.json()).choices?.[0]?.message?.content || "";
  try { return JSON.parse(raw.replace(/^```json|```$/g, "").trim()); }
  catch { const e = new Error("The AI returned an unreadable answer. Try again."); e.code = 502; throw e; }
}
const groqKey = req => {
  const k = String(req.headers["x-groq-key"] || "").trim();
  if (k) return /^[\w-]{20,200}$/.test(k) ? k : null;
  return E.GROQ_API_KEY || null;
};

/* ------------------------------------------------------------------ routes */
export function mountStore(app) {
  app.get("/api/store/capabilities", (_, res) => res.json({ groqOnServer: !!E.GROQ_API_KEY, paypalOnServer: !!(E.PAYPAL_CLIENT_ID && E.PAYPAL_CLIENT_SECRET), persistentGateway: !!KEY, currencies: CURRENCIES, fonts: FONTS, radii: RADII, icons: Object.keys(ICONS), art: Object.keys(ART), stores: stores.size }));

  // ---- AI
  const aiGuard = (req, res) => {
    if (limited(req, "sai", 12)) { fail(res, "Too many AI requests. Wait a minute.", 429); return null; }
    const k = groqKey(req);
    if (!k) { fail(res, req.headers["x-groq-key"] ? "That does not look like a Groq API key." : "Add your Groq API key to use the AI builder.", 400); return null; }
    return k;
  };
  app.post("/api/store/ai/generate", async (req, res) => {
    const k = aiGuard(req, res); if (!k) return;
    const prompt = txt(req.body?.prompt, 800);
    if (prompt.length < 8) return fail(res, "Describe your store in a sentence or two.");
    const cur = oneOf(String(req.body?.currency || "").toUpperCase(), CURRENCIES, "USD");
    const tone = txt(req.body?.style, 40);
    try {
      const j = await groq(k, GEN_SYS, `Business: ${prompt}\nCurrency: ${cur}\n${tone ? "Visual style: " + tone + "\n" : ""}Return the JSON now.`);
      const spec = sanitizeSpec({ ...j, currency: cur });
      res.json({ spec });
    } catch (e) { fail(res, e.message, e.code || 502); }
  });
  app.post("/api/store/ai/edit", async (req, res) => {
    const k = aiGuard(req, res); if (!k) return;
    const ins = txt(req.body?.instruction, 500);
    if (ins.length < 3) return fail(res, "Tell the AI what to change.");
    const cur = sanitizeSpec(req.body?.spec);
    try {
      const j = await groq(k, `You edit an online store definition. Reply with ONE JSON object and nothing else: the COMPLETE updated store using exactly this schema:\n${SCHEMA_HELP}\nKeep every field and every product id the instruction does not mention. Plain text only, no HTML, no emoji. Keep colours readable.`, `Current store:\n${JSON.stringify(cur)}\n\nInstruction: ${ins}`);
      res.json({ spec: sanitizeSpec(j) });
    } catch (e) { fail(res, e.message, e.code || 502); }
  });

  // ---- preview (HTML for the builder's iframe; checkout disabled)
  app.post("/api/store/preview", (req, res) => {
    if (limited(req, "spv", 240)) return fail(res, "Too many preview requests.", 429);
    const spec = sanitizeSpec(req.body?.spec);
    res.json({ html: renderSite(spec, { preview: true, nonce: "" }), spec });
  });

  // ---- publish / update (needs a verified PayPal sandbox connection)
  const owner = (req, res) => {
    const s = stores.get(req.params.id);
    if (!s) { fail(res, "Store not found.", 404); return null; }
    const k = String(req.headers["x-manage-key"] || "");
    if (!k || !same(sha(k), s.keyHash)) { fail(res, "Not allowed.", 403); return null; }
    return s;
  };
  app.post("/api/store/publish", async (req, res) => {
    if (limited(req, "spub", 20)) return fail(res, "Too many publish attempts. Wait a minute.", 429);
    const spec = sanitizeSpec(req.body?.spec);
    const c = connOf(req, res); if (!c) return;
    // A store can always be published and gets a live link. Without a PayPal connection its checkout simply stays offline until one is added.
    const hasConn = !!(c.id && c.secret);
    if (hasConn) {
      try { c.t = ""; await ppToken(c); }
      catch { return fail(res, "PayPal rejected the saved credentials. Connect again.", 401); }
    }
    const usingOwn = hasConn && !!req.headers["x-conn"];
    let s = null, manageKey = null;
    if (req.body?.id) {
      s = stores.get(String(req.body.id));
      if (!s || !same(sha(String(req.body.manageKey || "")), s.keyHash)) return fail(res, "You cannot update this store.", 403);
    } else {
      if (stores.size >= 2000) return fail(res, "Store limit reached on this server.", 507);
      manageKey = "mk_" + crypto.randomBytes(24).toString("hex");
      s = { id: crypto.randomBytes(5).toString("hex"), keyHash: sha(manageKey), orders: [], createdAt: Date.now(), gw: { mode: "none" } };
      stores.set(s.id, s);
    }
    s.spec = spec; s.live = true; s.updatedAt = Date.now();
    // optional: link a Workflow Builder automation, only when it was published with the very same PayPal connection
    const fid = String(req.body?.flowId || ""), fw = fid && flowStore.workflows.get(fid);
    s.flowId = usingOwn && fw && fw.conn === req.headers["x-conn"] ? fid : "";
    if (hasConn) s.gw = usingOwn ? { mode: "own", ...(KEY ? { enc: seal({ id: c.id, secret: c.secret }) } : {}) } : { mode: "env" };
    if (usingOwn) gwCache.set(s.id, { id: c.id, secret: c.secret, t: "", exp: 0 });
    persist();
    res.json({ id: s.id, url: baseUrl(req) + "/s/" + s.id, manageKey, gateway: { mode: s.gw.mode, persistent: s.gw.mode === "env" || !!KEY }, payments: gwOf(s) ? "ready" : "offline" });
  });

  app.get("/api/store/:id/status", (req, res) => {
    const s = owner(req, res); if (!s) return;
    const paid = s.orders.filter(o => o.status === "COMPLETED"), cur = s.spec.currency;
    res.json({ live: s.live, url: baseUrl(req) + "/s/" + s.id, gateway: gwOf(s) ? "ready" : "offline", mode: s.gw.mode, persistent: s.gw.mode === "env" || !!KEY, orders: paid.length, revenue: { currency: cur, total: +paid.reduce((a, o) => a + (o.currency === cur ? o.total : 0), 0).toFixed(2) }, updatedAt: s.updatedAt });
  });
  app.post("/api/store/:id/gateway/test", async (req, res) => {
    const s = owner(req, res); if (!s) return;
    const c = gwOf(s); if (!c) return fail(res, "Gateway is offline. Connect PayPal and publish again to bring it back.", 409);
    try { c.t = ""; await ppToken(c); res.json({ ok: true }); } catch { fail(res, "PayPal login failed with the saved credentials.", 502); }
  });
  app.get("/api/store/:id/orders", (req, res) => { const s = owner(req, res); if (s) res.json(s.orders.slice(0, 200)); });
  app.delete("/api/store/:id", (req, res) => { const s = owner(req, res); if (!s) return; stores.delete(s.id); gwCache.delete(s.id); persist(); res.json({ ok: true }); });

  // ---- public storefront
  app.get("/s/:id", (req, res) => {
    const s = stores.get(req.params.id), n = nonceOf();
    if (!s || !s.live) return sendHtml(res, renderNotice(sanitizeSpec({ name: "Store" }), { ok: false, title: "Store not found", msg: "This store does not exist or was unpublished.", id: "" }), n, 404);
    sendHtml(res, renderSite(s.spec, { id: s.id, nonce: n }), n);
  });

  // ---- checkout: totals are recomputed here from the stored catalogue; client prices are never trusted
  app.post("/api/store/:id/checkout", async (req, res) => {
    const s = stores.get(req.params.id);
    if (!s || !s.live) return fail(res, "Store not found.", 404);
    if (limited(req, "sco", 20)) return fail(res, "Too many attempts. Please wait a minute.", 429);
    const c = gwOf(s);
    if (!c) return fail(res, "Payments are temporarily unavailable for this store.", 503);
    const want = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : [];
    const cur = s.spec.currency, lines = [];
    for (const it of want) {
      const p = s.spec.products.find(x => x.id === it?.id), q = Math.floor(+it?.qty);
      if (p && q >= 1 && q <= 20) { const l = lines.find(x => x.p.id === p.id); l ? (l.q = Math.min(20, l.q + q)) : lines.push({ p, q }); }
    }
    if (!lines.length) return fail(res, "Your cart is empty.");
    const cents = n => Math.round(n * 100), fmt = n => (n / 100).toFixed(2);
    const sub = lines.reduce((a, l) => a + cents(l.p.price) * l.q, 0), ship = cents(s.spec.shipping), tax = Math.round(sub * s.spec.taxPct / 100), total = sub + ship + tax;
    const base = baseUrl(req);
    try {
      const j = await pp("POST", "/v2/checkout/orders", {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: s.id, custom_id: s.id, description: s.spec.name.slice(0, 120),
          amount: { currency_code: cur, value: fmt(total), breakdown: { item_total: { currency_code: cur, value: fmt(sub) }, shipping: { currency_code: cur, value: fmt(ship) }, tax_total: { currency_code: cur, value: fmt(tax) } } },
          items: lines.map(l => ({ name: l.p.name.slice(0, 127), quantity: String(l.q), unit_amount: { currency_code: cur, value: fmt(cents(l.p.price)) }, category: "PHYSICAL_GOODS" }))
        }],
        payment_source: { paypal: { experience_context: { brand_name: s.spec.name.slice(0, 120), user_action: "PAY_NOW", shipping_preference: "GET_FROM_FILE", return_url: `${base}/api/store/${s.id}/return`, cancel_url: `${base}/api/store/${s.id}/return?cancel=1` } } }
      }, { "PayPal-Request-Id": "so-" + crypto.randomBytes(10).toString("hex") }, c);
      const link = j.links?.find(l => l.rel === "payer-action" || l.rel === "approve")?.href;
      if (!link) throw new Error("PayPal did not return an approval link.");
      res.json({ orderId: j.id, approveUrl: link });
    } catch (e) { console.warn("store checkout", s.id, e.message); fail(res, "We could not start the PayPal checkout. Please try again shortly.", 502); }
  });

  // ---- buyer returns from PayPal: verify the order belongs to this store, capture once, record
  app.get("/api/store/:id/return", async (req, res) => {
    const s = stores.get(req.params.id), n = nonceOf();
    if (!s) return sendHtml(res, renderNotice(sanitizeSpec({ name: "Store" }), { ok: false, title: "Store not found", msg: "This store no longer exists.", id: "" }), n, 404);
    const page = (ok, title, msg, rows, clear) => sendHtml(res, renderNotice(s.spec, { ok, title, msg, id: s.id, rows, nonce: n, clear }), n);
    if (req.query.cancel) return page(false, "Checkout cancelled", "No payment was taken. Your cart is still saved.");
    const c = gwOf(s), oid = String(req.query.token || "");
    if (!c || !/^[A-Z0-9]{10,30}$/i.test(oid)) return page(false, "Something went wrong", "We could not verify this payment. If you were charged, contact the store.");
    const prior = s.orders.find(o => o.id === oid);
    if (prior) return page(true, "Payment received", "Thank you. Your order is confirmed.", [["Order", oid], ["Total", money(prior.total, prior.currency)]], true);
    try {
      const o = await pp("GET", "/v2/checkout/orders/" + oid, null, {}, c);
      if (o.purchase_units?.[0]?.reference_id !== s.id) return page(false, "Order mismatch", "This payment does not belong to this store.");
      const j = o.status === "COMPLETED" ? o : await pp("POST", `/v2/checkout/orders/${oid}/capture`, null, { "PayPal-Request-Id": "cap-" + oid }, c);
      const u = j.purchase_units?.[0] || {}, cp = u.payments?.captures?.[0];
      if (cp?.status !== "COMPLETED") return page(false, "Payment pending", "PayPal has not completed this payment yet. You will not be charged twice.");
      const addr = u.shipping?.address || {};
      const rec = {
        id: oid, captureId: cp.id, status: "COMPLETED", total: +cp.amount.value, currency: cp.amount.currency_code, at: Date.now(),
        payer: { email: j.payer?.email_address || "", name: [j.payer?.name?.given_name, j.payer?.name?.surname].filter(Boolean).join(" ") },
        ship: { name: u.shipping?.name?.full_name || "", line1: addr.address_line_1 || "", line2: addr.address_line_2 || "", city: addr.admin_area_2 || "", state: addr.admin_area_1 || "", zip: addr.postal_code || "", country: addr.country_code || "" },
        items: (o.purchase_units?.[0]?.items || []).map(i => ({ name: i.name, qty: +i.quantity, price: +i.unit_amount?.value }))
      };
      if (!s.orders.some(x => x.id === oid)) { s.orders.unshift(rec); s.orders.length = Math.min(s.orders.length, 500); persist(); }
      // run the linked Workflow Builder automation (if any); fire() de-duplicates by capture id
      if (s.flowId && flowStore.workflows.has(s.flowId)) fire({ event_type: "PAYMENT.CAPTURE.COMPLETED", id: cp.id, amount: rec.total, currency: rec.currency, country: rec.ship.country, item: rec.items.map(i => i.name).join(", "), buyer: rec.payer, order: { id: oid }, capture: { id: cp.id } }, s.flowId).catch(() => {});
      page(true, "Payment received", "Thank you. A confirmation was sent to your PayPal email.", [["Order", oid], ["Total", money(rec.total, rec.currency)]], true);
    } catch (e) { console.warn("store return", s.id, e.message); page(false, "Payment not completed", "PayPal could not complete this payment. You have not been charged. Please try again."); }
  });
}
