import { rejects } from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { constructFixture } from './construct-fixture';
import { createFormat3Fixture, settleFixture, verifyFormat3Source } from './format3-fixture';
for (const termination of ['idle', 'close_timeout'] as const)
  test(`format3 fixture reports ${termination} worker termination after cleanup and on repeated close`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'format3-lifecycle-'));
    let fixture: Awaited<ReturnType<typeof createFormat3Fixture>> | undefined;
    let expectedFailure: unknown;
    try {
      fixture = await createFormat3Fixture(join(directory, 'runs.sqlite'));
      const pid = fixture.worker.pid;
      if (pid === undefined) throw new Error('ready worker has no process identity');
      const archive = readlinkSync(`/proc/${String(pid)}/cwd`);
      await fixture.capture();
      expect(existsSync(archive)).toBe(true);
      if (termination === 'idle') {
        process.kill(pid, 'SIGKILL');
        expect(await fixture.worker.exited).toEqual({ code: null, signal: 'SIGKILL' });
      } else process.kill(pid, 'SIGSTOP');
      const closed = await fixture.close().then(
        () => ({ kind: 'closed' as const }),
        (cause: unknown) => ({ kind: 'failed' as const, cause }),
      );
      if (closed.kind === 'failed') expectedFailure = closed.cause;
      expect(existsSync(archive)).toBe(false);
      expect(closed.kind).toBe('failed');
      if (closed.kind !== 'failed') throw new Error('expected worker failure');
      expect(closed.cause).toBeInstanceOf(Error);
      expect(String(closed.cause)).toContain(
        termination === 'idle'
          ? 'format3 worker exited null/SIGKILL'
          : 'format3 worker close timed out',
      );
      expect(await fixture.worker.exited).toEqual({ code: null, signal: 'SIGKILL' });
      await rejects(fixture.close(), (cause: unknown) => {
        expect(cause).toBe(closed.cause);
        return true;
      });
    } finally {
      try {
        await fixture?.close().catch((cause: unknown) => {
          // The test already observed this exact cached terminal failure; a new cleanup failure is never suppressed.
          if (cause !== expectedFailure) throw cause;
        });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });
test('format3 fixture acknowledged close exits zero removes archive and is idempotent', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format3-lifecycle-'));
  let fixture: Awaited<ReturnType<typeof createFormat3Fixture>> | undefined;
  try {
    fixture = await createFormat3Fixture(join(directory, 'runs.sqlite'));
    const pid = fixture.worker.pid;
    if (pid === undefined) throw new Error('ready worker has no process identity');
    const archive = readlinkSync(`/proc/${String(pid)}/cwd`);
    await fixture.capture();
    await fixture.close();
    expect(await fixture.worker.exited).toEqual({ code: 0, signal: null });
    expect(existsSync(archive)).toBe(false);
    await fixture.close();
  } finally {
    try {
      await fixture?.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
test('format3 fixture rejects a malformed entered marker instead of claiming a handshake', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format3-marker-'));
  const fixture = await constructFixture(
    () => createFormat3Fixture(join(directory, 'runs.sqlite')),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  try {
    const pid = fixture.worker.pid;
    if (pid === undefined) throw new Error('ready worker has no process identity');
    const archive = readlinkSync(`/proc/${String(pid)}/cwd`);
    await Bun.write(join(archive, 'busy_paused'), 'NaN');
    await rejects(fixture.waitForEvent('busy_paused'), /Validation failed/);
  } finally {
    try {
      await fixture.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
test('archived source fingerprints reject an altered actual predecessor module', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format3-source-identity-'));
  const fixture = await constructFixture(
    () => createFormat3Fixture(join(directory, 'runs.sqlite')),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  await settleFixture(async () => {
    const pid = fixture.worker.pid;
    if (pid === undefined) throw new Error('worker PID missing');
    const archive = readlinkSync(`/proc/${String(pid)}/cwd`);
    const modulePath = join(
      archive,
      'apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/format.ts',
    );
    const original = await Bun.file(modulePath).text();
    await settleFixture(async () => {
      await Bun.write(modulePath, original + '\n');
      expect(() => verifyFormat3Source(archive)).toThrow('predecessor source differs');
    }, [
      async () => {
        await Bun.write(modulePath, original);
      },
    ]);
    expect(verifyFormat3Source(archive).length).toBeGreaterThan(0);
  }, [
    async () => {
      await settleFixture(async () => {
        await fixture.close();
      }, [
        () => {
          rmSync(directory, { recursive: true, force: true });
        },
      ]);
    },
  ]);
});
test('pure protocol imports under current and archived roots preserve the owned store tree', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'format3-protocol-import-'));
  const fixture = await constructFixture(
    () => createFormat3Fixture(join(directory, 'runs.sqlite')),
    [
      () => {
        rmSync(directory, { recursive: true });
      },
    ],
  );
  await settleFixture(async () => {
    const pid = fixture.worker.pid;
    if (pid === undefined) throw new Error('worker PID missing');
    const archive = readlinkSync(`/proc/${String(pid)}/cwd`);
    const loader = join(directory, 'load-protocol.ts');
    await Bun.write(
      loader,
      "const path=process.argv[2]; if(path===undefined)throw new Error('protocol path missing'); await import(path); console.log('protocol loaded');\n",
    );
    const capture = () =>
      readdirSync(directory)
        .sort()
        .map((name) => ({
          name,
          sha256: new Bun.CryptoHasher('sha256')
            .update(readFileSync(join(directory, name)))
            .digest('hex'),
        }));
    const before = capture();
    const physical = await fixture.capture();
    for (const path of [
      join(import.meta.dirname, 'format3-protocol.ts'),
      join(
        archive,
        'apps/twilight-structure/twilight-dash/cli/src/runs/testing/format3-protocol.ts',
      ),
    ]) {
      const transpiler = new Bun.Transpiler({ loader: 'ts' });
      const imports = transpiler
        .scanImports(transpiler.transformSync(readFileSync(path, 'utf8')))
        .map((entry) => entry.path)
        .sort();
      expect(imports).toEqual([
        '../execution-codecs',
        '../record-codecs',
        '../runtime-codecs',
        '@shared/validation',
      ]);
      const child = Bun.spawn([process.execPath, loader, path], {
        cwd: directory,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 15000,
      });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect({ stdout, stderr, exit }).toEqual({
        stdout: 'protocol loaded\n',
        stderr: '',
        exit: 0,
      });
      expect(capture()).toEqual(before);
      expect(await fixture.capture()).toEqual(physical);
    }
  }, [
    async () => {
      await settleFixture(async () => {
        await fixture.close();
      }, [
        () => {
          rmSync(directory, { recursive: true, force: true });
        },
      ]);
    },
  ]);
});
