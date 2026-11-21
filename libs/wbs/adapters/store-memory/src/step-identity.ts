import { compareStepUsageIds } from '@wbs/core';
import type { StepIdentityRead } from '@wbs/domain';

import type { MemoryState } from './memory-stores';

/** Actual immutable migration identity row, retained independently of live bindings. */
export interface MemoryStepAlias {
  readonly oldStepId: string;
  readonly stepId: string;
  readonly mergedAt: number;
}

/**
 * Read organization-local historical aliases from one captured current Memory graph.
 * A retired survivor remains physical identity evidence; active bindings do not filter history.
 * Coherent foreign survivors are excluded before decoding their historical metadata.
 * @throws on absent package attribution, orphan survivors or inconsistent alias rows.
 */
export function readMemoryStepIdentityIn(
  state: MemoryState,
  workPackageId: string,
): StepIdentityRead {
  const { stepCatalogue, workPackages, organizationLimits, directory } = state.tables;
  const organizationId = organizationLimits.workPackageOrganization.get(workPackageId);
  // Proof: disabling this whole admission lets the actual missing-map Source
  // read resolve (saved-identity-effect-package-attribution-v1).
  if (
    !workPackages.workPackages.has(workPackageId) ||
    typeof organizationId !== 'string' ||
    organizationId === '' ||
    !directory.measureDefinitions.organizations.has(organizationId)
  )
    throw new Error('saved step identity package attribution is inconsistent');
  const included = stepCatalogue.packageValues.get(workPackageId);
  const aliases: { oldStepId: string; stepId: string }[] = [];
  for (const [key, alias] of stepCatalogue.identityHistory) {
    const survivor = stepCatalogue.definitions.get(alias.stepId);
    const survivorOrganizationId = survivor?.organizationId;
    // Proof: removing this exclusion makes healthy foreign NaN metadata reject
    // an own saved read. Omitting only the organization or included-value term
    // admits the corresponding corrupted actual Source capture (foreign-* effects).
    if (
      survivor?.id === alias.stepId &&
      typeof survivorOrganizationId === 'string' &&
      survivorOrganizationId !== organizationId &&
      directory.measureDefinitions.organizations.has(survivorOrganizationId) &&
      included?.has(alias.stepId) !== true
    )
      continue;
    // Stored Memory rows can be deliberately corrupted by fixture acquisition;
    // these local unknown values preserve the same decoder boundary as SQLite.
    const oldStepId: unknown = alias.oldStepId,
      stepId: unknown = alias.stepId,
      mergedAt: unknown = alias.mergedAt;
    // Proof: disabling this whole check loses six actual Source refusals
    // (alias-consistency effect). Individual decoder conjuncts are not separate proofs.
    if (
      survivor === undefined ||
      survivor.id !== stepId ||
      survivor.organizationId !== organizationId ||
      typeof oldStepId !== 'string' ||
      typeof stepId !== 'string' ||
      oldStepId !== key ||
      oldStepId === stepId ||
      typeof mergedAt !== 'number' ||
      !Number.isSafeInteger(mergedAt) ||
      stepCatalogue.definitions.has(oldStepId) ||
      stepCatalogue.identityHistory.has(stepId)
    )
      throw new Error('saved step identity history is inconsistent');
    // Proof: dropping this projection returns no actual aliases to the positive
    // saved-read owner (saved-identity-effect-alias-projection-v1).
    aliases.push({ oldStepId, stepId });
  }
  // Proof: omitting sort returns z before A (alias-order effect). The former
  // UTF16 comparator swaps U+E000/U+10000 after the real SQLite BINARY oracle
  // passes in "current memory saved aliases follow SQLite binary UTF8 order for Unicode and prefixes".
  aliases.sort((left, right) => compareStepUsageIds(left.oldStepId, right.oldStepId));
  return { kind: 'catalogue', aliases };
}
