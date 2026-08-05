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
import type { ReplayOrchestrator } from './service/replay-orchestrator';
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
  /**
   * Required for the same reason as `auth`, and for one more: the stub this
   * replaced answered every resume with `replaying, count: 0`, which no client
   * could distinguish from "you missed nothing". An optional service would let
   * that answer come back by accident.
   */
  replay: ReplayOrchestrator;
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
        // A deliberate pure ack, not a stub. Every mutation in this product is
        // an HTTP call to be-01; a client message arriving over the socket is
        // acknowledged and carried no further, because there is no message the
        // socket is the authority for. The test asserting a forward records no
        // event and pushes nothing is what keeps this honest.
        onForward: () => Promise.resolve({ push_responses: [] }),
        onResume: (points) => opts.replay.replay(points),
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
