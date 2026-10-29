/* =====================================================================
   building
   ===================================================================== */
const pt = e => { const q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; const m = svg.getScreenCTM(); return m ? q.matrixTransform(m.inverse()) : { x: -1e9, y: -1e9 }; };
const btnLetters = () => new Set(parts.filter(p => p.t === 'btn').map(p => p.L));
const selLetters = () => new Set(parts.filter(p => p.t === 'sel').map(p => p.L));
const opLetters = () => new Set([...btnLetters(), ...selLetters()]);   // letters taken by pushbuttons and selector switches
const coilLetters = () => new Set(parts.filter(p => p.t === 'coil').map(p => p.L));
function newPart(kind, x, y) {
  if (kind === 'coil') { const u = new Set([...coilLetters(), ...opLetters()]); const L = [...'XYZW' + ALL].find(c => !u.has(c)); return P('coil', x, y, { L, color: COIL_COL[L] || '#FFDC00' }); }
  if (kind.startsWith('timer')) { const u = new Set([...coilLetters(), ...opLetters()]); const L = [...'TUVRS' + ALL].find(c => !u.has(c)); const p = P('coil', x, y, { L, color: COIL_COL[L] || '#FFDC00', delay: 5 }); if (kind === 'timer-off') p.tof = true; return p; }   // a timer (on- or off-delay), set to 5 s
  if (kind === 'lamp') return P('lamp', x, y, { L: '', color: '#00B050' });
  if (kind === 'src-l1' || kind === 'src-l2') return P(kind.slice(4), x, y, { L: '' });   // a supply box   // a light of its own (build it into a button in its settings)
  if (kind.startsWith('con')) { const cs = [...coilLetters()]; return P('con', x, y, { L: cs[0] || 'X', nc: kind === 'con-nc' }); }   // worked by the first coil (change it in its settings)
  const u = new Set([...coilLetters(), ...opLetters()]);
  if (kind === 'sel') { const L = [...'SJKMN' + ALL].find(c => !u.has(c)); return P('sel', x, y, { L, n: 3, closedIn: [0], pos: 1, color: '#0070C0' }); }   // a 3-position selector switch, turned to the middle; this drawing is closed in position 1
  const L = [...'ABCDEFGH' + ALL].find(c => !u.has(c));
  return P('btn', x, y, { L, nc: kind === 'btn-nc', maint: true, color: BTN_COL[L] || '#FF0032' });
}
const kindOf = k => k === 'src-l1' || k === 'src-l2' ? k.slice(4) : k === 'coil' || k.startsWith('timer') ? 'coil' : k === 'lamp' ? 'lamp' : k.startsWith('con') ? 'con' : k === 'sel' ? 'sel' : 'btn';
// a horizontal wire running right through where a part's ends will be: the part goes into it
function spliceTarget(x, y, t) { const h = WIDE(t) ? 60 : 40; return wires.find(w => w.y1 === y && w.y2 === y && Math.min(w.x1, w.x2) <= x - h && Math.max(w.x1, w.x2) >= x + h); }
function placePart(kind, x, y) {
  [x, y] = clampPart(x, y, kindOf(kind));
  if (overlaps(null, x, y, kindOf(kind))) { say('There is already a part there.'); return; }
  if (wireInTheWay({ t: kindOf(kind), x, y })) { say('There is a wire in the way.'); return; }
  snapshot();
  const p = newPart(kind, x, y);
  parts.push(p); normalize(); sel = selOne('p', p.id); ribbonTab = 'home'; say(''); draw();
}
