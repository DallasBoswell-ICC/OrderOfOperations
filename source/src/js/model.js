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
/* Stress test: every hard case in one circuit (see the README). Laid out by a small helper: a rung is a list of
   parts in series, and a list inside it is parallel branches, drawn one under the other. */
function layoutRungs(rungs) {
  const ps = [], ws = [];
  const part = (e, x, y) => {   // e: ['btn', L, nc, maint, colour] | ['con', L, nc] | ['coil', L, colour]
    const T = e[0] === 'coil' ? 60 : 40, cx = x + 40 + T;
    ws.push(Wr(x, y, x + 40, y));
    if (e[0] === 'btn') ps.push(P('btn', cx, y, { L: e[1], nc: !!e[2], maint: !!e[3], color: e[4] }));
    else if (e[0] === 'con') ps.push(P('con', cx, y, { L: e[1], nc: !!e[2] }));
    else ps.push(P('coil', cx, y, { L: e[1], color: e[2] }));
    return { x: cx + T, h: 0 };
  };
  const series = (list, x, y) => { let h = 0; for (const e of list) { const r = Array.isArray(e[0]) ? par(e, x, y) : part(e, x, y); x = r.x; h = Math.max(h, r.h); } return { x, h }; };
  const par = (branches, x, y) => {   // branches: a list of series lists; the first stays on the rung, the rest below
    let yy = y, ends = [], h = 0;
    ws.push(Wr(x, y, x + 20, y));
    for (let i = 0; i < branches.length; i++) {
      if (i) { yy += 100 + h; h = 0; }
      const r = series(branches[i], x + 20, yy); ends.push([r.x, yy]); h = r.h;
    }
    const R = Math.max(...ends.map(e => e[0])) + 20;
    for (const [ex, ey] of ends) ws.push(Wr(ex, ey, R, ey));
    ws.push(Wr(x + 20, y, x + 20, yy), Wr(R, y, R, yy));
    return { x: R, h: yy - y + h };
  };
  let y = 80, right = 0;
  for (const r of rungs) { const o = series(r, 0, y); ws.push(Wr(o.x, y, -1, y)); right = Math.max(right, o.x); y += 120 + o.h; }
  const w = Math.max(W_MIN, Math.ceil((right + 80) / G) * G);
  for (const q of ws) { if (q.x2 === -1) q.x2 = w; }
  return { ps, ws, w };
}
PRESETS.stress = () => {
  const Bt = (L, nc, maint, col) => ['btn', L, nc, maint, col], Co = (L, nc) => ['con', L, nc], Cl = (L, col) => ['coil', L, col];
  const { ps, ws, w } = layoutRungs([
    // master: STOP (NC) and START with M's seal-in
    [Bt('S', 1, 0, '#FF0032'), [[Bt('A', 0, 0, '#00B050')], [Co('M')]], Cl('M', '#FFFFFF')],
    // forward / reverse: each needs M, and each is locked out by the other
    [Co('M'), [[Bt('B', 0, 0, '#0070C0')], [Co('F')]], Co('R', 1), Cl('F', '#00D2BE')],
    [Co('M'), [[Bt('C', 0, 0, '#FF9600')], [Co('R')]], Co('F', 1), Cl('R', '#EC008C')],
    // X, with Y's NC contact behind it (on the L2 side)
    [[[Bt('D', 0, 1, '#FFDC00')], [Bt('E', 0, 1, '#7030A0')]], Cl('X', '#FFDC00'), Co('Y', 1)],
    // Y: the same E button again, or F's contact
    [[[Bt('E', 0, 1, '#7030A0')], [Co('F')]], Cl('Y', '#EC008C')],
    // a buzzer: Z through its own NC contact switches itself on and off while G is in
    [Bt('G', 0, 1, '#FF9600'), Co('Z', 1), Cl('Z', '#7030A0')],
    // a cascade: J brings in P, P brings in Q, Q brings in T
    [Bt('J', 0, 1, '#00D2BE'), Cl('P', '#FFDC00')],
    [Co('P'), Cl('Q', '#00B050')],
    [Co('Q'), Cl('T', '#0070C0')],
  ]);
  // a cross-feed below: H and K feed U and V across each other, so one wire carries two colours, one each way
  const y0 = Math.max(...ws.map(q => Math.max(q.y1, q.y2))) + 140, Y = v => v + y0;
  ps.push(P('btn', 380, Y(0), { L: 'H', maint: true, color: '#0070C0' }), P('btn', 160, Y(120), { L: 'K', maint: true, color: '#00B050' }), P('coil', 700, Y(0), { L: 'U', color: '#FFDC00' }), P('coil', 700, Y(240), { L: 'V', color: '#EC008C' }));
  ws.push(Wr(0, Y(60), 80, Y(60)), Wr(80, Y(0), 80, Y(120)), Wr(80, Y(0), 340, Y(0)), Wr(80, Y(120), 120, Y(120)), Wr(420, Y(0), 640, Y(0)), Wr(440, Y(0), 440, Y(120)),
    Wr(200, Y(120), 440, Y(120)), Wr(240, Y(120), 240, Y(240)), Wr(240, Y(240), 640, Y(240)), Wr(760, Y(0), w, Y(0)), Wr(760, Y(240), w, Y(240)));
  return [ps, ws, w];
};
function loadPreset(k) { W = W_MIN; W_USER = null; const r = PRESETS[k](); [parts, wires] = r; if (r[2]) W = r[2]; normalize(); }
