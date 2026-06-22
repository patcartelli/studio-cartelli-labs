// src/lib/fullchart-cache.ts
// KV-backed cache for the full weekly album chart (lightweight rows only).
// Populated by a single Last.fm getTopAlbums call — no MusicBrainz, glow, or Odesli enrichment.
// Server-only: accepts KVNamespace and PipelineEnv as parameters. Do not import from client code.

import { getTopAlbums } from './lastfm';
import type { PipelineEnv } from './chart-pipeline';

// Cache key for the full lightweight weekly album chart (versioned to allow safe invalidation).
export const FULLCHART_KEY = 'chart-list:albums:fullchart:v1';

// TTL matches the assembled-cache convention (15 minutes).
const FULLCHART_TTL_SECONDS = 900;

// High limit: fetches the entire weekly chart in a single Last.fm call.
const HIGH_LIMIT = 1000;

// Lightweight album row — derived from Album (lastfm.ts) with url dropped (LIST-04 safeguard).
export interface FullChartAlbum {
  rank: number;
  name: string;
  artist: string;
  playcount: number;
  imageUrl: string;
}

interface FullChartMetadata {
  fetchedAt: number; // ms since epoch (Date.now())
}

/**
 * Return the full weekly album chart from KV, refreshing if stale or missing.
 * Falls back to expired KV data if Last.fm is unreachable (mirrors D-05 from lastfm-cache.ts).
 * Throws only if no cached or live data is available.
 *
 * Behaviors (verified end-to-end via Plan 18-02 endpoint spec):
 *   (1) Returns cached rows within TTL with no Last.fm call.
 *   (2) On cold/stale: calls getTopAlbums once, writes lightweight rows with fetchedAt metadata, returns them.
 *   (3) On getTopAlbums throwing with an expired value present: returns the expired value.
 *   (4) On getTopAlbums throwing with no cached value: rethrows.
 *   (5) Stored rows contain only rank/name/artist/playcount/imageUrl (no url, no enrichment).
 */
export async function getFullChartAlbums(
  kv: KVNamespace,
  env: PipelineEnv
): Promise<{ data: FullChartAlbum[]; fetchedAt: number }> {
  const { value, metadata } = await kv.getWithMetadata(FULLCHART_KEY, {
    type: 'json',
  }) as { value: FullChartAlbum[] | null; metadata: FullChartMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > FULLCHART_TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return { data: value, fetchedAt: metadata!.fetchedAt };
  }

  // Cache miss or stale — fetch live from Last.fm (one call for the full chart).
  try {
    const albums = await getTopAlbums(env, HIGH_LIMIT);
    const fetchedAt = Date.now();

    // Map to lightweight FullChartAlbum rows — drop url to satisfy LIST-04 safeguard.
    const rows: FullChartAlbum[] = albums.map((album) => ({
      rank: album.rank,
      name: album.name,
      artist: album.artist,
      playcount: album.playcount,
      imageUrl: album.imageUrl,
    }));

    await kv.put(FULLCHART_KEY, JSON.stringify(rows), {
      metadata: { fetchedAt } satisfies FullChartMetadata,
    });

    return { data: rows, fetchedAt };
  } catch (err) {
    // Fall back to expired KV data if available (mirrors D-05 from lastfm-cache.ts).
    // Use 0 (not Date.now()) when metadata is missing so the caller can tell this is
    // stale fallback data, not a fresh fetch (CR review WR-04).
    if (value !== null) {
      return { data: value, fetchedAt: metadata?.fetchedAt ?? 0 };
    }
    throw err;
  }
}

/**
 * Best-effort warm of the full-chart cache. Called from the cron handler.
 * Returns early if the KV binding is absent. Swallows errors (fire-and-forget intent).
 */
export async function warmFullChartCache(env: PipelineEnv): Promise<void> {
  if (!env.LASTFM_CHART_CACHE) return;
  try {
    await getFullChartAlbums(env.LASTFM_CHART_CACHE, env);
  } catch {
    // Warm is best-effort — cron fire-and-forget; do not propagate errors.
  }
}
