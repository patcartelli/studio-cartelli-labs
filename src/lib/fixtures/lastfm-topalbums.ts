// Captured from the live Last.fm API on 2026-08-10 (user.getTopAlbums, period=7day).
// Raw response payload — parsed by the same code path as a real response.
// Regeneration instructions live in src/lib/lastfm-fixture.ts.
// Plain TS rather than a .json import: JSON modules need an import attribute
// under Node's ESM loader, which broke Playwright specs that import from src/.

export default {"topalbums":{"album":[],"@attr":{"user":"patcartelli","totalPages":"1","page":"1","perPage":"100","total":"0"}}} as const;
