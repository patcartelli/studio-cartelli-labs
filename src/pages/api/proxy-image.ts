// src/pages/api/proxy-image.ts
// Proxies Last.fm CDN images server-side so the client canvas can draw
// cross-origin images without tainting (CORS bypass via server fetch).
export const prerender = false;

import type { APIRoute } from 'astro';

const ALLOWED_HOST = 'lastfm.freetls.fastly.net';

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
    parsed.hostname !== ALLOWED_HOST ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return new Response('Bad request: disallowed URL', { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(imageUrl);
  } catch {
    return new Response('Upstream fetch failed', { status: 502 });
  }

  if (!upstream.ok) {
    return new Response('Upstream error', { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';

  if (!contentType.startsWith('image/')) {
    return new Response('Upstream returned non-image content', { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    },
  });
};
