// tests/network-cache-subrequest-budget.spec.ts
// STC-332 regression: getCachedNetworkData used to fetch tags+similar for the
// FULL top-100 artist list inline on every stale/missing read -- up to
// ~202 subrequests (1 artists + 100 tags + 100 similar + 1 Wikidata) in a
// single call. Cloudflare's free tier caps subrequests at 50/invocation, so
// once that budget was blown every remaining artist.getSimilar() call threw,
// was silently swallowed by its own catch, and the page ended up with
// similarity: 0 on every link -- for every period except 7day, whose small
// real artist count happened to stay under budget. The broken result was
// then persisted with a fresh fetchedAt, which blocked warmNetworkCache from
// ever rebuilding it correctly.
//
// The fix: getCachedNetworkData now advances the same resumable, bounded
// build (advancePeriodBuild) that warmNetworkCache uses, instead of doing
// one unbounded fetch. This test proves (1) a single read for a cold
// 100-artist period never approaches the 50-subrequest cap, and (2) repeated
// reads (simulating page loads / cron ticks) converge on real, non-zero
// similarity data rather than getting stuck at 0.
//
// Runs as a pure Node.js function under Playwright's test runner -- no
// browser launched -- mirroring the other network-cache-*.spec.ts files.

import { test, expect } from '@playwright/test';
import { Miniflare } from 'miniflare';
import { getCachedNetworkData, NETWORK_WARM_CHUNK_SIZE } from '../src/lib/network-cache';

const ARTIST_COUNT = 100;
const CLOUDFLARE_FREE_TIER_SUBREQUEST_CAP = 50;

let fetchCallCount = 0;

function mockFetch(url: string): Response {
  fetchCallCount++;
  const urlStr = url.toString();

  if (urlStr.includes('ws.audioscrobbler.com')) {
    if (urlStr.includes('method=user.getTopArtists')) {
      const artist = Array.from({ length: ARTIST_COUNT }, (_, i) => ({
        name: `Artist ${i}`,
        playcount: String(ARTIST_COUNT - i),
        url: `https://www.last.fm/music/Artist+${i}`,
      }));
      return new Response(
        JSON.stringify({ topartists: { artist } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('method=artist.getTopTags')) {
      return new Response(
        JSON.stringify({ toptags: { tag: [{ name: 'rock', count: 100 }] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('method=artist.getSimilar')) {
      // Every artist is "similar" to Artist 1 with a real, non-zero score --
      // proof the pipeline can still produce a meaningful similarity graph
      // once it's not silently failing after the budget cap.
      return new Response(
        JSON.stringify({ similarartists: { artist: [{ name: 'Artist 1', match: '0.8' }] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  if (urlStr.includes('wikidata.org')) {
    return new Response(
      JSON.stringify({ results: { bindings: [] } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  throw new Error(`Unexpected fetch URL: ${url}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeKv(mf: Miniflare): Promise<any> {
  return (await mf.getKVNamespace('LASTFM_CHART_CACHE')) as unknown as any;
}

test('STC-332: a single stale/cold read for a 100-artist period never approaches the subrequest cap', async () => {
  const originalFetch = globalThis.fetch;
  let mf: Miniflare | null = null;

  try {
    fetchCallCount = 0;
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : input.toString();
      return mockFetch(url);
    };

    mf = new Miniflare({
      modules: true,
      script: `export default { fetch: () => new Response('ok') }`,
      kvNamespaces: ['LASTFM_CHART_CACHE'],
    });

    const kv = await makeKv(mf);
    const mockEnv = { LASTFM_API_KEY: 'test-key', LASTFM_USERNAME: 'test-user' };

    const result = await getCachedNetworkData(kv, mockEnv, '3month', async () => []);

    // The pre-fix code issued ~202 subrequests here (1 + 100 + 100 + 1).
    // The fixed read path advances by exactly one bounded chunk.
    expect(fetchCallCount).toBeLessThan(CLOUDFLARE_FREE_TIER_SUBREQUEST_CAP);
    expect(fetchCallCount).toBe(1 + 2 * NETWORK_WARM_CHUNK_SIZE);

    // A single chunk can't finish a 100-artist build -- this must be served
    // as an explicitly partial/stale result, never as silently "fresh"
    // broken data (which is exactly what blocked warmNetworkCache before).
    expect(result.isStale).toBe(true);
    expect(result.data.artists.length).toBe(ARTIST_COUNT);
  } finally {
    globalThis.fetch = originalFetch;
    await mf?.dispose();
  }
});

test('STC-332: repeated reads converge on real similarity data instead of getting stuck at 0', async () => {
  const originalFetch = globalThis.fetch;
  let mf: Miniflare | null = null;

  try {
    fetchCallCount = 0;
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : input.toString();
      return mockFetch(url);
    };

    mf = new Miniflare({
      modules: true,
      script: `export default { fetch: () => new Response('ok') }`,
      kvNamespaces: ['LASTFM_CHART_CACHE'],
    });

    const kv = await makeKv(mf);
    const mockEnv = { LASTFM_API_KEY: 'test-key', LASTFM_USERNAME: 'test-user' };

    let result;
    // Enough repeated "page loads" to walk the resumable build to
    // completion: ceil(100 / NETWORK_WARM_CHUNK_SIZE) chunks.
    const maxTicks = Math.ceil(ARTIST_COUNT / NETWORK_WARM_CHUNK_SIZE) + 1;
    for (let i = 0; i < maxTicks; i++) {
      result = await getCachedNetworkData(kv, mockEnv, '3month', async () => []);
      if (!result.isStale) break;
    }

    expect(result!.isStale).toBe(false);
    expect(result!.data.allSimilar.length).toBe(ARTIST_COUNT);

    // Under the pre-fix bug, every one of these would be 0 for any period
    // whose real artist count exceeded the subrequest budget.
    const withNonZeroSimilarity = result!.data.allSimilar.filter((similar) =>
      similar.some((s) => s.similarity > 0)
    );
    expect(withNonZeroSimilarity.length).toBe(ARTIST_COUNT);
  } finally {
    globalThis.fetch = originalFetch;
    await mf?.dispose();
  }
});
