#!/usr/bin/env python3
"""Build the Circuit Builder into one self-contained HTML file.

The source lives in src/: index.html (the page), style.css, and the JavaScript in src/js/, split by job.
This script puts them back together into dist/Circuit_Builder.html, which is the file students use: it needs
no server, no internet connection and nothing installed, so it can be opened straight from a USB stick or
a Downloads folder, or published as a web page.

    python3 build.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "Circuit_Builder.html"

# The scripts run in this order (later files use things defined in earlier ones).
MODULES = [
    "constants.js",      # sizes, speeds, colours
    "model.js",          # the circuit being built: parts, wires, ready-made circuits
    "geometry.js",       # grid, part ends, panel size, overlap checks
    "network.js",        # turning the drawing into connections (what joins what)
    "colour.js",         # colour mixing (OKLab)
    "sim-core.js",       # simulation clock, event queue, per-point colour timelines
    "solve.js",          # which way current goes (circuit solve, one-way buttons)
    "engine.js",         # the current itself, junction by junction
    "render-parts.js",   # drawing buttons and coils
    "editor-state.js",   # selection and undo
    "render.js",         # drawing the whole panel
    "run.js",            # Run mode: animation frame, painting the current, pressing buttons
    "parts-edit.js",     # adding parts
    "wires-attach.js",   # keeping wires attached when parts move; moving groups
    "wires-edit.js",     # drawing, tidying and hit-testing wires
    "pointer.js",        # mouse and touch in Build mode (drag, reshape, box select)
    "camera.js",         # zoom and pan
    "toolbar.js",        # the toolbar, Delete/Undo/Clear, keyboard shortcuts
    "properties.js",     # the selected part's settings
    "storage.js",        # saving and opening circuits (files, codes, kept in the browser)
    "main.js",           # Build/Run switching, fitting to the window, start-up
]


def build() -> Path:
    page = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    present = sorted(p.name for p in (SRC / "js").glob("*.js"))
    missing = sorted(set(present) - set(MODULES))
    if missing:
        raise SystemExit(f"These scripts are not listed in MODULES in build.py: {', '.join(missing)}")
    js = "\n".join(f"/* ---- js/{name} ---- */\n" + (SRC / "js" / name).read_text(encoding="utf-8") for name in MODULES)
    for marker, text in (("/*@@CSS@@*/", css), ("/*@@JS@@*/", js)):
        if page.count(marker) != 1:
            raise SystemExit(f"src/index.html must contain {marker} exactly once")
        page = page.replace(marker, text.rstrip("\n"))
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    return OUT


if __name__ == "__main__":
    out = build()
    print(f"Built {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
