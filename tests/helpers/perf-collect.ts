// tests/helpers/perf-collect.ts
// Shared transfer-weight collection for perf budget guards (STC-107).
import type { Page } from '@playwright/test';

export type TransferBreakdown = {
  transferBytes: number;
  jsBytes: number;
  imageBytes: number;
};

function isBudgetedUrl(url: string, origin: string): boolean {
  if (!url.startsWith(origin)) return false;
  if (url.includes('/@vite/') || url.includes('/@id/') || url.includes('/node_modules/')) return false;
  return true;
}

async function readResourceTiming(page: Page, origin: string): Promise<TransferBreakdown> {
  return page.evaluate((pageOrigin) => {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    let transferBytes = 0;
    let jsBytes = 0;
    let imageBytes = 0;
    for (const entry of resources) {
      if (!entry.name.startsWith(pageOrigin)) continue;
      if (entry.name.includes('/@vite/') || entry.name.includes('/@id/') || entry.name.includes('/node_modules/')) {
        continue;
      }
      const size = entry.transferSize || 0;
      transferBytes += size;
      const name = entry.name.toLowerCase();
      if (/\.(js|mjs)(\?|$)/.test(name) || name.includes('/_astro/')) jsBytes += size;
      if (/\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/.test(name)) imageBytes += size;
    }
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.transferSize) transferBytes += nav.transferSize;
    return { transferBytes, jsBytes, imageBytes };
  }, origin);
}

/** Measure same-origin transfer during navigation (CDP enabled before `navigate`). */
export async function measureTransferDuring(
  page: Page,
  navigate: () => Promise<unknown>,
  settleMs = 0,
): Promise<TransferBreakdown> {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4321').origin;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');

  /** @type {Map<string, string>} */
  const requestOrigins = new Map();

  let cdpTransferBytes = 0;
  cdp.on('Network.requestWillBeSent', (event) => {
    requestOrigins.set(event.requestId, event.request.url);
  });
  cdp.on('Network.loadingFinished', (event) => {
    const url = requestOrigins.get(event.requestId) ?? '';
    if (!isBudgetedUrl(url, origin)) return;
    cdpTransferBytes += event.encodedDataLength ?? 0;
  });

  await navigate();
  if (settleMs > 0) await page.waitForTimeout(settleMs);

  const pageOrigin = new URL(page.url()).origin;
  const resourceBytes = await readResourceTiming(page, pageOrigin);
  return {
    transferBytes: Math.max(cdpTransferBytes, resourceBytes.transferBytes),
    jsBytes: resourceBytes.jsBytes,
    imageBytes: resourceBytes.imageBytes,
  };
}
