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
  {
    epoch: 'fresh-main-20261104',
    'package.json': {
      bytes: 4992,
      sha256: '6482624ce19f7d9ea6cd919328f839e3bb7bb8c48ae120a4f5c3104e9a87c381',
    },
    'bun.lock': {
      bytes: 534113,
      sha256: '129512f0a0fc719b814e7998353190f8827d96085f99000c418c6988ebbbb728',
    },
  },
  {
    epoch: 'fresh-main-20261105-ctt-0.13.0',
    'package.json': {
      bytes: 4992,
      sha256: '0b635ebde6513e9bce36d000bbd04fc3cc817ff49074af8e5e3219910a97f131',
    },
    'bun.lock': {
      bytes: 534113,
      sha256: '48b5cea4e2ac740d300f4e41cc705dfb5213210c4db378f8cdf65640fb695adb',
    },
  },
  {
    epoch: 'registry-s3-20261108',
    'package.json': {
      bytes: 5030,
      sha256: '275ef2c4c16de5cb045cbd9ef5d73b334b549a31be8b1d665eeab2c227e05caf',
    },
    'bun.lock': {
      bytes: 543082,
      sha256: '983e79b374f112b2be6971188d9ad3e8cdfec29f50c0340fa23b62dafc28c9c6',
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
        pair.epoch === 'registry-s3-20261108'
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

for (const historical of PAIRS.slice(0, -1))
  test.each(['package.json', 'bun.lock'] as const)(
    `mixed frontend pair refuses ${historical.epoch} %s alone`,
    (path) => {
      const expected = historical[path];
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

for (const historical of PAIRS.slice(0, -1))
  test.each(['package.json', 'bun.lock'] as const)(
    `mixed frontend pair refuses current ${historical.epoch} %s alone`,
    (path) => {
      const currentPair = PAIRS.at(-1);
      if (currentPair === undefined) throw new Error('current pair expectation absent');
      const historicalEntries = current.entries.map((entry) => {
        if (entry.root !== 'source' || entry.kind !== 'file') return entry;
        if (entry.path !== 'package.json' && entry.path !== 'bun.lock') return entry;
        const expected = entry.path === path ? currentPair[path] : historical[entry.path];
        return { ...entry, size: expected.bytes, sha256: expected.sha256 };
      });
      expect(() =>
        selectSourceFrontendProfile(canonical({ ...current, entries: historicalEntries })),
      ).toThrow('source frontend input profile unsupported');
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
        ? original.replace('"name": "@puni-mono/workspace"', '"name": "@puni-mono/workspacf"')
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

test.each([
  ['before-ctt', 'package.json'],
  ['before-ctt', 'bun.lock'],
  ['fourth', 'package.json'],
  ['fourth', 'bun.lock'],
] as const)(
  'materializer fixed-root boundary refuses mixed %s %s before copying',
  async (epoch, path) => {
    const root = await mkdtemp(join(tmpdir(), 'frontend-materializer-boundary-'));
    roots.push(root);
    await prepareSourceFrontendProfile(root);
    const bytes = await readFile(join(root, path));
    const historical =
      epoch === 'fourth'
        ? reconstructFourthInput(path, bytes)
        : reconstructHistoricalInput(path, bytes);
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
const REGISTRY_REMOVALS = {
  'package.json': ['    "@aws-sdk/client-s3": "3.1161.0",\n'],
  'bun.lock': [
    '        "@aws-sdk/client-s3": "3.1161.0",\n',
    '    "@aws-sdk/checksums": ["@aws-sdk/checksums@3.1002.1", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-CXNESwkQC9jdrUG6cKXBfudVt1frGcYQykcCYbNclVrsewuGMbo3PlFjRteMe4OftNAqhyc3xC2jTz7SUqLasQ=="],\n\n    "@aws-sdk/client-s3": ["@aws-sdk/client-s3@3.1161.0", "", { "dependencies": { "@aws-sdk/checksums": "^3.1002.1", "@aws-sdk/core": "^3.979.1", "@aws-sdk/credential-provider-node": "^3.972.92", "@aws-sdk/middleware-sdk-s3": "^3.972.85", "@aws-sdk/signature-v4-multi-region": "^3.996.51", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/fetch-http-handler": "^5.8.0", "@smithy/node-http-handler": "^4.14.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-iRZGMsJnYRrI98O+U6o5fHeLPQTP+Dc/w0mWLcBLQcEQ10DA06+XQj0WmdRiCM7vIso7QEtN1fsj9Vzo5/R3LQ=="],\n\n    "@aws-sdk/core": ["@aws-sdk/core@3.979.1", "", { "dependencies": { "@aws-sdk/types": "^3.975.0", "@aws-sdk/xml-builder": "^3.972.42", "@aws/lambda-invoke-store": "^0.3.0", "@smithy/core": "^3.38.0", "@smithy/signature-v4": "^5.7.5", "@smithy/types": "^4.19.0", "bowser": "^2.11.0", "tslib": "^2.6.2" } }, "sha512-ayOlV1VhLNMiq8PW9ZkVobG4gkldnUoHjG69yy2b8j+VYFlhz/uAL7ZdYQAoQ+eShtGUdNDnnG5rxDg6yUJrOg=="],\n\n    "@aws-sdk/credential-provider-env": ["@aws-sdk/credential-provider-env@3.972.80", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-uO5TiSvb6j1w9RTe5z28OaOmsrOxVQUPaC5+wZl50RfOXcrYD/KgnS8I9lfyGXc7sGbkCopK6VnhNIAoLqfewQ=="],\n\n    "@aws-sdk/credential-provider-http": ["@aws-sdk/credential-provider-http@3.972.82", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/fetch-http-handler": "^5.8.0", "@smithy/node-http-handler": "^4.14.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-vQzlDHlC24Yz42p+rT4NBoP/5VdetkBoujbOLq9h6QYWC8THuZSPYnXIR9OP3XcOrdMgPBBipOrdssfxnIiWUg=="],\n\n    "@aws-sdk/credential-provider-ini": ["@aws-sdk/credential-provider-ini@3.973.25", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/credential-provider-env": "^3.972.80", "@aws-sdk/credential-provider-http": "^3.972.82", "@aws-sdk/credential-provider-login": "^3.972.87", "@aws-sdk/credential-provider-process": "^3.972.80", "@aws-sdk/credential-provider-sso": "^3.973.24", "@aws-sdk/credential-provider-web-identity": "^3.972.86", "@aws-sdk/nested-clients": "^3.997.54", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/credential-provider-imds": "^4.5.2", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-b5xl71uCRdWsu7P1VeGpiGuCf6zfYETsSNOv8AmYVTrsgbvTJRXdmmOPVfxkvGGVNsiKkGctClQW3jAn0SZLug=="],\n\n    "@aws-sdk/credential-provider-login": ["@aws-sdk/credential-provider-login@3.972.87", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/nested-clients": "^3.997.54", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-C4ZFmcwM+Zj14Z8huVUk54Gv4uzT1ZdzG9cY3Gdh8FePakq7Bss1OFsgZjAhWFOkFOGpBvFBeu0OWjWf8HNKRQ=="],\n\n    "@aws-sdk/credential-provider-node": ["@aws-sdk/credential-provider-node@3.972.92", "", { "dependencies": { "@aws-sdk/credential-provider-env": "^3.972.80", "@aws-sdk/credential-provider-http": "^3.972.82", "@aws-sdk/credential-provider-ini": "^3.973.25", "@aws-sdk/credential-provider-process": "^3.972.80", "@aws-sdk/credential-provider-sso": "^3.973.24", "@aws-sdk/credential-provider-web-identity": "^3.972.86", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/credential-provider-imds": "^4.5.2", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-jC3zmOo7Qxlk+oBivvSsS1Ph7sFGm0QfuhqDGbqgRXi4cxUYMG+dWtBwS2XYYXgc8TIVXJiwgQ65sbNpbYupTA=="],\n\n    "@aws-sdk/credential-provider-process": ["@aws-sdk/credential-provider-process@3.972.80", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-xqfixO5aclje7tbQJDias+iNND5wp/3QZixCdZcVQpgWPTZ0V5DfTW9A804A5Z7ezu7sH3WRO+vzUjtiJBA8yg=="],\n\n    "@aws-sdk/credential-provider-sso": ["@aws-sdk/credential-provider-sso@3.973.24", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/nested-clients": "^3.997.54", "@aws-sdk/token-providers": "3.1161.0", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-nlg3BKG03Cgzvv/dMnhxvDJPhAhQSpaN0RUdwgU7ziwkasoev7iI8el8Xy4Rd5sqzgaDUbV269fOXck5SargqA=="],\n\n    "@aws-sdk/credential-provider-web-identity": ["@aws-sdk/credential-provider-web-identity@3.972.86", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/nested-clients": "^3.997.54", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-zKTyLJBEyfQBVlYqT6Jt+mYV4r8kGbWM7dn6v4Y4MRARizhYafjDXP/iMu76UMRhToSPNmIKX1XAb24gtpBFIA=="],\n\n    "@aws-sdk/middleware-sdk-s3": ["@aws-sdk/middleware-sdk-s3@3.972.85", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/signature-v4-multi-region": "^3.996.51", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-Kyl2G6zhIS9qFoeLdlxvXFrWyc6g9D9ZCIRJnGkkfX6JZhxCZB5ebXBc7GKEeetrnhXcail6ALZT0lKbojcaNA=="],\n\n    "@aws-sdk/nested-clients": ["@aws-sdk/nested-clients@3.997.54", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/signature-v4-multi-region": "^3.996.51", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/fetch-http-handler": "^5.8.0", "@smithy/node-http-handler": "^4.14.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-/OczlavsS7U5sOodRO10Ug4R/AKFVZiXTstKipWe68EfjPkmdDFNXNl9FCJyXWkg1DG6RBm3qAuVB8FNW9O8KQ=="],\n\n    "@aws-sdk/signature-v4-multi-region": ["@aws-sdk/signature-v4-multi-region@3.996.51", "", { "dependencies": { "@aws-sdk/types": "^3.975.0", "@smithy/signature-v4": "^5.7.5", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-+aHvUugVBuMPXxgkPfWnTMyGdE/yWS8GHi5+qQ37HowS0YqzrbuaDLznj+Dtmtu5jgCdqz36gXmujOToUhNNWw=="],\n\n    "@aws-sdk/token-providers": ["@aws-sdk/token-providers@3.1161.0", "", { "dependencies": { "@aws-sdk/core": "^3.979.1", "@aws-sdk/nested-clients": "^3.997.54", "@aws-sdk/types": "^3.975.0", "@smithy/core": "^3.38.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-ypbXSofNcSHwf/KA40bFCXJb0MLaAKrfT7sot4dFaA+2lsuXNah4zLRJIAU7Qmvs9PFJ6rnY0bZFEC+mE7attA=="],\n\n    "@aws-sdk/types": ["@aws-sdk/types@3.975.0", "", { "dependencies": { "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-WQlhs6juByzWOzj5fwxOx0mPJaEqMcG/sDpl3Id61B3XhKE63xY+0QWcnG+sWR/sCfprmreyUo1lM7IKZmHMzw=="],\n\n    "@aws-sdk/xml-builder": ["@aws-sdk/xml-builder@3.972.42", "", { "dependencies": { "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-smX8/gNP8Kjq+CWTBMZQLQ912vOQjiWExzwzvMO+eujPB5RY8IbtF0AGdUUXHKN7KoDWK9dIcuW0WG269kiP6w=="],\n\n    "@aws/lambda-invoke-store": ["@aws/lambda-invoke-store@0.3.0", "", {}, "sha512-sl4Bm6yiMNYrZKkqqDFWN0UfnWhlS8ivKxrYl+6t0gCLrqr8y3B2IqZZbFRkfaVVp7C/baApyh71P+LeE1A2sQ=="],\n\n',
    '    "@smithy/core": ["@smithy/core@3.38.1", "", { "dependencies": { "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-U/mB2XiwTLaf+NSgLSWwJfptsMT/H8aBi0aTAA/E5e2/TagFeGCqAyhKGG0w0A9IWTkm4qYEmLoD/HB6aYfnRA=="],\n\n    "@smithy/credential-provider-imds": ["@smithy/credential-provider-imds@4.5.2", "", { "dependencies": { "@smithy/core": "^3.33.2", "@smithy/types": "^4.17.2", "tslib": "^2.6.2" } }, "sha512-A9uSdn72ozbRUSit0eib0TW7nXuNPlaeM0zcGkJ+nE6tFcSDbnmtwoxbTCFBukVQcszDAyvsd7+rTduPTXpygg=="],\n\n    "@smithy/fetch-http-handler": ["@smithy/fetch-http-handler@5.8.0", "", { "dependencies": { "@smithy/core": "^3.33.3", "@smithy/types": "^4.18.0", "tslib": "^2.6.2" } }, "sha512-ycSJu3tFAQ4v04CBB0agqFMVsSQ1iG3yw+SpgxRqKfaURpQD4CZ8Wn0zPMmSnOuTpTh65Vz+EA0rMrw089wvkA=="],\n\n    "@smithy/node-http-handler": ["@smithy/node-http-handler@4.14.1", "", { "dependencies": { "@smithy/core": "^3.38.1", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-/T6E1jzCL0fErS9uq8JqES/5yYQQ4ppVmmYHwXw2nlov8KFzLb+3QqHR5iAun1BsuAB50IPxZliV8YMgghLwhA=="],\n\n    "@smithy/signature-v4": ["@smithy/signature-v4@5.7.5", "", { "dependencies": { "@smithy/core": "^3.38.0", "@smithy/types": "^4.19.0", "tslib": "^2.6.2" } }, "sha512-WPjdr5oWOk1LArpI4pavu+fSo+/evi0Re1olxGvqwuZopd4gYR1UGCi+Soyn/IjmafqbWs+ZC+3AKxJS3ZpwUg=="],\n\n    "@smithy/types": ["@smithy/types@4.19.0", "", { "dependencies": { "tslib": "^2.6.2" } }, "sha512-r7jh49VJxGerfAcTQA6gXcKc+98zOp/tqRwzYjgOE+iSQsP6cEU1hq2QzbuipmP68QtYdY9wKEhiCQZIzHgZ4Q=="],\n\n',
    '    "bowser": ["bowser@2.15.0", "", {}, "sha512-xic6KSZglg/I4ymp45fdM4GWfYpBK79Fxd/TOvJktlaPgQqqDxvmGwOPZl2V0dyeS3Lj5c180bLhXF43iyAjZQ=="],\n\n',
  ],
} as const;

/** Reverses only literal S3 hunks from the exact fifth input into the exact fourth pair; alternate hunk lists are solely malformed test dependencies. */
function reconstructFourthInput(
  path: 'package.json' | 'bun.lock',
  bytes: Uint8Array,
  removals: readonly string[] = REGISTRY_REMOVALS[path],
): Buffer {
  const fifth = PAIRS.at(4);
  const fourth = PAIRS.at(3);
  if (fifth === undefined || fourth === undefined)
    throw new Error('independent registry pair expectations absent');
  // Proof: omitting this guard admits repairable unreviewed input at this helper; its named original-input negative failed.
  if (
    bytes.byteLength !== fifth[path].bytes ||
    createHash('sha256').update(bytes).digest('hex') !== fifth[path].sha256
  )
    throw new Error('registry S3 original input differs');
  let contents = Buffer.from(bytes).toString('utf8');
  for (const hunk of removals) {
    // Proof: omitting uniqueness admits an absent declared hunk at this helper; its named absent-hunk negative failed.
    if (contents.split(hunk).length - 1 !== 1)
      throw new Error('registry S3 reversal hunk is not unique');
    contents = contents.replace(hunk, '');
  }
  const reconstructed = Buffer.from(contents);
  // Proof: omitting this guard returns an unreversed fifth input at this helper; its named missing-intermediate negative failed.
  if (
    reconstructed.byteLength !== fourth[path].bytes ||
    createHash('sha256').update(reconstructed).digest('hex') !== fourth[path].sha256
  )
    throw new Error('registry S3 fourth intermediate differs');
  return reconstructed;
}

for (const path of ['package.json', 'bun.lock'] as const) {
  test(`registry S3 reconstruction reaches exact fourth ${path}`, async () => {
    const bytes = await readFile(resolve(import.meta.dir, '../../../..', path));
    const reconstructed = reconstructFourthInput(path, bytes);
    const expected = PAIRS.at(3);
    if (expected === undefined) throw new Error('fourth pair expectation absent');
    expect({
      bytes: reconstructed.byteLength,
      sha256: createHash('sha256').update(reconstructed).digest('hex'),
    }).toEqual(expected[path]);
  });
  test(`registry S3 reconstruction refuses repairable unreviewed full ${path}`, async () => {
    const bytes = await readFile(resolve(import.meta.dir, '../../../..', path));
    const extra = 'UNREVIEWED_REGISTRY_INPUT\n';
    expect(() =>
      reconstructFourthInput(path, Buffer.concat([bytes, Buffer.from(extra)]), [
        ...REGISTRY_REMOVALS[path],
        extra,
      ]),
    ).toThrow('registry S3 original input differs');
  });
  for (const fault of ['absent', 'duplicate', 'empty'] as const)
    test(`registry S3 reconstruction refuses ${fault} hunk in ${path}`, async () => {
      const bytes = await readFile(resolve(import.meta.dir, '../../../..', path));
      const first = REGISTRY_REMOVALS[path].at(0);
      if (first === undefined) throw new Error('literal registry hunk absent');
      const extra =
        fault === 'absent' ? 'UNREVIEWED_ABSENT_HUNK\n' : fault === 'duplicate' ? first : '';
      expect(() =>
        reconstructFourthInput(path, bytes, [...REGISTRY_REMOVALS[path], extra]),
      ).toThrow('registry S3 reversal hunk is not unique');
    });
  for (const fault of ['missing', 'changed'] as const)
    test(`registry S3 reconstruction refuses ${fault} fourth intermediate in ${path}`, async () => {
      const bytes = await readFile(resolve(import.meta.dir, '../../../..', path));
      const hunks = REGISTRY_REMOVALS[path];
      const changed =
        fault === 'missing'
          ? hunks.slice(1)
          : hunks.map((hunk, index) => (index === 0 ? hunk.slice(0, -1) : hunk));
      expect(() => reconstructFourthInput(path, bytes, changed)).toThrow(
        'registry S3 fourth intermediate differs',
      );
    });
}

/** Reverses only the exact current CTT pin and resolved lock identity before older private-pair hunks. */
const CURRENT_REVERSALS = {
  'package.json': [
    [
      '    "configurable-tree-traversal": "0.13.0",\n',
      '    "configurable-tree-traversal": "0.12.0",\n',
    ],
  ],
  'bun.lock': [
    [
      '        "configurable-tree-traversal": "0.13.0",\n',
      '        "configurable-tree-traversal": "0.12.0",\n',
    ],
    [
      '    "configurable-tree-traversal": ["configurable-tree-traversal@0.13.0", "", { "dependencies": { "uuid": "^14.0.3" } }, "sha512-7bEo36spuSbjIvDflzcr+DrZ9MQhZeYHRPW72rtQuL0KfgD5VGzIEMENLsgVTkn+JzqXIT/7qvl+J3Lbbl8vNA=="],\n',
      '    "configurable-tree-traversal": ["configurable-tree-traversal@0.12.0", "", { "dependencies": { "uuid": "^14.0.3" } }, "sha512-AsAFLmDPdtEvYZ0sQPIgavYba8SKUgLqS+snyW0DlPE7wwYuXguj+UdvQRgbfPRvjWHVowFxaBowDX2otO+rlQ=="],\n',
    ],
  ],
} as const;

/** Exact reverse of the pinned older fresh-main package/lock changes; no Git history is read. */
const HISTORICAL_REVERSALS = {
  'package.json': [
    ['  "name": "@puni-mono/workspace",\n', '  "name": "@puni/workspace",\n'],
    [
      '    "test:queued": "bin/test-queued.sh",\n',
      '    "test:queued": "bin/with-heavy-lock.sh -- nx run-many -t test",\n',
    ],
    ['    "@optique/core": "1.3.6",\n    "@optique/run": "1.3.6",\n', ''],
    ['    "application-exception": "0.9.0",\n', '    "application-exception": "0.7.0",\n'],
    [
      '    "caught-object-report-json": "15.0.0",\n',
      '    "caught-object-report-json": "13.0.0",\n',
    ],
    ['    "di-bag": "0.5.2",\n', '    "di-bag": "0.5.1",\n'],
    ['    "mmdb-lib": "3.0.3",\n', ''],
  ],
  'bun.lock': [
    ['        "@optique/core": "1.3.6",\n        "@optique/run": "1.3.6",\n', ''],
    ['        "application-exception": "0.9.0",\n', '        "application-exception": "0.7.0",\n'],
    [
      '        "caught-object-report-json": "15.0.0",\n',
      '        "caught-object-report-json": "13.0.0",\n',
    ],
    ['        "di-bag": "0.5.2",\n', '        "di-bag": "0.5.1",\n'],
    ['        "mmdb-lib": "3.0.3",\n', ''],
    [
      '    "@optique/core": ["@optique/core@1.3.6", "", {}, "sha512-BXVuVyxP9bg8FbyvBYrSHisnAeG3XTf1xcuUjAWgDWKfzZssMGbSrMdiv4tA+BK3+CrSo6no+uHWpiHh4HMKeg=="],\n\n    "@optique/run": ["@optique/run@1.3.6", "", { "dependencies": { "@optique/core": "1.3.6" } }, "sha512-uxlHO8vG/5ni1V+t+jdmYqiyYYY5uOevO/6U866oBpnlOxOGn2ZWIlPpDXAU3e5GRu4VecbeXoNff18yRDGoQw=="],\n\n',
      '',
    ],
    [
      '    "application-exception": ["application-exception@0.9.0", "", { "dependencies": { "caught-object-report-json": "^15.0.0", "nanoid": "^3.3.19" } }, "sha512-ly7CqHHmvqcQ2BnjdpX1wjEXi/jBBWy2ekBuDvkDOj3RlKeLC9zsU6e9pykFfIS/VzPHfhPGz0IXhOGHDcXesA=="],\n',
      '    "application-exception": ["application-exception@0.7.0", "", { "dependencies": { "caught-object-report-json": "^13.0.0", "nanoid": "^3.3.19" } }, "sha512-kxx0XcOZ2wDcW1/G/s9izPg5ESzuD2SzqAdbZ8wCVMibsGd9IRTvFBZYIi1Z3QGMnJJo41IGQ9/3dqJQ9j9RWA=="],\n',
    ],
    [
      '    "caught-object-report-json": ["caught-object-report-json@15.0.0", "", {}, "sha512-LUykHhgBgVLiIy4m3raMlIFrRH+LPvGUl4MqJHeVF3gryc21vtCJcCmC1vcH0fYqmEadrVkbhk/682YcjKkheg=="],\n',
      '    "caught-object-report-json": ["caught-object-report-json@13.0.0", "", {}, "sha512-iH0UiWMMlAcNWcCQUFH/fEexacjojkd2eXvVG/czarM7MsFLOKeTcmbZPa6X8aWtJh/EhmvstlKeEjfF5L+hAQ=="],\n',
    ],
    [
      '    "di-bag": ["di-bag@0.5.2", "", {}, "sha512-JzsbaXpNbRuYkGXaNwfPK+EmM2yR7lF7OVaXLFFnJN0K25lEGpr4Y2621pm/smYJyGp55yjhqwcAROJ5vLuWAQ=="],\n',
      '    "di-bag": ["di-bag@0.5.1", "", {}, "sha512-rzG0NI9/M+/F1lYDRs+Get/jqZ6+X3mKPqe96WgCDOa1CJrFY+5I1/T+Vfnw3ffEcLPy5YS9++tTksauLadw3w=="],\n',
    ],
    [
      '\n    "mmdb-lib": ["mmdb-lib@3.0.3", "", {}, "sha512-xQPoBXcNjjHiOvOraFBKtA++uNWF6aCVHL9dRKFXEov8eI3QJwtgiw3qApsonFT5SpoqsEVISUTg3HIDs2DiXw=="],\n',
      '',
    ],
  ],
} as const;

const HISTORICAL_REMOVALS = {
  'package.json': ['    "configurable-tree-traversal": "0.12.0",\n'],
  'bun.lock': [
    '        "configurable-tree-traversal": "0.12.0",\n',
    '    "configurable-tree-traversal": ["configurable-tree-traversal@0.12.0", "", { "dependencies": { "uuid": "^14.0.3" } }, "sha512-AsAFLmDPdtEvYZ0sQPIgavYba8SKUgLqS+snyW0DlPE7wwYuXguj+UdvQRgbfPRvjWHVowFxaBowDX2otO+rlQ=="],\n\n',
    '    "configurable-tree-traversal/uuid": ["uuid@14.0.3", "", { "bin": { "uuid": "dist-node/bin/uuid" } }, "sha512-Sc5u1VVln93y1Xnz4R+CunOZc7R9LUcTmhj7Rc7Eg3HVcf7rVn2FOoa812fe0W8p3jD7xeoGSYbfqCGGH2B6xw=="],\n\n',
  ],
};

function reconstructHistoricalInput(path: 'package.json' | 'bun.lock', bytes: Uint8Array): Buffer {
  bytes = reconstructFourthInput(path, bytes);
  const fourth = PAIRS.at(3);
  const previous = PAIRS.at(2);
  const ctt = PAIRS.at(1);
  const historical = PAIRS.at(0);
  if (
    fourth === undefined ||
    previous === undefined ||
    ctt === undefined ||
    historical === undefined
  )
    throw new Error('independent pair expectations absent');
  expect({
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }).toEqual(fourth[path]);
  // Every exact current hunk occurs once before the complete older-main identity is accepted.
  let contents = Buffer.from(bytes).toString('utf8');
  for (const [present, prior] of CURRENT_REVERSALS[path]) {
    expect(contents.split(present).length - 1).toBe(1);
    contents = contents.replace(present, prior);
  }
  expect({
    bytes: Buffer.byteLength(contents),
    sha256: createHash('sha256').update(contents).digest('hex'),
  }).toEqual(previous[path]);
  // Restore the exact reviewed private pair with pinned literal reverse hunks.
  // Each hunk must occur once; the intermediate hash proves no other bytes changed.
  for (const [present, prior] of HISTORICAL_REVERSALS[path]) {
    expect(contents.split(present).length - 1).toBe(1);
    contents = contents.replace(present, prior);
  }
  const cttBytes = Buffer.from(contents);
  expect({
    bytes: cttBytes.byteLength,
    sha256: createHash('sha256').update(cttBytes).digest('hex'),
  }).toEqual(ctt[path]);
  // Exact reviewed CTT additions are removed only for owned negative inputs.
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
