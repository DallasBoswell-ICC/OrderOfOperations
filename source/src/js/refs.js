/* =====================================================================
   rung numbers and cross-references, as on a print (Show: Rung numbers)
   Every line is numbered, down the L1 bar: each line that starts at L1, and each branch line with a part on it. After each coil's (and timer's) name, the rungs its contacts are
   in, the normally closed ones underlined; on a tag on each contact's corner, the rung its coil is in. Pressing a number
   takes the view to that rung and lights it up for a moment.
   ===================================================================== */
const SHOW_KEY = 'oo-circuit-builder:show';
const SHOW = { rungs: true, overview: true };
try { Object.assign(SHOW, JSON.parse(localStorage.getItem(SHOW_KEY) || '{}')); } catch (_) {}
// the lines, top first: every line that starts at L1, and every branch with a part on it (each its own number, as on
// a print); lines closer together than a part is tall count as one
function rungYs(net) {
  const ys = [...net.feeds.filter(f => f.t === 'L1' && f.bar).map(f => f.y), ...parts.map(p => p.y)].sort((a, b) => a - b), out = [];
  for (const y of ys) if (!out.length || y - out[out.length - 1] > 20) out.push(y);
  return out;
}
// the number of the line a part at height y is on (the line at or above it)
function rungAt(ys, y) { let n = 1; for (let i = 0; i < ys.length; i++) if (ys[i] <= y + 1) n = i + 1; return n; }
function drawRefs(V, B, net) {
  const ys = V.rungYs = rungYs(net); if (!ys.length) return;
  ys.forEach((y, i) => {   // the number, on the L1 bar just above where the rung starts
    const g = el('g', { class: 'rungno', 'data-rung': i + 1 }, B(y).top);
    el('rect', { x: 1, y: y - 38, width: BAR - 2, height: 19, rx: 5, fill: '#1f1f1f', stroke: '#e2cc85', 'stroke-width': 1.3 }, g);
    el('text', { x: BAR / 2, y: y - 24.5, 'text-anchor': 'middle', 'font-size': i + 1 > 99 ? 8.5 : 11, 'font-weight': 800, fill: '#f2e6b8' }, g).textContent = i + 1;
  });
  const go = (t, y) => { t.setAttribute('class', 'xref'); t.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); jumpToRung(y); }); };
  for (const p of parts) {
    const v = V.parts.get(p.id); if (!v || !v.cap) continue;
    if (p.t === 'coil') {
      // the rungs its contacts are in (each rung once for its normally open ones and once for its normally closed)
      const seen = new Set(), refs = [];
      for (const c of parts) if (c.t === 'con' && c.L === p.L) { const n = rungAt(ys, c.y), k = n + (c.nc ? 'c' : 'o'); if (!seen.has(k)) { seen.add(k); refs.push({ n, nc: !!c.nc, y: ys[n - 1] }); } }
      if (!refs.length) continue;
      refs.sort((a, b) => a.n - b.n || a.nc - b.nc);
      el('tspan', { class: 'xsep' }, v.cap).textContent = '  ';
      const nc = [];
      refs.forEach((r, i) => {
        if (i) el('tspan', { class: 'xsep' }, v.cap).textContent = ', ';
        const t = el('tspan', {}, v.cap); t.textContent = r.n; go(t, r.y);
        if (r.nc) { t.dataset.nc = '1'; nc.push(t); }
        t.dataset.tip = `A normally ${r.nc ? 'closed' : 'open'} ${p.L} contact is on rung ${r.n}: press to go there`;
      });
      // the dark outline that keeps the name readable over the grid, drawn as a copy behind it (drawn with it, each
      // comma's outline would cover the edge of the number before it)
      const halo = v.cap.cloneNode(true); halo.setAttribute('class', 'cap caphalo'); halo.removeAttribute('data-tip');
      v.cap.parentNode.insertBefore(halo, v.cap); v.cap.classList.add('nohalo');
      // the normally closed ones underlined (a line drawn over the name, from the start of the number to its end)
      for (const t of nc) {
        let x1, x2; try { const n = t.getNumberOfChars(); x1 = t.getStartPositionOfChar(0).x; x2 = t.getEndPositionOfChar(n - 1).x; } catch (_) { continue; }
        if (!(x2 > x1)) continue;
        const y = +v.cap.getAttribute('y') + 2.6;
        el('line', { x1, y1: y, x2, y2: y, class: 'xline', 'stroke-width': 1.4 }, v.cap.parentNode);
      }
    } else if (p.t === 'con') {
      const c = parts.find(q => q.t === 'coil' && q.L === p.L); if (!c) continue;
      // (on a tag on its top left corner, so a row of contacts close together keeps its names apart)
      const n = rungAt(ys, c.y), g = el('g', {}, v.cap.parentNode), w = String(n).length > 1 ? 22 : 16, x = p.x - BOX / 2 + 2, y = p.y - CON_H / 2 + 2;
      el('rect', { x: x - w / 2, y: y - 8, width: w, height: 16, rx: 4, fill: '#1f1f1f', stroke: '#e2cc85', 'stroke-width': 1.2 }, g);
      const t = el('text', { x, y: y + 4, 'text-anchor': 'middle', 'font-size': 11 }, g); t.textContent = n; go(t, ys[n - 1]); go(g, ys[n - 1]);
      g.dataset.tip = `Its ${isTimer(c) ? 'timer' : 'coil'}, ${p.L}, is on rung ${n}: press to go there`;
    }
  }
}
// take the main view to the rung at y (so it shows near the top) and light it up for a moment
function jumpToRung(y) {
  if (!LAYOUT) { cam.fit = false; cam.y = y - viewH() * 0.3; applyCam(); }
  const ys = view.rungYs || [], i = ys.indexOf(y), y1 = i >= 0 && i + 1 < ys.length ? ys[i + 1] - 45 : y + 60;
  const g = view.B ? view.B(y).g : null; if (!g) return;
  const r = el('rect', { x: 0, y: y - 45, width: W, height: Math.max(80, y1 - y + 45), fill: '#ffc000', class: 'rungflash', 'pointer-events': 'none' }, g);
  setTimeout(() => r.remove(), 1400);
}
function setShow(k, on) {
  SHOW[k] = on;
  try { localStorage.setItem(SHOW_KEY, JSON.stringify(SHOW)); } catch (_) {}
  document.querySelectorAll(`[data-show="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on)));
  if (k === 'overview') showOverview(); else draw();
  if (!editing) paint();
}
document.querySelectorAll('[data-show]').forEach(b => { b.setAttribute('aria-pressed', String(!!SHOW[b.dataset.show])); b.addEventListener('click', () => setShow(b.dataset.show, !SHOW[b.dataset.show])); });
