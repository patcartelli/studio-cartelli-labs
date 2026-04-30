// src/pages/api/resolve-listen.ts
// Resolves a listen link: tries Odesli first, then Bandcamp, then Last.fm. Results cached in KV.
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { fetchOdesliLink } from '../../lib/odesli';

type ListenType = 'artist' | 'album' | 'track';

interface CacheMetadata {
  fetchedAt: number;
}

const LISTEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (D-08)

/**
 * Normalize a string for comparison: lowercase, collapse whitespace, strip
 * leading "the ", and remove non-alphanumeric characters except spaces.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^the /, '')
    .replace(/[^a-z0-9 ]/g, '');
}

/**
 * Strip common edition/remaster suffixes before comparison.
 * e.g. "OK Computer (Deluxe Edition)" → "OK Computer"
 */
function stripSuffixes(s: string): string {
  return s
    .replace(/\s*\([^)]*(?:edition|remaster|deluxe|expanded|bonus|version|ep|single)[^)]*\)\s*$/gi, '')
    .trim();
}

/**
 * Fuzzy string match: normalize + strip suffixes, then check if either contains the other.
 */
function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(stripSuffixes(a));
  const nb = normalize(stripSuffixes(b));
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Fetch Bandcamp search HTML for the given query and item type.
 */
async function fetchBandcampSearch(query: string, itemType: string): Promise<string | null> {
  const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=${itemType}`;
  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudioCartelli/1.0)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Extract up to 5 result blocks from Bandcamp search HTML.
 */
function extractResultBlocks(html: string): string[] {
  const blocks: string[] = [];
  const pattern = /<li class="searchresult[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null && blocks.length < 5) {
    blocks.push(match[1]);
  }
  return blocks;
}

/**
 * Extract artist name from a Bandcamp result block ("by Artist Name").
 */
function extractResultArtist(block: string): string {
  const m = block.match(/<div class="subhead">\s*by\s+([^<]+)<\/div>/);
  return m ? m[1].trim() : '';
}

/**
 * Search Bandcamp for an artist page and return the URL if a match is found.
 */
async function searchBandcampArtist(artist: string): Promise<string | null> {
  const html = await fetchBandcampSearch(artist, 'b');
  if (!html) return null;

  const blocks = extractResultBlocks(html);
  for (const block of blocks) {
    // Artist page URL: extract from artcont link, strip query params
    const urlMatch = block.match(/<a class="artcont"\s+href="([^"]+)"/);
    if (!urlMatch) continue;
    const resultUrl = urlMatch[1].replace(/\?.*$/, '');

    // For artist results, the band name appears in a heading link
    const titleMatch = block.match(/<div class="heading">\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/);
    const resultName = titleMatch ? titleMatch[1].trim() : '';

    if (fuzzyMatch(resultName, artist)) {
      return resultUrl;
    }
  }
  return null;
}

/**
 * Search Bandcamp for an album page and return the URL if a match is found.
 */
async function searchBandcampAlbum(artist: string, album: string): Promise<string | null> {
  const html = await fetchBandcampSearch(`${artist} ${album}`, 'a');
  if (!html) return null;

  const blocks = extractResultBlocks(html);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    const urlMatch = block.match(/<a\s[^>]*href="(https?:\/\/[^"]*bandcamp\.com\/album\/[^"]+)"/);
    if (!urlMatch) continue;
    const resultUrl = urlMatch[1].replace(/\?from=search.*$/, '');

    const titleLinks = [...block.matchAll(/<a\s[^>]*href="[^"]*bandcamp\.com\/album\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g)];
    const titleMatch = titleLinks.length > 1 ? titleLinks[1] : titleLinks[0];
    const resultAlbum = titleMatch ? titleMatch[1].trim() : '';
    const resultArtist = extractResultArtist(block);

    // First result: accept if artist matches, even if title match is looser
    if (i === 0 && fuzzyMatch(resultArtist, artist)) {
      return resultUrl;
    }

    if (fuzzyMatch(resultArtist, artist) && fuzzyMatch(resultAlbum, album)) {
      return resultUrl;
    }
  }
  return null;
}

/**
 * Search Bandcamp for a track page and return the URL if a match is found.
 */
async function searchBandcampTrack(artist: string, track: string): Promise<string | null> {
  const html = await fetchBandcampSearch(`${artist} ${track}`, 't');
  if (!html) return null;

  const blocks = extractResultBlocks(html);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    const urlMatch = block.match(/<a\s[^>]*href="(https?:\/\/[^"]*bandcamp\.com\/track\/[^"]+)"/);
    if (!urlMatch) continue;
    const resultUrl = urlMatch[1].replace(/\?from=search.*$/, '');

    const titleLinks = [...block.matchAll(/<a\s[^>]*href="[^"]*bandcamp\.com\/track\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g)];
    const titleMatch = titleLinks.length > 1 ? titleLinks[1] : titleLinks[0];
    const resultTrack = titleMatch ? titleMatch[1].trim() : '';
    const resultArtist = extractResultArtist(block);

    // First result: accept if artist matches
    if (i === 0 && fuzzyMatch(resultArtist, artist)) {
      return resultUrl;
    }

    if (fuzzyMatch(resultArtist, artist) && fuzzyMatch(resultTrack, track)) {
      return resultUrl;
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

  // Step 1: Try Odesli with a Spotify search URL (best-effort; indie/unlisted items fall through to Bandcamp)
  // Odesli requires a streaming-platform URL — Last.fm URLs always return HTTP 400.
  // Spotify search URLs are the best available option without a known entity ID.
  // Odesli resolves mainstream releases; indie/unlisted items fall through to Bandcamp.
  const odesliQuery = type === 'album'
    ? `${artist} ${album}`
    : type === 'track'
    ? `${artist} ${track}`
    : artist;
  const inputUrl = `https://open.spotify.com/search/${encodeURIComponent(odesliQuery)}`;

  const odesliUrl = await fetchOdesliLink(inputUrl);
  if (odesliUrl) {
    const result = { url: odesliUrl, source: 'odesli' };
    await kv.put(cacheKey, JSON.stringify(result), {
      metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
    });
    return new Response(JSON.stringify(result), { status: 200, headers });
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
