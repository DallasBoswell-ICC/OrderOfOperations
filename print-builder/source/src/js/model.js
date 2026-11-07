/* =====================================================================
   The print being drawn, and the edits that change it.

   A document has sheets (each a letter page); a sheet has parts, wires, nodes and notes.
   - A part: { id, t (LIB key, or 'rail'), x, y, rot (0/90/180/270), tag, desc, pre (a coil's tag start) }.
     A rail (the control circuit's L1 or L2) is { id, t: 'rail', x, y0, y1, label }.
   - A wire: { id, a, b, pts }: from end a to end b through its bends pts ([x, y], ...), every run level or upright.
   - An end is where a wire is fixed: a part's terminal { p: id, i }, a node { n: id }, or a rail { r: id, y }.
   - A node: { id, x, y }: a joint between wires (a dot where three or more meet), or a wire's loose end.
   Wires join only where an end is fixed: two wires that cross are not joined, and moving a part never joins
   anything new (its wires follow it, bending where they must). That is what keeps a moved part from shorting
   wires together.
   ===================================================================== */
const G = 20;                  // the grid
const U_IN = 312.5;            // units an inch (the print's scale: .0032 in a unit)
let doc = null, S = null;      // the document, and the sheet on screen
const uid = p => p + Math.random().toString(36).slice(2, 9);
const snap = v => Math.round(v / G) * G;
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`; };

/* ---------- the title block's fields (users can change, add and take away any of them) ---------- */
function defaultTB() {
  return { fields: [
    { id: uid('f'), label: 'Drawing Title', value: 'Untitled Print', span: 4, big: true },
    { id: uid('f'), label: 'Drawing Type', value: 'Ladder Diagram', span: 3 },
    { id: uid('f'), label: 'Drawn By', value: 'Student Name', span: 2 },
    { id: uid('f'), label: 'Date', value: today(), span: 2 },
    { id: uid('f'), label: 'Rev', value: 'A', span: 1 },
    { id: uid('f'), label: 'Program / School', value: 'Illinois Central College', span: 4 },
    { id: uid('f'), label: 'Course', value: 'Electrical Troubleshooting', span: 3 },
    { id: uid('f'), label: 'Made With', value: 'O³ Print Builder', span: 3 },
    { id: uid('f'), label: 'Sheet', value: '{sheet}', span: 2 },
  ], notes: '1 = control L1 (X1, after its fuse); 2 = control L2 (X2).\nWire numbers on a coil’s right: the rungs its contacts are on. Underlined = NC; PWR = power contacts.', showNotes: true };
}
function newSheet(rails = true, land = false) {
  const s = { id: uid('s'), land, parts: [], wires: [], nodes: [], texts: [] };
  if (rails) {
    const w = drawW(land);
    s.parts.push({ id: uid('r'), t: 'rail', label: 'L1', x: 200, y0: 240, y1: snap(drawH(land) - 140) },
                 { id: uid('r'), t: 'rail', label: 'L2', x: snap(w - 420), y0: 240, y1: snap(drawH(land) - 140) });
  }
  return s;
}
function newDoc() { const d = { kind: 'o3-print', v: 1, tb: defaultTB(), sheets: [newSheet()], cur: 0 }; return d; }
// the drawing's room on a sheet (inside the frame, above the title block): its width; its height, about
const drawW = land => Math.round(((land ? 11 : 8.5) - .8 - .24) * U_IN);
const drawH = land => Math.round(((land ? 8.5 : 11) - .8 - .24 - 1.25) * U_IN);

/* ---------- where things are ---------- */
const partOf = (s, id) => s.parts.find(p => p.id === id);
const nodeOf = (s, id) => s.nodes.find(n => n.id === id);
function turn([a, b], r) { return r === 90 ? [-b, a] : r === 180 ? [-a, -b] : r === 270 ? [b, -a] : [a, b]; }
function termPos(p, i) { const [a, b] = turn(termsOf(p.t)[i], p.rot || 0); return [p.x + a, p.y + b]; }
const termsN = p => p.t === 'rail' ? 0 : termsOf(p.t).length;
function pos(s, e) {
  if (e.p) { const p = partOf(s, e.p); return p ? termPos(p, e.i) : [0, 0]; }
  if (e.n) { const n = nodeOf(s, e.n); return n ? [n.x, n.y] : [0, 0]; }
  const r = partOf(s, e.r); return r ? [r.x, Math.max(r.y0, Math.min(r.y1, e.y))] : [0, 0];
}
const wirePts = (s, w) => [pos(s, w.a), ...w.pts.map(p => [p[0], p[1]]), pos(s, w.b)];
const sameEnd = (e, f) => (e.p && e.p === f.p && e.i === f.i) || (e.n && e.n === f.n) || (e.r && e.r === f.r && e.y === f.y);
const endKey = e => e.p ? 'p:' + e.p + ':' + e.i : e.n ? 'n:' + e.n : 'r:' + e.r + ':' + e.y;
const wiresAt = (s, e) => s.wires.filter(w => sameEnd(w.a, e) || sameEnd(w.b, e));
const onSeg = (x, y, [x1, y1], [x2, y2]) => (x1 === x2 ? x === x1 && y >= Math.min(y1, y2) && y <= Math.max(y1, y2) : y === y1 && y2 === y1 && x >= Math.min(x1, x2) && x <= Math.max(x1, x2));
// a part's box (for picking it): its symbol, and the room its tag takes above
function partBox(p) {
  if (p.t === 'rail') return { x0: p.x - 14, x1: p.x + 14, y0: p.y0 - 70, y1: p.y1 };
  const e = extentOf(p.t), c = [[e.x0, e.y0 - 30], [e.x1, e.y1 + 10]].map(q => turn(q, p.rot || 0));
  return { x0: p.x + Math.min(c[0][0], c[1][0]), x1: p.x + Math.max(c[0][0], c[1][0]), y0: p.y + Math.min(c[0][1], c[1][1]), y1: p.y + Math.max(c[0][1], c[1][1]) };
}

/* ---------- tidying wires ---------- */
// a wire's bends without repeats, or bends in a straight run
function simplify(s, w) {
  const P = wirePts(s, w), out = [P[0]];
  for (let k = 1; k < P.length; k++) {
    const q = P[k], l = out[out.length - 1];
    if (q[0] === l[0] && q[1] === l[1]) continue;
    if (out.length >= 2) { const m = out[out.length - 2]; if ((m[0] === l[0] && l[0] === q[0]) || (m[1] === l[1] && l[1] === q[1])) { out[out.length - 1] = q; continue; } }
    out.push(q);
  }
  if (out.length === 1) out.push(out[0]);
  w.pts = out.slice(1, -1);
}
// a whole sheet tidied: no wire with no length, no nodes left with nothing on them, two wires through a node with
// nothing else on it made one, a part's terminal sitting on a loose end taking the wire
function tidy(s) {
  for (let again = true, guard = 0; again && guard < 50; guard++) {
    again = false;
    for (const w of s.wires) simplify(s, w);
    // (a wire from a point to the same point: gone, its two ends made one)
    for (const w of [...s.wires]) {
      const P = wirePts(s, w);
      if (P.length === 2 && P[0][0] === P[1][0] && P[0][1] === P[1][1]) {
        s.wires.splice(s.wires.indexOf(w), 1);
        if (w.a.n && !sameEnd(w.a, w.b)) replaceEnd(s, w.a, w.b); else if (w.b.n && !sameEnd(w.a, w.b)) replaceEnd(s, w.b, w.a);
        again = true;
      }
    }
    // (a node with two wires through it and nothing else: the two made one)
    for (const n of [...s.nodes]) {
      const e = { n: n.id }, ws = wiresAt(s, e);
      if (ws.length === 0) { s.nodes.splice(s.nodes.indexOf(n), 1); again = true; continue; }
      if (ws.length === 2 && ws[0] !== ws[1]) { mergeAt(s, ws[0], ws[1], e); s.nodes.splice(s.nodes.indexOf(n), 1); again = true; }
    }
  }
}
// two wires meeting at end e made one wire
function mergeAt(s, w1, w2, e) {
  if (sameEnd(w1.a, e)) reverse(s, w1);   // (w1 now ends at e)
  if (sameEnd(w2.b, e)) reverse(s, w2);   // (w2 now starts at e)
  const mid = pos(s, e);
  w1.pts = [...w1.pts, mid, ...w2.pts]; w1.b = w2.b;
  s.wires.splice(s.wires.indexOf(w2), 1);
  simplify(s, w1);
}
function reverse(s, w) { [w.a, w.b] = [w.b, w.a]; w.pts.reverse(); }
function replaceEnd(s, from, to) { for (const w of s.wires) { if (sameEnd(w.a, from)) w.a = { ...to }; if (sameEnd(w.b, from)) w.b = { ...to }; } }

/* ---------- joining things ---------- */
// wire w split at x, y (which must be on it): a node there, w up to it, a new wire on from it. The node's end.
function splitWire(s, w, x, y) {
  const P = wirePts(s, w);
  for (const e of [w.a, w.b]) { const q = pos(s, e); if (q[0] === x && q[1] === y) return e; }
  for (let k = 0; k < P.length - 1; k++) {
    if (!onSeg(x, y, P[k], P[k + 1])) continue;
    const n = { id: uid('n'), x, y }; s.nodes.push(n);
    const atBend = P[k + 1][0] === x && P[k + 1][1] === y && k + 1 < P.length - 1;
    const w2 = { id: uid('w'), a: { n: n.id }, b: w.b, pts: w.pts.slice(atBend ? k + 1 : k) };
    w.pts = w.pts.slice(0, k); w.b = { n: n.id };
    s.wires.push(w2); if (w.num) w2.num = w.num;
    return { n: n.id };
  }
  return null;
}
// what there is to join to at x, y: a part's terminal, a node, a rail, or a wire's run (split there for it)
function endAt(s, x, y, skipPart = null, split = true) {
  for (const p of s.parts) if (p.t !== 'rail' && p.id !== skipPart) for (let i = 0; i < termsN(p); i++) { const q = termPos(p, i); if (q[0] === x && q[1] === y) return { p: p.id, i }; }
  for (const n of s.nodes) if (n.x === x && n.y === y) return { n: n.id };
  for (const w of s.wires) for (const e of [w.a, w.b]) { const q = pos(s, e); if (q[0] === x && q[1] === y && !(e.p && e.p === skipPart)) return { ...e }; }
  for (const r of s.parts) if (r.t === 'rail' && r.x === x && y >= r.y0 && y <= r.y1) return { r: r.id, y };
  for (const w of s.wires) { const P = wirePts(s, w); for (let k = 0; k < P.length - 1; k++) if (onSeg(x, y, P[k], P[k + 1])) return split ? splitWire(s, w, x, y) : { w: w.id }; }
  return null;
}
// a part just put down: dropped across a wire, the wire cut and the part put in it (each pole along its own wire);
// a terminal on a wire's loose end, or on a wire's run, joined to it
function settle(s, p) {
  if (p.t === 'rail' || p.t === 'sup') return attachTerms(s, p);
  for (const [i, j] of polesOf(p.t)) {
    if (wiresAt(s, { p: p.id, i }).length || wiresAt(s, { p: p.id, i: j }).length) continue;
    const A = termPos(p, i), B = termPos(p, j);
    const w = s.wires.find(w => { const P = wirePts(s, w); return P.some((q, k) => k < P.length - 1 && onSeg(A[0], A[1], q, P[k + 1]) && onSeg(B[0], B[1], q, P[k + 1])); });
    if (!w) continue;
    const P = wirePts(s, w); if ([P[0], P[P.length - 1]].some(q => (q[0] === A[0] && q[1] === A[1]) || (q[0] === B[0] && q[1] === B[1]))) continue;   // (only across a run, not at its end)
    const ea = splitWire(s, w, A[0], A[1]);
    const w2 = s.wires.find(v => v !== w && sameEnd(v.a, ea)) || w;
    const eb = splitWire(s, onWire(s, w, B) ? w : w2, B[0], B[1]);
    // (the bit between the two cuts: gone; the cuts' nodes become the part's terminals)
    const mid = s.wires.find(v => (sameEnd(v.a, ea) && sameEnd(v.b, eb)) || (sameEnd(v.a, eb) && sameEnd(v.b, ea)));
    if (mid) s.wires.splice(s.wires.indexOf(mid), 1);
    replaceEnd(s, ea, { p: p.id, i }); replaceEnd(s, eb, { p: p.id, i: j });
    s.nodes = s.nodes.filter(n => n.id !== ea.n && n.id !== eb.n);
  }
  attachTerms(s, p);
}
const onWire = (s, w, [x, y]) => { const P = wirePts(s, w); return P.some((q, k) => k < P.length - 1 && onSeg(x, y, q, P[k + 1])); };
// a part's free terminals joined to whatever is right there (a loose wire end, or a wire's run)
function attachTerms(s, p) {
  for (let i = 0; i < termsN(p); i++) {
    const me = { p: p.id, i }; if (wiresAt(s, me).length) continue;
    const [x, y] = termPos(p, i);
    const n = s.nodes.find(n => n.x === x && n.y === y);
    if (n) { replaceEnd(s, { n: n.id }, me); s.nodes.splice(s.nodes.indexOf(n), 1); continue; }
    const w = s.wires.find(w => onWire(s, w, [x, y]) && !sameEnd(w.a, me) && !sameEnd(w.b, me));
    if (w) { const e = splitWire(s, w, x, y); if (e && e.n) { replaceEnd(s, e, me); s.nodes = s.nodes.filter(q => q.id !== e.n); } }
  }
}

/* ---------- moving ---------- */
// parts, nodes and notes (by id) moved by dx, dy. A wire with both ends moving moves whole; a wire with one end
// moving keeps its other end where it was, bending to reach (it never takes on anything new).
function moveItems(s, ids, dx, dy) {
  if (!dx && !dy) return;
  const moving = e => (e.p && ids.has(e.p)) || (e.n && ids.has(e.n)) || (e.r && ids.has(e.r));
  const before = new Map(s.wires.map(w => [w.id, { a: pos(s, w.a), b: pos(s, w.b), pts: w.pts.map(q => [...q]) }]));
  for (const p of s.parts) if (ids.has(p.id)) { p.x += dx; if (p.t === 'rail') { p.y0 += dy; p.y1 += dy; } else p.y += dy; }
  for (const n of s.nodes) if (ids.has(n.id)) { n.x += dx; n.y += dy; }
  for (const t of s.texts) if (ids.has(t.id)) { t.x += dx; t.y += dy; }
  for (const w of s.wires) for (const e of [w.a, w.b]) if (e.r && ids.has(e.r)) e.y += dy;
  for (const w of s.wires) {
    const am = moving(w.a), bm = moving(w.b), o = before.get(w.id);
    if (am && bm) { w.pts = w.pts.map(([x, y]) => [x + dx, y + dy]); continue; }
    if (!am && !bm) continue;
    reroute(s, w, o.a, o.b, o.pts);
  }
  for (const w of s.wires) simplify(s, w);
}
// wire w's ends have moved (from oa, ob): its bends next to them moved along so every run stays level or upright
function reroute(s, w, oa, ob, opts) {
  const na = pos(s, w.a), nb = pos(s, w.b);
  if (!opts.length) {
    if (na[0] === nb[0] || na[1] === nb[1]) { w.pts = []; return; }
    if (oa[1] === ob[1]) { const mx = snap((na[0] + nb[0]) / 2); w.pts = [[mx, na[1]], [mx, nb[1]]]; }
    else { const my = snap((na[1] + nb[1]) / 2); w.pts = [[na[0], my], [nb[0], my]]; }
    return;
  }
  const pts = opts.map(q => [...q]), f = pts[0], l = pts[pts.length - 1];
  if (oa[1] === f[1] && oa[0] !== f[0]) f[1] = na[1]; else f[0] = na[0];
  if (ob[1] === l[1] && ob[0] !== l[0]) l[1] = nb[1]; else l[0] = nb[0];
  w.pts = pts;
}

/* ---------- taking away ---------- */
// a part taken away: where a wire came in one side and went out the other, the two made one again (the rung
// healed); any other wire on it left with a loose end where the terminal was
function removePart(s, id) {
  const p = partOf(s, id); if (!p) return;
  if (p.t === 'rail') {
    for (const w of s.wires) for (const k of ['a', 'b']) if (w[k].r === id) { const [x, y] = pos(s, w[k]); const n = { id: uid('n'), x, y }; s.nodes.push(n); w[k] = { n: n.id }; }
  } else {
    for (const [i, j] of polesOf(p.t)) {
      const wi = wiresAt(s, { p: id, i }), wj = wiresAt(s, { p: id, i: j });
      if (wi.length === 1 && wj.length === 1 && wi[0] !== wj[0]) {
        const A = termPos(p, i), B = termPos(p, j), w1 = wi[0], w2 = wj[0];
        if (sameEnd(w1.a, { p: id, i })) reverse(s, w1);
        if (sameEnd(w2.b, { p: id, i: j })) reverse(s, w2);
        w1.pts = [...w1.pts, A, B, ...w2.pts]; w1.b = w2.b; s.wires.splice(s.wires.indexOf(w2), 1); simplify(s, w1);
      }
    }
    for (let i = 0; i < termsN(p); i++) for (const w of wiresAt(s, { p: id, i })) for (const k of ['a', 'b']) if (sameEnd(w[k], { p: id, i })) {
      const [x, y] = termPos(p, i); let n = s.nodes.find(n => n.x === x && n.y === y); if (!n) { n = { id: uid('n'), x, y }; s.nodes.push(n); } w[k] = { n: n.id };
    }
  }
  s.parts.splice(s.parts.indexOf(p), 1);
  tidy(s);
}
function removeWire(s, id) { const w = s.wires.find(w => w.id === id); if (w) s.wires.splice(s.wires.indexOf(w), 1); tidy(s); }

/* ---------- tags ---------- */
// every part in the document, with its sheet
const allParts = () => doc.sheets.flatMap((s, k) => s.parts.filter(p => p.t !== 'rail').map(p => ({ p, s, k })));
const tagPre = p => p.t === 'coil' ? (p.pre || 'CR') : LIB[p.t] && LIB[p.t].pre;
// the next free tag starting pre: one more than the highest in use (FU1, FU2, FU3...: never the same twice)
function nextTag(pre, motor = false) {   // (motors are counted among themselves: motor M1 and its starter M1 go together)
  let m = 0; const re = new RegExp('^' + pre + '(\\d+)$');
  for (const { p } of allParts()) { if (['contact', 'starter', 'olc'].includes(LIB[p.t].kind) || (LIB[p.t].kind === 'motor') !== motor) continue; const r = re.exec(p.tag || ''); if (r) m = Math.max(m, +r[1] + (p.t === 'fus3' ? 2 : 0)); }   // (a block of three fuses takes three numbers: FU1, FU2, FU3)   // (contacts borrow their coil's tag: they take none of their own)
  return pre + (m + 1);
}
// a new part's tag: its own next one; a contact, its coil's (the last coil put down or picked); starter contacts, a starter's
let lastCoil = '';
function defaultTag(t) {
  const k = LIB[t].kind;
  if (k === 'contact') return lastCoil || (allParts().find(q => q.p.t === 'coil') || {}).p?.tag || '';
  if (k === 'starter') { const m = allParts().find(q => q.p.t === 'coil' && /^M\d*$/.test(q.p.tag || '')); return m ? m.p.tag : 'M1'; }
  if (k === 'olc') { const o = allParts().find(q => LIB[q.p.t].kind === 'ol'); return o ? o.p.tag : 'OL1'; }
  if (t === 'sup') { const used = new Set(allParts().filter(q => q.p.t === 'sup').map(q => q.p.tag)); return ['L1', 'L2', 'L3'].find(l => !used.has(l)) || 'L1'; }
  return nextTag(LIB[t].pre, LIB[t].kind === 'motor');
}

/* ---------- undo ---------- */
const UNDO = [], REDO = [];
function snapshot() { UNDO.push(JSON.stringify(doc)); if (UNDO.length > 200) UNDO.shift(); REDO.length = 0; }
function undo() { if (!UNDO.length) return false; REDO.push(JSON.stringify(doc)); doc = JSON.parse(UNDO.pop()); S = doc.sheets[Math.min(doc.cur, doc.sheets.length - 1)]; return true; }
function redo() { if (!REDO.length) return false; UNDO.push(JSON.stringify(doc)); doc = JSON.parse(REDO.pop()); S = doc.sheets[Math.min(doc.cur, doc.sheets.length - 1)]; return true; }

/* ---------- building by hand (templates, tests) ---------- */
// a part put down at x, y: given its next tag, cut into the wire it lands across
function addPart(s, t, x, y, o = {}) {
  const p = { id: uid('p'), t, x, y, rot: o.rot || 0, desc: o.desc || '' };
  if (t === 'coil') p.pre = o.pre || 'CR';
  p.tag = o.tag != null ? o.tag : t === 'coil' ? nextTag(p.pre) : defaultTag(t);
  if (LIB[t].kind === 'coil') lastCoil = p.tag;
  s.parts.push(p); settle(s, p); tidy(s); return p;
}
// a wire along the points given, its ends joined to whatever is at them (or left loose)
function addWire(s, pts) {
  const loose = ([x, y]) => { const n = { id: uid('n'), x, y }; s.nodes.push(n); return { n: n.id }; };
  const a = endAt(s, ...pts[0]) || loose(pts[0]);
  const b = endAt(s, ...pts[pts.length - 1]) || loose(pts[pts.length - 1]);
  const w = { id: uid('w'), a, b, pts: pts.slice(1, -1).map(q => [...q]) };
  s.wires.push(w); tidy(s); return w;
}

/* ---------- turning ---------- */
// parts turned a quarter (clockwise) about their middles; their wires bend to follow, as when moved
function rotateParts(s, ids) {
  const touched = s.wires.filter(w => [w.a, w.b].some(e => e.p && ids.has(e.p)));
  const before = new Map(touched.map(w => [w.id, { a: pos(s, w.a), b: pos(s, w.b), pts: w.pts.map(q => [...q]) }]));
  for (const p of s.parts) if (ids.has(p.id) && p.t !== 'rail' && p.t !== 'sup') p.rot = ((p.rot || 0) + 90) % 360;
  for (const w of touched) { const o = before.get(w.id); reroute(s, w, o.a, o.b, o.pts); simplify(s, w); }
}
