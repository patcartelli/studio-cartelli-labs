// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  site: 'https://studiocartelli.com',
  // STC-205 Phase 2 fix: base:'/lab' with pages living at the root of
  // src/pages/ (moved out of src/pages/lab/ during this fix). Astro's own
  // generated asset URLs (/_astro/*.css, /_astro/*.js) automatically pick
  // up this prefix, which is the actual bug the first cutover attempt hit —
  // those assets are site-root-relative without `base`, so they fell
  // outside the studiocartelli.com/lab* Workers Route pattern and were
  // caught by the OLD studio-cartelli Worker instead.
  //
  // IMPORTANT: `base` does NOT auto-rewrite hand-written string literals
  // (href="/...", fetch('/api/...')) — only Astro's own generated asset
  // tags and internal routing. Nav.astro's href="/" and href="/about" are
  // deliberately left unprefixed: they point at the MAIN site's real pages
  // (outside this Worker's route scope), not at anything under /lab.
  // lab-entries.ts hrefs and Footer's "/lab" link are already correct
  // final URLs, so also left as-is. chart.astro's client-side fetch() calls
  // to this repo's own /api/* routes DO need manual base-prefixing (see
  // that file) since those routes move under /lab/api/* along with
  // everything else once `base` is set.
  //
  // `redirects` asymmetry confirmed live: the SOURCE keys below ARE
  // matched base-relative (requesting /lab/experiments correctly hits the
  // '/experiments' entry), but `destination` values are NOT auto-prefixed
  // — a destination of '/' actually redirected to the bare site root
  // instead of '/lab'. Destinations must be written as the real final URL.
  base: '/lab',
  redirects: {
    '/experiments': { status: 301, destination: '/lab' },
    '/experiments/chart': { status: 301, destination: '/lab/chart' },
    '/experiments/network': { status: 301, destination: '/lab/network' },
  },
  integrations: [
    sitemap(),
  ],
  vite: {
    server: {
      allowedHosts: ['.trycloudflare.com'],
    },
  },
});
