import {
  CASE_MANIFEST,
  type CaseId,
  type CaseRegistration,
  type ExpectedCase,
  expectedCasesFor,
  PORT_NAMES,
} from './case-manifest';
import type { ExecutionReport } from './case-runner';
import type { SourceDeclaration } from './source-declaration';

/** The four source-family kits owned by core extraction, independently enumerated. */
export const SOURCE_CONFORMANCE_CASES = [
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

/** The case states needed to prove that declaration did not replace execution. */
export interface SourceCaseReport {
  ran: readonly string[];
  skipped: readonly string[];
}

/**
 * Refuses a source report that omitted a registered source-family case.
 *
 * Expected cases live apart from kit registration so deleting a kit cannot
 * shrink the standard and its evidence together.
 */
export function certifySourceReport(source: string, report: SourceCaseReport): void {
  const reported = new Set([...report.ran, ...report.skipped]);
  const missing = SOURCE_CONFORMANCE_CASES.filter((id) => !reported.has(id));
  if (missing.length > 0) {
    throw new Error(`${source} certification missing cases: ${missing.join(', ')}`);
  }
}

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

  const incomplete = report.cases.filter(({ status }) => status === 'incomplete');
  if (incomplete.length > 0) {
    throw new Error(
      `${declaration.name} certification incomplete cases: ${incomplete.map(({ family, caseId }) => `${family}: ${caseId}`).join(', ')}`,
    );
  }
  const failed = report.cases.filter(({ status }) => status === 'failed');
  if (failed.length > 0) {
    throw new Error(
      `${declaration.name} certification failed cases: ${failed.map(({ family, caseId, assertionPhase, failure }) => `${family}: ${caseId} (${assertionPhase ?? 'unknown'}: ${failure ?? 'unknown failure'})`).join(', ')}`,
    );
  }
}
