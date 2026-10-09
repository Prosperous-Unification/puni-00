import { Buffer } from 'node:buffer';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { decodePlaywrightReport, performanceAttachmentName } from './performance-playwright';

const checkoutRoot = '/tmp/performance-parser-checkout';
const declaration = {
  schemaVersion: 1 as const,
  config: 'apps/wbs/fe-01/playwright.performance.config.ts',
  project: 'chromium',
  cases: [
    {
      caseId: 'paint-ready',
      fixture: 'apps/wbs/fe-01/e2e-performance/paint.perf.spec.ts',
      titlePath: ['Paint', 'records readiness'],
      measurement: 'paint-ready',
      unit: 'ms' as const,
      operator: 'lte' as const,
      threshold: 200,
    },
  ],
};

function jsonReport(phase: 'list' | 'run') {
  const body = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      caseId: 'paint-ready',
      measurement: 'paint-ready',
      unit: 'ms',
      value: 180,
    }),
  ).toString('base64');
  return {
    config: {
      version: '1.63.0',
      configFile: join(checkoutRoot, declaration.config),
      rootDir: join(checkoutRoot, 'apps/wbs/fe-01/e2e-performance'),
      projects: [{ name: 'chromium' }],
    },
    errors: [],
    suites: [
      {
        title: 'paint.perf.spec.ts',
        file: 'paint.perf.spec.ts',
        specs: [],
        suites: [
          {
            title: 'Paint',
            file: 'paint.perf.spec.ts',
            specs: [
              {
                title: 'records readiness',
                file: 'paint.perf.spec.ts',
                tests: [
                  {
                    projectName: 'chromium',
                    status: phase === 'list' ? 'skipped' : 'expected',
                    results:
                      phase === 'list'
                        ? []
                        : [
                            {
                              status: 'passed',
                              attachments: [
                                {
                                  name: performanceAttachmentName,
                                  contentType: 'application/json',
                                  body,
                                },
                              ],
                            },
                          ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function fails(report: unknown, phase: 'list' | 'run', phrase: string): void {
  expect(() => decodePlaywrightReport(report, checkoutRoot, declaration, phase, 0)).toThrow(phrase);
}

describe('Performance Playwright JSON boundary', () => {
  it('matches exact list and measured run identities', () => {
    const listed = decodePlaywrightReport(jsonReport('list'), checkoutRoot, declaration, 'list', 0);
    expect(listed.version).toBe('1.63.0');
    expect(listed.cases.map((entry) => entry.caseId)).toEqual(['paint-ready']);
    const run = decodePlaywrightReport(jsonReport('run'), checkoutRoot, declaration, 'run', 0);
    expect(run.execution.cases).toEqual([
      {
        caseId: 'paint-ready',
        status: 'passed',
        observations: [{ measurement: 'paint-ready', unit: 'ms', value: 180 }],
      },
    ]);
  });

  it('refuses malformed report, config, project and paths', () => {
    fails({}, 'list', 'config');
    const wrongConfig = jsonReport('list');
    wrongConfig.config.configFile = '/outside/config.ts';
    fails(wrongConfig, 'list', 'config path mismatch');
    const wrongProject = jsonReport('list');
    wrongProject.config.projects[0].name = 'firefox';
    fails(wrongProject, 'list', 'selected project mismatch');
    const wrongRoot = jsonReport('list');
    wrongRoot.config.rootDir = '/outside';
    fails(wrongRoot, 'list', 'normalized workspace path');
    const traversingFile = jsonReport('list');
    traversingFile.suites[0].file = '../outside.perf.spec.ts';
    fails(traversingFile, 'list', 'normalized workspace path');
  });

  it('refuses unknown, duplicate and missing collection identities', () => {
    const unknown = jsonReport('list');
    unknown.suites[0].suites[0].specs[0].title = 'unreviewed';
    fails(unknown, 'list', 'undeclared or ambiguous');
    const duplicate = jsonReport('list');
    duplicate.suites[0].suites[0].specs.push(
      structuredClone(duplicate.suites[0].suites[0].specs[0]),
    );
    fails(duplicate, 'list', 'collection differs');
    const missing = jsonReport('list');
    missing.suites = [];
    fails(missing, 'list', 'collection differs');
    const wrongSpecFile = jsonReport('list');
    wrongSpecFile.suites[0].suites[0].specs[0].file = 'other.perf.spec.ts';
    fails(wrongSpecFile, 'list', 'spec file differs');
  });

  it('refuses list execution and altered run outcomes or observation attachments', () => {
    const listedRun = jsonReport('list');
    listedRun.suites[0].suites[0].specs[0].tests[0].status = 'expected';
    fails(listedRun, 'list', 'list contains execution');
    const missingOutcome = jsonReport('run');
    missingOutcome.suites[0].suites[0].specs[0].tests[0].results = [];
    fails(missingOutcome, 'run', 'one result');
    const missingAttachment = jsonReport('run');
    missingAttachment.suites[0].suites[0].specs[0].tests[0].results[0].attachments = [];
    fails(missingAttachment, 'run', 'one fresh observation');
    const duplicateAttachment = jsonReport('run');
    const attachments =
      duplicateAttachment.suites[0].suites[0].specs[0].tests[0].results[0].attachments;
    attachments.push(structuredClone(attachments[0]));
    fails(duplicateAttachment, 'run', 'one fresh observation');
    const wrongIdentity = jsonReport('run');
    wrongIdentity.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0].body =
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          caseId: 'other',
          measurement: 'paint-ready',
          unit: 'ms',
          value: 180,
        }),
      ).toString('base64');
    fails(wrongIdentity, 'run', 'observation identity mismatch');
    const badBase64 = jsonReport('run');
    badBase64.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0].body = '%%%';
    fails(badBase64, 'run', 'base64 is malformed');
  });

  it('refuses malformed discovery records at each runner boundary', () => {
    const fixtures: {
      label: string;
      phrase: string;
      mutate: (report: ReturnType<typeof jsonReport>) => unknown;
    }[] = [
      { label: 'report', phrase: 'report', mutate: () => null },
      { label: 'config', phrase: 'config', mutate: (report) => ({ ...report, config: [] }) },
      {
        label: 'version',
        phrase: 'runner version',
        mutate: (report) => ({ ...report, config: { ...report.config, version: '' } }),
      },
      {
        label: 'rootDir',
        phrase: 'rootDir',
        mutate: (report) => ({ ...report, config: { ...report.config, rootDir: '' } }),
      },
      {
        label: 'projects',
        phrase: 'invalid Playwright JSON projects',
        mutate: (report) => ({ ...report, config: { ...report.config, projects: null } }),
      },
      {
        label: 'project count',
        phrase: 'selected project mismatch',
        mutate: (report) => ({ ...report, config: { ...report.config, projects: [] } }),
      },
      {
        label: 'top errors',
        phrase: 'top-level errors',
        mutate: (report) => ({ ...report, errors: ['failure'] }),
      },
      {
        label: 'suites',
        phrase: 'invalid Playwright JSON file suites',
        mutate: (report) => ({ ...report, suites: null }),
      },
      {
        label: 'suite file',
        phrase: 'suite file',
        mutate: (report) => ({ ...report, suites: [{ ...report.suites[0], file: '' }] }),
      },
      {
        label: 'nested file',
        phrase: 'nested suite file mismatch',
        mutate: (report) => {
          report.suites[0].suites[0].file = 'other.spec.ts';
          return report;
        },
      },
      {
        label: 'spec title',
        phrase: 'spec title',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].title = '';
          return report;
        },
      },
      {
        label: 'selected tests',
        phrase: 'exactly one selected project',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].tests = [];
          return report;
        },
      },
      {
        label: 'test project',
        phrase: 'project mismatch',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].tests[0].projectName = 'firefox';
          return report;
        },
      },
      {
        label: 'list outcomes',
        phrase: 'list contains execution',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].tests[0].results.push({
            status: 'passed',
            attachments: [],
          });
          return report;
        },
      },
    ];
    for (const fixture of fixtures) {
      expect(
        () =>
          decodePlaywrightReport(
            fixture.mutate(jsonReport('list')),
            checkoutRoot,
            declaration,
            'list',
            0,
          ),
        fixture.label,
      ).toThrow(fixture.phrase);
    }
  });

  it('refuses malformed execution and measurement transport records', () => {
    const fixtures: {
      label: string;
      phrase: string;
      mutate: (report: ReturnType<typeof jsonReport>) => unknown;
    }[] = [
      {
        label: 'run results',
        phrase: 'invalid Playwright JSON case results',
        mutate: (report) => {
          (report.suites[0].suites[0].specs[0].tests[0] as { results: unknown }).results = null;
          return report;
        },
      },
      {
        label: 'attachments',
        phrase: 'invalid Playwright JSON case attachments',
        mutate: (report) => {
          (
            report.suites[0].suites[0].specs[0].tests[0].results[0] as { attachments: unknown }
          ).attachments = null;
          return report;
        },
      },
      {
        label: 'content type',
        phrase: 'attachment format mismatch',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0].contentType =
            'text/plain';
          return report;
        },
      },
      {
        label: 'attachment path',
        phrase: 'attachment format mismatch',
        mutate: (report) => {
          (
            report.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0] as {
              path?: string;
            }
          ).path = '/outside';
          return report;
        },
      },
      {
        label: 'body',
        phrase: 'observation body',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0].body = '';
          return report;
        },
      },
      {
        label: 'JSON',
        phrase: 'observation JSON is unreadable',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0].body =
            Buffer.from('{').toString('base64');
          return report;
        },
      },
      {
        label: 'UTF-8',
        phrase: 'observation JSON is unreadable',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0].body = Buffer.from(
            [0xff],
          ).toString('base64');
          return report;
        },
      },
      {
        label: 'measurement',
        phrase: 'observation identity mismatch',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0].body = Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              caseId: 'paint-ready',
              measurement: 'other',
              unit: 'ms',
              value: 180,
            }),
          ).toString('base64');
          return report;
        },
      },
      {
        label: 'unit',
        phrase: 'observation identity mismatch',
        mutate: (report) => {
          report.suites[0].suites[0].specs[0].tests[0].results[0].attachments[0].body = Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              caseId: 'paint-ready',
              measurement: 'paint-ready',
              unit: 'fps',
              value: 180,
            }),
          ).toString('base64');
          return report;
        },
      },
    ];
    for (const fixture of fixtures) {
      expect(
        () =>
          decodePlaywrightReport(
            fixture.mutate(jsonReport('run')),
            checkoutRoot,
            declaration,
            'run',
            0,
          ),
        fixture.label,
      ).toThrow(fixture.phrase);
    }
  });
});
