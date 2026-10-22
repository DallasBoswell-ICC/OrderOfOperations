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
    const [[ax, ay], [bx, by]] = terms(p);
    p._a = node(ax, ay, key(ax, ay)); p._b = node(bx, by, key(bx, by));
    edges.push({ a: p._a, b: p._b, w: 2 * TERM(p), kind: 'part', part: p });
    jedges.push({ kind: 'part', a: p._a, b: p._b, len: 2 * TERM(p), part: p });
  }
  const jadj = new Map(), feedV = new Map();
  jedges.forEach((e, i) => { e.i = i; for (const v of [e.a, e.b]) { if (!jadj.has(v)) jadj.set(v, []); jadj.get(v).push(e); } });
  const feeds = [];
  for (const [k, i] of index) {
    if (k.includes('#')) continue;
    const n = nodes[i];
    if (n.x === 0) { edges.push({ a: L1, b: i, w: 0, kind: 'w' }); feeds.push({ x: 0, y: n.y, t: 'L1' }); feedV.set(i, 1); }
    if (n.x === W) { edges.push({ a: L2, b: i, w: 0, kind: 'w' }); feeds.push({ x: W, y: n.y, t: 'L2' }); feedV.set(i, 0); }
  }
  const adj = nodes.map(() => []);
  edges.forEach((e, i) => { e.i = i; adj[e.a].push(i); adj[e.b].push(i); });
  // wires that cross without joining: the horizontal one hops over the vertical one
  const hops = [];
  for (const v of wires) if (v.x1 === v.x2) for (const h of wires) if (h.y1 === h.y2) {
    const x = v.x1, y = h.y1;
    if (x > Math.min(h.x1, h.x2) && x < Math.max(h.x1, h.x2) && y > Math.min(v.y1, v.y2) && y < Math.max(v.y1, v.y2) && !shared.has(key(x, y))) hops.push([x, y]);
  }
  return { nodes, edges, adj, subs, L1, L2, feeds, hops, jedges, jadj, feedV };
}
function components(net, ok) {
  const par = net.nodes.map((_, i) => i);
  const f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  net.edges.forEach(e => { if (ok(e)) { const a = f(e.a), b = f(e.b); if (a !== b) par[a] = b; } });
  return f;
}
// build-mode check: with every button passing current, is each coil wired from L1 to L2?
function wiringIssues(net) {
  const f = components(net, e => e.kind === 'w' || isSw(e.part)), l1 = f(net.L1), l2 = f(net.L2), out = new Map();
  if (l1 === l2) out.set('short', true);
  for (const p of parts) {
    const a = f(p._a), b = f(p._b);
    if (p.t === 'coil') { if (!((a === l1 && b === l2) || (a === l2 && b === l1))) out.set(p.id, 'Not wired from L1 to L2'); }
    else if (net.adj[p._a].length < 2 || net.adj[p._b].length < 2) out.set(p.id, 'An end is not connected');
  }
  return out;
}
