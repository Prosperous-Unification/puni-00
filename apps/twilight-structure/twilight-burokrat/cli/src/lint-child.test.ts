import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import { LintCleanupFailure, runLintChild } from './lint-child';
import type { LintInterrupt } from './lint-interrupts';
import { createLintOutputs, type LintWrite } from './lint-output';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const owner = join(root, 'owned.pid');
    if (existsSync(owner)) {
      const pid = Number(readFileSync(owner, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 1) throw new Error('invalid owned fixture PID');
      killOwned(-pid, 'SIGKILL');
      killOwned(pid, 'SIGKILL');
      await Bun.sleep(10);
    }
    rmSync(root, { recursive: true, force: true });
  }
});

function createFixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'puni-lint-child-'));
  roots.push(root);
  const directory = join(root, 'owned child');
  mkdirSync(directory);
  const entrypoint = join(directory, 'role.mjs');
  writeRole(root, entrypoint, source);
  const stdout: Uint8Array[] = [];
  const stderr: Uint8Array[] = [];
  const listeners = new Set<(signal: LintInterrupt) => void>();
  const context = {
    argv: [process.execPath, '--no-env-file', '--config=/dev/null', entrypoint],
    directory,
    environment: { PUNI_CHILD_SENTINEL: 'explicit' },
    stdout: (chunk: Uint8Array): LintWrite => {
      stdout.push(chunk.slice());
      return { kind: 'written' };
    },
    stderr: (chunk: Uint8Array): LintWrite => {
      stderr.push(chunk.slice());
      return { kind: 'written' };
    },
    subscribeInterrupts: (listener: (signal: LintInterrupt) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return { root, directory, stdout, stderr, listeners, context };
}

describe('owned lint stage process', () => {
  it('preserves argv, explicit environment, cwd and typed stdin in the actual child', async () => {
    const fixture = createFixture(
      'process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), environment: process.env, directory: process.cwd(), input: await Bun.stdin.text() }));',
    );
    const args = ['space and ;$() literal', 'line1\nline2'];
    const outcome = await runLintChild({
      ...fixture.context,
      argv: [...fixture.context.argv, ...args],
      stage: 'validator',
      stdin: Buffer.from('typed stdin'),
    });
    expect(outcome.kind).toBe('exited');
    expect(outcome.status).toBe(0);
    expect(JSON.parse(Buffer.concat(fixture.stdout).toString())).toEqual({
      argv: args,
      environment: fixture.context.environment,
      directory: fixture.directory,
      input: 'typed stdin',
    });
    expect(Buffer.concat(fixture.stderr)).toHaveLength(0);
    expect(fixture.listeners.size).toBe(0);
  });

  it('streams arbitrary output bytes and retains an exact nonzero verdict', async () => {
    const fixture = createFixture(
      'process.stdout.write(Uint8Array.from([255, 0, 65])); process.stderr.write(Uint8Array.from([254, 66])); process.exitCode = 37;',
    );
    const outcome = await runLintChild({
      ...fixture.context,
      stage: 'validator',
      stdin: new Uint8Array(),
    });
    expect(outcome.kind).toBe('exited');
    expect(outcome.status).toBe(37);
    expect(Array.from(outcome.stdout)).toEqual([255, 0, 65]);
    expect(Array.from(Buffer.concat(fixture.stdout))).toEqual([255, 0, 65]);
    expect(Array.from(Buffer.concat(fixture.stderr))).toEqual([254, 66]);
    expect(fixture.listeners.size).toBe(0);
  });

  it('does not start a new stage after cancellation has already been recorded', async () => {
    const fixture = createFixture('throw new Error("must not execute");');
    const outcome = await runLintChild({
      ...fixture.context,
      argv: [join(fixture.root, 'absent-program')],
      stage: 'snapshotter',
      stdin: undefined,
      subscribeInterrupts: (listener) => {
        listener('SIGINT');
        return () => undefined;
      },
    });
    expect(outcome.kind).toBe('cancelled');
    expect(outcome.status).toBe(130);
    expect(outcome.stdout).toHaveLength(0);
  });

  it('reports unsolicited child signals after preserving partial output', async () => {
    const fixture = createFixture(
      'process.stdout.write("partial"); process.kill(process.pid, "SIGTERM");',
    );
    try {
      await runLintChild({ ...fixture.context, stage: 'validator', stdin: new Uint8Array() });
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) throw cause;
      expect(cause.message).toContain('lint validator ended by SIGTERM');
      expect(Buffer.concat(fixture.stdout).toString()).toBe('partial');
      expect(fixture.listeners.size).toBe(0);
      return;
    }
    throw new Error('unsolicited child signal became a normal verdict');
  });

  it('adds spawn context and releases its subscription when the executable is unavailable', async () => {
    const fixture = createFixture('export {};');
    try {
      await runLintChild({
        ...fixture.context,
        argv: [join(fixture.root, 'absent-program')],
        stage: 'snapshotter',
        stdin: undefined,
      });
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) throw cause;
      expect(cause.message).toBe('cannot start lint snapshotter');
      expect(cause.cause).toBeInstanceOf(Error);
      expect(fixture.listeners.size).toBe(0);
      return;
    }
    throw new Error('unavailable executable was admitted');
  });
});

describe('owned lint process group', () => {
  for (const stdio of ['ignore', 'inherit'] as const) {
    it(
      'kills ordinary background descendants with ' + stdio + ' output before releasing the stage',
      async () => {
        const fixture = createFixture('export {};');
        const pidPath = join(fixture.root, 'grandchild.pid');
        const grandchild = join(fixture.root, 'grandchild.mjs');
        writeFileSync(
          grandchild,
          'import { writeFileSync } from "node:fs"; process.on("SIGTERM", () => undefined); writeFileSync(' +
            JSON.stringify(pidPath) +
            ', String(process.pid)); setInterval(() => undefined, 1000);',
        );
        const entrypoint = fixture.context.argv[3];
        writeFileSync(
          entrypoint,
          'import { existsSync } from "node:fs"; Bun.spawn([process.execPath,"--no-env-file","--config=/dev/null",' +
            JSON.stringify(grandchild) +
            '], {stdin:"ignore",stdout:' +
            JSON.stringify(stdio) +
            ',stderr:' +
            JSON.stringify(stdio) +
            '}); for(let attempt=0; !existsSync(' +
            JSON.stringify(pidPath) +
            '); attempt++) { if(attempt===1000) throw new Error("grandchild did not start"); await Bun.sleep(2); } process.on("SIGTERM", () => process.exit(0)); process.stdout.write("ready"); setInterval(() => undefined,1000);',
        );
        const kill = killOwned;
        // The test owns these descendant PIDs; /proc is a Linux-only observation, not production cleanup authority.
        try {
          const outcome = await runLintChild({
            ...fixture.context,
            stage: 'snapshotter',
            stdin: undefined,
            stdout: (bytes) => {
              fixture.context.stdout(bytes);
              if (Buffer.from(bytes).toString().includes('ready'))
                for (const listener of fixture.listeners) listener('SIGTERM');
              return { kind: 'written' };
            },
          });
          expect(outcome.kind).toBe('cancelled');
          expect(outcome.status).toBe(143);
        } catch (cause) {
          // An unreaped orphan zombie conservatively refuses cleanup instead of claiming group disappearance.
          expect(cause).toBeInstanceOf(LintCleanupFailure);
        } finally {
          const pid = Number(readFileSync(pidPath, 'utf8'));
          expect(Number.isInteger(pid)).toBe(true);
          try {
            assertTerminated(pid);
          } finally {
            kill(pid, 'SIGKILL');
          }
        }
        expect(fixture.listeners.size).toBe(0);
      },
      10000,
    );
  }
});

describe('lint interruption ownership', () => {
  for (const repeated of [false, true]) {
    it(
      repeated
        ? 'escalates repeated cancellation immediately'
        : 'escalates ignored cancellation after the bounded grace',
      async () => {
        const fixture = createFixture(
          'process.on("SIGINT", () => process.stdout.write("ignored")); process.stdout.write("ready"); setInterval(() => undefined, 1000);',
        );
        let started: number | undefined;
        let repeatedAt: number | undefined;
        const outcome = await runLintChild({
          ...fixture.context,
          stage: 'snapshotter',
          stdin: undefined,
          stdout: (bytes) => {
            fixture.context.stdout(bytes);
            const text = Buffer.from(bytes).toString();
            if (text.includes('ready')) {
              started = performance.now();
              for (const listener of fixture.listeners) listener('SIGINT');
              if (repeated)
                setTimeout(() => {
                  repeatedAt = performance.now();
                  for (const listener of fixture.listeners) listener('SIGTERM');
                }, 75);
            }
            return { kind: 'written' };
          },
        });
        expect(outcome.kind).toBe('cancelled');
        expect(outcome.status).toBe(130);
        expect(started).toBeDefined();
        if (started === undefined) throw new Error('child did not announce readiness');
        if (repeated) {
          expect(repeatedAt).toBeDefined();
          if (repeatedAt === undefined) throw new Error('second signal was not sent');
          expect(performance.now() - repeatedAt).toBeLessThan(900);
        } else expect(performance.now() - started).toBeGreaterThanOrEqual(900);
        expect(fixture.listeners.size).toBe(0);
      },
      10000,
    );
  }

  it('terminates the child and awaits cleanup when its output sink throws', async () => {
    const fixture = createFixture(
      'process.stdout.write(String(process.pid)); setInterval(() => undefined, 1000);',
    );
    const fault = new Error('injected output sink failure');
    let pid: number | undefined;
    const failure: unknown = await runLintChild({
      ...fixture.context,
      stage: 'snapshotter',
      stdin: undefined,
      stdout: (bytes) => {
        pid = Number(Buffer.from(bytes).toString());
        throw fault;
      },
    }).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBe(fault);
    expect(pid).toBeDefined();
    if (pid === undefined) throw new Error('child did not emit its owned PID');
    const ownedPid = pid;
    expect(() => process.kill(ownedPid, 0)).toThrow();
    expect(fixture.listeners.size).toBe(0);
  });
});

it('bounds unconfirmed cleanup even when forced termination does not settle the leader', async () => {
  const fixture = createFixture(
    'process.stdout.write(String(process.pid)); setInterval(() => undefined, 1000);',
  );
  const kill = process.kill.bind(process);
  let pid: number | undefined;
  const delivery = spyOn(process, 'kill').mockImplementation((target, signal) =>
    target < 0 ? true : kill(target, signal),
  );
  const running = runLintChild({
    ...fixture.context,
    stage: 'snapshotter',
    stdin: undefined,
    stdout: (bytes) => {
      pid = Number(Buffer.from(bytes).toString());
      for (const listener of fixture.listeners) listener('SIGINT');
      return { kind: 'written' };
    },
  });
  let failure: unknown;
  try {
    await Promise.race([
      running,
      Bun.sleep(3500).then(() => {
        throw new Error('cleanup remained unbounded');
      }),
    ]);
  } catch (cause) {
    failure = cause;
  } finally {
    delivery.mockRestore();
    if (pid !== undefined) kill(pid, 'SIGKILL');
    await Promise.allSettled([running]);
  }
  expect(failure).toBeInstanceOf(LintCleanupFailure);
  if (!(failure instanceof LintCleanupFailure))
    throw new Error('unconfirmed cleanup lost its type');
  expect(failure.message).toContain('process group ' + String(pid));
  expect(fixture.listeners.size).toBe(0);
}, 10000);

it('preserves remaining cancellation grace for a cooperative grandchild after leader exit', async () => {
  const fixture = createFixture('export {};');
  const ready = join(fixture.root, 'grandchild.pid');
  const cleaned = join(fixture.root, 'grandchild.cleaned');
  const grandchild = join(fixture.root, 'grandchild.mjs');
  writeFileSync(
    grandchild,
    'import { writeFileSync } from "node:fs"; process.on("SIGTERM", async () => { await Bun.sleep(75); writeFileSync(' +
      JSON.stringify(cleaned) +
      ', "clean"); process.exit(0); }); writeFileSync(' +
      JSON.stringify(ready) +
      ', String(process.pid)); setInterval(() => undefined,1000);',
  );
  writeFileSync(
    fixture.context.argv[3],
    'import { existsSync } from "node:fs"; Bun.spawn([process.execPath,"--no-env-file","--config=/dev/null",' +
      JSON.stringify(grandchild) +
      '],{stdin:"ignore",stdout:"ignore",stderr:"ignore"}); for(let attempt=0;!existsSync(' +
      JSON.stringify(ready) +
      ');attempt++){if(attempt===1000)throw new Error("grandchild not ready");await Bun.sleep(2);} process.on("SIGTERM",()=>process.exit(0));process.stdout.write("ready");setInterval(()=>undefined,1000);',
  );
  try {
    const outcome = await runLintChild({
      ...fixture.context,
      stage: 'snapshotter',
      stdin: undefined,
      stdout: (bytes) => {
        fixture.context.stdout(bytes);
        if (Buffer.from(bytes).toString().includes('ready')) {
          for (const listener of fixture.listeners) listener('SIGTERM');
          return { kind: 'cancelled', signal: 'SIGTERM' };
        }
        return { kind: 'written' };
      },
    });
    expect(outcome.status).toBe(143);
  } catch (cause) {
    expect(cause).toBeInstanceOf(LintCleanupFailure);
  }
  expect(readFileSync(cleaned, 'utf8')).toBe('clean');
});

function killOwned(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
  }
}
function assertTerminated(pid: number): void {
  try {
    const state = readFileSync('/proc/' + String(pid) + '/stat', 'utf8')
      .split(') ')[1]
      ?.split(' ')[0];
    expect(state).toBe('Z');
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
  }
}

it('owns a fresh process group through the actual protected launch', async () => {
  const fixture = createFixture(
    'import {readFileSync} from "node:fs"; const columns=readFileSync("/proc/self/stat","utf8").split(") ")[1].split(" ");process.stdout.write(String(Number(columns[2])===process.pid));',
  );
  const outcome = await runLintChild({
    ...fixture.context,
    stage: 'snapshotter',
    stdin: undefined,
  });
  expect(outcome.status).toBe(0);
  expect(Buffer.concat(fixture.stdout).toString()).toBe('true');
});
it('refuses unexpected normal-exit background descendants even after terminating them', async () => {
  const fixture = createFixture('export {};');
  const pidPath = join(fixture.root, 'normal-grandchild.pid');
  const grandchild = join(fixture.root, 'normal-grandchild.mjs');
  writeFileSync(
    grandchild,
    'import {writeFileSync} from "node:fs";writeFileSync(' +
      JSON.stringify(pidPath) +
      ',String(process.pid));setInterval(()=>undefined,1000);',
  );
  writeRole(
    fixture.root,
    fixture.context.argv[3],
    'import {existsSync} from "node:fs";Bun.spawn([process.execPath,"--no-env-file","--config=/dev/null",' +
      JSON.stringify(grandchild) +
      '],{stdin:"ignore",stdout:"ignore",stderr:"ignore"}).unref();for(let attempt=0;!existsSync(' +
      JSON.stringify(pidPath) +
      ');attempt++){if(attempt===1000)throw new Error("grandchild not ready");await Bun.sleep(2);}',
  );
  try {
    const failure: unknown = await runLintChild({
      ...fixture.context,
      stage: 'snapshotter',
      stdin: undefined,
    }).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('normal orphan was admitted');
    if (!(failure instanceof LintCleanupFailure))
      expect(failure.message).toBe('lint snapshotter left background processes');
    assertTerminated(Number(readFileSync(pidPath, 'utf8')));
  } finally {
    killOwned(Number(readFileSync(pidPath, 'utf8')), 'SIGKILL');
  }
});
it('never treats denied process-group signaling as confirmed absence', async () => {
  const fixture = createFixture(
    'process.stdout.write(String(process.pid));setInterval(()=>undefined,1000);',
  );
  const kill = process.kill.bind(process);
  let pid: number | undefined;
  const denied = Object.assign(new Error('injected group signaling denial'), { code: 'EPERM' });
  const signal = spyOn(process, 'kill').mockImplementation((target, kind) => {
    if (target < 0) throw denied;
    return kill(target, kind);
  });
  const running = runLintChild({
    ...fixture.context,
    stage: 'snapshotter',
    stdin: undefined,
    stdout: (bytes) => {
      pid = Number(Buffer.from(bytes).toString());
      for (const listener of fixture.listeners) listener('SIGTERM');
      return { kind: 'written' };
    },
  });
  let failure: unknown;
  try {
    await Promise.race([
      running,
      Bun.sleep(3500).then(() => {
        throw new Error('denied signal was swallowed');
      }),
    ]);
  } catch (cause) {
    failure = cause;
  } finally {
    signal.mockRestore();
    if (pid !== undefined) kill(pid, 'SIGKILL');
    await Promise.allSettled([running]);
  }
  expect(failure).toBeInstanceOf(LintCleanupFailure);
  expect(fixture.listeners.size).toBe(0);
}, 10000);

function writeRole(root: string, entrypoint: string, source: string): void {
  writeFileSync(
    entrypoint,
    'import { writeFileSync as recordFixtureOwner } from "node:fs"; recordFixtureOwner(' +
      JSON.stringify(join(root, 'owned.pid')) +
      ', String(process.pid));\n' +
      source,
  );
}

it('preserves an output failure recorded before a later cancellation microtask', async () => {
  const fixture = createFixture('process.stdout.write("ready");setInterval(()=>undefined,1000);');
  const fault = new Error('output failed before cancellation');
  const outputs = createLintOutputs({
    stdout: () => ({
      write: () => {
        queueMicrotask(() => {
          for (const listener of fixture.listeners) listener('SIGTERM');
        });
        throw fault;
      },
      flush: () => 0,
      unref: () => undefined,
    }),
    stderr: () => ({ write: (bytes) => bytes.length, flush: () => 0, unref: () => undefined }),
    subscribeInterrupts: fixture.context.subscribeInterrupts,
  });
  try {
    const failure: unknown = await runLintChild({
      ...fixture.context,
      stdout: outputs.stdout,
      stderr: outputs.stderr,
      stage: 'snapshotter',
      stdin: undefined,
    }).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBe(fault);
  } finally {
    outputs.dispose();
  }
});

it('drains but never forwards child bytes emitted after cancellation', async () => {
  const fixture = createFixture(
    'process.on("SIGTERM",()=>{process.stdout.write("after cancellation");process.exitCode=0;clearInterval(timer);});const timer=setInterval(()=>undefined,1000);process.stdout.write("ready");',
  );
  const outcome = await runLintChild({
    ...fixture.context,
    stage: 'snapshotter',
    stdin: undefined,
    stdout: (bytes) => {
      const written = fixture.context.stdout(bytes);
      if (Buffer.from(bytes).toString().includes('ready'))
        for (const listener of fixture.listeners) listener('SIGTERM');
      return written;
    },
  });
  expect(outcome.status).toBe(143);
  expect(Buffer.concat(fixture.stdout).toString()).toBe('ready');
  expect(Buffer.from(outcome.stdout).toString()).toBe('ready');
});

it('honors cancellation returned by an output callback before native signal delivery', async () => {
  const fixture = createFixture('process.stdout.write("ready");setInterval(()=>undefined,1000);');
  const pending = runLintChild({
    ...fixture.context,
    stage: 'snapshotter',
    stdin: undefined,
    stdout: () => ({ kind: 'cancelled', signal: 'SIGTERM' }),
  });
  const expiry = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    expiry.reject(new Error('returned output cancellation was ignored'));
  }, 2000);
  try {
    const outcome = await Promise.race([pending, expiry.promise]);
    expect(outcome.kind).toBe('cancelled');
    expect(outcome.status).toBe(143);
    expect(fixture.listeners.size).toBe(0);
  } finally {
    clearTimeout(timer);
    const owner = join(fixture.root, 'owned.pid');
    if (existsSync(owner)) killOwned(-Number(readFileSync(owner, 'utf8')), 'SIGKILL');
    await Promise.allSettled([pending]);
  }
});
