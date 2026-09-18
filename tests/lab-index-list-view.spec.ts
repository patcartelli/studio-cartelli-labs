// tests/lab-index-list-view.spec.ts
// STC-423: grid/list toggle on the /lab index, and the shared text-reveal
// engine (see chart-reveal.spec.ts for the pattern this mirrors).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('list view is hidden and grid is visible by default', async ({ page }) => {
  await page.goto('/lab');
  await expect(page.locator('.experiments__grid')).toBeVisible();
  await expect(page.locator('.experiments__list-section')).toBeHidden();
});

test('toggling to list view shows rows with name and date, hides the grid', async ({ page }) => {
  await page.goto('/lab');
  await page.locator('.experiments__toggle').click();

  await expect(page.locator('.experiments__grid')).toBeHidden();
  const rows = page.locator('.experiments__list-section .text-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Listening History' })).toContainText('Updated');
  await expect(rows.filter({ hasText: 'Artist Network' })).toContainText('Updated');
  await expect(rows.filter({ hasText: 'Life' })).toContainText('Updated');
});

test('list rows link to their experiment pages', async ({ page }) => {
  await page.goto('/lab');
  await page.locator('.experiments__toggle').click();
  await expect(page.locator('.text-row__link[href="/lab/chart"]')).toBeVisible();
  await expect(page.locator('.text-row__link[href="/lab/network"]')).toBeVisible();
  await expect(page.locator('.text-row__link[href="/lab/life"]')).toBeVisible();
});

test('view selection persists across reload', async ({ page }) => {
  await page.goto('/lab');
  await page.locator('.experiments__toggle').click();
  await expect(page.locator('.experiments__list-section')).toBeVisible();

  await page.reload();
  await expect(page.locator('.experiments__list-section')).toBeVisible();
  await expect(page.locator('.experiments__grid')).toBeHidden();
  await expect(page.locator('#experiments-list-toggle')).toBeChecked();
});

test('reduced-motion: no overlay element appended', async ({ page }) => {
  // global config sets reducedMotion: 'reduce' — engine short-circuits without creating overlay
  await page.goto('/lab');
  await page.locator('.experiments__toggle').click();
  expect(await page.locator('.text-reveal-overlay').count()).toBe(0);
});

test('touch device shows inline thumb, no overlay', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 375, height: 812 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  try {
    await page.goto('http://localhost:4321/lab');
    await page.locator('.experiments__toggle').click();

    expect(await page.locator('.text-reveal-overlay').count()).toBe(0);

    const chartRow = page.locator('.text-row', { has: page.locator('a[href="/lab/chart"]') });
    await expect(chartRow.locator('.text-row__thumb')).toBeVisible();

    // Life has no thumbnail — no inline thumb should render for it either
    const lifeRow = page.locator('.text-row', { has: page.locator('a[href="/lab/life"]') });
    await expect(lifeRow.locator('.text-row__thumb')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('hover reveals the preview overlay for an entry with a thumbnail', async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: 'no-preference',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto('http://localhost:4321/lab');
    await page.locator('.experiments__toggle').click();

    const chartRow = page.locator('.text-row', { has: page.locator('a[href="/lab/chart"]') });
    await chartRow.scrollIntoViewIfNeeded();
    const box = await chartRow.boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const overlay = page.locator('.text-reveal-overlay[data-visible="true"]');
    await expect(overlay).toBeVisible();

    // Life has no thumbnail — hovering it should hide the overlay again
    const lifeRow = page.locator('.text-row', { has: page.locator('a[href="/lab/life"]') });
    await lifeRow.scrollIntoViewIfNeeded();
    const lifeBox = await lifeRow.boundingBox();
    if (!lifeBox) return;
    await page.mouse.move(lifeBox.x + lifeBox.width / 2, lifeBox.y + lifeBox.height / 2);
    await expect(page.locator('.text-reveal-overlay[data-visible="true"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('list view has zero axe violations', async ({ page }) => {
  await page.goto('/lab');
  await page.locator('.experiments__toggle').click();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .include('.experiments__list-section')
    .analyze();
  expect(results.violations).toEqual([]);
});
