import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';

import {
  type CompletedOperationStep,
  type OperationJournal,
  readOperationJournal,
  writeOperationJournal,
} from './journal';
import { type OperationPlan, sealOperationPlan } from './plan';

export interface ApplyObservation {
  readonly digest: string;
  readonly targetIdentities: readonly string[];
  readonly providerState: 'ready' | 'pending-deletion';
  readonly terraformState?: { readonly lineage: string; readonly serial: number };
}

export interface OperationLease {
  readonly owner: string;
  readonly expiresAt: string;
}

export interface ApplyDependencies {
  readonly now: () => Date;
  readonly acquireLease: (plan: OperationPlan) => Promise<OperationLease>;
  readonly ownsLease: (lease: OperationLease) => Promise<boolean>;
  readonly renewLease: (plan: OperationPlan, lease: OperationLease) => Promise<OperationLease>;
  readonly releaseLease: (plan: OperationPlan, lease: OperationLease) => Promise<void>;
  readonly observe: (plan: OperationPlan) => Promise<ApplyObservation>;
  readonly applyEffect: (
    plan: OperationPlan,
    effect: string,
    stepId: string,
    beforeMutation: () => Promise<void>,
  ) => Promise<{ readonly externalResourceId?: string }>;
}

export interface ApplyRequest {
  readonly plan: OperationPlan;
  readonly expectedSha256: string;
  readonly journalPath: string;
  readonly dependencies: ApplyDependencies;
}

export interface OperationReceipt extends OperationJournal {
  readonly state: 'complete';
}

function requireCurrentPlan(plan: OperationPlan, expectedSha256: string, now: Date): void {
  const { planSha256, ...body } = plan;
  const actualSha256 = sealOperationPlan(body).planSha256;
  if (planSha256 !== actualSha256 || expectedSha256 !== planSha256) {
    // Proof: the expected-digest production-path negative reaches no mutation and names the
    // reviewed content mismatch.
    throw new Error('Operation plan digest differs from its reviewed SHA-256');
  }
  const expiresAt = Date.parse(plan.expiresAt);
  if (!Number.isFinite(expiresAt) || now.getTime() >= expiresAt) {
    // Proof: the stale-plan production-path negative reaches no mutation at the exact expiry.
    throw new Error(`Operation plan expired at ${plan.expiresAt}`);
  }
}

function stepId(position: number): string {
  return `effect-${String(position + 1)}`;
}

function requireKnownProgress(plan: OperationPlan, journal: OperationJournal): void {
  if (journal.operationId !== plan.planSha256 || journal.planSha256 !== plan.planSha256) {
    throw new Error('Operation journal belongs to a different plan');
  }
  for (const [position, completed] of journal.completedSteps.entries()) {
    if (completed.stepId !== stepId(position) || completed.effect !== plan.effects[position]) {
      // Proof: a persisted unreviewed step stops the production apply path before another effect.
      throw new Error(`Operation journal contains unknown completed step ${completed.stepId}`);
    }
  }
  if (journal.completedSteps.length > plan.effects.length) {
    throw new Error('Operation journal contains more steps than the reviewed plan');
  }
  if (journal.state === 'complete' && journal.completedSteps.length !== plan.effects.length) {
    // Proof: a forged complete journal with zero reviewed steps is refused before returning a
    // completion receipt or issuing another mutation.
    throw new Error('Complete operation journal does not cover every reviewed effect');
  }
  if (
    journal.activeStep !== undefined &&
    (journal.state === 'complete' ||
      journal.activeStep.stepId !== stepId(journal.completedSteps.length) ||
      journal.activeStep.effect !== plan.effects[journal.completedSteps.length])
  ) {
    // Proof: the forged-active-step production negative cannot redirect recovery to an unreviewed
    // effect or coexist with a completed receipt.
    throw new Error('Operation journal contains an unknown active step');
  }
}

async function readExistingJournal(path: string): Promise<OperationJournal | undefined> {
  try {
    await stat(path);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return undefined;
    throw new Error(`Cannot inspect operation journal at ${path}`, { cause });
  }
  return readOperationJournal(path);
}

function sameIdentities(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((identity, position) => identity === right[position])
  );
}

function matchesProvisioningIdentity(
  observation: ApplyObservation,
  plan: OperationPlan,
  position: number,
  journal: OperationJournal,
): boolean {
  if (plan.request.kind !== 'provision') return false;
  const clusterIdentity = `cluster:${plan.request.clusterId}`;
  if (!observation.targetIdentities.includes(clusterIdentity)) return false;
  const providerIdentity = observation.targetIdentities.find((identity) =>
    identity.startsWith('hcloud:'),
  );
  if (position === 0) {
    return (
      observation.targetIdentities.includes(`pending:${plan.request.nodeId}`) ||
      providerIdentity !== undefined
    );
  }
  const recordedId = journal.completedSteps[0]?.externalResourceId;
  return (
    providerIdentity !== undefined &&
    recordedId !== undefined &&
    providerIdentity === `hcloud:${recordedId}`
  );
}

function completedReceipt(journal: OperationJournal): OperationReceipt {
  if (journal.state !== 'complete') throw new Error('Operation receipt requires complete state');
  return { ...journal, state: 'complete' };
}

function observationSha256(observation: ApplyObservation): string {
  return createHash('sha256').update(JSON.stringify(observation)).digest('hex');
}

function journalObservation(
  observation: ApplyObservation,
): CompletedOperationStep['beforeObservation'] {
  return {
    ...observation,
    targetIdentities: [...observation.targetIdentities],
  };
}

function requireObservedTransition(
  before: ApplyObservation,
  after: ApplyObservation,
  plan: OperationPlan,
  position: number,
  journal: OperationJournal,
  externalResourceId?: string,
): void {
  const providerIdentity = after.targetIdentities.find((identity) =>
    identity.startsWith('hcloud:'),
  );
  const afterTerraformState = after.terraformState;
  if (
    after.providerState !== 'ready' ||
    (plan.request.kind === 'provision' &&
      position === 0 &&
      providerIdentity !== undefined &&
      (externalResourceId === undefined || providerIdentity !== `hcloud:${externalResourceId}`)) ||
    (!sameIdentities(after.targetIdentities, before.targetIdentities) &&
      !matchesProvisioningIdentity(after, plan, position, journal))
  ) {
    // Proof: the post-effect wrong-identity production-path negative leaves the active step
    // recoverable instead of certifying a mutation against an unreviewed target.
    throw new Error('Operation postcondition has unexpected identity or provider state');
  }
  if (
    before.terraformState !== undefined &&
    (afterTerraformState?.lineage !== before.terraformState.lineage ||
      afterTerraformState.serial < before.terraformState.serial)
  ) {
    throw new Error('Operation postcondition regressed Terraform state');
  }
}

/** Apply only the ordered effects in a reviewed plan, journaling durable progress before and after each mutation. */
export async function applyOperation(request: ApplyRequest): Promise<OperationReceipt> {
  const { plan, expectedSha256, journalPath, dependencies } = request;
  requireCurrentPlan(plan, expectedSha256, dependencies.now());
  const existingJournal = await readExistingJournal(journalPath);
  if (existingJournal !== undefined) {
    requireKnownProgress(plan, existingJournal);
    if (existingJournal.state === 'complete') return completedReceipt(existingJournal);
  }
  let lease = await dependencies.acquireLease(plan);
  try {
    if (dependencies.now().getTime() >= Date.parse(lease.expiresAt)) {
      // Proof: the expired-lease production-path negative obtains a lease ending at the current
      // instant, releases it, and records zero adapter mutations.
      throw new Error(`Operation lease expired at ${lease.expiresAt}`);
    }
    let journal: OperationJournal;
    if (existingJournal === undefined) {
      journal = {
        schemaVersion: 1,
        operationId: plan.planSha256,
        planSha256: plan.planSha256,
        state: 'running',
        leaseOwner: lease.owner,
        completedSteps: [],
        updatedAt: dependencies.now().toISOString(),
      };
      await writeOperationJournal(journalPath, journal);
    } else {
      journal = {
        ...existingJournal,
        state: 'running',
        leaseOwner: lease.owner,
        updatedAt: dependencies.now().toISOString(),
      };
      await writeOperationJournal(journalPath, journal);
    }
    for (
      let position = journal.completedSteps.length;
      position < plan.effects.length;
      position += 1
    ) {
      requireCurrentPlan(plan, expectedSha256, dependencies.now());
      if (!(await dependencies.ownsLease(lease))) {
        journal = { ...journal, state: 'recoverable', updatedAt: dependencies.now().toISOString() };
        await writeOperationJournal(journalPath, journal);
        // Proof: expiring the controlled lease after one effect persists recoverable progress and
        // stops before the second mutation.
        throw new Error('Operation lease is no longer owned');
      }
      lease = await dependencies.renewLease(plan, lease);
      const beforeMutation = async (): Promise<void> => {
        lease = await dependencies.renewLease(plan, lease);
        if (!(await dependencies.ownsLease(lease))) {
          throw new Error('Operation lease is no longer owned at mutation boundary');
        }
      };
      const observation = await dependencies.observe(plan);
      if (
        position === 0 &&
        observation.digest !== plan.observationDigest &&
        !(
          plan.request.kind === 'provision' &&
          observation.targetIdentities.some((identity) => identity.startsWith('hcloud:'))
        )
      ) {
        // Proof: the stale-observation production-path negative changes only the observed digest and
        // records zero adapter mutations.
        throw new Error('Operation observation digest is stale');
      }
      if (
        !sameIdentities(observation.targetIdentities, plan.targetIdentities) &&
        !matchesProvisioningIdentity(observation, plan, position, journal)
      ) {
        // Proof: the wrong-instance production-path negative records zero adapter mutations.
        throw new Error('Operation target identities changed after review');
      }
      if (observation.providerState === 'pending-deletion') {
        throw new Error('Operation target is pending deletion');
      }
      if (
        plan.request.kind === 'provision' &&
        (observation.terraformState?.lineage !== plan.request.terraformStateLineage ||
          observation.terraformState.serial < plan.request.terraformStateSerial ||
          (position === 0 &&
            observation.terraformState.serial !== plan.request.terraformStateSerial))
      ) {
        // Proof: the wrong-lineage and stale-serial production-path negatives stop before mutation.
        throw new Error('Terraform state lineage or serial differs from the reviewed operation');
      }
      if (!(await dependencies.ownsLease(lease))) {
        journal = { ...journal, state: 'recoverable', updatedAt: dependencies.now().toISOString() };
        await writeOperationJournal(journalPath, journal);
        // Proof: the slow-observation negative loses its Lease during the read and reaches no effect.
        throw new Error('Operation lease expired during precondition observation');
      }
      const effect = plan.effects[position];
      const currentStepId = stepId(position);
      const beforeObservationSha256 = observationSha256(observation);
      journal = {
        ...journal,
        activeStep: {
          stepId: currentStepId,
          effect,
          beforeObservationSha256,
          beforeObservation: journalObservation(observation),
        },
        updatedAt: dependencies.now().toISOString(),
      };
      await writeOperationJournal(journalPath, journal);
      let effectEvidence: { readonly externalResourceId?: string };
      try {
        await beforeMutation();
        effectEvidence = await dependencies.applyEffect(
          plan,
          effect,
          currentStepId,
          beforeMutation,
        );
      } catch (cause) {
        journal = { ...journal, state: 'recoverable', updatedAt: dependencies.now().toISOString() };
        await writeOperationJournal(journalPath, journal);
        // Proof: the provider-timeout production-path negative persists recoverable state before the
        // effect failure reaches the caller.
        const detail = cause instanceof Error ? `: ${cause.message}` : '';
        throw new Error(`Operation effect failed: ${effect}${detail}`, { cause });
      }
      let afterObservation: ApplyObservation;
      try {
        afterObservation = await dependencies.observe(plan);
        requireObservedTransition(
          observation,
          afterObservation,
          plan,
          position,
          journal,
          effectEvidence.externalResourceId,
        );
      } catch (cause) {
        journal = { ...journal, state: 'recoverable', updatedAt: dependencies.now().toISOString() };
        await writeOperationJournal(journalPath, journal);
        // Proof: the post-effect observation negative leaves the active step durable and recoverable,
        // so a successful external mutation cannot be mistaken for an unstarted step.
        const detail = cause instanceof Error ? `: ${cause.message}` : '';
        throw new Error(`Cannot observe completed operation effect: ${effect}${detail}`, { cause });
      }
      const completedStep: CompletedOperationStep = {
        stepId: currentStepId,
        effect,
        beforeObservationSha256,
        beforeObservation: journalObservation(observation),
        afterObservationSha256: observationSha256(afterObservation),
        afterObservation: journalObservation(afterObservation),
        ...(effectEvidence.externalResourceId === undefined
          ? {}
          : { externalResourceId: effectEvidence.externalResourceId }),
      };
      const { activeStep: _completedActiveStep, ...journalWithoutActiveStep } = journal;
      journal = {
        ...journalWithoutActiveStep,
        completedSteps: [...journal.completedSteps, completedStep],
        updatedAt: dependencies.now().toISOString(),
      };
      await writeOperationJournal(journalPath, journal);
    }

    const complete: OperationJournal = {
      ...journal,
      state: 'complete',
      updatedAt: dependencies.now().toISOString(),
    };
    await writeOperationJournal(journalPath, complete);
    return completedReceipt(complete);
  } finally {
    await dependencies.releaseLease(plan, lease);
  }
}
