import { test, expect } from '@playwright/test';

// Tests for /api/chart-list — endpoint contract: status, JSON shape, param bounding,
// and the lightweight no-enrichment row shape (Plan 18-02, LIST-04).
// These run against the dev server with KV bound (same pattern as api-resolve-listen.spec.ts).
// The cold-cache self-heal (D-09) fires on the first request and populates the KV cache.

test('chart-list default request returns 200 with expected JSON shape', async ({ request }) => {
  const res = await request.get('/api/chart-list');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('view');
  expect(body).toHaveProperty('rows');
  expect(body).toHaveProperty('offset');
  expect(body).toHaveProperty('limit');
  expect(body).toHaveProperty('total');
  expect(body).toHaveProperty('hasMore');
  expect(body.view).toBe('albums');
  expect(body.offset).toBe(0);
  expect(body.limit).toBe(20);
  expect(Array.isArray(body.rows)).toBe(true);
});

test('chart-list offset=20&limit=20 returns correct pagination params', async ({ request }) => {
  const res = await request.get('/api/chart-list?offset=20&limit=20');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.offset).toBe(20);
  expect(body.limit).toBe(20);
});

test('chart-list clamps negative offset to 0 and oversized limit to 100 (T-18-04)', async ({ request }) => {
  const res = await request.get('/api/chart-list?offset=-5&limit=9999');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.offset).toBe(0);
  expect(body.limit).toBe(100);
});

test('chart-list rows carry lightweight fields including url (no listenUrl or glowColor)', async ({ request }) => {
  const res = await request.get('/api/chart-list');
  expect(res.status()).toBe(200);
  const body = await res.json();
  // Only assert row shape when there are rows returned (live data may vary in CI)
  if (body.rows.length > 0) {
    const row = body.rows[0];
    expect(row).toHaveProperty('rank');
    expect(row).toHaveProperty('name');
    expect(row).toHaveProperty('artist');
    expect(row).toHaveProperty('playcount');
    expect(row).toHaveProperty('imageUrl');
    // url is a raw Last.fm permalink (not enrichment) — must be present (REVL-01)
    expect(row).toHaveProperty('url');
    // Proves no enrichment fields present (LIST-04 safeguard still intact)
    expect(row).not.toHaveProperty('listenUrl');
    expect(row).not.toHaveProperty('glowColor');
  }
});
