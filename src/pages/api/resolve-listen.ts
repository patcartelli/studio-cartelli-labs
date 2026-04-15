// src/pages/api/resolve-listen.ts
// Resolves a listen link for an album: tries Bandcamp search first, falls back to Last.fm.
export const prerender = false;

import type { APIRoute } from 'astro';

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
 * Search Bandcamp for an album and return the URL if a close match is found.
 */
async function searchBandcamp(artist: string, album: string): Promise<string | null> {
  const query = `${artist} ${album}`;
  const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=a`;

  let html: string;
  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudioCartelli/1.0)' },
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const resultPattern = /<div class="searchresult[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="searchresult|$)/g;
  const normArtist = normalize(artist);
  const normAlbum = normalize(album);

  let match: RegExpExecArray | null;
  let checked = 0;
  while ((match = resultPattern.exec(html)) !== null && checked < 5) {
    checked++;
    const block = match[1];

    // Extract album URL from the first <a href="https://...bandcamp.com/album/...">
    const urlMatch = block.match(/<a\s[^>]*href="(https?:\/\/[^"]*bandcamp\.com\/album\/[^"]+)"/);
    if (!urlMatch) continue;
    const resultUrl = urlMatch[1].replace(/\?from=search.*$/, '');

    // Extract album name from the second <a> (first is the image link, second is the title)
    const titleLinks = [...block.matchAll(/<a\s[^>]*href="[^"]*bandcamp\.com\/album\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g)];
    const titleMatch = titleLinks.length > 1 ? titleLinks[1] : titleLinks[0];
    const resultAlbum = titleMatch ? normalize(titleMatch[1]) : '';

    // Extract artist from "<div>by Artist Name</div>"
    const subheadMatch = block.match(/<div>\s*by\s+([^<]+)<\/div>/);
    const resultArtist = subheadMatch ? normalize(subheadMatch[1]) : '';

    if (resultAlbum === normAlbum && resultArtist === normArtist) {
      return resultUrl;
    }
  }

  return null;
}

/**
 * Construct a Last.fm album URL (always valid, no network request needed).
 */
function lastfmUrl(artist: string, album: string): string {
  const encArtist = encodeURIComponent(artist).replace(/%20/g, '+');
  const encAlbum = encodeURIComponent(album).replace(/%20/g, '+');
  return `https://www.last.fm/music/${encArtist}/${encAlbum}`;
}

export const GET: APIRoute = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get('artist');
  const album = searchParams.get('album');

  if (!artist || !album) {
    return new Response('Bad request: artist and album params required', { status: 400 });
  }

  const bandcampUrl = await searchBandcamp(artist, album);
  if (bandcampUrl) {
    return new Response(JSON.stringify({ url: bandcampUrl, source: 'bandcamp' }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=86400',
      },
    });
  }

  return new Response(JSON.stringify({ url: lastfmUrl(artist, album), source: 'lastfm' }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=86400',
    },
  });
};
