#!/bin/sh
# build the page, then run the automatic checks
set -e
cd "$(dirname "$0")"
python3 build.py
node tests/run-tests.js
