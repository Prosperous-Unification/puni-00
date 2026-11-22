import type { StepCatalogueFixture } from '@wbs/conformance';
import type { WorkItemStore, WriteStamp } from '@wbs/core';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { personAdded } from '@wbs/store-memory/testing/service-fixtures';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { Drizzle } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { organization, person, personOrganization, workItem } from './schema';
import type { SqliteSource } from './source';
import { openSqliteStepCatalogueCase } from './testing/step-catalogue-fixture';

let fixture: StepCatalogueFixture<SqliteSource> | undefined;
let authorId: string;
let repo: DirectoryRepository;
let db: Drizzle;
let workItems: WorkItemStore;
let workPackageId: string;
let stepId: string;
let otherStepId: string;
let itemId: string;

/** Every write uses the actual fixture account, with the original deterministic audit instant. */
const wrote = (): WriteStamp => ({ at: 1, by: authorId });

beforeEach(async () => {
  fixture = undefined;
  fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  db = fixture.source.db;
  repo = new DirectoryRepository(db, OPEN);
  workItems = fixture.source.stores.workItems;
  authorId = fixture.seed.stamp.by;
  workPackageId = fixture.seed.workPackageId;
  stepId = crypto.randomUUID();
  otherStepId = crypto.randomUUID();
  for (const [id, name, code, position] of [
    [stepId, 'Dev', 'dev', 10],
    [otherStepId, 'QA', 'qa', 20],
  ] as const) {
    expect(
      await fixture.source.stores.stepCatalogue.defineAndBindStep(
        fixture.seed.organizationId,
        {
          id,
          name,
          code,
          position,
          defaultAllowancePercent: 0,
          defaultEstimateUnit: 'workdays',
        },
        {
          bindingId: id + ':binding',
          scopeKind: 'project',
          scopeId: fixture.seed.projectId,
          workItemTypeId: null,
          position,
        },
        wrote(),
      ),
    ).toMatchObject({ ok: true });
  }
  itemId = crypto.randomUUID();
  await workItems.insert(
    workItemRow({ id: itemId, workPackageId, position: 10, name: 'Strip' }),
    [],
    wrote(),
  );
});

afterEach(async () => {
  const owned = fixture;
  fixture = undefined;
  if (owned === undefined) throw new Error('actual directory fixture did not open');
  await owned.close();
});

describe('DirectoryRepository', () => {
  it('reads only requested local person aliases and omits foreign ids', async () => {
    await db.insert(organization).values([
      { id: 'name-owner', name: 'Name Owner', createdAt: 1 },
      { id: 'other-owner', name: 'Other Owner', createdAt: 1 },
    ]);
    await db.insert(person).values([
      { id: 'name-own', name: 'root own' },
      { id: 'name-foreign', name: 'root foreign' },
      { id: 'name-unrequested', name: 'root unrequested' },
    ]);
    await db.insert(personOrganization).values([
      { resourceId: 'name-own', organizationId: 'name-owner', name: 'local own' },
      { resourceId: 'name-foreign', organizationId: 'other-owner', name: 'local foreign' },
      { resourceId: 'name-unrequested', organizationId: 'name-owner', name: 'local unrequested' },
    ]);
    expect(
      await repo.personNamesInOrganization('name-owner', ['name-own', 'name-foreign', 'name-own']),
    ).toEqual([{ id: 'name-own', name: 'local own' }]);
    expect(await repo.personNamesInOrganization('name-owner', [])).toEqual([]);
  });

  it('adds a team, and adding the same name again gives back the same row', async () => {
    // The picker types a name when the list does not have it, so this is the
    // ordinary path rather than a race nobody hits.
    const first = await repo.addTeam({ id: crypto.randomUUID(), name: 'Platform' }, wrote());
    const again = await repo.addTeam({ id: crypto.randomUUID(), name: 'Platform' }, wrote());

    expect(again.id).toBe(first.id);
    expect((await repo.listTeams()).map((t) => t.name)).toEqual(['Platform']);
  });

  it('takes a team\u2019s ownership rows with the service, and moves no work item', async () => {
    // The cascade the schema declares, read from the map's own side. Chunk 5
    // proved `ON DELETE SET NULL` on the work item's column; this is the other
    // half of the same removal, and the two are deliberately separate claims:
    // an ownership row about a service that no longer exists is not an effect
    // on any plan (spec), so it goes silently, while the work item stays.
    const platform = await repo.addTeam({ id: crypto.randomUUID(), name: 'Platform' }, wrote());
    const payments = await repo.addService({ id: crypto.randomUUID(), name: 'Payments' }, wrote());
    const auth = await repo.addService({ id: crypto.randomUUID(), name: 'Auth' }, wrote());
    await repo.patchTeam(platform.id, { serviceIds: [payments.id, auth.id] }, wrote());

    const removed = await repo.removeService(payments.id, true, wrote());
    expect(removed.ok).toBe(true);

    // `Auth` survives on the same team: the cascade takes the rows naming the
    // removed service, not the team's whole map.
    expect(await repo.listTeams()).toEqual([
      { id: platform.id, name: 'Platform', serviceIds: [auth.id] },
    ]);
  });

  it('deduplicates the owned set rather than letting the primary key throw', async () => {
    const platform = await repo.addTeam({ id: crypto.randomUUID(), name: 'Platform' }, wrote());
    const payments = await repo.addService({ id: crypto.randomUUID(), name: 'Payments' }, wrote());

    // A client naming the same service twice means exactly what it says. Left
    // to the pair primary key it would be a 500 for a well-formed request —
    // `patchPerson`'s reasoning, one dimension over.
    const written = await repo.patchTeam(
      platform.id,
      { serviceIds: [payments.id, payments.id] },
      wrote(),
    );

    expect(written).toEqual({
      ok: true,
      team: { id: platform.id, name: 'Platform', serviceIds: [payments.id] },
      workPackageIds: [],
    });
  });

  it('keeps a person in several teams at once', async () => {
    const platform = await repo.addTeam({ id: crypto.randomUUID(), name: 'Platform' }, wrote());
    const billing = await repo.addTeam({ id: crypto.randomUUID(), name: 'Billing' }, wrote());
    const ada = await personAdded(
      repo.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [platform.id], wrote()),
    );
    await personAdded(
      repo.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [billing.id], wrote()),
    );

    const people = await repo.listPeople();

    expect(people).toHaveLength(1);
    expect(people[0]?.id).toBe(ada.id);
    expect([...(people[0]?.teamIds ?? [])].sort()).toEqual([platform.id, billing.id].sort());
  });

  it('leaves a person with no team a free agent, not a member of anything', async () => {
    await personAdded(repo.addPerson({ id: crypto.randomUUID(), name: 'Grace' }, [], wrote()));

    // The empty array, not a magic team id: a real "Free agents" row could be
    // renamed, deleted or given work of its own.
    expect((await repo.listPeople())[0]?.teamIds).toEqual([]);
  });

  it('adds an agent when the insert names one, and a person when it names nothing', async () => {
    // The two halves of `PersonInsert`'s asymmetry, in one case because they are
    // one claim: the kind may be omitted going in, and never comes back absent.
    const bot = await personAdded(
      repo.addPerson({ id: crypto.randomUUID(), name: 'Claire', kind: 'agent' }, [], wrote()),
    );
    const human = await personAdded(
      repo.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );

    expect(bot.kind).toBe('agent');
    expect(human.kind).toBe('person');

    // And read back through the list, not just off the insert's own answer —
    // `addPerson` returns the row it re-selected, but a default applied by the
    // column is only proven by a second read.
    const people = await repo.listPeople();

    expect(people.map((each) => [each.name, each.kind])).toEqual([
      ['Ada', 'person'],
      ['Claire', 'agent'],
    ]);
  });

  it('writes a name and a kind in one update, and a kind alone in one too', async () => {
    const platform = await repo.addTeam({ id: crypto.randomUUID(), name: 'Platform' }, wrote());
    const ada = await personAdded(
      repo.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [platform.id], wrote()),
    );

    const both = await repo.patchPerson(ada.id, { name: 'Ada L', kind: 'agent' }, wrote());

    expect(both).toEqual({
      ok: true,
      person: { id: ada.id, name: 'Ada L', kind: 'agent', teamIds: [platform.id], accountId: null },
      workPackageIds: [],
    });

    // A patch naming only the kind still writes: the store must not read an
    // absent `name` as "nothing to do" — deciding that is the service's job,
    // and here it would silently drop the only field the caller sent.
    const kindOnly = await repo.patchPerson(ada.id, { kind: 'person' }, wrote());

    expect(kindOnly).toEqual({
      ok: true,
      person: {
        id: ada.id,
        name: 'Ada L',
        kind: 'person',
        teamIds: [platform.id],
        accountId: null,
      },
      workPackageIds: [],
    });
  });

  it('holds one assignee per step, replacing rather than adding', async () => {
    const ada = await personAdded(
      repo.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    const grace = await personAdded(
      repo.addPerson({ id: crypto.randomUUID(), name: 'Grace' }, [], wrote()),
    );

    await repo.assign(itemId, stepId, ada.id, wrote());
    await repo.assign(itemId, stepId, grace.id, wrote());

    expect(await repo.assignmentsOf([itemId])).toEqual([
      { workItemId: itemId, stepId, personId: grace.id },
    ]);
  });

  it('clears one work item’s step without touching the other step or anyone else’s', async () => {
    // Both halves of the condition are load-bearing, and each needs its own
    // survivor to prove it. The first attempt at this test had one work item,
    // so narrowing the delete to the step alone — which would clear that step
    // on every work item in the database — passed it.
    const ada = await personAdded(
      repo.addPerson({ id: crypto.randomUUID(), name: 'Ada' }, [], wrote()),
    );
    const otherItemId = crypto.randomUUID();
    await workItems.insert(
      workItemRow({
        id: otherItemId,
        workPackageId,
        position: 20,
        name: 'Sand',
      }),
      [],
      wrote(),
    );
    await repo.assign(itemId, stepId, ada.id, wrote());
    await repo.assign(itemId, otherStepId, ada.id, wrote());
    await repo.assign(otherItemId, stepId, ada.id, wrote());

    await repo.assign(itemId, stepId, null, wrote());

    const left = await repo.assignmentsOf([itemId, otherItemId]);
    expect(left).toHaveLength(2);
    // The same step on another work item survives — that is the work-item half.
    expect(left).toContainEqual({ workItemId: otherItemId, stepId, personId: ada.id });
    // And the other step on this one — that is the step half.
    expect(left).toContainEqual({ workItemId: itemId, stepId: otherStepId, personId: ada.id });
  });

  it('refuses an assignment naming a person who has been removed', async () => {
    // The person is read inside the write's own transaction, so this is a
    // typed refusal rather than the foreign key it used to be — a client
    // holding a picker rendered a moment too early is out of date, not broken.
    const gone = crypto.randomUUID();

    expect(await repo.assign(itemId, stepId, gone, wrote())).toEqual({
      ok: false,
      reason: 'unknown_person',
    });
    expect(await repo.assignmentsOf([itemId])).toEqual([]);
  });

  it('refuses a label naming a team that has been removed', async () => {
    const platform = await repo.addTeam({ id: crypto.randomUUID(), name: 'Platform' }, wrote());
    await workItems.patch(itemId, { serviceTeamId: platform.id }, wrote());
    await repo.removeTeam(platform.id, true, wrote());

    // `work_item.service_team_id` has no foreign key, so nothing under this
    // would refuse the write: without the read in the update's own transaction
    // the row simply carries an id the directory does not hold.
    expect(await workItems.patch(itemId, { serviceTeamId: platform.id }, wrote())).toEqual({
      ok: false,
      reason: 'unknown_team',
    });
    expect((await workItems.findById(itemId))?.serviceTeamId).toBeNull();
  });
});

describe('team removal revision consistency', () => {
  for (const removedId of ['aaa', 'zzz']) {
    it(`stamps each affected row once when removing team ${removedId}`, async () => {
      await repo.addTeam({ id: 'aaa', name: 'First' }, wrote());
      await repo.addTeam({ id: 'zzz', name: 'Second' }, wrote());
      await workItems.patch(itemId, { teamIds: ['aaa', 'zzz'] }, wrote());
      const untouchedId = 'untouched';
      await workItems.insert(workItemRow({ id: untouchedId, workPackageId }), [], wrote());
      const before = db.select().from(workItem).where(eq(workItem.id, itemId)).get();
      if (before === undefined) throw new Error('fixture row missing');
      expect(before.serviceTeamId).toBe('aaa');
      const removalStamp = { at: 42, by: authorId };

      expect(await repo.removeTeam(removedId, false, removalStamp)).toMatchObject({
        ok: false,
        reason: 'in_use',
      });
      expect(db.select().from(workItem).where(eq(workItem.id, itemId)).get()).toEqual(before);
      expect(await repo.removeTeam(removedId, true, removalStamp)).toMatchObject({ ok: true });

      const after = db.select().from(workItem).where(eq(workItem.id, itemId)).get();
      expect(after).toMatchObject({
        revision: before.revision + 1,
        updatedAt: 42,
        createdBy: authorId,
        serviceTeamId: removedId === 'aaa' ? null : 'aaa',
      });
      const labelled = (await workItems.listByWorkPackage(workPackageId)).find(
        (row) => row.id === itemId,
      );
      expect(labelled?.teamIds).toEqual([removedId === 'aaa' ? 'zzz' : 'aaa']);
      expect(db.select().from(workItem).where(eq(workItem.id, untouchedId)).get()).toMatchObject({
        revision: 0,
        updatedAt: 1,
        createdBy: authorId,
      });
      expect(await repo.removeTeam(removedId, true, { at: 99, by: authorId })).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(db.select().from(workItem).where(eq(workItem.id, itemId)).get()).toEqual(after);
    });
  }
});
