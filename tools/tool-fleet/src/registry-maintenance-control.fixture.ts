import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runRegistryMaintenance } from './registry-journal';
import { superviseRegistryMaintenance } from './registry-maintenance-control';
import { awaitMaintenanceChild, installMaintenanceReaper } from './registry-maintenance-process';

/** Owned native control-protocol fixture; no installed helper, privileged service or live endpoint is used. */
async function main() {
  const mode = process.argv.at(2);
  const directory = process.argv.at(3);
  if (
    (mode !== 'owner' && mode !== 'helper') ||
    !directory?.startsWith(join(tmpdir(), 'wbs-test-'))
  )
    throw new Error('Expected exact owned scratch fixture');
  const GiB = 1024 ** 3;
  if (mode === 'helper') {
    installMaintenanceReaper();
    await superviseRegistryMaintenance({
      directory,
      uid: process.getuid?.(),
      descriptor: 3,
      input: Bun.stdin.stream(),
      deadlineMs: 3000,
      execute: async (_request, signal) => {
        const child = Bun.spawn(
          ['/bin/sh', '-c', 'sleep 5; touch "$1"', 'owned', join(directory, 'escaped')],
          { stdio: ['ignore', 'ignore', 'ignore', 3], detached: true },
        );
        await writeFile(join(directory, 'started'), 'started');
        try {
          await awaitMaintenanceChild(child, signal);
        } catch (cause) {
          if (cause === signal.reason) {
            // Keep exclusion observable briefly after EOF while the privileged owner finalizes its already-reaped effect.
            await Bun.sleep(300);
            await writeFile(join(directory, 'reaped'), 'reaped');
          }
          throw cause;
        }
        return { done: true };
      },
    });
  } else {
    await runRegistryMaintenance(
      directory,
      { operationId: 'control', owner: 'operator', kind: 'backup', recover: false },
      {
        measureJournal: () =>
          Promise.resolve({
            usableBytes: GiB,
            allocationUnitBytes: 4096,
            usedBytes: 1000,
            totalInodes: 10000,
            usedInodes: 10,
          }),
        measureRegistry: () =>
          Promise.resolve({
            maximumBytes: 50 * GiB,
            usableBytes: 50 * GiB,
            usedBytes: GiB,
            totalInodes: 10000,
            usedInodes: 10,
            rootFreeBytes: 30 * GiB,
          }),
      },
      async (session) => {
        const owned = session.read().maintenance;
        if (owned === null) throw new Error('Missing fixture operation');
        const child = Bun.spawn([process.execPath, import.meta.path, 'helper', directory], {
          stdio: ['pipe', 'pipe', 'pipe', session.authorityDescriptor],
        });
        await child.stdin.write(
          JSON.stringify({
            action: 'inspect',
            operationId: owned.operationId,
            owner: owned.owner,
            token: owned.token,
          }) + '\n',
        );
        await writeFile(join(directory, 'helper-pid'), String(child.pid));
        const code = await child.exited;
        await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
        await child.stdin.end();
        throw new Error(`Fixture owner terminated after helper exit ${String(code)}`);
      },
    );
  }
}
if (import.meta.main) await main();
