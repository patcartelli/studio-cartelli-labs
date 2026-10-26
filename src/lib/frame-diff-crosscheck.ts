// STC-320: run every available implementation of the change rule over the
// same fixtures and report whether they agree.
//
// One definition, used by BOTH the study page and
// tests/frame-diff-wgsl.spec.ts. The page showing one number while the test
// asserted a separately-computed one is the "one value, two copies" defect
// the recorder's CLAUDE.md has now recorded six times; this module is the
// single answer and the test reads it rather than recomputing it.
//
// Availability is reported PER IMPLEMENTATION rather than as a single
// pass/fail, because the three fail independently and for unrelated
// reasons — a browser with no WebGPU still exercises the GLSL leg, and the
// machine this was written on is exactly that browser. An implementation
// that could not run is never silently counted as agreeing.

import {
  changeGrid,
  pointSampledFraction,
  compareGrids,
  GRID_W,
  GRID_H,
  type ChangeGrid,
  type GridAgreement,
} from './frame-diff-rule.ts';
import {
  standardFixtures,
  caretPhaseSweep,
  toBitmap,
  type FixturePair,
} from './frame-diff-fixtures.ts';
import { FrameDiffRenderer } from './frame-diff-gl.ts';
import { FrameDiffGpuRenderer, checkGpuSupport } from './frame-diff-gpu.ts';

export type ImplId = 'oracle' | 'glsl' | 'wgsl';

export interface ImplAvailability {
  readonly id: ImplId;
  readonly label: string;
  readonly available: boolean;
  /** Why it could not run, for a visitor. Empty when available. */
  readonly reason: string;
}

/**
 * One reason a row failed, named so the page can say WHICH leg is wrong
 * rather than only that something is.
 *
 * `closed-form` means the REFERENCE itself disagreed with arithmetic, which
 * outranks the other two: if the reference is wrong, comparing shaders to it
 * says nothing.
 */
export interface Disagreement {
  readonly leg: 'closed-form' | 'glsl' | 'wgsl' | 'wgsl-grid';
  /** What was compared, and by how much it missed — shown verbatim on the page. */
  readonly detail: string;
}

export interface FixtureRow {
  readonly fixture: string;
  readonly purpose: string;
  readonly threshold: number;
  /** Correct by construction, where the fixture has a closed form. */
  readonly expected: number | null;
  /** The reduction, computed on the CPU. Always present — the oracle needs no hardware. */
  readonly oracle: number;
  /** Study one's estimator, modelled on the CPU. Always present. */
  readonly oraclePointSample: number;
  /** Study one's REAL GLSL shader, if WebGL2 ran. */
  readonly glsl: number | null;
  /** Study two's REAL WGSL shader, if WebGPU ran. */
  readonly wgsl: number | null;
  /** Cell-by-cell agreement between the oracle's grid and the WGSL grid. */
  readonly wgslGridAgreement: GridAgreement | null;
  /**
   * Every reason this row failed, empty when it passed. The report's overall
   * `agree` is DERIVED from these rather than tracked alongside them — two
   * places deciding one verdict is how a page ends up saying MISMATCH with
   * every row looking fine.
   */
  readonly disagreements: Disagreement[];
}

export interface CaretSweepResult {
  readonly positions: number;
  /** How many positions study one's estimator registered any change at all. */
  readonly pointSampleSaw: number;
  /** The reduction's changed-pixel count, which must be identical at every position. */
  readonly reductionPixels: number;
  readonly reductionStable: boolean;
}

export interface CrossCheckReport {
  readonly implementations: ImplAvailability[];
  readonly rows: FixtureRow[];
  readonly caretSweep: CaretSweepResult;
  /** True only if every implementation that RAN agreed with the oracle on every fixture. */
  readonly agree: boolean;
  /** Implementations that did not run, named — so a green report cannot be mistaken for a complete one. */
  readonly notRun: ImplId[];
}

/**
 * Tolerance for comparing a GPU's frame-wide fraction against the CPU
 * oracle's.
 *
 * Not a fudge factor. The two GPUs work in f32 and may fuse or reassociate
 * the luma dot product; the oracle models a strict left-to-right f32 dot.
 * Pixels whose luma difference sits within a few ULPs of the threshold can
 * therefore land on either side. On a 640x360 frame a handful of such
 * pixels is ~1e-5 of the total, so 1e-4 absorbs float disagreement while
 * staying three orders of magnitude below the caret signal this study cares
 * about (1.4e-4)... which is uncomfortably close, and is exactly why the
 * caret sweep below is asserted on its own terms rather than through this
 * number.
 */
export const FRACTION_TOLERANCE = 1e-4;

async function makeGlsl(): Promise<{ r: FrameDiffRenderer | null; reason: string }> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    return { r: new FrameDiffRenderer(canvas), reason: '' };
  } catch (e) {
    return { r: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function makeWgsl(): Promise<{ r: FrameDiffGpuRenderer | null; reason: string }> {
  const support = await checkGpuSupport();
  if (!support.supported) return { r: null, reason: support.reason };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    return { r: await FrameDiffGpuRenderer.create(canvas), reason: '' };
  } catch (e) {
    return { r: null, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function runCrossCheck(): Promise<CrossCheckReport> {
  const fixtures = standardFixtures();
  const glsl = await makeGlsl();
  const wgsl = await makeWgsl();

  const implementations: ImplAvailability[] = [
    { id: 'oracle', label: 'TypeScript reference', available: true, reason: '' },
    {
      id: 'glsl',
      label: 'GLSL / WebGL2 (study one)',
      available: glsl.r !== null,
      reason: glsl.reason,
    },
    {
      id: 'wgsl',
      label: 'WGSL / WebGPU (study two)',
      available: wgsl.r !== null,
      reason: wgsl.reason,
    },
  ];

  const rows: FixtureRow[] = [];

  for (const f of fixtures) {
    const bitmaps = await bitmapsFor(f);
    const oracleGrid: ChangeGrid = changeGrid(f.prev, f.curr, f.threshold);
    const oraclePoint = pointSampledFraction(f.prev, f.curr, f.threshold);
    const disagreements: Disagreement[] = [];

    let glslValue: number | null = null;
    if (glsl.r) {
      glslValue = glsl.r.changedFraction(bitmaps.prev, bitmaps.curr, f.threshold);
      // Study one's shader is a point SAMPLE, so it is held to the oracle's
      // point-sample model — not to the reduction. Holding it to the
      // reduction would report a port bug where there is a design difference.
      const d = Math.abs(glslValue - oraclePoint);
      if (d > FRACTION_TOLERANCE) {
        disagreements.push({
          leg: 'glsl',
          detail:
            `GLSL gave ${glslValue.toExponential(4)}, the point-sample model ` +
            `${oraclePoint.toExponential(4)} — off by ${d.toExponential(2)} ` +
            `(tolerance ${FRACTION_TOLERANCE.toExponential(0)}, one sample is ` +
            `${(1 / (GRID_W * GRID_H)).toExponential(2)})`,
        });
      }
    }

    let wgslValue: number | null = null;
    let wgslAgreement: GridAgreement | null = null;
    if (wgsl.r) {
      const g = await wgsl.r.changeGrid(bitmaps.prev, bitmaps.curr, f.threshold);
      wgslValue = g.changedFraction;
      wgslAgreement = compareGrids(oracleGrid.cells, g.cells);
      const d = Math.abs(wgslValue - oracleGrid.changedFraction);
      if (d > FRACTION_TOLERANCE) {
        disagreements.push({
          leg: 'wgsl',
          detail:
            `WGSL gave ${wgslValue.toExponential(4)}, the reference reduction ` +
            `${oracleGrid.changedFraction.toExponential(4)} — off by ${d.toExponential(2)}`,
        });
      }
      if (!wgslAgreement.agree) {
        disagreements.push({
          leg: 'wgsl-grid',
          detail:
            `${wgslAgreement.disagreeingCells} of ${wgslAgreement.totalCells} grid cells ` +
            `differ (max ${wgslAgreement.maxAbsDiff.toExponential(2)}) — the frame total can ` +
            'agree while the grid is wrong, so this is the check that matters',
        });
      }
    }

    // A fixture with a closed form checks the oracle itself, so three ports
    // of one mistake cannot certify each other.
    if (f.expectedFraction !== undefined) {
      const d = Math.abs(oracleGrid.changedFraction - f.expectedFraction);
      if (d > 1e-9) {
        disagreements.push({
          leg: 'closed-form',
          detail:
            `the REFERENCE gave ${oracleGrid.changedFraction.toExponential(4)} where the ` +
            `constructed answer is ${f.expectedFraction.toExponential(4)} — the reference ` +
            'itself is wrong, so nothing compared against it means anything',
        });
      }
    }

    rows.push({
      fixture: f.name,
      purpose: f.purpose,
      threshold: f.threshold,
      expected: f.expectedFraction ?? null,
      oracle: oracleGrid.changedFraction,
      oraclePointSample: oraclePoint,
      glsl: glslValue,
      wgsl: wgslValue,
      wgslGridAgreement: wgslAgreement,
      disagreements,
    });

    bitmaps.prev.close();
    bitmaps.curr.close();
  }

  const caretSweep = runCaretSweep();

  glsl.r?.dispose();
  wgsl.r?.dispose();

  // DERIVED, never tracked alongside the rows. A verdict computed separately
  // from the evidence is how a page says MISMATCH while every row it shows
  // looks fine — which is exactly the report this page got on its first run
  // against real hardware.
  const agree =
    rows.every((r) => r.disagreements.length === 0) && caretSweep.reductionStable;

  return {
    implementations,
    rows,
    caretSweep,
    agree,
    notRun: implementations.filter((i) => !i.available).map((i) => i.id),
  };
}

async function bitmapsFor(f: FixturePair): Promise<{ prev: ImageBitmap; curr: ImageBitmap }> {
  const [prev, curr] = await Promise.all([toBitmap(f.prev), toBitmap(f.curr)]);
  return { prev, curr };
}

/**
 * The caret sweep, on the CPU only.
 *
 * Deliberately not run on the GPUs. The claim it establishes is about the
 * two ALGORITHMS — a point sample of a fixed lattice versus a reduction over
 * every pixel — and that difference is fully determined by the rule, not by
 * which device evaluates it. Running it on hardware would make the finding
 * look like a hardware measurement and quietly make it unavailable on any
 * machine without a GPU, including the one the study was written on.
 */
export function runCaretSweep(): CaretSweepResult {
  const sweep = caretPhaseSweep();
  let pointSampleSaw = 0;
  let reductionPixels = -1;
  let reductionStable = true;
  for (const f of sweep) {
    if (pointSampledFraction(f.prev, f.curr, f.threshold) > 0) pointSampleSaw++;
    const px = changeGrid(f.prev, f.curr, f.threshold).changedPixels;
    if (reductionPixels < 0) reductionPixels = px;
    else if (px !== reductionPixels) reductionStable = false;
  }
  return { positions: sweep.length, pointSampleSaw, reductionPixels, reductionStable };
}
