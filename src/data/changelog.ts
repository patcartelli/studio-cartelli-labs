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
