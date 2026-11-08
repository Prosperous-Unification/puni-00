import { rejects } from 'node:assert/strict';
import * as filesystem from 'node:fs/promises';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, spyOn, test } from 'bun:test';

import {
  adoptLegacyReaderInstallation,
  readLegacyReaderAdoptionSelection,
} from '../install-solver-supervisor';
import {
  ADOPTION_PARENTS,
  adoptLegacySolverReader,
  decodeSolverReaderAdoption,
  type SolverReaderAdoptionLayout,
} from './solver-reader-adoption';
import { readPrivateReceipt, runSolverReaderTransport } from './solver-reader-preparation';
import { captureSolverReaderArtifact } from './solver-reader-preparation';

async function fixture() {
  const root = scratchSync('legacy-adoption-');
  const paths = {
    home: root,
    cache: join(root, '.cache'),
    local: join(root, '.local'),
    lib: join(root, '.local/lib'),
    readerParent: join(root, '.local/lib/reader'),
    configParent: join(root, 'config'),
    unitParent: join(root, 'unit'),
    state: join(root, 'state'),
    privateSolverCache: join(root, '.cache/wbs-solver'),
  };
  for (const name of ADOPTION_PARENTS) {
    if (name !== 'home') await mkdir(paths[name], { mode: name === 'state' ? 0o775 : 0o700 });
    await chmod(paths[name], name === 'state' ? 0o775 : 0o700);
  }
  const stagePath = join(paths.privateSolverCache, 'attempt');
  await mkdir(stagePath, { mode: 0o700 });
  const layout: SolverReaderAdoptionLayout = {
    parents: paths,
    state: paths.state,
    staging: stagePath,
    bun: join(paths.readerParent, 'bun'),
    reader: join(paths.readerParent, 'reader.js'),
    config: join(paths.configParent, 'config.json'),
    unit: join(paths.unitParent, 'service'),
  };
  await copyFile(process.execPath, layout.bun);
  await chmod(layout.bun, 0o755);
  await writeFile(layout.reader, 'throw new Error("unsupported legacy reader must never run");\n', {
    mode: 0o755,
  });
  await writeFile(layout.config, 'private configuration sentinel', { mode: 0o600 });
  await writeFile(layout.unit, 'service sentinel', { mode: 0o644 });
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dir, '../solver-supervisor.ts')],
    target: 'bun',
    plugins: [
      {
        name: 'isolated-adoption-reader',
        setup(build) {
          build.onLoad({ filter: /solver-supervisor-install-contract\.ts$/ }, async (file) => ({
            contents: (await Bun.file(file.path).text()).replace(
              "export const SOLVER_READER_STATE = '/home/puni1/wbs/state';",
              `export const SOLVER_READER_STATE = ${JSON.stringify(layout.state)};`,
            ),
            loader: 'ts',
          }));
        },
      },
    ],
  });
  const output = built.outputs.at(0);
  if (!built.success || output === undefined) throw new Error('test reader build failed');
  await writeFile(join(stagePath, 'reader'), new Uint8Array(await output.arrayBuffer()), {
    mode: 0o600,
  });
  const account = userInfo();
  const selectedParents = Object.fromEntries(
    await Promise.all(
      ADOPTION_PARENTS.map(async (name) => {
        const status = await lstat(paths[name], { bigint: true });
        return [
          name,
          {
            device: String(status.dev),
            inode: String(status.ino),
            mode: Number(status.mode & 0o7777n),
          },
        ] as const;
      }),
    ),
  );
  const pin = async (path: string) => (await captureSolverReaderArtifact(path)).artifact;
  const { path: _bunPath, ...oldBun } = await pin(layout.bun);
  const { path: _readerPath, ...oldReader } = await pin(layout.reader);
  const { path: _configPath, ...config } = await pin(layout.config);
  const { path: _unitPath, ...unit } = await pin(layout.unit);
  const selection = decodeSolverReaderAdoption({
    format: 'legacy-reader-adoption-selection',
    version: 1,
    attemptId: crypto.randomUUID(),
    target: {
      hostname: hostname(),
      account: { name: account.username, uid: account.uid, gid: account.gid },
    },
    parents: selectedParents,
    oldBun,
    oldReader,
    config,
    unit,
    reader: await pin(join(stagePath, 'reader')),
  });
  const originals = await Promise.all(
    [layout.bun, layout.reader, layout.config, layout.unit].map(captureSolverReaderArtifact),
  );
  const observedStaging = await lstat(layout.staging, { bigint: true });
  const staging = {
    device: String(observedStaging.dev),
    inode: String(observedStaging.ino),
    mode: 0o700,
    uid: String(observedStaging.uid),
    gid: String(observedStaging.gid),
  };
  return { layout, selection, originals, staging };
}
const digest = '1'.repeat(64);

test('actual legacy adoption preserves tuple and mode and never invokes old reader', async () => {
  const { layout, selection, originals, staging } = await fixture();
  const boundaries: string[] = [];
  await adoptLegacySolverReader(selection, digest, layout, {
    staging,
    observe: async (boundary) => {
      boundaries.push(boundary);
      if (boundary === 'sibling-ready') {
        const contender = Bun.spawn(['flock', '-n', join(layout.state, 'edge.lock'), 'true']);
        expect(await contender.exited).toBe(1);
      }
    },
  });
  expect(boundaries).toEqual([
    'before-lock',
    'created-lock',
    'initialized',
    'staged-legacy',
    'staged-required',
    'sibling-ready',
    'published',
    'installed-legacy',
    'installed-required',
    'terminal-written',
  ]);
  for (const original of originals.filter(
    (observation) => observation.artifact.path !== layout.reader,
  ))
    expect(await captureSolverReaderArtifact(original.artifact.path)).toEqual(original);
  expect((await lstat(layout.state)).mode & 0o7777).toBe(0o775);
  expect(await readFile(join(layout.staging, 'original-reader'), 'utf8')).toBe(
    'throw new Error("unsupported legacy reader must never run");\n',
  );
  expect(await Bun.file(join(layout.staging, 'opening.json')).json()).toMatchObject({
    selectionDigest: digest,
    originals,
  });
  expect(await Bun.file(join(layout.staging, 'complete.json')).exists()).toBe(true);
  expect((await captureSolverReaderArtifact(layout.reader)).artifact.sha256).toBe(
    selection.reader.sha256,
  );
  expect(await Bun.spawn(['flock', '-n', join(layout.state, 'edge.lock'), 'true']).exited).toBe(0);
}, 30000);

for (const fault of [
  'policy',
  'pending',
  'committed',
  'lock',
  'old-pin',
  'new-pin',
  'config-pin',
  'parent',
  'target',
  'unknown-selection',
] as const)
  test(`legacy adoption refuses ${fault} before publication`, async () => {
    const { layout, selection, originals, staging } = await fixture();
    let input: unknown = selection;
    if (fault === 'policy') await writeFile(join(layout.state, 'edge-policy.json'), 'malformed');
    if (fault === 'pending') await mkdir(join(layout.state, 'edge-owner.pending'));
    if (fault === 'committed') await writeFile(join(layout.state, 'edge-owner.json'), 'retained');
    if (fault === 'lock') await writeFile(join(layout.state, 'edge.lock'), '');
    if (fault === 'old-pin')
      input = { ...selection, oldReader: { ...selection.oldReader, sha256: '0'.repeat(64) } };
    if (fault === 'new-pin')
      input = { ...selection, reader: { ...selection.reader, sha256: '0'.repeat(64) } };
    if (fault === 'config-pin')
      input = { ...selection, config: { ...selection.config, sha256: '0'.repeat(64) } };
    if (fault === 'parent')
      input = {
        ...selection,
        parents: { ...selection.parents, cache: { ...selection.parents.cache, inode: '1' } },
      };
    if (fault === 'target')
      input = { ...selection, target: { ...selection.target, hostname: 'foreign.invalid' } };
    if (fault === 'unknown-selection') input = { ...selection, skipOldCheck: true };
    await rejects(
      adoptLegacySolverReader(input, digest, layout, { staging }),
      fault === 'policy' || fault === 'lock' ? /requires absent path/ : () => true,
    );
    for (const original of originals)
      expect(await captureSolverReaderArtifact(original.artifact.path)).toEqual(original);
    expect(await Bun.file(join(layout.staging, 'complete.json')).exists()).toBe(false);
  });

for (const fault of [
  'created-lock',
  'receipt',
  'staged-tuple',
  'staged-capability',
  'sibling',
  'installed-capability',
] as const)
  test(`legacy adoption retains failure state for ${fault}`, async () => {
    const { layout, selection, originals, staging } = await fixture();
    const old = originals.find((observation) => observation.artifact.path === layout.reader);
    if (old === undefined) throw new Error('test original reader missing');
    await rejects(
      adoptLegacySolverReader(selection, digest, layout, {
        staging,
        observe: async (boundary) => {
          if (fault === 'created-lock' && boundary === 'created-lock') {
            await rename(join(layout.state, 'edge.lock'), join(layout.staging, 'original-lock'));
            await writeFile(join(layout.state, 'edge.lock'), '');
          }
          if (fault === 'receipt' && boundary === 'initialized')
            await writeFile(join(layout.staging, 'origin.json'), '{}');
          if (fault === 'staged-tuple' && boundary === 'staged-legacy')
            await writeFile(layout.config, 'changed');
          if (fault === 'staged-capability' && boundary === 'initialized')
            await writeFile(selection.reader.path, 'process.exit(19);');
          if (fault === 'sibling' && boundary === 'sibling-ready') {
            const leaves = (await readdir(dirname(layout.reader)))
              .filter((name) => name.startsWith('.reader-transition-'))
              .map((name) => join(dirname(layout.reader), name));
            const sibling = leaves.at(0);
            if (sibling === undefined) throw new Error('sibling absent');
            await unlink(sibling);
            await writeFile(sibling, 'foreign');
          }
          if (fault === 'installed-capability' && boundary === 'published')
            await writeFile(layout.reader, 'process.exit(23);');
        },
      }),
    );
    expect(await Bun.file(join(layout.staging, 'complete.json')).exists()).toBe(false);
    if (fault !== 'installed-capability')
      expect(await captureSolverReaderArtifact(layout.reader)).toEqual(old);
    for (const original of originals.filter(
      (observation) =>
        observation.artifact.path !== layout.reader &&
        !(fault === 'staged-tuple' && observation.artifact.path === layout.config),
    ))
      expect(await captureSolverReaderArtifact(original.artifact.path)).toEqual(original);
    if (fault === 'created-lock')
      expect(await Bun.file(join(layout.state, 'edge-policy.json')).exists()).toBe(false);
  });

test('explicit generated adoption dry-run has no effects and its execute transport adopts only reader', async () => {
  const { layout, selection, originals } = await fixture();
  const localReader = join(layout.parents.home, 'selected-reader');
  await rename(selection.reader.path, localReader);
  await rmdir(layout.staging);
  const selected = { ...selection, reader: { ...selection.reader, path: localReader } };
  const selectedPath = join(layout.parents.home, 'selection.json');
  await writeFile(selectedPath, JSON.stringify(selected), { mode: 0o600 });
  let calls = 0;
  const dependencies = {
    read: async (path: string) => new Uint8Array(await Bun.file(path).arrayBuffer()),
    exists: async (path: string) => Bun.file(path).exists(),
    hash: async (path: string) =>
      new Bun.CryptoHasher('sha256')
        .update(new Uint8Array(await Bun.file(path).arrayBuffer()))
        .digest('hex'),
    command: async () => {
      await Promise.resolve();
      throw new Error('service/normal transport forbidden');
    },
    readerCommand: async (argv: readonly string[], final: boolean) => {
      calls++;
      if (argv[0] === 'ssh' && argv[1] === 'owned-fixture' && argv.at(2) !== undefined)
        return runSolverReaderTransport(['sh', '-c', argv[2]], final);
      if (argv[0] === 'scp' && argv.at(1) !== undefined && argv[2]?.startsWith('owned-fixture:'))
        return runSolverReaderTransport(
          ['cp', '--', argv[1], argv[2].slice('owned-fixture:'.length)],
          final,
        );
      throw new Error('unexpected adoption transport');
    },
  };
  const args = ['--adopt-legacy-reader', '--host=owned-fixture', `--selection=${selectedPath}`];
  const plan = await adoptLegacyReaderInstallation(args, dependencies, layout);
  expect(calls).toBe(0);
  expect(
    plan.every(
      (step) => step.phase === 'files' && step.argv.every((argument) => argument.length < 65536),
    ),
  ).toBe(true);
  expect(await Bun.file(join(layout.state, 'edge-policy.json')).exists()).toBe(false);
  await adoptLegacyReaderInstallation([...args, '--execute'], dependencies, layout);
  expect(calls).toBe(plan.length + 1);
  for (const original of originals.filter(
    (observation) => observation.artifact.path !== layout.reader,
  ))
    expect(await captureSolverReaderArtifact(original.artifact.path)).toEqual(original);
  expect(await Bun.file(join(layout.staging, 'complete.json')).exists()).toBe(true);
  expect((await captureSolverReaderArtifact(layout.reader)).artifact.sha256).toBe(
    selection.reader.sha256,
  );
}, 30000);

for (const fault of [
  'parent-before-lock',
  'parent-before-init',
  'terminal-inode',
  'terminal-parent',
  'terminal-parent-rebound',
  'created-staging',
  'original-evidence',
  'wrong-attempt',
  'policy-inode',
  'receipt-inode-late',
  'original-reader-inode',
  'rebound-lock-receipt',
] as const)
  test(`legacy adoption exact custody refuses ${fault}`, async () => {
    const { layout, selection, originals, staging } = await fixture();
    const retained = join(layout.parents.home, 'retained');
    if (fault === 'created-staging') staging.inode = '1';
    await rejects(
      adoptLegacySolverReader(selection, digest, layout, {
        staging,
        observe: async (boundary) => {
          if (
            (fault === 'parent-before-lock' && boundary === 'before-lock') ||
            (fault === 'parent-before-init' && boundary === 'created-lock')
          ) {
            await rename(layout.state, retained);
            await mkdir(layout.state, { mode: 0o775 });
          }
          if (fault === 'terminal-inode' && boundary === 'terminal-written') {
            const path = join(layout.staging, 'complete.json');
            const bytes = await readFile(path);
            await rename(path, join(layout.staging, 'retained-complete'));
            await writeFile(path, bytes, { mode: 0o600 });
          }
          if (fault === 'terminal-parent-rebound' && boundary === 'terminal-written') {
            await rename(layout.staging, retained);
            await mkdir(layout.staging, { mode: 0o700 });
            await rename(join(retained, 'complete.json'), join(layout.staging, 'complete.json'));
          }
          if (fault === 'terminal-parent' && boundary === 'terminal-written') {
            await rename(layout.staging, retained);
            await mkdir(layout.staging, { mode: 0o700 });
          }
          if (fault === 'original-evidence' && boundary === 'staged-legacy')
            await writeFile(join(layout.staging, 'original-reader'), 'corrupt');
          if (fault === 'wrong-attempt' && boundary === 'initialized') {
            const path = join(layout.staging, 'origin.json');
            const receipt = await readPrivateReceipt({
              state: layout.state,
              receiptPath: path,
              attemptId: selection.attemptId,
            });
            await writeFile(path, JSON.stringify({ ...receipt, attemptId: crypto.randomUUID() }));
          }
          if (fault === 'receipt-inode-late' && boundary === 'staged-legacy') {
            const path = join(layout.staging, 'origin.json');
            const bytes = await readFile(path);
            await rename(path, join(layout.staging, 'retained-receipt'));
            await writeFile(path, bytes, { mode: 0o600 });
          }
          if (fault === 'original-reader-inode' && boundary === 'staged-legacy') {
            const bytes = await readFile(layout.reader);
            await rename(layout.reader, join(layout.staging, 'retained-replaced-reader'));
            await writeFile(layout.reader, bytes, { mode: 0o755 });
          }
          if (fault === 'rebound-lock-receipt' && boundary === 'initialized') {
            const path = join(layout.state, 'edge.lock');
            await rename(path, join(layout.staging, 'retained-created-lock'));
            await writeFile(path, '', { mode: 0o600 });
            const lock = await lstat(path, { bigint: true });
            const receiptPath = join(layout.staging, 'origin.json');
            const receipt = await readPrivateReceipt({
              state: layout.state,
              receiptPath,
              attemptId: selection.attemptId,
            });
            await writeFile(
              receiptPath,
              JSON.stringify({
                ...receipt,
                lock: { ...receipt.lock, device: String(lock.dev), inode: String(lock.ino) },
              }),
            );
          }
          if (fault === 'policy-inode' && boundary === 'initialized') {
            const path = join(layout.state, 'edge-policy.json');
            const bytes = await readFile(path);
            await rename(path, join(layout.staging, 'retained-policy'));
            await writeFile(path, bytes, { mode: 0o600 });
          }
        },
      }),
      fault === 'terminal-parent-rebound' ? /observation parent changed/ : () => true,
    );
    const published =
      fault === 'terminal-inode' ||
      fault === 'terminal-parent' ||
      fault === 'terminal-parent-rebound';
    for (const original of originals.filter(
      (observation) =>
        (!published && fault !== 'original-reader-inode') ||
        observation.artifact.path !== layout.reader,
    ))
      expect(await captureSolverReaderArtifact(original.artifact.path)).toEqual(original);
    if (fault.startsWith('parent-')) {
      expect(await Bun.file(join(layout.state, 'edge-policy.json')).exists()).toBe(false);
      expect(await Bun.file(join(retained, 'edge-policy.json')).exists()).toBe(false);
    }
    if (fault.startsWith('parent-'))
      expect(await Bun.file(join(layout.state, 'edge.lock')).exists()).toBe(false);
    if (fault === 'parent-before-lock')
      expect(await Bun.file(join(retained, 'edge.lock')).exists()).toBe(false);
  });

test('created staging replacement between transport steps refuses before copy or execution', async () => {
  const { layout, selection, originals } = await fixture();
  const localReader = join(layout.parents.home, 'local-selected-reader');
  await rename(selection.reader.path, localReader);
  await rmdir(layout.staging);
  const path = join(layout.parents.home, 'transport-selection.json');
  await writeFile(
    path,
    JSON.stringify({ ...selection, reader: { ...selection.reader, path: localReader } }),
  );
  let calls = 0;
  await rejects(
    adoptLegacyReaderInstallation(
      ['--adopt-legacy-reader', '--host=owned-fixture', `--selection=${path}`, '--execute'],
      {
        read: async (path: string) => new Uint8Array(await Bun.file(path).arrayBuffer()),
        exists: async (path: string) => Bun.file(path).exists(),
        hash: async (path: string) => (await captureSolverReaderArtifact(path)).artifact.sha256,
        command: async () => {
          await Promise.resolve();
          throw new Error('normal transport forbidden');
        },
        readerCommand: async (argv, final) => {
          calls++;
          if (argv[0] === 'scp')
            return runSolverReaderTransport(
              ['cp', '--', argv[1], argv[2].slice('owned-fixture:'.length)],
              final,
            );
          if (argv[0] !== 'ssh' || argv.at(2) === undefined)
            throw new Error('unexpected transport');
          const observation = await runSolverReaderTransport(['sh', '-c', argv[2]], final);
          if (calls === 1) {
            await rename(
              layout.staging,
              join(layout.parents.privateSolverCache, 'retained-created'),
            );
            await mkdir(layout.staging, { mode: 0o700 });
          }
          return observation;
        },
      },
      layout,
    ),
  );
  expect(calls).toBe(2);
  expect(await readdir(layout.staging)).toEqual([]);
  expect(await Bun.file(join(layout.state, 'edge-policy.json')).exists()).toBe(false);
  for (const original of originals)
    expect(await captureSolverReaderArtifact(original.artifact.path)).toEqual(original);
}, 30000);

for (const flags of [
  [],
  ['--execute', '--dry-run'],
  ['--host=again'],
  ['--skip-old-check'],
  ['--selection=/again'],
] as const)
  test(`adoption CLI closed arguments ${flags.join(' ')}`, async () => {
    const { layout, selection } = await fixture();
    const path = join(layout.parents.home, 'closed-selection.json');
    await writeFile(path, JSON.stringify(selection));
    const argv =
      flags.length === 0
        ? ['--adopt-legacy-reader']
        : ['--adopt-legacy-reader', '--host=owned-fixture', `--selection=${path}`, ...flags];
    await rejects(adoptLegacyReaderInstallation(argv, undefined, layout));
    expect(await Bun.file(join(layout.state, 'edge-policy.json')).exists()).toBe(false);
  });

test('actual staged singleton nonzero preserves reader after ordinary initialization', async () => {
  const { layout, selection, originals, staging } = await fixture();
  await writeFile(selection.reader.path, 'process.exit(29);');
  const refused = {
    ...selection,
    reader: (await captureSolverReaderArtifact(selection.reader.path)).artifact,
  };
  await rejects(adoptLegacySolverReader(refused, digest, layout, { staging }), /child refused/);
  expect(await Bun.file(join(layout.state, 'edge-policy.json')).exists()).toBe(true);
  expect(await Bun.file(join(layout.staging, 'complete.json')).exists()).toBe(false);
  for (const original of originals)
    expect(await captureSolverReaderArtifact(original.artifact.path)).toEqual(original);
});

for (const fault of [
  'identity',
  'unsafe-parent',
  'fixed-layout',
  'selection-digest',
  'deadline',
  'created-staging-shape',
] as const)
  test(`legacy adoption boundary ${fault}`, async () => {
    const { layout, selection, originals, staging } = await fixture();
    let input: unknown = selection;
    if (fault === 'identity') input = { ...selection, attemptId: 'not-an-attempt' };
    if (fault === 'unsafe-parent')
      input = {
        ...selection,
        parents: { ...selection.parents, state: { ...selection.parents.state, mode: 0o777 } },
      };
    const selectedLayout =
      fault === 'fixed-layout'
        ? { ...layout, unit: join(layout.parents.home, 'foreign-unit') }
        : layout;
    const selectedDigest = fault === 'selection-digest' ? 'invalid' : digest;
    const selectedStaging =
      fault === 'created-staging-shape' ? { ...staging, mode: 0o755 } : staging;
    const clock = {
      now: () => {
        ticks++;
        return ticks === 1 ? 0 : 180001;
      },
      pause: async () => {
        await Promise.resolve();
        throw new Error('unexpected pause');
      },
    };
    let ticks = 0;
    const expected = {
      identity: /selection identity/,
      'unsafe-parent': /unsafe selected/,
      'fixed-layout': /fixed layout/,
      'selection-digest': /selection digest/,
      deadline: /deadline expired/,
      'created-staging-shape': /staging identity/,
    }[fault];
    await rejects(
      adoptLegacySolverReader(input, selectedDigest, selectedLayout, {
        staging: selectedStaging,
        ...(fault === 'deadline' ? { clock } : {}),
      }),
      expected,
    );
    for (const original of originals)
      expect(await captureSolverReaderArtifact(original.artifact.path)).toEqual(original);
    expect(await Bun.file(join(layout.state, 'edge-policy.json')).exists()).toBe(false);
  });

test('created lock unsafe mode refuses at original metadata boundary', async () => {
  const { layout, selection, staging } = await fixture();
  const mask = process.umask(0o022);
  try {
    await rejects(
      adoptLegacySolverReader(selection, digest, layout, {
        staging,
        observe: async (boundary) => {
          await Promise.resolve();
          if (boundary === 'before-lock') process.umask(0o777);
        },
      }),
      /created lock metadata differs/,
    );
  } finally {
    process.umask(mask);
  }
  expect(await Bun.file(join(layout.state, 'edge-policy.json')).exists()).toBe(false);
});

for (const fault of ['absent', 'unreadable', 'oversized', 'malformed', 'alias'] as const)
  test(`selection input refuses ${fault} at original boundary`, async () => {
    const root = scratchSync('adoption-input-');
    const path = join(root, 'selection.json');
    if (fault !== 'absent')
      await writeFile(path, fault === 'oversized' ? ' '.repeat(32769) : '{}', { mode: 0o600 });
    if (fault === 'unreadable') await chmod(path, 0);
    if (fault === 'alias') {
      await rename(path, join(root, 'original'));
      await filesystem.symlink(join(root, 'original'), path);
    }
    await rejects(
      readLegacyReaderAdoptionSelection(path),
      fault === 'oversized'
        ? /bounded regular/
        : fault === 'alias'
          ? /canonical absolute/
          : () => true,
    );
  });

test('selection original descriptor metadata drift refuses after actual read', async () => {
  const { layout, selection } = await fixture();
  const path = join(layout.parents.home, 'drift-selection.json');
  const bytes = JSON.stringify(selection);
  await writeFile(path, bytes);
  const nativeOpen = filesystem.open;
  let injected = false;
  const fault = spyOn(filesystem, 'open').mockImplementation(async (...arguments_) => {
    const descriptor = await nativeOpen(...arguments_);
    if (arguments_[0] === path) {
      const original = descriptor.read.bind(descriptor);
      spyOn(descriptor, 'read').mockImplementation(async (...arguments_) => {
        // Forward the exact production read through its overloaded method without changing its bytes.
        const observed = await (Reflect.apply(original, descriptor, arguments_) as ReturnType<
          typeof descriptor.read
        >);
        await writeFile(path, `${bytes} `);
        injected = true;
        return observed;
      });
    }
    return descriptor;
  });
  try {
    await rejects(readLegacyReaderAdoptionSelection(path), /selection original changed/);
  } finally {
    fault.mockRestore();
  }
  expect(injected).toBe(true);
});

test('selection original short read refuses even when the received JSON is complete', async () => {
  const { layout, selection } = await fixture();
  const path = join(layout.parents.home, 'short-selection.json');
  await writeFile(path, `${JSON.stringify(selection)}\n`);
  const nativeOpen = filesystem.open;
  let injected = false;
  const fault = spyOn(filesystem, 'open').mockImplementation(async (...arguments_) => {
    const descriptor = await nativeOpen(...arguments_);
    if (arguments_[0] === path) {
      const original = descriptor.read.bind(descriptor);
      spyOn(descriptor, 'read').mockImplementation(async (...arguments_) => {
        // Forward the exact production read through its overloaded method without changing its bytes.
        const observed = await (Reflect.apply(original, descriptor, arguments_) as ReturnType<
          typeof descriptor.read
        >);
        injected = true;
        return { ...observed, bytesRead: observed.bytesRead - 1 };
      });
    }
    return descriptor;
  });
  try {
    await rejects(readLegacyReaderAdoptionSelection(path), /selection changed during read/);
  } finally {
    fault.mockRestore();
  }
  expect(injected).toBe(true);
});

test('adoption default production account refuses a different independently selected account', async () => {
  const { layout, selection } = await fixture();
  const path = join(layout.parents.home, 'wrong-account-selection.json');
  await writeFile(
    path,
    JSON.stringify({
      ...selection,
      target: {
        ...selection.target,
        account: { ...selection.target.account, name: 'foreign_selected_account' },
      },
    }),
  );
  await rejects(
    adoptLegacyReaderInstallation([
      '--adopt-legacy-reader',
      '--host=owned-fixture',
      `--selection=${path}`,
    ]),
    /requires production account/,
  );
});

test('adoption dry-run refuses changed independently pinned local candidate', async () => {
  const { layout, selection } = await fixture();
  const path = join(layout.parents.home, 'wrong-candidate-selection.json');
  await writeFile(
    path,
    JSON.stringify({ ...selection, reader: { ...selection.reader, sha256: '0'.repeat(64) } }),
  );
  await rejects(
    adoptLegacyReaderInstallation(
      ['--adopt-legacy-reader', '--host=owned-fixture', `--selection=${path}`],
      undefined,
      layout,
    ),
    /selected candidate differs/,
  );
});

test('selected parent replacement during original open refuses at captured descriptor boundary', async () => {
  const { layout, selection, staging } = await fixture();
  const retained = join(layout.parents.home, 'retained-selected-parent');
  const nativeOpen = filesystem.open;
  let injected = false;
  const fault = spyOn(filesystem, 'open').mockImplementation(async (...arguments_) => {
    if (arguments_[0] === layout.state && !injected) {
      injected = true;
      await rename(layout.state, retained);
      await mkdir(layout.state, { mode: 0o775 });
    }
    return nativeOpen(...arguments_);
  });
  try {
    await rejects(
      adoptLegacySolverReader(selection, digest, layout, { staging }),
      /original selected state changed/,
    );
  } finally {
    fault.mockRestore();
  }
  expect(injected).toBe(true);
  for (const directory of [layout.state, retained]) {
    expect(await Bun.file(join(directory, 'edge.lock')).exists()).toBe(false);
    expect(await Bun.file(join(directory, 'edge-policy.json')).exists()).toBe(false);
  }
});
