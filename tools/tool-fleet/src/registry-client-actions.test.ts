import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { requireRegistryClientRecovery } from './registry-client-lineage';
import { createRegistryClientLineageFixture } from './registry-client-lineage.fixture';
import { requireRejection } from './registry-rejection.fixture';

for (const fault of ['none', 'mount', 'distribution', 'recheck-mount'] as const) {
  test(
    'actual root client dispatch compares fresh prepared recovery identity: ' + fault,
    async () => {
      const source = await readFile(
        new URL('./registry-maintenance-actions.ts', import.meta.url),
        'utf8',
      );
      const start = source.indexOf("    case 'verify-images':");
      const end = source.indexOf("    case 'backup-reconcile':", start);
      if (start < 0 || end < 0) throw new Error('Missing actual root client action');
      const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
        'async function prove() { switch(request.action) {' + source.slice(start, end) + '} }',
      );
      const proof = createRegistryClientLineageFixture();
      const calls: string[] = [];
      let mounts = 0;
      // Execute the actual dispatcher block; privileged controller/mount/worker effects are modeled.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const invoke = new Function(
        'request',
        'installed',
        'journal',
        'input',
        'api',
        'stopped',
        'requireRegistryClientRecovery',
        'observeRegistryVolume',
        'mount',
        'runRegistryClientWorker',
        body + '; return prove();',
      ) as (...ports: unknown[]) => Promise<string>;
      const pending = invoke(
        { action: 'verify-recovery-images' },
        proof.installed,
        proof.journal,
        {},
        {},
        () => {
          calls.push('stopped');
          return Promise.resolve();
        },
        requireRegistryClientRecovery,
        () => {
          calls.push('volume');
          return Promise.resolve();
        },
        () => {
          calls.push('mount');
          mounts++;
          return Promise.resolve({
            mountIdentity:
              fault === 'mount' || (fault === 'recheck-mount' && mounts === 2)
                ? 'changed'
                : proof.prepared.mountIdentity,
            distributionDigest:
              fault === 'distribution'
                ? 'sha256:' + 'b'.repeat(64)
                : proof.prepared.distributionDigest,
          });
        },
        async (worker: { beforeLaunch: () => Promise<void> }) => {
          calls.push('worker');
          await worker.beforeLaunch();
          return 'terminal root completion';
        },
      );
      if (fault === 'none') {
        expect(await pending).toBe('terminal root completion');
        expect(calls).toEqual([
          'stopped',
          'volume',
          'mount',
          'worker',
          'stopped',
          'volume',
          'mount',
        ]);
      } else {
        const refused = await requireRejection(pending);
        expect(refused.throwCause).toThrow('prepared recovery identity');
        expect(calls).toEqual(
          fault === 'recheck-mount'
            ? ['stopped', 'volume', 'mount', 'worker', 'stopped', 'volume', 'mount']
            : ['stopped', 'volume', 'mount'],
        );
      }
    },
  );
}
