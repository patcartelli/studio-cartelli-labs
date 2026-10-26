import { test, expect } from '@playwright/test';
import { labDemos } from '../src/data/lab-demos.ts';

const demo = labDemos.network;

// The embed is config-driven, so the test follows the config rather than
// asserting one of the two states unconditionally. Both branches are real
// contracts: an unpublished demo must leave NO trace on the page, and a
// published one must actually resolve.
test.describe('network demo video', () => {
  test('renders nothing while the demo is unpublished', async ({ page }) => {
    test.skip(demo.published, 'the demo is published — the other tests apply');
    await page.goto('/lab/network');
    await expect(page.locator('.lab-video')).toHaveCount(0);
  });

  test('sits above the live graph and is pausable', async ({ page }) => {
    test.skip(!demo.published, 'the demo is not published yet');
    await page.goto('/lab/network');

    const figure = page.locator('.lab-video');
    await expect(figure).toBeVisible();

    // Above the live graph — DOM order, which is what a viewer meets.
    const order = await page.evaluate(() => {
      const v = document.querySelector('.lab-video');
      const g = document.querySelector('#network-container');
      if (!v || !g) return null;
      return v.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before' : 'after';
    });
    expect(order).toBe('before');

    // A loop this long that cannot be paused fails WCAG 2.2.2.
    await expect(page.locator('.lab-video__media')).toHaveAttribute('controls', '');
  });

  test('the video file the page asks for actually exists', async ({ page, request }) => {
    test.skip(!demo.published, 'the demo is not published yet');
    // The failure this exists for: the file is copied into the site folder
    // correctly and the page asks for a DIFFERENT path, so the embed 404s
    // while everything looks right on disk.
    await page.goto('/lab/network');
    const src = await page.locator('.lab-video__media').getAttribute('src');
    expect(src).toBe(demo.src);
    const res = await request.get(src!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('video');
  });
});
