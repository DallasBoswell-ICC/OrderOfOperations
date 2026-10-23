> **On this site:** this folder is the Circuit Builder's source. The page students use is `Circuit_Builder.html` at the top of the repository: after a change, run `python3 build.py` here and copy `dist/Circuit_Builder.html` up over it.

# Order of Operations: Circuit Builder

A relay-logic circuit builder for an electrical troubleshooting class. Students place pushbuttons and coils on a panel, wire them between the L1 bar (left) and the L2 bar (right), and press **Run** to watch the current flow, tinted by the buttons it has passed through.

The file students use is **`dist/Circuit_Builder.html`**: one self-contained page that opens in any browser, offline, with nothing to install.

## Project layout

```
build.py              combines src/ into dist/Circuit_Builder.html
src/index.html        the page (toolbar, panel, settings)
src/style.css         its look
src/js/               the program, one file per job, in the order they run:
  constants.js        sizes, speeds, colours
  model.js            parts, wires and the ready-made circuits
  geometry.js         grid, part ends, panel size
  network.js          turning the drawing into connections
  colour.js           colour mixing
  sim-core.js         simulation clock and event queue
  solve.js            which way current goes (circuit solve, one-way buttons)
  engine.js           the current itself, junction by junction
  render-parts.js     drawing buttons and coils
  editor-state.js     selection and undo
  render.js           drawing the panel
  run.js              Run mode: animation, pressing buttons
  parts-edit.js       adding parts
  wires-attach.js     keeping wires attached when parts move
  wires-edit.js       drawing and tidying wires
  pointer.js          mouse and touch while building
  camera.js           zoom and pan
  toolbar.js          toolbar and keyboard shortcuts
  properties.js       the selected part's settings
  storage.js          saving and opening circuits (files, codes, kept in the browser)
  main.js             Build/Run switching and start-up
tests/run-tests.js    automatic checks
dist/                 the built page (made by build.py)
```

## Making a change

1. Edit the files in `src/`.
2. Build: `python3 build.py`
3. Check: `node tests/run-tests.js` (needs Node.js and Playwright: `npm install playwright` then `npx playwright install chromium`)
4. Commit the change with a short note of what it does.

## What the checks cover

- every ready-made circuit is wired correctly, and the small ones follow their truth tables
- "Three rungs into X": all 512 button combinations and 300 random presses, with no current flowing backward and no rung lighting another
- the D/E/F circuit: all 64 combinations; the far side of an open button never lights
- a button wired backwards (power in on its right) still works
- current flows the right way, and a stream carries on to the coil with no gap when another branch stops
- building by hand, moving parts, pulling wire ends off, sliding wires, undo, box selection, moving groups
- zoom and pan, and fitting a phone screen
- saving and opening: codes and files bring back exactly the same circuit, a damaged code is refused with a message, and the circuit survives a reload

## How it works

- **Connections.** Wires are traced point by point. Wire ends, part ends and the bars are shared points, so anything meeting there is joined. Wires that only cross are not joined, and are drawn hopping over each other.
- **Direction.** Once per run, the circuit is solved as if every button were passing current: L1 at full voltage, L2 at none. That gives every button (and coil) a direction. A button only ever passes current that way, so current never runs backward from one rung into another.
- **Speed** (Run mode). The preset buttons (¼× to 2×), or the slider for any speed from 0.1× to 300× on a log scale, snapping to ¼×, ½×, 1×, 2×, 10×, 50×, 100×, 200× and 300× when within about 13% of one (1× is 500 units a second, as in the other Order of Operations simulators). Turned right up, a change runs through the whole circuit in a blink, as in a real panel. When a busy circuit has more to do in a frame than the computer can manage, it does what it can in about 12 ms and carries on next frame, so the page never stalls.
- **Light on slow computers.** In Run mode the panel is only painted while something is changing; once a circuit settles (nothing on its way, and the last coil, light and contact has finished changing) it is left alone until a button is pressed, so an idle circuit uses no processor time. New features should keep to this: slower school laptops have to run it.
- **One button drawn more than once** (the same letter on several buttons: one operator with several contact blocks, so pressing one presses them all). Each drawing carries a chain-link badge on its top left corner, and selecting one outlines the others faintly. The first one placed is the pushbutton itself and looks normal; the others are drawn as its extra contact blocks (a dark cap with a coloured rim and letter; pressed, the rim and letter go grey, where the main one's whole cap goes grey). *Make main* in a secondary one's settings makes it the main one. A light built into the button shows on the main one only.
- **Copy, cut and paste** (Ctrl+C, Ctrl+X, Ctrl+V, or the Copy and Paste buttons). The copy goes in below everything on the panel, lined up with where it came from, and is left selected to drag into place. Pasted buttons and coils get unused letters, so the copy works by itself: a contact copied along with its coil goes with the new coil, and a light built into a copied button goes with the new button. A contact or light copied without its coil or button stays with the original. Wires that ran to L1 or L2 still do, so a copied rung is a new rung.
- **L1/L2 terminals.** Square screw terminals, a little wider than the wire channel, with combination screw heads (a slot right across for a flat screwdriver and a cross for a Phillips).
- **Icon.** O³ in gold on the dark page colour (src/icons/icon.svg). It is built into the page as the tab icon, so it shows even when the file is opened from a USB stick. On the website, `circuit-builder.webmanifest` and `icons/` sit next to `Circuit_Builder.html` (build.py copies them into dist/), so installing it from Chrome as an app gives the app that icon and the name Circuit Builder.
- **On-delay timers** (Relays → Timer (on-delay)). A timer is a relay coil with a delay in whole seconds (1 to 999, set in its settings, 5 by default): it is energized as a coil is (its cap lights), but its contacts change only once it has been energized for the whole delay, and losing power resets it at once and puts its contacts back. It is drawn as a relay coil, with its letter moved up, a black view window under the letter showing the time in the timer's colour (what it is set to while off, the whole seconds left while it times, 0 once timed out), and a square hourglass badge on its top right that lights while it is energized. Its contacts are captioned *Timed Contact*. The **Timers** switch in Run mode chooses how timers count: *Follow speed* (sped up and slowed down with everything else) or *Real time* (it counts the computer's own clock, so 10 s on it is 10 s on the wall whatever the speed, even when a slow computer cannot keep the simulation up to that speed; the readout still shows the seconds you set; switching mid-way carries on from what it has counted). The choice is remembered in the browser. While a timer only counts down, just its readout is repainted, not the whole panel. Saved as a coil with an eighth field, the delay.
- **Pilot lights** (Lights → Pilot Light). A light is wired from L1 to L2 like a coil and lights while current flows through it (it works no contacts). In its settings, *Built into* links it to a pushbutton, as in an illuminated pushbutton: the light stays wired wherever it sits in the circuit, but it also lights up that button's cap, with a glow, and the button gets a small lamp badge on its corner. A light built into a button takes the button's colour, and follows the button if its letter changes. Saved as `["lamp", x, y, buttonLetter or "", 0, 1, colour]`.
- **Long stretches.** In a real panel a change reaches the end of any wire almost at once, so the coil whose button was pressed first is in first however long its wire. Here the current is slowed right down to be watched, so a long plain stretch of wire (corners only, no junctions or parts) speeds the current up steadily toward its middle and back down. Stretches up to 400 units keep normal speed; past that the time hardly grows, so a long wire is never far behind a short one (a 3000-unit stretch takes about 1.2 s instead of 6 s) and a longer stretch never gets there sooner than a shorter one (`V_LEAD`, `V_SHORT`, `V_TAU`, `V_TOP` in constants.js). Colours arriving close together travel as a train and keep their spacing, so mixes never pull apart. On top of that, when two coils' paths are completed one after the other, the first one wins even if the other's current arrives sooner (an interlock never goes the wrong way).
- **Relay contacts.** NO and NC contacts are worked by a coil, chosen in their settings. A contact starts to move 0.2 s after its coil changes and its bar takes 0.4 s to land; it passes on the colour it is given. A coil that cannot pick up because something past it is open carries no current, so the colour waiting at it carries on through it up to the open part. When that part closes, the coil picks up at once and only its return current goes on past it. When a contact on the return side opens, the coil drops out at once and the return current already past it runs out through the contact to L2.
- **Stress test circuit** (Start from → Stress test). Every hard case at once: a master seal-in (STOP S, START A, M), forward/reverse (B → F, C → R) each needing M and locked out by the other, X with Y's NC contact behind it, the E button drawn twice, a buzzer (G → Z through its own NC contact), a cascade (J → P → Q → T) and a cross-feed (H and K into U and V). Three checks drive it: random taps against the ladder logic, button mashing that must settle back to a clean start, and random part moves that must never change the wiring.
- **Parts can't cover wires.** A part can't be moved or dropped where a wire would run across its body (it would be hidden and cut): "There is a wire in the way." A part whose end sits right on another part's end gets a wire drawn between them when either moves.
- **Toolbar.** Parts are grouped by kind (Pushbuttons, Relays); each group opens a menu of its parts, so a new kind of component is one more group in `src/index.html` (a `.pgroup` with its `.tool[data-part]` buttons) plus its drawing and behaviour. The selected part's settings sit in a slim strip under the toolbar.
- **Moving the bars.** Each bar has a handle at the top in Build mode. Dragging one shows a ghost bar where it will go, and the bar moves there when let go; held past the edge of the panel, it keeps moving outward (faster the further past) and the view follows. Moving one sets the circuit's length (saved with it as `fw`), instead of the sheet widening to fill the screen; double-clicking a handle goes back to fitting the screen.
- **Paths, like reading a ladder diagram.** Every way from L1 through a coil to L2 is listed once per run. A wire carries a button's colour wherever one of those paths runs through that button (while it passes current) and on along the wire, so a wire between two branches can carry one colour each way, and shows the mix. Ahead of a button that is not passing current, the wire waits in the colour that reached it; wire that leads nowhere stays dark.
- **Current.** Each junction passes on whatever is arriving from every run feeding it: the colours of the buttons it came through, mixed where branches meet. A change sets off a stream that travels at a fixed speed. A wire only goes dark once the last stream feeding it has passed.
- **Coils.** A coil picks up when current reaches it and it has a path through to L2, and drops out when that current is gone.

## Saved circuits

**Save** offers two ways to keep a circuit:
- a small `.json` file, to hand out as an exercise, collect from students or keep in a folder;
- a short text code (starting `OO1.`), to paste into an email, a document or a class page.

**Open** takes either one, and a file can also be dropped straight onto the panel. In Chrome and Edge, with the Circuit Builder opened as its own page, the page keeps hold of the file it opened or saved: **Save** (or Ctrl+S) writes changes straight back into that file, the file's name shows next to the Save button with ● while there are unsaved changes, and the ▾ menu offers *Save as a new file*. Other browsers, and the page inside Claude, save a new copy each time. The circuit being worked on is also kept in the browser, so it is still there after a reload.

The file format is readable JSON: `parts` is a list of `[type, x, y, letter, normallyClosed, maintained, colour]` and `wires` is a list of straight runs `[x1, y1, x2, y2]` on the 20-unit grid.
