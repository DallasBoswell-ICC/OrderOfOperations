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
  const d = { e, from, to: from === e.a ? e.b : e.a, delay: e.len / V, arrived: null, sent: null, sentKey: e.kind === 'part' && LOADT(e.part.t) ? '-|out' : '-' };   // (nothing sent yet: dark)
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
  simT = 0; queue = []; seq = 0; busyUntil = 0; autoRel = {}; down = {}; coilOn = {}; TIMER = {};
  FED_AT = {}; COMP = null; needPaint = true;
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
   middle. In a real panel a change reaches the far end of any wire almost at once, so the coil whose button was
   pressed first is in first however long its wire; here the current is slowed right down so it can be watched, so a
   long wire would otherwise keep its coil waiting for seconds and let a coil on a short wire, pressed later, get in
   first. So the current leaves a junction at normal speed, speeds up smoothly the longer the stretch, and slows back
   down before the next junction, part or bar. Stretches up to 400 units keep normal speed throughout; past that the
   time hardly grows (a 3000-unit stretch takes about 1.2 s, against 6 s at normal speed). Each run of wire gets, for every point along it, the time the stream takes to get there. */
/* One plain stretch of length S. The speed rises and falls smoothly (no sudden changes): normal for V_LEAD units
   from either end, then speeding up steadily to its top in the middle and back down. Tf(s): time to travel
   s units from the start (past the far end it carries on at normal speed); Ti: the reverse. Streams on a stretch
   travel together like cars of a train: one that follows close behind another (a colour arriving a moment after
   another, as the branches of a mix do) keeps the same spacing behind it (see send), so a mix never pulls apart as
   the stretch speeds up. lead/out (one for each way along it): when the train's first stream set off, and when its
   last one gets out the far end. */
function stretch(S) {
  const half = Math.max(0, S - 2 * V_LEAD) / 2;
  // how long it should take: as long as at normal speed up to V_SHORT, then only slowly longer, so a longer stretch
  // never gets there sooner than a shorter one, and a very long one hardly later
  const want = S <= V_SHORT ? S / V : V_SHORT / V + V_TAU * Math.log(1 + (S - V_SHORT) / (V * V_TAU));
  // past V_LEAD the speed grows steadily with the distance travelled (1× more every K units), which over time is a
  // steady, gentle acceleration (it doubles, then doubles again, each in the same short time), up to the middle,
  // then falls back the same way. K is chosen so the stretch takes the time wanted.
  const timeFor = K => 2 * V_LEAD / V + 2 * (K / V) * Math.log(1 + half / K);
  let K = Infinity;
  if (S > V_SHORT) { let lo = Math.max(1e-3, half / (V_TOP - 1)), hi = 1e7; for (let k = 0; k < 60; k++) { const m = Math.sqrt(lo * hi); if (timeFor(m) > want) hi = m; else lo = m; } K = lo; }
  const top = 1 + half / K;
  const rel = s => 1 + Math.max(0, Math.min(s, S - s) - V_LEAD) / K;   // speed at s, as a multiple of normal
  const n = Math.ceil(S), T = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) T[i] = T[i - 1] + 1 / (V * rel(i - 0.5));
  const Tf = s => { if (s <= 0) return s / V; if (s >= n) return T[n] + (s - n) / V; const i = Math.floor(s); return T[i] + (T[i + 1] - T[i]) * (s - i); };
  const Ti = t => { if (t <= 0) return t * V; if (t >= T[n]) return n + (t - T[n]) * V; let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } return lo + (t - T[lo]) / (T[hi] - T[lo]); };
  return { S, Tf, Ti, rel: s => s >= S ? 1 : rel(s), top, lead: [-Infinity, -Infinity], out: [-Infinity, -Infinity] };
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
      dfs(w, coil || (d.e.kind === 'part' && LOADT(d.e.part.t)));
      path.pop(); seen.delete(w);
    }
  };
  for (const [id, v] of NET.feedV) if (v === 1) { seen.add(id); dfs(id, false); seen.delete(id); }
}
// which colours each lane may carry right now: along every path, from L1 up to the first button not passing current,
// each lane carries the colour of the last button before it ('' for plain egg, 'ret' after a coil)
// how long the current takes from L1 to the far end of each lane along any path carrying each colour: the end of a
// colour's stream can still be on its way for that long (a button keeps sending its colour
// until the change upstream of it has reached it)
function findReach() {
  REACH = new Map();
  for (const path of PATHS) {
    let label = '', s = 0;   // (s: how long the current takes to get there, in seconds)
    for (const d of path) {
      s += d.e.kind === 'seg' ? d.delay : d.e.len / V;
      if (d.e.kind === 'part' && d.e.part.t !== 'con') { if (d.e.part.t === 'btn') label = d.e.part.L; else if (LOADT(d.e.part.t)) label = 'ret'; continue; }
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
  if (coilOn[d.e.part.id]) return { ret: true, base: colourOf(r), along: 0 };
  return fedNow(d.from) ? along(r, d.e.len) : null;   // (the end of a broken stream stops at the coil)
}
// send a stream into run d starting now: the points along it change one after another as it travels
function send(d, r, t, atOnce) {
  r = filt(d, r, t);
  if (d.draining && !(r && r.ret)) { d.draining = false; if (!closed(d.e.part)) r = null; }   // the end of the return current has gone through; the switch is open
  const key = recKey(r) + (d.e.kind === 'part' && LOADT(d.e.part.t) ? (coilOn[d.e.part.id] ? '|in' : '|out') : '');
  if (d.sent !== undefined && d.sentKey === key) return;
  d.sent = r; d.sentKey = key;
  const out = through(d, r);
  if (d.e.kind !== 'seg') {
    // the part's leads: the current flows in from the end it enters at, and out along the far lead just in time to
    // reach the far end when it arrives there
    const p = d.e.part, outS = d.from === p._a ? 'B' : 'A', Ls = TERM(p) - (LOADT(p.t) ? COIL : BOX) / 2;
    const tOut = t + (atOnce ? 0 : d.delay);
    leadEvent(p, outS, tOut - Ls / V, out, 'body');
    schedule(tOut, () => { d.arrived = out; reeval(d.to, evT); });
    return;
  }
  const m = d.chain.length - 1, st = d.e.st, w = d.dir;
  // where this stream sits in its stretch's train: a set distance (dd) behind the train's first stream. Carried on
  // from the run before when the stream has just come along the same stretch; otherwise it joins the train already
  // on the stretch only if it is close enough behind that the train is still at (nearly) normal speed where it is,
  // so it never lurches forward as it joins; any further behind and it leads a new train of its own
  let tl, dd;
  if (CARRY && CARRY.st === st && CARRY.w === w) ({ tl, dd } = CARRY);
  else {
    tl = st.lead[w];
    dd = t < st.out[w] ? st.Ti(t - tl) - d.off : Infinity;
    if (!(dd >= -1e-6 && d.off + dd < st.S / 2 && st.rel(d.off + dd) <= 1.15)) { tl = t - st.Tf(d.off); dd = 0; st.lead[w] = tl; }
    dd = Math.max(0, dd);
  }
  const at = s => tl + st.Tf(d.off + s + dd);
  for (let k = 1; k < m; k++) { const s = d.e.len * k / m; setAt(d.chain[k], Math.max(t, at(s)), colAtRec(along(r, s)), d.li); }
  const tEnd = Math.max(t, at(d.e.len));
  st.out[w] = Math.max(st.out[w], tl + st.Tf(st.S + dd));
  const carry = { st, w, tl, dd };
  schedule(tEnd, () => { d.arrived = out; const was = CARRY; CARRY = carry; try { reeval(d.to, evT); } finally { CARRY = was; } });
}
let CARRY = null;   // the train a stream arriving at a corner belongs to, while it is passed on along the stretch
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
// what is joined to what right now, through wires and closed switches (worked out again whenever a switch moves)
let COMP = null;
const compNow = () => COMP || (COMP = components(NET, conducts));
// is junction v joined to L1 right now (so what has reached it is still fed, not the end of a broken stream)?
const fedNow = v => { const f = compNow(); return f(v) === f(NET.L1); };
/* Which coil was first: when the path from L1 through a coil to L2 is completed (a button pressed), the time is noted.
   In a real panel current is there at once, so the coil whose path was completed first is in first, and its contacts
   act first. Here current takes time to travel, so a coil whose current arrives sooner (a shorter wire) waits rather
   than pick up ahead of a coil that was first, if picking up would cut that coil off (an interlock). */
let FED_AT = {};
const fedBy = (f, c) => { const a = f(c._a), b = f(c._b), l1 = f(NET.L1), l2 = f(NET.L2); return (a === l1 && b === l2) || (a === l2 && b === l1); };
function wouldCutOff(x, f0) {
  // with x in (its contacts moved), would any coil that was first and whose current is on its way lose its path?
  // (a coil that was first counts until its own contacts have finished moving: its current still on its way, or just in)
  const settling = c => !coilOn[c.id] || simT < (c._chg ?? -1e9) + CT + SWING + 1e-6;
  const others = parts.filter(c => c.t === 'coil' && c !== x && settling(c) && FED_AT[c.id] !== undefined && FED_AT[c.id] < FED_AT[x.id] - 1e-9 && fedBy(f0, c));
  if (!others.length) return false;
  // (an on-delay timer's timed contacts stay as they are as it picks up; only its instantaneous ones change)
  const flips = c => c.t === 'con' && c.L === x.L && (!isTimer(x) || c.inst || x.tof);   // (an off-delay timer's timed contacts change at once too)
  if (isTimer(x) && !parts.some(flips)) return false;
  const alt = e => e.kind === 'w' || (isSw(e.part) && (flips(e.part) ? !e.part.nc : closed(e.part)));
  const f1 = components(NET, alt);
  return others.some(c => !fedBy(f1, c));
}
// a coil picks up when current reaches it and it has a way through to L2; it drops out when its current is gone
let coilIns = new Set();
function updateCoils(t) {
  const f = compNow(), c2 = f(NET.L2);
  coilIns = new Set(); let changed = false;
  for (const p of parts) if (LOADT(p.t)) { if (fedBy(f, p)) { if (FED_AT[p.id] === undefined) FED_AT[p.id] = t; } else delete FED_AT[p.id]; }
  for (const p of parts) if (LOADT(p.t)) {   // (a pilot light lights just as a coil picks up)
    const d = DIRS.find(x => x.e.part === p); if (!d) continue;
    coilIns.add(d.from);
    const r = REC.get(d.from);
    // a coil that is in stays in until the last of its current has reached it; it picks up only with current whose
    // path back to L1 is unbroken right now (never from the end of a stream that has been cut off), and not ahead of
    // a coil that was first and that it would cut off
    let want = !shortNow && !!r && !r.ret && f(d.to) === c2;
    if (want && !coilOn[p.id] && (f(d.from) !== f(NET.L1) || (p.t === 'coil' && wouldCutOff(p, f)))) want = false;
    let atOnce = false; const wasOn = !!coilOn[p.id];
    if (want !== wasOn) {
      coilOn[p.id] = want; p._chg = t;
      const moveAll = at => { for (const c of parts) if (c.t === 'con' && c.L === p.L) schedule(at + CT, () => moveContact(c, evT)); };
      if (isTimer(p)) {
        // its instantaneous contacts follow it at once; its timed ones as its type says (see sim-core). Every contact of
        // its letter is looked at whenever anything changes, and works out for itself whether it has anything to do
        const was = TIMER[p.id] || { act: false }, fresh = (timing, act) => ({ real: timersReal, counted: 0, base: 0, t0: t, out: false, timing, act });
        let st;
        if (!p.tof) st = want ? fresh(true, false) : fresh(false, false);   // on-delay: times while energized; resets when not
        else if (want) st = fresh(false, true);                              // off-delay: changes over at once
        else st = fresh(was.act, was.act);                                   // and times once power is lost
        st.onOut = at => { st.act = !p.tof; moveAll(at); };
        TIMER[p.id] = st; armTimer(p, st);
        moveAll(t);
      } else if (p.t === 'coil') for (const c of parts) if (c.t === 'con' && c.L === p.L) schedule(t + CT, () => moveContact(c, evT));   // its contacts follow
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
  down[L] = v; needPaint = true;
  switched(parts.filter(p => p.t === 'btn' && p.L === L), simT);
}
// a relay contact's bar starts to move: it stops passing current as soon as it lifts, and passes current again
// only once it has landed
function moveContact(c, t) {
  const want = conActuated(c) !== !!c.nc, s = CON[c.id];
  if (!s || s.closing === want) return;
  CON[c.id] = { t0: t, closing: want, shut: s.shut };
  if (t + SWING > busyUntil) busyUntil = t + SWING;
  if (want) schedule(t + SWING, () => { const k = CON[c.id]; if (k.closing && !k.shut) { k.shut = true; switched([c], evT); } });
  else if (s.shut) { CON[c.id].shut = false; switched([c], t); }
}
// some pushbuttons or contacts have just opened or closed
function switched(sw, t) {
  COMP = null;
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
    if (a) for (const x of a) if (!b || !b.has(x)) (d.drain || (d.drain = {}))[x] = t + ((REACH.get(d) || {})[x] || 0) + 0.3;
    if (b && [...b].some(x => !a || !a.has(x))) send(d, REC.get(d.from) || null, t);
  }
}
