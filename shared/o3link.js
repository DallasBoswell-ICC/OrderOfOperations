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
  // (drawn closer across to fit its paper: spread back out first. What is where it was put goes back exactly; anything moved since,
  // in proportion between the parts on either side of it)
  if (doc.link && doc.link.xk && doc.link.v !== 2) {   // (prints made before 17 Nov 2026 kept their places this way)
    doc = JSON.parse(JSON.stringify(doc));
    const K = doc.link.xk, N = doc.link.xn, n = K.length, un = v => { if (v <= N[0]) return v - N[0] + K[0]; for (let i = 1; i < n; i++) if (v <= N[i]) return linkSnap(K[i - 1] + (v - N[i - 1]) * (K[i] - K[i - 1]) / ((N[i] - N[i - 1]) || 1)); return v - N[n - 1] + K[n - 1]; };
    for (const s of doc.sheets) {
      for (const q of [...s.parts, ...s.nodes]) { q.x = q._x && q._x[0] === q.x ? q._x[1] : un(q.x); delete q._x; }
      for (const w of s.wires) { w.pts = w._x && w._x[0] === JSON.stringify(w.pts) ? JSON.parse(w._x[1]) : w.pts.map(q => [un(q[0]), q[1]]); delete w._x; }
    }
    delete doc.link.xk; delete doc.link.xn;
  }
  // (each sheet centred on its own (from 17 Nov 2026): back to one place across first)
  if (doc.link && Array.isArray(doc.link.oxs)) { doc = JSON.parse(JSON.stringify(doc)); const ox = doc.link.ox;
    doc.sheets.forEach((s, k) => { const d = ox - (doc.link.oxs[k] ?? ox); if (!d) return;
      for (const p of s.parts) p.x += d; for (const q of s.nodes) q.x += d; for (const w of s.wires) w.pts = (w.pts || []).map(q => [q[0] + d, q[1]]); });
    delete doc.link.oxs; }
  // (laid out rung by rung (from 17 Nov 2026): each place back through its own rung's layout; the uprights between rungs by the pins)
  if (doc.link && doc.link.v === 2 && Array.isArray(doc.link.xb) && Array.isArray(doc.link.oy)) {
    doc = JSON.parse(JSON.stringify(doc));
    const xb = doc.link.xb, ox = doc.link.ox, oy = doc.link.oy;
    const un = (keys, n, v) => { let i = 0; while (i < n.length && n[i] < v) i++; if (i < n.length && n[i] === v) return keys[i]; if (i === 0) return v - n[0] + keys[0]; if (i === n.length) return v - n[i - 1] + keys[i - 1]; return linkSnap(keys[i - 1] + (v - n[i - 1]) * (keys[i] - keys[i - 1]) / ((n[i] - n[i - 1]) || 1)); };
    const at = (k, x, y) => { const gy = y - (oy[Math.min(k, oy.length - 1)] || 0); let b = xb.find(([a, c]) => gy >= a && gy <= c);
      if (!b) b = xb.reduce((best, q) => { const d = gy < q[0] ? q[0] - gy : gy - q[1]; return !best || d < best[0] ? [d, q] : best; }, null)[1];
      return un(b[2], b[3], x - ox) + ox; };
    // (drawn closer down where a rung was too tall for a sheet: back down first)
    if (Array.isArray(doc.link.ym)) { const [G, N] = doc.link.ym, uy = (k, y) => { const o = oy[Math.min(k, oy.length - 1)] || 0; return un(G, N, y - o) + o; };
      doc.sheets.forEach((s, k) => {
        for (const p of s.parts) { if (p.t === 'rail') { p.y0 = uy(k, p.y0); p.y1 = uy(k, p.y1); continue; } const ts = linkPbTerms(p); p.y = ts.length ? uy(k, ts[0][1]) - (ts[0][1] - p.y) : uy(k, p.y); }
        for (const q of s.nodes) q.y = uy(k, q.y);
        for (const w of s.wires) { w.pts = (w.pts || []).map(q => [q[0], uy(k, q[1])]); for (const e of [w.a, w.b]) if (e.r != null && e.y != null) e.y = uy(k, e.y); }
      }); delete doc.link.ym; }
    doc.sheets.forEach((s, k) => {
      for (const p of s.parts) { if (p.t === 'rail') { p.x = at(k, p.x, p.y0); continue; }
        // (a part placed by its terminals, all in one upright line (a motor, a line in): back by them)
        const ts = linkPbTerms(p); if (ts.length && ts.every(q => q[0] === ts[0][0])) p.x = at(k, ts[0][0], ts[0][1]) + (p.x - ts[0][0]); else p.x = at(k, p.x, p.y); }
      for (const q of s.nodes) q.x = at(k, q.x, q.y);
      for (const w of s.wires) w.pts = (w.pts || []).map(q => [at(k, q[0], q[1]), q[1]]);
    });
    delete doc.link.xb;
  }
  // (sheets drawn each centred on its own: where every continuation pair between two sheets is shifted alike, the later sheet moved
  // back in line, so a wire running on over the break comes out straight)
  if (!(doc.link && doc.link.cb)) { let moved = false; const d2 = JSON.parse(JSON.stringify(doc)); let acc = 0;
    for (let k = 1; k < d2.sheets.length; k++) { const prev = d2.sheets[k - 1], cur = d2.sheets[k];
      const ds = prev.parts.filter(p => p.t === 'cnt_out').map(a => { const b = cur.parts.find(q => q.t === 'cnt_in' && q.tag === a.tag); return b ? Math.round(linkPbTerms(a)[0][0] - linkPbTerms(b)[0][0]) : null; }).filter(v => v != null);
      const dx = ds.length && ds.every(v => v === ds[0]) ? ds[0] : 0; void acc;
      if (dx) { moved = true; for (const p of cur.parts) p.x += dx; for (const q of cur.nodes) q.x += dx; for (const w of cur.wires) w.pts = (w.pts || []).map(q => [q[0] + dx, q[1]]); } }
    if (moved) doc = d2; }
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
  // (Circuit Builder's parts are wider than the print's symbols: along each row, things drawn close on the print are spread apart
  // as far as they need, so no part lands on another or on a wire; nothing is moved closer)
  const FX = (() => {
    if (LK) return x => x;
    const CBW = { coil: 60, pl: 60, sol: 60, htr: 60, sel: 60, ls_no: 60, ls_nc: 60, ls_hc: 60, ls_ho: 60, ps_no: 60, ps_nc: 60, fls_no: 60, fls_nc: 60, prs_no: 60, prs_nc: 60, fs_no: 60, fs_nc: 60, ts_no: 80, ts_nc: 80, ts_nol: 80, ts_ncl: 80 };
    const keySet = new Set(), items = new Map(), cons = [];
    const row = (k, y) => { const key = k + ':' + y; if (!items.has(key)) items.set(key, []); return items.get(key); };
    doc.sheets.forEach((s, k) => {
      for (const p of s.parts) { if (p.t === 'rail') { keySet.add(p.x); continue; }
        const ts = linkPbTerms(p); keySet.add(p.x); ts.forEach(q => keySet.add(q[0]));
        const two = ts.length === 2 && ts[0][1] === ts[1][1] && ts[0][0] !== ts[1][0];
        if (two) { const [l, r] = ts[0][0] < ts[1][0] ? [ts[0], ts[1]] : [ts[1], ts[0]], w = CBW[p.t] || 40;
          if (w > p.x - l[0]) cons.push([l[0], p.x, w]); if (w > r[0] - p.x) cons.push([p.x, r[0], w]);
          row(k, p.y).push({ a: l[0], b: r[0], ea: 0, eb: 0, part: 1 }); continue; }
        const one = ts.length && ts.every(q => q[0] === ts[0][0]) ? ts[0][0] : null;
        const [ea, eb] = p.t === 'motor' ? [0, 300] : p.t === 'xfmr' ? [105, 105] : one != null && ts.length === 1 ? [80, 80] : [40, 40];
        const anchor = p.t === 'motor' && one != null ? one : p.x; keySet.add(anchor);
        for (const y of new Set(ts.map(q => q[1]).concat(ts.length ? [] : [p.y]))) row(k, y).push({ a: anchor, b: anchor, ea, eb, part: 1 }); }
      for (const n of s.nodes || []) keySet.add(n.x);
      for (const w of s.wires) { const ps = [linkPbPos(s, w.a), ...(w.pts || []), linkPbPos(s, w.b)].filter(Boolean);
        ps.forEach(q => keySet.add(q[0]));
        // (a wire's corners and joins on a row, and an upright wire crossing a row: things a part must not land on)
        ps.forEach((q, i) => { if (i && i < ps.length - 1) row(k, q[1]).push({ a: q[0], b: q[0], ea: 0, eb: 0 }); });
        for (const e of [w.a, w.b]) if (e.n) { const q = linkPbPos(s, e); if (q) row(k, q[1]).push({ a: q[0], b: q[0], ea: 0, eb: 0 }); }
        for (let i = 0; i + 1 < ps.length; i++) if (ps[i][0] === ps[i + 1][0]) for (const [key, list] of items) { const [kk, yy] = key.split(':').map(Number); if (kk === k && yy > Math.min(ps[i][1], ps[i + 1][1]) && yy < Math.max(ps[i][1], ps[i + 1][1])) list.push({ a: ps[i][0], b: ps[i][0], ea: 0, eb: 0 }); } }
    });
    for (const list of items.values()) { list.sort((u, v) => (u.a - u.ea) - (v.a - v.ea)); for (let i = 0; i + 1 < list.length; i++) { const u = list[i], v = list[i + 1]; if (v.a <= u.b) continue; const gap = u.part && v.part ? 40 : u.part || v.part ? 20 : 0; cons.push([u.b, v.a, u.eb + v.ea + gap]); } }
    const keys = [...keySet].sort((a, b) => a - b), idx = new Map(keys.map((k, i) => [k, i])), need = keys.map(() => []);
    for (const [lo, hi, r] of cons) { const i = idx.get(lo), j = idx.get(hi); if (i != null && j != null && j > i) need[j].push([i, r]); }
    const n = [keys[0]]; for (let j = 1; j < keys.length; j++) { let v = n[j - 1] + keys[j] - keys[j - 1]; for (const [i, r] of need[j]) v = Math.max(v, n[i] + r); n.push(v); }
    const m = new Map(keys.map((k, i) => [k, n[i]]));
    return x => { if (m.has(x)) return m.get(x); let i = 0; while (i < keys.length && keys[i] < x) i++; if (i === 0) return x - keys[0] + n[0]; if (i === keys.length) return x - keys[i - 1] + n[i - 1]; return n[i - 1] + (x - keys[i - 1]) * (n[i] - n[i - 1]) / (keys[i] - keys[i - 1]); };
  })();
  let X = (x) => linkSnap(FX(x) + DX), Y = (k, y) => linkSnap(F[k](y) + DY[k]);
  if (LK) {   // (back to the circuit's own places: across as it was, down as it was before the print spread its rungs out)
    const oy = LK.oy, n = oy.length, step = n > 1 ? oy[n - 2] - oy[n - 1] : 3000, sy = LK.sy || 1;
    X = x => linkSnap(x - LK.ox);
    if (LK.v === 2 && LK.xk) { const Kk = LK.xk, N = LK.xn, n2 = Kk.length, un = v => { if (v <= N[0]) return v - N[0] + Kk[0]; for (let i = 1; i < n2; i++) if (v <= N[i]) return Kk[i - 1] + (v - N[i - 1]) * (Kk[i] - Kk[i - 1]) / ((N[i] - N[i - 1]) || 1); return v - N[n2 - 1] + Kk[n2 - 1]; }; X = x => linkSnap(un(x - LK.ox)); }   // (drawn closer across: spread back out)
    Y = (k, y) => linkSnap((y - (k < n ? oy[k] : oy[n - 1] - (k - n + 1) * step)) / sy);
  }
  const W = !power && rL1 && rL2 ? (LK ? Math.max(400, +LK.cb.w || 400) : linkSnap(FX(rL2.p.x) - FX(rL1.p.x))) : 0;

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
  // (a continuation at the foot of a sheet and its partner at the top of the next, in the same column: in Circuit Builder the sheets
  // are one under another, so the wire just runs on down)
  const pairDown = new Set();
  for (const a of all) if (a.p.t === 'cnt_out') { const b = all.find(q => q.p.t === 'cnt_in' && q.p.tag === a.p.tag && q.k === a.k + 1); if (!b) continue;
    const ta = linkPbTerms(a.p)[0], tb = linkPbTerms(b.p)[0]; if (ta && tb && Math.abs(ta[0] - tb[0]) < 1) { pairDown.add(a.p); pairDown.add(b.p); } }
  let coilN = 0; const noCoil = [], ownCol = new Set();   // (ownCol: lights whose colour the print names)
  for (const it of all) {
    const { p, k } = it, x = X(p.x), y = Y(k, p.y), pb = linkPbTerms(p).map(q => [X(q[0]), Y(k, q[1])]), name = p.tag || (LIB_NAME_FOR[p.t] || p.t);
    const two = (t, row) => { const ts = linkCbTerms(t, x, y, 0); add(it, row, pb.length === 2 && pb[0][0] > pb[1][0] ? [ts[1], ts[0]] : ts); };   // (a flipped part: its first terminal on the right)
    if (p.t === 'rail') continue;
    if ((p.brk && LK) || pairDown.has(p)) { it.brk = pb[0]; continue; }   // (a continuation the print put where a wire ran over onto the next sheet: the wire joins up again)
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
      const up = pb[0] && pb[1] && pb[0][0] === pb[1][0], cx = LK ? x : up ? pb[0][0] : linkSnap((pb[0][0] + pb[1][0]) / 2), cy = LK ? y : up ? linkSnap((pb[0][1] + pb[1][1]) / 2) : pb[0][1], rot = up ? 1 : 0;   // (made from a circuit: back at its own middle)
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
  const bars = d.pw !== 'boxes', d0 = d; let ylink = null;
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
  // ---- 1. each part as it will be on the print, at the circuit's own place for now (G: the circuit's grid)
  const parts0 = R.map(r => ({ r, ts: linkCbTerms(r.t === 'est' ? 'btn' : r.t, r.x, r.y, rotOf(r)) }));
  const wired = new Set(d.wires.flatMap(w => [w[0] + ',' + w[1], w[2] + ',' + w[3]]));
  const made = [];   // ({ r, o }: a circuit part and its print part, o.x/o.y in G for now)
  const COLN = { 'FF0032': 'RED', '00B050': 'GREEN', 'FFDC00': 'YELLOW', 'FF9600': 'AMBER', '0070C0': 'BLUE', 'FFFFFF': 'WHITE', '7030A0': 'VIOLET', 'EC008C': 'MAGENTA', '00D2BE': 'TEAL' };
  let plN = 0; const jmpSeen = new Map();
  for (const { r, ts } of parts0) {
    const o = { id: uid('p'), x: r.x, y: r.y, rot: 0, desc: '', cbi: r.i };
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
      case 'mtr': t = 'motor'; o.tag = 'M' + r.L; o.x = r.x - 20; break;   // (its leads: 140 out on the print, 160 here)
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
    o.t = t; if (o.tag == null) o.tag = '';
    // (one terminal on the print: the part sits on the circuit box's terminal that a wire goes to, its terminal facing the wire)
    o.cbT = ts;   // (the circuit part's terminals, in G)
    if (['sup', 'src_l1', 'src_l2', 'cnt_out', 'cnt_in'].includes(t)) {
      const hits = ts.filter(q => wired.has(q.join(','))), hit = hits[0] || ts[0], dir = [Math.sign(hit[0] - r.x), Math.sign(hit[1] - r.y)];
      const pt = LINK_PB_TERMS[t][0];
      if (t === 'cnt_out' || t === 'cnt_in') { o.rot = [0, 90, 180, 270].find(q => { const [u, v] = linkTurn(pt, q); return Math.sign(u) === dir[0] && Math.sign(v) === dir[1]; }) || 0; const [u, v] = linkTurn(pt, o.rot); o.x = hit[0] - u; o.y = hit[1] - v; }
      else { o.x = hit[0] - pt[0]; o.y = hit[1] - pt[1]; }
      o.one = hits.length ? hits : [hit];   // (every wired circuit terminal joins the print's one terminal)
      if (hits.length > 1) note(changed, `${o.tag ? o.tag + ' ' : ''}${t === 'sup' ? 'phase box' : t.startsWith('cnt') ? 'continuation' : 'supply box'} wired on more than one side: drawn with one terminal, the wires joined to it`);
    }
    made.push({ r, o });
  }

  // ---- 2. the wiring as a grid of short steps (20 each), so wires lying on top of each other become one
  const E = new Map();   // ("x,y" -> Set of neighbouring "x,y")
  const K = (x, y) => x + ',' + y, XY = k => k.split(',').map(Number);
  const link2 = (a, b) => { if (a === b) return; if (!E.has(a)) E.set(a, new Set()); if (!E.has(b)) E.set(b, new Set()); E.get(a).add(b); E.get(b).add(a); };
  const unlink = (a, b) => { E.get(a)?.delete(b); E.get(b)?.delete(a); };
  const runEnds = new Set();   // (where a wire starts or ends: a wire crossing another anywhere else hops over it, as in Circuit Builder)
  const run = (x1, y1, x2, y2) => { x1 = linkSnap(x1); y1 = linkSnap(y1); x2 = linkSnap(x2); y2 = linkSnap(y2);
    if (x1 !== x2 && y1 !== y2) { run(x1, y1, x2, y1); run(x2, y1, x2, y2); return; }
    runEnds.add(K(x1, y1)); runEnds.add(K(x2, y2));
    const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 20, dx = Math.sign(x2 - x1) * 20, dy = Math.sign(y2 - y1) * 20;
    for (let i = 0; i < n; i++) link2(K(x1 + dx * i, y1 + dy * i), K(x1 + dx * (i + 1), y1 + dy * (i + 1))); };
  for (const w of d.wires) run(+w[0], +w[1], +w[2], +w[3]);
  const deg = k => (E.get(k) || new Set()).size;
  // (a stub ending inside a part, short of its terminal: joined nothing in Circuit Builder, so it goes)
  const cbTerm = new Set(made.flatMap(({ o }) => o.cbT.map(q => q.join(','))));
  const inside = (x, y) => made.some(({ o }) => { const ts = o.cbT; if (ts.length !== 2 || ts[0][1] !== ts[1][1] || y !== ts[0][1]) return false; const [u, v] = [Math.min(ts[0][0], ts[1][0]), Math.max(ts[0][0], ts[1][0])]; return x > u && x < v; });
  for (let again = true; again;) { again = false; for (const k of [...E.keys()]) if (deg(k) === 1 && !cbTerm.has(k) && inside(...XY(k))) { for (const n of [...E.get(k)]) unlink(k, n); E.delete(k); again = true; } }
  // (each circuit terminal joined to where the print's terminal is: Print Builder's parts are a little narrower)
  const termAt = new Map();   // ("x,y" -> [{ o, i }]: the print terminals there)
  const addTerm = (k, o, i) => { if (!termAt.has(k)) termAt.set(k, []); termAt.get(k).push({ o, i }); };
  for (const { o } of made) {
    const pts = linkPbTerms(o);
    if (o.one) { const k = K(...pts[0]); addTerm(k, o, 0); for (const q of o.one) { const qk = q.join(','); if (qk !== k && deg(qk)) run(q[0], q[1], pts[0][0], pts[0][1]); } continue; }
    o.cbT.forEach((c, j) => { const q = pts[j]; if (!q) return; const ck = c.join(','), qk = K(...q); addTerm(qk, o, j); if (ck !== qk && deg(ck)) run(c[0], c[1], q[0], q[1]); });
  }

  // ---- 3. the L1 and L2 rails: the bars (a ladder on bars), or the two long wires every rung comes off (on supply boxes)
  const rails = [];   // ({ label, x, from, to }: the stretch of the rail line the rungs come off, in G)
  if (bars) for (const [label, x, out] of [['L1', 0, -60], ['L2', W, 60]]) {
    // (the bar set a little out from the rungs, so a part that touches it in Circuit Builder gets a short wire to its rail on the print)
    const ys = [...new Set([...E.keys(), ...termAt.keys()].map(XY).filter(([px]) => px === x).map(q => q[1]))];
    for (const y of ys) run(x, y, x + out, y);
    rails.push({ label, x: x + out, from: ys.length ? Math.min(...ys) : 0, to: ys.length ? Math.max(...ys) : 200 }); }   // (a ladder always has its rails, even with nothing on it yet)
  // (on supply boxes: no rails. The two long uprights every rung comes off are wires like any other, numbered as they are
  // (Dallas, 17 Nov 2026: the drill station's are wires 3 and 2, not L1 and L2), and carried from sheet to sheet by continuations)
  // (the rail lines' own wire between their first and last rung is the rail now; past the last rung, nothing)
  const railAt = new Map();   // ("x,y" -> rail index: a point where a wire joins a rail)
  rails.forEach((rl, n) => {
    for (let y = rl.from; y < rl.to; y += 20) unlink(K(rl.x, y), K(rl.x, y + 20));
    for (let y = rl.to; deg(K(rl.x, y + 20)) && E.get(K(rl.x, y + 20)).has(K(rl.x, y)) && deg(K(rl.x, y + 20)) <= 2 && !termAt.has(K(rl.x, y + 20)); y += 20) unlink(K(rl.x, y), K(rl.x, y + 20));
    for (let y = rl.from; y <= rl.to; y += 20) if (deg(K(rl.x, y)) || termAt.has(K(rl.x, y))) railAt.set(K(rl.x, y), n);
  });
  // (wire left joined to nothing at either end, and overhangs running past a junction to nowhere: in Circuit Builder they joined nothing)
  const keyPt = k => termAt.has(k) || railAt.has(k);
  const isCross = k => deg(k) === 4 && !runEnds.has(k) && !keyPt(k);   // (two wires crossing, neither ending there: not joined)
  const through = k => !keyPt(k) && (deg(k) === 2 || isCross(k));
  const onward = (prev, cur) => { if (deg(cur) === 2) return [...E.get(cur)].find(n => n !== prev); const [px, py] = XY(prev), [cx, cy] = XY(cur); return [...E.get(cur)].find(n => { const [nx, ny] = XY(n); return n !== prev && (px === cx ? nx === cx : ny === cy); }); };
  for (let again = true; again;) { again = false; for (const k of [...E.keys()]) if (deg(k) === 0 && !keyPt(k)) E.delete(k); else if (deg(k) === 1 && !keyPt(k)) {
    // (walk back to where it joins something; drop it if that is a junction (an overhang), keep it if it leads to a terminal: a loose wire to show)
    let prev = k, cur = [...E.get(k)][0], path = [k]; while (cur && through(cur)) { path.push(cur); const nx = onward(prev, cur); prev = cur; cur = nx; }
    if (cur && ((deg(cur) >= 3 && !keyPt(cur)) || (deg(cur) === 1 && !keyPt(cur)))) { if (deg(cur) === 1) { path.push(cur); for (let i = 0; i + 1 < path.length; i++) unlink(path[i], path[i + 1]); for (const q of path) if (!deg(q)) E.delete(q); again = true; continue; } path.push(cur); for (let i = 0; i + 1 < path.length; i++) unlink(path[i], path[i + 1]); for (const q of path.slice(0, -1)) if (!deg(q)) E.delete(q); again = true; } } }

  // (points along a level run of wire that join nothing: taken out, so only the places that matter set how close things can be drawn)
  for (const k of [...E.keys()]) { if (deg(k) !== 2 || keyPt(k)) continue; const [x, y] = XY(k), [a, b] = [...E.get(k)];
    if (XY(a)[1] !== y || XY(b)[1] !== y) continue; unlink(k, a); unlink(k, b); E.delete(k); link2(a, b); }
  // ---- 4. the paper: letter portrait unless asked otherwise, each part its own size with room for its tag, its name and the wire numbers.
  // A long rung that won't fit across portrait that way (Dallas, 17 Nov 2026, his choice each time): letter landscape ('land'),
  // portrait drawn tighter ('tight'), or the rung folded onto a second line with a continuation ('fold')
  const spanOf = o => { const xs = linkPbTerms(o).map(q => q[0]); const half = o.t === 'motor' ? 60 : 40; return [Math.min(...xs, o.x - half), Math.max(...xs, o.x + half)]; };
  const allX = () => [...E.keys()].map(k => XY(k)[0]).concat(made.flatMap(({ o }) => [o.x, ...linkPbTerms(o).map(q => q[0])]), rails.map(r => r.x));
  const leftM = () => { const xs = allX(), m = Math.min(...xs); return 160 + (rails.length && Math.min(...rails.map(r => r.x)) - m < 120 ? 120 : 0); };   // (in from the left edge; more when the L1 rail is the leftmost thing, for its rung numbers)
  // (room on the right for the coils' cross-references: up to three numbers a line, Print Builder wraps the rest)
  const xrefN = new Map(); for (const { o } of made) if (/^(con|tc)_/.test(o.t) || o.t === 'mst3') xrefN.set(o.tag, (xrefN.get(o.tag) || 0) + 1);
  const xrefOf = n => 36 + Math.min(250, n * 54);   // (Print Builder wraps them at 250 across)
  const xrefW = xrefOf(Math.max(1, ...xrefN.values()));
  let ROOMCUT = 0;   // (taken off so the ladder can sit centred: see below)
  const roomFor = pap => linkDrawW(pap) - Math.max(leftM(), 140) - xrefW - 40 - ROOMCUT;   // (a margin each side, the rung numbers on the left, the cross-references on the right)
  const oneX = o => o.fold ? null : (() => { const ts = linkPbTerms(o); return ts.length && ts.every(q => q[0] === ts[0][0]) ? ts[0][0] : null; })();   // (a part whose terminals are all in one upright line: placed by them)
  // (how far a part's tag and the name under it reach out each side of its middle)
  const LIT = new Set(made.filter(({ o }) => o.inPB).map(({ o }) => o.inPB));
  const noteOf = o => [o.desc, o.t === 'coil' && /^TR/.test(o.tag || '') ? `${o.tof ? 'OFF' : 'ON'}-DELAY ${o.delay || ''} s` : '', o.t === 'sel' ? 'CLOSED: ' + (o.pos || '') : '', o.inPB ? 'IN ' + o.inPB : '', LIT.has(o.tag) ? 'LIGHTED (PL00)' : ''].filter(Boolean).join(' · ');
  const halfW = o => Math.max(40, (o.tag || '').length * 8 + 6, noteOf(o).length * 5.6 + 6);
  // (a terminal joined only along its own row: placed with its part, not on its own. Its part's middle, and how far out it is)
  let derived = new Map(), PREP = new Map();   // (PREP: each rung's places and spacing rules, worked out once)
  const mkDerived = () => { PREP = new Map(); derived = new Map(); for (const { o } of made) { if (oneX(o) != null) continue; linkPbTerms(o).forEach((q, i) => { const k = K(...q), ns = [...(E.get(k) || [])]; if (ns.some(n => XY(n)[0] === q[0])) return; derived.set(k, { o, off: q[0] - o.x }); }); } };
  mkDerived();
  // (the rungs: groups of rows between lines that nothing crosses but the uprights every rung comes off (or the rails). Each is laid out
  // across on its own, so one rung's spacing never pushes another's; the uprights (the pins) stay in one line down the sheet)
  const findGroups = () => {
    const horiz = new Set(); for (const [k, ns] of E) { const [, y] = XY(k); for (const n of ns) if (XY(n)[1] === y) horiz.add(y); }
    const partY = new Set(); for (const { o } of made) { const ys = linkPbTerms(o).map(q => q[1]).concat(o.y); for (let y = linkSnap(Math.min(...ys) - 20); y <= Math.max(...ys) + 20; y += 20) partY.add(y); }
    const vx = new Map(); for (const [k, ns] of E) { const [x, y] = XY(k); if (ns.has(K(x, y + 20))) { if (!vx.has(y)) vx.set(y, []); vx.get(y).push(x); } }
    const ys = [...E.keys()].map(k => XY(k)[1]).concat(made.flatMap(({ o }) => linkPbTerms(o).map(q => q[1]).concat(o.y))); if (!ys.length) return { groups: [], BUS: new Set(rails.map(r => r.x)) };
    const y0 = linkSnap(Math.min(...ys)) - 60, y1 = Math.max(...ys) + 60;
    const free = []; for (let y = y0; y <= y1; y += 20) if (!horiz.has(y) && !partY.has(y)) free.push(y);
    const cnt = new Map(); for (const y of free) for (const x of vx.get(y) || []) cnt.set(x, (cnt.get(x) || 0) + 1);
    const top = Math.max(0, ...cnt.values()), BUS = new Set([...cnt].filter(([, n]) => n >= top * .5).map(([x]) => x));
    for (const r of rails) BUS.add(r.x);
    const cut = y => !horiz.has(y) && !partY.has(y) && (vx.get(y) || []).every(x => BUS.has(x));
    const groups = []; let g = null;
    for (let y = y0; y <= y1; y += 20) { if (cut(y)) { if (g) { groups.push(g); g = null; } } else if (!g) g = [y, y]; else g[1] = y; }
    if (g) groups.push(g);
    return { groups, BUS };
  };
  let GR = findGroups();
  // (one rung laid out across: 'proper' keeps the tags, names and wire numbers clear of each other; 'tight' lets parts come as close as
  // their terminals allow. c: how much of the circuit's own gaps is kept. P: where the pins are already)
  const layBand = (band, mode, c, P, pins) => {
    const ck = band.join('-') + mode + pins.join(','); let pr = PREP.get(ck);
    if (!pr) { pr = prepBand(band, mode, pins); PREP.set(ck, pr); }
    const { keys, need } = pr;
    const n = [P.has(keys[0]) ? Math.max(keys[0], P.get(keys[0])) : keys[0]];
    for (let j = 1; j < keys.length; j++) { let v = n[j - 1] + Math.max(20, linkSnap((keys[j] - keys[j - 1]) * c)); for (const [i, r] of need[j]) v = Math.max(v, n[i] + r); if (P.has(keys[j])) v = Math.max(v, P.get(keys[j])); n.push(Math.ceil(v / 20 - 1e-9) * 20); }   // (on the grid, never closer than asked)
    return { keys, n, m: new Map(keys.map((k, i) => [k, n[i]])) };
  };
  const prepBand = (band, mode, pins) => {
    const inB = y => y >= band[0] && y <= band[1], M = made.filter(({ o }) => inB(o.y)), PR = mode === 'proper';
    const keySet = new Set(M.map(({ o }) => o.x).concat(pins));
    for (const k of E.keys()) if (!derived.has(k) && inB(XY(k)[1])) keySet.add(XY(k)[0]);
    for (const [k] of termAt) if (!derived.has(k) && inB(XY(k)[1])) keySet.add(XY(k)[0]);
    const keys = [...keySet].sort((a, b) => a - b), idx = new Map(keys.map((k, i) => [k, i]));
    const need = keys.map(() => []), req = (lo, hi, r) => { const i = idx.get(lo), j = idx.get(hi); if (i == null || j == null) return; if (j > i) need[j].push([i, r]); };
    // (along each part's own row: whatever its terminals join stays outside the part)
    const nb = (k, away) => [...(E.get(k) || [])].filter(n => { const [x, y] = XY(n), [kx, ky] = XY(k); return y === ky && Math.sign(x - kx) === away; });
    for (const { o } of M) { if (oneX(o) != null) continue; const hw = halfW(o);
      if (o.foldL != null) req(o.foldL, o.x, 100); if (o.foldR != null) req(o.x, o.foldR, 220);
      linkPbTerms(o).forEach(q => { const k = K(...q), off = q[0] - o.x, away = Math.sign(off) || 1;
        const outs = derived.has(k) ? nb(k, away) : [k];
        for (const n of outs) { const d2 = derived.get(n);
          if (d2 && d2.o !== o) { const sep = PR ? Math.max(Math.abs(off - d2.off) + 60, hw + halfW(d2.o) + 30) : Math.max(Math.abs(off - d2.off) + 20, hw + halfW(d2.o) + 12);   // (tighter: the names still clear of each other)
            if (away > 0) req(o.x, d2.o.x, sep); else req(d2.o.x, o.x, sep); continue; }
          const nx = XY(n)[0], gap = n === k ? 0 : railAt.has(n) ? (PR ? 80 : 60) : (PR ? 60 : 20), r = n === k ? Math.abs(off) : PR ? Math.max(Math.abs(off) + gap, hw + 20) : Math.max(Math.abs(off) + gap, hw + 8);
          if (away > 0) req(o.x, nx, r); else req(nx, o.x, r); } }); }
    return { keys, need };
  };
  // (the ladder across the whole sheet, as Dallas draws it (17 Nov 2026): the uprights out near the edges, each rung's contacts from the
  // left, and the loads (coils, lights, solenoids) in one column on the right, whatever comes after a load kept beside it)
  const LOADT = new Set(['coil', 'pl', 'sol', 'htr']);
  const fullWidth = (L, bands, pins, pap, tightB) => {
    if (pins.length < 2 || !L.res.length) return;
    const pl = pins[0], pr = pins[pins.length - 1], PL0 = L.P.get(pl), PR0 = L.P.get(pr); if (PL0 == null || PR0 == null) return;
    const info = L.res.map((r, i) => { const [a, b] = bands[i], inB = y => y >= a && y <= b;
      const loads = made.filter(({ o }) => inB(o.y) && LOADT.has(o.t) && oneX(o) == null && o.x > pl && o.x < pr).map(({ o }) => o.x);
      if (!loads.length) return null; const fl = Math.max(...loads);
      const before = made.filter(({ o }) => inB(o.y) && !LOADT.has(o.t) && o.x < fl && o.x > pl).map(({ o }) => o.x), S = Math.max(pl, ...before, ...pins.filter(x => x < fl));   // (never past an upright: those stay in line)
      if (pins.some(x => x > fl && x < pr)) return null;
      // (from the last contact on: the loads and what follows them as close together as they can be; the long wire goes before them)
      const mr = layBand(bands[i], tightB.has(i) ? 'tight' : 'proper', .1, new Map(), pins), m0 = mr.m.get(fl);
      return { S, rel: k => mr.m.get(k) - m0, tail: mr.m.get(pr) - m0, lx: r.m.get(S) + (m0 - mr.m.get(S)) }; });
    // (the column set by what most rungs have after their loads; a rung with more after its load has it a little further left)
    const tails = info.filter(Boolean).map(q => q.tail).sort((a, b) => a - b), base = tails.length ? tails[Math.floor(tails.length * .75)] : 0, tail = Math.max(0, ...tails.filter(t => t <= base + 40));   // (lights a little wider than coils: still one column)
    // (Dallas, 17 Nov 2026: the ladder centred on the sheet's middle line, so its uprights as far in from each edge: room each side for
    // the wider of the rung numbers and the cross-references)
    const lo = Math.min(...L.res.map(r => r.n[0])), side = Math.max(130 + Math.max(0, PL0 - lo), xrefW) + 30,   // (and for whatever the power section has out left of the first upright)
       want = Math.min(lo + roomFor(pap), PL0 + linkDrawW(pap) - 2 * side);
    // (the right upright as far out as the paper allows, never closer than any rung needs)
    const need = Math.max(...L.res.map((r, i) => info[i] ? info[i].lx + info[i].tail : r.m.get(pr)));   // (a rung too full for the column: its loads a little further right)
    const BR = Math.max(need, linkSnap(want) - 20), LX = BR - tail;
    L.res.forEach((r, i) => { const q = info[i];
      const nn = r.keys.map((k, j) => { const v = r.n[j];
        if (k >= pr) return v - r.m.get(pr) + BR;
        if (!q || k <= q.S) return v;
        return (q.tail > tail ? BR - q.tail : Math.max(LX, q.lx)) + q.rel(k); });
      r.n = nn; r.m = new Map(r.keys.map((k, j) => [k, nn[j]])); });
    L.P.set(pr, BR); for (const [k, v] of L.P) if (k > pr) L.P.set(k, v - PR0 + BR);
    L.w = BR - lo + Math.max(0, ...L.res.map(r => r.n[r.n.length - 1] - BR));
  };
  // (every rung laid out, the pins lined up: [rungs' layouts, the pins' places, how much of the gaps was kept, whether it fits])
  // ('tight': only the rungs that need it drawn tighter, the widest first, until it fits)
  // (align: every column the circuit has in more than one rung kept in one line down the sheet (Dallas, 17 Nov 2026: the parts
  // weren't lined up), when the paper has room for it)
  const fitTo = (pap, mode = 'proper', align = false) => {
    // (pins: the uprights, and buttons and switches drawn more than once one above another (their dashed link stays straight))
    const seen = new Map(); for (const { o } of made) if (o.tag && /^(pbm?_|sel|estop|ls_|ts_|ps_|fls_)/.test(o.t)) { const k = o.tag + '@' + o.x; seen.set(k, (seen.get(k) || 0) + 1); }
    const bands = GR.groups, tightB = new Set(), bandOfY = y => bands.findIndex(([a, b]) => y >= a && y <= b);
    const linkedIn = new Map(), mech = new Set();   // (x -> the rungs it is lined up across; mech: a button's or switch's own, always)
    for (const [k, n] of seen) if (n > 1) { const [tg, x] = [k.slice(0, k.lastIndexOf('@')), +k.slice(k.lastIndexOf('@') + 1)];
      const bs = new Set(made.filter(({ o }) => o.tag === tg && o.x === x).map(({ o }) => bandOfY(o.y)).filter(i => i >= 0)); if (bs.size > 1) { mech.add(x); if (!linkedIn.has(x)) linkedIn.set(x, new Set()); for (const i of bs) linkedIn.get(x).add(i); } }
    const pins = [...new Set([...GR.BUS, ...rails.map(r => r.x)])].sort((a, b) => a - b), pinSet = new Set(pins);
    if (align) { const inBands = new Map(); bands.forEach((b, i) => { for (const k of layBand(b, 'proper', 1, new Map(), pins).keys) if (!pinSet.has(k)) { if (!inBands.has(k)) inBands.set(k, new Set()); inBands.get(k).add(i); } });
      for (const [x, bs] of inBands) if (bs.size > 1) { if (!linkedIn.has(x)) linkedIn.set(x, new Set()); for (const i of bs) linkedIn.get(x).add(i); } }
    const layAt = c => { let P = new Map(), PL = new Map(), res = [];
      for (let it = 0; it < 8; it++) { res = bands.map((b, i) => { const P2 = new Map(P); for (const [x, bs] of linkedIn) if (bs.has(i) && PL.has(x) && (!tightB.has(i) || mech.has(x))) P2.set(x, PL.get(x)); return layBand(b, tightB.has(i) ? 'tight' : 'proper', c, P2, pins); }); let moved = false;
        res.forEach((r, bi) => r.keys.forEach((k, i) => { if (pinSet.has(k) && !(P.get(k) >= r.n[i])) { P.set(k, r.n[i]); moved = true; }
          if (linkedIn.has(k) && linkedIn.get(k).has(bi) && (!tightB.has(bi) || mech.has(k)) && !pinSet.has(k) && !(PL.get(k) >= r.n[i])) { PL.set(k, r.n[i]); moved = true; } }));
        if (!moved) break; }
      const all = res.flatMap(r => [r.n[0], r.n[r.n.length - 1]]).concat([...P.values()]);
      return { res, P, w: all.length ? Math.max(...all) - Math.min(...all) : 0 }; };
    if (mode === 'tight') { const iso = bands.map((b, i) => { const r = layBand(b, 'proper', .1, new Map(), pins); return [r.n[r.n.length - 1] - r.n[0], i]; }).sort((u, v) => v[0] - u[0]);
      for (const [, i] of iso) { if (layAt(.1).w <= roomFor(pap)) break; tightB.add(i); } }
    // (as much of the circuit's own spacing kept as fits: found by halving)
    let c = 1, L = layAt(1);
    if (L.w > roomFor(pap)) { let lo = .1, hi = 1, Lo = layAt(.1); c = .1; L = Lo;
      if (Lo.w <= roomFor(pap)) for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2, Lm = layAt(m); if (Lm.w <= roomFor(pap)) { lo = m; c = m; L = Lm; } else hi = m; } }
    const ok = L.w <= roomFor(pap); if (ok) fullWidth(L, bands, pins, pap, tightB);
    return { ...L, c, ok, bands, pins, tight: tightB.size, align };
  };
  const fitBest = (pap, mode = 'proper') => { const a = fitTo(pap, mode, true); if (env.debug) (env.debug.fb = env.debug.fb || []).push([mode, a.ok, a.tight, a.w]); if (a.ok && (mode !== 'tight' || a.tight <= fitTo(pap, mode).tight + 3)) return a; return fitTo(pap, mode); };
  // (fold: each rung too long for the paper broken where only its own wire crosses, the rest drawn on a line under it, a continuation each end)
  let foldN = 0;
  const foldLong = pap => {
    const room = roomFor(pap), { groups, BUS } = GR, pins = [...new Set([...BUS, ...rails.map(r => r.x)])].sort((a, b) => a - b);
    // (room left once whatever reaches out left of the first upright (the power section's lines in) is allowed for)
    const lp = pins[0], room2 = room - Math.max(0, ...groups.map(b => { const r = layBand(b, 'proper', .1, new Map(), pins); return r.m.has(lp) ? r.m.get(lp) - r.n[0] : 0; }));
    const DBG = env.debug ? (env.debug.fold = []) : null; if (DBG) DBG.push({ room, BUS: [...BUS], groups: groups.map(x => x.join('-')).join(' ') });
    const POWER = new Set(['mst3', 'dsc3', 'fus3', 'ol3', 'motor', 'sup', 'xfmr']);
    for (const [ga, gb] of groups.slice().reverse()) {
      const inB = y => y >= ga && y <= gb, gm = made.filter(({ o }) => inB(o.y));
      if (!gm.length || gm.some(({ o }) => POWER.has(o.t))) continue;
      const f = layBand([ga, gb], 'proper', .1, new Map(), pins), wd = f.n[f.n.length - 1] - f.n[0]; const wd2 = f.m.has(lp) ? f.n[f.n.length - 1] - f.m.get(lp) : wd; if (DBG) DBG.push([ga, gb, wd2]); if (wd2 <= room2) continue;
      const { keys, n: nn } = f, pos = x => { let i = 0; while (i + 1 < keys.length && keys[i + 1] <= x) i++; return nn[i] + (x - keys[i]); };
      const pts = [...E.keys()].filter(k => inB(XY(k)[1]));
      const xR = Math.max(...[...BUS].filter(x => pts.some(k => XY(k)[0] === x)).concat(rails.filter(r => r.label === 'L2').map(r => r.x)), -Infinity);
      if (!Number.isFinite(xR)) continue;
      const tx = gm.flatMap(({ o }) => linkPbTerms(o).map(q => q[0])), Xl = Math.min(...tx) + 80;
      const spans = gm.filter(({ o }) => !o.fold).map(({ o }) => { const xs = linkPbTerms(o).map(q => q[0]).concat(o.x); return [Math.min(...xs) - 20, Math.max(...xs) + 20]; });
      const edgesIn = []; for (const k of pts) for (const n of E.get(k)) if (k < n) edgesIn.push([k, n]);
      let best = null;
      for (let X = linkSnap(Math.min(...tx)) + 60; X < xR - 60; X += 20) {
        if (spans.some(([u, v]) => X >= u && X <= v) || pts.some(k => XY(k)[0] === X)) continue;
        const hs = edgesIn.filter(([a, b]) => { const [ax, ay] = XY(a), [bx, by] = XY(b); return ay === by && Math.min(ax, bx) < X && Math.max(ax, bx) > X; });
        if (!hs.length || hs.length > 2) continue;   // (a rung with more than two wires to fold (nested branches) is drawn tighter instead)
        // (what moves must keep to the rung: nothing of it running up or down out of the rung's rows)
        if (pts.some(k => { const [x] = XY(k); return x > X && x < xR && [...E.get(k)].some(n => !inB(XY(n)[1])); })) continue;
        const x0 = f.m.has(lp) ? f.m.get(lp) : nn[0], lw = pos(X) - x0 + 300, rw = pos(Xl) - x0 + nn[nn.length - 1] - pos(X) + 60, sc = (lw <= room2 && rw <= room2 ? -lw : 1e6 + Math.max(lw, rw)) + hs.length * 4000;
        if (!best || sc < best.sc) best = { X, sc, es: hs };
      }
      if (DBG) DBG.push({ best: best && [best.X, best.sc], xR, Xl }); if (!best) continue;
      const { X } = best, H = gb - ga + 200, moves = (x, y) => inB(y) && x > X && x < xR;
      const F = k => { const [x, y] = XY(k); return y > gb ? K(x, y + H) : moves(x, y) ? K(x - X + Xl, y + H) : k; };
      const edges = []; for (const [k, ns] of E) for (const n of ns) if (k < n) edges.push([k, n]);
      const oldTerm = new Map(termAt), movedO = new Set(gm.filter(({ o }) => o.x > X && o.x < xR).map(({ o }) => o));
      E.clear(); const busNeed = [];
      const splits = new Set(best.es.map(([a, b]) => a < b ? a + '|' + b : b + '|' + a)), ends = [];
      for (const [a, b] of edges) {
        if (splits.has(a < b ? a + '|' + b : b + '|' + a)) { const [ax0, sy] = XY(a), [bx0] = XY(b), sl = ax0 < bx0 ? a : b, sr = ax0 < bx0 ? b : a; link2(sl, K(X, sy)); link2(K(Xl, sy + H), F(sr)); ends.push(sy); continue; }
        const fa = F(a), fb = F(b), [ax, ay] = XY(fa), [bx, by] = XY(fb);
        if (ax === bx || ay === by) { link2(fa, fb); continue; }
        const m = XY(a)[0] === xR ? fb : fa, yy = XY(m)[1]; link2(m, K(xR, yy)); busNeed.push(yy);
      }
      termAt.clear();
      for (const { o } of made) { if (movedO.has(o)) { o.x = o.x - X + Xl; o.y += H; } else if (o.y > gb) o.y += H; }
      for (const [k, tt] of oldTerm) for (const t of tt) { if (!movedO.has(t.o)) { addTerm(F(k), t.o, t.i); continue; }
        const nk = K(...linkPbTerms(t.o)[t.i]); addTerm(nk, t.o, t.i); if (F(k) !== nk) { link2(nk, K(xR, XY(nk)[1])); busNeed.push(XY(nk)[1]); } }
      { const r2 = [...runEnds].map(F); runEnds.clear(); for (const k of r2) runEnds.add(k); }
      { const m2 = new Map(); for (const [k, v] of railAt) m2.set(F(k), v); railAt.clear(); for (const [k, v] of m2) railAt.set(k, v); }
      for (const rl of rails) { if (rl.from > gb) rl.from += H; if (rl.to > gb) rl.to += H; }
      const rR = rails.find(r => r.x === xR);
      for (const y of busNeed) { if (rR) { railAt.set(K(xR, y), rails.indexOf(rR)); rR.to = Math.max(rR.to, y); continue; }
        const ky = [...E.keys()].filter(k => XY(k)[0] === xR && k !== K(xR, y) && [...E.get(k)].some(n => XY(n)[0] === xR)).map(k => XY(k)[1]);
        if (ky.length && Math.max(...ky) < y) link2(K(xR, Math.max(...ky)), K(xR, y)); }
      // (long uprights back into short steps, so the sheet breaks can find them)
      for (const [k, ns] of [...E]) for (const n of [...ns]) { const [x, y] = XY(k), [nx, ny] = XY(n); if (x !== nx || ny - y <= 20) continue;
        unlink(k, n); const along = [...E.keys()].filter(q => { const [qx, qy] = XY(q); return qx === x && qy > y && qy < ny; }).map(q => XY(q)[1]).sort((u, v) => u - v);
        let prev = y; for (let yy = y + 20; yy <= ny; yy += 20) { link2(K(x, prev), K(x, yy)); prev = yy; } void along; }
      const fL = Math.min(...[...BUS].filter(x => x < Xl && (pts.some(k => XY(k)[0] === x) || rails.some(r => r.x === x))));
      for (const sy of ends.sort((u, v) => u - v)) { const tag = String(++foldN), oO = { id: uid('p'), t: 'cnt_out', x: X + 40, y: sy, rot: 0, desc: '', tag, fold: 1, foldR: xR }, oI = { id: uid('p'), t: 'cnt_in', x: Xl - 40, y: sy + H, rot: 0, desc: '', tag, fold: 1, foldL: fL };
        made.push({ r: null, o: oO }, { r: null, o: oI }); addTerm(K(X, sy), oO, 0); addTerm(K(Xl, sy + H), oI, 0); }
      note(changed, 'Rungs too long for the paper: folded onto lines under them, a continuation at each end of each wire folded');
    }
    mkDerived(); GR = findGroups();
  };
  const P0 = { paper: 'letter', land: false }, mode = env.long || 'tight', blank = !made.length && !E.size;
  let paper = env.paper || null, fit = null, ask = false;
  if (paper) { fit = fitBest(paper, 'proper'); if (!fit.ok) fit = fitBest(paper, 'tight'); }
  else if (blank) { paper = P0; fit = fitBest(P0); }
  else { const f0 = fitBest(P0, 'proper'); ask = !f0.ok; paper = P0; fit = f0;
    if (ask && mode === 'tight') fit = fitBest(P0, 'tight');
    else if (ask && mode === 'fold') { foldLong(P0); fit = fitBest(P0, 'proper'); if (!fit.ok) fit = fitBest(P0, 'tight'); }
    else if (ask) for (const pap of [{ paper: 'letter', land: true }, { paper: 'tabloid', land: true }, { paper: 'ansic', land: true }]) { const f = fitBest(pap, 'proper'); paper = pap; fit = f; if (f.ok) break; }
  }
  // (centred: room the same each side of the uprights for the rung numbers (and anything out left of them) and the cross-references;
  // drawn closer, or tighter, if that is what it takes)
  for (let it = 0; it < 3 && fit.ok && fit.P && fit.P.size >= 2; it++) {
    const PLx = fit.P.get(Math.min(...fit.P.keys())), lo = Math.min(...fit.res.map(r => r.n[0])), over = Math.max(0, PLx - lo);
    const side = Math.max(130 + over, xrefW) + 30, fits = over + linkDrawW(paper) - 2 * side;
    if (fit.w <= fits + 1) break;
    ROOMCUT += fit.w - fits; const m2 = fit.tight ? 'tight' : 'proper'; let f2 = fitBest(paper, m2); if (!f2.ok) f2 = fitBest(paper, 'tight'); if (!f2.ok) { ROOMCUT = 0; break; } fit = f2; }
  if (env.debug) { env.debug.fit = fit; env.debug.made = made.map(({ o }) => [o.t, o.x, spanOf(o)]); env.debug.room = roomFor(paper); }
  const sheet0 = { paper: paper.paper, land: !!paper.land }, DH = linkDrawH(sheet0);
  if (!fit.ok) note(changed, 'The circuit is wider than the paper even drawn closer: it runs off the right of each sheet (shrink it in Circuit Builder, or move things on the print)');
  if (fit.c < .999) note(changed, `Drawn closer across to fit ${sheet0.paper === 'letter' ? 'letter' : sheet0.paper} paper (the parts their own size, the gaps between them closed up)`);
  if (fit.tight) note(changed, `${fit.tight === 1 ? 'One rung' : fit.tight + ' rungs'} too long for the paper drawn tighter (closer than usual)`);
  // (across, rung by rung: a place in a rung's own layout; off every rung (the uprights between rungs), by the pins)
  const interp = (keys, n, x) => { let i = 0; while (i < keys.length && keys[i] < x) i++; if (i < keys.length && keys[i] === x) return n[i]; if (i === 0) return x - keys[0] + n[0]; if (i === keys.length) return x - keys[i - 1] + n[i - 1]; return linkSnap(n[i - 1] + (x - keys[i - 1]) * (n[i] - n[i - 1]) / (keys[i] - keys[i - 1])); };
  const pinK = [...fit.P.keys()].sort((a, b) => a - b), pinN = pinK.map(k => fit.P.get(k));
  const bandAt = y => fit.bands.findIndex(([a, b]) => y >= a && y <= b);
  const MXb = (x, y) => { const i = bandAt(y); if (i >= 0) { const r = fit.res[i]; return r.m.has(x) ? r.m.get(x) : interp(r.keys, r.n, x); } return pinK.length ? interp(pinK, pinN, x) : x; };
  const xb = fit.bands.length ? fit.bands.map(([a, b], i) => [a, b, fit.res[i].keys, fit.res[i].n]) : null;
  // (everything moved across: parts, rails, the wiring)
  { const E2 = new Map(); const mk = k => { const [x, y] = XY(k), dv = derived.get(k); return K(dv ? MXb(dv.o.x, dv.o.y) + dv.off : MXb(x, y), y); };
    for (const [k, ns] of E) E2.set(mk(k), new Set([...ns].map(mk)));
    E.clear(); for (const [k, v] of E2) E.set(k, v);
    const re = m => { const m2 = new Map(); for (const [k, v] of m) m2.set(mk(k), v); m.clear(); for (const [k, v] of m2) m.set(k, v); }; re(termAt); re(railAt); { const r2 = [...runEnds].map(mk); runEnds.clear(); for (const k of r2) runEnds.add(k); }
    for (const { o } of made) { const tx = oneX(o), ty = tx != null ? linkPbTerms(o)[0][1] : o.y; o.x = tx != null ? MXb(tx, ty) - (tx - o.x) : MXb(o.x, o.y); }
    for (const rl of rails) rl.x = pinK.length ? interp(pinK, pinN, rl.x) : rl.x; }

  // ---- 5. sheets (Dallas, 17 Nov 2026: as few continuations as can be; a rung's logic kept on one sheet; the ladder centred)
  const room = DH - 280;   // (the drawing's height, less a margin and the continuations at its top and its foot, clear of the title block)
  // (a rung too tall for a sheet: its rows drawn closer down, as close as their tags and names allow)
  { const yk = new Set(); for (const k of E.keys()) yk.add(XY(k)[1]); for (const k of termAt.keys()) yk.add(XY(k)[1]);
    for (const { o } of made) { yk.add(o.y); for (const q of linkPbTerms(o)) yk.add(q[1]); } for (const r of rails) { yk.add(r.from); yk.add(r.to); }
    const ys = [...yk].sort((a, b) => a - b), idx = new Map(ys.map((y, i) => [y, i]));
    const tall = GR.groups.filter(([a, b]) => b - a + 160 > room);
    // (and every rung a little closer down than Circuit Builder draws it, so more rungs share a sheet: its rows, at most 4/5 as far apart)
    const CY = .8;
    if (ys.length) {
      // (points along an upright that join nothing: taken out first, so the rows alone set how close they can come)
      for (const k of [...E.keys()]) { if (deg(k) !== 2 || termAt.has(k) || railAt.has(k) || runEnds.has(k)) continue; const [x] = XY(k), [a, b] = [...E.get(k)];
        if (XY(a)[0] !== x || XY(b)[0] !== x) continue; unlink(k, a); unlink(k, b); E.delete(k); link2(a, b); }
      yk.clear(); for (const k of E.keys()) yk.add(XY(k)[1]); for (const k of termAt.keys()) yk.add(XY(k)[1]);
      for (const { o } of made) { yk.add(o.y); for (const q of linkPbTerms(o)) yk.add(q[1]); } for (const r of rails) { yk.add(r.from); yk.add(r.to); }
      ys.length = 0; ys.push(...[...yk].sort((a, b) => a - b)); idx.clear(); ys.forEach((y, i) => idx.set(y, i));
      const up = new Map(), down = new Map(), need = ys.map(() => []);
      for (const { o } of made) { const ts = linkPbTerms(o), ty = ts.map(q => q[1]);
        if (ty.length && ty.some(y => y !== ty[0])) { const lo = Math.min(...ty, o.y), hi = Math.max(...ty, o.y); need[idx.get(hi)].push([idx.get(lo), hi - lo]); continue; }
        up.set(o.y, Math.max(up.get(o.y) || 0, 70)); down.set(o.y, Math.max(down.get(o.y) || 0, noteOf(o) ? 64 : 34)); }
      const rows = ys.filter(y => up.has(y)); for (let i = 1; i < rows.length; i++) need[idx.get(rows[i])].push([idx.get(rows[i - 1]), down.get(rows[i - 1]) + up.get(rows[i]) + 10]);
      const cOf = new Map(tall.map(g => [g, 1]));
      const lay = () => { const n = [ys[0]]; for (let j = 1; j < ys.length; j++) { const g = tall.find(([a, b]) => ys[j - 1] >= a && ys[j] <= b), c = g ? cOf.get(g) : 1;
        const gap = ys[j] - ys[j - 1]; let v = n[j - 1] + Math.max(20, linkSnap(c < CY ? gap * c : gap <= 200 ? Math.max(Math.min(gap, 160), gap * CY) : 160 + (gap - 200) * .4));   // (never closer than 160 unless a rung needs it to fit; a long run with nothing on it much shorter)
        for (const [i, r] of need[j]) v = Math.max(v, n[i] + r); n.push(linkSnap(v)); } return n; };
      let n = lay(); for (const g of tall) { const h = () => n[idx.get(Math.max(...ys.filter(y => y <= g[1])))] - n[idx.get(Math.min(...ys.filter(y => y >= g[0])))];
        while ((cOf.get(g) > .45 && h() + 160 > room * .75) || (cOf.get(g) > .2 && h() + 160 > room)) {   // (closer still, so the rungs before or after can share its sheet)
          cOf.set(g, cOf.get(g) - .05); n = lay(); } }
      const MY = new Map(ys.map((y, i) => [y, n[i]])), my = y => MY.has(y) ? MY.get(y) : y;
      if (n.some((v, i) => v !== ys[i])) {
        const mk = k => { const [x, y] = XY(k); return K(x, my(y)); };
        const E2 = new Map(); for (const [k, ns] of E) E2.set(mk(k), new Set([...ns].map(mk))); E.clear(); for (const [k, v] of E2) E.set(k, v);
        const re = m => { const m2 = new Map(); for (const [k, v] of m) m2.set(mk(k), v); m.clear(); for (const [k, v] of m2) m.set(k, v); }; re(termAt); re(railAt); { const r2 = [...runEnds].map(mk); runEnds.clear(); for (const k of r2) runEnds.add(k); }
        for (const { o } of made) { const ts = linkPbTerms(o); o.y = ts.length ? my(ts[0][1]) - (ts[0][1] - o.y) : my(o.y); }
        for (const r of rails) { r.from = my(r.from); r.to = my(r.to); }
        // (uprights back into short steps)
        for (const [k, ns] of [...E]) for (const q of [...ns]) { const [x, y] = XY(k), [qx, qy] = XY(q); if (x !== qx || qy - y <= 20) continue;
          unlink(k, q); let prev = y; for (let yy = y + 20; yy <= qy; yy += 20) { link2(K(x, prev), K(x, yy)); prev = yy; } }
        ylink = [ys, n];
        GR = findGroups();
      } } }
  const allY = [...E.keys()].map(k => XY(k)[1]).concat(made.map(({ o }) => o.y), rails.flatMap(r => [r.from, r.to]));
  const gy0 = Math.min(...allY), gy1 = Math.max(...allY);
  const horizAt = new Set(); for (const [k, ns] of E) { const [, y] = XY(k); for (const n of ns) if (XY(n)[1] === y) horizAt.add(y); }
  const partBand = []; for (const { o } of made) { const ys = linkPbTerms(o).map(q => q[1]).concat(o.y); partBand.push([Math.min(...ys) - 80, Math.max(...ys) + 80]); }
  const crossN = new Map(); for (const [k, ns] of E) { const [x, y] = XY(k); if (ns.has(K(x, y + 20))) crossN.set(y + 20, (crossN.get(y + 20) || 0) + 1); }
  const crossing = C => crossN.get(C) || 0;
  const inPart = new Set(); for (const [u, v] of partBand) for (let y = linkSnap(u) + 20; y < v; y += 20) inPart.add(y);
  const termYs = new Set([...termAt.keys()].map(k => XY(k)[1]));
  const okCut = C => !horizAt.has(C - 20) && !horizAt.has(C) && !horizAt.has(C + 20) && !(inPart.has(C) || partBand.some(([u, v]) => C > u && C < v && C % 20)) && !termYs.has(C) && !termYs.has(C - 20) && !termYs.has(C + 20);
  // (where the sheets break: the fewest wires cut over the whole print (each one a pair of continuations), never inside a rung if it
  // can be helped, then the fewest sheets. Every line between rungs is looked at, not just the first that fills a sheet)
  const between = y => !GR.groups.some(([a, b]) => y > a && y < b);
  const base = Math.min(...GR.groups.slice(0, -1).map((g, i) => { const c = []; for (let y = g[1] + 20; y < GR.groups[i + 1][0]; y += 20) if (okCut(y)) c.push(crossing(y)); return c.length ? Math.min(...c) : Infinity; }).concat([Infinity]));
  const cuts = [];
  if (gy1 - (gy0 - 40) > room) {
    const cand = []; for (let C = linkSnap(gy0) + 20; C < gy1; C += 20) { const ok = okCut(C), x = crossing(C);
      cand.push({ C, cost: ok ? (between(C) ? 0 : 400) + 1000 * Math.max(0, x - (Number.isFinite(base) ? base : 0)) + 10 * x : 1e6 + 1000 * x }); }
    const start = gy0 - 40, best = cand.map(() => null);
    for (let i = 0; i < cand.length; i++) { if (cand[i].C - start <= room) best[i] = { cost: cand[i].cost + 50, prev: -1, n: 1 };
      for (let j = i - 1; j >= 0 && cand[i].C - cand[j].C <= room; j--) if (best[j]) { const c = best[j].cost + cand[i].cost + 50; if (!best[i] || c < best[i].cost) best[i] = { cost: c, prev: j, n: best[j].n + 1 }; } }
    let end = -1, endCost = Infinity; for (let i = 0; i < cand.length; i++) if (best[i] && gy1 - cand[i].C <= room && best[i].cost < endCost) { endCost = best[i].cost; end = i; }
    for (let i = end; i >= 0; i = best[i].prev) cuts.unshift(cand[i].C);
  }
  const tops = [gy0 - 40, ...cuts], sheetOf = y => { let k = 0; while (k < cuts.length && y > cuts[k]) k++; return k; };
  const sheets = tops.map(() => ({ id: uid('s'), ...(sheet0.paper !== 'letter' ? { paper: sheet0.paper } : {}), land: sheet0.land, parts: [], wires: [], nodes: [], texts: [] }));
  // (each sheet's ladder centred across it, its rung numbers on the left and the coils' cross-references on the right counted in
  // (Dallas, 17 Nov 2026: it always leaned to one side); top: a short margin, then the continuations)
  const TOP = 120;
  const OXs = tops.map((t, k) => { const lo = k ? t : -Infinity, hi = k < cuts.length ? cuts[k] : Infinity, inS = y => y > lo && y <= hi;
    const xs = [...E.keys()].filter(q => inS(XY(q)[1])).map(q => XY(q)[0]).concat(made.filter(({ o }) => inS(o.y)).flatMap(({ o }) => [o.x, ...linkPbTerms(o).map(q => q[0])]));
    const rx = rails.filter(r => r.from <= hi && r.to >= lo).map(r => r.x); xs.push(...rx); if (!xs.length) xs.push(...allX());
    const coilN = Math.max(0, ...made.filter(({ o }) => inS(o.y) && (o.t === 'coil' || o.t === 'mst3')).map(({ o }) => xrefN.get(o.tag) || 1));
    const xl = Math.min(...xs) - (rx.length && Math.min(...rx) - Math.min(...xs) < 120 ? 170 : 110), xr = Math.max(...xs) + (coilN ? xrefOf(coilN) : 60);
    // (the uprights' middle on the sheet's middle; moved over only as far as needed to keep everything inside the border)
    const ups = fit.P && fit.P.size >= 2 ? [Math.min(...fit.P.values()), Math.max(...fit.P.values())] : null, DW = linkDrawW(sheet0);
    let ox = ups ? (DW - (ups[0] + ups[1])) / 2 : (DW - (xr - xl)) / 2 - xl;
    if (xl + ox < 40) ox = 40 - xl; else if (xr + ox > DW - 16) ox = Math.max(40 - xl, DW - 16 - xr);
    return linkSnap(ox); });
  const OX = OXs[0];
  const OY = k => TOP - tops[k] + (k ? 40 : 0);
  const P = (k, x, y) => [x + OXs[k], y + OY(k)];
  // (a wire running down over a break: a continuation each side, numbered alike)
  let contN = Math.max(foldN, ...[...jmpSeen.keys()].map(Number).filter(Number.isFinite)); const contAt = new Map();
  for (const C of cuts) for (const [k, ns] of [...E].sort((u, v) => XY(u[0])[0] - XY(v[0])[0])) { const [x, y] = XY(k); if (y !== C - 20 || !ns.has(K(x, C))) continue;
    // (cut the run at C: the point above ends on a continuation out, the one below starts from a continuation in)
    const ab = K(x, C - 20), at = K(x, C), be = K(x, C + 20); unlink(ab, at); unlink(at, be); if (!deg(at)) E.delete(at);
    const n = String(++contN); contAt.set(ab, { t: 'cnt_out', n }); contAt.set(be, { t: 'cnt_in', n }); }
  if (contAt.size) note(changed, 'Wires running from one sheet to the next: a continuation at each end, numbered alike');
  // parts on their sheets
  for (const { o } of made) { const k = sheetOf(o.y), [x, y] = P(k, o.x, o.y); o.x = x; o.y = y; o.k = k; delete o.cbT; delete o.one; delete o.fold; delete o.foldL; delete o.foldR; sheets[k].parts.push(o); }
  // rails on every sheet they reach, from the top of the drawing (or the first rung) down to the foot (or the last rung)
  const railIds = rails.map(() => new Map());
  rails.forEach((rl, n) => sheets.forEach((s, k) => {
    const lo = Math.max(rl.from, k ? tops[k] : -Infinity), hi = Math.min(rl.to, k < cuts.length ? cuts[k] : Infinity);
    if (lo > hi) return;
    const y0 = (k && rl.from < tops[k]) || bars ? Math.min(TOP - 60, lo + OY(k)) : lo + OY(k), y1 = k < cuts.length && rl.to > cuts[k] ? linkDrawH(sheet0) - 40 : hi + OY(k) + (bars ? 60 : 0);
    const id = uid('r'); railIds[n].set(k, id); s.parts.push({ id, t: 'rail', label: rl.label, x: rl.x + OXs[k], y0, y1 });
  }));
  for (const [k, c] of contAt) { const [x, y] = XY(k), sk = sheetOf(y), [px, py] = P(sk, x, y), o = { id: uid('p'), t: c.t, rot: 90, desc: '', tag: c.n, brk: 1 };
    const [u, v] = linkTurn(LINK_PB_TERMS[c.t][0], 90); o.x = px - u; o.y = py - v; o.k = sk; sheets[sk].parts.push(o); addTerm(k, o, 0); }
  // ---- 6. wires: traced from terminal to terminal (or rail, or junction), corners kept
  const nodeIds = new Map();
  const endOf = (k, sk) => { const tt = termAt.get(k); if (tt) { const t0 = tt.find(q => q.o.k === sk); if (t0) return { p: t0.o.id, i: t0.i }; }
    if (railAt.has(k)) { const id = railIds[railAt.get(k)].get(sk); if (id) return { r: id, y: XY(k)[1] + OY(sk) }; }
    if (!nodeIds.has(k)) { const [x, y] = P(sk, ...XY(k)), id = uid('n'); sheets[sk].nodes.push({ id, x, y }); nodeIds.set(k, id); } return { n: nodeIds.get(k) }; };
  const stop = k => !through(k);
  const done = new Set(), ek = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  for (const start of E.keys()) { if (!stop(start)) continue;
    for (const first of E.get(start)) { if (done.has(ek(start, first))) continue;
      const path = [start]; let prev = start, cur = first; done.add(ek(start, first));
      while (!stop(cur)) { path.push(cur); const nx = onward(prev, cur); prev = cur; cur = nx; done.add(ek(prev, cur)); }
      path.push(cur);
      const sk = sheetOf(XY(path[0])[1]), ea = endOf(path[0], sk), eb = endOf(path[path.length - 1], sk);
      // (in print places: the ends where the wire really joins; a terminal can sit a little in from where the wiring reached it)
      const real = (e, k) => { const q = e.p && sheets[sk].parts.find(q => q.id === e.p); return q ? linkPbTerms(q)[e.i] : P(sk, ...XY(k)); };
      let pts = [real(ea, path[0]), ...path.map(k => P(sk, ...XY(k))), real(eb, path[path.length - 1])];
      // (a step where a terminal sits in from the wiring's end: along the terminal's own line first)
      const fixEnd = (arr) => { const [t, q, r] = arr; if (t[0] !== q[0] && t[1] !== q[1]) arr.splice(1, 0, r && r[0] === q[0] ? [q[0], t[1]] : [t[0], q[1]]); return arr; };
      pts = fixEnd(pts); pts = fixEnd(pts.reverse()).reverse();
      const clean = []; for (const q of pts) { const l = clean[clean.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) clean.push(q); }
      for (let i = clean.length - 2; i >= 1; i--) { const [a, q, b] = [clean[i - 1], clean[i], clean[i + 1]]; if ((a[0] === q[0] && q[0] === b[0]) || (a[1] === q[1] && q[1] === b[1])) clean.splice(i, 1); }
      sheets[sk].wires.push({ id: uid('w'), a: ea, b: eb, pts: clean.slice(1, -1) });
    } }
  // (a ring of wire with no ends at all: nothing to number; Circuit Builder would join it to nothing either)
  if (d.pv && d.pv.length) note(left, 'Process values (they stay with the circuit, and come back with it)');
  if (d.fl || d.sn) note(left, 'Planted faults (they stay with the circuit, and come back with it)');
  const doc = { kind: 'o3-print', v: 1, tb: env.defaultTB(), sheets, cur: 0 };
  const tf = doc.tb.fields.find(f => /title/i.test(f.label)); if (tf) tf.value = d.name || 'Circuit';
  doc.link = { from: 'circuit-builder', v: 2, cb: d0, ox: OX, ...(OXs.some(v => v !== OX) ? { oxs: OXs } : {}), oy: sheets.map((_, k) => OY(k)), sy, ...(xb ? { xb } : {}), ...(ylink ? { ym: ylink } : {}), fp: linkFingerprint(doc) };
  return { doc, notes: { changed, left }, ask };
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
