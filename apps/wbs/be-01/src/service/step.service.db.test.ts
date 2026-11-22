import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { StepService } from '@wbs/core/module/step/step.resource';
import { WorkPackageService } from '@wbs/core/module/work-package/work-package.resource';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { expect, it, spyOn } from 'bun:test';

import { openConnection, openReadOnlyDatabase } from '../repository/db';
import { OPEN } from '../repository/gate';
import { readMigrationFolders } from '../repository/migrate-down';
import { buildStores } from '../services';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testClock } from '../testing/clock-fixture';
import { sqliteDependencyContext } from '../testing/dependency-graph-fixture';
import { bindDevQaFixture } from '../testing/dev-qa-fixture';
import { migrateOrganizationCatalogueFixture } from '../testing/organization-catalogue-fixture';
import { seedLegacyProject } from '../testing/project-fixture';
import { workItemRow } from '../testing/work-item-fixture';

const predecessor = '8c997e62a2833cabfbe802d2082fb36d60d3397c';
const repository = resolve(import.meta.dir, '../../../../..');

async function run(command: string[], cwd: string, env = process.env): Promise<string> {
  const child = Bun.spawn(command, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (status !== 0) throw new Error(command.join(' ') + ' failed: ' + stderr + stdout);
  return stdout + stderr;
}

/** Exercises the archived cascade and revision proofs with their original service and package-owned step storage. */
it('runs the original step service and cascade revision cases on their exact pre-rename source and migration ledger', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-step-predecessor-'));
  try {
    const archive = join(directory, 'source.tar');
    await run(
      [
        'git',
        'archive',
        '--format=tar',
        '--output=' + archive,
        predecessor,
        'apps/wbs/be-01',
        'libs/wbs',
        'libs/shared',
        'openspec/changes/wbs-work-packages',
        'tsconfig.base.json',
        'package.json',
        'bun.lock',
      ],
      repository,
    );
    await run(['tar', '-xf', archive, '-C', directory], repository);
    expect(await Bun.file(join(directory, 'bun.lock')).text()).toBe(
      await Bun.file(join(repository, 'bun.lock')).text(),
    );
    symlinkSync(join(repository, 'node_modules'), join(directory, 'node_modules'));
    const backend = join(directory, 'apps/wbs/be-01');
    const path = join(directory, 'predecessor.db');
    await run([process.execPath, 'run', 'src/migrate-cli.ts'], backend, {
      ...process.env,
      DB_PATH: path,
    });
    const expected = readMigrationFolders(join(backend, 'drizzle')).map(({ name, hash }) => ({
      name,
      hash,
    }));
    expect(expected).toHaveLength(110);
    expect(expected.at(-1)?.name).toBe('20261103110000_add_initial_access_offers');
    const ledger = openReadOnlyDatabase(path);
    try {
      expect(
        ledger.query('SELECT name, hash FROM __drizzle_migrations ORDER BY name').all(),
      ).toEqual(expected);
    } finally {
      ledger.close();
    }
    const steps = await run(
      [
        process.execPath,
        'test',
        './apps/wbs/be-01/src/service/step.service.db.test.ts',
        '--timeout=10000',
      ],
      directory,
    );
    expect(steps).toMatch(/\b30 pass\b/);
    const revisions = await run(
      [
        process.execPath,
        'test',
        './apps/wbs/be-01/src/service/revision.db.test.ts',
        '--test-name-pattern',
        'what a step write moves',
        '--timeout=10000',
      ],
      directory,
    );
    expect(revisions).toMatch(/\b2 pass\b/);
  } finally {
    rmSync(directory, { recursive: true });
  }
}, 240_000);

it('refuses absent and restricted work packages before consulting legacy step storage or sparse references', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-step-restricted-'));
  try {
    const path = join(directory, 'test.db');
    migrateOrganizationCatalogueFixture(path);
    seedLegacyProject(path, 'step-org', 'step-project');
    const connection = openConnection(path);
    try {
      const stores = buildStores(connection.db, OPEN);
      const options = {
        clock: testClock,
        dependencyContext: sqliteDependencyContext(connection.db, stores.workPackages),
        workPackages: stores.workPackages,
        broadcast: recordingBroadcaster(),
      };
      const steps = new StepService({ ...options, steps: stores.steps });
      for (const id of ['owner', 'stranger']) {
        await stores.users.create(
          { id, username: id, passwordHash: 'x', createdAt: 1 },
          { at: 1, by: id },
        );
      }
      const stamp = { at: 1, by: 'owner' };
      await bindDevQaFixture(stores.stepCatalogue, 'step-org', 'step-project', stamp);
      const born = await new WorkPackageService(options).create('Shed', 'step-project', 'owner');
      if (typeof born === 'string') throw new Error('fixture work package refused: ' + born);
      const id = born.workPackage.id;
      const dev = born.steps.find((step) => step.name === 'Dev');
      if (dev === undefined) throw new Error('fixture Dev step is missing');
      await stores.workItems.insert(
        workItemRow({ id: 'strip', workPackageId: id, name: 'Strip', position: 10 }),
        [],
        stamp,
      );
      await new StepParallelRepository(connection.db, OPEN).set(
        { workItemId: 'strip', stepId: dev.id, maxParallel: 1 },
        stamp,
      );
      expect(await steps.add('absent', 'owner', 'Design', 0)).toEqual({
        ok: false,
        reason: 'not_found',
      });
      await stores.workPackages.update(id, { restricted: true }, stamp);
      const remove = spyOn(stores.steps, 'remove');
      for (const actor of ['stranger', 'owner']) {
        expect(await steps.add(id, actor, 'Design', 0)).toEqual({ ok: false, reason: 'forbidden' });
        expect(await steps.remove(id, dev.id, actor, true)).toEqual({
          ok: false,
          reason: 'forbidden',
        });
      }
      expect(remove).not.toHaveBeenCalled();
    } finally {
      connection.close();
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});
