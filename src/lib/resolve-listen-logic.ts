// src/lib/resolve-listen-logic.ts
// Shared listen-link resolver: iTunes → Deezer → Odesli → Bandcamp → Last.fm cascade.
// Used by /api/resolve-listen (single lookup) and /api/chart-data (bulk lookup via Promise.allSettled).
// Server-only. Do not import from client code.

import { fetchOdesliLink } from './odesli';
import { fuzzyMatch } from './fuzzy';
import { searchItunesAlbum, searchItunesTrack } from './itunes';
import { searchDeezerAlbum, searchDeezerTrack } from './deezer';

export type ListenType = 'artist' | 'album' | 'track';

export interface ResolvedListen {
  url: string;
  source: 'odesli' | 'bandcamp' | 'lastfm';
}

interface CacheMetadata {
  fetchedAt: number;
  /** Logical TTL for this entry; defaults to LISTEN_TTL_MS when absent. */
  ttlMs?: number;
}

const LISTEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Last.fm-floor results usually mean the upstream providers failed (possibly
// transiently) — re-resolve after an hour instead of locking in for a week.
const FALLBACK_TTL_MS = 60 * 60 * 1000; // 1 hour
// Physical KV expiry so abandoned keys don't accumulate forever.
const KV_EXPIRATION_SECONDS = 30 * 24 * 60 * 60; // 30 days

// --- Bandcamp helpers (copy verbatim from resolve-listen.ts lines 20–95) ---
interface BandcampResult {
  type: string;
  name: string;
  band_name?: string;
  item_url_path?: string;
  item_url_root?: string;
}

async function fetchBandcampResults(query: string, searchFilter: string): Promise<BandcampResult[]> {
  try {
    const res = await fetch('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; StudioCartelli/1.0)',
      },
      body: JSON.stringify({
        search_text: query,
        search_filter: searchFilter,
        full_page: false,
        fan_id: null,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json() as { auto?: { results?: BandcampResult[] } };
    return data.auto?.results?.slice(0, 15) ?? [];
  } catch {
    return [];
  }
}

async function searchBandcampArtist(artist: string): Promise<string | null> {
  const results = await fetchBandcampResults(artist, 'b');
  for (const r of results) {
    if (r.item_url_root && fuzzyMatch(r.name, artist)) return r.item_url_root;
  }
  return null;
}

async function searchBandcampAlbum(artist: string, album: string): Promise<string | null> {
  const results = await fetchBandcampResults(`${artist} ${album}`, 'a');
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.item_url_path) continue;
    if (i === 0 && r.band_name && fuzzyMatch(r.band_name, artist)) return r.item_url_path;
    if (r.band_name && fuzzyMatch(r.band_name, artist) && fuzzyMatch(r.name, album)) return r.item_url_path;
  }
  return null;
}

async function searchBandcampTrack(artist: string, track: string): Promise<string | null> {
  const results = await fetchBandcampResults(`${artist} ${track}`, 't');
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.item_url_path) continue;
    if (i === 0 && r.band_name && fuzzyMatch(r.band_name, artist)) return r.item_url_path;
    if (r.band_name && fuzzyMatch(r.band_name, artist) && fuzzyMatch(r.name, track)) return r.item_url_path;
  }
  return null;
}

// --- Last.fm permalink builders (copy verbatim from resolve-listen.ts lines 100–112) ---
function lastfmArtistUrl(artist: string): string {
  return `https://www.last.fm/music/${encodeURIComponent(artist).replace(/%20/g, '+')}`;
}

function lastfmAlbumUrl(artist: string, album: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
  return `https://www.last.fm/music/${enc(artist)}/${enc(album)}`;
}

function lastfmTrackUrl(artist: string, track: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
  return `https://www.last.fm/music/${enc(artist)}/_/${enc(track)}`;
}

/**
 * Resolve a listen link for an artist / album / track.
 * - KV cache: 7-day TTL, key format `listen:${type}:${esc(artist)}[:${esc(name)}]`.
 * - Cascade: iTunes → Deezer → Odesli (album/track only); Bandcamp; Last.fm permalink (always succeeds).
 * - Never throws. Last.fm permalink is the always-valid floor.
 *
 * @param kv         KVNamespace bound to LASTFM_CHART_CACHE.
 * @param artist     Artist name (required).
 * @param name       Album title (type='album'), track title (type='track'), or null (type='artist').
 * @param type       'artist' | 'album' | 'track'.
 */
export async function resolveListenLink(
  kv: KVNamespace,
  artist: string,
  name: string | null,
  type: ListenType
): Promise<ResolvedListen> {
  const esc = encodeURIComponent;
  const cacheKey = type === 'album'
    ? `listen:album:${esc(artist)}:${esc(name!)}`
    : type === 'track'
    ? `listen:track:${esc(artist)}:${esc(name!)}`
    : `listen:artist:${esc(artist)}`;

  // KV cache read — tolerate failures (KV unavailable → run cascade)
  let cached: ResolvedListen | null = null;
  let metadata: CacheMetadata | null = null;
  try {
    const r = await kv.getWithMetadata(cacheKey, { type: 'json' }) as {
      value: ResolvedListen | null;
      metadata: CacheMetadata | null;
    };
    cached = r.value;
    metadata = r.metadata;
  } catch {
    // KV unavailable — proceed to live cascade
  }

  if (cached && metadata && (Date.now() - metadata.fetchedAt) <= (metadata.ttlMs ?? LISTEN_TTL_MS)) {
    return cached;
  }

  // Step 1: iTunes → Deezer → Odesli (album/track only)
  if (type === 'album' || type === 'track') {
    let entityUrl: string | null = null;
    if (type === 'album') {
      entityUrl = await searchItunesAlbum(artist, name!);
      if (!entityUrl) entityUrl = await searchDeezerAlbum(artist, name!);
    } else {
      entityUrl = await searchItunesTrack(artist, name!);
      if (!entityUrl) entityUrl = await searchDeezerTrack(artist, name!);
    }

    if (entityUrl) {
      const odesliUrl = await fetchOdesliLink(entityUrl);
      if (odesliUrl) {
        const result: ResolvedListen = { url: odesliUrl, source: 'odesli' };
        try {
          await kv.put(cacheKey, JSON.stringify(result), {
            metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
            expirationTtl: KV_EXPIRATION_SECONDS,
          });
        } catch { /* KV write failure — still return result */ }
        return result;
      }
    }
  }

  // Step 2: Bandcamp
  let bandcampUrl: string | null = null;
  if (type === 'artist') bandcampUrl = await searchBandcampArtist(artist);
  else if (type === 'album') bandcampUrl = await searchBandcampAlbum(artist, name!);
  else bandcampUrl = await searchBandcampTrack(artist, name!);

  if (bandcampUrl) {
    const result: ResolvedListen = { url: bandcampUrl, source: 'bandcamp' };
    try {
      await kv.put(cacheKey, JSON.stringify(result), {
        metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
        expirationTtl: KV_EXPIRATION_SECONDS,
      });
    } catch { /* swallow KV write failure */ }
    return result;
  }

  // Step 3: Last.fm permalink — always succeeds
  let fallback: string;
  if (type === 'artist') fallback = lastfmArtistUrl(artist);
  else if (type === 'album') fallback = lastfmAlbumUrl(artist, name!);
  else fallback = lastfmTrackUrl(artist, name!);

  const result: ResolvedListen = { url: fallback, source: 'lastfm' };
  try {
    await kv.put(cacheKey, JSON.stringify(result), {
      metadata: { fetchedAt: Date.now(), ttlMs: FALLBACK_TTL_MS } satisfies CacheMetadata,
      expirationTtl: KV_EXPIRATION_SECONDS,
    });
  } catch { /* swallow KV write failure */ }
  return result;
}
