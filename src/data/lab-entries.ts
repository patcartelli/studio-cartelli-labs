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
  /** Optional thumbnail path — STC-186/187 will populate. */
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
    showOnHomepage: true,
  },
  {
    slug: 'network',
    title: 'Artist Network',
    description: 'A network visualization of artists, similarity, and genres',
    overline: 'Wikidata • Artist Network',
    ctaLabel: 'View Experiment',
    href: '/lab/network',
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
