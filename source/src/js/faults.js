/* ---------------- faults (troubleshooting, stage 1) ----------------
   The Faults tab (Build): pick a part or wire on the panel and plant a fault on it (open, or shorted; a wire, open or
   shorted to L2), or plant one at random; the planted faults listed (click one to pick it, ✕ to take it off); Faults
   On in Run (off: Run works the circuit as it should be); red badges on the faulted parts and wires; and the work
   order the student is given. A part's own tab has its Fault too. See constants.js for what each fault does. */
// ---- scenarios
const scenAll = () => [...parts, ...wires];
function scenSync() {   // (the faults in force kept with their scenario)
  for (const x of scenAll()) { if (x.fault) (x.fz || (x.fz = {}))[SCEN] = x.fault; else if (x.fz) delete x.fz[SCEN]; if (x.fz && !Object.keys(x.fz).length) delete x.fz; }
  SCEN_WO[SCEN] = WORK_ORDER;
}
function scenUse(n) {   // (scenario n in force: its faults and its work order)
  for (const x of scenAll()) { const f = x.fz && x.fz[n]; if (f) x.fault = f; else delete x.fault; }
  SCEN = n; WORK_ORDER = SCEN_WO[n] || '';
}
// the scenarios of a circuit just read (readCircuit's sn, si, swo, ffo), or one scenario
function scenFrom(c) { SCEN_N = c.sn || 1; SCEN = Math.min(c.si || 0, SCEN_N - 1); SCEN_WO = c.swo ? [...c.swo] : [c.wo || '']; FF_OFFER = c.ffo ? { ...c.ffo } : { r: true, n: true }; WORK_ORDER = SCEN_WO[SCEN] || ''; }
function scenGo(n) { if (n === SCEN || n < 0 || n >= SCEN_N) return; scenSync(); scenUse(n); say(`Scenario ${n + 1}: its faults are in force (Run uses them)`); draw(); }
const faultName = (x, isW) => (isW ? WIRE_FAULTS : PART_FAULTS)[x.fault] || '';
// where a fault is, in words: a part by its caption, a wire by its rung number when it has one (or where it runs)
function faultWhere(x, isW) {
  if (!isW) return captionOf(x);
  let r = null; try { if (NET) r = rungAt(rungYs(NET), x.y1 === x.y2 ? x.y1 : Math.min(x.y1, x.y2)); } catch (_) {}
  return `Wire on line ${r || '?'}${x.y1 === x.y2 ? '' : ' (up and down)'}`;
}
/* Faults that would do nothing (Dallas, 15 Nov 2026: a short on a wire that "doesn't do anything, and just messes up the
   circuit flow") are not offered: why one cannot be planted there, in words, or '' if it can.
   - a wire shorted to L2 that is already L2 (joined to it by wire alone, past every load): it changes nothing
   - a wire shorted to L2 in the three-phase power circuit (the control circuit's L2 is not in it)
   - a fuse shorted: it would still pass current and read 0 Ω like a good one, so nothing could ever find it */
function faultWhy(x, isW, f) {
  if (!f) return '';
  if (!isW) return (x.t === 'mtr') !== MTR_FAULTS.includes(f) ? '!' : f === 'short' && x.t === 'fu1' ? 'A shorted fuse works like a good one: there would be nothing to find' : '';   // ('!': not a fault this kind of part can have: not offered)
  if (f !== 'l2') return '';
  const was = FAULTS_ON; FAULTS_ON = false; let net; try { net = network(); } finally { FAULTS_ON = was; }
  const idx = new Map(net.nodes.map((n, i) => [n.k, i])), k = key(x.x1, x.y1), n = idx.get(k) ?? idx.get(k + '#' + x.id);
  if (n === undefined) return '';
  const fw = components(net, e => e.kind === 'w');
  if (fw(n) === fw(net.L2)) return 'This wire is already L2: shorting it to L2 would change nothing';
  const fp = components(net, e => e.kind === 'w' || (e.part && e.part.t === 'pp'));
  if (Object.values(net.PH).some(h => fp(h) === fp(n))) return 'This wire is in the three-phase power circuit, apart from the control circuit\u2019s L2';
  return '';
}
const faultsFor = (x, isW) => Object.keys(isW ? WIRE_FAULTS : PART_FAULTS).filter(f => !faultWhy(x, isW, f));
const faulted = () => [...parts.filter(p => p.fault).map(p => [p, false]), ...wires.filter(w => w.fault).map(w => [w, true])];
// the one part or wire picked, if a fault can be planted on it
function faultTarget() {
  if (!sel || sel.parts.size + sel.wires.size !== 1 || (sel.terms && sel.terms.size)) return null;
  if (sel.parts.size) { const p = parts.find(q => sel.parts.has(q.id)); return canFault(p) ? [p, false] : null; }
  const w = wires.find(q => sel.wires.has(q.id)); return w ? [w, true] : null;
}
function setFault(x, isW, f) {
  if ((x.fault || '') === (f || '')) return;
  const why = faultWhy(x, isW, f); if (why) { say(why); return; }
  snapshot(); if (f) x.fault = f; else delete x.fault;
  say(f ? `${faultWhere(x, isW)}: ${(isW ? WIRE_FAULTS : PART_FAULTS)[f]} (planted)` : `${faultWhere(x, isW)}: fault taken off`);
  draw();
}
function showFaults() {
  const t = faultTarget(), what = document.getElementById('fz-what'), kinds = document.getElementById('fz-kinds');
  what.textContent = t ? faultWhere(...t) : sel && selCount() ? 'Pick one part or wire (this one cannot have a fault)' : 'Pick a part or wire on the panel';
  what.classList.toggle('none', !t);
  const opts = t ? { '': 'None', ...(t[1] ? WIRE_FAULTS : PART_FAULTS) } : { '': 'None', ...PART_FAULTS };
  kinds.innerHTML = Object.entries(opts).filter(([k]) => !(t ? t && k && faultWhy(t[0], t[1], k) === '!' : MTR_FAULTS.includes(k))).map(([k, n]) => { const why = t && k ? faultWhy(t[0], t[1], k) : '';
    return `<button type="button" data-fz="${k}" aria-pressed="${t ? String((t[0].fault || '') === k) : 'false'}"${!t || why ? ' disabled' : ''}${why ? ` data-tip="${why.replace(/"/g, '&quot;')}"` : ''}>${n}</button>`; }).join('');
  const L = faulted(), list = document.getElementById('fz-list');
  list.innerHTML = L.length ? L.map(([x, w], i) => `<div class="fz-row" data-i="${i}">${i + 1}. ${String(faultWhere(x, w)).replace(/&/g, '&amp;').replace(/</g, '&lt;')}<b>${faultName(x, w)}</b><button type="button" data-x="${i}" aria-label="Take this fault off">✕</button></div>`).join('') : '<div class="none">None yet: pick a part or wire, then a fault</div>';
  document.getElementById('fz-clear').disabled = !L.length;
  document.getElementById('fz-on').setAttribute('aria-pressed', String(FAULTS_ON));
  document.getElementById('fz-badges').setAttribute('aria-pressed', String(FAULT_BADGES));
  const wo = document.getElementById('fz-wo'); if (document.activeElement !== wo) wo.value = WORK_ORDER;
  const n = L.length; document.getElementById('rt-faults').textContent = SCEN_N > 1 ? `Faults (${SCEN_N} Scenarios)` : n ? `Faults (${n})` : 'Faults';
  document.getElementById('fz-scen').innerHTML = [...Array(SCEN_N).keys()].map(i => `<button type="button" data-sc="${i}" aria-pressed="${i === SCEN}" data-tip="Scenario ${i + 1}: show its faults and work order">${i + 1}</button>`).join('');
  document.getElementById('fz-scen-del').disabled = SCEN_N < 2;
  document.getElementById('fz-off-r').checked = FF_OFFER.r; document.getElementById('fz-off-n').checked = FF_OFFER.n;
  for (const id of ['fz-off-r', 'fz-off-n']) document.getElementById(id).disabled = SCEN_N < 2;
  document.querySelector('.fz-offer').classList.toggle('dim', SCEN_N < 2);
}
// the Fault on a part's own tab (one part picked, or several of one kind)
function showPartFault(G) {
  const g = document.getElementById('p-fault-group'), s = document.getElementById('p-fault'), ok = G.length && G.every(canFault);
  g.hidden = !ok; if (!ok) return;
  const same = G.every(p => (p.fault || '') === (G[0].fault || ''));
  s.innerHTML = (same ? '' : '<option value="__">(several)</option>') + Object.entries({ '': 'None', ...PART_FAULTS }).filter(([k]) => !k || !G.some(p => faultWhy(p, false, k) === '!')).map(([k, n]) => { const why = k && G.some(p => faultWhy(p, false, k)); return `<option value="${k}"${why ? ' disabled' : ''}>${n}${why ? ' (not on a fuse)' : ''}</option>`; }).join('');
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
  const ok = all.filter(([x, w]) => faultsFor(x, w).length); if (!ok.length) { say('Nothing left to plant a fault on'); return; }
  const [x, isW] = ok[Math.floor(Math.random() * ok.length)], ks = faultsFor(x, isW);   // (only faults that would do something)
  setFault(x, isW, ks[Math.floor(Math.random() * ks.length)]);
  sel = selOne(isW ? 'w' : 'p', x.id); draw();
});
document.getElementById('fz-clear').addEventListener('click', () => { const L = faulted(); if (!L.length) return; snapshot(); for (const [x] of L) delete x.fault; say(`${L.length} fault${L.length > 1 ? 's' : ''} taken off`); draw(); });
document.getElementById('fz-on').addEventListener('click', () => { FAULTS_ON = !FAULTS_ON; showFaults(); say(FAULTS_ON ? 'Faults on: Run works the circuit with its faults' : 'Faults off: Run works the circuit as it should be'); });
document.getElementById('fz-badges').addEventListener('click', () => { FAULT_BADGES = !FAULT_BADGES; showFaults(); draw(); });
document.getElementById('fz-scen').addEventListener('click', e => { const b = e.target.closest('[data-sc]'); if (b) scenGo(+b.dataset.sc); });
document.getElementById('fz-scen-new').addEventListener('click', () => {
  if (SCEN_N >= 20) return say('Twenty scenarios is the most one circuit can have');
  snapshot(); scenSync(); SCEN_N++; SCEN_WO[SCEN_N - 1] = ''; scenUse(SCEN_N - 1);
  say(`Scenario ${SCEN_N}: a new one, with no faults yet. Plant its faults and write its work order.`); draw();
});
document.getElementById('fz-scen-del').addEventListener('click', () => {
  if (SCEN_N < 2) return; snapshot(); scenSync(); const k = SCEN;
  for (const x of scenAll()) if (x.fz) { const o = {}; for (const s in x.fz) { const i = +s; if (i < k) o[i] = x.fz[s]; else if (i > k) o[i - 1] = x.fz[s]; } if (Object.keys(o).length) x.fz = o; else delete x.fz; }
  SCEN_WO.splice(k, 1); SCEN_N--; scenUse(Math.min(k, SCEN_N - 1));
  say(`Scenario ${k + 1} deleted: the others are numbered 1 to ${SCEN_N}`); draw();
});
for (const [id, k] of [['fz-off-r', 'r'], ['fz-off-n', 'n']]) document.getElementById(id).addEventListener('change', e => {
  FF_OFFER[k] = e.target.checked; if (!FF_OFFER.r && !FF_OFFER.n) { FF_OFFER[k] = true; say('The Fault Finder has to offer at least one of the two'); }
  showFaults(); if (typeof showFileLabel === 'function') showFileLabel();
});
document.getElementById('fz-wo').addEventListener('input', e => { WORK_ORDER = e.target.value.slice(0, 400); if (typeof showFileLabel === 'function') showFileLabel(); });
// a red badge with a wrench, on a part (its top right) or a wire (its middle) with a fault planted on it
function faultBadge(x, y, g, tip) {
  const b = el('g', { class: 'fz-badge', transform: `translate(${x} ${y})`, 'pointer-events': 'none' }, g);
  el('circle', { r: 10, fill: '#C0392B', stroke: '#fff', 'stroke-width': 1.8 }, b);
  el('path', { d: 'M2.7-3.6a2.6 2.6 0 0 0-3.4 3.3L-4.4 3.4a1 1 0 0 0 1.4 1.4l3.7-3.7a2.6 2.6 0 0 0 3.3-3.4l-1.6 1.6-1.3-.3-.3-1.3z', fill: 'none', stroke: '#fff', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, b);
  if (tip) el('title', {}, b).textContent = tip;
  return b;
}
