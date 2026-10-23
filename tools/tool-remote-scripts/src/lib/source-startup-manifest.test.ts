import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { chmod, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, spyOn, test } from 'bun:test';

import {
  artifact,
  configuration,
  git,
  installArtifact,
  installed,
  modes,
  roots,
} from '../fixtures/source-startup';
import {
  createSourceStartupManifest,
  decodeSourceDevPins,
  decodeSourceStartupManifest,
  verifySourceStartupTree,
} from './source-startup-manifest';

const digest = (contents: string) => createHash('sha256').update(contents).digest('hex');
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
test('independent prepared artifact verifies after copying with relative dependency links', async () => {
  const prepared = await installed();
  expect(decodeSourceStartupManifest(prepared.contents, prepared.pins)).toEqual(prepared.manifest);
  await verifySourceStartupTree(prepared.root, prepared.manifest, performance.now() + 10000);
});
test('closed pins require full SHA immutable image and all exact fields', () => {
  const pins = {
    version: 1 as const,
    sourceSha: 'a'.repeat(40),
    runtimeImageId: `sha256:${'b'.repeat(64)}`,
    manifestSha256: 'c'.repeat(64),
    environmentSha256: 'd'.repeat(64),
  };
  expect(decodeSourceDevPins(pins)).toEqual(pins);
  for (const changed of [
    { ...pins, extra: true },
    { ...pins, sourceSha: 'abc' },
    { ...pins, runtimeImageId: 'tag:1' },
  ])
    expect(() => decodeSourceDevPins(changed)).toThrow();
});
test('canonical manifest digest shape order slots and bounds refuse', async () => {
  const prepared = await artifact();
  const variants = [
    `${prepared.contents} `,
    prepared.contents.replace('"version":1', '"version":1,"version":1'),
    JSON.stringify({ ...prepared.manifest, extra: 1 }) + '\n',
    JSON.stringify({ ...prepared.manifest, configuration: configuration.slice(0, 3) }) + '\n',
    JSON.stringify({ ...prepared.manifest, entries: [...prepared.manifest.entries].reverse() }) +
      '\n',
    JSON.stringify({
      ...prepared.manifest,
      entries: [
        {
          root: 'source',
          path: '../escape',
          kind: 'file',
          mode: 420,
          size: 1,
          sha256: 'a'.repeat(64),
        },
      ],
    }) + '\n',
  ];
  for (const contents of variants)
    expect(() =>
      decodeSourceStartupManifest(contents, { ...prepared.pins, manifestSha256: digest(contents) }),
    ).toThrow();
  expect(() =>
    decodeSourceStartupManifest(prepared.contents, {
      ...prepared.pins,
      manifestSha256: '0'.repeat(64),
    }),
  ).toThrow();
});
for (const path of ['node_modules/module.js', 'apps/wbs/be-01/src/main.ts'])
  test(`unchanged HEAD refuses changed ${path}`, async () => {
    const prepared = await installed();
    const original = await readFile(join(prepared.root, path));
    await writeFile(join(prepared.root, path), Buffer.alloc(original.length, 120));
    await rejects(
      verifySourceStartupTree(prepared.root, prepared.manifest, performance.now() + 10000),
    );
  });
for (const path of [
  'shadow.js',
  '.nx/poison',
  'node_modules/.vite/poison',
  'node_modules/.vite-temp/poison',
  'apps/wbs/fe-01/node_modules/poison',
  'apps/wbs/mcp-01/src/openapi.json',
  'apps/wbs/be-01/.env.local',
  'apps/wbs/be-01/.env.serve',
  'apps/wbs/gw-01/bunfig.toml',
])
  test(`extra cold startup input refuses ${path}`, async () => {
    const prepared = await installed();
    await mkdir(join(prepared.root, path, '..'), { recursive: true });
    await writeFile(join(prepared.root, path), 'SECRET_SENTINEL', { mode: 0o644 });
    await rejects(
      verifySourceStartupTree(prepared.root, prepared.manifest, performance.now() + 10000),
    );
  });
for (const contents of [
  'NODE_OPTIONS=SECRET_SENTINEL\n',
  'BUN_OPTIONS=\n',
  'BAD LINE SECRET_SENTINEL',
  'MIGRATE_ON_STARTUP="false"\n',
  'MIGRATE_ON_STARTUP=false\nX=1\nX=2\n',
])
  test(
    'private dotenv malformed or profile override refuses without secret output ' +
      digest(contents).slice(0, 5),
    async () => {
      const prepared = await installed();
      const path = join(prepared.root, 'apps/wbs/be-01/.env');
      await writeFile(path, contents);
      const manifest = {
        ...prepared.manifest,
        configuration: prepared.manifest.configuration.map((pin) =>
          pin.slot === 'backend'
            ? { ...pin, size: Buffer.byteLength(contents), sha256: digest(contents) }
            : pin,
        ),
      };
      try {
        await verifySourceStartupTree(prepared.root, manifest, performance.now() + 10000);
        throw new Error('accepted');
      } catch (error) {
        expect(String(error)).not.toContain('SECRET_SENTINEL');
        expect(String(error)).not.toContain('accepted');
      }
    },
  );
test('missing private config refuses', async () => {
  const prepared = await installed();
  await rm(join(prepared.root, 'apps/wbs/mcp-01/.env'));
  await rejects(
    verifySourceStartupTree(prepared.root, prepared.manifest, performance.now() + 10000),
  );
});
test('hardlinked files and escaping links refuse generator', async () => {
  const prepared = await artifact();
  await link(
    join(prepared.root, 'node_modules/module.js'),
    join(prepared.root, 'node_modules/alias.js'),
  );
  await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
  await rm(join(prepared.root, 'node_modules/alias.js'));
  await symlink('/bin/sh', join(prepared.root, 'node_modules/escape'));
  await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
});
test('dirty source untracked ignored inputs and linked git refuse preparation', async () => {
  const prepared = await artifact();
  await writeFile(join(prepared.root, 'ignored.js'), 'extra');
  await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
  await rm(join(prepared.root, 'ignored.js'));
  await writeFile(join(prepared.root, 'package.json'), '{}');
  await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
});
test('whole observation deadline is finite bounded and expired refuses', async () => {
  const prepared = await installed();
  for (const deadline of [NaN, Infinity, performance.now() - 1, performance.now() + 600001])
    await rejects(verifySourceStartupTree(prepared.root, prepared.manifest, deadline));
});

test('captured parent identity refuses byte-identical directory replacement', async () => {
  const prepared = await installed();
  const { captureSourceStartupTree } = await import('./source-startup-manifest');
  const recheck = await captureSourceStartupTree(
    prepared.root,
    prepared.manifest,
    performance.now() + 10000,
  );
  const { rename, cp } = await import('node:fs/promises');
  const directory = join(prepared.root, 'apps/wbs/be-01');
  await rename(directory, `${directory}-old`);
  await cp(`${directory}-old`, directory, {
    recursive: true,
    verbatimSymlinks: true,
    preserveTimestamps: true,
  });
  await rm(`${directory}-old`, { recursive: true });
  await rejects(recheck());
});
test('captured membership refuses late new executable', async () => {
  const prepared = await installed();
  const { captureSourceStartupTree } = await import('./source-startup-manifest');
  const recheck = await captureSourceStartupTree(
    prepared.root,
    prepared.manifest,
    performance.now() + 10000,
  );
  await writeFile(join(prepared.root, 'node_modules/late.js'), 'late');
  await rejects(recheck());
});
test('prepared dependency links cannot loop or traverse outside admitted roots', async () => {
  for (const target of ['../../outside', 'loop', '/usr/bin/env']) {
    const prepared = await artifact();
    await symlink(target, join(prepared.root, 'node_modules/loop'));
    await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
  }
});
test('external Git metadata lock files submodules and linked-worktree metadata refuse', async () => {
  for (const path of [
    '.git/objects/info/alternates',
    '.git/commondir',
    '.git/gitdir',
    '.git/index.lock',
  ]) {
    const prepared = await artifact();
    await writeFile(join(prepared.root, path), 'external');
    await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
  }
});
test('special filesystem members and root symlinks refuse', async () => {
  const prepared = await installed();
  const child = Bun.spawn(['mkfifo', join(prepared.root, 'pipe')], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(await child.exited).toBe(0);
  await rejects(
    verifySourceStartupTree(prepared.root, prepared.manifest, performance.now() + 10000),
  );
  await rm(join(prepared.root, 'pipe'));
  const { rename } = await import('node:fs/promises');
  await rename(join(prepared.root, 'node_modules'), join(prepared.root, 'modules'));
  await symlink('modules', join(prepared.root, 'node_modules'));
  await rejects(
    verifySourceStartupTree(prepared.root, prepared.manifest, performance.now() + 10000),
  );
});
test('decoder refuses oversized files traversal excessive depth and unsafe modes', async () => {
  const prepared = await artifact();
  const entry = prepared.manifest.entries.find((entry) => entry.kind === 'file');
  if (entry === undefined) throw new Error('missing file');
  for (const replacement of [
    { ...entry, size: 512 * 1024 * 1024 + 1 },
    { ...entry, mode: 0o666 },
    { ...entry, path: Array.from({ length: 65 }, () => 'a').join('/') },
    { ...entry, path: 'a\\b' },
    { ...entry, path: '/absolute' },
    { ...entry, path: 'nul\0name' },
  ]) {
    const entries = prepared.manifest.entries.map((current) =>
      current === entry ? replacement : current,
    );
    const contents = JSON.stringify({ ...prepared.manifest, entries }) + '\n';
    expect(() =>
      decodeSourceStartupManifest(contents, { ...prepared.pins, manifestSha256: digest(contents) }),
    ).toThrow();
  }
});
test('private config unreadability and permissive modes refuse', async () => {
  for (const mode of [0, 0o444, 0o644]) {
    const prepared = await installed();
    await chmod(join(prepared.root, 'apps/wbs/be-01/.env'), mode);
    await rejects(
      verifySourceStartupTree(prepared.root, prepared.manifest, performance.now() + 10000),
    );
  }
});

test('manifest limits refuse excessive entries total bytes and encoded document size', async () => {
  const prepared = await artifact();
  const entry = {
    root: 'source',
    path: 'a',
    kind: 'file',
    mode: 0o644,
    size: 0,
    sha256: 'a'.repeat(64),
  };
  for (const entries of [
    Array.from({ length: 250001 }, (_, index) => ({
      ...entry,
      path: `file-${String(index).padStart(6, '0')}`,
    })),
    Array.from({ length: 33 }, (_, index) => ({
      ...entry,
      path: `file-${String(index).padStart(3, '0')}`,
      size: 512 * 1024 * 1024,
    })),
  ]) {
    const contents = JSON.stringify({ ...prepared.manifest, entries }) + '\n';
    expect(() =>
      decodeSourceStartupManifest(contents, { ...prepared.pins, manifestSha256: digest(contents) }),
    ).toThrow();
  }
  const contents =
    JSON.stringify({
      ...prepared.manifest,
      entries: Array.from({ length: 17000 }, (_, index) => ({
        ...entry,
        path: String(index).padStart(5, '0') + 'x'.repeat(4000),
      })),
    }) + '\n';
  expect(Buffer.byteLength(contents)).toBeGreaterThan(64 * 1024 * 1024);
  expect(() =>
    decodeSourceStartupManifest(contents, { ...prepared.pins, manifestSha256: digest(contents) }),
  ).toThrow();
});

test('normal standalone Git objects preserve readonly modes across independent copies', async () => {
  const prepared = await installed();
  const object = prepared.manifest.entries.find(
    (entry) => entry.root === 'git' && entry.kind === 'file' && entry.mode === 0o444,
  );
  if (object === undefined) throw new Error('normal Git object0444 missing');
  await verifySourceStartupTree(prepared.root, prepared.manifest, performance.now() + 10000);
  await chmod(join(prepared.root, '.git', object.path), 0o644);
  await rejects(
    verifySourceStartupTree(prepared.root, prepared.manifest, performance.now() + 10000),
  );
});
test('readonly Git files remain forbidden as hardlink aliases', async () => {
  const prepared = await artifact();
  const object = prepared.manifest.entries.find(
    (entry) => entry.root === 'git' && entry.kind === 'file' && entry.mode === 0o444,
  );
  if (object === undefined) throw new Error('normal Git object0444 missing');
  await link(
    join(prepared.root, '.git', object.path),
    join(prepared.root, 'node_modules/aliased-object'),
  );
  await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
});

test('cold cache roots refuse even when tracked and independently hashed', async () => {
  const prepared = await artifact();
  await mkdir(join(prepared.root, '.nx'), { mode: 0o755 });
  await writeFile(join(prepared.root, '.nx/cache.js'), 'poison', { mode: 0o644 });
  await git(prepared.root, 'add', '-f', '.nx/cache.js');
  await git(
    prepared.root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'cache poison',
  );
  const sha = await git(prepared.root, 'rev-parse', 'HEAD');
  await modes(prepared.root);
  await rejects(createSourceStartupManifest(prepared.root, sha, configuration));
});

for (const fault of ['truncate', 'replace', 'membership', 'parent'] as const)
  test(`in-flight ${fault} cannot survive descriptor and final membership checks`, async () => {
    const prepared = await artifact();
    const contents = Buffer.alloc(2 * 1024 * 1024, 120);
    await writeFile(join(prepared.root, 'node_modules/module.js'), contents);
    const generated = await createSourceStartupManifest(
      prepared.root,
      prepared.sourceSha,
      configuration,
    );
    const copied = await installArtifact({ ...prepared, ...generated });
    const { open, lstat, rename, cp, truncate } = await import('node:fs/promises');
    const target = join(copied.root, 'node_modules/module.js');
    const identity = await lstat(target);
    const descriptor = await open(target, 'r');
    const prototype = Object.getPrototypeOf(descriptor) as FileHandle;
    await descriptor.close();
    const method: unknown = Object.getOwnPropertyDescriptor(prototype, 'read')?.value;
    if (typeof method !== 'function') throw new Error('missing descriptor reader');
    const original = method as FileHandle['read'];
    let injected = false;
    const reader = spyOn(prototype, 'read').mockImplementation(async function (
      this: FileHandle,
      ...args: Parameters<typeof original>
    ) {
      const observed = await original.apply(this, args);
      if (!injected && (await this.stat()).ino === identity.ino && observed.bytesRead > 0) {
        injected = true;
        if (fault === 'truncate') await truncate(target, 1);
        if (fault === 'replace') {
          await rename(target, `${target}.old`);
          await writeFile(target, contents, { mode: 0o644 });
          await rm(`${target}.old`);
        }
        if (fault === 'membership')
          await writeFile(join(copied.root, 'late.js'), 'late', { mode: 0o644 });
        if (fault === 'parent') {
          const directory = join(copied.root, 'node_modules');
          await rename(directory, `${directory}-old`);
          await cp(`${directory}-old`, directory, {
            recursive: true,
            verbatimSymlinks: true,
            preserveTimestamps: true,
          });
          await rm(`${directory}-old`, { recursive: true });
        }
      }
      return observed;
    });
    try {
      await rejects(
        verifySourceStartupTree(copied.root, copied.manifest, performance.now() + 10000),
      );
      expect(injected).toBe(true);
    } finally {
      reader.mockRestore();
    }
  });

test('parent replacement refuses even with the same single-linked leaf inode', async () => {
  const prepared = await installed();
  const { captureSourceStartupTree } = await import('./source-startup-manifest');
  const { rename, lstat } = await import('node:fs/promises');
  const recheck = await captureSourceStartupTree(
    prepared.root,
    prepared.manifest,
    performance.now() + 10000,
  );
  const directory = join(prepared.root, 'apps/wbs/be-01/src');
  const before = await lstat(join(directory, 'main.ts'));
  await rename(directory, `${directory}-old`);
  await mkdir(directory, { mode: 0o755 });
  await rename(join(`${directory}-old`, 'main.ts'), join(directory, 'main.ts'));
  await rm(`${directory}-old`, { recursive: true });
  expect((await lstat(join(directory, 'main.ts'))).ino).toBe(before.ino);
  expect((await lstat(join(directory, 'main.ts'))).nlink).toBe(1);
  await rejects(recheck());
});
test('linked worktree gitfile cannot supply the standalone Git root', async () => {
  const prepared = await artifact();
  await rm(join(prepared.root, '.git'), { recursive: true });
  await writeFile(join(prepared.root, '.git'), 'gitdir: /external/worktree');
  await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
});

test('constructor refuses installed source and symlink aliases through isolated fixed-layout fixture', async () => {
  const prepared = await artifact();
  const { mkdtemp, cp } = await import('node:fs/promises');
  const root = await mkdtemp('/tmp/source-self-');
  roots.push(root);
  await writeFile(join(root, 'fixture-owned'), 'source-startup-test-only-v1\n');
  await cp(prepared.root, join(root, 'src'), { recursive: true, verbatimSymlinks: true });
  await symlink('src', join(root, 'alias'));
  for (const path of [join(root, 'src'), join(root, 'alias')]) {
    const child = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        join(import.meta.dir, '../fixtures/source-startup-constructor.ts'),
        root,
        path,
        prepared.sourceSha,
        JSON.stringify(configuration),
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toBe('source constructor refuses installed artifact\n');
  }
});

test('malformed private UTF8 refuses without lossy dotenv decoding', async () => {
  const prepared = await installed();
  const bytes = Buffer.concat([
    Buffer.from('MIGRATE_ON_STARTUP=false\nTOKEN='),
    Buffer.from([255]),
    Buffer.from('\n'),
  ]);
  await writeFile(join(prepared.root, 'apps/wbs/be-01/.env'), bytes);
  const manifest = {
    ...prepared.manifest,
    configuration: prepared.manifest.configuration.map((pin) =>
      pin.slot === 'backend'
        ? { ...pin, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
        : pin,
    ),
  };
  await rejects(verifySourceStartupTree(prepared.root, manifest, performance.now() + 10000));
});

test('shallow Git metadata cannot masquerade as a full prepared clone', async () => {
  const prepared = await artifact();
  await writeFile(join(prepared.root, '.git/shallow'), prepared.sourceSha + '\n', { mode: 0o644 });
  await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
});
test('Git replacement refs cannot redefine reviewed commit bytes during preparation', async () => {
  const prepared = await artifact();
  await writeFile(
    join(prepared.root, 'apps/wbs/be-01/src/main.ts'),
    'export const replacement = true;\n',
  );
  await git(prepared.root, 'add', '.');
  await git(
    prepared.root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'replacement source',
  );
  const replacement = await git(prepared.root, 'rev-parse', 'HEAD');
  await git(prepared.root, 'replace', prepared.sourceSha, replacement);
  const branch = await git(prepared.root, 'symbolic-ref', 'HEAD');
  await git(prepared.root, 'update-ref', branch, prepared.sourceSha);
  expect(await git(prepared.root, 'status', '--porcelain', '--untracked-files=no')).toBe('');
  await modes(prepared.root);
  await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
});

test('relative link resolution must inspect ancestors before collapsing dotdot', async () => {
  for (const target of ['absent/../module.js', 'module.js/../module.js']) {
    const prepared = await artifact();
    await symlink(target, join(prepared.root, 'node_modules/broken'));
    await rejects(createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration));
  }
});

test('path depth and byte bounds refuse otherwise complete declared membership', async () => {
  const prepared = await artifact();
  const deep = Array.from({ length: 65 }, (_, index) => ({
    root: 'source',
    path: Array.from({ length: index + 1 }, () => 'a').join('/'),
    kind: 'directory',
    mode: 0o755,
  }));
  for (const entries of [
    deep,
    [{ root: 'source', path: 'x'.repeat(4097), kind: 'directory', mode: 0o755 }],
  ]) {
    const contents = JSON.stringify({ ...prepared.manifest, entries }) + '\n';
    expect(() =>
      decodeSourceStartupManifest(contents, { ...prepared.pins, manifestSha256: digest(contents) }),
    ).toThrow();
  }
});

test('declaration ordering parent membership and directory modes are closed', async () => {
  const prepared = await artifact();
  const directory = { root: 'source', path: 'a', kind: 'directory', mode: 0o755 };
  for (const entries of [
    [{ ...directory, path: 'b' }, directory],
    [directory, directory],
    [{ ...directory, path: 'a/b' }],
    [{ ...directory, mode: 0o777 }],
  ]) {
    const contents = JSON.stringify({ ...prepared.manifest, entries }) + '\n';
    expect(() =>
      decodeSourceStartupManifest(contents, { ...prepared.pins, manifestSha256: digest(contents) }),
    ).toThrow();
  }
});
for (const [path, before, after] of [
  ['package.json', '"dev":"bin/dev.sh"', '"dev":"bin/dev.sh","predev":"arbitrary"'],
  ['nx.json', '"plugins":[]', '"plugins":["unknown"]'],
  ['apps/wbs/be-01/project.json', 'bun --watch src/main.ts', 'bun --watch src/other.ts'],
  ['apps/wbs/mcp-01/project.json', '"dependsOn":["prepare"]', '"dependsOn":[]'],
  [
    'apps/wbs/mcp-01/project.json',
    'emit-openapi-cli.ts apps/wbs/mcp-01/src/openapi.json',
    'emit-other-cli.ts apps/wbs/mcp-01/src/openapi.json',
  ],
] as const)
  test(`frozen startup profile refuses reviewed incompatible ${path} ${before}`, async () => {
    const prepared = await artifact();
    const location = join(prepared.root, path);
    const contents = await readFile(location, 'utf8');
    expect(contents).toContain(before);
    await writeFile(location, contents.replace(before, after));
    await git(prepared.root, 'add', '.');
    await git(
      prepared.root,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'incompatible profile',
    );
    const sha = await git(prepared.root, 'rev-parse', 'HEAD');
    await modes(prepared.root);
    await rejects(createSourceStartupManifest(prepared.root, sha, configuration));
  });

test('constructor shared deadline aborts actual Git blocked on FIFO config and reaps before return', async () => {
  const prepared = await artifact();
  const directory = await mkdtemp('/tmp/source-git-stall-');
  roots.push(directory);
  const pidPath = join(directory, 'pid');
  const executable = join(directory, 'git');
  // Only this fixture records its own exec PID; the production constructor receives no budget override.
  await writeFile(
    executable,
    `#!/bin/sh\nprintf '%s' "$$" > '${pidPath}'\nexec /usr/bin/git "$@"\n`,
    { mode: 0o700 },
  );
  await rm(join(prepared.root, '.git/config'));
  const fifo = Bun.spawn(['/usr/bin/mkfifo', join(prepared.root, '.git/config')], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(await fifo.exited).toBe(0);
  const originalPath = process.env['PATH'];
  const nativeNow = performance.now.bind(performance);
  let first = true;
  const clock = spyOn(performance, 'now').mockImplementation(() => {
    const stamp = nativeNow();
    if (first) {
      first = false;
      return stamp;
    }
    return stamp + 599900;
  });
  process.env['PATH'] = `${directory}:${originalPath ?? ''}`;
  let pid: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outcome: 'refused' | 'evidence' | 'late' | undefined;
  const pending = createSourceStartupManifest(prepared.root, prepared.sourceSha, configuration);
  const settled = pending.then(
    () => 'evidence' as const,
    () => 'refused' as const,
  );
  try {
    for (let attempt = 0; attempt < 100 && !(await Bun.file(pidPath).exists()); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    pid = Number(await readFile(pidPath, 'utf8'));
    expect(Number.isSafeInteger(pid) && pid > 1).toBe(true);
    outcome = await Promise.race([
      settled,
      new Promise<'late'>((resolve) => {
        timer = setTimeout(() => {
          resolve('late');
        }, 1000);
      }),
    ]);
    expect(outcome).toBe('refused');
    const childPid = pid;
    expect(() => process.kill(childPid, 0)).toThrow();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (outcome !== 'refused' && pid !== undefined) process.kill(pid, 'SIGKILL');
    await settled;
    clock.mockRestore();
    if (originalPath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = originalPath;
  }
});
