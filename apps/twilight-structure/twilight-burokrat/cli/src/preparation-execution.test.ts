import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, expect, it, spyOn } from 'bun:test';

import * as interruptOwner from './lint-interrupts';
import * as outputOwner from './lint-output';
import { runPreparationOperation } from './preparation-execution';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function invoke(program: string) {
  const root = mkdtempSync(join(tmpdir(), 'puni preparation owner '));
  roots.push(root);
  const entry = join(root, 'owner.ts');
  writeFileSync(
    entry,
    'import{runPreparationOperation}from ' +
      JSON.stringify(join(import.meta.dir, 'preparation-execution.ts')) +
      ';' +
      program,
  );
  return Bun.spawnSync([...createLaunch(process.execPath, entry)], {
    cwd: root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
}

it('owns exact binary preparation output through flush and preserves the returned status', () => {
  const child = invoke(
    'const status=await runPreparationOperation(async({outputs})=>{await outputs.stdout(Uint8Array.from([0,255,10]));await outputs.stderr(Uint8Array.from([254,0,13]));return 37;});process.exit(status);',
  );
  expect(child.exitCode, child.stderr.toString()).toBe(37);
  expect(child.stdout).toEqual(Buffer.from([0, 255, 10]));
  expect(child.stderr).toEqual(Buffer.from([254, 0, 13]));
});

it('retains nested preparation cleanup identities and owned paths without automatic stacks', () => {
  const child = invoke(
    'const{PreparationFailure}=await import(' +
      JSON.stringify(join(import.meta.dir, 'policy/prepare-bun-toolkit.ts')) +
      ');const status=await runPreparationOperation(async()=>{throw new PreparationFailure(["/retained work","/retained activation"],"/retained work/archive.tar",new AggregateError([new Error("unconfirmed process group 7654321; retained scratch /retained scratch"),new Error("secondary close failure")],"preparation cleanup failed"));});process.exit(status);',
  );
  expect(child.exitCode).toBe(1);
  const diagnostic = child.stderr.toString();
  expect(diagnostic).toContain('puni preparation:');
  expect(diagnostic).toContain('/retained work');
  expect(diagnostic).toContain('/retained activation');
  expect(diagnostic).toContain('/retained work/archive.tar');
  expect(diagnostic).toContain(
    'unconfirmed process group 7654321; retained scratch /retained scratch',
  );
  expect(diagnostic).toContain('secondary close failure');
  expect(diagnostic).not.toContain('    at ');
});

it('preserves preparation failure one over previously recorded native cancellation', () => {
  const child = invoke(
    'const status=await runPreparationOperation(async()=>{process.emit("SIGTERM");throw new Error("controlled preparation failure");});process.exit(status);',
  );
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toContain('controlled preparation failure');
});

it('returns the first native preparation interruption after otherwise successful completion', () => {
  const child = invoke(
    'const status=await runPreparationOperation(async()=>{process.emit("SIGINT");process.emit("SIGTERM");return 0;});process.exit(status);',
  );
  expect(child.exitCode, child.stderr.toString()).toBe(130);
});

it('releases preparation native listeners before returning to a reusable caller', () => {
  const child = invoke(
    'const before=[process.listenerCount("SIGINT"),process.listenerCount("SIGTERM")];let during;const status=await runPreparationOperation(async()=>{during=[process.listenerCount("SIGINT"),process.listenerCount("SIGTERM")];return 0;});const after=[process.listenerCount("SIGINT"),process.listenerCount("SIGTERM")];process.stdout.write(JSON.stringify({status,before,during,after}));',
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  const observed = JSON.parse(child.stdout.toString()) as {
    status: number;
    before: number[];
    during: number[];
    after: number[];
  };
  expect(observed.status).toBe(0);
  expect(observed.after).toEqual(observed.before);
  expect(observed.during).toEqual(observed.before.map((count) => count + 1));
});

it('contains a failed preparation diagnostic writer without invoking the Bun reporter', () => {
  const child = invoke(
    'Bun.stderr.writer=()=>({write(){throw new Error("controlled diagnostic sink failure");},flush(){return 0;},unref(){}});const status=await runPreparationOperation(async()=>{throw new Error("controlled operation failure");});process.stdout.write(JSON.stringify({status}));process.exit(status);',
  );
  expect(child.exitCode).toBe(1);
  expect(child.stdout.toString()).toBe('{"status":1}');
  expect(child.stderr.length).toBe(0);
});

it('renders repeated nested error identities once without hanging on a cause cycle', async () => {
  const child = await invokeBounded(
    'const inner=new Error("shared cleanup identity");inner.cause=inner;const status=await runPreparationOperation(async()=>{throw new AggregateError([inner,inner],"outer cleanup failure");});process.exit(status);',
  );
  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString().split('shared cleanup identity').length - 1).toBe(1);
});

for (const boundary of ['outputs', 'subscription', 'interrupts'] as const) {
  it(
    'attempts every preparation teardown and returns failure after ' +
      boundary +
      ' release rejects',
    async () => {
      const nativeOutputs = outputOwner.createLintOutputs,
        nativeInterrupts = interruptOwner.createLintInterrupts;
      const attempts: string[] = [],
        diagnostics: string[] = [],
        before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
      const interrupts = spyOn(interruptOwner, 'createLintInterrupts').mockImplementation(() => {
        const owned = nativeInterrupts();
        let count = 0;
        return {
          ...owned,
          subscribe(listener) {
            const number = count++,
              release = owned.subscribe(listener);
            return () => {
              release();
              if (number === 0) {
                attempts.push('subscription');
                if (boundary === 'subscription')
                  throw new Error('controlled subscription release failure');
              }
            };
          },
          dispose() {
            owned.dispose();
            attempts.push('interrupts');
            if (boundary === 'interrupts') throw new Error('controlled interrupts release failure');
          },
        };
      });
      const outputs = spyOn(outputOwner, 'createLintOutputs').mockImplementation((context) => {
        const owned = nativeOutputs(context);
        return {
          ...owned,
          reportDiagnostic(bytes) {
            diagnostics.push(new TextDecoder().decode(bytes));
            return Promise.resolve({ kind: 'reported' as const });
          },
          dispose() {
            owned.dispose();
            attempts.push('outputs');
            if (boundary === 'outputs') throw new Error('controlled outputs release failure');
          },
        };
      });
      try {
        expect(await runPreparationOperation(() => Promise.resolve(0))).toBe(1);
        expect(attempts).toEqual(['outputs', 'subscription', 'interrupts']);
        expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(before);
        expect(diagnostics.join('')).toContain('controlled ' + boundary + ' release failure');
      } finally {
        outputs.mockRestore();
        interrupts.mockRestore();
      }
    },
  );
}

async function invokeBounded(program: string) {
  const root = mkdtempSync(join(tmpdir(), 'puni bounded preparation owner '));
  roots.push(root);
  const entry = join(root, 'owner.ts');
  writeFileSync(
    entry,
    'import{runPreparationOperation}from ' +
      JSON.stringify(join(import.meta.dir, 'preparation-execution.ts')) +
      ';' +
      program,
  );
  const child = Bun.spawn([...createLaunch(process.execPath, entry)], {
    cwd: root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = new Response(child.stdout).bytes(),
    stderr = new Response(child.stderr).bytes();
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, 1000);
  try {
    const [exitCode, outward, diagnostic] = await Promise.all([child.exited, stdout, stderr]);
    return { exitCode, stdout: Buffer.from(outward), stderr: Buffer.from(diagnostic) };
  } finally {
    clearTimeout(timer);
    child.kill('SIGKILL');
    await child.exited;
  }
}
