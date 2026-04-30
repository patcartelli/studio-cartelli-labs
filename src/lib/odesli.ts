// src/lib/odesli.ts
// Odesli/song.link API client.
// Server-only: called from resolve-listen.ts API route. Do not import from client code.

const ODESLI_BASE = 'https://api.song.link/v1-alpha.1/links';

/**
 * Call the Odesli/song.link API for a given streaming platform URL.
 * Returns the song.link landing page URL (pageUrl) on success, null on miss or error.
 * Input must be a streaming-platform URL (Spotify, Apple Music, etc.) — Last.fm URLs return 400.
 */
export async function fetchOdesliLink(inputUrl: string): Promise<string | null> {
  const params = new URLSearchParams({ url: inputUrl, userCountry: 'US' });
  try {
    const res = await fetch(`${ODESLI_BASE}?${params.toString()}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StudioCartelli/1.0)' },
    });
    if (!res.ok) return null;
    const data = await res.json() as { pageUrl?: string };
    return data.pageUrl ?? null;
  } catch {
    return null;
  }
}
