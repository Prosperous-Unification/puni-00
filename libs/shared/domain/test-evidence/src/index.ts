import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { type } from 'arktype';

export {
  type BrowserCase,
  decodeBrowserJson,
  reconcileBrowserJunit,
  reconcileBrowserRuns,
} from './browser-playwright';

/** Portable SHA-256 for raw reporter and build artifact bindings. */
export function digestEvidenceBytes(bytes: Uint8Array | string): string {
  return bytesToHex(sha256(typeof bytes === 'string' ? utf8ToBytes(bytes) : bytes));
}

const UnitRecord = type("'ms'|'bytes'|'count'|'fps'");
const OperatorRecord = type("'lte'|'gte'");

// Proof: changing this undeclared-key rule to ignore let a case-local unexpected field reach
// runner execution; the production schema test failed instead of refusing the field.
const CaseRecord = type({
  caseId: 'string>=1',
  fixture: 'string>=1',
  titlePath: type('string>=1').array(),
  measurement: 'string>=1',
  unit: UnitRecord,
  operator: OperatorRecord,
  threshold: 'number',
}).onUndeclaredKey('reject');

// Proof: changing the outer undeclared-key rule to ignore made the production schema test
// accept an unexpected field and fail with the later runner error.
const PerformanceCasesRecord = type({
  schemaVersion: '1',
  config: 'string>=1',
  project: 'string>=1',
  cases: CaseRecord.array(),
}).onUndeclaredKey('reject');

/** Versioned candidate declaration for one Performance Playwright selection. */
export type PerformanceCases = typeof PerformanceCasesRecord.infer;

/** SHA-256 of the domain-separated canonical declaration; its schema has ASCII field names. */
export function digestPerformanceDeclaration(declaration: PerformanceCases): string {
  const source = JSON.stringify(
    { schemaVersion: 1, kind: 'performance-declaration', declaration },
    // Proof: removing key ordering made the differently ordered declaration test
    // produce a different digest for the same decoded Performance cases.
    (_field, value: unknown): unknown =>
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([left], [right]) =>
              left < right ? -1 : left > right ? 1 : 0,
            ),
          )
        : value,
  );
  // Proof: disabling the negative-zero rejection made the canonical digest test accept
  // a threshold that Burokrat's canonical JSON identity refuses.
  if (declaration.cases.some((performanceCase) => Object.is(performanceCase.threshold, -0))) {
    throw new Error('Performance declaration cannot be serialized canonically');
  }
  return bytesToHex(sha256(utf8ToBytes(`${source}\n`)));
}

const ObservationRecord = type({
  measurement: 'string>=1',
  unit: UnitRecord,
  value: 'number',
}).onUndeclaredKey('reject');

const PerformanceMeasurementRecord = type({
  schemaVersion: '1',
  caseId: 'string>=1',
  measurement: 'string>=1',
  unit: UnitRecord,
  value: 'number',
}).onUndeclaredKey('reject');

export type PerformanceMeasurement = typeof PerformanceMeasurementRecord.infer;

/** A fixture's one measured observation, transported as a JSON attachment. */
export function decodePerformanceMeasurement(input: unknown): PerformanceMeasurement {
  const measurement = PerformanceMeasurementRecord(input);
  // Proof: disabling this branch made the unexpected-field attachment test fail with a
  // later shape error instead of its named schema refusal.
  if (measurement instanceof type.errors) {
    throw new Error(`Invalid Performance measurement: ${measurement.summary}`);
  }
  // Proof: disabling this guard made the Infinity attachment test accept a nonfinite value.
  if (!Number.isFinite(measurement.value)) {
    throw new Error(`Performance measurement ${measurement.caseId} must be finite`);
  }
  return measurement;
}

const ExecutedCaseRecord = type({
  caseId: 'string>=1',
  status: "'passed'|'failed'|'skipped'",
  observations: ObservationRecord.array(),
}).onUndeclaredKey('reject');

const PerformanceRunRecord = type({
  schemaVersion: '1',
  exitCode: 'number.integer',
  cases: ExecutedCaseRecord.array(),
}).onUndeclaredKey('reject');

/** Versioned normalized outcomes from the exact discovered Playwright selection. */
export type PerformanceRun = typeof PerformanceRunRecord.infer;

const PerformanceSelectionRecord = type({
  declarationPath: 'string>=1',
  config: 'string>=1',
  project: 'string>=1',
  configDigest: /^[0-9a-f]{64}$/,
  runnerVersion: 'string>=1',
  listArguments: type('string').array(),
  runArguments: type('string').array(),
  selectionEnvironment: type.Record('string', 'string'),
}).onUndeclaredKey('reject');

const PerformanceEvidenceRecord = type({
  schemaVersion: '1',
  candidate: /^[0-9a-f]{64}$/,
  policyDigest: /^[0-9a-f]{64}$/,
  declarationDigest: /^[0-9a-f]{64}$/,
  selection: PerformanceSelectionRecord,
  run: PerformanceRunRecord,
}).onUndeclaredKey('reject');

export type PerformanceEvidence = typeof PerformanceEvidenceRecord.infer;

/** Strict transport for a runner's candidate-bound execution record. */
export function decodePerformanceEvidence(input: unknown): PerformanceEvidence {
  const evidence = PerformanceEvidenceRecord(input);
  // Proof: disabling this branch made the production unexpected-evidence-field test fail;
  // malformed input reached path validation instead of a named schema refusal.
  if (evidence instanceof type.errors) {
    throw new Error(`Invalid Performance evidence: ${evidence.summary}`);
  }
  assertWorkspacePath(evidence.selection.declarationPath);
  assertWorkspacePath(evidence.selection.config);
  decodePerformanceRun(evidence.run);
  return evidence;
}

/** A repository-relative path that cannot traverse or change spelling under normalization. */
export function assertWorkspacePath(path: string): void {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    // Proof: removing the '..' rejection let a traversing fixture reach runner execution;
    // the production "rejects a traversing fixture" test failed.
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Performance path is not a normalized workspace path: ${path}`);
  }
}

/**
 * Decodes one strict candidate-owned Performance declaration.
 *
 * Several cases may live in one fixture; each case ID and exact runner tuple is unique.
 * @throws when schema, paths, thresholds or identities are malformed.
 */
export function decodePerformanceCases(input: unknown): PerformanceCases {
  const declaration = PerformanceCasesRecord(input);
  // Proof: disabling this error branch changed the production unexpected-field refusal into
  // a TypeError in assertWorkspacePath; its named schema test failed.
  if (declaration instanceof type.errors) {
    throw new Error(`Invalid Performance declaration: ${declaration.summary}`);
  }
  // Proof: deleting this call changed the production traversing-config refusal into the
  // later identity-mismatch error, failing the normalized-path assertion.
  assertWorkspacePath(declaration.config);
  const ids = new Set<string>();
  const runners = new Set<string>();
  for (const performanceCase of declaration.cases) {
    // Proof: deleting this call let ../outside.perf.spec.ts reach runner execution; the
    // production "rejects a traversing fixture" test failed with the runner error.
    assertWorkspacePath(performanceCase.fixture);
    // Proof: disabling this guard let an empty title reach runner execution; the production
    // "rejects missing title" test failed instead of reporting the absent title path.
    if (performanceCase.titlePath.length === 0) {
      throw new Error(`Performance case ${performanceCase.caseId} has no full title path`);
    }
    // Proof: disabling this guard let JSON's 1e999 threshold reach runner execution;
    // the production threshold test failed instead of reporting a finite-threshold error.
    if (!Number.isFinite(performanceCase.threshold)) {
      throw new Error(`Performance case ${performanceCase.caseId} needs a finite threshold`);
    }
    // Proof: disabling this guard made the duplicate-ID production test report only the later
    // runner-tuple collision, so its expected case-ID refusal failed.
    if (ids.has(performanceCase.caseId)) {
      throw new Error(`duplicate Performance case ID: ${performanceCase.caseId}`);
    }
    ids.add(performanceCase.caseId);
    const runner = JSON.stringify([
      declaration.config,
      declaration.project,
      performanceCase.fixture,
      performanceCase.titlePath,
    ]);
    // Proof: disabling this guard let two case IDs claim one Playwright tuple; the production
    // duplicate-runner-identity test failed with the later runner error.
    if (runners.has(runner)) {
      throw new Error(`duplicate Performance runner identity: ${runner}`);
    }
    runners.add(runner);
  }
  return declaration;
}

/** Decodes measured executions; the judge reconciles these identities with declarations. */
export function decodePerformanceRun(input: unknown): PerformanceRun {
  const execution = PerformanceRunRecord(input);
  // Proof: disabling this branch made the unknown-field test fail with a TypeError
  // while iterating execution.cases instead of naming the unexpected field.
  if (execution instanceof type.errors) {
    throw new Error(`Invalid Performance run: ${execution.summary}`);
  }
  const ids = new Set<string>();
  for (const executedCase of execution.cases) {
    // Proof: disabling this guard made the duplicate-execution test accept two outcomes
    // for paint-ready instead of throwing.
    if (ids.has(executedCase.caseId)) {
      throw new Error(`duplicate Performance execution case: ${executedCase.caseId}`);
    }
    ids.add(executedCase.caseId);
    const measurements = new Set<string>();
    for (const observation of executedCase.observations) {
      // Proof: disabling this guard made the finite-observation test accept Infinity.
      if (!Number.isFinite(observation.value)) {
        throw new Error(`Performance observation ${executedCase.caseId} must be finite`);
      }
      // Proof: disabling this guard made the duplicate-observation test accept two
      // paint-ready measurements instead of throwing.
      if (measurements.has(observation.measurement)) {
        throw new Error(
          `duplicate Performance observation ${observation.measurement} for ${executedCase.caseId}`,
        );
      }
      measurements.add(observation.measurement);
    }
  }
  return execution;
}

/** Recomputes a declared comparison over an actual finite observation. */
export function compareThreshold(input: {
  readonly operator: PerformanceCases['cases'][number]['operator'];
  readonly threshold: number;
  readonly observation: number;
}): boolean {
  // Proof: disabling this guard made the comparison test accept an infinite threshold.
  if (!Number.isFinite(input.threshold)) throw new Error('Performance needs a finite threshold');
  // Proof: disabling this guard made the comparison test return false for NaN instead of
  // refusing a nonfinite observation.
  if (!Number.isFinite(input.observation)) {
    throw new Error('Performance needs a finite observation');
  }
  // Proof: swapping the selected operator made the lte=180/200 comparison test return false.
  return input.operator === 'lte'
    ? input.observation <= input.threshold
    : input.observation >= input.threshold;
}
