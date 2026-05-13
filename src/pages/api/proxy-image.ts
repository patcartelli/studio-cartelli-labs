// src/pages/api/proxy-image.ts
// Proxies CDN images server-side so the browser never makes cross-origin requests.
// - Last.fm CDN: canvas drawImage() requires same-origin (CORS bypass)
// - Cover Art Archive: browser blocks CAA→archive.org redirect chain (ORB / NS_BINDING_ABORTED)
export const prerender = false;

import type { APIRoute } from 'astro';

const ALLOWED_HOSTS = new Set([
  'lastfm.freetls.fastly.net',
  'coverartarchive.org', // 307 → archive.org CDN followed server-side
]);

export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new Response('Bad request: url param required', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return new Response('Bad request: invalid URL', { status: 400 });
  }

  if (
    parsed.protocol !== 'https:' ||
    !ALLOWED_HOSTS.has(parsed.hostname) ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return new Response('Bad request: disallowed URL', { status: 400 });
  }

  const SAFE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

  let upstream: Response;
  try {
    upstream = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
  } catch {
    return new Response('Upstream fetch failed', { status: 502 });
  }

  if (!upstream.ok) {
    return new Response('Upstream error', { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  const mimeType = contentType.split(';')[0].trim();

  if (!SAFE_MIME_TYPES.has(mimeType)) {
    return new Response('Upstream returned non-image content', { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    },
  });
};
