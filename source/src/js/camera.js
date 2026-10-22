/* ---------------- looking around: zoom and pan ----------------
   Ctrl + scroll wheel zooms in and out where the pointer is; the scroll wheel moves up and down; Shift + scroll wheel
   moves left and right; dragging with the middle mouse button (the wheel) also moves the view. Works while building
   and while running. */
/* The panel fills the width of the page, like a diagram viewer, and the circuit sits on it like a sheet. A circuit
   opens fitted: the whole sheet in view, as large as the panel allows (at 100% the sheet's width, L1 bar to L2 bar,
   fills the panel). It stays fitted as the window changes size until you zoom or move the view yourself. */
let cam = { x: 0, y: 0, z: 1, fit: true };
const fitView = () => { cam = { x: 0, y: 0, z: 1, fit: true }; };
const ZMAX = 4;
const viewW = () => W / cam.z, viewH = () => VIS_H1 / cam.z;
const zMin = () => Math.max(0.25, Math.min(1, VIS_H1 / canvasH()));
function applyCam() {
  if (typeof dragging === 'function' && dragging()) return;   // the view holds still under a drag in progress
  if (cam.fit) cam.z = zMin();
  const H = canvasH(), vw = viewW(), vh = viewH();
  cam.x = vw >= W ? (W - vw) / 2 : Math.min(Math.max(0, cam.x), W - vw);
  cam.y = vh >= H ? (H - vh) / 2 : Math.min(Math.max(0, cam.y), H - vh);
  svg.setAttribute('viewBox', `${cam.x} ${cam.y} ${vw} ${vh}`);
  const lab = document.getElementById('zoom-pct'); if (lab) lab.textContent = Math.round(cam.z * 100) + '%';
}
function zoomAt(f, px, py) {
  const z = Math.min(ZMAX, Math.max(zMin(), cam.z * f)); if (Math.abs(z - cam.z) < 1e-6) return;
  cam.fit = false;
  const fx = (px - cam.x) / viewW(), fy = (py - cam.y) / viewH();
  cam.z = z; cam.x = px - fx * viewW(); cam.y = py - fy * viewH(); applyCam();
}
const zoomCentre = f => zoomAt(f, cam.x + viewW() / 2, cam.y + viewH() / 2);
svg.addEventListener('wheel', e => {
  const k = e.deltaMode === 1 ? 30 : e.deltaMode === 2 ? 300 : 1, dy = e.deltaY * k, dx = e.deltaX * k;
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); const p = pt(e); zoomAt(Math.exp(-dy * 0.0015), p.x, p.y); return; }
  if (viewW() >= W - 1e-6 && viewH() >= canvasH() - 1e-6) return;   // everything is in view: let the page scroll as normal
  e.preventDefault(); cam.fit = false;
  const s = viewW() / svg.getBoundingClientRect().width;
  if (e.shiftKey) cam.x += (dy || dx) * s; else { cam.y += dy * s; cam.x += dx * s; }
  applyCam();
}, { passive: false });
function panDrag(e) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY, c0 = { ...cam }, s = viewW() / svg.getBoundingClientRect().width;
  svg.style.cursor = 'grabbing';
  const mv = ev => { cam.fit = false; cam.x = c0.x - (ev.clientX - sx) * s; cam.y = c0.y - (ev.clientY - sy) * s; applyCam(); };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); svg.style.cursor = tool === 'select' ? '' : 'crosshair'; };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
document.getElementById('zoom-in').addEventListener('click', () => zoomCentre(1.25));
document.getElementById('zoom-out').addEventListener('click', () => zoomCentre(0.8));
// Fit: the whole circuit, as large as the panel allows (full width, or smaller if the circuit is taller than the window)
document.getElementById('zoom-fit').addEventListener('click', () => { fitView(); if (editing) fit(true); draw(); });
