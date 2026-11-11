# O³ Print Builder

Draw official-looking ladder wire diagrams (control and power) on letter sheets: symbols dropped onto rungs,
wire numbers, rung numbers and cross-references filled in automatically, Check Print, an editable title block.

    python3 build.py                 builds dist/Print_Builder.html (one self-contained file)
    python3 build.py --demo          builds the demo: dist/demo/Print_Builder.html
    node tests/run-tests.js          runs the checks (needs Playwright)

The print symbols (src/js/psym.js) are shared with Circuit Builder.

## Two builds: demo and full

As with Circuit Builder, new features go into the **demo** first and only reach the full Print Builder when Dallas
says so ("push it to main").

- Full: https://dallasboswell-icc.github.io/OrderOfOperations/print-builder/ (print-builder/index.html)
- Demo: https://dallasboswell-icc.github.io/OrderOfOperations/print-builder/demo/ (print-builder/demo/index.html)

The demo is marked DEMO in its title bar and window title, has its own green-banded icon (src/icons-demo), installs
as an app of its own, and keeps its own autosave and settings (its storage keys start `oo-print-builder-demo:`).

The source here is always the demo's. The full page was last built from commit cfb345e (11 Nov 2026); update this
line when the demo is promoted. To promote: build without `--demo`, run the checks, copy dist/Print_Builder.html to
print-builder/index.html (and dist/icons, dist/print-builder.webmanifest beside it), save a backup of the old page
first if asked, then update the commit named above.

Before every push to main, save the live page and its source in `backups/YYYY-MM-DD/print-builder/` (Print_Builder.html plus Print_Builder_source.zip) and check the source rebuilds it exactly.

Checks: `node tests/run-tests.js` tests dist/Print_Builder.html; `node tests/run-tests.js --demo` tests the demo build.
