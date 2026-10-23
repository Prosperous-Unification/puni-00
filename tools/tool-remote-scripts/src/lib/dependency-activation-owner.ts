import { fenceBackendsUnderOwner, inspectBackendFenceUnderOwner } from './backend-exclusion';
import { fenceDependencyIngress, inspectDependencyIngress } from './dependency-ingress';
import type { RunDocker } from './docker-deadline';
import { type DockerExec, runDockerExec } from './docker-exec';
import { edgeStateDirectory } from './edge-admission';
import {
  type DependencyOwner,
  type DependencyOwnerPlan,
  ownerDocker,
  withDependencyOwner,
} from './edge-ownership';
import { fenceGatewaysUnderOwner, inspectGatewayFenceUnderLock } from './gateway-exclusion';
import { verifyContainerNamespace } from './mount-audit';
import { withSolverDrainUnderOwner } from './solver-exclusion';
import { SOLVER_EDGE_STATE, type SolverPins, type SolverPorts } from './solver-host';
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
    async (owner) => {
      await fenceDependencyIngress(owner, [prod, dev], runDocker, deadline);
      const value = await withSolverDrainUnderOwner(
        owner,
        { prod, dev },
        pins,
        ports,
        deadline,
        (solver) =>
          withSourceDevExcluded(
            owner,
            { prod, dev },
            plan.sha,
            runDocker,
            deadline,
            async (source) => {
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
                await inspectGatewayFenceUnderLock(
                  prod,
                  ownerDocker(owner, prod, runDocker),
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
                return await action(owner, source);
              } finally {
                await inspect();
              }
            },
          ),
      );
      return { state: 'source-managed-excluded', activation: 'blocked', value };
    },
    directory,
  );
}
