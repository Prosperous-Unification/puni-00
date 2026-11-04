import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { createWritePermit } from './registry-capacity';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import { executeRegistryCommand } from './registry-journal';
import { awaitMaintenanceChild } from './registry-maintenance-process';
import { scopeMaintenanceReaper } from './registry-maintenance-reaper.fixture';
import { corruptRegistryPermit, registryPermitFaults } from './registry-permit-faults.fixture';
import { requireRejection } from './registry-rejection.fixture';
scopeMaintenanceReaper();
const GiB = 1024 ** 3;
const capacity = {
  maximumBytes: 50 * GiB,
  usableBytes: 50 * GiB,
  usedBytes: GiB,
  totalInodes: 100000,
  usedInodes: 1000,
  rootFreeBytes: 30 * GiB,
};
const measurement = {
  measureJournal: () =>
    invokeRegistryCallback(() => ({
      usableBytes: GiB,
      allocationUnitBytes: 4096,
      usedBytes: 1000,
      totalInodes: 100000,
      usedInodes: 10,
    })),
  measureRegistry: () => invokeRegistryCallback(() => capacity),
};
const clock = async () => Number((await readFile('/proc/uptime', 'utf8')).split(' ')[0]);
interface Fixture {
  journal: string;
  permission: string;
  commit: () => Promise<void>;
  revoke: () => Promise<void>;
  sampledChecksum: () => Promise<string>;
}
/** Actual extracted production guard and authority reserve/fsync/permit interleaving. Only capacity and metadata UID/GID are modeled; fixed checksum barriers pause an actual read, never substitute its bytes. */
async function guardDecision(input: {
  pauses: number;
  pauseAt?: 'before' | 'after';
  checksumFailure?: boolean;
  before?: (fixture: Fixture) => Promise<void>;
  cross?: (fixture: Fixture, position: number) => Promise<void>;
}) {
  const directory = await mkdtemp(join(tmpdir(), 'task8-permit-coherence-'));
  let terminal:
    | Promise<
        | {
            state: 'passed' | 'refused' | 'aborted';
          }
        | {
            state: 'failed';
            cause: unknown;
          }
      >
    | undefined;
  let outputs: Promise<string[]> | undefined;
  let settled = false;
  const controller = new AbortController();
  const abort = new Error('Owned permit test cancellation');
  let deadline: ReturnType<typeof setTimeout> | undefined;
  return completeRegistryFixture(async () => {
    const contents = join(directory, 'contents');
    const bin = join(directory, 'bin');
    await mkdir(contents, { mode: 0o700 });
    await mkdir(bin, { mode: 0o700 });
    const journal = join(contents, 'journal.json');
    const permission = join(contents, 'writable.permit');
    await executeRegistryCommand(
      contents,
      {
        command: 'initialize',
        enrollment: {
          registryId: 'coherence-fixture',
          storageId: 'modeled-bounded-volume',
          owners: ['publisher'],
          registryPath: '/registry',
          rootPath: '/',
          maximumBytes: 50 * GiB,
          journalMaximumBytes: GiB,
        },
      },
      measurement,
    );
    const permit = createWritePermit(contents, () => invokeRegistryCallback(() => capacity));
    const original = await readFile(journal, 'utf8');
    await permit.prepare(original, true);
    await permit.publish(original);
    let revision = 0;
    const fixture: Fixture = {
      journal,
      permission,
      revoke: () => permit.revoke(),
      sampledChecksum: async () => {
        const count = await readFile(join(directory, 'count'), 'utf8');
        if (!/^[1-4]$/.test(count)) throw new Error('Unexpected checksum observation count');
        const checksum = (await readFile(join(directory, 'checksum-' + count), 'utf8'))
          .split(' ')
          .at(0);
        if (checksum === undefined || !/^[a-f0-9]{64}$/.test(checksum))
          throw new Error('Malformed actual checksum observation');
        return checksum;
      },
      commit: async () => {
        const position = revision + 1;
        const digest = 'sha256:' + String(position).repeat(64);
        const common = {
          expectedRevision: revision,
          owner: 'publisher',
          operationId: 'coherence-' + String(position),
          roots: [digest],
          references: [{ repository: 'owned/fixture', digest }],
        };
        const command =
          position === 1
            ? {
                command: 'reserve-publication' as const,
                ...common,
                product: 'fixture',
                envelope: { bytes: 1024, inodes: 10 },
              }
            : { command: 'acquire-protection' as const, ...common, reason: 'fixture-consumer' };
        const committed = await executeRegistryCommand(contents, command, {
          ...measurement,
          permit,
        });
        revision = committed.state.revision;
        if (revision !== position || !(await permit.isFresh()))
          throw new Error('Actual authority did not publish current permission');
      },
    };
    await input.before?.(fixture);
    const source = await readFile(
      new URL('../../../infra/platform/registry/production/startup.sh', import.meta.url),
      'utf8',
    );
    const first = source.indexOf('permits_writes() {');
    const last = source.indexOf('\numask 077', first);
    if (first < 0 || last < 0) throw new Error('Production permission function missing');
    const script = join(directory, 'guard.sh');
    await writeFile(
      script,
      '#!/bin/sh\nset -eu\njournal=$1\n' +
        source.slice(first, last) +
        '\nif permits_writes; then exit 0; else exit 1; fi\n',
      { mode: 0o700 },
    );
    await writeFile(
      join(bin, 'stat'),
      `#!/usr/bin/python3
import os,sys,stat
arguments=sys.argv[1:]
if arguments[:2]==['-c','%f:%u:%g:%h']:
 metadata=os.lstat(arguments[2])
 uid=59001 if metadata.st_uid==os.getuid() else metadata.st_uid
 gid=59001 if metadata.st_gid==os.getgid() else metadata.st_gid
 print(f'{metadata.st_mode:x}:{uid}:{gid}:{metadata.st_nlink}')
else:os.execv('/usr/bin/stat',['stat',*arguments])
`,
      { mode: 0o700 },
    );
    await writeFile(
      join(bin, 'sha256sum'),
      `#!/bin/sh
set -eu
count=0
if test -f "$TASK8_COHERENCE_DIR/count"; then count=$(cat "$TASK8_COHERENCE_DIR/count"); fi
count=$((count+1))
printf '%s' "$count" > "$TASK8_COHERENCE_DIR/count"
pause_hash() {
if test "$count" -le "$TASK8_HASH_PAUSES"; then
 : > "$TASK8_COHERENCE_DIR/reached-$count"
 attempts=0
 while test ! -f "$TASK8_COHERENCE_DIR/release-$count"; do
  attempts=$((attempts+1));test "$attempts" -le 700
  sleep .01
 done
fi
}
if test "$TASK8_HASH_PAUSE_AT" = before; then pause_hash; fi
/usr/bin/sha256sum "$@" > "$TASK8_COHERENCE_DIR/checksum-$count" || exit 1
cat "$TASK8_COHERENCE_DIR/checksum-$count" || exit 1
if test "$TASK8_HASH_PAUSE_AT" = after; then pause_hash; fi
if test -f "$TASK8_COHERENCE_DIR/fail-checksum"; then exit 1; fi
`,
      { mode: 0o700 },
    );
    if (input.checksumFailure)
      await writeFile(join(directory, 'fail-checksum'), 'fixed failure', { mode: 0o600 });
    const child = Bun.spawn(['/bin/sh', script, directory], {
      env: {
        PATH: bin + ':/usr/bin:/bin',
        LANG: 'C',
        TASK8_COHERENCE_DIR: directory,
        TASK8_HASH_PAUSES: String(input.pauses),
        TASK8_HASH_PAUSE_AT: input.pauseAt ?? 'before',
      },
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
    });
    outputs = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    deadline = setTimeout(() => {
      controller.abort(abort);
    }, 8000);
    terminal = awaitMaintenanceChild(child, controller.signal)
      .then(
        () => ({ state: 'passed' as const }),
        (cause: unknown) => {
          if (cause === abort) return { state: 'aborted' as const };
          if (
            cause instanceof Error &&
            cause.message === 'Fixed maintenance child failed (exit 1)' &&
            child.exitCode === 1
          )
            return { state: 'refused' as const };
          return { state: 'failed' as const, cause };
        },
      )
      .finally(() => {
        settled = true;
        clearTimeout(deadline);
      });
    for (let position = 1; position <= input.pauses; position++) {
      const end = Date.now() + 5000;
      let reached = false;
      for (;;) {
        try {
          await lstat(join(directory, 'reached-' + String(position)));
          reached = true;
          break;
        } catch (cause) {
          if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
        }
        if (settled) break;
        if (Date.now() >= end) throw new Error('Exact checksum boundary not reached');
        await Bun.sleep(5);
      }
      if (!reached) break;
      await input.cross?.(fixture, position);
      await writeFile(join(directory, 'release-' + String(position)), 'release', {
        mode: 0o600,
        flag: 'wx',
      });
    }
    const decision = await terminal;
    const pipes = await outputs;
    if (decision.state === 'failed') throw decision.cause;
    if (decision.state === 'aborted') throw new Error('Owned permit proof exceeded deadline');
    expect(pipes).toEqual(['', '']);
    let hashes = 0;
    try {
      hashes = Number(await readFile(join(directory, 'count'), 'utf8'));
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
    }
    return { state: decision.state, hashes, revision };
  }, [
    async () => {
      clearTimeout(deadline);
      if (terminal !== undefined) {
        if (!settled) controller.abort(abort);
        const outcome = await terminal;
        if (
          outcome.state === 'failed' &&
          !(
            outcome.cause instanceof Error &&
            /^Fixed maintenance child failed \(exit [0-9]+\)$/.test(outcome.cause.message)
          )
        )
          throw outcome.cause;
      }
    },
    async () => {
      if (outputs !== undefined) await outputs;
    },
    async () => {
      const metadata = await lstat(directory);
      if (
        !metadata.isDirectory() ||
        metadata.uid !== process.getuid?.() ||
        (metadata.mode & 0o777) !== 0o700
      )
        throw new Error('Owned permit fixture changed');
      await rm(directory, { recursive: true });
      let absent = false;
      try {
        await lstat(directory);
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
        absent = true;
      }
      if (!absent) throw new Error('Owned permit fixture remains');
    },
  ]);
}
test('one compatible actual authority commit before checksum needs one complete sample', async () => {
  expect(await guardDecision({ pauses: 1, cross: (fixture) => fixture.commit() })).toEqual({
    state: 'passed',
    hashes: 1,
    revision: 1,
  });
}, 15000);
async function commitDisjointFinalGrant(fixture: Fixture) {
  const measured = await fixture.sampledChecksum();
  await fixture.commit();
  const permission = (await readFile(fixture.permission, 'utf8')).trim().split(' ');
  expect(permission).toHaveLength(6);
  expect(permission.slice(4).includes(measured)).toBe(false);
}
test('one disjoint actual authority commit after checksum then quiet state needs two samples', async () => {
  expect(
    await guardDecision({ pauses: 1, pauseAt: 'after', cross: commitDisjointFinalGrant }),
  ).toEqual({ state: 'passed', hashes: 2, revision: 1 });
}, 15000);
test('three disjoint actual commits after checksum exhaust the bound and select readonly', async () => {
  expect(
    await guardDecision({ pauses: 3, pauseAt: 'after', cross: commitDisjointFinalGrant }),
  ).toEqual({
    state: 'refused',
    hashes: 3,
    revision: 3,
  });
}, 15000);
for (const fault of ['revoked', 'malformed', 'boot', 'mode', 'unreadable'] as const)
  test(
    'final ' + fault + ' permission never falls back to A',
    async () => {
      const observed = await guardDecision({
        pauses: 1,
        pauseAt: 'after',
        cross: async (fixture) => {
          if (fault === 'revoked') await fixture.revoke();
          else if (fault === 'mode') await chmod(fixture.permission, 0o644);
          else if (fault === 'unreadable') await chmod(fixture.permission, 0);
          else {
            const bytes = await readFile(fixture.permission, 'utf8');
            await writeFile(
              fixture.permission,
              fault === 'malformed'
                ? bytes + 'CORRUPT\n'
                : bytes.replace(/^1 [^ ]+/, '1 00000000-0000-0000-0000-000000000000'),
            );
          }
        },
      });
      expect(observed.state).toBe('refused');
      expect(observed.hashes).toBe(1);
    },
    15000,
  );
test('real expiry during a paused checksum is checked again at the final sample', async () => {
  let expires = 0;
  const observed = await guardDecision({
    pauses: 1,
    pauseAt: 'after',
    before: async (fixture) => {
      const fields = (await readFile(fixture.permission, 'utf8')).trim().split(' ');
      expires = Math.floor(await clock()) + 3;
      fields[2] = String(expires - 30);
      fields[3] = String(expires);
      await writeFile(fixture.permission, fields.join(' ') + '\n');
    },
    cross: async () => {
      while ((await clock()) < expires) await Bun.sleep(25);
    },
  });
  expect(observed.state).toBe('refused');
  expect(observed.hashes).toBe(1);
}, 15000);
for (const fault of ['missing', 'unreadable', 'mismatch', 'trailing', 'double-space'] as const)
  test(
    'stable ' + fault + ' permission remains readonly',
    async () => {
      const observed = await guardDecision({
        pauses: 0,
        before: async (fixture) => {
          if (fault === 'missing') await unlink(fixture.permission);
          else if (fault === 'unreadable') await chmod(fixture.permission, 0);
          else if (fault === 'mismatch')
            await writeFile(fixture.journal, (await readFile(fixture.journal, 'utf8')) + ' ');
          else {
            const bytes = await readFile(fixture.permission, 'utf8');
            await writeFile(
              fixture.permission,
              fault === 'trailing' ? bytes + 'CORRUPT\n' : bytes.replace(' ', '  '),
            );
          }
        },
      });
      expect(observed.state).toBe('refused');
      expect(observed.hashes).toBeLessThanOrEqual(1);
    },
    15000,
  );
test('stable permission after three legal authority mutations is writable', async () => {
  expect(
    await guardDecision({
      pauses: 0,
      before: async (fixture) => {
        await fixture.commit();
        await fixture.commit();
        await fixture.commit();
      },
    }),
  ).toEqual({ state: 'passed', hashes: 1, revision: 3 });
}, 15000);
test('checksum tool error status cannot authorize even with a matching printed digest', async () => {
  expect(await guardDecision({ pauses: 0, checksumFailure: true })).toEqual({
    state: 'refused',
    hashes: 1,
    revision: 0,
  });
}, 15000);
for (const fault of registryPermitFaults)
  test(
    'original permit byte fault ' + fault + ' refuses the actual guard',
    async () => {
      const observed = await guardDecision({
        pauses: 0,
        before: async (fixture) => {
          await writeFile(
            fixture.permission,
            corruptRegistryPermit(fault, await readFile(fixture.permission)),
          );
        },
      });
      expect(observed.state).toBe('refused');
    },
    15000,
  );
for (const crossings of [1, 3])
  test(`matching final authority permission accepts the first sample despite ${String(crossings)} queued crossings`, async () => {
    let actualCommits = 0;
    const finalGrants: boolean[] = [];
    const observed = await guardDecision({
      pauses: crossings,
      cross: async (fixture) => {
        await fixture.commit();
        actualCommits++;
        const checksum = createHash('sha256')
          .update(await readFile(fixture.journal))
          .digest('hex');
        const permission = (await readFile(fixture.permission, 'utf8')).trim().split(' ');
        expect(permission).toHaveLength(6);
        const grantMatches = permission.slice(4).includes(checksum);
        finalGrants.push(grantMatches);
        expect(grantMatches).toBe(true);
        // No further writer runs until the next exact before-checksum barrier.
        // The guard hashes these actual committed bytes after this callback returns.
      },
    });
    console.log(
      JSON.stringify({
        actualAuthorityFinalGrant: {
          queuedCrossings: crossings,
          actualCommits,
          finalGrants,
          observed,
          ownedFixtureCleanupVerified: true,
        },
      }),
    );
    expect(observed).toEqual({ state: 'passed', hashes: 1, revision: 1 });
    expect(actualCommits).toBe(1);
  }, 15000);

for (const fault of ['cleanup', 'operation+cleanup'] as const) {
  test(
    'actual permit caller preserves operation and owned-directory cleanup refusal: ' + fault,
    async () => {
      let directory: string | undefined;
      const primary = new Error('owned permit operation failure');
      await completeRegistryFixture(async () => {
        const refused = await requireRejection(
          guardDecision({
            pauses: 0,
            before: async (fixture) => {
              directory = dirname(dirname(fixture.journal));
              await chmod(directory, 0o755);
              if (fault === 'operation+cleanup') throw primary;
            },
          }),
        );
        if (fault === 'cleanup') expect(refused.throwCause).toThrow('Owned permit fixture changed');
        else {
          expect(refused.cause).toBeInstanceOf(AggregateError);
          // Test boundary: the preceding assertion establishes the observed compound failure.
          const compound = refused.cause as AggregateError;
          expect(compound.errors).toHaveLength(2);
          expect(compound.errors[0]).toBe(primary);
          const closing: unknown = compound.errors[1];
          expect(closing).toBeInstanceOf(Error);
          if (!(closing instanceof Error)) throw new Error('Missing typed cleanup refusal');
          expect(closing.message).toBe('Owned permit fixture changed');
          expect(compound.cause).toBe(primary);
        }
        if (directory === undefined) throw new Error('Missing owned permit directory observation');
        expect((await lstat(directory)).mode & 0o777).toBe(0o755);
      }, [
        async () => {
          if (directory === undefined) throw new Error('Missing owned permit directory for rescue');
          const metadata = await lstat(directory);
          if (!metadata.isDirectory() || metadata.uid !== process.getuid?.())
            throw new Error('Refusing changed permit rescue ownership');
          // Rescue follows the caller's recorded refusal; it does not turn that refusal into successful cleanup.
          await chmod(directory, 0o700);
          await rm(directory, { recursive: true });
        },
      ]);
    },
    15000,
  );
}
