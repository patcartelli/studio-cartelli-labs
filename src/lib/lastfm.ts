// src/lib/lastfm.ts
// Minimal Last.fm API client for the /experiments/chart page.
// Server-only: reads API key from Cloudflare runtime env. Do not import from client code.

export interface Album {
  rank: number;
  name: string;
  artist: string;
  playcount: number;
  imageUrl: string; // may be empty string when Last.fm returns no art
}

interface LastfmEnv {
  LASTFM_API_KEY?: string;
  LASTFM_USERNAME?: string;
}

interface LastfmImage {
  '#text': string;
  size: string;
}

interface LastfmAlbumRaw {
  '@attr'?: { rank?: string };
  name?: string;
  playcount?: string;
  artist?: { name?: string } | string;
  image?: LastfmImage[];
}

interface LastfmResponse {
  topalbums?: {
    album?: LastfmAlbumRaw[];
  };
  error?: number;
  message?: string;
}

const API_URL = 'https://ws.audioscrobbler.com/2.0/';

/**
 * Fetch the user's top albums for the past 7 days from Last.fm.
 * Throws on network error, non-2xx response, API error, or malformed payload.
 */
export async function getTopAlbums(env: LastfmEnv, limit: number): Promise<Album[]> {
  const apiKey = env.LASTFM_API_KEY;
  const username = env.LASTFM_USERNAME;

  if (!apiKey || !username) {
    throw new Error('Last.fm credentials missing: LASTFM_API_KEY and LASTFM_USERNAME must be set');
  }

  const params = new URLSearchParams({
    method: 'user.getTopAlbums',
    user: username,
    period: '7day',
    limit: String(limit),
    api_key: apiKey,
    format: 'json',
  });

  const response = await fetch(`${API_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Last.fm HTTP ${response.status}`);
  }

  const data = (await response.json()) as LastfmResponse;
  if (data.error) {
    throw new Error(`Last.fm API error ${data.error}: ${data.message ?? 'unknown'}`);
  }

  const rawAlbums = data.topalbums?.album;
  if (!Array.isArray(rawAlbums)) {
    throw new Error('Last.fm response malformed: topalbums.album missing');
  }

  return rawAlbums.map((raw, i): Album => {
    const parsedRank = parseInt(raw['@attr']?.rank ?? '', 10);
    const rank = Number.isFinite(parsedRank) ? parsedRank : i + 1;
    const name = raw.name ?? 'Unknown album';
    const artist =
      typeof raw.artist === 'string'
        ? raw.artist
        : raw.artist?.name ?? 'Unknown artist';
    const parsedPlaycount = parseInt(raw.playcount ?? '', 10);
    const playcount = Number.isFinite(parsedPlaycount) ? parsedPlaycount : 0;
    const extralarge = raw.image?.find((img) => img.size === 'extralarge');
    const imageUrl = extralarge?.['#text'] ?? '';
    return { rank, name, artist, playcount, imageUrl };
  });
}
