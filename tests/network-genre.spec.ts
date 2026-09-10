// tests/network-genre.spec.ts
// STC-340 regression: genre pole assignment on /lab/network used to be
// derived from sharedTags on a node's graph edges instead of the node's own
// tag list. An artist with real, well-populated tags could still land on
// the 'other' pole if none of its edges happened to carry a shared tag
// first -- e.g. it was only connected via similarity/influence edges (no
// sharedTags at all), or a differently-tagged neighbor claimed the edge's
// shared tag first. This reproduces exactly that shape deterministically,
// which the live 13-artist CI fixture is too small and dense to trigger by
// chance (see the reverted DOM-scraping attempt in PR history).
//
// Runs as a pure Node.js function under Playwright's test runner -- no
// browser launched, mirroring tests/network-cache-*.spec.ts.

import { test, expect } from '@playwright/test';
import { assignGenres } from '../src/lib/network-genre';

test('STC-340: an artist with real tags gets its own genre even with no shared-tag edges', () => {
  // "Isolated Jazz Artist" has a real tag list but (in the old, edge-based
  // scheme) no edge of its own ever carried 'jazz' as sharedTags[0] -- e.g.
  // its only connections were similarity/influence edges.
  const nodeIds = ['Isolated Jazz Artist', 'Pop Star A', 'Pop Star B'];
  const nodeTags: Record<string, string[]> = {
    'Isolated Jazz Artist': ['jazz', 'bebop'],
    'Pop Star A': ['pop', 'dance'],
    'Pop Star B': ['pop'],
  };

  const { primary, secondary } = assignGenres(nodeIds, nodeTags);

  expect(primary.get('Isolated Jazz Artist')).toBe('jazz');
  expect(secondary.get('Isolated Jazz Artist')).toBe('bebop');
  expect(primary.get('Pop Star A')).toBe('pop');
  expect(primary.get('Pop Star B')).toBe('pop');
});

test('STC-340: an artist with no tags at all correctly falls back to other', () => {
  const nodeIds = ['Untagged Artist'];
  const nodeTags: Record<string, string[]> = {};

  const { primary, secondary } = assignGenres(nodeIds, nodeTags);

  expect(primary.get('Untagged Artist')).toBe('other');
  expect(secondary.has('Untagged Artist')).toBe(false);
});
