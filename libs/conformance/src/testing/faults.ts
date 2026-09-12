import type { CaseId } from '../case-manifest';
import { failureMessage } from '../failure-message';

export type FaultId = `break:${CaseId}`;

type CaseOf<Id extends FaultId> = Id extends `break:${infer FaultCase extends CaseId}`
  ? FaultCase
  : never;

export interface FaultControl<Phase extends string> {
  readonly phase: Phase;
  claim(): boolean;
  arm(): void;
  isArmed(): boolean;
  reach(phase: Phase): boolean;
  reached(): boolean;
}

interface RegisteredFault<
  Subject,
  Id extends FaultId,
  Phase extends string = string,
  Control extends FaultControl<Phase> = FaultControl<Phase>,
> {
  readonly id: Id;
  readonly caseId: CaseOf<Id>;
  createControl(): Control;
  mutate(subject: Subject, control: Control): Subject;
}

export interface FaultRun<
  Subject,
  Id extends FaultId = FaultId,
  Phase extends string = string,
  Control extends FaultControl<Phase> = FaultControl<Phase>,
> {
  readonly id: Id;
  readonly caseId: CaseOf<Id>;
  readonly control: Control;
  mutate(subject: Subject, control: Control): Subject;
}

/** The closed fault registry, discriminated by manifest-derived fault ID. */
export type Fault<
  Subject,
  Phase extends string = string,
  Control extends FaultControl<Phase> = FaultControl<Phase>,
> = {
  [Id in FaultId]: RegisteredFault<Subject, Id, Phase, Control>;
}[FaultId];

/** Creates one activation state owned by one broken-source proof run. */
export function createFaultControl<const Phase extends string>(phase: Phase): FaultControl<Phase> {
  let isArmed = false;
  let hasReached = false;
  let isClaimed = false;
  return {
    phase,
    claim() {
      if (isClaimed) return false;
      isClaimed = true;
      return true;
    },
    arm() {
      isClaimed = true;
      if (isArmed) throw new Error(`fault control for ${phase} was already armed`);
      isArmed = true;
    },
    isArmed: () => isArmed,
    reach(reachedPhase) {
      if (!isArmed || reachedPhase !== phase) return false;
      hasReached = true;
      return true;
    },
    reached: () => hasReached,
  };
}

/** Keeps the fault ID and its owning manifest case coupled at compilation. */
export function defineFault<
  Subject,
  const Id extends FaultId,
  const Phase extends string,
  Control extends FaultControl<Phase>,
>(
  fault: RegisteredFault<Subject, Id, Phase, Control>,
): RegisteredFault<Subject, Id, Phase, Control> {
  return fault;
}

export type FaultProof =
  | {
      readonly kind: 'observed';
      readonly faultId: FaultId;
      readonly caseId: CaseId;
      readonly phase: string;
      readonly assertion: string;
      readonly observedFailure: string;
    }
  | {
      readonly kind: 'setup-failed';
      readonly faultId: FaultId;
      readonly caseId: CaseId;
      readonly failure: string;
    }
  | {
      readonly kind: 'phase-failed';
      readonly faultId: FaultId;
      readonly caseId: CaseId;
      readonly phase: string;
      readonly failure: string;
    }
  | {
      readonly kind: 'assertion-passed';
      readonly faultId: FaultId;
      readonly caseId: CaseId;
      readonly phase: string;
      readonly assertion: string;
    };

export interface FaultProofPlan<
  Context,
  Subject,
  Phase extends string,
  Control extends FaultControl<Phase>,
> {
  readonly assertion: string;
  setup(run: FaultRun<Subject, FaultId, Phase, Control>): Promise<Context>;
  exercise(context: Context): Promise<void>;
  assert(context: Context): Promise<void>;
}

/** Accepts a broken assertion only after verified setup and its named phase. */
export async function recordFaultProof<
  Context,
  Subject,
  Phase extends string,
  Control extends FaultControl<Phase>,
>(
  fault: Fault<Subject, Phase, Control>,
  plan: FaultProofPlan<Context, Subject, Phase, Control>,
): Promise<FaultProof> {
  const control = fault.createControl();
  if (!control.claim()) {
    return {
      kind: 'setup-failed',
      faultId: fault.id,
      caseId: fault.caseId,
      failure: `fault control for ${control.phase} was reused across proof runs`,
    };
  }
  const run: FaultRun<Subject, typeof fault.id, Phase, Control> = {
    id: fault.id,
    caseId: fault.caseId,
    control,
    mutate: (subject, runControl) => fault.mutate(subject, runControl),
  };
  let context: Context;
  try {
    context = await plan.setup(run);
  } catch (failure) {
    return {
      kind: 'setup-failed',
      faultId: fault.id,
      caseId: fault.caseId,
      failure: failureMessage(failure),
    };
  }

  control.arm();
  try {
    await plan.exercise(context);
  } catch (failure) {
    return {
      kind: 'phase-failed',
      faultId: fault.id,
      caseId: fault.caseId,
      phase: control.phase,
      failure: failureMessage(failure),
    };
  }
  if (!control.reached()) {
    return {
      kind: 'phase-failed',
      faultId: fault.id,
      caseId: fault.caseId,
      phase: control.phase,
      failure: `fault did not reach ${control.phase}`,
    };
  }
  try {
    await plan.assert(context);
    return {
      kind: 'assertion-passed',
      faultId: fault.id,
      caseId: fault.caseId,
      phase: control.phase,
      assertion: plan.assertion,
    };
  } catch (failure) {
    return {
      kind: 'observed',
      faultId: fault.id,
      caseId: fault.caseId,
      phase: control.phase,
      assertion: plan.assertion,
      observedFailure: failureMessage(failure),
    };
  }
}
