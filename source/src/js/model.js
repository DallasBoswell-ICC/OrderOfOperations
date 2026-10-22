/* ---------------- the drawing ---------------- */
let nextId = 1, parts = [], wires = [];
const P = (t, x, y, o = {}) => Object.assign({ id: nextId++, t, x, y }, o);
const Wr = (x1, y1, x2, y2) => ({ id: nextId++, x1, y1, x2, y2 });
const B = (L, x, y, nc = false) => P('btn', x, y, { L, nc, maint: true, color: BTN_COL[L] });
const C = (L, x, y) => P('coil', x, y, { L, color: COIL_COL[L] });
const PRESETS = {
  blank: () => [[], []],
  io: () => [[B('A', 220, 200), C('X', 700, 200)], [Wr(0, 200, 180, 200), Wr(260, 200, 640, 200), Wr(760, 200, W, 200)]],
  and: () => [[B('A', 180, 200), B('B', 360, 200), C('X', 700, 200)], [Wr(0, 200, 140, 200), Wr(220, 200, 320, 200), Wr(400, 200, 640, 200), Wr(760, 200, W, 200)]],
  or: () => [[B('A', 300, 140), B('B', 300, 260), C('X', 700, 200)],
    [Wr(0, 200, 160, 200), Wr(160, 140, 160, 260), Wr(160, 140, 260, 140), Wr(160, 260, 260, 260), Wr(340, 140, 440, 140), Wr(340, 260, 440, 260),
     Wr(440, 140, 440, 260), Wr(440, 200, 640, 200), Wr(760, 200, W, 200)]],
  andor: () => [[B('A', 140, 200), B('B', 360, 140), B('C', 360, 260), C('X', 700, 200)],
    [Wr(0, 200, 100, 200), Wr(180, 200, 240, 200), Wr(240, 140, 240, 260), Wr(240, 140, 320, 140), Wr(240, 260, 320, 260), Wr(400, 140, 480, 140), Wr(400, 260, 480, 260),
     Wr(480, 140, 480, 260), Wr(480, 200, 640, 200), Wr(760, 200, W, 200)]],
};
// three rungs, each an NC button then two NO buttons in parallel, all feeding one coil:
// X = (NOT A AND (B OR C)) OR (NOT D AND (F OR G)) OR (NOT E AND (H OR I))
PRESETS.three = () => {
  const ps = [C('X', 700, 140)], ws = [Wr(480, 140, 640, 140), Wr(760, 140, W, 140), Wr(480, 140, 480, 640)];
  const nb = (L, x, y, nc, color) => P('btn', x, y, { L, nc, maint: true, color });
  for (const [N, nc, top, ct, bot, cb, y] of [['A', '#FF0032', 'B', '#0070C0', 'C', '#00B050', 140], ['D', '#FF9600', 'F', '#7030A0', 'G', '#EC008C', 340], ['E', '#00D2BE', 'H', '#FFDC00', 'I', '#FF0032', 540]]) {
    ps.push(nb(N, 120, y, true, nc), nb(top, 340, y, false, ct), nb(bot, 340, y + 100, false, cb));
    ws.push(Wr(0, y, 80, y), Wr(160, y, 300, y), Wr(240, y, 240, y + 100), Wr(240, y + 100, 300, y + 100), Wr(380, y, 480, y), Wr(380, y + 100, 480, y + 100));
  }
  return [ps, ws];
};
// relay circuits: momentary pushbuttons (they spring back) held in by seal-in contacts
const Bm = (L, x, y, nc = false) => P('btn', x, y, { L, nc, maint: false, color: BTN_COL[L] });
const Ct = (L, x, y, nc = false) => P('con', x, y, { L, nc });
// Start / Stop: press A and X picks up; its seal-in contact closes around A and keeps X in after A springs back.
// Press D (stop, normally closed) to drop X out.
PRESETS.seal = () => [[Bm('D', 120, 200, true), Bm('A', 300, 200), Ct('X', 300, 300), C('X', 700, 200)],
  [Wr(0, 200, 80, 200), Wr(160, 200, 260, 200), Wr(220, 200, 220, 300), Wr(220, 300, 260, 300), Wr(340, 200, 640, 200), Wr(340, 300, 380, 300), Wr(380, 300, 380, 200), Wr(760, 200, W, 200)]];
// ABC sequence start: X must be in before Y can start, and X and Y before Z. D stops everything.
PRESETS.abc = () => {
  const ps = [Bm('D', 120, 100, true), C('X', 700, 100), C('Y', 700, 320), C('Z', 700, 540)];
  const ws = [Wr(0, 100, 80, 100), Wr(160, 100, 260, 100), Wr(200, 100, 200, 640), Wr(380, 100, 640, 100), Wr(760, 100, W, 100)];
  for (const [L, coil, y] of [['A', 'X', 100], ['B', 'Y', 320], ['C', 'Z', 540]]) {
    ps.push(Bm(L, 300, y), Ct(coil, 300, y + 100));   // the start button, with its coil's seal-in contact around it
    ws.push(Wr(200, y + 100, 260, y + 100), Wr(340, y + 100, 380, y + 100), Wr(380, y + 100, 380, y), Wr(340, y, 380, y));
    if (y > 100) ws.push(Wr(200, y, 260, y));
  }
  ps.push(Ct('X', 480, 320), Ct('X', 460, 540), Ct('Y', 580, 540));   // the interlocks: Y needs X in; Z needs X and Y in
  ws.push(Wr(380, 320, 440, 320), Wr(520, 320, 640, 320), Wr(760, 320, W, 320), Wr(380, 540, 420, 540), Wr(500, 540, 540, 540), Wr(620, 540, 640, 540), Wr(760, 540, W, 540));
  return [ps, ws];
};
function loadPreset(k) { W = W_MIN; W_USER = null; [parts, wires] = PRESETS[k](); normalize(); }
