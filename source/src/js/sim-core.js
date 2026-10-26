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
/* Timers. A timer is a relay coil with a delay (p.delay, whole seconds), on-delay or off-delay (p.tof).
   On-delay: energized, it times; once it has been energized for the whole delay its timed contacts change. Losing
   power resets it at once and they go back.
   Off-delay: energized, its timed contacts change at once. Losing power, it times, and they go back only once the whole
   delay has run out; energized again before then, it stops timing and they stay changed.
   Either way its instantaneous contacts (c.inst) follow it at once, like an ordinary relay's.
   A timer counts either at the simulation's speed (sped up and slowed down with everything else), or in real time
   (timersReal): it counts the computer's own clock, so 10 s on it is 10 s on the wall whatever the speed, even if a
   slow computer cannot keep the simulation up to that speed. TIMER[id]: { act: its timed contacts are changed over,
   timing: it is counting, out: it has finished counting, onOut: what happens then, and either real: true with counted
   (real seconds so far), or base, t0 (seconds counted by sim time t0) }. Switching between the two carries a running
   timer on from what it has counted. */
let TIMER = {}, timersReal = false;
const timerCounted = st => st.real ? st.counted : st.base + (simT - st.t0);
// schedule a timer counting simulation time to finish (dropping one scheduled before)
function armTimer(p, st) {
  queue = queue.filter(e => e.tid !== p.id);
  if (st.real || !st.timing) return;
  queue.push({ t: st.t0 + Math.max(0, p.delay - st.base), s: seq++, idle: true, tid: p.id,
    fn: () => { if (TIMER[p.id] === st && st.timing) timeOut(st, evT); } });
}
function timeOut(st, at) { st.timing = false; st.out = true; needPaint = true; st.onOut(at); }
const running = p => { const st = TIMER[p.id]; return isTimer(p) && st && st.timing ? st : null; };
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
// the contacts worked by letter L are changed over (a timer's timed ones)
const coilOnL = L => parts.some(q => q.t === 'coil' && q.L === L && (isTimer(q) ? !!(TIMER[q.id] && TIMER[q.id].act) : !!coilOn[q.id]));
// a timer's contacts are timed, or instantaneous (c.inst); is contact c's coil holding it changed over right now?
const isTimed = c => c.t === 'con' && !c.inst && parts.some(q => isTimer(q) && q.L === c.L);
const conActuated = c => parts.some(q => q.t === 'coil' && q.L === c.L && (!isTimer(q) || c.inst ? !!coilOn[q.id] : !!(TIMER[q.id] && TIMER[q.id].act)));
// a timer's readout is lit while it is energized or counting
const timerLit = p => !!coilOn[p.id] || !!running(p);
// the time a timer shows: the whole seconds left (rounded up) while it counts; 0 once an on-delay timer has timed out
// (while it stays energized); otherwise what it is set to
const timerLeft = p => { const s = TIMER[p.id]; if (s && s.timing) return Math.max(0, Math.ceil(p.delay - timerCounted(s) - 1e-9)); if (s && !p.tof && s.act && coilOn[p.id]) return 0; return p.delay; };
const anyTiming = () => parts.some(p => !!running(p));
const coilColour = L => (parts.find(q => q.t === 'coil' && q.L === L) || {}).color || '#9a9a9a';
