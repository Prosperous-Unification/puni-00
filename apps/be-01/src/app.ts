import { createLogger } from '@wbs/observability';
import { observabilityPlugin } from '@wbs/observability/server';
import { Elysia } from 'elysia';

import { authController } from './controller/auth.controller';
import { internalController } from './controller/internal.controller';
import { projectController } from './controller/project.controller';
import { smokeController } from './controller/smoke.controller';
import { workItemController } from './controller/work-item.controller';
import type { AuthService } from './service/auth.service';
import type { ProjectService } from './service/project.service';
import type { WorkItemService } from './service/work-item.service';

export interface AppOptions {
  migrationsApplied: boolean;
  /**
   * Required rather than optional. An optional auth service would let a
   * misconfigured process start with the registration and login routes simply
   * absent, answering 404 — indistinguishable from a routing fault at the edge.
   */
  auth: AuthService;
  /**
   * Required for the same reason as `auth`: an absent project service would
   * answer 404 on every project route, which reads as an edge misconfiguration
   * rather than a process built without its domain.
   */
  projects: ProjectService;
  /** Required for the same reason as `projects`. */
  workItems: WorkItemService;
  /**
   * Shared secret gw-01 presents on /internal/*. Required — a default here
   * would silently diverge from the value gw-01 loads from the environment,
   * failing every forward with a 401 that only shows up in a real deployment.
   */
  internalAuthSecret: string;
  version?: string;
}

export function buildApp(opts: AppOptions) {
  const logger = createLogger({ service: 'be-01', version: opts.version });

  return new Elysia()
    .use(observabilityPlugin({ service: 'be-01' }))
    .decorate('logger', logger)
    .use(smokeController)
    .use(authController(opts.auth))
    .use(projectController(opts.auth, opts.projects))
    .use(workItemController(opts.auth, opts.workItems))
    .use(
      internalController({
        secret: opts.internalAuthSecret,
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
