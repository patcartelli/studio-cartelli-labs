// src/lib/wikidata.ts

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

export interface InfluenceLink {
  from: string;
  to: string;
}

interface WikidataSparqlImageResponse {
  results?: {
    bindings?: Array<{
      image?: { value: string };
    }>;
  };
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

/**
 * Resolve an artist's Wikidata P18 image URL by MusicBrainz ID (P434).
 * Returns a Wikimedia `Special:FilePath` URL with the protocol upgraded to https://.
 * Returns '' when the artist has no Wikidata entity, no P18 value, or on any fetch error.
 *
 * The returned URL is browser-usable as <img src> directly — Special:FilePath redirects
 * (HTTP 302) to the actual upload.wikimedia.org CDN URL.
 *
 * The HTTP→HTTPS upgrade is mandatory: Wikidata returns http:// URIs and chart.astro
 * is served over HTTPS — without the upgrade, browsers block the image as mixed content.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getWikidataArtistImageUrl(mbid: string): Promise<string> {
  if (!mbid || !UUID_RE.test(mbid)) return '';

  const query = `
    SELECT ?image WHERE {
      ?artist wdt:P434 "${mbid}" .
      ?artist wdt:P18 ?image .
    }
    LIMIT 1
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
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return '';

    const data = await res.json() as WikidataSparqlImageResponse;
    const imageUri = data.results?.bindings?.[0]?.image?.value;
    if (!imageUri) return '';

    // Mandatory: Wikidata P18 returns http:// — upgrade to https:// to avoid mixed content.
    return imageUri.replace(/^http:\/\//, 'https://');
  } catch {
    return '';
  }
}
