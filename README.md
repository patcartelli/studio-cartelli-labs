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

The main studiocartelli.com site self-hosts a paid, non-redistributable commercial font family. Those font files are **not** included in this repo (see `src/styles/global.css`) — this fork uses a system-font fallback stack instead, so a local clone won't look pixel-identical to the live site's chrome (nav/footer/headings). The actual experiments (chart, network, life) are unaffected.

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
