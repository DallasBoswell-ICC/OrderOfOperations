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
  // (a pushbutton's or selector's extra contact blocks share its number)
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
  const rank = { e: 0, w: 1, ok: 2 }; out.sort((a, b) => rank[a.sev] - rank[b.sev]);
  return out;
}
