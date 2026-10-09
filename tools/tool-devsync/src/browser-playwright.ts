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
  // Proof: the malformed-config parser negative rejects null before any property access.
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error(`Browser ${label} is malformed`);
  return input as Record<string, unknown>;
}

function arrayOf(input: unknown, label: string): unknown[] {
  // Proof: the missing-suites parser negative rejects a non-array discovery selection.
  if (!Array.isArray(input)) throw new Error(`Browser ${label} is malformed`);
  return input;
}

function stringOf(input: unknown, label: string): string {
  // Proof: the empty-project parser negative rejects a project with no usable identity.
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
  // Proof: the foreign-config negative rejects a report produced by another Playwright config.
  if (config['configFile'] !== resolve(root, configPath))
    throw new Error('Browser config path mismatch');
  const version = stringOf(config['version'], 'version');
  const rootDir = stringOf(config['rootDir'], 'rootDir');
  const projects = arrayOf(config['projects'], 'projects').map((entry) =>
    stringOf(recordOf(entry, 'project')['name'], 'project name'),
  );
  // Proof: the foreign-project negative refuses a project set changed by config/env injection.
  if (
    projects.length !== selectedProjects.length ||
    projects.some((project, index) => project !== selectedProjects[index])
  )
    throw new Error('Browser project selection mismatch');
  // Proof: the top-level-error negative refuses a reporter that contains collection errors.
  if (arrayOf(report['errors'], 'errors').length !== 0)
    throw new Error(`Browser ${phase} has top-level errors`);
  const cases: BrowserCase[] = [];
  function collect(suiteInput: unknown, file: string, titles: string[]): void {
    const suite = recordOf(suiteInput, 'suite');
    // Proof: the moved-nested-suite negative refuses a nested case attributed to another file.
    if (suite['file'] !== relative(rootDir, resolve(root, file)).replaceAll('\\', '/'))
      throw new Error('Browser nested suite file mismatch');
    for (const specInput of arrayOf(suite['specs'], 'specs')) {
      const spec = recordOf(specInput, 'spec');
      if (spec['file'] !== suite['file']) throw new Error('Browser spec file mismatch');
      const titlePath = [...titles, stringOf(spec['title'], 'spec title')];
      for (const testInput of arrayOf(spec['tests'], 'tests')) {
        const test = recordOf(testInput, 'test');
        const project = stringOf(test['projectName'], 'project name');
        if (!selectedProjects.includes(project)) throw new Error('Browser foreign project case');
        const results = arrayOf(test['results'], 'results');
        if (phase === 'list') {
          if (results.length !== 0 || test['status'] !== 'skipped')
            throw new Error('Browser discovery contains execution');
          cases.push({ config: configPath, project, file, titlePath, status: 'skipped' });
          continue;
        }
        // Proof: the retry negative rejects multiple results for one exact case.
        if (results.length !== 1) throw new Error('Browser execution result count mismatch');
        const outcome = recordOf(results[0], 'result');
        const rawStatus = stringOf(outcome['status'], 'status');
        // Proof: the unknown-status negative refuses new reporter statuses until reviewed.
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
    assertWorkspacePath(reportFile);
    const file = relative(root, resolve(rootDir, reportFile)).replaceAll('\\', '/');
    // Proof: the outside-root negative refuses a reporter path escaping the checkout.
    assertWorkspacePath(file);
    collect(suite, file, []);
  }
  // Proof: the empty and duplicate discovery negatives reject absent and repeated obligations.
  if (cases.length === 0 || new Set(cases.map(identity)).size !== cases.length)
    throw new Error('Browser case selection is empty or duplicated');
  // Proof: the inconsistent-exit negative rejects a zero exit with failed cases and vice versa.
  if (
    phase === 'run' &&
    (exitCode === 0) !== cases.every((browserCase) => browserCase.status === 'passed')
  )
    throw new Error('Browser run exit and case outcomes disagree');
  return { version, cases };
}

/** Exact discovery-to-run identity and version equality; order may differ. */
export function reconcileBrowserRuns(listed: BrowserReport, run: BrowserReport): void {
  // Proof: the changed-case and changed-version negatives reject execution that differs from discovery.
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
  let current: (typeof observed)[number] | undefined;
  parser.on('opentag', (tag) => {
    if (tag.name === 'testsuite') {
      suiteProject = String(tag.attributes['hostname'] ?? '');
      suiteFile = String(tag.attributes['name'] ?? '');
    }
    if (tag.name === 'testcase') {
      // Proof: the foreign-classname negative refuses a JUnit case assigned to another suite.
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
      if (current === undefined) throw new Error('Browser JUnit failure outside testcase');
      current.status = 'failed';
    }
    if (tag.name === 'skipped') {
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
  // Playwright JUnit omits parent describe titles. Its (project, classname, leaf)
  // mapping is usable only when one JSON case owns it.
  const junitIdentity = (entry: (typeof observed)[number]) =>
    JSON.stringify([entry.project, entry.file, entry.name]);
  // Proof: the colliding-leaf negative refuses a report that cannot encode full JSON title paths.
  if (new Set(expected.map(junitIdentity)).size !== expected.length)
    throw new Error('Browser JUnit identity is ambiguous');
  // Proof: missing, duplicate, foreign and status-mismatch JUnit negatives fail this exact multiset comparison.
  const order = (entry: (typeof observed)[number]) => JSON.stringify(entry);
  if (JSON.stringify(observed.map(order).sort()) !== JSON.stringify(expected.map(order).sort()))
    throw new Error('Browser JUnit cases or outcomes differ from JSON execution');
}
