// src/pages/api/resolve-listen.ts
// Resolves a listen link: tries Bandcamp search first, falls back to Last.fm.
export const prerender = false;

import type { APIRoute } from 'astro';

type ListenType = 'artist' | 'album' | 'track';

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
  const pattern = /<div class="searchresult[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="searchresult|<\/div>|$)/g;
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
  const m = block.match(/<div>\s*by\s+([^<]+)<\/div>/);
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
    // Artist page URL: https://artist.bandcamp.com
    const urlMatch = block.match(/<a\s[^>]*href="(https?:\/\/[^"]*\.bandcamp\.com\/?)"[^>]*>/);
    if (!urlMatch) continue;
    const resultUrl = urlMatch[1].replace(/\?from=search.*$/, '');

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

  let bandcampUrl: string | null = null;
  if (type === 'artist') {
    bandcampUrl = await searchBandcampArtist(artist);
  } else if (type === 'album') {
    bandcampUrl = await searchBandcampAlbum(artist, album!);
  } else {
    bandcampUrl = await searchBandcampTrack(artist, track!);
  }

  const headers = {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=86400',
  };

  if (bandcampUrl) {
    return new Response(JSON.stringify({ url: bandcampUrl, source: 'bandcamp' }), { status: 200, headers });
  }

  let fallback: string;
  if (type === 'artist') {
    fallback = lastfmArtistUrl(artist);
  } else if (type === 'album') {
    fallback = lastfmAlbumUrl(artist, album!);
  } else {
    fallback = lastfmTrackUrl(artist, track!);
  }

  return new Response(JSON.stringify({ url: fallback, source: 'lastfm' }), { status: 200, headers });
};
