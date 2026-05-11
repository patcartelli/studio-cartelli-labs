// src/pages/api/artist-release.ts
// Returns the latest release cover URL for an artist by MBID.
// Checks KV cache first; on miss, resolves via MusicBrainz release-group browse.
// Called client-side after page render to avoid blocking SSR.
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getCachedLatestRelease } from '../../lib/latest-release-cache';

export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const mbid = searchParams.get('mbid')?.trim();
  const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!mbid || !MBID_RE.test(mbid)) {
    return new Response(JSON.stringify({ coverUrl: '', title: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const kv = (env as unknown as { LASTFM_CHART_CACHE: KVNamespace }).LASTFM_CHART_CACHE;
    const release = await getCachedLatestRelease(kv, mbid);
    return new Response(JSON.stringify(release), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[api/artist-release] error:', err);
    return new Response(JSON.stringify({ coverUrl: '', title: '' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
