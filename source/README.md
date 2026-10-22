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
- **Long stretches (switched off for now).** The speed-up on long plain stretches of wire is still in the code but switched off (`V_MAX = 1` in constants.js), so the current keeps one steady speed everywhere.
- **Relay contacts.** NO and NC contacts are worked by a coil, chosen in their settings. A contact starts to move 0.2 s after its coil changes and its bar takes 0.4 s to land; it passes on the colour it is given. A coil that cannot pick up because something past it is open carries no current, so the colour waiting at it carries on through it up to the open part. When that part closes, the coil picks up at once and only its return current goes on past it. When a contact on the return side opens, the coil drops out at once and the return current already past it runs out through the contact to L2.
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
