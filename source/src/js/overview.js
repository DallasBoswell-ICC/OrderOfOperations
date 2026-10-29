/* =====================================================================
   the overview strip (Show: Overview)
   A thin miniature of the whole circuit down the right edge of the panel, live: the current flowing in its colours,
   coils that are in and lights that are lit. The box on it is what the panel is showing; press or drag on the strip
   to move the view there. It shows only when the circuit is too long to fit (and not in columns view, where all of
   it is in view anyway); the panel narrows to make room for it.
   ===================================================================== */
const ovEl = document.getElementById('overview'), ovCanvas = document.getElementById('ov-canvas'), ovBox = document.getElementById('ov-view');
const OV_W = 72;
let ovGeom = null, ovTimer = 0, ovLast = 0;
// does the strip belong on screen? (decided as if it were there, so showing it never makes it unneeded)
function overviewWanted() {
  if (!SHOW.overview || (!editing && viewMode === 'columns')) return false;
  // (a sheet that widens to fill the panel always fits it whole: no strip needed)
  if (!W_USER && (editing || viewMode === 'normal')) return false;
  const pane = document.getElementById('pane1'), w = Math.max(1, pane.clientWidth - OV_W), h = pane.clientHeight || 1;
  return canvasH() > W * h / w + 1;
}
function showOverview() {
  const want = overviewWanted();
  if (ovEl.hidden === !want) { if (want) drawOverview(); return; }
  ovEl.hidden = !want;
  document.getElementById('pane1').classList.toggle('with-ov', want);
  fit(editing || viewMode === 'normal'); draw();
}
function drawOverview() {
  if (ovEl.hidden) return;
  ovLast = performance.now();
  const r = ovEl.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
  if (ovCanvas.width !== cw || ovCanvas.height !== ch) { ovCanvas.width = cw; ovCanvas.height = ch; }
  const H = canvasH(), pad = 6 * dpr, s = Math.min((cw - 2 * pad) / W, (ch - 2 * pad) / H), ox = (cw - W * s) / 2, oy = pad;
  ovGeom = { s: s / dpr, ox: ox / dpr, oy: oy / dpr };
  const c = ovCanvas.getContext('2d');
  c.clearRect(0, 0, cw, ch);
  c.setTransform(s, 0, 0, s, ox, oy);
  c.fillStyle = '#404040'; c.fillRect(0, 0, W, H);
  c.lineCap = 'round';
  // the wiring: a dark channel, then the wire (in its colour where current is flowing)
  c.strokeStyle = '#262626'; c.lineWidth = Math.max(22, 2 / s * dpr);
  c.beginPath(); for (const w of wires) { c.moveTo(w.x1, w.y1); c.lineTo(w.x2, w.y2); } c.stroke();
  c.lineWidth = Math.max(9, 1.4 / s * dpr);
  if (!editing && NET && NET.subs && typeof tl !== 'undefined' && tl && tl.length >= NET.nodes.length) {   // (once the run has started)
    // (one stroke for each colour: cheap enough to keep up while running, even on a slow computer)
    const by = new Map();
    for (const sb of NET.subs) { const col = lit(sb.a, simT) && lit(sb.b, simT) ? colAt(sb.b, simT) : null; if (!col) continue; let q = by.get(col); if (!q) by.set(col, q = []); q.push(sb); }
    for (const [col, q] of by) { c.strokeStyle = col; c.beginPath(); for (const sb of q) { c.moveTo(sb.x1, sb.y1); c.lineTo(sb.x2, sb.y2); } c.stroke(); }
  } else { c.strokeStyle = '#5e5e5e'; c.beginPath(); for (const w of wires) { c.moveTo(w.x1, w.y1); c.lineTo(w.x2, w.y2); } c.stroke(); }
  // the parts: buttons and selectors in their colour, coils and lights lit when in
  for (const p of parts) {
    const h = BODYH(p.t), on = !editing && (p.t === 'coil' || p.t === 'lamp') && coilOn[p.id];
    c.fillStyle = p.t === 'con' ? (!editing && CON[p.id] && CON[p.id].shut ? coilColour(p.L) : '#2a2a2a') : p.t === 'lamp' ? (on ? lampColour(p) : '#2a2a2a') : p.t === 'coil' ? (on ? p.color : '#2a2a2a') : (!editing && p.t === 'btn' && down[p.L] ? GREY : p.color);
    c.strokeStyle = p.t === 'con' ? coilColour(p.L) : p.t === 'lamp' ? lampColour(p) : p.color; c.lineWidth = Math.max(3, 1 / s * dpr);
    if (LOADT(p.t)) { c.beginPath(); c.arc(p.x, p.y, h / 2, 0, 2 * Math.PI); c.fill(); c.stroke(); }
    else { c.fillRect(p.x - h / 2, p.y - h / 2, h, h); c.strokeRect(p.x - h / 2, p.y - h / 2, h, h); }
  }
  c.fillStyle = '#d9c27a'; c.fillRect(0, 0, BAR, H); c.fillRect(W - BAR, 0, BAR, H);
  c.setTransform(1, 0, 0, 1, 0, 0);
  ovView();
}
// the box showing what the panel is looking at
function ovView() {
  if (ovEl.hidden || !ovGeom) return;
  const { s, ox, oy } = ovGeom, vw = viewW(), vh = viewH();
  const x = ox + Math.max(0, cam.x) * s, y = oy + Math.max(0, cam.y) * s, w = Math.min(W, vw) * s, h = Math.min(canvasH(), vh) * s;
  Object.assign(ovBox.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
}
// while running, kept up with the current (a few times a second, not every frame)
function overviewTick() {
  if (ovEl.hidden) return;
  const due = 250 - (performance.now() - ovLast);
  if (due <= 0) drawOverview(); else if (!ovTimer) ovTimer = setTimeout(() => { ovTimer = 0; drawOverview(); }, due);
}
ovEl.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !ovGeom) return;
  e.preventDefault(); try { ovEl.setPointerCapture(e.pointerId); } catch (_) {}
  const go = ev => { const r = ovEl.getBoundingClientRect(), x = (ev.clientX - r.left - ovGeom.ox) / ovGeom.s, y = (ev.clientY - r.top - ovGeom.oy) / ovGeom.s;
    cam.fit = false; cam.x = x - viewW() / 2; cam.y = y - viewH() / 2; applyCam(); };
  go(e);
  const up = () => { ovEl.removeEventListener('pointermove', go); ovEl.removeEventListener('pointerup', up); };
  ovEl.addEventListener('pointermove', go); ovEl.addEventListener('pointerup', up);
});
window.addEventListener('resize', () => showOverview());
