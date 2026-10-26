// STC-320: the change rule, written down ONCE, in plain TypeScript.
//
// Study one (STC-319) wrote the rule in GLSL. Study two writes it in WGSL.
// Two shader languages, one rule — and nothing in either of them can be run
// on the machine this was written on, so a third copy that CAN be run is
// what makes "the same fixture produces the same change grid in both
// studies" a checkable claim rather than a hope.
//
// This module is the reference: node-free, DOM-free, no GPU. Both shaders
// are ports of THIS, not of each other, which is the only arrangement where
// a disagreement names a culprit. If GLSL and WGSL disagree, whichever one
// disagrees with this file is the one that is wrong.
//
// It is deliberately dumb about WHICH change matters. The temporal
// classifier — event-triggered vs. ambient — is STC-319's rules list, and
// that is still unwritten and still blocked on real footage. This file
// answers only "how much of the frame changed, and where".

/**
 * Rec.601 luma weights. These are the numbers baked into study one's GLSL
 * (`dot(c, vec3(0.299, 0.587, 0.114))`), and the WGSL port carries the same
 * three constants rather than a "better" colour space — a port that quietly
 * improved the luma would make every downstream difference unattributable.
 */
export const LUMA_R = 0.299;
export const LUMA_G = 0.587;
export const LUMA_B = 0.114;

/**
 * The change grid's resolution. 64x36 is study one's offscreen readback size
 * and is kept exactly, because the grid is the thing the two studies have to
 * agree on and changing its shape would make them incomparable by
 * construction.
 */
export const GRID_W = 64;
export const GRID_H = 36;

/**
 * Luma of one 0..255 RGB triple, in 0..1 to match the shaders' unorm sampling.
 *
 * Computed in FLOAT32, deliberately, via `Math.fround` — and this is not
 * fussiness. Both shaders work in 32-bit floats, so a float64 oracle is not
 * a more accurate model of them, it is a different one, and the difference
 * is reachable: the Rec.601 weights sum to 0.99999999999999989 rather than
 * 1, so a frame pair engineered to differ by exactly the threshold comes out
 * 5.6e-17 BELOW it in float64 and exactly ON it in float32. Measured, not
 * feared — `>=` then answers false on the CPU and true on both GPUs, and the
 * harness would have reported a port bug that existed only in its own
 * arithmetic.
 *
 * The rounding order below models a strict left-to-right f32 dot product.
 * A real GPU may fuse or reassociate it, so this is close but not
 * guaranteed identical — which is exactly why `compareGrids` judges rule
 * OUTCOMES and the fixtures avoid sitting on the threshold. See
 * `frame-diff-fixtures.ts`.
 */
export function luma8(r: number, g: number, b: number): number {
  const rf = Math.fround(r / 255);
  const gf = Math.fround(g / 255);
  const bf = Math.fround(b / 255);
  return Math.fround(
    Math.fround(Math.fround(LUMA_R * rf) + Math.fround(LUMA_G * gf)) + Math.fround(LUMA_B * bf),
  );
}

/**
 * The per-pixel test, isolated so there is exactly one place that decides
 * what "changed" means.
 *
 * GLSL says `step(uThreshold, d)`, which is `d >= threshold` — NOT `>`. The
 * WGSL port must use `>=` too. A port that flipped this would be invisible
 * on real footage (a luma difference landing exactly on the threshold is
 * vanishingly rare in 8-bit video) and would show up only on a synthetic
 * fixture built to sit on the boundary — which is precisely why the
 * equivalence harness includes one.
 */
export function changed(dLuma: number, threshold: number): boolean {
  return dLuma >= threshold;
}

/** RGBA8 pixels plus their dimensions. What both `ImageData` and a raw readback look like. */
export interface Frame {
  readonly data: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
}

/**
 * Tile bounds for grid cell `i` along an axis of `size` pixels split into
 * `cells` cells.
 *
 * Exported because the WGSL compute shader has to compute the identical
 * bounds and this is the one definition of them. Integer floor division on
 * both sides: cell i covers [floor(i*size/cells), floor((i+1)*size/cells)).
 * That tiles the axis exactly — no gaps, no overlaps, no leftover strip —
 * for any size, including sizes not divisible by the cell count, which is
 * every real capture width against 64.
 */
export function tileStart(i: number, size: number, cells: number): number {
  return Math.floor((i * size) / cells);
}

export interface ChangeGrid {
  /** GRID_W * GRID_H cells, row-major from the TOP-left. Each is the fraction (0..1) of that tile's pixels that changed. */
  readonly cells: Float32Array;
  /** Changed pixels over total pixels, across the whole frame. Exact — not the mean of `cells`, which would misweight uneven tiles. */
  readonly changedFraction: number;
  readonly changedPixels: number;
  readonly totalPixels: number;
}

/**
 * The reduction: for every grid cell, what fraction of the pixels IN that
 * cell changed.
 *
 * This is the shape STC-320 asks for ("the change grid is a reduction, not a
 * raster") and it is NOT what study one computes — see `pointSampledFraction`
 * below for what study one actually does and why the difference matters.
 * Every pixel is visited exactly once.
 */
export function changeGrid(
  prev: Frame,
  curr: Frame,
  threshold: number,
  gridW: number = GRID_W,
  gridH: number = GRID_H,
): ChangeGrid {
  if (prev.width !== curr.width || prev.height !== curr.height) {
    throw new Error(
      `frame size mismatch: ${prev.width}x${prev.height} vs ${curr.width}x${curr.height}`,
    );
  }
  const { width, height } = prev;
  const cells = new Float32Array(gridW * gridH);
  let changedPixels = 0;

  for (let gy = 0; gy < gridH; gy++) {
    const y0 = tileStart(gy, height, gridH);
    const y1 = tileStart(gy + 1, height, gridH);
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = tileStart(gx, width, gridW);
      const x1 = tileStart(gx + 1, width, gridW);

      let cellChanged = 0;
      let cellTotal = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          const p = (row + x) * 4;
          const dl = Math.abs(
            luma8(prev.data[p]!, prev.data[p + 1]!, prev.data[p + 2]!) -
              luma8(curr.data[p]!, curr.data[p + 1]!, curr.data[p + 2]!),
          );
          if (changed(dl, threshold)) cellChanged++;
          cellTotal++;
        }
      }
      cells[gy * gridW + gx] = cellTotal === 0 ? 0 : cellChanged / cellTotal;
      changedPixels += cellChanged;
    }
  }

  const totalPixels = width * height;
  return { cells, changedFraction: changedPixels / totalPixels, changedPixels, totalPixels };
}

/**
 * What study one ACTUALLY computes — and the single most important finding
 * of this port.
 *
 * Study one's `changedFraction` renders the diff into a 64x36 framebuffer
 * with NEAREST filtering. Each of those 2304 output pixels is therefore a
 * POINT SAMPLE of exactly one source texel, not an average of a tile. So the
 * scalar under study one's plot is not "the fraction of the frame that
 * changed" — it is "the fraction of a fixed 64x36 lattice of sample points
 * that changed", which is an estimator of the former with a sampling error
 * nobody had measured.
 *
 * On a 640x360 fixture that lattice reads 1 pixel in every 100. A blinking
 * text caret — the study's own headline example of a change that MATTERS —
 * is a couple of pixels wide, so it lands between sample points far more
 * often than on one, and study one's plot would show a caret blink as no
 * change at all. That is a false negative on the exact signal auto-zoom
 * stage 2 exists to catch.
 *
 * Kept here, faithfully, for two reasons: it is what the equivalence harness
 * compares the real GLSL shader against (proving this file models study one
 * correctly), and it is what the reduction is measured against to put a
 * number on the gap.
 *
 * The `+ 0.5` is the texel-centre offset a NEAREST fetch lands on, and it is
 * load-bearing: shifting it to 0.1 makes this model disagree with study
 * one's real shader on the caret fixture, which is how the cross-check was
 * confirmed to be capable of failing at all.
 *
 * The y-flip mirrors study one's `UNPACK_FLIP_Y_WEBGL` upload and is
 * deliberately kept even though it CANNOT change this function's result —
 * measured, by removing it and watching every test still pass. Flipping y
 * maps the sample lattice onto itself (the sampled rows are the same set,
 * visited in the opposite order), so a COUNT over those samples is exactly
 * invariant. It would stop being invariant the moment this function
 * returned a per-cell grid rather than a scalar, which is a plausible next
 * step, so the flip stays and this note explains why no test defends it.
 */
export function pointSampledFraction(
  prev: Frame,
  curr: Frame,
  threshold: number,
  gridW: number = GRID_W,
  gridH: number = GRID_H,
): number {
  const { width, height } = prev;
  let changedCount = 0;

  for (let gy = 0; gy < gridH; gy++) {
    const v = (gy + 0.5) / gridH;
    // Study one uploads with UNPACK_FLIP_Y_WEBGL, so v=0 is the BOTTOM row.
    const sy = Math.min(height - 1, Math.floor((1 - v) * height));
    for (let gx = 0; gx < gridW; gx++) {
      const u = (gx + 0.5) / gridW;
      const sx = Math.min(width - 1, Math.floor(u * width));
      const p = (sy * width + sx) * 4;
      const dl = Math.abs(
        luma8(prev.data[p]!, prev.data[p + 1]!, prev.data[p + 2]!) -
          luma8(curr.data[p]!, curr.data[p + 1]!, curr.data[p + 2]!),
      );
      if (changed(dl, threshold)) changedCount++;
    }
  }
  return changedCount / (gridW * gridH);
}

/**
 * Whether two change grids agree on the RULE, which is the bar STC-320
 * actually sets ("bit-for-bit is not required, the rule outcomes are").
 *
 * A cell counts as agreeing when the two implementations put it on the same
 * side of `cellThreshold` — i.e. they would make the same zoom decision
 * about that region. `maxAbsDiff` is reported alongside so a run that passes
 * on outcomes while drifting numerically cannot look identical to one that
 * matches exactly; a port whose agreement is falling can be seen falling
 * before it fails.
 */
export interface GridAgreement {
  readonly agree: boolean;
  readonly disagreeingCells: number;
  readonly totalCells: number;
  readonly maxAbsDiff: number;
}

export function compareGrids(
  a: Float32Array,
  b: Float32Array,
  cellThreshold = 0.5,
): GridAgreement {
  if (a.length !== b.length) {
    throw new Error(`grid length mismatch: ${a.length} vs ${b.length}`);
  }
  let disagreeingCells = 0;
  let maxAbsDiff = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    maxAbsDiff = Math.max(maxAbsDiff, Math.abs(av - bv));
    if (av >= cellThreshold !== (bv >= cellThreshold)) disagreeingCells++;
  }
  return { agree: disagreeingCells === 0, disagreeingCells, totalCells: a.length, maxAbsDiff };
}
