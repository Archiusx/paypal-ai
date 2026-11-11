/* ai-agent.js - PayPal Dev Site Agent (frontend). Phase 2.
   Connects the existing "Build with AI" chat to POST /api/sa/chat and shows every step the agent takes, live:
   its one-line plan, each tool call with inputs, what each call changed, and the final answer.
   Additive and isolated: every class is prefixed .sa-, nothing existing is replaced, and if this file fails to load
   the chat simply stays the way it was. The agent edits a copy of the draft; the result is applied to the builder
   with one-click Undo. It cannot publish or move money. */
(function () {
  "use strict";
  if (window.__saAgent) return; window.__saAgent = 1;

  var IC = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9l1.6-5h12.8L20 9M4 9h16M4 9v11h16V9M9.5 20v-5.5h5V20"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3L3 10.2l7 2.8 2.8 7z"/><path d="M10 13L21 3"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>',
    retry: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    hist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/></svg>',
    /* icons for the build progress tree and the photo picker (additive) */
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    plug: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22v-5M9 8V2M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M9 12l2 2 4-4"/></svg>',
    db: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    pack: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 4.27l9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>',
    img: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/></svg>'
  };
  var CSS = [
    '.cx-w{--pp:#003087;--pp2:#009cde;--ib:#0070e0;--if:#fff}',
    '.cx-w[data-th=light]{--bg:#fff;--sf:#f5f8fd;--sf2:#e8effa;--bd:#dbe4f2;--fg:#001435;--mut:#56667f;--ib:#0070e0;--if:#fff}',
    '.cx-w[data-th=dark]{--bg:#020a1c;--sf:#071530;--sf2:#0e2048;--bd:#1b2e5c;--fg:#f4f7fd;--mut:#8fa2c8;--ib:#2c8bff;--if:#fff}',
    '.cx-w .cx-lg,.cx-w .cx-av{background:linear-gradient(135deg,#003087,#0070e0)!important;color:#fff!important;border-color:transparent!important}',
    '.cx-w .cx-lg svg,.cx-w .cx-av svg{color:#fff;stroke:#fff}',
    '.cx-w .cx-sn{background:linear-gradient(135deg,#003087,#0070e0)!important;color:#fff!important;border-color:transparent!important}',
    '.cx-w .cx-sn svg{stroke:#fff}',
    '.cx-w .sa-dock{border:1px solid var(--bd);border-radius:16px;background:var(--sf);overflow:hidden}',
    '.cx-w .sa-dk-h{display:flex;align-items:center;gap:11px;padding:12px 14px;border-bottom:1px solid var(--bd)}',
    '.cx-w .sa-dk-h>span{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--sf2);color:#0070e0;flex:none}',
    '.cx-w .sa-dk-h svg{width:17px;height:17px}',
    '.cx-w .sa-dk-h b{display:block;font-size:.88em;font-weight:700}.cx-w .sa-dk-h small{display:block;color:var(--mut);font-size:.75em;margin-top:1px;line-height:1.4}',
    '.cx-w .sa-dk-b{display:flex;flex-direction:column;gap:8px;padding:12px 14px}',
    '.cx-w .sa-dkb{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:1px solid var(--bd)!important;border-radius:12px;padding:10px 12px;cursor:pointer;background:var(--bg);transition:border-color .15s,background .15s,opacity .15s}',
    '.cx-w .sa-dkb:hover:not(:disabled){border-color:#0070e0!important;background:var(--sf2)}',
    '.cx-w .sa-dkb .ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--sf2);color:#0070e0;flex:none}',
    '.cx-w .sa-dkb .ic svg{width:17px;height:17px}',
    '.cx-w .sa-dkb .tx{min-width:0;flex:1}.cx-w .sa-dkb b{display:block;font-size:.86em;font-weight:600}.cx-w .sa-dkb small{display:block;color:var(--mut);font-size:.74em;margin-top:1px;line-height:1.4}',
    '.cx-w .sa-dkb.pri{background:linear-gradient(135deg,#003087,#0070e0);border-color:transparent!important;color:#fff}',
    '.cx-w .sa-dkb.pri:hover:not(:disabled){background:linear-gradient(135deg,#00226b,#005fc4)}',
    '.cx-w .sa-dkb.pri .ic{background:#ffffff26;color:#fff}.cx-w .sa-dkb.pri small{color:#ffffffcc}',
    '.cx-w .sa-dkb:disabled{cursor:default}.cx-w .sa-dkb.busy{opacity:.7;cursor:progress}',
    '.cx-w .sa-dkb.done{background:var(--bg);color:var(--fg);border-color:#0f9d58!important}.cx-w .sa-dkb.done .ic{background:#0f9d5822;color:#0f9d58}.cx-w .sa-dkb.done small{color:var(--mut)}',
    '.cx-w .sa-dst{padding:0 14px 12px;color:var(--mut);font-size:.78em;line-height:1.55;word-break:break-word}.cx-w .sa-dst:empty{display:none}',
    '.cx-w .sa-dst a{color:#0070e0;font-weight:600;text-decoration:underline}',
    '.cx-w .sa-card .sw u{border-color:var(--sf)}',
    '.cx-w .sa-retry{display:inline-flex;align-items:center;gap:6px;align-self:flex-start}.cx-w .sa-retry svg{width:13px;height:13px}',
    '.cx-w .sa-u{flex-direction:row-reverse}',
    '.cx-w .sa-u .cx-bb{background:linear-gradient(135deg,#003087,#0070e0);color:#fff;border-color:transparent;border-radius:16px 4px 16px 16px;white-space:pre-wrap;word-break:break-word}',
    '.cx-w .sa-col{min-width:0;flex:1;display:flex;flex-direction:column;gap:10px}',
    '.cx-w .sa-col>.cx-bb{max-width:100%;white-space:pre-wrap;word-break:break-word}',
    '.cx-w .sa-err{border-color:#d9534f}',
    '.cx-w .sa-run{border:1px solid var(--bd);border-radius:14px;background:var(--bg);overflow:hidden}',
    '.cx-w .sa-rh{display:flex;align-items:center;gap:10px;width:100%;padding:11px 14px;text-align:left;font-size:.88em;cursor:pointer}',
    '.cx-w .sa-rh b{font-weight:600}.cx-w .sa-rh small{color:var(--mut);margin-left:auto;white-space:nowrap}',
    '.cx-w .sa-rh .cv{width:15px;height:15px;color:var(--mut);transition:transform .2s;flex:none}',
    '.cx-w .sa-run.open .sa-rh .cv{transform:rotate(180deg)}',
    '.cx-w .sa-stop{border:1px solid var(--bd)!important;border-radius:99px;padding:3px 10px;font-size:.78em;font-weight:600;cursor:pointer}',
    '.cx-w .sa-st{list-style:none;margin:0;padding:6px 14px 12px;display:none;flex-direction:column;border-top:1px solid var(--bd)}',
    '.cx-w .sa-run.open .sa-st{display:flex}',
    '.cx-w .sa-st>li{display:flex;gap:11px;padding:8px 0;position:relative;min-width:0}',
    '.cx-w .sa-st>li:not(:last-child)::before{content:"";position:absolute;left:8px;top:30px;bottom:-6px;width:1px;background:var(--bd)}',
    '.cx-w .sa-ic{width:17px;height:17px;border-radius:50%;flex:none;display:grid;place-items:center;border:1px solid var(--bd);margin-top:2px;background:var(--bg)}',
    '.cx-w .sa-ic svg{width:10px;height:10px;stroke-width:2.6}',
    '.cx-w li.ok>.sa-ic{background:var(--ib);border-color:var(--ib);color:var(--if)}.cx-w li.ok>.sa-ic svg{color:var(--if)}',
    '.cx-w li.bad>.sa-ic{background:#d9534f;border-color:#d9534f}.cx-w li.bad>.sa-ic svg{color:#fff}',
    '.cx-w .sa-spin{width:9px;height:9px;border-radius:50%;border:2px solid var(--bd);border-top-color:var(--fg);animation:saSp .7s linear infinite}',
    '@keyframes saSp{to{transform:rotate(360deg)}}',
    '.cx-w .sa-hs{width:14px;height:14px;border-radius:50%;border:2px solid var(--bd);border-top-color:var(--fg);animation:saSp .7s linear infinite;flex:none}',
    '.cx-w .sa-hok{width:16px;height:16px;flex:none;color:var(--fg)}',
    '.cx-w .sa-tx{min-width:0;flex:1}.cx-w .sa-tx b{display:block;font-size:.88em;font-weight:600}',
    '.cx-w .sa-tx small{display:block;color:var(--mut);font-size:.78em;margin-top:2px;line-height:1.45;word-break:break-word}',
    '.cx-w .sa-nt>.sa-tx{font-size:.84em;color:var(--mut);font-style:italic;line-height:1.5}',
    '.cx-w .sa-th details{font-size:.8em;color:var(--mut)}.cx-w .sa-th summary{cursor:pointer;font-weight:600}',
    '.cx-w .sa-th p{margin-top:6px;white-space:pre-wrap;word-break:break-word;line-height:1.5;max-height:180px;overflow:auto}',
    '.cx-w .sa-df{margin:7px 0 0;padding:8px 10px;border:1px solid var(--bd);border-radius:10px;background:var(--sf);list-style:none;display:flex;flex-direction:column;gap:5px;font-size:.78em}',
    '.cx-w .sa-df code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;margin-right:6px}',
    '.cx-w .sa-df s{color:var(--mut)}.cx-w .sa-df i{font-style:normal;color:var(--mut);margin:0 4px}',
    '.cx-w .sa-sw{display:inline-block;width:10px;height:10px;border-radius:3px;border:1px solid var(--bd);vertical-align:-1px;margin-right:4px}',
    '.cx-w .sa-card{display:flex;align-items:center;gap:12px;border:1px solid var(--bd);border-radius:14px;padding:12px 14px;background:var(--sf)}',
    '.cx-w .sa-card .sw{display:flex}.cx-w .sa-card .sw u{width:22px;height:22px;border-radius:50%;border:2px solid var(--sf);margin-left:-6px;text-decoration:none}.cx-w .sa-card .sw u:first-child{margin-left:0}',
    '.cx-w .sa-card b{display:block;font-size:.92em}.cx-w .sa-card small{color:var(--mut);font-size:.78em}',
    '.cx-w .sa-act{display:flex;gap:8px;flex-wrap:wrap}',
    '.cx-w .sa-btn{border:1px solid var(--bd)!important;border-radius:99px;padding:7px 14px;font-size:.82em;font-weight:600;cursor:pointer}',
    '.cx-w .sa-btn.p{background:var(--ib);color:var(--if);border-color:var(--ib)!important}',
    '.cx-w .sa-btn:disabled{opacity:.4;cursor:not-allowed}',
    '.cx-w .cx-cb.has .cx-sn{cursor:pointer}.cx-w .cx-cb.sa-busy .cx-sn{opacity:.5;cursor:progress}',
    '.cx-w .sa-on .cx-hi,.cx-w .sa-on .cx-sg{display:none}',
    '.cx-w .sa-hp{display:flex;flex-direction:column;gap:8px;min-height:0}',
    '.cx-w .sa-hh{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '.cx-w .sa-new{border:1px solid var(--bd)!important;border-radius:99px;padding:5px 11px;font-size:.78em;font-weight:600;cursor:pointer;display:inline-flex;gap:5px;align-items:center}',
    '.cx-w .sa-new svg{width:12px;height:12px}',
    '.cx-w .sa-hl{display:flex;flex-direction:column;gap:2px;max-height:260px;overflow-y:auto}',
    '.cx-w .sa-hi{display:flex;align-items:center;gap:6px;border-radius:10px;padding:8px 10px;cursor:pointer;width:100%}',
    '.cx-w .sa-hi:hover,.cx-w .sa-hi.on{background:var(--sf2)}',
    '.cx-w .sa-hi>span{min-width:0;flex:1}.cx-w .sa-hi b{display:block;font-size:.84em;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.cx-w .sa-hi small{display:block;color:var(--mut);font-size:.72em;margin-top:1px}',
    '.cx-w .sa-hx{opacity:.5;padding:4px;cursor:pointer;flex:none}.cx-w .sa-hx:hover{opacity:1}.cx-w .sa-hx svg{width:13px;height:13px}',
    '.cx-w .sa-he{color:var(--mut);font-size:.8em;padding:6px 2px;line-height:1.5}',
    '.cx-w .sa-hbtn{display:none}',
    '.cx-w .sa-dr{position:absolute;inset:0;z-index:30;display:none}.cx-w .sa-dr.open{display:flex}',
    '.cx-w .sa-dr .bk{flex:1;background:#0008}',
    '.cx-w .sa-dr .pn{order:-1;width:min(300px,84%);background:var(--sf);border-right:1px solid var(--bd);padding:16px 14px calc(16px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:12px;overflow-y:auto}',
    '.cx-w .sa-ap{border:1px solid var(--bd);border-radius:14px;padding:12px 14px;background:var(--sf);display:flex;flex-direction:column;gap:8px}',
    '.cx-w .sa-ap>b{font-size:.88em}.cx-w .sa-ap small{color:var(--mut);font-size:.78em;line-height:1.5;word-break:break-word}',
    '.cx-w .sa-ap a{text-decoration:underline;font-weight:600;color:var(--fg)}',
    '@media(max-width:820px){.cx-w .sa-hbtn{display:grid}}',
    '@media(min-width:821px){.cx-w .sa-dr{display:none!important}}',
    /* ----- branched build-progress tree (inspired by the Uiverse branched menu) ----- */
    '.cx-w .sa-run.sa-hid{display:none}.cx-w .sa-bm-h .sa-stop{margin-left:8px;flex:none}',
    '.cx-w .sa-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    '.cx-w .sa-bm{--bml:color-mix(in srgb,var(--fg) 18%,transparent);--bmm:color-mix(in srgb,var(--fg) 55%,transparent);position:relative;overflow:hidden;border:1px solid var(--bd);border-radius:14px;background:var(--bg);padding:4px 12px 6px 16px;animation:saBmIn .35s cubic-bezier(.23,1,.32,1) both}',
    '.cx-w .sa-bm-in{position:relative;padding-left:14px}',
    '.cx-w .sa-bm-in::before{content:"";position:absolute;top:8px;bottom:0;left:0;width:2px;border-radius:1px;background:linear-gradient(to bottom,var(--bml) 0,var(--bml) 55%,transparent 100%)}',
    '.cx-w .sa-bm-h{position:relative;display:flex;align-items:center;gap:8px;padding:9px 0}',
    '.cx-w .sa-bm-h b{font-size:.94em;font-weight:600}.cx-w .sa-bm-h small{margin-left:auto;color:var(--mut);font-size:.74em;font-variant-numeric:tabular-nums}',
    '.cx-w .sa-bm-mk{position:absolute;left:-14px;top:10px;width:2px;height:16px;border-radius:1px;background:var(--ib);opacity:0;transition:opacity .15s}',
    '.cx-w .sa-bm.go .sa-bm-mk{opacity:1}',
    '.cx-w .sa-bm-tree{position:relative}',
    '.cx-w .sa-bm-ln{position:absolute;top:0;left:0;overflow:visible;pointer-events:none}',
    '.cx-w .sa-bm-b,.cx-w .sa-bm-rc{fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}',
    '.cx-w .sa-bm-b{stroke:var(--bml)}',
    '.cx-w .sa-bm-rc{stroke:var(--ib);transition:stroke-dashoffset .4s cubic-bezier(.23,1,.32,1)}',
    '.cx-w .sa-bm-rc.on{stroke-dashoffset:0!important}',
    '.cx-w .sa-bm-ol{list-style:none;margin:0;padding:6px 0}',
    '.cx-w .sa-bm-i{display:flex;align-items:center;gap:8px;height:36px;margin:0;padding:0 4px 0 40px;box-sizing:border-box;min-width:0;color:var(--bmm);font-size:.86em;transition:color .2s}',
    '.cx-w .sa-bm-i.is-active,.cx-w .sa-bm-i.is-done{color:var(--fg)}.cx-w .sa-bm-i.is-active{font-weight:500}.cx-w .sa-bm-i.is-bad{color:#d9534f}',
    '.cx-w .sa-bm-ic{display:inline-flex;flex:none}.cx-w .sa-bm-ic svg{width:16px;height:16px;stroke-width:1.8}',
    '.cx-w .sa-bm-i.is-active .sa-bm-ic{animation:saBmPulse 1.2s ease-in-out infinite}',
    '.cx-w .sa-bm-i.is-active[data-s="0"] .sa-bm-ic{animation:saBmFlick .9s ease-in-out infinite;transform-origin:50% 90%}',
    '.cx-w .sa-bm-lb{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.cx-w .sa-bm-st{flex:none;width:16px;height:16px;display:grid;place-items:center}.cx-w .sa-bm-st svg{width:13px;height:13px;stroke-width:2.6}',
    '.cx-w .sa-bm-i.is-done .sa-bm-st{color:#0f9d58}.cx-w .sa-bm-i.is-done .sa-bm-st svg{animation:saBmPop .3s cubic-bezier(.23,1,.32,1)}.cx-w .sa-bm-i.is-bad .sa-bm-st{color:#d9534f}',
    '.cx-w .sa-bm-sp{width:12px;height:12px;border-radius:50%;border:2px solid var(--bd);border-top-color:var(--ib);animation:saSp .7s linear infinite}',
    '@keyframes saBmIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '@keyframes saBmPop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}',
    '@keyframes saBmPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}',
    '@keyframes saBmFlick{0%,100%{transform:rotate(-6deg) scale(1)}50%{transform:rotate(6deg) scale(1.15)}}',
    /* ----- photo picker in the composer + photos in the user message ----- */
    '.cx-w .sa-strip{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}.cx-w .sa-strip[hidden]{display:none}',
    '.cx-w .sa-pt{position:relative;width:52px;height:52px;flex:none;border-radius:10px;border:1px solid var(--bd);overflow:hidden;background:var(--sf2);animation:saBmPop .25s ease-out}',
    '.cx-w .sa-pt img{display:block;width:100%;height:100%;object-fit:cover}',
    '.cx-w .sa-px{position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:#000b!important;display:grid;place-items:center;cursor:pointer;padding:0}',
    '.cx-w .sa-px svg{width:10px;height:10px;stroke:#fff;stroke-width:2.6}',
    '.cx-w .sa-pt.up img{opacity:.4}.cx-w .sa-pu{position:absolute;inset:0;display:grid;place-items:center}.cx-w .sa-pu .sa-bm-sp{width:16px;height:16px}',
    '.cx-w .sa-bm-i.is-active .sa-bm-lb::after{content:"";animation:saDots 1.2s steps(1) infinite}@keyframes saDots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}',
    '.cx-w .sa-pn{margin:0 0 8px;font-size:.74em;line-height:1.45;color:var(--mut)}.cx-w .sa-pn:empty{display:none}',
    '.cx-w .cx-cb.sa-drag{border-color:var(--ib)}',
    '.cx-w .sa-at .v:empty{display:none}.cx-w .sa-at .v{font-variant-numeric:tabular-nums}',
    '.cx-w .sa-ug{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.cx-w .sa-ug img{width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #ffffff55;display:block}',
    '@media(hover:none){.cx-w .sa-px{width:24px;height:24px}}',
    '@media(prefers-reduced-motion:reduce){.cx-w .sa-spin,.cx-w .sa-hs{animation-duration:2s}.cx-w .sa-bm,.cx-w .sa-pt,.cx-w .sa-bm-i .sa-bm-ic,.cx-w .sa-bm-st svg{animation:none!important}.cx-w .sa-bm-rc,.cx-w .sa-bm-i{transition:none}.cx-w .sa-bm-sp{animation-duration:2s}}'
  ].join('\n');

  var busy = false, hist = [], curOv = null, ctl = null, lastUndo = null, cur = null, curDraftId = null;

  function api() { return (typeof API_BASE !== 'undefined' && API_BASE) || 'https://paypal-ai-backend.onrender.com'; }
  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function ov() { return document.querySelector('.cx-ov'); }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }
  function css() { if (document.getElementById('saStyle')) return; var s = h('style'); s.id = 'saStyle'; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------- builder bridge (globals of the app, read only when needed, always guarded) ---------- */
  function B() { return window.__sbBridge || null; }
  function haveSB() { var b = B(); return !!(b && b.SB && Array.isArray(b.TPL)); }
  function tplOf(k) { try { return k ? B().TPL.find(function (t) { return t.key === k; }) : null; } catch (e) { return null; } }
  function cl(o) { return JSON.parse(JSON.stringify(o)); }
  function redraw() {
    try { var on = document.querySelector('.side [data-v].on'); if (on && on.dataset.v === 'store' && B() && B().draw) B().draw(); } catch (e) { console.warn('[site-agent] redraw', e); }
  }
  function lastSpec(c) { for (var i = ((c && c.turns) || []).length - 1; i >= 0; i--) if (c.turns[i].spec) return c.turns[i].spec; return null; }
  async function authHdr() { try { var u = fbUser(); if (u) return { Authorization: 'Bearer ' + await u.getIdToken() }; } catch (e) {} return {}; }
  function startSpec(k) { if (!haveSB()) return null; var SB = B().SB; if (SB.spec) return SB.spec; var t = tplOf(k); return t ? t.spec : null; }
  function apply(spec, k) {
    if (!haveSB()) return null;
    var SB = B().SB, TPL = B().TPL, saveDraft = B().saveDraft;
    var prev = { spec: SB.spec ? cl(SB.spec) : null, tpl: SB.tpl, id: SB.id, mk: SB.mk, tab: SB.tab, res: SB.res };
    if (!SB.spec) { SB.tpl = tplOf(k) || SB.tpl || TPL[0]; SB.id = ''; SB.mk = ''; SB.tab = 'content'; SB.res = null; }
    SB.spec = cl(spec);
    try { saveDraft(); } catch (e) { console.warn('[site-agent] saveDraft', e); }
    redraw(); return prev;
  }
  function undo(prev) {
    if (!prev || !haveSB()) return;
    var SB = B().SB, saveDraft = B().saveDraft;
    SB.tpl = prev.tpl; SB.id = prev.id; SB.mk = prev.mk; SB.tab = prev.tab; SB.res = prev.res;
    if (prev.spec) { SB.spec = cl(prev.spec); try { saveDraft(); } catch (e) {} }
    else { SB.spec = null; try { B().store.set(B().kD(), null); } catch (e) {} }
    redraw();
  }

  /* adds the photo picker to the composer: a Photos pill next to the other pills, a thumbnail strip, paste and drop */
  function buildComposer(o) {
    var cb = o.querySelector('#cxCb'), ta = o.querySelector('#cxTa'), tl = o.querySelector('.cx-tl'); if (!cb || !ta) return;
    var strip = h('div', 'sa-strip'), note = h('p', 'sa-pn'), inp = h('input');
    strip.hidden = true; strip.setAttribute('data-sa-strip', '1'); note.setAttribute('role', 'status'); note.setAttribute('data-sa-pn', '1');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif'; inp.multiple = true; inp.hidden = true; inp.tabIndex = -1; inp.setAttribute('data-sa-file', '1');
    cb.insertBefore(strip, ta); cb.insertBefore(note, ta); cb.appendChild(inp);
    if (tl) { var w = h('div', 'cx-pw'); w.innerHTML = '<button type="button" class="cx-pl sa-at" data-sa-attach="1" aria-label="Add product photos (up to ' + MAXP + ')">' + IC.img + '<span class="k">Photos</span><span class="v" data-sa-cnt></span></button>'; tl.appendChild(w); }
  }

  /* ---------- enhance the overlay the first time it appears ---------- */
  function enhance(o) {
    if (o.__sa) return; o.__sa = 1; css(); cur = null; curDraftId = null; hist = []; buildHistUI(o);
    setTimeout(function () { try { var l0 = hload()[0]; if (l0 && !busy && !cur && Date.now() - (l0.at || 0) < 6048e5) loadChat(o, l0.id); } catch (e) { console.warn('[site-agent] resume', e); } }, 0);
    var sn = o.querySelector('#cxSn'), nt = o.querySelector('.cx-nt'), sub = o.querySelector('#cxSub');
    if (sn) { sn.setAttribute('aria-label', 'Send message'); sn.title = 'Send (Enter)'; }
    if (nt) nt.textContent = 'AI agent connected. It edits a draft copy and shows every step. Publish and automation run only after you tap Approve. You can add up to 4 product photos.';
    try { cloudPull(); } catch (e) {}
    try { pics = []; buildComposer(o); } catch (e) { console.warn('[site-agent] photos', e); }
    if (sub) sub.textContent = 'Agent mode \u00b7 steps are shown live';
    var ta = o.querySelector('#cxTa'); if (ta) ta.placeholder = 'Describe your store or ask for a change\u2026';
  }
  new MutationObserver(function () {
    var o = ov(); if (o) enhance(o);
    if (curOv && !document.contains(curOv)) { if (ctl) { try { ctl.abort(); } catch (e) {} } curOv = null; busy = false; lastUndo = null; cur = null; curDraftId = null; pics = []; }
  }).observe(document.body, { childList: true });

  /* ---------- build progress tree (branched menu style) ----------
     Six stages shown while the agent works. Stages 1-3 move on a short timer so the person sees the agent
     starting up; stages 4-6 advance with the real events from the server and finish once the answer arrives.
     Each stage stays visible for a minimum time so it never flashes past. Purely visual: it never changes the request. */
  var STG = [
    ['Cooking your idea', 'flame', 2050],
    ['Accessing builder', 'plug', 1750],
    ['Granting permission', 'shield', 1850],
    ['Setting up database', 'db', 1950],
    ['Safe Payment Wall', 'lock', 1850],
    ['Packaging your Webstore', 'pack', 1750]
  ];
  function buildTree(col, before) {
    var n = STG.length, H = 12 + 36 * n, el = h('div', 'sa-bm');
    el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Build progress');
    var base = '<path class="sa-bm-b" d="M 14 0 V ' + (14 + 36 * (n - 1)) + '"></path>', reach = '', lis = '', i, y, len;
    for (i = 0; i < n; i++) {
      y = 14 + 36 * i; len = (y + 15.71 + 8).toFixed(2);
      base += '<path class="sa-bm-b" d="M 14 ' + y + ' A 10 10 0 0 0 24 ' + (y + 10) + ' H 32"></path>';
      reach += '<path class="sa-bm-rc" d="M 14 0 V ' + y + ' A 10 10 0 0 0 24 ' + (y + 10) + ' H 32" style="stroke-dasharray:' + len + ';stroke-dashoffset:' + len + '"></path>';
      lis += '<li class="sa-bm-i" data-s="' + i + '" title="' + STG[i][0] + '"><span class="sa-bm-ic">' + IC[STG[i][1]] + '</span><span class="sa-bm-lb">' + STG[i][0] + '</span><span class="sa-bm-st" aria-hidden="true"></span></li>';
    }
    el.innerHTML = '<div class="sa-bm-in"><div class="sa-bm-h"><span class="sa-bm-mk" aria-hidden="true"></span><b>Building your webstore</b><small>0/' + n + '</small></div>' +
      '<div class="sa-bm-tree" style="height:' + H + 'px"><svg class="sa-bm-ln" width="40" height="' + H + '" aria-hidden="true">' + base + reach + '</svg><ol class="sa-bm-ol">' + lis + '</ol></div>' +
      '<span class="sa-vh" role="status" aria-live="polite"></span></div>';
    col.insertBefore(el, before || null);
    var items = [].slice.call(el.querySelectorAll('.sa-bm-i')), reaches = [].slice.call(el.querySelectorAll('.sa-bm-rc')),
      title = el.querySelector('.sa-bm-h b'), count = el.querySelector('.sa-bm-h small'), live = el.querySelector('.sa-vh');
    var doneN = 0, cap = 3, t0 = Date.now(), fast = false, over = false, bad = -1, seen = 0, timer = null, waiters = [], started = false;
    function paint() {
      items.forEach(function (li, k) {
        var st = k < doneN ? 'is-done' : (k === bad ? 'is-bad' : (k === doneN && !over ? 'is-active' : ''));
        li.className = 'sa-bm-i' + (st ? ' ' + st : '');
        var s = li.querySelector('.sa-bm-st'); s.innerHTML = st === 'is-done' ? IC.check : st === 'is-bad' ? IC.x : st === 'is-active' ? '<span class="sa-bm-sp"></span>' : '';
        if (st === 'is-active') li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      reaches.forEach(function (p, k) { p.classList.toggle('on', started && bad < 0 && k <= doneN); });
      el.classList.toggle('go', started); count.textContent = doneN + '/' + n;
    }
    function settle() { clearInterval(timer); timer = null; var w = waiters.splice(0); setTimeout(function () { w.forEach(function (f) { f(); }); }, 320); }
    function loop() {
      if (over) return;
      if (!el.isConnected) { over = true; settle(); return; }
      if (doneN < n && doneN < cap && Date.now() - t0 >= (fast ? 1100 : STG[doneN][2])) {
        doneN++; t0 = Date.now(); paint();
        if (doneN < n) live.textContent = 'Step ' + (doneN + 1) + ' of ' + n + ': ' + STG[doneN][0];
      }
      if (doneN >= n) { over = true; title.textContent = 'Your webstore is ready'; live.textContent = 'Webstore ready'; paint(); settle(); }
    }
    return {
      start: function () { started = true; paint(); live.textContent = 'Step 1 of ' + n + ': ' + STG[0][0]; timer = setInterval(loop, 120); },
      feed: function (ev) {
        if (!ev || over) return;
        if (ev.type === 'stepdone') { seen++; cap = Math.max(cap, seen > 1 ? 5 : 4); }
        else if (ev.type === 'step' && ev.tool === 'audit_site') cap = Math.max(cap, 5);
      },
      complete: function () { return new Promise(function (res) { if (over) return res(); cap = n; fast = true; waiters.push(res); if (!timer) timer = setInterval(loop, 120); }); },
      fail: function (stopped) {
        if (over) return; over = true; bad = doneN < n ? doneN : -1; title.textContent = stopped ? 'Build stopped' : 'Build failed'; live.textContent = title.textContent; paint(); settle();
      }
    };
  }

  /* ---------- photos for the build (up to 4, shrunk in the browser, placed on products in order) ---------- */
  var pics = [], MAXP = 4;
  function cleanName(n) { return String(n || 'photo').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24) || 'photo'; }
  function fileToJpeg(f) {
    return new Promise(function (ok, no) {
      if (!f || !/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) return no(new Error('Please choose a JPG, PNG, WebP or GIF image.'));
      if (f.size > 8e6) return no(new Error('That image is over 8 MB.'));
      var u = URL.createObjectURL(f), im = new Image();
      im.onload = function () {
        try {
          var M = 640, r = Math.min(1, M / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.naturalWidth * r)); c.height = Math.max(1, Math.round(im.naturalHeight * r));
          var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
          var q = 0.74, d = c.toDataURL('image/jpeg', q); while (d.length > 600000 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
          if (d.length > 600000) no(new Error('That image is too detailed. Try a smaller one.')); else ok(d);
        } catch (e) { no(new Error('Could not process that image.')); }
        URL.revokeObjectURL(u);
      };
      im.onerror = function () { URL.revokeObjectURL(u); no(new Error('Could not read that image.')); };
      im.src = u;
    });
  }
  function pnote(msg) { var o = ov(), p = o && o.querySelector('[data-sa-pn]'); if (p) p.textContent = msg || ''; }
  function renderPics() {
    var o = ov(), s = o && o.querySelector('[data-sa-strip]'); if (!s) return; s.textContent = '';
    pics.forEach(function (p) {
      var d = h('div', 'sa-pt'), im = h('img'), x = h('button', 'sa-px'); im.src = p.url || p.data; im.alt = p.name; if (p.up) { d.classList.add('up'); var pu = h('span', 'sa-pu'); pu.appendChild(h('span', 'sa-bm-sp')); d.appendChild(pu); }
      x.type = 'button'; x.setAttribute('data-sa-prm', p.id); x.setAttribute('aria-label', 'Remove ' + p.name); x.innerHTML = IC.x;
      d.insertBefore(im, d.firstChild); d.appendChild(x); s.appendChild(d);
    });
    s.hidden = !pics.length; var c = o.querySelector('[data-sa-cnt]'); if (c) c.textContent = pics.length ? pics.length + '/' + MAXP : '';
  }
  /* Photos are stored on Cloudinary (through the backend, which holds the secret). If that is not available the photo is
     embedded in the store instead, exactly like the builder's own upload, so nothing is ever lost. */
  function uploadPic(p) {
    p.up = true;
    p.p = fetch(api() + '/api/sa/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: [{ name: p.name, data: p.data }] }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { var it = x.ok && x.j.images && x.j.images[0]; if (it && /^https:\/\//.test(it.url || '')) p.url = it.url; else p.fail = (it && it.error) || x.j.error || 'upload failed'; })
      .catch(function () { p.fail = 'offline'; })
      .then(function () { p.up = false; if (p.fail) { pnote('Photo storage is unavailable right now. Your photo will be embedded in the store instead.'); } renderPics(); });
    return p.p;
  }
  async function addFiles(list) {
    var o = ov(); if (!o || busy) return;
    var arr = [].slice.call(list || []).filter(function (f) { return f && /^image\//.test(f.type); }); if (!arr.length) return;
    var room = MAXP - pics.length; if (room <= 0) return pnote('You can add up to ' + MAXP + ' photos.');
    if (arr.length > room) { pnote('Only the first ' + room + (room > 1 ? ' photos were' : ' photo was') + ' added (max ' + MAXP + ').'); arr = arr.slice(0, room); } else pnote('');
    for (var i = 0; i < arr.length; i++) {
      try { var d = await fileToJpeg(arr[i]); if (ov() !== o) return; var np = { id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: cleanName(arr[i].name), data: d }; pics.push(np); renderPics(); uploadPic(np); }
      catch (e) { pnote(e && e.message ? e.message : 'Could not add that image.'); }
      renderPics();
    }
  }
  /* The model cannot see pixels, so it is only told how many photos there are; the app places photo 1..N on products 1..N. */
  function photoNote(list) {
    if (!list.length) return '';
    return '\n\n[The user attached ' + list.length + ' product photo(s): ' + list.map(function (p) { return p.name; }).join(', ') + '. You cannot see them. The app puts photo 1..' + list.length + ' on product 1..' + list.length + ' in order. If you build or rewrite the store, include at least ' + list.length + ' products and order them to fit the request.]';
  }
  function withPhotos(spec, list) {
    if (!spec || !list.length || !Array.isArray(spec.products)) return { spec: spec, used: 0 };
    var s = cl(spec), k = Math.min(list.length, s.products.length), i; for (i = 0; i < k; i++) { if (list[i].url) { s.products[i].image = list[i].url; s.products[i].img = ''; } else s.products[i].img = list[i].data; }
    return { spec: s, used: k };
  }

  /* ---------- transcript pieces ---------- */
  function scroll(o) { var b = o.querySelector('#cxBd'); if (b) b.scrollTop = b.scrollHeight; }
  function addUser(inn, text, imgs) {
    var m = h('div', 'cx-m sa-u sa-add'), b = h('div', 'cx-bb');
    if (imgs && imgs.length) { var g = h('div', 'sa-ug'); imgs.forEach(function (p) { var im = h('img'); im.src = p.url || p.data; im.alt = p.name; im.loading = 'lazy'; g.appendChild(im); }); b.appendChild(g); b.appendChild(document.createTextNode(text)); }
    else b.textContent = text;
    m.appendChild(b); inn.appendChild(m);
  }
  function newRun(inn) {
    var m = h('div', 'cx-m sa-add'), av = h('span', 'cx-av'); av.innerHTML = IC.spark;
    var col = h('div', 'sa-col'), run = h('div', 'sa-run open'), head = h('div', 'sa-rh'); head.setAttribute('role', 'button'); head.tabIndex = 0; head.setAttribute('aria-expanded', 'true');
    var spin = h('span', 'sa-hs'), lab = h('b', null, 'Working\u2026'), meta = h('small', null, ''), stop = h('button', 'sa-stop', 'Stop'); stop.type = 'button'; stop.setAttribute('data-sa-stop', '1');
    var cv = h('span'); cv.innerHTML = IC.chev; var cvs = cv.firstChild; cvs.setAttribute('class', 'cv');
    head.appendChild(spin); head.appendChild(lab); head.appendChild(meta); head.appendChild(stop); head.appendChild(cvs);
    var list = h('ol', 'sa-st'); run.appendChild(head); run.appendChild(list); col.appendChild(run); m.appendChild(av); m.appendChild(col); inn.appendChild(m);
    return { col: col, run: run, head: head, spin: spin, lab: lab, meta: meta, stop: stop, list: list, steps: 0, t0: Date.now(), timer: null };
  }
  function tick(r) { r.meta.textContent = r.steps + (r.steps === 1 ? ' step' : ' steps') + ' \u00b7 ' + Math.round((Date.now() - r.t0) / 1000) + 's'; }
  function li(r, cls) { var l = h('li', cls); r.list.appendChild(l); return l; }
  function argsLine(a) { if (!a) return ''; return Object.keys(a).map(function (k) { return k + ': ' + a[k]; }).join('  \u00b7  '); }
  function isHex(v) { return /^#[0-9a-f]{6}$/i.test(String(v)); }
  function chg(c) {
    var row = h('li'), k = h('code', null, c.k); row.appendChild(k);
    function val(v) { var s = h('span'); if (isHex(v)) { var w = h('span', 'sa-sw'); w.style.background = v; s.appendChild(w); } s.appendChild(document.createTextNode(clip(v, 80) || '(empty)')); return s; }
    var f = val(c.from), arrow = h('i', null, '\u2192'); row.appendChild(f); row.appendChild(arrow); row.appendChild(val(c.to)); return row;
  }

  function onEvent(r, ev, ctx) {
    if (ev.type === 'model') { var l0 = li(r, 'sa-nt'); l0.appendChild(h('span', 'sa-ic')); var t0 = h('div', 'sa-tx'); t0.appendChild(h('small', null, 'Model: ' + ev.model)); l0.appendChild(t0); ctx.model = ev.model; }
    else if (ev.type === 'think') { var l1 = li(r, 'sa-th'); l1.appendChild(h('span', 'sa-ic')); var d = h('details'), sm = h('summary', null, 'Reasoning'); d.appendChild(sm); d.appendChild(h('p', null, ev.text)); var w1 = h('div', 'sa-tx'); w1.appendChild(d); l1.appendChild(w1); }
    else if (ev.type === 'note') { var l2 = li(r, 'sa-nt'); l2.appendChild(h('span', 'sa-ic')); l2.appendChild(h('div', 'sa-tx', ev.text)); }
    else if (ev.type === 'step') {
      r.steps++; var l = li(r, 'run'); l.setAttribute('data-sid', ev.id);
      var ic = h('span', 'sa-ic'); ic.appendChild(h('span', 'sa-spin')); var tx = h('div', 'sa-tx'); tx.appendChild(h('b', null, ev.label)); var a = argsLine(ev.args); if (a) tx.appendChild(h('small', null, a));
      l.appendChild(ic); l.appendChild(tx); tick(r);
    } else if (ev.type === 'stepdone') {
      var items = r.list.querySelectorAll('li[data-sid]'), el = null; for (var i = 0; i < items.length; i++) if (items[i].getAttribute('data-sid') === ev.id) el = items[i];
      if (!el) return; el.className = ev.ok ? 'ok' : 'bad'; var ic2 = el.querySelector('.sa-ic'); ic2.innerHTML = ev.ok ? IC.check : IC.x;
      var tx2 = el.querySelector('.sa-tx'); if (ev.note) tx2.appendChild(h('small', null, ev.note));
      if (ev.changes && ev.changes.length) { var ul = h('ul', 'sa-df'); ev.changes.forEach(function (c) { ul.appendChild(chg(c)); }); tx2.appendChild(ul); }
    }
  }
  function finish(r, state, text) {
    clearInterval(r.timer); r.spin.replaceWith(Object.assign(h('span', 'sa-hok'), { innerHTML: state === 'ok' ? IC.check : IC.x }));
    r.lab.textContent = state === 'ok' ? 'Worked for ' + Math.max(1, Math.round((Date.now() - r.t0) / 1000)) + 's' : text;
    tick(r); if (r.stop && r.stop.parentNode) r.stop.remove(); r.run.classList.toggle('open', state !== 'ok'); r.head.setAttribute('aria-expanded', state !== 'ok' ? 'true' : 'false');
  }
  function bubble(r, text, bad) { var b = h('div', 'cx-bb' + (bad ? ' sa-err' : '')); b.textContent = text; r.col.appendChild(b); return b; }

  function resultCard(r, spec, photos) {
    var c = h('div', 'sa-card'), sw = h('span', 'sw'), t = spec.theme || {};
    [t.primary, t.accent, t.bg].forEach(function (x) { var u = h('u'); u.style.background = /^#[0-9a-f]{6}$/i.test(x) ? x : '#888'; sw.appendChild(u); });
    var d = h('div'); d.appendChild(h('b', null, spec.name || 'Your store'));
    d.appendChild(h('small', null, (spec.products ? spec.products.length : 0) + ' products \u00b7 ' + (spec.currency || 'USD') + ' \u00b7 ' + (t.font || '') + ' type' + (photos ? ' · ' + photos + (photos === 1 ? ' photo' : ' photos') : '')));
    c.appendChild(sw); c.appendChild(d); r.col.appendChild(c);
  }
  function actions(r, prev) {
    var a = h('div', 'sa-act'), op = h('button', 'sa-btn p', 'Open in builder'), un = h('button', 'sa-btn', 'Undo'); op.type = un.type = 'button';
    op.setAttribute('data-sa-open', '1'); un.setAttribute('data-sa-undo', '1');
    if (lastUndo && lastUndo.btn) lastUndo.btn.disabled = true; /* only the newest change can be undone, so older ones never clobber it */
    lastUndo = { btn: un, prev: prev }; un.__prev = prev; a.appendChild(op); a.appendChild(un); r.col.appendChild(a);
  }

  /* ---------- chat history (saved per user in this browser) ---------- */
  var HK = 'sa_chats_v1_', PAGES = { store: 'Web Store Builder', flow: 'Workflow Builder', payouts: 'PayPal Payouts', tx: 'Transactions', sm: 'Store Manager', pp: 'Payment Links', home: 'Home' };
  function hkey() { var u = 'anon'; try { var b = B(); if (b && b.uid) u = String(b.uid() || 'anon'); } catch (e) {} return HK + u.replace(/[^\w@.\-]/g, '_'); }
  function hload() { try { var l = JSON.parse(localStorage.getItem(hkey()) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function hsave(l) { try { localStorage.setItem(hkey(), JSON.stringify(l)); } catch (e) { try { localStorage.setItem(hkey(), JSON.stringify(l.slice(0, 6))); } catch (e2) {} } }
  function slim(spec) { if (!spec) return null; var s = cl(spec); try { (s.products || []).forEach(function (p) { delete p.img; }); } catch (e) {} return s; }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'now'; if (m < 60) return m + 'm ago'; var hr = Math.round(m / 60); return hr < 24 ? hr + 'h ago' : Math.round(hr / 24) + 'd ago'; }
  function fillList(box) {
    box.textContent = ''; var l = hload();
    if (!l.length) { box.appendChild(h('div', 'sa-he', 'No chats yet. Your conversations are saved here.')); return; }
    l.forEach(function (c) {
      var row = h('div', 'sa-hi' + (cur && cur.id === c.id ? ' on' : '')); row.setAttribute('role', 'button'); row.tabIndex = 0; row.setAttribute('data-sa-chat', c.id);
      var sp = h('span'), n = c.turns ? c.turns.length : 0; sp.appendChild(h('b', null, c.title || 'Untitled')); sp.appendChild(h('small', null, ago(c.at) + ' \u00b7 ' + n + (n === 1 ? ' message' : ' messages')));
      var x = h('button', 'sa-hx'); x.type = 'button'; x.setAttribute('data-sa-del', c.id); x.setAttribute('aria-label', 'Delete chat'); x.innerHTML = IC.x;
      row.appendChild(sp); row.appendChild(x); box.appendChild(row);
    });
  }
  function renderHist() { var o = ov(); if (!o) return; [].forEach.call(o.querySelectorAll('[data-sa-list]'), fillList); }
  function buildHistUI(o) {
    var sd = o.querySelector('.cx-sd'), br = sd && sd.querySelector('.cx-br');
    if (br) {
      var sec = h('div', 'sa-hp'), hh = h('div', 'sa-hh'), lb = h('div', 'cx-lb', 'Chats'); lb.style.margin = '0'; hh.appendChild(lb);
      var nb = h('button', 'sa-new'); nb.type = 'button'; nb.setAttribute('data-sa-new', '1'); nb.innerHTML = IC.plus + 'New chat'; hh.appendChild(nb);
      var list = h('div', 'sa-hl'); list.setAttribute('data-sa-list', '1'); sec.appendChild(hh); sec.appendChild(list); br.parentNode.insertBefore(sec, br.nextSibling);
    }
    var tb = o.querySelector('.cx-tb'), tt = tb && tb.querySelector('.cx-tt');
    if (tb && tt) { var hb = h('button', 'cx-ib sa-hbtn'); hb.type = 'button'; hb.setAttribute('data-sa-hist', '1'); hb.setAttribute('aria-label', 'Chat history'); hb.innerHTML = IC.hist; tb.insertBefore(hb, tt); }
    var w = o.querySelector('.cx-w');
    if (w) { var dr = h('div', 'sa-dr'); dr.innerHTML = '<div class="pn"><div class="sa-hh"><div class="cx-lb" style="margin:0">Chats</div><button type="button" class="sa-new" data-sa-new="1">' + IC.plus + 'New chat</button></div><div class="sa-hl" data-sa-list="1" style="max-height:none"></div></div><div class="bk" data-sa-dclose="1"></div>'; w.appendChild(dr); }
    renderHist();
  }
  function drawer(o, on) { var d = o.querySelector('.sa-dr'); if (d) d.classList.toggle('open', !!on); }
  function clearThread(o) { [].forEach.call(o.querySelectorAll('.sa-add'), function (n) { n.remove(); }); var inn = o.querySelector('.cx-in'); if (inn) inn.classList.remove('sa-on'); lastUndo = null; }
  function newChat(o) { if (busy) return; clearThread(o); cur = null; curDraftId = null; hist = []; renderHist(); var ta = o.querySelector('#cxTa'); if (ta) ta.focus(); }
  function lastSid(c) { for (var i = ((c && c.turns) || []).length - 1; i >= 0; i--) if (c.turns[i].sid) return c.turns[i].sid; return null; }
  function persistCur() { if (!cur) return; cur.at = Date.now(); var l = hload().filter(function (x) { return x.id !== cur.id; }); l.unshift(cur); hsave(l.slice(0, 30)); cloudSave(cur); }
  /* every action the user approves (publish, automation, live update) is written into the turn it belongs to, so history shows what was performed */
  function logAct(kind, text, url) { if (!cur || !cur.turns.length) return; var t = cur.turns[cur.turns.length - 1]; (t.acts = t.acts || []).push({ k: kind, x: clip(text, 200), u: url || '', at: Date.now() }); persistCur(); }
  function actsLog(col, t) {
    var rows = []; (t.steps || []).forEach(function (s) { rows.push(['\u2022', s, '']); }); (t.acts || []).forEach(function (a) { rows.push(['\u2714', a.x, a.u]); });
    if (!rows.length) return; var d = document.createElement('details'); d.className = 'sa-actlog'; d.style.cssText = 'margin-top:8px;font-size:.85em;opacity:.9';
    var sm = document.createElement('summary'); sm.textContent = 'Actions performed (' + rows.length + ')'; sm.style.cursor = 'pointer'; d.appendChild(sm);
    rows.forEach(function (r) { var p = document.createElement('div'); p.style.cssText = 'margin:3px 0 0 12px'; p.textContent = r[0] + ' ' + r[1]; if (r[2]) { var a = document.createElement('a'); a.href = r[2]; a.target = '_blank'; a.rel = 'noopener'; a.textContent = ' ' + r[2]; p.appendChild(a); } d.appendChild(p); });
    col.appendChild(d);
  }
  function syncMine(sid, spec) { try { var b = B(), k = 'sb_' + b.uid(), m = b.store.get(k, []) || []; m.forEach(function (x) { if (x.id === sid) { x.spec = JSON.parse(JSON.stringify(spec)); x.name = spec.name || x.name; x.at = Date.now(); } }); b.store.set(k, m); } catch (e) { console.warn('[site-agent] sync library', e); } }
  /* Live editing: push the agent's result to the already-published store (same link, same gateway, same automation). */
  async function liveSync(col, spec) {
    var sid = cur && cur.storeId; if (!sid || !spec) return false; var line = h('small', null, 'Updating the live site\u2026'); col.appendChild(line);
    var mk = window.STX && STX.keysMap ? STX.keysMap()[sid] : '', ok = false, url = '', msg;
    if (!mk) msg = 'Live site not updated: this browser does not hold the manage key for that store.';
    else try {
      var res = await fetch(api() + '/api/store/' + encodeURIComponent(sid) + '/live', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-manage-key': mk }, body: JSON.stringify({ spec: spec }) });
      var j = await res.json().catch(function () { return {}; }); if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
      ok = true; url = j.url || ''; msg = 'Live site updated'; syncMine(sid, spec); var b = B(); if (b && b.SB) { b.SB.id = sid; b.SB.mk = mk; }
    } catch (e) { msg = 'Live update failed: ' + (e && e.message || 'unknown error'); }
    line.textContent = msg + (url ? ': ' : ''); if (url) { var l = h('a', null, url); l.href = url; l.target = '_blank'; l.rel = 'noopener'; line.appendChild(l); }
    logAct('live', msg, url); return ok;
  }
  async function liveAfter(r, done) {
    if (!done.spec || !cur || !cur.storeId) return;
    if ((done.trace || []).some(function (x) { return x.tool === 'replace_site'; })) {   // a full rewrite is never pushed live silently
      var a = h('div', 'sa-act'), bt = h('button', 'sa-btn p', 'Push this rewrite to the live site'); bt.type = 'button'; bt.setAttribute('data-sa-live', '1'); bt.__spec = done.spec; a.appendChild(bt); r.col.appendChild(a); return;
    }
    await liveSync(r.col, done.spec);
  }
  function saveTurn(u, a, spec, tpl, imgs, extra) {
    if (!cur) cur = { id: 'c' + Date.now().toString(36), title: clip(u, 42), at: Date.now(), turns: [] };
    cur.at = Date.now(); cur.draftId = curDraftId; cur.turns.push({ u: clip(u, 600), a: clip(a, 1500), spec: slim(spec), tpl: tpl || null, imgs: imgs && imgs.length ? imgs : undefined, steps: extra && extra.steps && extra.steps.length ? extra.steps : undefined, model: extra && extra.model || undefined, sid: cur.storeId || undefined }); if (cur.turns.length > 40) cur.turns.shift();
    var l = hload().filter(function (x) { return x.id !== cur.id; }); l.unshift(cur); hsave(l.slice(0, 30)); renderHist(); cloudSave(cur);
  }
  function delChat(id) { hsave(hload().filter(function (x) { return x.id !== id; })); cloudDelete(id); if (cur && cur.id === id) { var o = ov(); if (o) newChat(o); } renderHist(); }
  function restoredReply(inn, t) {
    var m = h('div', 'cx-m sa-add'), av = h('span', 'cx-av'); av.innerHTML = IC.spark; var col = h('div', 'sa-col'), b = h('div', 'cx-bb'); b.textContent = t.a || 'Done.'; col.appendChild(b); actsLog(col, t);
    if (t.spec) {
      resultCard({ col: col }, t.spec);
      var a = h('div', 'sa-act'), rs = h('button', 'sa-btn p', 'Restore this design'), op = h('button', 'sa-btn', 'Open in builder'), un = h('button', 'sa-btn', 'Undo');
      rs.type = op.type = un.type = 'button'; rs.__spec = t.spec; rs.__tpl = t.tpl; rs.setAttribute('data-sa-restore', '1'); op.setAttribute('data-sa-open', '1'); un.setAttribute('data-sa-undo', '1'); un.disabled = true; op.hidden = true;
      rs.__un = un; rs.__op = op; a.appendChild(rs); a.appendChild(op); a.appendChild(un); col.appendChild(a);
    }
    m.appendChild(av); m.appendChild(col); inn.appendChild(m);
  }
  function loadChat(o, id) {
    if (busy) return; var c = hload().filter(function (x) { return x.id === id; })[0]; if (!c) return;
    clearThread(o); cur = { id: c.id, title: c.title, at: c.at, draftId: c.draftId || null, turns: (c.turns || []).slice(), resume: true, storeId: lastSid(c) }; curDraftId = c.draftId || null; hist = [];
    cur.turns.forEach(function (t) { hist.push({ role: 'user', content: t.u }); hist.push({ role: 'assistant', content: t.a || '' }); }); hist = hist.slice(-10);
    curOv = o; var inn = o.querySelector('.cx-in'); inn.classList.add('sa-on'); cur.turns.forEach(function (t) { addUser(inn, t.u, t.imgs); restoredReply(inn, t); }); renderHist(); scroll(o);
  }

  /* ---------- chat history in Supabase (same project and Firebase sign-in as the app's own sync) ----------
     Best effort and silent: the demo account, offline use or a missing table simply keep the history in this browser as before. */
  var SBU = 'https://sovgouyroijklrygyqyc.supabase.co', SBK = 'sb_publishable_Qq3MMTTtSNj_ToyujwRidQ_wH9PqkQX', TBL = '/rest/v1/ppai_ai_chats', cloudDown = 0, pulledFor = '', cst = {};
  function fbUser() { try { var u = window.firebase && firebase.auth && firebase.auth().currentUser; return u && u.uid && u.uid !== 'demo' ? u : null; } catch (e) { return null; } }
  async function sbCall(path, opt, retried) {
    var u = fbUser(); if (!u || Date.now() < cloudDown) throw new Error('cloud history off');
    var tok = await u.getIdToken(!!retried);
    var r = await fetch(SBU + path, Object.assign({}, opt, { headers: Object.assign({ apikey: SBK, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, opt.headers || {}) }));
    if ((r.status === 401 || r.status === 403) && !retried) return sbCall(path, opt, true);
    if (!r.ok) { if (r.status === 401 || r.status === 403 || r.status === 404) cloudDown = Date.now() + 300000; throw new Error('HTTP ' + r.status); }
    return r;
  }
  function cloudSave(c) {
    if (!c || !fbUser()) return; clearTimeout(cst[c.id]);
    cst[c.id] = setTimeout(async function () {
      try {
        var u = fbUser(); if (!u) return;
        var turns = (c.turns || []).map(function (t, i, a) { return i >= a.length - 8 ? t : { u: t.u, a: t.a, tpl: t.tpl, imgs: t.imgs, acts: t.acts, steps: t.steps, sid: t.sid }; });
        await sbCall(TBL + '?on_conflict=user_id,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: c.id, user_id: u.uid, title: c.title || 'Untitled', draft_id: c.draftId || null, turns: turns, updated_at: new Date(c.at || Date.now()).toISOString() }) });
      } catch (e) { console.warn('[site-agent] cloud save', e && e.message); }
    }, 800);
  }
  function cloudDelete(id) { if (!fbUser()) return; sbCall(TBL + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).catch(function (e) { console.warn('[site-agent] cloud delete', e && e.message); }); }
  async function cloudPull() {
    var u = fbUser(); if (!u || pulledFor === u.uid) return; pulledFor = u.uid;
    try {
      var r = await sbCall(TBL + '?select=id,title,draft_id,turns,updated_at&order=updated_at.desc&limit=30', { method: 'GET' }), rows = await r.json(); if (!Array.isArray(rows)) return;
      var local = hload(), by = {}; local.forEach(function (c) { by[c.id] = c; });
      rows.forEach(function (x) { var at = Date.parse(x.updated_at) || 0, c = by[x.id]; if (!c || (c.at || 0) < at) by[x.id] = { id: x.id, title: x.title, at: at, draftId: x.draft_id || null, turns: Array.isArray(x.turns) ? x.turns : [] }; });
      hsave(Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); }).slice(0, 30)); renderHist();
      local.forEach(function (c) { if (!rows.some(function (x) { return x.id === c.id; })) cloudSave(c); });
    } catch (e) { pulledFor = ''; console.warn('[site-agent] cloud history', e && e.message); }
  }

  /* ---------- app actions the agent can request (always behind an Approve tap) ---------- */
  var APL = { publish: ['Publish this store', 'Makes the store live with a public link.', 'Approve and publish'], automate: ['Create the order automation', 'Builds the receipt, email and ledger workflow for the published store.', 'Approve and create'], open: ['', '', 'Open'] };
  function approvals(col, list) {
    (list || []).forEach(function (a) {
      var d = APL[a.type]; if (!d) return; var c = h('div', 'sa-ap'); c.appendChild(h('b', null, a.type === 'open' ? 'Open ' + (PAGES[a.page] || a.page) : d[0]));
      if (d[1]) c.appendChild(h('small', null, d[1]));
      var row = h('div', 'sa-act'), ok = h('button', 'sa-btn p', d[2]), no = h('button', 'sa-btn', 'Skip'), st = h('small', null, ''); ok.type = no.type = 'button';
      ok.setAttribute('data-sa-ap', a.type); if (a.page) ok.setAttribute('data-page', a.page); no.setAttribute('data-sa-skip', '1'); ok.__st = st; ok.__no = no;
      row.appendChild(ok); row.appendChild(no); c.appendChild(row); c.appendChild(st); col.appendChild(c);
    });
  }
  function showBuilder() {
    return new Promise(function (res) {
      try { var on = document.querySelector('.side [data-v].on'); if (on && on.dataset.v === 'store' && B().draw) B().draw(); else if (typeof window.go === 'function') window.go('store'); } catch (e) { console.warn('[site-agent] showBuilder', e); }
      var n = 0; (function w() { if (document.getElementById('sbPub') || n++ > 25) return res(); setTimeout(w, 100); })();
    });
  }

  /* Every AI-built site is saved to the Library as a draft, so it can be found and managed with the other sites. */
  function saveToLibrary(spec, tplKey) {
    try {
      var b = B(); if (!b || !window.STX || !window.STX.addDraft || b.SB.id || (cur && cur.storeId)) return false;   // a thread linked to a published store never spawns a duplicate draft
      if (!curDraftId) curDraftId = b.SB.aid || ('ad' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      var k = (b.SB.tpl && b.SB.tpl.key) || tplKey || null;
      window.STX.addDraft(curDraftId, b.SB.spec || spec, k); b.SB.aid = curDraftId; b.saveDraft(); return true;
    } catch (e) { console.warn('[site-agent] library', e); return false; }
  }
  function openLibrary(o) {
    var x = o && o.querySelector('[data-cxx]'); if (x) x.click();
    setTimeout(function () { try { if (window.LIBX && window.LIBX.show) window.LIBX.show(true); else if (typeof window.go === 'function') window.go('store'); } catch (e) { console.warn(e); } }, 120);
  }

  /* The action dock: always-visible, one-tap, PayPal-styled buttons. A tap is the user's approval. */
  function dockBtn(kind, icon, title, sub, pri) {
    var b = h('button', 'sa-dkb' + (pri ? ' pri' : '')); b.type = 'button'; b.setAttribute('data-sa-dock', kind);
    var i = h('span', 'ic'); i.innerHTML = icon; var t = h('span', 'tx'); t.appendChild(h('b', null, title)); t.appendChild(h('small', null, sub)); b.appendChild(i); b.appendChild(t); return b;
  }
  function dock(col, saved) {
    var d = h('div', 'sa-dock'), hd = h('div', 'sa-dk-h'), ic = h('span'); ic.innerHTML = IC.store;
    var tx = h('div'); tx.appendChild(h('b', null, saved ? 'Saved to your Library as a draft' : 'Next steps')); tx.appendChild(h('small', null, 'Nothing goes live until you tap an action below.'));
    hd.appendChild(ic); hd.appendChild(tx);
    var bd = h('div', 'sa-dk-b');
    bd.appendChild(dockBtn('publish', IC.send, 'Approve and publish', 'Make the store live with a public link', true));
    bd.appendChild(dockBtn('automate', IC.bolt, 'Create order automation', 'Receipt, email and ledger workflow for this store'));
    bd.appendChild(dockBtn('library', IC.grid, 'Manage sites', 'Open the Library with all drafts and live stores'));
    d.appendChild(hd); d.appendChild(bd); d.appendChild(h('div', 'sa-dst')); col.appendChild(d); return d;
  }

  async function runAction(o, btn) {
    var dk = btn.closest('.sa-dock'), type = btn.getAttribute('data-sa-ap') || btn.getAttribute('data-sa-dock');
    var st = btn.__st || (dk && dk.querySelector('.sa-dst')) || h('small'), no = btn.__no || null, card = btn.closest('.sa-ap'), b = B();
    function say(msg, url) {
      st.textContent = msg;
      if (url) { st.appendChild(document.createElement('br')); var l = h('a', null, url); l.href = url; l.target = '_blank'; l.rel = 'noopener'; st.appendChild(l); }
    }
    function label(title, sub, cls) { var bb = btn.querySelector('b'); if (bb) { bb.textContent = title; var sm = btn.querySelector('small'); if (sm && sub != null) sm.textContent = sub; } else btn.textContent = title; if (cls) btn.classList.add(cls); }
    function again(msg) { say(msg); btn.disabled = false; btn.classList.remove('busy'); if (no) no.disabled = false; }
    btn.disabled = true; btn.classList.add('busy'); if (no) no.disabled = true;
    try {
      if (type === 'library') { btn.disabled = false; btn.classList.remove('busy'); openLibrary(o); return; }
      if (type === 'open') {
        var pg = btn.getAttribute('data-page'), x = o.querySelector('[data-cxx]'); if (x) x.click();
        setTimeout(function () { try { window.go(pg); } catch (e) { console.warn(e); } }, 80); label('Opened'); btn.classList.remove('busy'); return;
      }
      if (type === 'publish') {
        if (!b || !b.SB.spec) return again('There is no store draft to publish yet. Ask me to build one first.');
        say('Publishing\u2026'); await showBuilder(); var before = b.SB.res; await b.publish(); var rs = b.SB.res;
        if (rs && rs.url && rs !== before) {
          btn.classList.remove('busy', 'pri'); label('Published', 'Live and listed in your Library', 'done'); btn.disabled = true; curDraftId = null;
          say('Your store is live:', rs.url); if (cur) cur.storeId = b.SB.id; logAct('publish', 'Store published', rs.url);
          if (dk) { var au = dk.querySelector('[data-sa-dock="automate"]'); if (au) au.classList.add('pri'); }
          else if (card) approvals(card.parentNode, [{ type: 'automate' }]);
          try { if (window.LIBX && window.LIBX.refresh) window.LIBX.refresh(); } catch (e) {}
          scroll(o);
        } else again('Publish did not finish. Check the message the app showed and try again.');
        return;
      }
      if (type === 'automate') {
        if (!b || !b.SB.id) return again('Publish the store first, then I can create its automation.');
        var sx = (window.STX ? window.STX.list() : []).filter(function (x) { return x.id === b.SB.id && !x.draft; })[0];
        if (!sx || !window.LIBX || !window.LIBX.autoSilent) return again('Automation helper is not ready. Reload the page and try again.');
        say('Creating and publishing the automation\u2026'); var ar = await window.LIBX.autoSilent(sx);   // stays in this chat: no redirect to the workflow builder
        btn.classList.remove('busy'); btn.disabled = true; label(ar.existing ? 'Automation already active' : 'Automation live', 'Receipt, email and ledger run on every paid order', 'done');
        say(ar.existing ? 'This store already has an active automation.' : 'Automation is live: every paid order now gets a receipt, an email and a ledger entry. You can fine-tune it later from the Library.');
        logAct('automate', ar.existing ? 'Automation already active' : 'Order automation created and published', ''); scroll(o); return;
      }
    } catch (err) { again('Failed: ' + ((err && err.message) || 'unknown error')); }
  }

  /* ---------- send ---------- */
  async function send() {
    var o = ov(); if (!o || busy) return;
    var ta = o.querySelector('#cxTa'), text = ta ? ta.value.trim() : ''; if (text.length < 2) return;
    if (o !== curOv) { curOv = o; hist = []; lastUndo = null; cur = null; curDraftId = null; }
    busy = true; var cb = o.querySelector('#cxCb'); if (cb) { cb.classList.remove('has'); cb.classList.add('sa-busy'); }
    ta.value = ''; ta.style.height = 'auto';
    var sent = pics.slice(); pics = []; renderPics(); pnote('');
    var inn = o.querySelector('.cx-in'); inn.classList.add('sa-on'); addUser(inn, text, sent);
    var r = newRun(inn), ctx = {}; r.timer = setInterval(function () { tick(r); }, 1000); scroll(o);
    var tr = null; try { tr = buildTree(r.col, r.run); tr.start(); r.run.classList.add('sa-hid'); var hd0 = r.col.querySelector('.sa-bm-h'); if (hd0 && r.stop) hd0.appendChild(r.stop); } catch (e) { console.warn('[site-agent] progress', e); tr = null; }
    try { await Promise.all(sent.map(function (p) { return p.p; })); } catch (e) {}
    var st = {}; try { st = typeof window.cxBuilderState === 'function' ? window.cxBuilderState() : {}; } catch (e) {}
    var tp = tplOf(st.template);
    if (!cur) cur = { id: 'c' + Date.now().toString(36), title: clip(text, 42), at: Date.now(), turns: [] };
    var resumeSpec = cur.resume ? lastSpec(cur) : null;
    if (haveSB() && B().SB.id) cur.storeId = B().SB.id;
    var body = { message: text + photoNote(sent), history: hist.slice(-10), spec: resumeSpec || startSpec(st.template), resume: !!resumeSpec, live: !!cur.storeId, sessionId: cur.id, turnIndex: cur.turns.length, tpl: tp ? { name: tp.name, tag: tp.tag } : null, auto: st.automations || [], model: st.model, effort: st.effort, stream: true };
    ctl = new AbortController(); var done = null, failed = '';
    try {
      var res = await fetch(api() + '/api/sa/chat', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, await authHdr()), body: JSON.stringify(body), signal: ctl.signal });
      var ct = res.headers.get('content-type') || '';
      if (!res.ok || ct.indexOf('ndjson') < 0 || !res.body || !res.body.getReader) {
        var j = {}; try { j = await res.json(); } catch (e) {}
        if (!res.ok) failed = j.error || ('Request failed (' + res.status + ')'); else done = j;
      } else {
        var rd = res.body.getReader(), dec = new TextDecoder(), buf = '';
        for (;;) {
          var chunk = await rd.read(); if (chunk.done) break; buf += dec.decode(chunk.value, { stream: true });
          var nl; while ((nl = buf.indexOf('\n')) >= 0) {
            var line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
            var ev; try { ev = JSON.parse(line); } catch (e) { continue; }
            if (ev.type === 'done') done = ev; else if (ev.type === 'error') failed = ev.error || 'Something went wrong.'; else { onEvent(r, ev, ctx); if (tr) tr.feed(ev); }
            scroll(o);
          }
        }
      }
    } catch (e) { failed = e && e.name === 'AbortError' ? 'Stopped' : 'Could not reach the AI server. Check your connection and try again.'; }
    /* let the remaining stages play out (briefly) before the result appears; busy stays on so nothing can interleave */
    if (tr) { if (failed || !done) tr.fail(failed === 'Stopped'); else { try { await tr.complete(); } catch (e) {} } }
    ctl = null; busy = false; if (cb) cb.classList.remove('sa-busy');
    if ((failed || !done) && sent.length) { pics = sent.concat(pics).slice(0, MAXP); renderPics(); }
    if (failed) { finish(r, 'err', failed === 'Stopped' ? 'Stopped' : 'Failed'); if (failed !== 'Stopped') { bubble(r, failed, true); var rt = h('button', 'sa-btn sa-retry'); rt.type = 'button'; rt.setAttribute('data-sa-retry', '1'); rt.__text = text; rt.innerHTML = IC.retry + '<span>Try again</span>'; r.col.appendChild(rt); } }
    else if (done) {
      finish(r, 'ok'); bubble(r, done.reply || 'Done.');
      hist.push({ role: 'user', content: text }); hist.push({ role: 'assistant', content: done.reply || '' });
      var photos = 0;
      if (done.spec && sent.length) { var wp = withPhotos(done.spec, sent); done.spec = wp.spec; photos = wp.used; if (sent.length > photos) bubble(r, (sent.length - photos) + (sent.length - photos === 1 ? ' photo was' : ' photos were') + ' not placed because the store has fewer products than photos. Add more products and attach them again.'); }
      else if (sent.length) { pics = sent.slice(0, MAXP); renderPics(); bubble(r, 'No store change was made, so your photos were not used. They are still attached. Send a build request to use them.'); }
      if (done.spec) { var prev = apply(done.spec, st.template); if (prev !== null || !haveSB()) { resultCard(r, done.spec, photos); if (haveSB()) actions(r, prev); } }
      var saved = done.spec && haveSB() ? saveToLibrary(done.spec, st.template) : false, showDock = false;
      if (haveSB() && B().SB.spec && (done.spec || (done.ui && done.ui.length) || /publish|automat|workflow|library|manage|go live|launch|deploy|live/i.test(text))) { dock(r.col, saved); showDock = true; }
      var more = (done.ui || []).filter(function (u) { return !showDock || u.type === 'open'; }); if (more.length) approvals(r.col, more);
      if (cur && done.spec) cur.resume = false;
      saveTurn(text, done.reply || 'Done.', done.spec, st.template, sent.filter(function (p) { return p.url; }).map(function (p) { return { name: p.name, url: p.url }; }), { steps: (done.actions || []).slice(0, 20).map(function (x) { return clip(String(x), 140); }), model: done.model });
      await liveAfter(r, done);
    } else finish(r, 'err', 'Failed');
    if (document.contains(o)) { scroll(o); var t2 = o.querySelector('#cxTa'); if (t2) t2.focus(); }
  }

  /* Open the AI-made design in the Store Builder: close the chat, then show the builder with the applied draft. */
  function openBuilder(o) {
    var x = o && o.querySelector('[data-cxx]'); if (x) x.click();
    setTimeout(function () {
      try {
        var b = B(); if (!b || !b.SB.spec) return;
        var on = document.querySelector('.side [data-v].on');
        if (on && on.dataset.v === 'store') b.draw(); else if (typeof window.go === 'function') window.go('store');
      } catch (err) { console.warn('[site-agent] open', err); }
    }, 60);
  }

  /* ---------- events (capture phase; the existing chat handlers keep working untouched) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return; var o = ov(); if (!o || !o.contains(t)) return;
    if (t.closest('#cxSn')) { e.preventDefault(); send(); return; }
    if (t.closest('[data-sa-attach]')) { e.preventDefault(); if (busy) return; var fi = o.querySelector('[data-sa-file]'); if (fi) fi.click(); return; }
    var prm = t.closest('[data-sa-prm]'); if (prm) { e.preventDefault(); var pid = prm.getAttribute('data-sa-prm'); pics = pics.filter(function (p) { return p.id !== pid; }); pnote(''); renderPics(); return; }
    if (t.closest('[data-sa-hist]')) { drawer(o, true); return; }
    if (t.closest('[data-sa-dclose]')) { drawer(o, false); return; }
    if (t.closest('[data-sa-new]')) { e.preventDefault(); newChat(o); drawer(o, false); return; }
    var dl = t.closest('[data-sa-del]'); if (dl) { e.preventDefault(); e.stopPropagation(); delChat(dl.getAttribute('data-sa-del')); return; }
    var ch = t.closest('[data-sa-chat]'); if (ch) { loadChat(o, ch.getAttribute('data-sa-chat')); drawer(o, false); return; }
    var lv = t.closest('[data-sa-live]'); if (lv) { e.preventDefault(); if (!lv.disabled) { lv.disabled = true; liveSync(lv.closest('.sa-col') || lv.parentNode, lv.__spec).then(function (ok) { lv.textContent = ok ? 'Live site updated' : 'Try again'; lv.disabled = ok; }); } return; }
    var dkb = t.closest('[data-sa-dock]'); if (dkb) { e.preventDefault(); if (!dkb.disabled) runAction(o, dkb); return; }
    var rty = t.closest('[data-sa-retry]');
    if (rty) { e.preventDefault(); if (busy) return; var ta0 = o.querySelector('#cxTa'); if (ta0) { ta0.value = rty.__text || ''; rty.remove(); send(); } return; }
    var apb = t.closest('[data-sa-ap]'); if (apb) { e.preventDefault(); if (!apb.disabled) runAction(o, apb); return; }
    var sk = t.closest('[data-sa-skip]'); if (sk) { var cd = sk.closest('.sa-ap'); if (cd) cd.remove(); return; }
    var rb = t.closest('[data-sa-restore]');
    if (rb) { e.preventDefault(); if (rb.disabled) return; var pv = apply(rb.__spec, rb.__tpl); if (pv === null && !haveSB()) return; rb.__un.__prev = pv; rb.__un.disabled = false; rb.__op.hidden = false; rb.textContent = 'Restored'; rb.disabled = true; saveToLibrary(rb.__spec, rb.__tpl); return; }
    if (t.closest('[data-sa-stop]')) { e.preventDefault(); if (ctl) ctl.abort(); return; }
    var hd = t.closest('.sa-rh'); if (hd) { var run = hd.parentNode; var on = run.classList.toggle('open'); hd.setAttribute('aria-expanded', on ? 'true' : 'false'); return; }
    var un = t.closest('[data-sa-undo]'); if (un && !un.disabled) { var aid0 = haveSB() ? B().SB.aid : ''; undo(un.__prev); try { if (aid0 && window.STX) { if (B().SB.spec) window.STX.addDraft(aid0, B().SB.spec, B().SB.tpl && B().SB.tpl.key); else window.STX.remove(aid0); } } catch (e) { console.warn(e); } un.disabled = true; un.textContent = 'Undone'; var op = un.parentNode.querySelector('[data-sa-open]'); if (op) op.disabled = true; return; }
    if (t.closest('[data-sa-open]')) { e.preventDefault(); openBuilder(o); return; }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (!e.target || e.target.id !== 'cxTa' || !ov()) {
      if (e.target && e.target.classList && (e.target.classList.contains('sa-rh') || e.target.classList.contains('sa-hi')) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  }, true);

  /* photo picker inputs: file dialog, paste into the message box, drop on the message box */
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t || !t.matches || !t.matches('[data-sa-file]') || !ov()) return;
    var f = t.files ? [].slice.call(t.files) : []; t.value = ''; addFiles(f);
  });
  document.addEventListener('paste', function (e) {
    if (!e.target || e.target.id !== 'cxTa' || !ov() || !e.clipboardData || !e.clipboardData.files || !e.clipboardData.files.length) return;
    var f = [].slice.call(e.clipboardData.files).filter(function (x) { return /^image\//.test(x.type); }); if (f.length) { e.preventDefault(); addFiles(f); }
  });
  document.addEventListener('dragover', function (e) {
    var cb = e.target && e.target.closest && e.target.closest('#cxCb'); if (!cb || !ov() || !e.dataTransfer || [].indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
    e.preventDefault(); cb.classList.add('sa-drag');
  });
  document.addEventListener('dragleave', function (e) { var cb = e.target && e.target.closest && e.target.closest('#cxCb'); if (cb) cb.classList.remove('sa-drag'); });
  document.addEventListener('drop', function (e) {
    var cb = e.target && e.target.closest && e.target.closest('#cxCb'); if (!cb || !ov()) return; cb.classList.remove('sa-drag');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); }
  });

  window.saAgentState = function () { return { busy: busy, turns: hist.length / 2 }; };
  var first = ov(); if (first) enhance(first);
})();
