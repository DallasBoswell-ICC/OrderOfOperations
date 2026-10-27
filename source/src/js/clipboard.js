/* ---------------- copy, cut and paste ----------------
   Ctrl+C copies the selected parts and wires, Ctrl+X cuts them, Ctrl+V pastes (or the Copy and Paste buttons).
   The copy goes in below everything on the panel, so it never joins up with what is there by accident (wires that
   ran to L1 or L2 still do: a copied rung is a new rung), and it is left selected, ready to drag where it is wanted.
   Pasted buttons and coils get letters of their own, so the copy works on its own: a contact copied with its coil
   goes with the new coil, and a light built into a copied button goes with the new button. A contact or light
   copied without its coil or button stays with the original. */
let clip = null;
function copySel() {
  if (!sel || !selCount()) { say('Select something to copy first.'); return false; }
  const ps = parts.filter(p => sel.parts.has(p.id)), ws = wires.filter(w => sel.wires.has(w.id));
  clip = JSON.parse(JSON.stringify({ parts: ps, wires: ws }, (k, v) => k.startsWith('_') ? undefined : v));
  const n = ps.length + ws.length; say(`Copied ${n} item${n > 1 ? 's' : ''}. Press Ctrl+V (or Paste) to put a copy in.`);
  updateClipButtons(); return true;
}
function cutSel() { if (copySel()) { del(); say('Cut. Press Ctrl+V (or Paste) to put it back in.'); } }
function pasteClip() {
  if (!clip || !(clip.parts.length + clip.wires.length)) { say('Copy something first.'); return; }
  snapshot();
  // new letters: each button letter and coil letter in the copy gets an unused one (the same for every drawing of it)
  const used = new Set([...opLetters(), ...coilLetters()]), map = {};
  const fresh = pref => { const L = [...pref + ALL].find(c => !used.has(c)); used.add(L); return L; };
  for (const p of clip.parts) if (p.t === 'btn' && !map['b' + p.L]) map['b' + p.L] = fresh('ABCDEFGH');
  for (const p of clip.parts) if (p.t === 'sel' && !map['s' + p.L]) map['s' + p.L] = fresh('SJKMN');
  for (const p of clip.parts) if (p.t === 'coil' && !map['c' + p.L]) map['c' + p.L] = fresh('XYZW');
  // below everything on the panel, lined up with where it came from
  const ys = [...clip.parts.map(p => p.y), ...clip.wires.flatMap(w => [w.y1, w.y2])];
  const bottom = Math.max(0, ...parts.map(p => p.y + 60), ...wires.map(w => Math.max(w.y1, w.y2)));
  const dy = snap(bottom + 100 - Math.min(...ys) + (LOADT(clip.parts.find(p => p.y === Math.min(...ys))?.t) ? 20 : 0));
  const fx = x => x === 0 ? 0 : x >= W ? W : x;   // (wires to the bars stay on the bars)
  const np = clip.parts.map(p => {
    const q = { ...p, id: nextId++, y: p.y + dy };
    if (p.t === 'btn') q.L = map['b' + p.L];
    if (p.t === 'coil') q.L = map['c' + p.L];
    if (p.t === 'sel') { q.L = map['s' + p.L]; q.closedIn = [...(p.closedIn || [])]; if (p.names) q.names = [...p.names]; }
    if (p.t === 'con' && map['c' + p.L]) q.L = map['c' + p.L];
    if (p.t === 'lamp' && p.L && map['b' + p.L]) q.L = map['b' + p.L];
    return q;
  });
  const nw = clip.wires.map(w => Wr(fx(w.x1), w.y1 + dy, fx(w.x2), w.y2 + dy));
  parts.push(...np); wires.push(...nw);
  const ids = new Set(nw.map(w => w.id));
  normalize();
  sel = { parts: new Set(np.map(p => p.id)), wires: new Set(wires.filter(w => ids.has(w.id)).map(w => w.id)) };
  if (!selCount()) sel = null;
  const renamed = Object.keys(map).length;
  say(`Pasted below the circuit` + (renamed ? ', with letters of its own' : '') + '. Drag it where you want it.');
  if (!cam.fit) cam.y = Math.min(...ys) + dy - 80;   // bring it into view
  draw();
}
function updateClipButtons() { const b = document.getElementById('paste'); if (b) b.disabled = !clip; const c = document.getElementById('copy'); if (c) c.disabled = !selCount(); }
document.getElementById('copy').addEventListener('click', copySel);
document.getElementById('paste').addEventListener('click', pasteClip);
document.addEventListener('keydown', e => {
  if (!editing || /SELECT|INPUT|TEXTAREA/.test(document.activeElement.tagName) || !(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'c') { e.preventDefault(); copySel(); }
  else if (k === 'x') { e.preventDefault(); cutSel(); }
  else if (k === 'v') { e.preventDefault(); pasteClip(); }
});
