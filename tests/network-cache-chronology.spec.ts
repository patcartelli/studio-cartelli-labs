// tests/network-cache-chronology.spec.ts
// STC-334: chronology (Wikidata P571 "inception" year) rides the same cached
// build as influences (P737) -- populated at FINALIZE, degrading to []
// independently on failure (D-09-style), and persisting through the
// resumable build the same way. Mirrors
// tests/network-cache-wikidata-degradation.spec.ts's structure.
//
// Runs as a pure Node.js function under Playwright's test runner -- no
// browser launched.

import { test, expect } from '@playwright/test';
import { Miniflare } from 'miniflare';
import { getCachedNetworkData } from '../src/lib/network-cache';
import { getInceptionYears } from '../src/lib/wikidata';

function mockLastfmFetch(url: string): Response {
  const urlStr = url.toString();

  if (urlStr.includes('ws.audioscrobbler.com')) {
    if (urlStr.includes('method=user.getTopArtists')) {
      return new Response(
        JSON.stringify({
          topartists: {
            artist: [
              { name: 'Artist One', playcount: '100', url: 'https://www.last.fm/music/Artist+One' },
              { name: 'Artist Two', playcount: '50', url: 'https://www.last.fm/music/Artist+Two' },
            ],
          },
        }),
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

  throw new Error(`Unexpected fetch URL: ${url}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeKv(mf: Miniflare): Promise<any> {
  return (await mf.getKVNamespace('LASTFM_CHART_CACHE')) as unknown as any;
}

test('STC-334: getInceptionYears parses a real-shaped SPARQL response', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          results: {
            bindings: [
              { name: { value: 'Pink Floyd' }, year: { value: '1965' } },
              { name: { value: 'Radiohead' }, year: { value: '1985' } },
            ],
          },
        }),
        { status: 200 }
      );

    const result = await getInceptionYears(['Pink Floyd', 'Radiohead']);

    expect(result).toEqual(
      expect.arrayContaining([
        { name: 'Pink Floyd', year: 1965 },
        { name: 'Radiohead', year: 1985 },
      ])
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('STC-334: getInceptionYears degrades to [] on a non-ok response or network error', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (): Promise<Response> => new Response('', { status: 500 });
    expect(await getInceptionYears(['Anyone'])).toEqual([]);

    globalThis.fetch = async (): Promise<Response> => {
      throw new Error('network down');
    };
    expect(await getInceptionYears(['Anyone'])).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('STC-334: getCachedNetworkData populates chronology from the injected fetcher', async () => {
  const originalFetch = globalThis.fetch;
  let mf: Miniflare | null = null;

  try {
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : input.toString();
      return mockLastfmFetch(url);
    };

    mf = new Miniflare({
      modules: true,
      script: `export default { fetch: () => new Response('ok') }`,
      kvNamespaces: ['LASTFM_CHART_CACHE'],
    });
    const kv = await makeKv(mf);
    const mockEnv = { LASTFM_API_KEY: 'test-key', LASTFM_USERNAME: 'test-user' };

    const result = await getCachedNetworkData(
      kv,
      mockEnv,
      '1month',
      async () => [], // influences fetcher
      async (names: string[]) => names.map((name, i) => ({ name, year: 1990 + i })) // chronology fetcher
    );

    expect(result.data.chronology).toEqual([
      { name: 'Artist One', year: 1990 },
      { name: 'Artist Two', year: 1991 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    await mf?.dispose();
  }
});

test('STC-334: getCachedNetworkData degrades chronology to [] independently when its fetcher throws', async () => {
  const originalFetch = globalThis.fetch;
  let mf: Miniflare | null = null;

  try {
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = input instanceof Request ? input.url : input.toString();
      return mockLastfmFetch(url);
    };

    mf = new Miniflare({
      modules: true,
      script: `export default { fetch: () => new Response('ok') }`,
      kvNamespaces: ['LASTFM_CHART_CACHE'],
    });
    const kv = await makeKv(mf);
    const mockEnv = { LASTFM_API_KEY: 'test-key', LASTFM_USERNAME: 'test-user' };

    const result = await getCachedNetworkData(
      kv,
      mockEnv,
      '1month',
      async () => [{ from: 'Artist One', to: 'Artist Two' }], // influences fetcher succeeds
      async () => {
        throw new Error('Wikidata down');
      } // chronology fetcher fails
    );

    // Chronology failing independently must not affect influences or isStale.
    expect(result.data.chronology).toEqual([]);
    expect(result.data.influences).toEqual([{ from: 'Artist One', to: 'Artist Two' }]);
    expect(result.isStale).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    await mf?.dispose();
  }
});
