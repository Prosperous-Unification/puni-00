import { createHash } from 'node:crypto';
import { mkdir, open, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { dlopen } from 'bun:ffi';
import { expect, test } from 'bun:test';

import { prepareRegistryBackupAttempt } from './registry-backup-attempt';
import {
  reconcileRegistryBackupLocks,
  type RegistryBackupLockVersion,
  verifyRegistryBackupRepository,
} from './registry-backup-locks';
import { modelRegistryBackupEffects } from './registry-backup-reservation.fixture';
import { createRegistryBackupStore } from './registry-backup-store';
import { scopeMaintenanceReaper } from './registry-maintenance-reaper.fixture';

scopeMaintenanceReaper();

const binary = process.env['PUNI_TEST_RESTIC_BINARY'];
const hashBytes = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function requireRefusal(pending: Promise<unknown>, fragment: string) {
  let refused = false;
  try {
    await pending;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    expect(cause.message).toContain(fragment);
    refused = true;
  }
  expect(refused).toBe(true);
}

test.skipIf(binary === undefined)(
  'actual encrypted foreign lock is preserved; current repository and corrupt ciphertext refuse',
  async () => {
    if (binary === undefined) throw new Error('Missing requested native restic');
    expect(hashBytes(await readFile(binary))).toBe(
      '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
    );
    const directory = await scratchAsync('registry-backup-encrypted-lock-');
    const journal = join(directory, 'journal');
    const registry = join(directory, 'registry');
    const repository = join(directory, 'repository');
    const replacement = join(directory, 'replacement');
    await mkdir(journal);
    await mkdir(registry);
    await writeFile(join(journal, 'journal.json'), '{"revision":7}');
    const environment = {
      RESTIC_REPOSITORY: repository,
      RESTIC_PASSWORD: 'owned-disposable-fixture',
    };
    const runSetup = async (args: string[], selected = environment) => {
      const child = Bun.spawn([binary, '--no-cache', ...args], {
        env: { PATH: '/usr/bin:/bin', ...selected },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (code !== 0) throw new Error(`Owned setup child failed (${String(code)}):${stderr}`);
      return stdout;
    };
    let foreign: ReturnType<typeof Bun.spawn> | undefined;
    let foreignStderr: Promise<string> | undefined;
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    const native = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
    try {
      await runSetup(['init']);
      await runSetup(['init'], { ...environment, RESTIC_REPOSITORY: replacement });
      lock = await open(join(journal, 'authority.lock'), 'wx', 0o600);
      expect(native.symbols.flock(lock.fd, 2 | 4)).toBe(0);
      const authority = { authorityDescriptor: lock.fd };
      const configuration = {
        effects: modelRegistryBackupEffects(),
        signal: new AbortController().signal,
        binary,
        binarySha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
        environment,
        admit: () => Promise.resolve(),
      };
      const store = createRegistryBackupStore(configuration);
      const repositoryId = await store.inspectRepository(journal, authority);
      const attempt = prepareRegistryBackupAttempt({
        operationId: 'local-lock-refusal',
        token: '11111111-1111-4111-8111-111111111111',
        action: 'backup-snapshot',
        configurationSha256: 'a'.repeat(64),
        registryId: 'local-proof',
        journalRevision: 7,
        now: new Date().toISOString(),
        guardian: {
          pid: 42,
          startTicks: '100',
          pidNamespace: 'pid:[4026531836]',
          machineId: 'b'.repeat(32),
          bootId: '22222222-2222-4222-8222-222222222222',
        },
      });
      const readLocks = async (): Promise<RegistryBackupLockVersion[]> => {
        const names = await readdir(join(repository, 'locks'));
        return await Promise.all(
          names.map(async (name) => {
            if (!/^[a-f0-9]{64}$/.test(name)) throw new Error('Unexpected owned raw lock name');
            const bytes = await readFile(join(repository, 'locks', name));
            return {
              key: `locks/${name}`,
              versionId: 'local-filesystem-current',
              kind: 'object' as const,
              sha256: hashBytes(bytes),
              bytes: bytes.byteLength,
              visible: true,
            };
          }),
        );
      };
      const held = Bun.spawn(
        [binary, '--no-cache', 'backup', '--stdin', '--stdin-filename', 'held-input'],
        {
          env: { PATH: '/usr/bin:/bin', ...environment },
          stdin: 'pipe',
          stdout: 'ignore',
          stderr: 'pipe',
        },
      );
      foreign = held;
      foreignStderr = new Response(held.stderr).text();
      const deadline = performance.now() + 5000;
      let published = false;
      while (performance.now() < deadline && foreign.exitCode === null) {
        const names = await readdir(join(repository, 'locks'));
        if (names.length === 1 && /^[a-f0-9]{64}$/.test(names[0] ?? '')) {
          published = true;
          break;
        }
        await Bun.sleep(25);
      }
      if (!published)
        throw new Error(
          'Owned fixture did not publish exactly one complete lock before readiness deadline',
        );
      let versions = await readLocks();
      expect(versions).toHaveLength(1);
      expect(foreign.exitCode).toBeNull();
      const selected = versions.at(0);
      if (selected === undefined) throw new Error('Missing owned foreign lock');
      const encrypted = await readFile(join(repository, selected.key));
      const clear: unknown = JSON.parse(
        await store.inspectLock(selected.key.slice(6), journal, authority),
      );
      expect(clear).not.toMatchObject({ hostname: attempt.utsHostname });
      expect(clear).toMatchObject({ pid: foreign.pid });
      let inspected = 0;
      let stopped = 0;
      let removed = 0;
      const ports = {
        census: readLocks,
        inspect: async (observed: RegistryBackupLockVersion) => {
          inspected++;
          return store.inspectLock(observed.key.slice(6), journal, authority);
        },
        proveStopped: () => {
          stopped++;
          return Promise.reject(
            new Error('Origin exclusion must not be reached for foreign owner'),
          );
        },
        removeVersion: () => {
          removed++;
          return Promise.reject(new Error('No local deletion authorized'));
        },
      };
      await requireRefusal(
        reconcileRegistryBackupLocks([attempt], attempt.configurationSha256, ports),
        'Visible backup lock has no exact durable root owner',
      );
      expect(inspected).toBe(1);
      expect(stopped).toBe(0);
      expect(removed).toBe(0);
      expect(await readLocks()).toEqual(versions);
      expect(await readFile(join(repository, selected.key))).toEqual(encrypted);
      let identityInspections = 0;
      await requireRefusal(
        verifyRegistryBackupRepository(ports, repositoryId, async () => {
          identityInspections++;
          return store.inspectRepository(journal, authority);
        }),
        'Visible backup locks require exact interrupted-attempt reconciliation',
      );
      expect(identityInspections).toBe(0);
      await verifyRegistryBackupRepository(
        ports,
        repositoryId,
        () => store.inspectRepository(journal, authority),
        'reconciliation',
      );
      expect(await readLocks()).toEqual(versions);
      const replacementStore = createRegistryBackupStore({
        ...configuration,
        repositoryId,
        environment: { ...environment, RESTIC_REPOSITORY: replacement },
      });
      expect(await replacementStore.inspectRepository(journal, authority)).not.toBe(repositoryId);
      await requireRefusal(
        replacementStore.prepare(
          {
            operationId: 'replacement-refusal',
            registryId: 'local-proof',
            storageId: 'local',
            registryPath: registry,
            journalPath: journal,
            maximumBytes: 1024 ** 2,
            journalMaximumBytes: 1024 ** 2,
          },
          authority,
        ),
        'Backup repository differs from immutable configured identity',
      );
      if (typeof foreign.stdin !== 'object') throw new Error('Missing owned foreign input stream');
      await foreign.stdin.end();
      const stoppedForeign = await Promise.race([
        foreign.exited,
        Bun.sleep(5000).then(() => {
          throw new Error('Owned foreign lock process did not stop after input close');
        }),
      ]);
      console.log(
        JSON.stringify({ foreignExit: stoppedForeign, foreignStderr: await foreignStderr }),
      );
      expect(stoppedForeign).toBe(3);
      expect(await foreignStderr).toBe(
        'error: failed to save /held-input: read held-input: no data read\nWarning: at least one source file could not be read\n',
      );
      expect(await readLocks()).toEqual([]);
      foreign = undefined;
      const corruption = Buffer.from('owned deliberately corrupt encrypted lock');
      const corruptId = hashBytes(corruption);
      await writeFile(join(repository, 'locks', corruptId), corruption);
      versions = await readLocks();
      expect(versions).toHaveLength(1);
      await requireRefusal(
        reconcileRegistryBackupLocks([attempt], attempt.configurationSha256, ports),
        'Fixed maintenance child failed (exit 1)',
      );
      expect(removed).toBe(0);
      expect(stopped).toBe(0);
      expect(await readFile(join(repository, 'locks', corruptId))).toEqual(corruption);
      console.log(
        JSON.stringify({
          scope:
            'actual native local encrypted lock inspection and preservation, immutable repository mismatch and corrupt ciphertext; modeled provider current version/origin ports and attempt root metadata; not UTS/root/provider history or recovery success; foreign backup holds empty input then terminal3 no-data-read cleanup, not successful backup',
          fixture: directory,
          checks:
            'foreign owner, visible effect lock, reconciliation read-only identity, changed repository, decrypt failure',
          foreignExit: stoppedForeign,
          removed,
          stopped,
        }),
      );
    } finally {
      if (foreign?.exitCode === null) {
        foreign.kill('SIGINT');
        const killer = setTimeout(() => foreign?.kill('SIGKILL'), 5000);
        try {
          await foreign.exited;
        } finally {
          clearTimeout(killer);
        }
      }
      if (lock !== undefined) await lock.close();
      native.close();
      await rm(directory, { recursive: true });
      console.log(
        JSON.stringify({
          fixture: directory,
          cleanup: 'owned children terminal and authority closed before removal',
        }),
      );
    }
  },
  30000,
);
