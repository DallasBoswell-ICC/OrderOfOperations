/* Automatic checks for the Circuit Builder.

   Run after every change:   node tests/run-tests.js        (build first: python3 build.py)

   Each check opens the built page (dist/Circuit_Builder.html) in a headless browser and either drives the
   simulation directly, in fast time, or uses the mouse the way a student would. The page's own functions are
   all visible to the checks, so they can set up circuits and read back exactly what is lit and when.
   Needs Node.js and Playwright (npm install playwright, or set NODE_PATH to where it is installed). */
const path = require('path');
const { chromium } = require('playwright');

const PAGE = 'file://' + path.resolve(__dirname, '..', 'dist', ...(process.argv.includes('--demo') ? ['demo'] : []), 'Circuit_Builder.html');   // (--demo: the demo build)
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
  // (the kinds older checks name, as they were placed then: a pushbutton was maintained; a contact, instantaneous)
  kind = { 'btn-no': 'btn-no-mnt', 'btn-nc': 'btn-nc-mnt', 'con-no': 'con-no-i', 'con-nc': 'con-nc-i' }[kind] || kind;
  // parts sit on the ribbon's Home tab, most in a menu there: open it first (a part's own tab may be showing)
  if (!(await page.locator(`[data-part="${kind}"]`).isVisible())) {
    if (!(await page.locator('#toolbar').isVisible())) await page.click('#rt-home');
    const menu = await page.evaluate(k => { const m = document.querySelector(`[data-part="${k}"]`).closest('.tp-menu'); return m ? m.id : null; }, kind);
    if (menu && !(await page.locator(`[data-part="${kind}"]`).isVisible())) await page.click(`[aria-controls="${menu}"]`);
  }
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
    W_USER = W = 1280;   // (as wide as it was drawn: the timing checked below depends on how long the wire back to L2 is)
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
    await page.locator('#speed-slider').fill('0'); if ((await page.evaluate(() => speed)) !== 0.1 || (await page.inputValue('#speed-out')) !== '0.1×') out.push('slider at the left is not 0.1×');
    await page.click('[data-speed="2"]');
    if (Math.abs((await page.locator('#speed-slider').inputValue()) - 37.4) > 1) out.push('a preset did not move the slider');
    await page.locator('#speed-slider').fill('100');
    if ((await page.evaluate(() => speed)) !== 300 || (await page.inputValue('#speed-out')) !== '300×') out.push('slider at the right is not 300×');
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
    await toolbarDrop(page, 'con-no-t', 300, 320); await toolbarDrop(page, 'lamp', 700, 320);
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
    if (r.m[0] !== 'Motor' || r.m[1] !== 'Motor' || r.m[2] !== 'Motor Coil') out.push('the M coil: ' + JSON.stringify(r.m) + ' (a label of its own names it on the caption too)');
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

  await check('The ribbon: a placed part leaves Home open, a part picked on the panel opens its gold tab; Simulation while running; undo and redo; folding it away gives the panel more room and is remembered', async page => {
    const out = [];
    await page.selectOption('#preset', 'io');
    const tabs = () => page.evaluate(() => ['rt-home', 'rt-part', 'rt-run'].map(id => { const b = document.getElementById(id); return b.hidden ? '-' : b.getAttribute('aria-pressed') === 'true' ? 'ON' : 'off'; }).join(' '));
    if (await tabs() !== 'ON - -') out.push('at the start: ' + await tabs());
    await toolbarDrop(page, 'coil', 500, 400);
    if (await tabs() !== 'ON off -') out.push('a part just placed: tabs ' + await tabs() + ', expected Home open and the part\'s tab beside it');
    if (await page.evaluate(() => document.getElementById('rt-part').textContent) !== 'Y Coil') out.push('the part tab is named ' + await page.evaluate(() => document.getElementById('rt-part').textContent));
    await page.mouse.click(...await scr(page, 220, 200)); await page.waitForTimeout(60);
    if (await tabs() !== 'off ON -' || await page.isHidden('#props-btn')) out.push('a part picked on the panel: tabs ' + await tabs());
    await page.mouse.click(...await scr(page, 450, 560)); await page.waitForTimeout(60);
    if (await tabs() !== 'ON - -') out.push('nothing selected: tabs ' + await tabs());
    // undo takes the new coil away, redo puts it back (also Ctrl+Y)
    const n = () => page.evaluate(() => parts.length);
    const n0 = await n(); await page.click('#undo'); const n1 = await n(); await page.click('#redo'); const n2 = await n();
    await page.keyboard.press('Control+z'); const n3 = await n(); await page.keyboard.press('Control+y'); const n4 = await n();
    if ([n0, n1, n2, n3, n4].join() !== [n0, n0 - 1, n0, n0 - 1, n0].join()) out.push('undo / redo: parts ' + [n0, n1, n2, n3, n4].join(' → '));
    if (!(await page.evaluate(() => document.getElementById('redo').disabled))) out.push('Redo is not greyed out with nothing to redo');
    await page.click('#tab-run'); await page.waitForTimeout(60);
    if (await tabs() !== '- - ON' || await page.isHidden('#speed-slider')) out.push('running: tabs ' + await tabs());
    await page.click('#tab-edit'); await page.waitForTimeout(60);
    // fold it away: the panel gets taller; pressing a tab opens it over the panel; it stays folded after a reload
    const h0 = await page.evaluate(() => document.getElementById('stage').clientHeight);
    await page.click('#ribbon-toggle'); await page.waitForTimeout(100);
    const h1 = await page.evaluate(() => document.getElementById('stage').clientHeight);
    if (!(h1 > h0 + 60)) out.push('folding the ribbon away did not give the panel more room: ' + h0 + ' → ' + h1);
    if (await page.isVisible('#out-btn')) out.push('folded, the ribbon still shows');
    await page.click('#rt-home'); await page.waitForTimeout(60);
    if (!(await page.isVisible('#out-btn'))) out.push('folded, pressing Home did not open the ribbon');
    if (await page.evaluate(() => document.getElementById('stage').clientHeight) !== h1) out.push('opening the folded ribbon moved the panel');
    await page.mouse.click(...await scr(page, 450, 560)); await page.waitForTimeout(60);
    if (await page.isVisible('#out-btn')) out.push('pressing the panel did not fold the ribbon away again');
    await page.reload(); await page.waitForTimeout(300);
    if (await page.isVisible('#out-btn')) out.push('the ribbon did not stay folded after a reload');
    await page.click('#ribbon-toggle'); await page.waitForTimeout(60);
    if (!(await page.isVisible('#out-btn'))) out.push('the ribbon did not open again');
    return out;
  });

  await check('Loops of wire (parallel loops nested and crossing the run): all lit while fed; let go, every wire goes dark as the end of the current passes it, nothing left lit behind it', async page => {
    await loadCircuit(page, `W_USER = W = 1000;
      parts = [P('btn', 120, 300, { L: 'A', maint: true, color: '#EC008C' }), P('lamp', 900, 300, { L: '', color: '#7030A0' })];
      wires = [Wr(0,300,80,300), Wr(160,300,840,300), Wr(960,300,W,300),
        Wr(200,100,800,100), Wr(200,100,200,300), Wr(200,300,200,500), Wr(800,100,800,300), Wr(800,300,800,500), Wr(200,500,800,500),
        Wr(240,140,680,140), Wr(240,140,240,300), Wr(680,140,680,300), Wr(320,180,620,180), Wr(320,180,320,300), Wr(620,180,620,300),
        Wr(280,460,740,460), Wr(280,300,280,460), Wr(740,300,740,460), Wr(380,420,580,420), Wr(380,300,380,420), Wr(580,300,580,420)];`);
    if ((await issuesNow(page)).length) return ['circuit not wired: ' + JSON.stringify(await issuesNow(page))];
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [];
      step(2); press('A', true); step(10);
      const unlit = NET.nodes.map((n, k) => [n, k]).filter(([n, k]) => n.k !== 'L1' && n.k !== 'L2' && colAt(k, simT) === null);
      if (unlit.length) out.push(unlit.length + ' points stay dark while A is pressed, such as (' + unlit[0][0].x + ', ' + unlit[0][0].y + ')');
      // the latest the end of the current can be passing each point: along every path the colour can take
      const A = parts.find(p => p.L === 'A'), t0 = simT, latest = new Map();
      for (const path of PATHS) { let d = 0, on = false;
        for (const ln of path) { if (ln.e.part === A) on = true; if (!on) continue; if (ln.e.part !== A && !onward(ln, 'A')) break;
          const ns = ln.e.kind === 'seg' ? ln.chain : [ln.to];
          ns.forEach((n, k) => { const dd = ln.e.kind === 'seg' ? d + ln.tk[k] : d + ln.delay; if (dd > (latest.get(n) || 0)) latest.set(n, dd); });
          d += ln.delay; } }
      press('A', false);
      const darkAt = new Map(), relit = new Set();
      for (let i = 0; i < 600; i++) { step(1 / 60); NET.nodes.forEach((_, k) => { const c = colAt(k, simT); if (!darkAt.has(k) && c === null) darkAt.set(k, simT - t0); else if (darkAt.has(k) && c !== null) relit.add(k); }); }
      let late = 0, early = 0, ex = '';
      for (const [n, dd] of latest) { const da = darkAt.get(n);
        if (da === undefined || da > dd + 0.15) { late++; ex = ex || '(' + NET.nodes[n].x + ', ' + NET.nodes[n].y + ') still lit ' + (da === undefined ? 'at the end' : (da - dd).toFixed(2) + ' s after the end of the current passed'); }
        else if (da < dd - 0.12) early++; }
      if (late) out.push(late + ' points stay lit after the end of the current has passed them, such as ' + ex);
      if (early) out.push(early + ' points go dark before the end of the current reaches them');
      if (relit.size) out.push(relit.size + ' points light up again after going dark');
      return out;`));
  });

  await check('Pop-up descriptions show in full, inside the window, for ribbon buttons and run controls', async page => {
    const out = [];
    const tip = async sel => { await page.hover(sel); await page.waitForTimeout(500);
      return page.evaluate(s => { const t = document.querySelector('.tipbox'), el = document.querySelector(s); if (t.hidden) return 'not shown';
        const r = t.getBoundingClientRect();
        if (t.textContent !== el.dataset.tip) return 'wrong text';
        if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return 'outside the window';
        // (it floats on its own above everything, so nothing it sits in can cut it off)
        return t.parentElement === document.body && getComputedStyle(t).position === 'fixed' && r.height > 20 ? 'ok' : 'inside something that can cut it off'; }, sel); };
    for (const sel of ['#out-btn', '#ct-btn', '#ribbon-toggle', '#redo', '#save-btn']) { const r = await tip(sel); if (r !== 'ok') out.push(sel + ': ' + r); }
    await page.click('#tab-run'); await page.waitForTimeout(100);
    for (const sel of ['#speed-slider', '#reset-btn']) { const r = await tip(sel); if (r !== 'ok') out.push(sel + ': ' + r); }
    return out;
  });

  await check('Operator station: every button and selector once, in ladder order; pressing there presses it in the circuit; drag, fold, hide; only while running', async page => {
    const out = [];
    await page.evaluate(() => { W = W_MIN; parts = [P('btn', 160, 160, { L: 'A', maint: false, color: '#00B050', label: 'START' }), P('coil', 700, 160, { L: 'X', color: '#FFDC00' }),
        P('btn', 160, 320, { L: 'A', maint: false, color: '#00B050', label: 'START' }), P('sel', 400, 320, { L: 'S', n: 3, pos: 1, closedIn: [0], color: '#0070C0', names: ['HAND', 'OFF', 'AUTO'] }), P('lamp', 700, 320, { L: '', color: '#FF0032' }),
        P('btn', 160, 480, { L: 'B', nc: true, maint: true, color: '#FF0032' }), P('lamp', 700, 480, { L: '', color: '#0070C0' })];
      wires = [Wr(0, 160, 120, 160), Wr(200, 160, 640, 160), Wr(760, 160, W, 160), Wr(0, 320, 120, 320), Wr(200, 320, 340, 320), Wr(460, 320, 640, 320), Wr(760, 320, W, 320),
        Wr(0, 480, 120, 480), Wr(200, 480, 640, 480), Wr(760, 480, W, 480)];
      normalize(); fit(true); draw(); });
    if (await page.isVisible('#station')) out.push('the station shows while building');
    await page.click('#tab-run'); await page.waitForTimeout(100);
    if (await page.isVisible('#station')) out.push('the station shows before it has been turned on');
    await page.click('#st-toggle'); await page.waitForTimeout(60);
    if (!(await page.isVisible('#station'))) return out.concat('no operator station after turning it on');
    const plates = await page.$$eval('#st-grid .st-plate', es => es.map(e => e.textContent).join(','));
    if (plates !== 'START,HAND/OFF/AUTO,B') out.push('station operators: ' + plates + ' (expected START,HAND/OFF/AUTO,B: each once, top of the ladder first)');
    const g = await page.$$('#st-grid g.dev');
    // momentary A: pressed on the station, it is pressed in the circuit (both drawings), and X picks up
    await g[0].click(); await page.waitForTimeout(50);
    const r = await page.evaluate(() => ({ down: !!down.A, caps: parts.filter(p => p.L === 'A').map(p => view.parts.get(p.id).press.getAttribute('transform') ? 'in' : 'out') }));
    if (!r.down) out.push('pressing START on the station did not press A');
    if (r.caps.join() !== 'in,in') out.push('A on the circuit did not show pressed: ' + r.caps.join());
    // the selector: press AUTO on it
    const auto = await page.$$('#st-grid [data-pos="2"]'); await auto[0].click(); await page.waitForTimeout(60);
    if (await page.evaluate(() => selPos('S')) !== 2) out.push('pressing AUTO on the station did not turn the switch');
    await page.evaluate(() => paint());
    const ang = await page.evaluate(() => { const p = parts.find(q => q.t === 'sel'); return view.parts.get(p.id).handle.getAttribute('transform'); });
    // drag it by its title bar; it stays inside the window
    const h = await page.locator('#st-head').boundingBox();
    await page.mouse.move(h.x + 40, h.y + 10); await page.mouse.down(); await page.mouse.move(h.x - 220, h.y + 250, { steps: 6 }); await page.mouse.up();
    const h2 = await page.locator('#st-head').boundingBox();
    if (Math.abs(h2.x - h.x + 260) > 2 || Math.abs(h2.y - h.y - 240) > 2) out.push('dragging moved it by ' + Math.round(h2.x - h.x) + ', ' + Math.round(h2.y - h.y) + ' (expected -260, 240)');
    await page.mouse.move(h2.x + 40, h2.y + 10); await page.mouse.down(); await page.mouse.move(h2.x + 4000, h2.y + 4000, { steps: 4 }); await page.mouse.up();
    const b = await page.locator('#station').boundingBox(), vp = page.viewportSize();
    if (b.x + b.width > vp.width + 1 || b.y > vp.height - 20) out.push('dragged off the window: ' + JSON.stringify(b));
    // fold it, hide it from the ribbon, and it comes back as it was after a reload
    await page.click('#st-min'); if (await page.isVisible('#st-grid')) out.push('folding did not fold it');
    await page.click('#st-min'); if (!(await page.isVisible('#st-grid'))) out.push('it did not open again');
    await page.click('#st-toggle'); if (await page.isVisible('#station')) out.push('the Station button did not hide it');
    await page.reload(); await page.waitForTimeout(300); await page.click('#tab-run'); await page.waitForTimeout(100);
    if (await page.isVisible('#station')) out.push('hidden, it came back after a reload');
    await page.click('#st-toggle'); if (!(await page.isVisible('#station'))) out.push('the Station button did not show it again');
    await page.click('#tab-edit'); if (await page.isVisible('#station')) out.push('the station stays while building');
    return out;
  });

  await check('Columns view: a long circuit in side-by-side columns, broken only between rungs, all in view; it runs and its buttons work in any column', async page => {
    const out = [], json = require('fs').readFileSync(require('path').join(__dirname, 'traffic-man-auto.json'), 'utf8');
    await page.evaluate(j => useCircuit(readCircuit(JSON.parse(j)), ''), json);
    await page.click('#tab-run'); await page.click('[data-view="columns"]'); await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const L = LAYOUT; if (!L) return { none: true };
      const bands = L.bands, cross = [];
      for (const w of wires) if (w.x1 === w.x2) for (const b of bands.slice(1)) if (Math.min(w.y1, w.y2) < b.y0 && Math.max(w.y1, w.y2) > b.y0) cross.push('wire at x ' + w.x1);
      for (const p of parts) for (const b of bands.slice(1)) if (p.y - BODYH(p.t) / 2 < b.y0 && p.y + BODYH(p.t) / 2 > b.y0) cross.push(captionOf(p));
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      return { k: bands.length, cross, all: vb[2] >= L.w - 1 && vb[3] >= L.h - 1 };
    });
    if (r.none) return ['no columns'];
    if (r.k < 2) out.push('a long circuit stayed in one column');
    if (r.cross.length) out.push('a column breaks through ' + r.cross.join(', '));
    if (!r.all) out.push('the columns do not all fit in view');
    // press ON (B) in the circuit: X (MCR) picks up; the E START button, in a later column, can be pressed with the mouse
    await page.evaluate(new Function(STEP + `step(3); press('B', true); step(5);`));   // (ON is held: its off-delay timer T-MCR times out with it held)
    if (!(await page.evaluate(() => !!coilOn[parts.find(p => p.t === 'coil' && p.L === 'X').id]))) out.push('pressing ON did not pick up MCR');
    const e = await page.evaluate(() => { const p = parts.filter(q => q.t === 'btn' && q.L === 'E')[0]; const r = view.parts.get(p.id).fill.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.click(...e); await page.waitForTimeout(30);
    if (!(await page.evaluate(() => !!down.E || simT > 0 && Object.keys(autoRel).includes('E')))) out.push('clicking START in its column did not press it');
    await page.click('[data-view="normal"]'); await page.waitForTimeout(100);
    if (await page.evaluate(() => !!LAYOUT)) out.push('Normal did not go back to one column');
    return out;
  });

  await check('Split view: two panes, each scrolled and zoomed on its own, both showing the current; buttons work in either; full screen hides the title bar and folds the ribbon, Esc leaves it', async page => {
    const out = [], json = require('fs').readFileSync(require('path').join(__dirname, 'traffic-man-auto.json'), 'utf8');
    await page.evaluate(j => useCircuit(readCircuit(JSON.parse(j)), ''), json);
    await page.click('#tab-run'); await page.click('[data-view="split"]'); await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({ p2: !pane2.hidden, w1: document.getElementById('pane1').clientWidth, w2: pane2.clientWidth, y1: cam.y, y2: Number(svg2.getAttribute('viewBox').split(' ')[1]), views: VIEWS.length }));
    if (!r.p2 || r.views !== 2) return ['no second pane'];
    if (Math.abs(r.w1 - r.w2) > 2) out.push('the panes are not the same size: ' + r.w1 + ' and ' + r.w2);
    if (!(r.y2 > r.y1 + 500)) out.push('the second pane does not start on the bottom of the circuit: ' + r.y1 + ', ' + r.y2);
    // scrolling the second pane leaves the first where it was
    const b2 = await page.locator('#svg2').boundingBox();
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.mouse.wheel(0, -400); await page.waitForTimeout(60);
    const r2 = await page.evaluate(() => ({ y1: cam.y, y2: Number(svg2.getAttribute('viewBox').split(' ')[1]) }));
    if (r2.y1 !== r.y1 || !(r2.y2 < r.y2)) out.push('scrolling the second pane: ' + JSON.stringify([r, r2]));
    // the current shows in both panes: press ON with the mouse in the first pane; the wire after it lights in both
    const on = await page.evaluate(() => { const p = mainBtn('B'); const r = view.parts.get(p.id).fill.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.click(...on); await page.evaluate(new Function(STEP + 'step(3); paint();'));
    const lit = await page.evaluate(() => [view, view2].map(V => V.runs.filter(it => it.g.childElementCount).length));
    if (!(lit[0] > 0 && lit[0] === lit[1])) out.push('lit wires in the two panes: ' + lit.join(' and '));
    // full screen
    await page.click('#fs-toggle'); await page.waitForTimeout(150);
    if (await page.isVisible('.titlebar') || await page.isVisible('#speed-slider')) out.push('full screen still shows the title bar or the open ribbon');
    const h = await page.evaluate(() => document.getElementById('stage').clientHeight);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    if (!(await page.isVisible('.titlebar'))) out.push('Esc did not leave full screen');
    if (!(h > await page.evaluate(() => document.getElementById('stage').clientHeight) + 60)) out.push('full screen did not give the panel more room');
    await page.click('[data-view="normal"]'); await page.click('#tab-edit');
    if (await page.isVisible('#pane2')) out.push('the second pane stays while building');
    return out;
  });

  await check('Rung numbers and cross-references: every rung numbered; a coil lists its contacts\' rungs (NC underlined), a contact its coil\'s; pressing one goes there; can be turned off', async page => {
    const out = [], json = require('fs').readFileSync(require('path').join(__dirname, 'traffic-man-auto.json'), 'utf8');
    await page.evaluate(j => useCircuit(readCircuit(JSON.parse(j)), ''), json);
    const r = await page.evaluate(() => {
      const nos = [...document.querySelectorAll('#svg .rungno')].map(g => g.dataset.rung);
      const capOf = L => { const p = parts.find(q => q.t === 'coil' && q.L === L); return view.parts.get(p.id).cap; };
      const x = capOf('X'), xs = [...x.querySelectorAll('.xref')].map(t => t.textContent + (t.dataset.nc ? '_' : ''));
      const y = [...capOf('Y').querySelectorAll('.xref')].map(t => t.textContent + (t.dataset.nc ? '_' : '')), ylines = capOf('Y').parentNode.querySelectorAll('.xline').length;
      const c = parts.find(q => q.t === 'con' && q.L === 'U' && q.y > 1700), cr = [...view.parts.get(c.id).cap.parentNode.querySelectorAll('text.xref')].map(t => t.textContent);
      return { nos, n: rungYs(network()).length, x: x.textContent, xs, y, ylines, cr, u: String(rungAt(rungYs(network()), parts.find(q => q.t === 'coil' && q.L === 'U').y)) };
    });
    if (r.nos.length !== r.n || r.nos.join() !== Array.from({ length: r.n }, (_, i) => i + 1).join()) out.push('rung numbers: ' + r.nos.join());
    if (r.xs.join() !== '2,4') out.push('the X coil (MCR) lists its contacts on lines ' + r.xs.join() + ' (expected 2,4: line 2 for its seal-in branch, line 4 for the X contact)');
    if (!r.y.some(s => s.endsWith('_')) || r.ylines !== r.y.filter(s => s.endsWith('_')).length) out.push('the Y coil does not underline its normally closed contacts: ' + r.y.join() + ' (' + r.ylines + ' lines)');
    if (r.cr.join() !== r.u) out.push('a U contact shows its coil on line ' + r.cr.join() + ' (the U timer is on line ' + r.u + ')');
    // press a number: the view goes to that rung
    await page.click('#tab-run'); await page.waitForTimeout(100);
    await page.evaluate(() => { cam = { x: 0, y: 0, z: 1, fit: false }; applyCam(); });
    await page.evaluate(() => { const p = parts.find(q => q.t === 'con' && q.L === 'U' && q.y > 1700); view.parts.get(p.id).cap.parentNode.querySelector('text.xref').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    const yy = await page.evaluate(() => { const u = parts.find(q => q.t === 'coil' && q.L === 'U'); return [cam.y, cam.y + viewH(), u.y]; });
    if (!(yy[2] > yy[0] && yy[2] < yy[1])) out.push('pressing the U timer\'s number did not bring its line into view: ' + JSON.stringify(yy));
    await page.click('[data-show="rungs"] >> nth=-1'); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.querySelectorAll('#svg .rungno, #svg .xref').length)) out.push('turned off, the rung numbers still show');
    await page.click('[data-show="rungs"] >> nth=-1');
    return out;
  });

  await check('Overview strip: shows the whole of a long circuit beside the panel, with the part in view boxed; pressing it moves the view; not when everything fits, nor in columns', async page => {
    const out = [], json = require('fs').readFileSync(require('path').join(__dirname, 'traffic-man-auto.json'), 'utf8');
    await page.selectOption('#preset', 'io'); await page.waitForTimeout(60);
    if (await page.isVisible('#overview')) out.push('the strip shows for a circuit that fits');
    await page.evaluate(j => useCircuit(readCircuit(JSON.parse(j)), ''), json);
    await page.click('#tab-run'); await page.waitForTimeout(100);
    await page.evaluate(() => { cam = { x: 0, y: 0, z: 1, fit: false }; applyCam(); });
    if (!(await page.isVisible('#overview'))) return out.concat('no strip for a long circuit');
    const ov = await page.locator('#overview').boundingBox(), sv = await page.locator('#svg').boundingBox();
    if (sv.x + sv.width > ov.x + 1) out.push('the strip covers the panel instead of sitting beside it');
    const box0 = await page.locator('#ov-view').boundingBox();
    await page.mouse.click(ov.x + ov.width / 2, ov.y + ov.height - 30); await page.waitForTimeout(60);
    const r = await page.evaluate(() => ({ y: cam.y, bottom: canvasH() - viewH() }));
    if (r.y < r.bottom - 300) out.push('pressing the bottom of the strip did not move the view to the bottom: ' + JSON.stringify(r));
    const box1 = await page.locator('#ov-view').boundingBox();
    if (!(box1.y > box0.y + 20)) out.push('the box on the strip did not follow the view');
    await page.click('[data-view="columns"]'); await page.waitForTimeout(100);
    if (await page.isVisible('#overview')) out.push('the strip shows in columns view');
    await page.click('[data-view="normal"]'); await page.waitForTimeout(100);
    await page.click('[data-show="overview"] >> nth=-1'); await page.waitForTimeout(60);
    if (await page.isVisible('#overview')) out.push('turned off, the strip still shows');
    await page.click('[data-show="overview"] >> nth=-1');
    return out;
  });

  await check('Supply boxes: a circuit powered by L1 Supply and L2 Return boxes instead of the bars (wired from their left, right or bottom) runs; switching back and forth, saving and undo keep it', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.click('#pw-btn'); await page.waitForTimeout(40);
    if (await page.isVisible('[data-part="src-l1"]')) out.push('the supply boxes are offered while the circuit has bars');
    await page.click('[data-power="boxes"]'); await page.waitForTimeout(60);
    if (await page.evaluate(() => document.getElementById('pw-menu').hidden)) out.push('choosing Boxes closed the Power menu');
    if (!(await page.isVisible('[data-part="src-l1"]'))) return out.concat('no supply boxes to place after choosing Boxes');
    if (await page.evaluate(() => [...svg.querySelectorAll('rect')].some(r => r.getAttribute('fill') === 'url(#gBar)'))) out.push('the bars still show with Boxes');
    // place the boxes from the ribbon, then wire a start/stop circuit to them (the second rung fed from the L1 box's bottom)
    await toolbarDrop(page, 'src-l1', 80, 160); await toolbarDrop(page, 'src-l2', 860, 160);
    const kinds = await page.evaluate(() => parts.map(p => p.t).join());
    if (kinds !== 'l1,l2') out.push('placed from the ribbon: ' + kinds);
    await page.evaluate(() => {
      parts.push(P('btn', 240, 160, { L: 'A', nc: true, maint: false, color: '#FF0032' }), P('btn', 400, 160, { L: 'B', maint: false, color: '#00B050' }), P('coil', 680, 160, { L: 'M', color: '#FFDC00' }),
        P('con', 400, 280, { L: 'M' }), P('con', 240, 420, { L: 'M' }), P('lamp', 680, 420, { L: '', color: '#00B050' }), P('l2', 860, 420, { L: '' }));
      wires.push(Wr(120,160,200,160), Wr(280,160,360,160), Wr(440,160,620,160), Wr(740,160,820,160), Wr(320,160,320,280), Wr(320,280,360,280), Wr(440,280,480,280), Wr(480,280,480,160),
        Wr(80,200,80,420), Wr(80,420,200,420), Wr(280,420,620,420), Wr(740,420,820,420), Wr(0, 600, 300, 600));   // (the last one runs to the sheet's edge: no longer a bar)
      normalize(); draw(); });
    const iss = await page.evaluate(() => [...wiringIssues(network()).keys()].length);
    if (iss) out.push(iss + ' wiring problem(s)');
    if (await page.evaluate(() => network().feeds.some(f => f.bar))) out.push('a wire at the edge of the sheet is still fed as if there were a bar');
    const saved = await page.evaluate(() => JSON.stringify(circuitData()));
    if (!saved.includes('"pw":"boxes"')) out.push('the circuit was saved without its power setting');
    await page.click('#tab-run');
    const r = await page.evaluate(new Function(STEP + `const on = () => parts.filter(p => LOADT(p.t)).map(p => coilOn[p.id] ? 1 : 0).join('');
      step(2); const a = on(); press('B', true); step(3); press('B', false); step(3); const b = on(); press('A', true); step(3); press('A', false); step(2); return [a, b, on()];`));
    if (r.join() !== '00,11,00') out.push('running (M coil, light): before ' + r[0] + ', after START ' + r[1] + ', after STOP ' + r[2] + ' (expected 00, 11, 00)');
    await page.click('#tab-edit');
    // back to bars, undo, and open the saved circuit again
    if (await page.evaluate(() => document.getElementById('pw-menu').hidden)) await page.click('#pw-btn');
    await page.click('[data-power="bars"]'); await page.waitForTimeout(40);
    if (!(await page.evaluate(() => barsOn()))) out.push('Bars did not switch back');
    await page.click('#undo'); await page.waitForTimeout(40);
    if (await page.evaluate(() => POWER) !== 'boxes') out.push('undo did not go back to boxes');
    await page.evaluate(async c => useCircuit(await decodeCircuit(c), ''), 'OO0.' + Buffer.from(saved).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
    if ((await page.evaluate(() => JSON.stringify(circuitData()))) !== saved) out.push('the circuit changed after saving and opening');
    // a box wired to nothing is flagged
    await page.evaluate(() => { parts.push(P('l1', 500, 700, { L: '' })); draw(); });
    if (!(await page.evaluate(() => [...wiringIssues(network()).values()].includes('Not wired to anything')))) out.push('a box wired to nothing is not flagged');
    return out;
  });

  await check('Supply boxes: Run keeps the Build view, and the return current lights the L2 lead', async page => {
    const out = [];
    await page.evaluate(() => {
      loadPreset('blank'); document.querySelector('[data-power="boxes"]').click();
      parts.push(P('l1', 80, 40, { L: '' }), P('l2', 800, 40, { L: '' }));
      for (let i = 0; i < 12; i++) { const y = 160 + i * 140; parts.push(P('btn', 240, y, { L: 'ABCDEFGHJKLM'[i], maint: true, color: '#FF0032' }), P('coil', 600, y, { L: 'NPQRSTUVWXYZ'[i], color: '#FFDC00' }));
        wires.push(Wr(80, y, 200, y), Wr(280, y, 540, y), Wr(660, y, 800, y)); }
      wires.push(Wr(80, 80, 80, 1700), Wr(800, 80, 800, 1700)); normalize(); draw();
    });
    const before = await page.evaluate(() => svg.getAttribute('viewBox'));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300));
    const after = await page.evaluate(() => svg.getAttribute('viewBox'));
    if (before !== after) out.push(`the view changed on entering Run: ${before} -> ${after}`);
    await page.evaluate(() => { press('A', true); });
    await page.waitForTimeout(1200);
    const lit = await page.evaluate(() => view.parts.get(parts.find(p => p.t === 'l2').id).src.some(q => q.c && q.c !== 'transparent'));
    if (!lit) out.push('the L2 box lead stayed dark');
    await page.click('#tab-edit'); await page.evaluate(() => setSpeed(1));
    return out;
  });
  await check('Loads in series share the voltage: coils stay out, lights dim, the colour drops; the source colour is kept with the circuit', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => {
      parts.push(P('btn', 200, 120, { L: 'A', maint: true, color: '#FF0032' }), P('coil', 420, 120, { L: 'CR', color: '#FFDC00' }), P('lamp', 640, 120, {}));
      wires.push(Wr(0, 120, 160, 120), Wr(240, 120, 380, 120), Wr(460, 120, 600, 120), Wr(680, 120, W, 120));
      parts.push(P('lamp', 300, 280, {}), P('lamp', 500, 280, {}), P('lamp', 700, 280, {}));
      wires.push(Wr(0, 280, 260, 280), Wr(340, 280, 460, 280), Wr(540, 280, 660, 280), Wr(740, 280, W, 280));
      normalize(); draw();
    });
    const notes = await page.evaluate(() => [...svg.querySelectorAll('text')].map(t => t.textContent).filter(s => /In series|Not wired/.test(s)));
    if (notes.filter(s => s === 'In series: 60 V').length !== 2 || notes.filter(s => s === 'In series: 40 V').length !== 3 || notes.some(s => /Not wired/.test(s))) out.push('notes: ' + notes.join(', '));
    await page.click('#pw-btn'); await page.click('[data-src="#3FB8FF"]');
    const saved = await page.evaluate(() => JSON.stringify(circuitData()));
    if (!saved.includes('"sc":"#3FB8FF"')) out.push('the source colour is not saved');
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300));
    await page.waitForTimeout(800);
    const r1 = await page.evaluate(() => {
      const L = t => parts.filter(p => p.t === t), mid = (x, y) => { const k = NET.nodes.findIndex(n => n.x === x && n.y === y); return k < 0 ? null : colAt(k, simT); };
      return { lamps: L('lamp').slice(1).map(p => [!!coilOn[p.id], +p._sh.toFixed(3)]), src: mid(100, 280), between: mid(600, 280) };
    });
    if (JSON.stringify(r1.lamps) !== '[[true,0.333],[true,0.333],[true,0.333]]') out.push('three lights in series: ' + JSON.stringify(r1.lamps));
    if (!/^#3FB8FF$|63, ?184, ?255/i.test(r1.src || '')) out.push('straight from L1 the wire is ' + r1.src + ', not the source colour');
    if (!r1.between || r1.between === r1.src) out.push('the colour does not drop across the lights: ' + r1.between);
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(800);
    const r2 = await page.evaluate(() => { const c = parts.find(p => p.L === 'CR'), l = parts.find(p => p.t === 'lamp'); return [!!coilOn[c.id], !!COND[c.id], !!coilOn[l.id], +l._sh.toFixed(3)]; });
    if (JSON.stringify(r2) !== '[false,true,true,0.5]') out.push('coil and light in series (coil in, current through, light lit, its share): ' + JSON.stringify(r2));
    await page.evaluate(() => press('A', false)); await page.click('#tab-edit'); await page.evaluate(() => setSpeed(1));
    return out;
  });
  await check('Solenoids: placed numbered, pull in like a coil (not in series), saved and read back, renumbered when pasted', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => {
      parts.push(P('btn', 200, 120, { L: 'A', maint: true, color: '#FF0032' }), newPart('sol', 520, 120));
      wires.push(Wr(0, 120, 160, 120), Wr(240, 120, 460, 120), Wr(580, 120, W, 120));
      parts.push(P('btn', 200, 300, { L: 'B', maint: true, color: '#0070C0' }), P('coil', 420, 300, { L: 'X', color: '#FFDC00' }), newPart('sol', 640, 300));
      wires.push(Wr(0, 300, 160, 300), Wr(240, 300, 360, 300), Wr(480, 300, 580, 300), Wr(700, 300, W, 300));
      normalize(); draw();
    });
    const caps = await page.evaluate(() => [...svg.querySelectorAll('text.cap')].map(t => t.textContent).filter(s => /SOL/.test(s)).sort().join());
    if (caps !== 'SOL1 Solenoid,SOL2 Solenoid') out.push('captions: ' + caps);
    const back = await page.evaluate(() => { const d = JSON.stringify(circuitData()), c = readCircuit(JSON.parse(d)); return c.parts.filter(p => p.t === 'sol').map(p => p.L + p.color).join(); });
    if (back !== '1#00D2BE,2#00D2BE') out.push('read back: ' + back);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300));
    await page.evaluate(() => { press('A', true); press('B', true); }); await page.waitForTimeout(1200);
    const st = await page.evaluate(() => [solOn(1), solOn(2), !!COND[parts.find(p => p.t === 'sol' && p.L === '2').id]]);
    if (JSON.stringify(st) !== '[true,false,true]') out.push('SOL1 in, SOL2 out with current through it: ' + JSON.stringify(st));
    await page.evaluate(() => { press('A', false); press('B', false); }); await page.click('#tab-edit'); await page.evaluate(() => setSpeed(1));
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => solOn(1));
    if (after) out.push('SOL1 stayed in after Build');
    const pasted = await page.evaluate(() => { sel = { parts: new Set(parts.filter(p => p.t === 'sol').map(p => p.id)), wires: new Set() }; copySel(); pasteClip(); return parts.filter(p => p.t === 'sol').map(p => p.L).join(); });
    if (pasted !== '1,2,3,4') out.push('after pasting both: ' + pasted);
    return out;
  });
  await check('A pilot light built into a pushbutton is joined to it by a dashed line; a light of its own is not', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const n = await page.evaluate(() => {
      parts.push(P('btn', 200, 120, { L: 'A', maint: true, color: '#FF0032' }), P('lamp', 560, 300, { L: 'A', color: '#00B050' }), P('lamp', 560, 470, { L: '', color: '#00B050' }));
      normalize(); draw();
      return [...svg.querySelectorAll('path[stroke-dasharray="7 5"]')].map(p => p.getAttribute('stroke'));
    });
    if (JSON.stringify(n) !== '["#FF0032"]') out.push('dashed lines: ' + JSON.stringify(n));
    const back = await page.evaluate(() => { const l = parts.find(p => p.t === 'lamp' && p.L === 'A'); l.ls = ['r', 'l']; draw();
      const handles = svg.querySelectorAll('.link-end').length, c = readCircuit(JSON.parse(JSON.stringify(circuitData())));
      return [handles, JSON.stringify(c.parts.find(p => p.t === 'lamp' && p.L === 'A').ls)]; });
    if (back[0] !== 2 || back[1] !== '["r","l"]') out.push('ends moved to the sides (handles, read back): ' + JSON.stringify(back));
    return out;
  });
  await check('Supply boxes: no switch is taken as wired backward by a way round through the outputs and the shared return wire (Proto Drill Station)', async page => {
    const out = [];
    const txt = require('fs').readFileSync(require('path').join(__dirname, 'proto-drill-station.json'), 'utf8');
    await page.evaluate(t => { useCircuit(readCircuit(JSON.parse(t))); draw(); }, txt);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300));
    await page.evaluate(() => press('B', true)); await page.waitForTimeout(1500);
    const lit = await page.evaluate(() => { const n = NET.nodes.findIndex(q => q.x === 200 && q.y === 1300); return colAt(n, simT); });
    if (!lit) out.push('the left wire is dark down at the MAN section');
    await page.evaluate(() => press('D', true)); await page.waitForTimeout(1500);
    const st = await page.evaluate(() => { const on = L => parts.filter(p => (p.t === 'coil' || p.t === 'lamp') && p.L === L).map(p => !!coilOn[p.id]); return { E: on('E'), D: on('D') }; });
    if (!st.E.every(Boolean) || !st.D.length || !st.D.every(Boolean)) out.push('pressing MAN: ' + JSON.stringify(st));
    await page.evaluate(() => { press('D', false); press('B', false); }); await page.click('#tab-edit'); await page.evaluate(() => setSpeed(1));
    return out;
  });
  await check('Continuations: the second placed pairs with the first; current goes in at one and out of the other; a lone one is flagged; saved, read back, renumbered as a pair when pasted', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const nums = await page.evaluate(() => {
      parts.push(P('btn', 200, 120, { L: 'A', maint: true, color: '#FF0032' }), newPart('jmp', 460, 120));
      wires.push(Wr(0, 120, 160, 120), Wr(240, 120, 420, 120));
      parts.push(newPart('jmp', 200, 340), P('coil', 560, 300, { L: 'X', color: '#FFDC00' }));
      wires.push(Wr(240, 340, 300, 340), Wr(300, 340, 300, 300), Wr(300, 300, 500, 300), Wr(620, 300, W, 300));
      normalize(); draw();
      return parts.filter(isJmp).map(p => p.L).join() + '|' + [...wiringIssues(network()).values()].filter(v => typeof v === 'string').join();
    });
    if (nums !== '1,1|') out.push('numbers and warnings: ' + nums);
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'jmp').map(p => p.L).join());
    if (back !== '1,1') out.push('read back: ' + back);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300));
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(1200);
    if (!(await page.evaluate(() => !!coilOn[parts.find(p => p.L === 'X').id]))) out.push('X did not pick up through the continuation');
    await page.evaluate(() => press('A', false)); await page.waitForTimeout(1200);
    if (await page.evaluate(() => !!coilOn[parts.find(p => p.L === 'X').id])) out.push('X stayed in after A was let go');
    await page.click('#tab-edit'); await page.evaluate(() => setSpeed(1));
    const lone = await page.evaluate(() => { parts.push(newPart('jmp', 800, 500)); wires.push(Wr(800, 540, 800, 600)); normalize(); return [parts[parts.length - 1].L, wiringIssues(network()).get(parts[parts.length - 1].id)]; });
    if (lone[0] !== '2' || lone[1] !== 'No other continuation 2') out.push('a third one: ' + JSON.stringify(lone));
    const pasted = await page.evaluate(() => { sel = { parts: new Set(parts.filter(p => isJmp(p) && p.L === '1').map(p => p.id)), wires: new Set() }; copySel(); pasteClip(); return parts.filter(isJmp).map(p => p.L).join(); });
    if (pasted !== '1,1,2,3,3') out.push('after pasting the pair: ' + pasted);
    const rot = await page.evaluate(() => { const p = parts.find(q => isJmp(q) && q.L === '2'); sel = { parts: new Set([p.id]), wires: new Set() }; draw();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' })); const t1 = terms(p).map(t => t.join(',')).join(' ');
      return [p.rot, t1, readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.find(q => q.t === 'jmp' && q.L === '2').rot]; });
    if (JSON.stringify(rot) !== '[1,"800,460 800,540 760,500 840,500",1]') out.push('turned with R (rot, connection points, read back): ' + JSON.stringify(rot));
    return out;
  });
  await check('Quality of life: zoom far out with room to build; Ctrl+click adds to the selection; paste lands where you are looking; a typed speed; pressing outside a bar starts a selection box; one change to several parts alike', async page => {
    const out = [];
    await page.selectOption('#preset', 'seal'); await page.waitForTimeout(100);
    // zoom right out: well past the old 25%, and the grid grows to fill the view
    const z = await page.evaluate(() => { for (let i = 0; i < 40; i++) zoomCentre(0.8); draw(); const g = svg.querySelector('rect[fill="url(#gridMajor)"]'); return [cam.z, +g.getAttribute('y') + +g.getAttribute('height'), cam.y + viewH()]; });
    if (!(z[0] <= 0.06) || z[1] < z[2] - 1) out.push('zoomed out (zoom, grid bottom, view bottom): ' + JSON.stringify(z));
    // zooming out at the pointer keeps the point under it where it is (no drifting to one side)
    const drift = await page.evaluate(() => { fitView(); fit(true); draw(); const px = 300, py = 200; for (let i = 0; i < 12; i++) zoomAt(0.8, px, py); const a = [cam.x, cam.z]; zoomAt(0.8, px, py); const fx0 = (px - a[0]) / (camW() / a[1]), fx1 = (px - cam.x) / viewW(); return Math.abs(fx1 - fx0); });
    if (drift > 0.01) out.push('zooming out drifts sideways: ' + drift.toFixed(3));
    for (let i = 0; i < 40; i++) await page.evaluate(() => zoomCentre(0.8));
    const pan = await page.evaluate(() => { const x0 = cam.x; svg.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, shiftKey: true, bubbles: true, cancelable: true })); const x1 = cam.x; svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -900, shiftKey: true, bubbles: true, cancelable: true })); return [x0, x1, cam.x]; });
    if (!(pan[1] > pan[0] && pan[2] < pan[1])) out.push('Shift + wheel when zoomed out (x before, after right, after left): ' + JSON.stringify(pan.map(Math.round)));
    // pressing outside the L1 bar, beside the sheet: a selection box, not a wire
    const nw0 = await page.evaluate(() => wires.length);
    const box = await page.evaluate(() => { const m = svg.getScreenCTM(), q = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; const r = p.matrixTransform(m); return [r.x, r.y]; }; return [q(-200, 20), q(W + 100, canvasH())]; });
    await page.mouse.move(...box[0]); await page.mouse.down(); await page.mouse.move(...box[1], { steps: 5 }); await page.mouse.up();
    const after = await page.evaluate(() => [wires.length, sel ? sel.parts.size : 0]);
    if (after[0] !== nw0 || after[1] !== await page.evaluate(() => parts.length)) out.push('dragging from outside L1 (wires before/after, parts selected): ' + JSON.stringify([nw0, ...after]));
    await page.evaluate(() => { fitView(); fit(true); sel = null; draw(); });
    // Ctrl+click: two parts selected; then a change made to both
    const cons = await page.evaluate(() => { const m = svg.getScreenCTM(); return parts.filter(p => p.t === 'btn').slice(0, 2).map(p => { const q = svg.createSVGPoint(); q.x = p.x; q.y = p.y; const r = q.matrixTransform(m); return [r.x, r.y, p.id]; }); });
    await page.mouse.click(cons[0][0], cons[0][1]); await page.keyboard.down('Control'); await page.mouse.click(cons[1][0], cons[1][1]); await page.keyboard.up('Control');
    const n2 = await page.evaluate(() => sel ? [...sel.parts] : []);
    if (n2.length !== 2) out.push('Ctrl+click selected ' + JSON.stringify(n2));
    await page.click('#rt-part'); await page.waitForTimeout(50);
    await page.evaluate(() => document.querySelector('#p-colour .sw[title="Violet"]').click());
    const cols = await page.evaluate(() => parts.filter(p => sel.parts.has(p.id)).map(p => p.color));
    if (!cols.every(c => c === '#7030A0')) out.push('colour set on both: ' + JSON.stringify(cols));
    if (!(await page.isHidden('#p-letter'))) out.push('the letter box shows for several buttons');
    // paste: near where you are looking, not below everything
    const pz = await page.evaluate(() => { copySel(); parts.push(P('coil', 500, 1600, { L: 'Q', color: '#FFDC00' })); const bottom = Math.max(...parts.map(p => p.y)); pastePt = { x: 300, y: 800 }; pasteClip(); const ys = parts.filter(p => sel.parts.has(p.id)).map(p => p.y); return [Math.min(...ys), bottom]; });
    if (!(pz[0] >= 760 && pz[0] < 1000)) out.push('paste aimed at y 800 landed at ' + pz[0] + ' (bottom of the circuit ' + pz[1] + ')');
    const clash = await page.evaluate(() => { const mine = parts.filter(p => sel.parts.has(p.id)); return mine.some(p => parts.some(o => !sel.parts.has(o.id) && Math.abs(o.x - p.x) < 80 && Math.abs(o.y - p.y) < 80)); });
    if (clash) out.push('the paste landed on top of other parts');
    // a typed speed
    await page.click('#tab-run'); await page.fill('#speed-out', '7.5'); await page.press('#speed-out', 'Enter');
    const sp = await page.evaluate(() => [speed, document.getElementById('speed-out').value]);
    if (sp[0] !== 7.5 || sp[1] !== '7.5×') out.push('typed 7.5: ' + JSON.stringify(sp));
    await page.fill('#speed-out', '5000'); await page.press('#speed-out', 'Enter');
    if ((await page.evaluate(() => speed)) !== 300) out.push('typed 5000 should give the top speed, 300×');
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    // a long stretch never slows down before its far end
    const prof = await page.evaluate(() => { const st = stretch(3000), r = [0, 500, 1500, 2900, 2999].map(s => st.rel(s)); return r; });
    if (!prof.every((v, i) => !i || v >= prof[i - 1])) out.push('speed along a 3000-unit stretch: ' + JSON.stringify(prof.map(v => +v.toFixed(2))));
    return out;
  });
  await check('Dragging a part across another: it waits at the last free spot, carries on past, and is kept where it last could go if let go over the other', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { parts.push(P('coil', 200, 300, { L: 'X', color: '#FFDC00' }), P('coil', 440, 300, { L: 'Y', color: '#FFDC00' })); normalize(); fitView(); fit(true); draw(); });
    const scr = (x, y) => page.evaluate(([x, y]) => { const q = svg.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(svg.getScreenCTM()); return [r.x, r.y]; }, [x, y]);
    const X = () => page.evaluate(() => { const p = parts.find(q => q.L === 'X'); return [p.x, p.y]; });
    // across Y and on to a free spot beyond it
    await page.mouse.move(...await scr(200, 300)); await page.mouse.down();
    for (const x of [260, 320, 380, 440, 500, 560, 620, 680]) await page.mouse.move(...await scr(x, 300), { steps: 2 });
    const mid = await X(); await page.mouse.up();
    const end = await X();
    if (end[0] !== 680 || end[1] !== 300) out.push('dragged across Y to x 680, it ended at ' + end);
    // let go right over Y: it stays at the last free spot (not back where it started)
    await page.mouse.move(...await scr(680, 300)); await page.mouse.down();
    for (const x of [640, 600, 560, 500, 440]) await page.mouse.move(...await scr(x, 300), { steps: 2 });
    await page.mouse.up();
    const over = await X();
    if (over[0] === 680 || over[0] < 540) out.push('let go over Y, it went to ' + over + ' (it should wait just clear of Y)');
    return out;
  });
  await check('Control transformer: fed primary powers the secondary, unfed primary warns and stays dead, saved and renumbered', async page => {
    const out = [];
    const setup = fed => page.evaluate(f => {
      loadPreset('blank');
      parts.push(newPart('xfm', 400, 200), P('btn', 420, 420, { L: 'A', maint: true, color: '#FF0032' }), P('coil', 600, 420, { L: 'X', color: '#FFDC00' }));
      if (f) wires.push(Wr(0, 80, 340, 80), Wr(340, 80, 340, 120), Wr(460, 120, 460, 80), Wr(460, 80, W, 80));
      wires.push(Wr(340, 280, 340, 420), Wr(340, 420, 380, 420), Wr(460, 420, 540, 420), Wr(660, 420, 700, 420), Wr(700, 420, 700, 320), Wr(700, 320, 460, 320), Wr(460, 320, 460, 280));
      normalize(); draw();
      return [...wiringIssues(network())].map(([k, v]) => (parts.find(p => p.id === k) || {}).t + ':' + v).join();
    }, fed);
    const state = () => page.evaluate(() => [!!coilOn[parts.find(p => p.t === 'xfm').id], !!coilOn[parts.find(p => p.L === 'X').id]].join());
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const iss = await setup(true);
    if (iss) out.push('fed: issues ' + iss);
    const back = await page.evaluate(() => { const c = readCircuit(JSON.parse(JSON.stringify(circuitData()))); return c.parts.filter(p => p.t === 'xfm').map(p => p.t + p.L).join(); });
    if (back !== 'xfm1') out.push('read back: ' + back);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300));
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(1200);
    let st = await state();
    if (st !== 'true,true') out.push('fed: transformer, X = ' + st);
    await page.evaluate(() => press('A', false)); await page.click('#tab-edit'); await page.evaluate(() => setSpeed(1));
    const iss2 = await setup(false);
    if (!/xfm:Not wired from L1 to L2/.test(iss2)) out.push('unfed: issues ' + iss2);
    await page.click('#tab-run'); await page.evaluate(() => { setSpeed(300); press('A', true); }); await page.waitForTimeout(1200);
    st = await state();
    if (st !== 'false,false') out.push('unfed: transformer, X = ' + st);
    await page.evaluate(() => press('A', false)); await page.click('#tab-edit'); await page.evaluate(() => setSpeed(1));
    const pasted = await page.evaluate(() => { sel = { parts: new Set(parts.filter(p => p.t === 'xfm').map(p => p.id)), wires: new Set() }; copySel(); pasteClip(); return parts.filter(p => p.t === 'xfm').map(p => p.L).join(); });
    if (pasted !== '1,2') out.push('after pasting: ' + pasted);
    return out;
  });
  await check('Three-phase: phases feed a transformer across two of them, shorts warn, turned boxes and phase colours saved', async page => {
    const out = [];
    const setup = sh => page.evaluate(s => {
      loadPreset('blank'); W = 900; W_USER = 900;
      for (const [k, y] of [['1', 80], ['2', 200], ['3', 320]]) { const p = newPart('ph-' + k, 120, y); p.rot = 3; parts.push(p); wires.push(Wr(160, y, 700, y)); }
      parts.push(newPart('xfm', 400, 500), P('btn', 420, 700, { L: 'A', maint: true, color: '#FF0032' }), P('coil', 600, 700, { L: 'X', color: '#FFDC00' }));
      wires.push(Wr(340, 80, 340, 420), Wr(460, 200, 460, 420));
      wires.push(Wr(340, 580, 340, 700), Wr(340, 700, 380, 700), Wr(460, 700, 540, 700), Wr(660, 700, 760, 700), Wr(760, 700, 760, 600), Wr(760, 600, 460, 600), Wr(460, 600, 460, 580));
      if (s) wires.push(Wr(640, 80, 640, 200));
      normalize(); draw();
      return [...wiringIssues(network())].map(([k, v]) => ((parts.find(p => p.id === k) || {}).t || k) + ':' + (typeof v === 'string' ? v : '')).sort().join();
    }, sh);
    const state = () => page.evaluate(() => [!!coilOn[parts.find(p => p.t === 'xfm').id], !!coilOn[parts.find(p => p.L === 'X').id]].join());
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const iss = await setup(false);
    if (iss) out.push('fed: issues ' + iss);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    // each phase lights its own line in its colour
    // (L1 and L2 lit in their colours as far as the transformer's taps; L3, leading to no load, and L1 past its tap, dark)
    const lines = await page.evaluate(() => [[200, 80], [200, 200], [200, 320], [600, 80]].map(([x, y]) => { const n = NET.nodes.findIndex(q => q.x === x && q.y === y); return colAt(n, simT) || '-'; }).join());
    if (lines !== await page.evaluate(() => [PH_DEFAULT[0], PH_DEFAULT[1], '-', '-'].join())) out.push('line colours: ' + lines);
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(1200);
    let st = await state();
    if (st !== 'true,true') out.push('fed: transformer, X = ' + st);
    await page.evaluate(() => press('A', false)); await page.click('#tab-edit'); await page.evaluate(() => setSpeed(1));
    const iss2 = await setup(true);
    if (!/phshort/.test(iss2) || !/ph:Shorted to L2/.test(iss2)) out.push('shorted: issues ' + iss2);
    await page.click('#tab-run'); await page.evaluate(() => { setSpeed(300); press('A', true); }); await page.waitForTimeout(1200);
    st = await state();
    const fault = await page.evaluate(() => !document.getElementById('fault').hidden && /L1 is connected straight to L2/.test(document.getElementById('fault').textContent));
    if (st !== 'false,false' || !fault) out.push('shorted: transformer, X = ' + st + ', fault shown ' + fault);
    await page.evaluate(() => press('A', false)); await page.click('#tab-edit'); await page.evaluate(() => setSpeed(1));
    const back = await page.evaluate(() => {
      PH_COL = ['#E8413C', '#FF8A1F', '#3F7FFF']; const s = parts.find(p => p.t === 'ph' && p.L === '2'); s.rot = 1;
      const l1 = newPart('src-l1', 600, 900); l1.rot = 2; parts.push(l1);
      const c = readCircuit(JSON.parse(JSON.stringify(circuitData())));
      return JSON.stringify([c.ph, c.parts.filter(p => isBox(p)).map(p => p.t + p.L + ':' + (p.rot || 0))]);
    });
    if (back !== '[["#E8413C","#FF8A1F","#3F7FFF"],["ph1:3","ph2:1","ph3:3","l1:2"]]') out.push('read back: ' + back);
    // the R key turns a selected phase box; the Three-phase tab places phases and stays open
    const turned = await page.evaluate(() => { const p = parts.find(q => q.t === 'ph' && q.L === '3'); sel = selOne('p', p.id); draw(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' })); return p.rot || 0; });
    if (turned !== 0) out.push('R turned L3 to ' + turned);
    await page.evaluate(() => { sel = null; draw(); });
    // the Protection menu on Home: opens, and picking a part puts it on the panel, selected, and closes the menu
    await page.click('#pr-btn');
    if (await page.evaluate(() => document.getElementById('pr-menu').hidden)) out.push('the Protection menu did not open');
    const n0 = await page.evaluate(() => parts.filter(p => p.t === 'olh').length);
    await page.click('#pr-menu [data-part="olh"]');
    const picked = await page.evaluate(n0 => { const o = parts.filter(p => p.t === 'olh'); return [o.length - n0, sel && sel.parts.has(o[o.length - 1].id), tool, document.getElementById('pr-menu').hidden].join(); }, n0);
    if (picked !== '1,true,select,true') out.push('picking Overload from the menu (placed, selected, tool, menu closed): ' + picked);
    return out;
  });
  await check('Three-phase motor branch: start/stop through a starter, disconnect, single-phasing trips the overload, reversal, a phase short blows fuses, saved', async page => {
    const out = [];
    const setup = x => page.evaluate(x => { loadPreset('blank'); POWER = 'boxes'; W = 1300; W_USER = 1300;
      [100, 220, 340].forEach((y, i) => { const p = newPart('ph-' + (i + 1), 120, y); p.rot = 3; parts.push(p); wires.push(Wr(160, y, 220, y), Wr(300, y, 400, y), Wr(480, y, 600, y), Wr(680, y, 780, y)); if (x !== 'swap' || i === 0) wires.push(Wr(860, y, 960, y)); });
      if (x === 'swap') wires.push(Wr(860, 220, 900, 220), Wr(900, 220, 900, 300), Wr(900, 300, 940, 300), Wr(940, 300, 940, 340), Wr(940, 340, 960, 340), Wr(860, 340, 880, 340), Wr(880, 340, 880, 260), Wr(880, 260, 920, 260), Wr(920, 260, 920, 220), Wr(920, 220, 960, 220));
      parts.push(newPart('dsc', 260, 220), newPart('fus', 440, 220), newPart('mst', 640, 220), newPart('olh', 820, 220), newPart('mtr', 1120, 220), newPart('xfm', 700, 560));
      wires.push(Wr(520, 100, 520, 440), Wr(520, 440, 640, 440), Wr(640, 440, 640, 480), Wr(560, 220, 560, 400), Wr(560, 400, 760, 400), Wr(760, 400, 760, 480));
      parts.push(P('btn', 700, 740, { L: 'S', nc: true, maint: false, color: '#FF0032' }), P('btn', 820, 740, { L: 'A', maint: false, color: '#00B050' }), P('coil', 960, 740, { L: 'M', color: '#FFDC00' }), newPart('olc', 1100, 740), P('con', 820, 820, { L: 'M' }));
      wires.push(Wr(640, 640, 640, 740), Wr(640, 740, 660, 740), Wr(740, 740, 780, 740), Wr(860, 740, 900, 740), Wr(1020, 740, 1060, 740), Wr(1140, 740, 1180, 740), Wr(1180, 740, 1180, 680), Wr(1180, 680, 760, 680), Wr(760, 680, 760, 640));
      wires.push(Wr(760, 740, 760, 820), Wr(760, 820, 780, 820), Wr(860, 820, 880, 820), Wr(880, 820, 880, 740));
      if (x === 'short') wires.push(Wr(580, 100, 580, 220));
      normalize(); draw();
      return [...wiringIssues(network())].map(([k, v]) => ((parts.find(p => p.id === k) || {}).t || k) + ':' + v).filter(s => !/note/.test(s)).join(' ; '); }, x);
    const st = () => page.evaluate(() => { const m = MOT[parts.find(p => p.t === 'mtr').id]; return [!!coilOn[parts.find(p => p.t === 'coil' && p.L === 'M').id], m ? m.st + m.dir : 'off0', !!OLTRIP['1'], Object.keys(BLOWN).length].join(); });
    const run = async () => { await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400); };
    const edit = async () => { await page.evaluate(() => { press('A', false); setSpeed(1); }); await page.click('#tab-edit'); };
    const start = async () => { await page.evaluate(() => press('A', true)); await page.waitForTimeout(400); await page.evaluate(() => press('A', false)); await page.waitForTimeout(500); };
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const iss = await setup('');
    if (iss) out.push('issues: ' + iss);
    await run();
    let s = await st(); if (s !== 'false,off0,false,0') out.push('at first: ' + s);
    await start(); s = await st(); if (s !== 'true,run1,false,0') out.push('started: ' + s);
    // turned off at normal speed: the transformer and motor keep running until the dark reaches them
    const early = await page.evaluate(() => { setSpeed(1); workPower(parts.find(p => p.t === 'dsc')); return [!!coilOn[parts.find(p => p.t === 'xfm').id], MOT[parts.find(p => p.t === 'mtr').id].st].join(); });
    if (early !== 'true,run') out.push('just after the disconnect opened (should still run): ' + early);
    await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(500);
    s = await st(); if (s !== 'false,off0,false,0') out.push('disconnect off: ' + s);
    await page.evaluate(() => workPower(parts.find(p => p.t === 'dsc'))); await page.waitForTimeout(500);
    await start(); await page.evaluate(() => workPower(parts.find(p => p.t === 'fus'), 2)); await page.waitForTimeout(1200);
    s = await st(); if (s !== 'false,off0,true,1') out.push('L3 fuse blown (should hum, trip, drop out): ' + s);
    await page.evaluate(() => workPower(parts.find(p => p.t === 'olc'))); await page.waitForTimeout(300);
    if (await page.evaluate(() => !!OLTRIP['1'])) out.push('the OL contact did not reset it');
    await edit(); await setup('swap'); await run(); await start();
    s = await st(); if (s !== 'true,run-1,false,0') out.push('two phases swapped: ' + s);
    await edit(); await setup('short'); await run();
    s = await st(); if (s !== 'false,off0,false,2') out.push('L1 joined to L2 after the fuses (two should blow): ' + s);
    await edit();
    const back = await page.evaluate(() => { const c = readCircuit(JSON.parse(JSON.stringify(circuitData()))); return c.parts.filter(p => ['dsc', 'fus', 'mst', 'olh', 'olc', 'mtr'].includes(p.t)).map(p => p.t + p.L + (p.nc ? 'nc' : '')).join(); });
    if (back !== 'dsc1,fus1,mst' + 'M,olh1,mtr1,olc1nc') out.push('read back: ' + back);
    return out;
  });
  await check('Reversing starter: no short warning for the interlocked pair, runs both ways with the fan turning; a starter that alone joins two phases is flagged', async page => {
    const out = [];
    const setup = x => page.evaluate(x => { loadPreset('blank'); POWER = 'boxes'; W = 1700; W_USER = 1700;
    const Y = [100, 220, 340];
    Y.forEach((y, i) => { const p = newPart('ph-' + (i + 1), 120, y); p.rot = 3; parts.push(p); wires.push(Wr(160, y, 220, y), Wr(300, y, 400, y), Wr(480, y, 960, y), Wr(1040, y, 1260, y), Wr(1340, y, 1440, y)); });
    parts.push(newPart('dsc', 260, 220), newPart('fus', 440, 220), Object.assign(newPart('mst', 1000, 220), { L: 'X' }), Object.assign(newPart('mst', 1000, 560), { L: 'Y' }), newPart('olh', 1300, 220), newPart('mtr', 1600, 220));
    wires.push(Wr(900, 100, 900, 440), Wr(900, 440, 960, 440), Wr(920, 220, 920, 560), Wr(920, 560, 960, 560), Wr(940, 340, 940, 680), Wr(940, 680, 960, 680));
    wires.push(...(x === 'bad' ? [Wr(1040, 440, 1080, 440), Wr(1080, 440, 1080, 400), Wr(1080, 400, 860, 400), Wr(860, 400, 860, 220)] : [Wr(1040, 440, 1100, 440), Wr(1100, 440, 1100, 340)]), Wr(1040, 560, 1120, 560), Wr(1120, 560, 1120, 220), Wr(1040, 680, 1140, 680), Wr(1140, 680, 1140, 100));
    parts.push(newPart('xfm', 580, 620)); wires.push(Wr(520, 100, 520, 540), Wr(640, 220, 640, 540));
    parts.push(P('btn', 600, 800, { L: 'S', nc: true, maint: false, color: '#FF0032' }), P('btn', 720, 800, { L: 'F', maint: false, color: '#00B050' }), P('con', 840, 800, { L: 'Y', nc: true }), P('coil', 960, 800, { L: 'X', color: '#00B050' }), newPart('olc', 1100, 800), P('con', 720, 860, { L: 'X' }));
    parts.push(P('btn', 720, 960, { L: 'R', maint: false, color: '#0070C0' }), P('con', 840, 960, { L: 'X', nc: true }), P('coil', 960, 960, { L: 'Y', color: '#0070C0' }), newPart('olc', 1100, 960), P('con', 720, 1020, { L: 'Y' }));
    wires.push(Wr(520, 700, 520, 800), Wr(520, 800, 560, 800), Wr(640, 800, 680, 800), Wr(760, 800, 800, 800), Wr(880, 800, 900, 800), Wr(1020, 800, 1060, 800), Wr(1140, 800, 1180, 800), Wr(1180, 800, 1180, 740), Wr(1180, 740, 640, 740), Wr(640, 740, 640, 700));
    wires.push(Wr(660, 800, 660, 860), Wr(660, 860, 680, 860), Wr(760, 860, 780, 860), Wr(780, 860, 780, 800));
    wires.push(Wr(660, 860, 660, 960), Wr(660, 960, 680, 960), Wr(760, 960, 800, 960), Wr(880, 960, 900, 960), Wr(1020, 960, 1060, 960), Wr(1140, 960, 1180, 960), Wr(1180, 960, 1180, 800));
    wires.push(Wr(660, 960, 660, 1020), Wr(660, 1020, 680, 1020), Wr(760, 1020, 780, 1020), Wr(780, 1020, 780, 960));
    normalize(); draw();
      return [...wiringIssues(network())].map(([k, v]) => ((parts.find(p => p.id === k) || {}).t || k) + (parts.find(p => p.id === k)?.L || '') + ':' + v).join(' ; '); }, x);
    const st = () => page.evaluate(() => { const m = parts.find(p => p.t === 'mtr'); return [MOT[m.id] ? MOT[m.id].st + MOT[m.id].dir : 'off0', view.parts.get(m.id).anim || '-', view.parts.get(m.id).rotor.querySelectorAll('animateTransform').length].join(); });
    const tap = async L => { await page.evaluate(L => press(L, true), L); await page.waitForTimeout(400); await page.evaluate(L => press(L, false), L); await page.waitForTimeout(500); };
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const iss = await setup('');
    if (iss) out.push('issues: ' + iss);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    // (lit: a starter's line side; never its load side, fed back from the other starter)
    const sides = L => page.evaluate(L => { const m = parts.find(p => p.t === 'mst' && p.L === L); return [0, 1].map(k => m._t.filter((_, i) => i % 2 === k).map(n => +!!colAt(n, simT)).join('')).join('/'); }, L);
    await tap('F'); let s = await st(); if (s !== 'run1,fwd,1') out.push('forward: ' + s);
    if ((s = await sides('Y')) !== '111/000') out.push('Y starter while running forward (line/load side lit): ' + s);
    await tap('S'); await tap('R'); s = await st(); if (s !== 'run-1,rev,1') out.push('reverse: ' + s);
    if ((s = await sides('X')) !== '111/000') out.push('X starter while running backward (line/load side lit): ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const bad = await setup('bad');
    if (!/mstY:Closing it joins L1 to L2/.test(bad) || /phshort/.test(bad)) out.push('miswired Y starter: ' + bad);
    return out;
  });
  await check('Limit switches: NO, NC, NO held closed and NC held open at rest and worked, saved, renumbered when pasted', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const iss = await page.evaluate(() => { W = 700; W_USER = 700;
      ['lsw-no', 'lsw-nc', 'lsw-noh', 'lsw-nch'].forEach((k, i) => { const y = 120 + i * 160; parts.push(newPart(k, 240, y), P('lamp', 480, y, { L: '', color: '#00B050' })); wires.push(Wr(0, y, 180, y), Wr(300, y, 420, y), Wr(540, y, W, y)); });
      normalize(); draw(); return [...wiringIssues(network())].length; });
    if (iss) out.push('wiring issues: ' + iss);
    const lamps = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').map(p => +!!coilOn[p.id]).join(''));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await lamps(); if (s !== '0110') out.push('at rest (lamps lit): ' + s);
    await page.evaluate(() => ['1', '2', '3', '4'].forEach(L => press(L, true))); await page.waitForTimeout(400);
    s = await lamps(); if (s !== '1001') out.push('worked (lamps lit): ' + s);
    await page.evaluate(() => { ['1', '2', '3', '4'].forEach(L => press(L, false)); setSpeed(1); }); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'lsw').map(p => p.L + (p.nc ? 'nc' : 'no') + (p.held ? 'h' : '') + p.color).join());
    if (back !== '1no#0070C0,2nc#0070C0,3noh#0070C0,4nch#0070C0') out.push('read back: ' + back);
    const pasted = await page.evaluate(() => { sel = { parts: new Set(parts.filter(p => p.t === 'lsw' && p.L === '1').map(p => p.id)), wires: new Set() }; copySel(); pasteClip(); return parts.filter(p => p.t === 'lsw').map(p => p.L).join(); });
    if (pasted !== '1,2,3,4,5') out.push('after pasting LS1: ' + pasted);
    return out;
  });
  await check('Temperature switches: NO and NC at rest and worked, apart from a limit switch of the same number, saved, renumbered when pasted', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const iss = await page.evaluate(() => { W = 760; W_USER = 760;
      ['tsw-no', 'tsw-nc', 'lsw-no'].forEach((k, i) => { const y = 140 + i * 200, h = TERM({ t: kindOf(k) }); parts.push(newPart(k, 280, y), P('lamp', 560, y, { L: '', color: '#00B050' })); wires.push(Wr(0, y, 280 - h, y), Wr(280 + h, y, 500, y), Wr(620, y, W, y)); });
      normalize(); draw(); return [...wiringIssues(network()).keys()].join(); });
    if (iss) out.push('wiring issues: ' + iss);
    const nums = await page.evaluate(() => parts.filter(p => isLim(p)).map(p => p.t + p.L).join());
    if (nums !== 'tsw1,tsw2,lsw1') out.push('numbered ' + nums);
    const lamps = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').map(p => +!!coilOn[p.id]).join(''));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await lamps(); if (s !== '010') out.push('at rest (lamps lit): ' + s);
    if (await page.evaluate(() => document.getElementById('mode-group').hidden)) out.push('no Click / Press and hold choice with only switches to work');
    await page.evaluate(() => { press('T1', true); press('T2', true); }); await page.waitForTimeout(400);
    s = await lamps(); if (s !== '100') out.push('TS1 and TS2 worked (lamps lit): ' + s);
    const col = await page.evaluate(() => { const v = view.parts.get(parts.find(p => p.t === 'tsw').id); return +v.col.getAttribute('height'); });
    if (!(col > 40)) out.push('worked: the thermometer column only ' + col + ' high');
    await page.evaluate(() => { press('T1', false); press('T2', false); press('1', true); }); await page.waitForTimeout(400);
    s = await lamps(); if (s !== '011') out.push('LS1 worked, the temperature switches let go (lamps lit): ' + s);
    // clicked on the panel: it is worked by its own key
    await page.evaluate(() => { press('1', false); mode = 'hold'; });
    const g = await page.evaluate(() => { const r = view.parts.get(parts[0].id).col.closest('[data-part]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.move(g[0], g[1]); await page.mouse.down(); await page.waitForTimeout(300);
    s = await lamps(); if (s !== '110') out.push('TS1 held down with the mouse (lamps lit): ' + s);
    await page.mouse.up(); await page.waitForTimeout(300);
    await page.evaluate(() => { mode = 'click'; setSpeed(1); }); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'tsw').map(p => p.L + (p.nc ? 'nc' : 'no') + p.color).join());
    if (back !== '1no#FF0032,2nc#FF0032') out.push('read back: ' + back);
    // low temperature ones: the same, worked as it gets cold (the column falls), saved as low
    const low = await page.evaluate(() => { const q = newPart('tsw-ncl', 900, 900); parts.push(q); const back = readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.find(z => z.t === 'tsw' && z.low); parts.pop(); return [q.nc, q.low, captionOf(q), back && back.nc].join(); });
    if (low !== 'true,true,TS3 Low Temp. Switch (NC),true') out.push('a low temperature NC switch: ' + low);
    const pasted = await page.evaluate(() => { sel = { parts: new Set(parts.filter(p => p.t === 'tsw' && p.L === '1').map(p => p.id)), wires: new Set() }; copySel(); pasteClip(); return parts.filter(p => p.t === 'tsw').map(p => p.L).join(); });
    if (pasted !== '1,2,3') out.push('after pasting TS1: ' + pasted);
    // every part's ends sit on the grid (or a wire drawn to them could never meet them)
    const off = await page.evaluate(() => [...document.querySelectorAll('[data-part]')].map(b => b.dataset.part).filter(k => { const q = newPart(k, 400, 400); for (let r = 0; r < (turns(q) ? 4 : 1); r++) { q.rot = r; if (terms(q).some(([x, y]) => x % G || y % G)) return true; } return false; }).join());
    if (off) out.push('ends off the grid: ' + off);
    return out;
  });
  await check('Pressure switches: NO and NC at rest and worked, apart from limit and temperature switches of the same number, saved, renumbered when pasted', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const iss = await page.evaluate(() => { W = 760; W_USER = 760;
      ['psw-no', 'psw-nc', 'lsw-no', 'tsw-no'].forEach((k, i) => { const y = 160 + i * 260, h = TERM({ t: kindOf(k) }); parts.push(newPart(k, 280, y), P('lamp', 560, y, { L: '', color: '#00B050' })); wires.push(Wr(0, y, 280 - h, y), Wr(280 + h, y, 500, y), Wr(620, y, W, y)); });
      normalize(); draw(); return [...wiringIssues(network()).keys()].join(); });
    if (iss) out.push('wiring issues: ' + iss);
    const lamps = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').map(p => +!!coilOn[p.id]).join(''));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await lamps(); if (s !== '0100') out.push('at rest (lamps lit): ' + s);
    await page.evaluate(() => { press('P1', true); press('P2', true); }); await page.waitForTimeout(400);
    s = await lamps(); if (s !== '1000') out.push('PS1 and PS2 worked (lamps lit): ' + s);
    const lift = await page.evaluate(() => view.parts.get(parts.find(p => p.t === 'psw').id).dg.getAttribute('transform'));
    if (!/translate\(0 -[1-9]/.test(lift)) out.push('worked: the diaphragm ' + lift);
    await page.evaluate(() => { press('P1', false); press('P2', false); setSpeed(1); }); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'psw').map(p => p.L + (p.nc ? 'nc' : 'no') + p.color).join());
    if (back !== '1no#FF9C37,2nc#FF9C37') out.push('read back: ' + back);
    const pasted = await page.evaluate(() => { sel = { parts: new Set(parts.filter(p => p.t === 'psw' && p.L === '1').map(p => p.id)), wires: new Set() }; copySel(); pasteClip(); return parts.filter(p => p.t === 'psw').map(p => p.L).join(); });
    if (pasted !== '1,2,3') out.push('after pasting PS1: ' + pasted);
    return out;
  });
  await check('Process values: switches worked by a position, a pressure and a temperature (with their deadbands), the Process window, saved and undone', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { W = 760; W_USER = 760;
      const pos = pvNew('position'), pr = pvNew('pressure'), tp = pvNew('temperature'); pos.name = 'Cylinder A'; pr.name = 'Air receiver'; tp.name = 'Oven'; PV.push(pos, pr, tp);
      const ks = [['lsw-no', pos, { side: 'hi', sp: 11.5 }], ['lsw-no', pos, { side: 'lo', sp: 0.5 }], ['psw-no', pr, { sp: 120, rs: 100 }], ['tsw-nol', tp, { sp: 40, rs: 50 }]];
      ks.forEach(([k, v, o], i) => { const y = 140 + i * 260, h = TERM({ t: kindOf(k) }), q = newPart(k, 280, y); parts.push(q, P('lamp', 560, y, { L: '', color: '#00B050' })); Object.assign(q, { pv: v.id }, o); if (q.rs === undefined) q.rs = q.sp; wires.push(Wr(0, y, 280 - h, y), Wr(280 + h, y, 500, y), Wr(620, y, W, y)); });
      normalize(); draw(); });
    const lamps = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').map(p => +!!coilOn[p.id]).join(''));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    // at the start: the cylinder home (0 in: LS2 worked), no pressure, the oven at 70 °F
    let s = await lamps(); if (s !== '0100') out.push('at the start (lamps lit): ' + s);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#pw-list .pv')].map(r => r.querySelector('.pvname').textContent + '=' + r.querySelector('.pvval').value).join());
    if (rows !== 'Cylinder A=0,Air receiver=0,Oven=70') out.push('the Process window: ' + rows);
    if (await page.evaluate(() => document.getElementById('procwin').hidden)) out.push('the Process window not shown');
    const set = (n, x) => page.evaluate(([n, x]) => pvSet(PV.find(v => v.name === n).id, x), [n, x]);
    await set('Cylinder A', 12); await page.waitForTimeout(300); s = await lamps(); if (s !== '1000') out.push('cylinder out (lamps lit): ' + s);
    await set('Air receiver', 125); await page.waitForTimeout(300); s = await lamps(); if (s !== '1010') out.push('125 psi (lamps lit): ' + s);
    await set('Air receiver', 110); await page.waitForTimeout(300); s = await lamps(); if (s !== '1010') out.push('down to 110 psi, inside the deadband (lamps lit): ' + s);
    await set('Air receiver', 95); await page.waitForTimeout(300); s = await lamps(); if (s !== '1000') out.push('down to 95 psi, reset (lamps lit): ' + s);
    await set('Oven', 35); await page.waitForTimeout(300); s = await lamps(); if (s !== '1001') out.push('oven down to 35 °F (lamps lit): ' + s);
    await set('Oven', 45); await page.waitForTimeout(300); s = await lamps(); if (s !== '1001') out.push('oven back up to 45 °F, inside the deadband (lamps lit): ' + s);
    await set('Oven', 55); await page.waitForTimeout(300); s = await lamps(); if (s !== '1000') out.push('oven up to 55 °F, reset (lamps lit): ' + s);
    // the slider in the window works it too; a switch worked by a value is not worked by clicking it
    await page.evaluate(() => { const sl = document.querySelector('#pw-list .pv .pvslide'); sl.value = 6; sl.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(300); s = await lamps(); if (s !== '0000') out.push('cylinder halfway, by the slider (lamps lit): ' + s);
    await page.evaluate(() => { mode = 'click'; press(opKey(parts[0]), true); }); await page.waitForTimeout(300);
    s = await lamps(); if (s !== '0000') out.push('LS1 pressed by hand while worked by a value (lamps lit): ' + s);
    await page.evaluate(() => { press(opKey(parts[0]), false); });
    const needle = await page.evaluate(() => view.parts.get(parts.find(p => p.t === 'psw').id).needle.getAttribute('transform'));
    if (!/rotate\(306\.00 /.test(needle)) out.push('the gauge at 95 psi of 150 (135° + 95/150 of 270°): ' + needle);
    await page.click('#reset-btn'); await page.waitForTimeout(300); s = await lamps(); if (s !== '0100') out.push('after Reset (lamps lit): ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => { const c = readCircuit(JSON.parse(JSON.stringify(circuitData()))); return c.pv.map(v => `${v.name}/${v.kind}/${v.unit}/${v.min}-${v.max}@${v.start}`).join() + ' | ' + c.parts.filter(p => p.pv).map(p => `${p.t}:${c.pv.find(v => v.id === p.pv).name}:${p.sp}/${p.rs}${p.side ? '/' + p.side : ''}`).join(); });
    if (back !== 'Cylinder A/position/in/0-12@0,Air receiver/pressure/psi/0-150@0,Oven/temperature/°F/32-400@70 | lsw:Cylinder A:11.5/11.5/hi,lsw:Cylinder A:0.5/0.5/lo,psw:Air receiver:120/100,tsw:Oven:40/50')
      out.push('read back: ' + back);
    const undone = await page.evaluate(() => { snapshot(); PV = []; for (const p of parts) unlinkPv(p); undo(); return PV.length + '/' + parts.filter(p => p.pv).length; });
    if (undone !== '3/4') out.push('values and links after Undo: ' + undone);
    return out;
  });
  await check('Heating element: lights and glows while energized, heats its temperature (working a temperature switch), cools back while off, saved', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { W = 760; W_USER = 760;
      const oven = pvNew('temperature'); oven.name = 'Oven'; PV.push(oven);
      const a = P('btn', 200, 140, { L: 'A', color: '#00B050', nc: false, maint: true }), h = newPart('htr', 480, 140); Object.assign(h, { pv: oven.id, rate: 600, cool: 600 });
      const t = newPart('tsw-no', 280, 400); Object.assign(t, { pv: oven.id, sp: 150, rs: 140 });
      parts.push(a, h, t, P('lamp', 560, 400, { L: '', color: '#00B050' }));
      wires.push(Wr(0, 140, 160, 140), Wr(240, 140, 420, 140), Wr(540, 140, W, 140), Wr(0, 400, 200, 400), Wr(360, 400, 500, 400), Wr(620, 400, W, 400));
      normalize(); draw(); });
    const st = () => page.evaluate(() => { const h = parts.find(p => p.t === 'htr'), v = view.parts.get(h.id); return { on: !!coilOn[h.id], glow: v.glow.style.opacity, T: PVV[PV[0].id], lamp: !!coilOn[parts.find(p => p.t === 'lamp').id] }; });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(10)); await page.waitForTimeout(300);
    let s = await st(); if (s.on || s.T !== 70 || s.lamp) out.push('at the start: ' + JSON.stringify(s));
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(250);
    s = await st(); if (!s.on || s.glow !== '0.9') out.push('A pressed, the heater: ' + JSON.stringify(s));
    await page.waitForFunction(() => PVV[PV[0].id] > 160, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    s = await st(); if (!(s.T > 150) || !s.lamp) out.push('heated (TS1 over 150 °F): ' + JSON.stringify(s));
    if (s.T > 400) out.push('heated past the top of its range: ' + s.T);
    await page.evaluate(() => press('A', false));
    await page.waitForFunction(() => PVV[PV[0].id] < 130, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    s = await st(); if (s.on || s.glow !== '0' || s.lamp || !(s.T < 140)) out.push('A let go, cooled: ' + JSON.stringify(s));
    await page.waitForFunction(() => PVV[PV[0].id] <= 70, null, { timeout: 8000 }).catch(() => {});
    s = await st(); if (s.T !== 70) out.push('cooled no further than where it started: ' + s.T);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => { const c = readCircuit(JSON.parse(JSON.stringify(circuitData()))), h = c.parts.find(p => p.t === 'htr'); return [h.L, h.color, h.pv === c.pv[0].id, h.rate, h.cool, captionOf(h)].join(); });
    if (back !== '1,#FF0032,true,600,600,HTR1 Heating Element') out.push('read back: ' + back);
    return out;
  });
  await check('Outputs driving values: a solenoid strokes a cylinder (spring return) to a limit switch, a motor pumps up a pressure (holding when off) to a pressure switch', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { W = 1100; W_USER = 1100;
      const cyl = pvNew('position'), air = pvNew('pressure'); cyl.name = 'Cylinder'; air.name = 'Air'; PV.push(cyl, air);
      const a = P('btn', 200, 140, { L: 'A', color: '#00B050', nc: false, maint: true }), sol = newPart('sol', 480, 140); sol.pv = cyl.id; drvDefaults(sol, cyl);
      const ls = newPart('lsw-no', 300, 380); Object.assign(ls, { pv: cyl.id, side: 'hi', sp: 11.8, rs: 11.8 });
      const ps = newPart('psw-no', 300, 640); Object.assign(ps, { pv: air.id, sp: 120, rs: 100 });
      parts.push(a, sol, ls, P('lamp', 560, 380, { L: '', color: '#00B050' }), ps, P('lamp', 560, 640, { L: '', color: '#00B050' }));
      wires.push(Wr(0, 140, 160, 140), Wr(240, 140, 420, 140), Wr(540, 140, W, 140));
      for (const y of [380, 640]) wires.push(Wr(0, y, 240, y), Wr(360, y, 500, y), Wr(620, y, W, y));
      // the compressor: three phases through a disconnect to a motor, below
      const ys = [880, 1000, 1120]; ys.forEach((y, i) => parts.push(newPart('ph-' + (i + 1), 120, y)));
      const ds = newPart('dsc', 420, 1000), m = newPart('mtr', 900, 1000); parts.push(ds, m); m.pv = air.id; drvDefaults(m, air); m.rate = 900;
      const T = TERM(parts.find(p => p.t === 'ph')); ys.forEach(y => wires.push(Wr(120 + T, y, 380, y), Wr(460, y, 900 - 160, y)));
      normalize(); draw(); });
    const cfg = await page.evaluate(() => { const sol = parts.find(p => p.t === 'sol'), m = parts.find(p => p.t === 'mtr'); return [sol.rate, sol.per, sol.off, sol.cool, m.per, m.off].join(); });
    if (cfg !== '4,s,back,4,min,hold') out.push('the settings an output starts with (solenoid on a 12 in cylinder; motor on a 150 psi receiver): ' + cfg);
    const st = () => page.evaluate(() => ({ cyl: +PVV[PV[0].id].toFixed(2), air: +PVV[PV[1].id].toFixed(1), lamps: parts.filter(p => p.t === 'lamp').map(p => +!!coilOn[p.id]).join('') }));
    await page.click('#tab-run'); await page.evaluate(() => { setSpeed(10); workPower(parts.find(p => p.t === 'dsc')); }); await page.waitForTimeout(300);
    let s = await st(); if (s.cyl !== 0 || s.lamps !== '00') out.push('at the start (the disconnect off): ' + JSON.stringify(s));
    await page.evaluate(() => press('A', true));
    await page.waitForFunction(() => PVV[PV[0].id] >= 12, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(300);
    s = await st(); if (s.cyl !== 12 || s.lamps[0] !== '1') out.push('SOL1 energized: out to the end of its stroke, LS1 made: ' + JSON.stringify(s));
    await page.evaluate(() => press('A', false));
    await page.waitForFunction(() => PVV[PV[0].id] <= 0, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(300);
    s = await st(); if (s.cyl !== 0 || s.lamps[0] !== '0') out.push('SOL1 off: sprung back home, LS1 let go: ' + JSON.stringify(s));
    await page.evaluate(() => workPower(parts.find(p => p.t === 'dsc')));   // (the disconnect on: the motor runs)
    await page.waitForFunction(() => PVV[PV[1].id] > 125, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(300);
    s = await st(); if (!(s.air > 125) || s.lamps[1] !== '1') out.push('the motor running: pressure up, PS1 made: ' + JSON.stringify(s));
    await page.evaluate(() => workPower(parts.find(p => p.t === 'dsc'))); await page.waitForTimeout(200);
    const a1 = (await st()).air; await page.waitForTimeout(700); const a2 = (await st()).air;
    if (a1 !== a2) out.push('the motor stopped: the pressure should hold, went ' + a1 + ' → ' + a2);
    const txt = await page.evaluate(() => document.querySelector('#pw-list .pv .pvlinks').textContent);
    if (!/Driven by SOL1 \(\+4 in\/s, back 4 in\/s when off\)/.test(txt)) out.push('the Process window: ' + txt);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.pv && (p.t === 'sol' || p.t === 'mtr')).map(p => [p.t, p.rate, p.per, p.dir, p.off, p.cool].join('/')).join());
    if (back !== 'sol/4/s/up/back/4,mtr/900/min/up/hold/15') out.push('read back: ' + back);
    return out;
  });
  await check('Process values in real time: at 300x a cylinder still takes its seconds to stroke (and following the speed, it does not)', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { W = 760; W_USER = 760; const cyl = pvNew('position'); PV.push(cyl);
      const a = P('btn', 200, 140, { L: 'A', color: '#00B050', nc: false, maint: true }), sol = newPart('sol', 480, 140); sol.pv = cyl.id; drvDefaults(sol, cyl);
      parts.push(a, sol); wires.push(Wr(0, 140, 160, 140), Wr(240, 140, 420, 140), Wr(540, 140, W, 140)); normalize(); draw(); });
    await page.click('#tab-run');
    if (await page.evaluate(() => document.getElementById('pv-time-group').hidden)) out.push('no Process values choice on the Simulation tab');
    await page.click('#pv-time-group [data-preal="1"]');
    if (await page.evaluate(() => document.querySelector('#procwin [data-preal="1"]').getAttribute('aria-pressed')) !== 'true') out.push('the Process window\'s choice not in step');
    await page.evaluate(() => { setSpeed(300); press('A', true); }); await page.waitForTimeout(1000);
    const x = await page.evaluate(() => PVV[PV[0].id]);
    if (!(x > 1.5 && x < 8)) out.push('real time, 1 s at 300x and 4 in/s: the cylinder at ' + x.toFixed(2) + ' in (want about 4)');
    await page.click('#pv-time-group [data-preal="0"]'); await page.waitForTimeout(300);
    const y = await page.evaluate(() => PVV[PV[0].id]);
    if (y !== 12) out.push('following the speed at 300x: the cylinder at ' + y + ' in (want all the way out)');
    await page.evaluate(() => { press('A', false); setSpeed(1); setPvReal(false); }); await page.click('#tab-edit');
    return out;
  });
  await check('Resizing the floating windows: the station and the Process window grow by their sides and corners, and are remembered', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { W = 760; W_USER = 760; const cyl = pvNew('position'); PV.push(cyl); const ls = newPart('lsw', 480, 300); ls.pv = cyl.id;
      parts.push(P('btn', 200, 140, { L: 'A', color: '#00B050', nc: false, maint: false, label: 'START' }), P('lamp', 480, 140, { L: '', color: '#FF0032' }), ls);
      wires.push(Wr(0, 140, 160, 140), Wr(240, 140, 420, 140), Wr(540, 140, W, 140)); normalize(); draw(); });
    await page.click('#tab-run'); await page.waitForTimeout(100);
    if (await page.evaluate(() => ST.hidden)) await page.click('#st-toggle');
    await page.evaluate(() => { ST.x = 760; ST.y = 120; placeStation(); }); await page.waitForTimeout(80);
    const box = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
    const pull = async (sel, x, y, dx, dy) => { const g = await box(sel), X = g.x + x(g), Y = g.y + y(g); await page.mouse.move(X, Y); await page.mouse.down(); await page.mouse.move(X + dx, Y + dy, { steps: 8 }); await page.waitForTimeout(40); await page.mouse.up(); await page.waitForTimeout(80); };
    // the station: its corner makes all of it bigger, buttons and all
    const s0 = await box('#station'), b0 = await box('#st-grid .st-dev');
    await pull('#station .rz-se', g => g.w / 2, g => g.h / 2, 120, 120);
    const s1 = await box('#station'), b1 = await box('#st-grid .st-dev');
    if (!(s1.w > s0.w * 1.2 && s1.h > s0.h * 1.2)) out.push('the station by its corner: ' + JSON.stringify([s0, s1]));
    if (!(b1.w > b0.w * 1.2)) out.push('the station\'s buttons did not grow with it: ' + b0.w + ' → ' + b1.w);
    if (Math.abs(s1.x - s0.x) > 1 || Math.abs(s1.y - s0.y) > 1) out.push('the station moved as its far corner was dragged');
    // its left side: grows to the left, the right side holding still
    await pull('#station .rz-w', g => g.w / 2, g => g.h / 2, -60, 0);
    const s2 = await box('#station');
    if (!(s2.w > s1.w + 20) || Math.abs(s2.r - s1.r) > 2) out.push('the station by its left side: ' + JSON.stringify([s1, s2]));
    // pressing a button on it still works, bigger
    const g = await box('#st-grid g.dev'); await page.mouse.move(g.x + g.w / 2, g.y + g.h / 2); await page.mouse.down(); await page.waitForTimeout(80);
    if (!(await page.evaluate(() => down.A))) out.push('a button on the bigger station does not press');
    await page.mouse.up();
    if (!(await page.evaluate(() => JSON.parse(localStorage.getItem(STATION_KEY)).z > 1.2))) out.push('the station\'s size not remembered');
    // double-clicking a grip: back to its usual size
    const c = await box('#station .rz-se'); await page.mouse.dblclick(c.x + c.w / 2, c.y + c.h / 2); await page.waitForTimeout(80);
    if (await page.evaluate(() => ST.z) !== 1) out.push('double-clicking a grip did not put the station back to its usual size');
    // the Process window: its right side makes it wider and everything in it bigger; its bottom, taller
    await page.evaluate(() => { ST.hidden = true; showStation(); });
    const p0 = await box('#procwin'), v0 = await box('#pw-list .pvvis');
    await pull('#procwin .rz-e', g => g.w / 2, g => g.h / 2, 150, 0);
    const p1 = await box('#procwin'), v1 = await box('#pw-list .pvvis');
    if (!(p1.w > p0.w + 100) || Math.abs(p1.x - p0.x) > 1) out.push('the Process window by its right side: ' + JSON.stringify([p0, p1]));
    if (!(v1.w > v0.w * 1.15)) out.push('the Process window\'s picture did not grow with it: ' + v0.w + ' → ' + v1.w);
    await pull('#procwin .rz-s', g => g.w / 2, g => g.h / 2, 0, 160);
    const p2 = await box('#procwin');
    if (!(Math.abs(p2.h - (p1.h + 160)) < 4) || Math.abs(p2.w - p1.w) > 1) out.push('the Process window by its bottom: ' + JSON.stringify([p1, p2]));
    if (p2.b > 1000) out.push('the Process window ran off the bottom of the window');
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem(PROC_KEY)));
    if (!(kept.w > 700 && kept.h > 200)) out.push('the Process window\'s size not remembered: ' + JSON.stringify(kept));
    const d = await box('#procwin .rz-sw'); await page.mouse.dblclick(d.x + d.w / 2, d.y + d.h / 2); await page.waitForTimeout(80);
    if (Math.abs((await box('#procwin')).w - 600) > 1) out.push('double-clicking a grip did not put the Process window back to 600 wide');
    return out;
  });
  await check('Every part lands on the grid wherever it is put, even pushed clear of the edges (so wires can meet its ends); one saved off it is put back on', async page => {
    const out = [];
    for (const bars of ['bars', 'boxes']) {
      const bad = await page.evaluate(bars => { POWER = bars;
        const kinds = [...new Set([...document.querySelectorAll('[data-part]')].map(b => b.dataset.part))], bad = new Set();
        for (const k of kinds) { const t = kindOf(k); for (let x = -50; x < W + 500; x += 13) for (let y = -50; y < 320; y += 11) { const [cx, cy] = clampPart(x, y, t), q = newPart(k, cx, cy);
          for (let r = 0; r < (turns(q) ? 4 : 1); r++) { q.rot = r || undefined; if (terms(q).some(([a, c]) => a % G || c % G)) bad.add(k); } } }
        POWER = 'bars'; return [...bad].join(); }, bars);
      if (bad) out.push('off the grid near an edge (' + bars + '): ' + bad);
    }
    const back = await page.evaluate(() => { const d = circuitData(); d.parts = [['lsw', 103, 102, 1, 0]]; const c = readCircuit(d).parts[0]; return [c.x, c.y].join(); });
    if (back !== '100,100') out.push('a limit switch saved at 103,102 opened at ' + back + ' (want 100,100)');
    return out;
  });
  await check('Ribbon menus: no Three-phase menu; its parts in Outputs, Contacts, Protection and Power; labels in title case', async page => {
    const out = [];
    const where = await page.evaluate(() => Object.fromEntries(['dsc', 'mst', 'mtr', 'olc', 'fus', 'fu1', 'olh', 'ph-1', 'ph-2', 'ph-3', 'xfm', 'src-l1', 'src-l2'].map(k => [k, document.querySelector(`[data-part="${k}"]`)?.closest('.tp-menu')?.id])));
    const want = { dsc: 'pr-menu', mst: 'ct-menu', mtr: 'out-menu', olc: 'ct-menu', fus: 'pr-menu', fu1: 'pr-menu', olh: 'pr-menu', 'ph-1': 'pw-menu', 'ph-2': 'pw-menu', 'ph-3': 'pw-menu', xfm: 'pw-menu', 'src-l1': 'pw-menu', 'src-l2': 'pw-menu' };
    for (const k in want) if (where[k] !== want[k]) out.push(k + ' in ' + where[k] + ' (want ' + want[k] + ')');
    if (await page.$('#tp-btn, #tp-menu')) out.push('the Three-phase menu is still there');
    if (await page.evaluate(() => !document.querySelector('#pw-menu [data-power="bars"]') || !document.querySelector('#pw-menu #src-swatches'))) out.push('Bars, Boxes and the source colour not in the Power menu');
    // every word of a label on the ribbon starts with a capital (short joining words aside)
    const low = await page.evaluate(() => { const bad = [];
      for (const e of document.querySelectorAll('#ribbon .gname, #ribbon .tool span, #ribbon .label, #ribbon .seg button, .tp-menu .gname, .tp-menu .tool span'))
        for (const n of e.childNodes) if (n.nodeType === 3) for (const w of n.textContent.trim().split(/[\s-]+/)) if (/^[a-z]/.test(w) && !/^(a|an|the|and|or|of|in|on|at|to|by|for|into)$/.test(w)) bad.push(n.textContent.trim());
      return [...new Set(bad)].join(' | '); });
    if (low) out.push('not in title case: ' + low);
    return out;
  });
  await check('Print Diagram: fuses in a transformer’s primary leads keep their power wires out of the control numbers (FWD/REV with MCR)', async page => {
    const d = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'fwdrev_mcr.json'), 'utf8'));
    await page.evaluate(d => { const c = readCircuit(d); PV = c.pv; parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; POWER = c.power; SRC_COL = c.src; PH_COL = c.ph; circuitName = c.name; normalize(); fit(true); draw(); }, d);
    const got = await page.evaluate(() => { const h = document.createElement('div'); h.innerHTML = printSheet('x', true).html; return [...new Set([...h.querySelectorAll('.wn')].map(t => t.textContent))]; });
    const ctl = got.filter(l => /^\d+$/.test(l)).map(Number).sort((a, b) => a - b), out = [];
    if (ctl.join() !== Array.from({ length: 15 }, (_, i) => i + 1).join()) out.push('control numbers: ' + ctl.join(',') + ' (want 1-15, none skipped)');
    for (const l of ['L1B', 'L2B', 'L3B', 'X1']) if (!got.includes(l)) out.push('no ' + l);
    // (a pasted fuse gets a number of its own)
    const n = await page.evaluate(() => { sel = selOne('p', parts.find(p => p.t === 'fu1').id); copySel(); pasteClip(); return parts.filter(p => p.t === 'fu1' || p.t === 'fus').map(p => p.L).join(','); });
    if (!/,4$/.test(n)) out.push('fuse numbers after pasting one: ' + n);
    // (new fuses: a block takes FU1-FU3, then single fuses FU4, FU5, FU6; the print numbers each fuse of the block)
    const m = await page.evaluate(() => { parts = []; wires = []; sel = null; const f = ['fus', 'fu1', 'fu1', 'fu1'].map((k, i) => { const p = newPart(k, 400 + 200 * i, 400); parts.push(p); return p; });
      draw(); const h = document.createElement('div'); h.innerHTML = printSheet('x', true).html; return [f.map(p => p.L).join(','), [...h.querySelectorAll('text')].map(t => t.textContent).filter(t => /^FU\d$/.test(t)).sort().join(',')]; });
    if (m[0] !== '1,4,5,6') out.push('new fuse numbers: ' + m[0] + ' (want 1,4,5,6)');
    if (m[1] !== 'FU1,FU2,FU3,FU4,FU5,FU6') out.push('fuses on the print: ' + m[1]);
    return out;
  });
  await check('Print Diagram: wire numbers (control 1, 2, then reading order; power L1, L1A... and T1, T1A...), line numbers, cross-references, title block; printing puts the sheet alone on the page', async page => {
    const out = [];
    const d = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'fwdrev.json'), 'utf8'));
    await page.evaluate(d => { const c = readCircuit(d); PV = c.pv; parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; POWER = c.power; SRC_COL = c.src; PH_COL = c.ph; circuitName = c.name; normalize(); fit(true); draw(); }, d);
    await page.evaluate(() => { try { localStorage.removeItem(PRINT_NAME_KEY); } catch (_) {} });
    await page.click('#print-btn'); await page.waitForTimeout(150);
    if (!(await page.evaluate(() => document.getElementById('print-dlg').open))) return out.concat('Print did not open the preview');
    const got = await page.evaluate(() => [...new Set([...document.querySelectorAll('#pd-view .pr-page:first-child .wn')].map(t => t.textContent))].sort().join(' '));
    const want = ['1', '2', 'X1', ...Array.from({ length: 16 }, (_, i) => String(i + 3)), ...[1, 2, 3].flatMap(n => ['L' + n + 'A', 'L' + n + 'B']), ...[1, 2, 3, 4, 5, 6].flatMap(n => ['T' + n, 'T' + n + 'A'])].sort().join(' ');
    if (got !== want) out.push('wire numbers: ' + got + ' (want ' + want + ')');
    // (reading order: on the top rung, after M-STOP is 3, after ON is 4)
    const at = await page.evaluate(() => { const t = [...document.querySelectorAll('#pd-view .pr-page:first-child .wn')].filter(e => +e.getAttribute('y') === 1191).map(e => [+e.getAttribute('x'), e.textContent]).sort((a, b) => a[0] - b[0]); return t.map(e => e[1]).join(','); });
    if (at !== '1,3,4,2') out.push('top rung, left to right: ' + at + ' (want 1,3,4,2)');
    const lines = await page.evaluate(() => [...document.querySelectorAll('#pd-view .pr-page:first-child .ln')].map(t => t.textContent).join(','));
    if (lines !== '1,2,3,4,5,6,7,8,9,10,11') out.push('line numbers: ' + lines);
    const xr = await page.evaluate(() => [...document.querySelectorAll('#pd-view .pr-page:first-child .xr')].map(t => t.textContent + (t.getAttribute('text-decoration') ? '_' : '')).join(''));
    if (xr !== '2,3,8,104,5,_PWR3,_6,PWR') out.push('cross-references: ' + xr + ' (want Z 2,3,8,10; X 4,5(NC),PWR; Y 3(NC),6,PWR)');
    const tb = await page.evaluate(() => document.querySelector('#pd-view .pr-tb').textContent.replace(/\s+/g, ' '));
    for (const s of ['FWD/REV_Interlock_Ovrtrvl', 'Student Name', 'Illinois Central College', 'Electrical Troubleshooting', '1 of 2']) if (!tb.includes(s)) out.push('title block has no ' + s);
    // large enough to read: the wide FWD/REV circuit on landscape sheets, split between rungs, each saying where it carries on
    const sheets = await page.evaluate(() => [document.querySelectorAll('#pd-view .pr-page').length, document.querySelectorAll('#pd-view .pr-page.land').length, document.getElementById('pd-count').textContent, [...document.querySelectorAll('#pd-view .pr-tb')].map(t => /(\d) of (\d)/.exec(t.textContent).slice(1).join('/')).join(' ')].join('|'));
    if (sheets !== '2|0|2 letter sheets|1/2 2/2') out.push('sheets (count, landscape, label, numbering): ' + sheets);
    const conts = await page.evaluate(() => [...document.querySelectorAll('#pd-view text')].map(t => t.textContent).filter(s => /^CONTINUED/.test(s)).join(' / '));
    if (conts !== 'CONTINUED ON SHEET 2 / CONTINUED FROM SHEET 1') out.push('continued notes: ' + conts);
    // an arrow at each end of each wire that crosses the break (L1's and L2's rails): leaving sheet 1, coming onto sheet 2
    const arr = await page.evaluate(() => [...document.querySelectorAll('#pd-view .pr-page')].map(pg => [...pg.querySelectorAll('.arr:not(.in)')].map(a => a.nextSibling.textContent).join('+')).join(' / '));
    if (arr !== '1+2 / 1+2') out.push('continuation arrows (sheet 1 / sheet 2): ' + arr);
    // (a labelled button or coil with a label of its own goes by it: M-STOP, not PB-D; X's contacts, FORWARD)
    const tags = await page.evaluate(() => [...document.querySelectorAll('#pd-view .pr-page:first-child text')].map(t => t.textContent));
    if (tags.includes('PB-D') || !tags.includes('M-STOP') || tags.filter(t => t === 'FORWARD').length < 3) out.push('labels as names on the print: PB-D ' + tags.includes('PB-D') + ', FORWARD ×' + tags.filter(t => t === 'FORWARD').length);
    // Fit on one sheet: the whole of it, smaller, remembered
    await page.click('[data-psize="fit"]'); await page.waitForTimeout(80);
    if (await page.evaluate(() => document.querySelectorAll('#pd-view .pr-page').length + '|' + localStorage.getItem(PRINT_SIZE_KEY)) !== '1|fit') out.push('Fit on one sheet');
    await page.click('[data-psize="large"]'); await page.waitForTimeout(80);
    // drawn by: typed in, shown on the sheet, remembered
    await page.fill('#pd-name', 'Pat Lee'); await page.waitForTimeout(80);
    if (!(await page.evaluate(() => document.querySelector('#pd-view .pr-tb').textContent.includes('Pat Lee')))) out.push('Drawn by not on the sheet');
    if (await page.evaluate(() => localStorage.getItem(PRINT_NAME_KEY)) !== 'Pat Lee') out.push('Drawn by not remembered');
    // printing: the sheet alone, letter portrait
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.click('#pd-print'); await page.waitForTimeout(120);
    const pr = await page.evaluate(() => [window.__printed, document.querySelectorAll('#print-host .pr-page').length, document.getElementById('print-page').textContent.includes('8.5in 11in'), document.getElementById('print-dlg').open].join());
    if (pr !== '1,2,true,false') out.push('printing (printed, sheets, letter portrait, preview closed): ' + pr);
    await page.emulateMedia({ media: 'print' });
    const vis = await page.evaluate(() => [getComputedStyle(document.getElementById('print-host')).display, document.querySelector('header.titlebar').getClientRects().length ? 'shown' : 'none'].join());
    if (vis !== 'block,none') out.push('in print, the sheet and the builder show: ' + vis + ' (want block,none)');
    await page.emulateMedia({ media: 'screen' });
    // a plain circuit on the bars: 1 is the L1 bar, 2 the L2 bar; Ctrl+P opens it too
    await page.evaluate(() => { localStorage.setItem(PRINT_NAME_KEY, 'Student Name'); });
    await page.selectOption('#preset', 'seal'); await page.waitForTimeout(100);
    await page.keyboard.press('Control+p'); await page.waitForTimeout(150);
    if (!(await page.evaluate(() => document.getElementById('print-dlg').open))) return out.concat('Ctrl+P did not open the preview');
    const bars = await page.evaluate(() => [...new Set([...document.querySelectorAll('#pd-view .wn')].map(t => t.textContent))].sort((a, b) => a - b).join(','));
    if (!/^1,2,3/.test(bars) || /L|T/.test(bars)) out.push('seal-in on the bars, wire numbers: ' + bars);
    if (!(await page.evaluate(() => [...document.querySelectorAll('#pd-view text')].some(t => t.textContent === 'L1') && [...document.querySelectorAll('#pd-view text')].some(t => t.textContent === 'L2')))) out.push('the bars not labelled L1 and L2');
    // the title block's two rows share their dividers (Course under Drawing type, Sheet under Rev)
    const cols = await page.evaluate(() => { const c = [...document.querySelectorAll('#pd-view .pr-page:first-child .pr-tb > div')].map(e => e.getBoundingClientRect()); return [Math.abs(c[1].left - c[6].left), Math.abs(c[4].left - c[8].left)].map(v => v < 1).join(); });
    if (cols !== 'true,true') out.push('title block dividers not lined up: ' + cols);
    await page.click('#pd-close');
    // a selector switch drawn in two rungs: Dallas's symbol, the turning arrow on the top block only, the positions each block is closed in, linked
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { W = 760; W_USER = 760;
      parts.push(P('sel', 240, 160, { L: 'S', n: 3, closedIn: [0], pos: 1, color: '#0070C0', names: ['HAND', 'OFF', 'AUTO'] }), P('lamp', 560, 160, { L: '', color: '#00B050' }), P('sel', 240, 320, { L: 'S', n: 3, closedIn: [2], pos: 1, color: '#0070C0', names: ['HAND', 'OFF', 'AUTO'] }), P('lamp', 560, 320, { L: '', color: '#FF0032' }));
      wires.push(Wr(0, 160, 180, 160), Wr(300, 160, 500, 160), Wr(620, 160, W, 160), Wr(0, 320, 180, 320), Wr(300, 320, 500, 320), Wr(620, 320, W, 320)); normalize(); draw(); });
    await page.click('#print-btn'); await page.waitForTimeout(150);
    const ss = await page.evaluate(() => { const t = [...document.querySelectorAll('#pd-view text')].map(e => e.textContent), html = document.getElementById('pd-view').innerHTML;
      return [t.filter(s => s === 'SS-S').length, t.includes('CLOSED: HAND'), t.includes('CLOSED: AUTO'), (html.match(/m 11\.58,11\.58/g) || []).length, /stroke-dasharray="12 10"/.test(html)].join(); });
    if (ss !== '1,true,true,1,true') out.push('selector switch on the print (tag once, closed in HAND, AUTO, one turning arrow, linked): ' + ss);
    await page.click('#pd-close');
    return out;
  });
  await check('Print preview zoom: +, −, the percentage (100%), Fit, Ctrl + the wheel and Ctrl+0; opens fitted again', async page => {
    const out = [];
    await page.selectOption('#preset', 'stress'); await page.waitForTimeout(100);
    await page.click('#print-btn'); await page.waitForTimeout(200);
    const st = () => page.evaluate(() => [parseFloat(document.querySelector('#pd-view .pr-page').style.zoom), document.getElementById('pz-level').textContent, document.getElementById('pz-fit').getAttribute('aria-pressed')]);
    const fit = await st(); if (fit[2] !== 'true') out.push('opens not fitted: ' + fit);
    await page.click('#pz-in'); await page.waitForTimeout(60); const a = await st();
    if (!(a[0] > fit[0]) || a[2] !== 'false' || a[1] !== Math.round(a[0] * 100) + '%') out.push('+ : ' + a + ' (from ' + fit + ')');
    await page.click('#pz-level'); await page.waitForTimeout(60); const b = await st(); if (b[0] !== 1 || b[1] !== '100%') out.push('the percentage (100%): ' + b);
    await page.click('#pz-out'); await page.waitForTimeout(60); const c = await st(); if (!(c[0] < 1)) out.push('− : ' + c);
    const v = await page.evaluate(() => { const r = document.getElementById('pd-view').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.move(v[0], v[1]); await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.keyboard.up('Control'); await page.waitForTimeout(80);
    const d = await st(); if (!(d[0] > c[0])) out.push('Ctrl + the wheel did not zoom in: ' + d);
    await page.keyboard.press('Control+0'); await page.waitForTimeout(60); const e = await st(); if (e[2] !== 'true' || Math.abs(e[0] - fit[0]) > .01) out.push('Ctrl+0 did not fit: ' + e);
    await page.click('#pz-in'); await page.click('#pd-close'); await page.click('#print-btn'); await page.waitForTimeout(150);
    const f = await st(); if (f[2] !== 'true') out.push('opened again, not fitted: ' + f);
    await page.click('#pd-close');
    return out;
  });
  await check('Labels: after Z, letters go on to AA, AB...; a button or coil with a label of its own is named by it; names too close together shrink to fit', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    // 27 pushbuttons: the 27th is AA (and keeps it through a save)
    const Ls = await page.evaluate(() => { for (let i = 0; i < 27; i++) { const p = newPart('btn-no-mom', 200 + (i % 9) * 200, 160 + Math.floor(i / 9) * 200); parts.push(p); } normalize(); draw();
      return parts.map(p => p.L); });
    if (Ls.length !== 27 || Ls[26] !== 'AA' || new Set(Ls).size !== 27) out.push('letters for 27 buttons: ' + Ls.join(''));
    const kept = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts[26].L);
    if (kept !== 'AA') out.push('AA saved and read back as ' + kept);
    const opts = await page.evaluate(() => { sel = selOne('p', parts[26].id); draw(); renderProps(); return [...document.getElementById('p-letter').options].map(o => o.value); });
    if (!opts.includes('AA') || !opts.includes('AB')) out.push('the letter list after Z: ' + opts.slice(24, 30).join(','));
    // a label of its own: the caption goes by it; the same label on two, by their letters
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const caps = await page.evaluate(() => { const a = P('btn', 200, 160, { L: 'A', nc: true, label: 'STOP' }), c = P('coil', 600, 160, { L: 'X', label: 'FWD' }), k = P('con', 400, 320, { L: 'X' }), b = P('btn', 200, 480, { L: 'B', label: 'JOG' }), d = P('btn', 400, 480, { L: 'D', label: 'JOG' });
      parts.push(a, c, k, b, d); normalize(); draw(); return [a, c, k, b, d].map(p => view.parts.get(p.id).cap.textContent.replace(/\s+\d.*$/, '')).join(' | '); });
    if (caps !== 'STOP Button (NC) | FWD Coil | FWD Contact (NO) | B Button (NO) | D Button (NO)') out.push('captions: ' + caps);
    // two parts close together: their names shrink, so they no longer run into one another
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const fit = await page.evaluate(() => { const a = P('lsw', 200, 200, { L: '1' }), b = P('lsw', 320, 200, { L: '2' }), c = P('btn', 800, 200, { L: 'A' }); parts.push(a, b, c); normalize(); draw();
      const r = [a, b].map(p => view.parts.get(p.id).cap.getBBox()); return { gap: r[1].x - (r[0].x + r[0].width), fs: [a, b, c].map(p => parseFloat(getComputedStyle(view.parts.get(p.id).cap).fontSize)) }; });
    if (!(fit.gap >= 0)) out.push('two limit switches 120 apart: their names overlap by ' + (-fit.gap).toFixed(1));
    if (!(fit.fs[0] < 12.5 && fit.fs[2] === 12.5)) out.push('font sizes (close, close, alone): ' + fit.fs.join(','));
    return out;
  });
  await check('FWD/REV Template: loads as Dallas saved it (supply boxes, phase colours, process values, its parts and wires); the next preset goes back to the usual', async page => {
    const out = [];
    await page.selectOption('#preset', 'fwdrev'); await page.waitForTimeout(150);
    const r = await page.evaluate(() => [parts.length, wires.length, POWER, PH_COL.join(''), PV.map(v => v.name).join('+'), circuitName, parts.filter(p => p.t === 'mst').map(p => p.L).join(''),
      document.querySelector('[data-power="boxes"]').getAttribute('aria-pressed')].join('|'));
    if (r !== '13|42|boxes|#E8413C#00FF64#3F7FFF|Pressure 1+Temperature|FWD/REV Template|XY|true') out.push('the template loaded as: ' + r);
    await page.selectOption('#preset', 'seal'); await page.waitForTimeout(100);
    const back = await page.evaluate(() => [POWER, PV.length].join('|'));
    if (back !== 'bars|0') out.push('after it, Start / Stop came up with: ' + back);
    return out;
  });
  await check('Emergency stop: from the Buttons menu; NC and maintained, its own look and caption; latches in (the twist badge showing), and out again; saved and read back; printed with the E-stop symbol', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.click('#bt-btn'); await page.click('#bt-menu [data-part="btn-estop"]'); await page.waitForTimeout(80);
    const p0 = await page.evaluate(() => { const e = parts.find(p => p.estop); return e && [e.t, e.nc, e.maint, e.color, view.parts.get(e.id).cap.textContent.trim(), [...document.querySelectorAll('#props-btn .notestop')].every(g => g.hidden), [...document.querySelectorAll('.eslegend')].map(t => t.textContent).join('/')].join('|'); });
    if (p0 !== 'btn|true|true|#E3001B|A E-Stop (NC)|true|EMERGENCY/STOP') out.push('placed from the menu: ' + p0);
    // wire it to a lamp and run: pressed, it latches in (the lamp goes out, the badge shows); pressed again, it comes out
    await page.evaluate(() => { const e = parts.find(p => p.estop); e.x = 200; e.y = 160; W = 760; W_USER = 760; parts.push(P('lamp', 560, 160, { L: '', color: '#00B050' })); wires.push(Wr(0, 160, 160, 160), Wr(240, 160, 500, 160), Wr(620, 160, W, 160)); normalize(); sel = null; draw(); });
    await page.click('#tab-run'); await page.waitForTimeout(300);
    const at = await page.evaluate(() => { const g = view.parts.get(parts.find(p => p.estop).id).fill.getBoundingClientRect(); return [g.left + g.width / 2, g.top + g.height / 2]; });
    const st = () => page.evaluate(() => { const e = parts.find(p => p.estop), v = view.parts.get(e.id); return [!!down[e.L], v.twist.style.display !== 'none', v.fill.getAttribute('fill')].join('|'); });
    await page.mouse.click(at[0], at[1]); await page.waitForTimeout(400);
    if (await st() !== 'true|true|url(#gEsHeadIn)') out.push('pressed (latched, badge, darker head): ' + await st());
    await page.mouse.click(at[0], at[1]); await page.waitForTimeout(400);
    if (await st() !== 'false|false|url(#gEsHead)') out.push('pressed again (out, no badge): ' + await st());
    await page.click('#tab-edit'); await page.waitForTimeout(200);
    const saved = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(circuitData())), c = readCircuit(d), e = c.parts.find(p => p.t === 'btn'); return [d.parts.find(a => a[0] === 'est') ? 'est' : 'none', e.estop, e.nc, e.maint].join('|'); });
    if (saved !== 'est|true|true|true') out.push('saved and read back: ' + saved);
    await page.click('#print-btn'); await page.waitForTimeout(200);
    const pr = await page.evaluate(() => [...document.querySelectorAll('#pd-view .pr-page:first-child text')].some(t => t.textContent === 'ES-A') && document.getElementById('pd-view').innerHTML.includes(PSYM['NC EStop Pushbutton'].b.slice(0, 40)));
    if (!pr) out.push('the print does not show ES-A with the E-stop symbol');
    await page.click('#pd-close');
    return out;
  });
  await check('Process pictures on the panel: docked under the output that drives it, dragged off as a card, docked again, placed from Process values, hidden, saved', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { W = 1100; W_USER = 1100;
      const cyl = pvNew('position'), oven = pvNew('temperature'), air = pvNew('pressure'); cyl.name = 'Cylinder A'; oven.name = 'Oven'; air.name = 'Air'; PV.push(cyl, oven, air);
      const a = P('btn', 200, 140, { L: 'A', color: '#00B050', nc: false, maint: true }), sol = newPart('sol', 600, 140); sol.pv = cyl.id; drvDefaults(sol, cyl);
      const b = P('btn', 200, 540, { L: 'B', color: '#00B050', nc: false, maint: true }), h = newPart('htr', 600, 540); Object.assign(h, { pv: oven.id, rate: 600, cool: 600 });
      const t = newPart('tsw-no', 300, 740); Object.assign(t, { pv: oven.id, sp: 350, rs: 340 });
      parts.push(a, sol, b, h, t, P('lamp', 680, 740, { L: '', color: '#FF3333' }));
      for (const [y, x1, x2] of [[140, 200, 600], [540, 200, 600]]) { const ha = TERM(parts.find(p => p.y === y && p.x === x1)), hb = TERM(parts.find(p => p.y === y && p.x === x2)); wires.push(Wr(0, y, x1 - ha, y), Wr(x1 + ha, y, x2 - hb, y), Wr(x2 + hb, y, W, y)); }
      wires.push(Wr(0, 740, 300 - TERM(t), 740), Wr(300 + TERM(t), 740, 620, 740), Wr(740, 740, W, 740));
      normalize(); fit(true); draw(); });
    const pics = () => page.evaluate(() => [...document.querySelectorAll('#svg .pic')].map(g => (g.classList.contains('docked') ? 'd:' : 'c:') + PV.find(v => v.id === g.dataset.pic).name + '=' + g.querySelector('.picnum').textContent).join());
    let s = await pics(); if (s !== 'd:Cylinder A=0 in,d:Oven=70 °F') out.push('docked under SOL1 and HTR1 (Air drives nothing: no picture): ' + s);
    // drag the oven's picture off: a card, selected, with its links and a dock under HTR1
    const bx = await page.locator('#svg .pic.docked').nth(1).boundingBox(), cx = bx.x + bx.width / 2, cy = bx.y + bx.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(cx + 30 * i, cy + 6 * i); await page.mouse.up(); await page.waitForTimeout(100);
    s = await pics(); if (s !== 'd:Cylinder A=0 in,c:Oven=70 °F') out.push('dragged off: ' + s);
    const card = await page.evaluate(() => { const g = document.querySelector('#svg .pic:not(.docked)'); return [picSel === PV[1].id, document.querySelectorAll('#svg .picdock').length, document.querySelectorAll('#svg .piclink').length, g.querySelector('.piclinks').textContent]; });
    if (card.join() !== 'true,1,2,HTR1 → TS1') out.push('the card, selected: ' + card.join());
    // undo puts it back under HTR1, redo off again
    await page.keyboard.press('Control+z'); await page.waitForTimeout(60); s = await pics(); if (s !== 'd:Cylinder A=0 in,d:Oven=70 °F') out.push('undo: ' + s);
    await page.keyboard.press('Control+y'); await page.waitForTimeout(60);
    // double-click: docked again
    const cb = await page.locator('#svg .pic:not(.docked)').boundingBox(); await page.mouse.dblclick(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.waitForTimeout(80);
    s = await pics(); if (s !== 'd:Cylinder A=0 in,d:Oven=70 °F') out.push('double-clicked: ' + s);
    // Air, placed from Process values; then selected and Deleted
    await page.click('#pv-btn'); await page.locator('#pv-rows tr').nth(2).locator('[data-pic]').selectOption('1'); await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    s = await pics(); if (s !== 'd:Cylinder A=0 in,d:Oven=70 °F,c:Air=0 psi') out.push('Air placed from Process values: ' + s);
    const back = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(circuitData())), c = readCircuit(d); return c.pv.map(v => v.pic ? v.pic.x + '/' + v.pic.y : '-').join(); });
    const now = await page.evaluate(() => PV.map(v => v.pic ? v.pic.x + '/' + v.pic.y : '-').join()); if (back !== now || !/^-,-,\d+\/\d+$/.test(now)) out.push('saved and read back: ' + now + ' → ' + back);
    const ab = await page.locator('#svg .pic:not(.docked)').boundingBox(); await page.mouse.click(ab.x + ab.width / 2, ab.y + 12); await page.keyboard.press('Delete'); await page.waitForTimeout(60);
    s = await pics(); if (s !== 'd:Cylinder A=0 in,d:Oven=70 °F') out.push('Air deleted from the panel: ' + s);
    // SOL1's picture hidden on its tab (and saved so)
    const sid = await page.evaluate(() => parts.find(p => p.t === 'sol').id), sb = await page.locator(`#svg [data-part="${sid}"]`).boundingBox();
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.waitForTimeout(60);
    await page.selectOption('#d-pic', '0'); await page.waitForTimeout(60);
    s = await pics(); if (s !== 'd:Oven=70 °F') out.push('SOL1\'s picture hidden: ' + s);
    if (!(await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.find(p => p.t === 'sol').nopic))) out.push('SOL1\'s hidden picture not saved');
    // running: the oven's picture follows its value
    await page.click('#tab-run'); await page.evaluate(() => { setSpeed(10); press('B', true); }); await page.waitForTimeout(900);
    const run = await page.evaluate(() => [PVV[PV[1].id], document.querySelector('#svg .pic .picnum').textContent, pvFmt(PV[1], PVV[PV[1].id]) + ' °F']);
    if (!(run[0] > 90) || run[1] !== run[2]) out.push('running, the oven heating: ' + run.join());
    await page.click('#tab-edit');
    return out;
  });
  await check('Ribbon menus: Buttons, Switches, Outputs and Contacts open and place their parts (momentary or maintained, instantaneous or timing)', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    for (const [btn, kinds] of [['bt', ['btn-no-mom', 'btn-nc-mom', 'btn-no-mnt', 'btn-nc-mnt']], ['sw', ['sel', 'lsw-no', 'lsw-nch', 'tsw-no', 'tsw-nc', 'tsw-nol', 'tsw-ncl', 'psw-no', 'psw-nc']], ['out', ['coil', 'timer', 'timer-off', 'lamp', 'sol', 'htr']], ['ct', ['con-no-i', 'con-nc-i', 'con-no-t', 'con-nc-t']]]) {
      await page.click(`#${btn}-btn`);
      for (const k of kinds) if (!(await page.isVisible(`#${btn}-menu [data-part="${k}"]`))) out.push(`${k} not in the ${btn} menu`);
      await page.keyboard.press('Escape');
      if (!(await page.evaluate(id => document.getElementById(id).hidden, btn + '-menu'))) out.push(`Esc did not close the ${btn} menu`);
    }
    await toolbarDrop(page, 'timer', 700, 160); await toolbarDrop(page, 'coil', 700, 320);
    await toolbarDrop(page, 'btn-no-mom', 200, 160); await toolbarDrop(page, 'btn-nc-mnt', 200, 320);
    await toolbarDrop(page, 'con-no-t', 400, 160); await toolbarDrop(page, 'con-nc-i', 400, 320);
    const got = await page.evaluate(() => parts.map(p => p.t === 'btn' ? `btn${p.nc ? 'nc' : 'no'}${p.maint ? 'mnt' : 'mom'}` : p.t === 'con' ? `con${p.nc ? 'nc' : 'no'}${isTimed(p) ? 'T' : 'I'}` : p.t).sort().join());
    if (got !== 'btnncmnt,btnnomom,coil,con' + 'ncI,connoT,coil'.replace(',coil', '')) { const want = ['btnncmnt', 'btnnomom', 'coil', 'coil', 'conncI', 'connoT'].join(); if (got !== want) out.push('placed: ' + got + ' (want ' + want + ')'); }
    return out;
  });
  await check('A part clicked on the ribbon goes onto the panel in a free spot: selected, clear of other parts and wires, joined to nothing', async page => {
    const out = [];
    await page.selectOption('#preset', page.evaluate ? await page.evaluate(() => document.querySelector('#preset option:nth-child(2)').value) : 'blank'); await page.waitForTimeout(100);
    for (const [m, k] of [['out', 'coil'], ['bt', 'btn-no-mom'], ['ct', 'con-no-i'], ['sw', 'lsw-no'], ['out', 'mtr'], ['pr', 'fu1'], ['pw', 'xfm'], [null, 'jmp'], ['out', 'lamp']]) {
      if (m) await page.click(`#${m}-btn`); await page.click(`[data-part="${k}"]`); await page.waitForTimeout(60);
      const r = await page.evaluate(() => { const p = parts[parts.length - 1];
        const touching = terms(p).some(([x, y]) => { const i = pointInfo(x, y, new Set(), p); return i.ends > 0 || i.interior || i.bar; });
        const clash = parts.some(q => q !== p && Math.abs(q.x - p.x) < halfW(q.t) + halfW(p.t) && Math.abs(q.y - p.y) < halfH(q.t) + halfH(p.t));
        return [sel && sel.parts.size === 1 && sel.parts.has(p.id), touching, clash, wireInTheWay(p)].join(); });
      if (r !== 'true,false,false,false') out.push(`${k} (selected, touching, overlapping, wire in the way): ${r}`);
    }
    return out;
  });
  await check('Single fuse: lit while current passes, clicked to blow and replace, blown by a short, upright in an upright run, saved turned', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const ids = await page.evaluate(() => { W = 760; W_USER = 760;
      const f1 = newPart('fu1', 240, 120); parts.push(f1); const f2 = newPart('fu1', 240, 280); parts.push(f2); const f3 = newPart('fu1', 360, 440); f3.rot = 1; parts.push(f3);   // (each numbered after the last)
      parts.splice(1, 0, P('lamp', 480, 120, { L: '', color: '#00B050' })); parts.push(P('lamp', 480, 520, { L: '', color: '#00B050' }));
      wires.push(Wr(0, 120, 200, 120), Wr(280, 120, 420, 120), Wr(540, 120, W, 120));   // L1 - FU - lamp - L2
      wires.push(Wr(0, 280, 200, 280), Wr(280, 280, W, 280));                            // L1 - FU - L2: a short
      wires.push(Wr(0, 400, 360, 400), Wr(360, 480, 360, 520), Wr(360, 520, 420, 520), Wr(540, 520, W, 520));   // through an upright fuse
      normalize(); draw(); return [f1.id, f2.id, f3.id]; });
    const nums = await page.evaluate(() => parts.filter(p => p.t === 'fu1').map(p => p.L).join());
    if (nums !== '1,2,3') out.push('numbered ' + nums);
    const t3 = await page.evaluate(() => JSON.stringify(terms(parts.find(p => p.rot === 1))));
    if (t3 !== '[[360,400],[360,480]]') out.push('upright fuse ends at ' + t3);
    const iss = await page.evaluate(() => [...wiringIssues(network()).keys()].filter(k => k !== 'short').join());
    if (iss) out.push('wiring issues: ' + iss);
    const lamps = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').map(p => +!!coilOn[p.id]).join(''));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(500);
    const blown = () => page.evaluate(ids => ids.map(id => +!!BLOWN[id]).join(''), ids);
    let b = await blown(); if (b !== '010') out.push('blown at the start (the short through FU2): ' + b);
    let s = await lamps(); if (s !== '11') out.push('lamps lit once FU2 had blown: ' + s);
    if (await page.evaluate(() => shortNow)) out.push('still a short after FU2 blew');
    const fill = await page.evaluate(id => { const v = view.parts.get(id); return [v.cur.g.getAttribute('fill'), +v.cur.r.getAttribute('width') > 60 ? 'whole' : 'part', v.mark.getAttribute('display')].join(); }, ids[0]);
    if (!/^#[0-9A-F]{6},whole,none$/i.test(fill)) out.push('FU1 while passing current: fill/crack ' + fill);
    await page.evaluate(() => workPower(parts.find(p => p.t === 'fu1' && p.L === '1'))); await page.waitForTimeout(300);
    s = await lamps(); if (s !== '01') out.push('FU1 clicked (blown): lamps ' + s);
    const half = await page.evaluate(id => { const v = view.parts.get(id); return [v.cur.g.getAttribute('fill') !== 'transparent', v.old.g.getAttribute('fill') === 'transparent', v.mark.getAttribute('display') !== 'none'].join(); }, ids[0]);
    if (half !== 'true,true,true') out.push('FU1 blown: line half lit, load half dark, crack shown: ' + half);
    await page.evaluate(() => workPower(parts.find(p => p.t === 'fu1' && p.L === '1'))); await page.waitForTimeout(300);
    s = await lamps(); if (s !== '11') out.push('FU1 put back: lamps ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'fu1').map(p => p.L + ':' + (p.rot || 0)).join());
    if (back !== '1:0,2:0,3:1') out.push('read back: ' + back);
    // an upright fuse dropped on an upright wire sits in it (the wire cut either side of it), and turns with R
    const cut = await page.evaluate(() => { loadPreset('blank'); sel = null; wires.push(Wr(300, 100, 300, 400)); const f = newPart('fu1', 300, 240); f.rot = 1; parts.push(f); normalize(); return wires.map(w => [w.y1, w.y2].sort((a, b) => a - b).join('-')).sort().join(); });
    if (cut !== '100-200,280-400') out.push('upright wire round an upright fuse: ' + cut);
    await page.evaluate(() => { sel = selOne('p', parts[0].id); draw(); });
    await page.keyboard.press('r');
    const r = await page.evaluate(() => parts[0].rot || 0); if (r !== 2) out.push('R turned it to ' + r);
    return out;
  });
  await check('Single fuses on the phases: lit by the phase through them, and blown, the dark runs from the fuse to the load', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { POWER = 'boxes';
      const x = newPart('xfm', 600, 500); parts.push(x); const [[h1x, h1y], [h2x, h2y]] = terms(x);
      const pa = newPart('ph-2', 200, 100), pb = newPart('ph-3', 1000, 100); parts.push(pa, pb);
      const fa = newPart('fu1', h1x, 300); fa.rot = 1; parts.push(fa); const fb = newPart('fu1', h2x, 300); fb.rot = 1; parts.push(fb);
      const T = TERM(pa);
      wires.push(Wr(200 + T, 100, h1x, 100), Wr(h1x, 100, h1x, 260), Wr(h1x, 340, h1x, h1y), Wr(1000 - T, 100, h2x, 100), Wr(h2x, 100, h2x, 260), Wr(h2x, 340, h2x, h2y));
      normalize(); draw(); });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(500);
    const lit = await page.evaluate(() => parts.filter(p => p.t === 'fu1').map(p => { const v = view.parts.get(p.id); return v.cur.g.getAttribute('fill') + '/' + Math.round(+v.cur.r.getAttribute('width')); }).join());
    const want = await page.evaluate(() => [PH_COL[1], PH_COL[2]].map(c => c + '/66').join());
    if (lit !== want) out.push('the fuses on L2 and L3: ' + lit + ' (want ' + want + ')');
    const offs = await page.evaluate(() => { const f = parts.find(p => p.t === 'fu1'); workPower(f);
      const [hx, hy] = terms(parts[0])[0]; return NET.nodes.map((n, i) => [n, i]).filter(([n]) => n.x === hx && n.y >= 340 && n.y <= hy).sort((a, b) => a[0].y - b[0].y).map(([, i]) => PDARK.get(i) ? PDARK.get(i).off : null); });
    if (offs.some(o => o === null) || offs.some((o, i) => i && o < offs[i - 1] - 1e-9)) out.push('dark down the wire from the blown fuse to H1 (top first): ' + offs.map(o => o === null ? '-' : o.toFixed(3)).join(' '));
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    return out;
  });
  await check('Operator station: its speed controls set the speed, in step with the Simulation tab', async page => {
    const out = [];
    await page.selectOption('#preset', 'seal'); await page.waitForTimeout(60);
    await page.click('#tab-run'); await page.waitForTimeout(100);
    await page.evaluate(() => { if (ST.hidden) document.getElementById('st-toggle').click(); });
    await page.click('#station [data-speed="2"]');
    let r = await page.evaluate(() => [speed, document.getElementById('st-sout').value, document.getElementById('speed-out').value, document.querySelector('#speed-group [data-speed="2"]').getAttribute('aria-pressed'), Math.round(+document.getElementById('speed-slider').value)].join());
    if (r !== '2,2×,2×,true,' + Math.round(100 * Math.log10(20) / Math.log10(3000))) out.push('2× on the station: ' + r);
    await page.fill('#st-sout', '40'); await page.press('#st-sout', 'Enter');
    r = await page.evaluate(() => [speed, document.getElementById('st-sout').value, document.getElementById('speed-out').value].join());
    if (r !== '40,40×,40×') out.push('40 typed on the station: ' + r);
    await page.fill('#st-sout', 'abc'); await page.press('#st-sout', 'Enter');
    r = await page.evaluate(() => [speed, document.getElementById('st-sout').value].join());
    if (r !== '40,40×') out.push('nonsense typed on the station: ' + r);
    await page.click('#speed-group [data-speed="0.5"]');
    r = await page.evaluate(() => [document.getElementById('st-sout').value, document.querySelector('#station [data-speed="0.5"]').getAttribute('aria-pressed')].join());
    if (r !== '0.5×,true') out.push('½× on the Simulation tab, on the station: ' + r);
    await page.evaluate(() => { setSpeed(1); ST.hidden = true; saveStation(); }); await page.click('#tab-edit');
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

  await check('A tall circuit on a wide screen fills the panel edge to edge (with the sheet\'s margins): L2 moves out, its wires stretch, files stay the same', async page => {
    const out = [];
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.selectOption('#preset', 'three'); await page.waitForTimeout(150);
    const look = () => page.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(), m = svg.getScreenCTM();
      return { left: m.e - SHEET_M * m.a, right: m.e + (W + SHEET_M) * m.a, sl: st.left, sr: st.right, top: m.f, bottom: m.f + canvasH() * m.d, sb: st.bottom, W, issues: wiringIssues(network()).size, data: JSON.stringify(circuitData()) }; });
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

  await check('A selection box can start anywhere, even on the grey round the sheet zoomed right out; its outline stays clear at any zoom', async page => {
    const out = [];
    await page.selectOption('#preset', 'three');
    for (let i = 0; i < 6; i++) await page.click('#zoom-out');
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => { const m = svg.getScreenCTM(), b = svg.getBoundingClientRect(), xs = parts.map(q => m.a * q.x + m.e), ys = parts.map(q => m.d * q.y + m.f);
      return { a: [(b.left + m.e) / 2, Math.min(...ys) - 40], c: [Math.max(...xs) + 30, Math.max(...ys) + 30], sheetL: m.e, n: parts.length }; });
    if (r.a[0] >= r.sheetL) out.push('no grey to the left of the sheet at 25% (test set-up)');
    await page.mouse.move(...r.a); await page.mouse.down(); await page.mouse.move(...r.c, { steps: 8 });
    const o = await page.evaluate(() => { const b = svg.querySelector('rect.selbox'); return b ? [b.getAttribute('vector-effect'), b.getAttribute('stroke-width')].join() : 'none'; });
    await page.mouse.up(); await page.waitForTimeout(40);
    const got = await page.evaluate(() => sel ? sel.parts.size : 0);
    if (o !== 'non-scaling-stroke,2') out.push('box outline: ' + o);
    if (got !== r.n) out.push(`box from the grey picked ${got} of ${r.n} parts`);
    return out;
  });

  await check('Holding Space and dragging moves the view (as in Print Builder), without picking or moving anything; not while typing', async page => {
    const out = [];
    await page.selectOption('#preset', 'three');
    for (let i = 0; i < 3; i++) await page.click('#zoom-in');
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    const p0 = await page.evaluate(() => { const b = svg.getBoundingClientRect(), m = svg.getScreenCTM(), c = [b.left + b.width / 2, b.top + b.height / 2];
      // (pressed on a part, if one is in view: it must not move)
      const q = parts.find(q => { const x = m.a * q.x + m.e, y = m.d * q.y + m.f; return x > b.left + 60 && x < b.right - 200 && y > b.top + 60 && y < b.bottom - 120; });
      return { at: q ? [m.a * q.x + m.e, m.d * q.y + m.f] : c, pos: JSON.stringify(parts.map(z => [z.x, z.y])), cam: [cam.x, cam.y], scroll: scrollY }; });
    await page.keyboard.down('Space');
    const cur = await page.evaluate(() => svg.style.cursor);
    await page.mouse.move(...p0.at); await page.mouse.down(); await page.mouse.move(p0.at[0] + 150, p0.at[1] + 80, { steps: 6 }); await page.mouse.up();
    await page.keyboard.up('Space');
    const a = await page.evaluate(() => ({ cam: [cam.x, cam.y], pos: JSON.stringify(parts.map(z => [z.x, z.y])), sel: sel ? sel.parts.size : 0, cur: svg.style.cursor, scroll: scrollY }));
    if (cur !== 'grab') out.push('hand cursor while Space is held: ' + cur);
    if (!(a.cam[0] < p0.cam[0] - 20 && a.cam[1] < p0.cam[1] - 10)) out.push('view did not move: ' + JSON.stringify([p0.cam, a.cam]));
    if (a.pos !== p0.pos || a.sel) out.push('a part was moved or picked');
    if (a.cur === 'grab' || a.scroll !== p0.scroll) out.push('after letting go: cursor ' + a.cur + ', page scrolled ' + (a.scroll - p0.scroll));
    // typing a space in a box is still a space
    await page.evaluate(() => { const i = document.createElement('input'); i.id = 'sp-t'; document.body.appendChild(i); i.focus(); });
    await page.keyboard.type('a b'); const typed = await page.evaluate(() => { const v = document.getElementById('sp-t').value; document.getElementById('sp-t').remove(); return v; });
    if (typed !== 'a b') out.push('a space typed in a box became: ' + JSON.stringify(typed));
    return out;
  });


  await check('The credit and license: footer line, About box (opens from the i button, Escape closes it), notice at the top of the code', async page => {
    const out = [];
    const src = require('fs').readFileSync(decodeURI(PAGE.slice(7)), 'utf8').slice(0, 1200);
    if (!/^<!doctype html>\n<!--[\s\S]*© 2026 Dallas Boswell[\s\S]*CC BY-NC-SA 4\.0[\s\S]*creativecommons\.org\/licenses\/by-nc-sa\/4\.0\//.test(src)) out.push('no license notice at the top of the page');
    const f = await page.evaluate(() => { const c = document.getElementById('credit'), r = c.getBoundingClientRect(), a = c.querySelector('a');
      const st = document.getElementById('stage'), sr = st && st.getBoundingClientRect();
      return { text: c.textContent.replace(/\s+/g, ' ').trim(), href: a && a.href, vis: r.width > 0 && r.height > 0 && r.bottom <= innerHeight && r.right <= innerWidth + 0.5,
        scroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        under: !sr || (r.top >= sr.bottom - 0.5 && r.right <= sr.right + 0.5) };
    });
    if (f.text !== '© 2026 Dallas Boswell · Free for Educational Use · cc BY-NC-SA 4.0') out.push('footer reads: ' + f.text);
    if (f.href !== 'https://creativecommons.org/licenses/by-nc-sa/4.0/') out.push('footer link: ' + f.href);
    if (!f.vis) out.push('footer not fully on screen');
    if (!f.under) out.push('footer not under the panel, inside its right edge');
    if (f.scroll > 0) out.push('page scrolls by ' + f.scroll);
    await page.click('#about-btn'); await page.waitForTimeout(150);
    const d = await page.evaluate(() => { const g = document.getElementById('about-dlg'), t = g.textContent.replace(/\s+/g, ' ');
      return { open: g.open, t, links: [...g.querySelectorAll('a')].map(a => a.href + ' ' + a.target) }; });
    if (!d.open) out.push('About box did not open');
    for (const s of ['Made by Dallas Boswell', 'Industrial Electrical Technology', 'Illinois Central College', '© 2026 Dallas Boswell. Some rights reserved.', 'Attribution-NonCommercial-ShareAlike 4.0 International License', 'Attribution:', 'NonCommercial:', 'ShareAlike:', 'without warranty'])
      if (!d.t.includes(s)) out.push('About box lacks: ' + s);
    if (d.links.join('|') !== 'https://creativecommons.org/licenses/by-nc-sa/4.0/ _blank|https://github.com/DallasBoswell-ICC/OrderOfOperations _blank') out.push('About links: ' + d.links.join('|'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    if (await page.evaluate(() => document.getElementById('about-dlg').open)) out.push('Escape did not close the About box');
    return out;
  });


  await check('A switch placed after a coil (on its way back to L2): no crash; the coil drops out and picks up with it; its return current runs on to L2; Reset still works', async page => {
    const out = [];
    for (const [name, mk, key, nc, w] of [['NC limit switch', `P('lsw', 640, 200, { L: '1', nc: true })`, '1', true, 60], ['NO limit switch', `P('lsw', 640, 200, { L: '1' })`, '1', false, 60],
        ['NC pushbutton', `P('btn', 640, 200, { L: 'B', nc: true })`, 'B', true, 40], ['NO pushbutton', `P('btn', 640, 200, { L: 'B' })`, 'B', false, 40],
        ['NC temperature switch', `P('tsw', 640, 200, { L: '1', nc: true })`, 'T1', true, 60], ['NC pressure switch', `P('psw', 640, 200, { L: '1', nc: true })`, 'P1', true, 60]]) {
      if (await page.evaluate(() => !editing)) await page.click('#tab-edit');
      await loadCircuit(page, `parts = [P('btn', 140, 200, { L: 'A', maint: true }), C('X', 400, 200), ${mk}];
        wires = [Wr(0,200,100,200), Wr(180,200,340,200), Wr(460,200,${640 - w},200), Wr(${640 + w},200,880,200)]`);
      await page.click('#tab-run'); await page.waitForTimeout(250);
      const r = await page.evaluate(new Function(STEP + `
        const X = parts.find(q => q.t === 'coil'), L2 = [...NET.feedV].filter(([, v]) => v === 0).map(([id]) => id);
        const s = () => (coilOn[X.id] ? 1 : 0) + (L2.some(id => REC.get(id) && REC.get(id).ret) ? 'r' : '-');
        const seq = [];
        press('A', true); step(4); seq.push(s());
        press('${key}', true); step(4); seq.push(s());
        press('${key}', false); step(4); seq.push(s());
        press('A', false); step(4); seq.push(s());
        return seq.join(' ');`));
      await page.click('#reset-btn'); await page.waitForTimeout(150);
      const again = await page.evaluate(new Function(STEP + `press('A', true); step(4); return coilOn[parts.find(q => q.t === 'coil').id] ? 1 : 0;`));
      const want = nc ? '1r 0- 1r 0-' : '0- 1r 0- 0-';
      if (r !== want) out.push(name + ': ' + r + ' (want ' + want + ')');
      if (again !== (nc ? 1 : 0)) out.push(name + ': after Reset the coil is ' + (again ? 'in' : 'out'));
    }
    return out;
  });


  await check('A part tab with more on it than fits (a motor in a narrow window): nothing overlaps; it scrolls sideways with the wheel, its cut-off end faded', async page => {
    const out = [];
    await page.setViewportSize({ width: 1470, height: 1000 }); await page.waitForTimeout(150);
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { const cyl = pvNew('position'); cyl.name = 'Position'; PV.push(cyl); const m = newPart('mtr', 600, 300); parts.push(m); m.pv = cyl.id; drvDefaults(m, cyl); normalize(); fit(true); draw(); });
    const id = await page.evaluate(() => parts.find(q => q.t === 'mtr').id), bx = await page.locator(`#svg [data-part="${id}"]`).boundingBox();
    await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.waitForTimeout(200);
    const groups = () => page.evaluate(() => [...document.querySelectorAll('#editpanel .tgroup')].filter(g => g.offsetParent).map(g => { const r = g.getBoundingClientRect(); return [g.querySelector('.label') ? g.querySelector('.label').textContent : '?', r.left, r.right]; }).sort((a, b) => a[1] - b[1]));
    const g = await groups();
    for (let i = 1; i < g.length; i++) if (g[i][1] < g[i - 1][2] - 0.5) out.push(g[i][0] + ' overlaps ' + g[i - 1][0]);
    if (!g.some(x => x[0] === 'Part') || !g.some(x => x[0] === 'Picture')) out.push('groups: ' + g.map(x => x[0]).join(', '));
    const more0 = await page.evaluate(() => document.getElementById('editpanel').dataset.more || '');
    if (more0 !== 'r') out.push('cut-off end not marked: ' + more0);
    await page.mouse.move(700, 120); await page.mouse.wheel(0, 2000); await page.waitForTimeout(200);
    const r = await page.evaluate(() => { const e = document.getElementById('editpanel'), d = document.getElementById('p-del').getBoundingClientRect(); return [e.scrollLeft, e.dataset.more || '', d.right <= e.getBoundingClientRect().right + 0.5, scrollY]; });
    if (!(r[0] > 0) || r[1] !== 'l' || !r[2] || r[3] !== 0) out.push('after the wheel: ' + JSON.stringify(r));
    return out;
  });

  await check('Keyboard shortcuts (left hand): E/W tools, Q places again, arrows nudge as one undo, X deletes, G Build/Run, Z fits, F1 lists every key', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.mouse.move(650, 600);
    await page.keyboard.press('w'); if (await page.evaluate(() => tool) !== 'wire') out.push('W: tool is ' + await page.evaluate(() => tool));
    await page.keyboard.press('e'); if (await page.evaluate(() => tool) !== 'select') out.push('E: tool is ' + await page.evaluate(() => tool));
    await page.keyboard.press('q'); if (await page.evaluate(() => parts.length) !== 0) out.push('Q with nothing placed yet placed something');
    await page.evaluate(() => { closeMenus(); setTool('select'); placeFree('coil'); }); await page.waitForTimeout(60);   // (as a click on Relay Coil in the ribbon)
    const n0 = await page.evaluate(() => parts.length), p0 = await page.evaluate(() => { const q = parts[parts.length - 1]; return [q.x, q.y]; });
    await page.keyboard.press('q'); await page.waitForTimeout(60);
    if (await page.evaluate(() => parts.length) !== n0 + 1 || await page.evaluate(() => parts[parts.length - 1].t) !== 'coil') out.push('Q did not place another coil');
    const h0 = await page.evaluate(() => history.length), id = await page.evaluate(() => [...sel.parts][0]), at = () => page.evaluate(i => { const q = parts.find(z => z.id === i); return [q.x, q.y]; }, id);
    const a0 = await at();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
    const a1 = await at();
    if (a1[0] !== a0[0] + 2 * 20 || a1[1] !== a0[1] + 5 * 20) out.push('arrows: ' + a0 + ' -> ' + a1);
    if (await page.evaluate(() => history.length) !== h0 + 1) out.push('a run of nudges is not one undo step');
    await page.keyboard.press('Control+z'); if (String(await at()) !== String(a0)) out.push('undo after nudging: ' + await at());
    await page.keyboard.press('Escape'); await page.evaluate(i => { sel = selOne('p', i); draw(); }, id);
    await page.keyboard.press('F2'); await page.waitForTimeout(60);
    if (!await page.evaluate(() => { const a = document.activeElement; return !!a.closest('#editpanel') && /SELECT|INPUT/.test(a.tagName); })) out.push('F2 did not go to the letter');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('x'); if (await page.evaluate(i => parts.some(q => q.id === i), id)) out.push('X did not delete');
    await page.keyboard.press('g'); await page.waitForTimeout(100); if (await page.evaluate(() => editing)) out.push('G did not go to Run');
    await page.keyboard.press('g'); await page.waitForTimeout(100); if (!await page.evaluate(() => editing)) out.push('G did not come back to Build');
    await page.evaluate(() => { cam = { x: 0, y: 200, z: 2, fit: false }; draw(); });
    await page.keyboard.press('z'); if (!await page.evaluate(() => cam.fit)) out.push('Z did not fit');
    await page.keyboard.press('F1'); await page.waitForTimeout(60);
    if (!await page.evaluate(() => document.getElementById('keys-dlg').open)) out.push('F1 did not open the list');
    const listed = await page.evaluate(() => document.getElementById('keys-dlg').textContent);
    for (const w of ['Select', 'Wire', 'Switch Build and Run', 'Place another', 'Nudge a grid step', 'Jump to its letter', 'Fit the whole circuit', 'Press the picked button', 'Print Diagram']) if (!listed.includes(w)) out.push('the list leaves out ' + w);
    await page.keyboard.press('w'); if (await page.evaluate(() => tool) === 'wire') out.push('keys reach the panel with the list open');
    await page.click('#keys-close'); await page.click('#keys-btn'); if (!await page.evaluate(() => document.getElementById('keys-dlg').open)) out.push('the keyboard button did not open the list');
    const tips = await page.evaluate(() => ['[data-tool="select"]', '[data-tool="wire"]', '#del', '#tab-run', '#zoom-fit'].map(q => document.querySelector(q).dataset.tip));
    ['(E)', '(W)', 'X or Delete', 'G switches', '(Z)'].forEach((k, i) => { if (!tips[i].includes(k)) out.push('tip leaves out ' + k); });
    return out;
  });

  await check('Keys fixed for now (Dallas, 12 Nov 2026): no Change Keys or Default Settings in the F1 box; a change left in this browser by the trial is not used', async page => {
    const out = [];
    await page.evaluate(() => localStorage.setItem(KB.store, JSON.stringify({ select: ['s'] }))); await page.reload(); await page.waitForTimeout(300);
    await page.mouse.move(650, 600); await page.keyboard.press('w'); await page.keyboard.press('e');
    if (await page.evaluate(() => tool) !== 'select' || await page.evaluate(() => KB_NOW.select[0]) !== 'e') out.push('the stored change was used');
    if (!(await page.evaluate(() => document.querySelector('[data-tool="select"]').dataset.tip.endsWith('(E)')))) out.push('tip');
    await page.keyboard.press('F1');
    if (await page.evaluate(() => !!document.querySelector('#keys-dlg .kmode').offsetParent || !!document.getElementById('kb-reset').offsetParent || !!document.querySelector('#kb-lists .kchip'))) out.push('Change Keys or Default Settings showing');
    return out;
  });

  await check('A limit switch with more contacts (Dallas, 12 Nov 2026): another one given its number (LS1 twice) takes its settings, keeps them in step, works with it, and is linked to it on the print', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { W = 700; W_USER = 700;
      [['lsw-no', 120], ['lsw-nc', 280]].forEach(([k, y]) => { parts.push(newPart(k, 240, y), P('lamp', 480, y, { L: '', color: '#00B050' })); wires.push(Wr(0, y, 180, y), Wr(300, y, 420, y), Wr(540, y, W, y)); });
      parts.find(p => p.t === 'lsw' && p.y === 120).color = '#C00000'; normalize(); draw(); });
    const two = () => page.evaluate(() => parts.filter(p => p.t === 'lsw').sort((a, b) => a.y - b.y));
    let L = await two(); if (L.map(p => p.L).join() !== '1,2') out.push('numbers at first: ' + L.map(p => p.L));
    // the second one picked; its number list offers LS1 as another contact; picked, it takes LS1's colour
    await page.evaluate(() => { const p = parts.find(p => p.t === 'lsw' && p.y === 280); sel = selOne('p', p.id); ribbonTab = 'part'; draw(); });
    const opts = await page.evaluate(() => [...document.getElementById('ls-num').options].map(o => o.textContent));
    if (!opts.includes('LS1 (another contact)')) out.push('number list: ' + opts.join(', '));
    await page.selectOption('#ls-num', '1'); await page.waitForTimeout(60);
    L = await two(); if (L.map(p => p.L + p.color + (p.nc ? 'nc' : 'no')).join() !== '1#C00000no,1#C00000nc') out.push('after joining LS1 (number, colour, kind): ' + L.map(p => p.L + p.color + (p.nc ? 'nc' : 'no')).join());
    const cap = await page.evaluate(() => document.getElementById('selname').textContent);
    if (!/another contact of LS1/.test(cap)) out.push('caption: ' + cap);
    const shown = await page.evaluate(() => { const n = document.getElementById('ls-num'); return n.options[n.selectedIndex].textContent; });
    if (shown !== 'LS1 (another contact)') out.push('its Number box shows: ' + shown);
    // a colour picked on the main one: the other contact takes it too
    await page.evaluate(() => { const p = parts.find(p => p.t === 'lsw' && p.y === 120); sel = selOne('p', p.id); ribbonTab = 'part'; draw(); });
    if (!/the main one of 2 contacts of LS1/.test(await page.evaluate(() => document.getElementById('selname').textContent))) out.push('main caption');
    await page.locator('#ls-colour [role=radio], #ls-colour button').nth(0).click(); await page.waitForTimeout(60);
    L = await two(); if (L[0].color !== L[1].color) out.push('colour not kept in step: ' + L.map(p => p.color));
    if (await page.evaluate(() => [...wiringIssues(network())].length)) out.push('wiring issues: ' + JSON.stringify(await page.evaluate(() => [...wiringIssues(network())])));
    // run: working LS1 works both contacts (NO closes, NC opens)
    const lamps = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').sort((a, b) => a.y - b.y).map(p => +!!coilOn[p.id]).join(''));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let st = await lamps(); if (st !== '01') out.push('at rest: ' + st);
    await page.evaluate(() => press('1', true)); await page.waitForTimeout(400);
    st = await lamps(); if (st !== '10') out.push('LS1 worked: ' + st);
    await page.evaluate(() => { press('1', false); setSpeed(1); }); await page.click('#tab-edit');
    // the print: a dashed line from one contact down to the other
    await page.keyboard.press('Control+p'); await page.waitForTimeout(400);
    const dash = await page.evaluate(() => [...document.querySelectorAll('#pd-view line[stroke-dasharray]')].length);
    if (dash < 1) out.push('no dashed link on the print');
    return out;
  });

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})();
