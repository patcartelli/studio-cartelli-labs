// src/lib/artist-bundle-cache.ts
// KV-backed cache for the combined artist bundle (MBID + website URL + photo URL).
// One cache entry replaces two separate round-trips (musicbrainz-cache + artist-image-cache)
// by sharing the single MB search + url-rels lookup across all resolution tasks.
// Server-only. Do not import from client code.

import { resolveArtistBundle, type ArtistBundle } from './musicbrainz';
import { extractGlowColorFromUrl } from './extract-color';

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
  tadbApiKey = '',
  fanartApiKey = ''
): Promise<ArtistBundle> {
  const key = `artist-bundle-v6:${artistName.toLowerCase()}`;

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
    const bundle = await resolveArtistBundle(artistName, fallbackUrl, tadbApiKey, fanartApiKey);
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

export async function prewarmMissingGlowColors(
  kv: KVNamespace,
  bundles: Array<{ name: string; bundle: ArtistBundle }>
): Promise<Map<string, string>> {
  const missing = bundles.filter(
    ({ bundle }) => bundle.imageUrl && !bundle.glowColor
  );

  const results = await Promise.allSettled(
    missing.map(async ({ name, bundle }) => {
      const color = await extractGlowColorFromUrl(bundle.imageUrl);
      if (!color) return null;
      const updated: ArtistBundle = { ...bundle, glowColor: color };
      const key = `artist-bundle-v6:${name.toLowerCase()}`;
      try {
        await kv.put(key, JSON.stringify(updated), {
          expirationTtl: BUNDLE_TTL_SECONDS,
          metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
        });
      } catch {
        // KV write failure — color still returned for in-flight render
      }
      return { name, color };
    })
  );

  const map = new Map<string, string>();
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      map.set(result.value.name, result.value.color);
    }
  }
  return map;
}
