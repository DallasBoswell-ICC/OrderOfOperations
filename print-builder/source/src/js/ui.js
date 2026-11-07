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
  select: 'Click to pick · drag to move · drag empty paper to pick several · R turns · Delete deletes',
  wire: 'Click to start · click to bend · click a terminal, rail or wire to finish · Esc stops',
  rung: 'Click between the rails to add a rung, then drop symbols onto it',
  note: 'Click where the note goes',
  place: 'Click on a rung to put it in the wire · Shift+click to put down more · R turns it · Esc stops',
})[tool] || '';

/* ---------- drawing it all ---------- */
function refresh(full = false) {
  S = doc.sheets[doc.cur];
  A = analyse(); ISSUES = checkPrint(A);
  const key = JSON.stringify([doc.tb, doc.cur, doc.sheets.length, S.land, S.id]);
  if (full || key !== pageFor || !svg) buildPage(key); else drawInk();
  drawEd(); renderProps(); renderChecks(); renderTabs(); updateButtons(); autosave();
}
function buildPage(key) {
  host.innerHTML = pageHTML(S, doc.cur, A, true); pageFor = key;
  svg = $('sv'); VB = fitDraw(host.firstElementChild);
  svg.addEventListener('pointerdown', onDown); svg.addEventListener('pointermove', onMove); svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointerleave', () => { cursor = null; $('tip').hidden = true; if (!drag) drawEd(); });
  svg.addEventListener('dblclick', e => { const h = pick(sheetPt(e)); if (tool === 'select' && h && h.kind === 'text') focusProp('note-text'); else if (tool === 'select' && h && h.kind === 'part') focusProp('p-tag'); });
  svg.setAttribute('class', 'tool-' + tool);
  applyZoom();
}
function drawInk() { svg.querySelector('g.ink').innerHTML = drawSheet(S, doc.cur, A); }
function updateButtons() {
  $('undo-btn').disabled = !UNDO.length; $('redo-btn').disabled = !REDO.length;
  const any = [...sel].some(id => { const p = partOf(S, id); return p ? p.t !== 'rail' : true; });
  $('copy-btn').disabled = $('cut-btn').disabled = !any; $('del-btn').disabled = !sel.size && !selW; $('paste-btn').disabled = !hasClip();
  $('orient-lbl').textContent = S.land ? 'Landscape' : 'Portrait';
  $('pageinfo').textContent = `Letter · ${S.land ? 'Landscape' : 'Portrait'}`;
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
const thumb = t => { if (t === 'sup') return `<svg viewBox="-80 -30 100 60"><path d="M-22 -13L-22 13L0 0Z" fill="#000"/><line x1="0" y1="0" x2="18" y2="0" stroke="#000" stroke-width="4"/><text x="-30" y="9" font-size="26" font-weight="700" text-anchor="end" font-family="Arial">L1</text></svg>`;
  const s = PSYM[LIB[t].sym], e = extentOf(t), pad = 8; return `<svg viewBox="${e.x0 - pad} ${s.y0 - pad} ${e.x1 - e.x0 + 2 * pad} ${s.y1 - s.y0 + 2 * pad}"><g fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${s.b}</g></svg>`; };
const short = n => n.replace('Pushbutton', 'PB').replace('Emergency Stop', 'E-Stop').replace('Temperature', 'Temp.').replace('Proximity', 'Prox.').replace('Selector Switch', 'Selector').replace(', Held Closed', ' (HC)').replace(', Held Open', ' (HO)').replace('Toggle Switch (SPST)', 'Toggle').replace('Overload Heater (1 line)', 'OL Heater').replace('Phase (L1, L2, L3)', 'Phase').replace('3-Phase', '3Ø');
function buildPalette() {
  let h = '';
  for (const c of CATS) { h += `<div class="ph">${c}</div><div class="pg">`;
    for (const [t, d] of Object.entries(LIB)) if (d.cat === c) h += `<div class="pt" data-t="${t}" title="${esc(d.name)}">${thumb(t)}<span>${esc(short(d.name))}</span></div>`;
    h += '</div>'; }
  $('palette').innerHTML = h;
  for (const el of document.querySelectorAll('.pt')) el.addEventListener('pointerdown', e => {
    e.preventDefault(); const t = el.dataset.t; startPlacing(t);
    // (dragged out onto the sheet: put down where it is let go)
    const up = ev => { window.removeEventListener('pointerup', up);
      const r = svg.getBoundingClientRect(); if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom && tool === 'place') putDown(sheetPt(ev), ev.shiftKey); };
    window.addEventListener('pointerup', up);
  });
  let m = '';
  for (const c of CATS) { m += `<div class="menuwrap"><button class="rb" data-menu="${c}"><span class="sw" style="border-color:${CAT_COL[c]}"></span><span>${c} ▾</span></button><div class="dmenu" hidden>`;
    for (const [t, d] of Object.entries(LIB)) if (d.cat === c) m += `<button data-t="${t}">${thumb(t).replace('<svg', '<svg style="width:46px;height:26px;background:#f4f5f6;border-radius:4px;padding:2px"')}${esc(d.name)}</button>`;
    m += '</div></div>'; }
  $('sym-menus').innerHTML = m;
  for (const b of document.querySelectorAll('[data-menu]')) b.addEventListener('click', e => { e.stopPropagation(); const d = b.nextElementSibling, open = d.hidden; closeMenus(); d.hidden = !open; if (open) { const r = b.getBoundingClientRect(); d.style.position = 'fixed'; d.style.left = r.left + 'px'; d.style.top = (r.bottom + 6) + 'px'; } });
  for (const b of document.querySelectorAll('#sym-menus .dmenu button')) b.addEventListener('click', () => { closeMenus(); startPlacing(b.dataset.t); });
}
const closeMenus = () => { for (const d of document.querySelectorAll('.dmenu')) d.hidden = true; };
document.addEventListener('click', e => { if (!e.target.closest('.menuwrap')) closeMenus(); });

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
      ${p.t === 'sup' ? `<div class="f">Line<div class="seg">${['L1', 'L2', 'L3'].map(l => `<button data-line="${l}" aria-pressed="${p.tag === l}">${l}</button>`).join('')}</div></div>` : `
      ${k === 'contact' || k === 'starter' || k === 'olc' ? `<div class="f">Worked by<select id="p-of">${[...new Set([...list, p.tag].filter(Boolean))].map(x => `<option value="${esc(x)}"${x === p.tag ? ' selected' : ''}>${esc(x)}${list.includes(x) ? '' : ' (no ' + (k === 'olc' ? 'overload' : 'coil') + ' yet)'}</option>`).join('')}${list.length || p.tag ? '' : `<option value="">(place a ${k === 'olc' ? 'overload' : 'coil'} first)</option>`}<option value="__other">Other…</option></select></div>`
        : `<div class="f">${k === 'coil' || k === 'sw' ? 'Letter' : 'Number'}<input class="in" id="p-tag" value="${esc(p.tag)}" autocomplete="off"></div>`}`}
      ${p.t === 'fdsc3' ? `<div class="f">Fuses<input class="in" id="p-fu" value="${esc(p.fu || '')}" autocomplete="off" title="The first of its three fuses: FU1 makes them FU1, FU2, FU3"></div><div class="f">&nbsp;<span class="ro">${esc(tagsOf(p).slice(1).join(', '))}</span></div>` : ''}
      ${k === 'coil' ? `<div class="f">Kind<select id="p-pre">${COIL_PRE.map(([v, n]) => `<option value="${v}"${(p.pre || 'CR') === v ? ' selected' : ''}>${n} (${v})</option>`).join('')}</select></div>` : ''}
      ${d.flip ? `<div class="f">Contact<div class="seg"><button data-flip="${/_no$|_hc$/.test(p.t) ? p.t : d.flip}" aria-pressed="${/_no$|_hc$/.test(p.t)}">${/_h[co]$/.test(p.t) ? 'NO (HC)' : 'NO'}</button><button data-flip="${/_nc$|_ho$/.test(p.t) ? p.t : d.flip}" aria-pressed="${/_nc$|_ho$/.test(p.t)}">${/_h[co]$/.test(p.t) ? 'NC (HO)' : 'NC'}</button></div></div>` : ''}
      ${p.t !== 'sup' ? `<div class="f">Label<input class="in" id="p-desc" value="${esc(p.desc)}" placeholder="${k === 'load' && p.t === 'pl' ? 'e.g. RED' : 'e.g. HIGH TEMP'}"></div>` : ''}
      ${rn ? `<div class="f">Rung<span class="ro">${rn} (automatic)</span></div>` : ''}
      ${termNums.length ? `<div class="f">Wires<span class="ro">${termNums.join(' → ')} (automatic)</span></div>` : ''}
      ${xr && xr.length ? `<div class="f">Contacts on<span class="ro">${xr.map(o => o.n + (o.nc ? ' (NC)' : '')).join(', ')}</span></div>` : ''}
      <div class="acts">${termsN(p) === 2 ? '<button class="btn" id="p-rot">Rotate (R)</button>' : ''}<button class="btn del" id="p-del">Delete</button></div>`;
    const of = $('p-of'); if (of) of.addEventListener('change', () => { let v = of.value; if (v === '__other') { v = (prompt(k === 'olc' ? 'The overload this contact belongs to (e.g. OL2):' : 'The coil that works this contact (e.g. CR3):', p.tag || '') || '').trim().toUpperCase(); if (!v) { renderProps(); return; } }
      snapshot(); p.tag = v; refresh(); });
    const tg = $('p-tag'); if (tg) tg.addEventListener('input', () => edit(() => { p.tag = tg.value.trim().toUpperCase(); if (k === 'coil') lastCoil = p.tag; }));
    if (tg) tg.addEventListener('change', () => renderProps());
    const fu = $('p-fu'); if (fu) { fu.addEventListener('input', () => edit(() => { p.fu = fu.value.trim().toUpperCase(); })); fu.addEventListener('change', () => renderProps()); }
    const ds = $('p-desc'); if (ds) ds.addEventListener('input', () => edit(() => { p.desc = ds.value.toUpperCase(); }));
    const pr = $('p-pre'); if (pr) pr.addEventListener('change', () => { snapshot(); p.pre = pr.value; p.tag = ''; p.tag = nextTag(p.pre); lastCoil = p.tag; refresh(); });
    for (const b of P.querySelectorAll('[data-flip]')) b.addEventListener('click', () => { if (b.dataset.flip === p.t) return; snapshot(); p.t = b.dataset.flip; refresh(); });
    for (const b of P.querySelectorAll('[data-line]')) b.addEventListener('click', () => { snapshot(); p.tag = b.dataset.line; refresh(); });
    const ro = $('p-rot'); if (ro) ro.addEventListener('click', () => { snapshot(); rotateParts(S, new Set([p.id])); refresh(); });
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
$('addsheet-btn').addEventListener('click', () => { snapshot(); doc.sheets.push(newSheet(true, S.land)); doc.cur = doc.sheets.length - 1; sel = new Set(); selW = null; refresh(); fitZoom(); });
$('orient-btn').addEventListener('click', () => {
  snapshot(); S.land = !S.land;
  // (an empty sheet: its rails laid out afresh for the new way round; otherwise kept on the paper)
  const rails = S.parts.filter(p => p.t === 'rail');
  if (rails.length === S.parts.length && !S.wires.length && !S.texts.length) { const f = newSheet(true, S.land); S.parts = f.parts; }
  refresh(true);
  for (const r of S.parts) if (r.t === 'rail') { r.y1 = Math.min(r.y1, snap(VB[1] - 60)); r.y0 = Math.min(r.y0, r.y1 - 200); r.x = Math.min(r.x, snap(VB[0] - 60)); }
  refresh(); fitZoom();
});

/* ---------- the title block ---------- */
function renderTB() {
  const f = doc.tb.fields;
  $('tb-rows').innerHTML = `<div class="tbrow tbhead"><span></span><span>Label</span><span>What it says</span><span>Width</span><span>Large</span><span></span><span></span><span></span></div>` + f.map((x, i) => `<div class="tbrow" data-i="${i}">
    <span class="num">${i + 1}</span><input type="text" data-k="label" value="${esc(x.label)}"><input type="text" data-k="value" value="${esc(x.value)}">
    <select data-k="span">${[1, 2, 3, 4, 5, 6, 8, 12].map(n => `<option value="${n}"${(x.span || 2) === n ? ' selected' : ''}>${n}/12</option>`).join('')}</select>
    <label><input type="checkbox" data-k="big"${x.big ? ' checked' : ''}>big</label>
    <button class="ib" data-mv="-1" title="Earlier"${i ? '' : ' disabled'}>↑</button><button class="ib" data-mv="1" title="Later"${i < f.length - 1 ? '' : ' disabled'}>↓</button><button class="ib" data-rm="1" title="Take this box away">✕</button></div>`).join('');
  $('tb-shownotes').checked = !!doc.tb.showNotes; $('tb-notes').value = doc.tb.notes || '';
  for (const r of document.querySelectorAll('.tbrow[data-i]')) { const i = +r.dataset.i;
    for (const el of r.querySelectorAll('[data-k]')) el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => { const x = f[i]; const k = el.dataset.k; x[k] = k === 'span' ? +el.value : k === 'big' ? el.checked : el.value; refresh(true); });
    for (const b of r.querySelectorAll('[data-mv]')) b.addEventListener('click', () => { const j = i + +b.dataset.mv; [f[i], f[j]] = [f[j], f[i]]; renderTB(); refresh(true); });
    r.querySelector('[data-rm]').addEventListener('click', () => { f.splice(i, 1); renderTB(); refresh(true); }); }
}
$('tb-btn').addEventListener('click', () => { snapshot(); renderTB(); $('tb-dlg').showModal(); });
$('tb-add').addEventListener('click', () => { doc.tb.fields.push({ id: uid('f'), label: 'New Box', value: '', span: 3 }); renderTB(); refresh(true); const r = document.querySelectorAll('.tbrow[data-i]'); r[r.length - 1].querySelector('input').select(); });
$('tb-shownotes').addEventListener('change', e => { doc.tb.showNotes = e.target.checked; refresh(true); });
$('tb-notes').addEventListener('input', e => { doc.tb.notes = e.target.value; refresh(true); });
$('tb-reset').addEventListener('click', () => { doc.tb = defaultTB(); renderTB(); refresh(true); });
$('tb-done').addEventListener('click', () => $('tb-dlg').close());

/* ---------- zoom and panning ---------- */
const pageSize = () => S.land ? [1056, 816] : [816, 1056];
// the room round the page: enough to bring any part of it (its edges too) to the middle of the window, so zooming
// about the pointer never runs out of room (Fit puts the page back in the middle)
const padX = () => zoomer.clientWidth * .6, padY = () => zoomer.clientHeight * .6;
function applyZoom() { const [w, h] = pageSize(), px = padX(), py = padY();
  host.style.transform = `scale(${zoom})`; host.style.left = px + 'px'; host.style.top = py + 'px';
  sizer.style.width = (w * zoom + 2 * px) + 'px'; sizer.style.height = (h * zoom + 2 * py) + 'px'; $('z-lvl').textContent = Math.round(zoom * 100) + '%'; }
function fitZoom() { const [w, h] = pageSize(); zoom = Math.max(.2, Math.min(3, Math.min((zoomer.clientWidth - 48) / w, (zoomer.clientHeight - 48) / h))); applyZoom();
  zoomer.scrollLeft = padX() + w * zoom / 2 - zoomer.clientWidth / 2; zoomer.scrollTop = padY() + h * zoom / 2 - zoomer.clientHeight / 2; }
// zoomed by f about a point on the screen (the pointer; else the middle): that point stays where it is
function zoomBy(f, cx, cy) {
  const r = zoomer.getBoundingClientRect(); cx = cx ?? r.left + r.width / 2; cy = cy ?? r.top + r.height / 2;
  const qx = (zoomer.scrollLeft + cx - r.left - padX()) / zoom, qy = (zoomer.scrollTop + cy - r.top - padY()) / zoom;
  zoom = Math.max(.2, Math.min(4, zoom * f)); applyZoom();
  zoomer.scrollLeft = qx * zoom + padX() - (cx - r.left); zoomer.scrollTop = qy * zoom + padY() - (cy - r.top);
}
$('z-in').addEventListener('click', () => zoomBy(1.25)); $('z-out').addEventListener('click', () => zoomBy(.8)); $('z-fit').addEventListener('click', fitZoom);
zoomer.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
function startPan(e) { e.preventDefault(); pan = { x: e.clientX, y: e.clientY, l: zoomer.scrollLeft, t: zoomer.scrollTop }; desk.classList.add('pan'); svg.setPointerCapture(e.pointerId); }
function doPan(e) { zoomer.scrollLeft = pan.l - (e.clientX - pan.x); zoomer.scrollTop = pan.t - (e.clientY - pan.y); }
window.addEventListener('resize', () => { if (svg) { VB = fitDraw(host.firstElementChild); drawEd(); } });

/* ---------- files ---------- */
let saveT = null;
function autosave() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(AUTOSAVE, JSON.stringify(doc)); localStorage.setItem(SHOWKEY, JSON.stringify(SHOW)); } catch (_) {} }, 400); }
function loadDoc(d) {
  if (!d || d.kind !== 'o3-print' || !Array.isArray(d.sheets) || !d.sheets.length) throw new Error('not a Print Builder file');
  for (const s of d.sheets) { s.parts ||= []; s.wires ||= []; s.nodes ||= []; s.texts ||= []; for (const p of s.parts) if (p.t !== 'rail' && !LIB[p.t]) throw new Error('unknown symbol ' + p.t); }
  d.tb ||= defaultTB(); d.cur = Math.min(d.cur || 0, d.sheets.length - 1);
  doc = d; S = doc.sheets[doc.cur]; sel = new Set(); selW = null; UNDO.length = 0; REDO.length = 0;
  // (a fused disconnect from before its fuses were numbered: the next three numbers)
  for (const s of d.sheets) for (const p of s.parts) if (p.t === 'fdsc3' && !p.fu) p.fu = nextTag('FU');
}
const fileName = () => ((doc.tb.fields.find(f => /title/i.test(f.label)) || {}).value || 'Print').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Print';
$('save-btn').addEventListener('click', () => {
  const b = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = fileName() + '.o3print.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  say('Saved to your Downloads as ' + a.download);
});
$('open-btn').addEventListener('click', () => $('file-in').click());
$('file-in').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const d = JSON.parse(await f.text()); snapshot(); const keep = UNDO.slice(); loadDoc(d); UNDO.push(...keep); refresh(true); fitZoom(); say('Opened ' + f.name); }
  catch (err) { alert('That file could not be opened: it is not a Print Builder file (' + err.message + ').'); }
});
$('new-btn').addEventListener('click', e => { e.stopPropagation(); const m = $('new-menu'), o = m.hidden; closeMenus(); m.hidden = !o; });
for (const b of document.querySelectorAll('[data-new]')) b.addEventListener('click', () => { closeMenus(); snapshot(); const keep = UNDO.slice(); loadDoc(template(b.dataset.new)); UNDO.push(...keep); refresh(true); fitZoom(); });

/* ---------- printing: every sheet, each on its own page the right way round ---------- */
function printAll() {
  const ph = $('print-host');
  ph.innerHTML = doc.sheets.map((s, k) => pageHTML(s, k, A)).join('');
  ph.style.cssText = 'display:block;position:fixed;left:-30000px;top:0';
  for (const p of ph.querySelectorAll('.pr-page')) fitDraw(p);
  ph.style.cssText = '';
  $('print-page').textContent = '@page port { size: 8.5in 11in; margin: 0; } @page land { size: 11in 8.5in; margin: 0; } @page { margin: 0; }';
  setTimeout(() => window.print(), 30);
}
window.addEventListener('afterprint', () => { $('print-host').innerHTML = ''; });
$('print-btn').addEventListener('click', printAll);

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
    if (k === 's') { e.preventDefault(); $('save-btn').click(); return; }
    if (k === 'p') { e.preventDefault(); printAll(); return; }
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
  if (e.key === 'Escape') { if (wd) finishWire(); else if (tool !== 'select') setTool('select'); else { sel = new Set(); selW = null; refresh(); } return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelection(); return; }
  const k = e.key.toLowerCase();
  if (k === 'r') { if (tool === 'place' && placing) { if (termsOf(placing.t).length === 2) placing.rot = ((placing.rot || 0) + 90) % 360; drawEd(); } else if (sel.size) { snapshot(); rotateParts(S, sel); refresh(); } return; }
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
  try { if (d) loadDoc(d); else loadDoc(template('starter')); } catch (_) { loadDoc(template('blank')); }
  buildPalette(); refresh(true); setTool('select'); requestAnimationFrame(fitZoom);
}
start();
