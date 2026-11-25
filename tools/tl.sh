#!/bin/sh
# Build the demos and run only the CB checks whose names match $1.
# Usage: tools/tl.sh "Stage 4" [max lines, default 60]
. "$(dirname "$0")/env.sh"
cd $R/print-builder/source && python3 build.py --demo >/dev/null || exit 1
cd $R/source && python3 build.py --demo >/dev/null || exit 1
cd $R/source && ONLY="$1" timeout 900 node tests/run-tests.js --demo 2>&1 | grep -E "PASS|FAIL|^ +- |checks passed" | head -${2:-60}
