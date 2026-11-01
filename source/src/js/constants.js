/* =====================================================================
   Circuit Builder: buttons, coils and wires on a panel. Power enters at the left edge (L1) and
   leaves at the right edge (L2), as in the Order of Operations simulators.
   ===================================================================== */
/* The page exactly as it was loaded, before anything on it changed: saved again, with a circuit built in, as a
   locked simulator (see storage.js). And, in a locked simulator, the circuit built into it (LOCKED). */
const PAGE_HTML = (() => { try { return '<!doctype html>\n' + document.documentElement.outerHTML; } catch (_) { return ''; } })();
const LOCKED = (() => { try { const s = document.getElementById('oo-locked'); return s ? JSON.parse(s.textContent) : null; } catch (_) { return null; } })();
const W_MIN = 880;                   // narrowest the sheet gets (L1 is its left edge, x = 0; L2 its right edge, x = W: see geometry.js)
const G = 20, SUB = 5;               // grid spacing; wires are traced in 5-unit steps for smooth flow
const V = 500;                       // how fast the current front travels at 1× (units per second), as in the other Order of Operations simulators
// long plain stretches of wire carry the current faster in the middle (see stretch in engine.js): normal speed for V_LEAD
// units from either end. A stretch up to V_SHORT units long keeps normal speed; a longer one takes only a little longer
// than that (about V_TAU s more each time its length grows by V·V_TAU, ever less), up to V_TOP× normal speed
const V_LEAD = 160, V_SHORT = 400, V_TAU = 0.1, V_TOP = 80;
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
const CON_H = BOX;                   // a relay contact's box is square, the size of a button's (room for a timed contact's arrow)
const CT = 0.2, SWING = 0.4;         // relay contacts start to move this long after their coil changes, and take this long to swing
const OPEN_LIFT = 15, BLADE_GREY = '#a6a6a6';   // how far an open contact's bar lifts off its posts
// loads: things current passes through to L2 (a relay coil, a pilot light or a solenoid). They take the same room and
// are passed through the same way; only a coil works contacts. A solenoid works something outside the circuit (a
// pneumatic or hydraulic valve): it is numbered (SOL1, SOL2 ...) rather than lettered, and solOn says if it has pulled in
const LOADT = t => t === 'coil' || t === 'lamp' || t === 'sol';
const SOL_COL = '#00D2BE';
/* a solenoid (as on Dallas's drawing): a diamond (a rounded square on its corner) as tall and wide as a coil, with a
   dot at each end where the rung comes in, joined by the lightning bolt: along the rung, up to a peak, straight down and
   back up to the rung. Sizes in units, centred on 0, 0: SOL_DIAMOND the diamond's side and corner radius, SOL_DOT the
   dots' centres and radius, SOL_BW the bolt's width, SOL_X where it leaves the rung, SOL_P its peak. */
const SOL_S = 82.296, SOL_SIDE = SOL_S / 2 / .6325, SOL_RAD = SOL_SIDE * .18;
const SOL_GREY = '#575757';   // (its bolt, not pulled in: the grey a coil's middle shows)
const SOL_DOT = 25.05, SOL_DR = 6.75, SOL_BW = 6.8, SOL_X = 11.4, SOL_P = 22.6;
// the bolt between the dots' centres (its shape), and the way the current fills it from one end (SOL_D[0] from the
// left, [1] from the right: from the outer edge of one dot to the outer edge of the other), and that way's length
const SOL_BOLT = `M ${-SOL_DOT} 0 H ${-SOL_X} L 0 ${-SOL_P} V ${SOL_P} L ${SOL_X} 0 H ${SOL_DOT}`;
const SOL_D = [1, -1].map(k => `M ${-k * (SOL_DOT + SOL_DR)} 0 H ${-k * SOL_X} L 0 ${-k * SOL_P} V ${k * SOL_P} L ${k * SOL_X} 0 H ${k * (SOL_DOT + SOL_DR)}`);
const SOL_LEN = 2 * (SOL_DOT + SOL_DR - SOL_X) + 2 * Math.hypot(SOL_X, SOL_P) + 2 * SOL_P;
// a selector switch: a square body a little larger than a pushbutton's (room for its position numbers round the top)
const SEL_BOX = 80;
const WIDE = t => LOADT(t) || t === 'sel';                                // parts whose ends sit 60 either side of their centre
const BODYH = t => LOADT(t) ? COIL : t === 'sel' ? SEL_BOX : BOX;         // how tall a part's body is
const TERM = p => WIDE(p.t) ? 60 : 40;
const isOp = p => p.t === 'btn' || p.t === 'sel';   // operators: pushbuttons and selector switches (they tint the current with their colour)
/* Power: each circuit is fed either by the L1 and L2 bars down its sides (POWER 'bars', as a ladder diagram is drawn),
   or by supply boxes placed anywhere on it ('boxes'): an L1 Supply box and an L2 Return box, each with three
   connection points (left, right and bottom), every one of them L1 or L2. */
let POWER = 'bars';
/* The source's colour: the colour of the current straight from L1 (each circuit keeps its own). Every load takes away
   its share of it, down to the neutral's off-white at L2, so it's never white itself; and none of these is a button colour. */
const SRC_PAL = [['Gold', '#FFC233'], ['Sky', '#3FB8FF'], ['Lime', '#9BE03A'], ['Coral', '#FF6F59'], ['Lavender', '#B49CFF']];
const SRC_DEFAULT = SRC_PAL[0][1];
let SRC_COL = SRC_DEFAULT;
const barsOn = () => POWER === 'bars';
const isSrc = p => p.t === 'l1' || p.t === 'l2';
/* A continuation: a box like a supply box, wired from its left, right or bottom, that carries the current on to
   every other continuation with the same number, as if a wire ran between them (so a long run can be left out) */
const isJmp = p => p.t === 'jmp', isBox = p => isSrc(p) || isJmp(p);
const JMP_EDGE = '#b8c2cf';
const isSw = p => p.t === 'btn' || p.t === 'con' || p.t === 'sel';   // things that pass current or not: pushbuttons and relay contacts   // a part's ends sit this far either side of its centre
