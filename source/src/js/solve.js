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
// (the ways current can come from L1: along wires and through switches, not through a load)
const viaL1 = e => !(e.kind === 'part' && LOADT(e.part.t));
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
      if (NET.feedV.get(u) === 0) continue;   // (never on from L2, nor through a coil or light: with supply boxes the return
      // wire joins every output, and a way round through one of them would make a switch look as if it were wired backward)
      for (const e of NET.jadj.get(u) || []) { if (e.part === p || !viaL1(e)) continue; const w = e.a === u ? e.b : e.a, nd = d + e.len; if (!dist.has(w) || nd < dist.get(w)) { dist.set(w, nd); q.push([nd, w]); } } }
    return dist;
  };
  for (const p of parts.flatMap(q => isMulti(q) ? q._poles || [] : [q])) if (isSw(p)) {   // (an SPDT: each of its two ways through)
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
    for (const p of parts.flatMap(q => isMulti(q) ? q._poles || [] : [q])) {
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
  const g = e => e.kind === 'seg' ? 1 / Math.max(e.len, 1) : e.part.t === 'brk' ? 0 : isSw(e.part) ? ((closed(e.part) || allClosed) && !blocked.has(e.part) ? 1 / (2 * TERM(e.part)) : 0) : 1 / 4000;
  // everything L1 reaches through things that conduct
  const live = new Set(), stack = [];
  for (const [id, v] of net.feedV) if (v === 1) { live.add(id); stack.push(id); }
  while (stack.length) { const u = stack.pop(); for (const e of net.jadj.get(u) || []) { if (!(g(e) > 0)) continue; const w = e.a === u ? e.b : e.a; if (!live.has(w)) { live.add(w); stack.push(w); } } }
  // node voltages (see netSolve: fast even for a whole machine's print, hundreds of junctions)
  const V = new Map(); for (const [id, v] of net.feedV) if (live.has(id)) V.set(id, v);
  const unk = [...live].filter(id => !net.feedV.has(id)), ix = new Map(unk.map((id, i) => [id, i])), n = unk.length;
  const links = [], diag = new Float64Array(n), rhs = new Float64Array(n);
  for (const e of J) {
    const ge = g(e); if (!(ge > 0) || !live.has(e.a) || !live.has(e.b)) continue;
    const a = ix.get(e.a), b = ix.get(e.b);
    if (a !== undefined && b !== undefined) links.push([a, b, ge]);
    else if (a !== undefined) { diag[a] += ge; rhs[a] += ge * V.get(e.b); }
    else if (b !== undefined) { diag[b] += ge; rhs[b] += ge * V.get(e.a); }
  }
  const [x] = netSolve(n, links, diag, [rhs]);
  unk.forEach((id, i) => V.set(id, x[i]));
  return { V, live, g };
}
/* Solve a network of conductances for its junction voltages: n junctions of unknown voltage, links [i, j, g]
   between two of them (g: conductance), diag[i] the conductance from junction i to junctions held at a voltage, and
   each right-hand side rhs[i] the current those push in. Returns the voltages, one array per right-hand side.
   A ladder links each junction only to its neighbours, so the junctions are put in an order that keeps linked ones
   close together (reverse Cuthill-McKee), and the elimination only works within that band: a whole machine's print
   (hundreds of junctions) solves in a few milliseconds where doing every junction against every other took seconds.
   (The network is a set of conductances, so no pivoting is needed.) A junction with nothing to hold it: 1, as before. */
function netSolve(n, links, diag, rhs) {
  const adj = Array.from({ length: n }, () => []);
  for (const [i, j] of links) if (i !== j) { adj[i].push(j); adj[j].push(i); }
  const deg = i => adj[i].length, order = [], seen = new Uint8Array(n);
  for (const s of [...Array(n).keys()].sort((a, b) => deg(a) - deg(b))) {
    if (seen[s]) continue; seen[s] = 1; const q = [s];
    for (let h = 0; h < q.length; h++) { const u = q[h]; order.push(u); for (const w of adj[u].filter(w => !seen[w]).sort((a, b) => deg(a) - deg(b))) if (!seen[w]) { seen[w] = 1; q.push(w); } }
  }
  order.reverse();
  const pos = new Int32Array(n); order.forEach((u, k) => { pos[u] = k; });
  let bw = 0; for (const [i, j] of links) bw = Math.max(bw, Math.abs(pos[i] - pos[j]));
  const W = 2 * bw + 1, A = Array.from({ length: n }, () => new Float64Array(W));   // (A[r][q - r + bw]: row r, column q)
  for (let i = 0; i < n; i++) A[pos[i]][bw] += diag[i];
  for (const [i, j, gg] of links) { if (i === j) continue; const a = pos[i], b = pos[j]; A[a][bw] += gg; A[b][bw] += gg; A[a][b - a + bw] -= gg; A[b][a - b + bw] -= gg; }
  const B = rhs.map(r => { const b = new Float64Array(n); for (let i = 0; i < n; i++) b[pos[i]] = r[i]; return b; });
  for (let c = 0; c < n; c++) {
    const Ac = A[c], d = Ac[bw]; if (Math.abs(d) < 1e-300) continue;
    const end = Math.min(n - 1, c + bw);
    for (let r = c + 1; r <= end; r++) {
      const Ar = A[r], o = bw - r; if (!Ar[c + o]) continue;
      const k = Ar[c + o] / d;
      for (let q = c; q <= end; q++) Ar[q + o] -= k * Ac[q - c + bw];
      for (const b of B) b[r] -= k * b[c];
    }
  }
  return B.map(b => {
    const x = new Float64Array(n);
    for (let c = n - 1; c >= 0; c--) {
      const Ac = A[c]; let s = b[c]; const end = Math.min(n - 1, c + bw);
      for (let q = c + 1; q <= end; q++) s -= Ac[q - c + bw] * x[q];
      x[c] = Ac[bw] ? s / Ac[bw] : 1;
    }
    const out = new Float64Array(n); for (let i = 0; i < n; i++) out[i] = x[pos[i]];
    return out;
  });
}
/* =====================================================================
   how the supply's voltage shares out among the loads
   With whatever joins things up right now (f: wires and closed switches, each group one junction), every coil and
   pilot light is a resistance between two junctions, L1 at full voltage and L2 at none. A load across L1 and L2 gets
   all of it; two alike in series get half each. A coil picks up only with PULL_IN of the voltage it's made for or
   more (so two coils in series just sit there), and a pilot light glows with its share. Each load has its own
   resistance (LOAD_OHMS, below), so loads that differ share it in proportion, as Ohm's law has it; every one is made for
   the supply voltage for now (ratedShare is where parts rated otherwise would go).
   ===================================================================== */
const SUPPLY_V = 120, PULL_IN = 0.85;
/* Each load's resistance in ohms (Dallas, 15 Nov 2026: reasonable values, and readings that obey Ohm's law). These are
   the loads' working resistances at 120 V (so V = I R holds for what they draw), used here for how the voltage shares
   out among loads in series, and by the Fault Finder's meter (ts-meter.js), so what the meter reads and what the
   circuit does always agree:
     relay coil (a control relay)        2.5 kΩ   48 mA at 120 V       timer           3 kΩ    40 mA
     a starter's or contactor's coil     240 Ω    0.5 A (it pulls in a starter's poles, so it draws more)
     pilot light                         2.4 kΩ   50 mA, 6 W (a 120 V, 6 W lamp)
     solenoid (valve)                    1.2 kΩ   0.1 A, 12 W          heating element 9.6 Ω   12.5 A, 1500 W
     control transformer: primary 12 Ω, secondary 0.5 Ω; a motor: 2 Ω a winding (ts-meter.js) */
const LOAD_OHMS = p => p.t === 'coil' ? (isTimer(p) ? 3000 : parts.some(q => q.t === 'mst' && q.L === p.L) ? 240 : 2500)
  : p.t === 'lamp' ? 2400 : p.t === 'sol' ? 1200 : p.t === 'htr' ? 9.6 : p.t === 'xfm' ? 12 : 1000;
const loadR = p => LOAD_OHMS(p);                         // (each load's resistance)
const ratedShare = p => (p.rv || SUPPLY_V) / SUPPLY_V;   // (the voltage it's made for, as a share of the supply)
// V: junction group -> voltage (L1 1, L2 0); share: load id -> the share of the supply across it (0: no current)
function loadShares(f, net = NET) {
  const c1 = f(net.L1), c2 = f(net.L2), V = new Map(), share = new Map();
  if (c1 === c2) return { V, share, adj: new Map(), c2 };
  const loads = parts.filter(p => LOADT(p.t) && p._a !== undefined), adj = new Map();
  const link = (a, b, g, id) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, g, id]); };
  for (const p of loads) { const a = f(p._a), b = f(p._b); if (a !== b) { link(a, b, 1 / loadR(p), p.id); link(b, a, 1 / loadR(p), p.id); } }
  // only the junctions joined through loads to L1 or L2 (any others carry no current)
  const seen = new Set([c1, c2]), st = [c1, c2];
  while (st.length) { const u = st.pop(); for (const [w] of adj.get(u) || []) if (!seen.has(w)) { seen.add(w); st.push(w); } }
  V.set(c1, 1); V.set(c2, 0);
  const unk = [...seen].filter(c => c !== c1 && c !== c2), ix = new Map(unk.map((c, i) => [c, i])), n = unk.length;
  const A = Array.from({ length: n }, () => new Float64Array(n + 1));
  unk.forEach((u, i) => { for (const [w, g] of adj.get(u) || []) { A[i][i] += g; if (ix.has(w)) A[i][ix.get(w)] -= g; else A[i][n] += g * V.get(w); } });
  for (let c = 0; c < n; c++) {
    let pv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r;
    [A[c], A[pv]] = [A[pv], A[c]];
    const d = A[c][c]; if (Math.abs(d) < 1e-300) continue;
    for (let r = 0; r < n; r++) if (r !== c && A[r][c] !== 0) { const k = A[r][c] / d; for (let q = c; q <= n; q++) A[r][q] -= k * A[c][q]; }
  }
  unk.forEach((u, i) => V.set(u, A[i][i] ? A[i][n] / A[i][i] : 0));
  for (const p of loads) { const a = V.get(f(p._a)), b = V.get(f(p._b)); share.set(p.id, a === undefined || b === undefined ? 0 : Math.abs(a - b)); }
  return { V, share, adj, c2 };
}
