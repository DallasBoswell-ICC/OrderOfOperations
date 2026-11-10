/* ---------- the shell round the editor: Print Preview, tooltips, folding the ribbon, full screen, dropping a file
   in (all as in Circuit Builder). Last of the scripts: it starts everything off at the very end. ---------- */

/* ---------- Print Preview: every sheet as it will print; Print… from here opens the browser's print box ---------- */
const PV = { z: 1, fit: true, pan: null, t: null };
const pvOpen = () => !$('pv').hidden;
const drawnField = () => (doc.tb.fields || []).find(isDrawnBy);
function renderPV() {
  const box = $('pv-pages');
  box.style.transform = ''; box.innerHTML = doc.sheets.map((s, k) => pageHTML(s, k, A)).join('');
  for (const p of box.querySelectorAll('.pr-page')) fitDraw(p);
  drawInk();          // (drawing the other sheets used the editor's lists of labels and links: the current sheet's back)
  const n = doc.sheets.length, land = doc.sheets.filter(s => s.land).length, names = [...new Set(doc.sheets.map(paperName))];
  $('pv-n').textContent = `${n} ${names.length === 1 ? names[0] + ' ' : ''}sheet${n > 1 ? 's' : ''}${land ? (land === n ? ', landscape' : `, ${land} landscape`) : ''}`;
  pvZoom(PV.fit ? 'fit' : PV.z);
}
// the sheets' size unscaled (stacked, 24px apart)
function pvSize() { const box = $('pv-pages'); return [box.scrollWidth, box.scrollHeight]; }
function pvZoom(z, cx, cy) {
  const sc = $('pv-scroll'), box = $('pv-pages'); box.style.transform = '';
  const [w, h] = pvSize(), r = sc.getBoundingClientRect();
  const fit = Math.min((sc.clientWidth - 40) / w, (sc.clientHeight - 40) / Math.min(h, paperIn(doc.sheets[0])[1] * 96));
  PV.fit = z === 'fit'; const old = PV.z;
  PV.z = Math.max(.25, Math.min(3, PV.fit ? fit : z));
  // the point under the pointer stays put
  cx = cx ?? r.left + r.width / 2; cy = cy ?? r.top + r.height / 2;
  const qx = (sc.scrollLeft + cx - r.left) / old, qy = (sc.scrollTop + cy - r.top) / old;
  box.style.transform = `scale(${PV.z})`; box.parentElement.style.setProperty('--pvw', w * PV.z + 'px'); box.parentElement.style.setProperty('--pvh', h * PV.z + 'px');
  if (!PV.fit) { sc.scrollLeft = qx * PV.z - (cx - r.left); sc.scrollTop = qy * PV.z - (cy - r.top); } else { sc.scrollLeft = 0; sc.scrollTop = 0; }
  $('pv-zl').textContent = Math.round(PV.z * 100) + '%';
}
function openPreview() {
  closeMenus(); hideTip();
  const f = drawnField(); $('pv-drawn').parentElement.hidden = !f; $('pv-drawn').value = f ? f.value || '' : '';
  $('pv').hidden = false; PV.fit = true; renderPV(); PV.z = PV.z || 1;
  say('Print Preview: every sheet as it will print.');
}
function closePreview() { if (!pvOpen()) return; $('pv').hidden = true; $('pv-pages').innerHTML = ''; refresh(true); say(); }
$('pv-close').addEventListener('click', closePreview);
$('pv-print').addEventListener('click', () => printAll());
$('pv-zi').addEventListener('click', () => pvZoom(PV.z * 1.25)); $('pv-zo').addEventListener('click', () => pvZoom(PV.z * .8)); $('pv-zf').addEventListener('click', () => pvZoom('fit'));
$('pv-scroll').addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); pvZoom(PV.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY); }, { passive: false });
$('pv-scroll').addEventListener('pointerdown', e => { if (e.button !== 0) return; const sc = $('pv-scroll'); PV.pan = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop }; sc.setPointerCapture(e.pointerId); sc.classList.add('pan'); });
$('pv-scroll').addEventListener('pointermove', e => { if (!PV.pan) return; const sc = $('pv-scroll'); sc.scrollLeft = PV.pan.l - (e.clientX - PV.pan.x); sc.scrollTop = PV.pan.t - (e.clientY - PV.pan.y); });
for (const ev of ['pointerup', 'pointercancel']) $('pv-scroll').addEventListener(ev, () => { PV.pan = null; $('pv-scroll').classList.remove('pan'); });
// Drawn By, typed here: on every sheet, and kept for the next new print (one undo step for the typing)
let pvTyped = false;
$('pv-drawn').addEventListener('focus', () => { pvTyped = false; });
$('pv-drawn').addEventListener('input', e => {
  const f = drawnField(); if (!f) return; if (!pvTyped) { snapshot(); pvTyped = true; }
  f.value = e.target.value; rememberDrawnBy(f.value); autosave();
  clearTimeout(PV.t); PV.t = setTimeout(() => { const sc = $('pv-scroll'), l = sc.scrollLeft, t = sc.scrollTop; renderPV(); sc.scrollLeft = l; sc.scrollTop = t; }, 250);
});
window.addEventListener('resize', () => { if (pvOpen() && PV.fit) pvZoom('fit'); });
// while the preview is up, the keys are its own: Esc closes it, Ctrl+P prints; the editor's keys wait
window.addEventListener('keydown', e => {
  if (!pvOpen()) return;
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') { e.preventDefault(); closePreview(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'p') { e.preventDefault(); printAll(); }
  else if ((e.ctrlKey || e.metaKey) && (k === '=' || k === '+')) { e.preventDefault(); pvZoom(PV.z * 1.25); }
  else if ((e.ctrlKey || e.metaKey) && k === '-') { e.preventDefault(); pvZoom(PV.z * .8); }
  e.stopPropagation();
}, true);

/* ---------- tooltips, as in Circuit Builder: a dark label that floats under (or over) what the pointer rests on,
   after a moment; Tab onto a button shows it too. Every title="" on the page becomes one. ---------- */
let tipEl = null, tipT = null;
const ftip = $('ftip');
function hideTip() { clearTimeout(tipT); tipEl = null; ftip.hidden = true; }
function tipTarget(t) {
  const el = t && t.closest && t.closest('[title], [data-tip]');
  if (!el || el.closest('.pr-page')) return null;
  if (el.hasAttribute('title')) { const v = el.getAttribute('title'); el.removeAttribute('title'); if (v) el.dataset.tip = v; }
  return el.dataset.tip ? el : null;
}
function showTip(el) {
  if (!el.isConnected || drag) return;
  const uiz = parseFloat(getComputedStyle($('app')).getPropertyValue('--uiz')) || 1;
  ftip.textContent = el.dataset.tip; ftip.style.fontSize = 12.5 * uiz + 'px'; ftip.hidden = false;
  const r = el.getBoundingClientRect(), w = ftip.offsetWidth, h = ftip.offsetHeight, gap = 7;
  let x = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)), y = r.bottom + gap, up = false;
  if (y + h > innerHeight - 6) { y = r.top - gap - h; up = true; }
  ftip.style.left = x + 'px'; ftip.style.top = Math.max(6, y) + 'px'; ftip.classList.toggle('up', up);
}
document.addEventListener('pointerover', e => {
  const el = tipTarget(e.target); if (el === tipEl) return;
  hideTip(); if (!el || e.pointerType === 'touch') return;
  tipEl = el; tipT = setTimeout(() => showTip(el), 330);
});
document.addEventListener('pointerout', e => { if (tipEl && !tipEl.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('focusin', e => { const el = tipTarget(e.target); if (el && el.matches(':focus-visible') && el.tagName === 'BUTTON') { hideTip(); tipEl = el; tipT = setTimeout(() => showTip(el), 330); } });
document.addEventListener('focusout', hideTip);
for (const ev of ['pointerdown', 'wheel']) document.addEventListener(ev, hideTip, true);
document.addEventListener('scroll', hideTip, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); }, true);

/* ---------- folding the ribbon (the arrow at the right of its tabs): only the tabs left; a tab clicked opens its
   ribbon over the sheet until a click somewhere else. Kept for next time. Full screen folds it too. ---------- */
const FOLDKEY = 'oo-print-builder:ribbon-folded';
const ribw = document.querySelector('.ribwrap');
let folded = false, fsFold = null;
function setFold(on, keep = true) {
  folded = on; ribw.classList.toggle('folded', on); ribw.classList.remove('peek');
  $('fold-btn').setAttribute('aria-pressed', String(on));
  $('fold-btn').dataset.tip = on ? 'Open the ribbon out again' : 'Fold the ribbon up out of the way (the tabs stay: click one to open it for a moment)';
  if (keep) try { localStorage.setItem(FOLDKEY, on ? '1' : '0'); } catch (_) {}
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}
$('fold-btn').addEventListener('click', () => setFold(!folded));
for (const id of ['rt-home', 'rt-part', 'rt-check']) $(id).addEventListener('click', () => { if (folded) { ribw.classList.add('peek'); for (const r of ribw.querySelectorAll('.ribbon')) r.scrollLeft = 0; } });
document.addEventListener('pointerdown', e => { if (ribw.classList.contains('peek') && !ribw.contains(e.target) && !e.target.closest('.dmenu, dialog')) ribw.classList.remove('peek'); }, true);
try { if (localStorage.getItem(FOLDKEY) === '1') setFold(true, false); } catch (_) {}

/* full screen: no title bar, the ribbon folded; Esc (the browser's own) or the button again comes back */
const isFS = () => $('app').classList.contains('fs');
function setFS(on) {
  if (on === isFS()) return;
  $('app').classList.toggle('fs', on);
  if (on) { fsFold = folded; setFold(true, false); } else if (fsFold !== null) { setFold(fsFold, false); fsFold = null; }
  $('fs-btn').dataset.tip = on ? 'Leave full screen (Esc)' : 'Full screen: the sheet gets the whole screen (Esc or this button again to come back)';
  $('fs-btn').setAttribute('aria-pressed', String(on));
}
$('fs-btn').addEventListener('click', () => {
  const de = document.documentElement;
  if (!isFS()) { setFS(true); if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().catch(() => {}); }
  else { setFS(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
});
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && isFS()) setFS(false); });

/* ---------- a print file dropped anywhere on the window opens it (where the browser allows, Save then writes
   back into that same file, as when it is opened with Open) ---------- */
let dropN = 0;
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); dropN++; $('drop').hidden = false; });
window.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--dropN <= 0) { dropN = 0; $('drop').hidden = true; } });
window.addEventListener('drop', async e => {
  if (!hasFiles(e)) return; e.preventDefault(); dropN = 0; $('drop').hidden = true;
  const it = [...e.dataTransfer.items].find(i => i.kind === 'file'), hp = it && it.getAsFileSystemHandle && canUseFiles() ? it.getAsFileSystemHandle() : null;
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (!/\.json$/i.test(f.name)) { say(`${f.name} is not a print: Print Builder opens .json prints.`); return; }
  if (pvOpen()) closePreview();
  let h = null; try { h = hp ? await hp : null; if (h && h.kind !== 'file') h = null; } catch (_) { h = null; }
  openFile(f, h);
});

start();
