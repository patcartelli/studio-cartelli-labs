import { test, expect } from '@playwright/test';

test('proxy-image returns 400 when url param is missing', async ({ request }) => {
  const res = await request.get('/api/proxy-image');
  expect(res.status()).toBe(400);
});

test('proxy-image returns 400 for non-lastfm url', async ({ request }) => {
  const res = await request.get('/api/proxy-image?url=https%3A%2F%2Fevil.com%2Fimg.jpg');
  expect(res.status()).toBe(400);
});

test('proxy-image returns 400 for http lastfm url (must be https)', async ({ request }) => {
  const res = await request.get('/api/proxy-image?url=http%3A%2F%2Flastfm.freetls.fastly.net%2Fi%2Fu%2F300x300%2Ftest.jpg');
  expect(res.status()).toBe(400);
});
