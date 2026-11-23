import {
  projectCreationAct,
  projectStoreConformance,
  type ProjectStoreFixture,
} from '@wbs/conformance';
import { beforeEach, describe, expect, it } from 'bun:test';

import { inMemoryProjects, type MemoryProjectTables, memoryProjectTables } from './index';
import { readMemoryPackageStepsIn } from './step-package-reads';
import { seedProjectCatalogue } from './testing/project-catalogue-fixture';
import { workPackageRow } from './work-package-fixture';

let tables: MemoryProjectTables;
beforeEach(() => {
  tables = memoryProjectTables();
  tables.users.set('creator', {
    id: 'creator',
    username: 'Creator',
    passwordHash: null,
    createdAt: 1,
  });
  for (const organization of ['org-a', 'org-b']) {
    tables.organizations.set(organization, { legacy: false });
    tables.memberships.set(organization, new Set(['creator']));
  }
});

function fixture(): ProjectStoreFixture {
  const sorted = <T extends { id: string }>(rows: Iterable<T>): T[] =>
    structuredClone([...rows].sort((first, second) => (first.id < second.id ? -1 : 1)));
  return {
    store: inMemoryProjects(tables),
    seedFirstPackageCatalogue: () =>
      seedProjectCatalogue(tables, 'org-a', {
        id: 'catalogue-research',
        code: 'research',
        name: 'Research',
        position: 30,
        defaultEstimateUnit: 'minutes',
        defaultAllowancePercent: 25,
      }),
    readPackageSteps: (workPackageId) =>
      Promise.resolve(
        readMemoryPackageStepsIn(
          tables.catalogue,
          {
            usage: { users: tables.users },
            organizations: tables.organizations,
            spaces: tables.packages.spaces,
            projects: tables.projects,
            packages: tables.workPackages,
            packageOrganization: tables.packages.owning,
            packageOwnership: tables.packages.owning,
            types: tables.workItemTypes,
            typeOrganization: tables.typeOrganizations,
          },
          workPackageId,
        ),
      ),
    snapshot: () =>
      Promise.resolve({
        projects: sorted(tables.projects.values()),
        grants: sorted(tables.grants.values()),
        audits: sorted(tables.audits.values()),
      }),
    snapshotMove() {
      return Promise.resolve(
        structuredClone({
          projects: sorted(tables.projects.values()),
          workPackages: sorted(tables.workPackages.values()),
          grants: sorted(tables.grants.values()),
          audits: sorted(tables.audits.values()),
          dependencies: sorted(tables.dependencies.rows),
        }),
      );
    },
    seedDependency(row) {
      tables.dependencies.rows.push(structuredClone(row));
      tables.dependencies.creation.set(row.id, { createdAt: 42, createdBy: 'creator' });
      return Promise.resolve();
    },
    removeCreatorMembership() {
      const members = tables.memberships.get('org-a');
      if (members === undefined) throw new Error('seeded membership state absent');
      members.delete('creator');
    },
    changeCreatorRole(kind) {
      if (kind === null) tables.roles.delete('project-manager');
      else {
        const role = tables.roles.get('project-manager');
        if (role === undefined) throw new Error('seeded creator role absent');
        tables.roles.set('project-manager', { ...role, objectKind: kind });
      }
    },
    failAt(stage) {
      tables.failAt = stage;
    },
    seedMigrated(project) {
      tables.projects.set(project.id, structuredClone(project));
    },
    seedPackage(id, projectId, name) {
      const parent = tables.projects.get(projectId);
      if (parent === undefined) throw new Error('explicit seeded package parent absent');
      tables.workPackages.set(id, workPackageRow({ id, projectId, name }));
      tables.packages.steps.set(id, []);
      tables.packages.owning.set(id, parent.organizationId);
      tables.packages.creation.creators.set(id, 'creator');
    },
    removePackage(id) {
      tables.workPackages.delete(id);
    },
    seedGrant(grant) {
      tables.grants.set(grant.id, structuredClone(grant));
    },
    seedSuperAdmin() {
      tables.grants.set('org-a-admin', {
        id: 'org-a-admin',
        organizationId: 'org-a',
        scope: { kind: 'organization' },
        subject: { kind: 'user', userId: 'creator' },
        roleId: 'org-super-admin',
        origin: 'creation',
        createdAt: 1,
        createdBy: 'creator',
      });
    },
  };
}

describe('inMemoryProjects administration', () => {
  projectStoreConformance(fixture);
});

async function seedMoveIdentity() {
  const opened = fixture();
  for (const id of ['source', 'target', 'third'])
    expect(
      await opened.store.create({ id, organizationId: 'org-a', name: id }, projectCreationAct(id)),
    ).toMatchObject({ kind: 'created' });
  opened.seedPackage('w', 'source', 'Selected');
  opened.seedPackage('neighbor', 'third', 'Counterpart');
  await opened.seedDependency({
    id: 'incident',
    workPackageId: 'neighbor',
    predecessor: { scope: 'whole', workPackageId: 'w', workItemId: 'w-leaf' },
    successor: { scope: 'whole', workPackageId: 'neighbor', workItemId: 'neighbor-leaf' },
    type: 'FS',
  });
  return opened.store;
}
async function expectStateRefusal(operation: Promise<unknown>, diagnostic: string) {
  let rejected = false;
  try {
    await operation;
  } catch (failure: unknown) {
    rejected = true;
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error))
      throw new Error('project store threw a non-Error', { cause: failure });
    expect(failure.message).toBe(diagnostic);
  }
  expect(rejected).toBe(true);
}
for (const selected of [
  'package',
  'target',
  'source',
  'counterpart',
  'counterpart-parent',
] as const)
  it('refuses memory move map identity/' + selected + ' without publishing', async () => {
    const store = await seedMoveIdentity();
    const key =
      selected === 'package'
        ? 'w'
        : selected === 'counterpart'
          ? 'neighbor'
          : selected === 'counterpart-parent'
            ? 'third'
            : selected;
    if (selected === 'package' || selected === 'counterpart') {
      const row = tables.workPackages.get(key);
      if (row === undefined) throw new Error('fixture package absent');
      tables.workPackages.set(key, { ...row, id: 'forged-package' });
    } else {
      const row = tables.projects.get(key);
      if (row === undefined) throw new Error('fixture project absent');
      // The target's forged source identity is the concrete false no-op reported by review.
      tables.projects.set(key, { ...row, id: selected === 'target' ? 'source' : 'target' });
    }
    const before = structuredClone(tables);
    await expectStateRefusal(
      store.moveWorkPackage('org-a', 'w', 'target', {
        actor: { kind: 'user', userId: 'creator' },
        at: 75,
        auditId: 'move',
      }),
      selected === 'package' || selected === 'counterpart'
        ? 'stored work package identity differs from key'
        : 'stored project identity differs from key',
    );
    expect(tables).toEqual(before);
  });
for (const selected of [
  'source-parent-missing',
  'source-parent-empty',
  'selected-mapping-missing',
  'selected-mapping-empty',
  'counterpart-parent-missing',
  'counterpart-parent-empty',
  'counterpart-mapping-missing',
  'counterpart-mapping-foreign',
] as const)
  it('refuses memory move trusted state/' + selected + ' without publishing', async () => {
    const store = await seedMoveIdentity();
    const key = selected.startsWith('source') || selected.startsWith('selected') ? 'w' : 'neighbor';
    let diagnostic: string;
    if (selected.endsWith('parent-missing')) {
      tables.projects.delete(key === 'w' ? 'source' : 'third');
      diagnostic = 'stored work package parent is absent';
    } else if (selected.endsWith('parent-empty')) {
      const row = tables.workPackages.get(key);
      if (row === undefined) throw new Error('fixture package absent');
      tables.workPackages.set(key, { ...row, projectId: '' });
      diagnostic = 'stored work package parent is malformed';
    } else if (selected === 'selected-mapping-missing') {
      tables.packages.owning.delete(key);
      diagnostic = 'stored work package organization is absent';
    } else if (selected === 'selected-mapping-empty') {
      tables.packages.owning.set(key, '');
      diagnostic = 'stored work package organization is malformed';
    } else {
      if (selected.endsWith('missing')) tables.packages.owning.delete(key);
      else tables.packages.owning.set(key, 'org-b');
      diagnostic = 'incident work package organization differs';
    }
    const before = structuredClone(tables);
    await expectStateRefusal(
      store.moveWorkPackage('org-a', 'w', 'target', {
        actor: { kind: 'user', userId: 'creator' },
        at: 75,
        auditId: 'move',
      }),
      diagnostic,
    );
    expect(tables).toEqual(before);
  });

for (const operation of ['rename', 'delete'] as const) {
  for (const [kind, revision] of [
    ['negative', -1],
    ['null', null],
    ['rounded-fraction', Number.EPSILON / 4],
    ['fraction', 1.5],
    ['not-a-number', Number.NaN],
    ['missing', undefined],
    ['numeric-text', '0'],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ] as const) {
    it(`rejects memory project ${operation} with ${kind} revision before any publication`, async () => {
      const opened = fixture();
      opened.seedSuperAdmin();
      const born = await opened.store.create(
        { id: 'revision-project', organizationId: 'org-a', name: 'Original' },
        projectCreationAct('revision-project'),
      );
      expect(born).toMatchObject({ kind: 'created' });
      const project = tables.projects.get('revision-project');
      if (project === undefined) throw new Error('created revision project is absent');
      Reflect.set(project, 'revision', revision);
      const before = structuredClone(tables);
      const act = {
        actor: { kind: 'user' as const, userId: 'creator' },
        at: 90,
        auditId: 'revision-edit',
      };
      const pending =
        operation === 'rename'
          ? opened.store.rename('org-a', 'revision-project', 'Renamed', act)
          : opened.store.delete('org-a', 'revision-project', act);
      await expectStateRefusal(pending, 'stored project revision is malformed');
      expect(tables).toEqual(before);
    });
  }
}

for (const outcome of ['name-conflict', 'not-empty'] as const) {
  it(`does not hide an invalid memory project revision behind ${outcome}`, async () => {
    const opened = fixture();
    opened.seedSuperAdmin();
    for (const id of ['revision-project', 'Taken']) {
      expect(
        await opened.store.create(
          { id, organizationId: 'org-a', name: id },
          projectCreationAct(id),
        ),
      ).toMatchObject({ kind: 'created' });
    }
    if (outcome === 'not-empty') opened.seedPackage('revision-child', 'revision-project', 'Child');
    const project = tables.projects.get('revision-project');
    if (project === undefined) throw new Error('created revision project is absent');
    Reflect.set(project, 'revision', -1);
    const before = structuredClone(tables);
    const act = {
      actor: { kind: 'user' as const, userId: 'creator' },
      at: 90,
      auditId: 'revision-edit',
    };
    await expectStateRefusal(
      outcome === 'name-conflict'
        ? opened.store.rename('org-a', 'revision-project', 'Taken', act)
        : opened.store.delete('org-a', 'revision-project', act),
      'stored project revision is malformed',
    );
    expect(tables).toEqual(before);
  });
}

for (const revision of [0, Number.MAX_SAFE_INTEGER - 1]) {
  it(`preserves valid memory project revision boundary ${String(revision)}`, async () => {
    const opened = fixture();
    opened.seedSuperAdmin();
    expect(
      await opened.store.create(
        { id: 'revision-project', organizationId: 'org-a', name: 'Original' },
        projectCreationAct('revision-project'),
      ),
    ).toMatchObject({ kind: 'created' });
    const project = tables.projects.get('revision-project');
    if (project === undefined) throw new Error('created revision project is absent');
    Reflect.set(project, 'revision', revision);
    const act = {
      actor: { kind: 'user' as const, userId: 'creator' },
      at: 90,
      auditId: 'revision-edit',
    };
    expect(await opened.store.rename('org-a', 'revision-project', 'Renamed', act)).toMatchObject({
      kind: 'renamed',
      project: { revision: revision + 1 },
    });
  });
}
