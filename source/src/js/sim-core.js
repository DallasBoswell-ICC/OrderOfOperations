/* =====================================================================
   simulation
   Every point on the wiring keeps a short timeline of the colour it shows (or dark) and when. A change starts
   where it happened (a button pressed, a coil picking up) and reaches each point after the current has had time
   to travel there, so nothing ever appears or disappears all at once.
   ===================================================================== */
let NET = null, simT = 0, speed = 1, mode = 'click', queue = [], seq = 0, evT = 0, busyUntil = 0;
let tl = [], coilOn = {}, down = {}, autoRel = {}, shortNow = false;
// paint again even though the circuit has settled (something was pressed, or the panel was drawn afresh)
let needPaint = true;
const btnColour = L => (parts.find(p => p.t === 'btn' && p.L === L) || {}).color || '#888888';
function schedule(t, fn) { queue.push({ t, s: seq++, fn }); if (t > busyUntil) busyUntil = t; }
// an event that is only waited for (a timer timing out): nothing moves until it comes, so it does not keep the panel
// being painted, or a clicked button held down, in the meantime
function scheduleIdle(t, fn) { queue.push({ t, s: seq++, fn, idle: true }); }
const busyQueue = () => queue.some(e => !e.idle);
// run what is due up to upTo; true once it has all been run. With a deadline (a time from performance.now()) it stops
// when the deadline passes, leaving the rest for the next frame (the clock then follows the events it has reached)
let eventsRun = 0;   // (how many events have been run: anything run in a frame means the panel is painted)
function runEvents(upTo, deadline) {
  for (let guard = 0; guard < 5000 && queue.length; guard++) {
    let bi = 0; for (let i = 1; i < queue.length; i++) { const a = queue[i], b = queue[bi]; if (a.t < b.t - 1e-9 || (Math.abs(a.t - b.t) <= 1e-9 && a.s < b.s)) bi = i; }
    if (queue[bi].t > upTo) return true;
    if (deadline && (guard & 15) === 15 && performance.now() > deadline) return false;
    const ev = queue.splice(bi, 1)[0]; evT = ev.t; eventsRun++;
    if (deadline && ev.t > simT) simT = ev.t;
    ev.fn();
  }
  return !queue.length || !deadline;
}
const conducts = e => e.kind === 'w' || (isSw(e.part) && closed(e.part));
// a point partway along a wire keeps one timeline for each way along it (a wire between two branches can carry
// one button's colour one way and another's the other way); it shows the mix of what both carry
let ltl = new Map();
function tlCol(a, t) { for (let i = a.length - 1; i >= 0; i--) if (a[i][0] <= t + 1e-9) return a[i][1]; return null; }
const mixCache = new Map();
function colAt(n, t) {
  const L = ltl.get(n); if (!L) return tlCol(tl[n], t);
  const a = tlCol(L[0], t), b = tlCol(L[1], t);
  if (!a || !b || a === b) return a || b;
  const k = a + b; if (!mixCache.has(k)) { if (mixCache.size > 5000) mixCache.clear(); mixCache.set(k, blend([a, b])); }
  return mixCache.get(k);
}
const lit = (n, t) => colAt(n, t) !== null;
function setAt(n, t, c, lane) {
  const a = lane === undefined ? tl[n] : ltl.get(n)[lane];
  while (a.length > 1 && a[a.length - 1][0] >= t - 1e-9) a.pop();
  if (a.length === 1 && a[0][0] >= t - 1e-9) a[0] = [t, c]; else a.push([t, c]);
  let k = 0; for (let i = 0; i < a.length; i++) if (a[i][0] <= simT) k = i;
  if (k > 0) a.splice(0, k);
  if (t > busyUntil) busyUntil = t;
}
// the colour of a stream of current: plain egg from L1, a button's colour after it (shading in over a short
// distance from whatever colour came into the button), or the mix of several buttons' colours where branches met
const setCol = set => set.size === 0 ? OFF_WHITE : set.size === 1 ? flowOf(btnColour([...set][0])) : blend([...set].map(L => flowOf(btnColour(L))));
const colourOf = r => r.rd < RAMP ? mixOk(r.from, setCol(r.set), r.rd / RAMP) : setCol(r.set);
// a pushbutton passes current while pressed (NO) or until pressed (NC); a relay contact once its bar has landed on its posts
const closed = p => p.t === 'con' ? !!(CON[p.id] ? CON[p.id].shut : p.nc) : p.nc ? !down[p.L] : !!down[p.L];
// relay contacts: { closing: moving toward closed, t0: when it started moving, shut: passing current }
let CON = {};
/* On-delay timers. A timer is a relay coil with a delay (p.delay, whole seconds): it is energized as a coil is, but
   its contacts only change once it has been energized for the whole delay (it has timed out); when it loses power it
   resets at once and its contacts go back.
   A timer counts either at the simulation's speed (sped up and slowed down with everything else), or in real time
   (timersReal): it counts the computer's own clock, so 10 s on it is 10 s on the wall whatever the speed, even if a
   slow computer cannot keep the simulation up to that speed. TIMER[id]: { out: timed out, onOut: what happens when it
   times out, and either real: true with counted (real seconds so far), or base, t0 (seconds counted by sim time t0) }.
   Switching between the two carries a running timer on from what it has counted. */
let TIMER = {}, timersReal = false;
const timerCounted = st => st.real ? st.counted : st.base + (simT - st.t0);
// schedule a timer counting simulation time to time out (dropping one scheduled before)
function armTimer(p, st) {
  queue = queue.filter(e => e.tid !== p.id);
  if (st.real) return;
  queue.push({ t: st.t0 + Math.max(0, p.delay - st.base), s: seq++, idle: true, tid: p.id,
    fn: () => { if (TIMER[p.id] === st && coilOn[p.id] && !st.out) timeOut(st, evT); } });
}
function timeOut(st, at) { st.out = true; needPaint = true; st.onOut(at); }
const running = p => { const st = TIMER[p.id]; return isTimer(p) && st && !st.out && coilOn[p.id] ? st : null; };
// timers counting real time: called every frame with the real seconds since the last one
function tickRealTimers(dt) {
  for (const p of parts) { const st = running(p); if (!st || !st.real) continue;
    st.counted += dt; if (st.counted >= p.delay - 1e-9) timeOut(st, simT); }
}
// switch how timers count; running ones carry on from what they have counted
function retimeTimers() {
  for (const p of parts) { const st = running(p); if (!st || st.real === timersReal) continue;
    const c = timerCounted(st); st.real = timersReal;
    if (st.real) st.counted = c; else { st.base = c; st.t0 = simT; }
    armTimer(p, st); }
}
const isTimer = p => p.t === 'coil' && p.delay > 0;
// the contacts worked by letter L are actuated: its coil is in (and, for a timer, has timed out)
const coilOnL = L => parts.some(q => q.t === 'coil' && q.L === L && coilOn[q.id] && (!isTimer(q) || (TIMER[q.id] && TIMER[q.id].out)));
/* A timer's contacts are timed (they change once it times out) or instantaneous (c.inst: they change as soon as it
   is energized, like an ordinary relay's). Is contact c's coil holding it changed over right now? */
const isTimed = c => c.t === 'con' && !c.inst && parts.some(q => isTimer(q) && q.L === c.L);
const conActuated = c => parts.some(q => q.t === 'coil' && q.L === c.L && coilOn[q.id] && (!isTimer(q) || c.inst || (TIMER[q.id] && TIMER[q.id].out)));
// the time a timer shows: what it is set to while off, the whole seconds left (rounded up) while it times, 0 once out
const timerLeft = p => { const s = TIMER[p.id]; if (!coilOn[p.id] || !s) return p.delay; if (s.out) return 0; return Math.max(0, Math.ceil(p.delay - timerCounted(s) - 1e-9)); };
const anyTiming = () => parts.some(p => isTimer(p) && coilOn[p.id] && TIMER[p.id] && !TIMER[p.id].out);
const coilColour = L => (parts.find(q => q.t === 'coil' && q.L === L) || {}).color || '#9a9a9a';
