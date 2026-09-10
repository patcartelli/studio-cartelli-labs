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
// Those 21 `if (errorVisible) { skip; return; }` blocks are now gone --
// 19 became hard assertions and the 2 covering Wikidata influence edges
// became real test.skip() calls. Worth being precise about why they were so
// dangerous: a bare `return` is NOT a skip. Playwright counts it as a PASS,
// so the suite reported 21 green tests that asserted nothing at all.
//
// Deliberately unconditional: no test.skip, no CI branch, no data guard.
// If it is ever "fixed" by adding a skip to it, the hole it exists to
// detect reopens silently. (STC-344)
// ============================================================

const MIN_EXPECTED_NODES = 5;
const MIN_EXPECTED_FAMILIES = 2;

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

  // --- Each known failure mode gets its own assertion, so a regression names
  // --- itself instead of surfacing as a vague "not enough data".

  // STC-340: nodes render but their tag arrays are empty. The graph looks
  // fine while every genre-dependent behaviour on the page is inert.
  const nodeTags = await page.evaluate(() => {
    const el = document.getElementById('node-tags-data');
    return el ? (JSON.parse(el.textContent ?? '{}') as Record<string, string[]>) : {};
  });
  const tagged = Object.values(nodeTags).filter((t) => t.length > 0).length;
  expect(
    tagged,
    `${Object.keys(nodeTags).length} artists rendered but only ${tagged} have any tags -- ` +
      `STC-340's signature: partial enrichment presented as complete.`
  ).toBe(Object.keys(nodeTags).length);

  // STC-332: every link comes back with similarity 0 because the
  // similar-artist fetch failed and was swallowed.
  const nonZeroSimilarity = await page.evaluate(() => {
    const el = document.getElementById('graph-data');
    if (!el) return 0;
    const g = JSON.parse(el.textContent ?? '{}') as { links?: { similarity?: number }[] };
    return (g.links ?? []).filter((l) => (l.similarity ?? 0) > 0).length;
  });
  expect(
    nonZeroSimilarity,
    `every link has similarity 0 -- STC-332's signature: artist.getSimilar is failing silently.`
  ).toBeGreaterThan(0);

  // STC-339: colour only means something if more than one family is present.
  // The legend markup is server-rendered but its counts are filled in by the
  // client script, so a populated count also proves that script ran.
  await expect(
    page.locator('.network__legend'),
    'genre legend missing -- STC-339 colour key did not render'
  ).toBeVisible();

  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            Array.from(document.querySelectorAll<HTMLElement>('.network__legend-count')).filter(
              (el) => el.dataset.genreFamily !== 'other' && Number(el.textContent ?? '0') > 0
            ).length
        ),
      {
        message:
          'fewer than 2 coloured genre families have nodes -- the palette is not being ' +
          'exercised, so colour-dependent behaviour is untested',
        timeout: 10_000,
      }
    )
    .toBeGreaterThanOrEqual(MIN_EXPECTED_FAMILIES);
});
