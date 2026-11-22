import { constants, copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { type ClaimStore, clockOf, LEGACY_EDIT_ADMISSION, type PlanCommand } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { bindFixtureSteps } from '@wbs/core/testing/bound-package-fixture';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { type } from 'arktype';
import { type Logger, sql } from 'drizzle-orm';

import { SqliteCommandAccess } from '../command-access';
import { type Drizzle, openDatabase, openReadOnlyConnection } from '../db';
import { MachineCredentialRepository } from '../machine-credential';
import { SqliteOrganizationAccess } from '../organization-access';
import { openSqliteSource, type SqliteSource } from '../source';
import { migrateEmptyCatalogueFixture } from './catalogue-database';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './dependency-capability';
import { seedOrganizationPackage } from './legacy-package-parent';
import {
  assertClaim,
  type ClaimReceipt,
  type ClaimRow,
  type ClaimTarget,
} from './shared-occupancy-measurement';
import { activateTestStepBlockages } from './step-blockage-activation';

const ACCOUNT = 'account-f';
const ORGANIZATION = 'org-measure';
const NOW = 1_000;
const STAMP = { at: NOW, by: ACCOUNT };
const WORK_PACKAGES = 50;
const STANDING = 20;
const SPARES = 400;

export const RESOURCE = 'resource-host-ram';
export const STATED = 1_000_000;
export const OCCUPIED = WORK_PACKAGES * STANDING;

const LIMITS = {
  maxAgentPersons: 100_000,
  maxConcurrentClaims: 100_000,
  maxCapacityUnitsPerResource: STATED,
};
const ACTOR = { id: ACCOUNT, username: ACCOUNT, scopes: ['write'] } as const;
const ACCESS = {
  kind: 'scoped',
  scope: { organizationId: ORGANIZATION, userId: ACCOUNT, cap: null },
  principal: { id: ACCOUNT },
} as const;

const Target = type({
  workPackageId: 'string',
  workItemId: 'string',
  personId: 'string',
  steps: ['string', 'string'],
});
const Fixture = type({
  standing: Target.array(),
  spares: Target.array(),
  minted: 'number.integer',
  sha256: 'string',
});
type Fixture = typeof Fixture.infer;

interface Observation {
  readonly logger: Logger;
  readonly claims: (claims: ClaimStore) => ClaimStore;
}

export function openFixture(dbPath: string, minted: number, observation?: Observation) {
  const source = openSqliteSource({
    dbPath,
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    organizationDefaultLimits: LIMITS,
    ...(observation === undefined ? {} : { logger: observation.logger }),
  });
  const clock = clockOf({
    now: () => NOW,
    newId: () => `id-${String(++minted).padStart(8, '0')}`,
  });
  const broadcast = recordingBroadcaster();
  const options = { clock, broadcast, scheduler: fastScheduler, admission: LEGACY_EDIT_ADMISSION };
  const graph = servicesOver(source.stores, {
    ...options,
    dependencyContext: createLocalDependencyContext(source.stores),
  });
  const runner = createPlanCommandRunner({
    commandAccess: new SqliteCommandAccess(
      source.db,
      new SqliteOrganizationAccess(
        source.db,
        () => Promise.resolve(ORGANIZATION),
        () => NOW,
      ),
      new MachineCredentialRepository(source.db, source.gate),
    ),
    uow: source.uow,
    announcements: broadcast,
    publicServices: graph,
    batchServices: (scope, announcements, admission, dependencyContext) =>
      servicesOver(
        observation === undefined
          ? scope.stores
          : { ...scope.stores, claims: observation.claims(scope.stores.claims) },
        {
          ...options,
          admission,
          broadcast: announcements,
          dependencyContext: { kind: 'bound', context: dependencyContext },
        },
      ),
  });
  const read = openReadOnlyConnection(dbPath);
  return {
    source,
    clock,
    broadcast,
    read: read.db,
    minted: () => minted,
    close: async () => {
      try {
        read.close();
      } finally {
        await source.close();
      }
    },
    run: (workPackageId: string, commands: readonly PlanCommand[]) =>
      runner.runWithin(workPackageId, ACTOR, commands, ACCESS),
    directory: (command: PlanCommand) => runner.runDirectoryWithin(ACTOR, [command], ACCESS),
  };
}

export type Opened = ReturnType<typeof openFixture>;

export function commandOf(target: ClaimTarget): Extract<PlanCommand, { kind: 'claimWorkItem' }> {
  return {
    kind: 'claimWorkItem',
    workItemId: target.workItemId,
    personId: target.personId,
    steps: [...target.steps],
  };
}

export function claimRows(db: Drizzle, workItemId: string): ClaimRow[] {
  return db.all<ClaimRow>(sql`
    SELECT c.id, c.step_id AS stepId, c.work_item_id AS workItemId, c.person_id AS personId,
           co.resource_id AS resourceId, co.units
    FROM claim c LEFT JOIN claim_occupancy co ON co.claim_id = c.id
    WHERE c.work_item_id = ${workItemId}
    ORDER BY c.id`);
}

export type ClaimReply = Awaited<ReturnType<Opened['run']>>;

/** Reads the committed outcome from a separate SQLite connection. */
export function readClaim(db: Drizzle, target: ClaimTarget, reply: ClaimReply): ClaimReceipt {
  const applied = reply.ok ? reply.results.at(0) : undefined;
  if (
    !reply.ok ||
    reply.results.length !== 1 ||
    applied?.kind !== 'claimWorkItem' ||
    !same(applied.acquired, [{ resourceId: RESOURCE, units: 1 }])
  )
    throw new Error(
      `Claim on ${target.workItemId} did not acquire one unit: ${JSON.stringify(reply)}`,
    );
  const claim = {
    alreadyHeld: applied.alreadyHeld,
    ids: applied.claimIds,
    rows: claimRows(db, target.workItemId),
  };
  assertClaim(target, RESOURCE, claim);
  return claim;
}

export async function releaseClaim(opened: Opened, target: ClaimTarget): Promise<void> {
  const released = await opened.run(target.workPackageId, [
    {
      kind: 'releaseWorkItem',
      workItemId: target.workItemId,
      personId: target.personId,
      steps: target.steps,
    },
  ]);
  if (
    !released.ok ||
    released.results.length !== 1 ||
    released.results.at(0)?.kind !== 'releaseWorkItem'
  )
    throw new Error(`Release failed on ${target.workItemId}: ${JSON.stringify(released)}`);
  if (claimRows(opened.read, target.workItemId).length !== 0)
    throw new Error(`Release left a holder on ${target.workItemId}`);
}

export async function setCapacity(opened: Opened, units: number | null): Promise<void> {
  const written = await opened.directory({
    kind: 'setDirectoryCapacity',
    resourceId: RESOURCE,
    units,
  });
  if (!written.ok)
    throw new Error(`Directory capacity ${String(units)} refused: ${JSON.stringify(written)}`);
  const capacities = await opened.source.stores.directory.directoryCapacitiesOf([RESOURCE]);
  if (!same(capacities, units === null ? [] : [{ resourceId: RESOURCE, units }]))
    throw new Error(`Read-side capacity differs after writing ${String(units)}`);
}

async function seedPeople(source: SqliteSource, personId: string): Promise<void> {
  await source.stores.directory.addPerson(
    { id: personId, name: personId, kind: 'agent' },
    [],
    STAMP,
  );
  const bound = await source.stores.directory.patchPerson(personId, { accountId: ACCOUNT }, STAMP);
  if (!bound.ok) throw new Error(`Binding ${personId} was refused: ${bound.reason}`);
  source.db.run(sql`
    INSERT INTO person_organization (resource_id, organization_id, name)
    VALUES (${personId}, ${ORGANIZATION}, ${personId})`);
}

async function createLeaves(
  opened: Opened,
  workPackageId: string,
  steps: [string, string],
  prefix: string,
  count: number,
): Promise<ClaimTarget[]> {
  const commands = Array.from({ length: count }, (_, index): PlanCommand => ({
    kind: 'createWorkItem',
    ref: `L${String(index)}`,
    name: `${prefix}-${String(index)}`,
    parentId: null,
    afterId: null,
  }));
  const created = await opened.run(workPackageId, commands);
  if (!created.ok) throw new Error(`Leaf setup refused: ${JSON.stringify(created)}`);
  const leaves: ClaimTarget[] = [];
  for (const [index, applied] of created.results.entries()) {
    if (applied.kind !== 'createWorkItem') throw new Error('Fixture did not return a created leaf');
    const workItemId = applied.id;
    const personId = `${prefix}-${String(index)}`;
    await seedPeople(opened.source, personId);
    leaves.push({ workPackageId, workItemId, personId, steps });
  }
  if (leaves.length !== count) throw new Error('Fixture did not create every leaf');
  // Finish Dev, start QA, and reopen Dev for rework. Both have real started
  // evidence when the holder subsequently takes the two unfinished steps.
  const prepared = await opened.run(
    workPackageId,
    leaves.flatMap(({ workItemId }): PlanCommand[] => [
      { kind: 'setDemand', workItemId, resourceId: RESOURCE, units: 1 },
      { kind: 'setProgress', workItemId, stepId: steps[0], state: 'done' },
      { kind: 'setProgress', workItemId, stepId: steps[1], state: 'in_progress' },
      { kind: 'setProgress', workItemId, stepId: steps[0], state: 'in_progress' },
    ]),
  );
  if (!prepared.ok) throw new Error(`Workflow setup refused: ${JSON.stringify(prepared)}`);
  return leaves;
}

async function seed(opened: Opened) {
  const { db, stores } = opened.source;
  await stores.users.create(
    { id: ACCOUNT, username: ACCOUNT, passwordHash: 'fixture', createdAt: NOW },
    STAMP,
  );
  db.run(
    sql`INSERT INTO organization (id, name, created_at) VALUES (${ORGANIZATION}, ${ORGANIZATION}, ${NOW})`,
  );
  db.run(sql`
    INSERT INTO organization_membership (organization_id, user_id, role, created_at)
    VALUES (${ORGANIZATION}, ${ACCOUNT}, 'admin', ${NOW})`);
  const added = await stores.directory.addResource(
    { id: RESOURCE, name: 'host ram', kind: 'divisible', unitLabel: 'GB' },
    STAMP,
  );
  if (!added.ok) throw new Error(`Resource refused: ${added.reason}`);
  db.run(sql`
    INSERT INTO resource_organization (resource_id, organization_id, name)
    VALUES (${RESOURCE}, ${ORGANIZATION}, 'host ram')`);
  db.run(
    sql`UPDATE organization_activation SET state = 'activated', activated_at = ${NOW} WHERE singleton = 1`,
  );

  const projectId = 'fixture-project';
  db.run(sql`
    INSERT INTO project (id, organization_id, name, created_at)
    VALUES (${projectId}, ${ORGANIZATION}, 'Occupancy', ${NOW})`);
  db.run(sql`
    INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at)
    VALUES ('fixture-admin', ${ORGANIZATION}, 'organization', ${ORGANIZATION}, 'user', ${ACCOUNT}, 'org-admin', 'route', ${NOW})`);
  await bindFixtureSteps(
    opened.source,
    ORGANIZATION,
    (
      [
        ['dev', 'Dev', 10],
        ['qa', 'QA', 20],
      ] as const
    ).map(([code, name, position]) => ({
      definition: {
        id: 'fixture-' + code,
        code,
        name,
        position,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      binding: {
        bindingId: 'fixture-binding-' + code,
        scopeKind: 'project',
        scopeId: projectId,
        workItemTypeId: null,
        position,
      },
    })),
    STAMP,
  );

  const standing: ClaimTarget[] = [];
  const spares: ClaimTarget[] = [];
  for (let index = 0; index < WORK_PACKAGES; index += 1) {
    const { workPackage } = await seedOrganizationPackage(
      stores.workPackages,
      opened.clock,
      ORGANIZATION,
      projectId,
      ACCOUNT,
      `P${String(index)}`,
    );
    const steps = await stores.workPackages.stepsOf(workPackage.id);
    const dev = steps.at(0);
    const qa = steps.at(1);
    if (steps.length !== 2 || dev === undefined || qa === undefined)
      throw new Error('Fixture work package should have exactly two workflow steps');
    const stepIds: [string, string] = [dev.id, qa.id];
    for (const target of await createLeaves(
      opened,
      workPackage.id,
      stepIds,
      `standing-${String(index)}`,
      STANDING,
    )) {
      readClaim(opened.read, target, await opened.run(workPackage.id, [commandOf(target)]));
      standing.push(target);
    }
    if (index === 0)
      for (let batch = 0; batch < 8; batch += 1)
        spares.push(
          ...(await createLeaves(opened, workPackage.id, stepIds, `spare-${String(batch)}`, 50)),
        );
  }
  return { standing, spares, minted: opened.minted() };
}

function scalar(db: Drizzle, statement: ReturnType<typeof sql>): number {
  const value = db.all<{ n: number }>(statement).at(0)?.n;
  if (value === undefined) throw new Error('Missing SQLite fixture count');
  return value;
}

export function journalCount(db: Drizzle, workPackageId: string): number {
  return scalar(
    db,
    sql`SELECT COUNT(*) AS n FROM command_journal WHERE work_package_id = ${workPackageId}`,
  );
}

/** Reads the journal head even after the ordinary bounded stack prunes old rows. */
export function readJournalHead(db: Drizzle, workPackageId: string) {
  const head = db
    .all<{ id: string; seq: number }>(
      sql`
    SELECT id, seq FROM command_journal
    WHERE work_package_id = ${workPackageId} AND user_id = ${ACCOUNT}
    ORDER BY seq DESC LIMIT 1`,
    )
    .at(0);
  if (head === undefined) throw new Error(`Missing journal head for ${workPackageId}`);
  return head;
}

export function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function snapshot(db: Drizzle, fixture: Pick<Fixture, 'standing' | 'spares'>) {
  const people = new Set([...fixture.standing, ...fixture.spares].map(({ personId }) => personId));
  const leaves = new Set(
    [...fixture.standing, ...fixture.spares].map(({ workItemId }) => workItemId),
  );
  const workPackages = db.all<{
    workPackageId: string;
    leaves: number;
    units: number;
    steps: number;
  }>(sql`
    SELECT p.id AS workPackageId, COUNT(*) AS leaves, SUM(held.units) AS units, SUM(held.steps) AS steps
    FROM (
      SELECT wi.id, wi.work_package_id, MAX(co.units) AS units, COUNT(*) AS steps
      FROM claim c JOIN work_item wi ON wi.id = c.work_item_id
      JOIN claim_occupancy co ON co.claim_id = c.id
      WHERE co.resource_id = ${RESOURCE}
      GROUP BY wi.id, wi.work_package_id
    ) held
    JOIN work_package p ON p.id = held.work_package_id
    JOIN access_grant g ON g.scope_kind = 'work_package' AND g.scope_id = p.id
      AND g.origin = 'creation' AND g.subject_kind = 'user' AND g.subject_id = ${ACCOUNT}
      AND g.role_id = 'package-manager' AND g.organization_id = ${ORGANIZATION}
    JOIN work_package_organization po ON po.resource_id = p.id AND po.organization_id = ${ORGANIZATION}
    GROUP BY p.id ORDER BY p.id`);
  if (
    fixture.standing.length !== OCCUPIED ||
    fixture.spares.length !== SPARES ||
    people.size !== OCCUPIED + SPARES ||
    leaves.size !== people.size ||
    workPackages.length !== WORK_PACKAGES ||
    workPackages.some(
      ({ leaves, units, steps }) =>
        leaves !== STANDING || units !== STANDING || steps !== 2 * STANDING,
    ) ||
    scalar(
      db,
      sql`SELECT COUNT(*) AS n FROM work_package_organization WHERE organization_id = ${ORGANIZATION}`,
    ) !== WORK_PACKAGES ||
    scalar(db, sql`SELECT COUNT(*) AS n FROM claim`) !== 2 * OCCUPIED ||
    scalar(db, sql`SELECT COUNT(*) AS n FROM claim_occupancy`) !== 2 * OCCUPIED ||
    scalar(
      db,
      sql`
      SELECT COUNT(*) AS n FROM person_organization po JOIN person p ON p.id = po.resource_id
      WHERE po.organization_id = ${ORGANIZATION} AND p.account_id = ${ACCOUNT} AND p.kind = 'agent'`,
    ) !== people.size ||
    scalar(
      db,
      sql`
      SELECT COUNT(*) AS n FROM resource_organization ro JOIN resource r ON r.id = ro.resource_id
      WHERE ro.resource_id = ${RESOURCE} AND ro.organization_id = ${ORGANIZATION} AND r.kind = 'divisible'`,
    ) !== 1 ||
    scalar(
      db,
      sql`
      SELECT COUNT(*) AS n FROM organization_membership m JOIN organization_activation a ON a.singleton = 1
      WHERE m.organization_id = ${ORGANIZATION} AND m.user_id = ${ACCOUNT}
        AND m.role = 'admin' AND a.state = 'activated'`,
    ) !== 1
  )
    throw new Error('Representative cohort has the wrong shape');
  const standing = fixture.standing.map((target) => {
    const rows = claimRows(db, target.workItemId);
    assertClaim(target, RESOURCE, { alreadyHeld: false, ids: rows.map(({ id }) => id), rows });
    return rows;
  });
  if (fixture.spares.some(({ workItemId }) => claimRows(db, workItemId).length !== 0))
    throw new Error('A spare leaf still has a holder');
  return { workPackages, standing };
}

export function digestFile(path: string): string {
  return new Bun.CryptoHasher('sha256').update(readFileSync(path)).digest('hex');
}

export async function prepare(dbPath: string, manifestPath: string): Promise<Fixture> {
  migrateEmptyCatalogueFixture(
    { path: dbPath, directory: dirname(dbPath), reportedAt: NOW },
    { hasUnknownOwner: false },
  );
  activateTestStepBlockages(dbPath);
  const opened = openFixture(dbPath, 0);
  const fixture = await (async () => {
    try {
      const seeded = await seed(opened);
      snapshot(opened.read, seeded);
      return seeded;
    } finally {
      await opened.close();
    }
  })();
  const native = openDatabase(dbPath);
  try {
    const checked = native.query('PRAGMA wal_checkpoint(TRUNCATE)').all();
    if (!same(checked, [{ busy: 0, log: 0, checkpointed: 0 }]))
      throw new Error(`SQLite seed checkpoint did not settle: ${JSON.stringify(checked)}`);
    if (
      !same(native.query('PRAGMA integrity_check').all(), [{ integrity_check: 'ok' }]) ||
      native.query('PRAGMA foreign_key_check').all().length !== 0
    )
      throw new Error('SQLite seed integrity or foreign key check failed');
  } finally {
    native.close();
  }
  const prepared = { ...fixture, sha256: digestFile(dbPath) };
  writeFileSync(manifestPath, JSON.stringify(prepared), { flag: 'wx' });
  return prepared;
}

export function readFixture(dbPath: string, manifestPath: string): Fixture {
  const candidate: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const fixture = Fixture.assert(candidate);
  if (digestFile(dbPath) !== fixture.sha256) throw new Error('Prepared seed digest differs');
  return fixture;
}

export function copyFixture(from: string, to: string, sha256: string) {
  // COPYFILE_EXCL rejects reuse; no clone flag requests independent physical writes.
  copyFileSync(from, to, constants.COPYFILE_EXCL);
  const original = statSync(from);
  const copied = statSync(to);
  if (
    original.dev !== copied.dev ||
    original.ino === copied.ino ||
    copied.nlink !== 1 ||
    copied.size !== original.size ||
    digestFile(to) !== sha256
  )
    throw new Error(`SQLite seed copy is not independent and byte-identical: ${to}`);
  return { device: copied.dev, inode: copied.ino, bytes: copied.size, sha256 };
}
