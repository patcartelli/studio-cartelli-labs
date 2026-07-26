// Entries for the homepage `lab.` list.
// Chart and Network only (D-04) — /lab/life stays reachable from /lab but is
// not listed on the homepage. Titles/descriptions are Claude-drafted (D-06)
// and flagged for human sign-off at phase verification — not pre-approved copy.
export interface LabEntry {
  slug: string;
  title: string;
  description: string;
  href: string;
}

export const labEntries: LabEntry[] = [
  {
    slug: 'chart',
    title: 'Listening History',
    description: 'A chart of my recent music listening history from LastFM',
    href: '/lab/chart',
  },
  {
    slug: 'network',
    title: 'Artist Network',
    description: 'A network visualization of artists, similarity, and genres',
    href: '/lab/network',
  },
];
