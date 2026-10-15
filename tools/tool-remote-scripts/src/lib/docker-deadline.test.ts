import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { runDockerBefore } from './docker-deadline';

test('Docker operation deadline rejects and aborts a non-cooperating inspection runner', async () => {
  let aborted = false;
  const start = performance.now();
  let refusal = '';
  try {
    await runDockerBefore(
      ['inspect', 'exact-id'],
      (_args, signal) =>
        new Promise(() => {
          signal?.addEventListener('abort', () => {
            aborted = true;
          });
        }),
      performance.now() + 20,
    );
  } catch (cause) {
    refusal = cause instanceof Error ? cause.message : String(cause);
  }
  expect(refusal).toContain('deadline exceeded');
  expect(aborted).toBe(true);
  expect(performance.now() - start).toBeLessThan(200);
});

test('production Docker CLI hard abort terminates its exact stalled subprocess', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docker-cli-deadline-'));
  const pidPath = join(root, 'child.pid');
  let pid: number | null = null;
  let primaryFailure: unknown = null;
  try {
    await mkdir(join(root, 'bin'));
    const executable = join(root, 'bin/docker');
    await Bun.write(executable, '#!/bin/sh\nprintf "%s" "$$" > "$PID_FILE"\nexec /bin/sleep 60\n');
    await chmod(executable, 0o700);
    const module = new URL('./docker-deadline.ts', import.meta.url).pathname;
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `import { runDockerBefore, runDockerCli } from ${JSON.stringify(module)}; try { await runDockerBefore(['inspect','fixture-only'],runDockerCli,performance.now()+50); throw new Error('deadline was bypassed'); } catch (cause) { if (!(cause instanceof Error) || !cause.message.includes('deadline exceeded')) throw cause; console.log('bounded Docker CLI refused'); }`,
      ],
      {
        env: { ...process.env, PATH: `${root}/bin:/usr/bin:/bin`, PID_FILE: pidPath },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const observation = setTimeout(() => {
      child.kill();
    }, 500);
    try {
      const output = await new Response(child.stdout).text();
      const failure = await new Response(child.stderr).text();
      expect({ code: await child.exited, failure }).toEqual({ code: 0, failure: '' });
      expect(output).toContain('bounded Docker CLI refused');
    } finally {
      clearTimeout(observation);
    }
    pid = Number(await readFile(pidPath, 'utf8'));
    expect(Number.isSafeInteger(pid)).toBe(true);
    let alive = true;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        process.kill(pid, 0);
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') {
          alive = false;
          break;
        }
        throw cause;
      }
      await Bun.sleep(5);
    }
    expect(alive).toBe(false);
  } catch (cause) {
    primaryFailure = cause;
  }
  try {
    if (pid === null) {
      try {
        pid = Number(await readFile(pidPath, 'utf8'));
      } catch (cause) {
        if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ENOENT') throw cause;
      }
    }
    if (pid !== null && Number.isSafeInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (cause) {
        if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'ESRCH') throw cause;
      }
    }
    await rm(root, { recursive: true });
  } catch (cleanupCause) {
    throw new AggregateError(
      primaryFailure === null ? [cleanupCause] : [primaryFailure, cleanupCause],
      'fixture CLI cleanup failed',
      { cause: cleanupCause },
    );
  }
  if (primaryFailure instanceof Error) throw primaryFailure;
  if (primaryFailure !== null) throw new Error('fixture failed', { cause: primaryFailure });
});
