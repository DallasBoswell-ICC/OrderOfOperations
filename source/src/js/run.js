/* ---------------- run mode ---------------- */
let prevT = performance.now();
function frame(now) {
  const real = Math.min(.5, Math.max(0, (now - prevT) / 1000)), dt = Math.min(.1, real); prevT = now;
  if (!editing) {
    // at high speed a busy circuit (a buzzer, say) can have more to do in one frame than the computer can manage: it
    // does what it can in a set time and carries on from there next frame, so the page never stalls
    const target = simT + dt * speed, ran = eventsRun, was = simT;
    tickRealTimers(real);   // (timers counting real time go by the clock; one timing out now is acted on below)
    if (runEvents(target, performance.now() + 12)) simT = target;
    if (mode === 'click') for (const L in autoRel) if (!busyQueue() && simT > busyUntil + .5) { delete autoRel[L]; press(L, false); }
    // once the circuit has settled (nothing on its way, and the last coil, light and contact has finished changing)
    // nothing on the panel moves, so it is not painted again until something happens: an idle circuit costs nothing
    // (at high speed a whole chain of changes can start and finish within one frame: whatever happened is painted)
    // (and once more as it settles, so whatever was moving is painted where it stopped, even when a fast clock went past
    // the end of the movement within one frame)
    if (needPaint || eventsRun !== ran || busyQueue() || simT <= busyUntil + 0.6 || was <= busyUntil + 0.6) { paint(); needPaint = false; }
    else if (anyTiming()) paintTimers();   // (a timer counting down: only its readout changes)
  }
  requestAnimationFrame(frame);
}
function paint() {
  for (const V of VIEWS) paintView(V);
  paintStation(); overviewTick();
  const fl = document.getElementById('fault');
  const msg = shortNow ? 'Short circuit! L1 is connected straight to L2 with no coil in between. In a real panel the fuse or breaker would open. Release the button or change the wiring to clear it.'
    : phFault ? phFault + ' In a real panel the fuses or breaker would open. Change the wiring to clear it.' : '';
  if (fl.hidden !== !msg || fl.textContent !== msg) { fl.hidden = !msg; fl.textContent = msg; }
}
// one drawing of the circuit (the main view, or the second pane in split view): the wires and the parts
function paintView(V) {
  if (!V.runs) return;
  for (const it of V.runs) {
    const cols = it.subs.map(s => lit(s.a, simT) && lit(s.b, simT) ? colAt(s.b, simT) : null), k = cols.join('|');
    if (k === it.last) continue; it.last = k;
    // each lit stretch of the wire is one smooth stroke, shaded along its length with a gradient
    it.g.innerHTML = '';
    for (let i = 0, k = 0; i < cols.length;) {
      if (!cols[i]) { i++; continue; }
      let j = i; while (j + 1 < cols.length && cols[j + 1]) j++;
      const a = it.subs[i], b = it.subs[j], id = `rg${V.tag}${it.n}_${k++}`, n = j - i + 1;
      const gr = el('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: a.x1, y1: a.y1, x2: b.x2, y2: b.y2 }, it.g);
      for (let m = i; m <= j; m++) if (m === i || m === j || cols[m] !== cols[m - 1] || cols[m] !== cols[m + 1]) el('stop', { offset: ((m - i + .5) / n).toFixed(4), 'stop-color': cols[m] }, gr);
      el('path', { d: V.shape(a.x1, a.y1, b.x2, b.y2), fill: 'none', stroke: `url(#${id})`, 'stroke-width': 8.9, 'stroke-linecap': 'round' }, it.g);
      i = j + 1;
    }
  }
  // parts: each one is only touched when how it looks has changed (redrawing a part, with its shadow, is costly)
  for (const p of parts) {
    const v = V.parts.get(p.id); if (!v) continue;
    if (p.t === 'xfm') { paintXfm(p, v); continue; }
    if (isPwr3(p)) { paintPwr(p, v); continue; }
    if (p.t === 'mtr') { paintMtr(p, v); continue; }
    if (isJmp(p)) {
      for (const q of v.src || []) { const c = colAt(q.n, simT) || 'transparent'; if (c !== q.c) q.ln.setAttribute('stroke', q.c = c); }
      const c = (p._c !== undefined && colAt(p._c, simT)) || '#8a8a8a'; if (c !== v.cc) { v.cc = c; for (const ch of v.chev) ch.setAttribute('stroke', c); }
      continue;
    }
    if (isSrc(p) || isPh(p)) { if (v.src) for (const q of v.src) { const c = colAt(q.n, simT) || 'transparent'; if (c !== q.c) q.ln.setAttribute('stroke', q.c = c); } continue; }
    for (const S of ['A', 'B']) paintLead(v.lead[S], p._lead && p._lead[S]);
    let k;
    if (p.t === 'btn') paintBtn(p, v, p.x, p.y);
    else if (p.t === 'lsw') setLimit(v, p, lswPos(p), lswClosed(p));
    else if (p.t === 'tsw') setTemp(v, p, lswPos(p), lswClosed(p));
    else if (p.t === 'con' || p.t === 'olc') {
      const s = p.t === 'olc' ? olState(p.L) : CON[p.id]; if (!s) continue;
      const f = clamp01((simT - s.t0) / SWING), e = f * f * (3 - 2 * f);   // ease in and out
      const lift = (s.closing ? lerp(OPEN_LIFT, 0, e) : lerp(0, OPEN_LIFT, e)).toFixed(2);
      k = lift + (s.shut ? 's' : 'o');
      if (k === v.k) continue; v.k = k;
      v.blade.setAttribute('transform', `translate(0 ${-lift})`);
      v.bladeShape.setAttribute('fill', s.shut ? v.col : BLADE_GREY);
      if (v.arrow) { v.arrow.setAttribute('fill', s.shut ? v.col : BLADE_GREY); v.arrow.setAttribute('stroke', s.shut ? v.col : BLADE_GREY); }
      v.posts.setAttribute('fill', s.shut ? v.col : GREY);
    } else if (p.t === 'sel') paintSel(p, v);
    else if (p.t === 'fu1') paintFu1(p, v);
    else if (p.t === 'sol') paintSol(p, v);
    else if (p.t === 'lamp') {
      const lit = litOf(p); k = lit.toFixed(3);
      if (k === v.k) continue; v.k = k;
      v.fill.setAttribute('fill', mixRgb(GREY, v.col, lit));
      v.glow.setAttribute('opacity', (lit * .55).toFixed(3));
      v.fil.setAttribute('stroke', lit > .5 ? 'rgba(255,255,255,.85)' : 'rgba(30,30,30,.55)');
    } else {
      const on = !!coilOn[p.id], f = p._chg == null ? 1 : clamp01((simT - p._chg) / .5);
      k = (on ? 1 : 0) + ':' + f.toFixed(3) + (v.timer ? ':' + timerLeft(p) + timerLit(p) : '');
      if (k === v.k) continue; v.k = k;
      v.fill.setAttribute('fill', on ? mixRgb(GREY, p.color, f) : mixRgb(p.color, GREY, f));
      v.text.style.fill = (on ? f : 1 - f) > .5 ? DARK_TEXT : LIGHT_TEXT;
      if (v.timer) paintTimer(p, v, on ? f : 1 - f);
    }
  }
}
// a pushbutton's cap (on the circuit, or on the operator station: v is that drawing, centred at x, y)
function paintBtn(p, v, x, y) {
  // a button with a light built in: its cap is dim while the light is off, and lights up with it
  let k; const pr = !!down[p.L], lit = v.lit ? Math.max(0, ...lampsOf(p.L).map(litOf)) : 0; k = (pr ? 1 : 0) + ':' + lit.toFixed(3);
  if (k === v.k) return; v.k = k;
  if (v.sec) {   // a secondary drawing pressed: its rim and letter go grey (where the main one's whole cap goes grey)
    v.fill.setAttribute('fill', pr ? SEC_PRESSED : v.secFill);
    v.fill.setAttribute('stroke', pr ? SEC_PRESSED_RIM : p.color);
    v.text.style.fill = pr ? SEC_PRESSED_RIM : p.color;
  } else {
    v.fill.setAttribute('fill', v.lit ? mixOk(pr ? GREY : mixOk(p.color, GREY, .55), p.color, lit) : pr ? GREY : p.color);
    v.text.style.fill = pr && lit < .5 ? LIGHT_TEXT : DARK_TEXT;
  }
  if (v.lit) {
    v.halo.setAttribute('opacity', (lit * .6).toFixed(3));
    v.badge.setAttribute('fill', mixRgb(GREY, p.color, lit));
    v.badgeFil.setAttribute('stroke', lit > .5 ? 'rgba(255,255,255,.85)' : 'rgba(30,30,30,.55)');
  }
  v.press.setAttribute('transform', pr ? `translate(${x} ${y}) scale(.93) translate(${-x} ${-y})` : '');
}
// a selector switch's handle turning, and its position names
function paintSel(p, v) {
  const T = SELTURN[p.L], pos = selPos(p.L), A = SEL_ANG[selN(p)];
  let ang = A[pos];
  if (T) { const f = clamp01((simT - T.t0) / SEL_TURN), e = f * f * (3 - 2 * f); ang = A[T.from] + (A[T.to] - A[T.from]) * e; }
  const k = pos + ':' + ang.toFixed(2);
  if (k === v.k) return; v.k = k;
  setSelector(v, p, pos, ang);
}
// a part's lead: the latest change flows along it from where it started (the part's end, or its body), at the same
// speed as along a wire; ahead of it, the lead still shows what it had before
/* a solenoid: once it has pulled in, its colour fills it from the end the current comes in at, as the current fills a
   wire (taking as long as the current takes to cross its body), and drains away the same way once the current has
   gone. Current through it without pulling it in (too little voltage, in series) leaves it grey. */
function paintSol(p, v) {
  const S = p._inS || 'A', evs = p._lead && p._lead[S], Ls = TERM(p) - BODYH(p.t) / 2, at = e => e.t0 + Ls / V;
  let i = -1; if (evs) for (let k = 0; k < evs.length; k++) if (at(evs[k]) <= simT + 1e-9) i = k;
  const show = !!coilOn[p.id] || !COND[p.id], c = e => show && e && e.col ? v.col : null;
  const cur = i >= 0 ? evs[i] : null, now = c(cur), prev = i > 0 ? c(evs[i - 1]) : null;
  const f = cur ? clamp01((simT - at(cur)) * V / BODYH(p.t)) : 0;
  const k = `${S}|${f.toFixed(3)}|${now}|${prev}`;
  if (k === v.k) return; v.k = k;
  const d = SOL_D[S === 'A' ? 0 : 1], n = f * SOL_LEN;
  for (const [lns, col, dash] of [[v.cur, now, `${n} ${SOL_LEN + 1}`], [v.old, prev, `0 ${n} ${SOL_LEN + 1}`]]) for (const ln of lns) {
    if (ln.getAttribute('d') !== d) ln.setAttribute('d', d);
    ln.setAttribute('stroke', col || 'transparent'); ln.setAttribute('stroke-dasharray', dash);
  }
}
/* a single fuse: the current crosses it from the end it comes in at, as along a wire (the new colour behind its front,
   what was there before ahead of it). Blown: the line half stays lit, and the load half goes dark from the break out
   to its end; put back: the current carries on from the break to the load end. Either way the front reaches the load
   end just as the change sets off along the lead beyond (so it flows on without a pause). */
// a stretch of a fuse's way through, from a to b (0 at the end its current comes in at, 1 at the other) in colour c
function fuseSpan(v, S, L, a, b, c) { if (S === 'B') [a, b] = [1 - b, 1 - a]; L.r.setAttribute('x', (v.x0 + a * v.span).toFixed(2)); L.r.setAttribute('width', (Math.max(0, b - a) * v.span).toFixed(2)); L.g.setAttribute('fill', c || 'transparent'); }
/* a fuse on a line of the three-phase supply (a pole of the three-pole fuses, or a single fuse on a line): the phase
   crossing it from its line side as it arrives there (over the time it takes to cross the pole); blown, the load half
   going dark from the break; put back, on from the break */
function paintPhaseFuse(q, k, cl) {
  const ln = PLINE.get(k) ?? k._a, S = ln === k._a ? 'A' : 'B', lc = colAt(ln, simT), at = PARR.get(ln);
  const T0 = FU1T[k.id], g = T0 === undefined ? 1 : clamp01((simT - T0) * V / (q.span / 2));
  const f = !lc ? 0 : at ? clamp01((simT - at.t) * V / 80) : 1;
  const key = `${lc}|${f.toFixed(3)}|${cl}|${g.toFixed(3)}`; if (key === q.k) return; q.k = key;
  if (!cl) { fuseSpan(q, S, q.cur, 0, .5, lc); fuseSpan(q, S, q.old, .5 + .5 * g, 1, g < 1 ? lc : null); }
  else if (g < 1) { fuseSpan(q, S, q.cur, 0, .5 + .5 * g, lc); fuseSpan(q, S, q.old, .5 + .5 * g, 1, null); }
  else { fuseSpan(q, S, q.cur, 0, f, lc); fuseSpan(q, S, q.old, f, 1, null); }
  q.mark.setAttribute('display', cl ? 'none' : '');
}
function paintFu1(p, v) {
  // (on a line of the three-phase supply, the phase reaching it: as a pole of the three-pole fuses)
  const pl = PLINE.get(p); if (pl !== undefined && [p._a, p._b].some(n => PARR.has(n) || PDARK.has(n))) return paintPhaseFuse(v, p, closed(p));
  const cl = closed(p), d = DIRS.find(x => x.e.part === p), S = d && d.from === p._b ? 'B' : 'A', outS = S === 'A' ? 'B' : 'A';
  const inN = S === 'A' ? p._a : p._b, outN = S === 'A' ? p._b : p._a;
  // (spans along it, from the end the current comes in at: 0 there, 1 at the other)
  const set = (L, a, b, c) => fuseSpan(v, S, L, a, b, c);
  const T0 = FU1T[p.id], ev = T0 !== undefined && p._lead && p._lead[outS].find(e => e.from === 'body' && e.t0 >= T0 - 1e-9);
  const end = ev ? ev.t0 : T0 + v.span / 2 / V, g = T0 === undefined ? 1 : clamp01((simT - T0) / Math.max(end - T0, 1e-6));
  let k;
  if (!cl) {
    // (the load end keeps its old colour a moment longer than the fuse, until the dark has run out along its lead: the
    // load half takes it again only once that has gone, so it never flashes back on behind the dark)
    const Ls = TERM(p) - BOX / 2, gone = T0 === undefined || simT >= end + Ls / V + 1e-6;
    const a = colAt(inN, simT), b = gone ? colAt(outN, simT) : null; k = `x|${a}|${b}|${g.toFixed(3)}`; if (k === v.k) return; v.k = k;
    set(v.cur, 0, .5, a); if (g < 1) set(v.old, .5 + .5 * g, 1, a); else set(v.old, .5, 1, b);   // (the load half going dark from the break)
  } else if (g < 1) {
    const a = colAt(inN, simT); k = `r|${a}|${g.toFixed(3)}`; if (k === v.k) return; v.k = k;
    set(v.cur, 0, .5 + .5 * g, a); set(v.old, .5 + .5 * g, 1, colAt(outN, simT));   // (put back: on from the break)
  } else {
    const evs = p._lead && p._lead[S], Ls = TERM(p) - BOX / 2, at = e => e.t0 + Ls / V;
    let i = -1; if (evs) for (let n = 0; n < evs.length; n++) if (at(evs[n]) <= simT + 1e-9) i = n;
    const cur = i >= 0 ? evs[i] : null, now = cur && cur.col, prev = i > 0 ? evs[i - 1].col : null;
    const f = cur ? clamp01((simT - at(cur)) * V / v.span) : 0;
    k = `${S}|${f.toFixed(3)}|${now}|${prev}`; if (k === v.k) return; v.k = k;
    set(v.cur, 0, f, now); set(v.old, f, 1, prev);
  }
  v.mark.setAttribute('display', cl ? 'none' : '');
}
/* a transformer: what reaches its terminals lights their leads; the primary fills as the solenoid's bolt does, in the
   colour of the current coming in, from the end it comes in at, and drains the same way; once the primary is fed the
   secondary fills from X1 in the source's colour (the supply it now is), and drains back toward X1 when it is not */
function paintXfm(p, v) {
  for (const q of v.src || []) { const c = colAt(q.n, simT) || 'transparent'; if (c !== q.c) q.ln.setAttribute('stroke', q.c = c); }
  const S = p._inS || 'A', evs = p._lead && p._lead[S], body = 2 * TERM(p);
  let i = -1; if (evs) for (let k = 0; k < evs.length; k++) if (evs[k].t0 <= simT + 1e-9) i = k;
  const cur = i >= 0 ? evs[i] : null, f = cur ? clamp01((simT - cur.t0) * V / body) : 0;
  const on = !!coilOn[p.id], g = p._chg == null ? 1 : clamp01((simT - p._chg) * V / body);
  const P = p._ph, h = P ? (P.off == null ? clamp01((simT - P.t0) * V / (body / 2)) : 1 - clamp01((simT - P.off) * V / (body / 2))) : 0;
  const pri = P ? ['ph', h.toFixed(3), P.a, P.b] : [S === 'A' ? 0 : 1, f, cur && cur.col, i > 0 ? evs[i - 1].col : null], sec = [0, g, on ? SRC_COL : null, on || p._chg == null ? null : SRC_COL];
  const k = pri.join('|') + '/' + sec.join('|');
  if (k === v.k) return; v.k = k;
  const fillW = (W, dir, f, now, before) => {
    const d = W.d[dir], n = f * XFM_LEN;
    for (const ln of [W.old, W.cur]) if (ln.getAttribute('d') !== d) ln.setAttribute('d', d);
    W.cur.setAttribute('stroke', now || 'transparent'); W.cur.setAttribute('stroke-dasharray', f >= 1 ? 'none' : `${n} ${XFM_LEN + 2}`);   // (filled: no dashes, round where the turns meet)
    W.old.setAttribute('stroke', f >= 1 ? 'transparent' : before || 'transparent'); W.old.setAttribute('stroke-dasharray', `0 ${n} ${XFM_LEN + 2}`);
    W.dots[dir].setAttribute('fill', (f > 0 ? now : before) || 'transparent'); W.dots[1 - dir].setAttribute('fill', (f >= 1 ? now : before) || 'transparent');
  };
  if (P) {   // (old: the far half, from H2, in H2's phase)
    const W = v.pri, n = h * XFM_LEN / 2 + (h >= 1 ? 1 : 0);
    W.cur.setAttribute('d', W.d[0]); W.old.setAttribute('d', W.d[1]);
    W.grad.stops[0].setAttribute('stop-color', P.a); W.grad.stops[1].setAttribute('stop-color', P.b);
    for (const ln of [W.cur, W.old]) { ln.setAttribute('stroke', h > 0 ? `url(#${W.grad.id})` : 'transparent'); ln.setAttribute('stroke-dasharray', `${n} ${XFM_LEN + 2}`); }
    W.dots[0].setAttribute('fill', h > 0 ? P.a : 'transparent'); W.dots[1].setAttribute('fill', h > 0 ? P.b : 'transparent');
  } else fillW(v.pri, ...pri);
  fillW(v.sec, ...sec);
}
function paintLead(L, evs) {
  let i = -1; if (evs) for (let k = 0; k < evs.length; k++) if (evs[k].t0 <= simT + 1e-9) i = k;
  const cur = i >= 0 ? evs[i] : null, prev = i > 0 ? evs[i - 1].col : null;
  const len = Math.abs(L.term - L.body), from = cur && cur.from === 'body' ? L.body : L.term, to = from === L.term ? L.body : L.term;
  const f = cur ? clamp01((simT - cur.t0) * V / Math.max(len, 1)) : 0, mid = from + (to - from) * f;
  const k = `${from}|${mid.toFixed(1)}|${cur && cur.col}|${prev}`;
  if (k === L.k) return; L.k = k;   // nothing has changed: leave it alone
  const set = (ln, x1, x2, c) => { const show = c && Math.abs(x2 - x1) > 0.5; ln.setAttribute('x1', x1); ln.setAttribute('x2', x2); ln.setAttribute('y1', L.y); ln.setAttribute('y2', L.y); ln.setAttribute('stroke', show ? c : 'transparent'); };
  set(L.cur, from, mid, cur && cur.col); set(L.old, mid, to, prev);
}
function bindButton(g, p) {
  g.setAttribute('class', 'dev'); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', captionOf(p));
  const K = opKey(p);   // (a pushbutton's letter; a limit switch's number; a temperature switch's T and its number)
  const dn = () => {
    if (p.maint) return press(K, !down[K]);
    if (mode === 'click') { if (down[K]) return; press(K, true); autoRel[K] = true; } else press(K, true);
  };
  const up = () => { if (mode === 'hold' && !p.maint) press(K, false); };
  g.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); try { g.setPointerCapture(e.pointerId); } catch (_) {} dn(); });
  g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  g.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); dn(); } });
  g.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') up(); });
}

// a timer's badge (lit while it is energized) and its readout (the whole seconds left, in the timer's colour; dim
// while it is off)
function paintTimer(p, v, lit) {
  v.badge.setAttribute('fill', mixRgb(GREY, p.color, lit));
  v.glass.setAttribute('stroke', lit > .5 ? '#1c1c1c' : '#d8d8d8'); v.sand.setAttribute('fill', lit > .5 ? '#1c1c1c' : '#d8d8d8');
  setReadout(v, p, timerLeft(p), timerLit(p));
}
function paintTimers() { for (const V of VIEWS) if (V.parts) for (const p of parts) if (isTimer(p)) { const v = V.parts.get(p.id); if (v && v.timer) setReadout(v, p, timerLeft(p), timerLit(p)); } }

// a selector switch while running: press a position's name to turn it straight there; anywhere else on its left half
// turns it one position left, its right half one right (or the arrow keys when it has the focus)
function bindSelector(g, p) {
  g.setAttribute('class', 'dev'); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'slider'); g.setAttribute('aria-label', captionOf(p) + ': turn left or right');
  g.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); const at = e.target.closest && e.target.closest('[data-pos]'); if (at) return turn(p.L, +at.dataset.pos); const r = g.getBoundingClientRect(); turn(p.L, selPos(p.L) + (e.clientX < r.left + r.width / 2 ? -1 : 1)); });
  g.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); turn(p.L, selPos(p.L) + (e.key === 'ArrowLeft' ? -1 : 1)); } });
}

// an overload's contacts: shut until it trips, lifting off over a moment (as a relay contact's bar)
const olState = L => { const o = OLTRIP[L], r = OLRESET[L]; return o ? { t0: o.t, closing: false, shut: false } : { t0: r ?? -1e9, closing: true, shut: true }; };
// a three-phase part: what reaches each of its ends lights its leads; each pole shows its state, lit where the
// phase goes through it
function paintPwr(p, v) {
  for (const q of v.src) { const c = colAt(q.n, simT) || 'transparent'; if (c !== q.c) q.ln.setAttribute('stroke', q.c = c); }
  if (!p._poles) return;
  const ease = t0 => { const f = clamp01((simT - t0) / SWING); return f * f * (3 - 2 * f); };
  let lev = null;
  if (p.t === 'dsc') { const t0 = DSC_T[p.id] ?? -1e9, e = ease(t0), off = !!DSC[p.id]; lev = off ? lerp(0, 1, e) : lerp(1, 0, e); }
  p._poles.forEach((k, i) => {
    const q = v.poles[i], a = colAt(k._a, simT), b = colAt(k._b, simT), cl = closed(k), c = a || b;
    let key;
    if (p.t === 'dsc') {
      key = `${a}|${b}|${cl}|${lev.toFixed(3)}`; if (key === q.k) return; q.k = key;
      q.bg.setAttribute('transform', `rotate(${(-32 * lev).toFixed(2)} ${q.px} ${q.py})`);
      q.blade.setAttribute('fill', cl && c ? c : BLADE_GREY); q.pa.setAttribute('fill', a || GREY); q.pb.setAttribute('fill', b || GREY);
    } else if (p.t === 'fus') {
      paintPhaseFuse(q, k, cl);
    } else if (p.t === 'mst') {
      const s = CON[p.id] || { t0: -1e9, closing: false, shut: false }, e = ease(s.t0), lift = (s.closing ? lerp(OPEN_LIFT, 0, e) : lerp(0, OPEN_LIFT, e)).toFixed(2);
      key = `${lift}|${s.shut}`; if (key === q.k) return; q.k = key;   // (exactly as a NO relay contact: its coil's colour once shut)
      const col = coilColour(p.L);
      q.bg.setAttribute('transform', `translate(0 ${-lift})`); q.blade.setAttribute('fill', s.shut ? col : BLADE_GREY);
      q.pa.setAttribute('fill', s.shut ? col : GREY); q.pb.setAttribute('fill', s.shut ? col : GREY);
    } else {
      key = `${c}`; if (key === q.k) return; q.k = key;
      q.e.setAttribute('stroke', c || GREY);
    }
  });
  if (v.lever) { v.lever.setAttribute('transform', `rotate(${(45 - 90 * lev).toFixed(2)} ${v.hx} ${v.hy})`); v.onT.setAttribute('fill', lev < .5 ? DSC_HANDLE : '#6a6a6a'); v.offT.setAttribute('fill', lev < .5 ? '#6a6a6a' : DSC_HANDLE); }
  if (v.trip) v.trip.setAttribute('display', OLTRIP[p.L] ? '' : 'none');
}
// a motor: each third of its ring in the phase at its terminal; its fan turning, or shaking, as it runs or hums
function paintMtr(p, v) {
  for (const q of v.src) { const c = colAt(q.n, simT) || 'transparent'; if (c !== q.c) q.ln.setAttribute('stroke', q.c = c); }
  const cols = (p._t || []).map(n => colAt(n, simT) || GREY), m = MOT[p.id] || { st: 'off', dir: 0 };
  const key = cols.join('|') + m.st + m.dir; if (key === v.k) return; v.k = key;
  cols.forEach((c, i) => v.arcs[i].setAttribute('stroke', c));
  spinFan(v, m.st === 'run' ? (m.dir < 0 ? 'rev' : 'fwd') : m.st === 'hum' ? 'hum' : '');
  v.arrow.setAttribute('display', m.st === 'run' ? '' : 'none');
  v.arrowPath.setAttribute('transform', m.dir < 0 ? `translate(0 ${2 * v.cy}) scale(1 -1)` : '');   // (backward: turned over, pointing up the right side)
  v.dir.textContent = m.dir < 0 ? 'REVERSE' : 'FORWARD';
  v.hum.setAttribute('display', m.st === 'hum' ? '' : 'none');
}
// a three-phase part clicked while running (see workPower): the pole nearest where it was clicked
function bindPower(g, p) {
  g.setAttribute('class', 'dev'); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
  g.setAttribute('aria-label', captionOf(p) + (p.t === 'dsc' ? ': turn on or off' : p.t === 'fus' || p.t === 'fu1' ? ': blow a fuse, or put it back' : p.t === 'olh' ? ': trip it, or reset it' : ': reset its overload'));
  g.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); const q = pt(e); workPower(p, Math.max(0, Math.min(2, Math.round((q.y - p.y) / PWR_DY) + 1))); });
  g.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); workPower(p, 1); } });
}

// a motor's fan: turning about its hub (an SVG animation: smooth, and no painting needed while it turns), the other way
// backward, or shaking while it hums; still otherwise. (It turns even where the computer asks for less motion: whether,
// and which way, a motor runs is what it shows.)
function spinFan(v, how) {
  if (v.anim === how) return; v.anim = how;
  for (const a of v.rotor.querySelectorAll('animateTransform')) a.remove();
  if (!how) return;
  const a = el('animateTransform', how === 'hum' ? { attributeName: 'transform', type: 'translate', values: '0 0;1.1 -.7;-1.1 .7;0 0', dur: '.08s', repeatCount: 'indefinite' }
    : { attributeName: 'transform', type: 'rotate', from: how === 'rev' ? '360' : '0', to: how === 'rev' ? '0' : '360', dur: '.9s', repeatCount: 'indefinite' }, v.rotor);
  try { a.beginElement(); } catch (_) {}
}
