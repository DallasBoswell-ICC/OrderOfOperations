/* =====================================================================
   drawing
   ===================================================================== */
const NS = 'http://www.w3.org/2000/svg', svg = document.getElementById('svg');
// (everything on the panel goes into one group, WORLD, so it can also be shown in a second view: see views.js)
let WORLD = null;
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || WORLD || svg).appendChild(e); return e; }
function hexPath(cx, cy, R, r) {
  const Q = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; Q.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  let d = '';
  for (let k = 0; k < 6; k++) { const p = Q[k], pv = Q[(k + 5) % 6], nx = Q[(k + 1) % 6], f = r / R;
    const a1 = [p[0] + (pv[0] - p[0]) * f, p[1] + (pv[1] - p[1]) * f], a2 = [p[0] + (nx[0] - p[0]) * f, p[1] + (nx[1] - p[1]) * f];
    d += (k ? ' L ' : 'M ') + a1[0].toFixed(2) + ' ' + a1[1].toFixed(2) + ' Q ' + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + ' ' + a2[0].toFixed(2) + ' ' + a2[1].toFixed(2); }
  return d + ' Z';
}
const DEFS = `
  <linearGradient id="gWell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#303030"/><stop offset="1" stop-color="#1f1f1f"/></linearGradient>
  <radialGradient id="gEsHead" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#ff6a6a"/><stop offset=".45" stop-color="#e3001b"/><stop offset="1" stop-color="#7d000f"/></radialGradient>
  <radialGradient id="gEsHeadIn" cx="45%" cy="40%" r="75%"><stop offset="0" stop-color="#d4202e"/><stop offset=".55" stop-color="#a5000f"/><stop offset="1" stop-color="#5a0008"/></radialGradient>
  <radialGradient id="gEsPlate" cx="45%" cy="35%" r="80%"><stop offset="0" stop-color="#ffe866"/><stop offset=".7" stop-color="#ffc800"/><stop offset="1" stop-color="#c99400"/></radialGradient>
  <linearGradient id="gGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>
  <radialGradient id="gFace" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d2d2d2"/></radialGradient>
  <radialGradient id="gDome" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
  <linearGradient id="gWin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset=".35" stop-color="#0b0b0b"/><stop offset="1" stop-color="#161616"/></linearGradient>
  <filter id="fShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="#000" flood-opacity=".55"/></filter>
  <pattern id="grid" width="${G}" height="${G}" patternUnits="userSpaceOnUse"><path d="M ${G} 0 L 0 0 0 ${G}" fill="none" stroke="#4b4b4b" stroke-width="1"/></pattern>
  <pattern id="gridMajor" width="${G * 5}" height="${G * 5}" patternUnits="userSpaceOnUse"><rect width="${G * 5}" height="${G * 5}" fill="url(#grid)"/><path d="M ${G * 5} 0 L 0 0 0 ${G * 5}" fill="none" stroke="#555" stroke-width="1.4"/></pattern>
  <linearGradient id="gBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a7a4a"/><stop offset=".45" stop-color="#d9c27a"/><stop offset="1" stop-color="#7a6a3c"/></linearGradient>
  <filter id="fGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
  <linearGradient id="gTerm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4d4d4"/><stop offset=".5" stop-color="#a3a3a3"/><stop offset="1" stop-color="#6e6e6e"/></linearGradient>
  <radialGradient id="gChrome" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#fafafa"/><stop offset=".5" stop-color="#bdbdbd"/><stop offset="1" stop-color="#6a6a6a"/></radialGradient>
  <radialGradient id="gKnob" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#5a5a5a"/><stop offset="1" stop-color="#262626"/></radialGradient>
  <linearGradient id="gPipe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dde2"/><stop offset="1" stop-color="#626870"/></linearGradient>
  <linearGradient id="gPaddle" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f3f5"/><stop offset=".55" stop-color="#b9c0c7"/><stop offset="1" stop-color="#7f868e"/></linearGradient>
  <linearGradient id="gPipeLow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#767c84"/><stop offset="1" stop-color="#626870"/></linearGradient>
  <linearGradient id="gFlange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4d8dd"/><stop offset="1" stop-color="#6b7179"/></linearGradient>
  <linearGradient id="gWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb0ff"/><stop offset=".55" stop-color="#1f7fe6"/><stop offset="1" stop-color="#0f4f9e"/></linearGradient>
  <radialGradient id="gStud" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#e8e8e8"/><stop offset=".6" stop-color="#9a9a9a"/><stop offset="1" stop-color="#5a5a5a"/></radialGradient>`;
// a square screw terminal (a little wider than the wire's channel, and than the bar it sits on), centred at x, y.
// The screw has a combination head: a slot right across it for a flat screwdriver, and a cross for a Phillips
// (bare: the screw head alone, without the square terminal round it, as the operator station's corner screws)
function screw(x, y, g, bare) {
  if (!bare) {
    el('rect', { x: x - 13, y: y - 13, width: 26, height: 26, rx: 3, fill: 'url(#gTerm)', stroke: '#2a2a2a', 'stroke-width': 1.2 }, g);
    el('rect', { x: x - 10.4, y: y - 10.4, width: 20.8, height: 20.8, rx: 2, fill: 'none', stroke: 'rgba(0,0,0,.28)', 'stroke-width': 1 }, g);
  }
  el('circle', { cx: x, cy: y, r: 8.6, fill: 'url(#gStud)', stroke: '#3a3a3a', 'stroke-width': 1 }, g);
  el('rect', { x: x - 8.6, y: y - 1.2, width: 17.2, height: 2.4, fill: '#2a2a2a' }, g);   // the flat slot, right across the head
  el('rect', { x: x - 1.2, y: y - 4.2, width: 2.4, height: 8.4, fill: '#2a2a2a' }, g);     // with it, a short cross arm: the Phillips recess
  el('rect', { x: x - 2.4, y: y - 2.4, width: 4.8, height: 4.8, fill: '#2a2a2a', transform: `rotate(45 ${x} ${y})` }, g);   // its deeper centre
  return g;
}
const BAR = 22;   // the L1 and L2 connection bars along the left and right edges
const BAR_HANDLE_Y = 14, BAR_HANDLE_H = 46;   // the grab handle at the top of each bar (Build mode)
// a button's or coil's own label, when no other button or coil has it (then it names the part in place of its
// letter: on its caption, its contacts' and its light's, and on the print); otherwise ''
const devLabel = (t, L) => { const q = parts.find(p => p.t === t && p.L === L && p.label && p.label.trim()); return q ? q.label.trim() : ''; };
const uniqueLabel = (t, L) => { const s = devLabel(t, L); if (!s) return ''; const k = s.toUpperCase();
  return parts.some(p => (p.t === 'btn' || p.t === 'coil') && p.label && p.label.trim().toUpperCase() === k && !(p.t === t && p.L === L)) ? '' : s; };
const idOf = p => uniqueLabel(p.t === 'con' ? 'coil' : p.t === 'lamp' ? 'btn' : p.t, p.L) || p.L;
/* an emergency stop: a yellow legend plate, the NC pushbutton's hexagon with its corners rounded the same, EMERGENCY
   round the top and STOP round the bottom (both reading upright, centred in the band between the head and the plate's
   edge), and a red mushroom head with the button's letter. Latched in, the head darkens and drops in, and a badge of
   three arrows going round anticlockwise (twist to release) shows on the top right corner. */
const ES_PLATE = BOX / 2 * 1.08, ES_HEAD = 16.5, ES_FONT = 7.4;
let esN = 0;
function drawEstop(p, v, x, y, g) {
  const R = ES_PLATE, ap = R * Math.cos(Math.PI / 6);   // (the plate's apothem: how far its flat sides are from the middle)
  framed('path', { d: hexPath(x, y, R, R * .17), fill: 'url(#gEsPlate)', stroke: '#7a5d00', 'stroke-width': 1.3 }, g);
  // (the band the legend sits in, between the head and the plate's flat sides; a capital's height is about .72 of the font's)
  const mid = (ES_HEAD + 2 + ap - 1.5) / 2, cap = ES_FONT * .72, rt = mid - cap / 2, rb = mid + cap / 2, id = 'es' + (++esN);
  const defs = el('defs', {}, g);
  el('path', { id: id + 't', d: `M ${x - rt} ${y} A ${rt} ${rt} 0 0 1 ${x + rt} ${y}` }, defs);   // (over the top, left to right: the letters stand out from it)
  el('path', { id: id + 'b', d: `M ${x - rb} ${y} A ${rb} ${rb} 0 0 0 ${x + rb} ${y}` }, defs);   // (under the bottom, left to right: they stand in from it, upright)
  for (const [k, s, sp] of [['t', 'EMERGENCY', .7], ['b', 'STOP', 2.2]]) {
    const t = el('text', { 'font-size': ES_FONT, 'font-weight': 800, 'letter-spacing': sp, fill: '#1a1a1a', class: 'eslegend' }, g);
    const tp = el('textPath', { href: '#' + id + k, startOffset: '50%', 'text-anchor': 'middle' }, t); tp.textContent = s;
  }
  v.press = el('g', {}, g);
  v.fill = el('circle', { cx: x, cy: y, r: ES_HEAD, fill: v.sec ? v.secFill : 'url(#gEsHead)', stroke: v.sec ? ESTOP_COL : '#4a0008', 'stroke-width': v.sec ? 1.8 : 1.1, filter: 'url(#fShadow)' }, v.press);
  v.shine = el('ellipse', { cx: x - ES_HEAD * .25, cy: y - ES_HEAD * .38, rx: ES_HEAD * .5, ry: ES_HEAD * .26, fill: '#fff', opacity: v.sec ? 0 : .28 }, v.press);
  // the badge: three arrows chasing round anticlockwise
  const bx = x + R * .62, by = y - R * .74;
  v.twist = el('g', { style: 'display:none' }, g);
  el('circle', { cx: bx, cy: by, r: 9, fill: '#1f1f1f', stroke: ESTOP_PLATE, 'stroke-width': 1.4 }, v.twist);
  for (let i = 0; i < 3; i++) {
    const a0 = -Math.PI / 2 + i * 2 * Math.PI / 3, a1 = a0 - 1.45, r = 5.2;   // (each from a0 back to a1: anticlockwise on the screen)
    const P0 = [bx + r * Math.cos(a0), by + r * Math.sin(a0)], P1 = [bx + r * Math.cos(a1), by + r * Math.sin(a1)];
    el('path', { d: `M ${P0[0]} ${P0[1]} A ${r} ${r} 0 0 0 ${P1[0]} ${P1[1]}`, fill: 'none', stroke: ESTOP_PLATE, 'stroke-width': 1.5 }, v.twist);
    // (its head: pointing on round the circle, anticlockwise)
    const tx = Math.sin(a1), ty = -Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1), L = 3.1, w = 2.1;
    el('path', { d: `M ${P1[0] + tx * L} ${P1[1] + ty * L} L ${P1[0] + nx * w} ${P1[1] + ny * w} L ${P1[0] - nx * w} ${P1[1] - ny * w} Z`, fill: ESTOP_PLATE }, v.twist);
  }
}
const captionOf = p => p.t === 'stand' ? `${p.L ? p.L + ' ' : ''}${LINK_PB_SYMN[p.sym] || p.sym} (stand-in)` : p.t === 'xfm' ? `T${p.L} Control Transformer` : p.t === 'jmp' ? `Continuation ${p.L}` : p.t === 'sol' ? `SOL${p.L} Solenoid` : p.t === 'htr' ? `HTR${p.L} Heating Element` : p.t === 'l1' ? 'L1 Supply' : p.t === 'l2' ? 'L2 Return' : p.t === 'ph' ? `L${p.L} Phase` : p.t === 'dsc' ? `DS${p.L} Disconnect` : p.t === 'fus' ? `FU${p.L}–FU${+p.L + 2} Fuses` : p.t === 'fu1' ? `FU${p.L} Fuse` : p.t === 'mst' ? `${p.L} Starter` : p.t === 'olh' ? `OL${p.L} Overload` : p.t === 'olc' ? `OL${p.L} Contact (NC)` : p.t === 'psw' ? `PS${p.L} ${p.low ? 'Low' : 'High'} Pressure Switch (${p.nc ? 'NC' : 'NO'})` : p.t === 'fsw' ? `FLS${p.L} ${p.low ? 'Low' : 'High'} Flow Switch (${p.nc ? 'NC' : 'NO'})` : p.t === 'flt' ? `FS${p.L} ${p.low ? 'Low' : 'High'} Level Float Switch (${p.nc ? 'NC' : 'NO'})` : p.t === 'tgl' ? `SW${p.L} Toggle Switch (SPST)` : p.t === 'sp2' ? `SW${p.L} Toggle Switch (SPDT)` : p.t === 'xov' ? `SW${p.L} Crossover Switch (DPDT)` : p.t === 'dps' ? `SW${p.L} Toggle Switch (DPST)` : p.t === 'tps' ? `SW${p.L} Toggle Switch (3PST)` : p.t === 'cbk' ? `CB${p.L} Circuit Breaker` : p.t === 'cbd' ? `CB${p.L} Circuit Breaker (DPST)` : p.t === 'cbt' ? `CB${p.L} Circuit Breaker (3PST)` : p.t === 'dpd' ? `SW${p.L} Toggle Switch (DPDT)` : p.t === 'tsw' ? `TS${p.L} ${p.low ? 'Low' : 'High'} Temp. Switch (${p.nc ? 'NC' : 'NO'})` : p.t === 'lsw' ? `LS${p.L} Limit Switch (${p.nc ? 'NC' : 'NO'}${p.held ? (p.nc ? ' held open' : ' held closed') : ''})` : p.t === 'mtr' ? `MTR${p.L} Motor` : p.t === 'sel' ? `${p.L} Selector` : p.t === 'coil' ? (isTimer(p) ? `${idOf(p)} ${p.tof ? 'Off' : 'On'}-Delay Timer` : `${idOf(p)} Coil`) : p.t === 'lamp' ? (p.L ? `${idOf(p)} Button Light` : 'Pilot Light') : p.t === 'con' ? `${idOf(p)} ${parts.some(q => isTimer(q) && q.L === p.L) ? (p.inst ? 'Instant ' : 'Timed ') : ''}Contact (${p.nc ? 'NC' : 'NO'})` : p.estop ? `${idOf(p)} E-Stop (NC)` : `${idOf(p)} Button (${p.nc ? 'NC' : 'NO'})`;
/* Pilot lights. A light can be built into a pushbutton (an illuminated pushbutton): it is still wired as a light of
   its own, wherever it sits in the circuit, but it shows on the button too. The button's cap lights up with it, and a
   small lamp badge on the button's corner marks it as having a light. A light built into a button takes the button's
   colour. */
/* One button drawn more than once: the first one placed is the pushbutton itself (the operator), drawn as normal; the
   others are its extra contact blocks, drawn as secondary (a dark cap with a coloured rim and letter). Pressing any of
   them presses them all. A light built into the button shows on the main one only, as the lamp is in the operator. */
const SEC_PRESSED = '#2a2a2a', SEC_PRESSED_RIM = '#8c8c8c';
const mainBtn = L => parts.find(q => q.t === 'btn' && q.L === L);
/* What is written on a button's or a coil's cap: its label if it has one ("Start"), otherwise its letter. The letter
   stays what it is known by (its contacts, the same button drawn twice, a light built into it); the caption under it
   still gives the letter. A label too wide for the cap is written smaller to fit. */
const nameOf = p => p.label || p.L;
function capText(t, s, maxW, size, y) {
  t.textContent = s;
  if (s.length < 2) return;
  let w = 0; try { w = t.getComputedTextLength(); } catch (_) {}
  if (!(w > maxW)) return;
  const f = Math.max(6, size * maxW * .96 / w);   // (a little under, as text does not shrink quite in proportion)
  t.setAttribute('font-size', f.toFixed(1)); t.setAttribute('y', (y - (size - f) * .36).toFixed(1));   // (kept centred as it shrinks)
}
const lampsOf = L => parts.filter(q => q.t === 'lamp' && q.L && q.L === L);
const lampColour = p => p.L ? (parts.find(q => q.t === 'btn' && q.L === p.L) || p).color || '#00B050' : p.color || '#00B050';
// how lit a light is right now, 0 to 1 (it comes on and goes off over a moment, as a filament does)
const LAMP_FADE = 0.2;
const litOf = q => { const on = !!coilOn[q.id], f = q._chg == null ? 1 : clamp01((simT - q._chg) / LAMP_FADE); return (on ? f : 1 - f) * Math.min(1, q._sh ?? 1) ** 2; };   // (as bright as its power: on half the voltage, a quarter)
const filament = (x, y, s, g, w) => el('path', { d: `M ${x - s} ${y - s} L ${x + s} ${y + s} M ${x + s} ${y - s} L ${x - s} ${y + s}`, 'stroke-width': w, 'stroke-linecap': 'round', fill: 'none', stroke: 'rgba(30,30,30,.55)' }, g);
// how far above a part's middle its name is written (clear of the badges on its top corners)
const capTop = p => p.t === 'stand' ? standBox(p).hh + 11 : (p.t === 'lsw' ? LSW_TOP + 42 + 13.3 + 28 + 4 : p.t === 'tsw' ? LSW_TOP + 2 : p.t === 'psw' ? PSW_UP + 2 : p.t === 'fsw' ? FSW_UP + 2 : p.t === 'flt' ? FLT_UP + 2 : p.t === 'tgl' ? LSW_TOP + 2 : isTglN(p) || isBrk(p) ? bodyUp(p) + 2 : p.t === 'dsc' ? PWR_H / 2 + DSC_HEAD + 2 : p.t === 'xfm' ? XFM_H / 2 + 2 : p.t === 'olc' || p.t === 'fu1' ? CON_H / 2 + 1 : p.t === 'con' ? CON_H / 2 + 1 : isSolT(p.t) ? SOL_S / 2 + 2 : p.t === 'lamp' ? BODYH(p.t) / 2 + 2 : BODYH(p.t) / 2 + (p.t === 'btn' && p.nc ? 3 : 0)) + 11;
/* Every part's body has a coloured edge and, round that, a dark bezel in the colour of its well (BEZEL wide): body,
   coloured edge, dark bezel. framed draws the bezel (a wide dark stroke along the same outline, under the body), then
   the body itself. */
const BEZEL = 4.5, WELL = '#262626';
let solMaskN = 0;   // (each solenoid drawing's mask has an id of its own)
function framed(tag, a, g) { el(tag, Object.assign({}, a, { fill: 'none', stroke: WELL, 'stroke-width': (a['stroke-width'] || 1.8) + 2 * BEZEL }), g); return el(tag, a, g); }
// a part, in the same style as the Order of Operations simulators
/* A stand-in (Dallas, 19 Nov 2026): a Print Builder part Circuit Builder has none of, drawn as a NO pushbutton's square
   with the part's own NEMA symbol inside, in colour, its edge dashed. Two terminals: a button's square and terminals, the
   symbol drawn smaller to fit. More: the box as big as the symbol, its terminals just outside the symbol's, a lead to each.
   Drawn, not run: nothing passes through it. */
const STAND_COL = '#FFC000';
const standSym = p => { const n = LINK_PB_SYMN[p.sym]; return n ? PSYM[n] || LINK_PB_PSYM[n] || null : null; };
const standTwo = p => p.st.length === 2 && ((!p.st[0][1] && !p.st[1][1]) || (!p.st[0][0] && !p.st[1][0]));
const standTurn = ([a, b], r) => { for (let k = 0; k < r / 90; k++) [a, b] = [-b, a]; return [a, b]; };
function standBox(p) {
  if (standTwo(p)) return { hw: BOX / 2, hh: BOX / 2 };
  const s = standSym(p), xs = s ? s.t.map(q => q[0]) : [-40, 40], c = [[Math.min(...xs), s ? s.y0 : -40], [Math.max(...xs), s ? s.y1 : 40]].map(q => standTurn(q, p.srot || 0));
  return { hw: Math.max(BOX / 2, Math.abs(c[0][0]) + 16, Math.abs(c[1][0]) + 16), hh: Math.max(BOX / 2, Math.abs(c[0][1]) + 16, Math.abs(c[1][1]) + 16) };
}
const standInk = b => b.replace(/fill="#000"/g, `fill="${STAND_COL}"`).replace(/fill="#fff"/g, 'fill="#262626"').replace(/stroke="#000"/g, `stroke="${STAND_COL}"`);
function drawStand(p, g, x, y, onStation) {
  const v = {}, s = standSym(p), two = standTwo(p), { hw, hh } = standBox(p), up = two && !p.st[0][0];
  if (two) for (const [u, w] of p.st) el('line', { x1: x + u, y1: y + w, x2: x + Math.sign(u) * hw, y2: y + Math.sign(w) * hh, stroke: '#c8c8c8', 'stroke-width': 3 }, g);
  else if (s) s.t.forEach((q, i) => { const [a, b] = standTurn(q, p.srot || 0), o = p.st[i]; if (o) el('line', { x1: x + a, y1: y + b, x2: x + o[0], y2: y + o[1], stroke: '#c8c8c8', 'stroke-width': 3 }, g); });
  framed('rect', { x: x - hw, y: y - hh, width: 2 * hw, height: 2 * hh, rx: Math.min(hw, hh) * .3334, fill: 'url(#gWell)', stroke: STAND_COL, 'stroke-width': 1.8, 'stroke-dasharray': '6 4' }, g);
  if (s) { const span = Math.max(1, Math.max(...s.t.map(q => q[0])) - Math.min(...s.t.map(q => q[0]))), sc = two ? Math.min(54 / span, 50 / Math.max(1, s.y1 - s.y0)) : 1;
    const k = el('g', { transform: `translate(${x} ${y}) rotate(${two ? (up ? 90 : 0) : p.srot || 0}) scale(${sc})`, stroke: STAND_COL, 'stroke-width': 3 / sc, fill: 'none', 'pointer-events': 'none' }, g);
    k.innerHTML = standInk(s.b); }
  if (!onStation) (v.cap = el('text', { x, y: y - hh - 11, 'text-anchor': 'middle', class: 'cap' }, g)).textContent = captionOf(p);
  return v;
}
function drawPart(p, g, x, y, chan, onStation) {
  if (p.t === 'stand') return drawStand(p, g, x, y, onStation);
  // a toggle switch flipped (Dallas, 21 Nov 2026): drawn mirrored left to right about its middle; its writing turned back to read
  if (p.fx && flips(p) && !g.flipped && !onStation) {
    const a = { transform: `translate(${2 * x} 0) scale(-1 1)` }, g2 = el('g', a, g); g2.flipped = true;
    const v = drawPart(p, g2, x, y, el('g', a, chan || g), false);
    if (v.cap) { v.cap.remove(); delete v.cap; }
    for (const t of g2.querySelectorAll('text')) { const tx = +t.getAttribute('x') || 0; t.setAttribute('transform', `${t.getAttribute('transform') || ''} translate(${2 * tx} 0) scale(-1 1)`.trim()); }
    if (!v.sec) (v.cap = el('text', vert(p) ? { x: x + BOX / 2 + 12, y: y + 4.5, 'text-anchor': 'start', class: 'cap' } : { x, y: y - capTop(p), 'text-anchor': 'middle', class: 'cap' }, g)).textContent = captionOf(p);
    return v;
  }
  // a single fuse turned: drawn as it is lying down, turned about its middle (its name, though, stays upright: above
  // it, or beside it when it stands upright)
  // (and any two-ended part turned, the same way)
  if ((p.t === 'fu1' || twoEnded(p)) && p.rot && !g.turned && !onStation) {
    const a = { transform: `rotate(${p.rot * 90} ${x} ${y})` }, g2 = el('g', a, g); g2.turned = true;
    const v = drawPart(p, g2, x, y, el('g', a, chan || g), false);
    if (v.cap) { v.cap.remove(); delete v.cap; }
    // (its writing, a letter on a cap or a coil, a number on a badge, turned back so it still reads upright)
    for (const t of g2.querySelectorAll('text')) { const tx = +t.getAttribute('x') || 0, ty = +t.getAttribute('y') || 0, fs = +(t.getAttribute('font-size') || 14);
      t.setAttribute('transform', `${t.getAttribute('transform') || ''} rotate(${-p.rot * 90} ${tx} ${ty - fs * .35})`.trim()); }
    if (!onStation && !v.sec) (v.cap = el('text', vert(p) ? { x: x + BOX / 2 + 12, y: y + 4.5, 'text-anchor': 'start', class: 'cap' } : { x, y: y - capTop(p), 'text-anchor': 'middle', class: 'cap' }, g)).textContent = captionOf(p);
    return v;
  }
  const v = {}, T = TERM(p), half = LEADH(p);
  if (!isBox(p) && p.t !== 'xfm' && !isPwr3(p) && p.t !== 'mtr' && !isMulti(p)) el('line', { x1: x - T, y1: y, x2: x + T, y2: y, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
  // the short leads between the part's ends and its body: each drawn in two pieces, so the current can flow along
  // them (the new colour, and what was there before it)
  const lead = () => el('line', { x1: x, y1: y, x2: x, y2: y, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g);
  v.lead = { A: { old: lead(), cur: lead(), term: x - T, body: x - half, y }, B: { old: lead(), cur: lead(), term: x + T, body: x + half, y } };
  if (p.t === 'btn') {
    v.sec = mainBtn(p.L) !== p && parts.includes(p);
    v.lit = !v.sec && lampsOf(p.L).length > 0;
    v.secFill = v.sec ? '#1c1c1c' : null;   // (another contact block: a black cap with a coloured outline, like a selector's other drawings)
    // a button with a light built in: a glow behind it when the light is on
    if (v.lit) v.halo = el('rect', { x: x - BOX / 2 - 4, y: y - BOX / 2 - 4, width: BOX + 8, height: BOX + 8, rx: BOX * .22, fill: p.color, opacity: 0, filter: 'url(#fGlow)' }, g);
    if (p.estop) drawEstop(p, v, x, y, g);
    else if (p.nc) {
      const RB = BOX / 2 * 1.08, RI = BTN_IN / 2 * 1.1;
      framed('path', { d: hexPath(x, y, RB, RB * .17), fill: 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
      v.press = el('g', {}, g);
      v.fill = el('path', { d: hexPath(x, y, RI, RI * .17), fill: v.sec ? v.secFill : p.color, stroke: v.sec ? p.color : '#1d2733', 'stroke-width': v.sec ? 1.8 : 1.2, filter: 'url(#fShadow)' }, v.press);
      el('path', { d: hexPath(x, y, RI, RI * .17), fill: 'url(#gGloss)' }, v.press);
    } else {
      framed('rect', { x: x - BOX / 2, y: y - BOX / 2, width: BOX, height: BOX, rx: BOX * .1667, fill: 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
      v.press = el('g', {}, g);
      v.fill = el('rect', { x: x - BTN_IN / 2, y: y - BTN_IN / 2, width: BTN_IN, height: BTN_IN, rx: BTN_IN * .1667, fill: v.sec ? v.secFill : p.color, stroke: v.sec ? p.color : '#1d2733', 'stroke-width': v.sec ? 1.8 : 1.2, filter: 'url(#fShadow)' }, v.press);
      el('rect', { x: x - BTN_IN / 2, y: y - BTN_IN / 2, width: BTN_IN, height: BTN_IN, rx: BTN_IN * .1667, fill: 'url(#gGloss)' }, v.press);
    }
    v.text = el('text', { x, y: y + 6.6, 'text-anchor': 'middle', class: 'devtext', 'font-size': 19, fill: DARK_TEXT, style: v.sec ? `fill:${p.color}` : p.estop ? 'fill:#fff' : '' }, v.press); capText(v.text, nameOf(p), p.estop ? 27 : p.nc ? 35 : 37, p.estop ? 16 : 19, y + 6.6);
    // the same button drawn more than once (one operator with several contact blocks: pressing one presses them
    // all): a chain-link badge on each one's top left corner
    if (!onStation && parts.filter(q => q.t === 'btn' && q.L === p.L).length > 1) {
      const bx = x - BOX / 2 + 3, by = y - BOX / 2 + 3;
      el('circle', { cx: bx, cy: by, r: 9, fill: '#1f1f1f', stroke: p.color, 'stroke-width': 1.4 }, g);
      const ln = el('g', { transform: `rotate(-45 ${bx} ${by})`, fill: 'none', stroke: '#e6e6e6', 'stroke-width': 1.5 }, g);
      el('rect', { x: bx - 6, y: by - 2.3, width: 6.6, height: 4.6, rx: 2.3 }, ln);
      el('rect', { x: bx - 0.6, y: by - 2.3, width: 6.6, height: 4.6, rx: 2.3 }, ln);
      v.linked = true;
    }
    if (v.lit) {   // the lamp badge, on the button's top right corner
      const bx = x + BOX / 2 - 3, by = y - BOX / 2 + 3;
      el('circle', { cx: bx, cy: by, r: 9, fill: '#1f1f1f', stroke: p.color, 'stroke-width': 1.4 }, g);
      v.badge = el('circle', { cx: bx, cy: by, r: 6, fill: GREY }, g);
      v.badgeFil = filament(bx, by, 2.6, g, 1.5);
    }
  } else if (p.t === 'con' || p.t === 'olc') {
    // a relay contact, as in the Order of Operations simulators: two contact points, and a bar that drops onto them to close
    // (an overload's contact: the same, normally closed, in the overload's colour)
    const B = BOX, H = CON_H, col = p.t === 'olc' ? OL_COL : coilColour(p.L);
    framed('rect', { x: x - B / 2, y: y - H / 2, width: B, height: H, rx: H * .1667, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
    v.posts = el('g', { fill: p.nc ? col : GREY }, g);
    const sy = B * .045, r = B * .105, L = x - B / 2, inset = 4.5;
    el('rect', { x: L + inset, y: y - sy, width: B * .25 - inset, height: 2 * sy }, v.posts);
    el('rect', { x: L + B * .75, y: y - sy, width: B * .25 - inset, height: 2 * sy }, v.posts);
    el('circle', { cx: L + B * .25, cy: y, r }, v.posts);
    el('circle', { cx: L + B * .75, cy: y, r }, v.posts);
    const gl = el('g', { fill: 'url(#gDome)' }, g);
    el('circle', { cx: L + B * .25, cy: y, r }, gl);
    el('circle', { cx: L + B * .75, cy: y, r }, gl);
    const bx1 = L + B * .25 - r * 1.15, bx2 = L + B * .75 + r * 1.15, bh = 7;
    v.blade = el('g', { transform: p.nc ? '' : `translate(0 ${-OPEN_LIFT})` }, g);
    v.bladeShape = el('rect', { x: bx1, y: y - bh / 2, width: bx2 - bx1, height: bh, rx: bh / 2, fill: p.nc ? col : BLADE_GREY, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, v.blade);
    el('rect', { x: bx1, y: y - bh / 2, width: bx2 - bx1, height: bh, rx: bh / 2, fill: 'url(#gGloss)' }, v.blade);
    g.insertBefore(v.blade, v.posts);   // the bar sits behind the contact points
    v.col = col;
    // a timed contact: the arrow of the NEMA symbol, on its bar (it moves with it). It points the way the delay acts:
    // up on an on-delay timer's contacts (delayed after it is energized), down on an off-delay timer's (after it loses power)
    const tm = isTimed(p) && parts.find(q => isTimer(q) && q.L === p.L);
    if (tm) {
      // (as thick as the bar's stem allows, and about as wide as the bar is tall at its head)
      const s = tm.tof ? 1 : -1, y0 = y + s * (bh / 2 - .5), y1 = y0 + s * 5.5, tip = y0 + s * 11.8, w = 6.4;   // (clear of the box's edge when the bar is lifted)
      v.arrow = el('g', { fill: p.nc ? col : BLADE_GREY, stroke: p.nc ? col : BLADE_GREY }, v.blade);
      el('line', { x1: x, y1: y0, x2: x, y2: y1 + s * 1.5, 'stroke-width': 4.2 }, v.arrow);
      el('path', { d: `M ${x - w} ${y1} L ${x + w} ${y1} L ${x} ${tip} Z`, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }, v.arrow);
    }
    if (isTimed(p)) {   // a timed contact: the timer's square hourglass badge, small, on its top right corner
      const bx = x + B / 2 - 2, by = y - H / 2 + 2, h = 9.5, gH = 5.4, gB = gH / 1.41;
      el('rect', { x: bx - h, y: by - h, width: 2 * h, height: 2 * h, rx: 3, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.3 }, g);
      el('rect', { x: bx - h + 2.5, y: by - h + 2.5, width: 2 * h - 5, height: 2 * h - 5, rx: 2, fill: GREY }, g);
      const P = pts => 'M ' + pts.map(q => q.map(n => n.toFixed(2)).join(' ')).join(' L ') + ' Z';
      el('path', { d: P([[bx - gB, by - gH], [bx + gB, by - gH], [bx + gB * .28, by], [bx + gB, by + gH], [bx - gB, by + gH], [bx - gB * .28, by]]), fill: 'none', stroke: '#d8d8d8', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }, g);
      for (const yy of [by - gH, by + gH]) el('line', { x1: bx - gB - 1.2, y1: yy, x2: bx + gB + 1.2, y2: yy, stroke: '#d8d8d8', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, g);
      el('path', { d: P([[bx - gB * .62, by - gH * .55], [bx + gB * .62, by - gH * .55], [bx + gB * .22, by - gH * .1], [bx - gB * .22, by - gH * .1]]), fill: '#d8d8d8' }, g);
      el('path', { d: P([[bx - gB * .8, by + gH * .86], [bx + gB * .8, by + gH * .86], [bx + gB * .35, by + gH * .45], [bx - gB * .35, by + gH * .45]]), fill: '#d8d8d8' }, g);
    }
  } else if (p.t === 'sel') {
    drawSelector(p, g, x, y, v);
  } else if (p.t === 'lsw') {
    drawLimit(p, g, x, y, v);
  } else if (p.t === 'tsw') {
    drawTemp(p, g, x, y, v);
  } else if (p.t === 'psw') {
    drawPress(p, g, x, y, v);
  } else if (p.t === 'fsw') {
    drawFlow(p, g, x, y, v);
  } else if (p.t === 'flt') {
    drawFloat(p, g, x, y, v);
  } else if (p.t === 'tgl') {
    drawToggle(p, g, x, y, v);
  } else if (p.t === 'sp2') {
    drawSpdt(p, g, x, y, v, chan);
  } else if (p.t === 'xov') {
    drawXover(p, g, x, y, v, chan);
  } else if (p.t === 'dps' || p.t === 'tps') {
    drawDpst(p, g, x, y, v, chan);
  } else if (isBrk(p)) {
    drawBreaker(p, g, x, y, v, chan);
  } else if (p.t === 'dpd') {
    drawDpdt(p, g, x, y, v, chan);
  } else if (p.t === 'xfm') {
    drawXfm(p, g, x, y, v, chan);
  } else if (p.t === 'fu1') {
    // a single fuse (Dallas's design): in a box the size of a contact's, a contact's stems in from either side to a
    // cartridge fuse, its body between two square metal end caps. Stems and body a relay's grey until current goes
    // through (then its colour, see run.js); blown, a slanting break through its middle and a red badge, and each side the colour that reaches it
    // (the line side lit, the load side dark)
    framed('rect', { x: x - BOX / 2, y: y - BOX / 2, width: BOX, height: BOX, rx: BOX * .1667, fill: 'url(#gWell)', stroke: FU1_COL, 'stroke-width': 1.8 }, g);
    Object.assign(v, fuseBody(g, x, y, p.rot || 0));
  } else if (isPwr3(p)) {
    drawPwr(p, g, x, y, v, chan);
  } else if (p.t === 'mtr') {
    drawMtr(p, g, x, y, v, chan);
  } else if (isJmp(p)) {
    // a continuation: the supply boxes' double chevron in a silver-edged box. While running, the current lights the
    // leads that are wired and fills the chevrons (see run.js)
    v.lead = null;
    const used = ([tx, ty]) => editing || !parts.includes(p) || connects(pointInfo(tx, ty, new Set(), p));
    const leads = terms(p).map((t, i) => [t, x + (t[0] - x) / TERM(p) * half, y + (t[1] - y) / TERM(p) * half, i]).filter(([t]) => used(t));
    v.src = [];
    for (const [[tx, ty], bx, by, i] of leads) {
      el('line', { x1: bx, y1: by, x2: tx, y2: ty, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
      if (!editing && p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: bx, y1: by, x2: tx, y2: ty, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) });
    }
    framed('rect', { x: x - BOX / 2, y: y - BOX / 2, width: BOX, height: BOX, rx: BOX * .1667, fill: 'url(#gWell)', stroke: JMP_EDGE, 'stroke-width': 2.2 }, g);
    const cg = el('g', p.rot ? { transform: `rotate(${p.rot * 90} ${x} ${y})` } : {}, g);
    v.chev = [-7, 7].map(oy => el('path', { d: `M ${x - 13} ${y + oy - 6.5} L ${x} ${y + oy + 6.5} L ${x + 13} ${y + oy - 6.5}`, fill: 'none', stroke: '#8a8a8a', 'stroke-width': 3.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, cg));
  } else if (isSrc(p) || isPh(p)) {
    // a supply box: L1 or L2, wired from its left, its right or its bottom (a double chevron, as on a print), turned
    // with its chevrons; or a phase box, the same in its phase's colour, with the phase on a badge on its top left
    // (its leads: while building, all three; while running, only those wired, with L1 live in them, and a phase's
    // lit in its colour)
    v.lead = null;
    const used = ([tx, ty]) => editing || !parts.includes(p) || connects(pointInfo(tx, ty, new Set(), p));
    const ph = isPh(p), edge = ph ? phCol(p) : '#e2cc85', chev = ph ? lighten(phCol(p), .45) : '#f2e6b8';
    const leads = terms(p).map((t, i) => [t, x + (t[0] - x) / TERM(p) * half, y + (t[1] - y) / TERM(p) * half, i]).filter(([t]) => used(t));
    // (L2's leads light up with the return current as it arrives at them, so it runs right into the box)
    v.src = [];
    for (const [[tx, ty], bx, by, i] of leads) {
      el('line', { x1: bx, y1: by, x2: tx, y2: ty, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
      if (editing) continue;
      if (p.t === 'l1') el('line', { x1: bx, y1: by, x2: tx, y2: ty, stroke: SRC_COL, 'stroke-width': 8.9 }, g);
      else if (p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: bx, y1: by, x2: tx, y2: ty, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) });
    }
    framed('rect', { x: x - BOX / 2, y: y - BOX / 2, width: BOX, height: BOX, rx: BOX * .1667, fill: 'url(#gWell)', stroke: edge, 'stroke-width': 2.2 }, g);
    const cg = el('g', p.rot ? { transform: `rotate(${p.rot * 90} ${x} ${y})` } : {}, g);
    for (const oy of [-7, 7]) el('path', { d: `M ${x - 13} ${y + oy - 6.5} L ${x} ${y + oy + 6.5} L ${x + 13} ${y + oy - 6.5}`, fill: 'none', stroke: chev, 'stroke-width': 3.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, cg);
    if (ph) {
      const bx = x - BOX / 2 + 2, by = y - BOX / 2 + 2;
      el('rect', { x: bx - 15, y: by - 11, width: 30, height: 22, rx: 6, fill: '#1f1f1f', stroke: edge, 'stroke-width': 1.6 }, g);
      el('text', { x: bx, y: by + 4.4, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: chev }, g).textContent = 'L' + p.L;
    }
  } else if (isSolT(p.t)) {
    // a solenoid: see SOL_S. The bolt and its dots are the grey of a coil's middle; once it pulls in, the solenoid's
    // colour fills them from the end the current comes in at, as along a wire: one dot, the bolt, then the other (see paintSol)
    // (a heating element: the resistor's zigzag in place of the bolt, a little thinner; and a glow round it while it heats)
    const htr = p.t === 'htr', BOLT = htr ? HTR_BOLT : SOL_BOLT, BW = htr ? SOL_BW * .8 : SOL_BW, D0 = (htr ? HTR_D : SOL_D)[0];
    const col = p.color || (htr ? HTR_COL : SOL_COL), h = SOL_SIDE / 2, id = 'solm' + (++solMaskN), b = el('g', { transform: `translate(${x} ${y})` }, g);
    if (htr) v.glow = el('circle', { cx: 0, cy: 0, r: 40, fill: '#FF5A1F', filter: 'url(#fGlow)', style: 'opacity:0;transition:opacity .6s' }, b);
    framed('rect', { x: -h, y: -h, width: SOL_SIDE, height: SOL_SIDE, rx: SOL_RAD, transform: 'rotate(45)', fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, b);
    const shape = (fill, grow, to) => {
      for (const k of [-1, 1]) el('circle', { cx: k * SOL_DOT, cy: 0, r: SOL_DR + grow, fill }, to);
      el('path', { d: BOLT, fill: 'none', stroke: fill, 'stroke-width': BW + 2 * grow, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, to);
    };
    shape('#111', .9, el('g', { filter: 'url(#fShadow)' }, b)); shape(SOL_GREY, 0, b);   // (raised off the well, casting a shadow, like a coil's middle)
    // the fill: along the bolt a line its own width (so the colour's front crosses it squarely, round its bends too),
    // and across each dot a sweep as wide as the dot (kept to the dots)
    const mk = (n, dots) => { const m = el('mask', { id: id + n, maskUnits: 'userSpaceOnUse', x: -SOL_S / 2, y: -SOL_S / 2, width: SOL_S, height: SOL_S }, b);
      if (dots) for (const k of [-1, 1]) el('circle', { cx: k * SOL_DOT, cy: 0, r: SOL_DR, fill: '#fff' }, m); else shape('#fff', 0, m);
      return el('g', { mask: `url(#${id + n})` }, b); };
    const thin = mk('a', false), wide = mk('b', true), ln = (w, to) => el('path', { d: D0, fill: 'none', stroke: 'transparent', 'stroke-width': w, 'stroke-linejoin': 'round' }, to);
    v.old = [ln(BW, thin), ln(2 * SOL_DR + 2, wide)]; v.cur = [ln(BW, thin), ln(2 * SOL_DR + 2, wide)];
    // over it, grey or filled, the shading that makes it look rounded: lit from above (a shine along the top of the
    // bolt and on each dot, toward the upper left) and darker underneath, as the dome on a coil
    const sh = mk('c', false);
    el('rect', { x: -SOL_S / 2, y: -SOL_P - SOL_BW, width: SOL_S, height: 2 * (SOL_P + SOL_BW), fill: 'url(#gGloss)', opacity: .7 }, sh);
    el('path', { d: BOLT, transform: 'translate(-.7 -1.1)', fill: 'none', stroke: '#fff', 'stroke-opacity': .22, 'stroke-width': BW * .38, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, sh);
    for (const k of [-1, 1]) el('circle', { cx: k * SOL_DOT, cy: 0, r: SOL_DR, fill: 'url(#gDome)' }, sh);
    v.col = col;
  } else if (p.t === 'lamp') {
    // a pilot light: a lens with a filament, that glows when lit
    const col = lampColour(p); v.col = col;
    v.glow = el('circle', { cx: x, cy: y, r: COIL / 2 + 6, fill: col, opacity: 0, filter: 'url(#fGlow)' }, g);
    framed('circle', { cx: x, cy: y, r: COIL / 2, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
    v.fill = el('circle', { cx: x, cy: y, r: COIL_IN / 2, fill: GREY, stroke: '#1d2733', 'stroke-width': 1.2 }, g);
    el('circle', { cx: x, cy: y, r: COIL_IN / 2, fill: 'url(#gDome)' }, g);
    v.fil = filament(x, y, COIL_IN * .22, g, 2.4);
  } else {
    framed('circle', { cx: x, cy: y, r: COIL / 2, fill: 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
    v.fill = el('circle', { cx: x, cy: y, r: COIL_IN / 2, fill: GREY, stroke: '#1d2733', 'stroke-width': 1.2, filter: 'url(#fShadow)' }, g);
    el('circle', { cx: x, cy: y, r: COIL_IN / 2, fill: 'url(#gDome)' }, g);
    if (!isTimer(p)) { v.text = el('text', { x, y: y + 7.5, 'text-anchor': 'middle', class: 'devtext', 'font-size': 21, fill: LIGHT_TEXT }, g); capText(v.text, nameOf(p), 52, 21, y + 7.5); }
    else drawTimer(p, g, x, y, v);
  }
  // its name, above it (the other contact blocks of a pushbutton or selector switch go without: the dashed line joins them to it)
  if (!v.sec && !onStation && !isJmp(p) && !isPh(p) && p.t !== 'xfm') {
    // (a supply box turned: its caption goes to the side that has no lead, beside or below it)
    const [fx, fy] = isSrc(p) && p.rot ? rotQ(p, 0, -1).map((c, i) => Math.sign(c - [x, y][i])) : [0, -1];
    const at = fy < 0 ? { x, y: y - capTop(p), 'text-anchor': 'middle' } : fy > 0 ? { x, y: y + BOX / 2 + 21, 'text-anchor': 'middle' } : { x: x + fx * (BOX / 2 + 12), y: y + 4.5, 'text-anchor': fx > 0 ? 'start' : 'end' };
    (v.cap = el('text', { ...at, class: isSrc(p) ? 'cap srccap' : 'cap' }, g)).textContent = captionOf(p);
  }
  // (a continuation has no caption: it is wired on all four sides. Its number is on a round silver badge on its top
  // right corner; with the rung numbers shown, the rungs of the others with that number are on a tag on its top left: see refs.js)
  if (isJmp(p)) {
    const t = String(p.L), w = t.length > 1 ? 8 + 6.5 * t.length : 19, bx = x + BOX / 2 - 3, by = y - BOX / 2 + 3, b = el('g', { class: 'jmpno' }, g);
    el('rect', { x: bx - w / 2, y: by - 9.5, width: w, height: 19, rx: 9.5, fill: '#c9d2dd', stroke: '#1f1f1f', 'stroke-width': 1.6 }, b);
    el('text', { x: bx, y: by + 4.2, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 800, fill: '#1f2630' }, b).textContent = t;
    v.jmpTag = g;
  }
  return v;
}
// a horizontal run from lo to hi at height y, hopping over every crossing in hops
function hPath(lo, hi, y, hops) {
  const hx = hops.filter(([x, yy]) => yy === y && x + 10 > lo && x - 10 < hi).map(([x]) => x);
  const yAt = x => { for (const h of hx) if (Math.abs(x - h) <= 10) return +(y - Math.sqrt(Math.max(0, 100 - (x - h) ** 2))).toFixed(2); return y; };
  const bps = [lo, hi]; for (const h of hx) for (const b of [h - 10, h, h + 10]) if (b > lo && b < hi) bps.push(b);
  bps.sort((a, b) => a - b);
  let d = `M${lo} ${yAt(lo)}`;
  for (let i = 1; i < bps.length; i++) { const a = bps[i - 1], b = bps[i], mid = (a + b) / 2; d += hx.some(h => mid > h - 10 && mid < h + 10) ? `A10 10 0 0 1 ${b} ${yAt(b)}` : `L${b} ${y}`; }
  return d;
}

/* An on-delay timer: drawn as a relay coil (it is one), with its letter moved up a little, a view window under it
   showing the time (whole seconds), and a square badge with an hourglass on its top right. The badge stays the same
   as it times; it lights up while the timer is energized, as the lamp badge does. */
function drawTimer(p, g, x, y, v) {
  v.timer = true;
  v.text = el('text', { x, y: y + 1, 'text-anchor': 'middle', class: 'devtext', 'font-size': 19, fill: LIGHT_TEXT }, g); capText(v.text, nameOf(p), 44, 19, y + 1);
  v.win = el('g', {}, g); v.winY = y + 6.5; v.x = x;
  setReadout(v, p, p.delay, false);
  const R = COIL / 2, bx = x + R * .72, by = y - R * .72, h = 13, gH = 7.6, gB = gH / 1.41;
  el('rect', { x: bx - h, y: by - h, width: 2 * h, height: 2 * h, rx: 4, fill: '#1f1f1f', stroke: p.color, 'stroke-width': 1.5 }, g);
  v.badge = el('rect', { x: bx - h + 3, y: by - h + 3, width: 2 * h - 6, height: 2 * h - 6, rx: 2.5, fill: GREY }, g);
  const P = pts => 'M ' + pts.map(q => q.map(n => n.toFixed(2)).join(' ')).join(' L ') + ' Z';
  v.glass = el('g', { stroke: '#d8d8d8', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
  el('path', { d: P([[bx - gB, by - gH], [bx + gB, by - gH], [bx + gB * .28, by], [bx + gB, by + gH], [bx - gB, by + gH], [bx - gB * .28, by]]), 'stroke-width': 1.4 }, v.glass);
  el('line', { x1: bx - gB - 1.5, y1: by - gH, x2: bx + gB + 1.5, y2: by - gH, 'stroke-width': 1.8 }, v.glass);
  el('line', { x1: bx - gB - 1.5, y1: by + gH, x2: bx + gB + 1.5, y2: by + gH, 'stroke-width': 1.8 }, v.glass);
  v.sand = el('g', { fill: '#d8d8d8' }, g);
  el('path', { d: P([[bx - gB * .62, by - gH * .55], [bx + gB * .62, by - gH * .55], [bx + gB * .22, by - gH * .1], [bx - gB * .22, by - gH * .1]]) }, v.sand);
  el('path', { d: P([[bx - gB * .8, by + gH * .86], [bx + gB * .8, by + gH * .86], [bx + gB * .35, by + gH * .45], [bx - gB * .35, by + gH * .45]]) }, v.sand);
}
// the view window: a black recess in the cap, a little wider for longer numbers, the digits in the timer's colour
function setReadout(v, p, n, on) {
  const txt = n + ' s', key = txt + (on ? '|on' : '|off');
  if (v.winKey === key) return; v.winKey = key;
  const w = Math.max(24, 13 + 5.6 * String(n).length), h = 13, x0 = v.x - w / 2, y0 = v.winY;
  v.win.innerHTML = '';
  el('rect', { x: x0 - 1.6, y: y0 - 1.6, width: w + 3.2, height: h + 3.2, rx: 4.2, fill: on ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.10)' }, v.win);
  el('rect', { x: x0, y: y0, width: w, height: h, rx: 3.4, fill: 'url(#gWin)' }, v.win);
  el('rect', { x: x0 + .5, y: y0 + .5, width: w - 1, height: h - 1, rx: 3, fill: 'none', stroke: 'rgba(0,0,0,.9)', 'stroke-width': 1 }, v.win);
  const t = el('text', { x: v.x, y: y0 + 9.6, 'text-anchor': 'middle', 'font-weight': 700, 'font-size': 9.5, fill: on ? p.color : mixOk(p.color, '#262626', .55), style: 'font-variant-numeric:tabular-nums' }, v.win); t.textContent = txt;
  el('path', { d: `M ${x0 + 3} ${y0 + 2.2} H ${x0 + w - 3}`, stroke: 'rgba(255,255,255,.22)', 'stroke-width': 1, 'stroke-linecap': 'round' }, v.win);
}

/* A selector switch (design A): a square well, a round knob with a bar handle across it that turns to point at the
   position it is in, and the positions' numbers (or names) round the top: the one it is turned to in the switch's
   colour (the others grey), and a line under each position this drawing is closed in. The first drawing of a switch
   has the knob and a coloured handle; the others (its other contact blocks) only a hollow outline of the handle. */
const SEL_KNOB = 12, SEL_R = 33;   // the knob sits a little below the middle; the numbers round it at this radius
function drawSelector(p, g, x, y, v) {
  const S = SEL_BOX, kx = x, ky = y + SEL_KNOB;
  v.sec = mainSel(p.L) !== p && parts.includes(p);
  framed('rect', { x: x - S / 2, y: y - S / 2, width: S, height: S, rx: S * .1667, fill: v.sec ? '#1c1c1c' : 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
  v.marks = el('g', {}, g); v.kx = kx; v.ky = ky;
  if (v.sec) {
    // another contact block of the switch: no knob of its own, just a hollow outline of the handle, showing where the switch is turned
    el('circle', { cx: kx, cy: ky, r: 15, fill: 'none', stroke: '#4a4a4a', 'stroke-width': 1.4, 'stroke-dasharray': '3 3' }, g);
    v.handle = el('g', {}, g);
    el('rect', { x: kx - 5, y: ky - 16, width: 10, height: 32, rx: 5, fill: '#1c1c1c', stroke: p.color, 'stroke-width': 1.8 }, v.handle);
    el('line', { x1: kx, y1: ky - 12.5, x2: kx, y2: ky - 6, stroke: p.color, 'stroke-width': 2, 'stroke-linecap': 'round' }, v.handle);
  } else {
    el('circle', { cx: kx, cy: ky, r: 15, fill: 'url(#gKnob)', stroke: '#1d2733', 'stroke-width': 1.2, filter: 'url(#fShadow)' }, g);
    v.handle = el('g', {}, g);
    el('rect', { x: kx - 5, y: ky - 16, width: 10, height: 32, rx: 5, fill: p.color, stroke: '#1d2733', 'stroke-width': 1.1 }, v.handle);
    el('rect', { x: kx - 5, y: ky - 16, width: 10, height: 32, rx: 5, fill: 'url(#gGloss)' }, v.handle);
    el('line', { x1: kx, y1: ky - 12.5, x2: kx, y2: ky - 6, stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .85 }, v.handle);
  }
  setSelector(v, p, editing ? (p.pos || 0) : selPos(p.L), null);
}
// the handle's angle (deg) and the numbers, for position pos (or partway between, while it turns)
function setSelector(v, p, pos, ang) {
  const A = SEL_ANG[selN(p)], a = ang === null ? A[pos] : ang;
  v.handle.setAttribute('transform', `rotate(${a.toFixed(2)} ${v.kx} ${v.ky})`);
  const key = pos + '|' + (p.closedIn || []).join() + '|' + (p.names || []).join();
  if (v.marksKey === key) return; v.marksKey = key;
  v.marks.innerHTML = '';
  A.forEach((d, i) => {
    const t = d * Math.PI / 180, named = p.names && p.names[i], fs = named ? 7 : 11, w = named ? named.length * fs * .66 : fs * .62;
    let mx = v.kx + SEL_R * Math.sin(t); const my = v.ky - SEL_R * Math.cos(t), on = (p.closedIn || []).includes(i);
    const lim = SEL_BOX / 2 - 5 - w / 2; mx = Math.max(v.kx - lim, Math.min(v.kx + lim, mx));   // (names kept clear of the border)
    const txt = el('text', { x: mx, y: my + fs * .36, 'text-anchor': 'middle', 'font-weight': 800, 'font-size': fs, fill: i === pos ? p.color : '#6a6a6a' }, v.marks);
    txt.textContent = named || String(i + 1); if (on) txt.dataset.closed = '1';
    el('rect', { x: mx - w / 2 - 4, y: my - fs * .5 - 3, width: w + 8, height: fs + 6, fill: 'transparent', 'data-pos': i, style: editing ? '' : 'cursor:pointer' }, v.marks);   // (pressing a position's name turns the switch straight to it)
    if (on) { const hw = named ? w / 2 : 3.6, uy = my + fs * .36 + 3; el('line', { x1: mx - hw, y1: uy, x2: mx + hw, y2: uy, stroke: '#dcdcdc', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, v.marks); }
  });
}

/* A control transformer (see XFM_W): a box with a dark bezel and a coloured edge, and inside it the two windings facing
   each other across the core, each between two round contact points just inside the box's top (H1, H2) or bottom (X1,
   X2) edge, its ends running in toward the core and its four turns bowing toward it. Raised and grey, like a solenoid's
   bolt, until current flows: then the primary fills in the colour of the current coming in, from the end it comes in at,
   and once the primary is fed the secondary fills from X1 in the colour of the supply it now is (see paintXfm). Its
   name and voltages sit beside it, as on a nameplate. */
const XFM_LEG = 20, XFM_R = XFM_TX / 4, XFM_LEN = 2 * XFM_LEG + 4 * Math.PI * XFM_R;
function drawXfm(p, g, x, y, v, chan) {
  v.lead = null; v.src = [];
  const W = XFM_W, H = XFM_H, w = XFM_TX, yp = y - H / 2 + 15, ys = y + H / 2 - 15;
  // the leads from the terminals to the box's edge (lit by what reaches the terminals, while running)
  terms(p).forEach(([tx, ty], i) => {
    const by = ty < y ? y - H / 2 : y + H / 2;
    el('line', { x1: tx, y1: ty, x2: tx, y2: by, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
    if (!editing && p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: tx, y1: ty, x2: tx, y2: by, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) });
  });
  framed('rect', { x: x - W / 2, y: y - H / 2, width: W, height: H, rx: 20, fill: 'url(#gWell)', stroke: XFM_EDGE, 'stroke-width': 1.8 }, g);
  // a winding along row yr, its turns bowing down (the primary) or up (the secondary): its path from the left and from the right
  const winding = (yr, up) => {
    const yb = yr + (up ? -XFM_LEG : XFM_LEG), path = k => { let d = `M${x - k * w} ${yr}V${yb}`; for (let i = 0; i < 4; i++) d += ` a${XFM_R} ${XFM_R} 0 0 ${(up ? 1 : 0) ^ (k < 0 ? 1 : 0)} ${k * 2 * XFM_R} 0`; return d + `V${yr}`; };
    const d = [path(1), path(-1)], round = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const sh = el('g', { filter: 'url(#fShadow)' }, g);
    for (const k of [-1, 1]) el('circle', { cx: x + k * w, cy: yr, r: SOL_DR + .9, fill: '#111' }, sh);
    el('path', Object.assign({ d: d[0], stroke: '#111', 'stroke-width': SOL_BW + 1.8 }, round), sh);
    for (const k of [-1, 1]) el('circle', { cx: x + k * w, cy: yr, r: SOL_DR, fill: SOL_GREY }, g);
    el('path', Object.assign({ d: d[0], stroke: SOL_GREY, 'stroke-width': SOL_BW }, round), g);
    const old = el('path', Object.assign({ d: d[0], stroke: 'transparent', 'stroke-width': SOL_BW }, round), g);
    const cur = el('path', Object.assign({ d: d[0], stroke: 'transparent', 'stroke-width': SOL_BW }, round), g);
    const dots = [-1, 1].map(k => el('circle', { cx: x + k * w, cy: yr, r: SOL_DR, fill: 'transparent' }, g));
    el('path', Object.assign({ d: d[0], transform: 'translate(-.6 -1.1)', stroke: '#fff', 'stroke-opacity': .22, 'stroke-width': 2.4 }, round), g);
    for (const k of [-1, 1]) el('circle', { cx: x + k * w, cy: yr, r: SOL_DR, fill: 'url(#gDome)' }, g);
    return { d, old, cur, dots };
  };
  v.pri = winding(yp, false); v.sec = winding(ys, true);
  // (across two phases, the primary shades from H1's phase's colour into H2's along its turns: see paintXfm)
  const gid = 'xfg' + (++solMaskN), gr = el('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: x - w, y1: 0, x2: x + w, y2: 0 }, g);
  v.pri.grad = { id: gid, stops: [.12, .88].map(o => el('stop', { offset: o, 'stop-color': 'transparent' }, gr)) };
  // the core: two raised steel bars, evenly spaced between the windings
  for (const dy of [-6.5, 6.5]) el('rect', { x: x - w - 6, y: y + dy - 2.5, width: 2 * w + 12, height: 5, rx: 2.5, fill: 'url(#gTerm)', filter: 'url(#fShadow)' }, g);
  // the terminals' names, on rounded squares beside the windings' ends
  for (const [k, ky, s] of [[-1, -1, 'H1'], [1, -1, 'H2'], [-1, 1, 'X1'], [1, 1, 'X2']]) {
    const tx = x + k * (w + 22), ty = y + ky * 33;
    el('rect', { x: tx - 12, y: ty - 12, width: 24, height: 24, rx: 6, fill: '#1f1f1f', stroke: '#e2cc85', 'stroke-width': 1.2 }, g);
    el('text', { x: tx, y: ty + 4.3, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, fill: '#f2e6b8' }, g).textContent = s;
  }
  // the nameplate
  const nx = x - W / 2 - 14, t = (dy, s, a) => el('text', Object.assign({ x: nx, y: y + dy, 'text-anchor': 'end' }, a), g).textContent = s;
  t(-6, 'T' + p.L, { 'font-size': 16, 'font-weight': 800, fill: '#e8e8e8' });
  t(12, 'Main Power Voltage', { 'font-size': 11.5, 'font-weight': 600, fill: '#ff9d6b' });   // (its primary's; then its secondary's)
  t(27, 'Control Voltage', { 'font-size': 11.5, 'font-weight': 600, fill: '#e2cc85' });
}

/* ---------------- three-phase parts ----------------
   A raised element, as a solenoid's bolt: a dark outline casting a shadow, the element (grey, or lit in the phase that
   reaches it) and a shine along its top. Returns the element, to colour. */
function rpath(g, d, w, col = GREY) {
  const round = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  el('path', { d, stroke: '#111', 'stroke-width': w + 1.8, filter: 'url(#fShadow)', ...round }, g);
  const m = el('path', { d, stroke: col, 'stroke-width': w, ...round }, g);
  el('path', { d, transform: 'translate(-.5 -1)', stroke: '#fff', 'stroke-opacity': .22, 'stroke-width': 2, ...round }, g);
  return m;
}
function rdot(g, cx, cy, r) {
  el('circle', { cx, cy, r: r + .9, fill: '#111', filter: 'url(#fShadow)' }, g);
  const m = el('circle', { cx, cy, r, fill: GREY }, g);
  el('circle', { cx, cy, r, fill: 'url(#gDome)' }, g);
  return m;
}
const pwrEdge = p => p.t === 'dsc' ? DSC_COL : p.t === 'fus' ? FUS_COL : p.t === 'mst' ? coilColour(p.L) : OL_COL;
/* The fuse of a single fuse, and of each pole of the three-pole fuses (Dallas's design): a contact's stems in from either
   side of a box BOX wide to a cartridge fuse, its body between two square metal end caps. The way through (stems and
   body as one shape) is a relay's grey beneath, and over that the current's colour in two layers, each cut to length by
   a clip, so the current can be seen to cross it (see paintFuse). Blown: a clean break slanting through its body, the
   ends either side scorched, and a red badge on the top right corner of its square (as it is seen, however it is
   turned: rot, quarter turns). */
function fuseBody(g, x, y, rot) {
  const v = {};
  const sh = 2 * BOX * .045, inset = 4.5, bw = 43.75, bh = 16.25, br = 4.7, cw = 7.5, ch = 20, line = 'rgba(0,0,0,.35)';
  // the way through it, stems and body as one shape: grey beneath, and over that the current's colour, in two layers
  // (the new colour, and what was there before it) cut to length by a clip each, so the current can be seen to
  // cross it from the end it comes in at (see run.js)
  const way = gp => { for (const s of [-1, 1]) el('rect', { x: s < 0 ? x - BOX / 2 + inset : x + bw / 2 - cw / 2, y: y - sh / 2, width: BOX / 2 - inset - bw / 2 + cw / 2, height: sh }, gp);
    el('rect', { x: x - bw / 2, y: y - bh / 2, width: bw, height: bh, rx: br }, gp); };
  const sg = el('g', { fill: '#111', filter: 'url(#fShadow)' }, g);   // (the caps' shadow)
  for (const x0 of [x - bw / 2, x + bw / 2 - cw]) el('rect', { x: x0, y: y - ch / 2, width: cw, height: ch, rx: .4 }, sg);
  way(el('g', { fill: GREY }, g));
  const n = ++solMaskN, layer = nm => { const id = `fu1${nm}${n}`, r = el('rect', { x: x - BOX / 2, y: y - BOX / 2, width: 0, height: BOX }, el('clipPath', { id }, g)), lg = el('g', { fill: 'transparent', 'clip-path': `url(#${id})` }, g); way(lg); return { r, g: lg }; };
  v.old = layer('o'); v.cur = layer('c'); v.x0 = x - BOX / 2; v.span = BOX;
  el('rect', { x: x - bw / 2, y: y - bh / 2, width: bw, height: bh, rx: br, fill: 'url(#gGloss)' }, g);
  for (const x0 of [x - bw / 2, x + bw / 2 - cw]) {
    el('rect', { x: x0, y: y - ch / 2, width: cw, height: ch, rx: .4, fill: 'url(#gTerm)', stroke: line, 'stroke-width': .6 }, g);
    el('rect', { x: x0, y: y - ch / 2, width: cw, height: ch, rx: .4, fill: 'url(#gGloss)' }, g); }
  v.mark = el('g', { display: 'none' }, g);
  // blown: a clean break slanting through its body, the well showing through, the ends either side of it scorched;
  // and a red badge on the box's top right corner (top right as it is seen, however the fuse is turned)
  const sc = el('linearGradient', { id: `fu1s${n}`, x1: 0, x2: 1 }, v.mark);
  for (const [o, a] of [[0, 0], [.38, .55], [.5, .85], [.62, .55], [1, 0]]) el('stop', { offset: o, 'stop-color': '#000', 'stop-opacity': a }, sc);
  el('rect', { x: x - 12, y: y - bh / 2, width: 24, height: bh, fill: `url(#fu1s${n})` }, v.mark);
  const gx = 2.2, sl = 3.2, gy = bh / 2 + .8;
  el('path', { d: `M${x - gx + sl} ${y - gy}L${x + gx + sl} ${y - gy}L${x + gx - sl} ${y + gy}L${x - gx - sl} ${y + gy}Z`, fill: '#272727' }, v.mark);
  let [dx, dy] = [BOX / 2 - 3, -BOX / 2 + 3]; for (let r = 0; r < (4 - rot) % 4; r++) [dx, dy] = [-dy, dx];
  const bx = x + dx, by = y + dy;
  el('circle', { cx: bx, cy: by, r: 9, fill: '#1f1f1f', stroke: FU1_COL, 'stroke-width': 1.4 }, v.mark);
  el('circle', { cx: bx, cy: by, r: 6, fill: '#E8413C' }, v.mark);
  el('path', { d: `M${bx - 2.6} ${by - 2.6}L${bx + 2.6} ${by + 2.6}M${bx + 2.6} ${by - 2.6}L${bx - 2.6} ${by + 2.6}`, stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, v.mark);
  return v;
}
/* A disconnect, fuses, a starter's main contacts or an overload's heaters: one tall box with a pole on each of the
   three lines (see PWR_DY), its ends out to the left and right. The poles that are worked together (all but the
   fuses) are joined by a dashed line, as on a print; a disconnect has its handle on top. */
function drawPwr(p, g, x, y, v, chan) {
  v.lead = null; v.src = [];
  const H = PWR_H, edge = pwrEdge(p);
  terms(p).forEach(([tx, ty], i) => {
    const bx = tx < x ? x - BOX / 2 : x + BOX / 2;
    el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
    if (!editing && p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) });
  });
  framed('rect', { x: x - BOX / 2, y: y - H / 2, width: BOX, height: H, rx: 14, fill: 'url(#gWell)', stroke: edge, 'stroke-width': 2.2 }, g);
  if (p.t !== 'fus') el('line', { x1: x + 1, y1: y - PWR_DY + 4, x2: x + 1, y2: y + PWR_DY - 4, stroke: '#9a9a9a', 'stroke-width': 1.6, 'stroke-dasharray': '4 4' }, g);
  v.poles = [-1, 0, 1].map(k => {
    const py = y + k * PWR_DY, q = {};
    if (p.t === 'dsc' || p.t === 'mst') {
      // a relay contact's two posts, exactly (see drawPart); behind them, a starter's contact bar, which lifts off
      // them while open (a NO contact's), or a disconnect's blade, hinged on its left post, that swings up off the right
      const P = conPosts(g, x, py);
      q.bg = el('g', p.t === 'mst' ? { transform: `translate(0 ${-OPEN_LIFT})` } : {}, g); g.insertBefore(q.bg, P.a);
      const bx1 = p.t === 'mst' ? P.x1 - P.r * 1.15 : P.x1, bx2 = P.x2 + P.r * 1.15, bh = 7;
      q.blade = el('rect', { x: bx1, y: py - bh / 2, width: bx2 - bx1, height: bh, rx: bh / 2, fill: BLADE_GREY, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, q.bg);
      el('rect', { x: bx1, y: py - bh / 2, width: bx2 - bx1, height: bh, rx: bh / 2, fill: 'url(#gGloss)' }, q.bg);
      q.pa = P.a; q.pb = P.b; q.px = P.x1; q.py = py;
    } else if (p.t === 'fus') {
      // a fuse on each line: the single fuse's (see fuseBody)
      Object.assign(q, fuseBody(g, x, py, 0));
    } else {
      // an overload heater: the NEMA heater symbol, as a raised element
      q.e = rpath(g, `M${x - 27} ${py}H${x - 14}V${py - 16}H${x + 14}V${py}H${x + 27}`, 5.2);
    }
    return q;
  });
  if (p.t === 'dsc') {
    // its operating handle, on a head on top of the box: a selector switch's knob and handle (in red), turned to OFF
    // (left) or ON (right), the one it points to lit
    const top = y - H / 2 - DSC_HEAD, kx = x, ky = top + DSC_HEAD / 2 + 6;
    framed('rect', { x: x - BOX / 2, y: top, width: BOX, height: DSC_HEAD - 4, rx: 12, fill: 'url(#gWell)', stroke: DSC_COL, 'stroke-width': 2.2 }, g);
    v.offT = el('text', { x: x - 19, y: top + 15, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 800, fill: '#6a6a6a' }, g); v.offT.textContent = 'OFF';
    v.onT = el('text', { x: x + 19, y: top + 15, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 800, fill: DSC_HANDLE }, g); v.onT.textContent = 'ON';
    el('circle', { cx: kx, cy: ky, r: 13, fill: 'url(#gKnob)', stroke: '#1d2733', 'stroke-width': 1.2, filter: 'url(#fShadow)' }, g);
    v.lever = el('g', { transform: `rotate(45 ${kx} ${ky})` }, g); v.hx = kx; v.hy = ky;
    el('rect', { x: kx - 4.5, y: ky - 14, width: 9, height: 28, rx: 4.5, fill: DSC_HANDLE, stroke: '#1d2733', 'stroke-width': 1.1 }, v.lever);
    el('rect', { x: kx - 4.5, y: ky - 14, width: 9, height: 28, rx: 4.5, fill: 'url(#gGloss)' }, v.lever);
    el('line', { x1: kx, y1: ky - 11, x2: kx, y2: ky - 5, stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: .85 }, v.lever);
  }
  if (p.t === 'olh') { v.trip = el('text', { x, y: y + H / 2 + 22, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: '#ff8a7a', display: 'none', stroke: '#404040', 'stroke-width': 4, 'paint-order': 'stroke' }, g); v.trip.textContent = 'TRIPPED'; }
}
/* A motor: a square box, T1, T2 and T3 down its left side; a ring that takes on the colour of the phase at each terminal
   (a third of it each), round a fan that turns while it runs (an arrow beside it shows which way: clockwise forward)
   and shakes while it hums */
function drawMtr(p, g, x, y, v, chan) {
  v.lead = null; v.src = [];
  const H = MTR_H, x0 = x - MTR_W / 2, cx = x + 22, R = 92;
  terms(p).forEach(([tx, ty], i) => {
    el('line', { x1: tx, y1: ty, x2: x0, y2: ty, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
    if (!editing && p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: tx, y1: ty, x2: x0, y2: ty, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) });
  });
  framed('rect', { x: x0, y: y - H / 2, width: MTR_W, height: H, rx: 22, fill: 'url(#gWell)', stroke: MTR_COL, 'stroke-width': 2.2 }, g);
  [-1, 0, 1].forEach((k, i) => { const ty = y + k * PWR_DY, tx = x0 + 24;
    el('rect', { x: tx - 13, y: ty - 12, width: 26, height: 24, rx: 6, fill: '#1f1f1f', stroke: '#e2cc85', 'stroke-width': 1.2 }, g);
    el('text', { x: tx, y: ty + 4.3, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700, fill: '#f2e6b8' }, g).textContent = 'T' + (i + 1); });
  el('circle', { cx, cy: y, r: R + 5, fill: '#111', filter: 'url(#fShadow)' }, g);
  v.arcs = [0, 1, 2].map(i => { const a0 = (i * 120 - 150) * Math.PI / 180, a1 = ((i + 1) * 120 - 150) * Math.PI / 180;
    return el('path', { d: `M${cx + R * Math.cos(a0)} ${y + R * Math.sin(a0)}A${R} ${R} 0 0 1 ${cx + R * Math.cos(a1)} ${y + R * Math.sin(a1)}`, fill: 'none', stroke: GREY, 'stroke-width': 9 }, g); });
  el('circle', { cx, cy: y, r: R - 7, fill: '#262626', stroke: '#111', 'stroke-width': 1.5 }, g);
  const at = el('g', { transform: `translate(${cx} ${y})` }, g);
  v.rotor = el('g', {}, at);   // (it turns about its hub, see paintMtr)
  const fan = el('g', { transform: `scale(${(R / 70).toFixed(3)})` }, v.rotor);
  for (let i = 0; i < 6; i++) el('path', { d: 'M0 -12C22 -30 30 -48 12 -56L-6 -48C8 -38 6 -26 0 -12Z', transform: `rotate(${i * 60})`, fill: '#6a7077', stroke: '#1c1c1c', 'stroke-width': 1.2 }, fan);
  rdot(fan, 0, 0, 13).setAttribute('fill', '#7a8087');
  el('text', { x: 0, y: 6, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, fill: '#1c1c1c' }, at).textContent = 'M';
  // which way it turns (shown while it runs): an arc just outside the ring at its lower right, its head the way the fan
  // goes (clockwise, so down that side, forward; turned over, up it, backward)
  const ra = R + 13, pt = a => [cx + ra * Math.cos(a * Math.PI / 180), y + ra * Math.sin(a * Math.PI / 180)];
  const [sx, sy] = pt(8), [tx, ty] = pt(52), tg = [-Math.sin(52 * Math.PI / 180), Math.cos(52 * Math.PI / 180)], bk = [-tg[0], -tg[1]], pp = [-bk[1], bk[0]];
  v.arrow = el('g', { display: 'none' }, g);
  v.arrowPath = el('g', {}, v.arrow);
  el('path', { d: `M${sx} ${sy}A${ra} ${ra} 0 0 1 ${tx} ${ty}`, fill: 'none', stroke: '#9be03a', 'stroke-width': 3, 'stroke-linecap': 'round' }, v.arrowPath);
  el('path', { d: `M${tx + 9 * bk[0] + 5.5 * pp[0]} ${ty + 9 * bk[1] + 5.5 * pp[1]}L${tx} ${ty}L${tx + 9 * bk[0] - 5.5 * pp[0]} ${ty + 9 * bk[1] - 5.5 * pp[1]}`, fill: 'none', stroke: '#9be03a', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, v.arrowPath);
  v.dir = el('text', { x: x + MTR_W / 2 - 14, y: y + H / 2 - 12, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 800, fill: '#9be03a' }, v.arrow);
  v.hum = el('text', { x: cx, y: y + H / 2 - 14, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#ff8a7a', display: 'none' }, g); v.hum.textContent = 'Humming: a phase is missing';
  v.cx = cx; v.cy = y;
}

// a relay contact's two posts (as drawPart draws them): a short stub in from each side, and a round post at its end,
// domed; returns each post (to colour) and where they are
function conPosts(g, x, py) {
  const B = BOX, sy = B * .045, r = B * .105, L = x - B / 2, inset = 4.5, x1 = L + B * .25, x2 = L + B * .75;
  const a = el('g', { fill: GREY }, g), b = el('g', { fill: GREY }, g);
  el('rect', { x: L + inset, y: py - sy, width: B * .25 - inset, height: 2 * sy }, a); el('circle', { cx: x1, cy: py, r }, a);
  el('rect', { x: L + B * .75, y: py - sy, width: B * .25 - inset, height: 2 * sy }, b); el('circle', { cx: x2, cy: py, r }, b);
  const gl = el('g', { fill: 'url(#gDome)' }, g);
  el('circle', { cx: x1, cy: py, r }, gl); el('circle', { cx: x2, cy: py, r }, gl);
  return { a, b, x1, x2, r };
}

/* A limit switch: a roomy square body (in its colour) holding the NEMA limit switch symbol, raised: a contact's two
   posts, and a blade hinged on the left one, with the solid wedge under it. Its angle tells its kind and state, as on
   the print: normally open, it hangs below the right post (open) and is lifted onto its underside (closed); normally
   closed, it rests on top of the right post (closed) and is lifted clear above it (open). Working it always lifts the
   blade. On top of the body, the roller lever it is worked by, and a bold arrow, the machine coming down on the roller.
   (Painted by setLimit; working it eases from one position to the other over LSW_MOVE seconds.) */
const LSW_WEDGE = [[0, 0], [51.3, 0], [35.8, 16.9]];
const LSW_ROLLER = [43, -42];   // (the roller, from the head's middle: up and to the right)   // (the wedge, along the blade and out below it, from its hinge)
const LSW_TOUCH = Math.atan((BOX * .105 + 3.5) / 60) * 180 / Math.PI;   // (the blade's angle lying on a post's edge)
const lswAngles = p => p.nc ? [-LSW_TOUCH, -LSW_OPEN] : [LSW_OPEN, LSW_TOUCH];   // (at rest, and worked)
function drawLimit(p, g, x, y, v) {
  const col = p.color, r = BOX * .105, px1 = x - 30, px2 = x + 30, sy = BOX * .045, hw = LSW_W / 2, top = y - LSW_TOP, bot = y + LSW_BOT;
  // its head: the roller lever, out of a dome on top of the body at 45 degrees, up to the right; the arrow comes down on its roller
  const hc = [x, top]; v.pivot = hc;
  v.arrow = el('g', { filter: 'url(#fShadow)' }, g);
  v.arrowPath = el('path', { d: '', fill: '#ececec', stroke: '#1c1c1c', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, v.arrow);
  v.lever = el('g', {}, g);
  const [lx, ly] = LSW_ROLLER;
  el('line', { x1: x, y1: top, x2: x + lx, y2: top + ly, stroke: '#111', 'stroke-width': 10.6, 'stroke-linecap': 'round', filter: 'url(#fShadow)' }, v.lever);
  el('line', { x1: x, y1: top, x2: x + lx, y2: top + ly, stroke: '#b5b5b5', 'stroke-width': 8 }, v.lever);
  el('line', { x1: x, y1: top, x2: x + lx, y2: top + ly, stroke: 'url(#gGloss)', 'stroke-width': 8 }, v.lever);
  el('circle', { cx: x + lx, cy: top + ly, r: 13.3, fill: '#2b2b2b', stroke: '#c8c8c8', 'stroke-width': 3, filter: 'url(#fShadow)' }, v.lever);
  el('circle', { cx: x + lx, cy: top + ly, r: 6.2, fill: 'url(#gTerm)', stroke: '#111', 'stroke-width': 1.2 }, v.lever);
  framed('path', { d: `M${x - 27} ${top + 2}A27 27 0 0 1 ${x + 27} ${top + 2}Z`, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  // the body, the contact in its upper part
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: LSW_TOP + LSW_BOT, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  // the dashed link, from the head down to just over the blade (it follows it), and the blade and its wedge (behind
  // the posts), turning about the left post
  v.link = el('line', { x1: x, y1: top + 5, x2: x, y2: y, stroke: '#9a9a9a', 'stroke-width': 2.2, 'stroke-dasharray': '6 5' }, g);
  v.blade = el('g', {}, g);
  const wedge = 'M' + LSW_WEDGE.map(([a, b]) => `${px1 + a} ${y + b}`).join('L') + 'Z', len = 60 + r * .6;
  v.wedge = el('path', { d: wedge, fill: BLADE_GREY, stroke: '#111', 'stroke-width': 1.2, 'stroke-linejoin': 'round', filter: 'url(#fShadow)' }, v.blade);
  el('path', { d: wedge, fill: 'url(#gGloss)', opacity: .7 }, v.blade);
  v.bladeShape = el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: BLADE_GREY, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, v.blade);
  el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, v.blade);
  v.hinge = [px1, y];
  // the posts: a stub in from each side, a round post at its end (as a relay contact's)
  v.posts = el('g', { fill: GREY }, g);
  el('rect', { x: x - hw + 4.5, y: y - sy, width: px1 - (x - hw + 4.5), height: 2 * sy }, v.posts); el('circle', { cx: px1, cy: y, r }, v.posts);
  el('rect', { x: px2, y: y - sy, width: x + hw - 4.5 - px2, height: 2 * sy }, v.posts); el('circle', { cx: px2, cy: y, r }, v.posts);
  for (const cx of [px1, px2]) el('circle', { cx, cy: y, r, fill: 'url(#gDome)' }, g);
  // its number, and NO or NC, in its bottom corners
  el('rect', { x: x - hw + 7, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: x - hw + 23, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = 'LS' + p.L;
  el('rect', { x: x + hw - 37, y: bot - 25, width: 30, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: x + hw - 22, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = p.nc ? 'NC' : 'NO';
  setLimit(v, p, editing ? (p.held ? 1 : 0) : lswPos(p), editing ? !!p.nc !== !!p.held : lswClosed(p));
}
/* A temperature switch (Dallas's design): the limit switch's body, its head left off, and the same contact (posts and a
   blade hinged on the left one); under the blade the NEMA temperature switch's stepped stem, which turns with it. Joined
   to the body's right side, a sensing bulb's box with a thermometer: its column red up to the temperature (low while
   at rest, high while worked). The body sits left of the middle, so the two together are centred, the right-hand end
   leading out through the bulb's box. Its number and NO or NC in the body's bottom corners. */
function drawTemp(p, g, x, y, v) {
  const col = p.color, r = BOX * .105, sy = BOX * .045, hw = LSW_W / 2, bx = x - TSW_SB / 2, top = y - LSW_TOP, bot = y + LSW_BOT;
  const px1 = bx - 30, px2 = bx + 30;
  // the bulb's box, and its thermometer
  const sx = bx + hw - 6, sw = TSW_SB + 6, st = top + 20, sh = LSW_TOP + LSW_BOT - 40;
  framed('rect', { x: sx, y: st, width: sw, height: sh, rx: 9, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  // the thermometer (Dallas's design): a grey glass tube outlined in black, its bulb at the foot, a scale of ticks
  // down its right side, and the column inside it in the switch's colour (red, high; blue, low) up to the temperature
  const tx = sx + sw / 2 + 4, cTop = st + 12, by = st + sh - 13, R = 8, tw = 8, iw = 4.4;
  el('rect', { x: tx - tw / 2 - 1.2, y: cTop - tw / 2 - 1.2, width: tw + 2.4, height: by - cTop + tw / 2 + 1.2, rx: tw / 2 + 1.2, fill: '#111' }, g);
  el('circle', { cx: tx, cy: by, r: R + 1.2, fill: '#111' }, g);
  el('rect', { x: tx - tw / 2, y: cTop - tw / 2, width: tw, height: by - cTop + tw / 2, rx: tw / 2, fill: '#9a9a9a' }, g);
  el('circle', { cx: tx, cy: by, r: R, fill: '#9a9a9a' }, g);
  el('rect', { x: tx - iw / 2, y: cTop - iw / 2, width: iw, height: by - cTop + iw / 2, rx: iw / 2, fill: '#6b6b6b' }, g);
  const tc = p.low ? TSW_COLD : TSW_HOT;   // (a low temperature switch's thermometer blue, a high one's red)
  v.col = el('rect', { x: tx - iw / 2, y: by, width: iw, height: 2, fill: tc }, g); v.cTop = cTop; v.cBot = by - R + 1;
  el('circle', { cx: tx, cy: by, r: R - 1.8, fill: tc }, g);
  const tk = el('g', { stroke: '#111', 'stroke-width': .9 }, g), n = 8;
  for (let k = 0; k < n; k++) { const yy = cTop + 3 + k * (by - R - 3 - cTop) / (n - 1); el('line', { x1: tx + (k % 2 ? 1.6 : 0), y1: yy, x2: tx + tw / 2 + 1.2, y2: yy }, tk); }
  // on top of the bulb's box, its badge: a red arrow up, high; a blue arrow down, low (Dallas, 20 Nov 2026: arrows, as on the others)
  hlBadge(g, tx, st - 1, p.low, col);
  // the body, and in it the contact: the blade (behind the posts) with its stem, turning about the left post
  framed('rect', { x: bx - hw, y: top, width: LSW_W, height: LSW_TOP + LSW_BOT, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  v.blade = el('g', {}, g);
  const len = 60 + r * .6, s0 = px1 + 30, s1 = y + 2;
  const stem = `M${s0} ${s1}V${s1 + 10.6}H${s0 + 8.6}V${s1 + 19.2}H${s0}V${s1 + 25.6}`;
  el('path', { d: stem, fill: 'none', stroke: '#111', 'stroke-width': 6.4, 'stroke-linejoin': 'miter', filter: 'url(#fShadow)' }, v.blade);
  v.stem = el('path', { d: stem, fill: 'none', stroke: BLADE_GREY, 'stroke-width': 4.3, 'stroke-linejoin': 'miter' }, v.blade);
  v.bladeShape = el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: BLADE_GREY, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, v.blade);
  el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, v.blade);
  v.hinge = [px1, y];
  v.posts = el('g', { fill: GREY }, g);
  el('rect', { x: bx - hw + 4.5, y: y - sy, width: px1 - (bx - hw + 4.5), height: 2 * sy }, v.posts); el('circle', { cx: px1, cy: y, r }, v.posts);
  el('rect', { x: px2, y: y - sy, width: bx + hw - 4.5 - px2, height: 2 * sy }, v.posts); el('circle', { cx: px2, cy: y, r }, v.posts);
  for (const cx of [px1, px2]) el('circle', { cx, cy: y, r, fill: 'url(#gDome)' }, g);
  el('rect', { x: bx - hw + 7, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: bx - hw + 23, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = 'TS' + p.L;
  el('rect', { x: bx + hw - 37, y: bot - 25, width: 30, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: bx + hw - 22, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = (p.nc ? 'NC' : 'NO') + (p.low ? '↓' : '↑');   // (works as it gets colder, or hotter)
  setTemp(v, p, editing ? 0 : lswPos(p), editing ? !!p.nc : lswClosed(p));
}
// a temperature switch pos of the way from at rest (0) to worked (1): the thermometer's column up from low to high,
// its blade turned as the limit switch's; lit in its colour while closed
// (a high temperature switch: its column from low up to high as it is worked; a low one's from the middle down to low)
const TSW_HOT = '#FF3333', TSW_COLD = '#0073FF', TSW_LV = p => p.low ? [.55, .12] : [.25, .85];
function setTemp(v, p, pos, cl) {
  const f = pvFrac(p), k = pos.toFixed(3) + (cl ? 'c' : 'o') + (f === null ? '' : f.toFixed(3));   // (f: linked to a process value, where it stands in its range)
  if (v.k === k) return; v.k = k;
  const [hx, hy] = v.hinge, [a0, a1] = lswAngles(p), ba = lerp(a0, a1, pos);
  v.blade.setAttribute('transform', `rotate(${ba.toFixed(2)} ${hx} ${hy})`);
  const c = cl ? p.color : BLADE_GREY;
  v.bladeShape.setAttribute('fill', c); v.stem.setAttribute('stroke', c); v.posts.setAttribute('fill', cl ? p.color : GREY);
  const [l0, l1] = TSW_LV(p), lv = v.cBot - (v.cBot - v.cTop) * (f === null ? lerp(l0, l1, pos) : f);
  v.col.setAttribute('y', lv.toFixed(2)); v.col.setAttribute('height', (v.cBot - lv + 2).toFixed(2));
}
/* High and low (Dallas, 20 Nov 2026): a temperature, pressure, flow or float switch comes in a high kind (acts as its value
   rises) and a low one (acts as it falls). A badge on its instrument says which: a red arrow up, or a blue arrow down (on a
   temperature switch too, in place of the flame and snowflake it had). And the instrument works the other way (a low
   switch's value is up at rest and falls as it is worked). */
const HL_HI = '#FF3333', HL_LO = '#0073FF', HL_LOB = '#3F9BFF';   // (HL_LOB: the badge's blue, a little lighter to show on its dark face)
function hlBadge(g, cx, cy, low, col, r = 9) {
  const b = el('g', { 'pointer-events': 'none' }, g), s = r / 9, c = low ? HL_LOB : HL_HI, d = low ? 1 : -1;   // (d: the arrow's head, down or up)
  el('circle', { cx, cy, r: r + 1.2 * s, fill: '#111' }, b);
  el('circle', { cx, cy, r, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.4 * s }, b);
  el('path', { d: `M${cx} ${cy + d * 5.8 * s}L${cx - 4.8 * s} ${cy + d * .6 * s}H${cx - 1.8 * s}V${cy - d * 5.4 * s}H${cx + 1.8 * s}V${cy + d * .6 * s}H${cx + 4.8 * s}Z`, fill: c }, b);
  return b;
}
/* A pressure switch (Dallas's design): the limit switch's body and contact; on a neck on top of the body, right of the
   middle, a pressure gauge (chrome bezel, white face, a scale, the red needle low at rest and swinging up as it is
   worked); under the blade, the NEMA pressure switch's diaphragm (a dome) and its stem, pushed up as the pressure rises
   so as to close a normally open blade, or lift a normally closed one off its post. Its number and NO or NC in the
   body's bottom corners. (Dallas's drawing was 190 wide: k scales it to the limit switch's 110.) */
const PSW_K = 110 / 190;
function drawPress(p, g, x, y, v) {
  const k = PSW_K, col = p.color, r = BOX * .105, sy = BOX * .045, hw = LSW_W / 2, top = y - LSW_TOP, bot = y + LSW_BOT, px1 = x - 30, px2 = x + 30;
  // the gauge, on its stem out of the neck
  const gx = x + 44 * k, gy = top - (164.4 - 77) * k, R = 40 * k;
  el('rect', { x: gx - 10 * k, y: gy + 13, width: 20 * k, height: top - gy - 9, fill: 'url(#gTerm)', stroke: '#111', 'stroke-width': 1 }, g);
  el('rect', { x: gx - 10 * k, y: gy + 13, width: 20 * k, height: top - gy - 9, fill: 'url(#gGloss)' }, g);
  const nb = top + 2.5, nt = top - 30 * k, w1 = 30 * k, w0 = 25 * k;
  framed('path', { d: `M${gx - w1} ${nb}L${gx - w0} ${nt}H${gx + w0}L${gx + w1} ${nb}Z`, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, g);
  el('circle', { cx: gx, cy: gy, r: R + 1, fill: '#111', filter: 'url(#fShadow)' }, g);
  el('circle', { cx: gx, cy: gy, r: R, fill: 'url(#gChrome)', stroke: '#4a4a4a', 'stroke-width': 1 }, g);
  el('circle', { cx: gx, cy: gy, r: 35.5 * k, fill: '#242424' }, g);
  el('circle', { cx: gx, cy: gy, r: 33 * k, fill: 'url(#gFace)' }, g);
  for (const a of [-135, -90, -45, 0, 45, 135, 180]) { const t = a * Math.PI / 180;   // (the scale: none at the foot)
    el('line', { x1: gx + 23 * k * Math.cos(t), y1: gy + 23 * k * Math.sin(t), x2: gx + 31 * k * Math.cos(t), y2: gy + 31 * k * Math.sin(t), stroke: '#1c1c1c', 'stroke-width': 1.3 }, g); }
  // (its zone on the face, where it acts: red at the top of the scale on a high switch, blue at the foot of it on a low one)
  { const [z0, z1] = p.low ? [135, 200] : [340, 405], zr = 27 * k, rad = a => a * Math.PI / 180, P = a => `${(gx + zr * Math.cos(rad(a))).toFixed(2)} ${(gy + zr * Math.sin(rad(a))).toFixed(2)}`;
    el('path', { d: `M${P(z0)}A${zr.toFixed(2)} ${zr.toFixed(2)} 0 0 1 ${P(z1)}`, fill: 'none', stroke: p.low ? HL_LO : HL_HI, 'stroke-width': 3.2, opacity: .85 }, g); }
  v.needle = el('g', { filter: 'url(#fShadow)' }, g); v.gc = [gx, gy];
  const nl = 22 * k;
  el('line', { x1: gx, y1: gy, x2: gx + nl, y2: gy, stroke: '#CC0000', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, v.needle);
  el('path', { d: `M${gx + nl + 1.5} ${gy}L${gx + nl - 4.2} ${gy - 2.6}L${gx + nl - 4.2} ${gy + 2.6}Z`, fill: '#CC0000' }, v.needle);
  el('circle', { cx: gx, cy: gy, r: 2.2, fill: '#CC0000' }, v.needle); el('circle', { cx: gx, cy: gy, r: 2.2, fill: 'url(#gDome)' }, g);
  el('circle', { cx: gx, cy: gy, r: 33 * k, fill: 'url(#gGloss)', opacity: .35 }, g);
  // the body
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: LSW_TOP + LSW_BOT, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  hlBadge(g, x - hw + 22, top, p.low, col);   // (the badge, on the body's top left corner)
  // the diaphragm and its stem (they rise together; the stem reaches up to the blade's underside)
  const dTop = y + 61 * k, dBot = y + 86 * k, dw = 23 * k, sw = 12 * k;
  const dome = `M${x - dw} ${dBot}V${dBot - 2}C${x - dw} ${dTop + 1} ${x - dw * .55} ${dTop} ${x} ${dTop}C${x + dw * .55} ${dTop} ${x + dw} ${dTop + 1} ${x + dw} ${dBot - 2}V${dBot}Z`;
  v.dg = el('g', {}, g);
  v.stemSh = el('line', { x1: x, y1: y, x2: x, y2: dTop + 2, stroke: '#111', 'stroke-width': sw, 'stroke-linecap': 'round', filter: 'url(#fShadow)' }, v.dg);
  el('path', { d: dome, fill: '#111', filter: 'url(#fShadow)' }, v.dg);
  v.stem = el('line', { x1: x, y1: y, x2: x, y2: dTop + 2, stroke: BLADE_GREY, 'stroke-width': sw, 'stroke-linecap': 'round' }, v.dg);
  v.dome = el('path', { d: dome, fill: BLADE_GREY }, v.dg);
  el('path', { d: dome, fill: 'url(#gGloss)', opacity: .8 }, v.dg);
  v.dTop = dTop;
  // the blade, hinged on the left post, and the posts
  v.blade = el('g', {}, g); const len = 60 + r * .6;
  v.bladeShape = el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: BLADE_GREY, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, v.blade);
  el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, v.blade);
  v.hinge = [px1, y];
  v.posts = el('g', { fill: GREY }, g);
  el('rect', { x: x - hw + 4.5, y: y - sy, width: px1 - (x - hw + 4.5), height: 2 * sy }, v.posts); el('circle', { cx: px1, cy: y, r }, v.posts);
  el('rect', { x: px2, y: y - sy, width: x + hw - 4.5 - px2, height: 2 * sy }, v.posts); el('circle', { cx: px2, cy: y, r }, v.posts);
  for (const cx of [px1, px2]) el('circle', { cx, cy: y, r, fill: 'url(#gDome)' }, g);
  el('rect', { x: x - hw + 7, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: x - hw + 23, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = 'PS' + p.L;
  el('rect', { x: x + hw - 37, y: bot - 25, width: 30, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: x + hw - 22, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = (p.nc ? 'NC' : 'NO') + (p.low ? '↓' : '↑');   // (works as it falls, or rises)
  setPress(v, p, editing ? 0 : lswPos(p), editing ? !!p.nc : lswClosed(p));
}
// a pressure switch pos of the way from at rest (0) to worked (1): the needle from low to high, the diaphragm and stem
// pushed up, the blade turned as the limit switch's; lit in its colour while closed
function setPress(v, p, pos, cl) {
  const f = pvFrac(p), k = pos.toFixed(3) + (cl ? 'c' : 'o') + (f === null ? '' : f.toFixed(3));
  if (v.k === k) return; v.k = k;
  const [hx, hy] = v.hinge, [a0, a1] = lswAngles(p), ba = lerp(a0, a1, pos), at = a => Math.tan(a * Math.PI / 180) * 30;
  v.blade.setAttribute('transform', `rotate(${ba.toFixed(2)} ${hx} ${hy})`);
  // (the stem's top just under the blade, at the middle; the diaphragm lifted by however far the blade has risen)
  const lift = Math.max(0, at(lswAngles({ nc: false })[0]) - at(ba)), sTop = hy + at(ba) + 2 + lift;
  v.dg.setAttribute('transform', `translate(0 ${(-lift).toFixed(2)})`);
  for (const s of [v.stem, v.stemSh]) s.setAttribute('y1', sTop.toFixed(2));
  const c = cl ? p.color : BLADE_GREY;
  v.bladeShape.setAttribute('fill', c); v.stem.setAttribute('stroke', c); v.dome.setAttribute('fill', c); v.posts.setAttribute('fill', cl ? p.color : GREY);
  const [gx, gy] = v.gc; v.needle.setAttribute('transform', `rotate(${(f === null ? (p.low ? lerp(310, 168, pos) : lerp(135, 340, pos)) : 135 + 270 * f).toFixed(2)} ${gx} ${gy})`);   // (a low switch's needle well up at rest, falling as it is worked)   // (linked: the value, round its whole scale)
}
/* A flow switch (Dallas's design, 15 Nov 2026): the limit switch's body and contact; on a neck and two supports on top,
   a length of pipe with flanged ends. Up into the pipe from its bottom wall (its round foot set down in the wall), a
   flexible strip with a rectangular paddle on its end: upright with no flow, bent over downstream (right, and down) as
   the water pushes it. The pipe is always full of water; while it flows, streaks drift through it left to right
   (faster with more flow, when a Flow value works it). Under the blade, fixed to it as the temperature switch's
   stem is (hanging straight down at rest), the NEMA flow switch's stem with its flag. Its number and NO or NC in the
   body's bottom corners. The pipe, neck and paddle are drawn in Dallas's units (his body 190 wide), scaled by FSW_K. */
const FSW_K = 110 / 190, FSW_PAD = 11, FSW_BEND = 85, FSW_BASE = 8;   // (the strip's length, in his units, short enough that the paddle clears the pipe's top; how far it bends over, in degrees)
/* The water in a flow switch's pipe (Dallas, 15 Nov 2026): the pipe is always full; the flow is shown by its streaks,
   which appear as the water starts to move and gather speed slowly (easing towards their speed over about FSW_TAU s),
   then slow down and fade away once the flow stops. Their speed is in proportion to the flow: FSW_V units a second (in
   Dallas's units) at full flow; by hand, FSW_HAND of full flow. Moved on every frame by the clock (real time); each
   switch's water is kept in FLOW (all views share it). */
// the vane on the strip's end, along it from its end (x) and across it (y, upstream negative): a plate a little wider than
// the strip, its upstream face cupped in to catch the water, the edges round
const FSW_VANE = 'M-0.4 -3.6Q5.5 -0.6 11.4 -3.6Q12.6 -3.6 12.6 -2.2V2.3Q12.6 3.7 11.2 3.7H0.4Q-1 3.7 -1 2.3V-2.2Q-1 -3.6 -0.4 -3.6Z';
const FSW_X0 = 62.5, FSW_V = 200, FSW_HAND = .6, FSW_TAU = 1.2, FSW_SEEN = 40, FLOW = {};   // (FSW_SEEN: the speed by which the streaks are fully shown)
let FSW_N = 0;   // (each pipe's clip its own id, in every view)
const fswRate = p => { const f = pvFrac(p); return f === null ? (lswAct(p) !== !!p.low ? FSW_HAND : 0) : f > .001 ? f : 0; };   // (by hand, a low flow switch's water flows at rest and stops as it is worked)
function flowTick(dt) {
  for (const p of parts) if (p.t === 'fsw') {
    // (the speed signed: + left to right, - right to left, while the pump driving its Flow value runs in reverse; going
    // from one to the other it slows, stops and gathers speed the other way)
    const dir = pvOf(p) ? PVDIR[p.pv] || 1 : 1;
    const w = FLOW[p.id] || (FLOW[p.id] = { sp: 0, ph: 0, k: '' }), to = editing ? 0 : FSW_V * fswRate(p) * dir;
    w.sp += (to - w.sp) * Math.min(1, dt / FSW_TAU); if (!to && Math.abs(w.sp) < 3) w.sp = 0;   // (all but stopped: stopped)
    w.ph = ((w.ph + w.sp * dt) % 100 + 100) % 100;
    const fd = Math.max(-1, Math.min(1, w.sp / FSW_SEEN)), op = Math.abs(fd), k = w.ph.toFixed(1) + '/' + fd.toFixed(2);
    if (k === w.k) continue; w.k = k;   // (nothing moving: nothing touched)
    for (const V of VIEWS) { const v = V.parts.get(p.id); if (!v || !v.streaks) continue;
      v.streaks.setAttribute('transform', `translate(${w.ph.toFixed(2)} 0)`); v.streaks.setAttribute('opacity', op.toFixed(3));
      v.fd = fd; fswPaddle(v); }
  }
}
function drawFlow(p, g, x, y, v) {
  const k = FSW_K, col = p.color, r = BOX * .105, sy = BOX * .045, hw = LSW_W / 2, top = y - LSW_TOP, bot = y + LSW_BOT, px1 = x - 30, px2 = x + 30;
  // the pipe and what holds it, in Dallas's units (his wire at 208.6, his body's middle at 161)
  const t = el('g', { transform: `translate(${(x - 161 * k).toFixed(2)} ${(y - 208.6 * k).toFixed(2)}) scale(${k})` }, g);
  for (const sx of [105.5, 195.5]) { el('rect', { x: sx, y: 107, width: 20, height: 32, fill: 'url(#gFlange)', stroke: '#111', 'stroke-width': 1.4 }, t); }
  el('path', { d: 'M130 140L135 102H185L190 140Z', fill: '#242424' }, t);
  el('path', { d: 'M135 136L139 106.7H181L185 136', fill: 'none', stroke: col, 'stroke-width': 2.6 }, t);
  el('rect', { x: 61.5, y: 61.5, width: 200, height: 52, rx: 7.8, fill: 'url(#gPipe)', stroke: '#111', 'stroke-width': 1.4, filter: 'url(#fShadow)' }, t);
  el('rect', { x: 61.5, y: 71.5, width: 200, height: 32, rx: 4.8, fill: '#242424', stroke: '#111', 'stroke-width': 1.4 }, t);
  // the water, always there: a blue fill, and streaks drifting through it while it flows (a band longer than the pipe,
  // slid along one period and over again; flowTick moves them, by the frame clock, and fades them in and out)
  const cid = 'fswc' + (++FSW_N), cp = el('clipPath', { id: cid }, t);
  el('rect', { x: FSW_X0, y: 72.5, width: 198, height: 30, rx: 4 }, cp);
  v.water = el('g', { 'clip-path': `url(#${cid})` }, t);
  el('rect', { x: 61.5, y: 71.5, width: 200, height: 32, fill: 'url(#gWater)' }, v.water);
  v.streaks = el('g', { opacity: 0 }, v.water);
  for (let o = -100; o < 300; o += 100) for (const [sx, sy2] of [[8, 79], [38, 87], [18, 95], [62, 83], [80, 92]])
    el('line', { x1: 61.5 + o + sx, y1: sy2, x2: 61.5 + o + sx + 22, y2: sy2, stroke: '#cfe6ff', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: .75 }, v.streaks);
  // the paddle: its strip (an arc of FSW_PAD, bent pos of the way over) and the rectangle on its end
  v.pad = el('g', {}, t);
  // (Dallas, 20 Nov 2026: shaded as a round rod, darker at its edges, a light line down it; on its end a curved vane, cupped to
  // catch the water coming at it, shaded as metal; the strip stands up out of the wall before it bends, and no part of it but
  // its foot ever touches a wall)
  v.padSh = el('path', { fill: 'none', stroke: '#111', 'stroke-width': 7.5, 'stroke-linecap': 'round' }, v.pad);
  v.padStrip = el('path', { fill: 'none', stroke: '#9aa1a8', 'stroke-width': 5, 'stroke-linecap': 'round' }, v.pad);
  v.padLit = el('path', { fill: 'none', stroke: '#e9edf1', 'stroke-width': 1.7, 'stroke-linecap': 'round' }, v.pad);
  v.padEnd = el('g', {}, v.pad);
  el('path', { d: FSW_VANE, fill: 'url(#gPaddle)', stroke: '#111', 'stroke-width': 1.3, 'stroke-linejoin': 'round' }, v.padEnd);
  el('path', { d: 'M0.6 -1.9Q5.5 0.9 10.4 -1.9', fill: 'none', stroke: 'rgba(0,0,0,.28)', 'stroke-width': 1.1, 'stroke-linecap': 'round' }, v.padEnd);   // (the hollow)
  el('path', { d: 'M0.4 -2.9Q5.5 0 10.6 -2.9', fill: 'none', stroke: 'rgba(255,255,255,.8)', 'stroke-width': .8, 'stroke-linecap': 'round' }, v.padEnd);   // (its lip, catching the light)
  el('circle', { cx: 160, cy: 107, r: 4, fill: '#5d636a', stroke: '#111', 'stroke-width': 1 }, t);
  // the pipe's bottom wall laid again over the strip's foot, so the foot sits down in the wall; then the flanges over the ends
  el('rect', { x: 61.5, y: 103.5, width: 200, height: 10, fill: 'url(#gPipeLow)' }, t);
  el('path', { d: 'M61.5 103.5H261.5M61.5 113.5H261.5', stroke: '#111', 'stroke-width': 1.4 }, t);
  for (const fx of [58.5, 250.5]) { el('rect', { x: fx, y: 52.5, width: 14, height: 70, rx: 2.1, fill: 'url(#gFlange)', stroke: '#111', 'stroke-width': 1.4 }, t); el('rect', { x: fx, y: 52.5, width: 14, height: 70, rx: 2.1, fill: 'url(#gGloss)', opacity: .6 }, t); }
  hlBadge(t, 222, 61.5, p.low, col, 15.5);   // (the badge, on the pipe's top)
  // the body
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: LSW_TOP + LSW_BOT, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  // the blade, hinged on the left post, with the stem and its flag fixed to it (hanging straight down while it is at rest)
  v.blade = el('g', {}, g); const len = 60 + r * .6, sx0 = px1 + 57.5 * k, a0 = lswAngles(p)[0];
  const sf = el('g', { transform: `rotate(${(-a0).toFixed(2)} ${sx0.toFixed(2)} ${y})` }, v.blade), sw = 12 * k, sl = 70 * k;
  el('rect', { x: sx0 - sw / 2 - 1, y: y, width: sw + 2, height: sl + 1, fill: '#111', filter: 'url(#fShadow)' }, sf);
  v.stem = el('rect', { x: sx0 - sw / 2, y: y, width: sw, height: sl, fill: BLADE_GREY }, sf);
  el('rect', { x: sx0 - sw / 2, y: y, width: sw, height: sl, fill: '#000', opacity: .2 }, sf);
  v.flag = el('path', { d: `M${sx0 + sw / 2} ${y + sl}V${y + 30 * k}L${sx0 + sw / 2 + 30 * k} ${y + sl}Z`, fill: BLADE_GREY }, sf);
  v.bladeShape = el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: BLADE_GREY, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, v.blade);
  el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, v.blade);
  v.hinge = [px1, y];
  v.posts = el('g', { fill: GREY }, g);
  el('rect', { x: x - hw + 4.5, y: y - sy, width: px1 - (x - hw + 4.5), height: 2 * sy }, v.posts); el('circle', { cx: px1, cy: y, r }, v.posts);
  el('rect', { x: px2, y: y - sy, width: x + hw - 4.5 - px2, height: 2 * sy }, v.posts); el('circle', { cx: px2, cy: y, r }, v.posts);
  for (const cx of [px1, px2]) el('circle', { cx, cy: y, r, fill: 'url(#gDome)' }, g);
  el('rect', { x: x - hw + 7, y: bot - 25, width: 38, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: x - hw + 26, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = 'FLS' + p.L;
  el('rect', { x: x + hw - 37, y: bot - 25, width: 30, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: x + hw - 22, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = (p.nc ? 'NC' : 'NO') + (p.low ? '↓' : '↑');
  setFlow(v, p, editing ? 0 : lswPos(p), editing ? !!p.nc : lswClosed(p));
  if (editing) delete FLOW[p.id]; else if (FLOW[p.id]) FLOW[p.id].k = '';   // (Build: an empty pipe; running: painted afresh on the next frame)
}
/* A float switch (Dallas's design A, 20 Nov 2026): drawn as the flow switch is, its tank (in his units) where the pipe is.
   In the tank, water to a level (low at rest, high worked; or a Level value's), a float on an arm hinged on the tank's left
   wall, riding the water. Under the blade, upright as the pressure switch's diaphragm and stem are, the NEMA float switch's
   short stem and round float (radius 12), rising to push the blade. */
const FLT_LOW = 88, FLT_HIGH = 46, FLT_PIV = [90, 74], FLT_ARM = 70;
function drawFloat(p, g, x, y, v) {
  const k = FSW_K, col = p.color, r = BOX * .105, sy = BOX * .045, hw = LSW_W / 2, top = y - LSW_TOP, bot = y + LSW_BOT, px1 = x - 30, px2 = x + 30;
  const t = el('g', { transform: `translate(${(x - 161 * k).toFixed(2)} ${(y - 208.6 * k).toFixed(2)}) scale(${k})` }, g);
  for (const sx of [105.5, 195.5]) el('rect', { x: sx, y: 107, width: 20, height: 32, fill: 'url(#gFlange)', stroke: '#111', 'stroke-width': 1.4 }, t);
  el('path', { d: 'M130 140L135 102H185L190 140Z', fill: '#242424' }, t);
  el('path', { d: 'M135 136L139 106.7H181L185 136', fill: 'none', stroke: col, 'stroke-width': 2.6 }, t);
  // the tank: steel, a glass front; the water, its surface rippled
  el('rect', { x: 66, y: 14, width: 190, height: 100, rx: 9, fill: 'url(#gPipe)', stroke: '#111', 'stroke-width': 1.4, filter: 'url(#fShadow)' }, t);
  el('rect', { x: 76, y: 24, width: 170, height: 80, rx: 4, fill: '#1d1f22', stroke: '#111', 'stroke-width': 1.4 }, t);
  const cid = 'fltc' + (++FSW_N), cp = el('clipPath', { id: cid }, t); el('rect', { x: 77, y: 25, width: 168, height: 78, rx: 3.5 }, cp);
  const wg = el('g', { 'clip-path': `url(#${cid})` }, t);
  // (Dallas, 20 Nov 2026: the water one shape, its top the ripple itself, so no dark shows under a crest; wider than the glass,
  // so it meets both sides)
  v.water = el('g', {}, wg);
  let wave = 'M70 0'; for (let xx = 70; xx < 252; xx += 17) wave += 'q4.25 -2.6 8.5 0t8.5 0';
  el('path', { d: wave + 'V110H70Z', fill: 'url(#gWater)' }, v.water);
  el('path', { d: wave, fill: 'none', stroke: '#cfe6ff', 'stroke-width': 1.6, opacity: .85 }, v.water);
  // the float on its arm, hinged on the tank's left wall: the arm and its pivot behind the block that holds them, the block
  // running on under the wall (Dallas, 20 Nov 2026), as if mounted on it
  const [ax, ay] = FLT_PIV;
  v.armSh = el('line', { x1: ax, y1: ay, stroke: '#111', 'stroke-width': 5.5, 'stroke-linecap': 'round' }, wg);
  v.arm = el('line', { x1: ax, y1: ay, stroke: '#c9ced4', 'stroke-width': 3, 'stroke-linecap': 'round' }, wg);
  el('circle', { cx: ax, cy: ay, r: 4, fill: '#5d636a', stroke: '#111', 'stroke-width': 1 }, wg);
  el('rect', { x: 62, y: ay - 10, width: 26, height: 20, rx: 2, fill: '#5d636a', stroke: '#111', 'stroke-width': 1.2 }, wg);
  v.fball = el('g', {}, wg);
  el('circle', { r: 12.2, fill: '#111' }, v.fball); el('circle', { r: 11, fill: '#ff9a2e' }, v.fball); el('circle', { r: 11, fill: 'url(#gDome)' }, v.fball);
  // the mark on the glass where the float makes the switch act (Dallas, 20 Nov 2026): its Acts At, when a Level value works it;
  // worked by hand, near the top
  { const pv = pvOf(p), fa = pv && Number.isFinite(+p.sp) ? clamp01((+p.sp - pv.min) / ((pv.max - pv.min) || 1)) : p.low ? .2 : .8, my = lerp(FLT_LOW, FLT_HIGH, fa);
    v.mark = el('g', { 'pointer-events': 'none' }, t);
    el('path', { d: `M245.5 ${my.toFixed(2)}H231`, stroke: '#111', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, v.mark);
    el('path', { d: `M245.5 ${my.toFixed(2)}H231`, stroke: '#FFC000', 'stroke-width': 2, 'stroke-linecap': 'round' }, v.mark);
    el('path', { d: `M246 ${(my - 4.5).toFixed(2)}L239.5 ${my.toFixed(2)}L246 ${(my + 4.5).toFixed(2)}Z`, fill: '#FFC000', stroke: '#111', 'stroke-width': .9, 'stroke-linejoin': 'round' }, v.mark); }
  el('path', { d: 'M96 30L116 30L104 98L92 98Z', fill: '#fff', opacity: .06 }, t);   // (the glass's glint)
  hlBadge(t, 222, 14, p.low, col, 15.5);   // (the badge, on the tank's top)
  // the body
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: LSW_TOP + LSW_BOT, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  // the stem and float (they rise together; the stem reaches up to the blade's underside)
  const by = y + 46, sw = 12 * k;
  v.dg = el('g', {}, g);
  v.stemSh = el('line', { x1: x, y1: y, x2: x, y2: by - 10, stroke: '#111', 'stroke-width': sw, 'stroke-linecap': 'round', filter: 'url(#fShadow)' }, v.dg);
  el('circle', { cx: x, cy: by, r: 13, fill: '#111', filter: 'url(#fShadow)' }, v.dg);
  v.stem = el('line', { x1: x, y1: y, x2: x, y2: by - 10, stroke: BLADE_GREY, 'stroke-width': sw, 'stroke-linecap': 'round' }, v.dg);
  v.dome = el('circle', { cx: x, cy: by, r: 12, fill: BLADE_GREY }, v.dg);
  el('circle', { cx: x, cy: by, r: 12, fill: 'url(#gDome)' }, v.dg);
  // the blade, hinged on the left post, and the posts
  v.blade = el('g', {}, g); const len = 60 + r * .6;
  v.bladeShape = el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: BLADE_GREY, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, v.blade);
  el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, v.blade);
  v.hinge = [px1, y];
  v.posts = el('g', { fill: GREY }, g);
  el('rect', { x: x - hw + 4.5, y: y - sy, width: px1 - (x - hw + 4.5), height: 2 * sy }, v.posts); el('circle', { cx: px1, cy: y, r }, v.posts);
  el('rect', { x: px2, y: y - sy, width: x + hw - 4.5 - px2, height: 2 * sy }, v.posts); el('circle', { cx: px2, cy: y, r }, v.posts);
  for (const cx of [px1, px2]) el('circle', { cx, cy: y, r, fill: 'url(#gDome)' }, g);
  el('rect', { x: x - hw + 7, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: x - hw + 23, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = 'FS' + p.L;
  el('rect', { x: x + hw - 37, y: bot - 25, width: 30, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('text', { x: x + hw - 22, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = (p.nc ? 'NC' : 'NO') + (p.low ? '↓' : '↑');
  setFloat(v, p, editing ? 0 : lswPos(p), editing ? !!p.nc : lswClosed(p));
}
// a float switch pos of the way from at rest (0) to worked (1): the water up the tank (or at its Level value), the float riding
// it on its arm; the stem and float pushed up, the blade turned as the limit switch's; lit in its colour while closed
function setFloat(v, p, pos, cl) {
  const f = pvFrac(p), k = pos.toFixed(3) + (cl ? 'c' : 'o') + (f === null ? '' : f.toFixed(3));
  if (v.k === k) return; v.k = k;
  const [hx, hy] = v.hinge, [a0, a1] = lswAngles(p), ba = lerp(a0, a1, pos), at = a => Math.tan(a * Math.PI / 180) * 30;
  v.blade.setAttribute('transform', `rotate(${ba.toFixed(2)} ${hx} ${hy})`);
  const lift = Math.max(0, at(lswAngles({ nc: false })[0]) - at(ba)), sTop = hy + at(ba) + 2 + lift;
  v.dg.setAttribute('transform', `translate(0 ${(-lift).toFixed(2)})`);
  for (const s of [v.stem, v.stemSh]) s.setAttribute('y1', sTop.toFixed(2));
  const c = cl ? p.color : BLADE_GREY;
  v.bladeShape.setAttribute('fill', c); v.stem.setAttribute('stroke', c); v.dome.setAttribute('fill', c); v.posts.setAttribute('fill', cl ? p.color : GREY);
  // the water and the float on its arm
  const lv = lerp(FLT_LOW, FLT_HIGH, f === null ? (p.low ? lerp(.75, .1, pos) : pos) : f),   // (by hand, a low one's water well up at rest, falling as it is worked)
    [ax, ay] = FLT_PIV, dy = lv - ay, bx = ax + Math.sqrt(Math.max(0, FLT_ARM * FLT_ARM - dy * dy));
  v.water.setAttribute('transform', `translate(0 ${lv.toFixed(2)})`);
  for (const l of [v.arm, v.armSh]) { l.setAttribute('x2', bx.toFixed(2)); l.setAttribute('y2', lv.toFixed(2)); }
  v.fball.setAttribute('transform', `translate(${bx.toFixed(2)} ${lv.toFixed(2)})`);
}

/* A toggle switch, SPST (Dallas's design, 21 Nov 2026: option B): the sensing switches' body is its faceplate. Across it at
   the wire, the NEMA SPST: two open terminal rings, the blade hinged on the left one (open, it stands up 27°, as his symbol;
   closed, it lies across both). Under it, a light switch's toggle seen from the front: the slot's opening framed as the tag
   boxes are, and in it the lever end on (its end across the slot's far end, its face in the switch's colour darkening as it
   goes back into the body to the pivot, a dark crease; past the pivot the open slot, dark). Up, on; down, off; ON and OFF
   beside it. A click flips it (it stays as it is left). */
const TGL_OPEN = -27, TGL_TY = 60, TGL_S = 1.3;
function drawToggle(p, g, x, y, v) {
  const col = p.color, hw = LSW_W / 2, top = y - LSW_TOP, bot = y + TGL_BOT, px1 = x - 30, px2 = x + 30, sy = BOX * .045, r = 7;
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: bot - top, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  // the contact: its stubs, the blade (hinged on the left ring), the rings
  v.posts = el('g', { fill: GREY }, g);
  el('rect', { x: x - hw + 4.5, y: y - sy, width: px1 - r - (x - hw + 4.5), height: 2 * sy }, v.posts); el('rect', { x: px2 + r, y: y - sy, width: x + hw - 4.5 - px2 - r, height: 2 * sy }, v.posts);
  v.blade = el('g', { filter: 'url(#fShadow)' }, g); v.hinge = [px1, y];
  v.bladeShape = el('rect', { x: px1, y: y - 3.5, width: 60 - r + 1.5, height: 7, rx: 3.5, fill: BLADE_GREY, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, v.blade);
  el('rect', { x: px1, y: y - 3.5, width: 60 - r + 1.5, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, v.blade);
  v.rings = [];
  for (const cx of [px1, px2]) { v.rings.push(el('circle', { cx, cy: y, r, fill: '#1f1f1f', stroke: GREY, 'stroke-width': 3.4 }, g)); el('circle', { cx, cy: y, r, fill: 'none', stroke: 'url(#gGloss)', 'stroke-width': 3.4 }, g); }
  v.pin = el('circle', { cx: px1, cy: y, r: 2.6, fill: BLADE_GREY }, g); el('circle', { cx: px1, cy: y, r: 2.6, fill: 'url(#gDome)' }, g);
  // the toggle: the slot (framed), and the lever drawn up and down, the one it is at shown
  Object.assign(v, tglLever(p, g, x, y + TGL_TY, ['ON', 'OFF']));
  // its tags
  const fl = p.fx ? -1 : 1;   // (flipped: its tags drawn the other way round, so they end up where they always are)
  el('rect', { x: x - fl * (hw - 23) - 16, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('rect', { x: x + fl * (hw - 23) - 16, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  const tg = (t, tx) => { const e = el('text', { x: tx, y: bot - 12.5, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 800, fill: '#fff', 'pointer-events': 'none' }, g); e.textContent = t; };
  tg('SW' + p.L, x - fl * (hw - 23)); tg('NO', x + fl * (hw - 23));
  setToggle(v, p, editing ? (p.held ? 1 : 0) : lswPos(p), editing ? !!p.held : lswClosed(p));   // (in Build: as it starts)
}
// a toggle switch's lever in its slot, seen from the front (drawn up and down; setToggle or setSpdt shows the one it is at), and
// the marks beside it (ON / OFF; 1 / 2 on an SPDT)
function tglLever(p, g, cx, cy, labs) {
  const S = TGL_S, W = 15 * S, H = 34 * S, x0 = cx - W / 2, y0 = cy - H / 2, col = p.color, v = {};
  framed('rect', { x: x0 - 3 * S, y: y0 - 3 * S, width: W + 6 * S, height: H + 6 * S, rx: 3.5 * S, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.2 }, g);
  el('rect', { x: x0, y: y0, width: W, height: H, rx: 1.6 * S, fill: '#0b0b0b' }, g);
  const dk = (c, f) => { const n = parseInt(c.slice(1), 16), m = q => Math.max(0, Math.min(255, Math.round(q * f))); return '#' + [n >> 16, n >> 8 & 255, n & 255].map(m).map(q => q.toString(16).padStart(2, '0')).join(''); };
  v.lev = [];
  for (const on of [false, true]) {
    const lv = el('g', {}, g), d = on ? -1 : 1, far = cy + d * H / 2, pv = cy - d * H * .22, m = S, e = 6.5 * S, wE = W - 2 * m, wP = W - 5.5 * S, end = far - d * e;
    el('rect', { x: x0, y: Math.min(pv, cy - d * H / 2), width: W, height: Math.abs(pv - (cy - d * H / 2)), fill: '#000', opacity: .5 }, lv);   // (the open slot past the pivot)
    const sh = el('g', { filter: 'url(#fShadow)' }, lv), gid = `tglF${p.id}${on ? 'u' : 'd'}`;
    const gr = el('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: cx, x2: cx, y1: end, y2: pv }, lv);
    for (const [o, c] of [[0, col], [.45, dk(col, .78)], [1, dk(col, .38)]]) el('stop', { offset: o, 'stop-color': c }, gr);
    const face = `M${cx - wE / 2} ${end}H${cx + wE / 2}L${cx + wP / 2} ${pv}H${cx - wP / 2}Z`, endP = `M${cx - wE / 2} ${end}H${cx + wE / 2}L${cx + wE / 2 - .6 * S} ${far - d * .8 * S}H${cx - wE / 2 + .6 * S}Z`;
    el('path', { d: face, fill: `url(#${gid})`, stroke: 'rgba(0,0,0,.45)', 'stroke-width': .7, 'stroke-linejoin': 'round' }, sh);
    el('path', { d: face, fill: 'url(#gGloss)', opacity: .35 }, sh);
    el('path', { d: endP, fill: on ? dk(col, 1.18) : dk(col, .7), stroke: 'rgba(0,0,0,.45)', 'stroke-width': .7, 'stroke-linejoin': 'round' }, sh);
    el('path', { d: endP, fill: 'url(#gGloss)', opacity: on ? .9 : .4 }, sh);
    el('line', { x1: cx - wP / 2, y1: pv, x2: cx + wP / 2, y2: pv, stroke: '#000', 'stroke-width': 1.3 * S, opacity: .85 }, lv);
    v.lev.push(lv);
  }
  const lab = (t, yy) => { const e = el('text', { x: x0 - 14 * S, y: yy, 'text-anchor': 'middle', 'font-size': 7.5 * S, 'font-weight': 800, fill: '#5a5a5a', 'pointer-events': 'none' }, g); e.textContent = t; return e; };
  v.lOn = lab(labs[0], y0 + 7 * S); v.lOff = lab(labs[1], y0 + H - S);
  return v;
}
function setToggle(v, p, pos, cl) {
  const k = pos.toFixed(3) + (cl ? 'c' : 'o'); if (v.k === k) return; v.k = k;
  const [hx, hy] = v.hinge; v.blade.setAttribute('transform', `rotate(${lerp(TGL_OPEN, 0, pos).toFixed(2)} ${hx} ${hy})`);
  const c = cl ? p.color : BLADE_GREY; v.bladeShape.setAttribute('fill', c); v.pin.setAttribute('fill', c);
  v.posts.setAttribute('fill', cl ? p.color : GREY); for (const q of v.rings) q.setAttribute('stroke', cl ? p.color : GREY);
  const up = pos >= .5; v.lev[0].setAttribute('display', up ? 'none' : ''); v.lev[1].setAttribute('display', up ? '' : 'none');   // (the lever flips over half way)
  v.lOn.setAttribute('fill', up ? p.color : '#5a5a5a'); v.lOff.setAttribute('fill', up ? '#5a5a5a' : '#cfcfcf');
}
/* A toggle switch, SPDT (Dallas, 21 Nov 2026: option B): the SPST's faceplate and toggle, with his SPDT across it: the
   common ring on the left (on the wire) and two throws on the right, 60 above and below (6 squares apart), numbered 1 and 2; the blade from the
   common to throw 1 with the lever up, to throw 2 with it down (it is never off: one way or the other). The toggle marked 1
   and 2 to match. Its three ends are its leads (lit by what reaches them). */
function drawSpdt(p, g, x, y, v, chan) {
  v.lead = null; v.src = [];
  const col = p.color, hw = LSW_W / 2, top = y - SP2_TOP, bot = y + SP2_BOT, px1 = x - 30, px2 = x + 30, sy = BOX * .045, r = 7;
  [[x - 60, y], [x + 60, y - SP2_DY], [x + 60, y + SP2_DY]].forEach(([tx, ty], i) => { const bx = tx < x ? x - hw : x + hw;   // (drawn as unflipped: a flipped one is mirrored as a whole)
    el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
    if (!editing && p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) }); });
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: bot - top, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  // the stubs: the common's in from the left, each throw's out to the right
  v.stub = [y, y - SP2_DY, y + SP2_DY].map((yy, i) => el('rect', i ? { x: px2 + r, y: yy - sy, width: x + hw - 4.5 - px2 - r, height: 2 * sy, fill: GREY } : { x: x - hw + 4.5, y: yy - sy, width: px1 - r - (x - hw + 4.5), height: 2 * sy, fill: col }, g));
  v.blade = el('g', { filter: 'url(#fShadow)' }, g); v.hinge = [px1, y];
  const len = Math.hypot(60, SP2_DY) - r + 1.5;
  el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: col, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, v.blade);
  el('rect', { x: px1, y: y - 3.5, width: len, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, v.blade);
  v.rings = [[px1, y], [px2, y - SP2_DY], [px2, y + SP2_DY]].map(([cx, cy], i) => { const c = el('circle', { cx, cy, r, fill: '#1f1f1f', stroke: i ? GREY : col, 'stroke-width': 3.4 }, g); el('circle', { cx, cy, r, fill: 'none', stroke: 'url(#gGloss)', 'stroke-width': 3.4 }, g); return c; });
  el('circle', { cx: px1, cy: y, r: 2.6, fill: col }, g); el('circle', { cx: px1, cy: y, r: 2.6, fill: 'url(#gDome)' }, g);
  const num = (t, yy) => { const e = el('text', { x: x + 12, y: yy, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 800, fill: '#6a6a6a', 'pointer-events': 'none' }, g); e.textContent = t; return e; };
  v.n1 = num('1', y - SP2_DY + 4); v.n2 = num('2', y + SP2_DY + 4);
  Object.assign(v, tglLever(p, g, x, y + SP2_DY + 52, ['1', '2']));
  const fl = p.fx ? -1 : 1;   // (flipped: its tags drawn the other way round, so they end up where they always are)
  el('rect', { x: x - fl * (hw - 23) - 16, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('rect', { x: x + fl * (hw - 24) - 17, y: bot - 25, width: 34, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  const tg = (t, tx, fs) => { const e = el('text', { x: tx, y: bot - 12.5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: '#fff', 'pointer-events': 'none' }, g); e.textContent = t; };
  tg('SW' + p.L, x - fl * (hw - 23), 9); tg('SPDT', x + fl * (hw - 24), 8);
  setSpdt(v, p, editing ? (p.held ? 1 : 0) : lswPos(p));   // (in Build: as it starts)
}
function setSpdt(v, p, pos) {
  const k = pos.toFixed(3); if (v.k === k) return; v.k = k;
  const a = Math.atan2(SP2_DY, 60) * 180 / Math.PI, [hx, hy] = v.hinge, up = pos >= .5;
  v.blade.setAttribute('transform', `rotate(${lerp(a, -a, pos).toFixed(2)} ${hx} ${hy})`);   // (down to throw 2 at rest; up to throw 1, worked)
  for (const [i, on] of [[1, up && pos > .98], [2, !up && pos < .02]]) { v.rings[i].setAttribute('stroke', on ? p.color : GREY); v.stub[i].setAttribute('fill', on ? p.color : GREY); }
  v.n1.setAttribute('fill', up ? p.color : '#6a6a6a'); v.n2.setAttribute('fill', up ? '#6a6a6a' : p.color);
  v.lev[0].setAttribute('display', up ? 'none' : ''); v.lev[1].setAttribute('display', up ? '' : 'none');
  v.lOn.setAttribute('fill', up ? p.color : '#5a5a5a'); v.lOff.setAttribute('fill', up ? '#5a5a5a' : p.color);
}
// a DPDT toggle switch (Dallas, 21 Nov 2026, option A): two SPDTs worked together by the one toggle, the second 180 below the
// first (its throws 60 from each common, as the SPDT's: the six rows 60 apart), the NEMA dashed link between the blades
function drawDpdt(p, g, x, y, v, chan) {
  v.lead = null; v.src = [];
  const col = p.color, hw = LSW_W / 2, top = y - SP2_TOP, bot = y + DPD_BOT, px1 = x - 30, px2 = x + 30, sy = BOX * .045, r = 7, D = DPD_DY;
  [[x - 60, y], [x + 60, y - SP2_DY], [x + 60, y + SP2_DY], [x - 60, y + D], [x + 60, y + D - SP2_DY], [x + 60, y + D + SP2_DY]].forEach(([tx, ty], i) => { const bx = tx < x ? x - hw : x + hw;   // (drawn as unflipped: a flipped one is mirrored as a whole)
    el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
    if (!editing && p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) }); });
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: bot - top, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  v.link = el('line', { stroke: col, 'stroke-width': 2, 'stroke-dasharray': '5 4' }, g);
  const len = Math.hypot(60, SP2_DY) - r + 1.5;
  v.poles = [y, y + D].map(yc => { const q = {};
    q.stub = [yc, yc - SP2_DY, yc + SP2_DY].map((yy, i) => el('rect', i ? { x: px2 + r, y: yy - sy, width: x + hw - 4.5 - px2 - r, height: 2 * sy, fill: GREY } : { x: x - hw + 4.5, y: yy - sy, width: px1 - r - (x - hw + 4.5), height: 2 * sy, fill: col }, g));
    q.blade = el('g', { filter: 'url(#fShadow)' }, g); q.hy = yc;
    el('rect', { x: px1, y: yc - 3.5, width: len, height: 7, rx: 3.5, fill: col, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, q.blade);
    el('rect', { x: px1, y: yc - 3.5, width: len, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, q.blade);
    q.rings = [[px1, yc], [px2, yc - SP2_DY], [px2, yc + SP2_DY]].map(([cx, cy], i) => { const c = el('circle', { cx, cy, r, fill: '#1f1f1f', stroke: i ? GREY : col, 'stroke-width': 3.4 }, g); el('circle', { cx, cy, r, fill: 'none', stroke: 'url(#gGloss)', 'stroke-width': 3.4 }, g); return c; });
    el('circle', { cx: px1, cy: yc, r: 2.6, fill: col }, g); el('circle', { cx: px1, cy: yc, r: 2.6, fill: 'url(#gDome)' }, g);
    const num = (t, yy) => { const e = el('text', { x: x + 12, y: yy, 'text-anchor': 'middle', 'font-size': 8, 'font-weight': 800, fill: '#6a6a6a', 'pointer-events': 'none' }, g); e.textContent = t; return e; };
    q.n1 = num('1', yc - SP2_DY + 4); q.n2 = num('2', yc + SP2_DY + 4);
    return q; });
  v.hx = px1; v.ly = y;
  Object.assign(v, tglLever(p, g, x, y + D + SP2_DY + 52, ['1', '2']));
  const fl = p.fx ? -1 : 1;   // (flipped: its tags drawn the other way round, so they end up where they always are)
  el('rect', { x: x - fl * (hw - 23) - 16, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('rect', { x: x + fl * (hw - 24) - 17, y: bot - 25, width: 34, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  const tg = (t, tx, fs) => { const e = el('text', { x: tx, y: bot - 12.5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: '#fff', 'pointer-events': 'none' }, g); e.textContent = t; };
  tg('SW' + p.L, x - fl * (hw - 23), 9); tg('DPDT', x + fl * (hw - 24), 8);
  setDpdt(v, p, editing ? (p.held ? 1 : 0) : lswPos(p));   // (in Build: as it starts)
}
function setDpdt(v, p, pos) {
  const k = pos.toFixed(3); if (v.k === k) return; v.k = k;
  const a0 = Math.atan2(SP2_DY, 60) * 180 / Math.PI, a = lerp(a0, -a0, pos), up = pos >= .5;   // (down to throw 2 at rest; up to throw 1, worked)
  for (const q of v.poles) {
    q.blade.setAttribute('transform', `rotate(${a.toFixed(2)} ${v.hx} ${q.hy})`);
    for (const [i, on] of [[1, up && pos > .98], [2, !up && pos < .02]]) { q.rings[i].setAttribute('stroke', on ? p.color : GREY); q.stub[i].setAttribute('fill', on ? p.color : GREY); }
    q.n1.setAttribute('fill', up ? p.color : '#6a6a6a'); q.n2.setAttribute('fill', up ? '#6a6a6a' : p.color);
  }
  // (the link: down from the top blade's middle to the bottom one's, as they turn)
  const t = a * Math.PI / 180, mx = v.hx + 30 * Math.cos(t), dy = 30 * Math.sin(t);
  v.link.setAttribute('x1', mx.toFixed(2)); v.link.setAttribute('x2', mx.toFixed(2)); v.link.setAttribute('y1', (v.ly + dy + 5).toFixed(2)); v.link.setAttribute('y2', (v.ly + DPD_DY + dy - 5).toFixed(2));
  v.lev[0].setAttribute('display', up ? 'none' : ''); v.lev[1].setAttribute('display', up ? '' : 'none');
  v.lOn.setAttribute('fill', up ? p.color : '#5a5a5a'); v.lOff.setAttribute('fill', up ? '#5a5a5a' : p.color);
}
// a circuit breaker, single pole (Dallas, 22 Nov 2026, option A): the toggle switches' body in silver; on its wire the
// breaker's contact: two rings and, as the moving part, the arc over them, resting on them (on) or lifted straight up off
// them (tripped or off), as the NO contacts' bar does; closed, the arc the colour of the current through it (silver with
// none). Below, its handle (up on, in the middle tripped, down off) and a window reading ON, TRIP or OFF; its tags.
function drawBreaker(p, g, x, y, v, chan) {
  // (a DPST circuit breaker (Dallas, 22 Nov 2026, option A): the single one's pole twice, 120 apart (its ends where a DPST
  // toggle switch's are), the NEMA dashed link between the two arcs, lifting with them; the one handle below them both. A 3PST
  // (22 Nov 2026): the same with a third pole, its ends where a 3PST toggle switch's are)
  const col = CBK_COL, hw = LSW_W / 2, two = p.t !== 'cbk', rows = p.t === 'cbt' ? [y - 120, y, y + 120] : two ? [y - SP2_DY, y + SP2_DY] : [y], top = y - bodyUp(p), bot = y + bodyDown(p), px1 = x - 30, px2 = x + 30, sy = BOX * .045, r = 7;
  if (two) { v.lead = null; v.src = [];
    rows.flatMap(ty => [[-1, ty], [1, ty]]).forEach(([sx, ty], i) => { const tx = x + sx * 60, bx = x + sx * hw;   // (its ends' short leads in to the body, lit as the current reaches them)
      el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
      if (!editing && p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) }); }); }
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: bot - top, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  v.poles = rows.map((yy, i) => { const q = {};
    q.posts = [el('rect', { x: x - hw + 4.5, y: yy - sy, width: px1 - r - (x - hw + 4.5), height: 2 * sy, fill: col }, g), el('rect', { x: px2 + r, y: yy - sy, width: x + hw - 4.5 - px2 - r, height: 2 * sy, fill: col }, g)];
    q.arc = el('g', { filter: 'url(#fShadow)' }, g);
    if (two && i === 0) el('line', { x1: x, y1: yy - 10, x2: x, y2: rows[rows.length - 1] - 29, stroke: '#8a8a8a', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, q.arc);   // (the link, from the top arc down to just above the bottom one)
    const d = `M${px1} ${yy - 1}Q${x} ${yy - 30} ${px2} ${yy - 1}`;
    el('path', { d, fill: 'none', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 8.2, 'stroke-linecap': 'round' }, q.arc);
    q.arcC = el('path', { d, fill: 'none', stroke: col, 'stroke-width': 7, 'stroke-linecap': 'round' }, q.arc);
    el('path', { d: `M${px1 + 3} ${yy - 4}Q${x} ${yy - 31} ${px2 - 3} ${yy - 4}`, fill: 'none', stroke: '#fff', 'stroke-opacity': .35, 'stroke-width': 2, 'stroke-linecap': 'round' }, q.arc);
    q.rings = []; q.pins = [];
    for (const cx of [px1, px2]) { q.rings.push(el('circle', { cx, cy: yy, r, fill: '#1f1f1f', stroke: col, 'stroke-width': 3.4 }, g)); el('circle', { cx, cy: yy, r, fill: 'none', stroke: 'url(#gGloss)', 'stroke-width': 3.4 }, g); q.pins.push(el('circle', { cx, cy: yy, r: 2.6, fill: col }, g)); }
    return q; });
  // the handle in its slot (below the bottom pole), and the ON / OFF marks beside it
  const ly = rows[rows.length - 1], hx = x + 10, hy = ly + 70, H = 40, Wd = 22;
  framed('rect', { x: hx - Wd / 2 - 3, y: hy - H / 2 - 3, width: Wd + 6, height: H + 6, rx: 4, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.2 }, g);
  el('rect', { x: hx - Wd / 2, y: hy - H / 2, width: Wd, height: H, rx: 2, fill: '#0b0b0b' }, g);
  v.handle = el('g', { filter: 'url(#fShadow)' }, g);
  el('rect', { x: hx - Wd / 2 + 2, y: hy - 9, width: Wd - 4, height: 18, rx: 3, fill: '#2b2b2b', stroke: '#000', 'stroke-width': .8 }, v.handle);
  el('rect', { x: hx - Wd / 2 + 2, y: hy - 9, width: Wd - 4, height: 18, rx: 3, fill: 'url(#gGloss)', opacity: .6 }, v.handle);
  el('line', { x1: hx - 5, y1: hy, x2: hx + 5, y2: hy, stroke: '#bbb', 'stroke-width': 1.6 }, v.handle);
  const mark = (t, yy) => { const e = el('text', { x: hx - Wd / 2 - 14, y: yy, 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 800, fill: '#5a5a5a', 'pointer-events': 'none' }, g); e.textContent = t; return e; };
  v.mOn = mark('ON', hy - 9); v.mOff = mark('OFF', hy + 15);
  // the window
  el('rect', { x: hx - 14, y: ly + 105, width: 28, height: 14, rx: 3, fill: '#111', stroke: '#444' }, g);
  v.flag = el('rect', { x: hx - 11, y: ly + 107.5, width: 22, height: 9, rx: 2, fill: '#5a5a5a' }, g);
  v.flagT = el('text', { x: hx, y: ly + 115, 'text-anchor': 'middle', 'font-size': 6.5, 'font-weight': 800, fill: '#111', 'pointer-events': 'none' }, g);
  // its tags
  const tg = (t, tx, fs) => { el('rect', { x: tx - 16, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g); const e = el('text', { x: tx, y: bot - 12.5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: '#fff', 'pointer-events': 'none' }, g); e.textContent = t; };
  tg('CB' + p.L, x - (hw - 23), 9); tg(p.t === 'cbt' ? '3PST' : two ? 'DPST' : 'SPST', x + (hw - 23), 8);
  setBreaker(v, p, editing ? (p.held ? 1 : 0) : lswPos(p), editing ? false : !!BLOWN[p.id], []);   // (in Build: as it starts)
}
// (st: each pole's flow, the colour through it, and wait: open, the colour waiting at it and which end it waits at (0 its
// left, 1 its right), lit up to that end's contact)
function setBreaker(v, p, pos, tripped, st, now) {   // (now: whether it is closed (in Run): lit at once as it closes, grey at once as it opens, as the current is)
  const k = pos.toFixed(3) + (tripped ? 't' : '') + st.map(q => (q.flow || '') + (q.wait ? q.wait.side + q.wait.col : '')).join('|') + now; if (v.k === k) return; v.k = k;
  const lift = tripped ? 1 : 1 - pos, shut = !tripped && (now === undefined ? pos > .98 : now);   // (on, its contacts too the colour of the current through it, 22 Nov 2026)
  v.poles.forEach((q, i) => { const { flow, wait } = st[i] || {}, c = shut ? flow || CBK_COL : GREY;
    q.arc.setAttribute('transform', `translate(0 ${(-16 * lift).toFixed(2)})`); q.arcC.setAttribute('stroke', shut ? flow || CBK_COL : BLADE_GREY);
    q.posts.forEach((e, j) => e.setAttribute('fill', !shut && wait && wait.side === j ? wait.col : c)); q.rings.forEach((e, j) => e.setAttribute('stroke', !shut && wait && wait.side === j ? wait.col : c));
    for (const e of q.pins) e.setAttribute('fill', shut ? flow || CBK_COL : BLADE_GREY); });
  v.handle.setAttribute('transform', `translate(0 ${tripped ? 0 : lerp(10, -10, pos).toFixed(2)})`);
  const s = tripped ? 'trip' : pos >= .5 ? 'on' : 'off';
  v.mOn.setAttribute('fill', s === 'on' ? CBK_COL : '#5a5a5a'); v.mOff.setAttribute('fill', s === 'off' ? CBK_COL : '#5a5a5a');
  v.flag.setAttribute('fill', s === 'on' ? '#00B050' : s === 'trip' ? '#FF3B3B' : '#5a5a5a'); v.flagT.textContent = s === 'on' ? 'ON' : s === 'trip' ? 'TRIP' : 'OFF';
}
// a DPST toggle switch (Dallas, 21 Nov 2026, option B2), and a 3PST (22 Nov 2026: the same with a third pole, the poles 120 apart): the SPST's contact twice, 120 apart (its ends where an SPDT's throws are),
// both blades worked together by the one toggle (ON / OFF), the NEMA dashed link between them moving with them; the body as
// tall above as the other many-pole toggle switches, so the top blade clears it open
function drawDpst(p, g, x, y, v, chan) {
  v.lead = null; v.src = [];
  const col = p.color, hw = LSW_W / 2, top = y - bodyUp(p), bot = y + bodyDown(p), rows = p.t === 'tps' ? [y - 120, y, y + 120] : [y - SP2_DY, y + SP2_DY], px1 = x - 30, px2 = x + 30, sy = BOX * .045, r = 7;
  rows.flatMap(ty => [[-1, ty], [1, ty]]).forEach(([sx, ty], i) => { const tx = x + sx * 60, bx = x + sx * hw;   // (drawn as unflipped: a flipped one is mirrored as a whole)
    el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
    if (!editing && p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) }); });
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: bot - top, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  v.posts = el('g', { fill: GREY }, g); v.blades = []; v.rings = []; v.pins = [];
  v.link = el('line', { x1: x, y1: rows[0] + 5, x2: x, y2: rows[rows.length - 1] - 5, stroke: '#8a8a8a', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, g);
  for (const yy of rows) {
    el('rect', { x: x - hw + 4.5, y: yy - sy, width: px1 - r - (x - hw + 4.5), height: 2 * sy }, v.posts); el('rect', { x: px2 + r, y: yy - sy, width: x + hw - 4.5 - px2 - r, height: 2 * sy }, v.posts);
    const b = el('g', { filter: 'url(#fShadow)' }, g);
    const sh = el('rect', { x: px1, y: yy - 3.5, width: 60 - r + 1.5, height: 7, rx: 3.5, fill: BLADE_GREY, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, b);
    el('rect', { x: px1, y: yy - 3.5, width: 60 - r + 1.5, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, b);
    v.blades.push({ b, sh, hy: yy });
    for (const cx of [px1, px2]) { v.rings.push(el('circle', { cx, cy: yy, r, fill: '#1f1f1f', stroke: GREY, 'stroke-width': 3.4 }, g)); el('circle', { cx, cy: yy, r, fill: 'none', stroke: 'url(#gGloss)', 'stroke-width': 3.4 }, g); }
    v.pins.push(el('circle', { cx: px1, cy: yy, r: 2.6, fill: BLADE_GREY }, g)); el('circle', { cx: px1, cy: yy, r: 2.6, fill: 'url(#gDome)' }, g);
  }
  v.hx = px1; v.ly = rows[0]; v.ly2 = rows[rows.length - 1];
  Object.assign(v, tglLever(p, g, x, rows[rows.length - 1] + 52, ['ON', 'OFF']));
  const fl = p.fx ? -1 : 1;   // (flipped: its tags drawn the other way round, so they end up where they always are)
  el('rect', { x: x - fl * (hw - 23) - 16, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('rect', { x: x + fl * (hw - 23) - 16, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  const tg = (t, tx, fs) => { const e = el('text', { x: tx, y: bot - 12.5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: '#fff', 'pointer-events': 'none' }, g); e.textContent = t; };
  tg('SW' + p.L, x - fl * (hw - 23), 9); tg(p.t === 'tps' ? '3PST' : 'DPST', x + fl * (hw - 23), 8);
  setDpst(v, p, editing ? (p.held ? 1 : 0) : lswPos(p));   // (in Build: as it starts)
}
function setDpst(v, p, pos) {
  const k = pos.toFixed(3); if (v.k === k) return; v.k = k;
  const a = lerp(TGL_OPEN, 0, pos), cl = pos > .98, c = cl ? p.color : BLADE_GREY;
  for (const b of v.blades) { b.b.setAttribute('transform', `rotate(${a.toFixed(2)} ${v.hx} ${b.hy})`); b.sh.setAttribute('fill', c); }
  for (const q of v.pins) q.setAttribute('fill', c);
  v.posts.setAttribute('fill', cl ? p.color : GREY); for (const q of v.rings) q.setAttribute('stroke', cl ? p.color : GREY);
  // (the link: down from the top blade's middle to the bottom one's, as they turn)
  const t = a * Math.PI / 180, mx = v.hx + 30 * Math.cos(t), dy = 30 * Math.sin(t);
  v.link.setAttribute('x1', mx.toFixed(2)); v.link.setAttribute('x2', mx.toFixed(2)); v.link.setAttribute('y1', (v.ly + dy + 5).toFixed(2)); v.link.setAttribute('y2', (v.ly2 + dy - 5).toFixed(2));
  v.link.setAttribute('stroke', cl ? p.color : '#8a8a8a');
  const up = pos >= .5; v.lev[0].setAttribute('display', up ? 'none' : ''); v.lev[1].setAttribute('display', up ? '' : 'none');
  v.lOn.setAttribute('fill', up ? p.color : '#5a5a5a'); v.lOff.setAttribute('fill', up ? '#5a5a5a' : '#cfcfcf');
}
// a crossover (Dallas, 21 Nov 2026): option B: its four contacts 60 apart across and 120 up and down (its ends where an SPDT's
// throws are), two blades hinged on the left ones; straight across (lever up) as it starts, crossed (lever down) worked, each
// blade swinging over and stretching to reach the far corner (the one from the bottom left behind, under a gap in the other)
const XOV_A = Math.atan2(2 * SP2_DY, 2 * XOV_C) * 180 / Math.PI, XOV_LONG = Math.hypot(2 * SP2_DY, 2 * XOV_C);
function drawXover(p, g, x, y, v, chan) {
  v.lead = null; v.src = [];
  const col = p.color, hw = LSW_W / 2, top = y - SP2_TOP, bot = y + SP2_BOT, L = x - XOV_C, R = x + XOV_C, sy = BOX * .045, r = 7;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sv], i) => { const ty = y + sv * SP2_DY, tx = x + sx * 60, bx = x + sx * hw;   // (drawn as unflipped: a flipped one is mirrored as a whole)
    el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
    if (!editing && p._t) v.src.push({ n: p._t[i], ln: el('line', { x1: tx, y1: ty, x2: bx, y2: ty, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g) }); });
  framed('rect', { x: x - hw, y: top, width: 2 * hw, height: bot - top, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
  for (const yy of [y - SP2_DY, y + SP2_DY]) {
    el('rect', { x: x - hw + 4.5, y: yy - sy, width: L - r - (x - hw + 4.5), height: 2 * sy, fill: col }, g);
    el('rect', { x: R + r, y: yy - sy, width: x + hw - 4.5 - R - r, height: 2 * sy, fill: col }, g);
  }
  const blade = hy => { const b = el('g', { filter: 'url(#fShadow)' }, g), w = [el('rect', { x: L, y: hy - 3.5, width: 60, height: 7, rx: 3.5, fill: col, stroke: 'rgba(0,0,0,.35)', 'stroke-width': .6 }, b), el('rect', { x: L, y: hy - 3.5, width: 60, height: 7, rx: 3.5, fill: 'url(#gGloss)' }, b)]; return { b, w, hy }; };
  v.bl = blade(y + SP2_DY);   // (the one behind)
  v.gap = el('path', { fill: '#242424' }, g); v.gy = y;   // (a gap cut in it where the other crosses over: its sides along the top blade's)
  v.tl = blade(y - SP2_DY);
  v.hx = L;
  v.rings = [[L, y - SP2_DY], [R, y - SP2_DY], [L, y + SP2_DY], [R, y + SP2_DY]].map(([cx, cy]) => { const c = el('circle', { cx, cy, r, fill: '#1f1f1f', stroke: col, 'stroke-width': 3.4 }, g); el('circle', { cx, cy, r, fill: 'none', stroke: 'url(#gGloss)', 'stroke-width': 3.4 }, g); return c; });
  for (const cy of [y - SP2_DY, y + SP2_DY]) { el('circle', { cx: L, cy, r: 2.6, fill: col }, g); el('circle', { cx: L, cy, r: 2.6, fill: 'url(#gDome)' }, g); }
  Object.assign(v, tglLever(p, g, x, y + SP2_DY + 52, ['1', '2']));
  const fl = p.fx ? -1 : 1;   // (flipped: its tags drawn the other way round, so they end up where they always are)
  el('rect', { x: x - fl * (hw - 23) - 16, y: bot - 25, width: 32, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  el('rect', { x: x + fl * (hw - 25) - 18, y: bot - 25, width: 36, height: 18, rx: 5, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.2 }, g);
  const tg = (t, tx, fs) => { const e = el('text', { x: tx, y: bot - 12.5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 800, fill: '#fff', 'pointer-events': 'none' }, g); e.textContent = t; };
  tg('SW' + p.L, x - fl * (hw - 23), 9); tg('XOVER', x + fl * (hw - 25), 7.5);
  setXover(v, p, editing ? (p.held ? 1 : 0) : lswPos(p));   // (in Build: as it starts)
}
function setXover(v, p, pos) {
  const k = pos.toFixed(3); if (v.k === k) return; v.k = k;
  const a = XOV_A * pos, len = lerp(2 * XOV_C, XOV_LONG, pos) - 7 + 1.5, up = pos < .5, home = pos < .02 || pos > .98;
  for (const [bl, s] of [[v.tl, 1], [v.bl, -1]]) { bl.b.setAttribute('transform', `rotate(${(s * a).toFixed(2)} ${v.hx} ${bl.hy})`); for (const w of bl.w) w.setAttribute('width', len.toFixed(2)); }
  // (the gap: a strip the top blade's width and a little more, its sides along the top blade, its ends along the bottom one, so
  // it cuts the bottom blade cleanly where they cross; only once they cross within both)
  const ar = a * Math.PI / 180, sn = Math.sin(ar), d = sn > .01 ? SP2_DY / sn : Infinity;
  if (d < len - 4) { const cs = Math.cos(ar), s2 = Math.sin(2 * ar), A = 8 / (2 * s2), B = 11.5 / (2 * s2), cx = v.hx + d * cs, cy = v.gy;
    const pt = (i, j) => `${(cx + i * A * cs + j * B * cs).toFixed(2)} ${(cy + i * A * sn - j * B * sn).toFixed(2)}`;
    v.gap.setAttribute('d', `M${pt(1, 1)}L${pt(1, -1)}L${pt(-1, -1)}L${pt(-1, 1)}Z`); v.gap.setAttribute('display', ''); }
  else v.gap.setAttribute('display', 'none');
  for (const i of [1, 3]) v.rings[i].setAttribute('stroke', home ? p.color : GREY);
  v.lev[0].setAttribute('display', up ? 'none' : ''); v.lev[1].setAttribute('display', up ? '' : 'none');
  v.lOn.setAttribute('fill', up ? p.color : '#5a5a5a'); v.lOff.setAttribute('fill', up ? '#5a5a5a' : p.color);
}
// a flow switch pos of the way from at rest (0) to worked (1): the paddle bent over, the blade turned as the limit
// switch's (its stem and flag with it), the water in the pipe (by hand: fading in as it is worked; linked to a Flow
// value: there whenever the value is above nothing, its streaks quicker the more flow); lit in its colour while closed
// the paddle bent over as far as the switch has been worked, downstream: as the water moves (v.fd, from flowTick: -1 to
// 1, the streaks' speed; so it bends over as the water gets going, and the other way, upstream, when the pump reverses)
function fswPaddle(v) {
  const b = (v.low ? 1 - (v.pos || 0) : v.pos || 0) * (v.fd ?? 0), kk = b.toFixed(3);   // (a low flow switch: bent over at rest, upright as the flow stops) if (v.bk === kk) return; v.bk = kk;
  // the strip: an arc of FSW_PAD from its foot (160, 107), bent |b| of FSW_BEND over (right, or left); the paddle on along its end
  const s = b < 0 ? -1 : 1, ph = FSW_BEND * Math.abs(b) * Math.PI / 180, L = FSW_PAD, R = ph > 1e-3 ? L / ph : 0, y0 = 107 - FSW_BASE;
  const ex = 160 + s * (R ? R - R * Math.cos(ph) : 0), ey = y0 - (R ? R * Math.sin(ph) : L);
  const d = `M160 107V${y0}` + (R ? `A${R.toFixed(2)} ${R.toFixed(2)} 0 0 ${s > 0 ? 1 : 0} ${ex.toFixed(2)} ${ey.toFixed(2)}` : `V${ey}`);
  v.padSh.setAttribute('d', d); v.padStrip.setAttribute('d', d); v.padLit.setAttribute('d', d);
  // (the vane along the strip's end, its cupped face to the water: mirrored when the flow runs the other way)
  v.padEnd.setAttribute('transform', `translate(${ex.toFixed(2)} ${ey.toFixed(2)}) rotate(${(s * ph * 180 / Math.PI - 90).toFixed(2)}) scale(1 ${s})`);
}
function setFlow(v, p, pos, cl) {
  const f = pvFrac(p), k = pos.toFixed(3) + (cl ? 'c' : 'o') + (f === null ? '' : f.toFixed(3));
  if (v.k === k) return; v.k = k;
  const [hx, hy] = v.hinge, [a0, a1] = lswAngles(p), ba = lerp(a0, a1, pos);
  v.blade.setAttribute('transform', `rotate(${ba.toFixed(2)} ${hx} ${hy})`);
  v.pos = pos; v.low = !!p.low; fswPaddle(v);
  const c = cl ? p.color : BLADE_GREY;
  v.bladeShape.setAttribute('fill', c); v.stem.setAttribute('fill', c); v.flag.setAttribute('fill', c); v.posts.setAttribute('fill', cl ? p.color : GREY);
}
// a limit switch pos of the way from at rest (0) to worked (1): its lever down, the arrow on its roller (coming down,
// fading in), its blade lifted; lit in its colour while closed
function setLimit(v, p, pos, cl) {
  const k = pos.toFixed(3) + (cl ? 'c' : 'o');
  if (v.k === k) return; v.k = k;
  const [hx, hy] = v.hinge, [px, py] = v.pivot, [a0, a1] = lswAngles(p), la = 16 * pos, ba = lerp(a0, a1, pos);
  v.blade.setAttribute('transform', `rotate(${ba.toFixed(2)} ${hx} ${hy})`);
  v.link.setAttribute('y2', (hy + 30 * Math.tan(ba * Math.PI / 180) - 5.5).toFixed(2));   // (to just over the blade, at the middle)
  v.lever.setAttribute('transform', `rotate(${la.toFixed(2)} ${px} ${py})`);
  const c = cl ? p.color : BLADE_GREY;
  v.bladeShape.setAttribute('fill', c); v.wedge.setAttribute('fill', c); v.posts.setAttribute('fill', cl ? p.color : GREY);
  // (the arrow's tip on top of the roller, where the lever has turned it to; higher up, and fainter, before it gets there)
  const t = la * Math.PI / 180, [lx, ly] = LSW_ROLLER, rx = px + lx * Math.cos(t) - ly * Math.sin(t), ry = py + lx * Math.sin(t) + ly * Math.cos(t) - 13.3 - 1.5 - 16 * (1 - pos);
  v.arrow.setAttribute('opacity', Math.min(1, pos * 2.5).toFixed(3));
  v.arrowPath.setAttribute('d', `M${rx} ${ry}l-12 -13h6.5v-15h11v15h6.5z`);
}
