// tests/lab-life.spec.ts
// E2E coverage for /lab/life. NOTE: playwright.config.ts sets
// reducedMotion: 'reduce' for all default contexts, so the page loads
// PAUSED here; the auto-run branch is covered in the block at the bottom
// that overrides contextOptions.
import { test, expect } from '@playwright/test';

declare global {
  interface Window {
    __lifeTest?: {
      isRunning: () => boolean;
      getGeneration: () => number;
      countLive: () => number;
      getCell: (col: number, row: number) => number;
      cellSize: number;
    };
  }
}

/** Poll until the page script has installed the test hook, then return running state. */
async function waitForHook(page: import('@playwright/test').Page) {
  await expect
    .poll(() => page.evaluate(() => window.__lifeTest?.isRunning() ?? null))
    .not.toBeNull();
}

test('life page has heading, canvas, and all controls', async ({ page }) => {
  await page.goto('/lab/life');
  await expect(page.locator('.life__heading')).toHaveText('life.');
  await expect(page.locator('#life-canvas')).toBeVisible();
  await expect(page.locator('#life-play')).toBeVisible();
  await expect(page.locator('#life-step')).toBeVisible();
  await expect(page.locator('#life-random')).toBeVisible();
  await expect(page.locator('#life-clear')).toBeVisible();
  await expect(page.locator('#life-speed')).toBeVisible();
  await expect(page.locator('#life-generation')).toBeVisible();
});

test('life page has nav and footer (BaseLayout intact)', async ({ page }) => {
  await page.goto('/lab/life');
  await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
});

test('lab index lists the Life experiment', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.locator('.experiments__link[href="/lab/life"]')).toBeVisible();
});

test('loads paused with a live soup under reduced motion', async ({ page }) => {
  await page.goto('/lab/life');
  await waitForHook(page);
  expect(await page.evaluate(() => window.__lifeTest!.isRunning())).toBe(false);
  expect(await page.evaluate(() => window.__lifeTest!.countLive())).toBeGreaterThan(0);
  await expect(page.locator('#life-play')).toHaveAttribute('aria-pressed', 'false');
});

test('play starts the simulation, pause stops it', async ({ page }) => {
  await page.goto('/lab/life');
  await waitForHook(page);
  await page.locator('#life-play').click();
  await expect(page.locator('#life-play')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => page.evaluate(() => window.__lifeTest!.getGeneration()))
    .toBeGreaterThan(0);

  await page.locator('#life-play').click();
  await expect(page.locator('#life-play')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#life-status')).toHaveText(/Paused at generation \d+/);
  const genAtPause = await page.evaluate(() => window.__lifeTest!.getGeneration());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__lifeTest!.getGeneration())).toBe(genAtPause);
});

test('step advances exactly one generation while paused', async ({ page }) => {
  await page.goto('/lab/life');
  await waitForHook(page);
  const before = await page.evaluate(() => window.__lifeTest!.getGeneration());
  await page.locator('#life-step').click();
  expect(await page.evaluate(() => window.__lifeTest!.getGeneration())).toBe(before + 1);
  await expect(page.locator('#life-generation')).toHaveText(`generation ${before + 1}`);
});

test('clear empties the grid and resets the generation counter', async ({ page }) => {
  await page.goto('/lab/life');
  await waitForHook(page);
  await page.locator('#life-clear').click();
  expect(await page.evaluate(() => window.__lifeTest!.countLive())).toBe(0);
  await expect(page.locator('#life-generation')).toHaveText('generation 0');
});

test('randomize reseeds a cleared grid', async ({ page }) => {
  await page.goto('/lab/life');
  await waitForHook(page);
  await page.locator('#life-clear').click();
  expect(await page.evaluate(() => window.__lifeTest!.countLive())).toBe(0);
  await page.locator('#life-random').click();
  expect(await page.evaluate(() => window.__lifeTest!.countLive())).toBeGreaterThan(0);
});

test('clicking the canvas toggles a cell', async ({ page }) => {
  await page.goto('/lab/life');
  await waitForHook(page);
  const cell = { col: 5, row: 5 };
  const before = await page.evaluate(
    ({ col, row }) => window.__lifeTest!.getCell(col, row),
    cell,
  );
  const size = await page.evaluate(() => window.__lifeTest!.cellSize);
  await page.locator('#life-canvas').click({
    position: { x: cell.col * size + size / 2, y: cell.row * size + size / 2 },
  });
  const after = await page.evaluate(
    ({ col, row }) => window.__lifeTest!.getCell(col, row),
    cell,
  );
  expect(after).toBe(before === 1 ? 0 : 1);
});

test.describe('with motion allowed', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('auto-runs on load', async ({ page }) => {
    await page.goto('/lab/life');
    await expect
      .poll(() => page.evaluate(() => window.__lifeTest?.isRunning() ?? null))
      .toBe(true);
    await expect(page.locator('#life-play')).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => page.evaluate(() => window.__lifeTest!.getGeneration()))
      .toBeGreaterThan(1);
  });
});
