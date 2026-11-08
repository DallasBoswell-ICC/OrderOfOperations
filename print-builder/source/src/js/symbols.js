/* =====================================================================
   The library: every device Print Builder can place, on the print symbols (psym.js).
   cat     its group in the palette and the ribbon's menus
   sym     its print symbol (PSYM's name)
   pre     the start of its tag (PB1, LS2, FU3...); none for a contact, which takes its coil's tag
   kind    what it is to the numbering and the check:
             sw       a switch or pushbutton (control)        contact  a relay contact (its coil's tag)
             coil     a coil (relay, starter, timer)          load     a pilot light, solenoid, heating element
             olc      an overload's contact (its OL's tag)    fuse     a fuse (power or control)
             ol       an overload heater (power)              power    a disconnect, fuse block (power)
             starter  a starter's power contacts (its coil's tag)
             motor    a motor                                 xfmr     a control transformer
             supply   a line coming in (L1, L2, L3)
   poles   pairs of its terminals that carry a line through it, line side first (power and fuses)
   flip    the same device the other way (NO <-> NC)
   ===================================================================== */
const LIB = {
  // (in Circuit Builder's order: its menus, and what is in each)
  pb_no:   { cat: 'Buttons', name: 'NO Pushbutton', sym: 'NO Pushbutton', pre: 'PB', kind: 'sw', flip: 'pb_nc' },
  pb_nc:   { cat: 'Buttons', name: 'NC Pushbutton', sym: 'NC Pushbutton', pre: 'PB', kind: 'sw', flip: 'pb_no' },
  estop:   { cat: 'Buttons', name: 'Emergency Stop', sym: 'NC EStop Pushbutton', pre: 'ES', kind: 'sw' },
  sel:     { cat: 'Switches', name: 'Selector Switch', sym: 'Selector Switch Operator', pre: 'SS', kind: 'sw' },
  ls_no:   { cat: 'Switches', name: 'NO Limit Switch', sym: 'NO Limit Switch', pre: 'LS', kind: 'sw', flip: 'ls_nc' },
  ls_nc:   { cat: 'Switches', name: 'NC Limit Switch', sym: 'NC Limit Switch', pre: 'LS', kind: 'sw', flip: 'ls_no' },
  ls_hc:   { cat: 'Switches', name: 'NO Limit Switch, Held Closed', sym: 'NO HC Limit Switch', pre: 'LS', kind: 'sw', flip: 'ls_ho' },
  ls_ho:   { cat: 'Switches', name: 'NC Limit Switch, Held Open', sym: 'NC HO Limit Switch', pre: 'LS', kind: 'sw', flip: 'ls_hc' },
  ts_no:   { cat: 'Switches', name: 'NO Temperature Switch', sym: 'NO Temperature Switch', pre: 'TS', kind: 'sw', flip: 'ts_nc' },
  ts_nc:   { cat: 'Switches', name: 'NC Temperature Switch', sym: 'NC Temperature Switch', pre: 'TS', kind: 'sw', flip: 'ts_no' },
  ps_no:   { cat: 'Switches', name: 'NO Pressure Switch', sym: 'NO Pressure Switch', pre: 'PS', kind: 'sw', flip: 'ps_nc' },
  ps_nc:   { cat: 'Switches', name: 'NC Pressure Switch', sym: 'NC Pressure Switch', pre: 'PS', kind: 'sw', flip: 'ps_no' },
  fs_no:   { cat: 'Switches', name: 'NO Float Switch', sym: 'NO Float Switch', pre: 'FS', kind: 'sw', flip: 'fs_nc' },
  fs_nc:   { cat: 'Switches', name: 'NC Float Switch', sym: 'NC Float Switch', pre: 'FS', kind: 'sw', flip: 'fs_no' },
  fls_no:  { cat: 'Switches', name: 'NO Flow Switch', sym: 'NO Flow Switch', pre: 'FLS', kind: 'sw', flip: 'fls_nc' },
  fls_nc:  { cat: 'Switches', name: 'NC Flow Switch', sym: 'NC Flow Switch', pre: 'FLS', kind: 'sw', flip: 'fls_no' },
  prs_no:  { cat: 'Switches', name: 'NO Proximity Switch', sym: 'NO Proximity Switch', pre: 'PRS', kind: 'sw', flip: 'prs_nc' },
  prs_nc:  { cat: 'Switches', name: 'NC Proximity Switch', sym: 'NC Proximity Switch', pre: 'PRS', kind: 'sw', flip: 'prs_no' },
  spst:    { cat: 'Switches', name: 'Toggle Switch (SPST)', sym: 'SPST Switch', pre: 'SW', kind: 'sw' },
  coil:    { cat: 'Outputs', name: 'Relay Coil', sym: 'Relay', pre: 'CR', kind: 'coil' },
  pl:      { cat: 'Outputs', name: 'Pilot Light', sym: 'Pilot Light', pre: 'PL', kind: 'load' },
  sol:     { cat: 'Outputs', name: 'Solenoid', sym: 'Solenoid', pre: 'SOL', kind: 'load' },
  htr:     { cat: 'Outputs', name: 'Heating Element', sym: 'Heating Element', pre: 'HTR', kind: 'load' },
  motor:   { cat: 'Outputs', name: 'Motor', sym: 'Motor Leads', pre: 'M', kind: 'motor' },
  con_no:  { cat: 'Contacts', name: 'NO Contact', sym: 'NO Contact', kind: 'contact', flip: 'con_nc' },
  con_nc:  { cat: 'Contacts', name: 'NC Contact', sym: 'NC Contact', kind: 'contact', flip: 'con_no' },
  mst3:    { cat: 'Contacts', name: 'Starter', sym: '3PH Starter Contacts', kind: 'starter', poles: [[0, 1], [2, 3], [4, 5]] },
  olc:     { cat: 'Contacts', name: 'OL Contact', sym: 'NC Contact', kind: 'olc' },
  dsc3:    { cat: 'Protection', name: 'Disconnect', sym: '3PH Disconnect', pre: 'DS', kind: 'power', poles: [[0, 1], [2, 3], [4, 5]] },
  fdsc3:   { cat: 'Protection', name: 'Fused Disconnect', sym: '3PH Fusible Disconnect', pre: 'DS', kind: 'power', poles: [[0, 1], [2, 3], [4, 5]] },
  fus3:    { cat: 'Protection', name: '3-Phase Fuses', sym: '3PH Fuses', pre: 'FU', kind: 'power', poles: [[0, 1], [2, 3], [4, 5]] },
  fuse:    { cat: 'Protection', name: 'Fuse', sym: 'Fuse', pre: 'FU', kind: 'fuse', poles: [[0, 1]] },
  ol3:     { cat: 'Protection', name: 'Overload', sym: '3PH Thermal Overload', pre: 'OL', kind: 'ol', poles: [[0, 1], [2, 3], [4, 5]] },
  ol:      { cat: 'Protection', name: 'Overload Heater (1 line)', sym: 'Thermal Overload', pre: 'OL', kind: 'ol', poles: [[0, 1]] },
  sup:     { cat: 'Power', name: 'Phase (L1, L2, L3)', kind: 'supply' },
  xfmr:    { cat: 'Power', name: 'Transformer', sym: 'Control Transformer', pre: 'CPT', kind: 'xfmr' },
  cnt_out: { cat: 'Continuation', name: 'Continues To (out)', sym: 'Continuation Out', kind: 'cont', flip: 'cnt_in' },
  cnt_in:  { cat: 'Continuation', name: 'Continued From (in)', sym: 'Continuation In', kind: 'cont', flip: 'cnt_out' },
};
const CATS = ['Buttons', 'Switches', 'Outputs', 'Contacts', 'Protection', 'Power', 'Continuation'];
const CAT_COL = { 'Buttons': '#00B050', 'Switches': '#0070C0', 'Outputs': '#FFC000', 'Contacts': '#c9c9c9', 'Protection': '#e5484d', 'Power': '#FF9C37', 'Continuation': '#a26bf5' };
// the motor as Circuit Builder prints it: T1, T2, T3 on its left, a line apart like the power circuit's poles, T2's
// lead straight in, T1's and T3's bending in to the circle (so its wires come in level, on the grid)
// the fused disconnect, Dallas's design drawn at the same size as the plain disconnect and a single fuse (its switch
// like a disconnect pole, its fuse like a Fuse), its poles a line apart like the other 3-phase parts
PSYM['3PH Fusible Disconnect'] = { b: '<path d="M-70 -120L-10 -150" fill="none"/><circle cx="-70" cy="-120" r="10" fill="#000" stroke="none"/><circle cx="-70" cy="-120" r="6" fill="#fff" stroke="none"/><circle cx="-10" cy="-120" r="10" fill="#000" stroke="none"/><circle cx="-10" cy="-120" r="6" fill="#fff" stroke="none"/><path d="M0 -120H14M66 -120H80" fill="none"/><rect x="14" y="-130" width="52" height="20" fill="#fff" stroke="#000" stroke-width="4"/><rect x="22" y="-130" width="36" height="20" fill="#fff" stroke="#000" stroke-width="4"/><path d="M-70 0L-10 -30" fill="none"/><circle cx="-70" cy="0" r="10" fill="#000" stroke="none"/><circle cx="-70" cy="0" r="6" fill="#fff" stroke="none"/><circle cx="-10" cy="0" r="10" fill="#000" stroke="none"/><circle cx="-10" cy="0" r="6" fill="#fff" stroke="none"/><path d="M0 0H14M66 0H80" fill="none"/><rect x="14" y="-10" width="52" height="20" fill="#fff" stroke="#000" stroke-width="4"/><rect x="22" y="-10" width="36" height="20" fill="#fff" stroke="#000" stroke-width="4"/><path d="M-70 120L-10 90" fill="none"/><circle cx="-70" cy="120" r="10" fill="#000" stroke="none"/><circle cx="-70" cy="120" r="6" fill="#fff" stroke="none"/><circle cx="-10" cy="120" r="10" fill="#000" stroke="none"/><circle cx="-10" cy="120" r="6" fill="#fff" stroke="none"/><path d="M0 120H14M66 120H80" fill="none"/><rect x="14" y="110" width="52" height="20" fill="#fff" stroke="#000" stroke-width="4"/><rect x="22" y="110" width="36" height="20" fill="#fff" stroke="#000" stroke-width="4"/><rect x="-42" y="-135" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-125" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-115" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-105" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-95" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-85" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-75" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-65" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-55" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-45" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-35" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-25" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-15" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="-5" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="5" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="15" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="25" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="35" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="45" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="55" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="65" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="75" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="85" width="4" height="6" fill="#000" stroke="none"/><rect x="-42" y="95" width="4" height="6" fill="#000" stroke="none"/>', t: [[-80, -120], [80, -120], [-80, 0], [80, 0], [-80, 120], [80, 120]], y0: -155, y1: 135 };
// relay coils as wide as a contact (80, terminal to terminal), so they don't look small beside them
PSYM.Relay = { b: '<circle cx="0" cy="0" r="40" fill="#000" stroke="none"/><circle cx="0" cy="0" r="36" fill="#fff" stroke="none"/>', t: [[-40, 0], [40, 0]], y0: -40, y1: 40 };
// continuation arrows (off-page connectors): a wire that carries on elsewhere (another sheet, or further down this
// one) ends in an arrow with a letter in it, and starts again from an arrow with the same letter. Out: the wire comes
// in from the left and the arrow points on; In: the arrow points into the wire, which goes on to the right.
PSYM['Continuation Out'] = { b: '<path d="M-40 0H-26" fill="none"/><path d="M-26 -22H14L36 0L14 22H-26Z" fill="#fff"/>', t: [[-40, 0]], y0: -22, y1: 22 };
PSYM['Continuation In'] = { b: '<path d="M26 0H40" fill="none"/><path d="M-36 -22H4L26 0L4 22H-36Z" fill="#fff"/>', t: [[40, 0]], y0: -22, y1: 22 };
PSYM['Motor Leads'] = { b: PSYM.Motor.b + '<path d="M-140 -120H-120L-42.426 -42.426M-140 0H-60M-140 120H-120L-42.426 42.426" fill="none"/>', t: [[-140, -120], [-140, 0], [-140, 120]], y0: -124, y1: 124 };
// a coil's kinds: the start of its tag
const COIL_PRE = [['CR', 'Control Relay'], ['M', 'Starter'], ['TR', 'Timer'], ['CON', 'Contactor']];
// the line-in arrow: its one terminal at its middle, the arrow pointing into it from the left
const SUP_T = [[0, 0]];
// a device's own terminals (its symbol's, or the line-in arrow's), before it is turned
const termsOf = t => t === 'sup' ? SUP_T : PSYM[LIB[t].sym].t;
// how far its drawing reaches either side of its middle, and above and below (for picking it, and its labels)
function extentOf(t) {
  if (t === 'sup') return { x0: -70, x1: 4, y0: -20, y1: 20 };
  const s = PSYM[LIB[t].sym], xs = s.t.map(p => p[0]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (t === 'motor') { x0 = -140; x1 = 66; }
  if (t === 'xfmr') { x0 = -64; x1 = 64; }
  return { x0, x1, y0: s.y0, y1: s.y1 };
}
// the poles a device carries a line through (a two-ended device: its two ends)
const polesOf = t => LIB[t].poles || (termsOf(t).length === 2 ? [[0, 1]] : []);
// the tags a device carries: a block of three fuses, one for each fuse (FU1 → FU1, FU2, FU3)
function tagsOf(p) {
  const three = t => { const r = /^(\D+)(\d+)$/.exec(t || ''); return r ? [0, 1, 2].map(i => r[1] + (+r[2] + i)) : [t]; };
  if (p.t === 'fus3') return three(p.tag);
  if (p.t === 'fdsc3') return [p.tag, ...(p.fu ? three(p.fu) : [])];   // (a fused disconnect: DS1, and its fuses FU1-FU3)
  return [p.tag];
}
const isPowerKind = k => k === 'power' || k === 'ol' || k === 'starter' || k === 'motor' || k === 'supply';
