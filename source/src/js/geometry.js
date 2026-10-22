/* ---------------- geometry ---------------- */
const snap = v => Math.round(v / G) * G;
const key = (x, y) => x + ',' + y;
const terms = p => [[p.x - TERM(p), p.y], [p.x + TERM(p), p.y]];
/* The sheet is as wide as it needs to be to fill the panel with the whole circuit in view: on a wide screen, or for a
   tall circuit, the L2 bar moves out to the right edge and the wires fastened to it stretch to meet it. (It is never
   narrower than W_MIN, nor so narrow that a part would end up past L2.) Once the L1 or L2 bar has been moved by hand,
   the sheet keeps that length instead (W_USER), until a bar's handle is double-clicked. */
let W = W_MIN, W_USER = null;
function contentRight(floor = W_MIN) {
  let m = floor;
  for (const p of parts) m = Math.max(m, p.x + TERM(p) + 40);
  for (const w of wires) for (const x of [w.x1, w.x2]) if (x !== W) m = Math.max(m, x + 20);
  return Math.ceil(m / G) * G;
}
const contentH = () => { let m = 0; for (const p of parts) m = Math.max(m, p.y + 60); for (const w of wires) m = Math.max(m, w.y1, w.y2); return Math.max(400, snap(m + 120)); };
// move the L2 bar to x = nw: wire ends on it move with it
function setWidth(nw) {
  if (nw === W) return false;
  for (const w of wires) { if (w.x1 === W) w.x1 = nw; if (w.x2 === W) w.x2 = nw; }
  W = nw; normalize();
  return true;
}
// the width that fills a panel of the given size (in screen pixels) with the whole circuit
function fitWidth(pw, ph) { return W_USER ? Math.max(contentRight(BAR_MIN), W_USER) : Math.max(contentRight(), Math.ceil(contentH() * pw / Math.max(ph, 1) / G) * G); }
const BAR_MIN = 240;   // the shortest a circuit can be made by moving the bars
// how far right the L1 bar can move: up to 40 units short of the first part or wire corner
function leftRoom() {
  let m = Infinity;
  for (const p of parts) m = Math.min(m, p.x - TERM(p));
  for (const w of wires) for (const x of [w.x1, w.x2]) if (x !== 0) m = Math.min(m, x);
  return isFinite(m) ? Math.max(0, Math.floor((m - 40) / G) * G) : W - BAR_MIN;
}
// move the L1 bar dx to the right (or left, if dx is negative): the circuit stays where it is and the wires fastened
// to L1 shorten (or lengthen); as L1 is always x = 0, everything else shifts by -dx
function shiftL1(dx) {
  if (!dx) return;
  for (const p of parts) p.x -= dx;
  for (const w of wires) { if (w.x1 !== 0) w.x1 -= dx; if (w.x2 !== 0) w.x2 -= dx; }
  W -= dx; normalize();
}
// the panel's height in panel units: room for everything on it, and at least as tall as the window shows
let VIS_H1 = 400;   // how many panel units tall the view is at normal zoom (set by layoutStage)
function canvasH() {
  let m = 0;
  for (const p of parts) m = Math.max(m, p.y + 60);
  for (const w of wires) m = Math.max(m, w.y1, w.y2);
  return Math.max(400, VIS_H1, snap(m + 120));
}
function overlaps(p, x, y, t) {
  const hw = LOADT(t) ? 60 : 40;
  return parts.some(q => q !== p && Math.abs(q.x - x) < hw + TERM(q) && Math.abs(q.y - y) < 80);
}
const clampPart = (x, y, t) => { const h = LOADT(t) ? 60 : 40; return [Math.min(W - h - 40, Math.max(h + 40, snap(x))), Math.max(60, snap(y))]; };   // (clear of the bars)
const clampX = x => Math.min(W, Math.max(0, snap(x))), clampY = y => Math.max(40, snap(y));
