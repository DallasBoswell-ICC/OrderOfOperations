/* ---------------- looking around: zoom and pan ----------------
   Ctrl + scroll wheel zooms in and out where the pointer is; the scroll wheel moves up and down; Shift + scroll wheel
   moves left and right; dragging with the middle mouse button (the wheel), or holding Space and dragging (as in Print
   Builder), also moves the view. Works while building and while running. */
/* The panel fills the width of the page, like a diagram viewer, and the circuit sits on it like a sheet. A circuit
   opens fitted: the whole sheet in view, as large as the panel allows (at 100% the sheet's width, L1 bar to L2 bar,
   fills the panel). It stays fitted as the window changes size until you zoom or move the view yourself. */
let cam = { x: 0, y: 0, z: 1, fit: true }, needRedraw = false;
const fitView = () => { cam = { x: 0, y: 0, z: 1, fit: true }; };
const ZMAX = 4, ZFAR = 0.05;   // (zoomed right out: a twentieth of full size, for room to build in)
// (the sheet: the circuit, or in columns view its columns side by side: sheetW, sheetH in views.js)
const viewW = () => camW() / cam.z, viewH = () => VIS_H1 / cam.z;
const zMin = () => Math.max(0.25, Math.min(1, VIS_H1 / sheetH()));
function applyCam() {
  if (typeof dragging === 'function' && dragging()) return;   // the view holds still under a drag in progress
  if (cam.fit) cam.z = barsOn() || LAYOUT ? zMin() : 1;   // (a circuit on supply boxes opens at its full width, and scrolls)
  const H = sheetH(), SW = camW(), X0 = -SHEET_M, vw = viewW(), vh = viewH();   // (SW: the sheet with its margins, from X0)
  // (zoomed out past the sheet: centred on it; but building on supply boxes, kept at the left, the room to its right
  // being free to build in: see workW)
  // Zoomed out past the sheet, the view can still be moved about (the scroll wheel, Shift + wheel, the middle
  // button): anywhere the whole sheet stays in view; or, building on supply boxes, on out to the right (the room there
  // is free to build in). Building, the room below is free to build in too, so the view can move on down.
  const room = editing && !LAYOUT, roomR = room && !barsOn(), clampTo = (v, lo, hi) => Math.min(Math.max(lo, v), hi);
  if (vw < SW) cam.x = clampTo(cam.x, X0, X0 + SW - vw);
  else if (cam.fit) cam.x = roomR ? X0 : X0 + (SW - vw) / 2;
  else cam.x = clampTo(cam.x, X0 + SW - vw, roomR ? 20000 : X0);   // (anywhere the sheet stays in view, so zooming keeps the point under the pointer still)
  const Hc = room ? Math.max(400, contentH()) : H;   // (building, the circuit itself: the room below it is free to build in)
  if (vh < H && !(room && !cam.fit)) cam.y = clampTo(cam.y, 0, H - vh);
  else if (cam.fit) cam.y = room ? 0 : (H - vh) / 2;
  else cam.y = room ? Math.max(Math.min(0, Hc - vh), cam.y) : clampTo(cam.y, H - vh, 0);
  svg.setAttribute('viewBox', `${cam.x} ${cam.y} ${vw} ${vh}`);
  // building, zoomed out past what was drawn: draw again, so the sheet and its grid fill the view (room to build in)
  if (editing && view.drawn && !needRedraw && (canvasH() > view.drawn[1] + 1 || workW() > view.drawn[0] + 1)) { needRedraw = true; requestAnimationFrame(() => { needRedraw = false; draw(); }); }
  const lab = document.getElementById('zoom-pct'); if (lab) lab.textContent = Math.round(cam.z * 100) + '%';
  if (typeof ovView === 'function') ovView();
}
function zoomAt(f, px, py) {
  const z = Math.min(ZMAX, Math.max(Math.min(zMin(), ZFAR), cam.z * f)); if (Math.abs(z - cam.z) < 1e-6) return;
  cam.fit = false;
  const fx = (px - cam.x) / viewW(), fy = (py - cam.y) / viewH();
  cam.z = z; cam.x = px - fx * viewW(); cam.y = py - fy * viewH(); applyCam();
}
const zoomCentre = f => zoomAt(f, cam.x + viewW() / 2, cam.y + viewH() / 2);
svg.addEventListener('wheel', e => {
  const k = e.deltaMode === 1 ? 30 : e.deltaMode === 2 ? 300 : 1, dy = e.deltaY * k, dx = e.deltaX * k;
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); const p = pt(e); zoomAt(Math.exp(-dy * 0.0015), p.x, p.y); return; }
  if (cam.fit && viewW() >= camW() - 1e-6 && viewH() >= sheetH() - 1e-6) return;   // fitted, everything in view: let the page scroll as normal
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
  try { svg.setPointerCapture(e.pointerId); } catch (_) {}
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); svg.style.cursor = spacePan ? 'grab' : tool === 'select' ? '' : 'crosshair'; };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
/* Space held: the hand. A drag with the left button then moves the view instead of picking or pressing anything.
   (Not while typing in a box, or with a part picked out by Tab: there Space presses the part, as before.) */
let spacePan = false, spaceCursor = '';
const spaceFree = () => { const a = document.activeElement; return !a || a === document.body || a === svg || !(a.closest('input, textarea, select, button, [contenteditable], dialog, [tabindex]') || svg.contains(a)); };
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey || !spaceFree()) return;
  e.preventDefault();   // (no scrolling the page)
  if (spacePan) return;
  spacePan = true; spaceCursor = svg.style.cursor; svg.style.cursor = 'grab';
});
const spaceUp = () => { if (!spacePan) return; spacePan = false; svg.style.cursor = spaceCursor; };
document.addEventListener('keyup', e => { if (e.code === 'Space') spaceUp(); });
window.addEventListener('blur', spaceUp);
// (caught before anything else on the panel sees the press: a part, a wire, a button in Run mode)
svg.addEventListener('pointerdown', e => { if (spacePan && e.button === 0) { e.stopImmediatePropagation(); panDrag(e); } }, true);
document.getElementById('zoom-in').addEventListener('click', () => zoomCentre(1.25));
document.getElementById('zoom-out').addEventListener('click', () => zoomCentre(0.8));
// Fit: the whole circuit, as large as the panel allows (full width, or smaller if the circuit is taller than the window)
document.getElementById('zoom-fit').addEventListener('click', () => { fitView(); if (editing) fit(true); draw(); });
