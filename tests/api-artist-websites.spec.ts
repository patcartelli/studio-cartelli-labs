import { test, expect } from '@playwright/test';

// Tests for /api/artist-websites POST endpoint (Plan 19-02).
// Exercises getCachedArtistBundleReadOnly (Task 1) via the batch endpoint (Task 2).
// All tests use the request fixture against a running dev server.

// --- Request validation guards (T-19-03) --- //

test('artist-websites POST with valid empty artists array returns 200', async ({ request }) => {
  const res = await request.post('/api/artist-websites', {
    data: { artists: [] },
    headers: { 'Content-Type': 'application/json' },
  });
  // Empty artists array is valid; 200 with empty result object
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body).toBe('object');
  // Must be empty map when no artists requested
  expect(Object.keys(body).length).toBe(0);
});

test('artist-websites POST returns each artist name as key in result', async ({ request }) => {
  const res = await request.post('/api/artist-websites', {
    data: { artists: ['Radiohead', 'Portishead'] },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  // Keys must be present for every requested artist name (value may be null on cache miss)
  expect(body).toHaveProperty('Radiohead');
  expect(body).toHaveProperty('Portishead');
  // Values are string URLs or null — never undefined, never false
  for (const value of Object.values(body)) {
    expect(value === null || typeof value === 'string').toBe(true);
    if (typeof value === 'string') {
      expect(value).toMatch(/^https?:\/\//);
    }
  }
});

test('artist-websites POST with missing artists field returns 400 (T-19-03)', async ({ request }) => {
  // missing 'artists' key entirely
  const res = await request.post('/api/artist-websites', {
    data: { wrong: 'field' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body).toHaveProperty('error');
});

test('artist-websites POST with artists.length > 100 returns 400 (T-19-03 abuse ceiling)', async ({ request }) => {
  // 101 artists exceeds the 100-name cap
  const tooMany = Array.from({ length: 101 }, (_, i) => `Artist${i}`);
  const res = await request.post('/api/artist-websites', {
    data: { artists: tooMany },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body).toHaveProperty('error');
});

test('artist-websites POST with non-array artists field returns 400', async ({ request }) => {
  const res = await request.post('/api/artist-websites', {
    data: { artists: 'not-an-array' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body).toHaveProperty('error');
});

// --- D-03 host filter: last.fm-host URLs must resolve to null --- //

test('artist-websites result values are never last.fm host URLs (D-03 filter)', async ({ request }) => {
  // Even if a bundle.url is a last.fm URL, the endpoint must strip it to null.
  // We test this by inspecting all returned URLs — none should match last.fm.
  const LASTFM_HOST_RE = /^https?:\/\/(www\.)?last\.fm\//i;
  const res = await request.post('/api/artist-websites', {
    data: { artists: ['Radiohead', 'Portishead', 'Massive Attack'] },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  for (const value of Object.values(body)) {
    if (typeof value === 'string') {
      expect(LASTFM_HOST_RE.test(value)).toBe(false);
    }
  }
});

// --- Cache miss behavior (Task 1 — getCachedArtistBundleReadOnly null on miss) --- //

test('artist-websites unknown artist returns null (cache miss -> null, no MB call)', async ({ request }) => {
  // Deliberately invented artist — guaranteed to not be in KV cache
  const res = await request.post('/api/artist-websites', {
    data: { artists: ['ZZZZZ_nonexistent_artist_ZZZZZ'] },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('ZZZZZ_nonexistent_artist_ZZZZZ');
  // Must be null — no MB call made, pure cache miss
  expect(body['ZZZZZ_nonexistent_artist_ZZZZZ']).toBeNull();
});

// --- Response headers --- //

test('artist-websites POST returns application/json with 900s cache header', async ({ request }) => {
  const res = await request.post('/api/artist-websites', {
    data: { artists: [] },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  // 900s cache matches chart-list.ts convention
  expect(res.headers()['cache-control']).toContain('max-age=900');
});
