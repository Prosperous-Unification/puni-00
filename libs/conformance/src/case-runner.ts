import type { CaseId, CaseRegistration } from './case-manifest';
import type { SourceDeclaration } from './source-declaration';

export type TerminalCaseStatus = 'passed' | 'failed' | 'not-offered' | 'incomplete';
export type AssertionPhase = 'setup' | 'assertion' | 'cleanup';

export interface CaseExecution {
  readonly family: CaseRegistration['family'];
  readonly caseId: CaseId;
  readonly status: TerminalCaseStatus;
  readonly executed: boolean;
  readonly fixtureId?: string;
  readonly executionStartedAt?: number;
  readonly executionEndedAt?: number;
  readonly assertionPhase?: AssertionPhase;
  readonly failure?: string;
}

export interface ExecutionReport {
  readonly kind: 'full' | 'partial';
  readonly cases: readonly CaseExecution[];
}

export interface RunCasesOptions {
  readonly focus?: readonly CaseId[];
  readonly declaration?: SourceDeclaration;
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

async function runCase(registration: CaseRegistration): Promise<CaseExecution> {
  const executionStartedAt = Date.now();
  if (registration.openAndRun === undefined) {
    return {
      family: registration.family,
      caseId: registration.caseId,
      status: 'incomplete',
      executed: false,
    };
  }

  let lifecycle;
  try {
    lifecycle = await registration.openAndRun();
  } catch (failure) {
    return {
      family: registration.family,
      caseId: registration.caseId,
      status: 'failed',
      executed: true,
      executionStartedAt,
      executionEndedAt: Date.now(),
      assertionPhase: 'setup',
      failure: messageOf(failure),
    };
  }

  let assertionFailure: unknown;
  try {
    await lifecycle.assert();
  } catch (failure) {
    assertionFailure = failure;
  }

  try {
    await lifecycle.close();
  } catch (failure) {
    const cleanupFailure = messageOf(failure);
    return {
      family: registration.family,
      caseId: registration.caseId,
      status: 'failed',
      executed: true,
      fixtureId: lifecycle.fixtureId,
      executionStartedAt,
      executionEndedAt: Date.now(),
      assertionPhase: 'cleanup',
      failure:
        assertionFailure === undefined
          ? cleanupFailure
          : `${messageOf(assertionFailure)}; cleanup failed: ${cleanupFailure}`,
    };
  }

  if (assertionFailure !== undefined) {
    return {
      family: registration.family,
      caseId: registration.caseId,
      status: 'failed',
      executed: true,
      fixtureId: lifecycle.fixtureId,
      executionStartedAt,
      executionEndedAt: Date.now(),
      assertionPhase: 'assertion',
      failure: messageOf(assertionFailure),
    };
  }

  return {
    family: registration.family,
    caseId: registration.caseId,
    status: 'passed',
    executed: true,
    fixtureId: lifecycle.fixtureId,
    executionStartedAt,
    executionEndedAt: Date.now(),
    assertionPhase: 'cleanup',
  };
}

/** Executes registered bodies and owns their cleanup before assigning pass. */
export async function runCases(
  registrations: readonly CaseRegistration[],
  options: RunCasesOptions = {},
): Promise<ExecutionReport> {
  const selected =
    options.focus === undefined
      ? registrations
      : registrations.filter(({ caseId }) => options.focus?.includes(caseId) === true);
  const cases: CaseExecution[] = [];
  for (const registration of selected) {
    if (registration.family !== 'history' && options.declaration !== undefined) {
      const capability = options.declaration.capabilities[registration.family];
      if (
        capability.kind === 'absent' ||
        capability.gaps.some(({ caseId }) => caseId === registration.caseId)
      ) {
        cases.push({
          family: registration.family,
          caseId: registration.caseId,
          status: 'not-offered',
          executed: false,
        });
        continue;
      }
    }
    cases.push(await runCase(registration));
  }
  return { kind: options.focus === undefined ? 'full' : 'partial', cases };
}
