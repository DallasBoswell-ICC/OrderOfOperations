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
  const nP = sel ? sel.parts.size : 0, nW = sel ? sel.wires.size : 0;
  document.getElementById('selname').textContent = !sel ? 'Nothing'
    : p ? captionOf(p) + (p.t === 'btn' && blocksOf(p.L).length > 1 ? (mainBtn(p.L) === p ? ` · the main one of ${blocksOf(p.L).length}` : ` · an extra contact block`) + ' (pressing one presses all)' : '')
    : nP + nW === 1 ? 'A wire'
    : [nP ? `${nP} part${nP > 1 ? 's' : ''}` : '', nW ? `${nW} wire${nW > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ') + ' (drag any of them to move them together, Delete to remove)';
  document.getElementById('del').disabled = !sel;
  if (typeof updateClipButtons === 'function') updateClipButtons();
  document.getElementById('p-main').hidden = !(p && p.t === 'btn' && mainBtn(p.L) !== p);
  document.getElementById('undo').disabled = !history.length;
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
  document.getElementById('props-con').hidden = !(p && p.t === 'con');
  if (p && p.t === 'con') {
    const cs = document.getElementById('c-of'), coils = [...coilLetters()];
    cs.innerHTML = '';
    for (const c of new Set([...coils, p.L])) cs.add(new Option(`${c} Coil` + (coils.includes(c) ? '' : ' (not on the panel)'), c, false, c === p.L));
    document.querySelectorAll('[data-cnc]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.cnc === +p.nc)));
  }
  if (p && p.t === 'btn') {
    const ls = document.getElementById('p-letter'), others = new Set(parts.filter(q => q.t === 'btn' && q !== p).map(q => q.L)), coils = coilLetters();
    ls.innerHTML = '';
    for (const c of ALL) if (!coils.has(c)) ls.add(new Option(others.has(c) && c !== p.L ? `${c} (same button as the other ${c})` : c, c, false, c === p.L));
    document.querySelectorAll('[data-nc]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.nc === +p.nc)));
    document.querySelectorAll('[data-maint]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.maint === +p.maint)));
    swatches(document.getElementById('p-colour'), p.color, hex => { snapshot(); blocksOf(p.L).forEach(k => k.color = hex); draw(); });
  }
  if (p && p.t === 'coil') {
    const os = document.getElementById('o-letter'), used = new Set([...btnLetters(), ...coilLetters()]);
    os.innerHTML = '';
    for (const c of ALL) if (c === p.L || !used.has(c)) os.add(new Option(c, c, false, c === p.L));
    swatches(document.getElementById('o-colour'), p.color, hex => { snapshot(); p.color = hex; draw(); });
    document.getElementById('o-delay-group').hidden = !isTimer(p);
    if (isTimer(p) && document.activeElement !== document.getElementById('o-delay')) document.getElementById('o-delay').value = p.delay;
  }
}
document.getElementById('p-letter').addEventListener('change', e => {
  const p = selPart(); if (!p) return; snapshot();
  const mate = blocksOf(e.target.value).find(q => q !== p), old = p.L;
  p.L = e.target.value;
  // a light built into this button goes with it (unless the old letter is still on another button)
  if (!blocksOf(old).length) parts.forEach(q => { if (q.t === 'lamp' && q.L === old) q.L = p.L; });
  if (mate) { p.color = mate.color; p.maint = mate.maint; say(`This is now the same button as the other ${p.L}: pressing either presses both.`); }
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
document.querySelectorAll('[data-cnc]').forEach(x => x.addEventListener('click', () => { const p = selPart(); if (!p) return; snapshot(); p.nc = x.dataset.cnc === '1'; draw(); }));
document.getElementById('preset').addEventListener('change', e => {
  const k = e.target.value; if (!k) return;
  const label = e.target.selectedOptions[0].textContent; e.target.value = '';
  snapshot(); loadPreset(k); sel = null; say(''); circuitName = k === 'blank' ? '' : label; fitView(); fit(true); forgetFile();
  if (editing) draw(); else { NET = network(); draw(); startRun(); afterRunStart(); }
});
