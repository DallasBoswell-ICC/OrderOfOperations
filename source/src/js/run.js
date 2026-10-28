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
  paintStation();
  const fl = document.getElementById('fault');
  if (fl.hidden !== !shortNow) {
    fl.hidden = !shortNow;
    fl.textContent = 'Short circuit! L1 is connected straight to L2 with no coil in between. In a real panel the fuse or breaker would open. Release the button or change the wiring to clear it.';
  }
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
    else if (p.t === 'lamp') {
      const lit = litOf(p); k = lit.toFixed(3);
      if (k === v.k) continue; v.k = k;
      v.fill.setAttribute('fill', mixRgb(GREY, v.col, lit));
      v.glow.setAttribute('opacity', (lit * .55).toFixed(3));
      v.rays.setAttribute('stroke', mixRgb('#5a5a5a', v.col, lit));
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
