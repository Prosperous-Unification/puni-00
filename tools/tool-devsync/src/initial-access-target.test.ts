import { chmod, mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { $ } from 'bun';
import { expect, it } from 'bun:test';

import {
  assertInitialAccessSourceAllowed,
  readInitialAccessMigrations,
} from './initial-access-admission';
import { deployRehearsalTarget, deploySolverTarget, solverTargetDependencies } from './sync';

const PROTECTED = '20261103110000_add_initial_access_offers';
const REFUSAL = 'initial-access source transition requires an attended cutover';

async function readRefusal(target: Promise<void>): Promise<string> {
  try {
    await target;
  } catch (error) {
    if (error instanceof Error) return error.message;
    throw error;
  }
  return '(target allowed)';
}

async function createRevisionPair(protectedCurrent: boolean, protectedName = PROTECTED) {
  const directory = await scratchAsync('initial-access-target-');
  const sourceRepository = join(directory, 'source');
  const migrations = join(sourceRepository, 'apps/wbs/be-01/drizzle');
  const exportedRuntime = join(directory, 'uninstalled-runtime');
  await mkdir(join(migrations, '0001_init'), { recursive: true });
  await mkdir(exportedRuntime);
  await writeFile(
    join(migrations, '0001_init/migration.sql'),
    'CREATE TABLE baseline (id TEXT);\n',
  );
  await $`git -C ${sourceRepository} init --quiet`;
  await $`git -C ${sourceRepository} add .`;
  await $`git -C ${sourceRepository} -c user.name=admission-test -c user.email=admission@example.invalid commit --quiet -m baseline`;
  const ordinary = (await $`git -C ${sourceRepository} rev-parse HEAD`.text()).trim();
  await mkdir(join(migrations, protectedName));
  const sql = await readFile(
    new URL('../../../apps/wbs/be-01/drizzle/' + protectedName + '/migration.sql', import.meta.url),
  );
  await writeFile(join(migrations, protectedName, 'migration.sql'), sql);
  await $`git -C ${sourceRepository} add .`;
  await $`git -C ${sourceRepository} -c user.name=admission-test -c user.email=admission@example.invalid commit --quiet -m protected`;
  const protectedRevision = (await $`git -C ${sourceRepository} rev-parse HEAD`.text()).trim();
  const current = protectedCurrent ? protectedRevision : ordinary;
  const target = protectedCurrent ? ordinary : protectedRevision;
  await $`git -C ${sourceRepository} reset --hard --quiet ${current}`;
  const dependencies = solverTargetDependencies({
    sourceRepository,
    runtimeRoot: exportedRuntime,
    solverConfigPath: join(directory, 'absent-config.json'),
  });
  return { sourceRepository, current, target, dependencies, migrations };
}

it.each(['unchanged', 'changed'] as const)(
  'refuses protected target before %s solver effects through real repository admission',
  async (solver) => {
    const fixture = await createRevisionPair(false);
    const effects: string[] = [];
    expect(
      await readRefusal(
        deploySolverTarget(fixture.target, {
          ...fixture.dependencies,
          changedPaths: () => Promise.resolve(solver === 'changed' ? ['solver.py'] : []),
          compatibilityIdentity: () => Promise.resolve('c'.repeat(64)),
          readState: () => {
            effects.push('read-state');
            return Promise.resolve(undefined);
          },
          prepare: () => {
            effects.push('prepare');
            return Promise.resolve();
          },
          preflight: () => {
            effects.push('preflight');
            return Promise.resolve();
          },
          reset: () => {
            effects.push('reset');
            return Promise.resolve();
          },
        }),
      ),
    ).toContain(REFUSAL);
    expect(effects).toEqual([]);
    expect((await $`git -C ${fixture.sourceRepository} rev-parse HEAD`.text()).trim()).toBe(
      fixture.current,
    );
  },
);

it.each(['target', 'current'] as const)(
  'refuses rehearsal protected %s before reset even when target removes protected folders',
  async (protectedSide) => {
    const fixture = await createRevisionPair(protectedSide === 'current');
    const effects: string[] = [];
    expect(
      await readRefusal(
        deployRehearsalTarget(fixture.target, {
          ...fixture.dependencies,
          changedPaths: () => Promise.resolve([]),
          reset: () => {
            effects.push('reset');
            return Promise.resolve();
          },
        }),
      ),
    ).toContain(REFUSAL);
    expect(effects).toEqual([]);
    expect((await $`git -C ${fixture.sourceRepository} rev-parse HEAD`.text()).trim()).toBe(
      fixture.current,
    );
  },
);

async function commitInventory(fixture: Awaited<ReturnType<typeof createRevisionPair>>) {
  await $`git -C ${fixture.sourceRepository} add -A`;
  await $`git -C ${fixture.sourceRepository} -c user.name=admission-test -c user.email=admission@example.invalid commit --quiet -m inventory`;
  return (await $`git -C ${fixture.sourceRepository} rev-parse HEAD`.text()).trim();
}

it.each(['20261102120000_add_access_grants', PROTECTED])(
  'refuses the independently present protected migration %s',
  async (protectedName) => {
    const fixture = await createRevisionPair(false, protectedName);
    const message = await readRefusal(
      assertInitialAccessSourceAllowed(fixture.sourceRepository, [fixture.current, fixture.target]),
    );
    expect(message).toContain(REFUSAL);
    expect(message).toContain(protectedName);
  },
);

it('reads original Git SQL bytes despite a changed worktree', async () => {
  const fixture = await createRevisionPair(false);
  await writeFile(join(fixture.migrations, '0001_init/migration.sql'), 'uncommitted replacement\n');
  expect(await readInitialAccessMigrations(fixture.sourceRepository, fixture.current)).toEqual([
    {
      name: '0001_init',
      sha256: new Bun.CryptoHasher('sha256')
        .update('CREATE TABLE baseline (id TEXT);\n')
        .digest('hex'),
    },
  ]);
  expect(
    await readRefusal(
      assertInitialAccessSourceAllowed(fixture.sourceRepository, [fixture.current]),
    ),
  ).toBe('(target allowed)');
});

it('refuses changed protected SQL instead of interpreting its hash as absence', async () => {
  const fixture = await createRevisionPair(true);
  await writeFile(join(fixture.migrations, PROTECTED, 'migration.sql'), 'changed protected SQL\n');
  const revision = await commitInventory(fixture);
  const message = await readRefusal(
    assertInitialAccessSourceAllowed(fixture.sourceRepository, [revision]),
  );
  expect(message).toContain(REFUSAL);
  expect(message).toContain(PROTECTED);
  expect(message).toContain(
    new Bun.CryptoHasher('sha256').update('changed protected SQL\n').digest('hex'),
  );
});

it.each(['missing', 'symlink', 'executable'] as const)(
  'refuses protected migration SQL with %s release-tree ownership',
  async (ownership) => {
    const fixture = await createRevisionPair(true);
    const sql = join(fixture.migrations, PROTECTED, 'migration.sql');
    if (ownership === 'executable') {
      await chmod(sql, 0o755);
    } else {
      await unlink(sql);
      await writeFile(join(fixture.migrations, PROTECTED, 'down.sql'), 'SELECT 1;\n');
      if (ownership === 'symlink') await symlink('../0001_init/migration.sql', sql);
    }
    const revision = await commitInventory(fixture);
    expect(
      await readRefusal(assertInitialAccessSourceAllowed(fixture.sourceRepository, [revision])),
    ).toBe('unsupported initial-access migration SQL: ' + PROTECTED);
  },
);

it('refuses ambiguous migration roots from a real commit', async () => {
  const fixture = await createRevisionPair(false);
  const legacy = join(fixture.sourceRepository, 'apps/be-01/drizzle/0001_init');
  await mkdir(legacy, { recursive: true });
  await writeFile(join(legacy, 'migration.sql'), 'SELECT 1;\n');
  const revision = await commitInventory(fixture);
  expect(
    await readRefusal(assertInitialAccessSourceAllowed(fixture.sourceRepository, [revision])),
  ).toBe('initial-access inventory requires exactly one supported migration root');
});

it('refuses a revision with no supported migration root', async () => {
  const fixture = await createRevisionPair(false);
  await unlink(join(fixture.migrations, '0001_init/migration.sql'));
  await writeFile(join(fixture.sourceRepository, 'README.md'), 'No migration root\n');
  const revision = await commitInventory(fixture);
  expect(
    await readRefusal(assertInitialAccessSourceAllowed(fixture.sourceRepository, [revision])),
  ).toBe('initial-access inventory requires exactly one supported migration root');
});

it('names the repository and immutable revision when Git cannot read it', async () => {
  const fixture = await createRevisionPair(false);
  const revision = '0'.repeat(40);
  const message = await readRefusal(
    assertInitialAccessSourceAllowed(fixture.sourceRepository, [revision]),
  );
  expect(message).toContain('cannot read initial-access Git inventory');
  expect(message).toContain(fixture.sourceRepository);
  expect(message).toContain(revision);
});
