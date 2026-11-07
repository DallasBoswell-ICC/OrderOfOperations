#!/usr/bin/env python3
"""Build Print Builder into one self-contained HTML file: dist/Print_Builder.html.

The source lives in src/: index.html (the page), style.css, and the JavaScript in src/js/, split by job.
The built file needs no server, no internet connection and nothing installed. Next to it go the app icons
(dist/icons) and dist/print-builder.webmanifest, for installing it from the website as an app.
"""
from pathlib import Path
import shutil
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "Print_Builder.html"

# The scripts run in this order (later files use things defined in earlier ones).
MODULES = [
    "psym.js",       # the print symbols (Dallas's Symbol Design set, redrawn for the print), shared with Circuit Builder
    "symbols.js",    # the library: every device that can be placed, its tag, its kind, its poles
    "model.js",      # the print: sheets, parts, wires, nodes; putting down, joining, moving, taking away; undo
    "nets.js",       # reading the drawing: nets, wire numbers, rung numbers, cross-references
    "check.js",      # Check Print
    "render.js",     # drawing a sheet and its title block, as it prints
    "templates.js",  # ready-made prints
    "editor.js",     # the tools, picking and the editor's marks
    "clipboard.js",  # copy, cut and paste
    "ui.js",         # the window round it: ribbon, palette, properties, sheets, title block, zoom, files, printing
]


def build() -> Path:
    page = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    present = sorted(p.name for p in (SRC / "js").glob("*.js"))
    missing = sorted(set(present) - set(MODULES))
    if missing:
        raise SystemExit(f"These scripts are not listed in MODULES in build.py: {', '.join(missing)}")
    js = "\n".join(f"/* ---- js/{n} ---- */\n" + (SRC / "js" / n).read_text(encoding="utf-8") for n in MODULES)
    if "</script" in js.lower():
        raise SystemExit("A script contains </script, which would end the page's <script> early")
    icon = "data:image/svg+xml," + quote(" ".join((SRC / "icons" / "pb-icon.svg").read_text(encoding="utf-8").split()), safe=" =:/'(),")
    page = page.replace("%ICON%", icon).replace("%CSS%", css).replace("%JS%", js)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    # the app icons and the web app manifest go next to it (for the website: installing it as an app)
    icons = OUT.parent / "icons"
    if icons.exists():
        shutil.rmtree(icons)
    shutil.copytree(SRC / "icons", icons)
    shutil.copy(SRC / "print-builder.webmanifest", OUT.parent / "print-builder.webmanifest")
    return OUT


if __name__ == "__main__":
    out = build()
    print(f"Built {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
