import { clockOf, type Scope, type UnitOfWork } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import type { CommandAdmission } from '@wbs/core/module/plan-commands/admitted-scope.resource';
import { commandTransaction } from '@wbs/core/module/plan-commands/composition';
import type { DependencyContext } from '@wbs/core/ports/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { CLAIM_LEASE_MS } from '@wbs/domain';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, it, spyOn } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { type ComposedHarnessOptions, OrganizationHarness } from '../testing/organization-harness';

const T = 1_900_000_000_000;
const opened: OrganizationHarness[] = [];
afterEach(async () => {
  for (const harness of opened.splice(0)) await harness.closeComposed();
});

async function fixture(options: ComposedHarnessOptions = {}) {
  let now = T;
  const harness = OrganizationHarness.openComposedWith({ ...options, now: () => now });
  opened.push(harness);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'super_admin');
  harness.bind('ada', 'org-a');
  harness.activate();
  addAgentPerson(harness.sqlite, 'codex', 'org-a', harness.userId('ada'));
  const credential = await issueApiKey(harness.sqlite, {
    organizationId: 'org-a',
    personId: 'codex',
    issuedBy: harness.userId('ada'),
  });
  const projects: { projectId: string; stepId: string; workItemId: string }[] = [];
  for (const [index, name] of ['A', 'B', 'C', 'Unconnected'].entries()) {
    const answer = await harness.call('ada', 'POST', '/api/projects', { name });
    if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
    const plan = answer.body as { project: { id: string }; steps: { id: string }[] };
    const step = plan.steps.at(0);
    if (step === undefined) throw new Error('project omitted its first workflow step');
    const project = {
      projectId: plan.project.id,
      stepId: step.id,
      workItemId: `lease-row-${String(index)}`,
    };
    projects.push(project);
    harness.sqlite.run("UPDATE project SET start_date = '2026-10-05' WHERE id = ?", [
      project.projectId,
    ]);
    harness.sqlite.run(
      'INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)',
      [project.workItemId, project.projectId, name],
    );
    harness.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
      [project.workItemId, step.id],
    );
    if (index < 3)
      harness.sqlite.run(
        'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
        [project.workItemId, step.id, 'codex'],
      );
  }
  harness.sqlite.run(
    "INSERT INTO resource (id, name, kind, unit_label) VALUES ('lease-slot', 'slot', 'exclusive', '')",
  );
  harness.sqlite.run(
    "INSERT INTO resource_organization (resource_id, organization_id, name) VALUES ('lease-slot', 'org-a', 'slot')",
  );
  const owner = projects[0];
  const claim = await harness.callWith(
    credential.key,
    'POST',
    `/api/projects/${owner.projectId}/commands`,
    {
      commands: [
        {
          kind: 'claimWorkItem',
          workItemId: owner.workItemId,
          steps: [owner.stepId],
          personId: 'codex',
          resources: [{ resourceId: 'lease-slot', units: 1 }],
        },
      ],
    },
  );
  if (claim.status !== 200) throw new Error(`claim refused: ${JSON.stringify(claim)}`);
  // Synthetic stored authority exercises historical connected reads; mounted authoring stays inactive.
  seedDependencyAuthority(harness.databasePath());
  await harness.publicWrites().uow.run(async (scope) => {
    for (let index = 1; index < 3; index++) {
      const predecessor = projects[index - 1];
      const successor = projects[index];
      await scope.stores.typedDependencies.add(
        {
          id: `lease-edge-${String(index)}`,
          projectId: successor.projectId,
          predecessor: {
            projectId: predecessor.projectId,
            workItemId: predecessor.workItemId,
            scope: 'whole',
          },
          successor: {
            projectId: successor.projectId,
            workItemId: successor.workItemId,
            scope: 'whole',
          },
          type: 'FS',
        },
        { at: T, by: harness.userId('ada') },
      );
    }
    return { commit: true, value: undefined };
  });
  harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  return {
    harness,
    projects,
    owner,
    expire: () => {
      now = T + CLAIM_LEASE_MS + 1;
    },
  };
}

function snapshot(harness: OrganizationHarness) {
  return [
    'claim',
    'claim_occupancy',
    'command_journal',
    'plan_event',
    'event_log',
    'event_sequencer',
  ].map((table) => harness.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
}

async function refusal(pending: Promise<unknown>): Promise<Error> {
  try {
    await pending;
  } catch (cause) {
    if (cause instanceof Error) return cause;
    throw cause;
  }
  throw new Error('expected lifecycle operation to reject');
}

function recipients(harness: OrganizationHarness) {
  return harness.sqlite
    .query<{ message: string }, []>(
      "SELECT message FROM event_log WHERE message LIKE '%elsewhere_changed%' ORDER BY subscription, seq",
    )
    .all()
    .map(({ message }) => JSON.parse(message) as { projectId: string; causeProjectId: string });
}

it('expires revoked claimant claims without human admission and records exactly connected recipients, then stays silent', async () => {
  const { harness, projects, owner, expire } = await fixture({ withOptimizer: true });
  const invalidated: string[] = [];
  const optimizer = spyOn(harness.publicOptimizer(), 'inputChanged').mockImplementation(
    (projectId) => {
      invalidated.push(projectId);
    },
  );
  const access = spyOn(harness.publicWrites().commandAccess, 'resolve').mockImplementation(() => {
    throw new Error('human admission reached by coordinator');
  });
  harness.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [
    harness.userId('ada'),
  ]);
  expire();
  expect(await harness.publicCommands().releaseExpiredLeases(owner.projectId)).toBe(1);
  expect(harness.sqlite.query('SELECT * FROM claim').all()).toEqual([]);
  expect(harness.sqlite.query('SELECT * FROM claim_occupancy').all()).toEqual([]);
  const expected = projects
    .slice(1, 3)
    .map(({ projectId }) => ({
      type: 'elsewhere_changed',
      projectId,
      causeProjectId: owner.projectId,
    }))
    .sort((left, right) => left.projectId.localeCompare(right.projectId));
  expect(recipients(harness)).toEqual(expected);
  expect([...new Set(invalidated)].sort()).toEqual(
    projects
      .slice(0, 3)
      .map(({ projectId }) => projectId)
      .sort(),
  );
  const after = snapshot(harness);
  invalidated.length = 0;
  expect(await harness.publicCommands().releaseExpiredLeases(owner.projectId)).toBe(0);
  expect(snapshot(harness)).toEqual(after);
  expect(invalidated).toEqual([]);
  optimizer.mockRestore();
  access.mockRestore();
});

it('rolls back claims, occupancy, history and every recipient when a later recipient insert fails', async () => {
  const { harness, owner, expire } = await fixture();
  expire();
  const before = snapshot(harness);
  harness.sqlite.run(
    "CREATE TRIGGER fail_lease_recipient BEFORE INSERT ON event_log WHEN NEW.message LIKE '%elsewhere_changed%' AND (SELECT count(*) FROM event_log WHERE message LIKE '%elsewhere_changed%') = 1 BEGIN SELECT RAISE(ABORT, 'lease recipient insert failed'); END",
  );
  expect(
    await refusal(harness.publicCommands().releaseExpiredLeases(owner.projectId)),
  ).toMatchObject({ cause: { message: 'lease recipient insert failed' } });
  expect(snapshot(harness)).toEqual(before);
});

it('leaves an absent project event-free', async () => {
  const { harness } = await fixture();
  const before = snapshot(harness);
  expect(await harness.publicCommands().releaseExpiredLeases('missing-project')).toBe(0);
  expect(snapshot(harness)).toEqual(before);
});

it('releases its SQLite writer before waiting for a recipient push', async () => {
  let hold = false;
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const { harness, owner, expire } = await fixture({
    pushFetch: async () => {
      if (hold) {
        hold = false;
        entered();
        await held;
      }
      return Response.json({ delivered_to_sockets: 0 });
    },
  });
  expire();
  hold = true;
  const pending = harness.publicCommands().releaseExpiredLeases(owner.projectId);
  await reached;
  try {
    harness.sqlite.run('UPDATE project SET name = ? WHERE id = ?', [
      'independent writer',
      owner.projectId,
    ]);
  } finally {
    release();
  }
  expect(await pending).toBe(1);
});

for (const fault of ['capture', 'owner', 'delivery'] as const) {
  it(`refuses missing lifecycle ${fault} before writing`, async () => {
    const { harness, owner, expire } = await fixture();
    expire();
    const uow: UnitOfWork = {
      run: (act) =>
        harness.publicWrites().uow.run((scope) => {
          if (fault === 'capture') return act({ stores: scope.stores });
          if (fault === 'owner') {
            if (scope.fanoutCapture === undefined) throw new Error('fixture capture absent');
            return act({
              ...scope,
              fanoutCapture: { ...scope.fanoutCapture, resolveLifecycleOwner: undefined },
            });
          }
          return act(scope);
        }),
    };
    const transaction = commandTransaction(
      uow,
      () => {
        throw new Error('write graph reached');
      },
      harness.publicWrites().commandAccess,
    );
    const before = snapshot(harness);
    expect(
      (
        await refusal(
          transaction.run(async (scope) => ({
            commit: true,
            value: await scope.releaseExpiredLeases(owner.projectId, recordingBroadcaster()),
          })),
        )
      ).message,
    ).toContain(
      fault === 'delivery'
        ? 'committed fan-out delivery is missing'
        : 'claim lease lifecycle ownership is missing',
    );
    expect(snapshot(harness)).toEqual(before);
  });
}

it('closes retained lifecycle operations, Working plan reads and dependency capabilities', async () => {
  const { harness, owner, expire } = await fixture();
  expire();
  let retained: CommandAdmission | undefined;
  let borrowed: Scope | undefined;
  let dependencies: DependencyContext | undefined;
  let endpointRefusal: Promise<Error> | undefined;
  const transaction = commandTransaction(
    harness.publicWrites().uow,
    (scope, broadcast, admission, context) => {
      borrowed = scope;
      dependencies = context;
      endpointRefusal = refusal(
        Promise.resolve().then(() =>
          context.endpoints.readEndpoint({
            projectId: owner.projectId,
            workItemId: owner.workItemId,
            scope: 'whole',
          }),
        ),
      );
      return servicesOver(scope.stores, {
        clock: clockOf({ now: () => T + CLAIM_LEASE_MS + 1, newId: () => crypto.randomUUID() }),
        broadcast,
        admission,
        scheduler: fastScheduler,
        schedulerMode: 'capture',
        dependencyContext: { kind: 'bound', context },
      });
    },
    harness.publicWrites().commandAccess,
    harness.publicWrites().committedFanout,
  );
  expect(
    await transaction.run(async (scope) => {
      retained = scope;
      return {
        commit: true,
        value: await scope.releaseExpiredLeases(owner.projectId, recordingBroadcaster()),
      };
    }),
  ).toBe(1);
  if (
    retained === undefined ||
    borrowed === undefined ||
    dependencies === undefined ||
    endpointRefusal === undefined
  )
    throw new Error('lifecycle fixture did not retain its capabilities');
  expect((await endpointRefusal).message).toBe(
    'directory dependency context cannot access a project',
  );
  expect(
    (await refusal(retained.releaseExpiredLeases(owner.projectId, recordingBroadcaster()))).message,
  ).toContain('observation is closed');
  expect(
    (await refusal(borrowed.stores.workItems.listByProject(owner.projectId))).message,
  ).toContain('closed');
  expect(() => dependencies?.assertUsable(owner.projectId, 'claim-lease-sweep')).toThrow('closed');
});
