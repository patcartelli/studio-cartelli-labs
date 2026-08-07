// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  site: 'https://studiocartelli.com',
  // No `base` config: pages already live under src/pages/lab/*, which
  // naturally routes to /lab/* — same as the main repo. Setting `base`
  // here would double-prefix routes to /lab/lab/*.
  // Preserved from the main site: old /experiments links still redirect
  // through to /lab/* even after the split (labs-split Phase 1).
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
