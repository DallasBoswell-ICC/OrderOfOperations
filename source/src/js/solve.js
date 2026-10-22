/* =====================================================================
   which way current goes
   The wiring is solved like a real circuit: L1 at full voltage, L2 at none, every wire and closed button a small
   resistance and every coil a large one. Current flows from higher voltage to lower. This is used once per run, as if
   every button were passing current, to give every wire and every button its direction (see engine.js).
   ===================================================================== */
// node voltages with the buttons as they are (or, with allClosed, as if every button were letting current through)
/* Like the rungs of a ladder diagram, current only goes through a button (or relay contact) one way: from the end
   nearer L1 to the other end (worked out once per run). So a button never carries current
   backward from a lower rung up into the rung above, but a button wired with power coming in on its right still works.
   (Solved by treating each button as a one-way valve: solve, block any button that would carry current the wrong way,
   and solve again until nothing changes.) */
let BTN_DIR = new Map();   // button -> the end current comes in at
const btnIn = p => BTN_DIR.get(p.id) ?? p._a;
function findButtonDirections() {
  BTN_DIR = new Map();
  const V0 = solveOnce(true, new Set()).V;
  // how far each junction is from L1 along the wiring, not going through part p itself
  const distFromL1 = p => {
    const dist = new Map(), q = [];
    for (const [id, v] of NET.feedV) if (v === 1) { dist.set(id, 0); q.push([0, id]); }
    while (q.length) { q.sort((a, b) => a[0] - b[0]); const [d, u] = q.shift(); if (d > dist.get(u)) continue;
      for (const e of NET.jadj.get(u) || []) { if (e.part === p) continue; const w = e.a === u ? e.b : e.a, nd = d + e.len; if (!dist.has(w) || nd < dist.get(w)) { dist.set(w, nd); q.push([nd, w]); } } }
    return dist;
  };
  for (const p of parts) if (isSw(p)) {
    // current comes in at the end nearer L1 (like reading a rung from left to right, whichever way it is drawn);
    // if both ends are equally near, at the end with the higher voltage
    const dist = distFromL1(p), da = dist.get(p._a) ?? Infinity, db = dist.get(p._b) ?? Infinity;
    if (da !== db) { BTN_DIR.set(p.id, da < db ? p._a : p._b); continue; }
    const va = V0.get(p._a), vb = V0.get(p._b);
    BTN_DIR.set(p.id, va !== undefined && vb !== undefined && vb > va + 1e-9 ? p._b : p._a);
  }
}
function solveV(allClosed) {
  const blocked = new Set();
  let r = null;
  for (let it = 0; it < 40; it++) {
    r = solveOnce(allClosed, blocked);
    let changed = false;
    for (const p of parts) {
      if (!isSw(p) || !(allClosed || closed(p))) continue;
      const i = btnIn(p), va = r.V.get(i), vb = r.V.get(i === p._a ? p._b : p._a);   // va: where current should come in
      if (!blocked.has(p) && va !== undefined && vb !== undefined && vb > va + 1e-12) { blocked.add(p); changed = true; }
      else if (blocked.has(p) && va !== undefined && vb !== undefined && va > vb + 1e-12) { blocked.delete(p); changed = true; }
      else if (blocked.has(p) && va !== undefined && vb === undefined) { blocked.delete(p); changed = true; }
    }
    if (!changed) break;
  }
  r.blocked = blocked;
  return r;
}
function solveOnce(allClosed, blocked) {
  const net = NET, J = net.jedges;
  const g = e => e.kind === 'seg' ? 1 / Math.max(e.len, 1) : isSw(e.part) ? ((closed(e.part) || allClosed) && !blocked.has(e.part) ? 1 / (2 * TERM(e.part)) : 0) : 1 / 4000;
  // everything L1 reaches through things that conduct
  const live = new Set(), stack = [];
  for (const [id, v] of net.feedV) if (v === 1) { live.add(id); stack.push(id); }
  while (stack.length) { const u = stack.pop(); for (const e of net.jadj.get(u) || []) { if (!(g(e) > 0)) continue; const w = e.a === u ? e.b : e.a; if (!live.has(w)) { live.add(w); stack.push(w); } } }
  // node voltages (Gaussian elimination; a circuit has at most a few hundred junctions)
  const V = new Map(); for (const [id, v] of net.feedV) if (live.has(id)) V.set(id, v);
  const unk = [...live].filter(id => !net.feedV.has(id)), ix = new Map(unk.map((id, i) => [id, i])), n = unk.length;
  const A = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (const e of J) {
    const ge = g(e); if (!(ge > 0) || !live.has(e.a) || !live.has(e.b)) continue;
    for (const [u, w] of [[e.a, e.b], [e.b, e.a]]) {
      if (!ix.has(u)) continue;
      const r = A[ix.get(u)]; r[ix.get(u)] += ge;
      if (ix.has(w)) r[ix.get(w)] -= ge; else r[n] += ge * V.get(w);
    }
  }
  for (let c = 0; c < n; c++) {
    let pv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r;
    [A[c], A[pv]] = [A[pv], A[c]];
    const d = A[c][c]; if (Math.abs(d) < 1e-300) continue;
    for (let r = 0; r < n; r++) if (r !== c && A[r][c] !== 0) { const k = A[r][c] / d; for (let q = c; q <= n; q++) A[r][q] -= k * A[c][q]; }
  }
  unk.forEach((id, i) => V.set(id, A[i][i] ? A[i][n] / A[i][i] : 1));
  return { V, live, g };
}
