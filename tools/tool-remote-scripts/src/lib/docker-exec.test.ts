import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

test('production streaming boundary refuses incomplete frames from its exact CLI before ACK', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exec-stream-'));
  try {
    await Bun.write(join(directory, 'docker'), "#!/bin/sh\nprintf 'BROKEN'\n");
    await chmod(join(directory, 'docker'), 0o700);
    const source = `import { runDockerExec } from ${JSON.stringify(new URL('./docker-exec.ts', import.meta.url).pathname)}; await runDockerExec(['exec','fixture'],'proof',()=>false,AbortSignal.timeout(500));`;
    const child = Bun.spawn([process.execPath, '-e', source], {
      env: { ...process.env, PATH: directory },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(code).not.toBe(0);
    expect(stderr).toContain('exec receipt is incomplete');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('production streaming boundary refuses stdout-bound', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exec-stream-'));
  try {
    await Bun.write(join(directory, 'docker'), "#!/bin/sh\nprintf '%033554433d' 0\n");
    await chmod(join(directory, 'docker'), 0o700);
    const source = `import { runDockerExec } from ${JSON.stringify(new URL('./docker-exec.ts', import.meta.url).pathname)}; await runDockerExec(['exec','fixture'],'proof',token=>token==='DONE',AbortSignal.timeout(10000));`;
    const child = Bun.spawn([process.execPath, '-e', source], {
      env: { ...process.env, PATH: directory },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(code).not.toBe(0);
    expect(stderr).toContain('exec receipt output bound exceeded');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('production streaming boundary refuses stderr-bound', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exec-stream-'));
  try {
    await Bun.write(join(directory, 'docker'), "#!/bin/sh\nprintf '%065537d' 0 >&2\n");
    await chmod(join(directory, 'docker'), 0o700);
    const source = `import { runDockerExec } from ${JSON.stringify(new URL('./docker-exec.ts', import.meta.url).pathname)}; await runDockerExec(['exec','fixture'],'proof',token=>token==='DONE',AbortSignal.timeout(10000));`;
    const child = Bun.spawn([process.execPath, '-e', source], {
      env: { ...process.env, PATH: directory },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(code).not.toBe(0);
    expect(stderr).toContain('exec stderr output bound exceeded');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('production streaming boundary refuses stderr-contract', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exec-stream-'));
  try {
    await Bun.write(
      join(directory, 'docker'),
      "#!/bin/sh\nprintf 'DONE\\000'; printf 'metadata failed' >&2\nIFS= read -r answer\n/bin/sleep 0.05\n",
    );
    await chmod(join(directory, 'docker'), 0o700);
    const source = `import { runDockerExec } from ${JSON.stringify(new URL('./docker-exec.ts', import.meta.url).pathname)}; await runDockerExec(['exec','fixture'],'proof',token=>token==='DONE',AbortSignal.timeout(10000));`;
    const child = Bun.spawn([process.execPath, '-e', source], {
      env: { ...process.env, PATH: directory },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(code).not.toBe(0);
    expect(stderr).toContain('exec metadata command reported stderr');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('production streaming exec hard abort terminates its exact stalled subprocess', async () => {
  const root = await mkdtemp(join(tmpdir(), 'docker-cli-deadline-'));
  const pidPath = join(root, 'child.pid');
  let pid: number | null = null;
  let primaryFailure: unknown = null;
  try {
    await mkdir(join(root, 'bin'));
    const executable = join(root, 'bin/docker');
    await Bun.write(executable, '#!/bin/sh\nprintf "%s" "$$" > "$PID_FILE"\nexec /bin/sleep 60\n');
    await chmod(executable, 0o700);
    const deadlineModule = new URL('./docker-deadline.ts', import.meta.url).pathname;
    const execModule = new URL('./docker-exec.ts', import.meta.url).pathname;
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `import { runDockerBefore } from ${JSON.stringify(deadlineModule)}; import { runDockerExec } from ${JSON.stringify(execModule)}; try { await runDockerBefore(['exec','fixture-only'],async(args,signal)=>{await runDockerExec(args,'proof',()=>false,signal);return '';},performance.now()+50); throw new Error('deadline was bypassed'); } catch (cause) { if (!(cause instanceof Error) || !cause.message.includes('deadline exceeded')) throw cause; console.log('bounded Docker CLI refused'); }`,
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
