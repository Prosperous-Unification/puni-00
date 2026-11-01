import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type * as MaterializerModule from '../fixtures/source-frontend-profile';
import { prepareSourceFrontendProfile } from '../fixtures/source-frontend-profile';
import { artifact, configuration, git, modes, roots } from '../fixtures/source-startup';
import { selectSourceFrontendProfile } from './source-frontend-profile';
import {
  createSourceStartupManifest,
  decodeSourceStartupManifest,
  type SourceEntry,
  type SourceStartupManifest,
} from './source-startup-manifest';

const PATHS = [
  'apps/wbs/fe-01/index.html',
  'apps/wbs/fe-01/src/main.tsx',
  'apps/wbs/fe-01/vite.config.ts',
  'apps/wbs/fe-01/project.json',
  'deploy/dev-src/Dockerfile',
  'deploy/dev-src/compose.yml',
  'bun.lock',
  'package.json',
  'node_modules/vite/package.json',
  'node_modules/vite/dist/node/chunks/node.js',
  'node_modules/vite/dist/node/index.js',
  'node_modules/@vitejs/plugin-react/package.json',
  'node_modules/@vitejs/plugin-react/dist/index.js',
  'node_modules/@tailwindcss/vite/package.json',
  'node_modules/@tailwindcss/vite/dist/index.mjs',
  'node_modules/react/package.json',
  'node_modules/react-dom/package.json',
  'node_modules/rolldown/package.json',
];
const PAIRS = [
  {
    epoch: 'before-ctt',
    'package.json': {
      bytes: 4885,
      sha256: 'bf45a6e5f8f806d2762dfb22af77375a9ad55d806781a34812812de31f07eb74',
    },
    'bun.lock': {
      bytes: 533044,
      sha256: 'bf54a6c6202a5d8f54f9bb8fe7e76935a8f4c667c660da720db3fd5f16391383',
    },
  },
  {
    epoch: 'ctt-0.12.0',
    'package.json': {
      bytes: 4930,
      sha256: '74ba36c471df0f1dd7ca4221a49f1dd9bab2c7feb7d022a5ff6be39a3aff0e8a',
    },
    'bun.lock': {
      bytes: 533521,
      sha256: 'e3e915704bce2282142eae1f2374cd6217f408d1fed38ae116579a4f6fb1025d',
    },
  },
];

let current: SourceStartupManifest;
beforeAll(async () => {
  const prepared = await artifact();
  await prepareSourceFrontendProfile(prepared.root);
  await modes(prepared.root);
  await git(prepared.root, 'add', '.');
  await git(
    prepared.root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'exact frontend profile',
  );
  await modes(prepared.root);
  const sha = await git(prepared.root, 'rev-parse', 'HEAD');
  current = (await createSourceStartupManifest(prepared.root, sha, configuration)).manifest;
});
afterAll(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function nameOf(entry: SourceEntry): string {
  return entry.root === 'source'
    ? entry.path
    : entry.root === 'dependencies'
      ? `node_modules/${entry.path}`
      : `.git/${entry.path}`;
}
function inputName(path: string): string {
  return path.replace('node_modules/vite/', 'node_modules/.frontend-profile/vite/');
}
function canonical(candidate: SourceStartupManifest): SourceStartupManifest {
  const order = ['source', 'dependencies', 'git'];
  const entries = [...candidate.entries].sort(
    (left, right) =>
      order.indexOf(left.root) - order.indexOf(right.root) ||
      Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)),
  );
  const contents = JSON.stringify({ ...candidate, entries }) + '\n';
  return decodeSourceStartupManifest(contents, {
    version: 1,
    sourceSha: candidate.sourceSha,
    runtimeImageId: `sha256:${'a'.repeat(64)}`,
    manifestSha256: createHash('sha256').update(contents).digest('hex'),
    environmentSha256: 'b'.repeat(64),
  });
}

for (const pair of PAIRS)
  describe(pair.epoch, () => {
    let manifest: SourceStartupManifest;
    beforeAll(() => {
      // Historical pair is modeled canonical selection metadata, not freshly produced Vite output.
      manifest =
        pair.epoch === 'ctt-0.12.0'
          ? current
          : canonical({
              ...current,
              entries: current.entries.map((entry) => {
                if (entry.root !== 'source' || entry.kind !== 'file') return entry;
                if (entry.path !== 'package.json' && entry.path !== 'bun.lock') return entry;
                const expected = pair[entry.path];
                return { ...entry, size: expected.bytes, sha256: expected.sha256 };
              }),
            });
    });
    function withViteTarget(target: string, additions: SourceEntry[] = []): SourceStartupManifest {
      return {
        ...manifest,
        entries: [
          ...manifest.entries.map((entry) =>
            entry.root === 'dependencies' && entry.path === 'vite' && entry.kind === 'symlink'
              ? { ...entry, target }
              : entry,
          ),
          ...additions,
        ],
      };
    }
    test('fixed frontend selection accepts an independently prepared unrelated source commit with declared dependency links', () => {
      for (const path of ['package.json', 'bun.lock'] as const) {
        const selected = manifest.entries.find(
          (entry) => entry.root === 'source' && entry.path === path,
        );
        if (selected?.kind !== 'file') throw new Error('prepared pair not files');
        expect({ bytes: selected.size, sha256: selected.sha256 }).toEqual(pair[path]);
      }
      expect(manifest.sourceSha).not.toBe('be344d9afaca6bf6c065fb54dcfd5a37900e2f24');
      expect(selectSourceFrontendProfile(manifest)).toBe('wbs-source-frontend-wire-v1');
    });

    test.each(PATHS)(
      'fixed frontend selection refuses missing, changed-size/hash and non-file input: %s',
      (path) => {
        const selected = inputName(path);
        expect(
          manifest.entries.some((entry) => nameOf(entry) === selected && entry.kind === 'file'),
        ).toBe(true);
        for (const fault of ['missing', 'size', 'hash', 'kind']) {
          const entries: SourceEntry[] = manifest.entries.flatMap((entry) => {
            if (nameOf(entry) !== selected || entry.kind !== 'file') return [entry];
            if (fault === 'missing') return [];
            if (fault === 'kind')
              return [{ root: entry.root, path: entry.path, kind: 'directory', mode: 0o755 }];
            return [
              {
                ...entry,
                size: fault === 'size' ? entry.size + 1 : entry.size,
                sha256: fault === 'hash' ? 'b'.repeat(64) : entry.sha256,
              },
            ];
          });
          expect(() => selectSourceFrontendProfile({ ...manifest, entries })).toThrow(
            'source frontend input profile unsupported',
          );
        }
      },
    );

    test.each(['source', 'git'] as const)(
      'private frontend lookup respects declared links into the %s namespace',
      (root) => {
        const additions: SourceEntry[] = manifest.entries
          .filter(
            (entry) =>
              entry.root === 'dependencies' &&
              (entry.path === '.frontend-profile/vite' ||
                entry.path.startsWith('.frontend-profile/vite/')),
          )
          .map((entry) => ({
            ...entry,
            root,
            path: entry.path.replace('.frontend-profile/vite', 'frontend-vite'),
          }));
        const candidate = canonical(
          withViteTarget(
            root === 'source' ? '../frontend-vite' : '../.git/frontend-vite',
            additions,
          ),
        );
        expect(selectSourceFrontendProfile(candidate)).toBe('wbs-source-frontend-wire-v1');
      },
    );

    test('private frontend lookup follows the current valid declared target rather than a still-present good file', () => {
      const additions: SourceEntry[] = manifest.entries
        .filter(
          (entry) =>
            entry.root === 'dependencies' &&
            (entry.path === '.frontend-profile/vite' ||
              entry.path.startsWith('.frontend-profile/vite/')),
        )
        .map((entry) => ({
          ...entry,
          path: entry.path.replace('.frontend-profile/vite', '.frontend-profile/foreign-vite'),
          ...(entry.kind === 'file' && entry.path.endsWith('/chunks/node.js')
            ? { sha256: 'c'.repeat(64) }
            : {}),
        }));
      const candidate = canonical(withViteTarget('.frontend-profile/foreign-vite', additions));
      expect(
        candidate.entries.some(
          (entry) => entry.path === '.frontend-profile/vite/dist/node/chunks/node.js',
        ),
      ).toBe(true);
      expect(() => selectSourceFrontendProfile(candidate)).toThrow(
        'source frontend input profile unsupported',
      );
    });

    // Noncanonical typed fixtures below intentionally reach the NEW private checks directly;
    // old canonical decoder refusals are not credited as proofs of this lookup implementation.
    test.each(['missing', 'file'])(
      'private frontend lookup refuses a %s ancestor before dot-dot recovery',
      (fault) => {
        const additions: SourceEntry[] =
          fault === 'file'
            ? [
                {
                  root: 'dependencies',
                  path: 'bad-ancestor',
                  kind: 'file',
                  mode: 0o644,
                  size: 0,
                  sha256: 'e'.repeat(64),
                },
              ]
            : [];
        expect(() =>
          selectSourceFrontendProfile(
            withViteTarget('bad-ancestor/../.frontend-profile/vite', additions),
          ),
        ).toThrow('source frontend input profile unsupported');
      },
    );
    test('private frontend lookup refuses escape above the shared synthetic namespace root', () => {
      expect(() =>
        selectSourceFrontendProfile(withViteTarget('../../node_modules/.frontend-profile/vite')),
      ).toThrow('source frontend input profile unsupported');
    });
    test.each(['duplicate', 'synthetic-root'])(
      'private frontend lookup refuses %s namespace ambiguity',
      (fault) => {
        const first = manifest.entries.at(0);
        if (first === undefined) throw new Error('prepared manifest empty');
        const addition: SourceEntry =
          fault === 'duplicate'
            ? first
            : { root: 'source', path: 'node_modules', kind: 'directory', mode: 0o755 };
        expect(() =>
          selectSourceFrontendProfile({ ...manifest, entries: [...manifest.entries, addition] }),
        ).toThrow('source frontend input profile unsupported');
      },
    );
    function chain(length: number): SourceStartupManifest {
      const additions: SourceEntry[] = Array.from({ length: length - 1 }, (_, index) => ({
        root: 'dependencies',
        path: `frontend-link-${String(index)}`,
        kind: 'symlink',
        target:
          index === length - 2 ? '.frontend-profile/vite' : `frontend-link-${String(index + 1)}`,
      }));
      return withViteTarget('frontend-link-0', additions);
    }
    test('private frontend lookup accepts forty links and refuses the forty-first', () => {
      expect(selectSourceFrontendProfile(canonical(chain(40)))).toBe('wbs-source-frontend-wire-v1');
      expect(() => selectSourceFrontendProfile(chain(41))).toThrow(
        'source frontend input profile unsupported',
      );
    });
  });

test.each(['package.json', 'bun.lock'] as const)(
  'mixed frontend pair refuses the historical %s alone',
  (path) => {
    const old = PAIRS.at(0);
    if (old === undefined) throw new Error('historical pair absent');
    const expected = old[path];
    const mixed = canonical({
      ...current,
      entries: current.entries.map((entry) =>
        entry.root === 'source' && entry.path === path && entry.kind === 'file'
          ? { ...entry, size: expected.bytes, sha256: expected.sha256 }
          : entry,
      ),
    });
    expect(() => selectSourceFrontendProfile(mixed)).toThrow(
      'source frontend input profile unsupported',
    );
  },
);

test.each(['package.json', 'bun.lock'] as const)(
  'actual committed same-length %s drift reaches selector refusal',
  async (path) => {
    const prepared = await artifact();
    await prepareSourceFrontendProfile(prepared.root);
    const original = await readFile(join(prepared.root, path), 'utf8');
    // Both replacements preserve valid manifest syntax and change non-launch-relevant metadata.
    const changed =
      path === 'package.json'
        ? original.replace('"name": "@puni/workspace"', '"name": "@puni/workspacf"')
        : original.replace('configurable-tree-traversal', 'configurable-tree-traversam');
    expect(changed).not.toBe(original);
    expect(Buffer.byteLength(changed)).toBe(Buffer.byteLength(original));
    if (path === 'package.json') expect(JSON.parse(changed)).toBeDefined();
    await writeFile(join(prepared.root, path), changed);
    await modes(prepared.root);
    await git(prepared.root, 'add', '.');
    await git(
      prepared.root,
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'same length frontend drift',
    );
    await modes(prepared.root);
    expect(await git(prepared.root, 'status', '--porcelain')).toBe('');
    const sha = await git(prepared.root, 'rev-parse', 'HEAD');
    const captured = await createSourceStartupManifest(prepared.root, sha, configuration);
    const decoded = canonical(captured.manifest);
    expect(() => selectSourceFrontendProfile(decoded)).toThrow(
      'source frontend input profile unsupported',
    );
  },
  30000,
);

test.each(['package.json', 'bun.lock'] as const)(
  'materializer fixed-root boundary refuses mixed historical %s before copying',
  async (path) => {
    const root = await mkdtemp(join(tmpdir(), 'frontend-materializer-boundary-'));
    roots.push(root);
    await prepareSourceFrontendProfile(root);
    const historical = reconstructHistoricalInput(path, await readFile(join(root, path)));
    await writeFile(join(root, path), historical);
    const source = await readFile(
      resolve(import.meta.dir, '../fixtures/source-frontend-profile.ts'),
    );
    const copied = join(root, 'tools/tool-remote-scripts/src/fixtures/source-frontend-profile.ts');
    await mkdir(dirname(copied), { recursive: true });
    await writeFile(copied, source);
    expect(await readFile(copied)).toEqual(source);
    const destination = join(root, 'destination');
    await rejects(access(destination), { code: 'ENOENT' });
    console.error(
      JSON.stringify({
        boundary: 'materializer',
        root,
        destination,
        copied,
        sha256: createHash('sha256').update(source).digest('hex'),
        fault: path,
      }),
    );
    // The owned module bytes equal the known materializer above; only its fixed ROOT differs.
    const materializer = (await import(copied)) as typeof MaterializerModule;
    await rejects(
      materializer.prepareSourceFrontendProfile(destination),
      /frontend fixture inputs unsupported/,
    );
    await rejects(access(destination), { code: 'ENOENT' });
  },
  30000,
);
const HISTORICAL_REMOVALS = {
  'package.json': ['    "configurable-tree-traversal": "0.12.0",\n'],
  'bun.lock': [
    '        "configurable-tree-traversal": "0.12.0",\n',
    '    "configurable-tree-traversal": ["configurable-tree-traversal@0.12.0", "", { "dependencies": { "uuid": "^14.0.3" } }, "sha512-AsAFLmDPdtEvYZ0sQPIgavYba8SKUgLqS+snyW0DlPE7wwYuXguj+UdvQRgbfPRvjWHVowFxaBowDX2otO+rlQ=="],\n\n',
    '    "configurable-tree-traversal/uuid": ["uuid@14.0.3", "", { "bin": { "uuid": "dist-node/bin/uuid" } }, "sha512-Sc5u1VVln93y1Xnz4R+CunOZc7R9LUcTmhj7Rc7Eg3HVcf7rVn2FOoa812fe0W8p3jD7xeoGSYbfqCGGH2B6xw=="],\n\n',
  ],
};

function reconstructHistoricalInput(path: 'package.json' | 'bun.lock', bytes: Uint8Array): Buffer {
  const current = PAIRS.at(1),
    historical = PAIRS.at(0);
  if (current === undefined || historical === undefined)
    throw new Error('independent pair expectations absent');
  expect({
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }).toEqual(current[path]);
  // Exact reviewed CTT additions are removed only for owned negative inputs, avoiding CI shallow-history dependence.
  let contents = Buffer.from(bytes).toString('utf8');
  for (const hunk of HISTORICAL_REMOVALS[path]) {
    expect(contents.split(hunk).length - 1).toBe(1);
    contents = contents.replace(hunk, '');
  }
  const reconstructed = Buffer.from(contents);
  expect({
    bytes: reconstructed.byteLength,
    sha256: createHash('sha256').update(reconstructed).digest('hex'),
  }).toEqual(historical[path]);
  return reconstructed;
}
