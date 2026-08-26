// Production `/lab` uptime-marker coverage in studio-cartelli-labs.
// Sourced from studio-cartelli tests/lab/uptime-markers.spec.ts (Phase 39 Wave 0).
import { test, expect } from '@playwright/test';
import { UPTIME_MARKERS } from '../src/lib/uptime-markers';

test('chart page includes uptime marker when data loads', async ({ page }) => {
  await page.goto('/lab/chart');
  const marker = page.locator(`[data-uptime-marker="${UPTIME_MARKERS.chart}"]`);
  const error = page.locator('.chart__error');

  // Chart SSR may fail when Last.fm credentials are absent (CI/local without secrets).
  // When data loads, the marker must be present; when it errors, the marker must be absent.
  if (await error.isVisible()) {
    await expect(marker).toHaveCount(0);
  } else {
    await expect(marker).toBeAttached();
  }
});
