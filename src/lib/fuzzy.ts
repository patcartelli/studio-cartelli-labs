// src/lib/fuzzy.ts
// Shared string normalization and fuzzy-match helpers for entity URL lookups.
// Pure utility — no I/O, no cloudflare:workers dependency.

/**
 * Normalize a string for comparison: lowercase, collapse whitespace, strip
 * leading "the ", and remove non-alphanumeric characters except spaces.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^the /, '')
    .replace(/[^a-z0-9 ]/g, '');
}

/**
 * Strip common edition/remaster suffixes before comparison.
 * e.g. "OK Computer (Deluxe Edition)" → "OK Computer"
 */
export function stripSuffixes(s: string): string {
  return s
    .replace(/\s*\([^)]*(?:edition|remaster|deluxe|expanded|bonus|version|ep|single)[^)]*\)\s*$/gi, '')
    .trim();
}

/**
 * Fuzzy string match: normalize + strip suffixes, then check if either contains the other.
 */
export function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(stripSuffixes(a));
  const nb = normalize(stripSuffixes(b));
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
