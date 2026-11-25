#!/bin/sh
# Build every demo, copy it into the demo folders, run the Fault Finder
# demo tests and show what changed. The main pages are never touched.
set -e
. "$(dirname "$0")/env.sh"
cd $R/print-builder/source && python3 build.py --demo >/dev/null && python3 build.py >/dev/null
cp dist/demo/Print_Builder.html $R/print-builder/demo/index.html
cd $R/source && python3 build.py --demo >/dev/null && python3 build.py >/dev/null && python3 build.py --ts --demo >/dev/null
cp dist/demo/Circuit_Builder.html $R/demo/Circuit_Builder.html
cp dist/fault-finder/demo/index.html $R/fault-finder/demo/index.html
echo "== FF demo"; timeout 600 node tests/ts-tests.js --demo 2>&1 | grep -E "FAIL|^ +- |checks passed"
cd $R && git status --short | head -30
