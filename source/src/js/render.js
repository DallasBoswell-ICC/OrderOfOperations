function draw() {
  const H = canvasH();
  applyCam();
  svg.innerHTML = '';
  el('defs', {}).innerHTML = DEFS;
  el('rect', { x: 0, y: 0, width: W, height: H, fill: '#404040' });   // the sheet the circuit is drawn on
  if (editing) el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#gridMajor)' });   // positioning grid while building
  const net = network(); if (editing) NET = net;
  // one dark channel under all the wiring, so wires that meet join into one seamless conduit; then vertical
  // cores, then horizontal ones (which hop over any vertical wire they cross without joining)
  // wires are trimmed at the edges of the sheet (their rounded ends would otherwise poke past the L1 and L2 bars)
  el('clipPath', { id: 'sheetClip' }, svg.querySelector('defs')).appendChild(Object.assign(document.createElementNS(NS, 'rect'), {})).setAttribute('width', W);
  svg.querySelector('#sheetClip rect').setAttribute('height', H);
  const clip = { 'clip-path': 'url(#sheetClip)' };
  const chan = el('g', clip), wlV = el('g', clip), backs = el('g', clip), wlH = el('g', clip), hits = el('g', {});
  const shape = (x1, y1, x2, y2) => y1 === y2 && x1 !== x2 ? hPath(Math.min(x1, x2), Math.max(x1, x2), y1, net.hops) : `M${x1} ${y1}L${x2} ${y2}`;
  const chanD = wires.map(w => shape(w.x1, w.y1, w.x2, w.y2)).join('');
  if (chanD) el('path', { d: chanD, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }, chan);
  for (const [x, y] of net.hops) el('path', { d: hPath(x - 10, x + 10, y, net.hops), stroke: '#262626', 'stroke-width': 18, fill: 'none' }, backs);
  const layer = (x1, x2) => x1 === x2 ? wlV : wlH;
  view.runs = []; view.shape = shape;
  if (editing) {
    for (const w of wires) {
      const isSel = selHasW(w.id);
      el('path', { d: shape(w.x1, w.y1, w.x2, w.y2), fill: 'none', stroke: isSel ? '#ffc000' : '#5e5e5e', 'stroke-width': isSel ? 6 : 4, 'stroke-linecap': 'round' }, layer(w.x1, w.x2));
      el('line', { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, stroke: 'transparent', 'stroke-width': 20 }, hits);
    }
  } else {
    // each wire is repainted as a few smooth runs, one per colour
    const byWire = new Map();
    for (const s of NET.subs) { if (!byWire.has(s.wire.id)) byWire.set(s.wire.id, []); byWire.get(s.wire.id).push(s); }
    for (const [, subs] of byWire) view.runs.push({ subs, n: view.runs.length, g: el('g', {}, layer(subs[0].x1, subs[0].x2)), last: '' });
  }
  // the L1 bar down the left edge and the L2 bar down the right: wires connect by running into them
  for (const [x, t] of [[0, 'L1'], [W - BAR, 'L2']]) {
    const g = el('g', { style: editing ? 'cursor:crosshair' : '' });
    el('rect', { x, y: 6, width: BAR, height: H - 12, rx: 3, fill: 'url(#gBar)', stroke: '#262626', 'stroke-width': 1.5 }, g);
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
  // a terminal screw wherever a wire meets a bar, and the bar's name next to it, as in the simulators
  const seen = new Set();
  for (const fd of net.feeds) {
    const k = fd.t + fd.y; if (seen.has(k)) continue; seen.add(k);
    const sx = fd.t === 'L1' ? BAR / 2 : W - BAR / 2;
    el('circle', { cx: sx, cy: fd.y, r: 5.5, fill: 'url(#gStud)', stroke: '#2a2a2a', 'stroke-width': 1 });
    el('path', { d: `M ${sx - 3} ${fd.y} L ${sx + 3} ${fd.y}`, stroke: '#3a3a3a', 'stroke-width': 1.4 });
    el('text', fd.t === 'L1' ? { x: BAR + 8, y: fd.y - 20, class: 'rail' } : { x: W - BAR - 8, y: fd.y + 36, class: 'rail', 'text-anchor': 'end' }).textContent = fd.t;
  }
  const issues = editing ? wiringIssues(net) : new Map();
  view.parts = new Map();
  for (const p of parts) {
    const g = el('g', { 'data-part': p.id, style: editing ? 'cursor:grab' : '' });
    const v = drawPart(p, g, p.x, p.y, chan);
    view.parts.set(p.id, v);
    if (editing) {
      for (const [tx, ty] of terms(p)) el('circle', { cx: tx, cy: ty, r: 6.5, fill: '#404040', stroke: '#c8c8c8', 'stroke-width': 1.6, style: 'cursor:crosshair' }, g);
      if (selHasP(p.id)) el('rect', { x: p.x - TERM(p) - 12, y: p.y - (p.t === 'coil' ? COIL : BOX) / 2 - 12, width: 2 * TERM(p) + 24, height: (p.t === 'coil' ? COIL : BOX) + 44, rx: 12, fill: 'rgba(255,192,0,.07)', stroke: '#ffc000', 'stroke-width': 2.2, 'stroke-dasharray': '7 5', 'pointer-events': 'none' }, g);
      if (issues.has(p.id)) {
        const t = el('text', { x: p.x, y: p.y - (p.t === 'coil' ? COIL : BOX) / 2 - 10, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#ff8a7a', 'pointer-events': 'none', stroke: '#404040', 'stroke-width': 4, 'paint-order': 'stroke' }, g);
        t.textContent = '⚠ ' + issues.get(p.id);
      }
    } else if (p.t === 'btn') bindButton(g, p);
  }
  if (editing) {
    const f = document.getElementById('fault');
    f.hidden = !issues.has('short');
    f.textContent = 'Warning: with every button passing current, L1 connects straight to L2 with no coil in between. That is a short circuit.';
  }
  view.overlay = el('g', { 'pointer-events': 'none' });
  if (preview) drawPreview();
  renderProps();
  if (fit()) { applyCam(); requestAnimationFrame(draw); }   // the panel changed size: draw again to fill it
  scheduleAutosave();
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
