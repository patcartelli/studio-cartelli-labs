// src/lib/network-cache.ts
// KV-backed cache wrapper for network page API data.
// Server-only: accepts KVNamespace and LastfmEnv as parameters. Do not import from client code.

import { getTopArtists, getArtistTags, getArtistSimilar, batchFetch } from './lastfm';
import type { Artist } from './lastfm';
import { getInfluenceLinks } from './wikidata';
import type { InfluenceLink } from './wikidata';

interface CacheMetadata {
  fetchedAt: number; // ms since epoch (Date.now())
}

interface LastfmEnv {
  LASTFM_API_KEY?: string;
  LASTFM_USERNAME?: string;
}

const TTL_SECONDS = 900; // 15 minutes (per D-01)

interface NetworkRawData {
  artists: Artist[];
  allTags: string[][];
  allSimilar: { name: string; similarity: number }[][];
  influences: InfluenceLink[];
}

export interface NetworkCacheResult {
  data: NetworkRawData;
  fetchedAt: number;
  isStale: boolean;
}

/**
 * Return cached network page data from KV, refreshing if stale or missing.
 * Bundles all 4 data sources (artists, tags, similar, influences) in a single KV entry per period.
 * Falls back to expired KV data with isStale: true if Last.fm is unreachable (NCACHE-03).
 * Wikidata failures are handled independently — empty influences[] is a valid degraded state (D-09).
 * Throws only if no cached or live data is available.
 */
export async function getCachedNetworkData(
  kv: KVNamespace,
  env: LastfmEnv,
  period: string
): Promise<NetworkCacheResult> {
  const key = `network:${period}`;
  const { value, metadata } = await kv.getWithMetadata(key, {
    type: 'json',
  }) as { value: NetworkRawData | null; metadata: CacheMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return { data: value, fetchedAt: metadata!.fetchedAt, isStale: false };
  }

  // Cache miss or stale -- fetch live
  try {
    const artists = await getTopArtists(env, 100, period);
    const artistNames = artists.map((a) => a.name);
    const allTags = await batchFetch(artistNames, (name) => getArtistTags(env, name));
    const allSimilar = await batchFetch(artistNames, (name) => getArtistSimilar(env, name));

    // D-09: Wikidata is independently failable; empty influences[] is a valid degraded state
    let influences: InfluenceLink[] = [];
    try {
      influences = await getInfluenceLinks(artistNames);
    } catch {
      /* silently degrade */
    }

    const data: NetworkRawData = { artists, allTags, allSimilar, influences };
    const fetchedAt = Date.now();
    // No TTL expiry on KV entry -- stale data stays readable for fallback when APIs are unreachable (D-01)
    await kv.put(key, JSON.stringify(data), {
      metadata: { fetchedAt } satisfies CacheMetadata,
    });

    return { data, fetchedAt, isStale: false };
  } catch (err) {
    // NCACHE-03: fall back to expired KV data if available
    if (value !== null) {
      return { data: value, fetchedAt: metadata?.fetchedAt ?? Date.now(), isStale: true };
    }
    throw err;
  }
}
