import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { assertParkedBackendFenceUnderOwner } from './backend-exclusion';
import { inspectDependencyIngress } from './dependency-ingress';
import { type RunDocker, runDockerBefore } from './docker-deadline';
import { parseDockerInspection } from './docker-inspection-json';
import {
  assertDependencyOwner,
  type DependencyOwner,
  ownerDockerHashed,
  retainSolverRecord,
} from './edge-ownership';
import { assertSame, readFields, readIdentity, readRecord } from './managed-cohort';
import { parseSolverSnapshot } from './solver-cohort';
import {
  inspectExcludedSolverMembers,
  type SolverExclusion,
  type SolverLayouts,
} from './solver-exclusion';
import {
  decodeSourceDev,
  identifyParkedSourceInventory,
  identifySourceInventory,
} from './source-dev-cohort';
import {
  assertParkedSourceDev,
  inspectExcludedSourceMember,
  type SourceDevExclusion,
} from './source-dev-exclusion';

/** Captures private monitoring state inside the final protected scope; it conveys no namespace/storage admission. */
export async function captureParkedDependencies(
  owner: DependencyOwner,
  layouts: SolverLayouts,
  sha: string,
  source: SourceDevExclusion,
  solver: SolverExclusion,
  runDocker: RunDocker,
  deadline: number,
): Promise<{
  inspect(removed: ReadonlySet<string>): Promise<void>;
  removeSolvers(): Promise<ReadonlySet<string>>;
}> {
  const docker = ownerDockerHashed(owner, layouts.prod, runDocker);
  async function assertOwner(): Promise<void> {
    await assertDependencyOwner(owner, layouts.prod, sha);
    await assertDependencyOwner(owner, layouts.dev, sha);
    if (!Number.isFinite(deadline) || performance.now() >= deadline)
      throw new Error('parked dependency observation deadline exceeded');
  }
  async function inspectInventory(): Promise<unknown[]> {
    await assertOwner();
    const stdout = await runDockerBefore(
      ['ps', '-a', '--no-trunc', '--format', '{{.ID}}'],
      docker,
      deadline,
    );
    const ids = stdout.trim() === '' ? [] : stdout.trim().split('\n').map(readIdentity);
    if (ids.length === 0 || new Set(ids).size !== ids.length)
      throw new Error('parked dependency inventory is missing or duplicate');
    const inspected = parseDockerInspection(
      await runDockerBefore(['inspect', ...ids], docker, deadline),
    );
    if (!Array.isArray(inspected))
      throw new Error('parked dependency complete inventory is malformed');
    assertSame(
      [...ids].sort(),
      inspected.map((raw) => readIdentity(readFields(raw)['Id'])).sort(),
      'parked dependency complete inventory',
    );
    await assertOwner();
    return inspected.map((raw: unknown) => raw);
  }
  const initial = await inspectInventory();
  const sourceRaw = await inspectExcludedSourceMember(owner, layouts.prod, source, initial);
  const sourceMember = decodeSourceDev(sourceRaw, layouts.dev);
  const solverRaw = await inspectExcludedSolverMembers(owner, layouts.prod, solver, initial);
  const snapshots = solverRaw.map((raw) =>
    parseSolverSnapshot(raw, readIdentity(readFields(raw)['Id'])),
  );
  const solverIds = new Set(snapshots.map((snapshot) => snapshot.solver.id));
  const nonsolver = initial.filter((raw) => !solverIds.has(readIdentity(readFields(raw)['Id'])));
  const baseline = identifySourceInventory(nonsolver, sourceRaw);
  const records = await Promise.all(
    [
      ...['intent', 'complete'].map((label) =>
        join(layouts.dev.stateDir, `dependency-source-dev-${label}.json`),
      ),
      ...['backend', 'gateway'].flatMap((role) =>
        ['fence', 'intent', 'complete'].map((label) =>
          join(layouts.prod.stateDir, `dependency-${role}-${label}.json`),
        ),
      ),
    ].map(async (path) => ({ path, contents: await readRecord(path) })),
  );
  async function inspect(removed: ReadonlySet<string>): Promise<void> {
    await assertOwner();
    for (const id of removed)
      if (!solverIds.has(id)) throw new Error('parked solver removal set is foreign');
    const current = await inspectInventory();
    await assertParkedSourceDev(owner, layouts, sha, sourceMember, current, runDocker, deadline);
    // Proof: parked-inventory omission lost the first complete-membership boundary; new-participant test failed (exit 1).
    assertSame(
      baseline,
      identifyParkedSourceInventory(
        current.filter((raw) => !solverIds.has(readIdentity(readFields(raw)['Id']))),
        layouts.dev,
        sourceMember,
      ),
      'restoration exact parked participants',
    );
    const currentIds = new Set(current.map((raw) => readIdentity(readFields(raw)['Id'])));
    for (const snapshot of snapshots) {
      const id = snapshot.solver.id;
      if (removed.has(id)) {
        // Proof: removed-attempt-absence omission accepted no-op rm; composed noop-remove test failed (exit 1).
        if (currentIds.has(id)) throw new Error('removed parked solver remains present');
      } else {
        const raw = current.find((raw) => readFields(raw)['Id'] === id);
        if (raw === undefined) throw new Error('parked solver unexpectedly missing');
        assertSame(snapshot, parseSolverSnapshot(raw, id), 'restoration exact terminal solver');
      }
    }
    for (const record of records) {
      // Proof: parked-records omission admitted changed source evidence; source-record test failed (exit 1).
      assertSame(
        record.contents,
        await readRecord(record.path),
        'restoration retained participant bytes',
      );
      await assertOwner();
    }
    await assertParkedBackendFenceUnderOwner(owner, layouts.prod, sha, runDocker, deadline, {
      layout: layouts.dev,
      member: sourceMember,
    });
    await inspectDependencyIngress(owner, [layouts.prod, layouts.dev], runDocker, deadline);
    await assertOwner();
  }
  await inspect(new Set());
  return {
    inspect,
    removeSolvers: async () => {
      const removed = new Set<string>();
      for (const snapshot of snapshots) {
        await inspect(removed);
        await retainSolverRecord(owner, layouts, 'restore-complete', {
          phase: 'terminal-attempt-removal-intent',
          id: snapshot.solver.id,
          image: snapshot.solver.image,
          snapshotSha256: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
        });
        await runDockerBefore(['rm', snapshot.solver.id], docker, deadline);
        removed.add(snapshot.solver.id);
        await inspect(removed);
      }
      await inspect(removed);
      return removed;
    },
  };
}
