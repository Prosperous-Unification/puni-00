import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

import { createTrustedSystem } from './trusted-files';
import { extractTypeScriptRelationships } from './typescript';
import { boundSource } from './typescript-compiler';
import { extractTypeScriptRelationshipsWithPolicy } from './typescript-core';
import { captureProject, reconstructProject } from './typescript-project';
import { writeSerialFixture } from './typescript-serial.test.fixture';

const trustedModules = realpathSync(
  dirname(dirname(Bun.resolveSync('typescript/package.json', import.meta.dir))),
);
type Request = Parameters<typeof extractTypeScriptRelationships>[1];
type Configure = (root: string, request: Request) => Request;

function compilerSource(system: ReturnType<typeof createTrustedSystem>) {
  return {
    compilerLibraryDirectory: system.compilerLibraryDirectory,
    useCaseSensitiveFileNames: system.useCaseSensitiveFileNames,
    pathKind: (path: string): 'directory' | 'file' | 'absent' =>
      system.directoryExists(path) ? 'directory' : system.fileExists(path) ? 'file' : 'absent',
    readFile: (path: string) => system.readFile(path),
    readDirectory: (
      path: string,
      extensions?: readonly string[],
      exclude?: readonly string[],
      include?: readonly string[],
      depth?: number,
    ) => system.readDirectory(path, extensions, exclude, include, depth),
    getDirectories: (path: string) => system.getDirectories(path),
    realpath: (path: string) => system.realpath(path),
    getCurrentDirectory: () => system.getCurrentDirectory(),
  };
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** The unchanged shared runner supplies predecessor observations on a separate immutable fixture. */
function observe(
  strategy: 'predecessor' | 'serial',
  configure: Configure,
  modules = trustedModules,
) {
  const root = mkdtempSync('/tmp/burokrat-serial-parity-');
  try {
    const request = configure(root, writeSerialFixture(root));
    if (strategy === 'serial')
      return { ok: true, report: extractTypeScriptRelationships(root, request, modules) };
    const system = createTrustedSystem(root, modules);
    return {
      ok: true,
      report: extractTypeScriptRelationshipsWithPolicy(root, request, compilerSource(system), {
        kind: 'legacy',
      }),
    };
  } catch (cause) {
    return {
      ok: false,
      message: (cause instanceof Error ? cause.message : String(cause)).replaceAll(
        root,
        '/candidate',
      ),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
    Bun.gc(true);
  }
}

function compare(configure: Configure, modules = trustedModules) {
  const predecessor = observe('predecessor', configure, modules);
  const serial = observe('serial', configure, modules);
  expect(serial).toEqual(predecessor);
  return serial;
}

test('serial reports preserve every selector and the unique explicit owner', () => {
  const observation = compare((_root, request) => request);
  expect(observation.ok).toBe(true);
  expect(observation.report?.relationships.imports).toHaveLength(1);
  expect(observation.report?.relationships.publicDeclarations[0]?.configPath).toBe(
    'config/provider.json',
  );
  expect(observation.report?.relationships.publicDeclarations[0]?.declarations).toEqual([
    {
      sourcePath: 'src/index.ts',
      emittedPath: 'src/index.d.ts',
      text: 'export declare const value = 1;\n',
    },
  ]);
});

test('later trusted package copies do not add roots to an earlier wildcard config', () => {
  const modules = mkdtempSync('/tmp/burokrat-serial-modules-');
  try {
    for (const name of ['typescript', '@typescript/old']) {
      mkdirSync(dirname(join(modules, name)), { recursive: true });
      cpSync(join(trustedModules, name), join(modules, name), {
        recursive: true,
        dereference: true,
      });
    }
    write(modules, '@fixture/later/package.json', '{"name":"@fixture/later","types":"index.d.ts"}');
    write(modules, '@fixture/later/index.d.ts', 'export interface Later { value: number; }\n');
    const observation = compare((root, request) => {
      write(
        root,
        'config/provider.json',
        JSON.stringify({
          extends: '../tsconfig.json',
          files: ['../globals.d.ts', '../src/index.ts'],
          include: ['../node_modules/@fixture/**/*.d.ts'],
          exclude: [],
        }),
      );
      write(
        root,
        'src/consumer.ts',
        "import type { Later } from '@fixture/later'; export const copied: Later = { value: 1 };\n",
      );
      return request;
    }, modules);
    expect(observation.ok).toBe(true);
    expect(observation.report?.relationships.publicDeclarations[0]?.configPath).toBe(
      'config/provider.json',
    );
  } finally {
    rmSync(modules, { recursive: true, force: true });
  }
});

test('reconstruction preserves transitive reference wildcard roots after package materialization', () => {
  const root = mkdtempSync('/tmp/burokrat-serial-references-');
  const modules = mkdtempSync('/tmp/burokrat-serial-reference-modules-');
  try {
    for (const name of ['typescript', '@typescript/old']) {
      mkdirSync(dirname(join(modules, name)), { recursive: true });
      cpSync(join(trustedModules, name), join(modules, name), {
        recursive: true,
        dereference: true,
      });
    }
    write(modules, '@fixture/later/package.json', '{"name":"@fixture/later","types":"index.d.ts"}');
    write(modules, '@fixture/later/index.d.ts', 'export interface Later { value: number; }\n');
    writeSerialFixture(root);
    write(
      root,
      'config/provider.json',
      JSON.stringify({
        extends: '../tsconfig.json',
        files: ['../globals.d.ts', '../src/index.ts'],
        references: [{ path: '../reference' }],
        include: [],
      }),
    );
    write(
      root,
      'reference/tsconfig.json',
      JSON.stringify({
        compilerOptions: { composite: true },
        files: ['../globals.d.ts'],
        references: [{ path: '../nested' }],
      }),
    );
    write(
      root,
      'nested/tsconfig.json',
      JSON.stringify({
        compilerOptions: { composite: true },
        files: ['../globals.d.ts'],
        include: ['../node_modules/@fixture/**/*.d.ts'],
        exclude: [],
      }),
    );
    const trusted = createTrustedSystem(root, modules);
    const system = boundSource(root, compilerSource(trusted), { kind: 'legacy' });
    const selected = captureProject(root, 'config/provider.json', system);
    expect(selected.commands.get(join(root, 'nested/tsconfig.json'))?.fileNames).toEqual([
      join(root, 'globals.d.ts'),
    ]);
    expect(trusted.readFile(join(root, 'node_modules/@fixture/later/index.d.ts'))).toContain(
      'Later',
    );
    const reconstructed = reconstructProject(root, selected, system);
    expect(
      reconstructed.program.getResolvedProjectReferences()?.[0]?.references?.[0]?.commandLine
        .fileNames,
    ).toEqual([join(root, 'globals.d.ts')]);
    const recensed = captureProject(root, 'config/provider.json', system);
    expect(recensed.commands.get(join(root, 'nested/tsconfig.json'))?.fileNames).toEqual([
      join(root, 'globals.d.ts'),
      join(root, 'node_modules/@fixture/later/index.d.ts'),
    ]);
    expect(() => reconstructProject(root, { ...selected, commands: new Map() }, system)).toThrow(
      'TypeScript project reference was not selected:',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(modules, { recursive: true, force: true });
    Bun.gc(true);
  }
});

test('serial reports preserve transitive and ambient semantic closure after config reordering', () => {
  const observation = compare((root, request) => {
    write(root, 'src/index.ts', "export { value } from './value';\n");
    write(root, 'src/value.ts', 'export declare const value: GlobalShape;\n');
    write(
      root,
      'globals.d.ts',
      `${readFileSync(join(root, 'globals.d.ts'), 'utf8')}interface GlobalShape { code: number; }\n`,
    );
    return { ...request, configPaths: request.configPaths.toReversed() };
  });
  expect(observation.ok).toBe(true);
  expect(
    observation.report?.relationships.publicDeclarations[0]?.declarations.map(
      ({ sourcePath }) => sourcePath,
    ),
  ).toEqual(['globals.d.ts', 'src/index.ts', 'src/value.ts']);
});

test('serial reports preserve sole transitive emitter ownership and empty public families', () => {
  const observation = compare((_root, request) => ({
    ...request,
    configPaths: ['config/consumer-0.json'],
  }));
  expect(observation.ok).toBe(true);
  expect(observation.report?.relationships.publicDeclarations[0]?.configPath).toBe(
    'config/consumer-0.json',
  );
  const empty = compare((_root, request) => ({ ...request, publicEntrypoints: [] }));
  expect(empty.ok).toBe(true);
  expect(empty.report?.relationships.publicDeclarations).toEqual([]);
});

for (const [name, configure, message] of [
  [
    'missing emitter',
    (_root: string, request: Request) => ({ ...request, publicEntrypoints: ['src/absent.ts'] }),
    'resolved by 0 configs; expected exactly one emitting owner',
  ],
  [
    'shared emissions without explicit root',
    (_root: string, request: Request) => ({
      ...request,
      configPaths: request.configPaths.slice(1),
    }),
    '2 emitting configs with 0 explicit root configs',
  ],
  [
    'ambiguous explicit roots',
    (root: string, request: Request) => {
      write(root, 'config/duplicate.json', '{"extends":"./provider.json"}');
      return { ...request, configPaths: [...request.configPaths, 'config/duplicate.json'] };
    },
    '4 emitting configs with 2 explicit root configs',
  ],
] as const) {
  test(`serial refuses ${name} with predecessor provenance`, () => {
    const observation = compare(configure);
    expect(observation.ok).toBe(false);
    expect(observation.message).toContain(message);
  });
}

test('later config parse failure precedes an earlier unresolved import', () => {
  const observation = compare((root, request) => {
    write(root, 'src/index.ts', "export { absent } from './absent';\n");
    write(root, 'config/malformed.json', '{');
    return { ...request, configPaths: [...request.configPaths, 'config/malformed.json'] };
  });
  expect(observation.message).toStartWith('TypeScript config malformed: config/malformed.json:');
});

test('later unresolved import precedes an earlier semantic diagnostic', () => {
  const observation = compare((root, request) => {
    write(root, 'src/index.ts', 'export declare const value: MissingType;\n');
    write(root, 'src/consumer.ts', "export { absent } from './absent';\n");
    return request;
  });
  expect(observation.ok).toBe(false);
  expect(observation.message).toContain('./absent');
  expect(observation.message).not.toContain('MissingType');
});

test('later diagnostics precede an earlier unsupported bundled emission', () => {
  const observation = compare((root, request) => {
    write(root, 'src/extra.ts', 'export const extra = 2;\n');
    write(root, 'src/consumer.ts', 'export declare const absent: MissingType;\n');
    write(
      root,
      'config/provider.json',
      JSON.stringify({
        extends: '../tsconfig.json',
        compilerOptions: { module: 'system', outFile: '../bundle.d.ts' },
        files: ['../globals.d.ts', '../src/index.ts', '../src/extra.ts'],
        include: [],
      }),
    );
    return request;
  });
  expect(observation.ok).toBe(false);
  expect(observation.message).toStartWith('TypeScript compiler failed:');
  expect(observation.message).toContain('MissingType');
});

test('public entrypoint request order precedes later ownership ambiguity', () => {
  const observation = compare((root, request) => {
    write(root, 'config/duplicate.json', '{"extends":"./provider.json"}');
    return {
      configPaths: [...request.configPaths, 'config/duplicate.json'],
      publicEntrypoints: ['src/absent.ts', 'src/index.ts'],
    };
  });
  expect(observation.message).toContain('src/absent.ts resolved by 0 configs');
});

for (const shape of ['nested', 'cyclic', 'absent', 'malformed'] as const) {
  test(`serial preserves ${shape} project references and their diagnostics`, () => {
    const observation = compare((root, request) => {
      write(
        root,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: { noLib: true, types: [], module: 'esnext', rootDir: '.' },
        }),
      );
      write(
        root,
        'config/provider.json',
        JSON.stringify({
          extends: '../tsconfig.json',
          files: ['../globals.d.ts', '../src/index.ts'],
          references: [{ path: '../reference' }],
          include: [],
        }),
      );
      if (shape !== 'absent') {
        write(
          root,
          'reference/tsconfig.json',
          JSON.stringify({
            compilerOptions: { composite: true },
            files: ['../globals.d.ts'],
            references: [{ path: '../nested' }],
          }),
        );
        write(
          root,
          'nested/tsconfig.json',
          JSON.stringify({
            compilerOptions: { composite: true },
            files: ['../globals.d.ts'],
            ...(shape === 'cyclic' ? { references: [{ path: '../reference' }] } : {}),
          }),
        );
      }
      if (shape === 'malformed') {
        write(root, 'reference/tsconfig.json', '{');
        write(root, 'src/consumer.ts', 'export declare const absent: MissingType;\n');
      }
      return request;
    });
    if (shape === 'absent') {
      expect(observation.ok).toBe(false);
      expect(observation.message).toContain('reference');
      expect(observation.message).toContain('not found');
    } else if (shape === 'malformed') {
      expect(observation.ok).toBe(false);
      expect(observation.message).toContain('must have setting "composite": true');
      expect(observation.message).toContain('MissingType');
      expect(observation.message?.indexOf('composite')).toBeLessThan(
        observation.message?.indexOf('MissingType') ?? -1,
      );
    } else {
      expect(observation.ok).toBe(true);
    }
  });
}
