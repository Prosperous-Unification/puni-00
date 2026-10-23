import { fenceBackendsUnderOwner, inspectBackendFenceUnderOwner } from './backend-exclusion';
import { fenceDependencyIngress, inspectDependencyIngress } from './dependency-ingress';
import type { RunDocker } from './docker-deadline';
import { runDockerBefore } from './docker-deadline';
import { type DockerExec, runDockerExec } from './docker-exec';
import { edgeStateDirectory } from './edge-admission';
import {
  type DependencyOwner,
  type DependencyOwnerPlan,
  ownerDockerHashed,
  ownerHostCommand,
  publishRestoringEdgePolicy,
  retainSolverRecord,
  withDependencyOwner,
} from './edge-ownership';
import { captureEdgePolicy, decodeOrdinaryEdgePolicy } from './edge-policy';
import { fenceGatewaysUnderOwner, inspectGatewayFenceUnderLock } from './gateway-exclusion';
import { assertSame } from './managed-cohort';
import { verifyContainerNamespace } from './mount-audit';
import { captureParkedDependencies } from './parked-dependencies';
import type { SolverExclusion, SolverLayouts } from './solver-exclusion';
import { withSolverDrainUnderOwner } from './solver-exclusion';
import {
  captureSolverTuple,
  decodeSolverPins,
  parseSolverUnit,
  SOLVER_EDGE_STATE,
  type SolverPins,
  type SolverPorts,
  type SolverRestorePorts,
} from './solver-host';
import {
  assertRetainedSolverRestoration,
  resolveSolverImages,
  retainCompatibleSolverIntent,
} from './solver-restoration';
import {
  inspectSourceDevExclusion,
  type SourceDevExclusion,
  withSourceDevExcluded,
} from './source-dev-exclusion';

/**
 * First owner slice only. Retains all ownership and fence records on every exit.
 * No complete participant proof, storage activation, restoration or exposure is produced.
 */
export async function excludeManagedDependencies(
  plan: DependencyOwnerPlan,
  runDocker: RunDocker,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
  directory = edgeStateDirectory(),
  execDocker: DockerExec = runDockerExec,
) {
  return excludeDependencies('managed', plan, runDocker, namespaceProof, directory, execDocker);
}

async function excludeDependencies(
  mode: 'managed' | 'ingress-managed',
  plan: DependencyOwnerPlan,
  runDocker: RunDocker,
  namespaceProof: typeof verifyContainerNamespace,
  directory: string,
  execDocker: DockerExec,
) {
  plan = structuredClone(plan);
  return withDependencyOwner(
    plan,
    async (owner) => {
      const deadline = performance.now() + 60000;
      if (mode === 'ingress-managed')
        await fenceDependencyIngress(owner, plan.layouts, runDocker, deadline);
      for (const layout of [...plan.layouts].sort((left, right) =>
        left.env === right.env ? 0 : left.env === 'prod' ? -1 : 1,
      )) {
        await fenceGatewaysUnderOwner(owner, layout, plan.sha, runDocker, deadline);
        await fenceBackendsUnderOwner(
          owner,
          layout,
          plan.sha,
          runDocker,
          deadline,
          namespaceProof,
          execDocker,
        );
      }
      if (mode === 'ingress-managed')
        await inspectDependencyIngress(owner, plan.layouts, runDocker, deadline);
      return {
        state: 'managed-excluded' as const,
        activation: 'blocked' as const,
        unresolved: [
          'installed-writer-adoption',
          'ingress',
          'MCP',
          'solver',
          'replay-background',
          'restart-authority',
          'atomic-activation',
          'compatible-restoration',
        ],
      };
    },
    directory,
  );
}

/** Explicit ingress-inclusive slice; the ordinary managed-only entrypoint retains its behavior. */
export async function excludeIngressAndManagedDependencies(
  plan: DependencyOwnerPlan,
  runDocker: RunDocker,
) {
  return excludeDependencies(
    'ingress-managed',
    plan,
    runDocker,
    verifyContainerNamespace,
    edgeStateDirectory(),
    runDockerExec,
  );
}

/** Explicit callable solver interval; callers must enclose all remaining protected work. */
export async function excludeSolverUnderDependencyOwner<T>(
  plan: DependencyOwnerPlan,
  pins: SolverPins,
  ports: SolverPorts,
  deadline: number,
  action: (owner: DependencyOwner) => Promise<T>,
  directory = SOLVER_EDGE_STATE,
): Promise<{ state: 'solver-drained'; activation: 'blocked'; value: T }> {
  plan = structuredClone(plan);
  if (directory !== ports.edgeState)
    throw new Error('solver owner and adapter state namespace differ');
  const prod = plan.layouts.find((layout) => layout.env === 'prod');
  const dev = plan.layouts.find((layout) => layout.env === 'dev');
  if (prod === undefined || dev === undefined)
    throw new Error('solver owner requires prod and dev');
  return withDependencyOwner(
    plan,
    async (owner) => {
      const value = await withSolverDrainUnderOwner(
        owner,
        { prod, dev },
        pins,
        ports,
        deadline,
        () => action(owner),
      );
      return { state: 'solver-drained', activation: 'blocked', value };
    },
    directory,
  );
}

/**
 * Explicit whole-source dev composition. Holds ingress and solver/source exclusion throughout
 * prod managed fences, awaited continuation and final readbacks. Returns no activation grant;
 * unsupported installed authorities or retained mounted attempts still refuse ordinary audits.
 */
export async function excludeSourceAndManagedDependencies<T>(
  plan: DependencyOwnerPlan,
  pins: SolverPins,
  ports: SolverPorts,
  runDocker: RunDocker,
  deadline: number,
  action: (owner: DependencyOwner, source: SourceDevExclusion) => Promise<T>,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
  execDocker: DockerExec = runDockerExec,
  directory = SOLVER_EDGE_STATE,
): Promise<{ state: 'source-managed-excluded'; activation: 'blocked'; value: T }> {
  plan = structuredClone(plan);
  const prod = plan.layouts.find((layout) => layout.env === 'prod');
  const dev = plan.layouts.find((layout) => layout.env === 'dev');
  if (
    prod === undefined ||
    dev === undefined ||
    plan.layouts.length !== 2 ||
    directory !== ports.edgeState
  )
    throw new Error('source composition requires exact joint prod/dev owner and solver namespace');
  return withDependencyOwner(
    plan,
    async (owner) => ({
      state: 'source-managed-excluded',
      activation: 'blocked',
      value: await excludeSourceAndManagedUnderOwner(
        owner,
        plan,
        { prod, dev },
        pins,
        ports,
        runDocker,
        deadline,
        (authority, source) => action(authority, source),
        namespaceProof,
        execDocker,
      ),
    }),
    directory,
  );
}

async function excludeSourceAndManagedUnderOwner<T>(
  owner: DependencyOwner,
  plan: DependencyOwnerPlan,
  layouts: SolverLayouts,
  pins: SolverPins,
  ports: SolverPorts,
  runDocker: RunDocker,
  deadline: number,
  action: (
    owner: DependencyOwner,
    source: SourceDevExclusion,
    solver: SolverExclusion,
  ) => Promise<T>,
  namespaceProof: typeof verifyContainerNamespace,
  execDocker: DockerExec,
): Promise<T> {
  const { prod, dev } = layouts;
  await fenceDependencyIngress(owner, [prod, dev], runDocker, deadline);
  const value = await withSolverDrainUnderOwner(
    owner,
    { prod, dev },
    pins,
    ports,
    deadline,
    (solver) =>
      withSourceDevExcluded(owner, { prod, dev }, plan.sha, runDocker, deadline, async (source) => {
        await fenceGatewaysUnderOwner(owner, prod, plan.sha, runDocker, deadline);
        await fenceBackendsUnderOwner(
          owner,
          prod,
          plan.sha,
          runDocker,
          deadline,
          namespaceProof,
          execDocker,
          source,
          solver,
        );
        const inspect = async () => {
          await inspectDependencyIngress(owner, [prod, dev], runDocker, deadline);
          // Proof: replacing hashed Docker with raw retention leaked the composed environment sentinel; combined coordinator test failed.
          await inspectGatewayFenceUnderLock(
            prod,
            ownerDockerHashed(owner, prod, runDocker),
            deadline,
          );
          await inspectBackendFenceUnderOwner(
            owner,
            prod,
            plan.sha,
            runDocker,
            deadline,
            source,
            namespaceProof,
            execDocker,
            solver,
          );
          await inspectSourceDevExclusion(owner, source);
        };
        await inspect();
        try {
          return await action(owner, source, solver);
        } finally {
          await inspect();
        }
      }),
  );
  return value;
}

/** Restores only the independently pinned compatible supervisor; participants and every public exposure remain fenced. */
export async function restoreSolverAfterDependencyExclusion(
  plan: DependencyOwnerPlan,
  pins: SolverPins,
  ports: SolverRestorePorts,
  runDocker: RunDocker,
  deadline: number,
  namespaceProof: typeof verifyContainerNamespace = verifyContainerNamespace,
  execDocker: DockerExec = runDockerExec,
  directory = SOLVER_EDGE_STATE,
): Promise<{
  state: 'solver-restored-participants-fenced';
  activation: 'not-performed';
  exposure: 'closed';
}> {
  plan = structuredClone(plan);
  pins = decodeSolverPins(pins);
  const prod = plan.layouts.find((layout) => layout.env === 'prod');
  const dev = plan.layouts.find((layout) => layout.env === 'dev');
  if (
    prod === undefined ||
    dev === undefined ||
    plan.layouts.length !== 2 ||
    directory !== ports.edgeState
  )
    throw new Error('solver restoration requires exact joint prod/dev owner and solver namespace');
  const layouts = { prod, dev };
  return withDependencyOwner(
    plan,
    async (owner) => {
      const original = await captureEdgePolicy(directory);
      decodeOrdinaryEdgePolicy(original.policy, directory);
      const prepared = await excludeSourceAndManagedUnderOwner(
        owner,
        plan,
        layouts,
        pins,
        ports,
        runDocker,
        deadline,
        async (authority, source, solver) => {
          const parked = await captureParkedDependencies(
            authority,
            layouts,
            plan.sha,
            source,
            solver,
            runDocker,
            deadline,
          );
          const intent = await retainCompatibleSolverIntent(
            authority,
            layouts,
            pins,
            ports,
            deadline,
          );
          const installed = await captureSolverTuple(pins, ports.captureFile);
          return { parked, intent, installed };
        },
        namespaceProof,
        execDocker,
      );
      // Exclusion tokens and solver-runtime description have expired; outer owner locks remain live.
      const removed = await prepared.parked.removeSolvers();
      await prepared.parked.inspect(removed);
      await publishRestoringEdgePolicy(owner, original, prepared.intent);
      const published = await captureEdgePolicy(directory);
      const host = ownerHostCommand(owner, layouts, ports.runHost);
      await runDockerBefore(
        ['start'],
        (_args, signal) => host({ kind: 'start' }, signal),
        deadline,
      );
      const observeRestoredSolver = async () => {
        const unit = parseSolverUnit(
          await runDockerBefore(
            ['show'],
            (_args, signal) => host({ kind: 'show' }, signal),
            deadline,
          ),
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
      assertSame(
        first,
        await observeRestoredSolver(),
        'restored solver service readiness identity',
      );
      await prepared.parked.inspect(removed);
      // Proof: omitting the final policy readback admitted post-start ordinary-policy substitution; policy-after-start test failed (exit 1).
      assertSame(published, await captureEdgePolicy(directory), 'restored solver retained policy');
      await retainSolverRecord(owner, layouts, 'restore-complete', {
        phase: 'solver-ready-participants-fenced',
        observed: first,
      });
      return {
        state: 'solver-restored-participants-fenced',
        activation: 'not-performed',
        exposure: 'closed',
      };
    },
    directory,
  );
}
