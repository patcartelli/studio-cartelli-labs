// Stable strings for external uptime monitors (keyword / content checks).
// See docs/monitoring.md for monitor configuration.
//
// Forked from the main studio-cartelli repo during the labs-split scaffold
// (Phase 1, D-05 chrome fork). Only the 'chart' marker is relevant here —
// 'home' and 'unlock' markers live in the private repo.

export const UPTIME_MARKERS = {
  chart: 'uptime:studio-cartelli-labs-chart',
} as const;

export type UptimeMarkerKey = keyof typeof UPTIME_MARKERS;

/** Recommended User-Agent for monitors — avoids Cloudflare bot-protection 403s. */
export const UPTIME_MONITOR_USER_AGENT =
  'Mozilla/5.0 (compatible; StudioCartelliLabs-Uptime/1.0; +https://studiocartelli.com)';
