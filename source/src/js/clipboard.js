/* ---------------- copy, cut and paste ----------------
   Ctrl+C copies the selected parts and wires, Ctrl+X cuts them, Ctrl+V pastes (or the Copy and Paste buttons).
   The copy goes in where the pointer is (or near the top of the view), moved down past anything already there so it
   never joins up with what is there by accident (wires that ran to L1 or L2 still do: a copied rung is a new rung),
   and it is left selected, ready to drag where it is wanted.
   Pasted buttons and coils get letters of their own, so the copy works on its own: a contact copied with its coil
   goes with the new coil, and a light built into a copied button goes with the new button. A contact or light
   copied without its coil or button stays with the original. */
let clip = null;
// where the pointer last was over the panel (null when it is off it): where a paste goes
let pastePt = null;
svg.addEventListener('pointermove', e => { pastePt = pt(e); });
svg.addEventListener('pointerleave', () => { pastePt = null; });
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
  // where you are looking: its top at the pointer (or a third of the way down the view, if the pointer is not over
  // the panel), lined up with where it came from; then moved down past anything already there, so it never joins
  // up with what is on the panel by accident
  const ys = [...clip.parts.map(p => p.y - BODYH(p.t) / 2), ...clip.wires.flatMap(w => [w.y1, w.y2])], top0 = Math.min(...ys);
  const xs = [...clip.parts.flatMap(p => [p.x - TERM(p), p.x + TERM(p)]), ...clip.wires.flatMap(w => [w.x1, w.x2])], x1 = Math.min(...xs), x2 = Math.max(...xs);
  const h = Math.max(...clip.parts.map(p => p.y + BODYH(p.t) / 2), ...clip.wires.flatMap(w => [w.y1, w.y2])) - top0;
  const aim = pastePt ? pastePt.y : cam.y + viewH() / 3;
  const busy = y0 => parts.some(p => p.x + TERM(p) >= x1 - 20 && p.x - TERM(p) <= x2 + 20 && p.y + BODYH(p.t) / 2 + 40 >= y0 && p.y - BODYH(p.t) / 2 - 40 <= y0 + h)
    || wires.some(w => Math.max(w.x1, w.x2) >= x1 - 20 && Math.min(w.x1, w.x2) <= x2 + 20 && Math.max(w.y1, w.y2) + 40 >= y0 && Math.min(w.y1, w.y2) - 40 <= y0 + h && !(barsOn() && w.x1 === w.x2 && (w.x1 === 0 || w.x1 === W)));
  let y0 = Math.max(60, snap(aim));
  for (let k = 0; k < 2000 && busy(y0); k++) y0 += G;
  const dy = snap(y0 - top0);
  const fx = x => x === 0 ? 0 : x >= W ? W : x;   // (wires to the bars stay on the bars)
  const np0 = [], jm = {}, xf = [];
  const np = clip.parts.map(p => {
    const q = { ...p, id: nextId++, y: p.y + dy }; if (p.ls) q.ls = [...p.ls];
    if (p.t === 'btn') q.L = map['b' + p.L];
    if (p.t === 'coil') q.L = map['c' + p.L];
    if (p.t === 'sel') { q.L = map['s' + p.L]; q.closedIn = [...(p.closedIn || [])]; if (p.names) q.names = [...p.names]; }
    if (p.t === 'con' && map['c' + p.L]) q.L = map['c' + p.L];
    if (p.t === 'lamp' && p.L && map['b' + p.L]) q.L = map['b' + p.L];
    if (p.t === 'jmp') { if (!jm[p.L]) jm[p.L] = nextNum(new Set([...parts.filter(isJmp).map(q => q.L), ...Object.values(jm)])); q.L = jm[p.L]; }   // (pasted continuations pair among themselves)
    if (p.t === 'dsc' || p.t === 'fus' || p.t === 'mtr' || p.t === 'lsw') { q.L = nextNum(new Set([...parts.filter(z => z.t === p.t).map(z => z.L), ...xf.filter(([t]) => t === p.t).map(([, L]) => L)])); xf.push([p.t, q.L]); }
    if (p.t === 'xfm') { q.L = nextNum(new Set([...parts.filter(z => z.t === 'xfm').map(z => z.L), ...xf.filter(([t]) => t === 'xfm').map(([, L]) => L)])); xf.push(['xfm', q.L]); }   // (a pasted transformer gets a number of its own)
    if (p.t === 'sol') { q.L = nextSol(new Set([...solNums(), ...np0])); np0.push(q.L); }   // (a pasted solenoid gets a number of its own)
    return q;
  });
  const nw = clip.wires.map(w => Wr(fx(w.x1), w.y1 + dy, fx(w.x2), w.y2 + dy));
  parts.push(...np); wires.push(...nw);
  const ids = new Set(nw.map(w => w.id));
  normalize();
  sel = { parts: new Set(np.map(p => p.id)), wires: new Set(wires.filter(w => ids.has(w.id)).map(w => w.id)) };
  if (!selCount()) sel = null;
  const renamed = Object.keys(map).length;
  say(`Pasted` + (renamed ? ', with letters of its own' : '') + '. Drag it where you want it.');
  if (!cam.fit && (y0 < cam.y || y0 > cam.y + viewH() - 80)) cam.y = y0 - 80;   // (bring it into view, if it went below)
  draw();
}
function updateClipButtons() { const b = document.getElementById('paste'); if (b) b.disabled = !clip; const c = document.getElementById('copy'); if (c) c.disabled = !selCount(); const x = document.getElementById('cut'); if (x) x.disabled = !selCount(); }
document.getElementById('cut').addEventListener('click', cutSel);
document.getElementById('copy').addEventListener('click', copySel);
document.getElementById('paste').addEventListener('click', pasteClip);
document.addEventListener('keydown', e => {
  if (!editing || /SELECT|INPUT|TEXTAREA/.test(document.activeElement.tagName) || !(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === 'c') { e.preventDefault(); copySel(); }
  else if (k === 'x') { e.preventDefault(); cutSel(); }
  else if (k === 'v') { e.preventDefault(); pasteClip(); }
});
