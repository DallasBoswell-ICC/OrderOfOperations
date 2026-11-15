/* ---------------- faults (troubleshooting, stage 1) ----------------
   The Faults tab (Build): pick a part or wire on the panel and plant a fault on it (open, or shorted; a wire, open or
   shorted to L2), or plant one at random; the planted faults listed (click one to pick it, ✕ to take it off); Faults
   On in Run (off: Run works the circuit as it should be); red badges on the faulted parts and wires; and the work
   order the student is given. A part's own tab has its Fault too. See constants.js for what each fault does. */
const faultName = (x, isW) => (isW ? WIRE_FAULTS : PART_FAULTS)[x.fault] || '';
// where a fault is, in words: a part by its caption, a wire by its rung number when it has one (or where it runs)
function faultWhere(x, isW) {
  if (!isW) return captionOf(x);
  let r = null; try { if (NET) r = rungAt(rungYs(NET), x.y1 === x.y2 ? x.y1 : Math.min(x.y1, x.y2)); } catch (_) {}
  return `Wire on line ${r || '?'}${x.y1 === x.y2 ? '' : ' (up and down)'}`;
}
const faulted = () => [...parts.filter(p => p.fault).map(p => [p, false]), ...wires.filter(w => w.fault).map(w => [w, true])];
// the one part or wire picked, if a fault can be planted on it
function faultTarget() {
  if (!sel || sel.parts.size + sel.wires.size !== 1 || (sel.terms && sel.terms.size)) return null;
  if (sel.parts.size) { const p = parts.find(q => sel.parts.has(q.id)); return canFault(p) ? [p, false] : null; }
  const w = wires.find(q => sel.wires.has(q.id)); return w ? [w, true] : null;
}
function setFault(x, isW, f) {
  if ((x.fault || '') === (f || '')) return;
  snapshot(); if (f) x.fault = f; else delete x.fault;
  say(f ? `${faultWhere(x, isW)}: ${(isW ? WIRE_FAULTS : PART_FAULTS)[f]} (planted)` : `${faultWhere(x, isW)}: fault taken off`);
  draw();
}
function showFaults() {
  const t = faultTarget(), what = document.getElementById('fz-what'), kinds = document.getElementById('fz-kinds');
  what.textContent = t ? faultWhere(...t) : sel && selCount() ? 'Pick one part or wire (this one cannot have a fault)' : 'Pick a part or wire on the panel';
  what.classList.toggle('none', !t);
  const opts = t ? { '': 'None', ...(t[1] ? WIRE_FAULTS : PART_FAULTS) } : { '': 'None', ...PART_FAULTS };
  kinds.innerHTML = Object.entries(opts).map(([k, n]) => `<button type="button" data-fz="${k}" aria-pressed="${t ? String((t[0].fault || '') === k) : 'false'}"${t ? '' : ' disabled'}>${n}</button>`).join('');
  const L = faulted(), list = document.getElementById('fz-list');
  list.innerHTML = L.length ? L.map(([x, w], i) => `<div class="fz-row" data-i="${i}">${i + 1}. ${String(faultWhere(x, w)).replace(/&/g, '&amp;').replace(/</g, '&lt;')}<b>${faultName(x, w)}</b><button type="button" data-x="${i}" aria-label="Take this fault off">✕</button></div>`).join('') : '<div class="none">None yet: pick a part or wire, then a fault</div>';
  document.getElementById('fz-clear').disabled = !L.length;
  document.getElementById('fz-on').setAttribute('aria-pressed', String(FAULTS_ON));
  document.getElementById('fz-badges').setAttribute('aria-pressed', String(FAULT_BADGES));
  const wo = document.getElementById('fz-wo'); if (document.activeElement !== wo) wo.value = WORK_ORDER;
  const n = L.length; document.getElementById('rt-faults').textContent = n ? `Faults (${n})` : 'Faults';
}
// the Fault on a part's own tab (one part picked, or several of one kind)
function showPartFault(G) {
  const g = document.getElementById('p-fault-group'), s = document.getElementById('p-fault'), ok = G.length && G.every(canFault);
  g.hidden = !ok; if (!ok) return;
  const same = G.every(p => (p.fault || '') === (G[0].fault || ''));
  s.innerHTML = (same ? '' : '<option value="__">(several)</option>') + Object.entries({ '': 'None', ...PART_FAULTS }).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  s.value = same ? G[0].fault || '' : '__';
}
document.getElementById('p-fault').addEventListener('change', e => { const f = e.target.value; if (f === '__') return; const G = selGroup().filter(canFault); if (!G.length) return;
  snapshot(); for (const p of G) { if (f) p.fault = f; else delete p.fault; } say(f ? `Fault planted: ${PART_FAULTS[f]}` : 'Fault taken off'); draw(); });
document.getElementById('fz-kinds').addEventListener('click', e => { const b = e.target.closest('[data-fz]'), t = faultTarget(); if (!b || !t) return; setFault(t[0], t[1], b.dataset.fz); });
document.getElementById('fz-list').addEventListener('click', e => {
  const L = faulted(), x = e.target.closest('[data-x]');
  if (x) { const [o, w] = L[+x.dataset.x]; setFault(o, w, ''); return; }
  const r = e.target.closest('.fz-row'); if (!r) return; const [o, w] = L[+r.dataset.i];
  sel = selOne(w ? 'w' : 'p', o.id); draw();
});
document.getElementById('fz-random').addEventListener('click', () => {
  const ps = parts.filter(p => canFault(p) && !p.fault), ws = wires.filter(w => !w.fault && !(barsOn() && (w.x1 === 0 || w.x2 === 0 || w.x1 === W || w.x2 === W) && w.x1 === w.x2));
  const all = [...ps.map(p => [p, false]), ...ws.map(w => [w, true])];
  if (!all.length) { say('Nothing left to plant a fault on'); return; }
  const [x, isW] = all[Math.floor(Math.random() * all.length)], ks = Object.keys(isW ? WIRE_FAULTS : PART_FAULTS);
  setFault(x, isW, ks[Math.floor(Math.random() * ks.length)]);
  sel = selOne(isW ? 'w' : 'p', x.id); draw();
});
document.getElementById('fz-clear').addEventListener('click', () => { const L = faulted(); if (!L.length) return; snapshot(); for (const [x] of L) delete x.fault; say(`${L.length} fault${L.length > 1 ? 's' : ''} taken off`); draw(); });
document.getElementById('fz-on').addEventListener('click', () => { FAULTS_ON = !FAULTS_ON; showFaults(); say(FAULTS_ON ? 'Faults on: Run works the circuit with its faults' : 'Faults off: Run works the circuit as it should be'); });
document.getElementById('fz-badges').addEventListener('click', () => { FAULT_BADGES = !FAULT_BADGES; showFaults(); draw(); });
document.getElementById('fz-wo').addEventListener('input', e => { WORK_ORDER = e.target.value.slice(0, 400); if (typeof showFileLabel === 'function') showFileLabel(); });
// a red badge with a wrench, on a part (its top right) or a wire (its middle) with a fault planted on it
function faultBadge(x, y, g, tip) {
  const b = el('g', { class: 'fz-badge', transform: `translate(${x} ${y})`, 'pointer-events': 'none' }, g);
  el('circle', { r: 10, fill: '#C0392B', stroke: '#fff', 'stroke-width': 1.8 }, b);
  el('path', { d: 'M2.7-3.6a2.6 2.6 0 0 0-3.4 3.3L-4.4 3.4a1 1 0 0 0 1.4 1.4l3.7-3.7a2.6 2.6 0 0 0 3.3-3.4l-1.6 1.6-1.3-.3-.3-1.3z', fill: 'none', stroke: '#fff', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, b);
  if (tip) el('title', {}, b).textContent = tip;
  return b;
}
