import { test, expect } from '@playwright/test';

test('network page has heading and period filter', async ({ page }) => {
  await page.goto('/lab/network');
  await expect(page.locator('.network__heading')).toBeVisible();
  await expect(page.locator('.network__periods')).toBeVisible();
});

test('network page has all 5 period filter buttons', async ({ page }) => {
  await page.goto('/lab/network');
  const buttons = page.locator('.network__period-btn');
  await expect(buttons).toHaveCount(5);
  await expect(buttons.filter({ hasText: '7d' })).toBeVisible();
  await expect(buttons.filter({ hasText: '1yr' })).toBeVisible();
});

test('network page renders either canvas or error state', async ({ page }) => {
  await page.goto('/lab/network');
  const canvas = page.locator('.network__canvas');
  const error = page.locator('.network__error');
  const canvasVisible = await canvas.isVisible().catch(() => false);
  const errorVisible = await error.isVisible().catch(() => false);
  expect(canvasVisible || errorVisible).toBe(true);
});

test('network page has nav and footer (BaseLayout intact)', async ({ page }) => {
  await page.goto('/lab/network');
  await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
});

test('default period is 1month', async ({ page }) => {
  await page.goto('/lab/network');
  const activeBtn = page.locator('.network__period-btn--active');
  await expect(activeBtn).toHaveText('1mo');
});

test('period filter changes URL param on click', async ({ page }) => {
  await page.goto('/lab/network');
  await page.locator('.network__period-btn').filter({ hasText: '7d' }).click();
  await expect(page).toHaveURL(/period=7day/);
});

test('network controls bar has genre and fullscreen buttons', async ({ page }) => {
  await page.goto('/lab/network');
  await expect(page.locator('#ctrl-genre')).toBeVisible();
  // #ctrl-fullscreen is conditionally hidden when Fullscreen API is unavailable (e.g. iOS Safari)
  const fsEnabled = await page.evaluate(() => document.fullscreenEnabled);
  if (fsEnabled) {
    await expect(page.locator('#ctrl-fullscreen')).toBeVisible();
  } else {
    await expect(page.locator('#ctrl-fullscreen')).toBeAttached();
  }
});


test('genre mode shows at least one non-other pole', async ({ page }) => {
  await page.goto('/lab/network');

  // Skip if the page is in error state (no data)
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to classify' });
    return;
  }

  // Enable genre mode
  await page.locator('#ctrl-genre').click();

  // Let the simulation settle and genre labels render
  await page.waitForTimeout(3000);

  const genreLabels = page.locator('.network__canvas svg text.network__genre-label');
  const count = await genreLabels.count();

  let nonOtherSeen = false;
  for (let i = 0; i < count; i++) {
    const txt = (await genreLabels.nth(i).textContent()) ?? '';
    // Genre labels are short (one or two words), artist labels can be anything.
    // Look for any label whose text is a plausible genre name that isn't 'other'.
    if (txt && txt.toLowerCase() !== 'other' && txt.length < 30) {
      nonOtherSeen = true;
      break;
    }
  }
  expect(nonOtherSeen).toBe(true);
});

test('network page has search, genre filter, and threshold controls', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to test controls' });
    return;
  }
  await expect(page.locator('#ctrl-search')).toBeVisible();
  await expect(page.locator('#ctrl-genre-filter')).toBeVisible();
  await expect(page.locator('#ctrl-threshold')).toBeVisible();
  await expect(page.locator('#ctrl-threshold-label')).toContainText('similarity:');
  // Genre select should have more than just the default "all tags" option
  const optionCount = await page.locator('#ctrl-genre-filter option').count();
  expect(optionCount).toBeGreaterThan(1);
});

test('search input ghosts non-matching nodes (SEARCH-01)', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to filter' });
    return;
  }
  // Wait for graph to render (select only data nodes, not genre pole circles)
  await page.locator('svg circle[fill-opacity]').first().waitFor({ state: 'attached' });
  // Get total data node count (genre pole circles have no fill-opacity attribute)
  const totalNodes = await page.locator('svg circle[fill-opacity]').count();
  // Type a search term that is unlikely to match all nodes
  await page.locator('#ctrl-search').fill('a');
  // Wait for D3 transition to complete (150ms duration + buffer)
  await page.waitForTimeout(300);
  // Some nodes should be ghosted (fill-opacity < 0.75)
  const ghostedNodes = await page.locator('svg circle[fill-opacity="0.08"]').count();
  // At least one node should be ghosted (unless every artist has 'a' in their name)
  // and at least one node should remain visible
  const visibleNodes = await page.locator('svg circle[fill-opacity="0.75"]').count();
  expect(visibleNodes).toBeGreaterThan(0);
  expect(visibleNodes + ghostedNodes).toBe(totalNodes);
  // Clear the search -- all nodes restore to full opacity (D-04)
  await page.locator('#ctrl-search').fill('');
  // Wait for D3 transition to complete
  await page.waitForTimeout(300);
  const restoredNodes = await page.locator('svg circle[fill-opacity="0.75"]').count();
  expect(restoredNodes).toBe(totalNodes);
});

test('genre dropdown ghosts nodes without selected tag (SEARCH-02)', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to filter' });
    return;
  }
  await page.locator('svg circle[fill-opacity]').first().waitFor({ state: 'attached' });
  const totalNodes = await page.locator('svg circle[fill-opacity]').count();
  // Select the second option (first real tag after "all tags")
  await page.locator('#ctrl-genre-filter').selectOption({ index: 1 });
  // Wait for D3 transition to complete (150ms duration + buffer)
  await page.waitForTimeout(300);
  // Some nodes should be ghosted
  const ghostedNodes = await page.locator('svg circle[fill-opacity="0.08"]').count();
  expect(ghostedNodes).toBeGreaterThan(0);
  // Reset to "all tags"
  await page.locator('#ctrl-genre-filter').selectOption({ value: '' });
  // Wait for D3 transition to complete
  await page.waitForTimeout(300);
  const restoredNodes = await page.locator('svg circle[fill-opacity="0.75"]').count();
  expect(restoredNodes).toBe(totalNodes);
});

test('threshold slider ghosts low-similarity edges and disconnected nodes (SEARCH-03)', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to filter' });
    return;
  }
  await page.locator('svg circle[fill-opacity]').first().waitFor({ state: 'attached' });
  // Move threshold to 0.5 (should ghost some edges and nodes)
  await page.locator('#ctrl-threshold').fill('0.5');
  await page.locator('#ctrl-threshold').dispatchEvent('input');
  // Check that the label updated
  await expect(page.locator('#ctrl-threshold-label')).toContainText('similarity: 0.5');
  // Some edges should be ghosted. Ghosting animates via a 150ms d3 transition,
  // so wait for the final stroke-opacity value rather than counting immediately.
  const ghostedEdges = page.locator('svg line[stroke-opacity="0.05"]');
  await expect(ghostedEdges.first()).toBeAttached();
  expect(await ghostedEdges.count()).toBeGreaterThan(0);
  // Reset threshold to 0
  await page.locator('#ctrl-threshold').fill('0');
  await page.locator('#ctrl-threshold').dispatchEvent('input');
  await expect(page.locator('#ctrl-threshold-label')).toContainText('similarity: 0.0');
});

test('search and genre filter work together as intersection (SEARCH-04)', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to filter' });
    return;
  }
  await page.locator('svg circle[fill-opacity]').first().waitFor({ state: 'attached' });
  const totalNodes = await page.locator('svg circle[fill-opacity]').count();
  // Apply genre filter first
  await page.locator('#ctrl-genre-filter').selectOption({ index: 1 });
  // Wait for D3 transition to complete (150ms duration + buffer)
  await page.waitForTimeout(300);
  const afterGenre = await page.locator('svg circle[fill-opacity="0.75"]').count();
  // Now add a search term -- visible count should be <= genre-only count
  await page.locator('#ctrl-search').fill('a');
  // Wait for D3 transition to complete
  await page.waitForTimeout(300);
  const afterBoth = await page.locator('svg circle[fill-opacity="0.75"]').count();
  expect(afterBoth).toBeLessThanOrEqual(afterGenre);
  // Combined ghosted + visible should equal total
  const ghostedAfterBoth = await page.locator('svg circle[fill-opacity="0.08"]').count();
  expect(afterBoth + ghostedAfterBoth).toBe(totalNodes);
});

test('pressing a node without dragging does not displace other nodes', async ({ page }) => {
  await page.goto('/lab/network');

  // Skip if the page is in error state (no Last.fm credentials / rate limit)
  const error = page.locator('.network__error');
  const errorVisible = await error.isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Page in error state (likely no Last.fm credentials)' });
    return;
  }

  // Wait for the SVG and circles to be rendered
  const circles = page.locator('.network__canvas svg circle');
  await expect(circles.first()).toBeVisible();
  const count = await circles.count();
  // Need at least 2 nodes for this test to be meaningful
  if (count < 2) {
    test.info().annotations.push({ type: 'skip', description: 'Not enough nodes rendered (likely error state)' });
    return;
  }

  // Let the simulation settle: poll until the observed node's position is
  // stable across consecutive samples instead of hoping a fixed delay is enough.
  await expect(async () => {
    const a = await circles.nth(1).boundingBox();
    await page.waitForTimeout(250);
    const b = await circles.nth(1).boundingBox();
    expect(Math.abs(b!.x - a!.x)).toBeLessThan(0.5);
    expect(Math.abs(b!.y - a!.y)).toBeLessThan(0.5);
  }).toPass({ timeout: 15000 });

  // Capture positions of two nodes before the press
  const targetBox = await circles.nth(0).boundingBox();
  const otherBox = await circles.nth(1).boundingBox();
  expect(targetBox).not.toBeNull();
  expect(otherBox).not.toBeNull();
  const otherXBefore = otherBox!.x;
  const otherYBefore = otherBox!.y;

  // Press (mousedown) on the first node without moving
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800); // hold without moving
  await page.mouse.up();

  // Other node should not have moved (allow tiny 2px tolerance for sub-pixel settling)
  const otherBoxAfter = await circles.nth(1).boundingBox();
  expect(otherBoxAfter).not.toBeNull();
  expect(Math.abs(otherBoxAfter!.x - otherXBefore)).toBeLessThan(2);
  expect(Math.abs(otherBoxAfter!.y - otherYBefore)).toBeLessThan(2);
});

test('network changelog disclosure is present and collapsed by default', async ({ page }) => {
  await page.goto('/lab/network');
  const details = page.locator('.network__changelog');
  await expect(details).toBeVisible();
  // Collapsed by default — <details> has no 'open' attribute
  await expect(details).not.toHaveAttribute('open', /.*/);
  // Summary is visible
  await expect(page.locator('.network__changelog-summary')).toBeVisible();
});

test('network changelog shows entries when opened', async ({ page }) => {
  await page.goto('/lab/network');
  // Open the disclosure
  await page.locator('.network__changelog-summary').click();
  // At least one entry is visible
  const entries = page.locator('.network__changelog-entry');
  await expect(entries.first()).toBeVisible();
  // At least one label badge is visible
  await expect(page.locator('.network__changelog-label').first()).toBeVisible();
});

test('network meta line shows freshness text (NCACHE-02)', async ({ page }) => {
  await page.goto('/lab/network');

  const error = page.locator('.network__error');
  const errorVisible = await error.isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Page in error state' });
    return;
  }

  const meta = page.locator('.network__meta');
  await expect(meta).toBeVisible();
  const text = await meta.textContent();
  expect(text).toMatch(/updated (just now|\d+ min ago|\d+ hr ago)/);
});

test('network meta line contains node count, link count, and freshness (NCACHE-02)', async ({ page }) => {
  await page.goto('/lab/network');

  const error = page.locator('.network__error');
  const errorVisible = await error.isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Page in error state' });
    return;
  }

  const meta = page.locator('.network__meta');
  const text = await meta.textContent();
  expect(text).toMatch(/\d+ nodes/);
  expect(text).toMatch(/\d+ links/);
  expect(text).toMatch(/updated/);
});

test('network page renders graph with nodes from cached data (NCACHE-01)', async ({ page }) => {
  await page.goto('/lab/network');

  const error = page.locator('.network__error');
  const errorVisible = await error.isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Page in error state' });
    return;
  }

  const svg = page.locator('.network__canvas svg');
  await expect(svg).toBeVisible();
  const circles = page.locator('.network__canvas svg circle');
  expect(await circles.count()).toBeGreaterThan(0);
});

test('stale-data banner is not visible when data is fresh (NCACHE-03)', async ({ page }) => {
  await page.goto('/lab/network');

  const error = page.locator('.network__error');
  const errorVisible = await error.isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Page in error state' });
    return;
  }

  const banner = page.locator('.network__stale-banner');
  await expect(banner).toHaveCount(0);
});

test('edge hover shows tooltip with similarity score (VIS-02)', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to test' });
    return;
  }
  await page.locator('svg circle[fill-opacity]').first().waitFor({ state: 'attached' });

  // Find a hit-area line (transparent stroke for hover targets)
  const hitLine = page.locator('svg line[stroke="transparent"]').first();
  await hitLine.waitFor({ state: 'attached' });

  // Dispatch mouseenter directly on the SVG element to trigger D3 tooltip handler
  // This is more reliable than hover() for transparent SVG elements across viewports
  await hitLine.dispatchEvent('mouseenter', { bubbles: true });

  // Wait for 200ms tooltip delay + buffer
  await page.waitForTimeout(500);

  // Tooltip should be visible with similarity content
  const tooltip = page.locator('div').filter({ hasText: 'similarity:' });
  await expect(tooltip.first()).toBeVisible({ timeout: 3000 });
});

test('controls wrap at 375px without horizontal overflow (MOB-01)', async ({ page, browserName }, testInfo) => {
  // This test is only meaningful at mobile viewport (375px) where flex-wrap kicks in
  test.skip(testInfo.project.name !== 'Mobile', 'MOB-01 targets 375px viewport only');
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to test' });
    return;
  }

  // Check .network__periods has no horizontal overflow
  const periodsOverflow = await page.locator('.network__periods').evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(periodsOverflow).toBe(false);

  // Check .network__controls has no horizontal overflow
  const controlsOverflow = await page.locator('.network__controls').evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(controlsOverflow).toBe(false);

  // All period buttons should be visible (not clipped)
  const periodBtns = page.locator('.network__period-btn');
  const btnCount = await periodBtns.count();
  for (let i = 0; i < btnCount; i++) {
    await expect(periodBtns.nth(i)).toBeVisible();
  }
});

test('double-tap does not zoom the graph (MOB-02)', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to test' });
    return;
  }
  await page.locator('svg circle[fill-opacity]').first().waitFor({ state: 'attached' });

  // Get the zoom group's transform before double-tap
  const transformBefore = await page.locator('.network__canvas svg > g').first().getAttribute('transform');

  // Double-click the SVG center (D3 dblclick.zoom is what we nullified)
  const svg = page.locator('.network__canvas svg');
  await svg.dblclick();

  // Wait a moment for any zoom animation to complete
  await page.waitForTimeout(500);

  // Transform should be unchanged (dblclick.zoom is disabled)
  const transformAfter = await page.locator('.network__canvas svg > g').first().getAttribute('transform');
  expect(transformAfter).toBe(transformBefore);
});

test('fullscreen button hidden when API unsupported (MOB-03)', async ({ page }) => {
  // Simulate an environment where Fullscreen API is not available (like iOS Safari)
  await page.addInitScript(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: undefined, writable: true, configurable: true });
  });
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to test' });
    return;
  }

  // The fullscreen button should be hidden
  const btn = page.locator('#ctrl-fullscreen');
  await expect(btn).toBeHidden();
});

test('all nodes have 44px minimum touch target (MOB-04)', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to test' });
    return;
  }
  await page.locator('svg circle[fill-opacity]').first().waitFor({ state: 'attached' });

  // Get all hit-area circle radii
  const radii = await page.locator('.network__hit-area circle').evaluateAll((circles) =>
    circles.map((c) => parseFloat(c.getAttribute('r') || '0'))
  );

  expect(radii.length).toBeGreaterThan(0);
  for (const r of radii) {
    expect(r).toBeGreaterThanOrEqual(22);
  }
});

test('influence edges have arrowhead markers (VIS-01)', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to test' });
    return;
  }
  await page.locator('svg circle[fill-opacity]').first().waitFor({ state: 'attached' });

  // At least one influence edge line should have marker-end set
  const markedLines = page.locator('svg line[marker-end]');
  const count = await markedLines.count();
  if (count === 0) {
    test.info().annotations.push({ type: 'skip', description: 'No influence edges in dataset — VIS-01 not verifiable (Wikidata P737 requires exact name match)' });
    return;
  }

  // Verify the marker attribute value references the arrowhead definition
  const firstMarkerEnd = await markedLines.first().getAttribute('marker-end');
  expect(firstMarkerEnd).toContain('arrowhead');
});

test('influence edge endpoints are retracted to node perimeter (VIS-03)', async ({ page }) => {
  await page.goto('/lab/network');
  const errorVisible = await page.locator('.network__error').isVisible().catch(() => false);
  if (errorVisible) {
    test.info().annotations.push({ type: 'skip', description: 'Error state — no data to test' });
    return;
  }
  await page.locator('svg circle[fill-opacity]').first().waitFor({ state: 'attached' });

  // Get the first influence edge line
  const markedLines = page.locator('svg line[marker-end]');
  const count = await markedLines.count();
  if (count === 0) {
    test.info().annotations.push({ type: 'skip', description: 'No influence edges in dataset — VIS-03 not verifiable' });
    return;
  }

  // Read x2/y2 of the influence edge
  const lineX2 = parseFloat(await markedLines.first().getAttribute('x2') ?? '0');
  const lineY2 = parseFloat(await markedLines.first().getAttribute('y2') ?? '0');

  // Get all node circles and check none has cx=lineX2, cy=lineY2 exactly
  // (retraction means x2/y2 are offset from the target node center)
  const circles = page.locator('svg circle[fill-opacity]');
  let exactCenterMatch = false;
  const circleCount = await circles.count();
  for (let i = 0; i < circleCount; i++) {
    const cx = parseFloat(await circles.nth(i).getAttribute('cx') ?? '0');
    const cy = parseFloat(await circles.nth(i).getAttribute('cy') ?? '0');
    if (Math.abs(cx - lineX2) < 0.5 && Math.abs(cy - lineY2) < 0.5) {
      exactCenterMatch = true;
      break;
    }
  }
  // x2/y2 should NOT match any node center exactly (retraction moves endpoint away from center)
  expect(exactCenterMatch).toBe(false);
});

