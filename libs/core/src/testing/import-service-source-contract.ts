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

    it('stores a fresh complete tree without changing rows that own the file ids', async () => {
      const source = await ownedSource();
      try {
        const document = planDocumentFixture();
        const root = document.workItems.at(0);
        if (root === undefined) throw new Error('plan document fixture has no root work item');
        root.notes = 'Exact parent notes';
        root.frozenNumber = 'IMPORT-7';
        root.maxParallel = 3;
        root.estimates = { 'step-1': { optimistic: -1, realistic: -1, pessimistic: -1 } };
        root.actuals = { 'step-1': -1 };
        root.progress = { 'step-1': 'done' };
        root.measures = { hours_actual: { 'step-1': -1 } };
        root.assignees = {};
        root.externalRefs = [];
        document.workItems.push(
          {
            ...structuredClone(root),
            id: 'row-2',
            parentId: 'row-1',
            position: 10,
            name: 'Build release',
            notes: 'Exact leaf notes',
            frozenNumber: null,
            startNoEarlierThan: '2026-09-15',
            startNoEarlierThanReason: 'Environment opens',
            deadline: '2026-09-17',
            factStart: '2026-09-15',
            factEnd: '2026-09-16',
            priority: 7,
            maxParallel: 2,
            teamIds: [],
            tagIds: [],
            serviceIds: [],
            typeIds: [],
            externalRefs: [
              {
                id: 'external-ref-2a',
                systemId: 'system-1',
                url: 'https://example.test/issues/2',
                name: 'ISSUE-2',
              },
              {
                id: 'external-ref-2b',
                systemId: 'system-1',
                url: 'https://example.test/issues/3',
                name: 'ISSUE-3',
              },
            ],
            estimates: { 'step-1': { optimistic: 2, realistic: 4, pessimistic: 8 } },
            actuals: { 'step-1': 3 },
            progress: { 'step-1': 'in_progress' },
            measures: {
              token_estimate: { 'step-1': 1200 },
              token_actual: { 'step-1': 900 },
              hours_actual: { 'step-1': 6 },
            },
            dependsOn: [],
            assignees: { 'step-2': 'person-1' },
          },
          {
            ...structuredClone(root),
            id: 'row-3',
            parentId: 'row-1',
            position: 20,
            name: 'Verify release',
            notes: 'Dependency successor',
            teamIds: [],
            tagIds: [],
            serviceIds: [],
            typeIds: [],
            estimates: {},
            actuals: {},
            progress: {},
            measures: {},
            dependsOn: ['row-2'],
            assignees: {},
          },
        );
        await source.stores.projects.create(
          {
            id: 'source-project',
            name: 'Rows holding file ids',
            ownerId: ACTOR,
            restricted: false,
            estimateMethod: 'pert',
            depReach: 'whole-item',
            pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
            estimateRounding: 'ceil',
            startDate: null,
            solutionRef: null,
            revision: 0,
            createdAt: STAMP.at,
          },
          document.steps.map(({ id, name, position }) => ({
            id,
            projectId: 'source-project',
            name,
            position,
          })),
          STAMP,
        );
        await source.stores.subtrees.insertSubtree(
          {
            rows: document.workItems.map(({ id, parentId, position, name }) => ({
              id,
              projectId: 'source-project',
              parentId,
              position,
              name: `Original ${name}`,
              notes: `Original notes ${id}`,
              frozenNumber: null,
              startNoEarlierThan: null,
              startNoEarlierThanReason: null,
              deadline: null,
              factStart: null,
              factEnd: null,
              priority: null,
              serviceTeamId: null,
              serviceId: null,
              maxParallel: 1,
              revision: 0,
              teamIds: [],
            })),
            respaced: [],
            reparented: [],
            estimates: [],
            actuals: [],
            progress: [],
            measures: [],
            assignments: [],
            dependencies: [],
            removedEstimates: [],
            removedActuals: [],
            removedProgress: [],
            removedMeasures: [],
          },
          STAMP,
        );
        const originals = await source.stores.workItems.listByProject('source-project');

        const imported = await importService(source).import(document, ACTOR);
        if (!imported.ok) throw new Error(`valid import refused at ${imported.path}`);
        const [rows, steps, estimates, actuals, progress, measures, dependencies, assigned] =
          await Promise.all([
            source.stores.workItems.listByProject(imported.projectId),
            source.stores.projects.stepsOf(imported.projectId),
            source.stores.estimates.listByProject(imported.projectId),
            source.stores.actuals.listByProject(imported.projectId),
            source.stores.progress.listByProject(imported.projectId),
            source.stores.measures.listByProject(imported.projectId),
            source.stores.dependencies.listByProject(imported.projectId),
            source.stores.directory.assignmentsInProject(imported.projectId),
          ]);
        const importedRoot = rows.find(({ name }) => name === 'Ship');
        const importedLeaf = rows.find(({ name }) => name === 'Build release');
        const importedSuccessor = rows.find(({ name }) => name === 'Verify release');
        if (
          importedRoot === undefined ||
          importedLeaf === undefined ||
          importedSuccessor === undefined
        )
          throw new Error('imported hierarchy is incomplete');
        const build = steps.find(({ name }) => name === 'Build');
        const qa = steps.find(({ name }) => name === 'QA');
        if (build === undefined || qa === undefined)
          throw new Error('imported steps are incomplete');
        const teams = await source.stores.directory.listTeams();
        const tags = await source.stores.directory.listTags();
        const services = await source.stores.directory.listServices();
        const types = await source.stores.directory.listWorkItemTypes();
        const systems = await source.stores.directory.listExternalSystems();
        const people = await source.stores.directory.listPeople();
        const billing = teams.find(({ name }) => name === 'Billing');
        const release = tags.find(({ name }) => name === 'Release');
        const billingApi = services.find(({ name }) => name === 'Billing API');
        const milestone = types.find(({ name }) => name === 'Milestone');
        const tracker = systems.find(({ name }) => name === 'Tracker');
        const kat = people.find(({ name }) => name === 'Kat');
        if (
          billing === undefined ||
          release === undefined ||
          billingApi === undefined ||
          milestone === undefined ||
          tracker === undefined ||
          kat === undefined
        )
          throw new Error('imported directory is incomplete');

        expect(await source.stores.workItems.listByProject('source-project')).toEqual(originals);
        expect(imported.projectId).not.toBe('source-project');
        expect(billing.id).not.toBe('team-1');
        expect(release.id).not.toBe('tag-1');
        expect(billingApi.id).not.toBe('service-1');
        expect(milestone.id).not.toBe('type-1');
        expect(tracker.id).not.toBe('system-1');
        expect(kat.id).not.toBe('person-1');
        expect(rows.map(({ id }) => id)).not.toContain('row-1');
        expect(rows.map(({ id }) => id)).not.toContain('row-2');
        expect(rows.map(({ id }) => id)).not.toContain('row-3');
        expect(steps.map(({ id }) => id)).not.toContain('step-1');
        expect(steps.map(({ id }) => id)).not.toContain('step-2');
        expect(importedLeaf.externalRefs.map(({ id }) => id)).not.toContain('external-ref-2a');
        expect(importedLeaf.externalRefs.map(({ id }) => id)).not.toContain('external-ref-2b');
        expect(importedRoot).toMatchObject({
          parentId: null,
          position: 10,
          notes: 'Exact parent notes',
          frozenNumber: 'IMPORT-7',
          startNoEarlierThan: '2026-09-14',
          startNoEarlierThanReason: 'Release window',
          deadline: '2026-09-18',
          priority: 2,
          serviceTeamId: billing.id,
          serviceId: billingApi.id,
          maxParallel: 3,
          teamIds: [billing.id],
          tagIds: [release.id],
          serviceIds: [billingApi.id],
          typeIds: [milestone.id],
        });
        expect(importedLeaf).toMatchObject({
          parentId: importedRoot.id,
          position: 10,
          notes: 'Exact leaf notes',
          startNoEarlierThan: '2026-09-15',
          startNoEarlierThanReason: 'Environment opens',
          deadline: '2026-09-17',
          factStart: '2026-09-15',
          factEnd: '2026-09-16',
          priority: 7,
          maxParallel: 2,
          teamIds: [],
          tagIds: [],
          serviceIds: [],
          typeIds: [],
        });
        expect(importedSuccessor.parentId).toBe(importedRoot.id);
        expect(
          importedLeaf.externalRefs.map(({ systemId, url, name }) => ({ systemId, url, name })),
        ).toEqual([
          {
            systemId: tracker.id,
            url: 'https://example.test/issues/2',
            name: 'ISSUE-2',
          },
          {
            systemId: tracker.id,
            url: 'https://example.test/issues/3',
            name: 'ISSUE-3',
          },
        ]);
        expect(estimates).toEqual([
          {
            workItemId: importedLeaf.id,
            stepId: build.id,
            optimistic: 2,
            realistic: 4,
            pessimistic: 8,
          },
        ]);
        expect(actuals).toEqual([
          { workItemId: importedLeaf.id, stepId: build.id, days: 3, recordedAt: STAMP.at },
        ]);
        expect(progress).toEqual([
          {
            workItemId: importedLeaf.id,
            stepId: build.id,
            state: 'in_progress',
            statedAt: STAMP.at,
          },
        ]);
        expect(
          Object.fromEntries(measures.map(({ metric, ...measure }) => [metric, measure])),
        ).toEqual({
          token_estimate: {
            workItemId: importedLeaf.id,
            stepId: build.id,
            value: 1200,
            recordedAt: STAMP.at,
          },
          token_actual: {
            workItemId: importedLeaf.id,
            stepId: build.id,
            value: 900,
            recordedAt: STAMP.at,
          },
          hours_actual: {
            workItemId: importedLeaf.id,
            stepId: build.id,
            value: 6,
            recordedAt: STAMP.at,
          },
        });
        expect(assigned.assignments).toEqual([
          { workItemId: importedLeaf.id, stepId: qa.id, personId: kat.id },
        ]);
        const dependency = dependencies.at(0);
        if (dependency === undefined) throw new Error('imported dependency was not stored');
        expect(dependencies).toEqual([
          {
            id: dependency.id,
            projectId: imported.projectId,
            predecessorId: importedLeaf.id,
            successorId: importedSuccessor.id,
          },
        ]);
        expect(dependency.id).not.toBe('row-2');
        expect(dependency.id).not.toBe('row-3');
      } finally {
        await source.close();
      }
    });
  });
}
