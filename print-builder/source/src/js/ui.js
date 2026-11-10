/* =====================================================================
   The window round the sheet: the ribbon, the palette, properties, Check Print, sheets, the title block,
   zoom, files, printing, the keyboard; and starting up.
   ===================================================================== */
const $ = id => document.getElementById(id);
const desk = $('desk'), zoomer = $('zoomer'), host = $('pagehost'), sizer = $('sizer');
const AUTOSAVE = 'oo-print-builder:autosave', SHOWKEY = 'oo-print-builder:show';
let zoom = 1, spaceDown = false, pan = null, pageFor = null;
const say = s => { $('hint').textContent = s || hintFor(); };
const hintFor = () => ({
  select: 'Click to pick · drag to move · drag empty paper to pick several · R turns · F flips · Delete deletes',
  wire: 'Click to start · click to bend · click a terminal, rail or wire to finish · Esc stops',
  rung: 'Click between the rails to add a rung, then drop symbols onto it',
  note: 'Click where the note goes',
  place: 'Click on a rung to put it in the wire · Shift+click to put down more · R turns it · F flips it · Esc stops',
})[tool] || '';

/* ---------- drawing it all ---------- */
function refresh(full = false) {
  S = doc.sheets[doc.cur];
  A = analyse(); ISSUES = checkPrint(A);
  const key = JSON.stringify([doc.tb, doc.cur, doc.sheets.length, S.land, S.id, paperIn(S)]);
  if (full || key !== pageFor || !svg) buildPage(key); else drawInk();
  drawEd(); renderProps(); renderChecks(); renderTabs(); updateButtons(); autosave();
}
function buildPage(key) {
  host.innerHTML = pageHTML(S, doc.cur, A, true); pageFor = key;
  svg = $('sv'); VB = fitDraw(host.firstElementChild);
  svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove); svg.addEventListener('pointerup', onUp);
  // (the grey round the paper: a drag there starts a selection box as on the paper, as in Circuit Builder; middle or Space+drag pans)
  if (!zoomer.dataset.off) { zoomer.dataset.off = '1'; zoomer.addEventListener('pointerdown', e => {
    // (a press on the paper itself is the paper's own, even when what was under it was redrawn as it went)
    if (e.composedPath().includes(svg) || e.target.closest('button, input')) return;
    if (e.button === 1 || (e.button === 0 && spaceDown)) return onDown(e);
    if (e.button === 0 && tool === 'select') onDown(e);
  }); }
  svg.addEventListener('pointerleave', () => { cursor = null; $('tip').hidden = true; if (!drag) drawEd(); });
  svg.addEventListener('dblclick', e => { const h = pick(sheetPt(e));
    if (tool === 'select' && h && (h.kind === 'link' || h.kind === 'linkend')) { const o = partOf(S, h.id); if (o && o.lk) { snapshot(); delete o.lk; selL = h.id; refresh(); say('Dashed link put back as it was drawn.'); } return; }
    if (tool === 'select' && h && h.kind === 'text') focusProp('note-text'); else if (tool === 'select' && h && h.kind === 'part') focusProp('p-tag'); });
  svg.setAttribute('class', 'tool-' + tool);
  applyZoom();
}
function drawInk() { svg.querySelector('g.ink').innerHTML = drawSheet(S, doc.cur, A); }
function updateButtons() {
  $('undo-btn').disabled = !UNDO.length; $('redo-btn').disabled = !REDO.length;
  const any = [...sel].some(id => { const p = partOf(S, id); return p ? p.t !== 'rail' : true; });
  $('copy-btn').disabled = $('cut-btn').disabled = !any; $('org-btn').disabled = !rungsPicked().length; $('del-btn').disabled = !sel.size && !selW; $('paste-btn').disabled = !hasClip();
  // (the Orientation menu ticks the way this sheet is round now; the button's icon shows it too)
  for (const b of document.querySelectorAll('#orient-menu [data-land]')) b.setAttribute('aria-checked', String(!!S.land === (b.dataset.land === '1')));
  const oi = $('orient-ic'); if (S.land) { oi.setAttribute('x', 3); oi.setAttribute('y', 6); oi.setAttribute('width', 18); oi.setAttribute('height', 12); } else { oi.setAttribute('x', 6); oi.setAttribute('y', 3); oi.setAttribute('width', 12); oi.setAttribute('height', 18); }
  $('pageinfo').textContent = `${paperName(S)} · ${S.land ? 'Landscape' : 'Portrait'}`;
  for (const b of document.querySelectorAll('#paper-menu [data-paper]')) b.setAttribute('aria-checked', String(b.dataset.paper === paperKey(S))); $('paper-cust').textContent = paperKey(S) === 'custom' ? paperName(S) : '';
  const n = ISSUES.filter(i => i.sev !== 'ok').length;
  for (const b of [$('check-badge'), $('tab-badge')]) { b.hidden = !n; b.textContent = n; b.className = 'badge' + (ISSUES.some(i => i.sev === 'e') ? '' : ' w'); }
  $('ring-chk').checked = checkOn;
  $('check-sum').textContent = n ? `${n} thing${n > 1 ? 's' : ''} to look at · click one to go to it` : 'Nothing to fix';
  $('check-btn').setAttribute('aria-pressed', checkOn);
  for (const x of document.querySelectorAll('[data-tool]')) x.setAttribute('aria-pressed', x.dataset.tool === tool);
  for (const x of document.querySelectorAll('.pt')) x.classList.toggle('on', tool === 'place' && placing && x.dataset.t === placing.t);
}
function setTool(t) {
  tool = t; wd = null; if (t !== 'place') placing = null;
  if (svg) svg.setAttribute('class', 'tool-' + t);
  $('tip').hidden = true; say(); updateButtons(); drawEd();
}
function startPlacing(t) { placing = { t, rot: 0 }; sel = new Set(); selW = null; setTool('place'); renderProps(); }

/* ---------- the palette and the ribbon's menus ---------- */
const thumb = t => { if (isArrowIn(t)) return `<svg viewBox="-80 -30 100 60"><path d="M-22 -13L-22 13L0 0Z" fill="#000"/><line x1="0" y1="0" x2="18" y2="0" stroke="#000" stroke-width="4"/><text x="-30" y="9" font-size="26" font-weight="700" text-anchor="end" font-family="Arial">${t === 'src_l2' ? 'L2' : 'L1'}</text></svg>`;
  const s = PSYM[LIB[t].sym], e = extentOf(t), pad = 8; return `<svg viewBox="${e.x0 - pad} ${s.y0 - pad} ${e.x1 - e.x0 + 2 * pad} ${s.y1 - s.y0 + 2 * pad}"><g fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${s.b}</g></svg>`; };
const short = n => n.replace(' Maintained Pushbutton', ' Maint. PB').replace(', Low Temp', ' (Low)').replace(' (Control)', '').replace(' (Out)', '').replace(' (In)', '').replace('Pushbutton', 'PB').replace('Emergency Stop', 'E-Stop').replace('Temperature', 'Temp.').replace('Proximity', 'Prox.').replace('Selector Switch', 'Selector').replace(', Held Closed', ' (HC)').replace(', Held Open', ' (HO)').replace('Toggle Switch (SPST)', 'Toggle').replace('Overload Heater (1 Line)', 'OL Heater').replace('Phase (L1, L2, L3)', 'Phase').replace('3-Phase', '3Ø');
function buildPalette() {
  let h = '';
  for (const c of CATS) { h += `<div class="ph">${c}</div><div class="pg">`;
    for (const [t, d] of Object.entries(LIB)) if (d.cat === c && !d.hide) h += `<div class="pt" data-t="${t}" title="${esc(d.name)}">${thumb(t)}<span>${esc(short(d.name))}</span></div>`;
    h += '</div>'; }
  $('palette').innerHTML = '<div class="pal-top"><span>Parts</span><button id="pal-hide" title="Hide the parts list (the » on the left brings it back)">« Hide</button></div>' + h;
  $('pal-hide').addEventListener('click', () => setPalette(null, true));
  for (const el of document.querySelectorAll('.pt')) el.addEventListener('pointerdown', e => {
    e.preventDefault(); const t = el.dataset.t, x0 = e.clientX, y0 = e.clientY; startPlacing(t);
    // dragged out onto the sheet: put down where it is let go; just clicked: put in view, in a clear spot (as in Circuit Builder)
    const up = ev => { window.removeEventListener('pointerup', up);
      const r = svg.getBoundingClientRect(), onSheet = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (onSheet && tool === 'place') putDown(sheetPt(ev), ev.shiftKey);
      else if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8 && tool === 'place') placeInView(t); };
    window.addEventListener('pointerup', up);
  });
  let m = '';
  for (const c of CATS) { m += `<div class="menuwrap"><button class="rb" data-menu="${c}"><span class="sw" style="border-color:${CAT_COL[c]}"></span><span>${c} ▾</span></button><div class="dmenu" hidden>`;
    const item = (t, d) => `<button data-t="${t}">${thumb(t).replace('<svg', '<svg style="width:46px;height:26px;background:#f4f5f6;border-radius:4px;padding:2px"')}${esc(d.name)}</button>`;
    const subs = new Map(), done = new Set();
    for (const [t, d] of Object.entries(LIB)) if (d.cat === c && !d.hide && subOf(t)) { const g = subOf(t); if (!subs.has(g)) subs.set(g, []); subs.get(g).push(t); }
    for (const [t, d] of Object.entries(LIB)) if (d.cat === c && !d.hide) {
      const g = subOf(t);
      if (!g) { m += item(t, d); continue; }
      if (done.has(g)) continue; done.add(g);
      // a kind with several parts: one line, its parts in a menu that flies out beside it
      const ts = subs.get(g);
      m += `<div class="subwrap"><button class="sub-row" aria-haspopup="true" aria-expanded="false">${thumb(ts[0]).replace('<svg', '<svg style="width:46px;height:26px;background:#f4f5f6;border-radius:4px;padding:2px"')}${esc(g)}<span class="sub-n">${ts.length}</span><span class="sub-ar">▸</span></button><div class="dmenu fly" hidden>${ts.map(x => item(x, LIB[x])).join('')}</div></div>`;
    }
    m += '</div></div>'; }
  $('sym-menus').innerHTML = m;
  // the fly-outs: resting on a kind (or clicking it) opens its parts beside it; the menu's other kinds close
  for (const r of document.querySelectorAll('#sym-menus .sub-row')) {
    const fly = r.nextElementSibling, menu = r.closest('.dmenu');
    const open = () => { for (const o of menu.querySelectorAll('.fly')) if (o !== fly) { o.hidden = true; o.previousElementSibling.setAttribute('aria-expanded', 'false'); o.previousElementSibling.classList.remove('on'); }
      if (!fly.hidden) return; fly.hidden = false; r.setAttribute('aria-expanded', 'true'); r.classList.add('on');
      // beside the row: on its right, or its left if the window ends first; kept inside the window top to bottom
      fly.style.left = '100%'; fly.style.right = 'auto'; fly.style.top = (r.offsetTop - 7) + 'px';
      const b = fly.getBoundingClientRect(); if (b.right > innerWidth - 6) { fly.style.left = 'auto'; fly.style.right = '100%'; }
      const z = uiZoom(), over = b.bottom - (innerHeight - 6); if (over > 0) fly.style.top = (r.offsetTop - 7 - over / z) + 'px'; };
    let t0 = null;
    r.addEventListener('pointerenter', () => { clearTimeout(t0); t0 = setTimeout(open, 120); });
    r.addEventListener('pointerleave', () => clearTimeout(t0));
    r.addEventListener('click', e => { e.stopPropagation(); clearTimeout(t0); open(); const f = fly.querySelector('button'); if (e.detail === 0 && f) f.focus(); });
    r.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); open(); fly.querySelector('button').focus(); } });
    fly.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fly.hidden = true; r.classList.remove('on'); r.setAttribute('aria-expanded', 'false'); r.focus(); } });
  }
  // (a part with no kind of its own in the menu closes any open fly-out when the pointer rests on it)
  for (const b of document.querySelectorAll('#sym-menus .dmenu:not(.fly) > button[data-t]')) b.addEventListener('pointerenter', () => { for (const o of b.parentElement.querySelectorAll('.fly')) { o.hidden = true; o.previousElementSibling.classList.remove('on'); } });
  for (const b of document.querySelectorAll('[data-menu]')) b.addEventListener('click', e => { e.stopPropagation(); const d = b.nextElementSibling, open = d.hidden; closeMenus(); d.hidden = !open; if (open) { const r = b.getBoundingClientRect(); const z = uiZoom(); d.style.position = 'fixed'; d.style.left = r.left / z + 'px'; d.style.top = (r.bottom + 6) / z + 'px'; } });
  for (const b of document.querySelectorAll('#sym-menus .dmenu button[data-t]')) b.addEventListener('click', () => { closeMenus(); placeInView(b.dataset.t); });
}
// a part put straight onto the sheet, in the middle of what is in view, at the nearest spot clear of the other symbols,
// their names and the wires (so it never lands in a wire); it comes picked, ready to drag where it goes
function placeInView(t) {
  placing = null; setTool('select');
  const r = zoomer.getBoundingClientRect(), m = svg.getScreenCTM().inverse(), toS = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  const [ax, ay] = toS(r.left + 40, r.top + 40), [bx, by] = toS(r.right - 40, r.bottom - 40), D = { x0: 40, y0: 60, x1: drawW(S) - 40, y1: drawH(S) - 40 };
  const lo = [Math.max(ax, D.x0), Math.max(ay, D.y0)], hi = [Math.min(bx, D.x1), Math.min(by, D.y1)], c = [snap((lo[0] + hi[0]) / 2), snap((lo[1] + hi[1]) / 2)];
  const boxes = S.parts.map(partBox), segs = S.wires.flatMap(w => { const P = wirePts(S, w); return P.slice(1).map((b, i) => [P[i], b]); });
  const free = (x, y) => { const b = partBox({ t, x, y, rot: 0 }); b.x0 -= 20; b.x1 += 20; b.y0 -= 10; b.y1 += 20;
    if (b.x0 < D.x0 || b.x1 > D.x1 || b.y0 < D.y0 || b.y1 > D.y1) return false;
    return !boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) && !segs.some(([a, q]) => Math.max(a[0], q[0]) >= b.x0 && Math.min(a[0], q[0]) <= b.x1 && Math.max(a[1], q[1]) >= b.y0 && Math.min(a[1], q[1]) <= b.y1); };
  let at = null;
  for (let ring = 0; ring <= 40 && !at; ring++) for (let i = -ring; i <= ring && !at; i++) for (const [dx, dy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) { const x = c[0] + dx * 2 * G, y = c[1] + dy * 2 * G; if (free(x, y)) { at = [x, y]; break; } }
  at ||= c;
  snapshot(); const p = addPart(S, t, at[0], at[1]);
  sel = new Set([p.id]); selW = null; keepTab = true; refresh(); keepTab = false;
  const sr = svg.getScreenCTM(), sx = sr.a * at[0] + sr.e, sy = sr.d * at[1] + sr.f; if (sx < r.left || sx > r.right || sy < r.top || sy > r.bottom) showPoint(at[0], at[1]);
  say(`${LIB[t].name} added${p.tag ? ' as ' + p.tag : ''}. Drag it into place, onto a wire to put it in the wire.`);
}
// the parts list's width (dragged at its edge) and whether it is hidden: kept for next time
const PALKEY = 'oo-print-builder:palette', PAL_MIN = 150, PAL_MAX = 560;
let palW = 224, palHidden = false;
function setPalette(w, hidden) {
  if (w != null) palW = Math.max(PAL_MIN, Math.min(PAL_MAX, Math.round(w)));
  if (hidden != null) palHidden = hidden;
  const mid = document.querySelector('.mid'); mid.style.setProperty('--palw', palW + 'px'); mid.classList.toggle('palhide', palHidden); $('pal-show').hidden = !palHidden;
  try { localStorage.setItem(PALKEY, JSON.stringify({ w: palW, hidden: palHidden })); } catch (_) {}
}
function palGrip() {
  const g = $('pal-grip');
  g.addEventListener('pointerdown', e => {
    if (palHidden || e.target.id === 'pal-show') return; e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add('drag');
    const left = document.querySelector('.mid').getBoundingClientRect().left, z = uiZoom();
    const mv = ev => { const w = (ev.clientX - left) / z; if (w < PAL_MIN - 60) setPalette(null, true); else setPalette(w, false); };
    const up = () => { g.classList.remove('drag'); g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); };
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
  });
  g.addEventListener('dblclick', () => { if (!palHidden) setPalette(224, false); });
  $('pal-show').addEventListener('click', () => setPalette(null, false));
  try { const v = JSON.parse(localStorage.getItem(PALKEY) || 'null'); if (v) setPalette(v.w, !!v.hidden); } catch (_) {}
}
// the interface's size: kept for next time
const UIKEY = 'oo-print-builder:ui-size';
const uiZoom = () => parseFloat(getComputedStyle(document.querySelector('.app')).getPropertyValue('--uiz')) || 1;
function setUiSize(v) { document.querySelector('.app').style.setProperty('--uiz', v); $('ui-size').value = String(v); try { localStorage.setItem(UIKEY, String(v)); } catch (_) {} if (svg) applyZoom(); }
const closeMenus = () => { for (const d of document.querySelectorAll('.dmenu')) d.hidden = true; };
document.addEventListener('click', e => { if (!e.target.closest('.menuwrap')) closeMenus(); });
// a press anywhere outside an open menu closes it, on the sheet too (where the press then does nothing else, so
// closing a menu never picks or moves a part); Esc, or leaving the window, closes it as well
const menuOpen = () => [...document.querySelectorAll('.dmenu')].some(d => !d.hidden);
document.addEventListener('pointerdown', e => { if (!menuOpen() || e.target.closest('.menuwrap')) return; closeMenus(); if (e.target.closest('#desk')) { e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen()) { closeMenus(); e.stopPropagation(); } }, true);
window.addEventListener('blur', closeMenus);

/* ---------- properties ---------- */
function focusProp(id) { setTimeout(() => { const el = $(id); if (el) { el.focus(); el.select && el.select(); } }, 0); }
let editing = false;   // (one undo step for a run of typing in one box)
const edit = fn => { if (!editing) { snapshot(); editing = true; } fn(); A = analyse(); ISSUES = checkPrint(A); drawInk(); drawEd(); renderChecks(); updateButtons(); autosave(); };
/* ---------- the ribbon's tabs ---------- */
let ribTab = 'home', lastSelKey = '', keepTab = false;
function setRib(t) {
  ribTab = t;
  $('ribbon').hidden = t !== 'home'; $('rp-part').hidden = t !== 'part'; $('rp-check').hidden = t !== 'check';
  for (const [b, k] of [['rt-home', 'home'], ['rt-part', 'part'], ['rt-check', 'check']]) $(b).setAttribute('aria-pressed', String(t === k));
}
// the gold Part tab: there while something is picked, and opened when something new is picked (as in Circuit Builder)
function partTab(title) {
  const has = !!title, key = has ? [...sel].join() + '|' + (selW || '') : '';
  $('rt-part').hidden = !has; if (has) $('rt-part').textContent = 'Part: ' + title;
  if (has && key !== lastSelKey && !keepTab) setRib('part');
  if (!has && ribTab === 'part') setRib('home');
  lastSelKey = key;
}
function renderProps() { renderProps0(); const h = $('props').querySelector('h4'); partTab(tool === 'place' || !h || /^Drawing the Print/.test(h.textContent) ? '' : h.textContent); }
function renderProps0() {
  const P = $('props'); editing = false;
  const ids = [...sel], one = ids.length === 1 ? ids[0] : null, p = one && partOf(S, one), t = one && S.texts.find(x => x.id === one), w = selW && S.wires.find(x => x.id === selW);
  if (tool === 'place' && placing) {
    const d = LIB[placing.t];
    P.innerHTML = `<h4>Putting down: ${esc(d.name)}</h4><p class="help">Click on a rung (or drag it from the palette) and it goes into the wire there. Its tag comes next: <b>${esc(placing.t === 'coil' ? nextTag('CR') : defaultTag(placing.t) || '(its coil’s)')}</b>.<br><kbd>R</kbd> turns it · <kbd>Shift</kbd>+click puts down more · <kbd>Esc</kbd> stops.</p>`;
    return;
  }
  if (p && p.t === 'rail') {
    P.innerHTML = `<h4>Rail ${esc(p.label)}</h4><p class="help">Control ${p.label} (wire ${p.label === 'L1' ? 1 : 2}${A.n1 != null && p.label === 'L1' && doc.sheets.some(s => s.parts.some(q => q.t === 'xfmr')) ? ', from the transformer’s X1' : ''}). Drag its ends to lengthen it; drag it to move it (its rungs stay on it).</p><div class="acts"><button class="btn del" id="p-del">Delete</button></div>`;
  } else if (p) {
    const d = LIB[p.t], k = d.kind, coils = [...new Set(allParts().filter(x => LIB[x.p.t].kind === 'coil').map(x => x.p.tag).filter(Boolean))];
    const ols = [...new Set(allParts().filter(x => LIB[x.p.t].kind === 'ol').map(x => x.p.tag).filter(Boolean))];
    const list = k === 'contact' || k === 'starter' ? coils : k === 'olc' ? ols : [];
    const rn = A.rung.get(p.id), xr = A.xref.get(p.id);
    const termNums = [...Array(termsN(p)).keys()].map(i => A.label.get(A.rootT(p, S, i))).filter(Boolean);
    P.innerHTML = `<h4>${esc(d.name)}${p.tag ? ' ' + esc(p.t === 'fus3' ? tagsOf(p)[0] + '–' + tagsOf(p)[2] : p.tag) : ''}</h4>
      ${p.t === 'src_l1' || p.t === 'src_l2' ? '' : p.t === 'sup' ? `<div class="f">Line<div class="seg">${['L1', 'L2', 'L3'].map(l => `<button data-line="${l}" aria-pressed="${p.tag === l}">${l}</button>`).join('')}</div></div>` : `
      ${k === 'contact' || k === 'starter' || k === 'olc' ? `<div class="f">Worked by<select id="p-of">${[...new Set([...list, p.tag].filter(Boolean))].map(x => `<option value="${esc(x)}"${x === p.tag ? ' selected' : ''}>${esc(x)}${list.includes(x) ? '' : ' (no ' + (k === 'olc' ? 'overload' : 'coil') + ' yet)'}</option>`).join('')}${list.length || p.tag ? '' : `<option value="">(place a ${k === 'olc' ? 'overload' : 'coil'} first)</option>`}<option value="__other">Other…</option></select></div>`
        : `<div class="f">${k === 'coil' || k === 'sw' || k === 'cont' ? 'Letter' : 'Number'}<input class="in" id="p-tag" value="${esc(p.tag)}" autocomplete="off"></div>`}`}
      ${p.t === 'fdsc3' ? `<div class="f">Fuses<input class="in" id="p-fu" value="${esc(p.fu || '')}" autocomplete="off" title="The first of its three fuses: FU1 makes them FU1, FU2, FU3"></div><div class="f">&nbsp;<span class="ro">${esc(tagsOf(p).slice(1).join(', '))}</span></div>` : ''}
      ${k === 'coil' && /^TR/.test(p.tag || '') ? `<div class="f">Delay<div class="seg"><button data-tof="0" aria-pressed="${!p.tof}">On-Delay</button><button data-tof="1" aria-pressed="${!!p.tof}">Off-Delay</button></div></div><div class="f">Seconds<input class="in" id="p-delay" type="number" min="0" step="0.5" value="${esc(p.delay ?? '')}" style="min-width:80px;width:90px"></div>` : ''}
      ${/^(con|tc)_n[oc]$/.test(p.t) && (timerOf(p) || p.t.startsWith('tc')) ? `<div class="f">Contact Type<div class="seg"><button data-ctype="tc" aria-pressed="${p.t.startsWith('tc')}">Timed</button><button data-ctype="con" aria-pressed="${p.t.startsWith('con')}">Instant</button></div></div>` : ''}
      ${p.t === 'sel' ? `<div class="f">Positions<input class="in" id="p-pos" value="${esc(selNames(p).join('/'))}" title="2 to 4 positions, with slashes: HAND/OFF/AUTO"></div><div class="f">Closed In<div class="seg">${selNames(p).map((n, i) => `<button data-cl="${i}" aria-pressed="${(p.closedIn || []).includes(i)}">${esc(n)}</button>`).join('')}</div></div>` : ''}
      ${p.t === 'pl' ? `<div class="f">Built Into<select id="p-inpb"><option value="">None (a light of its own)</option>${[...new Set(allParts().filter(q => isPB(q.p) && q.p.tag).map(q => q.p.tag).concat(p.inPB ? [p.inPB] : []))].map(t => `<option value="${esc(t)}"${t === p.inPB ? ' selected' : ''}>${esc(t)} (lighted pushbutton)</option>`).join('')}</select></div>` : ''}
      ${isPB(p) || p.t === 'sel' ? `<p class="help">${blocksOf(p).length > 1 ? (mainBlock(p) === p ? `The main one of ${blocksOf(p).length} blocks of ${esc(p.tag)}` : `An extra contact block of ${esc(p.tag)}`) + ': they work together.' : `To give it another contact block on another rung, put down another ${p.t === 'sel' ? 'selector' : 'pushbutton'} and give it the same number (${esc(p.tag)}).`}</p>` : ''}
      ${k === 'coil' ? `<div class="f">Kind<select id="p-pre">${COIL_PRE.map(([v, n]) => `<option value="${v}"${(p.pre || 'CR') === v ? ' selected' : ''}>${n} (${v})</option>`).join('')}</select></div>` : ''}
      ${k === 'cont' ? `<div class="f">Direction<div class="seg"><button data-flip="cnt_out" aria-pressed="${p.t === 'cnt_out'}">Continues To</button><button data-flip="cnt_in" aria-pressed="${p.t === 'cnt_in'}">Continued From</button></div></div><p class="help">Give the arrow where the wire leaves off and the arrow where it picks up the same letter: they are one wire, numbered alike, and each says where the other is.</p>` : ''}
      ${d.flip && k !== 'cont' ? `<div class="f">Contact<div class="seg"><button data-flip="${/_no$|_hc$/.test(p.t) ? p.t : d.flip}" aria-pressed="${/_no$|_hc$/.test(p.t)}">${/_h[co]$/.test(p.t) ? 'NO (HC)' : 'NO'}</button><button data-flip="${/_nc$|_ho$/.test(p.t) ? p.t : d.flip}" aria-pressed="${/_nc$|_ho$/.test(p.t)}">${/_h[co]$/.test(p.t) ? 'NC (HO)' : 'NC'}</button></div></div>` : ''}
      ${p.t !== 'sup' ? `<div class="f">Label<input class="in" id="p-desc" value="${esc(p.desc)}" placeholder="${k === 'load' && p.t === 'pl' ? 'e.g. RED' : 'e.g. HIGH TEMP'}"></div>` : ''}
      ${rn ? `<div class="f">Rung<span class="ro">${rn} (automatic)</span></div>` : ''}
      ${termNums.length ? `<div class="f">Wires<span class="ro">${termNums.join(' → ')} (automatic)</span></div>` : ''}
      ${xr && xr.length ? `<div class="f">Contacts on<span class="ro">${xr.map(o => o.n + (o.nc ? ' (NC)' : '')).join(', ')}</span></div>` : ''}
      <div class="acts">${canTurn(p) ? '<button class="btn" id="p-rot">Rotate (R)</button>' : ''}${canFlip(p) ? `<button class="btn" id="p-flip" aria-pressed="${!!p.fx}" title="Flip it left to right, about its middle (F); again to put it back">Flip ⇆ (F)</button>` : ''}${p.lt || p.ld || p.lf ? '<button class="btn" id="p-lab">Put Labels Back</button>' : ''}<button class="btn del" id="p-del">Delete</button></div>`;
    const of = $('p-of'); if (of) of.addEventListener('change', () => { let v = of.value; if (v === '__other') { v = (prompt(k === 'olc' ? 'The overload this contact belongs to (e.g. OL2):' : 'The coil that works this contact (e.g. CR3):', p.tag || '') || '').trim().toUpperCase(); if (!v) { renderProps(); return; } }
      snapshot(); p.tag = v; refresh(); });
    const tg = $('p-tag'); let was = p.tag;
    if (tg) tg.addEventListener('focus', () => { was = p.tag; });
    if (tg) tg.addEventListener('input', () => edit(() => { p.tag = tg.value.trim().toUpperCase(); if (k === 'coil') lastCoil = p.tag; }));
    // (renamed: its contacts go with it, as in Circuit Builder; part of the same undo step as the typing)
    if (tg) tg.addEventListener('change', () => { const n = followRename(p, was, p.tag); was = p.tag; if (n) { A = analyse(); ISSUES = checkPrint(A); drawInk(); drawEd(); renderChecks(); autosave(); } renderProps(); if (n) say(n); });
    const pl = $('p-lab'); if (pl) pl.addEventListener('click', () => { snapshot(); delete p.lt; delete p.ld; delete p.lf; refresh(); });
    const fu = $('p-fu'); if (fu) { fu.addEventListener('input', () => edit(() => { p.fu = fu.value.trim().toUpperCase(); })); fu.addEventListener('change', () => renderProps()); }
    const ds = $('p-desc'); if (ds) ds.addEventListener('input', () => edit(() => { p.desc = ds.value.toUpperCase(); }));
    for (const b of P.querySelectorAll('[data-tof]')) b.addEventListener('click', () => { snapshot(); p.tof = b.dataset.tof === '1'; if (!p.tof) delete p.tof; refresh(); });
    const dl = $('p-delay'); if (dl) dl.addEventListener('input', () => edit(() => { const v = parseFloat(dl.value); if (isFinite(v) && v >= 0) p.delay = v; else delete p.delay; }));
    for (const b of P.querySelectorAll('[data-ctype]')) b.addEventListener('click', () => { snapshot(); p.t = b.dataset.ctype + '_' + p.t.split('_')[1]; delete p.inst; refresh(); });
    const ps = $('p-pos'); if (ps) ps.addEventListener('change', () => { snapshot(); const n = ps.value.split(/[\/,]+/).map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 4); p.pos = (n.length >= 2 ? n : ['OFF', 'ON']).join('/'); p.closedIn = (p.closedIn || []).filter(i => i < n.length); refresh(); });
    for (const b of P.querySelectorAll('[data-cl]')) b.addEventListener('click', () => { snapshot(); const i = +b.dataset.cl, s = new Set(p.closedIn || []); s.has(i) ? s.delete(i) : s.add(i); p.closedIn = [...s].sort(); refresh(); });
    const ib = $('p-inpb'); if (ib) ib.addEventListener('change', () => { snapshot(); if (ib.value) p.inPB = ib.value; else delete p.inPB; refresh(); });
    const pr = $('p-pre'); if (pr) pr.addEventListener('change', () => { snapshot(); const old = p.tag; p.pre = pr.value; p.tag = ''; p.tag = nextTag(p.pre); lastCoil = p.tag; const n = followRename(p, old, p.tag); refresh(); if (n) say(n); });
    for (const b of P.querySelectorAll('[data-flip]')) b.addEventListener('click', () => { if (b.dataset.flip === p.t) return; snapshot(); p.t = b.dataset.flip; refresh(); });
    for (const b of P.querySelectorAll('[data-line]')) b.addEventListener('click', () => { snapshot(); p.tag = b.dataset.line; refresh(); });
    const ro = $('p-rot'); if (ro) ro.addEventListener('click', () => { snapshot(); rotateParts(S, new Set([p.id])); refresh(); });
    const fl = $('p-flip'); if (fl) fl.addEventListener('click', () => { snapshot(); flipParts(S, new Set([p.id])); refresh(); });
  } else if (t) {
    P.innerHTML = `<h4>Note</h4><textarea id="note-text" rows="4">${esc(t.s)}</textarea>
      <div class="f" style="margin-top:8px">Size<div class="seg">${[[20, 'Small'], [24, 'Medium'], [32, 'Large']].map(([z, n]) => `<button data-size="${z}" aria-pressed="${(t.size || 24) === z}">${n}</button>`).join('')}</div></div>
      <div class="f">Bold<div class="seg"><button data-bold="0" aria-pressed="${!t.bold}">No</button><button data-bold="1" aria-pressed="${!!t.bold}">Yes</button></div></div>
      <div class="acts"><button class="btn del" id="p-del">Delete</button></div>`;
    $('note-text').addEventListener('input', e => edit(() => { t.s = e.target.value; }));
    for (const b of P.querySelectorAll('[data-size]')) b.addEventListener('click', () => { snapshot(); t.size = +b.dataset.size; refresh(); });
    for (const b of P.querySelectorAll('[data-bold]')) b.addEventListener('click', () => { snapshot(); t.bold = b.dataset.bold === '1'; refresh(); });
  } else if (w) {
    const r = A.wireRoot(S, w), auto = A.label.get(r), net = (A.WIRED.get(r) || []).length;
    P.innerHTML = `<h4>Wire ${esc(auto || '')}</h4>
      <div class="f">Number<input class="in" id="w-num" value="${esc(w.num || '')}" placeholder="${esc(w.num ? '' : auto || '')} (automatic)"></div>
      <p class="help">${net > 1 ? `${net} wire pieces are joined here; they all take this number.` : 'Numbered automatically.'} Type a number to fix it yourself; clear it to go back to automatic.</p>
      <div class="f">On the Print<div class="seg"><button data-wshow="1" aria-pressed="${!w.hideNum}">Shown</button><button data-wshow="0" aria-pressed="${!!w.hideNum}">Hidden</button></div></div>
      <p class="help">Drag the number on the sheet to move it.${w.lab ? '' : ' It finds a clear spot by itself until you do.'}</p>
      <div class="acts">${w.lab ? '<button class="btn" id="w-auto">Put Number Back</button>' : ''}<button class="btn del" id="p-del">Delete Wire</button></div>`;
    for (const b of P.querySelectorAll('[data-wshow]')) b.addEventListener('click', () => { snapshot(); const hide = b.dataset.wshow === '0'; for (const o of runWires(w)) { if (hide) o.hideNum = true; else delete o.hideNum; } refresh(); });
    const wa = $('w-auto'); if (wa) wa.addEventListener('click', () => { snapshot(); for (const o of runWires(w)) delete o.lab; refresh(); });
    $('w-num').addEventListener('input', e => edit(() => { const v = e.target.value.trim().toUpperCase(); for (const o of A.WIRED.get(r) || []) delete o.w.num; if (v) w.num = v; }));
  } else if (ids.length > 1 && multiParts(ids)) {
    renderMulti(P, multiParts(ids));
  } else if (selL && !ids.length && !w) {
    const o = partOf(S, selL), L = o && LINKS.find(x => x.own.id === selL);
    P.innerHTML = `<h4>Dashed Link${L ? ': ' + esc(L.kind === 'light' ? (L.a.tag || 'PB') + ' to ' + (L.b.tag || 'PL') : (L.a.tag || '') + ' blocks') : ''}</h4>
      <p class="help">${L && L.kind === 'light' ? 'Joins a lighted pushbutton to its light.' : 'Joins the contact blocks of one device.'} Drag a run to move it; drag an end’s dot round the symbol to fasten it to another side; double-click it to put it back.</p>
      <div class="acts">${o && o.lk ? '<button class="btn" id="lk-back">Put Link Back</button>' : ''}</div>`;
    const lb = $('lk-back'); if (lb) lb.addEventListener('click', () => { snapshot(); delete o.lk; refresh(); });
  } else if (ids.length > 1) {
    P.innerHTML = `<h4>${ids.length} things picked</h4><p class="help">Drag any of them to move them together. <kbd>R</kbd> turns the symbols; <kbd>Delete</kbd> deletes them all.</p><div class="acts"><button class="btn del" id="p-del">Delete</button></div>`;
  } else {
    P.innerHTML = `<h4>Drawing the Print</h4><p class="help"><b>1.</b> Drag a symbol from the left onto a rung: it goes into the wire.<br><b>2.</b> <b>Rung</b> adds a rung between the rails; <b>Wire</b> draws branches and the power circuit.<br><b>3.</b> Pick a symbol to set its number or letter, NO/NC, what works it, and its label.<br><b>4.</b> Wire numbers, rung numbers and cross-references fill in by themselves.<br><b>5.</b> <b>Check Print</b> rings what needs fixing.</p>`;
  }
  const del = $('p-del'); if (del) del.addEventListener('click', removeSelection);
}
function removeSelection() {
  if (!sel.size && !selW) return;
  snapshot();
  for (const id of sel) { if (partOf(S, id)) removePart(S, id); else if (nodeOf(S, id)) { S.wires = S.wires.filter(w => !(w.a.n === id || w.b.n === id)); S.nodes = S.nodes.filter(n => n.id !== id); tidy(S); } else S.texts = S.texts.filter(t => t.id !== id); }
  if (selW) removeWire(S, selW);
  sel = new Set(); selW = null; refresh();
}

/* ---------- Check Print ---------- */
function renderChecks() {
  $('check-list').innerHTML = ISSUES.map((is, i) => `<div class="is${is.sev === 'ok' ? ' okk' : ''}" data-i="${i}"><span class="dot ${is.sev}">${is.sev === 'e' ? '!' : is.sev === 'w' ? '?' : '✓'}</span><div>${esc(is.title)}${is.detail ? `<small>${esc(is.detail)}</small>` : ''}</div></div>`).join('');
  for (const el of document.querySelectorAll('.is[data-i]')) el.addEventListener('click', () => {
    const is = ISSUES[+el.dataset.i]; if (!is.at.length) return;
    checkOn = true; const a = is.at[0]; if (a.k !== doc.cur) { doc.cur = a.k; }
    S = doc.sheets[doc.cur]; sel = new Set(is.at.filter(x => x.k === doc.cur && (partOf(S, x.id) || nodeOf(S, x.id))).map(x => x.id));
    selW = is.at.find(x => S.wires.some(w => w.id === x.id))?.id || null;
    keepTab = true; refresh(); keepTab = false; showPoint(a.x, a.y);
  });
}
// the view scrolled to put a point on the sheet in the middle
function showPoint(x, y) { const r = svg.getBoundingClientRect(), m = svg.getScreenCTM(), sx = m.a * x + m.e, sy = m.d * y + m.f, dr = zoomer.getBoundingClientRect();
  zoomer.scrollLeft += sx - (dr.left + dr.width / 2); zoomer.scrollTop += sy - (dr.top + dr.height / 2); }

/* ---------- sheets ---------- */
function renderTabs() {
  $('tabs').innerHTML = doc.sheets.map((s, k) => `<button class="tab" data-k="${k}" aria-selected="${k === doc.cur}">Sheet ${k + 1}${doc.sheets.length > 1 && k === doc.cur ? '<span class="x" data-del="1" title="Take this sheet away">×</span>' : ''}</button>`).join('');
  for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', e => {
    const k = +b.dataset.k;
    if (e.target.dataset.del) { if (!confirm(`Take Sheet ${k + 1} away, and everything on it?`)) return; snapshot(); doc.sheets.splice(k, 1); doc.cur = Math.max(0, Math.min(doc.cur, doc.sheets.length - 1)); }
    else doc.cur = k;
    sel = new Set(); selW = null; refresh(); fitZoom();
  });
}
$('addsheet-btn').addEventListener('click', () => { snapshot(); doc.sheets.push(newSheet(true, S.land, S.paper === 'custom' ? { w: S.pw, h: S.ph } : paperKey(S))); doc.cur = doc.sheets.length - 1; sel = new Set(); selW = null; refresh(); fitZoom(); });
for (const b of document.querySelectorAll('#orient-menu [data-land]')) b.addEventListener('click', () => { closeMenus(); setOrient(b.dataset.land === '1'); });
for (const b of document.querySelectorAll('#paper-menu [data-paper]')) b.addEventListener('click', () => { closeMenus(); if (b.dataset.paper === 'custom') openCustomPaper(); else setPaper(b.dataset.paper); });
// a size of your own: width and height, in inches or millimetres (4 to 48 in), for this sheet
function openCustomPaper() {
  const [w, h] = paperIn({ ...S, land: false }), u = $('cp-unit').value === 'mm' ? 25.4 : 1;
  $('cp-w').value = +(w * u).toFixed(u > 1 ? 0 : 2); $('cp-h').value = +(h * u).toFixed(u > 1 ? 0 : 2); $('cp-err').hidden = true; $('cp-dlg').showModal(); $('cp-w').select();
}
$('cp-unit').addEventListener('change', e => { const to = e.target.value === 'mm' ? 25.4 : 1 / 25.4; for (const id of ['cp-w', 'cp-h']) { const v = parseFloat($(id).value); if (isFinite(v)) $(id).value = +(v * to).toFixed(to > 1 ? 0 : 2); } });
$('cp-form').addEventListener('submit', e => { e.preventDefault(); const u = $('cp-unit').value === 'mm' ? 25.4 : 1, w = parseFloat($('cp-w').value) / u, h = parseFloat($('cp-h').value) / u;
  if (!(w >= 4 && h >= 4 && w <= 48 && h <= 48)) { $('cp-err').hidden = false; return; }
  $('cp-dlg').close(); setPaper({ w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 }); });
$('cp-cancel').addEventListener('click', () => $('cp-dlg').close());
function setOrient(land) {
  if (!!S.land === land) return;
  snapshot(); S.land = land; relayout();
}
// a sheet's paper or way round changed: an empty sheet's rails laid out afresh; otherwise its rails kept on the paper
function setPaper(p) {
  const k = typeof p === 'object' ? 'custom' : p;
  if (k === paperKey(S) && (k !== 'custom' || (S.pw === p.w && S.ph === p.h))) return;
  snapshot(); setPaperOf(S, p); relayout(); say(`Sheet ${doc.cur + 1}: ${paperName(S)}, ${S.land ? 'landscape' : 'portrait'}.`);
}
function relayout() {
  // (an empty sheet: its rails laid out afresh for the new way round; otherwise kept on the paper)
  const rails = S.parts.filter(p => p.t === 'rail');
  if (rails.length === S.parts.length && !S.wires.length && !S.texts.length) S.parts = railsFor(S);
  refresh(true);
  for (const r of S.parts) if (r.t === 'rail') { r.y1 = Math.min(r.y1, snap(VB[1] - 60)); r.y0 = Math.min(r.y0, r.y1 - 200); r.x = Math.min(r.x, snap(VB[0] - 60)); }
  refresh(); fitZoom();
}

/* ---------- the title block ---------- */
function renderTB() {
  const f = doc.tb.fields;
  $('tb-rows').innerHTML = `<div class="tbrow tbhead"><span></span><span>Label</span><span>What it says</span><span>Width</span><span>Large</span><span></span><span></span><span></span></div>` + f.map((x, i) => `<div class="tbrow" data-i="${i}">
    <span class="num">${i + 1}</span><input type="text" data-k="label" value="${esc(x.label)}"><input type="text" data-k="value" value="${esc(x.value)}">
    <select data-k="span">${[1, 2, 3, 4, 5, 6, 8, 12].map(n => `<option value="${n}"${(x.span || 2) === n ? ' selected' : ''}>${n}/12</option>`).join('')}</select>
    <label><input type="checkbox" data-k="big"${x.big ? ' checked' : ''}>big</label>
    <button class="ib" data-mv="-1" title="Earlier"${i ? '' : ' disabled'}>↑</button><button class="ib" data-mv="1" title="Later"${i < f.length - 1 ? '' : ' disabled'}>↓</button><button class="ib" data-rm="1" title="Take this box away">✕</button></div>`).join('');
  $('tb-shownotes').checked = !!doc.tb.showNotes; $('tb-notes').value = doc.tb.notes || ''; $('tb-powernote').checked = doc.tb.powerNote !== false;
  for (const r of document.querySelectorAll('.tbrow[data-i]')) { const i = +r.dataset.i;
    for (const el of r.querySelectorAll('[data-k]')) el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => { const x = f[i]; const k = el.dataset.k; x[k] = k === 'span' ? +el.value : k === 'big' ? el.checked : el.value; if (k === 'value' && isDrawnBy(x)) rememberDrawnBy(x.value); refresh(true); });
    for (const b of r.querySelectorAll('[data-mv]')) b.addEventListener('click', () => { const j = i + +b.dataset.mv; [f[i], f[j]] = [f[j], f[i]]; renderTB(); refresh(true); });
    r.querySelector('[data-rm]').addEventListener('click', () => { f.splice(i, 1); renderTB(); refresh(true); }); }
}
$('tb-btn').addEventListener('click', () => { snapshot(); renderTB(); $('tb-dlg').showModal(); });
$('tb-add').addEventListener('click', () => { doc.tb.fields.push({ id: uid('f'), label: 'New Box', value: '', span: 3 }); renderTB(); refresh(true); const r = document.querySelectorAll('.tbrow[data-i]'); r[r.length - 1].querySelector('input').select(); });
$('tb-shownotes').addEventListener('change', e => { doc.tb.showNotes = e.target.checked; refresh(true); });
$('tb-notes').addEventListener('input', e => { doc.tb.notes = e.target.value; refresh(true); });
$('tb-powernote').addEventListener('change', e => { if (e.target.checked) delete doc.tb.powerNote; else doc.tb.powerNote = false; refresh(true); });
$('tb-reset').addEventListener('click', () => { doc.tb = defaultTB(); renderTB(); refresh(true); });
$('tb-done').addEventListener('click', () => $('tb-dlg').close());

/* ---------- zoom and panning ---------- */
const pageSize = () => paperIn(S).map(v => Math.round(v * 96));
// the room round the page: enough to bring any part of it (its edges too) to the middle of the window, so zooming
// about the pointer never runs out of room (Fit puts the page back in the middle)
const padX = () => zoomer.clientWidth * .6, padY = () => zoomer.clientHeight * .6;
function applyZoom() { const [w, h] = pageSize(), px = padX(), py = padY();
  host.style.transform = `scale(${zoom})`; host.style.left = px + 'px'; host.style.top = py + 'px';
  sizer.style.width = (w * zoom + 2 * px) + 'px'; sizer.style.height = (h * zoom + 2 * py) + 'px'; $('z-lvl').textContent = Math.round(zoom * 100) + '%'; }
function fitZoom() { const [w, h] = pageSize(); zoom = Math.max(.05, Math.min(3, Math.min((zoomer.clientWidth - 48) / w, (zoomer.clientHeight - 48) / h))); applyZoom();
  zoomer.scrollLeft = padX() + w * zoom / 2 - zoomer.clientWidth / 2; zoomer.scrollTop = padY() + h * zoom / 2 - zoomer.clientHeight / 2; }
// zoomed by f about a point on the screen (the pointer; else the middle): that point stays where it is
function zoomBy(f, cx, cy) {
  const r = zoomer.getBoundingClientRect(); cx = cx ?? r.left + r.width / 2; cy = cy ?? r.top + r.height / 2;
  const qx = (zoomer.scrollLeft + cx - r.left - padX()) / zoom, qy = (zoomer.scrollTop + cy - r.top - padY()) / zoom;
  zoom = Math.max(.05, Math.min(4, zoom * f)); applyZoom();
  zoomer.scrollLeft = qx * zoom + padX() - (cx - r.left); zoomer.scrollTop = qy * zoom + padY() - (cy - r.top);
}
$('z-in').addEventListener('click', () => zoomBy(1.25)); $('z-out').addEventListener('click', () => zoomBy(.8)); $('z-fit').addEventListener('click', fitZoom);
zoomer.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
function startPan(e) { e.preventDefault(); pan = { x: e.clientX, y: e.clientY, l: zoomer.scrollLeft, t: zoomer.scrollTop }; desk.classList.add('pan'); svg.setPointerCapture(e.pointerId); }
function doPan(e) { zoomer.scrollLeft = pan.l - (e.clientX - pan.x); zoomer.scrollTop = pan.t - (e.clientY - pan.y); }
window.addEventListener('resize', () => { if (svg) { VB = fitDraw(host.firstElementChild); drawEd(); } });

/* ---------- files ---------- */
let saveT = null;
function autosave() { showFileLabel(); clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(AUTOSAVE, JSON.stringify(doc)); localStorage.setItem(SHOWKEY, JSON.stringify(SHOW)); } catch (_) {} }, 400); }
function loadDoc(d) {
  if (!d || d.kind !== 'o3-print' || !Array.isArray(d.sheets) || !d.sheets.length) throw new Error('not a Print Builder file');
  for (const s of d.sheets) { s.parts ||= []; s.wires ||= []; s.nodes ||= []; s.texts ||= []; for (const p of s.parts) { if (/^(spdt|dpdt)_m$/.test(p.t)) { p.t = p.t.slice(0, -2); p.fx = true; }   // (flipped switches saved in the demo as parts of their own)
    if (p.t !== 'rail' && !LIB[p.t]) throw new Error('unknown symbol ' + p.t); } }
  d.tb ||= defaultTB(); d.cur = Math.min(d.cur || 0, d.sheets.length - 1);
  doc = d; S = doc.sheets[doc.cur]; sel = new Set(); selW = null; UNDO.length = 0; REDO.length = 0;
  // (a fused disconnect from before its fuses were numbered: the next three numbers)
  for (const s of d.sheets) for (const p of s.parts) if (p.t === 'fdsc3' && !p.fu) p.fu = nextTag('FU');
  // (a timer's contact drawn timed before there were timed contacts of their own: one now)
  for (const s of d.sheets) for (const p of s.parts) if ((p.t === 'con_no' || p.t === 'con_nc') && !p.inst && d.sheets.some(t => t.parts.some(c => c.t === 'coil' && c.tag === p.tag && /^TR/.test(c.tag || '')))) p.t = 'tc_' + p.t.split('_')[1];
}
const fileName = () => ((doc.tb.fields.find(f => /title/i.test(f.label)) || {}).value || 'Print').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Print';
/* ---------- files, as in Circuit Builder: where the browser allows it (Chrome and Edge, and the installed app), the
   print keeps hold of the file it was opened from or first saved to, and Save writes straight back into that file;
   Save As makes a new one. Elsewhere Save hands over a new copy to download. ---------- */
let fileHandle = null, savedJSON = null;
const FILE_TYPES = [{ description: 'Print Builder print', accept: { 'application/json': ['.json'] } }];
const canUseFiles = () => typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function' && window.self === window.top;
const docJSON = () => JSON.stringify(doc);
function markSaved() { savedJSON = docJSON(); showFileLabel(); }
function forgetFile() { fileHandle = null; savedJSON = null; showFileLabel(); }
function showFileLabel() {
  const lab = $('file-label'), dirty = !!fileHandle && savedJSON !== null && docJSON() !== savedJSON;
  lab.hidden = !fileHandle; lab.textContent = fileHandle ? (dirty ? '● ' : '') + fileHandle.name : ''; lab.classList.toggle('dirty', dirty);
  lab.title = fileHandle ? (dirty ? 'Changes not saved yet: Save (Ctrl+S) writes them into ' : 'Everything is saved in ') + fileHandle.name : '';
  $('save-btn').title = fileHandle ? `Save into ${fileHandle.name} (Ctrl+S)` : 'Save this print as a file (Ctrl+S)';
}
function downloadCopy() {
  const b = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = fileName() + '.o3print.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'Saved to your Downloads as ' + a.download + '. (This browser saves a new copy each time; Chrome or Edge save back into the same file.)';
}
async function saveToFile(asNew) {
  if (!canUseFiles()) return downloadCopy();
  try {
    if (!fileHandle || asNew) fileHandle = await window.showSaveFilePicker({ suggestedName: fileName() + '.o3print.json', types: FILE_TYPES });
    const w = await fileHandle.createWritable(); await w.write(JSON.stringify(doc, null, 1)); await w.close();
    markSaved(); return 'Saved into ' + fileHandle.name + '.';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'Not saved.';
    if (e && (e.name === 'SecurityError' || e.name === 'NotAllowedError')) return downloadCopy();
    return 'Could not save: ' + (e && e.message || e);
  }
}
async function openFile(f, handle) {
  try { const d = JSON.parse(await f.text()); snapshot(); const keep = UNDO.slice(); loadDoc(d); UNDO.push(...keep); fileHandle = handle || null; refresh(true); fitZoom(); markSaved(); say('Opened ' + f.name + (handle ? '. Save writes your changes back into it.' : '')); }
  catch (err) { alert('That file could not be opened: it is not a Print Builder file (' + err.message + ').'); }
}
async function pickAndOpen() {
  if (canUseFiles()) {
    try { const [h] = await window.showOpenFilePicker({ types: FILE_TYPES }); await openFile(await h.getFile(), h); return; }
    catch (e) { if (e && e.name === 'AbortError') return; if (!(e && (e.name === 'SecurityError' || e.name === 'NotAllowedError'))) { alert('Could not open: ' + (e.message || e)); return; } }
  }
  $('file-in').click();
}
$('save-btn').addEventListener('click', async () => say(await saveToFile(false)));
$('saveas-btn').addEventListener('click', async e => { e.stopPropagation(); closeMenus(); say(await saveToFile(true)); });
$('save-more').addEventListener('click', e => { e.stopPropagation(); const m = $('save-menu'), o = m.hidden; closeMenus(); m.hidden = !o; });
$('open-btn').addEventListener('click', pickAndOpen);
$('file-in').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f, null); });
$('new-btn').addEventListener('click', e => { e.stopPropagation(); const m = $('new-menu'), o = m.hidden; closeMenus(); m.hidden = !o; });
for (const b of document.querySelectorAll('[data-new]')) b.addEventListener('click', () => { closeMenus(); snapshot(); const keep = UNDO.slice(); loadDoc(withDrawnBy(template(b.dataset.new))); UNDO.push(...keep); forgetFile(); refresh(true); fitZoom(); });

/* ---------- printing: every sheet, each on its own page the right way round ---------- */
function printAll() {
  const ph = $('print-host');
  ph.innerHTML = doc.sheets.map((s, k) => pageHTML(s, k, A)).join('');
  ph.style.cssText = 'display:block;position:fixed;left:-30000px;top:0';
  for (const p of ph.querySelectorAll('.pr-page')) fitDraw(p);
  ph.style.cssText = ''; drawInk();
  // (each paper size its own @page, so the browser prints every sheet on its own size, the right way round)
  $('print-page').textContent = [...new Set(doc.sheets.map(s => paperIn(s).join('x')))].map(z => { const [w, h] = z.split('x'); return `@page ${pageName(w, h)} { size: ${w}in ${h}in; margin: 0; }`; }).join(' ') + ' @page { margin: 0; }';
  setTimeout(() => window.print(), 30);
}
window.addEventListener('afterprint', () => { $('print-host').innerHTML = ''; });
$('print-btn').addEventListener('click', openPreview);

/* ---------- the ribbon's other buttons, and the keyboard ---------- */
for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
$('check-btn').addEventListener('click', () => { checkOn = true; setRib('check'); updateButtons(); drawEd(); });
$('ring-chk').addEventListener('change', e => { checkOn = e.target.checked; updateButtons(); drawEd(); });
$('rt-home').addEventListener('click', () => setRib('home')); $('rt-part').addEventListener('click', () => setRib('part'));
$('rt-check').addEventListener('click', () => { checkOn = true; setRib('check'); updateButtons(); drawEd(); });
$('copy-btn').addEventListener('click', copySel); $('cut-btn').addEventListener('click', cutSel); $('paste-btn').addEventListener('click', () => pasteClip(null)); $('del-btn').addEventListener('click', removeSelection);
$('undo-btn').addEventListener('click', () => { if (undo()) { sel = new Set(); selW = null; refresh(true); } });
$('redo-btn').addEventListener('click', () => { if (redo()) { sel = new Set(); selW = null; refresh(true); } });
for (const [id, k] of [['show-wn', 'wn'], ['show-rn', 'rn'], ['show-xr', 'xr']]) $(id).addEventListener('change', e => { SHOW[k] = e.target.checked; refresh(); });
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || $('tb-dlg').open;
  if ((e.ctrlKey || e.metaKey) && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); $('undo-btn').click(); return; }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); $('redo-btn').click(); return; }
    if (k === 's') { e.preventDefault(); (async () => say(await saveToFile(e.shiftKey)))(); return; }
    if (k === 'p') { e.preventDefault(); openPreview(); return; }
    if (k === 'c') { e.preventDefault(); copySel(); return; }
    if (k === 'x') { e.preventDefault(); cutSel(); return; }
    if (k === 'v') { e.preventDefault(); pasteClip(cursor); return; }
    if (k === 'd') { e.preventDefault(); if (copySel()) pasteClip(null); return; }
    if (k === 'a') { e.preventDefault(); sel = new Set([...S.parts, ...S.texts].map(x => x.id)); selW = null; refresh(); return; }
    if (k === '0') { e.preventDefault(); fitZoom(); return; }
    if (k === '=' || k === '+') { e.preventDefault(); zoomBy(1.25); return; }
    if (k === '-') { e.preventDefault(); zoomBy(.8); return; }
    return;
  }
  if (typing) return;
  if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
  if (e.key === 'Escape') { if (wd) finishWire(); else if (tool !== 'select') setTool('select'); else { sel = new Set(); selW = null; selL = null; refresh(); } return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelection(); return; }
  const k = e.key.toLowerCase();
  if (k === 'f' && !e.ctrlKey && !e.metaKey) { if (tool === 'place' && placing) { placing.fx = !placing.fx; drawEd(); } else if (sel.size && [...sel].some(id => canFlip(partOf(S, id)))) { snapshot(); flipParts(S, sel); refresh(); } return; }
  if (k === 'r') { if (tool === 'place' && placing) { if (canTurn({ t: placing.t })) placing.rot = ((placing.rot || 0) + 90) % 360; drawEd(); } else if (sel.size) { snapshot(); rotateParts(S, sel); refresh(); } return; }
  if (k === 'v') setTool('select'); if (k === 'w') setTool('wire'); if (k === 'l') setTool('rung'); if (k === 'n') setTool('note');
  const mv = { arrowleft: [-G, 0], arrowright: [G, 0], arrowup: [0, -G], arrowdown: [0, G] }[k];
  if (mv && sel.size) { e.preventDefault(); snapshot(); moveItems(S, sel, ...mv); tidy(S); refresh(); }
});
document.addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });

/* ---------- starting up ---------- */
function start() {
  try { const sv = JSON.parse(localStorage.getItem(SHOWKEY) || 'null'); if (sv) SHOW = { ...SHOW, ...sv }; } catch (_) {}
  $('show-wn').checked = SHOW.wn; $('show-rn').checked = SHOW.rn; $('show-xr').checked = SHOW.xr;
  let d = null; try { d = JSON.parse(localStorage.getItem(AUTOSAVE) || 'null'); } catch (_) {}
  try { if (d) loadDoc(d); else loadDoc(withDrawnBy(template('starter'))); } catch (_) { loadDoc(withDrawnBy(template('blank'))); }
  try { const z = parseFloat(localStorage.getItem(UIKEY)); if (z) setUiSize(z); } catch (_) {}
  $('ui-size').addEventListener('change', e => setUiSize(parseFloat(e.target.value)));
  buildPalette(); palGrip(); refresh(true); setTool('select'); requestAnimationFrame(fitZoom);
}
// (start() is called at the very end, in shell.js, once every script has run)

/* ---------- several parts of one kind picked: one Part tab for them all (as in Circuit Builder) ---------- */
// what parts are alike for this: contacts; relay coils; timers; pushbuttons; otherwise the same symbol, NO or NC
const multiKey = p => { const k = LIB[p.t].kind; if (k === 'contact') return 'contact'; if (k === 'coil') return /^TR/.test(p.tag || '') ? 'timer' : 'coil'; if (isPB(p)) return 'pb'; return p.t.replace(/_(no|nc|hc|ho)$/, ''); };
const MULTI_NAME = { contact: 'Contacts', coil: 'Relay Coils', timer: 'Timers', pb: 'Pushbuttons', pl: 'Pilot Lights', sel: 'Selector Switches' };
// the picked parts, if every one is a symbol (not a rail) and all of one kind; else null
function multiParts(ids) {
  const ps = ids.map(id => partOf(S, id)); if (ps.some(p => !p || p.t === 'rail' || isArrowIn(p.t)) || ps.length < 2) return null;
  return ps.every(p => multiKey(p) === multiKey(ps[0])) ? ps : null;
}
const plural = n => /(s|x|ch|sh)$/i.test(n) ? n + 'es' : n + 's';
function renderMulti(P, ps) {
  const p0 = ps[0], key = multiKey(p0), d0 = LIB[p0.t], k = d0.kind, same = f => ps.every(p => f(p) === f(p0));
  const name = MULTI_NAME[key] || plural(d0.name.replace(/^N[OC] /, '').replace(/,.*$/, '').replace(/ \(.*\)$/, ''));
  const isNO = p => /_no$|_hc$/.test(p.t);
  const coils = [...new Set(allParts().filter(x => LIB[x.p.t].kind === 'coil').map(x => x.p.tag).filter(Boolean))];
  const ols = [...new Set(allParts().filter(x => LIB[x.p.t].kind === 'ol').map(x => x.p.tag).filter(Boolean))];
  const worked = k === 'contact' || k === 'starter' || k === 'olc', list = k === 'olc' ? ols : coils;
  P.innerHTML = `<h4>${ps.length} ${esc(name)}</h4>
    ${ps.every(p => LIB[p.t].flip) && k !== 'cont' ? `<div class="f">Contact<div class="seg"><button data-mno="1" aria-pressed="${ps.every(isNO)}">NO</button><button data-mno="0" aria-pressed="${ps.every(p => !isNO(p))}">NC</button></div></div>` : ''}
    ${worked ? `<div class="f">Worked by<select id="m-of">${same(p => p.tag) ? '' : '<option value="" selected>(several)</option>'}${[...new Set([...list, ...(same(p => p.tag) && p0.tag ? [p0.tag] : [])])].map(x => `<option value="${esc(x)}"${same(p => p.tag) && x === p0.tag ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></div>` : ''}
    ${ps.every(p => /^(con|tc)_n[oc]$/.test(p.t)) ? `<div class="f">Contact Type<div class="seg"><button data-mct="tc" aria-pressed="${ps.every(p => p.t.startsWith('tc'))}">Timed</button><button data-mct="con" aria-pressed="${ps.every(p => p.t.startsWith('con'))}">Instant</button></div></div>` : ''}
    ${key === 'timer' ? `<div class="f">Delay<div class="seg"><button data-mtof="0" aria-pressed="${ps.every(p => !p.tof)}">On-Delay</button><button data-mtof="1" aria-pressed="${ps.every(p => !!p.tof)}">Off-Delay</button></div></div><div class="f">Seconds<input class="in" id="m-delay" type="number" min="0" step="0.5" value="${same(p => p.delay ?? '') ? esc(p0.delay ?? '') : ''}" placeholder="${same(p => p.delay ?? '') ? '' : '(several)'}" style="min-width:80px;width:90px"></div>` : ''}
    ${p0.t === 'pl' ? `<div class="f">Built Into<select id="m-inpb">${same(p => p.inPB || '') ? '' : '<option value="__keep" selected>(several)</option>'}<option value=""${same(p => p.inPB || '') && !p0.inPB ? ' selected' : ''}>None (lights of their own)</option>${[...new Set(allParts().filter(q => isPB(q.p) && q.p.tag).map(q => q.p.tag))].map(t => `<option value="${esc(t)}"${same(p => p.inPB || '') && p0.inPB === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` : ''}
    ${p0.t === 'sel' ? `<div class="f">Positions<input class="in" id="m-pos" value="${same(p => selNames(p).join('/')) ? esc(selNames(p0).join('/')) : ''}" placeholder="${same(p => selNames(p).join('/')) ? '' : '(several)'}" title="2 to 4 positions, with slashes: HAND/OFF/AUTO"></div>` : ''}
    <p class="help">A setting changed here changes all ${ps.length}. (Each one’s own ${k === 'contact' || k === 'starter' || k === 'olc' ? 'label is' : 'number and label are'} set one at a time.)</p>
    <div class="acts">${ps.every(canTurn) ? '<button class="btn" id="m-rot">Rotate (R)</button>' : ''}${ps.every(canFlip) ? '<button class="btn" id="m-flip">Flip ⇆ (F)</button>' : ''}<button class="btn del" id="p-del">Delete</button></div>`;
  const all = fn => { snapshot(); for (const p of ps) fn(p); refresh(); };
  for (const b of P.querySelectorAll('[data-mno]')) b.addEventListener('click', () => all(p => { if (isNO(p) !== (b.dataset.mno === '1')) p.t = LIB[p.t].flip; }));
  const of = $('m-of'); if (of) of.addEventListener('change', () => { if (of.value) all(p => { p.tag = of.value; }); });
  for (const b of P.querySelectorAll('[data-mct]')) b.addEventListener('click', () => all(p => { p.t = b.dataset.mct + '_' + p.t.split('_')[1]; delete p.inst; }));
  for (const b of P.querySelectorAll('[data-mtof]')) b.addEventListener('click', () => all(p => { if (b.dataset.mtof === '1') p.tof = true; else delete p.tof; }));
  const dl = $('m-delay'); if (dl) dl.addEventListener('input', () => edit(() => { const v = parseFloat(dl.value); for (const p of ps) { if (isFinite(v) && v >= 0) p.delay = v; else delete p.delay; } }));
  const ib = $('m-inpb'); if (ib) ib.addEventListener('change', () => { if (ib.value !== '__keep') all(p => { if (ib.value) p.inPB = ib.value; else delete p.inPB; }); });
  const ps_ = $('m-pos'); if (ps_) ps_.addEventListener('change', () => { const n = ps_.value.split(/[\/,]+/).map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 4); if (n.length < 2) return; all(p => { p.pos = n.join('/'); p.closedIn = (p.closedIn || []).filter(i => i < n.length); }); });
  const ro = $('m-rot'); if (ro) ro.addEventListener('click', () => { snapshot(); rotateParts(S, new Set(ps.map(p => p.id))); refresh(); });
  const mf = $('m-flip'); if (mf) mf.addEventListener('click', () => { snapshot(); flipParts(S, new Set(ps.map(p => p.id))); refresh(); });
}

/* ---------- a coil (or overload, or pushbutton) renamed: what belongs to it goes with it, unless another of that
   name still has them (as in Circuit Builder). Returns what to tell, or '' ---------- */
function followRename(p, old, now) {
  if (!old || !now || old === now) return '';
  const k = LIB[p.t].kind, pb = isPB(p);
  if (k !== 'coil' && k !== 'ol' && !pb) return '';
  const kindOf = q => (LIB[q.t] || {}).kind;
  const others = allParts().some(x => x.p !== p && (pb ? isPB(x.p) : kindOf(x.p) === k) && x.p.tag === old);
  if (others) return '';
  let n = 0;
  for (const s of doc.sheets) for (const q of s.parts) {
    if (k === 'coil' && (kindOf(q) === 'contact' || kindOf(q) === 'starter') && q.tag === old) { q.tag = now; n++; }
    if (k === 'ol' && kindOf(q) === 'olc' && q.tag === old) { q.tag = now; n++; }
    if (pb && q.t === 'pl' && q.inPB === old) { q.inPB = now; n++; }
  }
  if (!n) return '';
  return pb ? `Its light${n > 1 ? 's' : ''} now ${n > 1 ? 'belong' : 'belongs'} to ${now}.` : `Its ${n} contact${n > 1 ? 's' : ''} now belong${n > 1 ? '' : 's'} to ${now}.`;
}

/* ---------- Drawn By: whatever was last typed there is kept, and a new print starts with it ---------- */
const DRAWNKEY = 'oo-print-builder:drawn-by';
const isDrawnBy = f => /drawn\s*by/i.test(f.label || '');
function rememberDrawnBy(v) { try { if (v && v.trim() && v.trim() !== 'Student Name') localStorage.setItem(DRAWNKEY, v.trim()); } catch (_) {} }
function withDrawnBy(d) { let v = null; try { v = localStorage.getItem(DRAWNKEY); } catch (_) {} if (v && d.tb) for (const f of d.tb.fields) if (isDrawnBy(f)) f.value = v; return d; }

/* ---------- Clear: everything on this sheet taken away but its rails (Ctrl+Z brings it back) ---------- */
$('clear-btn').addEventListener('click', () => {
  if (!S.parts.some(p => p.t !== 'rail') && !S.wires.length && !S.texts.length) { say('This sheet is already clear.'); return; }
  snapshot(); S.parts = S.parts.filter(p => p.t === 'rail'); S.wires = []; S.nodes = []; S.texts = [];
  sel = new Set(); selW = null; selL = null; refresh(); say(`Sheet ${doc.cur + 1} cleared. Ctrl+Z brings it all back.`);
});

/* ---------- Organize: a rung's parts spread out evenly along the room it has (Dallas, 10 Nov 2026) ----------
   Pick a rung (click its wire, or any part on it; several rungs: pick something on each) and press Organize. The
   parts in line on the rung are spaced evenly between its ends (L1 to L2, or wherever its wire starts and stops). A
   branch (a seal-in under a button, say) moves as one block with the parts it is round; a part or joint that leads
   off to another rung stays where it is, and the parts either side of it spread out in their own stretch. Wires
   follow; one undo step. */
// the rungs picked: the level of each picked level part, and of each picked wire's longest level run
function rungsPicked() {
  const ys = new Set();
  for (const id of sel) { const p = partOf(S, id); if (p && p.t !== 'rail' && !((p.rot || 0) % 180)) ys.add(p.y); }
  if (selW) { const w = S.wires.find(x => x.id === selW); if (w) { const P = wirePts(S, w); let best = null, bl = 0;
    for (let i = 0; i < P.length - 1; i++) if (P[i][1] === P[i + 1][1]) { const l = Math.abs(P[i][0] - P[i + 1][0]); if (l > bl) { bl = l; best = P[i][1]; } }
    if (best != null) ys.add(best); } }
  return [...ys];
}
function organizeRung(s, Y, seedX) {
  const termsAt = p => termsOf(p.t).map((_, i) => termPos(p, i));
  const level = p => p.t !== 'rail' && !((p.rot || 0) % 180) && p.y === Y;
  // the rung's own line: its level wire runs at Y and the parts in line on it, joined end to end
  const iv = [];
  for (const w of s.wires) { const P = wirePts(s, w); for (let i = 0; i < P.length - 1; i++) if (P[i][1] === Y && P[i + 1][1] === Y) iv.push([Math.min(P[i][0], P[i + 1][0]), Math.max(P[i][0], P[i + 1][0])]); }
  for (const p of s.parts) if (level(p)) { const xs = termsAt(p).filter(q => q[1] === Y).map(q => q[0]); if (xs.length) iv.push([Math.min(...xs), Math.max(...xs)]); }
  iv.sort((a, b) => a[0] - b[0]); const runs = [];
  for (const r of iv) { const l = runs[runs.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else runs.push([...r]); }
  const run = runs.find(r => seedX == null || (seedX >= r[0] - 1 && seedX <= r[1] + 1)) || runs[0];
  if (!run) return { moved: 0, why: 'no rung there' };
  const [L, R] = run, inRun = x => x >= L && x <= R;
  const onLine = new Set(), lineParts = [], lineNodes = [];
  for (const p of s.parts) if (level(p) && inRun(p.x)) { lineParts.push(p); onLine.add(p.id); }
  for (const n of s.nodes) if (n.y === Y && inRun(n.x)) { lineNodes.push(n); onLine.add(n.id); }
  const idOf = e => e.p || e.n || null, endPos = e => pos(s, e);
  const leaves = (w, at) => { const P = wirePts(s, w), q = sameEnd(w.a, at) ? P[1] : P[P.length - 2]; return q && q[1] !== Y; };   // (it leaves the rung's line)
  // each part in line: fixed (it leads off the line: an SPDT's throws) or free; each joint: plain, or where a branch leaves
  const units = [], fixed = [];
  const extent = p => { const xs = termsAt(p).map(q => q[0]); return [Math.min(...xs), Math.max(...xs)]; };
  for (const p of lineParts) { if (termsAt(p).some(q => q[1] !== Y)) fixed.push(extent(p)); }
  // branches: from a joint (or a terminal) on the line, everything reached off the line until it comes back to the line.
  // (The rung's own two ends are just its ends, even where they sit on a wire that feeds other rungs too.)
  const atEnd = x => x <= L || x >= R;
  const starts = [];
  for (const n of lineNodes) { if (atEnd(n.x)) continue; const ws = wiresAt(s, { n: n.id }).filter(w => leaves(w, { n: n.id })); if (ws.length) starts.push({ id: n.id, x: n.x, ws, end: { n: n.id }, node: n }); }
  for (const p of lineParts) termsOf(p.t).forEach((_, i) => { const q = termPos(p, i); if (q[1] !== Y || atEnd(q[0])) return; const ws = wiresAt(s, { p: p.id, i }).filter(w => leaves(w, { p: p.id, i })); if (ws.length) starts.push({ id: p.id, x: q[0], ws, end: { p: p.id, i } }); });
  const xOn = id => { const n = nodeOf(s, id); if (n) return [n.x, n.x]; const p = partOf(s, id); return p ? extent(p) : [L, R]; };
  // a branch that comes back to this rung, away from its ends, without reaching a rail: a block (a seal-in, say)
  for (const st of starts) {
    const q = st.ws.map(w => [w, st.end]), doneW = new Set(), seen = new Set(); st.att = new Set(); st.off = new Set(); st.ok = true;
    while (q.length) {
      const [w, from] = q.shift(); if (doneW.has(w.id)) continue; doneW.add(w.id);
      const to = sameEnd(w.a, from) ? w.b : w.a;
      if (to.r) { st.ok = false; break; }
      const id = idOf(to); if (!id) continue;
      if (onLine.has(id)) { const [a, b] = xOn(id); if (atEnd(a) || atEnd(b)) { st.ok = false; break; } st.att.add(id); continue; }
      if (seen.has(id)) continue; seen.add(id); st.off.add(id); if (st.off.size > 60) { st.ok = false; break; }
      if (to.n) for (const w2 of wiresAt(s, to)) q.push([w2, to]);
      else { const p = partOf(s, id); for (let k = 0; k < termsN(p); k++) for (const w2 of wiresAt(s, { p: id, i: k })) q.push([w2, { p: id, i: k }]); }
    }
    if (!st.att.size) st.ok = false;
  }
  // a joint whose branch leads off elsewhere (another rung, a rail, a bus): it slides along this rung like a part, its
  // branch wire going straight down (or up) from it and stretching along wherever it turns; one that cannot (its wire
  // runs straight on to something right below it) stays where it is
  const slides = st => st.node && st.ws.every(w => { const P = sameEnd(w.a, st.end) ? wirePts(s, w) : wirePts(s, w).reverse(); return P.length >= 3 && P[1][0] === P[0][0] && P[2][1] === P[1][1]; });
  for (const st of starts) if (!st.ok) { if (slides(st)) units.push({ x0: st.x, x1: st.x, ids: new Set([st.id]), joint: true }); else fixed.push(xOn(st.id)); }
  // blocks: the branches that come back, joined where they share ends, with everything on the line between their ends
  const blocks = [];
  for (const st of starts) if (st.ok) { const xs = [st.x, ...[...st.att].flatMap(xOn)], b = { x0: Math.min(...xs), x1: Math.max(...xs), ids: new Set([...st.off, st.id, ...st.att]) }; blocks.push(b); }
  blocks.sort((a, b) => a.x0 - b.x0); const merged = [];
  for (const b of blocks) { const l = merged[merged.length - 1]; if (l && b.x0 <= l.x1) { l.x1 = Math.max(l.x1, b.x1); for (const x of b.ids) l.ids.add(x); } else merged.push({ ...b, ids: new Set(b.ids) }); }
  const inside = (x0, x1, b) => x0 >= b.x0 && x1 <= b.x1;
  for (const b of merged) {
    if (fixed.some(([a, c]) => c >= b.x0 && a <= b.x1)) { fixed.push([b.x0, b.x1]); b.dead = true; continue; }
    for (const p of lineParts) { const e = extent(p); if (inside(e[0], e[1], b)) b.ids.add(p.id); }
    for (const n of lineNodes) if (inside(n.x, n.x, b)) b.ids.add(n.id);
    for (const u of units.filter(u => u.joint && inside(u.x0, u.x1, b))) { for (const x of u.ids) b.ids.add(x); units.splice(units.indexOf(u), 1); }
    units.push({ x0: b.x0, x1: b.x1, ids: b.ids });
  }
  const inBlock = x => merged.some(b => !b.dead && x >= b.x0 && x <= b.x1), inFixed = x => fixed.some(([a, b]) => x >= a && x <= b);
  for (const p of lineParts) { const e = extent(p); if (!inBlock(p.x) && !inFixed(p.x) && !termsAt(p).some(q => q[1] !== Y)) units.push({ x0: e[0], x1: e[1], ids: new Set([p.id]) }); }
  const pass = lineNodes.filter(n => !atEnd(n.x) && !inBlock(n.x) && !starts.some(st => st.id === n.id));   // (plain joints in the run: put between their neighbours after)
  if (!units.length) return { moved: 0, why: 'nothing on it to spread' };
  // the stretches between the rung's ends and any fixed points (merged where they overlap); in each, its units spaced evenly
  const fx = fixed.map(f => [Math.max(L, f[0]), Math.min(R, f[1])]).sort((u, v) => u[0] - v[0]), fm = [];
  for (const f of fx) { const l = fm[fm.length - 1]; if (l && f[0] <= l[1]) l[1] = Math.max(l[1], f[1]); else fm.push([...f]); }
  const segs = []; let a0 = L; for (const [f0, f1] of fm) { segs.push([a0, f0]); a0 = f1; } segs.push([a0, R]);
  const plan = []; let crowded = 0;
  for (const [a, b] of segs) {
    const us = units.filter(u => u.x0 >= a && u.x1 <= b).sort((u, v) => u.x0 - v.x0); if (!us.length) continue;
    const wsum = us.reduce((t, u) => t + (u.x1 - u.x0), 0), gap = (b - a - wsum) / (us.length + 1);
    if (gap < G) { crowded++; continue; }   // (too full to spread: left as it is; the rest still spread)
    let cur = a + gap, prev = a;
    for (const u of us) { let nl = snap(cur); if (nl < prev + G) nl = prev + G; plan.push({ u, dx: nl - u.x0 }); prev = nl + (u.x1 - u.x0); cur += (u.x1 - u.x0) + gap; }
  }
  // the rung's own level wires: straight from end to end (their bends and dragged numbers would not fit the new spacing)
  for (const w of s.wires) { const P = wirePts(s, w); if (P.every(q => q[1] === Y) && P.every(q => inRun(q[0]))) { w.pts = []; delete w.lab; } }
  let moved = 0;
  for (const { u, dx } of plan) if (dx) { moveItems(s, u.ids, dx, 0); moved++; }
  // plain joints: halfway between what now sits either side of them
  for (const n of pass) { const xs = s.parts.filter(p => level(p)).flatMap(p => termsAt(p).filter(q => q[1] === Y).map(q => q[0])).concat(s.nodes.filter(m => m !== n && m.y === Y).map(m => m.x));
    const lo = Math.max(L, ...xs.filter(x => x < n.x)), hi = Math.min(R, ...xs.filter(x => x > n.x)); const nx = snap((lo + hi) / 2); if (nx !== n.x && nx > lo && nx < hi) moveItems(s, new Set([n.id]), nx - n.x, 0); }
  tidy(s);
  return { moved, units: plan.length, crowded, why: !plan.length && crowded ? 'not enough room on it' : null };
}
$('org-btn').addEventListener('click', () => {
  const ys = rungsPicked(); if (!ys.length) { say('Pick a rung first: click its wire, or any part on it.'); return; }
  const before = JSON.stringify(doc); snapshot();
  const res = ys.map(y => organizeRung(S, y, (() => { for (const id of sel) { const p = partOf(S, id); if (p && p.y === y) return p.x; } if (selW) { const w = S.wires.find(x => x.id === selW); if (w) { const P = wirePts(S, w); for (let i = 0; i < P.length - 1; i++) if (P[i][1] === y && P[i + 1][1] === y) return (P[i][0] + P[i + 1][0]) / 2; } } return null; })()));
  if (JSON.stringify(doc) === before) { UNDO.pop(); const why = res.find(r => r.why); say(why ? `Nothing to organize: ${why.why}.` : 'That rung is already spread out evenly.'); refresh(); return; }
  const rn = ys.map(y => (A.rows[doc.cur] || []).find(r => r.y === y)).filter(Boolean).map(r => r.n);
  refresh(); const full = res.some(r => r.crowded); say(`${rn.length > 1 ? 'Rungs ' + rn.join(', ') : rn.length ? 'Rung ' + rn[0] : 'The rung'} organized: its parts spread out evenly${full ? ' (a stretch too full to spread was left as it is)' : ''}.`);
});
