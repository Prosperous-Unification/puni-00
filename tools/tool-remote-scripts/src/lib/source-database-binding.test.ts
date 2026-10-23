import { rejects } from 'node:assert/strict';
import {
  chmod,
  link,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';

import { afterEach, expect, test } from 'bun:test';

import { sourceDatabaseFixture } from '../fixtures/source-database-binding';
import { roots } from '../fixtures/source-startup';
import { observeSourceDatabaseBindings } from './source-database-binding';
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
test('binds actual arbitrary prod and dev filenames with independent live source probes', async () => {
  const f = await sourceDatabaseFixture();
  await f.scoped(async (owner, source, solver, deadline) => {
    const observed = await observeSourceDatabaseBindings(
      owner,
      f.layouts,
      source,
      solver,
      f.pins,
      f.contents,
      f.docker,
      deadline,
    );
    expect(observed.prod.host).toBe(f.prodPath);
    expect(observed.dev.host).toBe(f.devPath);
    expect(observed.activation).toBe('blocked');
    expect(f.probes()).toBe(4);
    expect(Object.isFrozen(observed.dev)).toBe(true);
  });
});

test('admits inherited agreement, export and CRLF with stable native mount permutations', async () => {
  const f = await sourceDatabaseFixture(
    'export DB_PATH=/data/development.sqlite\r\nexport MIGRATE_ON_STARTUP=false\r\n',
    ['DB_PATH=/data/development.sqlite', 'MIGRATE_ON_STARTUP=false'],
  );
  await f.scoped(async (owner, source, solver, deadline) => {
    f.setIntercept((args) => {
      if (args[0] === 'inspect') f.source.Mounts.reverse();
      return Promise.resolve();
    });
    const observed = await observeSourceDatabaseBindings(
      owner,
      f.layouts,
      source,
      solver,
      f.pins,
      f.contents,
      f.docker,
      deadline,
    );
    expect(observed.dev.path).toBe('/data/development.sqlite');
  });
});

for (const [name, assignment] of [
  ['missing', ''],
  ['relative', 'DB_PATH=development.sqlite\n'],
  ['quoted', 'DB_PATH="/data/development.sqlite"\n'],
  ['expanded', 'DB_PATH=/data/$NAME\n'],
  ['comment', 'DB_PATH=/data/development.sqlite #secret\n'],
  ['duplicate', 'DB_PATH=/data/development.sqlite\nDB_PATH=/data/development.sqlite\n'],
  ['wrong root', 'DB_PATH=/else/development.sqlite\n'],
  ['dot segment', 'DB_PATH=/data/./development.sqlite\n'],
  ['dotdot segment', 'DB_PATH=/data/nested/../development.sqlite\n'],
  ['double slash', 'DB_PATH=/data//development.sqlite\n'],
  ['trailing slash', 'DB_PATH=/data/development.sqlite/\n'],
  ['empty', 'DB_PATH=\n'],
] as const)
  test(`refuses pinned ${name} storage syntax without private diagnostic`, async () => {
    const f = await sourceDatabaseFixture(
      assignment + 'MIGRATE_ON_STARTUP=false\nPRIVATE_SENTINEL=never-print-this\n',
    );
    await f.scoped(async (owner, source, solver, deadline) => {
      await rejects(
        observeSourceDatabaseBindings(
          owner,
          f.layouts,
          source,
          solver,
          f.pins,
          f.contents,
          f.docker,
          deadline,
        ),
        /^Error: source database binding refused$/,
      );
    });
  });
for (const inherited of [
  'DB_PATH=/data/foreign.sqlite',
  'DB_PATH=',
  'DB_PATH="/data/development.sqlite"',
  'MIGRATE_ON_STARTUP=true',
  'MIGRATE_ON_STARTUP=',
])
  test(`refuses inherited storage disagreement ${inherited.split('=')[0]} ${String(inherited.length)}`, async () => {
    const f = await sourceDatabaseFixture(undefined, [inherited]);
    await f.scoped(async (owner, source, solver, deadline) => {
      await rejects(
        observeSourceDatabaseBindings(
          owner,
          f.layouts,
          source,
          solver,
          f.pins,
          f.contents,
          f.docker,
          deadline,
        ),
        /source database binding refused/,
      );
    });
  });
test('requires exact shared solver deadline before any nested observation', async () => {
  const f = await sourceDatabaseFixture();
  await f.scoped(async (owner, source, solver, deadline) => {
    const count = f.commands.length;
    for (const budget of [deadline - 1, deadline + 1, NaN, Infinity, performance.now() - 1]) {
      await rejects(
        observeSourceDatabaseBindings(
          owner,
          f.layouts,
          source,
          solver,
          f.pins,
          f.contents,
          f.docker,
          budget,
        ),
        /source database binding refused/,
      );
      expect(f.commands.length).toBe(count);
    }
  });
});
test('rejects copied owner, solver and source tokens before publishing any observation', async () => {
  const f = await sourceDatabaseFixture();
  await f.scoped(async (owner, source, solver, deadline) => {
    for (const [owned, excluded, drained] of [
      [{ ...owner }, source, solver],
      [owner, { ...source }, solver],
      [owner, source, { ...solver }],
    ] as const)
      await rejects(
        observeSourceDatabaseBindings(
          owned,
          f.layouts,
          excluded,
          drained,
          f.pins,
          f.contents,
          f.docker,
          deadline,
        ),
        /source database binding refused/,
      );
  });
});

test('native pinned Bun at actual tier cwd proves dotenv fallback and inherited precedence without opening DB', async () => {
  const f = await sourceDatabaseFixture(
    'export DB_PATH=/data/development.sqlite\r\nMIGRATE_ON_STARTUP=false\r\n',
  );
  for (const inherited of [
    {},
    { DB_PATH: '/data/development.sqlite' },
    { DB_PATH: '/data/foreign.sqlite', MIGRATE_ON_STARTUP: 'true' },
  ]) {
    const child = Bun.spawn(
      [process.execPath, `${import.meta.dir}/../fixtures/source-database-dotenv.ts`],
      {
        cwd: `${f.sourceRoot}/apps/wbs/be-01`,
        env: { PATH: process.env['PATH'], NODE_ENV: 'development', ...inherited },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({
      DB_PATH: inherited.DB_PATH ?? '/data/development.sqlite',
      MIGRATE_ON_STARTUP: inherited.MIGRATE_ON_STARTUP ?? 'false',
    });
  }
});

for (const fault of [
  'dev-main-absent',
  'dev-main-unreadable',
  'dev-sidecar-symlink',
  'dev-sidecar-directory',
  'dev-sidecar-unreadable',
  'main-hardlink',
  'sidecar-hardlink',
  'prod-main-absent',
  'prod-main-unreadable',
  'dotenv-absent',
  'dotenv-unreadable',
  'dotenv-invalid-utf8',
  'unexpected-local-dotenv',
  'prod-outside-data',
] as const)
  test(`refuses actual filesystem fault ${fault}`, async () => {
    const f = await sourceDatabaseFixture();
    await f.scoped(async (owner, source, solver, deadline) => {
      if (fault === 'dev-main-absent') await unlink(f.devPath);
      if (fault === 'dev-main-unreadable') await chmod(f.devPath, 0);
      if (fault === 'dev-sidecar-symlink') await symlink('missing', f.devPath + '-wal');
      if (fault === 'dev-sidecar-directory') await mkdir(f.devPath + '-wal');
      if (fault === 'dev-sidecar-unreadable') {
        await writeFile(f.devPath + '-wal', 'private');
        await chmod(f.devPath + '-wal', 0);
      }
      if (fault === 'main-hardlink') {
        await unlink(f.devPath);
        await link(f.prodPath, f.devPath);
      }
      if (fault === 'sidecar-hardlink') await link(f.prodPath, f.devPath + '-journal');
      if (fault === 'prod-main-absent') await unlink(f.prodPath);
      if (fault === 'prod-main-unreadable') await chmod(f.prodPath, 0);
      const dotenv = `${f.sourceRoot}/apps/wbs/be-01/.env`;
      if (fault === 'dotenv-absent') await unlink(dotenv);
      if (fault === 'dotenv-unreadable') await chmod(dotenv, 0);
      if (fault === 'dotenv-invalid-utf8') await writeFile(dotenv, Buffer.from([0xff, 0xfe]));
      if (fault === 'unexpected-local-dotenv')
        await writeFile(
          `${f.sourceRoot}/apps/wbs/be-01/.env.local`,
          'PRIVATE_SENTINEL=never-print-this',
        );
      if (fault === 'prod-outside-data') {
        await rename(`${f.layouts.prod.root}/data`, `${f.layouts.prod.root}/wrong`);
        f.backend.Mounts[0].Source = `${f.layouts.prod.root}/wrong`;
      }
      await rejects(
        observeSourceDatabaseBindings(
          owner,
          f.layouts,
          source,
          solver,
          f.pins,
          f.contents,
          f.docker,
          deadline,
        ),
        /source database binding refused/,
      );
    });
  });

test('refuses actual fenced production database outside canonical production data root', async () => {
  const f = await sourceDatabaseFixture(undefined, [], 'wrong');
  await f.scoped(async (owner, source, solver, deadline) => {
    await rejects(
      observeSourceDatabaseBindings(
        owner,
        f.layouts,
        source,
        solver,
        f.pins,
        f.contents,
        f.docker,
        deadline,
      ),
      /source database binding refused/,
    );
  });
});

test('waits for real stalled native Docker CLI fixture abort and settlement at the shared deadline', async () => {
  const f = await sourceDatabaseFixture();
  const cli = `${f.root}/cli`;
  await mkdir(cli);
  await writeFile(`${cli}/docker`, '#!/bin/sh\nexec /bin/sleep 60\n', { mode: 0o755 });
  // Bun resolves executable search paths at process startup; only this child receives the fixture CLI.
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/../fixtures/source-database-deadline.ts`],
    {
      env: { ...process.env, PATH: `${cli}:${String(process.env['PATH'])}` },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  expect(stderr).toBe('');
  expect(JSON.parse(stdout)).toEqual({ started: true, settled: true, aborted: true });
});

for (const fault of [
  'same-byte-dotenv-replacement',
  'ancestor-swap-preserving-dotenv-hardlink',
  'dev-main-replacement',
  'dev-sidecar-appearance',
  'prod-main-replacement',
] as const)
  test(`refuses late ${fault} after final source tree readback`, async () => {
    const f = await sourceDatabaseFixture();
    let diffs = 0,
      postDiffQueries = 0,
      injected = false;
    await f.scoped(async (owner, source, solver, deadline) => {
      f.setIntercept(async (args) => {
        if (args[0] === 'diff') {
          diffs++;
          postDiffQueries = 0;
        }
        if (diffs !== 5 || args[0] !== 'ps' || ++postDiffQueries !== 4) return;
        injected = true;
        const tier = `${f.sourceRoot}/apps/wbs/be-01`,
          dotenv = `${tier}/.env`;
        if (fault === 'same-byte-dotenv-replacement') {
          const bytes = await readFile(dotenv);
          await rename(dotenv, dotenv + '.held');
          await writeFile(dotenv, bytes, { mode: 0o600 });
        }
        if (fault === 'ancestor-swap-preserving-dotenv-hardlink') {
          await rename(tier, tier + '.held');
          await mkdir(tier);
          await link(`${tier}.held/.env`, dotenv);
        }
        if (fault === 'dev-main-replacement') {
          await rename(f.devPath, f.devPath + '.held');
          await writeFile(f.devPath, 'replacement');
        }
        if (fault === 'dev-sidecar-appearance') await writeFile(f.devPath + '-wal', 'new sidecar');
        if (fault === 'prod-main-replacement') {
          await rename(f.prodPath, f.prodPath + '.held');
          await writeFile(f.prodPath, 'replacement');
        }
      });
      await rejects(
        observeSourceDatabaseBindings(
          owner,
          f.layouts,
          source,
          solver,
          f.pins,
          f.contents,
          f.docker,
          deadline,
        ),
        /source database binding refused/,
      );
      expect(injected).toBe(true);
    });
  });

test('refuses canonical nested production and source database directories', async () => {
  const f = await sourceDatabaseFixture(undefined, [], 'data', true);
  await f.scoped(async (owner, source, solver, deadline) => {
    await rejects(
      observeSourceDatabaseBindings(
        owner,
        f.layouts,
        source,
        solver,
        f.pins,
        f.contents,
        f.docker,
        deadline,
      ),
      /source database binding refused/,
    );
  });
});
