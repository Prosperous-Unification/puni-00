import { chmod, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  decodeOrdinaryEdgePolicy,
  initializeOrdinaryEdgePolicy,
  readOrdinaryEdgePolicy,
} from './edge-policy';
import { withCanonicalLock } from './lock';

const policy = (edgeState: string) =>
  ({ format: 'dependency-edge-policy', version: 1, phase: 'ordinary', edgeState }) as const;

test('closed ordinary namespace binds the exact state', () => {
  const directory = scratchSync('edge-policy-');
  expect(decodeOrdinaryEdgePolicy(policy(directory), directory)).toEqual(policy(directory));
  for (const value of [
    null,
    {},
    { ...policy(directory), extra: true },
    { ...policy(directory), phase: 'active' },
    { ...policy(directory), phase: 'restoring' },
    { ...policy(directory), edgeState: '/foreign' },
    { ...policy(directory), version: 2 },
  ]) {
    expect(() => decodeOrdinaryEdgePolicy(value, directory)).toThrow();
  }
});

test('exclusive initializer publishes a durable independently readable policy and refuses every existing path', async () => {
  const directory = scratchSync('edge-policy-');
  await initializeOrdinaryEdgePolicy(directory);
  expect(await readOrdinaryEdgePolicy(directory)).toEqual(policy(directory));
  const bytes = await readFile(`${directory}/edge-policy.json`, 'utf8');
  await refuses(initializeOrdinaryEdgePolicy(directory));
  expect(await readFile(`${directory}/edge-policy.json`, 'utf8')).toBe(bytes);
});

for (const fault of [
  'absent',
  'malformed',
  'oversize',
  'symlink',
  'directory',
  'unreadable',
] as const) {
  test(`policy reader refuses ${fault}`, async () => {
    const directory = scratchSync('edge-policy-');
    const path = `${directory}/edge-policy.json`;
    if (fault === 'symlink') {
      await writeFile(`${directory}/foreign`, JSON.stringify(policy(directory)));
      await symlink(`${directory}/foreign`, path);
    } else if (fault === 'directory') await mkdir(path);
    else if (fault !== 'absent')
      await writeFile(
        path,
        fault === 'malformed'
          ? '{'
          : fault === 'oversize'
            ? JSON.stringify(policy(directory)).padEnd(4097, ' ')
            : JSON.stringify(policy(directory)),
      );
    if (fault === 'unreadable') await chmod(path, 0);
    try {
      await refuses(readOrdinaryEdgePolicy(directory));
    } finally {
      if (fault === 'unreadable') await chmod(path, 0o600);
    }
  });
}

for (const marker of ['edge-owner.pending', 'edge-owner.json']) {
  test(`initializer refuses ${marker}`, async () => {
    const directory = scratchSync('edge-policy-');
    await writeFile(`${directory}/${marker}`, 'retained');
    await refuses(initializeOrdinaryEdgePolicy(directory), 'admission closed');
    await refuses(readFile(`${directory}/edge-policy.json`));
  });
}

test('initializer requires canonical edge lock and real state directory', async () => {
  const directory = scratchSync('edge-policy-');
  await withCanonicalLock(`${directory}/edge.lock`, async () => {
    await refuses(initializeOrdinaryEdgePolicy(directory), 'lock held');
  });
  await refuses(initializeOrdinaryEdgePolicy(`${directory}/.`));
  await symlink(directory, `${directory}-alias`);
  await refuses(readOrdinaryEdgePolicy(`${directory}-alias`));
});

for (const fault of [
  'opened-path',
  'final-path',
  'final-metadata',
  'file-sync',
  'directory-sync',
  'readback',
  'readback-inode',
] as const) {
  test(`production policy ${fault} fault refuses and preserves publication evidence`, async () => {
    const directory = scratchSync('edge-policy-fault-');
    if (!['file-sync', 'directory-sync', 'readback', 'readback-inode'].includes(fault))
      await initializeOrdinaryEdgePolicy(directory);
    const program = `
      import * as fs from 'node:fs/promises';
      import { mock } from 'bun:test';
      const originalOpen = fs.open;
      const originalLstat = fs.lstat;
      const fault = ${JSON.stringify(fault)};
      const directory = ${JSON.stringify(directory)};
      const path = directory + '/edge-policy.json';
      const native = await import('node:fs');
      const sync = native.fsyncSync;
      mock.module('node:fs', () => ({ ...native, fsyncSync: (descriptor) => {
        const isDirectory = native.fstatSync(descriptor).isDirectory();
        if ((fault === 'file-sync' && !isDirectory) || (fault === 'directory-sync' && isDirectory)) throw new Error('injected sync');
        sync(descriptor);
        if (fault === 'readback' && isDirectory) native.writeFileSync(path, '{}');
        if (fault === 'readback-inode' && isDirectory) { const bytes = native.readFileSync(path); native.renameSync(path, path + '.retained'); native.writeFileSync(path, bytes); }
      }}));
      let inspections = 0;
      mock.module('node:fs/promises', () => ({ ...fs,
        lstat: async (selected, ...options) => {
          if (selected === path && ++inspections === (fault === 'opened-path' ? 1 : 2) && ['opened-path', 'final-path'].includes(fault)) {
            await fs.rename(path, path + '.retained');
            await fs.writeFile(path, '{}');
          }
          return originalLstat(selected, ...options);
        },
        open: async (selected, ...options) => {
          if (selected === path && fault === 'readback' && options[0] === (0)) throw new Error('injected readback');
          const descriptor = await originalOpen(selected, ...options);
          if (selected === path && fault === 'readback' && (options[0] & 64)) {
            const close = descriptor.close.bind(descriptor);
            descriptor.close = async () => { await close(); await fs.writeFile(path, '{}'); };
          }
          if ((fault === 'file-sync' && selected === path) || (fault === 'directory-sync' && selected === directory)) descriptor.sync = async () => { throw new Error('injected sync'); };
          if (fault === 'final-metadata' && selected === path) {
            const read = descriptor.read.bind(descriptor);
            descriptor.read = async (...args) => { const reading = await read(...args); await fs.chmod(path, 0o644); return reading; };
          }
          return descriptor;
        }
      }));
      const policy = await import(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)});
      try {
        await (['file-sync', 'directory-sync', 'readback', 'readback-inode'].includes(fault) ? policy.initializeOrdinaryEdgePolicy(directory) : policy.readOrdinaryEdgePolicy(directory));
        process.exitCode = 2;
      } catch (cause) { if (!(cause instanceof Error)) throw cause; if (fault === 'opened-path' && !cause.message.includes('file identity')) throw cause; }
    `;
    const child = Bun.spawn([process.execPath, '-e', program], { stderr: 'pipe', stdout: 'pipe' });
    const stderr = await new Response(child.stderr).text();
    expect(stderr).toBe('');
    expect(await child.exited).toBe(0);
    expect((await readFile(`${directory}/edge-policy.json`)).length).toBeGreaterThan(0);
  });
}

test('nonblocking policy open refuses a FIFO without waiting for a writer', async () => {
  const directory = scratchSync('edge-policy-fifo-');
  expect(await Bun.spawn(['mkfifo', `${directory}/edge-policy.json`]).exited).toBe(0);
  const program = `import { readOrdinaryEdgePolicy } from ${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)}; try { await readOrdinaryEdgePolicy(${JSON.stringify(directory)}); process.exitCode = 2; } catch {}`;
  const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
  const deadline = setTimeout(() => {
    child.kill('SIGKILL');
  }, 1000);
  try {
    expect(await child.exited).toBe(0);
  } finally {
    clearTimeout(deadline);
  }
});

async function refuses(operation: Promise<unknown>, message = ''): Promise<void> {
  let refusal: unknown;
  try {
    await operation;
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  expect(String(refusal)).toContain(message);
}

for (const shape of ['empty', 'directory', 'symlink', 'dangling'] as const) {
  test(`initializer never replaces existing ${shape} publication`, async () => {
    const directory = scratchSync('edge-policy-existing-');
    const path = `${directory}/edge-policy.json`;
    if (shape === 'directory') await mkdir(path);
    else if (shape === 'symlink' || shape === 'dangling') {
      if (shape === 'symlink') await writeFile(`${directory}/foreign`, 'retained');
      await symlink(`${directory}/foreign`, path);
    } else await writeFile(path, '');
    await refuses(initializeOrdinaryEdgePolicy(directory), 'exclusive relative open failed');
    if (shape === 'symlink')
      expect(await readFile(`${directory}/foreign`, 'utf8')).toBe('retained');
  });
}

test('policy kernel nofollow rejects a symlink before identity validation', async () => {
  const directory = scratchSync('edge-policy-nofollow-');
  await writeFile(`${directory}/foreign`, JSON.stringify(policy(directory)));
  await symlink(`${directory}/foreign`, `${directory}/edge-policy.json`);
  await refuses(readOrdinaryEdgePolicy(directory), 'ELOOP');
});

test('policy refuses a nonenumerable trusted directory', async () => {
  const directory = scratchSync('edge-policy-directory-');
  await writeFile(`${directory}/edge-policy.json`, JSON.stringify(policy(directory)));
  await chmod(directory, 0o333);
  try {
    await refuses(readOrdinaryEdgePolicy(directory), 'EACCES');
  } finally {
    await chmod(directory, 0o700);
  }
});

for (const operation of ['read', 'initialize', 'initialize-late'] as const) {
  test(`policy ${operation} refuses swapped parent even with same hardlinked policy`, async () => {
    const root = scratchSync('edge-policy-parent-');
    const directory = `${root}/state`;
    await mkdir(directory);
    if (operation === 'read') await initializeOrdinaryEdgePolicy(directory);
    const program = `
      import * as fs from 'node:fs/promises';
      import * as relative from ${JSON.stringify(`${import.meta.dir}/directory-file.ts`)};
      import { mock } from 'bun:test';
      const directory = ${JSON.stringify(directory)};
      const originalOpen = fs.open;
      const native = await import('node:fs');
      const openRelative = relative.openDirectoryFile;
      const nativeOpen = native.openSync;
      let swapped = false;
      function swapSync() {
        native.renameSync(directory, directory + '.retained');
        native.mkdirSync(directory);
        swapped = true;
      }
      mock.module('node:fs', () => ({ ...native, openSync: (path, ...options) => {
        if (${JSON.stringify(operation)} === 'initialize-late' && path === directory + '/edge-policy.json' && !swapped) swapSync();
        return nativeOpen(path, ...options);
      }}));
      async function swap() {
        await fs.rename(directory, directory + '.retained');
        await fs.mkdir(directory);
        if (${JSON.stringify(operation)} === 'read') await fs.link(directory + '.retained/edge-policy.json', directory + '/edge-policy.json');
        swapped = true;
      }
      mock.module(${JSON.stringify(`${import.meta.dir}/directory-file.ts`)}, () => ({ ...relative, openDirectoryFile: (descriptor, name, flags) => {
        if (${JSON.stringify(operation)} === 'initialize-late') {
          swapSync();
        }
        return openRelative(descriptor, name, flags);
      }}));
      mock.module('node:fs/promises', () => ({ ...fs, open: async (path, ...options) => {
        const descriptor = await originalOpen(path, ...options);
        if (${JSON.stringify(operation)} === 'read' && path === directory + '/edge-policy.json') await swap();
        if (${JSON.stringify(operation)} === 'initialize' && path === directory) {
          const stat = descriptor.stat.bind(descriptor);
          descriptor.stat = async (...args) => { const identity = await stat(...args); if (!swapped) await swap(); return identity; };
        }
        return descriptor;
      }}));
      const policy = await import(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)});
      let refused = false;
      try { await (${JSON.stringify(operation)} === 'read' ? policy.readOrdinaryEdgePolicy(directory) : policy.initializeOrdinaryEdgePolicy(directory)); }
      catch (cause) { refused = true; if (${JSON.stringify(operation)} === 'initialize' && !String(cause).includes('before publication')) throw cause; if (${JSON.stringify(operation)} === 'initialize-late' && !String(cause).includes('during publication')) throw cause; }
      if (!refused || !swapped) throw new Error('parent replacement admitted or boundary absent');
      if (${JSON.stringify(operation)} !== 'read') {
        try { await fs.lstat(directory + '/edge-policy.json'); throw new Error('foreign publication'); }
        catch (cause) { if (!(cause instanceof Error) || cause.code !== 'ENOENT') throw cause; }
      }
    `;
    const child = Bun.spawn([process.execPath, '-e', program], { stdout: 'pipe', stderr: 'pipe' });
    expect(await new Response(child.stderr).text()).toBe('');
    expect(await child.exited).toBe(0);
  });
}

test('malformed policy diagnostics never echo file contents', async () => {
  const directory = scratchSync('edge-policy-private-');
  await writeFile(`${directory}/edge-policy.json`, 'PRIVATE_POLICY_SENTINEL_NOT_JSON');
  let refusal: unknown;
  try {
    await readOrdinaryEdgePolicy(directory);
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  expect(String(refusal)).not.toContain('PRIVATE_POLICY_SENTINEL');
});

test('restoring policy is closed, bound and readable only by the phase-aware reader', async () => {
  const module = await import('./edge-policy');
  const directory = scratchSync('edge-restoring-policy-');
  const restoring = {
    format: 'dependency-edge-policy',
    version: 1,
    phase: 'restoring',
    edgeState: directory,
    ownerPublicationSha256: 'a'.repeat(64),
    restorationIntent: {
      name: 'edge-owner-000001-solver-restore-intent.json',
      sha256: 'b'.repeat(64),
    },
  } as const;
  await writeFile(`${directory}/edge-policy.json`, JSON.stringify(restoring), { mode: 0o600 });
  expect((await module.captureEdgePolicy(directory)).policy).toEqual(restoring);
  await refuses(readOrdinaryEdgePolicy(directory));
  for (const malformed of [
    { ...restoring, phase: 'active' },
    { ...restoring, extra: true },
    { ...restoring, ownerPublicationSha256: 'x' },
    { ...restoring, restorationIntent: { ...restoring.restorationIntent, extra: true } },
    {
      ...restoring,
      restorationIntent: {
        ...restoring.restorationIntent,
        name: '../edge-owner-000001-solver-restore-intent.json',
      },
    },
    { ...restoring, restorationIntent: { ...restoring.restorationIntent, sha256: 'x' } },
  ]) {
    await writeFile(`${directory}/edge-policy.json`, JSON.stringify(malformed));
    await refuses(module.captureEdgePolicy(directory));
  }
});
