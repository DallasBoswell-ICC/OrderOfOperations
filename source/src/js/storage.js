/* ---------------- saving and opening circuits ----------------
   A circuit is saved as a small JSON file, or as a short text code (the same JSON, compressed) that can be pasted
   anywhere. The circuit being worked on is also kept in this browser, so it is still there after a reload.

   File/code contents:  { app: "order-of-operations-circuit-builder", v: 1, name, w, parts: [...], wires: [...] }
     w: where the L2 bar is (wire ends at x = w are on L2). Saved at the narrowest the circuit allows, so the same
        circuit saves the same whatever size the window is; it widens again to fill the screen it is opened on.
     parts: [type, x, y, letter, normallyClosed, maintained, colour, delay]
            (type "btn", "coil", "con" or "lamp"; a pilot light's letter is the button it is built into, or "";
            the eighth field: a timer's seconds (a timer is a coil), or 1 on a timer's instantaneous contact; the ninth:
            1 on an off-delay timer; the tenth: a button's or coil's label, written on it instead of its letter)
     wires: [x1, y1, x2, y2]                                            (straight runs, on the grid)            */
const APP_ID = 'order-of-operations-circuit-builder', AUTOSAVE_KEY = 'oo-circuit-builder:current';
let circuitName = '';
// (the print this circuit was opened from, and the circuit's fingerprint then: while the circuit is not changed,
// Open in Print Builder gives back that print exactly; Dallas, 19 Nov 2026)
let LINK_PRINT = null;
// (the speed this circuit starts at, kept in its file; null: none of its own. Dallas, 20 Nov 2026)
let CIRC_SPEED = null;

function circuitData() {
  if (typeof scenSync === 'function') scenSync();
  const w = W_USER ? W : contentRight(), x = v => barsOn() && v === W ? w : v;   // (a length set by moving the bars is kept)
  return {
    app: APP_ID, v: 1, name: circuitName || '', w, ...(W_USER ? { fw: 1 } : {}), ...(barsOn() ? {} : { pw: 'boxes' }), ...(SRC_COL !== SRC_DEFAULT ? { sc: SRC_COL } : {}), ...(PH_COL.join() !== PH_DEFAULT.join() ? { pc: PH_COL.map(c => c.slice(1)) } : {}),
    parts: parts.map(p => { if (p.t === 'stand') return ['stand', p.x, p.y, p.L || '', 0, 1, '', null, null, p.desc || '', { t: p.sym, r: p.srot || 0, o: p.st }];   // (a stand-in for a Print Builder part: what it stands for, kept whole)
      const a = [p.estop ? 'est' : p.t, p.x, p.y, p.L, p.nc ? 1 : 0, p.maint === false ? 0 : 1, (p.color || '').replace('#', '')]; if (isTimer(p)) { a.push(p.delay); if (p.tof) a.push(1); } if (p.t === 'con' && p.inst) a.push(1); if (p.t === 'lsw' && p.held) a.push(1); if (p.t === 'tsw' && p.low) a.push(1); if (turns7(p) && p.rot) a.push(p.rot); if (p.label) { while (a.length < 9) a.push(null); a.push(p.label); }
      if (p.t === 'sel') { while (a.length < 7) a.push(null); a.length = 7; a.push(selN(p), (p.closedIn || []).reduce((m, i) => m | 1 << i, 0), null, (p.names || []).join('/'), p.pos || 0); }   // a selector switch: positions, closed-in mask, (no label), names, start
      if (p.lk || p.ls) { while (a.length < 12) a.push(null); a.push(p.lk ? p.lk[0] : 0, p.lk ? p.lk[1] : 0); if (p.ls) a.push(p.ls.join('')); }   // (its dashed link line, moved out of the way; the sides its ends join)
      if (!turns7(p) && turns(p) && p.rot) { while (a.length < 15) a.push(null); a.push({ r: p.rot }); }   // (a two-ended part turned: its 16th)
      return a; }),
    wires: wires.map(q => { const a = [x(q.x1), q.y1, x(q.x2), q.y2]; if (WIRE_FAULTS[q.fault]) a.push(q.fault); return a; }),   // (a fault planted on a wire: its 5th)
    // (faults planted on parts: [part, fault]; the work order for the student)
    ...(parts.some(p => PART_FAULTS[p.fault] && canFault(p)) ? { fl: parts.map((p, i) => PART_FAULTS[p.fault] && canFault(p) ? [i, p.fault] : null).filter(Boolean) } : {}), ...(WORK_ORDER.trim() ? { wo: WORK_ORDER } : {}),
    // (scenarios, when there are several: each one's faults on parts [part, fault] and wires [wire, fault] and its work
    // order (sn), the one in force (si), and what the Fault Finder offers (ffo: random, a number given); the fields above are the one in force)
    ...(SCEN_N > 1 ? { sn: [...Array(SCEN_N).keys()].map(s => ({ fl: parts.map((p, i) => p.fz && PART_FAULTS[p.fz[s]] && canFault(p) ? [i, p.fz[s]] : null).filter(Boolean), wl: wires.map((q, i) => q.fz && WIRE_FAULTS[q.fz[s]] ? [i, q.fz[s]] : null).filter(Boolean), ...((SCEN_WO[s] || '').trim() ? { wo: SCEN_WO[s] } : {}) })), si: SCEN } : {}),
    ...(LINK_PRINT ? { pr: LINK_PRINT } : {}),
    ...(CIRC_SPEED ? { sp: CIRC_SPEED } : {}),
    ...(!FF_OFFER.r || !FF_OFFER.n ? { ffo: [FF_OFFER.r ? 1 : 0, FF_OFFER.n ? 1 : 0] } : {}),
    // (its process values: id, name, kind, unit, lowest, highest, start; and the switches they work: part, value, setting, reset, side)
    ...(PV.length ? { pv: PV.map(v => [v.id, v.name, v.kind, v.unit, v.min, v.max, v.start]), pd: parts.map((p, i) => isDrv(p) && pvOf(p) ? [i, p.pv, +p.rate || 0, +p.cool || 0, drvPer(p), p.dir === 'down' ? 'down' : 'up', drvOff(p)] : null).filter(Boolean), pl: parts.map((p, i) => pvLinked(p) ? [i, p.pv, +p.sp, +(p.rs ?? p.sp), p.side === 'lo' ? 'lo' : 'hi'] : null).filter(Boolean),
      ...(PV.some(v => v.pic) ? { pp: PV.filter(v => v.pic).map(v => [v.id, v.pic.x, v.pic.y]) } : {}), ...(parts.some(p => p.nopic) ? { pn: parts.map((p, i) => p.nopic ? i : -1).filter(i => i >= 0) } : {}) } : {}),
  };
}
// check a circuit read from a file or code, and turn it back into parts and wires (throws a readable message)
function readCircuit(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.parts) || !Array.isArray(d.wires)) throw new Error('That is not a circuit from the Circuit Builder.');
  if (d.app && d.app !== APP_ID) throw new Error('That file is from a different program.');
  if (d.v > 1) throw new Error('That circuit was saved by a newer version of the Circuit Builder.');
  const num = v => { const n = Number(v); if (!Number.isFinite(n)) throw new Error('The circuit is damaged (a position is not a number).'); return snap(n); };
  const hex = c => /^[0-9a-f]{6}$/i.test(c || '') ? '#' + c.toUpperCase() : null;
  const ps = d.parts.slice(0, 1000).map(a => {
    // (a stand-in for a Print Builder part Circuit Builder has none of: its symbol in a box, its terminals as the print had them)
    if (a[0] === 'stand') { const q = a[10] || {}, st = Array.isArray(q.o) ? q.o.slice(0, 12).filter(o => Array.isArray(o) && o.every(n => Number.isFinite(+n) && Math.abs(+n) <= 400)).map(o => [snap(+o[0]), snap(+o[1])]) : [];
      if (typeof q.t === 'string' && st.length) { const p = P('stand', snap(num(a[1])), snap(num(a[2])), { L: String(a[3] ?? '').slice(0, 12) }); p.sym = q.t.slice(0, 16); p.srot = [0, 90, 180, 270].includes(+q.r) ? +q.r : 0; p.st = st; p.desc = typeof a[9] === 'string' ? a[9].slice(0, 40) : ''; delete p.color; return p; } }
    const t = a[0] === 'coil' ? 'coil' : a[0] === 'con' ? 'con' : a[0] === 'lamp' ? 'lamp' : a[0] === 'sol' ? 'sol' : a[0] === 'htr' ? 'htr' : a[0] === 'jmp' ? 'jmp' : a[0] === 'xfm' ? 'xfm' : a[0] === 'sel' ? 'sel' : ['l1', 'l2', 'ph', 'dsc', 'fus', 'fu1', 'mst', 'olh', 'olc', 'mtr', 'lsw', 'tsw', 'psw', 'fsw'].includes(a[0]) ? a[0] : 'btn', L = String(a[3] || (t === 'lamp' || t === 'l1' || t === 'l2' ? '' : 'A')).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || (t === 'lamp' || t === 'l1' || t === 'l2' ? '' : 'A');
    const p = P(t, snap(num(a[1])), snap(num(a[2])), {   // (on the grid: a part saved off it, by an older version, could never be wired)
      L: ['dsc', 'fus', 'fu1', 'olh', 'olc', 'mtr', 'lsw', 'tsw', 'psw', 'fsw'].includes(t) ? String(Math.max(1, Math.min(999, Math.round(Number(a[3])) || 1))) : t === 'ph' ? String(Math.max(1, Math.min(3, Math.round(Number(a[3])) || 1))) : t === 'sol' || t === 'htr' || t === 'jmp' || t === 'xfm' ? String(Math.max(1, Math.min(999, Math.round(Number(a[3])) || 1))) : L, color: hex(a[6]) || (t === 'sol' ? SOL_COL : t === 'htr' ? HTR_COL : t === 'lamp' ? '#00B050' : t === 'coil' ? COIL_COL[L] || '#FFDC00' : t === 'sel' ? '#0070C0' : t === 'lsw' ? LSW_COL : t === 'tsw' ? TSW_COL : t === 'psw' ? PSW_COL : t === 'fsw' ? FSW_COL : BTN_COL[L] || '#FF0032') });
    if (t === 'lsw') { p.nc = !!a[4]; if (a[7] === 1) p.held = true; }
    if (t === 'psw' || t === 'fsw') p.nc = !!a[4];   // (a pressure or flow switch: NO or NC)
    if (t === 'tsw') { p.nc = !!a[4]; if (a[7] === 1) p.low = true; }   // (a temperature switch: NO or NC, high or low temperature)   // (a limit switch: NO or NC, held or not)
    if (t === 'btn') { p.nc = !!a[4]; p.maint = a[5] !== 0; if (a[0] === 'est') { p.estop = true; p.nc = true; p.maint = true; } }
    if (t === 'sel') {
      p.n = Math.max(2, Math.min(4, Math.round(Number(a[7])) || 3)); const m = Math.round(Number(a[8])) || 0;
      p.closedIn = [...Array(p.n).keys()].filter(i => m >> i & 1);
      const nm = typeof a[10] === 'string' ? a[10].split('/').map(s => s.trim().toUpperCase().slice(0, 5)).slice(0, p.n) : [];
      if (nm.some(Boolean)) p.names = nm;
      p.pos = Math.max(0, Math.min(p.n - 1, Math.round(Number(a[11])) || 0));
    }
    if ((t === 'btn' || t === 'sel' || t === 'lamp') && a.length >= 14) { const dx = Math.round(Number(a[12])) || 0, dy = Math.round(Number(a[13])) || 0; if (dx || dy) p.lk = [Math.max(-5000, Math.min(5000, dx)), Math.max(-5000, Math.min(5000, dy))]; if (/^[tblr]{2}$/.test(a[14] || '')) p.ls = [...a[14]]; }
    if (['l1', 'l2', 'ph', 'jmp', 'xfm', 'dsc', 'fus', 'fu1', 'mst', 'olh', 'olc', 'mtr'].includes(t)) delete p.color;
    if (t === 'olc') p.nc = true;
    if (t === 'jmp' || t === 'l1' || t === 'l2' || t === 'ph' || t === 'fu1') { const r = Math.round(Number(a[7])) || 0; if (r >= 1 && r <= 3) p.rot = r; }   // (turned)   // (a supply box has no colour of its own)
    if (a[15] && typeof a[15] === 'object' && [1, 2, 3].includes(+a[15].r) && twoEnded(p)) p.rot = +a[15].r;   // (a two-ended part turned)
    if (t === 'con') { p.nc = !!a[4]; delete p.color; if (a[7] === 1) p.inst = true; }   // (a timer's instantaneous contact)
    if (t === 'coil' && a[7] !== undefined) { const n = Math.round(Number(a[7])); if (n >= 1) { p.delay = Math.min(999, n); if (a[8] === 1) p.tof = true; } }   // a timer (a[8] = 1: off-delay)
    if ((t === 'btn' || t === 'coil') && typeof a[9] === 'string' && a[9].trim()) p.label = a[9].replace(/\s+/g, ' ').trim().slice(0, 8);   // (a label written on it)
    return p;
  });
  const fin = (x, d0) => Number.isFinite(Number(x)) ? Number(x) : d0;
  const pv = (Array.isArray(d.pv) ? d.pv.slice(0, 50) : []).filter(a => Array.isArray(a) && typeof a[0] === 'string' && PV_KINDS[a[2]]).map(a => {
    const v = { id: a[0].slice(0, 16), name: String(a[1] || PV_KINDS[a[2]][0]).slice(0, 30), kind: a[2], unit: String(a[3] ?? '').slice(0, 8), min: fin(a[4], 0), max: fin(a[5], 100), start: fin(a[6], 0) };
    if (v.max === v.min) v.max = v.min + 1; return v; });
  for (const a of Array.isArray(d.pl) ? d.pl : []) { const p = Array.isArray(a) && ps[a[0]], v = p && pv.find(q => q.id === a[1]);
    if (p && v && isLim(p) && PV_FOR[p.t] === v.kind) { p.pv = v.id; p.sp = fin(a[2], v.max); p.rs = fin(a[3], p.sp); if (p.t === 'lsw') p.side = a[4] === 'lo' ? 'lo' : 'hi'; } }
  for (const a of Array.isArray(d.pd) ? d.pd : []) { const p = Array.isArray(a) && ps[a[0]], v = p && pv.find(q => q.id === a[1]);
    if (p && v && isDrv(p) && (p.t !== 'htr' || v.kind === 'temperature')) Object.assign(p, { pv: v.id, rate: Math.max(0, fin(a[2], 1)), cool: Math.max(0, fin(a[3], 1)), per: a[4] === 'min' ? 'min' : 's', dir: a[5] === 'down' ? 'down' : 'up', off: a[6] === 'back' ? 'back' : 'hold' }); }
  for (const a of Array.isArray(d.ph) ? d.ph : []) { const p = Array.isArray(a) && ps[a[0]], v = p && pv.find(q => q.id === a[1]); if (p && v && p.t === 'htr' && v.kind === 'temperature') { p.pv = v.id; p.rate = Math.max(0, fin(a[2], 30)); p.cool = Math.max(0, fin(a[3], 10)); } }
  // (process pictures: placed on the panel (pp), and outputs whose picture is hidden (pn))
  for (const a of Array.isArray(d.pp) ? d.pp : []) { const v = Array.isArray(a) && pv.find(q => q.id === a[0]); if (v) v.pic = { x: snap(Math.max(0, Math.min(20000, fin(a[1], 0)))), y: snap(Math.max(0, Math.min(20000, fin(a[2], 0)))) }; }
  for (const i of Array.isArray(d.pn) ? d.pn : []) { const p = ps[i]; if (p && isDrv(p)) p.nopic = true; }
  const w = Math.max(d.fw ? BAR_MIN : W_MIN, Math.min(20000, d.w === undefined ? W_MIN : num(d.w)));
  const wAt = new Map();   // (each wire by its place in the file, for the scenarios' faults)
  const ws = d.wires.slice(0, 2000).map((a, i) => [num(a[0]), num(a[1]), num(a[2]), num(a[3]), WIRE_FAULTS[a[4]] ? a[4] : null, i])
    .filter(([x1, y1, x2, y2]) => (x1 === x2 || y1 === y2) && (x1 !== x2 || y1 !== y2))
    .map(([x1, y1, x2, y2, f, i]) => { const q = Wr(Math.min(w, Math.max(0, x1)), Math.max(0, y1), Math.min(w, Math.max(0, x2)), Math.max(0, y2)); if (f) q.fault = f; wAt.set(i, q); return q; });
  for (const a of Array.isArray(d.fl) ? d.fl : []) { const p = Array.isArray(a) && ps[a[0]]; if (p && canFault(p) && PART_FAULTS[a[1]]) p.fault = a[1]; }   // (faults planted on parts)
  // (scenarios: every one's faults kept on its parts and wires (fz); the one in force, as their faults)
  let sn = 1, si = 0, swo = null;
  if (Array.isArray(d.sn) && d.sn.length > 1) {
    const S = d.sn.slice(0, 20); sn = S.length; si = Math.max(0, Math.min(sn - 1, Math.round(Number(d.si)) || 0));
    for (const x of [...ps, ...ws]) { delete x.fault; delete x.fz; }
    S.forEach((s, k) => { if (!s || typeof s !== 'object') return;
      for (const a of Array.isArray(s.fl) ? s.fl : []) { const p = Array.isArray(a) && ps[a[0]]; if (p && canFault(p) && PART_FAULTS[a[1]]) (p.fz || (p.fz = {}))[k] = a[1]; }
      for (const a of Array.isArray(s.wl) ? s.wl : []) { const q = Array.isArray(a) && wAt.get(a[0]); if (q && WIRE_FAULTS[a[1]]) (q.fz || (q.fz = {}))[k] = a[1]; } });
    for (const x of [...ps, ...ws]) if (x.fz && x.fz[si]) x.fault = x.fz[si];
    swo = S.map(s => s && typeof s.wo === 'string' ? s.wo.slice(0, 400) : '');
  }
  const ffo = Array.isArray(d.ffo) && (d.ffo[0] || d.ffo[1]) ? { r: !!d.ffo[0], n: !!d.ffo[1] } : null;
  const pr = d.pr && typeof d.pr === 'object' && d.pr.pb && d.pr.pb.kind === 'o3-print' && typeof d.pr.fp === 'string' ? d.pr : null;
  const sp = Number.isFinite(+d.sp) && +d.sp >= 0.1 && +d.sp <= 300 ? +d.sp : null;
  return { sp, pr, sn, si, swo, ffo, wo: swo ? swo[si] : typeof d.wo === 'string' ? d.wo.slice(0, 400) : '', w, fixed: !!d.fw, power: d.pw === 'boxes' ? 'boxes' : 'bars', src: SRC_PAL.some(([, h]) => h === d.sc) ? d.sc : SRC_DEFAULT, ph: Array.isArray(d.pc) && d.pc.length === 3 && d.pc.every(hex) ? d.pc.map(hex) : [...PH_DEFAULT], pv, parts: ps, wires: ws, name: typeof d.name === 'string' ? d.name.slice(0, 60) : '' };
}
function useCircuit(c, how) {
  snapshot();
  PV = c.pv; parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; POWER = c.power; SRC_COL = c.src; PH_COL = c.ph; circuitName = c.name; LINK_PRINT = c.pr || null; CIRC_SPEED = c.sp || null; startSpeed(); scenFrom(c); normalize(); sel = null;
  fitView(); fit(true);
  say(how);
  if (editing) draw(); else { NET = network(); draw(); startRun(); afterRunStart(); }
}

// ---- short codes: "OO1." + compressed JSON in URL-safe base64 (or "OO0." + plain JSON where compression is missing)
const b64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
async function encodeCircuit() {
  const json = new TextEncoder().encode(JSON.stringify(circuitData()));
  if (typeof CompressionStream === 'function') { try { return 'OO1.' + b64(await pipe(json, new CompressionStream('deflate-raw'))); } catch (_) {} }
  return 'OO0.' + b64(json);
}
async function decodeCircuit(text) {
  const t = String(text || '').trim().replace(/\s+/g, '');
  if (!t) throw new Error('Paste a circuit code first.');
  if (t.startsWith('{')) return readCircuit(JSON.parse(t));
  const m = /^OO([01])\.([A-Za-z0-9_-]+)$/.exec(t);
  if (!m) throw new Error('That does not look like a circuit code. It should start with OO1.');
  let bytes;
  try { bytes = unb64(m[2]); } catch (_) { throw new Error('The code is incomplete or has been changed. Copy it again.'); }
  if (m[1] === '1') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed codes. Try an up-to-date browser.');
    try { bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); } catch (_) { throw new Error('The code is incomplete or has been changed. Copy it again.'); }
  }
  let d; try { d = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw new Error('The code is incomplete or has been changed. Copy it again.'); }
  return readCircuit(d);
}

// ---- files
/* Where the browser allows it (Chrome and Edge, with the Circuit Builder opened as its own page), the page keeps
   hold of the file a circuit was opened from or saved to, and Save writes straight back into that same file.
   Elsewhere (other browsers, or inside another page such as Claude) Save hands over a new copy to download. */
let fileHandle = null, savedJSON = null;
const FILE_TYPES = [{ description: 'Circuit', accept: { 'application/json': ['.json'] } }];
const canUseFiles = () => typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function' && window.self === window.top;
const fileName = () => (circuitName || 'circuit').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) + '.json';
const fileText = () => JSON.stringify(circuitData(), null, 1);
const isDirty = () => JSON.stringify(circuitData()) !== savedJSON;
function markSaved() { savedJSON = JSON.stringify(circuitData()); showFileLabel(); }
function forgetFile() { fileHandle = null; savedJSON = null; showFileLabel(); }
async function downloadCopy() {
  const data = fileText(), name = fileName();
  // inside Claude the page asks the viewer to confirm the download; anywhere else it is an ordinary download
  const downloads = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (downloads) {
    try { await downloads.save({ filename: name, data }); markSaved(); return 'Saved ' + name + '.'; }
    catch (e) { return e && e.code === 'declined' ? 'Not saved.' : 'Saving a file is not available here. Use Copy code instead.'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  markSaved();
  return 'Saved ' + name + ' to your downloads.';
}
// save: into the file this circuit came from, or (asNew, or no file yet) a file the user picks
async function saveToFile(asNew) {
  if (!canUseFiles()) return downloadCopy();
  try {
    if (!fileHandle || asNew) fileHandle = await window.showSaveFilePicker({ suggestedName: fileName(), types: FILE_TYPES });
    if (!circuitName) circuitName = fileHandle.name.replace(/\.json$/i, '');
    const w = await fileHandle.createWritable(); await w.write(fileText()); await w.close();
    markSaved();
    return 'Saved to ' + fileHandle.name + '.';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'Not saved.';
    if (e && (e.name === 'SecurityError' || e.name === 'NotAllowedError')) return downloadCopy();
    return 'Could not save: ' + (e && e.message || e);
  }
}
async function openFile(file, handle) {
  if (!file) return;
  if (file.size > 8e6) throw new Error('That file is too big to be a circuit.');
  const text = await file.text();
  // a locked simulator: the circuit built into it (opened here, it can be changed and saved again)
  const sim = /<script id="oo-locked" type="application\/json">([\s\S]*?)<\/script>/.exec(text);
  if (sim) {
    let d; try { d = JSON.parse(sim[1]); } catch (_) { throw new Error('That simulator file is damaged.'); }
    const c = readCircuit(d.circuit);
    useCircuit(c, `Opened the circuit from the simulator ${c.name || file.name}. Save it to keep your changes, and Save as simulator again to hand it out.`);
    forgetFile(); return;
  }
  let d; try { d = JSON.parse(text); } catch (_) { throw new Error(/^\s*</.test(text) ? 'That page is not a simulator saved from the Circuit Builder.' : 'That file is not a saved circuit.'); }
  // a print from Print Builder: built as a circuit (a new one: Save makes a file of its own)
  if (d && d.kind === 'o3-print') { openFromPrint(d, file.name.replace(/(\.o3print)?\.json$/i, '')); forgetFile(); return; }
  const c = readCircuit(d);
  if (!c.name) c.name = file.name.replace(/\.json$/i, '');
  useCircuit(c, `Opened ${c.name || 'the circuit'}.`);
  fileHandle = handle || null; markSaved();
}
// ---- Print Builder's work (O³ link): a print, built as a circuit, and a note of what changed to fit
const LINK_DEMO = 'oo-circuit-builder:'.includes('-demo');   // (the demo build's storage keys say -demo: it opens the demo Print Builder)
const PB_URL = LINK_DEMO ? '../print-builder/demo/' : 'print-builder/';
function openFromPrint(doc, fname) {
  const r = printToCircuit(doc), c = readCircuit(r.data);
  const title = (((doc.tb || {}).fields || []).find(f => /title/i.test(f.label)) || {}).value;
  if (!c.name || (!r.notes.same && c.name === 'Print')) c.name = title || fname || 'Circuit';
  useCircuit(c, r.notes.same ? `Opened ${c.name}, back from Print Builder unchanged.` : `Opened ${c.name} from Print Builder.`);
  { const now = circuitData(), same = Array.isArray(r.idx) && r.idx.length === now.parts.length && now.parts.every((a, i) => r.data.parts[i] && r.data.parts[i][0] === a[0]);
    LINK_PRINT = { pb: JSON.parse(JSON.stringify(doc)), fp: linkCircuitFingerprint(now), ...(same ? { c0: { pw: now.pw, w: now.w, parts: now.parts, wires: now.wires }, ix: r.idx } : {}) }; }
  showLinkNote(c, r.notes);
}
function showLinkNote(c, n) {
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const list = (h, xs) => xs.length ? `<h3>${h} (${xs.length})</h3><ul>${xs.map(x => '<li>' + esc(x) + '</li>').join('')}</ul>` : '';
  document.getElementById('link-body').innerHTML = `<p>“${esc(c.name)}”: ${c.parts.length} parts and ${c.wires.length} wires, ${n.same ? 'exactly as it was before it went to Print Builder.' : 'built as a circuit you can run.'}</p>`
    + list('Changed to fit Circuit Builder', n.changed) + list('Left out, or missing on the print', n.left)
    + (n.same ? '' : '<p class="hint" style="margin-top:8px">Check the timers’ times and the lights’ colours on each part’s tab before running it.</p>');
  document.getElementById('link-dlg').showModal();
}
// Export: a window with each other O³ program this circuit can open in
const exportDlg = document.getElementById('export-dlg');
document.getElementById('export-btn').addEventListener('click', () => { document.getElementById('export-msg').textContent = ''; exportDlg.showModal(); });
document.getElementById('export-pb').addEventListener('click', () => {
  const m = linkHandOff('circuit', circuitData(), PB_URL);
  if (m) document.getElementById('export-msg').textContent = m; else { exportDlg.close(); toast('Opened in Print Builder, in a new tab.'); }
});
document.getElementById('save-pb').addEventListener('click', () => {
  const m = linkHandOff('circuit', circuitData(), PB_URL);
  document.getElementById('copy-msg').textContent = m || 'Opened in Print Builder, in a new tab.';
  if (!m) { saveDlg.close(); toast('Opened in Print Builder, in a new tab.'); }
});
async function pickAndOpen() {
  if (canUseFiles()) {
    try { const [h] = await window.showOpenFilePicker({ types: FILE_TYPES }); await openFile(await h.getFile(), h); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; if (!(e && (e.name === 'SecurityError' || e.name === 'NotAllowedError'))) throw e; }
  }
  document.getElementById('open-input').click();   // the ordinary file chooser (Save will then make a new copy)
  return false;
}

// ---- kept in this browser between visits
let autosaveTimer = 0;
function scheduleAutosave() {
  if (LOCKED || TS_MODE) return;   // (a locked simulator never keeps anything, nor touches the Builder's own saved circuit)
  showFileLabel();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(circuitData())); } catch (_) {} }, 400);
}
function restoreAutosave() {
  try { const t = localStorage.getItem(AUTOSAVE_KEY); if (!t) return false; const c = readCircuit(JSON.parse(t)); PV = c.pv; parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; POWER = c.power; SRC_COL = c.src; PH_COL = c.ph; circuitName = c.name; LINK_PRINT = c.pr || null; CIRC_SPEED = c.sp || null; startSpeed(); scenFrom(c); normalize(); return true; }
  catch (_) { return false; }
}

// ---- which file is open, whether it has unsaved changes, and a short "Saved" notice
function showFileLabel() {
  const lab = document.getElementById('file-label'); if (!lab) return;
  const dirty = savedJSON !== null && isDirty();
  lab.hidden = !fileHandle;
  lab.textContent = fileHandle ? (dirty ? '● ' : '') + fileHandle.name : '';
  lab.title = fileHandle ? (dirty ? 'Changes not saved yet: press Save (Ctrl+S) to write them into ' : 'All changes saved in ') + fileHandle.name : '';
  lab.classList.toggle('dirty', dirty);
  document.getElementById('save-btn').dataset.tip = fileHandle ? `Save into ${fileHandle.name} (Ctrl+S)` : 'Save this circuit as a file, or copy a short code you can paste anywhere (Ctrl+S)';
}
let toastTimer = 0;
function toast(text) {
  const t = document.getElementById('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---- the Save and Open buttons and dialogs
const saveDlg = document.getElementById('save-dlg'), openDlg = document.getElementById('open-dlg');
async function openSaveDialog() {
  document.getElementById('save-name').value = circuitName;
  document.getElementById('copy-msg').textContent = 'Paste it into an email, a document or your class page. Anyone can open it with Open → Paste a code.';
  document.getElementById('save-code').value = await encodeCircuit();
  const same = document.getElementById('save-same'), asNew = document.getElementById('save-file');
  same.hidden = !fileHandle; if (fileHandle) same.textContent = 'Save into ' + fileHandle.name;
  asNew.textContent = fileHandle ? 'Save as a new file…' : canUseFiles() ? 'Save as a file…' : 'Save as a file';
  asNew.classList.toggle('primary', !fileHandle);
  document.getElementById('save-file-hint').textContent = canUseFiles()
    ? 'After the first save, Save writes your changes back into the same file.'
    : 'A small .json file you can hand out, collect or open again later. This browser saves a new copy each time.';
  saveDlg.showModal();
}
// the Save button (and Ctrl+S): straight into the open file if there is one, otherwise the Save box
async function quickSave() {
  if (fileHandle) toast(await saveToFile(false));
  else openSaveDialog();
}
document.getElementById('save-btn').addEventListener('click', quickSave);
document.getElementById('save-more').addEventListener('click', openSaveDialog);
document.getElementById('save-name').addEventListener('input', async e => {
  circuitName = e.target.value.trim(); scheduleAutosave();
  document.getElementById('save-code').value = await encodeCircuit();
});
document.getElementById('save-same').addEventListener('click', async () => { const m = await saveToFile(false); document.getElementById('copy-msg').textContent = m; if (/^Saved/.test(m)) { saveDlg.close(); toast(m); } });
document.getElementById('save-file').addEventListener('click', async () => { const m = await saveToFile(true); document.getElementById('copy-msg').textContent = m; if (/^Saved/.test(m) && canUseFiles()) { saveDlg.close(); toast(m); } });
document.getElementById('copy-code').addEventListener('click', async () => {
  const ta = document.getElementById('save-code'), msg = document.getElementById('copy-msg');
  try { await navigator.clipboard.writeText(ta.value); msg.textContent = 'Copied. Paste it wherever you like.'; }
  catch (_) { ta.focus(); ta.select(); msg.textContent = 'The code is selected: press Ctrl+C (or ⌘C) to copy it.'; }
});
document.getElementById('open-btn').addEventListener('click', () => {
  document.getElementById('open-code').value = ''; document.getElementById('open-msg').textContent = '';
  openDlg.showModal();
});
document.getElementById('open-file').addEventListener('click', async () => {
  try { if (await pickAndOpen()) openDlg.close(); } catch (err) { document.getElementById('open-msg').textContent = err.message; }
});
document.getElementById('open-input').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  try { await openFile(f, null); openDlg.close(); } catch (err) { document.getElementById('open-msg').textContent = err.message; }
});
document.getElementById('open-code-btn').addEventListener('click', async () => {
  try { const c = await decodeCircuit(document.getElementById('open-code').value); useCircuit(c, `Opened ${c.name || 'the circuit'}.`); forgetFile(); openDlg.close(); }
  catch (err) { document.getElementById('open-msg').textContent = err.message; }
});
document.addEventListener('keydown', e => {
  if (LOCKED || TS_MODE) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (!saveDlg.open && !openDlg.open) quickSave(); }
});
// drop a saved file straight onto the panel (in Chrome and Edge, Save then writes back into that file)
{
  const stage = document.getElementById('stage');
  stage.addEventListener('dragover', e => { if (!LOCKED && !TS_MODE && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); stage.classList.add('dropping'); } });
  stage.addEventListener('dragleave', () => stage.classList.remove('dropping'));
  stage.addEventListener('drop', async e => {
    stage.classList.remove('dropping');
    const item = e.dataTransfer.items && e.dataTransfer.items[0], f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
    e.preventDefault();
    let handle = null;
    if (canUseFiles() && item && item.getAsFileSystemHandle) { try { const h = await item.getAsFileSystemHandle(); if (h && h.kind === 'file') handle = h; } catch (_) {} }
    try { await openFile(f, handle); } catch (err) { say(err.message); toast(err.message); }
  });
}

/* ---- a locked simulator: this same page, with the circuit built in, that opens straight into Run mode with nothing
   for changing the circuit (no Build mode, toolbar, Start from, Save or Open). Students can press the buttons, change
   the speed and reset it. It is one self-contained .html file, like the Builder itself. */
const escHtml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function simulatorHTML() {
  const name = circuitName || 'Circuit';
  const data = JSON.stringify({ circuit: circuitData() }).replace(/</g, '\\u003c');
  let html = PAGE_HTML;
  const at = html.indexOf('<script>');   // (the page's script: the first one, as the code after it mentions the tag too)
  if (!html || at < 0) throw new Error('This page cannot make a simulator from here.');
  html = html.slice(0, at) + `<script id="oo-locked" type="application/json">${data}<\/script>\n` + html.slice(at);   // (written <\/script> so it never ends this page's own script)
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(name)}</title>`);
}
async function saveSimulator() {
  const name = (circuitName || 'Circuit').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) + ' (simulator).html';
  let html; try { html = simulatorHTML(); } catch (e) { return e.message; }
  const downloads = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (downloads) {
    try { await downloads.save({ filename: name, data: html }); return 'Saved ' + name + '.'; }
    catch (e) { return e && e.code === 'declined' ? 'Not saved.' : 'Saving a file is not available here.'; }
  }
  if (canUseFiles()) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Simulator', accept: { 'text/html': ['.html'] } }] });
      const w = await h.createWritable(); await w.write(html); await w.close(); return 'Saved the simulator as ' + h.name + '.';
    } catch (e) { if (e && e.name === 'AbortError') return 'Not saved.'; if (!(e && (e.name === 'SecurityError' || e.name === 'NotAllowedError'))) return 'Could not save: ' + (e && e.message || e); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'Saved ' + name + ' to your downloads.';
}
document.getElementById('save-sim').addEventListener('click', async () => { const m = await saveSimulator(); document.getElementById('copy-msg').textContent = m; if (/^Saved/.test(m)) { saveDlg.close(); toast(m); } });
