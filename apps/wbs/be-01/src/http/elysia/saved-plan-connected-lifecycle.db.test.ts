import { savedPlanRoutes } from '@wbs/core/http/saved-plan.routes';
import { installSavedPlans } from '@wbs/core/module/saved-plans/check';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { readSavedConnectedScheduleBody, readSavedPlanInput } from '@wbs/domain';
import { testProjectService } from '@wbs/store-memory/testing/service-fixtures';
import { openDatabase } from '@wbs/store-sqlite/db';
import { openSqliteSource } from '@wbs/store-sqlite/source';
import { expect, test } from 'bun:test';

import { nodeDigest } from '../../runtime/bun-runtime';
import { captureMixedFixture } from '../../service/saved-plan-connected.fixture';
import { mountEndpoints } from './mount';

const access = {
  kind: 'scoped' as const,
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' as const },
};

// Proof: routing saved read or saved/saved comparison through capture makes the
// post-save SS→FS edit cases fail at this injected live capability in both modes
// (read-live-after-relationship-edit.log and compare-live-after-relationship-edit.log).
const refuseLive = (): never => {
  throw new Error('historical inspection attempted a live capability');
};

test.each(['isolated', 'shared'] as const)(
  'real %s connected saves retain SS history after a persisted FS edit and foreign deletion',
  async (mode) => {
    await captureMixedFixture(mode, false, async (_captured, path, read) => {
      const writerSource = openSqliteSource({ dbPath: path });
      let sequence = 0;
      const { savedPlans: writer } = installSavedPlans({
        capture: writerSource.history.savedPlanCapture,
        plans: writerSource.history.savedPlans,
        digest: nodeDigest,
        scheduler: fastScheduler,
        now: () => 12,
        newId: () => `connected-${String(++sequence)}`,
        captureSharedPlan: read,
      });
      const save = () =>
        writer.save({
          projectId: 'a1',
          createdBy: 'Ada',
          createdById: 'ada',
          access,
          scoped: { organizationId: 'org-a', actorId: 'ada', role: 'member', operation: 'save' },
        });
      const first = await save();
      const second = await save();
      await writerSource.close();
      if (first.outcome !== 'saved' || second.outcome !== 'saved')
        throw new Error('two genuine connected saves required');
      const stored = first.record;
      if (!stored.schedule.present) throw new Error('connected schedule required');
      const schedule = readSavedConnectedScheduleBody(JSON.parse(stored.schedule.body.bytes));
      expect(schedule.connection.stages).toHaveLength(2);
      expect(schedule.connection.stages[0].variants?.time).toMatchObject({
        state: 'ready',
        decision: { chosen: 'optimized' },
      });
      expect(stored.input.bytes).toContain('Beta work');
      expect(stored.input.bytes).toContain('Build');

      const relationshipEditor = openDatabase(path);
      try {
        expect(
          relationshipEditor.query("SELECT type FROM external_dependency WHERE id='ab'").get(),
        ).toEqual({ type: 'SS' });
        relationshipEditor.run("UPDATE external_dependency SET type='FS' WHERE id='ab'");
        expect(
          relationshipEditor
            .query(
              "SELECT id,type,predecessor_project_id,predecessor_work_item_id,predecessor_step_id,successor_project_id,successor_work_item_id,successor_step_id FROM external_dependency WHERE id='ab'",
            )
            .get(),
        ).toEqual({
          id: 'ab',
          type: 'FS',
          predecessor_project_id: 'a1',
          predecessor_work_item_id: 'a',
          predecessor_step_id: 'design',
          successor_project_id: 'a2',
          successor_work_item_id: 'b',
          successor_step_id: 'build',
        });
      } finally {
        relationshipEditor.close();
      }

      // Every historical observation follows the persisted SS→FS edit and reopens its stores.
      const inspect = async () => {
        const source = openSqliteSource({ dbPath: path });
        const { savedPlans: history } = installSavedPlans({
          capture: {
            readPlanInput: refuseLive,
          },
          plans: source.history.savedPlans,
          digest: nodeDigest,
          scheduler: { read: refuseLive, supports: refuseLive, readResolvedFast: refuseLive },
          captureSharedPlan: refuseLive,
          now: refuseLive,
          newId: refuseLive,
        });
        try {
          const opened = await history.read(stored.id);
          if (opened.outcome !== 'read') throw new Error('saved history required');
          expect(opened.plan.input).toEqual(stored.input);
          expect(opened.plan.schedule).toEqual(stored.schedule);
          const input = readSavedPlanInput(
            JSON.parse(opened.plan.input.bytes),
            opened.plan.input.schemaVersion,
          );
          if (input.dependencyHistory.kind !== 'connected')
            throw new Error('connected dependency history required');
          expect(input.dependencyHistory.relationships).toHaveLength(1);
          expect(input.dependencyHistory.relationships[0]).toMatchObject({
            id: 'ab',
            type: 'SS',
            predecessor: { projectId: 'a1', workItemId: 'a', scope: 'node', stepId: 'design' },
            successor: { projectId: 'a2', workItemId: 'b', scope: 'node', stepId: 'build' },
          });
          expect(opened.plan.input.sha256).toBe(await nodeDigest.sha256(opened.plan.input.bytes));
          const compared = await history.compare(
            'a1',
            { kind: 'saved', savedPlanId: stored.id },
            { kind: 'saved', savedPlanId: second.record.id },
            access,
          );
          if (compared.outcome !== 'compared') throw new Error('saved comparison required');
          expect(compared.diff).toEqual({ input: [], schedule: [] });
          for (const side of [compared.left, compared.right]) {
            if (side.provenance.kind !== 'connected')
              throw new Error('connected provenance required');
            expect(side.provenance.mode).toBe(mode);
            expect(side.provenance.stages.map((stage) => stage.boundary.canonical)).toEqual(
              schedule.connection.stages.map((stage) => stage.stageBytes),
            );
          }
          const app = mountEndpoints(
            savedPlanRoutes(
              history,
              testProjectService(source.stores.projects),
              recordingBroadcaster(),
              { resolve: () => Promise.resolve({ ok: true, access }) },
            ),
            {
              appOrigin: 'http://localhost',
              resolveIdentity: () =>
                Promise.resolve({
                  ok: true,
                  principal: { id: 'ada', username: 'Ada', scopes: ['read', 'write'] },
                }),
              reportUnexpectedFailure: (failure) => {
                throw failure;
              },
            },
          );
          const httpRead = await app.handle(
            new Request(`http://localhost/api/saved-plans/${stored.id}`),
          );
          expect(httpRead.status).toBe(200);
          expect(await httpRead.json()).toEqual({ savedPlan: opened.plan });
          const httpComparison = await app.handle(
            new Request(
              `http://localhost/api/projects/a1/saved-plans/compare?left=${stored.id}&right=${second.record.id}`,
            ),
          );
          expect(httpComparison.status).toBe(200);
          expect(await httpComparison.json()).toEqual({
            left: compared.left,
            right: compared.right,
            diff: compared.diff,
          });
          return compared;
        } finally {
          await source.close();
        }
      };
      const before = await inspect();
      const live = openDatabase(path);
      try {
        live.run(
          "UPDATE project SET name='Renamed foreign project',start_date='2026-11-02' WHERE id='a2'",
        );
        live.run("UPDATE project_abbreviation SET abbreviation='RENAMED' WHERE project_id='a2'");
        live.run(
          "UPDATE work_item SET name='Renamed foreign work',position=80,frozen_number='990',fact_start='2026-10-01',fact_end='2026-10-02' WHERE id='b'",
        );
        live.run("UPDATE step SET name='Renamed foreign step',position=90 WHERE id='build'");
        live.run(
          "UPDATE estimate SET optimistic=9,realistic=9,pessimistic=9 WHERE work_item_id='b'",
        );
        expect(
          live.query("SELECT name,position,frozen_number FROM work_item WHERE id='b'").get(),
        ).toEqual({
          name: 'Renamed foreign work',
          position: 80,
          frozen_number: '990',
        });
        expect(await inspect()).toEqual(before);
        live.run('DELETE FROM external_dependency');
        live.run("DELETE FROM estimate WHERE work_item_id='b'");
        live.run("DELETE FROM assignment WHERE work_item_id='b'");
        live.run("DELETE FROM work_item WHERE project_id='a2'");
        live.run("DELETE FROM step WHERE project_id='a2'");
        live.run("DELETE FROM project WHERE id='a2'");
        expect(live.query("SELECT id FROM project WHERE id='a2'").all()).toEqual([]);
        expect(live.query('SELECT id FROM external_dependency').all()).toEqual([]);
        expect(await inspect()).toEqual(before);
      } finally {
        live.close();
      }
    });
  },
);
