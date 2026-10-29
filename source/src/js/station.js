/* =====================================================================
   the operator station
   In Run mode, a small steel enclosure floating over the panel with every pushbutton and selector switch of the
   circuit on it (each one once, however many rungs it is drawn in), in the order they come down the ladder, drawn
   as on the circuit, in chrome bezels, each with a legend plate. Pressing a button on it presses it in the circuit,
   so a button at the top of a long ladder can be worked while watching the rungs at the bottom. Drag it by its title
   bar; the arrow folds it to its title bar; Station on the Simulation tab shows or hides it (it starts off). Where it is, and whether it is folded
   or hidden, is remembered in the browser.
   ===================================================================== */
const STATION_KEY = 'oo-circuit-builder:station';
let ST = { x: null, y: null, min: false, hidden: true },   // (off until it is first turned on with Station on the Simulation tab)
    STV = [];   // STV: the station's operators, { p, v }
try { Object.assign(ST, JSON.parse(localStorage.getItem(STATION_KEY) || '{}')); } catch (_) {}
const saveStation = () => { try { localStorage.setItem(STATION_KEY, JSON.stringify(ST)); } catch (_) {} };
const stationEl = document.getElementById('station');
// the operators: the main drawing of each pushbutton and selector switch, top of the ladder first
const operators = () => {
  const seen = new Set(), out = [];
  for (const p of [...parts].sort((a, b) => a.y - b.y || a.x - b.x)) if (isOp(p) && !seen.has(p.t + p.L)) { seen.add(p.t + p.L); out.push(p.t === 'btn' ? mainBtn(p.L) : mainSel(p.L)); }
  return out;
};
const plateOf = p => p.t === 'sel' ? ((p.names || []).filter(Boolean).join('/') || `${p.L} SELECTOR`) : nameOf(p);
const tagOf = p => p.t === 'sel' ? `${p.L} · ${selN(p)}-position` : `${p.L} · ${p.nc ? 'NC' : 'NO'}${p.maint ? ' · maint.' : ''}`;
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
}
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
