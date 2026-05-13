// src/lib/musicbrainz.ts
// Raw MusicBrainz API client for the /experiments/chart page.
// Server-only: no KV dependency. Do not import from client code.

import { getWikidataArtistImageUrl } from './wikidata';

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_USER_AGENT = 'studio-cartelli/1.0 (cartelli@gmail.com)';

// D-04: relation types to exclude from the "allowed social" bucket.
// Normalize r.type to lowercase before membership check (guards IMDb casing variance).
const EXCLUDED_TYPES = new Set([
  'discogs', 'allmusic', 'wikidata', 'musicbrainz', 'wikipedia', 'imdb',
]);

// Secondary types that indicate non-primary releases (excluded from "latest release" lookup).
const EXCLUDED_RG_SECONDARY = new Set(['Live', 'Compilation', 'Remix', 'DJ-mix', 'Mixtape/Street']);

interface MBRelation {
  type: string;
  url: { resource: string };
  direction: string;
}

interface MBArtistLookup {
  relations: MBRelation[];
}

interface MBArtistSearchResult {
  artists: Array<{ id: string; name: string; score: number }>;
}

interface WikimediaImageInfoResponse {
  query?: {
    pages?: Record<string, {
      imageinfo?: Array<{
        thumburl?: string;
        url?: string;
      }>;
      missing?: string;
    }>;
  };
}

interface MBReleaseGroup {
  id: string;
  title: string;
  'primary-type'?: string;       // "Album", "Single", "EP", "Other", "Broadcast"
  'secondary-types'?: string[];  // "Live", "Compilation", "Remix", etc.
  'first-release-date'?: string; // YYYY, YYYY-MM, or YYYY-MM-DD
}

interface MBReleaseGroupBrowseResult {
  'release-groups': MBReleaseGroup[];
  'release-group-count': number;
}

// Combined resolved data for a single artist. Populated by one search + one url-rels lookup.
export interface ArtistBundle {
  mbid: string;
  url: string;      // website URL (D-03 cascade: official-homepage → bandcamp → social → Last.fm)
  imageUrl: string; // artist photo URL (MB image relation → Commons CDN → Wikidata P18)
}

// Convert MB partial date string to a sortable integer for descending sort.
// "2023-09-29" → 20230929, "2023-09" → 20230900, "2023" → 20230000, undefined → 0
function parseMBDate(date: string | undefined): number {
  if (!date) return 0;
  const parts = date.split('-');
  const y = parseInt(parts[0] ?? '0', 10) || 0;
  const m = parseInt(parts[1] ?? '0', 10) || 0;
  const d = parseInt(parts[2] ?? '0', 10) || 0;
  return y * 10000 + m * 100 + d;
}

async function mbFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': MB_USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`MusicBrainz HTTP ${res.status}`);
  }
  return res.json();
}

export async function resolveMBArtistUrl(artistName: string, fallback: string): Promise<string> {
  try {
    const searchUrl = `${MB_BASE}/artist?query=${encodeURIComponent(artistName)}&limit=1&fmt=json`;
    const searchData = await mbFetch(searchUrl) as MBArtistSearchResult;
    const mbid = searchData.artists?.[0]?.id;
    if (!mbid) return fallback;

    const lookupUrl = `${MB_BASE}/artist/${mbid}?inc=url-rels&fmt=json`;
    const lookupData = await mbFetch(lookupUrl) as MBArtistLookup;
    const relations = lookupData.relations ?? [];

    const official = relations.find(r => r.type === 'official homepage');
    if (official) return official.url.resource;

    const bandcamp = relations.find(r => r.type === 'bandcamp');
    if (bandcamp) return bandcamp.url.resource;

    const social = relations.find(r => !EXCLUDED_TYPES.has(r.type.toLowerCase()));
    if (social) return social.url.resource;

    return fallback;
  } catch {
    return fallback;
  }
}

async function resolveCommonsFileUrl(filePageUrl: string): Promise<string> {
  const match = filePageUrl.match(/\/wiki\/(File:[^#?]+)/);
  if (!match) return '';
  const title = decodeURIComponent(match[1]);

  const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('prop', 'imageinfo');
  apiUrl.searchParams.set('iiprop', 'url');
  apiUrl.searchParams.set('iiurlwidth', '500');
  apiUrl.searchParams.set('redirects', '');
  apiUrl.searchParams.set('titles', title);
  apiUrl.searchParams.set('format', 'json');

  try {
    const res = await fetch(apiUrl.toString(), {
      headers: { 'User-Agent': MB_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return '';

    const data = await res.json() as WikimediaImageInfoResponse;
    const pages = data.query?.pages ?? {};
    const page = Object.values(pages)[0];
    return page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url ?? '';
  } catch {
    return '';
  }
}

export async function resolveMBArtistImageUrl(artistName: string): Promise<string> {
  try {
    const searchUrl = `${MB_BASE}/artist?query=${encodeURIComponent(artistName)}&limit=1&fmt=json`;
    const searchData = await mbFetch(searchUrl) as MBArtistSearchResult;
    const mbid = searchData.artists?.[0]?.id;
    if (!mbid) return '';

    const lookupUrl = `${MB_BASE}/artist/${mbid}?inc=url-rels&fmt=json`;
    const lookupData = await mbFetch(lookupUrl) as MBArtistLookup;
    const relations = lookupData.relations ?? [];

    const imageRel = relations.find(r => r.type === 'image');
    if (!imageRel) {
      return await getWikidataArtistImageUrl(mbid);
    }

    const cdnUrl = await resolveCommonsFileUrl(imageRel.url.resource);
    if (cdnUrl) return cdnUrl;

    return await getWikidataArtistImageUrl(mbid);
  } catch {
    return '';
  }
}

// Resolve Wikidata P18 to a direct CDN thumburl.
// Wikidata P18 values are http://commons.wikimedia.org/wiki/Special:FilePath/Foo.jpg.
// Rewriting to File:Foo.jpg lets resolveCommonsFileUrl fetch a sized thumbnail via the
// imageinfo API — same path as MB 'image' relations, no browser-side redirect needed.
// Falls back to the raw Special:FilePath URL (with https:// upgrade) if CDN resolution fails.
async function resolveWikidataImageUrl(mbid: string): Promise<string> {
  const raw = await getWikidataArtistImageUrl(mbid); // returns https://…/Special:FilePath/…
  if (!raw) return '';
  const filePageUrl = raw.replace('/wiki/Special:FilePath/', '/wiki/File:');
  const cdnUrl = await resolveCommonsFileUrl(filePageUrl);
  return cdnUrl || raw; // fall back to Special:FilePath if imageinfo API fails
}

/**
 * Resolve all artist data in a single MB search + url-rels lookup.
 * Returns MBID, website URL, and artist photo URL from one search and one artist lookup —
 * compared to calling the three separate resolvers, this cuts MB API calls by ~60% per artist.
 *
 * The returned MBID is passed directly to resolveLatestReleaseCoverByMBID, eliminating the
 * redundant artist search that the old release resolver performed independently.
 */
async function resolveDeezerImageUrl(artistName: string): Promise<string> {
  try {
    const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': MB_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return '';
    const data = await res.json() as { data?: Array<{ picture_xl?: string }> };
    return data.data?.[0]?.picture_xl ?? '';
  } catch {
    return '';
  }
}

async function resolveTheAudioDBImageUrl(artistName: string, apiKey: string): Promise<string> {
  if (!apiKey) return '';
  try {
    const url = `https://www.theaudiodb.com/api/v1/json/${encodeURIComponent(apiKey)}/search.php?s=${encodeURIComponent(artistName)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': MB_USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return '';
    const data = await res.json() as { artists?: Array<{ strArtistThumb?: string }> };
    return data.artists?.[0]?.strArtistThumb ?? '';
  } catch {
    return '';
  }
}

export async function resolveArtistBundle(artistName: string, fallbackUrl: string, tadbApiKey = ''): Promise<ArtistBundle> {
  try {
    const searchUrl = `${MB_BASE}/artist?query=${encodeURIComponent(artistName)}&limit=1&fmt=json`;
    const searchData = await mbFetch(searchUrl) as MBArtistSearchResult;
    const mbid = searchData.artists?.[0]?.id;
    if (!mbid) {
      // MB rate-limited or no result — try TheAudioDB then Deezer by name for the photo.
      const imageUrl = await resolveTheAudioDBImageUrl(artistName, tadbApiKey)
        || await resolveDeezerImageUrl(artistName);
      return { mbid: '', url: fallbackUrl, imageUrl };
    }

    // One lookup for both website URL and image relation — same inc=url-rels response.
    const lookupUrl = `${MB_BASE}/artist/${mbid}?inc=url-rels&fmt=json`;
    const lookupData = await mbFetch(lookupUrl) as MBArtistLookup;
    const relations = lookupData.relations ?? [];

    // D-03 cascade: official-homepage → bandcamp → first allowed social → fallback
    const official = relations.find(r => r.type === 'official homepage');
    const bandcamp = relations.find(r => r.type === 'bandcamp');
    const social = relations.find(r => !EXCLUDED_TYPES.has(r.type.toLowerCase()));
    const url = official?.url.resource ?? bandcamp?.url.resource ?? social?.url.resource ?? fallbackUrl;

    // Artist photo: MB image relation → Commons CDN → Wikidata P18 → TheAudioDB.
    // Wikimedia paths resolve to a direct upload.wikimedia.org CDN thumburl.
    // TheAudioDB is a name-based fallback that works even when MB has no image relation.
    const imageRel = relations.find(r => r.type === 'image');
    let imageUrl = '';
    if (imageRel) {
      const cdnUrl = await resolveCommonsFileUrl(imageRel.url.resource);
      imageUrl = cdnUrl || await resolveWikidataImageUrl(mbid);
    } else {
      imageUrl = await resolveWikidataImageUrl(mbid);
    }
    if (!imageUrl) {
      imageUrl = await resolveTheAudioDBImageUrl(artistName, tadbApiKey)
        || await resolveDeezerImageUrl(artistName);
    }

    return { mbid, url, imageUrl };
  } catch {
    // MB threw (503 rate limit, network error) — try TheAudioDB then Deezer by name.
    const imageUrl = await resolveTheAudioDBImageUrl(artistName, tadbApiKey).catch(() => '')
      || await resolveDeezerImageUrl(artistName).catch(() => '');
    return { mbid: '', url: fallbackUrl, imageUrl };
  }
}

/**
 * Resolve the latest release cover URL using the release-group browse endpoint.
 * Accepts MBID directly — no artist name search needed (caller gets MBID from resolveArtistBundle).
 *
 * Uses release-group browse (not individual release browse) because:
 *   - Release groups represent distinct titles (album/single/EP), not individual pressings
 *   - Prolific artists can have 1000+ individual releases (live recordings, bootlegs, reissues)
 *     that pollute the browse results and obscure the actual latest studio release
 *   - Release-group 'secondary-types' cleanly excludes Live/Compilation/Remix entries
 *   - CAA aggregates cover art from all releases in a group, so coverage is better
 *
 * Cover art verified via CAA's /release-group/{id} JSON endpoint (200 = art exists, 404 = none).
 * Returns '' when: no release groups found, none pass the secondary-type filter, none have CAA art.
 */
export async function resolveLatestReleaseCoverByMBID(mbid: string): Promise<{ coverUrl: string; title: string }> {
  if (!mbid) return { coverUrl: '', title: '' };
  try {
    const browseUrl = `${MB_BASE}/release-group?artist=${encodeURIComponent(mbid)}&limit=100&sort=date&sortorder=desc&fmt=json`;
    const browseData = await mbFetch(browseUrl) as MBReleaseGroupBrowseResult;
    const releaseGroups = browseData['release-groups'] ?? [];

    // Filter out live albums, compilations, remixes — secondary-types is an array.
    // Primary-type check is intentionally omitted: recent EPs and singles with cover art
    // are valid "latest release" candidates alongside full Albums.
    const sorted = releaseGroups
      .filter(rg => {
        const secondary = rg['secondary-types'] ?? [];
        return !secondary.some(t => EXCLUDED_RG_SECONDARY.has(t));
      })
      .sort((a, b) => parseMBDate(b['first-release-date']) - parseMBDate(a['first-release-date']));

    // Probe top 3 newest candidates via CAA JSON listing (clean 200/404, no redirect chain).
    for (const rg of sorted.slice(0, 3)) {
      try {
        const caaRes = await fetch(`https://coverartarchive.org/release-group/${rg.id}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (caaRes.ok) return { coverUrl: `https://coverartarchive.org/release-group/${rg.id}/front-250`, title: rg.title };
      } catch {
        // try next candidate
      }
    }
    // No CAA art found — return title of the newest candidate anyway so callers can display it.
    return { coverUrl: '', title: sorted[0]?.title ?? '' };
  } catch {
    return { coverUrl: '', title: '' };
  }
}
