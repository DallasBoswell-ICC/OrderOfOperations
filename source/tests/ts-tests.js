/* Automatic checks for the Troubleshooter (the Circuit Builder built with build.py --ts).

   Run after every change:   node tests/ts-tests.js [--demo]        (build first: python3 build.py --ts [--demo])

   Each check opens the built page (dist/troubleshooter/index.html, or its demo) in a headless browser, as the
   Circuit Builder's checks do (tests/run-tests.js). */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const DEMO = process.argv.includes('--demo');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'dist', 'troubleshooter', ...(DEMO ? ['demo'] : []), 'index.html');
const results = [];
let browser;

async function openPage(ctx) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(PAGE);
  await page.waitForTimeout(500);
  return page;
}
async function check(name, fn) {
  const t0 = Date.now(); let ctx;
  try {
    ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
    const page = await openPage(ctx);
    const problems = (await fn(page, ctx)) || [];
    if (page.errors.length) problems.push('page errors: ' + page.errors.join('; '));
    results.push({ name, ok: !problems.length, problems, ms: Date.now() - t0 });
  } catch (e) {
    results.push({ name, ok: false, problems: [String(e && e.stack || e)], ms: Date.now() - t0 });
  } finally { if (ctx) await ctx.close(); }
  const r = results[results.length - 1];
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${name}  (${(r.ms / 1000).toFixed(1)} s)`);
  if (!r.ok) for (const p of r.problems.slice(0, 8)) console.log('      - ' + p);
}
// the voltage / resistance between two terminals, by their labels
const volts = (page, a, b) => page.evaluate(([a, b]) => { const A = TS_POINTS.find(q => q.label === a), B = TS_POINTS.find(q => q.label === b); return +tsVolts(A.n, B.n).toFixed(1); }, [a, b]);
const ohms = (page, a, b) => page.evaluate(([a, b]) => { const A = TS_POINTS.find(q => q.label === a), B = TS_POINTS.find(q => q.label === b); const r = tsOhms(A.n, B.n); return isFinite(r) ? +r.toFixed(1) : 'OL'; }, [a, b]);
// a click on a terminal, as a student would (it puts the next lead there)
async function clickTerm(page, label) {
  const s = await page.evaluate(l => { const q = TS_POINTS.find(q => q.label === l); const r = document.getElementById('stage').getBoundingClientRect(), p = tsScreen(q.x, q.y); return [p[0] + r.left, p[1] + r.top]; }, label);
  await page.mouse.click(s[0], s[1]);
}
const shown = page => page.evaluate(() => document.querySelector('.tsm-val').textContent + ' ' + document.querySelector('.tsm-unit').textContent);
const C1 = 'X Coil, left (rung 1)', C2 = 'X Coil, right (rung 1)', L1 = 'L1 bar (rung 1)', L2 = 'L2 bar (rung 1)';

(async () => {
  browser = await chromium.launch();

  await check('The page: Troubleshooter title, Run only (no Build, no parts, no Faults tab), faults live, no fault badges, its own storage', async page => {
    const out = [];
    const st = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, title: document.title, editing, ts: TS_MODE, faults: faultsLive(), badges: document.querySelectorAll('#svg .fault-badge, #svg [data-fault]').length,
      build: getComputedStyle(document.querySelector('.modeseg')).display, home: getComputedStyle(document.getElementById('rt-home')).display, faultsTab: getComputedStyle(document.getElementById('rt-faults')).display,
      tsbar: !document.getElementById('tsbar').hidden, coral: getComputedStyle(document.querySelector('h1 span')).color, keys: Object.keys(localStorage) }));
    if (!/Order of Operations: Troubleshooter/.test(st.h1)) out.push('h1: ' + st.h1);
    if (DEMO !== /DEMO/.test(st.h1)) out.push('demo badge: ' + st.h1);
    if (DEMO !== /\(Demo\)/.test(st.title)) out.push('title: ' + st.title);
    if (st.editing || !st.ts || !st.faults) out.push(`editing ${st.editing}, TS_MODE ${st.ts}, faults live ${st.faults}`);
    if (st.build !== 'none' || st.home !== 'none' || st.faultsTab !== 'none') out.push(`Build ${st.build}, Home ${st.home}, Faults ${st.faultsTab}`);
    if (!st.tsbar) out.push('the Troubleshoot tab is not showing');
    if (st.coral !== 'rgb(255, 111, 89)') out.push('title colour ' + st.coral);
    const want = DEMO ? 'oo-troubleshooter-demo:' : 'oo-troubleshooter:';
    for (const k of st.keys) if (!k.startsWith(want)) out.push('storage key ' + k);
    if (!st.keys.length) out.push('nothing kept in the browser');
    // pressing G (Build / Run) does nothing
    await page.keyboard.press('g'); await page.waitForTimeout(100);
    if (await page.evaluate(() => editing)) out.push('G switched to Build');
    return out;
  });

  await check('The look: no current colours, insulated wires, a terminal block and screw at each end of each part', async page => {
    const out = [];
    await page.evaluate(() => { setSpeed(300); press('A', true); }); await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({ runs: view.runs.reduce((n, r) => n + r.g.childElementCount, 0), jackets: document.querySelectorAll('#svg path[stroke="#2f3236"]').length,
      blocks: document.querySelectorAll('#svg [data-part] > rect[fill="#5d636a"]').length, pts: TS_POINTS.length, parts: parts.filter(tsBlocked).length }));
    if (st.runs) out.push('current painted on the wires: ' + st.runs);
    if (!st.jackets) out.push('no insulation on the wires');
    if (st.blocks !== 2 * st.parts) out.push(`blocks: ${st.blocks} for ${st.parts} parts`);
    if (st.pts !== 2 * st.parts + 4) out.push('terminals the leads can go on: ' + st.pts);
    return out;
  });

  await check('Voltmeter on the sample (X coil open): 120 V across the bars; 120 V across the coil with START held; it never pulls in', async page => {
    const out = [];
    await page.evaluate(() => setSpeed(300));
    if (await volts(page, L1, L2) !== 120) out.push('L1 to L2: ' + await volts(page, L1, L2));
    if (await volts(page, C1, L2) !== 0) out.push('coil to L2, idle: ' + await volts(page, C1, L2));
    if (await volts(page, 'D Button (NC), right (rung 1)', L2) !== 120) out.push('past the closed STOP: ' + await volts(page, 'D Button (NC), right (rung 1)', L2));
    // (across the open START: nothing, as the coil beyond it is open too, so its far side has no way back to L2)
    if (await volts(page, 'A Button (NO), left (rung 1)', 'A Button (NO), right (rung 1)') !== 0) out.push('across the open START: ' + await volts(page, 'A Button (NO), left (rung 1)', 'A Button (NO), right (rung 1)'));
    if (await volts(page, 'X Contact (NO), left (rung 3)', 'X Contact (NO), right (rung 3)') !== 120) out.push('across the open X contact to the light: ' + await volts(page, 'X Contact (NO), left (rung 3)', 'X Contact (NO), right (rung 3)'));
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(500);
    if (await volts(page, C1, C2) !== 120) out.push('across the coil, A held: ' + await volts(page, C1, C2));
    if (await page.evaluate(() => parts.some(p => p.t === 'coil' && coilOn[p.id]))) out.push('the open coil pulled in');
    // the meter shows it, from leads clicked onto the terminals
    await clickTerm(page, C1); await clickTerm(page, C2); await page.waitForTimeout(400);
    if (await shown(page) !== '120.0 V AC') out.push('the meter shows ' + await shown(page));
    return out;
  });

  await check('Leads: a click on a terminal puts the red lead, then the black, then the red again; a click on a button still presses it; Click to Hold holds it', async page => {
    const out = [];
    await clickTerm(page, L1); await clickTerm(page, L2);
    let st = await page.evaluate(() => [TSM.red && TSM.red.label, TSM.black && TSM.black.label, TSM.next]);
    if (st.join('|') !== `${L1}|${L2}|red`) out.push('after two clicks: ' + st);
    await clickTerm(page, C1);
    st = await page.evaluate(() => [TSM.red && TSM.red.label, TSM.black && TSM.black.label]);
    if (st.join('|') !== `${C1}|${L2}`) out.push('third click: ' + st);
    await page.evaluate(() => { document.querySelector('#tsbar [data-tsmode="hold"]').click(); });
    const b = await page.evaluate(() => { const p = parts.find(q => q.t === 'btn' && q.L === 'A'), r = document.getElementById('stage').getBoundingClientRect(), s = tsScreen(p.x, p.y); return [s[0] + r.left, s[1] + r.top]; });
    await page.mouse.move(...b); await page.mouse.down(); await page.waitForTimeout(150);
    if (!(await page.evaluate(() => !!down.A))) out.push('a press on START did not press it');
    await page.mouse.up(); await page.evaluate(() => press('A', false));
    // Click to Hold: a click holds START down (marked HELD DOWN), another lets it go
    await page.click('#tsbar [data-tsmode="latch"]');
    await page.mouse.click(...b); await page.waitForTimeout(300);
    if (!(await page.evaluate(() => !!down.A))) out.push('Click to Hold did not hold START');
    if (!/HELD DOWN/.test(await page.evaluate(() => document.getElementById('ts-leads').innerHTML))) out.push('no HELD DOWN tag');
    await page.mouse.click(...b); await page.waitForTimeout(100);
    if (await page.evaluate(() => !!down.A)) out.push('a second click did not let START go');
    await page.mouse.click(...b); await page.click('#tsbar [data-tsmode="click"]');
    if (await page.evaluate(() => !!down.A || mode !== 'click')) out.push('leaving Click to Hold kept START held');
    await page.click('#ts-leads-off');
    if (await page.evaluate(() => TSM.red || TSM.black)) out.push('Remove Leads left a lead on');
    return out;
  });

  await check('Lock Out: required for the ohmmeter and continuity; dead after; coil reads OL, light 1.2 kΩ, STOP beeps; taking it off powers up again', async page => {
    const out = [];
    await page.click('[data-meter="ohm"]');
    if (await page.evaluate(() => TSM.mode) !== 'v') out.push('ohmmeter allowed on a live circuit');
    await page.click('#ts-lock'); await page.waitForTimeout(300);
    if (!(await page.evaluate(() => LOCKOUT && document.body.classList.contains('ts-locked')))) out.push('not locked out');
    if (await volts(page, L1, L2) !== 0) out.push('L1 to L2 locked out: ' + await volts(page, L1, L2));
    await page.click('[data-meter="ohm"]');
    if (await page.evaluate(() => TSM.mode) !== 'ohm') out.push('ohmmeter not on once locked out');
    if (await ohms(page, C1, C2) !== 'OL') out.push('across the open coil: ' + await ohms(page, C1, C2));
    if (await ohms(page, 'Pilot Light, left (rung 3)', 'Pilot Light, right (rung 3)') !== 1200) out.push('across the light: ' + await ohms(page, 'Pilot Light, left (rung 3)', 'Pilot Light, right (rung 3)'));
    if (await ohms(page, 'A Button (NO), left (rung 1)', 'A Button (NO), right (rung 1)') !== 'OL') out.push('across the open START: ' + await ohms(page, 'A Button (NO), left (rung 1)', 'A Button (NO), right (rung 1)'));
    await page.click('[data-meter="cont"]');
    await clickTerm(page, 'D Button (NC), left (rung 1)'); await clickTerm(page, 'D Button (NC), right (rung 1)'); await page.waitForTimeout(400);
    const rd = await page.evaluate(() => TSM.rd);
    if (!rd || !rd.beep || rd.text !== '0.0') out.push('continuity across STOP: ' + JSON.stringify(rd));
    await page.click('#ts-lock'); await page.waitForTimeout(300);
    if (await page.evaluate(() => LOCKOUT || TSM.mode !== 'v')) out.push('after taking the lock off: ' + await page.evaluate(() => [LOCKOUT, TSM.mode]));
    if (await volts(page, L1, L2) !== 120) out.push('L1 to L2 after: ' + await volts(page, L1, L2));
    return out;
  });

  await check('Test log: a steady reading is kept once, with what was held; it, the steps and the assignment are kept through a reload', async page => {
    const out = [];
    await page.evaluate(() => { setSpeed(300); press('A', true); });
    await clickTerm(page, C1); await clickTerm(page, L2); await page.waitForTimeout(1300);
    let log = await page.evaluate(() => TS.log);
    if (log.length !== 1 || log[0].v !== '120.0 V AC' || log[0].c !== 'A held' || log[0].a !== C1 || log[0].b !== L2) out.push('log: ' + JSON.stringify(log));
    await page.waitForTimeout(900);
    if (await page.evaluate(() => TS.log.length) !== 1) out.push('logged again with nothing changed');
    if (!/Readings: 1/.test(await page.evaluate(() => document.getElementById('ts-foot').textContent))) out.push('footer');
    await page.click('[data-step="0"]'); await page.click('[data-step="1"]');
    await page.reload(); await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({ n: TS.log.length, steps: TS.steps, name: circuitName, items: document.querySelectorAll('#ts-log li:not(.ts-empty)').length, done: document.querySelectorAll('#ts-steps .done').length }));
    if (st.n !== 1 || st.items !== 1) out.push('log after reload: ' + JSON.stringify(st));
    if (st.done !== 2) out.push('steps after reload: ' + JSON.stringify(st.steps));
    if (!/Sample/.test(st.name)) out.push('assignment: ' + st.name);
    // hiding the six steps
    await page.click('#ts-steps-hide');
    if (await page.locator('#ts-steps-box').isVisible()) out.push('steps still showing');
    await page.click('#ts-steps-btn');
    if (!(await page.locator('#ts-steps-box').isVisible())) out.push('steps not back');
    return out;
  });

  await check('Open Assignment: a Circuit Builder file with a fault and a work order; a fresh log; a blown fuse stays blown through a lock out', async page => {
    const out = [];
    // a circuit: fuse FU1 then a shorted coil X across the bars, behind START A
    const data = await page.evaluate(() => { const keep = [parts, wires]; loadPreset('blank');
      parts = [P('fu1', 140, 200, { L: '1' }), P('btn', 340, 200, { L: 'A', color: '#00B050' }), P('coil', 600, 200, { L: 'X', fault: 'short' })];
      wires = [Wr(0, 200, 100, 200), Wr(180, 200, 300, 200), Wr(380, 200, 540, 200), Wr(660, 200, W, 200)]; normalize();
      const d = circuitData(); d.name = 'Fuse Job'; d.wo = 'The fuse keeps blowing.'; [parts, wires] = keep; normalize(); return d; });
    const f = path.join(os.tmpdir(), 'ts-assign-' + Date.now() + '.json'); fs.writeFileSync(f, JSON.stringify(data));
    await page.setInputFiles('#ts-file', f); await page.waitForTimeout(600); fs.unlinkSync(f);
    const st = await page.evaluate(() => ({ name: circuitName, wo: document.getElementById('ts-wo').textContent, log: TS.log.length, fault: parts.find(p => p.t === 'coil').fault }));
    if (st.name !== 'Fuse Job' || !/keeps blowing/.test(st.wo) || st.log || st.fault !== 'short') out.push(JSON.stringify(st));
    await page.evaluate(() => { setSpeed(300); press('A', true); }); await page.waitForTimeout(1500);
    const fu = await page.evaluate(() => { const p = parts.find(q => q.t === 'fu1'); return [!!BLOWN[p.id], !!TS_BLOWN[p.id]]; });
    if (fu.join() !== 'true,true') out.push('the fuse did not blow: ' + fu);
    await page.click('#ts-lock'); await page.waitForTimeout(200); await page.click('#ts-lock'); await page.waitForTimeout(200);
    await page.click('#ts-reset'); await page.waitForTimeout(200);
    if (!(await page.evaluate(() => !!BLOWN[parts.find(q => q.t === 'fu1').id]))) out.push('the fuse came back after lock out and reset');
    // clicking it does not put it back
    await page.evaluate(() => workPower(parts.find(q => q.t === 'fu1')));
    if (!(await page.evaluate(() => !!BLOWN[parts.find(q => q.t === 'fu1').id]))) out.push('a click put the fuse back');
    return out;
  });

  await check('Three-phase (FWD/REV template): 480 V between phases; locked out, the disconnect opens: its line side still 480 V, its load side dead', async page => {
    const out = [];
    await page.evaluate(() => { loadPreset('fwdrev'); const c = readCircuit(JSON.parse(JSON.stringify(circuitData()))); tsUse(c, '', true); setSpeed(300); });
    await page.waitForTimeout(800);
    const A = 'DS1 Disconnect, L1 line side', B = 'DS1 Disconnect, L2 line side', a = 'DS1 Disconnect, L1 load side', c = 'DS1 Disconnect, L3 load side';
    if (await volts(page, A, B) !== 480) out.push('line side: ' + await volts(page, A, B));
    if (await volts(page, a, c) !== 480) out.push('load side: ' + await volts(page, a, c));
    if (await volts(page, 'T1 Control Transformer, X1', 'T1 Control Transformer, X2') !== 120) out.push('X1 to X2: ' + await volts(page, 'T1 Control Transformer, X1', 'T1 Control Transformer, X2'));
    await page.click('#ts-lock'); await page.waitForTimeout(300);
    if (!(await page.evaluate(() => parts.filter(p => p.t === 'dsc').every(p => DSC[p.id])))) out.push('a disconnect left closed');
    if (await volts(page, A, B) !== 480) out.push('line side, locked out: ' + await volts(page, A, B));
    if (await volts(page, a, c) !== 0) out.push('load side, locked out: ' + await volts(page, a, c));
    if (await volts(page, 'T1 Control Transformer, X1', 'T1 Control Transformer, X2') !== 0) out.push('X1 to X2 locked out');
    if (await ohms(page, 'T1 Control Transformer, X1', 'T1 Control Transformer, X2') !== 0.8) out.push('secondary winding: ' + await ohms(page, 'T1 Control Transformer, X1', 'T1 Control Transformer, X2'));
    // the disconnect cannot be closed while locked out
    await page.evaluate(() => workPower(parts.find(p => p.t === 'dsc')));
    if (!(await page.evaluate(() => parts.filter(p => p.t === 'dsc').every(p => DSC[p.id])))) out.push('the locked-out disconnect closed');
    return out;
  });

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} Troubleshooter checks passed.`);
  process.exit(failed.length ? 1 : 0);
})();
