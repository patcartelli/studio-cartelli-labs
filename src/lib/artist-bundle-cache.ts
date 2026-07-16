// src/lib/artist-bundle-cache.ts
// KV-backed cache for the combined artist bundle (MBID + website URL + photo URL).
// One cache entry replaces two separate round-trips (musicbrainz-cache + artist-image-cache)
// by sharing the single MB search + url-rels lookup across all resolution tasks.
// Server-only. Do not import from client code.

import type { ArtistBundle } from './musicbrainz';

export type { ArtistBundle };

interface CacheMetadata {
  fetchedAt: number;
}

/**
 * Read-only artist bundle lookup — returns the cached bundle if present, null otherwise.
 * NEVER triggers a MusicBrainz refresh (D-02 LIST-04 safeguard for the full-list path).
 * Use this when rendering the full chart list where MB's 1 req/sec limit is a hard constraint.
 *
 * On a KV miss → null. On corrupted entry → null. On KV throw → null.
 * Intentionally ignores TTL — stale cached data is still useful; the cron refreshes it.
 */
export async function getCachedArtistBundleReadOnly(
  kv: KVNamespace,
  artistName: string
): Promise<ArtistBundle | null> {
  const key = `artist-bundle-v6:${artistName.toLowerCase()}`;
  let value: string | null = null;
  try {
    ({ value } = await kv.getWithMetadata(key, { type: 'text' }) as {
      value: string | null;
      metadata: CacheMetadata | null;
    });
  } catch {
    return null; // KV unavailable
  }
  if (value === null) return null;
  try {
    return JSON.parse(value) as ArtistBundle;
  } catch {
    return null; // corrupted entry
  }
}
