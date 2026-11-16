/* =====================================================================
   O³ link (Dallas, 16 Nov 2026): Circuit Builder and Print Builder open each other's work.
     printToCircuit(doc)  a Print Builder print -> a Circuit Builder circuit (its saved form), and notes on what changed
     circuitToPrint(d)    a Circuit Builder circuit (its saved form) -> a Print Builder print, and notes
   Both work on the drawings as they are: the two programs share a grid and nearly the same scale, so each part keeps
   its place, takes the other program's nearest part (the notes list every swap and anything left out), and each wire
   keeps its path, with its ends moved onto the new part's terminals where the two differ (a coil's ends are 60 out in
   Circuit Builder, 40 on the print). A print made from a circuit carries the circuit with it: back unchanged, the
   circuit comes back exactly; changed, each part made from the circuit gets back what only Circuit Builder knows
   (its colour, label, process values and links, planted faults, scenarios, the work order).
   This file is in both programs (each build takes it from shared/); where each conversion runs: printToCircuit in
   Circuit Builder (a print opened there, or sent with Open in Circuit Builder), circuitToPrint in Print Builder.
   ===================================================================== */
const LINK_KEY = 'o3-link:handoff';   // (the work handed from one program to the other, in this site's storage)
// Print Builder's papers, for laying sheets one under another (its own model.js has the same)
const LINK_PAPERS = { letter: [8.5, 11], legal: [8.5, 14], tabloid: [11, 17], ansic: [17, 22], a4: [8.27, 11.69], a3: [11.69, 16.54] };
const LINK_U_IN = 312.5;
const linkPaper = s => { const k = s.paper && (LINK_PAPERS[s.paper] || s.paper === 'custom') ? s.paper : 'letter'; const [w, h] = k === 'custom' ? [s.pw, s.ph] : LINK_PAPERS[k]; return s.land ? [h, w] : [w, h]; };
const linkDrawH = s => Math.round((linkPaper(s)[1] - .8 - .24 - 1.25) * LINK_U_IN);
const linkDrawW = s => Math.round((linkPaper(s)[0] - .8 - .24) * LINK_U_IN);
const linkSnap = v => Math.round(v / 20) * 20;
const linkDigits = (s, d) => { const m = String(s || '').match(/\d+/); return m ? String(+m[0]) : d; };

// ---- a print's terminals: where each part's wires join it (turned and flipped as the part is)
function linkTurn([a, b], r) { return r === 90 ? [-b, a] : r === 180 ? [-a, -b] : r === 270 ? [b, -a] : [a, b]; }
function linkPbTerms(p) { const ts = LINK_PB_TERMS[p.t] || []; return ts.map(([a, b]) => { const [u, v] = linkTurn(p.fx ? [-a, b] : [a, b], p.rot || 0); return [p.x + u, p.y + v]; }); }
function linkPbPos(s, e) {
  if (e.p) { const p = s.parts.find(q => q.id === e.p); return p ? linkPbTerms(p)[e.i] || [p.x, p.y] : null; }
  if (e.n) { const n = (s.nodes || []).find(q => q.id === e.n); return n ? [n.x, n.y] : null; }
  if (e.r) { const r = s.parts.find(q => q.id === e.r); return r ? [r.x, Math.max(r.y0, Math.min(r.y1, e.y))] : null; }
  return null;
}
// a Circuit Builder part's terminals (from its saved row's type, place and turn)
function linkCbTerms(t, x, y, rot) { const ts = LINK_CB_TERMS[t + (rot ? '@' + rot : '')] || LINK_CB_TERMS[t] || []; return ts.map(([a, b]) => [x + a, y + b]); }

// a wire's points, its ends moved to new places (new ends: a run across or up and down, as the wire went)
function linkMoveEnds(pts, a, b) {
  const out = pts.map(q => [q[0], q[1]]);
  const fix = (end, to) => {
    if (!to) return;
    const i = end ? out.length - 1 : 0, j = end ? out.length - 2 : 1, q = out[i], nb = out[j];
    if (to[0] === q[0] && to[1] === q[1]) return;
    // (in line with the wire's last run: just longer or shorter)
    if (nb && ((q[1] === nb[1] && to[1] === q[1]) || (q[0] === nb[0] && to[0] === q[0]))) { out[i] = [to[0], to[1]]; return; }
    // (otherwise a short bend: from the new end, across (or up) to where the old end was)
    const mid = q[1] === (nb || q)[1] ? [q[0], to[1]] : [to[0], q[1]];
    if (end) out.splice(i, 1, q, mid, to); else out.splice(0, 1, to, mid, q);
  };
  fix(false, a); fix(true, b);
  // (no two points the same, and no point in the middle of a straight run)
  const r = []; for (const q of out) { const l = r[r.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) r.push(q); }
  for (let k = r.length - 2; k >= 1; k--) { const [p0, p1, p2] = [r[k - 1], r[k], r[k + 1]]; if ((p0[0] === p1[0] && p1[0] === p2[0]) || (p0[1] === p1[1] && p1[1] === p2[1])) r.splice(k, 1); }
  return r;
}
// a print's own fingerprint: what it shows, in any order (to tell whether a print made from a circuit was changed)
function linkFingerprint(doc) {
  const items = [];
  doc.sheets.forEach((s, k) => {
    for (const p of s.parts) items.push([k, p.t, p.x, p.y, p.rot || 0, p.fx ? 1 : 0, p.tag || '', p.desc || '', p.delay || 0, p.tof ? 1 : 0, (p.closedIn || []).join('.'), p.pos || '', p.inPB || '', p.inst ? 1 : 0, p.label || '', p.y0 || 0, p.y1 || 0].join('|'));
    for (const w of s.wires) { const pts = [linkPbPos(s, w.a), ...(w.pts || []), linkPbPos(s, w.b)].filter(Boolean); items.push(k + '|w|' + pts.map(q => q.join(',')).join(';')); }
  });
  return items.sort().join('\n');
}

/* =====================================================================
   A print -> a circuit
   ===================================================================== */
const LINK_LAMP_COL = { GREEN: '00B050', GRN: '00B050', RED: 'FF0032', AMBER: 'FF9600', AMB: 'FF9600', ORANGE: 'FF9600', YELLOW: 'FFDC00', YLW: 'FFDC00', BLUE: '0070C0', BLU: '0070C0', WHITE: 'FFFFFF', WHT: 'FFFFFF', CLEAR: 'FFFFFF', VIOLET: '7030A0', PURPLE: '7030A0', PINK: 'EC008C', MAGENTA: 'EC008C', TEAL: '00D2BE' };
const LINK_PAL = ['FFDC00', 'EC008C', '7030A0', '00D2BE', 'FF9600', '0070C0', '00B050', 'FF0032'];
function printToCircuit(doc) {
  if (!doc || doc.kind !== 'o3-print' || !Array.isArray(doc.sheets)) throw new Error('That is not a print from Print Builder.');
  // (made from a circuit and not changed since: the circuit itself, exactly)
  if (doc.link && doc.link.cb && doc.link.fp && doc.link.fp === linkFingerprint(doc)) return { data: JSON.parse(JSON.stringify(doc.link.cb)), notes: { changed: [], left: [], same: true } };
  const changed = [], left = [], note = (list, s) => { if (!list.includes(s)) list.push(s); };
  const all = []; doc.sheets.forEach((s, k) => { for (const p of s.parts) all.push({ s, k, p }); });
  const LK = doc.link && doc.link.cb && Array.isArray(doc.link.oy) ? doc.link : null;   // (made from a circuit: its own places, to map back to)
  const power = LK ? LK.cb.pw === 'boxes' : all.some(({ p }) => ['sup', 'xfmr', 'dsc3', 'fdsc3', 'fus3', 'mst3', 'ol3', 'motor', 'src_l1', 'src_l2', 'cb3', 'cb2'].includes(p.t));
  // where each sheet goes: one under another; across, the L1 rail at Circuit Builder's L1 bar (or, with power, a margin)
  const rails = all.filter(({ p }) => p.t === 'rail');
  const rL1 = rails.find(({ p }) => p.label === 'L1'), rL2 = rails.find(({ p }) => p.label === 'L2');
  const xs = all.filter(({ p }) => p.t !== 'rail').flatMap(({ p }) => linkPbTerms(p).map(q => q[0]).concat(p.x));
  const minX = Math.min(...xs, rL1 ? rL1.p.x : Infinity);
  const DX = power ? linkSnap(140 - minX) : -(rL1 ? rL1.p.x : 200);
  // (a print's rungs can sit closer than Circuit Builder's parts are tall: rows nearer than 160 are spread to 160, the rest kept as drawn)
  const F = doc.sheets.map(sh => {
    const keys = [...new Set(sh.parts.filter(p => p.t !== 'rail').flatMap(p => { const ts = linkPbTerms(p); return ts.length > 1 && ts.every(q => q[1] === ts[0][1]) ? [p.y] : ts.length > 2 ? ts.map(q => q[1]) : []; }))].sort((a, b) => a - b);
    if (LK || keys.length < 2) return y => y;
    // (between the lines of a three-phase part, a transformer or a motor, rows keep their spacing, so its terminals stay on its lines)
    const rigid = sh.parts.filter(p => p.t !== 'rail' && linkPbTerms(p).length > 2).map(p => { const ys = linkPbTerms(p).map(q => q[1]); return [Math.min(...ys), Math.max(...ys)]; });
    const to = [keys[0]]; for (let i = 1; i < keys.length; i++) { const g = keys[i] - keys[i - 1]; to.push(to[i - 1] + (rigid.some(([a, b]) => keys[i - 1] >= a && keys[i] <= b) ? g : Math.max(g, 160))); }
    return y => { if (y <= keys[0]) return y; for (let i = 1; i < keys.length; i++) if (y <= keys[i]) return to[i - 1] + (y - keys[i - 1]) * (to[i] - to[i - 1]) / (keys[i] - keys[i - 1]); return y - keys[keys.length - 1] + to[to.length - 1]; };
  });
  const DY = []; let y0 = 0; doc.sheets.forEach((s, k) => { const ys = s.parts.filter(p => p.t !== 'rail').map(p => p.y).concat(s.parts.filter(p => p.t === 'rail').map(p => p.y0)); const top = ys.length ? Math.min(...ys) : 0;
    const bot = Math.max(linkDrawH(s), ...s.parts.map(p => p.t === 'rail' ? p.y1 : p.y + 140), ...s.wires.flatMap(w => (w.pts || []).map(q => q[1])));
    DY[k] = linkSnap(y0 + 160 - top); y0 = DY[k] + F[k](bot) - 100; });
  let X = (x) => linkSnap(x + DX), Y = (k, y) => linkSnap(F[k](y) + DY[k]);
  if (LK) {   // (back to the circuit's own places: across as it was, down as it was before the print spread its rungs out)
    const oy = LK.oy, n = oy.length, step = n > 1 ? oy[n - 2] - oy[n - 1] : 3000, sy = LK.sy || 1;
    X = x => linkSnap(x - LK.ox); Y = (k, y) => linkSnap((y - (k < n ? oy[k] : oy[n - 1] - (k - n + 1) * step)) / sy);
  }
  const W = !power && rL1 && rL2 ? (LK ? X(rL2.p.x) - X(rL1.p.x) : linkSnap(rL2.p.x - rL1.p.x)) : 0;

  // letters: pushbuttons and selectors first (A, B...), then coils; M kept for a starter's coil
  const LET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].concat([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].flatMap(a => [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(b => a + b)));
  const used = new Set(), take = pref => { if (pref && !used.has(pref)) { used.add(pref); return pref; } const l = LET.find(c => !used.has(c)); used.add(l); return l; };
  const opKey = p => (/^pbm?_/.test(p.t) ? 'PB' : p.t === 'estop' ? 'ES' : p.t === 'sel' ? 'SS' : p.t) + ':' + (p.tag || p.id);
  const opL = new Map(), coilL = new Map();
  const starters = new Set(all.filter(({ p }) => p.t === 'mst3').map(({ p }) => p.tag));
  for (const { p } of all) if (p.t === 'coil' && starters.has(p.tag) && !coilL.has(p.tag)) coilL.set(p.tag, take('M'));
  for (const { p } of all) if (/^(pbm?_|estop|sel|spst)/.test(p.t) && !opL.has(opKey(p))) opL.set(opKey(p), take());
  for (const { p } of all) if (p.t === 'coil' && !coilL.has(p.tag)) coilL.set(p.tag, take());
  const lab = s => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 8);
  // numbers for limit switches (a print's proximity and float switches become limit switches too: the next free ones)
  const lsN = new Set(all.filter(({ p }) => /^ls_/.test(p.t)).map(({ p }) => linkDigits(p.tag, '')).filter(Boolean)), nextLS = () => { let n = 1; while (lsN.has(String(n))) n++; lsN.add(String(n)); return String(n); };
  const swapLS = new Map();
  const jmpN = new Map();   // (a continuation's name -> its number)

  const parts = [], fromIdx = [], terms = new Map();   // (terms: a print part -> [its terminals here, in its own order])
  const add = (src, row, ts) => { parts.push(row); fromIdx.push(src); if (ts) terms.set(src.p, ts); return row; };
  let coilN = 0; const noCoil = [], ownCol = new Set();   // (ownCol: lights whose colour the print names)
  for (const it of all) {
    const { p, k } = it, x = X(p.x), y = Y(k, p.y), pb = linkPbTerms(p).map(q => [X(q[0]), Y(k, q[1])]), name = p.tag || (LIB_NAME_FOR[p.t] || p.t);
    const two = (t, row) => { const ts = linkCbTerms(t, x, y, 0); add(it, row, pb.length === 2 && pb[0][0] > pb[1][0] ? [ts[1], ts[0]] : ts); };   // (a flipped part: its first terminal on the right)
    if (p.t === 'rail') continue;
    if (p.brk && LK) { it.brk = pb[0]; continue; }   // (a continuation the print put where a wire ran over onto the next sheet: the wire joins up again)
    if (/^pbm?_/.test(p.t) || p.t === 'estop') {
      const est = p.t === 'estop', row = [est ? 'est' : 'btn', x, y, opL.get(opKey(p)), est || /_nc$/.test(p.t) ? 1 : 0, est || /^pbm/.test(p.t) ? 1 : 0, est ? 'FF0032' : /_nc$/.test(p.t) ? 'FF0032' : '00B050'];
      const l = lab(p.desc || p.tag); if (l) { while (row.length < 9) row.push(null); row.push(l); }
      two('btn', row);
    } else if (p.t === 'sel') {
      const names = (p.pos || 'OFF/ON').split(/[\/,]+/).map(s => s.trim().toUpperCase().slice(0, 5)).filter(Boolean).slice(0, 4), n = Math.max(2, names.length);
      two('sel', ['sel', x, y, opL.get(opKey(p)), 0, 1, '0070C0', n, (p.closedIn || []).reduce((m, i) => m | 1 << i, 0), null, names.join('/'), 0]);
    } else if (p.t === 'spst') {
      note(changed, `${name} toggle switch → a maintained pushbutton`);
      two('btn', ['btn', x, y, opL.get(opKey(p)), 0, 1, '00B050', null, null, lab(p.desc || p.tag)]);
    } else if (/^(ls_|prs_|fs_)/.test(p.t)) {
      let n = linkDigits(p.tag, '1');
      if (!/^ls_/.test(p.t)) { const key = p.t.split('_')[0] + ':' + p.tag; if (!swapLS.has(key)) swapLS.set(key, nextLS()); n = swapLS.get(key); note(changed, `${p.tag || ''} ${/^prs/.test(p.t) ? 'proximity' : 'float'} switch → limit switch LS${n} (Circuit Builder has none yet)`.trim()); }
      const nc = /_nc$|_ho$/.test(p.t), held = /_hc$|_ho$/.test(p.t);
      two('lsw', ['lsw', x, y, n, nc ? 1 : 0, 1, '0070C0', ...(held ? [1] : [])]);
    } else if (/^ts_/.test(p.t)) {
      two('tsw', ['tsw', x, y, linkDigits(p.tag, '1'), /_ncl?$/.test(p.t) ? 1 : 0, 1, 'FF0032', ...(/l$/.test(p.t) ? [1] : [])]);
    } else if (/^ps_/.test(p.t)) two('psw', ['psw', x, y, linkDigits(p.tag, '1'), /_nc$/.test(p.t) ? 1 : 0, 1, 'FF9C37']);
    else if (/^fls_/.test(p.t)) two('fsw', ['fsw', x, y, linkDigits(p.tag, '1'), /_nc$/.test(p.t) ? 1 : 0, 1, '9B6BFF']);
    else if (p.t === 'coil') {
      const timer = /^TR/i.test(p.tag || '') || p.delay || p.tof, row = ['coil', x, y, coilL.get(p.tag), 0, 1, LINK_PAL[coilN++ % LINK_PAL.length]];
      if (timer) { if (!p.delay) note(changed, 'Timers with no delay on the print start at 5 s: check them on each timer’s tab'); row.push(Math.max(1, Math.min(999, Math.round(p.delay || 5)))); if (p.tof) row.push(1); }
      while (row.length < 9) row.push(null); const l = lab(p.tag); if (l) row.push(l);
      two('coil', row);
    } else if (/^(con|tc)_/.test(p.t)) {
      if (!coilL.has(p.tag)) { noCoil.push(p.tag || '?'); coilL.set(p.tag, take()); } const L = coilL.get(p.tag);
      const timer = all.some(({ p: c }) => c.t === 'coil' && c.tag === p.tag && (/^TR/i.test(c.tag) || c.delay || c.tof));
      const row = ['con', x, y, L, /_nc$/.test(p.t) ? 1 : 0, 1, '']; if (timer && /^con_/.test(p.t)) row.push(1);
      two('con', row);
    } else if (p.t === 'olc') two('olc', ['olc', x, y, linkDigits(p.tag, '1'), 1, 1, '']);
    else if (p.t === 'pl' || p.t === 'sol' || p.t === 'htr') {
      if (p.t === 'pl') { const w0 = LINK_LAMP_COL[(p.desc || '').toUpperCase().split(/\s+/)[0]], c = w0 || '00B050'; if (w0) ownCol.add(parts.length); const pbL = p.inPB ? [...opL.entries()].find(([k]) => k === 'PB:' + p.inPB) : null; two('lamp', ['lamp', x, y, pbL ? pbL[1] : '', 0, 1, c]); }
      else two(p.t, [p.t, x, y, linkDigits(p.tag, '1'), 0, 1, p.t === 'sol' ? '00D2BE' : 'FF0032']);
    } else if (p.t === 'motor') add(it, ['mtr', x + (pb[1] ? pb[1][0] - x + 160 : 0), y, linkDigits(p.tag, '1'), 0, 1, ''], linkCbTerms('mtr', x + (pb[1] ? pb[1][0] - x + 160 : 0), y, 0));
    else if (p.t === 'mst3') { if (!coilL.has(p.tag)) { noCoil.push(p.tag || '?'); coilL.set(p.tag, take()); } add(it, ['mst', x, y, coilL.get(p.tag), 0, 1, ''], linkCbTerms('mst', x, y, 0)); }
    else if (p.t === 'ol3') add(it, ['olh', x, y, linkDigits(p.tag, '1'), 0, 1, ''], linkCbTerms('olh', x, y, 0));
    else if (p.t === 'dsc3') add(it, ['dsc', x, y, linkDigits(p.tag, '1'), 0, 1, ''], linkCbTerms('dsc', x, y, 0));
    else if (p.t === 'fus3' || p.t === 'cb3') { if (p.t === 'cb3') note(changed, `${name} circuit breaker → 3-phase fuses`); add(it, ['fus', x, y, linkDigits(p.tag, '1'), 0, 1, ''], linkCbTerms('fus', x, y, 0)); }
    else if (p.t === 'fdsc3') {
      // (a fused disconnect: Circuit Builder's disconnect, then its fuses, side by side between the print's terminals)
      note(changed, `${name} fused disconnect → a disconnect and 3-phase fuses`);
      const xl = pb[0][0], xr = pb[1][0], d = linkSnap(xl + 40), f = linkSnap(Math.max(xr - 40, d + 160));
      const dt = linkCbTerms('dsc', d, y, 0), ft = linkCbTerms('fus', f, y, 0);
      add(it, ['dsc', d, y, linkDigits(p.tag, '1'), 0, 1, ''], [dt[0], ft[1], dt[2], ft[3], dt[4], ft[5]]);
      parts.push(['fus', f, y, linkDigits(p.fu, '1'), 0, 1, '']); fromIdx.push(null);
      it.extra = [0, 2, 4].map(i => [dt[i + 1], ft[i]]);   // (the short wires between them)
    } else if (p.t === 'fuse' || p.t === 'cb') {
      if (p.t === 'cb') note(changed, `${name} circuit breaker → a fuse`);
      const up = pb[0] && pb[1] && pb[0][0] === pb[1][0], cx = up ? pb[0][0] : linkSnap((pb[0][0] + pb[1][0]) / 2), cy = up ? linkSnap((pb[0][1] + pb[1][1]) / 2) : pb[0][1], rot = up ? 1 : 0;
      const ts = linkCbTerms('fu1', cx, cy, rot), first = up ? (pb[0][1] < pb[1][1] ? 0 : 1) : (pb[0][0] < pb[1][0] ? 0 : 1);
      const sorted = up ? ts.slice().sort((a, b) => a[1] - b[1]) : ts.slice().sort((a, b) => a[0] - b[0]);
      add(it, ['fu1', cx, cy, linkDigits(p.tag, '1'), 0, 1, '', ...(rot ? [rot] : [])], first === 0 ? sorted : [sorted[1], sorted[0]]);
    } else if (p.t === 'cb2') {
      note(changed, `${name} 2-pole circuit breaker → two fuses`);
      const ts = [];
      for (const [i, j] of [[0, 1], [2, 3]]) { const a = pb[i], b = pb[j], up = a[0] === b[0], cx = up ? a[0] : linkSnap((a[0] + b[0]) / 2), cy = up ? linkSnap((a[1] + b[1]) / 2) : a[1]; const t2 = linkCbTerms('fu1', cx, cy, up ? 1 : 0); parts.push(['fu1', cx, cy, linkDigits(p.tag, '1'), 0, 1, '', ...(up ? [1] : [])]); fromIdx.push(null); const s2 = up ? t2.sort((u, v) => u[1] - v[1]) : t2.sort((u, v) => u[0] - v[0]); ts.push(...((up ? a[1] < b[1] : a[0] < b[0]) ? s2 : [s2[1], s2[0]])); }
      terms.set(p, ts);
    } else if (p.t === 'xfmr') add(it, ['xfm', x, y, linkDigits(p.tag, '1'), 0, 1, ''], linkCbTerms('xfm', x, y, 0));
    else if (p.t === 'sup' || p.t === 'src_l1' || p.t === 'src_l2' || p.t === 'cnt_out' || p.t === 'cnt_in') {
      // (one terminal on the print: a Circuit Builder box with one of its terminals there, facing the way its wire goes)
      const at = pb[0], t = p.t === 'sup' ? 'ph' : p.t === 'src_l1' ? 'l1' : p.t === 'src_l2' ? 'l2' : 'jmp';
      const w = (doc.sheets[k].wires || []).map(w0 => [linkPbPos(doc.sheets[k], w0.a), ...(w0.pts || []), linkPbPos(doc.sheets[k], w0.b)].filter(Boolean)).find(ps => ps.length > 1 && ((X(ps[0][0]) === at[0] && Y(k, ps[0][1]) === at[1]) || (X(ps[ps.length - 1][0]) === at[0] && Y(k, ps[ps.length - 1][1]) === at[1])));
      let dir = [1, 0];
      if (w) { const ps = w.map(q => [X(q[0]), Y(k, q[1])]); const i = ps[0][0] === at[0] && ps[0][1] === at[1] ? 1 : ps.length - 2; const nb = ps[i] || at; dir = [Math.sign(nb[0] - at[0]), Math.sign(nb[1] - at[1])]; }
      // (the box sits behind its terminal: its right terminal there if the wire goes right, and so on)
      const cx = at[0] - dir[0] * 40, cy = at[1] - dir[1] * 40, rot = 0;
      let row;
      if (t === 'ph') row = ['ph', cx, cy, linkDigits(p.tag, '1'), 0, 1, ''];
      else if (t === 'jmp') { const key = (p.tag || '').toUpperCase() || '?'; if (!jmpN.has(key)) jmpN.set(key, jmpN.size + 1); row = ['jmp', cx, cy, String(jmpN.get(key)), 0, 1, '']; }
      else row = [t, cx, cy, '', 0, 1, ''];
      add(it, row, [at]);
      if (dir[1] === -1 && t !== 'jmp') { /* (a box wired from above: its bottom terminal is the nearest Circuit Builder has) */ }
    } else if (p.t === 'gnd') note(left, 'A ground' + (p.tag ? ' (' + p.tag + ')' : '') + ': Circuit Builder has none (its wire is left as it is)');
    else if (p.t === 'ol') { note(changed, `${name} overload heater on one line → joined straight through (Circuit Builder’s overload is three-line)`); it.through = pb; }
    else if (['spdt', 'dpst', 'dpdt', 'xover'].includes(p.t)) note(left, `${name} ${p.t.toUpperCase()} switch: Circuit Builder has nothing like it yet (its wires are left loose)`);
  }
  // wires: each keeps its path; ends on a part's terminal move onto that part's terminal here
  const wires = [];
  const seg = (a, b) => { if (a[0] === b[0] && a[1] === b[1]) return; if (a[0] !== b[0] && a[1] !== b[1]) { wires.push([a[0], a[1], b[0], a[1]]); wires.push([b[0], a[1], b[0], b[1]]); } else wires.push([a[0], a[1], b[0], b[1]]); };
  const poly = ps => { for (let i = 0; i + 1 < ps.length; i++) seg(ps[i], ps[i + 1]); };
  doc.sheets.forEach((s, k) => {
    for (const w of s.wires || []) {
      const ends = [w.a, w.b], raw = [linkPbPos(s, w.a), ...(w.pts || []), linkPbPos(s, w.b)];
      if (raw.some(q => !q)) continue;
      const ps = raw.map(q => [X(q[0]), Y(k, q[1])]);
      // (a bar: an end on the L1 or L2 rail sits on Circuit Builder's bar)
      if (!power) ends.forEach((e, n) => { if (e.r) { const r = s.parts.find(q => q.id === e.r); const q = n ? ps[ps.length - 1] : ps[0]; if (r) q[0] = r.label === 'L2' ? W : 0; } });
      const to = ends.map(e => { if (!e.p) return null; const p = s.parts.find(q => q.id === e.p), ts = p && terms.get(p); return ts ? ts[e.i] || null : null; });
      poly(linkMoveEnds(ps, to[0], to[1]));
    }
    // (with power, the rails are wires: up and down the side, as the print draws them)
    if (power) for (const r of s.parts.filter(p => p.t === 'rail')) seg([X(r.x), Y(k, r.y0)], [X(r.x), Y(k, r.y1)]);
  });
  for (const it of all) { if (it.extra) for (const [a, b] of it.extra) seg(a, b); if (it.through) seg(it.through[0], it.through[1]); }
  { const outs = all.filter(it => it.brk && it.p.t === 'cnt_out'); for (const o of outs) { const i = all.find(it => it.brk && it.p.t === 'cnt_in' && it.p.tag === o.p.tag && it.k > o.k); if (i) seg(o.brk, i.brk); } }
  // (rails continued from one sheet to the next: in bars mode the bars run on; with power, the rail wires join up)
  if (power) for (let k = 0; k + 1 < doc.sheets.length; k++) for (const lb of ['L1', 'L2']) {
    const a = doc.sheets[k].parts.find(p => p.t === 'rail' && p.label === lb), b = doc.sheets[k + 1].parts.find(p => p.t === 'rail' && p.label === lb);
    if (a && b && X(a.x) === X(b.x)) seg([X(a.x), Y(k, a.y1)], [X(b.x), Y(k + 1, b.y0)]);
  }
  // (a plain ladder with no supply drawn: Circuit Builder's bars are its supply; with power and rails fed by nothing, supply boxes on top)
  if (power) for (const r of rails) {
    const fed = parts.some(row => { const ts = linkCbTerms(row[0], row[1], row[2], row[7] && ['fu1', 'ph', 'l1', 'l2', 'jmp'].includes(row[0]) ? row[7] : 0); return ts.some(q => q[0] === X(r.p.x) && q[1] === Y(r.k, r.p.y0)); })
      || wires.some(w => (w[0] === X(r.p.x) && w[1] === Y(r.k, r.p.y0) && !(w[2] === X(r.p.x) && w[3] > w[1])) || (w[2] === X(r.p.x) && w[3] === Y(r.k, r.p.y0) && !(w[0] === X(r.p.x) && w[1] > w[3])));
    if (!fed && r.k === 0) { parts.push([r.p.label === 'L2' ? 'l2' : 'l1', X(r.p.x), Y(r.k, r.p.y0) - 40, '', 0, 1, '']); fromIdx.push(null); }
  }
  const name = (((doc.tb || {}).fields || []).find(f => /title/i.test(f.label)) || {}).value || 'Print';
  let data = { app: 'order-of-operations-circuit-builder', v: 1, name, w: power ? linkSnap(Math.max(...parts.map(r => r[1]), ...wires.flatMap(w => [w[0], w[2]])) + 200) : Math.max(W, 400), ...(power ? { pw: 'boxes' } : {}), parts, wires };
  // (made from a circuit, then changed on the print: what only Circuit Builder knows comes back, part by part)
  if (doc.link && doc.link.cb) data = linkMerge(doc.link.cb, data, fromIdx.map(it => it && it.p.cbi != null ? it.p.cbi : null), ownCol);
  if (noCoil.length) note(left, `The coil${noCoil.length > 1 ? 's' : ''} for ${noCoil.join(', ')}: not on the print (${noCoil.length > 1 ? 'their contacts are there, worked by nothing' : 'its contacts are there, worked by nothing'}: put ${noCoil.length > 1 ? 'the coils' : 'the coil'} in to run it)`);
  return { data, notes: { changed, left } };
}
const LIB_NAME_FOR = { fuse: 'A fuse', cb: 'A circuit breaker', cb2: 'A circuit breaker', cb3: 'A circuit breaker', ol: 'An overload heater', fdsc3: 'A fused disconnect', spst: 'A switch', spdt: 'A switch', dpst: 'A switch', dpdt: 'A switch', xover: 'A switch' };
// a circuit rebuilt from its print, given back what the print could not carry (cbi: each new part's place in the old circuit)
function linkMerge(old, nu, cbi, ownCol = new Set()) {
  const oi = new Map(); cbi.forEach((o, n) => { if (o != null && old.parts[o] && old.parts[o][0] === (nu.parts[n][0] === 'est' ? 'est' : nu.parts[n][0])) oi.set(o, n); });
  for (const [o, n] of oi) {
    const a = old.parts[o], b = nu.parts[n];
    if (!ownCol.has(n)) b[6] = a[6];   // (its colour, unless the print names a light's colour)
    if (['ph', 'l1', 'l2', 'jmp', 'fu1'].includes(b[0]) && a[1] === b[1] && a[2] === b[2] && a[7]) { while (b.length < 7) b.push(''); b[7] = a[7]; }   // (a supply box or continuation where it was: turned as it was)
    if ((b[0] === 'btn' || b[0] === 'coil') && typeof a[9] === 'string') { while (b.length < 9) b.push(null); b[9] = a[9]; }
    if (b[0] === 'btn' || b[0] === 'coil' || b[0] === 'sel' || b[0] === 'con' || b[0] === 'mst' || b[0] === 'lamp') { /* (letters: as the print made them) */ }
    if (a.length > 12 && (b[0] === 'btn' || b[0] === 'sel' || b[0] === 'lamp')) { while (b.length < 12) b.push(null); b.push(...a.slice(12)); }   // (its dashed link line)
  }
  const map = o => oi.has(o) ? oi.get(o) : -1;
  const keep = ['name', 'sc', 'pc', 'wo', 'ffo', 'pv', 'pp'];
  for (const k of keep) if (old[k] !== undefined) nu[k] = old[k];
  if (old.pw === 'boxes') nu.pw = 'boxes';
  if (old.pd) nu.pd = old.pd.map(a => [map(a[0]), ...a.slice(1)]).filter(a => a[0] >= 0);
  if (old.pl) nu.pl = old.pl.map(a => [map(a[0]), ...a.slice(1)]).filter(a => a[0] >= 0);
  if (old.ph) nu.ph = old.ph.map(a => [map(a[0]), ...a.slice(1)]).filter(a => a[0] >= 0);
  if (old.pn) nu.pn = old.pn.map(map).filter(i => i >= 0);
  if (old.fl) nu.fl = old.fl.map(([i, f]) => [map(i), f]).filter(a => a[0] >= 0);
  // (a fault on a wire: kept where the same run of wire is there still)
  const wi = new Map(nu.wires.map((w, i) => [w.slice(0, 4).join(','), i])), wmap = i => { const w = old.wires[i]; if (!w) return -1; const k = w.slice(0, 4).join(','), r = [w[2], w[3], w[0], w[1]].join(','); return wi.has(k) ? wi.get(k) : wi.has(r) ? wi.get(r) : -1; };
  old.wires.forEach((w, i) => { if (w[4]) { const j = wmap(i); if (j >= 0) nu.wires[j][4] = w[4]; } });
  if (old.sn) { nu.sn = old.sn.map(s => ({ ...s, fl: (s.fl || []).map(([i, f]) => [map(i), f]).filter(a => a[0] >= 0), wl: (s.wl || []).map(([i, f]) => [wmap(i), f]).filter(a => a[0] >= 0) })); if (old.si !== undefined) nu.si = old.si; }
  return nu;
}

/* =====================================================================
   A circuit -> a print (runs in Print Builder: uses its uid, defaultTB, nextTag-free tags of its own)
   ===================================================================== */
function circuitToPrint(d, env) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.parts) || !Array.isArray(d.wires)) throw new Error('That is not a circuit from Circuit Builder.');
  const uid = env.uid, changed = [], left = [], note = (list, s) => { if (!list.includes(s)) list.push(s); };
  const bars = d.pw !== 'boxes', d0 = d;
  // (a ladder: its rungs spread out down the print as far as needed for the tags and names, up to twice as far)
  let sy = 1;
  if (bars) { const ys = [...new Set(d.parts.map(a => +a[2]))].sort((a, b) => a - b), gaps = ys.slice(1).map((y, i) => y - ys[i]).filter(g => g > 0);
    if (gaps.length) sy = Math.max(1, Math.min(2, 160 / Math.min(...gaps)));
    if (sy > 1) d = { ...d, parts: d.parts.map(a => { const b = a.slice(); b[2] = linkSnap(+a[2] * sy); return b; }), wires: d.wires.map(w => { const b = w.slice(); b[1] = linkSnap(+w[1] * sy); b[3] = linkSnap(+w[3] * sy); return b; }) }; }
  const R = d.parts.map((a, i) => ({ i, t: a[0], x: +a[1], y: +a[2], L: String(a[3] ?? ''), nc: !!a[4], maint: a[5] !== 0, color: a[6] || '', a }));
  const rotOf = r => ['fu1', 'ph', 'l1', 'l2', 'jmp'].includes(r.t) ? (Math.round(+r.a[7]) || 0) : 0;
  const coilBy = new Map(R.filter(r => r.t === 'coil').map(r => [r.L, r]));
  const isTimer = r => r && r.t === 'coil' && +r.a[7] >= 1;
  const W = Math.max(400, +d.w || 400);
  // tags: coils by their label (or CR1, TR1, M1...), buttons by their letter (PB-A, or the label), the rest by number
  const tagOf = new Map(); let cr = 0, tr = 0;
  const lbl = r => typeof r.a[9] === 'string' && r.a[9].trim() ? r.a[9].trim().toUpperCase() : '';
  for (const r of R.filter(r => r.t === 'coil')) if (!tagOf.has('C:' + r.L)) tagOf.set('C:' + r.L, lbl(r) || (R.some(q => q.t === 'mst' && q.L === r.L) ? 'M' + (r.L === 'M' ? '1' : r.L) : isTimer(r) ? 'TR' + (++tr) : 'CR' + (++cr)));
  let pbn = 0, ssn = 0;
  for (const r of R.filter(r => r.t === 'btn' || r.t === 'est' || r.t === 'sel')) { const k = (r.t === 'sel' ? 'S:' : 'B:') + r.L; if (!tagOf.has(k)) tagOf.set(k, r.t === 'sel' ? 'SS' + (++ssn) : r.t === 'est' ? 'ES' + (++pbn) : 'PB' + (++pbn)); }
  const descOf = new Map(R.filter(r => (r.t === 'btn' || r.t === 'est') && lbl(r)).map(r => ['B:' + r.L, lbl(r)]));
  // sheets: as tall as the paper; a long circuit over several, broken between rungs
  const parts0 = R.map(r => ({ r, ts: linkCbTerms(r.t === 'est' ? 'btn' : r.t, r.x, r.y, rotOf(r)) }));
  const xsAll = parts0.flatMap(q => q.ts.map(t => t[0]).concat(q.r.x)).concat(d.wires.flatMap(w => [+w[0], +w[2]]));
  const ysAll = parts0.map(q => q.r.y).concat(d.wires.flatMap(w => [+w[1], +w[3]]));
  const minX = Math.min(...xsAll, bars ? 0 : Infinity), maxX = Math.max(...xsAll, bars ? W : -Infinity), minY = Math.min(...ysAll), maxY = Math.max(...ysAll);
  const span = maxX - minX + (bars ? 0 : 160);
  const PAPER = [['letter', false], ['letter', true], ['tabloid', true], ['ansic', true]].find(([pp, land]) => linkDrawW({ paper: pp, land }) - (bars ? 620 : 300) >= span) || ['ansic', true];
  const sheet0 = { paper: PAPER[0], land: PAPER[1] }, DW = linkDrawW(sheet0), DH = linkDrawH(sheet0);
  if (linkDrawW(sheet0) - (bars ? 620 : 300) < span) note(changed, 'The circuit is wider than the largest paper: it runs off the right of each sheet (shrink it in Circuit Builder, or move things on the print)');
  const OX = bars ? 200 - minX : 160 - minX;
  // the rows things sit on; a sheet breaks above a row, where no part spans the break
  const rows = [...new Set(parts0.map(q => q.r.y))].sort((a, b) => a - b);
  const room = DH - 420;   // (rails from 240 down to the foot, less a margin)
  const breaks = [minY - 120]; let top = minY - 120;
  for (const y of rows) if (y - top > room) { const b = linkSnap(y - 140); breaks.push(b); top = b; }
  const sheetOf = y => { let k = 0; while (k + 1 < breaks.length && y >= breaks[k + 1]) k++; return k; };
  const sheets = breaks.map(() => ({ id: uid('s'), ...(sheet0.paper !== 'letter' ? { paper: sheet0.paper } : {}), land: sheet0.land, parts: [], wires: [], nodes: [], texts: [] }));
  const OY = k => 240 + 80 - breaks[k];
  const P = (k, x, y) => [linkSnap(x + OX), linkSnap(y + OY(k))];
  // rails (a ladder on bars): on every sheet, from the top down past its last rung
  if (bars) sheets.forEach((s, k) => { const ys = rows.filter(y => sheetOf(y) === k); const y1 = ys.length ? linkSnap(Math.max(...ys) + OY(k) + 100) : 600; s.parts.push({ id: uid('r'), t: 'rail', label: 'L1', x: P(k, 0, 0)[0], y0: 240, y1 }, { id: uid('r'), t: 'rail', label: 'L2', x: P(k, W, 0)[0], y0: 240, y1 }); });
  // parts
  const made = new Map();   // (a circuit part -> [sheet, print part])
  const COLN = { 'FF0032': 'RED', '00B050': 'GREEN', 'FFDC00': 'YELLOW', 'FF9600': 'AMBER', '0070C0': 'BLUE', 'FFFFFF': 'WHITE', '7030A0': 'VIOLET', 'EC008C': 'MAGENTA', '00D2BE': 'TEAL' };
  let plN = 0; const jmpSeen = new Map();
  for (const { r } of parts0) {
    const k = sheetOf(r.y), [x, y] = P(k, r.x, r.y), s = sheets[k], o = { id: uid('p'), x, y, rot: 0, desc: '', cbi: r.i };
    let t = null;
    switch (r.t) {
      case 'btn': t = r.nc ? (r.maint ? 'pbm_nc' : 'pb_nc') : (r.maint ? 'pbm_no' : 'pb_no'); o.tag = tagOf.get('B:' + r.L); o.desc = descOf.get('B:' + r.L) || ''; break;
      case 'est': t = 'estop'; o.tag = tagOf.get('B:' + r.L); o.desc = descOf.get('B:' + r.L) || ''; break;
      case 'sel': { t = 'sel'; o.tag = tagOf.get('S:' + r.L); const n = Math.round(+r.a[7]) || 3, m = Math.round(+r.a[8]) || 0, names = typeof r.a[10] === 'string' && r.a[10] ? r.a[10].split('/') : [...Array(n).keys()].map(i => String(i + 1)); o.pos = names.slice(0, n).join('/'); o.closedIn = [...Array(n).keys()].filter(i => m >> i & 1); break; }
      case 'lsw': t = r.a[7] === 1 ? (r.nc ? 'ls_ho' : 'ls_hc') : (r.nc ? 'ls_nc' : 'ls_no'); o.tag = 'LS' + r.L; break;
      case 'tsw': t = (r.nc ? 'ts_nc' : 'ts_no') + (r.a[7] === 1 ? 'l' : ''); o.tag = 'TS' + r.L; break;
      case 'psw': t = r.nc ? 'ps_nc' : 'ps_no'; o.tag = 'PS' + r.L; break;
      case 'fsw': t = r.nc ? 'fls_nc' : 'fls_no'; o.tag = 'FLS' + r.L; break;
      case 'coil': t = 'coil'; o.tag = tagOf.get('C:' + r.L); o.pre = (o.tag.match(/^[A-Z]+/) || ['CR'])[0]; if (isTimer(r)) { o.delay = Math.round(+r.a[7]); if (r.a[8] === 1) o.tof = true; } break;
      case 'con': { const c = coilBy.get(r.L); t = isTimer(c) && r.a[7] !== 1 ? (r.nc ? 'tc_nc' : 'tc_no') : (r.nc ? 'con_nc' : 'con_no'); o.tag = c ? tagOf.get('C:' + r.L) : r.L; if (isTimer(c) && r.a[7] === 1) o.inst = true; break; }
      case 'lamp': t = 'pl'; o.tag = 'PL' + (++plN); o.desc = COLN[(r.color || '').toUpperCase()] || ''; if (r.L && R.some(q => (q.t === 'btn' || q.t === 'est') && q.L === r.L)) o.inPB = tagOf.get('B:' + r.L); break;
      case 'sol': t = 'sol'; o.tag = 'SOL' + r.L; break;
      case 'htr': t = 'htr'; o.tag = 'HTR' + r.L; break;
      case 'mtr': t = 'motor'; o.tag = 'M' + r.L; o.x = x - 20; break;   // (its leads: 140 out on the print, 160 here)
      case 'mst': t = 'mst3'; o.tag = tagOf.get('C:' + r.L) || ('M' + r.L); break;
      case 'olc': t = 'olc'; o.tag = 'OL' + r.L; break;
      case 'olh': t = 'ol3'; o.tag = 'OL' + r.L; break;
      case 'dsc': t = 'dsc3'; o.tag = 'DS' + r.L; break;
      case 'fus': t = 'fus3'; o.tag = 'FU' + r.L; break;
      case 'fu1': t = 'fuse'; o.tag = 'FU' + r.L; o.rot = [0, 90, 180, 270][rotOf(r)]; break;
      case 'xfm': t = 'xfmr'; o.tag = 'CPT' + r.L; break;
      case 'ph': t = 'sup'; o.tag = 'L' + r.L; break;
      case 'l1': t = 'src_l1'; break;
      case 'l2': t = 'src_l2'; break;
      case 'jmp': { const seen = jmpSeen.get(r.L) || 0; jmpSeen.set(r.L, seen + 1); t = seen ? 'cnt_in' : 'cnt_out'; o.tag = String(r.L); break; }
    }
    if (!t) { note(left, `A ${r.t} part: Print Builder has nothing like it`); continue; }
    o.t = t; if (o.tag == null) o.tag = env.defaultTag ? env.defaultTag(t) : '';
    // (one terminal on the print: the part sits on the circuit box's terminal that a wire goes to)
    if (['sup', 'src_l1', 'src_l2', 'cnt_out', 'cnt_in'].includes(t)) {
      const ts = linkCbTerms(r.t, r.x, r.y, rotOf(r)), hit = ts.find(q => d.wires.some(w => (+w[0] === q[0] && +w[1] === q[1]) || (+w[2] === q[0] && +w[3] === q[1]))) || ts[0];
      const [hx, hy] = P(k, hit[0], hit[1]), dir = [Math.sign(hit[0] - r.x), Math.sign(hit[1] - r.y)];
      const pt = LINK_PB_TERMS[t][0];   // (the print part's terminal, unturned: sup and sources at its middle, continuations 40 to its left)
      // turn it so its terminal faces the wire: a continuation's terminal on its left faces left unturned
      if (t === 'cnt_out' || t === 'cnt_in') { o.rot = [0, 90, 180, 270].find(r => { const [u, v] = linkTurn(pt, r); return Math.sign(u) === dir[0] && Math.sign(v) === dir[1]; }) || 0; const [u, v] = linkTurn(pt, o.rot); o.x = hx - u; o.y = hy - v; }
      else { o.x = hx - pt[0]; o.y = hy - pt[1]; }
    }
    s.parts.push(o); made.set(r.i, [k, o]);
  }
  // wires: each run of wire on the sheet its middle is on (one crossing a break: a continuation each side)
  const segs = d.wires.map(w => [+w[0], +w[1], +w[2], +w[3]]);
  let contN = Math.max(0, ...[...jmpSeen.keys()].map(Number).filter(Number.isFinite));
  const ends = new Map();   // (a circuit terminal's place -> the print part and terminal there)
  for (const [i, [k, o]] of made) { const pts = linkPbTerms(o), cts = linkCbTerms(R[i].t === 'est' ? 'btn' : R[i].t, R[i].x, R[i].y, rotOf(R[i]));
    // pair each circuit terminal with the print terminal it stands for (same order; one-terminal parts: the one wired)
    cts.forEach((c, j) => { const q = pts.length === 1 ? pts[0] : pts[j]; if (!q) return; if (pts.length === 1 && !(d.wires.some(w => (+w[0] === c[0] && +w[1] === c[1]) || (+w[2] === c[0] && +w[3] === c[1])))) return; ends.set(c.join(','), { k, o, i: pts.length === 1 ? 0 : j, at: q }); }); }
  const nodeAt = (s, x, y) => { let n = s.nodes.find(q => q.x === x && q.y === y); if (!n) { n = { id: uid('n'), x, y }; s.nodes.push(n); } return { n: n.id }; };
  const railAt = (s, x, y) => { const r = s.parts.find(p => p.t === 'rail' && p.x === x && y >= p.y0 && y <= p.y1); return r ? { r: r.id, y } : null; };
  const addW = (k, a, b) => {
    const s = sheets[k], A = ends.get(a.join(',')), B = ends.get(b.join(','));
    let pa = P(k, a[0], a[1]), pb = P(k, b[0], b[1]);
    if (A && A.k === k) pa = A.at; if (B && B.k === k) pb = B.at;
    const pts = linkMoveEnds([P(k, a[0], a[1]), P(k, b[0], b[1])], pa, pb);
    const e = (q, E) => E && E.k === k ? { p: E.o.id, i: E.i } : (bars && railAt(s, q[0], q[1])) || nodeAt(s, q[0], q[1]);
    s.wires.push({ id: uid('w'), a: e(pts[0], A), b: e(pts[pts.length - 1], B), pts: pts.slice(1, -1) });
  };
  for (const [x1, y1, x2, y2] of segs) {
    const k1 = sheetOf(y1), k2 = sheetOf(y2);
    if (k1 === k2 || x1 !== x2) { addW(Math.min(k1, k2), [x1, y1], [x2, y2]); continue; }
    // (a wire running down over a break: down to the foot of the sheet, a continuation; on the next, from its top)
    let [ya, yb] = y1 < y2 ? [y1, y2] : [y2, y1], k = sheetOf(ya), ys = ya;
    while (k < sheetOf(yb)) {
      const cut = breaks[k + 1] - 20, n = String(++contN);
      // (on this sheet: down to a continuation at the foot, its terminal on top)
      const [cx, cy] = P(k, x1, cut), c1 = { id: uid('p'), t: 'cnt_out', x: cx, y: cy, rot: 90, desc: '', tag: n, brk: 1 };
      { const [u, v] = linkTurn(LINK_PB_TERMS.cnt_out[0], 90); c1.x = cx - u; c1.y = cy - v; }
      sheets[k].parts.push(c1); ends.set(x1 + ',' + cut, { k, o: c1, i: 0, at: [cx, cy] });
      if (cut > ys) addW(k, [x1, ys], [x1, cut]);
      // (on the next: from a continuation at the top, its terminal underneath)
      k++; const top = breaks[k] + 20; ys = top;
      const [dx2, dy2] = P(k, x1, top), c2 = { id: uid('p'), t: 'cnt_in', x: dx2, y: dy2, rot: 90, desc: '', tag: n, brk: 1 };
      { const [u, v] = linkTurn(LINK_PB_TERMS.cnt_in[0], 90); c2.x = dx2 - u; c2.y = dy2 - v; }
      sheets[k].parts.push(c2); ends.set(x1 + ',' + top, { k, o: c2, i: 0, at: [dx2, dy2] });
    }
    addW(k, [x1, ys], [x1, yb]);
  }
  // (where a wire's end meets another wire part way along, as Circuit Builder joins them: that wire split there, so the print joins them too)
  for (const s of sheets) { linkTees(s, uid); if (env.tidy) env.tidy(s); linkPrune(s); if (env.tidy) env.tidy(s); }
  if (contN > Math.max(0, ...[...jmpSeen.keys()].map(Number).filter(Number.isFinite))) note(changed, 'Wires running from one sheet to the next: a continuation at each end, numbered alike');
  if (d.pv && d.pv.length) note(left, 'Process values (they stay with the circuit, and come back with it)');
  if (d.fl || d.sn) note(left, 'Planted faults (they stay with the circuit, and come back with it)');
  const doc = { kind: 'o3-print', v: 1, tb: env.defaultTB(), sheets, cur: 0 };
  const tf = doc.tb.fields.find(f => /title/i.test(f.label)); if (tf) tf.value = d.name || 'Circuit';
  doc.link = { from: 'circuit-builder', cb: d0, ox: OX, oy: sheets.map((_, k) => OY(k)), sy, fp: linkFingerprint(doc) };
  return { doc, notes: { changed, left } };
}

// a print sheet's wires split wherever a node or a part's terminal sits part way along one (not at its own ends)
function linkTees(s, uid) {
  const on = (x, y, a, b) => a[0] === b[0] ? x === a[0] && y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1]) : y === a[1] && a[1] === b[1] && x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0]);
  const spots = [...s.nodes.map(n => [n.x, n.y, { n: n.id }]), ...s.parts.filter(p => p.t !== 'rail').flatMap(p => linkPbTerms(p).map((q, i) => [q[0], q[1], { p: p.id, i }]))];
  const same = (e, f) => (e.n && e.n === f.n) || (e.p && e.p === f.p && e.i === f.i);
  // (a wire's loose end right on a part's terminal (it ran past the terminal in Circuit Builder): joined to the terminal)
  for (const w of s.wires) for (const k of ['a', 'b']) { const e = w[k]; if (!e.n) continue; const q = linkPbPos(s, e), t = q && spots.find(([x, y, f]) => f.p && x === q[0] && y === q[1]); if (t) w[k] = { ...t[2] }; }
  s.nodes = s.nodes.filter(n => s.wires.some(w => w.a.n === n.id || w.b.n === n.id));
  for (let again = true, guard = 0; again && guard < 5000; guard++) {
    again = false;
    outer: for (const w of s.wires) {
      const P = [linkPbPos(s, w.a), ...w.pts, linkPbPos(s, w.b)];
      if (P.some(q => !q)) continue;
      for (const [x, y, e] of spots) {
        if (same(e, w.a) || same(e, w.b)) continue;
        for (let k = 0; k < P.length - 1; k++) {
          if (!on(x, y, P[k], P[k + 1]) || (k === 0 && x === P[0][0] && y === P[0][1]) || (k === P.length - 2 && x === P[k + 1][0] && y === P[k + 1][1])) continue;
          const atBend = P[k + 1][0] === x && P[k + 1][1] === y;
          const w2 = { id: uid('w'), a: { ...e }, b: w.b, pts: w.pts.slice(atBend ? k + 1 : k) };
          w.pts = w.pts.slice(0, k); w.b = { ...e }; s.wires.push(w2); again = true; break outer;
        }
      }
    }
  }
}
// a print sheet's loose stubs taken off: one left inside a part's body, one joined to nothing at either end, or one running on
// past a junction to nowhere (in Circuit Builder they joined nothing; on the print they would be marked as loose ends)
function linkPrune(s) {
  const uses = id => s.wires.filter(w => w.a.n === id || w.b.n === id).length;
  for (let again = true; again;) {
    again = false;
    for (const w of [...s.wires]) {
      const P = [linkPbPos(s, w.a), ...w.pts, linkPbPos(s, w.b)]; if (P.some(q => !q)) continue;
      const loose = [w.a, w.b].filter(e => e.n && uses(e.n) === 1);
      if (!loose.length) continue;
      const other = loose.length === 1 ? (loose[0] === w.a ? w.b : w.a) : null;
      const inPart = s.parts.some(p => p.t !== 'rail' && P.every(([x, y]) => Math.abs(x - p.x) <= 80 && Math.abs(y - p.y) <= 60));
      if (!inPart && loose.length < 2 && !(other.n && uses(other.n) >= 3)) continue;
      s.wires.splice(s.wires.indexOf(w), 1); for (const e of loose) s.nodes = s.nodes.filter(n => n.id !== e.n); again = true;
    }
  }
}
// ---- handing work over: into this site's storage, then the other program opened in a new tab
function linkHandOff(kind, data, url) {
  try { localStorage.setItem(LINK_KEY, JSON.stringify({ kind, t: Date.now(), data })); } catch (e) { return 'This browser would not let the work be handed over (storage is full or turned off). Save it as a file, then open that file in the other program.'; }
  const w = window.open(url + (url.includes('?') ? '&' : '?') + 'from=link', '_blank');
  return w ? '' : 'The browser stopped the new tab opening: allow pop-ups for this site, or save the file and open it there.';
}
// the work handed over, if this page was opened for it (once: it is taken out of storage)
function linkTake() {
  if (!/[?&]from=link\b/.test(location.search)) return null;
  let h = null; try { h = JSON.parse(localStorage.getItem(LINK_KEY) || 'null'); localStorage.removeItem(LINK_KEY); } catch (_) {}
  try { window.history.replaceState(null, '', location.pathname + location.hash); } catch (_) {}   // (window's: Circuit Builder has a history of its own, its undo)
  return h && Date.now() - h.t < 10 * 60 * 1000 ? h : null;
}
