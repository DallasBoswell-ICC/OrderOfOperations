// the wire end under the pointer (if several wires end there, the newest one)
function hitEnd(p) {
  let best = null;
  for (const w of wires) for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) if (Math.hypot(p.x - x, p.y - y) < 11 && (!best || w.id > best.w.id)) best = { w, x, y };
  return best;
}
// a drag that redraws the circuit live: apply(r) changes things from the saved starting state; letting go keeps it
let dragNow = false;
const dragging = () => dragNow;
function liveDrag(e, apply, onClick) {
  e.preventDefault(); dragNow = true;
  const start = stateOf(), sx = pt(e).x, sy = pt(e).y; let moved = false;
  const mv = ev => { const r = pt(ev); if (!moved && Math.hypot(r.x - sx, r.y - sy) > 6) moved = true;
    if (!moved) return; restore(start); preview = { hits: apply(r) || [] }; draw(); };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
    preview = null; dragNow = false;
    if (!moved) { restore(start); onClick && onClick(); draw(); return; }
    if (stateOf() !== start) { history.push(start); if (history.length > 100) history.shift(); }
    for (const x of [...parts, ...wires]) nextId = Math.max(nextId, (x.id || 0) + 1);
    normalize(); say(''); draw(); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
/* dragging a bar's handle: a ghost bar shows where it will go, and the bar moves there when it is let go (L2's wires
   stretch or shrink to meet it; moving L1 shifts everything else over, as L1 is always at x = 0). Held past the edge of
   the panel, the bar keeps moving outward (faster the further past), and the view slides along to keep it in sight. */
function barDrag(e, which) {
  e.preventDefault(); dragNow = true;
  const start = stateOf(), x0 = pt(e).x, stage = document.getElementById('stage');
  let dx = 0, nw = W, moved = false, cx = e.clientX, last = performance.now(), live = true;
  const vb = (svg.getAttribute('viewBox') || `0 0 ${W} ${VIS_H1}`).split(/\s+/).map(Number);
  const show = () => { preview = { bar: which === 'L2' ? snap(nw) - BAR : snap(dx) }; drawPreview(); };
  const mv = ev => {
    cx = ev.clientX;
    const r = pt(ev); if (!moved && Math.abs(r.x - x0) < 4) return; moved = true;
    if (overshoot() > 0) return;   // past the edge: the bar keeps moving on its own (see tick)
    if (which === 'L2') nw = Math.min(20000, Math.max(contentRight(BAR_MIN), W + r.x - x0));
    else dx = Math.max(-20000, Math.min(leftRoom(), r.x - x0));
    show();
  };
  // how far past the panel's edge (on the bar's side) the pointer is, in screen pixels
  const overshoot = () => { const b = stage.getBoundingClientRect(); return which === 'L2' ? cx - b.right : b.left - cx; };
  const tick = now => {
    if (!live) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const over = overshoot();
    if (moved && over > 0) {
      const v = 250 + over * 12;   // panel units a second
      if (which === 'L2') nw = Math.min(20000, Math.max(nw, contentRight(BAR_MIN)) + v * dt); else dx = Math.max(-20000, dx - v * dt);
      // slide the view along so the bar stays in sight
      const edge = which === 'L2' ? snap(nw) : snap(dx);
      if (which === 'L2' && edge > vb[0] + vb[2] - 20) vb[0] = edge + 20 - vb[2];
      if (which === 'L1' && edge < vb[0] + 20) vb[0] = edge - 20;
      svg.setAttribute('viewBox', vb.join(' '));
      show();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const up = () => {
    document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
    live = false; dragNow = false; preview = null;
    dx = snap(dx); nw = snap(nw);
    // a double-click on the handle (two clicks without moving) lets the circuit fit the screen again
    if (!moved) { const now = performance.now(), dbl = lastBarClick.bar === which && now - lastBarClick.t < 450; lastBarClick = { bar: which, t: now };
      if (dbl && W_USER) { history.push(start); W_USER = null; fitView(); fit(true); draw(); }
      return; }
    if (which === 'L1' && dx) { shiftL1(dx); W_USER = W; }
    if (which === 'L2' && nw !== W) { setWidth(nw); W_USER = W; }
    if (stateOf() !== start) { history.push(start); if (history.length > 100) history.shift(); }
    fitView(); fit(true); draw();
  };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
let lastBarClick = { bar: null, t: 0 };
function groupDrag(e, p0) {
  const pIds = new Set(sel.parts), wIds = new Set(sel.wires);
  const P0 = parts.filter(q => pIds.has(q.id)).map(q => ({ id: q.id, x: q.x, y: q.y, t: q.t })), st0 = stateOf();
  liveDrag(e, r => {
    let dx = snap(r.x - p0.x), dy = snap(r.y - p0.y);
    // keep every part on the panel
    for (let pass = 0; pass < 2; pass++) for (const q of P0) { const [cx, cy] = clampPart(q.x + dx, q.y + dy, q.t); dx = cx - q.x; dy = cy - q.y; }
    const moving = parts.filter(q => pIds.has(q.id));
    if (P0.some(q => parts.some(o => !pIds.has(o.id) && Math.abs(o.x - (q.x + dx)) < (LOADT(q.t) ? 60 : 40) + TERM(o) && Math.abs(o.y - (q.y + dy)) < 80))) { say('There is already a part there.'); return []; }
    say('');
    const m = movedGroup(pIds, wIds, dx, dy); wires = m.wires;
    for (const q of moving) { const o = P0.find(z => z.id === q.id); q.x = o.x + dx; q.y = o.y + dy; }
    normalize();
    if (parts.some(q => pIds.has(q.id) && wireInTheWay(q))) { restore(st0); say('There is a wire in the way.'); return []; }
    sel = { parts: pIds, wires: new Set(wires.filter(w => wIds.has(w.id)).map(w => w.id)) }; return m.hits;
  });
}
svg.addEventListener('pointerdown', e => {
  if (e.button === 1) return panDrag(e);
  if (!editing || e.button !== 0) return;
  const p = pt(e);
  const startWire = a => {
    e.preventDefault(); let horiz = null;
    const mv = ev => { const q = pt(ev), b = [clampX(q.x), clampY(q.y)];
      if (horiz === null && (Math.abs(q.x - a[0]) > 8 || Math.abs(q.y - a[1]) > 8)) horiz = Math.abs(q.x - a[0]) >= Math.abs(q.y - a[1]);
      preview = { wire: routeWire(a, b, horiz !== false), hits: connects(pointInfo(b[0], b[1])) ? [b] : [] }; drawPreview(); };
    const up = ev => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      const q = pt(ev), b = [clampX(q.x), clampY(q.y)]; preview = null; view.overlay.innerHTML = '';
      if (b[0] !== a[0] || b[1] !== a[1]) addWire(routeWire(a, b, horiz !== false)); else draw(); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  };
  if (tool === 'wire') return startWire([clampX(p.x), clampY(p.y)]);
  if (tool !== 'select') { placePart(tool, p.x, p.y); setTool('select'); return; }
  const he = hitEnd(p), q = hitPart(p), w = hitWire(p);
  // shift-click adds a part or wire to the selection, or takes it out
  if (e.shiftKey && (q || w)) {
    if (!sel) sel = { parts: new Set(), wires: new Set() };
    if (q) sel.parts.has(q.id) ? sel.parts.delete(q.id) : sel.parts.add(q.id);
    else sel.wires.has(w.id) ? sel.wires.delete(w.id) : sel.wires.add(w.id);
    if (!selCount()) sel = null;
    return draw();
  }
  // several things selected and one of them grabbed: move them all together
  if (selCount() > 1 && ((q && selHasP(q.id)) || (!q && w && selHasW(w.id)))) return groupDrag(e, { x: p.x, y: p.y });
  // a wire end, even one fastened to a part or a bar: pull it off and put it somewhere else
  if (he) {
    const { w: ww, x, y } = he, ch = chainFrom([x, y], ww), id = ww.id;
    const last = ch.segs[ch.segs.length - 1], fOri = last.y1 === last.y2 ? 'h' : 'v', F = ch.far, ids = new Set(ch.segs.map(z => z.id));
    const v = [...ch.segs].reverse().find(z => z.x1 === z.x2);
    return liveDrag(e, r => {
      const M = [clampX(r.x), clampY(r.y)];
      const added = (F[0] === M[0] && F[1] === M[1]) ? [] : route(F, fOri, M, v ? v.x1 : null).map(z => Wr(...z));
      wires = wires.filter(z => !ids.has(z.id)).concat(added);
      return connects(pointInfo(M[0], M[1], new Set(added))) ? [M] : [];
    }, () => { sel = selOne('w', id); });
  }
  // a bar's handle: move the bar
  const onHandle = x => Math.abs(p.x - x) < 16 && p.y >= BAR_HANDLE_Y - 4 && p.y <= BAR_HANDLE_Y + BAR_HANDLE_H + 4;
  if (onHandle(BAR / 2)) return barDrag(e, 'L1');
  if (onHandle(W - BAR / 2)) return barDrag(e, 'L2');
  // the end of a part with nothing on it, or a bar: draw a new wire from it
  for (const qq of parts) for (const [x, y] of terms(qq)) if (Math.hypot(p.x - x, p.y - y) < 13) return startWire([x, y]);
  if (p.x < BAR + 6) return startWire([0, clampY(p.y)]);
  if (p.x > W - BAR - 6) return startWire([W, clampY(p.y)]);
  // a part: drag it, and its wires follow
  if (q) {
    sel = selOne('p', q.id); say(''); draw();
    const id = q.id, ox = q.x, oy = q.y, sx = p.x, sy = p.y, st0 = stateOf();
    return liveDrag(e, r => {
      const qq = parts.find(z => z.id === id);
      const [x, y] = clampPart(ox + r.x - sx, oy + r.y - sy, qq.t);
      if (overlaps(qq, x, y, qq.t)) { say('There is already a part there.'); return []; }
      say('');
      const m = movedWires(qq, x, y); wires = m.wires; qq.x = x; qq.y = y; normalize();
      if (wireInTheWay(qq)) { restore(st0); say('There is a wire in the way.'); return []; }
      return m.hits;
    });
  }
  // the middle of a wire: slide that straight run sideways; the runs either side stretch to stay connected
  if (w) {
    const id = w.id, horiz = w.y1 === w.y2, sx = p.x, sy = p.y;
    return liveDrag(e, r => {
      const ww = wires.find(z => z.id === id); if (!ww) return [];
      const d = horiz ? snap(r.y - sy) : snap(r.x - sx); if (!d) return [];
      const ends = [[ww.x1, ww.y1], [ww.x2, ww.y2]], add = [], drop = new Set([ww]);
      for (const [x, y] of ends) {
        const [nx, ny] = horiz ? [x, y + d] : [x + d, y];
        const others = wires.filter(z => z !== ww && isEnd(z, x, y)), inf = pointInfo(x, y, new Set([ww]));
        const nb = others.length === 1 && !inf.term && !inf.interior && !inf.bar ? others[0] : null;
        if (nb && (horiz ? nb.x1 === nb.x2 : nb.y1 === nb.y2)) {
          drop.add(nb);
          const far = nb.x1 === x && nb.y1 === y ? [nb.x2, nb.y2] : [nb.x1, nb.y1];
          add.push([far[0], far[1], nx, ny]);
        } else add.push([x, y, nx, ny]);
      }
      add.push([ends[0][0] + (horiz ? 0 : d), ends[0][1] + (horiz ? d : 0), ends[1][0] + (horiz ? 0 : d), ends[1][1] + (horiz ? d : 0)]);
      wires = wires.filter(z => !drop.has(z)).concat(add.filter(z => z[0] !== z[2] || z[1] !== z[3]).map(z => Wr(...z)));
      return [];
    }, () => { sel = selOne('w', id); });
  }
  // empty space: drag a box to select everything inside it
  boxSelect(e, p);
});
function boxSelect(e, p0) {
  e.preventDefault();
  const keep = e.shiftKey && sel ? { parts: new Set(sel.parts), wires: new Set(sel.wires) } : null;
  let moved = false;
  const mv = ev => {
    const r = pt(ev); if (!moved && Math.hypot(r.x - p0.x, r.y - p0.y) > 4) moved = true; if (!moved) return;
    view.overlay.innerHTML = '';
    el('rect', { x: Math.min(p0.x, r.x), y: Math.min(p0.y, r.y), width: Math.abs(r.x - p0.x), height: Math.abs(r.y - p0.y), fill: 'rgba(255,192,0,.08)', stroke: '#ffc000', 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }, view.overlay);
  };
  const up = ev => {
    document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
    view.overlay.innerHTML = '';
    if (!moved) { sel = keep; say(''); return draw(); }
    const r = pt(ev), x1 = Math.min(p0.x, r.x), x2 = Math.max(p0.x, r.x), y1 = Math.min(p0.y, r.y), y2 = Math.max(p0.y, r.y);
    const inside = (x, y) => x >= x1 && x <= x2 && y >= y1 && y <= y2;
    const s2 = keep || { parts: new Set(), wires: new Set() };
    for (const q of parts) if (inside(q.x, q.y)) s2.parts.add(q.id);
    for (const w of wires) if (inside(w.x1, w.y1) && inside(w.x2, w.y2)) s2.wires.add(w.id);
    sel = s2.parts.size + s2.wires.size ? s2 : null; say(''); draw();
  };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
