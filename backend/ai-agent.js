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
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/></svg>'
  };
  var CSS = [
    '.cx-w .sa-u{flex-direction:row-reverse}',
    '.cx-w .sa-u .cx-bb{background:var(--ib);color:var(--if);border-color:var(--ib);border-radius:16px 4px 16px 16px;white-space:pre-wrap;word-break:break-word}',
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
    '@media(prefers-reduced-motion:reduce){.cx-w .sa-spin,.cx-w .sa-hs{animation-duration:2s}}'
  ].join('\n');

  var busy = false, hist = [], curOv = null, ctl = null, lastUndo = null;

  function api() { return (typeof API_BASE !== 'undefined' && API_BASE) || 'https://paypal-ai-backend.onrender.com'; }
  function h(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function ov() { return document.querySelector('.cx-ov'); }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }
  function css() { if (document.getElementById('saStyle')) return; var s = h('style'); s.id = 'saStyle'; s.textContent = CSS; document.head.appendChild(s); }

  /* ---------- builder bridge (globals of the app, read only when needed, always guarded) ---------- */
  function haveSB() { try { return typeof SB !== 'undefined' && SB && typeof TPL !== 'undefined' && Array.isArray(TPL); } catch (e) { return false; } }
  function tplOf(k) { try { return k ? TPL.find(function (t) { return t.key === k; }) : null; } catch (e) { return null; } }
  function cl(o) { return JSON.parse(JSON.stringify(o)); }
  function redraw() {
    try { var on = document.querySelector('.side [data-v].on'); if (on && on.dataset.v === 'store' && typeof draw === 'function') draw(); } catch (e) { console.warn('[site-agent] redraw', e); }
  }
  function startSpec(k) { if (!haveSB()) return null; if (SB.spec) return SB.spec; var t = tplOf(k); return t ? t.spec : null; }
  function apply(spec, k) {
    if (!haveSB()) return null;
    var prev = { spec: SB.spec ? cl(SB.spec) : null, tpl: SB.tpl, id: SB.id, mk: SB.mk, tab: SB.tab, res: SB.res };
    if (!SB.spec) { SB.tpl = tplOf(k) || SB.tpl || TPL[0]; SB.id = ''; SB.mk = ''; SB.tab = 'content'; SB.res = null; }
    SB.spec = cl(spec);
    try { saveDraft(); } catch (e) { console.warn('[site-agent] saveDraft', e); }
    redraw(); return prev;
  }
  function undo(prev) {
    if (!prev || !haveSB()) return;
    SB.tpl = prev.tpl; SB.id = prev.id; SB.mk = prev.mk; SB.tab = prev.tab; SB.res = prev.res;
    if (prev.spec) { SB.spec = cl(prev.spec); try { saveDraft(); } catch (e) {} }
    else { SB.spec = null; try { if (typeof store !== 'undefined' && typeof kD === 'function') store.set(kD(), null); } catch (e) {} }
    redraw();
  }

  /* ---------- enhance the overlay the first time it appears ---------- */
  function enhance(o) {
    if (o.__sa) return; o.__sa = 1; css();
    var sn = o.querySelector('#cxSn'), nt = o.querySelector('.cx-nt'), sub = o.querySelector('#cxSub');
    if (sn) { sn.setAttribute('aria-label', 'Send message'); sn.title = 'Send (Enter)'; }
    if (nt) nt.textContent = 'AI agent connected. It edits a draft copy, shows every step, and you can undo. Publishing stays manual.';
    if (sub) sub.textContent = 'Agent mode \u00b7 steps are shown live';
    var ta = o.querySelector('#cxTa'); if (ta) ta.placeholder = 'Describe your store or ask for a change\u2026';
  }
  new MutationObserver(function () {
    var o = ov(); if (o) enhance(o);
    if (curOv && !document.contains(curOv)) { if (ctl) { try { ctl.abort(); } catch (e) {} } curOv = null; busy = false; lastUndo = null; }
  }).observe(document.body, { childList: true });

  /* ---------- transcript pieces ---------- */
  function scroll(o) { var b = o.querySelector('#cxBd'); if (b) b.scrollTop = b.scrollHeight; }
  function addUser(inn, text) {
    var m = h('div', 'cx-m sa-u'), b = h('div', 'cx-bb'); b.textContent = text; m.appendChild(b); inn.appendChild(m);
  }
  function newRun(inn) {
    var m = h('div', 'cx-m'), av = h('span', 'cx-av'); av.innerHTML = IC.spark;
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

  function resultCard(r, spec) {
    var c = h('div', 'sa-card'), sw = h('span', 'sw'), t = spec.theme || {};
    [t.primary, t.accent, t.bg].forEach(function (x) { var u = h('u'); u.style.background = /^#[0-9a-f]{6}$/i.test(x) ? x : '#888'; sw.appendChild(u); });
    var d = h('div'); d.appendChild(h('b', null, spec.name || 'Your store'));
    d.appendChild(h('small', null, (spec.products ? spec.products.length : 0) + ' products \u00b7 ' + (spec.currency || 'USD') + ' \u00b7 ' + (t.font || '') + ' type'));
    c.appendChild(sw); c.appendChild(d); r.col.appendChild(c);
  }
  function actions(r, prev) {
    var a = h('div', 'sa-act'), op = h('button', 'sa-btn p', 'Open in builder'), un = h('button', 'sa-btn', 'Undo'); op.type = un.type = 'button';
    op.setAttribute('data-sa-open', '1'); un.setAttribute('data-sa-undo', '1');
    if (lastUndo && lastUndo.btn) lastUndo.btn.disabled = true; /* only the newest change can be undone, so older ones never clobber it */
    lastUndo = { btn: un, prev: prev }; un.__prev = prev; a.appendChild(op); a.appendChild(un); r.col.appendChild(a);
  }

  /* ---------- send ---------- */
  async function send() {
    var o = ov(); if (!o || busy) return;
    var ta = o.querySelector('#cxTa'), text = ta ? ta.value.trim() : ''; if (text.length < 2) return;
    if (o !== curOv) { curOv = o; hist = []; lastUndo = null; }
    busy = true; var cb = o.querySelector('#cxCb'); if (cb) { cb.classList.remove('has'); cb.classList.add('sa-busy'); }
    ta.value = ''; ta.style.height = 'auto';
    var inn = o.querySelector('.cx-in'); inn.classList.add('sa-on'); addUser(inn, text);
    var r = newRun(inn), ctx = {}; r.timer = setInterval(function () { tick(r); }, 1000); scroll(o);
    var st = {}; try { st = typeof window.cxBuilderState === 'function' ? window.cxBuilderState() : {}; } catch (e) {}
    var tp = tplOf(st.template);
    var body = { message: text, history: hist.slice(-10), spec: startSpec(st.template), tpl: tp ? { name: tp.name, tag: tp.tag } : null, auto: st.automations || [], model: st.model, effort: st.effort, stream: true };
    ctl = new AbortController(); var done = null, failed = '';
    try {
      var res = await fetch(api() + '/api/sa/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
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
            if (ev.type === 'done') done = ev; else if (ev.type === 'error') failed = ev.error || 'Something went wrong.'; else onEvent(r, ev, ctx);
            scroll(o);
          }
        }
      }
    } catch (e) { failed = e && e.name === 'AbortError' ? 'Stopped' : 'Could not reach the AI server. Check your connection and try again.'; }
    ctl = null; busy = false; if (cb) cb.classList.remove('sa-busy');
    if (failed) { finish(r, 'err', failed === 'Stopped' ? 'Stopped' : 'Failed'); if (failed !== 'Stopped') bubble(r, failed, true); }
    else if (done) {
      finish(r, 'ok'); bubble(r, done.reply || 'Done.');
      hist.push({ role: 'user', content: text }); hist.push({ role: 'assistant', content: done.reply || '' });
      if (done.spec) { var prev = apply(done.spec, st.template); if (prev !== null || !haveSB()) { resultCard(r, done.spec); if (haveSB()) actions(r, prev); } }
    } else finish(r, 'err', 'Failed');
    if (document.contains(o)) { scroll(o); var t2 = o.querySelector('#cxTa'); if (t2) t2.focus(); }
  }

  /* ---------- events (capture phase; the existing chat handlers keep working untouched) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return; var o = ov(); if (!o || !o.contains(t)) return;
    if (t.closest('#cxSn')) { e.preventDefault(); send(); return; }
    if (t.closest('[data-sa-stop]')) { e.preventDefault(); if (ctl) ctl.abort(); return; }
    var hd = t.closest('.sa-rh'); if (hd) { var run = hd.parentNode; var on = run.classList.toggle('open'); hd.setAttribute('aria-expanded', on ? 'true' : 'false'); return; }
    var un = t.closest('[data-sa-undo]'); if (un && !un.disabled) { undo(un.__prev); un.disabled = true; un.textContent = 'Undone'; var op = un.parentNode.querySelector('[data-sa-open]'); if (op) op.disabled = true; return; }
    if (t.closest('[data-sa-open]')) { var x = o.querySelector('[data-cxx]'); if (x) x.click(); }
  }, true);
  document.addEventListener('keydown', function (e) {
    if (!e.target || e.target.id !== 'cxTa' || !ov()) {
      if (e.target && e.target.classList && e.target.classList.contains('sa-rh') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  }, true);

  window.saAgentState = function () { return { busy: busy, turns: hist.length / 2 }; };
  var first = ov(); if (first) enhance(first);
})();
