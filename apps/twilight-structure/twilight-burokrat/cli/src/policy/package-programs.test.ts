import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { createToolkitProducerFixture } from '../testing/toolkit-producer-fixture';
import { readBuildDependencies } from './build-dependencies';
import { captureCommittedSource } from './committed-source';
import { materializeProtectedSource } from './materialized-source';
import { buildPuniPrograms } from './preparation-roles';
import { disposeRelocationFixtures } from './relocation-fixtures';

const roots: string[] = [];
afterAll(() => {
  disposeRelocationFixtures();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
it('builds root five toolkit roles and observation once from captured programs and SQL after live source changes', async () => {
  const fixture = await createToolkitProducerFixture(roots);
  const workspace = resolve(import.meta.dir, '../../../../../..');
  const dash = 'apps/twilight-structure/twilight-dash/cli/src/';
  const format = dash + 'runs/sqlite/format.ts';
  const assets = [
    '0001-run-store',
    '0002-runtime-authority',
    '0003-execution-history',
    '0004-runtime-recovery',
    '0005-identity-keys',
    '0006-runtime-write',
  ].flatMap((name) =>
    ['migration.sql', 'down.sql'].map(
      (file) => dash + 'runs/sqlite/migrations/' + name + '/' + file,
    ),
  );
  for (const path of [format, ...assets]) {
    const target = join(fixture.repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(workspace, path)));
  }
  const canaryPath = assets.at(0);
  if (canaryPath === undefined) throw new Error('captured SQL roster absent');
  const canaryFile = join(fixture.repository, canaryPath);
  writeFileSync(
    canaryFile,
    Buffer.concat([
      Buffer.from('\ufeff-- ' + join(fixture.root, 'view') + '/legitimate-data-prefix λ雪\r\n'),
      readFileSync(canaryFile),
    ]),
  );
  const metadataPath = join(fixture.repository, 'apps/puni/cli/src/metadata.cjs');
  mkdirSync(dirname(metadataPath), { recursive: true });
  writeFileSync(metadataPath, 'module.exports={directory:__dirname,filename:__filename};');
  const rootPath = 'apps/puni/cli/src/entrypoint.ts',
    observation = dash + 'activation/observation-service-cli.ts',
    forge = 'tools/tool-devsync/src/k3s/forge-supervisor-core.ts';
  for (const [path, kind] of [
    [rootPath, 'root-captured-B'],
    [observation, 'observation-captured-B'],
    [forge, 'forge-captured-B'],
  ] as const) {
    const target = join(fixture.repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      'import metadata from ' +
        JSON.stringify(
          path === rootPath
            ? './metadata.cjs'
            : path === forge
              ? '../../../../apps/puni/cli/src/metadata.cjs'
              : '../../../../../puni/cli/src/metadata.cjs',
        ) +
        ';import{MIGRATIONS}from ' +
        JSON.stringify(
          path === rootPath
            ? '../../../twilight-structure/twilight-dash/cli/src/runs/sqlite/format'
            : path === forge
              ? '../../../../apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/format'
              : '../runs/sqlite/format',
        ) +
        ';console.log(JSON.stringify({kind:' +
        JSON.stringify(kind) +
        ',metadata,sql:MIGRATIONS.map(m=>[m.forward,m.down,m.forwardHash,m.downHash])}));',
    );
  }
  function git(args: string[]) {
    const child = Bun.spawnSync(['/usr/bin/git', '-C', fixture.repository, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return child.stdout.toString().trim();
  }
  git(['add', '--all']);
  git(['commit', '-m', 'captured coordinated program roster']);
  const capture = await captureCommittedSource(git(['rev-parse', 'HEAD']), {
    repository: fixture.repository,
    runtime: fixture.context.runtime,
    subscribeInterrupts: fixture.context.subscribeInterrupts,
  });
  if (capture.kind !== 'captured') throw new Error('fixture capture unexpectedly cancelled');
  const dependencies = readBuildDependencies(capture.source, fixture.installation);
  const materialized = await materializeProtectedSource(
    capture.source,
    join(fixture.root, 'view'),
    {
      callerDirectory: fixture.root,
      protectedPaths: [fixture.repository, fixture.installation],
      subscribeInterrupts: fixture.context.subscribeInterrupts,
    },
  );
  if (materialized.kind !== 'materialized')
    throw new Error('fixture materialization unexpectedly cancelled');
  for (const path of [rootPath, observation, forge, ...assets]) {
    writeFileSync(join(fixture.repository, path), 'throw new Error("live source must not run");');
    writeFileSync(
      join(materialized.directory, path),
      'throw new Error("materialized source must not replace captured bytes");',
    );
  }
  const aliases = {
    ...dependencies,
    names: [...dependencies.names],
    protectedPaths: [...dependencies.protectedPaths],
  };
  const context = {
    materializedDirectory: materialized.directory,
    dependencies: aliases,
    subscribeInterrupts: () => {
      context.materializedDirectory = '/absent-mutated-materialization';
      aliases.directory = '/absent-mutated-dependencies';
      aliases.identity = '0'.repeat(64);
      aliases.names.length = 0;
      aliases.protectedPaths.length = 0;
      aliases.bunVersion = '0.0.0';
      aliases.compilerVersion = '0.0.0';
      return () => undefined;
    },
  };
  const built = await buildPuniPrograms(capture.source, context);
  if (built.kind !== 'built') throw new Error('fixture build unexpectedly cancelled');
  expect(Object.keys(built.roleBytes).sort()).toEqual(
    [
      'launcher.mjs',
      'snapshotter.ts',
      'validator.mjs',
      'prepare-activation.mjs',
      'prepare-relocation-activation.mjs',
      'puni.mjs',
      'observation-service.mjs',
      'forge-supervisor.mjs',
      'performance-judge.mjs',
    ].sort(),
  );
  expect(built.runtimeAssetLoads).toEqual([]);
  const expected = assets
    .filter((path) => path.endsWith('/migration.sql'))
    .map((path) => {
      const forward = Buffer.from(capture.source.readFile(path)).toString(),
        down = Buffer.from(
          capture.source.readFile(path.replace(/migration.sql$/, 'down.sql')),
        ).toString();
      return [
        forward,
        down,
        new Bun.CryptoHasher('sha256').update(forward).digest('hex'),
        new Bun.CryptoHasher('sha256').update(down).digest('hex'),
      ];
    });
  for (const [program, kind] of [
    ['puni.mjs', 'root-captured-B'],
    ['observation-service.mjs', 'observation-captured-B'],
    ['forge-supervisor.mjs', 'forge-captured-B'],
  ] as const) {
    const bytes = built.roleBytes[program],
      entry = join(fixture.root, program);
    writeFileSync(entry, bytes);
    const child = Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
      cwd: fixture.root,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(JSON.parse(child.stdout.toString())).toEqual({
      kind,
      metadata: {
        directory: '/puni-captured/apps/puni/cli/src',
        filename: '/puni-captured/apps/puni/cli/src/metadata.cjs',
      },
      sql: expected,
    });
  }
  for (const program of [
    'launcher.mjs',
    'puni.mjs',
    'prepare-activation.mjs',
    'prepare-relocation-activation.mjs',
  ] as const)
    expect(Buffer.from(built.roleBytes[program]).toString().match(/^#!/gm)?.length).toBe(1);
}, 60000);
