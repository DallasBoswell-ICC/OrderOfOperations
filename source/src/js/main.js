/* ---------------- build / run ---------------- */
function afterRunStart() { buildStation(); document.getElementById('mode-group').hidden = !parts.some(p => p.t === 'btn' && !p.maint); document.getElementById('timer-group').hidden = !parts.some(isTimer); paint(); }
function setMode(run) {
  editing = !run;
  document.getElementById('tab-edit').setAttribute('aria-selected', String(!run));
  document.getElementById('tab-run').setAttribute('aria-selected', String(run));
  closeMenus(); showRibbon(); if (!run) buildStation();
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
  const sl = document.getElementById('speed-slider');
  if (!fromSlider) sl.value = sliderOf(s);
  document.getElementById('speed-out').textContent = fmtSpeed(s);
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
document.getElementById('speed-slider').addEventListener('input', e => {
  let s = SPEED_MIN * Math.pow(SPEED_MAX / SPEED_MIN, +e.target.value / 100);
  // it snaps to the round speeds when close to one (within about 13%: from 9× it lands on 10×)
  for (const k of SPEED_SNAPS) if (Math.abs(Math.log(s / k)) < 0.13) s = k;
  setSpeed(s, true);
});
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
  const k = `${window.innerWidth}x${window.innerHeight}:${editing}:${Math.round(top)}`;
  let h = parseFloat(st.style.height);
  if (widen || k !== fitKey || !h) {
    const below = 16;
    h = Math.round(Math.max(320, window.innerHeight - top - below));
    if (st.style.height !== h + 'px') st.style.height = h + 'px';
    fitKey = k;
  }
  const w = st.clientWidth || 1;
  const widened = !!widen && setWidth(fitWidth(w, h));
  const vis = W * h / w;
  if (widened) { VIS_H1 = vis; return true; }
  if (Math.abs(vis - VIS_H1) < 0.5) return false;
  VIS_H1 = vis; return true;
}
// a new window size refits the sheet while building (while running, the circuit just scales)
window.addEventListener('resize', () => { if (fit(editing && !dragging())) { if (editing) fitView(); draw(); } });

if (LOCKED) {
  // a locked simulator: its own circuit, straight into Run mode, with its name as the title
  try { const c = readCircuit(LOCKED.circuit); parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; circuitName = c.name; normalize(); }
  catch (_) { loadPreset('blank'); }
  document.body.classList.add('locked');
  document.querySelector('h1 span').textContent = circuitName || 'Circuit';
  fit(true); fitView(); setMode(true);
} else {
  if (!restoreAutosave()) loadPreset('andor');   // carry on with the circuit from last time, if there is one
  fit(true); draw();
}
requestAnimationFrame(frame);
