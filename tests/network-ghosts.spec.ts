// Pure-function tests for deriveGhostInfluences (outside influencers on /lab/network).
// No browser: runs under Playwright's runner like tests/network-genre.spec.ts.

import { test, expect } from '@playwright/test';
import { deriveGhostInfluences, MAX_GHOSTS, MAX_GHOSTS_PER_ARTIST, ghostId } from '../src/lib/network-ghosts';
import { getInfluenceLinks } from '../src/lib/wikidata';

const artists = [
  { id: 'Nine Inch Nails', name: 'Nine Inch Nails', playcount: 300 },
  { id: 'Stereolab', name: 'Stereolab', playcount: 200 },
  { id: 'Thou', name: 'Thou', playcount: 50 },
  { id: 'Can', name: 'Can', playcount: 10 },
];

test('an influencer outside the graph becomes a ghost tethered to the influenced artist', () => {
  const { ghosts, links } = deriveGhostInfluences(artists, [
    { from: 'Nine Inch Nails', to: 'The Clash' },
  ]);
  expect(ghosts).toHaveLength(1);
  expect(ghosts[0].name).toBe('The Clash');
  expect(ghosts[0].id).toBe(ghostId('The Clash'));
  expect(ghosts[0].influenced).toEqual(['Nine Inch Nails']);
  expect(ghosts[0].url).toBe('https://www.last.fm/music/The%20Clash');
  // Link direction: influencer (ghost) is the source, influenced artist the target.
  expect(links).toEqual([{ source: 'ghost::The Clash', target: 'Nine Inch Nails' }]);
});

test('claims between two graph artists are real edges, not ghosts', () => {
  const { ghosts, links } = deriveGhostInfluences(artists, [{ from: 'Stereolab', to: 'Can' }]);
  expect(ghosts).toEqual([]);
  expect(links).toEqual([]);
});

test('a claim whose influenced artist is not in the graph is ignored', () => {
  const { ghosts } = deriveGhostInfluences(artists, [{ from: 'Somebody Else', to: 'The Clash' }]);
  expect(ghosts).toEqual([]);
});

test('matching is case-insensitive and resolves to the canonical artist id', () => {
  const { links } = deriveGhostInfluences(artists, [{ from: 'nine inch nails', to: 'Ministry' }]);
  expect(links).toEqual([{ source: 'ghost::Ministry', target: 'Nine Inch Nails' }]);
});

test('one influencer of several artists is a single ghost with several links', () => {
  const { ghosts, links } = deriveGhostInfluences(artists, [
    { from: 'Stereolab', to: 'Neu!' },
    { from: 'Thou', to: 'neu!' },
    { from: 'Stereolab', to: 'Neu!' }, // duplicate claim must not double-count
  ]);
  expect(ghosts).toHaveLength(1);
  expect(ghosts[0].influenced.sort()).toEqual(['Stereolab', 'Thou']);
  expect(links).toHaveLength(2);
});

test('the cap keeps the ghosts that touch the most-played artists, stably', () => {
  const claims = [
    { from: 'Thou', to: 'Low Weight B' },
    { from: 'Thou', to: 'Low Weight A' },
    { from: 'Nine Inch Nails', to: 'High Weight' },
  ];
  const { ghosts, links } = deriveGhostInfluences(artists, claims, 2);
  expect(ghosts.map((g) => g.name)).toEqual(['High Weight', 'Low Weight A']);
  // Links for dropped ghosts must go with them -- no dangling endpoints.
  expect(links.map((l) => l.source).sort()).toEqual(['ghost::High Weight', 'ghost::Low Weight A']);
});

test('default cap is MAX_GHOSTS', () => {
  // Spread across enough artists that the per-artist cap isn't what binds.
  const many = Array.from({ length: 10 }, (_, i) => ({ id: `A${i}`, name: `A${i}`, playcount: 100 - i }));
  const claims = Array.from({ length: MAX_GHOSTS + 5 }, (_, i) => ({
    from: `A${i % 10}`,
    to: `Influencer ${String(i).padStart(2, '0')}`,
  }));
  expect(deriveGhostInfluences(many, claims).ghosts).toHaveLength(MAX_GHOSTS);
});

test('one artist cannot take more than MAX_GHOSTS_PER_ARTIST ghosts', () => {
  const claims = Array.from({ length: MAX_GHOSTS_PER_ARTIST + 4 }, (_, i) => ({
    from: 'Nine Inch Nails',
    to: `Influencer ${i}`,
  }));
  claims.push({ from: 'Thou', to: 'Nirvana' });
  const { ghosts, links } = deriveGhostInfluences(artists, claims);
  expect(links.filter((l) => l.target === 'Nine Inch Nails')).toHaveLength(MAX_GHOSTS_PER_ARTIST);
  // The cap must not starve other artists of their ghost.
  expect(ghosts.map((g) => g.name)).toContain('Nirvana');
  // No ghost is left without a link.
  ghosts.forEach((g) => expect(links.some((l) => l.source === g.id)).toBe(true));
});

test('a ghost shared by a full artist and an open one keeps only the open link', () => {
  // A, B, C influence two heavy artists, so they outrank Shared (which spans a
  // heavy and a light one) and fill Nine Inch Nails' quota first.
  const claims = ['A', 'B', 'C'].flatMap((to) => [
    { from: 'Nine Inch Nails', to },
    { from: 'Stereolab', to },
  ]);
  claims.push({ from: 'Nine Inch Nails', to: 'Shared' }, { from: 'Thou', to: 'Shared' });
  const { ghosts, links } = deriveGhostInfluences(artists, claims);
  const shared = ghosts.find((g) => g.name === 'Shared');
  expect(shared?.influenced).toEqual(['Thou']);
  expect(links.filter((l) => l.source === 'ghost::Shared')).toEqual([
    { source: 'ghost::Shared', target: 'Thou' },
  ]);
});

test('getInfluenceLinks requires a MusicBrainz ID on both ends and parses bindings', async () => {
  const realFetch = globalThis.fetch;
  let seenQuery = '';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seenQuery = new URL(input.toString()).searchParams.get('query') ?? '';
    return new Response(
      JSON.stringify({
        results: { bindings: [{ from: { value: 'Stereolab' }, to: { value: 'Neu!' } }] },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;
  try {
    const links = await getInfluenceLinks(['Stereolab', 'Phoenix']);
    expect(links).toEqual([{ from: 'Stereolab', to: 'Neu!' }]);
    // The musician guard: without P434 on both sides, "Phoenix" matches a city.
    expect(seenQuery.match(/wdt:P434 \[\]/g)).toHaveLength(2);
    expect(seenQuery).not.toContain('VALUES ?toLabel');
  } finally {
    globalThis.fetch = realFetch;
  }
});
