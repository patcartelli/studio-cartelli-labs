// src/lib/lastfm-cache.ts
// KV-backed cache wrappers for Last.fm API functions.
// Server-only: accepts KVNamespace and LastfmEnv as parameters. Do not import from client code.

import { getTopAlbums, getTopArtists, getTopTracks } from './lastfm';
import type { Album, Artist, Track } from './lastfm';

interface CacheMetadata {
  fetchedAt: number; // ms since epoch (Date.now())
}

export interface CachedResult<T> {
  data: T;
  fetchedAt: number;
}

const TTL_SECONDS = 900; // 15 minutes (per D-07)

interface LastfmEnv {
  LASTFM_API_KEY?: string;
  LASTFM_USERNAME?: string;
}

/**
 * Return cached top albums from KV, refreshing if stale or missing.
 * Falls back to expired KV data if Last.fm is unreachable (D-05).
 * Throws only if no cached or live data is available.
 */
export async function getCachedTopAlbums(
  kv: KVNamespace,
  env: LastfmEnv,
  limit: number
): Promise<CachedResult<Album[]>> {
  const key = `lastfm:topAlbums:${limit}`;
  const { value, metadata } = await kv.getWithMetadata(key, {
    type: 'json',
  }) as { value: Album[] | null; metadata: CacheMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return { data: value, fetchedAt: metadata!.fetchedAt };
  }

  // Cache miss or stale -- fetch live
  try {
    const data = await getTopAlbums(env, limit);
    const fetchedAt = Date.now();
    await kv.put(key, JSON.stringify(data), {
      metadata: { fetchedAt } satisfies CacheMetadata,
    });
    return { data, fetchedAt };
  } catch (err) {
    // D-05: fall back to expired KV data if available
    if (value !== null) {
      return { data: value, fetchedAt: metadata?.fetchedAt ?? Date.now() };
    }
    throw err;
  }
}

/**
 * Return cached top artists from KV, refreshing if stale or missing.
 * Falls back to expired KV data if Last.fm is unreachable (D-05).
 * Throws only if no cached or live data is available.
 */
export async function getCachedTopArtists(
  kv: KVNamespace,
  env: LastfmEnv,
  limit: number,
  period: string
): Promise<CachedResult<Artist[]>> {
  const key = `lastfm:topArtists:${limit}:${period}`;
  const { value, metadata } = await kv.getWithMetadata(key, {
    type: 'json',
  }) as { value: Artist[] | null; metadata: CacheMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return { data: value, fetchedAt: metadata!.fetchedAt };
  }

  // Cache miss or stale -- fetch live
  try {
    const data = await getTopArtists(env, limit, period);
    const fetchedAt = Date.now();
    await kv.put(key, JSON.stringify(data), {
      metadata: { fetchedAt } satisfies CacheMetadata,
    });
    return { data, fetchedAt };
  } catch (err) {
    // D-05: fall back to expired KV data if available
    if (value !== null) {
      return { data: value, fetchedAt: metadata?.fetchedAt ?? Date.now() };
    }
    throw err;
  }
}

/**
 * Return cached top tracks from KV, refreshing if stale or missing.
 * Falls back to expired KV data if Last.fm is unreachable (D-05).
 * Throws only if no cached or live data is available.
 */
export async function getCachedTopTracks(
  kv: KVNamespace,
  env: LastfmEnv,
  limit: number
): Promise<CachedResult<Track[]>> {
  const key = `lastfm:topTracks:${limit}`;
  const { value, metadata } = await kv.getWithMetadata(key, {
    type: 'json',
  }) as { value: Track[] | null; metadata: CacheMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return { data: value, fetchedAt: metadata!.fetchedAt };
  }

  // Cache miss or stale -- fetch live
  try {
    const data = await getTopTracks(env, limit);
    const fetchedAt = Date.now();
    await kv.put(key, JSON.stringify(data), {
      metadata: { fetchedAt } satisfies CacheMetadata,
    });
    return { data, fetchedAt };
  } catch (err) {
    // D-05: fall back to expired KV data if available
    if (value !== null) {
      return { data: value, fetchedAt: metadata?.fetchedAt ?? Date.now() };
    }
    throw err;
  }
}
