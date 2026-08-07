// Orchestrates scheduled KV cache warms with structured logging and a
// last-run status snapshot in KV for ops visibility (STC-108).

import type { PipelineEnv } from './pipeline-env';
import {
  warmFullChartArtistsCache,
  warmFullChartCache,
  warmFullChartTracksCache,
} from './fullchart-cache';
import { warmNetworkCache } from './network-cache';

export const CRON_STATUS_KEY = 'ops:cron:last';
const CRON_STATUS_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface CronTaskResult {
  name: string;
  ok: boolean;
  error?: string;
}

export interface CronRunStatus {
  ranAt: number;
  cron: string;
  tasks: CronTaskResult[];
}

const WARM_TASKS = [
  { name: 'fullChartAlbums', run: warmFullChartCache },
  { name: 'fullChartArtists', run: warmFullChartArtistsCache },
  { name: 'fullChartTracks', run: warmFullChartTracksCache },
  { name: 'network', run: warmNetworkCache },
] as const;

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runCronWarms(env: PipelineEnv, cron: string): Promise<CronRunStatus> {
  const tasks: CronTaskResult[] = [];

  await Promise.all(
    WARM_TASKS.map(async ({ name, run }) => {
      try {
        await run(env);
        tasks.push({ name, ok: true });
      } catch (err) {
        const error = formatError(err);
        console.error(`[cron] ${name} failed: ${error}`);
        tasks.push({ name, ok: false, error });
      }
    }),
  );

  const status: CronRunStatus = { ranAt: Date.now(), cron, tasks };
  const kv = env.LASTFM_CHART_CACHE;
  if (kv) {
    await kv.put(CRON_STATUS_KEY, JSON.stringify(status), {
      expirationTtl: CRON_STATUS_TTL_SECONDS,
    });
  }

  const failed = tasks.filter((task) => !task.ok);
  if (failed.length > 0) {
    console.error(`[cron] ${failed.length}/${tasks.length} warm task(s) failed`, JSON.stringify(failed));
  } else {
    console.log(`[cron] ${tasks.length} warm task(s) completed`);
  }

  return status;
}
