import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, spyOn, test } from 'bun:test';

import type { DependencyMigrationPins } from './dependency-migration-artifact';
import {
  createDependencyMigrationManifest,
  decodeDependencyMigrationManifest,
  decodeDependencyMigrationPins,
} from './dependency-migration-artifact';
import type { DependencyOwner } from './edge-ownership';
import type { EnvLayout } from './env';

const expected = {
  version: 1,
  sourceSha: 'a'.repeat(40),
  candidateImage: `registry/wbs-be-01@sha256:${'b'.repeat(64)}`,
  candidateImageId: `sha256:${'c'.repeat(64)}`,
} as const;
const names = [
  '20261022211000_add_external_dependencies',
  '20261022212000_add_cross_project_dependency_activation',
];
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function prepareArtifact() {
  const root = mkdtempSync(join(tmpdir(), 'migration-artifact-'));
  roots.push(root);
  for (const name of names) {
    mkdirSync(join(root, name), { mode: 0o755 });
    writeFileSync(join(root, name, 'migration.sql'), 'SELECT 1;\n', { mode: 0o644 });
    writeFileSync(join(root, name, 'down.sql'), 'SELECT 2;\n', { mode: 0o644 });
  }
  return root;
}
const hashContents = (contents: string) => createHash('sha256').update(contents).digest('hex');
test('constructs independently prepared complete canonical manifest with exact SQL and optional snapshots', async () => {
  const root = prepareArtifact();
  writeFileSync(join(root, names[0], 'snapshot.json'), '{}\n', { mode: 0o644 });
  const artifact = await createDependencyMigrationManifest(root, expected);
  expect(artifact.sha256).toBe(hashContents(artifact.contents));
  expect(artifact.manifest.migrations.map((row) => row.name)).toEqual(names);
  expect(artifact.manifest.migrations[0]?.migration.sha256).toBe(hashContents('SELECT 1;\n'));
  expect(artifact.manifest.migrations[0]?.snapshot?.size).toBe(3);
  expect(artifact.manifest.migrations[1]?.snapshot).toBeNull();
  expect(
    decodeDependencyMigrationManifest(artifact.contents, {
      ...expected,
      manifestSha256: artifact.sha256,
    }),
  ).toEqual(artifact.manifest);
});
test('refuses malformed or unbound closed attribution before filesystem work', async () => {
  for (const overrides of [
    { version: 2 },
    { sourceSha: 'A'.repeat(40) },
    { candidateImage: expected.candidateImage.replace('be-01', 'gw-01') },
    { candidateImage: 'wbs-be-01:latest' },
    { candidateImageId: 'sha256:abc' },
    { extra: true },
  ]) {
    expect(() =>
      decodeDependencyMigrationPins({ ...expected, manifestSha256: 'd'.repeat(64), ...overrides }),
    ).toThrow();
    await expectRefusal(
      createDependencyMigrationManifest('/absent', {
        ...expected,
        ...overrides,
      } as typeof expected),
    );
  }
});
test('refuses noncanonical manifest bytes, duplicate and unknown keys, false sizes and membership', async () => {
  const artifact = await createDependencyMigrationManifest(prepareArtifact(), expected);
  for (const contents of [
    artifact.contents.replace('"version":1', '"version":1,"version":1'),
    artifact.contents.replace('"version":1', '"version":1,"extra":true'),
    artifact.contents.replace('"size":10', '"size":0'),
    artifact.contents.trim(),
    JSON.stringify({ ...artifact.manifest, migrations: [] }) + '\n',
    JSON.stringify({
      ...artifact.manifest,
      migrations: [artifact.manifest.migrations[0], artifact.manifest.migrations[0]],
    }) + '\n',
  ])
    expect(() =>
      decodeDependencyMigrationManifest(contents, {
        ...expected,
        manifestSha256: hashContents(contents),
      }),
    ).toThrow();
});
test('refuses malformed complete artifact structures and file identities', async () => {
  const faults = [
    (root: string) => {
      rmSync(join(root, names[0], 'down.sql'));
    },
    (root: string) => {
      writeFileSync(join(root, names[0], 'down.sql'), ' \n');
    },
    (root: string) => {
      writeFileSync(join(root, names[0], 'migration.sql'), Buffer.from([0xff]));
    },
    (root: string) => {
      writeFileSync(join(root, names[0], 'snapshot.json'), '{', { mode: 0o644 });
    },
    (root: string) => {
      writeFileSync(join(root, 'ignored'), 'x');
    },
    (root: string) => {
      mkdirSync(join(root, '.ignored'));
    },
    (root: string) => {
      writeFileSync(join(root, names[0], 'ignored'), 'x');
    },
    (root: string) => {
      rmSync(join(root, names[0], 'down.sql'));
      symlinkSync('migration.sql', join(root, names[0], 'down.sql'));
    },
    (root: string) => {
      rmSync(join(root, names[0], 'down.sql'));
      linkSync(join(root, names[0], 'migration.sql'), join(root, names[0], 'down.sql'));
    },
    (root: string) => {
      chmodSync(join(root, names[0], 'down.sql'), 0o666);
    },
    (root: string) => {
      chmodSync(join(root, names[0], 'down.sql'), 0);
    },
    (root: string) => {
      mkdirSync(join(root, '20261022211000_duplicate'));
    },
  ];
  for (const fault of faults) {
    const root = prepareArtifact();
    fault(root);
    await expectRefusal(createDependencyMigrationManifest(root, expected));
  }
});

async function withInstalledArtifact(
  action: (context: {
    owner: DependencyOwner;
    layouts: { prod: EnvLayout; dev: EnvLayout };
    pins: DependencyMigrationPins;
    artifact: Awaited<ReturnType<typeof createDependencyMigrationManifest>>;
    state: string;
    installed: string;
    prepared: string;
  }) => Promise<void>,
  sourceSha = expected.sourceSha,
  snapshot = false,
) {
  const { withDependencyOwner } = await import('./edge-ownership');
  const { envLayout } = await import('./env');
  const { cpSync } = await import('node:fs');
  const prepared = prepareArtifact();
  if (snapshot) writeFileSync(join(prepared, names[0], 'snapshot.json'), '{}\n', { mode: 0o644 });
  const artifact = await createDependencyMigrationManifest(prepared, { ...expected, sourceSha });
  const state = mkdtempSync(join(tmpdir(), 'migration-owner-'));
  roots.push(state);
  mkdirSync(join(state, 'dev'), { mode: 0o755 });
  const layouts = {
    prod: { ...envLayout('prod'), root: state, stateDir: state },
    dev: { ...envLayout('dev'), root: join(state, 'dev'), stateDir: join(state, 'dev') },
  };
  const installed = join(state, 'dependency-artifacts', artifact.sha256);
  mkdirSync(join(state, 'dependency-artifacts'), { mode: 0o755 });
  mkdirSync(installed, { mode: 0o755 });
  cpSync(prepared, join(installed, 'drizzle'), { recursive: true });
  writeFileSync(join(installed, 'manifest.json'), artifact.contents, { mode: 0o600 });
  const previous = process.env['WBS_EDGE_STATE'];
  process.env['WBS_EDGE_STATE'] = state;
  try {
    await withDependencyOwner(
      { sha: expected.sourceSha, layouts: [layouts.prod, layouts.dev] },
      (owner) =>
        action({
          owner,
          layouts,
          pins: { ...expected, sourceSha, manifestSha256: artifact.sha256 },
          artifact,
          state,
          installed,
          prepared,
        }),
      state,
    );
  } finally {
    if (previous === undefined) delete process.env['WBS_EDGE_STATE'];
    else process.env['WBS_EDGE_STATE'] = previous;
  }
}
test('fresh observer binds exact scrubbed image transport and two immutable resolutions', async () => {
  const { observeDependencyMigrationArtifact, migrationNativePreflight } =
    await import('./dependency-migration-artifact');
  const { migrationScannerProgram } = await import('./dependency-migration-artifact-scanner');
  await withInstalledArtifact(async ({ owner, layouts, pins, artifact }) => {
    const commands: string[][] = [];
    const docker = (args: string[]) => {
      commands.push(args);
      return Promise.resolve(
        args[0] === 'image'
          ? expected.candidateImageId + '\n'
          : JSON.stringify(artifact.manifest.migrations) + '\n',
      );
    };
    const observation = await observeDependencyMigrationArtifact(
      owner,
      layouts,
      pins,
      docker,
      performance.now() + 10000,
    );
    expect(observation.activation).toBe('blocked');
    expect(commands.map((args) => args[0])).toEqual(['image', 'run', 'image']);
    expect(commands[1]).toEqual([
      'run',
      '--rm',
      '--pull',
      'never',
      '--network',
      'none',
      '--read-only',
      '--workdir',
      '/',
      '--entrypoint',
      '/usr/bin/env',
      expected.candidateImageId,
      '-i',
      'PATH=/usr/local/bin:/usr/bin:/bin',
      'BUN_RUNTIME_TRANSPILER_CACHE_PATH=0',
      '/bin/busybox',
      'sh',
      '-c',
      migrationNativePreflight(),
      'migration-artifact',
      migrationScannerProgram(),
    ]);
  });
});
for (const fault of [
  'image',
  'second-image',
  'image-hash',
  'duplicate-json',
  'unknown-json',
  'noncanonical',
  'response-bound',
  'missing-image',
  'initial-file',
  'state-parent',
  'rows',
  'json',
  'secret',
  'file',
  'parent',
  'manifest',
  'owner',
  'extra',
  'snapshot',
  'source',
  'layout',
  'deadline',
  'unsafe-root',
  'prepare-installed',
])
  test(`fresh observer refuses ${fault}`, async () => {
    const { observeDependencyMigrationArtifact } = await import('./dependency-migration-artifact');
    const { cpSync, renameSync } = await import('node:fs');
    await withInstalledArtifact(
      async ({ owner, layouts, pins, artifact, state, installed, prepared }) => {
        let inspections = 0;
        const docker = (args: string[]) =>
          Promise.resolve().then(() => {
            if (args[0] === 'image') {
              inspections++;
              if (fault === 'missing-image' && inspections === 2)
                throw new Error('PRIVATE_SENTINEL');
              return fault === 'image' || (fault === 'second-image' && inspections === 2)
                ? 'sha256:' + 'f'.repeat(64)
                : expected.candidateImageId;
            }
            if (fault === 'image-hash')
              return (
                JSON.stringify(
                  artifact.manifest.migrations.map((row) => ({
                    ...row,
                    migration: { ...row.migration, sha256: 'f'.repeat(64) },
                  })),
                ) + '\n'
              );
            if (fault === 'duplicate-json')
              return (
                JSON.stringify(artifact.manifest.migrations).replace(
                  '"name":',
                  '"name":"fake","name":',
                ) + '\n'
              );
            if (fault === 'unknown-json')
              return (
                JSON.stringify(
                  artifact.manifest.migrations.map((row) => ({ ...row, extra: true })),
                ) + '\n'
              );
            if (fault === 'noncanonical') return JSON.stringify(artifact.manifest.migrations);
            if (fault === 'response-bound') return ' '.repeat(4 * 1024 * 1024 + 1);
            if (fault === 'rows') return JSON.stringify(artifact.manifest.migrations.slice(1));
            if (fault === 'json') return 'PRIVATE_SENTINEL{';
            if (fault === 'secret') throw new Error('PRIVATE_SENTINEL');
            if (fault === 'file')
              writeFileSync(join(installed, 'drizzle', names[0], 'migration.sql'), 'SELECT 9;\n');
            if (fault === 'parent') {
              renameSync(join(installed, 'drizzle'), join(installed, 'old'));
              cpSync(prepared, join(installed, 'drizzle'), { recursive: true });
              rmSync(join(installed, 'old'), { recursive: true });
            }
            if (fault === 'manifest') {
              renameSync(join(installed, 'manifest.json'), join(installed, 'old-manifest'));
              writeFileSync(join(installed, 'manifest.json'), artifact.contents, { mode: 0o600 });
              rmSync(join(installed, 'old-manifest'));
            }
            if (fault === 'state-parent') {
              renameSync(join(state, 'dependency-artifacts'), join(state, 'old-artifacts'));
              cpSync(join(state, 'old-artifacts'), join(state, 'dependency-artifacts'), {
                recursive: true,
              });
            }
            if (fault === 'owner') writeFileSync(join(state, 'edge-owner.pending'), 'changed\n');
            if (fault === 'extra')
              writeFileSync(join(installed, 'drizzle', names[0], 'ignored'), 'x');
            if (fault === 'snapshot')
              writeFileSync(join(installed, 'drizzle', names[0], 'snapshot.json'), '{}', {
                mode: 0o644,
              });
            return JSON.stringify(artifact.manifest.migrations) + '\n';
          });
        if (fault === 'initial-file')
          writeFileSync(join(installed, 'drizzle', names[0], 'migration.sql'), 'SELECT 9;\n');

        if (fault === 'layout') layouts.dev = { ...layouts.dev, network: 'foreign' };
        if (fault === 'unsafe-root') chmodSync(installed, 0o777);
        let refused = false;
        try {
          if (fault === 'prepare-installed')
            await createDependencyMigrationManifest(join(installed, 'drizzle'), expected);
          else
            await observeDependencyMigrationArtifact(
              owner,
              layouts,
              pins,
              docker,
              performance.now() + (fault === 'deadline' ? 121000 : 10000),
            );
        } catch (error) {
          refused = true;
          expect(String(error)).not.toContain('PRIVATE_SENTINEL');
        }
        expect(refused).toBe(true);
      },
      fault === 'source' ? 'f'.repeat(40) : expected.sourceSha,
    );
  });

async function expectRefusal(operation: Promise<unknown>) {
  let refused = false;
  try {
    await operation;
  } catch {
    refused = true;
  }
  expect(refused).toBe(true);
}
for (const fault of ['during-read', 'late-file', 'same-byte-root'])
  test(`anchored scanner refuses ${fault}`, async () => {
    const root = prepareArtifact();
    const original = fs.readSync;
    let injected = false;
    const interception = spyOn(fs, 'readSync').mockImplementation((...args: unknown[]) => {
      const count: unknown = Reflect.apply(original, fs, args);
      if (typeof count !== 'number') throw new Error('readSync contract differs');
      if (!injected && count > 0) {
        injected = true;
        if (fault === 'during-read')
          fs.appendFileSync(join(root, names[0], 'migration.sql'), 'SELECT 3;');
        if (fault === 'late-file') writeFileSync(join(root, names[0], 'ignored'), 'x');
        if (fault === 'same-byte-root') {
          fs.renameSync(root, root + '-old');
          roots.push(root + '-old');
          fs.cpSync(root + '-old', root, { recursive: true });
        }
      }
      return count;
    });
    try {
      await expectRefusal(createDependencyMigrationManifest(root, expected));
      expect(injected).toBe(true);
    } finally {
      interception.mockRestore();
    }
  });
test('bounds and artifact safety refuse oversized files, counts, names, modes and expired work', async () => {
  const { scanMigrationArtifact } = await import('./dependency-migration-artifact-scanner');
  const { decodeMigrationArtifactRows } = await import('./dependency-migration-artifact');
  for (const fault of [
    'sql',
    'snapshot',
    'root-mode',
    'long-name',
    'fifo',
    'missing-forward',
    'empty-forward',
    'unsafe-directory',
  ]) {
    const root = prepareArtifact();
    if (fault === 'sql')
      fs.truncateSync(join(root, names[0], 'migration.sql'), 8 * 1024 * 1024 + 1);
    if (fault === 'snapshot') {
      const pathname = join(root, names[0], 'snapshot.json');
      writeFileSync(pathname, '{}', { mode: 0o644 });
      fs.truncateSync(pathname, 16 * 1024 * 1024 + 1);
    }
    if (fault === 'root-mode') chmodSync(root, 0o777);
    if (fault === 'long-name')
      mkdirSync(join(root, '20261022214000_' + 'a'.repeat(150)), { mode: 0o755 });
    if (fault === 'fifo') {
      rmSync(join(root, names[0], 'down.sql'));
      expect(Bun.spawnSync(['mkfifo', join(root, names[0], 'down.sql')]).exitCode).toBe(0);
    }
    if (fault === 'missing-forward') rmSync(join(root, names[0], 'migration.sql'));
    if (fault === 'empty-forward') writeFileSync(join(root, names[0], 'migration.sql'), '');
    if (fault === 'unsafe-directory') chmodSync(join(root, names[0]), 0o777);
    await expectRefusal(createDependencyMigrationManifest(root, expected));
  }
  await expectRefusal(scanMigrationArtifact(prepareArtifact(), performance.now() - 1));
  const artifact = await createDependencyMigrationManifest(prepareArtifact(), expected);
  expect(() =>
    decodeMigrationArtifactRows(Array(4097).fill(artifact.manifest.migrations[0])),
  ).toThrow();
  expect(() =>
    decodeMigrationArtifactRows(
      artifact.manifest.migrations.map((row) => ({
        ...row,
        migration: { ...row.migration, size: 8 * 1024 * 1024 + 1 },
      })),
    ),
  ).toThrow();
  const large = ' '.repeat(4 * 1024 * 1024 + 1);
  expect(() =>
    decodeDependencyMigrationManifest(large, { ...expected, manifestSha256: hashContents(large) }),
  ).toThrow();
});

test('installed optional snapshot absence refuses independently expected membership', async () => {
  const { observeDependencyMigrationArtifact } = await import('./dependency-migration-artifact');
  await withInstalledArtifact(
    async ({ owner, layouts, pins, artifact, installed }) => {
      rmSync(join(installed, 'drizzle', names[0], 'snapshot.json'));
      let dockerCalls = 0;
      await expectRefusal(
        observeDependencyMigrationArtifact(
          owner,
          layouts,
          pins,
          () => {
            dockerCalls++;
            return Promise.resolve(JSON.stringify(artifact.manifest.migrations) + '\n');
          },
          performance.now() + 10000,
        ),
      );
      expect(dockerCalls).toBe(0);
    },
    expected.sourceSha,
    true,
  );
});
test('manifest digest and independently required activation membership are mandatory', async () => {
  const root = prepareArtifact();
  const artifact = await createDependencyMigrationManifest(root, expected);
  expect(() =>
    decodeDependencyMigrationManifest(artifact.contents, {
      ...expected,
      manifestSha256: 'f'.repeat(64),
    }),
  ).toThrow();
  rmSync(join(root, names[1]), { recursive: true });
  await expectRefusal(createDependencyMigrationManifest(root, expected));
});

test('oversized manifest stops before parser dispatch', () => {
  const oversized = ' '.repeat(4 * 1024 * 1024 + 1);
  const parse = spyOn(JSON, 'parse');
  try {
    expect(() =>
      decodeDependencyMigrationManifest(oversized, {
        ...expected,
        manifestSha256: hashContents(oversized),
      }),
    ).toThrow();
    expect(parse).not.toHaveBeenCalled();
  } finally {
    parse.mockRestore();
  }
});
test('oversized SQL stops before file read dispatch', async () => {
  const root = prepareArtifact();
  fs.truncateSync(join(root, names[0], 'migration.sql'), 8 * 1024 * 1024 + 1);
  const read = spyOn(fs, 'readSync');
  try {
    await expectRefusal(createDependencyMigrationManifest(root, expected));
    expect(read).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
  }
});
test('oversized installed manifest stops before file read dispatch', async () => {
  const { observeDependencyMigrationArtifact } = await import('./dependency-migration-artifact');
  await withInstalledArtifact(async ({ owner, layouts, pins, installed }) => {
    fs.truncateSync(join(installed, 'manifest.json'), 4 * 1024 * 1024 + 1);
    const read = spyOn(fs, 'readSync');
    try {
      await expectRefusal(
        observeDependencyMigrationArtifact(
          owner,
          layouts,
          pins,
          () => Promise.resolve(''),
          performance.now() + 10000,
        ),
      );
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });
});
test('total projected bytes refuse valid individual files before granting a manifest', async () => {
  const { decodeMigrationArtifactRows } = await import('./dependency-migration-artifact');
  const artifact = await createDependencyMigrationManifest(prepareArtifact(), expected);
  const rows = Array.from({ length: 9 }, (_, index) => ({
    name: index < 2 ? names[index] : `20261023${String(index).padStart(6, '0')}_extra`,
    migration: { size: 8 * 1024 * 1024, sha256: 'a'.repeat(64) },
    down: { size: 8 * 1024 * 1024, sha256: 'b'.repeat(64) },
    snapshot: { size: 16 * 1024 * 1024, sha256: 'c'.repeat(64) },
  }));
  expect(artifact.manifest.migrations).toHaveLength(2);
  expect(() => decodeMigrationArtifactRows(rows)).toThrow();
});
test('image response limit prevents JSON parser dispatch and transport stalls obey the shared deadline', async () => {
  const { observeDependencyMigrationArtifact } = await import('./dependency-migration-artifact');
  await withInstalledArtifact(async ({ owner, layouts, pins }) => {
    let parsedResponse = false;
    const original = JSON.parse;
    const parse = spyOn(JSON, 'parse').mockImplementation((contents: string) => {
      if (contents.length > 4 * 1024 * 1024) parsedResponse = true;
      const projection: unknown = original(contents);
      return projection;
    });
    try {
      await expectRefusal(
        observeDependencyMigrationArtifact(
          owner,
          layouts,
          pins,
          (args) =>
            Promise.resolve(
              args[0] === 'image' ? pins.candidateImageId : ' '.repeat(4 * 1024 * 1024 + 1),
            ),
          performance.now() + 10000,
        ),
      );
      expect(parsedResponse).toBe(false);
    } finally {
      parse.mockRestore();
    }
    let aborted = false;
    const before = performance.now();
    await expectRefusal(
      observeDependencyMigrationArtifact(
        owner,
        layouts,
        pins,
        (_args, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
        performance.now() + 100,
      ),
    );
    expect(aborted).toBe(true);
    expect(performance.now() - before).toBeLessThan(1000);
  });
});

test('migration count stops before any member file reads', async () => {
  const root = prepareArtifact();
  const original = fs.readdirSync;
  let enumerated = false;
  const read = spyOn(fs, 'readSync');
  const listing = spyOn(fs, 'readdirSync').mockImplementation(((...args: unknown[]) => {
    if (!enumerated) {
      enumerated = true;
      return [
        ...names,
        ...Array.from(
          { length: 4095 },
          (_, index) => `20261023${String(index).padStart(6, '0')}_extra`,
        ),
      ];
    }
    const members: unknown = Reflect.apply(original, fs, args);
    return members;
  }) as typeof fs.readdirSync);
  try {
    await expectRefusal(createDependencyMigrationManifest(root, expected));
    expect(read).not.toHaveBeenCalled();
  } finally {
    listing.mockRestore();
    read.mockRestore();
  }
});
test('projected names stamps ordering and cardinality remain precise', async () => {
  const { decodeMigrationArtifactRows } = await import('./dependency-migration-artifact');
  const artifact = await createDependencyMigrationManifest(prepareArtifact(), expected);
  const first = artifact.manifest.migrations[0];
  const second = artifact.manifest.migrations[1];
  expect(first).toBeDefined();
  expect(second).toBeDefined();
  for (const rows of [
    [second, first],
    [first, first, second],
    [first, { ...first, name: '20261022211000_other' }, second],
    [first, second, { ...first, name: '20261023000000_' + 'a'.repeat(150) }],
    [first, second, { ...first, name: '20261023000000_UPPER' }],
  ])
    expect(() => decodeMigrationArtifactRows(rows)).toThrow();
  let decoded = 0;
  const entry = {
    ...first,
    get name() {
      decoded++;
      return names[0];
    },
  };
  expect(() => decodeMigrationArtifactRows(Array(4097).fill(entry))).toThrow();
  expect(decoded).toBe(0);
});

test('exact UTF-8 forward/down identities hash their original bytes', async () => {
  const root = prepareArtifact();
  const forward = "SELECT 'Привіт';\r\n";
  const rollback = '--réverse\nSELECT 1;\n';
  writeFileSync(join(root, names[0], 'migration.sql'), forward);
  writeFileSync(join(root, names[0], 'down.sql'), rollback);
  const artifact = await createDependencyMigrationManifest(root, expected);
  expect(artifact.manifest.migrations[0]?.migration.sha256).toBe(hashContents(forward));
  expect(artifact.manifest.migrations[0]?.down.sha256).toBe(hashContents(rollback));
});

test('failed read-only image probe retains real owner intent and returns no observation', async () => {
  const { observeDependencyMigrationArtifact } = await import('./dependency-migration-artifact');
  await withInstalledArtifact(async ({ owner, layouts, pins, state }) => {
    let observation: unknown;
    let diagnostic = '';
    try {
      observation = await observeDependencyMigrationArtifact(
        owner,
        layouts,
        pins,
        (args) =>
          args[0] === 'image'
            ? Promise.resolve(pins.candidateImageId)
            : Promise.reject(new Error('PRIVATE_SENTINEL')),
        performance.now() + 10000,
      );
    } catch (cause) {
      diagnostic = String(cause);
    }
    expect(observation).toBeUndefined();
    expect(diagnostic).toContain('container cleanup unverified');
    expect(diagnostic).toContain('purpose=dependency-migration-artifact');
    expect(diagnostic).toContain(pins.candidateImageId);
    expect(diagnostic).toContain('operationSha256=');
    expect(diagnostic).not.toContain('PRIVATE_SENTINEL');
    expect(fs.existsSync(join(state, 'edge-owner.pending'))).toBe(true);
    const intents = fs
      .readdirSync(state)
      .sort()
      .filter((name) => /^edge-owner-.*-intent.json$/.test(name));
    const readbacks = fs
      .readdirSync(state)
      .sort()
      .filter((name) => /^edge-owner-.*-readback.json$/.test(name));
    expect(intents).toHaveLength(2);
    expect(readbacks).toHaveLength(1);
    const probe: unknown = JSON.parse(fs.readFileSync(join(state, intents[1]), 'utf8'));
    if (typeof probe !== 'object' || probe === null || !('args' in probe))
      throw new Error('owner probe intent missing');
    expect(probe.args).toContain('run');
    expect(probe.args).toContain(pins.candidateImageId);
  });
});
test('aborted image probe awaits gated transport and owner settlement before returning', async () => {
  const { observeDependencyMigrationArtifact } = await import('./dependency-migration-artifact');
  await withInstalledArtifact(async ({ owner, layouts, pins, state, installed }) => {
    const listAnchors = () =>
      fs.readdirSync('/proc/self/fd').map((descriptor) => {
        try {
          return fs.readlinkSync('/proc/self/fd/' + descriptor);
        } catch (cause) {
          if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return '';
          throw cause;
        }
      });
    const countAnchors = () =>
      listAnchors().filter((pathname) => pathname.startsWith(installed + '/drizzle')).length;
    const countManifest = () =>
      listAnchors().filter((pathname) => pathname === join(installed, 'manifest.json')).length;
    const aborted = Promise.withResolvers<undefined>();
    const cleanup = Promise.withResolvers<undefined>();
    const settled = Promise.withResolvers<undefined>();
    let returned = false;
    let transportSettled = false;
    let diagnostic = '';
    const pending = observeDependencyMigrationArtifact(
      owner,
      layouts,
      pins,
      async (args, signal) => {
        if (args[0] === 'image') return pins.candidateImageId;
        if (signal === undefined) throw new Error('probe signal absent');
        signal.addEventListener(
          'abort',
          () => {
            aborted.resolve(undefined);
          },
          { once: true },
        );
        await cleanup.promise;
        transportSettled = true;
        settled.resolve(undefined);
        throw new Error('PRIVATE_SENTINEL');
      },
      performance.now() + 100,
    ).then(
      () => {
        returned = true;
        throw new Error('aborted image observation returned success');
      },
      (cause: unknown) => {
        returned = true;
        diagnostic = String(cause);
      },
    );
    try {
      await aborted.promise;
      await Bun.sleep(0);
      expect(returned).toBe(false);
      expect(transportSettled).toBe(false);
      expect(countAnchors()).toBeGreaterThanOrEqual(7);
      expect(countManifest()).toBe(1);
      expect(fs.existsSync(join(state, 'edge-owner.pending'))).toBe(true);
    } finally {
      cleanup.resolve(undefined);
      await settled.promise;
      await pending;
    }
    expect(transportSettled).toBe(true);
    expect(countAnchors()).toBe(0);
    expect(countManifest()).toBe(0);
    expect(returned).toBe(true);
    expect(diagnostic).toContain('CLI settled; container cleanup unverified');
    expect(diagnostic).not.toContain('PRIVATE_SENTINEL');
  });
});
