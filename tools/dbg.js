// Debug harness: opens the PB and CB demo builds side by side and runs a snippet.
// Usage: node tools/dbg.js ./my-snippet.js
//   my-snippet.js:  module.exports = async (pb, cb, fs, R) => { ... };
// Env: DSF=2 for sharper screenshots; CB_OLD=/path/to/old/checkout to load an
// older CB build instead (e.g. from `git archive <commit> | tar -x -C /tmp/old`).
const path = require('path'), fs = require('fs'); const { chromium } = require('playwright');
const R = path.resolve(__dirname, '..');
const CBROOT = process.env.CB_OLD || R;
const PB = 'file://' + R + '/print-builder/source/dist/demo/Print_Builder.html';
const CB = 'file://' + CBROOT + '/source/dist/demo/Circuit_Builder.html';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: +(process.env.DSF || 1) });
  const pb = await ctx.newPage(), cb = await ctx.newPage();
  for (const p of [pb, cb]) p.on('pageerror', e => console.log('ERR', e.message));
  await pb.goto(PB); await cb.goto(CB); await pb.waitForTimeout(300);
  const mod = require(path.resolve(process.argv[2]));
  await mod(pb, cb, fs, R); await b.close();
})();
