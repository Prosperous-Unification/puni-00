import { createHash } from 'node:crypto';
import { existsSync, fstatSync, openSync, renameSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';
import type { Node } from 'typescript';

import { assertNoEdgeOwner } from './edge-admission';
import {
  assertDependencyOwner,
  type DependencyOwner,
  type DependencyOwnerPublication,
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
    plan: {
      sha: 'a'.repeat(40),
      layouts: [{ ...envLayout('prod'), root, stateDir: root }],
    },
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
      plan.layouts.push({
        ...plan.layouts[0],
        stateDir: scratchSync('duplicate-owner-'),
      });
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
  const dev = {
    ...envLayout('dev'),
    root: `${root}/dev`,
    stateDir: `${root}/dev`,
  };
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
  const dev = {
    ...envLayout('dev'),
    root: `${root}/dev`,
    stateDir: `${root}/dev`,
  };
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
    plan: {
      sha: 'a'.repeat(40),
      layouts: [envLayout('prod'), envLayout('dev')],
    },
  } as const;
  expect(decodeDependencyOwnerPublication(publication)).toEqual(publication);
  for (const value of [
    { ...publication, extra: true },
    {
      ...publication,
      plan: {
        ...publication.plan,
        layouts: [...publication.plan.layouts].reverse(),
      },
    },
    { ...publication, attempt: 'foreign' },
    { ...publication, plan: { ...publication.plan, extra: true } },
    {
      ...publication,
      plan: { ...publication.plan, layouts: [envLayout('prod')] },
    },
    {
      ...publication,
      plan: {
        ...publication.plan,
        layouts: [envLayout('prod'), envLayout('prod')],
      },
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
      handoff: {
        name: 'edge-owner-123456-handoff-complete.json',
        sha256: 'b'.repeat(64),
      },
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
  const child = Bun.spawn([process.execPath, '-e', program], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
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
    const dev = {
      ...envLayout('dev'),
      root: `${root}/dev`,
      stateDir: `${root}/dev`,
    };
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
            handoff: {
              name: 'edge-owner-123456-handoff-complete.json',
              sha256: 'b'.repeat(64),
            },
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

async function handoffFixture() {
  const { mkdir } = await import('node:fs/promises');
  const { root, plan } = fixture();
  await mkdir(`${root}/dev`);
  const layouts = {
    prod: plan.layouts[0],
    dev: { ...envLayout('dev'), root: `${root}/dev`, stateDir: `${root}/dev` },
  };
  return {
    root,
    layouts,
    plan: { sha: plan.sha, layouts: [layouts.prod, layouts.dev] },
  };
}

test('initial handoff primitives retain exact pending bytes and share activation sequence', async () => {
  const { createHash } = await import('node:crypto');
  const { lstat } = await import('node:fs/promises');
  const { basename } = await import('node:path');
  const { retainActivationRecord, retainInitialHandoffRecord, retainInitialHandoffManifest } =
    await import('./edge-ownership');
  const { root, layouts, plan } = await handoffFixture();
  const retained = await withDependencyOwner(
    plan,
    async (owner) => {
      const pending = await readFile(`${root}/edge-owner.pending`, 'utf8');
      const admission = await retainInitialHandoffRecord(owner, layouts, 'handoff-admission', {
        primitive: 'byte publication fixture',
      });
      const activation = await retainActivationRecord(owner, layouts, 'fenced-complete', {
        format: 'dependency-activation-fenced-complete',
        version: 1,
        activated: [],
        exposure: 'closed',
        controllers: 'fenced',
      });
      const writers = await retainInitialHandoffManifest(
        owner,
        layouts,
        'handoff-writers',
        'writers\n\n',
      );
      const source = await retainInitialHandoffManifest(
        owner,
        layouts,
        'handoff-source-manifest',
        'source\r\n',
      );
      const complete = await retainInitialHandoffRecord(owner, layouts, 'handoff-complete', {
        primitive: true,
      });
      return {
        pending,
        snapshots: [admission, activation, writers, source, complete],
      };
    },
    root,
  );
  expect(retained.snapshots.map((snapshot) => basename(snapshot.path))).toEqual([
    'edge-owner-000001-handoff-admission.json',
    'edge-owner-000002-activation-fenced-complete.json',
    'edge-owner-000003-handoff-writers.json',
    'edge-owner-000004-handoff-source-manifest.json',
    'edge-owner-000005-handoff-complete.json',
  ]);
  const parent = await lstat(root, { bigint: true });
  for (const snapshot of retained.snapshots) {
    const bytes = await readFile(snapshot.path);
    const named = await lstat(snapshot.path, { bigint: true });
    expect(bytes.toString('utf8')).toBe(snapshot.contents);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      createHash('sha256').update(snapshot.contents).digest('hex'),
    );
    expect(snapshot.device).toBe(String(named.dev));
    expect(snapshot.inode).toBe(String(named.ino));
    expect(snapshot.parentDevice).toBe(String(parent.dev));
    expect(snapshot.parentInode).toBe(String(parent.ino));
    expect(snapshot.mode).toBe(0o600);
    expect(named.nlink).toBe(1n);
  }
  expect(JSON.parse(retained.snapshots[0].contents)).toEqual({
    owner: retained.pending,
    record: { primitive: 'byte publication fixture' },
  });
  expect(retained.pending.endsWith('\n')).toBe(true);
  expect(retained.snapshots[2].contents).toBe('writers\n\n');
  expect(retained.snapshots[3].contents).toBe('source\r\n');
});

test('initial handoff envelope admits exact UTF8 byte maximum and refuses overflow before creation', async () => {
  const { readdir } = await import('node:fs/promises');
  const { retainInitialHandoffRecord } = await import('./edge-ownership');
  const { root, layouts, plan } = await handoffFixture();
  const observed = await withDependencyOwner(
    plan,
    async (owner) => {
      const pending = await readFile(`${root}/edge-owner.pending`, 'utf8');
      const overhead = Buffer.byteLength(
        JSON.stringify({ owner: pending, record: { payload: '' } }) + '\n',
      );
      const room = 65536 - overhead;
      const payload = 'é'.repeat(Math.floor(room / 2)) + 'x'.repeat(room % 2);
      let serializations = 0;
      const record = {
        toJSON() {
          serializations++;
          return { payload };
        },
      };
      const accepted = await retainInitialHandoffRecord(owner, layouts, 'handoff-intent', record);
      const before = await readdir(root);
      await refuses(
        retainInitialHandoffRecord(owner, layouts, 'exposure-intent', {
          payload: payload + 'x',
        }),
        'size',
      );
      const after = await readdir(root);
      const next = await retainInitialHandoffRecord(owner, layouts, 'exposure-complete', {
        primitive: true,
      });
      return { accepted, serializations, before, after, next };
    },
    root,
  );
  expect(Buffer.byteLength(observed.accepted.contents)).toBe(65536);
  expect(observed.serializations).toBe(1);
  expect(observed.after).toEqual(observed.before);
  expect(observed.next.path.endsWith('000002-exposure-complete.json')).toBe(true);
});

for (const [label, maximum] of [
  ['handoff-writers', 262144],
  ['handoff-source-manifest', 67108864],
] as const)
  test(`initial ${label} enforces exact raw UTF8 limit before exclusive creation`, async () => {
    const { readdir } = await import('node:fs/promises');
    const { retainInitialHandoffManifest } = await import('./edge-ownership');
    const { root, layouts, plan } = await handoffFixture();
    const observed = await withDependencyOwner(
      plan,
      async (owner) => {
        const contents = 'é'.repeat((maximum - 2) / 2) + '\n\n';
        const accepted = await retainInitialHandoffManifest(owner, layouts, label, contents);
        const before = await readdir(root);
        await refuses(retainInitialHandoffManifest(owner, layouts, label, contents + 'x'), 'size');
        await refuses(retainInitialHandoffManifest(owner, layouts, label, ''), 'size');
        const after = await readdir(root);
        return { accepted, before, after, contents };
      },
      root,
    );
    expect(Buffer.byteLength(observed.accepted.contents)).toBe(maximum);
    expect(observed.accepted.contents).toBe(observed.contents);
    expect(await readFile(observed.accepted.path, 'utf8')).toBe(observed.contents);
    expect(observed.after).toEqual(observed.before);
  });

test('initial handoff publishers refuse copied expired wrong-label and replaced owner state', async () => {
  const { rename, readdir } = await import('node:fs/promises');
  const { retainInitialHandoffRecord, retainInitialHandoffManifest } =
    await import('./edge-ownership');
  const { root, layouts, plan } = await handoffFixture();
  const owner = await withDependencyOwner(
    plan,
    async (owner) => {
      const before = await readdir(root);
      await refuses(
        retainInitialHandoffRecord({ ...owner }, layouts, 'handoff-admission', {}),
        'live',
      );
      await refuses(
        retainInitialHandoffManifest({ ...owner }, layouts, 'handoff-writers', 'x'),
        'live',
      );
      await refuses(
        retainInitialHandoffRecord(owner, layouts, '../foreign' as 'handoff-intent', {}),
        'label',
      );
      await refuses(
        retainInitialHandoffManifest(owner, layouts, 'handoff-intent' as 'handoff-writers', 'x'),
        'label',
      );
      expect(await readdir(root)).toEqual(before);
      await rename(`${root}/edge-owner.pending`, `${root}/pending.original`);
      await writeFile(`${root}/edge-owner.pending`, 'replaced pending\n');
      await refuses(
        retainInitialHandoffRecord(owner, layouts, 'handoff-intent', {}),
        'publication',
      );
      return owner;
    },
    root,
  );
  await refuses(retainInitialHandoffRecord(owner, layouts, 'handoff-intent', {}), 'live');
  await refuses(retainInitialHandoffManifest(owner, layouts, 'handoff-writers', 'x'), 'live');
});

for (const family of ['envelope', 'raw'] as const)
  for (const fault of [
    'file-sync',
    'directory-sync',
    'collision',
    'creation-mode',
    'absent',
    'unreadable',
    'public',
    'hardlink',
    'symlink',
    'fifo',
    'parent',
    'changed',
    'truncated',
    'same-byte-inode',
    'lock',
  ] as const)
    test(`initial ${family} publication refuses real ${fault} storage fault`, async () => {
      const { root, layouts, plan } = await handoffFixture();
      const program = `
        import * as fs from 'node:fs';
        import * as relative from ${JSON.stringify(`${import.meta.dir}/directory-file.ts`)};
        import { mock } from 'bun:test';
        const root = ${JSON.stringify(root)}, layouts = ${JSON.stringify(layouts)};
        const fault = ${JSON.stringify(fault)}, family = ${JSON.stringify(family)};
        const name = family === 'raw' ? 'edge-owner-000001-handoff-writers.json' : 'edge-owner-000001-handoff-intent.json';
        const path = root + '/' + name;
        const foreign = root + '/foreign';
        fs.writeFileSync(foreign, 'FOREIGN ORIGINAL', { mode: 0o600 });
        let writer, parent, injected = false, entered = false, failure;
        const openRelative = relative.openDirectoryFile, sync = fs.fsyncSync;
        mock.module(${JSON.stringify(`${import.meta.dir}/directory-file.ts`)}, () => ({ ...relative,
          openDirectoryFile(directory, target, flags) {
            const descriptor = openRelative(directory, target, flags);
            if (target === name && (flags & fs.constants.O_CREAT)) {
              writer = descriptor; parent = directory;
              if (fault === 'creation-mode') { fs.fchmodSync(descriptor, 0o644); injected = true; }
            }
            return descriptor;
          }
        }));
        mock.module('node:fs', () => ({ ...fs, fsyncSync(descriptor) {
          if (descriptor === writer && fault === 'file-sync') {
            injected = true; throw new Error('injected file sync failure');
          }
          sync(descriptor);
          if (descriptor !== parent || injected) return;
          if (fault === 'directory-sync') { injected = true; throw new Error('injected directory sync failure'); }
          if (fault === 'absent') fs.unlinkSync(path);
          else if (fault === 'unreadable') fs.chmodSync(path, 0);
          else if (fault === 'public') fs.chmodSync(path, 0o644);
          else if (fault === 'hardlink') fs.linkSync(path, path + '.link');
          else if (fault === 'symlink') { fs.renameSync(path, path + '.original'); fs.symlinkSync(foreign, path); }
          else if (fault === 'fifo') {
            fs.renameSync(path, path + '.original');
            const child = Bun.spawnSync(['mkfifo', path], { stdout: 'pipe', stderr: 'pipe' });
            if (child.exitCode !== 0 || child.stderr.length || child.stdout.length) throw new Error('FIFO fixture creation failed');
          }
          else if (fault === 'parent') { fs.renameSync(root, root + '.original'); fs.mkdirSync(root, {mode:0o700}); }
          else if (fault === 'changed') fs.writeFileSync(path, 'changed bytes');
          else if (fault === 'truncated') fs.truncateSync(path, 0);
          else if (fault === 'same-byte-inode') {
            const bytes = fs.readFileSync(path); fs.renameSync(path, path + '.original');
            fs.writeFileSync(path, bytes, { flag:'wx', mode:0o600 });
          }
          else return;
          injected = true;
        }}));
        const { withDependencyOwner, retainInitialHandoffRecord, retainInitialHandoffManifest } =
          await import(${JSON.stringify(`${import.meta.dir}/edge-ownership.ts`)});
        await withDependencyOwner(${JSON.stringify(plan)}, async owner => {
          entered = true;
          if (fault === 'collision') { fs.writeFileSync(path, 'FOREIGN COLLISION', {mode:0o600}); injected = true; }
          if (fault === 'lock') { fs.renameSync(root + '/deploy.lock', root + '/deploy.original'); fs.writeFileSync(root + '/deploy.lock', ''); injected = true; }
          try {
            if (family === 'raw') await retainInitialHandoffManifest(owner, layouts, 'handoff-writers', 'primitive raw bytes\\n');
            else await retainInitialHandoffRecord(owner, layouts, 'handoff-intent', {primitive: 'fixture'});
          } catch (cause) { failure = String(cause); }
        }, root);
        if (!entered || !injected || failure === undefined) throw new Error('required real fault refusal absent: ' + JSON.stringify({entered,injected,failure}));
        const expected = {
          'file-sync':'injected file sync', 'directory-sync':'injected directory sync',
          collision:'relative open failed', 'creation-mode':'private single-link',
          absent: family === 'raw' ? 'relative open failed' : 'ENOENT',
          unreadable: family === 'raw' ? 'relative open failed' : 'EACCES',
          public: family === 'raw' ? 'identity, type, mode or size' : 'identity, type or size',
          hardlink: family === 'raw' ? 'identity, type, mode or size' : 'original readback differs',
          symlink: family === 'raw' ? 'relative open failed' : 'ELOOP',
          fifo: family === 'raw' ? 'identity, type, mode or size' : 'identity, type or size',
          parent:'parent changed', changed: family === 'raw' ? 'identity, type, mode or size' : 'original readback differs',
          truncated: family === 'raw' ? 'identity, type, mode or size' : 'identity, type or size',
          'same-byte-inode': family === 'raw' ? 'identity, type, mode or size' : 'original readback differs',
          lock:'does not name'
        }[fault];
        if (!failure.includes(expected)) throw new Error('wrong boundary: ' + failure + '; expected ' + expected);
        const retainedRoot = fault === 'parent' ? root + '.original' : root;
        if (fs.readFileSync(retainedRoot + '/foreign','utf8') !== 'FOREIGN ORIGINAL') throw new Error('foreign bytes changed');
        if (fault === 'collision' && fs.readFileSync(path,'utf8') !== 'FOREIGN COLLISION') throw new Error('collision overwritten');
        console.log(JSON.stringify({ entered, injected, failure }));
      `;
      const child = Bun.spawn([process.execPath, '-e', program], {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe('');
      expect(JSON.parse(stdout)).toMatchObject({
        entered: true,
        injected: true,
      });
    });

for (const fault of [
  'none',
  'growth',
  'truncation',
  'replacement',
  'invalid-utf8',
  'changed-buffer',
] as const)
  test(`raw manifest bounded read retains original identity for ${fault}`, async () => {
    const { root, layouts, plan } = await handoffFixture();
    const program = `
      import * as fs from 'node:fs';
      import * as relative from ${JSON.stringify(`${import.meta.dir}/directory-file.ts`)};
      import { mock } from 'bun:test';
      const root = ${JSON.stringify(root)}, layouts = ${JSON.stringify(layouts)};
      const fault = ${JSON.stringify(fault)}, name = 'edge-owner-000001-handoff-source-manifest.json';
      const path = root + '/' + name, read = fs.readSync, openRelative = relative.openDirectoryFile;
      let reader, reached = false, failure, chunks = [];
      mock.module(${JSON.stringify(`${import.meta.dir}/directory-file.ts`)}, () => ({ ...relative,
        openDirectoryFile(directory, target, flags) {
          const descriptor = openRelative(directory, target, flags);
          if (target === name && !(flags & fs.constants.O_CREAT)) reader = descriptor;
          return descriptor;
        }
      }));
      mock.module('node:fs', () => ({ ...fs, readSync(descriptor, bytes, offset, length, position) {
        const count = read(descriptor, bytes, offset, length, position);
        if (descriptor === reader) {
          chunks.push(length);
          if (!reached) {
            reached = true;
            if (fault === 'growth') fs.appendFileSync(path, 'growth');
            if (fault === 'truncation') fs.truncateSync(path, 1048576);
            if (fault === 'replacement') { const original = fs.readFileSync(path); fs.renameSync(path,path+'.original'); fs.writeFileSync(path,original,{flag:'wx',mode:0o600}); }
            if (fault === 'invalid-utf8') bytes[offset] = 255;
            if (fault === 'changed-buffer') bytes[offset] = 98;
          }
        }
        return count;
      }}));
      const { withDependencyOwner, retainInitialHandoffManifest } = await import(${JSON.stringify(`${import.meta.dir}/edge-ownership.ts`)});
      await withDependencyOwner(${JSON.stringify(plan)}, async owner => {
        try { await retainInitialHandoffManifest(owner, layouts, 'handoff-source-manifest', 'a'.repeat(2097153)); }
        catch (cause) { failure = String(cause); }
      }, root);
      if (!reached || chunks.some(length => length > 1048576) || chunks.length > 3) throw new Error('bounded reader not reached');
      if (fault === 'none' ? failure !== undefined : failure === undefined) throw new Error('read refusal differs: ' + failure);
      if (fault === 'none' && JSON.stringify(chunks) !== '[1048576,1048576,1]') throw new Error('exact bounded chunks absent');
      const expected = {growth:'changed while reading', truncation:'truncated while reading', replacement:'changed while reading', 'invalid-utf8':'encoded', 'changed-buffer':'original readback differs'}[fault];
      if (fault !== 'none' && !failure.toLowerCase().includes(expected)) throw new Error('wrong reader boundary: '+failure);
      console.log(JSON.stringify({ reached, chunks, failure }));
    `;
    const child = Bun.spawn([process.execPath, '-e', program], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toMatchObject({ reached: true });
  });

test('initial envelope refuses serializer mutation of pending state before exclusive creation', async () => {
  const { readdir } = await import('node:fs/promises');
  const { retainInitialHandoffRecord } = await import('./edge-ownership');
  const { root, layouts, plan } = await handoffFixture();
  const names = await withDependencyOwner(
    plan,
    async (owner) => {
      await refuses(
        retainInitialHandoffRecord(owner, layouts, 'handoff-intent', {
          toJSON() {
            writeFileSync(`${root}/edge-owner.pending`, 'changed during serialization\n');
            return { primitive: true };
          },
        }),
        'publication',
      );
      return readdir(root);
    },
    root,
  );
  expect(names.filter((name) => name.includes('-handoff-intent.'))).toEqual([]);
});

test('UC2 known callback refusal releases runtime then outer original locks', async () => {
  const { withOwnerSolverRuntime } = await import('./edge-ownership');
  const { root, plan } = fixture();
  const refusal = new Error('known callback refusal');
  let originalOwner: DependencyOwner | undefined;
  let observed: unknown;
  try {
    await withDependencyOwner(
      plan,
      async (owner) => {
        originalOwner = owner;
        let runtimeFailure: unknown;
        try {
          await withOwnerSolverRuntime(owner, plan.layouts[0], () => Promise.reject(refusal));
        } catch (cause) {
          runtimeFailure = cause;
        }
        expect(runtimeFailure).toBe(refusal);
        await withLock(`${root}/solver-runtime.lock`, () => Promise.resolve(undefined));
        for (const name of ['edge.lock', 'deploy.lock'])
          await refuses(
            withLock(`${root}/${name}`, () => Promise.resolve(undefined)),
            'lock held',
          );
        await assertDependencyOwner(owner, plan.layouts[0]);
        throw refusal;
      },
      root,
    );
  } catch (cause) {
    observed = cause;
  }
  expect(observed).toBe(refusal);
  if (originalOwner === undefined) throw new Error('original owner callback absent');
  await refuses(assertDependencyOwner(originalOwner, plan.layouts[0]), 'live');
  for (const name of ['edge.lock', 'deploy.lock', 'solver-runtime.lock'])
    await withLock(`${root}/${name}`, () => Promise.resolve(undefined));
}, 10000);

test('UC2 core reserves one exact original composition under the owner', async () => {
  const custody = await import('./edge-ownership');
  expect('enrollDependencyPreparation' in custody).toBe(true);
  const { root, plan } = fixture();
  const source = `${root}/composition.txt`;
  writeFileSync(source, 'original composition');
  await withDependencyOwner(
    plan,
    async (owner) => {
      const binding = {
        layouts: plan.layouts,
        deadline: performance.now() + 10000,
        purpose: 'fenced' as const,
      };
      expect(() =>
        custody.enrollDependencyPreparation(owner, {
          ...binding,
          layouts: [{ ...plan.layouts[0], network: 'foreign' }],
        }),
      ).toThrow('association');
      expect(() =>
        custody.enrollDependencyPreparation(owner, {
          ...binding,
          deadline: performance.now() - 1,
        }),
      ).toThrow('association');
      const preparation = custody.enrollDependencyPreparation(owner, binding);
      const original = readFile(source);
      expect(custody.bindPreparationComposition(preparation, original)).toBe(original);
      expect(() => custody.enrollDependencyPreparation(owner, binding)).toThrow('composition');
      custody.assertDependencyPreparation(owner, preparation);
      const pending = await readFile(`${root}/edge-owner.pending`, 'utf8');
      // This one-layout mechanical fixture uses the actual pending bytes; the two-layout
      // production publication decoder is intentionally not its fixture grammar.
      const publication = JSON.parse(pending) as DependencyOwnerPublication;
      expect(() => {
        custody.assertPreparationPublication(preparation, publication, 'copied');
      }).toThrow('association');
      expect(() => {
        custody.assertPreparationPublication(
          preparation,
          { ...publication, attempt: 'copied' },
          pending,
        );
      }).toThrow('association');
      custody.assertPreparationPublication(preparation, publication, pending);
      expect(() => {
        custody.assertDependencyPreparation(owner, structuredClone(preparation));
      }).toThrow('identity');
      await original;
      custody.closeDependencyPreparation(preparation, 'release');
    },
    root,
  );
}, 10000);

test('UC2 core retains the exact original operation Promise and defers terminal close', async () => {
  const custody = await import('./edge-ownership');
  const { root, plan } = fixture();
  const source = `${root}/operation.txt`;
  writeFileSync(source, 'original operation');
  let descriptor = -1;
  await withDependencyOwner(
    plan,
    async (owner) => {
      const preparation = custody.enrollDependencyPreparation(owner, {
        layouts: plan.layouts,
        deadline: performance.now() + 10000,
        purpose: 'fenced',
      });
      const composition = readFile(source);
      expect(custody.bindPreparationComposition(preparation, composition)).toBe(composition);
      descriptor = openSync(source, 'r');
      custody.retainPreparationOriginal(preparation, {
        kind: 'descriptor',
        role: 'evidence',
        descriptor,
      });
      const operation = custody.beginPreparationOperation(preparation, 'evidence-inspection');
      const original = readFile(source);
      expect(custody.bindPreparationOperation(operation, original)).toBe(original);
      expect(custody.requestPreparationClose(preparation, 'release')).toBe('deferred');
      expect(() => fstatSync(descriptor)).not.toThrow();
      await original;
      await composition;
    },
    root,
  );
  expect(() => fstatSync(descriptor)).toThrow();
}, 10000);

test('UC2 core synchronous runtime callback refusal retains its cause and closes known originals', async () => {
  const custody = await import('./edge-ownership');
  const { root, plan } = fixture();
  const source = `${root}/runtime.txt`;
  writeFileSync(source, 'runtime refusal');
  const refusal = new Error('original synchronous runtime refusal');
  let descriptor = -1;
  await withDependencyOwner(
    plan,
    async (owner) => {
      const preparation = custody.enrollDependencyPreparation(owner, {
        layouts: plan.layouts,
        deadline: performance.now() + 10000,
        purpose: 'fenced',
      });
      const composition = readFile(source);
      expect(custody.bindPreparationComposition(preparation, composition)).toBe(composition);
      descriptor = openSync(source, 'r');
      custody.retainPreparationOriginal(preparation, {
        kind: 'descriptor',
        role: 'evidence',
        descriptor,
      });
      let observed: unknown;
      try {
        await custody.withOwnerSolverRuntime(owner, plan.layouts[0], () => {
          throw refusal;
        });
      } catch (cause) {
        observed = cause;
      }
      expect(observed).toBe(refusal);
      expect(() => fstatSync(descriptor)).toThrow();
      await withLock(`${root}/solver-runtime.lock`, () => Promise.resolve(undefined));
      await composition;
    },
    root,
  );
  for (const name of ['edge.lock', 'deploy.lock', 'solver-runtime.lock'])
    await withLock(`${root}/${name}`, () => Promise.resolve(undefined));
}, 10000);

test('UC2 missing transfer joins a genuine unawaited operation and closes its known original', async () => {
  const custody = await import('./edge-ownership');
  const { root, plan } = fixture();
  const source = `${root}/transfer.txt`;
  writeFileSync(source, Buffer.alloc(1024 * 1024, 0x61));
  let descriptor = -1;
  let operationOriginal: Promise<Buffer> | undefined;
  let operationObserver: Promise<void> | undefined;
  let operationSettled = false;
  try {
    await withDependencyOwner(
      plan,
      async (owner) => {
        const preparation = custody.enrollDependencyPreparation(owner, {
          layouts: plan.layouts,
          deadline: performance.now() + 10000,
          purpose: 'fenced',
        });
        const composition = readFile(source);
        void custody.bindPreparationComposition(preparation, composition);
        descriptor = openSync(source, 'r');
        custody.retainPreparationOriginal(preparation, {
          kind: 'descriptor',
          role: 'evidence',
          descriptor,
        });
        let refusal: unknown;
        try {
          await custody.withOwnerSolverRuntime(owner, plan.layouts[0], async () => {
            await refuses(
              withLock(`${root}/solver-runtime.lock`, () => Promise.resolve()),
              'lock held',
            );
            const operation = custody.beginPreparationOperation(preparation, 'evidence-inspection');
            operationOriginal = readFile(source);
            expect(custody.bindPreparationOperation(operation, operationOriginal)).toBe(
              operationOriginal,
            );
            operationObserver = operationOriginal.then(
              () => {
                operationSettled = true;
              },
              () => {
                operationSettled = true;
              },
            );
            expect(operationSettled).toBe(false);
          });
        } catch (cause) {
          refusal = cause;
        }
        expect(String(refusal)).toContain('evidence transfer absent');
        expect(operationSettled).toBe(true);
        expect(() => fstatSync(descriptor)).toThrow();
        await withLock(`${root}/solver-runtime.lock`, () => Promise.resolve());
        await composition;
      },
      root,
    );
  } finally {
    if (operationOriginal !== undefined && operationObserver !== undefined)
      await Promise.allSettled([operationOriginal, operationObserver]);
  }
  if (operationOriginal === undefined || operationObserver === undefined)
    throw new Error('genuine operation original and observer absent');
}, 10000);

test('UC2 transfer refuses without original storage and runtime association', async () => {
  const custody = await import('./edge-ownership');
  const { root, plan } = fixture();
  const source = `${root}/no-storage.txt`;
  writeFileSync(source, 'no storage');
  await withDependencyOwner(
    plan,
    async (owner) => {
      const preparation = custody.enrollDependencyPreparation(owner, {
        layouts: plan.layouts,
        deadline: performance.now() + 10000,
        purpose: 'fenced',
      });
      const composition = readFile(source);
      void custody.bindPreparationComposition(preparation, composition);
      expect(() => {
        custody.transferPreparationEvidence(preparation);
      }).toThrow('association');
      let refusal: unknown;
      try {
        await custody.withOwnerSolverRuntime(owner, plan.layouts[0], () =>
          Promise.resolve().then(() => {
            custody.transferPreparationEvidence(preparation);
          }),
        );
      } catch (cause) {
        refusal = cause;
      }
      expect(String(refusal)).toContain('transfer association');
      await composition;
    },
    root,
  );
}, 10000);

test('UC2 revoked projection binding refuses the same original Promise', async () => {
  const custody = await import('./edge-ownership');
  const { root, plan } = fixture();
  const source = `${root}/projection.txt`;
  writeFileSync(source, 'projection');
  await withDependencyOwner(
    plan,
    async (owner) => {
      const preparation = custody.enrollDependencyPreparation(owner, {
        layouts: plan.layouts,
        deadline: performance.now() + 10000,
        purpose: 'fenced',
      });
      const composition = readFile(source);
      void custody.bindPreparationComposition(preparation, composition);
      expect(custody.requestPreparationClose(preparation, 'release')).toBe('deferred');
      expect(() => {
        void custody.bindPreparationProjection(preparation, composition);
      }).toThrow('active');
      await composition;
    },
    root,
  );
}, 10000);

test('UC2 replaced runtime inode refuses preparation and operation observation', async () => {
  const custody = await import('./edge-ownership');
  const { root, plan } = fixture();
  const source = `${root}/runtime-inode.txt`;
  writeFileSync(source, 'runtime inode');
  let descriptor = -1;
  await withDependencyOwner(
    plan,
    async (owner) => {
      const preparation = custody.enrollDependencyPreparation(owner, {
        layouts: plan.layouts,
        deadline: performance.now() + 10000,
        purpose: 'fenced',
      });
      const composition = readFile(source);
      void custody.bindPreparationComposition(preparation, composition);
      descriptor = openSync(source, 'r');
      custody.retainPreparationOriginal(preparation, {
        kind: 'descriptor',
        role: 'evidence',
        descriptor,
      });
      const operation = custody.beginPreparationOperation(preparation, 'evidence-inspection');
      const original = readFile(source);
      expect(custody.bindPreparationOperation(operation, original)).toBe(original);
      let refusal: unknown;
      try {
        await custody.withOwnerSolverRuntime(owner, plan.layouts[0], () =>
          Promise.resolve().then(() => {
            const named = `${root}/solver-runtime.lock`;
            const retained = `${root}/solver-runtime.original.lock`;
            const replacement = `${root}/solver-runtime.replacement.lock`;
            renameSync(named, retained);
            try {
              writeFileSync(named, 'replacement');
              expect(() => {
                custody.assertDependencyPreparation(owner, preparation);
              }).toThrow('lock');
              expect(() => {
                custody.assertPreparationOperation(operation);
              }).toThrow('lock');
            } finally {
              try {
                if (existsSync(named)) renameSync(named, replacement);
              } finally {
                renameSync(retained, named);
              }
            }
          }),
        );
      } catch (cause) {
        refusal = cause;
      }
      expect(String(refusal)).toContain('evidence transfer absent');
      expect(() => fstatSync(descriptor)).toThrow();
      await original;
      await composition;
    },
    root,
  );
}, 10000);

test('UC2 owner observes a discarded original runtime admission before releasing outer locks', async () => {
  const custody = await import('./edge-ownership');
  const { root, plan } = fixture();
  let original: Promise<void> | undefined;
  let observer: Promise<void> | undefined;
  let callbackCount = 0;
  let terminal: unknown;
  let terminalAtOwnerReturn: unknown;
  try {
    await withDependencyOwner(
      plan,
      (owner) => {
        original = custody.withOwnerSolverRuntime(owner, plan.layouts[0], () => {
          callbackCount++;
          return Promise.resolve();
        });
        observer = original.then(
          () => {
            terminal = 'fulfilled';
          },
          (cause: unknown) => {
            terminal = cause;
          },
        );
        return Promise.resolve();
      },
      root,
    );
    terminalAtOwnerReturn = terminal;
  } finally {
    if (original !== undefined && observer !== undefined)
      await Promise.allSettled([original, observer]);
  }
  if (original === undefined || observer === undefined)
    throw new Error('original runtime admission and observer absent');
  expect(callbackCount).toBe(0);
  expect(String(terminalAtOwnerReturn)).toContain('active');
  for (const name of ['edge.lock', 'deploy.lock'])
    await withLock(`${root}/${name}`, () => Promise.resolve());
}, 10000);

function makeOrdinaryHoldImage(
  titleDigest: string,
  modules: readonly { readonly relative: string; readonly mode: string }[],
) {
  const source = new TextEncoder().encode('source');
  const sourceSha = createHash('sha256').update(source).digest('hex');
  const sourcePins = modules.map((entry) => ({
    path: `/ordinary-hold/${entry.relative}`,
    bytes: source.byteLength,
    sha256: sourceSha,
  }));
  const pin = sourcePins[0];
  const mapping = {
    mode: 'transform' as const,
    path: pin.path,
    inputSha256: pin.sha256,
    outputSha256: createHash('sha256').update('observed').digest('hex'),
    cuts: [{ before: 'source', after: 'observed', count: 1 }],
  };
  const mappings = [
    mapping,
    ...modules.slice(1).map((entry) =>
      entry.mode === 'transform'
        ? {
            mode: 'transform' as const,
            path: `/ordinary-hold/${entry.relative}`,
            inputSha256: sourceSha,
            outputSha256: mapping.outputSha256,
            cuts: [{ before: 'source', after: 'observed', count: 1 }],
          }
        : {
            mode: entry.mode as 'pinned-pass-through' | 'external-unchanged',
            path: `/ordinary-hold/${entry.relative}`,
            sha256: sourceSha,
          },
    ),
  ];
  const image = {
    format: 'dependency-owner-ordinary-hold-image',
    sourceEpoch: 'ordinary-febb-custody-v1',
    version: 1,
    sourceRoot: '/ordinary-hold',
    sourceIdentity: 'c'.repeat(40),
    sourcePins,
    mappings,
    mappingDigest: createHash('sha256').update(JSON.stringify(mappings)).digest('hex'),
    titleDigest,
  };
  return {
    image,
    source,
    pin,
    mapping,
    supplied: new Map(sourcePins.map((entry) => [entry.path, source])),
  };
}

test('UC2 ordinary HOLD V1 image rejects malformed source and map metadata before acquisition', async () => {
  const {
    decodeOrdinaryHoldImageV1,
    materializeOrdinaryHoldImageV1,
    ordinaryHoldCasesV1,
    ordinaryHoldModuleModesV1,
    ordinaryHoldTitleDigestV1,
  } = await import('../fixtures/dependency-owner-custody');
  const { image, pin, mapping, supplied } = makeOrdinaryHoldImage(
    ordinaryHoldTitleDigestV1,
    ordinaryHoldModuleModesV1,
  );
  expect(ordinaryHoldCasesV1).toHaveLength(39);
  expect(createHash('sha256').update(JSON.stringify(ordinaryHoldCasesV1)).digest('hex')).toBe(
    ordinaryHoldTitleDigestV1,
  );
  const decoded = decodeOrdinaryHoldImageV1(image);
  expect(decoded.mappings).toHaveLength(ordinaryHoldModuleModesV1.length);
  const materialized = materializeOrdinaryHoldImageV1(decoded, supplied);
  expect(new TextDecoder().decode(materialized.get(pin.path))).toBe('observed');
  const scannerPath =
    '/ordinary-hold/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts';
  expect(materialized.get(scannerPath)).toBe(supplied.get(scannerPath));
  const scannerIndex = image.mappings.findIndex((entry) => entry.path === scannerPath);
  expect(scannerIndex).toBeGreaterThanOrEqual(0);
  expect(() =>
    decodeOrdinaryHoldImageV1({
      ...image,
      mappings: image.mappings.map((entry, index) =>
        index === scannerIndex
          ? {
              mode: 'pinned-pass-through',
              path: scannerPath,
              sha256: pin.sha256,
            }
          : entry,
      ),
    }),
  ).toThrow('mode');
  expect(() =>
    materializeOrdinaryHoldImageV1(
      {
        ...decoded,
        mappings: [
          { ...mapping, cuts: [{ ...mapping.cuts[0], count: 2 }] },
          ...decoded.mappings.slice(1),
        ],
      },
      supplied,
    ),
  ).toThrow('cardinality');
  expect(() => decodeOrdinaryHoldImageV1({ ...image, version: 2 })).toThrow('version');
  expect(() => decodeOrdinaryHoldImageV1({ ...image, extra: true })).toThrow('field');
  expect(() =>
    decodeOrdinaryHoldImageV1({
      ...image,
      sourcePins: [pin, ...image.sourcePins.slice(1, -1), pin],
    }),
  ).toThrow('duplicate');
  expect(() =>
    decodeOrdinaryHoldImageV1({
      ...image,
      mappings: [mapping, ...image.mappings.slice(1, -1), mapping],
    }),
  ).toThrow('duplicate');
  expect(() =>
    decodeOrdinaryHoldImageV1({
      ...image,
      mappings: [{ ...mapping, path: '/ordinary-hold/near-source.ts' }, ...image.mappings.slice(1)],
    }),
  ).toThrow('pin');
  expect(() =>
    decodeOrdinaryHoldImageV1({
      ...image,
      mappings: [
        { ...mapping, cuts: [{ ...mapping.cuts[0], count: 0 }] },
        ...image.mappings.slice(1),
      ],
    }),
  ).toThrow('count');
  expect(() =>
    decodeOrdinaryHoldImageV1({
      ...image,
      mappings: image.mappings.slice(1),
    }),
  ).toThrow('roster');
}, 10000);

test('UC2 ordinary HOLD V1 admission plans exact full and local selections without helper entry', async () => {
  const {
    ordinaryHoldCasesV1,
    ordinaryHoldModuleModesV1,
    ordinaryHoldTitleDigestV1,
    planOrdinaryHoldAdmissionV1,
  } = await import('../fixtures/dependency-owner-custody');
  const { image } = makeOrdinaryHoldImage(ordinaryHoldTitleDigestV1, ordinaryHoldModuleModesV1);
  const executable = '/usr/local/bin/bun';
  const project = '/ordinary-hold/tools/tool-remote-scripts';
  const normalOptions = ['--preload', '../test/scratch/preload.ts', '--timeout=10000'];
  const invocation = {
    format: 'dependency-owner-ordinary-hold-invocation',
    version: 1,
    sourceRoot: '/ordinary-hold',
    cwd: project,
    executable,
    executableVersion: '1.4.4',
    argv: [executable, 'test', './src/lib/dependency-activation-storage.test.ts', ...normalOptions],
    environment: {},
    configuration: { kind: 'absent', path: null, sha256: null },
  };
  const storage = planOrdinaryHoldAdmissionV1(image, invocation);
  expect(storage.mode).toBe('prepare');
  expect(storage.profile).toBe('storage-leaf');
  expect(storage.caseIds).toHaveLength(39);
  const discovery = [
    'src',
    'test/edge-init.test.ts',
    'test/solver-drain-transport.test.ts',
    'test/solver-drain-fixture.test.ts',
    'test/source-exclusion-transport.test.ts',
    'test/source-exclusion-topology.test.ts',
    'test/source-exclusion-native.test.ts',
    'test/fixture-failure.test.ts',
  ];
  const canonical = planOrdinaryHoldAdmissionV1(image, {
    ...invocation,
    argv: [
      executable,
      'test',
      ...discovery,
      ...normalOptions,
      '--path-ignore-patterns=src/lib/initial-handoff-graph.test.ts',
      '--path-ignore-patterns=acceptance/dependency-owner-custody.test.ts',
    ],
  });
  expect(canonical.mode).toBe('prepare');
  expect(canonical.profile).toBe('canonical-remote');
  expect(canonical.caseIds).toEqual(storage.caseIds);
  const localPrefix = [
    executable,
    'test',
    '--no-env-file',
    '--config=/tmp/ordinary-hold-empty-bunfig.toml',
    '--preload',
    './tools/test/scratch/preload.ts',
    '--timeout=10000',
    'tools/tool-remote-scripts/src/lib/dependency-activation-storage.test.ts',
  ];
  const local = {
    ...invocation,
    cwd: '/ordinary-hold',
    configuration: {
      kind: 'empty-explicit',
      path: '/tmp/ordinary-hold-empty-bunfig.toml',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    environment: {
      PUNI_ORDINARY_HOLD_SELECTION: ordinaryHoldCasesV1[0].caseId,
    },
    argv: [...localPrefix, `--test-name-pattern=^${ordinaryHoldCasesV1[0].title}$`],
  };
  const selected = planOrdinaryHoldAdmissionV1(image, local);
  expect(selected.mode).toBe('prepare');
  expect(selected.caseIds).toEqual([ordinaryHoldCasesV1[0].caseId]);
  const known = planOrdinaryHoldAdmissionV1(image, {
    ...local,
    environment: { PUNI_ORDINARY_HOLD_SELECTION: 'known-only' },
    argv: [
      ...localPrefix,
      '--test-name-pattern=^initial fenced envelope LF is admitted before the actual fenced publication$',
    ],
  });
  expect(known).toEqual({
    mode: 'not-selected',
    profile: 'local-exact',
    caseIds: [],
  });
  expect(() =>
    planOrdinaryHoldAdmissionV1(image, {
      ...local,
      argv: [...localPrefix, '--test-name-pattern=^UC2'],
    }),
  ).toThrow('selection');
  expect(() =>
    planOrdinaryHoldAdmissionV1(image, {
      ...invocation,
      environment: { BUN_TEST_TIMEOUT: '1' },
    }),
  ).toThrow('override');
  expect(() =>
    planOrdinaryHoldAdmissionV1(image, {
      ...invocation,
      environment: { PUNI_ORDINARY_HOLD_SELECTION: undefined },
    }),
  ).toThrow('selection');
  expect(() =>
    planOrdinaryHoldAdmissionV1(image, {
      ...invocation,
      executable: '/foreign/bun',
    }),
  ).toThrow('executable');
}, 10000);

test('UC2 ordinary HOLD V1 packet decoder binds exact case title and invocation grammar', async () => {
  const { decodeOrdinaryHoldObservationV1, ordinaryHoldCasesV1, ordinaryHoldTitleDigestV1 } =
    await import('../fixtures/dependency-owner-custody');
  const row = ordinaryHoldCasesV1[0];
  const packet = {
    format: 'dependency-owner-ordinary-hold',
    version: 1,
    invocationId: '11111111-1111-4111-8111-111111111111',
    caseId: row.caseId,
    title: row.title,
    production: 'runtime-hold',
    retirement: 'known-originals-closed',
    failures: ['native-close'],
    imageDigest: 'a'.repeat(64),
    titleDigest: ordinaryHoldTitleDigestV1,
    evidenceDigest: 'b'.repeat(64),
  };
  expect(decodeOrdinaryHoldObservationV1(packet).caseId).toBe(row.caseId);
  expect(() => decodeOrdinaryHoldObservationV1({ ...packet, title: 'foreign' })).toThrow('title');
  expect(() => decodeOrdinaryHoldObservationV1({ ...packet, invocationId: 'old' })).toThrow(
    'invocation',
  );
  expect(() => decodeOrdinaryHoldObservationV1({ ...packet, failures: ['raw cause'] })).toThrow(
    'oracle code',
  );
  expect(() => decodeOrdinaryHoldObservationV1({ ...packet, extra: true })).toThrow('field');
}, 10000);

test('UC2 completion preserves the original body refusal after known cleanup', async () => {
  const custody = await import('./edge-ownership');
  const { root, plan } = fixture();
  const present = `${root}/completion-present.txt`;
  const absent = `${root}/completion-absent.txt`;
  writeFileSync(present, 'known completion bytes');
  let descriptor = -1;
  await withDependencyOwner(
    plan,
    async (owner) => {
      const preparation = custody.enrollDependencyPreparation(owner, {
        layouts: plan.layouts,
        deadline: performance.now() + 10000,
        purpose: 'fenced',
      });
      const body = readFile(absent);
      expect(custody.bindPreparationComposition(preparation, body)).toBe(body);
      descriptor = openSync(present, 'r');
      custody.retainPreparationOriginal(preparation, {
        kind: 'descriptor',
        role: 'evidence',
        descriptor,
      });
      const operation = custody.beginPreparationOperation(preparation, 'evidence-inspection');
      const operationOriginal = readFile(present);
      expect(custody.bindPreparationOperation(operation, operationOriginal)).toBe(
        operationOriginal,
      );
      let operationBytes: Buffer | undefined;
      let operationCause: unknown;
      let operationTerminal = false;
      const operationObserver = operationOriginal.then(
        (bytes) => {
          operationBytes = bytes;
          operationTerminal = true;
        },
        (cause: unknown) => {
          operationCause = cause;
          operationTerminal = true;
        },
      );
      let bodyCause: unknown;
      const projection = body.then(
        () => {
          throw new Error('unexpected successful completion body');
        },
        async (cause: unknown) => {
          bodyCause = cause;
          await custody.assertPreparationCompletion(preparation);
          throw new Error('unexpected completion acceptance');
        },
      );
      expect(custody.bindPreparationProjection(preparation, projection)).toBe(projection);
      let projectionCause: unknown;
      let operationTerminalAtProjection = false;
      let descriptorClosedAtProjection = false;
      const projectionObserver = projection.then(
        () => {
          projectionCause = new Error('unexpected successful completion projection');
        },
        (cause: unknown) => {
          projectionCause = cause;
          operationTerminalAtProjection = operationTerminal;
          try {
            fstatSync(descriptor);
          } catch {
            descriptorClosedAtProjection = true;
          }
        },
      );
      try {
        expect(custody.requestPreparationClose(preparation, 'operation')).toBe('deferred');
        await projectionObserver;
        expect(bodyCause).toBeInstanceOf(Error);
        expect(bodyCause).toHaveProperty('code', 'ENOENT');
        expect(projectionCause).toBe(bodyCause);
        expect(operationCause).toBeUndefined();
        expect(operationBytes?.toString()).toBe('known completion bytes');
        expect(operationTerminalAtProjection).toBe(true);
        expect(descriptorClosedAtProjection).toBe(true);
      } finally {
        await Promise.allSettled([
          body,
          operationOriginal,
          operationObserver,
          projection,
          projectionObserver,
        ]);
      }
    },
    root,
  );
  for (const name of ['edge.lock', 'deploy.lock'])
    await withLock(`${root}/${name}`, () => Promise.resolve());
}, 10000);

test('UC2 ordinary HOLD literal source cut preserves replacement tokens', async () => {
  const {
    decodeOrdinaryHoldImageV1,
    materializeOrdinaryHoldImageV1,
    ordinaryHoldModuleModesV1,
    ordinaryHoldTitleDigestV1,
  } = await import('../fixtures/dependency-owner-custody');
  const { image, supplied } = makeOrdinaryHoldImage(
    ordinaryHoldTitleDigestV1,
    ordinaryHoldModuleModesV1,
  );
  const path = image.sourcePins[0].path;
  const original = new TextEncoder().encode('aXb');
  const replacement = "$& $$ $` $'";
  const expected = new TextEncoder().encode(`a${replacement}b`);
  const pin = {
    ...image.sourcePins[0],
    bytes: original.byteLength,
    sha256: createHash('sha256').update(original).digest('hex'),
  };
  const mapping = {
    mode: 'transform' as const,
    path,
    inputSha256: pin.sha256,
    outputSha256: createHash('sha256').update(expected).digest('hex'),
    cuts: [{ before: 'X', after: replacement, count: 1 }],
  };
  const mappings = [mapping, ...image.mappings.slice(1)];
  const decoded = decodeOrdinaryHoldImageV1({
    ...image,
    sourcePins: [pin, ...image.sourcePins.slice(1)],
    mappings,
    mappingDigest: createHash('sha256').update(JSON.stringify(mappings)).digest('hex'),
  });
  const actualSources = new Map(supplied);
  actualSources.set(path, original);
  expect(materializeOrdinaryHoldImageV1(decoded, actualSources).get(path)).toEqual(expected);
}, 10000);

test('UC2 ordinary HOLD packet refuses sparse oracle failures', async () => {
  const { decodeOrdinaryHoldObservationV1, ordinaryHoldCasesV1, ordinaryHoldTitleDigestV1 } =
    await import('../fixtures/dependency-owner-custody');
  const row = ordinaryHoldCasesV1[0];
  const packet = {
    format: 'dependency-owner-ordinary-hold',
    version: 1,
    invocationId: '11111111-1111-4111-8111-111111111111',
    caseId: row.caseId,
    title: row.title,
    production: 'runtime-hold',
    retirement: 'known-originals-closed',
    failures: new Array<string>(1),
    imageDigest: 'a'.repeat(64),
    titleDigest: ordinaryHoldTitleDigestV1,
    evidenceDigest: 'b'.repeat(64),
  };
  expect(() => decodeOrdinaryHoldObservationV1(packet)).toThrow('oracle code');
}, 10000);

test('UC2 ordinary HOLD V1 fixed source epoch pins actual compiler inputs', async () => {
  const { ordinaryHoldSourceEpochV1, ordinaryHoldModuleModesV1 } =
    await import('../fixtures/dependency-owner-custody');
  expect(ordinaryHoldSourceEpochV1.sourceIdentity).toBe('febb1c24427b2d368aa2d6446d6000dc1faabdb3');
  expect(ordinaryHoldSourceEpochV1.pins).toHaveLength(17);
  expect(
    createHash('sha256').update(JSON.stringify(ordinaryHoldSourceEpochV1.pins)).digest('hex'),
  ).toBe('214a79bb76c1f85f0411b550a72f4c8b98963953eb0a1f055324a56fb5aa1325');
  expect(ordinaryHoldSourceEpochV1.pins.map((pin) => pin.relative)).toEqual(
    ordinaryHoldModuleModesV1.map((entry) => entry.relative),
  );
  const root = new URL('../../../../', import.meta.url);
  for (const pin of ordinaryHoldSourceEpochV1.pins) {
    const bytes = await readFile(new URL(pin.relative, root));
    expect(bytes.byteLength).toBe(pin.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(pin.sha256);
  }
}, 10000);

test('UC2 ordinary HOLD V1 resolver keeps classifier identity and scanner external', async () => {
  const { resolveOrdinaryHoldImportV1 } = await import('../fixtures/dependency-owner-custody');
  const root = '/ordinary-hold';
  const owner = `${root}/tools/tool-remote-scripts/src/lib/edge-ownership.ts`;
  const storage = `${root}/tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts`;
  const database = `${root}/libs/wbs/adapters/store-sqlite/src/db.ts`;
  const backup = `${root}/libs/wbs/adapters/store-sqlite/src/backup.ts`;
  const cleanup = `${root}/libs/wbs/adapters/store-sqlite/src/sqlite-cleanup.ts`;
  const graph = `${root}/tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts`;
  const scanner = `${root}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
  expect(resolveOrdinaryHoldImportV1(root, owner, '@wbs/store-sqlite/backup')).toEqual({
    path: backup,
    external: false,
  });
  expect(resolveOrdinaryHoldImportV1(root, backup, './db')).toEqual({
    path: database,
    external: false,
  });
  expect(resolveOrdinaryHoldImportV1(root, owner, '@wbs/store-sqlite/sqlite-cleanup')).toEqual({
    path: cleanup,
    external: false,
  });
  expect(resolveOrdinaryHoldImportV1(root, database, './sqlite-cleanup')).toEqual({
    path: cleanup,
    external: false,
  });
  expect(resolveOrdinaryHoldImportV1(root, storage, '@wbs/store-sqlite/db')).toEqual({
    path: database,
    external: false,
  });
  expect(resolveOrdinaryHoldImportV1(root, storage, './initial-handoff-graph')).toEqual({
    path: graph,
    external: false,
  });
  expect(
    resolveOrdinaryHoldImportV1(root, owner, './dependency-migration-artifact-scanner'),
  ).toEqual({
    path: scanner,
    external: true,
  });
  expect(resolveOrdinaryHoldImportV1(root, owner, './managed-cohort')).toBeUndefined();
  expect(resolveOrdinaryHoldImportV1(root, owner, '@wbs/store-sqlite/db-near')).toBeUndefined();
  expect(() => resolveOrdinaryHoldImportV1(root, owner, 'ordinary-hold-v1:unknown')).toThrow(
    'port',
  );
}, 10000);

test('UC2 ordinary HOLD V1 concrete compiler plan transforms pinned production modules', async () => {
  const { planOrdinaryHoldBuildV1, ordinaryHoldSourceEpochV1 } =
    await import('../fixtures/dependency-owner-custody');
  const rootUrl = new URL('../../../../', import.meta.url);
  const sourceRoot = rootUrl.pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of ordinaryHoldSourceEpochV1.pins)
    supplied.set(`${sourceRoot}/${pin.relative}`, await readFile(new URL(pin.relative, rootUrl)));
  const planned = planOrdinaryHoldBuildV1(sourceRoot, supplied);
  expect(planned.image.sourceIdentity).toBe(ordinaryHoldSourceEpochV1.sourceIdentity);
  expect(planned.image.mappings).toHaveLength(17);
  expect(planned.appliedCuts.length).toBeGreaterThan(13);
  expect(planned.materialized.size).toBe(17);
  for (const mapping of planned.image.mappings) {
    const original = supplied.get(mapping.path);
    const transformed = planned.materialized.get(mapping.path);
    expect(original).toBeDefined();
    expect(transformed).toBeDefined();
    if (mapping.mode === 'transform') expect(transformed).not.toEqual(original);
    else expect(transformed).toEqual(original);
  }
  const scanner = `${sourceRoot}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
  expect(planned.image.mappings.find((entry) => entry.path === scanner)?.mode).toBe(
    'external-unchanged',
  );
  expect(planned.portSources.has('ordinary-hold-v1:ledger')).toBe(true);
  for (const id of [
    'owner.settlement-observer',
    'owner.operation-observer',
    'owner.runtime-entry',
    'owner.keeper',
    'owner.original',
    'owner.hold',
  ])
    expect(planned.appliedCuts.find((cut) => cut.id === id)).toEqual({ id, count: 1 });
  expect(planned.portSources.has('ordinary-hold-v1:owner-fs')).toBe(true);
  const frontend = `${sourceRoot}/tools/tool-remote-scripts/src/fixtures/source-frontend-profile.ts`;
  const completeFixture = `${sourceRoot}/tools/tool-remote-scripts/src/fixtures/dependency-complete-activation.ts`;
  const frontendSource = new TextDecoder().decode(planned.materialized.get(frontend));
  const completeSource = new TextDecoder().decode(planned.materialized.get(completeFixture));
  expect(frontendSource).toContain(`const ROOT = ${JSON.stringify(sourceRoot)};`);
  expect(frontendSource).not.toContain("resolve(import.meta.dir, '../../../..')");
  expect(completeSource).toContain(
    `const migrationsDirectory = ${JSON.stringify(`${sourceRoot}/apps/wbs/be-01/drizzle`)};`,
  );
  expect(completeSource).not.toContain(
    "new URL('../../../../apps/wbs/be-01/drizzle', import.meta.url)",
  );
  expect(planned.appliedCuts.filter((cut) => cut.id === 'setup.frontend-root')).toEqual([
    { id: 'setup.frontend-root', count: 1 },
  ]);
  expect(planned.appliedCuts.filter((cut) => cut.id === 'setup.migration-root')).toEqual([
    { id: 'setup.migration-root', count: 1 },
  ]);
}, 10000);

test('UC2 ordinary HOLD V1 probe-backed port and compiler metadata identities', async () => {
  const { identifyOrdinaryHoldMetafilePathV1, resolveOrdinaryHoldPortImportV1 } =
    await import('../fixtures/dependency-owner-custody');
  const root = '/ordinary-hold';
  const scanner = `${root}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
  const database = `${root}/libs/wbs/adapters/store-sqlite/src/db.ts`;
  expect(identifyOrdinaryHoldMetafilePathV1(root, '/work/repo', '../../tmp/entry.ts')).toBe(
    '/tmp/entry.ts',
  );
  expect(identifyOrdinaryHoldMetafilePathV1(root, '/work/repo', 'ordinary-hold-v1:ledger')).toBe(
    'ordinary-hold-v1:ledger',
  );
  expect(identifyOrdinaryHoldMetafilePathV1(root, '/work/repo', scanner)).toBe(scanner);
  expect(resolveOrdinaryHoldPortImportV1(root, 'complete-scanner', scanner)).toEqual({
    path: scanner,
    external: true,
  });
  expect(resolveOrdinaryHoldPortImportV1(root, 'storage-database', database)).toEqual({
    path: database,
    external: false,
  });
  expect(
    resolveOrdinaryHoldPortImportV1(root, 'storage-database', 'ordinary-hold-v1:ledger'),
  ).toEqual({
    path: 'ledger',
    namespace: 'ordinary-hold-v1',
    external: false,
  });
  expect(resolveOrdinaryHoldPortImportV1(root, 'owner-fs', 'node:fs')).toBeUndefined();
  expect(() => resolveOrdinaryHoldPortImportV1(root, 'owner-fs-near', 'node:fs')).toThrow('port');
  expect(() => resolveOrdinaryHoldPortImportV1(root, 'complete-scanner', database)).toThrow(
    'destination',
  );
  expect(() =>
    identifyOrdinaryHoldMetafilePathV1(root, '/work/repo', 'ordinary-hold-v1:near'),
  ).toThrow('virtual');
}, 10000);

test('UC2 ordinary HOLD V1 setup retirement distinguishes unknown return from invocation throw', async () => {
  const { hasKnownOrdinaryHoldSetupOutcomeV1 } =
    await import('../fixtures/dependency-owner-custody');
  const original = Promise.resolve('observed');
  const observer = original.then(() => undefined);
  const base = { label: 'source.read', kind: 'promise' as const, joined: false };
  expect(hasKnownOrdinaryHoldSetupOutcomeV1({ ...base, state: 'threw' })).toBe(true);
  expect(hasKnownOrdinaryHoldSetupOutcomeV1({ ...base, state: 'unknown' })).toBe(false);
  expect(hasKnownOrdinaryHoldSetupOutcomeV1({ ...base, state: 'unknown', returned: 1 })).toBe(
    false,
  );
  expect(hasKnownOrdinaryHoldSetupOutcomeV1({ ...base, state: 'unknown', original })).toBe(false);
  expect(
    hasKnownOrdinaryHoldSetupOutcomeV1({ ...base, state: 'fulfilled', original, joined: true }),
  ).toBe(false);
  expect(
    hasKnownOrdinaryHoldSetupOutcomeV1({
      ...base,
      state: 'fulfilled',
      original,
      observer,
      joined: true,
    }),
  ).toBe(true);
  expect(
    hasKnownOrdinaryHoldSetupOutcomeV1({
      ...base,
      state: 'rejected',
      original,
      observer,
      joined: true,
    }),
  ).toBe(true);
  await Promise.allSettled([original, observer]);
}, 10000);

test('UC2 ordinary HOLD V1 resolver delegates non-classifier aliases', async () => {
  const { resolveOrdinaryHoldImportV1 } = await import('../fixtures/dependency-owner-custody');
  const root = '/ordinary-hold';
  const completeFixture = `${root}/tools/tool-remote-scripts/src/fixtures/dependency-complete-activation.ts`;
  const storage = `${root}/tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts`;
  for (const [importer, alias] of [
    [completeFixture, '@wbs/store-sqlite/migrate'],
    [storage, '@wbs/store-sqlite/cross-project-dependency-activation'],
    [storage, '@wbs/store-sqlite/migration-set'],
    [storage, '@wbs/store-sqlite/db-near'],
    [storage, '@wbs/store-sqlite/backup-near'],
    [storage, '@wbs/store-sqlite/sqlite-cleanup-near'],
  ] as const)
    expect(resolveOrdinaryHoldImportV1(root, importer, alias)).toBeUndefined();
}, 10000);

interface LedgerNativeSnapshot {
  readonly ticket: object;
  readonly phase: string;
  readonly generation: number;
  readonly nativeReturns: number;
  readonly nativeEntries: number;
  readonly productionAttempts: number;
  readonly nativePhase: string;
  readonly closeCause: unknown;
  readonly acquisitionCause: unknown;
  readonly args: readonly unknown[];
  readonly receiver: unknown;
}
interface LedgerOperationSnapshot {
  readonly original: Promise<unknown> | undefined;
  readonly observer: Promise<unknown> | undefined;
  readonly phase: string;
  readonly joined: boolean;
  readonly value: unknown;
}
interface LedgerOwnerObservation {
  readonly record: unknown;
  readonly original: unknown;
  readonly observer: unknown;
}
interface LedgerHarness {
  inspectLedger(): {
    readonly natives: readonly LedgerNativeSnapshot[];
    readonly operations: readonly LedgerOperationSnapshot[];
    readonly owners: readonly {
      readonly owner: unknown;
      readonly ownership: unknown;
      readonly observations: readonly LedgerOwnerObservation[];
    }[];
    readonly stopped: boolean;
    readonly fatalObservation: LedgerOwnerObservation;
  };
  inspectNative(ticket: object): LedgerNativeSnapshot;
  inspectOperation(ticket: object): LedgerOperationSnapshot;
  reserveNative(label: string, kind: string, args: readonly unknown[], receiver?: unknown): object;
  attachNative(ticket: object, original: unknown): unknown;
  throwNative(ticket: object, cause: unknown): void;
  aliasNative(ticket: object, alias: unknown): void;
  attemptClose(original: unknown, origin: string): object;
  enterClose(ticket: object, origin: string): object;
  beginClose(original: unknown, origin: string): object;
  returnClose(ticket: object, returned?: unknown): void;
  throwClose(ticket: object, cause: unknown): void;
  reserveOperation(
    label: string,
    kind: string,
    receiver: unknown,
    args: readonly unknown[],
  ): object;
  returnOperation(ticket: object, returned: unknown): unknown;
  throwOperation(ticket: object, cause: unknown): void;
  attachPromise(ticket: object, original: Promise<unknown>): Promise<unknown>;
  joinOperation(ticket: object): Promise<void>;
  captureSettlement(
    record: unknown,
    settlement: unknown,
    original: Promise<unknown>,
    observer: Promise<unknown>,
  ): void;
  captureKeeper(owner: unknown, ownership: unknown, keeper: unknown): void;
  captureHold(owner: unknown, ownership: unknown, keeper: unknown): void;
}

/** Evaluates only the generated import-free ledger; no image, native port or production module runs. */
async function ordinaryLedger() {
  const { planOrdinaryHoldBuildV1, ordinaryHoldSourceEpochV1 } =
    await import('../fixtures/dependency-owner-custody');
  const rootUrl = new URL('../../../../', import.meta.url);
  const sourceRoot = rootUrl.pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of ordinaryHoldSourceEpochV1.pins)
    supplied.set(`${sourceRoot}/${pin.relative}`, await readFile(new URL(pin.relative, rootUrl)));
  const source = planOrdinaryHoldBuildV1(sourceRoot, supplied).portSources.get(
    'ordinary-hold-v1:ledger',
  );
  expect(source).toBeDefined();
  expect(source).not.toMatch(/\bimport\b/);
  if (source === undefined) throw new Error('generated ordinary ledger absent');
  // The inspected import-free generated source is the sole evaluated module; its exports are this test boundary.
  return runInNewContext(
    `${source.replaceAll('export ', '')}\n({inspectLedger,inspectNative,inspectOperation,reserveNative,attachNative,throwNative,aliasNative,attemptClose,enterClose,beginClose,returnClose,throwClose,reserveOperation,returnOperation,throwOperation,attachPromise,joinOperation,captureSettlement,captureKeeper,captureHold})`,
    {},
  ) as LedgerHarness;
}

test('UC2 generated ledger reserves native generations before entry and shares aliases', async () => {
  const ledger = await ordinaryLedger();
  expect(typeof ledger.reserveNative).toBe('function');
  const first = ledger.reserveNative('storage.openSync', 'fd', ['/authority', 0]);
  expect(ledger.inspectNative(first).phase).toBe('entered');
  expect(ledger.inspectLedger().natives[0].ticket).toBe(first);
  ledger.attachNative(first, 7);
  const wrapper = {};
  ledger.aliasNative(first, wrapper);
  expect(ledger.beginClose(wrapper, 'production')).toBe(first);
  ledger.returnClose(first);
  expect(ledger.inspectNative(first).nativeReturns).toBe(1);
  const second = ledger.reserveNative('storage.openSync', 'fd', ['/authority', 0]);
  ledger.attachNative(second, 7);
  expect(ledger.inspectNative(second).generation).not.toBe(ledger.inspectNative(first).generation);
  expect(ledger.beginClose(7, 'production')).toBe(second);
  const cause = new Error('sentinel close unknown');
  ledger.throwClose(second, cause);
  expect(ledger.inspectNative(second).closeCause).toBe(cause);
  expect(ledger.inspectNative(second).nativePhase).toBe('unknown');
});

test('UC2 generated ledger retains exact operation Promise and independent joined observer', async () => {
  const ledger = await ordinaryLedger();
  expect(typeof ledger.reserveOperation).toBe('function');
  let finish: ((value: string) => void) | undefined;
  const original = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const operation = ledger.reserveOperation('complete.storage', 'promise', undefined, []);
  try {
    expect(ledger.attachPromise(operation, original)).toBe(original);
    expect(ledger.inspectOperation(operation).original).toBe(original);
    expect(ledger.inspectOperation(operation).observer).not.toBe(original);
    expect(ledger.inspectOperation(operation).phase).toBe('pending');
    expect(ledger.inspectOperation(operation).joined).toBe(false);
    finish?.('settled');
    await ledger.joinOperation(operation);
    expect(ledger.inspectOperation(operation).phase).toBe('fulfilled');
    expect(ledger.inspectOperation(operation).value).toBe('settled');
    expect(ledger.inspectOperation(operation).joined).toBe(true);
  } finally {
    finish?.('settled');
    await Promise.allSettled([original, ledger.inspectOperation(operation).observer]);
  }
});

test('UC2 generated ledger rejects caps before the inert native entry', async () => {
  const ledger = await ordinaryLedger();
  for (let index = 0; index < 512; index++) {
    const reserved = ledger.reserveNative('storage.openSync', 'fd', ['/authority', index]);
    ledger.attachNative(reserved, index);
  }
  let entered = false;
  expect(() => {
    ledger.reserveNative('storage.openSync', 'fd', ['/authority', 512]);
    entered = true;
  }).toThrow('native cap');
  expect(entered).toBe(false);
  expect(ledger.inspectLedger().natives).toHaveLength(512);
});

test('UC2 generated ledger retains exact owner graphs when observation is capped', async () => {
  const ledger = await ordinaryLedger();
  const owner = {};
  const ownership = { preparations: new Set() };
  const original = Promise.resolve('observed');
  const observer = original.then(() => undefined);
  const settlement = { original, observer };
  const record = { owner, ownership, composition: settlement };
  try {
    ledger.captureSettlement(record, settlement, original, observer);
    const frame = ledger.inspectLedger().owners[0];
    expect(frame.owner).toBe(owner);
    expect(frame.ownership).toBe(ownership);
    expect(frame.observations[0].record).toBe(record);
    expect(frame.observations[0].original).toBe(original);
    expect(frame.observations[0].observer).toBe(observer);
    expect(Object.isFrozen(ledger.inspectLedger().owners)).toBe(true);
    const keeper = { pending: original, interval: {} };
    const timer = ledger.reserveOperation('owner.interval', 'sync', undefined, []);
    ledger.returnOperation(timer, keeper.interval);
    for (let index = 2; index < 8192; index++) ledger.captureKeeper(owner, ownership, keeper);
    const primary = new Error('original production failure');
    let caught: unknown;
    try {
      try {
        throw primary;
      } finally {
        ledger.captureHold(owner, ownership, keeper);
      }
    } catch (cause) {
      caught = cause;
    }
    expect(caught).toBe(primary);
    const stopped = ledger.inspectLedger();
    expect(stopped.stopped).toBe(true);
    expect(stopped.fatalObservation.original).toBe(original);
    expect(stopped.fatalObservation.record).toBe(keeper);
    expect(() => ledger.reserveNative('storage.openSync', 'fd', [])).toThrow('ledger stopped');
  } finally {
    await Promise.allSettled([original, observer]);
  }
});

test('UC2 generated ledger refuses a second native close after normal return or unknown throw', async () => {
  for (const outcome of ['returned', 'unknown']) {
    const ledger = await ordinaryLedger();
    const ticket = ledger.reserveNative('storage.openSync', 'fd', ['/authority']);
    const acquired = {};
    expect(ledger.attachNative(ticket, acquired)).toBe(acquired);
    const attempted = ledger.attemptClose(acquired, 'production');
    expect(ledger.inspectNative(ticket).productionAttempts).toBe(1);
    expect(ledger.inspectNative(ticket).nativeEntries).toBe(0);
    ledger.enterClose(attempted, 'production');
    const cause = new Error('actual sentinel close failure');
    if (outcome === 'returned') ledger.returnClose(ticket, 'close return');
    else ledger.throwClose(ticket, cause);
    expect(ledger.inspectNative(ticket).nativeEntries).toBe(1);
    expect(ledger.inspectNative(ticket).nativeReturns).toBe(outcome === 'returned' ? 1 : 0);
    if (outcome === 'unknown') expect(ledger.inspectNative(ticket).closeCause).toBe(cause);
    expect(() => ledger.enterClose(ticket, 'fixture')).toThrow('native close re-entry');
    expect(ledger.inspectNative(ticket).nativeEntries).toBe(1);
  }
});

test('UC2 generated ledger retains entered acquisition failures and rejects unknown boundaries', async () => {
  const ledger = await ordinaryLedger();
  const receiver = {};
  const args = ['/authority', 0];
  const ticket = ledger.reserveNative('storage.openSync', 'fd', args, receiver);
  const cause = new Error('entered sentinel acquisition failed');
  ledger.throwNative(ticket, cause);
  expect(ledger.inspectNative(ticket).receiver).toBe(receiver);
  expect(ledger.inspectNative(ticket).args).toEqual(args);
  expect(ledger.inspectNative(ticket).acquisitionCause).toBe(cause);
  expect(ledger.inspectNative(ticket).phase).toBe('unknown');
  expect(() => ledger.reserveNative('storage.openSync', 'fd', [])).toThrow('ledger stopped');
  const closed = await ordinaryLedger();
  expect(() => closed.reserveNative('storage.openSync-near', 'fd', [])).toThrow('boundary differs');
  const mismatched = await ordinaryLedger();
  expect(() => mismatched.reserveNative('storage.openSync', 'sqlite', [])).toThrow(
    'boundary differs',
  );
});

test('UC2 generated ledger bounds each native family and settleable Promise census', async () => {
  for (const [label, kind, cap] of [
    ['database.readonly', 'sqlite', 64],
    ['graph.opendirSync', 'dir', 32],
  ] as const) {
    const ledger = await ordinaryLedger();
    for (let index = 0; index < cap; index++)
      ledger.attachNative(ledger.reserveNative(label, kind, []), {});
    expect(() => ledger.reserveNative(label, kind, [])).toThrow('native cap');
    expect(ledger.inspectLedger().natives).toHaveLength(cap);
  }
  const ledger = await ordinaryLedger();
  const original = Promise.resolve('known');
  const tickets = [];
  try {
    for (let index = 0; index < 256; index++) {
      const ticket = ledger.reserveOperation('complete.storage', 'promise', undefined, []);
      tickets.push(ticket);
      void ledger.attachPromise(ticket, original);
    }
    expect(() => ledger.reserveOperation('complete.storage', 'promise', undefined, [])).toThrow(
      'Promise cap',
    );
  } finally {
    await Promise.all(tickets.map((ticket) => ledger.joinOperation(ticket)));
  }
  expect(
    ledger.inspectLedger().operations.every((operation: { joined: boolean }) => operation.joined),
  ).toBe(true);
});

test('UC2 generated ledger stops on a missing keeper identity or ninth owner graph', async () => {
  const original = Promise.resolve();
  const keeper = { pending: original, interval: {} };
  const missing = await ordinaryLedger();
  missing.captureKeeper({}, { preparations: new Set() }, keeper);
  expect(missing.inspectLedger().stopped).toBe(true);
  expect(missing.inspectLedger().fatalObservation.record).toBe(keeper);
  const bounded = await ordinaryLedger();
  const timer = bounded.reserveOperation('owner.interval', 'sync', undefined, []);
  bounded.returnOperation(timer, keeper.interval);
  for (let index = 0; index < 8; index++)
    bounded.captureKeeper({}, { preparations: new Set() }, keeper);
  const ninth = {};
  expect(() => {
    bounded.captureKeeper(ninth, { preparations: new Set() }, keeper);
  }).not.toThrow();
  expect(bounded.inspectLedger().owners).toHaveLength(8);
  expect(bounded.inspectLedger().stopped).toBe(true);
  await original;
});

test('UC2 generated ledger inspection cannot manufacture native completion', async () => {
  const ledger = await ordinaryLedger();
  const ticket = ledger.reserveNative('storage.openSync', 'fd', []);
  ledger.attachNative(ticket, 7);
  const snapshot = ledger.inspectNative(ticket);
  expect(Reflect.set(snapshot, 'nativePhase', 'returned')).toBe(false);
  expect(ledger.inspectNative(ticket).nativePhase).toBe('not-entered');
  expect(Object.isFrozen(ticket)).toBe(true);
  expect(() => ledger.inspectNative({})).toThrow('ticket differs');
});

for (const stopCause of ['unknown close', 'event cap'] as const) {
  test(`UC2 generated ledger permits independent existing cleanup after ${stopCause} STOP`, async () => {
    const ledger = await ordinaryLedger();
    const first = ledger.reserveNative('storage.openSync', 'fd', ['/first']);
    const second = ledger.reserveNative('storage.openSync', 'fd', ['/second']);
    ledger.attachNative(first, 7);
    ledger.attachNative(second, 8);
    ledger.beginClose(7, 'production');
    if (stopCause === 'unknown close')
      ledger.throwClose(first, new Error('sentinel native unknown'));
    else {
      ledger.returnClose(first);
      for (let index = 2; index < 8192; index++)
        ledger.reserveOperation('owner.interval', 'sync', undefined, []);
      const pending = Promise.resolve();
      ledger.captureHold({}, { preparations: new Set() }, { pending, interval: {} });
      await pending;
    }
    expect(ledger.inspectLedger().stopped).toBe(true);
    expect(ledger.beginClose(8, 'production')).toBe(second);
    ledger.returnClose(second);
    expect(ledger.inspectNative(second).nativeEntries).toBe(1);
    expect(ledger.inspectNative(second).nativeReturns).toBe(1);
    expect(ledger.inspectLedger().stopped).toBe(true);
    expect(() => ledger.enterClose(first, 'fixture')).toThrow('native close re-entry');
    expect(() => ledger.reserveNative('storage.openSync', 'fd', ['/new'])).toThrow(
      'ledger stopped',
    );
    expect(() => ledger.reserveOperation('complete.storage', 'promise', undefined, [])).toThrow(
      'ledger stopped',
    );
  });
}

test('UC2 generated ledger bounds cleanup attempt accounting without native entry', async () => {
  const ledger = await ordinaryLedger();
  const ticket = ledger.reserveNative('storage.openSync', 'fd', ['/first']);
  ledger.attachNative(ticket, 7);
  for (let index = 0; index < 8192; index++) ledger.attemptClose(7, 'production');
  expect(() => ledger.attemptClose(7, 'production')).toThrow('close attempt cap');
  expect(ledger.inspectNative(ticket).productionAttempts).toBe(8192);
  expect(ledger.inspectNative(ticket).nativeEntries).toBe(0);
});

async function ordinaryChildTransport() {
  const { planOrdinaryHoldBuildV1, ordinaryHoldSourceEpochV1 } =
    await import('../fixtures/dependency-owner-custody');
  const rootUrl = new URL('../../../../', import.meta.url);
  const sourceRoot = rootUrl.pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of ordinaryHoldSourceEpochV1.pins)
    supplied.set(`${sourceRoot}/${pin.relative}`, await readFile(new URL(pin.relative, rootUrl)));
  const source = planOrdinaryHoldBuildV1(sourceRoot, supplied).portSources.get(
    'ordinary-hold-v1:ledger',
  );
  if (source === undefined) throw new Error('generated child transport absent');
  expect(source).not.toMatch(/\bimport\b/);
  return runInNewContext(
    `${source.replaceAll('export ', '')}\n({reserveChild,inspectChildren,reserveMigrationFs,inspectMigrationStaging,returnMigrationFs,throwMigrationFs,attachChild,throwChild,joinOrdinaryChild,inspectChildLimits,inspectLedger,reserveNative,attachNative,throwNative,assertChildDeadline,refuseChildSemantic,decodeCollectorChild,readAuthorityCollector})`,
    { TextDecoder, performance },
  ) as {
    returnMigrationFs(ticket: object, returned: unknown): unknown;
    throwMigrationFs(ticket: object, cause: unknown): void;
    attachChild(ticket: object, child: ControlledChild): ControlledChild;
    throwChild(ticket: object, cause: unknown): void;
    joinOrdinaryChild(child: ControlledChild): Promise<readonly [string, string, number]>;
    inspectChildLimits(): {
      readonly reads: number;
      readonly readCount: number;
      readonly deliveredBytes: number;
      readonly acceptedBytes: number;
      readonly families: Readonly<Record<string, number>>;
    };
    inspectLedger(): { readonly stopped: boolean; readonly operations: readonly unknown[] };
    reserveNative(label: string, kind: string, args: readonly unknown[]): object;
    attachNative(ticket: object, original: unknown): unknown;
    throwNative(ticket: object, cause: unknown): void;
    assertChildDeadline(deadline: number): void;
    refuseChildSemantic(child: ControlledChild, cause: unknown): never;
    decodeCollectorChild(child: ControlledChild): string;
    readAuthorityCollector(child: ControlledChild, deadline: number): Promise<string>;
    reserveMigrationFs(name: string, args: readonly unknown[]): object;
    inspectMigrationStaging(): {
      readonly calls: readonly { readonly ticket: object; readonly phase: string }[];
      readonly roots: readonly unknown[];
    };
    reserveChild(label: string, args: readonly unknown[]): object;
    inspectChildren(): readonly ChildSnapshot[];
  };
}

test('UC2 generated child transport reserves before actual spawn entry', async () => {
  const transport = await ordinaryChildTransport();
  const args = ['/authority', ['status']];
  const ticket = transport.reserveChild('git', args);
  expect(transport.inspectChildren()).toHaveLength(1);
  expect(transport.inspectChildren()[0]?.ticket).toBe(ticket);
  expect(transport.inspectChildren()[0]?.phase).toBe('entered');
  expect(transport.inspectChildren()[0]?.args).toEqual(args);
});

test('UC2 custody epoch owns writable migration staging and four fixed child routes', async () => {
  const { planOrdinaryHoldBuildV1, ordinaryHoldSourceEpochV1 } =
    await import('../fixtures/dependency-owner-custody');
  expect(ordinaryHoldSourceEpochV1.pins).toHaveLength(17);
  const rootUrl = new URL('../../../../', import.meta.url);
  const sourceRoot = rootUrl.pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of ordinaryHoldSourceEpochV1.pins)
    supplied.set(`${sourceRoot}/${pin.relative}`, await readFile(new URL(pin.relative, rootUrl)));
  const plan = planOrdinaryHoldBuildV1(sourceRoot, supplied);
  for (const id of [
    'database.readwrite-enter-return',
    'migration.fs',
    'setup.complete.migrations',
    'child.git.spawn',
    'child.git.join',
    'child.namespace.spawn',
    'child.namespace.join',
    'child.emitter.spawn',
    'child.emitter.join',
    'child.collector.spawn',
    'child.collector.transport',
  ])
    expect(plan.appliedCuts.some((cut) => cut.id === id && cut.count === 1)).toBe(true);
});

test('UC2 generated migration staging reserves before filesystem entry', async () => {
  const transport = await ordinaryChildTransport();
  const ticket = transport.reserveMigrationFs('mkdtempSync', ['/scratch/wbs-migrate-staged-']);
  expect(transport.inspectMigrationStaging().calls).toHaveLength(1);
  expect(transport.inspectMigrationStaging().calls[0]?.ticket).toBe(ticket);
  expect(transport.inspectMigrationStaging().calls[0]?.phase).toBe('entered');
});

interface ControlledChild {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
}
interface ChildStreamSnapshot {
  readonly stream: ReadableStream<Uint8Array>;
  readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly closed: Promise<void>;
  readonly closedObserver: Promise<unknown>;
  readonly pump: Promise<unknown>;
  readonly pumpObserver: Promise<unknown>;
  readonly eof: boolean;
  readonly releasePhase: string;
  readonly reads: readonly {
    readonly original: Promise<ReadableStreamReadResult<Uint8Array>>;
    readonly originalObserver: Promise<unknown>;
    readonly chunk: ReadableStreamReadResult<Uint8Array>;
    readonly phase: string;
  }[];
}
interface ChildSnapshot {
  readonly ticket: object;
  readonly phase: string;
  readonly args: readonly unknown[];
  readonly original: ControlledChild;
  readonly exited: Promise<number>;
  readonly exitedObserver: Promise<unknown>;
  readonly join: Promise<readonly [string, string, number]>;
  readonly joinObserver: Promise<unknown>;
  readonly joined: boolean;
  readonly streams: readonly ChildStreamSnapshot[];
}
function controlledChild() {
  let stdoutController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let stderrController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let fulfillExit: ((code: number) => void) | undefined;
  let rejectExit: ((cause: unknown) => void) | undefined;
  let cancellations = 0;
  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      stdoutController = controller;
    },
    cancel() {
      cancellations++;
    },
  });
  const stderr = new ReadableStream<Uint8Array>({
    start(controller) {
      stderrController = controller;
    },
    cancel() {
      cancellations++;
    },
  });
  const exited = new Promise<number>((resolve, reject) => {
    fulfillExit = resolve;
    rejectExit = reject;
  });
  if (
    stdoutController === undefined ||
    stderrController === undefined ||
    fulfillExit === undefined ||
    rejectExit === undefined
  )
    throw new Error('controlled child provider absent');
  return {
    child: { stdout, stderr, exited },
    stdout: stdoutController,
    stderr: stderrController,
    exit: fulfillExit,
    failExit: rejectExit,
    cancellations: () => cancellations,
  };
}
async function flushChildObservations() {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}

test('UC2 generated child transport retains original readers promises and concurrent drains', async () => {
  const transport = await ordinaryChildTransport();
  const controlled = controlledChild();
  const ticket = transport.reserveChild('git', []);
  expect(transport.attachChild(ticket, controlled.child)).toBe(controlled.child);
  const captured = transport.inspectChildren().at(0);
  if (captured === undefined) throw new Error('child absent');
  expect(captured.original).toBe(controlled.child);
  expect(captured.exited).toBe(controlled.child.exited);
  expect(captured.exitedObserver).not.toBe(controlled.child.exited);
  for (const stream of captured.streams) {
    expect(stream.closed).toBe(stream.reader.closed);
    expect(stream.closedObserver).not.toBe(stream.closed);
    expect(stream.reads).toHaveLength(1);
    expect(stream.reads[0]?.originalObserver).not.toBe(stream.reads[0]?.original);
    expect(stream.pumpObserver).not.toBe(stream.pump);
  }
  expect(captured.streams.map((stream) => stream.stream)).toEqual([
    controlled.child.stdout,
    controlled.child.stderr,
  ]);
  const joined = transport.joinOrdinaryChild(controlled.child);
  expect(transport.joinOrdinaryChild(controlled.child)).toBe(joined);
  expect(transport.inspectChildren()[0]?.join).toBe(joined);
  expect(transport.inspectChildren()[0]?.joinObserver).not.toBe(joined);
  let returned = false;
  void joined.then(() => {
    returned = true;
  });
  controlled.stdout.enqueue(new TextEncoder().encode('stdout'));
  controlled.stderr.enqueue(new TextEncoder().encode('stderr'));
  controlled.stdout.close();
  controlled.stderr.close();
  await flushChildObservations();
  expect(returned).toBe(false);
  expect(transport.inspectChildren()[0]?.joined).toBe(false);
  controlled.exit(7);
  expect(await joined).toEqual(['stdout', 'stderr', 7]);
  for (const stream of transport.inspectChildren()[0]?.streams ?? []) {
    expect(stream.eof).toBe(true);
    expect(stream.releasePhase).toBe('returned');
    expect(stream.reads.at(-1)?.chunk.done).toBe(true);
  }
  expect(controlled.child.stdout.locked).toBe(false);
  expect(controlled.child.stderr.locked).toBe(false);
  expect(controlled.cancellations()).toBe(0);
  expect(transport.inspectLedger().operations).toHaveLength(0);
});

test('UC2 generated child transport drains captured originals after unrelated STOP', async () => {
  const transport = await ordinaryChildTransport();
  const controlled = controlledChild();
  transport.attachChild(transport.reserveChild('git', []), controlled.child);
  const joined = transport.joinOrdinaryChild(controlled.child);
  const native = transport.reserveNative('storage.openSync', 'fd', []);
  transport.attachNative(native, 7);
  transport.throwNative(native, new Error('inert unrelated native refusal'));
  expect(() => transport.reserveChild('git', [])).toThrow('stopped');
  controlled.stdout.enqueue(new TextEncoder().encode('retained'));
  controlled.stdout.close();
  controlled.stderr.close();
  controlled.exit(0);
  expect(await joined).toEqual(['retained', '', 0]);
  expect(controlled.cancellations()).toBe(0);
});

test('UC2 generated child transport byte overflow retains UNKNOWN without EOF release or extra reads', async () => {
  const transport = await ordinaryChildTransport();
  const controlled = controlledChild();
  transport.attachChild(transport.reserveChild('collector', []), controlled.child);
  const joined = transport.joinOrdinaryChild(controlled.child);
  let settled = false;
  void joined.then(() => {
    settled = true;
  });
  const oversized = new Uint8Array(33554433);
  controlled.stdout.enqueue(oversized);
  await flushChildObservations();
  const captured = transport.inspectChildren().at(0);
  controlled.stdout.close();
  controlled.stderr.close();
  controlled.exit(0);
  await flushChildObservations();
  expect(captured?.phase).toBe('unknown');
  expect(captured?.streams[0]?.reads).toHaveLength(1);
  expect(captured?.streams[0]?.reads[0]?.chunk.value).toBe(oversized);
  expect(captured?.streams[0]?.eof).toBe(false);
  expect(captured?.streams[0]?.releasePhase).toBe('not-entered');
  expect(settled).toBe(false);
  expect(transport.inspectChildLimits().deliveredBytes).toBe(33554433);
  expect(transport.inspectChildLimits().acceptedBytes).toBe(0);
  expect(() => transport.reserveChild('git', [])).toThrow('stopped');
  expect(settled).toBe(false);
  expect(controlled.cancellations()).toBe(0);
});

test('UC2 generated child transport rejected read and exit preserve UNKNOWN causes', async () => {
  for (const fault of ['read', 'exit'] as const) {
    const transport = await ordinaryChildTransport();
    const controlled = controlledChild();
    transport.attachChild(transport.reserveChild('git', []), controlled.child);
    let settled = false;
    void transport.joinOrdinaryChild(controlled.child).then(() => {
      settled = true;
    });
    const cause = new Error(fault);
    if (fault === 'read') {
      controlled.stdout.error(cause);
      controlled.stderr.close();
      controlled.exit(0);
    } else {
      controlled.stdout.close();
      controlled.stderr.close();
      controlled.failExit(cause);
    }
    await flushChildObservations();
    expect(transport.inspectChildren()[0]?.phase).toBe('unknown');
    expect(transport.inspectLedger().stopped).toBe(true);
    expect(settled).toBe(false);
    expect(controlled.cancellations()).toBe(0);
  }
});

test('UC2 generated child transport fixed caps and deadline refuse before entry', async () => {
  for (const [family, cap] of Object.entries({ git: 8, namespace: 16, emitter: 2, collector: 6 })) {
    const transport = await ordinaryChildTransport();
    for (let count = 0; count < cap; count++) transport.reserveChild(family, []);
    expect(() => transport.reserveChild(family, [])).toThrow('cap');
    expect(transport.inspectChildren()).toHaveLength(cap);
  }
  const transport = await ordinaryChildTransport();
  expect(() => transport.reserveChild('git-near', [])).toThrow('boundary');
  const deadline = await ordinaryChildTransport();
  expect(() => {
    deadline.assertChildDeadline(performance.now() - 1);
  }).toThrow('deadline');
  expect(deadline.inspectChildren()).toHaveLength(0);
});

test('UC2 generated migration staging retains returned roots and one cleanup after STOP', async () => {
  const transport = await ordinaryChildTransport();
  const ticket = transport.reserveMigrationFs('mkdtempSync', ['/scratch/wbs-migrate-staged-']);
  expect(transport.returnMigrationFs(ticket, '/scratch/wbs-migrate-staged-real')).toBe(
    '/scratch/wbs-migrate-staged-real',
  );
  expect(transport.inspectMigrationStaging().roots).toHaveLength(1);
  const copy = transport.reserveMigrationFs('cpSync', [
    '/source',
    '/scratch/wbs-migrate-staged-real/one',
  ]);
  const cause = new Error('copy failed');
  transport.throwMigrationFs(copy, cause);
  expect(() => transport.reserveMigrationFs('cpSync', [])).toThrow('stopped');
  const remove = transport.reserveMigrationFs('rmSync', [
    '/scratch/wbs-migrate-staged-real',
    { recursive: true, force: true },
  ]);
  transport.returnMigrationFs(remove, undefined);
  expect(() =>
    transport.reserveMigrationFs('rmSync', ['/scratch/wbs-migrate-staged-real']),
  ).toThrow('removal');
});

test('UC2 generated child transport read cap parks without an unrecorded read', async () => {
  const transport = await ordinaryChildTransport();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let suppliedReads = 0;
  const stdout = new ReadableStream<Uint8Array>({
    start(opened) {
      controller = opened;
    },
    pull(opened) {
      if (suppliedReads < 8193) {
        suppliedReads++;
        opened.enqueue(new Uint8Array(0));
      } else opened.close();
    },
  });
  const controlled = controlledChild();
  const child = { ...controlled.child, stdout };
  transport.attachChild(transport.reserveChild('collector', []), child);
  let settled = false;
  void transport.joinOrdinaryChild(child).then(() => {
    settled = true;
  });
  for (let turn = 0; turn < 100000 && !transport.inspectLedger().stopped; turn++)
    await Promise.resolve();
  await flushChildObservations();
  const captured = transport.inspectChildren().at(0);
  if (controller === undefined) throw new Error('controlled read-cap provider absent');
  if (!captured?.streams[0]?.eof) controller.close();
  controlled.stdout.close();
  controlled.stderr.close();
  controlled.exit(0);
  await flushChildObservations();
  expect(transport.inspectLedger().stopped).toBe(true);
  expect(transport.inspectChildLimits().readCount).toBe(8192);
  expect(captured?.phase).toBe('unknown');
  expect(captured?.streams.reduce((count, stream) => count + stream.reads.length, 0)).toBe(8192);
  expect(captured?.streams[0]?.eof).toBe(false);
  expect(captured?.streams[0]?.releasePhase).toBe('not-entered');
  expect(settled).toBe(false);
  expect(settled).toBe(false);
  expect(controlled.cancellations()).toBe(0);
});

test('UC2 generated child transport missing stream retains child and original exit', async () => {
  const transport = await ordinaryChildTransport();
  const controlled = controlledChild();
  const child = { ...controlled.child, stderr: undefined } as unknown as ControlledChild;
  expect(() => transport.attachChild(transport.reserveChild('git', []), child)).toThrow(
    'stream absent',
  );
  expect(transport.inspectChildren()[0]?.original).toBe(child);
  expect(transport.inspectChildren()[0]?.exited).toBe(child.exited);
  expect(transport.inspectChildren()[0]?.phase).toBe('unknown');
  expect(() => transport.reserveChild('git', [])).toThrow('stopped');
  controlled.stdout.close();
  controlled.stderr.close();
  controlled.exit(0);
  await flushChildObservations();
  expect(controlled.cancellations()).toBe(0);
});

test('UC2 generated migration staging exact call caps refuse before entry', async () => {
  for (const [name, cap] of Object.entries({
    mkdtempSync: 2,
    cpSync: 210,
    readdirSync: 2,
    existsSync: 214,
    readFileSync: 214,
  })) {
    const transport = await ordinaryChildTransport();
    for (let count = 0; count < cap; count++) transport.reserveMigrationFs(name, []);
    expect(() => transport.reserveMigrationFs(name, [])).toThrow('cap');
    expect(transport.inspectMigrationStaging().calls).toHaveLength(cap);
  }
  const transport = await ordinaryChildTransport();
  const ticket = transport.reserveMigrationFs('mkdtempSync', []);
  transport.returnMigrationFs(ticket, '/staged');
  const remove = transport.reserveMigrationFs('rmSync', ['/staged']);
  const cause = new Error('native removal unknown');
  transport.throwMigrationFs(remove, cause);
  expect(() => transport.reserveMigrationFs('rmSync', ['/staged'])).toThrow('removal');
});

test('UC2 custody source cuts reconstruct every original program and reject historical epoch', async () => {
  const { planOrdinaryHoldBuildV1, ordinaryHoldSourceEpochV1, decodeOrdinaryHoldImageV1 } =
    await import('../fixtures/dependency-owner-custody');
  const rootUrl = new URL('../../../../', import.meta.url);
  const sourceRoot = rootUrl.pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of ordinaryHoldSourceEpochV1.pins)
    supplied.set(`${sourceRoot}/${pin.relative}`, await readFile(new URL(pin.relative, rootUrl)));
  const plan = planOrdinaryHoldBuildV1(sourceRoot, supplied);
  expect(plan.image.sourceEpoch).toBe('ordinary-febb-custody-v1');
  expect(() =>
    decodeOrdinaryHoldImageV1({ ...plan.image, sourceEpoch: 'ordinary-febb-image-v1' }),
  ).toThrow('version');
  for (const mapping of plan.image.mappings) {
    if (mapping.mode !== 'transform') continue;
    let reconstructed = new TextDecoder().decode(plan.materialized.get(mapping.path));
    for (const cut of [...mapping.cuts].reverse()) {
      expect(reconstructed.split(cut.after).length - 1).toBe(cut.count);
      reconstructed = reconstructed.replaceAll(cut.after, () => cut.before);
    }
    expect(reconstructed).toBe(new TextDecoder().decode(supplied.get(mapping.path)));
  }
  expect(
    plan.appliedCuts.filter((cut) => /^setup\.(complete|namespace)\.write\./.test(cut.id)),
  ).toHaveLength(7);
  const dbPath = `${sourceRoot}/libs/wbs/adapters/store-sqlite/src/db.ts`;
  const database = new TextDecoder().decode(plan.materialized.get(dbPath));
  expect(database).toContain(
    'const db = ordinaryHoldOpenReadwrite(dbPath, isCreateAllowed);\n  return initializeDatabase(db,',
  );
  const collector = plan.portSources.get('ordinary-hold-v1:child-collector');
  expect(collector).toContain('new TextEncoder().encode(program)');
  expect(collector).not.toContain('installed-authority-transport');
  expect(plan.portSources.get('ordinary-hold-v1:ledger')).toContain(
    'if(collectorStderrByteLength(child)>0)',
  );
  expect(plan.portSources.get('ordinary-hold-v1:ledger')).toContain('if(code!==0)');
  for (const family of ['git', 'namespace', 'emitter', 'collector']) {
    const port = plan.portSources.get(`ordinary-hold-v1:child-${family}`);
    expect(port).not.toMatch(/\.kill\(|\.cancel\(|setTimeout|setInterval/);
    expect(port).toContain('const spawn=Bun.spawn');
  }
});

test('UC2 generated collector decodes strictly only after genuine joins while other families replace', async () => {
  for (const family of ['git', 'namespace', 'emitter', 'collector']) {
    const transport = await ordinaryChildTransport();
    const controlled = controlledChild();
    transport.attachChild(transport.reserveChild(family, []), controlled.child);
    controlled.stdout.enqueue(new Uint8Array([0xff]));
    controlled.stdout.close();
    controlled.stderr.close();
    controlled.exit(0);
    if (family === 'collector')
      expect(
        await transport.readAuthorityCollector(controlled.child, performance.now() + 10000).then(
          () => false,
          () => true,
        ),
      ).toBe(true);
    else expect(await transport.joinOrdinaryChild(controlled.child)).toEqual(['\ufffd', '', 0]);
    expect(transport.inspectChildren()[0]?.joined).toBe(true);
    expect(controlled.child.stdout.locked).toBe(false);
    expect(controlled.child.stderr.locked).toBe(false);
    expect(controlled.cancellations()).toBe(0);
  }
});

test('UC2 generated collector semantic refusals retain known joined transport', async () => {
  for (const fault of ['stderr', 'exit', 'deadline'] as const) {
    const transport = await ordinaryChildTransport();
    const controlled = controlledChild();
    transport.attachChild(transport.reserveChild('collector', []), controlled.child);
    if (fault === 'stderr') controlled.stderr.enqueue(new TextEncoder().encode('failure'));
    controlled.stdout.close();
    controlled.stderr.close();
    controlled.exit(fault === 'exit' ? 1 : 0);
    expect(
      await transport
        .readAuthorityCollector(
          controlled.child,
          fault === 'deadline' ? performance.now() - 1 : performance.now() + 10000,
        )
        .then(
          () => false,
          () => true,
        ),
    ).toBe(true);
    expect(transport.inspectChildren()[0]?.joined).toBe(true);
    expect(transport.inspectLedger().stopped).toBe(true);
    expect(controlled.cancellations()).toBe(0);
  }
});

test('UC2 generated collector refuses BOM-only raw stderr after known transport join', async () => {
  const transport = await ordinaryChildTransport();
  const controlled = controlledChild();
  transport.attachChild(transport.reserveChild('collector', []), controlled.child);
  controlled.stderr.enqueue(new Uint8Array([0xef, 0xbb, 0xbf]));
  controlled.stdout.close();
  controlled.stderr.close();
  controlled.exit(0);
  const refused = await transport
    .readAuthorityCollector(controlled.child, performance.now() + 10000)
    .then(
      () => false,
      () => true,
    );
  expect(transport.inspectChildren().at(0)?.joined).toBe(true);
  expect(controlled.child.stdout.locked).toBe(false);
  expect(controlled.child.stderr.locked).toBe(false);
  expect(controlled.cancellations()).toBe(0);
  expect(refused).toBe(true);
});

/** Generated contents exercise the recorder only; no compiler or generated module executes. */
async function makeOrdinaryLoadRecorderFixture() {
  const fixture = await import('../fixtures/dependency-owner-custody');
  const rootUrl = new URL('../../../../', import.meta.url);
  const root = rootUrl.pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of fixture.ordinaryHoldSourceEpochV1.pins)
    supplied.set(`${root}/${pin.relative}`, await readFile(new URL(pin.relative, rootUrl)));
  const plan = fixture.planOrdinaryHoldBuildV1(root, supplied);
  const contents = 'generated receipt α';
  const bytes = Buffer.byteLength(contents);
  const sha256 = createHash('sha256').update(contents).digest('hex');
  const rows = [
    ...fixture.ordinaryHoldModuleModesV1
      .filter((entry) => entry.mode !== 'external-unchanged')
      .map((entry) => ({
        namespace: 'file' as const,
        identity: `${root}/${entry.relative}`,
        mode: entry.mode,
        loader: 'ts' as const,
        bytes,
        sha256,
      })),
    ...Array.from(plan.portSources.keys(), (identity) => ({
      namespace: 'ordinary-hold-v1' as const,
      identity: identity.slice('ordinary-hold-v1:'.length),
      mode: 'virtual' as const,
      loader: 'ts' as const,
      bytes,
      sha256,
    })),
  ];
  const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const recorder = fixture.createOrdinaryHoldLoadRecorderV1(root, rows, digest);
  return { fixture, root, rows, digest, recorder, contents };
}

test('UC2 ordinary load receipts retain callback identity and publish frozen post-join hashes', async () => {
  const { rows, recorder, contents } = await makeOrdinaryLoadRecorderFixture();
  for (const row of rows) {
    const returned = {
      contents: row.namespace === 'file' ? new TextEncoder().encode(contents) : contents,
      loader: 'ts' as const,
    };
    expect(recorder.record(row.namespace, row.identity, returned)).toBe(returned);
  }
  const receipts = recorder.settle();
  expect(receipts).toHaveLength(44);
  expect(Object.isFrozen(receipts)).toBe(true);
  for (const receipt of receipts) {
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(receipt.sha256).toBe(createHash('sha256').update(contents).digest('hex'));
    expect(receipt.settledSha256).toBe(receipt.sha256);
    expect(receipt.bytes).toBe(Buffer.byteLength(contents));
    expect(receipt.returned).toBe(true);
    expect('contents' in receipt).toBe(false);
  }
});

test('UC2 ordinary load receipts refuse duplicate unknown missing and changed callback contents', async () => {
  const { rows, recorder, contents } = await makeOrdinaryLoadRecorderFixture();
  const first = rows[0];
  const returned = { contents: new TextEncoder().encode(contents), loader: 'ts' as const };
  recorder.record(first.namespace, first.identity, returned);
  expect(() => recorder.record(first.namespace, first.identity, returned)).toThrow('duplicate');
  expect(() => recorder.record('file', '/foreign.ts', returned)).toThrow('unknown');
  expect(() => recorder.settle()).toThrow('missing');
  const altered = await makeOrdinaryLoadRecorderFixture();
  expect(() =>
    altered.recorder.record(first.namespace, first.identity, {
      contents: new TextEncoder().encode('changed'),
      loader: 'ts',
    }),
  ).toThrow('expectation');
});

test('UC2 ordinary load receipts detect retained-object drift at the post-join finish boundary', async () => {
  const { rows, recorder, contents } = await makeOrdinaryLoadRecorderFixture();
  const retained: { contents: Uint8Array | string; loader: 'ts' }[] = [];
  for (const row of rows) {
    const returned = {
      contents: row.namespace === 'file' ? new TextEncoder().encode(contents) : contents,
      loader: 'ts' as const,
    };
    retained.push(returned);
    recorder.record(row.namespace, row.identity, returned);
  }
  const bytes = retained[0].contents;
  if (!(bytes instanceof Uint8Array)) throw Error('generated file bytes absent');
  bytes[0] = 0;
  expect(() => recorder.settle()).toThrow('drift');
});

test('UC2 ordinary load expectation admission refuses changed seal and closed roster', async () => {
  const { fixture, root, rows, digest } = await makeOrdinaryLoadRecorderFixture();
  expect(() => fixture.createOrdinaryHoldLoadRecorderV1(root, rows, '0'.repeat(64))).toThrow(
    'digest',
  );
  const missing = rows.slice(1);
  expect(() =>
    fixture.createOrdinaryHoldLoadRecorderV1(
      root,
      missing,
      createHash('sha256').update(JSON.stringify(missing)).digest('hex'),
    ),
  ).toThrow('roster');
  const foreign = rows.map((row, index) =>
    index === 0 ? { ...row, identity: '/foreign.ts' } : row,
  );
  expect(() =>
    fixture.createOrdinaryHoldLoadRecorderV1(
      root,
      foreign,
      createHash('sha256').update(JSON.stringify(foreign)).digest('hex'),
    ),
  ).toThrow('identity');
  expect(digest).toHaveLength(64);
});

test('UC2 ordinary load receipts refuse replacement of the retained contents reference', async () => {
  const { rows, recorder, contents } = await makeOrdinaryLoadRecorderFixture();
  const retained: { contents: Uint8Array | string; loader: 'ts' }[] = [];
  for (const row of rows) {
    const returned = {
      contents: row.namespace === 'file' ? new TextEncoder().encode(contents) : contents,
      loader: 'ts' as const,
    };
    retained.push(returned);
    recorder.record(row.namespace, row.identity, returned);
  }
  retained[0].contents = new TextEncoder().encode(contents);
  expect(() => recorder.settle()).toThrow('drift');
});

test('UC2 ordinary load build admission refuses unsealed expectation text before acquisition', async () => {
  const { buildOrdinaryHoldImageV1 } = await import('../fixtures/dependency-owner-custody');
  expect(() =>
    buildOrdinaryHoldImageV1({
      version: 1,
      mode: 'build-only',
      sourceRoot: '/ordinary-hold',
      sourceEpoch: 'ordinary-febb-custody-v1',
      loadExpectations: '{}',
      closureManifest: '',
    }),
  ).toThrow('digest');
});

test('UC2 ordinary load packet admits only the independently sealed root and rows without compiler entry', async () => {
  const { decodeOrdinaryHoldLoadPacketV1 } = await import('../fixtures/dependency-owner-custody');
  const packet = await readFile(
    new URL('../fixtures/ordinary-input-load-expectations-20261105.json', import.meta.url),
    'utf8',
  );
  const root = '/home/df/.codex/worktrees/1b31/puni-00';
  const rows = decodeOrdinaryHoldLoadPacketV1(root, packet);
  expect(rows).toHaveLength(44);
  expect(Object.isFrozen(rows)).toBe(true);
  expect(rows.filter((row) => row.mode === 'transform')).toHaveLength(14);
  expect(rows.filter((row) => row.mode === 'pinned-pass-through')).toHaveLength(2);
  expect(rows.filter((row) => row.mode === 'virtual')).toHaveLength(28);
  expect(() => decodeOrdinaryHoldLoadPacketV1('/foreign', packet)).toThrow('root');
  expect(() => decodeOrdinaryHoldLoadPacketV1(root, packet + '\n')).toThrow('digest');
});

test('UC2 ordinary closure ledger retains exact original and observer until their joined settlement', async () => {
  const { createOrdinaryHoldClosureLedgerV1 } =
    await import('../fixtures/dependency-owner-custody');
  const ledger = createOrdinaryHoldClosureLedgerV1(['before:file:read']);
  let fulfill!: (value: string) => void;
  const original = new Promise<string>((resolve) => {
    fulfill = resolve;
  });
  const running = ledger.run('before:file:read', () => original);
  const pending = ledger.inspect()[0];
  expect(pending.original).toBe(original);
  expect(pending.returned).toBe(original);
  expect(pending.observer).toBeInstanceOf(Promise);
  expect(pending.joined).toBe(false);
  expect(ledger.hasKnownOutcomes()).toBe(false);
  fulfill('actual bytes');
  expect(await running).toBe('actual bytes');
  expect(ledger.inspect()[0].joined).toBe(true);
  expect(ledger.hasKnownOutcomes()).toBe(true);
  expect(() => {
    ledger.assertComplete();
  }).not.toThrow();
  expect(Object.isFrozen(ledger.inspect())).toBe(true);
  expect(Object.isFrozen(ledger.inspect()[0])).toBe(true);
});

test('UC2 ordinary closure ledger refuses unknown duplicate and missing keys before sentinel effects', async () => {
  const { createOrdinaryHoldClosureLedgerV1 } =
    await import('../fixtures/dependency-owner-custody');
  const ledger = createOrdinaryHoldClosureLedgerV1(['before:file:read', 'after:file:read']);
  let effects = 0;
  const effect = () => {
    effects++;
    return Promise.resolve('bytes');
  };
  await refuses(ledger.run('unknown', effect), 'unknown');
  expect(effects).toBe(0);
  await ledger.run('before:file:read', effect);
  await refuses(ledger.run('before:file:read', effect), 'duplicate');
  expect(effects).toBe(1);
  expect(() => {
    ledger.assertComplete();
  }).toThrow('missing');
  expect(() => createOrdinaryHoldClosureLedgerV1(['same', 'same'])).toThrow('duplicate');
});

test('UC2 ordinary closure ledger separates known read rejection from unknown observer attachment', async () => {
  const { createOrdinaryHoldClosureLedgerV1 } =
    await import('../fixtures/dependency-owner-custody');
  const refused = createOrdinaryHoldClosureLedgerV1(['before:file:read']);
  const failure = new Error('modeled read refusal');
  await refused
    .run('before:file:read', () => Promise.reject(failure))
    .then(
      () => {
        throw Error('expected read refusal');
      },
      (cause: unknown) => {
        expect(cause).toBe(failure);
      },
    );
  expect(refused.hasKnownOutcomes()).toBe(true);
  const unknown = createOrdinaryHoldClosureLedgerV1(['before:file:read']);
  const original = Promise.resolve('bytes');
  original.then = () => {
    throw failure;
  };
  await unknown
    .run('before:file:read', () => original)
    .then(
      () => {
        throw Error('expected observer refusal');
      },
      (cause: unknown) => {
        expect(cause).toBe(failure);
      },
    );
  expect(unknown.hasKnownOutcomes()).toBe(false);
  expect(unknown.inspect()[0].original).toBe(original);
  expect(unknown.inspect()[0].joined).toBe(false);
});

test('UC2 ordinary closure file guards reject canonical kind mode size and byte drift', async () => {
  const { assertOrdinaryHoldClosureFileIdentityV1, assertOrdinaryHoldClosureBytesV1 } =
    await import('../fixtures/dependency-owner-custody');
  const bytes = new TextEncoder().encode('sealed source');
  const row = {
    canonical: '/sealed/source.ts',
    mode: 0o664,
    bytes: 13,
    sha256: '22b8d77b1a6422b51c2d3aa6c15b48b526e8835be5d6278ea50d8223f50a424c',
  };
  row.sha256 = createHash('sha256').update(bytes).digest('hex');
  expect(() => {
    assertOrdinaryHoldClosureFileIdentityV1(row, '/foreign/source.ts', true, 0o664, 13);
  }).toThrow('identity');
  expect(() => {
    assertOrdinaryHoldClosureFileIdentityV1(row, row.canonical, false, 0o664, 13);
  }).toThrow('identity');
  expect(() => {
    assertOrdinaryHoldClosureFileIdentityV1(row, row.canonical, true, 0o600, 13);
  }).toThrow('identity');
  expect(() => {
    assertOrdinaryHoldClosureFileIdentityV1(row, row.canonical, true, 0o664, 12);
  }).toThrow('identity');
  expect(() => {
    assertOrdinaryHoldClosureFileIdentityV1(row, row.canonical, true, 0o664, 13);
  }).not.toThrow();
  expect(() => {
    assertOrdinaryHoldClosureBytesV1(row, bytes);
  }).not.toThrow();
  expect(() => {
    assertOrdinaryHoldClosureBytesV1(row, new TextEncoder().encode('altered bytes'));
  }).toThrow('bytes');
});

test('UC2 ordinary closure input set binds generated entry exact path and rejects missing extra duplicate inputs', async () => {
  const { assertOrdinaryHoldClosureInputsV1 } =
    await import('../fixtures/dependency-owner-custody');
  const manifest = {
    sourceRoot: '/sealed',
    compilerInputs: ['source.ts'],
    virtualInputs: ['ordinary-hold-v1:ledger'],
  };
  const entry = '/private/run/ordinary-image-entry.ts';
  const inputs = ['/sealed/source.ts', 'ordinary-hold-v1:ledger', entry];
  expect(() => {
    assertOrdinaryHoldClosureInputsV1(manifest, entry, inputs);
  }).not.toThrow();
  expect(() => {
    assertOrdinaryHoldClosureInputsV1(manifest, entry, inputs.slice(1));
  }).toThrow('set');
  expect(() => {
    assertOrdinaryHoldClosureInputsV1(manifest, entry, [...inputs, '/foreign.ts']);
  }).toThrow('set');
  expect(() => {
    assertOrdinaryHoldClosureInputsV1(manifest, entry, [...inputs, entry]);
  }).toThrow('set');
  expect(() => {
    assertOrdinaryHoldClosureInputsV1(manifest, entry, [
      inputs[0],
      inputs[1],
      '/other/ordinary-image-entry.ts',
    ]);
  }).toThrow('set');
});

test('UC2 ordinary load receipts reject actual callback loader drift', async () => {
  const { rows, recorder, contents } = await makeOrdinaryLoadRecorderFixture();
  const retained: { contents: Uint8Array | string; loader: string }[] = [];
  for (const row of rows) {
    const returned = {
      contents: row.namespace === 'file' ? new TextEncoder().encode(contents) : contents,
      loader: 'ts' as const,
    };
    retained.push(returned);
    recorder.record(row.namespace, row.identity, returned);
  }
  retained[0].loader = 'js';
  expect(() => recorder.settle()).toThrow('shape');
});

test('UC2 ordinary closure manifest admits only fixed sealed packet and closed schema', async () => {
  const { decodeOrdinaryHoldClosureManifestV1, decodeOrdinaryHoldClosurePacketV1 } =
    await import('../fixtures/dependency-owner-custody');
  const packet = await readFile(
    new URL('../fixtures/ordinary-input-closure-manifest-20261105.json', import.meta.url),
    'utf8',
  );
  const manifest = decodeOrdinaryHoldClosurePacketV1(
    '/home/df/.codex/worktrees/1b31/puni-00',
    packet,
  );
  expect(manifest.files).toHaveLength(268);
  expect(manifest.closureOperationCount).toBe(1936);
  expect(Object.isFrozen(manifest)).toBe(true);
  expect(() => decodeOrdinaryHoldClosurePacketV1('/foreign', packet)).toThrow('root');
  expect(() => decodeOrdinaryHoldClosurePacketV1(manifest.sourceRoot, packet + '\n')).toThrow(
    'digest',
  );
  expect(() => decodeOrdinaryHoldClosureManifestV1({ ...manifest, extra: true })).toThrow();
  expect(() =>
    decodeOrdinaryHoldClosureManifestV1({ ...manifest, files: manifest.files.slice(1) }),
  ).toThrow();
  expect(() =>
    decodeOrdinaryHoldClosureManifestV1({
      ...manifest,
      files: manifest.files.map((row, index) =>
        index === 0 ? { ...row, identity: '../foreign' } : row,
      ),
    }),
  ).toThrow();
  expect(() =>
    decodeOrdinaryHoldClosureManifestV1({
      ...manifest,
      compilerInputs: [...manifest.compilerInputs.slice(1), manifest.compilerInputs[0]],
    }),
  ).toThrow();
  expect(() =>
    decodeOrdinaryHoldClosureManifestV1({
      ...manifest,
      virtualInputs: [...manifest.virtualInputs.slice(1), 'foreign'],
    }),
  ).toThrow();
  expect(() =>
    decodeOrdinaryHoldClosureManifestV1({ ...manifest, closureOperationCount: 1937 }),
  ).toThrow();
});

/** Only the first attachment returns the injected observer; real allSettled attachments always delegate. */
function ordinaryRejectedObserverPair(
  primary: unknown,
  observerFailure: unknown,
  rejected: boolean,
) {
  const originalDeferred = Promise.withResolvers<string>();
  if (rejected) originalDeferred.reject(primary);
  else originalDeferred.resolve('known value');
  const original = originalDeferred.promise;
  const observerDeferred = Promise.withResolvers<undefined>();
  observerDeferred.reject(observerFailure);
  const observer = observerDeferred.promise;
  const actualThen = original.then.bind(original);
  let first = true;
  void Object.defineProperty(original, 'then', {
    value: (...args: Parameters<typeof original.then>) => {
      if (first) {
        first = false;
        return observer;
      }
      return actualThen(...args);
    },
  });
  return { original, observer };
}

test('UC2 ordinary tracked setup and closure preserve both actual distinct rejection causes as unknown', async () => {
  const { ordinaryHoldSetupOperationV1, createOrdinaryHoldClosureLedgerV1 } =
    await import('../fixtures/dependency-owner-custody');
  for (const useClosure of [false, true]) {
    for (const primary of [new Error('actual original'), undefined]) {
      const observerFailure = new Error('actual observer');
      const { original, observer } = ordinaryRejectedObserverPair(primary, observerFailure, true);
      const records: Parameters<typeof ordinaryHoldSetupOperationV1>[0] = [];
      const ledger = createOrdinaryHoldClosureLedgerV1(['before:file:read']);
      const operation = useClosure
        ? ledger.run('before:file:read', () => original)
        : ordinaryHoldSetupOperationV1(records, 'inert.read', () => original);
      await operation.then(
        () => {
          throw Error('expected unknown observer refusal');
        },
        (cause: unknown) => {
          expect(cause).toBeInstanceOf(AggregateError);
          if (!(cause instanceof AggregateError)) throw Error('both original causes absent');
          expect(cause.errors).toHaveLength(2);
          expect(cause.errors[0]).toBe(primary);
          expect(cause.errors[1]).toBe(observerFailure);
        },
      );
      const record = useClosure ? ledger.inspect().at(0) : records.at(0);
      expect(record?.original).toBe(original);
      expect(record?.observer).toBe(observer);
      expect(record?.state).toBe('unknown');
      expect(record?.joined).toBe(false);
      const outcomes = await Promise.allSettled([original, observer]);
      expect(outcomes[0]).toEqual({ status: 'rejected', reason: primary });
      expect(outcomes[1]).toEqual({ status: 'rejected', reason: observerFailure });
    }
  }
});

test('UC2 ordinary tracked observer failure preserves sole or identical actual cause', async () => {
  const { ordinaryHoldSetupOperationV1 } = await import('../fixtures/dependency-owner-custody');
  for (const rejected of [false, true]) {
    const failure = new Error('same actual cause');
    const { original } = ordinaryRejectedObserverPair(failure, failure, rejected);
    const records: Parameters<typeof ordinaryHoldSetupOperationV1>[0] = [];
    await ordinaryHoldSetupOperationV1(records, 'inert.read', () => original).then(
      () => {
        throw Error('expected observer refusal');
      },
      (cause: unknown) => {
        expect(cause).toBe(failure);
      },
    );
    expect(records[0]?.state).toBe('unknown');
    expect(records[0]?.joined).toBe(false);
  }
});

test('UC2 ordinary load packet refuses same-length valid hash corruption before acquisition', async () => {
  const { decodeOrdinaryHoldLoadPacketV1 } = await import('../fixtures/dependency-owner-custody');
  const packet = await readFile(
    new URL('../fixtures/ordinary-input-load-expectations-20261105.json', import.meta.url),
    'utf8',
  );
  const decoded = JSON.parse(packet) as { sourceRoot: string; rows: { sha256: string }[] };
  const first = decoded.rows.at(0);
  if (first === undefined) throw Error('sealed receipt row absent');
  const changedHash = (first.sha256.startsWith('0') ? '1' : '0') + first.sha256.slice(1);
  const corrupted = packet.replace(first.sha256, changedHash);
  const changed = JSON.parse(corrupted) as { sourceRoot: string; rows: { sha256: string }[] };
  expect(corrupted).not.toBe(packet);
  expect(Buffer.byteLength(corrupted)).toBe(Buffer.byteLength(packet));
  expect(changed.rows).toHaveLength(44);
  expect(changed.sourceRoot).toBe(decoded.sourceRoot);
  expect(changed.rows[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(changed.rows[0]?.sha256).toBe(changedHash);
  expect(() => decodeOrdinaryHoldLoadPacketV1(decoded.sourceRoot, corrupted)).toThrow('digest');
});

interface CoupledLedgerHarness {
  reserveNative(label: string, kind: string, args: unknown[], receiver?: unknown): object;
  attachNative<T>(ticket: object, original: T): T;
  linkWrapper<T extends object>(wrapper: T, tickets: object[], kind: string): T;
  captureOriginal(preparation: object, original: object, observed: object): void;
  inspectLedger(): {
    stopped: boolean;
    fatalObservation?: { kind?: string; acquired?: object; observed?: object };
  };
  reserveScannerCall(args: unknown[]): object;
  attachScannerCall(call: object, original: Promise<unknown>): Promise<unknown>;
  reserveOperation(label: string, kind: string, receiver: unknown, args: unknown[]): object;
  returnOperation(ticket: object, returned: unknown): unknown;
  captureKeeper(owner: object, ownership: object, keeper: object): void;
  captureSettlement(
    record: object,
    settlement: object,
    original: Promise<unknown>,
    observer: Promise<void>,
  ): void;
  reserveControllerControl(label: string): object;
  attachControllerControl(ticket: object, original: Promise<unknown>): Promise<unknown>;
  capturePreparation(preparation: object, record: object): void;
  inspectKnownComposition(): {
    controls: readonly {
      label: string;
      original?: Promise<unknown>;
      observer?: Promise<void>;
      phase: string;
      cause?: unknown;
    }[];
    preparations: readonly { preparation: object; record: object }[];
    scanners: readonly {
      phase: string;
      original?: object;
      nativePhase: string;
      closeCause?: unknown;
      nativeEntries: number;
    }[];
  };
  requireControllerPreparation(preparation: object): object;
  reserveScanner(args: readonly unknown[]): object;
  attachScannerPromise(ticket: object, original: Promise<unknown>): Promise<unknown>;
  joinKnownComposition(): Promise<void>;
}
async function coupledLedger(): Promise<CoupledLedgerHarness> {
  const fixture = await import('../fixtures/dependency-owner-custody');
  expect(typeof fixture.ordinaryCoupledPortSourcesV1).toBe('function');
  const source = fixture
    .ordinaryCoupledPortSourcesV1('/ordinary-coupled')
    .get('ordinary-hold-v1:ledger');
  if (source === undefined) throw new Error('coupled ledger source absent');
  const ts = await import('typescript');
  const compiled = ts
    .transpileModule(source.replaceAll('export ', ''), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/export \{\};?/, '');
  expect(compiled).not.toMatch(/\bimport\b/);
  return runInNewContext(
    `${compiled}\n({reserveControllerControl,attachControllerControl,capturePreparation,inspectKnownComposition,requireControllerPreparation,reserveScanner,attachScannerPromise,joinKnownComposition,captureSettlement,reserveOperation,returnOperation,captureKeeper,reserveScannerCall,attachScannerCall,reserveNative,attachNative,linkWrapper,captureOriginal,inspectLedger})`,
    {},
  ) as CoupledLedgerHarness;
}

test('UC2 coupled control ledger retains rejected originals and refuses duplicate controls', async () => {
  const ledger = await coupledLedger();
  const cause = new Error('original body refusal');
  const original = Promise.reject(cause);
  const ticket = ledger.reserveControllerControl('completion');
  const returned = ledger.attachControllerControl(ticket, original);
  expect(returned).toBe(original);
  await Promise.allSettled([original]);
  const [observed] = ledger.inspectKnownComposition().controls;
  expect(observed.original).toBe(original);
  expect(observed.observer).not.toBe(original);
  await observed.observer;
  expect(ledger.inspectKnownComposition().controls[0].cause).toBe(cause);
  expect(() => ledger.reserveControllerControl('completion')).toThrow('control');
});

test('UC2 coupled preparation tap retains exact association and refuses foreign identity', async () => {
  const ledger = await coupledLedger();
  const preparation = Object.freeze({});
  const record = { owner: {}, ownership: {} };
  ledger.capturePreparation(preparation, record);
  expect(ledger.requireControllerPreparation(preparation)).toBe(record);
  expect(ledger.inspectKnownComposition().preparations[0].preparation).toBe(preparation);
  expect(() => ledger.requireControllerPreparation({})).toThrow('preparation');
  ledger.capturePreparation(preparation, record);
  expect(ledger.inspectKnownComposition().preparations).toHaveLength(1);
});

test('UC2 coupled scanner preserves original Promise monitor receiver and one close delegation', async () => {
  const ledger = await coupledLedger();
  const calls: unknown[][] = [];
  const monitor = {
    close(this: object, ...args: unknown[]) {
      calls.push([this, ...args]);
      return 7;
    },
  };
  const original = Promise.resolve(monitor);
  const ticket = ledger.reserveScanner(['/artifact', 123, true]);
  expect(ledger.attachScannerPromise(ticket, original)).toBe(original);
  expect(await original).toBe(monitor);
  expect(monitor.close('argument')).toBe(7);
  expect(calls).toEqual([[monitor, 'argument']]);
  expect(ledger.inspectKnownComposition().scanners[0].nativePhase).toBe('returned');
  expect(() => monitor.close()).toThrow('re-entry');
  expect(calls).toHaveLength(1);
});

test('UC2 coupled scanner preserves thrown close cause and never retries a delegated throw', async () => {
  const ledger = await coupledLedger();
  const cause = new Error('original close unknown');
  let entries = 0;
  const monitor = {
    close: () => {
      entries++;
      throw cause;
    },
  };
  const original = Promise.resolve(monitor);
  void ledger.attachScannerPromise(ledger.reserveScanner(['/artifact', 123, true]), original);
  await original;
  expect(() => monitor.close()).toThrow();
  expect(ledger.inspectKnownComposition().scanners[0].closeCause).toBe(cause);
  expect(() => monitor.close()).toThrow('re-entry');
  expect(entries).toBe(1);
});

test('UC2 coupled graph layout binds actual projections once and rejects premature use', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  expect(typeof fixture.ordinaryCoupledPortSourcesV1).toBe('function');
  const source = fixture
    .ordinaryCoupledPortSourcesV1('/ordinary-coupled')
    .get('ordinary-hold-v1:graph-layout');
  if (source === undefined) throw new Error('coupled layout source absent');
  const ts = await import('typescript');
  const compiled = ts
    .transpileModule(source.replaceAll('export ', ''), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/export \{\};?/, '');
  const port = runInNewContext(`${compiled}\n({bindGraphLayouts,envLayout})`, {}) as {
    bindGraphLayouts(layouts: object): void;
    envLayout(name: string): object;
  };
  expect(() => port.envLayout('prod')).toThrow('unbound');
  const prod = { stateDir: '/prod' },
    dev = { stateDir: '/dev' };
  port.bindGraphLayouts({ prod, dev });
  expect(port.envLayout('prod')).toEqual(prod);
  expect(port.envLayout('prod')).not.toBe(prod);
  expect(Object.isFrozen(port.envLayout('prod'))).toBe(true);
  expect(port.envLayout('dev')).toEqual(dev);
  expect(Object.isFrozen(port.envLayout('dev'))).toBe(true);
  prod.stateDir = '/changed';
  expect(port.envLayout('prod')).toEqual({ stateDir: '/prod' });
  expect(() => {
    port.bindGraphLayouts({ prod, dev });
  }).toThrow('bound');
  expect(() => port.envLayout('foreign')).toThrow('name');
});

test('UC2 coupled prospective planner preserves physical bases and emits exact three-layer image', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  expect(typeof fixture.planOrdinaryCoupledBuildV1).toBe('function');
  const root = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of fixture.ordinaryHoldSourceEpochV1.pins)
    supplied.set(`${root}/${pin.relative}`, await readFile(`${root}/${pin.relative}`));
  const authority = JSON.parse(
    await readFile(
      new URL('../fixtures/ordinary-coupled-r2-authority-20261105.json', import.meta.url),
      'utf8',
    ),
  ) as { patch: { utf8: string }; manifest: { utf8: string } };
  const patch = new TextEncoder().encode(authority.patch.utf8),
    manifest = new TextEncoder().encode(authority.manifest.utf8);
  const plan = fixture.planOrdinaryCoupledBuildV1(root, supplied, patch, manifest);
  expect(plan.sourceEpoch).toBe('ordinary-uc2-coupled-r2-v1');
  expect(plan.portSources.size).toBe(31);
  const closure = JSON.parse(
    await readFile(
      new URL('../fixtures/ordinary-input-closure-manifest-20261105.json', import.meta.url),
      'utf8',
    ),
  ) as { generatedEntry: { template: { exports: [string, string][]; ledger: string } } };
  expect(closure.generatedEntry.template.exports).toHaveLength(17);
  const previousEntry =
    closure.generatedEntry.template.exports
      .map(([name, path]) => `export * as ${name} from ${JSON.stringify(`${root}/${path}`)};`)
      .join('\n') +
    '\n' +
    closure.generatedEntry.template.ledger;
  expect(plan.entrySource).toBe(
    previousEntry +
      "export {runOrdinaryKnownComposition} from 'ordinary-hold-v1:controller';\nexport {inspectKnownComposition} from 'ordinary-hold-v1:ledger';\n",
  );
  expect(plan.entrySource.split(closure.generatedEntry.template.ledger).length - 1).toBe(1);

  expect(plan.layers).toHaveLength(17);
  const owner = plan.layers.find((layer) => layer.path.endsWith('/edge-ownership.ts'));
  expect(owner?.physicalSha256).toBe(
    'd979452d02089652c12515af8bfcaeede1fa13bc458a66013f5463555b528f68',
  );
  expect(owner?.proposedSha256).toBe(
    '7e900fbd23ec048f677154f8659bfe8137af810c1309f534aa9b5a9ad7962de3',
  );
  expect(plan.appliedCuts.some((cut) => cut.id === 'owner.preparation')).toBe(true);
  expect(plan.appliedCuts.some((cut) => cut.id === 'complete.acceptance')).toBe(true);
  expect(plan.appliedCuts.some((cut) => cut.id === 'graph.layout')).toBe(true);
  const wrong = new Map(supplied);
  wrong.set(`${root}/tools/tool-remote-scripts/src/lib/edge-ownership.ts`, new Uint8Array());
  expect(() => fixture.planOrdinaryCoupledBuildV1(root, wrong, patch, manifest)).toThrow(
    'source bytes',
  );
  const altered = patch.slice();
  altered[0] ^= 1;
  expect(() => fixture.planOrdinaryCoupledBuildV1(root, supplied, altered, manifest)).toThrow();
});

test('UC2 coupled known join waits for the retained original before checking terminal custody', async () => {
  const ledger = await coupledLedger();
  let resolveOriginal: (() => void) | undefined;
  const original = new Promise<void>((resolve) => {
    resolveOriginal = resolve;
  });
  const compositionOriginal = Promise.resolve(),
    projectionOriginal = Promise.resolve();
  const compositionObserver = compositionOriginal.then(() => undefined),
    projectionObserver = projectionOriginal.then(() => undefined);
  const record = {
    owner: {},
    phase: 'closed',
    ownership: { state: 'closing' },
    originals: new Set(),
    composition: { original: compositionOriginal, observer: compositionObserver },
    projection: { original: projectionOriginal, observer: projectionObserver },
  };
  ledger.captureSettlement(record, record.composition, compositionOriginal, compositionObserver);
  ledger.captureSettlement(record, record.projection, projectionOriginal, projectionObserver);
  ledger.capturePreparation({}, record);
  for (const label of ['fixture', 'owner-action', 'outer-owner', 'completion'])
    void ledger.attachControllerControl(
      ledger.reserveControllerControl(label),
      label === 'completion' ? original : Promise.resolve(),
    );
  let settled = false;
  const joined = ledger.joinKnownComposition();
  const observation = joined.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(
      ledger.inspectKnownComposition().controls.find((control) => control.label === 'completion')
        ?.original,
    ).toBe(original);
  } finally {
    if (resolveOriginal !== undefined) resolveOriginal();
    await Promise.allSettled([original, joined, observation]);
  }
  expect(resolveOriginal).toBeDefined();
  expect(settled).toBe(true);
  await refuses(joined, 'keeper');
});

test('UC2 coupled scanner before-entry refusal permits only the saved first real close after STOP', async () => {
  const ledger = await coupledLedger();
  let entries = 0;
  const monitor = {
    close: () => {
      entries++;
      return 'closed';
    },
  };
  const original = Promise.resolve(monitor);
  void ledger.attachScannerPromise(ledger.reserveScanner(['/artifact', 123, true]), original);
  await original;
  expect(() => {
    Reflect.apply(monitor.close, {}, []);
  }).toThrow('receiver');
  expect(entries).toBe(0);
  expect(ledger.inspectKnownComposition().scanners[0].nativePhase).toBe('not-entered');
  expect(monitor.close()).toBe('closed');
  expect(entries).toBe(1);
});

test('UC2 coupled source generator leaves every old virtual load receipt unchanged', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  const packet = JSON.parse(
    await readFile(
      new URL('../fixtures/ordinary-input-load-expectations-20261105.json', import.meta.url),
      'utf8',
    ),
  ) as {
    sourceRoot: string;
    rows: { namespace: string; identity: string; sha256: string; bytes: number }[];
  };
  const supplied = new Map<string, Uint8Array>();
  for (const pin of fixture.ordinaryHoldSourceEpochV1.pins)
    supplied.set(
      `${packet.sourceRoot}/${pin.relative}`,
      await readFile(`${packet.sourceRoot}/${pin.relative}`),
    );
  const oldPlan = fixture.planOrdinaryHoldBuildV1(packet.sourceRoot, supplied);
  const ports = oldPlan.portSources;
  const files = packet.rows.filter((row) => row.namespace === 'file');
  expect(files).toHaveLength(16);
  for (const row of files) {
    const bytes = oldPlan.materialized.get(row.identity);
    if (bytes === undefined) throw new Error('old rendered file receipt absent');
    expect(bytes.byteLength).toBe(row.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
  }
  const rows = packet.rows.filter((row) => row.namespace !== 'file');
  expect(rows).toHaveLength(28);
  for (const row of rows) {
    const source = ports.get(
      row.identity.startsWith('ordinary-hold-v1:')
        ? row.identity
        : `ordinary-hold-v1:${row.identity}`,
    );
    if (source === undefined) throw new Error(`old virtual receipt absent: ${row.identity}`);
    expect(Buffer.byteLength(source)).toBe(row.bytes);
    expect(createHash('sha256').update(source).digest('hex')).toBe(row.sha256);
  }
});

test('UC2 coupled generated controller and bootstrap express genuine source-only entries', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  const ports = fixture.ordinaryCoupledPortSourcesV1('/ordinary-coupled');
  const controller = ports.get('ordinary-hold-v1:controller');
  const acceptance = ports.get('ordinary-hold-v1:complete-acceptance');
  if (controller === undefined || acceptance === undefined)
    throw new Error('coupled control source absent');
  expect(controller).toContain(
    '/ordinary-coupled/tools/tool-remote-scripts/src/fixtures/dependency-participant-restoration.ts',
  );
  expect(controller).not.toContain('/fixtures/dependency-complete-activation.ts');
  // Coverage: structural source contracts only; native composition execution is separately held.
  for (const call of [
    "participantActivationFixture(['prod'])",
    'prepareInitialDependencyHandoffUnderOwner(owner,request,fixture.layouts,deadline,fixture.root,fixture.ports)',
    'consumePreparedDependencyActivation(owner,prepared)',
    'releasePreparedDependencyActivation(owner,prepared)',
    'assertParticipantRestorationContext(context)',
    "writerManifestContents:'x'.repeat(262145)",
  ])
    expect(controller).toContain(call);
  expect(acceptance).toContain(
    'return attachControllerControl(ticket,Reflect.apply(original,undefined,args))',
  );
  const bootstrap = fixture.ordinaryKnownBootstrapSourceV1(
    '/owned/image.js',
    'known-initial-prepared-release',
  );
  expect(bootstrap.indexOf('setInterval(')).toBeLessThan(
    bootstrap.indexOf('const original=import('),
  );
  expect(bootstrap).not.toContain("from 'ordinary-hold-v1:ledger'");
  expect(() => fixture.ordinaryKnownBootstrapSourceV1('/owned/image.js', 'foreign')).toThrow(
    'case',
  );
});

test('UC2 coupled archive refuses modified contexts hunk coordinates paths and output identities', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  const authority = JSON.parse(
    await readFile(
      new URL('../fixtures/ordinary-coupled-r2-authority-20261105.json', import.meta.url),
      'utf8',
    ),
  ) as { patch: { utf8: string }; manifest: { utf8: string } };
  const manifest = JSON.parse(authority.manifest.utf8) as {
    files: {
      path: string;
      base: { sha256: string; bytes: number };
      proposed: { sha256: string; bytes: number };
      hunks: unknown[];
    }[];
  };
  const root = new URL('../../../../', import.meta.url);
  const bases = new Map<string, Uint8Array>();
  for (const file of manifest.files) bases.set(file.path, await readFile(new URL(file.path, root)));
  const identities = manifest.files.map((file) => ({
    path: file.path,
    baseSha256: file.base.sha256,
    proposedSha256: file.proposed.sha256,
    baseLength: file.base.bytes,
    proposedLength: file.proposed.bytes,
    hunkCount: file.hunks.length,
  }));
  const encode = (text: string) => new TextEncoder().encode(text);
  const patch = authority.patch.utf8;
  expect(() =>
    fixture.applyPatchStructure(
      bases,
      encode(patch.replace('@@ -328,7 +328,10 @@', '@@ -329,7 +328,10 @@')),
      identities,
    ),
  ).toThrow();
  expect(() =>
    fixture.applyPatchStructure(
      bases,
      encode(
        patch.replace(
          'record.ownership.composition === record &&',
          'record.ownership.composition === foreign &&',
        ),
      ),
      identities,
    ),
  ).toThrow('context');
  expect(() =>
    fixture.applyPatchStructure(
      bases,
      encode(
        patch +
          'diff --git a/foreign.ts b/foreign.ts\n--- a/foreign.ts\n+++ b/foreign.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n',
      ),
      identities,
    ),
  ).toThrow();
  expect(() =>
    fixture.applyPatchStructure(
      bases,
      encode(patch),
      identities.map((identity, index) =>
        index === 0 ? { ...identity, proposedSha256: '0'.repeat(64) } : identity,
      ),
    ),
  ).toThrow('proposed identity');
  expect(() =>
    fixture.applyCoupledArchive(bases, encode(patch), encode(authority.manifest.utf8 + ' ')),
  ).toThrow('manifest authority');
});

test('UC2 coupled scanner port enrolls only retained returns before caller continuation', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  const ts = await import('typescript');
  const ports = fixture.ordinaryCoupledPortSourcesV1('/ordinary-coupled');
  const ledger = ports.get('ordinary-hold-v1:ledger');
  const port = ports.get('ordinary-hold-v1:complete-scanner');
  if (ledger === undefined || port === undefined) throw new Error('coupled scanner sources absent');
  const begin = port.indexOf('export function scanMigrationArtifact');
  if (begin < 0) throw new Error('coupled scanner forwarding declaration absent');
  const calls: unknown[][] = [];
  const nonretained = {
    close: () => {
      throw new Error('nonretained monitor must not be closed');
    },
  };
  const retained = {
    close: () => {
      return 'closed';
    },
  };
  const nonretainedClose = nonretained.close;
  const unretainedPromise = Promise.resolve(nonretained);
  const retainedPromise = Promise.resolve(retained);
  const scanCause = new Error('sentinel nonretained scan rejection');
  const original = (...args: unknown[]) => {
    calls.push(args);
    if (args[0] === '/rejected') return Promise.reject(scanCause);
    return args[2] === true ? retainedPromise : unretainedPromise;
  };
  const compiled = ts.transpileModule(
    `const original=provided;\n${ledger.replaceAll('export ', '')}\n${port.slice(begin).replaceAll('export ', '')}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  const forwarded = runInNewContext(
    `${compiled.replace(/export \{\};?/, '')}\n({scanMigrationArtifact,inspectKnownComposition,inspectLedger})`,
    { provided: original },
  ) as {
    scanMigrationArtifact(...args: unknown[]): Promise<object>;
    inspectKnownComposition(): {
      scanners: readonly { original: object }[];
      scannerCalls: readonly { phase: string; cause?: unknown }[];
    };
    inspectLedger(): { stopped: boolean };
  };
  expect(forwarded.scanMigrationArtifact('/source', 123)).toBe(unretainedPromise);
  expect(await unretainedPromise).toBe(nonretained);
  expect(nonretained.close).toBe(nonretainedClose);
  expect(forwarded.inspectKnownComposition().scanners).toHaveLength(0);
  const returned = forwarded.scanMigrationArtifact('/retained', 123, true);
  expect(returned).toBe(retainedPromise);
  expect(await returned).toBe(retained);
  expect(forwarded.inspectKnownComposition().scanners[0].original).toBe(retained);
  expect(retained.close()).toBe('closed');
  expect(calls).toEqual([
    ['/source', 123],
    ['/retained', 123, true],
  ]);
  const rejected = forwarded.scanMigrationArtifact('/rejected', 123);
  await Promise.allSettled([rejected]);
  expect(forwarded.inspectLedger().stopped).toBe(true);
  expect(forwarded.inspectKnownComposition().scannerCalls[2].phase).toBe('unknown');
  expect(forwarded.inspectKnownComposition().scannerCalls[2].cause).toBe(scanCause);
  expect(forwarded.inspectKnownComposition().scanners).toHaveLength(1);
});

test('UC2 coupled known join refuses absent actual owner body and projection observations', async () => {
  const ledger = await coupledLedger();
  ledger.capturePreparation(
    {},
    { phase: 'closed', ownership: { state: 'closing' }, originals: new Set() },
  );
  for (const label of ['fixture', 'owner-action', 'outer-owner', 'completion'])
    void ledger.attachControllerControl(ledger.reserveControllerControl(label), Promise.resolve());
  await refuses(ledger.joinKnownComposition(), 'owner observation');
});

function finiteCoupledJoin(ledger: CoupledLedgerHarness, failedObserver?: Promise<void>) {
  const composition = Promise.resolve(),
    projection = Promise.resolve();
  const compositionObserver = failedObserver ?? composition.then(() => undefined);
  const projectionObserver = projection.then(() => undefined);
  const owner = {},
    ownership = { state: 'closing' };
  const record = {
    owner,
    ownership,
    phase: 'closed',
    originals: new Set(),
    composition: { original: composition, observer: compositionObserver },
    projection: { original: projection, observer: projectionObserver },
  };
  ledger.capturePreparation({}, record);
  ledger.captureSettlement(record, record.composition, composition, compositionObserver);
  ledger.captureSettlement(record, record.projection, projection, projectionObserver);
  const interval = Object.freeze({ inert: 'production keeper interval' });
  ledger.returnOperation(
    ledger.reserveOperation('owner.interval', 'sync', undefined, [() => record, 60000]),
    interval,
  );
  ledger.captureKeeper(owner, ownership, { interval, pending: Promise.resolve() });
  ledger.returnOperation(
    ledger.reserveOperation('owner.clear', 'sync', undefined, [interval]),
    undefined,
  );
  for (const label of ['fixture', 'owner-action', 'outer-owner', 'completion'])
    void ledger.attachControllerControl(ledger.reserveControllerControl(label), Promise.resolve());
  return { compositionObserver, projectionObserver };
}

test('UC2 coupled known join accepts exact inert keeper creation and retirement records', async () => {
  const ledger = await coupledLedger();
  finiteCoupledJoin(ledger);
  await ledger.joinKnownComposition();
  expect(
    ledger.inspectKnownComposition().controls.every((control) => control.phase === 'fulfilled'),
  ).toBe(true);
});

test('UC2 coupled known join retains distinct rejected observer outcome including undefined', async () => {
  const ledger = await coupledLedger();
  const observer = new Promise<void>((_resolve, reject) => {
    // Undefined is the deliberately tested original boundary cause.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    reject();
  });
  void observer.catch(() => undefined);
  finiteCoupledJoin(ledger, observer);
  await refuses(ledger.joinKnownComposition(), 'observer rejected');
  const inspection = ledger.inspectKnownComposition() as unknown as {
    joinOutcomes: readonly { observer?: Promise<void>; outcome: PromiseSettledResult<unknown> }[];
  };
  const retained = inspection.joinOutcomes.find((observation) => observation.observer === observer);
  expect(retained?.outcome.status).toBe('rejected');
  if (retained?.outcome.status !== 'rejected')
    throw new Error('original observer rejection missing');
  expect(retained.outcome.reason).toBeUndefined();
});

test('UC2 coupled scanner call tree admits five actual originals and refuses sixth before entry', async () => {
  const ledger = await coupledLedger();
  const originals: Promise<unknown>[] = [];
  let entered = 0;
  try {
    for (let ordinal = 0; ordinal < 5; ordinal++) {
      const call = ledger.reserveScannerCall(['/artifact', 123, ordinal === 4]);
      entered++;
      const original = Promise.resolve(ordinal);
      originals.push(original);
      expect(ledger.attachScannerCall(call, original)).toBe(original);
    }
    expect(() => {
      ledger.reserveScannerCall(['/sixth', 123]);
      entered++;
    }).toThrow('cap');
    expect(entered).toBe(5);
  } finally {
    await Promise.allSettled(originals);
  }
});

test('UC2 coupled typing preserves unchanged forwarding runtime syntax trees', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  const ts = await import('typescript');
  const root = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of fixture.ordinaryHoldSourceEpochV1.pins)
    supplied.set(`${root}/${pin.relative}`, await readFile(`${root}/${pin.relative}`));
  const previous = fixture.planOrdinaryHoldBuildV1(root, supplied).portSources;
  const prospective = fixture.ordinaryCoupledPortSourcesV1(root);
  function shape(node: Node): unknown {
    if (ts.isParenthesizedExpression(node)) return shape(node.expression);
    const children: unknown[] = [];
    ts.forEachChild(node, (child) => {
      children.push(shape(child));
    });
    const text = ts.isIdentifier(node)
      ? String(node.escapedText)
      : ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)
        ? node.text
        : null;
    return [node.kind, text, children];
  }
  const syntax = (source: string) =>
    shape(
      ts.createSourceFile(
        'port.js',
        ts.transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            removeComments: true,
          },
        }).outputText,
        ts.ScriptTarget.ESNext,
        true,
      ),
    );
  let checked = 0;
  for (const [specifier, source] of previous) {
    if (
      [
        'ordinary-hold-v1:ledger',
        'ordinary-hold-v1:complete-scanner',
        'ordinary-hold-v1:migration-fs',
      ].includes(specifier)
    )
      continue;
    const annotated = prospective.get(specifier);
    if (annotated === undefined) throw new Error('typed forwarding port absent');
    expect(syntax(annotated)).toEqual(syntax(source));
    checked++;
  }
  expect(checked).toBe(25);
});

test('UC2 coupled scanner association explicitly refuses a native-linked scanner without an opaque obligation', async () => {
  const ledger = await coupledLedger();
  const native = ledger.reserveNative('storage.openSync', 'fd', ['inert descriptor'], undefined);
  ledger.attachNative(native, 7);
  const monitor = { close: () => undefined };
  ledger.linkWrapper(monitor, [native], 'scanner');
  const preparation = {},
    original = {},
    observed = {
      acquisition: { kind: 'scanner', scanner: monitor },
      preparation: { owner: {}, ownership: {} },
    };
  ledger.captureOriginal(preparation, original, observed);
  const custody = ledger.inspectLedger();
  expect(custody.stopped).toBe(true);
  expect(custody.fatalObservation?.acquired).toBe(monitor);
  expect(custody.fatalObservation?.observed).toBe(observed);
  expect(custody.fatalObservation?.kind).toBeUndefined();
});

test('UC2 coupled scanner association accepts the exact retained opaque monitor', async () => {
  const ledger = await coupledLedger();
  const monitor = { close: () => undefined };
  const original = Promise.resolve(monitor);
  void ledger.attachScannerPromise(ledger.reserveScanner(['/inert', 123, true]), original);
  await original;
  ledger.captureOriginal(
    {},
    {},
    {
      acquisition: { kind: 'scanner', scanner: monitor },
      preparation: { owner: {}, ownership: {} },
    },
  );
  expect(ledger.inspectLedger().stopped).toBe(false);
  monitor.close();
});

test('UC2 coupled migration overloads preserve named forwarding bodies with three explicit binding changes', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  const ts = await import('typescript');
  const root = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of fixture.ordinaryHoldSourceEpochV1.pins)
    supplied.set(`${root}/${pin.relative}`, await readFile(`${root}/${pin.relative}`));
  const previous = fixture
    .planOrdinaryHoldBuildV1(root, supplied)
    .portSources.get('ordinary-hold-v1:migration-fs');
  const prospective = fixture
    .ordinaryCoupledPortSourcesV1(root)
    .get('ordinary-hold-v1:migration-fs');
  if (previous === undefined || prospective === undefined)
    throw new Error('migration forwarding source missing');
  function forwards(source: string) {
    const emitted = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        removeComments: true,
      },
    }).outputText;
    const module = ts.createSourceFile('port.js', emitted, ts.ScriptTarget.ESNext, true);
    const declarations = new Map<
      string,
      { name: string; parameters: string[]; body: string; binding: string }
    >();
    function retain(node: Node, binding: string) {
      if (
        (!ts.isFunctionDeclaration(node) && !ts.isFunctionExpression(node)) ||
        node.name === undefined ||
        node.body === undefined
      )
        throw new Error('named forwarding body missing');
      declarations.set(node.name.text, {
        name: node.name.text,
        parameters: node.parameters.map((parameter) => parameter.getText(module)),
        body: node.body.getText(module),
        binding,
      });
    }
    for (const statement of module.statements) {
      if (ts.isFunctionDeclaration(statement)) retain(statement, 'declaration');
      else if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations) {
          let initializer = declaration.initializer;
          if (initializer === undefined) continue;
          while (ts.isParenthesizedExpression(initializer)) initializer = initializer.expression;
          if (ts.isFunctionExpression(initializer)) {
            if (
              !ts.isIdentifier(declaration.name) ||
              initializer.name?.text !== declaration.name.text
            )
              throw new Error('migration export name changed');
            retain(initializer, 'binding');
          }
        }
    }
    return declarations;
  }
  const before = forwards(previous),
    after = forwards(prospective);
  expect(before.size).toBe(6);
  expect(after.size).toBe(6);
  const changed: string[] = [];
  for (const [name, original] of before) {
    const annotated = after.get(name);
    if (annotated === undefined) throw new Error('migration export disappeared');
    expect(annotated.name).toBe(original.name);
    expect(annotated.parameters).toEqual(original.parameters);
    expect(annotated.body).toBe(original.body);
    if (annotated.binding !== original.binding) changed.push(name);
  }
  expect(changed.sort()).toEqual(['mkdtempSync', 'readFileSync', 'readdirSync']);
});

test('UC2 coupled fixture preserves the exact historical constructor prefix', async () => {
  const bytes = await readFile(new URL('../fixtures/dependency-owner-custody.ts', import.meta.url));
  expect(
    bytes.indexOf("import { realpath as ordinaryHoldRealpath } from 'node:fs/promises';"),
  ).toBe(95701);
  const marker = "import { realpath as ordinaryHoldRealpath } from 'node:fs/promises';";
  expect(bytes.toString('utf8').split(marker).length - 1).toBe(1);
  expect(bytes.indexOf('\n' + marker)).toBe(95700);
  expect(createHash('sha256').update(bytes.subarray(0, 95701)).digest('hex')).toBe(
    '50281b36a01665b83062e7bb7d065361037182581fb791a89e1b049d65cf4b04',
  );
});

/** Inert rows exercise builder prediction guards without compiler or target execution. */
function coupledPredictionRows() {
  const root = '/coupled';
  const omissions = [
    `${root}/tools/tool-remote-scripts/src/lib/solver-reader-preparation.ts`,
    `${root}/node_modules/drizzle-orm/sql/functions/aggregate.js`,
    `${root}/node_modules/drizzle-orm/sql/functions/vector.js`,
  ];
  const rows = Array.from({ length: 287 }, (_, ordinal) => ({
    identity: `${root}/source-${String(ordinal)}.ts`,
    mode: 'default',
    bytes: 1,
    sha256: 'a'.repeat(64),
  }));
  const coverage = [
    ...rows,
    ...omissions.map((identity) => ({
      identity,
      mode: 'default',
      bytes: 1,
      sha256: 'a'.repeat(64),
    })),
  ];
  return { root, omissions, rows, coverage, files: coverage.map((row) => row.identity) };
}

test('KCT5 coupled prediction requires exact conservative subtraction and physical omissions', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  expect(typeof fixture.assertOrdinaryCoupledPredictionV1).toBe('function');
  const { root, omissions, rows, coverage, files } = coupledPredictionRows();
  fixture.assertOrdinaryCoupledPredictionV1(root, coverage, rows, files);
  for (const omitted of omissions) {
    expect(() => {
      fixture.assertOrdinaryCoupledPredictionV1(
        root,
        coverage,
        rows,
        files.filter((identity) => identity !== omitted),
      );
    }).toThrow('physical omission');
  }
  expect(() => {
    fixture.assertOrdinaryCoupledPredictionV1(
      root,
      coverage,
      [...rows.slice(1), coverage[287]],
      files,
    );
  }).toThrow('prediction identity');
  expect(() => {
    fixture.assertOrdinaryCoupledPredictionV1(root, coverage, rows.slice(1), files);
  }).toThrow('prediction census');
  expect(() => {
    fixture.assertOrdinaryCoupledPredictionV1(root, coverage, coverage, files);
  }).toThrow('prediction census');
  expect(() => {
    fixture.assertOrdinaryCoupledPredictionV1(
      root,
      coverage,
      rows.map((row, index) => (index === 0 ? { ...row, sha256: 'b'.repeat(64) } : row)),
      files,
    );
  }).toThrow('prediction bytes');
});

test('KCT5 coupled compiler identity prediction rejects added removed substituted and duplicate inputs', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  expect(typeof fixture.assertOrdinaryCoupledCompilerInputsV1).toBe('function');
  const { rows } = coupledPredictionRows();
  const predicted = rows.map((row) => row.identity);
  fixture.assertOrdinaryCoupledCompilerInputsV1(predicted, predicted);
  for (const observed of [
    predicted.slice(1),
    [...predicted, '/extra'],
    [...predicted.slice(1), '/substituted'],
    [...predicted.slice(1), predicted[1]],
  ])
    expect(() => {
      fixture.assertOrdinaryCoupledCompilerInputsV1(predicted, observed);
    }).toThrow('compiler prediction');
});

test('KCT5 coupled public builder refuses unsealed request before acquiring setup effects', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  expect(typeof fixture.buildOrdinaryCoupledImageV1).toBe('function');
  expect(() =>
    fixture.buildOrdinaryCoupledImageV1({
      version: 1,
      mode: 'build-only',
      sourceRoot: '/coupled',
      sourceEpoch: 'ordinary-uc2-coupled-r2-v1',
      loadExpectations: '{}',
      closureManifest: '{}',
      coverage: '{}',
      prediction: '{}',
      patch: new Uint8Array(),
      manifest: new Uint8Array(),
    }),
  ).toThrow();
});

async function coupledBuildRequest() {
  const sealedRoot = '/home/df/.codex/worktrees/1b31/puni-00';
  const read = (name: string) => readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
  const archive = JSON.parse(await read('ordinary-coupled-r2-authority-20261105.json')) as {
    patch: { utf8: string };
    manifest: { utf8: string };
  };
  return {
    version: 1,
    mode: 'build-only',
    sourceRoot: sealedRoot,
    sourceEpoch: 'ordinary-uc2-coupled-r2-v1',
    loadExpectations: await read('ordinary-coupled-load-expectations-20261107.json'),
    closureManifest: await read('ordinary-coupled-input-closure-20261107.json'),
    coverage: await read('ordinary-coupled-conservative-coverage-20261107.json'),
    prediction: await read('ordinary-coupled-compiler-prediction-20261107.json'),
    patch: new TextEncoder().encode(archive.patch.utf8),
    manifest: new TextEncoder().encode(archive.manifest.utf8),
  };
}

test('KCT5 coupled fixed packet admission binds independent bytes and keeps all omissions covered', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  const request = await coupledBuildRequest();
  const admitted = fixture.decodeOrdinaryCoupledBuildRequestV1(request);
  expect(admitted.sourceRoot).toBe('/home/df/.codex/worktrees/1b31/puni-00');
  for (const name of ['loadExpectations', 'closureManifest', 'coverage', 'prediction'] as const)
    expect((JSON.parse(request[name]) as { sourceRoot: string }).sourceRoot).toBe(
      '/home/df/.codex/worktrees/1b31/puni-00',
    );
  expect(admitted.coverage).toHaveLength(290);
  expect(admitted.prediction).toHaveLength(287);
  expect(admitted.loadExpectations).toHaveLength(47);
  expect(admitted.closureManifest.closureOperationCount).toBe(2064);
  const keys = fixture.ordinaryCoupledClosureKeysV1(admitted.closureManifest);
  expect(keys).toHaveLength(2064);
  expect(new Set(keys).size).toBe(2064);
  expect(createHash('sha256').update(JSON.stringify(keys)).digest('hex')).toBe(
    '17d67712ba3a45d34a7bb03197f75462c2df606d20c99763ff4bc9b3cd1a91a3',
  );
  expect(fixture.ordinaryCoupledSetupLabelsV1).toHaveLength(47);
  expect(new Set(fixture.ordinaryCoupledSetupLabelsV1).size).toBe(47);
  for (const name of ['loadExpectations', 'closureManifest', 'coverage', 'prediction'] as const) {
    const packet = request[name];
    const changed = packet.replace(/[a-f0-9]{64}/, (hash) =>
      hash.startsWith('a') ? 'b' + hash.slice(1) : 'a' + hash.slice(1),
    );
    expect(changed.length).toBe(packet.length);
    expect(() =>
      fixture.decodeOrdinaryCoupledBuildRequestV1({ ...request, [name]: changed }),
    ).toThrow('raw authority');
    expect(() =>
      fixture.decodeOrdinaryCoupledBuildRequestV1({ ...request, [name]: undefined }),
    ).toThrow('raw authority');
  }
  for (const name of ['patch', 'manifest'] as const) {
    const changed = request[name].slice();
    changed[0] ^= 1;
    expect(() =>
      fixture.decodeOrdinaryCoupledBuildRequestV1({ ...request, [name]: changed }),
    ).toThrow('r2 raw authority');
  }
  const compiler = admitted.closureManifest.files.find(
    (row) => row.identity === '/home/df/.bun/bin/bun',
  );
  expect(compiler?.roles).toEqual(['authority']);
  for (const omission of (JSON.parse(request.prediction) as { omissions: string[] }).omissions) {
    expect(
      admitted.closureManifest.files.some(
        (row) =>
          `${request.sourceRoot}/${row.identity}` === omission && row.roles.includes('compiler'),
      ),
    ).toBe(true);
    expect(admitted.prediction.some((row) => row.identity === omission)).toBe(false);
  }
});

test('KCT5 coupled recorder retains exactly16 file31 virtual callback identities and detects drift', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  const request = await coupledBuildRequest();
  const admitted = fixture.decodeOrdinaryCoupledBuildRequestV1(request);
  const physicalRoot = new URL('../../../../', import.meta.url).pathname.replace(/\/$/, '');
  const supplied = new Map<string, Uint8Array>();
  for (const pin of fixture.ordinaryHoldSourceEpochV1.pins)
    supplied.set(
      `${request.sourceRoot}/${pin.relative}`,
      await readFile(`${physicalRoot}/${pin.relative}`),
    );
  const plan = fixture.planOrdinaryCoupledBuildV1(
    request.sourceRoot,
    supplied,
    request.patch,
    request.manifest,
  );
  fixture.assertOrdinaryCoupledPlanV1(admitted, plan);
  const alteredPorts = new Map(plan.portSources);
  const controller = alteredPorts.get('ordinary-hold-v1:controller');
  if (controller === undefined) throw Error('coupled test controller absent');
  alteredPorts.set('ordinary-hold-v1:controller', controller + ' ');
  expect(() => {
    fixture.assertOrdinaryCoupledPlanV1(admitted, { ...plan, portSources: alteredPorts });
  }).toThrow('coverage bytes');
  const digest = createHash('sha256')
    .update(JSON.stringify(admitted.loadExpectations))
    .digest('hex');
  const recorder = fixture.createOrdinaryCoupledLoadRecorderV1(
    request.sourceRoot,
    admitted.loadExpectations,
    digest,
  );
  const returns: { contents: string | Uint8Array; loader: string }[] = [];
  for (const row of admitted.loadExpectations) {
    const contents =
      row.namespace === 'file'
        ? plan.materialized.get(row.identity)
        : plan.portSources.get(`ordinary-hold-v1:${row.identity}`);
    if (contents === undefined) throw Error('coupled test contents absent');
    const returned = {
      contents: typeof contents === 'string' ? contents : new Uint8Array(contents),
      loader: 'ts',
    };
    expect(recorder.record(row.namespace, row.identity, returned)).toBe(returned);
    returns.push(returned);
  }
  expect(recorder.settle()).toHaveLength(47);
  expect(typeof recorder.inspect).toBe('function');
  const observations = recorder.inspect();
  expect(observations).toHaveLength(47);
  expect(observations.every((row) => row.contentsReferencePreserved)).toBe(true);
  const copied = observations.find((row) => row.contents instanceof Uint8Array);
  if (copied === undefined || !(copied.contents instanceof Uint8Array))
    throw Error('inert copied callback bytes absent');
  copied.contents[0] ^= 1;
  const fresh = recorder.inspect().find((row) => row.identity === copied.identity);
  if (fresh === undefined) throw Error('inert fresh callback snapshot absent');
  expect(createHash('sha256').update(fresh.contents).digest('hex')).toBe(fresh.sha256);
  expect(createHash('sha256').update(copied.contents).digest('hex')).not.toBe(fresh.sha256);
  const changed = fixture.createOrdinaryCoupledLoadRecorderV1(
    request.sourceRoot,
    admitted.loadExpectations,
    digest,
  );
  for (let index = 0; index < admitted.loadExpectations.length; index++) {
    const row = admitted.loadExpectations[index];
    changed.record(row.namespace, row.identity, returns[index]);
  }
  returns[0].loader = 'js';
  expect(() => changed.settle()).toThrow('shape');
  const classifier = fixture.identifyOrdinaryCoupledMetafilePathV1;
  expect(classifier(request.sourceRoot, request.sourceRoot, 'ordinary-hold-v1:controller')).toBe(
    'ordinary-hold-v1:controller',
  );
  expect(() =>
    classifier(request.sourceRoot, request.sourceRoot, 'ordinary-hold-v1:foreign'),
  ).toThrow('virtual metadata');
});

test('KCT5 coupled compiler rows require each precommitted source byte length', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  expect(typeof fixture.assertOrdinaryCoupledCompilerRowsV1).toBe('function');
  const { rows } = coupledPredictionRows();
  fixture.assertOrdinaryCoupledCompilerRowsV1(rows, rows);
  expect(() => {
    fixture.assertOrdinaryCoupledCompilerRowsV1(
      rows,
      rows.map((row, index) => (index === 0 ? { ...row, bytes: 2 } : row)),
    );
  }).toThrow('compiler input bytes');
});

test('KCT5 coupled compiler finish requires the genuine retained setup original observer and joined record', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  expect(typeof fixture.assertOrdinaryCoupledCompilerJoinV1).toBe('function');
  const operations: Parameters<typeof fixture.ordinaryHoldSetupOperationV1>[0] = [];
  let custody: Parameters<typeof fixture.assertOrdinaryCoupledCompilerJoinV1>[2];
  const original = Promise.resolve('inert compiler stand-in');
  await fixture.ordinaryHoldSetupOperationV1(
    operations,
    'compiler.Bun.build',
    () => original,
    96,
    (record, retained, observer) => {
      custody = { record, original: retained, observer };
    },
  );
  fixture.assertOrdinaryCoupledCompilerJoinV1(operations, 0, custody);
  if (custody === undefined) throw Error('inert compiler custody absent');
  const retained = custody;
  expect(() => {
    fixture.assertOrdinaryCoupledCompilerJoinV1(operations, 0, {
      ...retained,
      original: Promise.resolve('replacement'),
    });
  }).toThrow('compiler join');
  expect(() => {
    fixture.assertOrdinaryCoupledCompilerJoinV1(operations, 0, {
      ...retained,
      observer: Promise.resolve(),
    });
  }).toThrow('compiler join');
  operations[0].joined = false;
  expect(() => {
    fixture.assertOrdinaryCoupledCompilerJoinV1(operations, 0, custody);
  }).toThrow('compiler join');
  operations[0].joined = true;
  fixture.assertOrdinaryCoupledCompilerJoinV1(operations, 0, custody);
});

test('KCT5 coupled observed edges require sealed destinations and external classifications including fixed omissions', async () => {
  const fixture = await import('../fixtures/dependency-owner-custody');
  expect(typeof fixture.assertOrdinaryCoupledMetadataEdgesV1).toBe('function');
  const request = fixture.decodeOrdinaryCoupledBuildRequestV1(await coupledBuildRequest());
  const scanner = `${request.sourceRoot}/tools/tool-remote-scripts/src/lib/dependency-migration-artifact-scanner.ts`;
  const sealed = request.coverage.flatMap((row) => row.imports);
  const scannerEdge = sealed.find((edge) => edge.destination === scanner);
  if (scannerEdge === undefined) throw Error('sealed scanner edge absent');
  const edge = {
    importerIdentity: scannerEdge.from,
    identity: scannerEdge.destination,
    kind: scannerEdge.kind,
    external: scannerEdge.external,
  };
  fixture.assertOrdinaryCoupledMetadataEdgesV1(request, '/entry.ts', [edge]);
  expect(() => {
    fixture.assertOrdinaryCoupledMetadataEdgesV1(request, '/entry.ts', [
      { ...edge, external: false },
    ]);
  }).toThrow('classification');
  expect(() => {
    fixture.assertOrdinaryCoupledMetadataEdgesV1(request, '/entry.ts', [
      { ...edge, identity: scanner + '.alias' },
    ]);
  }).toThrow('destination');
  expect(() => {
    fixture.assertOrdinaryCoupledMetadataEdgesV1(request, '/entry.ts', [
      { ...edge, kind: 'require-call' },
    ]);
  }).toThrow('classification');
  const prediction = JSON.parse((await coupledBuildRequest()).prediction) as {
    omissions: string[];
  };
  for (const omission of prediction.omissions) {
    const inherited = sealed.find((edge) => edge.destination === omission);
    if (inherited === undefined) throw Error('sealed omission edge absent');
    fixture.assertOrdinaryCoupledMetadataEdgesV1(request, '/entry.ts', [
      {
        importerIdentity: inherited.from,
        identity: inherited.destination,
        kind: inherited.kind,
        external: inherited.external,
      },
    ]);
  }
});
