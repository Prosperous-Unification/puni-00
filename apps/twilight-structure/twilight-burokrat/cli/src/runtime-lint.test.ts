import { Buffer } from 'node:buffer';
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'bun:test';

import { packageManifestBytes } from './packaging/manifest';
import { buildLintLauncher } from './policy/build-lint-launcher';
import * as runtime from './runtime-facade';
import { createInstalledLintFixture } from './testing/installed-lint-fixtures';
import { decodeRequest } from './validator-request';

let launcher: Uint8Array;
const roots: string[] = [];
beforeAll(async () => {
  launcher = await buildLintLauncher();
});
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createFixture(
  validator: string | ((root: string) => string),
  snapshotter?: string | ((root: string) => string),
) {
  const fixture = createInstalledLintFixture(launcher, validator, snapshotter);
  roots.push(fixture.root);
  return fixture;
}
async function assertRefusal(pending: Promise<unknown>, diagnostic: string): Promise<void> {
  const refusal: unknown = await pending.then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('expected an Error refusal');
  expect(refusal.message).toContain(diagnostic);
}

describe('installed Bun lint typed execution', () => {
  it('executes the delivered package launcher and preserves both binary streams and status37', async () => {
    const fixture = createFixture(
      'process.stdout.write(Buffer.from([0,255,65,10])); process.stderr.write(Buffer.from([0,254,66,10])); process.exitCode=37;',
    );
    expect(await runtime.executeLint(fixture.invocation.request, fixture.context)).toBe(37);
    expect(Buffer.concat(fixture.stdout)).toEqual(Buffer.from([0, 255, 65, 10]));
    expect(Buffer.concat(fixture.stderr)).toEqual(Buffer.from([0, 254, 66, 10]));
    expect(fixture.launches).toEqual([join(fixture.toolkit, 'launcher.mjs')]);
    expect(readdirSync(fixture.scratch)).toEqual([]);
  });
  for (const kind of ['working', 'staged', 'committed'] as const) {
    it(
      'maps typed ' + kind + ' through the actual selected snapshotter and captured validator',
      async () => {
        const fixture = createFixture('process.stdout.write(await Bun.stdin.text());');
        expect(
          await runtime.executeLint({ ...fixture.invocation.request, kind }, fixture.context),
        ).toBe(0);
        const invocation = decodeRequest(Buffer.concat(fixture.stdout));
        expect(invocation.callerDirectory).toBe(fixture.root);
        expect(invocation.request).toMatchObject({
          command: kind === 'committed' ? 'lint-ci' : 'lint-local',
          kind,
          repository: fixture.candidate,
          revision: 'opaque revision',
        });
        if (kind !== 'committed')
          expect(invocation.request).toMatchObject({
            mode: kind === 'working' ? 'observe' : 'ratchet',
          });
        expect(Buffer.concat(fixture.stderr)).toEqual(Buffer.alloc(0));
      },
    );
  }
  it('takes the default closure from the configured archive rather than the installed toolkit', async () => {
    const fixture = createFixture(
      'process.stdout.write(process.env.TOOL_WIKI_TRUSTED_NODE_MODULES);',
    );
    expect(await runtime.executeLint(fixture.invocation.request, fixture.context)).toBe(0);
    expect(Buffer.concat(fixture.stdout).toString()).toBe(
      join(fixture.archive, 'trusted-node-modules'),
    );
    expect(Buffer.concat(fixture.stdout).toString()).not.toBe(fixture.closure);
  });
  it('retains caller-relative repository and activation operands while launcher cwd is external', async () => {
    const fixture = createFixture('process.stdout.write(await Bun.stdin.text());');
    fixture.context.activationRoot = 'archive';
    expect(
      await runtime.executeLint(
        { ...fixture.invocation.request, repository: 'candidate' },
        fixture.context,
      ),
    ).toBe(0);
    expect(decodeRequest(Buffer.concat(fixture.stdout)).request).toMatchObject({
      repository: fixture.candidate,
    });
  });
  it('returns optional inactive output only through the delivered verified launcher', async () => {
    const fixture = createFixture('throw new Error("inactive must not execute validator");');
    fixture.context.activationRoot = undefined;
    expect(await runtime.executeLint(fixture.invocation.request, fixture.context)).toBe(0);
    expect(Buffer.concat(fixture.stdout).toString()).toBe(
      JSON.stringify({
        schemaVersion: 1,
        status: 'inactive',
        certified: false,
        reason: 'external activation root is not provisioned',
      }) + '\n',
    );
    expect(fixture.launches).toEqual([join(fixture.toolkit, 'launcher.mjs')]);
    expect(readdirSync(fixture.scratch)).toEqual([]);
  });
  it('refuses a substituted package identity before optional inactivity and launcher execution', async () => {
    const fixture = createFixture('throw new Error("must not execute validator");');
    fixture.context.activationRoot = undefined;
    writeFileSync(fixture.manifest, packageManifestBytes('a'.repeat(40), 'b'.repeat(64)));
    await assertRefusal(
      runtime.executeLint(fixture.invocation.request, fixture.context),
      'installed toolkit differs from package manifest',
    );
    expect(fixture.launches).toEqual([]);
    expect(fixture.stdout).toEqual([]);
  });
  it('refuses altered toolkit role bytes before optional inactivity and launcher execution', async () => {
    const fixture = createFixture('throw new Error("must not execute validator");');
    fixture.context.activationRoot = undefined;
    writeFileSync(join(fixture.toolkit, 'validator.mjs'), 'substitution');
    await assertRefusal(
      runtime.executeLint(fixture.invocation.request, fixture.context),
      'toolkit role differs from toolkit.json',
    );
    expect(fixture.launches).toEqual([]);
    expect(fixture.stdout).toEqual([]);
  });
  it('refuses candidate-contained installation before optional inactivity and launcher execution', async () => {
    const fixture = createFixture('throw new Error("must not execute validator");');
    fixture.context.activationRoot = undefined;
    const local = join(fixture.candidate, 'installation');
    renameSync(fixture.installedDirectory, local);
    fixture.context.installedDirectory = local;
    await assertRefusal(
      runtime.executeLint(fixture.invocation.request, fixture.context),
      'installation must be outside the candidate repository',
    );
    expect(fixture.launches).toEqual([]);
    expect(fixture.stdout).toEqual([]);
  });
  it('refuses a candidate-targeted launcher with unchanged bytes before optional inactivity', async () => {
    const fixture = createFixture('throw new Error("must not execute validator");');
    fixture.context.activationRoot = undefined;
    const installed = join(fixture.toolkit, 'launcher.mjs');
    const candidate = join(fixture.candidate, 'launcher.mjs');
    renameSync(installed, candidate);
    symlinkSync(candidate, installed);
    await assertRefusal(
      runtime.executeLint(fixture.invocation.request, fixture.context),
      'launcher.mjs must be outside the candidate repository',
    );
    expect(fixture.launches).toEqual([]);
    expect(fixture.stdout).toEqual([]);
  });
  it('preserves required certificate refusal status78 and its report bytes', async () => {
    const fixture = createFixture('process.stdout.write("{}\\n");');
    fixture.context.required = true;
    expect(await runtime.executeLint(fixture.invocation.request, fixture.context)).toBe(78);
    expect(Buffer.concat(fixture.stdout).toString()).toBe('{}\n');
    expect(Buffer.concat(fixture.stderr).toString()).toContain(
      'required admission did not return certified enforce output',
    );
  });
  it('accepts the complete enforce certificate under required admission', async () => {
    const report = {
      schemaVersion: 1,
      mode: 'enforce',
      trustProvenance: 'ci-preselected',
      accepted: true,
      certified: true,
    };
    const fixture = createFixture(
      'process.stdout.write(' + JSON.stringify(JSON.stringify(report)) + ');',
    );
    fixture.context.required = true;
    expect(
      await runtime.executeLint(
        { ...fixture.invocation.request, kind: 'committed' },
        fixture.context,
      ),
    ).toBe(0);
    expect(Buffer.concat(fixture.stdout).toString()).toBe(JSON.stringify(report));
  });
  it('returns recorded cancellation before any installed launcher can start', async () => {
    const fixture = createFixture('throw new Error("must not execute validator");');
    fixture.interrupt('SIGTERM');
    expect(await runtime.executeLint(fixture.invocation.request, fixture.context)).toBe(143);
    expect(fixture.launches).toEqual([]);
    expect(fixture.stdout).toEqual([]);
    expect(fixture.stderr).toEqual([]);
  });
});

async function waitPath(path: string): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (existsSync(path)) return;
    await Bun.sleep(5);
  }
  throw new Error('owned fixture path did not appear: ' + path);
}
async function settleOwner<T>(pending: Promise<T>, milliseconds = 6000): Promise<T> {
  const expiry = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    expiry.reject(new Error('installed owner did not settle'));
  }, milliseconds);
  try {
    return await Promise.race([pending, expiry.promise]);
  } finally {
    clearTimeout(timer);
  }
}
function assertGone(pid: number): void {
  try {
    process.kill(-pid, 0);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') return;
    throw cause;
  }
  throw new Error('owned fixture group remains');
}
function usePreload<Context extends ReturnType<typeof createFixture>['context']>(
  context: Context,
  preload: string,
) {
  const launch = context.launch;
  return {
    ...context,
    launch(entrypoint: string): readonly string[] {
      const argv = launch(entrypoint);
      return [...argv.slice(0, -1), '--preload', preload, entrypoint];
    },
  };
}
async function cleanupOwner(
  fixture: ReturnType<typeof createFixture>,
  pending: Promise<unknown>,
): Promise<void> {
  let hasSettled = false;
  const settled = pending.then(
    () => {
      hasSettled = true;
    },
    () => {
      hasSettled = true;
    },
  );
  function isSettled(): boolean {
    return hasSettled;
  }
  await Promise.resolve();
  if (!isSettled()) {
    fixture.interrupt('SIGTERM');
    await Promise.race([settled, Bun.sleep(2500)]);
  }
  if (!isSettled()) {
    for (const name of ['stage.pid', 'launcher.pid']) {
      const path = join(fixture.root, name);
      if (existsSync(path)) {
        try {
          process.kill(-Number(readFileSync(path, 'utf8')), 'SIGKILL');
        } catch (cause) {
          if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
        }
      }
    }
    await settleOwner(settled, 3000);
  }
}

describe('actual installed parent nested ownership', () => {
  for (const signals of [
    ['SIGINT', 'SIGTERM'],
    ['SIGTERM', 'SIGINT'],
    ['SIGINT', 'SIGINT'],
  ] as const) {
    it(
      'queues startup ' + signals.join('/') + ' without native coalescing or reason reversal',
      async () => {
        const fixture = createFixture(
          (root) =>
            'import{writeFileSync}from"node:fs";writeFileSync(' +
            JSON.stringify(join(root, 'stage.pid')) +
            ',String(process.pid));',
        );
        const preload = join(fixture.root, 'delay-start.mjs');
        const parent = join(fixture.root, 'launcher.pid');
        writeFileSync(
          preload,
          'import{writeFileSync}from"node:fs";writeFileSync(' +
            JSON.stringify(parent) +
            ',String(process.pid));await Bun.sleep(200);',
        );
        const pending = runtime.executeLint(
          fixture.invocation.request,
          usePreload(fixture.context, preload),
        );
        try {
          await waitPath(parent);
          for (const signal of signals) fixture.interrupt(signal);
          expect(await settleOwner(pending)).toBe(signals[0] === 'SIGINT' ? 130 : 143);
          expect(existsSync(join(fixture.root, 'stage.pid'))).toBe(false);
          expect(fixture.stdout).toEqual([]);
          expect(fixture.stderr).toEqual([]);
          expect(readdirSync(fixture.scratch)).toEqual([]);
        } finally {
          await cleanupOwner(fixture, pending);
        }
      },
    );
  }
  it('cancels its actual snapshotter before the validator can start', async () => {
    const fixture = createFixture(
      (root) =>
        'import{writeFileSync}from"node:fs";writeFileSync(' +
        JSON.stringify(join(root, 'validator-ran')) +
        ',"ran");',
      (root) =>
        'import{writeFileSync}from"node:fs";process.on("SIGTERM",()=>undefined);writeFileSync(' +
        JSON.stringify(join(root, 'stage.pid')) +
        ',String(process.pid));setInterval(()=>undefined,1000);',
    );
    const pending = runtime.executeLint(fixture.invocation.request, fixture.context);
    try {
      await waitPath(join(fixture.root, 'stage.pid'));
      fixture.interrupt('SIGTERM');
      expect(await settleOwner(pending)).toBe(143);
      assertGone(Number(readFileSync(join(fixture.root, 'stage.pid'), 'utf8')));
      expect(existsSync(join(fixture.root, 'validator-ran'))).toBe(false);
      expect(readdirSync(fixture.scratch)).toEqual([]);
    } finally {
      await cleanupOwner(fixture, pending);
    }
  });
  for (const repeated of [false, true]) {
    it(
      'preserves grandchild grace and ' +
        (repeated ? 'immediate repeated escalation' : 'bounded first-signal cleanup') +
        ' through the actual parent',
      async () => {
        const fixture = createFixture((root) => {
          const grand =
            'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>{writeFileSync(' +
            JSON.stringify(join(root, 'grand-signal')) +
            ',"SIGINT");setTimeout(()=>process.exit(0),150);});writeFileSync(' +
            JSON.stringify(join(root, 'grand.pid')) +
            ',String(process.pid));setInterval(()=>undefined,1000);';
          return (
            'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);process.on("SIGTERM",()=>undefined);const grand=Bun.spawn([process.execPath,"--no-env-file","--config=/dev/null","--eval",' +
            JSON.stringify(grand) +
            '],{stdin:"ignore",stdout:"ignore",stderr:"ignore"});void grand.exited.then(()=>writeFileSync(' +
            JSON.stringify(join(root, 'grand-reaped')) +
            ',"reaped"));writeFileSync(' +
            JSON.stringify(join(root, 'stage.pid')) +
            ',String(process.pid));setInterval(()=>undefined,1000);'
          );
        });
        const pending = runtime.executeLint(fixture.invocation.request, fixture.context);
        try {
          await waitPath(join(fixture.root, 'grand.pid'));
          fixture.interrupt('SIGINT');
          await waitPath(join(fixture.root, 'grand-reaped'));
          if (repeated) fixture.interrupt('SIGTERM');
          expect(await settleOwner(pending, repeated ? 650 : 6000)).toBe(130);
          expect(readFileSync(join(fixture.root, 'grand-signal'), 'utf8')).toBe('SIGINT');
          assertGone(Number(readFileSync(join(fixture.root, 'stage.pid'), 'utf8')));
          expect(readdirSync(fixture.scratch)).toEqual([]);
        } finally {
          await cleanupOwner(fixture, pending);
        }
      },
    );
  }
  for (const abandoned of [false, true]) {
    it(
      'retains normal exit1 and ' +
        (abandoned ? 'abandoned diagnostic bytes' : 'visible PID/scratch diagnostics') +
        ' after cancellation',
      async () => {
        const fixture = createFixture(
          (root) =>
            'import{writeFileSync}from"node:fs";process.on("SIGINT",()=>undefined);process.stderr.write("already-delivered\\n");writeFileSync(' +
            JSON.stringify(join(root, 'stage.pid')) +
            ',String(process.pid));setInterval(()=>undefined,1000);',
        );
        const preload = join(fixture.root, 'fault-absence.mjs');
        const stage = join(fixture.root, 'stage.pid');
        writeFileSync(
          preload,
          'import{writeFileSync,readFileSync,existsSync}from"node:fs";writeFileSync(' +
            JSON.stringify(join(fixture.root, 'launcher.pid')) +
            ',String(process.pid));const nativeKill=process.kill.bind(process);process.kill=(pid,signal)=>{if(signal===0&&pid<0&&existsSync(' +
            JSON.stringify(stage) +
            ')&&-pid===Number(readFileSync(' +
            JSON.stringify(stage) +
            ',"utf8")))return true;return nativeKill(pid,signal);};',
        );
        const diagnostics: Uint8Array[] = [];
        const diagnosticFailure = new Error('controlled terminal diagnostic abandonment');
        const context = usePreload(
          {
            ...fixture.context,
            reportDiagnostic: (bytes: Uint8Array) => {
              diagnostics.push(bytes.slice());
              return Promise.resolve(
                abandoned
                  ? { kind: 'abandoned' as const, cause: diagnosticFailure }
                  : { kind: 'reported' as const },
              );
            },
          },
          preload,
        );
        const pending = runtime.executeLint(fixture.invocation.request, context);
        try {
          await waitPath(stage);
          for (let attempt = 0; attempt < 500 && fixture.stderr.length === 0; attempt++)
            await Bun.sleep(5);
          expect(Buffer.concat(fixture.stderr).toString()).toBe('already-delivered\n');
          fixture.interrupt('SIGINT');
          const outcome = await settleOwner(
            pending.then(
              (status) => ({ kind: 'returned' as const, status }),
              (cause: unknown) => ({ kind: 'threw' as const, cause }),
            ),
          );
          assertGone(Number(readFileSync(stage, 'utf8')));
          const retained = readdirSync(fixture.scratch);
          expect(retained).toHaveLength(1);
          const diagnostic = Buffer.concat(diagnostics).toString();
          expect(diagnostic).toContain('process group ' + readFileSync(stage, 'utf8'));
          expect(diagnostic).toContain('retained scratch: ' + join(fixture.scratch, retained[0]));
          expect(diagnostic).not.toContain('already-delivered');
          if (abandoned) {
            expect(outcome.kind).toBe('threw');
            if (outcome.kind !== 'threw' || !(outcome.cause instanceof Error))
              throw new Error('expected retained diagnostic failure');
            expect(outcome.cause.message).toContain('retained scratch:');
          } else expect(outcome).toEqual({ kind: 'returned', status: 1 });
        } finally {
          await cleanupOwner(fixture, pending);
        }
      },
      12000,
    );
  }
  it('preserves the first output failure and releases a simultaneously stalled peer before cleanup', async () => {
    const fixture = createFixture(
      (root) =>
        'import{writeFileSync}from"node:fs";process.on("SIGTERM",()=>undefined);writeFileSync(' +
        JSON.stringify(join(root, 'stage.pid')) +
        ',String(process.pid));process.stderr.write("peer-started");await Bun.sleep(100);process.stdout.write("fail-now");setInterval(()=>undefined,1000);',
    );
    let hasPeerStarted = false;
    const outputFailure = new Error('controlled outward write failure');
    const pending = runtime.executeLint(fixture.invocation.request, {
      ...fixture.context,
      stdout: () => {
        throw outputFailure;
      },
      stderr: () => {
        hasPeerStarted = true;
        return new Promise<never>(() => undefined);
      },
    });
    try {
      const refusal: unknown = await settleOwner(
        pending.then(
          () => undefined,
          (cause: unknown) => cause,
        ),
      );
      expect(hasPeerStarted).toBe(true);
      expect(refusal).toBeInstanceOf(AggregateError);
      if (!(refusal instanceof AggregateError)) throw new Error('expected owned output failure');
      expect(refusal.errors[0]).toBe(outputFailure);
      assertGone(Number(readFileSync(join(fixture.root, 'stage.pid'), 'utf8')));
      expect(readdirSync(fixture.scratch)).toEqual([]);
    } finally {
      await cleanupOwner(fixture, pending);
    }
  }, 12000);
});

for (const status of [0, 1] as const) {
  it(
    'preserves terminal ' +
      String(status) +
      ' semantics when cancellation abandons outward bytes after launcher exit',
    async () => {
      const fixture = createFixture(
        'process.stdout.write("finished-before-outward-write");process.exitCode=' +
          String(status) +
          ';',
      );
      const exited = join(fixture.root, 'launcher-exited');
      const preload = join(fixture.root, 'observe-exit.mjs');
      writeFileSync(
        preload,
        'import{writeFileSync}from"node:fs";process.on("exit",status=>writeFileSync(' +
          JSON.stringify(exited) +
          ',String(status)));',
      );
      const output = Promise.withResolvers<{ kind: 'cancelled'; signal: 'SIGINT' | 'SIGTERM' }>();
      const unsubscribe = fixture.context.subscribeInterrupts((signal) => {
        output.resolve({ kind: 'cancelled', signal });
      });
      const diagnostics: Uint8Array[] = [];
      const pending = runtime.executeLint(
        fixture.invocation.request,
        usePreload(
          {
            ...fixture.context,
            stdout: () => output.promise,
            reportDiagnostic: (bytes: Uint8Array) => {
              diagnostics.push(bytes.slice());
              return Promise.resolve({ kind: 'reported' as const });
            },
          },
          preload,
        ),
      );
      try {
        await waitPath(exited);
        expect(readFileSync(exited, 'utf8')).toBe(String(status));
        fixture.interrupt('SIGINT');
        fixture.interrupt('SIGTERM');
        expect(await settleOwner(pending)).toBe(status === 0 ? 130 : 1);
        expect(diagnostics).toEqual([]);
      } finally {
        unsubscribe();
        await cleanupOwner(fixture, pending);
      }
    },
  );
}

it('preserves full large binary stdout/stderr and status37 through the actual installed chain', async () => {
  const length = 1024 * 1024;
  const fixture = createFixture(
    'process.stdout.write(Buffer.alloc(1024*1024,253));process.stderr.write(Buffer.alloc(1024*1024,254));process.exitCode=37;',
  );
  expect(await runtime.executeLint(fixture.invocation.request, fixture.context)).toBe(37);
  expect(Buffer.concat(fixture.stdout)).toEqual(Buffer.alloc(length, 253));
  expect(Buffer.concat(fixture.stderr)).toEqual(Buffer.alloc(length, 254));
});

it('refuses a controlled v1-only launcher before its operation marker and never retries standalone mode', async () => {
  const fixture = createFixture('throw new Error("must not execute validator");');
  const marker = join(fixture.root, 'old-launcher-operated');
  const source =
    'import{writeFileSync}from"node:fs";const argv=process.argv.slice(2);if(argv.length!==1||argv[0]!=="--puni-lint-v1"){process.stderr.write("unsupported older lint mode\\n");process.exit(64);}writeFileSync(' +
    JSON.stringify(marker) +
    ',"operated");';
  fixture.writeLauncher(new TextEncoder().encode(source));
  const refusal: unknown = await runtime
    .executeLint(fixture.invocation.request, fixture.context)
    .then(
      () => undefined,
      (cause: unknown) => cause,
    );
  expect(refusal).toBeInstanceOf(AggregateError);
  expect(existsSync(marker)).toBe(false);
  expect(fixture.launches).toEqual([join(fixture.toolkit, 'launcher.mjs')]);
});

for (const notice of [
  'unknown',
  'duplicate-ready',
  'early-finished',
  'duplicate-finished',
  'premature-disconnect',
] as const) {
  it('refuses actual launcher ' + notice + ' notices despite a normal native exit0', async () => {
    const fixture = createFixture('throw new Error("must not execute a role");');
    const program = [
      'const mode=' + JSON.stringify(notice) + ';let started=false;',
      'process.on("disconnect",()=>process.exit(0));',
      'process.on("message",message=>{if(message!=="puni-lint-start-v1"||started)return;started=true;if(mode==="duplicate-ready")process.send("puni-lint-ready-v1");if(mode==="premature-disconnect"){process.disconnect();setTimeout(()=>process.exit(0),20);return;}process.send("puni-lint-finished-v1");if(mode==="duplicate-finished")process.send("puni-lint-finished-v1");setTimeout(()=>process.exit(0),30);});',
      'if(mode==="unknown")process.send({untrusted:"do-not-echo"});else if(mode==="early-finished")process.send("puni-lint-finished-v1");else process.send("puni-lint-ready-v1");',
    ].join('\n');
    fixture.writeLauncher(new TextEncoder().encode(program));
    const refusal: unknown = await settleOwner(
      runtime.executeLint(fixture.invocation.request, fixture.context).then(
        () => undefined,
        (cause: unknown) => cause,
      ),
    );
    expect(refusal).toBeInstanceOf(AggregateError);
    if (!(refusal instanceof AggregateError)) throw new Error('expected owned control refusal');
    expect(
      refusal.errors.some(
        (cause: unknown) =>
          cause instanceof Error &&
          /invalid installed lint launcher notice|control channel closed before lifecycle completion/.test(
            cause.message,
          ),
      ),
    ).toBe(true);
    expect(String(refusal)).not.toContain('do-not-echo');
    expect(readdirSync(fixture.scratch)).toEqual([]);
  });
}

it('passes only frozen environment and caller-anchored scratch with explicit activation and closure to the actual installed launcher', async () => {
  const fixture = createFixture('throw new Error("must not execute a role");');
  const program =
    'process.on("message",message=>{if(message!=="puni-lint-start-v1")return;process.stdout.write(JSON.stringify({cwd:process.cwd(),environment:process.env}));process.send("puni-lint-finished-v1");setTimeout(()=>process.exit(0),20);});process.send("puni-lint-ready-v1");';
  fixture.writeLauncher(new TextEncoder().encode(program));
  const before = process.env['PUNI_TEST_AMBIENT_SENTINEL'];
  process.env['PUNI_TEST_AMBIENT_SENTINEL'] = 'must-be-erased';
  try {
    expect(
      await runtime.executeLint(fixture.invocation.request, {
        ...fixture.context,
        scratchDirectory: 'scratch relative',
        activationRoot: 'activation relative',
        trustedNodeModules: 'closure relative',
        required: true,
      }),
    ).toBe(0);
    const observed: unknown = JSON.parse(Buffer.concat(fixture.stdout).toString());
    expect(observed).toEqual({
      cwd: fixture.toolkit,
      environment: {
        ...fixture.context.runtime.environment,
        TOOL_WIKI_REQUIRE_CERTIFIED: '1',
        TOOL_WIKI_ACTIVATION_ROOT: 'activation relative',
        TOOL_WIKI_TRUSTED_NODE_MODULES: 'closure relative',
        TMPDIR: join(fixture.root, 'scratch relative'),
      },
    });
  } finally {
    if (before === undefined) delete process.env['PUNI_TEST_AMBIENT_SENTINEL'];
    else process.env['PUNI_TEST_AMBIENT_SENTINEL'] = before;
  }
});
it('propagates a refused protected launch capability without launching the installed executable', async () => {
  const fixture = createFixture('throw new Error("must not execute a role");');
  const failure = new Error('controlled launch refusal');
  let captured: string | undefined;
  const refusal: unknown = await runtime
    .executeLint(fixture.invocation.request, {
      ...fixture.context,
      launch: (entrypoint) => {
        captured = entrypoint;
        throw failure;
      },
    })
    .then(
      () => undefined,
      (cause: unknown) => cause,
    );
  expect(refusal).toBe(failure);
  expect(captured).toBe(join(fixture.toolkit, 'launcher.mjs'));
  expect(fixture.launches).toEqual([]);
  expect(readdirSync(fixture.scratch)).toEqual([]);
});
