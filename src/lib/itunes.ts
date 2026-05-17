// src/lib/itunes.ts
// iTunes Search API entity URL resolver.
// Server-only: called from resolve-listen.ts API route. Do not import from client code.
// No credentials required — iTunes Search is an unauthenticated public API.

import { normalize, fuzzyMatch } from './fuzzy';

const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const ITUNES_USER_AGENT = 'Mozilla/5.0 (compatible; StudioCartelli/1.0)';
const ITUNES_TIMEOUT_MS = 5000;
const ITUNES_LIMIT = 10;
const ITUNES_COUNTRY = 'US';

interface ItunesResult {
  wrapperType?: string;
  collectionViewUrl?: string;
  trackViewUrl?: string;
  artistName?: string;
  collectionName?: string;
  trackName?: string;
}

interface ItunesSearchResponse {
  resultCount?: number;
  results?: ItunesResult[];
}

/**
 * Match artist strings with the LINK-05 short-artist guard:
 * when normalize(artist).length < 4, require exact equality rather than
 * substring containment — prevents "U2" matching "U2 Plays" or "Lou Reed".
 */
function artistMatches(candidate: string, target: string): boolean {
  const na = normalize(candidate);
  const nb = normalize(target);
  if (!na || !nb) return false;
  if (nb.length < 4) return na === nb;
  return fuzzyMatch(candidate, target);
}

/**
 * Search the iTunes catalogue for an album by artist + album title.
 * Returns the iTunes album landing page URL (collectionViewUrl) when a result
 * fuzzy-matches BOTH the artist AND the album title; returns null otherwise.
 * Short artist names (normalize length < 4) require exact artist equality (LINK-05).
 */
export async function searchItunesAlbum(artist: string, album: string): Promise<string | null> {
  if (!artist || !album) return null;
  const params = new URLSearchParams({
    term: `${artist} ${album}`,
    entity: 'album',
    limit: String(ITUNES_LIMIT),
    country: ITUNES_COUNTRY,
  });
  try {
    const res = await fetch(`${ITUNES_SEARCH}?${params.toString()}`, {
      headers: { 'User-Agent': ITUNES_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as ItunesSearchResponse;
    const results = data.results ?? [];
    for (const r of results) {
      if (!r.collectionViewUrl) continue;
      if (!r.artistName || !r.collectionName) continue;
      if (!artistMatches(r.artistName, artist)) continue;
      if (!fuzzyMatch(r.collectionName, album)) continue;
      return r.collectionViewUrl;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Search the iTunes catalogue for a track by artist + track title.
 * Returns the iTunes track landing page URL (trackViewUrl) when a result
 * fuzzy-matches BOTH the artist AND the track title; returns null otherwise.
 * Short artist names (normalize length < 4) require exact artist equality (LINK-05).
 */
export async function searchItunesTrack(artist: string, track: string): Promise<string | null> {
  if (!artist || !track) return null;
  const params = new URLSearchParams({
    term: `${artist} ${track}`,
    entity: 'song',
    limit: String(ITUNES_LIMIT),
    country: ITUNES_COUNTRY,
  });
  try {
    const res = await fetch(`${ITUNES_SEARCH}?${params.toString()}`, {
      headers: { 'User-Agent': ITUNES_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as ItunesSearchResponse;
    const results = data.results ?? [];
    for (const r of results) {
      if (!r.trackViewUrl) continue;
      if (!r.artistName || !r.trackName) continue;
      if (!artistMatches(r.artistName, artist)) continue;
      if (!fuzzyMatch(r.trackName, track)) continue;
      return r.trackViewUrl;
    }
    return null;
  } catch {
    return null;
  }
}
