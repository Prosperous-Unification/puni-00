import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { RegistryDeletionPublication } from './registry-deletion.fixture';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { readRegistryIndexPublication } from './registry-maintenance-index.native';
import { readRegistryBytes } from './registry-stream';

const cases = [
  ['seed-schema', 'backup'],
  ['seed-backup', 'backup'],
  ['before-schema', 'backup'],
  ['before-backup', 'backup'],
  ['reopen-schema', 'reopen'],
  ['final-schema', 'verify'],
  ['backup-protection', 'backup'],
  ['backup-bundles', 'backup'],
  ['bootstrap-code', 'bootstrap'],
  ['bootstrap-receipt', 'bootstrap'],
  ['backup-extra', 'backup'],
  ['final-prior', 'verify'],
  ['seed-count', 'seed'],
  ['seed-root', 'seed'],
  ['seed-repository', 'seed'],
  ['backup-target', 'backup'],
  ['backup-revision', 'backup'],
  ['backup-reason', 'backup'],
  ['backup-missing', 'backup'],
  ['backup-pair', 'backup'],
  ['final-backup', 'verify'],
  ['final-root', 'verify'],
  ['none', 'completed'],
  ['bootstrap', 'bootstrap'],
  ['seed-owner', 'seed'],
  ['seed-kind', 'seed'],
  ['seed-protection', 'backup'],
  ['backup-stderr', 'backup'],
  ['backup-incomplete', 'backup'],
  ['backup-identity', 'backup'],
  ['backup-lineage', 'backup'],
  ['backup-reused', 'backup'],
  ['before-unfenced', 'backup'],
  ['before-busy', 'backup'],
  ['before-publication', 'backup'],
  ['before-reservation', 'backup'],
  ['initial-write', 'cold-start'],
  ['status-stderr', 'status-before'],
  ['status-extra', 'status-before'],
  ['status-identity', 'status-before'],
  ['status-revision', 'status-before'],
  ['status-backup', 'status-before'],
  ['status-fence', 'status-before'],
  ['reopen-stderr', 'reopen'],
  ['reopen-fenced', 'reopen'],
  ['reopen-revision', 'reopen'],
  ['reopen-target', 'reopen'],
  ['reopen-protection', 'reopen'],
  ['guard-writable', 'reopen'],
  ['fresh-owner', 'publication'],
  ['fresh-revision', 'publication'],
  ['fresh-root', 'publication'],
  ['final-publication', 'verify'],
  ['final-reservation', 'verify'],
  ['final-fenced', 'verify'],
  ['final-receipt', 'verify'],
  ['final-protection', 'verify'],
  ['protected-missing', 'verify'],
  ['status-after', 'status-after'],
  ['cleanup', 'completed'],
  ['reporter', 'bootstrap'],
] as const;
for (const [fault, phase] of cases)
  test('serving controller refuses incomplete native evidence ' + fault, async () => {
    const source = await readFile(
      new URL('./registry-serving-host.native.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('const Backup =');
    if (start < 0) throw new Error('Missing actual serving controller');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source.slice(start).replace('export async function', 'async function'),
    );
    const digest = (letter: string) => 'sha256:' + letter.repeat(64);
    const seed = {
      kind: 'protected',
      operationId: 'seed',
      repository: 'retained/index',
      root: digest('a'),
      manifests: ['a', 'b', 'c'].map(digest),
      blobs: ['d', 'e', 'f', '1'].map(digest),
    };
    const fresh = {
      revision: 4,
      operationId: 'fresh',
      root: digest('2'),
      manifests: ['2', '3', '4'].map(digest),
      blobs: ['5', '6', '7', '8'].map(digest),
    };
    const installed = {
      registryId: 'fixture',
      journalPath: '/canonical',
      ordinary: { path: '/store', storageId: 'storage' },
      recovery: { state: 'enrolled' },
    };
    const protection = { roots: [seed.root] };
    const kept = { operationId: 'seed', roots: [seed.root], receipt: { state: 'completed' } };
    const seeded = {
      schemaVersion: 4,
      revision: 7,
      fenced: false,
      fenceReason: null,
      maintenanceVerified: true,
      maintenance: null,
      publication: null,
      reservations: [],
      protections: [protection],
      bundles: [kept],
      lastVerifiedBackup: { snapshotId: '0'.repeat(64) },
      enrollment: { registryId: 'fixture', storageId: 'storage', registryPath: '/store' },
    };
    const before = {
      ...seeded,
      revision: 8,
      fenced: true,
      fenceReason: 'maintenance',
      lastVerifiedBackup: { snapshotId: 'b'.repeat(64) },
      maintenanceEvidence: { operationId: 'backup', backup: { snapshotId: 'b'.repeat(64) } },
    };
    const reopened = { ...before, revision: 9, fenced: false, fenceReason: null };
    const after = {
      ...reopened,
      revision: 20,
      bundles: [
        kept,
        { operationId: 'fresh', roots: [fresh.root], receipt: { state: 'completed' } },
      ],
    };
    const status = {
      registryId: 'fixture',
      storageId: 'storage',
      registryPath: '/store',
      revision: 8,
      fenced: true,
      reason: 'maintenance',
      operation: null,
      recoveryTarget: 'enrolled',
      verifiedBackup: 'b'.repeat(64),
    };
    const finalStatus = { ...status, revision: 20, fenced: false, reason: null };
    const primary = new Error('private bootstrap');
    const reporting = new Error('private reporter');
    const closing = new Error('private close');
    const calls: string[] = [],
      output: string[] = [];
    if (fault === 'seed-schema') seeded.schemaVersion = 3;
    if (fault === 'seed-backup') Reflect.set(seeded, 'lastVerifiedBackup', null);
    if (fault === 'before-schema') before.schemaVersion = 3;
    if (fault === 'before-backup') Reflect.set(before, 'lastVerifiedBackup', null);
    if (fault === 'reopen-schema') reopened.schemaVersion = 3;
    if (fault === 'final-schema') after.schemaVersion = 3;
    if (fault === 'backup-protection') before.protections = [];
    if (fault === 'backup-bundles') before.bundles = [];
    if (fault === 'final-prior') after.bundles[0] = { ...kept, receipt: { state: 'abandoned' } };
    if (fault === 'seed-count') seed.blobs.pop();
    if (fault === 'seed-root') seed.root = digest('9');
    if (fault === 'seed-repository') seed.repository = 'retained/expired';
    if (fault === 'backup-target')
      before.enrollment = { ...before.enrollment, storageId: 'foreign' };
    if (fault === 'backup-revision') before.revision = seeded.revision;
    if (fault === 'backup-reason') before.fenceReason = 'foreign';
    if (fault === 'backup-missing') Reflect.set(before, 'maintenanceEvidence', null);
    if (fault === 'backup-pair') before.maintenanceEvidence.backup = { snapshotId: 'c'.repeat(64) };
    if (fault === 'final-backup') after.lastVerifiedBackup = { snapshotId: 'c'.repeat(64) };
    if (fault === 'final-root')
      after.bundles[1] = {
        operationId: 'fresh',
        roots: [seed.root],
        receipt: { state: 'completed' },
      };
    if (fault === 'seed-kind') seed.kind = 'expired';
    if (fault === 'seed-protection') {
      seeded.protections = [];
      before.protections = [];
      reopened.protections = [];
      after.protections = [];
    }
    if (fault === 'backup-lineage') before.maintenanceEvidence.operationId = 'foreign';
    if (fault === 'backup-reused') {
      before.lastVerifiedBackup.snapshotId = seeded.lastVerifiedBackup.snapshotId;
      before.maintenanceEvidence.backup = { ...before.lastVerifiedBackup };
    }
    if (fault === 'before-unfenced') before.fenced = false;
    if (fault === 'before-busy') Reflect.set(before, 'maintenance', {});
    if (fault === 'before-publication') Reflect.set(before, 'publication', {});
    if (fault === 'before-reservation') Reflect.set(before, 'reservations', [{}]);
    if (fault === 'status-identity') status.storageId = 'foreign';
    if (fault === 'status-revision') status.revision = 7;
    if (fault === 'status-backup') status.verifiedBackup = 'c'.repeat(64);
    if (fault === 'status-fence') status.fenced = false;
    if (fault === 'status-extra') Reflect.set(status, 'foreign', true);
    if (fault === 'reopen-fenced') reopened.fenced = true;
    if (fault === 'reopen-revision') reopened.revision = 8;
    if (fault === 'reopen-target')
      reopened.enrollment = { ...reopened.enrollment, storageId: 'foreign' };
    if (fault === 'reopen-protection') reopened.protections = [];
    if (fault === 'fresh-revision') fresh.revision = 3;
    if (fault === 'fresh-root') fresh.root = seed.root;
    if (fault === 'final-publication') Reflect.set(after, 'publication', {});
    if (fault === 'final-reservation') Reflect.set(after, 'reservations', [{}]);
    if (fault === 'final-fenced') after.fenced = true;
    if (fault === 'final-receipt')
      after.bundles[1] = {
        operationId: 'fresh',
        roots: [fresh.root],
        receipt: { state: 'unfinished' },
      };
    if (fault === 'final-protection') after.protections = [];
    if (fault === 'status-after') finalStatus.revision = 19;
    let reads = 0,
      guards = 0,
      statuses = 0;
    const ports = {
      type,
      assert,
      RegistryDeletionPublication,
      completeRegistryFixture,
      describeRegistryGuardObservationFailure,
      readRegistryBytes,
      readRegistryIndexPublication,
      prepareRegistryHostFixture: () => Promise.resolve({ installed }),
      prepareRegistryIndexReaders: () => Promise.resolve(),
      writeFile: (path: string) => {
        calls.push('write:' + path);
        return Promise.resolve();
      },
      readFile: (path: string) => {
        assert.equal(path, '/canonical/journal.json');
        const states: (typeof seeded | typeof before | typeof after | undefined)[] = [
          seeded,
          before,
          after,
        ];
        const state = states[reads++];
        if (state === undefined) throw new Error('Unexpected canonical reread');
        return Promise.resolve(JSON.stringify(state));
      },
      parseRegistryCommandResponse: (encoded: { state: unknown }) => encoded,
      startRegistryFixtureGuard: () => {
        const number = ++guards;
        calls.push('guard:' + String(number));
        return Promise.resolve({
          waitMode: (mode: string) => {
            calls.push('mode:' + String(number) + ':' + mode);
            if (number === 2 && mode === 'writable' && fault === 'guard-writable')
              return Promise.reject(new Error('no writable guard'));
            return Promise.resolve();
          },
          close: () => {
            calls.push('close:' + String(number));
            return number === 2 && fault === 'cleanup'
              ? Promise.reject(closing)
              : Promise.resolve();
          },
        });
      },
      fetch: () =>
        Promise.resolve(new Response('refused', { status: fault === 'initial-write' ? 202 : 405 })),
      verifyPresent: (_kind: string, selected: string) => {
        calls.push('read:' + selected);
        return selected === seed.root && fault === 'protected-missing'
          ? Promise.reject(new Error('protected absent'))
          : Promise.resolve();
      },
      console: {
        log: (line: string) => {
          if (fault === 'reporter' && line.includes('servingFailure')) throw reporting;
          output.push(line);
        },
      },
    };
    // Boundary: full actual controller and real schemas/completion/diagnostics, with namespace/filesystem/owner/CLI/guard/HTTP effects explicitly modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      ...Object.keys(ports),
      body + ';return proveRegistryServingHost;',
    ) as (
      ...ports: unknown[]
    ) => (
      run: (mode: string) => Promise<unknown>,
      cli: (request: { action: string; revision?: number }) => Promise<unknown>,
    ) => Promise<void>;
    const run = (mode: string) => {
      calls.push(mode);
      if (mode === 'initialize') {
        if (fault === 'bootstrap' || fault === 'reporter') throw primary;
        return Promise.resolve({
          code: fault === 'bootstrap-code' ? 1 : 0,
          stdout: fault === 'bootstrap-receipt' ? 'foreign' : 'initialized',
          stderr: '',
        });
      }
      if (mode === 'backup')
        return Promise.resolve({ code: 0, stdout: 'verified-native-backup', stderr: '' });
      if (mode === 'index-reopen')
        return Promise.resolve({ code: 0, stdout: 'population-writable-permitted', stderr: '' });
      if (mode === 'deletion-publish-protected')
        return Promise.resolve({
          code: fault === 'seed-owner' ? 1 : 0,
          stdout: JSON.stringify(seed),
          stderr: '',
        });
      if (mode === 'deletion-protect')
        return Promise.resolve({ code: 0, stdout: 'index-explicitly-protected', stderr: '' });
      if (mode === 'index-publish-4')
        return Promise.resolve({
          code: fault === 'fresh-owner' ? 1 : 0,
          stdout: JSON.stringify(fresh),
          stderr: 'task8-population-http:{"events":[],"truncated":false,"pending":0}\n',
        });
      throw new Error('Unexpected serving owner');
    };
    const cli = (request: { action: string; revision?: number }) => {
      calls.push('cli:' + request.action);
      if (request.action === 'backup')
        return Promise.resolve({
          stdout:
            JSON.stringify({
              operationId: 'backup',
              owner: 'operator',
              kind: 'backup',
              status: 'starting',
              ...(fault === 'backup-extra' ? { foreign: true } : {}),
            }) +
            '\n' +
            (fault === 'backup-incomplete'
              ? ''
              : JSON.stringify({
                  operationId: fault === 'backup-identity' ? 'foreign' : 'backup',
                  status: 'completed-fenced',
                })) +
            '\n',
          stderr: fault === 'backup-stderr' ? 'warning' : '',
        });
      if (request.action === 'reopen') {
        assert.equal(request.revision, 8);
        return Promise.resolve({
          stdout: JSON.stringify({ state: reopened }),
          stderr: fault === 'reopen-stderr' ? 'warning' : '',
        });
      }
      if (request.action === 'status')
        return Promise.resolve({
          stdout: JSON.stringify(statuses++ === 0 ? status : finalStatus),
          stderr: fault === 'status-stderr' ? 'warning' : '',
        });
      throw new Error('Unexpected serving CLI');
    };
    const completion = await invoke(...Object.values(ports))(run, cli).then(
      () => ({ state: 'fulfilled' as const }),
      (cause: unknown) => ({ state: 'rejected' as const, cause }),
    );
    if (fault === 'none') {
      expect(completion.state).toBe('fulfilled');
      expect(calls.filter((call) => call.startsWith('cli:'))).toEqual([
        'cli:backup',
        'cli:status',
        'cli:reopen',
        'cli:status',
      ]);
      expect(calls.filter((call) => call.startsWith('read:'))).toHaveLength(14);
      expect(calls.filter((call) => call.startsWith('close:'))).toEqual(['close:1', 'close:2']);
      expect(output.some((line) => line.includes('ordinary-cli-writable-serving'))).toBe(true);
    } else {
      expect(completion.state).toBe('rejected');
      if (fault === 'seed-protection') expect(calls).not.toContain('cli:backup');
      expect(output.some((line) => line.includes('ordinary-cli-writable-serving'))).toBe(false);
      if (fault === 'reporter') {
        if (completion.state !== 'rejected' || !(completion.cause instanceof AggregateError))
          throw new Error('Missing original/report compound');
        expect(completion.cause.errors).toEqual([primary, reporting]);
        expect(completion.cause.cause).toBe(primary);
      } else {
        const diagnostic = output
          .map((line): unknown => JSON.parse(line))
          .find(
            (encoded) =>
              typeof encoded === 'object' && encoded !== null && 'servingFailure' in encoded,
          );
        expect(diagnostic).toMatchObject({ servingFailure: { stage: phase } });
      }
    }
  });
