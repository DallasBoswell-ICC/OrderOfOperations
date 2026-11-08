/* =====================================================================
   Reading the drawing: what is joined to what (nets), and from that the wire numbers, the rung numbers and the
   cross-references. Done afresh from the drawing every time, so the numbers are always right for what is drawn.

   Joined: a wire's two ends; terminals and nodes at the same spot; every rail of the same name (L1 on any sheet
   is one wire); every line-in arrow of the same name. Not joined: wires that only cross.

   Wire numbers
   - Power: each line in (L1, L2, L3) takes its name; past each disconnect, fuse or overload it takes the next
     letter (L1, L1A, L1B...) up to the starters. Past a starter's contacts, each motor's leads are T1-T3 (the
     first motor), T4-T6 (the second)..., lettered again past each overload (T1, T1A).
   - Control: the control transformer's X1, past its fuse, is 1 (X1 itself is X1); X2 is 2. With no transformer,
     rail L1 is 1 and rail L2 is 2. The rest take the next numbers in reading order: rung by rung, top to bottom,
     each left to right (a wire's place: the first terminal on it, reading so).
   - A number typed on a wire (its num) is kept for its whole net, and never given to another.
   ===================================================================== */
const LET = d => d > 0 ? String.fromCharCode(64 + d) : '';
const isCtrlKind = k => k === 'sw' || k === 'contact' || k === 'coil' || k === 'load' || k === 'olc';
const isLoadKind = k => k === 'coil' || k === 'load';

function analyse(D = doc) {
  // ---- nets
  const par = new Map(), find = k => { let r = k; while (par.get(r) !== r) r = par.get(r); let c = k; while (par.get(c) !== r) { const n = par.get(c); par.set(c, r); c = n; } return r; };
  const mk = k => { if (!par.has(k)) par.set(k, k); return k; };
  const join = (a, b) => { a = find(mk(a)); b = find(mk(b)); if (a !== b) par.set(a, b); };
  const key = (s, e) => {
    if (e.p) return s.id + ':p:' + e.p + ':' + e.i;
    if (e.n) return s.id + ':n:' + e.n;
    const r = partOf(s, e.r); return 'RAIL:' + (r ? r.label : '?');
  };
  const terms = [];   // { s, k (sheet index), p, i, key, x, y }
  D.sheets.forEach((s, k) => {
    const at = new Map(), here = (x, y, kk) => { const c = x + ',' + y; if (at.has(c)) join(at.get(c), kk); else at.set(c, mk(kk)); };
    for (const p of s.parts) {
      if (p.t === 'rail') { mk('RAIL:' + p.label); continue; }
      for (let i = 0; i < termsN(p); i++) { const kk = mk(s.id + ':p:' + p.id + ':' + i), [x, y] = termPos(p, i); terms.push({ s, k, p, i, key: kk, x, y }); here(x, y, kk); }
      if (p.t === 'sup' && p.tag) join(s.id + ':p:' + p.id + ':0', 'SUP:' + p.tag);
    }
    for (const n of s.nodes) here(n.x, n.y, s.id + ':n:' + n.id);
    for (const w of s.wires) join(key(s, w.a), key(s, w.b));
  });
  const root = (s, e) => find(mk(key(s, e)));
  const rootT = (p, s, i) => find(mk(s.id + ':p:' + p.id + ':' + i));
  const wireRoot = (s, w) => root(s, w.a);
  const TERMS = new Map(); for (const t of terms) { const r = find(t.key); if (!TERMS.has(r)) TERMS.set(r, []); TERMS.get(r).push(t); }
  const WIRED = new Map(); D.sheets.forEach((s, k) => s.wires.forEach(w => { const r = wireRoot(s, w); if (!WIRED.has(r)) WIRED.set(r, []); WIRED.get(r).push({ s, k, w }); }));
  const kindOf = p => LIB[p.t].kind;
  const parts = []; D.sheets.forEach((s, k) => s.parts.forEach(p => { if (p.t !== 'rail') parts.push({ s, k, p }); }));
  const reading = (a, b) => a.k - b.k || a.p.y - b.p.y || a.p.x - b.p.x;

  // ---- wire numbers
  const label = new Map(), power = new Set(), taken = new Set();
  // (numbers typed on wires first: kept, and never given out again)
  for (const [r, ws] of WIRED) { const o = ws.find(x => x.w.num); if (o) { label.set(r, String(o.w.num)); taken.add(String(o.w.num)); } }
  const give = (r, l) => { if (r == null || label.has(r)) return false; label.set(r, l); return true; };
  // (the poles a line passes through, and the starters' contacts)
  const CROSS = new Set(['power', 'fuse', 'ol']);
  const across = new Map(), addX = (a, b) => { if (!across.has(a)) across.set(a, []); across.get(a).push(b); };
  const starterLoad = new Set(), starterLine = new Map();
  for (const { s, p } of parts) {
    const k = kindOf(p); if (!CROSS.has(k) && k !== 'starter') continue;
    for (const [i, j] of polesOf(p.t)) {
      const a = rootT(p, s, i), b = rootT(p, s, j);
      if (k === 'starter') { starterLoad.add(b); starterLine.set(b, a); } else { addX(a, b); addX(b, a); }
    }
  }
  // power, the line side: from each line in, lettered at each pole passed, up to the starters
  const sups = parts.filter(x => x.p.t === 'sup').sort((a, b) => (a.p.tag || '').localeCompare(b.p.tag || '') || reading(a, b));
  const q = [];
  for (const { s, p } of sups) { const r = rootT(p, s, 0); power.add(r); if (give(r, p.tag || 'L?')) q.push([r, p.tag || 'L?', 0]); }
  while (q.length) {
    const [r, L, d] = q.shift();
    for (const m of across.get(r) || []) if (!label.has(m) && !starterLoad.has(m)) { label.set(m, L + LET(d + 1)); power.add(m); q.push([m, L, d + 1]); }
  }
  // power, the load side: each motor's leads, back from it to its starter
  const motors = parts.filter(x => kindOf(x.p) === 'motor').sort(reading);
  let tN = 0;
  motors.forEach(({ s, p }, mk_) => {
    const leads = [0, 1, 2].map(i => ({ i, y: termPos(p, i)[1] })).sort((a, b) => a.y - b.y);
    leads.forEach(({ i }, j) => {
      const chain = [rootT(p, s, i)];
      for (let g = 0; g < 30 && !starterLoad.has(chain[chain.length - 1]); g++) {
        const nx = (across.get(chain[chain.length - 1]) || []).find(m => !chain.includes(m) && !label.has(m)); if (nx == null) break; chain.push(nx);
      }
      const n = 3 * mk_ + j + 1; tN = Math.max(tN, n);
      if (starterLoad.has(chain[chain.length - 1])) chain.reverse().forEach((r, d) => { if (give(r, 'T' + n + LET(d))) power.add(r); });
      else { power.add(chain[0]); give(chain[0], 'T' + n); }
    });
  });
  // (a starter's contacts with no motor after them: T numbers of their own)
  for (const { s, p } of parts.filter(x => kindOf(x.p) === 'starter').sort(reading))
    for (const [, j] of polesOf(p.t)) { const r = rootT(p, s, j); if (!label.has(r)) { label.set(r, 'T' + (++tN)); power.add(r); } }
  for (const { s, p } of parts) if (isPowerKind(kindOf(p))) for (let i = 0; i < termsN(p); i++) power.add(rootT(p, s, i));
  // control: 1 and 2
  const xf = parts.filter(x => kindOf(x.p) === 'xfmr').sort(reading)[0];
  let n1 = null, n2 = null, x1fuse = null;
  if (xf) {
    const rX1 = rootT(xf.p, xf.s, 2), rX2 = rootT(xf.p, xf.s, 3);
    for (const i of [0, 1]) power.add(rootT(xf.p, xf.s, i));
    const fu = parts.find(x => kindOf(x.p) === 'fuse' && [0, 1].some(i => rootT(x.p, x.s, i) === rX1));
    if (fu) { x1fuse = fu.p; give(rX1, 'X1'); n1 = rootT(fu.p, fu.s, rootT(fu.p, fu.s, 0) === rX1 ? 1 : 0); }
    else n1 = rX1;
    n2 = rX2;
  }
  const r1 = par.has('RAIL:L1') ? find('RAIL:L1') : null, r2 = par.has('RAIL:L2') ? find('RAIL:L2') : null;
  if (n1 == null) n1 = r1; if (n2 == null) n2 = r2;
  const startAt = n1 != null || n2 != null ? 3 : 1;
  if (n1 != null && !taken.has('1')) give(n1, '1');
  if (n2 != null && n2 !== n1 && !taken.has('2')) give(n2, '2');
  // control: the rest, in reading order (a net's place: its first terminal, rung by rung, left to right)
  const place = r => {
    let b = null; for (const t of TERMS.get(r) || []) if (!b || t.k < b[0] || (t.k === b[0] && (t.y < b[1] || (t.y === b[1] && t.x < b[2])))) b = [t.k, t.y, t.x];
    if (!b) for (const { s, k, w } of WIRED.get(r) || []) for (const [x, y] of wirePts(s, w)) if (!b || k < b[0] || (k === b[0] && (y < b[1] || (y === b[1] && x < b[2])))) b = [k, y, x];
    return b || [1e9, 1e9, 1e9];
  };
  // (a power wire not reached from a line in: no control number for it, or it would push every control number on one)
  for (const r of WIRED.keys()) if (!label.has(r) && power.has(r)) label.set(r, '?');
  const rest = [...WIRED.keys()].filter(r => !label.has(r)).map(r => ({ r, b: place(r) }))
    .sort((a, b) => a.b[0] - b.b[0] || a.b[1] - b.b[1] || a.b[2] - b.b[2]);
  let next = startAt;
  for (const { r } of rest) { while (taken.has(String(next))) next++; label.set(r, String(next++)); }

  // ---- rung numbers: the rows the control devices are on, top to bottom, sheet after sheet
  const rung = new Map(), rows = [];
  let rn = 0;
  D.sheets.forEach((s, k) => {
    const ys = new Set();
    for (const p of s.parts) {
      if (p.t === 'rail' || (p.rot || 0) % 180) continue;
      const kd = kindOf(p);
      const ctl = isCtrlKind(kd) || (kd === 'fuse' && p !== x1fuse && [0, 1].every(i => !power.has(rootT(p, s, i))));
      if (ctl && [...Array(termsN(p)).keys()].some(i => wiresAt(s, { p: p.id, i }).length)) ys.add(p.y);   // (one not wired in yet takes no rung number)
    }
    const sorted = [...ys].sort((a, b) => a - b), map = new Map(sorted.map(y => [y, ++rn]));
    rows.push(sorted.map(y => ({ y, n: map.get(y) })));
    for (const p of s.parts) if (p.t !== 'rail' && map.has(p.y) && !((p.rot || 0) % 180)) rung.set(p.id, map.get(p.y));
  });
  // ---- cross-references: a coil's contacts' rungs (NC underlined), PWR for its starter contacts
  const xref = new Map();
  for (const { p } of parts) if (kindOf(p) === 'coil' && p.tag) {
    const r = [];
    for (const { p: c } of parts) if (kindOf(c) === 'contact' && c.tag === p.tag && rung.has(c.id)) r.push({ n: rung.get(c.id), nc: c.t === 'con_nc' });
    r.sort((a, b) => a.n - b.n);
    if (parts.some(x => kindOf(x.p) === 'starter' && x.p.tag === p.tag)) r.push({ n: 'PWR', nc: false });
    xref.set(p.id, r);
  }
  return { label, power, rung, rows, xref, root, rootT, wireRoot, TERMS, WIRED, parts, x1fuse, n1, n2, kindOf };
}
