// Entries for the homepage `lab.` list.
// Chart and Network only (D-04) — /lab/life stays reachable from /lab but is
// not listed on the homepage. Titles/descriptions are Claude-drafted (D-06)
// and flagged for human sign-off at phase verification — not pre-approved copy.
export interface LabEntry {
  slug: string;
  title: string;
  description: string;
  /** All-caps overline kicker (STC-131 Text Hero); rendered via CSS uppercase. */
  overline: string;
  /** Visual CTA chip label inside the entry link (STC-131). */
  ctaLabel: string;
  href: string;
}

export const labEntries: LabEntry[] = [
  {
    slug: 'chart',
    title: 'Listening History',
    description: 'A chart of my recent music listening history from LastFM',
    overline: 'Last.fm • Personal Listening',
    ctaLabel: 'View Experiment',
    href: '/lab/chart',
  },
  {
    slug: 'network',
    title: 'Artist Network',
    description: 'A network visualization of artists, similarity, and genres',
    overline: 'Wikidata • Artist Network',
    ctaLabel: 'View Experiment',
    href: '/lab/network',
  },
];
