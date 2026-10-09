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
    errors: [],
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

const junit = `<testsuites tests="1"><testsuite name="${file}" hostname="chromium" tests="1"><testcase name="${title}" classname="${file}"/></testsuite></testsuites>`;

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
    expect(() => {
      reconcileBrowserJunit(junit, run);
    }).toThrow('differ');
    expect(() => {
      reconcileBrowserJunit('<testsuites/>', run);
    }).toThrow('differ');
    expect(() => {
      reconcileBrowserJunit(junit.replace('/>', '><failure/></testcase>'), run);
    }).toThrow('differ');
  });

  it('refuses JUnit file ambiguity and malformed XML', () => {
    const run = decodeBrowserJson(report('run'), root, config, ['chromium'], 'run', 0);
    expect(() => {
      reconcileBrowserJunit(junit.replaceAll(file, 'foreign.spec.ts'), run);
    }).toThrow('differ');
    expect(() => {
      reconcileBrowserJunit('<testsuites>', run);
    }).toThrow();
  });
});
