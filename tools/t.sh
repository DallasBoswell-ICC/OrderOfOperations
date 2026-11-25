#!/bin/sh
# Build CB and PB (demo + main) and run the CB and PB demo tests.
. "$(dirname "$0")/env.sh"
cd $R/print-builder/source && python3 build.py --demo >/dev/null && python3 build.py >/dev/null || exit 1
cd $R/source && python3 build.py --demo >/dev/null && python3 build.py >/dev/null || exit 1
echo "== CB demo"; cd $R/source && timeout 900 node tests/run-tests.js --demo 2>&1 | grep -E "FAIL|^ +- |checks passed" | head -40
echo "== PB demo"; cd $R/print-builder/source && timeout 900 node tests/run-tests.js --demo 2>&1 | grep -E "FAIL|^ +- |checks passed" | head -40
