import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';

for (const fault of [
  'none',
  'open-ack',
  'later-revocation',
  'inode',
  'inode-before-recovery',
  'inode-after-recovery',
  'inode-held',
  'selected-missing',
  'publication',
  'nested-cause',
  'shared-cause',
  'bounded-causes',
  'cleanup',
  'both',
  'bootstrap',
  'publication-http',
  'publication-kind',
  'protection',
  'targets',
  'mounts',
  'deployment',
  'backup-owner',
  'backup-http',
  'receipt-pid',
  'receipt-request',
  'ack-bytes',
  'ack-error',
  'open-ack-present',
  'writer-live',
  'writer-error',
  'group-live',
  'group-error',
  'failed-fence',
  'failed-revision',
  'failed-backup',
  'matching-backup',
  'handoff-missing',
  'handoff-unreadable',
  'handoff-size',
  'handoff-shape',
  'handoff-backup',
  'action-prefix',
  'action-completed',
  'filler',
  'bridge-close',
  'recovery-probe',
  'recovery-owner',
  'recovery-http',
  'recovery-schema',
  'recovery-target',
  'obligations',
  'lock',
  'staged-bytes',
  'old-root',
  'restored-root',
  'recovery-filler',
  'recovery-history',
  'recovery-serving',
  'reporter',
] as const)
  test('physical pressure controller modeled lifecycle ' + fault, async () => {
    const source = await readFile(
      new URL('./registry-maintenance-pressure.native.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('export async function proveRegistryPressureHost(');
    if (start < 0) throw new Error('Missing pressure controller');
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      source.slice(start).replace('export async function', 'async function'),
    );
    const calls: string[] = [],
      output: string[] = [];
    const inodeFailure = new Error('private inode verification');
    let inodeVerifies = 0,
      releaseVerification: (() => void) | undefined;
    const verification = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    const nestedFailure = new Error('private inner failure');
    nestedFailure.stack =
      'Error: private inner failure\n    at selected (/usr/local/libexec/puni-registry-maintenance/proof.js:17:3)';
    const children = Array.from({ length: 20 }, () => new Error('private bounded cause'));
    Object.defineProperty(children, '16', {
      get() {
        throw new Error('private forbidden seventeenth cause');
      },
    });
    const operationFailure =
      fault === 'bounded-causes'
        ? new AggregateError([], 'private publication')
        : new Error('private publication');
    if (operationFailure instanceof AggregateError) operationFailure.errors = children;
    if (fault === 'nested-cause') operationFailure.cause = nestedFailure;
    if (fault === 'shared-cause') operationFailure.cause = operationFailure;
    const cleanupFailure = new Error('private cleanup'),
      reporterFailure = new Error('private reporter');
    const old = '/var/lib/puni-registry/registry/contents',
      canonical = '/var/lib/puni-registry/journal/contents',
      target = '/var/lib/puni-registry/recovery/registry/contents',
      staged = '/var/lib/puni-registry/recovery/journal/contents';
    const snapshot = Buffer.from('verified offline journal');
    const digest = 'sha256:' + 'a'.repeat(64),
      instance = 'fresh instance\n',
      request = 'fresh request\n';
    const hash = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
    const backup = {
      snapshotId: 'b'.repeat(64),
      journalSha256: hash(snapshot),
      censusSha256: 'c'.repeat(64),
      registryId: 'registry',
      storageId: 'old',
      registryPath: old,
      journalPath: canonical,
    };
    const publication = {
      kind: 'protected',
      repository: 'retained/index',
      root: digest,
      manifests: [digest, 'sha256:' + 'd'.repeat(64), 'sha256:' + 'e'.repeat(64)],
      blobs: ['sha256:' + 'f'.repeat(64)],
    };
    const deploymentPin: Pick<RegistryMaintenanceInstallation['ordinary']['deployment'], 'uid'> = {
      uid: 'deployment',
    };
    const installed = {
      registryId: 'registry',
      journalPath: canonical,
      ordinary: { path: old, storageId: 'old', deployment: deploymentPin },
      recovery: { state: 'enrolled', path: target, storageId: 'new', stagedJournalPath: staged },
    };
    const before = {
      schemaVersion: 4,
      revision: 5,
      fenced: false,
      maintenance: null,
      bundles: [{ root: digest }],
      protections: [{ roots: [digest] }],
      consumers: [],
      environments: [],
      deployments: [],
    };
    const failed = {
      ...before,
      revision: 9,
      fenced: true,
      maintenance: { operationId: 'native-volume-backup', kind: 'backup', phase: 'failed' },
      maintenanceEvidence: {
        operationId: 'native-volume-backup',
        backup,
        backupCensusSha256: backup.censusSha256,
      },
      lastVerifiedBackup: backup,
      enrollment: { registryId: 'registry', storageId: 'old', registryPath: old },
    };
    const restored = {
      ...failed,
      revision: 15,
      maintenance: { ...failed.maintenance, phase: 'restored' },
      enrollment: { registryId: 'registry', storageId: 'new', registryPath: target },
    };
    const rootReceipt = {
      scope: 'controlled-pre-serving-after-verified-backup',
      operationId: 'native-volume-backup',
      snapshotId: backup.snapshotId,
      journalSha256: backup.journalSha256,
      writerExclusion: 'verified',
    };
    if (fault === 'publication-kind') publication.kind = 'expired';
    if (fault === 'protection') before.protections = [];
    if (fault === 'targets') installed.recovery.state = 'unenrolled';
    if (fault === 'failed-fence') failed.fenced = false;
    if (fault === 'failed-revision') failed.revision = before.revision;
    if (fault === 'failed-backup') Reflect.set(failed.maintenanceEvidence, 'backup', null);
    if (fault === 'matching-backup')
      failed.lastVerifiedBackup = { ...backup, snapshotId: '0'.repeat(64) };
    if (fault === 'handoff-shape') rootReceipt.writerExclusion = 'unknown';
    if (fault === 'handoff-backup') rootReceipt.snapshotId = '0'.repeat(64);
    if (fault === 'recovery-schema') restored.schemaVersion = 3;
    if (fault === 'recovery-target') restored.enrollment.registryPath = '/foreign';
    if (fault === 'obligations') restored.protections = [];
    const terminal = {
      pid: 71,
      startTicks: '100',
      exitCode: 143,
      signal: 'SIGTERM',
      groupAbsent: true,
    };
    const pressure = {
      scope: 'pressure',
      ...terminal,
      instanceSha256: hash(instance),
      requestSha256: hash(request),
      allocation: 'ENOSPC',
      stage:
        fault === 'open-ack' || fault === 'open-ack-present' || fault.startsWith('inode')
          ? 'open'
          : 'write',
    };
    if (fault === 'receipt-pid') pressure.pid = 72;
    if (fault === 'receipt-request') pressure.requestSha256 = '0'.repeat(64);
    const filler = { device: 2, inode: 21, bytes: 1000, enospc: true, outsideContents: true };
    const baseActions = 'restore-service:entered\nrestore-service:completed\n';
    const backupActions =
      baseActions + 'assert-stopped:completed\nbackup-verify:completed\nrestore-service:entered\n';
    let owner = '',
      bridgeCount = 0;
    let selectedAcknowledge: ((signal: AbortSignal) => Promise<unknown>) | undefined;
    let acknowledged = false;
    const writer = {
      pid: 71,
      startTicks: '100',
      assertLive: () => Promise.resolve({ pid: 71, startTicks: '100' }),
      close: () => {
        calls.push('writer-close');
        return Promise.resolve(terminal);
      },
    };
    const bridge = (
      _installed: unknown,
      acknowledge: (signal: AbortSignal) => Promise<unknown>,
    ) => {
      const number = ++bridgeCount;
      if (number === 1) selectedAcknowledge = acknowledge;
      calls.push('bridge-' + String(number));
      if (number === 2 && fault === 'recovery-probe')
        return acknowledge(new AbortController().signal);
      return Promise.resolve({
        arm: () => {
          calls.push('arm');
        },
        receipt: () => {
          calls.push('pressure-receipt');
          return pressure;
        },
        close: () => {
          calls.push('bridge-close-' + String(number));
          return number === 1 && fault === 'bridge-close'
            ? Promise.reject(cleanupFailure)
            : Promise.resolve();
        },
      });
    };
    const ports = {
      createHash,
      join,
      type,
      prepareRegistryHostFixture: () => Promise.resolve({ installed }),
      prepareRegistryIndexReaders: () => Promise.resolve(),
      writeFile: () => Promise.resolve(),
      startRegistryPressureBridge: bridge,
      runRegistryPressureAcknowledgement: () => {
        acknowledged = true;
        return Promise.resolve(pressure);
      },
      startRegistryFixtureGuard: () =>
        Promise.resolve({
          waitMode: () => Promise.resolve(),
          close: () => {
            calls.push('guard-close');
            return fault === 'cleanup' || fault === 'both'
              ? Promise.reject(cleanupFailure)
              : Promise.resolve();
          },
        }),
      startRegistryPressureWriter: () => {
        calls.push('writer-start');
        return Promise.resolve(writer);
      },
      prepareRegistryPressureEpoch: () => {
        calls.push('epoch');
        return Promise.resolve({
          instance,
          writer: { pid: 71, startTicks: '100' },
          priorAcknowledgement: { state: 'absent' },
          priorInstanceSha256: '1'.repeat(64),
        });
      },
      fillRegistryFixtureInodes: () => {
        calls.push('inode-fill', 'fill');
        return Promise.resolve({
          device: 2,
          inode: 21,
          directorySize: 1000,
          files: 4,
          totalInodes: 8,
          availableBytes: 64 * 1024 ** 2,
          enospc: true,
          outsideContents: true,
          verify: () => {
            inodeVerifies++;
            calls.push('inode-verify-' + String(inodeVerifies));
            if (
              (fault === 'inode-before-recovery' && inodeVerifies === 1) ||
              (fault === 'inode-after-recovery' && inodeVerifies === 2)
            )
              return Promise.reject(inodeFailure);
            if (fault === 'inode-held' && inodeVerifies === 1) return verification;
            return Promise.resolve();
          },
        });
      },
      fillRegistryFixtureVolume: () => {
        calls.push('fill');
        return Promise.resolve(filler);
      },
      readRegistryPressureRecord: () =>
        Promise.resolve(
          owner === 'pressure-backup'
            ? fault === 'later-revocation' && acknowledged
              ? 'later authority request\n'
              : request
            : 'old request\n',
        ),
      respondRegistryFixture: () => ({
        response: {
          metadata: {
            uid: fault === 'deployment' ? 'foreign' : 'deployment',
            resourceVersion: '7',
          },
          spec: { replicas: 1 },
        },
        changed: null,
      }),
      RegistryDeletionPublication: { assert: (v: unknown) => v },
      parseRegistryCommandResponse: (v: unknown) => v,
      requireRegistryRecoveryReceipt: () => ({
        operationId: 'native-volume-backup',
        snapshotId: backup.snapshotId,
        stagedJournalPath: staged,
        registryPath: target,
        storageId: 'new',
      }),
      readRegistryHttpObservationOutput: () => ({
        state:
          (fault === 'publication-http' && owner === 'deletion-publish-protected') ||
          (fault === 'backup-http' && owner === 'pressure-backup') ||
          (fault === 'recovery-http' && owner === 'pressure-recover')
            ? 'invalid'
            : 'valid',
        observation: { pending: 0, events: [{ method: 'GET', path: 'manifest', status: 200 }] },
      }),
      observeRegistryPopulationOutput: () => ({ state: 'valid' }),
      describeRegistryGuardObservationFailure,
      readFile: (path: string) => {
        if (path.endsWith('/journal.json'))
          return Promise.resolve(
            path === staged + '/journal.json'
              ? fault === 'staged-bytes'
                ? Buffer.from('wrong snapshot')
                : snapshot
              : JSON.stringify(
                  owner === 'pressure-recover'
                    ? restored
                    : owner === 'pressure-backup'
                      ? failed
                      : before,
                ),
          );
        if (path === '/root/task8-fixture/actions.log')
          return Promise.resolve(
            owner === 'pressure-recover'
              ? (fault === 'recovery-history' ? 'X' + backupActions.slice(1) : backupActions) +
                  'backup-restore:completed\nserve-recovery:entered\n' +
                  (fault === 'recovery-serving' ? 'restore-service:entered\n' : '')
              : owner === 'pressure-backup'
                ? (fault === 'action-prefix' ? 'X' + backupActions.slice(1) : backupActions) +
                  (fault === 'action-completed' ? 'restore-service:completed\n' : '')
                : baseActions,
          );
        if (path === '/root/task8-fixture/kubernetes.json') return Promise.resolve('{}');
        if (
          path === '/root/task8-fixture/pressure-handoff.json' &&
          (fault === 'handoff-missing' || fault === 'handoff-unreadable')
        )
          return Promise.reject(
            Object.assign(new Error('required handoff unavailable'), {
              code: fault === 'handoff-missing' ? 'ENOENT' : 'EACCES',
            }),
          );
        if (path === '/root/task8-fixture/pressure-handoff.json')
          return Promise.resolve(
            JSON.stringify(rootReceipt) + (fault === 'handoff-size' ? ' '.repeat(4096) : ''),
          );
        if (path.endsWith('/link'))
          return Promise.resolve(
            (fault === 'old-root' && path.startsWith(old)) ||
              (fault === 'restored-root' && path.startsWith(target))
              ? 'foreign'
              : digest,
          );
        if (path.startsWith('/proc/')) {
          if (fault === 'writer-live') return Promise.resolve('live');
          return Promise.reject(
            Object.assign(new Error('absent'), {
              code: fault === 'writer-error' ? 'EACCES' : 'ENOENT',
            }),
          );
        }
        throw new Error('Unexpected modeled file ' + path);
      },
      lstat: (path: string) => {
        if (
          path.endsWith('.authority-readonly') &&
          (fault === 'open-ack' || fault === 'ack-error' || fault.startsWith('inode'))
        )
          return Promise.reject(
            Object.assign(new Error('ACK stat'), {
              code: fault === 'open-ack' || fault.startsWith('inode') ? 'ENOENT' : 'EACCES',
            }),
          );
        return Promise.resolve(
          path.endsWith('authority.lock')
            ? { dev: 3, ino: owner === 'pressure-recover' && fault === 'lock' ? 5 : 4 }
            : path.endsWith('task8-full-volume.fill')
              ? {
                  dev: 2,
                  ino: 21,
                  size:
                    fault === 'filler' ||
                    (fault === 'recovery-filler' && owner === 'pressure-recover')
                      ? 999
                      : 1000,
                  isFile: () => true,
                }
              : path.endsWith('.authority-readonly')
                ? {
                    dev: 2,
                    size: fault === 'ack-bytes' ? 1 : 0,
                    uid: 59001,
                    gid: 59001,
                    nlink: 1,
                    mode: 0o600,
                    isFile: () => true,
                  }
                : {
                    dev:
                      fault === 'mounts'
                        ? 2
                        : path === old
                          ? 2
                          : path === canonical
                            ? 3
                            : path === target
                              ? 4
                              : 5,
                    isDirectory: () => true,
                  },
        );
      },
      process: {
        kill: () => {
          if (fault === 'group-live') return;
          throw Object.assign(new Error('absent'), {
            code: fault === 'group-error' ? 'EPERM' : 'ESRCH',
          });
        },
      },
      console: {
        log: (line: string) => {
          if (fault === 'reporter' && line.includes('pressureFailure')) throw reporterFailure;
          output.push(line);
        },
      },
    };
    // Boundary: full actual controller body; native filesystem/process/authority effects are explicitly modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const invoke = new Function(
      ...Object.keys(ports),
      body + ';return proveRegistryPressureHost;',
    ) as (
      ...ports: unknown[]
    ) => (
      run: (mode: string) => Promise<{ code: number; stdout: string; stderr: string }>,
      allocation?: 'bytes' | 'inodes',
    ) => Promise<void>;
    const run = async (mode: string) => {
      owner = mode;
      calls.push(mode);
      if (mode === 'pressure-backup' && fault !== 'selected-missing') {
        if (selectedAcknowledge === undefined) throw new Error('Missing modeled selected callback');
        await selectedAcknowledge(new AbortController().signal);
      }
      if (
        mode === 'deletion-publish-protected' &&
        [
          'publication',
          'both',
          'reporter',
          'nested-cause',
          'shared-cause',
          'bounded-causes',
        ].includes(fault)
      )
        return Promise.reject(operationFailure);
      return Promise.resolve({
        code:
          mode === 'pressure-backup'
            ? fault === 'backup-owner'
              ? 0
              : 1
            : (fault === 'bootstrap' && mode === 'backup') ||
                (fault === 'recovery-owner' && mode === 'pressure-recover')
              ? 1
              : 0,
        stdout:
          mode === 'initialize'
            ? 'initialized'
            : mode === 'backup'
              ? 'verified-native-backup'
              : mode === 'index-reopen'
                ? 'population-writable-permitted'
                : mode === 'deletion-publish-protected'
                  ? JSON.stringify(publication)
                  : mode === 'deletion-protect'
                    ? 'index-explicitly-protected'
                    : mode === 'pressure-recover'
                      ? 'pressure-recovery-staged-fenced'
                      : '',
        stderr: '',
      });
    };
    const pending = invoke(...Object.values(ports))(
      run,
      fault.startsWith('inode') ? 'inodes' : fault === 'none' ? undefined : 'bytes',
    ).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    if (fault === 'inode-held') {
      await Bun.sleep(20);
      expect(calls).not.toContain('pressure-recover');
      expect(calls).toContain('inode-verify-1');
      if (releaseVerification === undefined)
        throw new Error('Missing held inode verification release');
      releaseVerification();
    }
    const refused = await pending;
    if (
      fault === 'none' ||
      fault === 'open-ack' ||
      fault === 'later-revocation' ||
      fault === 'inode' ||
      fault === 'inode-held'
    ) {
      expect(refused).toBeUndefined();
      expect(calls.indexOf('backup')).toBeLessThan(calls.indexOf('writer-start'));
      expect(calls.indexOf('guard-close')).toBeLessThan(calls.indexOf('writer-start'));
      expect(calls.indexOf('epoch')).toBeLessThan(calls.indexOf('fill'));
      expect(calls.indexOf('fill')).toBeLessThan(calls.indexOf('pressure-backup'));
      expect(calls.indexOf('bridge-close-1')).toBeLessThan(calls.indexOf('bridge-2'));
      expect(calls.indexOf('bridge-2')).toBeLessThan(calls.indexOf('pressure-recover'));
      expect(calls.filter((v) => v === 'arm')).toHaveLength(1);
      expect(calls.filter((v) => v === 'pressure-receipt')).toHaveLength(1);
      expect(output.join('')).toContain('owned-full-volume-no-ack');
      if (fault.startsWith('inode')) {
        expect(calls).toContain('inode-fill');
        expect(inodeVerifies).toBe(2);
        expect(calls.indexOf('inode-verify-1')).toBeLessThan(calls.indexOf('pressure-recover'));
        expect(calls.indexOf('inode-verify-2')).toBeGreaterThan(calls.indexOf('pressure-recover'));
      }
    } else if (fault === 'inode-before-recovery' || fault === 'inode-after-recovery') {
      expect(refused).toBe(inodeFailure);
      expect(inodeVerifies).toBe(fault === 'inode-before-recovery' ? 1 : 2);
      expect(calls.includes('pressure-recover')).toBe(fault === 'inode-after-recovery');
    } else if (fault === 'both') {
      expect(refused).toBeInstanceOf(AggregateError);
      expect((refused as AggregateError).errors).toContain(operationFailure);
      expect((refused as AggregateError).errors).toContain(cleanupFailure);
      expect(calls).not.toContain('writer-start');
    } else if (fault === 'cleanup') {
      expect(refused).toBeInstanceOf(AggregateError);
      expect((refused as AggregateError).errors).toEqual([cleanupFailure, cleanupFailure]);
      expect((refused as Error).cause).toBe(cleanupFailure);
      expect(calls).not.toContain('writer-start');
    } else if (['publication', 'nested-cause', 'shared-cause', 'bounded-causes'].includes(fault)) {
      expect(refused).toBe(operationFailure);
      expect(calls).not.toContain('writer-start');
      if (fault !== 'publication') {
        const diagnostic = JSON.parse(output.at(-1) ?? 'null') as {
          pressureFailure: { causes?: unknown[] };
        };
        if (fault === 'nested-cause')
          expect(diagnostic.pressureFailure.causes).toEqual([
            { category: 'unknown', location: { kind: 'absent' } },
            {
              category: 'unknown',
              location: { kind: 'frame', frame: { file: 'fixture-bundle', line: 17, column: 3 } },
            },
          ]);
        else
          expect(diagnostic.pressureFailure.causes).toHaveLength(fault === 'shared-cause' ? 1 : 16);
      }
    } else if (fault === 'reporter') {
      expect(refused).toBeInstanceOf(AggregateError);
      expect((refused as AggregateError).errors).toEqual([operationFailure, reporterFailure]);
      expect((refused as Error).cause).toBe(operationFailure);
    } else {
      expect(refused).toBeInstanceOf(Error);
      expect(refused).not.toBeInstanceOf(TypeError);
      expect(output.join('')).not.toContain('owned-full-volume-no-ack');
      if (
        [
          'bootstrap',
          'publication-http',
          'publication-kind',
          'protection',
          'targets',
          'mounts',
        ].includes(fault)
      )
        expect(calls).not.toContain('writer-start');
      else if (fault === 'deployment') expect(calls).not.toContain('arm');
      else if (
        ![
          'recovery-probe',
          'recovery-owner',
          'recovery-http',
          'recovery-schema',
          'recovery-target',
          'obligations',
          'lock',
          'staged-bytes',
          'old-root',
          'restored-root',
          'recovery-filler',
          'recovery-history',
          'recovery-serving',
        ].includes(fault)
      )
        expect(calls).not.toContain('pressure-recover');
    }
    expect(calls).toContain('bridge-close-1');
    expect(output.join('')).not.toContain('private');
    expect(output.join('')).not.toContain(instance.trim());
    expect(output.join('')).not.toContain(request.trim());
  });
