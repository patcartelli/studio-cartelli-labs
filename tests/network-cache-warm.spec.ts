// tests/network-cache-warm.spec.ts
// STC-23: Automated unit test verifying warmNetworkCache resumably builds
// network:<period> across multiple invocations (simulated cron ticks)
// without ever exceeding the chunk budget or leaving a partial object under
// network:<period>.
//
// Runs as a pure Node.js function under Playwright's test runner -- no
// browser launched (no `page` fixture in the test signature), mirroring
// tests/network-cache-wikidata-degradation.spec.ts.

import { test, expect } from '@playwright/test';
import { Miniflare } from 'miniflare';
import { warmNetworkCache } from '../src/lib/network-cache';

// ---------------------------------------------------------------------------
// Last.fm / Wikidata response shapes (must match parsing logic in
// src/lib/lastfm.ts and src/lib/wikidata.ts)
// getTopArtists: data.topartists.artist[].{ name, playcount, url }
// getArtistTags: data.toptags.tag[].{ name, count }
// getArtistSimilar: data.similarartists.artist[].{ name, match }
// getInfluenceLinks: data.results.bindings[].{ from, to }
// ---------------------------------------------------------------------------

const ARTIST_COUNT = 5;
const CHUNK_SIZE = 2; // forces >=2 ticks for ARTIST_COUNT=5 (2,2,1 -> finalize on tick 3)

let fetchCallCount = 0;

function mockFetch(url: string): Response {
  fetchCallCount++;
  const urlStr = url.toString();

  if (urlStr.includes('ws.audioscrobbler.com')) {
    if (urlStr.includes('method=user.getTopArtists')) {
      const artist = Array.from({ length: ARTIST_COUNT }, (_, i) => ({
        name: `Artist ${i}`,
        playcount: String(100 - i),
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
      return new Response(
        JSON.stringify({ similarartists: { artist: [] } }),
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

test('warmNetworkCache resumably builds network:1month across multiple invocations', async () => {
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
    const mockEnv = {
      LASTFM_CHART_CACHE: kv,
      LASTFM_API_KEY: 'test-key',
      LASTFM_USERNAME: 'test-user',
    };

    // Tick 1: INIT + first CHUNK (cursor 0 -> 2). Not yet complete.
    await expect(warmNetworkCache(mockEnv, CHUNK_SIZE)).resolves.toBeUndefined();
    let finalValue = await kv.get('network:1month', { type: 'json' });
    expect(finalValue).toBeNull();

    let progress = await kv.get('network:warm:1month', { type: 'json' });
    expect(progress).not.toBeNull();
    expect(progress.cursor).toBe(2);
    // Intermediate progress must never be a NetworkRawData-shaped object under network:1month.
    expect(finalValue).not.toEqual(
      expect.objectContaining({ artists: expect.any(Array), allTags: expect.any(Array) })
    );

    // Tick 2: CHUNK (cursor 2 -> 4). Still not complete.
    await expect(warmNetworkCache(mockEnv, CHUNK_SIZE)).resolves.toBeUndefined();
    finalValue = await kv.get('network:1month', { type: 'json' });
    expect(finalValue).toBeNull();
    progress = await kv.get('network:warm:1month', { type: 'json' });
    expect(progress.cursor).toBe(4);

    // Tick 3: CHUNK (cursor 4 -> 5) + FINALIZE.
    await expect(warmNetworkCache(mockEnv, CHUNK_SIZE)).resolves.toBeUndefined();

    const { value, metadata } = (await kv.getWithMetadata('network:1month', { type: 'json' })) as {
      value: {
        artists: unknown[];
        allTags: unknown[];
        allSimilar: unknown[];
        influences: unknown[];
      } | null;
      metadata: { fetchedAt: number } | null;
    };

    expect(value).not.toBeNull();
    expect(value!.artists.length).toBe(ARTIST_COUNT);
    expect(value!.allTags.length).toBe(ARTIST_COUNT);
    expect(value!.allSimilar.length).toBe(ARTIST_COUNT);
    expect(metadata).not.toBeNull();
    expect(Date.now() - metadata!.fetchedAt).toBeLessThan(60_000);

    // Progress key must be cleaned up once network:1month is finalized.
    const finalProgress = await kv.get('network:warm:1month', { type: 'json' });
    expect(finalProgress).toBeNull();

    // Tick 4: network:1month is now fresh -- warmNetworkCache must no-op
    // (no re-fetch of artists).
    const callsBeforeNoop = fetchCallCount;
    await expect(warmNetworkCache(mockEnv, CHUNK_SIZE)).resolves.toBeUndefined();
    expect(fetchCallCount).toBe(callsBeforeNoop);

    const unchangedValue = await kv.get('network:1month', { type: 'json' });
    expect(unchangedValue).toEqual(value);
  } finally {
    globalThis.fetch = originalFetch;
    await mf?.dispose();
  }
});

test('warmNetworkCache never throws, even when Last.fm is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  let mf: Miniflare | null = null;

  try {
    globalThis.fetch = async (): Promise<Response> => {
      throw new Error('network down');
    };

    mf = new Miniflare({
      modules: true,
      script: `export default { fetch: () => new Response('ok') }`,
      kvNamespaces: ['LASTFM_CHART_CACHE'],
    });

    const kv = await makeKv(mf);
    const mockEnv = {
      LASTFM_CHART_CACHE: kv,
      LASTFM_API_KEY: 'test-key',
      LASTFM_USERNAME: 'test-user',
    };

    await expect(warmNetworkCache(mockEnv, CHUNK_SIZE)).resolves.toBeUndefined();

    const value = await kv.get('network:1month', { type: 'json' });
    expect(value).toBeNull();
  } finally {
    globalThis.fetch = originalFetch;
    await mf?.dispose();
  }
});
