// tests/genre-families.spec.ts
// STC-339: unit tests for the tag -> genre family mapping that drives node
// colour on /lab/network.
//
// Runs as a pure Node.js function under Playwright's test runner -- no browser
// launched (no `page` fixture), mirroring the network-cache-*.spec.ts files.

import { test, expect } from '@playwright/test';
import {
  genreFamilyForTag,
  genreFamilyForTags,
  genreFamilySlug,
  GENRE_FAMILIES,
  type GenreFamily,
} from '../src/lib/genre-families';

test('maps representative tags of each family', () => {
  const cases: Array<[string, GenreFamily]> = [
    ['electronic', 'electronic'],
    ['techno', 'electronic'],
    ['ambient', 'electronic'],
    ['drum and bass', 'electronic'],
    ['trip-hop', 'electronic'],
    ['rock', 'rock'],
    ['classic rock', 'rock'],
    ['psychedelic', 'rock'],
    ['krautrock', 'rock'],
    ['black metal', 'metal'],
    ['doom', 'metal'],
    ['metalcore', 'metal'],
    ['punk', 'punk'],
    ['screamo', 'punk'],
    ['indie', 'indie'],
    ['shoegaze', 'indie'],
    ['post-rock', 'indie'],
    ['hip-hop', 'hip-hop'],
    ['rap', 'hip-hop'],
    ['grime', 'hip-hop'],
    ['soul', 'soul & funk'],
    ['funk', 'soul & funk'],
    ['motown', 'soul & funk'],
    ['jazz', 'jazz & blues'],
    ['blues', 'jazz & blues'],
    ['bebop', 'jazz & blues'],
  ];

  for (const [tag, expected] of cases) {
    expect(genreFamilyForTag(tag), `tag: ${tag}`).toBe(expected);
  }
});

test('specific qualifiers beat the substring they contain', () => {
  // The ordering cases the rule list exists to get right: a bare tag and a
  // qualified one that shares a substring must land in different families.
  expect(genreFamilyForTag('hardcore')).toBe('punk');
  expect(genreFamilyForTag('hardcore punk')).toBe('punk');
  expect(genreFamilyForTag('hardcore techno')).toBe('electronic');
  expect(genreFamilyForTag('happy hardcore')).toBe('electronic');

  expect(genreFamilyForTag('garage')).toBe('electronic');
  expect(genreFamilyForTag('garage rock')).toBe('rock');

  expect(genreFamilyForTag('industrial')).toBe('electronic');
  expect(genreFamilyForTag('industrial metal')).toBe('metal');

  expect(genreFamilyForTag('jazz')).toBe('jazz & blues');
  expect(genreFamilyForTag('jazz rap')).toBe('hip-hop');
  expect(genreFamilyForTag('jazz funk')).toBe('soul & funk');
});

test('family order resolves compound tags without an explicit override', () => {
  // 'rock' is the most general slot and comes last, so a compound tag lands in
  // the more specific family it also names.
  expect(genreFamilyForTag('indie rock')).toBe('indie');
  expect(genreFamilyForTag('punk rock')).toBe('punk');
  expect(genreFamilyForTag('alternative rock')).toBe('indie');
  expect(genreFamilyForTag('nu metal')).toBe('metal');
  expect(genreFamilyForTag('rap metal')).toBe('metal');
  expect(genreFamilyForTag('post-punk')).toBe('punk');
});

test("tags that don't clearly belong to a family stay uncoloured", () => {
  // A wrong colour reads as a fact, so genuinely ambiguous tags must not be
  // forced into a family. Folk, country and classical are deliberate 'other's:
  // there are only eight palette slots.
  for (const tag of [
    'pop',
    'experimental',
    '90s',
    'female vocalists',
    'chillout',
    'folk',
    'country',
    'classical',
    '',
  ]) {
    expect(genreFamilyForTag(tag), `tag: ${tag}`).toBe('other');
  }
  expect(genreFamilyForTag(undefined)).toBe('other');
  expect(genreFamilyForTag(null)).toBe('other');
});

test('tag lists take the highest-ranked tag that maps to a real family', () => {
  // The reason genreFamilyForTags walks the list instead of reading tags[0]:
  // a non-genre descriptor at rank 0 would otherwise strand a well-tagged
  // artist in 'other'.
  expect(genreFamilyForTags(['female vocalists', '90s', 'techno'])).toBe('electronic');

  // Rank order still decides between two real families.
  expect(genreFamilyForTags(['rock', 'electronic'])).toBe('rock');
  expect(genreFamilyForTags(['electronic', 'rock'])).toBe('electronic');

  expect(genreFamilyForTags([])).toBe('other');
  expect(genreFamilyForTags(undefined)).toBe('other');
  expect(genreFamilyForTags(['pop', 'experimental'])).toBe('other');
});

test('is case- and whitespace-insensitive', () => {
  expect(genreFamilyForTag('  TECHNO  ')).toBe('electronic');
  expect(genreFamilyForTag('Hip-Hop')).toBe('hip-hop');
});

test('every family has a distinct, CSS-safe slug', () => {
  const all: GenreFamily[] = [...GENRE_FAMILIES, 'other'];
  const slugs = all.map(genreFamilySlug);

  // Slugs build custom-property names (--genre-<slug>) and data attributes, so
  // they must be unique and contain nothing that needs escaping.
  expect(new Set(slugs).size).toBe(slugs.length);
  for (const slug of slugs) {
    expect(slug, `slug: ${slug}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  }
  expect(genreFamilySlug('soul & funk')).toBe('soul-funk');
  expect(genreFamilySlug('jazz & blues')).toBe('jazz-blues');
  expect(genreFamilySlug('hip-hop')).toBe('hip-hop');
});

test('GENRE_FAMILIES has the eight coloured slots and excludes other', () => {
  // 'other' is the uncoloured bucket, not a ninth family -- the palette has
  // exactly eight validated slots.
  expect(GENRE_FAMILIES).toHaveLength(8);
  expect(GENRE_FAMILIES).not.toContain('other');
  expect(new Set(GENRE_FAMILIES).size).toBe(8);
});
