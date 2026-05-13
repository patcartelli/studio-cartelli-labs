// src/lib/artist-image-cache.ts
// KV-backed cache wrapper for artist image URL resolution.
// Server-only: accepts KVNamespace as parameter. Do not import from client code.

import { resolveArtistBundle } from './musicbrainz';

interface CacheMetadata {
  fetchedAt: number; // ms since epoch (Date.now())
}

const IMG_TTL_SECONDS = 604800; // 7 days — image URLs are stable

/**
 * Return the resolved artist image URL from KV cache, refreshing if stale or missing.
 * Falls back to stale KV data if upstream resolution (MusicBrainz/Wikimedia/Wikidata)
 * is unreachable. Returns '' (placeholder signal) if no cached or live URL is available.
 * Never throws — empty string is always safe.
 *
 * Cache key: artist-img:${artistName.toLowerCase()}
 * Distinct from Phase 2's mb:artist: prefix (no collision).
 *
 * Empty-string results ("no image found for artist") ARE cached normally — this
 * prevents repeated fruitless API calls for artists with no MB/Wikidata photo.
 * The 7-day TTL applies to both real URLs and empty strings.
 */
export async function getCachedArtistImageUrl(
  kv: KVNamespace,
  artistName: string
): Promise<string> {
  const key = `artist-img-v2:${artistName.toLowerCase()}`;

  const { value, metadata } = await kv.getWithMetadata(key, {
    type: 'text',
  }) as { value: string | null; metadata: CacheMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > IMG_TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return value;
  }

  // Cache miss or stale — resolve live via MB → Wikimedia Commons → Wikidata fallback
  try {
    const bundle = await resolveArtistBundle(artistName, '');
    const url = bundle.imageUrl; // '' if nothing resolves
    const fetchedAt = Date.now();
    await kv.put(key, url, {
      metadata: { fetchedAt } satisfies CacheMetadata,
    });
    return url;
  } catch {
    // Fall back to stale KV data if available
    if (value !== null) return value;
    return ''; // Empty string → placeholder div renders via existing conditional
  }
}
