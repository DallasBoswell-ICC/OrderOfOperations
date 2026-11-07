/* =====================================================================
   Drawing a sheet: the page (frame, drawing, title block), as it prints. The editor draws its own marks
   (selection, the grid, loose ends, what Check Print found) over the drawing, in a layer that never prints.
   ===================================================================== */
const PW = 4;                                  // the wires' weight (the symbols' lines are drawn to it)
let SHOW = { wn: true, rn: true, xr: true };   // wire numbers, rung numbers, cross-references
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// the sheet's drawing (no editor marks): an SVG group's insides
function drawSheet(s, k, A) {
  let g = '';
  const line = (x1, y1, x2, y2, w = PW) => { g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}"/>`; };
  const text = (x, y, t, size = 26, anchor = 'middle', weight = 700, extra = '') => { if (t !== '' && t != null) g += `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}"${extra}>${esc(t)}</text>`; };
  const arrow = (x, y, ux, uy) => { const bx = x - ux * 22, by = y - uy * 22, px = -uy * 13, py = ux * 13;
    g += `<path d="M${bx + px} ${by + py}L${bx - px} ${by - py}L${x} ${y}Z" fill="#000" stroke="#000" stroke-width="2"/>`; };
  // rails
  const rails = s.parts.filter(p => p.t === 'rail');
  for (const r of rails) { line(r.x, r.y0, r.x, r.y1, PW + 2);
    // (fed at its top by a wire, from the transformer: no arrow, its name beside it)
    const fed = s.wires.some(w => [w.a, w.b].some(e => e.r === r.id && e.y <= r.y0));
    if (fed) text(r.x + (r.label === 'L1' ? -14 : 14), r.y0 + 40, r.label, 26, r.label === 'L1' ? 'end' : 'start');
    else { arrow(r.x, r.y0, 0, 1); text(r.x, r.y0 - 34, r.label, 28); } }
  // wires, and their numbers
  for (const w of s.wires) {
    const P = wirePts(s, w);
    g += `<polyline points="${P.map(q => q.join(',')).join(' ')}"/>`;
    if (!SHOW.wn) continue;
    const l = A.label.get(A.wireRoot(s, w)); if (!l) continue;
    let best = null;
    for (let i = 0; i < P.length - 1; i++) { const [a, b] = [P[i], P[i + 1]], h = a[1] === b[1], len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
      const sc = len * (h ? 2 : 1); if (len >= 46 && (!best || sc > best.sc)) best = { a, b, h, sc }; }
    if (!best) continue;
    if (best.h) text((best.a[0] + best.b[0]) / 2, best.a[1] - 9, l, 22);
    else {   // (upright: beside it, clear of the wires that cross it)
      const x = best.a[0], ya = Math.min(best.a[1], best.b[1]), yb = Math.max(best.a[1], best.b[1]);
      const crossing = y => s.wires.some(v => v !== w && wirePts(s, v).some((q, i, V) => i < V.length - 1 && q[1] === V[i + 1][1] && Math.abs(q[1] - y) < 34 && Math.min(q[0], V[i + 1][0]) < x + 60 && Math.max(q[0], V[i + 1][0]) > x));
      const f = [.5, .3, .7, .2, .8, .4, .6].find(f => !crossing(ya + (yb - ya) * f)) ?? .5;
      text(x + 10, ya + (yb - ya) * f + 8, l, 22, 'start');
    }
  }
  // joints: three or more wires at a node or a terminal; a wire teed onto a rail
  const deg = new Map(), bump = (x, y) => { const c = x + ',' + y; deg.set(c, (deg.get(c) || 0) + 1); };
  for (const w of s.wires) for (const e of [w.a, w.b]) { const [x, y] = pos(s, e); if (e.r) { const r = partOf(s, e.r); if (r && y > r.y0 && y < r.y1) { deg.set(x + ',' + y, 9); continue; } } bump(x, y); }
  for (const [c, n] of deg) { if (n < 3) { const [x, y] = c.split(',').map(Number); if (!(n === 2 && s.parts.some(p => p.t !== 'rail' && [...Array(termsN(p)).keys()].some(i => { const q = termPos(p, i); return q[0] === x && q[1] === y; })))) continue; }
    const [x, y] = c.split(',').map(Number); g += `<circle cx="${x}" cy="${y}" r="7" fill="#000" stroke="none"/>`; }
  // devices
  for (const p of s.parts) {
    if (p.t === 'rail') continue;
    if (p.t === 'sup') { arrow(p.x, p.y, 1, 0); text(p.x - 30, p.y + 10, p.tag, 28, 'end'); continue; }
    const sym = PSYM[LIB[p.t].sym], r = p.rot || 0, kind = LIB[p.t].kind;
    g += `<g class="sym" transform="translate(${p.x} ${p.y})${r ? ` rotate(${r})` : ''}">${sym.b}</g>`;
    const up = r % 180 !== 0, inside = kind === 'coil' && (p.tag || '').length <= 3;
    if (up) { const off = Math.max(Math.abs(sym.y0), Math.abs(sym.y1)) + 10; text(p.x + off, p.y + 9, p.tag, 26, 'start'); if (p.desc) text(p.x + off, p.y + 34, p.desc, 20, 'start', 500); }
    else {
      const y0 = r === 180 ? -sym.y1 : sym.y0, y1 = r === 180 ? -sym.y0 : sym.y1;
      if (inside) text(p.x, p.y + 9, p.tag, 24); else text(p.x, p.y + y0 - 8, p.tag, 26);
      if (p.desc) text(p.x, p.y + y1 + 22, p.desc, 20, 'middle', 500);
    }
    if (p.t === 'xfmr') { const t = [0, 1, 2, 3].map(i => termPos(p, i)), nm = ['H1', 'H2', 'X1', 'X2'];
      t.forEach((q, i) => text(q[0] + (i % 2 ? 12 : -12), q[1] + (i < 2 ? -8 : 22), nm[i], 18, i % 2 ? 'start' : 'end', 600)); }
  }
  // rung numbers, left of L1; cross-references, right of L2
  const rL1 = rails.find(r => r.label === 'L1'), rL2 = rails.find(r => r.label === 'L2');
  if (SHOW.rn) for (const { y, n } of A.rows[k] || []) {
    const xs = s.parts.filter(p => p.t !== 'rail' && p.y === y).map(p => p.x);
    text(rL1 ? rL1.x - 50 : Math.min(...xs) - 110, y + 9, n, 24, 'end');
  }
  if (SHOW.xr) for (const p of s.parts) { const r = A.xref.get(p.id); if (!r || !r.length) continue;
    const x = rL2 && p.x < rL2.x ? rL2.x + 26 : p.x + 90;
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
