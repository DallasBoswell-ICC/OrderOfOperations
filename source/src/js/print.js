/* =====================================================================
   Print Diagram: the circuit as a NEMA ladder diagram on a sheet of letter paper (8.5 x 11 in), with wire numbers,
   line numbers, cross-references, device tags and a title block. Drawn in the builder's own coordinates, with the
   print symbols (print-symbols.js). Opened from Print on the quick access toolbar (or Ctrl+P): a preview, with who
   it was drawn by (remembered in the browser), then the browser's print window (which can also save a PDF).

   Wire numbers
     control: L1 off the control transformer's secondary (after its fuse, if it has one), or the L1 bar or L1 Supply
       box, is 1; L2 is 2; every other control wire the next number, left to right, top to bottom.
     power: up to the starters' contacts each wire is its phase, L1, L2 or L3, with a letter for each part it has
       come through (L1, L1A, L1B...); from the contacts on, it is its motor lead, T1-T3 for the first motor, T4-T6
       for the second..., with a letter for each part after the contacts (T1, T1A...).
   Line numbers: each row of the control circuit, top to bottom. To the right of each coil, the lines its contacts
   are on (underlined: normally closed; PWR: its starter's power contacts).
   ===================================================================== */
const PRINT_NAME_KEY = 'oo-circuit-builder:print-drawn-by';
const PRINT_W = 4;   // (the wires' weight: the symbols' lines are drawn to it)
const PRINT_SCALE = .0032;   // (inches a unit, at most: a wire number about 5 pt, a tag about 6 pt)
const PRINT_GAP = .3;        // (inches clear above and below the ladder on a sheet that carries on from or to another)
const PRINT_SIZE_KEY = 'oo-circuit-builder:print-size';
const PRINT_POWER = new Set(['ph', 'dsc', 'fus', 'mst', 'olh', 'mtr', 'xfm']);

function printSheet(drawnBy, fit = false) {
  const kp = (x, y) => x + ',' + y;
  const P = parts.map(p => ({ p, t: p.t, x: p.x, y: p.y, L: p.L, terms: terms(p) }));
  const bars = barsOn();
  // (on the bars, L2 drawn just past the last part, however wide the sheet is in the builder, so the rungs print large)
  const inner = [...parts.flatMap(p => terms(p).map(t => t[0])), ...wires.flatMap(w => [w.x1, w.x2]).filter(x => x !== W)];
  const RX = bars && inner.length ? Math.min(W, Math.ceil((Math.max(...inner) + 120) / G) * G) : W;
  const Wr = wires.map(w => ({ x1: Math.min(w.x1, w.x2), y1: Math.min(w.y1, w.y2), x2: Math.max(w.x1, w.x2), y2: Math.max(w.y1, w.y2) })).map(w => bars ? { ...w, x1: w.x1 === W ? RX : w.x1, x2: w.x2 === W ? RX : w.x2 } : w);

  /* ---------- nets ---------- */
  // (wires joined end to end, or an end on another's run; a part's end on a wire, or on another's end; a box's
  // connection points all one; continuations with the same number one; the bars, L1 and L2. A crossing is no joint.)
  const par = [], id = new Map(), mk = k => { if (!id.has(k)) { id.set(k, par.length); par.push(par.length); } return id.get(k); };
  const find = i => par[i] === i ? i : (par[i] = find(par[i])), join = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const on = (w, x, y) => w.x1 === w.x2 ? x === w.x1 && y >= w.y1 && y <= w.y2 : y === w.y1 && x >= w.x1 && x <= w.x2;
  const ends = w => [[w.x1, w.y1], [w.x2, w.y2]];
  Wr.forEach((w, i) => { w.n = mk('w' + i); });
  Wr.forEach(w => ends(w).forEach(([x, y]) => { join(w.n, mk('p' + kp(x, y))); for (const v of Wr) if (v !== w && on(v, x, y)) join(w.n, v.n); }));
  for (const q of P) for (const [x, y] of q.terms) { const t = mk('p' + kp(x, y)); for (const w of Wr) if (on(w, x, y)) join(t, w.n); }
  if (bars) for (const w of Wr) for (const [x] of ends(w)) { if (x === 0) join(w.n, mk('BAR1')); if (x === RX) join(w.n, mk('BAR2')); }
  const jl = {};
  for (const q of P) if (isBox(q.p)) { const c = mk('box' + q.p.id); q.terms.forEach(t => join(c, mk('p' + kp(...t)))); if (isJmp(q.p)) (jl[q.L] = jl[q.L] || []).push(c); }
  for (const k in jl) jl[k].forEach(c => join(c, jl[k][0]));
  const netAt = (x, y) => id.has('p' + kp(x, y)) ? find(id.get('p' + kp(x, y))) : null, wNet = w => find(w.n);
  // (joints: where three or more wire ends meet, or one ends on another's run)
  const dots = new Map();
  Wr.forEach(w => ends(w).forEach(([x, y]) => {
    const mid = Wr.some(v => v !== w && on(v, x, y) && !ends(v).some(([a, b]) => a === x && b === y));
    const cnt = Wr.filter(v => ends(v).some(([a, b]) => a === x && b === y)).length + (bars && (x === 0 || x === RX) ? 1 : 0);
    if (mid || cnt >= 3) dots.set(kp(x, y), [x, y]);
  }));

  /* ---------- wire numbers ---------- */
  const NUM = new Map(), PHASE = new Set(), ctrl = new Set();
  const xf = P.find(q => q.t === 'xfm'), s1 = P.find(q => q.t === 'l1'), s2 = P.find(q => q.t === 'l2');
  let n1 = null, n2 = null, xfFuse = null;
  if (xf) {
    const nX1 = netAt(...xf.terms[2]); n2 = netAt(...xf.terms[3]);
    const fuse = P.find(q => q.t === 'fu1' && q.terms.some(t => netAt(...t) === nX1 && nX1 != null));
    n1 = fuse ? netAt(...fuse.terms.find(t => netAt(...t) !== nX1)) : nX1;
    if (fuse && nX1 != null) { NUM.set(nX1, 'X1'); ctrl.add(nX1); xfFuse = fuse; }
  } else if (bars) { n1 = find(mk('BAR1')); n2 = find(mk('BAR2')); }
  else { n1 = s1 ? netAt(...s1.terms[0]) : null; n2 = s2 ? netAt(...s2.terms[0]) : null; }
  if (n1 != null) { NUM.set(n1, '1'); ctrl.add(n1); } if (n2 != null && n2 !== n1) { NUM.set(n2, '2'); ctrl.add(n2); }
  // (the power circuit first: every wire reached from a phase through disconnects, fuses, starters and overloads, a
  // single fuse too (a transformer's primary fuse), and the transformer's primary. No control number goes to any of
  // them: a primary fuse taken for a control part had pushed the power wires into the control numbers, and every
  // control number up with them)
  const PWRNET = new Set(), poles = q => q.t === 'fu1' ? [[0, 1]] : ['dsc', 'fus', 'mst', 'olh'].includes(q.t) ? [[0, 1], [2, 3], [4, 5]] : [];
  { const q0 = []; for (const q of P) if (q.t === 'ph') { const n = netAt(...q.terms[0]); if (n != null && !PWRNET.has(n)) { PWRNET.add(n); q0.push(n); } }
    while (q0.length) { const n = q0.shift();
      for (const q of P) for (const [i, j] of poles(q)) { const a = netAt(...q.terms[i]), b = netAt(...q.terms[j]);
        for (const [x, y] of [[a, b], [b, a]]) if (x === n && y != null && !PWRNET.has(y) && !NUM.has(y)) { PWRNET.add(y); q0.push(y); } } }
    if (xf) for (const i of [0, 1]) { const n = netAt(...xf.terms[i]); if (n != null && !NUM.has(n)) PWRNET.add(n); } }
  // (the control circuit: everything reached from 1 and 2 through control parts)
  const ctrlPart = q => !PRINT_POWER.has(q.t) && !isSrc(q.p) && !isPh(q.p) && !q.terms.some(t => PWRNET.has(netAt(...t)));
  for (let grew = true; grew;) { grew = false;
    for (const q of P) if (ctrlPart(q)) { const ns = q.terms.map(t => netAt(...t)).filter(n => n != null);
      if (ns.some(n => ctrl.has(n))) for (const n of ns) if (!ctrl.has(n)) { ctrl.add(n); grew = true; } } }
  // (and any control part's wires not reached from them, wired to nothing yet)
  for (const q of P) if (ctrlPart(q) && !isJmp(q.p)) for (const t of q.terms) { const n = netAt(...t); if (n != null) ctrl.add(n); }
  const anchor = n => { let b = null; for (const q of P) for (const t of q.terms) if (netAt(...t) === n && (!b || t[1] < b[1] || t[1] === b[1] && t[0] < b[0])) b = t;
    if (!b) for (const w of Wr) if (wNet(w) === n && (!b || w.y1 < b[1] || w.y1 === b[1] && w.x1 < b[0])) b = [w.x1, w.y1]; return b || [1e9, 1e9]; };
  const byReading = (a, b) => { const A = anchor(a), B = anchor(b); return A[1] - B[1] || A[0] - B[0]; };
  let next = 3;
  [...ctrl].filter(n => !NUM.has(n)).sort(byReading).forEach(n => NUM.set(n, String(next++)));
  // power: traced pole by pole from the phases
  const LET = d => d > 0 ? String.fromCharCode(64 + d) : '';
  const POLED = new Set(['dsc', 'fus', 'mst', 'olh']);
  const across = n => { const o = []; for (const q of P) if ((POLED.has(q.t) && q.t !== 'mst') || (q.t === 'fu1' && q.terms.some(t => PWRNET.has(netAt(...t))))) for (const [i, j] of poles(q)) {
    const a = netAt(...q.terms[i]), b = netAt(...q.terms[j]); if (a === n && b != null) o.push(b); else if (b === n && a != null) o.push(a); } return o; };
  const mstLoad = new Set(); for (const q of P) if (q.t === 'mst') for (let i = 1; i < 6; i += 2) { const n = netAt(...q.terms[i]); if (n != null) mstLoad.add(n); }
  const lineQ = [];
  for (const q of P) if (q.t === 'ph') { const n = netAt(...q.terms[0]); if (n != null && !NUM.has(n)) { NUM.set(n, 'L' + q.L); PHASE.add(n); lineQ.push([n, q.L, 0]); } }
  while (lineQ.length) { const [n, L, d] = lineQ.shift(); for (const m of across(n)) if (!NUM.has(m) && !mstLoad.has(m)) { NUM.set(m, 'L' + L + LET(d + 1)); lineQ.push([m, L, d + 1]); } }
  const motors = P.filter(q => q.t === 'mtr').sort((a, b) => +a.L - +b.L || a.y - b.y || a.x - b.x);
  motors.forEach((m, k) => m.terms.forEach((t, i) => {
    const chain = [netAt(...t)]; if (chain[0] == null) return;
    for (let g = 0; g < 20 && !mstLoad.has(chain[chain.length - 1]); g++) { const nx = across(chain[chain.length - 1]).find(q => !chain.includes(q)); if (nx == null) break; chain.push(nx); }
    chain.reverse().forEach((n, j) => { if (!NUM.has(n)) NUM.set(n, 'T' + (3 * k + i + 1) + LET(j)); });
  }));

  /* ---------- line numbers and cross-references ---------- */
  const rowParts = P.filter(q => ctrlPart(q) && !isJmp(q.p) && q.t !== 'fu1' && q.terms.some(t => ctrl.has(netAt(...t))));
  const rows = [...new Set(rowParts.map(q => q.y))].sort((a, b) => a - b), LINE = new Map(rows.map((y, i) => [y, i + 1]));
  const cw = Wr.filter(w => ctrl.has(wNet(w))), cxs = cw.flatMap(w => [w.x1, w.x2]).concat(rowParts.flatMap(q => q.terms.map(t => t[0])));
  const xLeft = bars ? 0 : cxs.length ? Math.min(...cxs) : 0, xRight = bars ? RX : cxs.length ? Math.max(...cxs) : RX;
  const xref = c => { const r = [];
    for (const q of P) if (q.t === 'con' && q.L === c.L && LINE.has(q.y)) r.push({ n: LINE.get(q.y), nc: !!q.p.nc });
    r.sort((a, b) => a.n - b.n); if (P.some(q => q.t === 'mst' && q.L === c.L)) r.push({ n: 'PWR', nc: false }); return r; };

  /* ---------- tags ---------- */
  const lampN = new Map(); P.filter(q => q.t === 'lamp').sort((a, b) => a.y - b.y || a.x - b.x).forEach((q, i) => lampN.set(q, i + 1));
  // (a button or coil with a label of its own, that no other has, goes by it: no PB-A, its contacts named by it too)
  const tag = q => ({ btn: uniqueLabel('btn', q.L) || (q.p.estop ? 'ES-' : 'PB-') + q.L, sel: 'SS-' + q.L, coil: uniqueLabel('coil', q.L) || q.L, con: uniqueLabel('coil', q.L) || q.L, olc: 'OL' + q.L, lamp: 'PL' + lampN.get(q), sol: 'SOL' + q.L, htr: 'HTR' + q.L, tsw: 'TS' + q.L,
    psw: 'PS' + q.L, lsw: 'LS' + q.L, fu1: 'FU' + q.L, fus: 'FU' + q.L, dsc: 'DS' + q.L, mst: q.L, olh: 'OL' + q.L, mtr: 'M' + q.L, xfm: 'CPT' + q.L })[q.t] || '';
  const COLOURS = { '#00B050': 'GREEN', '#FF0032': 'RED', '#FF9600': 'AMBER', '#FFDC00': 'YELLOW', '#0070C0': 'BLUE', '#FFFFFF': 'WHITE', '#7030A0': 'PURPLE' };
  const colourName = c => COLOURS[(c || '').toUpperCase()] || '';

  /* ---------- drawing ---------- */
  let g = '';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const line = (x1, y1, x2, y2, w = PRINT_W) => { if (x1 !== x2 || y1 !== y2) g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}"/>`; };
  const text = (x, y, s, size = 26, anchor = 'middle', weight = 700, extra = '') => { if (s !== '' && s != null) g += `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}"${extra}>${esc(s)}</text>`; };
  // a symbol, its middle at x, y (turned a quarter when its part stands upright); returns it
  const put = (name, x, y, up = false) => { const s = PSYM[name]; g += `<g class="sym" transform="translate(${x} ${y})${up ? ' rotate(90)' : ''}">${s.b}</g>`; return s; };
  // (a symbol's own wire points, on the sheet)
  const pts = (s, x, y, up) => s.t.map(([a, b]) => up ? [x - b, y + a] : [x + a, y + b]);
  // a two-ended part: leads from its ends in to the symbol's, the symbol; tag above, its name below (beside, upright)
  const two = (q, name, below = '', noTag = false) => {
    const up = q.terms[0][0] === q.terms[1][0], s = put(name, q.x, q.y, up), sp = pts(s, q.x, q.y, up);
    q.terms.forEach(t => { const m = sp.reduce((a, b) => Math.hypot(b[0] - t[0], b[1] - t[1]) < Math.hypot(a[0] - t[0], a[1] - t[1]) ? b : a); line(t[0], t[1], m[0], m[1]); });
    if (up) { if (!noTag) text(q.x - s.y0 + 8, q.y + 9, tag(q), 26, 'start'); if (below) text(q.x - s.y0 + 8, q.y + 34, below, 21, 'start', 500); }
    else { if (!noTag) text(q.x, q.y + s.y0 - 4, tag(q), 26, 'middle', 700, q.linked ? ' style="stroke:#fff;stroke-width:7px;paint-order:stroke"' : ''); if (below) text(q.x, q.y + s.y1 + 20, below, 21, 'middle', 500, q.t === 'sel' ? ' style="stroke:#fff;stroke-width:7px;paint-order:stroke"' : ''); } };   // (a selector switch's note: on white, as the dashed link runs behind it)
  const three = (q, name) => { const s = put(name, q.x, q.y), sp = pts(s, q.x, q.y, false);
    q.terms.forEach((t, i) => line(t[0], t[1], sp[i][0], sp[i][1])); text(q.x, q.y + s.y0 - 4, tag(q), 26); };
  const timerOf = L => P.find(q => q.t === 'coil' && q.L === L && isTimer(q.p));
  const wired = t => Wr.some(w => on(w, ...t));
  // an arrow, its point at x, y, pointing along ux, uy (into a wire: where power comes from somewhere else)
  const inArrow = (x, y, ux, uy) => { const bx = x - ux * 22, by = y - uy * 22, px = -uy * 13, py = ux * 13;
    g += `<path class="arr in" d="M${bx + px} ${by + py} L${bx - px} ${by - py} L${x} ${y} Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="miter"/>`; };

  // the bars, then the wires, then the joints
  if (bars) { const ys = Wr.flatMap(w => ends(w)).filter(([x]) => x === 0 || x === RX).map(e => e[1]);
    if (ys.length) { const y0 = Math.min(...ys), y1 = Math.max(...ys); line(0, y0 - 40, 0, y1, PRINT_W + 2); line(RX, y0 - 40, RX, y1, PRINT_W + 2);
      inArrow(0, y0 - 40, 0, 1); inArrow(RX, y0 - 40, 0, 1); text(0, y0 - 72, 'L1', 28); text(RX, y0 - 72, 'L2', 28); } }
  for (const w of Wr) line(w.x1, w.y1, w.x2, w.y2);
  // (a selector switch's blocks linked by a dashed line, each to the next one down where they line up: drawn first, under them)
  // (and a limit, temperature or pressure switch's contacts, given one number: Dallas, 12 Nov 2026)
  const sels = {}; for (const q of P) if (q.t === 'sel' || isLim(q.p || q)) { const k = q.t === 'sel' ? 'S' + q.L : q.t + q.L; (sels[k] = sels[k] || []).push(q); }
  for (const L in sels) { const bs = sels[L].sort((a, b) => a.y - b.y), sw = bs[0].t !== 'sel';   // (a switch's contacts: from under one's lever to the top of the next, its name on white)
    for (let i = 1; i < bs.length; i++) if (bs[i].x === bs[i - 1].x) { if (sw) bs[i].linked = true; g += `<line x1="${bs[i].x}" y1="${bs[i - 1].y + (sw ? 26 : -40)}" x2="${bs[i].x}" y2="${bs[i].y - 40}" stroke-width="3" stroke-dasharray="12 10" stroke-linecap="butt"/>`; } }
  for (const [x, y] of dots.values()) g += `<circle cx="${x}" cy="${y}" r="8" fill="#000" stroke="none"/>`;

  for (const q of P) {
    const { x, y, p } = q;
    switch (q.t) {
      case 'ph': case 'l1': case 'l2': { const name = q.t === 'ph' ? 'L' + q.L : q.t.toUpperCase();
        // (coming from somewhere else: an arrow at the start of each wire it feeds, pointing in to the wire; its name behind)
        const fed = q.terms.filter(wired);
        for (const [tx, ty] of fed) { const ux = Math.sign(tx - x), uy = Math.sign(ty - y); inArrow(tx, ty, ux, uy);
          if (uy) text(tx, ty - uy * 34 + (uy < 0 ? 22 : 0), name, 28); else text(tx - ux * 30, ty + 10, name, 28, ux > 0 ? 'end' : 'start'); }
        if (!fed.length) text(x, y + 10, name, 28); break; }
      case 'jmp': { g += `<circle cx="${x}" cy="${y}" r="16" stroke-width="${PRINT_W}" fill="#fff"/>`; text(x, y + 8, q.L, 22);
        q.terms.forEach(t => { if (wired(t)) { const dx = Math.sign(t[0] - x) * 16, dy = Math.sign(t[1] - y) * 16; line(t[0], t[1], x + dx, y + dy); } }); break; }
      case 'btn': two(q, p.estop ? 'NC EStop Pushbutton' : p.nc ? 'NC Pushbutton' : 'NO Pushbutton', uniqueLabel('btn', q.L) ? '' : p.label || ''); break;
      case 'sel': { // (Dallas's selector switch: a contact block in each rung it is drawn in, its turning arrow on the top one,
        // which carries its tag; under each, the positions that block is closed in; a dashed line links the blocks, below)
        const main = mainSel(q.L) === p, names = (p.names || []).slice(0, selN(p)), cl = (p.closedIn || []).map(i => names[i] || String(i + 1));
        two(q, main ? 'Selector Switch Operator' : 'Selector Switch', cl.length ? 'CLOSED: ' + cl.join(', ') : 'OPEN IN ALL', !main); break; }
      case 'con': { const tm = timerOf(q.L), timed = tm && !p.inst; two(q, timed ? `${p.nc ? 'NC' : 'NO'} ${tm.p.tof ? 'FD' : 'ND'} Switch` : `${p.nc ? 'NC' : 'NO'} Contact`); break; }
      case 'olc': two(q, 'NC Contact'); break;
      case 'coil': { const ul = uniqueLabel('coil', q.L);   // (labelled: its name over it; otherwise its letter in it, any label under it)
        two(q, 'Relay', [ul ? '' : p.label, isTimer(p) ? `${p.tof ? 'OFF' : 'ON'}-DELAY ${p.delay} s` : ''].filter(Boolean).join(' · '), !ul); if (!ul) text(x, y + 9, q.L, q.L.length > 1 ? 21 : 26); break; }
      case 'lamp': two(q, 'Pilot Light', colourName(p.color)); break;
      case 'sol': two(q, 'Solenoid'); break;
      case 'htr': two(q, 'Heating Element'); break;
      case 'fu1': two(q, 'Fuse'); break;
      case 'tsw': two(q, `${p.nc ? 'NC' : 'NO'} Temperature Switch`, p.low ? 'LOW TEMP' : 'HIGH TEMP'); break;
      case 'psw': two(q, `${p.nc ? 'NC' : 'NO'} Pressure Switch`); break;
      case 'lsw': two(q, p.held ? (p.nc ? 'NC HO Limit Switch' : 'NO HC Limit Switch') : `${p.nc ? 'NC' : 'NO'} Limit Switch`); break;
      case 'dsc': three(q, '3PH Disconnect'); break;
      case 'fus': { // (each fuse its own number: FU1, FU2, FU3 down the block)
        const s = put('3PH Fuses', q.x, q.y), sp = pts(s, q.x, q.y, false); q.terms.forEach((t, i) => line(t[0], t[1], sp[i][0], sp[i][1]));
        for (let i = 0; i < 3; i++) text(q.x, sp[2 * i][1] - 24, 'FU' + (+q.L + i), 26); break; }
      case 'mst': three(q, '3PH Starter Contacts'); break;
      case 'olh': three(q, '3PH Thermal Overload'); break;
      case 'mtr': { // the circle level with T2, the leads in to it, T1 and T3 bending in
        const cy = q.terms[1][1], s = put('Motor', x, cy), bend = x - 130;
        q.terms.forEach(([ax, yy], i) => { const [ex, ey] = s.t[i]; if (i === 1) line(ax, yy, x + ex, cy); else { line(ax, yy, bend, yy); line(bend, yy, x + ex, cy + ey); } });
        text(x, cy + 10, 'M' + q.L, 28); break; }
      case 'xfm': { const [H1, H2, X1, X2] = q.terms, cx = (H1[0] + H2[0]) / 2, cy = (H1[1] + X1[1]) / 2, s = put('Control Transformer', cx, cy);
        [H1, H2, X1, X2].forEach(([tx, ty], i) => line(tx, ty, cx + s.t[i][0], cy + s.t[i][1]));
        text(H1[0] - 12, H1[1] + 26, 'H1', 20, 'end', 600); text(H2[0] + 12, H2[1] + 26, 'H2', 20, 'start', 600); text(X1[0] - 12, X1[1] - 10, 'X1', 20, 'end', 600); text(X2[0] + 12, X2[1] - 10, 'X2', 20, 'start', 600);
        text(H2[0] + 40, cy + 9, tag(q), 26, 'start'); break; }
    }
  }

  // wire numbers: once on each straight run of a wire between parts (runs split at a joint count as one), above it
  const termSet = new Set(P.flatMap(q => q.terms.map(t => kp(...t))));
  const runs = new Map();
  for (const w of Wr) { const n = wNet(w); if (!NUM.has(n) || PHASE.has(n) || w.y1 !== w.y2) continue; const k = n + '@' + w.y1; if (!runs.has(k)) runs.set(k, []); runs.get(k).push([w.x1, w.x2]); }
  for (const [k, segs] of runs) {
    const [n, y] = k.split('@').map(Number); segs.sort((a, b) => a[0] - b[0]);
    const spans = []; for (const [a, b] of segs) { const L = spans[spans.length - 1]; if (L && a <= L[1]) L[1] = Math.max(L[1], b); else spans.push([a, b]); }
    for (const [a, b] of spans) {
      let touches = (bars && (a === 0 || b === RX)); for (let x = a; x <= b && !touches; x += 20) if (termSet.has(kp(x, y))) touches = true;
      if (!touches || b - a < 40) continue;
      const stops = [a, b, ...[...dots.values()].filter(([dx, dy]) => dy === y && dx > a && dx < b).map(([dx]) => dx)].sort((p, q) => p - q);
      let best = [a, b], bl = -1; for (let i = 0; i < stops.length - 1; i++) if (stops[i + 1] - stops[i] > bl) { bl = stops[i + 1] - stops[i]; best = [stops[i], stops[i + 1]]; }
      g += `<text class="wn" x="${(best[0] + best[1]) / 2}" y="${y - 9}" font-size="22" text-anchor="middle" font-weight="700">${esc(NUM.get(n))}</text>`;
    }
  }
  for (const [y, n] of LINE) g += `<text class="ln" x="${xLeft - 34}" y="${y + 8}" font-size="24" text-anchor="end" font-weight="700">${n}</text>`;
  for (const c of P.filter(q => q.t === 'coil').sort((a, b) => a.y - b.y || a.x - b.x)) {
    const xs = xref(c); let tx = xRight + 22;
    xs.forEach((r, i) => { const s = String(r.n) + (i < xs.length - 1 ? ',' : ''); g += `<text class="xr" x="${tx}" y="${c.y + 8}" font-size="22" font-weight="600"${r.nc ? ' text-decoration="underline"' : ''}>${s}</text>`; tx += s.length * 12.5 + 6; });
  }

  /* ---------- the sheets ---------- */
  const allX = Wr.flatMap(w => [w.x1, w.x2]).concat(P.flatMap(q => q.terms.map(t => t[0])), P.map(q => q.x + (q.t === 'mtr' ? 70 : 0))), allY = Wr.flatMap(w => [w.y1, w.y2]).concat(P.flatMap(q => q.terms.map(t => t[1])));
  if (!allX.length) { allX.push(0, 400); allY.push(0, 300); }
  const bx0 = Math.min(...allX, xLeft) - 110, bx1 = Math.max(...allX, xRight + (P.some(q => q.t === 'coil') ? 190 : 0)) + 60, by0 = Math.min(...allY) - 110, by1 = Math.max(...allY) + 70;
  const dw = bx1 - bx0, dh = by1 - by0;
  // the room for the drawing on a sheet, in inches (the sheet less its margins, frame and title block)
  const notes = [xf ? `1 = control L1 (X1${xfFuse ? ', after FU' + xfFuse.L : ''}); 2 = control L2 (X2).` : n1 != null ? '1 = L1; 2 = L2.' : '',
    PHASE.size ? 'Power: L1-L3 up to the starters, T after them; A, B... after each part.' : '',
    P.some(q => q.t === 'coil') ? 'Numbers right of a coil: the lines its contacts are on. Underlined = NC; PWR = power contacts.' : ''].filter(Boolean);
  const TB = notes.length ? 1.12 : .98, room = land => land ? [11 - .8 - .24, 8.5 - .8 - .24 - TB] : [8.5 - .8 - .24, 11 - .8 - .24 - TB];
  // the scale (inches a unit): Large, at most PRINT_SCALE (wire numbers about 8 pt), as many sheets as it takes,
  // the sheet turned whichever way draws it bigger; Fit, the whole circuit on one sheet
  const plan = land => { const [rw, rh] = room(land), s = fit ? Math.min(rw / dw, rh / dh) : Math.min(PRINT_SCALE, rw / dw); return { land, s, rw, rh, n: Math.ceil(dh * s / rh - 1e-6) }; };
  const A = plan(false), B = plan(true), pl = B.s > A.s * 1.04 || (Math.abs(B.s - A.s) <= A.s * .04 && B.n < A.n) ? B : A;
  const landscape = pl.land, s = pl.s, Wu = pl.rw / s, Hu = pl.rh / s;
  // (split over sheets, each band of the ladder has clear space above and below it, for the arrows where it carries on)
  const split = dh > Hu + 1, M = split ? PRINT_GAP / s : 0, Hb = Hu - 2 * M;
  // where a sheet may end: in a gap between rows of parts (never through a part, its name, or a wire's number)
  const busy = [];
  for (const q of P) { const [t, b] = PRINT_POWER.has(q.t) && q.t !== 'xfm' ? (q.t === 'mtr' ? [130, 130] : [190, 150]) : q.t === 'xfm' ? [q.y - q.terms[0][1] + 30, q.terms[2][1] - q.y + 20] : isBox(q.p) ? [40, 40] : [74, 48]; busy.push([q.y - t, q.y + b]); }
  for (const w of Wr) if (w.y1 === w.y2) busy.push([w.y1 - 32, w.y1 + 8]);
  busy.sort((a, b) => a[0] - b[0]);
  const free = y => !busy.some(([a, b]) => y > a && y < b);
  // (best of all just above a rung that starts at L1, so a rung and its branches stay together; the control circuit's
  // first rung counts as one, so the power circuit can have a sheet to itself)
  const starts = [...new Set([rows[0], ...Wr.filter(w => w.y1 === w.y2 && wNet(w) === n1 && LINE.has(w.y1)).map(w => w.y1)])].filter(y => y != null).sort((a, b) => a - b);
  const allRows = [...new Set([...P.map(q => q.y), ...Wr.filter(w => w.y1 === w.y2).map(w => w.y1)])].sort((a, b) => a - b);
  const above = y => { const prev = allRows.filter(r => r < y).pop() ?? y - 400; for (let c = y - 20; c > prev + 10; c -= 5) if (free(c)) return c; return null; };
  const good = starts.map(above).filter(c => c != null);
  const cuts = [by0];
  while (cuts[cuts.length - 1] + Hb < by1 - 1) {
    const top = cuts[cuts.length - 1], lim = top + Hb;
    let c = good.filter(y => y > top + Hb * .25 && y <= lim).pop() ?? null;
    if (c == null) for (let y = Math.floor(lim); y > top + Hb * .35; y -= 5) if (free(y)) { c = y; break; }
    cuts.push(c ?? lim);
  }
  cuts.push(by1);
  const n = cuts.length - 1, today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }), title = esc(circuitName || 'Untitled circuit');
  const x0 = bx0 - (Wu - dw) / 2, uid = Math.random().toString(36).slice(2, 7);
  const pages = [];
  for (let k = 0; k < n; k++) {
    const top = cuts[k], bot = cuts[k + 1], more = k < n - 1;
    // (each sheet the same scale: its own band of the drawing, the rest clipped off; where it carries on, said so, and
    // an arrow at the end of each wire that crosses the break: pointing on, away from the wire, where it leaves the
    // sheet; pointing in, towards the wire, where it comes onto the next)
    const cross = c => Wr.filter(w => w.x1 === w.x2 && w.y1 < c - 1 && w.y2 > c + 1).sort((a, b) => a.x1 - b.x1);
    const arrow = (x, y, dir, label) => `<path class="arr" d="M${x - 13} ${y} L${x + 13} ${y} L${x} ${y + dir * 22} Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="miter"/>`
      + (label ? `<text x="${x + 18}" y="${y + dir * 16 + (dir > 0 ? 4 : 8)}" font-size="18" font-weight="700">${esc(label)}</text>` : '');
    let cont = '';
    if (k) { cont += `<text x="${x0 + Wu - 10}" y="${top - M + 30}" font-size="20" text-anchor="end" font-weight="700">CONTINUED FROM SHEET ${k}</text>`;
      for (const w of cross(top)) cont += arrow(w.x1, top - 24, 1, NUM.get(wNet(w))); }   // (in: the point at the wire's top end)
    if (more) { cont += `<text x="${x0 + Wu - 10}" y="${bot + M - 14}" font-size="20" text-anchor="end" font-weight="700">CONTINUED ON SHEET ${k + 2}</text>`;
      for (const w of cross(bot)) cont += arrow(w.x1, bot + 2, 1, NUM.get(wNet(w))); }   // (on: the point away below the wire's end)
    pages.push(`<div class="pr-page${landscape ? ' land' : ''}"><div class="pr-frame">
<div class="pr-draw"><svg viewBox="${x0} ${top - M} ${Wu} ${Hu}" preserveAspectRatio="xMidYMin meet" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="pc${uid}${k}"><rect x="${x0}" y="${top}" width="${Wu}" height="${bot - top + 1}"/></clipPath></defs><g fill="none" stroke="#000" stroke-width="${PRINT_W}" stroke-linecap="round" stroke-linejoin="round"><g clip-path="url(#pc${uid}${k})">${g}</g>${cont}</g></svg></div>
<div class="pr-tb">
  <div class="c1 big"><div class="k">Drawing title</div><div class="v">${title}</div></div>
  <div><div class="k">Drawing type</div><div class="v">Ladder diagram</div></div>
  <div><div class="k">Drawn by</div><div class="v">${esc(drawnBy || '')}</div></div>
  <div><div class="k">Date</div><div class="v">${today}</div></div>
  <div><div class="k">Rev</div><div class="v">A</div></div>
  <div class="c1 r2"><div class="k">Program / school</div><div class="v">Illinois Central College</div></div>
  <div class="r2"><div class="k">Course</div><div class="v">Electrical Troubleshooting</div></div>
  <div class="r2 span2"><div class="k">Made with</div><div class="v">O³ Circuit Builder</div></div>
  <div class="r2"><div class="k">Sheet</div><div class="v">${k + 1} of ${n}</div></div>
  ${notes.length ? `<div class="notes"><span class="k">Notes</span>${notes.map((t, i) => `<span>${i + 1}. ${esc(t)}</span>`).join('')}</div>` : ''}
</div></div></div>`);
  }
  return { html: pages.join(''), pages: n, landscape, scale: s, numbers: NUM, lines: LINE };
}

/* ---------------- the preview, and printing ---------------- */
const printDlg = document.getElementById('print-dlg'), printHost = document.getElementById('print-host');
let printLand = false, printFit = false;
try { printFit = localStorage.getItem(PRINT_SIZE_KEY) === 'fit'; } catch (_) {}
function showPrint() {
  const s = printSheet(document.getElementById('pd-name').value, printFit); printLand = s.landscape;
  for (const b of document.querySelectorAll('[data-psize]')) b.setAttribute('aria-pressed', String((b.dataset.psize === 'fit') === printFit));
  document.getElementById('pd-count').textContent = s.pages > 1 ? `${s.pages} letter sheets` : '1 letter sheet';   // (8.5 × 11 in)
  const view = document.getElementById('pd-view'), keep = [view.scrollLeft, view.scrollTop]; view.innerHTML = s.html;
  // (each sheet scaled to the zoom chosen, or to fit the preview's height; more than one, they stack, and the preview scrolls)
  requestAnimationFrame(() => { applyPrintZoom(); view.scrollLeft = keep[0]; view.scrollTop = keep[1]; });
  return s;
}
/* ---- zooming the preview: −, +, Fit (and the size, as a percentage of the real sheet), Ctrl + the wheel over the sheets, or
   Ctrl + plus, minus, 0; while zoomed in, the sheets can also be dragged about. Each time the preview opens, it fits. */
const PZ_STEPS = [.25, .33, .5, .67, .75, .9, 1, 1.25, 1.5, 2, 2.5, 3];
let printZoom = null;   // (null: fit)
const fitZoom = () => { const view = document.getElementById('pd-view'), pg = view.firstElementChild; if (!pg) return 1;
  const r = view.getBoundingClientRect(), z0 = parseFloat(pg.style.zoom) || 1; return Math.min((r.width - 32) / (pg.offsetWidth), (r.height - 32) / (pg.offsetHeight), 1.4); };
function applyPrintZoom() {
  const view = document.getElementById('pd-view'); for (const e of view.children) e.style.zoom = '';
  const z = printZoom ?? fitZoom(); for (const e of view.children) e.style.zoom = z.toFixed(3);
  document.getElementById('pz-level').textContent = Math.round(z * 100) + '%';
  document.getElementById('pz-fit').setAttribute('aria-pressed', String(printZoom == null));
  view.classList.toggle('zoomed', view.scrollWidth > view.clientWidth + 1 || view.scrollHeight > view.clientHeight + 1);
}
// (zoom to z, keeping the point under (cx, cy) on the screen where it is)
function zoomPrint(z, cx, cy) {
  const view = document.getElementById('pd-view'), r = view.getBoundingClientRect(), z0 = printZoom ?? fitZoom();
  z = Math.max(PZ_STEPS[0], Math.min(PZ_STEPS[PZ_STEPS.length - 1], z));
  if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
  const ox = view.scrollLeft + cx - r.left, oy = view.scrollTop + cy - r.top;
  printZoom = z; applyPrintZoom();
  view.scrollLeft = ox * z / z0 - (cx - r.left); view.scrollTop = oy * z / z0 - (cy - r.top);
}
const stepZoom = (d, cx, cy) => { const z0 = printZoom ?? fitZoom(); const next = d > 0 ? PZ_STEPS.find(v => v > z0 + .001) : [...PZ_STEPS].reverse().find(v => v < z0 - .001); zoomPrint(next ?? z0, cx, cy); };
document.getElementById('pz-in').addEventListener('click', () => stepZoom(1));
document.getElementById('pz-out').addEventListener('click', () => stepZoom(-1));
document.getElementById('pz-fit').addEventListener('click', () => { printZoom = null; applyPrintZoom(); });
document.getElementById('pz-level').addEventListener('click', () => zoomPrint(1));   // (the percentage: the real size)
document.getElementById('pd-view').addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); }, { passive: false });
printDlg.addEventListener('keydown', e => { if (!(e.ctrlKey || e.metaKey) || e.target.tagName === 'INPUT') return;
  if (e.key === '=' || e.key === '+') { e.preventDefault(); stepZoom(1); } else if (e.key === '-') { e.preventDefault(); stepZoom(-1); } else if (e.key === '0') { e.preventDefault(); printZoom = null; applyPrintZoom(); } });
// (dragging the sheets about, when they are bigger than the preview)
{ const view = document.getElementById('pd-view'); let d = null;
  view.addEventListener('pointerdown', e => { if (e.button !== 0 || !view.classList.contains('zoomed')) return; d = [e.clientX, e.clientY, view.scrollLeft, view.scrollTop]; view.setPointerCapture(e.pointerId); view.classList.add('panning'); });
  view.addEventListener('pointermove', e => { if (!d) return; view.scrollLeft = d[2] - (e.clientX - d[0]); view.scrollTop = d[3] - (e.clientY - d[1]); });
  const up = () => { d = null; view.classList.remove('panning'); }; view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up); }
window.addEventListener('resize', () => { if (printDlg.open && printZoom == null) applyPrintZoom(); });
function openPrint() {
  if (!parts.length && !wires.length) { say('Nothing to print yet: build a circuit first.'); return; }
  closeMenus(); const box = document.getElementById('pd-name');
  try { box.value = localStorage.getItem(PRINT_NAME_KEY) ?? 'Student Name'; } catch (_) { box.value = 'Student Name'; }
  printZoom = null; printDlg.showModal(); showPrint();
}
document.getElementById('print-btn').addEventListener('click', openPrint);
document.getElementById('pd-name').addEventListener('input', e => { try { localStorage.setItem(PRINT_NAME_KEY, e.target.value); } catch (_) {} showPrint(); });
for (const b of document.querySelectorAll('[data-psize]')) b.addEventListener('click', () => { printFit = b.dataset.psize === 'fit'; try { localStorage.setItem(PRINT_SIZE_KEY, printFit ? 'fit' : 'large'); } catch (_) {} showPrint(); });
document.getElementById('pd-close').addEventListener('click', () => printDlg.close());
document.getElementById('pd-print').addEventListener('click', () => {
  // (the sheets, alone, each on a page the right way round; the browser's print window can save them as a PDF too)
  printHost.innerHTML = printSheet(document.getElementById('pd-name').value, printFit).html;
  document.getElementById('print-page').textContent = `@page { size: ${printLand ? '11in 8.5in' : '8.5in 11in'}; margin: 0; }`;
  printDlg.close(); setTimeout(() => window.print(), 30);
});
window.addEventListener('afterprint', () => { printHost.innerHTML = ''; });
// Ctrl+P: the diagram, not a printout of the builder's screen
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); if (!printDlg.open) openPrint(); } });
