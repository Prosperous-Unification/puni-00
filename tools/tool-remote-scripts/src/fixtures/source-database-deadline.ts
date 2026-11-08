import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { runDockerCli } from '../lib/docker-deadline';
import { observeSourceDatabaseBindings } from '../lib/source-database-binding';
import { controlDeadlineClock } from './controlled-deadline-clock';
import { sourceDatabaseFixture } from './source-database-binding';
import { roots } from './source-startup';

const boundary = { started: false, settled: false, aborted: false };
let failedBoundary: { cause: unknown; cleanupStarted: number } | undefined;
let cleanupElapsedMs: number | undefined;
const nativeNow = performance.now.bind(performance);
// Setup consumes real IO time while the original 4000ms logical scope stays fixed.
// The actual installed observation timer aborts only after the owned CLI launch marker.
const clock = controlDeadlineClock();
const origin = clock.now();
try {
  const f = await sourceDatabaseFixture();
  const scope = await f
    .scoped(async (owner, source, solver, deadline) => {
      if (deadline !== origin + 4000) throw new Error('original scoped logical deadline changed');
      f.setIntercept(async (args, signal) => {
        if (boundary.started || args[0] !== 'ps') return;

        if (signal === undefined) throw new Error('original observation abort signal absent');
        signal.addEventListener(
          'abort',
          () => {
            boundary.aborted = true;
          },
          { once: true },
        );
        const marker = process.env['SOURCE_DEADLINE_LAUNCHED'];
        if (marker === undefined) throw new Error('fixture CLI launch marker absent');
        const cleanup = new AbortController();
        const joined = runDockerCli(args, AbortSignal.any([signal, cleanup.signal])).then(
          () => ({ kind: 'complete' as const }),
          (cause: unknown) => ({ kind: 'failed' as const, cause }),
        );
        try {
          await clock.waitFor(() => Bun.file(marker).exists(), 1000);
          boundary.started = true;
          if (
            !clock
              .timers()
              .some((timer) => timer.at === deadline && timer.origin.includes('readObserverDocker'))
          )
            throw new Error('original shared observation deadline timer absent');
          await clock.advance(deadline);
          if (!signal.aborted)
            throw new Error('original shared observation deadline did not abort');
        } catch (cause) {
          failedBoundary = { cause, cleanupStarted: nativeNow() };
          // Proof: omitting fallback with an isolated two-second stub failed the
          // one-second join bound. Missing-timer/abort controls join with original aborted=false.
          // This controller cleans up a failed fixture only; it never marks original abort proof.
          cleanup.abort();
        } finally {
          await joined;
          boundary.settled = true;
          if (failedBoundary !== undefined)
            cleanupElapsedMs = nativeNow() - failedBoundary.cleanupStarted;
        }
        if (failedBoundary !== undefined) throw failedBoundary.cause;
        const outcome = await joined;
        if (outcome.kind === 'failed') throw outcome.cause;
      });
      await rejects(
        observeSourceDatabaseBindings(
          owner,
          f.layouts,
          source,
          solver,
          f.pins,
          f.contents,
          f.docker,
          deadline,
        ),
        /source database binding refused/,
      );
      if (!boundary.settled) throw new Error('fixture CLI boundary returned before settlement');
    }, 4000)
    .then(
      () => ({ kind: 'complete' as const }),
      (cause: unknown) => ({ kind: 'failed' as const, cause }),
    );
  if (failedBoundary !== undefined) {
    console.log(JSON.stringify({ ...boundary, cleanupElapsedMs }));
    throw failedBoundary.cause;
  }
  if (scope.kind !== 'failed') throw new Error('original scoped deadline did not refuse');
  if (!boundary.started || !boundary.settled || !boundary.aborted)
    throw new Error('fixture CLI boundary did not abort and settle');
  console.log(JSON.stringify(boundary));
} finally {
  clock.restore();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
}
