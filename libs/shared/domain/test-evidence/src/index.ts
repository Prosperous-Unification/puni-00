import { type } from 'arktype';

// Proof: changing this undeclared-key rule to ignore let a case-local unexpected field reach
// runner execution; the production schema test failed instead of refusing the field.
const CaseRecord = type({
  caseId: 'string>=1',
  fixture: 'string>=1',
  titlePath: type('string>=1').array(),
  measurement: 'string>=1',
  unit: "'ms'|'bytes'|'count'|'fps'",
  operator: "'lte'|'gte'",
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
