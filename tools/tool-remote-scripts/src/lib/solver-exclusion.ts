import { createHash } from 'node:crypto';

import { type RunDocker, runDockerBefore } from './docker-deadline';
import { parseDockerInspection } from './docker-inspection-json';
import {
  assertDependencyOwner,
  assertDependencyOwnerDirectory,
  type DependencyOwner,
  ownerDockerHashed,
  ownerHostCommand,
  retainSolverRecord,
  withOwnerSolverRuntime,
} from './edge-ownership';
import type { EnvLayout } from './env';
import { assertSame, readDigest, readFields, readIdentity, readRecord } from './managed-cohort';
import {
  parseSolverContainer,
  parseSolverSnapshot,
  type SolverContainer,
  solverIdentity,
  solverInspectArgs,
  type SolverSnapshot,
} from './solver-cohort';
import {
  captureSolverTuple,
  decodeSolverPins,
  parseSolverUnit,
  type SolverPins,
  type SolverPorts,
} from './solver-host';
import { exactManagedContainerArgs, listManagedContainersArgs } from './solver-supervisor-command';
import { parseManagedContainerList } from './solver-supervisor-docker-output';

export interface SolverLayouts {
  readonly prod: EnvLayout;
  readonly dev: EnvLayout;
}

const exclusionIdentity: unique symbol = Symbol('solver-exclusion');
/** Live runtime-lock-scoped solver evidence; retained records grant no audit authority. */
export interface SolverExclusion {
  readonly [exclusionIdentity]: true;
}
interface SolverScope {
  readonly deadline: number;
  owner: DependencyOwner;
  layout: EnvLayout;
  snapshots: readonly SolverSnapshot[];
  inspect: () => Promise<void>;
}
const exclusions = new WeakMap<SolverExclusion, SolverScope>();

/** Requires the exact still-live operation deadline; this check grants no admission. */
export function assertSolverExclusionDeadline(
  owner: DependencyOwner,
  token: SolverExclusion,
  deadline: number,
): void {
  const scope = exclusions.get(token);
  // Proof: equality omission admitted a shorter live budget; expiry omission admitted its elapsed original budget. Both deadline-guard negatives failed.
  if (
    scope?.owner !== owner ||
    !Number.isFinite(deadline) ||
    deadline <= performance.now() ||
    deadline !== scope.deadline
  )
    throw new Error('solver exclusion deadline differs');
}

/**
 * Host-wide bounded solver exclusion only. Keeps the canonical runtime lock through
 * every protected continuation and final readback. Never restores, removes attempts,
 * cancels deadline backstops or grants activation. Legacy unguarded manual processes
 * still require a separately authorized live authority/adoption audit.
 */
export async function withSolverDrainUnderOwner<T>(
  owner: DependencyOwner,
  layouts: SolverLayouts,
  suppliedPins: SolverPins,
  ports: SolverPorts,
  deadline: number,
  action: (exclusion: SolverExclusion) => Promise<T>,
): Promise<T> {
  layouts = structuredClone(layouts);
  const pins = decodeSolverPins(suppliedPins);
  if (layouts.prod.env !== 'prod' || layouts.dev.env !== 'dev')
    throw new Error('solver requires both prod and dev layouts');
  async function assertOwner(): Promise<void> {
    // Proof: namespace/dev-owner faults admitted mismatched state or unowned dev in solver-exclusion.test.ts.
    await assertDependencyOwnerDirectory(owner, layouts.prod, ports.edgeState);
    await assertDependencyOwner(owner, layouts.dev);
    if (!Number.isFinite(deadline) || performance.now() >= deadline)
      throw new Error('solver drain deadline exceeded');
  }
  await assertOwner();
  // Proof: tuple fault admitted changed bytes before stop (solver-exclusion.test.ts).
  const installed = await captureSolverTuple(pins, ports.captureFile);
  await assertOwner();
  const host = ownerHostCommand(owner, layouts, ports.runHost);
  const show = () =>
    runDockerBefore(['show'], async (_args, signal) => host({ kind: 'show' }, signal), deadline);
  const initial = parseSolverUnit(await show(), true, ports.edgeState);
  const process = await ports.observeProcess(initial.pid);
  const observedInitialCgroup = await ports.observeCgroup(initial.cgroup, false);
  if (observedInitialCgroup === null) throw new Error('solver initial cgroup absent');
  const cgroup = observedInitialCgroup;
  if (
    process.pid !== initial.pid ||
    process.cgroup !== initial.cgroup ||
    !/^[0-9]+$/.test(process.startTime) ||
    !cgroup.populated
  )
    throw new Error('solver process/cgroup binding differs');
  await retainSolverRecord(owner, layouts, 'installed', {
    pins,
    installed,
    initial,
    process,
    cgroup,
  });
  // Proof: process-identity fault admitted changed start ticks before stop (solver-exclusion.test.ts).
  if (JSON.stringify(await ports.observeProcess(initial.pid)) !== JSON.stringify(process))
    throw new Error('solver initial process identity changed');
  if (
    JSON.stringify(await captureSolverTuple(pins, ports.captureFile)) !== JSON.stringify(installed)
  )
    throw new Error('solver installed tuple identity changed before stop');
  // Proof: stop-intent fault lost retained intent after timeout/owner loss (solver-exclusion.test.ts).
  await retainSolverRecord(owner, layouts, 'stop', { initial, process, cgroup });
  // Proof: stop fault left the effective unit active and failed the positive drain acceptance.
  await runDockerBefore(
    ['stop'],
    async (_args, signal) => host({ kind: 'stop' }, signal),
    deadline,
  );
  async function assertStopped(): Promise<void> {
    await assertOwner();
    // Proof: stop-readback fault admitted zero-exit stop with an active unit (solver-exclusion.test.ts).
    parseSolverUnit(await show(), false, ports.edgeState);
    const observed = await ports.observeCgroup(initial.cgroup, true);
    // Proof: cgroup fault admitted a surviving descendant before protected work (solver-exclusion.test.ts).
    if (
      observed !== null &&
      (observed.populated || observed.device !== cgroup.device || observed.inode !== cgroup.inode)
    )
      throw new Error('solver original cgroup is populated or changed');
    // Proof: tuple-inode fault accepted same-byte replacement after the callback (solver-exclusion.test.ts).
    if (
      JSON.stringify(await captureSolverTuple(pins, ports.captureFile)) !==
      JSON.stringify(installed)
    )
      throw new Error('solver installed tuple identity changed');
    await assertOwner();
  }
  await assertStopped();
  // Proof: runtime fault admitted protected work while the real manual-runtime flock was occupied.
  return withOwnerSolverRuntime(owner, layouts.prod, async () => {
    await assertStopped();
    const docker: RunDocker = ownerDockerHashed(owner, layouts.prod, async (args, signal) => {
      await assertDependencyOwner(owner, layouts.dev);
      const stdout = await ports.runDocker(args, signal);
      await assertDependencyOwner(owner, layouts.dev);
      return stdout;
    });
    const run = (args: string[]) => runDockerBefore(args, docker, deadline);
    async function discover(): Promise<string[]> {
      const labeled = parseManagedContainerList(await run(listManagedContainersArgs().slice(1)));
      const named = parseManagedContainerList(
        await run([
          'ps',
          '--all',
          '--no-trunc',
          '--filter',
          'name=^/wbs-solver-',
          '--format',
          '{{.ID}}',
        ]),
      );
      return [...new Set([...labeled, ...named])].sort();
    }
    const imageRefs = [...new Set(installed.flatMap((file) => file.solverImages ?? []))].sort();
    if (imageRefs.length === 0) throw new Error('solver pinned config image authority is absent');
    const imageBindings = new Map<string, string>();
    for (const ref of imageRefs) {
      const observed = await run(['image', 'inspect', '--format', '{{.Id}}', ref]);
      if (!/^sha256:[a-f0-9]{64}\n?$/.test(observed))
        throw new Error('solver configured image resolution is malformed');
      imageBindings.set(ref, readDigest(observed.trim()));
    }
    function assertImage(container: SolverContainer): void {
      // Proof: image fault admitted unreviewed digest/immutable identity before kill (solver-exclusion.test.ts).
      if (imageBindings.get(container.imageRef) !== container.image)
        throw new Error(
          'solver cohort image differs from pinned config and immutable image identity',
        );
    }
    const ids = await discover();
    const cohort: SolverContainer[] = [];
    for (const id of ids) {
      const original = parseSolverContainer(await run(solverInspectArgs(id).slice(1)), id);
      assertImage(original);
      let terminal = original;
      if (original.phase === 'running') {
        try {
          // Proof: kill fault left a running child and failed the positive drain acceptance.
          await run(exactManagedContainerArgs('kill', id).slice(1));
        } catch (cause) {
          // Recovery is modeled only for an independently observed terminal same-container race.
          await assertOwner();
          const raced = parseSolverContainer(await run(solverInspectArgs(id).slice(1)), id);
          if (raced.phase !== 'terminal' || solverIdentity(raced) !== solverIdentity(original))
            throw cause;
        }
        const wait = await run(exactManagedContainerArgs('wait', id).slice(1));
        if (!/^(?:0|[1-9][0-9]*)\n?$/.test(wait)) throw new Error('solver wait exit is malformed');
        terminal = parseSolverContainer(await run(solverInspectArgs(id).slice(1)), id);
        // Proof: terminal fault admitted a running Docker child after creator stop (solver-exclusion.test.ts).
        if (
          terminal.phase !== 'terminal' ||
          terminal.exitCode !== Number(wait.trim()) ||
          solverIdentity(terminal) !== solverIdentity(original)
        )
          throw new Error('solver terminal drain evidence differs');
      }
      cohort.push(terminal);
    }
    async function assertDrained(): Promise<void> {
      await assertStopped();
      // Proof: membership fault returned success after a new/missing member (solver-exclusion.test.ts).
      if (JSON.stringify(await discover()) !== JSON.stringify(ids))
        throw new Error('solver cohort membership changed');
      for (const retained of cohort) {
        const current = parseSolverContainer(
          await run(solverInspectArgs(retained.id).slice(1)),
          retained.id,
        );
        if (current.phase === 'running' || JSON.stringify(current) !== JSON.stringify(retained))
          throw new Error('solver terminal cohort evidence changed');
      }
      await assertOwner();
    }
    await assertDrained();
    async function captureSnapshots(): Promise<SolverSnapshot[]> {
      const snapshots: SolverSnapshot[] = [];
      for (const retained of cohort) {
        const inspected: unknown = parseDockerInspection(await run(['inspect', retained.id]));
        if (!Array.isArray(inspected) || inspected.length !== 1)
          throw new Error('solver full inspection requires exact member');
        const snapshot = parseSolverSnapshot(inspected[0], retained.id);
        assertSame(retained, snapshot.solver, 'solver projected/full inspection');
        snapshots.push(snapshot);
      }
      return snapshots;
    }
    const snapshots = await captureSnapshots();
    const record = await retainSolverRecord(owner, layouts, 'drained', {
      installed,
      imageBindings: Object.fromEntries(imageBindings),
      cohort,
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.solver.id,
        sha256: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      })),
    });
    async function inspect(): Promise<void> {
      await assertDrained();
      // Proof: byte-check omission admitted changed drained records; final full inspection/byte test failed (exit 1).
      if ((await readRecord(record.path)) !== record.contents)
        throw new Error('solver retained drained bytes changed');
      assertSame(snapshots, await captureSnapshots(), 'solver full terminal snapshot');
      await assertDrained();
    }
    await inspect();
    const token: SolverExclusion = Object.freeze({ [exclusionIdentity]: true as const });
    exclusions.set(token, { deadline, owner, layout: layouts.prod, snapshots, inspect });
    try {
      return await action(token);
    } finally {
      try {
        // Proof: final-inspection omission admitted full Config/retained-byte changes; final full inspection test failed.
        await inspect();
        await retainSolverRecord(owner, layouts, 'complete', {
          installed,
          imageBindings: Object.fromEntries(imageBindings),
          cohort,
          snapshots: snapshots.map((snapshot) => ({
            id: snapshot.solver.id,
            sha256: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
          })),
        });
      } finally {
        // Proof: expiry omission made returned token usable; solver token callback/lifetime test failed (exit 1).
        exclusions.delete(token);
      }
    }
  });
}

/** Recognize only exact raw members of this full inventory after live runtime/unit/cohort and retained-byte checks. */
export async function inspectExcludedSolverMembers(
  owner: DependencyOwner,
  layout: EnvLayout,
  token: SolverExclusion,
  inventory: readonly unknown[],
): Promise<readonly unknown[]> {
  const scope = exclusions.get(token);
  // Proof: owner-check omission admitted foreign owner; solver foreign-owner recognition test failed (exit 1).
  if (scope?.owner !== owner) throw new Error('solver exclusion is not live for owner');
  assertSame(scope.layout, layout, 'solver audit layout');
  await scope.inspect();
  const members: unknown[] = [];
  const observed = new Set<string>();
  for (const raw of inventory) {
    const container = readFields(raw);
    const id = readIdentity(container['Id']);
    if (observed.has(id)) throw new Error('solver audit duplicate inventory identity');
    observed.add(id);
    const config = readFields(container['Config']);
    const labels = config['Labels'] === null ? {} : readFields(config['Labels']);
    const name = container['Name'];
    const snapshot = scope.snapshots.find((member) => member.solver.id === id);
    const candidate =
      labels['wbs-managed-solver'] !== undefined ||
      (typeof name === 'string' && name.startsWith('/wbs-solver-'));
    if (snapshot === undefined) {
      // Proof: candidate-guard omission admitted an extra full-ID attempt; new-member recognition test failed.
      if (candidate) throw new Error('solver audit unexpected member');
      continue;
    }
    // Proof: comparison omission admitted Config/mount/start/image changes; all four live recognition negatives failed.
    assertSame(snapshot, parseSolverSnapshot(raw, id), 'solver audit full inventory member');
    members.push(raw);
  }
  // Proof: membership-guard omission admitted a missing attempt; missing-member recognition test failed.
  if (members.length !== scope.snapshots.length)
    throw new Error('solver audit missing captured inventory member');
  await scope.inspect();
  // Proof: final live-scope omission returned in-flight solver proof after runtime release; gated solver recognition negative failed.
  if (exclusions.get(token) !== scope)
    throw new Error('solver exclusion is not live after inspection');
  return members;
}
