/* =====================================================================
   ways to see more of a long circuit while running (the View group on the Simulation tab), and full screen
   - Normal: the circuit as built, zoomed and scrolled as you like.
   - Columns: the rungs laid out in side-by-side columns, each with its own stretch of L1 and L2, like the pages of a
     print side by side, as many as make the whole circuit as large as it can be. The columns break only between
     rungs (where no wire, part or name crosses), and the drawing is still one drawing, each group of rungs moved
     into its column (draw: LAYOUT), so it costs nothing to run.
   - Split: two panes side by side (or one above the other on a tall screen), each its own view of the circuit, zoomed
     and scrolled on its own: one on the top rungs, one on the bottom ones. The circuit is drawn into both, and both
     are painted as the current flows.
   Full screen: the circuit fills the screen, the title bar goes and the ribbon folds to its tabs (Esc to leave).
   ===================================================================== */
const VIEW_KEY = 'oo-circuit-builder:view';
let viewMode = 'normal', LAYOUT = null;
try { const m = localStorage.getItem(VIEW_KEY); if (m === 'columns' || m === 'split') viewMode = m; } catch (_) {}
const svg2 = document.getElementById('svg2'), pane2 = document.getElementById('pane2');
// the sheet the main view looks at: the circuit, or in columns the columns side by side
const sheetW = () => LAYOUT ? LAYOUT.w : W, sheetH = () => LAYOUT ? LAYOUT.h : canvasH();
const COL_GAP = 60;
function layoutColumns() {
  const H = canvasH(), pw = svg.clientWidth || 1, ph = svg.clientHeight || 1;
  // where something is: wires (and the names of the bars beside their ends), parts and their names
  const busy = [];
  for (const w of wires) {
    if (w.x1 === w.x2) busy.push([Math.min(w.y1, w.y2) - 14, Math.max(w.y1, w.y2) + 14]);
    else { const bar1 = Math.min(w.x1, w.x2) === 0, bar2 = Math.max(w.x1, w.x2) === W; busy.push([w.y1 - (bar1 ? 46 : 16), w.y1 + (bar2 ? 46 : 16)]); }
  }
  for (const p of parts) busy.push([p.y - capTop(p) - 18, p.y + BODYH(p.t) / 2 + (p.t === 'lamp' ? 18 : 12)]);
  busy.sort((a, b) => a[0] - b[0]);
  // the gaps between them: where a column can break
  const cuts = []; let reach = 0;
  for (const [a, b] of busy) { if (a > reach + 4) cuts.push((reach + a) / 2); reach = Math.max(reach, b); }
  let best = { k: 1, s: Math.min(pw / W, ph / H), bands: [{ y0: 0, y1: H, dx: 0, dy: 0 }] };
  for (let k = 2; k <= 6; k++) {
    const ys = [0]; let ok = true;
    for (let i = 1; i < k; i++) {
      const want = H * i / k, c = cuts.filter(y => y > ys[ys.length - 1] + 40).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
      if (c === undefined) { ok = false; break; } ys.push(c);
    }
    if (!ok) break;
    ys.push(H);
    const tall = Math.max(...ys.slice(1).map((y, i) => y - ys[i])), w = k * W + (k - 1) * COL_GAP, s = Math.min(pw / w, ph / tall);
    if (s > best.s * 1.04) best = { k, s, bands: ys.slice(1).map((y1, i) => ({ y0: ys[i], y1, dx: i * (W + COL_GAP), dy: -ys[i] })) };
  }
  const h = Math.max(...best.bands.map(b => b.y1 - b.y0));
  return { bands: best.bands, w: best.bands.length * W + (best.bands.length - 1) * COL_GAP, h };
}

// ---- the second pane (split view): its own camera, like the main one
let cam2 = { x: 0, y: 0, z: 1 };
const VIS2 = () => W * (svg2.clientHeight || 1) / (svg2.clientWidth || 1);
const viewW2 = () => W / cam2.z, viewH2 = () => VIS2() / cam2.z;
const zMin2 = () => Math.max(0.25, Math.min(1, VIS2() / canvasH()));
function applyCam2() {
  if (pane2.hidden) return;
  const H = canvasH(); cam2.z = Math.min(ZMAX, Math.max(zMin2(), cam2.z));
  const vw = viewW2(), vh = viewH2();
  cam2.x = vw >= W ? (W - vw) / 2 : Math.min(Math.max(0, cam2.x), W - vw);
  cam2.y = vh >= H ? (H - vh) / 2 : Math.min(Math.max(0, cam2.y), H - vh);
  svg2.setAttribute('viewBox', `${cam2.x} ${cam2.y} ${vw} ${vh}`);
  document.getElementById('zoom-pct2').textContent = Math.round(cam2.z * 100) + '%';
}
const pt2 = e => { const q = svg2.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; const m = svg2.getScreenCTM(); return m ? q.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
function zoom2(f, px, py) {
  const z = Math.min(ZMAX, Math.max(zMin2(), cam2.z * f)); if (Math.abs(z - cam2.z) < 1e-6) return;
  const fx = (px - cam2.x) / viewW2(), fy = (py - cam2.y) / viewH2();
  cam2.z = z; cam2.x = px - fx * viewW2(); cam2.y = py - fy * viewH2(); applyCam2();
}
svg2.addEventListener('wheel', e => {
  const k = e.deltaMode === 1 ? 30 : e.deltaMode === 2 ? 300 : 1, dy = e.deltaY * k, dx = e.deltaX * k;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) { const p = pt2(e); zoom2(Math.exp(-dy * 0.0015), p.x, p.y); return; }
  const s = viewW2() / svg2.getBoundingClientRect().width;
  if (e.shiftKey) cam2.x += (dy || dx) * s; else { cam2.y += dy * s; cam2.x += dx * s; }
  applyCam2();
}, { passive: false });
svg2.addEventListener('pointerdown', e => {
  if (e.button !== 1) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY, c0 = { ...cam2 }, s = viewW2() / svg2.getBoundingClientRect().width;
  const mv = ev => { cam2.x = c0.x - (ev.clientX - sx) * s; cam2.y = c0.y - (ev.clientY - sy) * s; applyCam2(); };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
});
document.getElementById('zoom-in2').addEventListener('click', () => zoom2(1.25, cam2.x + viewW2() / 2, cam2.y + viewH2() / 2));
document.getElementById('zoom-out2').addEventListener('click', () => zoom2(0.8, cam2.x + viewW2() / 2, cam2.y + viewH2() / 2));
document.getElementById('zoom-fit2').addEventListener('click', () => { cam2 = { x: 0, y: 0, z: 0 }; applyCam2(); });

// ---- choosing the view
function setViewMode(m) {
  const was = viewMode; viewMode = m;
  try { localStorage.setItem(VIEW_KEY, m); } catch (_) {}
  showViewMode(); showOverview();
  if (!editing && m === 'split' && was !== 'split') splitStart();
  else if (m !== was) fitView();
  fit(); draw(); if (!editing) paint();
}
// what the stage shows: one pane, or two (side by side on a wide panel, one above the other on a tall one)
function showViewMode() {
  const split = !editing && viewMode === 'split', st = document.getElementById('stage');
  pane2.hidden = !split; st.classList.toggle('split', split);
  st.classList.toggle('split-v', split && st.clientWidth < st.clientHeight * 1.1);
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === viewMode)));
}
// split view starts with both panes at full width: the first on the top of the circuit, the second on the bottom
function splitStart() {
  showViewMode(); fit();
  cam = { x: 0, y: 0, z: 1, fit: false };
  cam2 = { x: 0, y: 1e9, z: 1 };
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.view)));
window.addEventListener('resize', () => { if (!editing && viewMode !== 'normal') { showViewMode(); fit(); draw(); } });

// ---- full screen
function setFullScreen(on) {
  if (on === document.body.classList.contains('fs')) return;
  document.body.classList.toggle('fs', on);
  const b = document.getElementById('fs-toggle');
  b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
  b.dataset.tip = on ? 'Leave full screen (Esc)' : 'Full screen: the circuit fills the screen (Esc to leave)';
  try {
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch (_) {}
  closeMenus();
  requestAnimationFrame(() => { showViewMode(); if (fit(editing)) { if (editing) fitView(); } draw(); if (!editing) paint(); });
}
document.getElementById('fs-toggle').addEventListener('click', () => setFullScreen(!document.body.classList.contains('fs')));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('fs')) setFullScreen(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('fs')) setFullScreen(false); });
