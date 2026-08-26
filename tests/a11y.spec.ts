// Production `/lab` accessibility coverage in studio-cartelli-labs.
// Sourced from studio-cartelli tests/lab/a11y.spec.ts (Phase 39 Wave 0).
import { test, expect } from '@playwright/test';
import { analyzeAxe } from './helpers/a11y';

const LAB_PAGES = ['/lab', '/lab/chart', '/lab/network', '/lab/life'];

for (const path of LAB_PAGES) {
  test(`a11y: ${path} has no WCAG 2.1 AA violations`, async ({ page }) => {
    // STC-33's CI skip for /lab/chart is retired: CI sets LASTFM_FIXTURE=1, so
    // the page renders its real populated surface there rather than the dataless
    // skeleton whose placeholders tripped axe. See src/lib/lastfm-fixture.ts.
    await page.goto(path);
    const results = await analyzeAxe(page);
    expect(results.violations).toEqual([]);
  });
}
