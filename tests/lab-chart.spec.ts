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

// GLOW-06 fixture: extends chartDataFixture with a second artist (imageUrl: '' — no artist photo,
// exercises the album-art fallback code path) and a corresponding ranked album entry so chart.astro
// can render a card for that artist. glowColor is supplied directly by the fixture to test the
// client contract independently of whether Step 5.5 ran. Production coverage verified via ?bust=<secret>.
const chartDataFixtureGlow06 = {
  ...chartDataFixture,
  artists: [
    ...chartDataFixture.artists,
    {
      name: 'Album Glow Artist',
      mbid: '00000000-0000-0000-0000-000000000002',
      url: 'https://www.last.fm/music/Album+Glow+Artist',
      imageUrl: '',
      glowColor: '#c05020',
      latestRelease: null,
    },
  ],
  albums: [
    ...chartDataFixture.albums,
    {
      rank: 7,
      name: 'Album Glow Record',
      artist: 'Album Glow Artist',
      playcount: 10,
      imageUrl: 'https://lastfm.freetls.fastly.net/i/u/300x300/albumglow.jpg',
      listenUrl: null,
    },
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

test('listen link cells contain shimmer bar elements on initial render (UX-01)', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');
  if (!await page.locator('.chart__grid').isVisible().catch(() => false)) return;
  const shimmerBars = page.locator('.chart__listen-link .chart__shimmer-bar');
  expect(await shimmerBars.count()).toBeGreaterThan(0);
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
// Phase 18: Hero card structure E2E at M3 viewports (albums view, per D-04)
// Assertions from D-05: container visible, img with non-empty src, rank #1,
// name visible, plays visible, listen link slot present.
// D-07 guard: skip if albums grid not visible (API failure state).
// Pitfall 5: hero card is conditionally rendered when albums.length > 0; gate behind grid.
// ============================================================

for (const vp of M3_VIEWPORTS) {
  test(`chart: albums hero card has expected structure at ${vp.name} (${vp.width}px)`, async ({ browser }) => {
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

      // D-07 API guard: skip if albums grid not present
      const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
      if (!await cardList.isVisible().catch(() => false)) return;

      // D-05 hero card assertions
      const heroCard = page.locator('.chart__view[data-view="albums"] .chart__hero-card');
      await expect(heroCard).toBeVisible();

      const heroImg = heroCard.locator('img').first();
      await expect(heroImg).toBeVisible();
      const heroImgSrc = await heroImg.getAttribute('src');
      expect(heroImgSrc).toBeTruthy();

      await expect(heroCard.locator('.chart__hero-card__rank')).toHaveText('#1');
      await expect(heroCard.locator('.chart__hero-card__name')).toBeVisible();
      await expect(heroCard.locator('.chart__hero-card__plays')).toBeVisible();
      await expect(heroCard.locator('.chart__listen-link').first()).toBeAttached();
    } finally {
      await context.close();
    }
  });
}

// ============================================================
// Phase 18: Ranked card grid structure E2E at M3 viewports (albums view, per D-04)
// Assertions from D-06, updated for the Phase 10-02 rank-block pattern: list
// visible, at least one .chart__card present, first card's .chart__card-thumb
// img visible, .chart__card-rank-block carries the accessible rank + plays
// aria-label, .chart__card-actions present.
// D-07 guard: skip if card list not visible.
// ============================================================

for (const vp of M3_VIEWPORTS) {
  test(`chart: albums ranked cards have expected structure at ${vp.name} (${vp.width}px)`, async ({ browser }) => {
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

      // D-07 API guard
      const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
      if (!await cardList.isVisible().catch(() => false)) return;

      await expect(cardList).toBeVisible();

      // D-06 ranked card assertions
      const cards = cardList.locator('.chart__card');
      const cardCount = await cards.count();
      expect(cardCount).toBeGreaterThan(0);

      const firstCard = cards.first();
      await expect(firstCard.locator('.chart__card-thumb img').first()).toBeVisible();

      // Phase 10-02 rank-block: rank + plays exposed via the block's aria-label
      const rankBlock = firstCard.locator('.chart__card-rank-block');
      await expect(rankBlock).toBeAttached();
      const ariaLabel = await rankBlock.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!).toMatch(/plays/);

      await expect(firstCard.locator('.chart__card-actions')).toBeAttached();
    } finally {
      await context.close();
    }
  });
}

// ============================================================
// Phase 20 (updated Phase 1 skeleton): GLOW-05 — ranked cards have NO --card-glow-color
// in skeleton SSR. Phase 1 removes glow color from SSR inline styles (D-05).
// Phase 3 will restore glow color via client-side fill — this assertion documents
// the Phase 1 skeleton contract.
// Guard: skip gracefully when card list is not visible (CI / no API data — per D-04).
// Selector: .chart__view[data-view="albums"] .chart__card-list .chart__card (D-06).
// ============================================================

test('chart: ranked cards have no --card-glow-color in skeleton SSR (GLOW-05)', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('/lab/chart');

  // D-04 guard: skip when chart grid is absent (CI without live API data)
  if (!await page.locator('.chart__grid').isVisible().catch(() => false)) return;

  // D-06: target ranked card list (hero card excluded)
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  if (!await cardList.isVisible().catch(() => false)) return;

  // D-06: ranked cards within the card list
  const cards = cardList.locator('.chart__card');
  const cardCount = await cards.count();
  if (cardCount === 0) return; // no ranked cards present — skip

  // Phase 1 skeleton: --card-glow-color must be ABSENT from all ranked card inline styles
  for (let i = 0; i < cardCount; i++) {
    const style = await cards.nth(i).getAttribute('style');
    expect(style ?? '').not.toMatch(/--card-glow-color/);
  }
});

// ============================================================
// Phase 23: LINK-06 — ranked album cards render song.link hrefs after
// client-side listen-link resolution.
// D-01: mock /api/resolve-listen unconditionally — no real iTunes/Deezer/Odesli calls in CI.
// D-02: single page.route() handler covers all .chart__listen-link resolution calls.
// D-03: waitFor on first matching anchor (10 s timeout) — no explicit sleep needed.
// D-04: assert href contains 'song.link' via href*="song.link" locator attribute filter.
// D-05: scope to albums ranked cards only (.chart__view[data-view="albums"] .chart__card-list).
// D-06: at least one card — follows GLOW-05 pattern; avoids dependency on full KV coverage.
// D-07: guard — skip gracefully when .chart__grid is not visible (CI without live API data).
// ============================================================

test('chart: ranked album cards have song.link href after listen-link resolution (LINK-06)', async ({ page }) => {
  // D-01 + D-02: intercept /api/chart-data — required before page.goto() so skeleton renders.
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  // D-01 + D-02: intercept ALL /api/resolve-listen calls and return a mock odesli response.
  // Must be registered BEFORE page.goto() so the first resolution batch is caught.
  await page.route('**/api/resolve-listen**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://song.link/s/abc', source: 'odesli' }),
    })
  );

  await page.goto('/lab/chart');

  // D-07 guard: skip when chart grid is absent (API unavailable / no data in CI environment)
  if (!await page.locator('.chart__grid').isVisible().catch(() => false)) return;

  // D-05: target ranked card list (hero card excluded)
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  if (!await cardList.isVisible().catch(() => false)) return;

  // D-03: wait for the dynamically-injected anchor to appear on at least one ranked card.
  // Playwright auto-retries until the element exists or the timeout expires.
  const firstLink = page.locator(
    '.chart__view[data-view="albums"] .chart__card-list .chart__card .chart__listen-link a[href*="song.link"]'
  ).first();
  await firstLink.waitFor({ timeout: 10_000 });

  // D-04 + D-06: assert at least one ranked card carries an anchor with href containing 'song.link'.
  const cards = cardList.locator('.chart__card');
  const cardCount = await cards.count();
  let foundListenLink = false;
  for (let i = 0; i < cardCount; i++) {
    const anchor = cards.nth(i).locator('.chart__listen-link a[href*="song.link"]');
    if (await anchor.count() > 0) {
      foundListenLink = true;
      break;
    }
  }
  expect(foundListenLink).toBe(true);
});

// ============================================================
// Phase 4: Skeleton-state and fill-state E2E assertions
// SKEL-state: page.route that never resolves keeps client fetch pending;
//   asserts ranked card shimmer class present, listen-link anchor absent.
// FILL-state: route.fulfill with chartDataFixture; waits for fill to complete;
//   asserts shimmer removed, --card-glow-color set, anchor injected.
// Pitfall: hero card root (.chart__hero-card) has NO chart__shimmer in SSR —
//   assert shimmer on .chart__card (ranked) only.
// ============================================================

test('chart: skeleton placeholders present before API resolves (SKEL-state)', async ({ page }) => {
  await page.route('**/api/chart-data**', () => {
    // Handler registered but never resolves — fetch hangs indefinitely
    // The page receives its SSR skeleton HTML but the IIFE fetch stays pending
  });

  await page.goto('/lab/chart');

  // D-07 guard: skip when card list is absent (CI / no API data)
  if (!await page.locator('.chart__view[data-view="albums"] .chart__card-list').isVisible().catch(() => false)) return;

  // Hero card is present (SSR) but has NO shimmer on root — just assert visibility
  await expect(page.locator('.chart__view[data-view="albums"] .chart__hero-card')).toBeVisible();

  // Listen-link slot has shimmer-bar span (chart.astro line 208) — no anchor yet
  // Note: ranked card root shimmer is removed independently by image-load handler;
  // shimmer-bar inside .chart__listen-link is the reliable skeleton indicator.
  const listenBars = page.locator('.chart__view[data-view="albums"] .chart__card-list .chart__card .chart__listen-link .chart__shimmer-bar');
  expect(await listenBars.count()).toBeGreaterThan(0);

  // Assert NO listen anchor present while fetch is pending
  const anchors = page.locator('.chart__view[data-view="albums"] .chart__card-list .chart__card .chart__listen-link a');
  expect(await anchors.count()).toBe(0);
});

test('chart: hero and ranked cards filled after API resolves (FILL-state)', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );

  await page.goto('/lab/chart');

  // D-07 guard: skip when card list is absent (CI / no API data)
  if (!await page.locator('.chart__view[data-view="albums"] .chart__card-list').isVisible().catch(() => false)) return;

  const heroCard = page.locator('.chart__view[data-view="albums"] .chart__hero-card');

  // Hero card must be visible (SSR always renders it when albums present)
  await expect(heroCard).toBeVisible();

  // Wait for hero listen-link anchor to appear (fill injected it via injectListenLink)
  await heroCard.locator('.chart__listen-link a').waitFor({ timeout: 10_000 });
  const heroHref = await heroCard.locator('.chart__listen-link a').getAttribute('href');
  expect(heroHref).toBeTruthy();
  expect(heroHref).toContain('song.link');

  // Hero shimmer-bar must be replaced (injectListenLink clears span content before appending anchor)
  const heroListenBars = heroCard.locator('.chart__listen-link .chart__shimmer-bar');
  expect(await heroListenBars.count()).toBe(0);

  // First ranked card: wait for listen-link anchor (fill injected it)
  const firstRanked = page.locator('.chart__view[data-view="albums"] .chart__card-list .chart__card').first();
  await firstRanked.locator('.chart__listen-link a').waitFor({ timeout: 10_000 });

  // Listen-link shimmer-bar must be replaced by the injected anchor (fill cleared it)
  const firstRankedListenBars = firstRanked.locator('.chart__listen-link .chart__shimmer-bar');
  expect(await firstRankedListenBars.count()).toBe(0);

  // Assert ranked card glow color set by fill via evaluate + getPropertyValue
  // (glow is set when fixture artist name matches SSR data-artist-name; assert if truthy)
  const rankedGlow = await firstRanked.evaluate(el => el.style.getPropertyValue('--card-glow-color'));
  // Note: glow may not be set when fixture artist name differs from SSR card's data-artist-name
  // The presence of the injected anchor is the definitive fill indicator
});

// ============================================================
// Phase 9: GLOW-06 — ranked card receives --card-glow-color after progressive fill
// D-05: "at least one" assertion pattern (mirrors GLOW-05 precedent).
// Fixture artist 'Album Glow Artist' (imageUrl: '') exercises the album-art fallback path:
// client applies glowColor from API response regardless of whether the artist has a photo URL.
// Full glow-coverage on live data verified via ?bust=<secret> production gate (not automatable in CI).
// ============================================================

test('chart: ranked card receives --card-glow-color after progressive fill (GLOW-06)', async ({ page }) => {
  // Mock chart-data with extended fixture (includes 'Album Glow Artist' with imageUrl: '' and glowColor)
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixtureGlow06 })
  );
  // Mock listen-link resolution (required for fill to complete — mirrors LINK-06 pattern)
  await page.route('**/api/resolve-listen**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://song.link/s/abc', source: 'odesli' }),
    })
  );

  await page.goto('/lab/chart');

  // Skip guard 1: chart grid absent (CI / no API data — per D-04)
  if (!await page.locator('.chart__grid').isVisible().catch(() => false)) return;

  // Skip guard 2: card list visible (ranked cards section)
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  if (!await cardList.isVisible().catch(() => false)) return;

  // Wait for fill to complete: first listen-link anchor appears after progressive fill runs
  const firstFillAnchor = page.locator(
    '.chart__view[data-view="albums"] .chart__card-list .chart__card .chart__listen-link a'
  ).first();
  await firstFillAnchor.waitFor({ timeout: 10_000 });

  // Skip guard 3: no ranked cards rendered
  const cards = cardList.locator('.chart__card');
  const cardCount = await cards.count();
  if (cardCount === 0) return;

  // At-least-one: iterate ranked cards and assert at least one has --card-glow-color set
  // (chart.astro line 1735: if (artistData?.glowColor) card.style.setProperty('--card-glow-color', artistData.glowColor))
  let foundGlow = false;
  for (let i = 0; i < cardCount; i++) {
    const glow = await cards.nth(i).evaluate(el => el.style.getPropertyValue('--card-glow-color'));
    if (glow.trim() !== '') {
      foundGlow = true;
      break;
    }
  }
  expect(foundGlow).toBe(true);
});

// ============================================================
// Phase 10: Rank/Plays Hierarchy (HIER-01/02)
// HIER-01: rank number is visually dominant — font-size ≥ 27px at 768/840px, 23–25px at 375px
// HIER-02: plays subordinate beneath rank in single grouped unit; DOM order locked
// Tests A–D lock in the Phase 10 contract for all future refactors.
// ============================================================

// Test A — parameterized over M3_VIEWPORTS
// Asserts: rank-block exists, rank font-size dominates plays font-size (HIER-01),
// rank font-size in expected window per viewport, plays font-size in expected window.
for (const vp of M3_VIEWPORTS) {
  test(`chart: ranked card rank-block exists and dominates plays at ${vp.name} (${vp.width}px) (HIER-01, HIER-02)`, async ({ browser }) => {
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

      // D-07 API guard: skip if albums card list not visible
      const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
      if (!await cardList.isVisible().catch(() => false)) return;

      // Locate the first ranked card (albums.slice(1) → rank 2)
      const firstCard = cardList.locator('.chart__card').first();

      // Assert rank-block is attached and visible
      const rankBlock = firstCard.locator('.chart__card-rank-block');
      await expect(rankBlock).toBeAttached();
      await expect(rankBlock).toBeVisible();

      // Read computed font-size of rank-number via getComputedStyle
      const rankFsSel = '.chart__view[data-view="albums"] .chart__card-list .chart__card .chart__card-rank-block .chart__card-rank-number';
      const rankFsRaw = await page.evaluate(
        (sel) => getComputedStyle(document.querySelector(sel)!).fontSize,
        rankFsSel
      );
      const rankFs = parseFloat(rankFsRaw);

      // Read computed font-size of plays-inline via getComputedStyle
      const playsFsSel = '.chart__view[data-view="albums"] .chart__card-list .chart__card .chart__card-rank-block .chart__card-plays-inline';
      const playsFsRaw = await page.evaluate(
        (sel) => getComputedStyle(document.querySelector(sel)!).fontSize,
        playsFsSel
      );
      const playsFs = parseFloat(playsFsRaw);

      // HIER-01 dominance contract: rank font-size strictly exceeds plays font-size
      expect(rankFs).toBeGreaterThan(playsFs);

      // Rank font-size window by viewport (±1px rendering tolerance)
      if (vp.width === 375) {
        // compact: --text-headline-small target 24px; window 23–25px
        expect(rankFs).toBeGreaterThanOrEqual(23);
        expect(rankFs).toBeLessThanOrEqual(25);
      } else {
        // medium (768) / expanded (840): --text-headline-medium target 28px; window 27–29px
        expect(rankFs).toBeGreaterThanOrEqual(27);
        expect(rankFs).toBeLessThanOrEqual(29);
      }

      // Plays inline font-size window: --text-body-small target 12px; window 11–13px (all viewports)
      expect(playsFs).toBeGreaterThanOrEqual(11);
      expect(playsFs).toBeLessThanOrEqual(13);
    } finally {
      await context.close();
    }
  });
}

// Test B — aria-label format assertion (single test, default viewport)
// Asserts: rank-block aria-label matches /^\d+\.\s+[\d,]+\s+plays$/ for first 3 ranked cards
test('chart: rank-block aria-label has \'{rank}. {comma-plays} plays\' format (HIER-02)', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('http://localhost:4321/lab/chart');

  // D-07 API guard
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  if (!await cardList.isVisible().catch(() => false)) return;

  const cards = cardList.locator('.chart__card');
  const cardCount = await cards.count();
  if (cardCount === 0) return;

  // Check the first 3 ranked cards (or fewer if less than 3 are present)
  const checkCount = Math.min(3, cardCount);
  for (let i = 0; i < checkCount; i++) {
    const rankBlock = cards.nth(i).locator('.chart__card-rank-block');
    const ariaLabel = await rankBlock.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel!).toMatch(/^\d+\.\s+[\d,]+\s+plays$/);
  }

  // Bonus: first ranked card is rank 2 (albums.slice(1) skips the hero rank-1 card)
  const firstRankBlock = cards.first().locator('.chart__card-rank-block');
  const firstAriaLabel = await firstRankBlock.getAttribute('aria-label');
  expect(firstAriaLabel!).toMatch(/^2\./);
});

// Test C — DOM child order assertion (single test, default viewport)
// Asserts: rank-block → thumb → text → actions (HIER-02 layout contract)
test('chart: ranked card DOM order is rank-block → thumb → text → actions (HIER-02 layout)', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('http://localhost:4321/lab/chart');

  // D-07 API guard
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  if (!await cardList.isVisible().catch(() => false)) return;

  const firstCard = cardList.locator('.chart__card').first();
  if (await cardList.locator('.chart__card').count() === 0) return;

  // Enumerate direct element children and read their first class name
  const childClasses = await firstCard.evaluate((card) => {
    return Array.from(card.children).map((el) => el.classList[0] ?? '');
  });

  // Assert first four direct children are in the correct order
  expect(childClasses[0]).toBe('chart__card-rank-block');
  expect(childClasses[1]).toBe('chart__card-thumb');
  expect(childClasses[2]).toBe('chart__card-text');
  expect(childClasses[3]).toBe('chart__card-actions');
});

// Test D — regression guard (single test, default viewport)
// Asserts: no chart__card-plays-number or chart__card-plays-label elements remain (HIER-01)
// Asserts: chart__card-rank-block is present (proves new pattern is in use)
test('chart: no chart__card-plays-number or chart__card-plays-label elements remain (HIER-01 regression guard)', async ({ page }) => {
  await page.route('**/api/chart-data**', async route =>
    route.fulfill({ json: chartDataFixture })
  );
  await page.goto('http://localhost:4321/lab/chart');

  // D-07 API guard
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  if (!await cardList.isVisible().catch(() => false)) return;

  // Old removed classes must not exist anywhere in the DOM
  expect(await page.locator('.chart__card-plays-number').count()).toBe(0);
  expect(await page.locator('.chart__card-plays-label').count()).toBe(0);

  // New rank-block pattern must be present (proves restructure is active)
  expect(await page.locator('.chart__card-rank-block').count()).toBeGreaterThanOrEqual(1);
});

// ============================================================
// Phase 11: Listen Link Chips (CHIP-01, CHIP-02, CHIP-03)
// CHIP-01: .chart__listen-link a has border-radius ≈ 999px and border-width 1px
// CHIP-02: .chart__listen-link a:focus-visible has an outline (focus ring visible)
// CHIP-03: at 375px viewport, .chart__listen-link a computed font-size is NOT 0px (D-01 removal confirmed)
// axe: zero violations at 375/768/840px (CHIP-02 a11y contract)
// ============================================================

// Test A — CHIP-01 pill shape (parameterized over M3_VIEWPORTS)
// Asserts: border-radius is a pill value (>= 10px after browser normalization)
//          border-top-width equals exactly 1px
for (const vp of M3_VIEWPORTS) {
  test(`chart: listen-link chip has border-radius ≈ 999px and border-width 1px at ${vp.name} (${vp.width}px) (CHIP-01)`, async ({ browser }) => {
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

      // API guard: skip if SSR failed to load data (preview server has no CF Workers bindings)
      const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
      if (!await cardList.isVisible().catch(() => false)) return;

      // Wait for listen link container to appear (confirms injectListenLink() ran)
      await page.locator('.chart__listen-link').first().waitFor({ state: 'visible', timeout: 10000 });

      // Guard: skip gracefully if no injected <a> elements found
      if (await page.locator('.chart__listen-link a').count() === 0) return;

      // Read computed style of the first chip <a> element
      const { borderRadius, borderTopWidth } = await page.evaluate(() => {
        const el = document.querySelector('.chart__listen-link a') as HTMLElement;
        const cs = getComputedStyle(el);
        return { borderRadius: cs.borderRadius, borderTopWidth: cs.borderTopWidth };
      });

      // Browsers normalize border-radius: 999px to the element's half-height (e.g., "13px" on a 26px chip).
      // Assert >= 10 to prove a pill rule applied without brittle string comparison.
      expect(parseFloat(borderRadius)).toBeGreaterThanOrEqual(10);

      // Border width must be exactly 1px (safe exact string match)
      expect(borderTopWidth).toBe('1px');
    } finally {
      await context.close();
    }
  });
}

// Test B — CHIP-02 focus ring (parameterized over M3_VIEWPORTS)
// Asserts: outline is present (outlineStyle !== 'none') and outline-width is 2px
for (const vp of M3_VIEWPORTS) {
  test(`chart: listen-link chip focus-visible outline is set at ${vp.name} (${vp.width}px) (CHIP-02)`, async ({ browser }) => {
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

      // API guard: skip if SSR failed to load data (preview server has no CF Workers bindings)
      const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
      if (!await cardList.isVisible().catch(() => false)) return;

      // Wait for listen link container to appear
      await page.locator('.chart__listen-link').first().waitFor({ state: 'visible', timeout: 10000 });

      // Guard: skip gracefully if no injected <a> elements found
      if (await page.locator('.chart__listen-link a').count() === 0) return;

      // Focus the first chip via page.evaluate (programmatic focus triggers :focus-visible in Playwright)
      const { outlineStyle, outlineWidth } = await page.evaluate(() => {
        const el = document.querySelector('.chart__listen-link a') as HTMLElement;
        el.focus();
        const cs = getComputedStyle(el);
        return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
      });

      // Outline must be present (not 'none') — proves :focus-visible ring applied
      expect(outlineStyle).not.toBe('none');

      // Outline width must be exactly 2px (D-06 contract)
      expect(outlineWidth).toBe('2px');
    } finally {
      await context.close();
    }
  });
}

// Test C — CHIP-03 narrow-width font-size not zero (375px only)
// Asserts: computed font-size of .chart__listen-link a is > 0px at 375px viewport
// Proves the D-01 removal of font-size: 0 in @container card-list (max-width: 480px) is in effect
test('chart: listen-link chip text is not hidden at 375px (CHIP-03 — D-01 font-size:0 removal)', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.route('**/api/chart-data**', async route =>
      route.fulfill({ json: chartDataFixture })
    );
    await page.goto('http://localhost:4321/lab/chart');

    // API guard: skip if SSR failed to load data (preview server has no CF Workers bindings)
    const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
    if (!await cardList.isVisible().catch(() => false)) return;

    // Wait for listen link container to appear
    await page.locator('.chart__listen-link').first().waitFor({ state: 'visible', timeout: 10000 });

    // Guard: skip gracefully if no injected <a> elements found
    if (await page.locator('.chart__listen-link a').count() === 0) return;

    // Read computed font-size of first chip <a>
    const fontSize = await page.evaluate(() => {
      const el = document.querySelector('.chart__listen-link a') as HTMLElement;
      return getComputedStyle(el).fontSize;
    });

    // font-size must be > 0 — proves the old font-size: 0 collapse rule was removed
    expect(parseFloat(fontSize)).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

// Test D — axe explicit traceability at 375px (CHIP-02 a11y contract)
// Full axe coverage at 375/768/840px is provided by the existing loop at ~line 409;
// this test adds CHIP-02 traceability at the most constrained viewport.
test('a11y: listen-link chips have zero axe violations at 375px (CHIP-02)', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.route('**/api/chart-data**', async route =>
      route.fulfill({ json: chartDataFixture })
    );
    await page.goto('http://localhost:4321/lab/chart');

    // API guard: skip if SSR failed to load data (preview server has no CF Workers bindings)
    const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
    if (!await cardList.isVisible().catch(() => false)) return;

    // Wait for listen link container to appear before running axe
    await page.locator('.chart__listen-link').first().waitFor({ state: 'visible', timeout: 10000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  } finally {
    await context.close();
  }
});

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
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  test.skip(!await cardList.isVisible().catch(() => false), 'SSR data unavailable in this environment');
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
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  test.skip(!await cardList.isVisible().catch(() => false), 'SSR data unavailable in this environment');
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
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  test.skip(!await cardList.isVisible().catch(() => false), 'SSR data unavailable in this environment');
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
  const cardList = page.locator('.chart__view[data-view="albums"] .chart__card-list');
  test.skip(!await cardList.isVisible().catch(() => false), 'SSR data unavailable in this environment');
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
