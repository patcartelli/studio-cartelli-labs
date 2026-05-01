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
