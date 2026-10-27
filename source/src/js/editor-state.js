let editing = true, tool = 'select', sel = null, view = {}, preview = null;
// the ribbon's open tab while building: 'home', or 'part' (the selected part's settings)
let ribbonTab = 'home';
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
// undo and redo: each change remembers how things were before it (a new change forgets what could be redone)
const history = [], future = [];
function remember(s) { history.push(s); if (history.length > 100) history.shift(); future.length = 0; }
function snapshot() { remember(stateOf()); }
function undo() { const h = history.pop(); if (!h) return; future.push(stateOf()); backTo(h); }
function redo() { const h = future.pop(); if (!h) return; history.push(stateOf()); backTo(h); }
function backTo(h) {
  restore(h); if (cam.fit) fit(true);
  for (const x of [...parts, ...wires]) nextId = Math.max(nextId, x.id + 1);
  sel = null; say(''); draw();
}
function say(t) { document.getElementById('msg').textContent = t || ''; }
