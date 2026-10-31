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
// loads: things current passes through to L2 (a relay coil, or a pilot light). They are the same size and are
// passed through the same way; only a coil works contacts
const LOADT = t => t === 'coil' || t === 'lamp';
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
const isSw = p => p.t === 'btn' || p.t === 'con' || p.t === 'sel';   // things that pass current or not: pushbuttons and relay contacts   // a part's ends sit this far either side of its centre
