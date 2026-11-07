/* Process pictures on the panel: the Process window's pictures (a cylinder, a gauge, an oven...), drawn on the circuit
   itself, following their values while it runs.
   - Docked: under each solenoid, motor or heating element that drives a value, a small picture of it and its value
     (unless that output's picture is hidden: p.nopic, on its tab).
   - Placed: dragged off its output (or put on the panel from Process values, for a value no output drives), a value's
     picture becomes a card of its own (v.pic, its top left corner) with its name, its value, and what drives it and
     the switches it works. Selected, dashed lines run to those parts, and a dashed "dock" shows under each output it
     can go back to: dropped there, or double-clicked, it docks again. Delete takes it off the panel.
   Pictures are not parts: they take no wires, and are drawn under the parts. */
var PIC_READY = false;   // (set at the foot of this file: nothing is drawn before it has run)
const PIC_W = 260, PIC_H = 100, DOCK_W = 150, DOCK_H = 50, DOCK_GAP = 14;
let picSel = null, picDragV = null, picN = 0, picClick = { v: null, t: 0 };   // the value whose card is selected (Build); the one being dragged
const picTag = p => ({ sol: 'SOL', mtr: 'MTR', htr: 'HTR', lsw: 'LS', psw: 'PS', tsw: 'TS' }[p.t] || '') + p.L;
const picShown = p => isDrv(p) && !p.nopic && !!pvOf(p);
/* where output p's docked picture sits ({ x, y: its top left corner; w, h; small }): under it, unless a part, a name or
   a wire is in the way there; then the first clear spot of a few round it (beside it, below or above its rung's wire;
   over its name). Where the circuit is too close for any of those, a small badge instead, just above the rung's wire
   beside the output (where a temperature switch has its thermometer); and with no room even for that, under it all
   the same (drag it off, or hide it on the output's tab). */
const BADGE_W = 104, BADGE_H = 26;
function dockAt(p) {
  const w = DOCK_W, h = DOCK_H, hw = halfW(p.t), yb = p.y + BODYH(p.t) / 2 + DOCK_GAP;
  const spots = [[p.x - w / 2, yb], [p.x - 30, yb], [p.x + 30 - w, yb], [p.x + hw + 14, p.y + 20], [p.x - hw - 14 - w, p.y + 20],
    [p.x + hw + 14, p.y - 20 - h], [p.x - hw - 14 - w, p.y - 20 - h], [p.x - w / 2, p.y - capTop(p) - 22 - h]].map(([x, y]) => ({ x, y, w, h }));
  spots.push(...[[p.x + hw + 4, p.y - 14 - BADGE_H], [p.x - hw - 4 - BADGE_W, p.y - 14 - BADGE_H]].map(([x, y]) => ({ x, y, w: BADGE_W, h: BADGE_H, small: true })));
  const lo = barsOn() ? BAR + 6 : 0, hi = barsOn() ? W - BAR - 6 : Infinity;
  const hit = ({ x, y, w, h }) => x < lo || x + w > hi || y < 4
    || parts.some(q => q !== p && x < q.x + halfW(q.t) + 10 && x + w > q.x - halfW(q.t) - 10 && y < q.y + halfH(q.t) + 6 && y + h > q.y - capTop(q) - 16)
    || wires.some(z => x < Math.max(z.x1, z.x2) + 12 && x + w > Math.min(z.x1, z.x2) - 12 && y < Math.max(z.y1, z.y2) + 12 && y + h > Math.min(z.y1, z.y2) - 12)
    || parts.some(q => q !== p && picShown(q) && !pvOf(q).pic && (q.y < p.y || q.y === p.y && q.x < p.x) && (d => x < d.x + d.w + 8 && x + w > d.x - 8 && y < d.y + d.h + 8 && y + h > d.y - 8)(dockAt(q)));
  const d = spots.find(z => !hit(z)) || spots[0];
  return { ...d, x: snapHalf(d.x), y: snapHalf(d.y) };
}
const snapHalf = n => Math.round(n / 5) * 5;
const picDocks = v => parts.filter(p => picShown(p) && p.pv === v.id);
const picVal = v => editing || PVV[v.id] === undefined ? v.start : PVV[v.id];
const picText = v => pvFmt(v, picVal(v)) + (v.unit ? ' ' + v.unit : '');
// how far right and down the pictures reach (so the sheet makes room for them)
function picExt() {
  let r = 0, b = 0; if (!PIC_READY) return { r, b };
  for (const v of PV) {
    if (v.pic) { r = Math.max(r, v.pic.x + PIC_W); b = Math.max(b, v.pic.y + PIC_H); continue; }
    for (const p of picDocks(v)) { const d = dockAt(p); r = Math.max(r, d.x + d.w); b = Math.max(b, d.y + d.h); }
  }
  return { r, b };
}
// every picture drawn on the panel (for the animation of flows and speeds)
const picsAll = () => PIC_READY ? VIEWS.flatMap(V => (V.pics || []).map(q => q.s)) : [];
// value id has changed: its pictures on the panel follow it
function picsShow(id) {
  if (!PIC_READY) return;
  for (const V of VIEWS) for (const q of V.pics || []) if (q.v.id === id) { pvVisSet(q.s, q.v, picVal(q.v)); q.t.textContent = picText(q.v); }
}
// a value's text, shrunk to fit the room it has
function picNum(g, x, y, v, px, room, a) {
  const s = picText(v), t = el('text', { x, y, 'text-anchor': a, class: 'picnum', 'font-size': Math.min(px, room / (s.length * .62)).toFixed(1) }, g);
  t.textContent = s; return t;
}
function drawPics(V, B) {
  V.pics = [];
  if (!PIC_READY || !PV.length) return;
  const live = editing && V === view;
  for (const v of PV) {
    const docks = picDocks(v);
    if (v.pic) {
      const { x, y } = v.pic, on = live && picSel === v.id, band = B(y + PIC_H / 2), g0 = band.pics;
      // (selected: dashed lines to the parts it goes with, and a dock under each output it can go back to)
      if (on || (live && picDragV === v.id)) {
        for (const p of docks) { const d = dockAt(p);
          el('rect', { x: d.x, y: d.y, width: d.w, height: d.h, rx: d.small ? 6 : 9, class: 'picdock' }, g0);
          el('text', { x: d.x + d.w / 2, y: d.y + d.h / 2 + 4, 'text-anchor': 'middle', class: 'picdocktext' }, g0).textContent = 'dock'; }
        for (const p of parts.filter(p => p.pv === v.id && (isDrv(p) || isLim(p)))) {
          const tx = p.x + (p.x < x ? 30 : -30), ty = p.y + BODYH(p.t) / 2 * (p.y < y ? 1 : -1), sx = p.x < x ? x : x + PIC_W, sy = y + PIC_H / 2;
          el('path', { d: `M${sx} ${sy}C${sx + (p.x < x ? -80 : 80)} ${sy} ${tx} ${ty + (p.y < y ? 60 : -60)} ${tx} ${ty}`, class: 'piclink' }, g0);
        }
      }
      const g = el('g', { class: 'pic', 'data-pic': v.id, style: live ? 'cursor:grab' : '' }, g0);
      el('rect', { x, y, width: PIC_W, height: PIC_H, rx: 12, class: on ? 'piccard on' : 'piccard' }, g);
      el('rect', { x: x + 10, y: y + 10, width: 128, height: 80, rx: 6, class: 'picwell' }, g);
      const s = el('g', { transform: `translate(${x + 14} ${y + 16}) scale(1.25)` }, g); pvVisDraw(s, v, 'pp' + (picN++) + '_'); pvVisSet(s, v, picVal(v));
      const nm = el('text', { x: x + 150, y: y + 32, class: 'picname', 'font-size': Math.min(16, 100 / (v.name.length * .55)).toFixed(1) }, g); nm.textContent = v.name;
      const t = picNum(g, x + 150, y + 64, v, 22, 102, 'start');
      const by = parts.filter(p => isDrv(p) && p.pv === v.id).map(picTag), wk = parts.filter(p => isLim(p) && p.pv === v.id).map(picTag);
      const ln = (by.join(', ') || '') + (by.length && wk.length ? ' → ' : '') + wk.join(', ');
      if (ln) { const lt = el('text', { x: x + 150, y: y + 86, class: 'piclinks', 'font-size': Math.min(12, 102 / (ln.length * .55)).toFixed(1) }, g); lt.textContent = ln; }
      el('title', {}, g).textContent = editing ? `${v.name}: drag to move it${docks.length ? '; drop it on a dock under its output, or double-click it, to put it back there' : ''}. Delete takes it off the panel.` : v.name;
      V.pics.push({ s, v, t });
      if (live) {
        g.addEventListener('pointerdown', e => picDrag(e, v, null));
      }
      continue;
    }
    for (const p of docks) {
      const d = dockAt(p), { x, y } = d, band = B(p.y);
      if (!d.small) el('line', { x1: p.x, y1: p.y, x2: x + d.w / 2, y2: y + d.h / 2, class: 'picstem' }, band.pics);   // (from the output's middle: under it, and under the picture)
      const g = el('g', { class: 'pic docked' + (d.small ? ' small' : ''), 'data-pic': v.id, style: live ? 'cursor:grab' : '' }, band.pics);
      el('rect', { x, y, width: d.w, height: d.h, rx: d.small ? 6 : 9, class: 'piccard' }, g);
      const s = el('g', { transform: d.small ? `translate(${x + 3} ${y + 2}) scale(.4)` : `translate(${x + 4} ${y + 4}) scale(.75)` }, g); pvVisDraw(s, v, 'pp' + (picN++) + '_'); pvVisSet(s, v, picVal(v));
      const t = d.small ? picNum(g, x + 72, y + 17.5, v, 12, 60, 'middle') : picNum(g, x + 113, y + 30, v, 15, 70, 'middle');
      el('title', {}, g).textContent = editing ? `${v.name}: drag it off to put it anywhere on the panel` : `${v.name} (${picTag(p)})`;
      V.pics.push({ s, v, t });
      if (live) g.addEventListener('pointerdown', e => picDrag(e, v, p));
    }
  }
}
// dragging a picture (p: the output it was docked under, if it was): off its output it becomes a card; let go over a dock, it docks again
function picDrag(e, v, p) {
  if (e.button !== 0) return;
  e.stopPropagation(); e.preventDefault();
  const ae = document.activeElement; if (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) ae.blur();
  const s = pt(e), start = stateOf(), o = v.pic ? { ...v.pic } : (d => ({ x: d.x + d.w / 2 - PIC_W / 2, y: d.y }))(dockAt(p));
  let moved = false;
  dragNow = true; document.body.classList.add('dragging');
  const lo = barsOn() ? BAR + 10 : 0, hi = () => (barsOn() ? W - BAR - 10 : rightEdge()) - PIC_W;
  const mv = ev => {
    const q = pt(ev); if (!moved && Math.hypot(q.x - s.x, q.y - s.y) < 6) return;
    if (!moved) { moved = true; picDragV = v.id; picSel = v.id; sel = null; }
    const nx = Math.max(lo, Math.min(hi(), snap(o.x + q.x - s.x))), ny = Math.max(10, snap(o.y + q.y - s.y));
    if (v.pic && v.pic.x === nx && v.pic.y === ny) return;
    v.pic = { x: nx, y: ny }; draw();
  };
  const up = () => {
    document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
    dragNow = false; picDragV = null; document.body.classList.remove('dragging');
    if (!moved) {   // a click: a docked picture picks its output; a card is selected
      // (a card clicked twice, a double-click: back under its output, if it has one; the picture is redrawn on each click, so the browser's own dblclick never reaches it)
      const now = performance.now(), dbl = !p && picClick.v === v.id && now - picClick.t < 450; picClick = { v: v.id, t: now };
      if (dbl && picDocks(v).length) { remember(start); delete v.pic; picSel = null; return draw(); }
      if (p) { sel = selOne('p', p.id); picSel = null; ribbonTab = 'part'; } else { picSel = v.id; sel = null; }
      say(''); return draw();
    }
    // let go over a dock (its centre near a dock's): docked again
    const cx = v.pic.x + PIC_W / 2, cy = v.pic.y + PIC_H / 2;
    if (picDocks(v).some(q => { const d = dockAt(q); return Math.abs(cx - (d.x + d.w / 2)) < 90 && Math.abs(cy - (d.y + d.h / 2)) < 60; })) { delete v.pic; picSel = null; }
    if (stateOf() !== start) remember(start);
    draw();
  };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
// Delete, with a card selected: it comes off the panel (back under its output, if it has one)
function picDel() {
  const v = picSel && PV.find(q => q.id === picSel); if (!v || !v.pic) return false;
  snapshot(); delete v.pic; picSel = null; draw(); return true;
}
// a spot for a new card: by the right of the panel, below any other cards
function picPlace(v) {
  const x = Math.max(BAR + 10, (barsOn() ? W - BAR - 30 : contentRight()) - PIC_W);
  let y = 40; for (const q of PV) if (q !== v && q.pic && Math.abs(q.pic.x - x) < PIC_W) y = Math.max(y, q.pic.y + PIC_H + 20);
  v.pic = { x: snap(x), y: snap(y) };
}
// pressing anywhere else on the panel lets go of a selected card
svg.addEventListener('pointerdown', e => { if (picSel && !e.target.closest('.pic')) picSel = null; }, true);
PIC_READY = true;
