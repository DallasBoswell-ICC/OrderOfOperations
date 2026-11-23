/* =====================================================================
   Troubleshooter: what the meter reads between two junctions of the circuit as it is right now.
   Voltage: the live circuit, worked out as a network of resistances fed by the supplies (L1 at 120 V and L2 at 0 V
   for the control circuit; the phases as the circuit's voltage system has them: see VSYS_LIST), so a
   junction joined to L1 only through a coil, with nothing beyond it, sits at 120 V (no current, so no drop across the
   coil), as on a real panel. A lead on a junction with no way back to any supply reads nothing.
   Resistance: the same network with every supply off (locked out): wires and closed contacts are 0 Ω; coils,
   lights, solenoids, heaters and transformer and motor windings their own resistance; open contacts, open wires and
   open loads no way through at all (OL).
   ===================================================================== */
const TS_SUPPLY = 120;
// a load's resistance in ohms
const TS_OHMS = p => RATED(p.t) && BLOWN[p.id] ? Infinity : LOAD_OHMS(p);   // (burned out: open)   // (the same resistances the circuit itself works with: see solve.js)
const TS_XFM_SEC = 0.5, TS_MOTOR = 2;

/* the network as it stands: junctions joined by wire or by a closed contact are one (sn: each junction's piece), and
   between pieces the loads, as conductances. Returns { sn, n, loads: [[a, b, g]], comp: the pieces each linked to
   by anything at all } */
function tsNetwork() {
  const net = NET, N = net.nodes.length, par = new Int32Array(N + 64).map((_, i) => i);
  const f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const join = (a, b) => { a = f(a); b = f(b); if (a !== b) par[a] = b; };
  const loads = []; let extra = N;
  for (const e of net.edges) {
    if (e.kind === 'w') join(e.a, e.b);
    else if (e.part && isSw(e.part)) { if (closed(e.part)) join(e.a, e.b); }
    else if (e.part && TS_OHMS(e.part) < Infinity) loads.push([e.a, e.b, 1 / TS_OHMS(e.part)]);
  }
  for (const p of parts) {
    if (p.t === 'xfm' && p._t) loads.push([p._t[2], p._t[3], 1 / TS_XFM_SEC]);   // (its secondary winding, X1 to X2)
    if (p.t === 'mtr' && p._t) { const c = extra++; for (const t of p._t) loads.push([t, c, 1 / TS_MOTOR]); }   // (its windings, joined at the star point)
  }
  const M = extra, sn = new Int32Array(M); for (let i = 0; i < M; i++) sn[i] = f(i);
  // the pieces linked by anything (wire, contact or load): the leads on two that are not read nothing
  const cp = Int32Array.from(sn);
  const g = i => { while (cp[i] !== i) { cp[i] = cp[cp[i]]; i = cp[i]; } return i; };
  for (const [a, b] of loads) { const x = g(sn[a]), y = g(sn[b]); if (x !== y) cp[x] = y; }
  // the systems that can be measured against each other (Dallas, 22 Nov 2026): what is linked by anything, and what is
  // grounded linked through the earth: the ground, the phases' supply (its neutral is bonded to it), the control circuit
  // unless every transformer feeding it has its secondary ungrounded, and each grounded transformer's X2 (or X0). A
  // transformer's secondary is isolated from its primary, so with it ungrounded it can only be read against itself.
  const ep = new Int32Array(M + 1).map((_, i) => i < M ? g(sn[i]) : M), EARTH = M;
  const h = i => { while (ep[i] !== i) { ep[i] = ep[ep[i]]; i = ep[i]; } return i; };
  const tie = (a, b) => { if (a === undefined || b === undefined) return; const x = h(a === EARTH ? EARTH : g(sn[a])), y = h(b === EARTH ? EARTH : g(sn[b])); if (x !== y) ep[x] = y; }, earth = n => tie(n, EARTH);
  tie(net.L1, net.L2);   // (the control circuit's two sides: one supply)
  for (const n of net.GND || []) earth(n);
  for (const L in net.PH) if (!/^S[120]:/.test(L)) earth(net.PH[L]);
  const xs = parts.filter(p => p.t === 'xfm' && p._t);
  if (!xs.some(p => !p.ct) || xs.some(p => !p.ct && !p.ug)) earth(net.L2);
  for (const p of xs) { if (p.ct) { tie(p._t[2], p._t[4]); tie(p._t[2], net.PH['S0:' + p.id]); tie(p._t[2], net.PH['S1:' + p.id]); tie(p._t[2], net.PH['S2:' + p.id]); }   // (a secondary's terminals: one winding)
    if (!p.ug) { earth(p._t[p.ct ? 4 : 3]); if (p.ct) earth(net.PH['S0:' + p.id]); } }
  return { sn, M, loads: loads.map(([a, b, c]) => [sn[a], sn[b], c]), comp: i => g(sn[i]), grp: i => h(g(sn[i])) };
}
// the supplies that are on: piece -> [re, im] volts
function tsSources(T) {
  const fix = new Map(), set = (n, v) => { const k = T.sn[n]; if (!fix.has(k)) fix.set(k, v); };
  // the control circuit: 120 V from the bars or supply boxes; or what its transformer gives (Dallas, 22 Nov 2026: in proportion
  // to what its primary gets against what it's rated for), and dead while its transformer isn't fed
  const xs = parts.filter(p => p.t === 'xfm' && !p.ct);
  if (!LOCKOUT && !SUPPLY_CUT) {
    if (!xs.length) { set(NET.L1, [TS_SUPPLY, 0]); set(NET.L2, [0, 0]); }
    else { const p = xs.find(q => coilOn[q.id]); if (p) { const s = xfmSec(p, simT); set(NET.L1, polarV(s.mag, s.ang)); set(NET.L2, [0, 0]); } }
  }
  if (!(LOCKOUT && !parts.some(p => p.t === 'dsc'))) {
    for (const L in NET.PH) {
      if (/^S[120]:/.test(L)) { const p = parts.find(q => q.id == L.slice(3)); if (!p || !coilOn[p.id]) continue;   // (a centre-tapped secondary: while its primary is fed)
        const s = xfmSec(p, simT), k = phK(L); set(NET.PH[L], k === 7 ? [0, 0] : polarV(s.mag / 2, s.ang + (k === 6 ? Math.PI : 0))); continue; }
      const v = phVolt(phK(L)); if (v) set(NET.PH[L], v);   // (each phase from the voltage system; the neutral at 0 V)
    }
  }
  for (const n of NET.GND || []) set(n, [0, 0]);   // (the ground: 0 V)
  return fix;
}
// node voltages (complex): Laplace's equation over the pieces, with the supplies held; pieces with no way to a supply: 0
function tsSolve(T, fix) {
  const used = new Set(); for (const [a, b] of T.loads) { used.add(a); used.add(b); }
  for (const k of fix.keys()) used.add(k);
  const unk = [...used].filter(k => !fix.has(k)), ix = new Map(unk.map((k, i) => [k, i])), n = unk.length;
  // only the pieces with a supply somewhere in their reach
  const live = new Set(), adj = new Map();
  for (const [a, b] of T.loads) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
  const st = [...fix.keys()]; for (const k of st) live.add(k);
  while (st.length) { const u = st.pop(); for (const w of adj.get(u) || []) if (!live.has(w)) { live.add(w); st.push(w); } }
  // the conductances are real, so the real and imaginary parts are the same network with two sets of supplies
  // (solved together by netSolve, in solve.js); a piece with no supply in reach: 0
  const lv = unk.filter(k => live.has(k)), li = new Map(lv.map((k, i) => [k, i])), m = lv.length;
  const links = [], diag = new Float64Array(m), re = new Float64Array(m), im = new Float64Array(m);
  for (const [a, b, c] of T.loads) {
    const x = li.get(a), y = li.get(b);
    if (x !== undefined && y !== undefined) links.push([x, y, c]);
    else for (const [u, w] of [[x, b], [y, a]]) if (u !== undefined && fix.has(w)) { const v = fix.get(w); diag[u] += c; re[u] += c * v[0]; im[u] += c * v[1]; }
  }
  const [xr, xi] = netSolve(m, links, diag, [re, im]);
  const V = new Map(fix);
  unk.forEach(k => { const i = li.get(k); V.set(k, i === undefined ? [0, 0] : [xr[i], xi[i]]); });
  return { V, live };
}
// the voltage the meter reads (RMS) between junctions a and b: nothing unless both have a way back to a supply
function tsVolts(a, b) {
  const T = tsNetwork(), { V, live } = tsSolve(T, tsSources(T)), A = T.sn[a], B = T.sn[b];
  if (!live.has(A) || !live.has(B) || T.grp(a) !== T.grp(b)) return 0;   // (or on two systems isolated from each other)
  const va = V.get(A), vb = V.get(B);
  return Math.hypot(va[0] - vb[0], va[1] - vb[1]);
}
// the resistance between junctions a and b (Infinity: no way through), with everything as it is (supplies ignored)
function tsOhms(a, b) {
  const T = tsNetwork(), A0 = T.sn[a], B0 = T.sn[b];
  if (A0 === B0) return 0;
  if (T.comp(a) !== T.comp(b)) return Infinity;
  // 1 A in at a, b held at 0 V: the voltage at a is the resistance
  const c0 = T.comp(a), ks = new Set(); for (const [x, y] of T.loads) if (T.comp(x) === c0) { ks.add(x); ks.add(y); }
  ks.delete(B0); const unk = [...ks], ix = new Map(unk.map((k, i) => [k, i])), n = unk.length;
  const links = [], diag = new Float64Array(n), rhs = new Float64Array(n);
  for (const [x, y, c] of T.loads) {
    const u = ix.get(x), w = ix.get(y);
    if (u !== undefined && w !== undefined) links.push([u, w, c]);
    else if (u !== undefined && y === B0) diag[u] += c;
    else if (w !== undefined && x === B0) diag[w] += c;
  }
  rhs[ix.get(A0)] = 1;
  const [v] = netSolve(n, links, diag, [rhs]), r = v[ix.get(A0)];
  return Number.isFinite(r) ? r : Infinity;
}
