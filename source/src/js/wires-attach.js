/* ---------------- keeping wires attached ----------------
   A wire attached to a part is followed back along its run of straight pieces (through plain corners) to the first
   place it really joins something: another part, a junction, a bar. When the part moves, that whole run is redrawn
   from there to the part's new position with tidy right-angle bends, so wires never pile up into staircases. */
const onSeg = (w, x, y) => (w.y1 === w.y2 && y === w.y1 && x > Math.min(w.x1, w.x2) && x < Math.max(w.x1, w.x2)) || (w.x1 === w.x2 && x === w.x1 && y > Math.min(w.y1, w.y2) && y < Math.max(w.y1, w.y2));
const isEnd = (w, x, y) => (w.x1 === x && w.y1 === y) || (w.x2 === x && w.y2 === y);
function pointInfo(x, y, skip = new Set(), skipPart = null) {
  let ends = 0, interior = false, term = false;
  const skipP = skipPart instanceof Set ? skipPart : new Set(skipPart ? [skipPart] : []);
  for (const w of wires) { if (skip.has(w)) continue; if (isEnd(w, x, y)) ends++; else if (onSeg(w, x, y)) interior = true; }
  for (const q of parts) if (!skipP.has(q)) for (const [tx, ty] of terms(q)) if (tx === x && ty === y) term = true;
  return { ends, interior, term, bar: x === 0 || x === W };
}
const connects = i => i.ends > 0 || i.interior || i.term || i.bar;
function chainFrom(S, w, stop) {
  const segs = [w]; let cur = w, at = S;
  for (let guard = 0; guard < 200; guard++) {
    const o = cur.x1 === at[0] && cur.y1 === at[1] ? [cur.x2, cur.y2] : [cur.x1, cur.y1];
    const inf = pointInfo(o[0], o[1]);
    if (inf.term || inf.interior || inf.bar || inf.ends !== 2) return { segs, far: o };
    const next = wires.find(x => x !== cur && isEnd(x, o[0], o[1]));
    if (!next || segs.includes(next) || (stop && stop.has(next))) return { segs, far: o };
    segs.push(next); cur = next; at = o;
  }
  return { segs, far: at };
}
// a tidy path from F to M: straight if they line up, otherwise one or two right-angle bends, arriving level with M
function route(F, fOri, M, xKeep) {
  if (F[0] === M[0] && F[1] === M[1]) return [];
  if (F[0] === M[0] || F[1] === M[1]) return [[F[0], F[1], M[0], M[1]]];
  if (fOri === 'v') return [[F[0], F[1], F[0], M[1]], [F[0], M[1], M[0], M[1]]];
  const lo = Math.min(F[0], M[0]), hi = Math.max(F[0], M[0]);
  const xm = xKeep !== null && xKeep > lo && xKeep < hi ? xKeep : Math.min(hi - G, Math.max(lo + G, snap((F[0] + M[0]) / 2)));
  return [[F[0], F[1], xm, F[1]], [xm, F[1], xm, M[1]], [xm, M[1], M[0], M[1]]].filter(q => q[0] !== q[2] || q[1] !== q[3]);
}
// the wiring with a group of parts and wires shifted by (dx, dy): wires joining the group to the rest of the
// circuit are redrawn from where they join the rest; also where the moved part ends would make new connections
/* a wire that something joins partway along (another wire's end, or a part's end) is cut there first, so a run
   being redrawn stops at that junction instead of carrying on past it (the pieces join up again afterwards) */
function splitAtJoints(ws, wireIds) {
  const pts = [];
  for (const w of ws) pts.push([w.x1, w.y1], [w.x2, w.y2]);
  for (const q of parts) pts.push(...terms(q));
  const out = [];
  for (const w of ws) {
    const cut = pts.filter(([x, y]) => onSeg(w, x, y)).map(([x, y]) => w.y1 === w.y2 ? x : y);
    if (!cut.length) { out.push(w); continue; }
    const hz = w.y1 === w.y2, a = hz ? w.x1 : w.y1, b = hz ? w.x2 : w.y2, dir = Math.sign(b - a);
    const stops = [...new Set(cut)].sort((u, v) => (u - v) * dir).concat([b]);
    let prev = a;
    stops.forEach((c, i) => {
      const seg = hz ? [prev, w.y1, c, w.y1] : [w.x1, prev, w.x1, c];
      const piece = i === 0 ? { id: w.id, x1: seg[0], y1: seg[1], x2: seg[2], y2: seg[3] } : Wr(...seg);
      if (i > 0 && wireIds && wireIds.has(w.id)) wireIds.add(piece.id);
      out.push(piece); prev = c;
    });
  }
  return out;
}
function movedGroup(partIds, wireIds0, dx, dy) {
  const saved = wires, wireIds = new Set(wireIds0);
  wires = splitAtJoints(wires, wireIds);
  try { return movedGroup1(partIds, wireIds, dx, dy); } finally { wires = saved; }
}
function movedGroup1(partIds, wireIds, dx, dy) {
  const P = parts.filter(p => partIds.has(p.id)), PS = new Set(P);
  // a selected wire fastened to a part that is staying put (or to a bar) stays fastened: it is redrawn, not carried along
  const fixedPt = (x, y) => x === 0 || x === W || parts.some(q => !partIds.has(q.id) && terms(q).some(([a, b]) => a === x && b === y));
  const WS = wires.filter(w => wireIds.has(w.id) && !fixedPt(w.x1, w.y1) && !fixedPt(w.x2, w.y2));
  const pts = new Map();
  for (const p of P) for (const [x, y] of terms(p)) pts.set(key(x, y), [x + dx, y + dy]);
  for (const w of WS) for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) pts.set(key(x, y), [x + dx, y + dy]);
  const used = new Set(WS), add = WS.map(w => Object.assign([w.x1 + dx, w.y1 + dy, w.x2 + dx, w.y2 + dy], { id: w.id }));
  for (const [k, NM] of pts) {
    const [x, y] = k.split(',').map(Number);
    for (const w of wires) {
      if (used.has(w) || !isEnd(w, x, y)) continue;
      const ch = chainFrom([x, y], w, used); ch.segs.forEach(q => used.add(q));
      if (pts.has(key(ch.far[0], ch.far[1]))) { ch.segs.forEach(q => add.push([q.x1 + dx, q.y1 + dy, q.x2 + dx, q.y2 + dy])); continue; }
      const last = ch.segs[ch.segs.length - 1], fOri = last.y1 === last.y2 ? 'h' : 'v';
      const v = [...ch.segs].reverse().find(q => q.x1 === q.x2);
      add.push(...route(ch.far, fOri, NM, v ? v.x1 : null));
    }
    // an end sitting right on the end of a part that stays put (or on a bar), joined with no wire between: a wire is
    // drawn to keep them joined
    if ((dx || dy) && (x === 0 || x === W || parts.some(q => !partIds.has(q.id) && terms(q).some(([a, b]) => a === x && b === y))))
      add.push(...route([x, y], 'h', NM, null));
  }
  const hits = [];
  if (dx || dy) for (const p of P) for (const [x, y] of terms(p)) { const n = [x + dx, y + dy]; if (!pts.has(key(...n)) && connects(pointInfo(n[0], n[1], used, PS))) hits.push(n); }
  return { wires: wires.filter(w => !used.has(w)).concat(add.map(q => q.id ? { id: q.id, x1: q[0], y1: q[1], x2: q[2], y2: q[3] } : Wr(...q))), hits };
}
function movedWires(p, nx, ny) { return movedGroup(new Set([p.id]), new Set(), nx - p.x, ny - p.y); }
const stateOf = () => JSON.stringify({ parts, wires, W, WU: W_USER }, (k, v) => k.startsWith('_') ? undefined : v);
function restore(st) { const o = JSON.parse(st); parts = o.parts; wires = o.wires; if (o.W) W = o.W; W_USER = o.WU ?? null; }

// a wire running across a part's body (other than the run it sits in, along its own line): a part can't go there, as
// the wire would be hidden under it and cut
function wireInTheWay(p) {
  const h = (LOADT(p.t) ? COIL : BOX) / 2, L = p.x - TERM(p), R = p.x + TERM(p);
  return wires.some(w => w.x1 === w.x2
    ? w.x1 > L && w.x1 < R && Math.max(w.y1, w.y2) > p.y - h && Math.min(w.y1, w.y2) < p.y + h
    : w.y1 !== p.y && Math.abs(w.y1 - p.y) < h && Math.max(w.x1, w.x2) > L && Math.min(w.x1, w.x2) < R);
}
