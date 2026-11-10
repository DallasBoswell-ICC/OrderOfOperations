// Print Builder's checks: node tests/run-tests.js (after python3 build.py). Needs Playwright.
const { chromium } = require('playwright');
const PAGE = 'file://' + require('path').resolve(__dirname, process.argv.includes('--demo') ? '../dist/demo/Print_Builder.html' : '../dist/Print_Builder.html');   // (--demo: the demo build)
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
      addWire(S, [[L1.x, 400], [L2.x, 400]]); addPart(S, 'pb_no', 600, 400, { tag: 'PB1' }); addPart(S, 'spst', 900, 400, { tag: 'PB1' });
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
    const drop = async (t, x, y) => { await p.locator(`.pt[data-t="${t}"]`).scrollIntoViewIfNeeded(); const tile = await p.locator(`.pt[data-t="${t}"]`).boundingBox(), [sx, sy] = await scr(x, y);
      await p.mouse.move(tile.x + 20, tile.y + 20); await p.mouse.down(); await p.mouse.move(sx, sy, { steps: 5 }); await p.mouse.up(); };
    await drop('pb_nc', 400, 400); await drop('pb_no', 700, 400); await drop('coil', 1400, 400);
    await p.click('[data-tool="wire"]');
    for (const [x, y] of [[600, 400], [600, 520], [800, 520], [800, 400]]) { const [sx, sy] = await scr(x, y); await p.mouse.move(sx, sy); await p.mouse.click(sx, sy); }
    await drop('con_no', 700, 520);
    const r = await p.evaluate(() => [S.parts.filter(q => q.t !== 'rail').map(q => q.tag).join(','), [...new Set(S.wires.map(w => A.label.get(A.wireRoot(S, w))))].sort().join(','), ISSUES.filter(i => i.sev !== 'ok').length]);
    return r.join('|') === 'PB1,PB2,CR1,CR1|1,2,3,4|0' ? [] : ['tags | numbers | issues: ' + r.join(' | ')];
  });

  await check('Motor: T1, T2, T3 come in level on the grid; selector uses the operator symbol; fused disconnect drawn at the size of a disconnect and a single fuse', async p => {
    const r = await p.evaluate(() => { loadDoc(template('starter')); refresh(true); const m = S.parts.find(q => q.t === 'motor');
      const ts = [0, 1, 2].map(i => termPos(m, i)), ws = [0, 1, 2].map(i => wiresAt(S, { p: m.id, i }).length);
      const level = [0, 1, 2].every(i => { const w = wiresAt(S, { p: m.id, i })[0]; const P = wirePts(S, w); return P.every(q => q[1] === ts[i][1]); });
      const tl = [...new Set(S.wires.filter(w => [w.a, w.b].some(e => e.p === m.id)).map(w => A.label.get(A.wireRoot(S, w))))].sort().join(',');
      return [ts.every(t => t[0] % 20 === 0 && t[1] % 20 === 0), ws.join(''), level, tl, LIB.sel.sym, termsOf('fdsc3').map(q => q[0]).join('/') === '-80/80/-80/80/-80/80' && /width="52" height="20"/.test(PSYM['3PH Fusible Disconnect'].b) && /r="10"/.test(PSYM['3PH Fusible Disconnect'].b)]; });
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

  await check('Rung numbers: left of everything on the rung, even one fed by a wire instead of the L1 rail', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); S.parts = S.parts.filter(q => q.t !== 'rail');
      addWire(S, [[300, 300], [300, 600], [700, 600]]); addPart(S, 'estop', 740, 600); addWire(S, [[780, 600], [1200, 600]]); addPart(S, 'coil', 1240, 600); addWire(S, [[1280, 600], [1600, 600]]); refresh(true);
      const t = [...svg.querySelectorAll('g.ink text')].find(e => +e.getAttribute('y') === 609 && e.getAttribute('text-anchor') === 'end' && e.textContent === '1');
      return t ? +t.getAttribute('x') : null; });
    return r != null && r <= 260 ? [] : ['rung number x (should be left of the wire at 300): ' + r];
  });

  await check('App: the manifest and its icons are next to the page, under their new names', async p => {
    const fs = require('fs'), path = require('path'), dist = path.join(__dirname, '..', 'dist');
    const m = JSON.parse(fs.readFileSync(path.join(dist, 'print-builder.webmanifest'), 'utf8'));
    const missing = m.icons.map(i => i.src).filter(f => !fs.existsSync(path.join(dist, f)));
    const linked = await p.evaluate(() => document.querySelector('link[rel=manifest]').getAttribute('href'));
    return !missing.length && m.icons.every(i => i.src.includes('pb-')) && linked.startsWith('print-builder.webmanifest') ? [] : ['missing: ' + missing + ', linked: ' + linked];
  });

  await check('Fused disconnect: its fuses take FU numbers with the others, each labelled; relay coils as wide as contacts', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); const d = addPart(S, 'fdsc3', 500, 400), f = addPart(S, 'fus3', 900, 400), one = addPart(S, 'fuse', 1200, 400); refresh();
      const lbl = [...svg.querySelectorAll('g.ink text')].map(e => e.textContent).filter(t => /^FU\d$/.test(t)).sort().join(',');
      return [d.tag + ':' + tagsOf(d).slice(1).join('/'), f.tag, one.tag, lbl, termsOf('coil').map(t => t[0]).join('/'), termsOf('con_no').map(t => t[0]).join('/')]; });
    return r.join('|') === 'DS1:FU1/FU2/FU3|FU4|FU7|FU1,FU2,FU3,FU4,FU5,FU6,FU7|-40/40|-40/40' ? [] : ['got: ' + r.join(' | ')];
  });

  await check('Cross-references: right of everything on the coil’s rung, even with no L2 rail', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); S.parts = S.parts.filter(q => q.t !== 'rail');
      addWire(S, [[200, 600], [1600, 600], [1600, 300]]); const c = addPart(S, 'coil', 800, 600, { pre: 'M' }); addPart(S, 'olc', 1100, 600, { tag: 'OL1' });
      addWire(S, [[200, 900], [1000, 900]]); addPart(S, 'con_no', 500, 900, { tag: c.tag }); refresh(true);
      const t = [...svg.querySelectorAll('g.ink text')].find(e => +e.getAttribute('y') === 609 && /^\d/.test(e.textContent) && e.getAttribute('text-anchor') !== 'end' && e.getAttribute('text-anchor') !== 'middle');
      return t ? +t.getAttribute('x') : null; });
    return r != null && r >= 1620 ? [] : ['cross-reference x (should be right of the wire at 1600): ' + r];
  });

  await check('Moving parts: wires step next to the part, never running along another wire', async p => {
    const r = await p.evaluate(() => { const out = [];
      for (const [t, dx, dy] of [['mst3', 0, 200], ['mst3', 0, -100], ['xfmr', 200, 0], ['fus3', 0, 60], ['coil', 0, -120], ['ol3', 0, 160]]) {
        loadDoc(template('starter')); const q = S.parts.find(x => x.t === t), orig = clone(S);
        for (let k = 1; k <= 5; k++) { doc.sheets[0] = S = clone(orig); moveItems(S, new Set([q.id]), snap(dx * k / 5), snap(dy * k / 5)); } tidy(S); A = analyse();
        const segs = S.wires.flatMap(w => { const P = wirePts(S, w), n = A.label.get(A.wireRoot(S, w)); return P.slice(1).map((b, i) => ({ n, a: P[i], b })); });
        let bad = 0;
        for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) { const u = segs[i], v = segs[j]; if (u.n === v.n) continue;
          const h = (g) => g.a[1] === g.b[1];
          if (h(u) && h(v) && u.a[1] === v.a[1] && Math.min(Math.max(u.a[0], u.b[0]), Math.max(v.a[0], v.b[0])) > Math.max(Math.min(u.a[0], u.b[0]), Math.min(v.a[0], v.b[0]))) bad++;
          if (!h(u) && !h(v) && u.a[0] === v.a[0] && Math.min(Math.max(u.a[1], u.b[1]), Math.max(v.a[1], v.b[1])) > Math.max(Math.min(u.a[1], u.b[1]), Math.min(v.a[1], v.b[1]))) bad++; }
        if (bad) out.push(`${t} ${dx},${dy}: ${bad} overlaps`); }
      return out; });
    return r;
  });

  await check('Clicking a part in the palette puts it in view in a clear spot; names and labels drag; the interface size changes', async p => {
    await p.click('#new-btn'); await p.click('[data-new="starter"]'); await p.waitForTimeout(100);
    await p.locator('.pt[data-t="pl"]').scrollIntoViewIfNeeded(); await p.click('.pt[data-t="pl"]'); await p.waitForTimeout(80);
    const a = await p.evaluate(() => { const q = S.parts.find(x => x.t === 'pl' && x.tag === 'PL3'); if (!q) return 'none';
      const b = partBox(q), hit = S.parts.filter(o => o !== q && o.t !== 'rail').some(o => { const c = partBox(o); return b.x0 < c.x1 && b.x1 > c.x0 && b.y0 < c.y1 && b.y1 > c.y0; });
      const onWire = [0, 1].some(i => wiresAt(S, { p: q.id, i }).length); return [hit, onWire, sel.has(q.id), tool].join(','); });
    // drag PB1's name up and to the right
    const scr = (x, y) => p.evaluate(([x, y]) => { const m = svg.getScreenCTM(); return [m.a * x + m.e, m.d * y + m.f]; }, [x, y]);
    const L = await p.evaluate(() => { const q = S.parts.find(x => x.tag === 'PB1'); const L = PLABS.find(L => L.id === q.id && L.which === 'tag'); return [(L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2]; });
    const [x0, y0] = await scr(...L), [x1, y1] = await scr(L[0] + 60, L[1] - 40);
    await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x1, y1, { steps: 5 }); await p.mouse.up();
    const lt = await p.evaluate(() => JSON.stringify(S.parts.find(x => x.tag === 'PB1').lt));
    await p.selectOption('#ui-size', '1.5'); const z = await p.evaluate(() => [uiZoom(), localStorage.getItem(UIKEY)].join(','));
    await p.selectOption('#ui-size', '1.15');
    return [a, lt, z].join('|') === 'false,false,true,select|[60,-40]|1.5,1.5' ? [] : ['overlap,onWire,picked,tool | label offset | size: ' + [a, lt, z].join(' | ')];
  });

  await check('Fused disconnect and 3-phase fuses: the name and each fuse number drag on their own', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); const d = addPart(S, 'fdsc3', 600, 500); refresh();
      const L = w => PLABS.find(L => L.id === d.id && L.which === w), before = ['tag', 'fu0', 'fu1', 'fu2'].map(w => L(w).x0);
      setLabOff(d, 'fu1', [40, 0]); drawInk(); const after = ['tag', 'fu0', 'fu1', 'fu2'].map(w => L(w).x0);
      return after.map((x, i) => x - before[i]).join(','); });
    return r === '0,0,40,0' ? [] : ['moved by (DS1, FU1, FU2, FU3): ' + r];
  });

  await check('Continuation arrows: A on sheet 1 and A on sheet 2 are one wire, each says where the other is', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); const L1 = S.parts.find(q => q.label === 'L1');
      addWire(S, [[L1.x, 400], [500, 400]]); addPart(S, 'pb_no', 540, 400); addWire(S, [[580, 400], [900, 400]]); const o = addPart(S, 'cnt_out', 940, 400);
      const s2 = newSheet(); doc.sheets.push(s2); doc.cur = 1; S = s2; const L2 = S.parts.find(q => q.label === 'L2');
      const i = addPart(S, 'cnt_in', 400, 600); addWire(S, [[440, 600], [800, 600]]); addPart(S, 'coil', 840, 600); addWire(S, [[880, 600], [L2.x, 600]]); refresh(true);
      const A2 = analyse(), n1 = A2.label.get(A2.rootT(o, doc.sheets[0], 0)), n2 = A2.label.get(A2.rootT(i, doc.sheets[1], 0));
      const notes = [...svg.querySelectorAll('g.ink text')].map(e => e.textContent).filter(t => /SHEET/.test(t)).join(',');
      return [o.tag, i.tag, n1 === n2, notes, checkPrint(A2).filter(x => /Continuation/.test(x.title)).length]; });
    return r.join('|') === 'A|A|true|FROM SHEET 1|0' ? [] : ['out | in | same number | note on sheet 2 | warnings: ' + r.join(' | ')];
  });

  await check('Save: writes back into the same file after the first save; Save As asks again', async p => {
    const r = await p.evaluate(async () => { let picks = 0; const writes = [];
      const handle = name => ({ name, createWritable: async () => ({ write: async t => writes.push(name), close: async () => {} }) });
      window.showSaveFilePicker = async () => handle('Print ' + (++picks) + '.o3print.json'); window.showOpenFilePicker = async () => [];
      forgetFile(); await saveToFile(false); await saveToFile(false); const lab1 = $('file-label').textContent;
      S.texts.push({ id: uid('t'), x: 300, y: 300, text: 'x' }); refresh(); const dirty = $('file-label').textContent;
      await saveToFile(false); await saveToFile(true);
      return [picks, writes.join(','), lab1, dirty]; });
    return r.join('|') === '2|Print 1.o3print.json,Print 1.o3print.json,Print 1.o3print.json,Print 2.o3print.json|Print 1.o3print.json|● Print 1.o3print.json' ? [] : ['picks | writes | label | after a change: ' + r.join(' | ')];
  });

  await check('From Circuit Builder: a lighted pushbutton, a pushbutton with two blocks, an on-delay timer’s contacts, a selector’s positions; pilot light as big as a relay', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); const L1 = S.parts.find(q => q.label === 'L1'), L2 = S.parts.find(q => q.label === 'L2');
      addWire(S, [[L1.x, 400], [L2.x, 400]]); const b1 = addPart(S, 'pb_no', 500, 400, { tag: 'PB1' }); Object.assign(addPart(S, 'coil', 1100, 400, { pre: 'TR', tag: 'TR1' }), { delay: 5 });
      addWire(S, [[L1.x, 600], [L2.x, 600]]); addPart(S, 'pb_no', 500, 600, { tag: 'PB1' }); addPart(S, 'tc_no', 700, 600, { tag: 'TR1' }); const pl = Object.assign(addPart(S, 'pl', 1100, 600), { inPB: 'PB1' });
      addWire(S, [[L1.x, 800], [L2.x, 800]]); Object.assign(addPart(S, 'sel', 500, 800, { tag: 'SS1' }), { pos: 'HAND/OFF/AUTO', closedIn: [0] }); addPart(S, 'pl', 1100, 800); refresh(true);
      const txt = [...svg.querySelectorAll('g.ink text')].map(e => e.textContent);
      const dup = ISSUES.some(i => /tagged PB1/.test(i.title)), con = S.parts.find(q => q.t === 'tc_no');
      return [dup, symOf(con), txt.includes('ON-DELAY 5 s'), txt.includes('IN PB1'), txt.includes('LIGHTED (' + pl.tag + ')'), txt.includes('CLOSED: HAND'), svg.querySelectorAll('g.ink polyline[stroke-dasharray="12 10"]').length >= 2, termsOf('pl').map(t => t[0]).join('/')]; });
    return r.join('|') === 'false|NO ND Switch|true|true|true|true|true|-40/40' ? [] : ['dup error | contact symbol | timer note | light note | button note | selector note | block link and light link | pilot light: ' + r.join(' | ')];
  });

  await check('Every Circuit Builder part is in the palette: timers, timed contacts, maintained buttons, low-temp switches, control source and return', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); S.parts = S.parts.filter(q => q.t !== 'rail');
      const want = ['pb_no', 'pb_nc', 'pbm_no', 'pbm_nc', 'estop', 'sel', 'ls_no', 'ls_nc', 'ls_hc', 'ls_ho', 'ts_no', 'ts_nc', 'ts_nol', 'ts_ncl', 'ps_no', 'ps_nc', 'coil', 'tmr_on', 'tmr_off', 'pl', 'sol', 'htr', 'motor',
        'con_no', 'con_nc', 'tc_no', 'tc_nc', 'mst3', 'olc', 'dsc3', 'fus3', 'fuse', 'ol3', 'sup', 'src_l1', 'src_l2', 'xfmr', 'cnt_out', 'cnt_in',
        'cb', 'cb2', 'cb3', 'spdt', 'dpst', 'dpdt', 'xover'];
      const missing = want.filter(t => !document.querySelector(`.pt[data-t="${t}"]`));
      // an off-delay timer and its timed contacts; a control source and return feeding a rung
      const tm = addPart(S, 'tmr_off', 1000, 400), c = addPart(S, 'tc_nc', 600, 600), s1 = addPart(S, 'src_l1', 300, 800), s2 = addPart(S, 'src_l2', 300, 900);
      addWire(S, [[300, 800], [500, 800]]); addPart(S, 'pb_no', 540, 800); addWire(S, [[580, 800], [800, 800]]); addPart(S, 'pl', 840, 800); addWire(S, [[880, 800], [1100, 800], [1100, 900], [300, 900]]);
      const pm = addPart(S, 'pbm_no', 540, 1100), tl = addPart(S, 'ts_nol', 900, 1100); refresh(true); const A2 = analyse();
      const lbl = A2.label.get(A2.rootT(S.parts.find(q => q.t === 'pb_no'), S, 0));
      return [missing.join(',') || 'none', tm.t + ':' + tm.tag + ':' + !!tm.tof, c.tag, symOf(c), lbl, noteOf(pm), noteOf(tl)]; });
    return r.join('|') === 'none|coil:TR1:true|TR1|NC FD Switch|1|MAINTAINED|LOW TEMP' ? [] : ['missing | timer | timed contact letter | its symbol | wire from source | maintained note | low temp note: ' + r.join(' | ')];
  });

  await check('Parts list: dragging its edge resizes it; Hide and » hide and show it; remembered', async p => {
    await p.evaluate(() => setPalette(224, false));
    const g = await p.locator('#pal-grip').boundingBox(), w0 = (await p.locator('#palette').boundingBox()).width;
    await p.mouse.move(g.x + 3, g.y + 200); await p.mouse.down(); await p.mouse.move(g.x + 120, g.y + 200, { steps: 4 }); await p.mouse.up();
    const w1 = (await p.locator('#palette').boundingBox()).width;
    await p.click('#pal-hide'); const hid = await p.evaluate(() => [getComputedStyle($('palette')).display, !$('pal-show').hidden, JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /:palette$/.test(k)))).hidden, $('desk').getBoundingClientRect().width > 600].join(','));
    await p.click('#pal-show'); const back = await p.evaluate(() => getComputedStyle($('palette')).display);
    const sb = await p.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    await p.evaluate(() => setPalette(224, false));
    return w1 > w0 + 100 && hid === 'none,true,true,true' && back !== 'none' && sb === 'dark' ? [] : ['widths ' + w0 + ' → ' + w1 + ' | hidden: ' + hid + ' | shown: ' + back + ' | color scheme: ' + sb];
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
    await p.click('#addsheet-btn'); await p.click('#orient-btn'); await p.click('#orient-menu [data-land="1"]');
    await p.evaluate(() => { window.print = () => {}; printAll(); });
    const r = await p.evaluate(() => [...document.querySelectorAll('#print-host .pr-page')].map(e => e.classList.contains('land') ? 'L' : 'P').join(''));
    const rails = await p.evaluate(() => S.parts.filter(q => q.t === 'rail').every(r => r.y1 <= VB[1]));
    return r === 'PL' && rails ? [] : ['pages: ' + r + ', rails on the paper: ' + rails];
  });

  /* ---------- from Circuit Builder, second round ---------- */
  // where a point on the sheet is on the screen
  const scr = (p, x, y) => p.evaluate(([x, y]) => { const m = svg.getScreenCTM(); return [m.a * x + m.e, m.d * y + m.f]; }, [x, y]);

  await check('Print Preview: every sheet, Drawn By typed there kept for a new print, Esc closes; Ctrl+P opens it', async p => {
    await p.evaluate(() => { loadDoc(template('starter')); refresh(true); });
    await p.click('#addsheet-btn'); await p.click('#orient-btn'); await p.click('#orient-menu [data-land="1"]');
    const x0 = await p.evaluate(() => (doc.cur = 0, S = doc.sheets[0], refresh(true), XREFS.length));
    await p.click('#print-btn');
    const r = await p.evaluate(() => [!$('pv').hidden, document.querySelectorAll('#pv-pages .pr-page').length, $('pv-n').textContent, XREFS.length]);
    await p.fill('#pv-drawn', 'Dallas Boswell'); await p.waitForTimeout(350);
    const dr = await p.evaluate(() => [doc.tb.fields.find(f => f.label === 'Drawn By').value, [...document.querySelectorAll('#pv-pages .pr-page')].every(e => e.textContent.includes('Dallas Boswell'))]);
    await p.keyboard.press('Escape');
    const shut = await p.evaluate(() => $('pv').hidden);
    await p.click('#new-btn'); await p.click('[data-new="blank"]');
    const nb = await p.evaluate(() => doc.tb.fields.find(f => f.label === 'Drawn By').value);
    await p.keyboard.press('Control+p');
    const kp = await p.evaluate(() => !$('pv').hidden); await p.keyboard.press('Escape');
    const out = [];
    if (r.join('|') !== `true|2|2 Letter sheets, 1 landscape|${x0}`) out.push('preview open | pages | count | cross-refs kept: ' + r.join(' | '));
    if (dr.join('|') !== 'Dallas Boswell|true') out.push('Drawn By: ' + dr.join(' | '));
    if (!shut) out.push('Esc did not close it'); if (nb !== 'Dallas Boswell') out.push('a new print’s Drawn By: ' + nb); if (!kp) out.push('Ctrl+P did not open it');
    return out;
  });

  await check('Power wire numbers explained in the notes where there is power wiring; the Title Block can turn it off', async p => {
    const r = await p.evaluate(() => { const has = () => [...document.querySelectorAll('#pagehost .pr-page')].some(e => /Power wires: L1, L2, L3/.test(e.textContent));
      loadDoc(template('starter')); refresh(true); const a = has(); loadDoc(template('blank')); refresh(true); const b = has();
      loadDoc(template('starter')); refresh(true); $('tb-btn').click(); const c = $('tb-powernote').checked; $('tb-powernote').click(); const d = has(); $('tb-dlg').close(); return [a, b, c, d, doc.tb.powerNote]; });
    return r.join('|') === 'true|false|true|false|false' ? [] : ['starter | blank | ticked | after unticking | stored: ' + r.join(' | ')];
  });

  await check('Ctrl+click adds a part to what is picked, or takes it out', async p => {
    await p.evaluate(() => { loadDoc(template('starter')); refresh(true); fitZoom(); });
    const [a, b] = await p.evaluate(() => S.parts.filter(q => q.t === 'pl').map(q => [q.x, q.y]));
    const pa = await scr(p, a[0], a[1]), pb = await scr(p, b[0], b[1]);
    await p.mouse.click(...pa); await p.keyboard.down('Control'); await p.mouse.click(...pb); const two = await p.evaluate(() => sel.size);
    await p.mouse.click(...pa); await p.keyboard.up('Control'); const one = await p.evaluate(() => [...sel].map(id => partOf(S, id).tag).join());
    return two === 2 && /PL2/.test(one) && one.split(',').length === 1 ? [] : ['picked after ctrl+click: ' + two + ', after ctrl+click again: ' + one];
  });

  await check('Several parts of one kind picked: one Part tab changes them all; unlike parts get the plain one', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank'));
      const cs = [addPart(S, 'con_no', 400, 400, { tag: 'CR1' }), addPart(S, 'con_nc', 700, 400, { tag: 'CR2' }), addPart(S, 'con_no', 1000, 400, { tag: 'CR1' })]; addPart(S, 'coil', 1300, 600, { tag: 'CR1' }); addPart(S, 'coil', 1300, 800, { tag: 'CR2' });
      sel = new Set(cs.map(c => c.id)); refresh(); const h = $('props').querySelector('h4').textContent;
      $('props').querySelector('[data-mno="0"]').click(); const nc = S.parts.filter(q => q.t === 'con_nc').length;
      const of = $('m-of'); of.value = 'CR2'; of.dispatchEvent(new Event('change')); const tags = cs.map(c => partOf(S, c.id).tag).join();
      undo(); undo(); refresh(true); const back = cs.map(c => partOf(S, c.id).t + ':' + partOf(S, c.id).tag).join();
      sel = new Set([cs[0].id, S.parts.find(q => q.t === 'coil').id]); refresh(); const mixed = $('props').querySelector('h4').textContent;
      return [h, nc, tags, back, mixed]; });
    return r.join('|') === '3 Contacts|3|CR2,CR2,CR2|con_no:CR1,con_nc:CR2,con_no:CR1|2 things picked' ? [] : ['heading | NC | tags | undone | mixed: ' + r.join(' | ')];
  });

  await check('A coil renamed takes its contacts with it (unless another coil still has that name); a button its lights', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank'));
      const k = addPart(S, 'coil', 1300, 400, { tag: 'CR1' }), c1 = addPart(S, 'con_no', 400, 600, { tag: 'CR1' }), c2 = addPart(S, 'con_nc', 400, 800, { tag: 'CR1' });
      const b = addPart(S, 'pb_no', 400, 1000, { tag: 'PB1' }), l = Object.assign(addPart(S, 'pl', 1300, 1000), { inPB: 'PB1' });
      const ren = (p, t) => { sel = new Set([p.id]); refresh(); const i = $('p-tag'); i.focus(); i.value = t; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); };
      ren(k, 'CR7'); const a = [c1.tag, c2.tag, $('hint').textContent];
      undo(); refresh(true); const u = partOf(S, c1.id).tag;
      addPart(S, 'coil', 1300, 1200, { tag: 'CR1' }); const k2 = S.parts.find(q => q.id === k.id); ren(k2, 'CR8'); const stay = partOf(S, c1.id).tag;
      ren(partOf(S, b.id), 'PB4'); const lt = partOf(S, l.id).inPB;
      return [...a, u, stay, lt]; });
    return r.join('|') === 'CR7|CR7|Its 2 contacts now belong to CR7.|CR1|CR1|PB4' ? [] : ['contacts | message | undone | with another CR1 | light: ' + r.join(' | ')];
  });

  await check('Tooltips float under the button after a moment; the ribbon folds and remembers; full screen hides the title bar', async p => {
    await p.hover('#undo-btn'); await p.waitForTimeout(500);
    const tip = await p.evaluate(() => [!$('ftip').hidden, $('ftip').textContent, !document.querySelector('#undo-btn').hasAttribute('title')]);
    await p.click('#fold-btn'); const f1 = await p.evaluate(() => getComputedStyle($('ribbon')).display);
    await p.reload(); await p.waitForTimeout(300); const f2 = await p.evaluate(() => [getComputedStyle($('ribbon')).display, document.querySelector('.ribwrap').classList.contains('folded')]);
    await p.click('#rt-home'); const peek = await p.evaluate(() => getComputedStyle($('ribbon')).display);
    await p.mouse.click(900, 600); const back = await p.evaluate(() => getComputedStyle($('ribbon')).display);
    await p.click('#fold-btn'); await p.click('#fs-btn'); const fs = await p.evaluate(() => [getComputedStyle(document.querySelector('.top')).display, document.querySelector('.ribwrap').classList.contains('folded')]);
    await p.click('#fs-btn'); const nfs = await p.evaluate(() => [getComputedStyle(document.querySelector('.top')).display, document.querySelector('.ribwrap').classList.contains('folded')]);
    const r = [...tip, f1, ...f2, peek, back, ...fs, ...nfs].join('|');
    return r === 'true|Undo (Ctrl+Z)|true|none|none|true|flex|none|none|true|flex|false' ? [] : ['tip shown | text | title gone | folded | after reload | peek | click away | full screen | after: ' + r];
  });

  await check('A print file dropped on the window opens; anything else is turned away', async p => {
    const r = await p.evaluate(async () => { loadDoc(template('starter')); const json = JSON.stringify(doc); loadDoc(template('blank')); refresh(true);
      const drop = f => { const dt = new DataTransfer(); dt.items.add(f); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); };
      drop(new File(['hello'], 'notes.txt')); await new Promise(r => setTimeout(r, 100)); const a = S.parts.length;
      drop(new File([json], 'Motor.o3print.json', { type: 'application/json' })); await new Promise(r => setTimeout(r, 300));
      return [a, S.parts.length > 10, $('hint').textContent]; });
    return r[0] === 2 && r[1] && /Opened Motor/.test(r[2]) ? [] : ['parts after a .txt | opened | hint: ' + r.join(' | ')];
  });

  await check('A cross-reference clicked goes to that rung (and flashes it); PWR goes to the starter; zoom goes down to 5%', async p => {
    await p.evaluate(() => { loadDoc(template('starter')); refresh(true); fitZoom(); });
    const x = await p.evaluate(() => XREFS.find(r => r.n === 3)), pt = await scr(p, (x.x0 + x.x1) / 2, (x.y0 + x.y1) / 2);
    await p.mouse.click(...pt); const a = await p.evaluate(() => [FLASH && FLASH.y === A.rows[0].find(r => r.n === 3).y, $('hint').textContent, !!document.querySelector('#ed-over .flash')]);
    const pw = await p.evaluate(() => XREFS.find(r => r.n === 'PWR')), pp = await scr(p, (pw.x0 + pw.x1) / 2, (pw.y0 + pw.y1) / 2);
    await p.mouse.click(...pp); const b = await p.evaluate(() => [...sel].map(id => partOf(S, id).t).join());
    const z = await p.evaluate(() => { for (let i = 0; i < 40; i++) zoomBy(.8); return [zoom, $('z-lvl').textContent]; });
    const r = [...a, b, ...z].join('|');
    return /^true\|Rung 3.*\|true\|mst3\|0\.05\|5%$/.test(r) ? [] : ['flashed | hint | drawn | PWR picks | zoom: ' + r];
  });

  await check('Dashed links: dragged into a new shape, an end moved to another side; double-click puts it back', async p => {
    await p.evaluate(() => { loadDoc(template('blank')); const L1 = S.parts.find(q => q.label === 'L1'), L2 = S.parts.find(q => q.label === 'L2');
      addWire(S, [[L1.x, 400], [L2.x, 400]]); addPart(S, 'pb_no', 500, 400, { tag: 'PB1' }); addWire(S, [[L1.x, 800], [L2.x, 800]]); Object.assign(addPart(S, 'pl', 1100, 800), { inPB: 'PB1' }); refresh(true); fitZoom(); });
    const L = await p.evaluate(() => LINKS[0].pts), mid = L.length > 2 ? [(L[1][0] + L[2][0]) / 2, (L[1][1] + L[2][1]) / 2] : [(L[0][0] + L[1][0]) / 2, (L[0][1] + L[1][1]) / 2];
    const s0 = await scr(p, ...mid); await p.mouse.click(...s0);
    const head = await p.evaluate(() => [selL, $('props').querySelector('h4') && $('props').querySelector('h4').textContent]);
    await p.waitForTimeout(500); await p.mouse.move(...s0); await p.mouse.down(); const s1 = await scr(p, mid[0], mid[1] + 100); await p.mouse.move(s1[0], s1[1], { steps: 5 }); await p.mouse.up();
    const after = await p.evaluate(() => [JSON.stringify(partOf(S, selL).lk || null), UNDO.length]);
    const L2 = await p.evaluate(() => LINKS[0].pts); const m2 = L2.length > 2 ? [(L2[1][0] + L2[2][0]) / 2, (L2[1][1] + L2[2][1]) / 2] : [(L2[0][0] + L2[1][0]) / 2, (L2[0][1] + L2[1][1]) / 2];
    await p.mouse.dblclick(...await scr(p, ...m2));
    const reset = await p.evaluate(() => partOf(S, S.parts.find(q => q.t === 'pl').id).lk === undefined);
    const out = [];
    if (!head[0] || !/Dashed Link/.test(head[1] || '')) out.push('picked | heading: ' + head.join(' | '));
    if (!/"dy":100|"dy":-?\d+/.test(after[0])) out.push('shape after the drag: ' + after[0]);
    if (!reset) out.push('double-click did not put it back');
    return out;
  });

  await check('Clear takes everything off the sheet but its rails; Ctrl+Z brings it back. Names in Title Case', async p => {
    await p.evaluate(() => { loadDoc(template('starter')); refresh(true); });
    const n = await p.evaluate(() => S.parts.length); await p.click('#clear-btn');
    const c = await p.evaluate(() => [S.parts.every(q => q.t === 'rail'), S.wires.length]); await p.keyboard.press('Control+z');
    const u = await p.evaluate(() => S.parts.length);
    const names = await p.evaluate(() => ['ol', 'src_l1', 'src_l2', 'cnt_out', 'cnt_in'].map(t => LIB[t] && LIB[t].name).join(';'));
    const out = [];
    if (!c[0] || c[1] || u !== n) out.push('cleared | wires left | parts after undo: ' + [...c, u + '/' + n].join(' | '));
    if (names !== 'Overload Heater (1 Line);Source L1 (Control);Return L2 (Control);Continues To (Out);Continued From (In)') out.push('names: ' + names);
    return out;
  });

  await check('Orientation: a menu with Portrait and Landscape, the current one ticked', async p => {
    await p.evaluate(() => { loadDoc(template('starter')); refresh(true); });
    await p.click('#orient-btn'); const a = await p.evaluate(() => [!$('orient-menu').hidden, $('orient-btn').textContent.trim(), [...document.querySelectorAll('#orient-menu [data-land]')].map(b => b.getAttribute('aria-checked')).join()]);
    await p.click('#orient-menu [data-land="1"]'); const b = await p.evaluate(() => [S.land, $('orient-menu').hidden]);
    await p.click('#orient-btn'); const c = await p.evaluate(() => [...document.querySelectorAll('#orient-menu [data-land]')].map(b => b.getAttribute('aria-checked')).join());
    await p.click('#orient-menu [data-land="1"]'); const u = await p.evaluate(() => [S.land, UNDO.length]);
    await p.keyboard.press('Control+z'); const z = await p.evaluate(() => S.land);
    const r = [...a, ...b, c, u[0], z].join('|');
    return r === 'true|Orientation ▾|true,false|true|true|false,true|true|false' ? [] : ['open | label | ticks | landscape | closed | ticks after | same pick | undone: ' + r];
  });

  await check('A drag on the grey round the paper draws a selection box (it can start off the paper)', async p => {
    await p.evaluate(() => { loadDoc(template('starter')); refresh(true); fitZoom(); });
    const r = await p.evaluate(() => { const b = svg.getBoundingClientRect(), pl = S.parts.filter(q => q.t === 'pl'), m = svg.getScreenCTM();
      return { x0: b.left - 30, y: m.d * (pl[0].y - 60) + m.f, x1: m.a * (pl[0].x + 60) + m.e, y1: m.d * (pl[1].y + 60) + m.f, gray: document.elementFromPoint(b.left - 30, m.d * (pl[0].y - 60) + m.f).id }; });
    await p.mouse.move(r.x0, r.y); await p.mouse.down(); await p.mouse.move(r.x1, r.y1, { steps: 6 });
    const mid = await p.evaluate(() => !!(drag && drag.box) && !!svg.querySelector('rect.selbox[vector-effect="non-scaling-stroke"]'));
    await p.mouse.up();
    const got = await p.evaluate(() => [...sel].map(id => partOf(S, id)).filter(Boolean).map(q => q.tag || q.t).sort().join());
    return mid && /PL1/.test(got) && /PL2/.test(got) && r.gray !== 'sv' ? [] : ['started on: ' + r.gray + ' | box: ' + mid + ' | picked: ' + got];
  });

  await check('Dallas’s breakers and multi-pole switches: in the palette, tagged CB and SW, numbered through, checked for shorts; the Disconnect drawn with his 3PST Switch', async p => {
    const r = await p.evaluate(() => { loadDoc(template('blank')); refresh(true);
      const pal = ['cb', 'cb2', 'cb3', 'spdt', 'dpst', 'dpdt', 'xover'].filter(t => !document.querySelector(`.pt[data-t="${t}"]`)).join(',') || 'none';
      const grp = ['cb', 'cb2', 'cb3'].every(t => LIB[t].cat === 'Protection') && ['spdt', 'dpst', 'dpdt', 'xover'].every(t => LIB[t].cat === 'Switches');
      const ds = PSYM['3PH Disconnect'].t.map(t => t[1]).join(), cb3t = PSYM['3PST Circuit Breaker'].t.map(t => t[1]).join(), dpdt = PSYM['DPDT Switch'].t.length;
      // power: L1-L3 in, through a 3-pole breaker
      S.parts = S.parts.filter(q => q.t !== 'rail');
      const ys = [200, 320, 440]; for (const [i, y] of ys.entries()) { addPart(S, 'sup', 300, y, { tag: 'L' + (i + 1) }); addWire(S, [[300, y], [460, y]]); }
      const cb = addPart(S, 'cb3', 500, 320); for (const y of ys) addWire(S, [[540, y], [700, y]]);
      // control: an SPDT feeding two lights, one each way
      const r1 = addPart(S, 'src_l1', 300, 800), r2 = addPart(S, 'src_l2', 300, 1100);
      addWire(S, [[300, 800], [560, 800]]); const sw = addPart(S, 'spdt', 600, 800);
      addWire(S, [[640, 760], [800, 760]]); addPart(S, 'pl', 840, 760); addWire(S, [[880, 760], [1100, 760], [1100, 1100], [300, 1100]]);
      addWire(S, [[640, 840], [800, 840], [800, 960]]); addPart(S, 'pl', 840, 960, { rot: 0 }); addWire(S, [[880, 960], [1100, 960]]);
      refresh(true); const A2 = analyse(), L = (q, i) => A2.label.get(A2.rootT(q, S, i));
      const pw = [0, 1, 2, 3, 4, 5].map(i => L(cb, i)).join(), ctl = [0, 1, 2].map(i => L(sw, i)).join();
      const short0 = ISSUES.filter(i => /No load/.test(i.title)).length;
      // a throw wired straight to 2: a short through the switch
      addWire(S, [[640, 840], [640, 1100]]); refresh(true); const short1 = ISSUES.filter(i => /No load/.test(i.title)).length;
      return [pal, grp, cb.tag, sw.tag, ds, cb3t, dpdt, pw, ctl, short0, short1]; });
    const want = 'none|true|CB1|SW1|-120,-120,0,0,120,120|-120,-120,0,0,120,120|6|L1,L1A,L2,L2A,L3,L3A';
    const got = r.join('|');
    return got.startsWith(want) && /^1,\d+,\d+$/.test(String(r[8])) && new Set(String(r[8]).split(',')).size === 3 && r[9] === 0 && r[10] === 1 ? [] : ['palette missing | groups | tags | disconnect poles | breaker poles | DPDT ends | power numbers | control numbers | shorts before | after: ' + got];
  });

  await check('The Switches menu is split by kind: each kind flies out beside it, inside the window, and its parts place as before', async p => {
    await p.setViewportSize({ width: 1132, height: 640 });
    await p.evaluate(() => { loadDoc(template('blank')); refresh(true); });
    await p.click('[data-menu="Switches"]');
    const rows = await p.evaluate(() => { const m = document.querySelector('[data-menu="Switches"]').nextElementSibling; return [[...m.querySelectorAll(':scope > button, :scope > .subwrap > .sub-row')].map(b => b.textContent.replace(/[▸\d]/g, '').trim()).join(';'), m.getBoundingClientRect().bottom <= innerHeight]; });
    await p.hover('.sub-row >> text=Toggle'); await p.waitForTimeout(250);
    const fly = await p.evaluate(() => { const f = [...document.querySelectorAll('.fly')].filter(x => !x.hidden), b = f[0] && f[0].getBoundingClientRect(); return [f.length, b && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight, f[0] && f[0].querySelectorAll('button[data-t]').length]; });
    await p.hover('.sub-row >> text=Limit'); await p.waitForTimeout(250);
    const one = await p.evaluate(() => [...document.querySelectorAll('.fly')].filter(x => !x.hidden).map(x => x.querySelectorAll('button').length).join());
    await p.click('.fly:not([hidden]) button[data-t="ls_hc"]');
    const placed = await p.evaluate(() => [S.parts.at(-1).t, document.querySelectorAll('.dmenu:not([hidden])').length]);
    await p.setViewportSize({ width: 1600, height: 1000 });
    const r = [...rows, ...fly, one, ...placed].join('|');
    return r === 'Selector Switch;Limit Switches;Temperature Switches;Pressure Switches;Float Switches;Flow Switches;Proximity Switches;Toggle & Multi-Pole Switches|true|1|true|5|4|ls_hc|0' ? [] : ['kinds | menu fits | fly-outs open | fly-out fits | its parts | one open at a time | placed | menus left open: ' + r];
  });

  await check('Every long part menu is split by kind; SPDT and DPDT switches flip left to right (F, or Flip on the Part tab), their wires following', async p => {
    await p.evaluate(() => { loadDoc(template('blank')); refresh(true); });
    const kinds = await p.evaluate(() => Object.fromEntries(CATS.map(c => [c, [...document.querySelector(`[data-menu="${c}"]`).nextElementSibling.querySelectorAll(':scope > button, :scope > .subwrap > .sub-row')].map(b => b.dataset.t ? LIB[b.dataset.t].name : [...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()).join(';')])));
    const want = { Buttons: 'Pushbuttons;Maintained Pushbuttons;Emergency Stop', Outputs: 'Relay Coil;Timers;Pilot Light;Solenoid;Heating Element;Motor', Contacts: 'Relay Contacts;Timed Contacts;Starter;OL Contact',
      Protection: 'Disconnects;Fuses;Circuit Breakers;Overloads', Power: 'Phase (L1, L2, L3);Control Source and Return;Transformer' };
    const out = []; for (const [c, w] of Object.entries(want)) if (kinds[c] !== w) out.push(c + ': ' + kinds[c]);
        // an SPDT with a wire on each end, flipped: its common moves to the right, its wires stay on the same ends; undo puts it back
    const r = await p.evaluate(() => { const a = addPart(S, 'spdt', 800, 600); addWire(S, [[600, 600], [760, 600]]); addWire(S, [[840, 560], [1000, 560]]); addWire(S, [[840, 640], [1000, 640]]);
      refresh(true); const ends = () => S.wires.map(w => [w.a, w.b].filter(e => e.p === a.id).map(e => e.i).join()).filter(Boolean).sort().join('/');
      const e0 = ends(); sel = new Set([a.id]); refresh(); const btn = !!$('p-flip'); return { id: a.id, e0, btn, loose: ISSUES.filter(i => /not wired|without reaching/.test(i.title)).length }; });
    await p.keyboard.press('f');
    const f = await p.evaluate(id => { const q = partOf(S, id); return [q.t + ':' + !!q.fx, termPos(q, 0).join(), S.wires.map(w => [w.a, w.b].filter(e => e.p === id).map(e => e.i).join()).filter(Boolean).sort().join('/'), ISSUES.filter(i => /not wired|without reaching/.test(i.title)).length]; }, r.id);
    await p.click('#p-flip'); const back = await p.evaluate(id => !!partOf(S, id).fx, r.id);
    await p.keyboard.press('Control+z'); const undone = await p.evaluate(id => !!partOf(S, id).fx, r.id);
    const got = [r.btn, f[0], f[1], f[2] === r.e0, f[3] === r.loose, back, undone].join('|');
    if (got !== 'true|spdt:true|840,600|true|true|false|true') out.push('Flip button | after F | common at | same ends | loose ends | Flip again | undo: ' + got);
    return out;
  });

  await check('Every part turns and flips (Dallas, 10 Nov 2026): 3-phase parts, the transformer, lines in; wires follow; numbering holds; old flipped switches open', async p => {
    const r = await p.evaluate(() => { loadDoc(template('starter')); refresh(true);
      const before = S.wires.map(w => A.label.get(A.wireRoot(S, w))).sort().join();
      const turnable = Object.keys(LIB).filter(t => !LIB[t].hide).every(t => canTurn({ t }) && canFlip({ t }));
      const ds = S.parts.find(q => q.t === 'dsc3'), x = S.parts.find(q => q.t === 'xfmr'), l1 = S.parts.find(q => q.t === 'sup');
      // flipping the transformer and the disconnect keeps every wire on its end and every number as it was
      flipParts(S, new Set([ds.id, x.id])); refresh(true);
      const flipped = S.wires.map(w => A.label.get(A.wireRoot(S, w))).sort().join();
      const loose = ISSUES.filter(i => /not wired|without reaching/.test(i.title)).length;
      flipParts(S, new Set([ds.id, x.id])); refresh(true);
      // a line in turned a half: its arrow points the other way along its wire
      rotateParts(S, new Set([l1.id]), 180); refresh(true); const lt = l1.rot;
      // a 3-phase part turned a quarter: its poles stand side by side
      const f3 = addPart(S, 'fus3', 1400, 1600); rotateParts(S, new Set([f3.id])); const tp = [0, 2, 4].map(i => termPos(f3, i)[1]).join();
      // a print saved in the demo with a flipped SPDT as a part of its own
      const d = JSON.parse(JSON.stringify(doc)); d.sheets[0].parts.push({ id: 'old1', t: 'spdt_m', x: 1400, y: 2000, rot: 0, tag: 'SW9' }); loadDoc(d); const o = S.parts.find(q => q.id === 'old1');
      return [turnable, before === flipped, loose, lt, tp, o.t + ':' + !!o.fx]; });
    const got = r.join('|');
    return got === 'true|true|0|180|1560,1560,1560|spdt:true' ? [] : ['all turn and flip | numbers kept | loose ends | line in turned | 3-phase poles | old flipped switch: ' + got];
  });

  await check('Paper Size: standard sizes and a custom one, per sheet; the page, rails, preview, printing and saving follow', async p => {
    await p.evaluate(() => { loadDoc(template('blank')); refresh(true); });
    await p.click('#paper-btn'); await p.click('#paper-menu [data-paper="tabloid"]');
    const a = await p.evaluate(() => [pageSize().join('x'), S.parts.find(q => q.label === 'L2').x > 2400, $('pageinfo').textContent, document.querySelector('#paper-menu [aria-checked="true"]').dataset.paper, document.querySelector('#pagehost .pr-page').style.width]);
    await p.click('#addsheet-btn'); const b = await p.evaluate(() => paperName(S));
    await p.click('#paper-btn'); await p.click('#paper-menu [data-paper="custom"]');
    await p.selectOption('#cp-unit', 'mm'); await p.fill('#cp-w', '50'); await p.fill('#cp-h', '300'); await p.click('#cp-form .primary');
    const bad = await p.evaluate(() => [$('cp-dlg').open, !$('cp-err').hidden]);
    await p.fill('#cp-w', '300'); await p.fill('#cp-h', '200'); await p.click('#cp-form .primary');
    const c = await p.evaluate(() => [$('cp-dlg').open, paperKey(S), paperIn(S).join('x'), $('pageinfo').textContent]);
    await p.click('#print-btn'); const pv = await p.evaluate(() => $('pv-n').textContent); await p.keyboard.press('Escape');
    const pr = await p.evaluate(() => { printAll = printAll; const ph = $('print-host'); const old = window.print; window.print = () => {}; printAll(); window.print = old; return $('print-page').textContent; });
    const rt = await p.evaluate(() => { const d = JSON.parse(JSON.stringify(doc)); loadDoc(d); return doc.sheets.map(paperName).join(' / '); });
    const got = [...a, b, ...bad, ...c, pv, /size: 11in 17in/.test(pr) && /size: 11\.81in 7\.87in|size: 11\.81in 7\.87in/.test(pr.replace(/(\d+\.\d\d)\d*/g, '$1')) || /size: 11in 17in/.test(pr), rt].join('|');
    return got === '1056x1632|true|Tabloid · Portrait|tabloid|11in|Tabloid|true|true|false|custom|11.81x7.87|11.81 × 7.87 in · Portrait|2 sheets|true|Tabloid / 11.81 × 7.87 in' ? [] : ['size | rails | info | ticked | page width | new sheet | bad size kept open | error | closed | key | inches | info | preview | print css | saved: ' + got];
  });

  await check('An open menu closes on a press anywhere outside it (the sheet too, where the press does nothing else) and on Esc', async p => {
    await p.evaluate(() => { loadDoc(template('starter')); refresh(true); fitZoom(); });
    const pl = await p.evaluate(() => { const b = svg.getBoundingClientRect(); sel = new Set(); refresh(); return [Math.min(b.right, innerWidth) - 60, Math.min(b.bottom, innerHeight) - 120]; });
    const covered = await p.evaluate(([x, y]) => { $('rt-home').click(); document.querySelector('[data-menu="Switches"]').click(); const hit = document.elementFromPoint(x, y); closeMenus(); return !!hit.closest('.dmenu'); }, pl);
    if (covered) return ['test set-up: the light is under the menu'];
    await p.click('[data-menu="Switches"]'); await p.mouse.click(...pl);
    const a = await p.evaluate(() => [menuOpen(), sel.size]);
    await p.click('#new-btn'); await p.click('#rt-check'); const b = await p.evaluate(() => menuOpen()); await p.click('#rt-home');
    await p.click('[data-menu="Protection"]'); await p.hover('.sub-row >> text=Fuses'); await p.waitForTimeout(200); await p.keyboard.press('Escape'); const c = await p.evaluate(() => menuOpen());
    await p.click('#orient-btn'); await p.mouse.click(30, 980); const d = await p.evaluate(() => menuOpen());
    const r = [...a, b, c, d].join('|');
    return r === 'false|0|false|false|false' ? [] : ['open after a press on the sheet | picked | after the ribbon tab | after Esc | after the grey: ' + r];
  });

  await check('Organize spreads a rung’s parts evenly between L1 and L2; a branch moves as a block; a part leading off stays; numbers hold; one undo', async p => {
    const r = await p.evaluate(() => { loadDoc(template('starter')); refresh(true); const labels = () => S.wires.map(w => A.label.get(A.wireRoot(S, w))).sort().join();
      const l0 = labels(), dis = $('org-btn').disabled;
      const pb = S.parts.find(x => x.tag === 'PB1'); sel = new Set([pb.id]); refresh(); $('org-btn').click(); refresh(true);
      const r1 = ['PB1', 'PB2', 'M1', 'OL1'].map(t => S.parts.find(x => x.tag === t && x.y === 1080 && x.t !== 'motor')).map(q => q.x), seal = S.parts.find(x => x.t === 'con_no' && x.y === 1200).x;
      const L1 = S.parts.find(q => q.label === 'L1').x, L2 = S.parts.find(q => q.label === 'L2').x;
      const edges = [L1, ...[pb, ...['PB2', 'M1', 'OL1'].map(t => S.parts.find(x => x.tag === t && x.y === 1080 && x.t !== 'motor'))].flatMap(q => { const e = extOf(q); return [q.x + e.x0, q.x + e.x1]; }), L2];
      // (PB2 and its seal-in contact are one block: its joints are the block's ends)
      const gaps = []; for (let i = 0; i < edges.length; i += 2) gaps.push(edges[i + 1] - edges[i]);
      const same = labels() === l0, errs = ISSUES.filter(i => i.sev === 'e').length, sealWith = seal === r1[1];
      undo(); refresh(true); const back = S.parts.find(x => x.tag === 'PB1').x;
      // an SPDT on a rung (its throws lead off the line) stays put; the rest spread round it
      loadDoc(template('blank')); const a = S.parts.find(q => q.label === 'L1'), b = S.parts.find(q => q.label === 'L2'); const y = 600;
      addWire(S, [[a.x, y], [360, y]]); const sw = addPart(S, 'spdt', 400, y); addWire(S, [[440, y - 40], [600, y - 40]]); addWire(S, [[440, y + 40], [600, y + 40]]);
      addWire(S, [[a.x, 900], [300, 900]]); addPart(S, 'pb_no', 340, 900); addWire(S, [[380, 900], [500, 900]]); addPart(S, 'pl', 540, 900); addWire(S, [[580, 900], [b.x, 900]]);
      refresh(true); sel = new Set([sw.id]); refresh(); $('org-btn').click(); const swx = sw.x, hint = $('hint').textContent;
      return { dis, sealWith, same, errs, back, gaps, swx, hint }; });
    const out = [];
    if (!r.dis) out.push('Organize was on with nothing picked');
    if (!r.sealWith) out.push('the seal-in contact did not move with PB2');
    if (!r.same || r.errs) out.push('numbers changed or errors: ' + r.same + ' ' + r.errs);
    if (r.back !== 420) out.push('undo: PB1 at ' + r.back);
    if (Math.max(...r.gaps.slice(0, 1).concat(r.gaps.slice(-1))) - Math.min(...r.gaps.slice(0, 1).concat(r.gaps.slice(-1))) > 160) out.push('ends of the rung not evenly spaced: ' + r.gaps.join(','));
    if (r.swx !== 400) out.push('the SPDT moved: ' + r.swx + ' ' + r.hint);
    return out;
  });

  await b.close();
  console.log(`\n${passed} of ${passed + failed} checks passed.`);
  process.exit(failed ? 1 : 0);
})();
