import * as connectedHistory from '@wbs/core/module/saved-plans/connected-history';
import * as domain from '@wbs/domain';
import { planDiffIsEmpty } from '@wbs/domain';
import * as sqliteDb from '@wbs/store-sqlite/db';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { ProjectRepository } from '@wbs/store-sqlite/project';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { WorkItemRepository } from '@wbs/store-sqlite/work-item';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { runMigrations } from '../repository/migrate';
import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness | undefined;
afterEach(async () => {
  await harness?.closeComposed();
});

async function openFixture(mode: 'isolated' | 'shared' = 'isolated') {
  const probe = {
    opened: 0,
    closed: 0,
    live: 0,
    armed: false,
    afterClose: () => undefined,
    announcements: 0,
    pushes: 0,
  };
  const readConnections = new Set<unknown>();
  const mounted = OrganizationHarness.openComposedWith({
    withOptimizer: true,
    openReadOnlyConnection: (path) => {
      const connection = openReadOnlyConnection(path);
      readConnections.add(connection.db);
      probe.opened += 1;
      probe.live += 1;
      return {
        db: connection.db,
        close: () => {
          connection.close();
          probe.closed += 1;
          probe.live -= 1;
          if (probe.armed) probe.afterClose();
        },
      };
    },
    pushFetch: (_url, init) => {
      probe.pushes += 1;
      if (typeof init?.body === 'string' && init.body.includes('saved_plans_changed')) {
        expect(probe.live).toBe(0);
        expect(mounted.sqlite.query('SELECT id FROM saved_plan').all()).toHaveLength(1);
        expect(
          mounted.sqlite.query('SELECT kind FROM saved_plan_body').all().length,
        ).toBeGreaterThanOrEqual(1);
        probe.announcements += 1;
      }
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    },
    migrate: (path) => {
      runMigrations(path, new URL('../../drizzle', import.meta.url).pathname);
      seedDependencyAuthority(path);
    },
  });
  harness = mounted;
  await mounted.register('ada');
  mounted.organization('org');
  mounted.member('org', 'ada', 'member');
  mounted.bind('ada', 'org');
  mounted.activate();
  if (mode === 'shared')
    mounted.sqlite.run("UPDATE organization SET shared_people=1 WHERE id='org'");
  const projects: string[] = [];
  for (const name of ['Alpha', 'Beta']) {
    const created = await mounted.call('ada', 'POST', '/api/projects', { name });
    if (created.status !== 200) throw new Error(JSON.stringify(created));
    const project = created.body as { project: { id: string } };
    projects.push(project.project.id);
  }
  const [alpha, beta] = projects;
  mounted.sqlite.run("UPDATE project SET start_date='2026-10-05',estimate_rounding='exact'");
  mounted.sqlite.run(
    "INSERT INTO work_item(id,project_id,position,name) VALUES('a',?,10,'Alpha work'),('b',?,10,'Beta work')",
    [alpha, beta],
  );
  mounted.sqlite.run(
    "INSERT INTO step(id,project_id,name,position) VALUES('design',?,'Design',10),('build',?,'Build',10)",
    [alpha, beta],
  );
  mounted.sqlite.run(
    "INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES('a','design',1,1,1),('b','build',1,1,1)",
  );
  mounted.sqlite.run(
    "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES('ab','org',?,?,'a','b','whole','whole','FS')",
    [alpha, beta],
  );
  return { mounted, alpha, beta, probe, readConnections };
}

// Proof: the initial test returned 500 at compose's connected guard; duplicate publication later failed the once-only assertion (slice-d-fault-announcement-repeat.log).
test('mounted connected save persists input9 schedule2 and equals one current observation', async () => {
  const { mounted, beta, probe } = await openFixture();
  const saved = await mounted.call('ada', 'POST', `/api/projects/${beta}/saved-plans`, {
    name: 'Connected',
  });
  expect(saved.status).toBe(201);
  expect(probe.announcements).toBe(1);
  const { savedPlan } = saved.body as { savedPlan: { id: string } };
  expect(
    mounted.sqlite
      .query('SELECT input_schema_version,schedule_schema_version FROM saved_plan WHERE id=?')
      .get(savedPlan.id),
  ).toEqual({ input_schema_version: 9, schedule_schema_version: 2 });
  const compared = await mounted.call(
    'ada',
    'GET',
    `/api/projects/${beta}/saved-plans/compare?left=${savedPlan.id}&right=current`,
  );
  expect(compared.status).toBe(200);
  const comparison = compared.body as {
    diff: Parameters<typeof planDiffIsEmpty>[0];
    left: { provenance: { kind: string } };
    right: { provenance: { kind: string } };
  };
  expect(planDiffIsEmpty(comparison.diff)).toBe(true);
  expect(comparison.left.provenance.kind).toBe('connected');
  expect(comparison.right.provenance.kind).toBe('connected');
});

// Proof: removing current/current reuse produced two read connections instead of one (slice-d-fault-current-recapture.log).
// Proof: task-5-postclose/derive.patch reran real placement derivation during history conversion;
// the expired snapshot threw `read snapshot is closed` and this mounted comparison returned 500.
test('connected current/current captures once and serialization follows read connection closure', async () => {
  const { mounted, beta, probe } = await openFixture();
  const before = probe.opened;
  const convertHistory = connectedHistory.captureConnectedHistory;
  const convert = spyOn(connectedHistory, 'captureConnectedHistory').mockImplementation(
    (held, projectId) => {
      expect(probe.live).toBe(0);
      return convertHistory(held, projectId);
    },
  );
  const serialize = spyOn(domain, 'serializeSavedConnectedScheduleBody').mockImplementation(
    (body) => {
      expect(probe.live).toBe(0);
      return JSON.stringify(body);
    },
  );
  try {
    const compared = await mounted.call(
      'ada',
      'GET',
      `/api/projects/${beta}/saved-plans/compare?left=current&right=current`,
    );
    expect(compared.status).toBe(200);
    expect(probe.opened - before).toBe(1);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(convert).toHaveBeenCalledTimes(1);
    expect(probe.announcements).toBe(0);
  } finally {
    serialize.mockRestore();
    convert.mockRestore();
  }
});

// Proof: bypassing the writer's scoped admission returned 201 after viewer demotion (slice-d-fault-writer-authority.log).
test('connected save reauthorizes target after capture before writing either body', async () => {
  const { mounted, beta, probe } = await openFixture();
  probe.armed = true;
  probe.afterClose = () => {
    mounted.sqlite.run("UPDATE organization_membership SET role='viewer' WHERE user_id=?", [
      mounted.userId('ada'),
    ]);
  };
  const saved = await mounted.call('ada', 'POST', `/api/projects/${beta}/saved-plans`, {
    name: 'Revoked',
  });
  expect(saved.status).toBe(403);
  expect(mounted.sqlite.query('SELECT * FROM saved_plan').all()).toEqual([]);
  expect(mounted.sqlite.query('SELECT * FROM saved_plan_body').all()).toEqual([]);
  expect(probe.announcements).toBe(0);
});

// Proof: omitting the writer transaction left a committed header/input after the injected schedule failure (slice-d-fault-write-transaction.log).
test('connected save rolls back header and input when schedule insert fails', async () => {
  const { mounted, beta, probe } = await openFixture();
  mounted.sqlite.run(
    "CREATE TRIGGER fail_saved_schedule BEFORE INSERT ON saved_plan_body WHEN NEW.kind='schedule' BEGIN SELECT RAISE(ABORT,'injected schedule failure'); END",
  );
  const saved = await mounted.call('ada', 'POST', `/api/projects/${beta}/saved-plans`, {
    name: 'Failed',
  });
  expect(saved.status).toBe(500);
  expect(mounted.sqlite.query('SELECT * FROM saved_plan').all()).toEqual([]);
  expect(mounted.sqlite.query('SELECT * FROM saved_plan_body').all()).toEqual([]);
  expect(probe.announcements).toBe(0);
});

// Proof: injecting live scheduler mode wrote optimization_generation despite capture intent (slice-d-fault-solver-admission.log).
// Proof: task-5-postclose/cache.patch repeated the real captured optimization question during
// history conversion; captured-scheduler expiry threw and this mounted save returned 500.
test('enabled connected capture never enters solver admission or changes durable optimization state', async () => {
  const { mounted, beta, probe } = await openFixture();
  mounted.sqlite.run("UPDATE project SET optimization_enabled=1,schedule_engine='optimized'");
  const admission = spyOn(mounted.publicOptimizer(), 'admitCaptured').mockImplementation(() => {
    throw new Error('forbidden solver admission');
  });
  try {
    const saved = await mounted.call('ada', 'POST', `/api/projects/${beta}/saved-plans`, {
      name: 'Read only',
    });
    expect(saved.status).toBe(201);
    expect(mounted.sqlite.query('SELECT * FROM optimization_generation').all()).toEqual([]);
    expect(mounted.sqlite.query('SELECT * FROM optimized_schedule_cache').all()).toEqual([]);
    expect(admission).not.toHaveBeenCalled();
    expect(mounted.sqlite.query('SELECT schedule_absent_reason FROM saved_plan').get()).toEqual({
      schedule_absent_reason: null,
    });
    expect(
      mounted.sqlite.query("SELECT kind FROM saved_plan_body WHERE kind='schedule'").all(),
    ).toEqual([{ kind: 'schedule' }]);
    expect(probe.announcements).toBe(1);
  } finally {
    admission.mockRestore();
  }
});

function captureDurableState(mounted: OrganizationHarness) {
  const tables = mounted.sqlite
    .query<{ name: string }, []>("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name")
    .all();
  return tables.map(({ name }) => ({
    name,
    rows: mounted.sqlite.query(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all(),
  }));
}

// Proof: status fallback and fact-guard removal each changed these mounted refusals
// to unsafe 201 in both modes; unreadable foreign metadata throws on the real captured lookup.
for (const mode of ['isolated', 'shared'] as const) {
  test.each(['absent', 'unreadable', 'contradictory'] as const)(
    `mounted ${mode} connected save refuses %s foreign capture evidence atomically`,
    async (fault) => {
      const { mounted, alpha, beta, probe, readConnections } = await openFixture(mode);
      const before = captureDurableState(mounted);
      const announcements = probe.announcements;
      const pushes = probe.pushes;
      const opened = probe.opened;
      let foreignReads = 0;
      // The spy forwards the exact repository receiver through call below.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const findProject = ProjectRepository.prototype.findInOrganization;
      const read = spyOn(ProjectRepository.prototype, 'findInOrganization').mockImplementation(
        async function (this: ProjectRepository, projectId, organizationId) {
          if (projectId === alpha && probe.live > 0) {
            expect(readConnections.has(Reflect.get(this, 'db'))).toBe(true);
            foreignReads += 1;
          }
          return findProject.call(this, projectId, organizationId);
        },
      );
      let injected = 0;
      let refusal: unknown;
      const convertHistory = connectedHistory.captureConnectedHistory;
      const convert = spyOn(connectedHistory, 'captureConnectedHistory').mockImplementation(
        (captured, projectId) => {
          expect(probe.live).toBe(0);
          expect(captured.projection.capture.mode).toBe(mode);
          expect(captured.projection.capture.projects.map((member) => member.projectId)).toContain(
            alpha,
          );
          expect(foreignReads).toBeGreaterThan(0);
          const foreign = captured.metadataByProject.get(alpha);
          if (foreign === undefined) throw new Error('fixture requires real foreign metadata');
          injected += 1;
          try {
            if (fault === 'absent') {
              // Delete required readiness from the real detached observation, never a fabricated service read.
              Map.prototype.delete.call(captured.readiness.statuses, 'a');
              return convertHistory(captured, projectId);
            }
            if (fault === 'unreadable') {
              const metadata = new Map(captured.metadataByProject);
              const get = metadata.get.bind(metadata);
              metadata.get = (id) => {
                if (id === alpha) throw new Error('injected unreadable foreign capture');
                return get(id);
              };
              return convertHistory({ ...captured, metadataByProject: metadata }, projectId);
            }
            const metadata = new Map(captured.metadataByProject);
            metadata.set(alpha, {
              ...foreign,
              project: { ...foreign.project, name: 'Contradictory Alpha' },
            });
            return convertHistory({ ...captured, metadataByProject: metadata }, projectId);
          } catch (cause) {
            refusal = cause;
            throw cause;
          }
        },
      );
      try {
        const saved = await mounted.call('ada', 'POST', `/api/projects/${beta}/saved-plans`, {
          name: `Refuse ${fault}`,
        });
        expect(saved.status).toBe(500);
        expect(injected).toBe(1);
        expect(refusal).toBeInstanceOf(Error);
        expect(String(refusal)).toContain(
          fault === 'absent'
            ? 'missing connected history status'
            : fault === 'unreadable'
              ? 'injected unreadable foreign capture'
              : 'metadata_facts',
        );
        expect(probe.opened - opened).toBe(1);
        expect(probe.live).toBe(0);
        expect(captureDurableState(mounted)).toEqual(before);
        expect(probe.announcements).toBe(announcements);
        expect(probe.pushes).toBe(pushes);
      } finally {
        convert.mockRestore();
        read.mockRestore();
      }
      const saved = await mounted.call('ada', 'POST', `/api/projects/${beta}/saved-plans`, {
        name: 'Restored healthy capture',
      });
      expect(saved.status).toBe(201);
      expect(probe.live).toBe(0);
      expect(probe.announcements).toBe(announcements + 1);
      expect(mounted.sqlite.query('SELECT * FROM saved_plan').all()).toHaveLength(1);
      expect(mounted.sqlite.query('SELECT * FROM saved_plan_body').all()).toHaveLength(2);
    },
  );
}

// Proof: persisted-row fallback admits unsafe 201; omitting owned rollback records zero
// rollbacks in both modes (mounted-save-refusal/{absent-abbreviation,owned-rollback}.log).
for (const mode of ['isolated', 'shared'] as const) {
  test.each(['absent abbreviation', 'unreadable rows'] as const)(
    `mounted ${mode} connected save refuses %s inside owned capture`,
    async (fault) => {
      const { mounted, alpha, beta, probe, readConnections } = await openFixture(mode);
      const abbreviation = mounted.sqlite
        .query<{ namespace: string; abbreviation: string }, [string]>(
          'SELECT namespace,abbreviation FROM project_abbreviation WHERE project_id=?',
        )
        .get(alpha);
      if (abbreviation === null) throw new Error('foreign abbreviation fixture required');
      if (fault === 'absent abbreviation') {
        mounted.sqlite.run('DELETE FROM project_abbreviation WHERE project_id=?', [alpha]);
      }
      const before = captureDurableState(mounted);
      const pushes = probe.pushes;
      const opened = probe.opened;
      const closed = probe.closed;
      let reached = 0;
      let rollbacks = 0;
      let sourceRefusal: unknown;
      const beginRead = sqliteDb.drizzleReadTransaction;
      const transaction = spyOn(sqliteDb, 'drizzleReadTransaction').mockImplementation((db) => {
        expect(readConnections.has(db)).toBe(true);
        const owned = beginRead(db);
        return {
          begin: () => {
            owned.begin();
          },
          commit: () => {
            owned.commit();
          },
          rollback: () => {
            rollbacks += 1;
            owned.rollback();
          },
        };
      });
      // Receiver is forwarded explicitly; only the foreign owned-capture read is poisoned.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const listRows = WorkItemRepository.prototype.listByProject;
      const rows = spyOn(WorkItemRepository.prototype, 'listByProject').mockImplementation(
        async function (this: WorkItemRepository, projectId) {
          if (fault === 'unreadable rows' && projectId === alpha) {
            expect(probe.live).toBe(1);
            expect(readConnections.has(Reflect.get(this, 'db'))).toBe(true);
            reached += 1;
            sourceRefusal = new Error('injected owned foreign row read failure');
            throw sourceRefusal;
          }
          return listRows.call(this, projectId);
        },
      );
      // Proves the missing persisted row was actually read by the captured repository.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const findProject = ProjectRepository.prototype.findInOrganization;
      const project = spyOn(ProjectRepository.prototype, 'findInOrganization').mockImplementation(
        async function (this: ProjectRepository, projectId, organizationId) {
          if (fault === 'absent abbreviation' && projectId === alpha) {
            expect(probe.live).toBe(1);
            expect(readConnections.has(Reflect.get(this, 'db'))).toBe(true);
            reached += 1;
          }
          try {
            return await findProject.call(this, projectId, organizationId);
          } catch (cause) {
            sourceRefusal = cause;
            throw cause;
          }
        },
      );
      try {
        const saved = await mounted.call('ada', 'POST', `/api/projects/${beta}/saved-plans`, {
          name: 'Refused owned capture',
        });
        expect(saved.status).toBe(500);
        expect(reached).toBe(1);
        expect(sourceRefusal).toBeInstanceOf(Error);
        expect(String(sourceRefusal)).toContain(
          fault === 'absent abbreviation'
            ? `project ${alpha} abbreviation is missing`
            : 'injected owned foreign row read failure',
        );
        expect(probe.opened - opened).toBe(1);
        expect(probe.closed - closed).toBe(1);
        expect(rollbacks).toBe(1);
        expect(probe.live).toBe(0);
        expect(captureDurableState(mounted)).toEqual(before);
        expect(probe.pushes).toBe(pushes);
      } finally {
        project.mockRestore();
        rows.mockRestore();
        transaction.mockRestore();
        if (fault === 'absent abbreviation') {
          mounted.sqlite.run(
            'INSERT INTO project_abbreviation(project_id,namespace,abbreviation) VALUES(?,?,?)',
            [alpha, abbreviation.namespace, abbreviation.abbreviation],
          );
        }
      }
      const saved = await mounted.call('ada', 'POST', `/api/projects/${beta}/saved-plans`, {
        name: 'Restored owned capture',
      });
      expect(saved.status).toBe(201);
      expect(probe.announcements).toBe(1);
      expect(probe.pushes).toBe(pushes + 1);
    },
  );
}
