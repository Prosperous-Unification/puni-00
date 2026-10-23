import { fenceBackendsUnderOwner } from './backend-exclusion';
import type { RunDocker } from './docker-deadline';
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
) {
  plan = structuredClone(plan);
  return withDependencyOwner(
    plan,
    async (owner) => {
      const deadline = performance.now() + 60000;
      for (const layout of [...plan.layouts].sort((left, right) =>
        left.env === right.env ? 0 : left.env === 'prod' ? -1 : 1,
      )) {
        await fenceGatewaysUnderOwner(owner, layout, plan.sha, runDocker, deadline);
        await fenceBackendsUnderOwner(owner, layout, plan.sha, runDocker, deadline, namespaceProof);
      }
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
