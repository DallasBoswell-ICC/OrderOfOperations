/* =====================================================================
   The Troubleshooter (build.py --ts): this same program as a page of its own, where students find the faults
   planted in a circuit (Circuit Builder, Faults tab) the way a technician would: by what the machine does, and by
   what a meter reads. Run only. The current's colours are hidden (lights, coils and motors still show what they do);
   the wires are insulated and every part has terminal blocks, where the meter's leads go.
   The Troubleshoot tab: the meter (Voltmeter on the live circuit; Ohmmeter and Continuity only once locked out), Lock
   Out, the six steps (can be turned off) and the pushbutton mode. Down the right: the work order that came with the
   assignment, the six steps, and the test log (every reading, kept automatically).
   ===================================================================== */
const TS_KEY = 'oo-circuit-builder:ts-state';
const TS_STEPS = ['Symptoms', 'Possible causes', 'Find the faulty area', 'Find the faulty part', 'Repair', 'Test and document'];
let tsTab = 'ts';
const TSM = { mode: 'v', red: null, black: null, next: 'red', key: '', val: '', sig: '', due: 0, pend: null, lastLog: '' };
let TS = { log: [], steps: [], t0: Date.now(), showSteps: true, scen: null, repairs: [], signoff: null };   // (scen: the scenario this student got, { n: from 0, of, hidden }; repairs and signoff: see tsRepair)

function tsSay(t) { say(t); }
// the Troubleshooter's ribbon: its own tab (Troubleshoot) and the Simulation tab
function tsShowRibbon() {
  for (const id of ['rt-home', 'rt-faults', 'rt-part']) document.getElementById(id).hidden = true;
  const s = (id, on) => { const b = document.getElementById(id); b.hidden = false; b.setAttribute('aria-pressed', String(on)); };
  s('rt-ts', tsTab === 'ts'); s('rt-run', tsTab === 'run');
  for (const id of ['toolbar', 'editpanel', 'faultbar']) document.getElementById(id).hidden = true;
  document.getElementById('runbar').hidden = tsTab !== 'run';
  document.getElementById('tsbar').hidden = tsTab !== 'ts';
}

// ---- what is kept between visits (in this browser): the assignment, the test log, the steps ticked off
function tsSave() { try { localStorage.setItem(TS_KEY, JSON.stringify({ circuit: circuitData(), log: TS.log, steps: TS.steps, t0: TS.t0, showSteps: TS.showSteps, blown: TS_BLOWN, scen: TS.scen, repairs: TS.repairs, signoff: TS.signoff })); } catch (_) {} }
function tsUse(c, msg, fresh) {
  PV = c.pv; parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; POWER = c.power; SRC_COL = c.src; PH_COL = c.ph; circuitName = c.name; LINK_PRINT = c.pr || null; scenFrom(c); normalize();
  if (fresh) { TS.log = []; TS.steps = []; TS.t0 = Date.now(); TS_BLOWN = {}; TS.scen = c.pick || null; TS.repairs = []; TS.signoff = null; }
  LOCKOUT = false; TS_PUSHED = {}; TSM.push = false; TSM.repair = null; tsCardOff(); TSM.red = TSM.black = null; TSM.next = 'red'; TSM.lastLog = ''; TSM.sig = '';
  if (editing) { fit(true); fitView(); setMode(true); } else { fit(true); fitView(); NET = network(); draw(); startRun(); afterRunStart(); }
  tsShowAll(); if (msg) tsSay(msg);
  if (fresh) tsSave();
}
// the sample assignment: a start/stop station with a seal-in and a run light, its X coil open
function tsSample() {
  loadPreset('seal');
  parts.push(P('con', 300, 420, { L: 'X' }), P('lamp', 700, 420, { L: '', color: '#00B050' }));
  wires.push(Wr(0, 420, 260, 420), Wr(340, 420, 640, 420), Wr(760, 420, W, 420));
  const x = parts.find(p => p.t === 'coil'); if (x) x.fault = 'open';
  const c = readCircuit(JSON.parse(JSON.stringify(circuitData())));
  c.name = 'Sample: Start/Stop Station'; c.wo = 'The machine won’t start. When you press START (A), nothing happens and the RUN light stays off.';
  return c;
}
// Open Assignment: a circuit file saved from the Circuit Builder (faults planted on its Faults tab), a simulator
// page saved from it, or a circuit code
async function tsOpenText(text, name) {
  const sim = /<script id="oo-locked" type="application\/json">([\s\S]*?)<\/script>/.exec(text);
  let c;
  if (sim) c = readCircuit(JSON.parse(sim[1]).circuit);
  else if (/^\s*\{/.test(text)) c = readCircuit(JSON.parse(text));
  else c = await decodeCircuit(text);
  if (!c.name && name) c.name = name.replace(/\.(json|html?|txt)$/i, '');
  // (several scenarios: the student is given one, at random or the one their instructor names)
  if (c.sn > 1) { const pick = await tsChooseScenario(c); if (!pick) return; tsScenario(c, pick.n); c.pick = { n: pick.n, of: c.sn, hidden: pick.hidden }; }
  const n = c.parts.filter(p => p.fault).length + c.wires.filter(w => w.fault).length;
  tsUse(c, n ? `Opened ${c.name || 'the assignment'}. Read the work order, then start troubleshooting.` : `Opened ${c.name || 'the circuit'}: it has no faults planted in it (plant them on the Circuit Builder's Faults tab).`, true);
}

/* Scenarios (Dallas, 16 Nov 2026): an assignment with several asks which one, as the Circuit Builder allows: a random one
   (its number kept from the student: written in the test log they keep, for the instructor) or the one their instructor
   gives them (its number shown). */
function tsScenario(c, n) { for (const x of [...c.parts, ...c.wires]) { const f = x.fz && x.fz[n]; if (f) x.fault = f; else delete x.fault; } c.si = n; c.wo = c.swo ? c.swo[n] || '' : c.wo; }
function tsChooseScenario(c) {
  const d = document.getElementById('ts-scen-dlg'), off = c.ffo || { r: true, n: true };
  d.querySelector('h2').textContent = c.name || 'Assignment';
  d.querySelector('.ts-sc-n').textContent = c.sn;
  d.querySelector('.ts-sc-rand-wrap').hidden = !off.r; d.querySelector('.ts-sc-num').hidden = !off.n;
  d.querySelector('.ts-sc-or').textContent = off.r ? 'Or the scenario my instructor gives me:' : 'The scenario my instructor gives me:';
  const box = d.querySelector('input'), msg = d.querySelector('.ts-sc-msg'); box.value = ''; box.max = c.sn; msg.textContent = '';
  return new Promise(res => {
    const done = v => { d.close(); res(v); };
    d.querySelector('.ts-sc-rand').onclick = () => done({ n: Math.floor(Math.random() * c.sn), hidden: true });
    const go = () => { const k = Math.round(Number(box.value)); if (!(k >= 1 && k <= c.sn)) { msg.textContent = `Type a number from 1 to ${c.sn}.`; box.focus(); return; } done({ n: k - 1, hidden: false }); };
    d.querySelector('.ts-sc-go').onclick = go; box.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    d.querySelector('.ts-sc-cancel').onclick = () => done(null);
    d.oncancel = () => res(null);
    d.showModal(); if (off.n && !off.r) box.focus();
  });
}

// ---- Lock Out: every disconnect open and the control supply off (the circuit starts again from dead); taking the lock
// off starts it again from the top, as switching a machine back on does
function tsLockOut(on) {
  // (locking out or taking the lock off lets go of any relay pushed in by hand)
  LOCKOUT = on; TS_PUSHED = {}; if (!on) { TSM.push = false; TSM.repair = null; tsCardOff(); }
  startRun(); buildProcess(); paint();
  if (!on && TSM.mode !== 'v' && TSM.mode !== 'off') tsMode('v', true);
  tsShowAll();
  tsSay(on ? 'Locked out: every disconnect is open and the control power is off. Check with the voltmeter that it is dead before you measure resistance.' : 'Lock removed: the circuit is powered again.');
}

// the pushbuttons: Click, Press and Hold (as in the Circuit Builder), or Click to Hold (a click holds a momentary
// button down till it is clicked again); leaving Click to Hold lets go of any it is holding
function tsPushMode(m) {
  if (mode === 'latch' && m !== 'latch') for (const p of parts) if (p.t === 'btn' && !p.maint && !p.estop && down[p.L]) press(p.L, false);
  mode = m; autoRel = {};
  for (const b of document.querySelectorAll('#mode-group [data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
  tsShowAll(); TSM.key = '';
}
// Force On (Dallas: Push In, 15 Nov 2026; renamed and widened to switches 16 Nov 2026): with the machine locked out, a
// relay or starter can be pushed in by hand (its armature pressed in with an insulated tool), and a limit, pressure,
// temperature or flow switch worked by hand (its actuator moved, whatever its pressure, temperature or flow), so its
// contacts can be checked with the ohmmeter or continuity tester; only while locked out. A click on a relay's coil or
// any of its contacts forces it on, or on a switch; another lets it go.
const tsForceSw = p => p && isLim(p);
const tsPushable = p => p && ((p.t === 'coil' && !isTimer(p)) || p.t === 'con' || p.t === 'mst') && parts.some(q => q.t === 'coil' && !isTimer(q) && q.L === p.L);
function tsPush(L, on) {
  if (on && !LOCKOUT) return;
  if (on) TS_PUSHED[L] = true; else delete TS_PUSHED[L];
  for (const c of parts) if ((c.t === 'con' || c.t === 'mst') && c.L === L) moveContact(c, simT);
  needPaint = true; TSM.key = '';
  tsSay(on ? `${L} forced on by hand: its contacts have changed over. Click it again to let it go.` : `${L} let go.`);
}
function tsForceSwitch(p, on) {
  if (on && !LOCKOUT) return;
  const K = 's:' + opKey(p);
  if (on) TS_PUSHED[K] = true; else delete TS_PUSHED[K];
  LSW_T[opKey(p)] = simT; if (simT + LSW_MOVE > busyUntil) busyUntil = simT + LSW_MOVE;   // (it moves over a moment, as when worked)
  needPaint = true; TSM.key = ''; TSM.sig = '';
  const n = captionOf(p).replace(/ \(.*\)$/, '');
  tsSay(on ? `${n} forced on by hand: worked, whatever its process. Click it again to let it go.` : `${n} let go.`);
}
function tsPushTool(on) {
  if (on && !LOCKOUT) { tsSay('Lock out first: a relay or switch is only ever forced on by hand with the power off and locked out.'); return; }
  TSM.push = on; if (on) { TSM.repair = null; tsCardOff(); } tsShowAll();
  if (on) tsSay('Force On: click a relay\u2019s coil or contact, or a limit, pressure, temperature or flow switch, to force it on by hand (and again to let it go).');
}
// the lead the next click on a terminal moves (the meter's Red / Black, or R and B)
function tsPick1(c) { TSM.next = c; TSM.key = ''; tsShowMeter(); tsSay(`${c === 'red' ? 'Red' : 'Black'} lead: click a terminal to put it there.`); }

/* ---- Repair (Dallas, 16 Nov 2026): Replace Part and Repair Wire, only while locked out (as the meter's ohms are).
   A click on a part (or a wire) asks first; the repair goes in the test log, and is kept with whether it was needed:
   that is for the instructor's report only, never shown to the student. A new part wears a NEW tag; a repaired wire,
   a spliced sleeve where it was cut in. Test the Repair: the student takes the lock off, runs the machine, and signs
   off on what they checked; whether it really is fixed is kept for the report, not told to them. */
const tsRepairable = p => p && !['l1', 'l2', 'ph', 'jmp'].includes(p.t);
function tsRepairTool(k) {
  if (k && !LOCKOUT) { tsSay(`Lock out first: a ${k === 'part' ? 'part is only ever replaced' : 'wire is only ever repaired'} with the power off and locked out.`); return; }
  TSM.repair = TSM.repair === k ? null : k; if (TSM.repair) TSM.push = false;
  tsCardOff(); tsShowAll();
  if (TSM.repair) tsSay(TSM.repair === 'part' ? 'Replace Part: click the part to replace.' : 'Repair Wire: click the wire to repair, where you will splice it.');
}
// a wire's name in the log: what is at each of its ends
function tsWireName(w) {
  const at = (x, y) => { let q = null, bd = 30; for (const t of TS_POINTS) { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; q = t; } } return q ? q.label : 'a junction'; };
  const a = at(w.x1, w.y1), b = at(w.x2, w.y2);
  return a === b ? 'the wire' : `the wire, ${a} to ${b}`;
}
// the wire nearest a point on the panel (within reach), and the point on it
function tsWireAt(x, y) {
  let best = null, bd = 14;
  for (const w of wires) {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy, k = L2 ? Math.max(0, Math.min(1, ((x - w.x1) * dx + (y - w.y1) * dy) / L2)) : 0;
    const px = w.x1 + k * dx, py = w.y1 + k * dy, d = Math.hypot(x - px, y - py);
    if (d < bd) { bd = d; best = { w, x: px, y: py, up: Math.abs(dy) > Math.abs(dx) }; }
  }
  return best;
}
function tsCardOff() { const c = document.getElementById('ts-card'); if (c) c.remove(); }
// the card that asks first, beside what was picked (sx, sy: where, in pixels from the panel's top left)
function tsAsk(sx, sy, title, text, go, ok) {
  tsCardOff();
  const st = document.getElementById('stage'), c = document.createElement('div'); c.id = 'ts-card'; c.className = 'ts-card';
  c.innerHTML = `<h4>${esc(title)}</h4><p>${esc(text)}</p><div class="ts-card-end"><button type="button" class="ts-card-no">Cancel</button><button type="button" class="ts-card-go">${esc(go)}</button></div>`;
  st.appendChild(c);
  const r = st.getBoundingClientRect(), w = c.offsetWidth, h = c.offsetHeight;
  c.style.left = Math.max(8, Math.min(r.width - w - 8, sx - w / 2)) + 'px';
  c.style.top = (sy + h + 30 < r.height ? sy + 24 : Math.max(8, sy - h - 24)) + 'px';
  c.querySelector('.ts-card-no').onclick = () => tsCardOff();
  c.querySelector('.ts-card-go').onclick = () => { tsCardOff(); ok(); };
  c.querySelector('.ts-card-go').focus();
}
function tsRepair(kind, it, at) {
  const needed = kind === 'part' ? !!(it.fault || TS_BLOWN[it.id] || BLOWN[it.id]) : !!it.fault;
  const i = (kind === 'part' ? parts : wires).indexOf(it);
  if (kind === 'part') { delete it.fault; delete TS_BLOWN[it.id]; delete BLOWN[it.id]; } else delete it.fault;
  // (a new coil comes in a different colour (Dallas, 16 Nov 2026): the next colour round the palette that no other coil
  // has, if there is one; its contacts take it too, being the same relay)
  if (kind === 'part' && it.t === 'coil') {
    const cols = PALETTE.map(c => c[1]).filter(c => c !== '#FFFFFF'), cur = cols.indexOf(String(it.color).toUpperCase()), used = new Set(parts.filter(q => q.t === 'coil' && q !== it).map(q => String(q.color).toUpperCase()));
    const order = cols.map((_, k) => cols[(Math.max(cur, 0) + 1 + k) % cols.length]).filter(c => c !== String(it.color).toUpperCase());
    it.color = order.find(c => !used.has(c)) || order[0];
  }
  const name = kind === 'part' ? `the ${captionOf(it)}` : tsWireName(it);
  TS.repairs.push({ k: kind, i, needed, t: Date.now() - TS.t0, ...(at ? { x: at.x, y: at.y, up: at.up } : {}) });
  TS.log.push({ r: kind, a: kind === 'part' ? `Replaced ${name}` : `Repaired ${name}`, v: kind === 'part' ? 'New Part' : 'Spliced', c: tsConditions(), t: Date.now() - TS.t0 });
  TS.signoff = null;   // (a repair after signing off: it needs testing again)
  NET = network(); draw(); startRun(); buildProcess(); paint(); TSM.key = ''; TSM.sig = '';
  tsSave(); tsShowLog(true);
  tsSay(kind === 'part' ? `Replaced ${name}. Check it, then take the lock off and test the repair.` : `Repaired ${name}. Check it, then take the lock off and test the repair.`);
}
// a click on the panel with Replace Part or Repair Wire picked
function tsRepairClick(e) {
  if (!LOCKOUT) { TSM.repair = null; tsShowAll(); return; }
  const st = document.getElementById('stage').getBoundingClientRect(), sx = e.clientX - st.left, sy = e.clientY - st.top;
  if (TSM.repair === 'part') {
    const g = e.target.closest && e.target.closest('[data-part]'), p = g && parts.find(x => String(x.id) === g.dataset.part);
    if (!tsRepairable(p)) { tsSay('Replace Part: click a part (a button, contact, coil, light, switch, fuse...).'); return; }
    tsAsk(sx, sy, `Replace the ${captionOf(p)}?`, 'The old one comes out and a new one goes in. It goes in your test log, and counts as a part used.', 'Replace', () => tsRepair('part', p));
  } else {
    const q = pt(e), hit = tsWireAt(q.x, q.y);
    if (!hit) { tsSay('Repair Wire: click on a wire, where you will splice it.'); return; }
    tsAsk(sx, sy, `Repair ${tsWireName(hit.w)}?`, 'It is cut and spliced with a new piece of wire. It goes in your test log.', 'Repair', () => tsRepair('wire', hit.w, hit));
  }
}
// Test the Repair: the student signs off on what they checked (whether it is fixed is kept for the report)
const tsFixed = () => !parts.some(p => p.fault) && !wires.some(w => w.fault) && !Object.keys(TS_BLOWN).length;
function tsTestRepair() {
  const d = document.getElementById('ts-sign-dlg'), go = d.querySelector('.ts-sg-go'), boxes = [...d.querySelectorAll('input[type=checkbox]')], note = d.querySelector('textarea');
  for (const b of boxes) b.checked = false; note.value = '';
  d.querySelector('.ts-sg-lock').hidden = !LOCKOUT;
  const can = () => { go.disabled = LOCKOUT || !boxes.every(b => b.checked) || !note.value.trim(); };
  for (const b of boxes) b.onchange = can; note.oninput = can; can();
  go.onclick = () => {
    TS.signoff = { t: Date.now() - TS.t0, note: note.value.trim().slice(0, 600), fixed: tsFixed() };
    TS.log.push({ r: 'test', a: `Tested the repair and signed off: ${TS.signoff.note}`, v: 'Signed Off', c: tsConditions(), t: TS.signoff.t });
    tsSave(); tsShowLog(true); d.close();
    tsSay('Signed off. Your test log keeps it, for your instructor.');
  };
  d.querySelector('.ts-sg-no').onclick = () => d.close();
  d.showModal();
}

// ---- the meter
function tsMode(m, quiet) {
  if ((m === 'ohm' || m === 'cont') && !LOCKOUT) { tsSay('Lock out first: never measure resistance or continuity on a live circuit (Lock Out, on the Troubleshoot tab).'); return; }
  TSM.mode = m; TSM.sig = ''; tsBeep(false);
  if (!quiet) tsSay(m === 'v' ? 'Voltmeter: put the red and black leads on two terminals (click one, then the other).' : m === 'ohm' ? 'Ohmmeter: put the leads across the part or wire to measure.' : m === 'cont' ? 'Continuity: the meter beeps when there is a way through.' : '');
  tsShowAll();
}
// where a junction in panel units is, in pixels from the panel's top left (in Columns view, its band moved too)
function tsScreen(x, y) {
  const m = svg.getScreenCTM(); if (!m) return null;
  const b = view.B ? view.B(y) : null, X = x + (b ? b.dx : 0), Y = y + (b ? b.dy : 0), r = document.getElementById('stage').getBoundingClientRect();
  return [m.a * X + m.c * Y + m.e - r.left, m.b * X + m.d * Y + m.f - r.top];
}
// the terminal nearest a click (within reach), or null
function tsPick(cx, cy) {
  const r = document.getElementById('stage').getBoundingClientRect(); let best = null, bd = 18;
  for (const q of TS_POINTS) { const s = tsScreen(q.x, q.y); if (!s) continue; const d = Math.hypot(s[0] - (cx - r.left), s[1] - (cy - r.top)); if (d < bd) { bd = d; best = q; } }
  return best;
}
function tsPlace(q) {
  // (the lead picked on the meter goes there; while the other is not on yet, it is picked next)
  const lead = TSM.next, other = lead === 'red' ? 'black' : 'red'; TSM[lead] = { ...q }; if (!TSM[other]) TSM.next = other; TSM.sig = ''; TSM.key = '';
  tsShowMeter();
}
let tsAudio = null, tsTone = null;
function tsBeep(on) {
  if (!on) { if (tsTone) tsTone.gain.gain.setTargetAtTime(0, tsAudio.currentTime, .01); return; }
  try {
    if (!tsAudio) { tsAudio = new (window.AudioContext || window.webkitAudioContext)(); const o = tsAudio.createOscillator(), g = tsAudio.createGain(); o.frequency.value = 2700; o.type = 'square'; g.gain.value = 0; o.connect(g).connect(tsAudio.destination); o.start(); tsTone = { o, gain: g }; }
    if (tsAudio.state === 'suspended') tsAudio.resume();
    tsTone.gain.gain.setTargetAtTime(.05, tsAudio.currentTime, .01);
  } catch (_) {}
}
// what the circuit is doing that a reading depends on (worked out again only when this changes)
function tsState() {
  let s = (LOCKOUT ? 'L' : '') + (SUPPLY_CUT ? 'C' : '');
  for (const p of parts) { if (isSw(p)) s += closed(p) ? 1 : 0; if (p._sw) for (const k of p._sw) s += closed(k) ? 1 : 0; if (p._poles) for (const k of p._poles) s += closed(k) ? 1 : 0; }
  return s;
}
function tsRead() {
  const { red, black, mode } = TSM;
  if (mode === 'off') return { text: '', unit: '', beep: false };
  if (!red || !black) return { text: mode === 'v' ? '0.0' : 'OL', unit: mode === 'v' ? 'V AC' : 'Ω', beep: false, none: true };
  if (mode === 'v') { const v = tsVolts(red.n, black.n); return { text: (v < .05 ? 0 : v).toFixed(1), unit: 'V AC' }; }
  const r = tsOhms(red.n, black.n);
  if (!isFinite(r) || r > 40e6 || (mode === 'cont' && r > 999.9)) return { text: 'OL', unit: 'Ω', beep: false };
  const beep = mode === 'cont' && r < 20;
  return r >= 1000 ? { text: (r / 1000).toFixed(2), unit: 'kΩ', beep } : { text: r.toFixed(1), unit: 'Ω', beep };
}
// every frame: the leads follow the view; a few times a second, the reading (and the test log)
function tsTick(now) {
  for (const id in BLOWN) if (!TS_BLOWN[id]) { TS_BLOWN[id] = 1; tsSave(); }   // (a blown fuse stays blown)
  tsLeads();
  if (now < TSM.due) return; TSM.due = now + 200;
  const sig = TSM.mode + ':' + (TSM.red && TSM.red.n) + ':' + (TSM.black && TSM.black.n) + ':' + tsState();
  if (sig !== TSM.sig) { TSM.sig = sig; TSM.rd = tsRead(); tsShowMeter(); tsBeep(!!TSM.rd.beep); }
  // a reading that has held steady for a moment goes into the test log (once, till something changes)
  const rd = TSM.rd; if (!rd || rd.none || TSM.mode === 'off') { TSM.pend = null; return; }
  const k = sig + '=' + rd.text;
  if (!TSM.pend || TSM.pend.k !== k) TSM.pend = { k, at: now };
  else if (now - TSM.pend.at > 700 && TSM.lastLog !== k) { TSM.lastLog = k; tsLog(rd); }
}
function tsConditions() {
  const held = parts.filter(p => p.t === 'btn' && down[p.L] && mainBtn(p.L) === p).map(p => `${idOf(p)} held`);
  return [...new Set(held), ...(LOCKOUT ? ['locked out'] : [])].join(' · ');
}
function tsLog(rd) {
  TS.log.push({ a: TSM.red.label, b: TSM.black.label, m: TSM.mode, v: `${rd.text} ${rd.unit}${rd.beep ? ' (beep)' : ''}`, c: tsConditions(), t: Date.now() - TS.t0 });
  if (TS.log.length > 300) TS.log.shift();
  tsSave(); tsShowLog(true);
}

// ---- drawing the meter's leads: from the jacks, in a curve, to the probes on their terminals
// a small tag over a part (HELD DOWN, FORCED ON), at a point in pixels
const tsTag = (s, t, k = 1) => `<g transform="translate(${s[0]} ${s[1]}) scale(${k})">` + tsTag1(t) + '</g>';
const tsTag1 = t => `<g><rect x="-${t.length * 4 + 10}" y="-11" width="${t.length * 8 + 20}" height="20" rx="5" fill="#1c1d1f" stroke="#FF6F59" stroke-width="1.6"/><text y="4" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" letter-spacing=".04em">${t}</text></g>`;
function tsLeads() {
  const ov = document.getElementById('ts-leads'), m = document.getElementById('ts-meter'); if (!ov || !m) return;
  const st = document.getElementById('stage').getBoundingClientRect(), mr = m.getBoundingClientRect();
  // (where each plug goes: the middle of the socket itself)
  const jack = c => { const j = m.querySelector('.jack.' + c + ' .sock').getBoundingClientRect(); return [j.left + j.width / 2 - st.left, j.top + j.height / 2 - st.top]; };
  const cm = svg.getScreenCTM(), zk = Math.max(.35, Math.min(1, cm ? Math.hypot(cm.a, cm.b) : 1));   // (how far the panel is zoomed: the probes on it scale with it)
  const D = TSM.drag, tips = ['red', 'black'].map(c => D && D.c === c && D.moved ? [D.x, D.y] : TSM[c] ? tsScreen(TSM[c].x, TSM[c].y) : null);
  const held = mode === 'latch' ? parts.filter(p => p.t === 'btn' && !p.maint && !p.estop && down[p.L]) : [];
  const hs = held.map(p => tsScreen(p.x, p.y - BOX / 2 - 50));
  const key = [mr.left, mr.top, st.width, st.height, ...tips.flat(), ...hs.flat(), TSM.hover && TSM.hover.x, TSM.hover && TSM.hover.y, TSM.next, TSM.mode, D && D.c, zk * 100, (TS.repairs || []).length].map(v => v == null ? '' : typeof v === 'number' ? Math.round(v) : v).join(',') + Object.keys(TS_PUSHED).join('');
  if (key === TSM.key) return; TSM.key = key;
  let h = '', cab = '', probes = '', plugs = '';
  for (const s of hs) if (s) h += tsTag(s, 'HELD DOWN');
  for (const r of TS.repairs || []) {   // (what has been repaired: NEW on a new part, a sleeve where a wire was spliced)
    if (r.k === 'part') { const p = parts[r.i]; const q = p && tsScreen(p.x + 30, p.y + 38); if (q) h += `<g transform="translate(${q[0]} ${q[1]}) scale(${zk.toFixed(3)})"><rect x="-21" y="-10" width="42" height="20" rx="10" fill="#1f6b3a" stroke="#3fbf6a" stroke-width="1.6"/><text y="4.2" text-anchor="middle" font-size="11.5" font-weight="800" fill="#e8ffe9" letter-spacing=".04em">NEW</text></g>`; }
    else if (r.x != null) { const q = tsScreen(r.x, r.y); if (q) h += `<g transform="translate(${q[0]} ${q[1]}) rotate(${r.up ? 90 : 0}) scale(${zk.toFixed(3)})"><rect x="-18" y="-9" width="36" height="18" rx="5" fill="#FF6F59" stroke="#7a2a1e" stroke-width="1.3"/><rect x="-18" y="-9" width="36" height="6" rx="3" fill="#fff" opacity=".22"/><path d="M-9 -9v18M9 -9v18" stroke="#7a2a1e" stroke-width="1.5"/></g><g transform="translate(${q[0]} ${q[1]}) scale(${zk.toFixed(3)})"><g transform="translate(${r.up ? 50 : 46} ${r.up ? 0 : -22})"><rect x="-29" y="-9" width="58" height="18" rx="9" fill="#3a2c29" stroke="#FF6F59" stroke-width="1.2"/><text y="4" text-anchor="middle" font-size="10.5" font-weight="800" fill="#ffb3a6" letter-spacing=".04em">SPLICED</text></g></g>`; }
  }
  for (const p of parts) if (TS_PUSHED[p.L] && (p.t === 'coil' || p.t === 'con' || p.t === 'mst')) {   // (a relay pushed in by hand: tagged on its coil and contacts)
    const q = tsScreen(p.x, p.t === 'mst' ? p.y - PWR_H / 2 - 22 : p.t === 'coil' ? p.y - BOX / 2 - 50 : p.y + BOX / 2 + 12);
    if (q) h += tsTag(q, 'FORCED ON', p.t === 'con' ? .8 : 1);   // (on a coil, above its name; on a contact, just below it)
  }
  for (const p of parts) if (isLim(p) && TS_PUSHED['s:' + opKey(p)]) { const q = tsScreen(p.x, p.y + 100); if (q) h += tsTag(q, 'FORCED ON', .8); }   // (a switch forced on: just below it)
  // the leads: each plugged into its jack, its cable hanging from there to the probe (on its terminal, or resting
  // beside the meter while it is not on one)
  ['red', 'black'].forEach((c, i) => {
    const [jx, jy] = jack(c);
    // (on the circuit, a probe is drawn to the panel's scale, zoomed with it, and leans toward the meter, its cable's way)
    let t = tips[i], k = zk, ang = t ? Math.max(-40, Math.min(40, Math.atan2(jx - t[0], t[1] - jy) * 180 / Math.PI)) : 0;
    if (!t) { t = [mr.left - st.left - (c === 'red' ? 62 : 28), mr.bottom - st.top - 4]; ang = c === 'red' ? -14 : -4; k = 1; }
    const a = ang * Math.PI / 180, L = 84 * k, bx = t[0] + Math.sin(a) * L, by = t[1] - Math.cos(a) * L;   // (the probe's back end, where the cable goes in)
    const col = c === 'red' ? '#d42a2a' : '#232323', dk = c === 'red' ? '#7a1010' : '#000', hi = c === 'red' ? '#ff7a6e' : '#5a5a5a';
    // (the cable leaves the plug straight down and goes into the probe straight along it, each end's pull in proportion
    // to how far apart they are, so it sweeps round in one smooth curve with no kink where it meets the probe)
    const px = jx, py = jy + 22, far = Math.hypot(px - bx, py - by), sag = Math.min(Math.max(50, far * .35), Math.max(12, (st.height - 6 - py) * 4 / 3)), pull = Math.max(30 * k, far * .3);
    const d = `M${px} ${py} C${px} ${py + sag} ${bx + Math.sin(a) * pull} ${by - Math.cos(a) * pull} ${bx} ${by}`;
    cab += `<path d="${d}" fill="none" stroke="${dk}" stroke-width="${(5 + 2 * k).toFixed(2)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${(3 + 1.6 * k).toFixed(2)}" stroke-linecap="round"/>`;
    // the plug in the jack: its body hanging below it
    plugs += `<rect x="${jx - 6}" y="${jy + 2}" width="12" height="21" rx="3" fill="${col}" stroke="${dk}" stroke-width="1.2"/><path d="M${jx - 3.5} ${jy + 9}h7M${jx - 3.5} ${jy + 13}h7M${jx - 3.5} ${jy + 17}h7" stroke="${dk}" stroke-width="1"/><circle cx="${jx}" cy="${jy}" r="7.5" fill="${col}" stroke="${dk}" stroke-width="1.4"/><circle cx="${jx - 2.4}" cy="${jy - 2.6}" r="2.6" fill="${hi}" opacity=".8"/>`;
    // the probe: a steel tip, the finger guard, a ridged grip, the boot the cable goes into
    probes += `<g transform="translate(${t[0]} ${t[1]}) rotate(${ang}) scale(${k.toFixed(3)})">
      <path d="M-2.6 -22 L-2.2 -5 L0 0 L2.2 -5 L2.6 -22Z" fill="#e9edf0" stroke="#1a1a1a" stroke-width="1.1"/><path d="M-.6 -21 L-.5 -6" stroke="#fff" stroke-width="1"/>
      <rect x="-11" y="-28" width="22" height="7" rx="3" fill="${col}" stroke="${dk}" stroke-width="1.3"/>
      <rect x="-7.5" y="-70" width="15" height="43" rx="5" fill="${col}" stroke="${dk}" stroke-width="1.3"/>
      <path d="M-7 -60h14M-7 -55h14M-7 -50h14M-7 -45h14" stroke="${dk}" stroke-width="1.1" opacity=".55"/><rect x="-5" y="-68" width="3" height="38" rx="1.5" fill="#fff" opacity=".16"/>
      <path d="M-7 -70 L-4.5 -84 H4.5 L7 -70Z" fill="${col}" stroke="${dk}" stroke-width="1.2"/></g>`;
    probes += `<g class="ts-probe" data-lead="${c}" transform="translate(${t[0]} ${t[1]}) rotate(${ang}) scale(${Math.max(k, .6).toFixed(3)})"><rect x="-14" y="-90" width="28" height="92" rx="8" fill="transparent"/></g>`;   // (where a probe is picked up)
    if (tips[i] && !(D && D.c === c && D.moved)) probes += `<circle cx="${t[0]}" cy="${t[1]}" r="${(5 * k).toFixed(2)}" fill="none" stroke="#fff" stroke-width="${(2 * k).toFixed(2)}"/><circle cx="${t[0]}" cy="${t[1]}" r="${(2 * k).toFixed(2)}" fill="#fff"/>`;
  });
  const hc = D ? D.c : TSM.next, hv = D ? D.over : TSM.mode !== 'off' && TSM.hover;
  if (hv) { const s = tsScreen(hv.x, hv.y); if (s) h += `<circle cx="${s[0]}" cy="${s[1]}" r="13" fill="${hc === 'red' ? 'rgba(255,90,90,.25)' : 'rgba(230,233,236,.22)'}" stroke="${hc === 'red' ? '#ff6b6b' : '#e6e9ec'}" stroke-width="2.2"/>`; }
  // (the tags and the aim under the meter; the leads, cables, plugs and probes, over it: they lie across its front)
  ov.innerHTML = h; document.getElementById('ts-plugs').innerHTML = cab + plugs + probes;
}

// ---- the page's pieces, shown as they are now
const TSM_ANG = { off: -150, v: -90, ohm: -30, cont: 30 };
function tsShowMeter() {
  const m = document.getElementById('ts-meter'); if (!m) return;
  const rd = TSM.rd || tsRead();
  m.querySelector('.tsm-val').textContent = TSM.mode === 'off' ? '' : rd.text;
  m.querySelector('.tsm-unit').textContent = TSM.mode === 'off' ? '' : TSM.mode === 'cont' ? `${rd.unit}  •))` : rd.unit;
  m.querySelector('.tsm-lcd').classList.toggle('off', TSM.mode === 'off');
  m.querySelector('.tsm-knob').setAttribute('transform', `rotate(${TSM_ANG[TSM.mode]} 60 60)`);
  for (const b of m.querySelectorAll('[data-dial]')) b.classList.toggle('on', b.dataset.dial === TSM.mode);
  for (const b of m.querySelectorAll('.tsm-pick [data-lead]')) b.setAttribute('aria-pressed', String(b.dataset.lead === TSM.next));
}
function tsShowLog(scroll) {
  const L = document.getElementById('ts-log'); if (!L) return;
  L.innerHTML = TS.log.length ? TS.log.map((e, i) => `<li${e.r ? ' class="ts-rep"' : ''}><span class="ts-what">${i + 1}. ${esc(e.a)}${e.r ? '' : ` to ${esc(e.b)}`}${e.c ? ` <i>(${esc(e.c)})</i>` : ''}</span><b>${esc(e.v)}</b></li>`).join('')
    : '<li class="ts-empty">Every reading you take is kept here automatically, with what was going on at the time.</li>';
  if (scroll) L.scrollTop = L.scrollHeight;
  tsShowFoot();
}
const tsClock = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function tsShowFoot() { const f = document.getElementById('ts-foot'), n = (TS.repairs || []).length; if (f) f.textContent = `Readings: ${TS.log.filter(e => !e.r).length}${n ? ` · Repairs: ${n}` : ''} · Time: ${tsClock(Date.now() - TS.t0)}`; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function tsShowAll() {
  document.getElementById('ts-wo').innerHTML = WORK_ORDER ? `“${esc(WORK_ORDER)}”` : '<span class="ts-empty">No work order came with this circuit.</span>';
  document.getElementById('ts-name').textContent = (circuitName || 'Untitled circuit') + (TS.scen ? ` · Scenario ${TS.scen.hidden ? 'hidden' : TS.scen.n + 1}` : '');
  const cur = TS_STEPS.findIndex((_, i) => !TS.steps[i]);
  document.getElementById('ts-steps').innerHTML = TS_STEPS.map((s, i) => `<li><button type="button" data-step="${i}" class="${TS.steps[i] ? 'done' : i === cur ? 'cur' : ''}" aria-pressed="${!!TS.steps[i]}"><span class="ts-n">${TS.steps[i] ? '✓' : i + 1}</span>${s}</button></li>`).join('');
  document.getElementById('ts-steps-box').hidden = !TS.showSteps;
  const sb = document.getElementById('ts-steps-btn'); sb.setAttribute('aria-pressed', String(TS.showSteps)); sb.querySelector('span').textContent = `Six Steps: ${TS.showSteps ? 'On' : 'Off'}`;
  const lk = document.getElementById('ts-lock'); lk.setAttribute('aria-pressed', String(LOCKOUT)); lk.querySelector('span').textContent = LOCKOUT ? 'Remove Lock' : 'Lock Out';
  document.body.classList.toggle('ts-locked', LOCKOUT);
  const pb = document.getElementById('ts-push'); pb.setAttribute('aria-pressed', String(!!TSM.push)); pb.classList.toggle('needs-lock', !LOCKOUT); pb.dataset.tip = LOCKOUT ? pb.dataset.tip0 : 'Lock out first: a relay or switch is only ever forced on by hand with the power off and locked out';
  document.getElementById('stage').classList.toggle('ts-pushing', !!TSM.push);
  for (const [id, k, what] of [['ts-rep', 'part', 'a part is only ever replaced'], ['ts-wire', 'wire', 'a wire is only ever repaired']]) {
    const b = document.getElementById(id); b.setAttribute('aria-pressed', String(TSM.repair === k)); b.classList.toggle('needs-lock', !LOCKOUT);
    b.dataset.tip = LOCKOUT ? b.dataset.tip0 : `Lock out first: ${what} with the power off and locked out`;
  }
  document.getElementById('stage').classList.toggle('ts-repairing', !!TSM.repair);
  for (const b of document.querySelectorAll('#tsbar [data-meter]')) {
    const m = b.dataset.meter, need = (m === 'ohm' || m === 'cont') && !LOCKOUT;
    b.setAttribute('aria-pressed', String(TSM.mode === m)); b.classList.toggle('needs-lock', need);
    b.dataset.tip = need ? 'Lock out first: resistance and continuity are only ever measured with the power off and locked out' : b.dataset.tip0;
  }
  for (const b of document.querySelectorAll('#tsbar [data-tsmode]')) b.setAttribute('aria-pressed', String(mode === b.dataset.tsmode));
  tsShowMeter(); tsShowLog();
}

// ---- building the page
const TS_ICON = {
  v: '<svg viewBox="0 0 30 26"><rect x="5" y="2" width="20" height="22" rx="3" fill="#f2c230" stroke="#6b5310" stroke-width="1.2"/><rect x="8" y="5" width="14" height="6" rx="1" fill="#c9d6b3"/><text x="15" y="10" text-anchor="middle" font-size="5.6" font-weight="800" fill="#333">V~</text><circle cx="15" cy="17.5" r="4" fill="#2b2b2b"/></svg>',
  ohm: '<svg viewBox="0 0 30 26"><rect x="5" y="2" width="20" height="22" rx="3" fill="#f2c230" stroke="#6b5310" stroke-width="1.2"/><rect x="8" y="5" width="14" height="6" rx="1" fill="#c9d6b3"/><text x="15" y="10.3" text-anchor="middle" font-size="6.5" font-weight="800" fill="#333">Ω</text><circle cx="15" cy="17.5" r="4" fill="#2b2b2b"/></svg>',
  cont: '<svg viewBox="0 0 30 26"><rect x="5" y="2" width="20" height="22" rx="3" fill="#f2c230" stroke="#6b5310" stroke-width="1.2"/><rect x="8" y="5" width="14" height="6" rx="1" fill="#c9d6b3"/><path d="M12.5 6.5q1.6 1.5 0 3M15 5.5q2.6 2.5 0 5M17.5 4.7q3.5 3.3 0 6.6" fill="none" stroke="#333" stroke-width="1"/><circle cx="15" cy="17.5" r="4" fill="#2b2b2b"/></svg>',
  leads: '<svg viewBox="0 0 30 26" overflow="visible"><path d="M10 25.6C10.6 28 13.8 28.6 15 27.2" fill="none" stroke="#7a1010" stroke-width="1.9" stroke-linecap="round"/><path d="M10 25.6C10.6 28 13.8 28.6 15 27.2" fill="none" stroke="#d42a2a" stroke-width="1" stroke-linecap="round"/><path d="M20 25.6C19.4 28 16.2 28.6 15 27.2" fill="none" stroke="#000" stroke-width="1.9" stroke-linecap="round"/><path d="M20 25.6C19.4 28 16.2 28.6 15 27.2" fill="none" stroke="#3a3a3a" stroke-width="1" stroke-linecap="round"/><g transform="translate(7.4 12.5) rotate(-14) scale(1.35)"><path d="M-1.1 -8.6L-.9 -4.6H.9L1.1 -8.6L0 -11.4Z" fill="#eef1f3" stroke="#111" stroke-width=".5"/><rect x="-3.6" y="-4.9" width="7.2" height="2.1" rx="1" fill="#d42a2a" stroke="#7a1010" stroke-width=".55"/><rect x="-2.5" y="-3.2" width="5" height="10.4" rx="1.6" fill="#d42a2a" stroke="#7a1010" stroke-width=".55"/><path d="M-2.3 -.4h4.6M-2.3 1.6h4.6M-2.3 3.6h4.6" stroke="#7a1010" stroke-width=".45" opacity=".6"/><path d="M-2.3 7.1L-1.3 9.6H1.3L2.3 7.1Z" fill="#d42a2a" stroke="#7a1010" stroke-width=".5"/></g><g transform="translate(22.6 12.5) rotate(14) scale(1.35)"><path d="M-1.1 -8.6L-.9 -4.6H.9L1.1 -8.6L0 -11.4Z" fill="#eef1f3" stroke="#111" stroke-width=".5"/><rect x="-3.6" y="-4.9" width="7.2" height="2.1" rx="1" fill="#2a2a2a" stroke="#000" stroke-width=".55"/><rect x="-2.5" y="-3.2" width="5" height="10.4" rx="1.6" fill="#2a2a2a" stroke="#000" stroke-width=".55"/><path d="M-2.3 -.4h4.6M-2.3 1.6h4.6M-2.3 3.6h4.6" stroke="#000" stroke-width=".45" opacity=".6"/><path d="M-2.3 7.1L-1.3 9.6H1.3L2.3 7.1Z" fill="#2a2a2a" stroke="#000" stroke-width=".5"/></g></svg>',
  lock: '<svg viewBox="0 0 30 26"><rect x="7" y="11" width="16" height="13" rx="2.5" fill="#d62b2b" stroke="#6e1111" stroke-width="1.2"/><path d="M10.5 11V7.5a4.5 4.5 0 0 1 9 0V11" fill="none" stroke="#c9ced4" stroke-width="2.4"/><circle cx="15" cy="16.5" r="1.8" fill="#300"/><path d="M15 17v3" stroke="#300" stroke-width="1.6"/></svg>',
  push: '<svg viewBox="0 0 30 26"><rect x="4" y="13" width="22" height="10" rx="2" fill="#3a3d42" stroke="#8a96a3" stroke-width="1.1"/><rect x="10" y="9" width="10" height="6" rx="1.5" fill="#c9ced4"/><path d="M15 1v6" stroke="#f2c230" stroke-width="2.4" stroke-linecap="round"/><path d="M11.5 4.5L15 8l3.5-3.5" fill="none" stroke="#f2c230" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  replace: '<svg viewBox="0 0 30 26"><rect x="3" y="8" width="11" height="11" rx="2" fill="#3a3d42" stroke="#8a96a3" stroke-width="1.1"/><rect x="16" y="8" width="11" height="11" rx="2" fill="#3a3d42" stroke="#3fbf6a" stroke-width="1.6"/><path d="M7 6.5C9 2.5 19 2.5 21.5 6" fill="none" stroke="#FF6F59" stroke-width="2" stroke-linecap="round"/><path d="M19 3.6l2.8 2.6-3.6.9" fill="none" stroke="#FF6F59" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.2 13.6l1.8 1.8 3.2-3.6" fill="none" stroke="#3fbf6a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wire: '<svg viewBox="0 0 30 26"><path d="M2 13H28" stroke="#2b2b2b" stroke-width="5" stroke-linecap="round"/><path d="M2 13H28" stroke="#5b5f66" stroke-width="2.6" stroke-linecap="round"/><rect x="10" y="8.5" width="10" height="9" rx="2.5" fill="#FF6F59" stroke="#8a2d20" stroke-width="1"/><path d="M12.5 9v8M17.5 9v8" stroke="#8a2d20" stroke-width="1"/></svg>',
  test: '<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="10" fill="#1f6b3a" stroke="#3fbf6a" stroke-width="1.6"/><path d="M10 13.5l3.4 3.4 7-7.4" fill="none" stroke="#e8ffe9" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  steps: '<svg viewBox="0 0 30 26"><rect x="6" y="2" width="18" height="22" rx="2.5" fill="#2b2f34" stroke="#8a96a3" stroke-width="1.2"/><path d="M9 7.5l1.5 1.5 2.5-3M9 13.5l1.5 1.5 2.5-3" fill="none" stroke="#5ee08a" stroke-width="1.5"/><path d="M15 8h6M15 14h6M9 19.5h12" stroke="#c9ced4" stroke-width="1.4"/></svg>',
  open: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 5h5l2 2h7v9H3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  print: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M6 7V3h8v4M6 14H4V8h12v6h-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 11h8v6H6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};
function tsInit() {
  document.body.classList.add('ts');
  FAULTS_ON = true; FAULT_BADGES = false;
  document.title = document.title;   // (set by the build)
  // the header: Open Assignment and View Print
  const hdr = document.querySelector('.titlebar'), end = hdr.querySelector('.hdr-end');
  const tb = document.createElement('div'); tb.className = 'ts-hdr';
  tb.innerHTML = `<button type="button" class="filebtn" id="ts-open" data-tip="Open an assignment: a circuit file from the Circuit Builder with faults planted in it (or a circuit code)">${TS_ICON.open}Open Assignment</button>
    <button type="button" class="filebtn" id="ts-print" data-tip="View Print: the circuit as a NEMA ladder diagram, with wire numbers and line numbers, to troubleshoot from">${TS_ICON.print}View Print</button>
    <input type="file" id="ts-file" accept=".json,.html,.htm,.txt,application/json,text/html,text/plain" hidden>`;
  hdr.insertBefore(tb, end);
  document.getElementById('about-btn').dataset.tip = 'About the Fault Finder: who made it, and the license it is shared under';
  // the ribbon: a Troubleshoot tab first
  const run = document.getElementById('rt-run'), t = document.createElement('button');
  t.type = 'button'; t.className = 'rtab'; t.id = 'rt-ts'; t.textContent = 'Troubleshoot'; run.parentNode.insertBefore(t, run);
  run.textContent = 'Simulation';
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#rt-run, #rt-ts'); if (b) tsTab = b.id === 'rt-ts' ? 'ts' : 'run'; }, true);
  t.addEventListener('click', () => { if (document.body.classList.contains('ribbon-min') || document.body.classList.contains('fs')) document.body.classList.add('ribbon-peek'); showRibbon(); });
  const bar = document.createElement('div'); bar.className = 'rpanel'; bar.id = 'tsbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Troubleshoot'); bar.hidden = true;
  const mb = (m, label, tip) => `<button type="button" class="tool big" data-meter="${m}" data-tip="${tip}" data-tip0="${tip}">${TS_ICON[m]}<span>${label}</span><small class="ts-needs">Lock out first</small></button>`;
  bar.innerHTML = `<div class="tgroup"><span class="label">Meter</span>
      ${mb('v', 'Voltmeter', 'Voltmeter: the voltage between the two terminals the leads are on, on the live circuit')}
      ${mb('ohm', 'Ohmmeter', 'Ohmmeter: the resistance between the two terminals (locked out only)')}
      ${mb('cont', 'Continuity', 'Continuity: beeps when there is a way through between the two terminals (locked out only)')}
      <button type="button" class="tool big" id="ts-leads-off" data-tip="Take both leads off the circuit">${TS_ICON.leads}<span>Remove Leads</span></button></div>
    <div class="tgroup"><span class="label">Power</span><button type="button" class="tool big ts-lockbtn" id="ts-lock" aria-pressed="false" data-tip="Lock out the machine: every disconnect open and the control power off, as it must be before measuring resistance. Press again to take the lock off and power it up.">${TS_ICON.lock}<span>Lock Out</span></button><button type="button" class="tool big" id="ts-push" aria-pressed="false" data-tip="Force On: with the machine locked out, force a relay (click its coil or a contact) or a limit, pressure, temperature or flow switch into its worked position by hand, to check its contacts with the ohmmeter or continuity tester (click again to let it go)." data-tip0="Force On: with the machine locked out, force a relay (click its coil or a contact) or a limit, pressure, temperature or flow switch into its worked position by hand, to check its contacts with the ohmmeter or continuity tester (click again to let it go).">${TS_ICON.push}<span>Force On</span><small class="ts-needs">Lock out first</small></button></div>
    <div class="tgroup"><span class="label">Repair</span><button type="button" class="tool big" id="ts-rep" aria-pressed="false" data-tip="Replace Part: with the machine locked out, click a part to take it out and put in a new one" data-tip0="Replace Part: with the machine locked out, click a part to take it out and put in a new one">${TS_ICON.replace}<span>Replace Part</span><small class="ts-needs">Lock out first</small></button><button type="button" class="tool big" id="ts-wire" aria-pressed="false" data-tip="Repair Wire: with the machine locked out, click a wire where it is to be cut and spliced" data-tip0="Repair Wire: with the machine locked out, click a wire where it is to be cut and spliced">${TS_ICON.wire}<span>Repair Wire</span><small class="ts-needs">Lock out first</small></button><button type="button" class="tool big" id="ts-test" aria-pressed="false" data-tip="Test the Repair: with the lock off, run the machine as the work order says, then sign off on what you checked" data-tip0="Test the Repair: with the lock off, run the machine as the work order says, then sign off on what you checked">${TS_ICON.test}<span>Test the Repair</span></button></div>
    <div class="tgroup"><span class="label">Record</span><button type="button" class="tool big" id="ts-steps-btn" aria-pressed="true" data-tip="Show or hide the six troubleshooting steps">${TS_ICON.steps}<span>Six Steps: On</span></button></div>
    <div class="row"><span class="label">Pushbuttons</span><div class="seg" role="group" aria-label="Pushbutton mode">
      <button type="button" data-tsmode="click" data-tip="One click presses a momentary button; it lets go once the circuit settles">Click</button><button type="button" data-tsmode="hold" data-tip="A momentary button stays down only while you hold the mouse button down on it">Press and Hold</button><button type="button" data-tsmode="latch" data-tip="Click to Hold: a click holds a momentary button down (marked HELD DOWN) till you click it again, so you can take readings with it held">Click to Hold</button></div></div>
    <div class="tgroup"><span class="label">Simulation</span><button type="button" class="tool big reset" id="ts-reset" data-tip="Turn everything off and start the machine again (a blown fuse stays blown)"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14.4 2.8l.1 3.9-3.9.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Reset</span></button></div>`;
  document.getElementById('runbar').parentNode.insertBefore(bar, document.getElementById('runbar'));
  // every group on both tabs: its buttons in one box, centred across and down the group, its name along the bottom
  centreGroups(bar);
  document.getElementById('reset-btn').closest('.ts-g').hidden = true;   // (Reset is on the Troubleshoot tab)
  // the panel and, down its right, the work order, the six steps and the test log
  const stage = document.getElementById('stage'), main = document.createElement('div'); main.className = 'ts-main';
  stage.parentNode.insertBefore(main, stage); main.appendChild(stage);
  const side = document.createElement('aside'); side.className = 'ts-side'; side.id = 'ts-side';
  side.innerHTML = `<section class="ts-box"><h3>Work Order</h3><p class="ts-name" id="ts-name"></p><p class="ts-wo" id="ts-wo"></p><button type="button" class="ts-link" id="ts-sample">Open the sample assignment</button></section>
    <section class="ts-box" id="ts-steps-box"><h3>Six Steps <button type="button" class="ts-link ts-hide" id="ts-steps-hide" data-tip="Hide the six steps (Six Steps, on the Troubleshoot tab, brings them back)">Hide ×</button></h3><ol class="ts-steps" id="ts-steps"></ol></section>
    <section class="ts-box ts-logbox"><h3>Test Log</h3><ol class="ts-log" id="ts-log"></ol><p class="ts-foot" id="ts-foot"></p></section>`;
  main.appendChild(side);
  // the meter, over the panel, and its leads
  const ov = document.createElementNS(NS, 'svg'); ov.id = 'ts-leads'; ov.setAttribute('class', 'ts-leads'); stage.appendChild(ov);
  const pl = document.createElementNS(NS, 'svg'); pl.id = 'ts-plugs'; pl.setAttribute('class', 'ts-leads ts-plugs'); stage.appendChild(pl);
  const m = document.createElement('div'); m.id = 'ts-meter'; m.className = 'tsm';
  const lab = (k, txt, a, r) => { const x = 60 + r * Math.cos(a * Math.PI / 180), y = 60 + r * Math.sin(a * Math.PI / 180); return `<text data-dial="${k}" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${txt}</text>`; };
  m.innerHTML = `<div class="tsm-lcd"><span class="tsm-unit"></span><span class="tsm-val"></span></div>
    <svg class="tsm-dial" viewBox="0 0 120 120"><circle cx="60" cy="60" r="27" fill="#1f1f1f" stroke="#0c0c0c" stroke-width="2"/><g class="tsm-knob"><circle cx="60" cy="60" r="19" fill="#3a3a3a"/><rect x="77" y="57.5" width="10" height="5" rx="2" fill="#f2c230" transform="translate(-8 0)"/></g>
      ${lab('off', 'OFF', -150, 46)}${lab('v', 'V~', -90, 46)}${lab('ohm', 'Ω', -30, 46)}${lab('cont', '•)))', 30, 46)}</svg>
    <div class="tsm-pick" role="group" aria-label="Which lead a click on a terminal moves"><span>Lead</span><button type="button" data-lead="red" data-tip="A click on a terminal puts the red lead there (or drag either probe)">Red</button><button type="button" data-lead="black" data-tip="A click on a terminal puts the black lead there (or drag either probe)">Black</button></div>
    <div class="tsm-jacks"><span class="jack red" title="VΩ: the red lead"><i class="sock"></i>VΩ</span><span class="jack black" title="COM: the black lead"><i class="sock"></i>COM</span></div>`;
  stage.appendChild(m);
  // the box that asks which scenario, for an assignment with several
  const sd = document.createElement('dialog'); sd.id = 'ts-scen-dlg'; sd.className = 'ts-scen-dlg';
  sd.innerHTML = `<div class="dlg"><h2></h2><p class="hint">This assignment has <span class="ts-sc-n"></span> scenarios, each with its own fault. Which one do you want?</p>
    <div class="ts-sc-rand-wrap"><button type="button" class="primary ts-sc-rand">A Random Scenario</button><p class="ts-sc-note">Its number stays hidden: it is kept with your test log for your instructor.</p></div>
    <div class="ts-sc-num"><span class="ts-sc-or"></span><input type="number" min="1" step="1" inputmode="numeric" aria-label="Scenario number" placeholder="#"><button type="button" class="ts-sc-go">Open</button></div>
    <p class="ts-sc-msg" role="status"></p><div class="dlg-end"><button type="button" class="ts-sc-cancel">Cancel</button></div></div>`;
  document.body.appendChild(sd);
  // the box for signing off a repair (Test the Repair)
  const sg = document.createElement('dialog'); sg.id = 'ts-sign-dlg'; sg.className = 'ts-scen-dlg ts-sign-dlg';
  sg.innerHTML = `<div class="dlg"><h2>Test the Repair</h2><p class="hint">Take the lock off, power the machine up and run it as the work order says. Then tell us what you checked.</p>
    <p class="ts-sg-lock">The machine is still locked out: take the lock off (Remove Lock) and run it first.</p>
    <label class="ts-sg-chk"><input type="checkbox"> I took the lock off and powered the machine up</label>
    <label class="ts-sg-chk"><input type="checkbox"> I ran it the way the work order describes</label>
    <label class="ts-sg-chk"><input type="checkbox"> It now does what it should</label>
    <textarea maxlength="600" placeholder="What you did and what happened, e.g. Pressed START: X picked up and sealed in, RUN light on. Pressed STOP: it stopped."></textarea>
    <p class="ts-sc-note">Whether it is really fixed shows only in your hand-in report, for your instructor.</p>
    <div class="dlg-end"><button type="button" class="ts-sg-no">Not Yet</button><button type="button" class="primary ts-sg-go">It Works: Sign Off</button></div></div>`;
  document.body.appendChild(sg);

  // ---- what everything does
  document.getElementById('ts-open').addEventListener('click', () => document.getElementById('ts-file').click());
  document.getElementById('ts-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    try { if (f.size > 8e6) throw new Error('That file is too big to be a circuit.'); await tsOpenText(await f.text(), f.name); }
    catch (err) { tsSay('Could not open that file: ' + (err && err.message || err)); }
  });
  document.getElementById('ts-print').addEventListener('click', openPrint);
  document.getElementById('ts-sample').addEventListener('click', () => tsUse(tsSample(), 'Opened the sample assignment. Read the work order, then start troubleshooting.', true));
  for (const b of bar.querySelectorAll('[data-meter]')) b.addEventListener('click', () => tsMode(TSM.mode === b.dataset.meter ? 'off' : b.dataset.meter));
  for (const b of m.querySelectorAll('[data-dial]')) b.addEventListener('click', () => tsMode(b.dataset.dial));
  document.getElementById('ts-leads-off').addEventListener('click', () => { TSM.red = TSM.black = null; TSM.next = 'red'; TSM.sig = ''; tsShowMeter(); });
  for (const b of m.querySelectorAll('.tsm-pick [data-lead]')) b.addEventListener('click', () => { TSM.next = b.dataset.lead; TSM.key = ''; tsShowMeter(); });
  // a probe can be picked up and dragged onto any terminal (dropped anywhere else, it goes back beside the meter);
  // a click on it, without moving it, picks that lead for the next click on a terminal
  document.getElementById('ts-plugs').addEventListener('pointerdown', e => {
    const g = e.target.closest && e.target.closest('.ts-probe'); if (!g || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const c = g.dataset.lead, sr = stage.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    TSM.drag = { c, x: x0 - sr.left, y: y0 - sr.top, moved: false, over: null };
    const mv = ev => { const D = TSM.drag; if (!D) return; if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) D.moved = true;
      D.x = ev.clientX - sr.left; D.y = ev.clientY - sr.top; D.over = tsPick(ev.clientX, ev.clientY); TSM.key = ''; };
    const up = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      const D = TSM.drag; TSM.drag = null; TSM.key = ''; if (!D) return;
      if (!D.moved) { TSM.next = c; tsShowMeter(); return; }
      const q = tsPick(ev.clientX, ev.clientY); TSM[c] = q ? { ...q } : null; TSM.sig = '';
      if (q && !TSM[c === 'red' ? 'black' : 'red']) TSM.next = c === 'red' ? 'black' : 'red';
      tsShowMeter(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  document.getElementById('ts-lock').addEventListener('click', () => tsLockOut(!LOCKOUT));
  document.getElementById('ts-push').addEventListener('click', () => tsPushTool(!TSM.push));
  document.getElementById('ts-rep').addEventListener('click', () => tsRepairTool('part'));
  document.getElementById('ts-wire').addEventListener('click', () => tsRepairTool('wire'));
  document.getElementById('ts-test').addEventListener('click', tsTestRepair);
  document.getElementById('ts-reset').addEventListener('click', () => { startRun(); buildProcess(); paint(); });
  const steps = on => { TS.showSteps = on; tsSave(); tsShowAll(); };
  document.getElementById('ts-steps-btn').addEventListener('click', () => steps(!TS.showSteps));
  document.getElementById('ts-steps-hide').addEventListener('click', () => steps(false));
  document.getElementById('ts-steps').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (!b) return; const i = +b.dataset.step; TS.steps[i] = !TS.steps[i]; tsSave(); tsShowAll(); });
  for (const b of bar.querySelectorAll('[data-tsmode]')) b.addEventListener('click', () => tsPushMode(b.dataset.tsmode));
  // the leads: a click on a terminal puts the next lead there (red, then black, then red again...)
  stage.addEventListener('pointerdown', e => {
    if (editing || e.button !== 0 || e.target.closest('#ts-meter, .ts-probe, #ts-card')) return;
    if (TSM.repair) { e.preventDefault(); e.stopPropagation(); tsRepairClick(e); return; }   // (Replace Part or Repair Wire picked)
    const q = TSM.mode === 'off' ? null : tsPick(e.clientX, e.clientY);
    if (!q && TSM.push) {   // (Force On: a click on a relay's coil or contact, or on a switch)
      const g = e.target.closest && e.target.closest('[data-part]'), p = g && parts.find(x => String(x.id) === g.dataset.part);
      e.preventDefault(); e.stopPropagation();
      if (tsPushable(p)) tsPush(p.L, !TS_PUSHED[p.L]); else if (tsForceSw(p)) tsForceSwitch(p, !TS_PUSHED['s:' + opKey(p)]); else tsSay('Force On works on a relay or starter (its coil or a contact), or a limit, pressure, temperature or flow switch.');
      return;
    }
    if (!q) return;
    e.preventDefault(); e.stopPropagation(); tsPlace(q);
    if (TSM.mode === 'cont') tsBeep(false);   // (the audio can start only from a click)
  }, true);
  stage.addEventListener('pointermove', e => { const q = editing || TSM.mode === 'off' ? null : tsPick(e.clientX, e.clientY); if (q !== TSM.hover) { TSM.hover = q; stage.classList.toggle('ts-aim', !!q); } });
  stage.addEventListener('pointerleave', () => { TSM.hover = null; });
  // the meter can be dragged anywhere over the panel (by its case)
  m.addEventListener('pointerdown', e => {
    if (e.target.closest('[data-dial], [data-lead]')) return;
    e.preventDefault(); e.stopPropagation();
    const r = m.getBoundingClientRect(), sr = stage.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = ev => { m.style.left = Math.max(0, Math.min(sr.width - r.width, ev.clientX - sr.left - ox)) + 'px'; m.style.top = Math.max(0, Math.min(sr.height - r.height, ev.clientY - sr.top - oy)) + 'px'; m.style.right = m.style.bottom = 'auto'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  setInterval(tsShowFoot, 1000);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (document.getElementById('ts-card') || TSM.repair)) { if (document.getElementById('ts-card')) tsCardOff(); else { TSM.repair = null; tsShowAll(); } return; } if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') { e.preventDefault(); if (!document.querySelector('dialog[open]')) document.getElementById('ts-file').click(); } });

  // ---- start: the assignment from last time, or the sample
  let st = null; try { st = JSON.parse(localStorage.getItem(TS_KEY) || 'null'); } catch (_) {}
  let c = null; if (st && st.circuit) try { c = readCircuit(st.circuit); } catch (_) {}
  if (c) {
    TS = { log: Array.isArray(st.log) ? st.log : [], steps: Array.isArray(st.steps) ? st.steps : [], t0: +st.t0 || Date.now(), showSteps: st.showSteps !== false, scen: st.scen && typeof st.scen === 'object' ? st.scen : null, repairs: Array.isArray(st.repairs) ? st.repairs : [], signoff: st.signoff && typeof st.signoff === 'object' ? st.signoff : null };
    TS_BLOWN = st.blown && typeof st.blown === 'object' ? st.blown : {};
    tsUse(c, '', false);
  } else tsUse(tsSample(), '', true);
  // the keys on the buttons' tips (F1 lists them all)
  for (const [sel, id] of [['[data-meter="v"]', 'ts-v'], ['[data-meter="ohm"]', 'ts-ohm'], ['[data-meter="cont"]', 'ts-cont'], ['#ts-leads-off', 'ts-leads'], ['#ts-lock', 'ts-lock'], ['#ts-push', 'ts-push'], ['#ts-rep', 'ts-rep'], ['#ts-wire', 'ts-wire'], ['#ts-test', 'ts-test'],
    ['[data-tsmode="click"]', 'ts-click'], ['[data-tsmode="latch"]', 'ts-latch'], ['[data-tsmode="hold"]', 'ts-hold'], ['#ts-steps-btn', 'ts-steps'], ['#ts-reset', 'ts-reset'], ['[data-lead="red"]', 'ts-red'], ['[data-lead="black"]', 'ts-black']]) {
    const b = document.querySelector(sel); if (!b) continue;
    for (const k of ['tip', 'tip0']) if (b.dataset[k]) b.dataset[k] = b.dataset[k] + ` (${kn(id)})`;
  }
  showRibbon();
}
if (TS_MODE) tsInit();
