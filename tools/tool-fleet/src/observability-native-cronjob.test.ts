import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { beforeAll, expect, test } from 'bun:test';
import { stringify } from 'yaml';

import { readToolchain, type Toolchain } from './contracts';
import { readRehearsalNativeCosts } from './observability-native-ordinal';
import { captureRehearsalFrames } from './observability-rehearsal-inventory';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
let lock: Toolchain;
beforeAll(async () => {
  lock = await readToolchain(join(import.meta.dir, '../../../infra/versions/toolchain.json'));
});
function workload() {
  return {
    containers: [
      {
        name: 'app',
        image: 'example@sha256:' + 'a'.repeat(64),
        resources: {
          requests: { memory: '128Mi', cpu: '10m' },
          limits: { memory: '128Mi', cpu: '1', 'ephemeral-storage': '64Mi' },
        },
        securityContext: { readOnlyRootFilesystem: true },
      },
    ],
    restartPolicy: 'Never',
  };
}
function fixture(
  spec: Record<string, unknown>,
  earlier: 'incomplete' | 'collision' = 'incomplete',
) {
  const first = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: { name: 'store', namespace: 'dev' },
    spec: {
      ...(earlier === 'collision'
        ? {
            replicas: 1,
            volumeClaimTemplates: [
              {
                metadata: { name: 'records' },
                spec: { storageClassName: 'retain', resources: { requests: { storage: '64Mi' } } },
              },
            ],
          }
        : {}),
      template: { spec: workload() },
    },
  };
  const claim = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name: 'records-store-0', namespace: 'dev' },
    spec: { storageClassName: 'retain', resources: { requests: { storage: '64Mi' } } },
  };
  const cron = {
    apiVersion: 'batch/v1',
    kind: 'CronJob',
    metadata: { name: 'later', namespace: 'dev' },
    spec: { jobTemplate: { spec: { template: { spec: workload() } } }, ...spec },
  };
  const bytes = [first, ...(earlier === 'collision' ? [claim] : []), cron]
    .map((manifest) => stringify(manifest))
    .join('---\n');
  const stages = [
    {
      stage: 'native',
      path: 'infra/native',
      declarationPath: 'stages/native.yaml',
      sourceSHA256: hash('source'),
      sha256: hash(bytes),
      bytes,
      releases: [],
    },
  ];
  return { stages, contract: captureRehearsalFrames(stages, {}) };
}
function derive(
  spec: Record<string, unknown>,
  earlier: 'incomplete' | 'collision' = 'incomplete',
  mismatch = false,
) {
  const packet = fixture(spec, earlier);
  const pin = structuredClone(lock);
  if (mismatch) pin.binaries.k3s.version = 'v1.35.0+k3s1';
  return readRehearsalNativeCosts(packet.stages, {}, packet.contract, pin);
}
const malformed: [string, Record<string, unknown>][] = [
  ['schedule absent', {}],
  ['schedule null', { schedule: null }],
  ['schedule type', { schedule: 1 }],
  ['schedule empty', { schedule: '' }],
  ['schedule TZ wildcard', { schedule: '*-TZ * * * *' }],
  ['schedule six fields', { schedule: '* * * * * *' }],
  ['schedule embedded TZ', { schedule: 'TZ=UTC * * * * *' }],
  ['schedule int64 overflow', { schedule: '*/9223372036854775808 * * * *' }],
  ['schedule invalid name', { schedule: '0 0 * JANUARY *' }],
  ['integer grammar', { schedule: '1e1 * * * *' }],
  ['integer negative', { schedule: '*/-1 * * * *' }],
  ['field minimum', { schedule: '0 0 0 * *' }],
  ['field maximum', { schedule: '60 * * * *' }],
  ['field reversed', { schedule: '5-2 * * * *' }],
  ['field zero step', { schedule: '*/0 * * * *' }],
  ['field hyphens', { schedule: '1-2-3 * * * *' }],
  ['field slashes', { schedule: '1/2/3 * * * *' }],
  ['duration empty', { schedule: '@every ' }],
  ['duration unit', { schedule: '@every 1fortnight' }],
  ['duration negative overflow', { schedule: '@every -9223372036854775809ns' }],
  ['duration multiplied overflow', { schedule: '@every -9223372036854775808h' }],
  ['duration fraction overflow', { schedule: '@every -9223372036.854775809s' }],
  [
    'duration fractional pre-sum overflow',
    { schedule: '@every -9223372036854775808ns9223372036.854775809s' },
  ],
  [
    'duration float64 safety',
    { schedule: '@every 9223368436854775808ns0.99999999999999999999999999999999999999999999h' },
  ],
  ['duration summed overflow', { schedule: '@every -9223372036854775807ns2ns' }],
  ['duration positive limit', { schedule: '@every 9223372036854775808ns' }],
  ['duration invalid', { schedule: '@every .s' }],
  ['duration overflow', { schedule: '@every 9223372036854775808ns' }],
  ['timezone null', { schedule: '* * * * *', timeZone: null }],
  ['timezone type', { schedule: '* * * * *', timeZone: 4 }],
  ['timezone empty', { schedule: '* * * * *', timeZone: '' }],
  ['timezone Local', { schedule: '* * * * *', timeZone: 'lOcAl' }],
  ['timezone component', { schedule: '* * * * *', timeZone: 'Europe/../Kyiv' }],
  ['timezone length', { schedule: '* * * * *', timeZone: 'ABCDEFGHIJKLMNO' }],
  ['timezone minus', { schedule: '* * * * *', timeZone: '-UTC' }],
  ['timezone slash', { schedule: '* * * * *', timeZone: 'Europe//Kyiv' }],
  ['timezone characters', { schedule: '* * * * *', timeZone: 'Europe/Kyiv ' }],
];
for (const [label, spec] of malformed) {
  test(`CronJob calendar ${label} throws before incomplete owner and provider mismatch`, () => {
    expect(() => derive(spec, 'incomplete', true)).toThrow(/Cron/);
  });
}
for (const spec of [{ schedule: 'broken' }, { schedule: '* * * * *', timeZone: 'Local' }]) {
  test(`CronJob all-native calendar prepass precedes earlier ordinal collision ${JSON.stringify(spec)}`, () => {
    expect(() => derive(spec, 'collision')).toThrow(/Cron/);
  });
}
test('CronJob earlier collision control reaches real ordinal derivation', () => {
  expect(() => derive({ schedule: '* * * * *' }, 'collision')).toThrow(
    'Native ordinal claim-identity-collision',
  );
});
for (const schedule of [
  '*/15 * * * *',
  '0 0 31 2 *',
  ', * * * *',
  '*-garbage * * * *',
  '@annually',
  '@every -1s',
  '@every 0.99999999999999999999999999999999999999999999h',
]) {
  test(`CronJob valid syntax preserves unsupported lifecycle and serializes ${schedule}`, () => {
    const ledger = derive({ schedule, timeZone: 'Europe/Kyiv' });
    expect(ledger.blockers).toContainEqual({
      owner: 'CronJob:dev:later',
      missingFact: 'CronJob-lifecycle-unaccounted',
    });
    expect(
      ledger.blockers.some(
        ({ missingFact }) => missingFact === 'cronjob-time-zone-outside-catalogue',
      ),
    ).toBe(false);
    expect(() => JSON.stringify(ledger)).not.toThrow();
    expect(ledger.provider.runtimeObserved).toBe(false);
    expect(ledger.state).toBe('incomplete');
  });
}
for (const timeZone of ['right/UTC', 'posix/UTC', 'Unknown/Zone', 'utc']) {
  test(`CronJob outside catalogue ${timeZone} retains knowledge and lifecycle blockers`, () => {
    const ledger = derive({ schedule: '* * * * *', timeZone }, 'incomplete', true);
    expect(ledger.blockers).toContainEqual({
      owner: 'CronJob:dev:later',
      missingFact: 'cronjob-time-zone-outside-catalogue',
    });
    expect(ledger.blockers).toContainEqual({
      owner: 'CronJob:dev:later',
      missingFact: 'CronJob-lifecycle-unaccounted',
    });
    expect(() => JSON.stringify(ledger)).not.toThrow();
  });
}
test('CronJob absent timezone preserves source inventory without implicit UTC', () => {
  const ledger = derive({ schedule: '* * * * *' });
  expect(ledger.blockers).toContainEqual({
    owner: 'CronJob:dev:later',
    missingFact: 'CronJob-lifecycle-unaccounted',
  });
  expect(
    ledger.blockers.some(
      ({ missingFact }) => missingFact === 'cronjob-time-zone-outside-catalogue',
    ),
  ).toBe(false);
  expect(JSON.stringify(ledger)).not.toContain('"timeZone":"UTC"');
});
