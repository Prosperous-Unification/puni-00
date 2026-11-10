import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, expect, it, spyOn } from 'bun:test';

import { PreparationFailure } from './policy/prepare-bun-toolkit';
import { disposeRelocationFixtures } from './policy/relocation-fixtures';
import { executePreparation } from './preparation-dispatch';
import { createRelocationFixture } from './testing/preparation-fixtures';

const roots: string[] = [];
afterAll(() => {
  disposeRelocationFixtures();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function captureOutputs() {
  const stdout: Uint8Array[] = [],
    diagnostics: Uint8Array[] = [];
  return {
    stdout,
    diagnostics,
    outputs: {
      stdout: (bytes: Uint8Array) => {
        stdout.push(bytes.slice());
        return Promise.resolve({ kind: 'written' as const });
      },
      stderr: (bytes: Uint8Array) => {
        diagnostics.push(bytes.slice());
        return Promise.resolve({ kind: 'written' as const });
      },
      reportDiagnostic: (bytes: Uint8Array) => {
        diagnostics.push(bytes.slice());
        return Promise.resolve({ kind: 'reported' as const });
      },
    },
  };
}

it('executes actual typed relocation and reports only after the archive settles', async () => {
  const fixture = await createRelocationFixture(roots),
    captured = captureOutputs();
  const status = await executePreparation(fixture.request, {
    ...fixture.context,
    outputs: captured.outputs,
  });
  expect(status).toBe(0);
  expect(Buffer.concat(captured.stdout).toString()).toContain(fixture.revision);
  expect(Buffer.concat(captured.stdout).toString().endsWith('\n')).toBe(true);
  expect(readdirSync(fixture.request.work).some((path) => path.endsWith('.tar'))).toBe(true);
  expect(captured.diagnostics.length).toBe(0);
  expect(fixture.listeners.size).toBe(0);
}, 60000);

it('returns prior typed preparation cancellation without success output or new roots', async () => {
  const fixture = await createRelocationFixture(roots),
    captured = captureOutputs();
  fixture.interrupt('SIGINT');
  expect(
    await executePreparation(fixture.request, { ...fixture.context, outputs: captured.outputs }),
  ).toBe(130);
  expect(captured.stdout.length).toBe(0);
  expect(existsSync(fixture.request.work)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
}, 60000);

it('preserves preparation failure and retained outputs for the borrowed caller owner', async () => {
  const fixture = await createRelocationFixture(roots, { certified: false }),
    captured = captureOutputs();
  const cause: unknown = await executePreparation(fixture.request, {
    ...fixture.context,
    outputs: captured.outputs,
  }).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(PreparationFailure);
  if (!(cause instanceof PreparationFailure)) throw new Error('missing preparation failure');
  expect(cause.ownedDirectories).toEqual([fixture.request.work, fixture.request.destination]);
  expect(cause.archive).toBeUndefined();
  expect(String(cause.cause)).toContain('prepared activation is not certified');
  expect(captured.stdout.length).toBe(0);
}, 60000);

it('reports owned materialization before returning controlled build cancellation', async () => {
  const fixture = await createRelocationFixture(roots),
    captured = captureOutputs(),
    original = Bun.build.bind(Bun);
  let calls = 0;
  const build = spyOn(Bun, 'build').mockImplementation(async (options) => {
    const built = await original(options);
    if (++calls === 1) fixture.interrupt('SIGTERM');
    return built;
  });
  try {
    expect(
      await executePreparation(fixture.request, { ...fixture.context, outputs: captured.outputs }),
    ).toBe(143);
    expect(captured.stdout.length).toBe(0);
    expect(Buffer.concat(captured.diagnostics).toString()).toContain(fixture.request.work);
    expect(existsSync(join(fixture.request.work, 'candidate-source'))).toBe(true);
    expect(calls).toBe(1);
  } finally {
    build.mockRestore();
  }
}, 60000);

it('retains a completed archive when outward preparation success reporting is cancelled', async () => {
  const fixture = await createRelocationFixture(roots),
    captured = captureOutputs();
  const outputs = {
    ...captured.outputs,
    stdout: (_bytes: Uint8Array) => {
      fixture.interrupt('SIGINT');
      return Promise.resolve({ kind: 'cancelled' as const, signal: 'SIGINT' as const });
    },
  };
  expect(await executePreparation(fixture.request, { ...fixture.context, outputs })).toBe(130);
  const diagnostic = Buffer.concat(captured.diagnostics).toString();
  expect(diagnostic).toContain(fixture.request.work);
  expect(diagnostic).toContain(fixture.request.destination);
  expect(diagnostic).toContain('.tar');
  expect(readdirSync(fixture.request.work).some((path) => path.endsWith('.tar'))).toBe(true);
}, 60000);

it('returns failure when retained-output cancellation diagnostics cannot be delivered', async () => {
  const fixture = await createRelocationFixture(roots),
    captured = captureOutputs();
  const outputs = {
    ...captured.outputs,
    stdout: (_bytes: Uint8Array) =>
      Promise.resolve({ kind: 'cancelled' as const, signal: 'SIGTERM' as const }),
    reportDiagnostic: (_bytes: Uint8Array) =>
      Promise.resolve({
        kind: 'abandoned' as const,
        cause: new Error('controlled retention diagnostic failure'),
      }),
  };
  expect(await executePreparation(fixture.request, { ...fixture.context, outputs })).toBe(1);
  expect(readdirSync(fixture.request.work).some((path) => path.endsWith('.tar'))).toBe(true);
}, 60000);

it('retains every completed output in the native owner diagnostic when stdout rejects', async () => {
  const fixture = await createRelocationFixture(roots),
    entry = join(fixture.root, 'rejected-output.ts');
  writeFileSync(
    entry,
    'import{runPreparationOperation}from ' +
      JSON.stringify(join(import.meta.dir, 'preparation-execution.ts')) +
      ';import{executePreparation}from ' +
      JSON.stringify(join(import.meta.dir, 'preparation-dispatch.ts')) +
      ';import{createLaunch}from ' +
      JSON.stringify(
        join(import.meta.dir, '../../../../../libs/shared/adapters/bun-startup/src/index.ts'),
      ) +
      ';const request=' +
      JSON.stringify(fixture.request) +
      ';const context=' +
      JSON.stringify({
        callerDirectory: fixture.context.callerDirectory,
        toolkitDirectory: fixture.context.toolkitDirectory,
        expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
        runtime: fixture.context.runtime,
      }) +
      ';const status=await runPreparationOperation(async execution=>await executePreparation(request,{...context,...execution,launch:entry=>createLaunch(process.execPath,entry),outputs:{...execution.outputs,stdout:()=>Promise.reject(new Error("controlled completed stdout failure"))}}));process.exit(status);',
  );
  const child = Bun.spawnSync([...createLaunch(process.execPath, entry)], {
    cwd: fixture.root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15000,
  });
  expect(child.exitCode).toBe(1);
  const diagnostic = child.stderr.toString();
  expect(diagnostic).toContain('controlled completed stdout failure');
  expect(diagnostic).toContain(fixture.request.work);
  expect(diagnostic).toContain(fixture.request.destination);
  expect(diagnostic).toContain('puni-activation-' + fixture.revision.slice(0, 8) + '.tar');
  expect(readdirSync(fixture.request.work).some((path) => path.endsWith('.tar'))).toBe(true);
  expect(child.stdout.length).toBe(0);
}, 60000);

for (const stage of ['build', 'completed-output'] as const) {
  it(
    'retains ' + stage + ' outputs when cancellation diagnostics reject',
    async () => {
      const fixture = await createRelocationFixture(roots),
        captured = captureOutputs(),
        fault = new Error('controlled cancellation diagnostic rejection');
      const original = Bun.build.bind(Bun);
      let calls = 0;
      const build = spyOn(Bun, 'build').mockImplementation(async (options) => {
        const built = await original(options);
        if (stage === 'build' && ++calls === 1) fixture.interrupt('SIGINT');
        return built;
      });
      const outputs = {
        ...captured.outputs,
        stdout: (_bytes: Uint8Array) =>
          Promise.resolve({ kind: 'cancelled' as const, signal: 'SIGINT' as const }),
        reportDiagnostic: (_bytes: Uint8Array) => Promise.reject(fault),
      };
      try {
        const cause: unknown = await executePreparation(fixture.request, {
          ...fixture.context,
          outputs,
        }).then(
          () => undefined,
          (failure: unknown) => failure,
        );
        expect(cause).toBeInstanceOf(PreparationFailure);
        if (!(cause instanceof PreparationFailure))
          throw new Error('missing cancellation reporting failure');
        expect(cause.cause).toBe(fault);
        expect(cause.ownedDirectories).toEqual(
          stage === 'build'
            ? [fixture.request.work]
            : [fixture.request.work, fixture.request.destination],
        );
        if (stage === 'build') expect(cause.archive).toBeUndefined();
        else {
          expect(cause.archive).toBeString();
          if (cause.archive === undefined) throw new Error('completed archive lost');
          expect(existsSync(cause.archive)).toBe(true);
        }
      } finally {
        build.mockRestore();
      }
    },
    60000,
  );
}
