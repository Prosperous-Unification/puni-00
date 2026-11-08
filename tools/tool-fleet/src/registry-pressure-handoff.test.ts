import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

for (const fault of [
  'none',
  'root',
  'mode',
  'action',
  'operation',
  'maintenance',
  'phase',
  'kind',
  'fence',
  'evidence',
  'backup',
  'last-backup',
  'census',
  'storage',
  'stop',
  'stop-receipt',
  'report',
] as const)
  test('selected pressure pre-serving refusal ' + fault, async () => {
    const source = await readFile(
      new URL('./registry-pressure-handoff.fixture.ts', import.meta.url),
      'utf8',
    );
    const start = source.indexOf('export async function retainRegistryPressureFence(');
    if (start < 0) throw new Error('Missing actual fixed pressure handoff');
    const body =
      new Bun.Transpiler({ loader: 'ts' }).transformSync(
        source.slice(start).replace('export async function', 'async function'),
      ) + '\nreturn retainRegistryPressureFence;';
    const events: string[] = [];
    const stopFailure = new Error('Real stop dependency refused');
    const reportFailure = new Error('Fixed receipt refused');
    const backup = {
      snapshotId: 'a'.repeat(64),
      registryId: 'registry',
      storageId: 'store',
      registryPath: '/registry',
      journalPath: '/journal',
      censusSha256: 'b'.repeat(64),
      journalSha256: 'c'.repeat(64),
    };
    const journal = {
      fenced: fault !== 'fence',
      enrollment: {
        registryId: 'registry',
        storageId: fault === 'storage' ? 'other' : 'store',
        registryPath: '/registry',
      },
      maintenance:
        fault === 'maintenance'
          ? null
          : {
              operationId: 'native-volume-backup',
              kind: fault === 'kind' ? 'retirement' : 'backup',
              phase: fault === 'phase' ? 'backed-up' : 'verified',
            },
      maintenanceEvidence:
        fault === 'evidence'
          ? null
          : {
              operationId: 'native-volume-backup',
              backup: fault === 'backup' ? null : backup,
              backupCensusSha256: fault === 'census' ? 'd'.repeat(64) : backup.censusSha256,
            },
      lastVerifiedBackup:
        fault === 'last-backup' ? { ...backup, snapshotId: 'e'.repeat(64) } : backup,
    };
    const input = {
      installed: { journalPath: '/journal' },
      journal,
      request: {
        action: fault === 'action' ? 'collect' : 'restore-service',
        operationId: fault === 'operation' ? 'native-host-backup' : 'native-volume-backup',
        owner: 'operator',
        token: 'selected',
      },
      descriptor: 3,
      signal: new AbortController().signal,
      ready: () => Promise.resolve(),
    };
    let receipt: unknown;
    // Boundary: actual fixed post-admission fixture wrapper; root credentials/action effects/receipt filesystem are modeled.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const compile = new Function(
      'process',
      'readFile',
      'writeFile',
      'executeRegistryHostAction',
      body,
    ) as (...ports: unknown[]) => (input: unknown) => Promise<unknown>;
    const invoke = compile(
      { getuid: () => (fault === 'root' ? 59001 : 0) },
      () =>
        Promise.resolve(
          fault === 'mode'
            ? 'other'
            : '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-volume-full\0',
        ),
      (path: string, serialized: string, options: unknown) => {
        events.push('report');
        expect(path).toBe('/root/task8-fixture/pressure-handoff.json');
        expect(options).toEqual({ mode: 0o600, flag: 'wx' });
        receipt = JSON.parse(serialized);
        return fault === 'report' ? Promise.reject(reportFailure) : Promise.resolve();
      },
      (selected: typeof input) => {
        events.push('stop');
        expect(selected).toEqual({
          ...input,
          request: { ...input.request, action: 'assert-stopped' },
        });
        return fault === 'stop'
          ? Promise.reject(stopFailure)
          : Promise.resolve(fault === 'stop-receipt' ? 'unknown' : 'verified');
      },
    );
    const refusal = await invoke(input).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(refusal).toBeInstanceOf(Error);
    if (fault === 'none') {
      expect(refusal).toMatchObject({ message: 'Controlled pressure handoff before serving' });
      expect(events).toEqual(['stop', 'report']);
      expect(receipt).toEqual({
        scope: 'controlled-pre-serving-after-verified-backup',
        operationId: 'native-volume-backup',
        snapshotId: backup.snapshotId,
        journalSha256: backup.journalSha256,
        writerExclusion: 'verified',
      });
    } else if (fault === 'stop') {
      expect(refusal).toBe(stopFailure);
      expect(events).toEqual(['stop']);
    } else if (fault === 'stop-receipt') {
      expect(events).toEqual(['stop']);
      expect(refusal).toMatchObject({
        message: 'Pressure handoff writer exclusion is unconfirmed',
      });
    } else if (fault === 'report') {
      expect(refusal).toBeInstanceOf(AggregateError);
      if (!(refusal instanceof AggregateError)) throw refusal;
      expect(refusal.errors[0]).toMatchObject({
        message: 'Controlled pressure handoff before serving',
      });
      expect(refusal.errors[1]).toBe(reportFailure);
      expect(refusal.cause).toBe(refusal.errors[0]);
    } else expect(events).toEqual([]);
  });
