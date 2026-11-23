import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as connectedPlan from '@wbs/core/service/connected-plan';
import { deriveConnectedPlan } from '@wbs/core/service/connected-plan';
import { selectConnectedWorkPackage } from '@wbs/core/service/connected-plan-projection';
import { workPackageConnectedTree } from '@wbs/core/service/connected-tree';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { scheduleResolved } from '@wbs/domain';
import { buildConnectedBenchmark } from '@wbs/domain/connected-benchmark-fixture';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { expect, spyOn, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { ChainSnapshotRepository, createLivePlanStore } from './chain-snapshot';
import * as connectedCapture from './connected-plan-capture';
import { openConnection, openReadOnlyConnection } from './db';
import { OPEN } from './gate';
import { StepCatalogueRepository } from './step-catalogue';
import { seedDependencyAuthority } from './testing/dependency-activation';
import { openSpaceDatabase } from './testing/space-database';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';
import { WorkPackageAddressSearchRepository } from './work-package-address-search';

for (const shape of ['sparse', 'dense'] as const) {
  test(`${shape}: captures each required work package once; closure includes incident and shared person bridges; lookup page bounds never truncate scheduling closure`, async () => {
    const folder = mkdtempSync(join(tmpdir(), 'connected-benchmark-'));
    try {
      const path = await openSpaceDatabase(folder);
      seedDependencyAuthority(path);
      const benchmark = buildConnectedBenchmark(shape);
      const stepId = 'benchmark-dev';
      const fixture = {
        ...benchmark,
        workPackages: benchmark.workPackages.map((member) => ({ ...member, stepId })),
      };
      const projectId = 'benchmark-project';
      const stamp = { at: 1, by: 'ada' };
      const connection = openConnection(path);
      try {
        connection.db.run(sql`UPDATE organization_activation SET state='activated',activated_at=1`);
        connection.db.run(
          sql`INSERT INTO project(id,organization_id,name,created_at,created_by) VALUES (${projectId},'org-a','Benchmark',1,'ada')`,
        );
        const defined = await new StepCatalogueRepository(
          connection.db,
          OPEN,
          'owned',
        ).defineAndBindStep(
          'org-a',
          {
            id: stepId,
            name: 'Development',
            code: 'dev',
            position: 10,
            defaultAllowancePercent: 0,
            defaultEstimateUnit: 'workdays',
          },
          {
            bindingId: 'benchmark-dev-binding',
            scopeKind: 'project',
            scopeId: projectId,
            position: 10,
            workItemTypeId: null,
          },
          stamp,
        );
        if (!defined.ok) throw new Error('benchmark step binding refused: ' + defined.reason);
        connection.db.run(sql`UPDATE organization SET shared_people=1 WHERE id='org-a'`);
        const workPackages = new WorkPackageRepository(connection.db, OPEN);
        const people = new Set<string>();
        for (const member of fixture.workPackages) {
          const created = await workPackages.createInOrganization(
            workPackageRow({
              id: member.workPackageId,
              name: member.workPackageId,
              projectId,
              startDate: '2026-10-05',
            }),
            [],
            stamp,
            'org-a',
            { id: crypto.randomUUID(), auditId: crypto.randomUUID() },
          );
          if (typeof created === 'string') throw new Error('benchmark package refused: ' + created);
          connection.db.run(
            sql`INSERT INTO work_item(id,work_package_id,position,name) VALUES (${member.workItemId},${member.workPackageId},10,${member.workItemId})`,
          );
          connection.db.run(
            sql`INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (${member.workItemId},${member.stepId},1,1,1)`,
          );
          if (member.personId !== null) {
            if (!people.has(member.personId)) {
              people.add(member.personId);
              connection.db.run(
                sql`INSERT INTO person(id,name) VALUES (${member.personId},${member.personId})`,
              );
              connection.db.run(
                sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES (${member.personId},'org-a',${member.personId})`,
              );
            }
            connection.db.run(
              sql`INSERT INTO assignment(work_item_id,step_id,person_id) VALUES (${member.workItemId},${member.stepId},${member.personId})`,
            );
          }
        }
        for (const relationship of fixture.relationships)
          connection.db.run(
            sql`INSERT INTO external_dependency(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES (${relationship.id},'org-a',${relationship.predecessor.workPackageId},${relationship.successor.workPackageId},${relationship.predecessor.workItemId},${relationship.successor.workItemId},'whole','whole','FS')`,
          );
      } finally {
        connection.close();
      }
      const lookup = new WorkPackageAddressSearchRepository({
        openConnection: () => openReadOnlyConnection(path),
        activeOrganizationOf: () => () => Promise.resolve('org-a'),
        now: () => 1,
      });
      for (const pageSize of [25, 200]) {
        const page = await lookup.withSnapshot({ id: 'ada' }, (snapshot) =>
          snapshot.searchWorkPackages(shape, null, pageSize),
        );
        expect(page.ok).toBe(true);
        if (!page.ok) throw new Error('fixture lookup refused');
        expect(page.value).toHaveLength(Math.min(pageSize, fixture.workPackages.length));
      }
      const queries: string[] = [];
      const snapshotStore = new ChainSnapshotRepository({
        openConnection: () =>
          openReadOnlyConnection(path, { logQuery: (query) => queries.push(query) }),
        activeOrganizationOf: () => () => Promise.resolve('org-a'),
        now: () => 1,
        schedulerOf: () => ({
          supports: () => true,
          readResolvedFast: scheduleResolved,
          read: () => {
            throw new Error('benchmark admitted scheduler');
          },
        }),
      });
      const reads = spyOn(WorkItemRepository.prototype, 'listByWorkPackage');
      try {
        const target = fixture.workPackages.at(Math.floor(fixture.workPackages.length / 2));
        if (target === undefined) throw new Error('fixture target absent');
        const observed = await snapshotStore.withSnapshot(
          { id: 'ada' },
          target.workPackageId,
          async (snapshot) => {
            const beforeCapture = queries.length;
            const captureStart = performance.now();
            const captured = await snapshot.captureConnected(target.workPackageId);
            const captureMs = performance.now() - captureStart;
            const captureQueries = queries.length - beforeCapture;
            // Proof: applying lookup's 25-work-package page limit to full capture omitted 177 sparse and one dense member.
            expect(captured.workPackages.map(({ workPackageId }) => workPackageId).sort()).toEqual(
              fixture.workPackages.map(({ workPackageId }) => workPackageId).sort(),
            );
            expect(captured.relationships.map(({ id }) => id).sort()).toEqual(
              fixture.relationships.map(({ id }) => id).sort(),
            );
            expect(
              captured.workPackages.every(
                ({ reads }) => reads.workItems.length === 1 && reads.steps.length === 1,
              ),
            ).toBe(true);
            const deriveStart = performance.now();
            const projection = deriveConnectedPlan(captured, snapshot.scheduler, scheduleResolved);
            const deriveMs = performance.now() - deriveStart;
            expect(projection.placement.kind).toBe('scheduled');
            if (projection.placement.kind !== 'scheduled')
              throw new Error('fixture placement unavailable');
            expect(projection.placement.combined.slices.size).toBe(fixture.workPackages.length);
            for (const member of fixture.workPackages) {
              const requested = await snapshot.captureConnected(member.workPackageId);
              expect(queries.length - beforeCapture).toBe(captureQueries);
              expect(requested).toBe(captured);
              const selected = selectConnectedWorkPackage(projection, member.workPackageId);
              expect(selected.kind).toBe('scheduled');
              if (selected.kind !== 'scheduled') throw new Error('fixture projection unavailable');
              expect(selected.schedule.workItems.has(member.workItemId)).toBe(true);
            }
            expect(queries.length - beforeCapture).toBe(captureQueries);
            // Proof: bypassing memo reuse doubled first-projection capture queries from 10303/5897 to 20606/11794.
            expect(reads.mock.calls.map(([workPackageId]) => workPackageId).sort()).toEqual(
              fixture.workPackages.map(({ workPackageId }) => workPackageId).sort(),
            );
            console.log(
              JSON.stringify({
                metric: 'connected-capture',
                shape,
                workPackages: captured.workPackages.length,
                relationships: captured.relationships.length,
                captureQueries,
                totalQueries: queries.length,
                captureMs,
                deriveMs,
              }),
            );
            return { kind: 'not_found' };
          },
        );
        expect(observed.ok).toBe(true);
      } finally {
        reads.mockRestore();
      }
      const liveQueries: string[] = [];
      const fullCaptures = new Map<string, number>();
      const captureSamples: { queries: number; elapsedMs: number }[] = [];
      const deriveSamples: number[] = [];
      const captureOriginal = connectedCapture.captureConnectedPlanIn;
      const deriveOriginal = connectedPlan.deriveConnectedPlan;
      const captureTiming = spyOn(connectedCapture, 'captureConnectedPlanIn').mockImplementation(
        async (...args) => {
          const started = performance.now();
          const before = liveQueries.length;
          const captured = await captureOriginal(...args);
          captureSamples.push({
            queries: liveQueries.length - before,
            elapsedMs: performance.now() - started,
          });
          return captured;
        },
      );
      const deriveTiming = spyOn(connectedPlan, 'deriveConnectedPlan').mockImplementation(
        (...args) => {
          const started = performance.now();
          const projection = deriveOriginal(...args);
          deriveSamples.push(performance.now() - started);
          return projection;
        },
      );
      const liveRows = spyOn(WorkItemRepository.prototype, 'listByWorkPackage');
      let scheduledComponents = 0;
      let closed = 0;
      try {
        const started = performance.now();
        const aggregate = await createLivePlanStore({
          kind: 'owned',
          openConnection: () => {
            const opened = openReadOnlyConnection(path, {
              logQuery: (query) => liveQueries.push(query),
            });
            return {
              db: opened.db,
              close: () => {
                closed++;
                opened.close();
              },
            };
          },
          captureRead: {
            afterFirstRead: ({ workPackageId }) => {
              const count = (fullCaptures.get(workPackageId) ?? 0) + 1;
              fullCaptures.set(workPackageId, count);
              // Proof: bypassing connectedByWorkPackage reuse makes the second component projection capture its first member twice.
              expect(count).toBe(1);
              return Promise.resolve();
            },
          },
          schedulerOf: () => ({
            ...fastScheduler,
            readResolvedFast: (input) => {
              scheduledComponents++;
              return scheduleResolved(input);
            },
          }),
        }).readAggregate('ada', {
          principal: { id: 'ada' },
          kind: 'scoped',
          scope: { cap: null, organizationId: 'org-a', userId: 'ada' },
        });
        const aggregateMs = performance.now() - started;
        expect(closed).toBe(1);
        expect(aggregate.kind).toBe('shared');
        if (aggregate.kind !== 'shared') throw new Error('fixture aggregate refused');
        const requiredIds = fixture.workPackages.map(({ workPackageId }) => workPackageId).sort();
        expect(aggregate.entries.map(({ workPackageId }) => workPackageId).sort()).toEqual(
          [...requiredIds, 'a1', 'a2', 'a3', 'a4'].sort(),
        );
        const members = aggregate.entries.filter(({ workPackageId }) =>
          requiredIds.includes(workPackageId),
        );
        const first = members.at(0);
        if (first?.plan.kind !== 'connected') throw new Error('fixture connected aggregate absent');
        expect(
          first.plan.projection.capture.workPackages
            .map(({ workPackageId }) => workPackageId)
            .sort(),
        ).toEqual(requiredIds);
        expect(first.plan.projection.capture.relationships.map(({ id }) => id).sort()).toEqual(
          fixture.relationships.map(({ id }) => id).sort(),
        );
        expect(captureSamples).toHaveLength(1);
        expect(deriveSamples).toHaveLength(1);
        expect(scheduledComponents).toBe(1);
        expect(requiredIds.map((id) => fullCaptures.get(id))).toEqual(requiredIds.map(() => 1));
        // Both the capture and live metadata reuse one work-item read per member.
        expect(
          liveRows.mock.calls
            .map(([workPackageId]) => workPackageId)
            .filter((id) => requiredIds.includes(id))
            .sort(),
        ).toEqual(requiredIds);
        for (const member of fixture.workPackages) {
          const entry = members.find(({ workPackageId }) => workPackageId === member.workPackageId);
          if (entry?.plan.kind !== 'connected')
            throw new Error('fixture member missing from aggregate');
          expect(entry.plan).toBe(first.plan);
          expect(entry.basis).toBeNull();
          const tree = workPackageConnectedTree(entry.plan, member.workPackageId);
          expect(tree.metadata.workPackage.id).toBe(member.workPackageId);
          expect(tree.placement.kind).toBe('scheduled');
          const selected = selectConnectedWorkPackage(entry.plan.projection, member.workPackageId);
          if (selected.kind !== 'scheduled') throw new Error('fixture aggregate placement absent');
          expect(selected.schedule.workItems.has(member.workItemId)).toBe(true);
        }
        console.log(
          JSON.stringify({
            metric: 'connected-live-aggregate',
            shape,
            workPackages: members.length,
            relationships: fixture.relationships.length,
            totalQueries: liveQueries.length,
            captureSamples,
            deriveSamples,
            aggregateMs,
            fullCapturedWorkPackages: requiredIds.filter((id) => fullCaptures.get(id) === 1).length,
            scheduledComponents,
          }),
        );
      } finally {
        liveRows.mockRestore();
        deriveTiming.mockRestore();
        captureTiming.mockRestore();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }, 30000);
}
