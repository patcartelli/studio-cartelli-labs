// tests/seo.spec.ts
// Production `/lab` OG/canonical coverage in studio-cartelli-labs.
// Sourced from studio-cartelli tests/lab/seo.spec.ts (Phase 39 Wave 0).
// Sitemap customPages stay in studio-cartelli (Phase 38 D-07).
//
// Decision IDs in this file come from TWO registers. Citations in this header are
// Phase 38's (38-CONTEXT.md). Unqualified `D-0x` citations further down were moved
// here verbatim with their tests and belong to the older register that governed
// tests/seo.spec.ts — e.g. the `D-06` on og:title and the `D-04` on description
// uniqueness are NOT Phase 38's D-06 (cross-Worker check) or D-04 (extract-all-four).
// Qualify any new citation with its phase.
import { test, expect } from '@playwright/test';

test.describe('OG meta tags', () => {
  const publicPages = [
    { path: '/lab', ogTitle: 'Lab', descContains: 'experiments and data' },
    { path: '/lab/chart', ogTitle: 'Chart', descContains: 'top albums' },
    { path: '/lab/network', ogTitle: 'Network', descContains: 'network graph' },
  ];

  for (const { path, ogTitle, descContains } of publicPages) {
    test(`${path} has correct OG tags`, async ({ page }) => {
      await page.goto(path);

      // og:title matches expected value (D-06: short, no suffix)
      const ogTitleMeta = page.locator('meta[property="og:title"]');
      await expect(ogTitleMeta).toHaveAttribute('content', ogTitle);

      // og:description is present and contains expected substring
      const ogDesc = page.locator('meta[property="og:description"]');
      await expect(ogDesc).toHaveAttribute('content', new RegExp(descContains));

      // og:image is an absolute URL (not relative)
      const ogImage = page.locator('meta[property="og:image"]');
      await expect(ogImage).toHaveAttribute('content', /^https:\/\/studiocartelli\.com\/og-image\.jpg$/);

      // og:url is present
      const ogUrl = page.locator('meta[property="og:url"]');
      await expect(ogUrl).toHaveAttribute('content', /^https:\/\/studiocartelli\.com/);

      // og:site_name is Studio Cartelli
      const ogSiteName = page.locator('meta[property="og:site_name"]');
      await expect(ogSiteName).toHaveAttribute('content', 'Studio Cartelli');

      // og:image dimensions
      const ogWidth = page.locator('meta[property="og:image:width"]');
      await expect(ogWidth).toHaveAttribute('content', '1200');
      const ogHeight = page.locator('meta[property="og:image:height"]');
      await expect(ogHeight).toHaveAttribute('content', '630');
    });
  }

  test('each lab page has a unique meta description', async ({ page }) => {
    const descriptions: string[] = [];
    for (const { path } of publicPages) {
      await page.goto(path);
      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc).toBeTruthy();
      descriptions.push(desc!);
    }
    // All descriptions should be unique (D-04)
    const unique = new Set(descriptions);
    expect(unique.size).toBe(descriptions.length);
  });
});

test.describe('canonical URLs', () => {
  const pages = ['/lab', '/lab/chart', '/lab/network'];

  for (const path of pages) {
    test(`${path} has canonical URL`, async ({ page }) => {
      await page.goto(path);
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical).toHaveCount(1);
      await expect(canonical).toHaveAttribute('href', /^https:\/\/studiocartelli\.com/);
    });
  }
});
