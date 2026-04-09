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

export interface Artist {
  id: string;
  name: string;
  playcount: number;
  url: string;
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
 * Private helper to fetch from Last.fm API with common error handling.
 */
async function fetchLastfm(
  params: Record<string, string>,
  env: LastfmEnv
): Promise<unknown> {
  const apiKey = env.LASTFM_API_KEY;
  if (!apiKey) {
    throw new Error('Last.fm API key missing: LASTFM_API_KEY must be set');
  }

  const searchParams = new URLSearchParams({
    ...params,
    api_key: apiKey,
    format: 'json',
  });

  const response = await fetch(`${API_URL}?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`Last.fm HTTP ${response.status}`);
  }

  const data = (await response.json()) as { error?: number; message?: string };
  if ((data as { error?: number }).error) {
    throw new Error(`Last.fm API error ${(data as { error?: number }).error}: ${(data as { message?: string }).message ?? 'unknown'}`);
  }

  return data;
}

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

// ---- Network functions ----

export async function getTopArtists(
  env: LastfmEnv,
  limit: number,
  period: string
): Promise<Artist[]> {
  const data = await fetchLastfm(
    { method: 'user.getTopArtists', period, limit: String(limit) },
    env
  ) as { topartists: { artist: Array<{
    name: string;
    playcount: string;
    url: string;
  }> } };

  return data.topartists.artist.map((a) => ({
    id: a.name,
    name: a.name,
    playcount: parseInt(a.playcount, 10),
    url: a.url,
  }));
}

export async function getArtistTags(
  env: LastfmEnv,
  artistName: string
): Promise<string[]> {
  try {
    const data = await fetchLastfm(
      { method: 'artist.getTopTags', artist: artistName },
      env
    ) as { toptags: { tag: Array<{ name: string; count: number }> } };

    const noiseTags = new Set(['seen live', 'favorites', 'favourite', 'love', 'amazing', 'awesome']);
    return (data.toptags?.tag ?? [])
      .filter((t) => !noiseTags.has(t.name.toLowerCase()))
      .slice(0, 5)
      .map((t) => t.name.toLowerCase());
  } catch {
    return [];
  }
}

export async function getArtistSimilar(
  env: LastfmEnv,
  artistName: string
): Promise<{ name: string; similarity: number }[]> {
  try {
    const data = await fetchLastfm(
      { method: 'artist.getSimilar', artist: artistName, limit: '50' },
      env
    ) as { similarartists: { artist: Array<{ name: string; match: string }> } };

    return (data.similarartists?.artist ?? []).map((a) => ({
      name: a.name,
      similarity: parseFloat(a.match),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch an async function for each item in batches of `batchSize` concurrent calls.
 * Prevents overwhelming the Last.fm API with 100 simultaneous requests.
 */
export async function batchFetch<T>(
  items: string[],
  fn: (item: string) => Promise<T>,
  batchSize = 20
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}
