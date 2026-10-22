/* ---------------- build / run ---------------- */
function afterRunStart() { document.getElementById('mode-group').hidden = !parts.some(p => p.t === 'btn' && !p.maint); paint(); }
function setMode(run) {
  editing = !run;
  document.getElementById('tab-edit').setAttribute('aria-selected', String(!run));
  document.getElementById('tab-run').setAttribute('aria-selected', String(run));
  document.getElementById('toolbar').hidden = run; document.getElementById('editpanel').hidden = run;
  document.getElementById('runbar').hidden = !run;
  document.getElementById('fault').hidden = true;
  sel = null; preview = null; setTool('select');
  if (cam.fit) { fit(true); fitView(); }
  if (run) { NET = network(); draw(); startRun(); afterRunStart(); } else draw();
}
document.getElementById('tab-edit').addEventListener('click', () => setMode(false));
document.getElementById('tab-run').addEventListener('click', () => setMode(true));
document.getElementById('reset-btn').addEventListener('click', () => { startRun(); paint(); });
document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
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
  const k = `${window.innerWidth}x${window.innerHeight}:${editing}`;
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

if (!restoreAutosave()) loadPreset('andor');   // carry on with the circuit from last time, if there is one
fit(true); draw();
requestAnimationFrame(frame);
