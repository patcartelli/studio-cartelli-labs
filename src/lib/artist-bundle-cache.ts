// src/lib/artist-bundle-cache.ts
// KV-backed cache for the combined artist bundle (MBID + website URL + photo URL).
// One cache entry replaces two separate round-trips (musicbrainz-cache + artist-image-cache)
// by sharing the single MB search + url-rels lookup across all resolution tasks.
// Server-only. Do not import from client code.

import { resolveArtistBundle, type ArtistBundle } from './musicbrainz';

export type { ArtistBundle };

interface CacheMetadata {
  fetchedAt: number;
}

const BUNDLE_TTL_SECONDS = 604800; // 7 days — MBID and URLs are stable
const NO_IMAGE_TTL_SECONDS = 86400; // 1 day — imageUrl missing: artist may gain Wikidata P18 soon
const FAIL_TTL_SECONDS = 3600;      // 1 hour — retry quickly if MB was unavailable at resolve time

export async function getCachedArtistBundle(
  kv: KVNamespace,
  artistName: string,
  fallbackUrl: string,
  tadbApiKey = ''
): Promise<ArtistBundle> {
  const key = `artist-bundle-v4:${artistName.toLowerCase()}`;

  let value: string | null = null;
  let metadata: CacheMetadata | null = null;
  try {
    ({ value, metadata } = await kv.getWithMetadata(key, { type: 'text' }) as {
      value: string | null;
      metadata: CacheMetadata | null;
    });
  } catch {
    // KV unavailable — skip cache read, proceed to resolve
  }

  if (value !== null) {
    try {
      const cached = JSON.parse(value) as ArtistBundle;
      const ttl = !cached.mbid ? FAIL_TTL_SECONDS        // no MBID — retry soon regardless of image
        : !cached.imageUrl ? NO_IMAGE_TTL_SECONDS       // has MBID but no image — retry daily
        : BUNDLE_TTL_SECONDS;                           // fully resolved — cache long
      const isStale = !metadata || (Date.now() - metadata.fetchedAt) > ttl * 1000;
      if (!isStale) return cached;
    } catch {
      // corrupted — fall through to re-resolve
    }
  }

  try {
    const bundle = await resolveArtistBundle(artistName, fallbackUrl, tadbApiKey);
    await kv.put(key, JSON.stringify(bundle), {
      expirationTtl: BUNDLE_TTL_SECONDS,
      metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
    });
    return bundle;
  } catch {
    if (value !== null) {
      try { return JSON.parse(value) as ArtistBundle; } catch {}
    }
    return { mbid: '', url: fallbackUrl, imageUrl: '' };
  }
}
