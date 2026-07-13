// src/lib/fullchart-cache.ts
// KV-backed cache for the full weekly album chart (lightweight rows only).
// Populated by a single Last.fm getTopAlbums call — no MusicBrainz, glow, or Odesli enrichment.
// Server-only: accepts KVNamespace and PipelineEnv as parameters. Do not import from client code.

import { getTopAlbums, getTopArtists, getTopTracks } from './lastfm';
import type { PipelineEnv } from './chart-pipeline';

// Cache key for the full lightweight weekly album chart (versioned to allow safe invalidation).
export const FULLCHART_KEY = 'chart-list:albums:fullchart:v2';

// Cache keys for the full lightweight weekly artist/track charts (v1.16, LIST-06/07).
export const FULLCHART_ARTISTS_KEY = 'chart-list:artists:fullchart:v1';
export const FULLCHART_TRACKS_KEY = 'chart-list:tracks:fullchart:v1';

// TTL matches the assembled-cache convention (15 minutes).
const FULLCHART_TTL_SECONDS = 900;

// High limit: fetches the entire weekly chart in a single Last.fm call.
const HIGH_LIMIT = 1000;

// Lightweight album row — derived from Album (lastfm.ts).
// url is a raw Last.fm getTopAlbums permalink — NOT enrichment, no LIST-04 violation.
export interface FullChartAlbum {
  rank: number;
  name: string;
  artist: string;
  playcount: number;
  imageUrl: string;
  url: string; // Last.fm permalink (raw getTopAlbums field) — NOT enrichment, no LIST-04 violation
}

// Lightweight artist row — derived from Artist (lastfm.ts).
// Artist has no rank field; rank is derived from array position (D-06).
// No imageUrl — Artist carries no image field (D-10).
export interface FullChartArtist {
  rank: number;
  name: string;
  playcount: number;
  url: string; // Last.fm permalink (raw getTopArtists field) — NOT enrichment
}

// Lightweight track row — derived from Track (lastfm.ts) 1:1 (rank/imageUrl already present).
export interface FullChartTrack {
  rank: number;
  name: string;
  artist: string;
  playcount: number;
  imageUrl: string;
  url: string; // Last.fm permalink (raw getTopTracks field) — NOT enrichment
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
 *   (5) Stored rows contain rank/name/artist/playcount/imageUrl/url (url is the raw Last.fm permalink, no enrichment).
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

    // Map to lightweight FullChartAlbum rows — url is the raw Last.fm permalink (not enrichment).
    const rows: FullChartAlbum[] = albums.map((album) => ({
      rank: album.rank,
      name: album.name,
      artist: album.artist,
      playcount: album.playcount,
      imageUrl: album.imageUrl,
      url: album.url,  // Last.fm permalink — raw getTopAlbums field, no enrichment
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

/**
 * Return the full weekly artist chart from KV, refreshing if stale or missing.
 * Mirrors getFullChartAlbums exactly (same TTL, same self-heal, same expired-fallback shape).
 * Artist has no rank field — rank is derived from array position (D-06).
 */
export async function getFullChartArtists(
  kv: KVNamespace,
  env: PipelineEnv
): Promise<{ data: FullChartArtist[]; fetchedAt: number }> {
  const { value, metadata } = await kv.getWithMetadata(FULLCHART_ARTISTS_KEY, {
    type: 'json',
  }) as { value: FullChartArtist[] | null; metadata: FullChartMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > FULLCHART_TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return { data: value, fetchedAt: metadata!.fetchedAt };
  }

  try {
    const artists = await getTopArtists(env, HIGH_LIMIT, '7day');
    const fetchedAt = Date.now();

    const rows: FullChartArtist[] = artists.map((a, i) => ({
      rank: i + 1,
      name: a.name,
      playcount: a.playcount,
      url: a.url,
    }));

    await kv.put(FULLCHART_ARTISTS_KEY, JSON.stringify(rows), {
      metadata: { fetchedAt } satisfies FullChartMetadata,
    });

    return { data: rows, fetchedAt };
  } catch (err) {
    if (value !== null) {
      return { data: value, fetchedAt: metadata?.fetchedAt ?? 0 };
    }
    throw err;
  }
}

/**
 * Best-effort warm of the full-chart artists cache. Called from the cron handler.
 * Returns early if the KV binding is absent. Swallows errors (fire-and-forget intent).
 */
export async function warmFullChartArtistsCache(env: PipelineEnv): Promise<void> {
  if (!env.LASTFM_CHART_CACHE) return;
  try {
    await getFullChartArtists(env.LASTFM_CHART_CACHE, env);
  } catch {
    // Warm is best-effort — cron fire-and-forget; do not propagate errors.
  }
}

/**
 * Return the full weekly track chart from KV, refreshing if stale or missing.
 * Mirrors getFullChartAlbums exactly. Track already carries rank/imageUrl, mapped 1:1.
 */
export async function getFullChartTracks(
  kv: KVNamespace,
  env: PipelineEnv
): Promise<{ data: FullChartTrack[]; fetchedAt: number }> {
  const { value, metadata } = await kv.getWithMetadata(FULLCHART_TRACKS_KEY, {
    type: 'json',
  }) as { value: FullChartTrack[] | null; metadata: FullChartMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > FULLCHART_TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return { data: value, fetchedAt: metadata!.fetchedAt };
  }

  try {
    const tracks = await getTopTracks(env, HIGH_LIMIT);
    const fetchedAt = Date.now();

    const rows: FullChartTrack[] = tracks.map((track) => ({
      rank: track.rank,
      name: track.name,
      artist: track.artist,
      playcount: track.playcount,
      imageUrl: track.imageUrl,
      url: track.url,
    }));

    await kv.put(FULLCHART_TRACKS_KEY, JSON.stringify(rows), {
      metadata: { fetchedAt } satisfies FullChartMetadata,
    });

    return { data: rows, fetchedAt };
  } catch (err) {
    if (value !== null) {
      return { data: value, fetchedAt: metadata?.fetchedAt ?? 0 };
    }
    throw err;
  }
}

/**
 * Best-effort warm of the full-chart tracks cache. Called from the cron handler.
 * Returns early if the KV binding is absent. Swallows errors (fire-and-forget intent).
 */
export async function warmFullChartTracksCache(env: PipelineEnv): Promise<void> {
  if (!env.LASTFM_CHART_CACHE) return;
  try {
    await getFullChartTracks(env.LASTFM_CHART_CACHE, env);
  } catch {
    // Warm is best-effort — cron fire-and-forget; do not propagate errors.
  }
}
