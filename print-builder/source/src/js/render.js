/* =====================================================================
   Drawing a sheet: the page (frame, drawing, title block), as it prints. The editor draws its own marks
   (selection, the grid, loose ends, what Check Print found) over the drawing, in a layer that never prints.
   ===================================================================== */
const PW = 4;                                  // the wires' weight (the symbols' lines are drawn to it)
let SHOW = { wn: true, rn: true, xr: true };   // wire numbers, rung numbers, cross-references
let LABS = [], PLABS = [];                     // (PLABS: the parts' tags and labels on the sheet on screen, for dragging)
// the box a line of text takes up (Arial bold, roughly)
function lblBox(x, y, t, size, anchor) { const w = String(t).length * size * .62, x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2; return { x0, x1: x0 + w, y0: y - size * .8, y1: y + size * .15 }; }                                 // the wire numbers on the sheet on screen: { id (its wire), l, x, y, anchor, x0..y1 }
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// the sheet's drawing (no editor marks): an SVG group's insides
function drawSheet(s, k, A) {
  let g = ''; PLABS = [];
  const line = (x1, y1, x2, y2, w = PW) => { g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}"/>`; };
  const text = (x, y, t, size = 26, anchor = 'middle', weight = 700, extra = '') => { if (t !== '' && t != null) g += `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}"${extra}>${esc(t)}</text>`; };
  const arrow = (x, y, ux, uy) => { const bx = x - ux * 22, by = y - uy * 22, px = -uy * 13, py = ux * 13;
    g += `<path d="M${bx + px} ${by + py}L${bx - px} ${by - py}L${x} ${y}Z" fill="#000" stroke="#000" stroke-width="2"/>`; };
  // rails
  const rails = s.parts.filter(p => p.t === 'rail');
  for (const r of rails) { line(r.x, r.y0, r.x, r.y1);
    // (fed at its top by a wire, from the transformer: no arrow, its name beside it)
    const fed = s.wires.some(w => [w.a, w.b].some(e => e.r === r.id && e.y <= r.y0));
    if (fed) text(r.x + (r.label === 'L1' ? -14 : 14), r.y0 + 40, r.label, 26, r.label === 'L1' ? 'end' : 'start');
    else { arrow(r.x, r.y0, 0, 1); text(r.x, r.y0 - 34, r.label, 28); } }
  // wires, then their numbers (placed clear of the symbols, their tags and the other wires; see wireLabels)
  for (const w of s.wires) g += `<polyline points="${wirePts(s, w).map(q => q.join(',')).join(' ')}"/>`;
  LABS = SHOW.wn ? wireLabels(s, A) : [];
  for (const L of LABS) text(L.x, L.y, L.l, 22, L.anchor);
  // joints: three or more wires at a node or a terminal; a wire teed onto a rail
  const deg = new Map(), bump = (x, y) => { const c = x + ',' + y; deg.set(c, (deg.get(c) || 0) + 1); };
  for (const w of s.wires) for (const e of [w.a, w.b]) { const [x, y] = pos(s, e); if (e.r) { const r = partOf(s, e.r); if (r && y > r.y0 && y < r.y1) { deg.set(x + ',' + y, 9); continue; } } bump(x, y); }
  for (const [c, n] of deg) { if (n < 3) { const [x, y] = c.split(',').map(Number); if (!(n === 2 && s.parts.some(p => p.t !== 'rail' && [...Array(termsN(p)).keys()].some(i => { const q = termPos(p, i); return q[0] === x && q[1] === y; })))) continue; }
    const [x, y] = c.split(',').map(Number); g += `<circle cx="${x}" cy="${y}" r="7" fill="#000" stroke="none"/>`; }
  // devices
  for (const p of s.parts) {
    if (p.t === 'rail') continue;
    // (a part's tag and label: where they go, moved by however far they have been dragged; each one's box kept for picking)
    const lt = p.lt || [0, 0], ld = p.ld || [0, 0];
    const tagT = (x, y, t, size, anchor = 'middle') => { if (!t) return; x += lt[0]; y += lt[1]; text(x, y, t, size, anchor); PLABS.push({ id: p.id, which: 'tag', ...lblBox(x, y, t, size, anchor) }); };
    const descT = (x, y, t, size, anchor = 'middle') => { if (!t) return; x += ld[0]; y += ld[1]; text(x, y, t, size, anchor, 500); PLABS.push({ id: p.id, which: 'desc', ...lblBox(x, y, t, size, anchor) }); };
    if (p.t === 'sup') { arrow(p.x, p.y, 1, 0); tagT(p.x - 30, p.y + 10, p.tag, 28, 'end'); continue; }
    const sym = PSYM[LIB[p.t].sym], r = p.rot || 0, kind = LIB[p.t].kind;
    g += `<g class="sym" transform="translate(${p.x} ${p.y})${r ? ` rotate(${r})` : ''}">${sym.b}</g>`;
    const up = r % 180 !== 0, inside = (kind === 'coil' && (p.tag || '').length <= 4) || kind === 'motor';
    if (up) { const off = Math.max(Math.abs(sym.y0), Math.abs(sym.y1)) + 10; tagT(p.x + off, p.y + 9, p.tag, 26, 'start'); if (p.desc) descT(p.x + off, p.y + 34, p.desc, 20, 'start'); }
    else {
      const y0 = r === 180 ? -sym.y1 : sym.y0, y1 = r === 180 ? -sym.y0 : sym.y1;
      if (p.t === 'fdsc3' && !r) tagsOf(p).slice(1).forEach((tg, i) => tagT(p.x + 40, termPos(p, 2 * i)[1] - 24, tg, 26));   // (a fused disconnect's fuses, each its number)
      if (p.t === 'fus3' && !r) tagsOf(p).forEach((tg, i) => tagT(p.x, termPos(p, 2 * i)[1] - 24, tg, 26));   // (each fuse its own number)
      else if (inside) text(p.x, p.y + (kind === 'motor' ? 11 : 10), p.tag, kind === 'motor' ? 30 : (p.tag || '').length > 3 ? 22 : 27); else tagT(p.x, p.y + y0 - 8, p.tag, 26);
      if (p.desc) descT(p.x, p.y + y1 + 22, p.desc, 20);
    }
    if (p.t === 'xfmr') { const t = [0, 1, 2, 3].map(i => termPos(p, i)), nm = ['H1', 'H2', 'X1', 'X2'];
      t.forEach((q, i) => text(q[0] + (i % 2 ? 12 : -12), q[1] + (i < 2 ? -8 : 22), nm[i], 18, i % 2 ? 'start' : 'end', 600)); }
  }
  // rung numbers, left of L1; cross-references, right of L2
  const rL1 = rails.find(r => r.label === 'L1'), rL2 = rails.find(r => r.label === 'L2');
  if (SHOW.rn) for (const { y, n } of A.rows[k] || []) {
    // (left of everything on its row: L1, the symbols, and any wire that runs along the row or comes down across it)
    const xs = s.parts.filter(p => p.t !== 'rail' && p.y === y).map(p => p.x + extentOf(p.t).x0);
    for (const w of s.wires) { const P = wirePts(s, w); for (let i = 0; i < P.length - 1; i++) { const [a, b] = [P[i], P[i + 1]];
      if (a[1] === y && b[1] === y) xs.push(Math.min(a[0], b[0])); else if (a[0] === b[0] && Math.min(a[1], b[1]) <= y && Math.max(a[1], b[1]) >= y) xs.push(a[0]); } }
    if (rL1 && y >= rL1.y0 && y <= rL1.y1) xs.push(rL1.x);
    if (xs.length) text(Math.min(...xs) - 50, y + 9, n, 24, 'end');
  }
  if (SHOW.xr) for (const p of s.parts) { const r = A.xref.get(p.id); if (!r || !r.length) continue;
    // (right of everything on its row: L2, the symbols, and any wire along the row or crossing it)
    const xs = s.parts.filter(q => q.t !== 'rail' && q.y === p.y).map(q => q.x + extentOf(q.t).x1);
    for (const w of s.wires) { const P = wirePts(s, w); for (let i = 0; i < P.length - 1; i++) { const [a, b] = [P[i], P[i + 1]];
      if (a[1] === p.y && b[1] === p.y) xs.push(Math.max(a[0], b[0])); else if (a[0] === b[0] && Math.min(a[1], b[1]) <= p.y && Math.max(a[1], b[1]) >= p.y) xs.push(a[0]); } }
    if (rL2 && p.y >= rL2.y0 && p.y <= rL2.y1) xs.push(rL2.x);
    const x = Math.max(...xs) + 26;
    g += `<text x="${x}" y="${p.y + 9}" font-size="22" font-weight="700">${r.map(o => o.nc ? `<tspan text-decoration="underline">${o.n}</tspan>` : o.n).join(', ')}</text>`; }
  // notes
  for (const t of s.texts) { const lines = String(t.s || '').split('\n');
    g += `<text x="${t.x}" y="${t.y}" font-size="${t.size || 24}" font-weight="${t.bold ? 700 : 500}">${lines.map((l, i) => `<tspan x="${t.x}" dy="${i ? (t.size || 24) * 1.25 : 0}">${esc(l)}</tspan>`).join('')}</text>`; }
  return g;
}

// the title block: its fields in a 12-column grid, rows filled in order; its notes under them
function tbHTML(k, n) {
  const tb = doc.tb, val = v => String(v ?? '').replace(/\{sheet\}/gi, `${k + 1} of ${n}`).replace(/\{date\}/gi, today());
  // (a box that would not fit on its row starts the next: the row's end filled, so no gaps show)
  let cells = '', col = 0;
  const fill = n => { if (n > 0) cells += `<div class="tbf" style="grid-column: span ${n}"></div>`; };
  for (const f of tb.fields) { const sp = Math.max(1, Math.min(12, f.span || 2)); if (col + sp > 12) { fill(12 - col); col = 0; }
    cells += `<div class="tbf${f.big ? ' big' : ''}" style="grid-column: span ${sp}"><div class="k">${esc(f.label)}</div><div class="v">${esc(val(f.value))}</div></div>`; col = (col + sp) % 12; }
  if (col) fill(12 - col);
  const notes = tb.showNotes && tb.notes.trim() ? `<div class="notes"><span class="k">Notes</span>${tb.notes.split('\n').filter(l => l.trim()).map((l, i) => `<span>${i + 1}. ${esc(l)}</span>`).join('')}</div>` : '';
  return `<div class="pr-tb">${cells}${notes}</div>`;
}
// a whole page; the drawing's viewBox is set once it is laid out (see fitDraw)
function pageHTML(s, k, A, editor = false) {
  return `<div class="pr-page${s.land ? ' land' : ''}" data-k="${k}"><div class="pr-frame"><div class="pr-draw"><svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet"${editor ? ' id="sv"' : ''}>${editor ? '<g id="ed-under"></g>' : ''}<g class="ink" fill="none" stroke="#000" stroke-width="${PW}" stroke-linecap="round" stroke-linejoin="round">${drawSheet(s, k, A)}</g>${editor ? '<g id="ed-over"></g>' : ''}</svg></div>${tbHTML(k, doc.sheets.length)}</div></div>`;
}
// a page's drawing given its viewBox: a unit 1/312.5 in, whatever the room the title block leaves
function fitDraw(page) {
  const d = page.querySelector('.pr-draw'), svg = d.querySelector('svg'), cs = getComputedStyle(d);
  const w = d.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h = d.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const vw = Math.round(w * U_IN / 96), vh = Math.round(h * U_IN / 96);
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  return [vw, vh];
}

/* ---------- wire numbers: where each goes ---------- */
// One number for each run of wire: wires that carry straight on through a joint count as one run (as Circuit
// Builder prints them). Each goes above a level run or beside an upright one, at the first spot that is clear of
// the symbols and their tags, the other numbers and the other wires; one dragged somewhere stays there.
function wireLabels(s, A) {
  const out = [], boxes = s.parts.filter(p => p.t !== 'rail').map(p => partBox(p));
  for (const t of s.texts) boxes.push(textBox(t));
  for (const r of s.parts) if (r.t === 'rail') boxes.push({ x0: r.x - 30, x1: r.x + 30, y0: r.y0 - 60, y1: r.y0 + 50 });
  const segs = s.wires.flatMap(w => { const P = wirePts(s, w); return P.slice(1).map((q, i) => ({ w, a: P[i], b: q })); });
  const hits = (R, own) => boxes.some(b => R.x0 < b.x1 && R.x1 > b.x0 && R.y0 < b.y1 && R.y1 > b.y0) || out.some(b => R.x0 < b.x1 + 6 && R.x1 > b.x0 - 6 && R.y0 < b.y1 + 4 && R.y1 > b.y0 - 4)
    || segs.some(g => !own.has(g.w) && Math.max(g.a[0], g.b[0]) >= R.x0 - 8 && Math.min(g.a[0], g.b[0]) <= R.x1 + 8 && Math.max(g.a[1], g.b[1]) >= R.y0 - 16 && Math.min(g.a[1], g.b[1]) <= R.y1 + 16);
  const rect = (l, x, y, anchor) => { const wd = String(l).length * 13 + 4, x0 = anchor === 'start' ? x : anchor === 'end' ? x - wd : x - wd / 2; return { x0, x1: x0 + wd, y0: y - 18, y1: y + 3 }; };
  const runs = runsOf(s);
  // (the ones dragged into place first, so the others keep clear of them)
  const list = [...new Set(runs.values())].sort((a, b) => (b.some(w => w.lab) ? 1 : 0) - (a.some(w => w.lab) ? 1 : 0));
  for (const ws of list) {
    const l = A.label.get(A.wireRoot(s, ws[0])); if (!l || ws.every(w => w.hideNum)) continue;
    const own = new Set(ws), fixed = ws.find(w => w.lab && !w.hideNum);
    if (fixed) { const [x, y] = fixed.lab; out.push({ id: fixed.id, l, x, y, anchor: 'middle', ...rect(l, x, y, 'middle') }); continue; }
    const cand = [];
    for (const w of ws) { if (w.hideNum) continue; const P = wirePts(s, w);
      for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], h = a[1] === b[1], len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); if (len < 40) continue;
        cand.push({ w, a, b, h, len, sc: len * (h ? 2 : 1) }); } }
    cand.sort((p, q) => q.sc - p.sc);
    let put = null;
    for (const c of cand) { for (const f of [.5, .35, .65, .2, .8]) { const spots = c.h ? [[c.a[0] + (c.b[0] - c.a[0]) * f, c.a[1] - 9, 'middle'], [c.a[0] + (c.b[0] - c.a[0]) * f, c.a[1] + 27, 'middle']]
        : [[c.a[0] + 10, c.a[1] + (c.b[1] - c.a[1]) * f + 8, 'start'], [c.a[0] - 10, c.a[1] + (c.b[1] - c.a[1]) * f + 8, 'end']];
        for (const [x, y, an] of spots) { const R = rect(l, x, y, an); if (!hits(R, own)) { put = { id: c.w.id, l, x: Math.round(x), y: Math.round(y), anchor: an, ...R }; break; } }
        if (put) break; } if (put) break; }
    if (!put && cand.length) { const c = cand[0], x = c.h ? (c.a[0] + c.b[0]) / 2 : c.a[0] + 10, y = c.h ? c.a[1] - 9 : (c.a[1] + c.b[1]) / 2 + 8, an = c.h ? 'middle' : 'start'; put = { id: c.w.id, l, x, y, anchor: an, ...rect(l, x, y, an) }; }
    if (put) out.push(put);
  }
  return out;
}
// the runs of wire on a sheet: wire id → the wires of its run (wires carrying straight on through a joint)
function runsOf(s) {
  const up = new Map(s.wires.map(w => [w.id, w.id])), find = id => { while (up.get(id) !== id) id = up.get(id); return id; };
  for (const n of s.nodes) { const ws = wiresAt(s, { n: n.id }), dir = w => { const P = wirePts(s, w), at = sameEnd(w.a, { n: n.id }) ? 0 : P.length - 1, o = P[at ? at - 1 : 1]; return [Math.sign(o[0] - n.x), Math.sign(o[1] - n.y)]; };
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) { const a = dir(ws[i]), b = dir(ws[j]); if (a[0] === -b[0] && a[1] === -b[1]) up.set(find(ws[i].id), find(ws[j].id)); } }
  const g = new Map(); for (const w of s.wires) { const r = find(w.id); if (!g.has(r)) g.set(r, []); g.get(r).push(w); }
  return new Map(s.wires.map(w => [w.id, g.get(find(w.id))]));
}
const runWires = w => runsOf(S).get(w.id) || [w];
