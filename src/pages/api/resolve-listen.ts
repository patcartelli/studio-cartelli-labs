// src/pages/api/resolve-listen.ts
// Public APIRoute for single listen-link resolution.
// Delegates the iTunes → Deezer → Odesli → Bandcamp → Last.fm cascade to src/lib/resolve-listen-logic.ts.
// Bulk resolution lives in /api/chart-data, which calls the same helper inside Promise.allSettled.
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveListenLink, type ListenType } from '../../lib/resolve-listen-logic';

export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get('artist');
  const rawType = searchParams.get('type') ?? 'album';
  if (rawType !== 'artist' && rawType !== 'album' && rawType !== 'track') {
    return new Response('Bad request: type must be artist, album, or track', { status: 400 });
  }
  const type = rawType as ListenType;
  const album = searchParams.get('album');
  const track = searchParams.get('track');

  if (!artist) {
    return new Response('Bad request: artist param required', { status: 400 });
  }
  // Length cap: unbounded input lets anyone mint unlimited KV keys (and KV
  // keys max out at 512 bytes after encoding). Real names fit well under this.
  const MAX_PARAM_LENGTH = 200;
  for (const value of [artist, album, track]) {
    if (value && value.length > MAX_PARAM_LENGTH) {
      return new Response('Bad request: param exceeds maximum length', { status: 400 });
    }
  }
  if (type === 'album' && !album) {
    return new Response('Bad request: album param required for type=album', { status: 400 });
  }
  if (type === 'track' && !track) {
    return new Response('Bad request: track param required for type=track', { status: 400 });
  }

  const kv = (env as unknown as { LASTFM_CHART_CACHE: KVNamespace }).LASTFM_CHART_CACHE;

  const headers = {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=86400',
  };

  const name = type === 'album' ? album : type === 'track' ? track : null;
  const result = await resolveListenLink(kv, artist, name, type);
  return new Response(JSON.stringify(result), { status: 200, headers });
};
