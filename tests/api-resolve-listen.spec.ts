import { test, expect } from '@playwright/test';

test('resolve-listen returns 400 when artist param is missing', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?album=OK+Computer');
  expect(res.status()).toBe(400);
});

test('resolve-listen type=album returns 400 when album param is missing', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=Radiohead&type=album');
  expect(res.status()).toBe(400);
});

test('resolve-listen type=track returns 400 when track param is missing', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=Radiohead&type=track');
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
  expect(['odesli', 'bandcamp', 'lastfm']).toContain(body.source);
  expect(body.url).toMatch(/^https:\/\//);
});

test('resolve-listen lastfm fallback URL is well-formed', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=zzzznotreal&album=zzzzfakealbum');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.source).toBe('lastfm');
  expect(body.url).toBe('https://www.last.fm/music/zzzznotreal/zzzzfakealbum');
});

test('resolve-listen type=artist requires only artist param', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=Radiohead&type=artist');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('url');
  expect(['odesli', 'bandcamp', 'lastfm']).toContain(body.source);
});

test('resolve-listen type=artist lastfm fallback is well-formed', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=zzzznotreal&type=artist');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.source).toBe('lastfm');
  expect(body.url).toBe('https://www.last.fm/music/zzzznotreal');
});

test('resolve-listen type=track requires artist and track params', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=Radiohead&track=Creep&type=track');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('url');
  expect(['odesli', 'bandcamp', 'lastfm']).toContain(body.source);
});

test('resolve-listen type=track lastfm fallback is well-formed', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=zzzznotreal&track=zzzzfaketrack&type=track');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.source).toBe('lastfm');
  expect(body.url).toBe('https://www.last.fm/music/zzzznotreal/_/zzzzfaketrack');
});

test('resolve-listen odesli source returns song.link URL for mainstream album', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=Radiohead&album=OK+Computer');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(['odesli', 'bandcamp', 'lastfm']).toContain(body.source);
  if (body.source === 'odesli') {
    expect(body.url).toMatch(/song\.link|album\.link|odesli\.cc/);
  }
});

test('resolve-listen second call returns same result (KV cache hit)', async ({ request }) => {
  // First call -- primes the KV cache
  const res1 = await request.get('/api/resolve-listen?artist=Radiohead&album=OK+Computer');
  expect(res1.status()).toBe(200);
  const body1 = await res1.json();
  expect(body1).toHaveProperty('url');
  expect(body1).toHaveProperty('source');

  // Second call -- should return the same result from KV cache
  const res2 = await request.get('/api/resolve-listen?artist=Radiohead&album=OK+Computer');
  expect(res2.status()).toBe(200);
  const body2 = await res2.json();
  expect(body2.url).toBe(body1.url);
  expect(body2.source).toBe(body1.source);
});
