import {
  CASE_MANIFEST,
  type CaseId,
  type CaseRegistration,
  type ExpectedCase,
  expectedCasesFor,
  PORT_NAMES,
} from './case-manifest';
import type { CaseExecution, ExecutionReport, TerminalCaseStatus } from './case-runner';
import type { SourceDeclaration } from './source-declaration';

/** The implemented source-family cases, independently enumerated from the manifest. */
export const SOURCE_CONFORMANCE_CASES = [
  'projects.create:steps',
  'projects.update:scope',
  'projects.recordOpen:reader-order',
  'users.create:unique-name',
  'users.find:identity',
  'users.resolveOidcIdentity:issuer-subject',
  'users.resolveOidcIdentity:verified-conflict',
  'capacity.set:project-team-key',
  'capacity.set:clear',
  'capacity.set:missing-reference',
  'priorityBands.listFor:defaults',
  'priorityBands.replace:whole-project',
  'priorityBands.replace:missing-project',
  'steps.add',
  'steps.rename',
  'steps.rename:unknown',
  'estimates.set',
  'estimates.set:replace',
  'estimates.set:unknown_step',
  'estimates.remove',
  'directory.addTag',
  'directory.assign:unknown_person',
  'eventLog.recordEvent',
  'eventLog.rangeSince',
  'eventLog.pruneBeyond',
] as const;

export interface CertificationInput {
  readonly declaration: SourceDeclaration;
  readonly registrations: readonly CaseRegistration[];
  readonly report: ExecutionReport;
}

function keyOf(entry: ExpectedCase): string {
  return `${entry.family}\u0000${entry.caseId}`;
}

function duplicatesOf(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

function printableKey(key: string): string {
  return key.replace('\u0000', ': ');
}

function validateGaps(declaration: SourceDeclaration): void {
  const unknown: string[] = [];
  const duplicate: string[] = [];
  for (const family of PORT_NAMES) {
    const capability = declaration.capabilities[family];
    if (capability.kind === 'absent') continue;
    const known = new Set<string>(CASE_MANIFEST[family]);
    const seen = new Set<CaseId>();
    for (const gap of capability.gaps) {
      if (!known.has(gap.caseId)) unknown.push(`${family}: ${gap.caseId}`);
      if (seen.has(gap.caseId)) duplicate.push(`${family}: ${gap.caseId}`);
      seen.add(gap.caseId);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`${declaration.name} certification unknown gaps: ${unknown.join(', ')}`);
  }
  if (duplicate.length > 0) {
    throw new Error(`${declaration.name} certification duplicate gaps: ${duplicate.join(', ')}`);
  }
}

interface ReportedCaseEvidence {
  readonly family: CaseRegistration['family'];
  readonly caseId: CaseId;
  readonly status: TerminalCaseStatus;
  readonly executed: boolean;
  readonly fixtureId?: unknown;
  readonly executionStartedAt?: unknown;
  readonly executionEndedAt?: unknown;
  readonly assertionPhase?: unknown;
  readonly failure?: unknown;
}

function hasLifecycleTiming(execution: ReportedCaseEvidence): boolean {
  const { executionStartedAt, executionEndedAt } = execution;
  return (
    typeof executionStartedAt === 'number' &&
    Number.isFinite(executionStartedAt) &&
    typeof executionEndedAt === 'number' &&
    Number.isFinite(executionEndedAt) &&
    executionEndedAt >= executionStartedAt
  );
}

function hasFixtureIdentity(execution: ReportedCaseEvidence): boolean {
  return typeof execution.fixtureId === 'string';
}

function invalidExecutionEvidence(
  execution: ReportedCaseEvidence,
  registration: CaseRegistration | undefined,
): boolean {
  if (execution.status === 'passed') {
    return (
      !execution.executed ||
      registration?.openAndRun === undefined ||
      !hasFixtureIdentity(execution) ||
      !hasLifecycleTiming(execution) ||
      execution.assertionPhase !== 'cleanup' ||
      'failure' in execution
    );
  }
  if (execution.status === 'failed') {
    return (
      !execution.executed ||
      !hasLifecycleTiming(execution) ||
      typeof execution.failure !== 'string' ||
      (execution.assertionPhase !== 'setup' && !hasFixtureIdentity(execution))
    );
  }
  return (
    execution.executed ||
    'fixtureId' in execution ||
    'executionStartedAt' in execution ||
    'executionEndedAt' in execution ||
    'assertionPhase' in execution ||
    'failure' in execution
  );
}

/** Validates exact registration and terminal execution, never declaration counts. */
export function certifyExecution(input: CertificationInput): void {
  const { declaration, registrations, report } = input;
  if (report.kind === 'partial') {
    throw new Error(`${declaration.name} certification cannot use a partial execution report`);
  }
  validateGaps(declaration);
  const expected = expectedCasesFor(declaration.historyAdmission);
  const expectedKeys = expected.map(keyOf);
  const registrationKeys = registrations.map(keyOf);
  const duplicateRegistrations = duplicatesOf(registrationKeys);
  if (duplicateRegistrations.length > 0) {
    throw new Error(
      `${declaration.name} certification duplicate registered cases: ${duplicateRegistrations.map(printableKey).join(', ')}`,
    );
  }
  const expectedSet = new Set(expectedKeys);
  const registrationSet = new Set(registrationKeys);
  const missingRegistrations = expectedKeys.filter((key) => !registrationSet.has(key));
  const unknownRegistrations = registrationKeys.filter((key) => !expectedSet.has(key));
  if (missingRegistrations.length > 0) {
    throw new Error(
      `${declaration.name} certification missing registered cases: ${missingRegistrations.map(printableKey).join(', ')}`,
    );
  }
  if (unknownRegistrations.length > 0) {
    throw new Error(
      `${declaration.name} certification unknown registered cases: ${unknownRegistrations.map(printableKey).join(', ')}`,
    );
  }

  const reportKeys = report.cases.map(keyOf);
  const duplicateReports = duplicatesOf(reportKeys);
  if (duplicateReports.length > 0) {
    throw new Error(
      `${declaration.name} certification duplicate case reports: ${duplicateReports.map(printableKey).join(', ')}`,
    );
  }
  const reportSet = new Set(reportKeys);
  const missingReports = expectedKeys.filter((key) => !reportSet.has(key));
  if (missingReports.length > 0) {
    throw new Error(
      `${declaration.name} certification missing case reports: ${missingReports.map(printableKey).join(', ')}`,
    );
  }
  const unknownReports = reportKeys.filter((key) => !expectedSet.has(key));
  if (unknownReports.length > 0) {
    throw new Error(
      `${declaration.name} certification unknown case reports: ${unknownReports.map(printableKey).join(', ')}`,
    );
  }

  const wrongStatuses = report.cases.filter(({ family, caseId, status }) => {
    if (family === 'history') return status !== 'passed';
    const capability = declaration.capabilities[family];
    const isNotOffered =
      capability.kind === 'absent' || capability.gaps.some((gap) => gap.caseId === caseId);
    return isNotOffered ? status !== 'not-offered' : status === 'not-offered';
  });
  if (wrongStatuses.length > 0) {
    throw new Error(
      `${declaration.name} certification capability status mismatch: ${wrongStatuses.map(({ family, caseId, status }) => `${family}: ${caseId} (${status})`).join(', ')}`,
    );
  }

  const registrationsByKey = new Map(
    registrations.map((registration) => [keyOf(registration), registration]),
  );
  const invalidEvidence = report.cases.filter((execution) =>
    invalidExecutionEvidence(execution, registrationsByKey.get(keyOf(execution))),
  );
  if (invalidEvidence.length > 0) {
    // Proof: removing this block left each contradictory passed record certified;
    // the execution, lifecycle and cleanup negatives received no throw.
    throw new Error(
      `${declaration.name} certification invalid execution evidence: ${invalidEvidence.map(({ family, caseId, status }) => `${family}: ${caseId} (${status})`).join(', ')}`,
    );
  }

  const incomplete = report.cases.filter(({ status }) => status === 'incomplete');
  if (incomplete.length > 0) {
    throw new Error(
      `${declaration.name} certification incomplete cases: ${incomplete.map(({ family, caseId }) => `${family}: ${caseId}`).join(', ')}`,
    );
  }
  const failed = report.cases.filter(
    (execution): execution is Extract<CaseExecution, { status: 'failed' }> =>
      execution.status === 'failed',
  );
  if (failed.length > 0) {
    throw new Error(
      `${declaration.name} certification failed cases: ${failed.map(({ family, caseId, assertionPhase, failure }) => `${family}: ${caseId} (${assertionPhase}: ${failure})`).join(', ')}`,
    );
  }
}
