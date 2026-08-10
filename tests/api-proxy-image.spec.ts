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

// ============================================================
// Allowlist drift guard.
//
// Last.fm serves cover art from more than one host under freetls.fastly.net,
// and which one appears in an API response is upstream's choice, not ours.
// When `lastfm-img.` started showing up and the allowlist only had `lastfm.`,
// every cover on /lab/chart 400'd in production — silently, because a broken
// <img> is not an error anyone's dashboard reports. It also took the "copy
// chart" feature down with it (broken images throw from canvas drawImage).
//
// These assert the allowlist DECISION, not the upstream fetch: the host check
// runs before any fetch(), so a disallowed host is the only way to get a 400
// here. A live host yields 200, and an upstream hiccup yields 502 — both mean
// "the allowlist let it through", which is the whole contract. That keeps this
// deterministic and offline-safe rather than coupling CI to Last.fm's uptime.
// ============================================================
const LASTFM_CDN_HOSTS = [
  'lastfm.freetls.fastly.net',
  'lastfm-img.freetls.fastly.net',
];

for (const host of LASTFM_CDN_HOSTS) {
  test(`proxy-image allows the ${host} cover-art host`, async ({ request }) => {
    const url = encodeURIComponent(`https://${host}/i/u/174s/05a1c6637f68b5a501eac83214a87191.jpg`);
    const res = await request.get(`/api/proxy-image?url=${url}`);
    expect(
      res.status(),
      `${host} must not be rejected by ALLOWED_HOSTS — a 400 here means Last.fm cover art is broken sitewide`
    ).not.toBe(400);
  });
}
