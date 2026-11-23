import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { afterEach, expect, it, spyOn } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { createToolkitProducerFixture } from '../testing/toolkit-producer-fixture';
import { readBuildDependencies } from './build-dependencies';
import { captureCommittedSource } from './committed-source';
import { forgeRuntimeLoaderPath } from './forge-loader-boundary';
import { materializeProtectedSource } from './materialized-source';
import { buildPuniPrograms } from './preparation-roles';

const roots: string[] = [];
const canRetire = new Set<string>();
afterEach(() => {
  const failures: unknown[] = [];
  for (const root of roots.splice(0)) {
    if (!canRetire.delete(root)) {
      failures.push(
        new Error('runtime loader producer fixture custody unconfirmed; retained ' + root),
      );
      continue;
    }
    try {
      rmSync(root, { recursive: true });
    } catch (cause: unknown) {
      failures.push(cause);
    }
  }
  if (failures.length !== 0)
    throw new AggregateError(failures, 'runtime loader producer fixture retirement failed');
});

async function createLoaderSource(
  variant:
    | 'healthy'
    | 'source-mismatch'
    | 'extra-loader-import'
    | 'extra-root-import'
    | 'root-alias'
    | 'unknown-role'
    | 'shared-role',
) {
  const fixture = await createToolkitProducerFixture(roots);
  const workspace = resolve(import.meta.dir, '../../../../../..');
  const rootEntry = 'apps/puni/cli/src/entrypoint.ts';
  const coreEntry = 'tools/tool-devsync/src/k3s/forge-supervisor-core.ts';
  const observerEntry =
    'apps/twilight-structure/twilight-dash/cli/src/activation/observation-service-cli.ts';
  let source = readFileSync(join(workspace, forgeRuntimeLoaderPath), 'utf8');
  if (variant === 'source-mismatch') {
    const guard = 'sha256 !== expectedSha256';
    if (source.split(guard).length !== 2) throw new Error('audited source digest guard differs');
    source = source.replace(guard, 'false');
  }
  if (variant === 'extra-loader-import')
    source += '\nexport const extra = () => import(process.env.OWNED_EXTRA_URL);\n';
  const files = new Map<string, string>([
    [forgeRuntimeLoaderPath, source],
    [
      rootEntry,
      variant === 'unknown-role'
        ? 'export const root = true;\n'
        : 'export {loadForgeRuntime} from "./packaging/forge-runtime-loader";\n',
    ],
    [
      coreEntry,
      variant === 'unknown-role' || variant === 'shared-role'
        ? 'export {loadForgeRuntime} from "../../../../apps/puni/cli/src/packaging/forge-runtime-loader";\n'
        : 'export const core = true;\n',
    ],
    [observerEntry, 'export const observation = true;\n'],
  ]);
  const rootBody = files.get(rootEntry);
  if (rootBody === undefined) throw new Error('fixture root entry disappeared');
  if (variant === 'extra-root-import')
    files.set(
      rootEntry,
      rootBody +
        'const address=process.env.OWNED_EXTRA_URL;export const extra=()=>import(address);\n',
    );
  if (variant === 'root-alias')
    files.set(
      rootEntry,
      rootBody + 'const unchecked=require;export const extra=(path)=>unchecked(path);\n',
    );
  for (const [path, contents] of files) {
    const destination = join(fixture.repository, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  }
  function runGit(args: readonly string[]): string {
    const child = Bun.spawnSync(['/usr/bin/git', '-C', fixture.repository, ...args], {
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 15000,
      killSignal: 'SIGKILL',
      maxBuffer: 1024 * 1024,
    });
    if (child.signalCode !== undefined || child.exitedDueToTimeout || child.exitedDueToMaxBuffer)
      throw new Error('loader source Git custody unconfirmed; fixture retained: ' + fixture.root);
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return child.stdout.toString().trim();
  }
  runGit(['add', '--all']);
  runGit(['commit', '-m', 'owned runtime loader source']);
  const captured = await captureCommittedSource(runGit(['rev-parse', 'HEAD']), {
    repository: fixture.repository,
    runtime: fixture.context.runtime,
    subscribeInterrupts: fixture.context.subscribeInterrupts,
  });
  if (captured.kind !== 'captured') throw new Error('loader source capture was cancelled');
  const dependencies = readBuildDependencies(captured.source, fixture.installation);
  const materialized = await materializeProtectedSource(
    captured.source,
    join(fixture.root, 'view'),
    {
      callerDirectory: fixture.root,
      protectedPaths: [fixture.repository, fixture.installation],
      subscribeInterrupts: fixture.context.subscribeInterrupts,
    },
  );
  if (materialized.kind !== 'materialized')
    throw new Error('loader source materialization was cancelled');
  return {
    ...fixture,
    captured: captured.source,
    source,
    context: {
      materializedDirectory: materialized.directory,
      dependencies,
      subscribeInterrupts: fixture.context.subscribeInterrupts,
    },
  };
}

it('actual producer admits one source-authenticated retained-byte loader only in the PUNI root', async () => {
  const fixture = await createLoaderSource('healthy');
  const nativeBuild = Bun.build.bind(Bun);
  let calls = 0;
  const unresolvedPatterns: (readonly string[] | undefined)[] = [];
  const observed = spyOn(Bun, 'build').mockImplementation(async (options) => {
    unresolvedPatterns.push(options.allowUnresolved?.slice());
    calls++;
    return await nativeBuild(options);
  });
  try {
    const built = await buildPuniPrograms(fixture.captured, fixture.context);
    if (built.kind !== 'built') throw new Error('loader producer was cancelled');
    canRetire.add(fixture.root);
    expect(calls).toBe(9);
    expect(unresolvedPatterns).toEqual([[], [], [], [], [], [''], [], [], []]);
    expect(built.runtimeAssetLoads).toHaveLength(1);
    const loader = built.runtimeAssetLoads.at(0);
    if (loader === undefined) throw new Error('loader manifest disappeared');
    expect(loader).toMatchObject({
      kind: 'retained-forge-core',
      sourcePath: forgeRuntimeLoaderPath,
      sourceSha256: hashBytes(Buffer.from(fixture.source)),
      role: 'puni.mjs',
      importCalls: 1,
      payloadFormat: 'puni-forge-runtime',
      payloadVersion: 1,
      cacheIdentity: 'sha256-data-url',
    });
    expect(loader.emittedSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(Buffer.from(built.roleBytes['puni.mjs']).toString()).toContain(
      'data:text/javascript;sha256=',
    );
  } finally {
    observed.mockRestore();
  }
}, 60000);

for (const variant of [
  'source-mismatch',
  'extra-loader-import',
  'extra-root-import',
  'root-alias',
  'unknown-role',
  'shared-role',
] as const)
  it(
    'actual producer refuses runtime asset boundary ' + variant + ' before any Bun build',
    async () => {
      const fixture = await createLoaderSource(variant);
      const nativeBuild = Bun.build.bind(Bun);
      let calls = 0;
      const observed = spyOn(Bun, 'build').mockImplementation(async (options) => {
        calls++;
        return await nativeBuild(options);
      });
      try {
        const reason =
          variant === 'source-mismatch' || variant === 'extra-loader-import'
            ? 'Forge runtime loader differs from producer-audited source'
            : variant === 'extra-root-import'
              ? 'preparation refuses an opaque first-party runtime loader'
              : variant === 'root-alias'
                ? 'preparation refuses an aliased first-party runtime loader'
                : 'audited Forge runtime loader is not exclusive to the PUNI root role';
        const failure: unknown = await buildPuniPrograms(fixture.captured, fixture.context).then(
          (outcome) => {
            if (outcome.kind === 'built') canRetire.add(fixture.root);
            return undefined;
          },
          (cause: unknown) => cause,
        );
        if (calls === 0 && failure instanceof Error && failure.message.includes(reason))
          canRetire.add(fixture.root);
        expect(calls).toBe(0);
        expect(failure).toBeInstanceOf(Error);
        if (!(failure instanceof Error)) throw new Error('missing actual producer refusal');
        expect(failure.message).toContain(reason);
      } finally {
        observed.mockRestore();
      }
    },
    60000,
  );
