/* ---------------- the current, junction by junction ----------------
   The wiring is a set of junctions joined by runs of wire and by parts. A run of wire can be travelled either way;
   each way is a "lane". Like reading a ladder diagram, a lane carries a button's colour when there is a path from
   L1, through that button (pressed or otherwise passing current), along the lane and on through a coil to L2.
   So a wire between two branches carries both branches' colours, each in its own direction, and an output fed
   both ways shows the mix. Ahead of a button that is not passing current, the wire waits in the colour that has
   reached it (plain egg from L1, or the colour of the buttons before), and wire that leads nowhere stays dark.
   Each junction passes on whatever is arriving from all the lanes feeding it: the colours of the buttons it came
   through, mixed where branches meet. A change (a button pressed or let go, a coil picking up or dropping out)
   sets off a new stream that travels along at speed V. So when one branch stops, the wire after the junction
   carries on with what the other branches are still sending, and only goes dark once the last of every stream
   feeding it has passed. */
let DIRS = [], OUTS = new Map(), INS = new Map(), REC = new Map(), PATHS = [], ALLOW = new Map(), REACH = new Map();
const recKey = r => !r ? '-' : r.ret ? `r${r.base}|${r.along.toFixed(1)}` : `${[...r.set].sort().join('')}|${r.from}|${isFinite(r.rd) ? r.rd.toFixed(1) : 'i'}`;
const along = (r, s) => !r ? null : r.ret ? { ret: true, base: r.base, along: r.along + s } : { set: r.set, from: r.from, rd: r.rd + s };
const colAtRec = r => !r ? null : r.ret ? mixOk(r.base, OFF_WHITE, clamp01(r.along / FADE)) : colourOf(r);
function mergeRecs(ins) {
  if (!ins.length) return null;
  const rs = ins.filter(r => r.ret);
  if (rs.length) return { ret: true, base: rs.length > 1 ? blend(rs.map(r => r.base)) : rs[0].base, along: Math.min(...rs.map(r => r.along)) };
  const set = new Set(); ins.forEach(r => r.set.forEach(x => set.add(x)));
  const same = ins.every(r => [...r.set].sort().join() === [...ins[0].set].sort().join() && r.from === ins[0].from);
  return { set, from: ins[0].from, rd: same ? Math.min(...ins.map(r => r.rd)) : Infinity };
}
const EGG = () => ({ set: new Set(), from: OFF_WHITE, rd: Infinity });
const isFeed1 = id => NET.feedV.get(id) === 1;
function addLane(e, from) {
  const d = { e, from, to: from === e.a ? e.b : e.a, delay: e.len / V, arrived: null, sent: null, sentKey: e.kind === 'part' && e.part.t === 'coil' ? '-|out' : '-' };   // (nothing sent yet: dark)
  if (e.kind === 'seg') {
    d.chain = from === e.a ? e.chain : [...e.chain].reverse(); d.li = from === e.a ? 0 : 1;
    // when the stream reaches each point along it (seconds after it enters)
    const T = from === e.a ? e.T : [...e.T].reverse();
    d.tk = T.map(x => Math.abs(x - T[0])); d.delay = d.tk[d.tk.length - 1];   // (for a stream with nothing ahead of it)
    d.dir = (from === e.a) === e.fwd ? 0 : 1; d.off = d.dir === 0 ? e.s0 : e.st.S - e.s0 - e.len;
  }
  DIRS.push(d);
  if (!OUTS.has(d.from)) OUTS.set(d.from, []); OUTS.get(d.from).push(d);
  if (!INS.has(d.to)) INS.set(d.to, []); INS.get(d.to).push(d);
}
function startRun() {
  NET = network();
  simT = 0; queue = []; seq = 0; busyUntil = 0; autoRel = {}; down = {}; coilOn = {};
  CON = {}; for (const p of parts) if (p.t === 'con') CON[p.id] = { t0: -1e9, closing: !!p.nc, shut: !!p.nc };   // every coil starts off
  tl = NET.nodes.map(() => [[-1e9, null]]);
  for (const p of parts) { delete p._chg; delete p._lead; }
  // which way each button and coil is passed through (as if every button were passing current)
  findButtonDirections();
  const h = solveV(true).V, dist = new Map(), q = [];
  for (const [id, v] of NET.feedV) if (v === 1) { dist.set(id, 0); q.push([0, id]); }
  while (q.length) { q.sort((a, b) => a[0] - b[0]); const [d, u] = q.shift(); if (d > dist.get(u)) continue;
    for (const e of NET.jadj.get(u) || []) { const w = e.a === u ? e.b : e.a, nd = d + e.len; if (!dist.has(w) || nd < dist.get(w)) { dist.set(w, nd); q.push([nd, w]); } } }
  DIRS = []; OUTS = new Map(); INS = new Map(); REC = new Map();
  stretchTimes();
  for (const e of NET.jedges) {
    if (e.kind === 'seg') { addLane(e, e.a); addLane(e, e.b); continue; }
    let from;
    if (isSw(e.part)) from = btnIn(e.part);
    else if (h.has(e.a) && h.has(e.b) && Math.abs(h.get(e.a) - h.get(e.b)) > 1e-9) from = h.get(e.a) > h.get(e.b) ? e.a : e.b;
    else from = (dist.get(e.a) ?? 1e9) <= (dist.get(e.b) ?? 1e9) ? e.a : e.b;
    addLane(e, from);
  }
  ltl = new Map();
  for (const e of NET.jedges) if (e.kind === 'seg') for (const n of e.chain.slice(1, -1)) ltl.set(n, [[[-1e9, null]], [[-1e9, null]]]);
  INLEAD = new Map();
  for (const d of DIRS) if (d.e.kind === 'part') { const p = d.e.part; if (!INLEAD.has(d.from)) INLEAD.set(d.from, []); INLEAD.get(d.from).push([p, d.from === p._a ? 'A' : 'B']); }
  findPaths(); findReach();
  checkShort();
  ALLOW = allowNow();
  for (const [id, v] of NET.feedV) if (v === 1) setRec(id, shortNow ? null : EGG(), 0);
  updateCoils(0);
}
/* Long plain stretches of wire (no junctions or parts along them, only corners) carry the current faster in the
   middle, so it does not keep everyone waiting: it leaves a junction at normal speed, speeds up to V_MAX times
   normal, and slows back down before it reaches the next junction, part or bar. Each run of wire gets, for every
   point along it, the time the stream takes to get there along its stretch. */
/* One plain stretch of length S. The speed rises and falls smoothly (no sudden changes): normal for V_LEAD units
   from either end, then easing up to V_MAX times normal over V_RAMP units. Tf(s): time to travel s units from the
   start (past the far end it carries on at normal speed); Ti: the reverse. Streams on a stretch travel together like
   cars of a train: one that follows another keeps the same spacing behind it (see send), so streams that set off a
   moment apart, such as the colours of several branches arriving one after another, stay together and never pull
   apart as the stretch speeds them up. lead/out (one for each way along it): when the train's first stream set off,
   and when its last one gets out the far end. */
function stretch(S) {
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const speed = s => V * (1 + (V_MAX - 1) * ease((Math.min(s, S - s) - V_LEAD) / V_RAMP));
  const n = Math.ceil(S), T = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) T[i] = T[i - 1] + 1 / speed(i - 0.5);
  const Tf = s => { if (s <= 0) return s / V; if (s >= n) return T[n] + (s - n) / V; const i = Math.floor(s); return T[i] + (T[i + 1] - T[i]) * (s - i); };
  const Ti = t => { if (t <= 0) return t * V; if (t >= T[n]) return n + (t - T[n]) * V; let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } return lo + (t - T[lo]) / (T[hi] - T[lo]); };
  return { S, Tf, Ti, lead: [-Infinity, -Infinity], out: [-Infinity, -Infinity] };
}
// how long the current takes along one small step of wire, or through a part (used by the checks)
let STEP_T = new Map();
const stepTime = e => e.kind === 'part' ? e.w / V : STEP_T.get(Math.min(e.a, e.b) + ',' + Math.max(e.a, e.b)) ?? (e.w || 0) / V;
function stretchTimes() {
  STEP_T = new Map();
  const J = NET.jadj, plain = v => !NET.feedV.has(v) && (J.get(v) || []).length === 2 && J.get(v).every(e => e.kind === 'seg');
  const done = new Set();
  for (const e0 of NET.jedges) {
    if (e0.kind !== 'seg' || done.has(e0)) continue;
    // walk back to one end of the stretch, then along it to the other
    let e = e0, at = e0.a;
    for (let g = 0; g < 10000 && plain(at); g++) { const n = J.get(at).find(x => x !== e); if (n === e0) break; at = n.a === at ? n.b : n.a; e = n; }
    const runs = []; let from = at === e.a ? e.a : e.b, cur = e;
    for (let g = 0; g < 10000 && cur && !done.has(cur); g++) {
      done.add(cur); runs.push([cur, from]); const to = cur.a === from ? cur.b : cur.a;
      if (!plain(to)) break; cur = J.get(to).find(x => x !== cur); from = to;
    }
    const st = stretch(runs.reduce((t, [r]) => t + r.len, 0)), Tof = st.Tf;
    let s0 = 0;
    for (const [r, f] of runs) {
      const m = r.chain.length - 1, fwd = f === r.a;
      r.st = st; r.s0 = s0; r.fwd = fwd;
      r.T = r.chain.map((_, k) => Tof(s0 + r.len * (fwd ? k : m - k) / m));
      for (let k = 1; k <= m; k++) STEP_T.set(Math.min(r.chain[k - 1], r.chain[k]) + ',' + Math.max(r.chain[k - 1], r.chain[k]), Math.abs(r.T[k] - r.T[k - 1]));
      s0 += r.len;
    }
  }
}
/* every way from L1 to L2 that goes through at least one coil and never visits a junction twice (buttons only the
   way they pass current, coils from their L1 side). Worked out once per run; a ladder of rungs has only a few dozen. */
function findPaths() {
  PATHS = [];
  const isL1 = id => NET.feedV.get(id) === 1, isL2 = id => NET.feedV.get(id) === 0;
  // junctions from which L2 can be reached at all (so dead ends are never explored)
  const toL2 = new Set([...NET.feedV].filter(([, v]) => v === 0).map(([id]) => id)), st = [...toL2];
  while (st.length) { const v = st.pop(); for (const d of INS.get(v) || []) if (!toL2.has(d.from)) { toL2.add(d.from); st.push(d.from); } }
  let budget = 400000;
  const seen = new Set(), path = [];
  const dfs = (v, coil) => {
    if (--budget < 0) return;
    if (isL2(v)) { if (coil) PATHS.push([...path]); return; }
    for (const d of OUTS.get(v) || []) {
      const w = d.to;
      if (seen.has(w) || !toL2.has(w) || isL1(w)) continue;
      seen.add(w); path.push(d);
      dfs(w, coil || (d.e.kind === 'part' && d.e.part.t === 'coil'));
      path.pop(); seen.delete(w);
    }
  };
  for (const [id, v] of NET.feedV) if (v === 1) { seen.add(id); dfs(id, false); seen.delete(id); }
}
// which colours each lane may carry right now: along every path, from L1 up to the first button not passing current,
// each lane carries the colour of the last button before it ('' for plain egg, 'ret' after a coil)
// how far it is from L1 to the far end of each lane along any path carrying each colour: the end of a colour's
// stream can still be on its way for as long as it takes to travel that far (a button keeps sending its colour
// until the change upstream of it has reached it)
function findReach() {
  REACH = new Map();
  for (const path of PATHS) {
    let label = '', s = 0;
    for (const d of path) {
      s += d.e.len;
      if (d.e.kind === 'part' && d.e.part.t !== 'con') { if (d.e.part.t === 'btn') label = d.e.part.L; else if (d.e.part.t === 'coil') label = 'ret'; continue; }
      const m = REACH.get(d) || {}; m[label] = Math.max(m[label] || 0, s); REACH.set(d, m);
    }
  }
}
const filtered = d => d.e.kind === 'seg' || d.e.part.t === 'con';   // lanes that only carry the colours with a path along them
function allowNow() {
  const A = new Map();
  for (const path of PATHS) {
    let label = '';
    for (const d of path) {
      if (d.e.kind === 'part') {
        if (isSw(d.e.part)) { if (!closed(d.e.part)) break; if (d.e.part.t === 'btn') label = d.e.part.L; else { if (!A.has(d)) A.set(d, new Set()); A.get(d).add(label); } }   // a contact passes on the colour it is given
        else if (coilOn[d.e.part.id]) label = 'ret';   // past a coil that is in: the return side, back to L2
        // (a coil that cannot pick up, because something past it is open, carries no current: the wire past it is as
        // live as the wire before it, so the colour waiting at the coil carries on up to whatever is open)
        continue;
      }
      if (!A.has(d)) A.set(d, new Set()); A.get(d).add(label);
    }
  }
  return A;
}
// what of a stream a lane lets through: only the colours that have a path along it
function filt(d, r, t) {
  if (!r || !filtered(d)) return r;
  // a colour the lane can no longer carry is still let through for as long as some of it could still be on its way
  // (the end of its stream, or pulses following one another), so it runs out along the wire behind the last of it
  // rather than being cut off where it is
  const A0 = ALLOW.get(d), late = d.drain ? Object.keys(d.drain).filter(x => d.drain[x] > t + 1e-9) : [];
  const A = late.length ? new Set([...(A0 || []), ...late]) : A0;
  if (!A) return null;
  if (r.ret) return A.has('ret') ? r : null;
  if (!r.set.size) return A.has('') ? r : null;
  const s = [...r.set].filter(x => A.has(x));
  return !s.length ? null : s.length === r.set.size ? r : { set: new Set(s), from: r.from, rd: r.rd };
}
const active = d => d.e.kind === 'seg' ? ALLOW.has(d) : isSw(d.e.part) ? closed(d.e.part) || !!d.draining : true;   // (a coil always passes something on, or nothing: see through)
// what a run hands on at its far end, given what entered it
function through(d, r) {
  if (!r) return null;
  if (d.e.kind === 'seg') return along(r, d.e.len);
  if (d.e.part.t === 'btn') return { set: new Set([d.e.part.L]), from: colourOf(r), rd: 0 };
  if (d.e.part.t === 'con') return along(r, d.e.len);   // a relay contact passes the current on as it is
  // through a coil that is in: the return side, fading to egg. Through a coil that cannot pick up: the colour
  // waiting at it, on up to whatever is open past it
  if (r.ret) return null;
  return coilOn[d.e.part.id] ? { ret: true, base: colourOf(r), along: 0 } : along(r, d.e.len);
}
// send a stream into run d starting now: the points along it change one after another as it travels
function send(d, r, t, atOnce) {
  r = filt(d, r, t);
  if (d.draining && !(r && r.ret)) { d.draining = false; if (!closed(d.e.part)) r = null; }   // the end of the return current has gone through; the switch is open
  const key = recKey(r) + (d.e.kind === 'part' && d.e.part.t === 'coil' ? (coilOn[d.e.part.id] ? '|in' : '|out') : '');
  if (d.sent !== undefined && d.sentKey === key) return;
  d.sent = r; d.sentKey = key;
  const out = through(d, r);
  if (d.e.kind !== 'seg') {
    // the part's leads: the current flows in from the end it enters at, and out along the far lead just in time to
    // reach the far end when it arrives there
    const p = d.e.part, outS = d.from === p._a ? 'B' : 'A', Ls = TERM(p) - (p.t === 'coil' ? COIL : BOX) / 2;
    const tOut = t + (atOnce ? 0 : d.delay);
    leadEvent(p, outS, tOut - Ls / V, out, 'body');
    schedule(tOut, () => { d.arrived = out; reeval(d.to, evT); });
    return;
  }
  const m = d.chain.length - 1;
  if (V_MAX === 1) {   // one steady speed everywhere (the speed-up is switched off)
    for (let k = 1; k < m; k++) { const s = d.e.len * k / m; setAt(d.chain[k], t + s / V, colAtRec(along(r, s)), d.li); }
    schedule(t + d.e.len / V, () => { d.arrived = out; reeval(d.to, evT); });
    return;
  }
  // where this stream sits in its stretch's train: a set distance (dd) behind the train's first stream
  const st = d.e.st, w = d.dir;
  if (!(t < st.out[w])) st.lead[w] = t - st.Tf(d.off);                 // nothing still on the stretch: it leads a new train
  const tl = st.lead[w], dd = Math.max(0, st.Ti(t - tl) - d.off), at = s => tl + st.Tf(d.off + s + dd);
  for (let k = 1; k < m; k++) { const s = d.e.len * k / m; setAt(d.chain[k], Math.max(t, at(s)), colAtRec(along(r, s)), d.li); }
  const tEnd = Math.max(t, at(d.e.len));
  st.out[w] = Math.max(st.out[w], tl + st.Tf(st.S + dd));
  schedule(tEnd, () => { d.arrived = out; reeval(d.to, evT); });
}
// a lead's latest changes (what it shows, from when, flowing from the part's end or from its body)
function leadEvent(p, S, t0, rec, from) { const L = (p._lead || (p._lead = { A: [], B: [] }))[S]; L.push({ t0, col: colAtRec(rec), from }); if (L.length > 6) L.shift(); }
let INLEAD = new Map();   // junction -> the part leads current flows in along from there
function setRec(v, r, t) {
  if (recKey(REC.get(v)) === recKey(r)) return;
  REC.set(v, r);
  for (const [p, S] of INLEAD.get(v) || []) leadEvent(p, S, t, r, 'term');   // what reaches a part flows in along its lead
  setAt(v, t, colAtRec(r));
  for (const d of OUTS.get(v) || []) if (d.e.kind === 'seg' || active(d)) send(d, r, t);
  if (coilIns.has(v)) updateCoils(t);
}
function reeval(v, t) {
  if (isFeed1(v)) return;
  setRec(v, mergeRecs((INS.get(v) || []).filter(d => d.arrived).map(d => d.arrived)), t);
}
// a coil picks up when current reaches it and it has a way through to L2; it drops out when its current is gone
let coilIns = new Set();
function updateCoils(t) {
  const f = components(NET, conducts), c2 = f(NET.L2);
  coilIns = new Set(); let changed = false;
  for (const p of parts) if (p.t === 'coil') {
    const d = DIRS.find(x => x.e.part === p); if (!d) continue;
    coilIns.add(d.from);
    const r = REC.get(d.from), want = !shortNow && !!r && !r.ret && f(d.to) === c2;
    let atOnce = false; const wasOn = !!coilOn[p.id];
    if (want !== wasOn) {
      coilOn[p.id] = want; p._chg = t;
      for (const c of parts) if (c.t === 'con' && c.L === p.L) schedule(t + CT, () => moveContact(c, evT));   // its contacts follow
      // current already at the coil, and its way back to L2 opening or closing: the coil drops out or picks up there
      // and then, so the change starts at its far end at once (rather than travelling through it like new current)
      atOnce = !!r && !r.ret && p._inKey === recKey(r);
    }
    p._inKey = recKey(r || null);
    if (want !== wasOn) changed = true;
    send(d, r || null, t, atOnce);   // keep what goes through it up to date
  }
  if (changed) refreshAllow(t);   // a coil picking up or dropping out changes what the wire past it may carry
}
function checkShort() { const f = components(NET, conducts); shortNow = f(NET.L1) === f(NET.L2); }
const allowKey = A => A ? [...A].sort().join() : '';
function press(L, v) {
  if (!!down[L] === v) return;
  down[L] = v;
  switched(parts.filter(p => p.t === 'btn' && p.L === L), simT);
}
// a relay contact's bar starts to move: it stops passing current as soon as it lifts, and passes current again
// only once it has landed
function moveContact(c, t) {
  const want = coilOnL(c.L) !== !!c.nc, s = CON[c.id];
  if (!s || s.closing === want) return;
  CON[c.id] = { t0: t, closing: want, shut: s.shut };
  if (t + SWING > busyUntil) busyUntil = t + SWING;
  if (want) schedule(t + SWING, () => { const k = CON[c.id]; if (k.closing && !k.shut) { k.shut = true; switched([c], evT); } });
  else if (s.shut) { CON[c.id].shut = false; switched([c], t); }
}
// some pushbuttons or contacts have just opened or closed
function switched(sw, t) {
  const was = shortNow;
  checkShort();
  if (was !== shortNow) for (const [id, fv] of NET.feedV) if (fv === 1) setRec(id, shortNow ? null : EGG(), t);
  for (const d of DIRS) if (d.e.kind === 'part' && sw.includes(d.e.part)) {
    const r = REC.get(d.from) || null;
    // a switch on the return side (past a coil) that opens stops the coil, and the return current already past the
    // coil runs out through it to L2 behind its own end, rather than being cut where the switch is
    d.draining = !closed(d.e.part) && !!r && !!r.ret;
    if (!d.draining) send(d, closed(d.e.part) ? r : null, t);
  }
  // coils first: a contact closing behind a coil lets the coil pick up, and then only its return current (not the
  // colour that was waiting in front of the contact) goes on past the contact
  updateCoils(t);
  refreshAllow(t);
}
/* which colours each lane may carry, worked out again after a change. Lanes that can now carry a colour they could
   not before pick up what their junction already has. (A lane that loses a colour keeps carrying it until that
   colour's own stream runs out, so it fades along the wire, from where it stopped, rather than vanishing.) */
function refreshAllow(t) {
  const old = ALLOW; ALLOW = allowNow();
  for (const d of DIRS) if (filtered(d)) {
    const a = old.get(d), b = ALLOW.get(d);
    if (a) for (const x of a) if (!b || !b.has(x)) (d.drain || (d.drain = {}))[x] = t + ((REACH.get(d) || {})[x] || 0) / V + 0.3;
    if (b && [...b].some(x => !a || !a.has(x))) send(d, REC.get(d.from) || null, t);
  }
}
