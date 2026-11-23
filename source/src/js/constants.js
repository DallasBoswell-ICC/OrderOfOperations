/* =====================================================================
   Circuit Builder: buttons, coils and wires on a panel. Power enters at the left edge (L1) and
   leaves at the right edge (L2), as in the Order of Operations simulators.
   ===================================================================== */
/* The page exactly as it was loaded, before anything on it changed: saved again, with a circuit built in, as a
   locked simulator (see storage.js). And, in a locked simulator, the circuit built into it (LOCKED). */
const PAGE_HTML = (() => { try { return '<!doctype html>\n' + document.documentElement.outerHTML; } catch (_) { return ''; } })();
/* The Troubleshooter (build.py --ts): this same program as a page of its own, Run only, where students find and fix
   the faults planted in a circuit (see troubleshooter.js and ts-meter.js). LOCKOUT: the circuit locked out (every
   disconnect open and the control supply off), as it must be before the ohmmeter or the continuity tester is used. */
const TS_MODE = false;
let LOCKOUT = false, TS_BLOWN = {}, TS_PUSHED = {};   // (TS_PUSHED: what is forced on by hand while locked out: relays by letter, switches by 's:' and their key)
// (TS_BLOWN: the fuses that have blown, by id: they stay blown till replaced)
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
const PALETTE = [['Red', '#FF0032'], ['Orange', '#FF9600'], ['Yellow', '#FFDC00'], ['Green', '#00B050'], ['Lime', '#99E600'], ['Teal', '#00D2BE'],
  ['Blue', '#0070C0'], ['Violet', '#7030A0'], ['Magenta', '#EC008C'], ['White', '#FFFFFF']];
const ESTOP_COL = '#E3001B', ESTOP_PLATE = '#FFC800';   // (an emergency stop: its red mushroom head, its yellow legend plate)
const BTN_COL = { A: '#FF0032', B: '#0070C0', C: '#00B050', D: '#FF9600', E: '#00D2BE', F: '#7030A0', G: '#EC008C', H: '#FFDC00' };
const COIL_COL = { X: '#FFDC00', Y: '#EC008C', Z: '#7030A0', W: '#00D2BE' };
const ALL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// the letters buttons, selector switches and coils are given: A to Z, then AA, AB ... ZZ (so a 27th is never left without one)
const LETTERS = [...ALL, ...[...ALL].flatMap(a => [...ALL].map(b => a + b))];
// (the letters a drop-down offers: A to Z, every letter in use, and the next few free ones after Z)
const letterChoices = () => { const used = new Set(parts.map(p => p.L)), out = [...ALL]; let spare = 0;
  for (const c of LETTERS.slice(26)) { if (used.has(c)) out.push(c); else if (spare < 4) { out.push(c); spare++; } }
  return out; };
const CON_H = BOX;                   // a relay contact's box is square, the size of a button's (room for a timed contact's arrow)
const CT = 0.2, SWING = 0.4;         // relay contacts start to move this long after their coil changes, and take this long to swing
const OPEN_LIFT = 15, BLADE_GREY = '#a6a6a6';   // how far an open contact's bar lifts off its posts
// loads: things current passes through to L2 (a relay coil, a pilot light or a solenoid). They take the same room and
// are passed through the same way; only a coil works contacts. A solenoid works something outside the circuit (a
// pneumatic or hydraulic valve): it is numbered (SOL1, SOL2 ...) rather than lettered, and solOn says if it has pulled in
const LOADT = t => t === 'coil' || t === 'lamp' || t === 'sol' || t === 'htr' || t === 'xfm';
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
const DSC_HEAD = 50, DSC_HANDLE = '#E8413C', DSC_DOWN = 120 + 118;   // (a disconnect's handle (Dallas, 22 Nov 2026, option A: below its poles, in its body, as a circuit breaker's; its body
// reaching DSC_DOWN below its middle))
const PWR_DY = 120, PWR_H = 2 * PWR_DY + 66, MTR_W = 280, MTR_H = 280, MTR_COL = '#9aa7b5', OL_COL = '#FF6F59', DSC_COL = '#c9d2dd', FUS_COL = '#c8c8c8';
const halfW = t => t === 'xfm' ? XFM_W / 2 : t === 'mtr' ? MTR_W / 2 + 20 : t === 'tsw' ? TSW_T : WIDE(t) ? 60 : 40, halfH = t => t === 'xfm' ? XFM_H / 2 : t === 'psw' ? PSW_UP : t === 'fsw' ? FSW_UP : t === 'lsw' || t === 'tsw' ? LSW_S / 2 : t === 'tgl' ? TGL_BOT : t === 'dpd' ? DPD_BOT : t === 'tps' ? TPS_BOT : t === 'cbd' ? CBD_BOT : t === 'cbt' ? CBT_BOT : t === 'sp2' || t === 'xov' || t === 'dps' ? SP2_BOT : t === 'mtr' ? MTR_H / 2 : t === 'dsc' ? DSC_DOWN : isPwrT(t) ? PWR_H / 2 : 40;   // (the room a part takes)
const SOL_COL = '#00D2BE';
/* a solenoid (as on Dallas's drawing): a diamond (a rounded square on its corner) as tall and wide as a coil, with a
   dot at each end where the rung comes in, joined by the lightning bolt: along the rung, up to a peak, straight down and
   back up to the rung. Sizes in units, centred on 0, 0: SOL_DIAMOND the diamond's side and corner radius, SOL_DOT the
   dots' centers and radius, SOL_BW the bolt's width, SOL_X where it leaves the rung, SOL_P its peak. */
const SOL_S = 82.296, SOL_SIDE = SOL_S / 2 / .6325, SOL_RAD = SOL_SIDE * .18;
const SOL_GREY = '#575757';   // (its bolt, not pulled in: the grey a coil's middle shows)
const SOL_DOT = 25.05, SOL_DR = 6.75, SOL_BW = 6.8, SOL_X = 11.4, SOL_P = 22.6;
// the bolt between the dots' centres (its shape), and the way the current fills it from one end (SOL_D[0] from the
// left, [1] from the right: from the outer edge of one dot to the outer edge of the other), and that way's length
const SOL_BOLT = `M ${-SOL_DOT} 0 H ${-SOL_X} L 0 ${-SOL_P} V ${SOL_P} L ${SOL_X} 0 H ${SOL_DOT}`;
const SOL_D = [1, -1].map(k => `M ${-k * (SOL_DOT + SOL_DR)} 0 H ${-k * SOL_X} L 0 ${-k * SOL_P} V ${k * SOL_P} L ${k * SOL_X} 0 H ${k * (SOL_DOT + SOL_DR)}`);
/* A heating element (htr): the solenoid's diamond and dots, the resistor's zigzag (three peaks each way) in place of its
   bolt; red; glowing while it is energized. Numbered HTR1, HTR2... It heats a temperature process value (p.pv) at
   p.rate a minute while energized, and the value drifts back to where it started at p.cool a minute while it is off. */
const HTR_COL = '#FF0032', HTR_X = 17, HTR_A = 14, HTR_N = 3;
const HTR_PTS = (() => { const q = [[-SOL_DOT, 0], [-HTR_X, 0]]; for (let k = 1; k <= 2 * HTR_N; k++) q.push([-HTR_X + k * 2 * HTR_X / (2 * HTR_N + 1), k % 2 ? -HTR_A : HTR_A]); q.push([HTR_X, 0], [SOL_DOT, 0]); return q; })();
const HTR_BOLT = 'M ' + HTR_PTS.map(q => q.map(n => +n.toFixed(2)).join(' ')).join(' L ');
const HTR_D = [1, -1].map(k => { const q = HTR_PTS.map(([a, b]) => [k * a, b]); q[0][0] = -k * (SOL_DOT + SOL_DR); q[q.length - 1][0] = k * (SOL_DOT + SOL_DR); return 'M ' + q.map(z => z.map(n => +n.toFixed(2)).join(' ')).join(' L '); });
const HTR_LEN = HTR_PTS.reduce((s, q, i) => i ? s + Math.hypot(q[0] - HTR_PTS[i - 1][0], q[1] - HTR_PTS[i - 1][1]) : s, 0) + 2 * SOL_DR;
const isSolT = t => t === 'sol' || t === 'htr';   // (drawn as a solenoid is)
const SOL_LEN = 2 * (SOL_DOT + SOL_DR - SOL_X) + 2 * Math.hypot(SOL_X, SOL_P) + 2 * SOL_P;
// a selector switch: a square body a little larger than a pushbutton's (room for its position numbers round the top)
const SEL_BOX = 80;
const WIDE = t => LOADT(t) || t === 'sel' || t === 'lsw' || t === 'psw' || t === 'fsw' || t === 'flt' || t === 'tgl' || t === 'sp2' || t === 'xov' || t === 'dps' || t === 'tps' || t === 'dpd' || t === 'cbk' || t === 'cbd' || t === 'cbt';                // parts whose ends sit 60 either side of their centre
const BODYH = t => t === 'lsw' || t === 'tsw' || t === 'psw' || t === 'fsw' || t === 'flt' || t === 'tgl' || t === 'sp2' || t === 'xov' || t === 'dps' || t === 'tps' || t === 'dpd' || t === 'cbk' || t === 'cbd' || t === 'cbt' ? LSW_S : t === 'xfm' ? XFM_H : t === 'mtr' ? MTR_H : isPwrT(t) ? PWR_H : LOADT(t) ? COIL : t === 'sel' ? SEL_BOX : BOX;         // how tall a part's body is
const TERM = p => p.t === 'stand' ? Math.max(40, ...(p.st || []).map(q => Math.abs(q[0]))) : p.t === 'mtr' ? MTR_W / 2 + 20 : p.t === 'tsw' ? TSW_T : WIDE(p.t) ? 60 : 40;
// how far a part's short leads reach in from its ends: to its body's edge (a wide part's body, as limit and toggle switches
// and the circuit breaker have, is 110 across, inside its ends 60 out; never past its ends, or the current would come
// out late, painted out over the wire (Dallas, 22 Nov 2026))
const LEADH = p => p.t === 'tsw' ? TSW_HALF : WIDE(p.t) ? Math.min(BODYH(p.t) / 2, TERM(p) - 5) : BODYH(p.t) / 2;
const HILO = t => t === 'tsw' || t === 'psw' || t === 'fsw' || t === 'flt';   // (switches made in high and low kinds: temperature, pressure, flow, float; Dallas, 20 Nov 2026)
const isOp = p => p.t === 'btn' || p.t === 'sel' || p.t === 'lsw' || p.t === 'tsw' || p.t === 'psw' || p.t === 'fsw' || p.t === 'flt' || p.t === 'tgl' || isTglN(p) || (p.t === 'pp' && !!p.x && isTglN(p.x));   // (an SPDT's two ways through: each tints the current as the switch does)
/* A temperature switch (tsw): numbered (TS1, TS2...), the limit switch's body without its head, the NEMA temperature
   switch's stepped stem under its blade, and joined to its right side a sensing bulb's box with a thermometer in it.
   For now it is worked as a limit switch is (as a momentary pushbutton), by its own key (opKey: 'T' and its number,
   so TS1 and LS1 are two switches); the thermometer rises as it is worked and falls back as it is let go. NO or NC. */
const TSW_COL = '#FF0032', TSW_T = 80, TSW_SB = 30, TSW_HALF = 70;   // (its ends; its bulb box's width; how far out its body and box reach)
/* A pressure switch (psw, Dallas's design): numbered (PS1, PS2...), the limit switch's body with, on a neck on top, a
   pressure gauge, and under its blade the NEMA pressure switch's diaphragm and stem, which push the blade up as the
   pressure rises. Worked for now as a limit switch is, by its own key ('P' and its number). NO or NC. */
const PSW_COL = '#FF9C37', PSW_UP = 116;   // (its colour; how far its gauge reaches above the wire)
/* A flow switch (fsw, Dallas's design, 15 Nov 2026): numbered (FLS1, FLS2...), the limit switch's body with, on a neck
   and two supports on top, a length of pipe with flanged ends; up into the pipe from its bottom wall, a flexible strip
   with a rectangular paddle on its end, which the water bends over downstream. Under the blade, fixed to it (as the
   temperature switch's stem is), the NEMA flow switch's stem and flag. The pipe is always full of water; streaks drift
   through it, gathering speed, while it flows. Worked by hand as a limit switch is, or by a Flow value; its own key
   ('W' and its number). NO or NC. */
const FSW_COL = '#9B6BFF', FSW_UP = 96;   // (its colour, violet; how far its pipe reaches above the wire)
/* A float switch (flt, Dallas's design A, 20 Nov 2026): numbered (FS1, FS2...), the limit switch's body with, on the flow
   switch's neck and supports, a small steel tank with a glass front; in it, a float on an arm hinged on the tank's left
   wall, riding the water. Under the blade, as the pressure switch's diaphragm is, the NEMA float switch's stem and round
   float, upright, rising to push the blade. Worked by hand as a limit switch is, or by a Level value (the water in the tank
   shows it). NO or NC; aqua. */
const FLT_COL = '#16C1E8', FLT_UP = 113;
const TGL_COL = '#99E600', TGL_BOT = 130, SP2_TOP = 108, SP2_BOT = 180, SP2_DY = 60, DPD_DY = 180, DPD_BOT = 360, TPS_TOP = 168, TPS_BOT = 240, CBK_TOP = 60, CBK_BOT = 150, CBK_COL = '#c8c8c8', CBD_TOP = 120, CBD_BOT = 210, CBT_TOP = 180, CBT_BOT = 270, XOV_C = 30;   // (a crossover's contacts: 30 either side of its middle, 60 apart across, 120 up and down)   // (an SPDT: its throws 60 above and below its common (Dallas, 21 Nov 2026: 6 squares apart))   // (a toggle switch, SPST (Dallas, 21 Nov 2026): its colour, lime green (Dallas, 21 Nov 2026); how far its body reaches below the wire)   // (its colour, aqua; how far its tank reaches above the wire)
const isLim = p => p.t === 'lsw' || p.t === 'tsw' || p.t === 'psw' || p.t === 'fsw' || p.t === 'flt' || p.t === 'tgl' || p.t === 'cbk' || p.t === 'cbd' || p.t === 'cbt' || isTglN(p), opKey = p => p.t === 'pp' && p.x ? opKey(p.x) : p.t === 'sp2' ? '#H' + p.L : p.t === 'xov' ? '#X' + p.L : p.t === 'dps' ? '#D' + p.L : p.t === 'dpd' ? '#E' + p.L : p.t === 'tps' ? '#T' + p.L : isBrk(p) ? '#B' + p.L : p.t === 'tsw' ? 'T' + p.L : p.t === 'psw' ? 'P' + p.L : p.t === 'fsw' ? 'W' + p.L : p.t === 'flt' ? '#F' + p.L : p.t === 'tgl' ? '#G' + p.L : p.L;
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
// (Dallas, 19 Nov 2026: every two-ended part turns too, a quarter turn at a time, as in Print Builder: drawn turned about its middle,
// its name upright. Boxes and a single fuse keep their turn where they always have (a[7]); the others at a[15], { r })
const turns7 = p => isBox(p) || p.t === 'fu1' || p.t === 'gnd';
/* Ground (Dallas, 22 Nov 2026, design B2): a box like the supply boxes, green-edged, with a GND badge and Dallas's ground
   symbol in it, wired from one end (its top, turned like the boxes). It is the earth: 0 V, the neutral bonded to it, and a
   transformer's grounded terminal too. It carries no current of its own in the circuit (it is for the meter, and to draw). */
const isGnd = p => p.t === 'gnd', GND_COL = '#3FBF5F';
/* A control transformer (Dallas, 22 Nov 2026): its primary's rating (p.pr: '480', '240', '208' or '120'; none: it matches
   whatever it's wired across), its secondary 120 V when it gets that (in proportion when it gets more or less: a 480 V
   primary on 208 V gives 52 V), or 120/240 V centre-tapped (p.ct: X1, X0 and X2, X0 the middle); its secondary grounded,
   X2 (or X0), unless p.ug. Its secondary is isolated from its primary. */
const XFM_PR = ['480', '240', '208', '120'];
const twoEnded = p => !isBox(p) && !isPwr3(p) && p.t !== 'xfm' && p.t !== 'mtr' && p.t !== 'stand' && p.t !== 'gnd' && !isMulti(p);
const flips = p => p.t === 'tgl' || isTglN(p);
const isBrk = p => p.t === 'cbk' || p.t === 'cbd' || p.t === 'cbt';   // (a circuit breaker: single, DPST or 3PST)
const isMulti = p => isTglN(p) || p.t === 'cbd' || p.t === 'cbt';   // (the parts with more than two ends that switch: the toggle switches below, and a DPST or 3PST circuit breaker; each run as its poles)
const isTglN = p => p.t === 'sp2' || p.t === 'xov' || p.t === 'dps' || p.t === 'dpd' || p.t === 'tps';   // (the toggle switches with more than two ends: an SPDT, a crossover, a DPST, a DPDT)
// (how far a part's body reaches above and below its wire: the toggle switches reach further down than up)
const bodyUp = p => p.t === 'dsc' ? PWR_H / 2 : p.t === 'cbk' ? CBK_TOP : p.t === 'cbd' ? CBD_TOP : p.t === 'cbt' ? CBT_TOP : p.t === 'tps' ? TPS_TOP : isTglN(p) ? SP2_TOP : p.t === 'tgl' ? LSW_TOP : BODYH(p.t) / 2, bodyDown = p => p.t === 'dsc' ? DSC_DOWN : p.t === 'cbk' ? CBK_BOT : p.t === 'cbd' ? CBD_BOT : p.t === 'cbt' ? CBT_BOT : p.t === 'tps' ? TPS_BOT : p.t === 'dpd' ? DPD_BOT : isTglN(p) ? SP2_BOT : p.t === 'tgl' ? TGL_BOT : BODYH(p.t) / 2;   // (toggle switches mirror left to right: Dallas, 21 Nov 2026)
// the room a part takes above and below its middle, and whether two parts' rooms meet (Dallas, 22 Nov 2026: a toggle switch's
// body reaches far further below its wire than above it, a DPDT's 360 below to 108 above, so its room is counted as it is, not
// as the most of the two either way, which kept it 360 off parts above it as well)
const isTglT = t => t === 'tgl' || t === 'sp2' || t === 'xov' || t === 'dps' || t === 'tps' || t === 'dpd' || t === 'cbk' || t === 'cbd' || t === 'cbt';
const roomUp = t => isTglT(t) ? bodyUp({ t }) + 20 : t === 'dsc' ? PWR_H / 2 + 20 : halfH(t),   // (and room for its name over it)
      roomDown = t => isTglT(t) ? bodyDown({ t }) : t === 'dsc' ? DSC_DOWN : halfH(t);
const vClash = (ta, ya, tb, yb) => ya - roomUp(ta) < yb + roomDown(tb) && yb - roomUp(tb) < ya + roomDown(ta);
const turns = p => turns7(p) || twoEnded(p), vert = p => (p.t === 'fu1' || twoEnded(p)) && !!((p.rot || 0) & 1);
/* Three-phase power: an L1, L2 or L3 phase box (p.L '1', '2' or '3'), built like a supply box, every connection point
   of it that phase. Each phase has its own colour (each circuit keeps its own; brown, orange and yellow, as on 480 V).
   Every box turns, a quarter turn at a time (p.rot), as a continuation does. */
const isPh = p => p.t === 'ph';
const PH_PAL = [['Black', '#6E6E6E'], ['Brown', '#B5793F'], ['Orange', '#FF8A1F'], ['Yellow', '#F2D21B'], ['Red', '#E8413C'], ['Blue', '#3F7FFF'], ['Violet', '#A66BFF'], ['Gray', '#9AA0A6'], ['White', '#E8E8E8']];
const PH_DEFAULT = ['#B5793F', '#FF8A1F', '#F2D21B'];
let PH_COL = [...PH_DEFAULT];
/* The voltage system (Dallas, 22 Nov 2026): what the phase boxes are, set from a preset for the whole circuit (Power menu;
   saved as vs; a circuit saved before there was a choice is 480Y/277, as it always was). Each phase is a fixed voltage to
   the neutral and a fixed angle (no swinging back and forth: only how far round each one is), so phase to phase comes out
   at 1.73 times phase to neutral in a wye, and across the two legs of a split-phase supply at twice it. The neutral (an N
   box) is at 0 V. Black is shown as a charcoal grey, so it can be told from a dead wire (Dallas). */
const VSYS_LIST = {
  '480': { name: '480Y/277 V', short: '480Y/277', ph: 3, vpn: 480 / Math.sqrt(3), ang: [0, -120, 120], col: ['#B5793F', '#FF8A1F', '#F2D21B'] },
  '208': { name: '208Y/120 V', short: '208Y/120', ph: 3, vpn: 120, ang: [0, -120, 120], col: ['#6E6E6E', '#E8413C', '#3F7FFF'] },
  '240': { name: '120/240 V Split-Phase', short: '120/240', ph: 2, vpn: 120, ang: [0, 180], col: ['#6E6E6E', '#E8413C', '#3F7FFF'] }
};
let VSYS = '208';
const NEU_COL = '#E8E8E8';
const phK = L => L === 'N' ? 4 : /^S[120]:/.test(L) ? { S1: 5, S2: 6, S0: 7 }[L.slice(0, 2)] : +L;   // (a phase box's phase as a number: L1-L3 1-3, the neutral 4; a centre-tapped transformer's X1, X2 and X0 5-7)
const phName = L => L === 'N' || L === 4 ? 'N' : L === 5 || L === 6 || L === 7 ? ['X1', 'X2', 'X0'][L - 5] : /^S[120]:/.test(L) ? { S1: 'X1', S2: 'X2', S0: 'X0' }[L.slice(0, 2)] : 'L' + L;
const phLive = k => k === 4 || (k >= 5 && k <= 7) || (k >= 1 && k <= VSYS_LIST[VSYS].ph);   // (a split-phase supply has no L3)
const phColK = k => k === 4 || k === 7 ? NEU_COL : k === 5 ? '#6E6E6E' : k === 6 ? '#E8413C' : PH_COL[k - 1];   // (a centre-tapped secondary: black, red and white, as a split-phase supply)
const phCol = p => phColK(phK(p.L) || 1);
// a phase's voltage to the neutral, as [re, im] (null: the system has no such phase)
const phVolt = k => { if (k === 4 || k === 7) return [0, 0]; if (k === 5 || k === 6) { const s = ctSecNow(); return polarV(s.mag / 2, s.ang + (k === 6 ? Math.PI : 0)); } if (!phLive(k)) return null; const s = VSYS_LIST[VSYS], a = s.ang[k - 1] * Math.PI / 180; return [s.vpn * Math.cos(a), s.vpn * Math.sin(a)]; };
const polarV = (m, a) => [m * Math.cos(a), m * Math.sin(a)];
const phAcross = (ka, kb) => { const a = phVolt(ka), b = phVolt(kb); return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0; };
const lighten = (c, f) => { const n = parseInt(c.slice(1), 16), m = k => Math.round(((n >> k) & 255) + (255 - ((n >> k) & 255)) * f); return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1).toUpperCase(); };
const JMP_EDGE = '#b8c2cf';
const isSw = p => p.t === 'btn' || p.t === 'con' || p.t === 'sel' || p.t === 'lsw' || p.t === 'tsw' || p.t === 'psw' || p.t === 'fsw' || p.t === 'flt' || p.t === 'tgl' || p.t === 'cbk' || p.t === 'xsw' || p.t === 'pp' || p.t === 'olc' || p.t === 'fu1';
/* Buttons Colour the Current (Dallas, 22 Nov 2026; Power menu, saved per circuit as bt: 0 when off): with it off, pushbuttons,
   selectors and the limit, sensing and toggle switches pass the current on as a relay contact does, in the colour it
   comes in, rather than giving it their own colour */
let TINT_OPS = true;
const tints = p => TINT_OPS && isOp(p), passes = p => isCon(p) || (isOp(p) && !TINT_OPS);
const isCon = p => p.t === 'con' || p.t === 'xsw' || p.t === 'pp' || p.t === 'olc' || p.t === 'fu1' || p.t === 'cbk';   // (a circuit breaker too: it passes on the colour it is given, Dallas 22 Nov 2026)   // (a relay contact, or a transformer's switch inside it: passes on what it is given)   // things that pass current or not: pushbuttons and relay contacts   // a part's ends sit this far either side of its centre
/* Faults (Troubleshooter, stage 1, Dallas 15 Nov 2026): planted on parts and wires in Build, they act while running
   (FAULTS_ON; it can be turned off to run the circuit as it should be). A part (switch, contact, button, fuse,
   overload contact, coil, light, solenoid, heating element) can be open (never passes current: a switch stuck open,
   an open coil, a burned-out lamp, a blown fuse) or shorted (always passes: a welded contact, a switch stuck closed; a
   shorted load joins its ends, a short circuit that blows the fuse before it). A wire can be open (broken, at its
   middle) or shorted to L2 (at its middle). p.fault / w.fault: 'open', 'short' or 'l2' (wires). WORK_ORDER: the
   symptom the instructor writes for the student (saved with the circuit). */
let FAULTS_ON = true, FAULT_BADGES = true, WORK_ORDER = '';
const FAULT_LOADS = ['coil', 'lamp', 'sol', 'htr'];
const canFault = p => !!p && (FAULT_LOADS.includes(p.t) || ['btn', 'con', 'sel', 'lsw', 'tsw', 'psw', 'fsw', 'flt', 'tgl', 'cbk', 'olc', 'fu1'].includes(p.t));
const PART_FAULTS = { open: 'Open', short: 'Shorted' }, WIRE_FAULTS = { open: 'Open (Broken)', l2: 'Shorted to L2' };
/* Scenarios (Dallas, 16 Nov 2026): one circuit, several sets of faults, each with its own work order; one is in force at
   a time (SCEN, from 0). The faults in force are the parts' and wires' own .fault; each one's faults in every scenario
   are kept in its .fz ({ scenario: fault }), brought up to date from .fault by scenSync (faults.js). FF_OFFER: what the
   Fault Finder offers a student when the circuit has more than one: a random scenario (r), a number they are given (n). */
let SCEN = 0, SCEN_N = 1, SCEN_WO = [''], FF_OFFER = { r: true, n: true };
const faultsLive = () => !editing && FAULTS_ON;
const faultOf = x => faultsLive() && x && x.fault ? x.fault : null;
