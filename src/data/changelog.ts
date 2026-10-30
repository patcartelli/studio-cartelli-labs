// src/data/changelog.ts

export type ChangelogLabel = 'feature' | 'bugfix' | 'improvement';

export interface ChangelogItem {
  label: ChangelogLabel;
  text: string;
}

export interface ChangelogEntry {
  project: string;  // e.g. 'network', 'chart'
  date: string;     // stored as 'YYYY-MM-DD' for sort stability
  items: ChangelogItem[];
}

export const changelog: ChangelogEntry[] = [
  {
    project: 'network',
    date: '2026-10-30',
    items: [
      { label: 'feature',     text: 'Outside influences — artists a Wikidata claim says shaped one of yours, but who are not in this period’s top 100, appear as dashed ghost nodes tethered to the artist they influenced' },
      { label: 'improvement', text: 'Cleaner graph — links that only share a tag are no longer drawn (they still keep same-genre artists clustered), similarity links thicken and brighten with their match score and take the colour of the artist they start from, and nodes get a keyline so they stand apart from the lines beneath' },
      { label: 'improvement', text: 'Only the 18 most-played artists keep a permanent label; hover names any node, and searching labels what it finds' },
      { label: 'improvement', text: 'Controls now float over the graph — period at the top right, a collapsible Filters panel (search, tag, similarity) at the top left, view toggles at the bottom left, genre key at the bottom right — so the graph starts higher and fills the width. On a phone the panel starts folded and the key moves below the graph' },
      { label: 'improvement', text: 'Similarity slider reads "min similarity" and shows how many links survive the cutoff; a Filters badge counts active filters and "clear" resets them all; genre families with no artists are no longer offered' },
      { label: 'improvement', text: 'Everything inside the network window — controls, key, graph labels, tooltips — is now set in Geist' },
      { label: 'bugfix',      text: 'Moving the similarity slider no longer dims every outside influence' },
      { label: 'bugfix',      text: 'Influence lookup now requires a MusicBrainz ID on both ends, so "Air" or "Phoenix" no longer match non-musicians and organizations are no longer shown as influencers' },
    ],
  },
  {
    project: 'network',
    date: '2026-09-10',
    items: [
      { label: 'feature',     text: 'Genre colour coding — nodes tinted by genre family (electronic, rock, metal, punk, indie, hip-hop, soul & funk, jazz & blues), with a clickable legend to isolate one' },
      { label: 'bugfix',      text: "Genre poles now derive from each artist's own tags instead of shared edge tags — well-tagged artists no longer land in 'other'" },
      { label: 'feature',     text: 'Influence chronology — hover a node to see its formation year alongside its name' },
      { label: 'improvement', text: "Influence edge tooltips combine direction and shared tag in one line (e.g. 'Pink Floyd → Radiohead, via rock')" },
    ],
  },
  {
    project: 'chart',
    date: '2026-08-10',
    items: [
      { label: 'bugfix', text: "Resolved missing cover art after Last.fm's CDN changed hosts, and stopped one broken image from breaking the whole copy-chart feature" },
    ],
  },
  {
    project: 'chart',
    date: '2026-07-24',
    items: [
      { label: 'improvement', text: 'Cover art transfer weight cut roughly a third — smaller Last.fm thumbnail variants, artist photos deferred until the Artists tab opens, inline hover thumbs skipped on desktop' },
    ],
  },
  {
    project: 'life',
    date: '2026-07-15',
    items: [
      { label: 'feature', text: "Conway's Game of Life — interactive canvas playground with play/pause, step, speed, randomize, clear, and pointer drawing" },
    ],
  },
  {
    project: 'chart',
    date: '2026-05-21',
    items: [
      { label: 'improvement', text: 'Rank number is now the dominant number on each card — larger type, grouped with play count directly beneath it' },
      { label: 'improvement', text: 'Play count shown as comma-formatted full number ("2,341 plays") instead of abbreviated form' },
      { label: 'improvement', text: 'Rank and plays form a single unit on the left of the card — the separate far-right plays column is gone' },
    ],
  },
  {
    project: 'network',
    date: '2026-05-13',
    items: [
      { label: 'feature',     text: 'Influence edges — artists connected by Wikidata influence relationships show directional arrowheads' },
      { label: 'improvement', text: 'Influence edge tooltips show influencer → influenced direction' },
      { label: 'improvement', text: 'Ghost fade animated — nodes and edges transition smoothly when filtered' },
    ],
  },
  {
    project: 'network',
    date: '2026-05-01',
    items: [
      { label: 'feature',     text: 'Edge tooltips — hover any connection to see shared tags and similarity score' },
      { label: 'feature',     text: 'Search and filter — find artists by name, filter by genre, adjust similarity threshold' },
      { label: 'improvement', text: 'Mobile responsive — controls wrap at small viewports, 44px touch targets, double-tap zoom disabled' },
      { label: 'improvement', text: 'Fullscreen button hidden on browsers that don\u2019t support the Fullscreen API' },
      { label: 'improvement', text: 'Graph data cached server-side with freshness indicator and stale-data fallback' },
    ],
  },
  {
    project: 'network',
    date: '2026-04-30',
    items: [
      { label: 'feature',     text: 'Shimmer skeleton loading states for artist tiles and graph while data resolves' },
      { label: 'improvement', text: 'Reduced motion — shimmer animations respect prefers-reduced-motion' },
    ],
  },
  {
    project: 'chart',
    date: '2026-05-11',
    items: [
      { label: 'feature',     text: 'Desktop layout — two-column view at wide screens with a horizontal card list alongside the cover grid' },
      { label: 'feature',     text: 'Artist website links — resolved via MusicBrainz cascade: official site → Bandcamp → socials → Last.fm floor' },
      { label: 'improvement', text: 'Cards show rank, thumbnail, play count, listen link, and artist link — buttons collapse to icon-only at narrow widths' },
    ],
  },
  {
    project: 'chart',
    date: '2026-05-09',
    items: [
      { label: 'improvement', text: 'Artist photos now resolved server-side — MusicBrainz → Wikimedia Commons → Wikidata → TheAudioDB → Deezer fallback chain; no more lazy-load flash' },
    ],
  },
  {
    project: 'chart',
    date: '2026-04-30',
    items: [
      { label: 'improvement', text: 'Listen links upgraded to Odesli — resolves to Spotify, Apple Music, YouTube, and Bandcamp' },
      { label: 'bugfix',      text: 'Bandcamp lookup switched from HTML scraper to JSON search API for reliability' },
      { label: 'improvement', text: 'Hover state on listen link buttons' },
    ],
  },
  {
    project: 'chart',
    date: '2026-04-29',
    items: [
      { label: 'improvement', text: 'Last.fm data cached server-side with a relative freshness indicator' },
    ],
  },
  {
    project: 'site',
    date: '2026-04-22',
    items: [
      { label: 'feature',     text: 'Dark mode — system preference seeded, manual toggle in nav and footer' },
      { label: 'improvement', text: 'Studio Cartelli name added to nav alongside logomark' },
      { label: 'improvement', text: 'Changelog page — sitewide update history at /changelog' },
    ],
  },
  {
    project: 'site',
    date: '2026-04-11',
    items: [
      { label: 'improvement', text: 'Case study sections — scroll reveal, image animations, and typography polish' },
    ],
  },
  {
    project: 'chart',
    date: '2026-04-21',
    items: [
      { label: 'feature',     text: 'Artist photos — lazy-loaded from TheAudioDB into artist grid tiles' },
      { label: 'feature',     text: 'Listen links — Bandcamp lookup with Last.fm fallback for albums, artists, and tracks' },
      { label: 'improvement', text: 'Track thumbnails — filled from top album art when Last.fm returns no image' },
    ],
  },
  {
    project: 'chart',
    date: '2026-04-08',
    items: [
      { label: 'feature', text: 'Initial release — Last.fm top albums, artists, and tracks with grid + table views' },
    ],
  },
  {
    project: 'network',
    date: '2026-04-20',
    items: [
      { label: 'feature',     text: 'Artist filter — focus the graph on one or more artists' },
      { label: 'feature',     text: 'Changelog — collapsible update history below the graph' },
      { label: 'bugfix',      text: 'Resolved node press repelling surrounding nodes' },
      { label: 'bugfix',      text: 'Resolved filter dimming not applying to graph elements' },
      { label: 'improvement', text: "Genre now derived from artist's own tags instead of shared edges" },
      { label: 'improvement', text: 'Filter dropdown alphabetical, scroll-persistent, DM Mono' },
      { label: 'improvement', text: 'Artist chips redesigned — M3 style with accent dot' },
    ],
  },
  {
    project: 'network',
    date: '2026-04-08',
    items: [
      { label: 'feature', text: 'Initial release — Last.fm artist network with similarity edges, genre mode, and clarity layout' },
    ],
  },
];

/** Most recent changelog date for a project (dates sort lexicographically as stored). */
export function latestChangelogDate(project: string): string | undefined {
  return changelog
    .filter((entry) => entry.project === project)
    .map((entry) => entry.date)
    .reduce((latest, date) => (!latest || date > latest ? date : latest), undefined as string | undefined);
}
