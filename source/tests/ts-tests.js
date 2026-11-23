/* Automatic checks for the Fault Finder (once called the Troubleshooter: the Circuit Builder built with build.py --ts).

   Run after every change:   node tests/ts-tests.js [--demo]        (build first: python3 build.py --ts [--demo])

   Each check opens the built page (dist/fault-finder/index.html, or its demo) in a headless browser, as the
   Circuit Builder's checks do (tests/run-tests.js). */
const path = require('path');
const BUILD_S2 = String.raw`(opt) => { sel = null; loadPreset('blank'); VSYS = '208'; PH_COL = [...VSYS_LIST['208'].col]; W = 1800;
      for (const [L, x] of [['1', 120], ['2', 220]]) parts.push(newPart('ph-' + L, x, 80));
      const t1 = newPart('xfm', 500, 300); if (opt.pr) t1.pr = opt.pr; if (opt.ug) t1.ug = true; parts.push(t1);
      const t2 = newPart('xfm', 1100, 300); t2.ct = true; t2.L = '2'; parts.push(t2);
      wires.push(Wr(120, 120, 120, 160), Wr(120, 160, 1040, 160), Wr(440, 160, 440, 220), Wr(1040, 160, 1040, 220), Wr(220, 120, 220, 190), Wr(220, 190, 1160, 190), Wr(560, 190, 560, 220), Wr(1160, 190, 1160, 220));
      wires.push(Wr(440, 380, 440, 600), Wr(560, 380, 560, 520));
      parts.push(P('coil', 500, 600, { L: 'X', color: '#FFDC00' })); wires.push(Wr(560, 520, 600, 520), Wr(600, 520, 600, 600), Wr(560, 600, 600, 600));
      wires.push(Wr(1040, 380, 1040, 700), Wr(1100, 380, 1100, 420), Wr(1100, 420, 1500, 420), Wr(1500, 420, 1500, 600), Wr(1160, 380, 1160, 400), Wr(1160, 400, 1600, 400), Wr(1600, 400, 1600, 700));
      parts.push(P('lamp', 1270, 560, { L: '', color: '#FFDC00' })); wires.push(Wr(1040, 560, 1210, 560), Wr(1330, 560, 1500, 560));
      parts.push(P('htr', 1320, 700, { L: '1' })); wires.push(Wr(1040, 700, 1260, 700), Wr(1380, 700, 1600, 700));
      parts.push(newPart('gnd', 300, 800)); if (opt.wired) { parts.push(newPart('gnd', 680, 560)); wires.push(Wr(600, 520, 680, 520)); }
      normalize(); }`;
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const DEMO = process.argv.includes('--demo');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'dist', 'fault-finder', ...(DEMO ? ['demo'] : []), 'index.html');
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

  await check('The page: Fault Finder title, coral icons and app manifest (demo: DEMO corner), Run only (no Build, no parts, no Faults tab), faults live, no fault badges, its own storage', async page => {
    const out = [];
    const st = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, title: document.title, editing, ts: TS_MODE, faults: faultsLive(), badges: document.querySelectorAll('#svg .fault-badge, #svg [data-fault]').length,
      build: getComputedStyle(document.querySelector('.modeseg')).display, home: getComputedStyle(document.getElementById('rt-home')).display, faultsTab: getComputedStyle(document.getElementById('rt-faults')).display,
      tsbar: !document.getElementById('tsbar').hidden, coral: getComputedStyle(document.querySelector('h1 span')).color, keys: Object.keys(localStorage) }));
    if (!/Order of Operations: Fault Finder/.test(st.h1) || /Troubleshooter/.test(st.h1 + st.title)) out.push('h1: ' + st.h1);
    if (DEMO !== /DEMO/.test(st.h1)) out.push('demo badge: ' + st.h1);
    if (DEMO !== /\(Demo\)/.test(st.title)) out.push('title: ' + st.title);
    if (st.editing || !st.ts || !st.faults) out.push(`editing ${st.editing}, TS_MODE ${st.ts}, faults live ${st.faults}`);
    if (st.build !== 'none' || st.home !== 'none' || st.faultsTab !== 'none') out.push(`Build ${st.build}, Home ${st.home}, Faults ${st.faultsTab}`);
    if (!st.tsbar) out.push('the Troubleshoot tab is not showing');
    if (st.coral !== 'rgb(255, 111, 89)') out.push('title colour ' + st.coral);
    const want = DEMO ? 'oo-troubleshooter-demo:' : 'oo-troubleshooter:';
    for (const k of st.keys) if (!k.startsWith(want)) out.push('storage key ' + k);
    if (!st.keys.length) out.push('nothing kept in the browser');
    // its own icons (coral, FAULTS; the demo's with the green DEMO corner) and its own app manifest, next to the page
    const dir = path.dirname(PAGE.replace('file://', '')), pre = DEMO ? 'tsd-' : 'ts-';
    for (const f of ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png', 'icon.svg']) if (!fs.existsSync(path.join(dir, 'icons', pre + f))) out.push('missing icon ' + pre + f);
    let man = {}; try { man = JSON.parse(fs.readFileSync(path.join(dir, 'fault-finder.webmanifest'), 'utf8')); } catch (e) { out.push('no manifest'); }
    if (man.start_url !== './' || man.scope !== './' || man.id !== './?app=fault-finder' + (DEMO ? '-demo' : '')) out.push('install address: ' + [man.id, man.start_url, man.scope]);
    if (man.short_name !== (DEMO ? 'Fault Finder Demo' : 'Fault Finder') || !/^Order of Operations: Fault Finder/.test(man.name) || !(man.icons || []).every(i => fs.existsSync(path.join(dir, i.src.split('?')[0])))) out.push('manifest: ' + JSON.stringify(man).slice(0, 200));
    const svgI = fs.readFileSync(path.join(dir, 'icons', pre + 'icon.svg'), 'utf8');
    if (!/#FF6F59/.test(svgI) || /#FFC000/.test(svgI) || DEMO !== /#9BE03A/.test(svgI)) out.push('icon colours');
    const head = await page.evaluate(() => ({ man: document.querySelector('link[rel=manifest]').getAttribute('href'), apple: document.querySelector('link[rel=apple-touch-icon]').getAttribute('href'), fav: document.querySelector('link[rel=icon]').href, about: document.getElementById('about-title').textContent, logo: document.querySelector('.titlebar .logo').innerHTML }));
    if (!/fault-finder\.webmanifest/.test(head.man) || !head.apple.includes(pre + 'apple-touch-icon') || !/FF6F59/.test(decodeURIComponent(head.fav))) out.push('page head: ' + JSON.stringify({ ...head, fav: '', logo: '' }));
    if (head.about !== 'Order of Operations: Fault Finder' || !/FF6F59/.test(head.logo)) out.push('About title or title-bar logo');
    // every group's buttons centred across and down the group (both tabs)
    const off = await page.evaluate(() => { const out = [];
      for (const id of ['tsbar', 'runbar']) { const bar = document.getElementById(id), was = bar.hidden; bar.hidden = false;
        for (const g of bar.querySelectorAll(':scope > .ts-g')) { if (g.hidden) continue; const c = g.querySelector('.ts-ctl'), gr = c.getBoundingClientRect();
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const k of c.children) { const r = k.getBoundingClientRect(); if (!r.width) continue; x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right); y0 = Math.min(y0, r.top); y1 = Math.max(y1, r.bottom); }
          if (Math.abs((x0 + x1) / 2 - (gr.left + gr.right) / 2) > 1.5 || Math.abs((y0 + y1) / 2 - (gr.top + gr.bottom) / 2) > 1.5) out.push(id + ': ' + g.querySelector('.label').textContent); }
        bar.hidden = was; }
      return out; });
    if (off.length) out.push('buttons not centred in: ' + off.join(', '));
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

  await check('Leads: a click puts the picked lead on a terminal (red, then black; Red / Black on the meter pick one); probes can be dragged on and off; they lie over the meter; a click on a button still presses it; Click to Hold holds it', async page => {
    const out = [];
    await clickTerm(page, L1); await clickTerm(page, L2);
    let st = await page.evaluate(() => [TSM.red && TSM.red.label, TSM.black && TSM.black.label, TSM.next]);
    if (st.join('|') !== `${L1}|${L2}|black`) out.push('after two clicks: ' + st);
    // with both on, the picked lead stays picked: the black moves again; Red on the meter, and the red moves
    await clickTerm(page, C2);
    st = await page.evaluate(() => [TSM.red && TSM.red.label, TSM.black && TSM.black.label]);
    if (st.join('|') !== `${L1}|${C2}`) out.push('third click: ' + st);
    await page.click('.tsm-pick [data-lead="red"]'); await clickTerm(page, C1);
    st = await page.evaluate(() => [TSM.red && TSM.red.label, TSM.black && TSM.black.label]);
    if (st.join('|') !== `${C1}|${C2}`) out.push('red picked, then a click: ' + st);
    // a probe dragged onto a terminal goes there; dropped off any terminal, it goes back beside the meter
    const probe = async c => { await page.waitForTimeout(100); const r = await page.locator(`#ts-plugs .ts-probe[data-lead="${c}"] rect`).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
    const to = await page.evaluate(l => { const q = TS_POINTS.find(q => q.label === l); const r = document.getElementById('stage').getBoundingClientRect(), p = tsScreen(q.x, q.y); return [p[0] + r.left, p[1] + r.top]; }, L2);
    let pb = await probe('black'); await page.mouse.move(...pb); await page.mouse.down(); await page.mouse.move(pb[0] + 40, pb[1] + 40, { steps: 3 }); await page.mouse.move(...to, { steps: 6 }); await page.mouse.up();
    st = await page.evaluate(() => [TSM.red && TSM.red.label, TSM.black && TSM.black.label]);
    if (st.join('|') !== `${C1}|${L2}`) out.push('black dragged to L2: ' + st);
    pb = await probe('red'); await page.mouse.move(...pb); await page.mouse.down(); await page.mouse.move(pb[0] + 30, pb[1] + 90, { steps: 6 }); await page.mouse.up();
    if (await page.evaluate(() => TSM.red)) out.push('red dropped off a terminal is still on one');
    // the leads lie over the meter
    const z = await page.evaluate(() => [getComputedStyle(document.getElementById('ts-plugs')).zIndex, getComputedStyle(document.getElementById('ts-meter')).zIndex].map(Number));
    if (!(z[0] > z[1])) out.push('leads under the meter: ' + z);
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
    if ((await page.evaluate(() => document.getElementById('ts-plugs').querySelectorAll('circle[r="7.5"]').length)) !== 2) out.push('the leads are not plugged into both jacks');
    await page.click('#ts-leads-off');
    if (await page.evaluate(() => TSM.red || TSM.black)) out.push('Remove Leads left a lead on');
    return out;
  });

  await check('Lock Out: required for the ohmmeter, continuity and Push In; dead after; coil reads OL, light 2.4 kΩ; X pushed in closes its contact; STOP beeps; taking it off lets X go and powers up again', async page => {
    const out = [];
    await page.click('[data-meter="ohm"]');
    if (await page.evaluate(() => TSM.mode) !== 'v') out.push('ohmmeter allowed on a live circuit');
    await page.click('#ts-lock'); await page.waitForTimeout(300);
    if (!(await page.evaluate(() => LOCKOUT && document.body.classList.contains('ts-locked')))) out.push('not locked out');
    if (await volts(page, L1, L2) !== 0) out.push('L1 to L2 locked out: ' + await volts(page, L1, L2));
    await page.click('[data-meter="ohm"]');
    if (await page.evaluate(() => TSM.mode) !== 'ohm') out.push('ohmmeter not on once locked out');
    if (await ohms(page, C1, C2) !== 'OL') out.push('across the open coil: ' + await ohms(page, C1, C2));
    if (await ohms(page, 'Pilot Light, left (rung 3)', 'Pilot Light, right (rung 3)') !== 2400) out.push('across the light: ' + await ohms(page, 'Pilot Light, left (rung 3)', 'Pilot Light, right (rung 3)'));
    if (await ohms(page, 'A Button (NO), left (rung 1)', 'A Button (NO), right (rung 1)') !== 'OL') out.push('across the open START: ' + await ohms(page, 'A Button (NO), left (rung 1)', 'A Button (NO), right (rung 1)'));
    // Push In (only locked out): X pushed in by hand closes its NO contacts, so continuity across one beeps
    const XC = ['X Contact (NO), left (rung 3)', 'X Contact (NO), right (rung 3)'];
    if (await ohms(page, ...XC) !== 'OL') out.push('X contact before Push In: ' + await ohms(page, ...XC));
    await page.click('#ts-push');
    const xy = await page.evaluate(() => { const q = parts.find(q => q.t === 'coil'), r = document.getElementById('stage').getBoundingClientRect(), s = tsScreen(q.x, q.y); return [s[0] + r.left, s[1] + r.top]; });
    await page.evaluate(() => setSpeed(300)); await page.mouse.click(...xy); await page.waitForTimeout(500);
    if (await ohms(page, ...XC) !== 0) out.push('X contact pushed in: ' + await ohms(page, ...XC));
    if ((await page.evaluate(() => document.getElementById('ts-leads').innerHTML.split('FORCED ON').length - 1)) !== 3) out.push('PUSHED IN tags on the coil and its two contacts');
    await page.mouse.click(...xy); await page.waitForTimeout(400);
    if (await ohms(page, ...XC) !== 'OL') out.push('X contact let go: ' + await ohms(page, ...XC));
    await page.mouse.click(...xy); await page.click('#ts-push');
    await page.click('[data-meter="cont"]');
    await page.click('.tsm-pick [data-lead="red"]'); await clickTerm(page, 'D Button (NC), left (rung 1)');
    await page.click('.tsm-pick [data-lead="black"]'); await clickTerm(page, 'D Button (NC), right (rung 1)'); await page.waitForTimeout(400);
    const rd = await page.evaluate(() => TSM.rd);
    if (!rd || !rd.beep || rd.text !== '0.0') out.push('continuity across STOP: ' + JSON.stringify(rd));
    await page.click('#ts-lock'); await page.waitForTimeout(300);
    if (await page.evaluate(() => LOCKOUT || TSM.mode !== 'v')) out.push('after taking the lock off: ' + await page.evaluate(() => [LOCKOUT, TSM.mode]));
    if (await page.evaluate(() => Object.keys(TS_PUSHED).length || parts.some(p => p.t === 'con' && closed(p)))) out.push('X still pushed in after taking the lock off');
    await page.click('#ts-push');
    if (await page.evaluate(() => TSM.push)) out.push('Push In allowed with the power on');
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
    // a long test log scrolls in its box: the panel keeps its height (filling the window), the page never grows
    const h0 = await page.evaluate(() => document.getElementById('stage').offsetHeight);
    await page.evaluate(() => { for (let i = 0; i < 60; i++) TS.log.push({ ...TS.log[0] }); tsShowLog(true); fit(false); });
    await page.waitForTimeout(200);
    const lay = await page.evaluate(() => ({ h: document.getElementById('stage').offsetHeight, side: document.getElementById('ts-side').offsetHeight, over: document.documentElement.scrollHeight - document.documentElement.clientHeight }));
    if (lay.h < h0 - 2 || lay.over > 0 || Math.abs(lay.side - lay.h) > 2) out.push('long log: ' + JSON.stringify({ ...lay, h0 }));
    if (h0 < 600) out.push('panel only ' + h0 + ' px tall in a 950 px window');
    await page.evaluate(() => { TS.log.length = 1; tsShowLog(); });
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

  await check('Voltage systems (Dallas, 22 Nov 2026): the meter reads 208Y/120 (120 V phase to neutral, 208 V between phases) and 120/240 split-phase (120 V each leg to neutral, 240 V across the legs), at the boxes and across a light from L1 to N', async page => {
    const out = [];
    for (const [vs, want] of [['208', [207.8, 120, 120, 120]], ['240', [240, 120, 120, 120]], ['480', [480, 277.1, 277.1, 277.1]]]) {
      const r = await page.evaluate(vs => { sel = null; loadPreset('blank'); VSYS = vs; PH_COL = [...VSYS_LIST[vs].col]; POWER = 'boxes'; W = 1300;
        for (const [L, y] of [['1', 140], ['2', 300], ['N', 460]]) parts.push(newPart('ph-' + L, 80, y));
        parts.push(P('lamp', 600, 140, { L: '', color: '#FFDC00' }));
        wires.push(Wr(120, 140, 540, 140), Wr(660, 140, 900, 140), Wr(900, 140, 900, 460), Wr(120, 460, 900, 460), Wr(120, 300, 300, 300));
        normalize(); const c = readCircuit(JSON.parse(JSON.stringify(circuitData()))); tsUse(c, '', true); setSpeed(300);
        const lamp = parts.find(p => p.t === 'lamp'), r1 = x => Math.round(x * 10) / 10;
        return [r1(tsVolts(NET.PH['1'], NET.PH['2'])), r1(tsVolts(NET.PH['1'], NET.PH['N'])), r1(tsVolts(NET.PH['2'], NET.PH['N'])), r1(tsVolts(lamp._a, lamp._b))]; }, vs);
      if (r.join() !== want.join()) out.push(vs + ': ' + r.join() + ' (want ' + want.join() + ')');
    }
    return out;
  });
  await check('Transformers and ground (Dallas, 22 Nov 2026): a 208 V primary gives 120 V, or 52 V rated 480 V; its grounded X2 reads 120 V from X1 to ground, and floating (not grounded) 0 V, unless a Ground part is wired to it; a center-tapped one gives 120 V from X1 or X2 to X0 and 240 V across', async page => {
    const out = [];
    for (const [opt, want] of [[{}, '207.8 120 120 | 120 120 240 120'], [{ pr: '480' }, '207.8 52 52 | 120 120 240 120'], [{ ug: true }, '207.8 120 0 | 120 120 240 120'], [{ ug: true, wired: true }, '207.8 120 120 | 120 120 240 120']]) {
      const r = await page.evaluate(([b, opt]) => { eval('(' + b + ')')(opt); const c = readCircuit(JSON.parse(JSON.stringify(circuitData()))); tsUse(c, '', true); setSpeed(300); return 1; }, [BUILD_S2, opt]);
      await page.waitForTimeout(900);
      const got = await page.evaluate(() => { const [t1, t2] = parts.filter(q => q.t === 'xfm'), gd = NET.GND[0], r1 = x => Math.round(x * 10) / 10;
        return [r1(tsVolts(t1._a, t1._b)), r1(tsVolts(t1._t[2], t1._t[3])), r1(tsVolts(t1._t[2], gd))].join(' ') + ' | ' + [r1(tsVolts(t2._t[2], t2._t[4])), r1(tsVolts(t2._t[3], t2._t[4])), r1(tsVolts(t2._t[2], t2._t[3])), r1(tsVolts(t2._t[2], gd))].join(' '); });
      if (got !== want) out.push(JSON.stringify(opt) + ': ' + got + ' (want ' + want + ')');
    }
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
    // no current shown through the transformer's windings or the fuses either
    const shownCur = await page.evaluate(() => { const out = [];
      for (const p of parts) { const v = view.parts.get(p.id); if (!v) continue;
        if (p.t === 'xfm') for (const W of [v.pri, v.sec]) for (const ln of [W.cur, W.old]) { const c = ln.getAttribute('stroke'); if (c && c !== 'transparent') out.push('T1 winding ' + c); }
        if (p.t === 'fu1') for (const L of [v.cur, v.old]) { const c = L.g.getAttribute('fill'); if (c && c !== 'transparent') out.push('fuse ' + c); } }
      return out; });
    if (shownCur.length) out.push('current shown: ' + shownCur.join(', '));
    await page.click('#ts-lock'); await page.waitForTimeout(300);
    if (!(await page.evaluate(() => parts.filter(p => p.t === 'dsc').every(p => DSC[p.id])))) out.push('a disconnect left closed');
    if (await volts(page, A, B) !== 480) out.push('line side, locked out: ' + await volts(page, A, B));
    if (await volts(page, a, c) !== 0) out.push('load side, locked out: ' + await volts(page, a, c));
    if (await volts(page, 'T1 Control Transformer, X1', 'T1 Control Transformer, X2') !== 0) out.push('X1 to X2 locked out');
    if (await ohms(page, 'T1 Control Transformer, X1', 'T1 Control Transformer, X2') !== 0.5) out.push('secondary winding: ' + await ohms(page, 'T1 Control Transformer, X1', 'T1 Control Transformer, X2'));
    // the disconnect cannot be closed while locked out
    await page.evaluate(() => workPower(parts.find(p => p.t === 'dsc')));
    if (!(await page.evaluate(() => parts.filter(p => p.t === 'dsc').every(p => DSC[p.id])))) out.push('the locked-out disconnect closed');
    return out;
  });

  await check('Resistances are reasonable and the readings obey Ohm\'s law: relay coil 2.5 kΩ, starter coil 240 Ω, light 2.4 kΩ; a coil and a light in series share 120 V as their resistances do', async page => {
    const out = [];
    const r = await page.evaluate(() => { loadPreset('blank');
      parts.push(P('btn', 200, 120, { L: 'A', maint: true, color: '#00B050' }), P('coil', 420, 120, { L: 'CR', color: '#FFDC00' }), P('lamp', 640, 120, {}));
      wires.push(Wr(0, 120, 160, 120), Wr(240, 120, 360, 120), Wr(480, 120, 580, 120), Wr(700, 120, W, 120));
      parts.push(P('coil', 420, 300, { L: 'M', color: '#FF0032' }), P('mst', 420, 600, { L: 'M' })); wires.push(Wr(0, 300, 360, 300), Wr(480, 300, W, 300));
      normalize(); const c = readCircuit(JSON.parse(JSON.stringify(circuitData()))); tsUse(c, '', true); setSpeed(300);
      const coil = parts.find(p => p.L === 'CR'), lamp = parts.find(p => p.t === 'lamp'), m = parts.find(p => p.t === 'coil' && p.L === 'M');
      return [LOAD_OHMS(coil), LOAD_OHMS(lamp), LOAD_OHMS(m)]; });
    if (r.join() !== '2500,2400,240') out.push('resistances: ' + r);
    await page.evaluate(() => press('A', true)); await page.waitForTimeout(500);
    const v = await page.evaluate(() => { const coil = parts.find(p => p.L === 'CR'), lamp = parts.find(p => p.t === 'lamp');
      return [tsVolts(coil._a, coil._b), tsVolts(lamp._a, lamp._b), lamp._sh, !!coilOn[coil.id]]; });
    // (I = 120 V / 4.9 kΩ = 24.5 mA: 61.2 V across the coil, 58.8 V across the light; too little to pull the coil in)
    if (Math.abs(v[0] - 61.22) > .05 || Math.abs(v[1] - 58.78) > .05) out.push('series voltages: ' + v.slice(0, 2).map(x => x.toFixed(2)));
    if (Math.abs(v[2] - v[1] / 120) > .005) out.push('the light glows with ' + v[2] + ' of the supply, the meter reads ' + v[1]);
    if (v[3]) out.push('the coil pulled in on half its voltage');
    return out;
  });

  await check('Shortcuts reflect the Fault Finder\'s controls (F1 lists them): 1/2/3 the meter, R/B the leads, T Lock Out, A Push In, 5 Click to Hold, S the six steps', async page => {
    const out = [];
    const st = () => page.evaluate(() => [TSM.mode, TSM.next, LOCKOUT, !!TSM.push, mode, TS.showSteps].join(' '));
    const seq = [['2', 'v red false false click true'], ['t', 'v red true false click true'], ['2', 'ohm red true false click true'], ['b', 'ohm black true false click true'],
      ['a', 'ohm black true true click true'], ['5', 'ohm black true true latch true'], ['s', 'ohm black true true latch false'], ['t', 'v black false false latch false'], ['1', 'v black false false latch false'], ['s', 'v black false false latch true'], ['4', 'v black false false click true']];
    for (const [k, want] of seq) { await page.keyboard.press(k); await page.waitForTimeout(80); const got = await st(); if (got !== want) { out.push(`after ${k}: ${got} (wanted ${want})`); break; } }
    await page.keyboard.press('F1'); await page.waitForTimeout(200);
    const list = await page.evaluate(() => document.getElementById('kb-lists').textContent);
    for (const w of ['Voltmeter', 'Ohmmeter', 'Red lead', 'Lock Out', 'Force On', 'Click to Hold', 'Open Assignment']) if (!list.includes(w)) out.push('F1 list has no ' + w);
    if (/Place another|Nudge|Wire\b/.test(list.replace(/Repair Wire/g, ''))) out.push('F1 still lists the builder\'s keys');
    return out;
  });

  await check('Scenarios: an assignment with several asks which; a random one keeps its number hidden (kept in the saved state); a number given shows; only what the Circuit Builder offers is offered', async page => {
    const out = [];
    const data = await page.evaluate(() => { loadPreset('seal'); parts.find(q => q.t === 'coil').fz = { 0: 'open' }; parts.find(q => q.t === 'btn' && !q.nc).fz = { 1: 'open' };
      SCEN_N = 2; SCEN_WO = ['one', 'two']; scenUse(0); return JSON.stringify(circuitData()); });
    const f = path.join(os.tmpdir(), 'ts-scen-' + Date.now() + '.json'); fs.writeFileSync(f, data);
    await page.setInputFiles('#ts-file', f); await page.waitForTimeout(300);
    if (!(await page.locator('#ts-scen-dlg').isVisible())) out.push('no scenario box');
    await page.fill('#ts-scen-dlg input', '9'); await page.click('.ts-sc-go');
    if (!/1 to 2/.test(await page.evaluate(() => document.querySelector('.ts-sc-msg').textContent))) out.push('no message for 9');
    await page.fill('#ts-scen-dlg input', '2'); await page.click('.ts-sc-go'); await page.waitForTimeout(400);
    let st = await page.evaluate(() => [document.getElementById('ts-name').textContent, WORK_ORDER, parts.filter(q => q.fault).map(q => q.t).join(), JSON.stringify(TS.scen)].join(' | '));
    if (!/Scenario 2 \| two \| btn \| \{"n":1,"of":2,"hidden":false\}/.test(st)) out.push('number 2: ' + st);
    await page.setInputFiles('#ts-file', f); await page.waitForTimeout(300); await page.click('.ts-sc-rand'); await page.waitForTimeout(400);
    st = await page.evaluate(() => [document.getElementById('ts-name').textContent, JSON.stringify(TS.scen), JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /ts-state/.test(k)))).scen.hidden].join(' | '));
    if (!/Scenario hidden \| \{"n":[01],"of":2,"hidden":true\} \| true/.test(st)) out.push('random: ' + st);
    // only a number offered
    const d2 = JSON.parse(data); d2.ffo = [0, 1]; fs.writeFileSync(f, JSON.stringify(d2));
    await page.setInputFiles('#ts-file', f); await page.waitForTimeout(300);
    if (await page.locator('.ts-sc-rand').isVisible()) out.push('random offered though turned off');
    await page.click('.ts-sc-cancel'); fs.unlinkSync(f);
    return out;
  });

  await check('Force On (was Push In): with the machine locked out, a pressure switch worked by its process value can be forced on by hand, and let go; tagged FORCED ON; not with the power on', async page => {
    const out = [];
    const d = { app: 'order-of-operations-circuit-builder', v: 1, w: 1000, name: 'PS test',
      parts: [['psw', 300, 200, '1', 0, 1, 'FF9C37'], ['coil', 700, 200, 'X', 0, 1, 'FFDC00']],
      wires: [[0, 200, 240, 200], [360, 200, 640, 200], [760, 200, 1000, 200]],
      pv: [['p1', 'Pressure', 'pressure', 'psi', 0, 150, 0]], pl: [[0, 'p1', 80, 75, 'hi']] };
    await page.evaluate(j => tsUse(readCircuit(JSON.parse(j)), '', true), JSON.stringify(d)); await page.waitForTimeout(300);
    const ps = () => page.evaluate(() => closed(parts.find(p => p.t === 'psw')));
    await page.click('#ts-push');
    if (await page.evaluate(() => TSM.push)) out.push('Force On allowed with the power on');
    await page.click('#ts-lock'); await page.waitForTimeout(200); await page.click('#ts-push');
    if (await ps()) out.push('the pressure switch is closed before forcing it');
    const at = await page.evaluate(() => { const p = parts.find(q => q.t === 'psw'); const r = document.querySelector('#svg [data-part="' + p.id + '"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * .75]; });
    await page.mouse.click(...at); await page.waitForTimeout(400);
    if (!await ps()) out.push('forced on, the pressure switch is still open');
    if (!(await page.evaluate(() => document.getElementById('ts-leads').innerHTML.includes('FORCED ON')))) out.push('no FORCED ON tag');
    await page.mouse.click(...at); await page.waitForTimeout(400);
    if (await ps()) out.push('let go, the pressure switch is still closed');
    await page.click('#ts-lock'); await page.waitForTimeout(200);
    if (await page.evaluate(() => Object.keys(TS_PUSHED).length)) out.push('taking the lock off left it forced');
    return out;
  });
  await check('Repairs: Replace Part and Repair Wire only while locked out, each asks first, clears the fault, and is logged (whether it was needed kept for the report); Test the Repair signs off; all kept after a reload', async page => {
    const out = [];
    await page.evaluate(() => { localStorage.clear(); }); await page.reload(); await page.waitForTimeout(900);
    await page.click('#ts-rep');
    if (await page.evaluate(() => TSM.repair)) out.push('Replace Part picked with the power on');
    await page.click('#ts-lock'); await page.waitForTimeout(300); await page.click('#ts-rep');
    const c = await page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); const r = document.querySelector('#svg [data-part="' + p.id + '"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.click(...c); await page.waitForTimeout(150);
    if (!await page.$('#ts-card')) out.push('no card asking before replacing');
    else { await page.click('.ts-card-no'); if (await page.evaluate(() => !parts.find(q => q.t === 'coil').fault)) out.push('Cancel replaced it anyway'); await page.mouse.click(...c); await page.click('.ts-card-go'); }
    await page.waitForTimeout(200);
    if (await page.evaluate(() => !!parts.find(q => q.t === 'coil').fault)) out.push('the coil is still faulty after replacing it');
    if (await page.evaluate(() => parts.find(q => q.t === 'coil').color.toUpperCase() === '#FFDC00')) out.push('the new X coil is the same colour as the old one');
    await page.click('#ts-wire'); const w = await page.evaluate(() => { const m = svg.getScreenCTM(); return [m.a * 560 + m.e, m.d * 420 + m.f]; });
    await page.mouse.click(...w); await page.click('.ts-card-go'); await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ rep: TS.repairs.map(x => [x.k, x.needed]), log: TS.log.map(e => e.v), tags: document.getElementById('ts-leads').innerHTML }));
    if (JSON.stringify(r.rep) !== '[["part",true],["wire",false]]') out.push('repairs kept: ' + JSON.stringify(r.rep));
    if (!r.log.includes('New Part') || !r.log.includes('Spliced')) out.push('log: ' + r.log.join(', '));
    if (!r.tags.includes('>NEW<') || !r.tags.includes('>SPLICED<')) out.push('no NEW tag or spliced sleeve');
    if (await page.evaluate(() => /needed/i.test(document.getElementById('ts-side').textContent))) out.push('the student is told whether a repair was needed');
    await page.click('#ts-lock'); await page.waitForTimeout(300);
    await page.click('#ts-test');
    if (!await page.evaluate(() => document.querySelector('.ts-sg-go').disabled)) out.push('Sign Off allowed before ticking and writing');
    for (const b of await page.$$('#ts-sign-dlg input[type=checkbox]')) await b.check();
    await page.fill('#ts-sign-dlg textarea', 'START runs it; STOP stops it.'); await page.click('.ts-sg-go');
    const so = await page.evaluate(() => TS.signoff);
    if (!so || so.fixed !== true) out.push('sign-off: ' + JSON.stringify(so));
    await page.reload(); await page.waitForTimeout(1200);
    const k = await page.evaluate(() => ({ n: TS.repairs.length, so: !!TS.signoff, f: parts.some(p => p.fault) }));
    if (k.n !== 2 || !k.so || k.f) out.push('after a reload: ' + JSON.stringify(k));
    await page.evaluate(() => { localStorage.clear(); });
    return out;
  });
  await check('Stage 3 (Dallas, 23 Nov 2026): a coil that has burned out reads open on the meter, locked out, stays burned out after a reload, and Replace Part brings it back', async page => {
    const out = [];
    await page.evaluate(() => { localStorage.clear(); }); await page.reload(); await page.waitForTimeout(900);
    await page.click('#ts-lock'); await page.waitForTimeout(300);
    const om = () => page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); return tsOhms(p._a, p._b); });
    await page.evaluate(() => { delete parts.find(q => q.t === 'coil').fault; NET = network(); tsSave(); });
    const before = await om();
    await page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); BLOWN[p.id] = { t: simT }; TS_BLOWN[p.id] = 1; tsSave(); });
    const after = await om();
    if (!(after > before * 50)) out.push('ohms ' + before + ' then ' + after);
    await page.reload(); await page.waitForTimeout(1200);
    const rl = await page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); return [!!TS_BLOWN[p.id], Object.keys(TS_BLOWN).length, !!p.fault].join(); });
    if (rl !== 'true,1,false') out.push('after a reload: ' + rl);
    if (!await page.evaluate(() => LOCKOUT)) await page.click('#ts-lock'), await page.waitForTimeout(300);
    await page.click('#ts-rep');
    const c = await page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); const r = document.querySelector('#svg [data-part="' + p.id + '"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.click(...c); await page.waitForTimeout(150); await page.click('.ts-card-go'); await page.waitForTimeout(200);
    const r = await page.evaluate(() => { const p = parts.find(q => q.t === 'coil'); return [!!BLOWN[p.id], !!TS_BLOWN[p.id], TS.repairs.map(x => x.needed).join()].join(); });
    if (r !== 'false,false,true') out.push('after Replace Part: ' + r);
    if (!(await om() < before * 2)) out.push('still reads open after Replace Part');
    await page.evaluate(() => { localStorage.clear(); });
    return out;
  });
  await check('A whole machine (the drill station, 375 parts): the meter reads volts and ohms at once', async page => {
    const out = [], json = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'drill-station.json'), 'utf8');
    await page.evaluate(j => useCircuit(readCircuit(JSON.parse(j)), ''), json);
    const r = await page.evaluate(() => { if (editing) setMode(true); const c = parts.find(p => p.label === 'CR1');
      let t = performance.now(); const v = tsVolts(c._a, c._b); const tv = performance.now() - t; t = performance.now(); const o = tsOhms(c._a, c._b); return { v, tv, o, to: performance.now() - t }; });
    if (r.tv > 500 || r.to > 500) out.push(`slow: volts ${Math.round(r.tv)} ms, ohms ${Math.round(r.to)} ms`);
    if (!(r.o > 0 && r.o < 2500)) out.push('CR1 ohms ' + r.o + ' (its coil, with the other loads it is joined to)');
    return out;
  });
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} of ${results.length} Fault Finder checks passed.`);
  process.exit(failed.length ? 1 : 0);
})();
