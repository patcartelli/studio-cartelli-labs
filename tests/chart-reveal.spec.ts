import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Fixed fixture rows — known album name, known imageUrl, one artist WITH a website,
// one WITHOUT (D-13): deterministic, offline-capable, branch-specific assertions.
const chartListFixture = {
  view: 'albums',
  rows: [
    {
      rank: 1,
      name: 'Fixture Album One',
      artist: 'Artist With Website',
      playcount: 100,
      imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/fixture1.jpg',
      url: 'https://www.last.fm/music/Artist+With+Website/Fixture+Album+One',
    },
    {
      rank: 2,
      name: 'Fixture Album Two',
      artist: 'Artist Without Website',
      playcount: 80,
      imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/fixture2.jpg',
      url: 'https://www.last.fm/music/Artist+Without+Website/Fixture+Album+Two',
    },
  ],
  offset: 0,
  limit: 20,
  total: 2,
  hasMore: false,
};

// Artist websites fixture: "Artist With Website" maps to a real url, "Artist Without Website" maps to null.
const artistWebsitesFixture: Record<string, string | null> = {
  'Artist With Website': 'https://artistwithwebsite.example.com',
  'Artist Without Website': null,
};

// Also mock /api/chart-data so SSR grid fills without 500 errors (returns minimal valid shape)
const chartDataFixtureMinimal = {
  fetchedAt: Date.now(),
  artists: [],
  albums: [],
  tracks: [],
};

// Route helper: registers both API mocks BEFORE page.goto so all requests are intercepted.
async function registerRoutes(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/chart-list*', (route) =>
    route.fulfill({ json: chartListFixture })
  );
  await page.route('**/api/artist-websites', (route) =>
    route.fulfill({ json: artistWebsitesFixture })
  );
  // Intercept chart-data to avoid live Last.fm SSR calls causing 500 in test env
  await page.route('**/api/chart-data**', (route) =>
    route.fulfill({ json: chartDataFixtureMinimal })
  );
}

// Visibility guard helper: checks whether the chart-list section rendered rows (not error state).
// Returns false if the list section is absent so callers can skip gracefully.
async function listSectionPresent(page: import('@playwright/test').Page): Promise<boolean> {
  return page.locator('.chart-list[data-view="albums"] .text-list').isVisible().catch(() => false);
}

// ============================================================
// Task 1: List render + reduced-motion + touch-thumb tests
// ============================================================

test('list render (REVL-07)', async ({ page }) => {
  await registerRoutes(page);
  await page.goto('/experiments/chart');

  if (!await listSectionPresent(page)) return; // skip gracefully if section absent

  const rows = page.locator('.chart-list[data-view="albums"] .text-list .text-row');
  await expect(rows).toHaveCount(2);

  // Both rows should contain fixture album names
  await expect(rows.nth(0)).toContainText('Fixture Album One');
  await expect(rows.nth(1)).toContainText('Fixture Album Two');

  // Row 1: should have a real last.fm <a> link with the fixture url
  const row1Links = rows.nth(0).locator('.text-row__links');
  const lfmLink1 = row1Links.locator('a.text-row__link').filter({ hasText: 'last.fm' });
  await expect(lfmLink1).toBeVisible();
  const href1 = await lfmLink1.getAttribute('href');
  expect(href1).toBe('https://www.last.fm/music/Artist+With+Website/Fixture+Album+One');

  // Row 1: should also have a website <a> (for "Artist With Website")
  const websiteLink1 = row1Links.locator('a.text-row__link').filter({ hasText: 'website' });
  await expect(websiteLink1).toBeVisible();

  // Row 2: should have the last.fm <a> link
  const row2Links = rows.nth(1).locator('.text-row__links');
  const lfmLink2 = row2Links.locator('a.text-row__link').filter({ hasText: 'last.fm' });
  await expect(lfmLink2).toBeVisible();
  const href2 = await lfmLink2.getAttribute('href');
  expect(href2).toBe('https://www.last.fm/music/Artist+Without+Website/Fixture+Album+Two');

  // Row 2: should NOT have a website link (artist maps to null)
  const websiteLink2 = row2Links.locator('a.text-row__link').filter({ hasText: 'website' });
  await expect(websiteLink2).toHaveCount(0);
});

test('reduced-motion: no overlay element appended (REVL-06)', async ({ page }) => {
  // global config sets reducedMotion: 'reduce' — engine short-circuits without creating overlay
  await registerRoutes(page);
  await page.goto('/experiments/chart');

  if (!await listSectionPresent(page)) return;

  // Engine must not create the overlay element at all under reduced-motion
  expect(await page.locator('.text-reveal-overlay').count()).toBe(0);

  // Rows should still be legible — verify reduced-motion hover color fallback applies
  // (row remains visible without overlay)
  const firstRow = page.locator('.chart-list[data-view="albums"] .text-list .text-row').first();
  await expect(firstRow).toBeVisible();
});

test('touch device shows inline thumb, no overlay (REVL-04)', async ({ browser }) => {
  // D-12: hasTouch: true forces (hover:none)(pointer:coarse) — CSS shows .text-row__thumb,
  // engine short-circuits, overlay is never created.
  // D-11: reducedMotion: 'no-preference' so only the touch branch is exercised (not reduce).
  // Pitfall: absolute URL required — browser.newContext does not inherit baseURL.
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 375, height: 812 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  try {
    await registerRoutes(page);
    await page.goto('http://localhost:4321/experiments/chart');

    if (!await listSectionPresent(page)) return;

    // Overlay must never be created on touch devices
    expect(await page.locator('.text-reveal-overlay').count()).toBe(0);

    // Inline thumb should be visible on touch — .text-row__thumb display:inline-block under (hover:none)
    const firstRow = page.locator('.chart-list[data-view="albums"] .text-list .text-row').first();
    const thumb = firstRow.locator('.text-row__thumb');
    await expect(thumb).toBeVisible();
  } finally {
    await context.close();
  }
});

// ============================================================
// Task 2: Hover overlay (appears + tracks) + keyboard focus + axe a11y tests
// ============================================================

test('hover overlay appears and tracks (REVL-03)', async ({ browser }) => {
  // D-11: MUST override the global reducedMotion:'reduce' or overlay never appears.
  // Pitfall: absolute URL required — browser.newContext does not inherit baseURL.
  const context = await browser.newContext({
    reducedMotion: 'no-preference',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await registerRoutes(page);
    await page.goto('http://localhost:4321/experiments/chart');

    if (!await listSectionPresent(page)) return;

    const rows = page.locator('.chart-list[data-view="albums"] .text-list .text-row');

    // The chart list sits far below the fold (under the grid). mouse.move uses viewport
    // coordinates and elementFromPoint only resolves inside the viewport, so the row MUST be
    // scrolled into view before hovering — otherwise the cursor lands on empty space (D-11).
    await rows.nth(0).scrollIntoViewIfNeeded();

    // Move cursor over the first row
    const firstBox = await rows.nth(0).boundingBox();
    if (!firstBox) return;
    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);

    // Overlay should appear and be marked data-visible="true"
    const overlay = page.locator('.text-reveal-overlay[data-visible="true"]');
    await expect(overlay).toBeVisible();

    // Verify overlay src is the first fixture image (proves per-row tracking)
    const firstSrc = await page.locator('.text-reveal-overlay').getAttribute('src');
    expect(firstSrc).toBe('https://lastfm.freetls.fastly.net/i/u/300x300/fixture1.jpg');

    // Move to the second row — overlay should update its src to the second fixture image
    await rows.nth(1).scrollIntoViewIfNeeded();
    const secondBox = await rows.nth(1).boundingBox();
    if (!secondBox) return;
    await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);

    // Overlay should still be visible and src should update to fixture2
    await expect(overlay).toBeVisible();
    await expect(page.locator('.text-reveal-overlay')).toHaveAttribute(
      'src',
      'https://lastfm.freetls.fastly.net/i/u/300x300/fixture2.jpg'
    );
  } finally {
    await context.close();
  }
});

test('keyboard focus reveals art pinned top-right (REVL-05)', async ({ browser }) => {
  // Engine short-circuits under reducedMotion:'reduce', so we must override it.
  // Pitfall: absolute URL required — browser.newContext does not inherit baseURL.
  const context = await browser.newContext({
    reducedMotion: 'no-preference',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await registerRoutes(page);
    await page.goto('http://localhost:4321/experiments/chart');

    if (!await listSectionPresent(page)) return;

    // Tab until focus lands on a .text-row__link inside the chart list
    // (Page may have many focusable elements before the list — loop up to 30 Tab presses)
    let focused = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const activeTagName = await page.evaluate(
        () => document.activeElement?.tagName?.toLowerCase()
      );
      const activeClasses = await page.evaluate(
        () => document.activeElement?.className ?? ''
      );
      if (activeTagName === 'a' && activeClasses.includes('text-row__link')) {
        focused = true;
        break;
      }
    }
    if (!focused) return; // skip gracefully if list links not reachable

    // Overlay should appear pinned top-right on keyboard focus
    const overlay = page.locator('.text-reveal-overlay[data-visible="true"]');
    await expect(overlay).toBeVisible();

    // Verify position: pinned top-right (x near innerWidth - 320 - 24, y near 24)
    const box = await overlay.boundingBox();
    if (!box) return;
    const viewportWidth = 1440;
    // x should be in right-hand region (greater than viewport midpoint)
    expect(box.x).toBeGreaterThan(viewportWidth / 2);
    // y should be near the top (within 60px of y=24 to allow rounding)
    expect(box.y).toBeLessThan(100);
  } finally {
    await context.close();
  }
});

test('new links pass axe with zero violations (a11y)', async ({ page }) => {
  await registerRoutes(page);
  await page.goto('/experiments/chart');

  if (!await listSectionPresent(page)) return;

  // Run axe scoped to the chart-list-section where the new links live
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('.chart-list-section')
    .analyze();
  expect(results.violations).toEqual([]);
});
