import { Buffer } from 'node:buffer';
import { relative, resolve } from 'node:path';

import {
  assertWorkspacePath,
  decodePerformanceMeasurement,
  decodePerformanceRun,
  type PerformanceCases,
  type PerformanceRun,
} from '@shared/test-evidence';

export const performanceAttachmentName = 'puni.performance.observation.v1';

interface CollectedCase {
  caseId: string;
  fixture: string;
  titlePath: string[];
  execution?: PerformanceRun['cases'][number];
}

/** JSON boundary for a Playwright reporter record. */
function recordOf(input: unknown, label: string): Record<string, unknown> {
  // Proof: disabling the plain-record boundary made the malformed-config test receive a
  // later runner-version error instead of refusing the malformed config record.
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    throw new Error(`invalid Playwright JSON ${label}`);
  }
  // The plain-record boundary above makes indexed property reads safe.
  return input as Record<string, unknown>;
}

function arrayOf(input: unknown, label: string): unknown[] {
  // Proof: disabling the array boundary made the malformed-projects test receive a
  // null.length TypeError instead of the named Playwright schema refusal.
  if (!Array.isArray(input)) throw new Error(`invalid Playwright JSON ${label}`);
  return input;
}

function stringOf(input: unknown, label: string): string {
  // Proof: disabling the string boundary made the empty-version test accept a runner
  // record without a usable version identity.
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error(`invalid Playwright JSON ${label}`);
  }
  return input;
}

function suiteCases(
  suiteInput: unknown,
  fixture: string,
  titles: string[],
  phase: 'list' | 'run',
  project: string,
  declaration: PerformanceCases,
): CollectedCase[] {
  const suite = recordOf(suiteInput, 'suite');
  const cases: CollectedCase[] = [];
  for (const specInput of arrayOf(suite['specs'], 'suite specs')) {
    const spec = recordOf(specInput, 'spec');
    const specTitle = stringOf(spec['title'], 'spec title');
    // Proof: disabling this check made the wrong-spec-file test accept a spec assigned
    // to another suite file.
    if (spec['file'] !== suite['file'])
      throw new Error('Playwright spec file differs from its suite');
    const titlePath = [...titles, specTitle];
    const matching = declaration.cases.filter(
      (performanceCase) =>
        performanceCase.fixture === fixture &&
        JSON.stringify(performanceCase.titlePath) === JSON.stringify(titlePath),
    );
    // Proof: disabling this exact match made the unknown-case test lose its named
    // undeclared-case refusal and reach a later undefined lookup.
    if (matching.length !== 1) {
      throw new Error(
        `Playwright ${phase} case is undeclared or ambiguous: ${fixture} ${titlePath.join(' › ')}`,
      );
    }
    const performanceCase = matching[0];
    const tests = arrayOf(spec['tests'], 'spec tests');
    // Proof: disabling selected-test cardinality made the zero-tests parser fixture
    // receive a later invalid project record instead of the exact-selection refusal.
    if (tests.length !== 1)
      throw new Error(
        `Playwright ${phase} case needs exactly one selected project: ${performanceCase.caseId}`,
      );
    const testRun = recordOf(tests[0], 'project test');
    // Proof: disabling per-test project identity made the wrong-project test accept a
    // case recorded under firefox while the report claimed chromium.
    if (testRun['projectName'] !== project)
      throw new Error(`Playwright ${phase} project mismatch for ${performanceCase.caseId}`);
    const outcomes = arrayOf(testRun['results'], 'case results');
    if (phase === 'list') {
      // Proof: disabling list-only status made a list record carrying execution look
      // like fresh collection in the parser negative.
      if (outcomes.length !== 0 || testRun['status'] !== 'skipped') {
        throw new Error(`Playwright list contains execution for ${performanceCase.caseId}`);
      }
      cases.push({ caseId: performanceCase.caseId, fixture, titlePath });
      continue;
    }
    // Proof: disabling run-result cardinality made the actual missing-result runner
    // target receive `invalid Playwright JSON case result` instead of this refusal.
    if (outcomes.length !== 1)
      throw new Error(`Playwright run needs one result for ${performanceCase.caseId}`);
    const outcome = recordOf(outcomes[0], 'case result');
    const rawStatus = stringOf(outcome['status'], 'case status');
    const status: PerformanceRun['cases'][number]['status'] =
      rawStatus === 'passed' && testRun['status'] === 'expected'
        ? 'passed'
        : rawStatus === 'skipped' || testRun['status'] === 'skipped'
          ? 'skipped'
          : 'failed';
    const attachments = arrayOf(outcome['attachments'], 'case attachments');
    const measured = attachments.filter(
      (attachmentInput) =>
        recordOf(attachmentInput, 'attachment')['name'] === performanceAttachmentName,
    );
    // Proof: disabling cardinality made the actual missing-attachment runner target
    // receive `invalid Playwright JSON observation attachment` instead of this refusal.
    if (measured.length !== 1)
      throw new Error(
        `Performance case ${performanceCase.caseId} needs exactly one fresh observation attachment`,
      );
    const attachment = recordOf(measured[0], 'observation attachment');
    // Proof: disabling this format check made the text/plain transport fixture count as
    // a valid measured JSON attachment.
    if (attachment['contentType'] !== 'application/json' || attachment['path'] !== undefined) {
      throw new Error(
        `Performance observation attachment format mismatch for ${performanceCase.caseId}`,
      );
    }
    const encoded = stringOf(attachment['body'], 'observation body');
    const bytes = Buffer.from(encoded, 'base64');
    // Proof: disabling this check made the malformed-base64 test receive a later JSON error
    // instead of the exact transport refusal.
    if (bytes.toString('base64') !== encoded)
      throw new Error(`Performance observation base64 is malformed for ${performanceCase.caseId}`);
    let measurementInput: unknown;
    try {
      measurementInput = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      ) as unknown;
    } catch (cause) {
      throw new Error(`Performance observation JSON is unreadable for ${performanceCase.caseId}`, {
        cause,
      });
    }
    const measurement = decodePerformanceMeasurement(measurementInput);
    // Proof: disabling this match made the wrong-case-identity test accept a foreign
    // attachment as paint-ready evidence.
    if (
      measurement.caseId !== performanceCase.caseId ||
      measurement.measurement !== performanceCase.measurement ||
      measurement.unit !== performanceCase.unit
    ) {
      throw new Error(`Performance observation identity mismatch for ${performanceCase.caseId}`);
    }
    cases.push({
      caseId: performanceCase.caseId,
      fixture,
      titlePath,
      execution: {
        caseId: performanceCase.caseId,
        status,
        observations: [
          {
            measurement: measurement.measurement,
            unit: measurement.unit,
            value: measurement.value,
          },
        ],
      },
    });
  }
  for (const childInput of suite['suites'] === undefined
    ? []
    : arrayOf(suite['suites'], 'nested suites')) {
    const child = recordOf(childInput, 'nested suite');
    // Proof: disabling nested-file equality made the malformed nested-suite test receive
    // only a later spec-file error rather than refusing the suite identity itself.
    if (child['file'] !== suite['file']) throw new Error('Playwright nested suite file mismatch');
    cases.push(
      ...suiteCases(
        child,
        fixture,
        [...titles, stringOf(child['title'], 'nested title')],
        phase,
        project,
        declaration,
      ),
    );
  }
  return cases;
}

interface ListedReport {
  version: string;
  cases: CollectedCase[];
}

interface ExecutedReport extends ListedReport {
  execution: PerformanceRun;
}

/** Strictly binds Playwright JSON collection/execution to every declared case identity. */
export function decodePlaywrightReport(
  input: unknown,
  checkoutRoot: string,
  declaration: PerformanceCases,
  phase: 'list',
  exitCode: number,
): ListedReport;
export function decodePlaywrightReport(
  input: unknown,
  checkoutRoot: string,
  declaration: PerformanceCases,
  phase: 'run',
  exitCode: number,
): ExecutedReport;
export function decodePlaywrightReport(
  input: unknown,
  checkoutRoot: string,
  declaration: PerformanceCases,
  phase: 'list' | 'run',
  exitCode: number,
): ListedReport | ExecutedReport;
export function decodePlaywrightReport(
  input: unknown,
  checkoutRoot: string,
  declaration: PerformanceCases,
  phase: 'list' | 'run',
  exitCode: number,
): ListedReport | ExecutedReport {
  const report = recordOf(input, 'report');
  const config = recordOf(report['config'], 'config');
  const version = stringOf(config['version'], 'runner version');
  // Proof: disabling this match made the wrong-config parser test accept an outside config.
  if (config['configFile'] !== resolve(checkoutRoot, declaration.config)) {
    throw new Error('Playwright executed config path mismatch');
  }
  const rootDir = stringOf(config['rootDir'], 'rootDir');
  // Every resolved fixture is checked for containment below, and exact declared-case
  // equality rejects a different in-workspace rootDir.
  const projects = arrayOf(config['projects'], 'projects');
  // Proof: disabling this match made the wrong-project parser test accept firefox collection.
  if (projects.length !== 1 || recordOf(projects[0], 'project')['name'] !== declaration.project) {
    throw new Error('Playwright selected project mismatch');
  }
  // Proof: disabling top-level error refusal made the synthetic Playwright error report
  // count as successful collection.
  if (arrayOf(report['errors'], 'report errors').length !== 0) {
    throw new Error(`Playwright ${phase} reported top-level errors`);
  }
  const cases: CollectedCase[] = [];
  for (const suiteInput of arrayOf(report['suites'], 'file suites')) {
    const suite = recordOf(suiteInput, 'file suite');
    const file = stringOf(suite['file'], 'suite file');
    // Proof: disabling suite-file normalization made the traversal test receive a later
    // nested-suite identity error instead of rejecting the unsafe path at its boundary.
    assertWorkspacePath(file);
    const fixture = relative(checkoutRoot, resolve(rootDir, file)).replaceAll('\\', '/');
    // Proof: disabling resolved-fixture containment made the outside-root test receive
    // a later undeclared-case error with a ../../ path rather than a path refusal.
    assertWorkspacePath(fixture);
    cases.push(...suiteCases(suite, fixture, [], phase, declaration.project, declaration));
  }
  const ids = new Set(cases.map((performanceCase) => performanceCase.caseId));
  // Proof: disabling exact-set cardinality made the duplicate-collection test accept two
  // executed entries for one reviewed Performance case.
  if (ids.size !== cases.length || cases.length !== declaration.cases.length) {
    throw new Error(`Playwright ${phase} collection differs from declared Performance cases`);
  }
  for (const performanceCase of declaration.cases) {
    if (!ids.has(performanceCase.caseId)) {
      throw new Error(`Playwright ${phase} missed Performance case ${performanceCase.caseId}`);
    }
  }
  if (phase === 'list') return { version, cases };
  const execution = decodePerformanceRun({
    schemaVersion: 1,
    exitCode,
    cases: cases.map((performanceCase) => {
      if (performanceCase.execution === undefined) {
        throw new Error(`Playwright execution missing for ${performanceCase.caseId}`);
      }
      return performanceCase.execution;
    }),
  });
  return { version, cases, execution };
}
