let editing = true, tool = 'select', sel = null, view = {}, preview = null;
// the selection: any number of parts and wires
const selOne = (k, id) => ({ parts: new Set(k === 'p' ? [id] : []), wires: new Set(k === 'w' ? [id] : []) });
const selHasP = id => !!sel && sel.parts.has(id), selHasW = id => !!sel && sel.wires.has(id);
const selCount = () => sel ? sel.parts.size + sel.wires.size : 0;
const history = [];
function snapshot() { history.push(stateOf()); if (history.length > 100) history.shift(); }
function undo() {
  const h = history.pop(); if (!h) return;
  restore(h); if (cam.fit) fit(true);
  for (const x of [...parts, ...wires]) nextId = Math.max(nextId, x.id + 1);
  sel = null; say(''); draw();
}
function say(t) { document.getElementById('msg').textContent = t || ''; }
