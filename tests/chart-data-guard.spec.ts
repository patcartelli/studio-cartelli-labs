import { test, expect } from '@playwright/test';

// ============================================================
// Coverage guard for /lab/chart.
//
// Every data-gated test on this page opens with a variant of:
//
//   test.skip(!await grid.isVisible(), 'SSR data unavailable in this environment');
//
// (see tests/lab-chart.spec.ts lines ~333/352/371 and onward, all using the
// same isVisible().catch(() => false) early-return pattern) which is the
// right call for a single test and a disaster in aggregate. When CI had no
// LASTFM_API_KEY, the SSR fetch threw, the page rendered empty, and dozens of
// tests quietly skipped. The Playwright job stayed green the whole time, so
// a passing check said nothing whatsoever about this page. This mirrors the
// hole measured in studio-cartelli on PR #337:
//
//   local, real data:  1210 passed /  83 skipped / 7 failed
//   CI,    no API key: 1126 passed / 174 skipped / 0 failed
//
// `retries: 2` was never what kept those green. They simply never ran.
//
// This spec is the tripwire, and the one test on the page that must NEVER skip.
// If the chart renders dataless, this FAILS — loudly, with the count — instead
// of letting dozens of skips hide behind a green check. Any future breakage of
// the fixture, the LASTFM_CHART_CACHE KV binding, or the SSR data path trips
// this first.
//
// Deliberately unconditional: no test.skip, no CI branch, no data guard. That
// is the entire point. If it is ever "fixed" by adding a skip to it, the hole
// it exists to detect reopens silently.
// ============================================================

const MIN_EXPECTED_TILES = 5;

test('GUARD: /lab/chart renders real data — never skips, so a coverage hole cannot hide', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('data fetch failed')) consoleErrors.push(m.text());
  });

  const response = await page.goto('/lab/chart');
  expect(response?.status(), '/lab/chart must respond 200').toBe(200);

  const grid = page.locator('.chart__view[data-view="albums"] .chart__grid');
  await expect(
    grid,
    'albums grid missing entirely — SSR render failed, not just a data gap'
  ).toBeVisible({ timeout: 15_000 });

  const tiles = grid.locator('.chart__tile');
  const count = await tiles.count();

  expect(
    count,
    `/lab/chart rendered ${count} tiles (expected >= ${MIN_EXPECTED_TILES}). The page has no ` +
      `data, which means every data-gated test in tests/lab-chart.spec.ts is SKIPPING and ` +
      `this suite's green check is meaningless for this page. Check LASTFM_FIXTURE / ` +
      `LASTFM_API_KEY and the LASTFM_CHART_CACHE KV binding.` +
      (consoleErrors.length ? `\n\nBrowser console errors:\n  ${consoleErrors.slice(0, 5).join('\n  ')}` : '')
  ).toBeGreaterThanOrEqual(MIN_EXPECTED_TILES);

  // The copy button only renders on a populated grid, and it is the entry point
  // for the whole COPY-05 cascade suite. If it is missing, those tests skip too.
  await expect(
    page.locator('.chart__copy-btn'),
    'copy button absent — the COPY-05 cascade tests would all skip'
  ).toBeVisible();
});
