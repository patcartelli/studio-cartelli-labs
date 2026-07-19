// src/lib/network-cache.ts
// KV-backed cache wrapper for network page API data.
// Server-only: accepts KVNamespace and LastfmEnv as parameters. Do not import from client code.

import { getTopArtists, getArtistTags, getArtistSimilar, batchFetch } from './lastfm';
import type { Artist } from './lastfm';
import { getInfluenceLinks } from './wikidata';
import type { InfluenceLink } from './wikidata';
import type { PipelineEnv } from './pipeline-env';

interface CacheMetadata {
  fetchedAt: number; // ms since epoch (Date.now())
}

interface LastfmEnv {
  LASTFM_API_KEY?: string;
  LASTFM_USERNAME?: string;
}

const TTL_SECONDS = 900; // 15 minutes (per D-01)

interface NetworkRawData {
  artists: Artist[];
  allTags: string[][];
  allSimilar: { name: string; similarity: number }[][];
  influences: InfluenceLink[];
}

export interface NetworkCacheResult {
  data: NetworkRawData;
  fetchedAt: number;
  isStale: boolean;
}

/**
 * Return cached network page data from KV, refreshing if stale or missing.
 * Bundles all 4 data sources (artists, tags, similar, influences) in a single KV entry per period.
 * Falls back to expired KV data with isStale: true if Last.fm is unreachable (NCACHE-03).
 * Wikidata failures are handled independently — empty influences[] is a valid degraded state (D-09).
 * Throws only if no cached or live data is available.
 *
 * @param _influencesFetcher - Injectable test seam for the Wikidata influences lookup; defaults to getInfluenceLinks.
 */
export async function getCachedNetworkData(
  kv: KVNamespace,
  env: LastfmEnv,
  period: string,
  _influencesFetcher: (names: string[]) => Promise<InfluenceLink[]> = getInfluenceLinks
): Promise<NetworkCacheResult> {
  const key = `network:${period}`;
  const { value, metadata } = await kv.getWithMetadata(key, {
    type: 'json',
  }) as { value: NetworkRawData | null; metadata: CacheMetadata | null };

  const isStale = !metadata || (Date.now() - metadata.fetchedAt) > TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return { data: value, fetchedAt: metadata!.fetchedAt, isStale: false };
  }

  // Cache miss or stale -- fetch live
  try {
    const artists = await getTopArtists(env, 100, period);
    const artistNames = artists.map((a) => a.name);
    const allTags = await batchFetch(artistNames, (name) => getArtistTags(env, name));
    const allSimilar = await batchFetch(artistNames, (name) => getArtistSimilar(env, name));

    // D-09: Wikidata is independently failable; empty influences[] is a valid degraded state
    let influences: InfluenceLink[] = [];
    try {
      influences = await _influencesFetcher(artistNames);
    } catch {
      /* silently degrade */
    }

    const data: NetworkRawData = { artists, allTags, allSimilar, influences };
    const fetchedAt = Date.now();
    // No TTL expiry on KV entry -- stale data stays readable for fallback when APIs are unreachable (D-01)
    await kv.put(key, JSON.stringify(data), {
      metadata: { fetchedAt } satisfies CacheMetadata,
    });

    return { data, fetchedAt, isStale: false };
  } catch (err) {
    // NCACHE-03: fall back to expired KV data if available
    if (value !== null) {
      return { data: value, fetchedAt: metadata?.fetchedAt ?? Date.now(), isStale: true };
    }
    throw err;
  }
}

// ---- Resumable cron warmer (STC-23) ----
//
// Cold/evicted network:<period> loads fan out ~202 fetch subrequests
// (getTopArtists(100) + 100 tags + 100 similar + Wikidata) in one request.
// The Cloudflare free tier caps subrequests at 50/invocation, so a cold load
// can never complete in a single SSR request or cron tick. warmNetworkCache
// resumably builds network:<period> a chunk at a time across cron ticks,
// persisting progress under a separate `network:warm:<period>` key so the
// read path (getCachedNetworkData, above) never sees a partially-filled
// object under `network:<period>` -- that key is only ever written by a
// completed FINALIZE step.

// Warm-cadence periods kept populated by the cron warmer. Only the page's
// default period is warmed today; extend this array to warm more periods,
// but note each additional period multiplies the cron ticks a full
// resumable build needs to complete.
export const NETWORK_WARM_PERIODS = ['1month'] as const;

// 15 artists x 2 Last.fm calls (tags + similar) = 30 fetch subrequests per
// chunk. KV operations ALSO count toward the free-tier 50-subrequests cap,
// so the worst-case tick (INIT + chunk: 2 KV reads + 1 artists fetch +
// 30 chunk fetches + 2 progress puts = 35) plus three co-running stale
// fullchart warmers (3 x [KV read + fetch + KV put] = 9) totals 44 --
// real headroom under 50. At 18 artists/chunk that same worst case lands
// exactly on the cap and thrashes whenever the fullchart TTLs align.
export const NETWORK_WARM_CHUNK_SIZE = 15;

// Cron-side rebuild threshold (25 min) -- decoupled from TTL_SECONDS (the
// page-side staleness threshold, 15 min) so a freshly completed build gets a
// rest window instead of the cron immediately trying to rebuild it again.
const NETWORK_WARM_REFRESH_SECONDS = 1500;

// In-progress warm state older than this is treated as abandoned; the build
// restarts from scratch rather than resuming stale progress.
const NETWORK_WARM_ABANDONED_SECONDS = 3600;

interface NetworkWarmProgress {
  artists: Artist[];
  allTags: string[][];
  allSimilar: { name: string; similarity: number }[][];
  cursor: number;
  startedAt: number; // ms since epoch (Date.now())
}

/**
 * Best-effort resumable warm of the network:<period> cache. Called from the
 * cron handler (fire-and-forget, mirrors warmFullChartCache). Chunks the
 * full ~202-subrequest network build across multiple cron ticks so no
 * single invocation exceeds the free-tier 50-subrequest cap.
 *
 * Does NOT modify getCachedNetworkData's read path -- this is a new,
 * additive repopulation path only.
 *
 * @param _chunkSize - Injectable test seam so tests can force multiple
 *   ticks with a small artist count; defaults to NETWORK_WARM_CHUNK_SIZE.
 */
export async function warmNetworkCache(
  env: PipelineEnv,
  _chunkSize: number = NETWORK_WARM_CHUNK_SIZE
): Promise<void> {
  const kv = env.LASTFM_CHART_CACHE;
  if (!kv) return;

  try {
    for (const period of NETWORK_WARM_PERIODS) {
      const dataKey = `network:${period}`;
      const progressKey = `network:warm:${period}`;

      const { metadata } = (await kv.getWithMetadata(dataKey, { type: 'json' })) as {
        value: NetworkRawData | null;
        metadata: CacheMetadata | null;
      };
      const isFresh =
        !!metadata && Date.now() - metadata.fetchedAt <= NETWORK_WARM_REFRESH_SECONDS * 1000;
      if (isFresh) continue; // this period is warm; try the next one

      let progress = (await kv.get(progressKey, { type: 'json' })) as NetworkWarmProgress | null;
      const abandoned =
        !!progress && Date.now() - progress.startedAt > NETWORK_WARM_ABANDONED_SECONDS * 1000;

      if (!progress || abandoned) {
        // INIT: kick off a fresh build (1 subrequest).
        const artists = await getTopArtists(env, 100, period);
        progress = { artists, allTags: [], allSimilar: [], cursor: 0, startedAt: Date.now() };
        await kv.put(progressKey, JSON.stringify(progress));
        // Fall through into CHUNK below in the same tick if budget allows.
      }

      // CHUNK: process the next slice of artists (up to 2 * _chunkSize subrequests).
      const chunkArtists = progress.artists.slice(progress.cursor, progress.cursor + _chunkSize);
      const chunkNames = chunkArtists.map((a) => a.name);

      if (chunkNames.length > 0) {
        const tagsChunk = await batchFetch(chunkNames, (name) => getArtistTags(env, name));
        const similarChunk = await batchFetch(chunkNames, (name) => getArtistSimilar(env, name));
        progress.allTags = [...progress.allTags, ...tagsChunk];
        progress.allSimilar = [...progress.allSimilar, ...similarChunk];
        progress.cursor += chunkNames.length;
        await kv.put(progressKey, JSON.stringify(progress));
      }

      if (progress.cursor >= progress.artists.length) {
        // FINALIZE: assemble the complete NetworkRawData and write it atomically.
        const artistNames = progress.artists.map((a) => a.name);

        // D-09: Wikidata is independently failable; empty influences[] is a
        // valid degraded state (1 subrequest).
        let influences: InfluenceLink[] = [];
        try {
          influences = await getInfluenceLinks(artistNames);
        } catch {
          /* silently degrade */
        }

        const data: NetworkRawData = {
          artists: progress.artists,
          allTags: progress.allTags,
          allSimilar: progress.allSimilar,
          influences,
        };
        // No TTL expiry -- matches getCachedNetworkData's convention so stale
        // data stays readable for fallback when APIs are unreachable.
        await kv.put(dataKey, JSON.stringify(data), {
          metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
        });
        await kv.delete(progressKey);
      }

      // Only advance the first non-fresh period per invocation.
      return;
    }
  } catch {
    // Warm is best-effort -- cron fire-and-forget; do not propagate errors.
  }
}
