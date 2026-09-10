// tests/network-cache-partial-tags.spec.ts
// STC-340 regression: genre tags didn't always appear on /lab/network nodes.
//
// NetworkRawData is three parallel arrays indexed by artist position, but the
// resumable build fills `artists` in one INIT step and `allTags`/`allSimilar`
// one CHUNK at a time. getCachedNetworkData's in-progress fallback served
// `progress.artists` (all 100) alongside only `progress.cursor` tag entries,
// and network.astro reads `allTags[i] ?? []` -- so every artist past the
// cursor rendered as a node with no genre tags at all. Deterministic per
// period, identical on every load, and worst for the periods furthest down
// NETWORK_WARM_PERIODS (3month, where it was reported).
//
// Same user-visible symptom as the pre-STC-332 subrequest overrun, which
// silently emptied the tail of `allTags` for the same underlying reason:
// partial enrichment presented as complete.
//
// The fix: getCachedNetworkData truncates to the enriched prefix, so a
// cold-building period renders a smaller graph that grows one chunk per tick
// instead of a full-size graph that is quietly missing tags.
//
// Runs as a pure Node.js function under Playwright's test runner -- no
// browser launched (no `page` fixture), mirroring the other
// network-cache-*.spec.ts files.

import { test, expect } from '@playwright/test';
import { Miniflare } from 'miniflare';
import { getCachedNetworkData, NETWORK_WARM_CHUNK_SIZE } from '../src/lib/network-cache';

const ARTIST_COUNT = 100;

function mockFetch(url: string): Response {
  const urlStr = url.toString();

  if (urlStr.includes('ws.audioscrobbler.com')) {
    if (urlStr.includes('method=user.getTopArtists')) {
      const artist = Array.from({ length: ARTIST_COUNT }, (_, i) => ({
        name: `Artist ${i}`,
        playcount: String(ARTIST_COUNT - i),
        url: `https://www.last.fm/music/Artist+${i}`,
      }));
      return new Response(JSON.stringify({ topartists: { artist } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('method=artist.getTopTags')) {
      // Every artist has a real tag -- so any artist that ends up with no
      // tags on the page got there through the parallel-array bug, not
      // through genuinely untagged source data.
      return new Response(JSON.stringify({ toptags: { tag: [{ name: 'rock', count: 100 }] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('method=artist.getSimilar')) {
      return new Response(
        JSON.stringify({ similarartists: { artist: [{ name: 'Artist 1', match: '0.9' }] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const env = { LASTFM_API_KEY: 'test-key', LASTFM_USERNAME: 'test-user' };
const noInfluences = async () => [];

async function withMockedFetch<T>(fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) =>
    Promise.resolve(mockFetch(input as string))) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('every artist served has its own tags entry, mid-build and once complete', async () => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { async fetch() { return new Response("ok"); } };',
    kvNamespaces: ['LASTFM_CHART_CACHE'],
  });
  const kv = (await mf.getKVNamespace('LASTFM_CHART_CACHE')) as unknown as KVNamespace;

  try {
    // First read: cold cache. One bounded chunk can't finish a 100-artist
    // build, so this exercises the in-progress fallback -- the path that
    // used to hand back 100 artists next to 15 tag entries.
    const cold = await withMockedFetch(() =>
      getCachedNetworkData(kv, env, '3month', noInfluences)
    );

    expect(cold.data.artists.length).toBe(NETWORK_WARM_CHUNK_SIZE);
    expect(cold.data.allTags.length).toBe(cold.data.artists.length);
    expect(cold.data.allSimilar.length).toBe(cold.data.artists.length);
    expect(cold.isStale).toBe(true);

    // The bug's exact signature: a served artist with no genre tags.
    const untaggedCold = cold.data.artists.filter(
      (_, i) => (cold.data.allTags[i] ?? []).length === 0
    );
    expect(untaggedCold).toEqual([]);

    // Keep reading (simulating page loads / cron ticks) until the build
    // finalizes. The graph should grow a chunk at a time and never, at any
    // point, expose an artist without tags.
    let result = cold;
    for (let tick = 0; tick < 10 && result.data.artists.length < ARTIST_COUNT; tick++) {
      result = await withMockedFetch(() => getCachedNetworkData(kv, env, '3month', noInfluences));

      expect(result.data.allTags.length).toBe(result.data.artists.length);
      expect(result.data.allSimilar.length).toBe(result.data.artists.length);
      expect(
        result.data.artists.filter((_, i) => (result.data.allTags[i] ?? []).length === 0)
      ).toEqual([]);
    }

    // Converged on the full graph, fully enriched.
    expect(result.data.artists.length).toBe(ARTIST_COUNT);
    expect(result.data.allTags.length).toBe(ARTIST_COUNT);
    expect(result.data.allSimilar.length).toBe(ARTIST_COUNT);
  } finally {
    await mf.dispose();
  }
});

test('a finalized entry with a truncated allTags array never yields untagged nodes', async () => {
  // Defence in depth for the legacy shape STC-332 could persist: a finalized
  // network:<period> entry whose parallel arrays disagree in length. The read
  // path must not hand those extra artists to the page as untagged nodes.
  const mf = new Miniflare({
    modules: true,
    script: 'export default { async fetch() { return new Response("ok"); } };',
    kvNamespaces: ['LASTFM_CHART_CACHE'],
  });
  const kv = (await mf.getKVNamespace('LASTFM_CHART_CACHE')) as unknown as KVNamespace;

  try {
    const artists = Array.from({ length: 40 }, (_, i) => ({
      id: `Artist ${i}`,
      name: `Artist ${i}`,
      playcount: 40 - i,
      url: `https://www.last.fm/music/Artist+${i}`,
    }));

    await kv.put(
      'network:6month',
      JSON.stringify({
        artists,
        allTags: Array.from({ length: 12 }, () => ['rock']),
        allSimilar: Array.from({ length: 12 }, () => [{ name: 'Artist 1', similarity: 0.9 }]),
        influences: [],
      }),
      { metadata: { fetchedAt: Date.now() } }
    );

    const result = await withMockedFetch(() =>
      getCachedNetworkData(kv, env, '6month', noInfluences)
    );

    expect(result.isStale).toBe(false);
    expect(result.data.artists.length).toBe(12);
    expect(
      result.data.artists.filter((_, i) => (result.data.allTags[i] ?? []).length === 0)
    ).toEqual([]);
  } finally {
    await mf.dispose();
  }
});
