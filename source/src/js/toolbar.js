// toolbar parts: drag onto the panel, or click the tool and then click the panel
document.querySelectorAll('.tool[data-part]').forEach(b => {
  const kind = b.dataset.part;
  b.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !editing) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY; let moved = false, ghost = null;
    const sample = kind === 'coil' ? { t: 'coil', L: '?', color: '#FFDC00' } : kind === 'lamp' ? { t: 'lamp', L: '', color: '#00B050' } : kind.startsWith('con') ? { t: 'con', L: '?', nc: kind === 'con-nc' } : { t: 'btn', L: '?', nc: kind === 'btn-nc', color: '#9a9a9a' };
    const mv = ev => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 5) { moved = true; closeMenus(); ghost = document.createElement('div'); ghost.className = 'ghost'; ghost.innerHTML = b.innerHTML; document.body.append(ghost); document.body.classList.add('dragging'); }
      if (!moved) return;
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
      const r = pt(ev), box = svg.getBoundingClientRect();
      if (ev.clientY >= box.top && ev.clientY <= box.bottom && ev.clientX >= box.left && ev.clientX <= box.right) {
        const [x, y] = clampPart(r.x, r.y, sample.t);
        const T = LOADT(sample.t) ? 60 : 40, hits = [[x - T, y], [x + T, y]].filter(([a, c]) => connects(pointInfo(a, c)));
        preview = { part: { p: sample, x, y, bad: overlaps(null, x, y, sample.t) }, splice: !!spliceTarget(x, y, sample.t), hits }; drawPreview();
      } else { preview = null; view.overlay.innerHTML = ''; }
    };
    const up = ev => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      if (moved) { ghost.remove(); document.body.classList.remove('dragging'); preview = null; view.overlay.innerHTML = '';
        const r = pt(ev), box = svg.getBoundingClientRect();
        if (ev.clientX >= box.left && ev.clientX <= box.right && ev.clientY >= box.top && ev.clientY <= box.bottom) placePart(kind, r.x, r.y); }
      else setTool(tool === kind ? 'select' : kind);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });
});
function setTool(t) {
  tool = t; closeMenus();
  document.querySelectorAll('.tool[data-tool], .tool[data-part]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.tool || b.dataset.part) === t)));
  svg.style.cursor = t === 'select' ? '' : 'crosshair';
  document.querySelectorAll('.pgroup').forEach(g => g.querySelector('.group').classList.toggle('has-tool', !!g.querySelector(`.tool[data-part="${t}"]`)));
  say(t !== 'select' && t !== 'wire' ? 'Click the panel to place it (or drag the tool onto the panel). Press Esc to cancel.' : '');
}
document.querySelectorAll('.tool[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
function del() {
  if (!sel) return;
  snapshot();
  parts = parts.filter(q => !sel.parts.has(q.id));
  wires = wires.filter(w => !sel.wires.has(w.id));
  sel = null; draw();
}
document.getElementById('del').addEventListener('click', del);
document.getElementById('undo').addEventListener('click', undo);
document.getElementById('clear').addEventListener('click', () => { snapshot(); parts = []; wires = []; W_USER = null; sel = null; circuitName = ''; forgetFile(); draw(); });
document.addEventListener('keydown', e => {
  if (!editing || /SELECT|INPUT/.test(document.activeElement.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if (e.key === 'Escape') { setTool('select'); sel = null; draw(); }
});

// part groups: each opens a menu of its parts; picking one (or dragging it out) closes the menu
function closeMenus(except) {
  document.querySelectorAll('.pgroup').forEach(g => { if (g === except) return; g.querySelector('.pmenu').hidden = true; g.querySelector('.group').setAttribute('aria-expanded', 'false'); });
}
document.querySelectorAll('.pgroup').forEach(g => {
  const b = g.querySelector('.group'), m = g.querySelector('.pmenu');
  b.addEventListener('click', () => { const open = m.hidden; closeMenus(g); m.hidden = !open; b.setAttribute('aria-expanded', String(open)); if (open) { const f = m.querySelector('.tool'); f && f.focus({ preventScroll: true }); } });
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('.pgroup')) closeMenus(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
