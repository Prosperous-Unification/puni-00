import { relative, resolve } from 'node:path';

import { assertWorkspacePath } from '@shared/test-evidence';
import { SaxesParser } from 'saxes';

export interface BrowserCase {
  config: string;
  project: string;
  file: string;
  titlePath: string[];
  status: 'passed' | 'failed' | 'skipped';
}

interface BrowserReport {
  version: string;
  cases: BrowserCase[];
}

function recordOf(input: unknown, label: string): Record<string, unknown> {
  // Proof: disabling this guard made the malformed-config negative fail with a TypeError.
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error(`Browser ${label} is malformed`);
  return input as Record<string, unknown>;
}

function arrayOf(input: unknown, label: string): unknown[] {
  // Proof: disabling this guard made the missing-suites negative fail with a later iterator error.
  if (!Array.isArray(input)) throw new Error(`Browser ${label} is malformed`);
  return input;
}

function stringOf(input: unknown, label: string): string {
  // Proof: disabling this guard made the empty-project negative fail at later project matching.
  if (typeof input !== 'string' || input.length === 0)
    throw new Error(`Browser ${label} is malformed`);
  return input;
}

function identity(browserCase: BrowserCase): string {
  return JSON.stringify([
    browserCase.config,
    browserCase.project,
    browserCase.file,
    browserCase.titlePath,
  ]);
}

/** Strict Playwright discovery or execution for one selected config and project set. */
export function decodeBrowserJson(
  input: unknown,
  root: string,
  configPath: string,
  selectedProjects: readonly string[],
  phase: 'list' | 'run',
  exitCode: number,
): BrowserReport {
  const report = recordOf(input, 'report');
  const config = recordOf(report['config'], 'config');
  // Proof: disabling this guard made the foreign-config negative unexpectedly accept its report.
  if (config['configFile'] !== resolve(root, configPath))
    throw new Error('Browser config path mismatch');
  const version = stringOf(config['version'], 'version');
  const rootDir = stringOf(config['rootDir'], 'rootDir');
  const projects = arrayOf(config['projects'], 'projects').map((entry) =>
    stringOf(recordOf(entry, 'project')['name'], 'project name'),
  );
  // Proof: disabling this guard made the foreign-project negative fail at later case matching.
  if (
    projects.length !== selectedProjects.length ||
    projects.some((project, index) => project !== selectedProjects[index])
  )
    throw new Error('Browser project selection mismatch');
  // Proof: disabling this guard made the top-level-error negative unexpectedly accept collection.
  if (arrayOf(report['errors'], 'errors').length !== 0)
    throw new Error(`Browser ${phase} has top-level errors`);
  const cases: BrowserCase[] = [];
  function collect(suiteInput: unknown, file: string, titles: string[]): void {
    const suite = recordOf(suiteInput, 'suite');
    // Proof: disabling this guard made the moved-nested-suite negative fail at later spec matching.
    if (suite['file'] !== relative(rootDir, resolve(root, file)).replaceAll('\\', '/'))
      throw new Error('Browser nested suite file mismatch');
    for (const specInput of arrayOf(suite['specs'], 'specs')) {
      const spec = recordOf(specInput, 'spec');
      // Proof: disabling this guard made the moved-spec negative unexpectedly accept collection.
      if (spec['file'] !== suite['file']) throw new Error('Browser spec file mismatch');
      const titlePath = [...titles, stringOf(spec['title'], 'spec title')];
      for (const testInput of arrayOf(spec['tests'], 'tests')) {
        const test = recordOf(testInput, 'test');
        const project = stringOf(test['projectName'], 'project name');
        // Proof: disabling this guard made the foreign-project-case negative accept collection.
        if (!selectedProjects.includes(project)) throw new Error('Browser foreign project case');
        const results = arrayOf(test['results'], 'results');
        if (phase === 'list') {
          // Proof: disabling this guard made the execution-in-discovery negative accept collection.
          if (results.length !== 0 || test['status'] !== 'skipped')
            throw new Error('Browser discovery contains execution');
          cases.push({ config: configPath, project, file, titlePath, status: 'skipped' });
          continue;
        }
        // Proof: disabling this guard made the retry negative accept its first result.
        if (results.length !== 1) throw new Error('Browser execution result count mismatch');
        const outcome = recordOf(results[0], 'result');
        const rawStatus = stringOf(outcome['status'], 'status');
        // Proof: disabling this guard made the future-status negative fail at later exit matching.
        if (!['passed', 'failed', 'timedOut', 'skipped', 'interrupted'].includes(rawStatus))
          throw new Error('Browser execution status is unknown');
        const status =
          rawStatus === 'passed' && test['status'] === 'expected'
            ? 'passed'
            : rawStatus === 'skipped' && test['status'] === 'skipped'
              ? 'skipped'
              : 'failed';
        cases.push({ config: configPath, project, file, titlePath, status });
      }
    }
    for (const childInput of suite['suites'] === undefined
      ? []
      : arrayOf(suite['suites'], 'nested suites')) {
      const child = recordOf(childInput, 'nested suite');
      collect(child, file, [...titles, stringOf(child['title'], 'nested title')]);
    }
  }
  for (const suiteInput of arrayOf(report['suites'], 'suites')) {
    const suite = recordOf(suiteInput, 'file suite');
    const reportFile = stringOf(suite['file'], 'suite file');
    // Proof: disabling this guard made the traversing-suite negative fail at later suite matching.
    assertWorkspacePath(reportFile);
    const file = relative(root, resolve(rootDir, reportFile)).replaceAll('\\', '/');
    // Proof: disabling this guard made the outside-root negative unexpectedly accept collection.
    assertWorkspacePath(file);
    collect(suite, file, []);
  }
  // Proof: disabling this guard made both empty and duplicate selection negatives accept collection.
  if (cases.length === 0 || new Set(cases.map(identity)).size !== cases.length)
    throw new Error('Browser case selection is empty or duplicated');
  // Proof: disabling this guard made the inconsistent-exit negative accept exit 1 with a pass.
  if (
    phase === 'run' &&
    (exitCode === 0) !== cases.every((browserCase) => browserCase.status === 'passed')
  )
    throw new Error('Browser run exit and case outcomes disagree');
  return { version, cases };
}

/** Exact discovery-to-run identity and version equality; order may differ. */
export function reconcileBrowserRuns(listed: BrowserReport, run: BrowserReport): void {
  // Proof: disabling this guard made the changed-case negative accept the wrong run identity.
  if (
    listed.version !== run.version ||
    JSON.stringify(listed.cases.map(identity).sort()) !==
      JSON.stringify(run.cases.map(identity).sort())
  )
    throw new Error('Browser discovery and execution selection changed');
}

/** Parse Playwright's raw JUnit and require exact case identity and outcome parity. */
export function reconcileBrowserJunit(xml: string, run: BrowserReport): void {
  const parser = new SaxesParser({ xmlns: false });
  const observed: {
    project: string;
    file: string;
    name: string;
    status: BrowserCase['status'];
  }[] = [];
  let suiteProject = '';
  let suiteFile = '';
  let declared: { tests: number; failures: number; skipped: number; errors: number } | undefined;
  let current: (typeof observed)[number] | undefined;
  parser.on('opentag', (tag) => {
    if (tag.name === 'testsuites') {
      const tests = Number(tag.attributes['tests']);
      const failures = Number(tag.attributes['failures']);
      const skipped = Number(tag.attributes['skipped']);
      const errors = Number(tag.attributes['errors']);
      // Proof: disabling this guard made the malformed-summary negative fail at later count parity.
      if (
        ![tests, failures, skipped, errors].every((count) => Number.isInteger(count) && count >= 0)
      )
        throw new Error('Browser JUnit summary is malformed');
      declared = { tests, failures, skipped, errors };
    }
    if (tag.name === 'testsuite') {
      suiteProject = String(tag.attributes['hostname'] ?? '');
      suiteFile = String(tag.attributes['name'] ?? '');
    }
    if (tag.name === 'testcase') {
      // Proof: disabling this guard made the foreign-classname negative accept its suite mapping.
      if (tag.attributes['classname'] !== suiteFile)
        throw new Error('Browser JUnit classname differs from file suite');
      current = {
        project: suiteProject,
        file: suiteFile,
        name: String(tag.attributes['name'] ?? ''),
        status: 'passed',
      };
      observed.push(current);
    }
    if (tag.name === 'failure' || tag.name === 'error') {
      // Proof: disabling this guard made the unscoped-failure negative fail with a TypeError.
      if (current === undefined) throw new Error('Browser JUnit failure outside testcase');
      current.status = 'failed';
    }
    if (tag.name === 'skipped') {
      // Proof: disabling this guard made the unscoped-skip negative fail with a TypeError.
      if (current === undefined) throw new Error('Browser JUnit skip outside testcase');
      current.status = 'skipped';
    }
  });
  parser.on('closetag', (tag) => {
    if (tag.name === 'testcase') current = undefined;
  });
  parser.write(xml).close();
  const expected = run.cases.map((browserCase) => ({
    project: browserCase.project,
    file: browserCase.file.split('/').at(-1) ?? '',
    name: browserCase.titlePath.join(' › '),
    status: browserCase.status,
  }));
  // Proof: disabling this guard made the false-summary negative accept wrong test counts.
  if (
    declared?.tests !== observed.length ||
    declared.failures + declared.errors !==
      observed.filter((entry) => entry.status === 'failed').length ||
    declared.skipped !== observed.filter((entry) => entry.status === 'skipped').length
  )
    throw new Error('Browser JUnit summary differs from cases');
  // Playwright JUnit omits parent describe titles. Its (project, classname, leaf)
  // mapping is usable only when one JSON case owns it.
  const junitIdentity = (entry: (typeof observed)[number]) =>
    JSON.stringify([entry.project, entry.file, entry.name]);
  // Proof: disabling this guard made the colliding-case negative fail at later parity matching.
  if (new Set(expected.map(junitIdentity)).size !== expected.length)
    throw new Error('Browser JUnit identity is ambiguous');
  // Proof: disabling this guard made missing and foreign JUnit negatives accept wrong case sets.
  const order = (entry: (typeof observed)[number]) => JSON.stringify(entry);
  if (JSON.stringify(observed.map(order).sort()) !== JSON.stringify(expected.map(order).sort()))
    throw new Error('Browser JUnit cases or outcomes differ from JSON execution');
}
