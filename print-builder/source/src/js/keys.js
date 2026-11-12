/* ---------- keyboard shortcuts ----------
   Laid out for the left hand on the keys and the right on the mouse (Dallas, like WASD in a game). Every one is listed
   here; the ones with an id can be changed in the Keyboard Shortcuts box (F1 › Change Keys), kept in this browser.
   The key handler is in ui.js; it asks kbAction which of these a key press is for, and runs it. */
const KB = {
  canChange: false,   // (Dallas, 12 Nov 2026: each key fixed for now; true brings back Change Keys and Default Settings)
  store: 'oo-print-builder:keys', tipAttr: 'title',
  groups: [{ id: 'tools', name: 'Tools', c: '#ffc000' }, { id: 'parts', name: 'Parts', c: '#2f8cff' }, { id: 'view', name: 'View', c: '#46c46a' }, { id: 'file', name: 'Edit and File', c: '#b58cff' }],
  items: [
    { g: 'tools', id: 'select', keys: ['e'], label: 'Select', short: 'Select', run: () => setTool('select') },
    { g: 'tools', id: 'wire', keys: ['w'], label: 'Wire', short: 'Wire', run: () => setTool('wire') },
    { g: 'tools', id: 'rung', keys: ['v', 'l'], label: 'Add a rung', short: 'Rung', run: () => setTool('rung') },
    { g: 'tools', id: 'note', keys: ['t', 'n'], label: 'Add a note', short: 'Note', run: () => setTool('note') },
    { g: 'tools', show: 'Esc', label: 'Stop a wire being drawn, back to Select, or let go of what is picked' },
    { g: 'parts', id: 'rotate', keys: ['r'], label: 'Rotate', short: 'Rotate', run: () => rotateKey() },
    { g: 'parts', id: 'flip', keys: ['f'], label: 'Flip', short: 'Flip', run: () => flipKey() },
    { g: 'parts', id: 'del', keys: ['x'], also: 'Delete', label: 'Delete', short: 'Delete', run: () => removeSelection() },
    { g: 'parts', id: 'again', keys: ['q'], label: 'Place another of the last part', short: 'Place Again', run: () => placeAgain() },
    { g: 'parts', id: 'organize', keys: ['a'], label: 'Organize the picked rung', short: 'Organize', run: () => { if ($('org-btn').disabled) say(`Pick a rung first: click its wire, or any part on it. Then ${kn('organize')} organizes it.`); else $('org-btn').click(); } },
    { g: 'parts', id: 'lineup', keys: ['shift+a'], label: 'Line Up', short: 'Line Up', run: () => lineUp() },
    { g: 'parts', id: 'rename', keys: ['f2'], label: 'Rename: jump to its Number', short: 'Rename', run: () => renameKey() },
    { g: 'parts', show: 'Arrows', label: 'Nudge a grid step' },
    { g: 'parts', show: 'Shift+Arrows', label: 'Nudge five steps' },
    { g: 'view', show: 'Space + drag', label: 'Pan' },
    { g: 'view', show: 'Ctrl + wheel', label: 'Zoom at the pointer' },
    { g: 'view', id: 'fit', keys: ['z'], also: 'Ctrl+0', label: 'Fit the page', short: 'Fit', run: () => fitZoom() },
    { g: 'view', show: '1–9', label: 'Go to sheet 1–9' },
    { g: 'view', id: 'check', keys: ['shift+c'], label: 'Check Print', short: 'Check Print', run: () => $('check-btn').click() },
    { g: 'view', show: 'F1', label: 'This list' },
    { g: 'file', show: 'Ctrl+Z', label: 'Undo' }, { g: 'file', show: 'Ctrl+Shift+Z or Ctrl+Y', label: 'Redo' },
    { g: 'file', show: 'Ctrl+C', label: 'Copy' }, { g: 'file', show: 'Ctrl+X', label: 'Cut' }, { g: 'file', show: 'Ctrl+V', label: 'Paste at the pointer' },
    { g: 'file', show: 'Ctrl+D', label: 'Duplicate' }, { g: 'file', show: 'Ctrl+A', label: 'Select all' },
    { g: 'file', show: 'Ctrl+S', label: 'Save' }, { g: 'file', show: 'Ctrl+Shift+S', label: 'Save as a new file' }, { g: 'file', show: 'Ctrl+P', label: 'Print Preview' },
  ],
  // keys no action can be given (and what they are kept for)
  reserved: { f1: 'this list', ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => [String(n), 'going to sheet ' + n])) },
  // the map: the left half of the keyboard, [key, width]
  layout: [
    [['esc', 1], ['gap'], ['f1', 1], ['f2', 1], ['f3', 1], ['f4', 1]],
    [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1]],
    [['tab', 1.5], ['q', 1], ['w', 1], ['e', 1], ['r', 1], ['t', 1]],
    [['caps', 1.8], ['a', 1], ['s', 1], ['d', 1], ['f', 1], ['g', 1]],
    [['shift', 2.3], ['z', 1], ['x', 1], ['c', 1], ['v', 1], ['b', 1]],
    [['ctrl', 1.5], ['alt', 1], ['space', 3.2], ['gap'], ['arrows', 2.2]],
  ],
  // what the map shows on a key besides the actions: fixed jobs and the Ctrl shortcuts
  mapFixed: {
    esc: { label: 'Esc', main: 'Back / Cancel', c: '#ffc000' }, f1: { main: 'Shortcuts', c: '#46c46a' },
    ...Object.fromEntries([1, 2, 3, 4, 5].map(n => [String(n), { main: 'Sheet ' + n, c: '#46c46a' }])),
    tab: { label: 'Tab' }, caps: { label: 'Caps' }, alt: { label: 'Alt' },
    shift: { label: 'Shift', notes: ['With arrows: nudge ×5'], c: '#2f8cff' }, ctrl: { label: 'Ctrl', notes: ['With wheel: zoom'], c: '#46c46a' },
    space: { label: 'Space', main: 'Hold + drag: Pan', c: '#46c46a' }, arrows: { label: '← ↑ ↓ →', main: 'Nudge', notes: ['Shift: five steps'], c: '#2f8cff' },
    a: { notes: ['Ctrl: Select All'], c: '#b58cff' }, s: { notes: ['Ctrl: Save', 'Ctrl+Shift: Save As'], c: '#b58cff' }, d: { notes: ['Ctrl: Duplicate'], c: '#b58cff' },
    z: { notes: ['Ctrl: Undo', 'Ctrl+Shift: Redo'], c: '#b58cff' }, x: { notes: ['Ctrl: Cut'], c: '#b58cff' }, c: { notes: ['Ctrl: Copy'], c: '#b58cff' }, v: { notes: ['Ctrl: Paste'], c: '#b58cff' },
  },
  onChange: () => say(''),   // (the hint under the sheet names the keys)
};

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
  if (!KB.canChange) return;   // (keys fixed for now: a change left in this browser is set aside, not used)
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
  document.querySelector('#keys-dlg .kmode').hidden = document.getElementById('kb-reset').hidden = !KB.canChange;
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
