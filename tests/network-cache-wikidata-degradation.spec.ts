// tests/network-cache-wikidata-degradation.spec.ts
// NCACHE-04: Automated unit test verifying that getCachedNetworkData degrades gracefully
// when the Wikidata influences fetcher throws — the inner catch at network-cache.ts:65-70
// swallows the error and returns influences: [] instead of propagating.
//
// Runs as a pure Node.js function under Playwright's test runner — no browser launched
// (no `page` fixture in the test signature).

import { test, expect } from '@playwright/test';
import { Miniflare } from 'miniflare';
import { getCachedNetworkData } from '../src/lib/network-cache';

// ---------------------------------------------------------------------------
// Last.fm response shapes (must match parsing logic in src/lib/lastfm.ts)
// getTopArtists: data.topartists.artist[].{ name, playcount, url }
// getArtistTags: data.toptags.tag[].{ name, count }
// getArtistSimilar: data.similarartists.artist[].{ name, match }
// ---------------------------------------------------------------------------

function mockLastfmFetch(url: string): Response {
  const urlStr = url.toString();

  if (urlStr.includes('ws.audioscrobbler.com')) {
    if (urlStr.includes('method=user.getTopArtists')) {
      return new Response(
        JSON.stringify({
          topartists: {
            artist: [
              {
                name: 'Artist One',
                playcount: '100',
                url: 'https://www.last.fm/music/Artist+One',
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('method=artist.getTopTags')) {
      return new Response(
        JSON.stringify({
          toptags: {
            tag: [{ name: 'rock', count: 100 }],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('method=artist.getSimilar')) {
      return new Response(
        JSON.stringify({
          similarartists: {
            artist: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Wikidata should never be reached — the injected fetcher short-circuits it
  if (urlStr.includes('wikidata.org')) {
    throw new Error('Wikidata fetch reached unexpectedly — injected fetcher should short-circuit this');
  }

  throw new Error(`Unexpected fetch URL: ${url}`);
}

test('NCACHE-04: getCachedNetworkData returns influences: [] when injected influences fetcher throws', async () => {
  const originalFetch = globalThis.fetch;
  let mf: Miniflare | null = null;

  try {
    // Stub globalThis.fetch to intercept Last.fm API calls
    globalThis.fetch = async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : input.toString();
      return mockLastfmFetch(url);
    };

    // Create an in-memory Miniflare KV namespace for the test
    mf = new Miniflare({
      modules: true,
      script: `export default { fetch: () => new Response('ok') }`,
      kvNamespaces: ['LASTFM_CHART_CACHE'],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = await mf.getKVNamespace('LASTFM_CHART_CACHE') as unknown as any;

    // Pre-populate KV with a stale entry (1000s ago, well past the 900s TTL).
    // The stale seed has influences to prove that the live path OVERWRITES them with []
    // when the injected fetcher throws — if the outer catch returns the stale fallback
    // instead, the seeded influence StaleSeed/ShouldNotAppear would appear in the result.
    const staleFetchedAt = Date.now() - 1000 * 1000;
    await kv.put(
      'network:1month',
      JSON.stringify({
        artists: [],
        allTags: [],
        allSimilar: [],
        influences: [{ from: 'StaleSeed', to: 'ShouldNotAppear' }],
      }),
      {
        metadata: { fetchedAt: staleFetchedAt },
      }
    );

    // Mock env — only LASTFM_API_KEY and LASTFM_USERNAME are required
    const mockEnv = {
      LASTFM_API_KEY: 'test-key',
      LASTFM_USERNAME: 'test-user',
    };

    // Call getCachedNetworkData with an injected fetcher that throws,
    // simulating a Wikidata outage that escapes the wikidata.ts internal catch
    const result = await getCachedNetworkData(
      kv,
      mockEnv,
      '1month',
      async (_names: string[]) => {
        throw new Error('Wikidata down');
      }
    );

    console.log('[NCACHE-04] cache miss path executed, influences:', result.data.influences);

    // Prove the live-fetch path ran (not the stale fallback returning the seeded data)
    expect(result.data.artists.length).toBeGreaterThan(0);

    // Core assertion: the catch block at network-cache.ts:65-70 swallowed the throw
    // and left influences as an empty array
    expect(result.data.influences).toEqual([]);

    // Prove we did NOT hit the outer catch (which would set isStale: true)
    expect(result.isStale).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    await mf?.dispose();
  }
});
