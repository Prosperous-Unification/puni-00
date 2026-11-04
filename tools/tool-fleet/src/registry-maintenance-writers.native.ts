import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readRegistryWriters, type RegistryWriter } from './registry-maintenance-writers';

/** Keep exact Error identity; unexpected native fixture I/O rejections remain failures with their original cause. */
function normalizeWriterFailure(cause: unknown): Error {
  // Proof: primitive operation/dead-census faults in registry-writer-completion.test.ts detect lost or unwrapped causes.
  return cause instanceof Error
    ? cause
    : new Error('Native writer fixture rejected a non-error failure', { cause });
}

const directory = await mkdtemp(join(tmpdir(), 'puni-task8-writer-'));
const binary = join(directory, 'thread-proof');
const failures: Error[] = [];
let checks = 0;
try {
  const compilation = Bun.spawn(
    [
      '/usr/bin/cc',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-pthread',
      new URL('fixtures/registry-writer-thread.c', import.meta.url).pathname,
      '-o',
      binary,
    ],
    { stdout: 'inherit', stderr: 'inherit' },
  );
  if ((await compilation.exited) !== 0) throw new Error('Native writer fixture compilation failed');
  for (const mode of ['live', 'dead'] as const) {
    const owned = Bun.spawn([binary, mode, join(directory, 'content')], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'inherit',
    });
    let pid = '';
    try {
      const reader = owned.stdout.getReader();
      const frame = await reader.read();
      if (frame.done) throw new Error('Missing native process receipt');
      pid = new TextDecoder().decode(frame.value).trim();
      reader.releaseLock();
      if (!/^[1-9]\d*$/.test(pid)) throw new Error('Invalid native process receipt');
      let status = '';
      for (let attempt = 0; attempt < 100; attempt++) {
        status = await readFile(`/proc/${pid}/status`, 'utf8');
        if (/^State:\s+Z\b/m.test(status) && (mode === 'dead' || /^Threads:\s+2$/m.test(status)))
          break;
        await Bun.sleep(10);
      }
      if (!/^State:\s+Z\b/m.test(status)) throw new Error('Native leader did not become zombie');
      const proc = join(directory, mode);
      await mkdir(join(proc, 'self'), { recursive: true });
      await symlink('/proc/self/mountinfo', join(proc, 'self/mountinfo'));
      await symlink(`/proc/${pid}`, join(proc, pid));
      // Only enumeration is scoped to this owned process. All audited per-process files are actual kernel /proc evidence.
      let observation:
        { kind: 'read'; writers: RegistryWriter[] } | { kind: 'rejected'; cause: unknown };
      try {
        observation = {
          kind: 'read',
          writers: await readRegistryWriters(directory, '/fixed/registry', proc),
        };
      } catch (cause) {
        observation = { kind: 'rejected', cause };
      }
      if (mode === 'live') {
        if (
          observation.kind !== 'rejected' ||
          !(observation.cause instanceof Error) ||
          !observation.cause.message.includes('writer census is incomplete')
        )
          throw new Error('Dead leader with live writer was certified absent');
        if ((await readFile(join(directory, 'content'), 'utf8')) !== 'held')
          throw new Error('Native worker did not retain writable content');
      } else {
        // Proof: dead-undefined/null/string and dead-writers faults refuse instead of certifying failed or contradictory censuses in registry-writer-completion.test.ts.
        if (observation.kind === 'rejected') throw normalizeWriterFailure(observation.cause);
        if (observation.writers.length !== 0)
          throw new Error('Dead native fixture retained writer capability');
      }
      checks++;
    } catch (cause) {
      failures.push(normalizeWriterFailure(cause));
    }
    for (const cleanup of [
      async () => {
        // Proof: close and observation+close in registry-writer-completion.test.ts fail when EOF completion is not awaited.
        await owned.stdin.end();
      },
      async () => {
        // Proof: exit and observation+exit+survivor+binary in registry-writer-completion.test.ts detect a skipped nonzero-terminal refusal.
        if ((await owned.exited) !== 0)
          throw new Error('Native thread fixture did not acknowledge exact child cleanup');
      },
      async () => {
        // Proof: survivor and the compound survivor case in registry-writer-completion.test.ts detect a skipped process-absence check.
        if (pid !== '' && (await readdir('/proc')).includes(pid))
          throw new Error('Owned native child survived cleanup');
      },
      async () => {
        // Proof: binary and observation+binary in registry-writer-completion.test.ts detect a missing canonical-path check.
        if ((await realpath(binary)) !== binary)
          throw new Error('Native fixture binary identity changed');
      },
    ]) {
      try {
        await cleanup();
      } catch (cause) {
        // Proof: observation+exit+survivor+binary retains every ordered failure in registry-writer-completion.test.ts.
        failures.push(normalizeWriterFailure(cause));
      }
    }
    // Proof: continuing after the first failed case changes literal owned-process counts and error members in registry-writer-completion.test.ts.
    if (failures.length > 0) break;
  }
} catch (cause) {
  failures.push(normalizeWriterFailure(cause));
}
try {
  // Proof: compilation failure still removes its created workspace; removal failure cannot hide earlier operation/cleanup errors.
  await rm(directory, { recursive: true });
} catch (cause) {
  failures.push(normalizeWriterFailure(cause));
}
const failure = failures.at(0);
if (failure !== undefined) {
  // Proof: compound operation/EOF/binary/removal cases require every member, order and original cause in registry-writer-completion.test.ts.
  if (failures.length > 1)
    throw new AggregateError(failures, 'Native writer fixture and cleanup failed', {
      cause: failure,
    });
  throw failure;
}
console.log(
  JSON.stringify({
    checks,
    scope: 'actual kernel thread evidence; process enumeration restricted to exact owned children',
    cleanup: 'both child groups reaped',
  }),
);
