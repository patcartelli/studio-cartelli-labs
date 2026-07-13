import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const chartDataFixture = {
  fetchedAt: Date.now(),
  artists: [
    {
      name: 'Test Artist',
      mbid: '00000000-0000-0000-0000-000000000001',
      url: 'https://www.last.fm/music/Test+Artist',
      imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg',
      glowColor: '#4a90d9',
      latestRelease: {
        coverUrl: 'https://coverartarchive.org/release/00000000-0000-0000-0000-000000000001/front-500',
        title: 'Test Latest Release',
        date: '2024',
      },
    },
  ],
  albums: [
    { rank: 1, name: 'Test Album 1', artist: 'Test Artist', playcount: 42, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', listenUrl: 'https://song.link/s/test1' },
    { rank: 2, name: 'Test Album 2', artist: 'Test Artist', playcount: 38, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', listenUrl: 'https://song.link/s/test2' },
    { rank: 3, name: 'Test Album 3', artist: 'Test Artist', playcount: 31, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', listenUrl: 'https://song.link/s/test3' },
    { rank: 4, name: 'Test Album 4', artist: 'Test Artist', playcount: 25, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', listenUrl: 'https://song.link/s/test4' },
    { rank: 5, name: 'Test Album 5', artist: 'Test Artist', playcount: 19, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', listenUrl: 'https://song.link/s/test5' },
    { rank: 6, name: 'Test Album 6', artist: 'Test Artist', playcount: 14, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', listenUrl: 'https://song.link/s/test6' },
  ],
  tracks: [
    { rank: 1, name: 'Test Track', artist: 'Test Artist', playcount: 17, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', listenUrl: 'https://song.link/s/track1' },
  ],
};

test('experiments landing page has heading and chart link', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.locator('.experiments__heading')).toBeVisible();
  await expect(page.locator('a[href="/lab/chart"]')).toBeVisible();
});

test('experiments/chart page renders either success or error state', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  // Heading is always present regardless of API status
  await expect(page.locator('.chart__heading')).toBeVisible();

  // Either the active view grid renders OR the error message renders — both are valid
  const grid = page.locator('.chart__view[data-view="albums"] .chart__grid');
  const error = page.locator('.chart__error');
  const gridVisible = await grid.isVisible().catch(() => false);
  const errorVisible = await error.isVisible().catch(() => false);
  expect(gridVisible || errorVisible).toBe(true);
});

test('chart page has nav and footer (BaseLayout intact)', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
});

test('chart page shows a relative-age freshness timestamp', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  const timestamp = page.locator('.chart__updated');
  await expect(timestamp).toBeVisible();
  const text = await timestamp.textContent();
  expect(text).toMatch(/Updated (just now|\d+ min ago|\d+ hr ago)/);
});

test('chart freshness timestamp has valid ISO datetime attribute (CACHE-03)', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  const timestamp = page.locator('.chart__updated');
  await expect(timestamp).toBeVisible();
  const datetime = await timestamp.getAttribute('datetime');
  expect(datetime).toBeTruthy();
  expect(new Date(datetime!).getTime()).not.toBeNaN();
});

test('chart tiles have overlay elements in DOM', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  // Only check overlays when grid is present (not in error state)
  if (await page.locator('.chart__grid').isVisible().catch(() => false)) {
    const overlays = page.locator('.chart__tile-overlay');
    expect(await overlays.count()).toBeGreaterThan(0);
    // Overlays are hidden by default (no labels class on grid)
    await expect(page.locator('.chart__grid--labels')).toHaveCount(0);
  }
});

test('chart page has controls bar with toggle and copy button', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__grid').isVisible().catch(() => false)) return; // skip in error state
  await expect(page.locator('.chart__controls')).toBeVisible();
  await expect(page.locator('.chart__toggle-input')).toBeAttached();
  await expect(page.locator('.chart__copy-btn')).toBeVisible();
});

test('labels toggle adds and removes grid modifier class', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  // Target the active (albums) grid specifically
  const grid = page.locator('.chart__view[data-view="albums"] .chart__grid');
  const toggleLabel = page.locator('.chart__toggle');
  const toggle = page.locator('.chart__toggle-input');

  if (!await page.locator('.chart__view[data-view="albums"]').isVisible().catch(() => false)) return;

  await expect(grid).not.toHaveClass(/chart__grid--labels/);
  // Click the visible label element to toggle the hidden checkbox
  await toggleLabel.click();
  await expect(toggle).toBeChecked();
  await expect(grid).toHaveClass(/chart__grid--labels/);
  await toggleLabel.click();
  await expect(toggle).not.toBeChecked();
  await expect(grid).not.toHaveClass(/chart__grid--labels/);
});

test('copy button is present and not disabled', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__grid').isVisible().catch(() => false)) return; // skip in error state
  const btn = page.locator('.chart__copy-btn');
  await expect(btn).toBeVisible();
  await expect(btn).not.toBeDisabled();
  await expect(btn).toHaveText('copy chart');
});

test('chart page has view switcher links', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__view-links').isVisible().catch(() => false)) return;
  await expect(page.locator('.chart__view-link[data-for="albums"]')).toBeVisible();
  await expect(page.locator('.chart__view-link[data-for="artists"]')).toBeVisible();
  await expect(page.locator('.chart__view-link[data-for="tracks"]')).toBeVisible();
});

test('albums view is active by default', async ({ page }) => {
  // Clear localStorage so default applies
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__view[data-view="albums"]').isVisible().catch(() => false)) return;
  await expect(page.locator('.chart__view[data-view="albums"]')).toBeVisible();
  await expect(page.locator('.chart__view[data-view="artists"]')).not.toBeVisible();
  await expect(page.locator('.chart__view[data-view="tracks"]')).not.toBeVisible();
});

test('switching to artists shows artist view and hides copy button and labels toggle', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__view-links').isVisible().catch(() => false)) return;

  await page.locator('.chart__view-link[data-for="artists"]').click();

  await expect(page.locator('.chart__view[data-view="artists"]')).toBeVisible();
  await expect(page.locator('.chart__view[data-view="albums"]')).not.toBeVisible();
  await expect(page.locator('.chart__copy-btn')).not.toBeVisible();
  await expect(page.locator('.chart__toggle')).not.toBeVisible();
});

test('switching to tracks shows track view with listen column', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__view-links').isVisible().catch(() => false)) return;

  await page.locator('.chart__view-link[data-for="tracks"]').click();

  await expect(page.locator('.chart__view[data-view="tracks"]')).toBeVisible();
  await expect(page.locator('.chart__view[data-view="albums"]')).not.toBeVisible();
  await expect(page.locator('.chart__copy-btn')).toBeVisible();
  await expect(page.locator('.chart__toggle')).toBeVisible();
});

test('view selection persists across reload', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__view-links').isVisible().catch(() => false)) return;

  // Write the view selection directly to localStorage, then reload to verify it persists
  await page.evaluate(() => localStorage.setItem('chart-view', 'tracks'));
  await page.reload();

  if (!await page.locator('.chart__view-links').isVisible().catch(() => false)) return;

  await expect(page.locator('.chart__view[data-view="tracks"]')).toBeVisible();
  await expect(page.locator('.chart__view[data-view="albums"]')).not.toBeVisible();
});

test('tracks view grid tiles have an img or placeholder — no blank src', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__view-links').isVisible().catch(() => false)) return;
  const tracksLink = page.locator('.chart__view-link[data-for="tracks"]');
  await tracksLink.click();
  const tiles = page.locator('.chart__view[data-view="tracks"] .chart__tile');
  const count = await tiles.count();
  if (count === 0) return; // no data
  const imgs = page.locator('.chart__view[data-view="tracks"] .chart__tile img');
  const imgCount = await imgs.count();
  for (let i = 0; i < imgCount; i++) {
    const src = await imgs.nth(i).getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toBe('');
  }
});

test('artist tiles have data-artist attribute', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__view-links').isVisible().catch(() => false)) return;
  const artistLink = page.locator('.chart__view-link[data-for="artists"]');
  await artistLink.click();
  const tiles = page.locator('.chart__tile--artist');
  const count = await tiles.count();
  if (count === 0) return;
  for (let i = 0; i < count; i++) {
    const attr = await tiles.nth(i).getAttribute('data-artist');
    expect(attr).toBeTruthy();
  }
});

test('chart changelog disclosure is present and collapsed by default', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  const details = page.locator('.chart__changelog');
  await expect(details).toBeVisible();
  // Collapsed by default — <details> has no 'open' attribute
  await expect(details).not.toHaveAttribute('open', /.*/);
  await expect(page.locator('.chart__changelog-summary')).toBeVisible();
});

test('chart changelog shows entries when opened', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  await page.locator('.chart__changelog-summary').click();
  const entries = page.locator('.chart__changelog-entry');
  await expect(entries).toHaveCount(7);
  await expect(page.locator('.chart__changelog-label').first()).toBeVisible();
});

test('grid tiles and placeholders have shimmer class on initial render (UX-02, UX-03)', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__grid').isVisible().catch(() => false)) return;

  // Grid tiles have shimmer class
  const shimmerTiles = page.locator('.chart__tile.chart__shimmer');
  expect(await shimmerTiles.count()).toBeGreaterThan(0);

  // Any tile-placeholder or thumb-placeholder elements also have shimmer
  const tilePlaceholders = page.locator('.chart__tile-placeholder.chart__shimmer');
  const thumbPlaceholders = page.locator('.chart__thumb-placeholder.chart__shimmer');
  // At least one type of placeholder should exist (tiles or thumbs)
  const tilePCount = await tilePlaceholders.count();
  const thumbPCount = await thumbPlaceholders.count();
  // Placeholders only appear when imageUrl is missing -- may be 0 if all albums have art
  // So we just verify the class is applied when placeholders exist
  const anyTilePlaceholder = page.locator('.chart__tile-placeholder');
  const anyThumbPlaceholder = page.locator('.chart__thumb-placeholder');
  if (await anyTilePlaceholder.count() > 0) {
    expect(tilePCount).toBeGreaterThan(0);
  }
  if (await anyThumbPlaceholder.count() > 0) {
    expect(thumbPCount).toBeGreaterThan(0);
  }
});

test('shimmer elements have no animation when prefers-reduced-motion is enabled (UX-04)', async ({ page }) => {
  // Default config already sets reducedMotion: 'reduce'
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__grid').isVisible().catch(() => false)) return;
  const shimmerEl = page.locator('.chart__shimmer').first();
  if (!await shimmerEl.isVisible().catch(() => false)) return;

  const animationName = await shimmerEl.evaluate(el =>
    getComputedStyle(el).animationName
  );
  expect(animationName).toBe('none');
});

test('shimmer elements have animation when motion is allowed', async ({ browser }) => {
  // Override reducedMotion to 'no-preference' to verify animation IS present
  const context = await browser.newContext({
    reducedMotion: 'no-preference',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.route('**/api/chart-data**', async route =>
      route.fulfill({ json: chartDataFixture })
    );
    await page.goto('http://localhost:4321/lab/chart');
    if (!await page.locator('.chart__grid').isVisible().catch(() => false)) {
      return;
    }
    const shimmerEl = page.locator('.chart__shimmer').first();
    if (!await shimmerEl.isVisible().catch(() => false)) {
      return;
    }

    const animationName = await shimmerEl.evaluate(el =>
      getComputedStyle(el).animationName
    );
    expect(animationName).toBe('chart-shimmer');
  } finally {
    await context.close();
  }
});

// ============================================================
// Phase 22 Plan 04: LIST-05/06/07 regression coverage — list-container switching,
// the artists no-thumbnail rule (Pitfall 2), and D-04 no-refetch persistence.
// Mocks **/api/chart-list** with a small deterministic payload keyed off the request's
// `view` param so these tests are CI-runnable (no live Last.fm creds). Reveal-overlay,
// touch-thumbnail, keyboard-reveal, reduced-motion, and axe coverage for the new lists
// are REVL-10 / Phase 23 scope — intentionally NOT added here.
// ============================================================

function mockChartListRoute(page: import('@playwright/test').Page, onRequest?: (view: string) => void) {
  return page.route('**/api/chart-list**', async route => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get('view') ?? 'albums';
    onRequest?.(view);

    let rows: Record<string, unknown>[];
    if (view === 'artists') {
      rows = [
        { rank: 1, name: 'Mock Artist 1', playcount: 100, url: 'https://www.last.fm/music/Mock+Artist+1' },
        { rank: 2, name: 'Mock Artist 2', playcount: 90, url: 'https://www.last.fm/music/Mock+Artist+2' },
      ];
    } else if (view === 'tracks') {
      rows = [
        { rank: 1, name: 'Mock Track 1', artist: 'Mock Artist', playcount: 80, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', url: 'https://www.last.fm/music/Mock+Artist/_/Mock+Track+1' },
        { rank: 2, name: 'Mock Track 2', artist: 'Mock Artist', playcount: 70, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', url: 'https://www.last.fm/music/Mock+Artist/_/Mock+Track+2' },
      ];
    } else {
      rows = [
        { rank: 1, name: 'Mock Album 1', artist: 'Mock Artist', playcount: 60, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', url: 'https://www.last.fm/music/Mock+Artist/Mock+Album+1' },
        { rank: 2, name: 'Mock Album 2', artist: 'Mock Artist', playcount: 50, imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/test.jpg', url: 'https://www.last.fm/music/Mock+Artist/Mock+Album+2' },
      ];
    }

    await route.fulfill({
      json: { view, rows, offset: 0, limit: 20, total: rows.length, hasMore: false },
    });
  });
}

test('switching to artists shows the artists list container and hides the others (D-01)', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await mockChartListRoute(page);
  await page.goto('/lab/chart');
  // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
  // passed (green) — matches the Phase-14 cascade tests' in-file standard.
  test.skip(
    !await page.locator('.chart__view-links').isVisible().catch(() => false),
    'SSR data unavailable in this environment'
  );

  await page.locator('.chart__view-link[data-for="artists"]').click();

  await expect(page.locator('.chart-list[data-view="artists"]')).toBeVisible();
  await expect(page.locator('.chart-list[data-view="albums"]')).not.toBeVisible();
  await expect(page.locator('.chart-list[data-view="tracks"]')).not.toBeVisible();
});

test('switching to tracks shows the tracks list container and hides the others (D-01)', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await mockChartListRoute(page);
  await page.goto('/lab/chart');
  // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
  // passed (green) — matches the Phase-14 cascade tests' in-file standard.
  test.skip(
    !await page.locator('.chart__view-links').isVisible().catch(() => false),
    'SSR data unavailable in this environment'
  );

  await page.locator('.chart__view-link[data-for="tracks"]').click();

  await expect(page.locator('.chart-list[data-view="tracks"]')).toBeVisible();
  await expect(page.locator('.chart-list[data-view="albums"]')).not.toBeVisible();
  await expect(page.locator('.chart-list[data-view="artists"]')).not.toBeVisible();
});

test('artists list rows reserve a thumb slot, empty when no cached image (D-01)', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await mockChartListRoute(page);
  await page.goto('/lab/chart');
  // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
  // passed (green) — matches the Phase-14 cascade tests' in-file standard.
  test.skip(
    !await page.locator('.chart__view-links').isVisible().catch(() => false),
    'SSR data unavailable in this environment'
  );

  await page.locator('.chart__view-link[data-for="artists"]').click();
  await expect(page.locator('.chart-list[data-view="artists"]')).toBeVisible();

  // Wait for the mocked fetch to resolve and fill the rows before asserting the reserved slot.
  const rows = page.locator('.chart-list[data-view="artists"] .text-row');
  await expect(rows.first()).toHaveAttribute('data-image', '');
  // Every row reserves exactly one thumb slot (D-01); src stays unset until the
  // batch resolve (Plan 03) fills it in — no text-only variant (reverses Phase 22's
  // "zero thumbnails" guard, Pitfall 2).
  await expect(rows.locator('.text-row__thumb')).toHaveCount(await rows.count());
});

test('switching back to an already-loaded view does not refetch (D-04)', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  let artistsRequestCount = 0;
  await mockChartListRoute(page, (view) => {
    if (view === 'artists') artistsRequestCount++;
  });
  await page.goto('/lab/chart');
  // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
  // passed (green) — matches the Phase-14 cascade tests' in-file standard.
  test.skip(
    !await page.locator('.chart__view-links').isVisible().catch(() => false),
    'SSR data unavailable in this environment'
  );

  // albums -> artists -> tracks -> artists
  await page.locator('.chart__view-link[data-for="artists"]').click();
  await expect(page.locator('.chart-list[data-view="artists"] .text-row').first()).toHaveAttribute('data-image', '');
  expect(artistsRequestCount).toBe(1);

  await page.locator('.chart__view-link[data-for="tracks"]').click();
  await expect(page.locator('.chart-list[data-view="tracks"]')).toBeVisible();

  await page.locator('.chart__view-link[data-for="artists"]').click();
  await expect(page.locator('.chart-list[data-view="artists"]')).toBeVisible();

  // Re-activating an already-loaded view must not trigger a second fetch (loadedViews persists).
  expect(artistsRequestCount).toBe(1);
});

// ============================================================
// Phase 23 Plan 04: D-07 — initial-load-error retry-contract test (deferred from Phase 22).
// A mutable `attempt` counter fails the FIRST /api/chart-list?view=artists fetch (503),
// then succeeds on the next; asserts the "Failed to load artists." + Retry UI-SPEC contract,
// then re-verifies WR-02's no-refetch persistence (switching away and back must not issue
// a third fetch — one failure + one successful retry, never more).
// ============================================================

test('D-07: initial-load error shows Retry, recovers, and does not refetch on re-switch', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('chart-view'));
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );

  let attempt = 0;
  const artistsRows = Array.from({ length: 20 }, (_, i) => ({
    rank: i + 1,
    name: `Mock Artist ${i + 1}`,
    playcount: 100 - i,
    url: `https://www.last.fm/music/Mock+Artist+${i + 1}`,
  }));

  await page.route('**/api/chart-list*', async route => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get('view') ?? 'albums';
    if (view !== 'artists') {
      await route.continue();
      return;
    }
    attempt++;
    if (attempt === 1) {
      await route.fulfill({ status: 503 });
      return;
    }
    await route.fulfill({
      json: { view: 'artists', rows: artistsRows, offset: 0, limit: 20, total: artistsRows.length, hasMore: false },
    });
  });

  // Empty object is safe under the { websiteUrl, imageUrl } shape — websites[name] is
  // undefined, undefined?.websiteUrl is falsy, so appendArtistExtras omits gracefully.
  await page.route('**/api/artist-websites', route => route.fulfill({ json: {} }));

  await page.goto('/lab/chart');
  // WR-05: surface SSR-unavailable environments as skipped (yellow), not silently
  // passed (green) — matches the Phase-14 cascade tests' in-file standard.
  test.skip(
    !await page.locator('.chart__view-links').isVisible().catch(() => false),
    'SSR data unavailable in this environment'
  );

  await page.locator('.chart__view-link[data-for="artists"]').click();

  const errorRegion = page.locator('.chart-list[data-view="artists"] .chart-list__error');
  const errorMsg = page.locator('.chart-list[data-view="artists"] .chart-list__error-msg');
  await expect(errorRegion).toBeVisible();
  await expect(errorMsg).toHaveText('Failed to load artists.');

  await page.locator('.chart-list[data-view="artists"] .chart-list__retry').click();

  await expect(errorRegion).not.toBeVisible();
  const rows = page.locator('.chart-list[data-view="artists"] .text-row');
  await expect(rows).toHaveCount(20);

  // Switch away and back — re-activating an already-loaded view must not refetch
  // (WR-02 no-refetch contract): exactly one failure + one successful retry, never a third.
  await page.locator('.chart__view-link[data-for="tracks"]').click();
  await expect(page.locator('.chart-list[data-view="tracks"]')).toBeVisible();
  await page.locator('.chart__view-link[data-for="artists"]').click();
  await expect(page.locator('.chart-list[data-view="artists"]')).toBeVisible();

  expect(attempt).toBe(2);
});

// ============================================================
// Phase 18: Axe zero-violation tests at M3 viewport boundaries
// (Compact=375, Medium=768, Expanded floor=840) — per D-01.
// browser.newContext() pattern from shimmer test above (Pitfall 1: absolute URL required).
// Pitfall 2: try/finally guarantees context.close() even on early return.
// ============================================================

const M3_VIEWPORTS = [
  { name: 'compact-375', width: 375, height: 812 },
  { name: 'medium-768', width: 768, height: 1024 },
  { name: 'expanded-840', width: 840, height: 1024 },
] as const;

for (const vp of M3_VIEWPORTS) {
  test(`a11y: /lab/chart has zero axe violations at ${vp.name} (${vp.width}px)`, async ({ browser }) => {
    // Mocks /api/chart-data but the text-list view is fed by the live /api/chart-list
    // (Last.fm), which 503s in CI -> dataless skeleton trips axe on placeholders.
    // Skip in CI per STC-33; runs locally where chart-list returns real data.
    test.skip(!!process.env.CI, 'chart list view needs Last.fm data, unavailable in CI (STC-33)');
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await page.route('**/api/chart-data**', async route =>
        route.fulfill({ json: chartDataFixture })
      );
      await page.goto('http://localhost:4321/lab/chart');
      // Run axe on full page (no .include() scoping) — per RESEARCH Open Question 2:
      // matches a11y.spec.ts behavior and satisfies D-03 "fix violations anywhere on the chart page".
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

// ============================================================
// Phase 14: COPY-05 — cascade tier-order tests (CONTEXT.md D-07/D-08/D-10/D-11/D-12).
// Mocks navigator.clipboard.write + navigator.share via page.addInitScript with
// Object.defineProperty(..., { value, configurable: true, writable: true }).
// configurable: true is MANDATORY per CONTEXT.md D-10 (Phase 13 Path C lesson).
// Assertions are tier-order only (D-07) — no button-text vocabulary asserts.
// ============================================================

test('cascade: clipboard rejection → navigator.share called (COPY-05)', async ({ page }) => {
  await page.addInitScript(() => {
    const mkProp = <T>(val: T): PropertyDescriptor => ({ value: val, configurable: true, writable: true });
    // Sentinel for tier-order proof.
    (window as any).__shareCalled = false;
    // WR-04: telemetry sentinel — track() invocations land in __trackedEvents.
    // D-07 reads "tier-order only — was the next API in the cascade called?".
    // Telemetry IS one of the APIs in the cascade chain (D-02), so asserting
    // on the captured event name turns COPY-06 from a hope into a contract.
    (window as any).__trackedEvents = [] as string[];
    Object.defineProperty(window, 'cloudflare', mkProp({
      beacon: {
        event: (name: string) => { (window as any).__trackedEvents.push(name); },
      },
    }));
    if (navigator.clipboard) {
      Object.defineProperty(navigator.clipboard, 'write', mkProp(
        () => Promise.reject(new Error('forced rejection — cascade test'))
      ));
    }
    Object.defineProperty(navigator, 'canShare', mkProp(() => true));
    Object.defineProperty(navigator, 'share', mkProp(async (_data: ShareData) => {
      (window as any).__shareCalled = true;
      return Promise.resolve();
    }));
  });

  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');

  // D-12 API guard — mirrors CHIP-01/02/03 pattern (spec:924-931).
  // WR-03: surface SSR-unavailable environments (no KV binding, no live
  // Last.fm) as skipped (yellow) rather than passed (green) so the
  // coverage gap is visible in CI dashboards.
  const gridReady = page.locator('.chart__view[data-view="albums"] .chart__grid');
  test.skip(!await gridReady.isVisible().catch(() => false), 'SSR data unavailable in this environment');
  const copyBtn = page.locator('.chart__copy-btn');
  test.skip(!await copyBtn.isVisible().catch(() => false), 'copy button not rendered (SSR data unavailable)');

  await copyBtn.click();

  // Tier-order assertion (D-07): navigator.share was reached.
  await expect.poll(
    () => page.evaluate(() => (window as any).__shareCalled === true),
    { timeout: 5_000 }
  ).toBe(true);

  // Modal MUST NOT open in this scenario.
  await expect(page.locator('#chart-copy-modal')).not.toHaveAttribute('open', '');

  // WR-04: telemetry contract — share-success path fires track('copy-shared').
  await expect.poll(
    () => page.evaluate(() => (window as any).__trackedEvents),
    { timeout: 5_000 }
  ).toContain('copy-shared');
});

test('cascade: clipboard + share rejection → modal opened (COPY-05)', async ({ page }) => {
  await page.addInitScript(() => {
    const mkProp = <T>(val: T): PropertyDescriptor => ({ value: val, configurable: true, writable: true });
    // WR-04: telemetry sentinel.
    (window as any).__trackedEvents = [] as string[];
    Object.defineProperty(window, 'cloudflare', mkProp({
      beacon: {
        event: (name: string) => { (window as any).__trackedEvents.push(name); },
      },
    }));
    if (navigator.clipboard) {
      Object.defineProperty(navigator.clipboard, 'write', mkProp(
        () => Promise.reject(new Error('forced'))
      ));
    }
    Object.defineProperty(navigator, 'canShare', mkProp(() => true));
    Object.defineProperty(navigator, 'share', mkProp(
      () => Promise.reject(new Error('forced — not AbortError'))
    ));
  });

  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');

  // D-12 API guard — mirrors CHIP-01/02/03 pattern (spec:924-931).
  // WR-03: surface SSR-unavailable environments as skipped, not silently passed.
  const gridReady = page.locator('.chart__view[data-view="albums"] .chart__grid');
  test.skip(!await gridReady.isVisible().catch(() => false), 'SSR data unavailable in this environment');
  const copyBtn = page.locator('.chart__copy-btn');
  test.skip(!await copyBtn.isVisible().catch(() => false), 'copy button not rendered (SSR data unavailable)');

  await copyBtn.click();

  // Tier-order assertion (D-07): modal opened.
  await expect(page.locator('#chart-copy-modal')).toHaveAttribute('open', '', { timeout: 5_000 });

  // WR-04: telemetry contract — modal-fallback path fires track('copy-modal').
  await expect.poll(
    () => page.evaluate(() => (window as any).__trackedEvents),
    { timeout: 5_000 }
  ).toContain('copy-modal');
});

test('cascade: clipboard rejection + buildChartBlob failure → modal NOT opened (COPY-05)', async ({ page }) => {
  await page.addInitScript(() => {
    const mkProp = <T>(val: T): PropertyDescriptor => ({ value: val, configurable: true, writable: true });
    // WR-04: telemetry sentinel.
    (window as any).__trackedEvents = [] as string[];
    Object.defineProperty(window, 'cloudflare', mkProp({
      beacon: {
        event: (name: string) => { (window as any).__trackedEvents.push(name); },
      },
    }));
    if (navigator.clipboard) {
      Object.defineProperty(navigator.clipboard, 'write', mkProp(
        () => Promise.reject(new Error('forced'))
      ));
    }
    // Force buildChartBlob to reject by making canvas.toBlob deliver null.
    // chart.astro:1531-1536 rejects with new Error('toBlob returned null') on null callback.
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', mkProp(
      function (this: HTMLCanvasElement, cb: BlobCallback) { cb(null); }
    ));
    // Sentinel: confirm share was NEVER called.
    (window as any).__shareCalled = false;
    Object.defineProperty(navigator, 'canShare', mkProp(() => true));
    Object.defineProperty(navigator, 'share', mkProp(async () => {
      (window as any).__shareCalled = true;
      return Promise.resolve();
    }));
  });

  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');

  // D-12 API guard — mirrors CHIP-01/02/03 pattern (spec:924-931).
  // WR-03: surface SSR-unavailable environments as skipped, not silently passed.
  const gridReady = page.locator('.chart__view[data-view="albums"] .chart__grid');
  test.skip(!await gridReady.isVisible().catch(() => false), 'SSR data unavailable in this environment');
  const copyBtn = page.locator('.chart__copy-btn');
  test.skip(!await copyBtn.isVisible().catch(() => false), 'copy button not rendered (SSR data unavailable)');

  await copyBtn.click();

  // WR-02: deterministic post-condition replacing waitForTimeout(500).
  // The button text reverts to 'failed' inside finish('failed') at the
  // cascade's failure terminal (chart.astro:1618), so awaiting that text
  // is bounded by the cascade's actual completion. D-07 prohibits asserting
  // button-text VOCABULARY as the contract; here the text is used only as
  // a wait signal, with the actual tier-order contract asserted below.
  await expect(copyBtn).toHaveText('failed', { timeout: 5_000 });

  // Tier-order assertions (D-07):
  // 1. share was NEVER called (buildChartBlob rejected before tier 2 could be reached).
  expect(await page.evaluate(() => (window as any).__shareCalled)).toBe(false);
  // 2. Modal did NOT open.
  await expect(page.locator('#chart-copy-modal')).not.toHaveAttribute('open', '');

  // WR-04: telemetry contract — image-build failure path fires track('copy-failed').
  await expect.poll(
    () => page.evaluate(() => (window as any).__trackedEvents),
    { timeout: 5_000 }
  ).toContain('copy-failed');
});

test('cascade: populated grid with lazy tiles reaches terminal state in bounded time (COPY-01 regression)', async ({ page }) => {
  // COPY-01 regression catch (Phase 14.1 D-07/D-08/D-09/D-10): The cascade MUST reach a terminal
  // state in bounded time on a populated grid with off-viewport lazy tiles. Pre-14.1,
  // buildChartBlob deadlocked because img.decode() never resolves on un-fetched lazy tiles;
  // the ClipboardItem promise never settled; the cascade hung at the clipboard tier.
  // Post-14.1, the 1.5s per-tile and 5s overall timeouts guarantee SOMETHING terminal lands.
  // We do NOT pin to a specific tier (D-07 lock).
  await page.addInitScript(() => {
    const mkProp = <T>(val: T): PropertyDescriptor => ({ value: val, configurable: true, writable: true });
    // WR-04: telemetry sentinel — track() invocations land in __trackedEvents.
    (window as any).__trackedEvents = [] as string[];
    Object.defineProperty(window, 'cloudflare', mkProp({
      beacon: {
        event: (name: string) => { (window as any).__trackedEvents.push(name); },
      },
    }));
    // D-09 nuance: NO mocks of navigator.clipboard.write, navigator.canShare,
    // navigator.share, or HTMLCanvasElement.prototype.toBlob — mocking any of
    // these would mask the lazy-decode deadlock. The cascade runs against real
    // browser APIs; only the telemetry sentinel is installed.
  });

  await page.setViewportSize({ width: 375, height: 812 });

  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');

  // D-12 API guard — mirrors CHIP-01/02/03 pattern (spec:924-931).
  // WR-03: surface SSR-unavailable environments as skipped (yellow), not passed (green).
  const gridReady = page.locator('.chart__view[data-view="albums"] .chart__grid');
  test.skip(!await gridReady.isVisible().catch(() => false), 'SSR data unavailable in this environment');
  const copyBtn = page.locator('.chart__copy-btn');
  test.skip(!await copyBtn.isVisible().catch(() => false), 'copy button not rendered (SSR data unavailable)');

  await copyBtn.click();

  // D-08: terminal-state pin — assert ANY of the four cascade terminals lands in
  // __trackedEvents within 8s (overall 5s budget + 3s scheduling slack).
  // COPY-01 contract: the cascade reaches A terminal state in bounded time.
  // copy-cancelled is excluded because no user dismissal (AbortError) is simulated (D-10).
  await expect.poll(
    () => page.evaluate(() => (window as any).__trackedEvents as string[]),
    { timeout: 8_000 }
  ).toEqual(expect.arrayContaining([
    expect.stringMatching(/^copy-(success|shared|modal|failed)$/),
  ]));
});
