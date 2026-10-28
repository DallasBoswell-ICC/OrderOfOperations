/* =====================================================================
   drawing
   ===================================================================== */
const NS = 'http://www.w3.org/2000/svg', svg = document.getElementById('svg');
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; }
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
  <linearGradient id="gGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>
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
function screw(x, y, g) {
  el('rect', { x: x - 13, y: y - 13, width: 26, height: 26, rx: 3, fill: 'url(#gTerm)', stroke: '#2a2a2a', 'stroke-width': 1.2 }, g);
  el('rect', { x: x - 10.4, y: y - 10.4, width: 20.8, height: 20.8, rx: 2, fill: 'none', stroke: 'rgba(0,0,0,.28)', 'stroke-width': 1 }, g);
  el('circle', { cx: x, cy: y, r: 8.6, fill: 'url(#gStud)', stroke: '#3a3a3a', 'stroke-width': 1 }, g);
  el('rect', { x: x - 8.6, y: y - 1.2, width: 17.2, height: 2.4, fill: '#2a2a2a' }, g);   // the flat slot, right across the head
  el('rect', { x: x - 1.2, y: y - 4.2, width: 2.4, height: 8.4, fill: '#2a2a2a' }, g);     // with it, a short cross arm: the Phillips recess
  el('rect', { x: x - 2.4, y: y - 2.4, width: 4.8, height: 4.8, fill: '#2a2a2a', transform: `rotate(45 ${x} ${y})` }, g);   // its deeper centre
  return g;
}
const BAR = 22;   // the L1 and L2 connection bars along the left and right edges
const BAR_HANDLE_Y = 14, BAR_HANDLE_H = 46;   // the grab handle at the top of each bar (Build mode)
const captionOf = p => p.t === 'sel' ? `${p.L} Selector` : p.t === 'coil' ? (isTimer(p) ? `${p.L} ${p.tof ? 'Off' : 'On'}-Delay Timer` : `${p.L} Coil`) : p.t === 'lamp' ? (p.L ? `${p.L} Button Light` : 'Pilot Light') : p.t === 'con' ? `${p.L} ${parts.some(q => isTimer(q) && q.L === p.L) ? (p.inst ? 'Instant ' : 'Timed ') : ''}Contact (${p.nc ? 'NC' : 'NO'})` : `${p.L} Button (${p.nc ? 'NC' : 'NO'})`;
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
const litOf = q => { const on = !!coilOn[q.id], f = q._chg == null ? 1 : clamp01((simT - q._chg) / LAMP_FADE); return on ? f : 1 - f; };
function lampRays(x, y, R, g) {
  const rays = el('g', { 'stroke-width': 3.2, 'stroke-linecap': 'round', stroke: '#5a5a5a' }, g);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4 + Math.PI / 8, r1 = R + 5, r2 = R + 13;
    el('line', { x1: x + r1 * Math.cos(a), y1: y + r1 * Math.sin(a), x2: x + r2 * Math.cos(a), y2: y + r2 * Math.sin(a) }, rays);
  }
  return rays;
}
const filament = (x, y, s, g, w) => el('path', { d: `M ${x - s} ${y - s} L ${x + s} ${y + s} M ${x + s} ${y - s} L ${x - s} ${y + s}`, 'stroke-width': w, 'stroke-linecap': 'round', fill: 'none', stroke: 'rgba(30,30,30,.55)' }, g);
// how far above a part's middle its name is written (clear of the badges on its top corners)
const capTop = p => (p.t === 'con' ? CON_H / 2 + 1 : p.t === 'lamp' ? BODYH(p.t) / 2 + 10 : BODYH(p.t) / 2 + (p.t === 'btn' && p.nc ? 3 : 0)) + 11;
// a part, in the same style as the Order of Operations simulators
function drawPart(p, g, x, y, chan, onStation) {
  const v = {}, T = TERM(p), half = BODYH(p.t) / 2;
  el('line', { x1: x - T, y1: y, x2: x + T, y2: y, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
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
    if (p.nc) {
      const RB = BOX / 2 * 1.08, RI = BTN_IN / 2 * 1.1;
      el('path', { d: hexPath(x, y, RB, RB * .17), fill: 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
      v.press = el('g', {}, g);
      v.fill = el('path', { d: hexPath(x, y, RI, RI * .17), fill: v.sec ? v.secFill : p.color, stroke: v.sec ? p.color : '#1d2733', 'stroke-width': v.sec ? 1.8 : 1.2, filter: 'url(#fShadow)' }, v.press);
      el('path', { d: hexPath(x, y, RI, RI * .17), fill: 'url(#gGloss)' }, v.press);
    } else {
      el('rect', { x: x - BOX / 2, y: y - BOX / 2, width: BOX, height: BOX, rx: BOX * .1667, fill: 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
      v.press = el('g', {}, g);
      v.fill = el('rect', { x: x - BTN_IN / 2, y: y - BTN_IN / 2, width: BTN_IN, height: BTN_IN, rx: BTN_IN * .1667, fill: v.sec ? v.secFill : p.color, stroke: v.sec ? p.color : '#1d2733', 'stroke-width': v.sec ? 1.8 : 1.2, filter: 'url(#fShadow)' }, v.press);
      el('rect', { x: x - BTN_IN / 2, y: y - BTN_IN / 2, width: BTN_IN, height: BTN_IN, rx: BTN_IN * .1667, fill: 'url(#gGloss)' }, v.press);
    }
    v.text = el('text', { x, y: y + 6.6, 'text-anchor': 'middle', class: 'devtext', 'font-size': 19, fill: DARK_TEXT, style: v.sec ? `fill:${p.color}` : '' }, v.press); capText(v.text, nameOf(p), p.nc ? 35 : 37, 19, y + 6.6);
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
  } else if (p.t === 'con') {
    // a relay contact, as in the Order of Operations simulators: two contact points, and a bar that drops onto them to close
    const B = BOX, H = CON_H, col = coilColour(p.L);
    el('rect', { x: x - B / 2, y: y - H / 2, width: B, height: H, rx: H * .1667, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
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
  } else if (p.t === 'lamp') {
    // a pilot light: a lens with a filament, that glows and sends out rays when lit
    const col = lampColour(p); v.col = col;
    v.glow = el('circle', { cx: x, cy: y, r: COIL / 2 + 6, fill: col, opacity: 0, filter: 'url(#fGlow)' }, g);
    v.rays = lampRays(x, y, COIL / 2, g);
    el('circle', { cx: x, cy: y, r: COIL / 2, fill: 'url(#gWell)', stroke: col, 'stroke-width': 1.8 }, g);
    v.fill = el('circle', { cx: x, cy: y, r: COIL_IN / 2, fill: GREY, stroke: '#1d2733', 'stroke-width': 1.2 }, g);
    el('circle', { cx: x, cy: y, r: COIL_IN / 2, fill: 'url(#gDome)' }, g);
    v.fil = filament(x, y, COIL_IN * .22, g, 2.4);
  } else {
    el('circle', { cx: x, cy: y, r: COIL / 2, fill: 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
    v.fill = el('circle', { cx: x, cy: y, r: COIL_IN / 2, fill: GREY, stroke: '#1d2733', 'stroke-width': 1.2, filter: 'url(#fShadow)' }, g);
    el('circle', { cx: x, cy: y, r: COIL_IN / 2, fill: 'url(#gDome)' }, g);
    if (!isTimer(p)) { v.text = el('text', { x, y: y + 7.5, 'text-anchor': 'middle', class: 'devtext', 'font-size': 21, fill: LIGHT_TEXT }, g); capText(v.text, nameOf(p), 52, 21, y + 7.5); }
    else drawTimer(p, g, x, y, v);
  }
  // its name, above it (the other contact blocks of a pushbutton or selector switch go without: the dashed line joins them to it)
  if (!v.sec && !onStation) el('text', { x, y: y - capTop(p), 'text-anchor': 'middle', class: 'cap' }, g).textContent = captionOf(p);
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
  el('rect', { x: x - S / 2, y: y - S / 2, width: S, height: S, rx: S * .1667, fill: v.sec ? '#1c1c1c' : 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
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
