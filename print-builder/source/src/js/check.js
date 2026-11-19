/* =====================================================================
   Check Print: the mistakes a print can have, found on the drawing. Each: how bad (e error, w warning),
   what it is, a line more, and where (sheet k, the thing's id, a point to ring on the sheet).
   ===================================================================== */
const UNIQUE = new Set(['sw', 'coil', 'load', 'fuse', 'ol', 'power', 'motor', 'xfmr']);
function checkPrint(A = analyse()) {
  const out = [], pk = ({ s, k, p }) => ({ k, id: p.id, x: p.x, y: p.y });
  const add = (sev, title, detail, at = []) => out.push({ sev, title, detail, at });
  const { parts, kindOf, label, TERMS, WIRED } = A;
  const name = p => p.tag || LIB[p.t].name;
  const sheetName = k => doc.sheets.length > 1 ? ` (sheet ${k + 1})` : '';
  // (a button's or switch's other contacts share its name: blocksOf)
  // tags: the same one on two devices that must each have their own; none at all
  const byTag = new Map();
  for (const x of parts) if (UNIQUE.has(kindOf(x.p)) && x.p.tag && !(blocksOf(x.p).length > 1 && mainBlock(x.p) !== x.p)) for (const tg of tagsOf(x.p)) { const k = (kindOf(x.p) === 'motor' ? 'motor:' : '') + tg; if (!byTag.has(k)) byTag.set(k, []); byTag.get(k).push(x); }
  let dups = 0;
  for (const [k, xs] of byTag) if (xs.length > 1) { const t = k.replace('motor:', ''); dups++;
    add('e', `${xs.length} devices are tagged ${t}`, `${[...new Set(xs.map(x => LIB[x.p.t].name))].join(' and ')}: each needs a tag of its own (only contacts share their coil’s).`, xs.map(pk)); }
  for (const x of parts) if (!x.p.tag) add('w', `A ${LIB[x.p.t].name.toLowerCase()} has no tag`, 'Give it one in its properties.', [pk(x)]);
  // continuations: each letter wants an arrow out and an arrow in
  for (const x of parts) if (LIB[x.p.t].kind === 'cont' && x.p.tag) { const other = x.p.t === 'cnt_out' ? 'cnt_in' : 'cnt_out';
    if (!parts.some(y => y.p.t === other && y.p.tag === x.p.tag)) add('w', `Continuation ${x.p.tag} goes nowhere`, x.p.t === 'cnt_out' ? `Put a “Continued From” arrow lettered ${x.p.tag} where the wire picks up again (on the next sheet).` : `Nothing continues to ${x.p.tag}: put a “Continues To” arrow lettered ${x.p.tag} where the wire leaves off.`, [pk(x)]); }
  // a light built into a pushbutton that isn't on the print
  for (const x of parts) if (x.p.t === 'pl' && x.p.inPB && !parts.some(y => isPB(y.p) && y.p.tag === x.p.inPB)) add('w', `${name(x.p)} is built into ${x.p.inPB}, which isn't on the print`, 'Put the pushbutton on the print, or pick another in the light’s Part tab.', [pk(x)]);
  // contacts and their coils
  const coils = new Set(parts.filter(x => kindOf(x.p) === 'coil').map(x => x.p.tag)), ols = new Set(parts.filter(x => kindOf(x.p) === 'ol').map(x => x.p.tag));
  const orphan = new Map();
  for (const x of parts) { const k = kindOf(x.p); if (!x.p.tag) continue;
    if ((k === 'contact' || k === 'starter') && !coils.has(x.p.tag)) { if (!orphan.has(x.p.tag)) orphan.set(x.p.tag, []); orphan.get(x.p.tag).push(x); }
    if (k === 'olc' && !ols.has(x.p.tag)) add('w', `Overload contact ${x.p.tag} has no overload`, `No overload heater is tagged ${x.p.tag}.`, [pk(x)]); }
  for (const [t, xs] of orphan) add('w', `Contact${xs.length > 1 ? 's' : ''} ${t} ha${xs.length > 1 ? 've' : 's'} no coil`, `No coil is tagged ${t}${coils.size ? ` (the coils: ${[...coils].filter(Boolean).join(', ')})` : ''}.`, xs.map(pk));
  for (const x of parts) if (kindOf(x.p) === 'coil' && x.p.tag && !parts.some(y => (kindOf(y.p) === 'contact' || kindOf(y.p) === 'starter') && y.p.tag === x.p.tag))
    add('w', `Coil ${x.p.tag} works no contacts`, `Nothing on the print is tagged ${x.p.tag} but the coil.`, [pk(x)]);
  // wiring: terminals with nothing on them, wires that end in the air
  let open = 0;
  for (const x of parts) { const loose = [];
    for (let i = 0; i < termsN(x.p); i++) { const r = A.rootT(x.p, x.s, i); if (!WIRED.has(r) && (TERMS.get(r) || []).length < 2 && !isArrowIn(x.p.t)) loose.push(i); }
    if (loose.length) { open++; add('e', `${name(x.p)} is not wired${loose.length < termsN(x.p) ? ' at one end' : ''}${sheetName(x.k)}`, loose.length < termsN(x.p) ? 'A terminal with no wire on it.' : 'No wire reaches it.', [pk(x)]); } }
  doc.sheets.forEach((s, k) => { for (const n of s.nodes) if (wiresAt(s, { n: n.id }).length === 1 && !s.parts.some(p => p.t !== 'rail' && [...Array(termsN(p)).keys()].some(i => { const q = termPos(p, i); return q[0] === n.x && q[1] === n.y; })))
    { open++; add('e', `A wire ends without reaching anything${sheetName(k)}`, 'Its loose end is ringed: join it to a terminal, a rail or another wire.', [{ k, id: n.id, x: n.x, y: n.y }]); } });
  // shorts: 1 and 2 joined, two lines joined, or a way from 1 to 2 through nothing but switches and contacts
  let shorts = 0;
  if (A.n1 != null && A.n1 === A.n2) { shorts++; add('e', '1 and 2 are joined: a dead short', 'Control L1 and L2 are wired together.', []); }
  const supR = new Map(); for (const x of parts) if (x.p.t === 'sup') { const r = A.rootT(x.p, x.s, 0), o = supR.get(r); if (o && o.p.tag !== x.p.tag) { shorts++; add('e', `${o.p.tag} and ${x.p.tag} are joined: a short`, 'Two lines in are wired together.', [pk(o), pk(x)]); } else supR.set(r, x); }
  if (A.n1 != null && A.n2 != null && A.n1 !== A.n2) {
    const PASS = new Set(['sw', 'contact', 'olc', 'fuse']), adj = new Map(), add2 = (a, b, x) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, x]); };
    for (const x of parts) if (PASS.has(kindOf(x.p))) for (const [i, j] of passesOf(x.p.t)) { const a = A.rootT(x.p, x.s, i), b = A.rootT(x.p, x.s, j); add2(a, b, x); add2(b, a, x); }
    const prev = new Map([[A.n1, null]]), q = [A.n1];
    while (q.length) { const r = q.shift(); if (r === A.n2) break; for (const [m, x] of adj.get(r) || []) if (!prev.has(m)) { prev.set(m, [r, x]); q.push(m); } }
    if (prev.has(A.n2)) { shorts++; const path = []; for (let r = A.n2; prev.get(r); r = prev.get(r)[0]) path.push(prev.get(r)[1]);
      add('e', `No load between 1 and 2${path.length ? ' (rung ' + (A.rung.get(path[0].p.id) || '?') + ')' : ''}`, `${path.reverse().map(x => name(x.p)).join(' → ')}: closing ${path.length > 1 ? 'these' : 'it'} would short L1 to L2. Every rung needs a load (a coil, a light...).`, path.map(pk)); }
  }
  // two loads one after the other
  for (const [r, ts] of TERMS) if (r !== A.n1 && r !== A.n2 && ts.length >= 2 && ts.every(t => isLoadKind(kindOf(t.p)))) {
    const ps = [...new Set(ts.map(t => t.p))]; if (ps.length >= 2) add('w', `${ps.map(name).join(' and ')} are in series`, 'Loads in series share the voltage, so neither gets enough. Put each across 1 and 2 (in parallel).', ts.map(t => ({ k: t.k, id: t.p.id, x: t.p.x, y: t.p.y })));
  }
  // drawing: symbols on top of each other, a wire through a symbol, a wire over a junction or terminal it isn't joined to
  // (Dallas, 19 Nov 2026: each looks joined, or hides a part, on paper)
  let drawn = 0;
  const symBox = p => { const e = extOf(p), c = [[e.x0, e.y0], [e.x1, e.y1]].map(q => turn(q, p.rot || 0));
    return { x0: p.x + Math.min(c[0][0], c[1][0]) + 4, x1: p.x + Math.max(c[0][0], c[1][0]) - 4, y0: p.y + Math.min(c[0][1], c[1][1]) + 4, y1: p.y + Math.max(c[0][1], c[1][1]) - 4 }; };
  const segIn = ([a, b], o) => Math.max(a[0], b[0]) > o.x0 && Math.min(a[0], b[0]) < o.x1 && Math.max(a[1], b[1]) > o.y0 && Math.min(a[1], b[1]) < o.y1;
  const onSeg = ([a, b], q) => (a[0] === b[0] ? q[0] === a[0] && q[1] > Math.min(a[1], b[1]) && q[1] < Math.max(a[1], b[1])
    : a[1] === b[1] && q[1] === a[1] && q[0] > Math.min(a[0], b[0]) && q[0] < Math.max(a[0], b[0]));
  doc.sheets.forEach((s, k) => {
    const ps = s.parts.filter(p => p.t !== 'rail' && LIB[p.t]), bx = new Map(ps.map(p => [p.id, symBox(p)]));
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const a = bx.get(ps[i].id), b = bx.get(ps[j].id);
      if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) { drawn++; add('w', `${name(ps[i])} and ${name(ps[j])} are drawn on top of each other${sheetName(k)}`, 'Move one clear of the other, so each can be read.', [{ k, id: ps[i].id, x: ps[i].x, y: ps[i].y }, { k, id: ps[j].id, x: ps[j].x, y: ps[j].y }]); } }
    const pts = [...s.nodes.map(n => ({ q: [n.x, n.y], what: 'a junction', end: e => e.n === n.id })),
      ...ps.flatMap(p => [...Array(termsN(p)).keys()].map(i => ({ q: termPos(p, i), what: `a terminal of ${name(p)}`, end: e => e.p === p.id && e.i === i })))];
    for (const w of s.wires) { const P = wirePts(s, w), segs = P.slice(1).map((b, i) => [P[i], b]);
      for (const p of ps) if (w.a.p !== p.id && w.b.p !== p.id) { const sg = segs.find(g => segIn(g, bx.get(p.id)));
        if (sg) { drawn++; add('w', `A wire runs through ${name(p)}${sheetName(k)}`, 'It is not joined to it, but on paper it looks as if it were. Route the wire around the symbol.', [{ k, id: p.id, x: p.x, y: p.y }]); } }
      for (const o of pts) if (!o.end(w.a) && !o.end(w.b) && segs.some(g => onSeg(g, o.q))) {
        drawn++; add('w', `A wire runs over ${o.what} it is not joined to${sheetName(k)}`, 'On paper they look joined. Move the wire off it, or join them there.', [{ k, id: w.id, x: o.q[0], y: o.q[1] }]); }
    }
  });
  // wire numbers
  const byNum = new Map(); for (const [r, l] of label) if (WIRED.has(r)) { if (!byNum.has(l)) byNum.set(l, []); byNum.get(l).push(r); }
  let dupN = 0;
  for (const [l, rs] of byNum) {
    if (l === '?') { add('w', `${rs.length} power wire${rs.length > 1 ? 's' : ''} could not be numbered`, 'Not reached from a line in (L1, L2, L3) through the disconnect, fuses and starters.', rs.map(r => { const o = WIRED.get(r)[0], P = wirePts(o.s, o.w); return { k: o.k, id: o.w.id, x: P[0][0], y: P[0][1] }; })); continue; }
    if (rs.length > 1) { dupN++; add('e', `Wire number ${l} is used twice`, 'Two wires that are not joined have the same number. Change one (or clear the number you typed).', rs.map(r => { const o = WIRED.get(r)[0], P = wirePts(o.s, o.w); return { k: o.k, id: o.w.id, x: P[0][0], y: P[0][1] }; })); }
  }
  const okLine = (t, d) => out.push({ sev: 'ok', title: t, detail: d, at: [] });
  if (!open) okLine('Everything is wired', 'No loose terminals or wire ends.');
  if (!shorts && (A.n1 != null || parts.length)) okLine('No shorts', 'Every way from 1 to 2 goes through a load.');
  if (!dups) okLine('Every device has its own tag', 'Contacts share only their coil’s.');
  if (!dupN) okLine('No wire number is used twice', '');
  if (!drawn) okLine('Nothing drawn on top of anything else', 'No symbol on another, no wire through a symbol or over a junction it isn’t joined to.');
  const rank = { e: 0, w: 1, ok: 2 }; out.sort((a, b) => rank[a.sev] - rank[b.sev]);
  return out;
}
