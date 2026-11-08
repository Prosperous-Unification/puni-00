import { basename, dirname } from 'node:path';

import { runDockerBefore } from './docker-deadline';
import {
  assertDependencyOwner,
  type DependencyOwner,
  ownerDockerHashed,
  ownerHostCommand,
  publishRestoringEdgePolicy,
  retainSolverRecord,
} from './edge-ownership';
import {
  captureEdgePolicy,
  captureSolverRestorationCompletion,
  type EdgePolicySnapshot,
} from './edge-policy';
import { assertSame } from './managed-cohort';
import type { captureParkedDependencies } from './parked-dependencies';
import type { SolverLayouts } from './solver-exclusion';
import {
  captureSolverTuple,
  parseSolverUnit,
  type SolverFile,
  type SolverPins,
  type SolverRestorePorts,
} from './solver-host';
import {
  assertRetainedSolverRestoration,
  resolveSolverImages,
  type RetainedSolverRestoration,
} from './solver-restoration';

/**
 * Starts only the newly retained compatible solver after constituent finalizers.
 * The ready snapshot comes from the exact final-ready producer return and retains
 * its bytes and file identity. Its monitor remains usable under the original
 * outer owner after product startup; it does not require products to stay stopped.
 * @throws on lost ownership, pinned identity, policy, publication or readiness.
 */
export async function restoreSolverUnderOwner(
  owner: DependencyOwner,
  layouts: SolverLayouts,
  pins: SolverPins,
  ports: SolverRestorePorts,
  deadline: number,
  original: EdgePolicySnapshot,
  prepared: {
    readonly parked: Awaited<ReturnType<typeof captureParkedDependencies>>;
    readonly intent: RetainedSolverRestoration;
    readonly installed: readonly SolverFile[];
  },
) {
  const { prod } = layouts;
  const directory = ports.edgeState;
  await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
  await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
  await assertRetainedSolverRestoration(owner, prepared.intent);
  // Exclusion tokens and solver-runtime description have expired; outer owner locks remain live.
  const removed = await prepared.parked.removeSolvers();
  await prepared.parked.inspect(removed);
  await publishRestoringEdgePolicy(owner, original, prepared.intent);
  const published = await captureEdgePolicy(directory);
  const host = ownerHostCommand(owner, layouts, ports.runHost);
  await runDockerBefore(['start'], (_args, signal) => host({ kind: 'start' }, signal), deadline);
  const observeRestoredSolver = async () => {
    const unit = parseSolverUnit(
      await runDockerBefore(['show'], (_args, signal) => host({ kind: 'show' }, signal), deadline),
      true,
      ports.edgeState,
    );
    const process = await ports.observeProcess(unit.pid);
    const cgroup = await ports.observeCgroup(unit.cgroup, false);
    // Proof: restored-process omission admitted foreign process cgroup; composed process test failed (exit 1).
    if (
      process.pid !== unit.pid ||
      process.cgroup !== unit.cgroup ||
      !/^[0-9]+$/.test(process.startTime) ||
      cgroup?.populated !== true
    )
      throw new Error('restored solver service process or cgroup differs');
    assertSame(
      prepared.installed,
      await captureSolverTuple(pins, ports.captureFile),
      'restored solver installed tuple',
    );
    const envelope = await assertRetainedSolverRestoration(owner, prepared.intent);
    const docker = ownerDockerHashed(owner, prod, ports.runDocker);
    // Proof: restored-mapping omission admitted changed immutable resolution; composed mapping test failed (exit 1).
    assertSame(
      envelope.record.images,
      await resolveSolverImages(
        prepared.installed.flatMap((file) => file.solverImages ?? []),
        docker,
        deadline,
      ),
      'restored solver mapping',
    );
    return { unit, process, cgroup };
  };
  const first = await observeRestoredSolver();
  await runDockerBefore(
    ['connect-solver'],
    async (_args, signal) => {
      // Proof: restored-socket omission accepted refused listener readiness; composed socket test failed (exit 1).
      await ports.connectSocket(signal);
      return '';
    },
    deadline,
  );
  // Proof: readiness-process-recheck omission admitted changed start ticks; process-drift test failed (exit 1).
  assertSame(first, await observeRestoredSolver(), 'restored solver service readiness identity');
  await prepared.parked.inspect(removed);
  // Proof: final-policy omission under the scoped 20 s budget produced Expected true / Received false in policy-after-start (exit 1); the earlier timeout is unverified history.
  assertSame(published, await captureEdgePolicy(directory), 'restored solver retained policy');
  const publication = await retainSolverRecord(owner, layouts, 'restore-complete', {
    phase: 'solver-ready-participants-fenced',
    observed: first,
  });

  const readySnapshot = await captureSolverRestorationCompletion(
    dirname(publication.path),
    basename(publication.path),
  );
  // Proof: omitting this equality accepted changed actual producer bytes;
  // 'solver-first backend refuses changed ready publication bytes' failed its
  // refusal assertion, then passed with the exact comparison restored.
  assertSame(publication.contents, readySnapshot.contents, 'actual solver ready publication bytes');
  // Proof: omitting both monitor readbacks made the first missing-file check in
  // 'solver-first backend refuses ready record faults and terminal retry' fail
  // its refusal assertion; exact restoration passed. Other faults were ordinary coverage.
  const inspectReadyRecord = async () => {
    assertSame(
      readySnapshot,
      await captureSolverRestorationCompletion(
        dirname(publication.path),
        basename(publication.path),
      ),
      'retained actual solver ready publication',
    );
  };

  return {
    removed,
    policy: published,
    readySnapshot,
    inspectReady: async () => {
      await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
      await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
      await inspectReadyRecord();
      assertSame(first, await observeRestoredSolver(), 'restored solver retained process');
      await runDockerBefore(
        ['connect-solver'],
        async (_args, signal) => {
          await ports.connectSocket(signal);
          return '';
        },
        deadline,
      );
      assertSame(first, await observeRestoredSolver(), 'restored solver retained readiness');
      assertSame(published, await captureEdgePolicy(directory), 'restored solver retained policy');
      await inspectReadyRecord();
    },
  };
}
