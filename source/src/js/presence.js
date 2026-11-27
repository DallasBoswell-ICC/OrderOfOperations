/* =====================================================================
   Where each source's voltage is (Dallas, 25 Nov 2026)
   Every source (L1 and L2, each phase and the neutral, a centre-tapped secondary's X1, X2 and X0) spreads out from its
   bar or box along the wires and through closed switches, and on through any load with no current through it, until
   it comes to an open switch. So the neutral goes back through a coil that is out, up to the open button in front of
   it, and a pressed button's colour also back-feeds an open seal-in contact beside it (both sides are live). A load
   with a different source at each end has current through it: each side shows its own source, right up to the load
   (the hot side pushes the neutral back to the load's far side). Between loads in series the colour fades from the hot
   side toward the return. A piece joined to two sources (a short) shows nothing.
   This is what is drawn; which loads work (coils picking up and so on) is still worked out in engine.js.
   Changes travel as fronts at the current's speed: from the switch that moved, outward. Where a source drains away from
   wiring another would reach without it (a coil dropping out: the return; a heater wired phase to phase: the other
   phase), the other is underneath: it shows as the first goes, behind the draining front.
   VTL: each junction's timeline of [time, colour, the part it came in through]; VCUR: what each junction is to show
   ({ lab: which source, c: colour, t: from when }).
   ===================================================================== */
let VTL = new Map(), VCUR = new Map(), VDIR = new Map(), paintUntil = 0;   // (paintUntil: the last front still on its way: the panel is painted till then)
const vOn = () => VTL.size > 0;
/* VDIR (Dallas, 26 Nov 2026, option 1: motion means current, colour means voltage): for each junction with current through
   it, how far along the way the current goes it is, from 1 where it comes in to 0 where it leaves (each piece of wiring
   measured on its own): along a wire, the current runs from the higher to the lower. */
function vPot(es, top, bot, fixed) {
  const js = [...new Set(es.flatMap(e => [e.a, e.b]))], pot = fixed ? new Map(fixed) : new Map(); if (!fixed) { for (const n of top) pot.set(n, 1); for (const n of bot) if (!top.has(n)) pot.set(n, 0); }
  const unk = js.filter(n => !pot.has(n)), ix = new Map(unk.map((n, i) => [n, i])), m = unk.length;
  if (m && (fixed ? pot.size > 1 : top.size && bot.size)) { const links = [], diag = new Float64Array(m), rhs = new Float64Array(m);
    for (const e of es) { const k = 1 / Math.max(1, e.len || 1), x = ix.get(e.a), y = ix.get(e.b);
      if (x !== undefined && y !== undefined) links.push([x, y, k]);
      else for (const [u, w] of [[x, e.b], [y, e.a]]) if (u !== undefined && pot.has(w)) { diag[u] += k; rhs[u] += k * pot.get(w); } }
    for (let i = 0; i < m; i++) diag[i] += 1e-9;
    const [v] = netSolve(m, links, diag, [rhs]); unk.forEach((n, i) => pot.set(n, v[i])); }
  return pot;
}
// (the junctions along each carrying wire between two junctions: in between, in step)
/* each entry [how far along (as above), how far the current has come (for keeping the moving dashes in step where wires
   meet: from the source on a hot side, back to the source on a return), 'h' on a hot side (current goes into a load from
   it), 'r' on a return (current comes out of a load into it)] */
function vDirs(D, es, pot, cur, dist, role) {
  const put = (n, p) => { if (!cur.has(n)) return; const r = typeof role === 'function' ? role(n, p) : role, d = dist ? dist.get(n) ?? 0 : 0; D.set(n, [p, r === 'r' ? -d : d, r]); };
  for (const e of es) { const pa = pot.get(e.a), pb = pot.get(e.b); if (pa === undefined || pb === undefined) continue;
    put(e.a, pa); put(e.b, pb);
    if (e.chain) { const mm = e.chain.length - 1, fw = e.chain[0] === e.a; e.chain.forEach((n, i) => put(n, pa + (pb - pa) * (fw ? i : mm - i) / Math.max(1, mm))); } }
}
// the live sources: { n: its junction, lab, col, hot }
function vSources() {
  const out = [];
  if (!LOCKOUT && !SUPPLY_CUT) out.push({ n: NET.L1, lab: 'L1', col: SRC_COL, hot: true }, { n: NET.L2, lab: 'L2', col: OFF_WHITE, hot: false });
  if (NET.PH && !(LOCKOUT && !parts.some(p => p.t === 'dsc'))) for (const L in NET.PH) { const k = phK(L); if (phLive(k)) out.push({ n: NET.PH[L], lab: 'P' + k, col: phColK(k), hot: k !== 4 && k !== 7 }); }
  return out;
}
// the loads a source can pass through while no current goes through them (not one that is open, or burned out)
function vLoads() {
  const L = [];
  for (const e of NET.edges) if (e.kind === 'part' && LOADT(e.part.t)) { const p = e.part; if (faultOf(p) === 'open' || BLOWN[p.id]) continue; L.push({ a: e.a, b: e.b, e, p }); }
  for (const p of parts) if (p.t === 'mtr' && p._t) { const ok = p._t.map((n, i) => faultOf(p) !== 'w' + (i + 1));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (ok[i] && ok[j]) L.push({ a: p._t[i], b: p._t[j], p }); }
  return L;
}
// (an edge's travel time, worked out once per run: stepTime looks it up by a text key, too slow for 60,000 junctions)
const vStep = e => e._st !== undefined && e._stR === RUN_ID ? e._st : (e._stR = RUN_ID, e._st = stepTime(e));
let RUN_ID = 0;
/* Which of the runs es carry current, from the junctions tops to the junctions bots (Dallas, 26 Nov 2026): exactly those on
   some way from one to the other that never passes the same junction twice: the runs in one biconnected block with an
   imagined wire from the tops to the bots. Worked out from how the wiring is joined, not from the network's numbers, so a
   long riser feeding many loads is not taken for idle where its current is small. */
function vCarry(es, tops, bots) {
  const out = new Set(); if (!tops.size || !bots.size) return out;
  const S = -1, T = -2, E = [], adj = new Map(), add = (a, b, e) => { const i = E.length; E.push([a, b, e]); for (const x of [a, b]) (adj.get(x) || adj.set(x, []).get(x)).push(i); };
  for (const e of es) add(e.a, e.b, e);
  for (const n of tops) add(S, n, null); for (const n of bots) add(n, T, null);
  const st = E.length; add(S, T, null);
  // (Tarjan's blocks, without recursion: a big machine's wiring is deep)
  const disc = new Map(), low = new Map(), stk = []; let time = 0;
  const stack = [[S, -1, 0]]; disc.set(S, time); low.set(S, time++);
  while (stack.length) { const top = stack[stack.length - 1], [u, pe] = top, L = adj.get(u) || [];
    if (top[2] < L.length) { const i = L[top[2]++]; if (i === pe) continue; const [a, b] = E[i], w = a === u ? b : a;
      if (!disc.has(w)) { stk.push(i); disc.set(w, time); low.set(w, time++); stack.push([w, i, 0]); }
      else if (disc.get(w) < disc.get(u)) { stk.push(i); low.set(u, Math.min(low.get(u), disc.get(w))); } }
    else { stack.pop(); if (!stack.length) break; const p = stack[stack.length - 1][0]; low.set(p, Math.min(low.get(p), low.get(u)));
      if (low.get(u) >= disc.get(p)) { const blk = []; let i; do { i = stk.pop(); blk.push(i); } while (i !== pe); if (blk.includes(st)) for (const k of blk) if (E[k][2]) out.add(E[k][2]); } } }
  return out;
}
const vIsLoad = e => e.kind === 'part' && LOADT(e.part.t);
const vThrough = e => e.kind === 'part' && LOADT(e.part.t) && faultOf(e.part) !== 'open' && !BLOWN[e.part.id];   // (a load a source can pass through)
// what every junction is to show now: Map junction -> { lab, c }
function presenceWant() {
  const f = compNow(), srcs = vSources(), lab = new Map();
  for (const s of srcs) { const c = f(s.n), o = lab.get(c); lab.set(c, o && o.lab !== s.lab ? { x: true } : s); }   // (two sources on one piece: a short)
  const loads = vLoads(), ladj = new Map();
  for (const l of loads) { l.ca = f(l.a); l.cb = f(l.b); if (l.ca === l.cb) continue; for (const c of [l.ca, l.cb]) (ladj.get(c) || ladj.set(c, []).get(c)).push(l); }
  // pieces with no source of their own, joined to each other through loads; and the sources they reach through them
  const grp = new Map(), groups = [];
  for (const l of loads) if (l.ca !== l.cb) for (const c0 of [l.ca, l.cb]) if (!lab.has(c0) && !grp.has(c0)) {
    const g = { comps: [c0], touch: new Map() }; grp.set(c0, g); groups.push(g);
    for (let i = 0; i < g.comps.length; i++) { const u = g.comps[i];
      for (const m of ladj.get(u) || []) { const near = m.ca === u ? m.a : m.b, far = m.ca === u ? m.b : m.a, w = m.ca === u ? m.cb : m.ca, s = lab.get(w);
        if (s) { if (!s.x) (g.touch.get(s.lab) || g.touch.set(s.lab, []).get(s.lab)).push({ s, far, near }); }
        else if (!grp.has(w)) { grp.set(w, g); g.comps.push(w); } } }
  }
  // the loads with current through them: between two different sources, or a source and loads in series
  const bot = new Set();
  for (const l of loads) { if (l.ca === l.cb) continue; const sa = lab.get(l.ca), sb = lab.get(l.cb);
    const live = (s, c) => s ? !s.x : grp.has(c) && grp.get(c).touch.size > 1;
    if (!live(sa, l.ca) || !live(sb, l.cb) || (sa && sb && sa.lab === sb.lab) || (!sa && !sb)) continue;
    if (sa) bot.add(l.a); if (sb) bot.add(l.b); }
  for (const p of parts) if (p.t === 'mtr' && p._t) for (const n of p._t) { const s = lab.get(f(n)); if (s && !s.x) bot.add(n); }
  /* a load across two hot lines (Dallas, 26 Nov 2026, option A): which of them is its return, for which way the current is
     shown going: the next line round after the one feeding it (L1 to L2, S1 to S2; P1 to P2, P2 to P3, P3 to P1) */
  const retT = new Set(), PNEXT = { P1: 'P2', P2: 'P3', P3: 'P1' };
  for (const l of loads) { if (l.ca === l.cb || l.p.t === 'mtr') continue; const sa = lab.get(l.ca), sb = lab.get(l.cb);   // (not a three-phase motor's windings: all three phases feed it)
    if (!sa || !sb || sa.x || sb.x || !sa.hot || !sb.hot || sa.lab === sb.lab) continue;
    const aFeeds = PNEXT[sa.lab] ? PNEXT[sa.lab] === sb.lab : PNEXT[sb.lab] ? PNEXT[sb.lab] !== sa.lab : sa.lab < sb.lab;
    retT.add(aFeeds ? l.b : l.a); }
  // shortest way from its source to each junction (which way an idle wire is coloured from)
  const dist = new Map(), h = heap();
  for (const s of srcs) { dist.set(s.n, 0); h.push(0, s.n); }
  while (h.size()) { const [du, u] = h.pop(); if (du > dist.get(u) + 1e-9) continue;
    for (const i of NET.adj[u]) { const e = NET.edges[i]; if (!conducts(e)) continue; const w = e.a === u ? e.b : e.a, dw = du + (e.w || 0) + 1e-6;
      if (!dist.has(w) || dw < dist.get(w) - 1e-9) { dist.set(w, dw); h.push(dw, w); } } }
  // (the junction-to-junction runs and parts that pass current, by the piece they are in)
  const pe = new Map(NET.edges.filter(e => e.part).map(e => [e.part, e])), JE = new Map();
  for (const e of NET.jedges) { if (!(e.kind === 'seg' || (e.part && !LOADT(e.part.t) && pe.has(e.part) && conducts(pe.get(e.part))))) continue; const c = f(e.a); if (c !== f(e.b)) continue; (JE.get(c) || JE.set(c, []).get(c)).push(e); }
  const out = new Map(), byC = new Map();
  for (let n = 0; n < NET.nodes.length; n++) { const c = f(n); if (lab.has(c) || grp.has(c)) (byC.get(c) || byC.set(c, []).get(c)).push(n); }
  // each source's own piece: a hot one coloured as the current goes (past a pushbutton or switch its colour), a return plain
  const done = new Set(), cur = new Set(), dir = new Map();
  for (const s of [...srcs.filter(s => s.hot), ...srcs.filter(s => !s.hot)]) { const c = f(s.n), S = lab.get(c); if (S !== s || done.has(c)) continue; done.add(c);
    let cols = null;
    if (s.hot) cols = vColours(c, f, s.col, bot, dist, JE);
    else { const lc = new Map();   // (each load with current through it into this return: its own colour (or, with none, the current's))
      for (const l of loads) { if (l.ca === l.cb) continue; for (const [mine, oth, cm] of [[l.a, l.b, l.ca], [l.b, l.a, l.cb]]) if (cm === c && bot.has(oth) && out.has(oth)) lc.set(mine, l.p.color ? flowOf(l.p.color) : out.get(oth).c); }
      cols = vReturn(c, s.col, lc, dist, JE); }
    if (cols && cols.cur) { for (const n of cols.cur) cur.add(n);
      const rt = s.hot && cols.es ? cols.es.flatMap(e => [e.a, e.b]).filter(n => retT.has(n)) : [];
      if (rt.length) {   // (a hot line that is the return of a load across two hot lines: from there back to its source)
        const fx = new Map(); for (const e of cols.es) for (const n of [e.a, e.b]) { if ((dist.get(n) ?? 1) < 1e-3) fx.set(n, 0); else if (retT.has(n)) fx.set(n, 1); else if (bot.has(n)) fx.set(n, -1); }
        vDirs(dir, cols.es, vPot(cols.es, null, null, fx), cols.cur, dist, (n, p) => retT.has(n) || p > 1e-9 ? 'r' : 'h');
      } else if (cols.pot) vDirs(dir, cols.es, cols.pot, cols.cur, dist, s.hot ? 'h' : 'r'); }
    for (const n of byC.get(c) || []) out.set(n, { lab: s.lab, c: (cols && cols.get(n)) || s.col }); }
  // pieces fed only through loads with no current: the colour at the load's far end; between loads in series, a fade
  for (const g of groups) {
    if (!g.touch.size) continue;
    let col;
    if (g.touch.size === 1) { const [lb, ts] = [...g.touch][0], fc = (out.get(ts[0].far) || {}).c || ts[0].s.col; col = new Map(g.comps.map(c => [c, { lab: lb, c: fc }])); }
    else {
      const ls = [...g.touch.keys()], hot = ls.find(k => g.touch.get(k)[0].s.hot) || ls[0], ret = ls.find(k => k !== hot && !g.touch.get(k)[0].s.hot) || ls.find(k => k !== hot);
      const hc = (out.get(g.touch.get(hot)[0].far) || {}).c || g.touch.get(hot)[0].s.col, rc = g.touch.get(ret)[0].s.col;
      const ix = new Map(g.comps.map((c, i) => [c, i])), m = g.comps.length, links = [], diag = new Float64Array(m), rhs = new Float64Array(m);
      for (const l of loads) { if (l.ca === l.cb) continue; const x = ix.get(l.ca), y = ix.get(l.cb);
        if (x !== undefined && y !== undefined) { links.push([x, y, 1]); continue; }
        for (const [u, w] of [[x, l.cb], [y, l.ca]]) { if (u === undefined) continue; const s = lab.get(w); if (!s || s.x) continue; diag[u] += 1; rhs[u] += s.lab === hot ? 1 : 0; } }
      for (let i = 0; i < m; i++) diag[i] += 1e-9;
      const [v] = netSolve(m, links, diag, [rhs]);
      col = new Map(g.comps.map((c, i) => [c, { lab: 'S' + ls.sort().join(''), c: mixOk(hc, rc, clamp01(1 - v[i])) }]));
      for (const c of g.comps) for (const n of byC.get(c) || []) cur.add(n);
      // (which way along the wiring between loads in series: in at the terminal of a load nearer the hot side, out at the other)
      for (const c of g.comps) { const vc = v[ix.get(c)], tp = new Set(), bt = new Set();
        for (const l of loads) { if (l.ca === l.cb) continue; for (const [mine, cm, ow] of [[l.a, l.ca, l.cb], [l.b, l.cb, l.ca]]) { if (cm !== c) continue;
          const s = lab.get(ow), vo = s ? (s.x ? null : s.lab === hot ? 1 : 0) : ix.has(ow) ? v[ix.get(ow)] : null; if (vo === null) continue; (vo > vc ? tp : bt).add(mine); } }
        const es = JE.get(c) || []; if (tp.size && bt.size) vDirs(dir, es, vPot(es, tp, bt), new Set(byC.get(c) || []), null, n => tp.has(n) ? 'r' : bt.has(n) ? 'h' : 'm'); }
    }
    for (const [c, r] of col) for (const n of byC.get(c) || []) out.set(n, { lab: r.lab, c: r.c });
  }
  // wiring with a source on it but no current through it (Dallas, 26 Nov 2026, option 1A): a little dimmer, toward the panel's grey
  for (const [n, r] of out) if (!cur.has(n)) r.c = vDim(r.c);
  VDIR = dir;
  return out;
}
const V_DIM = 0.55, V_FADE = 240;
const V_DC = new Map(), V_FC = new Map();
const V_DS = new Set();   // (every colour that means no current: for the motion)
const vDim = c => { let d = V_DC.get(c); if (d === undefined) { d = mixOk(c, '#404040', V_DIM); V_DC.set(c, d); V_DS.add(d); } return d; };
// (a colour faded part way to another, in steps of 1/64: the same few colours over and over on a big panel)
const vFade = (a, b, f) => { const k = a + b + Math.round(f * 64); let d = V_FC.get(k); if (d === undefined) { d = mixOk(a, b, Math.round(f * 64) / 64); V_FC.set(k, d); } return d; };   // (how much dimmer wiring with no current through it is; how far a load's colour runs on past it)
/* A return piece c (L2, the neutral, X0): from each load with current through it (Dallas, 26 Nov 2026, option 2C), the
   load's own colour, fading to the return's over V_FADE as it goes on toward the bar or box; where several meet, blended. Which stretches carry current: worked out as for the hot side (out.cur). */
function vReturn(c, base, lc, dist, JE) {
  const out = new Map(), es = JE.get(c) || [], js = [...new Set(es.flatMap(e => [e.a, e.b]))]; out.cur = new Set();
  const src = new Set(js.filter(n => (dist.get(n) ?? 1) < 1e-3)), top = new Set(js.filter(n => lc.has(n)));
  if (!top.size || !src.size) return out;
  const pot = new Map(); for (const n of top) pot.set(n, 1); for (const n of src) pot.set(n, 0);
  const unk = js.filter(n => !pot.has(n)), ix = new Map(unk.map((n, i) => [n, i])), m = unk.length;
  if (m) { const links = [], diag = new Float64Array(m), rhs = new Float64Array(m);
    for (const e of es) { const k = 1 / Math.max(1, e.len || 1), x = ix.get(e.a), y = ix.get(e.b);
      if (x !== undefined && y !== undefined) links.push([x, y, k]);
      else for (const [u, w] of [[x, e.b], [y, e.a]]) if (u !== undefined && pot.has(w)) { diag[u] += k; rhs[u] += k * pot.get(w); } }
    for (let i = 0; i < m; i++) diag[i] += 1e-9;
    const [v] = netSolve(m, links, diag, [rhs]); unk.forEach((n, i) => pot.set(n, v[i])); }
  // (which stretches carry current: see vCarry)
  const carry = vCarry(es, top, src), on = e => carry.has(e); out.pot = pot; out.es = es;
  // (each load's colour runs on from it, the way the current goes, fading over V_FADE; where currents from several loads
  // come together, their colours blend (each as faded as it is); one faded right out drops out of the blend)
  const inn = new Map(); for (const e of es) if (on(e)) { const [u, w] = pot.get(e.a) > pot.get(e.b) ? [e.a, e.b] : [e.b, e.a]; (inn.get(w) || inn.set(w, []).get(w)).push([e, u]); }
  const st = new Map();
  const stOf = n => { if (st.has(n)) return st.get(n); const m = new Map(); st.set(n, m);
    if (lc.has(n)) m.set(lc.get(n), 0);
    for (const [e, u] of inn.get(n) || []) for (const [c2, d] of stOf(u)) { const dd = d + (e.len || 0); if (dd < V_FADE && !(m.get(c2) <= dd)) m.set(c2, dd); }
    return m; };
  const BC = vReturn.bc || (vReturn.bc = new Map());
  const colOf = (m, plus = 0) => { const live = [...m].filter(([, d]) => d + plus < V_FADE); if (!live.length) return base;
    const cs = live.map(([c2, d]) => vFade(c2, base, clamp01((d + plus) / V_FADE))); if (cs.length === 1) return cs[0];
    const k = cs.sort().join(); let r = BC.get(k); if (r === undefined) { r = blend(cs); BC.set(k, r); } return r; };
  for (const e of es) { if (!on(e)) continue; out.cur.add(e.a); out.cur.add(e.b);
    if (e.kind === 'seg') { const [u] = pot.get(e.a) > pot.get(e.b) ? [e.a] : [e.b], m = stOf(u), mm = e.chain.length - 1, fw = e.chain[0] === u;
      e.chain.forEach((n, i) => { out.cur.add(n); out.set(n, colOf(m, (e.len || 0) * (fw ? i : mm - i) / Math.max(1, mm))); }); } }
  for (const n of js) if (out.cur.has(n)) out.set(n, colOf(stOf(n)));
  return out;
}
/* The colours along a hot source's piece c (as the phases' were, Dallas 24 Nov 2026): its own colour, or past a pushbutton,
   selector or switch (with Buttons Color the Current on) that part's colour; through a contact, what comes in; where ways
   come together, what each brings, blended. Which way along each stretch: from the source to the loads with current
   through them (the wiring as a network of resistances); a stretch with nothing flowing along it (a wire up to an open
   contact, or one back-fed past a pressed button), from its end nearer the source. */
function vColours(c, f, base, bot, dist, JE) {
  const out = new Map(), es = JE.get(c) || [], js = [...new Set(es.flatMap(e => [e.a, e.b]))];
  const top = new Set(js.filter(n => (dist.get(n) ?? 1) < 1e-3)), btm = new Set(js.filter(n => bot.has(n)));
  const pot = new Map(); for (const n of top) pot.set(n, 1); for (const n of btm) if (!top.has(n)) pot.set(n, 0);
  const unk = js.filter(n => !pot.has(n)), ix = new Map(unk.map((n, i) => [n, i])), m = unk.length;
  if (m && btm.size) { const links = [], diag = new Float64Array(m), rhs = new Float64Array(m);
    for (const e of es) { const k = 1 / Math.max(1, e.len || 1), x = ix.get(e.a), y = ix.get(e.b);
      if (x !== undefined && y !== undefined) links.push([x, y, k]);
      else for (const [u, w] of [[x, e.b], [y, e.a]]) if (u !== undefined && pot.has(w)) { diag[u] += k; rhs[u] += k * pot.get(w); } }
    for (let i = 0; i < m; i++) diag[i] += 1e-9;
    const [v] = netSolve(m, links, diag, [rhs]); unk.forEach((n, i) => pot.set(n, v[i])); }
  else for (const n of unk) pot.set(n, 1);
  const dd = n => dist.get(n) ?? 1e9;
  const up = e => { const pa = pot.get(e.a), pb = pot.get(e.b); return Math.abs(pa - pb) > 1e-7 ? (pa > pb ? e.a : e.b) : (dd(e.a) <= dd(e.b) ? e.a : e.b); };
  const inn = new Map(); for (const e of es) { const u = up(e), w = u === e.a ? e.b : e.a; (inn.get(w) || inn.set(w, []).get(w)).push([e, u]); }
  const col = ks => !ks.length ? base : ks.length === 1 ? flowOf(btnColour(ks[0])) : blend(ks.map(x => flowOf(btnColour(x))));
  const shown = r => r.rd < RAMP ? mixOk(r.from, col(r.set), r.rd / RAMP) : col(r.set);
  const st = new Map();
  const stOf = n => { if (st.has(n)) return st.get(n); st.set(n, { set: [], from: base, rd: RAMP });
    const ins = (inn.get(n) || []).map(([e, u]) => { const r = stOf(u), L = e.len || 0;
      return e.kind === 'part' && tints(e.part) ? { set: [opKey(e.part)], from: shown(r), rd: RAMP } : { set: r.set, from: r.from, rd: r.rd + L }; });   // (past a pushbutton, selector or switch: its colour at once (Dallas, 25 Nov 2026), not shading in)
    let r;
    if (!ins.length) r = { set: [], from: base, rd: RAMP };
    else { const s = [...new Set(ins.flatMap(q => q.set))].sort(), same = ins.every(q => q.set.join() === s.join());
      r = same ? ins.reduce((a, q) => q.rd < a.rd ? q : a) : { set: s, from: blend(ins.map(shown)), rd: 0 }; }
    st.set(n, r); return r; };
  for (const n of js) out.set(n, shown(stOf(n)));
  // (which stretches carry current: see vCarry)
  out.cur = new Set(); for (const e of vCarry(es, top, btm)) { out.cur.add(e.a); out.cur.add(e.b); if (e.chain) for (const n of e.chain) out.cur.add(n); }
  out.pot = pot; out.es = es;
  for (const e of es) if (e.kind === 'seg') { const u = up(e), r = stOf(u), mm = e.chain.length - 1, fw = u === e.a;
    e.chain.forEach((n, i) => { if (n === e.a || n === e.b) return; const d = (e.len || 0) * (fw ? i : mm - i) / Math.max(1, mm); out.set(n, shown({ set: r.set, from: r.from, rd: r.rd + d })); }); }
  return out;
}
// may what junction w is to show come to it from u along edge e? (fromC: u is itself changing, so the front is passing
// through it; otherwise u must already show exactly what w is to)
function vPass(e, U, W, fromC) {
  if (U.lab !== W.lab) return false;
  const same = U.c === W.c;
  if (e.kind === 'w') return fromC || same;
  if (e.kind !== 'part') return false;
  if (LOADT(e.part.t)) return fromC || same;   // (through a load with no current through it)
  return conducts(e);   // (through a closed switch: a pushbutton's colour starts there)
}
function vPut(n, at, c, via) {
  let a = VTL.get(n); if (!a) VTL.set(n, a = [[-1e9, null]]);
  while (a.length > 1 && a[a.length - 1][0] >= at - 1e-9) a.pop();
  a.push([at, c, via, c ? VDIR.get(n) : undefined]);   // (and which way the current goes there, shown with its colour)
  let k = 0; for (let i = 0; i < a.length; i++) if (a[i][0] <= simT) k = i;
  if (k > 0) a.splice(0, k);
  if (at > paintUntil) paintUntil = at;   // (not busyUntil: a clicked button is let go once the relays have settled, as before)
}
// work out again what is shown, at time t; causes: the junctions where something changed (a switch that moved)
function presenceNow(t, causes = []) {
  if (!NET || TS_MODE) return;
  const want = presenceWant(), N = NET.nodes.length, inC = new Uint8Array(N), C = [], lc = new Uint8Array(N); let nL = 0;   // (lc: its source changes, not just its colour)
  for (let n = 0; n < N; n++) { const o = VCUR.get(n), w = want.get(n); if (!o !== !w || (o && (o.lab !== w.lab || o.c !== w.c))) { inC[n] = 1; C.push(n); if (!o || !w || o.lab !== w.lab) { lc[n] = 1; nL++; } } }
  if (!C.length) return;
  const srcN = vSources().map(s => s.n);
  // when what was there goes: from where the change happened, along the wires and through closed switches
  const toff = new Float64Array(N).fill(NaN), h = heap(), has = (a, n) => a[n] === a[n];   // (typed arrays: a whole machine can have 60,000 junctions)
  // (on through loads too: what had come through one, such as the neutral back through a light, goes the same way when its
  // source goes (Dallas, 25 Nov 2026), rather than all at once)
  // (a switch that closed: from its end that stays as it was, through it, so what goes and what comes travel together;
  // one that opened: from both its ends)
  const cs = new Set(causes.filter(n => n !== undefined));
  const keeps = o => !inC[o] || ((VCUR.get(o) || {}).lab === (want.get(o) || {}).lab && want.get(o));   // (o keeps its source: at most its colour changes)
  const fedThrough = n => NET.adj[n].some(i => { const e = NET.edges[i], o = e.a === n ? e.b : e.a; return conducts(e) && cs.has(o) && keeps(o); });
  for (const n of [...cs, ...srcN.filter(n => inC[n])]) if (!has(toff, n) && (keeps(n) || !cs.has(n) || !fedThrough(n))) { toff[n] = t; h.push(t, n); }
  // (as walk, stopping once every junction that changes has been reached: on a whole machine most of the wiring doesn't)
  let left = C.length; const fin = new Uint8Array(N);   // (also when a change of colour alone, as current starts or stops, gets to where no front takes it)
  while (h.size() && left > 0) { const [tu, u] = h.pop(); if (fin[u] || tu > toff[u] + 1e-12) continue; fin[u] = 1; if (inC[u]) left--;
    for (const i of NET.adj[u]) { const e = NET.edges[i]; if (!conducts(e) && !vThrough(e)) continue; const w = e.a === u ? e.b : e.a, tw = tu + vStep(e);
      if (!has(toff, w) || tw < toff[w] - 1e-12) { toff[w] = tw; h.push(tw, w); } } }
  // when what is to be there comes: from next to it, where it already is, as a front (never before what was there has
  // gone). First the source itself (carrying on in the colour it has where it comes from), then its colour as it settles
  // (a mix where ways meet, and so on), each its own front
  const offAt = n => lc[n] && has(toff, n) ? toff[n] : -1e9;
  const front = (match, seedAt, extra = [], mask = inC) => {
    const at = new Float64Array(N).fill(NaN), by = new Array(N), col = new Array(N), hq = heap();
    const go = (w, tw, e, c) => { if (!has(at, w) || tw < at[w] - 1e-12) { at[w] = tw; by[w] = e.part || null; col[w] = c; hq.push(tw, w); } };
    for (const n of srcN) if (inC[n] && want.get(n)) go(n, t, {}, want.get(n).c);
    for (const n of extra) if (inC[n] && want.get(n)) go(n, t, {}, want.get(n).c);
    for (const w of C) { const W = want.get(w); if (!W || !mask[w]) continue;
      for (const i of NET.adj[w]) { const e = NET.edges[i], u = e.a === w ? e.b : e.a, s = seedAt(u, W, e, w); if (s) go(w, Math.max(s[0] + vStep(e), offAt(w)), e, vIsLoad(e) ? W.c : s[1]); } }
    while (hq.size()) { const [tu, u] = hq.pop(); if (tu > at[u] + 1e-12) continue; const U = want.get(u);
      for (const i of NET.adj[u]) { const e = NET.edges[i], w = e.a === u ? e.b : e.a; if (!mask[w]) continue; const W = want.get(w); if (!W || !match(e, U, W, u, w)) continue;
        go(w, Math.max(tu + vStep(e), offAt(w)), e, vIsLoad(e) ? W.c : col[u]); } }   // (through a load: the colour it is to have, not the far side's)
    return { at, by, col };
  };
  // (the source: from a junction that already has it, in whatever colour, or one that keeps it while its colour changes)
  const lab = front((e, U, W) => vPass(e, U, { lab: W.lab, c: U.c }, true), (u, W, e) => { const O = VCUR.get(u), Wu = want.get(u);
    if (!O || !Wu || O.lab !== W.lab || Wu.lab !== W.lab || !vPass(e, Wu, { lab: W.lab, c: Wu.c }, true)) return null; const ts = Math.max(t, O.t); return [ts, tlCol(VTL.get(u) || [], ts + 1e-6) || O.c]; }, [], lc);
  // (the colour it is to have: from a junction that already shows it, or through a closed switch, then on through what changes)
  // (where only the colour changes, current starting or stopping, the change comes only from the switch that moved and on
  // from there, through a load too (its far side changes as the change reaches it), never from a bar or box (Dallas, 26 Nov 2026))
  const cf = front((e, U, W, u, w) => vPass(e, U, W, true) || (vIsLoad(e) && !lc[w]), (u, W, e, w) => { if (inC[u] || !lc[w]) return null; const U = want.get(u); if (!U || !vPass(e, U, W, false)) return null; return [Math.max(t, (VCUR.get(u) || {}).tc ?? t), U.c]; }, [...cs].filter(n => keeps(n)));   // (and from the switch that moved, both ways: where only the colour changes there (current starting or stopping through it), the change starts there)
  const get = (a, n) => has(a, n) ? a[n] : undefined;
  for (const n of C) { const W = want.get(n), O = VCUR.get(n), tf = get(toff, n), tc = get(cf.at, n), tl0 = get(lab.at, n);
    if (!W) { vPut(n, tf ?? t, null, null); VCUR.delete(n); continue; }
    const at = tc ?? tl0 ?? tf ?? t, first = (!O || O.lab !== W.lab) && tl0 !== undefined && tl0 < at - 1e-6 ? tl0 : at;
    if (O && O.lab !== W.lab && tf !== undefined && first > tf + 1e-6) {
      // (one source draining away from a junction another would reach without it (the neutral, Dallas 25 Nov 2026; another
      // phase, across a load wired phase to phase, 26 Nov): the other was there underneath all along, and shows as the first goes)
      vPut(n, tf, W.c, null); VCUR.set(n, { lab: W.lab, c: W.c, t: tf, tc: tf }); continue;
    }
    if (first < at) vPut(n, first, lab.col[n], lab.by[n] || null);   // (the source there already, in the colour it comes with)
    vPut(n, at, W.c, (tc !== undefined ? cf.by[n] : lab.by[n]) || null); VCUR.set(n, { lab: W.lab, c: W.c, t: O && O.lab === W.lab ? Math.min(O.t, first) : first, tc: at });
  }
  needPaint = true;
}
// a part's lead (from junction n into the part): what it shows, as events for paintLead (filling from the part's own
// body when what it shows came in through the part)
function vLead(p, n) {
  const a = VTL.get(n); if (!a) return null;
  return a.map(([t0, col, by]) => ({ t0, col, from: by && (by === p || by.x === p) ? 'body' : 'term' }));
}
