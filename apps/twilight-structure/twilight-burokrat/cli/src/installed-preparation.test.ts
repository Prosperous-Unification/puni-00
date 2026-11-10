import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, expect, it, spyOn } from 'bun:test';

import { executeInstalledPreparation } from './installed-preparation';
import { packageManifestBytes } from './packaging/manifest';
import * as preparationSource from './policy/preparation-source';
import { disposeRelocationFixtures } from './policy/relocation-fixtures';
import { createRelocationFixture, createToolkitFixture } from './testing/preparation-fixtures';

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

for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
  it(
    'executes installed typed ' +
      command +
      ' without executing the unused installed preparer asset',
    async () => {
      const fixture =
          command === 'prepare-activation'
            ? await createToolkitFixture(roots)
            : await createRelocationFixture(roots),
        captured = captureOutputs();
      // The installed typed route dispatches in process; the separately tested standalone role has
      // its own explicit private protocol. These inert fixture roles do not establish producer usability.
      writeFileSync(
        join(fixture.root, 'package-manifest.json'),
        packageManifestBytes('a'.repeat(40), fixture.context.expectedToolkitIdentity),
      );
      expect(
        await executeInstalledPreparation(fixture.request, {
          ...fixture.context,
          installedDirectory: fixture.root,
          outputs: captured.outputs,
        }),
      ).toBe(0);
      expect(Buffer.concat(captured.stdout).toString()).toContain(fixture.revision);
      expect(captured.diagnostics.length).toBe(0);
      expect(
        existsSync(
          join(fixture.request.work, 'puni-activation-' + fixture.revision.slice(0, 8) + '.tar'),
        ),
      ).toBe(true);
      expect(fixture.listeners.size).toBe(0);
    },
    60000,
  );
}

it('refuses a self-consistent toolkit not bound by the installed package before candidate Git or outputs', async () => {
  const fixture = await createToolkitFixture(roots),
    captured = captureOutputs();
  writeFileSync(
    join(fixture.root, 'package-manifest.json'),
    packageManifestBytes('a'.repeat(40), 'b'.repeat(64)),
  );
  const cause: unknown = await executeInstalledPreparation(
    { ...fixture.request, candidateRepository: join(fixture.root, 'absent-candidate') },
    { ...fixture.context, installedDirectory: fixture.root, outputs: captured.outputs },
  ).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(String(cause)).toContain('installed toolkit differs from package manifest');
  expect(existsSync(fixture.request.work)).toBe(false);
});

it('refuses candidate-targeted installed package manifest despite external toolkit assets', async () => {
  const fixture = await createToolkitFixture(roots),
    captured = captureOutputs();
  const manifest = join(fixture.request.candidateRepository, '.git', 'installed-package.json');
  writeFileSync(
    manifest,
    packageManifestBytes('a'.repeat(40), fixture.context.expectedToolkitIdentity),
  );
  symlinkSync(manifest, join(fixture.root, 'package-manifest.json'));
  const cause: unknown = await executeInstalledPreparation(fixture.request, {
    ...fixture.context,
    installedDirectory: fixture.root,
    outputs: captured.outputs,
  }).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(String(cause)).toContain('package manifest must be outside the candidate repository');
  expect(existsSync(fixture.request.work)).toBe(false);
});

it('returns prior installed preparation cancellation before absent package and runtime IO', async () => {
  const fixture = await createToolkitFixture(roots),
    captured = captureOutputs();
  fixture.interrupt('SIGINT');
  expect(
    await executeInstalledPreparation(fixture.request, {
      ...fixture.context,
      installedDirectory: join(fixture.root, 'absent-installation'),
      outputs: captured.outputs,
    }),
  ).toBe(130);
  expect(existsSync(fixture.request.work)).toBe(false);
  expect(fixture.listeners.size).toBe(0);
});

it('owns installed typed preparation before missing PATH and never reads stdin', async () => {
  const fixture = await createToolkitFixture(roots),
    program = join(fixture.root, 'typed-owner.ts');
  writeFileSync(
    program,
    'import{runInstalledPreparation}from ' +
      JSON.stringify(join(import.meta.dir, 'installed-preparation.ts')) +
      ';Bun.stdin.stream=()=>{throw new Error("typed preparation must not read stdin");};process.exit(await runInstalledPreparation(' +
      JSON.stringify(fixture.request) +
      ',{installedDirectory:' +
      JSON.stringify(fixture.root) +
      ',callerDirectory:' +
      JSON.stringify(fixture.root) +
      ',lookup:{directory:' +
      JSON.stringify(fixture.context.runtime.directory) +
      ',path:undefined},launch:()=>{throw new Error("unexpected launch");}}));',
  );
  const child = Bun.spawnSync([...createLaunch(process.execPath, program)], {
    cwd: fixture.root,
    env: { PATH: '/usr/bin:/bin' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
  expect(child.exitCode, child.stderr.toString()).toBe(1);
  expect(child.stderr.toString()).toContain('puni preparation:');
  expect(child.stderr.toString()).toContain('trusted executable PATH is required for preparation');
  expect(child.stderr.toString()).not.toContain('must not read stdin');
  expect(existsSync(fixture.request.work)).toBe(false);
});

it('captures installed output capabilities before the subscription callback can replace aliased sinks', async () => {
  const fixture = await createToolkitFixture(roots),
    captured = captureOutputs();
  writeFileSync(
    join(fixture.root, 'package-manifest.json'),
    packageManifestBytes('a'.repeat(40), fixture.context.expectedToolkitIdentity),
  );
  expect(
    await executeInstalledPreparation(fixture.request, {
      ...fixture.context,
      installedDirectory: fixture.root,
      outputs: captured.outputs,
      subscribeInterrupts: (listener) => {
        captured.outputs.stdout = () => {
          throw new Error('aliased replacement stdout must not run');
        };
        return fixture.context.subscribeInterrupts(listener);
      },
    }),
  ).toBe(0);
  expect(Buffer.concat(captured.stdout).toString()).toContain(fixture.revision);
});

it('propagates installed source preflight cancellation without invoking preparation outputs', async () => {
  const fixture = await createToolkitFixture(roots),
    captured = captureOutputs();
  writeFileSync(
    join(fixture.root, 'package-manifest.json'),
    packageManifestBytes('a'.repeat(40), fixture.context.expectedToolkitIdentity),
  );
  const changed = spyOn(preparationSource, 'readPreparationSource').mockResolvedValue({
    kind: 'cancelled',
    status: 143,
  });
  try {
    expect(
      await executeInstalledPreparation(fixture.request, {
        ...fixture.context,
        installedDirectory: fixture.root,
        outputs: captured.outputs,
      }),
    ).toBe(143);
    expect(captured.stdout.length).toBe(0);
    expect(existsSync(fixture.request.work)).toBe(false);
  } finally {
    changed.mockRestore();
  }
});

it('honors an explicit package-bound normal toolkit independently of an absent default child', async () => {
  const fixture = await createToolkitFixture(roots),
    captured = captureOutputs(),
    installation = join(fixture.root, 'separate-installed-dist');
  mkdirSync(installation);
  writeFileSync(
    join(installation, 'package-manifest.json'),
    packageManifestBytes('a'.repeat(40), fixture.context.expectedToolkitIdentity),
  );
  expect(
    await executeInstalledPreparation(
      { ...fixture.request, toolkit: fixture.context.toolkitDirectory },
      { ...fixture.context, installedDirectory: installation, outputs: captured.outputs },
    ),
  ).toBe(0);
  expect(Buffer.concat(captured.stdout).toString()).toContain(fixture.revision);
  expect(existsSync(join(installation, 'toolkit'))).toBe(false);
});
