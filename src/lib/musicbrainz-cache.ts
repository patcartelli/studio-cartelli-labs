// src/lib/musicbrainz-cache.ts
// KV-backed cache wrapper for MusicBrainz artist URL resolution.
// Server-only: accepts KVNamespace as parameter. Do not import from client code.

import { resolveArtistBundle } from './musicbrainz';

interface CacheMetadata {
  fetchedAt: number; // ms since epoch (Date.now())
}

const MB_TTL_SECONDS = 604800; // 7 days — MB artist URL data changes rarely

/**
 * Return the resolved artist website URL from KV cache, refreshing if stale or missing.
 * Falls back to stale KV data if MusicBrainz is unreachable.
 * Falls back to Last.fm artist URL if no cached or live data is available.
 * Never throws — Last.fm floor is always safe.
 */
export async function getCachedMBUrl(
  kv: KVNamespace,
  artistName: string
): Promise<string> {
  const key = `mb:artist:${artistName.toLowerCase()}`;
  const fallback = `https://www.last.fm/music/${encodeURIComponent(artistName)}`;

  const { value, metadata } = await kv.getWithMetadata(key, {
    type: 'text',
  }) as { value: string | null; metadata: CacheMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > MB_TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return value;
  }

  // Cache miss or stale — fetch live from MusicBrainz
  try {
    const bundle = await resolveArtistBundle(artistName, fallback);
    const url = bundle.url;
    const fetchedAt = Date.now();
    await kv.put(key, url, {
      metadata: { fetchedAt } satisfies CacheMetadata,
    });
    return url;
  } catch {
    // Fall back to stale KV data if available
    if (value !== null) return value;
    return fallback; // Last.fm floor is always safe — never throw
  }
}
