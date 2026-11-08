import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { observeRegistryDeletionOwner } from './registry-deletion-owner-observation.fixture';
import * as inodePressure from './registry-inode-pressure.fixture';
import { usesRegistryDirectFixtureActions } from './registry-maintenance-host.native';
import { selectRegistrySharedRetirement } from './registry-maintenance-shared.native';

const prefix =
  '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0';
test('pressure direct actions require exact mode', () => {
  expect(usesRegistryDirectFixtureActions(prefix + 'prove-volume-full\0')).toBe(true);
  for (const command of [
    prefix + 'prove-volume-full',
    prefix + 'prove-volume-full\0extra\0',
    '/wrong' + prefix + 'prove-volume-full\0',
  ])
    expect(usesRegistryDirectFixtureActions(command)).toBe(false);
});
for (const [mode, action, operationId, expected] of [
  ['prove-volume-full', 'restore-service', 'native-volume-backup', 'handoff'],
  ['prove-volume-full', 'restore-service', 'native-host-backup', 'direct'],
  ['prove-volume-full', 'assert-stopped', 'native-volume-backup', 'direct'],
  ['prove-volume-full', 'collect', 'native-volume-backup', 'direct'],
  ['prove-volume-full\0extra', 'restore-service', 'native-volume-backup', 'direct'],
  ['prove-tag-recovery', 'restore-service', 'native-volume-backup', 'direct'],
] as const)
  test(
    'pressure handoff dispatch ' + mode.replaceAll('\0', ':') + ' ' + action + ' ' + operationId,
    async () => {
      const source = await readFile(
        new URL('./registry-maintenance-host.native.ts', import.meta.url),
        'utf8',
      );
      const start = source.indexOf('        const dispatch ='),
        end = source.indexOf('        const receipt = await dispatch', start);
      if (start < 0 || end < start) throw new Error('Missing actual root dispatch');
      // Boundary: actual dispatch expression with exact reference sentinels; no root effect is executed.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const invoke = new Function(
        'fixtureCommand',
        'request',
        'isDirectFixture',
        'retainRegistryPressureFence',
        'interruptRegistryCollectionFixture',
        'collectRegistryUnsafeFixture',
        'failRegistryTagCleanupFixture',
        'executeRegistryHostAction',
        'proveRegistryCollectionAdmission',
        'proveRegistryUploadGrace',
        source.slice(start, end) + ';return dispatch;',
      ) as (...ports: unknown[]) => unknown;
      expect(
        invoke(
          prefix + mode + '\0',
          { action, operationId },
          true,
          'handoff',
          'kill',
          'unsafe',
          'tag',
          'direct',
          'admission',
          'grace',
        ),
      ).toBe(expected);
    },
  );
for (const mode of ['pressure-backup', 'pressure-recover'] as const)
  for (const fault of ['none', 'operation', 'observation', 'both'] as const)
    test('pressure lifecycle owner ' + mode + ' ' + fault, async () => {
      const source = await readFile(
        new URL('./registry-maintenance-host.native.ts', import.meta.url),
        'utf8',
      );
      const start = source.indexOf('async function owner(mode: string) {'),
        end = source.indexOf('/** Target only', start);
      if (start < 0 || end < start) throw new Error('Missing actual owner');
      const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(source.slice(start, end));
      const calls: unknown[] = [],
        output: string[] = [];
      const ports = { clock: 'real' },
        runtime = { backup: {}, recovery: {} },
        verifier = { recoverRegistry: Symbol('verified') };
      const operationFailure = new Error('private operation'),
        observationFailure = new Error('private observation');
      const perform = (input: unknown) => {
        calls.push(input);
        return fault === 'operation' || fault === 'both'
          ? Promise.reject(operationFailure)
          : Promise.resolve();
      };
      // Boundary: actual owner body, with native installation/authority/runtime/HTTP effects explicitly modeled.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const invoke = new Function(
        'process',
        'readRegistryMaintenanceInstallation',
        'createRegistryAuthorityPorts',
        'createRegistryMaintenanceRuntime',
        'startRegistryHttpObservation',
        'maintainRegistry',
        'stageRegistryRecovery',
        'createRegistryRecoveryVerifier',
        'console',
        'directory',
        'selectRegistrySharedRetirement',
        'let populationBoundary;\n' + body + ';return owner;',
      ) as (...ports: unknown[]) => (mode: string) => Promise<void>;
      const owner = invoke(
        { getuid: () => 59001, getgid: () => 59001 },
        () => Promise.resolve({}),
        () => ports,
        () => runtime,
        () => ({
          finish: () => {
            if (fault === 'observation' || fault === 'both') throw observationFailure;
            return { pending: 0 };
          },
        }),
        perform,
        perform,
        (input: unknown) => {
          expect(input).toEqual({
            runtime: runtime.recovery,
            backup: runtime.backup,
            consumers: ports,
          });
          return verifier;
        },
        { log: (line: string) => output.push(line), error: (line: string) => output.push(line) },
        '/canonical',
        selectRegistrySharedRetirement,
      );
      const refused = await owner(mode).then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(calls).toEqual([
        {
          directory: '/canonical',
          operationId: 'native-volume-backup',
          owner: 'operator',
          kind: 'backup',
          ...(mode === 'pressure-backup' ? { recover: false } : {}),
          ports: mode === 'pressure-backup' ? ports : { ...ports, ...verifier },
          runtime,
          backup: runtime.backup,
        },
      ]);
      if (fault === 'both') {
        expect(refused).toBeInstanceOf(AggregateError);
        expect((refused as AggregateError).errors).toEqual([operationFailure, observationFailure]);
        expect((refused as Error).cause).toBe(operationFailure);
      } else if (fault === 'operation') expect(refused).toBe(operationFailure);
      else if (fault === 'observation') expect(refused).toBe(observationFailure);
      else {
        expect(refused).toBeUndefined();
        expect(output.at(-1)).toBe(
          mode === 'pressure-backup'
            ? 'pressure-backup-returned'
            : 'pressure-recovery-staged-fenced',
        );
      }
      expect(output.join('')).not.toContain('private');
    });

for (const [mode, fails, allocation] of [
  ['prove-volume-full', false, 'bytes'],
  ['prove-volume-full', false, 'inodes'],
  ['prove-volume-full', false, 'upload'],
  ['prove-volume-full', true, 'upload'],
  ['prove-volume-full-extra', false, undefined],
  ['prove-volume-full', true, 'bytes'],
  ['prove-volume-full', false, undefined],
  ['prove-volume-full', false, 'unknown'],
] as const)
  test(
    'pressure main and cgroup cleanup route ' +
      mode +
      ' ' +
      String(fails) +
      ' ' +
      String(allocation),
    async () => {
      const source = await readFile(
        new URL('./registry-maintenance-host.native.ts', import.meta.url),
        'utf8',
      );
      const start = source.indexOf(
        '  const mode = process.argv.at(2);',
        source.indexOf('if (import.meta.main)'),
      );
      const end = source.indexOf('  } catch (cause) {', start);
      if (start < 0 || end < start) throw new Error('Missing actual main routing');
      const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
        'async function main(){' + source.slice(start, end) + '} catch(cause){throw cause;} }',
      );
      const calls: unknown[] = [],
        failure = new Error('modeled pressure failure'),
        runner = Symbol('exact owner runner');
      // Boundary: actual main route and finally caller; controller, reaper and owner are modeled.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const invoke = new Function(
        'process',
        'backupFaultModes',
        'installMaintenanceReaper',
        'proveRegistryPressureHost',
        'parseRegistryPressureAllocation',
        'runNativeOwner',
        'reapNamespace',
        'owner',
        'proveRegistryUploadPressureHost',
        body + ';return main();',
      ) as (...ports: unknown[]) => Promise<void>;
      const refused = await invoke(
        {
          argv: ['bun', '/usr/local/libexec/puni-registry-maintenance/proof.js', mode],
          env: { PUNI_REGISTRY_FIXTURE_ALLOCATION: allocation },
        },
        new Map(),
        () => undefined,
        (selected: unknown, selectedAllocation: unknown) => {
          calls.push(['controller', selected, selectedAllocation]);
          return fails ? Promise.reject(failure) : Promise.resolve();
        },
        inodePressure.parseRegistryPressureAllocation,
        runner,
        (hasCgroup: boolean) => {
          calls.push(['reap', hasCgroup]);
          return Promise.resolve();
        },
        (selected: string) => {
          calls.push(['owner', selected]);
          return Promise.resolve();
        },
        (selected: unknown) => {
          calls.push(['upload-controller', selected]);
          return fails ? Promise.reject(failure) : Promise.resolve();
        },
      ).then(
        () => undefined,
        (cause: unknown) => cause,
      );
      const invalid =
        mode === 'prove-volume-full' &&
        allocation !== 'bytes' &&
        allocation !== 'inodes' &&
        allocation !== 'upload';
      if (invalid) {
        expect(refused).toBeInstanceOf(Error);
        expect(refused).not.toBeInstanceOf(TypeError);
      } else expect(refused).toBe(fails ? failure : undefined);
      expect(calls).toEqual(
        invalid
          ? [['reap', true]]
          : mode === 'prove-volume-full'
            ? [
                allocation === 'upload'
                  ? ['upload-controller', runner]
                  : ['controller', runner, allocation],
                ['reap', true],
              ]
            : [['owner', mode]],
      );
    },
  );

for (const fault of [
  'none',
  'operation',
  'observation',
  'operation-observation',
  'operation-reporter',
  'operation-reporter-observation',
] as const)
  test(
    'retirement owner preserves every failure and completes HTTP observation: ' + fault,
    async () => {
      const source = await readFile(
        new URL('./registry-maintenance-host.native.ts', import.meta.url),
        'utf8',
      );
      const start = source.indexOf('async function owner(mode: string) {');
      const end = source.indexOf('/** Target only', start);
      if (start < 0 || end < start) throw new Error('Missing actual owner');
      const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(source.slice(start, end));
      const operationFailure = new Error('private retirement failure');
      const reportingFailure = new Error('private retirement reporter failure');
      const observationFailure = new Error('private HTTP observer failure');
      const operationFails = fault.includes('operation');
      const reportingFails = fault.includes('reporter');
      const observationFails = fault.includes('observation');
      const ports = {},
        runtime = { backup: {} };
      const calls: string[] = [],
        output: string[] = [],
        requests: unknown[] = [];
      // Boundary: the complete actual fixture owner runs with modeled installation,
      // journal, maintenance and observation ports; this does not execute native retirement.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const invoke = new Function(
        'process',
        'readRegistryMaintenanceInstallation',
        'createRegistryAuthorityPorts',
        'createRegistryFixtureClock',
        'readRegistryFixtureRetirementClock',
        'executeRegistryCommand',
        'createRegistryMaintenanceRuntime',
        'startRegistryHttpObservation',
        'maintainRegistry',
        'describeRegistryDeletionFailure',
        'console',
        'directory',
        'selectRegistrySharedRetirement',
        'let populationBoundary;\n' + body + ';return owner;',
      ) as (...ports: unknown[]) => (mode: string) => Promise<void>;
      let reads = 0;
      const owner = invoke(
        { getuid: () => 59001, getgid: () => 59001 },
        () => Promise.resolve({}),
        () => ports,
        () => () => '2030-01-01T00:00:00.000Z',
        () => Promise.resolve('2030-01-01T00:00:00.000Z'),
        (directory: string, command: unknown, selected: unknown) => {
          expect(directory).toBe('/canonical');
          expect(command).toEqual({ command: 'read' });
          expect(selected).toBe(ports);
          reads++;
          return Promise.resolve({
            state: { schemaVersion: 4, maintenance: null, lastVerifiedBackup: {}, fenced: true },
          });
        },
        () => runtime,
        () => ({
          finish: () => {
            calls.push('observation');
            if (observationFails) throw observationFailure;
            return { pending: 0 };
          },
        }),
        (request: unknown) => {
          requests.push(request);
          calls.push('maintenance');
          return operationFails ? Promise.reject(operationFailure) : Promise.resolve();
        },
        (cause: unknown) => {
          expect(cause).toBe(operationFailure);
          calls.push('reporter');
          if (reportingFails) throw reportingFailure;
          return 'fixed-public-stage';
        },
        { log: (line: string) => output.push(line), error: (line: string) => output.push(line) },
        '/canonical',
        selectRegistrySharedRetirement,
      );
      const refused = await owner('deletion-retire').then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(requests).toEqual([
        {
          directory: '/canonical',
          operationId: 'native-host-retire',
          owner: 'operator',
          kind: 'retirement',
          recover: false,
          ports,
          runtime,
          backup: runtime.backup,
        },
      ]);
      expect(calls).toEqual(
        operationFails
          ? ['maintenance', 'reporter', 'observation']
          : ['maintenance', 'observation'],
      );
      if (operationFails && (reportingFails || observationFails)) {
        expect(refused).toBeInstanceOf(AggregateError);
        expect((refused as AggregateError).errors).toEqual([
          operationFailure,
          ...(reportingFails ? [reportingFailure] : []),
          ...(observationFails ? [observationFailure] : []),
        ]);
        expect((refused as Error).cause).toBe(operationFailure);
      } else if (operationFails) expect(refused).toBe(operationFailure);
      else if (observationFails) expect(refused).toBe(observationFailure);
      else {
        expect(refused).toBeUndefined();
        expect(output.at(-1)).toBe('verified-native-retirement');
      }
      expect(reads).toBe(fault === 'none' ? 2 : 1);
      expect(output.join('')).not.toContain('private');
    },
  );

for (const [fault, expectedMembers] of [
  ['none', []],
  ['publication', ['primary']],
  ['observation', ['observation']],
  ['both', ['primary', 'observation']],
  ['output', ['output']],
  ['output-observation', ['output', 'observation']],
  ['confirmation', ['primary']],
  ['confirmation-observation', ['primary', 'observation']],
  ['delayed-confirmation', []],
] as const)
  test('population owner confirms fencing before publication receipt: ' + fault, async () => {
    const observed = await observeRegistryDeletionOwner({ family: 'population', fault });
    expect(observed.members).toEqual([...expectedMembers]);
    expect(observed.state).toBe(expectedMembers.length === 0 ? 'fulfilled' : 'rejected');
    expect(observed.observerFinishes).toBe(1);
    expect(observed.received).toEqual(
      ['publication', 'both'].includes(fault)
        ? []
        : [
            {
              directory: '/var/lib/puni-registry/journal/contents',
              command: { command: 'check-capacity' },
              hasPorts: true,
            },
          ],
    );
    const refusesBeforeReceipt = [
      'publication',
      'both',
      'confirmation',
      'confirmation-observation',
    ].includes(fault);
    expect(observed.output).toEqual(
      refusesBeforeReceipt || fault.startsWith('output') ? [] : ['{"published":true}'],
    );
    expect(observed.events.indexOf('observer-finish')).toBeGreaterThan(
      observed.events.indexOf('publication'),
    );
    if (!['publication', 'both'].includes(fault)) {
      expect(observed.events.indexOf('confirmation')).toBeGreaterThan(
        observed.events.indexOf('publication'),
      );
      expect(observed.events.indexOf('observer-finish')).toBeGreaterThan(
        observed.events.indexOf('confirmation'),
      );
    }
    if (fault === 'delayed-confirmation') {
      expect(observed.settledBeforeConfirmation).toBe(false);
      expect(observed.publishedBeforeConfirmation).toBe(false);
    }
    if (fault === 'confirmation') expect(observed.isExactPrimary).toBe(true);
    if (fault === 'output-observation') expect(observed.hasOutputCause).toBe(true);
    if (fault === 'both' || fault === 'confirmation-observation')
      expect(observed.hasPrimaryCause).toBe(true);
    expect(observed.output.join('') + observed.errors.join('')).not.toContain('PRIVATE');
  });
