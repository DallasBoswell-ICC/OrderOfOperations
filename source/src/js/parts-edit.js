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
  if (kind === 'htr') return P('htr', x, y, { L: nextNum(new Set(parts.filter(q => q.t === 'htr').map(q => q.L))), color: HTR_COL, rate: 30, cool: 10 });
  if (kind === 'xfm') return P('xfm', x, y, { L: nextNum(new Set(parts.filter(q => q.t === 'xfm').map(q => q.L))) });   // a control transformer: the next number   // the next solenoid number
  if (kind === 'jmp') {   // a continuation: the number of one still on its own (so the second one placed pairs with it), or a new one
    const n = {}; for (const q of parts) if (isJmp(q)) n[q.L] = (n[q.L] || 0) + 1;
    const lone = Object.keys(n).filter(k => n[k] === 1).sort((a, b) => a - b)[0];
    return P('jmp', x, y, { L: lone || nextNum(new Set(Object.keys(n))) });
  }
  if (kind.startsWith('psw')) return P('psw', x, y, { L: nextNum(new Set(parts.filter(q => q.t === 'psw').map(q => q.L))), nc: kind === 'psw-nc', color: PSW_COL });
  if (kind.startsWith('tsw')) return P('tsw', x, y, { L: nextNum(new Set(parts.filter(q => q.t === 'tsw').map(q => q.L))), nc: kind.startsWith('tsw-nc'), ...(kind.endsWith('l') ? { low: true } : {}), color: TSW_COL });   // (tsw-no, tsw-nc: high temperature; tsw-nol, tsw-ncl: low)
  if (kind.startsWith('lsw')) return P('lsw', x, y, { L: nextNum(new Set(parts.filter(q => q.t === 'lsw').map(q => q.L))), nc: kind === 'lsw-nc' || kind === 'lsw-nch', held: kind.endsWith('h'), color: LSW_COL });   // a limit switch: the next number
  if (kind === 'fus' || kind === 'fu1') return P(kind, x, y, { L: nextNum(new Set(parts.filter(q => q.t === 'fus' || q.t === 'fu1').map(q => q.L))) });   // (fuses, single or three-pole, number from one count)
  if (kind === 'dsc' || kind === 'olh' || kind === 'mtr') return P(kind, x, y, { L: nextNum(new Set(parts.filter(q => q.t === kind).map(q => q.L))) });   // the next number
  if (kind === 'mst') return P('mst', x, y, { L: 'M' });   // a starter: worked by the M coil (change it in its settings)
  if (kind === 'olc') { const ols = parts.filter(q => q.t === 'olh').map(q => q.L), free = ols.find(L => !parts.some(q => q.t === 'olc' && q.L === L)); return P('olc', x, y, { L: free || ols[0] || '1', nc: true }); }   // an overload's contact: one not yet in the control circuit
  if (kind.startsWith('ph-')) return P('ph', x, y, { L: kind.slice(3) });   // a phase box: L1, L2 or L3
  if (kind === 'src-l1' || kind === 'src-l2') return P(kind.slice(4), x, y, { L: '' });   // a supply box   // a light of its own (build it into a button in its settings)
  if (kind.startsWith('con')) {
    // worked by the first coil (change it in its settings): a timing contact by the first timer; an instantaneous one by
    // the first plain relay, or else (as a timer's instantaneous contact) by the first timer
    const cs = parts.filter(q => q.t === 'coil'), timers = cs.filter(isTimer), relays = cs.filter(q => !isTimer(q)), nc = kind.startsWith('con-nc');
    if (kind.endsWith('-t')) return P('con', x, y, { L: (timers[0] || {}).L || 'T', nc });
    if (kind.endsWith('-i') && !relays.length && timers.length) return P('con', x, y, { L: timers[0].L, nc, inst: true });
    return P('con', x, y, { L: (relays[0] || cs[0] || {}).L || 'X', nc });
  }
  const u = new Set([...coilLetters(), ...opLetters()]);
  if (kind === 'sel') { const L = [...'SJKMN' + ALL].find(c => !u.has(c)); return P('sel', x, y, { L, n: 3, closedIn: [0], pos: 1, color: '#0070C0' }); }   // a 3-position selector switch, turned to the middle; this drawing is closed in position 1
  const L = [...'ABCDEFGH' + ALL].find(c => !u.has(c));
  return P('btn', x, y, { L, nc: kind.startsWith('btn-nc'), maint: !kind.endsWith('-mom'), color: kind.startsWith('btn-nc') ? '#FF0032' : '#00B050' });   // (normally open green, normally closed red)   // (-mom: momentary; otherwise maintained)
}
const kindOf = k => k.startsWith('lsw') ? 'lsw' : k.startsWith('tsw') ? 'tsw' : k.startsWith('psw') ? 'psw' : ['dsc', 'fus', 'fu1', 'mst', 'olh', 'olc', 'mtr'].includes(k) ? k : k.startsWith('ph-') ? 'ph' : k === 'jmp' ? 'jmp' : k === 'xfm' ? 'xfm' : k === 'src-l1' || k === 'src-l2' ? k.slice(4) : k === 'coil' || k.startsWith('timer') ? 'coil' : k === 'lamp' ? 'lamp' : k === 'sol' ? 'sol' : k === 'htr' ? 'htr' : k.startsWith('con') ? 'con' : k === 'sel' ? 'sel' : 'btn';
// a horizontal wire running right through where a part's ends will be: the part goes into it
function spliceTarget(x, y, t) { if (t === 'xfm' || t === 'ph' || isPwrT(t) || t === 'mtr') return null; const h = t === 'tsw' ? TSW_T : WIDE(t) ? 60 : 40; return wires.find(w => w.y1 === y && w.y2 === y && Math.min(w.x1, w.x2) <= x - h && Math.max(w.x1, w.x2) >= x + h); }
function placePart(kind, x, y) {
  [x, y] = clampPart(x, y, kindOf(kind));
  if (overlaps(null, x, y, kindOf(kind))) { say('There is already a part there.'); return; }
  if (wireInTheWay({ t: kindOf(kind), x, y })) { say('There is a wire in the way.'); return; }
  snapshot();
  const p = newPart(kind, x, y);
  parts.push(p); normalize(); sel = selOne('p', p.id); ribbonTab = mainTab; say(''); draw();
}

/* A part clicked on the ribbon goes straight onto the panel: to the free spot nearest the middle of the view, clear
   of every part (with room for its name), of every wire, and with neither of its ends touching anything (so it is
   never wired in by accident). It is selected, ready to be dragged where it is wanted. With no such spot in view, it
   goes below the circuit, and the view moves down to it. */
function placeFree(kind) {
  const t = kindOf(kind), stage = document.getElementById('stage').getBoundingClientRect(), m = svg.getScreenCTM();
  if (!m) return;
  const inv = m.inverse(), at = (cx, cy) => { const q = svg.createSVGPoint(); q.x = cx; q.y = cy; return q.matrixTransform(inv); };
  const l = Math.max(stage.left, 0), tp = Math.max(stage.top, 0), r = Math.min(stage.right, innerWidth), bt = Math.min(stage.bottom, innerHeight);
  const a = at(l, tp), b = at(r, bt), c = at((l + r) / 2, (tp + bt) / 2);
  const free = (x, y) => {
    const [cx, cy] = clampPart(x, y, t); if (cx !== x || cy !== y) return false;
    // (each part's room: its body, from end to end, and above it its name and a line for a warning)
    const p = newPart(kind, x, y), room = q => [q.x - Math.max(halfW(q.t), 72), q.y - capTop(q) - 30, q.x + Math.max(halfW(q.t), 72), q.y + halfH(q.t) + 6], A = room(p);
    if (parts.some(q => { const B = room(q); return A[0] < B[2] + 16 && B[0] < A[2] + 16 && A[1] < B[3] + 16 && B[1] < A[3] + 16; })) return false;
    // (nor any wire across it, its own ends' leads aside, nor the bars)
    if (wires.some(w => Math.max(w.x1, w.x2) > A[0] - 6 && Math.min(w.x1, w.x2) < A[2] + 6 && Math.max(w.y1, w.y2) > A[1] - 6 && Math.min(w.y1, w.y2) < A[3] + 6)) return false;
    if (barsOn() && (A[0] < 30 || A[2] > W - 30)) return false;
    return !wireInTheWay(p) && !terms(p).some(([tx, ty]) => connects(pointInfo(tx, ty)));
  };
  // (the spots in view, room left for the part's body and name, nearest the middle first)
  const ys0 = snap(a.y + capTop(newPart(kind, 0, 0)) + 34), ys1 = b.y - halfH(t) - 10, xs0 = snap(a.x + halfW(t)), xs1 = b.x - halfW(t), spots = [];
  for (let y = ys0; y <= ys1; y += G) for (let x = xs0; x <= xs1; x += G) spots.push([x, y, Math.hypot(x - c.x, (y - c.y) * 1.3)]);
  spots.sort((p, q) => p[2] - q[2]);
  let spot = spots.find(([x, y]) => free(x, y)), below = false;
  if (!spot) {
    // (below everything on the panel, lined up with the middle of the view)
    const bottom = Math.max(0, ...parts.map(q => q.y + halfH(q.t)), ...wires.map(w => Math.max(w.y1, w.y2)));
    let y = snap(bottom + halfH(t) + 80); const x = clampPart(c.x, y, t)[0];
    for (let k = 0; k < 200 && !free(x, y); k++) y += G;
    spot = [x, y]; below = true;
  }
  placePart(kind, spot[0], spot[1]);
  if (below && !cam.fit) { cam.y = Math.max(0, spot[1] - viewH() / 2); draw(); }
  say('Placed. Drag it where you want it (or drag a part from the ribbon straight to its place).');
}
