// src/pages/api/proxy-image.ts
// Proxies Last.fm CDN images server-side so the client canvas can draw
// cross-origin images without tainting (CORS bypass via server fetch).
export const prerender = false;

import type { APIRoute } from 'astro';

const ALLOWED_PREFIX = 'https://lastfm.freetls.fastly.net/';

export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl || !imageUrl.startsWith(ALLOWED_PREFIX)) {
    return new Response('Bad request: url must start with https://lastfm.freetls.fastly.net/', {
      status: 400,
    });
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

  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    },
  });
};
