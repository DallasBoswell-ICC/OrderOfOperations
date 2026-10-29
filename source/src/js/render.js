/* Drawing the panel. The circuit is drawn into the main view, and in split view a second time into the second pane
   (each drawing is painted as the current flows: see paint). In columns view (while running), the rungs are laid out
   in side-by-side columns, each with its own stretch of L1 and L2: still one drawing, with each group of rungs (a
   band) moved into its column, so nothing is drawn twice (see views.js). */
let VIEWS = [view], view2 = {};
function draw() {
  needPaint = true;
  LAYOUT = !editing && viewMode === 'columns' ? layoutColumns() : null;
  applyCam();
  view.tag = 'a'; renderInto(svg, view, LAYOUT);
  VIEWS = [view];
  if (!editing && viewMode === 'split') { view2.tag = 'b'; renderInto(svg2, view2, null); VIEWS.push(view2); applyCam2(); }
  else { svg2.innerHTML = ''; view2 = {}; }
  WORLD = view.world;
  renderProps();
  showOverview();
  if (fit()) { applyCam(); requestAnimationFrame(draw); }   // the panel changed size: draw again to fill it
  scheduleAutosave();
}
// draw the whole panel into target (an svg), keeping what paint needs in V (L: the columns layout, if any)
function renderInto(target, V, L) {
  const H = canvasH(), T = V.tag;
  target.innerHTML = ''; WORLD = null;
  el('defs', {}, target).innerHTML = DEFS;
  WORLD = V.world = el('g', { class: 'world' }, target);
  // the bands of rungs (one, the whole circuit, unless in columns): each its own group, moved into its column
  const bands = (L ? L.bands : [{ y0: 0, y1: H, dx: 0, dy: 0 }]).map((b, n) => ({ ...b, n, g: el('g', b.dx || b.dy ? { transform: `translate(${b.dx} ${b.dy})` } : {}) }));
  const B = V.B = y => bands.find(b => y < b.y1) || bands[bands.length - 1];
  for (const b of bands) {
    el('rect', { x: 0, y: b.y0, width: W, height: b.y1 - b.y0, fill: '#404040' }, b.g);   // the sheet the circuit is drawn on
    if (editing) el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#gridMajor)' }, b.g);   // positioning grid while building
  }
  const net = network(); if (editing) NET = net;
  // one dark channel under all the wiring, so wires that meet join into one seamless conduit; then vertical
  // cores, then horizontal ones (which hop over any vertical wire they cross without joining)
  // wires are trimmed at the edges of the sheet (their rounded ends would otherwise poke past the L1 and L2 bars)
  for (const b of bands) {
    el('rect', { x: 0, y: b.y0, width: W, height: b.y1 - b.y0 }, el('clipPath', { id: `sheetClip${T}${b.n}` }, target.querySelector('defs')));
    const clip = { 'clip-path': `url(#sheetClip${T}${b.n})` };
    Object.assign(b, { chan: el('g', clip, b.g), wlV: el('g', clip, b.g), backs: el('g', clip, b.g), wlH: el('g', clip, b.g), hits: el('g', {}, b.g) });
  }
  const shape = (x1, y1, x2, y2) => y1 === y2 && x1 !== x2 ? hPath(Math.min(x1, x2), Math.max(x1, x2), y1, net.hops) : `M${x1} ${y1}L${x2} ${y2}`;
  const wy = w => (w.y1 + w.y2) / 2;   // (which band a wire is in: none crosses from one band to the next)
  for (const b of bands) {
    const chanD = wires.filter(w => B(wy(w)) === b).map(w => shape(w.x1, w.y1, w.x2, w.y2)).join('');
    if (chanD) el('path', { d: chanD, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, b.chan);
  }
  for (const [x, y] of net.hops) el('path', { d: hPath(x - 10, x + 10, y, net.hops), stroke: '#262626', 'stroke-width': 18, fill: 'none' }, B(y).backs);
  const layer = (x1, x2, y) => x1 === x2 ? B(y).wlV : B(y).wlH;
  V.runs = []; V.shape = shape;
  if (editing) {
    for (const w of wires) {
      const isSel = selHasW(w.id);
      el('path', { d: shape(w.x1, w.y1, w.x2, w.y2), fill: 'none', stroke: isSel ? '#ffc000' : '#5e5e5e', 'stroke-width': isSel ? 6 : 4, 'stroke-linecap': 'round' }, layer(w.x1, w.x2, wy(w)));
      el('line', { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, stroke: 'transparent', 'stroke-width': 20 }, B(wy(w)).hits);
    }
  } else {
    // each wire is repainted as a few smooth runs, one per colour
    const byWire = new Map();
    for (const s of NET.subs) { if (!byWire.has(s.wire.id)) byWire.set(s.wire.id, []); byWire.get(s.wire.id).push(s); }
    for (const [, subs] of byWire) V.runs.push({ subs, n: V.runs.length, g: el('g', {}, layer(subs[0].x1, subs[0].x2, wy(subs[0].wire))), last: '' });
  }
  // the L1 bar down the left edge and the L2 bar down the right: wires connect by running into them
  for (const bd of bands) for (const [x, t] of barsOn() ? [[0, 'L1'], [W - BAR, 'L2']] : []) {
    const g = el('g', { style: editing ? 'cursor:crosshair' : '' }, bd.g), top = bd.y0 + 6, bot = bd.y1 - 6;
    el('rect', { x, y: top, width: BAR, height: bot - top, rx: 3, fill: 'url(#gBar)', stroke: '#262626', 'stroke-width': 1.5 }, g);
    el('text', { x: x + BAR / 2, y: bot - 9, 'text-anchor': 'middle', class: 'railtag' }, g).textContent = t;   // (its name, once, stamped at its foot)
    el('title', {}, g).textContent = editing ? `${t}: drag from here to draw a wire, or end a wire here` : t;
    if (editing) {
      // a handle at the top of each bar: drag it sideways to make the circuit longer or shorter
      const hx = x + BAR / 2, h = el('g', { class: 'barhandle', 'data-bar': t, style: 'cursor:ew-resize' });
      el('rect', { x: hx - 13, y: BAR_HANDLE_Y, width: 26, height: BAR_HANDLE_H, rx: 6, fill: '#e2cc85', stroke: '#262626', 'stroke-width': 1.5 }, h);
      for (const dx of [-4, 0, 4]) el('line', { x1: hx + dx, y1: BAR_HANDLE_Y + 12, x2: hx + dx, y2: BAR_HANDLE_Y + BAR_HANDLE_H - 12, stroke: '#5a4c22', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, h);
      for (const s of [-1, 1]) el('path', { d: `M ${hx + s * 17} ${BAR_HANDLE_Y + BAR_HANDLE_H / 2 - 5} l ${s * 6} 5 l ${-s * 6} 5`, fill: 'none', stroke: '#e2cc85', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, h);
      el('title', {}, h).textContent = `Drag to move the ${t} bar and make the circuit longer or shorter. Double-click to let it fit the screen again.`;
    }
  }
  // a square screw terminal wherever a wire meets a bar, and the bar's name next to it. The screw has a combination
  // head: a slot right across it for a flat screwdriver, and a cross for a Phillips
  for (const bd of bands) bd.top = el('g', {}, bd.g);
  const terminal = (x, y) => screw(x, y, el('g', {}, B(y).top));
  // a terminal screw wherever a wire meets a bar, and the bar's name next to it, as in the simulators
  const seen = new Set();
  for (const fd of net.feeds) {
    if (!fd.bar) continue;   // (a supply box's connection points are drawn with it)
    const k = fd.t + fd.y; if (seen.has(k)) continue; seen.add(k);
    const sx = fd.t === 'L1' ? BAR / 2 : W - BAR / 2;
    terminal(sx, fd.y);
    // (selected: outlined, kept inside the panel's edge)
    if (editing && selHasT(fd.t === 'L1' ? 0 : W, fd.y)) el('rect', { x: fd.t === 'L1' ? 1.5 : W - BAR - 18.5, y: fd.y - 19, width: BAR + 17, height: 38, rx: 7, fill: 'rgba(255,192,0,.16)', stroke: '#ffc000', 'stroke-width': 2.2, 'stroke-dasharray': '7 5', 'pointer-events': 'none' }, B(fd.y).top);
  }
  const issues = editing ? wiringIssues(net) : new Map();
  for (const bd of bands) { bd.links = el('g', {}, bd.g); bd.parts = el('g', {}, bd.g); }
  selLinks(B);
  V.parts = new Map();
  for (const p of parts) {
    const g = el('g', { 'data-part': p.id, style: editing ? 'cursor:grab' : '' }, B(p.y).parts);
    const v = drawPart(p, g, p.x, p.y, B(p.y).chan);
    V.parts.set(p.id, v);
    if (editing) {
      for (const [tx, ty] of terms(p)) el('circle', { cx: tx, cy: ty, r: 6.5, fill: '#404040', stroke: '#c8c8c8', 'stroke-width': 1.6, style: 'cursor:crosshair' }, g);
      // the other drawings of a selected button (the same button): a fainter outline, so they show as one
      if (!selHasP(p.id) && isOp(p) && sel && sel.parts.size === 1 && parts.some(q => q !== p && q.t === p.t && q.L === p.L && selHasP(q.id)))
        el('rect', { x: p.x - TERM(p) - 12, y: p.y - BODYH(p.t) / 2 - 32, width: 2 * TERM(p) + 24, height: BODYH(p.t) + 44, rx: 12, fill: 'none', stroke: '#ffc000', 'stroke-opacity': .5, 'stroke-width': 1.6, 'stroke-dasharray': '3 5', 'pointer-events': 'none' }, g);
      if (selHasP(p.id)) el('rect', { x: p.x - TERM(p) - 12, y: p.y - BODYH(p.t) / 2 - 32, width: 2 * TERM(p) + 24, height: BODYH(p.t) + 44, rx: 12, fill: 'rgba(255,192,0,.07)', stroke: '#ffc000', 'stroke-width': 2.2, 'stroke-dasharray': '7 5', 'pointer-events': 'none' }, g);
      if (issues.has(p.id)) {
        const t = el('text', { x: p.x, y: p.y - capTop(p) - 17, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#ff8a7a', 'pointer-events': 'none', stroke: '#404040', 'stroke-width': 4, 'paint-order': 'stroke' }, g);
        t.textContent = '⚠ ' + issues.get(p.id);
      }
    } else if (p.t === 'btn') bindButton(g, p);
    else if (p.t === 'sel') bindSelector(g, p);
  }
  if (SHOW.rungs) drawRefs(V, B, net);
  if (editing && V === view) {
    const f = document.getElementById('fault');
    f.hidden = !issues.has('short');
    f.textContent = 'Warning: with every button passing current, L1 connects straight to L2 with no coil in between. That is a short circuit.';
  }
  if (V === view) { V.overlay = el('g', { 'pointer-events': 'none' }); if (preview) drawPreview(); }
}
function drawPreview() {
  view.overlay.innerHTML = '';
  // a green ring wherever the wire end or part end being moved will connect
  for (const [x, y] of (preview && preview.hits) || []) {
    el('circle', { cx: x, cy: y, r: 15, fill: 'rgba(70,230,130,.18)', stroke: '#46e682', 'stroke-width': 3, class: 'hit' }, view.overlay);
    el('circle', { cx: x, cy: y, r: 4, fill: '#46e682' }, view.overlay);
  }
  if (preview.bar !== undefined) el('rect', { x: preview.bar, y: 6, width: BAR, height: canvasH() - 12, rx: 3, fill: 'rgba(226,204,133,.35)', stroke: '#e2cc85', 'stroke-width': 2, 'stroke-dasharray': '8 6' }, view.overlay);
  if (preview.wire) for (const [x1, y1, x2, y2] of preview.wire) el('line', { x1, y1, x2, y2, stroke: '#ffc000', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-dasharray': '8 6' }, view.overlay);
  if (preview.part) {
    const { p, x, y, bad } = preview.part;
    drawPart(p, el('g', { opacity: bad ? .35 : .75 }, view.overlay), x, y);
    if (preview.splice) el('rect', { x: x - TERM(p) - 6, y: y - 16, width: 2 * TERM(p) + 12, height: 32, rx: 8, fill: 'none', stroke: '#ffc000', 'stroke-width': 2.4, 'stroke-dasharray': '6 5' }, view.overlay);
  }
}

/* The drawings of one pushbutton or selector switch are its contact blocks, all on the one operator: a dashed line in
   its colour joins each to the next one down (as the dashed linkage on a print), under the parts and over the wires.
   It runs from the bottom of one to the top of the next (above its name, on the main one), with a step across
   halfway when they are not in line, or round underneath when they are side by side.
   In Build mode a line can be dragged out of the way of names and wires: across moves its upright run sideways,
   up or down moves where it crosses over (kept on the lower drawing as p.lk = [dx, dy], from where it would be).
   A double-click puts it back. */
function selLinks(B) {
  const by = {};
  for (const p of parts) if (isOp(p)) (by[p.t + p.L] = by[p.t + p.L] || []).push(p);
  for (const k in by) {
    const ds = by[k].sort((a, b) => a.y - b.y || a.x - b.x); if (ds.length < 2) continue;
    const m0 = ds[0].t === 'sel' ? mainSel(ds[0].L) : mainBtn(ds[0].L), bot = p => p.y + BODYH(p.t) / 2 + (p.nc ? 7 : 4), top = p => p === m0 ? p.y - capTop(p) - 16 : p.y - BODYH(p.t) / 2 - (p.nc ? 7 : 4);
    for (let i = 1; i < ds.length; i++) {
      const a = ds[i - 1], b = ds[i], y0 = bot(a), y1 = top(b), [dx, dy] = b.lk || [0, 0];
      let d;
      if (y1 - y0 >= 16) {
        const c = Math.max(y0 + 6, Math.min(y1 - 6, Math.round((y0 + y1) / 2) + dy)), X = Math.max(BAR + 10, Math.min(W - BAR - 10, a.x + dx));
        d = X === a.x ? (a.x === b.x ? `M${a.x} ${y0}V${y1}` : `M${a.x} ${y0}V${c}H${b.x}V${y1}`) : `M${a.x} ${y0}V${y0 + 8}H${X}V${c}H${b.x}V${y1}`;
      } else { const lo = Math.max(y0 + 8, Math.max(bot(a), bot(b)) + 16 + dy); d = `M${a.x} ${y0}V${lo}H${b.x}V${bot(b)}`; }
      if (B(a.y) !== B(b.y)) continue;   // (in columns, two drawings in different columns are not joined)
      const g = B(a.y).links;
      el('path', { d, fill: 'none', stroke: a.color, 'stroke-width': 2.2, 'stroke-dasharray': '7 5', 'stroke-linejoin': 'round', opacity: .85, 'pointer-events': 'none' }, g);
      if (editing) {
        const h = el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14, 'stroke-linejoin': 'round', class: 'link-hit' }, g);
        el('title', {}, h).textContent = 'Drag to move this dashed line out of the way (double-click to put it back)';
        h.addEventListener('pointerdown', e => dragLink(e, b));
        h.addEventListener('dblclick', e => { e.stopPropagation(); if (!b.lk) return; snapshot(); delete b.lk; draw(); });
      }
    }
  }
}
// dragging a dashed link line (see selLinks)
function dragLink(e, b) {
  if (e.button !== 0) return;
  e.stopPropagation(); e.preventDefault();
  const ae = document.activeElement; if (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) ae.blur();
  const s = pt(e), [ox, oy] = b.lk || [0, 0]; let moved = false;
  document.body.classList.add('dragging');
  const mv = ev => {
    const q = pt(ev), nx = Math.round((ox + q.x - s.x) / 10) * 10, ny = Math.round((oy + q.y - s.y) / 10) * 10, [cx, cy] = b.lk || [0, 0];
    if (nx === cx && ny === cy) return;
    if (!moved) { snapshot(); moved = true; }
    if (nx || ny) b.lk = [nx, ny]; else delete b.lk;
    draw();
  };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
