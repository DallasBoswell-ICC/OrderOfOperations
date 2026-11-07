// Print Builder's checks: node tests/run-tests.js (after python3 build.py). Needs Playwright.
const { chromium } = require('playwright');
const PAGE = 'file://' + require('path').resolve(__dirname, '../dist/Print_Builder.html');
let passed = 0, failed = 0;
(async () => {
  const b = await chromium.launch();
  async function check(name, fn) {
    const page = await b.newPage({ viewport: { width: 1600, height: 1000 } }), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(PAGE); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(300);
    let out = [];
    try { out = await fn(page) || []; } catch (e) { out = ['threw: ' + e.message]; }
    out.push(...errs.map(e => 'page error: ' + e));
    if (out.length) { failed++; console.log('FAIL ' + name + '\n  ' + out.join('\n  ')); } else { passed++; console.log('ok   ' + name); }
    await page.close();
  }
  const labels = p => p.evaluate(() => S.wires.map(w => A.label.get(A.wireRoot(S, w))).join(','));

  await check('Motor starter: power L/T numbers, X1, 1 and 2 off the transformer, the rest in reading order', async p => {
    await p.evaluate(() => { loadDoc(template('starter')); refresh(true); });
    const got = await p.evaluate(() => { const by = {}; for (const w of S.wires) { const l = A.label.get(A.wireRoot(S, w)); const P = wirePts(S, w); (by[l] ||= []).push(P[0].join(',')); } return Object.keys(by).sort().join(' '); });
    const want = ['1', '2', '3', '4', '5', '6', '7', 'L1', 'L1A', 'L1B', 'L2', 'L2A', 'L2B', 'L3', 'L3A', 'L3B', 'T1', 'T1A', 'T2', 'T2A', 'T3', 'T3A', 'X1'].sort().join(' ');
    const out = got === want ? [] : ['numbers: ' + got];
    const rung1 = await p.evaluate(() => { const y = 1080; return S.wires.filter(w => wirePts(S, w).every(q => q[1] === y)).sort((a, b) => wirePts(S, a)[0][0] - wirePts(S, b)[0][0]).map(w => A.label.get(A.wireRoot(S, w))).filter((l, i, a) => l !== a[i - 1]).join(' '); });
    if (rung1 !== '1 3 4 5 2') out.push('rung 1 left to right: ' + rung1);
    const x = await p.evaluate(() => JSON.stringify(A.xref.get(S.parts.find(q => q.t === 'coil').id)));
    if (x !== '[{"n":2,"nc":false},{"n":3,"nc":false},{"n":4,"nc":true},{"n":"PWR","nc":false}]') out.push('cross-references: ' + x);
    return out;
  });

  await check('Primary fuses on the transformer, and a control rung moved about, change no control numbers', async p => {
    await p.evaluate(() => { loadDoc(template('starter')); refresh(true); });
    const before = await p.evaluate(() => S.wires.filter(w => /^\d+$/.test(A.label.get(A.wireRoot(S, w)))).map(w => A.label.get(A.wireRoot(S, w))).sort().join(','));
    const r = await p.evaluate(() => {
      // fuses put into both primary leads (H1 and H2), then the stop button moved off its rung and back across another wire
      addPart(S, 'fuse', 860, 560, { rot: 90 }); addPart(S, 'fuse', 980, 560, { rot: 90 });
      const stop = S.parts.find(q => q.t === 'pb_nc'); moveItems(S, new Set([stop.id]), 0, 140); tidy(S); refresh();
      return [S.parts.filter(q => q.t === 'fuse').map(q => q.tag).join(','), S.wires.filter(w => /^\d+$/.test(A.label.get(A.wireRoot(S, w)))).map(w => A.label.get(A.wireRoot(S, w))).sort().join(','),
        S.wires.map(w => A.label.get(A.wireRoot(S, w))).filter(l => /^L[12]C$/.test(l)).length, ISSUES.filter(i => i.sev !== 'ok').map(i => i.title).join('; ')];
    });
    const out = [];
    if (r[0] !== 'FU4,FU5,FU6') out.push('the fuses’ tags (each its own): ' + r[0]);
    if (r[1] !== before) out.push('control numbers changed: ' + before + ' → ' + r[1]);
    if (r[2] < 2) out.push('the primary leads past their fuses are not L1C and L2C');
    if (r[3]) out.push('Check Print found: ' + r[3]);
    return out;
  });

  await check('Tags: fuses, overloads and coils each get the next number; contacts take their coil’s', async p => {
    const t = await p.evaluate(() => { loadDoc(template('blank')); const s = S;
      return ['fuse', 'fuse', 'fus3', 'ol', 'ol3', 'coil', 'con_no', 'coil', 'con_nc', 'pb_no', 'pb_nc', 'pl', 'pl'].map((t, i) => addPart(s, t, 400 + (i % 4) * 300, 400 + Math.floor(i / 4) * 200).tag).join(','); });
    return t === 'FU1,FU2,FU3,OL1,OL2,CR1,CR1,CR2,CR2,PB1,PB2,PL1,PL2' ? [] : ['tags: ' + t];
  });
  await check('Fuses: a block of three is FU1-FU3, then single fuses FU4, FU5, FU6; each fuse labelled on the sheet', async p => {
    const t = await p.evaluate(() => { loadDoc(template('blank')); const f = ['fus3', 'fuse', 'fuse', 'fuse'].map((t, i) => addPart(S, t, 400 + i * 300, 600).tag); refresh(); return [f.join(','), [...svg.querySelectorAll('text')].map(e => e.textContent).filter(x => /^FU\d$/.test(x)).sort().join(','), ISSUES.filter(i => /tagged/.test(i.title)).length]; });
    return t.join('|') === 'FU1,FU4,FU5,FU6|FU1,FU2,FU3,FU4,FU5,FU6|0' ? [] : ['tags | labels | duplicate errors: ' + t.join(' | ')];
  });

  await check('Dropping a symbol on a rung cuts it into the wire; taking it away heals the rung', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); const L1 = S.parts[0], L2 = S.parts[1]; addWire(S, [[L1.x, 400], [L2.x, 400]]);
      const n0 = S.wires.length; const pb = addPart(S, 'pb_no', 600, 400); const n1 = S.wires.length; const c = addPart(S, 'coil', 1200, 400); const n2 = S.wires.length; refresh();
      const lab = S.wires.map(w => A.label.get(A.wireRoot(S, w))).sort().join(',');
      removePart(S, pb.id); removePart(S, c.id); return [n0, n1, n2, S.wires.length, lab, S.nodes.length]; });
    return r.join('|') === '1|2|3|1|1,2,3|0' ? [] : ['wires after: rung, button, coil, both taken away; numbers; nodes = ' + r.join(' | ')];
  });

  await check('Moving a part never joins wires that were not joined (its wires bend to follow)', async p => {
    const r = await p.evaluate(() => { loadDoc(template('starter')); refresh(true);
      const count = () => new Set(S.wires.map(w => A.wireRoot(S, w))).size, n0 = count();
      const ids = S.parts.filter(q => ['pb_nc', 'pb_no', 'pl'].includes(q.t)).map(q => q.id);
      for (const [i, id] of ids.entries()) { moveItems(S, new Set([id]), (i % 2 ? -1 : 1) * 160, 120 * (i + 1)); tidy(S); }
      refresh(); const bad = S.wires.filter(w => { const P = wirePts(S, w); return P.some((q, k) => k < P.length - 1 && q[0] !== P[k + 1][0] && q[1] !== P[k + 1][1]) && !w.b.p?.startsWith?.('x'); }).length;
      return [n0, count(), ISSUES.filter(i => i.sev === 'e').map(i => i.title).join('; '), bad]; });
    const out = [];
    if (r[0] !== r[1]) out.push(`nets ${r[0]} → ${r[1]}`);
    if (r[2]) out.push('errors: ' + r[2]);
    if (r[3] > 3) out.push(r[3] + ' wires with slanting runs (only the motor leads should slant)');
    return out;
  });

  await check('Check Print: same tag twice, a contact with no coil, a rung with no load, a loose wire end, loads in series', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); const L1 = S.parts[0], L2 = S.parts[1];
      addWire(S, [[L1.x, 400], [L2.x, 400]]); addPart(S, 'pb_no', 600, 400, { tag: 'PB1' }); addPart(S, 'pb_nc', 900, 400, { tag: 'PB1' });
      addWire(S, [[L1.x, 600], [L2.x, 600]]); addPart(S, 'con_no', 600, 600, { tag: 'CR9' }); addPart(S, 'pl', 1000, 600); addPart(S, 'sol', 1400, 600);
      addWire(S, [[600, 800], [900, 800]]);
      refresh(); return ISSUES.filter(i => i.sev !== 'ok').map(i => i.title).join(' | '); });
    const out = [];
    for (const want of [/2 devices are tagged PB1/, /Contact CR9 has no coil/, /No load between 1 and 2/, /wire ends without reaching/, /PL1 and SOL1 are in series/]) if (!want.test(r)) out.push('missing ' + want + ' in: ' + r);
    return out;
  });

  await check('Drawing in the window: Rung tool, symbols dragged from the palette, a branch with the Wire tool', async p => {
    await p.click('#new-btn'); await p.click('[data-new="blank"]'); await p.waitForTimeout(100);
    const scr = (x, y) => p.evaluate(([x, y]) => { const m = svg.getScreenCTM(); return [m.a * x + m.e, m.d * y + m.f]; }, [x, y]);
    await p.click('[data-tool="rung"]'); const [rx, ry] = await scr(1000, 400); await p.mouse.move(rx, ry); await p.mouse.click(rx, ry);
    const drop = async (t, x, y) => { const tile = await p.locator(`.pt[data-t="${t}"]`).boundingBox(), [sx, sy] = await scr(x, y);
      await p.mouse.move(tile.x + 20, tile.y + 20); await p.mouse.down(); await p.mouse.move(sx, sy, { steps: 5 }); await p.mouse.up(); };
    await drop('pb_nc', 400, 400); await drop('pb_no', 700, 400); await drop('coil', 1400, 400);
    await p.click('[data-tool="wire"]');
    for (const [x, y] of [[600, 400], [600, 520], [800, 520], [800, 400]]) { const [sx, sy] = await scr(x, y); await p.mouse.move(sx, sy); await p.mouse.click(sx, sy); }
    await drop('con_no', 700, 520);
    const r = await p.evaluate(() => [S.parts.filter(q => q.t !== 'rail').map(q => q.tag).join(','), [...new Set(S.wires.map(w => A.label.get(A.wireRoot(S, w))))].sort().join(','), ISSUES.filter(i => i.sev !== 'ok').length]);
    return r.join('|') === 'PB1,PB2,CR1,CR1|1,2,3,4|0' ? [] : ['tags | numbers | issues: ' + r.join(' | ')];
  });

  await check('Motor: T1, T2, T3 come in level on the grid; selector uses the operator symbol; fused disconnect rings as thin as the rest', async p => {
    const r = await p.evaluate(() => { loadDoc(template('starter')); refresh(true); const m = S.parts.find(q => q.t === 'motor');
      const ts = [0, 1, 2].map(i => termPos(m, i)), ws = [0, 1, 2].map(i => wiresAt(S, { p: m.id, i }).length);
      const level = [0, 1, 2].every(i => { const w = wiresAt(S, { p: m.id, i })[0]; const P = wirePts(S, w); return P.every(q => q[1] === ts[i][1]); });
      const tl = [...new Set(S.wires.filter(w => [w.a, w.b].some(e => e.p === m.id)).map(w => A.label.get(A.wireRoot(S, w))))].sort().join(',');
      return [ts.every(t => t[0] % 20 === 0 && t[1] % 20 === 0), ws.join(''), level, tl, LIB.sel.sym, /r=\\?"3.333\\?"/.test(PSYM['3PH Fusible Disconnect'].b) && !/r=\\?"5\\?" transform=\\?"matrix\(3/.test(PSYM['3PH Fusible Disconnect'].b)]; });
    return r.join('|') === 'true|111|true|T1A,T2A,T3A|Selector Switch Operator|true' ? [] : ['grid | wired | level | numbers | selector | fusible: ' + r.join(' | ')];
  });

  await check('Select: drag from a terminal draws a wire; dragging on the sheet highlights no text', async p => {
    await p.click('#new-btn'); await p.click('[data-new="blank"]'); await p.waitForTimeout(100);
    const scr = (x, y) => p.evaluate(([x, y]) => { const m = svg.getScreenCTM(); return [m.a * x + m.e, m.d * y + m.f]; }, [x, y]);
    await p.evaluate(() => { const L1 = S.parts[0]; addWire(S, [[L1.x, 400], [600, 400]]); addPart(S, 'pb_no', 640, 400); refresh(); });
    const [ax, ay] = await scr(680, 400), [bx, by] = await scr(900, 560);
    await p.mouse.move(ax, ay); await p.mouse.down(); await p.mouse.move(bx, by, { steps: 6 }); await p.mouse.up();
    const r = await p.evaluate(() => { const pb = S.parts.find(q => q.t === 'pb_no'); const w = wiresAt(S, { p: pb.id, i: 1 })[0]; return [tool, !!w, w ? wirePts(S, w).map(q => q.join(',')).join(' ') : '', String(getSelection()).length]; });
    return r.join('|') === 'select|true|680,400 900,400 900,560|0' ? [] : ['tool | wire | points | highlighted: ' + r.join(' | ')];
  });

  await check('Copy and paste: a coil and its contact get a new letter together; a contact copied alone keeps its coil', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); const L1 = S.parts[0], L2 = S.parts[1];
      addWire(S, [[L1.x, 400], [L2.x, 400]]); const c = addPart(S, 'con_no', 500, 400, { tag: 'CR1' }); const k = addPart(S, 'coil', 1000, 400); refresh();
      sel = new Set([c.id, k.id]); copySel(); pasteClip([400, 700]);
      const tags = S.parts.filter(q => q.t !== 'rail').map(q => q.tag).join(',');
      sel = new Set([c.id]); copySel(); pasteClip([400, 900]);
      return [tags, S.parts.filter(q => q.t !== 'rail').map(q => q.tag).join(','), S.wires.length]; });
    return r.join('|') === 'CR1,CR1,CR2,CR2|CR1,CR1,CR2,CR2,CR1|4' ? [] : ['tags after each paste | wires: ' + r.join(' | ')];
  });

  await check('Wire numbers: clear of symbols and tags, once a straight run; one can be moved or hidden', async p => {
    const r = await p.evaluate(() => { loadDoc(template('starter')); refresh(true);
      const boxes = S.parts.filter(q => q.t !== 'rail').map(partBox), over = LABS.filter(L => boxes.some(b => L.x0 < b.x1 && L.x1 > b.x0 && L.y0 < b.y1 && L.y1 > b.y0)).map(L => L.l);
      const w = S.wires.find(w => A.label.get(A.wireRoot(S, w)) === '6'); const L = LABS.find(L => L.id === w.id || runWires(w).some(o => o.id === L.id));
      w.lab = [L.x + 40, L.y - 40]; drawInk(); const moved = LABS.some(L => L.l === '6' && L.x === w.lab[0]);
      for (const o of runWires(w)) o.hideNum = true; drawInk(); const hidden = !LABS.some(L => L.l === '6');
      return [over.join(','), moved, hidden]; });
    return r.join('|') === '|true|true' ? [] : ['over symbols | moved | hidden: ' + r.join(' | ')];
  });

  await check('Title block: boxes added, changed and taken away show on the sheet; saved and opened again', async p => {
    await p.click('#tb-btn'); await p.click('#tb-add'); await p.keyboard.type('Instructor');
    await p.locator('.tbrow[data-i]').last().locator('[data-k=value]').fill('D. Boswell');
    await p.locator('.tbrow[data-i]').first().locator('[data-rm]').click(); await p.click('#tb-done');
    const r = await p.evaluate(() => [document.querySelector('#pagehost .pr-tb').textContent.includes('D. Boswell'), document.querySelector('#pagehost .pr-tb').textContent.includes('Drawing Title'),
      (() => { const j = JSON.stringify(doc); loadDoc(JSON.parse(j)); refresh(true); return document.querySelector('#pagehost .pr-tb').textContent.includes('Instructor'); })()]);
    return r.join() === 'true,false,true' ? [] : ['added shows, removed gone, survives saving: ' + r];
  });

  await check('Printing: every sheet a letter page, the right way round', async p => {
    await p.click('#addsheet-btn'); await p.click('#orient-btn');
    await p.evaluate(() => { window.print = () => {}; printAll(); });
    const r = await p.evaluate(() => [...document.querySelectorAll('#print-host .pr-page')].map(e => e.classList.contains('land') ? 'L' : 'P').join(''));
    const rails = await p.evaluate(() => S.parts.filter(q => q.t === 'rail').every(r => r.y1 <= VB[1]));
    return r === 'PL' && rails ? [] : ['pages: ' + r + ', rails on the paper: ' + rails];
  });

  await b.close();
  console.log(`\n${passed} of ${passed + failed} checks passed.`);
  process.exit(failed ? 1 : 0);
})();
