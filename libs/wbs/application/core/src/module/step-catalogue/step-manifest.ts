import { resolveSteps, type ProjectChain, type StepBinding } from '@wbs/domain';
import type { ProjectStepManifest } from '../../ports/step-manifest';
import { readCatalogueId } from './step-catalogue';
import { compareStepUsageIds } from './step-usage-capture';

/**
 * Builds exact typed/untyped code mappings from one captured actual project chain.
 * Decodes the stored revision and owned type identities at this shared boundary.
 * Types follow binary identity order; codes retain SC18 resolution order. No package
 * identity, values or direct work-item type is invented, including for empty projects.
 * @throws on a malformed revision or owned type identity; trusted faults never become defaults.
 */
export function projectStepManifest(
  chain: ProjectChain,
  revision: unknown,
  typeIds: readonly unknown[],
  bindings: readonly StepBinding[],
): ProjectStepManifest {
  // Proof: omitting whole admission accepted stored text; separately omitting safe-integer
  // or nonnegative admission accepted1.5or-1 in both actual SQLite Source and Memory
  // factory rebound from complete genuine Source evidence. Exact restores passed
  // (verification-project-manifest-20261119.json); no separate typeof-term claim.
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)
    throw new Error('stored manifest project revision is malformed');
  const types = typeIds
    .map((id) => readCatalogueId(id, 'manifest work item type'))
    .sort(compareStepUsageIds);
  return {
    version: 1,
    // Proof: replacing actual revision5with0 failed the real mounted manifest owner;
    // exact restore passed (verification-project-manifest-20261119.json).
    project: { id: chain.projectId, revision },
    // Proof: selecting the first owned type included research in untyped default;
    // exact restore passed the mounted producer owner (verification-project-manifest-20261119.json).
    default: resolveSteps(chain, { kind: 'untyped' }, bindings).map((step) => step.code),
    types: types.map((workItemTypeId) => ({
      workItemTypeId,
      // Proof: untyped resolution dropped research and typed-default codes; exact
      // restore passed the mounted owner (verification-project-manifest-20261119.json).
      codes: resolveSteps(chain, { kind: 'typed', typeId: workItemTypeId }, bindings).map(
        (step) => step.code,
      ),
    })),
  };
}
