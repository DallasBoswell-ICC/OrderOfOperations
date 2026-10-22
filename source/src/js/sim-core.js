/* =====================================================================
   simulation
   Every point on the wiring keeps a short timeline of the colour it shows (or dark) and when. A change starts
   where it happened (a button pressed, a coil picking up) and reaches each point after the current has had time
   to travel there, so nothing ever appears or disappears all at once.
   ===================================================================== */
let NET = null, simT = 0, speed = 1, mode = 'click', queue = [], seq = 0, evT = 0, busyUntil = 0;
let tl = [], coilOn = {}, down = {}, autoRel = {}, shortNow = false;
const btnColour = L => (parts.find(p => p.t === 'btn' && p.L === L) || {}).color || '#888888';
function schedule(t, fn) { queue.push({ t, s: seq++, fn }); if (t > busyUntil) busyUntil = t; }
// run what is due up to upTo; true once it has all been run. With a deadline (a time from performance.now()) it stops
// when the deadline passes, leaving the rest for the next frame (the clock then follows the events it has reached)
function runEvents(upTo, deadline) {
  for (let guard = 0; guard < 5000 && queue.length; guard++) {
    let bi = 0; for (let i = 1; i < queue.length; i++) { const a = queue[i], b = queue[bi]; if (a.t < b.t - 1e-9 || (Math.abs(a.t - b.t) <= 1e-9 && a.s < b.s)) bi = i; }
    if (queue[bi].t > upTo) return true;
    if (deadline && (guard & 15) === 15 && performance.now() > deadline) return false;
    const ev = queue.splice(bi, 1)[0]; evT = ev.t;
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
const coilOnL = L => parts.some(q => q.t === 'coil' && q.L === L && coilOn[q.id]);
const coilColour = L => (parts.find(q => q.t === 'coil' && q.L === L) || {}).color || '#9a9a9a';
