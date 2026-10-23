import { chmod, rename, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  assertDependencyOwner,
  withDependencyOwner,
  withOwnerSolverRuntime,
} from './edge-ownership';
import { envLayout } from './env';
import { withCanonicalLock } from './lock';
import { withSolverRuntimeAdmission } from './solver-runtime-admission';

for (const marker of ['edge-owner.pending', 'edge-owner.json']) {
  test(`runtime refuses retained ${marker} before its callback`, async () => {
    const directory = scratchSync('solver-runtime-');
    await writeFile(`${directory}/${marker}`, 'retained');
    let entered = false;
    await refuses(
      withSolverRuntimeAdmission(() => {
        entered = true;
        return Promise.resolve();
      }, directory),
      'admission closed',
    );
    expect(entered).toBe(false);
  });
}

for (const fault of ['absent', 'unreadable', 'alias'] as const) {
  test(`runtime refuses ${fault} trusted state`, async () => {
    const directory = scratchSync('solver-runtime-');
    const selected =
      fault === 'absent' ? `${directory}/absent` : fault === 'alias' ? `${directory}/.` : directory;
    if (fault === 'unreadable') await chmod(directory, 0o333);
    try {
      await refuses(
        withSolverRuntimeAdmission(() => Promise.reject(new Error('callback entered')), selected),
        'callback entered',
        true,
      );
    } finally {
      if (fault === 'unreadable') await chmod(directory, 0o700);
    }
  });
}

test('owner cannot reach protected callback while prior runtime holds its description', async () => {
  const directory = scratchSync('solver-runtime-');
  const layout = { ...envLayout('prod'), root: directory, stateDir: directory };
  let protectedWork = false;
  await withSolverRuntimeAdmission(async () => {
    await withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [layout] },
      async (owner) => {
        await refuses(
          withOwnerSolverRuntime(owner, layout, () => {
            protectedWork = true;
            return Promise.resolve();
          }),
          'lock held',
        );
      },
      directory,
    );
  }, directory);
  expect(protectedWork).toBe(false);
});

test('owner callback retains runtime lock and checks descriptor on every owner boundary', async () => {
  const directory = scratchSync('solver-runtime-');
  const layout = { ...envLayout('prod'), root: directory, stateDir: directory };
  await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [layout] },
    async (owner) => {
      await withOwnerSolverRuntime(owner, layout, async () => {
        await refuses(
          withCanonicalLock(`${directory}/solver-runtime.lock`, () => Promise.resolve(undefined)),
          'lock held',
        );
        await rename(`${directory}/solver-runtime.lock`, `${directory}/retained.lock`);
        await writeFile(`${directory}/solver-runtime.lock`, '');
        await refuses(assertDependencyOwner(owner, layout), 'does not name');
      }).catch((cause: unknown) => {
        expect(String(cause)).toContain('does not name');
      });
    },
    directory,
  );
});

test('expired owner cannot acquire runtime admission', async () => {
  const directory = scratchSync('solver-runtime-');
  const layout = { ...envLayout('prod'), root: directory, stateDir: directory };
  const owner = await withDependencyOwner(
    { sha: 'a'.repeat(40), layouts: [layout] },
    (owner) => Promise.resolve(owner),
    directory,
  );
  await refuses(
    withOwnerSolverRuntime(owner, layout, () => Promise.resolve(undefined)),
    'not live',
  );
});

for (const boundary of ['before', 'after'] as const) {
  test(`runtime owner checks retained publication ${boundary} protected callback`, async () => {
    const directory = scratchSync('solver-runtime-');
    const layout = { ...envLayout('prod'), root: directory, stateDir: directory };
    await withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [layout] },
      async (owner) => {
        let entered = false;
        if (boundary === 'before') await writeFile(`${directory}/edge-owner.pending`, 'changed');
        await refuses(
          withOwnerSolverRuntime(owner, layout, async () => {
            entered = true;
            await writeFile(`${directory}/edge-owner.pending`, 'changed');
          }),
          'publication changed',
        );
        expect(entered).toBe(boundary === 'after');
      },
      directory,
    );
  });
}

test('runtime refuses symlink lock without modifying foreign evidence', async () => {
  const { symlink } = await import('node:fs/promises');
  const directory = scratchSync('solver-runtime-');
  await writeFile(`${directory}/foreign.lock`, 'retained');
  await symlink(`${directory}/foreign.lock`, `${directory}/solver-runtime.lock`);
  await refuses(
    withSolverRuntimeAdmission(() => Promise.resolve(undefined), directory),
    'canonical lock',
  );
  expect(await Bun.file(`${directory}/foreign.lock`).text()).toBe('retained');
});

async function refuses(
  promise: Promise<unknown>,
  message: string,
  excludes = false,
): Promise<void> {
  let refused = false;
  try {
    await promise;
  } catch (cause) {
    refused = true;
    if (excludes) expect(String(cause)).not.toContain(message);
    else expect(String(cause)).toContain(message);
  }
  expect(refused).toBe(true);
}
