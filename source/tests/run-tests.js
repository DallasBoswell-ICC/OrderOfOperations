/* Automatic checks for the Circuit Builder.

   Run after every change:   node tests/run-tests.js        (build first: python3 build.py)

   Each check opens the built page (dist/Circuit_Builder.html) in a headless browser and either drives the
   simulation directly, in fast time, or uses the mouse the way a student would. The page's own functions are
   all visible to the checks, so they can set up circuits and read back exactly what is lit and when.
   Needs Node.js and Playwright (npm install playwright, or set NODE_PATH to where it is installed). */
const path = require('path');
const { chromium } = require('playwright');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'dist', 'Circuit_Builder.html');
const results = [];
let browser;

async function openPage(width = 1300, height = 1000, context) {
  // each check gets its own browser profile, so nothing saved in one check carries into the next
  const ctx = context || await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(PAGE);
  await page.waitForTimeout(200);
  return page;
}
async function check(name, fn) {
  const t0 = Date.now();
  let page;
  try {
    page = await openPage();
    const problems = (await fn(page)) || [];
    if (page.errors.length) problems.push('page errors: ' + page.errors.join('; '));
    results.push({ name, ok: !problems.length, problems, ms: Date.now() - t0 });
  } catch (e) {
    results.push({ name, ok: false, problems: [String(e && e.stack || e)], ms: Date.now() - t0 });
  } finally { if (page) await page.context().close(); }
  const r = results[results.length - 1];
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${name}  (${(r.ms / 1000).toFixed(1)} s)`);
  if (!r.ok) for (const p of r.problems.slice(0, 8)) console.log('      - ' + p);
}

// helpers that run inside the page ------------------------------------------------------------------------
// a step function that advances the simulation in fast time (no waiting for the real clock)
// when a point last changed (a point partway along a wire has a timeline for each way along it)
const LAST = `const lastChange = i => Math.max(...(ltl.get(i) || [tl[i]]).map(a => a[a.length - 1][0]));`;
const STEP = LAST + `const step = dt => { const end = simT + dt; while (simT < end) { simT = Math.min(end, simT + 1 / 60); runEvents(simT); } };`;
// put the page into Run mode with a given ready-made circuit
async function runPreset(page, name) {
  await page.selectOption('#preset', name);
  await page.click('#tab-run');
}
// build a circuit from data inside the page
async function loadCircuit(page, fnBody) {
  await page.evaluate(new Function(fnBody + '; normalize(); draw();'));
}
// screen position of a point in panel units
const scr = (page, x, y) => page.evaluate(([x, y]) => { const m = svg.getScreenCTM(); return [m.a * x + m.e, m.d * y + m.f]; }, [x, y]);
async function mouseDrag(page, a, b, opts = {}) {
  const A = await scr(page, ...a), B = await scr(page, ...b);
  if (opts.shift) await page.keyboard.down('Shift');
  await page.mouse.move(...A); await page.mouse.down();
  await page.mouse.move((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, { steps: 4 }); await page.mouse.move(...B, { steps: 4 });
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up('Shift');
  await page.waitForTimeout(40);
}
async function toolbarDrop(page, kind, x, y) {
  // parts sit in their kind's menu: open it first
  if (!(await page.locator(`[data-part="${kind}"]`).isVisible())) await page.locator(`.pgroup:has([data-part="${kind}"]) .group`).click();
  const bx = await page.locator(`[data-part="${kind}"]`).boundingBox(), B = await scr(page, x, y);
  await page.mouse.move(bx.x + 10, bx.y + 10); await page.mouse.down();
  await page.mouse.move(bx.x + 40, bx.y + 60, { steps: 3 }); await page.mouse.move(...B, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(40);
}
const wiresNow = page => page.evaluate(() => wires.map(w => [w.x1, w.y1, w.x2, w.y2]));
const issuesNow = page => page.evaluate(() => [...wiringIssues(network()).entries()]);

// the user's three-rung circuit: X = (¬A·(B+C)) + (¬D·(F+G)) + (¬E·(H+I))
const THREE_RULE = `const d = L => !!down[L]; return (!d('A') && (d('B') || d('C'))) || (!d('D') && (d('F') || d('G'))) || (!d('E') && (d('H') || d('I')));`;
// the D/E/F circuit from the screen share: X = (¬A·(B+C)) + (¬D·(E+F))
const DEF_CIRCUIT = `
  const Bt = (L, x, y, nc, col) => P('btn', x, y, { L, nc: !!nc, maint: true, color: col });
  parts = [Bt('A', 140, 200, true, '#FF0032'), Bt('B', 360, 140, false, '#0070C0'), Bt('C', 360, 260, false, '#00B050'), C('X', 700, 200),
           Bt('D', 140, 460, true, '#FFDC00'), Bt('E', 360, 400, false, '#00D2BE'), Bt('F', 360, 500, false, '#7030A0')];
  wires = [Wr(0,200,100,200), Wr(180,200,240,200), Wr(240,140,240,260), Wr(240,140,320,140), Wr(240,260,320,260), Wr(400,140,480,140), Wr(400,260,480,260),
    Wr(480,140,480,260), Wr(480,200,640,200), Wr(760,200,880,200),
    Wr(0,460,100,460), Wr(180,460,240,460), Wr(240,400,240,500), Wr(240,400,320,400), Wr(240,500,320,500), Wr(400,400,480,400), Wr(400,500,480,500), Wr(480,260,480,500)];`;

(async () => {
  browser = await chromium.launch();

  await check('Every ready-made circuit is wired correctly', async page => {
    const out = [];
    for (const k of ['io', 'and', 'or', 'andor', 'three', 'seal', 'abc', 'traffic', 'stress']) {
      await page.selectOption('#preset', k);
      const iss = await issuesNow(page);
      if (iss.length) out.push(`${k}: ${JSON.stringify(iss)}`);
    }
    return out;
  });

  await check('Truth tables of the small ready-made circuits', async page => {
    const out = [];
    const cases = { io: [['', 0], ['A', 1]], and: [['', 0], ['A', 0], ['B', 0], ['AB', 1]], or: [['', 0], ['A', 1], ['B', 1], ['AB', 1]],
      andor: [['', 0], ['A', 0], ['B', 0], ['AB', 1], ['AC', 1], ['ABC', 1], ['BC', 0]] };
    for (const [k, rows] of Object.entries(cases)) {
      await runPreset(page, k);
      const r = await page.evaluate(new Function('rows', STEP + `
        const res = []; step(4);
        for (const [pressed, want] of rows) {
          for (const p of parts) if (p.t === 'btn') press(p.L, pressed.includes(p.L));
          step(8);
          const got = parts.filter(p => p.t === 'coil').every(p => !!coilOn[p.id]) ? 1 : 0;
          if (got !== want) res.push(pressed + ' gave ' + got);
        }
        return res;`), rows);
      r.forEach(x => out.push(`${k}: ${x}`));
      await page.click('#tab-edit');
    }
    return out;
  });

  await check('Three rungs into X: all 512 combinations, no backflow, no bleeding between rungs', async page => {
    await runPreset(page, 'three');
    return page.evaluate(new Function(STEP + `
      const out = [], Ls = 'ABCDEFGHI'.split('');
      const want = () => { ${THREE_RULE} };
      const X = parts.find(p => p.t === 'coil');
      const check = tag => {
        if (want() !== !!coilOn[X.id]) out.push(tag + ': X wrong');
        for (const [N, top, bot] of [['A','B','C'], ['D','F','G'], ['E','H','I']]) {
          const n = parts.find(p => p.L === N), t = parts.find(p => p.L === top), b = parts.find(p => p.L === bot);
          if (down[N] && (lit(n._b, simT) || lit(t._a, simT) || lit(b._a, simT))) out.push(tag + ': rung ' + N + ' lit while ' + N + ' is open');
          if (!down[N] && !(lit(t._a, simT) && lit(b._a, simT))) out.push(tag + ': rung ' + N + ' not lit up to its buttons');
          for (const p of [t, b]) if (!(!down[N] && closed(p)) && lit(p._b, simT)) out.push(tag + ': current backward at ' + p.L);
        }
        if (queue.length) out.push(tag + ': still busy');
      };
      step(4);
      for (let m = 0; m < 512; m++) { Ls.forEach((L, i) => press(L, !!(m >> i & 1))); step(7); check('combo ' + Ls.filter((L, i) => m >> i & 1).join('')); }
      let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let t = 0; t < 300; t++) { const L = Ls[Math.floor(rnd() * 9)]; press(L, !down[L]); step(rnd() < .5 ? rnd() * .5 : 0); if (t % 5 === 4) { step(8); check('random ' + t); } }
      return out.slice(0, 20);`));
  });

  await check('D/E/F circuit: all 64 combinations, and the far side of an open button never lights', async page => {
    await loadCircuit(page, DEF_CIRCUIT);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], Ls = 'ABCDEF'.split(''), X = parts.find(p => p.t === 'coil');
      step(4);
      for (let m = 0; m < 64; m++) {
        Ls.forEach((L, i) => press(L, !!(m >> i & 1))); step(8);
        const d = L => !!down[L], want = (!d('A') && (d('B') || d('C'))) || (!d('D') && (d('E') || d('F')));
        if (want !== !!coilOn[X.id]) out.push(m + ': X wrong');
        for (const p of parts) if (p.t === 'btn' && !closed(p)) {
          const outEnd = btnIn(p) === p._a ? p._b : p._a;
          if (lit(outEnd, simT)) out.push(m + ': far side of open ' + p.L + ' lit');
        }
      }
      return out.slice(0, 20);`));
  });

  await check('A button wired with power coming in on its right still works', async page => {
    await loadCircuit(page, `parts = [P('btn', 220, 200, { L: 'A', nc: false, maint: true, color: '#FF0032' }), C('X', 700, 200)];
      wires = [Wr(0, 120, 340, 120), Wr(340, 120, 340, 200), Wr(340, 200, 260, 200), Wr(180, 200, 60, 200), Wr(60, 200, 60, 320), Wr(60, 320, 480, 320), Wr(480, 320, 480, 200), Wr(480, 200, 640, 200), Wr(760, 200, 880, 200)];`);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], X = parts.find(p => p.t === 'coil'); step(4);
      press('A', true); step(8); if (!coilOn[X.id]) out.push('A pressed but X off');
      press('A', false); step(8); if (coilOn[X.id]) out.push('A released but X on');
      return out;`));
  });

  await check('Current flows the right way: L2 wires fill and drain toward the right edge', async page => {
    await loadCircuit(page, `const Bt = (L, x, y, col) => P('btn', x, y, { L, nc: false, maint: true, color: col });
      parts = [Bt('B', 300, 160, '#0070C0'), C('X', 700, 160), Bt('C', 300, 320, '#00B050'), C('Y', 700, 320)];
      wires = [Wr(0, 160, 260, 160), Wr(340, 160, 640, 160), Wr(760, 160, 880, 160), Wr(0, 320, 260, 320), Wr(340, 320, 640, 320), Wr(760, 320, 880, 320)];`);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = []; step(3);
      const times = y => NET.nodes.map((n, i) => [n, i]).filter(([n]) => n.y === y && n.x >= 760 && n.x <= 880).sort((a, b) => a[0].x - b[0].x).map(([, i]) => lastChange(i));
      press('C', true); step(4); press('B', true); step(4);
      for (const y of [160, 320]) { const t = times(y); if (!(t[0] < t[t.length - 1])) out.push('return wire at ' + y + ' filled the wrong way'); }
      press('B', false); step(5);
      { const t = times(160); if (!(t[0] < t[t.length - 1])) out.push('return wire drained the wrong way'); }
      return out;`));
  });

  await check("No gap when a branch switches off: the other branch's stream carries on to the coil", async page => {
    await runPreset(page, 'three');
    return page.evaluate(new Function(STEP + `
      const out = []; step(3); press('H', true); press('I', true); step(6);
      press('E', true); step(10);
      const at = (x, y) => { const i = NET.nodes.findIndex(n => n.x === x && n.y === y); return lastChange(i); };
      const iRight = at(380, 640), corner = at(480, 640), mid = at(480, 590), hJunction = at(480, 540), top = at(480, 140);
      if (!(iRight < corner && corner < mid && mid < hJunction && hJunction < top)) out.push('switch-off order wrong: ' + [iRight, corner, mid, hJunction, top].map(t => t.toFixed(2)).join(' '));
      return out;`));
  });

  // the circuit from the "outputs not energizing" video: AND + OR, with Y teed off between C and where B and C meet
  const TEE_CIRCUIT = `[parts, wires] = PRESETS.andor(); parts.push(C('Y', 700, 320)); wires.push(Wr(460, 260, 460, 320), Wr(460, 320, 640, 320), Wr(760, 320, W, 320));`;
  await check('Y teed off between two branches: energizes from either branch, never flickers', async page => {
    await loadCircuit(page, TEE_CIRCUIT);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], coils = parts.filter(p => p.t === 'coil'), step1 = () => { simT += 1 / 60; runEvents(simT); };
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      step(3);
      for (const s of ['AB', 'AC', 'ABC', 'A', 'AB', 'ABC', 'AC', 'A']) {
        for (const p of parts) if (p.t === 'btn') press(p.L, s.includes(p.L));
        step(6);
        for (const c of coils) if (!coilOn[c.id]) { if (s !== 'A') out.push(s + ': ' + c.L + ' off'); } else if (s === 'A') out.push('A: ' + c.L + ' on');
      }
      let lastSettled = true;
      for (let n = 0; n < 200; n++) {
        const L = 'ABC'[Math.floor(rnd() * 3)], quick = rnd() < 0.3;
        press(L, !down[L]);
        const want = !!down.A && (!!down.B || !!down.C), flips = {}, prev = coils.map(c => !!coilOn[c.id]);
        for (let i = 0; i < (quick ? 10 : 180); i++) { step1(); coils.forEach((c, j) => { if (!!coilOn[c.id] !== prev[j]) { flips[c.L] = (flips[c.L] || 0) + 1; prev[j] = !prev[j]; } }); }
        if (!quick && lastSettled) for (const c of coils) {
          if (!!coilOn[c.id] !== want) out.push('after ' + L + ': ' + c.L + ' in the wrong state');
          if ((flips[c.L] || 0) > 1) out.push('after ' + L + ': ' + c.L + ' flickered');
        }
        lastSettled = !quick;
      }
      return out.slice(0, 10);`));
  });

  // the circuit from the "flicker" and "flow jumps" videos: B and C in parallel; X fed from B, or from C up a riser;
  // Y teed off C's wire, so it is fed from C, or from B down the riser
  const CROSS_CIRCUIT = `parts = [B('B', 380, 140), B('C', 160, 260), C('X', 700, 140), C('Y', 700, 380)];
    wires = [Wr(0, 200, 80, 200), Wr(80, 140, 80, 260), Wr(80, 140, 340, 140), Wr(80, 260, 120, 260), Wr(420, 140, 640, 140), Wr(440, 140, 440, 260),
             Wr(200, 260, 440, 260), Wr(240, 260, 240, 380), Wr(240, 380, 640, 380), Wr(760, 140, W, 140), Wr(760, 380, W, 380)];`;
  for (const [label, circ] of [['B and C feeding X and Y across each other', CROSS_CIRCUIT], ['Y teed off between two branches', TEE_CIRCUIT]]) {
    await check(label + ': current never jumps ahead of itself, coils never flicker', async page => {
      await loadCircuit(page, circ);
      await page.click('#tab-run');
      return page.evaluate(new Function(`
        const out = [], step1 = () => { simT += 1 / 60; runEvents(simT); };
        let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const Ls = [...new Set(parts.filter(p => p.t === 'btn').map(p => p.L))], coils = parts.filter(p => p.t === 'coil');
        // how soon the current could reach each point from the button that changed (seconds)
        const reach = starts => { const d = new Map(starts.map(s => [s, 0])), q = starts.map(s => [0, s]);
          while (q.length) { q.sort((a, b) => a[0] - b[0]); const [dd, u] = q.shift(); if (dd > d.get(u)) continue;
            for (const ei of NET.adj[u]) { const e = NET.edges[ei], w = e.a === u ? e.b : e.a, nd = dd + stepTime(e); if (!d.has(w) || nd < d.get(w)) { d.set(w, nd); q.push([nd, w]); } } }
          return d; };
        for (let i = 0; i < 120; i++) step1();
        let settled = true;
        for (let n = 0; n < 120; n++) {
          const L = Ls[Math.floor(rnd() * Ls.length)], quick = rnd() < 0.25, judge = settled && !quick && busyUntil <= simT;
          const t0 = simT, before = NET.nodes.map((_, i) => colAt(i, t0));
          press(L, !down[L]);
          const D = reach(parts.filter(p => p.L === L).flatMap(p => [p._a, p._b])), seen = new Set(), prev = coils.map(c => !!coilOn[c.id]), flips = {};
          for (let i = 0; i < (quick ? 12 : 200); i++) {
            step1();
            coils.forEach((c, j) => { if (!!coilOn[c.id] !== prev[j]) { flips[c.L] = (flips[c.L] || 0) + 1; prev[j] = !prev[j]; } });
            if (judge) NET.nodes.forEach((_, k) => {
              if (seen.has(k) || colAt(k, simT) === before[k]) return;
              seen.add(k);
              const need = D.get(k) ?? 0;
              if (simT - t0 < need - 0.15) out.push(L + ': the wire at (' + NET.nodes[k].x + ', ' + NET.nodes[k].y + ') changed after ' + (simT - t0).toFixed(2) + ' s, before the current could get there (' + need.toFixed(2) + ' s)');
            });
          }
          if (judge) for (const k in flips) if (flips[k] > 1) out.push(k + ' flickered after ' + L + (down[L] ? ' was pressed' : ' was let go'));
          settled = !quick;
        }
        return out.slice(0, 8);`));
    });
  }

  // the circuit from the "flows separating" video: G (NC) feeds F and five rungs A to E, all onto one bus to X
  const FAN_CIRCUIT = `const Bt = (L, x, y, nc, col) => P('btn', x, y, { L, nc: !!nc, maint: true, color: col });
    parts = [Bt('G', 80, 600, 1, '#EC008C'), Bt('F', 220, 600, 0, '#7030A0'), Bt('A', 720, 100, 0, '#FF0032'), Bt('B', 620, 200, 0, '#0070C0'),
             Bt('C', 520, 300, 0, '#00B050'), Bt('D', 420, 400, 0, '#FF9600'), Bt('E', 320, 500, 0, '#00D2BE'), C('X', 700, 700)];
    wires = [Wr(0, 600, 40, 600), Wr(120, 600, 180, 600), Wr(140, 100, 140, 600), Wr(260, 600, 800, 600), Wr(540, 600, 540, 700), Wr(540, 700, 640, 700), Wr(760, 700, W, 700)];
    for (const [x, y, dx] of [[720, 100, 800], [620, 200, 720], [520, 300, 620], [420, 400, 520], [320, 500, 420]]) wires.push(Wr(140, y, x - 40, y), Wr(x + 40, y, dx, y), Wr(dx, y, dx, 600));`;
  await check('B and C both pressed: X and Y each show the mix of both (teal), and so do the wires between', async page => {
    await loadCircuit(page, CROSS_CIRCUIT);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], at = (x, y) => colAt(NET.nodes.findIndex(n => n.x === x && n.y === y), simT);
      step(2); press('B', true); press('C', true); step(6);
      const teal = blend([flowOf(btnColour('B')), flowOf(btnColour('C'))]);
      for (const [x, y, what] of [[600, 380, 'the wire into Y'], [600, 140, 'the wire into X'], [440, 200, 'the riser between them'], [340, 260, 'the wire along the middle']])
        if (at(x, y) !== teal) out.push(what + ' is ' + at(x, y) + ', not the mix ' + teal);
      press('B', false); step(6);
      if (at(600, 380) !== flowOf(btnColour('C'))) out.push('after letting go of B, Y is not plain green');
      return out;`));
  });

  await check('Whatever order buttons are pressed in, the colours settle the same as starting fresh (nothing stuck)', async page => {
    const out = [];
    for (const [name, circ] of [['B and C across', CROSS_CIRCUIT], ['Y tee', TEE_CIRCUIT], ['three rungs', 'loadPreset("three")'], ['G and six branches', FAN_CIRCUIT]]) {
      await loadCircuit(page, circ);
      await page.click('#tab-run');
      const r = await page.evaluate(new Function(STEP + `
        const res = []; let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const Ls = [...new Set(parts.filter(p => p.t === 'btn').map(p => p.L))], look = () => NET.nodes.map((_, i) => colAt(i, simT)).join('|') + parts.map(p => coilOn[p.id] ? 1 : 0).join('');
        step(3);
        for (let n = 0; n < 48; n++) {
          const L = Ls[Math.floor(rnd() * Ls.length)]; press(L, !down[L]); step(rnd() < 0.4 ? rnd() * 0.4 : 3);
          if (n % 6 === 5) {
            step(8); const st = Object.keys(down).filter(k => down[k]), a = look();
            startRun(); for (const k of st) press(k, true); step(10);
            if (look() !== a) res.push('pressed ' + (st.join('') || 'nothing') + ': colours differ from a fresh start');
          }
        }
        return res;`));
      r.slice(0, 3).forEach(x => out.push(name + ': ' + x));
      await page.click('#tab-edit');
    }
    return out;
  });

  await check('G cutting off six branches at once: every stream runs out to X behind its own tail, no wire goes dark early', async page => {
    await loadCircuit(page, FAN_CIRCUIT);
    if ((await issuesNow(page)).length) return ['circuit not wired: ' + JSON.stringify(await issuesNow(page))];
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      step(2); for (const L of 'ABCDEF') press(L, true); step(8);
      const G = parts.find(p => p.L === 'G'), t0 = simT, latest = new Map();
      press('G', true);
      // the latest moment any stream can still be passing each point: its distance from G along the longest path
      // (in seconds: the time the stream takes along each run, faster in the middle of long plain stretches)
      for (const path of PATHS) { let d = 0, on = false;
        for (const ln of path) { if (ln.e.part === G) on = true; if (!on) continue;
          const ns = ln.e.kind === 'seg' ? ln.chain : [ln.to];
          ns.forEach((n, k) => { const dd = ln.e.kind === 'seg' ? d + ln.tk[k] : d + ln.delay; if (dd > (latest.get(n) || 0)) latest.set(n, dd); });
          d += ln.delay; } }
      const darkAt = new Map();
      for (let i = 0; i < 600; i++) { step(1 / 60); NET.nodes.forEach((_, k) => { if (!darkAt.has(k) && colAt(k, simT) === null) darkAt.set(k, simT - t0); }); }
      const out = [];
      for (const [n, dd] of latest) { const da = darkAt.get(n); if (da === undefined) out.push('(' + NET.nodes[n].x + ', ' + NET.nodes[n].y + ') never went dark');
        else if (da < dd - 0.12) out.push('(' + NET.nodes[n].x + ', ' + NET.nodes[n].y + ') went dark at ' + da.toFixed(2) + ' s, but a stream is still passing until ' + dd.toFixed(2) + ' s'); }
      return out.slice(0, 6);`));
  });

  await check('Moving any part up or down keeps every wire connected (junctions partway along a wire stay put)', async page => {
    const out = [];
    await loadCircuit(page, TEE_CIRCUIT);
    // with the mouse, the move from the video: C up one grid square
    await mouseDrag(page, [360, 262], [360, 240]);
    if ((await issuesNow(page)).length) out.push('moving C up disconnected: ' + JSON.stringify(await issuesNow(page)));
    // and every part, both ways, compared by what connects to what
    const r = await page.evaluate(new Function(TEE_CIRCUIT + `
      normalize();
      const groups = () => { const net = network(), f = components(net, e => e.kind === 'w'), m = new Map();
        for (const p of parts) for (const [s, n] of [['a', p._a], ['b', p._b]]) { const g = f(n); if (!m.has(g)) m.set(g, []); m.get(g).push(p.L + s); }
        for (const [s, n] of [['L1', net.L1], ['L2', net.L2]]) { const g = f(n); if (m.has(g)) m.get(g).push(s); }
        return [...m.values()].map(a => a.sort().join(',')).sort().join(' | '); };
      const base = groups(), res = [];
      for (const p0 of parts) for (const dy of [-40, -20, 20, 40]) {
        const st = stateOf(); const p = parts.find(q => q.id === p0.id);
        const m = movedWires(p, p.x, p.y + dy); wires = m.wires; p.y += dy; normalize();
        const g = groups(); if (g !== base) res.push('moving ' + p.L + ' by ' + dy + ' changed the wiring: ' + g);
        restore(st);
      }
      return res;`));
    return out.concat(r.slice(0, 6));
  });

  await check('Long stretches speed the current up smoothly; a short wire keeps normal speed', async page => {
    const out = [];
    // a short wire (400 units after the button): normal speed all the way
    await loadCircuit(page, `parts = [B('A', 120, 200), C('X', 620, 200)]; wires = [Wr(0, 200, 80, 200), Wr(160, 200, 560, 200), Wr(680, 200, 880, 200)]; W = 880;`);
    await page.click('#tab-run');
    out.push(...await page.evaluate(new Function(STEP + `
      const out = [], n = NET.nodes.findIndex(q => q.x === 540 && q.y === 200);
      step(2); press('A', true); const t0 = simT; while (!colAt(n, simT) && simT < t0 + 10) step(1 / 240);
      const want = (80 + 380) / V;
      if (Math.abs(simT - t0 - want) > 0.02) out.push('short stretch: the current reached 540 after ' + (simT - t0).toFixed(2) + ' s, not ' + want.toFixed(2) + ' s');
      return out;`)));
    // a long stretch (1680 units, four corners): much sooner than at normal speed, and no sudden change of speed
    await page.click('#tab-edit');
    await loadCircuit(page, `parts = [B('A', 120, 200), C('X', 1500, 200)]; wires = [Wr(0, 200, 80, 200), Wr(160, 200, 600, 200), Wr(600, 200, 600, 400), Wr(600, 400, 1440, 400), Wr(1440, 400, 1440, 200), Wr(1560, 200, 1600, 200)]; W = 1600;`);
    await page.click('#tab-run');
    out.push(...await page.evaluate(new Function(STEP + `
      const out = [], node = (x, y) => NET.nodes.findIndex(q => q.x === x && q.y === y), path = [];
      for (let x = 165; x <= 600; x += 5) path.push(node(x, 200)); for (let y = 205; y <= 400; y += 5) path.push(node(600, y));
      for (let x = 605; x <= 1440; x += 5) path.push(node(x, 400)); for (let y = 395; y >= 200; y -= 5) path.push(node(1440, y));
      step(2); press('A', true); const t0 = simT, dt = 1 / 120, fr = [];
      let k = 0; while (k < path.length && simT < t0 + 10) { step(dt); while (k < path.length && colAt(path[k], simT)) k++; fr.push(k * 5); }
      const plain = (80 + 1680) / V, took = simT - t0;
      if (took > plain * 0.45) out.push('long stretch took ' + took.toFixed(2) + ' s, hardly faster than ' + plain.toFixed(2) + ' s at normal speed');
      // speed over a sliding tenth of a second: it should never jump
      const sp = []; for (let i = 12; i < fr.length; i++) if (fr[i - 12] > 0 && fr[i] < (path.length - 1) * 5) sp.push((fr[i] - fr[i - 12]) / (12 * dt));
      let worst = 0; for (let i = 12; i < sp.length; i++) worst = Math.max(worst, Math.abs(sp[i] - sp[i - 12]) / Math.max(sp[i], sp[i - 12]));
      if (worst > 0.8) out.push('the speed changed by ' + Math.round(worst * 100) + '% within a tenth of a second: ' + sp.filter((_, i) => i % 6 === 0).map(v => (v / V).toFixed(1)).join(' '));
      const top = Math.max(...sp); if (top < 8 * V) out.push('top speed only ' + (top / V).toFixed(1) + '× normal');
      // a longer stretch never takes less time than a shorter one
      let prev = 0; for (let S = 50; S <= 8000; S += 50) { const T = stretch(S).Tf(S); if (T < prev - 1e-6) { out.push('a ' + S + '-unit stretch takes less time than a shorter one'); break; } prev = T; }
      return out;`)));
    return out;
  });

  // the staircase from the speed-up videos: A (NC) feeds six rungs whose colours join one after another onto a long run to X
  const STAIR_CIRCUIT = `const Bt = (L, x, y, col, nc) => P('btn', x, y, { L, nc: !!nc, maint: true, color: col });
    W = 1500; parts = [Bt('A', 80, 100, '#FFFFFF', 1), C('X', 1300, 600)]; wires = [Wr(0, 100, 40, 100), Wr(120, 100, 160, 100), Wr(160, 100, 160, 600), Wr(1360, 600, 1500, 600)];
    [['R', '#FF0032'], ['O', '#FF9600'], ['Y', '#FFDC00'], ['G', '#00B050'], ['B', '#0070C0'], ['M', '#EC008C']].forEach(([L, col], i) => {
      const y = 100 + 100 * i; parts.push(Bt(L, 240, y, col)); wires.push(Wr(160, y, 200, y));
      if (i < 5) { const x = 320 + 40 * i; wires.push(Wr(280, y, x, y), Wr(x, y, x, y + 100)); } else wires.push(Wr(280, y, 1240, y)); });`;
  await check('Streams that join a long stretch one after another stay together as it speeds them up (no pulling apart)', async page => {
    await loadCircuit(page, STAIR_CIRCUIT);
    if ((await issuesNow(page)).length) return ['circuit not wired: ' + JSON.stringify(await issuesNow(page))];
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], node = (x, y) => NET.nodes.findIndex(n => n.x === x && n.y === y);
      const bus = []; for (let x = 485; x < 1240; x += 5) bus.push(node(x, 600));
      step(4);
      // the rung buttons pressed one after another, a moment apart, so their colours join the long run one by one
      const changes = []; let last = colAt(bus[0], simT), snap = null;
      const watch = () => { const c = colAt(bus[0], simT); if (c !== last) { changes.push(simT); last = c; }
        if (!snap && colAt(bus[Math.floor(bus.length * 0.75)], simT)) snap = bus.map(n => colAt(n, simT)); };
      for (const L of 'MBGYOR') { press(L, true); for (let i = 0; i < 8; i++) { step(1 / 120); watch(); } }
      for (let i = 0; i < 600; i++) { step(1 / 120); watch(); }
      if (changes.length < 3 || !snap) return ['the colours did not arrive (' + changes.length + ' changes)'];
      // the first colour's band along the wire, once the front has sped well along, against how long it was when it joined
      let front = snap.length - 1; while (front > 0 && !snap[front]) front--;
      let k = front; while (k > 0 && snap[k - 1] === snap[front]) k--;
      const band = (front - k + 1) * 5, joined = (changes[1] - changes[0]) * V;
      if (band > joined * 1.35 + 20) out.push('the first colour pulled ' + band + ' units ahead of the next, but they joined ' + Math.round(joined) + ' units apart');
      return out;`));
  });

  await check('Relay contacts: a seal-in holds X in after the start button springs back; stop drops it; the bar lands before it passes current', async page => {
    await page.selectOption('#preset', 'seal');
    if ((await issuesNow(page)).length) return ['seal-in circuit not wired: ' + JSON.stringify(await issuesNow(page))];
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], X = parts.find(p => p.t === 'coil'), seal = parts.find(p => p.t === 'con');
      step(2); press('A', true);
      let t = simT; while (!coilOn[X.id] && simT < t + 5) step(1 / 120);
      const picked = simT;
      while (!CON[seal.id].shut && simT < picked + 3) step(1 / 120);
      const landed = simT - picked;
      if (Math.abs(landed - (CT + SWING)) > 0.03) out.push('the seal-in closed ' + landed.toFixed(2) + ' s after X picked up, not ' + (CT + SWING) + ' s');
      step(1); press('A', false); step(4);   // (in Click mode a momentary button springs back once the circuit has settled)
      if (!coilOn[X.id]) out.push('X dropped out when A was let go: the seal-in did not hold it');
      press('D', true); step(1); press('D', false); step(4);
      if (coilOn[X.id]) out.push('pressing stop (D) did not drop X out');
      if (CON[seal.id].shut) out.push('the seal-in did not open when X dropped out');
      press('A', true); step(0.2); press('A', false); step(4);
      if (coilOn[X.id]) out.push('a tap too short for the seal-in to close still latched X');
      return out;`));
  });

  await check('Relay contacts: ABC sequence start, every order of taps, and NC contacts open when their coil picks up', async page => {
    await page.selectOption('#preset', 'abc');
    if ((await issuesNow(page)).length) return ['ABC circuit not wired: ' + JSON.stringify(await issuesNow(page))];
    await page.click('#tab-run');
    const r = await page.evaluate(new Function(STEP + `
      const out = [], on = L => !!coilOn[parts.find(p => p.t === 'coil' && p.L === L).id];
      let x = false, y = false, z = false;
      let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      step(2);
      for (let n = 0; n < 40; n++) {
        const L = 'ABCD'[Math.floor(rnd() * 4)];
        press(L, true); step(2); press(L, false); step(3);
        if (L === 'D') x = y = z = false; else if (L === 'A') x = true; else if (L === 'B') y = y || x; else z = z || (x && y);
        if (on('X') !== x || on('Y') !== y || on('Z') !== z) { out.push('after tapping ' + L + ': X Y Z = ' + [on('X'), on('Y'), on('Z')].map(Number).join('') + ', expected ' + [x, y, z].map(Number).join('')); break; }
      }
      return out;`));
    // an NC contact: X's NC contact feeding Y opens when X picks up
    await page.click('#tab-edit');
    await loadCircuit(page, `parts = [B('A', 120, 200), C('X', 700, 200), P('con', 300, 400, { L: 'X', nc: true }), C('Y', 700, 400)];
      wires = [Wr(0, 200, 80, 200), Wr(160, 200, 640, 200), Wr(760, 200, W, 200), Wr(0, 400, 260, 400), Wr(340, 400, 640, 400), Wr(760, 400, W, 400)];`);
    await page.click('#tab-run');
    const nc = await page.evaluate(new Function(STEP + `
      const out = [], on = L => !!coilOn[parts.find(p => p.t === 'coil' && p.L === L).id];
      step(4); if (!on('Y')) out.push('Y is not in at rest through the NC contact');
      press('A', true); step(4); if (!on('X')) out.push('X did not pick up'); if (on('Y')) out.push('X picked up but its NC contact did not drop Y out');
      press('A', false); step(4); if (!on('Y')) out.push('Y did not come back in when X dropped out');
      return out;`));
    return r.concat(nc);
  });

  await check('A contact past a coil: while it is open, the coil is out and the colour waits at the contact; only the coil\'s return current ever gets past it', async page => {
    await loadCircuit(page, `W = W_MIN; parts = [B('A', 120, 200, true), B('C', 300, 200), C('X', 500, 200), P('con', 700, 200, { L: 'Y', nc: true }), B('E', 300, 340), C('Y', 500, 340)];
      wires = [Wr(0, 200, 80, 200), Wr(160, 200, 260, 200), Wr(340, 200, 440, 200), Wr(560, 200, 660, 200), Wr(740, 200, W, 200), Wr(200, 200, 200, 340), Wr(200, 340, 260, 340), Wr(340, 340, 440, 340), Wr(560, 340, W, 340)];`);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], node = (x, y) => NET.nodes.findIndex(n => n.x === x && n.y === y), at = (x, y) => colAt(node(x, y), simT);
      const on = L => !!coilOn[parts.find(p => p.t === 'coil' && p.L === L).id], past = node(740, 200);
      let leaked = false; const watch = () => { const r = REC.get(past); if (r && !r.ret) leaked = true; };   // past the contact: only return current, ever
      step(2); press('C', true); for (let i = 0; i < 480; i++) { step(1 / 120); watch(); }
      if (!on('X')) out.push('X did not pick up');
      const ret = at(600, 200), green = flowOf(btnColour('C'));
      // Y picks up and its NC contact past X opens: X drops out at once, and the colour waits at the contact
      press('E', true); const t0 = simT; let dropAt = null, waitAt = null;
      for (let i = 0; i < 600; i++) { step(1 / 120); watch(); if (dropAt === null && !on('X')) dropAt = simT - t0; if (waitAt === null && at(565, 200) === green) waitAt = simT - t0; }
      if (on('X')) out.push('X stayed in with its L2-side contact open');
      if (dropAt === null || waitAt === null || waitAt - dropAt > 0.08) out.push('X dropped out, but return current kept coming out of it (waiting colour reached the back of X ' + (waitAt === null ? 'never' : (waitAt - dropAt).toFixed(2) + ' s later') + ')');
      if (at(655, 200) !== green) out.push('the colour is not waiting at the open contact (' + at(655, 200) + ')');
      if (at(800, 200) !== null) out.push('the wire past the open contact is still lit');
      for (let k = 0; k < 4; k++) { press('C', !down.C); for (let i = 0; i < 60; i++) { step(1 / 120); watch(); } }
      press('C', true); for (let i = 0; i < 240; i++) { step(1 / 120); watch(); }
      // the contact closes: X picks up, and its return current comes out of it straight away
      press('E', false); let up = null, lit = null; const t1 = simT;
      for (let i = 0; i < 600; i++) { step(1 / 120); watch(); if (up === null && on('X')) up = simT - t1; if (lit === null && at(565, 200) === ret) lit = simT - t1; }
      if (!on('X')) out.push('X did not pick up again when the contact closed');
      if (up !== null && lit !== null && lit - up > 0.08) out.push('X picked up, but its current took ' + (lit - up).toFixed(2) + ' s to come out of it');
      if (at(600, 200) !== ret) out.push('after the contact closed, the wire past X is not back to the return colour');
      if (leaked) out.push('the colour waiting at the contact got past it (only return current should)');
      return out;`));
  });

  await check('Pulsing a button: every pulse runs the whole length of a long winding wire to the coil', async page => {
    await loadCircuit(page, `W = 1500; parts = [B('A', 120, 100), C('X', 1200, 520)]; wires = [Wr(0, 100, 80, 100)];
      let y = 100; const pts = [[160, 100]]; for (let i = 0; i < 6; i++) { const nx = i % 2 ? 80 : 1360; pts.push([nx, y]); y += 60; pts.push([nx, y]); }
      pts.push([1140, y], [1140, 520]); for (let i = 1; i < pts.length; i++) wires.push(Wr(...pts[i - 1], ...pts[i])); wires.push(Wr(1260, 520, W, 520));`);
    await page.click('#tab-run');
    return page.evaluate(() => {
      const step1 = () => { simT += 1 / 120; runEvents(simT); }, n0 = NET.nodes.findIndex(n => n.x === 200 && n.y === 100), X = parts.find(p => p.t === 'coil');
      let a0 = false, x0 = false, ins = 0, outs = 0;
      const watch = () => { const a = !!colAt(n0, simT), c = !!REC.get(X._a); if (a && !a0) ins++; if (c && !x0) outs++; a0 = a; x0 = c; };
      for (let i = 0; i < 120; i++) { step1(); watch(); }
      for (let k = 0; k < 8; k++) { press('A', !down.A); for (let i = 0; i < 40; i++) { step1(); watch(); } }
      for (let i = 0; i < 3600; i++) { step1(); watch(); }   // (about 20 s of wire at normal speed)
      return ins === 4 && outs === 4 ? [] : [ins + ' pulses went in, ' + outs + ' reached X'];
    });
  });

  await check('Current flows along the short leads into and out of a part, rather than jumping onto them', async page => {
    await page.selectOption('#preset', 'io'); await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], X = parts.find(p => p.t === 'coil'), v = view.parts.get(X.id);
      const shown = L => L.cur.getAttribute('stroke') === 'transparent' ? 0 : Math.abs(L.cur.getAttribute('x2') - L.cur.getAttribute('x1'));
      step(2); press('A', true);
      const seenIn = [], seenOut = [];
      for (let i = 0; i < 120; i++) { step(1 / 60); paint(); seenIn.push(shown(v.lead.A)); seenOut.push(shown(v.lead.B)); }
      const full = TERM(X) - COIL / 2, part = a => a.some(x => x > 0.5 && x < full - 0.5);
      if (!part(seenIn)) out.push('the lead into X lit all at once');
      if (!part(seenOut)) out.push('the lead out of X lit all at once');
      if (Math.max(...seenIn) < full - 0.5 || Math.max(...seenOut) < full - 0.5) out.push('a lead never lit all the way');
      return out;`));
  });

  // the "Stress test" circuit: master seal-in, forward/reverse with interlocks, a contact behind a coil, a button
  // drawn twice, a self-switching buzzer, a three-relay cascade and a cross-feed, all at once
  const STRESS_LOGIC = `const expect = (prev, b) => { let c = { ...prev }; for (let k = 0; k < 30; k++) { const n = { ...c };
      n.M = !b.S && (b.A || c.M); n.F = c.M && (b.B || c.F) && !c.R; n.R = c.M && (b.C || c.R) && !c.F; n.Y = b.E || c.F; n.X = (b.D || b.E) && !c.Y;
      n.P = b.J; n.Q = c.P; n.T = c.Q; n.U = b.H || b.K; n.V = b.H || b.K; n.Z = false;
      if (JSON.stringify(n) === JSON.stringify(c)) break; c = n; } return c; };`;
  await check('Stress test circuit: random taps and toggles always match the ladder logic, no flicker, buzzer keeps buzzing', async page => {
    await page.selectOption('#preset', 'stress');
    if ((await issuesNow(page)).length) return ['stress circuit not wired: ' + JSON.stringify(await issuesNow(page))];
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + STRESS_LOGIC + `
      const out = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const coils = () => Object.fromEntries(parts.filter(p => p.t === 'coil').map(p => [p.L, !!coilOn[p.id]]));
      const btns = () => Object.fromEntries('SABCDEGJHK'.split('').map(L => [L, !!down[L]]));
      const watch = (secs, flips) => { let pc = coils(); for (let i = 0; i < secs * 60; i++) { step(1 / 60); const c = coils(); for (const k in c) if (k !== 'Z' && c[k] !== pc[k]) flips[k] = (flips[k] || 0) + 1; pc = c; } };
      step(3); let exp = expect(coils(), btns());
      for (let n = 0; n < 60 && out.length < 6; n++) {
        const flips = {}; let what;
        if (rnd() < 0.45) { const L = 'SABC'[Math.floor(rnd() * 4)]; what = 'tap ' + L; press(L, true); watch(2, flips); exp = expect(exp, btns()); press(L, false); watch(5, flips); }
        else { const L = 'DEGJHK'[Math.floor(rnd() * 6)]; what = (down[L] ? 'release ' : 'press ') + L; press(L, !down[L]); watch(6, flips); }
        exp = expect(exp, btns());
        for (const k in flips) if (flips[k] > 1) out.push(what + ': ' + k + ' switched ' + flips[k] + ' times');
        const c = coils(); for (const k in exp) if (k !== 'Z' && c[k] !== exp[k]) out.push(what + ': ' + k + ' is ' + (c[k] ? 'in' : 'out') + ', the logic says ' + (exp[k] ? 'in' : 'out'));
        if (down.G) { let z = 0, pz = c.Z; for (let i = 0; i < 300; i++) { step(1 / 60); const zz = coils().Z; if (zz !== pz) z++; pz = zz; } if (z < 3) out.push('G is in but the buzzer Z switched only ' + z + ' times in 5 s'); }
      }
      return out;`));
  });

  await check('Stress test circuit: button mashing faster than the relays can follow always settles back to a clean start', async page => {
    await page.selectOption('#preset', 'stress'); await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = []; let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, all = 'SABCDEGJHK';
      let maxQ = 0; const stepQ = dt => { const end = simT + dt; while (simT < end - 1e-9) { simT = Math.min(end, simT + 1 / 60); runEvents(simT); maxQ = Math.max(maxQ, queue.length); } };
      for (let n = 0; n < 250; n++) { const L = all[Math.floor(rnd() * all.length)]; press(L, !down[L]); stepQ(0.02 + rnd() * 0.35); }
      for (const L of all) press(L, false); press('S', true); stepQ(1); press('S', false); stepQ(25);
      const look = () => NET.nodes.map((_, i) => colAt(i, simT)).join('|') + parts.map(p => coilOn[p.id] ? 1 : 0).join('');
      const a = look(), stuck = parts.filter(p => p.t === 'coil' && coilOn[p.id]).map(p => p.L);
      startRun(); step(25);
      if (stuck.length) out.push('coils still in after letting go of everything: ' + stuck.join(' '));
      if (look() !== a) out.push('the colours did not settle back to what a clean start shows');
      if (maxQ > 400) out.push('the event queue grew to ' + maxQ);
      return out;`));
  });

  await check('Stress test circuit: moving parts at random never changes what connects to what; save, open and undo bring it back exactly', async page => {
    await page.selectOption('#preset', 'stress');
    return page.evaluate(() => {
      const out = []; let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const groups = () => { const net = network(), f = components(net, e => e.kind === 'w'), m = new Map();
        for (const p of parts) for (const [s, n] of [['a', p._a], ['b', p._b]]) { const g = f(n); if (!m.has(g)) m.set(g, []); m.get(g).push(p.id + s); }
        for (const [s, n] of [['L1', net.L1], ['L2', net.L2]]) { const g = f(n); if (m.has(g)) m.get(g).push(s); }
        return [...m.values()].map(a => a.sort().join(',')).sort().join(' | '); };
      const base = groups(), orig = JSON.stringify(wires.map(w => [w.x1, w.y1, w.x2, w.y2]).sort()); let moves = 0;
      for (let n = 0; n < 80; n++) {
        const p = parts[Math.floor(rnd() * parts.length)], dx = (Math.floor(rnd() * 5) - 2) * 20, dy = (Math.floor(rnd() * 5) - 2) * 20;
        const [x, y] = clampPart(p.x + dx, p.y + dy, p.t); if (overlaps(p, x, y, p.t)) continue;
        snapshot(); const m = movedWires(p, x, y); wires = m.wires; p.x = x; p.y = y; normalize();
        if (wireInTheWay(p) || m.hits.length) { restore(history.pop()); normalize(); continue; }   // (moves the editor refuses, or that join something on purpose)
        moves++;
        if (groups() !== base) { out.push('moving ' + p.t + ' ' + p.L + ' by ' + dx + ', ' + dy + ' changed what connects to what'); restore(history.pop()); normalize(); }
      }
      const d = circuitData(), c = readCircuit(JSON.parse(JSON.stringify(d))); parts = c.parts; wires = c.wires; W = c.w; normalize();
      if (JSON.stringify(circuitData()) !== JSON.stringify(d)) out.push('saving and opening changed the circuit');
      for (let i = 0; i < moves; i++) undo();
      if (JSON.stringify(wires.map(w => [w.x1, w.y1, w.x2, w.y2]).sort()) !== orig) out.push('undoing every move did not bring back the original wiring');
      if (moves < 30) out.push('only ' + moves + ' moves were tried');
      return out.slice(0, 6);
    });
  });

  // the interlock from the video: X = (A or X) and not Y; Y = (B or Y) and not X, with Y's rung down a long winding wire
  const INTERLOCK = (oneSided) => `W = W_MIN; const Bt = (L, x, y, col) => P('btn', x, y, { L, maint: true, color: col });
    parts = [Bt('A', 120, 80, '#FF0032'), P('con', 120, 180, { L: 'X' }), C('X', 700, 80), Bt('B', 120, 320, '#0070C0'), P('con', 120, 420, { L: 'Y' }), P('con', 300, 320, { L: 'X', nc: true }), C('Y', 700, 320)];
    wires = [Wr(0, 80, 80, 80), Wr(40, 80, 40, 180), Wr(40, 180, 80, 180), Wr(160, 80, 260, 80), Wr(160, 180, 200, 180), Wr(200, 180, 200, 80), Wr(340, 80, 640, 80), Wr(760, 80, W, 80),
             Wr(0, 320, 80, 320), Wr(40, 320, 40, 420), Wr(40, 420, 80, 420), Wr(160, 320, 260, 320), Wr(160, 420, 200, 420), Wr(200, 420, 200, 320), Wr(760, 320, W, 320)];
    ${oneSided ? "wires.push(Wr(260, 80, 340, 80));" : "parts.push(P('con', 300, 80, { L: 'Y', nc: true }));"}
    let x = 380, yy = 320; wires.push(Wr(340, 320, 380, 320)); for (let i = 0; i < 5; i++) { const y2 = i % 2 ? 260 : 720; wires.push(Wr(x, yy, x, y2), Wr(x, y2, x + 40, y2)); yy = y2; x += 40; } wires.push(Wr(x, yy, x, 320), Wr(x, 320, 640, 320));`;
  await check('Interlock: the coil whose button was pressed first wins, even when the other current has less wire to travel; no endless switching', async page => {
    const out = [];
    const run = async (circ, script) => { await page.click('#tab-edit'); await loadCircuit(page, circ); await page.click('#tab-run'); return page.evaluate(new Function(STEP + `
      const on = L => !!coilOn[parts.find(p => p.t === 'coil' && p.L === L).id], Y = parts.find(p => p.t === 'coil' && p.L === 'Y');
      let slips = 0, flips = 0, last = '';
      const watch = s => { for (let i = 0; i < s * 60; i++) { step(1 / 60); const r = REC.get(Y._b); if (!on('Y') && r && !r.ret) slips++; const k = +on('X') + '' + +on('Y'); if (k !== last) { flips++; last = k; } } };
      step(2); ` + script + `
      return { X: on('X'), Y: on('Y'), slips, flips };`)); };
    let r = await run(INTERLOCK(false), `press('B', true); watch(2); press('A', true); watch(20);`);
    if (!r.Y || r.X) out.push('B first: Y should be in and X out, got X ' + +r.X + ' Y ' + +r.Y);
    if (r.flips > 3) out.push('B first: the coils kept switching (' + r.flips + ' changes)');
    if (r.slips) out.push('B first: current got past Y while it was out');
    r = await run(INTERLOCK(false), `press('B', true); let k = 0; while (!on('Y') && k++ < 600) step(1 / 60); return { Y: on('Y'), t: k / 60 };`);
    if (!r.Y || r.t > 2.2) out.push('the long winding wire should speed the current up: Y took ' + (r.t ?? '?') + ' s to pick up');
    r = await run(INTERLOCK(false), `press('A', true); watch(2); press('B', true); watch(20);`);
    if (!r.X || r.Y) out.push('A first: X should be in and Y out, got X ' + +r.X + ' Y ' + +r.Y);
    r = await run(INTERLOCK(false), `press('A', true); press('B', true); watch(25);`);
    if (r.X === r.Y) out.push('both at once: exactly one coil should win, got X ' + +r.X + ' Y ' + +r.Y);
    if (r.flips > 4) out.push('both at once: the coils kept switching (' + r.flips + ' changes)');
    // one-sided: Y has X's NC contact but X has nothing from Y: X must still win when A is pressed after Y is in
    r = await run(INTERLOCK(true), `press('B', true); watch(10); press('A', true); watch(15);`);
    if (!r.X || r.Y) out.push('one-sided interlock: pressing A with Y in should bring X in and drop Y, got X ' + +r.X + ' Y ' + +r.Y);
    return out;
  });

  await check('Building by hand: wires from the bars, parts dropped onto wires, a working circuit', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank');
    await mouseDrag(page, [4, 160], [876, 160]);
    await toolbarDrop(page, 'coil', 700, 160); await toolbarDrop(page, 'btn-nc', 200, 160); await toolbarDrop(page, 'btn-no', 400, 160);
    const iss = await issuesNow(page); if (iss.length) out.push('wiring issues: ' + JSON.stringify(iss));
    await page.click('#tab-run');
    const r = await page.evaluate(new Function(STEP + `const X = parts.find(p => p.t === 'coil'), res = []; step(4);
      const nc = parts.find(p => p.t === 'btn' && p.nc).L, no = parts.find(p => p.t === 'btn' && !p.nc).L;
      press(no, true); step(8); if (!coilOn[X.id]) res.push('NO pressed but coil off');
      press(nc, true); step(8); if (coilOn[X.id]) res.push('NC pressed but coil on'); return res;`));
    return out.concat(r);
  });

  await check('Pilot lights: placed from the toolbar, light while fed, and one built into a button lights that button up; saved and opened again', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank');
    // rung 1: button A into a light of its own; rung 2: button B into a light built into A
    await mouseDrag(page, [4, 160], [876, 160]); await mouseDrag(page, [4, 320], [876, 320]);
    await toolbarDrop(page, 'btn-no', 200, 160); await toolbarDrop(page, 'lamp', 700, 160);
    await toolbarDrop(page, 'btn-no', 200, 320); await toolbarDrop(page, 'lamp', 700, 320);
    const iss = await issuesNow(page); if (iss.length) out.push('wiring issues: ' + JSON.stringify(iss));
    const [A, B] = await page.evaluate(() => parts.filter(p => p.t === 'btn').sort((a, b) => a.y - b.y).map(p => p.L));
    // the second light's settings: build it into A
    const lamp2 = await scr(page, 700, 320); await page.mouse.click(...lamp2); await page.waitForTimeout(60);
    if (await page.isHidden('#props-lamp')) out.push('the light\'s settings did not show');
    await page.selectOption('#l-btn', A);
    const st = await page.evaluate(() => parts.filter(p => p.t === 'lamp').sort((a, b) => a.y - b.y).map(p => p.L));
    if (st[0] !== '' || st[1] !== A) out.push('links wrong: ' + JSON.stringify(st));
    if (!(await page.evaluate(L => view.parts.get(parts.find(p => p.t === 'btn' && p.L === L).id).badge, A))) out.push('no lamp badge on the button the light is built into');
    const before = await page.evaluate(() => JSON.stringify(circuitData()));
    await page.click('#tab-run');
    const r = await page.evaluate(new Function('o', STEP + `
      const { A, B } = o, res = [], [l1, l2] = parts.filter(p => p.t === 'lamp').sort((a, b) => a.y - b.y), bA = parts.find(p => p.t === 'btn' && p.L === A);
      const cap = () => view.parts.get(bA.id).fill.getAttribute('fill'), halo = () => +view.parts.get(bA.id).halo.getAttribute('opacity');
      step(3); paint(); const dim = cap();
      if (coilOn[l1.id] || coilOn[l2.id]) res.push('a light is on before anything is pressed');
      press(A, true); step(4); paint();
      if (!coilOn[l1.id]) res.push('A pressed but its light is off'); if (coilOn[l2.id]) res.push('A pressed lit the light built into A (it is wired to B)');
      if (halo() > 0.01) res.push('the A button glows although its light is off');
      press(A, false); press(B, true); step(4); paint();
      if (!coilOn[l2.id]) res.push('B pressed but the light built into A is off');
      if (halo() < 0.5) res.push('the light built into A is on but the A button does not glow');
      if (cap() === dim) res.push('the A button cap did not light up');
      press(B, false); step(4); paint();
      if (coilOn[l2.id] || halo() > 0.01) res.push('B let go but the A button is still lit');
      return res;`), { A, B });
    out.push(...r);
    // save and open: the light and its link come back
    await page.click('#tab-edit');
    await page.click('#save-btn'); await page.waitForTimeout(150);
    const code = await page.inputValue('#save-code'); await page.keyboard.press('Escape');
    await page.selectOption('#preset', 'blank');
    await page.click('#open-btn'); await page.fill('#open-code', code); await page.click('#open-code-btn'); await page.waitForTimeout(150);
    if ((await page.evaluate(() => JSON.stringify(circuitData()))) !== before) out.push('the circuit changed after saving and opening');
    // renaming the button takes its light with it
    const bA = await page.evaluate(L => { const p = parts.find(q => q.t === 'btn' && q.L === L); return [p.x, p.y]; }, A);
    await page.mouse.click(...await scr(page, ...bA)); await page.waitForTimeout(60);
    await page.selectOption('#p-letter', 'Q');
    if ((await page.evaluate(() => parts.filter(p => p.t === 'lamp').map(p => p.L).join(','))) !== ',Q') out.push('renaming the button lost its light');
    return out;
  });

  await check('Speed slider: any speed from 0.1× to 300×; turned right up the circuit acts at once and the page keeps up', async page => {
    const out = [];
    await page.selectOption('#preset', 'seal'); await page.click('#tab-run'); await page.waitForTimeout(200);
    await page.locator('#speed-slider').fill('0'); if ((await page.evaluate(() => speed)) !== 0.1 || (await page.textContent('#speed-out')) !== '0.1×') out.push('slider at the left is not 0.1×');
    await page.click('[data-speed="2"]');
    if (Math.abs((await page.locator('#speed-slider').inputValue()) - 37.4) > 1) out.push('a preset did not move the slider');
    await page.locator('#speed-slider').fill('100');
    if ((await page.evaluate(() => speed)) !== 300 || (await page.textContent('#speed-out')) !== '300×') out.push('slider at the right is not 300×');
    if (await page.evaluate(() => [...document.querySelectorAll('[data-speed]')].some(b => b.getAttribute('aria-pressed') === 'true'))) out.push('a preset still shows as chosen');
    // a click on START: X picks up and seals in within a moment of real time
    const t0 = await page.evaluate(() => { press('A', true); autoRel.A = true; return performance.now(); });
    try { await page.waitForFunction(() => coilOn[parts.find(p => p.t === 'coil').id], null, { timeout: 1000, polling: 'raf' }); } catch (_) { out.push('X not in within a second at 300×'); }
    const ms = await page.evaluate(t0 => performance.now() - t0, t0); if (ms > 400) out.push('X took ' + Math.round(ms) + ' ms at 300×');
    // the stress circuit with its buzzer going: frames stay short
    await page.selectOption('#preset', 'stress'); await page.waitForTimeout(150); await page.evaluate(() => press('G', true));
    const fr = await page.evaluate(() => new Promise(res => { const ts = []; let last = performance.now(); const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (ts.length < 90) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); }));
    fr.sort((a, b) => a - b); if (fr[45] > 40) out.push('frames take ' + Math.round(fr[45]) + ' ms with the buzzer going at 300×');
    await page.click('[data-speed="1"]');
    return out;
  });

  await check('Traffic light preset: opens exactly as saved, runs through to S; a settled circuit is not repainted until something happens', async page => {
    const out = [];
    await page.selectOption('#preset', 'traffic');
    const d = await page.evaluate(() => circuitData());
    if (d.w !== 800 || !d.fw || d.parts.length !== 27 || d.wires.length !== 39) out.push('traffic light not as saved: ' + JSON.stringify([d.w, d.fw, d.parts.length, d.wires.length]));
    await page.click('#tab-run'); await page.waitForTimeout(100);
    const r = await page.evaluate(new Function(STEP + `const res = []; step(2); press('A', true); step(12); press('A', false); step(4);
      for (const p of parts) if (LOADT(p.t) && !coilOn[p.id]) res.push((p.L || p.color) + ' is off at the end of the sequence');
      return res;`));
    out.push(...r);
    // idle: no painting; a press wakes it up and the pressed button repaints
    const count = () => page.evaluate(() => new Promise(res => { let n = 0; const P = paint; window.paint = function () { n++; P(); }; setTimeout(() => { window.paint = P; res(n); }, 600); }));
    await page.waitForTimeout(800);
    const idle = await count(); if (idle > 0) out.push('a settled circuit was painted ' + idle + ' times in 0.6 s');
    const n = await page.evaluate(() => new Promise(res => { let n = 0; const P = paint; window.paint = function () { n++; P(); }; press('B', true); setTimeout(() => { window.paint = P; res(n); }, 400); }));
    if (n < 5) out.push('pressing B did not wake the painting up (' + n + ' paints)');
    if (await page.evaluate(() => view.parts.get(parts.find(p => p.t === 'btn' && p.L === 'B').id).fill.getAttribute('fill')) !== '#404040') out.push('the pressed button did not repaint');
    return out;
  });

  await check('Renaming a coil takes its contacts with it; the slider snaps to round speeds', async page => {
    const out = [];
    await page.selectOption('#preset', 'abc');   // X has three contacts (seal-in and two interlocks)
    const xy = await page.evaluate(() => { const p = parts.find(q => q.t === 'coil' && q.L === 'X'); return [p.x, p.y]; });
    await page.mouse.click(...await scr(page, ...xy)); await page.waitForTimeout(60);
    await page.selectOption('#o-letter', 'Q');
    const L = await page.evaluate(() => parts.filter(p => p.t === 'con').map(p => p.L).sort().join(''));
    if (L !== 'QQQYYZ') out.push('contacts after renaming X to Q: ' + L);
    await page.click('#tab-run');
    const r = await page.evaluate(new Function(STEP + `step(1); press('A', true); step(2); press('A', false); press('B', true); step(2); press('B', false); step(2);
      return [coilOnL('Q'), coilOnL('Y')];`));
    if (!r[0] || !r[1]) out.push('the renamed coil\'s contacts do not work: Q ' + r[0] + ', Y ' + r[1]);
    // the slider: near 10× it lands on 10×; between the round speeds it stays where it is put
    const at = async v => { await page.locator('#speed-slider').fill(String(v)); return page.evaluate(() => speed); };
    const v9 = Math.round(100 * Math.log10(9 / 0.1) / Math.log10(3000)), v6 = Math.round(100 * Math.log10(6 / 0.1) / Math.log10(3000));
    if (await at(v9) !== 10) out.push('9× did not snap to 10×');
    if (Math.abs(await at(v6) - 6) > 0.5) out.push('6× snapped somewhere: ' + await at(v6));
    for (const k of [50, 100, 200]) { const v = Math.round(100 * Math.log10(k * 0.93 / 0.1) / Math.log10(3000)); if (await at(v) !== k) out.push(`${k * 0.93}× did not snap to ${k}×`); }
    await page.click('[data-speed="1"]');
    return out;
  });

  await check('A button drawn more than once shows a link badge on each drawing, and selecting one outlines the others', async page => {
    const out = [];
    await page.selectOption('#preset', 'stress');   // E is drawn twice
    const badges = await page.evaluate(() => parts.filter(p => p.t === 'btn').map(p => [p.L, !!view.parts.get(p.id).linked]));
    for (const [L, b] of badges) { const many = badges.filter(x => x[0] === L).length > 1; if (b !== many) out.push(`${L}: badge ${b} but drawn ${badges.filter(x => x[0] === L).length} time(s)`); }
    const es = await page.evaluate(() => parts.filter(p => p.t === 'btn' && p.L === 'E').map(p => [p.x, p.y]));
    await page.mouse.click(...await scr(page, ...es[0])); await page.waitForTimeout(60);
    const outlined = await page.evaluate(() => parts.filter(p => p.t === 'btn' && p.L === 'E').map(p => !!svg.querySelector(`[data-part="${p.id}"] rect[stroke-dasharray]`)));
    if (!outlined.every(Boolean)) out.push('the other E is not outlined when one is selected');
    return out;
  });

  await check('A button drawn more than once: the first is drawn as the main one, the rest as secondary; Make main swaps them', async page => {
    const out = [];
    await page.selectOption('#preset', 'stress');   // E is drawn twice
    const looks = () => page.evaluate(() => parts.filter(p => p.t === 'btn' && p.L === 'E').map(p => [p.id, !!view.parts.get(p.id).sec]));
    let l = await looks();
    if (l[0][1] || !l[1][1]) out.push('expected the first E main and the second secondary: ' + JSON.stringify(l));
    const pos = await page.evaluate(id => { const p = parts.find(q => q.id === id); return [p.x, p.y]; }, l[1][0]);
    await page.mouse.click(...await scr(page, ...pos)); await page.waitForTimeout(60);
    if (await page.isHidden('#p-main')) out.push('no Make main button on the secondary E');
    await page.click('#p-main'); await page.waitForTimeout(60);
    if ((await looks()).map(x => x[1]).join() !== 'false,true') out.push('after Make main the looks are wrong');
    const mainNow = await page.evaluate(() => mainBtn('E').id);
    if (mainNow !== (await page.evaluate(p => parts.find(q => q.x === p[0] && q.y === p[1] && q.t === 'btn').id, pos))) out.push('Make main did not make the selected E the main one');
    // pressing the secondary presses both, and it greys like any pressed button
    await page.click('#tab-run');
    const r = await page.evaluate(new Function(STEP + `step(1); press('E', true); step(1); paint();
      return parts.filter(p => p.t === 'btn' && p.L === 'E').map(p => { const v = view.parts.get(p.id); return [!!v.sec, v.fill.getAttribute('fill'), v.fill.getAttribute('stroke'), v.press.getAttribute('transform')]; });`));
    const m = r.find(x => !x[0]), s2 = r.find(x => x[0]);
    if (m[1] !== '#404040') out.push('the main E pressed is not grey: ' + m[1]);
    if (s2[1] === m[1] || s2[2] !== '#8c8c8c') out.push('the secondary E pressed does not look its own way: ' + JSON.stringify(s2));
    if (!m[3] || !s2[3]) out.push('a pressed E did not sink in');
    return out;
  });

  await check('Copy and paste: a copied circuit goes in below with letters of its own and works by itself; cut; undo', async page => {
    const out = [];
    await page.selectOption('#preset', 'seal');
    const before = await page.evaluate(() => [parts.length, wires.length]);
    // select everything with a box, then Ctrl+C, Ctrl+V
    await page.evaluate(() => { sel = { parts: new Set(parts.map(p => p.id)), wires: new Set(wires.map(w => w.id)) }; draw(); });
    await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await page.waitForTimeout(80);
    const r = await page.evaluate(() => ({ n: [parts.length, wires.length], coils: parts.filter(p => p.t === 'coil').map(p => p.L), cons: parts.filter(p => p.t === 'con').map(p => p.L),
      btns: parts.filter(p => p.t === 'btn').map(p => p.L), sel: selCount(), iss: [...wiringIssues(network()).entries()] }));
    if (r.n[0] !== before[0] * 2) out.push('parts after paste: ' + r.n[0]);
    if (r.iss.length) out.push('wiring issues after paste: ' + JSON.stringify(r.iss));
    if (new Set(r.coils).size !== 2 || new Set(r.btns).size !== 4) out.push('pasted letters not new: ' + JSON.stringify(r));
    if (r.cons.sort().join() !== r.coils.sort().join()) out.push('the pasted seal-in contact did not go with the pasted coil: ' + JSON.stringify(r));
    if (!r.sel) out.push('the pasted copy is not selected');
    // both work, each by itself
    await page.click('#tab-run');
    const w = await page.evaluate(new Function(STEP + `const [c1, c2] = parts.filter(p => p.t === 'coil'), b = parts.filter(p => p.t === 'btn' && !p.nc).map(p => p.L);
      step(1); press(b[1], true); step(3); press(b[1], false); step(3); return [!!coilOn[c1.id], !!coilOn[c2.id]];`));
    if (w[0] || !w[1]) out.push('pressing the copy\'s start should seal in only the copy: ' + JSON.stringify(w));
    await page.click('#tab-edit');
    // undo takes the paste away; cut removes and paste brings it back
    await page.keyboard.press('Control+z'); await page.waitForTimeout(50);
    if ((await page.evaluate(() => parts.length)) !== before[0]) out.push('undo did not remove the paste');
    const coilXY = await page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); return [p.x, p.y]; });
    await page.mouse.click(...await scr(page, ...coilXY)); await page.keyboard.press('Control+x'); await page.waitForTimeout(50);
    if (await page.evaluate(() => parts.some(p => p.t === 'coil'))) out.push('cut did not remove the coil');
    await page.click('#paste'); await page.waitForTimeout(50);
    if (!(await page.evaluate(() => parts.some(p => p.t === 'coil')))) out.push('Paste did not bring the coil back');
    return out;
  });

  await check('On-delay timer: contacts change only after its set time energized; losing power resets it; readout counts down whole seconds', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank');
    // rung 1: A into a timer placed from the toolbar; rung 2: the timer's NO contact into a pilot light
    await mouseDrag(page, [4, 160], [876, 160]); await mouseDrag(page, [4, 320], [876, 320]);
    await toolbarDrop(page, 'btn-no', 200, 160); await toolbarDrop(page, 'timer', 700, 160);
    await toolbarDrop(page, 'con-no', 300, 320); await toolbarDrop(page, 'lamp', 700, 320);
    const T = await page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); return { L: p.L, delay: p.delay, x: p.x, y: p.y }; });
    if (!(T.delay > 0)) out.push('the toolbar timer has no delay');
    // its settings: set it to 3 s, and make the contact the timer's
    await page.mouse.click(...await scr(page, T.x, T.y)); await page.waitForTimeout(60);
    if (await page.isHidden('#o-delay-group')) out.push('no delay setting for the timer');
    await page.fill('#o-delay', '3'); await page.press('#o-delay', 'Enter'); await page.waitForTimeout(60);
    await page.evaluate(L => { parts.find(p => p.t === 'con').L = L; draw(); }, T.L);
    if ((await page.evaluate(() => parts.find(p => p.t === 'coil').delay)) !== 3) out.push('delay not set to 3');
    const iss = await issuesNow(page); if (iss.length) out.push('wiring issues: ' + JSON.stringify(iss));
    if (!/Timed Contact/.test(await page.evaluate(() => captionOf(parts.find(p => p.t === 'con'))))) out.push('the contact is not captioned as timed');
    const saved = await page.evaluate(() => JSON.stringify(circuitData()));
    await page.click('#tab-run');
    const r = await page.evaluate(new Function(STEP + `const res = [], T = parts.find(p => p.t === 'coil'), Lp = parts.find(p => p.t === 'lamp'), A = parts.find(p => p.t === 'btn').L;
      const read = () => view.parts.get(T.id).win.textContent;
      step(1); paint(); if (read() !== '3 s') res.push('off readout ' + read());
      press(A, true); let k = 0; while (!coilOn[T.id] && k++ < 600) step(1 / 60);
      const t0 = simT, seen = new Set();
      while (simT < t0 + 2.9) { step(1 / 30); paint(); seen.add(read()); if (coilOnL(T.L)) { res.push('contacts changed after ' + (simT - t0).toFixed(2) + ' s of a 3 s delay'); break; } }
      if ([...seen].join() !== '3 s,2 s,1 s') res.push('readout went ' + [...seen].join(' / '));
      step(0.3); paint(); if (!coilOnL(T.L)) res.push('contacts did not change once timed out'); if (read() !== '0 s') res.push('timed-out readout ' + read());
      step(3); if (!coilOn[Lp.id]) res.push('the light did not come on after the timer timed out');
      // losing power: resets at once, contacts back
      press(A, false); step(3); paint();
      if (coilOn[T.id] || coilOnL(T.L)) res.push('the timer did not reset when A was let go'); if (coilOn[Lp.id]) res.push('the light stayed on');
      if (read() !== '3 s') res.push('readout after reset ' + read());
      // a press shorter than the delay never times it out
      press(A, true); step(2.2); press(A, false); step(4);
      if (coilOn[Lp.id] || coilOnL(T.L)) res.push('a press shorter than the delay timed it out');
      return res;`));
    out.push(...r);
    // while it only counts down, the panel is not repainted (just the readout)
    const n = await page.evaluate(() => new Promise(res => { parts.find(p => p.t === 'coil').delay = 8; press(parts.find(p => p.t === 'btn').L, true);
      setTimeout(() => { let k = 0; const P = paint; window.paint = function () { k++; P(); }; setTimeout(() => { window.paint = P; res(k); }, 1000); }, 3500); }));
    await page.evaluate(() => { parts.find(p => p.t === 'coil').delay = 3; });
    if (n > 3) out.push('the whole panel was repainted ' + n + ' times while the timer only counted down');
    await page.click('#tab-edit');
    // saved and opened again with its delay
    const code = await page.evaluate(async () => encodeCircuit());
    await page.selectOption('#preset', 'blank');
    await page.evaluate(async c => useCircuit(await decodeCircuit(c), ''), code);
    if ((await page.evaluate(() => JSON.stringify(circuitData()))) !== saved) out.push('the timer changed after saving and opening');
    return out;
  });

  await check('Timers in real time: they go by the clock, whatever the speed or however far behind the simulation falls; switching mid-way carries on', async page => {
    const out = [];
    await page.evaluate(() => { W = W_MIN; parts = [P('btn', 140, 160, { L: 'A', maint: true, color: '#00B050' }), P('coil', 700, 160, { L: 'T', color: '#FFDC00', delay: 4 })];
      wires = [Wr(0, 160, 100, 160), Wr(180, 160, 640, 160), Wr(760, 160, W, 160)]; normalize(); draw(); });
    await page.click('#tab-run');
    await page.click('[data-treal="1"]');
    const r = await page.evaluate(new Function(STEP + `const res = [], T = parts.find(p => p.t === 'coil');
      // real seconds (rt) and simulation seconds (sim per real second, as at a speed of 300 or as a computer that falls behind)
      const run = (rt, perSec) => { for (let i = 0; i < rt * 30; i++) { step(perSec / 30); tickRealTimers(1 / 30); } };
      press('A', true); let k = 0; while (!coilOn[T.id] && k++ < 600) step(1 / 60);
      run(3.5, 300); if (TIMER[T.id].out) res.push('at 300x, a 4 s real-time timer timed out after 3.5 real seconds');
      if (timerLeft(T) !== 1) res.push('readout should show 1 s left, shows ' + timerLeft(T));
      run(0.6, 300); if (!TIMER[T.id].out) res.push('at 300x it had not timed out after 4.1 real seconds');
      // a computer that only manages 20x: still 4 real seconds
      press('A', false); step(5); press('A', true); k = 0; while (!coilOn[T.id] && k++ < 600) step(1 / 60);
      run(3.8, 20); if (TIMER[T.id].out) res.push('timed out early when the simulation fell behind');
      run(0.3, 20); if (!TIMER[T.id].out) res.push('late when the simulation fell behind');
      // switching back to follow the speed mid-way: it carries on from what it has counted
      press('A', false); step(5); press('A', true); k = 0; while (!coilOn[T.id] && k++ < 600) step(1 / 60);
      run(2, 50); setTimersReal(false); step(1.9); if (TIMER[T.id].out) res.push('timed out early after switching to follow speed');
      step(0.3); if (!TIMER[T.id].out) res.push('did not time out after 2 real + 2 sim seconds');
      // and from following the speed to real time
      press('A', false); step(5); press('A', true); k = 0; while (!coilOn[T.id] && k++ < 600) step(1 / 60);
      step(1); setTimersReal(true); run(2.9, 100); if (TIMER[T.id].out) res.push('timed out early after switching to real time');
      run(0.2, 100); if (!TIMER[T.id].out) res.push('did not time out after 1 sim + 3 real seconds');
      return res;`));
    out.push(...r);
    await page.evaluate(() => { setSpeed(1); setTimersReal(false); });
    await page.click('#tab-edit');
    return out;
  });

  await check('At 300x what is drawn keeps up: a timer timing out mid-frame shows its contact closed and the light on (the video)', async page => {
    const out = [];
    await page.evaluate(() => { W = W_MIN; parts = [P('btn', 100, 200, { L: 'D', nc: true, maint: true, color: '#FF9600' }), P('btn', 280, 200, { L: 'A', maint: true, color: '#FF0032' }), P('con', 280, 300, { L: 'X' }), C('X', 660, 200),
        P('con', 280, 460, { L: 'X' }), P('coil', 660, 460, { L: 'T', color: '#FFFFFF', delay: 2 }), P('con', 280, 600, { L: 'T' }), P('lamp', 660, 600, { L: '', color: '#00B050' })];
      wires = [Wr(0, 200, 60, 200), Wr(140, 200, 240, 200), Wr(200, 200, 200, 300), Wr(200, 300, 240, 300), Wr(320, 200, 600, 200), Wr(320, 300, 360, 300), Wr(360, 300, 360, 200), Wr(720, 200, W, 200),
        Wr(0, 460, 240, 460), Wr(320, 460, 600, 460), Wr(720, 460, W, 460), Wr(0, 600, 240, 600), Wr(320, 600, 600, 600), Wr(720, 600, W, 600)]; normalize(); draw(); });
    for (const real of [true, false]) {
      await page.click('#tab-edit'); await page.click('#tab-run'); await page.waitForTimeout(100);
      await page.click(real ? '[data-treal="1"]' : '[data-treal="0"]'); await page.evaluate(() => setSpeed(300));
      const r = await page.evaluate(() => new Promise(res => { press('A', true);
        setTimeout(() => { const c = parts.find(p => p.t === 'con' && p.L === 'T'), L = parts.find(p => p.t === 'lamp');
          res({ state: [CON[c.id].shut, !!coilOn[L.id]], drawn: [/s$/.test(view.parts.get(c.id).k), view.parts.get(L.id).k] }); }, 3200); }));
      if (!r.state[0] || !r.state[1]) out.push((real ? 'real time' : 'follow speed') + ': the contact or light did not come on: ' + JSON.stringify(r));
      else if (!r.drawn[0] || r.drawn[1] !== '1.000') out.push((real ? 'real time' : 'follow speed') + ': on, but not drawn on screen: ' + JSON.stringify(r));
    }
    await page.evaluate(() => { setSpeed(1); setTimersReal(false); });
    await page.click('#tab-edit');
    return out;
  });

  await check('A timer\'s contacts: instantaneous ones change as soon as it is energized, timed ones once it times out; set in the contact\'s settings; saved', async page => {
    const out = [];
    // A into timer T (3 s); three contacts of T into three lights: an instant NO, a timed NO, an instant NC
    await page.evaluate(() => { W = W_MIN; parts = [P('btn', 140, 160, { L: 'A', maint: true, color: '#00B050' }), P('coil', 700, 160, { L: 'T', color: '#FFDC00', delay: 3 }),
        P('con', 300, 300, { L: 'T' }), P('lamp', 700, 300, { L: '', color: '#FF0032' }), P('con', 300, 440, { L: 'T' }), P('lamp', 700, 440, { L: '', color: '#0070C0' }),
        P('con', 300, 580, { L: 'T', nc: true }), P('lamp', 700, 580, { L: '', color: '#FF9600' })];
      wires = [Wr(0, 160, 100, 160), Wr(180, 160, 640, 160), Wr(760, 160, W, 160)];
      for (const y of [300, 440, 580]) wires.push(Wr(0, y, 260, y), Wr(340, y, 640, y), Wr(760, y, W, y));
      normalize(); fit(true); draw(); });
    // make the first and third instantaneous in their settings
    for (const y of [300, 580]) {
      await page.mouse.click(...await scr(page, 300, y)); await page.waitForTimeout(50);
      if (await page.isHidden('#c-inst-group')) { out.push('no Timed / Instant setting on a timer\'s contact'); break; }
      await page.click('[data-cinst="1"]'); await page.waitForTimeout(40);
    }
    const caps = await page.evaluate(() => parts.filter(p => p.t === 'con').map(captionOf));
    if (caps.join() !== 'T Instant Contact (NO),T Timed Contact (NO),T Instant Contact (NC)') out.push('captions: ' + caps.join(' / '));
    const badges = await page.evaluate(() => parts.filter(p => p.t === 'con').map(p => !!svg.querySelector(`[data-part="${p.id}"] path[fill="none"]`)));
    // the NEMA arrow on timed contacts only: up on an on-delay timer's (the tip above the bar)
    const arrows = await page.evaluate(() => parts.filter(p => p.t === 'con').map(p => { const v = view.parts.get(p.id); if (!v.arrow) return '-'; const b = v.arrow.getBBox(); return b.y + b.height / 2 < p.y ? 'up' : 'down'; }));
    if (arrows.join() !== '-,up,-') out.push('arrows on contacts: ' + arrows.join());
    if (badges.join() !== 'false,true,false') out.push('hourglass badges on contacts: ' + badges.join());
    const saved = await page.evaluate(() => JSON.stringify(circuitData()));
    await page.click('#tab-run');
    const r = await page.evaluate(new Function(STEP + `const res = [], T = parts.find(p => p.t === 'coil'), [l1, l2, l3] = parts.filter(p => p.t === 'lamp');
      const on = () => [l1, l2, l3].map(l => +!!coilOn[l.id]).join('');
      step(3); if (on() !== '001') res.push('before: lights ' + on() + ', expected 001');
      press('A', true); let k = 0; while (!coilOn[T.id] && k++ < 600) step(1 / 60);
      step(1.5); if (on() !== '100') res.push('1.5 s after the timer is energized: lights ' + on() + ', expected 100 (instant ones changed, timed one not yet)');
      step(3); if (on() !== '110') res.push('after it times out: lights ' + on() + ', expected 110');
      press('A', false); step(4); if (on() !== '001') res.push('after letting go: lights ' + on() + ', expected 001');
      return res;`));
    out.push(...r);
    await page.click('#tab-edit');
    const code = await page.evaluate(async () => encodeCircuit());
    await page.selectOption('#preset', 'blank');
    await page.evaluate(async c => useCircuit(await decodeCircuit(c), ''), code);
    if ((await page.evaluate(() => JSON.stringify(circuitData()))) !== saved) out.push('instant / timed changed after saving and opening');
    return out;
  });

  await check('Selecting terminals on L1 and L2: a box reaching the bars takes them in; moved with the group they slide along the bars', async page => {
    const out = [];
    await page.selectOption('#preset', 'seal');   // one rung at y = 200, with a seal-in branch below it
    const W0 = await page.evaluate(() => W);
    // a box from just beside L1, above the rung, to just beside L2, below the seal-in branch
    await mouseDrag(page, [34, 140], [W0 - 34, 340]);
    const s = await page.evaluate(() => ({ p: sel ? sel.parts.size : 0, w: sel ? sel.wires.size : 0, t: sel && sel.terms ? [...sel.terms].sort() : [], drawn: svg.querySelectorAll('rect[stroke-dasharray="7 5"][rx="7"]').length }));
    if (s.p !== 4 || s.t.join() !== 'L1:200,L2:200') out.push('box selection: ' + JSON.stringify(s));
    if (s.drawn !== 2) out.push('selected terminals not outlined: ' + s.drawn);
    // drag the whole rung down 100: the terminals go with it, along the bars
    const coil = await page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); return [p.x, p.y]; });
    await mouseDrag(page, coil, [coil[0], coil[1] + 100]);
    const r = await page.evaluate(() => ({ terms: [...barTerms().keys()].sort(), sel: sel && sel.terms ? [...sel.terms].sort() : [], iss: [...wiringIssues(network()).entries()],
      ends: wires.filter(w => w.x1 === 0 || w.x2 === 0 || w.x1 === W || w.x2 === W).map(w => [w.x1, w.y1, w.x2, w.y2]) }));
    if (r.terms.join() !== 'L1:300,L2:300') out.push('terminals after moving down: ' + r.terms.join() + ' (expected L1:300, L2:300 and nothing left behind at 200)');
    if (r.sel.join() !== 'L1:300,L2:300') out.push('the moved terminals are no longer selected: ' + r.sel.join());
    if (r.iss.length) out.push('wiring issues after the move: ' + JSON.stringify(r.iss));
    // sideways: the terminals stay on their bars (the wires to them stretch)
    await mouseDrag(page, [coil[0], coil[1] + 100], [coil[0] - 40, coil[1] + 100]);
    const r2 = await page.evaluate(() => ({ terms: [...barTerms().keys()].sort(), iss: [...wiringIssues(network()).entries()] }));
    if (r2.terms.join() !== 'L1:300,L2:300' || r2.iss.length) out.push('after moving sideways: ' + JSON.stringify(r2));
    // shift-click a terminal takes it out of the selection; it then stays put while the rest moves
    await page.keyboard.down('Shift'); await page.mouse.click(...await scr(page, 6, 300)); await page.keyboard.up('Shift');
    if (await page.evaluate(() => sel.terms.has('L1:300'))) out.push('shift-click did not take the L1 terminal out of the selection');
    const c2 = await page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); return [p.x, p.y]; });
    await mouseDrag(page, c2, [c2[0], c2[1] + 60]);
    const r3 = await page.evaluate(() => ({ terms: [...barTerms().keys()].sort(), iss: [...wiringIssues(network()).entries()] }));
    if (r3.terms.join() !== 'L1:300,L2:360' || r3.iss.length) out.push('with only L2 selected: ' + JSON.stringify(r3) + ' (expected L1 left at 300, L2 moved to 360)');
    return out;
  });

  await check('Off-delay timer: timed contacts change at once; after power is lost they hold for the delay, then go back; power back mid-way cancels it', async page => {
    const out = [];
    await page.evaluate(() => { W = W_MIN; parts = [P('btn', 140, 160, { L: 'A', maint: true, color: '#00B050' }), P('coil', 700, 160, { L: 'T', color: '#FFDC00', delay: 3 }),
        P('con', 300, 300, { L: 'T' }), P('lamp', 700, 300, { L: '', color: '#FF0032' }), P('con', 300, 440, { L: 'T', inst: true }), P('lamp', 700, 440, { L: '', color: '#0070C0' }),
        P('con', 300, 580, { L: 'T', nc: true }), P('lamp', 700, 580, { L: '', color: '#FF9600' })];
      wires = [Wr(0, 160, 100, 160), Wr(180, 160, 640, 160), Wr(760, 160, W, 160)];
      for (const y of [300, 440, 580]) wires.push(Wr(0, y, 260, y), Wr(340, y, 640, y), Wr(760, y, W, y));
      normalize(); fit(true); draw(); });
    // make it off-delay in its settings
    await page.mouse.click(...await scr(page, 700, 160)); await page.waitForTimeout(50);
    if (await page.isHidden('#o-type-group')) out.push('no on-delay / off-delay setting');
    await page.click('[data-ttype="off"]'); await page.waitForTimeout(40);
    const cap = await page.evaluate(() => captionOf(parts.find(p => p.t === 'coil')));
    if (cap !== 'T Off-Delay Timer') out.push('caption: ' + cap);
    const arrows = await page.evaluate(() => parts.filter(p => p.t === 'con').map(p => { const v = view.parts.get(p.id); if (!v.arrow) return '-'; const b = v.arrow.getBBox(); return b.y + b.height / 2 < p.y ? 'up' : 'down'; }));
    if (arrows.join() !== 'down,-,down') out.push('arrows on an off-delay timer\'s contacts: ' + arrows.join() + ' (expected down on the timed ones)');
    const saved = await page.evaluate(() => JSON.stringify(circuitData()));
    await page.click('#tab-run');
    const r = await page.evaluate(new Function(STEP + `const res = [], T = parts.find(p => p.t === 'coil'), [l1, l2, l3] = parts.filter(p => p.t === 'lamp');
      const on = () => [l1, l2, l3].map(l => +!!coilOn[l.id]).join(''), read = () => (paint(), view.parts.get(T.id).win.textContent);
      step(3); if (on() !== '001') res.push('before: lights ' + on() + ', expected 001 (timed NO, instant NO, timed NC)');
      if (read() !== '3 s') res.push('readout while off: ' + read());
      press('A', true); let k = 0; while (!coilOn[T.id] && k++ < 600) step(1 / 60);
      step(2); if (on() !== '110') res.push('energized: lights ' + on() + ', expected 110 (everything changed at once)');
      if (read() !== '3 s') res.push('readout while energized: ' + read());
      // power off: the instant one goes back at once; the timed ones hold for 3 s, counting down
      press('A', false); k = 0; while (coilOn[T.id] && k++ < 600) step(1 / 60);
      step(1.5); if (on() !== '100') res.push('1.5 s after losing power: lights ' + on() + ', expected 100');
      if (read() !== '2 s') res.push('readout 1.5 s into the off-delay: ' + read());
      step(3); if (on() !== '001') res.push('after the delay: lights ' + on() + ', expected 001');
      if (read() !== '3 s') res.push('readout after the delay: ' + read());
      // power back before the delay runs out: it stops timing, the timed contacts never go back
      press('A', true); k = 0; while (!coilOn[T.id] && k++ < 600) step(1 / 60); step(2);
      press('A', false); k = 0; while (coilOn[T.id] && k++ < 600) step(1 / 60); step(1.5);
      press('A', true); step(6);
      if (on() !== '110') res.push('power back mid-way, 6 s later: lights ' + on() + ', expected 110 (the timed contacts never went back)');
      return res;`));
    out.push(...r);
    await page.click('#tab-edit');
    const code = await page.evaluate(async () => encodeCircuit());
    await page.selectOption('#preset', 'blank');
    await page.evaluate(async c => useCircuit(await decodeCircuit(c), ''), code);
    if ((await page.evaluate(() => JSON.stringify(circuitData()))) !== saved) out.push('the off-delay timer changed after saving and opening');
    return out;
  });

  await check('Save as simulator: a page of its own that opens straight into Run mode, cannot be changed, runs, leaves the Builder alone; opens back into the Builder', async page => {
    const out = [];
    await page.selectOption('#preset', 'seal');
    await page.evaluate(() => { circuitName = 'Start Stop demo'; });
    const before = await page.evaluate(() => JSON.stringify(circuitData()));
    const html = await page.evaluate(() => simulatorHTML());
    await page.waitForTimeout(700);   // (the Builder's own autosave settles first)
    const kept = await page.evaluate(() => localStorage.getItem(AUTOSAVE_KEY));
    const f = require('path').join(require('os').tmpdir(), 'oo-sim-test.html'); require('fs').writeFileSync(f, html);
    const sim = await page.context().newPage(); const errs = []; sim.on('pageerror', e => errs.push(e.message));
    await sim.goto('file://' + f); await sim.waitForTimeout(300);
    const st = await sim.evaluate(() => ({ title: document.title, h1: document.querySelector('h1').textContent, editing, locked: document.body.classList.contains('locked'),
      shown: ['#toolbar', '#editpanel', '#save-btn', '#preset', '#tab-edit'].filter(q => { const e = document.querySelector(q); return e && e.offsetParent !== null; }),
      runbar: document.getElementById('runbar').offsetParent !== null, data: JSON.stringify(circuitData()) }));
    if (errs.length) out.push('errors in the simulator: ' + errs.join('; '));
    if (!st.locked || st.editing) out.push('the simulator is not locked in Run mode');
    if (st.shown.length) out.push('the simulator still shows: ' + st.shown.join(', '));
    if (!st.runbar) out.push('no speed controls in the simulator');
    if (st.title !== 'Start Stop demo' || !/Start Stop demo/.test(st.h1)) out.push('title: ' + st.title + ' / ' + st.h1);
    if (st.data !== before) out.push('the simulator\'s circuit is not the one saved');
    // it runs: START seals X in (pressing the button on screen)
    const a = await sim.evaluate(() => { const p = parts.find(q => q.t === 'btn' && !q.nc); const m = svg.getScreenCTM(); return [m.a * p.x + m.e, m.d * p.y + m.f]; });
    await sim.mouse.click(...a); await sim.waitForTimeout(3500);
    if (!(await sim.evaluate(() => coilOnL('X')))) out.push('clicking START in the simulator did not seal X in');
    // nothing for changing it: Delete, Ctrl+Z and Ctrl+S do nothing, dragging a part does not move it
    const coil = await sim.evaluate(() => { const p = parts.find(q => q.t === 'coil'); const m = svg.getScreenCTM(); return [m.a * p.x + m.e, m.d * p.y + m.f]; });
    await sim.mouse.move(...coil); await sim.mouse.down(); await sim.mouse.move(coil[0] + 80, coil[1] + 80, { steps: 5 }); await sim.mouse.up();
    await sim.keyboard.press('Delete'); await sim.keyboard.press('Control+z'); await sim.keyboard.press('Control+s');
    if ((await sim.evaluate(() => JSON.stringify(circuitData()))) !== before) out.push('the simulator\'s circuit could be changed');
    if (await sim.evaluate(() => document.getElementById('save-dlg').open)) out.push('Ctrl+S opened the Save box in the simulator');
    await sim.close();
    if ((await page.evaluate(() => localStorage.getItem(AUTOSAVE_KEY))) !== kept) out.push('the simulator changed the Builder\'s saved circuit');
    // the simulator file opens back into the Builder, to be changed
    await page.selectOption('#preset', 'blank');
    await page.evaluate(async html => openFile(new File([html], 'Start Stop demo (simulator).html', { type: 'text/html' }), null), html);
    if ((await page.evaluate(() => JSON.stringify(circuitData()))) !== before) out.push('opening the simulator file in the Builder did not bring the circuit back');
    return out;
  });

  await check('Labels: a button or coil can show a name instead of its letter; shared by a button drawn twice; long ones shrink to fit; saved', async page => {
    const out = [];
    await page.selectOption('#preset', 'stress');   // E is drawn twice
    const at = async (L, t) => { const p = await page.evaluate(([L, t]) => { const q = parts.find(q => q.L === L && q.t === t); return [q.x, q.y]; }, [L, t]); await page.mouse.click(...await scr(page, ...p)); await page.waitForTimeout(50); };
    await at('E', 'btn'); await page.click('#p-label'); await page.keyboard.type('Jog');
    await at('M', 'coil'); await page.click('#o-label'); await page.keyboard.type('Motor');
    await at('S', 'btn'); await page.click('#p-label'); await page.keyboard.type('EMERGENCY');   // 9 letters: kept to 8, and shrunk to fit
    await page.keyboard.press('Backspace');   // (in the box: takes a letter off, never deletes the part)
    const r = await page.evaluate(() => ({ e: parts.filter(p => p.L === 'E' && p.t === 'btn').map(p => [p.label, view.parts.get(p.id).text.textContent]),
      m: (q => [q.label, view.parts.get(q.id).text.textContent, captionOf(q)])(parts.find(p => p.L === 'M' && p.t === 'coil')),
      s: (q => [q.label, view.parts.get(q.id).text.getComputedTextLength(), parts.length])(parts.find(p => p.L === 'S' && p.t === 'btn')) }));
    if (JSON.stringify(r.e) !== '[["Jog","Jog"],["Jog","Jog"]]') out.push('the E button drawn twice: ' + JSON.stringify(r.e));
    if (r.m[0] !== 'Motor' || r.m[1] !== 'Motor' || r.m[2] !== 'M Coil') out.push('the M coil: ' + JSON.stringify(r.m) + ' (the caption keeps the letter)');
    if (r.s[0] !== 'EMERGEN' || r.s[1] > 35.5) out.push('a long label: ' + JSON.stringify(r.s) + ' (expected EMERGEN after a Backspace, no wider than the cap)');
    const saved = await page.evaluate(() => JSON.stringify(circuitData()));
    // Ctrl+Z (outside the box) takes the last label back in one go
    await page.mouse.click(...await scr(page, 440, 30)); await page.waitForTimeout(40); await page.keyboard.press('Control+z');
    if (await page.evaluate(() => parts.find(p => p.L === 'S' && p.t === 'btn').label)) out.push('Undo did not take the S label back in one go');
    await page.evaluate(async c => useCircuit(await decodeCircuit(c), ''), await page.evaluate(async s => { const d = JSON.parse(s); return 'OO0.' + btoa(JSON.stringify(d)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }, saved));
    if ((await page.evaluate(() => JSON.stringify(circuitData()))) !== saved) out.push('labels changed after saving and opening');
    return out;
  });

  await check('Selector switch: drawn in several rungs, each closed in its own positions; clicking turns it (all drawings together); settings; saved', async page => {
    const out = [];
    await page.evaluate(() => { W = W_MIN; parts = [P('sel', 200, 160, { L: 'S', n: 3, pos: 1, closedIn: [0], color: '#0070C0' }), P('lamp', 700, 160, { L: '', color: '#FF0032' }),
        P('sel', 200, 320, { L: 'S', n: 3, pos: 1, closedIn: [2], color: '#0070C0' }), P('lamp', 700, 320, { L: '', color: '#00B050' }),
        P('sel', 200, 480, { L: 'S', n: 3, pos: 1, closedIn: [1, 2], color: '#0070C0' }), P('lamp', 700, 480, { L: '', color: '#FF9600' })];
      wires = []; for (const y of [160, 320, 480]) wires.push(Wr(0, y, 140, y), Wr(260, y, 640, y), Wr(760, y, W, y));
      normalize(); fit(true); draw(); });
    if ((await issuesNow(page)).length) out.push('the selector circuit is not connected: ' + JSON.stringify(await issuesNow(page)));
    // its settings: names for the positions, and which positions the selected drawing is closed in
    await page.mouse.click(...await scr(page, 200, 160)); await page.waitForTimeout(50);
    if (await page.isHidden('#props-sel')) out.push('no settings for a selector switch');
    await page.click('#s-names'); await page.keyboard.type('hand off auto'); await page.waitForTimeout(30);
    const nm = await page.evaluate(() => parts.filter(p => p.t === 'sel').map(p => (p.names || []).join('/')));
    if (nm.join() !== 'HAND/OFF/AUTO,HAND/OFF/AUTO,HAND/OFF/AUTO') out.push('names are not shared by every drawing: ' + nm.join());
    const marks = await page.evaluate(() => parts.filter(p => p.t === 'sel').map(p => [...view.parts.get(p.id).marks.querySelectorAll('text')].map(t => (t.dataset.closed ? 'u' : '-') + (t.getAttribute('fill') === p.color ? 'c' : '-')).join(' ')));
    if (marks.join() !== 'u- -c --,-- -c u-,-- uc u-') out.push('position names (underlined: closed in; coloured: turned to): ' + marks.join() + ', expected u- -c --,-- -c u-,-- uc u-');
    const links = await page.evaluate(() => [...document.querySelectorAll('path[stroke-dasharray="7 5"]')].filter(e => e.getAttribute('stroke') === '#0070C0').length);
    if (links !== 2) out.push('dashed lines joining the three drawings of the switch: ' + links + ', expected 2');
    // the names and numbers stay inside the body, clear of the knob and handle
    const clear = await page.evaluate(() => { const bad = []; for (const p of parts.filter(p => p.t === 'sel')) { const v = view.parts.get(p.id);
      for (const t of v.marks.querySelectorAll('text')) { const b = t.getBBox(); if (b.x < p.x - SEL_BOX / 2 + 2 || b.x + b.width > p.x + SEL_BOX / 2 - 2 || b.y < p.y - SEL_BOX / 2 + 2) bad.push(t.textContent + ' outside');
        const cx = Math.max(b.x, Math.min(v.kx, b.x + b.width)), cy = Math.max(b.y, Math.min(v.ky, b.y + b.height)); if (Math.hypot(cx - v.kx, cy - v.ky) < 17) bad.push(t.textContent + ' on the knob'); } } return bad; });
    if (clear.length) out.push('position names touching: ' + clear.join(', '));
    const saved = await page.evaluate(() => JSON.stringify(circuitData()));
    await page.click('#tab-run');
    const on = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').map(l => +!!coilOn[l.id]).join(''));
    const settle = () => page.evaluate(new Function(STEP + 'step(2);'));
    await settle(); if (await on() !== '001') out.push('in OFF: lights ' + await on() + ', expected 001');
    // press the left half of the middle drawing: the whole switch turns left, to HAND
    await page.mouse.click(...await scr(page, 185, 330)); await settle();
    if (await on() !== '100') out.push('turned to HAND: lights ' + await on() + ', expected 100');
    const ang = await page.evaluate(() => (paint(), parts).filter(p => p.t === 'sel').map(p => view.parts.get(p.id).handle.getAttribute('transform').match(/rotate\(([-\d.]+)/)[1]).join());
    if (ang !== '-45.00,-45.00,-45.00') out.push('handles after turning to HAND: ' + ang);
    await page.mouse.click(...await scr(page, 185, 170)); await settle();   // (already all the way left)
    if (await on() !== '100') out.push('turning past the end changed it: ' + await on());
    await page.mouse.click(...await scr(page, 215, 490)); await page.mouse.click(...await scr(page, 215, 490)); await settle();
    if (await on() !== '011') out.push('turned to AUTO: lights ' + await on() + ', expected 011');
    // pressing a position's name turns it straight there (from AUTO to HAND, past OFF)
    await page.mouse.click(...await scr(page, 177, 149)); await settle();
    if (await on() !== '100') out.push('pressing HAND while in AUTO: lights ' + await on() + ', expected 100');
    await page.click('#tab-edit'); await page.waitForTimeout(40);
    await page.evaluate(async c => useCircuit(await decodeCircuit(c), ''), await page.evaluate(async s => 'OO0.' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), saved));
    if ((await page.evaluate(() => JSON.stringify(circuitData()))) !== saved) out.push('the selector changed after saving and opening');
    return out;
  });

  await check('Sliding a run that goes to L1 or L2 leaves no wire along the bar (no stray screw terminals); old circuits with one are cleaned up', async page => {
    const out = [];
    await page.selectOption('#preset', 'io');
    await mouseDrag(page, [60, 200], [60, 260]);
    const r = await page.evaluate(() => ({ along: wires.filter(w => w.x1 === w.x2 && (w.x1 === 0 || w.x1 === W)).length, feeds: network().feeds.map(f => f.t + f.y).sort().join() }));
    if (r.along) out.push(r.along + ' wire(s) left lying along a bar');
    if (r.feeds !== 'L1260,L2200') out.push('screw terminals: ' + r.feeds + ', expected L1260,L2200');
    await page.evaluate(() => { wires.push(Wr(0, 400, 0, 480)); normalize(); draw(); });
    if (await page.evaluate(() => wires.some(w => w.x1 === 0 && w.x2 === 0))) out.push('a wire along L1 from an older circuit was kept');
    return out;
  });

  await check('Dashed link lines between drawings of one button or switch can be dragged out of the way, saved, put back with a double-click, undone', async page => {
    const out = [];
    await page.evaluate(() => { W = W_MIN; parts = [P('sel', 200, 160, { L: 'S', n: 3, pos: 1, closedIn: [0], color: '#0070C0' }), P('lamp', 700, 160, { L: '', color: '#FF0032' }),
        P('sel', 420, 400, { L: 'S', n: 3, pos: 1, closedIn: [2], color: '#0070C0' }), P('lamp', 700, 400, { L: '', color: '#00B050' })];
      wires = [Wr(0, 160, 140, 160), Wr(260, 160, 640, 160), Wr(760, 160, W, 160), Wr(0, 400, 360, 400), Wr(480, 400, 640, 400), Wr(760, 400, W, 400)];
      normalize(); fit(true); draw(); });
    const line = () => page.evaluate(() => document.querySelector('.link-hit').getAttribute('d'));
    const d0 = await line();
    // grab the line where it crosses over, and pull it down 40 and left 100
    const m = d0.match(/V(\d+)H420/); const cy = +m[1];
    await mouseDrag(page, [300, cy], [200, cy + 40]);
    const lk = await page.evaluate(() => parts[2].lk);
    if (JSON.stringify(lk) !== '[-100,40]') out.push('after dragging, the line is moved by ' + JSON.stringify(lk) + ', expected [-100,40]');
    if (await page.evaluate(() => sel && sel.parts.size)) out.push('dragging the line selected a part');
    const saved = await page.evaluate(() => JSON.stringify(circuitData()));
    await page.evaluate(async c => useCircuit(await decodeCircuit(c), ''), 'OO0.' + Buffer.from(saved).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    if (JSON.stringify(await page.evaluate(() => parts[2].lk)) !== '[-100,40]') out.push('the moved line was not kept when saved and opened');
    const d1 = await line();
    const pts = await scr(page, 200, cy + 40); await page.mouse.dblclick(...pts); await page.waitForTimeout(60);
    if (await page.evaluate(() => parts[2].lk)) out.push('a double-click did not put the line back');
    if (await line() !== d0) out.push('put back, the line is not where it was: ' + await line());
    await page.keyboard.press('Control+z'); await page.waitForTimeout(40);
    if (await line() !== d1) out.push('undo did not bring the moved line back');
    return out;
  });

  await check('Parallel branches wired into the middle of a run join it (the last branch does not hop over it)', async page => {
    const out = [];
    // A, then B / C / D in parallel, into X: the branches' uprights are drawn last, top one then bottom one
    await page.evaluate(() => { W = W_MIN; parts = [P('btn', 120, 300, { L: 'A', maint: true, color: '#FF0032' }), P('btn', 360, 140, { L: 'B', maint: true, color: '#0070C0' }),
        P('btn', 360, 300, { L: 'C', maint: true, color: '#00B050' }), P('btn', 360, 460, { L: 'D', maint: true, color: '#FF9600' }), P('coil', 700, 300, { L: 'X', color: '#FFDC00' })];
      wires = [Wr(0, 300, 80, 300), Wr(160, 300, 320, 300), Wr(400, 300, 640, 300), Wr(760, 300, W, 300), Wr(240, 140, 320, 140), Wr(400, 140, 480, 140), Wr(240, 460, 320, 460), Wr(400, 460, 480, 460)];
      normalize(); draw();
      for (const s of [[240, 140, 240, 300], [480, 140, 480, 300], [240, 300, 240, 460], [480, 300, 480, 460]]) addWire([s]);
      fit(true); draw(); });
    const r = await page.evaluate(() => ({ hops: network().hops.length, issues: [...wiringIssues(network()).values()] }));
    if (r.hops) out.push(r.hops + ' wire(s) hop over the run instead of joining it');
    if (r.issues.length) out.push('wiring problems: ' + r.issues.join('; '));
    await page.click('#tab-run');
    const x = await page.evaluate(new Function(STEP + `press('A', true); press('D', true); step(4); return !!coilOn[parts.find(p => p.t === 'coil').id];`));
    if (!x) out.push('A and D pressed: X did not pick up (the D branch is not connected)');
    return out;
  });

  await check('Editing wires: parts drag their wires, wire ends pull off, runs slide, undo', async page => {
    const out = [];
    await page.selectOption('#preset', 'io');
    const start = JSON.stringify(await wiresNow(page));
    await mouseDrag(page, [220, 200], [220, 320]);
    if ((await issuesNow(page)).length) out.push('wires came loose when A moved');
    await mouseDrag(page, [220, 320], [220, 200]);
    if (JSON.stringify(await wiresNow(page)) !== start) out.push('moving A back did not straighten its wires');
    await mouseDrag(page, [260, 200], [400, 320]);
    if (!(await issuesNow(page)).length) out.push('pulling the wire off A did not disconnect it');
    await page.click('#undo');
    if (JSON.stringify(await wiresNow(page)) !== start) out.push('undo did not restore the wire');
    await mouseDrag(page, [450, 200], [450, 280]);
    if ((await issuesNow(page)).length) out.push('sliding a wire disconnected it');
    return out;
  });

  await check('Selection box and moving a group keeps it connected', async page => {
    const out = [];
    await page.selectOption('#preset', 'io');
    await mouseDrag(page, [140, 120], [660, 260]);
    const n = await page.evaluate(() => sel ? sel.parts.size + sel.wires.size : 0);
    if (n !== 2) out.push('box selected ' + n + ' items, expected 2');
    await mouseDrag(page, [220, 200], [220, 300]);
    if ((await issuesNow(page)).length) out.push('group move disconnected something: ' + JSON.stringify(await issuesNow(page)));
    return out;
  });

  await check('Zoom and pan: Ctrl + wheel zooms, wheel and Shift + wheel move, Fit resets', async page => {
    const out = [];
    const c = await scr(page, 700, 200); await page.mouse.move(...c);
    await page.keyboard.down('Control'); await page.mouse.wheel(0, -400); await page.keyboard.up('Control'); await page.waitForTimeout(80);
    const z = await page.evaluate(() => ({ ...cam }));
    if (!(z.z > 1.2)) out.push('Ctrl + wheel did not zoom in');
    if (z.fit) out.push('still fitted after zooming');
    await page.mouse.wheel(0, 200); await page.waitForTimeout(80);
    if (!((await page.evaluate(() => cam.y)) > z.y)) out.push('wheel did not move down');
    await page.keyboard.down('Shift'); await page.mouse.wheel(0, -300); await page.keyboard.up('Shift'); await page.waitForTimeout(80);
    if (!((await page.evaluate(() => cam.x)) < z.x)) out.push('Shift + wheel did not move left');
    await page.click('#zoom-fit');
    if (!(await page.evaluate(() => cam.fit && Math.abs(cam.z - zMin()) < 1e-9))) out.push('Fit did not show the whole circuit');
    return out;
  });

  await check('The panel spans the page and a circuit opens fitted (the whole circuit in view)', async page => {
    const out = [];
    for (const [w, h] of [[1600, 900], [1100, 800]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150);
      await page.selectOption('#preset', 'three'); await page.waitForTimeout(150);
      const r = await page.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(), vb = svg.viewBox.baseVal;
        return { stageW: st.width, x: vb.x, y: vb.y, w: vb.width, h: vb.height, H: canvasH(), W }; });
      if (r.stageW < w - 40) out.push(`${w}px window: panel only ${Math.round(r.stageW)}px wide`);
      if (r.x > 0.5 || r.y > 0.5 || r.x + r.w < r.W - 0.5 || r.y + r.h < r.H - 0.5) out.push(`${w}px window: whole circuit not in view`);
    }
    return out;
  });

  await check('A tall circuit on a wide screen fills the panel edge to edge: L2 moves out, its wires stretch, files stay the same', async page => {
    const out = [];
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.selectOption('#preset', 'three'); await page.waitForTimeout(150);
    const look = () => page.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(), m = svg.getScreenCTM();
      return { left: m.e + 0 * m.a, right: m.e + W * m.a, sl: st.left, sr: st.right, top: m.f, bottom: m.f + canvasH() * m.d, sb: st.bottom, W, issues: wiringIssues(network()).size, data: JSON.stringify(circuitData()) }; });
    let v = await look();
    if (v.W <= 880) out.push('the sheet did not widen (W ' + v.W + ')');
    if (Math.abs(v.left - v.sl) > 4 || Math.abs(v.right - v.sr) > 4) out.push('the sheet does not reach both edges of the panel: ' + [v.left, v.right, v.sl, v.sr].map(Math.round).join(' '));
    if (v.issues) out.push('L2 wires came loose when the sheet widened');
    const saved = v.data;
    await page.click('#tab-run'); await page.waitForTimeout(150);
    v = await look();
    if (Math.abs(v.left - v.sl) > 4 || Math.abs(v.right - v.sr) > 4) out.push('in Run, the sheet does not reach both edges');
    const on = await page.evaluate(new Function(STEP + `step(2); press('B', true); step(8); return !!coilOn[parts.find(p => p.t === 'coil').id];`));
    if (!on) out.push('X did not pick up on the widened sheet');
    await page.click('#tab-edit');
    await page.setViewportSize({ width: 1000, height: 900 }); await page.waitForTimeout(250);
    v = await look();
    if (v.issues) out.push('L2 wires came loose when the window narrowed');
    if (v.data !== saved) out.push('the saved circuit changed with the window size');
    await page.click('#undo'); await page.waitForTimeout(100);
    return out;
  });

  await check('Moving the L1 and L2 bars sets the circuit length: wires follow, it is kept when the window changes and when saved', async page => {
    const out = [];
    await page.selectOption('#preset', 'andor'); await page.waitForTimeout(100);
    const info = () => page.evaluate(() => ({ W, WU: W_USER, issues: wiringIssues(network()).size, A: parts.find(p => p.L === 'A').x }));
    const drag = async (x0, x1) => { const A = await scr(page, x0, 36), B = await scr(page, x1, 36); await page.mouse.move(...A); await page.mouse.down(); await page.mouse.move(...B, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(120); };
    let v = await info();
    // like L1, L2 shows a ghost bar while dragging and only moves when let go
    { const to = v.W - 60, A = await scr(page, v.W - 7, 36), B = await scr(page, to - 7, 36); await page.mouse.move(...A); await page.mouse.down(); await page.mouse.move(...B, { steps: 8 });
      const mid = await page.evaluate(() => ({ W, ghost: preview && preview.bar, bar: BAR }));
      if (mid.W !== v.W) out.push('L2 moved before it was let go');
      if (mid.ghost !== to - mid.bar) out.push('no ghost bar where L2 will go (' + mid.ghost + ', expected ' + (to - mid.bar) + ')');
      await page.mouse.up(); await page.waitForTimeout(120);
      if ((await info()).W !== to) out.push('L2 did not move to where it was let go (W ' + (await info()).W + ')'); }
    // held past the edge of the panel, each bar keeps moving outward until it is let go
    for (const which of ['L2', 'L1']) {
      const w0 = (await info()).W, st = await page.locator('#stage').boundingBox();
      const A = await scr(page, which === 'L2' ? w0 - 7 : 7, 36);
      await page.mouse.move(...A); await page.mouse.down();
      await page.mouse.move(which === 'L2' ? st.x + st.width + 40 : st.x - 40 + 30, A[1], { steps: 6 });
      if (which === 'L1') await page.mouse.move(Math.max(1, st.x - 10), A[1], { steps: 3 });
      await page.waitForTimeout(900);
      await page.mouse.up(); await page.waitForTimeout(150);
      const w1 = (await info()).W;
      if (!(w1 > w0 + 200)) out.push('holding ' + which + ' past the edge did not keep it moving outward (' + w0 + ' to ' + w1 + ')');
      if ((await info()).issues) out.push('wires came loose running ' + which + ' outward');
    }
    await page.click('#undo'); await page.click('#undo');
    v = await info();
    await drag(v.W - 7, 600);
    v = await info();
    if (v.W !== 800 || v.WU !== 800) out.push('L2 did not stop just past the X coil (W ' + v.W + ')');
    if (v.issues) out.push('wires came loose moving L2');
    await drag(7, 60);
    const v2 = await info();
    if (v2.W !== 740 || v2.A !== 80) out.push('moving L1 60 to the right did not shorten the circuit by 60 (W ' + v2.W + ', A at ' + v2.A + ')');
    if (v2.issues) out.push('wires came loose moving L1');
    await page.setViewportSize({ width: 1000, height: 900 }); await page.waitForTimeout(200);
    if ((await info()).W !== 740) out.push('the window size changed the circuit length');
    const saved = await page.evaluate(() => circuitData());
    if (!saved.fw || saved.w !== 740) out.push('the length was not saved with the circuit');
    await page.evaluate(d => useCircuit(readCircuit(d), ''), saved); await page.waitForTimeout(100);
    if ((await info()).W !== 740) out.push('opening it again did not keep the length');
    const H = await scr(page, 740 - 7, 36); await page.mouse.dblclick(...H); await page.waitForTimeout(150);
    if ((await info()).WU !== null) out.push('double-clicking the handle did not go back to fitting the screen');
    await page.click('#tab-run');
    const on = await page.evaluate(new Function(STEP + `step(2); press('A', true); press('B', true); step(6); return parts.filter(p => p.t === 'coil').every(p => coilOn[p.id]);`));
    if (!on) out.push('the circuit does not work after moving the bars');
    return out;
  });

  await check('Fits a phone screen without sideways scrolling', async page => {
    await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(150);
    const out = [];
    for (const tab of ['#tab-edit', '#tab-run']) {
      await page.click(tab); await page.waitForTimeout(100);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      if (w > 390) out.push(tab + ': page is ' + w + 'px wide');
    }
    return out;
  });

  await check('Saving and opening: a circuit code brings back exactly the same circuit', async page => {
    const out = [];
    await page.selectOption('#preset', 'three');
    const before = await page.evaluate(() => JSON.stringify(circuitData()));
    await page.click('#save-btn'); await page.waitForTimeout(150);
    const code = await page.inputValue('#save-code');
    if (!/^OO[01]\./.test(code)) out.push('code looks wrong: ' + code.slice(0, 20));
    await page.keyboard.press('Escape');
    await page.selectOption('#preset', 'blank');
    await page.click('#open-btn'); await page.fill('#open-code', code); await page.click('#open-code-btn'); await page.waitForTimeout(150);
    const after = await page.evaluate(() => JSON.stringify(circuitData()));
    if (after !== before) out.push('circuit changed after a round trip through a code');
    if (await page.evaluate(() => document.getElementById('open-dlg').open)) out.push('Open dialog did not close');
    // a damaged code gives a readable message and changes nothing
    await page.click('#open-btn'); await page.fill('#open-code', code.slice(0, 30)); await page.click('#open-code-btn'); await page.waitForTimeout(100);
    const msg = await page.textContent('#open-msg');
    if (!msg || !/incomplete|changed|circuit/i.test(msg)) out.push('no message for a damaged code: ' + msg);
    if ((await page.evaluate(() => JSON.stringify(circuitData()))) !== before) out.push('a damaged code changed the circuit');
    return out;
  });

  await check('Saving and opening (browsers that save a new copy): a saved file opens again with its name', async page => {
    const out = [];
    await page.evaluate(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker; window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; });
    await page.selectOption('#preset', 'andor');
    const before = await page.evaluate(() => JSON.stringify({ p: circuitData().parts, w: circuitData().wires }));
    await page.click('#save-btn'); await page.fill('#save-name', 'Test circuit');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#save-file')]);
    if (dl.suggestedFilename() !== 'Test circuit.json') out.push('file name was ' + dl.suggestedFilename());
    const file = await dl.path();
    await page.keyboard.press('Escape');
    await page.selectOption('#preset', 'blank');
    await page.click('#open-btn'); await page.setInputFiles('#open-input', file); await page.waitForTimeout(200);
    const after = await page.evaluate(() => JSON.stringify({ p: circuitData().parts, w: circuitData().wires }));
    if (after !== before) out.push('circuit changed after saving and opening a file');
    if ((await page.evaluate(() => circuitName)) !== 'Test circuit') out.push('name not kept');
    return out;
  });

  await check('Save writes back into the file that was opened (browsers that allow it)', async page => {
    // stand in for the browser's file picker: files live in window.__files, keyed by name
    await page.evaluate(() => {
      window.__files = { 'Lab 3.json': '' }; window.__pickSave = 'New copy.json';
      const handle = name => ({ kind: 'file', name, getFile: async () => new File([window.__files[name]], name),
        createWritable: async () => { let buf = ''; return { write: async d => { buf += d; }, close: async () => { window.__files[name] = buf; } }; } });
      window.showOpenFilePicker = async () => [handle('Lab 3.json')];
      window.showSaveFilePicker = async () => { window.__files[window.__pickSave] = ''; return handle(window.__pickSave); };
    });
    const out = [];
    // put a circuit into "Lab 3.json", then open it
    await page.selectOption('#preset', 'andor');
    await page.evaluate(() => { window.__files['Lab 3.json'] = JSON.stringify(circuitData()); });
    await page.click('#open-btn'); await page.click('#open-file'); await page.waitForTimeout(150);
    if ((await page.textContent('#file-label')) !== 'Lab 3.json') out.push('file name not shown after opening: ' + await page.textContent('#file-label'));
    // change it, then Save: no dialog, written back into the same file
    await mouseDrag(page, [140, 200], [140, 320]);
    if (!/^● /.test(await page.textContent('#file-label'))) out.push('unsaved changes not shown');
    await page.click('#save-btn'); await page.waitForTimeout(150);
    if (await page.evaluate(() => document.getElementById('save-dlg').open)) out.push('Save opened the dialog instead of saving');
    const written = await page.evaluate(() => JSON.parse(window.__files['Lab 3.json']).parts.find(p => p[3] === 'A'));
    if (!written || written[2] !== 320) out.push('the change was not written into Lab 3.json');
    if (/^● /.test(await page.textContent('#file-label'))) out.push('still shows unsaved changes after saving');
    // Ctrl+S saves into the same file too
    await mouseDrag(page, [140, 320], [140, 200]);
    await page.keyboard.press('Control+s'); await page.waitForTimeout(150);
    if (await page.evaluate(() => JSON.parse(window.__files['Lab 3.json']).parts.find(p => p[3] === 'A')[2]) !== 200) out.push('Ctrl+S did not save into the file');
    // Save as a new file leaves the original alone and switches to the new one
    await page.click('#save-more'); await page.click('#save-file'); await page.waitForTimeout(150);
    if (!(await page.evaluate(() => window.__files['New copy.json']))) out.push('Save as a new file did not write the new file');
    if ((await page.textContent('#file-label')) !== 'New copy.json') out.push('did not switch to the new file');
    // a ready-made circuit is not tied to any file
    await page.selectOption('#preset', 'or');
    if (!(await page.evaluate(() => document.getElementById('file-label').hidden))) out.push('a ready-made circuit still shows a file name');
    return out;
  });

  await check('The circuit is still there after the page is reloaded', async page => {
    const out = [];
    await page.selectOption('#preset', 'three');
    await mouseDrag(page, [340, 340], [340, 360]);   // change something
    const before = await page.evaluate(() => JSON.stringify(circuitData()));
    await page.waitForTimeout(600);
    await page.reload(); await page.waitForTimeout(300);
    const after = await page.evaluate(() => JSON.stringify(circuitData()));
    if (after !== before) out.push('circuit not restored after reload');
    return out;
  });

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})();
