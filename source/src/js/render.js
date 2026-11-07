/* Drawing the panel. The circuit is drawn into the main view, and in split view a second time into the second pane
   (each drawing is painted as the current flows: see paint). In columns view (while running), the rungs are laid out
   in side-by-side columns, each with its own stretch of L1 and L2: still one drawing, with each group of rungs (a
   band) moved into its column, so nothing is drawn twice (see views.js). */
let VIEWS = [view], view2 = {};
function draw() {
  needPaint = true;
  if (!barsOn()) { const n = fitWidth(); if (n > W) W = n; }   // (with supply boxes, the sheet grows to take in whatever's been added past its edge)
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
  V.drawn = [L ? W : workW(), H];   // (how much of the sheet was drawn: see applyCam)
  target.innerHTML = ''; WORLD = null;
  el('defs', {}, target).innerHTML = DEFS;
  WORLD = V.world = el('g', { class: 'world' }, target);
  // the bands of rungs (one, the whole circuit, unless in columns): each its own group, moved into its column
  const bands = (L ? L.bands : [{ y0: 0, y1: H, dx: 0, dy: 0 }]).map((b, n) => ({ ...b, n, g: el('g', b.dx || b.dy ? { transform: `translate(${b.dx} ${b.dy})` } : {}) }));
  const B = V.B = y => bands.find(b => y < b.y1) || bands[bands.length - 1];
  for (const b of bands) {
    el('rect', { x: -SHEET_M, y: b.y0, width: (L ? W : workW()) + 2 * SHEET_M, height: b.y1 - b.y0, fill: '#404040' }, b.g);   // the sheet the circuit is drawn on (and its margins)
    if (editing) el('rect', { x: -SHEET_M, y: 0, width: workW() + 2 * SHEET_M, height: H, fill: 'url(#gridMajor)' }, b.g);   // positioning grid while building
  }
  const net = network(); if (editing) NET = net;
  // one dark channel under all the wiring, so wires that meet join into one seamless conduit; then vertical
  // cores, then horizontal ones (which hop over any vertical wire they cross without joining)
  // wires are trimmed at the edges of the sheet (their rounded ends would otherwise poke past the L1 and L2 bars)
  for (const b of bands) {
    el('rect', { x: 0, y: b.y0, width: L ? W : workW(), height: b.y1 - b.y0 }, el('clipPath', { id: `sheetClip${T}${b.n}` }, target.querySelector('defs')));
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
  for (const bd of bands) { bd.pics = el('g', {}, bd.g); bd.links = el('g', {}, bd.g); bd.parts = el('g', {}, bd.g); bd.ends = el('g', {}, bd.g); }
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
        el('rect', { ...selRect(p), rx: 12, fill: 'none', stroke: '#ffc000', 'stroke-opacity': .5, 'stroke-width': 1.6, 'stroke-dasharray': '3 5', 'pointer-events': 'none' }, g);
      if (selHasP(p.id)) el('rect', { ...selRect(p), rx: 12, fill: 'rgba(255,192,0,.07)', stroke: '#ffc000', 'stroke-width': 2.2, 'stroke-dasharray': '7 5', 'pointer-events': 'none' }, g);
      // a continuation on its own selected: a rotate handle at the corner of the selection, to turn it either way
      if (turns(p) && selHasP(p.id) && sel.parts.size === 1 && V === view) { const r = selRect(p); rotHandle(p, r.x + r.width + 6, r.y - 6, B(p.y).ends); }
      if (issues.has(p.id)) {
        const m = issues.get(p.id), note = typeof m === 'object';   // (a note, in gold: a load in series; a warning, in red)
        const t = el('text', { x: p.x, y: p.y - capTop(p) - 17, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': note ? 600 : 700, fill: note ? '#e2cc85' : '#ff8a7a', 'pointer-events': 'none', stroke: '#404040', 'stroke-width': 4, 'paint-order': 'stroke' }, g);
        t.textContent = note ? m.note : '⚠ ' + m;
      }
    } else if (p.t === 'btn' || isLim(p)) bindButton(g, p);
    else if ((isPwr3(p) && p.t !== 'mst') || p.t === 'olc' || p.t === 'fu1') bindPower(g, p);
    else if (p.t === 'sel') bindSelector(g, p);
  }
  drawPics(V, B);
  if (SHOW.rungs) drawRefs(V, B, net);
  fitCaps(V);
  if (editing && V === view) {
    const f = document.getElementById('fault');
    f.hidden = !issues.has('short') && !issues.has('phshort');
    f.textContent = issues.has('short') ? 'Warning: with every button passing current, L1 connects straight to L2 with no coil in between. That is a short circuit.'
      : `Warning: ${issues.get('phshort')} (with every switch but the starters closed). That is a short circuit.`;
  }
  if (V === view) { V.overlay = el('g', { 'pointer-events': 'none' }); if (preview) drawPreview(); }
}
/* captions kept apart: where two parts sit close together on a row, their names shrink to fit the room between them
   (down to 8 px), and a name that still will not fit is cut short with "…" (the whole name shows on hover). The width
   of a name is reckoned from its letters rather than measured, so a redraw stays quick on a slower computer. */
const CAP_PX = 12.5, CAP_MIN = 8;
const capWidth = (s, px) => { let w = 0; for (const c of s) w += c === ' ' ? .28 : /[A-Z]/.test(c) ? .66 : /[0-9]/.test(c) ? .56 : /[,.()·]/.test(c) ? .3 : .5; return w * px; };
function fitCaps(V) {
  const caps = [];
  for (const v of V.parts.values()) { const t = v.cap; if (!t || !t.isConnected) continue;
    const s = t.textContent, x = +t.getAttribute('x'), y = +t.getAttribute('y'), a = t.getAttribute('text-anchor') || 'start', w = capWidth(s, CAP_PX);
    caps.push({ t, s, x, y, w, c: a === 'middle' ? x : a === 'end' ? x - w / 2 : x + w / 2 }); }
  for (const q of caps) {
    let room = Infinity;
    // (two names side by side are clear when their half-widths add up to no more than the distance between them: each
    // gets half that room, or more where its neighbour is shorter)
    for (const o of caps) if (o !== q && Math.abs(o.y - q.y) < 13) { const d = Math.abs(o.c - q.c); room = Math.min(room, Math.max(d - 6, 2 * (d - o.w / 2) - 10)); }
    if (!(q.w > room)) continue;
    const px = Math.max(CAP_MIN, CAP_PX * room / q.w), halo = q.t.previousSibling && q.t.previousSibling.classList && q.t.previousSibling.classList.contains('caphalo') ? q.t.previousSibling : null;
    for (const e of [q.t, halo]) if (e) e.style.fontSize = px.toFixed(1) + 'px';
    if (capWidth(q.s, px) > room && !q.t.querySelector('tspan')) {
      // (still too long at the smallest: cut short, the whole name on hover)
      let s = q.s; while (s.length > 2 && capWidth(s + '…', px) > room) s = s.slice(0, -1);
      q.t.textContent = s.trimEnd() + '…'; q.t.dataset.tip = q.s; q.t.style.pointerEvents = 'auto';
    } else if (q.t.querySelector('tspan[data-nc]')) {
      // (a coil's normally closed contacts' rungs, underlined: the lines put back under the smaller numbers)
      const par = q.t.parentNode; par.querySelectorAll('.xline').forEach(l => l.remove());
      for (const n of q.t.querySelectorAll('tspan[data-nc]')) { let x1, x2; try { const k = n.getNumberOfChars(); x1 = n.getStartPositionOfChar(0).x; x2 = n.getEndPositionOfChar(k - 1).x; } catch (_) { continue; }
        if (x2 > x1) el('line', { x1, y1: q.y + 2.6, x2, y2: q.y + 2.6, class: 'xline', 'stroke-width': 1.4 }, par); }
    }
  }
}
// the dashed outline round a selected part (a single fuse standing upright: its outline stands upright too, its name beside it)
function selRect(p) { return vert(p) ? { x: p.x - BOX / 2 - 12, y: p.y - TERM(p) - 12, width: BOX + 120, height: 2 * TERM(p) + 24 } : { x: p.x - TERM(p) - 12, y: p.y - BODYH(p.t) / 2 - 32, width: 2 * TERM(p) + 24, height: BODYH(p.t) + 44 }; }
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
/* The dashed lines joining the drawings of one pushbutton or selector switch (and a pushbutton to the pilot lights
   built into it). Each line runs from the drawing above to the one below: by default out of the bottom of the upper
   one and into the top of the lower one (over its caption, if it has one). Either end can be moved to another side of
   its part (top, bottom, left or right: p.ls, the sides of the line ending at p, [upper end, lower end]) by dragging
   the small handle at that end; and the line itself dragged sideways or up and down out of the way (p.lk). */
const LINK_STUB = 12;
// where a link line leaves or meets part p on side s, and which way it heads off from there
function linkEnd(p, s, m0) {
  const h = BODYH(p.t) / 2, w = (isSolT(p.t) ? SOL_S : WIDE(p.t) ? BODYH(p.t) : p.t === 'sel' ? SEL_BOX : BOX) / 2, edge = p.nc ? 7 : 4;
  if (s === 't') return [[p.x, p === m0 || p.t === 'lamp' ? p.y - capTop(p) - 16 : p.y - h - edge], [0, -1]];   // (over the caption, on the drawings that have one)
  if (s === 'b') return [[p.x, p.y + h + edge], [0, 1]];
  // the sides: high enough to clear the rung's wire (on a round part, on its edge there)
  const k = s === 'l' ? -1 : 1, up = Math.round(Math.max(17, h * .45)), round = p.t === 'coil' || p.t === 'lamp';
  return [[p.x + k * ((round ? Math.sqrt(h * h - up * up) : w) + edge), p.y - up], [k, 0]];
}
// an orthogonal route from P0 (heading d0) to P1 (arriving from d1), its middle moved by dx, dy
function linkRoute([P0, d0], [P1, d1], dx, dy) {
  const S = [P0[0] + d0[0] * LINK_STUB, P0[1] + d0[1] * LINK_STUB], E = [P1[0] + d1[0] * LINK_STUB, P1[1] + d1[1] * LINK_STUB];
  const v0 = !!d0[1], v1 = !!d1[1], pts = [P0, S];
  if (v0 && v1) {   // up or down from both: across in between (or beyond both, if both head the same way)
    const c = (d0[1] === d1[1] ? (d0[1] > 0 ? Math.max(S[1], E[1]) : Math.min(S[1], E[1])) : (S[1] + E[1]) / 2) + dy;
    pts.push([S[0], c], [E[0], c]);
  } else if (!v0 && !v1) {   // sideways from both: up or down in between (or beyond both)
    const c = (d0[0] === d1[0] ? (d0[0] > 0 ? Math.max(S[0], E[0]) : Math.min(S[0], E[0])) : (S[0] + E[0]) / 2) + dx;
    pts.push([c, S[1]], [c, E[1]]);
  } else if (v0) pts.push([S[0], E[1] + dy]), pts.push([E[0], E[1] + dy]);
  else pts.push([S[0] + dx, S[1]], [S[0] + dx, E[1]]);
  pts.push(E, P1);
  const q = pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  return 'M' + q.map(p => `${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}`).join('L');
}
function selLinks(B) {
  const by = {};
  for (const p of parts) if (p.t === 'btn' || p.t === 'sel') (by[p.t + p.L] = by[p.t + p.L] || []).push(p);
  // (a pilot light built into a pushbutton is joined to it the same way)
  for (const p of parts) if (p.t === 'lamp' && p.L && by['btn' + p.L]) by['btn' + p.L].push(p);
  for (const k in by) {
    const ds = by[k].sort((a, b) => a.y - b.y || a.x - b.x); if (ds.length < 2) continue;
    const m0 = ds[0].t === 'sel' ? mainSel(ds[0].L) : mainBtn(ds[0].L), bot = p => p.y + BODYH(p.t) / 2 + (p.nc ? 7 : 4), top = p => linkEnd(p, 't', m0)[0][1];
    for (let i = 1; i < ds.length; i++) {
      const a = ds[i - 1], b = ds[i], y0 = bot(a), y1 = top(b), [dx, dy] = b.lk || [0, 0];
      let d, ends;
      if (b.ls) { const e0 = linkEnd(a, b.ls[0], m0), e1 = linkEnd(b, b.ls[1], m0); d = linkRoute(e0, e1, dx, dy); ends = [e0[0], e1[0]]; }
      else if (y1 - y0 >= 16) {
        const c = Math.max(y0 + 6, Math.min(y1 - 6, Math.round((y0 + y1) / 2) + dy)), X = Math.max(BAR + 10, Math.min(W - BAR - 10, a.x + dx));
        d = X === a.x ? (a.x === b.x ? `M${a.x} ${y0}V${y1}` : `M${a.x} ${y0}V${c}H${b.x}V${y1}`) : `M${a.x} ${y0}V${y0 + 8}H${X}V${c}H${b.x}V${y1}`;
        ends = [[a.x, y0], [b.x, y1]];
      } else { const lo = Math.max(y0 + 8, Math.max(bot(a), bot(b)) + 16 + dy); d = `M${a.x} ${y0}V${lo}H${b.x}V${bot(b)}`; ends = [[a.x, y0], [b.x, bot(b)]]; }
      if (B(a.y) !== B(b.y)) continue;   // (in columns, two drawings in different columns are not joined)
      const g = B(a.y).links, col = m0 ? m0.color : a.color;
      el('path', { d, fill: 'none', stroke: col, 'stroke-width': 2.2, 'stroke-dasharray': '7 5', 'stroke-linejoin': 'round', opacity: .85, 'pointer-events': 'none' }, g);
      if (editing) {
        const h = el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14, 'stroke-linejoin': 'round', class: 'link-hit' }, g);
        el('title', {}, h).textContent = 'Drag to move this dashed line out of the way; drag the dot at either end to join it to another side of its part (double-click to put it all back)';
        h.addEventListener('pointerdown', e => dragLink(e, b));
        h.addEventListener('dblclick', e => { e.stopPropagation(); if (!b.lk && !b.ls) return; snapshot(); delete b.lk; delete b.ls; draw(); });
        // a handle at each end: drag it round its part to join the line to another side
        [a, b].forEach((q, j) => {
          const [x, y] = ends[j], hd = el('circle', { cx: x, cy: y, r: 4.5, fill: '#2b2b2b', stroke: col, 'stroke-width': 2, class: 'link-end' }, B(a.y).ends);
          el('title', {}, hd).textContent = 'Drag round the part to join the dashed line to its top, bottom or a side';
          hd.addEventListener('pointerdown', e => dragLinkEnd(e, b, q, j));
        });
      }
    }
  }
}
/* The rotate handle: drag it round the part to turn it, a quarter turn at a time, clockwise or anticlockwise (or
   click it for a quarter turn clockwise). */
function rotHandle(p, x, y, g) {
  const h = el('g', { class: 'rot-handle', transform: `translate(${x} ${y})` }, g);
  el('circle', { r: 12, fill: '#2b2b2b', stroke: '#ffc000', 'stroke-width': 2 }, h);
  el('path', { d: 'M5.5 0A5.5 5.5 0 1 1 3.9 -3.9', fill: 'none', stroke: '#ffc000', 'stroke-width': 2, 'stroke-linecap': 'round' }, h);
  el('path', { d: 'M4.6 -7.6V-3.2H0.2', fill: 'none', stroke: '#ffc000', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, h);
  el('title', {}, h).textContent = 'Drag round to turn it (or click for a quarter turn clockwise; R does the same)';
  h.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const ang = ev => { const q = pt(ev); return Math.atan2(q.y - p.y, q.x - p.x); }, a0 = ang(e), r0 = p.rot || 0;
    let moved = false, turned = false;
    document.body.classList.add('dragging');
    const mv = ev => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return;
      let d = ang(ev) - a0; d = Math.atan2(Math.sin(d), Math.cos(d)); moved = true;
      const r = ((r0 + Math.round(d / (Math.PI / 2))) % 4 + 4) % 4;
      if (r === (p.rot || 0)) return;
      if (!turned) { snapshot(); turned = true; }
      if (r) p.rot = r; else delete p.rot;
      normalize(); draw();
    };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); if (!turned && !moved) rotateJmp(p); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });
}
// dragging one end of a link line round its part q (j: 0 the upper end, 1 the lower): it moves to the side nearest the pointer
function dragLinkEnd(e, b, q, j) {
  if (e.button !== 0) return;
  e.stopPropagation(); e.preventDefault();
  let moved = false;
  document.body.classList.add('dragging');
  const mv = ev => {
    const r = pt(ev), w = (isSolT(q.t) ? SOL_S : BODYH(q.t)) / 2, rx = (r.x - q.x) / w, ry = (r.y - q.y) / (BODYH(q.t) / 2);
    const s = Math.abs(rx) > Math.abs(ry) ? (rx < 0 ? 'l' : 'r') : (ry < 0 ? 't' : 'b'), ls = b.ls ? [...b.ls] : ['b', 't'];
    if (ls[j] === s) return;
    if (!moved) { snapshot(); moved = true; }
    ls[j] = s; b.ls = ls; draw();
  };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.body.classList.remove('dragging'); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
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
