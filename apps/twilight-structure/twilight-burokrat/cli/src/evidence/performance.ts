import {
  compareThreshold,
  decodePerformanceCases,
  decodePerformanceRun,
  type PerformanceCases,
  type PerformanceRun,
} from '@shared/test-evidence';

import type { RulePolicy } from '../rules/rule-policy';
import { hashCanonical } from './content-manifest';

/** The loaded external RulePolicy and its exact stable byte identity. */
export interface PerformanceAuthority {
  readonly policy: Pick<RulePolicy, 'performance'>;
  readonly policyDigest: string;
}

/** Inputs the caller must derive from the selected candidate and actual Playwright process. */
export interface PerformanceSelection {
  readonly declarationPath: string;
  readonly config: string;
  readonly project: string;
  readonly configDigest: string;
  readonly runnerVersion: string;
  readonly listArguments: readonly string[];
  readonly runArguments: readonly string[];
  readonly selectionEnvironment: Readonly<Record<string, string>>;
}

export interface PerformanceCaseVerdict {
  readonly caseId: string;
  readonly fixture: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly observed: number;
  readonly threshold: number;
  readonly passed: boolean;
}

/** Identity reviewed by RulePolicy.performance, including all comparison terms. */
export function digestPerformanceCase(performanceCase: PerformanceCases['cases'][number]): string {
  return hashCanonical({ schemaVersion: 1, kind: 'performance-case', record: performanceCase });
}

/**
 * Reconciles exact reviewed declarations and executions, then recomputes every comparison.
 * Missing Performance authority refuses even when the rule mode is observe.
 */
export function evaluatePerformanceRun(
  declarationInput: unknown,
  executionInput: unknown,
  authority: PerformanceAuthority,
  selection: PerformanceSelection,
): {
  readonly declarationDigest: string;
  readonly policyDigest: string;
  readonly selectionDigest: string;
  readonly cases: PerformanceCaseVerdict[];
} {
  const declaration = decodePerformanceCases(declarationInput);
  const execution = decodePerformanceRun(executionInput);
  const reviewed = authority.policy.performance;
  // Proof: removing this refusal made the absent-policy judge test accept missing authority.
  if (reviewed === undefined) {
    throw new Error('rule PERF-THRESHOLD needs policy.performance, which the rule policy omits');
  }
  // Proof: removing this check made the reviewed-config mismatch test accept a changed config.
  if (reviewed.config !== declaration.config) {
    throw new Error(`Performance config mismatch: ${declaration.config}`);
  }
  // Proof: removing this check made the reviewed-path mismatch test accept another declaration.
  if (reviewed.declarationPath !== selection.declarationPath) {
    throw new Error(`Performance declaration path mismatch: ${selection.declarationPath}`);
  }
  // Proof: disabling this guard made the changed executed-config judge test fail because
  // it no longer received the expected mismatch refusal.
  if (selection.config !== declaration.config) {
    throw new Error(`Performance executed config mismatch: ${selection.config}`);
  }
  // Proof: disabling this guard made the changed config-digest judge test fail without
  // its expected mismatch refusal.
  if (reviewed.configDigest !== selection.configDigest) {
    throw new Error(`Performance config digest mismatch: ${declaration.config}`);
  }
  // Proof: removing this check made the reviewed-project mismatch test accept another project.
  if (reviewed.project !== declaration.project) {
    throw new Error(`Performance project mismatch: ${declaration.project}`);
  }
  // Proof: disabling this guard made the changed executed-project judge test fail without
  // its expected mismatch refusal.
  if (selection.project !== declaration.project) {
    throw new Error(`Performance executed project mismatch: ${selection.project}`);
  }
  // Proof: disabling this guard made the changed runner-version judge test fail without
  // its expected mismatch refusal.
  if (reviewed.runnerVersion !== selection.runnerVersion) {
    throw new Error(`Performance runner version mismatch: ${selection.runnerVersion}`);
  }
  const expectedList = [
    'test',
    '--config',
    declaration.config,
    '--project',
    declaration.project,
    '--list',
    '--reporter=json',
  ];
  const expectedRun = [
    'test',
    '--config',
    declaration.config,
    '--project',
    declaration.project,
    '--reporter=json',
  ];
  // Proof: disabling this guard made the extra discovery --grep test fail without
  // its expected selection refusal.
  if (JSON.stringify(selection.listArguments) !== JSON.stringify(expectedList)) {
    throw new Error('Performance discovery selection arguments mismatch');
  }
  // Proof: disabling this guard made the extra execution --grep test fail without
  // its expected selection refusal.
  if (JSON.stringify(selection.runArguments) !== JSON.stringify(expectedRun)) {
    throw new Error('Performance execution selection arguments mismatch');
  }
  // Proof: disabling this guard made the injected PLAYWRIGHT_GREP test fail without
  // its expected environment refusal.
  if (Object.keys(selection.selectionEnvironment).length !== 0) {
    throw new Error('Performance selection environment must be empty for the dedicated config');
  }
  // Proof: removing this check made the failed-runner test accept exit code 1.
  if (execution.exitCode !== 0) {
    throw new Error(`Performance runner exited ${String(execution.exitCode)}`);
  }
  const byReview = new Map(reviewed.reviewedCases.map((review) => [review.caseId, review]));
  // Proof: removing this check made the duplicate-review test accept a collapsed policy map.
  if (byReview.size !== reviewed.reviewedCases.length) {
    throw new Error('duplicate Performance reviewed case ID');
  }
  const byDeclaration = new Map(
    declaration.cases.map((performanceCase) => [performanceCase.caseId, performanceCase]),
  );
  for (const review of reviewed.reviewedCases) {
    // Proof: removing this check made the policy-only review test accept an extra case.
    if (!byDeclaration.has(review.caseId)) {
      throw new Error(`reviewed case missing from Performance declaration: ${review.caseId}`);
    }
  }
  for (const performanceCase of declaration.cases) {
    const review = byReview.get(performanceCase.caseId);
    // Proof: removing this check made the missing-review test accept an unreviewed case.
    if (review === undefined) {
      throw new Error(`missing Performance review for ${performanceCase.caseId}`);
    }
    // Proof: removing this check made the changed-threshold test accept an old review.
    if (review.caseDigest !== digestPerformanceCase(performanceCase)) {
      throw new Error(`Performance reviewed digest mismatch for ${performanceCase.caseId}`);
    }
  }
  const byExecution = new Map(
    execution.cases.map((executedCase) => [executedCase.caseId, executedCase]),
  );
  for (const executedCase of execution.cases) {
    // Proof: removing this check made the unknown-execution test accept an extra case.
    if (!byDeclaration.has(executedCase.caseId)) {
      throw new Error(`unknown execution for Performance case ${executedCase.caseId}`);
    }
  }
  const judgments: PerformanceCaseVerdict[] = [];
  for (const performanceCase of declaration.cases) {
    const executedCase = byExecution.get(performanceCase.caseId);
    // Proof: removing this check made the missing-execution test accept no run.
    if (executedCase === undefined) {
      throw new Error(`missing execution for Performance case ${performanceCase.caseId}`);
    }
    judgments.push(judgeCase(performanceCase, executedCase));
  }
  return {
    declarationDigest: hashCanonical({
      schemaVersion: 1,
      kind: 'performance-declaration',
      declaration,
    }),
    policyDigest: authority.policyDigest,
    selectionDigest: hashCanonical({
      schemaVersion: 1,
      kind: 'performance-selection',
      declarationPath: selection.declarationPath,
      config: selection.config,
      project: selection.project,
      configDigest: selection.configDigest,
      runnerVersion: selection.runnerVersion,
      listArguments: selection.listArguments,
      runArguments: selection.runArguments,
      selectionEnvironment: selection.selectionEnvironment,
    }),
    cases: judgments,
  };
}

function judgeCase(
  performanceCase: PerformanceCases['cases'][number],
  executedCase: PerformanceRun['cases'][number],
): PerformanceCaseVerdict {
  const observation = executedCase.observations.find(
    (entry) => entry.measurement === performanceCase.measurement,
  );
  // Proof: removing this check made the missing-observation test lose its named refusal.
  if (observation === undefined) {
    throw new Error(`missing observation for Performance case ${performanceCase.caseId}`);
  }
  // Proof: removing this check made the extra-observation test accept a second metric.
  if (executedCase.observations.length !== 1) {
    throw new Error(`unexpected observation for Performance case ${performanceCase.caseId}`);
  }
  // Proof: removing this check made the wrong-unit test accept incompatible measurements.
  if (observation.unit !== performanceCase.unit) {
    throw new Error(`Performance observation unit mismatch for ${performanceCase.caseId}`);
  }
  return {
    caseId: performanceCase.caseId,
    fixture: performanceCase.fixture,
    status: executedCase.status,
    observed: observation.value,
    threshold: performanceCase.threshold,
    // Proof: replacing the status predicate with true made the failed/skipped judge test
    // accept those cases as passing when their measurements met the threshold.
    passed:
      executedCase.status === 'passed' &&
      compareThreshold({
        operator: performanceCase.operator,
        threshold: performanceCase.threshold,
        observation: observation.value,
      }),
  };
}
