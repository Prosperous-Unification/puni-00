import { chmod, rename, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  assertDependencyOwner,
  withDependencyOwner,
  withOwnerSolverRuntime,
} from './edge-ownership';
import { initializeOrdinaryEdgePolicy } from './edge-policy';
import { envLayout } from './env';
import { withCanonicalLock } from './lock';
import { withSolverPolicyAdmission, withSolverRuntimeAdmission } from './solver-runtime-admission';

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
  await writeFile(`${directory}/edge.lock`, '');
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
  await writeFile(`${directory}/edge.lock`, '');
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
  await writeFile(`${directory}/edge.lock`, '');
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
    await writeFile(`${directory}/edge.lock`, '');
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

test('policy runtime requires policy before callback and shares ordinary lifetime lock', async () => {
  const directory = scratchSync('solver-policy-');
  await refuses(
    withSolverPolicyAdmission(() => Promise.reject(new Error('callback entered')), directory),
    'callback entered',
    true,
  );
  await initializeOrdinaryEdgePolicy(directory);
  await withSolverPolicyAdmission(async () => {
    await refuses(
      withSolverRuntimeAdmission(() => Promise.resolve(), directory),
      'lock held',
    );
  }, directory);
  await withSolverRuntimeAdmission(async () => {
    await refuses(
      withSolverPolicyAdmission(() => Promise.resolve(), directory),
      'lock held',
    );
  }, directory);
  await writeFile(`${directory}/edge-owner.pending`, 'retained');
  await refuses(
    withSolverPolicyAdmission(() => Promise.reject(new Error('callback entered')), directory),
    'admission closed',
  );
});

for (const phase of ['restoring', 'active'] as const) {
  test(`legacy runtime refuses present ${phase} policy without retained markers`, async () => {
    const directory = scratchSync('solver-runtime-policy-');
    const reference = {
      name: `edge-owner-000001-${phase === 'restoring' ? 'solver-restore-intent' : 'handoff-complete'}.json`,
      sha256: 'b'.repeat(64),
    };
    await writeFile(
      `${directory}/edge-policy.json`,
      JSON.stringify({
        format: 'dependency-edge-policy',
        version: 1,
        phase,
        edgeState: directory,
        ownerPublicationSha256: 'a'.repeat(64),
        ...(phase === 'restoring' ? { restorationIntent: reference } : { handoff: reference }),
      }),
      { mode: 0o600 },
    );
    let entered = false;
    await refuses(
      withSolverRuntimeAdmission(() => {
        entered = true;
        return Promise.resolve();
      }, directory),
      'callback entered',
      true,
    );
    expect(entered).toBe(false);
  });
}

for (const contents of [
  '{',
  '{}',
  JSON.stringify({ format: 'dependency-edge-policy', version: 1, phase: 'future' }),
]) {
  test(`legacy runtime refuses malformed present policy ${contents}`, async () => {
    const directory = scratchSync('solver-runtime-policy-');
    await writeFile(`${directory}/edge-policy.json`, contents, { mode: 0o600 });
    let entered = false;
    await refuses(
      withSolverRuntimeAdmission(() => {
        entered = true;
        return Promise.resolve();
      }, directory),
      'callback entered',
      true,
    );
    expect(entered).toBe(false);
  });
}
for (const publication of ['absent', 'ordinary'] as const) {
  test(`legacy runtime admits ${publication} policy with both markers absent`, async () => {
    const directory = scratchSync('solver-runtime-policy-');
    if (publication === 'ordinary') await initializeOrdinaryEdgePolicy(directory);
    let entered = false;
    await withSolverRuntimeAdmission(() => {
      entered = true;
      return Promise.resolve();
    }, directory);
    expect(entered).toBe(true);
  });
}

test('required active mode reaches complete graph reader without manufacturing retained marker evidence', async () => {
  const directory = scratchSync('solver-runtime-active-dispatch-');
  await writeFile(
    directory + '/edge-policy.json',
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'active',
      edgeState: directory,
      ownerPublicationSha256: 'a'.repeat(64),
      handoff: { name: 'edge-owner-000001-handoff-complete.json', sha256: 'b'.repeat(64) },
    }),
    { mode: 0o600 },
  );
  let entered = false;
  await refuses(
    withSolverPolicyAdmission(() => {
      entered = true;
      return Promise.resolve();
    }, directory),
    'edge-owner.json',
  );
  expect(entered).toBe(false);
});
