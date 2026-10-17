import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';
import type ts from 'typescript';

import type * as CompilerDerivative from './compiler-derivative';
import {
  buildCompilerDerivative,
  type PathsSubstitutionAttempt,
  readCompilerDerivative,
  replaceCompilerSection,
  verifyCompilerDerivative,
  writeCompilerDerivative,
} from './compiler-derivative';

const require = createRequire(import.meta.url);
const roots: string[] = [];
interface ResolutionEvent {
  kind: 'attempt' | 'file' | 'directory' | 'read';
  path: string;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function refusalOf(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  throw new Error('expected artifact refusal');
}

async function loadCompiler() {
  const upstream = await readFile(require.resolve('@typescript/old/lib/typescript.js'), 'utf8');
  const artifact = buildCompilerDerivative(upstream);
  verifyCompilerDerivative(artifact.source, artifact.manifest);
  const root = await mkdtemp(join(tmpdir(), 'compiler-derivative-'));
  roots.push(root);
  const executable = join(root, 'compiler.cjs');
  await writeFile(executable, artifact.source);
  // The build verifies the pinned executable digest before this test boundary loads its API.
  return require(executable) as typeof ts;
}

function resolveWith(
  compiler: typeof ts,
  specifier: string,
  paths: Record<string, string[]> | undefined,
  files: Record<string, string>,
  observe: (attempt: PathsSubstitutionAttempt) => unknown,
  io: ResolutionEvent[] = [],
) {
  const host: ts.ModuleResolutionHost & {
    onPathsSubstitutionAttempt: (attempt: PathsSubstitutionAttempt) => unknown;
  } = {
    fileExists: (path) => {
      io.push({ kind: 'file', path });
      return Object.hasOwn(files, path);
    },
    readFile: (path) => {
      io.push({ kind: 'read', path });
      return files[path];
    },
    directoryExists: (path) => {
      io.push({ kind: 'directory', path });
      return true;
    },
    onPathsSubstitutionAttempt: (attempt) => {
      io.push({ kind: 'attempt', path: attempt.candidate });
      return observe(attempt);
    },
  };
  return compiler.resolveModuleName(
    specifier,
    '/workspace/src/main.ts',
    {
      moduleResolution: compiler.ModuleResolutionKind.Node16,
      module: compiler.ModuleKind.Node16,
      baseUrl: '/workspace',
      paths,
    },
    host,
  );
}

test('first escaping wildcard attempt throws before candidate IO or safe fallback', async () => {
  const compiler = await loadCompiler();
  const io: ResolutionEvent[] = [];
  const attempts: PathsSubstitutionAttempt[] = [];
  const refusal = new Error('outside retained namespace');
  expect(() =>
    resolveWith(
      compiler,
      '@feature/value',
      {
        '@feature/*': ['../outside/*', 'safe/*'],
      },
      { '/workspace/safe/value.ts': '' },
      (attempt) => {
        attempts.push(attempt);
        throw refusal;
      },
      io,
    ),
  ).toThrow(refusal);
  expect(attempts).toEqual([
    {
      kind: 'compiler-options-paths-substitution',
      specifier: '@feature/value',
      baseDirectory: '/workspace',
      pattern: '@feature/*',
      substitution: '../outside/*',
      candidate: '/outside/value',
    },
  ]);
  expect(io).toEqual([{ kind: 'attempt', path: '/outside/value' }]);
});

test('explicit extension fast path observes normalized attempt before tryFile', async () => {
  const compiler = await loadCompiler();
  const order: ResolutionEvent[] = [];
  const resolution = resolveWith(
    compiler,
    '@feature/value',
    {
      '@feature/*': ['src/../safe/*.ts'],
    },
    { '/workspace/safe/value.ts': '' },
    () => {
      return { resolvedModule: { resolvedFileName: '/injected.ts' } };
    },
    order,
  );
  expect(order.slice(0, 2)).toEqual([
    { kind: 'attempt', path: '/workspace/safe/value.ts' },
    { kind: 'file', path: '/workspace/safe/value.ts' },
  ]);
  expect(resolution.resolvedModule?.resolvedFileName).toBe('/workspace/safe/value.ts');
});

test('missing attempts preserve order and success stops later substitutions', async () => {
  const compiler = await loadCompiler();
  const attempts: PathsSubstitutionAttempt[] = [];
  const resolution = resolveWith(
    compiler,
    '@feature/value',
    {
      '@feature/*': ['missing/*', 'safe/*', 'never/*'],
    },
    { '/workspace/safe/value.ts': '' },
    (attempt) => attempts.push(attempt),
  );
  expect(attempts.map((attempt) => attempt.candidate)).toEqual([
    '/workspace/missing/value',
    '/workspace/safe/value',
  ]);
  expect(resolution.resolvedModule?.resolvedFileName).toBe('/workspace/safe/value.ts');
});

test('ordinary ancestor package probes produce no paths attempt', async () => {
  const compiler = await loadCompiler();
  const attempts: PathsSubstitutionAttempt[] = [];
  const io: ResolutionEvent[] = [];
  resolveWith(compiler, 'missing-package', undefined, {}, (attempt) => attempts.push(attempt), io);
  expect(attempts).toEqual([]);
  expect(io.some((event) => event.path.includes('/node_modules/'))).toBe(true);
});

test('package typesVersions substitutions do not claim compiler options origin', async () => {
  const compiler = await loadCompiler();
  const attempts: PathsSubstitutionAttempt[] = [];
  const resolution = resolveWith(
    compiler,
    'dependency/feature',
    undefined,
    {
      '/workspace/node_modules/dependency/package.json': JSON.stringify({
        name: 'dependency',
        version: '1.0.0',
        typesVersions: { '*': { '*': ['v6/*'] } },
      }),
      '/workspace/node_modules/dependency/v6/feature.d.ts': '',
    },
    (attempt) => attempts.push(attempt),
  );
  expect(attempts).toEqual([]);
  expect(resolution.resolvedModule?.resolvedFileName).toBe(
    '/workspace/node_modules/dependency/v6/feature.d.ts',
  );
});

test('build refuses altered upstream executable', async () => {
  const upstream = await readFile(require.resolve('@typescript/old/lib/typescript.js'), 'utf8');
  expect(() => buildCompilerDerivative(`${upstream}\n`)).toThrow('input digest');
});

test.each(['absent', 'needle needle'])('exact replacement refuses %s matches', (source) => {
  expect(() => replaceCompilerSection(source, 'needle', 'replacement')).toThrow('exactly once');
});

test('manifest verifier refuses output tampering and digest rebinding', async () => {
  const upstream = await readFile(require.resolve('@typescript/old/lib/typescript.js'), 'utf8');
  const artifact = buildCompilerDerivative(upstream);
  expect(() => {
    verifyCompilerDerivative(`${artifact.source}\n`, artifact.manifest);
  }).toThrow('output digest');
  const altered = `${artifact.source}\n`;
  expect(() => {
    verifyCompilerDerivative(altered, {
      ...artifact.manifest,
      outputSha256: createHash('sha256').update(altered).digest('hex'),
    });
  }).toThrow('manifest');
  expect(() => {
    verifyCompilerDerivative(artifact.source, {
      ...artifact.manifest,
      inputSha256: '0'.repeat(64),
    });
  }).toThrow('manifest');
});

test('explicit extension refusal prevents every file and directory probe', async () => {
  const compiler = await loadCompiler();
  const events: ResolutionEvent[] = [];
  const refusal = new Error('extension candidate refused');
  expect(() =>
    resolveWith(
      compiler,
      '@feature/value',
      {
        '@feature/*': ['../outside/*.ts', 'safe/*.ts'],
      },
      { '/workspace/safe/value.ts': '' },
      () => {
        throw refusal;
      },
      events,
    ),
  ).toThrow(refusal);
  expect(events).toEqual([{ kind: 'attempt', path: '/outside/value.ts' }]);
});

test('bare package types entry uses typesVersions without compiler options event', async () => {
  const compiler = await loadCompiler();
  const attempts: PathsSubstitutionAttempt[] = [];
  const resolution = resolveWith(
    compiler,
    'dependency',
    undefined,
    {
      '/workspace/node_modules/dependency/package.json': JSON.stringify({
        name: 'dependency',
        version: '1.0.0',
        types: 'index.d.ts',
        typesVersions: { '*': { '*': ['v6/*'] } },
      }),
      '/workspace/node_modules/dependency/v6/index.d.ts': '',
    },
    (attempt) => attempts.push(attempt),
  );
  expect(attempts).toEqual([]);
  expect(resolution.resolvedModule?.resolvedFileName).toBe(
    '/workspace/node_modules/dependency/v6/index.d.ts',
  );
});

async function writeArtifact() {
  const root = await mkdtemp(join(tmpdir(), 'compiler-artifact-'));
  roots.push(root);
  const directory = join(root, 'derivative');
  await writeCompilerDerivative(directory);
  return directory;
}

test('explicit artifact carries compiler manifest upstream license and modification notice', async () => {
  const directory = await writeArtifact();
  const artifact = await readCompilerDerivative(directory);
  const compiler = require(join(directory, 'compiler.cjs')) as typeof ts;
  expect(compiler.version).toBe('6.0.3');
  expect(artifact.source).toBe(await readFile(join(directory, 'compiler.cjs'), 'utf8'));
  expect(await readFile(join(directory, 'LICENSE.txt'), 'utf8')).toBe(
    await readFile(require.resolve('@typescript/old/LICENSE.txt'), 'utf8'),
  );
  expect(
    (await readFile(join(directory, 'NOTICE'), 'utf8')).startsWith(
      await readFile(require.resolve('@typescript/old/ThirdPartyNoticeText.txt'), 'utf8'),
    ),
  ).toBe(true);
  expect(await readFile(join(directory, 'NOTICE'), 'utf8')).toContain(
    'Modified by Prosperous Unification: compiler-options paths substitution observation.',
  );
  expect(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))).toEqual(
    artifact.manifest,
  );
});

test.each(['compiler.cjs', 'manifest.json', 'LICENSE.txt', 'NOTICE'])(
  'artifact reader refuses absent %s',
  async (member) => {
    const directory = await writeArtifact();
    await rm(join(directory, member));
    expect(await refusalOf(readCompilerDerivative(directory))).not.toBe('');
  },
);

test.each(['compiler.cjs', 'manifest.json', 'LICENSE.txt', 'NOTICE'])(
  'artifact reader refuses altered %s',
  async (member) => {
    const directory = await writeArtifact();
    const path = join(directory, member);
    const original = await readFile(path, 'utf8');
    await writeFile(
      path,
      member === 'manifest.json'
        ? JSON.stringify({ ...JSON.parse(original), outputSha256: '0'.repeat(64) })
        : `${original}altered`,
    );
    expect(await refusalOf(readCompilerDerivative(directory))).not.toBe('');
  },
);

// These faults alter the builder's actual intermediate bytes after its input check. They
// exercise buildCompilerDerivative, including the independent section/output guards.
test.each([
  {
    name: 'missing section',
    insertion: 'upstream.replace("function tryLoadModuleUsingPaths(", "function missingPaths(")',
    message: 'exactly once',
  },
  {
    name: 'duplicate section',
    insertion:
      'upstream + "\\nfunction tryLoadModuleUsingPaths(extensions, moduleName, baseDirectory, paths, pathPatterns, loader, onlyRecordFailures, state) {"',
    message: 'exactly once',
  },
  { name: 'altered output', insertion: 'upstream + "\\n"', message: 'output digest' },
])('builder refuses $name after pinned input verification', async ({ insertion, message }) => {
  const root = await mkdtemp(join(tmpdir(), 'compiler-builder-fault-'));
  roots.push(root);
  const modulePath = join(root, 'compiler-derivative.ts');
  const builder = await readFile(new URL('./compiler-derivative.ts', import.meta.url), 'utf8');
  const seam = '  let instrumented = upstream;';
  expect(builder.split(seam)).toHaveLength(2);
  await writeFile(modulePath, builder.replace(seam, `  let instrumented = ${insertion};`));
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--eval',
      `
    import { readFile } from 'node:fs/promises';
    const { buildCompilerDerivative } = await import(process.env['COMPILER_FAULT_MODULE']);
    buildCompilerDerivative(await readFile(process.env['COMPILER_UPSTREAM'], 'utf8'));
  `,
    ],
    {
      env: {
        ...process.env,
        COMPILER_FAULT_MODULE: modulePath,
        COMPILER_UPSTREAM: require.resolve('@typescript/old/lib/typescript.js'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(child.exitCode).not.toBe(0);
  expect(child.stderr.toString()).toContain(message);
});

test.each(['compiler.cjs', 'manifest.json', 'LICENSE.txt', 'NOTICE'])(
  'artifact reader refuses unreadable %s',
  async (member) => {
    const directory = await writeArtifact();
    await chmod(join(directory, member), 0o000);
    expect(await refusalOf(readCompilerDerivative(directory))).toContain('EACCES');
  },
);

test.each([null, [], {}, { unexpected: true }].map((supplied) => ({ supplied })))(
  'manifest refuses malformed closed shape $supplied',
  async ({ supplied }) => {
    const upstream = await readFile(require.resolve('@typescript/old/lib/typescript.js'), 'utf8');
    const artifact = buildCompilerDerivative(upstream);
    expect(() => {
      verifyCompilerDerivative(artifact.source, supplied);
    }).toThrow('manifest');
  },
);

test('returned manifest cannot rebind later verifier identities', async () => {
  const upstream = await readFile(require.resolve('@typescript/old/lib/typescript.js'), 'utf8');
  const artifact = buildCompilerDerivative(upstream);
  expect(() => {
    Reflect.set(artifact.manifest, 'inputSha256', '0'.repeat(64));
    verifyCompilerDerivative(artifact.source, {
      ...artifact.manifest,
      inputSha256: '0'.repeat(64),
    });
  }).toThrow('manifest');
});

test.each(['absent', 'altered'])(
  'writer refuses %s upstream license before artifact creation',
  async (fault) => {
    const root = await mkdtemp(join(tmpdir(), 'compiler-license-fault-'));
    roots.push(root);
    const modulePath = join(root, 'compiler-derivative.ts');
    await writeFile(
      modulePath,
      await readFile(new URL('./compiler-derivative.ts', import.meta.url), 'utf8'),
    );
    const upstreamDirectory = join(root, 'node_modules/@typescript/old');
    await mkdir(join(upstreamDirectory, 'lib'), { recursive: true });
    await writeFile(
      join(upstreamDirectory, 'lib/typescript.js'),
      await readFile(require.resolve('@typescript/old/lib/typescript.js')),
    );
    await writeFile(
      join(upstreamDirectory, 'ThirdPartyNoticeText.txt'),
      await readFile(require.resolve('@typescript/old/ThirdPartyNoticeText.txt')),
    );
    if (fault === 'altered')
      await writeFile(join(upstreamDirectory, 'LICENSE.txt'), 'wrong license');
    const copied = (await import(modulePath)) as typeof CompilerDerivative;
    const directory = join(root, 'artifact');
    expect(await refusalOf(copied.writeCompilerDerivative(directory))).toContain(
      fault === 'absent' ? 'ENOENT' : 'license digest',
    );
    expect(await refusalOf(stat(directory))).toContain('ENOENT');
  },
);

test.each(['absent', 'altered'])(
  'writer refuses %s upstream notice before artifact creation',
  async (fault) => {
    const root = await mkdtemp(join(tmpdir(), 'compiler-notice-fault-'));
    roots.push(root);
    const modulePath = join(root, 'compiler-derivative.ts');
    await writeFile(
      modulePath,
      await readFile(new URL('./compiler-derivative.ts', import.meta.url), 'utf8'),
    );
    const upstreamDirectory = join(root, 'node_modules/@typescript/old');
    await mkdir(join(upstreamDirectory, 'lib'), { recursive: true });
    await writeFile(
      join(upstreamDirectory, 'lib/typescript.js'),
      await readFile(require.resolve('@typescript/old/lib/typescript.js')),
    );
    await writeFile(
      join(upstreamDirectory, 'LICENSE.txt'),
      await readFile(require.resolve('@typescript/old/LICENSE.txt')),
    );
    if (fault === 'altered')
      await writeFile(join(upstreamDirectory, 'ThirdPartyNoticeText.txt'), 'wrong notice');
    const copied = (await import(modulePath)) as typeof CompilerDerivative;
    const directory = join(root, 'artifact');
    expect(await refusalOf(copied.writeCompilerDerivative(directory))).toContain(
      fault === 'absent' ? 'ENOENT' : 'upstream notice digest',
    );
    expect(await refusalOf(stat(directory))).toContain('ENOENT');
  },
);
