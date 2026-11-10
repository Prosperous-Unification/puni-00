import * as filesystem from 'node:fs';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as promises from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterAll, expect, it, spyOn } from 'bun:test';

import * as installed from '../packaging/installed';
import { readInstalledPuniToolkit } from '../packaging/installed';
import { createToolkitProducerFixture } from '../testing/toolkit-producer-fixture';
import { buildPuniAssets, ToolkitBuildFailure } from './build-bun-toolkit';
import { captureCommittedSource } from './committed-source';
import * as operator from './preparation-inputs';
const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it('delivers the coordinated package programs beside their strict current manifest and five-role toolkit', async () => {
  const fixture = await createToolkitProducerFixture(roots);
  for (const [path, marker] of [
    ['apps/puni/cli/src/entrypoint.ts', 'captured-root'],
    [
      'apps/twilight-structure/twilight-dash/cli/src/activation/observation-service-cli.ts',
      'captured-observation',
    ],
  ] as const) {
    const target = join(fixture.repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'console.log(' + JSON.stringify(marker) + ');');
  }
  function git(args: string[]) {
    const child = Bun.spawnSync(['/usr/bin/git', '-C', fixture.repository, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return child.stdout.toString().trim();
  }
  git(['add', '--all']);
  git(['commit', '-m', 'coordinated root assets']);
  const revision = git(['rev-parse', 'HEAD']);
  const captured = await captureCommittedSource(revision, {
    repository: fixture.repository,
    runtime: fixture.context.runtime,
    subscribeInterrupts: fixture.context.subscribeInterrupts,
  });
  if (captured.kind !== 'captured') throw new Error('asset fixture capture cancelled');
  const built = await buildPuniAssets(
    captured.source,
    { work: fixture.request.work, destination: fixture.request.destination },
    fixture.context,
  );
  if (built.kind !== 'built') throw new Error('asset fixture build cancelled');
  const dist = join(fixture.request.destination, 'dist');
  expect(built.toolkit.directory).toBe(join(dist, 'toolkit'));
  expect(readInstalledPuniToolkit(dist, join(dist, 'toolkit')).sourceRevision).toBe(revision);
  expect(JSON.parse(readFileSync(join(dist, 'package-manifest.json'), 'utf8'))).toEqual({
    schemaVersion: 1,
    packageVersion: '0.3.0',
    sourceRevision: revision,
    toolkitIdentity: built.toolkit.digest,
  });
  for (const [program, marker] of [
    ['puni.mjs', 'captured-root'],
    ['observation-service.mjs', 'captured-observation'],
  ] as const) {
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--config=/dev/null', join(dist, program)],
      { cwd: fixture.root, env: { PATH: '/usr/bin:/bin' }, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toBe(marker + '\n');
  }
  expect(existsSync(join(built.toolkit.directory, 'licenses/typescript-preparation/NOTICE'))).toBe(
    false,
  );
  expect(built.ownedDirectories).toContain(fixture.request.destination);
  expect(built.ownedDirectories).toContain(fixture.request.work);
}, 60000);
it('stops package layout creation after cancellation delivered by native destination reservation settlement', async () => {
  const fixture = await createToolkitProducerFixture(roots);
  const listeners = new Set<(signal: 'SIGINT' | 'SIGTERM') => void>();
  let first: 'SIGINT' | 'SIGTERM' | undefined;
  let injected = false;
  const subscribeInterrupts = (listener: (signal: 'SIGINT' | 'SIGTERM') => void) => {
    listeners.add(listener);
    if (first !== undefined) listener(first);
    return () => {
      listeners.delete(listener);
    };
  };
  const original = filesystem.realpathSync.native;
  const inject = ((...args: Parameters<typeof original>) => {
    const canonical = Reflect.apply(original, undefined, args);
    if (args[0] === fixture.request.destination && existsSync(fixture.request.destination)) {
      injected = true;
      first ??= 'SIGTERM';
      for (const listener of listeners) listener(first);
    }
    return canonical;
  }) as typeof original;
  const fault = spyOn(filesystem.realpathSync, 'native').mockImplementation(inject);
  try {
    const outcome = await buildPuniAssets(
      fixture.source,
      { work: fixture.request.work, destination: fixture.request.destination },
      { ...fixture.context, subscribeInterrupts },
    );
    expect(injected).toBe(true);
    expect(outcome).toMatchObject({ kind: 'cancelled', status: 143 });
    expect(existsSync(fixture.request.destination)).toBe(true);
    expect(existsSync(join(fixture.request.destination, 'dist'))).toBe(false);
  } finally {
    fault.mockRestore();
  }
}, 30000);

async function createPackageFixture() {
  const fixture = await createToolkitProducerFixture(roots);
  for (const path of [
    'apps/puni/cli/src/entrypoint.ts',
    'apps/twilight-structure/twilight-dash/cli/src/activation/observation-service-cli.ts',
  ]) {
    const target = join(fixture.repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'export{};');
  }
  for (const args of [
    ['add', '--all'],
    ['commit', '-m', 'package delivery control'],
  ]) {
    const child = Bun.spawnSync(['/usr/bin/git', '-C', fixture.repository, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  }
  const revision = Bun.spawnSync(['/usr/bin/git', '-C', fixture.repository, 'rev-parse', 'HEAD'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (revision.exitCode !== 0) throw new Error(revision.stderr.toString());
  const capture = await captureCommittedSource(revision.stdout.toString().trim(), {
    repository: fixture.repository,
    runtime: fixture.context.runtime,
    subscribeInterrupts: fixture.context.subscribeInterrupts,
  });
  if (capture.kind !== 'captured') throw new Error('package fixture capture cancelled');
  return { ...fixture, source: capture.source };
}
for (const file of ['puni.mjs', 'observation-service.mjs', 'package-manifest.json'])
  for (const fault of ['changed', 'omitted']) {
    it(
      'refuses ' + fault + ' delivered package ' + file + ' before a built package',
      async () => {
        const fixture = await createPackageFixture(),
          target = join(fixture.request.destination, 'dist', file),
          native = promises.chmod;
        let injected = false;
        const probe = spyOn(promises, 'chmod').mockImplementation(async (path, mode) => {
          await native(path, mode);
          if (path === target) {
            injected = true;
            if (fault === 'omitted') rmSync(target);
            else {
              await native(target, 0o600);
              writeFileSync(target, 'changed package program');
              await native(target, mode);
            }
          }
        });
        const verification = spyOn(installed, 'readInstalledPuniToolkit');
        try {
          const cause: unknown = await buildPuniAssets(
            fixture.source,
            fixture.request,
            fixture.context,
          ).then(
            () => undefined,
            (failure: unknown) => failure,
          );
          expect(injected).toBe(true);
          expect(verification).not.toHaveBeenCalled();
          expect(cause).toBeInstanceOf(ToolkitBuildFailure);
          if (!(cause instanceof ToolkitBuildFailure))
            throw new Error('package delivery refusal absent');
          expect(String(cause.cause)).toContain(
            fault === 'changed'
              ? 'delivered toolkit file differs from planned bytes: ' + file
              : target,
          );
          expect(cause.ownedDirectories).toEqual([
            fixture.request.work,
            fixture.request.destination,
          ]);
        } finally {
          probe.mockRestore();
          verification.mockRestore();
        }
      },
      60000,
    );
  }
for (const file of ['puni.mjs', 'package-manifest.json']) {
  it(
    'stops package delivery after settled ' +
      file +
      ' cancellation before later files or verification',
    async () => {
      const fixture = await createPackageFixture(),
        listeners = new Set<(signal: 'SIGINT' | 'SIGTERM') => void>(),
        native = promises.chmod,
        target = join(fixture.request.destination, 'dist', file);
      let first: 'SIGTERM' | undefined,
        injected = false;
      const subscribeInterrupts = (listener: (signal: 'SIGINT' | 'SIGTERM') => void) => {
        listeners.add(listener);
        if (first !== undefined) listener(first);
        return () => {
          listeners.delete(listener);
        };
      };
      const probe = spyOn(promises, 'chmod').mockImplementation(async (path, mode) => {
        await native(path, mode);
        if (path === target) {
          injected = true;
          first = 'SIGTERM';
          for (const listener of listeners) listener(first);
        }
      });
      const verification = spyOn(installed, 'readInstalledPuniToolkit').mockImplementation(() => {
        throw new Error('final verification after cancellation must not run');
      });
      try {
        expect(
          await buildPuniAssets(fixture.source, fixture.request, {
            ...fixture.context,
            subscribeInterrupts,
          }),
        ).toMatchObject({
          kind: 'cancelled',
          status: 143,
          ownedDirectories: [fixture.request.work, fixture.request.destination],
        });
        expect(injected).toBe(true);
        expect(existsSync(target)).toBe(true);
        expect(verification).not.toHaveBeenCalled();
        expect(listeners.size).toBe(0);
        if (file === 'puni.mjs') {
          expect(
            existsSync(join(fixture.request.destination, 'dist/observation-service.mjs')),
          ).toBe(false);
          expect(existsSync(join(fixture.request.destination, 'dist/package-manifest.json'))).toBe(
            false,
          );
        }
      } finally {
        probe.mockRestore();
        verification.mockRestore();
      }
    },
    60000,
  );
}
it('refuses a valid incompatible package manifest substituted after its delivery readback', async () => {
  const fixture = await createPackageFixture(),
    target = join(fixture.request.destination, 'dist/package-manifest.json'),
    native = operator.readOperatorFile;
  let injected = false;
  const probe = spyOn(operator, 'readOperatorFile').mockImplementation((path) => {
    const bytes = native(path);
    if (path === target && !injected) {
      injected = true;
      const manifest: unknown = JSON.parse(Buffer.from(bytes).toString());
      if (typeof manifest !== 'object' || manifest === null)
        throw new Error('manifest fixture absent');
      filesystem.chmodSync(target, 0o600);
      writeFileSync(target, JSON.stringify({ ...manifest, sourceRevision: 'b'.repeat(40) }));
      filesystem.chmodSync(target, 0o444);
    }
    return bytes;
  });
  try {
    const cause: unknown = await buildPuniAssets(
      fixture.source,
      fixture.request,
      fixture.context,
    ).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(injected).toBe(true);
    expect(cause).toBeInstanceOf(ToolkitBuildFailure);
    if (!(cause instanceof ToolkitBuildFailure))
      throw new Error('final package join refusal absent');
    expect(String(cause.cause)).toContain(
      'installed toolkit source differs from PUNI package manifest',
    );
  } finally {
    probe.mockRestore();
  }
}, 60000);
