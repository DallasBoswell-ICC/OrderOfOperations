/* ---------------- saving and opening circuits ----------------
   A circuit is saved as a small JSON file, or as a short text code (the same JSON, compressed) that can be pasted
   anywhere. The circuit being worked on is also kept in this browser, so it is still there after a reload.

   File/code contents:  { app: "order-of-operations-circuit-builder", v: 1, name, w, parts: [...], wires: [...] }
     w: where the L2 bar is (wire ends at x = w are on L2). Saved at the narrowest the circuit allows, so the same
        circuit saves the same whatever size the window is; it widens again to fill the screen it is opened on.
     parts: [type, x, y, letter, normallyClosed, maintained, colour, delay]
            (type "btn", "coil", "con" or "lamp"; a pilot light's letter is the button it is built into, or "";
            the eighth field: a timer's seconds (a timer is a coil), or 1 on a timer's instantaneous contact; the ninth:
            1 on an off-delay timer)
     wires: [x1, y1, x2, y2]                                            (straight runs, on the grid)            */
const APP_ID = 'order-of-operations-circuit-builder', AUTOSAVE_KEY = 'oo-circuit-builder:current';
let circuitName = '';

function circuitData() {
  const w = W_USER ? W : contentRight(), x = v => v === W ? w : v;   // (a length set by moving the bars is kept)
  return {
    app: APP_ID, v: 1, name: circuitName || '', w, ...(W_USER ? { fw: 1 } : {}),
    parts: parts.map(p => { const a = [p.t, p.x, p.y, p.L, p.nc ? 1 : 0, p.maint === false ? 0 : 1, (p.color || '').replace('#', '')]; if (isTimer(p)) { a.push(p.delay); if (p.tof) a.push(1); } if (p.t === 'con' && p.inst) a.push(1); return a; }),
    wires: wires.map(q => [x(q.x1), q.y1, x(q.x2), q.y2]),
  };
}
// check a circuit read from a file or code, and turn it back into parts and wires (throws a readable message)
function readCircuit(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.parts) || !Array.isArray(d.wires)) throw new Error('That is not a circuit from the Circuit Builder.');
  if (d.app && d.app !== APP_ID) throw new Error('That file is from a different program.');
  if (d.v > 1) throw new Error('That circuit was saved by a newer version of the Circuit Builder.');
  const num = v => { const n = Number(v); if (!Number.isFinite(n)) throw new Error('The circuit is damaged (a position is not a number).'); return snap(n); };
  const hex = c => /^[0-9a-f]{6}$/i.test(c || '') ? '#' + c.toUpperCase() : null;
  const ps = d.parts.slice(0, 200).map(a => {
    const t = a[0] === 'coil' ? 'coil' : a[0] === 'con' ? 'con' : a[0] === 'lamp' ? 'lamp' : 'btn', L = String(a[3] || (t === 'lamp' ? '' : 'A')).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) || (t === 'lamp' ? '' : 'A');
    const p = P(t, num(a[1]), num(a[2]), { L, color: hex(a[6]) || (t === 'lamp' ? '#00B050' : t === 'coil' ? COIL_COL[L] || '#FFDC00' : BTN_COL[L] || '#FF0032') });
    if (t === 'btn') { p.nc = !!a[4]; p.maint = a[5] !== 0; }
    if (t === 'con') { p.nc = !!a[4]; delete p.color; if (a[7] === 1) p.inst = true; }   // (a timer's instantaneous contact)
    if (t === 'coil' && a[7] !== undefined) { const n = Math.round(Number(a[7])); if (n >= 1) { p.delay = Math.min(999, n); if (a[8] === 1) p.tof = true; } }   // a timer (a[8] = 1: off-delay)
    return p;
  });
  const w = Math.max(d.fw ? BAR_MIN : W_MIN, Math.min(20000, d.w === undefined ? W_MIN : num(d.w)));
  const ws = d.wires.slice(0, 2000).map(a => [num(a[0]), num(a[1]), num(a[2]), num(a[3])])
    .filter(([x1, y1, x2, y2]) => (x1 === x2 || y1 === y2) && (x1 !== x2 || y1 !== y2))
    .map(([x1, y1, x2, y2]) => Wr(Math.min(w, Math.max(0, x1)), Math.max(0, y1), Math.min(w, Math.max(0, x2)), Math.max(0, y2)));
  return { w, fixed: !!d.fw, parts: ps, wires: ws, name: typeof d.name === 'string' ? d.name.slice(0, 60) : '' };
}
function useCircuit(c, how) {
  snapshot();
  parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; circuitName = c.name; normalize(); sel = null;
  fitView(); fit(true);
  say(how);
  if (editing) draw(); else { NET = network(); draw(); startRun(); afterRunStart(); }
}

// ---- short codes: "OO1." + compressed JSON in URL-safe base64 (or "OO0." + plain JSON where compression is missing)
const b64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
async function encodeCircuit() {
  const json = new TextEncoder().encode(JSON.stringify(circuitData()));
  if (typeof CompressionStream === 'function') { try { return 'OO1.' + b64(await pipe(json, new CompressionStream('deflate-raw'))); } catch (_) {} }
  return 'OO0.' + b64(json);
}
async function decodeCircuit(text) {
  const t = String(text || '').trim().replace(/\s+/g, '');
  if (!t) throw new Error('Paste a circuit code first.');
  if (t.startsWith('{')) return readCircuit(JSON.parse(t));
  const m = /^OO([01])\.([A-Za-z0-9_-]+)$/.exec(t);
  if (!m) throw new Error('That does not look like a circuit code. It should start with OO1.');
  let bytes;
  try { bytes = unb64(m[2]); } catch (_) { throw new Error('The code is incomplete or has been changed. Copy it again.'); }
  if (m[1] === '1') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed codes. Try an up-to-date browser.');
    try { bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); } catch (_) { throw new Error('The code is incomplete or has been changed. Copy it again.'); }
  }
  let d; try { d = JSON.parse(new TextDecoder().decode(bytes)); } catch (_) { throw new Error('The code is incomplete or has been changed. Copy it again.'); }
  return readCircuit(d);
}

// ---- files
/* Where the browser allows it (Chrome and Edge, with the Circuit Builder opened as its own page), the page keeps
   hold of the file a circuit was opened from or saved to, and Save writes straight back into that same file.
   Elsewhere (other browsers, or inside another page such as Claude) Save hands over a new copy to download. */
let fileHandle = null, savedJSON = null;
const FILE_TYPES = [{ description: 'Circuit', accept: { 'application/json': ['.json'] } }];
const canUseFiles = () => typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function' && window.self === window.top;
const fileName = () => (circuitName || 'circuit').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) + '.json';
const fileText = () => JSON.stringify(circuitData(), null, 1);
const isDirty = () => JSON.stringify(circuitData()) !== savedJSON;
function markSaved() { savedJSON = JSON.stringify(circuitData()); showFileLabel(); }
function forgetFile() { fileHandle = null; savedJSON = null; showFileLabel(); }
async function downloadCopy() {
  const data = fileText(), name = fileName();
  // inside Claude the page asks the viewer to confirm the download; anywhere else it is an ordinary download
  const downloads = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (downloads) {
    try { await downloads.save({ filename: name, data }); markSaved(); return 'Saved ' + name + '.'; }
    catch (e) { return e && e.code === 'declined' ? 'Not saved.' : 'Saving a file is not available here. Use Copy code instead.'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  markSaved();
  return 'Saved ' + name + ' to your downloads.';
}
// save: into the file this circuit came from, or (asNew, or no file yet) a file the user picks
async function saveToFile(asNew) {
  if (!canUseFiles()) return downloadCopy();
  try {
    if (!fileHandle || asNew) fileHandle = await window.showSaveFilePicker({ suggestedName: fileName(), types: FILE_TYPES });
    if (!circuitName) circuitName = fileHandle.name.replace(/\.json$/i, '');
    const w = await fileHandle.createWritable(); await w.write(fileText()); await w.close();
    markSaved();
    return 'Saved to ' + fileHandle.name + '.';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'Not saved.';
    if (e && (e.name === 'SecurityError' || e.name === 'NotAllowedError')) return downloadCopy();
    return 'Could not save: ' + (e && e.message || e);
  }
}
async function openFile(file, handle) {
  if (!file) return;
  if (file.size > 8e6) throw new Error('That file is too big to be a circuit.');
  const text = await file.text();
  // a locked simulator: the circuit built into it (opened here, it can be changed and saved again)
  const sim = /<script id="oo-locked" type="application\/json">([\s\S]*?)<\/script>/.exec(text);
  if (sim) {
    let d; try { d = JSON.parse(sim[1]); } catch (_) { throw new Error('That simulator file is damaged.'); }
    const c = readCircuit(d.circuit);
    useCircuit(c, `Opened the circuit from the simulator ${c.name || file.name}. Save it to keep your changes, and Save as simulator again to hand it out.`);
    forgetFile(); return;
  }
  let d; try { d = JSON.parse(text); } catch (_) { throw new Error(/^\s*</.test(text) ? 'That page is not a simulator saved from the Circuit Builder.' : 'That file is not a saved circuit.'); }
  const c = readCircuit(d);
  if (!c.name) c.name = file.name.replace(/\.json$/i, '');
  useCircuit(c, `Opened ${c.name || 'the circuit'}.`);
  fileHandle = handle || null; markSaved();
}
async function pickAndOpen() {
  if (canUseFiles()) {
    try { const [h] = await window.showOpenFilePicker({ types: FILE_TYPES }); await openFile(await h.getFile(), h); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; if (!(e && (e.name === 'SecurityError' || e.name === 'NotAllowedError'))) throw e; }
  }
  document.getElementById('open-input').click();   // the ordinary file chooser (Save will then make a new copy)
  return false;
}

// ---- kept in this browser between visits
let autosaveTimer = 0;
function scheduleAutosave() {
  if (LOCKED) return;   // (a locked simulator never keeps anything, nor touches the Builder's own saved circuit)
  showFileLabel();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(circuitData())); } catch (_) {} }, 400);
}
function restoreAutosave() {
  try { const t = localStorage.getItem(AUTOSAVE_KEY); if (!t) return false; const c = readCircuit(JSON.parse(t)); parts = c.parts; wires = c.wires; W = c.w; W_USER = c.fixed ? c.w : null; circuitName = c.name; normalize(); return true; }
  catch (_) { return false; }
}

// ---- which file is open, whether it has unsaved changes, and a short "Saved" notice
function showFileLabel() {
  const lab = document.getElementById('file-label'); if (!lab) return;
  const dirty = savedJSON !== null && isDirty();
  lab.hidden = !fileHandle;
  lab.textContent = fileHandle ? (dirty ? '● ' : '') + fileHandle.name : '';
  lab.title = fileHandle ? (dirty ? 'Changes not saved yet: press Save (Ctrl+S) to write them into ' : 'All changes saved in ') + fileHandle.name : '';
  lab.classList.toggle('dirty', dirty);
  document.getElementById('save-btn').dataset.tip = fileHandle ? `Save into ${fileHandle.name} (Ctrl+S)` : 'Save this circuit as a file, or copy a short code you can paste anywhere (Ctrl+S)';
}
let toastTimer = 0;
function toast(text) {
  const t = document.getElementById('toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---- the Save and Open buttons and dialogs
const saveDlg = document.getElementById('save-dlg'), openDlg = document.getElementById('open-dlg');
async function openSaveDialog() {
  document.getElementById('save-name').value = circuitName;
  document.getElementById('copy-msg').textContent = 'Paste it into an email, a document or your class page. Anyone can open it with Open → Paste a code.';
  document.getElementById('save-code').value = await encodeCircuit();
  const same = document.getElementById('save-same'), asNew = document.getElementById('save-file');
  same.hidden = !fileHandle; if (fileHandle) same.textContent = 'Save into ' + fileHandle.name;
  asNew.textContent = fileHandle ? 'Save as a new file…' : canUseFiles() ? 'Save as a file…' : 'Save as a file';
  asNew.classList.toggle('primary', !fileHandle);
  document.getElementById('save-file-hint').textContent = canUseFiles()
    ? 'After the first save, Save writes your changes back into the same file.'
    : 'A small .json file you can hand out, collect or open again later. This browser saves a new copy each time.';
  saveDlg.showModal();
}
// the Save button (and Ctrl+S): straight into the open file if there is one, otherwise the Save box
async function quickSave() {
  if (fileHandle) toast(await saveToFile(false));
  else openSaveDialog();
}
document.getElementById('save-btn').addEventListener('click', quickSave);
document.getElementById('save-more').addEventListener('click', openSaveDialog);
document.getElementById('save-name').addEventListener('input', async e => {
  circuitName = e.target.value.trim(); scheduleAutosave();
  document.getElementById('save-code').value = await encodeCircuit();
});
document.getElementById('save-same').addEventListener('click', async () => { const m = await saveToFile(false); document.getElementById('copy-msg').textContent = m; if (/^Saved/.test(m)) { saveDlg.close(); toast(m); } });
document.getElementById('save-file').addEventListener('click', async () => { const m = await saveToFile(true); document.getElementById('copy-msg').textContent = m; if (/^Saved/.test(m) && canUseFiles()) { saveDlg.close(); toast(m); } });
document.getElementById('copy-code').addEventListener('click', async () => {
  const ta = document.getElementById('save-code'), msg = document.getElementById('copy-msg');
  try { await navigator.clipboard.writeText(ta.value); msg.textContent = 'Copied. Paste it wherever you like.'; }
  catch (_) { ta.focus(); ta.select(); msg.textContent = 'The code is selected: press Ctrl+C (or ⌘C) to copy it.'; }
});
document.getElementById('open-btn').addEventListener('click', () => {
  document.getElementById('open-code').value = ''; document.getElementById('open-msg').textContent = '';
  openDlg.showModal();
});
document.getElementById('open-file').addEventListener('click', async () => {
  try { if (await pickAndOpen()) openDlg.close(); } catch (err) { document.getElementById('open-msg').textContent = err.message; }
});
document.getElementById('open-input').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  try { await openFile(f, null); openDlg.close(); } catch (err) { document.getElementById('open-msg').textContent = err.message; }
});
document.getElementById('open-code-btn').addEventListener('click', async () => {
  try { const c = await decodeCircuit(document.getElementById('open-code').value); useCircuit(c, `Opened ${c.name || 'the circuit'}.`); forgetFile(); openDlg.close(); }
  catch (err) { document.getElementById('open-msg').textContent = err.message; }
});
document.addEventListener('keydown', e => {
  if (LOCKED) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (!saveDlg.open && !openDlg.open) quickSave(); }
});
// drop a saved file straight onto the panel (in Chrome and Edge, Save then writes back into that file)
{
  const stage = document.getElementById('stage');
  stage.addEventListener('dragover', e => { if (!LOCKED && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); stage.classList.add('dropping'); } });
  stage.addEventListener('dragleave', () => stage.classList.remove('dropping'));
  stage.addEventListener('drop', async e => {
    stage.classList.remove('dropping');
    const item = e.dataTransfer.items && e.dataTransfer.items[0], f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
    e.preventDefault();
    let handle = null;
    if (canUseFiles() && item && item.getAsFileSystemHandle) { try { const h = await item.getAsFileSystemHandle(); if (h && h.kind === 'file') handle = h; } catch (_) {} }
    try { await openFile(f, handle); } catch (err) { say(err.message); toast(err.message); }
  });
}

/* ---- a locked simulator: this same page, with the circuit built in, that opens straight into Run mode with nothing
   for changing the circuit (no Build mode, toolbar, Start from, Save or Open). Students can press the buttons, change
   the speed and reset it. It is one self-contained .html file, like the Builder itself. */
const escHtml = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function simulatorHTML() {
  const name = circuitName || 'Circuit';
  const data = JSON.stringify({ circuit: circuitData() }).replace(/</g, '\\u003c');
  let html = PAGE_HTML;
  const at = html.indexOf('<script>');   // (the page's script: the first one, as the code after it mentions the tag too)
  if (!html || at < 0) throw new Error('This page cannot make a simulator from here.');
  html = html.slice(0, at) + `<script id="oo-locked" type="application/json">${data}<\/script>\n` + html.slice(at);   // (written <\/script> so it never ends this page's own script)
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(name)}</title>`);
}
async function saveSimulator() {
  const name = (circuitName || 'Circuit').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) + ' (simulator).html';
  let html; try { html = simulatorHTML(); } catch (e) { return e.message; }
  const downloads = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (downloads) {
    try { await downloads.save({ filename: name, data: html }); return 'Saved ' + name + '.'; }
    catch (e) { return e && e.code === 'declined' ? 'Not saved.' : 'Saving a file is not available here.'; }
  }
  if (canUseFiles()) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Simulator', accept: { 'text/html': ['.html'] } }] });
      const w = await h.createWritable(); await w.write(html); await w.close(); return 'Saved the simulator as ' + h.name + '.';
    } catch (e) { if (e && e.name === 'AbortError') return 'Not saved.'; if (!(e && (e.name === 'SecurityError' || e.name === 'NotAllowedError'))) return 'Could not save: ' + (e && e.message || e); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'Saved ' + name + ' to your downloads.';
}
document.getElementById('save-sim').addEventListener('click', async () => { const m = await saveSimulator(); document.getElementById('copy-msg').textContent = m; if (/^Saved/.test(m)) { saveDlg.close(); toast(m); } });
