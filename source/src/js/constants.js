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
const LOADT = t => t === 'coil' || t === 'lamp' || t === 'sol' || t === 'xfm';
/* A control transformer (T1, T2 ...): its primary (H1, H2, on top) is a load across the supply; while current goes
   through it, its secondary (X1, X2, below) is a supply of its own for a control circuit: X1 like L1, X2 like L2, joined
   to them through two switches inside it that close when the primary is fed (see network.js). The box: XFM_W by XFM_H;
   the terminals XFM_TX either side and XFM_TY above and below its middle. */
const XFM_W = 210, XFM_H = 148, XFM_TX = 60, XFM_TY = 80, XFM_EDGE = '#9aa7b5';
/* Three-phase power parts: a disconnect (dsc), fuses (fus), a starter's main contacts (mst, worked by the coil with its
   letter), overload heaters (olh), each one tall part with a pole on each of three lines PWR_DY apart; the overload's
   contact for the control circuit (olc, normally closed: it opens when the overload with its number trips); and a
   motor (mtr), with T1, T2 and T3 down its left side. */
const isPwr3 = p => p.t === 'dsc' || p.t === 'fus' || p.t === 'mst' || p.t === 'olh', isPwrT = t => t === 'dsc' || t === 'fus' || t === 'mst' || t === 'olh';
const DSC_HEAD = 50, DSC_HANDLE = '#E8413C';   // (a disconnect's head on top, with its handle)
const PWR_DY = 120, PWR_H = 2 * PWR_DY + 66, MTR_W = 280, MTR_H = 280, MTR_COL = '#9aa7b5', OL_COL = '#FF6F59', DSC_COL = '#c9d2dd', FUS_COL = '#c8c8c8';
const halfW = t => t === 'xfm' ? XFM_W / 2 : t === 'mtr' ? MTR_W / 2 + 20 : t === 'tsw' ? TSW_T : WIDE(t) ? 60 : 40, halfH = t => t === 'xfm' ? XFM_H / 2 : t === 'lsw' || t === 'tsw' ? LSW_S / 2 : t === 'mtr' ? MTR_H / 2 : t === 'dsc' ? PWR_H / 2 + DSC_HEAD : isPwrT(t) ? PWR_H / 2 : 40;   // (the room a part takes)
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
const WIDE = t => LOADT(t) || t === 'sel' || t === 'lsw';                                // parts whose ends sit 60 either side of their centre
const BODYH = t => t === 'lsw' || t === 'tsw' ? LSW_S : t === 'xfm' ? XFM_H : t === 'mtr' ? MTR_H : isPwrT(t) ? PWR_H : LOADT(t) ? COIL : t === 'sel' ? SEL_BOX : BOX;         // how tall a part's body is
const TERM = p => p.t === 'mtr' ? MTR_W / 2 + 20 : p.t === 'tsw' ? TSW_T : WIDE(p.t) ? 60 : 40;
const isOp = p => p.t === 'btn' || p.t === 'sel' || p.t === 'lsw' || p.t === 'tsw';
/* A temperature switch (tsw): numbered (TS1, TS2...), the limit switch's body without its head, the NEMA temperature
   switch's stepped stem under its blade, and joined to its right side a sensing bulb's box with a thermometer in it.
   For now it is worked as a limit switch is (as a momentary pushbutton), by its own key (opKey: 'T' and its number,
   so TS1 and LS1 are two switches); the thermometer rises as it is worked and falls back as it is let go. NO or NC. */
const TSW_COL = '#FF0032', TSW_T = 80, TSW_SB = 30, TSW_HALF = 70;   // (its ends; its bulb box's width; how far out its body and box reach)
const isLim = p => p.t === 'lsw' || p.t === 'tsw', opKey = p => p.t === 'tsw' ? 'T' + p.L : p.L;
/* A limit switch (lsw): numbered (p.L '1', '2'... : LS1, LS2), worked like a momentary pushbutton (down[p.L]) and
   tinting the current with its colour as one does. Normally open or closed (p.nc); held (p.held): actuated by the
   machine at rest, so working it lets it go. A square body, roomier than a contact's, its ends 60 either side. */
const LSW_W = 110, LSW_TOP = 41, LSW_BOT = 82, LSW_COL = '#0070C0', LSW_OPEN = 23.4;   // (its body: its width, how far above and below the wire; LSW_OPEN: how far its blade drops, open, in degrees)
const LSW_S = 2 * LSW_BOT;   // (the room it takes, up and down)   // operators: pushbuttons and selector switches (they tint the current with their colour)
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
const isJmp = p => p.t === 'jmp', isBox = p => isSrc(p) || isJmp(p) || isPh(p);
/* A single fuse (fu1): one cartridge fuse on one wire, in a box the size of a contact's. It turns a quarter turn at a
   time, as a box does, so it can sit in an upright run too (vert: turned upright) */
const FU1_COL = '#c8c8c8';   // (its silver edge)
const turns = p => isBox(p) || p.t === 'fu1', vert = p => p.t === 'fu1' && !!((p.rot || 0) & 1);
/* Three-phase power: an L1, L2 or L3 phase box (p.L '1', '2' or '3'), built like a supply box, every connection point
   of it that phase. Each phase has its own colour (each circuit keeps its own; brown, orange and yellow, as on 480 V).
   Every box turns, a quarter turn at a time (p.rot), as a continuation does. */
const isPh = p => p.t === 'ph';
const PH_PAL = [['Brown', '#B5793F'], ['Orange', '#FF8A1F'], ['Yellow', '#F2D21B'], ['Red', '#E8413C'], ['Blue', '#3F7FFF'], ['Violet', '#A66BFF'], ['Grey', '#9AA0A6'], ['White', '#E8E8E8']];
const PH_DEFAULT = ['#B5793F', '#FF8A1F', '#F2D21B'];
let PH_COL = [...PH_DEFAULT];
const phCol = p => PH_COL[(+p.L || 1) - 1];
const lighten = (c, f) => { const n = parseInt(c.slice(1), 16), m = k => Math.round(((n >> k) & 255) + (255 - ((n >> k) & 255)) * f); return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1).toUpperCase(); };
const JMP_EDGE = '#b8c2cf';
const isSw = p => p.t === 'btn' || p.t === 'con' || p.t === 'sel' || p.t === 'lsw' || p.t === 'tsw' || p.t === 'xsw' || p.t === 'pp' || p.t === 'olc' || p.t === 'fu1';
const isCon = p => p.t === 'con' || p.t === 'xsw' || p.t === 'pp' || p.t === 'olc' || p.t === 'fu1';   // (a relay contact, or a transformer's switch inside it: passes on what it is given)   // things that pass current or not: pushbuttons and relay contacts   // a part's ends sit this far either side of its centre
