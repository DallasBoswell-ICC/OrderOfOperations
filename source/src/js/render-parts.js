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
const captionOf = p => p.t === 'xfm' ? `T${p.L} Control Transformer` : p.t === 'jmp' ? `Continuation ${p.L}` : p.t === 'sol' ? `SOL${p.L} Solenoid` : p.t === 'htr' ? `HTR${p.L} Heating Element` : p.t === 'l1' ? 'L1 Supply' : p.t === 'l2' ? 'L2 Return' : p.t === 'ph' ? `L${p.L} Phase` : p.t === 'dsc' ? `DS${p.L} Disconnect` : p.t === 'fus' ? `FU${p.L}–FU${+p.L + 2} Fuses` : p.t === 'fu1' ? `FU${p.L} Fuse` : p.t === 'mst' ? `${p.L} Starter` : p.t === 'olh' ? `OL${p.L} Overload` : p.t === 'olc' ? `OL${p.L} Contact (NC)` : p.t === 'psw' ? `PS${p.L} Pressure Switch (${p.nc ? 'NC' : 'NO'})` : p.t === 'tsw' ? `TS${p.L} ${p.low ? 'Low' : 'High'} Temp. Switch (${p.nc ? 'NC' : 'NO'})` : p.t === 'lsw' ? `LS${p.L} Limit Switch (${p.nc ? 'NC' : 'NO'}${p.held ? (p.nc ? ' held open' : ' held closed') : ''})` : p.t === 'mtr' ? `MTR${p.L} Motor` : p.t === 'sel' ? `${p.L} Selector` : p.t === 'coil' ? (isTimer(p) ? `${idOf(p)} ${p.tof ? 'Off' : 'On'}-Delay Timer` : `${idOf(p)} Coil`) : p.t === 'lamp' ? (p.L ? `${idOf(p)} Button Light` : 'Pilot Light') : p.t === 'con' ? `${idOf(p)} ${parts.some(q => isTimer(q) && q.L === p.L) ? (p.inst ? 'Instant ' : 'Timed ') : ''}Contact (${p.nc ? 'NC' : 'NO'})` : p.estop ? `${idOf(p)} E-Stop (NC)` : `${idOf(p)} Button (${p.nc ? 'NC' : 'NO'})`;
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
const capTop = p => (p.t === 'lsw' ? LSW_TOP + 42 + 13.3 + 28 + 4 : p.t === 'tsw' ? LSW_TOP + 2 : p.t === 'psw' ? PSW_UP + 2 : p.t === 'dsc' ? PWR_H / 2 + DSC_HEAD + 2 : p.t === 'xfm' ? XFM_H / 2 + 2 : p.t === 'olc' || p.t === 'fu1' ? CON_H / 2 + 1 : p.t === 'con' ? CON_H / 2 + 1 : isSolT(p.t) ? SOL_S / 2 + 2 : p.t === 'lamp' ? BODYH(p.t) / 2 + 2 : BODYH(p.t) / 2 + (p.t === 'btn' && p.nc ? 3 : 0)) + 11;
/* Every part's body has a coloured edge and, round that, a dark bezel in the colour of its well (BEZEL wide): body,
   coloured edge, dark bezel. framed draws the bezel (a wide dark stroke along the same outline, under the body), then
   the body itself. */
const BEZEL = 4.5, WELL = '#262626';
let solMaskN = 0;   // (each solenoid drawing's mask has an id of its own)
function framed(tag, a, g) { el(tag, Object.assign({}, a, { fill: 'none', stroke: WELL, 'stroke-width': (a['stroke-width'] || 1.8) + 2 * BEZEL }), g); return el(tag, a, g); }
// a part, in the same style as the Order of Operations simulators
function drawPart(p, g, x, y, chan, onStation) {
  // a single fuse turned: drawn as it is lying down, turned about its middle (its name, though, stays upright: above
  // it, or beside it when it stands upright)
  if (p.t === 'fu1' && p.rot && !g.turned) {
    const a = { transform: `rotate(${p.rot * 90} ${x} ${y})` }, g2 = el('g', a, g); g2.turned = true;
    const v = drawPart(p, g2, x, y, el('g', a, chan || g), true);
    if (!onStation) (v.cap = el('text', vert(p) ? { x: x + BOX / 2 + 12, y: y + 4.5, 'text-anchor': 'start', class: 'cap' } : { x, y: y - capTop(p), 'text-anchor': 'middle', class: 'cap' }, g)).textContent = captionOf(p);
    return v;
  }
  const v = {}, T = TERM(p), half = p.t === 'tsw' ? TSW_HALF : BODYH(p.t) / 2;
  if (!isBox(p) && p.t !== 'xfm' && !isPwr3(p) && p.t !== 'mtr') el('line', { x1: x - T, y1: y, x2: x + T, y2: y, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
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
  // on top of the bulb's box, a badge: a small flame on a high temperature switch, a snowflake on a low one
  const bx0 = tx, by0 = st - 1, bg = el('g', {}, g);   // (right above the thermometer)
  el('circle', { cx: bx0, cy: by0, r: 9, fill: '#1f1f1f', stroke: col, 'stroke-width': 1.4 }, bg);
  if (p.low) {
    const sf = el('g', { stroke: TSW_COLD, 'stroke-width': 1.5, 'stroke-linecap': 'round', fill: 'none' }, bg);
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3 + Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      el('line', { x1: bx0 - 5.6 * c, y1: by0 - 5.6 * s, x2: bx0 + 5.6 * c, y2: by0 + 5.6 * s }, sf);
      for (const e of [-1, 1]) { const ex = bx0 + e * 3.6 * c, ey = by0 + e * 3.6 * s, n = 1.7;   // (the little branches near each tip)
        el('path', { d: `M${ex + e * n * c - n * s} ${ey + e * n * s + n * c}L${ex} ${ey}L${ex + e * n * c + n * s} ${ey + e * n * s - n * c}`, 'stroke-width': 1.1 }, sf); }
    }
  } else {
    el('path', { d: `M${bx0} ${by0 - 6.2}C${bx0 + 2.2} ${by0 - 3.4} ${bx0 + 4.4} ${by0 - 1.4} ${bx0 + 4.4} ${by0 + 1.6}A4.4 4.4 0 0 1 ${bx0 - 4.4} ${by0 + 1.6}C${bx0 - 4.4} ${by0 - .4} ${bx0 - 3} ${by0 - 1.8} ${bx0 - 2} ${by0 - 3.2}C${bx0 - 1.6} ${by0 - 1.8} ${bx0 - 1.2} ${by0 - 1} ${bx0 - .4} ${by0 - .6}C${bx0 - .2} ${by0 - 2.6} ${bx0 + .4} ${by0 - 4.4} ${bx0} ${by0 - 6.2}Z`, fill: '#FF8A1F' }, bg);
    el('path', { d: `M${bx0} ${by0 - .8}C${bx0 + 1.2} ${by0 + .4} ${bx0 + 2.2} ${by0 + 1.4} ${bx0 + 2.2} ${by0 + 2.6}A2.2 2.2 0 0 1 ${bx0 - 2.2} ${by0 + 2.6}C${bx0 - 2.2} ${by0 + 1.4} ${bx0 - 1.2} ${by0 + .4} ${bx0} ${by0 - .8}Z`, fill: '#FFD23F' }, bg);
  }
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
  v.needle = el('g', { filter: 'url(#fShadow)' }, g); v.gc = [gx, gy];
  const nl = 22 * k;
  el('line', { x1: gx, y1: gy, x2: gx + nl, y2: gy, stroke: '#CC0000', 'stroke-width': 1.8, 'stroke-linecap': 'round' }, v.needle);
  el('path', { d: `M${gx + nl + 1.5} ${gy}L${gx + nl - 4.2} ${gy - 2.6}L${gx + nl - 4.2} ${gy + 2.6}Z`, fill: '#CC0000' }, v.needle);
  el('circle', { cx: gx, cy: gy, r: 2.2, fill: '#CC0000' }, v.needle); el('circle', { cx: gx, cy: gy, r: 2.2, fill: 'url(#gDome)' }, g);
  el('circle', { cx: gx, cy: gy, r: 33 * k, fill: 'url(#gGloss)', opacity: .35 }, g);
  // the body
  framed('rect', { x: x - hw, y: top, width: LSW_W, height: LSW_TOP + LSW_BOT, rx: 15, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
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
  el('text', { x: x + hw - 22, y: bot - 11.8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#e8e8e8' }, g).textContent = p.nc ? 'NC' : 'NO';
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
  const [gx, gy] = v.gc; v.needle.setAttribute('transform', `rotate(${(f === null ? lerp(135, 340, pos) : 135 + 270 * f).toFixed(2)} ${gx} ${gy})`);   // (linked: the value, round its whole scale)
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
