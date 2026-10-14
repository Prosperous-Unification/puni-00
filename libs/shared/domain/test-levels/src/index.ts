/** Evidence for the complete test level table. Paths are workspace-relative. */
export interface TestLevelFacts {
  readonly frontendSourceRoot: string;
  readonly manualProcedures: ReadonlySet<string>;
  readonly conformanceFiles: ReadonlySet<string>;
  readonly architectureFixtures: ReadonlySet<string>;
  readonly performanceFiles: ReadonlySet<string>;
  readonly browserFiles: ReadonlySet<string>;
  readonly frontendNodeSuites: ReadonlySet<string>;
}

/** The eight test levels, ordered by the contract's first-match table. */
export type TestLevel =
  'manual' | 'conformance' | 'architecture' | 'performance' | 'browser' | 'api' | 'unit' | 'view';

/** Complete declared membership for the first four rows; later classification facts are absent. */
export type DeclaredTestFacts = Pick<
  TestLevelFacts,
  | 'manualProcedures'
  | 'conformanceFiles'
  | 'architectureFixtures'
  | 'performanceFiles'
  | 'browserFiles'
>;

/** The earlier rows resolved entirely from declared membership and recorded Playwright collection. */
export type DeclaredTestLevel = Extract<
  TestLevel,
  'manual' | 'conformance' | 'architecture' | 'performance'
>;

/**
 * Applies the first four rows in order, returning undefined only when a later row is needed.
 * @throws when Performance membership is absent from the recorded Playwright collection.
 */
export function classifyDeclaredTest(
  path: string,
  facts: DeclaredTestFacts,
): DeclaredTestLevel | undefined {
  if (facts.manualProcedures.has(path)) return 'manual';
  // Proof: the ordered-table test's `.db.test.ts` conformance case fails as `api`
  // when this membership guard is removed (2026-10-09).
  // Proof: removing or moving this row behind Architecture failed [TEST-AXES-089]'s
  // production CLI three-way overlap and Conformance-only isolation assertions.
  if (facts.conformanceFiles.has(path)) return 'conformance';
  // Proof: removing either declared row or placing Architecture first failed
  // [TEST-AXES-089]'s real CLI Conformance/Architecture/Performance overlap assertions.
  if (facts.architectureFixtures.has(path)) return 'architecture';
  // Proof: removing this row failed [TEST-AXES-087]'s complete real Performance CLI case.
  if (facts.performanceFiles.has(path)) {
    // Proof: replacing this guard with `if (false)` made the production classifier
    // negative accept `elsewhere/check.spec.ts` as Performance (2026-10-09).
    // Proof: disabling this guard accepted [TEST-AXES-088]'s production CLI classifier
    // dependency fault that removed recorded Playwright membership.
    if (!facts.browserFiles.has(path)) {
      throw new Error(`${path} claims Performance but is not in a declared Playwright suite`);
    }
    return 'performance';
  }
  return undefined;
}

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
  const declared = classifyDeclaredTest(path, facts);
  if (declared !== undefined) return declared;
  if (facts.browserFiles.has(path)) return 'browser';
  // Proof: `.db.test.tsx` reached API and the ordered-table negative received
  // `api` instead of `view`; the exact `.db.test.ts` suffix makes it pass.
  if (path.endsWith('.db.test.ts')) return 'api';
  if (facts.frontendNodeSuites.has(path)) return 'unit';
  if (
    path.startsWith(`${facts.frontendSourceRoot}/`) &&
    (path.endsWith('.test.tsx') || path.endsWith('.test.ts'))
  )
    return 'view';
  if (path.endsWith('.test.tsx')) return 'view';
  if (path.endsWith('.test.ts')) return 'unit';
  // Proof: `elsewhere/check.spec.ts` fails with its path when this guard remains;
  // changing it to Unit makes the unknown-file test fail (2026-10-09).
  throw new Error(`${path} matches no row of the level-selection table`);
}
