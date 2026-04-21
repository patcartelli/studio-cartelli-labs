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
  expect(['bandcamp', 'lastfm']).toContain(body.source);
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
  expect(['bandcamp', 'lastfm']).toContain(body.source);
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
  expect(['bandcamp', 'lastfm']).toContain(body.source);
});

test('resolve-listen type=track lastfm fallback is well-formed', async ({ request }) => {
  const res = await request.get('/api/resolve-listen?artist=zzzznotreal&track=zzzzfaketrack&type=track');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.source).toBe('lastfm');
  expect(body.url).toBe('https://www.last.fm/music/zzzznotreal/_/zzzzfaketrack');
});
