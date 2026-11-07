/* =====================================================================
   the operator station
   In Run mode, a small steel enclosure floating over the panel with every pushbutton and selector switch of the
   circuit on it (each one once, however many rungs it is drawn in), in the order they come down the ladder, drawn
   as on the circuit, in chrome bezels, each with a legend plate. Pressing a button on it presses it in the circuit,
   so a button at the top of a long ladder can be worked while watching the rungs at the bottom. Drag it by its title
   bar; drag a side or corner to make it bigger or smaller (everything on it grows with it; double-click one to put it back to its usual
   size); the arrow folds it to its title bar; Station on the Simulation tab shows or hides it (it starts off). Where it is, how big, and
   whether it is folded or hidden, is remembered in the browser.
   ===================================================================== */
const STATION_KEY = 'oo-circuit-builder:station';
let ST = { x: null, y: null, z: 1, min: false, hidden: true },   // (z: how much bigger than usual it is drawn)
      // (off until it is first turned on with Station on the Simulation tab)
    STV = [];   // STV: the station's operators, { p, v }
try { Object.assign(ST, JSON.parse(localStorage.getItem(STATION_KEY) || '{}')); } catch (_) {}
const saveStation = () => { try { localStorage.setItem(STATION_KEY, JSON.stringify(ST)); } catch (_) {} };
const stationEl = document.getElementById('station'), stBody = stationEl.querySelector('.st-body');

/* ---------------- resizing the floating windows (the operator station, the Process window) ----------------
   Each has a grip along every side and at every corner. Dragging one makes the window bigger or smaller, the far side holding
   still; how it does is up to the window (size(d, w, h, s): d the grip, as 'e' or 'nw'; w, h the width and height asked for; s what
   start() gave). Double-clicking a grip puts the window back to its usual size. */
function addGrips(win, { start, size, move, done, reset }) {
  for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const g = document.createElement('div'); g.className = 'rz rz-' + d; g.setAttribute('aria-hidden', 'true');
    win.append(g);
    g.addEventListener('dblclick', e => { e.preventDefault(); reset(); });
    g.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const r0 = win.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, s = start(r0);
      try { g.setPointerCapture(e.pointerId); } catch (_) {}
      document.body.style.cursor = getComputedStyle(g).cursor; document.body.classList.add('dragging');
      let ev = null, raf = 0;
      const go = () => {
        raf = 0; const dx = ev.clientX - x0, dy = ev.clientY - y0;
        size(d, r0.width + (d.includes('e') ? dx : d.includes('w') ? -dx : 0), r0.height + (d.includes('s') ? dy : d.includes('n') ? -dy : 0), s);
        const r = win.getBoundingClientRect();
        move(d.includes('w') ? r0.right - r.width : r0.left, d.includes('n') ? r0.bottom - r.height : r0.top);
      };
      const mv = q => { ev = q; if (!raf) raf = requestAnimationFrame(go); };   // (once a frame at most, for slower computers)
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
        if (raf) { cancelAnimationFrame(raf); go(); }
        document.body.style.cursor = ''; document.body.classList.remove('dragging'); done(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
  }
}
// the operators: the main drawing of each pushbutton and selector switch, top of the ladder first
const operators = () => {
  const seen = new Set(), out = [];
  for (const p of [...parts].sort((a, b) => a.y - b.y || a.x - b.x)) if ((p.t === 'btn' || p.t === 'sel') && !seen.has(p.t + p.L)) { seen.add(p.t + p.L); out.push(p.t === 'btn' ? mainBtn(p.L) : mainSel(p.L)); }
  return out;
};
const plateOf = p => p.t === 'sel' ? ((p.names || []).filter(Boolean).join('/') || `${p.L} SELECTOR`) : nameOf(p);
const tagOf = p => p.t === 'sel' ? `${p.L} · ${selN(p)}-position` : p.estop ? `${p.L} · E-Stop` : `${p.L} · ${p.nc ? 'NC' : 'NO'}${p.maint ? ' · maint.' : ''}`;
function buildStation() {
  const grid = document.getElementById('st-grid'); grid.innerHTML = ''; STV = [];
  // (drawn while showing, though unseen, so the labels can be measured and shrunk to fit their caps)
  stationEl.hidden = false; stationEl.style.visibility = 'hidden'; stationEl.classList.remove('min');
  const ops = editing ? [] : operators();
  document.getElementById('st-name').textContent = circuitName || 'Operator station';
  grid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.min(4, ops.length))}, auto)`;
  for (const p of ops) {
    const cell = document.createElement('div'); cell.className = 'st-op';
    const half = BODYH(p.t) / 2 + 12, s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `${-half} ${-half} ${2 * half} ${2 * half}`); s.setAttribute('class', 'st-dev');
    s.style.width = s.style.height = Math.round(2 * half * .84) + 'px';
    cell.append(s); grid.append(cell);
    const g = el('g', {}, s);
    // the chrome bezel round it, the shape of its body
    if (p.t === 'btn' && p.nc) { const R = BOX / 2 * 1.08 + 8; el('path', { d: hexPath(0, 0, R, R * .2), fill: 'url(#gChrome)', stroke: '#4a4a4a', 'stroke-width': 1.2 }, g); }
    else { const b = BODYH(p.t) + 16; el('rect', { x: -b / 2, y: -b / 2, width: b, height: b, rx: b * .2, fill: 'url(#gChrome)', stroke: '#4a4a4a', 'stroke-width': 1.2 }, g); }
    const v = drawPart(p, g, 0, 0, document.createElementNS(NS, 'g'), true);
    if (p.t === 'btn') bindButton(g, p); else bindSelector(g, p);
    g.setAttribute('aria-label', `${plateOf(p)} (${captionOf(p)})`);
    const pl = document.createElement('div'); pl.className = 'st-plate'; pl.textContent = plateOf(p); cell.append(pl);
    const tg = document.createElement('div'); tg.className = 'st-tag'; tg.textContent = tagOf(p); cell.append(tg);
    STV.push({ p, v });
  }
  stationEl.style.visibility = '';
  showStation();
}
function showStation() {
  const ops = STV.length, on = !editing && ops > 0;
  stationEl.hidden = !on || ST.hidden;
  stationEl.classList.toggle('min', !!ST.min);
  const t = document.getElementById('st-toggle');
  if (t) { t.setAttribute('aria-pressed', String(on && !ST.hidden)); t.disabled = !ops; document.getElementById('st-group').hidden = editing; }
  document.getElementById('st-min').setAttribute('aria-label', ST.min ? 'Open the operator station' : 'Fold the operator station to its title bar');
  if (!stationEl.hidden) placeStation();
}
// keep it inside the window
function placeStation() {
  const r = stationEl.getBoundingClientRect(), st = svg.getBoundingClientRect();
  let x = ST.x ?? st.right - r.width - 16, y = ST.y ?? st.top + 16;   // (first time: the top right of the panel, where the coils and lights are)
  x = Math.max(0, Math.min(x, window.innerWidth - Math.min(r.width, window.innerWidth)));
  y = Math.max(0, Math.min(y, window.innerHeight - 34));
  stationEl.style.left = x + 'px'; stationEl.style.top = y + 'px';
  // (drawn bigger or smaller by its zoom; it scrolls rather than running off the bottom of the window)
  const z = ST.z || 1; stBody.style.zoom = z === 1 ? '' : z;
  stBody.style.maxHeight = Math.max(80, (window.innerHeight - y - stationEl.querySelector('.st-head').offsetHeight - 8) / z) + 'px';
}
// its size: one zoom for all of it (a side changes it by that side's stretch, a corner by the larger of the two)
const ST_ZMIN = .7, ST_ZMAX = 3;
addGrips(stationEl, {
  start: r => { const b = stBody.getBoundingClientRect(); return { z: ST.z || 1, w: r.width, bh: b.height, hh: r.height - b.height }; },
  size: (d, w, h, s) => {
    const zw = s.z * w / s.w, zh = s.z * (h - s.hh) / s.bh;
    let z = d === 'e' || d === 'w' ? zw : d === 'n' || d === 's' ? zh : Math.max(zw, zh);
    z = Math.max(ST_ZMIN, Math.min(z, ST_ZMAX, s.z * (window.innerWidth - 8) / s.w));
    ST.z = Math.round(z * 100) / 100; placeStation();
  },
  move: (x, y) => { ST.x = x; ST.y = y; placeStation(); },
  done: () => { const q = stationEl.getBoundingClientRect(); ST.x = q.left; ST.y = q.top; saveStation(); },
  reset: () => { ST.z = 1; placeStation(); saveStation(); }
});
function paintStation() { if (stationEl.hidden) return; for (const { p, v } of STV) if (p.t === 'btn') paintBtn(p, v, 0, 0); else paintSel(p, v); }
document.getElementById('st-head').addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('button')) return;
  e.preventDefault();
  const r = stationEl.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, h = e.currentTarget;
  try { h.setPointerCapture(e.pointerId); } catch (_) {}
  document.body.classList.add('dragging');
  const mv = ev => { ST.x = ev.clientX - dx; ST.y = ev.clientY - dy; placeStation(); };
  const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); document.body.classList.remove('dragging');
    const q = stationEl.getBoundingClientRect(); ST.x = q.left; ST.y = q.top; saveStation(); };
  h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
});
document.getElementById('st-min').addEventListener('click', () => { ST.min = !ST.min; saveStation(); showStation(); });
document.getElementById('st-toggle').addEventListener('click', () => { ST.hidden = !ST.hidden; saveStation(); showStation(); paint(); });
window.addEventListener('resize', () => { if (!stationEl.hidden) placeStation(); });
// the corner screws: the heads of the screws that fasten the wires to L1 and L2
document.querySelectorAll('.st-screw').forEach(s => screw(0, 0, el('g', {}, s), true));
