/* Automatic checks for the Circuit Builder.

   Run after every change:   node tests/run-tests.js        (build first: python3 build.py)

   Each check opens the built page (dist/Circuit_Builder.html) in a headless browser and either drives the
   simulation directly, in fast time, or uses the mouse the way a student would. The page's own functions are
   all visible to the checks, so they can set up circuits and read back exactly what is lit and when.
   Needs Node.js and Playwright (npm install playwright, or set NODE_PATH to where it is installed). */
const path = require('path');
const BUILD_S2 = String.raw`(opt) => { sel = null; loadPreset('blank'); VSYS = '208'; PH_COL = [...VSYS_LIST['208'].col]; W = 1800;
      for (const [L, x] of [['1', 120], ['2', 220]]) parts.push(newPart('ph-' + L, x, 80));
      const t1 = newPart('xfm', 500, 300); if (opt.pr) t1.pr = opt.pr; if (opt.ug) t1.ug = true; if (opt.s24) t1.s24 = true; parts.push(t1);
      const t2 = newPart('xfm', 1100, 300); t2.ct = true; t2.L = '2'; parts.push(t2);
      wires.push(Wr(120, 120, 120, 160), Wr(120, 160, 1040, 160), Wr(440, 160, 440, 220), Wr(1040, 160, 1040, 220), Wr(220, 120, 220, 190), Wr(220, 190, 1160, 190), Wr(560, 190, 560, 220), Wr(1160, 190, 1160, 220));
      wires.push(Wr(440, 380, 440, 600), Wr(560, 380, 560, 520));
      parts.push(P('coil', 500, 600, { L: 'X', color: '#FFDC00', ...(opt.crv ? { rv: opt.crv } : {}) })); wires.push(Wr(560, 520, 600, 520), Wr(600, 520, 600, 600), Wr(560, 600, 600, 600));
      wires.push(Wr(1040, 380, 1040, 700), Wr(1100, 380, 1100, 420), Wr(1100, 420, 1500, 420), Wr(1500, 420, 1500, 600), Wr(1160, 380, 1160, 400), Wr(1160, 400, 1600, 400), Wr(1600, 400, 1600, 700));
      parts.push(P('lamp', 1270, 560, { L: '', color: '#FFDC00' })); wires.push(Wr(1040, 560, 1210, 560), Wr(1330, 560, 1500, 560));
      parts.push(P('htr', 1320, 700, { L: '1', rv: 240 })); wires.push(Wr(1040, 700, 1260, 700), Wr(1380, 700, 1600, 700));
      parts.push(newPart('gnd', 300, 800)); if (opt.wired) { parts.push(newPart('gnd', 680, 560)); wires.push(Wr(600, 520, 680, 520)); }
      normalize(); }`;
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
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;   // (ONLY=some words: just the checks whose names match them (a pattern))
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
const LAST = `const lastChange = i => VTL.size ? (VTL.get(i) || [[-1e9]]).slice(-1)[0][0] : Math.max(...(ltl.get(i) || [tl[i]]).map(a => a[a.length - 1][0]));`;
// (Dallas, 25 Nov 2026) every point shows what presence.js says it should, once the circuit has settled; and the return
const SETTLED = `const settledBad = () => { const W = presenceWant(); let bad = 0, ex = ''; for (let n = 0; n < NET.nodes.length; n++) { const w = W.get(n), c = colAt(n, simT); if ((w ? w.c : null) !== c) { bad++; ex = ex || '(' + NET.nodes[n].x + ', ' + NET.nodes[n].y + ') ' + c + ' not ' + (w && w.c); } } return bad ? bad + ' points not settled, such as ' + ex : ''; };
  const labOf = n => (VCUR.get(n) || {}).lab || null;`;
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
// (a part in a kind's list out to the side of its menu (Dallas, 20 Nov 2026): the pointer over its kind's row shows it)
async function revealSub(page, kind) {
  if (await page.locator(`[data-part="${kind}"]`).isVisible()) return;
  const n = await page.evaluate(k => { const s = document.querySelector(`[data-part="${k}"]`)?.closest('.tl-sub'); return s ? [...s.parentNode.children].indexOf(s) : -1; }, kind);
  if (n < 0) return;
  const m = await page.evaluate(k => document.querySelector(`[data-part="${k}"]`).closest('.tp-menu').id, kind);
  await page.hover(`#${m} .tl-list > :nth-child(${n + 1}) > .tl-hd`); await page.waitForTimeout(30);
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
  await revealSub(page, kind);
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

  await check('Three rungs into X: all 512 combinations: X right, every rung lit up to its buttons, and the colours settle where each source can reach (Dallas, 25 Nov 2026: back-feeding allowed)', async page => {
    await runPreset(page, 'three');
    return page.evaluate(new Function(STEP + SETTLED + `
      const out = [], Ls = 'ABCDEFGHI'.split('');
      const want = () => { ${THREE_RULE} };
      const X = parts.find(p => p.t === 'coil');
      const check = tag => {
        if (want() !== !!coilOn[X.id]) out.push(tag + ': X wrong');
        for (const [N, top, bot] of [['A','B','C'], ['D','F','G'], ['E','H','I']]) {
          const n = parts.find(p => p.L === N), t = parts.find(p => p.L === top), b = parts.find(p => p.L === bot);
          if (!down[N] && !(lit(t._a, simT) && lit(b._a, simT))) out.push(tag + ': rung ' + N + ' not lit up to its buttons');
        }
        const sb = settledBad(); if (sb) out.push(tag + ': ' + sb);
        if (queue.length) out.push(tag + ': still busy');
      };
      step(4);
      for (let m = 0; m < 512; m++) { Ls.forEach((L, i) => press(L, !!(m >> i & 1))); step(7); check('combo ' + Ls.filter((L, i) => m >> i & 1).join('')); }
      let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let t = 0; t < 300; t++) { const L = Ls[Math.floor(rnd() * 9)]; press(L, !down[L]); step(rnd() < .5 ? rnd() * .5 : 0); if (t % 5 === 4) { step(8); check('random ' + t); } }
      return out.slice(0, 20);`));
  });

  await check('D/E/F circuit: all 64 combinations: X right, and the far side of an open button shows L2 (back through X) or, back-fed, L1 (Dallas, 25 Nov 2026)', async page => {
    await loadCircuit(page, DEF_CIRCUIT);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + SETTLED + `
      const out = [], Ls = 'ABCDEF'.split(''), X = parts.find(p => p.t === 'coil');
      step(4);
      for (let m = 0; m < 64; m++) {
        Ls.forEach((L, i) => press(L, !!(m >> i & 1))); step(8);
        const d = L => !!down[L], want = (!d('A') && (d('B') || d('C'))) || (!d('D') && (d('E') || d('F')));
        if (want !== !!coilOn[X.id]) out.push(m + ': X wrong');
        for (const p of parts) if (p.t === 'btn' && !closed(p) && 'BCEF'.includes(p.L)) {   // (the buttons whose far side is joined to X)
          const outEnd = btnIn(p) === p._a ? p._b : p._a;
          const want = coilOn[X.id] ? 'L1' : 'L2'; if (labOf(outEnd) !== want) out.push(m + ': far side of open ' + p.L + ' shows ' + labOf(outEnd) + ', not ' + want);
        }
        const sb = settledBad(); if (sb) out.push(m + ': ' + sb);
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

  await check('The return side: L2 is on the wires from the coils to the right edge all along, and never changes as the buttons are worked (Dallas, 25 Nov 2026)', async page => {
    await loadCircuit(page, `const Bt = (L, x, y, col) => P('btn', x, y, { L, nc: false, maint: true, color: col });
      parts = [Bt('B', 300, 160, '#0070C0'), C('X', 700, 160), Bt('C', 300, 320, '#00B050'), C('Y', 700, 320)];
      wires = [Wr(0, 160, 260, 160), Wr(340, 160, 640, 160), Wr(760, 160, 880, 160), Wr(0, 320, 260, 320), Wr(340, 320, 640, 320), Wr(760, 320, 880, 320)];`);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = []; step(3);
      const ret = () => NET.nodes.map((n, i) => [n, i]).filter(([n]) => (n.y === 160 || n.y === 320) && n.x >= 765 && n.x <= 875).map(([, i]) => colAt(i, simT));
      const check = tag => { const r = ret(); if (r.some(c => c !== OFF_WHITE)) out.push(tag + ': the return wires are not all L2: ' + [...new Set(r)].join()); };
      check('at rest');
      press('C', true); for (let i = 0; i < 4; i++) { step(1); check('C pressed'); }
      press('B', true); for (let i = 0; i < 4; i++) { step(1); check('B pressed'); }
      press('B', false); for (let i = 0; i < 5; i++) { step(1); check('B let go'); }
      return out.slice(0, 4);`));
  });

  await check("A branch switched off: the hot side drains from where it was cut on toward the coil, in order, L2 showing from underneath behind it (Dallas, 25 Nov 2026)", async page => {
    await runPreset(page, 'three');
    return page.evaluate(new Function(STEP + `
      const out = []; step(3); press('H', true); press('I', true); step(6);
      const pts = [[380, 640], [480, 640], [480, 590], [480, 540], [480, 140]].map(([x, y]) => NET.nodes.findIndex(n => n.x === x && n.y === y)), dark = pts.map(() => null);
      // (how soon the change can get to each point: from E, along the wires and closed buttons (through H, or I, whichever is nearer))
      const E = parts.find(p => p.L === 'E'), soon = new Map(); { const h = heap(); for (const n of [E._a, E._b]) { soon.set(n, 0); h.push(0, n); } walk(h, soon, () => true, e => conducts(e)); }
      press('E', true); const t0 = simT, was = pts.map(n => colAt(n, simT));   // (the hot side going: dark, or L2 showing from underneath (Dallas, 25 Nov 2026))
      for (let i = 0; i < 1200; i++) { step(1 / 120); pts.forEach((n, k) => { if (dark[k] === null && colAt(n, simT) !== was[k]) dark[k] = simT - t0; }); }
      if (dark.some(d => d === null) || dark.some((d, k) => d < soon.get(pts[k]) - 0.05) || dark.slice(0, 4).some(d => d > dark[4])) out.push('switch-off order wrong: ' + dark.map(t => t === null ? 'never' : t.toFixed(2)).join(' ') + ' (soonest ' + pts.map(n => (soon.get(n) ?? -1).toFixed(2)).join(' ') + ')');
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
  await check('B and C both pressed: X and Y fed, the wires between them hot (Dallas, 25 Nov 2026: where colours mix is left for later)', async page => {
    await loadCircuit(page, CROSS_CIRCUIT);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], at = (x, y) => colAt(NET.nodes.findIndex(n => n.x === x && n.y === y), simT);
      step(2); press('B', true); press('C', true); step(6);
      const lab = (x, y) => (VCUR.get(NET.nodes.findIndex(n => n.x === x && n.y === y)) || {}).lab;
      for (const [x, y, what] of [[600, 380, 'the wire into Y'], [600, 140, 'the wire into X'], [440, 200, 'the riser between them'], [340, 260, 'the wire along the middle']])
        if (lab(x, y) !== 'L1' || !at(x, y)) out.push(what + ' is not hot: ' + lab(x, y) + ' ' + at(x, y));
      if (parts.filter(p => p.t === 'coil').some(p => !coilOn[p.id])) out.push('X and Y not both in');
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

  await check('G cutting off six branches at once: the hot side drains from G as a front (no wire changes before it gets there), L2 showing from underneath behind it (Dallas, 25 Nov 2026)', async page => {
    await loadCircuit(page, FAN_CIRCUIT);
    if ((await issuesNow(page)).length) return ['circuit not wired: ' + JSON.stringify(await issuesNow(page))];
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + SETTLED + `
      step(2); for (const L of 'ABCDEF') press(L, true); step(8);
      const G = parts.find(p => p.L === 'G'), t0 = simT, latest = new Map();
      // (how soon the change can get to each point: from G, along the wires and closed buttons, at the current's speed)
      { const h = heap(); for (const n of [G._a, G._b]) { latest.set(n, 0); h.push(0, n); } walk(h, latest, () => true, e => conducts(e)); }
      const hot = new Set(NET.nodes.map((_, k) => k).filter(k => labOf(k) === 'L1' && latest.has(k) && latest.get(k) > 0));
      const was = NET.nodes.map((_, k) => colAt(k, simT));
      press('G', true);
      const darkAt = new Map();   // (when the hot side went: dark, or L2 showing from underneath)
      for (let i = 0; i < 600; i++) { step(1 / 60); NET.nodes.forEach((_, k) => { if (!darkAt.has(k) && colAt(k, simT) !== was[k]) darkAt.set(k, simT - t0); }); }
      const out = [];
      for (const n of hot) { const da = darkAt.get(n), dd = latest.get(n);
        if (da !== undefined && da < dd - 0.05) out.push('(' + NET.nodes[n].x + ', ' + NET.nodes[n].y + ') went dark at ' + da.toFixed(2) + ' s, before the change could get there (' + dd.toFixed(2) + ' s)'); }
      const sb = settledBad(); if (sb) out.push(sb);
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
      step(2); const c0 = colAt(n, simT); press('A', true); const t0 = simT; while (colAt(n, simT) === c0 && simT < t0 + 10) step(1 / 240);
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
      step(2); const c0 = path.map(n => colAt(n, simT)); press('A', true); const t0 = simT, dt = 1 / 120, fr = [];   // (the front: where the colour has changed from what was there: L2, back through X)
      let k = 0; while (k < path.length && simT < t0 + 10) { step(dt); while (k < path.length && colAt(path[k], simT) !== c0[k]) k++; fr.push(k * 5); }
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
  // (on hold, Dallas 25 Nov 2026: with each source now shown wherever it reaches, a colour joining a long run a moment after
  // another speeds up from the same place, so the gap between them grows along the run. Kept for the colour-mixing stage.)
  if (process.env.TRAIN) await check('Streams that join a long stretch one after another stay together as it speeds them up (no pulling apart)', async page => {
    await loadCircuit(page, STAIR_CIRCUIT);
    if ((await issuesNow(page)).length) return ['circuit not wired: ' + JSON.stringify(await issuesNow(page))];
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + `
      const out = [], node = (x, y) => NET.nodes.findIndex(n => n.x === x && n.y === y);
      const bus = []; for (let x = 485; x < 1240; x += 5) bus.push(node(x, 600));
      step(4);
      // the rung buttons pressed one after another, a moment apart, so their colours join the long run one by one
      // (before: L2, back through X (Dallas, 25 Nov 2026); counted as not lit)
      const c0 = bus.map(n => colAt(n, simT)), cAt = k => { const c = colAt(bus[k], simT); return c === c0[k] ? null : c; };
      const changes = []; let last = cAt(0), snap = null;
      const watch = () => { const c = cAt(0); if (c !== last) { changes.push(simT); last = c; }
        if (!snap && cAt(Math.floor(bus.length * 0.75))) snap = bus.map((n, k) => cAt(k)); };
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

  await check('A contact past a coil: while it is open the coil is out, and the hot side comes through it and waits at the contact; past the contact, L2; closed, the coil is in and L2 comes back up to it (Dallas, 25 Nov 2026)', async page => {
    await loadCircuit(page, `W = W_MIN; parts = [B('A', 120, 200, true), B('C', 300, 200), C('X', 500, 200), P('con', 700, 200, { L: 'Y', nc: true }), B('E', 300, 340), C('Y', 500, 340)];
      wires = [Wr(0, 200, 80, 200), Wr(160, 200, 260, 200), Wr(340, 200, 440, 200), Wr(560, 200, 660, 200), Wr(740, 200, W, 200), Wr(200, 200, 200, 340), Wr(200, 340, 260, 340), Wr(340, 340, 440, 340), Wr(560, 340, W, 340)];`);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + SETTLED + `
      const out = [], node = (x, y) => NET.nodes.findIndex(n => n.x === x && n.y === y), lb = (x, y) => labOf(node(x, y));
      const on = L => !!coilOn[parts.find(p => p.t === 'coil' && p.L === L).id];
      step(2); press('C', true); step(4);
      if (!on('X')) out.push('X did not pick up');
      if (lb(600, 200) !== 'L2') out.push('past X, with the contact closed: ' + lb(600, 200) + ', not L2');
      // Y picks up and its NC contact past X opens: X drops out; the hot side comes through X up to the contact
      press('E', true); const t0 = simT; let dropAt = null, hotAt = null;
      for (let i = 0; i < 600; i++) { step(1 / 120); if (dropAt === null && !on('X')) dropAt = simT - t0; if (hotAt === null && lb(565, 200) === 'L1' && colAt(node(565, 200), simT)) hotAt = simT - t0; }
      if (on('X')) out.push('X stayed in with its L2-side contact open');
      if (hotAt === null) out.push('the hot side never came through X'); else if (dropAt !== null && hotAt < dropAt - 0.05) out.push('the hot side came through X ' + (dropAt - hotAt).toFixed(2) + ' s before X dropped out');
      if (lb(655, 200) !== 'L1') out.push('the X side of the contact is ' + lb(655, 200) + ', not L1 waiting there');
      if (lb(800, 200) !== 'L2') out.push('past the open contact: ' + lb(800, 200) + ', not L2');
      for (let k = 0; k < 4; k++) { press('C', !down.C); step(0.5); }
      press('C', true); step(2);
      // the contact closes: X picks up, and L2 comes back from the contact up to X
      press('E', false); step(4);
      if (!on('X')) out.push('X did not pick up again when the contact closed');
      if (lb(600, 200) !== 'L2' || lb(655, 200) !== 'L2') out.push('after the contact closed, past X is ' + lb(600, 200) + ' / ' + lb(655, 200) + ', not L2');
      const sb = settledBad(); if (sb) out.push(sb);
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
      const watch = () => { const a = colAt(n0, simT) !== null && colAt(n0, simT) !== OFF_WHITE, c = !!REC.get(X._a); if (a && !a0) ins++; if (c && !x0) outs++; a0 = a; x0 = c; };   // (in: the hot side's colour arriving; before it, L2 back through X)
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
      if (Math.min(...seenOut) < full - 0.5) out.push('the lead out of X (L2, there all along: Dallas, 25 Nov 2026) was not lit all the way throughout');
      if (Math.max(...seenIn) < full - 0.5) out.push('the lead into X never lit all the way');
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
    await page.fill('#p-letter', 'Q'); await page.dispatchEvent('#p-letter', 'change');
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
    await page.fill('#o-letter', 'Q'); await page.dispatchEvent('#o-letter', 'change');
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

  await check('Loops of wire (parallel loops nested and crossing the run): all lit while fed; let go, the dark runs out from A (nothing goes dark before it can get there), then L2 comes back through the light and every wire settles (Dallas, 25 Nov 2026)', async page => {
    await loadCircuit(page, `W_USER = W = 1000;
      parts = [P('btn', 120, 300, { L: 'A', maint: true, color: '#EC008C' }), P('lamp', 900, 300, { L: '', color: '#7030A0' })];
      wires = [Wr(0,300,80,300), Wr(160,300,840,300), Wr(960,300,W,300),
        Wr(200,100,800,100), Wr(200,100,200,300), Wr(200,300,200,500), Wr(800,100,800,300), Wr(800,300,800,500), Wr(200,500,800,500),
        Wr(240,140,680,140), Wr(240,140,240,300), Wr(680,140,680,300), Wr(320,180,620,180), Wr(320,180,320,300), Wr(620,180,620,300),
        Wr(280,460,740,460), Wr(280,300,280,460), Wr(740,300,740,460), Wr(380,420,580,420), Wr(380,300,380,420), Wr(580,300,580,420)];`);
    if ((await issuesNow(page)).length) return ['circuit not wired: ' + JSON.stringify(await issuesNow(page))];
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + SETTLED + `
      const out = [];
      step(2); press('A', true); step(10);
      const unlit = NET.nodes.map((n, k) => [n, k]).filter(([n, k]) => n.k !== 'L1' && n.k !== 'L2' && colAt(k, simT) === null);
      if (unlit.length) out.push(unlit.length + ' points stay dark while A is pressed, such as (' + unlit[0][0].x + ', ' + unlit[0][0].y + ')');
      const A = parts.find(p => p.L === 'A'), t0 = simT, latest = new Map();
      { const h = heap(); for (const n of [A._a, A._b]) { latest.set(n, 0); h.push(0, n); } walk(h, latest, () => true, e => conducts(e)); }
      const hot = NET.nodes.map((_, k) => k).filter(k => labOf(k) === 'L1' && latest.get(k) > 0);
      const was = NET.nodes.map((_, k) => colAt(k, simT));
      press('A', false);
      const darkAt = new Map(), relit = new Set();   // (when the hot side went: dark, or L2 showing from underneath)
      for (let i = 0; i < 600; i++) { step(1 / 60); NET.nodes.forEach((_, k) => { const c = colAt(k, simT); if (!darkAt.has(k) && c !== was[k]) darkAt.set(k, simT - t0); else if (darkAt.has(k) && c !== null && c !== OFF_WHITE) relit.add(k); }); }
      let early = 0;
      for (const n of hot) { const da = darkAt.get(n); if (da !== undefined && da < latest.get(n) - 0.05) early++; }
      if (early) out.push(early + ' points change before the change from A could reach them');
      if (relit.size) out.push(relit.size + ' points light up hot again after going dark');
      const sb = settledBad(); if (sb) out.push(sb);
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
    // (each pane paints only the wires in its own view: compare the wires both have in view, lit alike in each)
    const lit = await page.evaluate(() => {
      const R = [[cam.x, cam.y, viewW(), viewH()], [cam2.x, cam2.y, viewW2(), viewH2()]], inR = (b, r) => !(b[2] < r[0] || b[0] > r[0] + r[2] || b[3] < r[1] || b[1] > r[1] + r[3]);
      const n = [view, view2].map((V, k) => V.runs.filter(it => inR(it.bb, R[k]) && it.g.childElementCount).length);
      const both = view.runs.map((it, i) => [it, view2.runs[i]]).filter(([a, b]) => b && inR(a.bb, R[0]) && inR(b.bb, R[1]));
      return { n, both: both.length, differ: both.filter(([a, b]) => !!a.g.childElementCount !== !!b.g.childElementCount).length };
    });
    if (!(lit.n[0] > 0 && lit.n[1] > 0) || lit.differ) out.push('lit wires in the two panes: ' + JSON.stringify(lit));
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
  await check('Loads in series share the voltage as Ohm\'s law has it (each load its own resistance): coils stay out, lights dim, the colour drops; the source colour is kept with the circuit', async page => {
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
    // (Ohm's law, with each load's own resistance: a 2.5 kΩ relay coil and a 2.4 kΩ light take 61.2 V and 58.8 V of 120; three lights alike, 40 V each)
    if (notes.filter(s => s === 'In series: 61.2 V').length !== 1 || notes.filter(s => s === 'In series: 58.8 V').length !== 1 || notes.filter(s => s === 'In series: 40 V').length !== 3 || notes.some(s => /Not wired/.test(s))) out.push('notes: ' + notes.join(', '));
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
    if (JSON.stringify(r2) !== '[false,true,true,0.49]') out.push('coil and light in series (coil in, current through, light lit, its share): ' + JSON.stringify(r2));
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
    // (every line lit in its phase's colour, as far as it reaches: L3 too, and L1 past its tap (Dallas, 25 Nov 2026))
    const lines = await page.evaluate(() => [[200, 80], [200, 200], [200, 320], [600, 80]].map(([x, y]) => { const n = NET.nodes.findIndex(q => q.x === x && q.y === y); return colAt(n, simT) || '-'; }).join());
    if (lines !== await page.evaluate(() => [phColK(1), phColK(2), phColK(3), phColK(1)].join())) out.push('line colours: ' + lines);
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
    // (lit: a starter's line side; and its load side too, fed back through the motor's leads from the other starter (Dallas, 25 Nov 2026))
    const sides = L => page.evaluate(L => { const m = parts.find(p => p.t === 'mst' && p.L === L); return [0, 1].map(k => m._t.filter((_, i) => i % 2 === k).map(n => +!!colAt(n, simT)).join('')).join('/'); }, L);
    await tap('F'); let s = await st(); if (s !== 'run1,fwd,1') out.push('forward: ' + s);
    if ((s = await sides('Y')) !== '111/111') out.push('Y starter while running forward (line/load side lit): ' + s);
    await tap('S'); await tap('R'); s = await st(); if (s !== 'run-1,rev,1') out.push('reverse: ' + s);
    if ((s = await sides('X')) !== '111/111') out.push('X starter while running backward (line/load side lit): ' + s);
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
  await check('Flow switches: NO and NC at rest and with water flowing (blade, stem and flag together; the pipe always full; streaks appearing and gathering speed slowly, in proportion to the flow, then slowing and fading; the paddle bent over, clear of the pipe\'s top), apart from pressure switches of the same number, worked by a Flow value, saved, renumbered when pasted, printed', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const iss = await page.evaluate(() => { W = 760; W_USER = 760;
      ['fsw-no', 'fsw-nc', 'psw-no'].forEach((k, i) => { const y = 160 + i * 280, h = TERM({ t: kindOf(k) }); parts.push(newPart(k, 280, y), P('lamp', 560, y, { L: '', color: '#00B050' })); wires.push(Wr(0, y, 280 - h, y), Wr(280 + h, y, 500, y), Wr(620, y, W, y)); });
      normalize(); draw(); return [...wiringIssues(network()).keys()].join(); });
    if (iss) out.push('wiring issues: ' + iss);
    const tags = await page.evaluate(() => parts.filter(p => p.t === 'fsw').map(p => captionOf(p) + '/' + p.color).join());
    if (tags !== 'FLS1 High Flow Switch (NO)/#9B6BFF,FLS2 High Flow Switch (NC)/#9B6BFF') out.push('placed as: ' + tags);
    // (the paddle's top, upright, clear of the pipe's top inside wall, 71.5 in Dallas's units)
    const clear = await page.evaluate(() => { const v = view.parts.get(parts.find(p => p.t === 'fsw').id), pipe = v.pad.parentNode, b = v.padEnd.getBBox(), m = pipe.getCTM().inverse().multiply(v.padEnd.getCTM());
      return +Math.min(...[[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => m.b * x + m.d * y + m.f)).toFixed(2); });
    if (!(clear > 74)) out.push('the paddle reaches up to ' + clear + ' (the pipe\'s top inside is at 71.5)');
    const st = () => page.evaluate(() => { const v = view.parts.get(parts.find(p => p.t === 'fsw').id), w = FLOW[v.p ? v.p.id : parts.find(p => p.t === 'fsw').id];
      return [parts.filter(p => p.t === 'lamp').map(p => +!!coilOn[p.id]).join(''), v.water.getAttribute('opacity') === null ? 'full' : 'not', (+(v.streaks.getAttribute('opacity') || 0)).toFixed(2), v.padStrip.getAttribute('d').includes('A') ? 'bent' : 'up', v.stem.getAttribute('fill'), v.flag.getAttribute('fill'), v.stem.parentNode.parentNode === v.blade].join('|'); });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await st(); if (s !== '010|full|0.00|up|#a6a6a6|#a6a6a6|true') out.push('at rest: ' + s);
    const sp = () => page.evaluate(() => FLOW[parts.find(p => p.t === 'fsw').id].sp);
    await page.evaluate(() => { press('W1', true); press('W2', true); }); await page.waitForTimeout(350);
    const s1 = await sp(); await page.waitForTimeout(900); const s2 = await sp(); await page.waitForTimeout(3000); const s3 = await sp();
    if (!(s1 > 5 && s1 < s2 && s2 < s3 && Math.abs(s3 - 120) < 6)) out.push(`streak speed while working it: ${s1.toFixed(0)}, ${s2.toFixed(0)}, ${s3.toFixed(0)} (want rising slowly to 120)`);
    s = await st(); if (s !== '100|full|1.00|bent|#9B6BFF|#9B6BFF|true') out.push('water flowing (FLS1 and FLS2 worked): ' + s);
    await page.evaluate(() => { press('W1', false); press('W2', false); }); await page.waitForTimeout(400);
    const d1 = await sp(); if (!(d1 > 10 && d1 < 115)) out.push('just after letting go, the streaks at ' + d1.toFixed(0) + ' (want slowing)');
    await page.waitForTimeout(6000);
    s = await st(); if (!s.startsWith('010|full|0.00|up')) out.push('stopped: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'fsw').map(p => p.L + (p.nc ? 'nc' : 'no') + p.color).join());
    if (back !== '1no#9B6BFF,2nc#9B6BFF') out.push('read back: ' + back);
    // worked by a Flow value: water whenever there is flow, the switch acting at its set point and resetting at its reset point
    const pv = await page.evaluate(() => { const v = { id: 'w', name: 'Coolant', kind: 'flow', unit: 'gpm', min: 0, max: 50, start: 0 }; PV.push(v);
      const f = parts.find(p => p.t === 'fsw' && p.L === '1'); Object.assign(f, { pv: 'w', sp: 20, rs: 10 }); draw(); return PV_FOR.fsw; });
    if (pv !== 'flow') out.push('worked by a ' + pv + ' value');
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(300);
    const at = async x => { await page.evaluate(x => pvSet("w", x), x); await page.waitForTimeout(350); return page.evaluate(() => { const p = parts.find(p => p.t === 'fsw' && p.L === '1'), v = view.parts.get(p.id); return lswClosed(p) ? 'C' : 'o'; }); };
    const seq = [await at(0), await at(5), await at(25), await at(15), await at(5)].join(' ');
    if (seq !== 'o o C C o') out.push('Flow value 0, 5, 25, 15, 5 gpm (closed): ' + seq);
    // the streaks' speed in proportion to the flow: 12.5 and 50 gpm (a quarter, and all, of the range)
    const rate = async x => { await page.evaluate(x => pvSet('w', x), x); await page.waitForTimeout(6000);
      return page.evaluate(async () => { const q = FLOW[parts.find(p => p.t === 'fsw' && p.L === '1').id], a = q.ph, t = performance.now(); await new Promise(r => setTimeout(r, 300)); return ((q.ph - a + 100) % 100) / ((performance.now() - t) / 1000); }); };
    const r1 = await rate(12.5), r4 = await rate(50);
    if (!(r1 > 35 && r1 < 65 && r4 / r1 > 3.4 && r4 / r1 < 4.6)) out.push(`streaks at 12.5 and 50 gpm: ${r1.toFixed(0)} and ${r4.toFixed(0)} units a second (want about 50 and 200)`);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    // a pump (a motor driving the Flow value): running either way it builds the flow up; in reverse the water goes back
    // (the streaks slow, stop and run right to left, the paddle bent the other way, upstream)
    const how = await page.evaluate(() => { const m = newPart('mtr', 1400, 900); parts.push(m); m.pv = 'w'; drvDefaults(m, PV.find(v => v.id === 'w')); m.per = 's'; m.rate = 10; draw(); return drvText(m, PV.find(v => v.id === 'w')); });
    if (!/either way \+/.test(how)) out.push('the pump described as: ' + how);
    await page.click('#tab-run'); await page.waitForTimeout(200);
    const pump = async d => { await page.evaluate(d => { const m = parts.find(p => p.t === 'mtr'); MOT[m.id] = { st: 'run', dir: d, t0: simT }; }, d); await page.waitForTimeout(4500);
      return page.evaluate(() => { const f = parts.find(p => p.t === 'fsw' && p.L === '1'), v = view.parts.get(f.id); return [PVDIR.w, Math.round(PVV.w) > 30 ? 'up' : Math.round(PVV.w), Math.sign(Math.round(FLOW[f.id].sp)), lswClosed(f) ? 'C' : 'o', v.padStrip.getAttribute('d').includes(' 0 0 1 ') ? 'right' : v.padStrip.getAttribute('d').includes(' 0 0 0 ') ? 'left' : 'up'].join(); }); };
    const fwd = await pump(1), rev = await pump(-1);
    if (fwd !== '1,up,1,C,right') out.push('pump forward (direction, flow, streaks, switch, paddle): ' + fwd);
    if (rev !== '-1,up,-1,C,left') out.push('pump in reverse (direction, flow, streaks, switch, paddle): ' + rev);
    await page.evaluate(() => { const m = parts.find(p => p.t === 'mtr'); delete MOT[m.id]; }); await page.click('#tab-edit');
    await page.evaluate(() => { parts = parts.filter(p => p.t !== 'mtr'); draw(); });
    const pasted = await page.evaluate(() => { sel = { parts: new Set(parts.filter(p => p.t === 'fsw' && p.L === '1').map(p => p.id)), wires: new Set() }; copySel(); pasteClip(); return parts.filter(p => p.t === 'fsw').map(p => p.L).join(); });
    if (pasted !== '1,2,3') out.push('after pasting FLS1: ' + pasted);
    const pr = await page.evaluate(() => { const h = [].concat(printSheet('X')).map(x => typeof x === 'string' ? x : x.svg || x.outerHTML || JSON.stringify(x)).join(); return ['FLS1', 'FLS2', 'FLS3'].map(t => +h.includes('>' + t + '<')).join('') + (h.includes('undefined') ? ' undefined' : ''); });
    if (pr !== '111') out.push('on the print (FLS1, FLS2, FLS3 tagged): ' + pr);
    return out;
  });
  await check('Faults (troubleshooting): planted from the Faults tab and a part\'s tab; open and shorted parts, open wires and wires shorted to L2 act in Run; Faults On in Run; badges; random and Clear All; saved with the work order; undone', async page => {
    const out = [];
    if (await page.evaluate(() => !editing)) await page.click('#tab-edit');
    await page.selectOption('#preset', 'seal'); await page.waitForTimeout(80);
    await page.evaluate(() => { parts.push(P('con', 300, 420, { L: 'X' }), P('lamp', 700, 420, { L: '', color: '#00B050' })); wires.push(Wr(0, 420, 260, 420), Wr(340, 420, 640, 420), Wr(760, 420, W, 420)); normalize(); FAULTS_ON = true; draw(); });
    const state = async (hold) => {
      await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(250);
      let held = '';
      if (hold) { await page.evaluate(() => press('A', true)); await page.waitForTimeout(250); held = await page.evaluate(() => shortNow ? 'S' : '-'); await page.evaluate(() => press('A', false)); await page.waitForTimeout(250); }
      const r = await page.evaluate(() => { const X = parts.find(q => q.t === 'coil'), L = parts.find(q => q.t === 'lamp'); return (coilOn[X.id] ? 'X' : 'x') + (coilOn[L.id] ? 'L' : 'l'); });
      await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit'); return r + held;
    };
    const s0 = await state(true); if (s0 !== 'XL-') out.push('no faults, START pressed: ' + s0);
    // an open coil: the wiring up to it still lights, and pressed, the current goes up to it and stops there (Dallas, 15 Nov 2026)
    await page.evaluate(() => { parts.find(q => q.t === 'coil').fault = 'open'; draw(); });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(250);
    const upTo = async () => page.evaluate(() => { const A = parts.find(q => q.L === 'A' && q.t === 'btn'), X = parts.find(q => q.t === 'coil'), dA = DIRS.find(x => x.e.part === A), dX = DIRS.find(x => x.e.part === X);
      return [!!(dA && REC.get(dA.from)), !!(dX && REC.get(dX.from)), !!coilOn[X.id]].map(Number).join(''); });
    const o1 = await upTo(); await page.evaluate(() => press('A', true)); await page.waitForTimeout(250); const o2 = await upTo(); await page.evaluate(() => press('A', false));
    if (o1 + ' ' + o2 !== '100 110') out.push(`X coil open (START live, current at the coil, X on), before and with START pressed: ${o1} ${o2}`);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit'); await page.evaluate(() => { delete parts.find(q => q.t === 'coil').fault; draw(); });
    // planted from the Faults tab: the coil picked on the panel, then Open
    await page.click('#rt-faults');
    const id = await page.evaluate(() => parts.find(q => q.t === 'coil').id), bx = await page.locator(`#svg [data-part="${id}"]`).boundingBox();
    await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.waitForTimeout(120);
    const tabStays = await page.evaluate(() => !document.getElementById('faultbar').hidden && document.getElementById('fz-what').textContent);
    if (tabStays !== 'X Coil') out.push('picking the coil on the Faults tab: ' + tabStays);
    await page.click('#fz-kinds [data-fz="open"]');
    let s = await state(true); if (s !== 'xl-') out.push('X coil open, START pressed: ' + s);
    const badges = await page.evaluate(() => document.querySelectorAll('#svg .fz-badge').length);
    if (badges !== 1) out.push('badges for one fault: ' + badges);
    const listed = await page.evaluate(() => document.getElementById('rt-faults').textContent + ' | ' + document.getElementById('fz-list').textContent.replace(/\s+/g, ' ').trim());
    if (!/^Faults \(1\) \| 1\. X Coil\s*Open/.test(listed)) out.push('listed as: ' + listed);
    // Faults On in Run, off: it works as it should
    await page.click('#rt-faults'); await page.click('#fz-on'); s = await state(true); if (s !== 'XL-') out.push('faults off, START pressed: ' + s);
    await page.click('#rt-faults'); await page.click('#fz-on');
    await page.evaluate(() => { delete parts.find(q => q.t === 'coil').fault; draw(); });
    // a part's own tab: the lamp's contact shorted (welded): the light is on with nothing pressed
    await page.evaluate(() => { const c = parts.filter(q => q.t === 'con').find(q => q.y === 420); sel = selOne('p', c.id); ribbonTab = 'part'; draw(); });
    await page.selectOption('#p-fault', 'short'); s = await state(false); if (s !== 'xL') out.push('contact shorted, nothing pressed: ' + s);
    await page.evaluate(() => { for (const p of parts) delete p.fault; draw(); });
    const cases = [['wire on line 3 open', () => { wires.find(w => w.y1 === 420 && w.x1 === 340).fault = 'open'; }, 'Xl-'],
      ['STOP stuck open', () => { parts.find(q => q.L === 'D').fault = 'open'; }, 'xl-'],
      ['light burned out (open)', () => { parts.find(q => q.t === 'lamp').fault = 'open'; }, 'Xl-'],
      ['wire to the coil shorted to L2', () => { wires.find(w => w.y1 === 200 && w.x1 === 340).fault = 'l2'; }, 'xlS']];
    for (const [n, f, want] of cases) { await page.evaluate(f); await page.evaluate(() => draw()); s = await state(true); if (s !== want) out.push(`${n}: ${s} (want ${want})`); await page.evaluate(() => { for (const x of [...parts, ...wires]) delete x.fault; draw(); }); }
    // saved: faults on parts (fl), on wires (5th), the work order (wo); read back
    await page.evaluate(() => { parts.find(q => q.t === 'coil').fault = 'short'; wires.find(w => w.y1 === 420 && w.x1 === 340).fault = 'open'; draw(); });
    await page.click('#rt-faults'); await page.fill('#fz-wo', 'Nothing happens when START is pressed.');
    const back = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(circuitData())), c = readCircuit(d); return [d.fl.length, c.parts.filter(p => p.fault).map(p => p.t + ':' + p.fault).join(), c.wires.filter(w => w.fault).map(w => w.fault).join(), c.wo].join(' | '); });
    if (back !== '1 | coil:short | open | Nothing happens when START is pressed.') out.push('read back: ' + back);
    // the work order box takes its own keys: Backspace and Delete edit the text, never the circuit (Dallas, 15 Nov 2026)
    await page.evaluate(() => { sel = selOne('p', parts.find(q => q.t === 'lamp').id); draw(); });
    await page.click('#fz-wo'); await page.keyboard.press('End'); for (let i = 0; i < 9; i++) await page.keyboard.press('Backspace');
    const wo = await page.evaluate(() => [WORK_ORDER, parts.some(q => q.t === 'lamp')].join(' | '));
    if (wo !== 'Nothing happens when START is | true') out.push('typing Backspace in the work order: ' + wo);
    await page.evaluate(() => { sel = null; draw(); });
    // a shorted coil: the wiring up to it still lights (the rung's buttons live, as with a healthy coil), and in the short
    // the current does not pass through the other loads onto their return side (Dallas, 15 Nov 2026)
    const d = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'fwdrev_mcr.json'), 'utf8');
    await page.evaluate(d => { useCircuit(readCircuit(JSON.parse(d)), 'x'); parts.find(q => q.t === 'coil' && q.label === 'MCR').fault = 'short'; FAULTS_ON = true; draw(); }, d);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(5));
    const live = await page.waitForFunction(() => { const r = parts.find(q => q.t === 'btn' && q.label === 'RESET'), d = DIRS.find(x => x.e.part === r); return !!(d && REC.get(d.from)); }, null, { timeout: 6000 }).then(() => true, () => false);
    if (!live) out.push('MCR coil shorted: no power reaching the RESET button');
    await page.waitForFunction(() => { const lamp = parts.find(q => q.t === 'lamp' && q.y > parts.find(z => z.label === 'MCR').y); return !!coilOn[lamp.id]; }, null, { timeout: 6000 }).catch(() => out.push('the pilot light never came on'));
    await page.evaluate(() => { const lamp = parts.find(q => q.t === 'lamp' && q.y > parts.find(z => z.label === 'MCR').y); window.__lampOut = DIRS.find(x => x.e.part === lamp); press('D', true); });
    // (the supply is never cut while a fuse clears the short: no pulse out of the transformer, Dallas 15 Nov 2026)
    await page.evaluate(() => { window.__cut = false; const f = () => { for (const [id, v] of NET.feedV) if (v === 1 && !REC.get(id)) window.__cut = true; if (!Object.keys(BLOWN).length || window.__n++ < 30) requestAnimationFrame(f); }; window.__n = 0; f(); });
    // (the fuse blows as the current reaches the shorted coil, not the moment RESET is pressed)
    await page.waitForTimeout(100); const early = await page.evaluate(() => Object.keys(BLOWN).length);
    if (early) out.push('the fuse blew the moment RESET was pressed');
    const blown = await page.waitForFunction(() => Object.keys(BLOWN).length > 0, null, { timeout: 6000 }).then(() => true, () => false);
    if (!blown) out.push('pressing RESET with the MCR coil shorted did not blow the fuse');
    // (just after: the pilot light still lit, its current not yet run out; no short-circuit notice, the fuse cleared it)
    const after = await page.evaluate(() => [!!coilOn[window.__lampOut.e.part.id], document.getElementById('fault').hidden].join());
    if (after !== 'true,true') out.push('just after the fuse blew (pilot light still lit, no notice): ' + after);
    if (await page.evaluate(() => window.__cut)) out.push('the supply was cut off and put back while the fuse cleared the short (a pulse out of the transformer)');
    // (the current goes on through the shorted coil, out along the wire past it, as the circuit dies)
    const through = await page.waitForFunction(() => { const m = parts.find(z => z.label === 'MCR'), d = DIRS.find(x => x.e.part === m), o = (OUTS.get(d.to) || []).find(x => x.e.kind === 'seg' && ALLOW.has(x) || x.drain);
      return !!REC.get(d.to) && !!(o && REC.get(o.to)); }, null, { timeout: 4000 }).then(() => true, () => false);
    if (!through) out.push('the current did not go on through the shorted MCR coil');
    await page.waitForTimeout(300);
    const leak = await page.evaluate(() => { const d = window.__lampOut, r = d && REC.get(d.to); return !!(r && !r.ret); });
    if (leak) out.push('after the fuse blew, L1 had passed through the pilot light onto its return side');
    await page.evaluate(() => { press('D', false); setSpeed(1); }); await page.click('#tab-edit');
    await page.selectOption('#preset', 'seal'); await page.waitForTimeout(80);
    await page.evaluate(() => { parts.push(P('con', 300, 420, { L: 'X' }), P('lamp', 700, 420, { L: '', color: '#00B050' })); wires.push(Wr(0, 420, 260, 420), Wr(340, 420, 640, 420), Wr(760, 420, W, 420)); normalize(); parts.find(q => q.t === 'coil').fault = 'short'; wires.find(w => w.y1 === 420 && w.x1 === 340).fault = 'open'; draw(); });
    await page.click('#rt-faults');
    // random and Clear All; undo brings them back
    await page.click('#fz-clear'); let n = await page.evaluate(() => faulted().length); if (n !== 0) out.push('after Clear All: ' + n);
    await page.evaluate(() => undo()); n = await page.evaluate(() => faulted().length); if (n !== 2) out.push('after undoing Clear All: ' + n);
    await page.click('#fz-random'); n = await page.evaluate(() => faulted().length); if (n !== 3) out.push('after Random Fault: ' + n);
    await page.evaluate(() => { for (const x of [...parts, ...wires]) delete x.fault; WORK_ORDER = ''; mainTab = 'home'; ribbonTab = 'home'; sel = null; draw(); });
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
  await check('Start from… (Dallas, 19 Nov 2026): a ready-made circuit takes its own name; the open circuit\'s name is not carried onto it', async page => {
    const r = await page.evaluate(() => { circuitName = 'My Old Circuit'; const sel = document.getElementById('preset'); const o = [...sel.options].find(o => o.value && o.value !== 'blank');
      sel.value = o.value; sel.dispatchEvent(new Event('change')); openSaveDialog(); const v = document.getElementById('save-name').value; document.getElementById('save-dlg')?.close?.();
      return { want: o.textContent, name: circuitName, field: v, title: document.title, label: document.body.innerText.includes('My Old Circuit') }; });
    const out = [];
    if (r.name !== r.want) out.push('name after Start from: ' + r.name + ' (want ' + r.want + ')');
    if (r.field !== r.want) out.push('Save box name: ' + r.field);
    if (r.label || /My Old/.test(r.title)) out.push('the old name still shows on the page');
    return out;
  });
  await check('Dashed links (Dallas, 19 Nov 2026): a selector\'s blocks linked one above another step around a coil drawn between them; with nothing between, the link is straight', async page => {
    const r = await page.evaluate(() => { const run = mid => { parts = []; wires = []; sel = null; const a = newPart('sel', 400, 200); parts.push(a); const b = newPart('sel', 400, 640); b.L = a.L; parts.push(b);
        if (mid) { const c = newPart('coil', 400, 420); parts.push(c); } draw(); return [...document.querySelectorAll('path[stroke-dasharray="7 5"]')].map(p => p.getAttribute('d')); };
      return [run(false), run(true)]; });
    const out = [];
    if (r[0].length !== 1 || !/^M400 [\d.]+V[\d.]+$/.test(r[0][0])) out.push('nothing between: ' + JSON.stringify(r[0]) + ' (want one straight link)');
    if (r[1].length !== 1) out.push('coil between: ' + r[1].length + ' links');
    else { const xs = [...r[1][0].matchAll(/H([\d.]+)/g)].map(m => +m[1]); if (!xs.some(x => Math.abs(x - 400) >= 40)) out.push('coil between: the link still runs straight through it: ' + r[1][0]); }
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
    const opts = await page.evaluate(() => { sel = selOne('p', parts[26].id); draw(); renderProps(); return [...document.getElementById('p-letter-list').options].map(o => o.value); });
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
    for (const [btn, kinds] of [['bt', ['btn-no-mom', 'btn-nc-mom', 'btn-no-mnt', 'btn-nc-mnt']], ['sw', ['sel', 'lsw-no', 'lsw-nch', 'tsw-no', 'tsw-nc', 'tsw-nol', 'tsw-ncl', 'psw-no', 'psw-nc', 'fsw-no', 'fsw-nc']], ['out', ['coil', 'timer', 'timer-off', 'lamp', 'sol', 'htr']], ['ct', ['con-no-i', 'con-nc-i', 'con-no-t', 'con-nc-t']]]) {
      await page.click(`#${btn}-btn`);
      for (const k of kinds) { await revealSub(page, k); if (!(await page.isVisible(`#${btn}-menu [data-part="${k}"]`))) out.push(`${k} not in the ${btn} menu`); }
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
      if (m) await page.click(`#${m}-btn`); await revealSub(page, k); await page.click(`[data-part="${k}"]`); await page.waitForTimeout(60);
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
    // (its load half: L2, back through the light it fed (Dallas, 25 Nov 2026))
    const half = await page.evaluate(id => { const v = view.parts.get(id), f = L => (L.g.getAttribute('fill') || '').toLowerCase(); return [f(v.cur) !== 'transparent', f(v.old) === OFF_WHITE || f(v.cur) === OFF_WHITE, v.mark.getAttribute('display') !== 'none'].join(); }, ids[0]);
    if (half !== 'true,true,true') out.push('FU1 blown: line half lit, load half L2, crack shown: ' + half);
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
        ['NC temperature switch', `P('tsw', 640, 200, { L: '1', nc: true })`, 'T1', true, 60], ['NC pressure switch', `P('psw', 640, 200, { L: '1', nc: true })`, 'P1', true, 60], ['NC flow switch', `P('fsw', 640, 200, { L: '1', nc: true })`, 'W1', true, 60]]) {
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
    await page.setViewportSize({ width: 1250, height: 1000 }); await page.waitForTimeout(150);
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await page.evaluate(() => { const cyl = pvNew('position'); cyl.name = 'Position'; PV.push(cyl); const m = newPart('mtr', 600, 300); parts.push(m); m.pv = cyl.id; drvDefaults(m, cyl); normalize(); fit(true); draw(); });
    await page.waitForTimeout(150);   // (the window was just resized: let the redraw that follows settle before finding the motor)
    const id = await page.evaluate(() => parts.find(q => q.t === 'mtr').id), bx = await page.locator(`#svg [data-part="${id}"]`).boundingBox();
    await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.waitForTimeout(200);
    const groups = () => page.evaluate(() => [...document.querySelectorAll('#editpanel .tgroup')].filter(g => g.offsetParent).map(g => { const r = g.getBoundingClientRect(); return [g.querySelector('.label') ? g.querySelector('.label').textContent : '?', r.left, r.right]; }).sort((a, b) => a[1] - b[1]));
    const g = await groups();
    for (let i = 1; i < g.length; i++) if (g[i][1] < g[i - 1][2] - 0.5) out.push(g[i][0] + ' overlaps ' + g[i - 1][0]);
    if (!g.some(x => x[0] === 'Part') || !g.some(x => x[0] === 'Picture')) out.push('groups: ' + g.map(x => x[0]).join(', '));
    const more0 = await page.evaluate(() => document.getElementById('editpanel').dataset.more || '');
    if (more0 !== 'r') out.push('cut-off end not marked: ' + more0);
    const eb = await page.locator('#editpanel').boundingBox(); await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2); await page.mouse.wheel(0, 2000); await page.waitForTimeout(200);
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

  await check('Faults that would do nothing are not offered: no short to L2 on a wire already on L2 or in the three-phase power, no shorted fuse; Random Fault plants only ones that do something', async page => {
    const out = [];
    await page.selectOption('#preset', 'seal'); await page.waitForTimeout(80);
    const r = await page.evaluate(() => { const w = (x1, y1) => wires.find(q => q.x1 === x1 && q.y1 === y1);
      return { l2side: faultWhy(w(760, 200), true, 'l2'), hot: faultWhy(w(340, 200), true, 'l2'), open: faultWhy(w(760, 200), true, 'open') }; });
    if (!r.l2side || r.hot || r.open) out.push(JSON.stringify(r));
    // on the Faults tab: Shorted to L2 greyed out for the wire into L2
    await page.click('#rt-faults');
    await page.evaluate(() => { sel = selOne('w', wires.find(q => q.x1 === 760 && q.y1 === 200).id); draw(); showFaults(); });
    const dis = await page.evaluate(() => [...document.querySelectorAll('#fz-kinds [data-fz]')].map(b => b.dataset.fz + ':' + b.disabled).join());
    if (dis !== ':false,open:false,l2:true,gnd:true') out.push('buttons: ' + dis);
    await page.evaluate(() => setFault(wires.find(q => q.x1 === 760 && q.y1 === 200), true, 'l2'));
    if (await page.evaluate(() => wires.some(q => q.fault))) out.push('planted a short to L2 on L2 anyway');
    await page.selectOption('#preset', 'fwdrev'); await page.waitForTimeout(80);
    const p3 = await page.evaluate(() => { const f = parts.find(q => q.t === 'fu1'); const pw = wires.filter(w => faultWhy(w, true, 'l2') && /power/.test(faultWhy(w, true, 'l2'))).length;
      return [faultWhy(f, false, 'short') ? 'no' : 'yes', faultWhy(f, false, 'open') ? 'no' : 'yes', pw > 0]; });
    if (p3.join() !== 'no,yes,true') out.push('fuse short / open / power wires: ' + p3);
    for (let i = 0; i < 40; i++) {
      const bad = await page.evaluate(() => { for (const q of [...parts, ...wires]) delete q.fault; document.getElementById('fz-random').click();
        const L = faulted(); return L.length === 1 && faultWhy(L[0][0], L[0][1], L[0][0].fault) ? faultWhere(...L[0]) + ' ' + L[0][0].fault : ''; });
      if (bad) { out.push('Random Fault planted: ' + bad); break; }
    }
    return out;
  });

  // (Dallas, 25 Nov 2026) each source goes wherever it can: along the wires and through closed switches, and through a load
  // with no current through it, up to an open switch; a pressed button back-feeds the open seal-in beside it; changes run
  // as fronts from the switch that moved; a coil dropping out: its feed drains away first, then the return comes back
  await check('Where each source reaches (Dallas, 25 Nov 2026, his residential panel): the neutral back through the coils up to the open buttons and contacts; START back-feeds the open seal-in; the mix runs as a front from the seal-in; STOP drains, then the neutral comes back', async page => {
    const d = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'residential_panel.json'), 'utf8');
    await page.evaluate(d => { useCircuit(readCircuit(JSON.parse(d)), ''); }, d);
    await page.click('#tab-run');
    return page.evaluate(new Function(STEP + SETTLED + `
      const out = [], node = (x, y) => NET.nodes.findIndex(n => n.x === x && n.y === y), lb = (x, y) => labOf(node(x, y)), c = (x, y) => colAt(node(x, y), simT);
      const N = 'P7', H = 'P5', seal = parts.find(p => p.t === 'con' && p.x === 1440 && p.y === 2740);
      step(15);
      for (const [x, y, what] of [[1540, 2640, 'past START'], [1540, 2740, 'past the seal-in'], [2300, 2640, "CR1's hot side"], [1900, 2780, 'past the rung 2 CR1 contact'], [2300, 2780, "CR2's hot side"]])
        if (lb(x, y) !== N || !c(x, y)) out.push('at rest, ' + what + ' is ' + lb(x, y) + ' ' + c(x, y) + ', not the neutral');
      if (lb(1180, 2640) !== H) out.push('at rest, past STOP is ' + lb(1180, 2640));
      // START: its colour runs out over the neutral as a front, never leaving a gap
      const watch = node(1700, 2640), seen = [];
      press('START', true);
      for (let i = 0; i < 240 && !CON[seal.id].shut; i++) { step(1 / 120); const k = colAt(watch, simT); if (seen[seen.length - 1] !== k) seen.push(k); }
      if (seen[0] !== NEU_COL) out.push('just after START, the wire 200 past it already changed: ' + seen[0]);
      if (seen.includes(null)) out.push('a gap (dark) between the neutral and the hot side as START\\'s colour ran out: ' + seen.join(' > '));
      if (lb(1540, 2740) !== H || !c(1540, 2740)) out.push('with the seal-in still open, its far side is ' + lb(1540, 2740) + ' (START should back-feed it)');
      // the seal-in closes: the change runs from it, so the far end of the wire to CR1 changes after the near end
      while (!CON[seal.id].shut && simT < 40) step(1 / 120);
      const xs = [1600, 1800, 2000, 2200], first = xs.map(() => null), was = xs.map(x => c(x, 2640)), t0 = simT;
      for (let i = 0; i < 480; i++) { step(1 / 120); xs.forEach((x, k) => { if (first[k] === null && c(x, 2640) !== was[k]) first[k] = simT - t0; }); }
      for (let k = 1; k < xs.length; k++) if (first[k] !== null && first[k - 1] !== null && first[k] < first[k - 1] - 1e-6) out.push('the colour changed at ' + xs[k] + ' (' + first[k].toFixed(2) + ' s) before ' + xs[k - 1] + ' (' + first[k - 1].toFixed(2) + ' s)');
      step(6); press('START', false); step(6);
      if (lb(1540, 2640) !== H) out.push('START let go: past it is ' + lb(1540, 2640) + ' (the seal-in should back-feed it)');
      // STOP: past it drains first, then the neutral comes back through the coils
      const sn = node(1180, 2640), seq = [], pn = node(1700, 2640), pseq = [];
      press('STOP', true);
      for (let i = 0; i < 2400; i++) { step(1 / 120); const k = colAt(sn, simT); if (seq[seq.length - 1] !== k) seq.push(k); const q = colAt(pn, simT); if (pseq[pseq.length - 1] !== q) pseq.push(q); }
      // (past START the neutral was underneath the hot side all along: it shows as the hot side drains, never a dark gap)
      if (pseq.includes(null) || pseq[pseq.length - 1] !== NEU_COL) out.push('past START as STOP drained it: ' + pseq.join(' > ') + ' (should go straight to the neutral)');
      // (between STOP and START, with the seal-in open too: joined to nothing but open switches, so dark; past START, the neutral)
      if (seq[seq.length - 1] !== null) out.push('past STOP: ' + seq.join(' > ') + ' (should end dark: nothing reaches it)');
      for (const [x, y] of [[1540, 2640], [1540, 2740], [2300, 2640], [2300, 2780]]) if (lb(x, y) !== N) out.push('STOP held: (' + x + ', ' + y + ') is ' + lb(x, y));
      const sb = settledBad(); if (sb) out.push(sb);
      return out;`));
  });

  await check('Where each source reaches, on bars (Dallas, 25 Nov 2026, the seal-in preset): L2 back through X up to A and the seal-in; past A its colour at once; A back-feeds the open seal-in; D drains, then L2 comes back', async page => {
    await page.selectOption('#preset', 'seal'); await page.click('#tab-run');
    return page.evaluate(new Function(STEP + SETTLED + `
      const out = [], X = parts.find(p => p.t === 'coil'), A = parts.find(p => p.L === 'A'), seal = parts.find(p => p.t === 'con'), D = parts.find(p => p.L === 'D');
      const far = p => btnIn(p) === p._a ? p._b : p._a;
      step(4);
      if (labOf(far(A)) !== 'L2' || labOf(seal._b) !== 'L2') out.push('at rest, past A / the seal-in: ' + labOf(far(A)) + ' / ' + labOf(seal._b));
      press('A', true); step(0.6);
      // (past a button its colour at once, not shading in from what came in (Dallas, 25 Nov 2026))
      { const a = NET.nodes[far(A)], nx = a.x + (a.x > A.x ? 10 : -10), k = NET.nodes.findIndex(n => n.x === nx && n.y === a.y), want = flowOf(btnColour('A'));
        for (const n of [far(A), k]) if (colAt(n, simT) !== want) out.push('just past A: ' + colAt(n, simT) + ', not its colour ' + want); }
      if (CON[seal.id].shut) out.push('(the seal-in closed too soon to see)');
      else { const sides = [seal._a, seal._b].map(labOf); if (sides.some(l => l !== 'L1')) out.push('A pressed, seal-in still open: its sides are ' + sides); }
      step(4); press('A', false); step(4);
      if (!coilOn[X.id]) out.push('X did not hold in');
      if (labOf(far(A)) !== 'L1') out.push('A let go: past it is ' + labOf(far(A)) + ' (the seal-in should back-feed it)');
      press('D', true); step(6);
      if (coilOn[X.id]) out.push('D did not drop X');
      // (past D, up to A and the seal-in: joined only to open switches, so dark; past them, L2 back through X)
      for (const n of [far(A), seal._b, X._a]) if (labOf(n) !== 'L2') out.push('D held: (' + NET.nodes[n].x + ', ' + NET.nodes[n].y + ') is ' + labOf(n) + ', not L2');
      for (const n of [far(D), seal._a]) if (labOf(n) !== null) out.push('D held: (' + NET.nodes[n].x + ', ' + NET.nodes[n].y + ') is ' + labOf(n) + ', not dark');
      const sb = settledBad(); if (sb) out.push(sb);
      return out;`));
  });

  await check('A broken neutral (Dallas, 15 Nov 2026: FWDREV_OvrTrvl, the return wire under rung 7 open): the hot side still lights up to every open button and contact; REV held, the current goes through the R coil (which stays out) and on up to the break, and stops there', async page => {
    const out = [];
    const d = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'fwdrev_ovrtrvl.json'), 'utf8');
    await page.evaluate(d => { const c = readCircuit(JSON.parse(d)); useCircuit(c, ''); wires.find(q => q.x1 === 1900 && q.y1 === 1200 && q.y2 === 1600).fault = 'open'; draw(); }, d);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(900);
    const lit1 = await page.evaluate(() => { const b = L => parts.find(q => q.t === 'btn' && q.L === L), r = parts.find(q => q.t === 'con' && q.L === 'R' && !q.nc);
      return [lit(b('C')._a, simT) || lit(b('C')._b, simT), lit(r._a, simT) || lit(r._b, simT)]; });
    if (lit1.join() !== 'true,true') out.push('REV / R contact branch dark with the neutral broken: ' + lit1);
    await page.evaluate(() => press('C', true)); await page.waitForTimeout(900);
    const r = await page.evaluate(() => { const R = parts.find(q => q.t === 'coil' && q.L === 'R'), w = wires.find(q => q.x1 === 1900 && q.y1 === 1200), at = (x, y) => NET.nodes.findIndex(n => n.x === x && n.y === y && (n.k === key(x, y) || n.k.endsWith('#' + w.id)));
      const lb = n => (VCUR.get(n) || {}).lab || '-';
      return { on: !!coilOn[R.id], past: lb(R._b), below: lb(at(1900, 1500)), above: lb(at(1900, 1300)), top: lb(at(1900, 1200)) }; });
    // (the hot side through R (which stays out) and on down to the break; above the break, the return, back from L2 (Dallas, 25 Nov 2026))
    if (r.on || r.past !== 'L1' || r.below !== 'L1' || r.above !== 'L2' || r.top !== 'L2') out.push('REV held: ' + JSON.stringify(r));
    await page.evaluate(() => { press('C', false); setSpeed(1); }); await page.click('#tab-edit');
    return out;
  });

  await check('Scenarios (Dallas, 16 Nov 2026): several sets of faults on one circuit, each with its own work order; one in force at a time (Run uses it); saved and opened again; undo; Delete renumbers', async page => {
    const out = [];
    await page.selectOption('#preset', 'seal'); await page.waitForTimeout(80); await page.click('#rt-faults');
    await page.evaluate(() => { setFault(parts.find(q => q.t === 'coil'), false, 'open'); WORK_ORDER = 'one'; });
    await page.click('#fz-scen-new'); await page.evaluate(() => { setFault(parts.find(q => q.t === 'btn' && !q.nc), false, 'open'); WORK_ORDER = 'two'; });
    await page.click('#fz-scen-new'); await page.evaluate(() => { setFault(wires.find(q => q.x1 === 340 && q.y1 === 200), true, 'open'); WORK_ORDER = 'three'; });
    const now = () => page.evaluate(() => [SCEN + 1, WORK_ORDER, faulted().map(([x, w]) => (w ? 'wire' : x.t) + ':' + x.fault).join()].join(' '));
    if (await page.evaluate(() => document.getElementById('rt-faults').textContent) !== 'Faults (3 Scenarios)') out.push('tab name');
    await page.click('#fz-scen [data-sc="0"]'); if (await now() !== '1 one coil:open') out.push('scenario 1: ' + await now());
    await page.click('#fz-scen [data-sc="1"]'); if (await now() !== '2 two btn:open') out.push('scenario 2: ' + await now());
    // Run works the scenario in force: in scenario 1 X never pulls in; in 2 (START open) neither; in 3 nor (wire open); faults off, it does
    await page.click('#fz-scen [data-sc="0"]'); await page.click('#tab-run'); await page.evaluate(() => { setSpeed(300); press('A', true); }); await page.waitForTimeout(400);
    if (await page.evaluate(() => !!coilOn[parts.find(q => q.t === 'coil').id])) out.push('scenario 1 in Run: X pulled in');
    await page.evaluate(() => press('A', false)); await page.click('#tab-edit'); await page.click('#rt-faults');
    // saved and opened again
    const d = await page.evaluate(() => JSON.stringify(circuitData()));
    await page.evaluate(d => { useCircuit(readCircuit(JSON.parse(d)), ''); }, d);
    const back = await page.evaluate(() => [SCEN_N, SCEN, SCEN_WO.join('/'), wires.filter(w => w.fz).length, parts.filter(p => p.fz).length].join(' '));
    if (back !== '3 0 one/two/three 1 2') out.push('opened again: ' + back);
    // undo a new scenario
    await page.click('#fz-scen-new'); if (await page.evaluate(() => SCEN_N) !== 4) out.push('no fourth');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(80);
    if (await page.evaluate(() => [SCEN_N, SCEN].join()) !== '3,0') out.push('undo: ' + await page.evaluate(() => [SCEN_N, SCEN].join()));
    // delete scenario 2: 3 becomes 2
    await page.click('#fz-scen [data-sc="1"]'); await page.click('#fz-scen-del');
    if (await page.evaluate(() => SCEN_N) !== 2) out.push('delete');
    await page.click('#fz-scen [data-sc="1"]'); if (await now() !== '2 three wire:open') out.push('after delete, scenario 2: ' + await now());
    // what the Fault Finder offers: one can be turned off, never both
    await page.click('#fz-off-r'); await page.click('#fz-off-n');
    const off = await page.evaluate(() => [FF_OFFER.r, FF_OFFER.n, JSON.stringify(circuitData().ffo)].join());
    if (off !== 'false,true,[0,1]') out.push('offers: ' + off);
    return out;
  });

  await check('The Troubleshooter\'s pieces stay out of the Circuit Builder (no Troubleshoot tab, meter or side panel; current still shown; wires uninsulated)', async page => {
    const out = [];
    const st = await page.evaluate(() => ({ ts: TS_MODE, bar: !!document.getElementById('tsbar'), meter: !!document.getElementById('ts-meter'), side: !!document.getElementById('ts-side'), cls: document.body.classList.contains('ts') }));
    if (st.ts || st.bar || st.meter || st.side || st.cls) out.push(JSON.stringify(st));
    await runPreset(page, 'io'); await page.evaluate(() => { setSpeed(300); press('A', true); }); await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ runs: view.runs.reduce((n, r) => n + r.g.childElementCount, 0), jackets: document.querySelectorAll('#svg path[stroke="#2f3236"]').length, blocks: document.querySelectorAll('#svg rect[fill="#5d636a"]').length }));
    if (!r.runs) out.push('no current shown');
    if (r.jackets || r.blocks) out.push('Troubleshooter look in the Builder: ' + JSON.stringify(r));
    return out;
  });

  // ---- a whole machine's print (Dallas, 16 Nov 2026: the Amatrol drill station, 125 rungs, rebuilt from his print)
  await check('A whole machine: the drill station (375 parts) opens complete, is wired with no warnings, and goes into Run quickly', async page => {
    const out = [], json = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'drill-station.json'), 'utf8');
    await page.evaluate(j => useCircuit(readCircuit(JSON.parse(j)), ''), json);
    const n = await page.evaluate(() => parts.length);
    if (n !== JSON.parse(json).parts.length) out.push(`opened ${n} of ${JSON.parse(json).parts.length} parts (the old limit was 200)`);
    const warn = await page.evaluate(() => { const m = wiringIssues(network()); return [...m.keys()].length; });
    if (warn) out.push(warn + ' wiring warnings');
    const ms = await page.evaluate(() => { const t = performance.now(); setMode(true); return performance.now() - t; });
    if (ms > 4000) out.push(`going into Run took ${Math.round(ms)} ms`);
    return out;
  });
  await check('The circuit solve (banded, for big prints) gives the same voltages as solving every junction against every other', async page => {
    const r = await page.evaluate(() => {
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      let worst = 0;
      for (let t = 0; t < 20; t++) {
        const n = 20 + Math.floor(rnd() * 60), links = [], diag = new Float64Array(n), rhs = new Float64Array(n);
        for (let i = 1; i < n; i++) links.push([i, Math.floor(rnd() * i), 0.001 + rnd()]);           // (a tree: all joined)
        for (let k = 0; k < n; k++) links.push([Math.floor(rnd() * n), Math.floor(rnd() * n), rnd()]);   // (and some loops)
        for (let k = 0; k < 3; k++) { const i = Math.floor(rnd() * n), g = 0.01 + rnd(); diag[i] += g; rhs[i] += g * rnd(); }
        const [x] = netSolve(n, links, diag, [rhs]);
        // the same, every junction against every other
        const A = Array.from({ length: n }, () => new Float64Array(n + 1));
        for (let i = 0; i < n; i++) { A[i][i] += diag[i]; A[i][n] = rhs[i]; }
        for (const [i, j, g] of links) if (i !== j) { A[i][i] += g; A[j][j] += g; A[i][j] -= g; A[j][i] -= g; }
        for (let c = 0; c < n; c++) { const d = A[c][c]; for (let q = 0; q < n; q++) if (q !== c && A[q][c]) { const k = A[q][c] / d; for (let z = c; z <= n; z++) A[q][z] -= k * A[c][z]; } }
        for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(A[i][n] / A[i][i] - x[i]));
      }
      return worst;
    });
    return r < 1e-9 ? [] : ['largest difference ' + r];
  });
  await check('A selector drawn on two rungs, closed in a different position on each, feeding the same wire from either end: every position gets through', async page => {
    const out = [];
    const d = { app: 'order-of-operations-circuit-builder', v: 1, w: 1000,
      parts: [['sel', 160, 200, 'S', 0, 1, '0070C0', 3, 4, null, 'A/B/C', 0], ['coil', 700, 200, 'X', 0, 1, 'FFDC00'],
              ['sel', 160, 400, 'S', 0, 1, '0070C0', 3, 1, null, 'A/B/C', 0], ['coil', 700, 400, 'Y', 0, 1, 'EC008C']],
      wires: [[0, 200, 100, 200], [220, 200, 640, 200], [760, 200, 1000, 200], [0, 400, 100, 400], [220, 400, 640, 400], [760, 400, 1000, 400], [400, 200, 400, 400]] };
    await page.evaluate(j => useCircuit(readCircuit(JSON.parse(j)), ''), JSON.stringify(d));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300));
    const both = () => page.evaluate(() => parts.filter(p => p.t === 'coil').map(p => coilOn[p.id] ? 1 : 0).join(''));
    for (const [pos, want] of [[0, '11'], [1, '00'], [2, '11'], [0, '11']]) {
      await page.evaluate(k => turn('S', k), pos); await page.waitForTimeout(450);
      const got = await both(); if (got !== want) out.push(`position ${'ABC'[pos]}: coils ${got}, should be ${want}`);
    }
    return out;
  });
  await check('The drill station runs: AUTO seals in, a two-hand MACHINE CYCLE starts the table and clamp, and drill 1 extends in AUTO', async page => {
    const out = [], json = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'drill-station.json'), 'utf8');
    await page.evaluate(j => useCircuit(readCircuit(JSON.parse(j)), ''), json);
    await page.evaluate(() => { setMode(true); setSpeed(10); setTimersReal(true); });
    const settle = async () => { for (let i = 0; i < 300; i++) { await page.waitForTimeout(40); if (await page.evaluate(() => !busyQueue() && simT > busyUntil + .5 && !Object.keys(autoRel).length)) return; } };
    const on = l => page.evaluate(l => { const p = parts.find(q => q.label === l); return !!coilOn[p.id]; }, l);
    const click = async l => { await page.evaluate(l => { const k = parts.find(q => q.label === l).L; press(k, true); autoRel[k] = true; }, l); await settle(); };
    await settle(); await click('AIR ON'); await click('AUTO');
    if (!await on('CR1')) out.push('AUTO: CR1 did not seal in');
    await page.evaluate(() => { for (const p of parts) if (p.t === 'sel' && p.names && p.names[2] === 'CYCLE') turn(p.L, 0); }); await settle();
    const mc = await page.evaluate(() => parts.filter(p => p.label === 'MACH CYC' && !p.nc).map(p => p.L));
    await page.evaluate(m => { press(m[0], true); press(m[1], true); }, mc);
    for (let i = 0; i < 80 && !await on('CR5'); i++) await page.waitForTimeout(50);
    if (!await on('CR5')) out.push('MACHINE CYCLE: CR5 did not pick up');
    await page.evaluate(m => { press(m[0], false); press(m[1], false); }, mc); await settle();
    if (!await on('CR1')) out.push('CR1 dropped out as the cycle started (TR6 handing over to rung 9)');
    for (const k of ['11', '12', '5', '6']) { await page.evaluate(k => press(k, true), k); await settle(); }   // (table leaves home, reaches PRS2; clamp leaves LS5, reaches LS6)
    for (let i = 0; i < 60 && !await on('CR26'); i++) await page.waitForTimeout(50);
    if (!await on('CR22')) out.push('drill 1 cycle relay CR22 not in');
    if (!await on('CR26')) out.push('drill 1 extend relay CR26 not in (its selector\'s AUTO drawing feeds wire 105 from below)');
    return out;
  });

  // ---- O³ link (Dallas, 16 Nov 2026): Circuit Builder and Print Builder open each other's work
  const PB_PAGE = 'file://' + path.resolve(__dirname, '..', '..', 'print-builder', 'source', 'dist', ...(process.argv.includes('--demo') ? ['demo'] : []), 'Print_Builder.html');
  // (a page of Print Builder alongside, for its ready-made prints and for drawing circuits as prints)
  const withPB = async (page, fn) => { const pb = await page.context().newPage(); const errs = []; pb.on('pageerror', e => errs.push(e.message)); await pb.goto(PB_PAGE); await pb.waitForTimeout(300); try { return await fn(pb); } finally { if (errs.length) page.errors.push(...errs.map(e => 'Print Builder: ' + e)); await pb.close(); } };
  // the nets a circuit makes: which part terminals are joined (by wires, and continuations of one number)
  const NETSIG = `const netSig = d => {
    // (as Circuit Builder joins wires: where a wire ends, or at a part's terminal; wires that only cross are not joined)
    const par = new Map(), f = k => { if (!par.has(k)) par.set(k, k); let r = k; while (par.get(r) !== r) r = par.get(r); par.set(k, r); return r; }, u = (a, b) => { const A = f(a), B = f(b); if (A !== B) par.set(A, B); };
    const at = new Map(), joins = new Set();
    d.wires.forEach((w, wi) => { const [x1, y1, x2, y2] = w.map(Number), n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 20; joins.add(x1 + ',' + y1); joins.add(x2 + ',' + y2); f('w' + wi);
      for (let i = 0; i <= n; i++) { const k = (x1 + (x2 - x1) * i / n) + ',' + (y1 + (y2 - y1) * i / n); if (!at.has(k)) at.set(k, []); at.get(k).push('w' + wi); } });
    const T = [], J = new Map();
    for (const a of d.parts) { const rot = ['fu1', 'ph', 'l1', 'l2', 'jmp'].includes(a[0]) ? (Math.round(+a[7]) || 0) : 0;
      linkCbTerms(a[0] === 'est' ? 'btn' : a[0], +a[1], +a[2], rot).forEach((q, i) => { const k = q.join(','), node = 't' + k; joins.add(k); f(node); if (a[0] === 'jmp') { if (J.has(a[3])) u(node, J.get(a[3])); else J.set(a[3], node); } else T.push([a[0] + '@' + a[1] + ',' + a[2] + '#' + i, node]); }); }
    for (const k of joins) { const ws = at.get(k) || []; if (par.has('t' + k)) ws.forEach(w => u('t' + k, w)); for (let i = 1; i < ws.length; i++) u(ws[0], ws[i]); }
    const g = new Map(); for (const [n, k] of T) { const r = f(k); if (!g.has(r)) g.set(r, []); g.get(r).push(n); }
    return [...g.values()].map(x => x.sort().join(' ')).sort().join('\\n'); };`;

  await check('O³ link: the terminal table shared with Print Builder matches where Circuit Builder\'s parts really join (every part, every turn)', async page => {
    return page.evaluate(() => {
      const out = [];
      for (const key of Object.keys(LINK_CB_TERMS)) {
        const [t, r] = key.split('@'), row = [t, 400, 400, t === 'jmp' ? '1' : 'A', 0, 1, ''];
        if (r) row.push(+r);
        const p = readCircuit({ parts: [row], wires: [] }).parts[0], got = JSON.stringify(terms(p).map(([x, y]) => [x - 400, y - 400])), want = JSON.stringify(LINK_CB_TERMS[key]);
        if (got !== want) out.push(key + ': table ' + want + ', Circuit Builder ' + got);
      }
      return out;
    });
  });

  await check('O³ link: Print Builder\'s motor starter print opens as a circuit that runs: START pulls in M and the motor runs, STOP drops it out', async page => {
    const print = await withPB(page, pb => pb.evaluate(() => template('starter')));
    const out = [], r = await page.evaluate(d => { openFromPrint(d, 'Starter'); document.getElementById('link-dlg').close(); return [parts.length, parts.filter(p => p.t === 'btn').map(p => p.label).sort().join(), document.getElementById('link-body').textContent]; }, print);
    if (r[0] < 15) out.push('only ' + r[0] + ' parts');
    if (r[1] !== 'START,STOP') out.push('buttons: ' + r[1]);
    if (!/built as a circuit you can run/.test(r[2])) out.push('arrival note: ' + r[2]);
    await page.evaluate(() => { setMode(true); setSpeed(10); }); await page.waitForTimeout(800);
    const st = () => page.evaluate(() => [!!coilOn[parts.find(p => p.t === 'coil').id], Object.values(MOT).map(m => m.st).join()].join());
    const push = async l => { const L = await page.evaluate(l => parts.find(p => p.label === l).L, l); await page.evaluate(L => press(L, true), L); await page.waitForTimeout(500); await page.evaluate(L => press(L, false), L); await page.waitForTimeout(800); };
    let s = await st(); if (s !== 'false,off') out.push('at first: ' + s);
    await push('START'); s = await st(); if (s !== 'true,run') out.push('after START: ' + s);
    await push('STOP'); s = await st(); if (s !== 'false,off') out.push('after STOP: ' + s);
    return out;
  });

  await check('O³ link: every ready-made circuit and the drill station go to Print Builder and come back; unchanged, exactly as they were; changed on the print, the same parts in the same places, joined the same way', async page => {
    const out = [];
    await page.evaluate(NETSIG + 'window.netSig = netSig;');
    const circs = await page.evaluate(() => Object.keys(PRESETS).map(n => { loadPreset(n); return [n, circuitData()]; }));
    circs.push(['drill station', JSON.parse(require('fs').readFileSync(path.join(__dirname, 'fixtures', 'drill-station.json'), 'utf8'))]);
    // (Dallas, 21 Nov 2026: a reversing motor on bars, its two starters fed straight from the phase boxes: its rungs spread out on the
    // print, but never through a starter, whose poles keep their spacing, or its wires miss them)
    circs.push(['reversing on bars', await page.evaluate(() => { const C = { app: 'order-of-operations-circuit-builder', v: 1, name: 'Rev', w: 2180, pw: 'bars', pc: ['E8413C', '3F7FFF', '00FF64'],
      parts: [['ph', 100, 120, '1', 0, 1, '', 3], ['ph', 100, 240, '2', 0, 1, '', 3], ['ph', 100, 360, '3', 0, 1, '', 3], ['mst', 1160, 240, 'CR1', 0, 1, ''], ['mst', 1160, 620, 'CR2', 0, 1, ''], ['mtr', 1980, 240, '1', 0, 1, '']],
      wires: [[140, 120, 580, 120], [580, 120, 1120, 120], [1200, 120, 1500, 120], [1500, 120, 1820, 120], [140, 240, 700, 240], [700, 240, 1120, 240], [1200, 240, 1400, 240], [1400, 240, 1820, 240], [140, 360, 820, 360], [820, 360, 1120, 360], [1200, 360, 1300, 360], [1300, 360, 1820, 360],
        [820, 360, 820, 500], [820, 500, 1120, 500], [1200, 500, 1500, 500], [1500, 120, 1500, 500], [700, 240, 700, 620], [700, 620, 1120, 620], [1200, 620, 1400, 620], [1400, 240, 1400, 620], [580, 120, 580, 740], [580, 740, 1120, 740], [1200, 740, 1300, 740], [1300, 360, 1300, 740]], pv: [], pd: [], pl: [] };
      PRESETS.__rev = () => { const c = readCircuit(C); return [c.parts, c.wires, c.w, c.fixed, c]; }; loadPreset('__rev'); delete PRESETS.__rev; return circuitData(); })]);
    const prints = await withPB(page, pb => pb.evaluate(cs => cs.map(([n, d]) => { openCircuit(d, undefined, 'tight'); $('link-dlg').close(); return [n, JSON.parse(JSON.stringify(doc)), checkPrint().filter(i => /without reaching anything/.test(i.title)).length]; }), circs));
    for (let i = 0; i < circs.length; i++) {
      const [n, d] = circs[i], [, print, loose] = prints[i];
      const r = await page.evaluate(([print, d]) => {
        const a = printToCircuit(print), same = a.notes.same && JSON.stringify(a.data) === JSON.stringify(d);
        const ch = JSON.parse(JSON.stringify(print)); ch.link.fp = 'changed'; const b = printToCircuit(ch);
        const key = r => r.slice(0, 3).join(','), A = d.parts.map(key).sort().join(' '), B = b.data.parts.map(key).sort().join(' ');
        return [same, A === B, netSig(d) === netSig(b.data)];
      }, [print, d]);
      if (!r[0]) out.push(n + ': not exactly the same back');
      if (!r[1]) out.push(n + ': changed print, parts not where they were');
      if (!r[2]) out.push(n + ': changed print, joined differently');
      if (loose && n !== 'fwdrev') out.push(n + ': ' + loose + ' loose wire ends on the print');
    }
    if (prints.find(p => p[0] === 'drill station')[1].sheets.length < 2) out.push('the drill station should run over several sheets');
    return out;
  });

  await check('O³ link (Dallas, 17 Nov 2026): the drill station drawn as a print is clean: letter portrait, no L1/L2 rails (its uprights are wires 3 and 2), no junction where wires only cross, no loose ends, sheets broken only between rungs (no continuation but the uprights, none under the title block), each sheet centred, linked buttons in line, the loads in one column on the right', async page => {
    const out = [], d = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'fixtures', 'drill-station.json'), 'utf8'));
    const r = await withPB(page, pb => pb.evaluate(d => { const res = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); const doc0 = res.doc; loadDoc(JSON.parse(JSON.stringify(doc0))); refresh(true);
      const iss = checkPrint().filter(i => i.sev === 'e' && !/used twice/.test(i.title)).map(i => i.title);
      let crossJoins = 0, rails = 0;
      for (const s of doc0.sheets) { rails += s.parts.filter(p => p.t === 'rail').length;
        // (a junction where only two straight wires meet across each other, neither turning: a crossing drawn as a join)
        const use = new Map(); for (const w of s.wires) for (const e of [w.a, w.b]) if (e.n) use.set(e.n, (use.get(e.n) || 0) + 1);
        for (const n of s.nodes) if ((use.get(n.id) || 0) === 4) crossJoins++; }
      // (four-way joins the circuit really has: four wires ending at one point)
      const endsAt = new Map(); for (const w of d.wires) for (const k of [w[0] + ',' + w[1], w[2] + ',' + w[3]]) endsAt.set(k, (endsAt.get(k) || 0) + 1);
      const realFour = [...endsAt.values()].filter(n => n >= 4).length;
      // (each sheet break: how many wires it cuts. The two uprights always; more than that, a branch cut in two)
      const perBreak = doc0.sheets.slice(1).map(s => s.parts.filter(p => p.brk && p.t === 'cnt_in').length);
      // (the uprights' numbers, where they run onto the next sheet: wire 3 down the left, 2 down the right)
      const A = analyse(), ups = new Set(); doc0.sheets.forEach(s => { for (const p of s.parts) if (p.brk && p.t === 'cnt_out') { const w = s.wires.find(w => [w.a, w.b].some(e => e.p === p.id)); if (w) ups.add(A.label.get(A.wireRoot(s, w))); } });
      // (Dallas, 17 Nov 2026: continuations clear of the title block; each sheet's ladder centred; a button drawn on two rungs in one line)
      let underTB = 0, offCentre = [], skew = 0; const loadsOff = [];
      doc0.sheets.forEach((s, k) => { doc.cur = k; S = doc.sheets[k]; refresh(true);
        for (const p of s.parts) if (p.brk && p.y + 80 > drawH(s)) underTB++;
        const xs = s.parts.filter(p => p.t !== 'rail').flatMap(p => { const e = extOf(p); return [p.x + e.x0, p.x + e.x1]; }).concat(RUNGNUMS.map(r => r.x0), XREFS.map(r => r.x1));
        const l = Math.min(...xs), r = drawW(s) - Math.max(...xs); if (l < 30 || r < 10) offCentre.push((k + 1) + ': past the border ' + Math.round(l) + '/' + Math.round(r));
        // (Dallas, 17 Nov 2026: the ladder centred on the sheet's middle line: its two uprights as far in from each edge)
        const ux = s.parts.filter(p => p.brk).map(p => linkPbTerms(p)[0][0]); if (ux.length >= 2) { const a = Math.min(...ux), b = drawW(s) - Math.max(...ux); if (Math.abs(a - b) > 40) offCentre.push((k + 1) + ': uprights ' + Math.round(a) + '/' + Math.round(b) + ' in from the edges'); }
        const byTag = new Map(); for (const p of s.parts) if (/^pbm?_/.test(p.t)) { if (!byTag.has(p.tag)) byTag.set(p.tag, new Set()); byTag.get(p.tag).add(p.x); }
        for (const xs2 of byTag.values()) if (xs2.size > 1) skew++;
        // (the loads in one column on the right, as Dallas draws them)
        const lx = s.parts.filter(p => ['coil', 'pl', 'sol'].includes(p.t)).map(p => p.x), cnt = new Map(); for (const x of lx) cnt.set(x, (cnt.get(x) || 0) + 1);
        if (lx.length >= 3 && Math.max(...cnt.values()) < lx.length * .75) loadsOff.push((k + 1) + ': ' + [...cnt].map(([x, n]) => x + '×' + n).join(' ')); });
      return { paper: doc0.sheets[0].paper || 'letter', land: !!doc0.sheets[0].land, sheets: doc0.sheets.length, iss, crossJoins, realFour, rails, perBreak, ups: [...ups], underTB, offCentre, skew, loadsOff }; }, d));
    if (r.loadsOff.length > 1) out.push('loads not in one column: ' + r.loadsOff.join('; '));   // (one sheet may have a starter rung with its overloads after the coil)
    if (r.underTB) out.push(r.underTB + ' continuations reaching into the title block');
    if (r.offCentre.length) out.push('ladder not centred on sheets ' + r.offCentre.join(', '));
    if (r.skew) out.push(r.skew + ' buttons drawn on two rungs out of line');
    if (r.paper !== 'letter' || r.land) out.push('paper: ' + r.paper + (r.land ? ' landscape' : ''));
    if (r.rails) out.push(r.rails + ' rails: its uprights should be plain wires');
    if (!r.ups.includes('3') || !r.ups.includes('2')) out.push('the uprights run onto the next sheet numbered ' + r.ups.join(', ') + ', not 3 and 2');
    if (r.iss.length) out.push('Check Print: ' + r.iss.slice(0, 4).join('; '));
    if (r.crossJoins > r.realFour) out.push(r.crossJoins + ' four-way joins, ' + r.realFour + ' in the circuit (wires that only cross, joined)');
    // (as few continuations as can be: each break only the two uprights, no rung's own wires cut)
    if (r.perBreak.some(n => n > 2)) out.push('sheet breaks cutting wires: ' + r.perBreak.join(', '));
    return out;
  });

  await check('O³ link (Dallas, 17 Nov 2026): on the print every tag, name and cross-reference stays clear of the others and inside the border, landscape or tighter', async page => {
    const out = [], d = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'fixtures', 'drill-station.json'), 'utf8'));
    const r = await withPB(page, pb => pb.evaluate(d => ['land', 'tight', 'wrap', 'cont'].map(mode => { const res = circuitToPrint(d, { uid, defaultTB, long: mode }); loadDoc(JSON.parse(JSON.stringify(res.doc)));
      let over = 0, outside = 0, labs = 0;
      doc.sheets.forEach((s, k) => { doc.cur = k; S = s; refresh(true); const L = PLABS.filter(l => l.x1 != null); labs += L.length;
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], c = L[j]; if (a.id !== c.id && a.x0 < c.x1 - 2 && c.x0 < a.x1 - 2 && a.y0 < c.y1 - 2 && c.y0 < a.y1 - 2) over++; }
        for (const x of XREFS) if (x.x1 > drawW(s) - 4) outside++;
        for (const p of s.parts) if (p.t !== 'rail' && (p.x < 0 || p.x > drawW(s))) outside++; });
      return { mode, land: !!doc.sheets[0].land, kept: res.notes.changed.some(t => /^Kept portrait/.test(t)), over, outside, labs }; }), d));
    for (const x of r) { if (x.over) out.push(x.mode + ': ' + x.over + ' tags or names on top of each other'); if (x.outside) out.push(x.mode + ': ' + x.outside + ' things past the border'); if (x.labs < 300) out.push(x.mode + ': only ' + x.labs + ' labels'); }
    if (!r[0].land && !r[0].kept) out.push('landscape when needed: neither landscape nor kept portrait with a note');
    if (r[1].land || r[2].land) out.push('tighter and fold should stay portrait');
    return out;
  });

  await check('Print Diagram and Print Builder (Dallas, 19 Nov 2026): each fused branch its own wire letter (a line through one fuse, then two in parallel: L1, L1A, L1B, L1C), the same in both programs', async page => {
    const d = { app: 'order-of-operations-circuit-builder', v: 1, name: 'Branches', w: 880, parts: [['ph', 100, 120, '1', 0, 1, '', 3], ['fu1', 280, 120, '1', 0, 1, ''], ['fu1', 440, 120, '2', 0, 1, ''], ['fu1', 440, 240, '3', 0, 1, '']],
      wires: [[140, 120, 240, 120], [320, 120, 400, 120], [320, 120, 320, 240], [320, 240, 400, 240], [480, 120, 560, 120], [480, 240, 560, 240]] };
    await page.evaluate(d => { const c = readCircuit(d); PV = c.pv; parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; POWER = c.power; SRC_COL = c.src; PH_COL = c.ph; circuitName = c.name; normalize(); fit(true); draw(); }, d);
    const cb = await page.evaluate(() => { const h = document.createElement('div'); h.innerHTML = printSheet('x', true).html; return [...new Set([...h.querySelectorAll('.wn')].map(t => t.textContent))].filter(l => /^L/.test(l)).sort().join(','); });
    const pb = await withPB(page, pb => pb.evaluate(d => { const res = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(res.doc))); refresh(true);
      return [...new Set(analyse().label.values())].filter(l => /^L/.test(l)).sort().join(','); }, d));
    const out = [];
    if (cb !== 'L1A,L1B,L1C') out.push('Circuit Builder print: ' + cb + ' (want L1A,L1B,L1C past the fuses)');
    if (pb !== 'L1,L1A,L1B,L1C') out.push('Print Builder: ' + pb + ' (want L1,L1A,L1B,L1C)');
    return out;
  });
  await check('Flow switch (Dallas, 20 Nov 2026): its sensing arm, at rest, bent any way by the water either way, never touches the pipe\'s walls but at its foot; it is shaded, with a cupped vane on its end', async page => {
    return page.evaluate(() => { const out = [];
      const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); document.body.appendChild(svg); const g = document.createElementNS(NS, 'g'); svg.appendChild(g);
      const p = P('fsw', 300, 300, { L: '1' }); p.color = '#9B6BFF'; const v = {}; drawFlow(p, g, 300, 300, v); const pipe = v.pad.parentNode;
      if (!v.padLit || !v.padEnd.querySelector('path[fill="url(#gPaddle)"]')) out.push('no shading or vane');
      const toPipe = (el, x, y) => { const m = pipe.getCTM().inverse().multiply(el.getCTM()); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
      const TOP = 71.5, BOT = 103.5, HALF = 3.75;
      for (const dir of [1, -1]) for (let i = 0; i <= 20; i++) { v.pos = i / 20; v.fd = dir; v.bk = null; fswPaddle(v);
        const L = v.padSh.getTotalLength();
        for (let l = 0; l <= L; l += .5) { const q = v.padSh.getPointAtLength(l), foot = Math.abs(q.x - 160) <= HALF + .01 && q.y >= BOT - HALF - .5;
          if (q.y - HALF < TOP + .5 || (!foot && q.y + HALF > BOT - .3)) { out.push(`arm at ${(dir * i / 20).toFixed(2)}: (${q.x.toFixed(1)}, ${q.y.toFixed(1)}) touches a wall`); break; } }
        const b = v.padEnd.getBBox(), cs = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => toPipe(v.padEnd, x, y)), ys = cs.map(c => c[1]);
        if (Math.min(...ys) - .65 < TOP + .5 || Math.max(...ys) + .65 > BOT - .3) out.push(`vane at ${(dir * i / 20).toFixed(2)}: from y ${Math.min(...ys).toFixed(1)} to ${Math.max(...ys).toFixed(1)} touches a wall`); }
      svg.remove(); return out.slice(0, 6); });
  });
  await check('Default speed (Dallas, 20 Nov 2026): Set as Default ▾ keeps the speed for this circuit (saved in its file, undone with Undo) or for this computer; a circuit starts at its own speed, else this computer\'s, else 1×; each can be cleared; it goes to Print Builder and back', async page => {
    const r = await page.evaluate(() => { const out = {}, click = id => { document.getElementById('speed-def').click(); document.getElementById(id).click(); };
      try { localStorage.removeItem(SPEED_KEY); } catch (_) {}
      loadPreset('andor'); CIRC_SPEED = null; startSpeed(); out.start = speed;
      setSpeed(2); document.getElementById('speed-def').click(); out.menu = !document.getElementById('speed-menu').hidden && /starts at 2×/.test(document.getElementById('spd-circ-sub').textContent); document.getElementById('spd-circ').click();
      out.saved = circuitData().sp; out.menuShut = document.getElementById('speed-menu').hidden;
      undo(); out.undone = CIRC_SPEED; redo();
      const d = circuitData(); setSpeed(1); useCircuit(readCircuit(JSON.parse(JSON.stringify(d))), 'x'); out.reopened = speed;
      setSpeed(5); click('spd-here'); out.here = localStorage.getItem(SPEED_KEY);
      document.getElementById('preset').value = 'traffic'; document.getElementById('preset').dispatchEvent(new Event('change')); out.preset = [speed, CIRC_SPEED];
      useCircuit(readCircuit(JSON.parse(JSON.stringify(d))), 'x'); out.own = speed; out.data = circuitData();
      click('spd-circ-clr'); out.cleared = [CIRC_SPEED, circuitData().sp];
      click('spd-here-clr'); out.hereCleared = localStorage.getItem(SPEED_KEY); loadPreset('andor'); startSpeed(); out.back1 = speed;
      return out; });
    const rt = await withPB(page, pb => pb.evaluate(d => { const p = circuitToPrint(d, { uid, defaultTB, long: 'tight' }).doc; const q = p.sheets[0].parts.find(x => x.t !== 'rail'); q.desc = (q.desc || '') + ' X'; return p; }, r.data));   // (changed in Print Builder on the way)
    const back = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return [CIRC_SPEED, speed]; }, rt);
    const out = [];
    if (r.start !== 1) out.push('starts at ' + r.start + ' with nothing set');
    if (!r.menu || !r.menuShut) out.push('the menu: shown with the speed ' + r.menu + ', shut after ' + r.menuShut);
    if (r.saved !== 2 || r.reopened !== 2) out.push('for this circuit: saved ' + r.saved + ', opened again at ' + r.reopened);
    if (r.undone !== null) out.push('Undo left the circuit\'s speed at ' + r.undone);
    if (r.here !== '5' || r.preset[0] !== 5 || r.preset[1] !== null) out.push('for this computer: kept ' + r.here + ', a circuit with none of its own starts at ' + r.preset);
    if (r.own !== 2) out.push('a circuit with its own speed (2×) started at ' + r.own + ' (this computer: 5×)');
    if (r.cleared.join() !== ',' || r.hereCleared !== null || r.back1 !== 1) out.push('cleared: circuit ' + r.cleared + ', computer ' + r.hereCleared + ', then starts at ' + r.back1);
    if (back[0] !== 2 || back[1] !== 2) out.push('to Print Builder and back: its speed ' + back[0] + ', starts at ' + back[1]);
    return out;
  });
  await check('Export (Dallas, 19 Nov 2026): the Export button opens a window with Print Builder in it (its icon, what it does); its button hands the circuit over in a new tab and closes the window', async page => {
    const out = [];
    const h = await page.evaluate(() => { let url = null; const k0 = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (/from=link/.test(this.href)) url = this.target === '_blank' && this.rel === 'noopener' ? this.getAttribute('href') : 'not a new-tab noopener link: ' + this.href; else k0.call(this); }; document.getElementById('export-btn').click(); const d = document.getElementById('export-dlg'), opened = d.open;
      const card = d.querySelector('.xcard'), icon = card && card.querySelector('img').getAttribute('src'), txt = card ? card.textContent : '';
      document.getElementById('export-pb').click(); const s = JSON.parse(localStorage.getItem('o3-link:handoff')); return [opened, /^data:image\/svg\+xml,/.test(icon || ''), /Print Builder/.test(txt), url, s && s.kind, d.open]; });
    if (!h[0]) out.push('the window did not open');
    if (!h[1] || !h[2]) out.push('the Print Builder card: icon ' + h[1] + ', named ' + h[2]);
    if (!/print-builder\/(demo\/)?\?from=link$/.test(h[3] || '')) out.push('opens: ' + h[3]);
    if (h[4] !== 'circuit') out.push('handed over: ' + h[4]);
    if (h[5]) out.push('the window stayed open');
    return out;
  });
  await check('Float switches (Dallas, 20 Nov 2026, design A): NO and NC, tank low at rest and full when worked (the float on its arm hinged on the left wall riding the water; the upright stem and float pushed up under the blade), worked by hand or by a Level value, saved, printed as his float symbol, and crossing to Print Builder and back as float switches', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const iss = await page.evaluate(() => { W = 760; W_USER = 760;
      ['flt-no', 'flt-nc'].forEach((k, i) => { const y = 200 + i * 300, h = TERM({ t: kindOf(k) }); parts.push(newPart(k, 280, y), P('lamp', 560, y, { L: '', color: '#00B050' })); wires.push(Wr(0, y, 280 - h, y), Wr(280 + h, y, 500, y), Wr(620, y, W, y)); });
      normalize(); draw(); return [...wiringIssues(network()).keys()].join(); });
    if (iss) out.push('wiring issues: ' + iss);
    const caps = await page.evaluate(() => parts.filter(p => p.t === 'flt').map(p => captionOf(p) + '/' + p.color).join());
    if (caps !== 'FS1 High Level Float Switch (NO)/#16C1E8,FS2 High Level Float Switch (NC)/#16C1E8') out.push('placed as: ' + caps);
    const st = () => page.evaluate(() => parts.filter(p => p.t === 'flt').map(p => { const v = view.parts.get(p.id), w = v.water.getAttribute('transform').match(/translate\(0 ([\d.]+)\)/)[1], l = v.dg.getAttribute('transform').match(/translate\(0 (-?[\d.]+)\)/)[1];
      return [lswClosed(p) ? 'C' : 'o', +(+w).toFixed(0), +(+v.arm.getAttribute('x2') > FLT_PIV[0]), (+l).toFixed(0) < 0 ? 'up' : 'down', v.dome.getAttribute('fill')].join(' '); }).join(' | ') + ' | lamps ' + parts.filter(p => p.t === 'lamp').map(p => +!!coilOn[p.id]).join(''));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await st(); if (s !== 'o 88 1 down #a6a6a6 | C 88 1 up #16C1E8 | lamps 01') out.push('at rest (tank low): ' + s);
    await page.evaluate(() => { press('#F1', true); press('#F2', true); }); await page.waitForTimeout(500);
    s = await st(); if (s !== 'C 46 1 up #16C1E8 | o 46 1 up #a6a6a6 | lamps 10') out.push('worked (tank full): ' + s);
    await page.evaluate(() => { press('#F1', false); press('#F2', false); }); await page.waitForTimeout(500);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'flt').map(p => p.L + (p.nc ? 'nc' : 'no') + p.color).join());
    if (back !== '1no#16C1E8,2nc#16C1E8') out.push('read back: ' + back);
    // worked by a Level value: the water at the value, the switch acting at its set point and resetting at its reset point
    const pv = await page.evaluate(() => { const v = { id: 'lv', name: 'Sump', kind: 'level', unit: 'in', min: 0, max: 40, start: 0 }; PV.push(v);
      const f = parts.find(p => p.t === 'flt' && p.L === '1'); Object.assign(f, { pv: 'lv', sp: 30, rs: 10 }); draw(); return PV_FOR.flt; });
    if (pv !== 'level') out.push('worked by a ' + pv + ' value');
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(300);
    const at = async x => { await page.evaluate(x => pvSet('lv', x), x); await page.waitForTimeout(350); return page.evaluate(() => { const p = parts.find(p => p.t === 'flt' && p.L === '1'), v = view.parts.get(p.id); return (lswClosed(p) ? 'C' : 'o') + Math.round(+v.water.getAttribute('transform').match(/translate\(0 ([\d.]+)\)/)[1]); }); };
    const seq = [await at(0), await at(20), await at(35), await at(20), await at(5)].join(' ');
    if (seq !== 'o88 o67 C51 C67 o83') out.push('Level 0, 20, 35, 20, 5 in (closed, water): ' + seq);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const pr = await page.evaluate(() => { const h = document.createElement('div'); h.innerHTML = printSheet('x', true).html; return [...h.querySelectorAll('text')].map(t => t.textContent).filter(t => /^FS\d/.test(t)).join(); });
    if (pr !== 'FS1,FS2') out.push('printed tags: ' + pr);
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); const ps = r.doc.sheets.flatMap(s => s.parts).filter(p => /^fs_/.test(p.t)); return [ps.map(p => p.t + ':' + p.tag).sort().join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'fs_nc:FS2,fs_no:FS1') out.push('in Print Builder: ' + pb[0]);
    delete pb[1].link; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'flt').map(p => p.L + (p.nc ? 'nc' : 'no')).sort().join() + '|' + parts.filter(p => p.t === 'stand').length; }, pb[1]);
    if (again !== '1no,2nc|0') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });
  await check('High and low switches (Dallas, 20 Nov 2026): pressure, flow and float switches come high or low, as temperature switches do; a low one placed from the Switches menu (its kind in a list out to the side), captioned and badged as low, its instrument up at rest and falling as it is worked, acting as its value falls, saved, printed LOW, and crossing to Print Builder and back as low', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    for (const [i, k] of ['psw-ncl', 'fsw-ncl', 'flt-nol', 'psw-no'].entries()) await toolbarDrop(page, k, 200 + (i % 2) * 400, 200 + Math.floor(i / 2) * 300);
    const caps = await page.evaluate(() => parts.map(p => captionOf(p) + (p.low ? '/low' : '')).join());
    if (caps !== 'PS1 Low Pressure Switch (NC)/low,FLS1 Low Flow Switch (NC)/low,FS1 Low Level Float Switch (NO)/low,PS2 High Pressure Switch (NO)') out.push('placed as: ' + caps);
    const lab = await page.evaluate(() => [...document.querySelectorAll('#svg text')].map(t => t.textContent).filter(t => /^N[OC][↑↓]$/.test(t)).sort().join());
    if (lab !== 'NC↓,NC↓,NO↑,NO↓') out.push('labels: ' + lab);
    // by hand: a low float switch's water well up at rest and down when worked; a low pressure switch's needle up, then down
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(300);
    const st = () => page.evaluate(() => { const f = parts.find(p => p.t === 'flt'), ps = parts.find(p => p.t === 'psw' && p.low), vf = view.parts.get(f.id), vp = view.parts.get(ps.id);
      return [+(+vf.water.getAttribute('transform').match(/translate\(0 ([\d.]+)\)/)[1]).toFixed(0), +(+vp.needle.getAttribute('transform').match(/rotate\(([\d.]+)/)[1]).toFixed(0), fswRate(parts.find(p => p.t === 'fsw'))].join(' '); });
    let s = await st(); if (s !== '57 310 0.6') out.push('at rest (water up, needle up, water flowing): ' + s);
    await page.evaluate(() => { press('#F1', true); press('P1', true); press('W1', true); }); await page.waitForTimeout(500);
    s = await st(); if (s !== '84 168 0') out.push('worked (water down, needle down, flow stopped): ' + s);
    await page.evaluate(() => { press('#F1', false); press('P1', false); press('W1', false); setSpeed(1); }); await page.click('#tab-edit');
    const pf = await page.evaluate(() => parts.map(p => pvFalls(p) ? 'f' : 'r').join(''));
    if (pf !== 'fffr') out.push('acting as its value falls: ' + pf);
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.map(p => p.t + (p.nc ? 'nc' : 'no') + (p.low ? 'l' : '')).join());
    if (back !== 'pswncl,fswncl,fltnol,pswno') out.push('read back: ' + back);
    const pr = await page.evaluate(() => { const h = document.createElement('div'); h.innerHTML = printSheet('x', true).html; return [...h.querySelectorAll('text')].map(t => t.textContent).filter(t => /^(LOW|HIGH) /.test(t)).sort().join(); });
    if (pr !== 'HIGH PRESS,LOW FLOW,LOW LEVEL,LOW PRESS') out.push('printed notes: ' + pr);
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); const ps = r.doc.sheets.flatMap(s => s.parts).filter(p => /^(ps|fs|fls)_/.test(p.t)); return [ps.map(p => p.t + ':' + p.tag).sort().join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'fls_ncl:FLS1,fs_nol:FS1,ps_ncl:PS1,ps_no:PS2') out.push('in Print Builder: ' + pb[0]);
    delete pb[1].link; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.map(p => p.t + (p.nc ? 'nc' : 'no') + (p.low ? 'l' : '')).sort().join(); }, pb[1]);
    if (again !== 'fltnol,fswncl,pswncl,pswno') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });
  await check('Toggle switch, SPST (Dallas, 21 Nov 2026, option B): placed from the Switches menu as SW1, the body its faceplate with the NEMA SPST across it and a light switch\'s toggle under it; a click flips it on (lever up, blade closed, current through) and it stays; another flips it off; saved, printed as the SPST symbol, and across to Print Builder and back as SW1', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await toolbarDrop(page, 'tgl', 600, 200);
    const cap = await page.evaluate(() => parts.map(p => captionOf(p) + (p.maint ? '/m' : '')).join());
    if (cap !== 'SW1 Toggle Switch (SPST)/m') out.push('placed as: ' + cap);
    // wired across the rung with a pilot light
    await page.evaluate(() => { const t = parts[0]; W = Math.max(W_MIN, t.x + 420); const lx = W - 180; parts.push(P('lamp', lx, t.y, { L: '', color: '#00B050' })); wires.push(Wr(0, t.y, t.x - 60, t.y), Wr(t.x + 60, t.y, lx - 60, t.y), Wr(lx + 60, t.y, W, t.y)); normalize(); draw(); });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(300);
    const st = () => page.evaluate(() => { const t = parts.find(p => p.t === 'tgl'), v = view.parts.get(t.id), l = parts.find(p => p.t === 'lamp');
      return [lswClosed(t) ? 'closed' : 'open', v.lev[1].getAttribute('display') === 'none' ? 'down' : 'up', coilOn[l.id] ? 'lit' : 'dark'].join(' '); });
    let s = await st(); if (s !== 'open down dark') out.push('at first: ' + s);
    const tg = await page.evaluate(() => { const t = parts.find(p => p.t === 'tgl'); return { x: t.x, y: t.y + 56 }; });
    const click = async () => { const r = await page.evaluate(({ x, y }) => { const g = [...document.querySelectorAll('#svg g.dev')].find(g => g.getAttribute('aria-label') === 'SW1 Toggle Switch (SPST)'); const b = g.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height * .7 }; }, tg); await page.mouse.click(r.x, r.y); await page.waitForTimeout(500); };
    await click(); s = await st(); if (s !== 'closed up lit') out.push('clicked once (on): ' + s);
    await page.waitForTimeout(400); s = await st(); if (s !== 'closed up lit') out.push('left on (it stays): ' + s);
    await click(); s = await st(); if (s !== 'open down dark') out.push('clicked again (off): ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'tgl').map(p => p.t + p.L + (p.maint ? 'm' : '') + (p.nc ? 'nc' : '')).join());
    if (back !== 'tgl1m') out.push('read back: ' + back);
    const pr = await page.evaluate(() => { const h = document.createElement('div'); h.innerHTML = printSheet('x', true).html; return [...h.querySelectorAll('g.sym')].map(g => g.getAttribute('data-sym') || '').join('|') + ' / ' + [...h.querySelectorAll('text')].map(t => t.textContent).filter(t => /^SW\d/.test(t)).join(); });
    if (!/SW1/.test(pr)) out.push('printed: ' + pr);
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); const ps = r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'spst'); return [ps.map(p => p.t + ':' + p.tag).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'spst:SW1') out.push('in Print Builder: ' + pb[0]);
    pb[1].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'tgl' || p.t === 'stand').map(p => p.t + p.L).join(); }, pb[1]);
    if (again !== 'tgl1') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('Toggle switch, SPDT (Dallas, 21 Nov 2026, option B): placed from the Switches menu (Toggle Switches) as the next SW number; its common joins throw 2 at rest (lever down) and throw 1 when flipped (lever up), each throw lighting its own pilot light, and it stays as left; saved, printed as the SPDT symbol, and across to Print Builder and back as SW#', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    await toolbarDrop(page, 'tgl', 300, 160); await toolbarDrop(page, 'sp2', 700, 220);
    const cap = await page.evaluate(() => parts.map(p => captionOf(p)).join());
    if (cap !== 'SW1 Toggle Switch (SPST),SW2 Toggle Switch (SPDT)') out.push('placed as: ' + cap);
    // the SPDT's common from L1; a light on each throw
    await page.evaluate(() => { parts = parts.filter(p => p.t === 'sp2'); const t = parts[0]; W = Math.max(W_MIN, t.x + 460); const lx = W - 180;
      parts.push(P('lamp', lx, t.y - 60, { L: '', color: '#00B050' }), P('lamp', lx, t.y + 60, { L: '', color: '#FF0032' }));
      wires.length = 0; wires.push(Wr(0, t.y, t.x - 60, t.y), Wr(t.x + 60, t.y - 60, lx - 60, t.y - 60), Wr(t.x + 60, t.y + 60, lx - 60, t.y + 60), Wr(lx + 60, t.y - 60, W, t.y - 60), Wr(lx + 60, t.y + 60, W, t.y + 60)); normalize(); draw(); });
    const iss = await page.evaluate(() => [...(wiringIssues(NET) || new Map()).entries()].filter(([k, v]) => typeof v === 'string').map(([k, v]) => v).join());
    if (iss) out.push('build warnings: ' + iss);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    const st = () => page.evaluate(() => { const t = parts.find(p => p.t === 'sp2'), v = view.parts.get(t.id), L = parts.filter(p => p.t === 'lamp').sort((a, b) => a.y - b.y);
      return [v.lev[1].getAttribute('display') === 'none' ? 'down' : 'up', L.map(l => coilOn[l.id] ? 'lit' : 'dark').join('/')].join(' '); });
    let s = await st(); if (s !== 'down dark/lit') out.push('at rest (throw 2): ' + s);
    const at = await page.evaluate(() => { const g = [...document.querySelectorAll('#svg g.dev')].find(g => /SPDT/.test(g.getAttribute('aria-label') || '')); const b = g.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height * .7 }; });
    await page.mouse.click(at.x, at.y); await page.waitForTimeout(600);
    s = await st(); if (s !== 'up lit/dark') out.push('flipped (throw 1): ' + s);
    await page.waitForTimeout(300); s = await st(); if (s !== 'up lit/dark') out.push('left up (it stays): ' + s);
    await page.mouse.click(at.x, at.y); await page.waitForTimeout(600);
    s = await st(); if (s !== 'down dark/lit') out.push('flipped back (throw 2): ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'sp2').map(p => p.t + p.L + (p.maint ? 'm' : '')).join());
    if (back !== 'sp22m') out.push('read back: ' + back);
    const pr = await page.evaluate(() => { const h = document.createElement('div'); h.innerHTML = printSheet('x', true).html; return [...h.querySelectorAll('text')].map(t => t.textContent).filter(t => /^SW\d/.test(t)).join(); });
    if (pr !== 'SW2') out.push('printed tags: ' + pr);
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      const ps = r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'spdt'); return [ps.map(p => p.t + ':' + p.tag).join(), checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'spdt:SW2') out.push('in Print Builder: ' + pb[0]);
    if (pb[1]) out.push('Check Print: ' + pb[1]);
    pb[2].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'sp2' || p.t === 'stand').map(p => p.t + p.L).join(); }, pb[2]);
    if (again !== 'sp22') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('Flipped toggle switches (Dallas, 21 Nov 2026): Flip (or F) mirrors an SPST or SPDT left to right (an SPDT\'s common on the right, its throws on the left), its tags still SW# left and kind right; a flipped SPDT works its throws as before; saved; crosses to Print Builder flipped and back flipped; Rotate is not offered for an SPDT', async page => {
    const out = [];
    await page.evaluate(() => { loadPreset('blank'); W = Math.max(W_MIN, 1100); const t = newPart('sp2', 760, 300); parts.push(t); const lx = 340;
      parts.push(P('lamp', lx, 240, { L: '', color: '#00B050' }), P('lamp', lx, 360, { L: '', color: '#FF0032' }));
      wires.push(Wr(820, 300, W, 300), Wr(0, 240, lx - 60, 240), Wr(lx + 60, 240, 700, 240), Wr(0, 360, lx - 60, 360), Wr(lx + 60, 360, 700, 360)); normalize(); draw(); });
    // select it and flip it with the Part tab's Flip button
    const at = await page.evaluate(() => { const t = parts.find(p => p.t === 'sp2'), m = WORLD.getScreenCTM(); return { x: m.a * t.x + m.e, y: m.d * (t.y + 120) + m.f }; });
    await page.mouse.click(at.x, at.y); await page.waitForTimeout(150);
    const ui = await page.evaluate(() => [!document.getElementById('box-flip').closest('.tgroup').hidden, !document.getElementById('box-rot').closest('.tgroup').hidden]);
    if (!ui[0] || ui[1]) out.push('Part tab: Flip ' + (ui[0] ? 'shown' : 'missing') + ', Rotate ' + (ui[1] ? 'shown (should not be)' : 'hidden'));
    await page.click('#box-flip'); await page.waitForTimeout(100);
    const st = await page.evaluate(() => { const t = parts.find(p => p.t === 'sp2'); return JSON.stringify([!!t.fx, terms(t)]) + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join(); });
    if (st !== '[true,[[820,300],[700,240],[700,360]]] ') out.push('flipped: ' + st);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    const L = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').sort((a, b) => a.y - b.y).map(l => coilOn[l.id] ? 'lit' : 'dark').join('/'));
    let s = await L(); if (s !== 'dark/lit') out.push('at rest: ' + s);
    await page.evaluate(() => press(opKey(parts.find(p => p.t === 'sp2')), true)); await page.waitForTimeout(500);
    s = await L(); if (s !== 'lit/dark') out.push('flipped up: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.fx).map(p => p.t).join());
    if (back !== 'sp2') out.push('read back flipped: ' + back);
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      return [r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'spdt').map(p => p.t + (p.fx ? '/fx' : '')).join(), checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'spdt/fx') out.push('in Print Builder: ' + pb[0]);
    if (pb[1]) out.push('Check Print: ' + pb[1]);
    pb[2].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'sp2' || p.t === 'stand').map(p => p.t + (p.fx ? '/fx' : '')).join() + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join(); }, pb[2]);
    if (again !== 'sp2/fx ') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('Crossover switch (Dallas, 21 Nov 2026): a DPDT crossover in the Toggle Switches menu; four ends, 60 out and 60 above and below its middle; straight across (top to top, bottom to bottom) with the lever up as it starts, crossed with it down; Starts and Flip as the other toggle switches; saved; crosses to Print Builder\'s DPDT Crossover Switch and back', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60); await toolbarDrop(page, 'xov', 300, 200);
    const placed = await page.evaluate(() => { const t = parts.find(p => p.t === 'xov'); return t ? t.t + t.L + (t.maint ? 'm' : '') + ' ' + t.color : 'none'; });
    if (placed !== 'xov1m #99E600') out.push('placed from the menu: ' + placed);
    await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1100); const t = newPart('xov', 700, 300); parts.push(t); const lx = W - 180;
      parts.push(P('lamp', lx, 240, { L: '', color: '#00B050' }), P('lamp', lx, 360, { L: '', color: '#FF0032' }), P('lamp', lx, 540, { L: '', color: '#FFDC00' }));
      wires.push(Wr(0, 240, 640, 240), Wr(760, 240, lx - 60, 240), Wr(lx + 60, 240, W, 240), Wr(760, 360, lx - 60, 360), Wr(lx + 60, 360, W, 360), Wr(640, 360, 540, 360), Wr(540, 360, 540, 540), Wr(540, 540, lx - 60, 540), Wr(lx + 60, 540, W, 540)); normalize(); draw(); });
    const ts = await page.evaluate(() => JSON.stringify(terms(parts.find(p => p.t === 'xov'))));
    if (ts !== '[[640,240],[760,240],[640,360],[760,360]]') out.push('ends: ' + ts);
    const L = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').sort((a, b) => a.y - b.y).map(l => coilOn[l.id] ? 'lit' : 'dark').join('/'));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await L(); if (s !== 'lit/dark/dark') out.push('at rest (straight): ' + s);
    const lev = () => page.evaluate(() => { const v = view.parts.get(parts.find(p => p.t === 'xov').id); return (v.lev[1].getAttribute('display') === 'none' ? 'down' : 'up') + (v.gap.getAttribute('display') === 'none' ? '' : '+gap'); });
    if (await lev() !== 'up') out.push('drawn at rest: ' + await lev());
    await page.evaluate(() => press(opKey(parts.find(p => p.t === 'xov')), true)); await page.waitForTimeout(500);
    s = await L(); if (s !== 'dark/lit/dark') out.push('crossed: ' + s);
    if (await lev() !== 'down+gap') out.push('drawn crossed: ' + await lev());
    await page.evaluate(() => press(opKey(parts.find(p => p.t === 'xov')), false)); await page.waitForTimeout(500);
    s = await L(); if (s !== 'lit/dark/dark') out.push('back straight: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    // starts crossed, and flipped
    await page.evaluate(() => { const t = parts.find(p => p.t === 'xov'); t.held = true; t.fx = true; normalize(); draw(); });
    const fl = await page.evaluate(() => JSON.stringify(terms(parts.find(p => p.t === 'xov'))));
    if (fl !== '[[760,240],[640,240],[760,360],[640,360]]') out.push('flipped ends: ' + fl);
    await page.evaluate(() => { const t = parts.find(p => p.t === 'xov'); t.fx = false; normalize(); draw(); });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    s = await L(); if (s !== 'dark/lit/dark') out.push('starts crossed: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'xov').map(p => p.t + p.L + (p.maint ? 'm' : '') + (p.held ? 'h' : '')).join());
    if (back !== 'xov1mh') out.push('read back: ' + back);
    await page.evaluate(() => { const t = parts.find(p => p.t === 'xov'); t.fx = true; t.held = false; normalize(); draw(); });
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      return [r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'xover').map(p => p.t + (p.fx ? '/fx' : '') + ' ' + p.tag).join(), checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'xover/fx SW1') out.push('in Print Builder: ' + pb[0]);
    if (pb[1]) out.push('Check Print: ' + pb[1]);
    pb[2].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'xov' || p.t === 'stand').map(p => p.t + (p.fx ? '/fx' : '')).join() + ' ' + parts.filter(p => p.t === 'xov').flatMap(p => terms(p).map(([x, y]) => wires.some(w => (w.x1 === x && w.y1 === y) || (w.x2 === x && w.y2 === y)) ? 'w' : '-')).join(''); }, pb[2]);
    if (again !== 'xov/fx wwww') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('DPST toggle switch (Dallas, 21 Nov 2026, option B2): in the Toggle Switches menu; four ends, 60 out and 60 above and below its middle; both poles open with the lever down (off) as it starts, both closed with it up (on); Starts and Flip; saved; crosses to Print Builder\'s DPST Switch and back', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60); await toolbarDrop(page, 'dps', 300, 200);
    const placed = await page.evaluate(() => { const t = parts.find(p => p.t === 'dps'); return t ? captionOf(t) + (t.maint ? ' m' : '') : 'none'; });
    if (placed !== 'SW1 Toggle Switch (DPST) m') out.push('placed from the menu: ' + placed);
    await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1100); const t = newPart('dps', 700, 300); parts.push(t); const lx = W - 180;
      parts.push(P('lamp', lx, 240, { L: '', color: '#00B050' }), P('lamp', lx, 360, { L: '', color: '#FF0032' }));
      wires.push(Wr(0, 240, 640, 240), Wr(0, 360, 640, 360), Wr(760, 240, lx - 60, 240), Wr(lx + 60, 240, W, 240), Wr(760, 360, lx - 60, 360), Wr(lx + 60, 360, W, 360)); normalize(); draw(); });
    const ts = await page.evaluate(() => JSON.stringify(terms(parts.find(p => p.t === 'dps'))) + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join());
    if (ts !== '[[640,240],[760,240],[640,360],[760,360]] ') out.push('ends: ' + ts);
    const L = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').sort((a, b) => a.y - b.y).map(l => coilOn[l.id] ? 'lit' : 'dark').join('/'));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await L(); if (s !== 'dark/dark') out.push('at rest (off): ' + s);
    await page.evaluate(() => press(opKey(parts.find(p => p.t === 'dps')), true)); await page.waitForTimeout(500);
    s = await L(); if (s !== 'lit/lit') out.push('on: ' + s);
    await page.evaluate(() => press(opKey(parts.find(p => p.t === 'dps')), false)); await page.waitForTimeout(500);
    s = await L(); if (s !== 'dark/dark') out.push('back off: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    await page.evaluate(() => { const t = parts.find(p => p.t === 'dps'); t.held = true; t.fx = true; normalize(); draw(); });
    const fl = await page.evaluate(() => JSON.stringify(terms(parts.find(p => p.t === 'dps'))));
    if (fl !== '[[760,240],[640,240],[760,360],[640,360]]') out.push('flipped ends: ' + fl);
    await page.evaluate(() => { const t = parts.find(p => p.t === 'dps'); t.fx = false; normalize(); draw(); });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    s = await L(); if (s !== 'lit/lit') out.push('starts on: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'dps').map(p => p.t + p.L + (p.maint ? 'm' : '') + (p.held ? 'h' : '')).join());
    if (back !== 'dps1mh') out.push('read back: ' + back);
    await page.evaluate(() => { const t = parts.find(p => p.t === 'dps'); t.fx = true; t.held = false; normalize(); draw(); });
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      return [r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'dpst').map(p => p.t + (p.fx ? '/fx' : '') + ' ' + p.tag).join(), checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'dpst/fx SW1') out.push('in Print Builder: ' + pb[0]);
    if (pb[1]) out.push('Check Print: ' + pb[1]);
    pb[2].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'dps' || p.t === 'stand').map(p => p.t + (p.fx ? '/fx' : '')).join() + ' ' + wires.filter(w => w.x1 !== w.x2 && w.y1 !== w.y2).length + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join(); }, pb[2]);
    if (again !== 'dps/fx 0 ') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('3PST toggle switch (Dallas, 22 Nov 2026): in the Toggle Switches menu; six ends, 60 out, its poles 120 apart; all three open with the lever down (off) as it starts, all closed with it up (on); Starts and Flip; saved; crosses to Print Builder\'s new 3PST Switch (the 3-phase disconnect\'s drawing, a switch) and back', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60); await toolbarDrop(page, 'tps', 300, 200);
    const placed = await page.evaluate(() => { const t = parts.find(p => p.t === 'tps'); return t ? captionOf(t) + (t.maint ? ' m' : '') : 'none'; });
    if (placed !== 'SW1 Toggle Switch (3PST) m') out.push('placed from the menu: ' + placed);
    await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1100); const t = newPart('tps', 700, 300); parts.push(t); const lx = W - 180;
      parts.push(...[180, 300, 420].map(y => P('lamp', lx, y, { L: '', color: '#00B050' })));
      wires.push(...[180, 300, 420].flatMap(y => [Wr(0, y, 640, y), Wr(760, y, lx - 60, y), Wr(lx + 60, y, W, y)])); normalize(); draw(); });
    const ts = await page.evaluate(() => JSON.stringify(terms(parts.find(p => p.t === 'tps'))) + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join());
    if (ts !== '[[640,180],[760,180],[640,300],[760,300],[640,420],[760,420]] ') out.push('ends: ' + ts);
    const L = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').sort((a, b) => a.y - b.y).map(l => coilOn[l.id] ? 'lit' : 'dark').join('/'));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await L(); if (s !== 'dark/dark/dark') out.push('at rest (off): ' + s);
    await page.evaluate(() => press(opKey(parts.find(p => p.t === 'tps')), true)); await page.waitForTimeout(500);
    s = await L(); if (s !== 'lit/lit/lit') out.push('on: ' + s);
    await page.evaluate(() => press(opKey(parts.find(p => p.t === 'tps')), false)); await page.waitForTimeout(500);
    s = await L(); if (s !== 'dark/dark/dark') out.push('back off: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    await page.evaluate(() => { const t = parts.find(p => p.t === 'tps'); t.held = true; t.fx = true; normalize(); draw(); });
    const fl = await page.evaluate(() => JSON.stringify(terms(parts.find(p => p.t === 'tps'))));
    if (fl !== '[[760,180],[640,180],[760,300],[640,300],[760,420],[640,420]]') out.push('flipped ends: ' + fl);
    await page.evaluate(() => { const t = parts.find(p => p.t === 'tps'); t.fx = false; normalize(); draw(); });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    s = await L(); if (s !== 'lit/lit/lit') out.push('starts on: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'tps').map(p => p.t + p.L + (p.maint ? 'm' : '') + (p.held ? 'h' : '')).join());
    if (back !== 'tps1mh') out.push('read back: ' + back);
    await page.evaluate(() => { const t = parts.find(p => p.t === 'tps'); t.fx = true; t.held = false; normalize(); draw(); });
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      return [r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'tpst').map(p => p.t + (p.fx ? '/fx' : '') + ' ' + p.tag).join(), checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'tpst/fx SW1') out.push('in Print Builder: ' + pb[0]);
    if (pb[1]) out.push('Check Print: ' + pb[1]);
    pb[2].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'tps' || p.t === 'stand').map(p => p.t + (p.fx ? '/fx' : '')).join() + ' ' + wires.filter(w => w.x1 !== w.x2 && w.y1 !== w.y2).length + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join(); }, pb[2]);
    if (again !== 'tps/fx 0 ') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('DPDT toggle switch (Dallas, 21 Nov 2026, option A): in the Toggle Switches menu; two SPDTs 180 apart, rows 60 apart; each common at its throw 2 with the lever down as it starts, at throw 1 with it up; Starts and Flip; saved; crosses to Print Builder\'s DPDT Switch and back, its wires straight', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60); await toolbarDrop(page, 'dpd', 300, 200);
    const placed = await page.evaluate(() => { const t = parts.find(p => p.t === 'dpd'); return t ? captionOf(t) + (t.maint ? ' m' : '') : 'none'; });
    if (placed !== 'SW1 Toggle Switch (DPDT) m') out.push('placed from the menu: ' + placed);
    await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1300); const t = newPart('dpd', 700, 300); parts.push(t); const lx = W - 180;
      parts.push(...[[lx, 240], [lx - 200, 360], [lx, 420], [lx - 200, 540]].map(([x, y]) => P('lamp', x, y, { L: '', color: '#00B050' })));
      wires.push(Wr(0, 300, 640, 300), Wr(0, 480, 640, 480), ...[[lx, 240], [lx - 200, 360], [lx, 420], [lx - 200, 540]].flatMap(([x, y]) => [Wr(760, y, x - 60, y), Wr(x + 60, y, W, y)])); normalize(); draw(); });
    const ts = await page.evaluate(() => JSON.stringify(terms(parts.find(p => p.t === 'dpd'))) + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join());
    if (ts !== '[[640,300],[760,240],[760,360],[640,480],[760,420],[760,540]] ') out.push('ends: ' + ts);
    const L = () => page.evaluate(() => parts.filter(p => p.t === 'lamp').sort((a, b) => a.y - b.y).map(l => coilOn[l.id] ? 'lit' : 'dark').join('/'));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await L(); if (s !== 'dark/lit/dark/lit') out.push('at rest (at 2): ' + s);
    await page.evaluate(() => press(opKey(parts.find(p => p.t === 'dpd')), true)); await page.waitForTimeout(500);
    s = await L(); if (s !== 'lit/dark/lit/dark') out.push('at 1: ' + s);
    await page.evaluate(() => press(opKey(parts.find(p => p.t === 'dpd')), false)); await page.waitForTimeout(500);
    s = await L(); if (s !== 'dark/lit/dark/lit') out.push('back at 2: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    await page.evaluate(() => { const t = parts.find(p => p.t === 'dpd'); t.held = true; t.fx = true; normalize(); draw(); });
    const fl = await page.evaluate(() => JSON.stringify(terms(parts.find(p => p.t === 'dpd'))));
    if (fl !== '[[760,300],[640,240],[640,360],[760,480],[640,420],[640,540]]') out.push('flipped ends: ' + fl);
    await page.evaluate(() => { const t = parts.find(p => p.t === 'dpd'); t.fx = false; normalize(); draw(); });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    s = await L(); if (s !== 'lit/dark/lit/dark') out.push('starts at 1: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'dpd').map(p => p.t + p.L + (p.maint ? 'm' : '') + (p.held ? 'h' : '')).join());
    if (back !== 'dpd1mh') out.push('read back: ' + back);
    await page.evaluate(() => { const t = parts.find(p => p.t === 'dpd'); t.held = false; normalize(); draw(); });   // (unflipped: flipping alone leaves this circuit's wires off its ends)
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      return [r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'dpdt').map(p => p.t + (p.fx ? '/fx' : '') + ' ' + p.tag).join(), checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'dpdt SW1') out.push('in Print Builder: ' + pb[0]);
    if (pb[1]) out.push('Check Print: ' + pb[1]);
    pb[2].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'dpd' || p.t === 'stand').map(p => p.t + (p.fx ? '/fx' : '')).join() + ' ' + wires.filter(w => w.x1 !== w.x2 && w.y1 !== w.y2).length + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join(); }, pb[2]);
    if (again !== 'dpd 0 ') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('Toggle switch room (Dallas, 22 Nov 2026): counted as each body really is, high above its wire and far below, with room for its name over it, not the most of the two either way; a wire across any part of the body is in the way', async page => {
    const out = [];
    const r = await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1300); const a = newPart('dps', 440, 520); parts.push(a); normalize();
      const res = { dpdFree: !overlaps(null, 440, 840, 'dpd'), dpdHit: overlaps(null, 440, 820, 'dpd'), sp2Free: !overlaps(null, 440, 180 + 0, 'sp2') === false };
      res.sp2Above = !overlaps(null, 440, 200, 'sp2'); res.sp2Close = overlaps(null, 440, 220, 'sp2');
      const d = newPart('dpd', 900, 300); wires.push(Wr(860, 560, 940, 560)); res.lowWire = wireInTheWay(d); wires.pop(); res.clear = !wireInTheWay(d);
      return res; });
    for (const [k, v] of Object.entries({ dpdFree: true, dpdHit: true, sp2Above: true, sp2Close: true, lowWire: true, clear: true })) if (r[k] !== v) out.push(k + ': ' + r[k]);
    return out;
  });

  await check('Disconnect (Dallas, 22 Nov 2026, option A): its knob below its poles, in its body, as a circuit breaker\'s, with no head on top; its tag at the bottom; the room it takes reaching down to it', async page => {
    const out = [];
    const r = await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1100); const p = newPart('dsc', 300, 300); parts.push(p); normalize(); draw();
      const v = view.parts.get(p.id), kb = v.lever.getBBox(), tag = [...document.querySelectorAll('svg text')].find(t => t.textContent === 'DS1');
      return { knob: kb.y, low: p.y + PWR_DY, tag: tag ? +tag.getAttribute('y') : null, down: roomDown('dsc'), up: roomUp('dsc'), cap: capTop(p) }; });
    if (!(r.knob > r.low)) out.push('knob not below the bottom pole: ' + JSON.stringify(r));
    if (!(r.tag > r.knob)) out.push('tag not below the knob: ' + JSON.stringify(r));
    if (r.down !== 238 || r.up !== 173 || r.cap !== 166) out.push('room: ' + JSON.stringify(r));
    return out;
  });
  await check('Voltage system (Dallas, 22 Nov 2026): Power menu choice of 480Y/277, 208Y/120 or 120/240 split-phase (a new circuit 208Y/120, an older file 480Y/277), saved; a Neutral box; split-phase has no L3; lights and heaters run from a phase to the neutral or across two phases, getting that voltage', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    let r = await page.evaluate(() => ({ vs: VSYS, col: PH_COL.join(), menu: [...document.querySelectorAll('[data-vs]')].map(b => b.dataset.vs + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join() }));
    if (r.vs !== '208' || r.menu !== '480,208*,240,hl,d240u,d240c,d480u,d480c' || r.col !== '#6E6E6E,#E8413C,#3F7FFF') out.push('new circuit: ' + JSON.stringify(r));
    const old = await page.evaluate(() => { const d = circuitData(); delete d.vs; delete d.pc; const c = readCircuit(d); return c.vs + ' ' + c.ph.join(); });
    if (old !== '480 #B5793F,#FF8A1F,#F2D21B') out.push('older file: ' + old);
    await page.evaluate(() => document.querySelector('[data-vs="240"]').click()); await page.waitForTimeout(60);
    r = await page.evaluate(() => ({ vs: VSYS, l3: document.querySelector('[data-part="ph-3"]').hidden, back: readCircuit(JSON.parse(JSON.stringify(circuitData()))).vs }));
    if (r.vs !== '240' || !r.l3 || r.back !== '240') out.push('split-phase chosen: ' + JSON.stringify(r));
    // L1, L2 and N boxes: a light from L1 to N, a heater across L1 and L2, and an L3 box (no L3 on split-phase)
    const run = async vs => page.evaluate(vs => { sel = null; loadPreset('blank'); VSYS = vs; PH_COL = [...VSYS_LIST[vs].col]; POWER = 'boxes'; W = 1300;
      for (const [L, y] of [['1', 140], ['2', 300], ['N', 460], ['3', 620]]) parts.push(newPart('ph-' + L, 80, y));
      parts.push(P('lamp', 600, 140, { L: '', color: '#FFDC00' }), P('htr', 600, 300, { L: '1', rv: vs === '240' ? 240 : 208 }));
      wires.push(Wr(120, 140, 540, 140), Wr(660, 140, 900, 140), Wr(900, 140, 900, 460), Wr(120, 460, 900, 460),
        Wr(200, 140, 200, 220), Wr(200, 220, 540, 220), Wr(540, 220, 540, 300), Wr(120, 300, 480, 300), Wr(480, 300, 480, 380), Wr(480, 380, 700, 380), Wr(700, 380, 700, 300), Wr(660, 300, 700, 300));
      normalize(); draw();
      const iss = wiringIssues(NET), l3 = parts.find(p => p.t === 'ph' && p.L === '3'), h = parts.find(p => p.t === 'htr');
      return { l3: iss.get(l3.id) || '', htr: JSON.stringify(iss.get(h.id) || '') }; }, vs);
    const get = () => page.evaluate(() => parts.filter(p => p.t === 'lamp' || p.t === 'htr').map(p => p.t + (coilOn[p.id] ? ' on ' : ' off ') + (p._sh || 0).toFixed(2)).join(', '));
    let b = await run('240');
    if (b.l3 !== 'No L3 in a 120/240 V Split-Phase system') out.push('L3 on split-phase: ' + b.l3);
    if (b.htr !== '""') out.push('heater note: ' + b.htr);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let g = await get(); if (g !== 'lamp on 1.00, htr on 2.00') out.push('split-phase running: ' + g);
    const cols = await page.evaluate(() => [NET.PH['1'], NET.PH['N']].map(n => showCol(n, simT)).join());
    if (cols !== '#6E6E6E,#E8E8E8') out.push('L1 and N wires: ' + cols);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    b = await run('208');
    if (b.l3 !== 'Not wired to anything' || b.htr !== '""') out.push('208Y/120 notes: ' + JSON.stringify(b));
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    g = await get(); if (g !== 'lamp on 1.00, htr on 1.73') out.push('208Y/120 running: ' + g);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    return out;
  });
  await check('A breaker pole fed by a phase from its right (Dallas, 22 Nov 2026): switched off, the phase lights it up to its right-hand contact, not its left', async page => {
    const out = [];
    await page.evaluate(() => { sel = null; loadPreset('blank'); POWER = 'boxes'; W = 1500;
      parts.push(newPart('ph-1', 80, 240), newPart('ph-3', 1300, 360), newPart('ph-N', 80, 600), newPart('cbd', 500, 300));
      parts.push(P('lamp', 900, 240, { L: '', color: '#FFDC00' }), P('lamp', 200, 360, { L: '', color: '#00B050' }));
      wires.push(Wr(120, 240, 440, 240), Wr(560, 240, 840, 240), Wr(960, 240, 1000, 240), Wr(1000, 240, 1000, 600), Wr(120, 600, 1000, 600),
        Wr(560, 360, 1260, 360), Wr(260, 360, 440, 360), Wr(140, 360, 100, 360), Wr(100, 360, 100, 500), Wr(100, 500, 1000, 500), Wr(1000, 500, 1000, 600));
      normalize(); draw(); });
    const issues = await page.evaluate(() => [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join());
    if (issues) out.push('wiring: ' + issues);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    const lit = await page.evaluate(() => parts.filter(p => p.t === 'lamp').map(p => !!coilOn[p.id]).join());
    if (lit !== 'true,true') out.push('lights on: ' + lit);
    const b = await page.evaluate(() => { const p = parts.find(q => q.t === 'cbd'); const m = WORLD.getScreenCTM(); return [m.a * (p.x + 10) + m.e, m.d * (p.y + 130) + m.f]; });
    await page.mouse.click(b[0], b[1]); await page.waitForTimeout(500);
    const r = await page.evaluate(() => { const v = view.parts.get(parts.find(q => q.t === 'cbd').id); return v.poles.map(q => q.rings.map(e => e.getAttribute('stroke')).join('/')).join(' '); });
    const want = await page.evaluate(() => `${PH_COL[0]}/${GREY} ${GREY}/${PH_COL[2]}`);
    if (r !== want) out.push('rings, off: ' + r + ' (want ' + want + ')');
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    return out;
  });
  await check('Buttons Colour the Current (Dallas, 22 Nov 2026): a Power menu setting, on by default and saved; off, the current through a pushbutton keeps the source colour, and a coil past it still picks up', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    if (await page.evaluate(() => TINT_OPS && document.getElementById('bt-tint').getAttribute('aria-pressed')) !== 'true') out.push('not on to start with');
    await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1100); parts.push(P('btn', 300, 240, { L: 'A', color: '#00B050', maint: true }), P('coil', 700, 240, { L: 'X', color: '#FFDC00' }));
      wires.push(Wr(0, 240, 260, 240), Wr(340, 240, 640, 240), Wr(760, 240, W, 240)); normalize(); draw(); });
    const col = async () => { await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.evaluate(() => press('A', true)); await page.waitForTimeout(500);
      const r = await page.evaluate(() => { const b = parts.find(p => p.t === 'btn'), c = parts.find(p => p.t === 'coil'); return [showCol(b._b, simT), !!coilOn[c.id]]; });
      await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit'); return r; };
    let [c, on] = await col();
    if (c === await page.evaluate(() => SRC_COL) || !on) out.push('on: ' + c + ' ' + on);
    await page.evaluate(() => document.getElementById('bt-tint').click()); await page.waitForTimeout(60);
    const saved = await page.evaluate(() => [TINT_OPS, circuitData().bt, readCircuit(JSON.parse(JSON.stringify(circuitData()))).bt].join());
    if (saved !== 'false,0,false') out.push('saved: ' + saved);
    [c, on] = await col();
    if (c !== await page.evaluate(() => SRC_COL) || !on) out.push('off: ' + c + ' ' + on);
    // (from a phase too (Dallas, 24 Nov 2026): L1 through a button to a light and on to N)
    for (const tint of [true, false]) {
      await page.evaluate(t => { sel = null; loadPreset('blank'); TINT_OPS = t; VSYS = '208'; PH_COL = [...VSYS_LIST['208'].col]; POWER = 'boxes'; W = 1200;
        parts.push(newPart('ph-1', 120, 200), newPart('ph-N', 120, 400), P('btn', 400, 200, { L: 'A', color: '#00B050', maint: true }), P('lamp', 700, 200, { L: '', color: '#FFDC00' }));
        wires.push(Wr(160, 200, 360, 200), Wr(440, 200, 640, 200), Wr(760, 200, 900, 200), Wr(900, 200, 900, 400), Wr(160, 400, 900, 400)); normalize(); draw(); }, tint);
      await page.click('#tab-run'); await page.evaluate(() => { setSpeed(4); press('A', true); }); await page.waitForTimeout(1000);
      const r = await page.evaluate(() => { const l = parts.find(p => p.t === 'lamp'); return [showCol(l._a, simT) === (TINT_OPS ? flowOf(btnColour('A')) : PH_COL[0]), !!coilOn[l.id]].join(); });
      if (r !== 'true,true') out.push(`from a phase, ${tint ? 'on' : 'off'}: ` + r);
      await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    }
    // (Dallas, 24 Nov 2026: a start/stop with a seal-in, from a phase: B's green never on its line side; where B's way and the
    // seal-in's meet, the two blended; the seal-in lit and holding once B is let go)
    await page.evaluate(() => { sel = null; loadPreset('blank'); TINT_OPS = true; VSYS = '208'; PH_COL = [...VSYS_LIST['208'].col]; POWER = 'boxes'; W = 1400;
      parts.push(newPart('ph-1', 100, 200), newPart('ph-N', 1300, 80), P('btn', 300, 200, { L: 'A', color: '#E8413C', nc: true, maint: true, estop: true }), P('btn', 580, 200, { L: 'B', color: '#00B050' }), P('con', 580, 340, { L: 'X' }), P('coil', 900, 200, { L: 'X', color: '#FFDC00' }));
      wires.push(Wr(140, 200, 260, 200), Wr(340, 200, 540, 200), Wr(620, 200, 840, 200), Wr(960, 200, 1300, 200), Wr(1300, 200, 1300, 120), Wr(480, 200, 480, 340), Wr(480, 340, 540, 340), Wr(620, 340, 700, 340), Wr(700, 340, 700, 200)); normalize(); draw(); });
    await page.click('#tab-run'); await page.evaluate(() => { setSpeed(4); press('B', true); }); await page.waitForTimeout(1200);
    const sl = await page.evaluate(() => { const b = parts.find(p => p.L === 'B' && p.t === 'btn'), c = parts.find(p => p.t === 'coil'), g = flowOf(btnColour('B')), r = flowOf(btnColour('A'));
      return [showCol(b._a, simT) === r, showCol(c._a, simT) !== g && showCol(c._a, simT) !== r, !!coilOn[c.id]].join(); });
    if (sl !== 'true,true,true') out.push('seal-in from a phase (line side red, coil lead blended, coil in): ' + sl);
    await page.evaluate(() => press('B', false)); await page.waitForTimeout(1200);
    const held = await page.evaluate(() => { const c = parts.find(p => p.t === 'coil'); return [!!coilOn[c.id], showCol(c._a, simT) === flowOf(btnColour('A'))].join(); });
    if (held !== 'true,true') out.push('seal-in from a phase, B let go (coil held, its lead red): ' + held);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    await page.evaluate(() => { TINT_OPS = true; });
    return out;
  });
  await check('Stage 2 (Dallas, 22 Nov 2026): a Ground part (Power menu), saved turned and crossing to Print Builder\'s Ground and back; a transformer\'s Primary Rating, Secondary and X2 Grounded settings, saved; a center-tapped secondary runs a light from X1 to X0 and a heater across X1 and X2; a 480 V-rated primary on 208 V gives too little to pull a coil in', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60); await toolbarDrop(page, 'gnd', 400, 300);
    const g = await page.evaluate(() => { const p = parts.find(q => q.t === 'gnd'); if (!p) return 'none'; p.rot = 2; return captionOf(p) + ' ' + readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(q => q.t === 'gnd').map(q => q.rot).join(); });
    if (g !== 'Ground 2') out.push('ground placed and saved: ' + g);
    const pbg = await page.evaluate(() => circuitData()).then(d => withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); return [r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'gnd').map(p => p.t + ' ' + (p.rot || 0)).join(), JSON.parse(JSON.stringify(r.doc))]; }, d)));
    if (pbg[0] !== 'gnd 180') out.push('in Print Builder: ' + pbg[0]);
    pbg[1].link.fp = 'changed'; const back = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'gnd' || p.t === 'stand').map(p => p.t + (p.rot || 0)).join(); }, pbg[1]);
    if (back !== 'gnd2') out.push('back from Print Builder: ' + back);
    // the transformer's settings on its Part tab
    await page.evaluate(() => { sel = null; loadPreset('blank'); parts.push(newPart('xfm', 500, 300)); normalize(); draw(); });
    const at = await page.evaluate(() => { const q = parts.find(p => p.t === 'xfm'), m = WORLD.getScreenCTM(); return { x: m.a * q.x + m.e, y: m.d * q.y + m.f }; });
    await page.mouse.click(at.x, at.y); await page.waitForTimeout(120);
    await page.selectOption('#x-pr', '480'); await page.selectOption('#x-sec', 'ct'); await page.click('#x-gnd'); await page.waitForTimeout(80);
    const xs = await page.evaluate(() => { const q = readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.find(p => p.t === 'xfm'); return [q.pr, !!q.ct, !!q.ug, terms(q).length, document.getElementById('x-gnd-n').textContent].join(); });
    if (xs !== '480,true,true,5,X0 Grounded') out.push('settings saved: ' + xs);
    // running: 208Y/120 feeding a plain and a center-tapped transformer
    for (const [opt, want] of [[{}, 'coil on, lamp on 1.00, htr on 2.00'], [{ pr: '480' }, 'coil off, lamp on 1.00, htr on 2.00']]) {
      await page.evaluate(([b, opt]) => { eval('(' + b + ')')(opt); draw(); }, [BUILD_S2, opt]);
      const iss = await page.evaluate(() => [...wiringIssues(NET).entries()].filter(([k, v]) => typeof v === 'string').map(([k, v]) => (parts.find(p => p.id === k) || { t: k }).t + ': ' + v).join());
      if (iss !== 'gnd: Not wired to anything') out.push('wiring: ' + iss);
      await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(700);
      const r = await page.evaluate(() => parts.filter(p => LOADT(p.t) && p.t !== 'xfm').map(p => p.t + (coilOn[p.id] ? ' on' : ' off') + (p.t === 'coil' ? '' : ' ' + (p._sh || 0).toFixed(2))).join(', '));
      if (r !== want) out.push(JSON.stringify(opt) + ': ' + r);
      await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    }
    return out;
  });
  await check('Delta systems (Dallas, 24 Nov 2026): 240/120 V high-leg (orange high leg, 208 V to N), 240 and 480 V ungrounded and corner-grounded (grey grounded L2, no neutral: an N box is flagged); saved; Shorted to Ground is offered on a phase wire but not on the grounded one; on a grounded system it blows the fuse, on an ungrounded delta it does not, until a second phase faults', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const sys = await page.evaluate(() => ['hl', 'd480u', 'd480c'].map(vs => { VSYS = vs; return [vs, PH_COL = [...VSYS_LIST[vs].col], [1, 2, 3].map(k => Math.round(phVolt(k) ? Math.hypot(...phVolt(k)) : -1)).join('/'), vsNeu(), vsGnd(), Math.round(phAcross(1, 2)), Math.round(phAcross(1, 3))].join(' '); }).join(' | '));
    if (sys !== 'hl #6E6E6E,#FF8A1F,#3F7FFF 120/208/120 true N 240 240 | d480u #B5793F,#FF8A1F,#F2D21B 277/277/277 false  480 480 | d480c #B5793F,#BDBDBD,#F2D21B 480/0/480 false 2 480 480') out.push('systems: ' + sys);
    const build = (vs, f1, f2) => page.evaluate(([vs, f1, f2]) => { sel = null; loadPreset('blank'); VSYS = vs; PH_COL = [...VSYS_LIST[vs].col]; POWER = 'boxes'; W = 1400;
      parts.push(newPart('ph-1', 120, 200), newPart('ph-2', 120, 360), newPart('ph-3', 120, 520), P('fu1', 400, 200, { L: '1' }), P('fu1', 400, 360, { L: '2' }), P('fu1', 400, 520, { L: '3' }), newPart('ph-N', 120, 680));
      wires.push(Wr(160, 200, 360, 200), Wr(160, 360, 360, 360), Wr(160, 520, 360, 520), Wr(440, 200, 900, 200), Wr(440, 360, 900, 360), Wr(440, 520, 900, 520));
      if (f1) wires[2 + f1].fault = 'gnd'; if (f2) wires[2 + f2].fault = 'gnd'; normalize(); draw();
      return [wiringIssues(NET).get(parts.find(p => p.t === 'ph' && p.L === 'N').id) || '', readCircuit(JSON.parse(JSON.stringify(circuitData()))).vs].join(' / '); }, [vs, f1 || 0, f2 || 0]);
    const blown = async () => { await page.click('#tab-run'); await page.evaluate(() => { FAULTS_ON = true; setSpeed(4); startRun(); }); await page.waitForTimeout(1200);
      const r = await page.evaluate(() => parts.filter(p => p.t === 'fu1' && BLOWN[p.id]).map(p => p.L).join() || '-'); await page.evaluate(() => { FAULTS_ON = false; setSpeed(1); }); await page.click('#tab-edit'); return r; };
    let b = await build('d480u'); if (b !== 'No N in a 480 V Ungrounded Delta system / d480u') out.push('N box on a delta, and saving: ' + b);
    const offer = await page.evaluate(() => { VSYS = 'd480c'; const w = y => wires.find(q => q.x1 === 440 && q.y1 === y); return [faultWhy(w(200), true, 'gnd'), faultWhy(w(360), true, 'gnd')].map(x => x ? 'no' : 'yes').join(); });
    if (offer !== 'yes,no') out.push('Shorted to Ground offered on L1, L2 of corner-grounded: ' + offer);
    for (const [vs, f1, f2, want] of [['208', 1, 0, '1'], ['hl', 2, 0, '2'], ['d480c', 1, 0, '1'], ['d480u', 1, 0, '-'], ['d480u', 1, 2, '1,2']]) {
      await build(vs, f1, f2); const r = await blown(); if (r !== want) out.push(`${vs} grounded at L${f1}${f2 ? ' and L' + f2 : ''}: fuses blown ${r} (want ${want})`); }
    // ground-detector lights: three lights from the phases to ground on a 480 V ungrounded delta (Match Supply: made for 480 V);
    // dim, each on 277 V; L1 shorted to ground: its light out, the other two full on 480 V
    for (const [f, want] of [[0, '277,277,277'], [1, '0,480,480']]) {
      await page.evaluate(f => { sel = null; loadPreset('blank'); VSYS = 'd480u'; PH_COL = [...VSYS_LIST['d480u'].col]; POWER = 'boxes'; W = 1100;
        parts.push(newPart('ph-1', 120, 200), newPart('ph-2', 120, 360), newPart('ph-3', 120, 520), P('lamp', 600, 200, { L: '', color: '#FFDC00' }), P('lamp', 600, 360, { L: '', color: '#FFDC00' }), P('lamp', 600, 520, { L: '', color: '#FFDC00' }), newPart('gnd', 800, 680));
        wires.push(Wr(160, 200, 540, 200), Wr(160, 360, 540, 360), Wr(160, 520, 540, 520), Wr(660, 200, 800, 200), Wr(660, 360, 800, 360), Wr(660, 520, 800, 520), Wr(800, 200, 800, 640));
        if (f) wires[0].fault = 'gnd'; normalize(); draw(); }, f);
      if (await page.evaluate(() => wiringIssues(NET).size)) out.push('ground-detector lights: Build notes ' + await page.evaluate(() => JSON.stringify([...wiringIssues(NET).values()])));
      await page.click('#tab-run'); await page.evaluate(f => { FAULTS_ON = !!f; startRun(); setSpeed(4); }, f); await page.waitForTimeout(1200);
      const r = await page.evaluate(() => parts.filter(p => p.t === 'lamp').map(p => coilOn[p.id] ? Math.round(p._sh * 120) : 0).join());
      if (r !== want) out.push(`ground-detector lights${f ? ', L1 to ground' : ''}: ${r} (want ${want})`);
      await page.evaluate(() => { setSpeed(1); FAULTS_ON = false; }); await page.click('#tab-edit');
    }
    return out;
  });
  await check('Stage 4, motors (Dallas, 24 Nov 2026): a motor has a nameplate voltage (Match Supply, or 208, 230 or 460 V), saved, and stalls under 85% of it (a Build note says so); a single-phase motor (T1, T2) runs on the bars or from a phase, stalls short of its voltage and burns out well over it, and crosses to Print Builder and back; an open winding is a fault only a motor can have, and it hums on two phases', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const run = async (setup, ms = 1500) => { const iss = await page.evaluate(b => { eval('(' + b + ')')(); draw(); return [...wiringIssues(NET).entries()].map(([k, v]) => (parts.find(p => p.id === k) || { t: k }).t + ': ' + (typeof v === 'string' ? v : v.note)).join(); }, String(setup));
      await page.click('#tab-run'); await page.evaluate(() => setSpeed(4)); await page.waitForTimeout(ms);
      const st = await page.evaluate(() => parts.filter(p => p.t === 'mt1' || p.t === 'mtr').map(p => p.t + ' ' + (p.t === 'mtr' ? (MOT[p.id] || {}).st : (coilOn[p.id] ? 'on' : 'off') + (BLOWN[p.id] ? ' burned' : ''))).join());
      await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit'); return iss + ' / ' + st; };
    const bars = () => { sel = null; loadPreset('blank'); W = 900; parts.push(P('mt1', 500, 300, { L: '1' })); wires.push(Wr(0, 240, 380, 240), Wr(380, 360, 380, 420), Wr(380, 420, W, 420)); normalize(); };
    let r = await run(bars); if (r !== ' / mt1 on') out.push('single-phase on the bars: ' + r);
    r = await run(() => { parts.find(p => p.t === 'mt1').rv = 230; normalize(); }); if (r !== 'mt1: On 120 V, made for 230 V: it will stall / mt1 off') out.push('230 V on the bars: ' + r);
    r = await run(() => { sel = null; loadPreset('blank'); VSYS = '240'; PH_COL = [...VSYS_LIST['240'].col]; POWER = 'boxes'; W = 900; parts.push(newPart('ph-1', 100, 240), newPart('ph-2', 100, 420), P('mt1', 500, 300, { L: '1', rv: 115 })); wires.push(Wr(140, 240, 380, 240), Wr(140, 420, 380, 420), Wr(380, 420, 380, 360)); normalize(); }, 4500);
    if (r !== 'mt1: On 240 V, made for 115 V: it will burn out / mt1 off burned') out.push('115 V across 240 V: ' + r);
    const three = rv => `() => { sel = null; loadPreset('blank'); VSYS = '208'; PH_COL = [...VSYS_LIST['208'].col]; POWER = 'boxes'; W = 1300; parts.push(newPart('ph-1', 120, 200), newPart('ph-2', 120, 320), newPart('ph-3', 120, 440), P('mtr', 800, 320, { L: '1'${rv ? ', rv: ' + rv : ''} })); wires.push(Wr(160, 200, 640, 200), Wr(160, 320, 640, 320), Wr(160, 440, 640, 440)); normalize(); }`;
    for (const [rv, want] of [[0, ' / mtr run'], [230, 'mtr: On 207.8 V, made for 230 V / mtr run'], [460, 'mtr: On 207.8 V, made for 460 V: it will stall / mtr stall']]) {
      r = await run(three(rv)); if (r !== want) out.push('three-phase ' + (rv || 'matched') + ': ' + r); }
    // the Part tab: a motor's nameplate voltages; saved
    const at = await page.evaluate(() => { const q = parts.find(p => p.t === 'mtr'), m = WORLD.getScreenCTM(); return { x: m.a * (q.x + 40) + m.e, y: m.d * q.y + m.f }; });
    await page.mouse.click(at.x, at.y); await page.waitForTimeout(120);
    const opts = await page.evaluate(() => [...document.querySelectorAll('#rv-sel option')].map(o => o.value || 'M').join());
    if (opts !== 'M,208,230,460') out.push('motor ratings offered: ' + opts);
    const sv = await page.evaluate(() => { parts.push(P('mt1', 500, 800, { L: '2', rv: 115 })); return readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'mtr' || p.t === 'mt1').map(p => p.t + p.L + ':' + p.rv).join(); });
    if (sv !== 'mtr1:460,mt12:115') out.push('saved: ' + sv);
    // to Print Builder and back
    const d = await page.evaluate(() => circuitData());
    const pbr = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); const ps = r.doc.sheets.flatMap(s => s.parts); return [ps.filter(p => p.t === 'motor1' || p.t === 'motor').map(p => p.t + ' ' + p.tag).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pbr[0] !== 'motor M1,motor1 M2') out.push('in Print Builder: ' + pbr[0]);
    pbr[1].link.fp = 'changed';
    const back = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'mtr' || p.t === 'mt1' || p.t === 'stand').map(p => p.t + p.L).join(); }, pbr[1]);
    if (back !== 'mtr1,mt12') out.push('back from Print Builder: ' + back);
    // an open winding: offered on a motor only; the motor hums
    const f = await page.evaluate(() => { const m = parts.find(p => p.t === 'mtr'), c = P('coil', 0, 0, { L: 'X' }); return [faultsFor(m, false).join(), faultsFor(c, false).join()].join(' / '); });
    if (f !== 'w1,w2,w3 / open,short') out.push('faults offered: ' + f);
    r = await run(new Function('(' + three(0) + ')(); parts.find(p => p.t === "mtr").fault = "w2"; FAULTS_ON = true;'));
    if (!/mtr hum$/.test(r)) out.push('open winding: ' + r);
    await page.evaluate(() => { FAULTS_ON = false; });
    return out;
  });
  await check('Match Supply, power default and All Phases (Dallas, 24 Nov 2026): a load with no rating set is made for what its supply gives (277 V from a phase to N and 480 V across two phases on 480Y/277: no note, no burn-out), and one rated 120 V shows its tag; Set As Default makes new circuits start with Bars or Boxes; All Phases places L1, L2, L3 and N in a column, selected', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const n = await page.evaluate(() => { sel = null; loadPreset('blank'); VSYS = '480'; PH_COL = [...VSYS_LIST['480'].col]; POWER = 'boxes'; W = 1300;
      for (const [L, y] of [['1', 140], ['2', 300], ['N', 460]]) parts.push(newPart('ph-' + L, 80, y));
      parts.push(P('lamp', 600, 140, { L: '', color: '#FFDC00' }), P('htr', 600, 300, { L: '1' }));
      wires.push(Wr(120, 140, 540, 140), Wr(660, 140, 900, 140), Wr(900, 140, 900, 460), Wr(120, 460, 900, 460), Wr(200, 140, 200, 220), Wr(200, 220, 540, 220), Wr(540, 220, 540, 300), Wr(120, 300, 480, 300), Wr(480, 300, 480, 380), Wr(480, 380, 700, 380), Wr(700, 380, 700, 300), Wr(660, 300, 700, 300));
      normalize(); draw(); return [...wiringIssues(NET).values()].length; });
    if (n) out.push(n + ' Build notes on matched loads');
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(4000);
    const r = await page.evaluate(() => parts.filter(p => RATED(p.t)).map(p => p.t + (coilOn[p.id] ? ' on' : ' off') + (BLOWN[p.id] ? ' burned' : '')).join());
    if (r !== 'lamp on,htr on') out.push('running matched: ' + r);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const tag = await page.evaluate(() => { const p = parts.find(q => q.t === 'lamp'); p.rv = 120; draw(); const g = document.querySelector('#svg [data-part="' + p.id + '"]'); return [...g.querySelectorAll('text')].some(t => t.textContent === '120 V') + ' ' + JSON.stringify(wiringIssues(NET).get(p.id)); });
    if (tag !== 'true {"note":"On 277.1 V, made for 120 V: it will burn out"}') out.push('rated 120 V on 277 V: ' + tag);
    // Set As Default
    await page.evaluate(() => { POWER = 'boxes'; draw(); });
    const d = await page.evaluate(() => { const b = document.getElementById('pw-def'), was = [b.disabled, b.textContent].join(); b.click(); return was + ' / ' + [b.disabled, b.textContent, localStorage.getItem(POWER_KEY)].join(); });
    if (d !== 'false,Set As Default / true,Boxes Is the Default,boxes') out.push('Set As Default: ' + d);
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(80);
    if (await page.evaluate(() => POWER) !== 'boxes') out.push('a new circuit did not start with Boxes');
    await page.evaluate(() => { localStorage.removeItem(POWER_KEY); });
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(80);
    if (await page.evaluate(() => POWER) !== 'bars') out.push('cleared, a new circuit did not start with Bars');
    // All Phases
    for (const [vs, want] of [['208', '1,2,3,N'], ['240', '1,2,N']]) {
      const a = await page.evaluate(vs => { sel = null; loadPreset('blank'); VSYS = vs; PH_COL = [...VSYS_LIST[vs].col]; draw(); placeFree('ph-1', phAllGroup());
        const ps = parts.filter(p => p.t === 'ph'); return [ps.map(p => p.L).join(), new Set(ps.map(p => p.x)).size, ps.every((p, i) => !i || p.y - ps[i - 1].y === PH_ALL_DY), sel && sel.parts.size === ps.length].join(' '); }, vs);
      if (a !== want + ' 1 true true') out.push('All Phases on ' + vs + ': ' + a);
    }
    return out;
  });
  await check('Stage 3 (Dallas, 23 Nov 2026): a coil, light, solenoid or heater has a Rated Voltage (24 to 480 V; Match Supply by default since 24 Nov 2026), saved, with a tag under it only when not 120 V; a 24 V transformer secondary runs a 24 V coil; a 24 V coil on 120 V gets a Build note, picks up, then burns out (reads open, shown dark with a red badge); a coil picks up at 85% and holds in down to 60%', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const sv = await page.evaluate(() => { sel = null; loadPreset('blank'); W = 1100; parts.push(P('coil', 500, 240, { L: 'X', color: '#FFDC00', rv: 24 }), P('lamp', 500, 400, { L: '', color: '#00B050' }), P('htr', 500, 560, { L: '1', rv: 480 }));
      normalize(); draw(); const tags = parts.map(p => { const g = document.querySelector('#svg [data-part="' + p.id + '"]'); return [...g.querySelectorAll('text')].some(t => / V$/.test(t.textContent)) ? p.t : ''; }).join();
      const back = readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => RATED(p.t)).map(p => p.t + (p.rv || '')).join(); return tags + ' / ' + back; });
    if (sv !== 'coil,,htr / coil24,lamp,htr480') out.push('tags and saving: ' + sv);
    const at = await page.evaluate(() => { const q = parts.find(p => p.t === 'lamp'), m = WORLD.getScreenCTM(); return { x: m.a * q.x + m.e, y: m.d * q.y + m.f }; });
    await page.mouse.click(at.x, at.y); await page.waitForTimeout(120);
    const shown = await page.evaluate(() => !document.getElementById('props-rv').hidden);
    await page.selectOption('#rv-sel', '277'); const r277 = await page.evaluate(() => parts.find(q => q.t === 'lamp').rv);
    await page.selectOption('#rv-sel', ''); const sel1 = shown + ',' + r277 + ' ' + await page.evaluate(() => 'rv' in parts.find(q => q.t === 'lamp'));
    if (sel1 !== 'true,277 false') out.push('Rated Voltage on the Part tab: ' + sel1);
    // a 24 V coil straight across 120 V
    const note = await page.evaluate(() => { sel = null; loadPreset('blank'); W = 1100; parts.push(P('coil', 500, 240, { L: 'X', color: '#FFDC00', rv: 24 })); wires.push(Wr(0, 240, 440, 240), Wr(560, 240, W, 240)); normalize(); draw(); return JSON.stringify([...wiringIssues(NET).values()]); });
    if (note !== '[{"note":"On 120 V, made for 24 V: it will burn out"}]') out.push('note: ' + note);
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(1)); await page.waitForTimeout(900);
    const st = () => page.evaluate(() => { const p = parts[0], v = view.parts.get(p.id); return [!!coilOn[p.id], !!BLOWN[p.id], v.burn.getAttribute('display')].join(); });
    let s = await st(); if (s !== 'true,false,none') out.push('first: ' + s);
    await page.waitForTimeout(3300); s = await st(); if (s !== 'false,true,inline') out.push('after 3 s: ' + s);
    if (await page.evaluate(() => TS_OHMS(parts[0])) !== Infinity) out.push('a burned-out coil does not read open');
    await page.click('#tab-edit');
    // a 24 V secondary: a 24 V coil runs on it, a 120 V coil does not
    for (const [opt, want] of [[{ s24: 1, crv: 24 }, 'coil on'], [{ s24: 1, crv: 120 }, 'coil off'], [{ s24: 1 }, 'coil on']]) {
      await page.evaluate(([b, opt]) => { eval('(' + b + ')')(opt); draw(); }, [BUILD_S2, opt]);
      await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(500);
      const r = await page.evaluate(() => parts.filter(p => p.t === 'coil').map(p => 'coil' + (coilOn[p.id] ? ' on' : ' off')).join());
      if (r !== want) out.push('24 V secondary ' + JSON.stringify(opt) + ': ' + r);
      await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    }
    // pick up and hold in: a coil across L1 and L2 of 208Y/120
    const ph = rv => page.evaluate(rv => { sel = null; loadPreset('blank'); VSYS = '208'; PH_COL = [...VSYS_LIST['208'].col]; POWER = 'boxes'; W = 1300;
      for (const [L, y] of [['1', 140], ['2', 300]]) parts.push(newPart('ph-' + L, 80, y));
      parts.push(P('coil', 600, 300, { L: 'X', color: '#FFDC00', rv }));
      wires.push(Wr(200, 140, 200, 220), Wr(120, 140, 200, 140), Wr(200, 220, 540, 220), Wr(540, 220, 540, 300), Wr(120, 300, 480, 300), Wr(480, 300, 480, 380), Wr(480, 380, 700, 380), Wr(700, 380, 700, 300), Wr(660, 300, 700, 300));
      normalize(); draw(); }, rv);
    const on = () => page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); return !!coilOn[p.id] + ' ' + (p._sh || 0).toFixed(2); });
    await ph(240); await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let o = await on(); if (o !== 'true 1.73') out.push('240 V coil on 208 V: ' + o);
    await page.evaluate(() => { parts.find(q => q.t === 'coil').rv = 277; updateCoils(simT); });
    o = await on(); if (!o.startsWith('true')) out.push('a coil in did not hold at 75%: ' + o);
    await page.evaluate(() => { parts.find(q => q.t === 'coil').rv = 480; updateCoils(simT); });
    o = await on(); if (!o.startsWith('false')) out.push('held in at 43%: ' + o);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    await ph(277); await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    o = await on(); if (!o.startsWith('false')) out.push('a 277 V coil picked up on 208 V: ' + o);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    return out;
  });
  await check('Wide parts\' leads stay inside their ends (Dallas, 22 Nov 2026): the current leaves a limit switch, toggle switch or circuit breaker the moment it gets across, with nothing painted out over the wire past it', async page => {
    const bad = await page.evaluate(() => ['lsw', 'tgl', 'sp2', 'xov', 'dps', 'tps', 'dpd', 'cbk', 'psw', 'fsw', 'flt'].filter(t => { const p = { t }; return LEADH(p) > TERM(p); }));
    if (bad.length) throw new Error('leads past their ends: ' + bad.join(', '));
  });
  await check('Circuit breaker (Dallas, 22 Nov 2026): in the Protection menu; starts on; a short through it trips it (the arc lifted, TRIP showing) and the rest runs on; a click resets it; clicks turn it off and on; Starts; saved; crosses to Print Builder\'s Circuit Breaker and back', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60); await toolbarDrop(page, 'cbk', 300, 200);
    const placed = await page.evaluate(() => { const t = parts.find(p => p.t === 'cbk'); return t ? captionOf(t) + (t.maint ? ' m' : '') + (t.held ? ' h' : '') : 'none'; });
    if (placed !== 'CB1 Circuit Breaker m h') out.push('placed from the menu: ' + placed);
    // L1 - CB1 - lamp - L2; a button that shorts the lamp
    await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1100); const c = newPart('cbk', 300, 240); parts.push(c);
      parts.push(P('lamp', 700, 240, { L: '', color: '#00B050' }), P('btn', 700, 400, { L: 'A', color: '#00B050' }));
      wires.push(Wr(0, 240, 240, 240), Wr(360, 240, 640, 240), Wr(760, 240, W, 240), Wr(500, 240, 500, 400), Wr(500, 400, 660, 400), Wr(740, 400, 900, 400), Wr(900, 400, 900, 240)); normalize(); draw(); });
    const st = () => page.evaluate(() => { const p = parts.find(q => q.t === 'cbk'), v = view.parts.get(p.id); return (coilOn[parts.find(q => q.t === 'lamp').id] ? 'lit' : 'dark') + ' ' + v.flagT.textContent; });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await st(); if (s !== 'lit ON') out.push('at rest: ' + s);
    const thru = await page.evaluate(() => { const p = parts.find(q => q.t === 'cbk'); return [showCol(p._a, simT), showCol(p._b, simT)].join(' '); });   // (it passes on the colour it is given, 22 Nov 2026)
    if (thru.split(' ')[0] !== thru.split(' ')[1] || thru.split(' ')[0] === 'null') out.push('colour in and out: ' + thru);
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(500);
    s = await st(); if (s !== 'dark TRIP') out.push('shorted: ' + s);
    await page.evaluate(() => press('A', false)); await page.waitForTimeout(300);
    s = await st(); if (s !== 'dark TRIP') out.push('short gone, still tripped: ' + s);
    const wait = await page.evaluate(() => { const p = parts.find(q => q.t === 'cbk'), v = view.parts.get(p.id); return v.poles[0].posts[0].getAttribute('fill') === showCol(p._a, simT) && v.poles[0].rings[0].getAttribute('stroke') === showCol(p._a, simT); });   // (tripped: the colour waiting there lit up to its contact)
    if (!wait) out.push('tripped: the line side not lit up to its contact');
    const click = () => page.evaluate(() => { const g = view.parts.get(parts.find(q => q.t === 'cbk').id).g || document.querySelector(`[data-id="${parts.find(q => q.t === 'cbk').id}"]`); return !!g; });
    const hit = async () => { const b = await page.evaluate(() => { const p = parts.find(q => q.t === 'cbk'); const m = WORLD.getScreenCTM(); return [m.a * (p.x + 10) + m.e, m.d * (p.y + 70) + m.f]; }); await page.mouse.click(b[0], b[1]); await page.waitForTimeout(500); };
    await hit(); s = await st(); if (s !== 'lit ON') out.push('reset by a click: ' + s);
    await hit(); s = await st(); if (s !== 'dark OFF') out.push('clicked off: ' + s);
    await hit(); s = await st(); if (s !== 'lit ON') out.push('clicked on: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    await page.evaluate(() => { delete parts.find(q => q.t === 'cbk').held; normalize(); draw(); });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    s = await st(); if (s !== 'dark OFF') out.push('set to start off: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'cbk').map(p => p.t + p.L + (p.maint ? 'm' : '') + (p.held ? 'h' : '')).join());
    if (back !== 'cbk1m') out.push('read back: ' + back);
    await page.evaluate(() => { parts.find(q => q.t === 'cbk').held = true; wires = wires.filter(w => !(w.x1 === 500 || w.x2 === 500 || w.y1 === 400)); parts = parts.filter(q => q.t !== 'btn'); normalize(); draw(); });
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      return [r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'cb').map(p => p.t + ' ' + p.tag).join(), checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'cb CB1') out.push('in Print Builder: ' + pb[0]);
    if (pb[1]) out.push('Check Print: ' + pb[1]);
    pb[2].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'cbk' || p.t === 'stand').map(p => p.t + (p.held ? 'h' : '')).join() + ' ' + wires.filter(w => w.x1 !== w.x2 && w.y1 !== w.y2).length + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join(); }, pb[2]);
    if (again !== 'cbkh 0 ') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('DPST circuit breaker (Dallas, 22 Nov 2026, option A): in the Protection menu, numbered with the single ones; starts on; a short through either pole trips it, opening both; a click resets it; clicks turn both poles off and on; its colour passed on through each pole; saved (on, too); crosses to Print Builder\'s DPST Circuit Breaker and back', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60); await toolbarDrop(page, 'cbk', 300, 200); await toolbarDrop(page, 'cbd', 700, 300);
    const placed = await page.evaluate(() => { const t = parts.find(p => p.t === 'cbd'); return t ? captionOf(t) + (t.maint ? ' m' : '') + (t.held ? ' h' : '') : 'none'; });
    if (placed !== 'CB2 Circuit Breaker (DPST) m h') out.push('placed from the menu: ' + placed);
    // L1 - CB1 top pole - green lamp - L2; L1 - CB1 bottom pole - amber lamp - L2; a button that shorts the bottom lamp
    await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1100); const c = newPart('cbd', 300, 300); parts.push(c);
      parts.push(P('lamp', 700, 240, { L: '', color: '#00B050' }), P('lamp', 700, 360, { L: '', color: '#FFC000' }), P('btn', 700, 520, { L: 'A', color: '#00B050' }));
      wires.push(Wr(0, 240, 240, 240), Wr(360, 240, 640, 240), Wr(760, 240, W, 240), Wr(0, 360, 240, 360), Wr(360, 360, 640, 360), Wr(760, 360, W, 360), Wr(500, 360, 500, 520), Wr(500, 520, 660, 520), Wr(740, 520, 900, 520), Wr(900, 520, 900, 360)); normalize(); draw(); });
    const st = () => page.evaluate(() => { const p = parts.find(q => q.t === 'cbd'), v = view.parts.get(p.id); return parts.filter(q => q.t === 'lamp').map(l => coilOn[l.id] ? 'lit' : 'dark').join(' ') + ' ' + v.flagT.textContent; });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await st(); if (s !== 'lit lit ON') out.push('at rest: ' + s);
    const thru = await page.evaluate(() => parts.find(q => q.t === 'cbd')._poles.map(k => [showCol(k._a, simT), showCol(k._b, simT)]));
    if (thru.some(([a, b]) => !a || a !== b)) out.push('colour in and out: ' + JSON.stringify(thru));
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(500);
    s = await st(); if (s !== 'dark dark TRIP') out.push('bottom lamp shorted: ' + s);
    await page.evaluate(() => press('A', false)); await page.waitForTimeout(300);
    s = await st(); if (s !== 'dark dark TRIP') out.push('short gone, still tripped: ' + s);
    const hit = async () => { const b = await page.evaluate(() => { const p = parts.find(q => q.t === 'cbd'); const m = WORLD.getScreenCTM(); return [m.a * (p.x + 10) + m.e, m.d * (p.y + 130) + m.f]; }); await page.mouse.click(b[0], b[1]); await page.waitForTimeout(500); };
    await hit(); s = await st(); if (s !== 'lit lit ON') out.push('reset by a click: ' + s);
    await hit(); s = await st(); if (s !== 'dark dark OFF') out.push('clicked off: ' + s);
    await hit(); s = await st(); if (s !== 'lit lit ON') out.push('clicked on: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'cbd').map(p => p.t + p.L + (p.maint ? 'm' : '') + (p.held ? 'h' : '')).join());
    if (back !== 'cbd1mh') out.push('read back: ' + back);
    await page.evaluate(() => { wires = wires.filter(w => !(w.x1 === 500 || w.x2 === 500 || w.y1 === 520)); parts = parts.filter(q => q.t !== 'btn'); normalize(); draw(); });
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      return [r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'cb2').map(p => p.t + ' ' + p.tag).join(), checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'cb2 CB1') out.push('in Print Builder: ' + pb[0]);
    if (pb[1]) out.push('Check Print: ' + pb[1]);
    pb[2].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'cbd' || p.t === 'stand').map(p => p.t + (p.held ? 'h' : '')).join() + ' ' + wires.filter(w => w.x1 !== w.x2 && w.y1 !== w.y2).length + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join(); }, pb[2]);
    if (again !== 'cbdh 0 ') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('3PST circuit breaker (Dallas, 22 Nov 2026): in the Protection menu\'s Circuit Breakers, numbered with the others; starts on; a short through the middle pole trips it, opening all three; a click resets it; clicks turn all three off and on; its colour passed on through each pole; saved (on, too); crosses to Print Builder\'s 3PST Circuit Breaker and back', async page => {
    const out = [];
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60); await toolbarDrop(page, 'cbk', 300, 200); await toolbarDrop(page, 'cbt', 700, 300);
    const placed = await page.evaluate(() => { const t = parts.find(p => p.t === 'cbt'); return t ? captionOf(t) + (t.maint ? ' m' : '') + (t.held ? ' h' : '') : 'none'; });
    if (placed !== 'CB2 Circuit Breaker (3PST) m h') out.push('placed from the menu: ' + placed);
    // three rungs, one through each pole, each with a lamp; a button that shorts the middle lamp
    await page.evaluate(() => { sel = null; loadPreset('blank'); W = Math.max(W_MIN, 1100); const c = newPart('cbt', 300, 300); parts.push(c);
      parts.push(P('lamp', 700, 180, { L: '', color: '#00B050' }), P('lamp', 700, 300, { L: '', color: '#FFC000' }), P('lamp', 700, 420, { L: '', color: '#FF3B3B' }), P('btn', 700, 560, { L: 'A', color: '#00B050' }));
      for (const y of [180, 300, 420]) wires.push(Wr(0, y, 240, y), Wr(360, y, 640, y), Wr(760, y, W, y));
      wires.push(Wr(500, 300, 500, 560), Wr(500, 560, 660, 560), Wr(740, 560, 900, 560), Wr(900, 560, 900, 300)); normalize(); draw(); });
    const st = () => page.evaluate(() => { const p = parts.find(q => q.t === 'cbt'), v = view.parts.get(p.id); return parts.filter(q => q.t === 'lamp').map(l => coilOn[l.id] ? 'lit' : 'dark').join(' ') + ' ' + v.flagT.textContent; });
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(400);
    let s = await st(); if (s !== 'lit lit lit ON') out.push('at rest: ' + s);
    const thru = await page.evaluate(() => parts.find(q => q.t === 'cbt')._poles.map(k => [showCol(k._a, simT), showCol(k._b, simT)]));
    if (thru.some(([a, b]) => !a || a !== b)) out.push('colour in and out: ' + JSON.stringify(thru));
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(500);
    s = await st(); if (s !== 'dark dark dark TRIP') out.push('bottom lamp shorted: ' + s);
    await page.evaluate(() => press('A', false)); await page.waitForTimeout(300);
    s = await st(); if (s !== 'dark dark dark TRIP') out.push('short gone, still tripped: ' + s);
    const hit = async () => { const b = await page.evaluate(() => { const p = parts.find(q => q.t === 'cbt'); const m = WORLD.getScreenCTM(); return [m.a * (p.x + 10) + m.e, m.d * (p.y + 190) + m.f]; }); await page.mouse.click(b[0], b[1]); await page.waitForTimeout(500); };
    await hit(); s = await st(); if (s !== 'lit lit lit ON') out.push('reset by a click: ' + s);
    await hit(); s = await st(); if (s !== 'dark dark dark OFF') out.push('clicked off: ' + s);
    await hit(); s = await st(); if (s !== 'lit lit lit ON') out.push('clicked on: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => p.t === 'cbt').map(p => p.t + p.L + (p.maint ? 'm' : '') + (p.held ? 'h' : '')).join());
    if (back !== 'cbt1mh') out.push('read back: ' + back);
    await page.evaluate(() => { wires = wires.filter(w => !(w.x1 === 500 || w.x2 === 500 || w.y1 === 560)); parts = parts.filter(q => q.t !== 'btn'); normalize(); draw(); });
    const d = await page.evaluate(() => circuitData());
    const pb = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      return [r.doc.sheets.flatMap(s => s.parts).filter(p => p.t === 'cb3').map(p => p.t + ' ' + p.tag).join(), checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (pb[0] !== 'cb3 CB1') out.push('in Print Builder: ' + pb[0]);
    if (pb[1]) out.push('Check Print: ' + pb[1]);
    pb[2].link.fp = 'changed'; const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => p.t === 'cbt' || p.t === 'stand').map(p => p.t + (p.held ? 'h' : '')).join() + ' ' + wires.filter(w => w.x1 !== w.x2 && w.y1 !== w.y2).length + ' ' + [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join(); }, pb[2]);
    if (again !== 'cbth 0 ') out.push('drawn again in Circuit Builder from the print: ' + again);
    return out;
  });

  await check('Toggle switches start as set (Dallas, 21 Nov 2026): Starts (Off / On for an SPST; At 2 / At 1 for an SPDT) on the Part tab; drawn so in Build; in Run it starts that way, a click flips it from there, Reset puts it back; saved', async page => {
    const out = [];
    await page.evaluate(() => { loadPreset('blank'); W = Math.max(W_MIN, 1100); const a = newPart('tgl', 400, 200), b = newPart('sp2', 400, 560); parts.push(a, b); normalize(); draw(); });
    const pick = async t => { const at = await page.evaluate(t => { const q = parts.find(p => p.t === t), m = WORLD.getScreenCTM(); return { x: m.a * q.x + m.e, y: m.d * (q.y + 60) + m.f }; }, t); await page.mouse.click(at.x, at.y); await page.waitForTimeout(120); };
    await pick('tgl');
    const o1 = await page.evaluate(() => [...document.getElementById('ls-start').options].map(o => o.textContent).join('/') + (document.getElementById('ls-start').closest('.tgroup').hidden ? ' hidden' : ''));
    if (o1 !== 'Off/On') out.push('SPST Starts: ' + o1);
    await page.selectOption('#ls-start', '1');
    await pick('sp2');
    const o2 = await page.evaluate(() => [...document.getElementById('ls-start').options].map(o => o.textContent).join('/'));
    if (o2 !== 'At 2 (Lever Down)/At 1 (Lever Up)') out.push('SPDT Starts: ' + o2);
    await page.selectOption('#ls-start', '1');
    const b0 = await page.evaluate(() => parts.map(p => { const v = view.parts.get(p.id); return p.t + ':' + (v.lev[1].getAttribute('display') === 'none' ? 'down' : 'up'); }).join());
    if (b0 !== 'tgl:up,sp2:up') out.push('drawn in Build: ' + b0);
    const st = () => page.evaluate(() => parts.map(p => p.t + ':' + (p.t === 'tgl' ? (lswClosed(p) ? 'on' : 'off') : (closed(p._poles[0]) ? '1' : '2'))).join());
    await page.click('#tab-run'); await page.evaluate(() => setSpeed(300)); await page.waitForTimeout(300);
    let s = await st(); if (s !== 'tgl:on,sp2:1') out.push('starting: ' + s);
    await page.evaluate(() => { for (const p of parts) press(opKey(p), !down[opKey(p)]); }); await page.waitForTimeout(400);
    s = await st(); if (s !== 'tgl:off,sp2:2') out.push('flipped: ' + s);
    await page.click('#reset-btn'); await page.waitForTimeout(400);
    s = await st(); if (s !== 'tgl:on,sp2:1') out.push('after Reset: ' + s);
    await page.evaluate(() => setSpeed(1)); await page.click('#tab-edit');
    const back = await page.evaluate(() => readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.map(p => p.t + (p.held ? '+' : '-')).join());
    if (back !== 'tgl+,sp2+') out.push('read back: ' + back);
    return out;
  });

  await check('SPDTs to Print Builder (Dallas, 21 Nov 2026): a two-way switch circuit (two SPDTs, throw wired to throw) goes to the print with the rows by each SPDT closed up to the symbol\'s throws (40 from its common), so the wires between the throws run straight, with no jog; Check Print clean; and back to Circuit Builder wired as before', async page => {
    const out = [];
    const d = await page.evaluate(() => { loadPreset('blank'); W = 1300; const a = newPart('sp2', 300, 240); parts.push(a); const b = newPart('sp2', 940, 240); b.fx = true; parts.push(b);
      parts.push(P('lamp', 1160, 240, { L: '', color: '#FFDC00' })); wires.push(Wr(0, 240, 240, 240), Wr(360, 180, 880, 180), Wr(360, 300, 880, 300), Wr(1000, 240, 1100, 240), Wr(1220, 240, W, 240)); normalize(); draw(); return circuitData(); });
    const r = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
      const sw = S.parts.filter(p => p.t === 'spdt'), bent = [];
      for (const w of S.wires) { const ends = [w.a, w.b].filter(e => e.p && sw.some(p => p.id === e.p)); if (ends.length !== 2) continue; const ys = new Set(w.pts.map(q => q[1])); if (ys.size > 1) bent.push(w.pts.map(q => q.join(',')).join(' ')); }
      return [bent, checkPrint().filter(i => i.sev === 'e').map(i => i.title).join(), JSON.parse(JSON.stringify(r.doc))]; }, d));
    if (r[0].length) out.push('wires between the throws not straight: ' + r[0].join(' | '));
    if (r[1]) out.push('Check Print: ' + r[1]);
    r[2].link.fp = 'changed'; const back = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join() || 'ok'; }, r[2]);
    if (back !== 'ok') out.push('back in Circuit Builder: ' + back);
    return out;
  });

  await check('SPDTs from Print Builder (Dallas, 21 Nov 2026): a print of its own (not from Circuit Builder) with a two-way switch circuit comes into Circuit Builder with each SPDT\'s rows opened out to its throws (60 from its common), so every wire meets its throw straight; the rung under a toggle switch kept clear of its body', async page => {
    const out = [];
    const d = await page.evaluate(() => { loadPreset('blank'); W = 1300; const a = newPart('sp2', 300, 240); parts.push(a); const b = newPart('sp2', 940, 240); b.fx = true; parts.push(b); const c = newPart('tgl', 300, 560); parts.push(c, P('lamp', 1160, 240, { L: '', color: '#FFDC00' }), P('lamp', 1160, 560, { L: '', color: '#FFDC00' }));
      wires.push(Wr(0, 240, 240, 240), Wr(360, 180, 880, 180), Wr(360, 300, 880, 300), Wr(1000, 240, 1100, 240), Wr(1220, 240, W, 240), Wr(0, 560, 240, 560), Wr(360, 560, 1100, 560), Wr(1220, 560, W, 560)); normalize(); draw(); return circuitData(); });
    const doc = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); const doc = JSON.parse(JSON.stringify(r.doc)); delete doc.link; return doc; }, d));
    const r = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); draw(); const bad = [];
      for (const p of parts.filter(p => p.t === 'sp2')) for (const [x, y] of terms(p)) { const ws = wires.filter(w => (w.x1 === x && w.y1 === y) || (w.x2 === x && w.y2 === y)); if (!ws.length || ws.some(w => w.y1 !== w.y2)) bad.push(`SW${p.L} at ${x},${y}: ` + (ws.map(w => [w.x1, w.y1, w.x2, w.y2].join(',')).join(' ') || 'no wire')); }
      const sw = parts.filter(p => p.t === 'sp2' || p.t === 'tgl').sort((a, b) => a.y - b.y), gap = sw.length > 1 ? Math.max(...sw.map(p => p.y)) - Math.min(...sw.map(p => p.y)) : 0;
      return [bad, [...wiringIssues(NET).values()].filter(v => typeof v === 'string').join(), gap]; }, doc);
    if (r[0].length) out.push('not met straight: ' + r[0].join(' | '));
    if (r[1]) out.push('warnings: ' + r[1]);
    if (r[2] < 180 + 41 + 30) out.push('the SPST rung under the SPDTs only ' + r[2] + ' below them');
    return out;
  });

  await check('Turned parts (Dallas, 19 Nov 2026): a part turned on the print is turned in Circuit Builder (its terminals where the print\'s wires reach them), saved so, and turned again on the way back; one turned in Circuit Builder is turned on the print', async page => {
    const SPEC = [['pb_no', 90], ['coil', 90], ['con_no', 270], ['ls_no', 180], ['pl', 90], ['sol', 270]];
    const pr = await withPB(page, pb => pb.evaluate(SPEC => { loadDoc(withDrawnBy(template('blank'))); const L1 = S.parts.find(q => q.label === 'L1'); let x = 500;
      for (const [t, r] of SPEC) { const p = addPart(S, t, x, 600); p.rot = r; p.tag = t === 'coil' ? 'CR' : t === 'con_no' ? 'CR' : t === 'pb_no' ? 'PB-A' : t === 'ls_no' ? 'LS1' : t === 'pl' ? 'PL1' : 'SOL1';
        const ts = linkPbTerms(p).sort((u, v) => u[1] - v[1] || u[0] - v[0]); addWire(S, [[L1.x, ts[0][1] - 80], [ts[0][0], ts[0][1] - 80], ts[0]]); x += 260; }
      refresh(true); return JSON.parse(JSON.stringify(doc)); }, SPEC));
    const cb = await page.evaluate(pr => { openFromPrint(pr, 'Turned'); const note = document.getElementById('link-body').textContent; document.getElementById('link-dlg').close(); draw();
      const got = parts.filter(p => !['l1', 'l2'].includes(p.t)).map(p => p.t + ':' + (p.rot || 0)).join(' ');
      const wired = parts.filter(p => !['l1', 'l2'].includes(p.t)).map(p => terms(p).some(([x, y]) => wires.some(w => (w.x1 === x && w.y1 === y) || (w.x2 === x && w.y2 === y))));
      const again = readCircuit(JSON.parse(JSON.stringify(circuitData()))).parts.filter(p => !['l1', 'l2'].includes(p.t)).map(p => p.t + ':' + (p.rot || 0)).join(' ');
      return { got, wired, again, note, data: circuitData() }; }, pr);
    const back = await withPB(page, pb => pb.evaluate(d => circuitToPrint(d, { uid, defaultTB, long: 'tight' }).doc.sheets.flatMap(s => s.parts).filter(p => p.t !== 'rail').map(p => p.t + ':' + (p.rot || 0)).sort().join(' '), cb.data));
    const out = [], want = 'btn:1 coil:1 con:3 lsw:2 lamp:1 sol:3';
    if (cb.got.split(' ').sort().join(' ') !== want.split(' ').sort().join(' ')) out.push('in Circuit Builder: ' + cb.got + ' (want ' + want + ')');
    if (cb.wired.some(w => !w)) out.push('a turned part is not on its wire in Circuit Builder: ' + cb.wired.join(','));
    if (cb.again !== cb.got) out.push('saved and read back: ' + cb.again);
    if (back !== SPEC.map(([t, r]) => t + ':' + r).sort().join(' ')) out.push('back on the print: ' + back);
    // turned in Circuit Builder itself
    const mine = await page.evaluate(() => { parts = []; wires = []; const b = P('btn', 300, 200, { L: 'A' }); parts.push(b); normalize(); sel = selOne('p', b.id); draw(); KB_ACT.rotate.run(); return [b.rot || 0, JSON.stringify(terms(b)), circuitData()]; });
    if (mine[0] !== 1 || mine[1] !== '[[300,160],[300,240]]') out.push('R on a button: turn ' + mine[0] + ', terminals ' + mine[1]);
    const mp = await withPB(page, pb => pb.evaluate(d => circuitToPrint(d, { uid, defaultTB, long: 'tight' }).doc.sheets[0].parts.find(p => /^pbm?_no$/.test(p.t)).rot, mine[2]));
    if (mp !== 90) out.push('a button turned in Circuit Builder: turned ' + mp + ' on the print');
    return out;
  });
  await check('Names typed in (Dallas, 19 Nov 2026): a button, selector or coil takes a name of its own (up to six letters and digits), a name another kind of part has is refused, and names cross to Print Builder and back as they are (START is PB-START; CR1 is CR1)', async page => {
    await page.selectOption('#preset', 'blank'); await page.waitForTimeout(60);
    const ids = await page.evaluate(() => { const b = P('btn', 200, 160, { L: 'A' }), c = P('coil', 600, 160, { L: 'X' }), k = P('con', 400, 320, { L: 'X' }); parts.push(b, c, k); normalize(); draw(); return [b.id, c.id]; });
    const type = (kind, id, box, v) => page.evaluate(([id, box, v]) => { sel = selOne('p', id); draw(); renderProps(); const e = document.querySelector(box); e.value = v; e.dispatchEvent(new Event('change'));
      return [parts.find(p => p.id === id).L, e.value]; }, [id, box, v]);
    const out = [];
    let r = await type('p', ids[0], '#p-letter', 'start'); if (r[0] !== 'START') out.push('button typed "start": ' + r.join(' / '));
    r = await type('p', ids[0], '#p-letter', 'X'); if (r[0] !== 'START' || r[1] !== 'START') out.push('button given the coil\'s letter X: ' + r.join(' / '));
    r = await type('p', ids[0], '#p-letter', '1AB'); if (r[0] !== 'START') out.push('button typed "1AB": ' + r.join(' / '));
    r = await type('o', ids[1], '#o-letter', 'CR1'); if (r[0] !== 'CR1') out.push('coil typed CR1: ' + r.join(' / '));
    const con = await page.evaluate(() => parts.find(p => p.t === 'con').L); if (con !== 'CR1') out.push('its contact went to ' + con);
    const cap = await page.evaluate(id => view.parts.get(id).text && view.parts.get(id).text.textContent, ids[0]); if (!/START/.test(cap || '')) out.push('the button\'s cap: ' + cap);
    const d = await page.evaluate(() => circuitData());
    const back = await withPB(page, pb => pb.evaluate(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); const tags = r.doc.sheets.flatMap(s => s.parts.map(p => p.t + ':' + (p.tag || ''))).filter(t => !/^rail/.test(t)).sort().join(' ');
      const doc2 = JSON.parse(JSON.stringify(r.doc)); delete doc2.link; return [tags, doc2]; }, d));
    if (!/^coil:CR1 con_no:CR1 pbm?_no:PB-START$/.test(back[0])) out.push('in Print Builder: ' + back[0]);
    const again = await page.evaluate(doc => { openFromPrint(doc, 'x'); document.getElementById('link-dlg').close(); return parts.filter(p => ['btn', 'coil', 'con'].includes(p.t)).map(p => p.t + ':' + p.L).sort().join(' '); }, back[1]);
    if (again !== 'btn:START coil:CR1 con:CR1') out.push('drawn again in Circuit Builder from that print: ' + again);
    return out;
  });
  await check('Stand-ins (Dallas, 19 Nov 2026): every Print Builder part Circuit Builder has none of comes in as a stand-in (its symbol in a box, terminals as the print joins them), draws, runs (passing nothing) and prints, and goes back to the print as the same part, tag and name', async page => {
    const TYPES = ['prs_no', 'fdsc3', 'ol'];
    const pr = await withPB(page, pb => pb.evaluate(TYPES => { loadDoc(withDrawnBy(template('blank'))); const L1 = S.parts.find(q => q.label === 'L1'); let y = 260;
      for (const t of TYPES) { const p = addPart(S, t, 900, y); p.tag = t.toUpperCase().replace(/_/g, '') + '1'; p.desc = 'D' + t; const tm = linkPbTerms(p)[0]; addWire(S, [[L1.x, tm[1]], tm]); y += 340; }
      refresh(true); return JSON.parse(JSON.stringify(doc)); }, TYPES));
    const cb = await page.evaluate(pr => { openFromPrint(pr, 'Stand-ins'); document.getElementById('link-dlg').close(); draw();
      const st = parts.filter(p => p.t === 'stand'), out = { n: st.length, syms: st.map(p => p.sym).sort().join(' '), boxes: document.querySelectorAll('rect[stroke-dasharray="6 4"]').length };
      const h = document.createElement('div'); h.innerHTML = printSheet('x', true).html; out.printSyms = h.querySelectorAll('g.sym').length;
      startRun(); return out; }, pr);
    await page.waitForTimeout(400); cb.data = await page.evaluate(() => circuitData());
    const back = await withPB(page, pb => pb.evaluate(([d, TYPES]) => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); const ps = r.doc.sheets.flatMap(s => s.parts);
      return TYPES.map(t => { const p = ps.find(q => q.t === t); return p ? t + ':' + p.tag + ':' + p.desc : t + ': missing'; }); }, [cb.data, TYPES]));
    const out = [];
    if (cb.n !== TYPES.length) out.push(`${cb.n} stand-ins in Circuit Builder (want ${TYPES.length}): ${cb.syms}`);
    if (cb.boxes < TYPES.length) out.push(`${cb.boxes} stand-in boxes drawn`);
    if (cb.printSyms < TYPES.length) out.push(`Print Diagram: ${cb.printSyms} symbols`);
    for (const [i, t] of TYPES.entries()) if (back[i] !== `${t}:${t.toUpperCase().replace(/_/g, '')}1:D${t}`) out.push('back in Print Builder: ' + back[i]);
    if (page.errors.length) out.push('page errors: ' + page.errors.slice(0, 3).join(' | '));
    return out;
  });
  await check('O³ link (Dallas, 19 Nov 2026, his report): a print opened in Circuit Builder with only a wire redrawn (or a letter changed) comes back as he drew it, the letter brought up to date; a wire taken away (joined differently) draws it again', async page => {
    const pr = await withPB(page, pb => pb.evaluate(() => JSON.parse(JSON.stringify(withDrawnBy(template('starter'))))));
    const ds = await page.evaluate(pr => { const out = {}; const open = () => { openFromPrint(pr, 'Starter'); document.getElementById('link-dlg').close(); };
      // a wire drawn differently: the longest across in two pieces, meeting at a bend that joins nothing else
      open(); { const i = wires.map((w, i) => [Math.abs(w.x2 - w.x1) * (w.y1 === w.y2), i]).sort((a, b) => b[0] - a[0])[0][1], w = wires[i], m = Math.round((w.x1 + w.x2) / 40) * 20;
        wires.splice(i, 1, { ...w, x2: m }, { ...w, x1: m }); draw(); out.wire = circuitData(); }
      open(); { const c = parts.find(p => p.t === 'coil'); out.was = c.L; c.L = 'Q'; for (const p of parts) if (p !== c && p.L === out.was && p.t === 'con') p.L = 'Q'; draw(); out.letter = circuitData(); }
      open(); { wires.splice(wires.findIndex(w => w.y1 === w.y2 && w.x1 !== 0 && w.x2 !== 0), 1); draw(); out.cut = circuitData(); }
      return out; }, pr);
    const r = await withPB(page, pb => pb.evaluate(ds => Object.fromEntries(['wire', 'letter', 'cut'].map(k => { const x = circuitToPrint(ds[k], { uid, defaultTB, long: 'tight' });
      return [k, { kept: !!x.notes.kept, note: x.notes.changed.join(' '), layout: JSON.stringify(x.doc.sheets.map(s => [s.parts.map(p => [p.id, p.x, p.y]), s.wires.map(w => [w.id, w.pts]), s.nodes, s.texts])), tags: x.doc.sheets.flatMap(s => s.parts.map(p => p.tag || '')) }]; })), ds));
    const out = [], want = JSON.stringify(pr.sheets.map(s => [s.parts.map(p => [p.id, p.x, p.y]), s.wires.map(w => [w.id, w.pts]), s.nodes, s.texts]));
    if (!r.wire.kept || r.wire.layout !== want) out.push('a wire redrawn in Circuit Builder: the print came back laid out differently (' + r.wire.note + ')');
    if (!r.letter.kept || r.letter.layout !== want) out.push('a letter changed: the print came back laid out differently (' + r.letter.note + ')');
    if (r.letter.tags.filter(t => t === 'Q').length !== 1 + ds.letter.parts.filter(a => a[0] === 'con' && a[3] === 'Q').length) out.push('a letter changed: tags on the print not brought up to date: ' + r.letter.tags.filter(Boolean).join(' '));
    if (r.cut.kept) out.push('a wire taken away: still the old print (it is joined differently now)');
    return out;
  });
  await check('O³ link (Dallas, 19 Nov 2026): a print opened in Circuit Builder and sent back unchanged (even after saving and opening the circuit again) is the same print exactly; changed, it is drawn again with no old print inside it', async page => {
    const pr = await withPB(page, pb => pb.evaluate(() => JSON.parse(JSON.stringify(withDrawnBy(template('starter'))))));
    const ds = await page.evaluate(pr => { openFromPrint(pr, 'Starter'); document.getElementById('link-dlg').close(); const a = circuitData();
      useCircuit(readCircuit(JSON.parse(JSON.stringify(a))), 'reopened'); const b = circuitData();
      const p = parts.find(q => q.t === 'coil'); p.x += 40; draw(); const c = circuitData(); return [a, b, c]; }, pr);
    const back = await withPB(page, pb => pb.evaluate(ds => ds.map(d => { const r = circuitToPrint(d, { uid, defaultTB, long: 'tight' }); return [!!r.notes.same, JSON.stringify(r.doc), JSON.stringify(r.doc).includes('"pr"')]; }), ds));
    const opened = await withPB(page, pb => pb.evaluate(d => { openCircuit(d); const t = document.getElementById('link-body').textContent; document.getElementById('link-dlg').close(); const x = JSON.parse(JSON.stringify(doc)); return [JSON.stringify(x.sheets), t]; }, ds[0]));
    const out = [], want = JSON.stringify(pr);
    if (opened[0] !== JSON.stringify(pr.sheets)) out.push('opened in Print Builder: the sheets are not the print it was');
    if (!/exactly as it was/.test(opened[1])) out.push('opened in Print Builder: no word that it is the print it was (' + opened[1].slice(0, 80) + ')');
    if (!ds[0].pr) out.push('the circuit keeps no note of the print it came from');
    if (!back[0][0] || back[0][1] !== want) out.push('sent straight back: not the same print');
    if (!back[1][0] || back[1][1] !== want) out.push('saved and opened again, then sent back: not the same print');
    if (back[2][0] || back[2][1] === want) out.push('changed, it still came back as the old print');
    if (back[2][2]) out.push('changed: the old print is carried inside the new one');
    return out;
  });
  await check('O³ link (Dallas, 19 Nov 2026): no ink off the sheet: every ready-made circuit and test circuit, power sections too (FWD/REV), drawn as a print in each way a long rung can go, stays inside each sheet\'s border', async page => {
    const fs = require('fs'), path = require('path'), FX = path.join(__dirname, 'fixtures');
    const circs = (await page.evaluate(() => [...document.getElementById('preset').options].map(o => o.value).filter(v => v && v !== 'blank').map(n => { loadPreset(n); return [n, circuitData()]; })))
      .concat(fs.readdirSync(path.join(FX, 'transfer')).map(f => [f, JSON.parse(fs.readFileSync(path.join(FX, 'transfer', f), 'utf8'))]))
      .concat(fs.readdirSync(FX).filter(f => /\.json$/.test(f)).map(f => [f, JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8'))]).filter(([, d]) => Array.isArray(d.parts)));
    return withPB(page, pb => pb.evaluate(circs => { const out = [];
      for (const [n, d] of circs) for (const m of ['land', 'tight', 'wrap', 'cont']) { const r = circuitToPrint(d, { uid, defaultTB, tidy, long: m }); loadDoc(JSON.parse(JSON.stringify(r.doc))); refresh(true);
        doc.sheets.forEach((s, k) => { const W = drawW(s), H = drawH(s); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const grow = (a, b, c, e) => { x0 = Math.min(x0, a); x1 = Math.max(x1, b); y0 = Math.min(y0, c); y1 = Math.max(y1, e); };
          for (const p of s.parts) { if (p.t === 'rail') { grow(p.x, p.x, p.y0, p.y1); continue; } const b = partBox(p); grow(b.x0, b.x1, b.y0, b.y1); }
          for (const w of s.wires) for (const q of wirePts(s, w)) grow(q[0], q[0], q[1], q[1]);
          if (x0 < 0 || y0 < 0 || x1 > W || y1 > H) out.push(`${n} (${m}), sheet ${k + 1}: ink from ${Math.round(x0)},${Math.round(y0)} to ${Math.round(x1)},${Math.round(y1)} on a ${W} by ${H} sheet`); }); }
      return out; }, circs));
  });
  await check('O³ link (Dallas, 19 Nov 2026): no near-empty sheets: in every ready-made and test circuit drawn as a print, each sheet but the last at least half full (landscape that would leave one thin stays portrait, its long rungs wrapped) (the stress test\'s first sheet held one rung of 17)', async page => {
    const fs = require('fs'), path = require('path'), FX = path.join(__dirname, 'fixtures');
    const circs = (await page.evaluate(() => [...document.getElementById('preset').options].map(o => o.value).filter(v => v && v !== 'blank').map(n => { loadPreset(n); return [n, circuitData()]; })))
      .concat(fs.readdirSync(path.join(FX, 'transfer')).map(f => [f, JSON.parse(fs.readFileSync(path.join(FX, 'transfer', f), 'utf8'))]))
      .concat(fs.readdirSync(FX).filter(f => /\.json$/.test(f)).map(f => [f, JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8'))]).filter(([, d]) => Array.isArray(d.parts)));
    return withPB(page, pb => pb.evaluate(circs => { const out = [];
      for (const [n, d] of circs) for (const m of ['tight', 'land']) { const r = circuitToPrint(d, { uid, defaultTB, tidy, long: m }); const sh = r.doc.sheets;
        sh.slice(0, -1).forEach((s, k) => { const ys = s.parts.filter(p => p.t !== 'rail' && !/^cnt_/.test(p.t)).map(p => p.y); if (!ys.length) { out.push(`${n} (${m}), sheet ${k + 1} of ${sh.length}: nothing on it`); return; }
          const used = (Math.max(...ys) - Math.min(...ys) + 160) / (drawH(s) - 280); if (used < .5) out.push(`${n} (${m}), sheet ${k + 1} of ${sh.length}: ${Math.round(used * 100)}% full`); }); }
      return out; }, circs));
  });
  await check('O³ link (Dallas, 19 Nov 2026, his "Ladder Edit" drawings): a rung too long for letter portrait asks how to draw it (landscape, tighter, wrapped, or continued on a new rung) and remembers; wrapped, the wire runs back under the rung and the line keeps its number; continued, a new rung from continuations named R#-W#; either way it comes back to Circuit Builder joined the same way', async page => {
    const out = [], fs = require('fs'), d = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'long-rung.json'), 'utf8'));
    // (the parts come back on new lines: the nets compared by what each part is, not where it is)
    await page.evaluate(NETSIG.replace("a[0] + '@' + a[1] + ',' + a[2] + '#' + i", "a[0] + ':' + a[3] + ':' + (a[4] ? 1 : 0) + '#' + i").replace('const netSig =', 'const netSigL =') + 'window.netSigL = netSigL;');
    const r = await withPB(page, pb => pb.evaluate(d => { try { localStorage.removeItem(LONGKEY); } catch (_) {}
      const res = {}; openCircuit(d); res.asked = $('long-dlg').open; res.opts = [...document.querySelectorAll('#long-dlg .long-opt b')].map(b => b.textContent);
      const look = () => { refresh(true); const s = doc.sheets[0], ctl = s.parts.filter(p => p.t !== 'rail' && !/^cnt/.test(p.t)), ys = [...new Set(ctl.map(p => p.y))].sort((a, b) => a - b);
        return { sheets: doc.sheets.length, land: !!s.land, conts: s.parts.filter(p => /^cnt/.test(p.t)).length, rails: s.parts.filter(p => p.t === 'rail').length, rows: ys.length, rungs: ys.map(y => A.rung.get(ctl.find(p => p.y === y).id)).join(','),
          notes: s.parts.filter(p => /^cnt/.test(p.t)).map(p => contNote(p, 0)).join(' '), loose: checkPrint().filter(i => /without reaching|not wired/.test(i.title)).length }; };
      document.querySelector('#long-dlg .long-opt[data-long="wrap"]').click(); res.closed = !$('long-dlg').open; $('link-dlg').close(); res.wrap = look();
      try { res.saved = localStorage.getItem('oo-print-builder:long-rungs'); } catch (_) {}
      openCircuit(d); res.lastMarked = document.querySelector('#long-dlg .long-opt.last')?.dataset.long; document.querySelector('#long-dlg .long-opt[data-long="cont"]').click(); $('link-dlg').close(); res.cont = look();
      openCircuit(d); document.querySelector('#long-dlg .long-opt[data-long="land"]').click(); $('link-dlg').close(); res.land = !!doc.sheets[0].land;
      res.prints = ['wrap', 'cont'].map(m => JSON.parse(JSON.stringify(circuitToPrint(d, { uid, defaultTB, long: m }).doc)));
      // (the choice saved before 19 Nov 2026, fold, is now Continue on a New Rung)
      try { localStorage.setItem(LONGKEY, 'fold'); } catch (_) {} openCircuit(d); res.oldFold = document.querySelector('#long-dlg .long-opt.last')?.dataset.long; $('long-dlg').close();
      // (a rung that fits: no question)
      const short = JSON.parse(JSON.stringify(d)); short.parts = short.parts.filter(p => p[2] !== 200); short.wires = short.wires.filter(w => w[1] !== 200); openCircuit(short); res.askedShort = $('long-dlg').open; if (res.askedShort) $('long-dlg').close(); else $('link-dlg').close();
      return res; }, d));
    if (!r.asked) out.push('no question for a rung too long for portrait');
    if (r.opts.join('|') !== 'Landscape When Needed|Stay Portrait, Tighter|Wrap Long Rungs|Continue on a New Rung') out.push('choices: ' + r.opts.join(', '));
    if (!r.closed) out.push('the question stayed open after a choice');
    if (r.wrap.land || r.wrap.conts || r.wrap.rails !== 2 || r.wrap.loose) out.push('wrapped: ' + JSON.stringify(r.wrap));
    { const n = r.wrap.rungs.split(','); if (n[0] !== n[1] || n[2] === n[1]) out.push('wrapped: the line under the rung should keep its number (rungs ' + r.wrap.rungs + ')'); }
    if (r.cont.land || r.cont.conts !== 2 || r.cont.rails !== 2 || r.cont.loose) out.push('continued: ' + JSON.stringify(r.cont));
    if (!/^R2-W\d+ R1-W\d+$/.test(r.cont.notes) || r.cont.notes.split(' ').map(x => x.split('-')[1]).reduce((a, b) => a === b ? a : '') === '') out.push('continued: notes ' + r.cont.notes + ' (want R2-Wn on the rung, R1-Wn on the new rung, one wire number)');
    if (r.cont.rungs.split(',').slice(0, 2).join() !== '1,2') out.push('continued: the new rung should have its own number (rungs ' + r.cont.rungs + ')');
    if (r.lastMarked !== 'wrap') out.push('the choice not remembered (' + r.lastMarked + ')');
    if (r.oldFold !== 'cont') out.push('a saved Fold choice should now mean Continue on a New Rung (' + r.oldFold + ')');
    if (!r.land) out.push('landscape when needed: not landscape');
    if (r.askedShort) out.push('asked for a circuit that fits');
    for (const [i, m] of ['wrap', 'cont'].entries()) {
      const back = await page.evaluate(([print, d]) => { const ch = JSON.parse(JSON.stringify(print)); ch.link.fp = 'changed'; const b = printToCircuit(ch); return [netSigL(d) === netSigL(b.data), printToCircuit(print).notes.same]; }, [r.prints[i], d]);
      if (!back[0]) out.push(m + ' print, changed, comes back joined differently');
      if (!back[1]) out.push(m + ' print, unchanged, does not come back exactly');
    }
    return out;
  });

  await check('O³ link (Dallas, 17 Nov 2026): a print drawn in Print Builder (the drill station, several sheets) comes into Circuit Builder with no part on another, and no continuation boxes where a wire just runs onto the next sheet', async page => {
    const out = [], d = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'fixtures', 'drill-station.json'), 'utf8'));
    const print = await withPB(page, pb => pb.evaluate(d => { const doc0 = circuitToPrint(d, { uid, defaultTB }).doc; delete doc0.link; return doc0; }, d));
    const r = await page.evaluate(p => { const res = printToCircuit(p), c = readCircuit(res.data);
      const box = q => { const ts = terms(q); const xs = ts.map(t => t[0]).concat(q.x), ys = ts.map(t => t[1]).concat(q.y); return [Math.min(...xs) + 4, Math.max(...xs) - 4, Math.min(...ys), Math.max(...ys)]; };
      let over = 0; const two = c.parts.filter(q => terms(q).length === 2 && terms(q)[0][1] === terms(q)[1][1]);
      for (let i = 0; i < two.length; i++) for (let j = i + 1; j < two.length; j++) { const a = box(two[i]), b = box(two[j]); if (a[2] === b[2] && a[0] < b[1] && b[0] < a[1]) over++; }
      return { over, jmp: c.parts.filter(q => q.t === 'jmp').length, n: c.parts.length }; }, print);
    if (r.over) out.push(r.over + ' parts overlapping another on its row');
    if (r.jmp) out.push(r.jmp + ' continuation boxes');
    if (r.n < 370) out.push('only ' + r.n + ' parts');
    return out;
  });

  await check('O³ link: a print made from a circuit keeps what only Circuit Builder knows (colours, planted faults, a work order) when it comes back changed; a light\'s colour named on the print wins', async page => {
    const out = [];
    const d = await page.evaluate(() => { loadPreset('traffic'); const c = circuitData(); c.parts.find(a => a[0] === 'coil')[6] = '7030A0'; c.fl = [[c.parts.findIndex(a => a[0] === 'coil'), 'open']]; c.wo = 'Lights stay dark'; return c; });
    const print = await withPB(page, pb => pb.evaluate(d => { openCircuit(d); $('link-dlg').close(); const p = doc.sheets[0].parts.find(q => q.t === 'pl' && q.desc === 'RED'); p.desc = 'BLUE'; const c = doc.sheets[0].parts.find(q => q.t === 'coil'); c.x += 0; return JSON.parse(JSON.stringify(doc)); }, d));
    const r = await page.evaluate(p => { const a = printToCircuit(p).data; return [a.notes, a.parts.find(x => x[0] === 'coil')[6], JSON.stringify(a.fl), a.wo, a.parts.filter(x => x[0] === 'lamp').map(x => x[6]).join()]; }, print);
    if (r[1] !== '7030A0') out.push('coil colour: ' + r[1]);
    if (!r[2] || !/open/.test(r[2])) out.push('fault: ' + r[2]);
    if (r[3] !== 'Lights stay dark') out.push('work order: ' + r[3]);
    if (!/0070C0/.test(r[4]) || /FF0032/.test(r[4])) out.push('lights: ' + r[4]);
    return out;
  });

  // (Dallas, 19 Nov 2026: the transfer tests. Prints edited in Print Builder, by its own moves, come back joined exactly as before, with
  // their letters; a print drawn closer than Circuit Builder's parts allow comes back spread out, nothing on top of anything)
  const TRANSFER = ['T1_Every_Control_Part', 'T2_Branches_and_Seal-ins', 'T6_Uneven_Placement'].map(n => [n, JSON.parse(require('fs').readFileSync(path.join(__dirname, 'fixtures', 'transfer', n + '.json'), 'utf8'))]);
  await check('O³ link (Dallas, 19 Nov 2026): a print edited in Print Builder comes back joined just as the print joins it, letters kept, no part on another, no wire through a part', async page => {
    const out = [];
    await page.evaluate(NETSIG.replace("a[0] + '@' + a[1] + ',' + a[2] + '#' + i", "a[0] + ':' + a[3] + ':' + (a[4] ? 1 : 0) + '#' + i").replace('const netSig =', 'const netSigL =') + 'window.netSigL = netSigL;');
    const circs = TRANSFER.concat(await page.evaluate(() => ['seal', 'abc', 'traffic', 'stress', 'three'].map(n => { loadPreset(n); return [n, circuitData()]; })));
    const edits = await withPB(page, pb => pb.evaluate(cs => { const out = [];
      const remap = (d, fy, fx = x => x) => { for (const s of d.sheets) { for (const p of s.parts) { if (p.t === 'rail') { p.x = fx(p.x); p.y0 = fy(p.y0); p.y1 = fy(p.y1); } else { p.x = fx(p.x); p.y = fy(p.y); } }
        for (const w of s.wires) { for (const e of [w.a, w.b]) if (e.r != null && e.y != null) e.y = fy(e.y); w.pts = (w.pts || []).map(q => [fx(q[0]), fy(q[1])]); } for (const n of s.nodes) { n.x = fx(n.x); n.y = fy(n.y); } } return d; };
      for (const [n, d] of cs) {
        const base = circuitToPrint(d, { uid, defaultTB, long: 'tight' }).doc;
        // (1) each contact and pushbutton moved two squares right on its own, as a drag does (its wires bend to follow)
        const movable = base.sheets[0].parts.filter(p => /^(con_|tc_|pb_|pbm_)/.test(p.t)).slice(0, 4);
        // (only to where the print stays clean: no junction, wire bend or other part inside the moved part's own span)
        const clean = p => { const ts = linkPbTerms(p), lo = Math.min(...ts.map(q => q[0])), hi = Math.max(...ts.map(q => q[0])), y = p.y;
          if (S.nodes.some(nd => nd.y === y && nd.x > lo - 20 && nd.x < hi + 20)) return false;
          if (S.parts.some(q => q !== p && q.t !== 'rail' && linkPbTerms(q).some(t => t[1] === y && t[0] > lo - 20 && t[0] < hi + 20))) return false;
          if (S.wires.some(w => (w.pts || []).some(q => q[1] === y && q[0] > lo - 20 && q[0] < hi + 20))) return false;
          if (S.wires.some(w => { const P = [linkPbPos(S, w.a), ...(w.pts || []), linkPbPos(S, w.b)]; return P.some((q, i) => i && q[1] === y && P[i - 1][1] === y && Math.min(q[0], P[i - 1][0]) < hi - 1 && Math.max(q[0], P[i - 1][0]) > lo + 1); })) return false;
          // (and no wire running straight over a junction it doesn't end at: on paper that reads as joined)
          return !S.wires.some(w => { const P = [linkPbPos(S, w.a), ...(w.pts || []), linkPbPos(S, w.b)]; return S.nodes.some(nd => w.a.n !== nd.id && w.b.n !== nd.id && P.some((q, i) => i && (q[0] === P[i - 1][0] ? nd.x === q[0] && nd.y > Math.min(q[1], P[i - 1][1]) && nd.y < Math.max(q[1], P[i - 1][1]) : nd.y === q[1] && nd.x > Math.min(q[0], P[i - 1][0]) && nd.x < Math.max(q[0], P[i - 1][0])))); }); };
        for (const p0 of movable) for (const dx of [80, -80, 160, -160]) { loadDoc(JSON.parse(JSON.stringify(base))); moveItems(S, new Set([p0.id]), dx, 0); tidy(S);
          if (!clean(S.parts.find(q => q.id === p0.id))) continue; out.push([n, 'moved ' + p0.tag + ' by ' + dx, JSON.parse(JSON.stringify(doc)), null]); break; }
        // (2) the whole print drawn closer down, to 3/4 of its height (a clean print: rungs 120 apart)
        { const d2 = remap(JSON.parse(JSON.stringify(base)), y => 160 + Math.round((y - 160) * .75 / 20) * 20); out.push([n, 'drawn closer down', d2, null]); }
        // (3) everything nudged two squares right
        out.push([n, 'all nudged', remap(JSON.parse(JSON.stringify(base)), y => y, x => x + 40), null]);
        // (4) a coil renamed (and its contacts with it): its letter in the circuit follows
        { const d4 = JSON.parse(JSON.stringify(base)), c = d4.sheets.flatMap(s => s.parts).find(p => p.t === 'coil');
          if (c) { const old = c.tag, nu = old === 'Q' ? 'R' : 'Q'; for (const s of d4.sheets) for (const p of s.parts) if (p.tag === old && (p.t === 'coil' || /^(con|tc)_/.test(p.t))) p.tag = nu; out.push([n, 'coil ' + old + ' renamed ' + nu, d4, [old, nu]]); } }
      }
      return out; }, circs));
    for (const [n, what, print, ren] of edits) {
      const d = circs.find(c => c[0] === n)[1];
      const r = await page.evaluate(([print, d, ren]) => { const b = printToCircuit(print), c = linkCheck(print, { data: b.data, map: [] });
        let want = netSigL(d); if (ren) want = netSigL({ ...d, parts: d.parts.map(a => (a[0] === 'coil' || a[0] === 'con') && a[3] === ren[0] ? [a[0], a[1], a[2], ren[1], ...a.slice(4)] : a) });
        const lettersIn = new Set(d.parts.filter(a => ['btn', 'coil', 'sel', 'est'].includes(a[0])).map(a => a[3]));
        const lettersOut = b.data.parts.filter(a => ['btn', 'coil', 'sel', 'est'].includes(a[0])).map(a => a[3]).filter(l => !lettersIn.has(l) && !(ren && l === ren[1]));
        const labels = b.data.parts.filter((a, i) => ['btn', 'coil'].includes(a[0]) && typeof a[9] === 'string' && a[9] && !d.parts.some(q => q[0] === a[0] && q[3] === (ren && a[3] === ren[1] ? ren[0] : a[3]) && q[9] === a[9])).length;
        return [netSigL(b.data) === want, c.over, c.thru, lettersOut.join(','), labels, /Drawn again/.test(b.notes.changed.join()) ? 'drawn again' : 'kept places']; }, [print, d, ren]);
      if (process.env.SHOW) console.log('      . ' + n + ' | ' + what + ' | ' + r[5]);
      if (!r[0]) out.push(n + ', ' + what + ': not joined as the print joins it');
      if (r[1]) out.push(n + ', ' + what + ': ' + r[1] + ' parts on top of others');
      if (r[2]) out.push(n + ', ' + what + ': ' + r[2] + ' wires through a part');
      if (r[3]) out.push(n + ', ' + what + ': letters changed (new: ' + r[3] + ')');
      if (r[4]) out.push(n + ', ' + what + ': ' + r[4] + ' labels added to caps');
    }
    return out;
  });

  await check('O³ link: Open takes a print file from Print Builder (with a note of what changed); Open in Print Builder in the Save box hands the circuit over in a new tab; a page opened for a print builds it', async page => {
    const out = [];
    const print = await withPB(page, pb => pb.evaluate(() => { const d = template('starter'); d.sheets[0].parts.push({ id: 'pz', t: 'prs_no', x: 3000, y: 3000, rot: 0, tag: 'PRS1', desc: '' }); return d; }));
    await page.evaluate(async d => { await openFile(new File([JSON.stringify(d)], 'Motor Starter.o3print.json')); }, print);
    const r = await page.evaluate(() => [document.getElementById('link-dlg').open, document.getElementById('link-body').textContent, circuitName, parts.some(p => p.t === 'stand' && p.sym === 'prs_no')]);
    if (!r[0]) out.push('no arrival note');
    if (!/PRS1: a stand-in in Circuit Builder/.test(r[1])) out.push('note: ' + r[1]);
    if (r[2] !== 'Motor Starter' && r[2] !== 'Basic Motor Starter') out.push('name: ' + r[2]);
    if (!r[3]) out.push('the proximity switch did not come in as a stand-in (Dallas, 19 Nov 2026)');
    await page.evaluate(() => document.getElementById('link-dlg').close());
    // the Save box: Open in Print Builder (the new tab stubbed: just where it goes and what is handed over)
    const h = await page.evaluate(() => { let url = null; const k0 = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (/from=link/.test(this.href)) url = this.target === '_blank' && this.rel === 'noopener' ? this.getAttribute('href') : 'not a new-tab noopener link: ' + this.href; else k0.call(this); }; document.getElementById('save-more').click(); document.getElementById('save-pb').click(); const s = JSON.parse(localStorage.getItem('o3-link:handoff')); return [url, s && s.kind, s && s.data.parts.length === parts.length, document.getElementById('save-dlg').open]; });
    if (!/print-builder\/(demo\/)?\?from=link$/.test(h[0] || '')) out.push('opens: ' + h[0]);
    if (h[1] !== 'circuit' || !h[2]) out.push('handed over: ' + h.slice(1, 3));
    if (h[3]) out.push('the Save box stayed open');
    // a page opened for a print: the print handed over, built, and taken out of storage
    const pg2 = await page.context().newPage(); pg2.on('pageerror', e => page.errors.push(e.message));
    await page.evaluate(d => localStorage.setItem('o3-link:handoff', JSON.stringify({ kind: 'print', t: Date.now(), data: d })), print);
    await pg2.goto(PAGE + '?from=link'); await pg2.waitForTimeout(400);
    const g = await pg2.evaluate(() => [document.getElementById('link-dlg').open, parts.filter(p => p.t === 'mst').length, localStorage.getItem('o3-link:handoff'), location.search]);
    if (!g[0] || g[1] !== 1) out.push('opened for a print: ' + g.slice(0, 2));
    if (g[2]) out.push('the hand-over was left in storage');
    if (g[3]) out.push('the address still says ' + g[3]);
    await pg2.close();
    return out;
  });

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
})();
