import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  decodeBrowserJson,
  reconcileBrowserJunit,
  reconcileBrowserRuns,
} from './browser-playwright';

const root = '/tmp/browser-candidate';
const config = 'libs/wbs/application/core/playwright.config.ts';
const file = 'portable-composition.spec.ts';
const title = 'portable composition executes all operations in Chromium';

function report(phase: 'list' | 'run') {
  return {
    config: {
      configFile: join(root, config),
      version: '1.63.0',
      rootDir: join(root, 'libs/wbs/application/core/testing'),
      projects: [{ name: 'chromium' }],
    },
    errors: [] as unknown[],
    suites: [
      {
        file,
        title: file,
        specs: [
          {
            file,
            title,
            tests: [
              {
                projectName: 'chromium',
                status: phase === 'list' ? 'skipped' : 'expected',
                results: phase === 'list' ? [] : [{ status: 'passed' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

const junit = `<testsuites tests="1" failures="0" skipped="0" errors="0"><testsuite name="${file}" hostname="chromium" tests="1"><testcase name="${title}" classname="${file}"/></testsuite></testsuites>`;

describe('Browser Playwright evidence boundary', () => {
  it('reconciles exact discovery, execution and raw JUnit', () => {
    const listed = decodeBrowserJson(report('list'), root, config, ['chromium'], 'list', 0);
    const run = decodeBrowserJson(report('run'), root, config, ['chromium'], 'run', 0);
    reconcileBrowserRuns(listed, run);
    reconcileBrowserJunit(junit, run);
    expect(run.cases[0]?.file).toBe(
      'libs/wbs/application/core/testing/portable-composition.spec.ts',
    );
  });

  it('refuses foreign configuration, project, empty collection and execution retry', () => {
    const foreign = report('list');
    foreign.config.configFile = '/other/config.ts';
    expect(() => decodeBrowserJson(foreign, root, config, ['chromium'], 'list', 0)).toThrow(
      'config path',
    );
    expect(() => decodeBrowserJson(report('list'), root, config, ['firefox'], 'list', 0)).toThrow(
      'project selection',
    );
    const empty = report('list');
    empty.suites = [];
    expect(() => decodeBrowserJson(empty, root, config, ['chromium'], 'list', 0)).toThrow('empty');
    const retried = report('run');
    retried.suites[0].specs[0].tests[0].results.push({ status: 'passed' });
    expect(() => decodeBrowserJson(retried, root, config, ['chromium'], 'run', 0)).toThrow(
      'result count',
    );
  });

  it('refuses changed run identity, missing JUnit and outcome mismatch', () => {
    const listed = decodeBrowserJson(report('list'), root, config, ['chromium'], 'list', 0);
    const changed = report('run');
    changed.suites[0].specs[0].title = 'another case';
    const run = decodeBrowserJson(changed, root, config, ['chromium'], 'run', 0);
    expect(() => {
      reconcileBrowserRuns(listed, run);
    }).toThrow('selection changed');
    const changedVersion = decodeBrowserJson(report('run'), root, config, ['chromium'], 'run', 0);
    changedVersion.version = '1.64.0';
    expect(() => {
      reconcileBrowserRuns(listed, changedVersion);
    }).toThrow('selection changed');
    expect(() => {
      reconcileBrowserJunit(junit, run);
    }).toThrow('differ');
    expect(() => {
      reconcileBrowserJunit('<testsuites/>', run);
    }).toThrow('summary');
    expect(() => {
      reconcileBrowserJunit(junit.replace('/>', '><failure/></testcase>'), run);
    }).toThrow('differ');
  });

  it('refuses duplicate cases, top-level errors, suite movement and exit mismatch', () => {
    const duplicated = report('list');
    duplicated.suites.push(structuredClone(duplicated.suites[0]));
    expect(() => decodeBrowserJson(duplicated, root, config, ['chromium'], 'list', 0)).toThrow(
      'duplicated',
    );
    const errored = report('list');
    errored.errors.push({ message: 'collection failed' });
    expect(() => decodeBrowserJson(errored, root, config, ['chromium'], 'list', 0)).toThrow(
      'top-level errors',
    );
    const moved = report('list');
    moved.suites[0].specs[0].file = 'other.spec.ts';
    expect(() => decodeBrowserJson(moved, root, config, ['chromium'], 'list', 0)).toThrow(
      'spec file mismatch',
    );
    expect(() => decodeBrowserJson(report('run'), root, config, ['chromium'], 'run', 1)).toThrow(
      'exit and case outcomes disagree',
    );
  });

  it('refuses malformed reporter records and unsafe paths at their boundary', () => {
    expect(() =>
      decodeBrowserJson({ config: null }, root, config, ['chromium'], 'list', 0),
    ).toThrow('config is malformed');
    const missingSuites = report('list');
    Reflect.set(missingSuites, 'suites', null);
    expect(() => decodeBrowserJson(missingSuites, root, config, ['chromium'], 'list', 0)).toThrow(
      'suites is malformed',
    );
    const emptyProject = report('list');
    emptyProject.config.projects[0].name = '';
    expect(() => decodeBrowserJson(emptyProject, root, config, ['chromium'], 'list', 0)).toThrow(
      'project name is malformed',
    );
    const outside = report('list');
    outside.config.rootDir = '/outside';
    expect(() => decodeBrowserJson(outside, root, config, ['chromium'], 'list', 0)).toThrow(
      'normalized workspace path',
    );
    const traversing = report('list');
    traversing.suites[0].file = '../escape.spec.ts';
    expect(() => decodeBrowserJson(traversing, root, config, ['chromium'], 'list', 0)).toThrow(
      'normalized workspace path',
    );
  });

  it('refuses execution hidden in discovery, unknown outcomes and foreign project cases', () => {
    const executedList = report('list');
    executedList.suites[0].specs[0].tests[0].results.push({ status: 'passed' });
    expect(() => decodeBrowserJson(executedList, root, config, ['chromium'], 'list', 0)).toThrow(
      'contains execution',
    );
    const unknown = report('run');
    unknown.suites[0].specs[0].tests[0].results[0].status = 'future-status';
    expect(() => decodeBrowserJson(unknown, root, config, ['chromium'], 'run', 1)).toThrow(
      'status is unknown',
    );
    const foreign = report('list');
    foreign.suites[0].specs[0].tests[0].projectName = 'firefox';
    expect(() => decodeBrowserJson(foreign, root, config, ['chromium'], 'list', 0)).toThrow(
      'foreign project case',
    );
  });

  it('refuses a nested suite assigned to a different file', () => {
    const moved = report('list');
    const original = moved.suites[0].specs[0];
    moved.suites[0].specs = [];
    Reflect.set(moved.suites[0], 'suites', [
      { title: 'nested', file: 'other.spec.ts', specs: [original] },
    ]);
    expect(() => decodeBrowserJson(moved, root, config, ['chromium'], 'list', 0)).toThrow(
      'nested suite file mismatch',
    );
  });

  it('refuses JUnit classname, ambiguous case mapping and unscoped failure', () => {
    const run = decodeBrowserJson(report('run'), root, config, ['chromium'], 'run', 0);
    expect(() => {
      reconcileBrowserJunit(junit.replace(`classname="${file}"`, 'classname="other.spec.ts"'), run);
    }).toThrow('classname');
    expect(() => {
      reconcileBrowserJunit(
        '<testsuites tests="0" failures="0" skipped="0" errors="0"><failure/></testsuites>',
        run,
      );
    }).toThrow('outside testcase');
    expect(() => {
      reconcileBrowserJunit(
        '<testsuites tests="0" failures="0" skipped="0" errors="0"><skipped/></testsuites>',
        run,
      );
    }).toThrow('outside testcase');
    const duplicate = {
      ...run,
      cases: [run.cases[0], { ...run.cases[0], titlePath: [...run.cases[0].titlePath] }],
    };
    expect(() => {
      reconcileBrowserJunit(junit, duplicate);
    }).toThrow('ambiguous');
  });

  it('refuses JUnit file ambiguity and malformed XML', () => {
    const run = decodeBrowserJson(report('run'), root, config, ['chromium'], 'run', 0);
    expect(() => {
      reconcileBrowserJunit(junit.replaceAll(file, 'foreign.spec.ts'), run);
    }).toThrow('differ');
    expect(() => {
      reconcileBrowserJunit('<testsuites>', run);
    }).toThrow();
    expect(() => {
      reconcileBrowserJunit(junit.replace('tests="1"', 'tests="2"'), run);
    }).toThrow('summary');
    expect(() => {
      reconcileBrowserJunit(junit.replace('tests="1"', 'tests="invalid"'), run);
    }).toThrow('summary is malformed');
  });
});
