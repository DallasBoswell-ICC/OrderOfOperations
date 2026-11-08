/* =====================================================================
   The editor: picking, the tools (Select, Wire, Rung, Note, putting a symbol down), and its marks on the sheet.
   ===================================================================== */
let A = null, ISSUES = [];                 // the drawing read (nets.js), and what Check Print found
let tool = 'select', placing = null;       // the tool; the symbol being put down ({ t, rot })
let sel = new Set(), selW = null;          // what is picked: parts, rails, nodes, notes (ids); a wire (id)
let checkOn = false, hover = null, drag = null, wd = null, cursor = null;
let svg = null, VB = [0, 0], wireDown = null, hoverT = false;

// a point on the sheet from the pointer
function sheetPt(e) { const m = svg.getScreenCTM().inverse(), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(m); return [q.x, q.y]; }
const near = (a, b, d) => Math.abs(a[0] - b[0]) <= d && Math.abs(a[1] - b[1]) <= d;
const segDist = ([x, y], [x1, y1], [x2, y2]) => { const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)) : 0; return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)); };

/* ---------- picking ---------- */
// sheet units in a screen pixel (for reaches that should feel the same at any zoom)
const pxU = () => { const m = svg && svg.getScreenCTM(); return m && m.a ? 1 / m.a : 3; };
// a part's terminal right under q (within a few pixels): where a drag starts a wire
function termAt(q) {
  let b = null; const r = Math.max(14, 10 * pxU());
  for (const p of S.parts) if (p.t !== 'rail') for (let i = 0; i < termsN(p); i++) { const t = termPos(p, i), d = Math.hypot(t[0] - q[0], t[1] - q[1]); if (d <= r && (!b || d < b.d)) b = { x: t[0], y: t[1], kind: 'term', d }; }
  return b;
}
function textBox(t) { const lines = String(t.s || '').split('\n'), z = t.size || 24; return { x0: t.x - 6, x1: t.x + Math.max(40, ...lines.map(l => l.length * z * .56)) + 6, y0: t.y - z, y1: t.y + (lines.length - 1) * z * 1.25 + 8 }; }
const inBox = ([x, y], b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
// what is under point q: { kind: 'node' | 'end' (a rail's end) | 'part' | 'text' | 'wire' | 'rail', ... }
function pick(q) {
  for (const n of S.nodes) if (near(q, [n.x, n.y], 14)) return { kind: 'node', id: n.id };
  for (const L of PLABS) if (q[0] >= L.x0 - 3 && q[0] <= L.x1 + 3 && q[1] >= L.y0 - 3 && q[1] <= L.y1 + 3) return { kind: 'plabel', id: L.id, which: L.which };
  for (const L of LABS) if (q[0] >= L.x0 - 4 && q[0] <= L.x1 + 4 && q[1] >= L.y0 - 4 && q[1] <= L.y1 + 4) return { kind: 'label', id: L.id, x: L.x, y: L.y };
  for (const r of S.parts) if (r.t === 'rail') for (const k of ['y0', 'y1']) if (near(q, [r.x, r[k]], 16)) return { kind: 'end', id: r.id, k };
  let best = null;
  for (const p of S.parts) if (p.t !== 'rail') { const b = partBox(p); if (inBox(q, b)) { const a = (b.x1 - b.x0) * (b.y1 - b.y0); if (!best || a < best.a) best = { kind: 'part', id: p.id, a }; } }
  if (best) return best;
  for (const t of S.texts) if (inBox(q, textBox(t))) return { kind: 'text', id: t.id };
  let bw = null;
  for (const w of S.wires) { const P = wirePts(S, w); for (let k = 0; k < P.length - 1; k++) { const d = segDist(q, P[k], P[k + 1]); if (d <= 10 && (!bw || d < bw.d)) bw = { kind: 'wire', id: w.id, k, d }; } }
  if (bw) return bw;
  for (const r of S.parts) if (r.t === 'rail' && Math.abs(q[0] - r.x) <= 12 && q[1] >= r.y0 - 60 && q[1] <= r.y1) return { kind: 'rail', id: r.id };
  return null;
}
// where a wire would join at q: a terminal, a node or a wire's end, a rail, a wire's run (the nearest within reach), or the grid
function snapTarget(q, skip = null) {
  let b = null; const take = (x, y, kind, d) => { if (!b || d < b.d) b = { x, y, kind, d }; };
  for (const p of S.parts) if (p.t !== 'rail' && p.id !== skip) for (let i = 0; i < termsN(p); i++) { const t = termPos(p, i), d = Math.hypot(t[0] - q[0], t[1] - q[1]); if (d <= 22) take(t[0], t[1], 'term', d); }
  for (const n of S.nodes) { const d = Math.hypot(n.x - q[0], n.y - q[1]); if (d <= 18) take(n.x, n.y, 'node', d); }
  if (b) return b;
  for (const r of S.parts) if (r.t === 'rail') { const d = Math.abs(q[0] - r.x), y = snap(q[1]); if (d <= 18 && y >= r.y0 && y <= r.y1) take(r.x, y, 'rail', d); }
  for (const w of S.wires) { const P = wirePts(S, w); for (let k = 0; k < P.length - 1; k++) { const [a, c] = [P[k], P[k + 1]], d = segDist(q, a, c); if (d > 14) continue;
    if (a[1] === c[1]) { const x = Math.max(Math.min(a[0], c[0]), Math.min(Math.max(a[0], c[0]), snap(q[0]))); take(x, a[1], 'wire', d + 1); }
    else if (a[0] === c[0]) { const y = Math.max(Math.min(a[1], c[1]), Math.min(Math.max(a[1], c[1]), snap(q[1]))); take(a[0], y, 'wire', d + 1); } } }
  return b || { x: snap(q[0]), y: snap(q[1]), kind: 'grid', d: 0 };
}

/* ---------- the editor's marks ---------- */
function drawEd() {
  if (!svg) return;
  const under = svg.querySelector('#ed-under'), over = svg.querySelector('#ed-over');
  under.innerHTML = `<defs><pattern id="gp" x="-20" y="-20" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="2.2" fill="#d3d9e0"/></pattern></defs><rect x="0" y="0" width="${VB[0]}" height="${VB[1]}" fill="url(#gp)"/>`;
  let g = '';
  // picked things
  for (const id of sel) {
    const p = partOf(S, id);
    if (p) { const b = partBox(p); g += `<rect x="${b.x0 - 8}" y="${b.y0 - 6}" width="${b.x1 - b.x0 + 16}" height="${b.y1 - b.y0 + 12}" rx="10" fill="rgba(47,140,255,.08)" stroke="#2f8cff" stroke-width="4" stroke-dasharray="12 7"/>`;
      if (p.t === 'rail') for (const y of [p.y0, p.y1]) g += `<rect x="${p.x - 12}" y="${y - 12}" width="24" height="24" rx="4" fill="#fff" stroke="#2f8cff" stroke-width="4"/>`; continue; }
    const n = nodeOf(S, id); if (n) { g += `<circle cx="${n.x}" cy="${n.y}" r="14" fill="none" stroke="#2f8cff" stroke-width="5"/>`; continue; }
    const t = S.texts.find(t => t.id === id); if (t) { const b = textBox(t); g += `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" rx="6" fill="none" stroke="#2f8cff" stroke-width="4" stroke-dasharray="12 7"/>`; }
  }
  if (selW) { const w = S.wires.find(w => w.id === selW); if (w) g += `<polyline points="${wirePts(S, w).map(q => q.join(',')).join(' ')}" fill="none" stroke="#2f8cff" stroke-width="16" stroke-opacity=".35" stroke-linecap="round" stroke-linejoin="round"/>`; }
  // loose ends: terminals with nothing on them, wires ending in the air (small rings)
  const wired = new Set(); for (const w of S.wires) for (const e of [w.a, w.b]) wired.add(pos(S, e).join(','));
  for (const p of S.parts) if (p.t !== 'rail') for (let i = 0; i < termsN(p); i++) { const t = termPos(p, i); if (!wired.has(t.join(','))) g += `<circle cx="${t[0]}" cy="${t[1]}" r="7" fill="#fff" stroke="#2f8cff" stroke-width="3"/>`; }
  for (const n of S.nodes) if (wiresAt(S, { n: n.id }).length === 1) g += `<circle cx="${n.x}" cy="${n.y}" r="8" fill="#fff" stroke="#e5484d" stroke-width="3.5"/>`;
  // what Check Print found, ringed (on this sheet)
  if (checkOn) for (const is of ISSUES) if (is.sev !== 'ok') for (const a of is.at) if (a.k === doc.cur) {
    const p = partOf(S, a.id), b = p ? partBox(p) : { x0: a.x - 20, x1: a.x + 20, y0: a.y - 20, y1: a.y + 20 };
    g += `<ellipse cx="${(b.x0 + b.x1) / 2}" cy="${(b.y0 + b.y1) / 2}" rx="${(b.x1 - b.x0) / 2 + 26}" ry="${(b.y1 - b.y0) / 2 + 20}" fill="none" stroke="${is.sev === 'e' ? '#e5484d' : '#ffb224'}" stroke-width="6"/>`;
  }
  // (a wire's number picked: its box)
  if (selW) for (const L of LABS) if (L.id === selW) g += `<rect x="${L.x0 - 5}" y="${L.y0 - 4}" width="${L.x1 - L.x0 + 10}" height="${L.y1 - L.y0 + 8}" rx="5" fill="rgba(47,140,255,.12)" stroke="#2f8cff" stroke-width="3"/>`;
  // (a picked part's tag and label: dashed boxes, as they can be dragged)
  if (sel.size === 1) for (const L of PLABS) if (sel.has(L.id)) g += `<rect x="${L.x0 - 4}" y="${L.y0 - 3}" width="${L.x1 - L.x0 + 8}" height="${L.y1 - L.y0 + 6}" rx="4" fill="none" stroke="#2f8cff" stroke-width="2" stroke-dasharray="6 4"/>`;
  // a terminal under the pointer in Select: drag from it for a wire
  if (tool === 'select' && cursor && !drag) { const t = termAt(cursor); if (t) g += `<circle cx="${t.x}" cy="${t.y}" r="13" fill="rgba(47,140,255,.15)" stroke="#2f8cff" stroke-width="4"/>`; }
  if (drag && drag.from && cursor) { const t = snapTarget(cursor), P = [drag.from, ...lRoute(drag.from, [t.x, t.y])];
    g += `<polyline points="${P.map(q => q.join(',')).join(' ')}" fill="none" stroke="#2f8cff" stroke-width="5" stroke-dasharray="14 8" stroke-linejoin="round"/><circle cx="${t.x}" cy="${t.y}" r="${t.kind === 'grid' ? 6 : 11}" fill="${t.kind === 'grid' ? '#2f8cff' : 'none'}" stroke="#2f8cff" stroke-width="4"/>`; }
  // the tool's preview
  if (tool === 'wire' && cursor) {
    const t = snapTarget(cursor);
    if (wd) { const P = [...wd.pts, ...lRoute(wd.pts[wd.pts.length - 1], [t.x, t.y], wd.pts)]; g += `<polyline points="${P.map(q => q.join(',')).join(' ')}" fill="none" stroke="#2f8cff" stroke-width="5" stroke-dasharray="14 8" stroke-linejoin="round"/>`; }
    g += `<circle cx="${t.x}" cy="${t.y}" r="${t.kind === 'grid' ? 6 : 11}" fill="${t.kind === 'grid' ? '#2f8cff' : 'none'}" stroke="#2f8cff" stroke-width="4"/>`;
  }
  if (tool === 'rung' && cursor) { const r = rungAt(cursor); if (r) g += `<line x1="${r.x1}" y1="${r.y}" x2="${r.x2}" y2="${r.y}" stroke="#2f8cff" stroke-width="6" stroke-dasharray="16 10" opacity="${r.ok ? 1 : .35}"/>`; }
  if (tool === 'place' && placing && cursor) {
    const p = ghostPart(cursor), sym = LIB[p.t].sym, sp = splicePreview(p);
    for (const w of sp.wires) g += `<polyline points="${wirePts(S, w).map(q => q.join(',')).join(' ')}" fill="none" stroke="#2f8cff" stroke-width="12" stroke-opacity=".3"/>`;
    g += `<g opacity=".55" fill="none" stroke="#1f6fd8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">`;
    if (p.t === 'sup') g += `<path d="M${p.x - 22} ${p.y - 13}L${p.x - 22} ${p.y + 13}L${p.x} ${p.y}Z" fill="#1f6fd8"/>`;
    else g += `<g transform="translate(${p.x} ${p.y})${p.rot ? ` rotate(${p.rot})` : ''}">${PSYM[sym].b}</g>`;
    g += '</g>';
  }
  if (drag && drag.box) { const [a, b] = drag.box; g += `<rect x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(a[0] - b[0])}" height="${Math.abs(a[1] - b[1])}" fill="rgba(47,140,255,.08)" stroke="#2f8cff" stroke-width="3" stroke-dasharray="10 6"/>`; }
  over.innerHTML = g;
  // (symbols in the marks drawn in their own blue)
  for (const e of over.querySelectorAll('g[opacity] [stroke="#000"]')) e.setAttribute('stroke', '#1f6fd8');
  for (const e of over.querySelectorAll('g[opacity] [fill="#000"]')) e.setAttribute('fill', '#1f6fd8');
}
// an L from a to b (along first, then across; the way that carries on from the last run, or the longer way first)
function lRoute(a, b, pts) {
  if (a[0] === b[0] || a[1] === b[1]) return [b];
  let hFirst = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  if (pts && pts.length >= 2) { const p = pts[pts.length - 2]; hFirst = p[0] === a[0]; }
  return [hFirst ? [b[0], a[1]] : [a[0], b[1]], b];
}
// the rung the Rung tool would add at q: from rail L1 to rail L2 at q's height
function rungAt(q) {
  const r1 = S.parts.find(p => p.t === 'rail' && p.label === 'L1'), r2 = S.parts.find(p => p.t === 'rail' && p.label === 'L2');
  if (!r1 || !r2) return null;
  const y = snap(q[1]); if (y < Math.max(r1.y0, r2.y0) || y > Math.min(r1.y1, r2.y1)) return null;
  const ok = !S.wires.some(w => { const P = wirePts(S, w); return P.some((p, k) => k < P.length - 1 && p[1] === y && P[k + 1][1] === y && Math.min(p[0], P[k + 1][0]) <= r1.x + 1 && Math.max(p[0], P[k + 1][0]) > r1.x); });
  return { x1: r1.x, x2: r2.x, y, ok };
}
// the symbol being put down, where it would go
const ghostPart = q => ({ id: '__ghost', t: placing.t, x: snap(q[0]), y: snap(q[1]), rot: placing.rot || 0 });
// the wires it would cut into, and what it would tell
function splicePreview(p) {
  const wires = [];
  for (const [i, j] of polesOf(p.t)) { const A_ = termPos(p, i), B = termPos(p, j);
    const w = S.wires.find(w => { const P = wirePts(S, w); return P.some((q, k) => k < P.length - 1 && onSeg(A_[0], A_[1], q, P[k + 1]) && onSeg(B[0], B[1], q, P[k + 1])) && ![P[0], P[P.length - 1]].some(e => (e[0] === A_[0] && e[1] === A_[1]) || (e[0] === B[0] && e[1] === B[1])); });
    if (w && !wires.includes(w)) wires.push(w); }
  return { wires };
}

/* ---------- the pointer ---------- */
function onDown(e) {
  if (e.button === 1 || (e.button === 0 && spaceDown)) return startPan(e);
  if (e.button !== 0) { if (tool === 'wire' && wd) { wd = null; drawEd(); } return; }
  e.preventDefault();   // (no text on the page highlighted by a drag)
  const q = sheetPt(e);
  if (tool === 'place' && placing) { putDown(q, e.shiftKey); return; }
  if (tool === 'wire') { svg.setPointerCapture(e.pointerId); wireDown = q; return wireClick(q, e.detail >= 2); }
  if (tool === 'rung') { const r = rungAt(q); if (r && r.ok) { snapshot(); addWire(S, [[r.x1, r.y], [r.x2, r.y]]); refresh(); } else if (r) say('There is a rung there already.'); return; }
  if (tool === 'note') { snapshot(); const t = { id: uid('t'), x: snap(q[0]), y: snap(q[1]), s: 'Note' }; S.texts.push(t); sel = new Set([t.id]); selW = null; setTool('select'); refresh(); focusProp('note-text'); return; }
  // Select: from a terminal, a drag draws a wire
  const ta = termAt(q);
  if (ta) { drag = { from: [ta.x, ta.y], q0: q }; svg.setPointerCapture(e.pointerId); return; }
  const h = pick(q);
  if (!h) { if (!e.shiftKey) { sel = new Set(); selW = null; } drag = { box: [q, q], add: e.shiftKey }; svg.setPointerCapture(e.pointerId); refresh(); return; }
  if (h.kind === 'plabel') { const p = partOf(S, h.id); sel = new Set([h.id]); selW = null; drag = { plab: h, at: clone(labOff(p, h.which)), q0: q, pre: JSON.stringify(doc), moved: false }; svg.setPointerCapture(e.pointerId); refresh(); return; }
  if (h.kind === 'label') { sel = new Set(); selW = h.id; drag = { lab: h.id, at: [h.x, h.y], q0: q, orig: clone(S), pre: JSON.stringify(doc), moved: false }; svg.setPointerCapture(e.pointerId); refresh(); return; }
  if (h.kind === 'wire') { sel = new Set(); selW = h.id; drag = { wire: h.id, k: h.k, q0: q, orig: clone(S), pre: JSON.stringify(doc), moved: false }; svg.setPointerCapture(e.pointerId); refresh(); return; }
  if (h.kind === 'end') { sel = new Set([h.id]); selW = null; drag = { rail: h.id, k: h.k, pre: JSON.stringify(doc), moved: false }; svg.setPointerCapture(e.pointerId); refresh(); return; }
  if (e.shiftKey) { sel.has(h.id) ? sel.delete(h.id) : sel.add(h.id); selW = null; refresh(); return; }
  if (!sel.has(h.id)) { sel = new Set([h.id]); selW = null; }
  const p = partOf(S, h.id); if (p && p.t === 'coil') lastCoil = p.tag;
  drag = { ids: new Set(sel), q0: q, orig: clone(S), pre: JSON.stringify(doc), moved: false };
  svg.setPointerCapture(e.pointerId); refresh();
}
function onMove(e) {
  const q = sheetPt(e); cursor = q;
  if (pan) return doPan(e);
  if (!drag) { if (tool !== 'select') { drawEd(); tipFor(q, e); } else { const t = termAt(q); svg.classList.toggle('on-term', !!t); if (t || hoverT) drawEd(); hoverT = !!t; tipFor(q, e); } return; }
  if (drag.box) { drag.box[1] = q; drawEd(); return; }
  if (drag.from) { drawEd(); return; }
  if (drag.plab) { const p = partOf(S, drag.plab.id); if (!p) return; const dx = Math.round((q[0] - drag.q0[0]) / 5) * 5, dy = Math.round((q[1] - drag.q0[1]) / 5) * 5;
    if (!drag.moved && !dx && !dy) return; drag.moved = true; setLabOff(p, drag.plab.which, [drag.at[0] + dx, drag.at[1] + dy]); frame(); return; }
  if (drag.lab) { const w = S.wires.find(w => w.id === drag.lab); if (!w) return; const dx = Math.round((q[0] - drag.q0[0]) / 5) * 5, dy = Math.round((q[1] - drag.q0[1]) / 5) * 5;
    if (!drag.moved && !dx && !dy) return; drag.moved = true; w.lab = [drag.at[0] + dx, drag.at[1] + dy]; frame(); return; }
  const dx = snap(q[0] - (drag.q0 ? drag.q0[0] : q[0])), dy = snap(q[1] - (drag.q0 ? drag.q0[1] : q[1]));
  if (drag.rail) { const r = partOf(S, drag.rail), y = snap(q[1]); if (drag.k === 'y0') r.y0 = Math.min(y, r.y1 - 200); else r.y1 = Math.max(y, r.y0 + 200); drag.moved = true; frame(); return; }
  if (!drag.moved && !dx && !dy) return;
  drag.moved = true;
  const s = clone(drag.orig); doc.sheets[doc.cur] = S = s;
  if (drag.wire) moveSegment(S, drag.wire, drag.k, dx, dy); else moveItems(S, drag.ids, dx, dy);
  frame();
}
function onUp(e) {
  if (pan) { pan = null; desk.classList.remove('pan'); return; }
  if (tool === 'wire' && wireDown && wd && wd.pts.length === 1) {   // (Wire tool: press, drag, let go also draws one)
    const q = sheetPt(e), a = wireDown; wireDown = null; if (Math.hypot(q[0] - a[0], q[1] - a[1]) >= G) wireClick(q, false); return; }
  wireDown = null;
  if (!drag) return;
  const d = drag; drag = null;
  if (d.from) { const q = sheetPt(e), t = snapTarget(q), b = [t.x, t.y];
    if (Math.hypot(q[0] - d.q0[0], q[1] - d.q0[1]) < G * .75 || (b[0] === d.from[0] && b[1] === d.from[1])) {   // (a click on a terminal: pick its part)
      const h = pick(d.q0); if (h && h.kind === 'part') { sel = new Set([h.id]); selW = null; } refresh(); return; }
    snapshot(); addWire(S, [d.from, ...lRoute(d.from, b)]); refresh(); return; }
  if (d.plab) { if (d.moved) { UNDO.push(d.pre); REDO.length = 0; } refresh(); return; }
  if (d.lab) { if (d.moved) { UNDO.push(d.pre); REDO.length = 0; } refresh(); return; }
  if (d.box) { const [a, b] = d.box, bx = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
    if (bx.x1 - bx.x0 > 8 || bx.y1 - bx.y0 > 8) { if (!d.add) sel = new Set();
      for (const p of S.parts) { const pb = partBox(p); if (p.t === 'rail' ? (p.x >= bx.x0 && p.x <= bx.x1 && p.y0 >= bx.y0 && p.y1 <= bx.y1) : inBox([(pb.x0 + pb.x1) / 2, (pb.y0 + pb.y1) / 2], bx)) sel.add(p.id); }
      for (const n of S.nodes) if (inBox([n.x, n.y], bx)) sel.add(n.id);
      for (const t of S.texts) if (inBox([t.x, t.y], bx)) sel.add(t.id); }
    refresh(); return; }
  if (d.moved) {
    // (a part moved off its wires onto a wire: cut into it, as when first put down)
    if (d.ids) for (const id of d.ids) { const p = partOf(S, id); if (p && p.t !== 'rail' && ![...Array(termsN(p)).keys()].some(i => wiresAt(S, { p: id, i }).length)) settle(S, p); }
    tidy(S); UNDO.push(d.pre); REDO.length = 0;
    if (selW && !S.wires.some(w => w.id === selW)) selW = null;
  }
  refresh();
}
// a wire's run k dragged across itself (its ends stay where they are: a step is put in if they must)
function moveSegment(s, id, k, dx, dy) {
  const w = s.wires.find(w => w.id === id); if (!w) return;
  const P = wirePts(s, w), h = P[k][1] === P[k + 1][1], v = P[k][0] === P[k + 1][0];
  if (!h && !v) return;
  const arr = P.map(q => [...q]); let i = k, j = k + 1;
  if (k === 0) { arr.unshift([...arr[0]]); i++; j++; }
  if (j === arr.length - 1) arr.push([...arr[arr.length - 1]]);
  for (const m of [i, j]) { if (h) arr[m][1] += dy; else arr[m][0] += dx; }
  w.pts = arr.slice(1, -1); simplify(s, w);
}
// a symbol put down at q (Shift: keep putting them down)
function putDown(q, keep) {
  snapshot();
  const g = ghostPart(q), p = addPart(S, placing.t, g.x, g.y, { rot: placing.rot });
  sel = new Set([p.id]); selW = null;
  if (!keep) { placing = null; setTool('select'); }
  keepTab = true; refresh(); keepTab = false;   // (a part just put down: the tools stay in view; click it for its Part tab)
}
// the Wire tool: a click starts, bends or (on something to join) finishes a wire; a double click finishes it anywhere
function wireClick(q, dbl) {
  const t = snapTarget(q), pt = [t.x, t.y];
  if (!wd) { wd = { pts: [pt], startKind: t.kind }; drawEd(); return; }
  const last = wd.pts[wd.pts.length - 1];
  if (!(pt[0] === last[0] && pt[1] === last[1])) wd.pts.push(...lRoute(last, pt, wd.pts));
  const start = wd.pts[0];
  if (dbl || (t.kind !== 'grid' && !(pt[0] === start[0] && pt[1] === start[1]))) finishWire();
  else drawEd();
}
function finishWire() {
  if (!wd) return;
  const P = wd.pts; wd = null;
  if (P.length >= 2 && !(P.length === 2 && P[0][0] === P[1][0] && P[0][1] === P[1][1])) { snapshot(); addWire(S, P); }
  refresh();
}
// what the pointer would do, said beside it
function tipFor(q, e) {
  const tip = document.getElementById('tip'); let s = '';
  if (tool === 'place' && placing) { const p = ghostPart(q), sp = splicePreview(p);
    if (sp.wires.length) { const ns = sp.wires.map(w => A.label.get(A.wireRoot(S, w))).filter(Boolean), rn = A.rows[doc.cur]?.find(r => r.y === p.y);
      s = `Drop ${rn ? `on <b>rung ${rn.n}</b>` : 'here'}: it goes into wire${ns.length > 1 ? 's' : ''} <b>${[...new Set(ns)].join(', ')}</b>`; } }
  if (tool === 'wire') { const t = snapTarget(q); s = wd ? (t.kind === 'grid' ? 'Click to bend · double-click to end here' : 'Click to join here') : (t.kind === 'grid' ? 'Click to start a wire' : `Click to start from this ${({ term: 'terminal', node: 'joint', rail: 'rail', wire: 'wire' })[t.kind]}`); }
  if (tool === 'rung') { const r = rungAt(q); s = r ? (r.ok ? 'Click to add a rung here' : 'There is a rung here already') : 'Rungs go between the L1 and L2 rails'; }
  if (tool === 'select' && termAt(q)) s = 'Drag from here to draw a wire';
  else if (tool === 'select') { const h = pick(q); if (h && h.kind === 'plabel') s = 'Drag to move this ' + (h.which === 'desc' ? 'label' : h.which === 'tag' ? 'name' : 'fuse number'); else if (h && h.kind === 'label') s = 'Drag to move this wire number'; }
  if (!s) { tip.hidden = true; return; }
  const dr = desk.getBoundingClientRect(); tip.innerHTML = s; tip.hidden = false;
  tip.style.left = (e.clientX - dr.left + 18) + 'px'; tip.style.top = (e.clientY - dr.top - 34) + 'px';
}
// redrawn at most once a frame while dragging
let framed = false;
function frame() { if (framed) return; framed = true; requestAnimationFrame(() => { framed = false; A = analyse(); drawInk(); drawEd(); }); }
