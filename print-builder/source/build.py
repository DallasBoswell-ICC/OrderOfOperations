#!/usr/bin/env python3
"""Build Print Builder into one self-contained HTML file: dist/Print_Builder.html.

    python3 build.py           the full build: dist/Print_Builder.html (goes on the site as print-builder/index.html)
    python3 build.py --demo    the demo build: dist/demo/Print_Builder.html (print-builder/demo/index.html), where new
                               features are tried out first. It is the same program marked DEMO (title bar, window title,
                               green-banded icon), keeping its own autosave and settings and installing as an app of its own.

The source lives in src/: index.html (the page), style.css, and the JavaScript in src/js/, split by job.
The built file needs no server, no internet connection and nothing installed. Next to it go the app icons
(dist/icons) and dist/print-builder.webmanifest, for installing it from the website as an app.
"""
from pathlib import Path
import shutil
import sys
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DEMO = "--demo" in sys.argv[1:]
OUT = ROOT / "dist" / ("demo" if DEMO else "") / "Print_Builder.html"

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
    "keys.js",       # the keyboard shortcuts: which key does what (changeable, kept in this browser), and the F1 box
    "shell.js",      # Print Preview, tooltips, folding the ribbon, full screen, dropping a file in; then starts it all
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
    icon = "data:image/svg+xml," + quote(" ".join((SRC / "icons" / "pb-favicon.svg").read_text(encoding="utf-8").split()), safe=" =:/'(),")
    if DEMO:
        icon = "data:image/svg+xml," + quote(" ".join((SRC / "icons-demo" / "pbd-favicon.svg").read_text(encoding="utf-8").split()), safe=" =:/'(),")
        js = js.replace("'oo-print-builder:", "'oo-print-builder-demo:")
        page = page.replace("<title>Print Builder</title>", "<title>Print Builder (Demo)</title>")
        page = page.replace("<h1>Order of Operations: <span>Print Builder</span></h1>", '<h1>Order of Operations: <span>Print Builder</span> <em class="demo-badge" title="The demo build: new features are tried out here before they go into the full Print Builder">DEMO</em></h1>')
        page = page.replace("icons/pb-", "icons/pbd-").replace('<meta name="theme-color" content="#1c1d1f">', '<meta name="theme-color" content="#9be03a">')
        css += "\n.demo-badge { font-style: normal; font-size: .7rem; font-weight: 800; letter-spacing: .08em; color: #1c1d1f; background: #9be03a; border-radius: 5px; padding: 2px 7px; margin-left: 6px; vertical-align: 2px; }\n"
        if "oo-print-builder-demo:" not in js or "'oo-print-builder:" in js or "DEMO</em>" not in page:
            raise SystemExit("The demo build could not mark itself (has the title or a storage key changed?)")
    page = page.replace("%ICON%", icon).replace("%CSS%", css).replace("%JS%", js)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    # the app icons and the web app manifest go next to it (for the website: installing it as an app)
    icons = OUT.parent / "icons"
    if icons.exists():
        shutil.rmtree(icons)
    shutil.copytree(SRC / ("icons-demo" if DEMO else "icons"), icons)
    man = (SRC / "print-builder.webmanifest").read_text(encoding="utf-8")
    if DEMO:   # (installed as an app of its own, with its own name, colour and icons)
        man = (man.replace('"Order of Operations: Print Builder"', '"Order of Operations: Print Builder (Demo)"')
                  .replace('"short_name": "Print Builder"', '"short_name": "Print Builder Demo"')
                  .replace('"id": "./?app=print-builder-2"', '"id": "./?app=print-builder-demo"')
                  .replace('"theme_color": "#1c1d1f"', '"theme_color": "#9be03a"').replace("icons/pb-", "icons/pbd-"))
        if "Demo" not in man or "pbd-" not in man or "print-builder-demo" not in man:
            raise SystemExit("The demo build could not mark its manifest")
    (OUT.parent / "print-builder.webmanifest").write_text(man, encoding="utf-8")
    return OUT


if __name__ == "__main__":
    out = build()
    print(f"Built {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
