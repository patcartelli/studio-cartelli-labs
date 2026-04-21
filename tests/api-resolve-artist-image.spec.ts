import { test, expect } from '@playwright/test';

test('resolve-artist-image returns 400 when artist param is missing', async ({ request }) => {
  const res = await request.get('/api/resolve-artist-image');
  expect(res.status()).toBe(400);
});

test('resolve-artist-image returns JSON with url field', async ({ request }) => {
  const res = await request.get('/api/resolve-artist-image?artist=Radiohead');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('url');
  expect(typeof body.url).toBe('string');
});

test('resolve-artist-image url is https when found', async ({ request }) => {
  const res = await request.get('/api/resolve-artist-image?artist=Radiohead');
  expect(res.status()).toBe(200);
  const body = await res.json();
  if (body.url) {
    expect(body.url).toMatch(/^https:\/\//);
  }
});

test('resolve-artist-image returns empty url for unknown artist', async ({ request }) => {
  const res = await request.get('/api/resolve-artist-image?artist=zzzznotreal99999');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.url).toBe('');
});
