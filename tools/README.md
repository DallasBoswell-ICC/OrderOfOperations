# Tools

Helper scripts for working on the O³ programs. Run them from anywhere; they
find the repo root themselves. They need Python 3, Node and Playwright (set
`PLAYWRIGHT_BROWSERS_PATH` and `NODE_PATH` if yours aren't in the defaults in
`env.sh`).

| Script | What it does |
|---|---|
| `tools/t.sh` | Builds CB and PB (demo and main) and runs the CB and PB demo tests. |
| `tools/tl.sh "<filter>"` | Builds the demos and runs only the CB checks whose names match the filter. |
| `tools/pub.sh` | Builds every demo, copies it into `demo/`, `print-builder/demo/` and `fault-finder/demo/`, runs the Fault Finder demo tests and shows `git status`. Main pages are never touched. |
| `tools/dbg.js` | Opens the PB and CB demo builds in a headless browser and runs a snippet (`module.exports = async (pb, cb, fs, R) => {…}`). `CB_OLD=<old checkout>` loads an older CB build to compare against. |

"Push to demo" = `tools/pub.sh`, check every test passes, then commit and push.
Pushing the main pages is a separate step, done only when asked, with a backup
in `backups/YYYY-MM-DD/` first.
