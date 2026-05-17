// src/lib/deezer.ts
// Deezer Search API entity URL resolver.
// Server-only: called from resolve-listen.ts API route. Do not import from client code.
// No credentials required — Deezer search is an unauthenticated public API.
//
// IMPORTANT: Deezer returns HTTP 200 with body { "error": { "code": N, "message": "…", "type": "…" } }
// on rate-limit and other failures. Always check for the error envelope before reading data.data.

import { normalize, fuzzyMatch } from './fuzzy';

const DEEZER_BASE = 'https://api.deezer.com';
const DEEZER_USER_AGENT = 'Mozilla/5.0 (compatible; StudioCartelli/1.0)';
const DEEZER_TIMEOUT_MS = 5000;
const DEEZER_LIMIT = 10;

interface DeezerAlbumHit {
  link?: string;
  title?: string;
  artist?: { name?: string };
}

interface DeezerTrackHit {
  link?: string;
  title?: string;
  artist?: { name?: string };
  album?: { title?: string };
}

interface DeezerError {
  error: { code?: number; message?: string; type?: string };
}

interface DeezerSearchSuccess<T> {
  data?: T[];
  total?: number;
  next?: string;
}

type DeezerAlbumResponse = DeezerSearchSuccess<DeezerAlbumHit> | DeezerError;
type DeezerTrackResponse = DeezerSearchSuccess<DeezerTrackHit> | DeezerError;

/**
 * Deezer returns HTTP 200 with { error: { code, message, type } } on quota / rate-limit
 * failures. Guard explicitly before reading data.data — naive access crashes the route.
 */
function isDeezerError(d: unknown): d is DeezerError {
  return typeof d === 'object' && d !== null && 'error' in d;
}

/**
 * Match artist strings with the LINK-05 short-artist guard:
 * when normalize(artist).length < 4, require exact equality rather than
 * substring containment — prevents "U2" matching unrelated artists.
 */
function artistMatches(candidate: string, target: string): boolean {
  const na = normalize(candidate);
  const nb = normalize(target);
  if (!na || !nb) return false;
  if (nb.length < 4) return na === nb;
  return fuzzyMatch(candidate, target);
}

/**
 * Search Deezer for an album by artist + album title.
 * Returns the Deezer album landing page URL (link) when a result fuzzy-matches
 * BOTH the artist AND the album title; returns null on miss, error envelope,
 * network error, or timeout.
 * Short artist names (normalize length < 4) require exact artist equality (LINK-05).
 */
export async function searchDeezerAlbum(artist: string, album: string): Promise<string | null> {
  if (!artist || !album) return null;
  const params = new URLSearchParams({
    q: `${artist} ${album}`,
    limit: String(DEEZER_LIMIT),
  });
  try {
    const res = await fetch(`${DEEZER_BASE}/search/album?${params.toString()}`, {
      headers: { 'User-Agent': DEEZER_USER_AGENT },
      signal: AbortSignal.timeout(DEEZER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json() as DeezerAlbumResponse;
    if (isDeezerError(data)) return null;
    const hits = data.data ?? [];
    for (const h of hits) {
      if (!h.link) continue;
      if (!h.artist?.name || !h.title) continue;
      if (!artistMatches(h.artist.name, artist)) continue;
      if (!fuzzyMatch(h.title, album)) continue;
      return h.link;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Search Deezer for a track by artist + track title.
 * Returns the Deezer track landing page URL (link) when a result fuzzy-matches
 * BOTH the artist AND the track title; returns null on miss, error envelope,
 * network error, or timeout.
 * Short artist names (normalize length < 4) require exact artist equality (LINK-05).
 */
export async function searchDeezerTrack(artist: string, track: string): Promise<string | null> {
  if (!artist || !track) return null;
  const params = new URLSearchParams({
    q: `${artist} ${track}`,
    limit: String(DEEZER_LIMIT),
  });
  try {
    const res = await fetch(`${DEEZER_BASE}/search/track?${params.toString()}`, {
      headers: { 'User-Agent': DEEZER_USER_AGENT },
      signal: AbortSignal.timeout(DEEZER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json() as DeezerTrackResponse;
    if (isDeezerError(data)) return null;
    const hits = data.data ?? [];
    for (const h of hits) {
      if (!h.link) continue;
      if (!h.artist?.name || !h.title) continue;
      if (!artistMatches(h.artist.name, artist)) continue;
      if (!fuzzyMatch(h.title, track)) continue;
      return h.link;
    }
    return null;
  } catch {
    return null;
  }
}
