// toolbar parts: drag onto the panel, or click the tool and then click the panel
document.querySelectorAll('.tool[data-part]').forEach(b => {
  const kind = b.dataset.part;
  b.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !editing) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY; let moved = false, ghost = null;
    const sample = kind === 'coil' ? { t: 'coil', L: '?', color: '#FFDC00' } : kind.startsWith('timer') ? { t: 'coil', L: '?', color: '#FFDC00', delay: 5, tof: kind === 'timer-off' } : kind === 'lamp' ? { t: 'lamp', L: '', color: '#00B050' } : kind.startsWith('con') ? { t: 'con', L: '?', nc: kind === 'con-nc' } : kind === 'sel' ? { t: 'sel', L: '?', n: 3, closedIn: [0], pos: 1, color: '#0070C0' } : { t: 'btn', L: '?', nc: kind === 'btn-nc', color: '#9a9a9a' };
    const mv = ev => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) { moved = true; closeMenus(); ghost = document.createElement('div'); ghost.className = 'ghost'; ghost.innerHTML = b.innerHTML; document.body.append(ghost); document.body.classList.add('dragging'); }
      if (!moved) return;
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
      const r = pt(ev), box = svg.getBoundingClientRect();
      if (ev.clientY >= box.top && ev.clientY <= box.bottom && ev.clientX >= box.left && ev.clientX <= box.right) {
        const [x, y] = clampPart(r.x, r.y, sample.t);
        const T = WIDE(sample.t) ? 60 : 40, hits = [[x - T, y], [x + T, y]].filter(([a, c]) => connects(pointInfo(a, c)));
        preview = { part: { p: sample, x, y, bad: overlaps(null, x, y, sample.t) }, splice: !!spliceTarget(x, y, sample.t), hits }; drawPreview();
      } else { preview = null; view.overlay.innerHTML = ''; }
    };
    const up = ev => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      if (moved) { ghost.remove(); document.body.classList.remove('dragging'); preview = null; view.overlay.innerHTML = '';
        const r = pt(ev), box = svg.getBoundingClientRect();
        if (ev.clientX >= box.left && ev.clientX <= box.right && ev.clientY >= box.top && ev.clientY <= box.bottom) placePart(kind, r.x, r.y); }
      else setTool(tool === kind ? 'select' : kind);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });
});
function setTool(t) {
  tool = t; closeMenus();
  document.querySelectorAll('.tool[data-tool], .tool[data-part]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.tool || b.dataset.part) === t)));
  svg.style.cursor = t === 'select' ? '' : 'crosshair';
  say(t !== 'select' && t !== 'wire' ? 'Click the panel to place it (or drag the tool onto the panel). Press Esc to cancel.' : '');
}
document.querySelectorAll('.tool[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
function del() {
  if (!sel) return;
  snapshot();
  parts = parts.filter(q => !sel.parts.has(q.id));
  wires = wires.filter(w => !sel.wires.has(w.id));
  sel = null; draw();
}
document.getElementById('del').addEventListener('click', del);
document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('p-del').addEventListener('click', del);
document.getElementById('clear').addEventListener('click', () => { snapshot(); parts = []; wires = []; W_USER = null; sel = null; circuitName = ''; forgetFile(); draw(); });
document.addEventListener('keydown', e => {
  if (!editing || /SELECT|INPUT/.test(document.activeElement.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || e.shiftKey && e.key.toLowerCase() === 'z')) { e.preventDefault(); redo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if (e.key === 'Escape') { setTool('select'); sel = null; draw(); }
});

/* ---------------- the ribbon ----------------
   Home while building (and the gold tab of the selected part), Simulation while running. Folded away, only the tabs
   show: pressing one opens the ribbon over the panel until you press somewhere else. */
function closeMenus() { document.body.classList.remove('ribbon-peek'); }
function showRibbon() {
  const run = !editing, part = !run && !!selPart(), tab = run ? 'run' : part && ribbonTab === 'part' ? 'part' : 'home';
  const set = (id, shown, on) => { const b = document.getElementById(id); b.hidden = !shown; b.setAttribute('aria-pressed', String(on)); };
  set('rt-home', !run, tab === 'home'); set('rt-part', part, tab === 'part'); set('rt-run', run, tab === 'run');
  document.getElementById('toolbar').hidden = tab !== 'home';
  document.getElementById('editpanel').hidden = tab !== 'part';
  document.getElementById('runbar').hidden = tab !== 'run';
}
for (const [id, t] of [['rt-home', 'home'], ['rt-part', 'part'], ['rt-run', 'run']])
  document.getElementById(id).addEventListener('click', () => {
    if (t !== 'run') ribbonTab = t;
    if (document.body.classList.contains('ribbon-min') || document.body.classList.contains('fs')) document.body.classList.add('ribbon-peek');
    showRibbon();
  });
const RIBBON_KEY = 'oo-circuit-builder:ribbon-min';
function foldRibbon(min) {
  document.body.classList.toggle('ribbon-min', min); document.body.classList.remove('ribbon-peek');
  const b = document.getElementById('ribbon-toggle');
  b.setAttribute('aria-expanded', String(!min)); b.setAttribute('aria-label', min ? 'Pin the ribbon open' : 'Collapse the ribbon');
  b.dataset.tip = min ? 'Keep the ribbon open' : 'Fold the ribbon away for more room (the tabs stay)';
  b.classList.toggle('down', min);
  try { localStorage.setItem(RIBBON_KEY, min ? '1' : ''); } catch (_) {}
  if (fit(editing)) { if (editing) fitView(); }
  draw();
}
document.getElementById('ribbon-toggle').addEventListener('click', () => foldRibbon(!document.body.classList.contains('ribbon-min')));
try { if (localStorage.getItem(RIBBON_KEY) === '1') { document.body.classList.add('ribbon-min'); const b = document.getElementById('ribbon-toggle'); b.setAttribute('aria-expanded', 'false'); b.classList.add('down'); b.dataset.tip = 'Keep the ribbon open'; b.setAttribute('aria-label', 'Pin the ribbon open'); } } catch (_) {}
document.addEventListener('pointerdown', e => { if (!e.target.closest('#ribbon')) closeMenus(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
/* ---------------- pop-up descriptions ----------------
   Anything with a data-tip shows it in one floating box while the pointer rests on it (or it has the keyboard focus):
   below it, or above it when there is no room below, always inside the window, above the ribbon and the panel. */
const tipBox = document.createElement('div'); tipBox.className = 'tipbox'; tipBox.setAttribute('role', 'tooltip'); tipBox.hidden = true; document.body.append(tipBox);
let tipFor = null, tipTimer = 0;
function showTip(el) {
  tipFor = el; tipBox.textContent = el.dataset.tip; tipBox.hidden = false;
  const r = el.getBoundingClientRect(), b = tipBox.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight, gap = 8;
  let x = Math.min(Math.max(8, r.left), vw - b.width - 8), y = r.bottom + gap;
  if (y + b.height > vh - 8) y = Math.max(8, r.top - gap - b.height);
  tipBox.style.left = x + 'px'; tipBox.style.top = y + 'px';
}
function hideTip() { clearTimeout(tipTimer); tipFor = null; tipBox.hidden = true; }
document.addEventListener('pointerover', e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el === tipFor) return;
  hideTip();
  if (!el || e.pointerType === 'touch' || document.body.classList.contains('dragging') || !el.dataset.tip) return;
  tipFor = el; tipTimer = setTimeout(() => { if (el.isConnected && tipFor === el) showTip(el); }, 350);
});
document.addEventListener('pointerout', e => { if (tipFor || tipTimer) { const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-tip]'); if (to !== tipFor) hideTip(); } });
document.addEventListener('pointerdown', hideTip, true);
document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && el.matches(':focus-visible')) showTip(el); else hideTip(); });
document.addEventListener('focusout', hideTip);
window.addEventListener('scroll', hideTip, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
