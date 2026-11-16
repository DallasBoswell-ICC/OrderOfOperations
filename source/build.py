#!/usr/bin/env python3
"""Build the Circuit Builder into one self-contained HTML file.

The source lives in src/: index.html (the page), style.css, and the JavaScript in src/js/, split by job.
This script puts them back together into dist/Circuit_Builder.html, which is the file students use (with the app
icons in dist/icons and dist/circuit-builder.webmanifest, for installing it from the website as an app): it needs
no server, no internet connection and nothing installed, so it can be opened straight from a USB stick or
a Downloads folder, or published as a web page.

    python3 build.py           the full build: dist/Circuit_Builder.html (what students use)
    python3 build.py --demo    the demo build: dist/demo/Circuit_Builder.html, where new features are tried out first
    python3 build.py --ts      the Fault Finder (once called the Troubleshooter): dist/troubleshooter/index.html (students find and fix planted faults)
    python3 build.py --ts --demo   its demo build: dist/troubleshooter/demo/index.html

The demo build is the same program, marked DEMO in its title bar and window title, and keeping its own autosave,
settings and app install, so trying it never touches work kept in the full build (the two share a website).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DEMO = "--demo" in sys.argv[1:]
TS = "--ts" in sys.argv[1:]   # the Troubleshooter: the same program, Run only, with the meter, the work order and the test log
# the demo build carries its own icons (green, with a DEMO band) so the two builds cannot be confused
ICONS = ("icons-ts-demo" if DEMO else "icons-ts") if TS else "icons-demo" if DEMO else "icons"
IP = ("tsd-" if DEMO else "ts-") if TS else ""   # (the Troubleshooter's icon files are named ts-..., its demo's tsd-...)
OUT = (ROOT / "dist" / "troubleshooter" / ("demo" if DEMO else "") / "index.html") if TS else (ROOT / "dist" / ("demo" if DEMO else "") / "Circuit_Builder.html")

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
    "station.js",        # the operator station (every button and selector switch, floating over the panel)
    "process.js",        # process values (positions, pressures, temperatures) and the Process window
    "pictures.js",       # process pictures on the panel: under the outputs that drive them, or placed as cards
    "print-symbols.js",  # the wire diagram print's symbols (Dallas's Symbol Design set, redrawn for printing)
    "print.js",          # the wire diagram print: a NEMA ladder diagram of the circuit on letter paper
    "parts-edit.js",     # adding parts
    "wires-attach.js",   # keeping wires attached when parts move; moving groups
    "wires-edit.js",     # drawing, tidying and hit-testing wires
    "pointer.js",        # mouse and touch in Build mode (drag, reshape, box select)
    "camera.js",         # zoom and pan
    "views.js",          # columns and split view while running; full screen
    "refs.js",           # rung numbers and cross-references
    "overview.js",       # the overview strip
    "toolbar.js",        # the toolbar, Delete/Undo/Clear, keyboard shortcuts
    "clipboard.js",      # copy, cut and paste
    "properties.js",     # the selected part's settings
    "faults.js",         # planting faults (open, shorted) on parts and wires: the Faults tab
    "storage.js",        # saving and opening circuits (files, codes, kept in the browser)
    "main.js",           # Build/Run switching, fitting to the window, start-up
    "keys.js",           # the left-hand keyboard shortcuts, nudging, and the Keyboard Shortcuts box (F1)
    "ts-meter.js",       # Troubleshooter: the meter (volts from the live circuit; ohms and continuity, locked out)
    "troubleshooter.js", # Troubleshooter: its page (ribbon, work order, six steps, test log, assignments)
]


def build() -> Path:
    page = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    present = sorted(p.name for p in (SRC / "js").glob("*.js"))
    missing = sorted(set(present) - set(MODULES))
    if missing:
        raise SystemExit(f"These scripts are not listed in MODULES in build.py: {', '.join(missing)}")
    js = "\n".join(f"/* ---- js/{name} ---- */\n" + (SRC / "js" / name).read_text(encoding="utf-8") for name in MODULES)
    # the scripts sit inside the page's <script> tag: the text "</script" anywhere in them would end it early
    if "</script" in js.lower():
        raise SystemExit("A script contains </script, which would end the page's <script> early: write it <\\/script")
    # the O³ icon, built into the page as a data URL
    from urllib.parse import quote
    icon = "data:image/svg+xml," + quote(" ".join((SRC / ICONS / (IP + "favicon.svg")).read_text(encoding="utf-8").split()), safe=" =:/'(),")
    if TS:
        # the Troubleshooter: its own name and coral title, its own keys in the browser's storage, Run only
        if "const TS_MODE = false;" not in js:
            raise SystemExit("constants.js must contain const TS_MODE = false;")
        js = js.replace("const TS_MODE = false;", "const TS_MODE = true;").replace("'oo-circuit-builder:", "'oo-troubleshooter:")
        page = page.replace("<title>Circuit Builder</title>", "<title>Fault Finder</title>")
        page = page.replace("<h1>Order of Operations: <span>Circuit Builder</span></h1>", "<h1>Order of Operations: <span>Fault Finder</span></h1>")
        page = re.sub(r'<link rel="manifest"[^>]*>', '<link rel="manifest" href="troubleshooter.webmanifest?v=2">', page)
        page = re.sub(r'<link rel="apple-touch-icon"[^>]*>', f'<link rel="apple-touch-icon" href="icons/{IP}apple-touch-icon.png?v=1">', page)
        page = page.replace('<h2 id="about-title">Order of Operations: Circuit Builder</h2>', '<h2 id="about-title">Order of Operations: Fault Finder</h2>')
        # its O³ mark in the title bar and the About box, in coral
        page = re.sub(r'<svg class="(?:logo|ab-logo)"[\s\S]*?</svg>', lambda m: m.group(0).replace("#FFC000", "#FF6F59"), page)
        if "<span>Fault Finder</span>" not in page:
            raise SystemExit("The Troubleshooter build could not name itself (has the title changed?)")
    if DEMO:
        # its own name and badge, and its own keys in the browser's storage (autosave, view and other settings)
        js = js.replace("'oo-circuit-builder:", "'oo-circuit-builder-demo:").replace("'oo-troubleshooter:", "'oo-troubleshooter-demo:")
        name = "Fault Finder" if TS else "Circuit Builder"
        page = page.replace(f"<title>{name}</title>", f"<title>{name} (Demo)</title>")
        page = page.replace(f"<h1>Order of Operations: <span>{name}</span></h1>", f'<h1>Order of Operations: <span>{name}</span> <em class="demo-badge" title="The demo build: new features are tried out here before they go into the full {name}">DEMO</em></h1>')
        css += "\n.demo-badge { font-style: normal; font-size: .7rem; font-weight: 800; letter-spacing: .08em; color: #1c1d1f; background: #9be03a; border-radius: 5px; padding: 2px 7px; margin-left: 6px; vertical-align: 2px; }\n"
        if ("oo-troubleshooter-demo:" if TS else "oo-circuit-builder-demo:") not in js or "DEMO</em>" not in page:
            raise SystemExit("The demo build could not mark itself (has the title or a storage key changed?)")
    for marker, text in (("/*@@CSS@@*/", css), ("/*@@JS@@*/", js), ("/*@@ICON@@*/", icon)):
        if page.count(marker) != 1:
            raise SystemExit(f"src/index.html must contain {marker} exactly once")
        page = page.replace(marker, text.rstrip("\n"))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    if TS:   # (its icons and manifest, for installing it as an app of its own)
        import shutil, json
        shutil.copytree(SRC / ICONS, OUT.parent / "icons", dirs_exist_ok=True)
        name = "Order of Operations: Fault Finder" + (" (Demo)" if DEMO else "")
        man = {"name": name, "short_name": "Fault Finder Demo" if DEMO else "Fault Finder", "id": "./?app=troubleshooter" + ("-demo" if DEMO else ""), "start_url": "./", "scope": "./",   # (as Print Builder: installs from the folder's own address, with or without index.html)
              
               "display": "standalone", "background_color": "#1c1d1f", "theme_color": "#9be03a" if DEMO else "#1c1d1f",
               "description": "Find and fix the faults planted in a circuit with a meter, as a technician would, for the Order of Operations troubleshooting class.",
               "icons": [{"src": f"icons/{IP}icon-192.png?v=1", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                         {"src": f"icons/{IP}icon-512.png?v=1", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                         {"src": f"icons/{IP}maskable-512.png?v=1", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
                         {"src": f"icons/{IP}icon.svg?v=1", "sizes": "any", "type": "image/svg+xml", "purpose": "any"}]}
        (OUT.parent / "troubleshooter.webmanifest").write_text(json.dumps(man, indent=1), encoding="utf-8")
        return OUT
    # the app icons and the web app manifest go next to it (for the website: installing it as an app)
    import shutil
    shutil.copytree(SRC / ICONS, OUT.parent / "icons", dirs_exist_ok=True)
    man = (SRC / "circuit-builder.webmanifest").read_text(encoding="utf-8")
    if DEMO:   # (installed as an app of its own)
        man = man.replace('"Order of Operations: Circuit Builder"', '"Order of Operations: Circuit Builder (Demo)"').replace('"short_name": "Circuit Builder"', '"short_name": "Circuit Builder Demo"').replace('"theme_color": "#1c1d1f"', '"theme_color": "#9be03a"').replace('"id": "./Circuit_Builder.html"', '"id": "./OrderOfOperations/demo/Circuit_Builder.html"')
    (OUT.parent / "circuit-builder.webmanifest").write_text(man, encoding="utf-8")
    return OUT


if __name__ == "__main__":
    out = build()
    print(f"Built {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
