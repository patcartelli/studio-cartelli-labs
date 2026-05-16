// src/lib/latest-release-cache.ts
// KV-backed cache for the latest release cover URL, keyed by MBID.
// Accepts the MBID from artist-bundle-cache — no redundant MB artist search.
// Server-only. Do not import from client code.

import { resolveLatestReleaseCoverByMBID } from './musicbrainz';

interface CacheMetadata {
  fetchedAt: number;
}

export interface LatestRelease {
  coverUrl: string;
  title: string;
  date?: string; // ISO string from MusicBrainz first-release-date; may be YYYY, YYYY-MM, or YYYY-MM-DD
}

const RELEASE_TTL_SECONDS = 604800; // 7 days — CAA URLs are stable
const EMPTY_TTL_SECONDS = 86400;    // 1 day — retry if no cover found (new releases may appear)

/**
 * Return the latest release { coverUrl, title } for an artist from KV cache.
 * Cache key uses MBID (stable identifier) rather than artist name, which avoids
 * name-casing collisions and is consistent if an artist changes their display name.
 *
 * Empty coverUrl results are cached for 1 day (not 7) — new albums are uploaded to CAA
 * gradually after release and an artist with no art today may have it tomorrow.
 */
export async function getCachedLatestRelease(
  kv: KVNamespace,
  mbid: string
): Promise<LatestRelease> {
  if (!mbid) return { coverUrl: '', title: '' };

  const key = `artist-release-v8:${mbid}`;

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
      const cached = JSON.parse(value) as LatestRelease;
      const ttl = cached.coverUrl ? RELEASE_TTL_SECONDS : EMPTY_TTL_SECONDS;
      const isStale = !metadata || (Date.now() - metadata.fetchedAt) > ttl * 1000;
      if (!isStale) return cached;
    } catch {
      // corrupted — fall through to re-resolve
    }
  }

  try {
    const release = await resolveLatestReleaseCoverByMBID(mbid);
    await kv.put(key, JSON.stringify(release), {
      expirationTtl: RELEASE_TTL_SECONDS,
      metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
    });
    return release;
  } catch {
    if (value !== null) {
      try { return JSON.parse(value) as LatestRelease; } catch {}
    }
    return { coverUrl: '', title: '' };
  }
}
