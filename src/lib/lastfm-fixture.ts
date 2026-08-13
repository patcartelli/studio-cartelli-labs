// src/lib/lastfm-fixture.ts
// Deterministic stand-in for the Last.fm API, used so the data-gated Playwright
// tests can run without live API credentials.
//
// WHY THIS EXISTS
// CI has no LASTFM_API_KEY, so /lab/chart's SSR fetch threw, the page rendered
// empty, and every data-gated test skipped — 91 of them. The Playwright job was
// green the entire time, which meant a green check said nothing at all about
// /lab/chart. (Measured on PR #337: 1210 passed / 83 skipped / 7 failed locally
// vs 1126 passed / 174 skipped / 0 failed in CI.)
//
// DESIGN
// The fixture intercepts at the HTTP boundary and returns raw Last.fm response
// payloads, NOT parsed domain objects. Everything downstream of the network —
// response parsing, rank/playcount coercion, image-size selection, the KV cache
// wrappers, SSR rendering — runs exactly as it does in production. Only fetch()
// is replaced.
//
// The payloads are real responses captured from the live API on 2026-08-10, so
// they carry real cover-art URLs on the real CDN host. That is deliberate: a
// synthetic fixture pointing at fake image URLs would never exercise
// proxy-image's ALLOWED_HOSTS, which is exactly the code path whose drift broke
// every cover on the page. (The dedicated offline guard for that lives in
// tests/api-proxy-image.spec.ts — this just avoids actively hiding it.)
//
// SAFETY
// Activates only when LASTFM_FIXTURE === '1'. That var is set solely by the CI
// workflow, never in wrangler.toml, so production can never serve fixture data.
// The check runs BEFORE the credential guard, so it works with no key present —
// which is the whole point, since "no key" is the CI condition.
//
// REGENERATING
// The data is a weekly chart and will drift from Patrick's real listening over
// time. That does not matter: tests assert structure and behavior, not specific
// album names. Refresh only if the API's response SHAPE changes:
//   curl "https://ws.audioscrobbler.com/2.0/?method=user.getTopAlbums&user=$LASTFM_USERNAME&period=7day&limit=100&api_key=$LASTFM_API_KEY&format=json" \
//     | node -e "process.stdout.write('export default ' + JSON.stringify(JSON.parse(require('fs').readFileSync(0))) + ' as const;')" \
//     > src/lib/fixtures/lastfm-topalbums.ts
// (keep the explanatory header comment at the top of the regenerated file)

// Plain TS modules, not .json imports: JSON modules require an `with { type:
// 'json' }` attribute under Node's ESM loader, and several Playwright specs
// import from src/ directly — those blew up with
// `needs an import attribute of "type: json"` before this was changed.
import topalbums from './fixtures/lastfm-topalbums';
import topartists from './fixtures/lastfm-topartists';
import toptracks from './fixtures/lastfm-toptracks';

interface FixtureEnv {
  LASTFM_FIXTURE?: string;
}

/** True when the deterministic fixture should stand in for the live API. */
export function isFixtureMode(env: FixtureEnv | undefined): boolean {
  return env?.LASTFM_FIXTURE === '1';
}

const PAYLOADS: Record<string, unknown> = {
  'user.getTopAlbums': topalbums,
  'user.getTopArtists': topartists,
  'user.getTopTracks': toptracks,
};

/**
 * Raw Last.fm payload for a method, trimmed to `limit` entries.
 *
 * Callers request wildly different limits for the same method (20 on the chart
 * page, 100 for the network graph, 1000 for the full-chart cache). The captured
 * payload holds one full weekly chart, so a limit above its length yields the
 * whole thing — same as the real API, which returns what exists rather than
 * padding to the requested limit.
 *
 * Throws on an unknown method rather than returning null: a silent null here
 * would resurface as an empty page and a wall of skipped tests, which is the
 * exact failure mode this module exists to prevent.
 */
export function getFixturePayload(method: string, limit: number): unknown {
  const payload = PAYLOADS[method];
  if (!payload) {
    throw new Error(
      `[lastfm-fixture] no fixture for method "${method}" — add one to src/lib/fixtures/ ` +
        `rather than letting LASTFM_FIXTURE mode silently return no data`
    );
  }

  // Structure is { <rootKey>: { <entryKey>: [...], '@attr': {...} } }.
  const root = payload as Record<string, Record<string, unknown>>;
  const rootKey = Object.keys(root)[0];
  const container = root[rootKey];
  const entryKey = Object.keys(container).find((k) => Array.isArray(container[k]));
  if (!entryKey) return payload;

  const entries = container[entryKey] as unknown[];
  if (entries.length <= limit) return payload;

  return {
    [rootKey]: {
      ...container,
      [entryKey]: entries.slice(0, limit),
    },
  };
}
