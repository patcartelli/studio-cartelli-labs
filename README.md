# Studio Cartelli Labs

The public half of [studiocartelli.com](https://studiocartelli.com) — a set of small data-visualization experiments, split out into their own repo so the code and history can be public while the main portfolio (client case studies, password-gated) stays private.

Live at [studiocartelli.com/lab](https://studiocartelli.com/lab):

- **`/lab/chart`** — a chart of recent Last.fm listening history
- **`/lab/network`** — a network visualization of artists, similarity, and genres (Last.fm + MusicBrainz + Wikidata)
- **`/lab/life`** — Conway's Game of Life, playable in the browser

## Stack

- **Astro 6** + [`@astrojs/cloudflare`](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) — server-rendered on Cloudflare Workers
- **Cloudflare Workers + KV** — caches the Last.fm/MusicBrainz/network pipeline data, warmed on a 5-minute cron
- **Vanilla TS/JS** — no client-side framework
- **d3** — network graph rendering
- **Playwright** + `@axe-core/playwright` — E2E and accessibility test coverage

## Note on fonts

This site renders in **Polymath**, licensed from [OH no Type Company](https://ohnotype.co) for studiocartelli.com. The license prohibits redistribution, so **the font files are not in this repo and never will be** — `.gitignore` blocks every font format repo-wide, and a CI job fails any PR that tracks one.

The site still gets the real font, because it is referenced by URL rather than bundled. This Worker is routed at `studiocartelli.com/lab` and `/lab/*` only, so a request for `/fonts/*.woff2` falls outside that route and the zone serves it from the main studiocartelli.com Worker. Same origin, one licensed copy, no second deployment — and `/lab` traffic counts against the existing page-view tier rather than needing a new license.

**Cloning this repo gets you a working site.** Nothing needs a font binary to build, test, or deploy. Without licensed copies on disk you'll see the fallback stack (Georgia / system sans) in local dev, so the chrome — nav, footer, headings — won't be pixel-identical to production. The experiments themselves are unaffected.

If you *do* hold a Polymath license and want local dev to match production, drop your copies into `public/fonts/` using the filenames in the `@font-face` rules in `src/styles/global.css`. That directory is gitignored; the dev server serves it at `/lab/fonts/*`, which is the second `src` in each rule.

Two things not to "fix" in `src/styles/global.css`:

- The `url()` paths are **root-absolute on purpose**. `astro.config.mjs` sets `base: '/lab'`, but Vite does not apply that prefix to root-absolute `url()` in CSS (verified against a real build). Rewriting them to `/lab/fonts/...` would match *this* Worker's route and 404.
- The system fonts after Polymath in `--font-display` / `--font-body` are **load-bearing**, not decorative — they're what a fresh clone actually renders on.

## Development

Requires Node `>=22.12.0` (see `engines` in `package.json`).

| Command | Action |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the Astro dev server at `localhost:4321` |
| `npm run build` | Type-check (`astro check`) then build |
| `npm run test` | Run the Playwright E2E suite |
| `npm run preview` | Preview the production build locally |

Copy `.env.example` to `.env` (or `.dev.vars.example` to `.dev.vars` for `wrangler dev`) and fill in a [Last.fm API key](https://www.last.fm/api/account/create) and a [TheAudioDB API key](https://www.theaudiodb.com/api_guide.php).

## Deploy

Ships as a Cloudflare Worker, not Cloudflare Pages:

```sh
wrangler kv namespace create LASTFM_CHART_CACHE   # once, then paste the id into wrangler.toml
wrangler secret put LASTFM_API_KEY
wrangler secret put TADB_API_KEY
wrangler deploy
```

In production this Worker is routed at `studiocartelli.com/lab/*` via a Cloudflare Workers Route on the same zone as the main (private) `studio-cartelli` site — see that repo's deployment docs for the route configuration.

## License

MIT — see [LICENSE](./LICENSE).
