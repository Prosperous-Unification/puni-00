/** Evidence that the earlier rows of the test level table require. Paths are workspace-relative. */
export interface TestLevelFacts {
  readonly manualProcedures: ReadonlySet<string>;
  readonly conformanceFiles: ReadonlySet<string>;
  readonly architectureFixtures: ReadonlySet<string>;
  readonly performanceFiles: ReadonlySet<string>;
  readonly browserFiles: ReadonlySet<string>;
  readonly frontendNodeSuites: ReadonlySet<string>;
}

/** The eight test levels, ordered by the contract's first-match table. */
export type TestLevel =
  | 'manual'
  | 'conformance'
  | 'architecture'
  | 'performance'
  | 'browser'
  | 'api'
  | 'unit'
  | 'view';

/**
 * Classifies a tracked test against the ten-row test-axes table.
 *
 * The caller supplies evidence for policy and runner membership. In particular,
 * `browserFiles` must come from a recorded Playwright collection, not a guessed
 * directory, and `conformanceFiles` from the project's target command.
 *
 * @throws when an asserted Performance file is absent from the browser suite or
 * when no row recognizes the file.
 */
export function classifyTestFile(path: string, facts: TestLevelFacts): TestLevel {
  if (facts.manualProcedures.has(path)) return 'manual';
  // Proof: the ordered-table test's `.db.test.ts` conformance case fails as `api`
  // when this membership guard is removed (2026-10-09).
  if (facts.conformanceFiles.has(path)) return 'conformance';
  if (facts.architectureFixtures.has(path)) return 'architecture';
  if (facts.performanceFiles.has(path)) {
    // Proof: a Performance assertion on `elsewhere/check.spec.ts` fails this
    // guard with `not in a declared Playwright suite` (2026-10-09).
    if (!facts.browserFiles.has(path)) {
      throw new Error(`${path} claims Performance but is not in a declared Playwright suite`);
    }
    return 'performance';
  }
  if (facts.browserFiles.has(path)) return 'browser';
  if (/\.db\.test\.[cm]?[jt]sx?$/.test(path)) return 'api';
  if (facts.frontendNodeSuites.has(path)) return 'unit';
  if (/^apps\/wbs\/fe-01\/src\/.*\.test\.[cm]?[jt]sx?$/.test(path)) return 'view';
  if (/\.test\.[cm]?[jt]sx$/.test(path)) return 'view';
  if (/\.test\.[cm]?[jt]s$/.test(path)) return 'unit';
  // Proof: `elsewhere/check.spec.ts` fails with its path when this guard remains;
  // changing it to Unit makes the unknown-file test fail (2026-10-09).
  throw new Error(`${path} matches no row of the level-selection table`);
}
