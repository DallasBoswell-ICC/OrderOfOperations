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
const blocksOf = L => parts.filter(p => p.t === 'btn' && p.L === L);
function renderProps() {
  const p = selPart();
  const nP = sel ? sel.parts.size : 0, nW = sel ? sel.wires.size : 0, nT = sel && sel.terms ? sel.terms.size : 0;
  document.getElementById('selname').textContent = !sel ? 'Nothing'
    : p ? captionOf(p) + (p.t === 'sel' && selsOf(p.L).length > 1 ? (mainSel(p.L) === p ? ` · the main one of ${selsOf(p.L).length}` : ` · an extra contact block`) + ' (turning one turns all)' : '') + (p.t === 'btn' && blocksOf(p.L).length > 1 ? (mainBtn(p.L) === p ? ` · the main one of ${blocksOf(p.L).length}` : ` · an extra contact block`) + ' (pressing one presses all)' : '')
    : nP + nW + nT === 1 ? (nW ? 'A wire' : 'A terminal on ' + [...sel.terms][0].split(':')[0])
    : [nP ? `${nP} part${nP > 1 ? 's' : ''}` : '', nW ? `${nW} wire${nW > 1 ? 's' : ''}` : '', nT ? `${nT} terminal${nT > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' (drag any of them to move them together' + (nT ? '; terminals slide along their bar' : '') + ', Delete to remove)';
  document.getElementById('del').disabled = !sel;
  if (typeof updateClipButtons === 'function') updateClipButtons();
  document.getElementById('p-main').hidden = !(p && p.t === 'btn' && mainBtn(p.L) !== p);
  document.getElementById('s-main').hidden = !(p && p.t === 'sel' && mainSel(p.L) !== p);
  document.getElementById('undo').disabled = !history.length;
  document.getElementById('redo').disabled = !future.length;
  // the gold tab for one selected part, named after it (a part picked on the panel opens it; one just placed from
  // the ribbon leaves Home open, to place more)
  if (!p && ribbonTab === 'part') ribbonTab = 'home';
  document.getElementById('rt-part').textContent = p ? captionOf(p) : 'Part';
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
    if (!p.L) swatches(document.getElementById('l-colour'), p.color, hex => { snapshot(); p.color = hex; draw(); });
  }
  document.getElementById('props-sel').hidden = !(p && p.t === 'sel');
  if (p && p.t === 'sel') renderSelProps(p);
  document.getElementById('props-con').hidden = !(p && p.t === 'con');
  if (p && p.t === 'con') {
    const cs = document.getElementById('c-of'), coils = [...coilLetters()];
    cs.innerHTML = '';
    for (const c of new Set([...coils, p.L])) cs.add(new Option(`${c} ${parts.some(q => isTimer(q) && q.L === c) ? 'Timer' : 'Coil'}` + (coils.includes(c) ? '' : ' (not on the panel)'), c, false, c === p.L));
    document.querySelectorAll('[data-cnc]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.cnc === +p.nc)));
    // a timer's contact: timed or instantaneous
    document.getElementById('c-inst-group').hidden = !parts.some(q => isTimer(q) && q.L === p.L);
    document.querySelectorAll('[data-cinst]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.cinst === +!!p.inst)));
  }
  if (p && p.t === 'btn') {
    const ls = document.getElementById('p-letter'), others = new Set(parts.filter(q => q.t === 'btn' && q !== p).map(q => q.L)), coils = new Set([...coilLetters(), ...selLetters()]);
    ls.innerHTML = '';
    for (const c of ALL) if (!coils.has(c)) ls.add(new Option(others.has(c) && c !== p.L ? `${c} (same button as the other ${c})` : c, c, false, c === p.L));
    document.querySelectorAll('[data-nc]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.nc === +p.nc)));
    document.querySelectorAll('[data-maint]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.maint === +p.maint)));
    swatches(document.getElementById('p-colour'), p.color, hex => { snapshot(); blocksOf(p.L).forEach(k => k.color = hex); draw(); });
    showLabel(document.getElementById('p-label'), p);
  }
  if (p && p.t === 'coil') {
    const os = document.getElementById('o-letter'), used = new Set([...opLetters(), ...coilLetters()]);
    os.innerHTML = '';
    for (const c of ALL) if (c === p.L || !used.has(c)) os.add(new Option(c, c, false, c === p.L));
    swatches(document.getElementById('o-colour'), p.color, hex => { snapshot(); p.color = hex; draw(); });
    showLabel(document.getElementById('o-label'), p);
    document.getElementById('o-delay-group').hidden = !isTimer(p);
    document.getElementById('o-type-group').hidden = !isTimer(p);
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
document.querySelectorAll('[data-nc]').forEach(x => x.addEventListener('click', () => { const p = selPart(); if (!p) return; snapshot(); p.nc = x.dataset.nc === '1'; draw(); }));
document.querySelectorAll('[data-maint]').forEach(x => x.addEventListener('click', () => { const p = selPart(); if (!p) return; snapshot(); blocksOf(p.L).forEach(k => k.maint = x.dataset.maint === '1'); draw(); }));
// a timer's type: on-delay or off-delay
document.querySelectorAll('[data-ttype]').forEach(x => x.addEventListener('click', () => { const p = selPart(); if (!p || !isTimer(p)) return; snapshot(); if (x.dataset.ttype === 'off') p.tof = true; else delete p.tof; draw(); }));
// a timer's delay: whole seconds, 1 to 999
document.getElementById('o-delay').addEventListener('change', e => {
  const p = selPart(); if (!p || !isTimer(p)) return;
  const n = Math.min(999, Math.max(1, Math.round(+e.target.value || p.delay)));
  e.target.value = n; if (n === p.delay) return;
  snapshot(); p.delay = n; draw();
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
  const p = selPart(); if (!p) return; snapshot(); p.L = e.target.value;
  say(p.L ? `The ${p.L} button lights up with this light.` : ''); draw();
});
document.getElementById('c-of').addEventListener('change', e => { const p = selPart(); if (!p) return; snapshot(); p.L = e.target.value; draw(); });
document.querySelectorAll('[data-cinst]').forEach(x => x.addEventListener('click', () => { const p = selPart(); if (!p) return; snapshot(); p.inst = x.dataset.cinst === '1'; if (!p.inst) delete p.inst; draw(); }));
document.querySelectorAll('[data-cnc]').forEach(x => x.addEventListener('click', () => { const p = selPart(); if (!p) return; snapshot(); p.nc = x.dataset.cnc === '1'; draw(); }));
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
function renderSelProps(p) {
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
  swatches(document.getElementById('s-colour'), p.color, hex => { snapshot(); selsOf(p.L).forEach(k => k.color = hex); draw(); });
}
const selShared = (p, f) => { snapshot(); selsOf(p.L).forEach(f); draw(); };
document.querySelectorAll('[data-sn]').forEach(x => x.addEventListener('click', () => {
  const p = selPart(); if (!p || p.t !== 'sel') return; const n = +x.dataset.sn;
  selShared(p, k => { k.n = n; k.pos = Math.min(n - 1, k.pos || 0); k.closedIn = (k.closedIn || []).filter(i => i < n); if (k.names) { k.names = k.names.slice(0, n); if (!k.names.some(Boolean)) delete k.names; } });
}));
document.getElementById('s-closed').addEventListener('click', e => {
  const b = e.target.closest('[data-sci]'), p = selPart(); if (!b || !p || p.t !== 'sel') return;
  const i = +b.dataset.sci; snapshot();
  const c = new Set(p.closedIn || []); if (c.has(i)) c.delete(i); else c.add(i);
  p.closedIn = [...c].sort((a, b) => a - b); draw();
});
document.getElementById('s-start').addEventListener('click', e => {
  const b = e.target.closest('[data-spos]'), p = selPart(); if (!b || !p || p.t !== 'sel') return;
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
