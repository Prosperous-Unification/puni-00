import type { AuthenticatedUser } from '@wbs/contracts';
import { servicesOver } from '@wbs/core/compose';
import { clockOf } from '@wbs/core/ports/clock';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core/ports/edit-admission';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { SqliteOrganizationAccess } from '../organization-access';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;
const SHARED = 'current-service-shared';
const SIBLING = 'current-service-sibling';
const FOREIGN = 'current-service-foreign';
const RETAINED = 'current-service-retained';
const VIEWER = 'current-service-viewer';
const INVISIBLE = 'current-service-invisible';
const NONMEMBER = 'current-service-nonmember';

async function withinFixture(use: (fixture: Fixture) => Promise<void>): Promise<void> {
  const fixture = await openSqliteStepCatalogueCase('stepCatalogue.unbindStep:estimate-refusal-and-preview');
  let failed: { cause: unknown } | undefined;
  try { await use(fixture); } catch (cause: unknown) { failed = { cause }; }
  try { await fixture.close(); } catch (cleanup: unknown) {
    if (failed !== undefined) throw new AggregateError([failed.cause, cleanup], 'current StepService owner and Source close failed', { cause: cleanup });
    throw cleanup;
  }
  if (failed !== undefined) throw failed.cause;
}

/** Real catalogue rows and independent package values; no legacy Step DTO storage is populated. */
async function prepare(fixture: Fixture): Promise<void> {
  const { source, seed, port } = fixture;
  for (const [organizationId, id, scopeKind, scopeId, position] of [
    [seed.organizationId, SHARED, 'organization', seed.organizationId, 10],
    [seed.organizationId, SIBLING, 'project', seed.siblingProjectId, 20],
    [seed.organizationId, RETAINED, 'project', seed.projectId, 30],
    [seed.foreignOrganizationId, FOREIGN, 'organization', seed.foreignOrganizationId, 10],
  ] as const) {
    expect((await port.defineAndBindStep(organizationId, {
      id, code: id, name: id, position,
      defaultEstimateUnit: 'workdays', defaultAllowancePercent: 7,
    }, {
      bindingId: id + ':binding', scopeKind, scopeId, workItemTypeId: null, position,
    }, seed.stamp)).ok).toBe(true);
  }
  expect(await source.stores.workPackages.setStepAllowance(seed.workPackageId, SHARED, 12.34, seed.stamp))
    .toMatchObject({ ok: true, previousPercent: 7, revision: 1 });
  expect(await source.stores.workPackages.setStepAllowance(seed.siblingWorkPackageId, SHARED, 56.78, seed.stamp))
    .toMatchObject({ ok: true, previousPercent: 7, revision: 1 });
  const values = fixture.readEvidence().packageValues;
  expect(values.find(row => row.workPackageId === seed.workPackageId && row.stepId === SHARED)).toEqual({
    workPackageId: seed.workPackageId, stepId: SHARED, estimateUnit: 'workdays', allowanceBps: 1234, allowanceRevision: 1,
  });
  expect(values.find(row => row.workPackageId === seed.siblingWorkPackageId && row.stepId === SHARED)).toEqual({
    workPackageId: seed.siblingWorkPackageId, stepId: SHARED, estimateUnit: 'workdays', allowanceBps: 5678, allowanceRevision: 1,
  });
  expect((await port.readCatalogue(seed.organizationId))?.definitions.find(definition => definition.id === SHARED))
    .toMatchObject({ id: SHARED, defaultAllowancePercent: 7 });
  expect((await source.stores.workPackages.stepsOf(seed.workPackageId)).map(step => step.id)).toEqual([SHARED, RETAINED]);
  expect((await source.stores.workPackages.stepsOf(seed.siblingWorkPackageId)).map(step => step.id)).toEqual([SHARED, SIBLING]);
  expect((await source.stores.workPackages.stepsOf(seed.foreignWorkPackageId)).map(step => step.id)).toEqual([FOREIGN]);
  await source.uow.run(() => {
    for (const id of [VIEWER, INVISIBLE, NONMEMBER]) {
      source.db.run(sql`INSERT INTO users(id,username,created_at) VALUES(${id},${id},${seed.stamp.at})`);
    }
    for (const id of [VIEWER, INVISIBLE]) {
      source.db.run(sql`INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES(${seed.organizationId},${id},'member',${seed.stamp.at})`);
    }
    source.db.run(sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at,created_by)
      VALUES('current-service-viewer-grant',${seed.organizationId},'work_package',${seed.workPackageId},'user',${VIEWER},'package-viewer','route',${seed.stamp.at},${seed.stamp.by})`);
    return Promise.resolve({ commit: true, value: undefined });
  });
  expect(source.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
}

/** Real request organization resolution followed by the actual per-loan service composition and grant evaluator. */
function reader(fixture: Fixture) {
  const { source, seed } = fixture;
  const broadcast = recordingBroadcaster();
  const organizations = new SqliteOrganizationAccess(source.db, () => Promise.resolve(seed.organizationId), () => seed.stamp.at);
  const principalOf = (id: string): AuthenticatedUser => ({
    id, username: id, scopes: ['read', 'write'],
    authentication: { kind: 'first_party', issuedAt: seed.stamp.at },
    organizationOperation: { kind: 'mutation', expected: { kind: 'present', organizationId: seed.organizationId } },
  });
  const lookup = (workPackageId: string, stepId: string, actorId = seed.stamp.by): Promise<unknown> => source.uow.run<unknown>(async scope => {
    const resolved = await organizations.resolve(principalOf(actorId));
    if (!resolved.ok) return { commit: false, value: resolved };
    expect(resolved.access.kind).toBe('scoped');
    if (resolved.access.kind !== 'scoped') throw new Error('current StepService fixture resolved legacy access');
    const graph = servicesOver(scope.stores, {
      clock: clockOf({ now: () => seed.stamp.at, newId: () => 'unused-current-step-service-id' }),
      broadcast, scheduler: fastScheduler, admission: LEGACY_EDIT_ADMISSION,
      dependencyContext: createLocalDependencyContext(scope.stores),
    });
    // StepService uses actual stores.accessDecisions for scoped access; the unrelated
    // shared edit-admission option is not consulted by this lookup.
    return { commit: false, value: await graph.steps.findWithin(workPackageId, stepId, actorId, resolved.access) };
  });
  return { lookup, broadcast };
}

async function healthyRead(fixture: Fixture, lookup: ReturnType<typeof reader>['lookup']): Promise<void> {
  expect(await lookup(fixture.seed.workPackageId, SHARED)).toEqual({
    ok: true,
    value: { id: SHARED, workPackageId: fixture.seed.workPackageId, code: SHARED, name: SHARED, position: 10, estimateUnit: 'workdays', allowancePercent: 12.34 },
  });
}

const cases = [
  {
    name: 'reads shared definitions through each addressed package value',
    async run(fixture: Fixture, lookup: ReturnType<typeof reader>['lookup']) {
      await healthyRead(fixture, lookup);
      expect(await lookup(fixture.seed.siblingWorkPackageId, SHARED)).toEqual({
        ok: true,
        value: { id: SHARED, workPackageId: fixture.seed.siblingWorkPackageId, code: SHARED, name: SHARED, position: 10, estimateUnit: 'workdays', allowancePercent: 56.78 },
      });
    },
  },
  {
    name: 'conceals foreign and nonmember step identities like an absent pair',
    async run(fixture: Fixture, lookup: ReturnType<typeof reader>['lookup']) {
      await healthyRead(fixture, lookup);
      for (const stepId of [FOREIGN, SIBLING, 'absent-current-service-step']) {
        expect(await lookup(fixture.seed.workPackageId, stepId)).toEqual({ ok: false, reason: 'not_found' });
      }
      expect(await lookup(fixture.seed.siblingWorkPackageId, SIBLING)).toMatchObject({ ok: true, value: { id: SIBLING, workPackageId: fixture.seed.siblingWorkPackageId } });
    },
  },
  {
    name: 'conceals a foreign selected-organization package like an absent package',
    async run(fixture: Fixture, lookup: ReturnType<typeof reader>['lookup']) {
      await healthyRead(fixture, lookup);
      expect(await lookup(fixture.seed.foreignWorkPackageId, FOREIGN)).toEqual({ ok: false, reason: 'not_found' });
      expect(await lookup('absent-current-service-package', FOREIGN)).toEqual({ ok: false, reason: 'not_found' });
    },
  },
  {
    name: 'does not revive a retained unbound package value as an editable step',
    async run(fixture: Fixture, lookup: ReturnType<typeof reader>['lookup']) {
      await healthyRead(fixture, lookup);
      expect(await lookup(fixture.seed.workPackageId, RETAINED)).toMatchObject({ ok: true, value: { id: RETAINED } });
      expect(await fixture.port.unbindStep(fixture.seed.organizationId, RETAINED + ':binding', { dryRun: false }, fixture.seed.stamp)).toMatchObject({ kind: 'unbound' });
      expect(fixture.readEvidence().packageValues.find(row => row.workPackageId === fixture.seed.workPackageId && row.stepId === RETAINED)).toMatchObject({ allowanceBps: 700, allowanceRevision: 0 });
      const afterUnbind = fixture.readEvidence().snapshot;
      expect(await lookup(fixture.seed.workPackageId, RETAINED)).toEqual({ ok: false, reason: 'not_found' });
      expect(fixture.readEvidence().snapshot).toEqual(afterUnbind);
    },
    writesFixture: true,
  },
  {
    name: 'preserves named write refusal and invisible package concealment from actual grants',
    async run(fixture: Fixture, lookup: ReturnType<typeof reader>['lookup']) {
      await healthyRead(fixture, lookup);
      expect(await lookup(fixture.seed.workPackageId, SHARED, VIEWER)).toEqual({ ok: false, reason: 'forbidden', permission: 'package.write' });
      expect(await lookup(fixture.seed.workPackageId, SHARED, INVISIBLE)).toEqual({ ok: false, reason: 'not_found' });
      expect(await lookup('absent-current-service-package', SHARED, INVISIBLE)).toEqual({ ok: false, reason: 'not_found' });
    },
  },
  {
    name: 'refuses a real organization nonmember before current package lookup',
    async run(fixture: Fixture, lookup: ReturnType<typeof reader>['lookup']) {
      await healthyRead(fixture, lookup);
      expect(await lookup(fixture.seed.workPackageId, SHARED, NONMEMBER)).toEqual({ ok: false, refusal: 'not_a_member' });
      expect(await lookup(fixture.seed.foreignWorkPackageId, FOREIGN, NONMEMBER)).toEqual({ ok: false, refusal: 'not_a_member' });
    },
  },
] as const;

for (const owner of cases) {
  test('current scoped StepService ' + owner.name, async () => {
    await withinFixture(async fixture => {
      await prepare(fixture);
      const { lookup, broadcast } = reader(fixture);
      const before = fixture.readEvidence().snapshot;
      await owner.run(fixture, lookup);
      if (!('writesFixture' in owner)) expect(fixture.readEvidence().snapshot).toEqual(before);
      expect(broadcast.published).toEqual([]);
    });
  }, 30000);
}
