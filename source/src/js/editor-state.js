let editing = true, tool = 'select', sel = null, view = {}, preview = null;
// the selection: any number of parts and wires
const selOne = (k, id) => ({ parts: new Set(k === 'p' ? [id] : []), wires: new Set(k === 'w' ? [id] : []) });
const selHasP = id => !!sel && sel.parts.has(id), selHasW = id => !!sel && sel.wires.has(id);
const selCount = () => sel ? sel.parts.size + sel.wires.size + (sel.terms ? sel.terms.size : 0) : 0;
/* Terminals on the L1 and L2 bars (where a wire ends on a bar) can be selected too, by a selection box that reaches
   the bar or by Shift-clicking them. Moved with a group, they slide along their bar (they never leave it). A terminal
   is named by its bar and height: 'L1:200'. */
const termKey = (x, y) => (x === 0 ? 'L1:' : 'L2:') + y;
const selHasT = (x, y) => !!sel && !!sel.terms && (x === 0 || x === W) && sel.terms.has(termKey(x, y));
const barTerms = () => { const m = new Map(); for (const w of wires) for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) if (x === 0 || x === W) m.set(termKey(x, y), [x, y]); return m; };
const history = [];
function snapshot() { history.push(stateOf()); if (history.length > 100) history.shift(); }
function undo() {
  const h = history.pop(); if (!h) return;
  restore(h); if (cam.fit) fit(true);
  for (const x of [...parts, ...wires]) nextId = Math.max(nextId, x.id + 1);
  sel = null; say(''); draw();
}
function say(t) { document.getElementById('msg').textContent = t || ''; }
