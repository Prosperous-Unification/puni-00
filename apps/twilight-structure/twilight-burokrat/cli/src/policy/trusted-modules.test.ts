import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { copyTrustedModules, trustedDeclarationRoots, trustedModuleNames } from './trusted-modules';

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'trusted-declaration-closure-'));
  roots.push(root);
  for (const name of trustedDeclarationRoots) manifest(root, name);
  return root;
}

function manifest(root: string, name: string, dependencies: Record<string, string> = {}): void {
  const path = join(root, name, 'package.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ name, dependencies }));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test('walks nested dependency instances from their own manifests and preserves their topology', () => {
  const root = fixture();
  manifest(root, 'typescript', { vendor: '1' });
  manifest(root, 'vendor', { shared: '2' });
  manifest(root, 'shared', { decoy: '1' });
  manifest(root, 'decoy');
  manifest(root, 'vendor/node_modules/shared', { leaf: '1' });
  manifest(root, 'vendor/node_modules/leaf');
  manifest(root, 'vendor/node_modules/unrelated');
  const names = trustedModuleNames(root);
  expect(names).toEqual(
    [
      ...trustedDeclarationRoots,
      'vendor',
      'vendor/node_modules/leaf',
      'vendor/node_modules/shared',
    ].sort(),
  );
  const copied = fixture();
  copyTrustedModules(copied, root, names);
  expect(
    JSON.parse(readFileSync(join(copied, 'vendor/node_modules/shared/package.json'), 'utf8')),
  ).toMatchObject({ dependencies: { leaf: '1' } });
  expect(() => readFileSync(join(copied, 'vendor/node_modules/unrelated/package.json'))).toThrow();
  expect(() => readFileSync(join(copied, 'shared/package.json'))).toThrow();
});

test('refuses a nested-only dependency missing from the installed closure despite ancestor decoys', () => {
  const parent = fixture();
  const root = join(parent, 'project/node_modules');
  for (const name of trustedDeclarationRoots) manifest(root, name);
  manifest(root, 'typescript', { vendor: '1' });
  manifest(root, 'vendor', { absent: '1' });
  manifest(join(parent, 'node_modules'), 'absent');
  expect(() => trustedModuleNames(root)).toThrow(join(root, 'absent'));
});

test.each([
  ['null', 'manifest is malformed'],
  ['[]', 'manifest is malformed'],
  ['{"dependencies":null}', 'dependencies are malformed'],
  ['{"dependencies":[]}', 'dependencies are malformed'],
  ['{"dependencies":{"../../escape":"1"}}', 'dependency is malformed'],
  ['{"dependencies":{"vendor":42}}', 'dependency is malformed'],
])('refuses malformed trusted manifests: %s', (bytes, diagnostic) => {
  const root = fixture();
  manifest(root, 'typescript');
  writeFileSync(join(root, 'typescript/package.json'), bytes);
  expect(() => trustedModuleNames(root)).toThrow(diagnostic);
});

test('refuses an absent required dependency manifest', () => {
  const root = fixture();
  manifest(root, 'typescript', { vendor: '1' });
  mkdirSync(join(root, 'vendor'));
  expect(() => trustedModuleNames(root)).toThrow('package.json');
});

test('refuses an unreadable required dependency manifest', () => {
  const root = fixture();
  manifest(root, 'typescript', { vendor: '1' });
  manifest(root, 'vendor');
  const path = join(root, 'vendor/package.json');
  chmodSync(path, 0);
  try {
    expect(() => trustedModuleNames(root)).toThrow('EACCES');
  } finally {
    chmodSync(path, 0o644);
  }
});

test('the release closure includes the reviewed supported declaration roots and nested Ark instances', () => {
  const modules = join(import.meta.dir, '../../../../../../node_modules');
  const names = trustedModuleNames(modules);
  for (const name of [
    'arktype',
    'elysia',
    'drizzle-orm',
    'dns-packet',
    '@types/dns-packet',
    '@leichtgewicht/ip-codec',
    'yaml',
    'bun-types',
    '@types/react',
    '@types/react-dom',
    'arktype/node_modules/@ark/schema',
    'arktype/node_modules/@ark/util',
  ])
    expect(names).toContain(name);
});

test('canonical release copies omit metadata that Bun pack cannot transport', () => {
  const root = fixture();
  writeFileSync(join(root, 'elysia/bunfig.toml'), 'telemetry = false\n');
  manifest(root, 'isexe');
  manifest(root, 'typescript', { isexe: '1' });
  writeFileSync(join(root, 'typescript/bunfig.toml'), 'retained\n');
  writeFileSync(join(root, 'isexe/.npmignore'), 'private\n');
  writeFileSync(join(root, 'typescript/.npmignore'), 'retained\n');
  writeFileSync(join(root, 'typescript/retained.d.ts'), 'export interface Retained {}\n');
  const copied = fixture();
  copyTrustedModules(copied, root, trustedModuleNames(root));
  expect(() => readFileSync(join(copied, 'elysia/bunfig.toml'))).toThrow();
  expect(readFileSync(join(copied, 'typescript/bunfig.toml'), 'utf8')).toBe('retained\n');
  expect(() => readFileSync(join(copied, 'isexe/.npmignore'))).toThrow();
  expect(readFileSync(join(copied, 'typescript/.npmignore'), 'utf8')).toBe('retained\n');
  expect(readFileSync(join(copied, 'typescript/retained.d.ts'), 'utf8')).toBe(
    'export interface Retained {}\n',
  );
});

test('refuses an intermediate nested dependency directory symlink to ambient packages', () => {
  const root = fixture();
  const outside = fixture();
  manifest(root, 'typescript', { vendor: '1' });
  manifest(root, 'vendor', { external: '1' });
  manifest(outside, 'external');
  symlinkSync(outside, join(root, 'vendor/node_modules'));
  expect(() => trustedModuleNames(root)).toThrow('trusted node module is absent or a symlink');
});

test('refuses a scoped dependency directory symlink to ambient packages', () => {
  const root = fixture();
  const outside = fixture();
  manifest(root, 'typescript', { '@external/vendor': '1' });
  manifest(outside, 'vendor');
  symlinkSync(outside, join(root, '@external'));
  expect(() => trustedModuleNames(root)).toThrow('trusted node module is absent or a symlink');
});

test('DNS declaration roots retain only their declared transitive dependency instances', () => {
  expect(trustedDeclarationRoots).toContain('dns-packet');
  expect(trustedDeclarationRoots).toContain('@types/dns-packet');
  expect(trustedDeclarationRoots).not.toContain('@leichtgewicht/ip-codec');
  const root = fixture();
  manifest(root, 'dns-packet', { '@leichtgewicht/ip-codec': '2.0.3' });
  manifest(root, '@types/dns-packet', { '@types/node': '*' });
  manifest(root, '@leichtgewicht/ip-codec');
  manifest(root, '@types/node');
  manifest(root, 'unreviewed-candidate-package');
  expect(trustedModuleNames(root)).toEqual(
    [...trustedDeclarationRoots, '@leichtgewicht/ip-codec', '@types/node'].sort(),
  );
});
