/* =====================================================================
   building
   ===================================================================== */
const pt = e => { const q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; const m = svg.getScreenCTM(); return m ? q.matrixTransform(m.inverse()) : { x: -1e9, y: -1e9 }; };
const btnLetters = () => new Set(parts.filter(p => p.t === 'btn').map(p => p.L));
const selLetters = () => new Set(parts.filter(p => p.t === 'sel').map(p => p.L));
const opLetters = () => new Set([...btnLetters(), ...selLetters()]);   // letters taken by pushbuttons and selector switches
const solNums = () => new Set(parts.filter(p => p.t === 'sol').map(p => p.L));
const nextNum = taken => { let n = 1; while (taken.has(String(n))) n++; return String(n); }, nextSol = (taken = solNums()) => nextNum(taken);
const coilLetters = () => new Set(parts.filter(p => p.t === 'coil').map(p => p.L));
function newPart(kind, x, y) {
  if (kind === 'coil') { const u = new Set([...coilLetters(), ...opLetters()]); const L = [...'XYZW' + ALL].find(c => !u.has(c)); return P('coil', x, y, { L, color: COIL_COL[L] || '#FFDC00' }); }
  if (kind.startsWith('timer')) { const u = new Set([...coilLetters(), ...opLetters()]); const L = [...'TUVRS' + ALL].find(c => !u.has(c)); const p = P('coil', x, y, { L, color: COIL_COL[L] || '#FFDC00', delay: 5 }); if (kind === 'timer-off') p.tof = true; return p; }   // a timer (on- or off-delay), set to 5 s
  if (kind === 'lamp') return P('lamp', x, y, { L: '', color: '#00B050' });
  if (kind === 'sol') return P('sol', x, y, { L: nextSol(), color: SOL_COL });
  if (kind === 'xfm') return P('xfm', x, y, { L: nextNum(new Set(parts.filter(q => q.t === 'xfm').map(q => q.L))) });   // a control transformer: the next number   // the next solenoid number
  if (kind === 'jmp') {   // a continuation: the number of one still on its own (so the second one placed pairs with it), or a new one
    const n = {}; for (const q of parts) if (isJmp(q)) n[q.L] = (n[q.L] || 0) + 1;
    const lone = Object.keys(n).filter(k => n[k] === 1).sort((a, b) => a - b)[0];
    return P('jmp', x, y, { L: lone || nextNum(new Set(Object.keys(n))) });
  }
  if (kind === 'dsc' || kind === 'fus' || kind === 'olh' || kind === 'mtr') return P(kind, x, y, { L: nextNum(new Set(parts.filter(q => q.t === kind).map(q => q.L))) });   // the next number
  if (kind === 'mst') return P('mst', x, y, { L: 'M' });   // a starter: worked by the M coil (change it in its settings)
  if (kind === 'olc') { const ols = parts.filter(q => q.t === 'olh').map(q => q.L), free = ols.find(L => !parts.some(q => q.t === 'olc' && q.L === L)); return P('olc', x, y, { L: free || ols[0] || '1', nc: true }); }   // an overload's contact: one not yet in the control circuit
  if (kind.startsWith('ph-')) return P('ph', x, y, { L: kind.slice(3) });   // a phase box: L1, L2 or L3
  if (kind === 'src-l1' || kind === 'src-l2') return P(kind.slice(4), x, y, { L: '' });   // a supply box   // a light of its own (build it into a button in its settings)
  if (kind.startsWith('con')) { const cs = [...coilLetters()]; return P('con', x, y, { L: cs[0] || 'X', nc: kind === 'con-nc' }); }   // worked by the first coil (change it in its settings)
  const u = new Set([...coilLetters(), ...opLetters()]);
  if (kind === 'sel') { const L = [...'SJKMN' + ALL].find(c => !u.has(c)); return P('sel', x, y, { L, n: 3, closedIn: [0], pos: 1, color: '#0070C0' }); }   // a 3-position selector switch, turned to the middle; this drawing is closed in position 1
  const L = [...'ABCDEFGH' + ALL].find(c => !u.has(c));
  return P('btn', x, y, { L, nc: kind === 'btn-nc', maint: true, color: BTN_COL[L] || '#FF0032' });
}
const kindOf = k => ['dsc', 'fus', 'mst', 'olh', 'olc', 'mtr'].includes(k) ? k : k.startsWith('ph-') ? 'ph' : k === 'jmp' ? 'jmp' : k === 'xfm' ? 'xfm' : k === 'src-l1' || k === 'src-l2' ? k.slice(4) : k === 'coil' || k.startsWith('timer') ? 'coil' : k === 'lamp' ? 'lamp' : k === 'sol' ? 'sol' : k.startsWith('con') ? 'con' : k === 'sel' ? 'sel' : 'btn';
// a horizontal wire running right through where a part's ends will be: the part goes into it
function spliceTarget(x, y, t) { if (t === 'xfm' || t === 'ph' || isPwrT(t) || t === 'mtr') return null; const h = WIDE(t) ? 60 : 40; return wires.find(w => w.y1 === y && w.y2 === y && Math.min(w.x1, w.x2) <= x - h && Math.max(w.x1, w.x2) >= x + h); }
function placePart(kind, x, y) {
  [x, y] = clampPart(x, y, kindOf(kind));
  if (overlaps(null, x, y, kindOf(kind))) { say('There is already a part there.'); return; }
  if (wireInTheWay({ t: kindOf(kind), x, y })) { say('There is a wire in the way.'); return; }
  snapshot();
  const p = newPart(kind, x, y);
  parts.push(p); normalize(); sel = selOne('p', p.id); ribbonTab = mainTab; say(''); draw();
}
