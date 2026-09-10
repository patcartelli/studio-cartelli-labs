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

// ---- Resumable build (STC-23, extended by STC-332) ----
//
// A cold/evicted network:<period> load fans out ~202 fetch subrequests
// (getTopArtists(100) + 100 tags + 100 similar + Wikidata) to fully populate.
// The Cloudflare free tier caps subrequests at 50/invocation, so a cold load
// can never complete in a single SSR request or cron tick. advancePeriodBuild
// resumably builds network:<period> one bounded chunk at a time, persisting
// progress under a separate `network:warm:<period>` key so no caller ever
// sees a partially-filled object under `network:<period>` -- that key is
// only ever written by a completed FINALIZE step.
//
// STC-332: getCachedNetworkData used to skip this chunking entirely and
// fetch tags+similar for the full top-100 artist list inline on every
// stale/missing read. That blew the 50-subrequest cap for any period with
// a real top-100 list -- tags ran first and mostly succeeded, but by the
// time the 100 "similar artist" calls started the budget was already spent,
// so every one of them threw, was silently swallowed by getArtistSimilar's
// catch, and every link on the page got similarity: 0. Worse, the resulting
// (broken) data was persisted with a fresh fetchedAt, which made
// warmNetworkCache's isFresh check skip rebuilding it correctly for another
// NETWORK_WARM_REFRESH_SECONDS. Both the cron warmer and the read path now
// share this one bounded-chunk build step so neither can ever exceed budget
// or clobber good data with a broken "fresh" result.

// Periods kept populated by the cron warmer. '1month' stays first so it
// keeps winning ties when multiple periods are simultaneously stale (it's
// the page's default period -- see VALID_PERIODS/period in network.astro).
export const NETWORK_WARM_PERIODS = ['1month', '7day', '3month', '6month', '12month'] as const;

// 15 artists x 2 Last.fm calls (tags + similar) = 30 fetch subrequests per
// chunk. KV operations ALSO count toward the free-tier 50-subrequests cap,
// so the worst-case call (INIT + chunk: 2 KV reads + 1 artists fetch +
// 30 chunk fetches + 2 progress puts = 35) plus three co-running stale
// fullchart warmers (3 x [KV read + fetch + KV put] = 9) totals 44 --
// real headroom under 50. At 18 artists/chunk that same worst case lands
// exactly on the cap and thrashes whenever the fullchart TTLs align. The
// read path (getCachedNetworkData) uses this same size for the same reason:
// it is a live Worker invocation and pays the same subrequest budget.
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
 * Advance the resumable build for one period by a single bounded step:
 * INIT (fetch the top-100 artist list) if no progress exists yet, then
 * CHUNK (fetch tags+similar for the next `chunkSize` artists), then
 * FINALIZE (assemble + persist NetworkRawData, clear progress) once the
 * cursor reaches the end of the artist list. Issues at most
 * `1 + 2*chunkSize + 1` Last.fm/Wikidata subrequests, so a caller can bound
 * its own subrequest budget just by choosing `chunkSize`.
 *
 * Shared by warmNetworkCache (cron, advances whichever period is stalest)
 * and getCachedNetworkData (SSR read path, advances the one period the
 * current request needs) -- see the STC-332 note above for why a single
 * unbounded fetch is never safe here.
 */
async function advancePeriodBuild(
  kv: KVNamespace,
  env: LastfmEnv,
  period: string,
  chunkSize: number,
  influencesFetcher: (names: string[]) => Promise<InfluenceLink[]>
): Promise<void> {
  const dataKey = `network:${period}`;
  const progressKey = `network:warm:${period}`;

  let progress = (await kv.get(progressKey, { type: 'json' })) as NetworkWarmProgress | null;
  const abandoned =
    !!progress && Date.now() - progress.startedAt > NETWORK_WARM_ABANDONED_SECONDS * 1000;

  if (!progress || abandoned) {
    // INIT: kick off a fresh build (1 subrequest).
    const artists = await getTopArtists(env, 100, period);
    progress = { artists, allTags: [], allSimilar: [], cursor: 0, startedAt: Date.now() };
    await kv.put(progressKey, JSON.stringify(progress));
  }

  // CHUNK: process the next slice of artists (up to 2 * chunkSize subrequests).
  const chunkArtists = progress.artists.slice(progress.cursor, progress.cursor + chunkSize);
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
      influences = await influencesFetcher(artistNames);
    } catch {
      /* silently degrade */
    }

    const data: NetworkRawData = {
      artists: progress.artists,
      allTags: progress.allTags,
      allSimilar: progress.allSimilar,
      influences,
    };
    // No TTL expiry on KV entry -- stale data stays readable for fallback when APIs are unreachable (D-01)
    await kv.put(dataKey, JSON.stringify(data), {
      metadata: { fetchedAt: Date.now() } satisfies CacheMetadata,
    });
    await kv.delete(progressKey);
  }
}

/**
 * STC-340: enforce the invariant that every artist handed to the page has a
 * matching allTags/allSimilar entry.
 *
 * NetworkRawData is three parallel arrays indexed by artist position, but the
 * resumable build fills `artists` all at once (INIT) and `allTags`/`allSimilar`
 * a chunk at a time (CHUNK). So in-progress progress state legitimately holds
 * 100 artists next to only `cursor` tag entries. Serving that straight through
 * made network.astro render 100 nodes where only the first `cursor` had any
 * genre tags at all (it reads `allTags[i] ?? []`) -- tags present on some
 * nodes, missing on others, identically on every load. That was the same
 * user-visible symptom as the pre-STC-332 budget overrun, which silently
 * emptied the tail of `allTags` for the same reason: partial enrichment
 * presented as complete.
 *
 * Truncating to the enriched prefix means a cold-building period renders a
 * smaller graph that grows one chunk per tick, rather than a full-size graph
 * that is quietly wrong. Well-formed finalized data has equal lengths, so this
 * is a no-op on the happy path.
 */
function withEnrichedArtistsOnly(data: NetworkRawData): NetworkRawData {
  const enriched = Math.min(data.artists.length, data.allTags.length, data.allSimilar.length);
  if (enriched === data.artists.length) return data;

  const artists = data.artists.slice(0, enriched);
  // Influence links reference artist names; network.astro drops any whose
  // endpoints aren't in the served artist list, so they need no filtering here.
  return {
    artists,
    allTags: data.allTags.slice(0, enriched),
    allSimilar: data.allSimilar.slice(0, enriched),
    influences: data.influences,
  };
}

/**
 * Return cached network page data from KV, advancing the build if stale or
 * missing. Bundles all 4 data sources (artists, tags, similar, influences)
 * in a single KV entry per period.
 *
 * On a stale/missing cache this advances the resumable build by one bounded
 * chunk (see advancePeriodBuild) rather than fetching the full artist list
 * inline (STC-332) -- so it serves, in order of preference: the freshly
 * finalized data if that one chunk happened to complete the build; the
 * previous (stale) cache entry if one exists, so a page load never blocks on
 * a multi-chunk rebuild; or the in-progress partial build, for a period that
 * has never finished building even once.
 *
 * Falls back to expired KV data with isStale: true if Last.fm is unreachable (NCACHE-03).
 * Wikidata failures are handled independently — empty influences[] is a valid degraded state (D-09).
 * Throws only if no cached, finalized, or in-progress data is available.
 *
 * @param _influencesFetcher - Injectable test seam for the Wikidata influences lookup; defaults to getInfluenceLinks.
 */
export async function getCachedNetworkData(
  kv: KVNamespace,
  env: LastfmEnv,
  period: string,
  _influencesFetcher: (names: string[]) => Promise<InfluenceLink[]> = getInfluenceLinks
): Promise<NetworkCacheResult> {
  const dataKey = `network:${period}`;
  const readData = () =>
    kv.getWithMetadata(dataKey, { type: 'json' }) as Promise<{
      value: NetworkRawData | null;
      metadata: CacheMetadata | null;
    }>;

  const { value, metadata } = await readData();
  const isStale = !metadata || Date.now() - metadata.fetchedAt > TTL_SECONDS * 1000;

  if (value !== null && !isStale) {
    return { data: withEnrichedArtistsOnly(value), fetchedAt: metadata!.fetchedAt, isStale: false };
  }

  // Cache miss or stale -- advance the resumable build by one bounded chunk.
  try {
    await advancePeriodBuild(kv, env, period, NETWORK_WARM_CHUNK_SIZE, _influencesFetcher);
  } catch (err) {
    // NCACHE-03: fall back to expired KV data if available
    if (value !== null) {
      return {
        data: withEnrichedArtistsOnly(value),
        fetchedAt: metadata?.fetchedAt ?? Date.now(),
        isStale: true,
      };
    }
    throw err;
  }

  const { value: freshValue, metadata: freshMetadata } = await readData();
  if (freshValue !== null) {
    const stillStale = !freshMetadata || Date.now() - freshMetadata.fetchedAt > TTL_SECONDS * 1000;
    return {
      data: withEnrichedArtistsOnly(freshValue),
      fetchedAt: freshMetadata!.fetchedAt,
      isStale: stillStale,
    };
  }

  // The chunk above didn't finish the build. Prefer the previous stale
  // value so a page load never has to wait out a multi-chunk rebuild.
  if (value !== null) {
    return {
      data: withEnrichedArtistsOnly(value),
      fetchedAt: metadata?.fetchedAt ?? Date.now(),
      isStale: true,
    };
  }

  // Never finalized even once -- serve the in-progress partial build rather
  // than an empty page while the cron warmer finishes the job.
  const progress = (await kv.get(`network:warm:${period}`, { type: 'json' })) as NetworkWarmProgress | null;
  if (progress) {
    return {
      data: withEnrichedArtistsOnly({
        artists: progress.artists,
        allTags: progress.allTags,
        allSimilar: progress.allSimilar,
        influences: [],
      }),
      fetchedAt: progress.startedAt,
      isStale: true,
    };
  }

  throw new Error(`network:${period} has no cached, finalized, or in-progress data`);
}

/**
 * Best-effort resumable warm of the network:<period> cache. Called from the
 * cron handler (fire-and-forget, mirrors warmFullChartCache). Advances
 * whichever NETWORK_WARM_PERIODS entry is stalest by one bounded chunk per
 * invocation (see advancePeriodBuild), so a full cold build for all periods
 * completes over several cron ticks without any single invocation exceeding
 * the free-tier 50-subrequest cap.
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

      const { metadata } = (await kv.getWithMetadata(dataKey, { type: 'json' })) as {
        value: NetworkRawData | null;
        metadata: CacheMetadata | null;
      };
      const isFresh =
        !!metadata && Date.now() - metadata.fetchedAt <= NETWORK_WARM_REFRESH_SECONDS * 1000;
      if (isFresh) continue; // this period is warm; try the next one

      await advancePeriodBuild(kv, env, period, _chunkSize, getInfluenceLinks);

      // Only advance the first non-fresh period per invocation.
      return;
    }
  } catch (err) {
    console.error('[cron] warmNetworkCache failed:', err instanceof Error ? err.message : err);
    throw err;
  }
}
