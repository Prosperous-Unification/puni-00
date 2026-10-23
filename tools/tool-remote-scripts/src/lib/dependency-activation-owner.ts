import { fenceBackendsUnderOwner } from './backend-exclusion';
import { fenceDependencyIngress, inspectDependencyIngress } from './dependency-ingress';
import type { RunDocker } from './docker-deadline';
import { type DockerExec, runDockerExec } from './docker-exec';
import { edgeStateDirectory } from './edge-admission';
import { type DependencyOwnerPlan, withDependencyOwner } from './edge-ownership';
import { fenceGatewaysUnderOwner } from './gateway-exclusion';
import { verifyContainerNamespace } from './mount-audit';

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
