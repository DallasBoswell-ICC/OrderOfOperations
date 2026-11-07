/* =====================================================================
   Copy, cut and paste (Ctrl+C, Ctrl+X, Ctrl+V; Ctrl+D copies and pastes at once). What is copied: the picked
   symbols, joints and notes, and every wire with both ends among them. A paste comes in beside the pointer (or a
   little down and right) with numbers of its own: a copied coil gets the next free letter, and the contacts copied
   with it go with it; a contact copied without its coil keeps its coil.
   ===================================================================== */
const CLIPKEY = 'oo-print-builder:clip';
let CLIP = null;
function copySel() {
  const ids = new Set([...sel].filter(id => { const p = partOf(S, id); return !(p && p.t === 'rail'); }));
  if (!ids.size) { say('Pick the symbols to copy first (drag across them to pick several).'); return false; }
  const inside = e => (e.p && ids.has(e.p)) || (e.n && ids.has(e.n));
  const c = { parts: clone(S.parts.filter(p => ids.has(p.id))), nodes: clone(S.nodes.filter(n => ids.has(n.id))), texts: clone(S.texts.filter(t => ids.has(t.id))),
    wires: clone(S.wires.filter(w => inside(w.a) && inside(w.b))) };
  // (the joints those wires run to, though not picked themselves)
  for (const w of c.wires) for (const e of [w.a, w.b]) if (e.n && !c.nodes.some(n => n.id === e.n)) { const n = nodeOf(S, e.n); if (n) c.nodes.push(clone(n)); }
  const xs = [...c.parts.map(p => p.x), ...c.nodes.map(n => n.x), ...c.texts.map(t => t.x)], ys = [...c.parts.map(p => p.y), ...c.nodes.map(n => n.y), ...c.texts.map(t => t.y)];
  c.at = [Math.min(...xs), Math.min(...ys)];
  CLIP = c; try { localStorage.setItem(CLIPKEY, JSON.stringify(c)); } catch (_) {}
  say(`Copied ${c.parts.length} symbol${c.parts.length === 1 ? '' : 's'}${c.wires.length ? ` and ${c.wires.length} wire${c.wires.length === 1 ? '' : 's'}` : ''}. Ctrl+V pastes.`);
  updateButtons(); return true;
}
function cutSel() { if (copySel()) removeSelection(); }
function hasClip() { if (CLIP) return true; try { CLIP = JSON.parse(localStorage.getItem(CLIPKEY) || 'null'); } catch (_) {} return !!CLIP; }
function pasteClip(where = null) {
  if (!hasClip()) return;
  snapshot();
  const c = clone(CLIP), map = new Map(), id = old => { if (!map.has(old)) map.set(old, uid(old[0])); return map.get(old); };
  // where it goes: at the pointer if it is on the sheet, else down and to the right of where it was copied from
  const to = where ? [snap(where[0]), snap(where[1])] : [c.at[0] + 80, c.at[1] + 80], dx = to[0] - c.at[0], dy = to[1] - c.at[1];
  // its numbers: coils first (their contacts follow them), then the rest
  const kindOf = p => LIB[p.t].kind, tagMap = new Map();
  const add = p => { S.parts.push(p); };
  for (const p of c.parts.filter(p => kindOf(p) === 'coil')) { const nt = nextTag(p.pre || 'CR'); if (p.tag) tagMap.set(p.tag, nt); p.tag = nt; p.id = id(p.id); p.x += dx; p.y += dy; add(p); }
  for (const p of c.parts.filter(p => kindOf(p) === 'ol')) { const nt = nextTag(LIB[p.t].pre); if (p.tag) tagMap.set('OL:' + p.tag, nt); p.tag = nt; p.id = id(p.id); p.x += dx; p.y += dy; add(p); }
  for (const p of c.parts.filter(p => kindOf(p) !== 'coil' && kindOf(p) !== 'ol')) {
    const k = kindOf(p);
    if (k === 'contact' || k === 'starter') p.tag = tagMap.get(p.tag) || p.tag;
    else if (k === 'olc') p.tag = tagMap.get('OL:' + p.tag) || p.tag;
    else if (k !== 'supply') p.tag = nextTag(LIB[p.t].pre, k === 'motor');
    if (p.t === 'fdsc3') { p.fu = ''; p.tag = nextTag(LIB[p.t].pre); p.fu = nextTag('FU'); }
    p.id = id(p.id); p.x += dx; p.y += dy; add(p);
  }
  for (const n of c.nodes) { n.id = id(n.id); n.x += dx; n.y += dy; S.nodes.push(n); }
  for (const t of c.texts) { t.id = id(t.id); t.x += dx; t.y += dy; S.texts.push(t); }
  for (const w of c.wires) { w.id = uid('w'); for (const e of [w.a, w.b]) { if (e.p) e.p = map.get(e.p); if (e.n) e.n = map.get(e.n); }
    w.pts = w.pts.map(([x, y]) => [x + dx, y + dy]); if (w.lab) w.lab = [w.lab[0] + dx, w.lab[1] + dy]; delete w.num; S.wires.push(w); }
  tidy(S);
  sel = new Set([...c.parts, ...c.nodes, ...c.texts].map(x => x.id).filter(x => partOf(S, x) || nodeOf(S, x) || S.texts.some(t => t.id === x))); selW = null;
  setTool('select'); refresh();
  say('Pasted. Drag it into place (it stays picked), or use the arrow keys.');
}
