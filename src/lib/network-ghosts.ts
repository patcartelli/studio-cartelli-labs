// src/lib/network-ghosts.ts
// Outside influences for the /lab/network graph.
//
// Wikidata's P737 ("influenced by") is sparse for a niche listening profile:
// almost none of the influencers it names are themselves in the user's top 100,
// so drawing only in-list edges leaves the influence layer empty. Instead, an
// influencer outside the list is kept as a "ghost" node tethered to the artist
// it influenced -- Nine Inch Nails <- The Clash -- so the layer says something
// even when no two listened-to artists are linked.
//
// Pure function, split out of network.astro so the matching and capping rules
// can be unit-tested without a Worker or a live dataset.

import type { InfluenceLink } from './wikidata';

export interface GhostNode {
  id: string;
  name: string;
  /** Last.fm artist page; ghosts have no play data, so this is the click target. */
  url: string;
  /** Canonical names of the in-graph artists this influencer shaped. */
  influenced: string[];
}

export interface GhostLink {
  /** Ghost node id (the influencer). */
  source: string;
  /** In-graph artist id (the influenced). */
  target: string;
}

export interface GhostInfluences {
  ghosts: GhostNode[];
  links: GhostLink[];
}

/** Ghosts beyond this are dropped, keeping the ones that touch the most-played artists. */
export const MAX_GHOSTS = 20;

/**
 * No single artist gets more than this many ghosts. Wikidata is uneven: one
 * well-documented artist can list eight influencers and, uncapped, crowd out
 * every other artist's from the overall MAX_GHOSTS budget.
 */
export const MAX_GHOSTS_PER_ARTIST = 3;

export const ghostId = (name: string) => `ghost::${name}`;

/**
 * Split P737 claims into outside influencers of in-graph artists.
 *
 * - `from` must be a graph artist (case-insensitive; resolved to its canonical name).
 * - `to` must NOT be a graph artist -- that case is a real edge between two
 *   nodes and is handled by the caller.
 * - Influencers are de-duplicated case-insensitively, so one influencer of
 *   three artists is one ghost with three links.
 * - When more than MAX_GHOSTS qualify, the ones whose influenced artists have
 *   the highest combined play count win; ties break alphabetically so the
 *   result is stable across loads.
 * - An artist keeps at most MAX_GHOSTS_PER_ARTIST links, taken in that same
 *   order; a ghost whose every influenced artist is already full is skipped.
 */
export function deriveGhostInfluences(
  artists: { id: string; name: string; playcount: number }[],
  influences: InfluenceLink[],
  max: number = MAX_GHOSTS,
  perArtistMax: number = MAX_GHOSTS_PER_ARTIST
): GhostInfluences {
  const byLower = new Map(artists.map((a) => [a.name.toLowerCase(), a]));

  const candidates = new Map<
    string,
    { name: string; weight: number; influenced: Map<string, string> }
  >();

  for (const { from, to } of influences) {
    const influenced = byLower.get(from.toLowerCase());
    if (!influenced) continue;
    if (byLower.has(to.toLowerCase())) continue;

    const key = to.toLowerCase();
    let entry = candidates.get(key);
    if (!entry) {
      entry = { name: to, weight: 0, influenced: new Map() };
      candidates.set(key, entry);
    }
    if (!entry.influenced.has(influenced.id)) {
      entry.influenced.set(influenced.id, influenced.name);
      entry.weight += influenced.playcount;
    }
  }

  const ranked = [...candidates.values()].sort(
    (a, b) => b.weight - a.weight || a.name.localeCompare(b.name)
  );

  const ghosts: GhostNode[] = [];
  const links: GhostLink[] = [];
  const perArtist = new Map<string, number>();
  for (const c of ranked) {
    if (ghosts.length >= max) break;

    const open = [...c.influenced].filter(([artistId]) => (perArtist.get(artistId) ?? 0) < perArtistMax);
    if (open.length === 0) continue;

    const id = ghostId(c.name);
    ghosts.push({
      id,
      name: c.name,
      url: `https://www.last.fm/music/${encodeURIComponent(c.name)}`,
      influenced: open.map(([, name]) => name),
    });
    for (const [artistId] of open) {
      links.push({ source: id, target: artistId });
      perArtist.set(artistId, (perArtist.get(artistId) ?? 0) + 1);
    }
  }

  return { ghosts, links };
}
