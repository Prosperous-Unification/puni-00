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
  readonly observe: (plan: OperationPlan) => Promise<ApplyObservation>;
  readonly applyEffect: (
    plan: OperationPlan,
    effect: string,
    stepId: string,
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

function completedReceipt(journal: OperationJournal): OperationReceipt {
  if (journal.state !== 'complete') throw new Error('Operation receipt requires complete state');
  return { ...journal, state: 'complete' };
}

/** Apply only the ordered effects in a reviewed plan, journaling durable progress before and after each mutation. */
export async function applyOperation(request: ApplyRequest): Promise<OperationReceipt> {
  const { plan, expectedSha256, journalPath, dependencies } = request;
  requireCurrentPlan(plan, expectedSha256, dependencies.now());
  const lease = await dependencies.acquireLease(plan);
  if (dependencies.now().getTime() >= Date.parse(lease.expiresAt)) {
    // Proof: the expired-lease production-path negative obtains a lease ending at the current
    // instant and records zero adapter mutations.
    throw new Error(`Operation lease expired at ${lease.expiresAt}`);
  }
  let journal = await readExistingJournal(journalPath);
  if (journal === undefined) {
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
    requireKnownProgress(plan, journal);
    if (journal.state === 'complete') return completedReceipt(journal);
    journal = {
      ...journal,
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
    const observation = await dependencies.observe(plan);
    if (position === 0 && observation.digest !== plan.observationDigest) {
      // Proof: the stale-observation production-path negative changes only the observed digest and
      // records zero adapter mutations.
      throw new Error('Operation observation digest is stale');
    }
    if (!sameIdentities(observation.targetIdentities, plan.targetIdentities)) {
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
        (position === 0 && observation.terraformState.serial !== plan.request.terraformStateSerial))
    ) {
      // Proof: the wrong-lineage and stale-serial production-path negatives stop before mutation.
      throw new Error('Terraform state lineage or serial differs from the reviewed operation');
    }
    const effect = plan.effects[position];
    const currentStepId = stepId(position);
    let effectEvidence: { readonly externalResourceId?: string };
    try {
      effectEvidence = await dependencies.applyEffect(plan, effect, currentStepId);
    } catch (cause) {
      journal = { ...journal, state: 'recoverable', updatedAt: dependencies.now().toISOString() };
      await writeOperationJournal(journalPath, journal);
      // Proof: the provider-timeout production-path negative persists recoverable state before the
      // effect failure reaches the caller.
      throw new Error(`Operation effect failed: ${effect}`, { cause });
    }
    const completedStep: CompletedOperationStep = {
      stepId: currentStepId,
      effect,
      ...(effectEvidence.externalResourceId === undefined
        ? {}
        : { externalResourceId: effectEvidence.externalResourceId }),
    };
    journal = {
      ...journal,
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
}
