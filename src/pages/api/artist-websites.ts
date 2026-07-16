// src/pages/api/artist-websites.ts
// Batch read-only artist website lookup for the full chart list (Plan 19-02, REVL-02).
// Reads from KV-cached artist bundles only — never triggers a MusicBrainz refresh (D-02 / LIST-04).
// Applies D-03 last.fm-host filter server-side so last.fm fallback URLs never reach the website slot.
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { PipelineEnv } from '../../lib/pipeline-env';
import { getCachedArtistBundleReadOnly } from '../../lib/artist-bundle-cache';

// D-03: omit last.fm-host URLs — these are cascade last-resort fallbacks, not genuine external sites.
// When the resolved bundle.url is a last.fm host the website slot should be empty, not show a
// near-duplicate of the row's existing Last.fm album link.
const LASTFM_HOST_RE = /^https?:\/\/(www\.)?last\.fm\//i;

// WR-03 (Phase 23 review): scheme allowlist. bundle.url/bundle.imageUrl originate from
// publicly editable third-party data (MusicBrainz url-rels) persisted to KV without
// scheme validation, and the client assigns them straight to <a href> / <img src> —
// a non-http(s) value (e.g. javascript:) must never leave this endpoint.
const HTTP_SCHEME_RE = /^https?:\/\//i;

// Phase 23 (REVL-08/09): combined batch resolve — websiteUrl (D-03) + imageUrl, both read-only
// from artist-bundle-cache. No new KV read, no MusicBrainz call.
interface ArtistExtras {
  websiteUrl: string | null;
  imageUrl: string | null;
}

export const POST: APIRoute = async ({ request }) => {
  // 503 guard: KV binding required (mirrors chart-list.ts pattern)
  const fullEnv = env as unknown as PipelineEnv;
  const kv = fullEnv.LASTFM_CHART_CACHE;
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV binding unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse body — must be valid JSON object with `artists: string[]`
  let artists: string[];
  try {
    const body = await request.json() as unknown;
    if (
      typeof body !== 'object' ||
      body === null ||
      !Array.isArray((body as Record<string, unknown>).artists)
    ) {
      return new Response(JSON.stringify({ error: 'invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    artists = (body as Record<string, unknown>).artists as string[];
  } catch {
    // JSON parse failure
    return new Response(JSON.stringify({ error: 'invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // T-19-03: reject oversized arrays before touching KV (100-name ceiling)
  if (artists.length > 100) {
    return new Response(JSON.stringify({ error: 'invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Dedupe + lowercase-normalise names for efficient KV reads
    const unique = [...new Set(artists.map((n) => (typeof n === 'string' ? n : String(n))))];

    // KV-get-only: getCachedArtistBundleReadOnly never calls MusicBrainz (D-02 / LIST-04)
    const results = await Promise.all(
      unique.map(async (name) => {
        const bundle = await getCachedArtistBundleReadOnly(kv, name);
        // D-03: filter out last.fm-host fallback URLs — only genuine external sites shown.
        // WR-03: both URLs must also pass the http(s) scheme allowlist or be nulled.
        const websiteUrl =
          bundle?.url && HTTP_SCHEME_RE.test(bundle.url) && !LASTFM_HOST_RE.test(bundle.url)
            ? bundle.url
            : null;
        const imageUrl =
          bundle?.imageUrl && HTTP_SCHEME_RE.test(bundle.imageUrl) ? bundle.imageUrl : null;
        return [name, { websiteUrl, imageUrl }] as [string, ArtistExtras];
      })
    );

    // Build response keyed by ORIGINAL artist name string -> { websiteUrl, imageUrl }.
    // WR-04: null-prototype map — with a plain object literal, a caller-controlled name
    // of "__proto__" would invoke the Object.prototype.__proto__ setter instead of
    // creating an own property, silently dropping the key from the JSON response and
    // swapping the object's prototype.
    const response: Record<string, ArtistExtras> = Object.create(null);
    for (const originalName of artists) {
      // match by normalised name (deduped) back to original
      const normName = typeof originalName === 'string' ? originalName : String(originalName);
      const entry = results.find(([n]) => n === normName);
      response[originalName] = entry ? entry[1] : { websiteUrl: null, imageUrl: null };
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900',
      },
    });
  } catch {
    // Unexpected failure — wrap and surface as 503
    return new Response(JSON.stringify({ error: 'artist-websites unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
