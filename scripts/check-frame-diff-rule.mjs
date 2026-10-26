// STC-320: the CPU half of the frame-difference cross-check.
//
// The change rule now exists in three languages — TypeScript
// (src/lib/frame-diff-rule.ts), GLSL (study one) and WGSL (study two) — and
// two of those need a GPU to run. This script checks the one that does not,
// so the rule's closed-form behaviour is verified on every build, on any
// machine, with no browser and no hardware.
//
// It deliberately checks the oracle against ARITHMETIC rather than against
// the other two implementations. A cross-check between three ports can
// certify three copies of one mistake; a fixture whose answer is known by
// construction cannot. The GPU-vs-oracle half lives in
// tests/frame-diff-wgsl.spec.ts and skips loudly where there is no GPU.
//
// Run: node --experimental-strip-types scripts/check-frame-diff-rule.mjs

import {
  changeGrid,
  pointSampledFraction,
  compareGrids,
  GRID_W,
  GRID_H,
} from '../src/lib/frame-diff-rule.ts';
import {
  standardFixtures,
  caretPhaseSweep,
  FIXTURE_W,
  FIXTURE_H,
} from '../src/lib/frame-diff-fixtures.ts';

const failures = [];
function check(label, condition, detail) {
  if (!condition) failures.push(`${label}: ${detail}`);
  return condition;
}

// --- 1. Every closed-form fixture matches its constructed answer ---------
console.log('Closed-form fixtures (reduction vs. the answer by construction):');
for (const f of standardFixtures()) {
  const grid = changeGrid(f.prev, f.curr, f.threshold);
  const line = `  ${f.name.padEnd(18)} reduction=${grid.changedFraction.toFixed(6)}`;
  if (f.expectedFraction === undefined) {
    console.log(`${line}  (no closed form — cross-check only)`);
    continue;
  }
  const ok = Math.abs(grid.changedFraction - f.expectedFraction) < 1e-9;
  console.log(`${line}  expected=${f.expectedFraction.toFixed(6)}  ${ok ? 'ok' : 'MISMATCH'}`);
  check('closed form', ok, `${f.name} gave ${grid.changedFraction}, expected ${f.expectedFraction}`);
}

// --- 2. The grid is a partition: cells must reconstruct the frame total --
// This is what makes the grid a REDUCTION rather than a sample. If tiling
// ever gains a gap or an overlap, the weighted cells stop summing to the
// frame-wide count and this catches it — including on frame sizes not
// divisible by 64x36, which is every real capture width.
{
  const f = standardFixtures().find((x) => x.name === 'scattered');
  const grid = changeGrid(f.prev, f.curr, f.threshold);
  let fromCells = 0;
  for (let gy = 0; gy < GRID_H; gy++) {
    const y0 = Math.floor((gy * FIXTURE_H) / GRID_H);
    const y1 = Math.floor(((gy + 1) * FIXTURE_H) / GRID_H);
    for (let gx = 0; gx < GRID_W; gx++) {
      const x0 = Math.floor((gx * FIXTURE_W) / GRID_W);
      const x1 = Math.floor(((gx + 1) * FIXTURE_W) / GRID_W);
      fromCells += grid.cells[gy * GRID_W + gx] * (x1 - x0) * (y1 - y0);
    }
  }
  // The tolerance is bounded from BOTH sides and neither bound is a taste
  // call. Above: `cells` is a Float32Array — it has to be, it is the GPU's
  // storage buffer — so reweighting 2304 f32 fractions accumulates about
  // totalPixels * 6e-8 of rounding (measured here: 1.4e-6 px). Below: it
  // must stay far under ONE pixel, because a tiling gap or overlap loses or
  // double-counts whole pixels, and a tolerance that swallowed one would
  // make this check decorative.
  const tolerance = grid.totalPixels * 1e-6; // 0.23 px on this fixture
  const ok = Math.abs(fromCells - grid.changedPixels) < tolerance;
  console.log(
    `\nGrid is a partition: cells reweight to ${fromCells.toFixed(4)} px, ` +
      `frame total ${grid.changedPixels} px ` +
      `(tolerance ${tolerance.toFixed(4)} px, well under 1)  ${ok ? 'ok' : 'MISMATCH'}`,
  );
  check('partition', ok, `cells summed to ${fromCells}, frame total was ${grid.changedPixels}`);
}

// --- 3. compareGrids actually discriminates ------------------------------
// A comparator that returns "agree" for everything would make the GPU half
// of this harness vacuous, and it is the piece with no other test.
{
  const a = standardFixtures().find((x) => x.name === 'half-frame');
  const gridA = changeGrid(a.prev, a.curr, a.threshold);
  const same = compareGrids(gridA.cells, gridA.cells);
  const flat = changeGrid(
    standardFixtures()[0].prev,
    standardFixtures()[0].curr,
    standardFixtures()[0].threshold,
  );
  const different = compareGrids(gridA.cells, flat.cells);
  console.log(
    `\ncompareGrids: identical grids agree=${same.agree}, ` +
      `half-frame vs. static agree=${different.agree} (${different.disagreeingCells} cells differ)`,
  );
  check('comparator agrees with itself', same.agree, 'a grid disagreed with a copy of itself');
  check(
    'comparator can disagree',
    !different.agree && different.disagreeingCells > 0,
    'half-frame and static were reported as agreeing — the comparator cannot fail',
  );
}

// --- 4. The caret sweep: the port's headline finding, as a number --------
// Study one's scalar is a point sample of a 64x36 lattice. A caret is two
// pixels wide. How often the estimator sees one at all is therefore a
// property of where the caret sits, not of the recording — which is the
// whole reason study two makes the grid a reduction.
{
  const sweep = caretPhaseSweep();
  let seen = 0;
  let reductionStable = true;
  let firstCount = null;
  for (const f of sweep) {
    if (pointSampledFraction(f.prev, f.curr, f.threshold) > 0) seen++;
    const px = changeGrid(f.prev, f.curr, f.threshold).changedPixels;
    if (firstCount === null) firstCount = px;
    if (px !== firstCount) reductionStable = false;
  }
  console.log(
    `\nCaret sweep over one lattice period (${sweep.length} positions):\n` +
      `  point sample (study one) saw the caret in ${seen}/${sweep.length} positions\n` +
      `  reduction (study two)    reported ${firstCount} changed px at every position` +
      `${reductionStable ? '' : ' — NOT STABLE'}`,
  );
  check(
    'reduction is position-independent',
    reductionStable,
    'the reduction gave different counts for the same caret at different x — it is sampling, not reducing',
  );
  check(
    'the sweep still discriminates',
    seen < sweep.length,
    `the point sample saw the caret at every position (${seen}/${sweep.length}); ` +
      'the fixture no longer demonstrates the sampling gap and the writeup is stale',
  );
}

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.length} check(s) failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nOK: the change rule holds on every closed-form fixture.');
