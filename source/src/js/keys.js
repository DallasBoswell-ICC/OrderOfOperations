/* ---------------- keyboard shortcuts ----------------
   Laid out as in Print Builder, for the left hand on the keys and the right on the mouse (like WASD in a game):
   E Select, W Wire, R turn, X delete, Q another of the last part placed, F2 its letter, Z fit, G Build/Run, the arrows
   nudge what is picked, and F1 shows them all (as does the keyboard button by the i). Delete, Esc, R and Ctrl+Z/Y are
   in toolbar.js; Ctrl+C/X/V in clipboard.js; Ctrl+S in storage.js; Ctrl+P in print.js; Space (pan) in camera.js. */
let lastKind = null;   // (the last part put on the panel, for Q: set in placePart)
const keysDlg = document.getElementById('keys-dlg');
function openKeys() { if (!keysDlg.open) keysDlg.showModal(); }
document.getElementById('keys-btn').addEventListener('click', openKeys);
document.getElementById('keys-close').addEventListener('click', () => keysDlg.close());

/* Nudging: a run of arrow presses is one move (one Undo), worked out each time from where things were at the first
   press, so the wires bend once, as in a drag. A press that would put a part on another part, or a wire through one,
   stays where the last good press left it. */
let NUDGE = null;
function nudge(sx, sy) {
  if (!NUDGE || NUDGE.after !== stateOf()) {
    const pIds = new Set(sel.parts), tIds = new Set(sel.terms || []);
    NUDGE = { start: stateOf(), pIds, wIds: new Set(sel.wires), tIds, P0: parts.filter(q => pIds.has(q.id)).map(q => ({ id: q.id, x: q.x, y: q.y, t: q.t })),
      T0: [...tIds].map(k => +k.split(':')[1]), dx: 0, dy: 0, moved: false };
  }
  const N = NUDGE, apply = (dx, dy) => {
    restore(N.start);
    for (let pass = 0; pass < 2; pass++) for (const q of N.P0) { const [cx, cy] = clampPart(q.x + dx, q.y + dy, q.t); dx = cx - q.x; dy = cy - q.y; }
    for (const y of N.T0) if (y + dy < 40) dy = 40 - y;
    if (N.P0.some(q => parts.some(o => !N.pIds.has(o.id) && Math.abs(o.x - (q.x + dx)) < halfW(q.t) + halfW(o.t) && Math.abs(o.y - (q.y + dy)) < halfH(q.t) + halfH(o.t)))) return 'There is already a part there.';
    const m = movedGroup(N.pIds, N.wIds, dx, dy, N.tIds); wires = m.wires;
    for (const q of parts) if (N.pIds.has(q.id)) { const o = N.P0.find(z => z.id === q.id); q.x = o.x + dx; q.y = o.y + dy; }
    normalize();
    if (parts.some(q => N.pIds.has(q.id) && wireInTheWay(q))) return 'There is a wire in the way.';
    sel = { parts: N.pIds, wires: new Set(wires.filter(w => N.wIds.has(w.id)).map(w => w.id)), terms: new Set([...N.tIds].map(k => k.split(':')[0] + ':' + (+k.split(':')[1] + dy))) };
    return '';
  };
  const bad = apply(N.dx + sx, N.dy + sy);
  if (bad) { if (N.dx || N.dy) apply(N.dx, N.dy); else restore(N.start); say(bad); }   // (nothing moved yet: exactly as it was)
  else { N.dx += sx; N.dy += sy; say(''); }
  if (!N.moved && stateOf() !== N.start) { remember(N.start); N.moved = true; }
  for (const x of [...parts, ...wires]) nextId = Math.max(nextId, (x.id || 0) + 1);
  N.after = stateOf(); draw();
}

// F2: the picked part's tab on the ribbon, with its letter (or its first setting) ready to change
function renameKey() {
  if (!sel || sel.parts.size !== 1 || sel.wires.size || (sel.terms && sel.terms.size)) return say('Pick one part first. Then F2 jumps to its letter.');
  ribbonTab = 'part'; showRibbon();
  const box = [...document.querySelectorAll('#editpanel select, #editpanel input[type=text]')].find(b => b.offsetParent && !b.disabled);
  if (box) box.focus(); else say('This part has no letter to change.');
}

document.addEventListener('keydown', e => {
  const a = document.activeElement, typing = a && (/SELECT|INPUT|TEXTAREA/.test(a.tagName) || a.isContentEditable);
  if (e.key === 'F1') { e.preventDefault(); if (!document.querySelector('dialog[open]')) openKeys(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (k === 'g' && !LOCKED) { e.preventDefault(); setMode(editing); return; }   // (Build ↔ Run)
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); fitView(); if (editing) fit(true); draw(); return; }
  if (!editing) return;   // (the rest are for building; in Run, Tab to a button and Space or Enter presses it)
  const mv = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
  if (mv) {
    if (!selCount()) return;
    e.preventDefault();
    if (!sel.parts.size) return say('The arrows move parts (and any wires picked with them). To move a wire on its own, drag its middle.');
    const n = e.shiftKey ? 5 * G : G; nudge(mv[0] * n, mv[1] * n); return;
  }
  if (e.key === 'F2') { e.preventDefault(); renameKey(); return; }
  if (e.shiftKey) return;
  if (k === 'e') { setTool('select'); }
  else if (k === 'w') { setTool('wire'); }
  else if (k === 'x') { e.preventDefault(); del(); }
  else if (k === 'q') { if (lastKind) { closeMenus(); setTool('select'); placeFree(lastKind); } else say('Put a part on the panel first. Then Q places another one like it.'); }
});
