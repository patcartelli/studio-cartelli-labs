// src/pages/api/chart-list.ts
// Lightweight offset/limit slice endpoint over the full-chart cache (Plan 18-02).
// Reads from getFullChartAlbums — no MusicBrainz, glow, or Odesli enrichment (LIST-04).
// On a cold cache, the helper lazily fills it via one Last.fm call (D-09).
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getFullChartAlbums } from '../../lib/fullchart-cache';
import type { PipelineEnv } from '../../lib/chart-pipeline';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// ---------- handler ----------
export const GET: APIRoute = async ({ request }) => {
  // T-18-06 guard: KV binding required. Return 503 immediately if absent.
  const fullEnv = env as unknown as PipelineEnv;
  if (!fullEnv.LASTFM_CHART_CACHE) {
    return new Response(JSON.stringify({ error: 'KV binding unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);

  // view: albums-only this phase (D-01); echo in response for D-12 tab-readiness
  const view = url.searchParams.get('view') ?? 'albums';

  // T-18-04: clamp offset and limit — resource-abuse guard
  const rawOffset = Number.parseInt(url.searchParams.get('offset') ?? '', 10);
  const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, rawLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    // D-09: helper self-heals a cold cache via one lightweight Last.fm call
    const { data: allRows } = await getFullChartAlbums(fullEnv.LASTFM_CHART_CACHE, fullEnv);

    const total = allRows.length;
    const rows = allRows.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return new Response(JSON.stringify({ view, rows, offset, limit, total, hasMore }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900',
      },
    });
  } catch {
    // T-18-05: cold-cache self-heal failed (no cache + Last.fm down)
    return new Response(JSON.stringify({ error: 'chart-list unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
