// src/lib/genre-families.ts
// STC-339: maps a Last.fm tag onto one of three broad genre families, which is
// what /lab/network colours nodes by.
//
// Why three and not more: a network graph is the "all-pairs" case for a
// categorical palette -- the force layout can put any two nodes next to each
// other, unlike a bar chart where only adjacent series touch. Validated against
// the page's own surfaces (#f8f8f8 light, #18181C dark), eight distinct hues
// fail the normal-vision separation floor outright (worst pair dE 7.1, floor
// 15) and four fail in dark mode (dE 9.8). Three pass every check in both
// themes with real headroom, so three families it is. Everything else stays
// monochrome as 'other' rather than being given a hue that can't be told apart.
//
// The families are deliberately broad: the point is to let a stranger read
// "this sub-genre sits inside that family" at a glance, not to be a taxonomy.
// Tags that don't clearly belong to one (bare 'pop', 'experimental', mood and
// decade tags) stay 'other' on purpose -- a wrong colour reads as a fact and is
// worse than no colour.

export type GenreFamily = 'electronic' | 'guitar' | 'hip-hop & soul' | 'other';

/** The coloured families, in fixed palette-slot order. 'other' is not here --
 *  it is the uncoloured bucket, not a fourth family. */
export const GENRE_FAMILIES = ['electronic', 'guitar', 'hip-hop & soul'] as const;

// Ordered most-specific first, and first match wins, so genuinely ambiguous
// tags land in the family their qualifier names rather than the one a substring
// happens to hit. 'hardcore' is the sharp case: bare, it is hardcore punk, but
// 'hardcore techno' and 'happy hardcore' are electronic and must be caught
// first. 'garage' is the same shape in reverse -- 'garage rock' is a guitar
// tag, bare 'garage' is UK garage.
const FAMILY_RULES: ReadonlyArray<{ pattern: RegExp; family: GenreFamily }> = [
  // --- Specific overrides, before the general patterns below ---
  { pattern: /hardcore techno|happy hardcore|gabber|speedcore|breakcore/, family: 'electronic' },
  { pattern: /garage rock|post-?hardcore|hardcore punk|melodic hardcore/, family: 'guitar' },
  { pattern: /industrial (rock|metal)/, family: 'guitar' },
  { pattern: /jazz (rap|hop)/, family: 'hip-hop & soul' },

  // --- Electronic ---
  {
    pattern:
      /electronic|electronica|electro\b|techno|house|trance|ambient|\bidm\b|\bedm\b|dubstep|drum\s*(and|'?n'?|&)\s*bass|\bdnb\b|jungle|breakbeat|big beat|downtempo|trip[\s-]?hop|synth[\s-]?pop|synth[\s-]?wave|darkwave|industrial|glitch|vaporwave|witch house|footwork|chiptune|acid house|acid techno|minimal techno|\bgarage\b|\brave\b|dance/,
    family: 'electronic',
  },

  // --- Guitar ---
  {
    pattern:
      /\brock\b|metal|punk|\bindie\b|alternative|grunge|shoegaze|post-?rock|post-?punk|\bemo\b|screamo|hardcore|\bfolk\b|country|blues|psychedelic|britpop|americana|singer[\s-]?songwriter|math rock|noise rock|\bprog\b|dream pop|jangle/,
    family: 'guitar',
  },

  // --- Hip-hop & soul ---
  {
    pattern:
      /hip[\s-]?hop|\brap\b|\btrap\b|r&b|\brnb\b|rhythm and blues|\bsoul\b|funk|motown|disco|\bjazz\b|gospel|afrobeat/,
    family: 'hip-hop & soul',
  },
];

/**
 * CSS-identifier-safe form of a family name, used to build the custom-property
 * name the page colours a node with (`--genre-hip-hop-soul`). Keeps the
 * mapping from family to palette slot in one place rather than spread between
 * the stylesheet and the D3 code.
 */
export function genreFamilySlug(family: GenreFamily): string {
  return family.replace(/&/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
}

/**
 * Map a single Last.fm tag to its family, or 'other' if it doesn't clearly
 * belong to one. Tags arrive lowercased from getArtistTags; lowercase here
 * anyway so the function is safe to call on any string.
 */
export function genreFamilyForTag(tag: string | undefined | null): GenreFamily {
  if (!tag) return 'other';
  const normalized = tag.toLowerCase().trim();
  for (const { pattern, family } of FAMILY_RULES) {
    if (pattern.test(normalized)) return family;
  }
  return 'other';
}

/**
 * Map an artist's ranked tag list to a family, taking the highest-ranked tag
 * that maps to a real one.
 *
 * Walking the list rather than reading only tags[0] matters in practice: a
 * Last.fm top tag is often a non-genre descriptor ('female vocalists', '90s')
 * that would strand an otherwise well-tagged artist in 'other'. Rank order is
 * still respected -- the first genuine genre tag wins -- so the result stays
 * deterministic and doesn't depend on how the graph happens to be linked.
 */
export function genreFamilyForTags(tags: readonly string[] | undefined | null): GenreFamily {
  if (!tags) return 'other';
  for (const tag of tags) {
    const family = genreFamilyForTag(tag);
    if (family !== 'other') return family;
  }
  return 'other';
}
