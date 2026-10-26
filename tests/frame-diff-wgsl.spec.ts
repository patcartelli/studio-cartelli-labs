// STC-320: the GPU half of the frame-difference cross-check.
//
// The CPU half runs on every build with no hardware
// (scripts/check-frame-diff-rule.mjs). This half drives the real shaders in
// a real browser and holds each to the reference.
//
// TWO THINGS THIS FILE REFUSES TO DO, both learned the expensive way in the
// sibling repo:
//
// 1. It never reports a leg that could not run as a leg that passed. The
//    machine study two was written on has WebGL2 (SwiftShader) and NO
//    WebGPU at all — `navigator.gpu` is absent under every flag combination
//    tried, headless and headed. So the WGSL leg is genuinely unverified
//    there, and a suite that went green without saying so would be worse
//    than one that failed.
// 2. It never writes a skip notice with `console.warn`. Playwright and
//    vitest both attribute console output to the test that produced it, and
//    a skipped test prints nothing — so the notice vanishes exactly when it
//    is needed. `process.stderr.write` survives.

import { test, expect } from '@playwright/test';

const PAGE = '/lab/frame-diff-wgsl';

interface ImplAvailability {
  id: 'oracle' | 'glsl' | 'wgsl';
  label: string;
  available: boolean;
  reason: string;
}
interface GridAgreement {
  agree: boolean;
  disagreeingCells: number;
  totalCells: number;
  maxAbsDiff: number;
}
interface FixtureRow {
  fixture: string;
  threshold: number;
  expected: number | null;
  oracle: number;
  oraclePointSample: number;
  glsl: number | null;
  wgsl: number | null;
  wgslGridAgreement: GridAgreement | null;
}
interface CrossCheckReport {
  implementations: ImplAvailability[];
  rows: FixtureRow[];
  caretSweep: {
    positions: number;
    pointSampleSaw: number;
    reductionPixels: number;
    reductionStable: boolean;
  };
  agree: boolean;
  notRun: string[];
}

/** Matches FRACTION_TOLERANCE in src/lib/frame-diff-crosscheck.ts. */
const FRACTION_TOLERANCE = 1e-4;

async function report(page: import('@playwright/test').Page): Promise<CrossCheckReport> {
  await page.goto(PAGE);
  // The page publishes the report only after the cross-check resolves;
  // waiting on the hook rather than on a timeout means a slow software
  // rasteriser cannot turn into a flake.
  await page.waitForFunction(() => (window as any).__frameDiffWgslTest?.report !== undefined, {
    timeout: 60_000,
  });
  return page.evaluate(() => (window as any).__frameDiffWgslTest.report as CrossCheckReport);
}

function notice(text: string): void {
  process.stderr.write(`\n[frame-diff-wgsl] ${text}\n`);
}

test.describe('frame-difference cross-check', () => {
  test('the reference implementation runs and matches every closed-form fixture', async ({ page }) => {
    const r = await report(page);

    const oracle = r.implementations.find((i) => i.id === 'oracle');
    expect(oracle?.available, 'the reference needs no hardware and must always run').toBe(true);
    expect(r.rows.length).toBeGreaterThan(0);

    const closedForm = r.rows.filter((row) => row.expected !== null);
    expect(
      closedForm.length,
      'no fixture has a constructed answer — the cross-check could only compare ports to each other',
    ).toBeGreaterThanOrEqual(4);

    for (const row of closedForm) {
      expect(
        Math.abs(row.oracle - row.expected!),
        `${row.fixture}: reference gave ${row.oracle}, constructed answer is ${row.expected}`,
      ).toBeLessThan(1e-9);
    }
  });

  test('study one\'s GLSL shader matches the reference model of it', async ({ page }) => {
    const r = await report(page);
    const glsl = r.implementations.find((i) => i.id === 'glsl')!;

    if (!glsl.available) {
      notice(
        `SKIPPED the GLSL leg: ${glsl.reason}. Study one's shader is UNVERIFIED in this browser.`,
      );
      test.skip(true, `WebGL2 unavailable: ${glsl.reason}`);
      return;
    }

    // Study one is a point SAMPLE, so it is held to the reference's
    // point-sample model — not to the reduction. Holding it to the reduction
    // would report a design difference as a port bug.
    for (const row of r.rows) {
      expect(row.glsl, `${row.fixture}: GLSL reported nothing`).not.toBeNull();
      expect(
        Math.abs(row.glsl! - row.oraclePointSample),
        `${row.fixture}: GLSL gave ${row.glsl}, reference point-sample model gave ${row.oraclePointSample}`,
      ).toBeLessThan(FRACTION_TOLERANCE);
    }
  });

  test('study two\'s WGSL shader matches the reference reduction, cell for cell', async ({ page }) => {
    const r = await report(page);
    const wgsl = r.implementations.find((i) => i.id === 'wgsl')!;

    if (!wgsl.available) {
      notice(
        `SKIPPED the WGSL leg: ${wgsl.reason}\n` +
          '              This is the ticket\'s own done-condition and it is NOT verified here.\n' +
          '              A machine with WebGPU must run this before the port is believed.',
      );
      test.skip(true, `WebGPU unavailable: ${wgsl.reason}`);
      return;
    }

    for (const row of r.rows) {
      expect(row.wgsl, `${row.fixture}: WGSL reported nothing`).not.toBeNull();
      expect(
        Math.abs(row.wgsl! - row.oracle),
        `${row.fixture}: WGSL gave ${row.wgsl}, reference reduction gave ${row.oracle}`,
      ).toBeLessThan(FRACTION_TOLERANCE);

      // The frame-wide fraction can agree while the grid is wrong — a
      // transposed tile index moves change between cells without changing
      // the total. The per-cell comparison is the one that would catch it,
      // and it is the "change grid" the ticket names.
      const agreement = row.wgslGridAgreement;
      expect(agreement, `${row.fixture}: no grid comparison was made`).not.toBeNull();
      expect(
        agreement!.agree,
        `${row.fixture}: ${agreement!.disagreeingCells} of ${agreement!.totalCells} grid cells ` +
          `disagreed with the reference (max abs diff ${agreement!.maxAbsDiff})`,
      ).toBe(true);
    }
  });

  test('the caret sweep reproduces the port\'s headline finding', async ({ page }) => {
    const r = await report(page);
    const s = r.caretSweep;

    // Runs on the CPU, so it is available in every browser — the claim is
    // about two algorithms, not about two devices.
    expect(s.positions).toBe(10);
    expect(
      s.reductionStable,
      `the reduction gave different counts for the same caret at different positions ` +
        `(${s.reductionPixels} px expected at every one) — it is sampling, not reducing`,
    ).toBe(true);
    expect(s.reductionPixels, 'a 2x16 caret is 32 pixels').toBe(32);

    // The finding is that the estimator is position-dependent. If it ever
    // saw the caret everywhere, the writeup on the page would be stale — and
    // a stale claim on a published page is worse than no claim.
    expect(
      s.pointSampleSaw,
      'the point-sampled estimator saw the caret at every position; the page\'s claim is now wrong',
    ).toBeLessThan(s.positions);
  });

  test('the page names every implementation that did not run', async ({ page }) => {
    await page.goto(PAGE);
    await page.waitForFunction(() => (window as any).__frameDiffWgslTest?.report !== undefined, {
      timeout: 60_000,
    });
    const r = await page.evaluate(
      () => (window as any).__frameDiffWgslTest.report as CrossCheckReport,
    );
    const verdict = (await page.locator('#fdw-verdict').textContent()) ?? '';

    // A visitor must never read "everything agreed" off a page where two of
    // three legs never executed. This asserts the disclosure, not the mood.
    for (const impl of r.implementations.filter((i) => !i.available)) {
      expect(
        verdict,
        `the verdict does not mention that ${impl.label} could not run`,
      ).toContain(impl.label);
    }
    if (r.notRun.length > 0) {
      expect(verdict).toContain('not passing');
    }
  });
});
