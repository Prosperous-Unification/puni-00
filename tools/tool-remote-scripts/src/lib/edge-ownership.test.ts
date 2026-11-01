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

async function handoffFixture() {
  const { mkdir } = await import('node:fs/promises');
  const { root, plan } = fixture();
  await mkdir(`${root}/dev`);
  const layouts = {
    prod: plan.layouts[0],
    dev: { ...envLayout('dev'), root: `${root}/dev`, stateDir: `${root}/dev` },
  };
  return { root, layouts, plan: { sha: plan.sha, layouts: [layouts.prod, layouts.dev] } };
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
      return { pending, snapshots: [admission, activation, writers, source, complete] };
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
        retainInitialHandoffRecord(owner, layouts, 'exposure-intent', { payload: payload + 'x' }),
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
      expect(JSON.parse(stdout)).toMatchObject({ entered: true, injected: true });
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
