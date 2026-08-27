// tests/perf-budget.spec.ts
// Production `/lab` transfer-budget coverage in studio-cartelli-labs.
// Sourced from studio-cartelli tests/lab/perf-budget.spec.ts (Phase 39 Wave 0).
// This header previously cited D-07, which is the sitemap decision and
// has nothing to do with transfer budgets; it was copy-pasted from the seo header.
//
// Transfer-size regression guard derived from STC-107 baseline (2026-07-20).
// Budgets are calibrated against CI preview (build + preview), which transfers
// more same-origin bytes than production — see docs/perf-baseline.md.
import { test, expect } from '@playwright/test';
import { measureTransferDuring } from './helpers/perf-collect';

/** KiB ceilings for preview — ~15% headroom over 2026-07-20 CI measurements. */
const TRANSFER_BUDGETS: Array<{
  path: string;
  budgetBytes: number;
  settleMs?: number;
  timeoutMs?: number;
}> = [
  { path: '/lab/chart', budgetBytes: 650 * 1024, settleMs: 8000, timeoutMs: 45_000 },
  { path: '/lab/network', budgetBytes: 650 * 1024, settleMs: 2000, timeoutMs: 120_000 },
];

for (const { path, budgetBytes, settleMs, timeoutMs } of TRANSFER_BUDGETS) {
  test(`transfer budget: ${path} ≤ ${Math.round(budgetBytes / 1024)} KiB`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop', 'Measured once on Desktop project');
    test.skip(!process.env.CI, 'Budgets calibrated for the CI preview server; run locally with CI=1 (dev-server transfers exceed them by design)');
    test.setTimeout(timeoutMs ?? 45_000);

    const { transferBytes } = await measureTransferDuring(
      page,
      async () => {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
      },
      settleMs ?? 0,
    );
    expect(
      transferBytes,
      `${path} transfer ${Math.round(transferBytes / 1024)} KiB exceeded ${Math.round(budgetBytes / 1024)} KiB budget`,
    ).toBeLessThanOrEqual(budgetBytes);
  });
}
