import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import { afterEach, describe, expect, test } from 'bun:test';

import { ContentManifestRequest } from '../contracts/records';
import { type CliInvocation, invokeCli } from '../invoke-cli';

interface RelationshipReport {
  schemaVersion: 1;
  selection: { kind: string };
  extractors: ExtractorIdentity[];
  manifestInputs: {
    relationshipInputs: { inputId: string; blob: string }[];
    extractors: ExtractorIdentity[];
  };
  typescript: {
    imports: {
      source: string;
      specifier: string;
      target: string;
      importKind: string;
      extractor: ExtractorIdentity;
      identity: string;
    }[];
    reverseEdges: {
      provider: string;
      importers: { source: string; specifier: string; importKind: string }[];
      extractor: ExtractorIdentity;
      identity: string;
    }[];
    publicDeclarations: {
      configPath: string;
      entrypoint: string;
      configurationIdentity: string;
      declarations: { sourcePath: string; emittedPath: string; text: string }[];
      extractor: ExtractorIdentity;
      identity: string;
    }[];
  };
  nx: {
    projects: { name: string; root: string; sourceRoot?: string; identity: string }[];
    dependencies: { source: string; target: string; type: string; identity: string }[];
    targets: {
      project: string;
      target: string;
      configuration: unknown;
      extractor: ExtractorIdentity;
      identity: string;
    }[];
  };
}

interface ExtractorIdentity {
  extractorId: string;
  version: string;
  blob: string;
}

const pathsToRemove: string[] = [];
const cliPath = join(import.meta.dir, '..', 'cli.ts');
const trustedNodeModules = dirname(
  dirname(Bun.resolveSync('typescript/package.json', import.meta.dir)),
);
const shapesDeclaration =
  "/// <reference path='./globals.d.ts' />\n/// <reference types='node' />\n/// <reference lib='es2022' />\nimport type { Hidden } from './hidden';\nexport interface Declared { label: string; hidden: Hidden; global: GlobalHidden }\n";

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stderr = invocation.stderr.toString('utf8');
  expect(invocation.exitCode, stderr).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function write(repository: string, path: string, source: string): void {
  const absolutePath = join(repository, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'tool-wiki-relationships-'));
  pathsToRemove.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'relationships@example.test']);
  runGit(repository, ['config', 'user.name', 'Relationship Fixture']);
  write(
    repository,
    'package.json',
    `${JSON.stringify({ name: 'relationship-fixture', private: true })}\n`,
  );
  write(repository, 'nx.json', `${JSON.stringify({ plugins: [], useInferencePlugins: false })}\n`);
  write(
    repository,
    'tsconfig.json',
    `${JSON.stringify({
      compilerOptions: {
        declaration: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        rootDir: '.',
        strict: true,
        target: 'ES2022',
        types: ['node'],
      },
    })}\n`,
  );
  write(
    repository,
    'config/tsconfig.json',
    `${JSON.stringify({ extends: '../tsconfig.json', include: ['../packages/**/*.ts'] })}\n`,
  );
  write(
    repository,
    'packages/provider/project.json',
    `${JSON.stringify({
      name: 'provider',
      root: 'packages/provider',
      sourceRoot: 'packages/provider/src',
      projectType: 'library',
      targets: {
        build: {
          executor: 'nx:run-commands',
          options: { command: 'bunx tsc --build packages/provider/tsconfig.json' },
        },
      },
    })}\n`,
  );
  write(
    repository,
    'packages/apps/consumer/project.json',
    `${JSON.stringify({
      name: 'consumer',
      root: 'packages/apps/consumer',
      sourceRoot: 'packages/apps/consumer/src',
      projectType: 'application',
      implicitDependencies: ['provider'],
      targets: {
        test: { executor: 'nx:run-commands', options: { command: 'bun test' } },
      },
    })}\n`,
  );
  write(
    repository,
    'packages/minimal/project.json',
    `${JSON.stringify({
      name: 'minimal',
      root: 'packages/minimal',
      targets: { noop: { executor: 'nx:run-commands', options: { command: 'bun --version' } } },
    })}\n`,
  );
  write(
    repository,
    'packages/provider/src/index.ts',
    "export default function publicDefault(): string { return 'public'; }\nexport { type PublicThing } from './public';\nexport { type Declared } from './shapes';\n",
  );
  write(
    repository,
    'packages/provider/src/public.ts',
    "export interface PublicThing { value: string; nested: import('./hidden').Hidden; declared: import('./shapes').Declared }\n",
  );
  write(
    repository,
    'packages/provider/src/hidden.ts',
    "import type { PathLike } from 'node:fs';\nimport type { Type } from 'typescript';\nexport interface Hidden { code: number; path?: PathLike; compiler?: Type }\n",
  );
  write(repository, 'packages/provider/src/shapes.d.ts', shapesDeclaration);
  write(
    repository,
    'packages/provider/src/globals.d.ts',
    'interface GlobalHidden { code: string }\n',
  );
  write(
    repository,
    'packages/provider/src/internal.ts',
    "import type { PublicThing } from './index';\nexport const inspect = (value: PublicThing) => value.value;\n",
  );
  write(
    repository,
    'packages/apps/consumer/src/use.ts',
    "import publicDefault, { type PublicThing } from '../../../provider/src/index';\nexport const use = (value: PublicThing) => value.nested.code + publicDefault().length;\n",
  );
  return repository;
}

function commitAll(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

function writeRequest(repository: string, configPaths = ['config/tsconfig.json']): string {
  return writeRequestInput(repository, {
    schemaVersion: 1,
    typescript: {
      configPaths,
      publicEntrypoints: ['packages/provider/src/index.ts'],
    },
  });
}

function writeRequestInput(repository: string, input: object): string {
  const path = join(
    repository,
    '..',
    `${repository.slice(repository.lastIndexOf('/') + 1)}.request.json`,
  );
  pathsToRemove.push(path);
  writeFileSync(path, `${JSON.stringify(input)}\n`, 'utf8');
  return path;
}

function addJsonDeclarationFixture(repository: string, publicJsonType: boolean): string {
  write(repository, 'packages/provider/src/schema.json', '{"kind":"fleet"}\n');
  write(
    repository,
    'config/tsconfig.json',
    `${JSON.stringify({
      extends: '../tsconfig.json',
      // `outDir` is what makes the compiler want to copy the JSON beside the output, and a
      // declaration-only emit skips that copy: `emitSkipped` with no diagnostic, as tool-fleet's
      // library configuration does. Without it this fixture never reaches the boundary under test.
      compilerOptions: { resolveJsonModule: true, outDir: '../dist' },
      include: ['../packages/**/*.ts', '../packages/**/*.json'],
    })}\n`,
  );
  write(
    repository,
    'packages/provider/src/json-helper.ts',
    "import schema from './schema.json' with { type: 'json' };\n" +
      (publicJsonType
        ? 'export type Schema = typeof schema;\n'
        : 'export const schemaKind: string = schema.kind;\n'),
  );
  // Appended to the fixture's entrypoint, never written over it: `internal.ts` and the consumer
  // still import its default export and `PublicThing`, and losing those fails the program on
  // pre-emit diagnostics before any declaration is emitted.
  write(
    repository,
    'packages/provider/src/index.ts',
    "export default function publicDefault(): string { return 'public'; }\n" +
      "export { type PublicThing } from './public';\n" +
      "export { type Declared } from './shapes';\n" +
      (publicJsonType
        ? "export type { Schema } from './json-helper';\n"
        : "export { schemaKind } from './json-helper';\n"),
  );
  return writeRequestInput(repository, {
    schemaVersion: 1,
    typescript: {
      configPaths: ['config/tsconfig.json'],
      publicEntrypoints: ['packages/provider/src/index.ts'],
    },
  });
}

/** A finished child process as the same record {@link invokeCli} returns. */
function fromProcess(invocation: ReturnType<typeof Bun.spawnSync>): CliInvocation {
  // Every spawn here pipes both streams; an absent one is a harness fault, not silence.
  if (invocation.stdout === undefined || invocation.stderr === undefined)
    throw new Error('the invocation captured no stdout or stderr');
  return {
    exitCode: invocation.exitCode,
    stdout: invocation.stdout.toString('utf8'),
    stderr: invocation.stderr.toString('utf8'),
  };
}

/**
 * Runs `extract-relationships` in this process through the CLI entry, or as its own Bun process
 * when `env` is given: those cases prove a candidate script never runs, and the sentinel path they
 * pass must reach any child the extractor could start.
 */
async function invoke(
  repository: string,
  revision: string,
  requestPath: string,
  env?: Record<string, string>,
): Promise<CliInvocation> {
  const argv = ['extract-relationships', 'committed', repository, revision, requestPath];
  if (env === undefined)
    return invokeCli(argv, { TOOL_WIKI_TRUSTED_NODE_MODULES: trustedNodeModules });
  return fromProcess(
    Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
      // The trusted caller starts outside the candidate so candidate Bun configuration cannot load.
      cwd: import.meta.dir,
      env: {
        ...process.env,
        TOOL_WIKI_TRUSTED_NODE_MODULES: trustedNodeModules,
        ...env,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    }),
  );
}

function output(invocation: CliInvocation): string {
  return `${invocation.stdout}${invocation.stderr}`;
}

function report(invocation: CliInvocation): RelationshipReport {
  expect(invocation.exitCode, output(invocation)).toBe(0);
  return JSON.parse(invocation.stdout) as RelationshipReport;
}

function relationshipInput(extracted: RelationshipReport, inputId: string): string | undefined {
  return extracted.manifestInputs.relationshipInputs.find((input) => input.inputId === inputId)
    ?.blob;
}

afterEach(() => {
  for (const path of pathsToRemove.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe('relationship extraction production CLI', () => {
  test('strictly versions relationship requests and rejects ambiguous selector sets', async () => {
    const repository = createRepository();
    const revision = commitAll(repository, 'strict request boundary');
    const cases = [
      {
        input: {
          schemaVersion: 99,
          typescript: {
            configPaths: ['tsconfig.json'],
            publicEntrypoints: ['packages/provider/src/index.ts'],
          },
        },
        expected: 'schemaVersion must be 1',
      },
      {
        input: {
          schemaVersion: 1,
          typescript: {
            configPaths: [],
            publicEntrypoints: ['packages/provider/src/index.ts'],
          },
        },
        expected: 'at least one TypeScript config path',
      },
      {
        input: {
          schemaVersion: 1,
          typescript: {
            configPaths: ['tsconfig.json', 'tsconfig.json'],
            publicEntrypoints: ['packages/provider/src/index.ts'],
          },
        },
        expected: 'unique TypeScript config paths',
      },
      {
        input: {
          schemaVersion: 1,
          typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: [] },
        },
        expected: 'at least one TypeScript public entrypoint',
      },
      {
        input: {
          schemaVersion: 1,
          typescript: {
            configPaths: ['tsconfig.json'],
            publicEntrypoints: ['packages/provider/src/index.ts', 'packages/provider/src/index.ts'],
          },
        },
        expected: 'unique TypeScript public entrypoints',
      },
      {
        input: {
          schemaVersion: 1,
          typescript: {
            configPaths: ['tsconfig.json'],
            publicEntrypoints: ['packages/provider/src/index.ts'],
          },
          undeclared: true,
        },
        expected: 'undeclared must be removed',
      },
    ];
    for (const boundary of cases) {
      const failed = await invoke(
        repository,
        revision,
        writeRequestInput(repository, boundary.input),
      );
      expect(failed.exitCode).toBe(1);
      expect(output(failed)).toContain(boundary.expected);
    }
  }, 30_000);

  test('publishes exact TypeScript and nested Nx selectors with extractor and manifest identities', async () => {
    const repository = createRepository();
    const revision = commitAll(repository, 'initial graph');
    const extracted = report(await invoke(repository, revision, writeRequest(repository)));

    expect(extracted.schemaVersion).toBe(1);
    expect(extracted.selection.kind).toBe('committed');
    expect(extracted.extractors.map((extractor) => extractor.extractorId)).toEqual([
      'nx.project-json',
      'typescript.compiler',
    ]);
    expect(extracted.extractors.map((extractor) => extractor.version)).toEqual(['v1', 'v6.0.3']);
    expect(extracted.extractors.every((extractor) => /^[0-9a-f]{64}$/.test(extractor.blob))).toBe(
      true,
    );
    expect(extracted.manifestInputs.extractors).toEqual(extracted.extractors);
    expect(extracted.manifestInputs.relationshipInputs.map((input) => input.inputId)).toEqual([
      'nx.dependencies',
      'nx.projects',
      'nx.targets',
      'typescript.imports',
      'typescript.public-declarations',
      'typescript.reverse-edges',
    ]);
    expect(() =>
      parseOrThrow(ContentManifestRequest, {
        schemaVersion: 1,
        protocol: { protocolId: 'relationship-test.v1', blob: '1'.repeat(64) },
        classificationPolicy: { policyId: 'relationship-test.v1', blob: '2'.repeat(64) },
        ...extracted.manifestInputs,
      }),
    ).not.toThrow();

    expect(
      extracted.typescript.imports.map(({ source, specifier, target, importKind }) => ({
        source,
        specifier,
        target,
        importKind,
      })),
    ).toEqual([
      {
        source: 'packages/apps/consumer/src/use.ts',
        specifier: '../../../provider/src/index',
        target: 'packages/provider/src/index.ts',
        importKind: 'value',
      },
      {
        source: 'packages/provider/src/hidden.ts',
        specifier: 'node:fs',
        target: 'external:node:fs',
        importKind: 'type',
      },
      {
        source: 'packages/provider/src/hidden.ts',
        specifier: 'typescript',
        target: 'external:typescript',
        importKind: 'type',
      },
      {
        source: 'packages/provider/src/index.ts',
        specifier: './public',
        target: 'packages/provider/src/public.ts',
        importKind: 'type-re-export',
      },
      {
        source: 'packages/provider/src/index.ts',
        specifier: './shapes',
        target: 'packages/provider/src/shapes.d.ts',
        importKind: 'type-re-export',
      },
      {
        source: 'packages/provider/src/internal.ts',
        specifier: './index',
        target: 'packages/provider/src/index.ts',
        importKind: 'type',
      },
      {
        source: 'packages/provider/src/public.ts',
        specifier: './hidden',
        target: 'packages/provider/src/hidden.ts',
        importKind: 'type',
      },
      {
        source: 'packages/provider/src/public.ts',
        specifier: './shapes',
        target: 'packages/provider/src/shapes.d.ts',
        importKind: 'type',
      },
      {
        source: 'packages/provider/src/shapes.d.ts',
        specifier: './globals.d.ts',
        target: 'packages/provider/src/globals.d.ts',
        importKind: 'reference-path',
      },
      {
        source: 'packages/provider/src/shapes.d.ts',
        specifier: './hidden',
        target: 'packages/provider/src/hidden.ts',
        importKind: 'type',
      },
      {
        source: 'packages/provider/src/shapes.d.ts',
        specifier: 'es2022',
        target: 'external:typescript/lib.es2022.d.ts',
        importKind: 'reference-lib',
      },
      {
        source: 'packages/provider/src/shapes.d.ts',
        specifier: 'node',
        target: 'external:node',
        importKind: 'reference-types',
      },
    ]);
    const providerReverse = extracted.typescript.reverseEdges.find(
      (selector) => selector.provider === 'packages/provider/src/index.ts',
    );
    expect(providerReverse?.importers).toEqual([
      {
        source: 'packages/apps/consumer/src/use.ts',
        specifier: '../../../provider/src/index',
        importKind: 'value',
      },
      { source: 'packages/provider/src/internal.ts', specifier: './index', importKind: 'type' },
    ]);
    expect(
      extracted.typescript.reverseEdges.find(
        (selector) => selector.provider === 'packages/provider/src/hidden.ts',
      )?.importers,
    ).toEqual([
      { source: 'packages/provider/src/public.ts', specifier: './hidden', importKind: 'type' },
      { source: 'packages/provider/src/shapes.d.ts', specifier: './hidden', importKind: 'type' },
    ]);
    expect(
      extracted.typescript.reverseEdges.find(
        (selector) => selector.provider === 'packages/provider/src/globals.d.ts',
      )?.importers,
    ).toEqual([
      {
        source: 'packages/provider/src/shapes.d.ts',
        specifier: './globals.d.ts',
        importKind: 'reference-path',
      },
    ]);

    const declaration = extracted.typescript.publicDeclarations[0];
    expect(declaration.configPath).toBe('config/tsconfig.json');
    expect(declaration.entrypoint).toBe('packages/provider/src/index.ts');
    expect(declaration.declarations.map((entry) => entry.sourcePath)).toEqual([
      'packages/provider/src/globals.d.ts',
      'packages/provider/src/hidden.ts',
      'packages/provider/src/index.ts',
      'packages/provider/src/public.ts',
      'packages/provider/src/shapes.d.ts',
    ]);
    expect(declaration.declarations.map((entry) => entry.text).join('\n')).toContain(
      'value: string',
    );
    expect(declaration.declarations.map((entry) => entry.text).join('\n')).toContain(
      'interface Hidden',
    );
    expect(declaration.declarations.map((entry) => entry.text).join('\n')).toContain(
      'interface Declared',
    );

    expect(extracted.nx.projects.map(({ name, root }) => ({ name, root }))).toEqual([
      { name: 'consumer', root: 'packages/apps/consumer' },
      { name: 'minimal', root: 'packages/minimal' },
      { name: 'provider', root: 'packages/provider' },
    ]);
    const minimalProject = extracted.nx.projects.find((project) => project.name === 'minimal');
    expect(Object.hasOwn(minimalProject ?? {}, 'sourceRoot')).toBe(false);
    expect(Object.hasOwn(minimalProject ?? {}, 'projectType')).toBe(false);
    expect(extracted.nx.dependencies).toMatchObject([
      { source: 'consumer', target: 'provider', type: 'implicit' },
    ]);
    expect(extracted.nx.targets.map(({ project, target }) => ({ project, target }))).toEqual([
      { project: 'consumer', target: 'test' },
      { project: 'minimal', target: 'noop' },
      { project: 'provider', target: 'build' },
    ]);
  });

  test('extracts every TypeScript declaration while retaining real JSON dependency edges', async () => {
    const repository = createRepository();
    const requestPath = addJsonDeclarationFixture(repository, false);
    // Proof: forcing compiler-recognized JSON classification false on 2026-09-21 sent
    // packages/apps/consumer/project.json through targeted emit; this production test failed
    // with `declaration emit failed ... project.json: no diagnostic` instead of extracting.
    const extracted = report(
      await invoke(repository, commitAll(repository, 'implementation-only JSON'), requestPath),
    );
    // Proof: skipping JSON targets in the import loop on 2026-09-21 made this exact forward
    // edge assertion receive `[]`; reverse edges derive from that same retained import list.
    expect(
      extracted.typescript.imports
        .filter(({ source }) => source.endsWith('/json-helper.ts'))
        .map(({ source, specifier, target, importKind }) => ({
          source,
          specifier,
          target,
          importKind,
        })),
    ).toContainEqual({
      source: 'packages/provider/src/json-helper.ts',
      specifier: './schema.json',
      target: 'packages/provider/src/schema.json',
      importKind: 'value',
    });
    expect(
      extracted.typescript.reverseEdges.find(
        ({ provider }) => provider === 'packages/provider/src/schema.json',
      )?.importers,
    ).toContainEqual({
      source: 'packages/provider/src/json-helper.ts',
      specifier: './schema.json',
      importKind: 'value',
    });
    // Proof: suppressing the json-helper.ts emit callback output on 2026-09-21 made this
    // production test fail with `declaration output missing ... json-helper.ts`.
    expect(
      extracted.typescript.publicDeclarations[0]?.declarations.map(({ sourcePath }) => sourcePath),
    ).toEqual([
      'packages/provider/src/globals.d.ts',
      'packages/provider/src/hidden.ts',
      'packages/provider/src/index.ts',
      'packages/provider/src/json-helper.ts',
      'packages/provider/src/public.ts',
      'packages/provider/src/shapes.d.ts',
    ]);
    expect(
      extracted.typescript.publicDeclarations[0]?.declarations.map(({ text }) => text).join('\n'),
    ).not.toContain('schema.json');
  }, 20_000);

  test('refuses a JSON dependency retained by the public declaration', async () => {
    const repository = createRepository();
    const requestPath = addJsonDeclarationFixture(repository, true);
    const invocation = await invoke(
      repository,
      commitAll(repository, 'public JSON declaration'),
      requestPath,
    );

    // Proof: returning false instead of refusing the JSON dependency on 2026-09-21 made this
    // production invocation exit 0 and publish a public identity without schema.json.
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(
      'TypeScript public declaration JSON dependency unsupported: packages/provider/src/json-helper.ts -> packages/provider/src/schema.json',
    );
  }, 45_000);

  test('refuses a genuine compiler error before declaration emit', async () => {
    const repository = createRepository();
    write(
      repository,
      'packages/provider/src/public.ts',
      'export interface PublicThing { broken: MissingType }\n',
    );
    const invocation = await invoke(
      repository,
      commitAll(repository, 'compiler error'),
      writeRequest(repository),
    );

    // Proof: removing the pre-emit diagnostic refusal on 2026-09-21 made the MissingType
    // production fixture exit 0 instead of reporting `TypeScript compiler failed:`.
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain('TypeScript compiler failed:');
    expect(invocation.stderr).toContain("Cannot find name 'MissingType'");
  }, 20_000);

  test('preserves a single-source bundled declaration and rejects invalid JSON outFile options', async () => {
    const repository = createRepository();
    write(
      repository,
      'tsconfig.json',
      `${JSON.stringify({
        compilerOptions: {
          declaration: true,
          ignoreDeprecations: '6.0',
          module: 'System',
          moduleResolution: 'Node10',
          outFile: 'dist/bundle.js',
          rootDir: '.',
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      })}\n`,
    );
    write(repository, 'src/index.ts', "export const bundled = 'value';\n");
    const requestPath = writeRequestInput(repository, {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/index.ts'] },
    });
    const extracted = report(
      await invoke(repository, commitAll(repository, 'single-source bundle'), requestPath),
    );

    expect(extracted.typescript.publicDeclarations).toHaveLength(1);
    expect(
      extracted.typescript.publicDeclarations[0]?.declarations.map(
        ({ sourcePath, emittedPath }) => ({ sourcePath, emittedPath }),
      ),
    ).toEqual([{ sourcePath: 'src/index.ts', emittedPath: 'dist/bundle.d.ts' }]);

    const jsonRepository = createRepository();
    write(
      jsonRepository,
      'tsconfig.json',
      `${JSON.stringify({
        compilerOptions: {
          declaration: true,
          ignoreDeprecations: '6.0',
          module: 'System',
          moduleResolution: 'Node10',
          outFile: 'dist/bundle.js',
          resolveJsonModule: true,
          rootDir: '.',
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts', 'src/**/*.json'],
      })}\n`,
    );
    write(jsonRepository, 'src/schema.json', '{"kind":"fleet"}\n');
    write(
      jsonRepository,
      'src/index.ts',
      "import schema from './schema.json';\nexport const kind: string = schema.kind;\n",
    );
    const jsonRequestPath = writeRequestInput(jsonRepository, {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/index.ts'] },
    });
    const failed = await invoke(
      jsonRepository,
      commitAll(jsonRepository, 'invalid JSON bundle'),
      jsonRequestPath,
    );

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain(
      "Option '--resolveJsonModule' cannot be specified when 'module' is set to 'none', 'system', or 'umd'.",
    );
  }, 30_000);

  test('refuses a multi-source bundled declaration', async () => {
    const repository = createRepository();
    write(
      repository,
      'tsconfig.json',
      `${JSON.stringify({
        compilerOptions: {
          declaration: true,
          ignoreDeprecations: '6.0',
          module: 'System',
          moduleResolution: 'Node10',
          outFile: 'dist/bundle.js',
          rootDir: '.',
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      })}\n`,
    );
    write(repository, 'src/index.ts', "export const first = 'value';\n");
    write(repository, 'src/second.ts', "export const second = 'value';\n");
    const requestPath = writeRequestInput(repository, {
      schemaVersion: 1,
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/index.ts'] },
    });
    const invocation = await invoke(
      repository,
      commitAll(repository, 'multi-source bundle'),
      requestPath,
    );

    // Proof: removing the multi-source callback refusal on 2026-09-21 made this production
    // fixture exit 0 with the bundle mapped only to the first source.
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout).toBe('');
    expect(invocation.stderr).toContain(
      'TypeScript bundled declaration has multiple candidate sources for tsconfig.json: src/index.ts, src/second.ts',
    );
  }, 20_000);

  test('normalizes the materialized compiler root across repeat and restored extractions', async () => {
    const repository = createRepository();
    const requestPath = writeRequest(repository);
    const initialRevision = commitAll(repository, 'stable compiler root');
    const initial = report(await invoke(repository, initialRevision, requestPath));
    const repeated = report(await invoke(repository, initialRevision, requestPath));

    expect(repeated.typescript.publicDeclarations[0].configurationIdentity).toBe(
      initial.typescript.publicDeclarations[0].configurationIdentity,
    );
    expect(repeated.typescript.publicDeclarations[0].identity).toBe(
      initial.typescript.publicDeclarations[0].identity,
    );

    write(
      repository,
      'packages/provider/src/public.ts',
      "export interface PublicThing { value: number; nested: import('./hidden').Hidden; declared: import('./shapes').Declared }\n",
    );
    const changed = report(
      await invoke(
        repository,
        commitAll(repository, 'change then restore public type'),
        requestPath,
      ),
    );
    expect(changed.typescript.publicDeclarations[0].identity).not.toBe(
      initial.typescript.publicDeclarations[0].identity,
    );

    write(
      repository,
      'packages/provider/src/public.ts',
      "export interface PublicThing { value: string; nested: import('./hidden').Hidden; declared: import('./shapes').Declared }\n",
    );
    const restored = report(
      await invoke(repository, commitAll(repository, 'restore stable compiler root'), requestPath),
    );
    expect(restored.typescript.publicDeclarations[0].configurationIdentity).toBe(
      initial.typescript.publicDeclarations[0].configurationIdentity,
    );
    expect(restored.typescript.publicDeclarations[0].identity).toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
  }, 90_000);

  test('stales resolved declarations behind an unchanged barrel and returns current when restored', async () => {
    const repository = createRepository();
    const requestPath = writeRequest(repository);
    const initialRevision = commitAll(repository, 'string public type');
    const initial = report(await invoke(repository, initialRevision, requestPath));
    const initialDeclaration = initial.typescript.publicDeclarations[0];

    write(
      repository,
      'packages/provider/src/public.ts',
      "export interface PublicThing { value: number; nested: import('./hidden').Hidden; declared: import('./shapes').Declared }\n",
    );
    const changedRevision = commitAll(repository, 'number public type');
    const changed = report(await invoke(repository, changedRevision, requestPath));
    // Proof: hashing only the unchanged barrel kept both revisions at fc5f9f1d...; this exact
    // production assertion failed because the re-exported `value: number` was not structural input.
    expect(changed.typescript.publicDeclarations[0].identity).not.toBe(initialDeclaration.identity);
    expect(relationshipInput(changed, 'typescript.public-declarations')).not.toBe(
      relationshipInput(initial, 'typescript.public-declarations'),
    );
    expect(
      changed.typescript.publicDeclarations[0].declarations.map((entry) => entry.text).join('\n'),
    ).toContain('value: number');
    expect(runGit(repository, ['show', `${initialRevision}:packages/provider/src/index.ts`])).toBe(
      runGit(repository, ['show', `${changedRevision}:packages/provider/src/index.ts`]),
    );

    write(
      repository,
      'packages/provider/src/public.ts',
      "export interface PublicThing { value: string; nested: import('./hidden').Hidden; declared: import('./shapes').Declared }\n",
    );
    const restoredRevision = commitAll(repository, 'restore public type');
    const restored = report(await invoke(repository, restoredRevision, requestPath));
    expect(restored.typescript.publicDeclarations[0].identity).toBe(initialDeclaration.identity);
    expect(relationshipInput(restored, 'typescript.public-declarations')).toBe(
      relationshipInput(initial, 'typescript.public-declarations'),
    );
  }, 45_000);

  test('stales an import-type public declaration when its hidden declaration changes', async () => {
    const repository = createRepository();
    const requestPath = writeRequest(repository);
    const initialRevision = commitAll(repository, 'number import type');
    const initial = report(await invoke(repository, initialRevision, requestPath));

    write(
      repository,
      'packages/provider/src/hidden.ts',
      "import type { PathLike } from 'node:fs';\nimport type { Type } from 'typescript';\nexport interface Hidden { code: string; path?: PathLike; compiler?: Type }\n",
    );
    const changedRevision = commitAll(repository, 'string import type');
    const changed = report(await invoke(repository, changedRevision, requestPath));
    expect(changed.typescript.publicDeclarations[0].identity).not.toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
    expect(runGit(repository, ['show', `${initialRevision}:packages/provider/src/public.ts`])).toBe(
      runGit(repository, ['show', `${changedRevision}:packages/provider/src/public.ts`]),
    );

    write(
      repository,
      'packages/provider/src/hidden.ts',
      "import type { PathLike } from 'node:fs';\nimport type { Type } from 'typescript';\nexport interface Hidden { code: number; path?: PathLike; compiler?: Type }\n",
    );
    const restored = report(
      await invoke(repository, commitAll(repository, 'restore number import type'), requestPath),
    );
    expect(restored.typescript.publicDeclarations[0].identity).toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
  }, 45_000);

  test('stales a public declaration when a transitive local declaration source changes', async () => {
    const repository = createRepository();
    const requestPath = writeRequest(repository);
    const initialRevision = commitAll(repository, 'string local declaration');
    const initial = report(await invoke(repository, initialRevision, requestPath));

    write(
      repository,
      'packages/provider/src/shapes.d.ts',
      shapesDeclaration.replace('label: string', 'label: number'),
    );
    const changedRevision = commitAll(repository, 'number local declaration');
    const changed = report(await invoke(repository, changedRevision, requestPath));
    expect(changed.typescript.publicDeclarations[0].identity).not.toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
    expect(runGit(repository, ['show', `${initialRevision}:packages/provider/src/public.ts`])).toBe(
      runGit(repository, ['show', `${changedRevision}:packages/provider/src/public.ts`]),
    );

    write(repository, 'packages/provider/src/shapes.d.ts', shapesDeclaration);
    const restored = report(
      await invoke(repository, commitAll(repository, 'restore local declaration'), requestPath),
    );
    expect(restored.typescript.publicDeclarations[0].identity).toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
  }, 45_000);

  test('stales provider topology when a local declaration importer is added', async () => {
    const repository = createRepository();
    const requestPath = writeRequest(repository);
    const initial = report(
      await invoke(repository, commitAll(repository, 'initial declaration importers'), requestPath),
    );
    const initialProvider = initial.typescript.reverseEdges.find(
      (selector) => selector.provider === 'packages/provider/src/hidden.ts',
    );

    write(
      repository,
      'packages/provider/src/additional.d.ts',
      "import type { Hidden } from './hidden';\nexport type Additional = Hidden;\n",
    );
    const changed = report(
      await invoke(repository, commitAll(repository, 'add declaration importer'), requestPath),
    );
    const changedProvider = changed.typescript.reverseEdges.find(
      (selector) => selector.provider === 'packages/provider/src/hidden.ts',
    );

    // Proof: excluding declaration files from the production graph kept this provider selector
    // at its initial identity; this assertion received equality after `additional.d.ts` was added.
    expect(changedProvider?.identity).not.toBe(initialProvider?.identity);
    expect(changedProvider?.importers).toEqual([
      {
        source: 'packages/provider/src/additional.d.ts',
        specifier: './hidden',
        importKind: 'type',
      },
      { source: 'packages/provider/src/public.ts', specifier: './hidden', importKind: 'type' },
      { source: 'packages/provider/src/shapes.d.ts', specifier: './hidden', importKind: 'type' },
    ]);
  }, 45_000);

  test('stales a public declaration when a referenced global declaration changes', async () => {
    const repository = createRepository();
    const requestPath = writeRequest(repository);
    const initialRevision = commitAll(repository, 'string global declaration');
    const initial = report(await invoke(repository, initialRevision, requestPath));

    write(
      repository,
      'packages/provider/src/globals.d.ts',
      'interface GlobalHidden { code: number }\n',
    );
    const changedRevision = commitAll(repository, 'number global declaration');
    const changed = report(await invoke(repository, changedRevision, requestPath));

    // Proof: omitting resolved triple-slash dependencies kept the public identity unchanged;
    // this production assertion received equality after `GlobalHidden.code` became `number`.
    expect(changed.typescript.publicDeclarations[0].identity).not.toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
    expect(relationshipInput(changed, 'typescript.public-declarations')).not.toBe(
      relationshipInput(initial, 'typescript.public-declarations'),
    );
    expect(
      runGit(repository, ['show', `${initialRevision}:packages/provider/src/shapes.d.ts`]),
    ).toBe(runGit(repository, ['show', `${changedRevision}:packages/provider/src/shapes.d.ts`]));

    write(
      repository,
      'packages/provider/src/globals.d.ts',
      'interface GlobalHidden { code: string }\n',
    );
    const restored = report(
      await invoke(repository, commitAll(repository, 'restore global declaration'), requestPath),
    );
    expect(restored.typescript.publicDeclarations[0].identity).toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
  }, 45_000);

  test('retains an original TypeScript source path reference in its emitted public closure', async () => {
    const repository = createRepository();
    const requestPath = writeRequest(repository);
    write(
      repository,
      'packages/provider/src/index.ts',
      "/// <reference path='./globals.d.ts' />\nimport { implementationOnly } from './implementation-only';\nexport interface SourcePublic { global: GlobalHidden }\nexport default function publicDefault(): string { return implementationOnly; }\nexport { type PublicThing } from './public';\nexport { type Declared } from './shapes';\n",
    );
    write(
      repository,
      'packages/provider/src/implementation-only.ts',
      "export const implementationOnly = 'public';\n",
    );
    write(
      repository,
      'packages/provider/src/shapes.d.ts',
      "import type { Hidden } from './hidden';\nexport interface Declared { label: string; hidden: Hidden }\n",
    );
    const initialRevision = commitAll(repository, 'source references string global');
    const initial = report(await invoke(repository, initialRevision, requestPath));

    write(
      repository,
      'packages/provider/src/globals.d.ts',
      'interface GlobalHidden { code: number }\n',
    );
    const changedRevision = commitAll(repository, 'source references number global');
    const changed = report(await invoke(repository, changedRevision, requestPath));

    expect(changed.typescript.publicDeclarations[0].identity).not.toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
    expect(runGit(repository, ['show', `${initialRevision}:packages/provider/src/index.ts`])).toBe(
      runGit(repository, ['show', `${changedRevision}:packages/provider/src/index.ts`]),
    );
    expect(
      initial.typescript.publicDeclarations[0].declarations.map(({ sourcePath }) => sourcePath),
    ).toContain('packages/provider/src/globals.d.ts');
    expect(
      initial.typescript.publicDeclarations[0].declarations.map(({ sourcePath }) => sourcePath),
    ).not.toContain('packages/provider/src/implementation-only.ts');
    expect(
      initial.typescript.publicDeclarations[0].declarations.map(({ text }) => text).join('\n'),
    ).toContain('interface GlobalHidden { code: string }');

    write(
      repository,
      'packages/provider/src/globals.d.ts',
      'interface GlobalHidden { code: string }\n',
    );
    const restored = report(
      await invoke(
        repository,
        commitAll(repository, 'restore source referenced global'),
        requestPath,
      ),
    );
    expect(restored.typescript.publicDeclarations[0].identity).toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
  }, 45_000);

  test('keys provider topology by exact reverse edges, not unchanged importer bytes', async () => {
    const repository = createRepository();
    const requestPath = writeRequest(repository);
    const initial = report(
      await invoke(repository, commitAll(repository, 'initial callers'), requestPath),
    );
    const initialProvider = initial.typescript.reverseEdges.find(
      (selector) => selector.provider === 'packages/provider/src/index.ts',
    );

    write(
      repository,
      'packages/provider/src/internal.ts',
      "import type { PublicThing } from './index';\nexport const inspect = (value: PublicThing) => value.nested.code;\n",
    );
    const internalEdit = report(
      await invoke(repository, commitAll(repository, 'internal implementation edit'), requestPath),
    );
    expect(
      internalEdit.typescript.reverseEdges.find(
        (selector) => selector.provider === 'packages/provider/src/index.ts',
      )?.identity,
    ).toBe(initialProvider?.identity);

    write(
      repository,
      'packages/apps/consumer/src/second.ts',
      "import type { PublicThing } from '../../../provider/src/index';\nexport type Second = PublicThing;\n",
    );
    const newImporter = report(
      await invoke(repository, commitAll(repository, 'add reverse edge'), requestPath),
    );
    const changedProvider = newImporter.typescript.reverseEdges.find(
      (selector) => selector.provider === 'packages/provider/src/index.ts',
    );
    // Proof: omitting the new importer from this selector kept its identity at 31bdf67d...;
    // this production assertion received the initial identity instead of stale topology.
    expect(changedProvider?.identity).not.toBe(initialProvider?.identity);
    expect(changedProvider?.importers.map((edge) => edge.source)).toEqual([
      'packages/apps/consumer/src/second.ts',
      'packages/apps/consumer/src/use.ts',
      'packages/provider/src/internal.ts',
    ]);
  }, 45_000);

  test('refuses absent, unreadable, malformed, unresolved and failed TypeScript inputs distinctly', async () => {
    const missingRepository = createRepository();
    const missingRevision = commitAll(missingRepository, 'missing config request');
    const missing = await invoke(
      missingRepository,
      missingRevision,
      writeRequest(missingRepository, ['missing-tsconfig.json']),
    );
    expect(missing.exitCode).toBe(1);
    expect(output(missing)).toContain('TypeScript config absent: missing-tsconfig.json');

    const unreadableRepository = createRepository();
    const unreadableRevision = commitAll(unreadableRepository, 'directory as config');
    const unreadable = await invoke(
      unreadableRepository,
      unreadableRevision,
      writeRequest(unreadableRepository, ['packages']),
    );
    expect(unreadable.exitCode).toBe(1);
    expect(output(unreadable)).toContain('TypeScript config unreadable: packages');

    const malformedRepository = createRepository();
    write(malformedRepository, 'config/tsconfig.json', '{ malformed\n');
    const malformedRevision = commitAll(malformedRepository, 'malformed config');
    const malformed = await invoke(
      malformedRepository,
      malformedRevision,
      writeRequest(malformedRepository),
    );
    expect(malformed.exitCode).toBe(1);
    expect(output(malformed)).toContain('TypeScript config malformed: config/tsconfig.json');

    const unresolvedRepository = createRepository();
    write(
      unresolvedRepository,
      'packages/apps/consumer/src/non-code.d.ts',
      "declare module '*.css';\n",
    );
    write(
      unresolvedRepository,
      'packages/apps/consumer/src/use.ts',
      "import type { Missing } from './absent';\nexport type Use = Missing;\n",
    );
    const unresolvedRevision = commitAll(unresolvedRepository, 'unresolved import');
    const unresolved = await invoke(
      unresolvedRepository,
      unresolvedRevision,
      writeRequest(unresolvedRepository),
    );
    expect(unresolved.exitCode).toBe(1);
    expect(output(unresolved)).toContain(
      "TypeScript import unresolved: packages/apps/consumer/src/use.ts -> './absent'",
    );
  }, 30_000);

  test('omits a compiler-supported ambient non-code import without inventing a target', async () => {
    const repository = createRepository();
    write(repository, 'packages/apps/consumer/src/non-code.d.ts', "declare module '*.css';\n");
    write(
      repository,
      'packages/apps/consumer/src/use.ts',
      "import './styles.css';\n" +
        "import publicDefault, { type PublicThing } from '../../../provider/src/index';\n" +
        'export const use = (value: PublicThing) => value.nested.code + publicDefault().length;\n',
    );
    const requestPath = writeRequestInput(repository, {
      schemaVersion: 1,
      typescript: {
        configPaths: ['config/tsconfig.json'],
        publicEntrypoints: ['packages/apps/consumer/src/use.ts'],
      },
    });
    const invocation = await invoke(
      repository,
      commitAll(repository, 'ambient stylesheet'),
      requestPath,
    );
    expect(invocation.exitCode, output(invocation)).toBe(0);
    const extracted = report(invocation);
    expect(
      extracted.typescript.imports.filter(({ specifier }) => specifier === './styles.css'),
    ).toEqual([]);
    expect(
      extracted.typescript.reverseEdges.filter(({ provider }) => provider.endsWith('/styles.css')),
    ).toEqual([]);
    const declaration = extracted.typescript.publicDeclarations[0];
    expect(declaration.entrypoint).toBe('packages/apps/consumer/src/use.ts');
    expect(declaration.declarations.map(({ text }) => text).join('\n')).toContain(
      "import './styles.css';",
    );
  }, 20_000);

  test('fails closed on unresolved declaration reference directives', async () => {
    const cases = [
      {
        name: 'path',
        source: "/// <reference path='./absent.d.ts' />\nexport interface Declared {}\n",
        expected:
          "TypeScript reference path unresolved: packages/provider/src/shapes.d.ts -> './absent.d.ts'",
      },
      {
        name: 'types',
        source: "/// <reference types='absent-package' />\nexport interface Declared {}\n",
        expected:
          "TypeScript types reference unresolved: packages/provider/src/shapes.d.ts -> 'absent-package'",
      },
      {
        name: 'lib',
        source: "/// <reference lib='absent-library' />\nexport interface Declared {}\n",
        expected:
          'TypeScript lib reference absent-library from packages/provider/src/shapes.d.ts resolved 0 default libraries; expected exactly one',
      },
    ] as const;

    for (const boundary of cases) {
      const repository = createRepository();
      write(repository, 'packages/provider/src/shapes.d.ts', boundary.source);
      const failed = await invoke(
        repository,
        commitAll(repository, `unresolved ${boundary.name} reference`),
        writeRequest(repository),
      );
      expect(failed.exitCode).toBe(1);
      expect(output(failed)).toContain(boundary.expected);
    }
  }, 30_000);

  test('reads Nx project JSON without executing candidate plugins', async () => {
    const repository = createRepository();
    const marker = join(dirname(repository), `${basename(repository)}-plugin-ran`);
    pathsToRemove.push(marker);
    write(
      repository,
      'nx.json',
      `${JSON.stringify({
        plugins: ['./candidate-plugin.ts'],
        targetDefaults: { test: { cache: true, inputs: ['default'], outputs: ['coverage'] } },
      })}\n`,
    );
    write(
      repository,
      'candidate-plugin.ts',
      `await Bun.write(${JSON.stringify(marker)}, 'candidate plugin ran\\n');\nexport default {};\n`,
    );
    const extracted = report(
      await invoke(
        repository,
        commitAll(repository, 'candidate plugin is data'),
        writeRequest(repository),
      ),
    );

    expect(existsSync(marker)).toBe(false);
    expect(
      extracted.nx.targets.find(
        ({ project, target }) => project === 'consumer' && target === 'test',
      )?.configuration,
    ).toMatchObject({
      cache: true,
      inputs: ['default'],
      outputs: ['coverage'],
      configurations: {},
      parallelism: true,
      options: { command: 'bun test' },
    });
  });

  test('the bundled validator resolves tools only from explicitly trusted runtime modules', () => {
    const repository = createRepository();
    const revision = commitAll(repository, 'standalone validator input');
    const requestPath = writeRequest(repository);
    const bundleDirectory = mkdtempSync(join(tmpdir(), 'tool-wiki-bundled-validator-'));
    pathsToRemove.push(bundleDirectory);
    const bundle = join(bundleDirectory, 'validator.mjs');
    const built = fromProcess(
      Bun.spawnSync(
        ['bun', 'build', cliPath, '--target=bun', '--format=esm', `--outfile=${bundle}`],
        { stderr: 'pipe', stdout: 'pipe' },
      ),
    );
    expect(built.exitCode, output(built)).toBe(0);

    const invocation = fromProcess(
      Bun.spawnSync(
        [
          process.execPath,
          'run',
          '--cwd',
          bundleDirectory,
          '--no-env-file',
          bundle,
          'extract-relationships',
          'committed',
          repository,
          revision,
          requestPath,
        ],
        {
          cwd: bundleDirectory,
          env: {
            PATH: process.env['PATH'] ?? '',
            TOOL_WIKI_TRUSTED_NODE_MODULES: trustedNodeModules,
          },
          stderr: 'pipe',
          stdout: 'pipe',
        },
      ),
    );

    expect(invocation.exitCode, output(invocation)).toBe(0);
    expect(report(invocation).nx.projects.map(({ name }) => name)).toEqual([
      'consumer',
      'minimal',
      'provider',
    ]);
  }, 20_000);

  test('refuses malformed static Nx project data without running candidate code', async () => {
    const repository = createRepository();
    write(repository, 'packages/provider/project.json', '{ malformed\n');
    const failed = await invoke(
      repository,
      commitAll(repository, 'malformed project data'),
      writeRequest(repository),
    );

    expect(failed.exitCode).toBe(1);
    expect(output(failed)).toContain(
      'Nx project configuration malformed: packages/provider/project.json',
    );
  });

  test('supports contained symlinks and refuses an effective intermediate-symlink escape', async () => {
    const repository = createRepository();
    const requestPath = writeRequest(repository);
    symlinkSync('packages/provider/src/hidden.ts', join(repository, 'safe-hidden'));
    const safeRevision = commitAll(repository, 'contained candidate symlink');
    report(await invoke(repository, safeRevision, requestPath));

    const outsidePath = join(dirname(repository), `${basename(repository)}-outside.ts`);
    pathsToRemove.push(outsidePath);
    writeFileSync(outsidePath, 'outside candidate bytes\n', 'utf8');
    symlinkSync('.', join(repository, 'pivot'));
    symlinkSync(`pivot/../${basename(outsidePath)}`, join(repository, 'escape'));
    const escapingRevision = commitAll(repository, 'effective candidate symlink escape');
    const escaped = await invoke(repository, escapingRevision, requestPath);

    expect(escaped.exitCode).toBe(1);
    expect(output(escaped)).toContain(
      'candidate symlink escape escapes the materialized candidate',
    );
    expect(output(escaped)).not.toContain('TypeScript');
  }, 30_000);
});

test('reads static Nx configuration without executing candidate plugins', async () => {
  const repository = createRepository();
  const sentinel = join(repository, '..', `${basename(repository)}.plugin-executed`);
  pathsToRemove.push(sentinel);
  write(
    repository,
    'tools/candidate-plugin.cjs',
    "require('node:fs').writeFileSync(process.env.MODULE_WIKI_PLUGIN_SENTINEL, 'executed');\nmodule.exports = { name: 'candidate-plugin', createNodesV2: ['project.json', () => []] };\n",
  );
  write(
    repository,
    'nx.json',
    `${JSON.stringify({ plugins: ['./tools/candidate-plugin.cjs'], useInferencePlugins: false })}\n`,
  );
  const revision = commitAll(repository, 'candidate Nx plugin');

  const invocation = await invoke(repository, revision, writeRequest(repository), {
    MODULE_WIKI_PLUGIN_SENTINEL: sentinel,
  });

  // Proof: executing the configured plugin from the production extractor wrote this sentinel and
  // failed the assertion before static extraction could report the declared projects.
  expect(existsSync(sentinel)).toBe(false);
  expect(report(invocation).nx.projects.map(({ name }) => name)).toEqual([
    'consumer',
    'minimal',
    'provider',
  ]);
});

test('refuses candidate-local Nx modules before executing their wrapper', async () => {
  const repository = createRepository();
  const sentinel = join(repository, '..', `${basename(repository)}.local-nx-executed`);
  pathsToRemove.push(sentinel);
  write(
    repository,
    '.nx/installation/node_modules/nx/package.json',
    `${JSON.stringify({ name: 'nx', version: '23.2.0' })}\n`,
  );
  write(repository, '.nx/installation/node_modules/nx/bin/nx.js', 'module.exports = {};\n');
  write(
    repository,
    '.nx/nxw.js',
    "require('node:fs').writeFileSync(process.env.MODULE_WIKI_NX_SENTINEL, 'executed');\n",
  );
  const revision = commitAll(repository, 'candidate-local Nx wrapper');

  const invocation = await invoke(repository, revision, writeRequest(repository), {
    MODULE_WIKI_NX_SENTINEL: sentinel,
  });

  // Proof: executing the candidate-local wrapper from the production extractor wrote this sentinel
  // and failed the assertion before static extraction could report the declared projects.
  expect(existsSync(sentinel)).toBe(false);
  expect(invocation.exitCode).toBe(1);
  expect(output(invocation)).toContain(
    'relationship candidate may not supply trusted runtime modules',
  );
});

test('uses trusted Nx when candidate root package metadata claims its package name', async () => {
  const repository = createRepository();
  const requestPath = writeRequest(repository);
  report(await invoke(repository, commitAll(repository, 'declarative Nx baseline'), requestPath));
  const sentinel = join(repository, '..', `${basename(repository)}.self-reference-executed`);
  pathsToRemove.push(sentinel);
  write(
    repository,
    'package.json',
    `${JSON.stringify({
      name: 'nx',
      version: '23.2.0',
      private: true,
      type: 'commonjs',
      exports: {
        './bin/nx.js': './candidate-nx.js',
        './package.json': './package.json',
      },
    })}\n`,
  );
  write(
    repository,
    'candidate-nx.js',
    `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed');\n`,
  );
  const revision = commitAll(repository, 'candidate package self-reference');

  const invocation = await invoke(repository, revision, requestPath);
  expect(existsSync(sentinel)).toBe(false);
  const extracted = report(invocation);
  expect(extracted.nx.projects.map(({ name }) => name)).toEqual([
    'consumer',
    'minimal',
    'provider',
  ]);
}, 30_000);

test('starts the trusted relationship CLI outside a candidate with a Bun preload', async () => {
  const repository = createRepository();
  const requestPath = writeRequest(repository);
  report(await invoke(repository, commitAll(repository, 'declarative Nx baseline'), requestPath));
  const sentinel = join(repository, '..', `${basename(repository)}.bun-preload-executed`);
  pathsToRemove.push(sentinel);
  write(repository, 'bunfig.toml', 'preload = ["./candidate-preload.ts"]\n');
  write(
    repository,
    'candidate-preload.ts',
    `await Bun.write(${JSON.stringify(sentinel)}, 'executed');\n`,
  );
  const revision = commitAll(repository, 'candidate Bun preload');

  const invocation = await invoke(repository, revision, requestPath);
  // Proof: starting the production CLI with `cwd: repository` loaded candidate-preload.ts, wrote
  // this sentinel, and failed the assertion before relationship extraction began.
  expect(existsSync(sentinel)).toBe(false);
  const extracted = report(invocation);
  expect(extracted.nx.projects.map(({ name }) => name)).toEqual([
    'consumer',
    'minimal',
    'provider',
  ]);
}, 30_000);

test('stales an implicit ambient declaration used by the public surface', async () => {
  const repository = createRepository();
  write(
    repository,
    'packages/provider/src/public.ts',
    "export interface PublicThing { value: string; nested: import('./hidden').Hidden; ambient: ImplicitAmbient }\n",
  );
  write(
    repository,
    'packages/provider/src/ambient.d.ts',
    'interface ImplicitAmbient { value: string }\n',
  );
  const requestPath = writeRequest(repository);
  const initial = report(
    await invoke(repository, commitAll(repository, 'ambient string'), requestPath),
  );

  write(
    repository,
    'packages/provider/src/ambient.d.ts',
    'interface ImplicitAmbient { value: number }\n',
  );
  const changed = report(
    await invoke(repository, commitAll(repository, 'ambient number'), requestPath),
  );

  expect(
    changed.typescript.publicDeclarations[0].declarations.map(({ sourcePath }) => sourcePath),
  ).toContain('packages/provider/src/ambient.d.ts');
  expect(changed.typescript.publicDeclarations[0].identity).not.toBe(
    initial.typescript.publicDeclarations[0].identity,
  );
}, 30_000);

test('stales an applicable module augmentation of a public type', async () => {
  const repository = createRepository();
  write(
    repository,
    'packages/provider/src/augmentation.d.ts',
    "import './hidden';\ndeclare module './hidden' { interface Hidden { augmented: string } }\n",
  );
  const requestPath = writeRequest(repository);
  const initial = report(
    await invoke(repository, commitAll(repository, 'string augmentation'), requestPath),
  );

  write(
    repository,
    'packages/provider/src/augmentation.d.ts',
    "import './hidden';\ndeclare module './hidden' { interface Hidden { augmented: number } }\n",
  );
  const changed = report(
    await invoke(repository, commitAll(repository, 'number augmentation'), requestPath),
  );

  expect(
    changed.typescript.publicDeclarations[0].declarations.map(({ sourcePath }) => sourcePath),
  ).toContain('packages/provider/src/augmentation.d.ts');
  expect(changed.typescript.publicDeclarations[0].identity).not.toBe(
    initial.typescript.publicDeclarations[0].identity,
  );
}, 30_000);

for (const ambientUse of ['keyof', 'generic default'] as const) {
  test(`stales an ambient declaration referenced through ${ambientUse}`, async () => {
    const repository = createRepository();
    const exportedDeclaration =
      ambientUse === 'keyof'
        ? 'export type AmbientKeys = keyof ImplicitAmbient;\n'
        : 'export interface AmbientBox<T = ImplicitAmbient> { value: T }\n';
    write(
      repository,
      'packages/provider/src/index.ts',
      "export default function publicDefault(): string { return 'public'; }\nexport { type PublicThing } from './public';\nexport { type Declared } from './shapes';\n" +
        exportedDeclaration,
    );
    write(
      repository,
      'packages/provider/src/ambient.d.ts',
      'interface ImplicitAmbient { before: string }\n',
    );
    const requestPath = writeRequest(repository);
    const initial = report(
      await invoke(repository, commitAll(repository, 'ambient before'), requestPath),
    );

    write(
      repository,
      'packages/provider/src/ambient.d.ts',
      'interface ImplicitAmbient { after: number }\n',
    );
    const changed = report(
      await invoke(repository, commitAll(repository, 'ambient after'), requestPath),
    );

    expect(
      changed.typescript.publicDeclarations[0].declarations.map(({ sourcePath }) => sourcePath),
    ).toContain('packages/provider/src/ambient.d.ts');
    expect(changed.typescript.publicDeclarations[0].identity).not.toBe(
      initial.typescript.publicDeclarations[0].identity,
    );
  }, 30_000);
}

function createVendorFixture(): { repository: string; modules: string; request: string } {
  const repository = createRepository();
  const runtime = mkdtempSync(join(tmpdir(), 'tool-wiki-vendors-'));
  pathsToRemove.push(runtime);
  const modules = join(runtime, 'trusted-node-modules');
  write(
    runtime,
    'trusted-node-modules/typescript/package.json',
    readFileSync(join(trustedNodeModules, 'typescript/package.json'), 'utf8'),
  );
  write(
    runtime,
    'trusted-node-modules/vendor-a/package.json',
    JSON.stringify({ name: 'vendor-a', version: '1.0.0', types: 'index.d.ts' }),
  );
  write(
    runtime,
    'trusted-node-modules/vendor-a/index.d.ts',
    "import type { Base } from 'vendor-b';\nexport interface Shape extends Base {}\n",
  );
  write(
    runtime,
    'trusted-node-modules/vendor-b/package.json',
    JSON.stringify({ name: 'vendor-b', version: '1.0.0', types: 'index.d.ts' }),
  );
  write(
    runtime,
    'trusted-node-modules/vendor-b/index.d.ts',
    'export interface Base { value: string }\n',
  );
  write(
    runtime,
    'node_modules/vendor-b/package.json',
    JSON.stringify({ name: 'vendor-b', version: '9.0.0', types: 'index.d.ts' }),
  );
  write(runtime, 'node_modules/vendor-b/index.d.ts', 'export interface Base { wrong: number }\n');
  write(
    repository,
    'vendor.ts',
    "import type { Shape } from 'vendor-a';\nexport const value = (shape: Shape): string => shape.value + shape.augmented;\n",
  );
  write(
    repository,
    'augmentation.d.ts',
    "import 'vendor-b';\ndeclare module 'vendor-b' { interface Base { augmented: string } }\n",
  );
  write(
    repository,
    'vendor-config.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        types: [],
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
      files: ['vendor.ts', 'augmentation.d.ts'],
    }),
  );
  const request = writeRequestInput(repository, {
    schemaVersion: 1,
    typescript: { configPaths: ['vendor-config.json'], publicEntrypoints: ['vendor.ts'] },
  });
  return { repository, modules, request };
}

test('resolves transitive trusted vendors under an arbitrary modules basename with augmentation', async () => {
  const fixture = createVendorFixture();
  const invocation = await invoke(
    fixture.repository,
    commitAll(fixture.repository, 'trusted vendor closure'),
    fixture.request,
    { TOOL_WIKI_TRUSTED_NODE_MODULES: fixture.modules },
  );
  expect(invocation.exitCode, output(invocation)).toBe(0);
  expect(
    report(invocation).typescript.publicDeclarations[0].declarations.some(
      ({ sourcePath }) => sourcePath === 'vendor.ts',
    ),
  ).toBe(true);
}, 20_000);

for (const decoy of [true, false]) {
  test(`refuses missing transitive trusted vendor with ancestor decoy ${String(decoy)}`, async () => {
    const fixture = createVendorFixture();
    rmSync(join(fixture.modules, 'vendor-b'), { recursive: true });
    write(fixture.repository, 'augmentation.d.ts', '');
    write(
      fixture.repository,
      'vendor.ts',
      "import type { Shape } from 'vendor-a';\nexport const value = (shape: Shape): string => shape.value;\n",
    );
    if (!decoy) rmSync(join(dirname(fixture.modules), 'node_modules'), { recursive: true });
    else
      write(
        dirname(fixture.modules),
        'node_modules/vendor-b/index.d.ts',
        'export interface Base { value: string }\n',
      );
    const invocation = await invoke(
      fixture.repository,
      commitAll(fixture.repository, 'missing trusted vendor'),
      fixture.request,
      { TOOL_WIKI_TRUSTED_NODE_MODULES: fixture.modules },
    );
    expect(invocation.exitCode, output(invocation)).toBe(1);
    expect(output(invocation)).toContain('TypeScript');
  }, 20_000);
}

for (const fault of ['unreadable', 'escape', 'copy failure', 'cycle', 'special'] as const) {
  test(`refuses trusted package ${fault} and cleans the materialized candidate`, async () => {
    const fixture = createVendorFixture();
    const source = join(fixture.modules, 'vendor-b/index.d.ts');
    if (fault === 'escape')
      write(
        dirname(fixture.modules),
        'node_modules/vendor-b/index.d.ts',
        'export interface Base { value: string }\n',
      );
    if (fault === 'unreadable') chmodSync(source, 0o000);
    else {
      rmSync(source);
      if (fault === 'special') {
        const made = Bun.spawnSync(['mkfifo', source], { stdout: 'pipe', stderr: 'pipe' });
        expect(made.exitCode, made.stderr.toString()).toBe(0);
      } else
        symlinkSync(
          fault === 'escape'
            ? '../../node_modules/vendor-b/index.d.ts'
            : fault === 'cycle'
              ? '.'
              : './absent',
          source,
        );
    }
    const scratch = join(dirname(fixture.modules), 'scratch');
    mkdirSync(scratch);
    const invocation = await invoke(
      fixture.repository,
      commitAll(fixture.repository, fault),
      fixture.request,
      { TOOL_WIKI_TRUSTED_NODE_MODULES: fixture.modules, TMPDIR: scratch },
    );
    expect(invocation.exitCode, output(invocation)).toBe(1);
    if (fault === 'unreadable')
      expect(output(invocation)).toContain('trusted runtime path unreadable');
    if (fault === 'escape')
      expect(output(invocation)).toContain('trusted runtime symlink escapes closure');
    if (fault === 'cycle') expect(output(invocation)).toContain('trusted runtime symlink cycle');
    if (fault === 'special')
      expect(output(invocation)).toContain('not a regular file or directory');
    expect(readdirSync(scratch)).toEqual([]);
  }, 20_000);
}

test('preserves scoped package config inheritance and nested vendor topology', async () => {
  const fixture = createVendorFixture();
  const runtime = dirname(fixture.modules);
  write(
    runtime,
    'trusted-node-modules/@fixture/config/package.json',
    JSON.stringify({
      name: '@fixture/config',
      version: '1.0.0',
      tsconfig: 'tsconfig.json',
    }),
  );
  write(
    runtime,
    'trusted-node-modules/@fixture/config/tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        types: [],
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
    }),
  );
  write(
    runtime,
    'trusted-node-modules/vendor-a/node_modules/vendor-b/package.json',
    JSON.stringify({
      name: 'vendor-b',
      version: '2.0.0',
      types: 'index.d.ts',
    }),
  );
  write(
    runtime,
    'trusted-node-modules/vendor-a/node_modules/vendor-b/index.d.ts',
    'export interface Base { value: string; nested: true }\n',
  );
  write(
    fixture.repository,
    'vendor-config.json',
    JSON.stringify({
      extends: '@fixture/config',
      files: ['vendor.ts', 'augmentation.d.ts'],
    }),
  );
  write(
    fixture.repository,
    'vendor.ts',
    "import type { Shape } from 'vendor-a';\nexport const value = (shape: Shape): true => shape.nested;\n",
  );
  const invocation = await invoke(
    fixture.repository,
    commitAll(fixture.repository, 'scoped nested closure'),
    fixture.request,
    { TOOL_WIKI_TRUSTED_NODE_MODULES: fixture.modules },
  );
  expect(invocation.exitCode, output(invocation)).toBe(0);
}, 20_000);

test('refuses absolute compiler inputs outside the candidate and trusted closure', async () => {
  const fixture = createVendorFixture();
  const outside = join(dirname(fixture.modules), 'outside.ts');
  writeFileSync(outside, 'export interface Outside { value: string }\n');
  write(
    fixture.repository,
    'vendor.ts',
    `import type { Outside } from '${outside}';\nexport type Public = Outside;\n`,
  );
  const invocation = await invoke(
    fixture.repository,
    commitAll(fixture.repository, 'outside import'),
    fixture.request,
    { TOOL_WIKI_TRUSTED_NODE_MODULES: fixture.modules },
  );
  expect(invocation.exitCode, output(invocation)).toBe(1);
  expect(output(invocation)).toContain('TypeScript import unresolved');
}, 20_000);

test('continues to refuse candidate-supplied runtime modules', async () => {
  const fixture = createVendorFixture();
  write(
    fixture.repository,
    'node_modules/vendor-b/index.d.ts',
    'export interface Base { value: string }\n',
  );
  const invocation = await invoke(
    fixture.repository,
    commitAll(fixture.repository, 'candidate modules'),
    fixture.request,
    { TOOL_WIKI_TRUSTED_NODE_MODULES: fixture.modules },
  );
  expect(invocation.exitCode).toBe(1);
  expect(output(invocation)).toContain(
    'relationship candidate may not supply trusted runtime modules',
  );
});

test('cleans a candidate rejected during snapshot symlink materialization', async () => {
  const fixture = createVendorFixture();
  symlinkSync('../outside', join(fixture.repository, 'escape'));
  const scratch = join(dirname(fixture.modules), 'scratch');
  mkdirSync(scratch);
  const invocation = await invoke(
    fixture.repository,
    commitAll(fixture.repository, 'candidate escape cleanup'),
    fixture.request,
    { TOOL_WIKI_TRUSTED_NODE_MODULES: fixture.modules, TMPDIR: scratch },
  );
  expect(invocation.exitCode).toBe(1);
  expect(output(invocation)).toContain('escapes the materialized candidate');
  expect(readdirSync(scratch)).toEqual([]);
});

test('refuses an outside declaration named directly by compiler configuration', async () => {
  const fixture = createVendorFixture();
  const outside = join(dirname(fixture.modules), 'outside.d.ts');
  writeFileSync(outside, 'interface UnadmittedGlobal { value: string }\n');
  write(
    fixture.repository,
    'vendor-config.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        types: [],
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
      files: ['vendor.ts', 'augmentation.d.ts', outside],
    }),
  );
  const invocation = await invoke(
    fixture.repository,
    commitAll(fixture.repository, 'outside configured declaration'),
    fixture.request,
    { TOOL_WIKI_TRUSTED_NODE_MODULES: fixture.modules },
  );
  expect(invocation.exitCode, output(invocation)).toBe(1);
});

for (const alias of [false, true]) {
  test(`refuses candidate nested modules with symlink alias ${String(alias)}`, async () => {
    const repository = createRepository();
    const packageRoot = alias ? 'src/dependencies' : 'src/node_modules';
    write(
      repository,
      `${packageRoot}/hidden/package.json`,
      JSON.stringify({
        name: 'hidden',
        version: '1.0.0',
        types: 'index.d.ts',
      }),
    );
    write(
      repository,
      `${packageRoot}/hidden/index.d.ts`,
      'export interface Hidden { value: string }\n',
    );
    if (alias) symlinkSync('dependencies', join(repository, 'src/node_modules'));
    write(
      repository,
      'src/main.ts',
      "import type { Hidden } from 'hidden';\nexport type Public = Hidden;\n",
    );
    write(
      repository,
      'nested-config.json',
      JSON.stringify({
        compilerOptions: {
          strict: true,
          types: [],
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
        files: ['src/main.ts'],
      }),
    );
    const request = writeRequestInput(repository, {
      schemaVersion: 1,
      typescript: { configPaths: ['nested-config.json'], publicEntrypoints: ['src/main.ts'] },
    });
    const invocation = await invoke(
      repository,
      commitAll(repository, 'candidate nested module'),
      request,
    );
    expect(invocation.exitCode, output(invocation)).toBe(1);
    if (!alias)
      expect(output(invocation)).toContain(
        'relationship candidate may not supply trusted runtime modules',
      );
  });
}
