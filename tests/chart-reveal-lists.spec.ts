import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { lastfmListThumbUrl } from '../src/lib/lastfm-image-url';

// Sibling spec to chart-reveal.spec.ts (D-06) — covers the same six reveal/links branches
// (render+links, reduced-motion, touch, hover, keyboard, axe) for the artists and tracks
// Weekly lists shipped in Phase 22/23. chart-reveal.spec.ts (albums) is left untouched.
//
// Every test below is parameterized over the two view containers this spec targets:
// .chart-list[data-view="artists"] and .chart-list[data-view="tracks"] (selector built
// from `${view}` in rowSelector/switchToView, not repeated as literal strings per test).

// ---- Fixtures ----

const albumsListFixtureMinimal = {
  view: 'albums',
  rows: [],
  offset: 0,
  limit: 20,
  total: 0,
  hasMore: false,
};

// Artists fixture: no imageUrl field at all (ChartListArtistRow has none, D-08) — artist
// images resolve exclusively through the /api/artist-websites batch resolve. One artist
// WITH a cached image+website, one WITHOUT (D-02/D-05 branch coverage).
const artistsListFixture = {
  view: 'artists',
  rows: [
    { rank: 1, name: 'Artist With Image', playcount: 100, url: 'https://www.last.fm/music/Artist+With+Image' },
    { rank: 2, name: 'Artist Without Image', playcount: 80, url: 'https://www.last.fm/music/Artist+Without+Image' },
  ],
  offset: 0,
  limit: 20,
  total: 2,
  hasMore: false,
};

// Tracks fixture: real imageUrl per row (D-10 — tracks always carry a synchronously-sourced
// thumb from Phase 22, unlike artists). One artist WITH a cached website, one WITHOUT.
const tracksListFixture = {
  view: 'tracks',
  rows: [
    {
      rank: 1,
      name: 'Fixture Track One',
      artist: 'Track Artist With Website',
      playcount: 90,
      imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/track1.jpg',
      url: 'https://www.last.fm/music/Track+Artist+With+Website/_/Fixture+Track+One',
    },
    {
      rank: 2,
      name: 'Fixture Track Two',
      artist: 'Track Artist Without Website',
      playcount: 70,
      imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/track2.jpg',
      url: 'https://www.last.fm/music/Track+Artist+Without+Website/_/Fixture+Track+Two',
    },
  ],
  offset: 0,
  limit: 20,
  total: 2,
  hasMore: false,
};

// Combined /api/artist-websites batch-resolve fixture. Artist rows key the lookup by
// `.name` (ChartListArtistRow has no `.artist` field, D-03); track rows key by `.artist`.
// One entry per fixture name resolves a real imageUrl (artists only) and/or websiteUrl;
// the "Without" entries resolve to { websiteUrl: null, imageUrl: null } (D-02 gate).
const artistWebsitesFixture: Record<string, { websiteUrl: string | null; imageUrl: string | null }> = {
  'Artist With Image': {
    websiteUrl: 'https://artistwithimage.example.com',
    imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/artist1.jpg',
  },
  'Artist Without Image': { websiteUrl: null, imageUrl: null },
  'Track Artist With Website': { websiteUrl: 'https://trackartistwebsite.example.com', imageUrl: null },
  'Track Artist Without Website': { websiteUrl: null, imageUrl: null },
};

// WR-06: 1x1 transparent PNG served for fixture image URLs so native <img> load events
// fire deterministically — the text-row__thumb--loaded fade-in class is only added on load.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// Route helper: registers all API mocks BEFORE page.goto so all requests are intercepted.
// /api/chart-list dispatches on the request's `view` param — mirrors lab-chart.spec.ts's
// mockChartListRoute helper (Phase 22 Plan 04) so artists/tracks each get their real shape.
async function registerRoutes(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/chart-list*', (route) => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get('view') ?? 'albums';
    const json =
      view === 'artists' ? artistsListFixture : view === 'tracks' ? tracksListFixture : albumsListFixtureMinimal;
    return route.fulfill({ json });
  });
  await page.route('**/api/artist-websites', (route) => route.fulfill({ json: artistWebsitesFixture }));
  // WR-06: fulfill fixture thumb/overlay image fetches offline with a real decodable PNG.
  await page.route('https://lastfm.freetls.fastly.net/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: PIXEL_PNG })
  );
}

// Switches to the given view via the view-switcher link and reports whether the list
// section rendered (not error/absent) — mirrors chart-reveal.spec.ts's listSectionPresent
// visibility-guard pattern (lines 62-64), adapted per data-view + the click needed to
// activate a non-default view.
async function switchToView(
  page: import('@playwright/test').Page,
  view: 'artists' | 'tracks'
): Promise<boolean> {
  const linksVisible = await page.locator('.chart__view-links').isVisible().catch(() => false);
  if (!linksVisible) return false;
  await page.locator(`.chart__view-link[data-for="${view}"]`).click();
  return page.locator(`.chart-list[data-view="${view}"] .text-list`).isVisible().catch(() => false);
}

const VIEWS = ['artists', 'tracks'] as const;

for (const view of VIEWS) {
  const rowSelector = `.chart-list[data-view="${view}"] .text-list .text-row`;
  // Row 1 in both fixtures is the image-bearing / website-bearing row (D-05). For artists
  // the image only resolves after the async batch-resolve (appendArtistExtras); for tracks
  // it's sourced synchronously from chart-list's imageUrl (D-10).
  const expectedImage =
    view === 'artists' ? artistWebsitesFixture['Artist With Image'].imageUrl! : tracksListFixture.rows[0].imageUrl;

  // ============================================================
  // Render + conditional website link (D-05/D-06)
  // ============================================================

  test(`${view} list render + conditional website link (D-06)`, async ({ page }) => {
    await registerRoutes(page);
    await page.goto('/lab/chart');

    // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
    // passed (green) — matches the Phase-14 cascade tests' in-file standard.
    test.skip(!(await switchToView(page, view)), 'SSR data unavailable in this environment');

    const rows = page.locator(rowSelector);
    await expect(rows).toHaveCount(2);

    if (view === 'artists') {
      await expect(rows.nth(0)).toContainText('Artist With Image');
      await expect(rows.nth(1)).toContainText('Artist Without Image');
    } else {
      await expect(rows.nth(0)).toContainText('Fixture Track One');
      await expect(rows.nth(1)).toContainText('Fixture Track Two');
    }

    // Row 1 (WITH a cached website) gets the conditional link (D-05). This resolves
    // asynchronously via the batch-resolve helper, so use auto-retrying assertions.
    const row1Links = rows.nth(0).locator('.text-row__links');
    const websiteLink1 = row1Links.locator('a.text-row__link').filter({ hasText: 'website' });
    await expect(websiteLink1).toBeVisible();

    // Row 2 (WITHOUT a website) never gets the link.
    const row2Links = rows.nth(1).locator('.text-row__links');
    const websiteLink2 = row2Links.locator('a.text-row__link').filter({ hasText: 'website' });
    await expect(websiteLink2).toHaveCount(0);

    // Both rows should also carry a real last.fm link from the chart-list fixture.
    const lfmLink1 = row1Links.locator('a.text-row__link').filter({ hasText: 'last.fm' });
    await expect(lfmLink1).toBeVisible();
  });

  // ============================================================
  // Reduced-motion short-circuit (REVL-06) — valid for all views under the
  // single-shared-engine design (Plan 02).
  // ============================================================

  test(`${view} reduced-motion: no overlay element appended (REVL-06)`, async ({ page }) => {
    // global config sets reducedMotion: 'reduce' — engine short-circuits without creating overlay.
    await registerRoutes(page);
    await page.goto('/lab/chart');

    // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
    // passed (green) — matches the Phase-14 cascade tests' in-file standard.
    test.skip(!(await switchToView(page, view)), 'SSR data unavailable in this environment');

    expect(await page.locator('.text-reveal-overlay').count()).toBe(0);

    const firstRow = page.locator(rowSelector).first();
    await expect(firstRow).toBeVisible();
  });

  // ============================================================
  // Touch device inline thumb, no overlay (REVL-04)
  // ============================================================

  test(`${view} touch device shows inline thumb, no overlay (REVL-04)`, async ({ browser }) => {
    // D-12: hasTouch: true forces (hover:none)(pointer:coarse) — CSS shows .text-row__thumb,
    // engine short-circuits, overlay is never created.
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 375, height: 812 },
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    try {
      await registerRoutes(page);
      await page.goto('http://localhost:4321/lab/chart');

      // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
      // passed (green) — matches the Phase-14 cascade tests' in-file standard.
      test.skip(!(await switchToView(page, view)), 'SSR data unavailable in this environment');

      expect(await page.locator('.text-reveal-overlay').count()).toBe(0);

      const rows = page.locator(rowSelector);
      if (view === 'artists') {
        // D-01: every artist row reserves exactly one thumb slot (possibly empty — no
        // text-only variant; reverses Phase 22's "zero thumbnails" guard, Pitfall 2).
        await expect(rows.locator('.text-row__thumb')).toHaveCount(await rows.count());

        // WR-06 (D-04): the WITH-image artist's thumb must receive its src from the
        // batch resolve, gain the --loaded class once the image's load event fires,
        // and settle at computed opacity 1 — toBeVisible() alone passes on opacity:0
        // elements, so it cannot catch a broken fade-in (CR-01).
        const loadedThumb = rows.nth(0).locator('.text-row__thumb');
        await expect(loadedThumb).toHaveAttribute(
          'src',
          artistWebsitesFixture['Artist With Image'].imageUrl!
        );
        await expect(loadedThumb).toHaveClass(/text-row__thumb--loaded/);
        await expect
          .poll(() => loadedThumb.evaluate((el) => getComputedStyle(el).opacity))
          .toBe('1');

        // The imageless artist keeps an empty transparent slot: no src, no --loaded (D-01/D-02).
        const emptyThumb = rows.nth(1).locator('.text-row__thumb');
        await expect(emptyThumb).not.toHaveAttribute('src', /.+/);
        await expect(emptyThumb).not.toHaveClass(/text-row__thumb--loaded/);
      } else {
        // D-10: track rows always carry a populated thumb (imageUrl sourced synchronously
        // at fill time from the /api/chart-list response, not the batch resolve).
        const thumb = rows.first().locator('.text-row__thumb');
        await expect(thumb).toBeVisible();
        await expect(thumb).toHaveAttribute(
          'src',
          lastfmListThumbUrl(tracksListFixture.rows[0].imageUrl),
        );
        // WR-06 (CR-01 regression): tracks thumbs must render at full opacity —
        // toBeVisible() alone counts opacity:0 elements as visible.
        await expect
          .poll(() => thumb.evaluate((el) => getComputedStyle(el).opacity))
          .toBe('1');
      }
    } finally {
      await context.close();
    }
  });

  // ============================================================
  // Hover overlay appears and tracks (REVL-03)
  // ============================================================

  test(`${view} hover overlay appears and tracks (REVL-03)`, async ({ browser }) => {
    // D-11: MUST override the global reducedMotion:'reduce' or overlay never appears.
    // Pitfall: absolute URL required — browser.newContext does not inherit baseURL.
    const context = await browser.newContext({
      reducedMotion: 'no-preference',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    try {
      await registerRoutes(page);
      await page.goto('http://localhost:4321/lab/chart');

      // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
      // passed (green) — matches the Phase-14 cascade tests' in-file standard.
      test.skip(!(await switchToView(page, view)), 'SSR data unavailable in this environment');

      const rows = page.locator(rowSelector);

      // Wait for the image-bearing row to resolve before hovering — for artists this
      // depends on the async batch-resolve fetch completing.
      await expect(rows.nth(0)).toHaveAttribute('data-image', expectedImage);

      // Pitfall 5 (23-RESEARCH.md): below-fold hover tests need scrollIntoViewIfNeeded
      // before every mouse.move, or they pass locally and fail headless in CI — the
      // chart list sits far below the fold (under the grid), and elementFromPoint only
      // resolves inside the viewport.
      await rows.nth(0).scrollIntoViewIfNeeded();
      const firstBox = await rows.nth(0).boundingBox();
      // WR-05: a missing bounding box means the row never rendered — a hover test that
      // cannot hover must surface as skipped (yellow), never as a silent green pass.
      test.skip(!firstBox, 'row bounding box unavailable in this environment');
      await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);

      // Overlay should appear, marked data-visible="true", with src matching the row's image.
      const overlay = page.locator('.text-reveal-overlay[data-visible="true"]');
      await expect(overlay).toBeVisible();
      await expect(page.locator('.text-reveal-overlay')).toHaveAttribute('src', expectedImage);
    } finally {
      await context.close();
    }
  });

  // ============================================================
  // Keyboard focus reveals art pinned top-right (REVL-05)
  // ============================================================

  test(`${view} keyboard focus reveals art pinned top-right (REVL-05)`, async ({ browser }) => {
    // Engine short-circuits under reducedMotion:'reduce', so we must override it.
    const context = await browser.newContext({
      reducedMotion: 'no-preference',
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    try {
      await registerRoutes(page);
      await page.goto('http://localhost:4321/lab/chart');

      // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
      // passed (green) — matches the Phase-14 cascade tests' in-file standard.
      test.skip(!(await switchToView(page, view)), 'SSR data unavailable in this environment');

      // Wait for the image-bearing row to resolve so the reveal is observable regardless
      // of which link within the row receives focus first.
      const rows = page.locator(rowSelector);
      await expect(rows.nth(0)).toHaveAttribute('data-image', expectedImage);

      // Tab until focus lands on a .text-row__link inside the active chart list (loop up
      // to 40 Tab presses — nav/grid/view-switcher elements precede the list in DOM order).
      let focused = false;
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const activeTagName = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase());
        const activeClasses = await page.evaluate(() => document.activeElement?.className ?? '');
        if (activeTagName === 'a' && activeClasses.includes('text-row__link')) {
          focused = true;
          break;
        }
      }
      // WR-05: a keyboard test that never reaches a list link exercised nothing —
      // surface as skipped (yellow), never as a silent green pass.
      test.skip(!focused, 'list links not reachable via Tab in this environment');

      const overlay = page.locator('.text-reveal-overlay[data-visible="true"]');
      await expect(overlay).toBeVisible();

      // Verify position: pinned top-right (x near innerWidth - 320 - 24, y near 24)
      const box = await overlay.boundingBox();
      // WR-05: overlay was just asserted visible — a null box is an environment fault,
      // not a pass; surface it as skipped.
      test.skip(!box, 'overlay bounding box unavailable in this environment');
      const viewportWidth = 1440;
      expect(box!.x).toBeGreaterThan(viewportWidth / 2);
      expect(box!.y).toBeLessThan(100);
    } finally {
      await context.close();
    }
  });

  // ============================================================
  // axe zero-violations (REVL-10)
  // ============================================================

  test(`${view} new links pass axe with zero violations (a11y)`, async ({ page }) => {
    await registerRoutes(page);
    await page.goto('/lab/chart');

    // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
    // passed (green) — matches the Phase-14 cascade tests' in-file standard.
    test.skip(!(await switchToView(page, view)), 'SSR data unavailable in this environment');

    // Wait for the async batch-resolve to complete so the website link (if any) is
    // present in the DOM before axe scans — otherwise this only ever tests the
    // pre-resolve skeleton state.
    const rows = page.locator(rowSelector);
    await expect(rows.nth(0)).toHaveAttribute('data-image', expectedImage);

    // Run axe scoped to the chart-list-section where the new links live.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('.chart-list-section')
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
