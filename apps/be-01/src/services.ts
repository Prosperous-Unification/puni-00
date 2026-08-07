import type { Logger } from '@wbs/observability';

import type { Drizzle } from './repository/db';
import { DependencyRepository } from './repository/dependency';
import { DirectoryRepository } from './repository/directory';
import { EstimateRepository } from './repository/estimate';
import { DrizzleEventLogRepo } from './repository/event-log';
import { ProjectRepository } from './repository/project';
import { UserRepository } from './repository/user';
import { SubtreeRepository, WorkItemRepository } from './repository/work-item';
import { AuthService } from './service/auth.service';
import { DirectoryService } from './service/directory.service';
import { EventSequencer } from './service/event-sequencer';
import { GatewayBroadcaster } from './service/gateway-broadcaster';
import { ProjectService } from './service/project.service';
import { PushClient } from './service/push-client';
import { ReplayBuffer } from './service/replay-buffer';
import { ReplayOrchestrator } from './service/replay-orchestrator';
import { RetentionTimer } from './service/retention-timer';
import { WorkItemService } from './service/work-item.service';

/**
 * How much of the event stream is kept, and how often.
 *
 * Constants rather than configuration: nothing about an environment changes the
 * right answer, and a knob nobody sets is a knob nobody keeps correct. The
 * buffer is the fast path for a reconnect within minutes; the log is what a
 * longer absence falls back to.
 */
const EVENT_LOG_MAX_PER_SUBSCRIPTION = 1_000;
const RETENTION_INTERVAL_MS = 10 * 60_000;
const REPLAY_BUFFER_MAX_AGE_MS = 5 * 60_000;

export interface ServicesOptions {
  db: Drizzle;
  logger: Logger;
  jwtKey: string;
  gwUrl: string;
  internalAuthSecret: string;
}

export interface BeServices {
  auth: AuthService;
  projects: ProjectService;
  directory: DirectoryService;
  workItems: WorkItemService;
  replay: ReplayOrchestrator;
  retention: RetentionTimer;
}

/**
 * Everything be-01 runs, built once and wired together.
 *
 * It is a function rather than the body of `main.ts` so the wiring itself can be
 * asserted. Two of this change's guarantees live only here and nowhere else: the
 * broadcaster and the replay orchestrator must share **one** `ReplayBuffer`, and
 * the retention timer must actually be constructed against the same log the
 * orchestrator reads. Both were previously provable about the classes and not
 * about the process — which is the failure `AGENTS.md` R5 exists to catch, and
 * exactly what a reviewer caught here.
 */
export function buildServices(opts: ServicesOptions): BeServices {
  const projectStore = new ProjectRepository(opts.db);
  const directoryStore = new DirectoryRepository(opts.db);
  const eventLog = new DrizzleEventLogRepo(opts.db);

  // One buffer, shared by the two halves of resume: the broadcaster fills it as
  // it publishes, the orchestrator serves reconnects from it. Two buffers would
  // both look healthy and one of them would always be empty.
  const replayBuffer = new ReplayBuffer({
    maxPerSubscription: EVENT_LOG_MAX_PER_SUBSCRIPTION,
    maxAgeMs: REPLAY_BUFFER_MAX_AGE_MS,
  });

  return {
    auth: new AuthService({
      users: new UserRepository(opts.db),
      jwtKey: opts.jwtKey,
    }),
    projects: new ProjectService({ projects: projectStore }),
    directory: new DirectoryService({ directory: directoryStore }),
    workItems: new WorkItemService({
      workItems: new WorkItemRepository(opts.db),
      projects: projectStore,
      estimates: new EstimateRepository(opts.db),
      dependencies: new DependencyRepository(opts.db),
      directory: directoryStore,
      // The one store that writes across all four of the tables above, because
      // a duplicated subtree is one act — see {@link SubtreeRepository}.
      subtrees: new SubtreeRepository(opts.db),
      broadcast: new GatewayBroadcaster({
        sequencer: new EventSequencer(eventLog),
        buffer: replayBuffer,
        push: new PushClient({ gwUrl: opts.gwUrl, secret: opts.internalAuthSecret }),
        // The event is already in the durable log and the mutation already
        // committed, so a client that reconnects still gets it on replay.
        // Failing the request here would tell the caller their edit did not
        // happen when it did.
        onPushFailed: (err, subscription) => {
          opts.logger.warn({ err, subscription }, 'project event recorded but not pushed');
        },
      }),
    }),
    replay: new ReplayOrchestrator({ log: eventLog, buffer: replayBuffer }),
    retention: new RetentionTimer({
      repo: eventLog,
      maxPerSubscription: EVENT_LOG_MAX_PER_SUBSCRIPTION,
      intervalMs: RETENTION_INTERVAL_MS,
      onSweep: (removed) => {
        if (removed > 0) opts.logger.info({ removed }, 'event log pruned');
      },
      // Reported, not swallowed: the log growing without bound is the failure
      // the timer exists to prevent, and a dead sweep looks healthy from outside.
      onError: (err) => {
        opts.logger.error({ err }, 'event log retention sweep failed');
      },
    }),
  };
}
