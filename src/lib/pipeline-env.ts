// src/lib/pipeline-env.ts
// Shared Cloudflare Worker env type used by worker.ts and the KV-backed chart/artist caches.

export interface PipelineEnv {
  LASTFM_CHART_CACHE?: KVNamespace;
  LASTFM_API_KEY?: string;
  LASTFM_USERNAME?: string;
  // Added during the labs-split scaffold (Phase 1, D-04): chart.astro reads
  // this directly via cloudflare:workers `env` without it being in the
  // shared type in the original repo. Fixed here rather than carried forward.
  TADB_API_KEY?: string;
}
