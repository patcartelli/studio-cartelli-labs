import { test, expect } from '@playwright/test';

// ============================================================
// Coverage guard for /lab/network — mirrors tests/chart-data-guard.spec.ts.
//
// network.astro used to gate its SSR fetch behind
// `if (!cfEnv.LASTFM_API_KEY || !cfEnv.LASTFM_USERNAME || !kv)`, which
// tripped in CI (LASTFM_FIXTURE mode needs no credentials, but that guard
// ran before ever reaching the code that knows that) and set hasError
// unconditionally. Every data-gated test in tests/lab-network.spec.ts opens
// with `if (errorVisible) { skip; return; }`, so they all quietly no-op'ed
// while showing as "passed" -- the exact hole chart-data-guard.spec.ts's own
// header describes for /lab/chart, just never given the same fix or the
// same tripwire here (STC-344).
//
// Deliberately unconditional: no test.skip, no CI branch, no data guard.
// If it is ever "fixed" by adding a skip to it, the hole it exists to
// detect reopens silently. (STC-344)
// ============================================================

const MIN_EXPECTED_NODES = 5;

test('GUARD: /lab/network renders real data — never skips, so a coverage hole cannot hide', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('data fetch failed')) consoleErrors.push(m.text());
  });

  const response = await page.goto('/lab/network');
  expect(response?.status(), '/lab/network must respond 200').toBe(200);

  await expect(
    page.locator('.network__error'),
    '/lab/network is in its error state -- every data-gated test in tests/lab-network.spec.ts ' +
      'is SKIPPING and this suite\'s green check is meaningless for this page. Check ' +
      'LASTFM_FIXTURE / LASTFM_API_KEY and the LASTFM_CHART_CACHE KV binding.' +
      (consoleErrors.length ? `\n\nBrowser console errors:\n  ${consoleErrors.slice(0, 5).join('\n  ')}` : '')
  ).not.toBeVisible();

  const nodeCircles = page.locator('.network__canvas svg circle[fill-opacity]');
  const count = await nodeCircles.count();

  expect(
    count,
    `/lab/network rendered ${count} nodes (expected >= ${MIN_EXPECTED_NODES}).`
  ).toBeGreaterThanOrEqual(MIN_EXPECTED_NODES);

  // The genre filter dropdown is the entry point for the whole
  // genre/tag-filter test cascade (SEARCH-02, SEARCH-04). It always renders
  // with a default "all tags" option even with zero real tag data, so a
  // bare presence check can't tell those apart -- assert there's at least
  // one real tag option beyond the default.
  const genreOptionCount = await page.locator('#ctrl-genre-filter option').count();
  expect(
    genreOptionCount,
    'genre filter has no real tag options beyond the default -- artist.getTopTags fixture data is missing'
  ).toBeGreaterThan(1);
});
