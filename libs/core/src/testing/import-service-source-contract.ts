import { describe, expect, it } from 'bun:test';

import { servicesOver } from '../compose';
import { clockOf } from '../ports/clock';
import type { Source } from '../ports/source';
import type { TransactionalStores } from '../ports/stores';
import { ImportService } from '../service/import.service';
import { recordingBroadcaster } from './broadcast-fixture';
import { planDocumentFixture } from './plan-document-fixture';
import { fastScheduler } from './scheduler-fixture';

const ACTOR = 'import-owner';
const STAMP = { at: 1_757_851_200_000, by: ACTOR };

function importService(source: Source<TransactionalStores>): ImportService {
  let next = 0;
  const clock = clockOf({
    now: () => STAMP.at,
    newId: () => `imported-${String(++next)}`,
  });
  const announcements = recordingBroadcaster();
  return new ImportService({
    scheduler: fastScheduler,
    uow: source.uow,
    announcements,
    batchServices: (scope, broadcast) =>
      servicesOver(scope.stores, { clock, broadcast, scheduler: fastScheduler }),
  });
}

/** Runs the import-directory contract against one real source implementation. */
export function importServiceSourceContract(
  openSource: () => Promise<Source<TransactionalStores>>,
) {
  describe('ImportService directory admission', () => {
    it('reuses an existing tag by name', async () => {
      const source = await openSource();
      try {
        await source.stores.directory.addTag({ id: 'held-tag', name: 'Release' }, STAMP);
        const document = planDocumentFixture();

        await importService(source).import(document, ACTOR);

        expect(await source.stores.directory.listTags()).toEqual([
          { id: 'held-tag', name: 'Release' },
        ]);
        expect(
          (await source.stores.directory.listExternalSystems()).map(({ name }) => name),
        ).toContain('Tracker');
      } finally {
        await source.close();
      }
    });

    it('keeps an existing person byte-equivalent when the file disagrees', async () => {
      const source = await openSource();
      try {
        const heldTeam = await source.stores.directory.addTeam(
          { id: 'held-team', name: 'Existing team' },
          STAMP,
        );
        const added = await source.stores.directory.addPerson(
          { id: 'held-person', name: 'Kat', kind: 'person' },
          [heldTeam.id],
          STAMP,
        );
        if (!added.ok) throw new Error('test person membership was refused');
        const before = (await source.stores.directory.listPeople()).find(
          ({ id }) => id === added.person.id,
        );
        if (before === undefined) throw new Error('test person vanished before import');
        const beforeBytes = JSON.stringify(before);
        const document = planDocumentFixture();

        await importService(source).import(document, ACTOR);

        const after = (await source.stores.directory.listPeople()).find(
          ({ id }) => id === added.person.id,
        );
        expect(JSON.stringify(after)).toBe(beforeBytes);
      } finally {
        await source.close();
      }
    });

    it('restores a new agent kind and memberships', async () => {
      const source = await openSource();
      try {
        const document = planDocumentFixture();

        await importService(source).import(document, ACTOR);

        const team = (await source.stores.directory.listTeams()).find(
          ({ name }) => name === 'Billing',
        );
        const person = (await source.stores.directory.listPeople()).find(
          ({ name }) => name === 'Kat',
        );
        if (team === undefined) throw new Error('imported team was not stored');
        if (person === undefined) throw new Error('imported person was not stored');
        expect(person).toEqual({
          id: person.id,
          name: 'Kat',
          kind: 'agent',
          teamIds: [team.id],
        });
      } finally {
        await source.close();
      }
    });

    it('leaves off a solution slug already held inside admission', async () => {
      const source = await openSource();
      try {
        if ((await source.stores.users.findById(ACTOR)) === null) {
          const created = await source.stores.users.create(
            {
              id: ACTOR,
              username: ACTOR,
              passwordHash: 'x',
              createdAt: STAMP.at,
            },
            STAMP,
          );
          if (created === null) throw new Error('test owner name was already held');
        }
        await source.stores.projects.create(
          {
            id: 'held-project',
            name: 'Held solution',
            ownerId: ACTOR,
            restricted: false,
            estimateMethod: 'pert',
            depReach: 'whole-item',
            pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
            estimateRounding: 'ceil',
            startDate: null,
            solutionRef: { slug: 'held-solution', url: 'https://example.test/held' },
            revision: 0,
            createdAt: STAMP.at,
          },
          [],
          STAMP,
        );
        const document = planDocumentFixture();
        document.settings.solutionRef = {
          slug: 'held-solution',
          url: 'https://example.test/imported',
        };

        const imported = await importService(source).import(document, ACTOR);

        expect(imported).toMatchObject({ ok: true, solutionRef: 'left-off' });
      } finally {
        await source.close();
      }
    });
  });
}
