/* =====================================================================
   Circuit Builder: buttons, coils and wires on a panel. Power enters at the left edge (L1) and
   leaves at the right edge (L2), as in the Order of Operations simulators.
   ===================================================================== */
const W_MIN = 880;                   // narrowest the sheet gets (L1 is its left edge, x = 0; L2 its right edge, x = W: see geometry.js)
const G = 20, SUB = 5;               // grid spacing; wires are traced in 5-unit steps for smooth flow
const V = 450;                       // how fast the current front travels (units per second)
const V_MAX = 1, V_LEAD = 160, V_RAMP = 220;  // speed-up on long plain stretches: switched off for now (V_MAX = 4 speeds them up to 4×)
const RAMP = 110, FADE = 160;        // colour shading after a button / from a coil back to egg
const BOX = 65.8368, BTN_IN = 43.8912, COIL = 82.296, COIL_IN = 60.3504;
const OFF_WHITE = '#ffffd7', GREY = '#404040';
const DARK_TEXT = 'rgba(28,28,28,.85)', LIGHT_TEXT = 'rgba(242,242,242,.78)';
// colours chosen to sit evenly round the colour wheel, so any two currents that meet make a clear, distinct mix
// (white mixes like white light: it pales whatever it meets)
const PALETTE = [['Red', '#FF0032'], ['Orange', '#FF9600'], ['Yellow', '#FFDC00'], ['Green', '#00B050'], ['Teal', '#00D2BE'],
  ['Blue', '#0070C0'], ['Violet', '#7030A0'], ['Magenta', '#EC008C'], ['White', '#FFFFFF']];
const BTN_COL = { A: '#FF0032', B: '#0070C0', C: '#00B050', D: '#FF9600', E: '#00D2BE', F: '#7030A0', G: '#EC008C', H: '#FFDC00' };
const COIL_COL = { X: '#FFDC00', Y: '#EC008C', Z: '#7030A0', W: '#00D2BE' };
const ALL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CON_H = 53.986176;             // a relay contact's box is as wide as a button's and a little shorter
const CT = 0.2, SWING = 0.4;         // relay contacts start to move this long after their coil changes, and take this long to swing
const OPEN_LIFT = 15, BLADE_GREY = '#a6a6a6';   // how far an open contact's bar lifts off its posts
const TERM = p => p.t === 'coil' ? 60 : 40;
const isSw = p => p.t === 'btn' || p.t === 'con';   // things that pass current or not: pushbuttons and relay contacts   // a part's ends sit this far either side of its centre
