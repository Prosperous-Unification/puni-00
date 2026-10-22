import * as connectedHistory from '@wbs/core/module/saved-plans/connected-history';
import * as domain from '@wbs/domain';
import { planDiffIsEmpty } from '@wbs/domain';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { runMigrations } from '../repository/migrate';
import { OrganizationHarness } from '../testing/organization-harness';

let harness: OrganizationHarness | undefined;
afterEach(async () => {
  await harness?.closeComposed();
});

async function openFixture() {
  const probe = { opened: 0, live: 0, armed: false, afterClose: () => undefined, announcements: 0 };
  const mounted = OrganizationHarness.openComposedWith({
    withOptimizer: true,
    openReadOnlyConnection: (path) => {
      const connection = openReadOnlyConnection(path);
      probe.opened += 1;
      probe.live += 1;
      return {
        db: connection.db,
        close: () => {
          connection.close();
          probe.live -= 1;
          if (probe.armed) probe.afterClose();
        },
      };
    },
    pushFetch: (_url, init) => {
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
  return { mounted, alpha, beta, probe };
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
      schedule_absent_reason: 'unavailable',
    });
    expect(probe.announcements).toBe(1);
  } finally {
    admission.mockRestore();
  }
});
