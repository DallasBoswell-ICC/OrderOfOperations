/* =====================================================================
   process values
   Numbers the simulation keeps in the background (a cylinder's position, a receiver's pressure, an oven's
   temperature...), each with a kind, a unit, a range and a value to start at (PV, kept with the circuit). Limit,
   pressure and temperature switches can be worked by one (p.pv, its id) instead of by hand: a pressure or high
   temperature switch acts as its value rises to p.sp and resets once it falls back to p.rs; a low temperature switch
   the other way round; a limit switch acts at or above p.sp (p.side 'hi', end of travel out), or at or below it
   ('lo', home). While running, the Process window floats over the panel: each value, a slider and a readout to set it
   by. (For now the values change only as they are set there; later, outputs of the circuit will drive them.)
   ===================================================================== */
const PV_KINDS = {
  position: ['Position', ['in', 'ft', '%']], pressure: ['Pressure', ['psi', 'inHg', 'inH₂O']], temperature: ['Temperature', ['°F']],
  level: ['Level', ['in', 'ft', 'gal', '%']], flow: ['Flow', ['gpm', 'cfm']], speed: ['Speed', ['rpm', 'ft/min']], other: ['Other', []],
};
const PV_FOR = { lsw: 'position', psw: 'pressure', tsw: 'temperature' };   // (the kind of value each switch is worked by)
let PV = [], PVV = {}, PVACT = {};   // the values (with the circuit); while running, each one's value now, and which switches they are working
const pvOf = p => p && p.pv ? PV.find(v => v.id === p.pv) || null : null;
const pvLinked = p => isLim(p) && !!pvOf(p);
// (a switch that acts as its value falls: a low temperature switch, or a limit switch set to act at or below its setting)
const pvFalls = p => p.t === 'tsw' ? !!p.low : p.t === 'lsw' ? p.side === 'lo' : false;
const pvStep = v => { const r = Math.abs(v.max - v.min) || 1; return Math.pow(10, Math.floor(Math.log10(r)) - 2); };
const pvFmt = (v, x) => { const s = pvStep(v); return (s >= 1 ? Math.round(x) : +x.toFixed(Math.min(3, Math.round(-Math.log10(s))))).toString(); };   // (to the slider's step: 0.1 in on a 12 in stroke, 1 psi on 150 psi)
const pvFrac = p => { const v = isLim(p) ? pvOf(p) : null; if (!v) return null; const x = editing ? v.start : PVV[v.id] ?? v.start; return clamp01((x - v.min) / ((v.max - v.min) || 1)); };
// a new value: named after its kind, a range to suit it
function pvNew(kind = 'position') {
  const n = PV.filter(v => v.kind === kind).length + 1, name = PV_KINDS[kind][0] + (n > 1 ? ' ' + n : '');
  const R = { position: [0, 12, 0], pressure: [0, 150, 0], temperature: [32, 400, 70], level: [0, 100, 0], flow: [0, 50, 0], speed: [0, 1800, 0], other: [0, 100, 0] }[kind];
  return { id: 'v' + Math.random().toString(36).slice(2, 8), name, kind, unit: PV_KINDS[kind][1][0] || '', min: R[0], max: R[1], start: R[2] };
}
// a switch first linked to a value: settings to suit it (acting near the top of the range, or near the bottom)
function pvDefaults(p, v) {
  const r = v.max - v.min, s = pvStep(v), q = x => Math.round(x / s) * s;
  if (p.t === 'lsw') { p.sp = q(p.side === 'lo' ? v.min + r * .02 : v.max - r * .02); p.rs = p.sp; return; }
  if (pvFalls(p)) { p.sp = q(v.min + r * .2); p.rs = q(v.min + r * .25); } else { p.sp = q(v.min + r * .8); p.rs = q(v.min + r * .7); }
}
// is switch p worked, with its value at x (and having been worked or not until now)?
function pvWorks(p, x, was) {
  const sp = +p.sp, rs = p.t === 'lsw' ? sp : +p.rs;
  return pvFalls(p) ? (was ? x < rs : x <= sp) : (was ? x > rs : x >= sp);
}
// set value id to x (kept in its range): the switches it works act or reset as it passes their settings
function pvSet(id, x, t = simT) {
  const v = PV.find(q => q.id === id); if (!v) return;
  const lo = Math.min(v.min, v.max), hi = Math.max(v.min, v.max);
  PVV[id] = Math.max(lo, Math.min(hi, x)); needPaint = true;
  for (const p of parts) if (isLim(p) && p.pv === id) {
    const K = opKey(p), was = !!PVACT[K], now = pvWorks(p, PVV[id], was);
    if (now === was) continue;
    PVACT[K] = now; LSW_T[K] = t; if (t + LSW_MOVE > busyUntil) busyUntil = t + LSW_MOVE;
    switched(parts.filter(q => isLim(q) && opKey(q) === K), t);
  }
  showProcessValue(id);
}
/* Outputs that drive a value (isDrv): a solenoid (a valve: a cylinder moving, a tank filling or venting), a motor (a
   pump or compressor, a conveyor or lead screw: forward one way, reverse the other) and a heating element. Each one:
   p.pv the value, p.rate how fast while it works (p.per: 's' a second, 'min' a minute), p.dir 'up' (raises it; a
   motor, going forward) or 'down', and once it stops p.off 'hold' (the value stays where it is) or 'back' (back toward
   where it started, at p.cool: a spring return, a leak, an oven cooling). */
const isDrv = p => p.t === 'sol' || p.t === 'mtr' || p.t === 'htr';
const drvPer = p => p.per || (p.t === 'htr' ? 'min' : 's');
const drvOff = p => p.off || (p.t === 'htr' ? 'back' : 'hold');
const perSec = (p, x) => Math.max(0, +x || 0) / (drvPer(p) === 'min' ? 60 : 1);
// how fast p is moving its value right now (a second; + up, - down), or 0 while it is not working
function drvNow(p) {
  const sign = p.dir === 'down' ? -1 : 1;
  if (p.t === 'mtr') { const m = MOT[p.id]; return m && m.st === 'run' && m.dir ? sign * m.dir * perSec(p, p.rate) : 0; }
  return coilOn[p.id] ? (p.t === 'htr' ? 1 : sign) * perSec(p, p.rate) : 0;
}
// while running: every driven value moved on from t0 to t1 (simulation seconds): by all its working outputs together,
// within its range; with none of them working, back toward its start at the quickest of the ones that go back
// (real: the seconds that have really gone by, for values that change in real time whatever the circuit's speed)
let pvReal = false;
function pvTick(t0, t1, real) {
  pvVisAnim();
  const dt = pvReal ? real : t1 - t0; if (!(dt > 0) || !PV.length) return;
  for (const v of PV) {
    const ds = parts.filter(p => isDrv(p) && p.pv === v.id); if (!ds.length) continue;
    const x = PVV[v.id] ?? v.start, lo = Math.min(v.min, v.max), hi = Math.max(v.min, v.max), work = ds.map(drvNow);
    let nx = x;
    if (work.some(r => r)) nx = Math.max(lo, Math.min(hi, x + work.reduce((a, r) => a + r, 0) * dt));
    else { const bk = ds.filter(p => drvOff(p) === 'back'); if (bk.length) { const c = Math.max(...bk.map(p => perSec(p, p.cool))) * dt, a = v.start; nx = x > a ? Math.max(a, x - c) : Math.min(a, x + c); } }
    if (Math.abs(nx - x) > 1e-9 && !pvHeld(v.id)) pvSet(v.id, nx, t1);
  }
}
// an output first set to drive a value: settings to suit it (a stroke in about three seconds, a spring return; a
// compressor that fills its range in a minute and holds; an oven at 30 a minute, cooling at 10)
function drvDefaults(p, v) {
  const r = Math.abs(v.max - v.min) || 1, s = pvStep(v), q = x => Math.max(s, Math.round(x / s) * s);
  if (p.t === 'htr') { p.rate = 30; p.cool = 10; p.per = 'min'; p.off = 'back'; return; }
  if (p.t === 'sol') { p.per = 's'; p.rate = q(r / 3); p.cool = p.rate; p.off = v.kind === 'position' ? 'back' : 'hold'; }
  else { p.per = v.kind === 'position' ? 's' : 'min'; p.rate = q(v.kind === 'position' ? r / 5 : r); p.cool = q(r / 10); p.off = 'hold'; }
  p.dir = 'up';
}
const drvText = (p, v) => { const u = v.unit ? ' ' + v.unit : '', per = drvPer(p) === 'min' ? '/min' : '/s', tag = (p.t === 'htr' ? 'HTR' : p.t === 'mtr' ? 'MTR' : 'SOL') + p.L;
  const how = p.t === 'mtr' ? (p.dir === 'down' ? 'forward −, reverse +' : 'forward +, reverse −') : (p.t !== 'htr' && p.dir === 'down' ? '−' : '+');
  return `${tag} (${p.t === 'mtr' ? how + ' ' : how}${pvFmt(v, +p.rate || 0)}${u}${per}${drvOff(p) === 'back' ? `, back ${pvFmt(v, +p.cool || 0)}${u}${per} when off` : ''})`; };
// (a value being dragged in the Process window is left where the slider is, until it is let go)
const pvHeld = id => { const r = procEl && procEl.querySelector(`[data-pv="${id}"]`); return !!r && (document.activeElement === r.querySelector('.pvval') || r.dataset.drag === '1'); };
// at the start of a run (and on Reset): every value back to where it starts, and the switches it works with it
function pvStartRun() {
  PVV = {}; PVACT = {};
  for (const v of PV) PVV[v.id] = v.start;
  for (const p of parts) if (pvLinked(p)) PVACT[opKey(p)] = pvWorks(p, PVV[p.pv], false);
}
const pvDrvText = v => parts.filter(p => isDrv(p) && p.pv === v.id).sort((a, b) => a.t.localeCompare(b.t) || a.L - b.L).map(p => drvText(p, v)).join(', ');
const pvLinksText = v => parts.filter(p => isLim(p) && p.pv === v.id).sort((a, b) => a.t.localeCompare(b.t) || a.L - b.L).map(p => {
  const tag = (p.t === 'tsw' ? 'TS' : p.t === 'psw' ? 'PS' : 'LS') + p.L, u = v.unit ? ' ' + v.unit : '';
  if (p.t === 'lsw') return `${tag} at ${p.side === 'lo' ? '≤' : '≥'} ${pvFmt(v, +p.sp)}${u}`;
  return `${tag} at ${pvFalls(p) ? '≤' : '≥'} ${pvFmt(v, +p.sp)}${u}, resets at ${pvFmt(v, +p.rs)}${u}`;
}).join(' · ');

/* ---------------- the Process window (Run) ---------------- */
const PROC_KEY = 'oo-circuit-builder:process';
let PW = { x: null, y: null, w: null, h: null, min: false, hidden: false };   // (w, h: its size, when it has been resized; its contents grow with its width)
const PW_W = 600;   // (its usual width)
try { Object.assign(PW, JSON.parse(localStorage.getItem(PROC_KEY) || '{}')); } catch (_) {}
const savePW = () => { try { localStorage.setItem(PROC_KEY, JSON.stringify(PW)); } catch (_) {} };
const procEl = document.getElementById('procwin'), pwBody = procEl.querySelector('.pw-body');
function buildProcess() {
  const list = document.getElementById('pw-list'); list.innerHTML = '';
  for (const v of PV) {
    const row = document.createElement('div'); row.className = 'pv'; row.dataset.pv = v.id;
    const lo = Math.min(v.min, v.max), hi = Math.max(v.min, v.max);
    row.innerHTML = `<svg class="pvvis" viewBox="0 0 96 56" aria-hidden="true"></svg><div class="pvmain"><div class="pvtop"><span class="pvname"></span><input type="text" class="pvval" inputmode="decimal" autocomplete="off" spellcheck="false"><span class="pvunit"></span></div>
      <div class="pvbar"><span class="pvlo"></span><input type="range" class="pvslide"><span class="pvhi"></span></div><div class="pvlinks"></div></div>`;
    pvVisDraw(row.querySelector('.pvvis'), v);
    row.querySelector('.pvname').textContent = v.name; row.querySelector('.pvunit').textContent = v.unit;
    row.querySelector('.pvlo').textContent = pvFmt(v, lo); row.querySelector('.pvhi').textContent = pvFmt(v, hi);
    const sl = row.querySelector('.pvslide'), box = row.querySelector('.pvval');
    sl.min = lo; sl.max = hi; sl.step = pvStep(v); sl.setAttribute('aria-label', v.name);
    box.setAttribute('aria-label', `${v.name} (type a value and press Enter)`);
    sl.addEventListener('input', () => pvSet(v.id, +sl.value));
    sl.addEventListener('pointerdown', () => { row.dataset.drag = '1'; }); for (const ev of ['pointerup', 'pointercancel', 'change']) sl.addEventListener(ev, () => { delete row.dataset.drag; });
    box.addEventListener('focus', () => box.select());
    box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') box.blur(); else if (e.key === 'Escape') { box.dataset.cancel = '1'; box.blur(); } });
    box.addEventListener('blur', () => { const x = parseFloat(box.value.replace(',', '.')); if (!box.dataset.cancel && isFinite(x)) pvSet(v.id, x); delete box.dataset.cancel; showProcessValue(v.id); });
    const ln = pvLinksText(v), ht = pvDrvText(v); row.querySelector('.pvlinks').textContent = [ht && 'Driven by ' + ht, ln ? 'Works ' + ln : !ht && 'Works no switch yet'].filter(Boolean).join(' · ');
    list.append(row); showProcessValue(v.id);
  }
  showProcess();
}
function showProcessValue(id) {
  const row = procEl.querySelector(`[data-pv="${id}"]`), v = PV.find(q => q.id === id); if (!row || !v) return;
  const x = PVV[id] ?? v.start, sl = row.querySelector('.pvslide'), box = row.querySelector('.pvval');
  if (document.activeElement !== sl) sl.value = x;
  if (document.activeElement !== box) box.value = pvFmt(v, x);
  pvVisSet(row.querySelector('.pvvis'), v, x);
}
function showProcess() {
  const on = !editing && PV.length > 0;
  procEl.hidden = !on || PW.hidden;
  procEl.classList.toggle('min', !!PW.min);
  const t = document.getElementById('pv-toggle');
  t.setAttribute('aria-pressed', String(on && !PW.hidden)); document.getElementById('pv-run-group').hidden = editing || !PV.length;
  document.getElementById('pv-time-group').hidden = editing || !PV.length;
  document.getElementById('pw-min').setAttribute('aria-label', PW.min ? 'Open the Process window' : 'Fold the Process window to its title bar');
  if (!procEl.hidden) placeProcess();
}
function placeProcess() {
  // its width (everything inside drawn bigger or smaller with it), then where it is
  const w = Math.max(360, Math.min(PW.w ?? PW_W, window.innerWidth - 8)), z = w / PW_W;
  procEl.style.width = w + 'px'; pwBody.style.zoom = Math.abs(z - 1) < .001 ? '' : z;
  const r = procEl.getBoundingClientRect(), st = svg.getBoundingClientRect();
  let x = PW.x ?? st.left + 16, y = PW.y ?? st.top + 16;   // (first time: the top left of the panel, clear of the station)
  x = Math.max(0, Math.min(x, window.innerWidth - Math.min(r.width, window.innerWidth))); y = Math.max(0, Math.min(y, window.innerHeight - 34));
  procEl.style.left = x + 'px'; procEl.style.top = y + 'px';
  // its height: the list as tall as asked, or as its values; either way it scrolls rather than running off the bottom of the window
  const list = document.getElementById('pw-list'), head = document.getElementById('pw-head').offsetHeight,
        rest = pwBody.getBoundingClientRect().height - list.getBoundingClientRect().height,   // (the screen's frame and the foot, as drawn)
        room = Math.max(60, (window.innerHeight - y - head - rest - 8) / z);
  list.style.height = PW.h != null ? Math.max(60, Math.min((PW.h - head - rest) / z, room)) + 'px' : '';
  list.style.maxHeight = room + 'px';
}
addGrips(procEl, {
  start: () => ({}),
  size: (d, w, h) => {
    if (/[ew]/.test(d)) PW.w = Math.round(Math.max(360, Math.min(w, window.innerWidth - 8)));
    if (/[ns]/.test(d)) PW.h = Math.round(Math.max(160, h));
    placeProcess();
  },
  move: (x, y) => { PW.x = x; PW.y = y; placeProcess(); },
  done: () => { const q = procEl.getBoundingClientRect(); PW.x = q.left; PW.y = q.top; savePW(); },
  reset: () => { PW.w = PW.h = null; placeProcess(); savePW(); }
});
document.getElementById('pw-head').addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('button')) return;
  e.preventDefault();
  const r = procEl.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, h = e.currentTarget;
  try { h.setPointerCapture(e.pointerId); } catch (_) {}
  const mv = ev => { PW.x = ev.clientX - dx; PW.y = ev.clientY - dy; placeProcess(); };
  const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); const q = procEl.getBoundingClientRect(); PW.x = q.left; PW.y = q.top; savePW(); };
  h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
});
document.getElementById('pw-min').addEventListener('click', () => { PW.min = !PW.min; savePW(); showProcess(); });
document.getElementById('pv-toggle').addEventListener('click', () => { PW.hidden = !PW.hidden; savePW(); showProcess(); });
// how the values change: at the circuit's speed, or in real time (remembered in this browser)
function setPvReal(v) { pvReal = v; for (const b of document.querySelectorAll('[data-preal]')) b.setAttribute('aria-pressed', String(+b.dataset.preal === +v)); try { localStorage.setItem('oo-circuit-builder:process-real', v ? '1' : '0'); } catch (_) {} }
for (const b of document.querySelectorAll('[data-preal]')) b.addEventListener('click', () => setPvReal(b.dataset.preal === '1'));
try { if (localStorage.getItem('oo-circuit-builder:process-real') === '1') setPvReal(true); } catch (_) {}
document.getElementById('pw-reset').addEventListener('click', () => { for (const v of PV) pvSet(v.id, v.start); });
window.addEventListener('resize', () => { if (!procEl.hidden) placeProcess(); });

/* ---------------- the pictures in the Process window ----------------
   Beside each value, a small picture of it, in the builder's style, following it as it changes: a position, an air
   cylinder, its rod out as far along its stroke; a pressure, a receiver filling with colour, a little gauge on top; a
   temperature, an oven warming inside, its element glowing; a level, a tank and its liquid; a flow, a pipe, arrows moving
   along it as fast as it flows; a speed, a wheel turning as fast; anything else, a bar. */
const VIS_COL = { position: '#cfd3d8', pressure: '#FF9C37', temperature: '#FF3333', level: '#3F9BFF', flow: '#5ee08a', speed: '#cfd3d8', other: '#5ee08a' };
function pvVisDraw(s, v) {
  const q = {}, defs = el('defs', {}, s), id = 'pvm' + v.id, box = (x, y, w, h, rx) => el('rect', { x, y, width: w, height: h, rx, fill: '#2a2d31', stroke: '#9aa6b2', 'stroke-width': 1.2 }, s);
  const mg = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs); for (const [o, c] of [[0, '#e8e8e8'], [.5, '#9a9a9a'], [1, '#5a5a5a']]) el('stop', { offset: o, 'stop-color': c }, mg);
  const k = v.kind;
  if (k === 'position') {   // (the barrel, its end caps; the piston seen through it; the rod and its end)
    el('rect', { x: 8, y: 18, width: 50, height: 20, rx: 3, fill: `url(#${id})`, stroke: '#111', 'stroke-width': 1 }, s);
    for (const x of [5, 54]) el('rect', { x, y: 16, width: 6, height: 24, rx: 1.5, fill: '#555', stroke: '#111' }, s);
    q.piston = el('rect', { x: 12, y: 19, width: 4, height: 18, fill: '#3a3a3a' }, s);
    q.rod = el('rect', { x: 60, y: 25, width: 4, height: 6, fill: '#cfd3d8', stroke: '#111', 'stroke-width': .8 }, s);
    q.end = el('rect', { x: 64, y: 21, width: 6, height: 14, rx: 1.5, fill: '#8a96a3', stroke: '#111' }, s);
  } else if (k === 'pressure') {
    box(12, 22, 62, 28, 14); const c = el('clipPath', { id: id + 'c' }, defs); el('rect', { x: 12, y: 22, width: 62, height: 28, rx: 14 }, c);
    q.fill = el('rect', { x: 12, y: 22, width: 62, height: 28, fill: VIS_COL.pressure, 'clip-path': `url(#${id}c)`, opacity: .15 }, s);
    el('rect', { x: 40, y: 13, width: 4, height: 9, fill: '#777' }, s); el('circle', { cx: 42, cy: 10, r: 7.5, fill: '#e6e6e6', stroke: '#555' }, s);
    q.needle = el('line', { x1: 42, y1: 10, x2: 42, y2: 10, stroke: '#c00', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, s);
    el('rect', { x: 78, y: 33, width: 13, height: 5, fill: '#555' }, s);
  } else if (k === 'temperature') {
    box(8, 8, 68, 42, 4); q.inside = el('rect', { x: 13, y: 13, width: 50, height: 32, rx: 2, fill: '#1e1e1e' }, s);
    q.element = el('path', { d: 'M17 40 L21 36 L25 40 L29 36 L33 40 L37 36 L41 40 L45 36 L49 40 L53 36 L57 40 L59 38', fill: 'none', stroke: '#555', 'stroke-width': 2, 'stroke-linejoin': 'round' }, s);
    el('rect', { x: 66, y: 13, width: 7, height: 32, rx: 3.5, fill: '#555' }, s);
    q.col = el('rect', { x: 67.5, y: 43, width: 4, height: 1, fill: VIS_COL.temperature }, s);
  } else if (k === 'level') {
    box(24, 6, 46, 46, 4); const c = el('clipPath', { id: id + 'c' }, defs); el('rect', { x: 25, y: 7, width: 44, height: 44, rx: 3 }, c);
    q.liquid = el('path', { d: '', fill: VIS_COL.level, opacity: .85, 'clip-path': `url(#${id}c)` }, s);
  } else if (k === 'flow') {
    box(4, 21, 88, 14, 3); const c = el('clipPath', { id: id + 'c' }, defs); el('rect', { x: 5, y: 22, width: 86, height: 12 }, c);
    q.arrows = el('g', { 'clip-path': `url(#${id}c)` }, s); q.ag = el('g', {}, q.arrows);
    for (let x0 = -10; x0 < 100; x0 += 22) el('path', { d: `M${x0} 24.5 l7 3.5 -7 3.5`, fill: 'none', stroke: VIS_COL.flow, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, q.ag);
    q.phase = 0;
  } else if (k === 'speed') {
    el('circle', { cx: 48, cy: 28, r: 21, fill: '#2a2d31', stroke: '#9aa6b2', 'stroke-width': 1.2 }, s);
    q.wheel = el('g', {}, s); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; el('line', { x1: 48, y1: 28, x2: 48 + 17 * Math.cos(a), y2: 28 + 17 * Math.sin(a), stroke: '#cfd3d8', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, q.wheel); }
    el('circle', { cx: 48, cy: 28, r: 4, fill: '#8a96a3' }, s); q.phase = 0;
  } else {
    box(8, 22, 80, 12, 3); q.bar = el('rect', { x: 10, y: 24, width: 0, height: 8, rx: 2, fill: VIS_COL.other }, s);
  }
  s._q = q; s._k = k;
}
// where value v at x stands in its range, 0 to 1, shown in its picture
function pvVisSet(s, v, x) {
  if (!s || !s._q) return; const q = s._q, f = clamp01((x - Math.min(v.min, v.max)) / (Math.abs(v.max - v.min) || 1)); s._f = f;
  if (s._k === 'position') { const r = 4 + 28 * f; q.rod.setAttribute('width', r.toFixed(2)); q.end.setAttribute('x', (60 + r).toFixed(2)); q.piston.setAttribute('x', (12 + 38 * f).toFixed(2)); }
  else if (s._k === 'pressure') { q.fill.setAttribute('opacity', (.15 + .75 * f).toFixed(3)); const a = (135 + 270 * f) * Math.PI / 180; q.needle.setAttribute('x2', (42 + 5.5 * Math.cos(a)).toFixed(2)); q.needle.setAttribute('y2', (10 + 5.5 * Math.sin(a)).toFixed(2)); }
  else if (s._k === 'temperature') {
    q.inside.setAttribute('fill', mixRgb('#1e1e1e', '#ff7a1f', f * .85)); q.element.setAttribute('stroke', mixRgb('#555555', '#ff5a1f', Math.min(1, f * 1.6)));
    const h = 30 * f + 1; q.col.setAttribute('y', (44 - h).toFixed(2)); q.col.setAttribute('height', h.toFixed(2));
  } else if (s._k === 'level') { const y = (51 - 44 * f).toFixed(2); q.liquid.setAttribute('d', `M24 ${y} q5.5 -2 11 0 t11 0 t11 0 t11 0 V52 H24 Z`); }
  else if (s._k === 'other') q.bar.setAttribute('width', (76 * f).toFixed(2));
}
// (flow and speed: moving with the value, by the clock, while the circuit runs)
let visT = 0;
function pvVisAnim() {
  const now = performance.now(), dt = visT ? Math.min(.1, (now - visT) / 1000) : 0; visT = now;
  if (!dt || editing || procEl.hidden) return;
  for (const s of procEl.querySelectorAll('.pvvis')) {
    const q = s._q, f = s._f || 0; if (!q || !f) continue;
    if (s._k === 'flow') { q.phase = (q.phase + f * 44 * dt) % 22; q.ag.setAttribute('transform', `translate(${q.phase.toFixed(2)} 0)`); }
    if (s._k === 'speed') { q.phase = (q.phase + f * 540 * dt) % 360; q.wheel.setAttribute('transform', `rotate(${q.phase.toFixed(1)} 48 28)`); }
  }
}

/* ---------------- setting the values up (Build: Process values on the Home tab) ---------------- */
const pvDlg = document.getElementById('pv-dlg');
function buildPvDialog() {
  const tb = document.getElementById('pv-rows'); tb.innerHTML = '';
  for (const v of PV) {
    const tr = document.createElement('tr');
    const units = PV_KINDS[v.kind][1];
    tr.innerHTML = `<td><input class="pvin w12" data-f="name" maxlength="30"></td>
      <td><select class="pvin" data-f="kind">${Object.entries(PV_KINDS).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join('')}</select></td>
      <td>${units.length ? `<select class="pvin" data-f="unit">${units.map(u => `<option>${u}</option>`).join('')}</select>` : '<input class="pvin w5" data-f="unit" maxlength="8" placeholder="unit">'}</td>
      <td><input class="pvin w5" data-f="min" inputmode="decimal"></td><td><input class="pvin w5" data-f="max" inputmode="decimal"></td><td><input class="pvin w5" data-f="start" inputmode="decimal"></td>
      <td><button type="button" class="pvdel" aria-label="Remove ${v.name.replace(/"/g, '')}" data-tip="Remove this value (switches it worked go back to being clicked by hand)">✕</button></td>`;
    for (const f of tr.querySelectorAll('[data-f]')) {
      f.value = v[f.dataset.f];
      f.addEventListener('change', () => {
        const k = f.dataset.f;
        if (k === 'name') v.name = f.value.trim() || PV_KINDS[v.kind][0];
        else if (k === 'kind') { v.kind = f.value; v.unit = PV_KINDS[v.kind][1][0] || ''; for (const p of parts) if (p.pv === v.id && (isLim(p) ? PV_FOR[p.t] !== v.kind : p.t === 'htr' && v.kind !== 'temperature')) unlinkPv(p); }
        else if (k === 'unit') v.unit = f.value.trim().slice(0, 8);
        else { const x = parseFloat(f.value.replace(',', '.')); if (isFinite(x)) v[k] = x; }
        if (k === 'min' || k === 'max') v.start = Math.max(Math.min(v.min, v.max), Math.min(Math.max(v.min, v.max), v.start));
        buildPvDialog(); draw(); if (sel) renderProps();
      });
    }
    tr.querySelector('.pvdel').addEventListener('click', () => { snapshot(); PV = PV.filter(q => q !== v); for (const p of parts) if (p.pv === v.id) unlinkPv(p); buildPvDialog(); draw(); if (sel) renderProps(); });
    tb.append(tr);
  }
  document.getElementById('pv-none').hidden = PV.length > 0;
}
function unlinkPv(p) { delete p.pv; delete p.sp; delete p.rs; delete p.side; }
document.getElementById('pv-btn').addEventListener('click', () => { snapshot(); buildPvDialog(); pvDlg.showModal(); });
document.getElementById('pv-add').addEventListener('click', () => { PV.push(pvNew(document.getElementById('pv-add-kind').value)); buildPvDialog(); const r = document.querySelectorAll('#pv-rows tr'); r[r.length - 1]?.querySelector('[data-f="name"]')?.focus(); });
pvDlg.addEventListener('close', () => { draw(); if (sel) renderProps(); });
