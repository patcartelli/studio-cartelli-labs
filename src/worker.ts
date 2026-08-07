// src/worker.ts
// Custom Worker entrypoint: delegates HTTP requests to the Astro SSR handler
// and warms the full-chart + network KV caches on the */5 cron trigger.
import { handle } from '@astrojs/cloudflare/handler';
import { runCronWarms } from './lib/cron-warm';
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
    }
  },
} satisfies ExportedHandler<PipelineEnv>;
