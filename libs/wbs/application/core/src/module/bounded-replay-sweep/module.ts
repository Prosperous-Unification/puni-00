import { DiBag } from 'di-bag';

import type { EventLogStore } from '../../ports/event-log-store';
import type { PlanEventStore } from '../../ports/plan-event-store';
import type { Intervals } from '../../ports/timers';
import { BOUNDED_REPLAY_SWEEP_LABEL } from './contract';
import { RetentionTimer, type RetentionTimerOptions, type Swept } from './retention-timer';

/**
 * Bounded replay sweep as a sealed DI Bag module.
 *
 * Only `retention` is exported. `retentionOptions` stays private to each
 * installation, so a host cannot name it — resolving it answers
 * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
 * reported against `application.bounded-replay-sweep/retentionOptions` rather
 * than against an anonymous binding.
 *
 * `principal: { kind: 'internal' }` is fixed here rather than a host
 * requirement: `compose.ts` has only ever supplied this one value, and
 * `retention-timer.test.ts`'s every case constructs `RetentionTimer` directly
 * with it too, so no caller has ever varied it. `RetentionTimer` itself keeps
 * `principal` in its own options — this module chooses the value, it does not
 * change what the class accepts.
 *
 * The module registers no disposer, because nothing it owns has one: the
 * timer's own handle is started and stopped by `bootBe01`, exactly as before
 * this module existed. Its lifetime therefore stays the composition root's.
 */
export const boundedReplaySweepModule = DiBag.createBuilder()
  .register({
    retentionOptions: DiBag.fromSyncFactory(
      ({
        eventLog,
        planEvents,
        intervals,
        now,
        maxPerSubscription,
        planEventRetentionDays,
        intervalMs,
        onSweep,
        onError,
      }: {
        eventLog: EventLogStore;
        planEvents: PlanEventStore;
        intervals: Intervals;
        now: () => number;
        maxPerSubscription: number;
        planEventRetentionDays: number;
        intervalMs: number;
        onSweep: ((removed: Swept) => void) | undefined;
        onError: (err: unknown) => void;
      }): RetentionTimerOptions => ({
        principal: { kind: 'internal' },
        repo: eventLog,
        planEvents,
        maxPerSubscription,
        planEventRetentionDays,
        intervalMs,
        intervals,
        now,
        ...(onSweep === undefined ? {} : { onSweep }),
        onError,
      }),
    ),
  })
  .register({
    retention: DiBag.fromSyncFactory(
      ({ retentionOptions }: { retentionOptions: RetentionTimerOptions }): RetentionTimer =>
        new RetentionTimer(retentionOptions),
    ),
  })
  // Proof (2026-09-23): widening the key tuple to `['retention', 'retentionOptions']` left
  // `keeps its private bindings out of a host graph` and `labels its private bindings with the
  // module name` failing (3 pass, 3 fail) — `resolve('retentionOptions')` stopped throwing and
  // `inspectGraph()` reported the bare key `retentionOptions` with no label prefix.
  // Proof (2026-09-23): dropping `{ label: BOUNDED_REPLAY_SWEEP_LABEL }` left only the two label
  // tests failing (4 pass, 2 fail): `inspectGraph()` reported `retentionOptions` unlabelled, and a
  // missing requirement's message named `retentionOptions` instead of
  // `application.bounded-replay-sweep/retentionOptions`.
  .buildModule(['retention'], { label: BOUNDED_REPLAY_SWEEP_LABEL });
