import { test, expect } from '@playwright/test';

test('resolve-listen returns 400 when artist param is missing', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?album=OK+Computer');
  expect(res.status()).toBe(400);
});

test('resolve-listen returns 400 when album param is missing', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=Radiohead');
  expect(res.status()).toBe(400);
});

test('resolve-listen returns 400 when both params are missing', async ({ request }) => {
  const res = await request.get('/api/resolve-listen');
  expect(res.status()).toBe(400);
});

test('resolve-listen returns JSON with url and source fields', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=Radiohead&album=OK+Computer');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('url');
  expect(body).toHaveProperty('source');
  expect(['bandcamp', 'lastfm']).toContain(body.source);
  expect(body.url).toMatch(/^https:\/\//);
});

test('resolve-listen lastfm fallback URL is well-formed', async ({ request }) => {
  // Use an artist/album unlikely to be on Bandcamp
  const res = await request.get('/api/resolve-listen?artist=zzzznotreal&album=zzzzfakealbum');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.source).toBe('lastfm');
  expect(body.url).toBe('https://www.last.fm/music/zzzznotreal/zzzzfakealbum');
});
