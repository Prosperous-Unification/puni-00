import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { copyProject, synchronizeBaseline, verifyBaseline } from './portability';

const roots: string[] = [];
const portableFiles = [
  'tools/workspace/portability.ts',
  'tools/workspace/portability.test.ts',
  'tools/workspace/project.json',
  'tools/workspace/tsconfig.json',
  'tools/workspace/eslint.portable.mjs',
  'tools/workspace/prettier.portable.json',
];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function json(path: string, fields: unknown) {
  writeFileSync(path, JSON.stringify(fields));
}
function parseJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
interface CompilerConfig {
  compilerOptions: { paths: Record<string, string[]> };
}
function workspace(visibility: 'public' | 'private') {
  const root = mkdtempSync(join(tmpdir(), 'puni-copy-'));
  roots.push(root);
  json(join(root, 'package.json'), {
    private: true,
    packageManager: 'bun@1.4.2',
    devDependencies: {
      nx: '23.2.0',
      typescript: 'npm:@typescript/typescript6@6.0.2',
      'bun-types': '1.4.2',
      prettier: '3.9.6',
      eslint: '10.10.0',
      '@eslint/js': '10.0.1',
      'typescript-eslint': '8.69.0',
    },
  });
  json(join(root, 'nx.json'), {
    targetDefaults: {
      build: { cache: true, dependsOn: ['^build'] },
      test: { cache: true },
      lint: { cache: true },
      typecheck: { cache: true },
    },
  });
  json(join(root, 'tsconfig.base.json'), {
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      paths: {},
    },
  });
  json(join(root, 'workspace.portability.json'), { version: 1, visibility });
  mkdirSync(join(root, 'tools/workspace'), { recursive: true });
  for (const path of portableFiles) writeFileSync(join(root, path), `${visibility}:${path}`);
  return root;
}
function project(
  root: string,
  path: string,
  dependencies: string[] = [],
  visibility = 'public',
  aliases: string[] = [],
) {
  mkdirSync(join(root, path), { recursive: true });
  const segments = path.split('/');
  const library = segments[0] === 'libs';
  const name = `${segments[1] ?? ''}-${segments.at(-1) ?? ''}`;
  json(join(root, path, 'project.json'), {
    name,
    tags: [
      library ? 'scope:shared' : 'scope:app',
      `ring:${library && segments[2] !== 'adapters' ? segments[2] : 'adapter'}`,
      'runtime:isomorphic',
      `product:${segments[1] ?? ''}`,
    ],
    metadata: { portability: { visibility, dependencies, aliases } },
    targets: Object.fromEntries(
      ['test', 'lint', 'typecheck', 'build'].map((target) => [
        target,
        { command: `bun run ${path}/${target}.ts` },
      ]),
    ),
  });
  writeFileSync(join(root, path, 'source.ts'), 'export const greeting = "Hello";\n');
}
function pair() {
  const source = workspace('public');
  const destination = workspace('private');
  synchronizeBaseline(source, destination);
  return { source, destination };
}

test('same baseline and dependency closure transfer in both directions without path changes', () => {
  const { source, destination } = pair();
  project(source, 'libs/fixture/domain/core');
  project(source, 'apps/fixture/client', ['libs/fixture/domain/core']);
  expect(copyProject(source, destination, 'apps/fixture/client')).toEqual([
    'libs/fixture/domain/core',
    'apps/fixture/client',
  ]);
  const returning = workspace('public');
  synchronizeBaseline(source, returning);
  copyProject(destination, returning, 'apps/fixture/client');
  expect(readFileSync(join(returning, 'apps/fixture/client/source.ts'), 'utf8')).toBe(
    readFileSync(join(source, 'apps/fixture/client/source.ts'), 'utf8'),
  );
});

test('checked-in website fixture and its shared dependency copy into a clean workspace', () => {
  const source = join(import.meta.dir, '../..');
  const destination = workspace('private');
  synchronizeBaseline(source, destination);
  expect(copyProject(source, destination, 'libs/website/adapters/portability-fixture')).toEqual([
    'libs/shared/domain/portability-format',
    'libs/website/adapters/portability-fixture',
  ]);
  expect(
    readFileSync(join(destination, 'libs/website/adapters/portability-fixture/index.ts'), 'utf8'),
  ).toBe(readFileSync(join(source, 'libs/website/adapters/portability-fixture/index.ts'), 'utf8'));
});

test('invalid project namespace metadata is refused before copying', () => {
  const { source, destination } = pair();
  project(source, 'libs/fixture/domain/core');
  const manifest = parseJson(join(source, 'libs/fixture/domain/core/project.json')) as {
    tags: string[];
  };
  manifest.tags = manifest.tags.filter((tag) => !tag.startsWith('ring:'));
  json(join(source, 'libs/fixture/domain/core/project.json'), manifest);
  // Proof: removing the namespace guard allows a missing ring: tag and copies the malformed manifest.
  expect(() => copyProject(source, destination, 'libs/fixture/domain/core')).toThrow('ring:');
  expect(existsSync(join(destination, 'libs'))).toBe(false);
});

test('sync carries portable lint and tool files, and check detects content drift', () => {
  const source = workspace('public');
  const destination = workspace('private');
  synchronizeBaseline(source, destination);
  for (const path of portableFiles) {
    expect(readFileSync(join(destination, path), 'utf8')).toBe(
      readFileSync(join(source, path), 'utf8'),
    );
  }
  writeFileSync(join(destination, 'tools/workspace/eslint.portable.mjs'), 'changed lint policy');
  // Proof: omitting the file comparison changed this named failure into a receipt mismatch.
  expect(() => {
    verifyBaseline(source, destination);
  }).toThrow('files');
});

test('missing portable source blocks sync before changing destination', () => {
  const source = workspace('public');
  const destination = workspace('private');
  const before = readFileSync(join(destination, 'package.json'), 'utf8');
  rmSync(join(source, 'tools/workspace/eslint.portable.mjs'));
  // Proof: omitting the ESLint config from required files let sync accept its absence.
  expect(() => {
    synchronizeBaseline(source, destination);
  }).toThrow();
  expect(readFileSync(join(destination, 'package.json'), 'utf8')).toBe(before);
});

test('declared aliases transfer with their project and conflicting aliases refuse all writes', () => {
  const { source, destination } = pair();
  project(source, 'libs/fixture/domain/core', [], 'public', ['@fixture/core']);
  project(source, 'apps/fixture/client', ['libs/fixture/domain/core']);
  const sourceConfig = parseJson(join(source, 'tsconfig.base.json')) as CompilerConfig;
  sourceConfig.compilerOptions.paths['@fixture/core'] = ['./libs/fixture/domain/core/source.ts'];
  json(join(source, 'tsconfig.base.json'), sourceConfig);
  const destinationConfig = parseJson(join(destination, 'tsconfig.base.json')) as CompilerConfig;
  destinationConfig.compilerOptions.paths['@fixture/core'] = ['./libs/other/domain/core/source.ts'];
  json(join(destination, 'tsconfig.base.json'), destinationConfig);
  // Proof: removing alias collision admission copies the fixture despite the conflicting destination alias.
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow('alias collision');
  expect(existsSync(join(destination, 'libs'))).toBe(false);
  delete destinationConfig.compilerOptions.paths['@fixture/core'];
  json(join(destination, 'tsconfig.base.json'), destinationConfig);
  expect(copyProject(source, destination, 'apps/fixture/client')).toEqual([
    'libs/fixture/domain/core',
    'apps/fixture/client',
  ]);
  const copiedConfig = parseJson(join(destination, 'tsconfig.base.json')) as CompilerConfig;
  expect(copiedConfig.compilerOptions.paths['@fixture/core']).toEqual([
    './libs/fixture/domain/core/source.ts',
  ]);
});

test('changed dependency pin fails conformance before transfer', () => {
  const { source, destination } = pair();
  project(source, 'apps/fixture/client');
  const manifest = parseJson(join(destination, 'package.json')) as {
    devDependencies: Record<string, string>;
  };
  manifest.devDependencies['typescript'] = '5.9.3';
  json(join(destination, 'package.json'), manifest);
  expect(() => {
    verifyBaseline(source, destination);
  }).toThrow('typescript');
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow();
  expect(existsSync(join(destination, 'apps'))).toBe(false);
});

test('missing dependency and path collision cause no partial copy', () => {
  const { source, destination } = pair();
  project(source, 'apps/fixture/client', ['libs/fixture/domain/core']);
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow();
  expect(existsSync(join(destination, 'apps'))).toBe(false);
  project(source, 'libs/fixture/domain/core');
  project(destination, 'apps/fixture/client');
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow('collision');
  expect(existsSync(join(destination, 'libs'))).toBe(false);
});

test('restricted dependencies and Novaform paths refuse public promotion before copying bytes', () => {
  const source = workspace('private');
  const destination = workspace('public');
  synchronizeBaseline(source, destination);
  project(source, 'libs/fixture/domain/private', [], 'private');
  project(source, 'apps/fixture/client', ['libs/fixture/domain/private']);
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow('private');
  project(source, 'apps/website/site');
  expect(() => copyProject(source, destination, 'apps/website/site')).toThrow('private');
  expect(existsSync(join(destination, 'apps'))).toBe(false);
  expect(existsSync(join(destination, 'libs'))).toBe(false);
});

test('unknown classification, symlinks, private files and escaped project paths fail closed', () => {
  const { source, destination } = pair();
  project(source, 'apps/fixture/client', [], 'unknown');
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow();
  project(source, 'apps/fixture/client');
  symlinkSync('/etc/passwd', join(source, 'apps/fixture/client/escape'));
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow('symbolic');
  rmSync(join(source, 'apps/fixture/client/escape'));
  writeFileSync(join(source, 'apps/fixture/client/.env'), 'SECRET=do-not-copy');
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow('private file');
  expect(() => copyProject(source, destination, 'apps/../outside')).toThrow('path');
  expect(existsSync(join(destination, 'apps'))).toBe(false);
});

test('absent and malformed baseline state and changed Nx semantics are refused', () => {
  const { source, destination } = pair();
  const nx = parseJson(join(destination, 'nx.json')) as {
    targetDefaults: { build: { dependsOn: string[] } };
  };
  nx.targetDefaults.build.dependsOn = [];
  json(join(destination, 'nx.json'), nx);
  expect(() => {
    verifyBaseline(source, destination);
  }).toThrow('build');
  synchronizeBaseline(source, destination);
  rmSync(join(source, 'tsconfig.base.json'));
  expect(() => {
    synchronizeBaseline(source, destination);
  }).toThrow();
  writeFileSync(join(source, 'tsconfig.base.json'), '{broken');
  expect(() => {
    synchronizeBaseline(source, destination);
  }).toThrow();
});

test('missing receipt, invalid workspace policy and cyclic closure are refused', () => {
  const { source, destination } = pair();
  project(source, 'apps/fixture/client', ['libs/fixture/domain/core']);
  project(source, 'libs/fixture/domain/core', ['apps/fixture/client']);
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow('cycle');
  json(join(destination, 'workspace.portability.json'), { version: 1, visibility: 'unknown' });
  expect(() => copyProject(source, destination, 'apps/fixture/client')).toThrow('visibility');
  json(join(destination, 'workspace.portability.json'), { version: 1, visibility: 'private' });
  rmSync(join(destination, '.puni-baseline.json'));
  expect(() => {
    verifyBaseline(source, destination);
  }).toThrow();
});

test('unreadable trusted state is refused without mutating destination', () => {
  const { source, destination } = pair();
  const before = readFileSync(join(destination, 'package.json'), 'utf8');
  const inaccessible = join(source, 'tsconfig.base.json');
  chmodSync(inaccessible, 0);
  try {
    expect(() => {
      synchronizeBaseline(source, destination);
    }).toThrow();
  } finally {
    chmodSync(inaccessible, 0o600);
  }
  expect(readFileSync(join(destination, 'package.json'), 'utf8')).toBe(before);
});
