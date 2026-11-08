import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeAll, expect, spyOn, test } from 'bun:test';
import { parseAllDocuments, stringify } from 'yaml';

import { readToolchain, type Toolchain } from './contracts';
import {
  deriveObservabilityRehearsalNativeCosts,
  readRehearsalNativeCosts,
} from './observability-native-ordinal';
import * as rehearsalInventory from './observability-rehearsal-inventory';
import { captureRehearsalFrames, readRehearsalSource } from './observability-rehearsal-inventory';

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
  metadata: Record<string, unknown> = {},
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
    metadata: { name: 'later', namespace: 'dev', ...metadata },
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

function horizonFixture(
  spec: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {},
) {
  const packet = fixture(
    { schedule: '*/15 * * * *', timeZone: 'UTC', ...spec },
    'incomplete',
    metadata,
  );
  const selection = { sourceRevision: 'a'.repeat(40), artifactSHA256: 'b'.repeat(64) };
  const contract = { ...packet.contract, bootstrapSources: [], provenance: selection };
  const source = readRehearsalSource(packet.stages, {}, contract, lock);
  const cron = source.native.find(({ entry }) => entry.kind === 'CronJob');
  if (!cron) throw new Error('Cron fixture missing');
  const manifest = cron.manifest as { spec: { jobTemplate: unknown } };
  const horizons = {
    basis: 'declared' as const,
    selection: structuredClone(selection),
    windows: [
      {
        owner: `CronJob:${cron.entry.namespace ?? '_'}:${cron.entry.name}`,
        frameSHA256: cron.entry.source.frameSHA256,
        pointer: cron.entry.pointer,
        jobTemplateSHA256: hash(JSON.stringify(manifest.spec.jobTemplate)),
        fromExclusive: '2026-10-28T00:00:00.000Z',
        toInclusive: '2026-10-28T00:30:00.000Z',
        controllerTimeZone: 'UTC',
      },
    ],
  };
  return { ...packet, contract, horizons, cron };
}
function deriveHorizon(packet = horizonFixture(), mismatch = false) {
  const pin = structuredClone(lock);
  if (mismatch) pin.binaries.k3s.version = 'v1.35.0+k3s1';
  return readRehearsalNativeCosts(
    packet.stages,
    {},
    packet.contract,
    pin,
    undefined,
    undefined,
    packet.horizons,
  );
}
test('CronJob declared horizon charges two ticks with seven full retry slots each', () => {
  const packet = horizonFixture();
  const ledger = deriveHorizon(packet);
  const charges = ledger.entries.filter(
    (charge: { owner: string }) => charge.owner === 'CronJob:dev:later',
  );
  expect(charges).toHaveLength(14);
  expect(
    charges.map((charge: { memoryMiB: number; cpuMilli: number; diskMiB: number }) => [
      charge.memoryMiB,
      charge.cpuMilli,
      charge.diskMiB,
    ]),
  ).toEqual(Array.from({ length: 14 }, () => [128, 10, 64]));
  expect(ledger.cronJobLifecycles[0]).toMatchObject({ nominalTicks: 2, maximumPodSlots: 14 });
});

function jobTemplate(spec: Record<string, unknown> = {}, metadata?: unknown) {
  return {
    ...(metadata === undefined ? {} : { metadata }),
    spec: { template: { spec: workload() }, ...spec },
  };
}
for (const [label, spec] of [
  ['concurrency', { concurrencyPolicy: 'Skip' }],
  ['concurrency null', { concurrencyPolicy: null }],
  ['suspend', { suspend: 'false' }],
  ['history null', { successfulJobsHistoryLimit: null }],
  ['history overflow', { failedJobsHistoryLimit: 2147483648 }],
  ['deadline negative', { startingDeadlineSeconds: -1 }],
  ['deadline unsafe', { startingDeadlineSeconds: 9007199254740992 }],
  ['template null', { jobTemplate: null }],
  ['template array', { jobTemplate: [] }],
  ['metadata null', { jobTemplate: jobTemplate({}, null) }],
  ['metadata array', { jobTemplate: jobTemplate({}, []) }],
  ['annotations array', { jobTemplate: jobTemplate({}, { annotations: [] }) }],
  ['annotations type', { jobTemplate: jobTemplate({}, { annotations: { x: 2 } }) }],
  ['labels array', { jobTemplate: jobTemplate({}, { labels: [] }) }],
  ['labels type', { jobTemplate: jobTemplate({}, { labels: { x: 2 } }) }],
  ['nested spec array', { jobTemplate: { spec: [] } }],
  ['nested selector', { jobTemplate: jobTemplate({ selector: {} }) }],
  ['nested manual selector', { jobTemplate: jobTemplate({ manualSelector: true }) }],
  ['nested Job policy', { jobTemplate: jobTemplate({ completionMode: 'Broken' }) }],
  [
    'nested deadline unsafe',
    { jobTemplate: jobTemplate({ activeDeadlineSeconds: 9007199254740992 }) },
  ],
] as [string, Record<string, unknown>][]) {
  test(`CronJob full policy prepass rejects ${label} before missing horizons/provider/collision`, () => {
    for (const earlier of ['incomplete', 'collision'] as const)
      expect(() => derive({ schedule: '* * * * *', ...spec }, earlier, true)).toThrow(
        ['template null', 'template array', 'nested spec array'].includes(label)
          ? /must be an object/
          : /CronJob source or horizon malformed|Native ordinal source malformed/,
      );
  });
}
function rewrite(value: unknown, path: readonly (string | number)[], replacement: unknown) {
  const [key, ...remaining] = path;
  if (path.length === 0 || typeof value !== 'object' || value === null)
    throw new Error('Invalid test rewrite');
  const record = value as Record<string | number, unknown>;
  if (remaining.length) rewrite(record[key], remaining, replacement);
  else if (replacement === undefined) Reflect.deleteProperty(record, key);
  else record[key] = replacement;
}
for (const [label, path, value] of [
  ['root unknown', ['extra'], true],
  ['basis', ['basis'], 'observed'],
  ['selection unknown', ['selection', 'extra'], 1],
  ['selection revision', ['selection', 'sourceRevision'], 'c'.repeat(40)],
  ['selection artifact', ['selection', 'artifactSHA256'], 'c'.repeat(64)],
  ['selection shape', ['selection', 'sourceRevision'], 'bad'],
  ['window unknown', ['windows', 0, 'extra'], true],
  ['owner unknown', ['windows', 0, 'owner'], 'CronJob:dev:unknown'],
  ['owner not Cron', ['windows', 0, 'owner'], 'StatefulSet:dev:store'],
  ['frame', ['windows', 0, 'frameSHA256'], 'c'.repeat(64)],
  ['pointer', ['windows', 0, 'pointer'], '/wrong'],
  ['full template', ['windows', 0, 'jobTemplateSHA256'], 'c'.repeat(64)],
  ['controller absent', ['windows', 0, 'controllerTimeZone'], undefined],
  ['controller null', ['windows', 0, 'controllerTimeZone'], null],
  ['controller malformed', ['windows', 0, 'controllerTimeZone'], 'Local'],
  ['windows null', ['windows'], null],
  ['windows object', ['windows'], {}],
  ['window null', ['windows', 0], null],
  ['window array', ['windows', 0], []],
  ['selection array', ['selection'], []],
] as const) {
  test(`CronJob horizon rejects ${label} before provider/missing policy`, () => {
    const packet = horizonFixture({ suspend: true });
    rewrite(packet.horizons, path, value);
    expect(() => deriveHorizon(packet, true)).toThrow(/Cron/);
  });
}
test('CronJob horizon rejects duplicate owners', () => {
  const packet = horizonFixture();
  packet.horizons.windows.push(structuredClone(packet.horizons.windows[0]));
  expect(() => deriveHorizon(packet)).toThrow(/Cron/);
});
for (const value of [null, [], {}, { basis: 'declared', selection: null, windows: [] }]) {
  test(`CronJob rejects malformed horizon root ${JSON.stringify(value)}`, () => {
    const packet = horizonFixture();
    rewrite(packet, ['horizons'], value);
    expect(() => deriveHorizon(packet)).toThrow(/Cron/);
  });
}
for (const value of [
  '2026-10-28T00:00:00Z',
  '2026-02-30T00:00:00.000Z',
  '2027-02-30T00:00:00.000Z',
  '+010000-01-01T00:00:00.000Z',
  '2026-10-28T00:00:00.000+00:00',
  '2026-10-28T00:00:00.000Z',
  '2026-10-27T00:00:00.000Z',
]) {
  test(`CronJob exact ordered UTC timestamps reject ${value}`, () => {
    const packet = horizonFixture();
    packet.horizons.windows[0].toInclusive = value;
    expect(() => deriveHorizon(packet)).toThrow(/Cron/);
  });
}
for (const [label, path, value] of [
  ['anchors absent', ['bootstrapSources'], undefined],
  ['anchors null', ['bootstrapSources'], null],
  [
    'anchor malformed',
    ['bootstrapSources'],
    [
      {
        sourcePath: 'wrong',
        artifactPath: 'infra/local/platform.k3d.yaml',
        sha256: 'a'.repeat(64),
      },
    ],
  ],
  ['provenance absent', ['provenance'], undefined],
  ['provenance malformed', ['provenance', 'sourceRevision'], 'bad'],
] as const) {
  test(`CronJob full independent contract requires ${label}`, () => {
    const packet = horizonFixture();
    rewrite(packet.contract, path, value);
    expect(() => deriveHorizon(packet)).toThrow(
      /CronJob source or horizon malformed|Rehearsal bootstrap source coordinates differ/,
    );
  });
}
for (const [schedule, expected] of [
  ['* * * * *', 30],
  ['*/15 * * * *', 2],
  ['\u0085*/15\t* * * *\u0085', 2],
  ['*/7 * * * *', 0],
  ['0,15,30,45 * * * *', 0],
  ['@hourly', 0],
  ['@every 15m', 0],
] as const) {
  test(`CronJob cadence ${schedule} charges only approved expressions`, () => {
    const ledger = deriveHorizon(
      horizonFixture({ schedule, jobTemplate: jobTemplate({ backoffLimit: 0 }) }),
    );
    expect(ledger.entries.filter((c) => c.owner === 'CronJob:dev:later')).toHaveLength(expected);
    if (!expected)
      expect(ledger.blockers).toContainEqual({
        owner: 'CronJob:dev:later',
        missingFact: 'cronjob-calendar-policy',
      });
  });
}
for (const [source, controller, supported] of [
  ['UTC', 'Europe/Kyiv', true],
  ['UTC', 'right/UTC', true],
  [undefined, 'UTC', true],
  [undefined, 'Europe/Kyiv', false],
  [undefined, 'right/UTC', false],
  ['Europe/Kyiv', 'UTC', false],
  ['right/UTC', 'UTC', false],
] as const) {
  test(`CronJob timezone source ${String(source)} precedes controller ${controller}`, () => {
    const packet = horizonFixture({ timeZone: source });
    packet.horizons.windows[0].controllerTimeZone = controller;
    const ledger = deriveHorizon(packet);
    expect(ledger.entries.filter((c) => c.owner === 'CronJob:dev:later')).toHaveLength(
      supported ? 14 : 0,
    );
    if (supported)
      expect(ledger.cronJobLifecycles[0]).toMatchObject({
        effectiveTimeZone: { kind: 'known', name: 'UTC' },
        horizon: { controllerTimeZone: controller },
      });
    else
      expect(ledger.blockers).toContainEqual({
        owner: 'CronJob:dev:later',
        missingFact:
          controller === 'right/UTC' || source === 'right/UTC'
            ? 'cronjob-time-zone-outside-catalogue'
            : 'cronjob-time-zone-policy',
      });
  });
}
for (const [from, to, ticks] of [
  ['00:00:00.001', '00:14:59.999', 0],
  ['00:14:59.999', '00:15:00.000', 1],
  ['00:15:00.000', '00:29:59.999', 0],
  ['00:15:00.000', '00:30:00.000', 1],
] as const) {
  test(`CronJob boundary (${from},${to}] counts ${String(ticks)}`, () => {
    const packet = horizonFixture({ jobTemplate: jobTemplate({ backoffLimit: 2147483647 }) });
    packet.horizons.windows[0].fromExclusive = `2026-10-28T${from}Z`;
    packet.horizons.windows[0].toInclusive = `2026-10-28T${to}Z`;
    const ledger = deriveHorizon(packet);
    expect(ledger.entries.filter((c) => c.owner === 'CronJob:dev:later')).toHaveLength(0);
    if (!ticks)
      expect(ledger.cronJobLifecycles[0]).toMatchObject({ nominalTicks: 0, maximumPodSlots: 0 });
    else
      expect(ledger.blockers).toContainEqual({
        owner: 'CronJob:dev:later',
        missingFact: 'cronjob-attempt-expansion-range',
      });
  });
}
for (const [backoff, expected] of [
  [127, 256],
  [128, 0],
] as const) {
  test(`CronJob aggregate bound backoff${String(backoff)} yields ${String(expected)} slots`, () => {
    const ledger = deriveHorizon(
      horizonFixture({ jobTemplate: jobTemplate({ backoffLimit: backoff }) }),
    );
    expect(ledger.entries.filter((c) => c.owner === 'CronJob:dev:later')).toHaveLength(expected);
    if (!expected)
      expect(ledger.blockers).toContainEqual({
        owner: 'CronJob:dev:later',
        missingFact: 'cronjob-attempt-expansion-range',
      });
  });
}
test('CronJob unsafe aggregate is incomplete before allocation', () => {
  const packet = horizonFixture({
    schedule: '* * * * *',
    jobTemplate: jobTemplate({ backoffLimit: 2147483647 }),
  });
  packet.horizons.windows[0].fromExclusive = '0000-01-01T00:00:00.000Z';
  packet.horizons.windows[0].toInclusive = '9999-12-31T23:59:59.999Z';
  const ledger = deriveHorizon(packet);
  expect(ledger.entries.filter((c) => c.owner === 'CronJob:dev:later')).toHaveLength(0);
  expect(ledger.blockers).toContainEqual({
    owner: 'CronJob:dev:later',
    missingFact: 'cronjob-attempt-expansion-range',
  });
});
test('CronJob exact metadata/provenance and independent obligations survive full charge with no cleanup discount', () => {
  const packet = horizonFixture({
    concurrencyPolicy: 'Forbid',
    startingDeadlineSeconds: 2147483648,
    successfulJobsHistoryLimit: 0,
    failedJobsHistoryLimit: 0,
    jobTemplate: jobTemplate(
      { backoffLimit: 1, activeDeadlineSeconds: 2147483648, ttlSecondsAfterFinished: 0 },
      { labels: { purpose: 'one' }, annotations: null },
    ),
  });
  const ledger = deriveHorizon(packet);
  const lifecycle = ledger.cronJobLifecycles[0];
  expect(ledger.entries.filter((c) => c.owner === 'CronJob:dev:later')).toHaveLength(4);
  expect(ledger.knownContributions).toEqual({ memoryMiB: 512, cpuMilli: 40, diskMiB: 256 });
  expect(lifecycle).toMatchObject({
    jobTemplateMetadata: { labels: { purpose: 'one' }, annotations: null },
    nominalTicks: 2,
    maximumPodSlots: 4,
    runtimeObserved: false,
  });
  expect(lifecycle.jobTemplateSHA256).toBe(packet.horizons.windows[0].jobTemplateSHA256);
  expect(lifecycle.templateSHA256).not.toBe(lifecycle.jobTemplateSHA256);
  for (const [index, charge] of ledger.entries.entries()) {
    expect(charge.source).toEqual({
      owner: packet.cron.entry.owner,
      sha256: packet.cron.entry.source.frameSHA256,
      pointer: `${packet.cron.entry.pointer}/spec/jobTemplate/spec/template/spec`,
    });
    expect(charge.concurrency).toMatchObject({
      tick: Math.floor(index / 2),
      retry: index % 2,
      nominalTime: index < 2 ? '2026-10-28T00:15:00.000Z' : '2026-10-28T00:30:00.000Z',
    });
  }
  expect(ledger.blockers).toContainEqual({
    owner: 'StatefulSet:dev:store',
    missingFact: 'replica-count',
  });
  for (const missingFact of [
    'cronjob-declared-horizon-runtime-binding',
    'cronjob-prior-missed-manual-adopted-recreated-Job-generations-and-retained-history',
  ])
    expect(ledger.blockers).toContainEqual({ owner: 'CronJob:dev:later', missingFact });
  expect(ledger.blockers).not.toContainEqual({
    owner: 'CronJob:dev:later',
    missingFact: 'CronJob-lifecycle-unaccounted',
  });
  expect(ledger.creationAuthority).toBe(false);
  expect(ledger.runtimeAuthority).toBe(false);
  expect(ledger.state).toBe('incomplete');
  expect(() => JSON.stringify(ledger)).not.toThrow();
  const snapshot = JSON.stringify(lifecycle);
  packet.horizons.windows[0].pointer = '/mutated';
  packet.horizons.selection.sourceRevision = 'f'.repeat(40);
  expect(JSON.stringify(lifecycle)).toBe(snapshot);
});
test('CronJob absent template metadata remains absent with conditional defaults', () => {
  const lifecycle = deriveHorizon().cronJobLifecycles[0];
  expect(lifecycle.jobTemplateMetadata).toBe('absent');
  expect(lifecycle.concurrencyPolicy).toEqual({
    declared: 'absent',
    effective: 'Allow',
    basis: 'kubernetes-v1.36.4-default',
  });
  expect(lifecycle.suspend.effective).toBe(false);
  expect(lifecycle.successfulJobsHistoryLimit.effective).toBe(3);
  expect(lifecycle.failedJobsHistoryLimit.effective).toBe(1);
  expect(lifecycle.jobPolicy.backoffLimit.effective).toBe(6);
});
for (const spec of [
  { suspend: true },
  { concurrencyPolicy: 'Replace' },
  { jobTemplate: jobTemplate({ parallelism: 2 }) },
]) {
  test(`CronJob valid unsupported policy retains obligations ${JSON.stringify(spec)}`, () => {
    const ledger = deriveHorizon(horizonFixture(spec));
    expect(ledger.entries.filter((c) => c.owner === 'CronJob:dev:later')).toHaveLength(0);
    expect(ledger.blockers).toContainEqual({
      owner: 'CronJob:dev:later',
      missingFact: 'cronjob-job-lifecycle-policy',
    });
    expect(ledger.blockers).toContainEqual({
      owner: 'CronJob:dev:later',
      missingFact:
        'cronjob-prior-missed-manual-adopted-recreated-Job-generations-and-retained-history',
    });
  });
}

test('CronJob one tick 257 slots stays incomplete without truncation', () => {
  const packet = horizonFixture({ jobTemplate: jobTemplate({ backoffLimit: 256 }) });
  packet.horizons.windows[0].toInclusive = '2026-10-28T00:15:00.000Z';
  const ledger = deriveHorizon(packet);
  expect(ledger.entries).toHaveLength(0);
  expect(ledger.blockers).toContainEqual({
    owner: 'CronJob:dev:later',
    missingFact: 'cronjob-attempt-expansion-range',
  });
});
test('CronJob omission reads no new anchors and supports the legacy four/five native calls', () => {
  const packet = fixture({ schedule: '* * * * *' });
  Object.defineProperty(packet.contract, 'provenance', {
    get() {
      throw new Error('unexpected horizon anchor read');
    },
  });
  Object.defineProperty(packet.contract, 'bootstrapSources', {
    get() {
      throw new Error('unexpected bootstrap anchor read');
    },
  });
  const four = readRehearsalNativeCosts(packet.stages, {}, packet.contract, lock);
  const five = readRehearsalNativeCosts(packet.stages, {}, packet.contract, lock, []);
  expect(four).toEqual(five);
  expect(four.cronJobLifecycles).toEqual([]);
  expect(four.blockers).toContainEqual({
    owner: 'CronJob:dev:later',
    missingFact: 'cronjob-declared-horizon',
  });
});
test('CronJob binding validates late windows before earlier ordinal collision', () => {
  const packet = horizonFixture();
  const broken = fixture({ schedule: '* * * * *' }, 'collision');
  const contract = {
    ...broken.contract,
    bootstrapSources: [],
    provenance: packet.contract.provenance,
  };
  expect(() =>
    readRehearsalNativeCosts(
      broken.stages,
      {},
      contract,
      lock,
      undefined,
      undefined,
      packet.horizons,
    ),
  ).toThrow(/Cron/);
});
test('CronJob empty concurrency and null annotations retain provenance without invented child hooks', () => {
  const ledger = deriveHorizon(
    horizonFixture({
      concurrencyPolicy: '',
      jobTemplate: jobTemplate({}, { annotations: { 'helm.sh/hook': 'post-install' } }),
    }),
  );
  const lifecycle = ledger.cronJobLifecycles[0];
  expect(lifecycle.concurrencyPolicy).toEqual({
    declared: '',
    effective: 'Allow',
    basis: 'kubernetes-v1.36.4-default',
  });
  expect(lifecycle.jobTemplateMetadata).toEqual({
    annotations: { 'helm.sh/hook': 'post-install' },
  });
  expect(lifecycle.hooks).toEqual([]);
  expect(lifecycle.annotations).toBe('absent');
});
test('CronJob shared normalizer fully charges init overhead scratch memory CPU and disk', () => {
  const pod = {
    ...workload(),
    initContainers: [
      {
        name: 'init',
        image: 'example@sha256:' + 'a'.repeat(64),
        resources: {
          requests: { memory: '192Mi', cpu: '20m' },
          limits: { memory: '192Mi', cpu: '1', 'ephemeral-storage': '96Mi' },
        },
        securityContext: { readOnlyRootFilesystem: true },
      },
    ],
    overhead: { memory: '16Mi', cpu: '2m' },
    volumes: [
      { name: 'cache', emptyDir: { medium: 'Memory', sizeLimit: '256Mi' } },
      { name: 'scratch', emptyDir: { sizeLimit: '192Mi' } },
    ],
  };
  const ledger = deriveHorizon(
    horizonFixture({ jobTemplate: jobTemplate({ backoffLimit: 1, template: { spec: pod } }) }),
  );
  expect(
    ledger.entries.map((charge) => [charge.memoryMiB, charge.cpuMilli, charge.diskMiB]),
  ).toEqual(Array.from({ length: 4 }, () => [272, 22, 192]));
  expect(ledger.knownContributions).toEqual({ memoryMiB: 1088, cpuMilli: 88, diskMiB: 768 });
});
test('CronJob supported horizon preserves claims and ephemeral writer obligations', () => {
  const pod = workload();
  delete (pod.containers[0].resources.limits as Record<string, unknown>)['ephemeral-storage'];
  const ledger = deriveHorizon(
    horizonFixture({
      jobTemplate: jobTemplate({
        backoffLimit: 0,
        template: {
          spec: {
            ...pod,
            volumes: [{ name: 'records', persistentVolumeClaim: { claimName: 'records' } }],
          },
        },
      }),
    }),
  );
  expect(ledger.entries).toHaveLength(2);
  expect(ledger.blockers).toContainEqual({
    owner: 'CronJob:dev:later',
    missingFact: 'claim-source:dev/records',
  });
  expect(ledger.blockers).toContainEqual({
    owner: 'CronJob:dev:later',
    missingFact: 'ephemeral-storage-limit-absent:app; writable-logs-and-runtime-state-unobserved',
  });
});

test('CronJob canonical companion forwards first five arguments once and binds native horizons and existing topology', async () => {
  const packet = horizonFixture();
  const bytes = await readFile(
    join(import.meta.dir, '../../../infra/local/platform.k3d.yaml'),
    'utf8',
  );
  const origin = {
    sourcePath: 'infra/local/platform.k3d.yaml',
    artifactPath: 'infra/local/platform.k3d.yaml',
    sha256: hash(bytes),
  };
  const source = readRehearsalSource(packet.stages, {}, packet.contract, lock);
  const prepared = {
    ...source,
    lock,
    inventory: {
      ...source.inventory,
      ...packet.contract,
      provenance: packet.contract.provenance,
      inventorySHA256: hash('inventory'),
      obligations: [],
    },
    topologyEvidence: { bytes, source: origin, selection: packet.horizons.selection },
  } as unknown as Awaited<ReturnType<typeof rehearsalInventory.prepareRehearsalInventory>>;
  (prepared.inventory.bootstrapSources as unknown as unknown[]).push(origin);
  const producer = spyOn(rehearsalInventory, 'prepareRehearsalInventory').mockResolvedValue(
    prepared,
  );
  try {
    const ledger = await deriveObservabilityRehearsalNativeCosts(
      'root',
      'tools',
      { request: true },
      'directory',
      'archive',
      packet.horizons,
    );
    expect(producer).toHaveBeenCalledTimes(1);
    expect(producer.mock.calls[0]).toEqual([
      'root',
      'tools',
      { request: true },
      'directory',
      'archive',
    ]);
    expect(ledger.entries).toHaveLength(14);
    expect(ledger.sourceInventorySHA256).toBe(hash('inventory'));
    expect(ledger.provenance.sourceRevision).toEqual(packet.contract.provenance.sourceRevision);
    const altered = structuredClone(packet.horizons);
    altered.windows[0].pointer += '/different';
    const mismatch = await deriveObservabilityRehearsalNativeCosts(
      'root',
      'tools',
      {},
      'directory',
      undefined,
      altered,
    ).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(String(mismatch)).toContain('Cron');
    prepared.topologyEvidence.bytes += '\n';
    const topologyMismatch = await deriveObservabilityRehearsalNativeCosts(
      'root',
      'tools',
      {},
      'directory',
      undefined,
      packet.horizons,
    ).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(String(topologyMismatch)).toContain('topology');
  } finally {
    producer.mockRestore();
  }
});

for (const metadata of [
  { uid: 'source-uid' },
  { generation: 2 },
  { ownerReferences: [] },
  { deletionTimestamp: 'now' },
  { resourceVersion: '2' },
  { namespace: undefined },
]) {
  test(`CronJob source identity/namespace remains unbound ${JSON.stringify(metadata)}`, () => {
    const ledger = deriveHorizon(horizonFixture({}, metadata));
    expect(ledger.entries).toHaveLength(0);
    expect(
      ledger.blockers.some(
        ({ missingFact }) =>
          missingFact ===
          ('namespace' in metadata
            ? 'source-namespace'
            : 'source-controller-identity-and-generation'),
      ),
    ).toBe(true);
  });
}
test('CronJob provider mismatch preserves horizon and independent missing-bound conditions', () => {
  const packet = horizonFixture();
  const ledger = deriveHorizon(packet, true);
  expect(ledger.entries).toHaveLength(0);
  expect(ledger.blockers).toContainEqual({
    owner: 'CronJob:dev:later',
    missingFact: 'cronjob-job-lifecycle-policy',
  });
  expect(ledger.blockers).toContainEqual({
    owner: 'provider',
    missingFact: 'pinned-defaulting-contract',
  });
});
test('CronJob conditional facts retain all per-Job and whole-attempt prerequisites', () => {
  const ledger = deriveHorizon();
  const lifecycle = ledger.cronJobLifecycles[0];
  expect(lifecycle.conditions).toEqual({
    freshCreation: 'fresh-CronJob-creation-after-fromExclusive',
    controllerClock: 'controller-clock-at-or-before-toInclusive-while-creation-remains-possible',
    stable: 'unchanged-source-calendar-timezone-controller-generation',
    identity: 'one-Job-UID-per-nominal-tick-with-all-per-Job-conditions',
    retention: 'full-failed-terminating-Pod-demand-no-Forbid-deadline-history-TTL-cleanup-credit',
    runtimeObserved: false,
  });
  expect(lifecycle.wholeAttempt).toEqual({
    required: [
      'prior-and-missed-before-fromExclusive-Jobs',
      'manual-adopted-and-recreated-Job-generations',
      'Helm-Flux-generations',
      'retained-Pod-log-device-claim-writer-history',
      'actual-stop-and-window-enforcement',
    ],
    cleanupCredit: false,
    runtimeObserved: false,
  });
  expect(lifecycle.jobPolicy.conditions).toMatchObject({
    failures:
      'every-replaced-nonsuccessful-Pod-durably-counted-once-before-next-create-including-finalizers',
    success: 'no-further-creation-after-first-success',
    runtimeObserved: false,
  });
  expect(lifecycle.horizon.selection).toEqual({
    sourceRevision: 'a'.repeat(40),
    artifactSHA256: 'b'.repeat(64),
  });
  expect(lifecycle.horizon.controllerZone).toEqual({ kind: 'known', name: 'UTC' });
});

for (const [field, value] of [
  ['sourceRevision', 'bad'],
  ['artifactSHA256', 'bad'],
] as const) {
  test(`CronJob coherent malformed selection ${field} throws`, () => {
    const packet = horizonFixture();
    packet.contract.provenance[field] = value;
    packet.horizons.selection[field] = value;
    expect(() => deriveHorizon(packet)).toThrow(/Cron/);
  });
}
test('CronJob invalid parsed date remains a controlled refusal', () => {
  const packet = horizonFixture();
  packet.horizons.windows[0].toInclusive = '2026-13-28T00:00:00.000Z';
  expect(() => deriveHorizon(packet)).toThrow(/Cron/);
});
test('CronJob non-minute field and daily descriptor cannot enter the divisor cadence subset', () => {
  for (const schedule of ['*/15 0 * * *', '@daily']) {
    const ledger = deriveHorizon(horizonFixture({ schedule }));
    expect(ledger.entries).toHaveLength(0);
    expect(ledger.blockers).toContainEqual({
      owner: 'CronJob:dev:later',
      missingFact: 'cronjob-calendar-policy',
    });
  }
});

test('CronJob horizon refuses coherently bound non-Cron owner before incomplete accounting', () => {
  const packet = horizonFixture();
  const documents = parseAllDocuments(packet.stages[0].bytes);
  documents[0].setIn(['spec', 'jobTemplate'], documents[1].getIn(['spec', 'jobTemplate']));
  packet.stages[0].bytes = documents.map((document) => document.toString()).join('---\n');
  packet.stages[0].sha256 = hash(packet.stages[0].bytes);
  Object.assign(packet.contract, captureRehearsalFrames(packet.stages, {}));
  Object.assign(packet.horizons.windows[0], {
    owner: 'StatefulSet:dev:store',
    pointer: '/0',
    frameSHA256: packet.stages[0].sha256,
  });
  expect(() => deriveHorizon(packet)).toThrow(/Cron/);
});

test('CronJob seventh native argument requires full contract and permits explicit undefined horizons', () => {
  const packet = horizonFixture();
  const legacy = readRehearsalNativeCosts(packet.stages, {}, packet.contract, lock);
  expect(
    readRehearsalNativeCosts(
      packet.stages,
      {},
      packet.contract,
      lock,
      undefined,
      undefined,
      undefined,
    ),
  ).toEqual(legacy);
  const bare = fixture({ schedule: '* * * * *' });
  expect(() => {
    return readRehearsalNativeCosts(
      bare.stages,
      {},
      // @ts-expect-error Horizon callers require the independently bound source contract.
      bare.contract,
      lock,
      undefined,
      undefined,
      packet.horizons,
    );
  }).toThrow(/Cron/);
});

test('CronJob positive signed and zero-padded divisor spellings preserve full tick retry accounting and source bindings', () => {
  const baseline = deriveHorizon();
  const coordinates = (ledger: typeof baseline) =>
    ledger.entries.map((charge) => ({
      memoryMiB: charge.memoryMiB,
      cpuMilli: charge.cpuMilli,
      diskMiB: charge.diskMiB,
      concurrency: charge.concurrency,
    }));
  for (const schedule of ['*/+15 * * * *', '*/00015 * * * *', '*/+00015 * * * *']) {
    const packet = horizonFixture({ schedule });
    const ledger = deriveHorizon(packet);
    expect(coordinates(ledger)).toEqual(coordinates(baseline));
    expect(ledger.cronJobLifecycles[0]).toMatchObject({
      nominalTicks: 2,
      maximumPodSlots: 14,
      schedule,
      horizon: { selection: packet.horizons.selection },
      jobTemplateSHA256: baseline.cronJobLifecycles[0].jobTemplateSHA256,
    });
    expect(
      ledger.entries.every(
        (charge) =>
          charge.source.sha256 === packet.cron.entry.source.frameSHA256 &&
          charge.source.pointer ===
            `${packet.cron.entry.pointer}/spec/jobTemplate/spec/template/spec`,
      ),
    ).toBe(true);
  }
  expect(deriveHorizon(horizonFixture({ schedule: '*/+7 * * * *' })).entries).toHaveLength(0);
});
