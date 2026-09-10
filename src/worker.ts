// src/worker.ts
// Custom Worker entrypoint: delegates HTTP requests to the Astro SSR handler
// and warms the full-chart + network KV caches on the */5 cron trigger, plus
// a network-only "fast lane" on the every-minute trigger (STC-332 follow-up).
import { handle } from '@astrojs/cloudflare/handler';
import { runCronWarms } from './lib/cron-warm';
import { warmNetworkCache } from './lib/network-cache';
import type { PipelineEnv } from './lib/pipeline-env';

export default {
  async fetch(request: Request, env: PipelineEnv, ctx: ExecutionContext): Promise<Response> {
    return handle(request, env, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env: PipelineEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    if (controller.cron === '*/5 * * * *') {
      ctx.waitUntil(runCronWarms(env, controller.cron));
    } else if (controller.cron === '* * * * *') {
      // STC-332 follow-up: NETWORK_WARM_PERIODS grew from 1 period to 5, but
      // warmNetworkCache only advances one non-fresh period per invocation
      // (each chunk already runs close to the shared subrequest budget --
      // see network-cache.ts). On the shared */5 schedule alone, a cold
      // start across all 5 periods could take on the order of hours. This
      // every-minute trigger calls warmNetworkCache directly (not
      // runCronWarms) so it never shares its budget with the fullchart
      // warmers and can safely run every minute, cutting cold-start
      // convergence roughly 5x.
      //
      // Revisit: this fast lane doesn't feed the ops status snapshot
      // (CRON_STATUS_KEY) the way runCronWarms does; it has no backoff once
      // every period is warm (an all-fresh tick is cheap -- just
      // NETWORK_WARM_PERIODS.length KV reads -- but running it forever at
      // this cadence is more than steady-state warming needs); and it can
      // race the */5 tick's own warmNetworkCache call when both land in the
      // same minute (harmless under the current cursor-based KV design,
      // just occasionally duplicated chunk work). None of this is urgent,
      // but worth a proper look if warming ever needs to be more efficient
      // or more observable than this.
      ctx.waitUntil(
        warmNetworkCache(env).catch((err) => {
          console.error(
            '[cron] warmNetworkCache (fast lane) failed:',
            err instanceof Error ? err.message : err
          );
        })
      );
    }
  },
} satisfies ExportedHandler<PipelineEnv>;
