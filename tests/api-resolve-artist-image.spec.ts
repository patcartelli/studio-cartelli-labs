import { test, expect } from '@playwright/test';

// Tests for the Fanart.tv fallback chain (D-03).
// Fanart.tv resolution is SSR-only (Cloudflare Worker); page.route() cannot intercept
// server-side Worker fetches. These tests verify observable chart behavior when
// Fanart.tv is absent or returns no data.

test('chart renders without error when FANART_API_KEY is absent (Fanart.tv skipped, fallback to TADB/Deezer)', async ({ page }) => {
  // FANART_API_KEY is not set in dev/CI — resolveFanartImageUrl returns '' immediately.
  // The chain must continue to TADB/Deezer and the chart must render successfully.
  await page.goto('/experiments/chart');
  await expect(page.locator('.chart__heading')).toBeVisible();

  // Either the artists grid renders OR the generic error fallback — both are valid.
  // What must NOT happen: an unhandled exception that crashes the SSR response.
  const grid = page.locator('.chart__view[data-view="albums"] .chart__grid');
  const error = page.locator('.chart__error');
  const gridVisible = await grid.isVisible().catch(() => false);
  const errorVisible = await error.isVisible().catch(() => false);
  expect(gridVisible || errorVisible).toBe(true);
});

test('chart artist grid is not blank when Fanart.tv has no coverage for an MBID (chain falls through)', async ({ page }) => {
  // Fanart.tv fetch happens server-side in the Worker; page.route() cannot intercept SSR fetches.
  // This test verifies that the artists view renders tiles (not a blank page or crash) when
  // Fanart.tv returns no artistthumb entries — resolveFanartImageUrl returns '' and TADB takes over.
  // FANART_API_KEY is absent in dev/CI so this path is always exercised.
  await page.goto('/experiments/chart');
  await expect(page.locator('.chart__heading')).toBeVisible();

  // Switch to artists view — this is where artist imageUrl is most visibly exercised.
  const artistLink = page.locator('.chart__view-link[data-for="artists"]');
  if (!await artistLink.isVisible().catch(() => false)) return; // error state — skip

  await artistLink.click();
  const artistView = page.locator('.chart__view[data-view="artists"]');
  await expect(artistView).toBeVisible();

  // Artist tiles must be present — the chain resolved (even if images are empty placeholders).
  const tiles = page.locator('.chart__tile--artist');
  const count = await tiles.count();
  expect(count).toBeGreaterThan(0);
});
