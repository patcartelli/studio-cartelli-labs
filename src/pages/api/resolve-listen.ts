// src/pages/api/resolve-listen.ts
// Resolves a listen link: tries Odesli first, then Bandcamp, then Last.fm. Results cached in KV.
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { fetchOdesliLink } from '../../lib/odesli';
import { normalize, stripSuffixes, fuzzyMatch } from '../../lib/fuzzy';
import { searchItunesAlbum, searchItunesTrack } from '../../lib/itunes';
import { searchDeezerAlbum, searchDeezerTrack } from '../../lib/deezer';

type ListenType = 'artist' | 'album' | 'track';

interface CacheMetadata {
  fetchedAt: number;
}

const LISTEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (D-08)

interface BandcampResult {
  type: string;
  name: string;
  band_name?: string;
  item_url_path?: string;
  item_url_root?: string;
}

/**
 * Query the Bandcamp JSON search API.
 * search_filter: 'a' = album, 'b' = band/artist, 't' = track
 */
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
    if (r.item_url_root && fuzzyMatch(r.name, artist)) {
      return r.item_url_root;
    }
  }
  return null;
}

async function searchBandcampAlbum(artist: string, album: string): Promise<string | null> {
  const results = await fetchBandcampResults(`${artist} ${album}`, 'a');
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.item_url_path) continue;
    // First result: accept if artist matches
    if (i === 0 && r.band_name && fuzzyMatch(r.band_name, artist)) {
      return r.item_url_path;
    }
    if (r.band_name && fuzzyMatch(r.band_name, artist) && fuzzyMatch(r.name, album)) {
      return r.item_url_path;
    }
  }
  return null;
}

async function searchBandcampTrack(artist: string, track: string): Promise<string | null> {
  const results = await fetchBandcampResults(`${artist} ${track}`, 't');
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.item_url_path) continue;
    // First result: accept if artist matches
    if (i === 0 && r.band_name && fuzzyMatch(r.band_name, artist)) {
      return r.item_url_path;
    }
    if (r.band_name && fuzzyMatch(r.band_name, artist) && fuzzyMatch(r.name, track)) {
      return r.item_url_path;
    }
  }
  return null;
}

/**
 * Construct Last.fm URLs (always valid, no network request needed).
 */
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

export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get('artist');
  const rawType = searchParams.get('type') ?? 'album';
  if (rawType !== 'artist' && rawType !== 'album' && rawType !== 'track') {
    return new Response('Bad request: type must be artist, album, or track', { status: 400 });
  }
  const type = rawType as ListenType;
  const album = searchParams.get('album');
  const track = searchParams.get('track');

  if (!artist) {
    return new Response('Bad request: artist param required', { status: 400 });
  }
  if (type === 'album' && !album) {
    return new Response('Bad request: album param required for type=album', { status: 400 });
  }
  if (type === 'track' && !track) {
    return new Response('Bad request: track param required for type=track', { status: 400 });
  }

  const kv = (env as unknown as { LASTFM_CHART_CACHE: KVNamespace }).LASTFM_CHART_CACHE;

  const esc = encodeURIComponent;
  const cacheKey = type === 'album'
    ? `listen:album:${esc(artist)}:${esc(album!)}`
    : type === 'track'
    ? `listen:track:${esc(artist)}:${esc(track!)}`
    : `listen:artist:${esc(artist)}`;

  const headers = {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=86400',
  };

  // KV cache read
  const { value: cached, metadata } = await kv.getWithMetadata(cacheKey, {
    type: 'json',
  }) as { value: { url: string; source: string } | null; metadata: CacheMetadata | null };

  if (cached && metadata && (Date.now() - metadata.fetchedAt) <= LISTEN_TTL_MS) {
    return new Response(JSON.stringify(cached), { status: 200, headers });
  }

  // Step 1: Resolve a real streaming-platform entity URL (iTunes → Deezer cascade) and feed
  // it to Odesli. Odesli rejects search URLs and Last.fm URLs (HTTP 400), so a working
  // entity URL is required to get a song.link landing page back. Skipped for type=artist
  // because iTunes/Deezer search-by-album/track does not apply to artist lookups; artist
  // links fall through directly to Bandcamp (Step 2) and Last.fm (Step 3).
  if (type === 'album' || type === 'track') {
    let entityUrl: string | null = null;
    if (type === 'album') {
      entityUrl = await searchItunesAlbum(artist, album!);
      if (!entityUrl) entityUrl = await searchDeezerAlbum(artist, album!);
    } else {
      entityUrl = await searchItunesTrack(artist, track!);
      if (!entityUrl) entityUrl = await searchDeezerTrack(artist, track!);
    }

    if (entityUrl) {
      const odesliUrl = await fetchOdesliLink(entityUrl);
      if (odesliUrl) {
        const result = { url: odesliUrl, source: 'odesli' };
        await kv.put(cacheKey, JSON.stringify(result), {
          metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
        });
        return new Response(JSON.stringify(result), { status: 200, headers });
      }
    }
  }

  // Step 2: Try Bandcamp
  let bandcampUrl: string | null = null;
  if (type === 'artist') {
    bandcampUrl = await searchBandcampArtist(artist);
  } else if (type === 'album') {
    bandcampUrl = await searchBandcampAlbum(artist, album!);
  } else {
    bandcampUrl = await searchBandcampTrack(artist, track!);
  }

  if (bandcampUrl) {
    const result = { url: bandcampUrl, source: 'bandcamp' };
    await kv.put(cacheKey, JSON.stringify(result), {
      metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
    });
    return new Response(JSON.stringify(result), { status: 200, headers });
  }

  // Step 3: Last.fm permalink fallback
  let fallback: string;
  if (type === 'artist') {
    fallback = lastfmArtistUrl(artist);
  } else if (type === 'album') {
    fallback = lastfmAlbumUrl(artist, album!);
  } else {
    fallback = lastfmTrackUrl(artist, track!);
  }

  const result = { url: fallback, source: 'lastfm' };
  await kv.put(cacheKey, JSON.stringify(result), {
    metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
  });
  return new Response(JSON.stringify(result), { status: 200, headers });
};
