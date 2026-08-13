// Entries for lab experiment cards (homepage + /lab index).
// Chart and Network appear on the homepage (D-04); Life is /lab-only.
// Titles/descriptions are Claude-drafted (D-06) and flagged for human sign-off
// at phase verification — not pre-approved copy.
export interface LabEntry {
  slug: string;
  title: string;
  description: string;
  /** All-caps overline kicker; rendered via CSS uppercase. */
  overline: string;
  /** Visual CTA chip label inside the card link. */
  ctaLabel: string;
  href: string;
  /**
   * Optional thumbnail — a **final, base-prefixed** URL (`/lab/images/...`),
   * consistent with how `href` values in this file are stored.
   *
   * The `/lab` prefix is not optional. `base: '/lab'` does not rewrite
   * hand-written string literals (see astro.config.mjs), so a bare
   * `/images/...` would resolve outside the `studiocartelli.com/lab*` Workers
   * Route and be served by the MAIN studio-cartelli Worker instead. That path
   * happens to exist there today, so it would appear to work — right up until
   * the main repo drops its lab assets, at which point it breaks in production
   * only. Keep the prefix.
   *
   * Entries without artwork omit this and fall back to the typographic
   * placeholder in LabCard.
   */
  thumbnail?: string;
  /** When false, entry is omitted from the homepage lab grid. */
  showOnHomepage?: boolean;
}

export const labEntries: LabEntry[] = [
  {
    slug: 'chart',
    title: 'Listening History',
    description: 'A chart of my recent music listening history from LastFM',
    overline: 'Last.fm • Personal Listening',
    ctaLabel: 'View Experiment',
    href: '/lab/chart',
    thumbnail: '/lab/images/home/lab-chart.avif',
    showOnHomepage: true,
  },
  {
    slug: 'network',
    title: 'Artist Network',
    description: 'A network visualization of artists, similarity, and genres',
    overline: 'Wikidata • Artist Network',
    ctaLabel: 'View Experiment',
    href: '/lab/network',
    thumbnail: '/lab/images/home/lab-network.avif',
    showOnHomepage: true,
  },
  {
    slug: 'life',
    title: 'Life',
    description: "Conway's Game of Life, playable in the browser",
    overline: 'Canvas • Cellular Automaton',
    ctaLabel: 'View Experiment',
    href: '/lab/life',
    showOnHomepage: false,
  },
];

/** Homepage lab grid — chart + network only (D-04). */
export const homepageLabEntries = labEntries.filter((entry) => entry.showOnHomepage !== false);
