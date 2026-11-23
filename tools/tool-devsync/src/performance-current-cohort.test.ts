import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { decodePerformanceCases } from '@shared/test-evidence';
import { expect, test } from 'bun:test';

import { assertCandidateServiceDescriptors, decodeServiceDescriptors } from './performance-level';

const root = resolve(import.meta.dir, '../../..');
const shift = 7300;
const database = '/tmp/puni-performance-descriptor-contract.db';

function currentServices() {
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      'apps/wbs/fe-01/ordinary-servers-cli.ts',
      root,
      String(shift),
      database,
    ],
    {
      cwd: root,
      env: { PATH: process.env['PATH'], HOME: process.env['HOME'] },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.signalCode).toBeUndefined();
  return decodeServiceDescriptors(child.stdout.toString());
}

test('the actual Performance declaration retains the Playwright project and exact measurement denominator', () => {
  const parsed: unknown = JSON.parse(
    readFileSync(root + '/apps/wbs/fe-01/playwright.performance.cases.json', 'utf8'),
  );
  const declared = decodePerformanceCases(parsed);
  expect(declared.project).toBe('chromium');
  expect(declared.cases).toEqual([
    {
      caseId: 'wbs-folded-mounted-cells',
      fixture: 'apps/wbs/fe-01/e2e-performance/mounted-cells.perf.spec.ts',
      titlePath: ['[TEST-AXES-038] a 100-row folded plan stays within its mounted-cell budget'],
      measurement: 'folded-mounted-cells',
      unit: 'count',
      operator: 'lte',
      threshold: 1200,
    },
  ]);
});

test('the independent Performance admission accepts the actual current ordinary descriptor producer', () => {
  expect(() => {
    assertCandidateServiceDescriptors(currentServices(), root, shift, database);
  }).not.toThrow();
});

const descriptorFaults: readonly [
  string,
  (services: ReturnType<typeof currentServices>) => void,
][] = [
  [
    'old backend main',
    (services) => {
      services[0].command = 'bun src/main.ts';
    },
  ],
  [
    'health instead of bound readiness',
    (services) => {
      services[0].url = 'http://localhost:10400/health';
    },
  ],
  [
    'old gateway main',
    (services) => {
      services[1].command = 'bun src/main.ts';
    },
  ],
  [
    'foreign working directory',
    (services) => {
      services[0].cwd = '/tmp';
    },
  ],
  [
    'missing solver environment',
    (services) => {
      delete services[0].env['SOLVER_BUDGET_MS'];
    },
  ],
  [
    'extra environment',
    (services) => {
      services[0].env['FOREIGN_AUTHORITY'] = 'true';
    },
  ],
  [
    'foreign database',
    (services) => {
      services[0].env['DB_PATH'] = '/tmp/foreign.db';
    },
  ],
  [
    'different signing authority',
    (services) => {
      services[1].env['JWT_SIGNING_KEY_CURRENT'] = 'foreign';
    },
  ],
  [
    'own prototype-looking environment key',
    (services) => {
      services[0].env = Object.fromEntries([
        ...Object.entries(services[0].env),
        ['__proto__', 'foreign'],
      ]);
    },
  ],
];

test.each(descriptorFaults)('the independent current admission refuses %s', (_name, mutate) => {
  const services = currentServices();
  mutate(services);
  expect(() => {
    assertCandidateServiceDescriptors(services, root, shift, database);
  }).toThrow('Performance service descriptors differ from the approved shifted WBS stack');
});
