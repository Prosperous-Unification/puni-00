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
    clock,
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
  describe('ImportService admitted writes', () => {
    async function ownedSource(): Promise<Source<TransactionalStores>> {
      const source = await openSource();
      if ((await source.stores.users.findById(ACTOR)) !== null) return source;
      const created = await source.stores.users.create(
        { id: ACTOR, username: ACTOR, passwordHash: 'x', createdAt: STAMP.at },
        STAMP,
      );
      if (created === null) throw new Error('test owner name was already held');
      return source;
    }

    it('reuses an existing tag by name', async () => {
      const source = await ownedSource();
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
      const source = await ownedSource();
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
      const source = await ownedSource();
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
      const source = await ownedSource();
      try {
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

    it('stores exact project settings, nondefault step order, capacity, bands, and marker', async () => {
      const source = await ownedSource();
      try {
        const document = planDocumentFixture();
        document.settings.name = 'Exact imported plan';
        document.settings.restricted = true;
        document.settings.estimateMethod = 'pessimistic';
        document.settings.depReach = 'anchor-slice';
        document.settings.pertWeights = { optimistic: 2, realistic: 3, pessimistic: 5 };
        document.settings.estimateRounding = 'round';
        document.settings.scheduleEngine = 'optimized';
        document.settings.scheduleObjective = 'time';
        document.steps = [
          { id: 'step-discover', name: 'Discover', position: 10 },
          { id: 'step-build', name: 'Build', position: 30 },
          { id: 'step-verify', name: 'Verify', position: 70 },
        ];
        const row = document.workItems.at(0);
        if (row === undefined) throw new Error('plan document fixture has no work item');
        row.estimates = {
          'step-discover': { optimistic: 1, realistic: 2, pessimistic: 3 },
        };
        row.actuals = {};
        row.progress = {};
        row.measures = {};
        row.assignees = { 'step-build': 'person-1' };
        document.calendarMarkers = [
          {
            id: 'file-marker',
            date: '2026-09-21',
            name: 'Release train',
            color: '#f70100',
          },
        ];

        const imported = await importService(source).import(document, ACTOR);
        if (!imported.ok) throw new Error(`valid import refused at ${imported.path}`);
        const project = await source.stores.projects.findById(imported.projectId);
        const steps = await source.stores.projects.stepsOf(imported.projectId);
        const teams = await source.stores.directory.listTeams();
        const billing = teams.find(({ name }) => name === 'Billing');
        if (billing === undefined) throw new Error('imported capacity team was not stored');

        expect(steps.map(({ name, position }) => ({ name, position }))).toEqual([
          { name: 'Discover', position: 10 },
          { name: 'Build', position: 30 },
          { name: 'Verify', position: 70 },
        ]);
        expect(project).toEqual({
          id: imported.projectId,
          name: 'Exact imported plan',
          ownerId: ACTOR,
          restricted: true,
          estimateMethod: 'pessimistic',
          depReach: 'anchor-slice',
          pertWeights: { optimistic: 2, realistic: 3, pessimistic: 5 },
          estimateRounding: 'round',
          startDate: '2026-09-14',
          solutionRef: null,
          revision: 0,
          createdAt: STAMP.at,
          optimizationEnabled: false,
          scheduleEngine: 'optimized',
          scheduleObjective: 'time',
        });
        expect(await source.stores.priorityBands.listFor(imported.projectId)).toEqual([
          { startsAt: 1, defaultValue: 10, label: 'Critical' },
          { startsAt: 21, defaultValue: 30, label: 'High' },
          { startsAt: 41, defaultValue: 50, label: 'Medium' },
          { startsAt: 61, defaultValue: 70, label: 'Low' },
          { startsAt: 81, defaultValue: 90, label: 'Lowest' },
        ]);
        expect(await source.stores.capacity.listFor(imported.projectId)).toEqual([
          { serviceTeamId: billing.id, size: 2 },
        ]);
        const markers = await source.stores.calendarMarkers.listFor(imported.projectId);
        const marker = markers.at(0);
        if (marker === undefined) throw new Error('imported calendar marker was not stored');
        expect(markers).toHaveLength(1);
        expect(marker.id).not.toBe('file-marker');
        expect({
          projectId: marker.projectId,
          date: marker.date,
          name: marker.name,
          color: marker.color,
          createdAt: marker.createdAt,
        }).toEqual({
          projectId: imported.projectId,
          date: '2026-09-21',
          name: 'Release train',
          color: '#f70100',
          createdAt: STAMP.at,
        });
      } finally {
        await source.close();
      }
    });
  });
}
