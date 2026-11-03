import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { afterAll, beforeAll, expect, test } from 'bun:test';

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
let manifest: SourceStartupManifest;
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
  manifest = (await createSourceStartupManifest(prepared.root, sha, configuration)).manifest;
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

test('fixed frontend selection accepts an independently prepared unrelated source commit with declared dependency links', () => {
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
      withViteTarget(root === 'source' ? '../frontend-vite' : '../.git/frontend-vite', additions),
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
    target: index === length - 2 ? '.frontend-profile/vite' : `frontend-link-${String(index + 1)}`,
  }));
  return withViteTarget('frontend-link-0', additions);
}
test('private frontend lookup accepts forty links and refuses the forty-first', () => {
  expect(selectSourceFrontendProfile(canonical(chain(40)))).toBe('wbs-source-frontend-wire-v1');
  expect(() => selectSourceFrontendProfile(chain(41))).toThrow(
    'source frontend input profile unsupported',
  );
});
