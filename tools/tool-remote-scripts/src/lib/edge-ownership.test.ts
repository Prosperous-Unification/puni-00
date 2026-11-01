import { writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { assertNoEdgeOwner } from './edge-admission';
import {
  assertDependencyOwner,
  type DependencyOwner,
  ownerDocker,
  withDependencyOwner,
} from './edge-ownership';
import { envLayout } from './env';
import { withLock } from './lock';

function fixture() {
  const root = scratchSync('dependency-owner-');
  writeFileSync(`${root}/edge.lock`, '');
  return {
    root,
    plan: { sha: 'a'.repeat(40), layouts: [{ ...envLayout('prod'), root, stateDir: root }] },
  };
}

test('retains exact pending owner and excludes real edge/deploy competitors', async () => {
  const { root, plan } = fixture();
  await withDependencyOwner(
    plan,
    async (owner) => {
      expect(await readFile(`${root}/edge-owner.pending`, 'utf8')).toContain(plan.sha);
      await refuses(
        withLock(`${root}/edge.lock`, () => Promise.resolve(undefined)),
        'lock held',
      );
      await refuses(
        withLock(`${root}/deploy.lock`, () => Promise.resolve(undefined)),
        'lock held',
      );
      await refuses(assertNoEdgeOwner(root), 'admission closed');
      await assertDependencyOwner(owner, plan.layouts[0]);
    },
    root,
  );
  await refuses(assertNoEdgeOwner(root), 'admission closed');
});

test('expired and reconstructed owners cannot authorize operations', async () => {
  const { root, plan } = fixture();
  const owner = await withDependencyOwner(plan, (owner) => Promise.resolve(owner), root);
  await refuses(assertDependencyOwner(owner, plan.layouts[0]), 'live');
  await refuses(
    assertDependencyOwner(JSON.parse(JSON.stringify(owner)) as DependencyOwner, plan.layouts[0]),
    'live',
  );
});

test('every Docker boundary has durable intent and retained response', async () => {
  const { root, plan } = fixture();
  await withDependencyOwner(
    plan,
    async (owner) => {
      const docker = ownerDocker(owner, plan.layouts[0], async (args) => {
        expect(await readFile(`${root}/edge-owner-000001-intent.json`, 'utf8')).toContain(args[0]);
        return 'observed';
      });
      expect(await docker(['inspect', 'exact'])).toBe('observed');
      expect(await readFile(`${root}/edge-owner-000001-readback.json`, 'utf8')).toContain(
        'observed',
      );
    },
    root,
  );
});

test('changed pending readback refuses next effect and retains evidence', async () => {
  const { root, plan } = fixture();
  let effects = 0;
  await refuses(
    withDependencyOwner(
      plan,
      async (owner) => {
        const docker = ownerDocker(owner, plan.layouts[0], () => {
          effects++;
          return Promise.resolve('');
        });
        await writeFile(`${root}/edge-owner.pending`, 'corrupt');
        await docker(['stop', 'exact']);
      },
      root,
    ),
    'owner publication',
  );
  expect(effects).toBe(0);
  expect(await readFile(`${root}/edge-owner.pending`, 'utf8')).toBe('corrupt');
});

test('failure after effect retains uncertain intent and refuses completion', async () => {
  const { root, plan } = fixture();
  await refuses(
    withDependencyOwner(
      plan,
      async (owner) => {
        await ownerDocker(owner, plan.layouts[0], async () => {
          await writeFile(`${root}/edge-owner.pending`, 'lost readback');
          return 'effect happened';
        })(['stop', 'exact']);
      },
      root,
    ),
    'owner publication',
  );
  expect(await readFile(`${root}/edge-owner-000001-intent.json`, 'utf8')).toContain('stop');
  expect(await Bun.file(`${root}/edge-owner-000001-readback.json`).exists()).toBe(false);
});

test('replaced lock inode refuses Docker even with live owner object', async () => {
  const { rename } = await import('node:fs/promises');
  const { root, plan } = fixture();
  let effects = 0;
  await refuses(
    withDependencyOwner(
      plan,
      async (owner) => {
        await rename(`${root}/deploy.lock`, `${root}/old.lock`);
        await writeFile(`${root}/deploy.lock`, '');
        await ownerDocker(owner, plan.layouts[0], () => {
          effects++;
          return Promise.resolve('');
        })(['stop']);
      },
      root,
    ),
    'does not name',
  );
  expect(effects).toBe(0);
});

for (const fault of ['invalid-sha', 'duplicate-environment', 'relative-directory'] as const) {
  test(`invalid owner plan ${fault} refuses before publication`, async () => {
    const { root, plan } = fixture();
    if (fault === 'invalid-sha') plan.sha = 'short';
    if (fault === 'duplicate-environment')
      plan.layouts.push({ ...plan.layouts[0], stateDir: scratchSync('duplicate-owner-') });
    if (fault === 'relative-directory') plan.layouts[0].stateDir = '.';
    await refuses(withDependencyOwner(plan, () => Promise.resolve(undefined), root));
    expect(await Bun.file(`${root}/edge-owner.pending`).exists()).toBe(false);
  });
}

async function refuses(promise: Promise<unknown>, message?: string): Promise<void> {
  let refused = false;
  try {
    await promise;
  } catch (cause) {
    refused = true;
    if (message !== undefined) expect(String(cause)).toContain(message);
  }
  expect(refused).toBe(true);
}

test('symlink lock refuses before owner publication', async () => {
  const { symlink, unlink } = await import('node:fs/promises');
  const { root, plan } = fixture();
  await writeFile(`${root}/foreign.lock`, 'retained evidence');
  await unlink(`${root}/edge.lock`);
  await symlink(`${root}/foreign.lock`, `${root}/edge.lock`);
  await refuses(
    withDependencyOwner(plan, () => Promise.resolve(undefined), root),
    'canonical lock',
  );
  expect(await Bun.file(`${root}/edge-owner.pending`).exists()).toBe(false);
  expect(await readFile(`${root}/foreign.lock`, 'utf8')).toBe('retained evidence');
});

test('pending owner refuses before callbacks and existing evidence survives interruption', async () => {
  const { root, plan } = fixture();
  await writeFile(`${root}/edge-owner.pending`, 'prior attempt');
  let calls = 0;
  await refuses(
    withDependencyOwner(
      plan,
      () => {
        calls++;
        return Promise.resolve();
      },
      root,
    ),
    'admission closed',
  );
  expect(calls).toBe(0);
  expect(await readFile(`${root}/edge-owner.pending`, 'utf8')).toBe('prior attempt');
});

test('dev poll and devsync are held before sorted prod dev deploy locks', async () => {
  const { mkdir } = await import('node:fs/promises');
  const { root, plan } = fixture();
  await mkdir(`${root}/dev`);
  const dev = { ...envLayout('dev'), root: `${root}/dev`, stateDir: `${root}/dev` };
  await withDependencyOwner(
    { sha: plan.sha, layouts: [dev, ...plan.layouts] },
    async (owner) => {
      for (const name of ['poll.lock', 'devsync.lock', 'deploy.lock'])
        await refuses(
          withLock(`${root}/dev/${name}`, () => Promise.resolve()),
          'lock held',
        );
      await assertDependencyOwner(owner, dev);
      const publication = await readFile(`${root}/edge-owner.pending`, 'utf8');
      expect(publication.indexOf('"env":"prod"')).toBeLessThan(publication.indexOf('"env":"dev"'));
    },
    root,
  );
});

test('foreign layout refuses before Docker', async () => {
  const { root, plan } = fixture();
  await withDependencyOwner(
    plan,
    async (owner) => {
      await refuses(
        ownerDocker(owner, { ...plan.layouts[0], network: 'foreign' }, () => Promise.resolve(''))([
          'stop',
        ]),
        'does not own layout',
      );
    },
    root,
  );
});

test('cancelled Docker boundary retains intent without running effect', async () => {
  const { root, plan } = fixture();
  let effects = 0;
  await withDependencyOwner(
    plan,
    async (owner) => {
      await refuses(
        ownerDocker(owner, plan.layouts[0], () => {
          effects++;
          return Promise.resolve('');
        })(['stop'], AbortSignal.abort()),
        'cancelled',
      );
    },
    root,
  );
  expect(effects).toBe(0);
  expect(await readFile(`${root}/edge-owner-000001-intent.json`, 'utf8')).toContain('stop');
});

test('empty plan refuses before owner publication', async () => {
  const { root, plan } = fixture();
  await refuses(
    withDependencyOwner({ sha: plan.sha, layouts: [] }, () => Promise.resolve(), root),
    'nonempty',
  );
});

test('overlapping environment deploy paths refuse before publication', async () => {
  const { root, plan } = fixture();
  const dev = { ...envLayout('dev'), root, stateDir: root };
  await refuses(
    withDependencyOwner(
      { sha: plan.sha, layouts: [...plan.layouts, dev] },
      () => Promise.resolve(),
      root,
    ),
    'overlap',
  );
});

for (const fault of ['absent', 'unreadable'] as const) {
  test(`trusted owner directory ${fault} refuses before publication`, async () => {
    const { chmod } = await import('node:fs/promises');
    const { root, plan } = fixture();
    const directory = fault === 'absent' ? `${root}/absent` : root;
    if (fault === 'unreadable') await chmod(root, 0o333);
    try {
      await refuses(withDependencyOwner(plan, () => Promise.resolve(), directory));
    } finally {
      if (fault === 'unreadable') await chmod(root, 0o700);
    }
    expect(await Bun.file(`${root}/edge-owner.pending`).exists()).toBe(false);
  });
}

for (const fault of ['absent', 'unreadable'] as const) {
  test(`trusted pending marker ${fault} refuses Docker and retains physical state`, async () => {
    const { chmod, unlink } = await import('node:fs/promises');
    const { root, plan } = fixture();
    let effects = 0;
    await withDependencyOwner(
      plan,
      async (owner) => {
        const path = `${root}/edge-owner.pending`;
        if (fault === 'absent') await unlink(path);
        else await chmod(path, 0o000);
        try {
          await refuses(
            ownerDocker(owner, plan.layouts[0], () => {
              effects++;
              return Promise.resolve('');
            })(['stop']),
          );
        } finally {
          if (fault === 'unreadable') await chmod(path, 0o600);
        }
      },
      root,
    );
    expect(effects).toBe(0);
  });
}

test('noncanonical layout root refuses before owner publication', async () => {
  const { symlink } = await import('node:fs/promises');
  const { root, plan } = fixture();
  const alias = `${root}/root-alias`;
  await symlink(root, alias);
  plan.layouts[0].root = alias;
  await refuses(
    withDependencyOwner(plan, () => Promise.resolve(), root),
    'canonical existing directory',
  );
  expect(await Bun.file(`${root}/edge-owner.pending`).exists()).toBe(false);
});

test('Docker interruption retains owner and intent without a fabricated readback', async () => {
  const { root, plan } = fixture();
  await refuses(
    withDependencyOwner(
      plan,
      async (owner) => {
        await ownerDocker(owner, plan.layouts[0], () =>
          Promise.reject(new Error('interrupted stop')),
        )(['stop', 'exact']);
      },
      root,
    ),
    'interrupted stop',
  );
  expect(await readFile(`${root}/edge-owner.pending`, 'utf8')).toContain(plan.sha);
  expect(await readFile(`${root}/edge-owner-000001-intent.json`, 'utf8')).toContain('stop');
  expect(await Bun.file(`${root}/edge-owner-000001-readback.json`).exists()).toBe(false);
});

test('retained committed owner also refuses new publisher before callback', async () => {
  const { root, plan } = fixture();
  await writeFile(`${root}/edge-owner.json`, '{}');
  let calls = 0;
  await refuses(
    withDependencyOwner(
      plan,
      () => {
        calls++;
        return Promise.resolve();
      },
      root,
    ),
    'admission closed',
  );
  expect(calls).toBe(0);
  expect(await Bun.file(`${root}/edge-owner.pending`).exists()).toBe(false);
});

test('held dev poll refuses before touching prod deploy lock', async () => {
  const { mkdir } = await import('node:fs/promises');
  const { root, plan } = fixture();
  await mkdir(`${root}/dev`);
  const dev = { ...envLayout('dev'), root: `${root}/dev`, stateDir: `${root}/dev` };
  await withLock(`${dev.stateDir}/poll.lock`, async () => {
    await refuses(
      withDependencyOwner(
        { sha: plan.sha, layouts: [dev, ...plan.layouts] },
        () => Promise.resolve(),
        root,
      ),
      'poll.lock',
    );
    expect(await Bun.file(`${root}/deploy.lock`).exists()).toBe(false);
    expect(await Bun.file(`${root}/edge.lock`).exists()).toBe(true);
  });
});

test('shared pending decoder preserves the existing publication and refuses unscoped restoration', async () => {
  const { decodeDependencyOwnerPublication } = await import('./edge-ownership');
  const { envLayout } = await import('./env');
  const publication = {
    format: 'dependency-edge-owner',
    version: 1,
    attempt: '12345678-1234-4123-8123-123456789abc',
    plan: { sha: 'a'.repeat(40), layouts: [envLayout('prod'), envLayout('dev')] },
  } as const;
  expect(decodeDependencyOwnerPublication(publication)).toEqual(publication);
  for (const value of [
    { ...publication, extra: true },
    {
      ...publication,
      plan: { ...publication.plan, layouts: [...publication.plan.layouts].reverse() },
    },
    { ...publication, attempt: 'foreign' },
    { ...publication, plan: { ...publication.plan, extra: true } },
    { ...publication, plan: { ...publication.plan, layouts: [envLayout('prod')] } },
    {
      ...publication,
      plan: { ...publication.plan, layouts: [envLayout('prod'), envLayout('prod')] },
    },
    {
      ...publication,
      plan: {
        ...publication.plan,
        layouts: [envLayout('prod'), { ...envLayout('dev'), authority: true }],
      },
    },
  ])
    expect(() => decodeDependencyOwnerPublication(value)).toThrow();
});

test('initial active policy refuses before creating or truncating lower locks', async () => {
  const { root, plan } = fixture();
  await writeFile(`${root}/edge.lock`, 'edge sentinel');
  await writeFile(`${root}/deploy.lock`, 'deploy sentinel');
  await writeFile(
    `${root}/edge-policy.json`,
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'active',
      edgeState: root,
      ownerPublicationSha256: 'a'.repeat(64),
      handoff: { name: 'edge-owner-123456-handoff-complete.json', sha256: 'b'.repeat(64) },
    }),
  );
  let entered = false;
  await refuses(
    withDependencyOwner(
      plan,
      async () => {
        await Promise.resolve();
        entered = true;
      },
      root,
    ),
    'ordinary controller',
  );
  expect(entered).toBe(false);
  expect(await readFile(`${root}/edge.lock`, 'utf8')).toBe('edge sentinel');
  expect(await readFile(`${root}/deploy.lock`, 'utf8')).toBe('deploy sentinel');
  expect(await Bun.file(`${root}/edge-owner.pending`).exists()).toBe(false);
});

test('initial owner rechecks its original ordinary policy after real lower-lock writes without rebasing same-byte replacement', async () => {
  const { root, plan } = fixture();
  await writeFile(`${root}/edge.lock`, 'edge sentinel');
  await writeFile(`${root}/deploy.lock`, 'lower sentinel');
  await writeFile(
    `${root}/edge-policy.json`,
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'ordinary',
      edgeState: root,
    }),
  );
  const program = `import * as fs from 'node:fs';import{mock}from'bun:test';const truncate=fs.ftruncateSync;let delivered=false;mock.module('node:fs',()=>({...fs,ftruncateSync:(descriptor,length)=>{truncate(descriptor,length);if(!delivered&&fs.readlinkSync('/proc/self/fd/'+descriptor)===${JSON.stringify(`${root}/deploy.lock`)}){const path=${JSON.stringify(`${root}/edge-policy.json`)};const bytes=fs.readFileSync(path);fs.renameSync(path,path+'.original');fs.writeFileSync(path,bytes);fs.writeFileSync(${JSON.stringify(`${root}/replacement-delivered`)},'delivered');delivered=true;}}}));const{withDependencyOwner}=await import(${JSON.stringify(`${import.meta.dir}/edge-ownership.ts`)});let refused=false;try{await withDependencyOwner(${JSON.stringify(plan)},async()=>{fs.writeFileSync(${JSON.stringify(`${root}/callback-entered`)},'entered');},${JSON.stringify(root)});}catch(cause){if(!String(cause).includes('ordinary controller policy changed'))throw cause;refused=true;}if(!delivered||!refused)throw new Error('original policy recheck boundary not observed');`;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();
  expect(await child.exited).toBe(0);
  expect(stdout + stderr).toBe('');
  expect(await readFile(`${root}/replacement-delivered`, 'utf8')).toBe('delivered');
  expect(await Bun.file(`${root}/callback-entered`).exists()).toBe(false);
  expect(await Bun.file(`${root}/edge-owner.pending`).exists()).toBe(false);
  expect(await readFile(`${root}/edge.lock`, 'utf8')).toBe('edge sentinel');
  expect(await readFile(`${root}/deploy.lock`, 'utf8')).toBe('');
});

for (const fault of ['active', 'restoring', 'marker', 'malformed'] as const) {
  test(`initial ${fault} refusal leaves all missing and existing lower locks unchanged`, async () => {
    const { root, plan } = fixture();
    const { mkdir } = await import('node:fs/promises');
    await mkdir(`${root}/dev`);
    const dev = { ...envLayout('dev'), root: `${root}/dev`, stateDir: `${root}/dev` };
    await writeFile(`${root}/edge.lock`, 'edge sentinel');
    await writeFile(`${root}/deploy.lock`, 'prod sentinel');
    await writeFile(`${root}/dev/devsync.lock`, 'dev sentinel');
    const ordinary = {
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'ordinary',
      edgeState: root,
    };
    const value =
      fault === 'active'
        ? {
            ...ordinary,
            phase: 'active',
            ownerPublicationSha256: 'a'.repeat(64),
            handoff: { name: 'edge-owner-123456-handoff-complete.json', sha256: 'b'.repeat(64) },
          }
        : fault === 'restoring'
          ? {
              ...ordinary,
              phase: 'restoring',
              ownerPublicationSha256: 'a'.repeat(64),
              restorationIntent: {
                name: 'edge-owner-123456-solver-restore-intent.json',
                sha256: 'b'.repeat(64),
              },
            }
          : ordinary;
    await writeFile(
      `${root}/edge-policy.json`,
      fault === 'malformed' ? '{bad' : JSON.stringify(value),
    );
    if (fault === 'marker') await writeFile(`${root}/edge-owner.pending`, 'retained');
    let entered = false;
    await refuses(
      withDependencyOwner(
        { ...plan, layouts: [...plan.layouts, dev] },
        async () => {
          await Promise.resolve();
          entered = true;
        },
        root,
      ),
    );
    expect(entered).toBe(false);
    expect(await readFile(`${root}/edge.lock`, 'utf8')).toBe('edge sentinel');
    expect(await readFile(`${root}/deploy.lock`, 'utf8')).toBe('prod sentinel');
    expect(await readFile(`${root}/dev/devsync.lock`, 'utf8')).toBe('dev sentinel');
    expect(await Bun.file(`${root}/dev/poll.lock`).exists()).toBe(false);
    expect(await Bun.file(`${root}/dev/deploy.lock`).exists()).toBe(false);
  });
}

test('initial owner refuses a missing existing edge lock without creating lower locks', async () => {
  const { root, plan } = fixture();
  const { unlink } = await import('node:fs/promises');
  await unlink(`${root}/edge.lock`);
  await refuses(
    withDependencyOwner(
      plan,
      async () => {
        await Promise.resolve();
        throw new Error('unexpected callback');
      },
      root,
    ),
  );
  expect(await Bun.file(`${root}/edge.lock`).exists()).toBe(false);
  expect(await Bun.file(`${root}/deploy.lock`).exists()).toBe(false);
  expect(await Bun.file(`${root}/edge-owner.pending`).exists()).toBe(false);
});
