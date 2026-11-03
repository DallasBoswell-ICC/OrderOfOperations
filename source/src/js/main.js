/* ---------------- build / run ---------------- */
function afterRunStart() { buildStation(); document.getElementById('mode-group').hidden = !parts.some(p => (p.t === 'btn' && !p.maint) || isLim(p)); document.getElementById('timer-group').hidden = !parts.some(isTimer); paint(); }
function setMode(run) {
  editing = !run;
  document.getElementById('tab-edit').setAttribute('aria-selected', String(!run));
  document.getElementById('tab-run').setAttribute('aria-selected', String(run));
  closeMenus(); showRibbon(); if (!run) buildStation();
  showViewMode(); showOverview(); if (run && viewMode === 'split') splitStart();
  document.getElementById('fault').hidden = true;
  sel = null; preview = null; setTool('select');
  if (cam.fit) { fit(true); fitView(); }
  if (run) { NET = network(); draw(); startRun(); afterRunStart(); } else draw();
}
document.getElementById('tab-edit').addEventListener('click', () => setMode(false));
document.getElementById('tab-run').addEventListener('click', () => setMode(true));
document.getElementById('reset-btn').addEventListener('click', () => { startRun(); paint(); });
/* Speed: the preset buttons, or the slider for any speed from 0.1× to 300× (on a log scale: every step along it
   makes the circuit the same proportion faster). Turned right up, a change runs through the whole circuit in a
   blink, as it does in a real panel. */
const SPEED_SNAPS = [0.25, 0.5, 1, 2, 10, 50, 100, 200, 300];
const SPEED_MIN = 0.1, SPEED_MAX = 300, sliderOf = s => 100 * Math.log10(s / SPEED_MIN) / Math.log10(SPEED_MAX / SPEED_MIN);
const fmtSpeed = s => (s < 1 ? +s.toFixed(2) : s < 10 ? +s.toFixed(1) : Math.round(s)) + '×';
function setSpeed(s, fromSlider) {
  speed = s;
  for (const sl of document.querySelectorAll('.speed-slider')) if (sl !== fromSlider) sl.value = sliderOf(s);   // (the Simulation tab's and the operator station's)
  for (const o of document.querySelectorAll('.speed-box')) if (document.activeElement !== o) o.value = fmtSpeed(s);   // (the Simulation tab's and the operator station's)
  document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-pressed', String(Math.abs(+x.dataset.speed - s) < 1e-9)));
}
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
// how timers count: at the simulation's speed, or in real time (remembered in this browser)
function setTimersReal(v) {
  timersReal = v; retimeTimers();
  document.querySelectorAll('[data-treal]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.treal === +v)));
  try { localStorage.setItem('oo-circuit-builder:timers-real', v ? '1' : '0'); } catch (_) {}
}
document.querySelectorAll('[data-treal]').forEach(b => b.addEventListener('click', () => setTimersReal(b.dataset.treal === '1')));
try { if (localStorage.getItem('oo-circuit-builder:timers-real') === '1') setTimersReal(true); } catch (_) {}
// a speed typed in (Enter, or leaving the box): any from SPEED_MIN to SPEED_MAX; anything else puts the box back
document.querySelectorAll('.speed-box').forEach(speedBox => {
speedBox.addEventListener('focus', () => { speedBox.value = String(+speed.toFixed(3)); speedBox.select(); });
speedBox.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') speedBox.blur(); else if (e.key === 'Escape') { speedBox.value = fmtSpeed(speed); speedBox.dataset.cancel = '1'; speedBox.blur(); } });
speedBox.addEventListener('blur', () => {
  const v = parseFloat(speedBox.value.replace(',', '.').replace(/[x×]/gi, ''));
  if (!speedBox.dataset.cancel && isFinite(v) && v > 0) setSpeed(Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)));
  delete speedBox.dataset.cancel; speedBox.value = fmtSpeed(speed);
});
});
document.querySelectorAll('.speed-slider').forEach(sl => sl.addEventListener('input', e => {
  let s = SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, +e.target.value / 100);
  // it snaps to the round speeds when close to one (within about 13%: from 9× it lands on 10×)
  for (const k of SPEED_SNAPS) if (Math.abs(Math.log(s / k)) < 0.13) s = k;
  setSpeed(s, e.target);
}));
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  mode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  for (const L in down) if (down[L] && !(blocksOf(L)[0] || {}).maint) press(L, false);
  autoRel = {};
}));
// fit the panel in the window without scrolling
// the panel spans the page and takes the height the window has left; returns true if its size changed
// (with widen, the sheet is also made as wide as the panel needs, so the whole circuit fills it edge to edge)
let fitKey = '';
function fit(widen) {
  if (typeof dragging === 'function' && dragging()) return false;   // never rescale the view under a drag in progress
  const st = document.getElementById('stage');
  const top = st.getBoundingClientRect().top + window.scrollY;
  // the panel's height is worked out again only when the window or the mode changes (not when selecting something
  // shows or hides its settings below the panel, which would rescale the view under the pointer)
  const k = `${window.innerWidth}x${window.innerHeight}:${editing}:${Math.round(top)}:${viewMode}`;
  let h = parseFloat(st.style.height);
  if (widen || k !== fitKey || !h) {
    const below = 16;
    h = Math.floor(Math.max(320, document.documentElement.clientHeight - top - below));
    if (st.style.height !== h + 'px') st.style.height = h + 'px';
    fitKey = k;
  }
  // never let the page grow past the window: even a pixel over brings up a scrollbar, which narrows the page, which can
  // wrap the header onto two rows, which shrinks the panel, which takes the scrollbar away again... and round it goes
  // (a window flickering between the two layouts). So whatever pushes the page over, the panel gives up the difference
  const over = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  if (over > 0 && h > 320) { h = Math.max(320, h - over); st.style.height = h + 'px'; }
  // (the main view: the whole panel, or in split view its first pane)
  const w = svg.clientWidth || st.clientWidth || 1, hh = svg.clientHeight || h;
  const widened = !!widen && (editing || viewMode === 'normal') && setWidth(fitWidth(w, hh));
  const vis = camW() * hh / w;
  if (widened) { VIS_H1 = vis; return true; }
  if (Math.abs(vis - VIS_H1) < 0.5) return false;
  VIS_H1 = vis; return true;
}
// a new window size refits the sheet while building (while running, the circuit just scales)
window.addEventListener('resize', () => { if (fit(editing && !dragging())) { if (editing) fitView(); draw(); } });

if (LOCKED) {
  // a locked simulator: its own circuit, straight into Run mode, with its name as the title
  try { const c = readCircuit(LOCKED.circuit); parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; POWER = c.power; SRC_COL = c.src; PH_COL = c.ph; circuitName = c.name; normalize(); }
  catch (_) { loadPreset('blank'); }
  document.body.classList.add('locked');
  document.querySelector('h1 span').textContent = circuitName || 'Circuit';
  fit(true); fitView(); setMode(true);
} else {
  if (!restoreAutosave()) loadPreset('andor');   // carry on with the circuit from last time, if there is one
  fit(true); draw();
}
showOverview();
requestAnimationFrame(frame);
