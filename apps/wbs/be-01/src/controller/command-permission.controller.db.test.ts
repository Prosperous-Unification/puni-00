import type { CredentialAuthentication } from '@wbs/contracts';
import {
  commandDefinitions,
  type PlanCommandKind,
  type PlanCommandWire,
  type PlanDocumentImport,
} from '@wbs/contracts';
import type { WritingServices } from '@wbs/core';
import type { ResourceAccess, UnitOfWork } from '@wbs/core';
import { runRecoveryWrite } from '@wbs/core/http/recovery-write';
import { COMMAND_PERMISSIONS } from '@wbs/core/module/plan-commands/command-permissions';
import { createAdmittedWrites } from '@wbs/core/module/plan-commands/composition';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { grantAdmission } from '@wbs/core/ports/edit-admission';
import { CapacityModeResource } from '@wbs/core/service/capacity-mode.resource';
import { normalizeCommand } from '@wbs/core/service/command-normalizers';
import * as dependencyContexts from '@wbs/core/service/dependency-context';
import { createDependencyContext } from '@wbs/core/service/dependency-context';
import { ProjectRankResource } from '@wbs/core/service/project-rank.resource';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { AccessDecisionRepository } from '@wbs/store-sqlite/access-decisions';
import { openConnection } from '@wbs/store-sqlite/db';
import { DirectoryRepository } from '@wbs/store-sqlite/directory';
import { SqliteOrganizationAccess } from '@wbs/store-sqlite/organization-access';
import { ProjectRepository } from '@wbs/store-sqlite/project';
import { SavedPlanRepository } from '@wbs/store-sqlite/saved-plan';
import { SpaceRepository } from '@wbs/store-sqlite/space';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import type { HarnessMachineGrants } from '../testing/organization-harness';
import { OrganizationHarness } from '../testing/organization-harness';

let h: OrganizationHarness;
let machineGrants: HarnessMachineGrants;
beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});

function grant(
  username: string,
  role: string,
  scopeKind = 'organization',
  scopeId = 'org-a',
): void {
  h.sqlite.run(
    "INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at) VALUES (?, 'org-a', ?, ?, 'user', ?, ?, 'route', 1)",
    [crypto.randomUUID(), scopeKind, scopeId, h.userId(username), role],
  );
}

beforeEach(async () => {
  h = OrganizationHarness.openComposedWith({
    machineGrants,
    supportedCapacityModes: ['isolated', 'shared'],
  });
  for (const username of ['contributor', 'manager', 'viewer', 'plain']) await h.register(username);
  h.organization('org-a');
  for (const username of ['contributor', 'manager', 'viewer', 'plain']) {
    // Deliberately disagree with grants: persisted membership roles confer no permission.
    h.member('org-a', username, username === 'manager' ? 'viewer' : 'admin');
    h.bind(username, 'org-a');
  }
  grant('contributor', 'project-contributor');
  grant('manager', 'org-admin');
  grant('viewer', 'project-viewer');
  h.sqlite.run(
    "INSERT INTO project (id, name, owner_id, restricted, created_at) VALUES ('wp', 'Package', ?, 0, 1)",
    [h.userId('manager')],
  );
  h.sqlite.run(
    "INSERT INTO project_organization (resource_id, organization_id) VALUES ('wp', 'org-a')",
  );
  h.sqlite.run("INSERT INTO step (id, project_id, name, position) VALUES ('step', 'wp', 'Dev', 1)");
  h.sqlite.run(
    "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('work', 'wp', NULL, 1, 'Work')",
  );
  h.activate();
});

afterEach(() => {
  h.close();
});

const work = { workItemId: 'work' };
const node = { ...work, stepId: 'step' };
const trio = { optimistic: 1, realistic: 2, pessimistic: 3 };
const end = { scope: 'whole', workItemId: 'work' } as const;
const commands = {
  createWorkItem: { kind: 'createWorkItem', name: 'Added' },
  patchWorkItem: { kind: 'patchWorkItem', ...work, patch: { name: 'Changed' } },
  moveWorkItem: { kind: 'moveWorkItem', ...work },
  duplicateWorkItem: { kind: 'duplicateWorkItem', ...work },
  deleteWorkItem: { kind: 'deleteWorkItem', ...work },
  setEstimate: { kind: 'setEstimate', ...node, days: trio },
  clearEstimate: { kind: 'clearEstimate', ...node },
  setActual: { kind: 'setActual', ...node, days: 1 },
  clearActual: { kind: 'clearActual', ...node },
  setProgress: { kind: 'setProgress', ...node, state: 'in_progress' },
  setStepBlocked: { kind: 'setStepBlocked', ...node, isBlocked: true },
  clearProgress: { kind: 'clearProgress', ...node },
  startAttempt: { kind: 'startAttempt', ...node },
  endAttempt: { kind: 'endAttempt', ...node, outcome: 'succeeded' },
  removeAttempt: { kind: 'removeAttempt', ...node, attemptNumber: 1 },
  setStatus: { kind: 'setStatus', ...work, status: 'ready' },
  setMeasure: { kind: 'setMeasure', ...node, metric: 'tokens', value: 1 },
  clearMeasure: { kind: 'clearMeasure', ...node, metric: 'tokens' },
  setMeasureEstimate: { kind: 'setMeasureEstimate', ...node, measure: 'tokens', estimate: trio },
  clearMeasureEstimate: { kind: 'clearMeasureEstimate', ...node, measure: 'tokens' },
  setBudget: { kind: 'setBudget', ...work, measure: 'tokens', cap: 5, policy: 'advisory' },
  clearBudget: { kind: 'clearBudget', ...work, measure: 'tokens' },
  setAssignee: { kind: 'setAssignee', ...node, personId: null },
  assignSubtree: { kind: 'assignSubtree', ...node, personId: null },
  claimWorkItem: { kind: 'claimWorkItem', ...work, personId: 'missing' },
  releaseWorkItem: { kind: 'releaseWorkItem', ...work, personId: 'missing' },
  addDependency: { kind: 'addDependency', ...work, predecessorId: 'missing' },
  removeDependency: { kind: 'removeDependency', ...work, predecessorId: 'missing' },
  addTypedDependency: { kind: 'addTypedDependency', predecessor: end, successor: end, type: 'FS' },
  updateTypedDependency: {
    kind: 'updateTypedDependency',
    dependencyId: 'missing',
    predecessor: end,
    successor: end,
    type: 'FS',
  },
  removeTypedDependency: { kind: 'removeTypedDependency', dependencyId: 'missing' },
  arrangeBySchedule: { kind: 'arrangeBySchedule' },
  freezeProject: { kind: 'freezeProject' },
  unfreezeProject: { kind: 'unfreezeProject' },
  unfreezeWorkItem: { kind: 'unfreezeWorkItem', ...work },
  setCapacity: { kind: 'setCapacity', teamId: 'missing', size: null },
  setResourceCapacity: { kind: 'setResourceCapacity', resourceId: 'missing', units: null },
  setDemand: { kind: 'setDemand', ...work, resourceId: 'missing', units: null },
  setStepAllowance: { kind: 'setStepAllowance', stepId: 'step', allowancePercent: 0 },
  setPriorityBands: {
    kind: 'setPriorityBands',
    bands: [1, 2, 3, 4, 5].map((startsAt) => ({
      startsAt,
      defaultValue: startsAt,
      label: String(startsAt),
    })),
  },
  createTeam: { kind: 'createTeam', name: 'Team' },
  patchTeam: { kind: 'patchTeam', teamId: 'missing', patch: { name: 'Team' } },
  deleteTeam: { kind: 'deleteTeam', teamId: 'missing' },
  createPerson: { kind: 'createPerson', name: 'Person' },
  patchPerson: { kind: 'patchPerson', personId: 'missing', patch: { name: 'Person' } },
  deletePerson: { kind: 'deletePerson', personId: 'missing' },
  createTag: { kind: 'createTag', name: 'Tag' },
  patchTag: { kind: 'patchTag', tagId: 'missing', name: 'Tag' },
  deleteTag: { kind: 'deleteTag', tagId: 'missing' },
  createService: { kind: 'createService', name: 'Service' },
  patchService: { kind: 'patchService', serviceId: 'missing', name: 'Service' },
  deleteService: { kind: 'deleteService', serviceId: 'missing' },
  createWorkItemType: { kind: 'createWorkItemType', name: 'Type' },
  patchWorkItemType: { kind: 'patchWorkItemType', typeId: 'missing', name: 'Type' },
  deleteWorkItemType: { kind: 'deleteWorkItemType', typeId: 'missing' },
  createResource: {
    kind: 'createResource',
    name: 'Resource',
    resourceKind: 'divisible',
    unitLabel: 'slots',
  },
  patchResource: { kind: 'patchResource', resourceId: 'missing', patch: { name: 'Resource' } },
  deleteResource: { kind: 'deleteResource', resourceId: 'missing' },
  setDirectoryCapacity: { kind: 'setDirectoryCapacity', resourceId: 'missing', units: null },
  createMeasure: {
    kind: 'createMeasure',
    key: 'credits',
    name: 'Credits',
    unit: 'credits',
    measureKind: 'count',
    scale: 'integer',
  },
  patchMeasure: { kind: 'patchMeasure', measureId: 'missing', patch: { name: 'Credits' } },
  deleteMeasure: { kind: 'deleteMeasure', measureId: 'missing' },
} satisfies Record<PlanCommandKind, PlanCommandWire>;

const settings: ReadonlySet<PlanCommandKind> = new Set([
  'freezeProject',
  'unfreezeProject',
  'setCapacity',
  'setResourceCapacity',
  'setStepAllowance',
  'setPriorityBands',
]);
const budgets: ReadonlySet<PlanCommandKind> = new Set(['setBudget', 'clearBudget']);

function permission(
  kind: PlanCommandKind,
):
  | 'organization.manage_directory'
  | 'project.manage_budgets'
  | 'package.manage_settings'
  | 'package.write' {
  return commandDefinitions[kind].scope === 'directory'
    ? 'organization.manage_directory'
    : budgets.has(kind)
      ? 'project.manage_budgets'
      : settings.has(kind)
        ? 'package.manage_settings'
        : 'package.write';
}

async function batch(username: string, kind: PlanCommandKind) {
  return h.call(
    username,
    'POST',
    commandDefinitions[kind].scope === 'directory'
      ? '/api/directory/commands'
      : '/api/projects/wp/commands',
    { commands: [commands[kind]] },
  );
}

describe('persisted command permission matrix', () => {
  it('covers exactly the current registry ids and matrix command mappings', async () => {
    const matrix = await Bun.file(
      new URL(
        '../../../../../openspec/changes/wbs-permissions/permission-matrix.md',
        import.meta.url,
      ),
    ).text();
    const tables = matrix.slice(
      matrix.indexOf('## Plan-command kinds'),
      matrix.indexOf('`patchPerson` with'),
    );
    const mappings: [string, string][] = [];
    for (const line of tables.split('\n')) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|');
      const granted = /`([^`]+)`/.exec(cells[1] ?? '')?.[1];
      if (granted === undefined || granted === 'package.claim_for_others') continue;
      for (const match of (cells[2] ?? '').matchAll(/`([^`]+)`/g)) {
        const kind =
          match[1] === 'freezeWorkPackage'
            ? 'freezeProject'
            : match[1] === 'unfreezeWorkPackage'
              ? 'unfreezeProject'
              : match[1];
        mappings.push([kind, granted]);
      }
    }
    expect(Object.fromEntries(mappings)).toEqual(
      Object.fromEntries(Object.entries(COMMAND_PERMISSIONS)),
    );
    expect(Object.keys(commands).sort()).toEqual(Object.keys(commandDefinitions).sort());
    expect(Object.fromEntries(Object.entries(COMMAND_PERMISSIONS))).toEqual(
      Object.fromEntries(
        Object.keys(commands).map((kind) => [kind, permission(kind as PlanCommandKind)]),
      ),
    );
  });
  for (const kind of Object.keys(commands) as PlanCommandKind[]) {
    it(`admits manager grants for ${kind} despite a viewer membership`, async () => {
      expect([200, 404, 409, 422]).toContain((await batch('manager', kind)).status);
    });
    it(`names ${permission(kind)} when a viewer runs ${kind}`, async () => {
      expect(await batch('viewer', kind)).toMatchObject({
        status: 403,
        body: { error: 'forbidden', permission: permission(kind) },
      });
    });
    if (permission(kind) === 'package.write') {
      it('admits contributor package.write grants for ' + kind, async () => {
        expect([200, 404, 409, 422]).toContain((await batch('contributor', kind)).status);
      });
    }
    if (permission(kind) !== 'package.write') {
      it(`refuses a project-contributor ${kind} naming ${permission(kind)}`, async () => {
        expect(await batch('contributor', kind)).toMatchObject({
          status: 403,
          body: { error: 'forbidden', permission: permission(kind) },
        });
      });
    }
  }
  it('answers the same HTTP404 for an invisible and an absent work package', async () => {
    const invoke = (id: string) =>
      h.call('plain', 'POST', `/api/projects/${id}/commands`, {
        commands: [commands.createWorkItem],
      });
    expect(await invoke('wp')).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await invoke('missing')).toEqual(await invoke('wp'));
    expect(h.sqlite.query('SELECT name FROM work_item').all()).toEqual([{ name: 'Work' }]);
  });
  it('uses grants instead of a viewer membership role for an authorized manager', async () => {
    expect(await batch('manager', 'createWorkItem')).toMatchObject({ status: 200 });
  });
});

describe('grant authorization on route writes', () => {
  for (const [label, method, path, body, status] of [
    ['project creation', 'POST', '/api/projects', { name: 'Denied' }, 403],
    ['project settings', 'PATCH', '/api/projects/wp', { name: 'Denied' }, 404],
    ['step creation', 'POST', '/api/projects/wp/steps', { name: 'Denied' }, 404],
    ['step rename', 'PATCH', '/api/projects/wp/steps/step', { name: 'Denied' }, 404],
    ['step removal', 'DELETE', '/api/projects/wp/steps/step?cascade=true', undefined, 404],
    [
      'calendar marker',
      'POST',
      '/api/projects/wp/calendar-markers',
      { markerId: '6b0d9f3e-4c1a-4c77-9a53-1b2f0e6d7c11', date: '2026-11-09', name: 'Denied' },
      404,
    ],
    ['saved plan capture', 'POST', '/api/projects/wp/saved-plans', { name: 'Denied' }, 404],
    ['space creation', 'POST', '/api/spaces', { name: 'Denied' }, 403],
    ['rank move', 'POST', '/api/organization/projects/wp/rank', { afterProjectId: null }, 403],
  ] as const) {
    it(`refuses ${label} without a reaching grant`, async () => {
      expect(await h.call('plain', method, path, body)).toMatchObject({ status });
    });
  }
  it('refuses a project-contributor creating a package (P7)', async () => {
    expect(await h.call('contributor', 'POST', '/api/projects', { name: 'Denied' })).toMatchObject({
      status: 403,
    });
  });
  it('refuses a project-contributor editing package settings (P7)', async () => {
    expect(
      await h.call('contributor', 'PATCH', '/api/projects/wp', { name: 'Denied' }),
    ).toMatchObject({ status: 403 });
  });
  it('refuses a project-contributor creating a space (P7)', async () => {
    expect(await h.call('contributor', 'POST', '/api/spaces', { name: 'Denied' })).toMatchObject({
      status: 403,
    });
  });
});

it('refuses an import without organization.create_project', async () => {
  expect(
    await h.call('contributor', 'POST', '/api/projects/import', planDocumentFixture()),
  ).toMatchObject({ status: 403 });
});

async function machine() {
  addAgentPerson(h.sqlite, 'agent', 'org-a', h.userId('contributor'));
  const credential = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'agent',
    issuedBy: h.userId('manager'),
  });
  h.sqlite.run(
    "INSERT INTO access_grant (id, organization_id, scope_kind, scope_id, subject_kind, subject_id, role_id, origin, created_at) VALUES (?, 'org-a', 'organization', 'org-a', 'machine_credential', ?, 'org-admin', 'route', 1)",
    [crypto.randomUUID(), credential.id],
  );
  return credential;
}

describe('authenticated machine command permissions', () => {
  for (const kind of Object.keys(commands) as PlanCommandKind[]) {
    it('caps its own org-admin grant when running ' + kind, async () => {
      const credential = await machine();
      const answer = await callForwarded(
        h,
        credential.key,
        'POST',
        commandDefinitions[kind].scope === 'directory'
          ? '/api/directory/commands'
          : '/api/projects/wp/commands',
        { commands: [commands[kind]] },
      );
      if (permission(kind) === 'package.write')
        expect([200, 404, 409, 422]).toContain(answer.status);
      else
        expect(answer).toMatchObject({
          status: 403,
          body: { error: 'forbidden', permission: permission(kind) },
        });
    });
  }
});

describe('claim and restricted recovery grants', () => {
  it('refuses claiming for another account without package.claim_for_others', async () => {
    addAgentPerson(h.sqlite, 'other', 'org-a', h.userId('manager'));
    // An ordinary visible person reaches claim authority; another account's agent is concealed by directory policy.
    h.sqlite.run("UPDATE person SET kind = 'person' WHERE id = 'other'");
    const answer = await h.call('contributor', 'POST', '/api/projects/wp/commands', {
      commands: [
        { kind: 'setStatus', workItemId: 'work', status: 'ready' },
        { kind: 'claimWorkItem', workItemId: 'work', personId: 'other' },
      ],
    });
    expect(answer).toMatchObject({
      status: 403,
      body: { error: 'forbidden', permission: 'package.claim_for_others' },
    });
    expect(h.sqlite.query('SELECT * FROM claim').all()).toEqual([]);
  });
  it('admits a granted package manager claiming for another account despite viewer membership', async () => {
    addAgentPerson(h.sqlite, 'other', 'org-a', h.userId('contributor'));
    expect(
      await h.call('manager', 'POST', '/api/projects/wp/commands', {
        commands: [
          { kind: 'setStatus', workItemId: 'work', status: 'ready' },
          { kind: 'claimWorkItem', workItemId: 'work', personId: 'other' },
        ],
      }),
    ).toMatchObject({ status: 200 });
  });
  it('allows recovery only to clear the restricted flag', async () => {
    grant('plain', 'org-super-admin');
    h.sqlite.run("UPDATE project SET restricted = 1 WHERE id = 'wp'");
    expect(
      await h.call('plain', 'PATCH', '/api/projects/wp', { restricted: false, name: 'Denied' }),
    ).toMatchObject({ status: 403 });
    expect(
      await h.call('plain', 'POST', '/api/projects/wp/steps', { name: 'Denied' }),
    ).toMatchObject({ status: 403 });
    expect(await h.call('plain', 'PATCH', '/api/projects/wp', { restricted: false })).toMatchObject(
      { status: 200 },
    );
    expect(h.sqlite.query('SELECT action, detail FROM organization_audit').all()).toEqual([
      { action: 'restricted_project_recovery', detail: '{"fields":["restricted"]}' },
    ]);
  });
});

async function seedCredentials() {
  addAgentPerson(h.sqlite, 'own-agent', 'org-a', h.userId('contributor'));
  addAgentPerson(h.sqlite, 'other-agent', 'org-a', h.userId('manager'));
  const own = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'own-agent',
    issuedBy: h.userId('contributor'),
  });
  const other = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'other-agent',
    issuedBy: h.userId('manager'),
  });
  return { own, other };
}

it('narrows credential administration by manage_directory instead of an admin membership', async () => {
  const credentials = await seedCredentials();
  const answer = await h.call('contributor', 'GET', '/api/organization/machine-credentials');
  expect(answer).toMatchObject({
    status: 200,
    body: { credentials: [{ id: credentials.own.id }] },
  });
  expect(
    (answer.body as { credentials: { id: string }[] }).credentials.map(
      (credential) => credential.id,
    ),
  ).toEqual([credentials.own.id]);
  expect(
    await h.call('contributor', 'POST', '/api/organization/machine-credentials', {
      source: 'api_key',
      name: 'Denied',
      personId: 'other-agent',
    }),
  ).toMatchObject({ status: 403 });
});

it('lets a manage_directory grant administer every agent despite viewer membership', async () => {
  await seedCredentials();
  expect(
    await h.call('manager', 'POST', '/api/organization/machine-credentials', {
      source: 'api_key',
      name: 'Granted',
      personId: 'own-agent',
    }),
  ).toMatchObject({ status: 201 });
});

it('shows only own directory agents without organization.manage_directory', async () => {
  await seedCredentials();
  const answer = await h.call('contributor', 'GET', '/api/people');
  expect(answer).toMatchObject({ status: 200 });
  expect((answer.body as { people: { id: string }[] }).people.map((person) => person.id)).toEqual([
    'own-agent',
  ]);
});

it('does not grant capacity-mode authority from a super-admin membership', async () => {
  h.sqlite.run("UPDATE organization_membership SET role = 'super_admin' WHERE user_id = ?", [
    h.userId('plain'),
  ]);
  expect(await h.call('plain', 'PATCH', '/api/organization', { sharedPeople: true })).toMatchObject(
    { status: 403 },
  );
});

it('grants capacity-mode authority from the authenticated account grant', async () => {
  grant('plain', 'org-super-admin');
  expect(await h.call('plain', 'PATCH', '/api/organization', { sharedPeople: true })).toMatchObject(
    { status: 200, body: { sharedPeople: true } },
  );
});

it('admits a contributor writing current package steps and markers', async () => {
  expect(
    await h.call('contributor', 'POST', '/api/projects/wp/steps', { name: 'Review' }),
  ).toMatchObject({ status: 200 });
  expect(
    await h.call('contributor', 'POST', '/api/projects/wp/calendar-markers', {
      markerId: crypto.randomUUID(),
      date: '2026-11-09',
      name: 'Release',
    }),
  ).toMatchObject({ status: 201 });
});

it('conceals an invisible package in the combined step allowance path', async () => {
  expect(
    await h.call('plain', 'PATCH', '/api/projects/wp/steps/step', {
      name: 'Denied',
      allowancePercent: 10,
    }),
  ).toMatchObject({ status: 404 });
});

it('refuses a contributor retry without package.manage_settings', async () => {
  expect(
    await h.call('contributor', 'POST', '/api/projects/wp/optimization/retry', {
      objective: 'pri',
      inputHash: 'unavailable',
    }),
  ).toMatchObject({ status: 403 });
});

for (const mixed of [false, true]) {
  it(`refuses ${mixed ? 'mixed' : 'budget'} undo after budget authority is revoked without journal or plan effects`, async () => {
    const commands = mixed
      ? [
          { kind: 'createWorkItem', name: 'Retained' },
          { kind: 'setBudget', workItemId: 'work', measure: 'tokens', cap: 5, policy: 'advisory' },
        ]
      : [{ kind: 'setBudget', workItemId: 'work', measure: 'tokens', cap: 5, policy: 'advisory' }];
    expect(
      await h.call('manager', 'POST', '/api/projects/wp/commands', { commands }),
    ).toMatchObject({ status: 200 });
    h.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [h.userId('manager')]);
    grant('manager', 'project-contributor');
    const before = [
      'work_item',
      'work_item_budget',
      'command_journal',
      'event_log',
      'organization_audit',
    ].map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({
      status: 403,
      body: { error: 'forbidden', permission: 'project.manage_budgets' },
    });
    expect(
      ['work_item', 'work_item_budget', 'command_journal', 'event_log', 'organization_audit'].map(
        (table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
  });
}

it('keeps saved-plan author-or-manager authority with equivalent custom permissions', async () => {
  expect(
    await h.call('manager', 'POST', '/api/projects/wp/saved-plans', { name: 'Original' }),
  ).toMatchObject({ status: 201 });
  const plan = h.sqlite.query<{ id: string }, []>('SELECT id FROM saved_plan').get();
  if (plan === null) throw new Error('fixture saved plan is absent');
  expect(
    await h.call('contributor', 'PATCH', `/api/saved-plans/${plan.id}`, { name: 'Denied' }),
  ).toMatchObject({ status: 403 });
  h.sqlite.run(
    "INSERT INTO access_role (id, name, object_kind, level, reaches_restricted, organization_id, created_at) VALUES ('custom-manager', 'Custom manager', 'work_package', NULL, 0, 'org-a', 1)",
  );
  for (const permission of ['package.read', 'package.write', 'package.manage_settings'])
    h.sqlite.run(
      "INSERT INTO access_role_permission (role_id, permission) VALUES ('custom-manager', ?)",
      [permission],
    );
  grant('contributor', 'custom-manager', 'work_package', 'wp');
  expect(
    await h.call('contributor', 'PATCH', `/api/saved-plans/${plan.id}`, { name: 'Managed' }),
  ).toMatchObject({ status: 200 });
});

function expectedMachineAccess(principal: {
  id: string;
  authentication?: CredentialAuthentication;
}): Extract<ResourceAccess, { kind: 'scoped' }> {
  return {
    kind: 'scoped',
    scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin', cap: null },
    principal: structuredClone({ id: principal.id, authentication: principal.authentication }),
  };
}

it('never borrows credential B grants from stale expected access for authenticated credential A', async () => {
  const first = await machine();
  const second = await issueApiKey(h.sqlite, {
    organizationId: 'org-a',
    personId: 'agent',
    issuedBy: h.userId('contributor'),
    name: 'credential-B',
  });
  h.sqlite.run(
    "UPDATE access_grant SET subject_id = ? WHERE subject_kind = 'machine_credential' AND subject_id = ?",
    [second.id, first.id],
  );
  const actor = await h.authenticatedMachinePrincipal(first.key);
  const expected = expectedMachineAccess(actor);
  const stale = {
    ...expected,
    principal: {
      id: actor.id,
      authentication: { kind: 'machine', credentialId: second.id, personId: 'agent' } as const,
    },
  };
  expect(
    await h.publicCommands().runWithin(
      'wp',
      actor,
      [
        {
          kind: 'createWorkItem',
          name: 'Denied',
          parentId: null,
          parentRef: undefined,
          afterId: null,
          afterRef: undefined,
          notes: undefined,
          priority: undefined,
        },
      ],
      stale,
    ),
  ).toMatchObject({ ok: false, refusal: 'not_found' });
});

for (const operation of ['batch', 'project', 'step', 'create', 'import'] as const) {
  it(
    'retains authenticated machine provenance across queued ' + operation + ' admission',
    async () => {
      const credential = await machine();
      grant('contributor', 'org-admin');
      const actor = await h.authenticatedMachinePrincipal(credential.key);
      const expected = expectedMachineAccess(actor);
      let release!: () => void;
      let enter!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const held = h.holdWriteTurn(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
        enter,
      );
      await entered;
      const writes = createAdmittedWrites(h.publicWrites());
      const pending =
        operation === 'batch'
          ? h.publicCommands().runWithin(
              'wp',
              actor,
              [
                {
                  kind: 'createWorkItem',
                  name: 'Denied',
                  parentId: null,
                  parentRef: undefined,
                  afterId: null,
                  afterRef: undefined,
                  notes: undefined,
                  priority: undefined,
                },
              ],
              expected,
            )
          : operation === 'project'
            ? writes.updateProjectWithin('wp', actor, { name: 'Denied' }, expected)
            : operation === 'step'
              ? runRecoveryWrite(
                  h.publicWrites(),
                  expected,
                  'wp',
                  actor,
                  { step: 'add' },
                  (services, access) =>
                    services.steps.addWithin('wp', actor.id, 'Denied', 10, undefined, access),
                  (reason) => ({ ok: false as const, reason }),
                )
              : operation === 'create'
                ? writes.createProjectWithin('Denied', actor, expected)
                : h.publicImports().import(planDocumentFixture(), {
                    kind: 'human',
                    principal: actor,
                    expectedAccess: expected,
                  });
      actor.authentication = undefined;
      h.sqlite.run(
        "DELETE FROM access_grant WHERE subject_kind = 'machine_credential' AND subject_id = ?",
        [credential.id],
      );
      release();
      await held;
      const answer = await pending;
      expect(answer.ok).toBe(false);
      if (operation === 'batch') expect(answer).toMatchObject({ refusal: 'not_found' });
      else if (operation === 'import') expect(answer).toMatchObject({ code: 'forbidden' });
      else
        expect(answer).toMatchObject({
          reason: operation === 'create' ? 'forbidden' : 'not_found',
        });
      expect(h.sqlite.query('SELECT name FROM project ORDER BY id').all()).toEqual([
        { name: 'Package' },
      ]);
      expect(h.sqlite.query('SELECT name FROM step ORDER BY id').all()).toEqual([{ name: 'Dev' }]);
      expect(h.sqlite.query('SELECT name FROM work_item ORDER BY id').all()).toEqual([
        { name: 'Work' },
      ]);
      expect(
        h.sqlite
          .query("SELECT * FROM organization_audit WHERE action NOT IN ('machine_token_issued')")
          .all(),
      ).toEqual([]);
    },
  );
}

for (const capability of ['spaces', 'accessDecisions'] as const) {
  it(
    'fails the real space route closed when the admitted ' + capability + ' capability is absent',
    async () => {
      const boundary = h.publicWrites();
      const run = boundary.uow.run.bind(boundary.uow);
      const withoutCapability: UnitOfWork['run'] = (act) =>
        run((scope) => {
          Reflect.deleteProperty(scope.stores, capability);
          return act(scope);
        });
      const injected = spyOn(boundary.uow, 'run').mockImplementation(withoutCapability);
      const write = spyOn(SpaceRepository.prototype, 'create').mockRejectedValue(
        new Error('public space fallback reached'),
      );
      try {
        expect(await h.call('manager', 'POST', '/api/spaces', { name: 'Denied' })).toMatchObject({
          status: 500,
        });
        expect(h.sqlite.query('SELECT * FROM space').all()).toEqual([]);
        expect(write).not.toHaveBeenCalled();
      } finally {
        injected.mockRestore();
        write.mockRestore();
      }
    },
  );
}

it('throws on a mismatched fresh permission principal instead of mutating', async () => {
  const authority = h.publicWrites().commandAccess;
  const resolve = authority.resolve.bind(authority);
  const injected = spyOn(authority, 'resolve').mockImplementation(async (caller) => {
    const resolved = await resolve(caller);
    return resolved.ok && resolved.access.kind === 'scoped'
      ? { ok: true, access: { ...resolved.access, principal: { id: 'wrong-account' } } }
      : resolved;
  });
  try {
    expect(await batch('manager', 'createWorkItem')).toMatchObject({ status: 500 });
    expect(h.sqlite.query('SELECT name FROM work_item').all()).toEqual([{ name: 'Work' }]);
  } finally {
    injected.mockRestore();
  }
});

for (const direction of ['undo', 'redo'] as const) {
  it(`refuses legacy ${direction} without changing journal bytes, cursor, or plan`, async () => {
    expect(await batch('manager', 'createWorkItem')).toMatchObject({ status: 200 });
    if (direction === 'redo')
      expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({
        status: 200,
      });
    h.sqlite.run("UPDATE command_journal SET payload = json_remove(payload, '$.authorization')");
    const before = ['work_item', 'command_journal', 'event_log', 'organization_audit'].map(
      (table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
    expect(await h.call('manager', 'POST', `/api/projects/wp/${direction}`)).toMatchObject({
      status: 409,
      body: { error: 'replay_provenance_unavailable' },
    });
    expect(
      ['work_item', 'command_journal', 'event_log', 'organization_audit'].map((table) =>
        h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
  });
}

it('throws on present unknown replay provenance instead of treating it as legacy', async () => {
  expect(await batch('manager', 'createWorkItem')).toMatchObject({ status: 200 });
  h.sqlite.run(
    "UPDATE command_journal SET payload = json_set(payload, '$.authorization.version', 999)",
  );
  expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({ status: 500 });
});

it('records only contributing replay permissions when a package freeze is a no-op', async () => {
  expect(await batch('manager', 'freezeProject')).toMatchObject({ status: 200 });
  expect(
    await h.call('manager', 'POST', '/api/projects/wp/commands', {
      commands: [{ kind: 'freezeProject' }, commands.unfreezeWorkItem],
    }),
  ).toMatchObject({ status: 200 });
  h.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [h.userId('manager')]);
  grant('manager', 'project-contributor');
  expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({ status: 200 });
});

it('requires package.write at both old and new ends of compound typed dependency writes', async () => {
  h.close();
  h = OrganizationHarness.openComposedWith({ machineGrants, syntheticExternalCommands: true });
  seedDependencyAuthority(h.databasePath());
  await h.register('contributor');
  h.organization('org-a');
  h.member('org-a', 'contributor', 'admin');
  h.bind('contributor', 'org-a');
  h.activate();
  for (const id of ['wp', 'remote', 'new-remote']) {
    h.sqlite.run(
      'INSERT INTO project (id, name, owner_id, restricted, created_at) VALUES (?, ?, ?, 0, 1)',
      [id, id, h.userId('contributor')],
    );
    h.sqlite.run(
      "INSERT INTO project_organization (resource_id, organization_id) VALUES (?, 'org-a')",
      [id],
    );
    h.sqlite.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 1)', [
      id + '-step',
      id,
      'Dev',
    ]);
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, NULL, 1, ?)',
      [id + '-work', id, id],
    );
    grant(
      'contributor',
      id === 'wp' ? 'package-contributor' : 'package-viewer',
      'work_package',
      id,
    );
  }
  const endpoint = (projectId: string) => ({
    projectId,
    workItemId: projectId + '-work',
    scope: 'whole',
  });
  const add = {
    kind: 'addTypedDependency',
    predecessor: endpoint('remote'),
    successor: endpoint('wp'),
    type: 'FS',
  };
  const invoke = (commands: unknown[]) =>
    h.call('contributor', 'POST', '/api/projects/wp/commands', { commands });
  expect(await invoke([add])).toMatchObject({
    status: 403,
    body: { error: 'forbidden', permission: 'package.write' },
  });
  grant('contributor', 'package-contributor', 'work_package', 'remote');
  const added = await invoke([add]);
  expect(added).toMatchObject({ status: 200 });
  const id = (added.body as { results: { id: string }[] }).results[0].id;
  const update = {
    ...add,
    kind: 'updateTypedDependency',
    dependencyId: id,
    predecessor: endpoint('new-remote'),
  };
  expect(await invoke([update])).toMatchObject({ status: 403 });
  grant('contributor', 'package-contributor', 'work_package', 'new-remote');
  h.sqlite.run(
    "DELETE FROM access_grant WHERE scope_id = 'remote' AND role_id = 'package-contributor'",
  );
  expect(await invoke([update])).toMatchObject({ status: 403 });
  grant('contributor', 'package-contributor', 'work_package', 'remote');
  expect(await invoke([update])).toMatchObject({ status: 200 });
  h.sqlite.run(
    "DELETE FROM access_grant WHERE scope_id = 'new-remote' AND role_id = 'package-contributor'",
  );
  expect(await invoke([{ kind: 'removeTypedDependency', dependencyId: id }])).toMatchObject({
    status: 403,
  });
  grant('contributor', 'package-contributor', 'work_package', 'new-remote');
  expect(await invoke([{ kind: 'removeTypedDependency', dependencyId: id }])).toMatchObject({
    status: 200,
  });
});

it('refuses replay of a claim for another account after claim_for_others is revoked', async () => {
  addAgentPerson(h.sqlite, 'other', 'org-a', h.userId('contributor'));
  expect(
    await h.call('manager', 'POST', '/api/projects/wp/commands', {
      commands: [
        { kind: 'setStatus', workItemId: 'work', status: 'ready' },
        { kind: 'claimWorkItem', workItemId: 'work', personId: 'other' },
      ],
    }),
  ).toMatchObject({ status: 200 });
  h.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [h.userId('manager')]);
  grant('manager', 'project-contributor');
  const before = ['claim', 'command_journal', 'event_log', 'organization_audit'].map((table) =>
    h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  );
  expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({
    status: 403,
    body: { error: 'forbidden', permission: 'package.claim_for_others' },
  });
  expect(
    ['claim', 'command_journal', 'event_log', 'organization_audit'].map((table) =>
      h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
    ),
  ).toEqual(before);
});

for (const operation of ['add', 'add-person', 'rename'] as const) {
  it(
    'refuses queued standalone directory ' +
      operation +
      ' after grant revocation without root, ownership, event, audit or history effects',
    async () => {
      const actorId = h.userId('manager');
      const access = {
        kind: 'scoped' as const,
        principal: { id: actorId },
        scope: { organizationId: 'org-a', userId: actorId, role: 'viewer' as const, cap: null },
      };
      h.sqlite.run("INSERT INTO service_team (id, name) VALUES ('held-team', 'Held')");
      h.sqlite.run(
        "INSERT INTO service_team_organization (resource_id, organization_id, name) VALUES ('held-team', 'org-a', 'Held')",
      );
      h.sqlite.run("INSERT INTO service (id, name) VALUES ('held-service', 'Held')");
      h.sqlite.run(
        "INSERT INTO service_organization (resource_id, organization_id, name) VALUES ('held-service', 'org-a', 'Held')",
      );
      const tables = [
        'service',
        'service_organization',
        'service_team',
        'service_team_organization',
        'person',
        'person_organization',
        'event_log',
        'organization_audit',
        'command_journal',
      ];
      const before = tables.map((table) =>
        h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
      );
      const entered = Promise.withResolvers<undefined>();
      const released = Promise.withResolvers<undefined>();
      const held = h.holdWriteTurn(released.promise, () => {
        entered.resolve(undefined);
      });
      await entered.promise;
      const service = h.publicDirectoryService();
      const pending =
        operation === 'add'
          ? service.addWithin('teams', actorId, 'Denied', access)
          : operation === 'add-person'
            ? service.addPersonWithin(actorId, 'Denied', [], access)
            : service.renameWithin('services', 'held-service', actorId, 'Denied', access);
      h.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [actorId]);
      released.resolve(undefined);
      await held;
      expect(await pending).toMatchObject({
        ok: false,
        reason: 'forbidden',
        permission: 'organization.manage_directory',
      });
      expect(
        tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
      ).toEqual(before);
    },
  );
}

it('keeps an existing-name standalone add behind current directory permission', async () => {
  const actorId = h.userId('contributor');
  const access = {
    kind: 'scoped' as const,
    principal: { id: actorId },
    scope: { organizationId: 'org-a', userId: actorId, role: 'admin' as const, cap: null },
  };
  h.sqlite.run("INSERT INTO service_team (id, name) VALUES ('existing', 'Existing')");
  h.sqlite.run(
    "INSERT INTO service_team_organization (resource_id, organization_id, name) VALUES ('existing', 'org-a', 'Existing')",
  );
  expect(
    await h.publicDirectoryService().addWithin('teams', actorId, 'Existing', access),
  ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'organization.manage_directory' });
});

it('rolls back a standalone opaque root when its ownership mapping fails', async () => {
  const actorId = h.userId('manager');
  const access = {
    kind: 'scoped' as const,
    principal: { id: actorId },
    scope: { organizationId: 'org-a', userId: actorId, role: 'viewer' as const, cap: null },
  };
  h.sqlite.run(
    "CREATE TRIGGER refuse_team_mapping BEFORE INSERT ON service_team_organization BEGIN SELECT RAISE(ABORT, 'mapping refused'); END",
  );
  const tables = [
    'service_team',
    'service_team_organization',
    'event_log',
    'organization_audit',
    'command_journal',
  ];
  const before = tables.map((table) =>
    h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  );
  await rejectsWith(
    h.publicDirectoryService().addWithin('teams', actorId, 'Denied', access),
    'INSERT INTO service_team_organization',
  );
  expect(
    tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
  ).toEqual(before);
});

it('retains the original standalone permission principal across queued caller alias substitution', async () => {
  const actorId = h.userId('contributor');
  const access = {
    kind: 'scoped' as const,
    principal: { id: actorId },
    scope: { organizationId: 'org-a', userId: actorId, role: 'admin' as const, cap: null },
  };
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  const held = h.holdWriteTurn(released.promise, () => {
    entered.resolve(undefined);
  });
  await entered.promise;
  const pending = h.publicDirectoryService().addWithin('teams', actorId, 'Denied', access);
  access.principal.id = h.userId('manager');
  access.scope.userId = h.userId('manager');
  released.resolve(undefined);
  await held;
  expect(await pending).toMatchObject({
    ok: false,
    reason: 'forbidden',
    permission: 'organization.manage_directory',
  });
  expect(h.sqlite.query('SELECT * FROM service_team').all()).toEqual([]);
});

it('evaluates a standalone machine by its own credential grants rather than its owning account grants', async () => {
  const credential = await machine();
  grant('contributor', 'org-admin');
  const actor = await h.authenticatedMachinePrincipal(credential.key);
  expect(
    await h
      .publicDirectoryService()
      .addWithin('teams', actor.id, 'Denied', expectedMachineAccess(actor)),
  ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'organization.manage_directory' });
  expect(h.sqlite.query('SELECT * FROM service_team').all()).toEqual([]);
});

it('resolves budget replay authority at the current interim owner rather than unrelated organization grants', async () => {
  expect(await batch('manager', 'setBudget')).toMatchObject({ status: 200 });
  h.organization('org-b');
  h.member('org-b', 'manager', 'viewer', ['project-contributor']);
  h.grant('org-b', 'manager', 'org-admin');
  h.sqlite.run("DELETE FROM access_grant WHERE organization_id = 'org-a' AND subject_id = ?", [
    h.userId('manager'),
  ]);
  grant('manager', 'project-contributor');
  expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({
    status: 403,
    body: { error: 'forbidden', permission: 'project.manage_budgets' },
  });
  grant('manager', 'org-admin');
  expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({ status: 200 });
});

it('preserves immutable replay requirements through undo redo undo and restamping', async () => {
  expect(await batch('manager', 'createWorkItem')).toMatchObject({ status: 200 });
  expect(await batch('manager', 'setBudget')).toMatchObject({ status: 200 });
  const bytes = h.sqlite.query('SELECT id, payload FROM command_journal ORDER BY rowid').all();
  for (const direction of ['undo', 'redo', 'undo', 'undo']) {
    expect(await h.call('manager', 'POST', '/api/projects/wp/' + direction)).toMatchObject({
      status: 200,
    });
    expect(h.sqlite.query('SELECT id, payload FROM command_journal ORDER BY rowid').all()).toEqual(
      bytes,
    );
  }
});

it('refuses absent replay provenance before stale entry discard', async () => {
  expect(await batch('manager', 'createWorkItem')).toMatchObject({ status: 200 });
  h.sqlite.run("UPDATE command_journal SET payload = json_remove(payload, '$.authorization')");
  h.sqlite.run("UPDATE work_item SET revision = revision + 10 WHERE name = 'New'");
  const before = ['work_item', 'command_journal', 'event_log', 'organization_audit'].map((table) =>
    h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  );
  expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({
    status: 409,
    body: { error: 'replay_provenance_unavailable' },
  });
  expect(
    ['work_item', 'command_journal', 'event_log', 'organization_audit'].map((table) =>
      h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
    ),
  ).toEqual(before);
});

it('throws on a mismatched standalone principal before creating an owned root', async () => {
  const actorId = h.userId('manager');
  await rejectsWith(
    h.publicDirectoryService().addWithin('teams', actorId, 'Denied', {
      kind: 'scoped',
      principal: { id: 'wrong' },
      scope: { organizationId: 'org-a', userId: actorId, role: 'viewer', cap: null },
    }),
    'principal differs',
  );
  expect(h.sqlite.query('SELECT * FROM service_team').all()).toEqual([]);
});

for (const fault of ['missing', 'unreadable'] as const) {
  it(
    'throws when standalone directory grant authority is ' +
      fault +
      ' without a public-port fallback',
    async () => {
      const actorId = h.userId('manager');
      const access = {
        kind: 'scoped' as const,
        principal: { id: actorId },
        scope: { organizationId: 'org-a', userId: actorId, role: 'viewer' as const, cap: null },
      };
      const boundary = h.publicWrites();
      const run = boundary.uow.run.bind(boundary.uow);
      const inject: UnitOfWork['run'] = (act) =>
        run((scope) => {
          Reflect.deleteProperty(scope.stores, 'accessDecisions');
          return act(scope);
        });
      const installed =
        fault === 'missing' ? spyOn(boundary.uow, 'run').mockImplementation(inject) : undefined;
      if (fault === 'unreadable') h.sqlite.run('DROP TABLE access_grant');
      try {
        await rejectsWith(
          h.publicDirectoryService().addWithin('teams', actorId, 'Denied', access),
          fault === 'missing' ? 'no access decisions' : 'access_grant',
        );
        expect(h.sqlite.query('SELECT * FROM service_team').all()).toEqual([]);
      } finally {
        installed?.mockRestore();
      }
    },
  );
}

it('returns only a detached grant principal projection from authenticated machine resolution', async () => {
  const credential = await machine();
  const actor = await h.authenticatedMachinePrincipal(credential.key);
  actor.username = 'sentinel-private-account-name';
  const resolved = await h.publicWrites().commandAccess.resolve({
    kind: 'human',
    principal: actor,
    expectedAccess: expectedMachineAccess(actor),
  });
  if (!resolved.ok || resolved.access.kind !== 'scoped')
    throw new Error('authenticated machine resolution refused');
  expect(Object.keys(resolved.access.principal).sort()).toEqual(['authentication', 'id']);
  expect(resolved.access.principal.authentication).toEqual(actor.authentication);
  expect(resolved.access.principal).not.toBe(actor);
  expect(resolved.access.principal.authentication).not.toBe(actor.authentication);
  expect(JSON.stringify(resolved.access.principal)).not.toContain('sentinel-private-account-name');
  expect(JSON.stringify(resolved.access.principal)).not.toContain(credential.key);
});

for (const [label, method, path, body, permission] of [
  ['package creation', 'POST', '/api/projects', { name: 'Denied' }, 'organization.create_project'],
  ['package settings', 'PATCH', '/api/projects/wp', { name: 'Denied' }, 'package.manage_settings'],
  ['step creation', 'POST', '/api/projects/wp/steps', { name: 'Denied' }, 'package.write'],
  ['step rename', 'PATCH', '/api/projects/wp/steps/step', { name: 'Denied' }, 'package.write'],
  [
    'step removal',
    'DELETE',
    '/api/projects/wp/steps/step?cascade=true',
    undefined,
    'package.write',
  ],
  [
    'calendar marker',
    'POST',
    '/api/projects/wp/calendar-markers',
    { markerId: '6b0d9f3e-4c1a-4c77-9a53-1b2f0e6d7c11', date: '2026-11-09', name: 'Denied' },
    'package.write',
  ],
  [
    'saved plan capture',
    'POST',
    '/api/projects/wp/saved-plans',
    { name: 'Denied' },
    'package.write',
  ],
  [
    'package retry',
    'POST',
    '/api/projects/wp/optimization/retry',
    { objective: 'pri', inputHash: 'old' },
    'package.manage_settings',
  ],
  ['space creation', 'POST', '/api/spaces', { name: 'Denied' }, 'organization.manage_spaces'],
  [
    'rank move',
    'POST',
    '/api/organization/projects/wp/rank',
    { afterProjectId: null },
    'organization.manage_spaces',
  ],
  [
    'capacity mode',
    'PATCH',
    '/api/organization',
    { sharedPeople: true },
    'organization.manage_capacity_mode',
  ],
] as const) {
  it('encodes the missing permission on the direct ' + label + ' route', async () => {
    expect(await h.call('viewer', method, path, body)).toMatchObject({
      status: 403,
      body: { error: 'forbidden', permission },
    });
  });
}

for (const operation of ['duplicate', 'delete', 'first-child-outgoing'] as const) {
  it(
    'requires current remote write for implicit ' +
      operation +
      ' typed dependency mutation atomically',
    async () => {
      h.close();
      h = OrganizationHarness.openComposedWith({ machineGrants, syntheticExternalCommands: true });
      seedDependencyAuthority(h.databasePath());
      await h.register('contributor');
      h.organization('org-a');
      h.member('org-a', 'contributor', 'admin');
      h.bind('contributor', 'org-a');
      h.activate();
      for (const id of ['wp', 'remote', 'new-remote']) {
        h.sqlite.run(
          'INSERT INTO project (id, name, owner_id, restricted, created_at) VALUES (?, ?, ?, 0, 1)',
          [id, id, h.userId('contributor')],
        );
        h.sqlite.run(
          "INSERT INTO project_organization (resource_id, organization_id) VALUES (?, 'org-a')",
          [id],
        );
        h.sqlite.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 1)', [
          id + '-step',
          id,
          'Dev',
        ]);
        h.sqlite.run(
          'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, NULL, 1, ?)',
          [id + '-work', id, id],
        );
        grant(
          'contributor',
          id === 'wp' ? 'package-contributor' : 'package-viewer',
          'work_package',
          id,
        );
      }

      for (const id of ['remote', 'new-remote'])
        grant('contributor', 'package-contributor', 'work_package', id);
      const node = (projectId: string) => ({
        projectId,
        workItemId: projectId + '-work',
        scope: 'node',
        stepId: projectId + '-step',
      });
      const outgoing = operation === 'first-child-outgoing';
      expect(
        await h.call(
          'contributor',
          'POST',
          '/api/projects/' + (outgoing ? 'remote' : 'wp') + '/commands',
          {
            commands: [
              {
                kind: 'addTypedDependency',
                predecessor: node(outgoing ? 'wp' : 'remote'),
                successor: node(outgoing ? 'remote' : 'wp'),
                type: 'FS',
              },
            ],
          },
        ),
      ).toMatchObject({ status: 200 });
      h.sqlite.run(
        "DELETE FROM access_grant WHERE scope_id = 'remote' AND role_id = 'package-contributor'",
      );
      const tables = [
        'work_item',
        'external_dependency',
        'typed_dependency',
        'command_journal',
        'event_log',
        'organization_audit',
      ];
      const before = tables.map((table) =>
        h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
      );
      const command =
        operation === 'duplicate'
          ? { kind: 'duplicateWorkItem', workItemId: 'wp-work' }
          : operation === 'delete'
            ? { kind: 'deleteWorkItem', workItemId: 'wp-work', strategy: 'cascade' }
            : { kind: 'createWorkItem', parentId: 'wp-work', name: 'Denied child' };
      expect(
        await h.call('contributor', 'POST', '/api/projects/wp/commands', { commands: [command] }),
      ).toMatchObject({ status: 403, body: { error: 'forbidden', permission: 'package.write' } });
      expect(
        tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
      ).toEqual(before);
    },
  );
}

it('refuses clear-budget undo after its original budget permission is revoked', async () => {
  expect(await batch('manager', 'setBudget')).toMatchObject({ status: 200 });
  expect(await batch('manager', 'clearBudget')).toMatchObject({ status: 200 });
  h.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [h.userId('manager')]);
  grant('manager', 'project-contributor');
  const tables = ['work_item_budget', 'command_journal', 'event_log', 'organization_audit'];
  const before = tables.map((table) =>
    h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  );
  expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({
    status: 403,
    body: { error: 'forbidden', permission: 'project.manage_budgets' },
  });
  expect(
    tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
  ).toEqual(before);
});

for (const method of ['PATCH', 'DELETE'] as const) {
  it(
    'encodes the manager permission when another author saved-plan ' + method + ' is refused',
    async () => {
      const saved = await h.call('manager', 'POST', '/api/projects/wp/saved-plans', {
        name: 'Held',
      });
      const id = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
      expect(
        await h.call(
          'contributor',
          method,
          '/api/saved-plans/' + id,
          method === 'PATCH' ? { name: 'Denied' } : undefined,
        ),
      ).toMatchObject({
        status: 403,
        body: { error: 'forbidden', permission: 'package.manage_settings' },
      });
    },
  );
}

it('refuses replay of a release for another account after claim_for_others is revoked', async () => {
  addAgentPerson(h.sqlite, 'other', 'org-a', h.userId('contributor'));
  expect(
    await h.call('manager', 'POST', '/api/projects/wp/commands', {
      commands: [
        { kind: 'setStatus', workItemId: 'work', status: 'ready' },
        { kind: 'claimWorkItem', workItemId: 'work', personId: 'other' },
      ],
    }),
  ).toMatchObject({ status: 200 });
  expect(
    await h.call('manager', 'POST', '/api/projects/wp/commands', {
      commands: [{ kind: 'releaseWorkItem', workItemId: 'work', personId: 'other' }],
    }),
  ).toMatchObject({ status: 200 });
  h.sqlite.run('DELETE FROM access_grant WHERE subject_id = ?', [h.userId('manager')]);
  grant('manager', 'project-contributor');
  const tables = ['claim', 'command_journal', 'event_log', 'organization_audit'];
  const before = tables.map((table) =>
    h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  );
  expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({
    status: 403,
    body: { error: 'forbidden', permission: 'package.claim_for_others' },
  });
  expect(
    tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
  ).toEqual(before);
});

for (const [fault, authorization] of [
  ['null presence', null],
  ['empty requirement set', { version: 1, requirements: [] }],
  [
    'unknown permission',
    {
      version: 1,
      requirements: [
        {
          permission: 'organization.manage_security',
          target: { kind: 'work_package', workPackageId: 'wp' },
        },
      ],
    },
  ],
  [
    'empty package anchor',
    {
      version: 1,
      requirements: [
        { permission: 'package.write', target: { kind: 'work_package', workPackageId: '' } },
      ],
    },
  ],
  [
    'budget with package anchor',
    {
      version: 1,
      requirements: [
        {
          permission: 'project.manage_budgets',
          target: { kind: 'work_package', workPackageId: 'wp' },
        },
      ],
    },
  ],
  [
    'package with budget anchor',
    {
      version: 1,
      requirements: [
        { permission: 'package.write', target: { kind: 'budget_owner', workPackageId: 'wp' } },
      ],
    },
  ],
] as const) {
  it('throws on malformed replay provenance ' + fault + ' without history changes', async () => {
    expect(await batch('manager', 'createWorkItem')).toMatchObject({ status: 200 });
    h.sqlite.run(
      "UPDATE command_journal SET payload = json_set(payload, '$.authorization', json(?))",
      [JSON.stringify(authorization)],
    );
    const before = h.sqlite.query('SELECT * FROM command_journal ORDER BY rowid').all();
    const actor = await h.authenticatedCommandPrincipal('manager', '');
    const access: ResourceAccess = {
      kind: 'scoped',
      principal: { id: actor.id },
      scope: { organizationId: 'org-a', userId: actor.id, role: 'viewer', cap: null },
    };
    await rejectsWith(
      h.publicCommands().undoWithin('wp', actor, access),
      /replay.*(authorization|permission)/,
    );
    expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({ status: 500 });
    expect(h.sqlite.query('SELECT * FROM command_journal ORDER BY rowid').all()).toEqual(before);
  });
}

async function borrowedWrite<T extends { readonly ok: boolean }>(
  username: string,
  perform: (
    services: WritingServices,
    access: Extract<ResourceAccess, { kind: 'scoped' }>,
    actorId: string,
  ) => Promise<T>,
): Promise<T> {
  const principal = await h.authenticatedCommandPrincipal(username, '');
  const boundary = h.publicWrites();
  return boundary.uow.run(async (scope) => {
    const resolved = await boundary.commandAccess.resolve({
      kind: 'human',
      principal,
      expectedAccess: {
        kind: 'scoped',
        principal: { id: principal.id },
        scope: { organizationId: 'org-a', userId: principal.id, role: 'admin', cap: null },
      },
    });
    if (!resolved.ok || resolved.access.kind !== 'scoped')
      throw new Error('borrowed fixture authority refused');
    const access = resolved.access;
    const granted = grantAdmission('wp', principal.id);
    const admission = granted.admission;
    const opened = createDependencyContext(
      scope.stores,
      { projectId: 'wp', actorId: principal.id, access, admission },
      () => undefined,
      { kind: 'raw' },
    );
    try {
      const outcome = await perform(
        boundary.batch(scope, recordingBroadcaster(), admission, opened.context),
        access,
        principal.id,
      );
      return { commit: outcome.ok, value: outcome };
    } finally {
      opened.close();
      granted.expire();
    }
  });
}

it('retains the named write refusal in the actual borrowed step resource', async () => {
  expect(
    await borrowedWrite('viewer', (services, access, actorId) =>
      services.steps.addWithin('wp', actorId, 'Denied', 0, undefined, access),
    ),
  ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'package.write' });
  expect(h.sqlite.query('SELECT name FROM step ORDER BY id').all()).toEqual([{ name: 'Dev' }]);
});

it('conceals an invisible package in the actual borrowed step resource', async () => {
  expect(
    await borrowedWrite('plain', (services, access, actorId) =>
      services.steps.addWithin('wp', actorId, 'Denied', 0, undefined, access),
    ),
  ).toMatchObject({ ok: false, reason: 'not_found' });
});

it('conceals an invisible package in the actual borrowed marker resource', async () => {
  expect(
    await borrowedWrite('plain', (services, access, actorId) =>
      services.calendarMarkers.createWithin(
        'wp',
        actorId,
        { id: '6b0d9f3e-4c1a-4c77-9a53-1b2f0e6d7c11', date: '2026-11-09', name: 'Denied' },
        access,
      ),
    ),
  ).toMatchObject({ ok: false, reason: 'not_found' });
});

it('requires package.write for borrowed step lookup without super-admin recovery exception', async () => {
  grant('plain', 'org-super-admin');
  h.sqlite.run("UPDATE project SET restricted = 1 WHERE id = 'wp'");
  expect(
    await borrowedWrite('plain', (services, access, actorId) =>
      services.steps.findWithin('wp', 'step', actorId, access),
    ),
  ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'package.write' });
});

it('encodes organization.create_project on a refused import before writes', async () => {
  expect(
    await h.call('viewer', 'POST', '/api/projects/import', planDocumentFixture()),
  ).toMatchObject({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.create_project' },
  });
});

for (const definition of ['directory', 'measure'] as const) {
  it(
    'encodes organization.manage_directory for an import defining ' +
      definition +
      ' rows without mutation',
    async () => {
      h.sqlite.run(
        "INSERT INTO access_role (id, name, object_kind, level, reaches_restricted, organization_id, created_at) VALUES ('creator-only', 'Creator', 'organization', NULL, 0, 'org-a', 1)",
      );
      for (const permission of ['organization.navigate', 'organization.create_project'])
        h.sqlite.run(
          "INSERT INTO access_role_permission (role_id, permission) VALUES ('creator-only', ?)",
          [permission],
        );
      grant('plain', 'creator-only');
      let document = planDocumentFixture();
      if (definition === 'measure') {
        h.sqlite.run("UPDATE step SET code = 'dev' WHERE id = 'step'");
        const exported = await h.call('manager', 'GET', '/api/projects/wp/export?format=json');
        if (exported.status !== 200) throw new Error('measure import fixture export refused');
        document = exported.body as PlanDocumentImport;
        document.directory = {
          teams: [],
          people: [],
          tags: [],
          services: [],
          types: [],
          externalSystems: [],
          resources: [],
        };
        document.workItems = [];
        document.capacity = [];
        document.measureDefinitions.push({
          key: 'credits',
          name: 'Credits',
          unit: 'credits',
          kind: 'count',
          scale: 'integer',
          threePoint: false,
          showByDefault: false,
          schedulesWork: false,
          derived: false,
          order: 7,
          currency: null,
        });
      }
      const tables = [
        'project',
        'service_team',
        'service_team_organization',
        'measure',
        'event_log',
        'organization_audit',
        'command_journal',
      ];
      const before = tables.map((table) =>
        h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
      );
      expect(await h.call('plain', 'POST', '/api/projects/import', document)).toMatchObject({
        status: 403,
        body: { error: 'forbidden', permission: 'organization.manage_directory' },
      });
      expect(
        tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
      ).toEqual(before);
    },
  );
}

it('passes the retained actor into a queued step writer after caller identity alias substitution', async () => {
  const actor = await h.authenticatedCommandPrincipal('contributor', '');
  const originalId = actor.id;
  const expected: ResourceAccess = {
    kind: 'scoped',
    principal: { id: originalId },
    scope: { organizationId: 'org-a', userId: originalId, role: 'admin', cap: null },
  };
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  const held = h.holdWriteTurn(released.promise, () => {
    entered.resolve(undefined);
  });
  await entered.promise;
  const pending = runRecoveryWrite(
    h.publicWrites(),
    expected,
    'wp',
    actor,
    { step: 'add' },
    (services, access, retainedActorId) =>
      services.steps.addWithin('wp', retainedActorId, 'Retained actor', 0, undefined, access),
    (reason) => ({ ok: false as const, reason }),
  );
  actor.id = h.userId('manager');
  released.resolve(undefined);
  await held;
  expect(await pending).toMatchObject({ ok: true });
  expect(h.sqlite.query("SELECT created_by FROM step WHERE name = 'Retained actor'").get()).toEqual(
    { created_by: originalId },
  );
});

it('snapshots verified organization identity before awaiting its active-organization resolver', async () => {
  const actor = await h.authenticatedCommandPrincipal('contributor', '');
  const originalId = actor.id;
  const authentication = structuredClone(actor.authentication);
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  const connection = openConnection(h.databasePath());
  const access = new SqliteOrganizationAccess(
    connection.db,
    async () => {
      entered.resolve(undefined);
      await released.promise;
      return 'org-a';
    },
    () => Date.now(),
  );
  try {
    const pending = access.resolve(actor);
    await entered.promise;
    actor.id = h.userId('manager');
    actor.authentication = undefined;
    released.resolve(undefined);
    const resolved = await pending;
    expect(resolved).toMatchObject({
      ok: true,
      access: {
        kind: 'scoped',
        scope: { userId: originalId },
        principal: { id: originalId, authentication },
      },
    });
    if (!resolved.ok || resolved.access.kind !== 'scoped')
      throw new Error('verified organization resolver refused');
    expect(Object.keys(resolved.access.principal).sort()).toEqual(['authentication', 'id']);
  } finally {
    connection.close();
  }
});

it('duplicates a package row without requiring write at unchanged outgoing dependency endpoints', async () => {
  h.close();
  h = OrganizationHarness.openComposedWith({ machineGrants, syntheticExternalCommands: true });
  seedDependencyAuthority(h.databasePath());
  await h.register('contributor');
  h.organization('org-a');
  h.member('org-a', 'contributor', 'admin');
  h.bind('contributor', 'org-a');
  h.activate();
  for (const id of ['wp', 'remote', 'new-remote']) {
    h.sqlite.run(
      'INSERT INTO project (id, name, owner_id, restricted, created_at) VALUES (?, ?, ?, 0, 1)',
      [id, id, h.userId('contributor')],
    );
    h.sqlite.run(
      "INSERT INTO project_organization (resource_id, organization_id) VALUES (?, 'org-a')",
      [id],
    );
    h.sqlite.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 1)', [
      id + '-step',
      id,
      'Dev',
    ]);
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, NULL, 1, ?)',
      [id + '-work', id, id],
    );
    grant(
      'contributor',
      id === 'wp' ? 'package-contributor' : 'package-viewer',
      'work_package',
      id,
    );
  }

  grant('contributor', 'package-contributor', 'work_package', 'remote');
  const node = (projectId: string) => ({
    projectId,
    workItemId: projectId + '-work',
    scope: 'node',
    stepId: projectId + '-step',
  });
  expect(
    await h.call('contributor', 'POST', '/api/projects/remote/commands', {
      commands: [
        {
          kind: 'addTypedDependency',
          predecessor: node('wp'),
          successor: node('remote'),
          type: 'FS',
        },
      ],
    }),
  ).toMatchObject({ status: 200 });
  h.sqlite.run(
    "DELETE FROM access_grant WHERE scope_id = 'remote' AND role_id = 'package-contributor'",
  );
  const before = h.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all();
  expect(
    await h.call('contributor', 'POST', '/api/projects/wp/commands', {
      commands: [{ kind: 'duplicateWorkItem', workItemId: 'wp-work' }],
    }),
  ).toMatchObject({ status: 200 });
  expect(h.sqlite.query('SELECT * FROM external_dependency ORDER BY id').all()).toEqual(before);
});

for (const direction of ['undo', 'redo'] as const) {
  it(
    'refuses remote typed dependency ' +
      direction +
      ' after remote write revocation without history effects',
    async () => {
      h.close();
      h = OrganizationHarness.openComposedWith({ machineGrants, syntheticExternalCommands: true });
      seedDependencyAuthority(h.databasePath());
      await h.register('contributor');
      h.organization('org-a');
      h.member('org-a', 'contributor', 'admin');
      h.bind('contributor', 'org-a');
      h.activate();
      for (const id of ['wp', 'remote', 'new-remote']) {
        h.sqlite.run(
          'INSERT INTO project (id, name, owner_id, restricted, created_at) VALUES (?, ?, ?, 0, 1)',
          [id, id, h.userId('contributor')],
        );
        h.sqlite.run(
          "INSERT INTO project_organization (resource_id, organization_id) VALUES (?, 'org-a')",
          [id],
        );
        h.sqlite.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 1)', [
          id + '-step',
          id,
          'Dev',
        ]);
        h.sqlite.run(
          'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, NULL, 1, ?)',
          [id + '-work', id, id],
        );
        grant(
          'contributor',
          id === 'wp' ? 'package-contributor' : 'package-viewer',
          'work_package',
          id,
        );
      }

      grant('contributor', 'package-contributor', 'work_package', 'remote');
      const node = (projectId: string) => ({
        projectId,
        workItemId: projectId + '-work',
        scope: 'node',
        stepId: projectId + '-step',
      });
      expect(
        await h.call('contributor', 'POST', '/api/projects/wp/commands', {
          commands: [
            {
              kind: 'addTypedDependency',
              predecessor: node('remote'),
              successor: node('wp'),
              type: 'FS',
            },
          ],
        }),
      ).toMatchObject({ status: 200 });
      if (direction === 'redo')
        expect(await h.call('contributor', 'POST', '/api/projects/wp/undo')).toMatchObject({
          status: 200,
        });
      h.sqlite.run(
        "DELETE FROM access_grant WHERE scope_id = 'remote' AND role_id = 'package-contributor'",
      );
      const tables = [
        'work_item',
        'external_dependency',
        'command_journal',
        'event_log',
        'organization_audit',
      ];
      const before = tables.map((table) =>
        h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
      );
      expect(await h.call('contributor', 'POST', '/api/projects/wp/' + direction)).toMatchObject({
        status: 403,
        body: { error: 'forbidden', permission: 'package.write' },
      });
      expect(
        tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
      ).toEqual(before);
    },
  );
}

it('throws on a missing admitted remote dependency authorization capability without mutation', async () => {
  h.close();
  h = OrganizationHarness.openComposedWith({ machineGrants, syntheticExternalCommands: true });
  seedDependencyAuthority(h.databasePath());
  await h.register('contributor');
  h.organization('org-a');
  h.member('org-a', 'contributor', 'admin');
  h.bind('contributor', 'org-a');
  h.activate();
  for (const id of ['wp', 'remote', 'new-remote']) {
    h.sqlite.run(
      'INSERT INTO project (id, name, owner_id, restricted, created_at) VALUES (?, ?, ?, 0, 1)',
      [id, id, h.userId('contributor')],
    );
    h.sqlite.run(
      "INSERT INTO project_organization (resource_id, organization_id) VALUES (?, 'org-a')",
      [id],
    );
    h.sqlite.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 1)', [
      id + '-step',
      id,
      'Dev',
    ]);
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, NULL, 1, ?)',
      [id + '-work', id, id],
    );
    grant(
      'contributor',
      id === 'wp' ? 'package-contributor' : 'package-viewer',
      'work_package',
      id,
    );
  }

  grant('contributor', 'package-contributor', 'work_package', 'remote');
  const node = (projectId: string) => ({
    projectId,
    workItemId: projectId + '-work',
    scope: 'node',
    stepId: projectId + '-step',
  });
  expect(
    await h.call('contributor', 'POST', '/api/projects/wp/commands', {
      commands: [
        {
          kind: 'addTypedDependency',
          predecessor: node('remote'),
          successor: node('wp'),
          type: 'FS',
        },
      ],
    }),
  ).toMatchObject({ status: 200 });
  const before = h.sqlite.query('SELECT * FROM work_item ORDER BY id').all();
  const create = dependencyContexts.createDependencyContext;
  const injected = spyOn(dependencyContexts, 'createDependencyContext').mockImplementation(
    (...args) => {
      const opened = create(...args);
      Reflect.deleteProperty(opened.context, 'authorizeTypedWrites');
      return opened;
    },
  );
  try {
    expect(
      await h.call('contributor', 'POST', '/api/projects/wp/commands', {
        commands: [{ kind: 'duplicateWorkItem', workItemId: 'wp-work' }],
      }),
    ).toMatchObject({ status: 500 });
    const actor = await h.authenticatedCommandPrincipal('contributor', '');
    const expected: ResourceAccess = {
      kind: 'scoped',
      principal: { id: actor.id },
      scope: { organizationId: 'org-a', userId: actor.id, role: 'admin', cap: null },
    };
    await rejectsWith(
      h
        .publicCommands()
        .runWithin(
          'wp',
          actor,
          [normalizeCommand('duplicateWorkItem', { workItemId: 'wp-work' })],
          expected,
        ),
      'remote dependency mutation lacks admitted write authorization',
    );
    expect(h.sqlite.query('SELECT * FROM work_item ORDER BY id').all()).toEqual(before);
  } finally {
    injected.mockRestore();
  }
});

it('rechecks the actual current dependency endpoints after an earlier command changes them in the same batch', async () => {
  h.close();
  h = OrganizationHarness.openComposedWith({ machineGrants, syntheticExternalCommands: true });
  seedDependencyAuthority(h.databasePath());
  await h.register('contributor');
  h.organization('org-a');
  h.member('org-a', 'contributor', 'admin');
  h.bind('contributor', 'org-a');
  h.activate();
  for (const id of ['wp', 'remote', 'new-remote']) {
    h.sqlite.run(
      'INSERT INTO project (id, name, owner_id, restricted, created_at) VALUES (?, ?, ?, 0, 1)',
      [id, id, h.userId('contributor')],
    );
    h.sqlite.run(
      "INSERT INTO project_organization (resource_id, organization_id) VALUES (?, 'org-a')",
      [id],
    );
    h.sqlite.run('INSERT INTO step (id, project_id, name, position) VALUES (?, ?, ?, 1)', [
      id + '-step',
      id,
      'Dev',
    ]);
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, NULL, 1, ?)',
      [id + '-work', id, id],
    );
    grant(
      'contributor',
      id === 'wp' ? 'package-contributor' : 'package-viewer',
      'work_package',
      id,
    );
  }

  for (const id of ['remote', 'new-remote'])
    grant('contributor', 'package-contributor', 'work_package', id);
  const node = (projectId: string) => ({
    projectId,
    workItemId: projectId + '-work',
    scope: 'node',
    stepId: projectId + '-step',
  });
  const added = await h.call('contributor', 'POST', '/api/projects/wp/commands', {
    commands: [
      {
        kind: 'addTypedDependency',
        predecessor: node('remote'),
        successor: node('wp'),
        type: 'FS',
      },
    ],
  });
  expect(added).toMatchObject({ status: 200 });
  const dependencyId = (added.body as { results: { id: string }[] }).results[0].id;
  const tables = [
    'work_item',
    'external_dependency',
    'command_journal',
    'event_log',
    'organization_audit',
  ];
  const before = tables.map((table) =>
    h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  );
  const boundary = h.publicWrites();
  const run = boundary.uow.run.bind(boundary.uow);
  const inject: UnitOfWork['run'] = (act) =>
    run((scope) => {
      const decisions = scope.stores.accessDecisions;
      if (decisions === undefined) throw new Error('fixture grant authority absent');
      return act({
        ...scope,
        stores: {
          ...scope.stores,
          accessDecisions: {
            readablePackageIds: (principal, organizationId) =>
              decisions.readablePackageIds(principal, organizationId),
            effectiveRoleAt: async (principal, target) => {
              const effective = await decisions.effectiveRoleAt(principal, target);
              const held = await scope.stores.typedDependencies.listByProject('wp');
              // Inject a current permission revocation only after the first command changed the held relationship.
              if (
                effective !== null &&
                target.kind === 'work_package' &&
                target.chain.workPackageId === 'new-remote' &&
                held.some((row) => row.predecessor.projectId === 'new-remote')
              )
                return {
                  ...effective,
                  permissions: new Set(
                    [...effective.permissions].filter(
                      (permission) => permission !== 'package.write',
                    ),
                  ),
                };
              return effective;
            },
          },
        },
      });
    });
  const injected = spyOn(boundary.uow, 'run').mockImplementation(inject);
  try {
    expect(
      await h.call('contributor', 'POST', '/api/projects/wp/commands', {
        commands: [
          {
            kind: 'updateTypedDependency',
            dependencyId,
            predecessor: node('new-remote'),
            successor: node('wp'),
            type: 'FS',
          },
          { kind: 'removeTypedDependency', dependencyId },
        ],
      }),
    ).toMatchObject({
      status: 403,
      body: {
        at: 1,
        kind: 'removeTypedDependency',
        error: 'forbidden',
        permission: 'package.write',
      },
    });
    expect(
      tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
    ).toEqual(before);
  } finally {
    injected.mockRestore();
  }
});

for (const direction of ['undo', 'redo'] as const) {
  it(
    'encodes package.write when a visible viewer is denied ' + direction + ' admission',
    async () => {
      expect(await h.call('viewer', 'POST', '/api/projects/wp/' + direction)).toMatchObject({
        status: 403,
        body: { error: 'forbidden', permission: 'package.write' },
      });
    },
  );
}

it('encodes package.write on current runtime scope refusal', async () => {
  addAgentPerson(h.sqlite, 'runtime-person', 'org-a', h.userId('viewer'));
  expect(
    await h.call('viewer', 'GET', '/api/projects/wp/runtime-state?personId=runtime-person'),
  ).toMatchObject({
    status: 403,
    body: { error: 'forbidden', permission: 'package.write' },
  });
});

it('encodes package.claim_for_others on current runtime person refusal', async () => {
  addAgentPerson(h.sqlite, 'runtime-person', 'org-a', h.userId('manager'));
  expect(
    await h.call('contributor', 'GET', '/api/projects/wp/runtime-state?personId=runtime-person'),
  ).toMatchObject({
    status: 403,
    body: { error: 'forbidden', permission: 'package.claim_for_others' },
  });
});

it('preserves named directory refusal for standalone removal after queued revocation', async () => {
  const actorId = h.userId('manager');
  const access = {
    kind: 'scoped' as const,
    principal: { id: actorId },
    scope: { organizationId: 'org-a', userId: actorId, role: 'viewer' as const, cap: null },
  };
  h.sqlite.run("INSERT INTO service (id,name) VALUES('held-service','Held')");
  h.sqlite.run(
    "INSERT INTO service_organization(resource_id,organization_id,name) VALUES('held-service','org-a','Held')",
  );
  const entered = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  const held = h.holdWriteTurn(released.promise, () => {
    entered.resolve(undefined);
  });
  await entered.promise;
  const pending = h
    .publicDirectoryService()
    .removeWithin('services', 'held-service', actorId, false, access);
  h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [actorId]);
  released.resolve(undefined);
  await held;
  expect(await pending).toMatchObject({
    ok: false,
    reason: 'forbidden',
    permission: 'organization.manage_directory',
  });
  expect(h.sqlite.query("SELECT id FROM service WHERE id='held-service'").get()).toEqual({
    id: 'held-service',
  });
});

it('preserves named directory refusal for standalone account binding', async () => {
  addAgentPerson(h.sqlite, 'binding-person', 'org-a', null);
  const actorId = h.userId('contributor');
  const access = {
    kind: 'scoped' as const,
    principal: { id: actorId },
    scope: { organizationId: 'org-a', userId: actorId, role: 'admin' as const, cap: null },
  };
  expect(
    await h
      .publicDirectoryService()
      .patchPersonWithin('binding-person', actorId, { accountId: actorId }, access),
  ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'organization.manage_directory' });
  expect(h.sqlite.query("SELECT account_id FROM person WHERE id='binding-person'").get()).toEqual({
    account_id: null,
  });
});

for (const role of ['org-admin', 'org-super-admin']) {
  for (const kind of ['setBudget', 'clearBudget'] as const) {
    it(
      'refuses restricted ' + kind + ' through only ' + role + ' at the interim owner',
      async () => {
        expect(await batch('manager', 'setBudget')).toMatchObject({ status: 200 });
        h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('manager')]);
        grant('manager', role);
        h.sqlite.run("UPDATE project SET restricted=1 WHERE id='wp'");
        const before = [
          'work_item_budget',
          'command_journal',
          'event_log',
          'organization_audit',
        ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
        expect(await batch('manager', kind)).toMatchObject({
          status: 403,
          body: { error: 'forbidden', permission: 'project.manage_budgets' },
        });
        expect(
          ['work_item_budget', 'command_journal', 'event_log', 'organization_audit'].map((table) =>
            h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
          ),
        ).toEqual(before);
      },
    );
  }
  for (const direction of ['undo', 'redo']) {
    it(
      'refuses restricted budget ' + direction + ' through only ' + role + ' at the interim owner',
      async () => {
        expect(await batch('manager', 'setBudget')).toMatchObject({ status: 200 });
        if (direction === 'redo')
          expect(await h.call('manager', 'POST', '/api/projects/wp/undo')).toMatchObject({
            status: 200,
          });
        h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('manager')]);
        grant('manager', role);
        grant('manager', 'project-contributor', 'work_package', 'wp');
        h.sqlite.run("UPDATE project SET restricted=1 WHERE id='wp'");
        const before = [
          'work_item_budget',
          'command_journal',
          'event_log',
          'organization_audit',
        ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
        expect(await h.call('manager', 'POST', '/api/projects/wp/' + direction)).toMatchObject({
          status: 403,
          body: { error: 'forbidden', permission: 'project.manage_budgets' },
        });
        expect(
          ['work_item_budget', 'command_journal', 'event_log', 'organization_audit'].map((table) =>
            h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
          ),
        ).toEqual(before);
      },
    );
  }
}

for (const visible of [true, false]) {
  it(
    'evaluates minimal ' +
      (visible ? 'visible' : 'hidden') +
      ' custom budget authority at the addressed package',
    async () => {
      h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('manager')]);
      h.sqlite.run(
        "INSERT INTO access_role(id,name,object_kind,level,reaches_restricted,organization_id,created_at) VALUES('minimal-budget','Budget','organization',NULL,0,'org-a',1)",
      );
      for (const permission of visible
        ? ['package.read', 'project.manage_budgets']
        : ['project.manage_budgets'])
        h.sqlite.run(
          "INSERT INTO access_role_permission(role_id,permission) VALUES('minimal-budget',?)",
          [permission],
        );
      grant('manager', 'minimal-budget');
      expect(await batch('manager', 'setBudget')).toMatchObject(
        visible ? { status: 200 } : { status: 404, body: { error: 'not_found' } },
      );
    },
  );
}

for (const operation of [
  'resource removal',
  'directory capacity',
  'measure creation',
  'measure patch',
  'measure removal',
] as const) {
  it('retains named authority in the borrowed directory ' + operation + ' path', async () => {
    const answer = await borrowedWrite<{ readonly ok: boolean }>(
      'viewer',
      (services, access, actorId) =>
        operation === 'resource removal'
          ? services.directory.removeResourceWithin('missing', actorId, true, access)
          : operation === 'directory capacity'
            ? services.directory.setDirectoryCapacityWithin('missing', actorId, 1, true, access)
            : operation === 'measure creation'
              ? services.directory.measures.addWithin(
                  actorId,
                  {
                    key: 'credits',
                    name: 'Credits',
                    unit: 'credits',
                    kind: 'count',
                    scale: 'integer',
                  },
                  access,
                )
              : operation === 'measure patch'
                ? services.directory.measures.patchWithin(
                    'missing',
                    actorId,
                    { name: 'Changed' },
                    access,
                  )
                : services.directory.measures.removeWithin('missing', actorId, access),
    );
    expect(answer).toMatchObject({
      ok: false,
      reason: 'forbidden',
      permission: 'organization.manage_directory',
    });
  });
}

it('encodes organization.manage_directory on directory capacity preview refusal', async () => {
  expect(
    await h.call(
      'viewer',
      'POST',
      '/api/organization/resources/missing/directory-capacity/preview',
      { units: 1 },
    ),
  ).toMatchObject({
    status: 403,
    body: { error: 'forbidden', permission: 'organization.manage_directory' },
  });
});

for (const kind of ['setBudget', 'clearBudget'] as const) {
  it('conceals hidden ' + kind + ' before missing budget-owner permission', async () => {
    expect(await batch('plain', kind)).toMatchObject({ status: 404, body: { error: 'not_found' } });
  });
}

for (const catalog of ['tags', 'teams', 'people'] as const) {
  it('authorizes used standalone ' + catalog + ' removal before usage disclosure', async () => {
    const actorId = h.userId('contributor');
    const access = {
      kind: 'scoped' as const,
      principal: { id: actorId },
      scope: { organizationId: 'org-a', userId: actorId, role: 'admin' as const, cap: null },
    };
    if (catalog === 'tags') {
      h.sqlite.run("INSERT INTO tag(id,name) VALUES('used','Used')");
      h.sqlite.run(
        "INSERT INTO tag_organization(resource_id,organization_id,name) VALUES('used','org-a','Used')",
      );
      h.sqlite.run("INSERT INTO work_item_tag(work_item_id,tag_id) VALUES('work','used')");
    } else if (catalog === 'teams') {
      h.sqlite.run("INSERT INTO service_team(id,name) VALUES('used','Used')");
      h.sqlite.run(
        "INSERT INTO service_team_organization(resource_id,organization_id,name) VALUES('used','org-a','Used')",
      );
      h.sqlite.run("INSERT INTO work_item_team(work_item_id,team_id) VALUES('work','used')");
    } else {
      addAgentPerson(h.sqlite, 'used', 'org-a', actorId);
      h.sqlite.run(
        "INSERT INTO assignment(work_item_id,step_id,person_id) VALUES('work','step','used')",
      );
    }
    const answer = await h
      .publicDirectoryService()
      .removeWithin(catalog, 'used', actorId, false, access);
    expect(answer).toMatchObject({
      ok: false,
      reason: 'forbidden',
      permission: 'organization.manage_directory',
    });
    const method =
      catalog === 'tags' ? 'usageOfTag' : catalog === 'teams' ? 'usageOfTeam' : 'usageOfPerson';
    const usage = spyOn(DirectoryRepository.prototype, method).mockImplementation(() => {
      throw Error('usage must not be read');
    });
    try {
      expect(
        await h.publicDirectoryService().removeWithin(catalog, 'used', actorId, false, access),
      ).toMatchObject({
        ok: false,
        reason: 'forbidden',
        permission: 'organization.manage_directory',
      });
      expect(usage).not.toHaveBeenCalled();
    } finally {
      usage.mockRestore();
    }
  });
}

it('keeps standalone removal announcements buffered when its owner rolls back after mutation', async () => {
  h.sqlite.run("INSERT INTO tag(id,name) VALUES('used','Used')");
  h.sqlite.run(
    "INSERT INTO tag_organization(resource_id,organization_id,name) VALUES('used','org-a','Used')",
  );
  h.sqlite.run("INSERT INTO work_item_tag(work_item_id,tag_id) VALUES('work','used')");
  const actorId = h.userId('manager');
  const access = {
    kind: 'scoped' as const,
    principal: { id: actorId },
    scope: { organizationId: 'org-a', userId: actorId, role: 'viewer' as const, cap: null },
  };
  const boundary = h.publicWrites();
  const owner = boundary.uow.run.bind(boundary.uow);
  const faulted: UnitOfWork['run'] = (act) =>
    owner(async (scope) => {
      await act(scope);
      throw Error('forced removal owner rollback');
    });
  const mutation = spyOn(boundary.uow, 'run').mockImplementation(faulted);
  const announcements = spyOn(boundary.announcements, 'publish').mockResolvedValue();
  const tables = [
    'tag',
    'tag_organization',
    'work_item_tag',
    'event_log',
    'event_sequencer',
    'organization_audit',
    'command_journal',
  ];
  const before = tables.map((table) =>
    h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
  );
  try {
    await rejectsWith(
      h.publicDirectoryService().removeWithin('tags', 'used', actorId, true, access),
      'forced removal owner rollback',
    );
    expect(
      tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
    ).toEqual(before);
    expect(announcements).not.toHaveBeenCalled();
  } finally {
    mutation.mockRestore();
    announcements.mockRestore();
  }
});

it('publishes a successful standalone removal only after committed rows are visible', async () => {
  h.sqlite.run("INSERT INTO tag(id,name) VALUES('used','Used')");
  h.sqlite.run(
    "INSERT INTO tag_organization(resource_id,organization_id,name) VALUES('used','org-a','Used')",
  );
  h.sqlite.run("INSERT INTO work_item_tag(work_item_id,tag_id) VALUES('work','used')");
  const actorId = h.userId('manager');
  const access = {
    kind: 'scoped' as const,
    principal: { id: actorId },
    scope: { organizationId: 'org-a', userId: actorId, role: 'viewer' as const, cap: null },
  };
  const broadcaster = h.publicWrites().announcements;
  const publish = broadcaster.publish.bind(broadcaster);
  const announcement = spyOn(broadcaster, 'publish').mockImplementation(
    async (projectId, event) => {
      expect(h.sqlite.query("SELECT id FROM tag WHERE id='used'").get()).toBeNull();
      await publish(projectId, event);
    },
  );
  try {
    expect(
      await h.publicDirectoryService().removeWithin('tags', 'used', actorId, true, access),
    ).toEqual({ ok: true });
    expect(announcement).toHaveBeenCalledWith('wp', { type: 'directory_changed' });
    expect(h.sqlite.query('SELECT id FROM event_log').all()).not.toEqual([]);
  } finally {
    announcement.mockRestore();
  }
});

it('retains package.write in the actual borrowed saved-capture authorization', async () => {
  expect(
    await borrowedWrite('viewer', (services, access, actorId) =>
      services.projects.authorizeWrite('wp', actorId, access),
    ),
  ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'package.write' });
});

it('refuses borrowed project settings before reaching a broken mutation port', async () => {
  const mutation = spyOn(ProjectRepository.prototype, 'editInOrganization').mockImplementation(
    () => {
      throw Error('settings mutation reached before permission');
    },
  );
  try {
    expect(
      await borrowedWrite('viewer', (services, access, actorId) =>
        services.projects.updateWithin('wp', actorId, { name: 'Denied' }, access),
      ),
    ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'package.manage_settings' });
    expect(mutation).not.toHaveBeenCalled();
  } finally {
    mutation.mockRestore();
  }
});

it('retains named directory authority in actual borrowed account binding', async () => {
  expect(
    await borrowedWrite('viewer', (services, access, actorId) =>
      services.directory.patchPersonWithin('missing', actorId, { accountId: actorId }, access),
    ),
  ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'organization.manage_directory' });
});

it('throws for an impossible standalone removal link refusal', async () => {
  const actorId = h.userId('manager');
  const access = {
    kind: 'scoped' as const,
    principal: { id: actorId },
    scope: { organizationId: 'org-a', userId: actorId, role: 'viewer' as const, cap: null },
  };
  const boundary = h.publicWrites();
  const owner = boundary.uow.run.bind(boundary.uow);
  const faulted: UnitOfWork['run'] = (act) =>
    owner((scope) => {
      const capture = scope.fanoutCapture;
      if (capture === undefined) throw Error('fixture lacks capture');
      return act({
        ...scope,
        fanoutCapture: {
          ...capture,
          resolveDirectoryWrite: () => Promise.resolve({ ok: false, reason: 'unknown_team' }),
        },
      });
    });
  const mutation = spyOn(boundary.uow, 'run').mockImplementation(faulted);
  try {
    await rejectsWith(
      h.publicDirectoryService().removeWithin('tags', 'missing', actorId, false, access),
      'standalone removal received an invalid link refusal',
    );
  } finally {
    mutation.mockRestore();
  }
});

it('encodes the second current grant denial at runtime command admission', async () => {
  addAgentPerson(h.sqlite, 'runtime-person', 'org-a', h.userId('contributor'));
  const initial = await h.call(
    'contributor',
    'GET',
    '/api/projects/wp/runtime-state?personId=runtime-person',
  );
  expect(initial.status).toBe(200);
  const ledgerId = (initial.body as { ledgerId: string }).ledgerId;
  expect(
    await h.call('contributor', 'POST', '/api/projects/wp/runtime-authority', {
      schemaVersion: 1,
      commandId: 'authority',
      personId: 'runtime-person',
      expectedLedgerId: ledgerId,
      ownerId: 'runtime-owner',
      expectedGeneration: null,
    }),
  ).toMatchObject({ status: 200 });
  const state = await h.call(
    'contributor',
    'GET',
    '/api/projects/wp/runtime-state?personId=runtime-person',
  );
  expect(state.status).toBe(200);
  const basis = (state.body as { basis: string }).basis;
  const read = Reflect.get(AccessDecisionRepository.prototype, 'effectiveRoleAt');
  let reads = 0;
  const authority = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt').mockImplementation(
    async function (this: AccessDecisionRepository, principal, target) {
      const effective = await read.call(this, principal, target);
      if (target.kind === 'work_package' && ++reads === 2)
        return { permissions: new Set(['package.read'] as const), via: [] };
      return effective;
    },
  );
  const before = [
    'claim',
    'runtime_command_receipt',
    'runtime_authority',
    'command_journal',
    'event_log',
  ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
  try {
    expect(
      await h.call('contributor', 'POST', '/api/projects/wp/runtime-commands', {
        schemaVersion: 1,
        commandId: 'claim-denied',
        personId: 'runtime-person',
        expectedLedgerId: ledgerId,
        authority: { ownerId: 'runtime-owner', generation: 1 },
        expectedBasis: basis,
        action: {
          kind: 'claim',
          workItemId: 'work',
          stepId: 'step',
          parentClaimId: null,
          execution: { storeId: 'store', runId: 'run', attemptId: 'attempt', sessionId: 'session' },
        },
      }),
    ).toMatchObject({ status: 403, body: { error: 'forbidden', permission: 'package.write' } });
    expect(reads).toBe(2);
    expect(
      ['claim', 'runtime_command_receipt', 'runtime_authority', 'command_journal', 'event_log'].map(
        (table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
      ),
    ).toEqual(before);
  } finally {
    authority.mockRestore();
  }
});

for (const operation of ['write', 'replay'] as const) {
  it(
    'requires budget-owner authority independently of the package verdict during ' + operation,
    async () => {
      if (operation === 'replay')
        expect(await batch('manager', 'setBudget')).toMatchObject({ status: 200 });
      const evaluate = Reflect.get(AccessDecisionRepository.prototype, 'effectiveRoleAt');
      const authority = spyOn(
        AccessDecisionRepository.prototype,
        'effectiveRoleAt',
      ).mockImplementation(async function (this: AccessDecisionRepository, principal, target) {
        const effective = await evaluate.call(this, principal, target);
        if (target.kind === 'organization') {
          if (effective === null) throw Error('fixture organization authority vanished');
          return {
            ...effective,
            permissions: new Set(
              [...effective.permissions].filter(
                (permission) => permission !== 'project.manage_budgets',
              ),
            ),
          };
        }
        return effective;
      });
      const before = ['work_item_budget', 'command_journal', 'event_log', 'organization_audit'].map(
        (table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
      );
      try {
        expect(
          operation === 'write'
            ? await batch('manager', 'setBudget')
            : await h.call('manager', 'POST', '/api/projects/wp/undo'),
        ).toMatchObject({
          status: 403,
          body: { error: 'forbidden', permission: 'project.manage_budgets' },
        });
        expect(
          ['work_item_budget', 'command_journal', 'event_log', 'organization_audit'].map((table) =>
            h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
          ),
        ).toEqual(before);
      } finally {
        authority.mockRestore();
      }
    },
  );
}

it('retains named authority in the actual borrowed marker creation path', async () => {
  expect(
    await borrowedWrite('viewer', (services, access, actorId) =>
      services.calendarMarkers.createWithin(
        'wp',
        actorId,
        { id: '6b0d9f3e-4c1a-4c77-9a53-1b2f0e6d7c11', date: '2026-11-09', name: 'Denied' },
        access,
      ),
    ),
  ).toMatchObject({ ok: false, reason: 'forbidden', permission: 'package.write' });
});

for (const operation of ['rank', 'capacity mode'] as const) {
  it('rechecks queued ' + operation + ' grants after the public preflight', async () => {
    if (operation === 'capacity mode') grant('manager', 'org-super-admin');
    const entered = Promise.withResolvers<undefined>();
    const released = Promise.withResolvers<undefined>();
    const grantRead = Promise.withResolvers<undefined>();
    const held = h.holdWriteTurn(released.promise, () => {
      entered.resolve(undefined);
    });
    await entered.promise;
    const evaluate = Reflect.get(AccessDecisionRepository.prototype, 'effectiveRoleAt');
    let observed = false;
    const authority = spyOn(
      AccessDecisionRepository.prototype,
      'effectiveRoleAt',
    ).mockImplementation(async function (this: AccessDecisionRepository, principal, target) {
      const effective = await evaluate.call(this, principal, target);
      if (!observed && principal.id === h.userId('manager') && target.kind === 'organization') {
        observed = true;
        grantRead.resolve(undefined);
      }
      return effective;
    });
    const tables = ['project_rank', 'organization', 'event_log', 'organization_audit'];
    const before = tables.map((table) =>
      h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
    );
    try {
      const pending =
        operation === 'rank'
          ? h.call('manager', 'POST', '/api/organization/projects/wp/rank', {
              afterProjectId: null,
            })
          : h.call('manager', 'PATCH', '/api/organization', { sharedPeople: true });
      await grantRead.promise;
      h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('manager')]);
      grant('manager', 'project-viewer');
      released.resolve(undefined);
      await held;
      expect(await pending).toMatchObject({
        status: 403,
        body: {
          error: 'forbidden',
          permission:
            operation === 'rank'
              ? 'organization.manage_spaces'
              : 'organization.manage_capacity_mode',
        },
      });
      expect(
        tables.map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
      ).toEqual(before);
    } finally {
      released.resolve(undefined);
      await held;
      authority.mockRestore();
    }
  });
}

it('refuses public rank authority before a broken mutation port', async () => {
  const principal = await h.authenticatedCommandPrincipal('viewer', '');
  const access: ResourceAccess = {
    kind: 'scoped',
    principal: { id: principal.id },
    scope: { organizationId: 'org-a', userId: principal.id, role: 'admin', cap: null },
  };
  const connection = openConnection(h.databasePath());
  const mutate = () => Promise.reject(new Error('rank mutation must not run'));
  const ranks = new ProjectRankResource({
    ranks: { orderIn: () => Promise.resolve([]), moveAfter: mutate },
    projects: { listWithin: () => Promise.reject(new Error('naming must not run')) },
    clock: testClock,
    accessDecisions: new AccessDecisionRepository(connection.db),
  });
  try {
    expect(await ranks.move(principal, access, 'wp', null)).toMatchObject({
      ok: false,
      refusal: 'forbidden',
      permission: 'organization.manage_spaces',
    });
  } finally {
    connection.close();
  }
});

it('refuses public capacity-mode authority before a broken mutation port', async () => {
  const principal = await h.authenticatedCommandPrincipal('viewer', '');
  const access: ResourceAccess = {
    kind: 'scoped',
    principal: { id: principal.id },
    scope: { organizationId: 'org-a', userId: principal.id, role: 'super_admin', cap: null },
  };
  const connection = openConnection(h.databasePath());
  const modes = new CapacityModeResource({
    modes: {
      capacityModeIn: () => Promise.resolve('isolated'),
      switchCapacityMode: () => Promise.reject(new Error('mode mutation must not run')),
    },
    clock: testClock,
    supported: ['isolated', 'shared'],
    accessDecisions: new AccessDecisionRepository(connection.db),
  });
  try {
    expect(await modes.switch(principal, access, true, false)).toMatchObject({
      ok: false,
      refusal: 'forbidden',
      permission: 'organization.manage_capacity_mode',
    });
  } finally {
    connection.close();
  }
});

for (const operation of [
  'add',
  'add-person',
  'rename',
  'patch-team',
  'patch-person',
  'remove',
] as const) {
  it('throws before reads for a mismatched standalone ' + operation + ' actor', async () => {
    const accountId = h.userId('manager');
    const otherId = h.userId('contributor');
    const access = {
      kind: 'scoped' as const,
      principal: { id: accountId },
      scope: { organizationId: 'org-a', userId: accountId, role: 'viewer' as const, cap: null },
    };
    const boundary = h.publicWrites();
    const writer = h.publicDirectoryService();
    const owner = spyOn(boundary.uow, 'run');
    const grants = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
    const publication = spyOn(boundary.announcements, 'publish').mockResolvedValue(undefined);
    const before = [
      'person',
      'person_organization',
      'service_team',
      'service_team_organization',
      'event_log',
      'organization_audit',
      'command_journal',
    ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
    try {
      const pending =
        operation === 'add'
          ? writer.addWithin('teams', otherId, 'Denied', access)
          : operation === 'add-person'
            ? writer.addPersonWithin(otherId, 'Denied', [], access)
            : operation === 'rename'
              ? writer.renameWithin('tags', 'missing', otherId, 'Denied', access)
              : operation === 'patch-team'
                ? writer.patchTeamWithin('missing', otherId, { name: 'Denied' }, access)
                : operation === 'patch-person'
                  ? writer.patchPersonWithin('missing', otherId, { name: 'Denied' }, access)
                  : writer.removeWithin('tags', 'missing', otherId, false, access);
      await rejectsWith(pending, 'standalone directory principal differs');
      expect(owner).not.toHaveBeenCalled();
      expect(grants).not.toHaveBeenCalled();
      expect(publication).not.toHaveBeenCalled();
      expect(
        [
          'person',
          'person_organization',
          'service_team',
          'service_team_organization',
          'event_log',
          'organization_audit',
          'command_journal',
        ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all()),
      ).toEqual(before);
    } finally {
      owner.mockRestore();
      grants.mockRestore();
      publication.mockRestore();
    }
  });
}

it('throws before grant reads when direct project creation names another owner', async () => {
  expect(
    await borrowedWrite('manager', async (services, access) => {
      const grants = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
      try {
        await rejectsWith(
          services.projects.createWithin('Denied', h.userId('contributor'), access),
          'project creation principal differs',
        );
        expect(grants).not.toHaveBeenCalled();
        return { ok: false };
      } finally {
        grants.mockRestore();
      }
    }),
  ).toEqual({ ok: false });
  expect(h.sqlite.query('SELECT name FROM project ORDER BY id').all()).toEqual([
    { name: 'Package' },
  ]);
});

it('keeps direct service creation with its authenticated actor', async () => {
  const accountId = h.userId('manager');
  const access = {
    kind: 'scoped' as const,
    principal: { id: accountId },
    scope: { organizationId: 'org-a', userId: accountId, role: 'viewer' as const, cap: null },
  };
  expect(
    await h.publicDirectoryService().addWithin('teams', accountId, 'Same actor', access),
  ).toMatchObject({ ok: true });
  expect(
    await borrowedWrite('manager', (services, current, actorId) =>
      services.projects.createWithin('Same actor', actorId, current),
    ),
  ).toMatchObject({ ok: true, value: { project: { ownerId: accountId } } });
});

for (const fault of ['principal', 'scoped account'] as const) {
  it('throws on a mismatched space ' + fault + ' before grant reads', async () => {
    const authority = h.publicWrites().commandAccess;
    const resolve = authority.resolve.bind(authority);
    const injected = spyOn(authority, 'resolve').mockImplementation(async (caller) => {
      const resolved = await resolve(caller);
      if (!resolved.ok || resolved.access.kind !== 'scoped') return resolved;
      return {
        ok: true,
        access:
          fault === 'principal'
            ? { ...resolved.access, principal: { id: h.userId('contributor') } }
            : {
                ...resolved.access,
                scope: { ...resolved.access.scope, userId: h.userId('contributor') },
              },
      };
    });
    const grants = spyOn(AccessDecisionRepository.prototype, 'effectiveRoleAt');
    try {
      expect(await h.call('manager', 'POST', '/api/spaces', { name: 'Denied' })).toMatchObject({
        status: 500,
      });
      expect(grants).not.toHaveBeenCalled();
      expect(h.sqlite.query('SELECT * FROM space').all()).toEqual([]);
    } finally {
      injected.mockRestore();
      grants.mockRestore();
    }
  });
}

for (const operation of ['capture', 'rename', 'delete'] as const) {
  it('rechecks package.write in the independent saved-plan ' + operation + ' writer', async () => {
    if (operation !== 'capture')
      expect(
        await h.call('manager', 'POST', '/api/projects/wp/saved-plans', { name: 'Original' }),
      ).toMatchObject({ status: 201 });
    const saved = h.sqlite.query<{ id: string }, []>('SELECT id FROM saved_plan').get();
    const before = [
      'saved_plan',
      'saved_plan_body',
      'event_log',
      'organization_audit',
      'command_journal',
    ].map((table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all());
    const revoke = () => {
      h.sqlite.run('DELETE FROM access_grant WHERE subject_id=?', [h.userId('manager')]);
      grant('manager', 'project-viewer');
    };
    const write = Reflect.get(SavedPlanRepository.prototype, 'write');
    const rename = Reflect.get(SavedPlanRepository.prototype, 'renameTo');
    const remove = Reflect.get(SavedPlanRepository.prototype, 'deleteOf');
    // Test-only generic forwarding seam changes timing, preserving every argument and outcome.
    const wrappedWrite = function (
      this: SavedPlanRepository,
      ...args: Parameters<SavedPlanRepository['write']>
    ) {
      revoke();
      return write.apply(this, args);
    } as SavedPlanRepository['write'];
    const injected =
      operation === 'capture'
        ? spyOn(SavedPlanRepository.prototype, 'write').mockImplementation(wrappedWrite)
        : operation === 'rename'
          ? spyOn(SavedPlanRepository.prototype, 'renameTo').mockImplementation(function (
              this: SavedPlanRepository,
              ...args
            ) {
              revoke();
              return rename.apply(this, args);
            })
          : spyOn(SavedPlanRepository.prototype, 'deleteOf').mockImplementation(function (
              this: SavedPlanRepository,
              ...args
            ) {
              revoke();
              return remove.apply(this, args);
            });
    const publication = spyOn(h.publicWrites().announcements, 'publish').mockResolvedValue(
      undefined,
    );
    try {
      const answer = await (async () => {
        if (operation === 'capture')
          return h.call('manager', 'POST', '/api/projects/wp/saved-plans', { name: 'Denied' });
        if (saved === null) throw Error('fixture saved plan disappeared');
        return operation === 'rename'
          ? h.call('manager', 'PATCH', '/api/saved-plans/' + saved.id, { name: 'Denied' })
          : h.call('manager', 'DELETE', '/api/saved-plans/' + saved.id);
      })();
      expect(answer).toMatchObject({
        status: 403,
        body: { error: 'forbidden', permission: 'package.write' },
      });
      expect(
        ['saved_plan', 'saved_plan_body', 'event_log', 'organization_audit', 'command_journal'].map(
          (table) => h.sqlite.query('SELECT * FROM ' + table + ' ORDER BY rowid').all(),
        ),
      ).toEqual(before);
      expect(publication).not.toHaveBeenCalled();
      expect(injected).toHaveBeenCalledTimes(1);
    } finally {
      injected.mockRestore();
      publication.mockRestore();
    }
  });
}

/** Awaits a producer rejection explicitly; Bun's matcher return type is void. */
async function rejectsWith(pending: Promise<unknown>, expected: string | RegExp): Promise<void> {
  const failure: unknown = await pending.then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('expected producer rejection is absent');
  if (typeof expected === 'string') expect(failure.message).toContain(expected);
  else expect(failure.message).toMatch(expected);
}

for (const phase of ['admission', 'command'] as const)
  it('encodes step allowance ' + phase + ' permission through the mounted route', async () => {
    const before = ['step', 'command_journal', 'event_log'].map((table) =>
      h.sqlite.query('SELECT * FROM ' + table).all(),
    );
    const denied =
      phase === 'command'
        ? spyOn(WorkItemService.prototype, 'setStepAllowance').mockResolvedValue({
            ok: false,
            reason: 'forbidden',
            permission: 'package.manage_settings',
          })
        : undefined;
    try {
      expect(
        await h.call(
          phase === 'admission' ? 'contributor' : 'manager',
          'PATCH',
          '/api/projects/wp/steps/step',
          { allowancePercent: 25 },
        ),
      ).toMatchObject({
        status: 403,
        body: { error: 'forbidden', permission: 'package.manage_settings' },
      });
      if (denied) expect(denied).toHaveBeenCalledTimes(1);
      expect(
        ['step', 'command_journal', 'event_log'].map((table) =>
          h.sqlite.query('SELECT * FROM ' + table).all(),
        ),
      ).toEqual(before);
    } finally {
      denied?.mockRestore();
    }
  });
