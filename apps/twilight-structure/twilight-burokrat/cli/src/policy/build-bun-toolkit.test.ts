import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, expect, it, spyOn } from 'bun:test';

import type { LintInterrupt } from '../lint-interrupts';
import { readLintRuntime } from '../lint-runtime';
import { buildBunToolkit, ToolkitBuildFailure } from './build-bun-toolkit';
import { bunToolkitRoles } from './bun-release';
import { captureCommittedSource } from './committed-source';
import * as materialization from './materialized-source';
import * as reservation from './preparation-directory';
import * as roleBuilder from './preparation-roles';
import { readBunToolkit } from './toolkit';
import * as moduleCopy from './trusted-modules';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const workspace = resolve(import.meta.dir, '../../../../../..');
const provider = 'apps/twilight-structure/twilight-burokrat/cli/src/';
function git(repository: string, args: string[]) {
  const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
async function fixture(compiler = false) {
  const root = mkdtempSync(join(tmpdir(), 'puni current asset producer '));
  roots.push(root);
  const repository = join(root, 'source'),
    runtime = join(root, 'runtime');
  mkdirSync(repository);
  mkdirSync(runtime);
  for (const path of ['package.json', 'bun.lock', '.bun-version'])
    writeFileSync(join(repository, path), readFileSync(join(workspace, path)));
  for (const [path, marker] of [
    ['cli.ts', 'validator'],
    ['lint-cli.ts', 'launcher'],
    ['policy/snapshot-validator.ts', 'snapshotter'],
    ['policy/prepare-activation-entry.ts', 'prepare'],
    ['policy/prepare-relocation-entry.ts', 'relocate'],
  ]) {
    const target = join(repository, provider, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      (compiler && path === 'cli.ts'
        ? 'import ts from "typescript";console.log(ts.version);'
        : '') +
        'console.log(' +
        JSON.stringify(marker) +
        ');',
    );
  }
  git(repository, ['init', '--initial-branch=main']);
  git(repository, ['config', 'user.name', 'PUNI toolkit builder']);
  git(repository, ['config', 'user.email', 'toolkit@example.test']);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '-m', 'captured five roles']);
  const revision = git(repository, ['rev-parse', 'HEAD']);
  const runtimeAuthority = readLintRuntime('/usr/bin:/bin', runtime);
  const captured = await captureCommittedSource(revision, {
    repository,
    runtime: runtimeAuthority,
    subscribeInterrupts: () => () => undefined,
  });
  if (captured.kind !== 'captured') throw new Error('unexpected capture cancellation');
  return {
    root,
    repository,
    revision,
    source: captured.source,
    request: { tag: 'puni-v0.3.0', work: join(root, 'work'), destination: join(root, 'toolkit') },
    context: {
      callerDirectory: root,
      sourceDirectory: repository,
      installationDirectory: workspace,
      runtime: runtimeAuthority,
      subscribeInterrupts: () => () => undefined,
    },
  };
}

it('produces a strict usable five-role toolkit from captured source and independently trusted installation', async () => {
  const selected = await fixture();
  const built = await buildBunToolkit(selected.source, selected.request, selected.context);
  if (built.kind !== 'built') throw new Error('unexpected toolkit build cancellation');
  const verified = readBunToolkit(built.toolkit.directory);
  expect(verified.sourceRevision).toBe(selected.revision);
  expect(verified.digest).toBe(built.toolkit.digest);
  expect(verified.trustedNodeModules).toContain('@optique/run');
  expect(readFileSync(join(verified.directory, 'SHA256SUMS'), 'utf8')).toContain(
    verified.digest + '  ./toolkit.json\n',
  );
  for (const role of bunToolkitRoles) {
    const child = Bun.spawnSync(
      [...createLaunch(process.execPath, join(verified.directory, role))],
      {
        cwd: selected.root,
        env: { PATH: '/usr/bin:/bin' },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
      },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString().trim()).toBe(
      {
        'launcher.mjs': 'launcher',
        'snapshotter.ts': 'snapshotter',
        'validator.mjs': 'validator',
        'prepare-activation.mjs': 'prepare',
        'prepare-relocation-activation.mjs': 'relocate',
      }[role],
    );
  }
});

it('returns producer prior cancellation before absent authority and output IO', async () => {
  const selected = await fixture();
  expect(
    await buildBunToolkit(selected.source, selected.request, {
      ...selected.context,
      sourceDirectory: join(selected.root, 'absent-source'),
      installationDirectory: join(selected.root, 'absent-installation'),
      subscribeInterrupts: (listener) => {
        listener('SIGTERM');
        return () => undefined;
      },
    }),
  ).toEqual({ kind: 'cancelled', status: 143, ownedDirectories: [] });
  expect(existsSync(selected.request.work)).toBe(false);
});

it('retains an owned producer work root while refusing a nested destination', async () => {
  const selected = await fixture();
  const cause: unknown = await buildBunToolkit(
    selected.source,
    { ...selected.request, destination: join(selected.request.work, 'nested') },
    selected.context,
  ).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(ToolkitBuildFailure);
  if (!(cause instanceof ToolkitBuildFailure)) throw new Error('missing retained toolkit failure');
  expect(cause.ownedDirectories).toEqual([selected.request.work]);
  expect(String(cause.cause)).toContain('physically disjoint');
  expect(existsSync(join(selected.request.work, 'nested'))).toBe(false);
});

it('protects source authority before producer ownership', async () => {
  const selected = await fixture();
  const cause: unknown = await buildBunToolkit(
    selected.source,
    { ...selected.request, work: join(selected.repository, 'outputs') },
    selected.context,
  ).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(ToolkitBuildFailure);
  if (!(cause instanceof ToolkitBuildFailure)) throw new Error('missing protected toolkit failure');
  expect(cause.ownedDirectories).toEqual([]);
  expect(String(cause.cause)).toContain('beneath protected source authority');
  expect(existsSync(join(selected.repository, 'outputs'))).toBe(false);
});

it('refuses a self-consistent delivered toolkit descriptor substituted after its earlier readback', async () => {
  const selected = await fixture(),
    changeMode = filesystem.chmod;
  const changed = spyOn(filesystem, 'chmod').mockImplementation(async (path, mode) => {
    await changeMode(path, mode);
    if (path === join(selected.request.destination, 'SHA256SUMS')) {
      const descriptorPath = join(selected.request.destination, 'toolkit.json');
      const descriptor: unknown = JSON.parse(readFileSync(descriptorPath, 'utf8'));
      if (typeof descriptor !== 'object' || descriptor === null)
        throw new Error('unexpected delivered descriptor shape');
      await changeMode(descriptorPath, 0o600);
      writeFileSync(
        descriptorPath,
        JSON.stringify({ ...descriptor, sourceRevision: 'b'.repeat(40) }),
      );
      await changeMode(descriptorPath, 0o444);
    }
  });
  let cause: unknown;
  try {
    cause = await buildBunToolkit(selected.source, selected.request, selected.context).then(
      () => undefined,
      (failure: unknown) => failure,
    );
  } finally {
    changed.mockRestore();
  }
  expect(cause).toBeInstanceOf(ToolkitBuildFailure);
  if (!(cause instanceof ToolkitBuildFailure))
    throw new Error('missing late delivered descriptor substitution refusal');
  expect(String(cause.cause)).toContain('delivered toolkit identity differs from planned bytes');
  expect(cause.ownedDirectories).toEqual([selected.request.work, selected.request.destination]);
});

for (const delivered of [
  'licenses/typescript-preparation/LICENSE.txt',
  'licenses/typescript-preparation/NOTICE',
  'SHA256SUMS',
]) {
  for (const fault of ['changed', 'omitted'] as const) {
    it(
      'refuses ' + fault + ' delivered ' + delivered + ' before claiming a built toolkit',
      async () => {
        const selected = await fixture(true),
          target = join(selected.request.destination, delivered),
          changeMode = filesystem.chmod;
        const changed = spyOn(filesystem, 'chmod').mockImplementation(async (path, mode) => {
          await changeMode(path, mode);
          if (path === target) {
            if (fault === 'changed') {
              await changeMode(target, 0o600);
              writeFileSync(target, 'delivery-substitution-canary');
              await changeMode(target, mode);
            } else rmSync(target);
          }
        });
        let cause: unknown;
        try {
          cause = await buildBunToolkit(selected.source, selected.request, selected.context).then(
            () => undefined,
            (failure: unknown) => failure,
          );
        } finally {
          changed.mockRestore();
        }
        expect(cause).toBeInstanceOf(ToolkitBuildFailure);
        if (!(cause instanceof ToolkitBuildFailure))
          throw new Error('missing delivered file refusal');
        expect(String(cause.cause)).toContain(
          fault === 'changed'
            ? 'delivered toolkit file differs from planned bytes: ' + delivered
            : target,
        );
        expect(cause.ownedDirectories).toEqual([
          selected.request.work,
          selected.request.destination,
        ]);
      },
      30000,
    );
  }
}

function captureInterrupts(selected: Awaited<ReturnType<typeof fixture>>) {
  const listeners = new Set<(signal: LintInterrupt) => void>();
  let first: LintInterrupt | undefined;
  return {
    context: {
      ...selected.context,
      subscribeInterrupts(listener: (signal: LintInterrupt) => void) {
        listeners.add(listener);
        if (first !== undefined) listener(first);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    interrupt(signal: LintInterrupt) {
      first ??= signal;
      for (const listener of listeners) listener(signal);
    },
    listeners,
  };
}
for (const stage of ['work', 'destination'] as const) {
  it(
    'retains producer ' + stage + ' ownership and stops after reservation cancellation',
    async () => {
      const selected = await fixture(),
        control = captureInterrupts(selected),
        reserve = reservation.reserveProtectedDirectory;
      const changed = spyOn(reservation, 'reserveProtectedDirectory').mockImplementation(
        async (path, context) => {
          const outcome = await reserve(path, context);
          if (path === selected.request[stage]) control.interrupt('SIGTERM');
          return outcome;
        },
      );
      try {
        expect(await buildBunToolkit(selected.source, selected.request, control.context)).toEqual({
          kind: 'cancelled',
          status: 143,
          ownedDirectories:
            stage === 'work'
              ? [selected.request.work]
              : [selected.request.work, selected.request.destination],
        });
        expect(existsSync(join(selected.request.work, 'source'))).toBe(false);
        expect(control.listeners.size).toBe(0);
      } finally {
        changed.mockRestore();
      }
    },
  );
}
for (const stage of ['work', 'destination', 'materialization', 'roles'] as const) {
  it(
    'refuses producer ' + stage + ' dependency cancellation without the owning broker',
    async () => {
      const selected = await fixture();
      let changed: { mockRestore(): void };
      if (stage === 'work' || stage === 'destination') {
        const reserve = reservation.reserveProtectedDirectory;
        changed = spyOn(reservation, 'reserveProtectedDirectory').mockImplementation(
          async (path, context) =>
            path === selected.request[stage]
              ? { kind: 'cancelled', status: 130 }
              : await reserve(path, context),
        );
      } else if (stage === 'materialization')
        changed = spyOn(materialization, 'materializeProtectedSource').mockResolvedValue({
          kind: 'cancelled',
          status: 130,
          directory: undefined,
        });
      else
        changed = spyOn(roleBuilder, 'buildToolkitRoles').mockResolvedValue({
          kind: 'cancelled',
          status: 130,
        });
      let cause: unknown;
      try {
        cause = await buildBunToolkit(selected.source, selected.request, selected.context).then(
          () => undefined,
          (failure: unknown) => failure,
        );
      } finally {
        changed.mockRestore();
      }
      expect(cause).toBeInstanceOf(ToolkitBuildFailure);
      if (!(cause instanceof ToolkitBuildFailure))
        throw new Error('missing producer cancellation owner refusal');
      expect(String(cause.cause)).toContain(
        stage === 'work'
          ? 'toolkit work reservation stopped without cancellation'
          : stage === 'destination'
            ? 'toolkit destination reservation stopped without cancellation'
            : stage === 'materialization'
              ? 'toolkit materialization stopped without owner cancellation'
              : 'toolkit role build stopped without owner cancellation',
      );
    },
  );
}
it('retains producer roots after cancellation following actual settled role building', async () => {
  const selected = await fixture(),
    control = captureInterrupts(selected),
    build = roleBuilder.buildToolkitRoles;
  const changed = spyOn(roleBuilder, 'buildToolkitRoles').mockImplementation(
    async (source, context) => {
      const built = await build(source, context);
      control.interrupt('SIGINT');
      return built;
    },
  );
  try {
    expect(await buildBunToolkit(selected.source, selected.request, control.context)).toEqual({
      kind: 'cancelled',
      status: 130,
      ownedDirectories: [selected.request.work, selected.request.destination],
    });
    expect(existsSync(join(selected.request.destination, 'trusted-node-modules'))).toBe(false);
  } finally {
    changed.mockRestore();
  }
});
it('retains the first terminal producer cancellation after complete delivery and subscription release', async () => {
  const selected = await fixture(),
    control = captureInterrupts(selected);
  let count = 0;
  const outcome = await buildBunToolkit(selected.source, selected.request, {
    ...control.context,
    subscribeInterrupts(listener) {
      const position = count++,
        unsubscribe = control.context.subscribeInterrupts(listener);
      return () => {
        if (position === 0) {
          control.interrupt('SIGINT');
          control.interrupt('SIGTERM');
        }
        unsubscribe();
      };
    },
  });
  expect(outcome).toEqual({
    kind: 'cancelled',
    status: 130,
    ownedDirectories: [selected.request.work, selected.request.destination],
  });
  expect(readBunToolkit(selected.request.destination).sourceRevision).toBe(selected.revision);
  expect(control.listeners.size).toBe(0);
});
for (const concurrentFailure of [false, true]) {
  it(
    'preserves producer release failure over cancellation with build failure ' +
      String(concurrentFailure),
    async () => {
      const selected = await fixture(),
        fault = new Error('controlled producer release failure');
      const cause: unknown = await buildBunToolkit(selected.source, selected.request, {
        ...selected.context,
        installationDirectory: join(selected.root, 'absent-installation'),
        subscribeInterrupts(listener) {
          if (!concurrentFailure) listener('SIGTERM');
          return () => {
            throw fault;
          };
        },
      }).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(cause).toBeInstanceOf(ToolkitBuildFailure);
      if (!(cause instanceof ToolkitBuildFailure))
        throw new Error('missing producer release failure');
      if (concurrentFailure) {
        expect(cause.cause).toBeInstanceOf(AggregateError);
        if (!(cause.cause instanceof AggregateError))
          throw new Error('missing aggregate producer causes');
        expect(cause.cause.errors).toContain(fault);
        expect(cause.cause.errors.length).toBe(2);
      } else expect(cause.cause).toBe(fault);
      expect(cause.ownedDirectories).toEqual([]);
    },
  );
}

it('refuses delivery closure drift after the authenticated build copy settles', async () => {
  const selected = await fixture(),
    copy = moduleCopy.copyTrustedModules;
  const changed = spyOn(moduleCopy, 'copyTrustedModules').mockImplementation(
    (destination, root, names) => {
      copy(destination, root, names);
      if (destination === join(selected.request.destination, 'trusted-node-modules'))
        writeFileSync(join(destination, 'unexpected-delivery-file'), 'changed closure');
    },
  );
  let cause: unknown;
  try {
    cause = await buildBunToolkit(selected.source, selected.request, selected.context).then(
      () => undefined,
      (failure: unknown) => failure,
    );
  } finally {
    changed.mockRestore();
  }
  expect(cause).toBeInstanceOf(ToolkitBuildFailure);
  if (!(cause instanceof ToolkitBuildFailure)) throw new Error('missing delivered closure refusal');
  expect(String(cause.cause)).toContain(
    'toolkit delivery dependency copy differs from admitted closure',
  );
  expect(cause.ownedDirectories).toEqual([selected.request.work, selected.request.destination]);
});

it('refuses a noncommitted source selection before producer authority and output IO', async () => {
  const selected = await fixture(),
    snapshot = selected.source.readSnapshot();
  const cause: unknown = await buildBunToolkit(
    {
      readSnapshot: () => ({
        ...snapshot,
        selection: { kind: 'staged', base: selected.revision, indexTree: selected.revision },
      }),
      readFile: (path) => selected.source.readFile(path),
    },
    selected.request,
    { ...selected.context, installationDirectory: join(selected.root, 'absent-installation') },
  ).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(ToolkitBuildFailure);
  if (!(cause instanceof ToolkitBuildFailure)) throw new Error('missing committed source refusal');
  expect(String(cause.cause)).toContain('toolkit producer requires a committed source capture');
  expect(cause.ownedDirectories).toEqual([]);
});

for (const stage of ['launcher.mjs', 'SHA256SUMS']) {
  it(
    'retains producer cancellation recorded by settled delivered ' +
      stage +
      ' before later delivery or success',
    async () => {
      const selected = await fixture(),
        control = captureInterrupts(selected),
        changeMode = filesystem.chmod;
      const changed = spyOn(filesystem, 'chmod').mockImplementation(async (path, mode) => {
        await changeMode(path, mode);
        if (path === join(selected.request.destination, stage)) control.interrupt('SIGTERM');
      });
      try {
        expect(await buildBunToolkit(selected.source, selected.request, control.context)).toEqual({
          kind: 'cancelled',
          status: 143,
          ownedDirectories: [selected.request.work, selected.request.destination],
        });
        expect(existsSync(join(selected.request.destination, stage))).toBe(true);
        if (stage === 'launcher.mjs')
          expect(existsSync(join(selected.request.destination, 'snapshotter.ts'))).toBe(false);
        expect(control.listeners.size).toBe(0);
      } finally {
        changed.mockRestore();
      }
    },
  );
}
