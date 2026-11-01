/* ---------------- connectivity ----------------
   Wires are traced point by point. Points where a wire ends or a part's end sits are shared, so everything
   at that point joins; wires that merely cross stay apart. A wire end on the left edge is fed from L1, on the
   right edge it returns to L2. */
function network() {
  const shared = new Set();
  for (const w of wires) { shared.add(key(w.x1, w.y1)); shared.add(key(w.x2, w.y2)); }
  for (const p of parts) for (const [x, y] of terms(p)) shared.add(key(x, y));
  const nodes = [], index = new Map();
  const node = (x, y, k) => { if (!index.has(k)) { index.set(k, nodes.length); nodes.push({ x, y, k }); } return index.get(k); };
  const L1 = node(-1, 0, 'L1'), L2 = node(W + 1, 0, 'L2');
  const edges = [], subs = [];
  // jedges: the same wiring seen as junctions (wire ends, part ends, T-points) joined by runs of wire and by parts
  const jedges = [];
  for (const w of wires) {
    const len = Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1), n = Math.max(1, Math.round(len / SUB));
    let prev = null, chain = [];
    for (let i = 0; i <= n; i++) {
      const x = w.x1 + (w.x2 - w.x1) * i / n, y = w.y1 + (w.y2 - w.y1) * i / n, k0 = key(x, y);
      const id = node(x, y, shared.has(k0) ? k0 : k0 + '#' + w.id);
      if (prev) { edges.push({ a: prev.id, b: id, w: len / n, kind: 'w' }); subs.push({ a: prev.id, b: id, x1: prev.x, y1: prev.y, x2: x, y2: y, wire: w }); }
      chain.push(id);
      if (shared.has(k0) && chain.length > 1) { jedges.push({ kind: 'seg', a: chain[0], b: id, len: (chain.length - 1) * len / n, chain }); chain = [id]; }
      prev = { id, x, y };
    }
  }
  for (const p of parts) {
    if (isBox(p) || isPwr3(p) || p.t === 'mtr') continue;   // (supply boxes are not a way through: their connection points are L1 or L2, below; continuations: further down)
    const [[ax, ay], [bx, by]] = terms(p);
    p._a = node(ax, ay, key(ax, ay)); p._b = node(bx, by, key(bx, by));
    edges.push({ a: p._a, b: p._b, w: 2 * TERM(p), kind: 'part', part: p });
    jedges.push({ kind: 'part', a: p._a, b: p._b, len: 2 * TERM(p), part: p });
  }
  // continuations: each box's connection points join at its middle, and the middles of all the boxes with the same
  // number join one another (a very short run, so the current is through at once)
  const jmps = {};
  for (const p of parts) if (isJmp(p)) {
    p._c = node(p.x, p.y, 'jmp' + p.id);
    p._t = terms(p).map(([x, y]) => { const i = node(x, y, key(x, y)); edges.push({ a: i, b: p._c, w: TERM(p), kind: 'w' }); jedges.push({ kind: 'seg', a: i, b: p._c, len: TERM(p), chain: [i, p._c] }); return i; });
    (jmps[p.L] = jmps[p.L] || []).push(p);
  }
  for (const k in jmps) for (let i = 1; i < jmps[k].length; i++) {
    const a = jmps[k][i - 1]._c, b = jmps[k][i]._c;
    edges.push({ a, b, w: 1, kind: 'w' }); jedges.push({ kind: 'seg', a, b, len: 1, chain: [a, b], jump: true });
  }
  // a transformer's secondary: X1 joins L1 and X2 joins L2 through two switches inside it (p._sw: the same two objects
  // from one drawing to the next, so the simulation can work them), closed while its primary is fed (see closed)
  const xfmFeeds = [];
  for (const p of parts) if (p.t === 'xfm') {
    p._t = terms(p).map(([x, y]) => node(x, y, key(x, y)));
    const f1 = node(p.x, p.y - 1, 'xf1-' + p.id), f2 = node(p.x, p.y + 1, 'xf2-' + p.id);
    edges.push({ a: L1, b: f1, w: 0, kind: 'w' }, { a: L2, b: f2, w: 0, kind: 'w' }); xfmFeeds.push([f1, 1], [f2, 0]);
    p._sw = p._sw || [{ t: 'xsw', id: 'xa' + p.id }, { t: 'xsw', id: 'xb' + p.id }];
    Object.assign(p._sw[0], { x: p, _a: f1, _b: p._t[2] }); Object.assign(p._sw[1], { x: p, _a: p._t[3], _b: f2 });
    for (const k of p._sw) { edges.push({ a: k._a, b: k._b, w: 2, kind: 'part', part: k }); jedges.push({ kind: 'part', a: k._a, b: k._b, len: 2, part: k }); }
  }
  // three-phase parts: each pole of one is a switch inside it (p._poles: the same three objects from one drawing to the
  // next, like a transformer's), between its two ends on that line; a motor's terminals lead nowhere (see motorsNow)
  for (const p of parts) if (isPwr3(p)) {
    p._t = terms(p).map(([x, y]) => node(x, y, key(x, y)));
    p._poles = p._poles || [0, 1, 2].map(i => ({ t: 'pp', id: p.id + '.' + i, i }));
    p._poles.forEach((k, i) => { Object.assign(k, { x: p, _a: p._t[2 * i], _b: p._t[2 * i + 1] }); edges.push({ a: k._a, b: k._b, w: 80, kind: 'part', part: k }); jedges.push({ kind: 'part', a: k._a, b: k._b, len: 80, part: k }); });
  }
  for (const p of parts) if (p.t === 'mtr') p._t = terms(p).map(([x, y]) => node(x, y, key(x, y)));
  const jadj = new Map(), feedV = new Map();
  for (const [i, v] of xfmFeeds) feedV.set(i, v);
  jedges.forEach((e, i) => { e.i = i; for (const v of [e.a, e.b]) { if (!jadj.has(v)) jadj.set(v, []); jadj.get(v).push(e); } });
  const feeds = [];
  for (const [k, i] of index) {
    if (k.includes('#')) continue;
    const n = nodes[i];
    if (barsOn() && n.x === 0) { edges.push({ a: L1, b: i, w: 0, kind: 'w' }); feeds.push({ x: 0, y: n.y, t: 'L1', bar: true }); feedV.set(i, 1); }
    if (barsOn() && n.x === W) { edges.push({ a: L2, b: i, w: 0, kind: 'w' }); feeds.push({ x: W, y: n.y, t: 'L2', bar: true }); feedV.set(i, 0); }
  }
  // the phase boxes: every connection point of one is its phase (PH: a node for each phase in use, joined to all of them;
  // three-phase power is kept apart from L1 and L2, see phasesNow)
  const PH = {};
  for (const p of parts) if (isPh(p)) {
    const h = PH[p.L] ?? (PH[p.L] = node(-10 - +p.L, 0, 'PH' + p.L));
    p._t = terms(p).map(([x, y]) => { const i = node(x, y, key(x, y)); edges.push({ a: h, b: i, w: 0, kind: 'w' }); return i; });
  }
  // the supply boxes: every connection point of an L1 box is L1, of an L2 box L2
  for (const p of parts) if (isSrc(p)) {
    const one = p.t === 'l1';
    p._t = terms(p).map(([x, y]) => { const i = node(x, y, key(x, y)); edges.push({ a: one ? L1 : L2, b: i, w: 0, kind: 'w' }); feeds.push({ x, y, t: one ? 'L1' : 'L2', box: p }); feedV.set(i, one ? 1 : 0); return i; });
  }
  const adj = nodes.map(() => []);
  edges.forEach((e, i) => { e.i = i; adj[e.a].push(i); adj[e.b].push(i); });
  // wires that cross without joining: the horizontal one hops over the vertical one
  const hops = [];
  for (const v of wires) if (v.x1 === v.x2) for (const h of wires) if (h.y1 === h.y2) {
    const x = v.x1, y = h.y1;
    if (x > Math.min(h.x1, h.x2) && x < Math.max(h.x1, h.x2) && y > Math.min(v.y1, v.y2) && y < Math.max(v.y1, v.y2) && !shared.has(key(x, y))) hops.push([x, y]);
  }
  return { nodes, edges, adj, subs, L1, L2, feeds, hops, jedges, jadj, feedV, PH };
}
function components(net, ok) {
  const par = net.nodes.map((_, i) => i);
  const f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  net.edges.forEach(e => { if (ok(e)) { const a = f(e.a), b = f(e.b); if (a !== b) par[a] = b; } });
  return f;
}
// build-mode check: with every button passing current, is each coil wired from L1 to L2? (A load in series with
// others is fine, with a note of the voltage it gets: { note }.)
function wiringIssues(net) {
  const f = components(net, e => e.kind === 'w' || isSw(e.part)), l1 = f(net.L1), l2 = f(net.L2), out = new Map();
  if (l1 === l2) out.set('short', true);
  const S = l1 === l2 ? null : loadShares(f, net);
  for (const p of parts) {
    if (isSrc(p)) { if (!p._t.some(i => net.adj[i].length > 1)) out.set(p.id, 'Not wired to anything'); continue; }
    if (isPwr3(p)) {
      if (!p._t.some(i => net.adj[i].length > 1)) out.set(p.id, 'Not wired to anything');
      else if (p.t === 'mst' && !parts.some(q => q.t === 'coil' && q.L === p.L)) out.set(p.id, `No ${p.L} coil`);
      continue;
    }
    if (p.t === 'mtr') {
      const ks = p._t.map(i => phaseAt(net, f, i));
      if (!p._t.some(i => net.adj[i].length > 0)) out.set(p.id, 'Not wired to anything');
      else if (new Set(ks.filter(k => k > 0)).size < 3) out.set(p.id, 'Not fed all three phases');
      continue;
    }
    if (isPh(p)) {
      const c = f(net.PH[p.L]), o = Object.keys(net.PH).filter(k => k !== p.L && f(net.PH[k]) === c);
      if (o.length) { out.set(p.id, `Shorted to L${o[0]}`); out.set('phshort', `L${p.L} connects straight to L${o[0]}`); }
      else if (c === l1 || c === l2) { out.set(p.id, 'Joined to the control circuit'); out.set('phshort', `L${p.L} connects straight to the control circuit's ${c === l1 ? 'L1' : 'L2'}`); }
      else if (!p._t.some(i => net.adj[i].length > 1)) out.set(p.id, 'Not wired to anything');
      continue;
    }
    if (isJmp(p)) { if (!p._t.some(i => net.adj[i].length > 1)) out.set(p.id, 'Not wired to anything'); else if (!parts.some(q => q !== p && isJmp(q) && q.L === p.L)) out.set(p.id, `No other continuation ${p.L}`); continue; }
    const a = f(p._a), b = f(p._b);
    if (p.t === 'xfm' && phaseFed(net, f, p)) continue;   // (its primary across two phases)
    if (LOADT(p.t)) {
      const sh = S ? S.share.get(p.id) || 0 : 1;
      if (sh < 1e-9) out.set(p.id, p.t === 'xfm' && (phaseAt(net, f, p._a) || phaseAt(net, f, p._b)) ? 'Not wired across two phases' : 'Not wired from L1 to L2');
      else if (sh < 1 - 1e-6) out.set(p.id, { note: `In series: ${Math.round(sh * SUPPLY_V * 10) / 10} V` });
    }
    else if (net.adj[p._a].length < 2 || net.adj[p._b].length < 2) out.set(p.id, 'An end is not connected');
  }
  return out;
}
// the phase that junction n is joined to through f (0: none; -1: more than one, or a phase and the control circuit)
function phaseAt(net, f, n) {
  let k = 0; const c = f(n);
  for (const L in net.PH) if (f(net.PH[L]) === c) { if (k) return -1; k = +L; }
  return k && (c === f(net.L1) || c === f(net.L2)) ? -1 : k;
}
// a transformer whose primary is across two different phases
const phaseFed = (net, f, p) => { const a = phaseAt(net, f, p._a), b = phaseAt(net, f, p._b); return a > 0 && b > 0 && a !== b; };
