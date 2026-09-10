// src/lib/genre-families.ts
// STC-339: maps a Last.fm tag onto one of eight broad genre families, which is
// what /lab/network colours nodes by.
//
// The families are deliberately broad: the point is to let a stranger read
// "this sub-genre sits inside that family" at a glance, not to be a taxonomy.
// Tags that don't clearly belong to one (bare 'pop', 'experimental', mood and
// decade tags) stay 'other' on purpose -- a wrong colour reads as a fact and is
// worse than no colour. Folk, country and classical also fall to 'other': there
// are eight validated palette slots and these were the eight that carry the most
// nodes on a typical graph.

export type GenreFamily =
  | 'electronic'
  | 'rock'
  | 'metal'
  | 'punk'
  | 'indie'
  | 'hip-hop'
  | 'soul & funk'
  | 'jazz & blues'
  | 'other';

/** The coloured families, in fixed palette-slot order. 'other' is not here --
 *  it is the uncoloured bucket, not a ninth family. Order is the palette's, so
 *  a family keeps its hue no matter how many nodes it has: colour follows the
 *  entity, never its rank. */
export const GENRE_FAMILIES = [
  'electronic',
  'rock',
  'metal',
  'punk',
  'indie',
  'hip-hop',
  'soul & funk',
  'jazz & blues',
] as const;

// Ordered most-specific first, and first match wins, so a compound tag lands in
// the family its qualifier names rather than the one a substring happens to
// hit. The sharp cases, all of which are real Last.fm tags:
//   'hardcore techno' is electronic, bare 'hardcore' is punk
//   'garage rock' is rock, bare 'garage' is UK garage (electronic)
//   'industrial metal' is metal, bare 'industrial' is electronic
//   'jazz rap' is hip-hop, bare 'jazz' is jazz & blues
// After the overrides, family order itself resolves the rest: 'indie rock' hits
// indie before rock, 'punk rock' hits punk before rock, and bare 'rock' falls
// through to the most general slot last.
const FAMILY_RULES: ReadonlyArray<{ pattern: RegExp; family: GenreFamily }> = [
  // --- Specific overrides ---
  { pattern: /hardcore techno|happy hardcore|gabber|speedcore|breakcore/, family: 'electronic' },
  { pattern: /garage rock/, family: 'rock' },
  { pattern: /industrial (rock|metal)/, family: 'metal' },
  { pattern: /jazz (rap|hop)/, family: 'hip-hop' },
  { pattern: /soul jazz|jazz funk/, family: 'soul & funk' },

  // --- Metal (before punk and rock: catches 'nu metal', 'rap metal') ---
  {
    pattern: /metal|doom|sludge|grindcore|djent|metalcore|deathcore/,
    family: 'metal',
  },

  // --- Punk (before indie and rock: catches 'punk rock', 'post-punk') ---
  { pattern: /punk|hardcore|screamo|\bemo\b|\boi!?\b|riot grrrl/, family: 'punk' },

  // --- Indie / alternative (before rock: catches 'indie rock', 'alt rock') ---
  {
    pattern: /\bindie\b|alternative|\balt\b|shoegaze|dream pop|post-?rock|lo-?fi|slowcore|noise pop|jangle/,
    family: 'indie',
  },

  // --- Hip-hop ---
  { pattern: /hip[\s-]?hop|\brap\b|\btrap\b|grime|boom bap|turntabl/, family: 'hip-hop' },

  // --- Soul & funk ---
  {
    pattern: /\bsoul\b|funk|r&b|\brnb\b|rhythm and blues|motown|disco|gospel|afrobeat|neo-?soul/,
    family: 'soul & funk',
  },

  // --- Jazz & blues ---
  { pattern: /\bjazz\b|\bblues\b|bebop|big band|swing|ragtime|fusion/, family: 'jazz & blues' },

  // --- Electronic (before rock so bare 'industrial' and 'garage' land here) ---
  {
    pattern:
      /electronic|electronica|electro\b|techno|house|trance|ambient|\bidm\b|\bedm\b|dubstep|drum\s*(and|'?n'?|&)\s*bass|\bdnb\b|jungle|breakbeat|big beat|downtempo|trip[\s-]?hop|synth[\s-]?pop|synth[\s-]?wave|darkwave|industrial|glitch|vaporwave|witch house|footwork|chiptune|acid|minimal|\bgarage\b|\brave\b|\bdance\b|\bbass\b/,
    family: 'electronic',
  },

  // --- Rock, last and most general ---
  {
    pattern: /\brock\b|psychedelic|\bprog\b|britpop|grunge|surf|rockabilly|\bmath rock\b|krautrock|glam/,
    family: 'rock',
  },
];

/**
 * CSS-identifier-safe form of a family name, used to build the custom-property
 * name the page colours a node with (`--genre-soul-funk`). Keeps the mapping
 * from family to palette slot in one place rather than spread between the
 * stylesheet and the D3 code.
 */
export function genreFamilySlug(family: GenreFamily): string {
  return family
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
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
