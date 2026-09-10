// src/lib/network-genre.ts
// Client-side genre-pole assignment for the /lab/network graph (STC-340).
// Pulled out of network.astro's inline script as a pure function so "does
// every tagged artist end up with a real genre" can be unit-tested directly,
// without needing a live dataset dense enough to trigger the bug by chance.

export interface GenreAssignment {
  primary: Map<string, string>;
  secondary: Map<string, string>;
}

/**
 * Assign each node a primary/secondary genre pole from its own tag list
 * (already ranked by relevance -- see getArtistTags in lastfm.ts). A node
 * with no tags falls back to 'other'.
 *
 * The previous version derived a node's genre from sharedTags on its graph
 * edges instead of its own tags, so a well-tagged artist could still land
 * on 'other' whenever none of its edges happened to carry a shared tag
 * first (e.g. it was only connected via similarity/influence edges, or lost
 * the tag to a neighbor).
 */
export function assignGenres(
  nodeIds: string[],
  nodeTags: Record<string, string[]>
): GenreAssignment {
  const primary = new Map<string, string>();
  const secondary = new Map<string, string>();

  nodeIds.forEach((id) => {
    const tags = nodeTags[id] ?? [];
    primary.set(id, tags[0] ?? 'other');
    if (tags[1]) secondary.set(id, tags[1]);
  });

  return { primary, secondary };
}
