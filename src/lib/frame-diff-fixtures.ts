// STC-320: synthetic frame pairs for cross-checking the three
// implementations of the change rule against each other.
//
// These exist because the real fixtures do not. STC-319 needed 30-60s of
// real footage to answer its question and could not get it; STC-320 needs
// something much weaker — two frames whose correct answer is known by
// construction — and that CAN be built without a Mac, a camera or an H.264
// decoder. Nothing here is a substitute for real footage: these fixtures
// say whether the implementations agree, and nothing at all about which
// change matters.
//
// Sized 640x360 to match `fixtures/basic` from the recorder's own test
// suite, which is what study one is currently playing. The caret sweep
// below is only meaningful against a real sampling lattice, so the
// dimensions are not arbitrary.

import { GRID_W, GRID_H, type Frame } from './frame-diff-rule.ts';

export const FIXTURE_W = 640;
export const FIXTURE_H = 360;

/** A mutable RGBA8 frame buffer, opaque, filled with `fill`. */
function blank(r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(FIXTURE_W * FIXTURE_H * 4);
  for (let i = 0; i < FIXTURE_W * FIXTURE_H; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function fillRect(
  data: Uint8ClampedArray,
  x0: number, y0: number, w: number, h: number,
  r: number, g: number, b: number,
): void {
  for (let y = y0; y < Math.min(FIXTURE_H, y0 + h); y++) {
    for (let x = x0; x < Math.min(FIXTURE_W, x0 + w); x++) {
      const p = (y * FIXTURE_W + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
}

function frame(data: Uint8ClampedArray): Frame {
  return { data, width: FIXTURE_W, height: FIXTURE_H };
}

/** The threshold study one's page opens on, and the default for fixtures with no reason to differ. */
export const DEFAULT_THRESHOLD = 0.08;

export interface FixturePair {
  readonly name: string;
  /** What this pair is for, in one line — shown on the study page's cross-check table. */
  readonly purpose: string;
  readonly prev: Frame;
  readonly curr: Frame;
  /**
   * The threshold this fixture is meant to be run at. Carried on the fixture
   * rather than chosen by the caller, because two of them only mean anything
   * at a specific threshold and a caller special-casing them BY NAME is the
   * drift this repo keeps paying for.
   */
  readonly threshold: number;
  /**
   * The frame-wide changed fraction that is correct BY CONSTRUCTION, where
   * the fixture has one. An implementation disagreeing with this is wrong,
   * independently of what the other implementations say — which is what
   * stops a cross-check from certifying three copies of the same mistake.
   */
  readonly expectedFraction?: number;
}

/** No change at all. The floor case: every implementation must return exactly 0. */
export function flatPair(): FixturePair {
  const a = blank(20, 30, 40);
  const b = blank(20, 30, 40);
  return {
    name: 'static',
    purpose: 'Nothing moves. Every implementation must return exactly zero.',
    prev: frame(a), curr: frame(b), threshold: DEFAULT_THRESHOLD, expectedFraction: 0,
  };
}

/** The left half of the frame changes completely. Exactly 0.5 by construction. */
export function halfPair(): FixturePair {
  const a = blank(20, 30, 40);
  const b = blank(20, 30, 40);
  fillRect(b, 0, 0, FIXTURE_W / 2, FIXTURE_H, 230, 230, 230);
  return {
    name: 'half-frame',
    purpose: 'The left half turns white. The answer is exactly 0.5 — a scale check.',
    prev: frame(a), curr: frame(b), threshold: DEFAULT_THRESHOLD, expectedFraction: 0.5,
  };
}

/**
 * A text caret blinking on, `caretX` pixels from the left.
 *
 * This is the fixture the whole study turns on. STC-319's own framing names
 * a blinking caret as the canonical change that MATTERS ("the text field
 * with the blinking caret *is*" where the viewer should look), and a caret
 * is two pixels wide. Study one's point-sampled estimator reads one pixel in
 * every hundred, so whether it sees the caret at all depends on where the
 * caret happens to sit relative to a fixed lattice — which is not a property
 * of the recording, and is not something a rule should depend on.
 *
 * `caretPhaseSweep` below turns that into a measurement rather than an
 * anecdote.
 */
export function caretPair(caretX = 100): FixturePair {
  const a = blank(245, 245, 245);
  const b = blank(245, 245, 245);
  fillRect(b, caretX, 100, 2, 16, 20, 20, 20);
  return {
    name: `caret@${caretX}`,
    purpose: 'A 2x16 text caret blinks on against a light field — the change that matters most.',
    prev: frame(a), curr: frame(b), threshold: DEFAULT_THRESHOLD,
    // 32 pixels of 230400.
    expectedFraction: (2 * 16) / (FIXTURE_W * FIXTURE_H),
  };
}

/**
 * The caret at every position it can occupy relative to the sampling
 * lattice.
 *
 * The lattice repeats every `FIXTURE_W / GRID_W` = 10 pixels horizontally,
 * so ten consecutive positions cover every phase there is. Running all ten
 * answers "how often does the estimator see a caret at all" with a number
 * instead of an example — and makes the result independent of a fixture
 * author choosing a flattering or unflattering x.
 */
export function caretPhaseSweep(): FixturePair[] {
  const stride = FIXTURE_W / GRID_W;
  return Array.from({ length: stride }, (_, i) => caretPair(100 + i));
}

/**
 * A uniform pair differing by exactly `BOUNDARY_DELTA_8BIT` levels of grey,
 * for driving the threshold comparison from just below and just above.
 *
 * WHAT THIS FIXTURE DELIBERATELY DOES NOT DO is sit exactly ON the
 * threshold. The tempting version of this fixture sets the threshold to the
 * pair's exact luma delta, on the theory that `>=` and `>` then disagree on
 * every pixel in the frame and a one-character port bug is as loud as it can
 * possibly be. It was built that way first, and it does not work — it tests
 * floating-point representation rather than the rule.
 *
 * Measured: the Rec.601 weights sum to 0.99999999999999989, so this pair's
 * delta lands 5.6e-17 below 8/255 in float64 and exactly on it in float32.
 * The CPU oracle and the two shaders would therefore disagree on that
 * fixture for a reason that has nothing to do with either shader being a
 * faithful port, and a harness cannot tell that apart from a real defect.
 *
 * So exact-boundary behaviour is stated in the rule (`>=`, matching GLSL's
 * `step`) and left UNENFORCED by the harness, which is the honest position:
 * naming a limit beats a test that fails for the wrong reason. The two
 * pairs below straddle the threshold by a comfortable margin instead, where
 * every implementation agrees regardless of float width.
 *
 * What that costs is stated rather than glossed, because it was MEASURED by
 * mutation: flipping the rule's `>=` to `>` passes every fixture in this
 * file. Nothing here can catch it, and nothing portable could. Inverting the
 * comparison outright (`<`) IS caught, by four fixtures at once. So the
 * boundary operator is a documented convention between the three ports, not
 * a checked one.
 */
export const BOUNDARY_DELTA_8BIT = 8;
const BOUNDARY_DELTA_LUMA = BOUNDARY_DELTA_8BIT / 255;

/** A threshold clearly below the pair's delta — every pixel must count as changed. */
export const BOUNDARY_THRESHOLD_BELOW = BOUNDARY_DELTA_LUMA * 0.9;
/** A threshold clearly above the pair's delta — no pixel may count as changed. */
export const BOUNDARY_THRESHOLD_ABOVE = BOUNDARY_DELTA_LUMA * 1.1;

function greyPair(
  name: string,
  purpose: string,
  threshold: number,
  expectedFraction: number,
): FixturePair {
  const base = 100;
  const a = blank(base, base, base);
  const b = blank(
    base + BOUNDARY_DELTA_8BIT,
    base + BOUNDARY_DELTA_8BIT,
    base + BOUNDARY_DELTA_8BIT,
  );
  return { name, purpose, prev: frame(a), curr: frame(b), threshold, expectedFraction };
}

/** Threshold 10% below the delta: the whole frame changed. Catches a comparison inverted outright. */
export function boundaryBelowPair(): FixturePair {
  return greyPair(
    'threshold-below',
    'Uniform grey shift, threshold 10% under it — the whole frame must count as changed.',
    BOUNDARY_THRESHOLD_BELOW,
    1,
  );
}

/** Threshold 10% above the delta: nothing changed. The other half of the same check. */
export function boundaryAbovePair(): FixturePair {
  return greyPair(
    'threshold-above',
    'The same shift with the threshold 10% over it — nothing may count as changed.',
    BOUNDARY_THRESHOLD_ABOVE,
    0,
  );
}

/**
 * Single-channel changes that pin the three luma weights independently.
 *
 * Added after a mutation test, not before it: swapping LUMA_R and LUMA_B in
 * the rule passed every other fixture in this file, because they are all
 * greyscale or change by far too much for the weighting to matter. The WGSL
 * port hand-writes its own `vec3<f32>(0.299, 0.587, 0.114)` in the shader
 * source, so a transposition there is a plausible port bug that the harness
 * would otherwise have waved through.
 *
 * The trick is that a channel-only change of a fixed magnitude produces a
 * luma delta proportional to that channel's weight alone, so a threshold
 * placed BETWEEN two weights separates them. A 60-level shift gives
 * blue 0.0268, red 0.0704, green 0.1381; thresholds at 0.05 and 0.10 then
 * bracket the ordering blue < red < green, and no permutation of the three
 * weights survives all four.
 *
 * Note the pair that expects ZERO is doing as much work as the ones that
 * expect one: a rule that counted everything as changed would pass the
 * positive cases alone.
 */
export function channelWeightPairs(): FixturePair[] {
  const probe = (
    name: string,
    purpose: string,
    r: number, g: number, b: number,
    threshold: number,
    expectedFraction: number,
  ): FixturePair => {
    const a = blank(0, 0, 0);
    const bb = blank(0, 0, 0);
    fillRect(bb, 0, 0, FIXTURE_W, FIXTURE_H, r, g, b);
    return { name, purpose, prev: frame(a), curr: frame(bb), threshold, expectedFraction };
  };
  return [
    probe('weight-blue-low', 'A blue-only shift under the threshold — pins blue as the smallest weight.',
      0, 0, 60, 0.05, 0),
    probe('weight-red-high', 'The same shift in red, over the same threshold — red must outweigh blue.',
      60, 0, 0, 0.05, 1),
    probe('weight-red-low', 'Red under a higher threshold — bounds red from above.',
      60, 0, 0, 0.10, 0),
    probe('weight-green-high', 'Green over that higher threshold — green must outweigh red.',
      0, 60, 0, 0.10, 1),
  ];
}

/**
 * Scattered small changes across the frame — a spinner here, a toast there.
 * No clean closed form, so no `expectedFraction`; this one is purely for
 * cross-implementation agreement on a case with structure in it.
 */
export function scatteredPair(): FixturePair {
  const a = blank(240, 240, 240);
  const b = blank(240, 240, 240);
  // Deterministic positions — a seeded pattern, not Math.random(), so a
  // disagreement is reproducible on the machine that reports it.
  for (let i = 0; i < 24; i++) {
    const x = (i * 97 + 13) % (FIXTURE_W - 20);
    const y = (i * 61 + 7) % (FIXTURE_H - 20);
    fillRect(b, x, y, 6 + (i % 5), 6 + (i % 3), 30, 90 + i, 160);
  }
  return {
    name: 'scattered',
    purpose: 'Two dozen small regions change at once — structure without a closed form.',
    prev: frame(a), curr: frame(b), threshold: DEFAULT_THRESHOLD,
  };
}

/** The standard cross-check set, in the order the study page presents them. */
export function standardFixtures(): FixturePair[] {
  return [
    flatPair(),
    halfPair(),
    caretPair(100),
    boundaryBelowPair(),
    boundaryAbovePair(),
    ...channelWeightPairs(),
    scatteredPair(),
  ];
}

/** Turns a fixture frame into something `copyExternalImageToTexture` and `texImage2D` both accept. */
export async function toBitmap(f: Frame): Promise<ImageBitmap> {
  // Always copied into a fresh buffer rather than passed through. `Frame`
  // accepts a Uint8Array too, and ImageData wants a Uint8ClampedArray over a
  // plain ArrayBuffer specifically — a view over a SharedArrayBuffer is a
  // type error and a runtime one. Copying makes the fixture immune to what
  // its caller happened to allocate.
  const bytes = new Uint8ClampedArray(f.width * f.height * 4);
  bytes.set(f.data);
  return createImageBitmap(new ImageData(bytes, f.width, f.height));
}

/** Grid cell count, re-exported so a caller checking a grid length need not import two modules. */
export const FIXTURE_GRID_CELLS = GRID_W * GRID_H;
