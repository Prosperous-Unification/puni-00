import { resolveSteps, type StepBinding } from '@wbs/domain';

import type { ClaimStore, StampedClaim } from '../ports/claim-store';
import type { StepUsagePackage } from '../ports/step-usage';
import type { PackageStepValues, StepIdentity } from './step-catalogue';
import { projectStoredStepFacts } from './step-fact-reads';
import type { StepFactReadLifetime } from './step-write';

/**
 * Observations borrow the existing Source lifetime. Public snapshots admitted before close
 * may finish; ordinary and repair loans recheck their owner after the asynchronous return.
 * Other claim operations retain their existing receiver and write ownership.
 */
export function guardClaimObservation(
  store: ClaimStore,
  lifetime: StepFactReadLifetime,
): ClaimStore {
  return new Proxy(store, {
    get(target, key) {
      if (key === 'observeWorkPackage')
        return async (...args: Parameters<ClaimStore['observeWorkPackage']>) => {
          // Proof: entry-lifetime removes this call; the retained actual public
          // Memory observer answers after Source close (one failed owner).
          lifetime.assertOpen();
          const observed = await target.observeWorkPackage(...args);
          // Proof: return-lifetime removes this recheck; actual plain and bound
          // SQLite reads return after their loan settles (two failed owners).
          if (lifetime.kind === 'borrowed') lifetime.assertOpen();
          return observed;
        };
      const operation: unknown = Reflect.get(target, key, target);
      return typeof operation === 'function'
        ? (...args: unknown[]): unknown => Reflect.apply(operation, target, args)
        : operation;
    },
  });
}

/**
 * Validates actual point claims against their own leaf and captures every leaf's SC18 order.
 * Adapters select claims through their actual work items; nullable subtree claims acquire
 * no point applicability. The public projection checks their row in the observed tree.
 * Explicit values and complete reached metadata are validated by the current package reader.
 */
export function projectClaimLeafSteps(
  captured: StepUsagePackage,
  bindings: readonly StepBinding[],
  identities: ReadonlyMap<string, StepIdentity>,
  values: ReadonlyMap<string, PackageStepValues>,
  claims: readonly StampedClaim[],
): ReadonlyMap<string, readonly string[]> {
  const points = claims.flatMap((claim) =>
    claim.stepId === null ? [] : [{ ...claim, stepId: claim.stepId }],
  );
  // Proof: point-validation omits this dependency; both actual Sources answer
  // unresolved leaf and parent point claims (four failures). This proves the
  // projection as a group, not each internal metadata predicate separately.
  projectStoredStepFacts(captured, bindings, identities, values, points, 'claim');
  const parents = new Set(captured.workItems.map(({ parentId }) => parentId));
  return new Map(
    captured.workItems.flatMap((row) =>
      // Proof: zero-step-inventory also filters empty resolved lists; both actual
      // adapter inventories lose the explicit zero-step leaf (two failures).
      parents.has(row.id)
        ? []
        : [
            [
              row.id,
              resolveSteps(captured.chain, row.typeState, bindings).map(({ stepId }) => stepId),
            ] as const,
          ],
    ),
  );
}
