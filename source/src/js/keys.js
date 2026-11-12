/* ---------------- keyboard shortcuts ----------------
   Laid out as in Print Builder, for the left hand on the keys and the right on the mouse (like WASD in a game). Every
   one is listed here; the ones with an id can be changed in the Keyboard Shortcuts box (F1 › Change Keys), kept in
   this browser (apart from Print Builder's). Delete, Esc and Ctrl+Z/Y are in toolbar.js; Ctrl+C/X/V in clipboard.js;
   Ctrl+S in storage.js; Ctrl+P in print.js; Space (pan) in camera.js; the key handler is at the end of this file. */
const KB = {
  store: 'oo-circuit-builder:keys', tipAttr: 'data-tip',
  groups: [{ id: 'tools', name: 'Tools', c: '#ffc000' }, { id: 'parts', name: 'Parts', c: '#2f8cff' }, { id: 'view', name: 'View', c: '#46c46a' }, { id: 'run', name: 'Run', c: '#ffc000' }, { id: 'file', name: 'Edit and File', c: '#b58cff' }],
  items: [
    { g: 'tools', id: 'select', keys: ['e'], label: 'Select', short: 'Select', run: () => setTool('select') },
    { g: 'tools', id: 'wire', keys: ['w'], label: 'Wire', short: 'Wire', run: () => setTool('wire') },
    { g: 'tools', id: 'mode', keys: ['g'], label: 'Switch Build and Run', short: 'Build / Run', inRun: true, run: () => { if (!LOCKED) setMode(editing); } },
    { g: 'tools', show: 'Esc', label: 'Back to Select, and let go of what is picked' },
    { g: 'parts', id: 'rotate', keys: ['r'], label: 'Turn a box or fuse a quarter turn', short: 'Rotate', run: () => { const P = selGroup(); if (P.length && P.every(turns)) each(p => { p.rot = ((p.rot || 0) + 1) % 4; if (!p.rot) delete p.rot; }); } },
    { g: 'parts', id: 'del', keys: ['x'], also: 'Delete', label: 'Delete', short: 'Delete', run: () => del() },
    { g: 'parts', id: 'again', keys: ['q'], label: 'Place another of the last part', short: 'Place Again', run: () => { if (lastKind) { closeMenus(); setTool('select'); placeFree(lastKind); } else say(`Put a part on the panel first. Then ${kn('again')} places another one like it.`); } },
    { g: 'parts', id: 'rename', keys: ['f2'], label: 'Jump to its letter', short: 'Letter', run: () => renameKey() },
    { g: 'parts', show: 'Arrows', label: 'Nudge a grid step' },
    { g: 'parts', show: 'Shift+Arrows', label: 'Nudge five steps' },
    { g: 'parts', show: 'Shift+click', label: 'Add to the selection, or take out' },
    { g: 'view', show: 'Space + drag', label: 'Pan' },
    { g: 'view', show: 'Ctrl + wheel', label: 'Zoom at the pointer' },
    { g: 'view', id: 'fit', keys: ['z'], label: 'Fit the whole circuit', short: 'Fit', inRun: true, run: () => { fitView(); if (editing) fit(true); draw(); } },
    { g: 'view', show: 'F1', label: 'This list' },
    { g: 'run', show: 'Tab', label: 'Pick a button or switch on the panel' },
    { g: 'run', show: 'Space or Enter', label: 'Press the picked button' },
    { g: 'run', show: '← →', label: 'Turn the picked selector switch' },
    { g: 'file', show: 'Ctrl+Z', label: 'Undo' }, { g: 'file', show: 'Ctrl+Shift+Z or Ctrl+Y', label: 'Redo' },
    { g: 'file', show: 'Ctrl+C', label: 'Copy' }, { g: 'file', show: 'Ctrl+X', label: 'Cut' }, { g: 'file', show: 'Ctrl+V', label: 'Paste below the circuit' },
    { g: 'file', show: 'Ctrl+S', label: 'Save' }, { g: 'file', show: 'Ctrl+P', label: 'Print Diagram' },
  ],
  reserved: { f1: 'this list' },
  layout: [
    [['esc', 1], ['gap'], ['f1', 1], ['f2', 1], ['f3', 1], ['f4', 1]],
    [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1]],
    [['tab', 1.5], ['q', 1], ['w', 1], ['e', 1], ['r', 1], ['t', 1]],
    [['caps', 1.8], ['a', 1], ['s', 1], ['d', 1], ['f', 1], ['g', 1]],
    [['shift', 2.3], ['z', 1], ['x', 1], ['c', 1], ['v', 1], ['b', 1]],
    [['ctrl', 1.5], ['alt', 1], ['space', 3.2], ['gap'], ['arrows', 2.2]],
  ],
  mapFixed: {
    esc: { label: 'Esc', main: 'Back / Cancel', c: '#ffc000' }, f1: { main: 'Shortcuts', c: '#46c46a' },
    tab: { label: 'Tab' }, caps: { label: 'Caps' }, alt: { label: 'Alt' },
    shift: { label: 'Shift', notes: ['With arrows: nudge ×5'], c: '#2f8cff' }, ctrl: { label: 'Ctrl', notes: ['With wheel: zoom'], c: '#46c46a' },
    space: { label: 'Space', main: 'Hold + drag: Pan', c: '#46c46a' }, arrows: { label: '← ↑ ↓ →', main: 'Nudge', notes: ['Shift: five steps'], c: '#2f8cff' },
    s: { notes: ['Ctrl: Save'], c: '#b58cff' }, z: { notes: ['Ctrl: Undo', 'Ctrl+Shift: Redo'], c: '#b58cff' }, x: { notes: ['Ctrl: Cut'], c: '#b58cff' }, c: { notes: ['Ctrl: Copy'], c: '#b58cff' }, v: { notes: ['Ctrl: Paste'], c: '#b58cff' },
  },
};
let lastKind = null;   // (the last part put on the panel, for Place Again: set in placePart)

/* Nudging: a run of arrow presses is one move (one Undo), worked out each time from where things were at the first
   press, so the wires bend once, as in a drag. A press that would put a part on another part, or a wire through one,
   stays where the last good press left it. */
let NUDGE = null;
function nudge(sx, sy) {
  if (!NUDGE || NUDGE.after !== stateOf()) {
    const pIds = new Set(sel.parts), tIds = new Set(sel.terms || []);
    NUDGE = { start: stateOf(), pIds, wIds: new Set(sel.wires), tIds, P0: parts.filter(q => pIds.has(q.id)).map(q => ({ id: q.id, x: q.x, y: q.y, t: q.t })),
      T0: [...tIds].map(k => +k.split(':')[1]), dx: 0, dy: 0, moved: false };
  }
  const N = NUDGE, apply = (dx, dy) => {
    restore(N.start);
    for (let pass = 0; pass < 2; pass++) for (const q of N.P0) { const [cx, cy] = clampPart(q.x + dx, q.y + dy, q.t); dx = cx - q.x; dy = cy - q.y; }
    for (const y of N.T0) if (y + dy < 40) dy = 40 - y;
    if (N.P0.some(q => parts.some(o => !N.pIds.has(o.id) && Math.abs(o.x - (q.x + dx)) < halfW(q.t) + halfW(o.t) && Math.abs(o.y - (q.y + dy)) < halfH(q.t) + halfH(o.t)))) return 'There is already a part there.';
    const m = movedGroup(N.pIds, N.wIds, dx, dy, N.tIds); wires = m.wires;
    for (const q of parts) if (N.pIds.has(q.id)) { const o = N.P0.find(z => z.id === q.id); q.x = o.x + dx; q.y = o.y + dy; }
    normalize();
    if (parts.some(q => N.pIds.has(q.id) && wireInTheWay(q))) return 'There is a wire in the way.';
    sel = { parts: N.pIds, wires: new Set(wires.filter(w => N.wIds.has(w.id)).map(w => w.id)), terms: new Set([...N.tIds].map(k => k.split(':')[0] + ':' + (+k.split(':')[1] + dy))) };
    return '';
  };
  const bad = apply(N.dx + sx, N.dy + sy);
  if (bad) { if (N.dx || N.dy) apply(N.dx, N.dy); else restore(N.start); say(bad); }   // (nothing moved yet: exactly as it was)
  else { N.dx += sx; N.dy += sy; say(''); }
  if (!N.moved && stateOf() !== N.start) { remember(N.start); N.moved = true; }
  for (const x of [...parts, ...wires]) nextId = Math.max(nextId, (x.id || 0) + 1);
  N.after = stateOf(); draw();
}

// F2: the picked part's tab on the ribbon, with its letter (or its first setting) ready to change
function renameKey() {
  if (!sel || sel.parts.size !== 1 || sel.wires.size || (sel.terms && sel.terms.size)) return say(`Pick one part first. Then ${kn('rename')} jumps to its letter.`);
  ribbonTab = 'part'; showRibbon();
  const box = [...document.querySelectorAll('#editpanel select, #editpanel input[type=text]')].find(b => b.offsetParent && !b.disabled);
  if (box) box.focus(); else say('This part has no letter to change.');
}

// the key handler: F1, the arrows, then whichever changeable shortcut the key is for
document.addEventListener('keydown', e => {
  const a = document.activeElement, typing = a && (/SELECT|INPUT|TEXTAREA/.test(a.tagName) || a.isContentEditable);
  if (e.key === 'F1') { e.preventDefault(); if (!document.querySelector('dialog[open]')) openKeys(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  const act = kbAction(e);
  if (!editing) { if (act && KB_ACT[act].inRun) { e.preventDefault(); KB_ACT[act].run(e); } return; }   // (in Run, Tab to a button and Space or Enter presses it)
  const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (mv) {
    if (!selCount()) return;
    e.preventDefault();
    if (!sel.parts.size) return say('The arrows move parts (and any wires picked with them). To move a wire on its own, drag its middle.');
    const n = e.shiftKey ? 5 * G : G; nudge(mv[0] * n, mv[1] * n); return;
  }
  if (act) { e.preventDefault(); KB_ACT[act].run(e); }
});

/* ---------- the shortcut engine (the same in Print Builder and Circuit Builder; each program has its own KB above) ----------
   Every shortcut is in KB.items. One with an id can be changed in the Keyboard Shortcuts box (Change Keys): the change
   is kept in this browser on this computer (KB.store; each program keeps its own), and Default Settings puts the
   standard keys back. The rest (Ctrl ones, Esc, Delete, Space, the arrows, F1...) are fixed. The key map, the lists,
   the buttons' tips ({id} in a [data-kb] element's tip) and the hints all read the keys from here, so a change shows
   everywhere. A key given to one action that another already has swaps them, so every action always has a key.
   Keys are written 'e', 'shift+a', '7', 'f2'. Letters and numbers go by where the key is on the keyboard (its code),
   as the map does. */
const KB_DEF = {}, KB_ACT = {};
for (const a of KB.items) if (a.id) { KB_DEF[a.id] = [...a.keys]; KB_ACT[a.id] = a; }
let KB_NOW = {}, KB_MODE = 'view', KB_WAIT = null;
const kbClone = o => JSON.parse(JSON.stringify(o));
// a key an action can be given: a letter (Shift with it too), a number, or F2 to F12, if this program does not keep it
const kbOk = k => /^((shift\+)?[a-z]|[0-9]|f([2-9]|1[0-2]))$/.test(k) && !(k in KB.reserved);
const kbName = k => k.split('+').map(x => x.length === 1 ? x.toUpperCase() : x[0].toUpperCase() + x.slice(1)).join('+');
const kn = id => KB_NOW[id].map(kbName).join(' or ');
function kbFromEvent(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (/^F([1-9]|1[0-2])$/.test(e.key)) return e.shiftKey ? null : e.key.toLowerCase();   // (F1 too, to be told it is kept)
  if (/^Key[A-Z]$/.test(e.code)) return (e.shiftKey ? 'shift+' : '') + e.code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(e.code)) return e.shiftKey ? null : e.code.slice(5);
  // (no key code, as from some on-screen keyboards and remote desktops: go by the character)
  if (!e.code && /^[a-z]$/i.test(e.key)) return (e.shiftKey ? 'shift+' : '') + e.key.toLowerCase();
  if (!e.code && /^[0-9]$/.test(e.key) && !e.shiftKey) return e.key;
  return null;
}
// the action a key press is for, if any (Ctrl, Alt and keys no action has: none)
const kbAction = e => { const k = kbFromEvent(e); return k ? Object.keys(KB_NOW).find(id => KB_NOW[id].includes(k)) || null : null; };
function kbLoad() {
  KB_NOW = kbClone(KB_DEF);
  let s = null; try { s = JSON.parse(localStorage.getItem(KB.store) || 'null'); } catch (_) {}
  if (!s) return;
  const got = kbClone(KB_DEF);
  for (const id in s) if (got[id] && Array.isArray(s[id]) && s[id].length === got[id].length && s[id].every(kbOk)) got[id] = s[id];
  const all = Object.values(got).flat();
  if (new Set(all).size === all.length) KB_NOW = got;   // (two actions on one key: the standard keys instead)
}
function kbSave() {
  const ch = {}; for (const id in KB_NOW) if (KB_NOW[id].join() !== KB_DEF[id].join()) ch[id] = KB_NOW[id];
  try { if (Object.keys(ch).length) localStorage.setItem(KB.store, JSON.stringify(ch)); else localStorage.removeItem(KB.store); } catch (_) {}
}
const kbChanged = () => Object.keys(KB_NOW).some(id => KB_NOW[id].join() !== KB_DEF[id].join());
const kbEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// the box: the map of the keyboard's left half, then every shortcut by group
function kbDraw() {
  const grp = Object.fromEntries(KB.groups.map(g => [g.id, g])), on = (k, ks) => Object.keys(ks).find(id => ks[id].includes(k));
  const map = KB.layout.map(row => '<div class="kr">' + row.map(([k, flex]) => {
    if (k === 'gap') return '<span class="kgap"></span>';
    const f = KB.mapFixed[k] || {}, a = on(k, KB_NOW), s = on('shift+' + k, KB_NOW);
    const main = a ? KB_ACT[a].short : f.main || '', notes = [...(s ? ['Shift: ' + KB_ACT[s].short] : []), ...(f.notes || [])];
    const c = a ? grp[KB_ACT[a].g].c : s ? grp[KB_ACT[s].g].c : f.c;
    const chg = a !== on(k, KB_DEF) || s !== on('shift+' + k, KB_DEF);
    return `<span class="kk${c ? ' on' : ''}${chg ? ' chg' : ''}" style="flex:${flex}${c ? ';--kc:' + c : ''}"><b>${kbEsc(f.label || kbName(k))}</b><i>${kbEsc(main)}</i>${notes.map(n => `<em>${kbEsc(n)}</em>`).join('')}</span>`;
  }).join('') + '</div>').join('');
  document.getElementById('kb-map').innerHTML = map;
  const change = KB_MODE === 'change';
  document.getElementById('kb-lists').innerHTML = KB.groups.map(g => `<div class="kgrp"><h4 style="--kc:${g.c}">${g.name}</h4>` + KB.items.filter(a => a.g === g.id).map(a => {
    let keys;
    if (!a.id) keys = `<kbd>${kbEsc(a.show)}</kbd>`;
    else {
      const chips = KB_NOW[a.id].map((k, i) => { const wait = KB_WAIT && KB_WAIT.id === a.id && KB_WAIT.slot === i, mine = k !== KB_DEF[a.id][i];
        return change ? `<button type="button" class="kchip${mine ? ' chg' : ''}${wait ? ' wait' : ''}" data-kid="${a.id}" data-slot="${i}" aria-label="Change the key for ${kbEsc(a.label)}">${wait ? 'Press a key…' : kbName(k)}</button>` : `<kbd${mine ? ' class="chg"' : ''}>${kbName(k)}</kbd>`; });
      keys = `<span class="kchips">${chips.join(change ? '' : '<span class="kor">or</span>')}${a.also ? `<span class="kor">or</span><kbd>${a.also}</kbd>` : ''}</span>`;
    }
    const was = a.id && KB_NOW[a.id].join() !== KB_DEF[a.id].join() ? `<span class="kwas">was ${KB_DEF[a.id].map(kbName).join(' or ')}</span>` : '';
    return `<div class="kl">${keys}<span>${kbEsc(a.label)}${was}</span></div>`;
  }).join('') + '</div>').join('');
  document.getElementById('kb-view').setAttribute('aria-pressed', String(!change));
  document.getElementById('kb-change').setAttribute('aria-pressed', String(change));
  document.getElementById('kb-note').textContent = change ? 'Click a key below, then press the key you want (Esc to stop). Kept in this browser on this computer.' : kbChanged() ? 'Keys you have changed are marked in gold.' : '';
  document.getElementById('kb-reset').disabled = !kbChanged();
}
const kbMsg = t => { const m = document.getElementById('kb-msg'); m.textContent = t || ''; m.hidden = !t; };
// everything that shows a key: the box, the buttons' tips, and the program's own hints
function kbRefresh() {
  for (const el of document.querySelectorAll('[data-kb]')) {
    if (el.dataset.kbT === undefined) el.dataset.kbT = el.getAttribute(KB.tipAttr) || '';
    el.setAttribute(KB.tipAttr, el.dataset.kbT.replace(/\{(\w+)\}/g, (m, id) => KB_NOW[id] ? kn(id) : m));
  }
  kbDraw(); if (KB.onChange) KB.onChange();
}
function kbAssign(id, slot, k) {
  const old = KB_NOW[id][slot], lab = j => KB_ACT[j].label;
  let msg;
  if (k === old) msg = `${lab(id)} stays on ${kbName(k)}.`;
  else {
    const o = Object.keys(KB_NOW).find(j => KB_NOW[j].includes(k));
    if (o === id) { KB_NOW[id][KB_NOW[id].indexOf(k)] = old; msg = `${lab(id)}: its two keys swapped.`; }
    else if (o) { KB_NOW[o][KB_NOW[o].indexOf(k)] = old; msg = `${lab(id)} is now ${kbName(k)}. ${kbName(k)} was ${lab(o)}, so ${lab(o)} moved to ${kbName(old)}.`; }
    else msg = `${lab(id)} is now ${kbName(k)} (it was ${kbName(old)}).`;
    KB_NOW[id][slot] = k;
  }
  KB_WAIT = null; kbSave(); kbRefresh(); kbMsg(msg);
}
// waiting for a key: it is caught here, before the program's own shortcuts see it
window.addEventListener('keydown', e => {
  if (!KB_WAIT) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
  const lab = KB_ACT[KB_WAIT.id].label;
  if (e.key === 'Escape') { KB_WAIT = null; kbMsg(''); kbDraw(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return kbMsg('Ctrl and Alt shortcuts stay as they are. Press a letter (Shift with it works too), a number, or F2 to F12.');
  const k = kbFromEvent(e);
  if (k && KB.reserved[k]) return kbMsg(`${kbName(k)} is kept for ${KB.reserved[k]}. Press another key for ${lab}.`);
  if (!k) return kbMsg(`That key is kept as it is. Press a letter (Shift with it works too), a number, or F2 to F12 for ${lab}.`);
  kbAssign(KB_WAIT.id, KB_WAIT.slot, k);
}, true);
document.getElementById('kb-lists').addEventListener('click', e => {
  const b = e.target.closest('.kchip'); if (!b) return;
  KB_WAIT = { id: b.dataset.kid, slot: +b.dataset.slot }; kbMsg(''); kbDraw();
  const w = document.querySelector('#kb-lists .kchip.wait'); if (w) w.focus();
});
document.getElementById('kb-view').addEventListener('click', () => { KB_MODE = 'view'; KB_WAIT = null; kbMsg(''); kbDraw(); });
document.getElementById('kb-change').addEventListener('click', () => { KB_MODE = 'change'; kbMsg(''); kbDraw(); });
document.getElementById('kb-reset').addEventListener('click', () => { KB_NOW = kbClone(KB_DEF); KB_WAIT = null; kbSave(); kbRefresh(); kbMsg('Every key is back to its default.'); });
const keysDlg = document.getElementById('keys-dlg');
keysDlg.addEventListener('cancel', e => { if (KB_WAIT) e.preventDefault(); });   // (Esc while waiting stops waiting, not the box)
keysDlg.addEventListener('close', () => { KB_MODE = 'view'; KB_WAIT = null; kbMsg(''); kbDraw(); });
function openKeys() { if (!keysDlg.open) { kbDraw(); keysDlg.showModal(); } }
document.getElementById('keys-btn').addEventListener('click', openKeys);
document.getElementById('keys-close').addEventListener('click', () => keysDlg.close());
kbLoad();
kbRefresh();
