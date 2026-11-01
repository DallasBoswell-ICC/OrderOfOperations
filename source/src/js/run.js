/* ---------------- run mode ---------------- */
let prevT = performance.now();
function frame(now) {
  const real = Math.min(.5, Math.max(0, (now - prevT) / 1000)), dt = Math.min(.1, real); prevT = now;
  if (!editing) {
    // at high speed a busy circuit (a buzzer, say) can have more to do in one frame than the computer can manage: it
    // does what it can in a set time and carries on from there next frame, so the page never stalls
    const target = simT + dt * speed, ran = eventsRun;
    tickRealTimers(real);   // (timers counting real time go by the clock; one timing out now is acted on below)
    if (runEvents(target, performance.now() + 12)) simT = target;
    if (mode === 'click') for (const L in autoRel) if (!busyQueue() && simT > busyUntil + .5) { delete autoRel[L]; press(L, false); }
    // once the circuit has settled (nothing on its way, and the last coil, light and contact has finished changing)
    // nothing on the panel moves, so it is not painted again until something happens: an idle circuit costs nothing
    // (at high speed a whole chain of changes can start and finish within one frame: whatever happened is painted)
    if (needPaint || eventsRun !== ran || busyQueue() || simT <= busyUntil + 0.6) { paint(); needPaint = false; }
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
    if (isJmp(p)) {
      for (const q of v.src || []) { const c = colAt(q.n, simT) || 'transparent'; if (c !== q.c) q.ln.setAttribute('stroke', q.c = c); }
      const c = (p._c !== undefined && colAt(p._c, simT)) || '#8a8a8a'; if (c !== v.cc) { v.cc = c; for (const ch of v.chev) ch.setAttribute('stroke', c); }
      continue;
    }
    if (isSrc(p) || isPh(p)) { if (v.src) for (const q of v.src) { const c = colAt(q.n, simT) || 'transparent'; if (c !== q.c) q.ln.setAttribute('stroke', q.c = c); } continue; }
    for (const S of ['A', 'B']) paintLead(v.lead[S], p._lead && p._lead[S]);
    let k;
    if (p.t === 'btn') paintBtn(p, v, p.x, p.y);
    else if (p.t === 'con') {
      const s = CON[p.id]; if (!s) continue;
      const f = clamp01((simT - s.t0) / SWING), e = f * f * (3 - 2 * f);   // ease in and out
      const lift = (s.closing ? lerp(OPEN_LIFT, 0, e) : lerp(0, OPEN_LIFT, e)).toFixed(2);
      k = lift + (s.shut ? 's' : 'o');
      if (k === v.k) continue; v.k = k;
      v.blade.setAttribute('transform', `translate(0 ${-lift})`);
      v.bladeShape.setAttribute('fill', s.shut ? v.col : BLADE_GREY);
      if (v.arrow) { v.arrow.setAttribute('fill', s.shut ? v.col : BLADE_GREY); v.arrow.setAttribute('stroke', s.shut ? v.col : BLADE_GREY); }
      v.posts.setAttribute('fill', s.shut ? v.col : GREY);
    } else if (p.t === 'sel') paintSel(p, v);
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
    for (const [ln, c] of [[W.cur, P.a], [W.old, P.b]]) { ln.setAttribute('stroke', h > 0 ? c : 'transparent'); ln.setAttribute('stroke-dasharray', `${n} ${XFM_LEN + 2}`); }
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
  const dn = () => {
    if (p.maint) return press(p.L, !down[p.L]);
    if (mode === 'click') { if (down[p.L]) return; press(p.L, true); autoRel[p.L] = true; } else press(p.L, true);
  };
  const up = () => { if (mode === 'hold' && !p.maint) press(p.L, false); };
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
