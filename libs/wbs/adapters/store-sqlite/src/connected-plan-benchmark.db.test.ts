import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as connectedPlan from '@wbs/core/service/connected-plan';
import { deriveConnectedPlan } from '@wbs/core/service/connected-plan';
import { selectConnectedProject } from '@wbs/core/service/connected-plan-projection';
import { projectConnectedTree } from '@wbs/core/service/connected-tree';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { scheduleResolved } from '@wbs/domain';
import { buildConnectedBenchmark } from '@wbs/domain/connected-benchmark-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { expect, spyOn, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { ChainSnapshotRepository, createLivePlanStore } from './chain-snapshot';
import * as connectedCapture from './connected-plan-capture';
import { openConnection, openReadOnlyConnection } from './db';
import { OPEN } from './gate';
import { ProjectRepository } from './project';
import { ProjectAddressSearchRepository } from './project-address-search';
import { seedDependencyAuthority } from './testing/dependency-activation';
import { openSpaceDatabase } from './testing/space-database';
import { WorkItemRepository } from './work-item';

for (const shape of ['sparse', 'dense'] as const) {
  test(`${shape}: captures each required project once; closure includes incident and shared person bridges; lookup page bounds never truncate scheduling closure`, async () => {
    const folder = mkdtempSync(join(tmpdir(), 'connected-benchmark-'));
    try {
      const path = await openSpaceDatabase(folder);
      seedDependencyAuthority(path);
      const fixture = buildConnectedBenchmark(shape);
      const connection = openConnection(path);
      try {
        connection.db.run(sql`UPDATE organization_activation SET state='activated',activated_at=1`);
        connection.db.run(
          sql`INSERT INTO organization_membership(organization_id,user_id,role,created_at) VALUES ('org-a','ada','member',1)`,
        );
        connection.db.run(sql`UPDATE organization SET shared_people=1 WHERE id='org-a'`);
        const projects = new ProjectRepository(connection.db, OPEN);
        const people = new Set<string>();
        for (const member of fixture.projects) {
          await projects.createInOrganization(
            projectRow({
              id: member.projectId,
              name: member.projectId,
              ownerId: 'ada',
              startDate: '2026-10-05',
            }),
            [],
            { at: 1, by: 'ada' },
            'org-a',
          );
          connection.db.run(
            sql`INSERT INTO work_item(id,project_id,position,name) VALUES (${member.workItemId},${member.projectId},10,${member.workItemId})`,
          );
          connection.db.run(
            sql`INSERT INTO step(id,project_id,name,position) VALUES (${member.stepId},${member.projectId},${member.stepId},10)`,
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
            sql`INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES (${relationship.id},'org-a',${relationship.predecessor.projectId},${relationship.successor.projectId},${relationship.predecessor.workItemId},${relationship.successor.workItemId},'whole','whole','FS')`,
          );
      } finally {
        connection.close();
      }
      const lookup = new ProjectAddressSearchRepository({
        openConnection: () => openReadOnlyConnection(path),
        activeOrganizationOf: () => () => Promise.resolve('org-a'),
        now: () => 1,
      });
      for (const pageSize of [25, 200]) {
        const page = await lookup.withSnapshot({ id: 'ada' }, (snapshot) =>
          snapshot.searchProjects(shape, null, pageSize),
        );
        expect(page.ok).toBe(true);
        if (!page.ok) throw new Error('fixture lookup refused');
        expect(page.value).toHaveLength(Math.min(pageSize, fixture.projects.length));
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
      const reads = spyOn(WorkItemRepository.prototype, 'listByProject');
      try {
        const target = fixture.projects.at(Math.floor(fixture.projects.length / 2));
        if (target === undefined) throw new Error('fixture target absent');
        const observed = await snapshotStore.withSnapshot(
          { id: 'ada' },
          target.projectId,
          async (snapshot) => {
            const beforeCapture = queries.length;
            const captureStart = performance.now();
            const captured = await snapshot.captureConnected(target.projectId);
            const captureMs = performance.now() - captureStart;
            const captureQueries = queries.length - beforeCapture;
            // Proof: applying lookup's 25-project page limit to full capture omitted 177 sparse and one dense member.
            expect(captured.projects.map(({ projectId }) => projectId).sort()).toEqual(
              fixture.projects.map(({ projectId }) => projectId).sort(),
            );
            expect(captured.relationships.map(({ id }) => id).sort()).toEqual(
              fixture.relationships.map(({ id }) => id).sort(),
            );
            expect(
              captured.projects.every(
                ({ reads }) => reads.workItems.length === 1 && reads.steps.length === 1,
              ),
            ).toBe(true);
            const deriveStart = performance.now();
            const projection = deriveConnectedPlan(captured, snapshot.scheduler, scheduleResolved);
            const deriveMs = performance.now() - deriveStart;
            expect(projection.placement.kind).toBe('scheduled');
            if (projection.placement.kind !== 'scheduled')
              throw new Error('fixture placement unavailable');
            expect(projection.placement.combined.slices.size).toBe(fixture.projects.length);
            for (const member of fixture.projects) {
              const requested = await snapshot.captureConnected(member.projectId);
              expect(queries.length - beforeCapture).toBe(captureQueries);
              expect(requested).toBe(captured);
              const selected = selectConnectedProject(projection, member.projectId);
              expect(selected.kind).toBe('scheduled');
              if (selected.kind !== 'scheduled') throw new Error('fixture projection unavailable');
              expect(selected.schedule.workItems.has(member.workItemId)).toBe(true);
            }
            expect(queries.length - beforeCapture).toBe(captureQueries);
            // Proof: bypassing memo reuse doubled first-projection capture queries from 10303/5897 to 20606/11794.
            expect(reads.mock.calls.map(([projectId]) => projectId).sort()).toEqual(
              fixture.projects.map(({ projectId }) => projectId).sort(),
            );
            console.log(
              JSON.stringify({
                metric: 'connected-capture',
                shape,
                projects: captured.projects.length,
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
      const liveRows = spyOn(WorkItemRepository.prototype, 'listByProject');
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
            afterFirstRead: ({ projectId }) => {
              const count = (fullCaptures.get(projectId) ?? 0) + 1;
              fullCaptures.set(projectId, count);
              // Proof: bypassing connectedByProject reuse makes the second component projection capture its first member twice.
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
          kind: 'scoped',
          scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
        });
        const aggregateMs = performance.now() - started;
        expect(closed).toBe(1);
        expect(aggregate.kind).toBe('shared');
        if (aggregate.kind !== 'shared') throw new Error('fixture aggregate refused');
        const requiredIds = fixture.projects.map(({ projectId }) => projectId).sort();
        expect(aggregate.entries.map(({ projectId }) => projectId).sort()).toEqual(
          [...requiredIds, 'a1', 'a2', 'a3', 'a4'].sort(),
        );
        const members = aggregate.entries.filter(({ projectId }) =>
          requiredIds.includes(projectId),
        );
        const first = members.at(0);
        if (first?.plan.kind !== 'connected') throw new Error('fixture connected aggregate absent');
        expect(
          first.plan.projection.capture.projects.map(({ projectId }) => projectId).sort(),
        ).toEqual(requiredIds);
        expect(first.plan.projection.capture.relationships.map(({ id }) => id).sort()).toEqual(
          fixture.relationships.map(({ id }) => id).sort(),
        );
        expect(captureSamples).toHaveLength(1);
        expect(deriveSamples).toHaveLength(1);
        expect(scheduledComponents).toBe(1);
        expect(requiredIds.map((id) => fullCaptures.get(id))).toEqual(requiredIds.map(() => 1));
        // Full-input capture and live metadata each read the work-item table once per member.
        expect(
          liveRows.mock.calls
            .map(([projectId]) => projectId)
            .filter((id) => requiredIds.includes(id))
            .sort(),
        ).toEqual([...requiredIds, ...requiredIds].sort());
        for (const member of fixture.projects) {
          const entry = members.find(({ projectId }) => projectId === member.projectId);
          if (entry?.plan.kind !== 'connected')
            throw new Error('fixture member missing from aggregate');
          expect(entry.plan).toBe(first.plan);
          expect(entry.basis).toBeNull();
          const tree = projectConnectedTree(entry.plan, member.projectId);
          expect(tree.metadata.project.id).toBe(member.projectId);
          expect(tree.placement.kind).toBe('scheduled');
          const selected = selectConnectedProject(entry.plan.projection, member.projectId);
          if (selected.kind !== 'scheduled') throw new Error('fixture aggregate placement absent');
          expect(selected.schedule.workItems.has(member.workItemId)).toBe(true);
        }
        console.log(
          JSON.stringify({
            metric: 'connected-live-aggregate',
            shape,
            projects: members.length,
            relationships: fixture.relationships.length,
            totalQueries: liveQueries.length,
            captureSamples,
            deriveSamples,
            aggregateMs,
            fullCapturedProjects: requiredIds.filter((id) => fullCaptures.get(id) === 1).length,
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
