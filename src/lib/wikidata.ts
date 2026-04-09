// src/lib/wikidata.ts

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

export interface InfluenceLink {
  from: string;
  to: string;
}

/**
 * Find influence relationships (Wikidata P737 "influenced by") between artists
 * in the provided list. Returns only pairs where both artists are in the list.
 *
 * Note: Wikidata labels may not exactly match Last.fm names. This uses exact
 * English label matching — artists with different name spellings won't connect.
 */
export async function getInfluenceLinks(artistNames: string[]): Promise<InfluenceLink[]> {
  if (artistNames.length === 0) return [];

  // Build VALUES clause: "Artist Name"@en for each artist
  const values = artistNames
    .map((n) => `"${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"@en`)
    .join('\n    ');

  const query = `
    SELECT DISTINCT (STR(?fromLabel) AS ?from) (STR(?toLabel) AS ?to) WHERE {
      VALUES ?fromLabel { ${values} }
      VALUES ?toLabel { ${values} }
      ?fromEntity rdfs:label ?fromLabel ;
                  wdt:P737 ?toEntity .
      ?toEntity rdfs:label ?toLabel .
      FILTER(?fromEntity != ?toEntity)
    }
  `;

  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'StudioCartelli/1.0 (https://studiocartelli.com; contact@studiocartelli.com)',
        'Accept': 'application/sparql-results+json',
      },
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      results: { bindings: Array<{ from: { value: string }; to: { value: string } }> }
    };

    return (data.results?.bindings ?? []).map((b) => ({
      from: b.from.value,
      to: b.to.value,
    }));
  } catch {
    return [];
  }
}
