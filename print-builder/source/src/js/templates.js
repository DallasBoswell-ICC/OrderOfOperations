/* =====================================================================
   Ready-made prints (New ▾): a blank ladder, and a motor starter to show how it all goes.
   ===================================================================== */
function template(name) {
  const keep = doc, keepS = S;
  const d = newDoc(); doc = d; S = d.sheets[0]; lastCoil = '';
  try {
    if (name === 'starter') buildStarter(S);
    d.tb.fields.find(f => f.label === 'Drawing Title').value = name === 'starter' ? 'Motor Starter' : 'Untitled Print';
    return d;
  } finally { if (keep) { doc = keep; S = keepS; } }
}
// a 3-phase motor starter: disconnect, fuses, starter M1, overload OL1, motor; a control transformer with its
// fuse feeding the ladder: stop/start with a seal-in, run and stopped lights
function buildStarter(s) {
  const L1 = s.parts.find(p => p.label === 'L1'), L2 = s.parts.find(p => p.label === 'L2');
  L1.y0 = L2.y0 = 960; L1.y1 = L2.y1 = 1600;
  // power
  for (const [l, y] of [['L1', 200], ['L2', 320], ['L3', 440]]) { addPart(s, 'sup', 200, y, { tag: l }); addWire(s, [[200, y], [1840, y]]); }
  addPart(s, 'dsc3', 400, 320); addPart(s, 'fus3', 640, 320);
  addPart(s, 'mst3', 1180, 320, { tag: 'M1' }); addPart(s, 'ol3', 1520, 320);
  const m = addPart(s, 'motor', 1980, 320);
  // (the leads fan in to the motor)
  [200, 320, 440].forEach((y, i) => addWire(s, [[1840, y], termPos(m, i)]));
  // the control transformer, off L1 and L2 after the fuses
  const x = addPart(s, 'xfmr', 920, 700);
  addWire(s, [[860, 200], [860, 640]]); addWire(s, [[980, 320], [980, 640]]);
  addWire(s, [[860, 760], [860, 840], [560, 840]]); addPart(s, 'fuse', 520, 840); addWire(s, [[480, 840], [200, 840], [200, 960]]);
  addWire(s, [[980, 760], [980, 840], [L2.x, 840], [L2.x, 960]]);
  // the ladder
  for (const y of [1080, 1360, 1520]) addWire(s, [[L1.x, y], [L2.x, y]]);
  addPart(s, 'pb_nc', 420, 1080, { desc: 'STOP' }); addPart(s, 'pb_no', 680, 1080, { desc: 'START' });
  const c = addPart(s, 'coil', 1300, 1080, { pre: 'M' }); addPart(s, 'olc', 1600, 1080, { tag: 'OL1' });
  addWire(s, [[600, 1080], [600, 1200], [760, 1200], [760, 1080]]); addPart(s, 'con_no', 680, 1200, { tag: c.tag });
  addPart(s, 'con_no', 680, 1360, { tag: c.tag }); addPart(s, 'pl', 1300, 1360, { desc: 'GREEN' });
  addPart(s, 'con_nc', 680, 1520, { tag: c.tag }); addPart(s, 'pl', 1300, 1520, { desc: 'RED' });
  void x;
}
