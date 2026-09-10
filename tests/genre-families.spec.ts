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
    ['rock', 'guitar'],
    ['black metal', 'guitar'],
    ['indie', 'guitar'],
    ['shoegaze', 'guitar'],
    ['folk', 'guitar'],
    ['hip-hop', 'hip-hop & soul'],
    ['rap', 'hip-hop & soul'],
    ['soul', 'hip-hop & soul'],
    ['funk', 'hip-hop & soul'],
    ['jazz', 'hip-hop & soul'],
  ];

  for (const [tag, expected] of cases) {
    expect(genreFamilyForTag(tag), `tag: ${tag}`).toBe(expected);
  }
});

test('specific qualifiers beat the substring they contain', () => {
  // The ordering cases the rule list exists to get right: a bare tag and a
  // qualified one that shares a substring must land in different families.
  expect(genreFamilyForTag('hardcore')).toBe('guitar');
  expect(genreFamilyForTag('hardcore punk')).toBe('guitar');
  expect(genreFamilyForTag('hardcore techno')).toBe('electronic');
  expect(genreFamilyForTag('happy hardcore')).toBe('electronic');

  expect(genreFamilyForTag('garage')).toBe('electronic');
  expect(genreFamilyForTag('garage rock')).toBe('guitar');

  expect(genreFamilyForTag('industrial')).toBe('electronic');
  expect(genreFamilyForTag('industrial metal')).toBe('guitar');

  expect(genreFamilyForTag('jazz')).toBe('hip-hop & soul');
  expect(genreFamilyForTag('jazz rap')).toBe('hip-hop & soul');
});

test("tags that don't clearly belong to a family stay uncoloured", () => {
  // A wrong colour reads as a fact, so genuinely ambiguous tags must not be
  // forced into a family.
  for (const tag of ['pop', 'experimental', '90s', 'female vocalists', 'chillout', '']) {
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
  expect(genreFamilyForTags(['rock', 'electronic'])).toBe('guitar');
  expect(genreFamilyForTags(['electronic', 'rock'])).toBe('electronic');

  expect(genreFamilyForTags([])).toBe('other');
  expect(genreFamilyForTags(undefined)).toBe('other');
  expect(genreFamilyForTags(['pop', 'experimental'])).toBe('other');
});

test('is case- and whitespace-insensitive', () => {
  expect(genreFamilyForTag('  TECHNO  ')).toBe('electronic');
  expect(genreFamilyForTag('Hip-Hop')).toBe('hip-hop & soul');
});

test("GENRE_FAMILIES lists the coloured families only, and 'other' is not one", () => {
  // 'other' is the uncoloured bucket, not a fourth family -- the palette has
  // exactly three validated slots.
  expect([...GENRE_FAMILIES]).toEqual(['electronic', 'guitar', 'hip-hop & soul']);
  expect(GENRE_FAMILIES).not.toContain('other');
});
