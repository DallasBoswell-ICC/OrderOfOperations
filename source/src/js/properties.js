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
const KIND_NAME = { xfm: 'transformers', btn: 'pushbuttons', coil: 'coils', con: 'contacts', lamp: 'pilot lights', sel: 'selector switches', sol: 'solenoids', jmp: 'continuations', lsw: 'limit switches', tsw: 'temperature switches', psw: 'pressure switches', htr: 'heating elements', l1: 'L1 supplies', l2: 'L2 returns', ph: 'phases', dsc: 'disconnects', fus: 'fuse blocks', mst: 'starters', olh: 'overloads', olc: 'overload contacts', mtr: 'motors' };
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
  // (an emergency stop is always normally closed, maintained, red: none of those to choose)
  for (const e of document.querySelectorAll('#props-btn .notestop')) e.hidden = !!(p && p.estop);
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
  document.getElementById('props-box').hidden = !(p && (isSrc(p) || isPh(p) || p.t === 'fu1'));
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
    document.getElementById('ph-colour-label').textContent = `L${p.L} Colour`;
  }
  document.getElementById('props-lsw').hidden = !(p && isLim(p));
  if (p && isLim(p)) {
    // its number (one no other switch of its kind has), its kind and its colour (a temperature switch: NO or NC only)
    const ns = document.getElementById('ls-num'), taken = new Set(parts.filter(q => q.t === p.t && q !== p).map(q => q.L));
    groupOf('ls-num').hidden = multi; ns.innerHTML = '';
    for (const o of document.querySelectorAll('#ls-kind option')) { o.hidden = p.t === 'tsw' ? o.value.endsWith('h') : p.t === 'psw' ? o.value.length > 2 : o.value.endsWith('l');
      if (p.t === 'tsw') o.textContent = { no: 'High temp., NO', nc: 'High temp., NC', nol: 'Low temp., NO', ncl: 'Low temp., NC' }[o.value] || o.textContent;
      else o.textContent = { no: 'Normally open', nc: 'Normally closed' }[o.value] || o.textContent; }
    for (let n = 1; n <= Math.max(9, ...[...taken].map(Number)) + 3; n++) if (!taken.has(String(n))) ns.add(new Option(({ tsw: 'TS', psw: 'PS' }[p.t] || 'LS') + n, String(n), false, String(n) === p.L));
    document.getElementById('ls-kind').value = (p.nc ? 'nc' : 'no') + (p.held ? 'h' : '') + (p.low ? 'l' : '');
    swatches(document.getElementById('ls-colour'), p.color, hex => each(q => q.color = hex));
    // what works it: by hand, or a process value of its kind (and then where it acts, and resets)
    const kind = PV_FOR[p.t], opts = PV.filter(v => v.kind === kind), pvs = document.getElementById('ls-pv'), same = G.every(q => q.t === p.t);
    document.getElementById('ls-pv-group').hidden = !same;
    pvs.innerHTML = ''; pvs.add(new Option('Clicked by hand', '', false, !p.pv));
    for (const v of opts) pvs.add(new Option(v.name, v.id, false, v.id === p.pv));
    if (!opts.length) { const o = new Option(`(no ${PV_KINDS[kind][0].toLowerCase()} values yet: add one with Process values on the Home tab)`, '__none'); o.disabled = true; pvs.add(o); }
    const v = same ? pvOf(p) : null;
    document.getElementById('ls-side-group').hidden = !(v && p.t === 'lsw');
    document.getElementById('ls-sp-group').hidden = !v; document.getElementById('ls-rs-group').hidden = !v || p.t === 'lsw';
    if (v) {
      document.getElementById('ls-side').value = p.side === 'lo' ? 'lo' : 'hi';
      document.getElementById('ls-sp-label').textContent = p.t === 'lsw' ? 'At' : pvFalls(p) ? 'Acts at (Falling)' : 'Acts at (Rising)';
      document.getElementById('ls-sp').value = pvFmt(v, +p.sp); document.getElementById('ls-rs').value = pvFmt(v, +p.rs);
      for (const u of document.querySelectorAll('.ls-unit')) u.textContent = v.unit;
    }
  }
  const pw = p && (isPwr3(p) || p.t === 'olc' || p.t === 'mtr' || p.t === 'fu1');
  document.getElementById('props-pwr').hidden = !pw;
  if (pw) {
    // a number of its own (a disconnect, fuses, an overload, a motor); the overload an OL contact belongs to; the coil
    // that works a starter
    const ns = document.getElementById('pw-num'), lab = document.getElementById('pw-label'), uniq = p.t !== 'mst' && p.t !== 'olc';
    groupOf('pw-num').hidden = multi && uniq;
    ns.innerHTML = '';
    if (p.t === 'mst') {
      lab.textContent = 'Worked by';
      for (const c of new Set([...coilLetters(), p.L, 'M'].sort())) ns.add(new Option(`${c} Coil` + (coilLetters().has(c) ? '' : ' (not placed)'), c, false, c === p.L));
    } else if (p.t === 'olc') {
      lab.textContent = 'Overload';
      const ols = new Set(parts.filter(q => q.t === 'olh').map(q => q.L));
      for (let n = 1; n <= Math.max(5, ...[...ols].map(Number)); n++) ns.add(new Option('OL' + n + (ols.has(String(n)) ? '' : ' (not placed)'), String(n), false, String(n) === p.L));
    } else {
      lab.textContent = 'Number';
      const pre = { dsc: 'DS', fus: 'FU', fu1: 'FU', olh: 'OL', mtr: 'MTR' }[p.t], fuse = q => q.t === 'fus' || q.t === 'fu1', taken = new Set(parts.filter(q => (q.t === p.t || fuse(p) && fuse(q)) && q !== p).map(q => q.L));   // (fuses, single or three-pole, number from one count)
      if (fuse(p)) {   // (fuses: a block takes three numbers, FU1-FU3; each number once)
        const k = p.t === 'fus' ? 3 : 1, tk = fuseNums(p);
        for (let n = 1; n <= Math.max(12, ...[...tk].map(Number)) + 3; n++) { const ok = fuseFits(n, k, tk); if (ok || String(n) === p.L) ns.add(new Option(pre + n + (k > 1 ? '–' + pre + (n + 2) : '') + (ok ? '' : ' (used twice)'), String(n), false, String(n) === p.L)); }
      } else
      for (let n = 1; n <= Math.max(9, ...[...taken].map(Number)) + 3; n++) if (!taken.has(String(n)) || String(n) === p.L) ns.add(new Option(pre + n + (taken.has(String(n)) ? ' (used twice)' : ''), String(n), false, String(n) === p.L));   // (its own number always shown, even one another part has too)
    }
    document.getElementById('pw-how').textContent = { dsc: 'In Run: click it to turn it off or on', fus: 'In Run: click a fuse to blow it, or to put a new one in', fu1: 'Blows on a short through it. In Run: click it to blow it, or to put a new one in', mst: 'Its contacts close while its coil is in', olh: 'In Run: click it to trip it, or to reset it', olc: 'Opens while its overload is tripped (click it in Run to reset)', mtr: 'Runs on three phases; two swapped, it runs backward' }[p.t];
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
  document.getElementById('props-htr').hidden = !(p && p.t === 'htr');
  if (p && p.t === 'htr') {
    // its number (one no other heating element has), the temperature it heats and how fast, and its colour
    const ns = document.getElementById('h-num'), taken = new Set(parts.filter(q => q.t === 'htr' && q !== p).map(q => q.L));
    groupOf('h-num').hidden = multi; ns.innerHTML = '';
    for (let n = 1; n <= Math.max(9, ...[...taken].map(Number)) + 3; n++) if (!taken.has(String(n))) ns.add(new Option('HTR' + n, String(n), false, String(n) === p.L));
    swatches(document.getElementById('h-colour'), p.color, hex => each(q => q.color = hex));
  }
  // what it drives: a solenoid, a motor or a heating element and a process value (a heater: a temperature)
  const dr = p && isDrv(p) && G.every(q => q.t === p.t);
  document.getElementById('props-drive').hidden = !dr;
  if (dr) {
    const ds = document.getElementById('d-pv'), opts = PV.filter(v => p.t === 'htr' ? v.kind === 'temperature' : true); ds.innerHTML = '';
    document.getElementById('d-pv-label').textContent = p.t === 'htr' ? 'Heats' : 'Drives';
    ds.add(new Option('Nothing', '', false, !p.pv));
    for (const v of opts) ds.add(new Option(v.name, v.id, false, v.id === p.pv));
    if (!opts.length) { const o = new Option(`(no ${p.t === 'htr' ? 'temperature ' : ''}values yet: add one with Process values on the Home tab)`, '__none'); o.disabled = true; ds.add(o); }
    const v = pvOf(p);
    document.getElementById('d-dir-group').hidden = !v || p.t === 'htr';
    for (const g of ['d-rate-group', 'd-off-group']) document.getElementById(g).hidden = !v;
    document.getElementById('d-cool-group').hidden = !v || drvOff(p) !== 'back';
    document.getElementById('d-pic-group').hidden = !v;
    if (v) { const ps = document.getElementById('d-pic'); ps.options[0].text = v.pic ? 'Placed on the Panel' : 'Under It'; ps.value = p.nopic ? '0' : '1'; }
    if (v) {
      const dir = document.getElementById('d-dir'); dir.options[0].text = p.t === 'mtr' ? 'Forward raises it' : 'Raises it'; dir.options[1].text = p.t === 'mtr' ? 'Forward lowers it' : 'Lowers it'; dir.value = p.dir === 'down' ? 'down' : 'up';
      document.getElementById('d-rate-label').textContent = p.t === 'htr' ? 'Heats at' : p.t === 'mtr' ? 'While It Runs, at' : 'While Energized, at';
      document.getElementById('d-rate').value = pvFmt(v, +p.rate || 0); document.getElementById('d-cool').value = pvFmt(v, +p.cool || 0);
      document.getElementById('d-per').value = drvPer(p); document.getElementById('d-off').value = drvOff(p);
      for (const u of document.querySelectorAll('.d-unit')) u.textContent = (v.unit || '') + (u.classList.contains('d-unit-per') ? (drvPer(p) === 'min' ? ' a minute' : ' a second') : '');
    }
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
    for (const c of letterChoices()) if (!coils.has(c)) ls.add(new Option(others.has(c) && c !== p.L ? `${c} (same button as the other ${c})` : c, c, false, c === p.L));
    document.querySelectorAll('[data-nc]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.nc === +p.nc)));
    document.querySelectorAll('[data-maint]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.maint === +p.maint)));
    swatches(document.getElementById('p-colour'), p.color, hex => each(q => blocksOf(q.L).forEach(k => k.color = hex)));
    showLabel(document.getElementById('p-label'), p);
  }
  if (p && p.t === 'coil') {
    const os = document.getElementById('o-letter'), used = new Set([...opLetters(), ...coilLetters()]);
    os.innerHTML = '';
    for (const c of letterChoices()) if (c === p.L || !used.has(c)) os.add(new Option(c, c, false, c === p.L));
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
  for (const c of letterChoices()) if (!taken.has(c)) ls.add(new Option(others.has(c) && c !== p.L ? `${c} (same switch as the other ${c})` : c, c, false, c === p.L));
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
document.getElementById('box-rot').addEventListener('click', () => { const G = selGroup(); if (G.length && G.every(turns)) each(p => { p.rot = ((p.rot || 0) + 1) % 4; if (!p.rot) delete p.rot; }); });
document.getElementById('pw-num').addEventListener('change', e => { const G = selGroup(); if (G.length && G.every(p => isPwr3(p) || p.t === 'olc' || p.t === 'mtr' || p.t === 'fu1')) each(p => p.L = e.target.value); });
document.getElementById('ls-num').addEventListener('change', e => { const G = selGroup(); if (G.every(p => p.t === G[0].t && isLim(p))) each(p => p.L = e.target.value); });
document.getElementById('h-num').addEventListener('change', e => { const p = selPart(); if (!p || p.t !== 'htr') return; snapshot(); p.L = e.target.value; draw(); });
// what an output drives (one panel for solenoids, motors and heating elements)
document.getElementById('d-pic').addEventListener('change', e => each(p => { if (!isDrv(p)) return; if (e.target.value === '0') p.nopic = true; else delete p.nopic; }));
document.getElementById('d-pv').addEventListener('change', e => { const id = e.target.value, G = selGroup(); if (!G.length || !G.every(q => isDrv(q) && q.t === G[0].t)) return;
  each(p => { if (!id) { delete p.pv; return; } p.pv = id; drvDefaults(p, pvOf(p)); }); });
for (const [id, f] of [['d-dir', 'dir'], ['d-per', 'per'], ['d-off', 'off']]) document.getElementById(id).addEventListener('change', e => each(p => { if (isDrv(p)) p[f] = e.target.value; }));
for (const [id, f] of [['d-rate', 'rate'], ['d-cool', 'cool']]) {
  const box = document.getElementById(id);
  box.addEventListener('change', () => { const x = parseFloat(box.value.replace(',', '.')); if (!isFinite(x) || x < 0) { renderProps(); return; } each(p => { if (isDrv(p)) p[f] = x; }); });
  box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') box.blur(); });
}
document.getElementById('ls-pv').addEventListener('change', e => { const id = e.target.value, G = selGroup(); if (!G.length || !G.every(q => q.t === G[0].t && isLim(q))) return;
  each(p => { if (!id) unlinkPv(p); else { p.pv = id; if (p.t === 'lsw' && !p.side) p.side = 'hi'; pvDefaults(p, pvOf(p)); } }); });
document.getElementById('ls-side').addEventListener('change', e => each(p => { if (p.t === 'lsw' && pvOf(p)) { p.side = e.target.value; pvDefaults(p, pvOf(p)); } }));
// a setting typed in: the reset kept on the right side of it (below the setting for a switch that acts as its value rises, above it otherwise)
for (const [id, f] of [['ls-sp', 'sp'], ['ls-rs', 'rs']]) document.getElementById(id).addEventListener('change', e => {
  const x = parseFloat(e.target.value.replace(',', '.')); if (!isFinite(x)) { renderProps(); return; }
  each(p => { if (!pvOf(p)) return; p[f] = x; if (p.t === 'lsw') { p.rs = p.sp; return; } const fall = pvFalls(p); if (fall ? p.rs < p.sp : p.rs > p.sp) { if (f === 'sp') p.rs = p.sp; else p.sp = p.rs; } });
});
for (const id of ['ls-sp', 'ls-rs']) document.getElementById(id).addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
document.getElementById('ls-kind').addEventListener('change', e => { const k = e.target.value; if (selGroup().every(isLim)) each(p => { p.nc = k.startsWith('nc'); if (k.endsWith('h') && p.t === 'lsw') p.held = true; else delete p.held; if (k.endsWith('l') && p.t === 'tsw') p.low = true; else delete p.low; }); });
