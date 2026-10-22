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
  <filter id="fShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="#000" flood-opacity=".55"/></filter>
  <pattern id="grid" width="${G}" height="${G}" patternUnits="userSpaceOnUse"><path d="M ${G} 0 L 0 0 0 ${G}" fill="none" stroke="#4b4b4b" stroke-width="1"/></pattern>
  <pattern id="gridMajor" width="${G * 5}" height="${G * 5}" patternUnits="userSpaceOnUse"><rect width="${G * 5}" height="${G * 5}" fill="url(#grid)"/><path d="M ${G * 5} 0 L 0 0 0 ${G * 5}" fill="none" stroke="#555" stroke-width="1.4"/></pattern>
  <linearGradient id="gBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a7a4a"/><stop offset=".45" stop-color="#d9c27a"/><stop offset="1" stop-color="#7a6a3c"/></linearGradient>
  <filter id="fGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
  <radialGradient id="gStud" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#e8e8e8"/><stop offset=".6" stop-color="#9a9a9a"/><stop offset="1" stop-color="#5a5a5a"/></radialGradient>`;
const BAR = 14;   // the L1 and L2 connection bars along the left and right edges
const BAR_HANDLE_Y = 14, BAR_HANDLE_H = 46;   // the grab handle at the top of each bar (Build mode)
const captionOf = p => p.t === 'coil' ? `${p.L} Coil` : p.t === 'lamp' ? (p.L ? `${p.L} Button Light` : 'Pilot Light') : p.t === 'con' ? `${p.L} Contact (${p.nc ? 'NC' : 'NO'})` : `${p.L} Button (${p.nc ? 'NC' : 'NO'})`;
/* Pilot lights. A light can be built into a pushbutton (an illuminated pushbutton): it is still wired as a light of
   its own, wherever it sits in the circuit, but it shows on the button too. The button's cap lights up with it, and a
   small lamp badge on the button's corner marks it as having a light. A light built into a button takes the button's
   colour. */
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
// a part, in the same style as the Order of Operations simulators
function drawPart(p, g, x, y, chan) {
  const v = {}, T = TERM(p), half = LOADT(p.t) ? COIL / 2 : BOX / 2, capH = p.t === 'con' ? CON_H / 2 + 1 : p.t === 'lamp' ? half + 10 : half;
  el('line', { x1: x - T, y1: y, x2: x + T, y2: y, stroke: '#262626', 'stroke-width': 22, 'stroke-linecap': 'round' }, chan || g);
  // the short leads between the part's ends and its body: each drawn in two pieces, so the current can flow along
  // them (the new colour, and what was there before it)
  const lead = () => el('line', { x1: x, y1: y, x2: x, y2: y, stroke: 'transparent', 'stroke-width': 8.9, 'stroke-linecap': 'round' }, g);
  v.lead = { A: { old: lead(), cur: lead(), term: x - T, body: x - half, y }, B: { old: lead(), cur: lead(), term: x + T, body: x + half, y } };
  if (p.t === 'btn') {
    v.lit = lampsOf(p.L).length > 0;
    // a button with a light built in: a glow behind it when the light is on
    if (v.lit) v.halo = el('rect', { x: x - BOX / 2 - 4, y: y - BOX / 2 - 4, width: BOX + 8, height: BOX + 8, rx: BOX * .22, fill: p.color, opacity: 0, filter: 'url(#fGlow)' }, g);
    if (p.nc) {
      const RB = BOX / 2 * 1.08, RI = BTN_IN / 2 * 1.1;
      el('path', { d: hexPath(x, y, RB, RB * .17), fill: 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
      v.press = el('g', {}, g);
      v.fill = el('path', { d: hexPath(x, y, RI, RI * .17), fill: p.color, stroke: '#1d2733', 'stroke-width': 1.2, filter: 'url(#fShadow)' }, v.press);
      el('path', { d: hexPath(x, y, RI, RI * .17), fill: 'url(#gGloss)' }, v.press);
    } else {
      el('rect', { x: x - BOX / 2, y: y - BOX / 2, width: BOX, height: BOX, rx: BOX * .1667, fill: 'url(#gWell)', stroke: p.color, 'stroke-width': 1.8 }, g);
      v.press = el('g', {}, g);
      v.fill = el('rect', { x: x - BTN_IN / 2, y: y - BTN_IN / 2, width: BTN_IN, height: BTN_IN, rx: BTN_IN * .1667, fill: p.color, stroke: '#1d2733', 'stroke-width': 1.2, filter: 'url(#fShadow)' }, v.press);
      el('rect', { x: x - BTN_IN / 2, y: y - BTN_IN / 2, width: BTN_IN, height: BTN_IN, rx: BTN_IN * .1667, fill: 'url(#gGloss)' }, v.press);
    }
    v.text = el('text', { x, y: y + 6.6, 'text-anchor': 'middle', class: 'devtext', 'font-size': 19, fill: DARK_TEXT }, v.press); v.text.textContent = p.L;
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
    v.text = el('text', { x, y: y + 7.5, 'text-anchor': 'middle', class: 'devtext', 'font-size': 21, fill: LIGHT_TEXT }, g); v.text.textContent = p.L;
  }
  el('text', { x, y: y + capH + 14 + (p.t === 'btn' && p.nc ? 4 : 0), 'text-anchor': 'middle', class: 'cap' }, g).textContent = captionOf(p);
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
