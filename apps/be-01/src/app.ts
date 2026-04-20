import { createLogger } from '@wbs/observability';
import { observabilityPlugin } from '@wbs/observability/server';
import { Elysia } from 'elysia';

import { internalController } from './controller/internal.controller';
import { smokeController } from './controller/smoke.controller';

export interface AppOptions {
  migrationsApplied: boolean;
  version?: string;
  internalAuthSecret?: string;
}

const DEV_INTERNAL_SECRET = 'development-secret-32-characters!!!';

export function buildApp(opts: AppOptions) {
  const logger = createLogger({ service: 'be-01', version: opts.version });

  return new Elysia()
    .use(observabilityPlugin({ service: 'be-01' }))
    .decorate('logger', logger)
    .use(smokeController)
    .use(
      internalController({
        secret: opts.internalAuthSecret ?? DEV_INTERNAL_SECRET,
        onForward: () => Promise.resolve({ push_responses: [] }),
        onResume: (points) => {
          const out: Record<string, { status: 'replaying'; count: number }> = {};
          for (const sub of Object.keys(points)) {
            out[sub] = { status: 'replaying', count: 0 };
          }
          return Promise.resolve(out);
        },
      }),
    )
    .get('/health', ({ set }) => {
      if (!opts.migrationsApplied) {
        set.status = 503;
        return { status: 'migrating' };
      }
      return { status: 'ok' };
    });
}
