function routeWire(a, b, horizFirst) {
  if (a[0] === b[0] || a[1] === b[1]) return [[a[0], a[1], b[0], b[1]]];
  return horizFirst ? [[a[0], a[1], b[0], a[1]], [b[0], a[1], b[0], b[1]]] : [[a[0], a[1], a[0], b[1]], [a[0], b[1], b[0], b[1]]];
}
// tidy the wiring: wires along the same line merge into one, and no wire runs underneath a part
function normalize() {
  // each stretch remembers the wires it came from, so a wire keeps its id (and stays selected) when pieces join up
  const Hs = new Map(), Vs = new Map();
  const add = (m, k, a, b, id) => { if (a === b) return; if (!m.has(k)) m.set(k, []); m.get(k).push([Math.min(a, b), Math.max(a, b), [id]]); };
  // (a wire lying along L1 or L2 does nothing, as the bar joins everything on it, and it would hide behind the bar
  // where it cannot be picked, leaving stray screw terminals: such pieces are dropped, as when a run to a bar slides)
  for (const w of wires) { if (w.y1 === w.y2) add(Hs, w.y1, w.x1, w.x2, w.id); else if (w.x1 === w.x2 && !(barsOn() && (w.x1 === 0 || w.x1 === W))) add(Vs, w.x1, w.y1, w.y2, w.id); }
  // Wires in line that overlap become one. Two that only meet end to end become one too, unless they meet on a wire
  // running across: there their ends make a junction (as when parallel branches are wired into the middle of a run),
  // and joined up they would only cross it, hopping over it instead of connecting.
  const across = (horiz, at, c) => wires.some(w => horiz ? w.x1 === w.x2 && w.x1 === c && Math.min(w.y1, w.y2) <= at && Math.max(w.y1, w.y2) >= at
                                                        : w.y1 === w.y2 && w.y1 === c && Math.min(w.x1, w.x2) <= at && Math.max(w.x1, w.x2) >= at);
  const merge = (list, horiz, at) => { list.sort((a, b) => a[0] - b[0]); const out = []; for (const iv of list) { const l = out[out.length - 1]; if (l && (iv[0] < l[1] || iv[0] === l[1] && !across(horiz, at, l[1]))) { l[1] = Math.max(l[1], iv[1]); l[2] = l[2].concat(iv[2]); } else out.push([iv[0], iv[1], [...iv[2]]]); } return out; };
  const out = [], used = new Set(), keep = (x1, y1, x2, y2, ids) => {
    const id = [...ids].sort((u, v) => u - v).find(i => !used.has(i));   // the oldest wire's id
    if (id !== undefined) { used.add(id); out.push({ id, x1, y1, x2, y2 }); } else out.push(Wr(x1, y1, x2, y2));
  };
  for (const [y, list] of Hs) {
    let ivs = merge(list, true, y);
    for (const p of parts) if (p.y === y) {
      const a = p.x - TERM(p), b = p.x + TERM(p), next = [];
      for (const [lo, hi, ids] of ivs) { if (hi <= a || lo >= b) next.push([lo, hi, ids]); else { if (lo < a) next.push([lo, a, ids]); if (hi > b) next.push([b, hi, ids]); } }
      ivs = next;
    }
    for (const [lo, hi, ids] of ivs) keep(lo, y, hi, y, ids);
  }
  for (const [x, list] of Vs) for (const [lo, hi, ids] of merge(list, false, x)) keep(x, lo, x, hi, ids);
  wires = out;
  if (sel) { for (const id of [...sel.wires]) if (!wires.some(w => w.id === id)) sel.wires.delete(id); if (!selCount()) sel = null; }
}
function addWire(segs) {
  segs = segs.filter(s => s[0] !== s[2] || s[1] !== s[3]); if (!segs.length) return;
  snapshot();
  for (const s of segs) wires.push(Wr(...s));
  normalize(); sel = null; say(''); draw();
}
function hitWire(p) { return wires.find(w => p.x >= Math.min(w.x1, w.x2) - 10 && p.x <= Math.max(w.x1, w.x2) + 10 && p.y >= Math.min(w.y1, w.y2) - 10 && p.y <= Math.max(w.y1, w.y2) + 10); }
function hitPart(p) { return parts.find(q => Math.abs(p.x - q.x) < TERM(q) - 8 && Math.abs(p.y - q.y) < BODYH(q.t) / 2 + 6); }
