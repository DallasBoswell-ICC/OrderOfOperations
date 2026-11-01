/* ---------------- the selected part's settings ---------------- */
function swatches(box, current, onPick) {
  box.innerHTML = '';
  for (const [name, hex] of PALETTE) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = hex; b.title = name;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name); b.setAttribute('aria-checked', String(hex.toUpperCase() === (current || '').toUpperCase()));
    b.addEventListener('click', () => onPick(hex)); box.append(b);
  }
}
const selPart = () => sel && sel.parts.size === 1 && !sel.wires.size ? parts.find(p => sel.parts.has(p.id)) : null;
/* Several parts of the same kind selected (and nothing else): their tab shows the first one's settings, and a change
   made there is made to them all. (Settings each must have its own, such as a letter or a solenoid's number, are
   left out.) selGroup: the parts whose settings the tab shows (one, or several alike); none otherwise. */
const selGroup = () => {
  if (!sel || !sel.parts.size || sel.wires.size || (sel.terms && sel.terms.size)) return [];
  const ps = parts.filter(p => sel.parts.has(p.id));
  return ps.every(q => q.t === ps[0].t) ? ps : [];
};
const each = f => { const g = selGroup(); if (!g.length) return false; snapshot(); g.forEach(f); normalize(); draw(); return true; };
const KIND_NAME = { xfm: 'transformers', btn: 'pushbuttons', coil: 'coils', con: 'contacts', lamp: 'pilot lights', sel: 'selector switches', sol: 'solenoids', jmp: 'continuations', l1: 'L1 supplies', l2: 'L2 returns', ph: 'phases' };
const blocksOf = L => parts.filter(p => p.t === 'btn' && p.L === L);
function renderProps() {
  const G = selGroup(), p = G[0] || null, multi = G.length > 1;
  const groupOf = id => document.getElementById(id).closest('.tgroup');
  for (const id of ['p-letter', 'o-letter', 's-letter', 'v-num', 'x-num', 'p-label', 'o-label', 's-names']) { const g = groupOf(id); if (g) g.hidden = multi; }
  const nP = sel ? sel.parts.size : 0, nW = sel ? sel.wires.size : 0, nT = sel && sel.terms ? sel.terms.size : 0;
  document.getElementById('selname').textContent = !sel ? 'Nothing'
    : multi ? `${G.length} ${G.every(isTimer) ? 'timers' : KIND_NAME[p.t] || 'parts'} (a setting changed here changes them all)`
    : p ? captionOf(p) + (p.t === 'sel' && selsOf(p.L).length > 1 ? (mainSel(p.L) === p ? ` · the main one of ${selsOf(p.L).length}` : ` · an extra contact block`) + ' (turning one turns all)' : '') + (p.t === 'btn' && blocksOf(p.L).length > 1 ? (mainBtn(p.L) === p ? ` · the main one of ${blocksOf(p.L).length}` : ` · an extra contact block`) + ' (pressing one presses all)' : '')
    : nP + nW + nT === 1 ? (nW ? 'A wire' : 'A terminal on ' + [...sel.terms][0].split(':')[0])
    : [nP ? `${nP} part${nP > 1 ? 's' : ''}` : '', nW ? `${nW} wire${nW > 1 ? 's' : ''}` : '', nT ? `${nT} terminal${nT > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' (drag any of them to move them together' + (nT ? '; terminals slide along their bar' : '') + ', Delete to remove)';
  document.getElementById('del').disabled = !sel;
  if (typeof updateClipButtons === 'function') updateClipButtons();
  document.getElementById('p-main').hidden = !(p && !multi && p.t === 'btn' && mainBtn(p.L) !== p);
  document.getElementById('s-main').hidden = !(p && !multi && p.t === 'sel' && mainSel(p.L) !== p);
  showPower();
  document.getElementById('undo').disabled = !history.length;
  document.getElementById('redo').disabled = !future.length;
  // the gold tab for one selected part, named after it (a part picked on the panel opens it; one just placed from
  // the ribbon leaves Home open, to place more)
  if (!p && ribbonTab === 'part') ribbonTab = mainTab;
  document.getElementById('rt-part').textContent = multi ? `${G.length} ${G.every(isTimer) ? 'timers' : KIND_NAME[p.t] || 'parts'}` : p ? captionOf(p) : 'Part';
  showRibbon();
  document.getElementById('props-btn').hidden = !(p && p.t === 'btn');
  document.getElementById('props-coil').hidden = !(p && p.t === 'coil');
  document.getElementById('props-lamp').hidden = !(p && p.t === 'lamp');
  if (p && p.t === 'lamp') {
    // a light of its own, or built into one of the pushbuttons (it then lights that button up, in the button's colour)
    const ls = document.getElementById('l-btn'), btns = [...btnLetters()].sort();
    ls.innerHTML = '';
    ls.add(new Option('None', '', false, !p.L));
    for (const c of new Set([...btns, ...(p.L ? [p.L] : [])])) ls.add(new Option(`${c} Button` + (btns.includes(c) ? '' : ' (not on the panel)'), c, false, c === p.L));
    document.getElementById('l-colour-group').hidden = !!p.L;
    document.getElementById('l-colour-note').hidden = !p.L;
    if (!p.L) swatches(document.getElementById('l-colour'), p.color, hex => each(q => { if (!q.L) q.color = hex; }));
  }
  document.getElementById('props-jmp').hidden = !(p && p.t === 'jmp');
  if (p && p.t === 'jmp') {
    // its number: every continuation with the same number is joined to it
    const ns = document.getElementById('j-num'), cnt = {};
    for (const q of parts) if (isJmp(q) && !G.includes(q)) cnt[q.L] = (cnt[q.L] || 0) + 1;
    ns.innerHTML = '';
    const top = Math.max(10, ...Object.keys(cnt).map(Number)) + 3;
    for (let n = 1; n <= top; n++) { const c = cnt[String(n)] || 0; ns.add(new Option(`${n}` + (c ? ` (joins ${c} other${c > 1 ? 's' : ''})` : ''), String(n), false, String(n) === p.L)); }
  }
  document.getElementById('props-box').hidden = !(p && (isSrc(p) || isPh(p)));
  document.getElementById('props-ph').hidden = !(p && isPh(p));
  if (p && isPh(p)) {
    // which phase it is, and that phase's colour (the colour of every box and wire of that phase)
    document.getElementById('ph-num').value = p.L;
    const box = document.getElementById('ph-colour'), cur = phCol(p);
    box.innerHTML = '';
    for (const [name, hex] of PH_PAL) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = hex; b.title = name;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name); b.setAttribute('aria-checked', String(hex === cur));
      b.addEventListener('click', () => setPhaseCol(p.L, hex)); box.append(b);
    }
    document.getElementById('ph-custom').value = cur.toLowerCase();
    document.getElementById('ph-colour-label').textContent = `L${p.L} colour`;
  }
  document.getElementById('props-xfm').hidden = !(p && p.t === 'xfm');
  if (p && p.t === 'xfm') {
    // its number (one no other transformer has)
    const ns = document.getElementById('x-num'), taken = new Set(parts.filter(q => q.t === 'xfm' && q !== p).map(q => q.L));
    ns.innerHTML = '';
    for (let n = 1; n <= Math.max(9, ...[...taken].map(Number)) + 3; n++) if (!taken.has(String(n))) ns.add(new Option('T' + n, String(n), false, String(n) === p.L));
  }
  document.getElementById('props-sol').hidden = !(p && p.t === 'sol');
  if (p && p.t === 'sol') {
    // its number (one no other solenoid has), and its colour
    const ns = document.getElementById('v-num'), taken = new Set(parts.filter(q => q.t === 'sol' && q !== p).map(q => q.L));
    ns.innerHTML = '';
    const top = Math.max(20, ...[...taken].map(Number)) + 5;
    for (let n = 1; n <= top; n++) if (!taken.has(String(n))) ns.add(new Option('SOL' + n, String(n), false, String(n) === p.L));
    swatches(document.getElementById('v-colour'), p.color, hex => each(q => q.color = hex));
  }
  document.getElementById('props-sel').hidden = !(p && p.t === 'sel');
  if (p && p.t === 'sel') renderSelProps(p, multi);
  document.getElementById('props-con').hidden = !(p && p.t === 'con');
  if (p && p.t === 'con') {
    const cs = document.getElementById('c-of'), coils = [...coilLetters()];
    cs.innerHTML = '';
    for (const c of new Set([...coils, p.L])) cs.add(new Option(`${c} ${parts.some(q => isTimer(q) && q.L === c) ? 'Timer' : 'Coil'}` + (coils.includes(c) ? '' : ' (not on the panel)'), c, false, c === p.L));
    document.querySelectorAll('[data-cnc]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.cnc === +p.nc)));
    // a timer's contact: timed or instantaneous
    document.getElementById('c-inst-group').hidden = !G.every(c => parts.some(q => isTimer(q) && q.L === c.L));
    document.querySelectorAll('[data-cinst]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.cinst === +!!p.inst)));
  }
  if (p && p.t === 'btn') {
    const ls = document.getElementById('p-letter'), others = new Set(parts.filter(q => q.t === 'btn' && q !== p).map(q => q.L)), coils = new Set([...coilLetters(), ...selLetters()]);
    ls.innerHTML = '';
    for (const c of ALL) if (!coils.has(c)) ls.add(new Option(others.has(c) && c !== p.L ? `${c} (same button as the other ${c})` : c, c, false, c === p.L));
    document.querySelectorAll('[data-nc]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.nc === +p.nc)));
    document.querySelectorAll('[data-maint]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.maint === +p.maint)));
    swatches(document.getElementById('p-colour'), p.color, hex => each(q => blocksOf(q.L).forEach(k => k.color = hex)));
    showLabel(document.getElementById('p-label'), p);
  }
  if (p && p.t === 'coil') {
    const os = document.getElementById('o-letter'), used = new Set([...opLetters(), ...coilLetters()]);
    os.innerHTML = '';
    for (const c of ALL) if (c === p.L || !used.has(c)) os.add(new Option(c, c, false, c === p.L));
    swatches(document.getElementById('o-colour'), p.color, hex => each(q => q.color = hex));
    showLabel(document.getElementById('o-label'), p);
    document.getElementById('o-delay-group').hidden = !G.every(isTimer);
    document.getElementById('o-type-group').hidden = !G.every(isTimer);
    document.querySelectorAll('[data-ttype]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.ttype === 'off') === !!p.tof)));
    if (isTimer(p) && document.activeElement !== document.getElementById('o-delay')) document.getElementById('o-delay').value = p.delay;
  }
}
// a label written on a button (all the drawings of it) or a coil instead of its letter
// (the box shows the selected part's label; while it is being typed in, it is left alone unless another part is selected)
function showLabel(box, p) {
  if (box.dataset.pid === String(p.id) && document.activeElement === box) return;
  box.dataset.pid = p.id; box.dataset.snapped = ''; box.value = p.label || ''; box.placeholder = p.L;
}
for (const id of ['p-label', 'o-label']) {
  const box = document.getElementById(id);
  box.addEventListener('input', () => {
    const p = selPart(); if (!p || box.dataset.pid !== String(p.id)) return;
    if (!box.dataset.snapped) { snapshot(); box.dataset.snapped = '1'; }   // (one undo for the whole label)
    const v = box.value.replace(/\s+/g, ' ').slice(0, 8), set = q => { if (v.trim()) q.label = v.trim(); else delete q.label; };
    if (p.t === 'btn') blocksOf(p.L).forEach(set); else set(p);
    draw();
  });
}
document.getElementById('p-letter').addEventListener('change', e => {
  const p = selPart(); if (!p) return; snapshot();
  const mate = blocksOf(e.target.value).find(q => q !== p), old = p.L;
  p.L = e.target.value;
  // a light built into this button goes with it (unless the old letter is still on another button)
  if (!blocksOf(old).length) parts.forEach(q => { if (q.t === 'lamp' && q.L === old) q.L = p.L; });
  if (mate) { p.color = mate.color; p.maint = mate.maint; if (mate.label) p.label = mate.label; else delete p.label; say(`This is now the same button as the other ${p.L}: pressing either presses both.`); }
  else { p.color = BTN_COL[p.L] || p.color; say(''); }
  draw();
});
// make this drawing the main pushbutton (it moves ahead of the others with its letter)
document.getElementById('p-main').addEventListener('click', () => {
  const p = selPart(); if (!p) return; snapshot();
  const m = mainBtn(p.L); parts = parts.filter(q => q !== p); parts.splice(parts.indexOf(m), 0, p); draw();
});
document.querySelectorAll('[data-nc]').forEach(x => x.addEventListener('click', () => each(p => p.nc = x.dataset.nc === '1')));
document.querySelectorAll('[data-maint]').forEach(x => x.addEventListener('click', () => each(p => blocksOf(p.L).forEach(k => k.maint = x.dataset.maint === '1'))));
// a timer's type: on-delay or off-delay
document.querySelectorAll('[data-ttype]').forEach(x => x.addEventListener('click', () => { if (!selGroup().every(isTimer)) return; each(p => { if (x.dataset.ttype === 'off') p.tof = true; else delete p.tof; }); }));
// a timer's delay: whole seconds, 1 to 999
document.getElementById('o-delay').addEventListener('change', e => {
  const G = selGroup(); if (!G.length || !G.every(isTimer)) return;
  const n = Math.min(999, Math.max(1, Math.round(+e.target.value || G[0].delay)));
  e.target.value = n; if (G.every(p => p.delay === n)) return;
  each(p => p.delay = n);
});
document.getElementById('o-letter').addEventListener('change', e => {
  const p = selPart(); if (!p) return; snapshot();
  const old = p.L; p.L = e.target.value; p.color = COIL_COL[p.L] || p.color;
  // its contacts go with it (unless another coil still has the old letter)
  const n = parts.filter(q => q.t === 'con' && q.L === old).length;
  if (!parts.some(q => q.t === 'coil' && q.L === old)) parts.forEach(q => { if (q.t === 'con' && q.L === old) q.L = p.L; });
  say(n ? `Its ${n} contact${n > 1 ? 's' : ''} now belong${n > 1 ? '' : 's'} to ${p.L}.` : ''); draw();
});
document.getElementById('l-btn').addEventListener('change', e => {
  const L = e.target.value; if (!each(p => p.L = L)) return;
  say(L ? `The ${L} button lights up with ${selGroup().length > 1 ? 'these lights' : 'this light'}.` : '');
});
document.getElementById('c-of').addEventListener('change', e => each(p => p.L = e.target.value));
document.querySelectorAll('[data-cinst]').forEach(x => x.addEventListener('click', () => each(p => { p.inst = x.dataset.cinst === '1'; if (!p.inst) delete p.inst; })));
document.querySelectorAll('[data-cnc]').forEach(x => x.addEventListener('click', () => each(p => p.nc = x.dataset.cnc === '1')));
document.getElementById('preset').addEventListener('change', e => {
  const k = e.target.value; if (!k) return;
  const label = e.target.selectedOptions[0].textContent; e.target.value = '';
  snapshot(); loadPreset(k); sel = null; say(''); circuitName = k === 'blank' ? '' : label; fitView(); fit(true); forgetFile();
  if (editing) draw(); else { NET = network(); draw(); startRun(); afterRunStart(); }
});

/* ---- a selector switch's settings. The switch itself (its positions, their names, where it starts, its colour) is
   shared by every drawing with its letter; what each drawing has of its own is the positions it is closed in. */
const selsOf = L => parts.filter(p => p.t === 'sel' && p.L === L);
const SEL_NAME_MAX = 5;
function renderSelProps(p, multi) {
  const ls = document.getElementById('s-letter'), mine = selsOf(p.L).length, others = new Set(parts.filter(q => q.t === 'sel' && q !== p).map(q => q.L)), taken = new Set([...coilLetters(), ...btnLetters()]);
  ls.innerHTML = '';
  for (const c of ALL) if (!taken.has(c)) ls.add(new Option(others.has(c) && c !== p.L ? `${c} (same switch as the other ${c})` : c, c, false, c === p.L));
  const n = selN(p);
  document.querySelectorAll('[data-sn]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.sn === n)));
  const names = p.names || [], tag = i => names[i] || String(i + 1);
  const ci = document.getElementById('s-closed'), st = document.getElementById('s-start');
  ci.innerHTML = ''; st.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const a = document.createElement('button'); a.type = 'button'; a.textContent = tag(i); a.dataset.sci = i;
    a.setAttribute('aria-pressed', String((p.closedIn || []).includes(i))); a.dataset.tip = `Closed in position ${i + 1}` + (names[i] ? ` (${names[i]})` : '') + ': press to switch it on or off'; ci.append(a);
    const b = document.createElement('button'); b.type = 'button'; b.textContent = tag(i); b.dataset.spos = i;
    b.setAttribute('aria-pressed', String((p.pos || 0) === i)); b.dataset.tip = 'The switch starts in this position'; st.append(b);
  }
  const nb = document.getElementById('s-names');
  if (document.activeElement !== nb || nb.dataset.pid !== String(p.id)) { nb.dataset.pid = p.id; nb.dataset.snapped = ''; nb.value = names.slice(0, n).join(' / '); }
  swatches(document.getElementById('s-colour'), p.color, hex => each(q => selsOf(q.L).forEach(k => k.color = hex)));
}
const selShared = (p, f) => each(q => selsOf(q.L).forEach(f));   // (for every switch selected)
document.querySelectorAll('[data-sn]').forEach(x => x.addEventListener('click', () => {
  const p = selGroup()[0]; if (!p || p.t !== 'sel') return; const n = +x.dataset.sn;
  selShared(p, k => { k.n = n; k.pos = Math.min(n - 1, k.pos || 0); k.closedIn = (k.closedIn || []).filter(i => i < n); if (k.names) { k.names = k.names.slice(0, n); if (!k.names.some(Boolean)) delete k.names; } });
}));
document.getElementById('s-closed').addEventListener('click', e => {
  const b = e.target.closest('[data-sci]'), p = selGroup()[0]; if (!b || !p || p.t !== 'sel') return;
  const i = +b.dataset.sci, on = !(p.closedIn || []).includes(i);   // (every drawing selected: closed in it, or not, as the first one now is)
  each(q => { const c = new Set(q.closedIn || []); if (on) c.add(i); else c.delete(i); q.closedIn = [...c].sort((a, b) => a - b); });
});
document.getElementById('s-start').addEventListener('click', e => {
  const b = e.target.closest('[data-spos]'), p = selGroup()[0]; if (!b || !p || p.t !== 'sel') return;
  selShared(p, k => k.pos = +b.dataset.spos);
});
// names for the positions, such as HAND / OFF / AUTO (5 characters each at most; empty for numbers)
document.getElementById('s-names').addEventListener('input', e => {
  const box = e.target, p = selPart(); if (!p || p.t !== 'sel' || box.dataset.pid !== String(p.id)) return;
  if (!box.dataset.snapped) { snapshot(); box.dataset.snapped = '1'; }
  const v = box.value.split(/[\/,]+|\s+/).map(s => s.trim().toUpperCase().slice(0, SEL_NAME_MAX)).filter(Boolean).slice(0, selN(p));
  selsOf(p.L).forEach(k => { if (v.length) k.names = v; else delete k.names; });
  draw();
});
document.getElementById('s-letter').addEventListener('change', e => {
  const p = selPart(); if (!p) return; snapshot();
  const mate = selsOf(e.target.value).find(q => q !== p);
  p.L = e.target.value;
  if (mate) {   // it joins that switch: takes its positions and colour, and is closed in a position none of its other drawings use
    p.n = selN(mate); p.pos = mate.pos || 0; p.color = mate.color; if (mate.names) p.names = [...mate.names]; else delete p.names;
    const used = new Set(selsOf(p.L).filter(q => q !== p).flatMap(q => q.closedIn || []));
    const free = [...Array(p.n).keys()].find(i => !used.has(i)); p.closedIn = [free === undefined ? 0 : free];
    say(`This is now another contact block of the ${p.L} switch: turning either turns both.`);
  } else say('');
  draw();
});
document.getElementById('s-main').addEventListener('click', () => {
  const p = selPart(); if (!p) return; snapshot();
  const m = mainSel(p.L); parts = parts.filter(q => q !== p); parts.splice(parts.indexOf(m), 0, p); draw();
});

document.getElementById('v-num').addEventListener('change', e => { const p = selPart(); if (!p || p.t !== 'sol') return; snapshot(); p.L = e.target.value; draw(); });
document.getElementById('j-num').addEventListener('change', e => { if (selGroup().every(isJmp)) each(p => p.L = e.target.value); });
// turn a continuation a quarter turn clockwise (the R key, or Rotate on its tab)
function rotateJmp(p) { snapshot(); p.rot = ((p.rot || 0) + 1) % 4; if (!p.rot) delete p.rot; normalize(); draw(); }
document.getElementById('j-rot').addEventListener('click', () => { const G = selGroup(); if (G.length && G.every(isJmp)) each(p => { p.rot = ((p.rot || 0) + 1) % 4; if (!p.rot) delete p.rot; }); });
document.getElementById('x-num').addEventListener('change', e => { const p = selPart(); if (!p || p.t !== 'xfm') return; snapshot(); p.L = e.target.value; draw(); });
// a phase box: which phase, and each phase's colour (shared by all of that phase's boxes and wires)
function setPhaseCol(L, hex) { hex = hex.toUpperCase(); if (PH_COL[L - 1] === hex) return; snapshot(); PH_COL = PH_COL.map((c, i) => i === L - 1 ? hex : c); say(`L${L} colour changed.`); draw(); }
document.getElementById('ph-num').addEventListener('change', e => { if (selGroup().every(isPh)) each(p => p.L = e.target.value); });
document.getElementById('ph-custom').addEventListener('change', e => { const p = selGroup()[0]; if (p && isPh(p)) setPhaseCol(p.L, e.target.value); });
document.getElementById('box-rot').addEventListener('click', () => { const G = selGroup(); if (G.length && G.every(isBox)) each(p => { p.rot = ((p.rot || 0) + 1) % 4; if (!p.rot) delete p.rot; }); });
