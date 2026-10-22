import type {
  CapturedScheduler,
  ConnectedOptimizedCapturedAdapter,
} from '@wbs/core/ports/scheduler';

import { capturedOptimizationReaderOf } from './captured-optimization-reader';
import type { ChainSnapshotOptions } from './chain-snapshot';
import { connectedCapturedOptimizationReaderOf } from './connected-captured-optimization-reader';
import type { Drizzle } from './db';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';

/**
 * Borrow one observation for scheduling and exact connected cache questions.
 * The caller owns transaction settlement and capability expiry. Connected reads
 * require an explicit private opt-in; production callers omit it until runtime
 * admission, terminal events, Retry and restart support are integrated.
 * @internal
 */
export function capturedSchedulerIn(
  db: Drizzle,
  options: Pick<ChainSnapshotOptions, 'schedulerOf' | 'optimization'>,
  lifetime: ReadSnapshotLifetime,
  connected?: {
    readonly solverVersion: string;
    readonly budgetMs: number;
    readonly now: () => number;
  },
): {
  readonly scheduler: CapturedScheduler;
  readonly connected: ConnectedOptimizedCapturedAdapter | undefined;
} {
  // Proof: `expires retained acquisition` accepted a new scheduler when this check was removed.
  lifetime.assertOpen();
  const readCaptured =
    options.optimization === undefined
      ? undefined
      : capturedOptimizationReaderOf(db, options.optimization);
  const scheduler = options.schedulerOf(
    readCaptured === undefined
      ? undefined
      : (ask) => {
          // Proof: `expires retained local callback` returned idle when this check was removed.
          lifetime.assertOpen();
          return readCaptured(ask);
        },
  );
  // Proof: `without the private explicit opt-in` exposed capability when a default reader was forced.
  // Proof: `connected selections` saw ready inside held snapshots with a fresh connection, and write count 1 after injected admission.
  const reader =
    connected === undefined ? undefined : connectedCapturedOptimizationReaderOf(db, connected);
  return {
    scheduler: {
      supports: (engine) => {
        // Proof: `expires retained supports` returned true when this check was removed.
        lifetime.assertOpen();
        return scheduler.supports(engine);
      },
      readResolvedFast: (input) => {
        // Proof: `expires retained resolved Fast` materialized a schedule when this check was removed.
        lifetime.assertOpen();
        return scheduler.readResolvedFast(input);
      },
      read: (ask) => {
        // Proof: `expires retained local schedule` returned a schedule when this check was removed.
        lifetime.assertOpen();
        return scheduler.read(ask);
      },
    },
    connected:
      reader === undefined
        ? undefined
        : {
            readConnectedCaptured: (ask) => {
              // Proof: `expires retained connected callback` returned idle when this check was removed.
              lifetime.assertOpen();
              return reader.readConnectedCaptured(ask);
            },
          },
  };
}
