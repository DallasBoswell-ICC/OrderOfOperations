/* =====================================================================
   building
   ===================================================================== */
const pt = e => { const q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; const m = svg.getScreenCTM(); return m ? q.matrixTransform(m.inverse()) : { x: -1e9, y: -1e9 }; };
const btnLetters = () => new Set(parts.filter(p => p.t === 'btn').map(p => p.L));
const coilLetters = () => new Set(parts.filter(p => p.t === 'coil').map(p => p.L));
function newPart(kind, x, y) {
  if (kind === 'coil') { const u = new Set([...coilLetters(), ...btnLetters()]); const L = [...'XYZW' + ALL].find(c => !u.has(c)); return P('coil', x, y, { L, color: COIL_COL[L] || '#FFDC00' }); }
  if (kind === 'timer') { const u = new Set([...coilLetters(), ...btnLetters()]); const L = [...'TUVRS' + ALL].find(c => !u.has(c)); return P('coil', x, y, { L, color: COIL_COL[L] || '#FFDC00', delay: 5 }); }   // an on-delay timer, set to 5 s
  if (kind === 'lamp') return P('lamp', x, y, { L: '', color: '#00B050' });   // a light of its own (build it into a button in its settings)
  if (kind.startsWith('con')) { const cs = [...coilLetters()]; return P('con', x, y, { L: cs[0] || 'X', nc: kind === 'con-nc' }); }   // worked by the first coil (change it in its settings)
  const u = new Set([...coilLetters(), ...btnLetters()]); const L = [...'ABCDEFGH' + ALL].find(c => !u.has(c));
  return P('btn', x, y, { L, nc: kind === 'btn-nc', maint: true, color: BTN_COL[L] || '#FF0032' });
}
const kindOf = k => k === 'coil' || k === 'timer' ? 'coil' : k === 'lamp' ? 'lamp' : k.startsWith('con') ? 'con' : 'btn';
// a horizontal wire running right through where a part's ends will be: the part goes into it
function spliceTarget(x, y, t) { const h = LOADT(t) ? 60 : 40; return wires.find(w => w.y1 === y && w.y2 === y && Math.min(w.x1, w.x2) <= x - h && Math.max(w.x1, w.x2) >= x + h); }
function placePart(kind, x, y) {
  [x, y] = clampPart(x, y, kindOf(kind));
  if (overlaps(null, x, y, kindOf(kind))) { say('There is already a part there.'); return; }
  if (wireInTheWay({ t: kindOf(kind), x, y })) { say('There is a wire in the way.'); return; }
  snapshot();
  const p = newPart(kind, x, y);
  parts.push(p); normalize(); sel = selOne('p', p.id); say(''); draw();
}
