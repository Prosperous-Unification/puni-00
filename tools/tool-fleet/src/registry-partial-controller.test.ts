import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

for (const mode of ['tag-recovery', 'gc-kill'] as const)
  for (const fault of [
    'none',
    'census-history',
    'recovery-history',
    'census-schema',
    'recovery-schema',
    'census-success',
    'marker-absent',
    'marker-duplicate',
    'api-contact',
    'census-unfenced',
    'census-backup',
    'census-gc',
    'recovery-failed',
    'recovery-http',
    'handoff',
    'obligations',
    'lock',
    'staged-bytes',
    'old-store',
    'old-tag',
    'restore-service',
    'target',
  ] as const) {
    if (
      mode === 'gc-kill'
        ? !['none', 'old-store', 'old-tag', 'restore-service'].includes(fault)
        : fault === 'old-tag'
    )
      continue;
    test(`actual partial recovery controller ${mode} ${fault}`, async () => {
      const source = await Bun.file(
        new URL('./registry-maintenance-deletion.native.ts', import.meta.url),
      ).text();
      const start = source.indexOf("    if (mode === 'tag-recovery' || mode === 'restore-kill'");
      const end = source.indexOf(
        "    console.log(\n      JSON.stringify({\n        proof: 'owned-deletion-failure'",
        start,
      );
      const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
        'async function prove() {' + source.slice(start, end) + '}',
      );
      const bytes = Buffer.from('matching offline snapshot journal');
      const backup = {
        snapshotId: 'snapshot',
        journalSha256: createHash('sha256').update(bytes).digest('hex'),
      };
      const protections = [{ roots: ['protected'] }],
        bundles = [{ original: true }];
      const journal = {
        schemaVersion: 4,
        revision: 10,
        fenced: true,
        protections,
        bundles,
        enrollment: {},
        consumers: ['source'],
        environments: [],
        deployments: [],
        maintenance: { phase: 'failed', operationId: 'native-host-retire' },
        maintenanceEvidence: {
          operationId: 'native-host-retire',
          backup,
          deletions: [{ state: 'pending' }],
        },
      };
      const census = structuredClone(journal);
      if (fault === 'census-schema') census.schemaVersion = 3;
      if (fault === 'census-unfenced') census.fenced = false;
      if (fault === 'census-backup') census.maintenanceEvidence.backup.snapshotId = 'other';
      const restored = {
        ...structuredClone(journal),
        revision: 20,
        enrollment: { ...journal.enrollment, storageId: 'new', registryPath: '/new' },
        maintenance: {
          phase: fault === 'handoff' ? 'completed' : 'restored',
          operationId: 'native-host-retire',
        },
      };
      if (fault === 'recovery-schema') restored.schemaVersion = 3;
      if (fault === 'obligations') restored.protections = [];
      if (fault === 'target') restored.enrollment.registryPath = '/foreign';
      const installed = {
        journalPath: '/canonical',
        ordinary: { path: '/old' },
        recovery: {
          state: 'enrolled',
          path: '/new',
          storageId: 'new',
          stagedJournalPath: '/staged',
        },
      };
      const calls: string[] = [],
        records: string[] = [];
      let owner = '',
        lockReads = 0;
      // Boundary: this is the exact owned controller block with fixed modeled effects, not external code.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const invoke = new Function(
        'mode',
        'installed',
        'journal',
        'evidence',
        'expired',
        'originals',
        'actionsBefore',
        'allActions',
        'run',
        'readFile',
        'writeFile',
        'lstat',
        'join',
        'createHash',
        'parseRegistryCommandResponse',
        'requireRegistryRecoveryReceipt',
        'readRegistryHttpObservationOutput',
        'observeRegistryPopulationOutput',
        'manifestPath',
        'absent',
        'console',
        `let stage=''; ${body}; return prove();`,
      ) as (...arguments_: unknown[]) => Promise<void>;
      const pending = invoke(
        mode,
        installed,
        journal,
        journal.maintenanceEvidence,
        { repository: 'expired', root: 'expired-digest' },
        JSON.stringify(bundles),
        'restore-service:entered\nrestore-service:completed\n',
        'restore-service:entered\nrestore-service:completed\n' +
          (mode === 'gc-kill' ? 'collect:entered\n' : ''),
        (command: string) => {
          owner = command;
          calls.push(command);
          return Promise.resolve(
            command === 'deletion-census'
              ? {
                  code: fault === 'census-success' ? 0 : 1,
                  stdout: '',
                  stderr:
                    fault === 'marker-absent'
                      ? ''
                      : 'task8-partial-census:current-tag-without-revision\n'.repeat(
                          fault === 'marker-duplicate' ? 2 : 1,
                        ),
                }
              : {
                  code: fault === 'recovery-failed' ? 1 : 0,
                  stdout: 'partial-recovery-staged-fenced\n',
                  stderr: 'recovery-http',
                },
          );
        },
        (path: string) =>
          Promise.resolve(
            (() => {
              if (path === '/canonical/journal.json')
                return JSON.stringify(owner === 'deletion-census' ? census : restored);
              if (path === '/root/task8-fixture/actions.log')
                return (
                  (fault === 'census-history'
                    ? 'changed\n'
                    : fault === 'recovery-history' && owner !== 'deletion-census'
                      ? 'changed\nrestore-service:entered\nrestore-service:completed\n'
                      : 'restore-service:entered\nrestore-service:completed\n') +
                  (owner === 'deletion-census'
                    ? fault === 'census-gc'
                      ? 'collect:entered\n'
                      : 'serve-readonly:entered\n'
                    : (mode === 'gc-kill' ? 'collect:entered\n' : 'serve-readonly:entered\n') +
                      'backup-restore:completed\nserve-recovery:entered\n' +
                      (fault === 'restore-service' ? 'restore-service:entered\n' : ''))
                );
              if (path === '/staged/journal.json')
                return fault === 'staged-bytes' ? Buffer.from('wrong') : bytes;
              if (path.endsWith('/tags/expired/current/link'))
                return fault === 'old-store' ? 'changed' : 'expired-digest';
              if (path === '/new/expired-revision') return 'expired-digest';
              throw new Error('Unexpected read ' + path);
            })(),
          ),
        (_path: string, _bytes: string) => {
          calls.push('clock');
          return Promise.resolve();
        },
        () => Promise.resolve({ ino: ++lockReads === 1 || fault !== 'lock' ? 7 : 8, dev: 2 }),
        join,
        createHash,
        (input: unknown) => input,
        () => ({ registryPath: '/new', storageId: 'new', stagedJournalPath: '/staged' }),
        (stderr: string) => ({
          state: fault === 'recovery-http' && stderr === 'recovery-http' ? 'invalid' : 'valid',
          observation: {
            pending: 0,
            events:
              owner === 'deletion-census'
                ? fault === 'api-contact'
                  ? [{ method: 'GET' }]
                  : []
                : [{ method: 'GET', path: 'manifest', status: 200 }],
          },
        }),
        () => ({ state: 'fixed' }),
        (_repository: string, _digest: string) => '/old/expired-revision',
        (path: string) =>
          Promise.resolve(
            fault !== 'old-store' && !(fault === 'old-tag' && path.endsWith('/current/link')),
          ),
        { log: (line: string) => records.push(line) },
      );
      const rejected = await pending.then(
        () => undefined,
        (cause: unknown) => cause,
      );
      if (fault === 'none') {
        expect(rejected).toBeUndefined();
        expect(calls).toEqual(
          mode === 'gc-kill'
            ? ['clock', 'deletion-recover']
            : ['clock', 'deletion-census', 'clock', 'deletion-recover'],
        );
        expect(records.some((line) => line.includes('stagedFencedHandoff'))).toBe(true);
      } else {
        const expected =
          fault === 'census-history'
            ? 'Partial census action history changed'
            : fault === 'recovery-history'
              ? 'Partial recovery action history changed'
              : fault === 'recovery-schema'
                ? 'Partial recovery lost maintenance schema'
                : ['census-success', 'marker-absent', 'marker-duplicate', 'api-contact'].includes(
                      fault,
                    )
                  ? 'Partial census lacks exact failed pre-API refusal'
                  : ['census-schema', 'census-unfenced', 'census-backup', 'census-gc'].includes(
                        fault,
                      )
                    ? 'Partial census changed failed retirement lineage'
                    : ['recovery-failed', 'recovery-http'].includes(fault)
                      ? 'Partial recovery lacks completed verified owner'
                      : ['handoff', 'obligations', 'lock', 'target'].includes(fault)
                        ? 'Partial recovery changed current obligations or canonical authority'
                        : fault === 'staged-bytes'
                          ? 'Partial recovery staged journal differs from verified backup'
                          : fault === 'old-store' || fault === 'old-tag'
                            ? 'Partial recovery did not preserve old damage and restore matching revision'
                            : 'Partial recovery did not stop at verified fenced handoff';
        expect(rejected).toBeInstanceOf(Error);
        expect((rejected as Error).message).toBe(expected);
        expect(records.some((line) => line.includes('stagedFencedHandoff'))).toBe(false);
      }
    });
  }
