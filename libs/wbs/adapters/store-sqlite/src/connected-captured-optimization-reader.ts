import type { ConnectedOptimizedCapturedAdapter } from '@wbs/core/ports/scheduler';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import {
  type ConnectedCachedOutcome,
  readConnectedOptimizationPair,
} from './connected-optimization-cache';
import { connectedOptimizationReaderOf } from './connected-optimization-reader';
import {
  type OptimizedOutcomeTransaction,
  optimizedVariantIsLive,
} from './optimized-schedule-cache';

/** Borrow the supplied capture snapshot; never acquire a connection, admit work or settle its lifetime. */
export function connectedCapturedOptimizationReaderOf(
  db: SQLiteBunDatabase | OptimizedOutcomeTransaction,
  options: {
    readonly solverVersion: string;
    readonly budgetMs: number;
    readonly now: () => number;
  },
): ConnectedOptimizedCapturedAdapter {
  return connectedOptimizationReaderOf({
    ...options,
    readPair: ({ questions }) => {
      // Proof: substituting a fresh connection observed ready inside both retained snapshots after rival publication.
      const captured = readConnectedOptimizationPair(db, { questions });
      const now = options.now();
      const entry = (objective: 'pri' | 'time') => {
        const outcome: ConnectedCachedOutcome = captured.variants[objective];
        // Proof: dropping current inputHash correspondence made a different captured question pending.
        const live =
          captured.generationInputHash === questions[objective].inputHash &&
          captured.generation !== null &&
          optimizedVariantIsLive(db, questions[objective], captured.generation, objective, now);
        if (outcome.kind === 'miss') return { kind: live ? 'pending' : 'idle' } as const;
        if (outcome.kind === 'corrupt')
          return live
            ? { kind: 'retrying' as const }
            : { kind: 'corrupt' as const, message: outcome.message };
        if (outcome.kind === 'failed' && live) return { kind: 'retrying' } as const;
        return { kind: 'durable' as const, outcome: outcome.outcome };
      };
      return {
        generation: captured.generation,
        variants: { pri: entry('pri'), time: entry('time') },
      };
    },
  });
}
