import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import {
  captureEdgePolicy,
  decodeOrdinaryEdgePolicy,
  type EdgePolicyOriginRequest,
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

test('origin receipt retains created policy and original parent and lock before release', async () => {
  const staging = scratchSync('edge-policy-origin-');
  const directory = `${staging}/state`;
  const receiptPath = `${staging}/origin.json`;
  await mkdir(directory, { mode: 0o700 });
  const parent = await lstat(staging);
  const getuid = process.getuid;
  if (getuid === undefined) throw new Error('origin test requires a process UID');
  expect(parent.isDirectory()).toBe(true);
  expect(parent.mode & 0o777).toBe(0o700);
  expect(parent.uid).toBe(getuid());
  expect(await realpath(staging)).toBe(staging);
  await rejects(lstat(receiptPath), { code: 'ENOENT' });

  const origin = {
    attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9',
    receiptPath,
  };
  // The typed optional request reaches the existing initializer before its API is extended.
  const initializeWithOrigin: (
    edgeState: string,
    request?: { readonly attemptId: string; readonly receiptPath: string },
  ) => ReturnType<typeof initializeOrdinaryEdgePolicy> = initializeOrdinaryEdgePolicy;
  expect(await initializeWithOrigin(directory, origin)).toEqual(policy(directory));
  expect(await readOrdinaryEdgePolicy(directory)).toEqual(policy(directory));
  expect(await readFile(`${directory}/edge-policy.json`, 'utf8')).toBe(
    `${JSON.stringify(policy(directory))}\n`,
  );
  process.stderr.write(
    'ORIGIN_RECEIPT_POLICY_CREATED: original initializer returned and exact policy bytes independently verified\n',
  );

  expect(await Bun.file(receiptPath).exists(), 'requested origin receipt must be published').toBe(
    true,
  );
  const receipt = await readFile(receiptPath);
  expect(receipt.byteLength).toBeGreaterThan(0);
  expect(receipt.byteLength).toBeLessThanOrEqual(16384);
  const identity = async (path: string) => {
    const status = await lstat(path, { bigint: true });
    return {
      path,
      device: String(status.dev),
      inode: String(status.ino),
      mode: Number(status.mode & 0o7777n),
      uid: Number(status.uid),
      gid: Number(status.gid),
    };
  };
  const contents = `${JSON.stringify(policy(directory))}\n`;
  expect(JSON.parse(receipt.toString())).toEqual({
    format: 'edge-policy-origin-receipt',
    version: 1,
    attemptId: origin.attemptId,
    edgeState: directory,
    parent: await identity(directory),
    lock: await identity(`${directory}/edge.lock`),
    policy: {
      ...(await identity(`${directory}/edge-policy.json`)),
      contents,
      byteLength: Buffer.byteLength(contents),
      sha256: createHash('sha256').update(contents).digest('hex'),
    },
  });
  const receiptStatus = await lstat(receiptPath);
  expect(receiptStatus.isFile()).toBe(true);
  expect(receiptStatus.mode & 0o7777).toBe(0o600);
  expect(receiptStatus.uid).toBe(getuid());
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

test('restoring policy refuses every activation record as restoration authority', async () => {
  const directory = scratchSync('edge-restoring-activation-label-');
  for (const label of [
    'participants',
    'capture',
    'backup',
    'intent',
    'committed',
    'fenced-complete',
    'participant-restore-intent',
    'participant-start-intent',
    'participant-ready',
    'participant-policy-intent',
    'participants-restored',
  ]) {
    await writeFile(
      `${directory}/edge-policy.json`,
      JSON.stringify({
        format: 'dependency-edge-policy',
        version: 1,
        phase: 'restoring',
        edgeState: directory,
        ownerPublicationSha256: 'a'.repeat(64),
        restorationIntent: {
          name: `edge-owner-000001-activation-${label}.json`,
          sha256: 'b'.repeat(64),
        },
      }),
      { mode: 0o600 },
    );
    expect(captureEdgePolicy(directory)).rejects.toThrow('invalid restoring edge policy');
  }
});

for (const shape of ['null', 'missing-attempt', 'uuid', 'extra'] as const)
  test(`origin request refuses malformed shape before policy creation: ${shape}`, async () => {
    const staging = scratchSync('edge-origin-request-');
    const directory = `${staging}/state`;
    await mkdir(directory, { mode: 0o700 });
    const valid = {
      attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9',
      receiptPath: `${staging}/origin.json`,
    };
    const malformed =
      shape === 'null'
        ? null
        : shape === 'missing-attempt'
          ? { receiptPath: valid.receiptPath }
          : shape === 'uuid'
            ? { ...valid, attemptId: 'not-a-uuid' }
            : { ...valid, extra: true };
    expect(resolve(valid.receiptPath).startsWith(`${staging}/`)).toBe(true);
    // Test boundary: forged runtime shapes deliberately bypass the precise optional request type.
    await refuses(initializeOrdinaryEdgePolicy(directory, malformed as EdgePolicyOriginRequest));
    expect(await Bun.file(`${directory}/edge-policy.json`).exists()).toBe(false);
  });

for (const fault of [
  'existing',
  'symlink',
  'public-parent',
  'unreadable-parent',
  'missing-parent',
  'alias-parent',
  'alias-ancestor',
  'file-parent',
  'noncanonical',
  'relative',
  'policy-collision',
  'lock-collision',
  'owner-collision',
] as const)
  test(`unsafe origin destination refuses before policy creation: ${fault}`, async () => {
    const root = scratchSync('edge-origin-destination-');
    const directory = `${root}/state`;
    const staging = `${root}/stage`;
    await mkdir(directory, { mode: 0o700 });
    await mkdir(staging, { mode: 0o700 });
    let receiptPath = `${staging}/origin.json`;
    if (fault === 'existing') await writeFile(receiptPath, 'retained', { mode: 0o600 });
    if (fault === 'symlink') {
      await writeFile(`${staging}/retained`, 'retained', { mode: 0o600 });
      await symlink(`${staging}/retained`, receiptPath);
    }
    if (fault === 'public-parent') await chmod(staging, 0o755);
    if (fault === 'unreadable-parent') await chmod(staging, 0);
    if (fault === 'missing-parent') receiptPath = `${root}/absent/origin.json`;
    if (fault === 'alias-parent') {
      await symlink(staging, `${root}/alias`);
      receiptPath = `${root}/alias/origin.json`;
    }
    if (fault === 'alias-ancestor') {
      await symlink(root, `${root}/alias-root`);
      receiptPath = `${root}/alias-root/stage/origin.json`;
    }
    if (fault === 'file-parent') {
      await writeFile(`${root}/parent-file`, 'retained', { mode: 0o600 });
      receiptPath = `${root}/parent-file/origin.json`;
    }
    if (fault === 'noncanonical') receiptPath = `${staging}/./origin.json`;
    if (fault === 'relative') receiptPath = relative(process.cwd(), receiptPath);
    if (fault === 'policy-collision') receiptPath = `${directory}/edge-policy.json`;
    if (fault === 'lock-collision') receiptPath = `${directory}/edge.lock`;
    if (fault === 'owner-collision') receiptPath = `${directory}/edge-owner.pending`;
    expect(resolve(receiptPath).startsWith(`${root}/`)).toBe(true);
    try {
      await refuses(
        initializeOrdinaryEdgePolicy(directory, {
          attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9',
          receiptPath,
        }),
      );
      expect(await Bun.file(`${directory}/edge-policy.json`).exists()).toBe(false);
      if (fault === 'existing') expect(await readFile(receiptPath, 'utf8')).toBe('retained');
      if (fault === 'symlink')
        expect(await readFile(`${staging}/retained`, 'utf8')).toBe('retained');
    } finally {
      if (fault === 'public-parent' || fault === 'unreadable-parent') await chmod(staging, 0o700);
    }
  });

async function observeOriginChild(program: string, consumer: string) {
  const child = Bun.spawn([process.execPath, '-e', program], {
    stdout: 'pipe',
    stderr: 'pipe',
    signal: AbortSignal.timeout(5000),
    killSignal: 'SIGKILL',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  process.stderr.write(
    `ORIGIN_CHILD_CUSTODY: ${JSON.stringify({ consumer, pid: child.pid, exitCode, signal: child.signalCode, stdoutEof: true, stderrEof: true })}\n`,
  );
  if (child.signalCode !== null || exitCode !== 0)
    process.stderr.write(
      `ORIGIN_CHILD_FAILURE: ${JSON.stringify({ exitCode, signal: child.signalCode, stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr), stdout: stdout.slice(0, 8192), stderr: stderr.slice(0, 8192) })}\n`,
    );
  expect(child.signalCode, 'original origin child must settle normally with both EOFs').toBeNull();
  return { exitCode, stdout, stderr };
}

for (const fault of [
  'write',
  'file-sync',
  'parent-sync',
  'readback',
  'unreadable',
  'oversize',
  'mode',
  'receipt-inode',
  'parent-inode',
  'parent-mode',
  'policy-inode',
  'policy-bytes',
  'lock-inode',
  'state-inode',
] as const)
  test(`required receipt failure retains created policy without success: ${fault}`, async () => {
    const root = scratchSync('edge-origin-failure-');
    const directory = `${root}/state`;
    const staging = `${root}/stage`;
    await mkdir(directory, { mode: 0o700 });
    await mkdir(staging, { mode: 0o700 });
    const receiptPath = `${staging}/origin.json`;
    const program = `
      import * as native from 'node:fs';
      import { mock } from 'bun:test';
      const original = { ...native };
      const fault = ${JSON.stringify(fault)};
      const directory = ${JSON.stringify(directory)};
      const staging = ${JSON.stringify(staging)};
      const receiptPath = ${JSON.stringify(receiptPath)};
      let injected = false;
      mock.module('node:fs', () => ({ ...original,
        writeFileSync: (descriptor, ...args) => {
          if (fault === 'write' && typeof descriptor === 'number' && original.readlinkSync('/proc/self/fd/' + descriptor) === receiptPath) {
            injected = true; console.log('ORIGIN_FAULT_REACHED:' + fault); throw new Error('injected origin write');
          }
          return original.writeFileSync(descriptor, ...args);
        },
        fsyncSync: (descriptor) => {
          const path = original.readlinkSync('/proc/self/fd/' + descriptor);
          if (path === staging && fault === 'parent-sync') { injected = true; console.log('ORIGIN_FAULT_REACHED:' + fault); throw new Error('injected origin parent sync'); }
          if (path === receiptPath) {
            if (fault === 'file-sync') { injected = true; console.log('ORIGIN_FAULT_REACHED:' + fault); throw new Error('injected origin file sync'); }
            original.fsyncSync(descriptor);
            if (!['write', 'file-sync', 'parent-sync'].includes(fault)) injected = true;
            if (fault === 'readback') original.writeFileSync(receiptPath, '{}');
            if (fault === 'unreadable') original.chmodSync(receiptPath, 0);
            if (fault === 'oversize') original.writeFileSync(receiptPath, 'x'.repeat(16385));
            if (fault === 'mode') original.chmodSync(receiptPath, 0o644);
            if (fault === 'receipt-inode') { const bytes = original.readFileSync(receiptPath); original.renameSync(receiptPath, receiptPath + '.retained'); original.writeFileSync(receiptPath, bytes, {mode: 0o600}); }
            if (fault === 'parent-inode') { original.renameSync(staging, staging + '.retained'); original.mkdirSync(staging, {mode: 0o700}); original.linkSync(staging + '.retained/origin.json', receiptPath); }
            if (fault === 'parent-mode') original.chmodSync(staging, 0o755);
            if (fault === 'policy-inode') { const path = directory + '/edge-policy.json'; const bytes = original.readFileSync(path); original.renameSync(path, path + '.retained'); original.writeFileSync(path, bytes, {mode: 0o600}); }
            if (fault === 'policy-bytes') original.appendFileSync(directory + '/edge-policy.json', ' ');
            if (fault === 'lock-inode') { const path = directory + '/edge.lock'; original.renameSync(path, path + '.retained'); original.writeFileSync(path, '', {mode: 0o644}); }
            if (fault === 'state-inode') { original.renameSync(directory, directory + '.retained'); original.mkdirSync(directory, {mode: 0o700}); for (const name of ['edge-policy.json', 'edge.lock']) original.linkSync(directory + '.retained/' + name, directory + '/' + name); }
            if (!['write', 'file-sync', 'parent-sync'].includes(fault)) console.log('ORIGIN_FAULT_REACHED:' + fault);
            return;
          }
          return original.fsyncSync(descriptor);
        },
      }));
      const { initializeOrdinaryEdgePolicy } = await import(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)});
      let refusal;
      try { await initializeOrdinaryEdgePolicy(directory, {attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9', receiptPath}); }
      catch (cause) { refusal = cause; }
      if (!injected) throw new Error('origin filesystem fault boundary not reached');
      if (!(refusal instanceof Error)) throw new Error('required origin failure admitted');
      if (!original.lstatSync(directory + '/edge-policy.json').isFile()) throw new Error('created policy lost');
      if (!original.lstatSync(receiptPath).isFile()) throw new Error('partial receipt lost');
      console.log('REQUIRED_ORIGIN_REFUSED:' + fault);
    `;
    const observed = await observeOriginChild(
      program,
      `required receipt failure retains created policy without success: ${fault}`,
    );
    expect(observed.exitCode, observed.stderr).toBe(0);
    expect(observed.stderr).toBe('');
    process.stderr.write(observed.stdout);
    expect(observed.stdout).toBe(
      `ORIGIN_FAULT_REACHED:${fault}\nREQUIRED_ORIGIN_REFUSED:${fault}\n`,
    );
    expect(await readFile(`${directory}/edge-policy.json`, 'utf8')).toBe(
      `${JSON.stringify(policy(directory))}\n${fault === 'policy-bytes' ? ' ' : ''}`,
    );
    await refuses(initializeOrdinaryEdgePolicy(directory));
  });

test('same-byte replacement cannot rebase initializer origin', async () => {
  const staging = scratchSync('edge-origin-replacement-');
  const directory = `${staging}/state`;
  const receiptPath = `${staging}/origin.json`;
  await mkdir(directory, { mode: 0o700 });
  await initializeOrdinaryEdgePolicy(directory, {
    attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9',
    receiptPath,
  });
  const origin = await readFile(receiptPath);
  const created = await lstat(`${directory}/edge-policy.json`, { bigint: true });
  const contents = await readFile(`${directory}/edge-policy.json`);
  await rename(`${directory}/edge-policy.json`, `${directory}/edge-policy.retained`);
  await writeFile(`${directory}/edge-policy.json`, contents, { mode: 0o600 });
  const replaced = await lstat(`${directory}/edge-policy.json`, { bigint: true });
  expect(replaced.ino).not.toBe(created.ino);
  expect(await readFile(receiptPath)).toEqual(origin);
  expect(JSON.parse(origin.toString())).toMatchObject({
    policy: { inode: String(created.ino), contents: contents.toString() },
  });
});

test('origin receipt publication excludes a real lock contender until original return', async () => {
  const root = scratchSync('edge-origin-interval-');
  const directory = `${root}/state`;
  const staging = `${root}/stage`;
  await mkdir(directory, { mode: 0o700 });
  await mkdir(staging, { mode: 0o700 });
  const receiptPath = `${staging}/origin.json`;
  const program = `
    import * as native from 'node:fs';
    import { strict as assert } from 'node:assert';
    import { mock } from 'bun:test';
    const original = { ...native };
    const directory = ${JSON.stringify(directory)};
    const receiptPath = ${JSON.stringify(receiptPath)};
    const contenderProgram = ${JSON.stringify(`
      import { withCanonicalLock } from '${import.meta.dir}/lock.ts';
      try { await withCanonicalLock(${JSON.stringify(`${directory}/edge.lock`)}, async () => {}); console.log('ACQUIRED'); }
      catch (cause) { if (!(cause instanceof Error) || !cause.message.includes('lock held')) throw cause; console.log('REFUSED'); }
    `)};
    const contend = (phase) => {
      const child = Bun.spawnSync([process.execPath, '-e', contenderProgram], {stdout: 'pipe', stderr: 'pipe', timeout: 2000});
      assert.equal(child.exitCode, 0); assert.equal(child.success, true); assert.equal(child.signalCode, undefined); assert.notEqual(child.exitedDueToTimeout, true); assert.equal(child.stderr.toString(), '');
      console.log('ORIGIN_CONTENDER_CUSTODY:' + JSON.stringify({phase, pid: child.pid, exitCode: child.exitCode, success: child.success, signalAbsent: child.signalCode === undefined, timeoutAbsent: child.exitedDueToTimeout !== true, stdoutEof: true, stderrEof: true, stdout: child.stdout.toString(), stderr: child.stderr.toString()}));
      return child.stdout.toString();
    };
    let reached = false;
    mock.module('node:fs', () => ({ ...original, writeFileSync: (descriptor, ...args) => {
      original.writeFileSync(descriptor, ...args);
      if (typeof descriptor === 'number' && original.readlinkSync('/proc/self/fd/' + descriptor) === receiptPath) {
        reached = true;
        const bytes = original.readFileSync(receiptPath);
        assert(bytes.length > 0 && bytes.length <= 16384);
        const receipt = JSON.parse(bytes.toString());
        const policy = original.lstatSync(directory + '/edge-policy.json', {bigint: true});
        const lock = original.lstatSync(directory + '/edge.lock', {bigint: true});
        const parent = original.lstatSync(directory, {bigint: true});
        assert.equal(receipt.policy.inode, String(policy.ino));
        assert.equal(receipt.lock.inode, String(lock.ino));
        assert.equal(receipt.parent.inode, String(parent.ino));
        assert.equal(contend('held'), 'REFUSED\\n');
      }
    }}));
    const { initializeOrdinaryEdgePolicy } = await import(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)});
    await initializeOrdinaryEdgePolicy(directory, {attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9', receiptPath});
    assert(reached);
    assert.equal(contend('released'), 'ACQUIRED\\n');
    console.log('ORIGIN_LOCK_INTERVAL: refused during receipt write; acquired after original return');
  `;
  const observed = await observeOriginChild(
    program,
    'origin receipt publication excludes a real lock contender until original return',
  );
  expect(observed.exitCode, observed.stderr).toBe(0);
  expect(observed.stderr).toBe('');
  process.stderr.write(observed.stdout);
  const frames = observed.stdout.split('\n');
  const receipts = frames
    .filter((frame) => frame.startsWith('ORIGIN_CONTENDER_CUSTODY:'))
    .map((frame) => {
      const receipt: unknown = JSON.parse(frame.slice('ORIGIN_CONTENDER_CUSTODY:'.length));
      return receipt;
    });
  expect(receipts).toMatchObject([
    {
      phase: 'held',
      exitCode: 0,
      success: true,
      signalAbsent: true,
      timeoutAbsent: true,
      stdoutEof: true,
      stderrEof: true,
      stdout: 'REFUSED\n',
      stderr: '',
    },
    {
      phase: 'released',
      exitCode: 0,
      success: true,
      signalAbsent: true,
      timeoutAbsent: true,
      stdoutEof: true,
      stderrEof: true,
      stdout: 'ACQUIRED\n',
      stderr: '',
    },
  ]);
  expect(frames.filter((frame) => !frame.startsWith('ORIGIN_CONTENDER_CUSTODY:')).join('\n')).toBe(
    'ORIGIN_LOCK_INTERVAL: refused during receipt write; acquired after original return\n',
  );
});

test('serialized origin receipt bound refuses while retaining created policy', async () => {
  const root = scratchSync('edge-origin-bound-');
  let directory = root;
  while (directory.length < 3300) {
    directory += `/${'s'.repeat(100)}`;
    await mkdir(directory, { mode: 0o700 });
  }
  const receiptPath = `${root}/origin.json`;
  let refusal: unknown;
  try {
    await initializeOrdinaryEdgePolicy(directory, {
      attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9',
      receiptPath,
    });
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  expect(
    await Bun.file(receiptPath).exists(),
    'serialized bound must refuse before receipt creation',
  ).toBe(false);
  expect(await readOrdinaryEdgePolicy(directory)).toEqual(policy(directory));
  expect(String(refusal)).toContain('origin receipt exceeds byte bound');
});

test('origin destination refuses a foreign-owned filesystem observation before policy creation', async () => {
  const root = scratchSync('edge-origin-owner-');
  const directory = `${root}/state`;
  const staging = `${root}/stage`;
  await mkdir(directory, { mode: 0o700 });
  await mkdir(staging, { mode: 0o700 });
  const observed = await observeOriginChild(
    `
    import * as filesystem from 'node:fs/promises';
    import { mock } from 'bun:test';
    const original = { ...filesystem };
    const staging = ${JSON.stringify(staging)};
    const foreign = (status) => Object.assign(Object.create(Object.getPrototypeOf(status)), status, {uid: status.uid + 1n});
    mock.module('node:fs/promises', () => ({ ...original, open: async (path, ...options) => {
      const descriptor = await original.open(path, ...options);
      if (path === staging) { const stat = descriptor.stat.bind(descriptor); descriptor.stat = async (...options) => foreign(await stat(...options)); }
      return descriptor;
    }, lstat: async (path, ...options) => {
      const status = await original.lstat(path, ...options);
      if (path === staging) { console.log('ORIGIN_FOREIGN_OWNER_OBSERVED'); return foreign(status); }
      return status;
    }}));
    const { initializeOrdinaryEdgePolicy } = await import(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)});
    try { await initializeOrdinaryEdgePolicy(${JSON.stringify(directory)}, {attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9', receiptPath: staging + '/origin.json'}); throw new Error('foreign owner admitted'); }
    catch (cause) { if (!(cause instanceof Error) || !cause.message.includes('owned private parent')) throw cause; }
  `,
    'origin destination refuses a foreign-owned filesystem observation before policy creation',
  );
  expect(observed.exitCode, observed.stderr).toBe(0);
  expect(observed.stderr).toBe('');
  expect(await Bun.file(`${directory}/edge-policy.json`).exists()).toBe(false);
});

for (const fault of ['late-parent', 'unsafe-integer'] as const)
  test(`origin metadata boundary refuses without unsupported evidence: ${fault}`, async () => {
    const root = scratchSync('edge-origin-metadata-');
    const directory = `${root}/state`;
    const staging = `${root}/stage`;
    await mkdir(directory, { mode: 0o700 });
    await mkdir(staging, { mode: 0o700 });
    const observed = await observeOriginChild(
      `
      import * as filesystem from 'node:fs/promises';
      import * as native from 'node:fs';
      import { mock } from 'bun:test';
      const original = { ...filesystem };
      const directory = ${JSON.stringify(directory)};
      const staging = ${JSON.stringify(staging)};
      const fault = ${JSON.stringify(fault)};
      const alter = (status) => Object.assign(Object.create(Object.getPrototypeOf(status)), status, {gid: 9007199254740992n});
      let reached = false;
      mock.module('node:fs/promises', () => ({ ...original,
        lstat: async (path, ...options) => {
          const status = await original.lstat(path, ...options);
          return fault === 'unsafe-integer' && path === directory ? alter(status) : status;
        },
        open: async (path, ...options) => {
          const descriptor = await original.open(path, ...options);
          if (path === directory) {
            reached = true;
            console.log('ORIGIN_METADATA_REACHED:' + fault);
            if (fault === 'late-parent') native.chmodSync(staging, 0o755);
            if (fault === 'unsafe-integer') { const stat = descriptor.stat.bind(descriptor); descriptor.stat = async (...options) => alter(await stat(...options)); }
          }
          return descriptor;
        },
      }));
      const { initializeOrdinaryEdgePolicy } = await import(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)});
      let refusal;
      try { await initializeOrdinaryEdgePolicy(directory, {attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9', receiptPath: staging + '/origin.json'}); }
      catch (cause) { refusal = cause; }
      if (!reached) throw new Error('origin metadata boundary not reached');
      if (!(refusal instanceof Error)) throw new Error('unsupported origin metadata admitted');
      if (fault === 'late-parent' && native.existsSync(directory + '/edge-policy.json')) throw new Error('policy created after destination drift');
      if (fault === 'unsafe-integer' && !refusal.message.includes('origin metadata integer is unsafe')) throw refusal;
    `,
      `origin metadata boundary refuses without unsupported evidence: ${fault}`,
    );
    expect(observed.exitCode, observed.stderr).toBe(0);
    expect(observed.stderr).toBe('');
    expect(observed.stdout).toBe(`ORIGIN_METADATA_REACHED:${fault}\n`);
    if (fault === 'unsafe-integer')
      expect(await Bun.file(`${directory}/edge-policy.json`).exists()).toBe(true);
  });

for (const role of ['policy', 'receipt'] as const)
  test(`origin exclusive creation refuses nonprivate actual file: ${role}`, async () => {
    const root = scratchSync('edge-origin-created-mode-');
    const directory = `${root}/state`;
    const staging = `${root}/stage`;
    await mkdir(directory, { mode: 0o700 });
    await mkdir(staging, { mode: 0o700 });
    const observed = await observeOriginChild(
      `
      import * as native from 'node:fs';
      import * as files from ${JSON.stringify(`${import.meta.dir}/directory-file.ts`)};
      import { mock } from 'bun:test';
      const open = files.openDirectoryFile;
      const role = ${JSON.stringify(role)};
      let reached = false;
      mock.module(${JSON.stringify(`${import.meta.dir}/directory-file.ts`)}, () => ({ ...files, openDirectoryFile: (directory, name, flags) => {
        const descriptor = open(directory, name, flags);
        if (name === (role === 'policy' ? 'edge-policy.json' : 'origin.json')) {
          native.fchmodSync(descriptor, 0o644);
          if ((native.fstatSync(descriptor).mode & 0o7777) !== 0o644) throw new Error('nonprivate native file fault not delivered');
          reached = true;
          console.log('ORIGIN_NONPRIVATE_CREATED:' + role);
        }
        return descriptor;
      }}));
      const { initializeOrdinaryEdgePolicy } = await import(${JSON.stringify(`${import.meta.dir}/edge-policy.ts`)});
      let refusal;
      try { await initializeOrdinaryEdgePolicy(${JSON.stringify(directory)}, {attemptId: 'c623b8e1-6d5f-49bf-a63a-f2c1ec22dfb9', receiptPath: ${JSON.stringify(`${staging}/origin.json`)}}); }
      catch (cause) { refusal = cause; }
      if (!reached) throw new Error('original exclusive creation not reached');
      if (!(refusal instanceof Error)) throw new Error('nonprivate original file admitted');
      const expected = role === 'policy' ? 'origin created policy must be private and owned' : 'origin receipt must be a private owned file';
      if (!refusal.message.includes(expected)) throw refusal;
    `,
      `origin exclusive creation refuses nonprivate actual file: ${role}`,
    );
    expect(observed.exitCode, observed.stderr).toBe(0);
    expect(observed.stderr).toBe('');
    expect(observed.stdout).toBe(`ORIGIN_NONPRIVATE_CREATED:${role}\n`);
    expect(await readOrdinaryEdgePolicy(directory)).toEqual(policy(directory));
    if (role === 'receipt') expect(await Bun.file(`${staging}/origin.json`).exists()).toBe(true);
    else expect(await Bun.file(`${staging}/origin.json`).exists()).toBe(false);
  });

test('phase-aware policy captures only the closed initial active handoff and ordinary reader refuses it', async () => {
  const directory = scratchSync('edge-active-policy-');
  const active = {
    format: 'dependency-edge-policy' as const,
    version: 1 as const,
    phase: 'active' as const,
    edgeState: directory,
    ownerPublicationSha256: 'a'.repeat(64),
    handoff: { name: 'edge-owner-000001-handoff-complete.json', sha256: 'b'.repeat(64) },
  };
  await writeFile(`${directory}/edge-policy.json`, JSON.stringify(active), { mode: 0o600 });
  expect((await captureEdgePolicy(directory)).policy).toEqual(active);
  await rejects(readOrdinaryEdgePolicy(directory), /ordinary edge policy/);
  for (const changed of [
    { ...active, extra: true },
    { ...active, version: 2 },
    { ...active, edgeState: directory + '/other' },
    { ...active, ownerPublicationSha256: 'A'.repeat(64) },
    { ...active, handoff: { ...active.handoff, extra: true } },
    { ...active, handoff: { ...active.handoff, name: 'edge-owner-000001-exposure-complete.json' } },
    { ...active, handoff: { ...active.handoff, name: 'edge-owner-1-handoff-complete.json' } },
    { ...active, handoff: { ...active.handoff, sha256: 'B'.repeat(64) } },
  ]) {
    await writeFile(`${directory}/edge-policy.json`, JSON.stringify(changed));
    await rejects(captureEdgePolicy(directory));
  }
});

for (const label of [
  'handoff-admission',
  'handoff-intent',
  'exposure-intent',
  'exposure-complete',
  'handoff-complete',
]) {
  test(`bounded graph reader captures initial ${label} without widening raw manifest families`, async () => {
    const directory = scratchSync('edge-initial-record-');
    const name = `edge-owner-000001-${label}.json`;
    const contents = '{"owned":"fixture"}\n';
    await writeFile(`${directory}/${name}`, contents, { mode: 0o600 });
    const { captureEdgeRecord } = await import('./edge-policy');
    expect((await captureEdgeRecord(directory, name, 65536)).contents).toBe(contents);
    for (const rejected of [
      'edge-owner-000001-handoff-writers.json',
      'edge-owner-000001-handoff-source-manifest.json',
      'edge-owner-000001-successor-intent.json',
    ]) {
      await writeFile(`${directory}/${rejected}`, contents, { mode: 0o600 });
      await rejects(captureEdgeRecord(directory, rejected, 65536), /unsupported edge record path/);
    }
  });
}

test('ordinary controller admission refuses active policy before callback under existing edge lock', async () => {
  const directory = scratchSync('controller-policy-');
  await writeFile(`${directory}/edge.lock`, 'original lock bytes');
  await writeFile(
    `${directory}/edge-policy.json`,
    JSON.stringify({
      format: 'dependency-edge-policy',
      version: 1,
      phase: 'active',
      edgeState: directory,
      ownerPublicationSha256: 'a'.repeat(64),
      handoff: { name: 'edge-owner-123456-handoff-complete.json', sha256: 'b'.repeat(64) },
    }),
  );
  const original = process.env['WBS_EDGE_STATE'];
  process.env['WBS_EDGE_STATE'] = directory;
  let entered = false;
  try {
    const { withEdgeAdmission } = await import('./edge-admission');
    await rejects(
      withEdgeAdmission(async () => {
        await Promise.resolve();
        entered = true;
      }),
      /ordinary controller/,
    );
    expect(entered).toBe(false);
    expect(await readFile(`${directory}/edge.lock`, 'utf8')).toBe('original lock bytes');
  } finally {
    if (original === undefined) delete process.env['WBS_EDGE_STATE'];
    else process.env['WBS_EDGE_STATE'] = original;
  }
});

for (const mode of ['legacy', 'required'] as const) {
  for (const shape of [
    'absent',
    'ordinary',
    'active',
    'restoring',
    'malformed',
    'dangling',
    'directory',
    'unreadable',
    'marker',
  ] as const) {
    test(`joint ordinary controller matrix ${mode}/${shape}`, async () => {
      const directory = scratchSync('controller-matrix-');
      await writeFile(`${directory}/edge.lock`, 'lock sentinel');
      const path = `${directory}/edge-policy.json`;
      if (shape === 'ordinary' || shape === 'marker' || shape === 'unreadable')
        await writeFile(path, JSON.stringify(policy(directory)));
      if (shape === 'active')
        await writeFile(
          path,
          JSON.stringify({
            ...policy(directory),
            phase: 'active',
            ownerPublicationSha256: 'a'.repeat(64),
            handoff: { name: 'edge-owner-123456-handoff-complete.json', sha256: 'b'.repeat(64) },
          }),
        );
      if (shape === 'restoring')
        await writeFile(
          path,
          JSON.stringify({
            ...policy(directory),
            phase: 'restoring',
            ownerPublicationSha256: 'a'.repeat(64),
            restorationIntent: {
              name: 'edge-owner-123456-solver-restore-intent.json',
              sha256: 'b'.repeat(64),
            },
          }),
        );
      if (shape === 'malformed') await writeFile(path, '{bad UTF-8\ufffd');
      if (shape === 'dangling') await symlink(`${directory}/missing`, path);
      if (shape === 'directory') await mkdir(path);
      if (shape === 'unreadable') await chmod(path, 0);
      if (shape === 'marker') await writeFile(`${directory}/edge-owner.pending`, 'retained');
      const { assertOrdinaryControllerAdmission } = await import('./edge-policy');
      const { withExistingCanonicalLock } = await import('./lock');
      try {
        const admission = withExistingCanonicalLock(`${directory}/edge.lock`, () =>
          assertOrdinaryControllerAdmission(directory, mode),
        );
        if (shape === 'ordinary' || (shape === 'absent' && mode === 'legacy')) await admission;
        else await rejects(admission);
        expect(await readFile(`${directory}/edge.lock`, 'utf8')).toBe('lock sentinel');
      } finally {
        if (shape === 'unreadable') await chmod(path, 0o600);
      }
    });
  }
}

for (const fault of [
  'policy-replacement',
  'policy-appearance',
  'marker-appearance',
  'parent-replacement',
  'lock-replacement',
] as const) {
  test(`invocation-bound ordinary controller recheck refuses ${fault}`, async () => {
    const root = scratchSync('controller-recheck-');
    const directory = `${root}/state`;
    await mkdir(directory);
    await writeFile(`${directory}/edge.lock`, 'original');
    if (fault !== 'policy-appearance')
      await writeFile(`${directory}/edge-policy.json`, JSON.stringify(policy(directory)));
    const { withOrdinaryControllerAdmission } = await import('./edge-policy');
    const { withExistingCanonicalLock } = await import('./lock');
    await withExistingCanonicalLock(`${directory}/edge.lock`, () =>
      withOrdinaryControllerAdmission(directory, 'legacy', async (recheck) => {
        if (fault === 'policy-replacement') {
          const bytes = await readFile(`${directory}/edge-policy.json`);
          await rename(`${directory}/edge-policy.json`, `${root}/original-policy`);
          await writeFile(`${directory}/edge-policy.json`, bytes);
        }
        if (fault === 'policy-appearance')
          await writeFile(`${directory}/edge-policy.json`, JSON.stringify(policy(directory)));
        if (fault === 'marker-appearance')
          await writeFile(`${directory}/edge-owner.pending`, 'appeared');
        if (fault === 'parent-replacement') {
          await rename(directory, `${root}/retained`);
          await mkdir(directory);
        }
        if (fault === 'lock-replacement') {
          await rename(`${directory}/edge.lock`, `${root}/retained-lock`);
          await writeFile(`${directory}/edge.lock`, 'original');
        }
        await rejects(recheck());
      }),
    );
  });
}

test('ordinary controller recheck expires when its original action settles', async () => {
  const directory = scratchSync('controller-expiry-');
  await writeFile(`${directory}/edge.lock`, '');
  const { withOrdinaryControllerAdmission } = await import('./edge-policy');
  const { withExistingCanonicalLock } = await import('./lock');
  const recheck = await withExistingCanonicalLock(`${directory}/edge.lock`, () =>
    withOrdinaryControllerAdmission(directory, 'legacy', (recheck) => Promise.resolve(recheck)),
  );
  await rejects(recheck(), /expired/);
});
