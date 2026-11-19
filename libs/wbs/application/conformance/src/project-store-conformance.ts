import type {
  AccessGrantRecord,
  OrganizationAuditRecord,
  Project,
  ProjectCreationAct,
  ProjectDraft,
  ProjectStore,
  StoredTypedDependency,
  WorkPackage,
} from '@wbs/core';
import { expect, it } from 'bun:test';

export type ProjectWriteStage =
  | 'project'
  | 'grant'
  | 'project_audit'
  | 'grant_audit'
  | 'rename'
  | 'rename_audit'
  | 'delete_grants'
  | 'revoke_audit'
  | 'delete_project'
  | 'delete_audit'
  | 'move_package'
  | 'move_source'
  | 'move_target'
  | 'move_audit';

/** Explicit fixture state and constituent-write faults, shared by real SQLite and memory. */
export interface ProjectStoreFixture {
  store: ProjectStore;
  snapshot(): Promise<{
    projects: readonly Project[];
    grants: readonly AccessGrantRecord[];
    audits: readonly OrganizationAuditRecord[];
  }>;
  snapshotMove(): Promise<{
    projects: readonly Project[];
    workPackages: readonly WorkPackage[];
    grants: readonly AccessGrantRecord[];
    audits: readonly OrganizationAuditRecord[];
    dependencies: readonly StoredTypedDependency[];
  }>;
  seedDependency(row: StoredTypedDependency): Promise<void>;
  removeCreatorMembership(): void;
  changeCreatorRole(kind: 'organization' | null): void;
  failAt(stage: ProjectWriteStage): void;
  seedMigrated(project: Project): void;
  seedPackage(id: string, projectId: string, name: string): void;
  removePackage(id: string): void;
  seedGrant(grant: AccessGrantRecord): void;
  seedSuperAdmin(): void;
}

export function projectCreationAct(projectId: string): ProjectCreationAct {
  return {
    actor: { kind: 'user', userId: 'creator' },
    at: 42,
    grantId: projectId + '-grant',
    projectAuditId: projectId + '-created',
    grantAuditId: projectId + '-granted',
  };
}

async function nativeFailure(pending: Promise<unknown>): Promise<Error> {
  let failure: unknown;
  try {
    await pending;
  } catch (cause: unknown) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  while (failure instanceof Error && failure.cause !== undefined) {
    expect(failure).not.toBeInstanceOf(AggregateError);
    failure = failure.cause;
  }
  if (!(failure instanceof Error)) throw new Error('native constituent-write refusal absent');
  return failure;
}

async function expectWriteFailure(pending: Promise<unknown>, diagnostic: string): Promise<void> {
  expect((await nativeFailure(pending)).message).toContain(diagnostic);
}

export function projectStoreConformance(open: () => ProjectStoreFixture): void {
  const draft = (id: string, name = 'Alpha', organizationId = 'org-a'): ProjectDraft => ({
    id,
    organizationId,
    name,
  });

  it('creates the actual first work package with both scoped user grants and three audit records', async () => {
    const fixture = open();
    const birth = {
      workPackage: {
        id: 'combined-w',
        projectId: 'combined',
        name: 'First',
        restricted: false,
        estimateMethod: 'pert' as const,
        depReach: 'whole-item' as const,
        pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
        estimateRounding: 'ceil' as const,
        startDate: null,
        solutionRef: null,
        revision: 0,
        createdAt: 42,
      },
      steps: [
        {
          id: 'combined-s',
          workPackageId: 'combined-w',
          name: 'Research',
          position: 10,
          code: 'RES',
          allowancePercent: 0,
          estimateUnit: 'workdays' as const,
        },
      ],
      creatorGrant: { id: 'combined-w-grant', auditId: 'combined-w-audit' },
    };
    expect(
      await fixture.store.create(draft('combined'), projectCreationAct('combined'), birth),
    ).toMatchObject({
      kind: 'created_with_work_package',
      project: { workPackageCount: 1 },
      workPackage: { id: 'combined-w', projectId: 'combined' },
      steps: [{ name: 'Research' }],
    });
    expect(await fixture.store.findIn('org-a', 'combined')).toMatchObject({
      workPackageCount: 1,
      workPackages: [{ id: 'combined-w', name: 'First' }],
    });
    const snapshot = await fixture.snapshot();
    expect(
      snapshot.grants
        .map((grant) => [grant.roleId, grant.scope.kind, grant.subject, grant.origin])
        .sort(),
    ).toEqual([
      ['package-manager', 'work_package', { kind: 'user', userId: 'creator' }, 'creation'],
      ['project-manager', 'project', { kind: 'user', userId: 'creator' }, 'creation'],
    ]);
    expect(snapshot.audits).toHaveLength(3);
    expect(snapshot.audits.filter((audit) => audit.action === 'access_granted')).toHaveLength(2);
  });
  it('derives an empty project summary and complete empty detail from actual child state', async () => {
    const fixture = open();
    expect(await fixture.store.create(draft('p'), projectCreationAct('p'))).toMatchObject({
      kind: 'created',
      project: { workPackageCount: 0 },
    });
    expect(await fixture.store.listIn('org-a')).toMatchObject([{ id: 'p', workPackageCount: 0 }]);
    expect(await fixture.store.findIn('org-a', 'p')).toMatchObject({
      id: 'p',
      workPackageCount: 0,
      workPackages: [],
    });
  });

  it('creates, finds and lists only within the addressed organization with actual grant and two audit identities', async () => {
    const fixture = open(),
      act = projectCreationAct('p');
    const expected: Project = {
      spaceId: null,
      spacePosition: null,
      id: 'p',
      organizationId: 'org-a',
      name: 'Alpha',
      revision: 0,
      createdAt: 42,
      updatedAt: 42,
      createdBy: 'creator',
    };
    expect(await fixture.store.create(draft('p'), act)).toEqual({
      kind: 'created',
      project: { ...expected, workPackageCount: 0 },
    });
    expect(await fixture.store.findIn('org-a', 'p')).toEqual({
      ...expected,
      workPackageCount: 0,
      workPackages: [],
    });
    expect(await fixture.store.findIn('org-b', 'p')).toBeNull();
    expect(await fixture.store.findIn('org-a', 'absent')).toBeNull();
    expect(await fixture.store.listIn('org-b')).toEqual([]);
    const snapshot = await fixture.snapshot();
    expect(snapshot.projects).toEqual([expected]);
    expect(snapshot.grants).toEqual([
      {
        id: 'p-grant',
        organizationId: 'org-a',
        scope: { kind: 'project', projectId: 'p' },
        subject: { kind: 'user', userId: 'creator' },
        roleId: 'project-manager',
        origin: 'creation',
        createdAt: 42,
        createdBy: 'creator',
      },
    ]);
    expect(snapshot.audits).toEqual([
      {
        id: 'p-created',
        organizationId: 'org-a',
        actorId: 'creator',
        action: 'project_created',
        subjectKind: 'project',
        subjectId: 'p',
        detail: {},
        createdAt: 42,
      },
      {
        id: 'p-granted',
        organizationId: 'org-a',
        actorId: 'creator',
        action: 'access_granted',
        subjectKind: 'access_grant',
        subjectId: 'p-grant',
        detail: {
          roleId: 'project-manager',
          scopeKind: 'project',
          scopeId: 'p',
          subjectKind: 'user',
          subjectId: 'creator',
          origin: 'creation',
        },
        createdAt: 42,
      },
    ]);
  });

  it('models only exact organization/name collisions and permits the same name elsewhere', async () => {
    const fixture = open();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    const before = await fixture.snapshot();
    expect(await fixture.store.create(draft('duplicate'), projectCreationAct('duplicate'))).toBe(
      'name_taken',
    );
    expect(await fixture.snapshot()).toEqual(before);
    expect(
      await fixture.store.create(draft('other', 'Alpha', 'org-b'), projectCreationAct('other')),
    ).toMatchObject({ kind: 'created' });
    await fixture.store.create(draft('earlier', 'Aardvark'), projectCreationAct('earlier'));
    expect((await fixture.store.listIn('org-a')).map(({ id }) => id)).toEqual(['earlier', 'p']);
    expect((await fixture.store.listIn('org-b')).map(({ id }) => id)).toEqual(['other']);
  });

  it('reads a migrated null creator without inventing an actor', async () => {
    const fixture = open();
    const migrated: Project = {
      spaceId: null,
      spacePosition: null,
      id: 'migrated',
      organizationId: 'org-a',
      name: 'Migrated work packages',
      revision: 0,
      createdAt: 1,
      updatedAt: null,
      createdBy: null,
    };
    fixture.seedMigrated(migrated);
    expect(await fixture.store.findIn('org-a', 'migrated')).toEqual({
      ...migrated,
      workPackageCount: 0,
      workPackages: [],
    });
    expect(await fixture.store.listIn('org-a')).toEqual([{ ...migrated, workPackageCount: 0 }]);
  });

  it('retains the draft and complete actor/event act before the queued owner', async () => {
    const fixture = open();
    const requested = { id: 'p', organizationId: 'org-a', name: 'Alpha' };
    const act = {
      actor: { kind: 'user' as const, userId: 'creator' },
      at: 42,
      grantId: 'p-grant',
      projectAuditId: 'p-created',
      grantAuditId: 'p-granted',
    };
    const pending = fixture.store.create(requested, act);
    requested.id = 'changed';
    requested.organizationId = 'org-b';
    requested.name = 'Changed';
    act.actor.userId = 'absent';
    act.at = 999;
    act.grantId = 'changed-grant';
    act.projectAuditId = 'changed-created';
    act.grantAuditId = 'changed-granted';
    expect(await pending).toMatchObject({
      kind: 'created',
      project: {
        id: 'p',
        organizationId: 'org-a',
        name: 'Alpha',
        createdBy: 'creator',
        createdAt: 42,
      },
    });
    const snapshot = await fixture.snapshot();
    expect(snapshot.grants[0]).toMatchObject({
      id: 'p-grant',
      createdAt: 42,
      createdBy: 'creator',
    });
    expect(snapshot.audits.map(({ id }) => id)).toEqual(['p-created', 'p-granted']);
  });

  for (const stage of ['project', 'grant', 'project_audit', 'grant_audit'] as const)
    it('rolls back every constituent when the ' + stage + ' write fails', async () => {
      const fixture = open();
      fixture.failAt(stage);
      const before = await fixture.snapshot();
      await expectWriteFailure(
        fixture.store.create(draft('p'), projectCreationAct('p')),
        'controlled ' + stage + ' write failure',
      );
      expect(await fixture.snapshot()).toEqual(before);
    });

  it('rolls back a typed creator membership refusal after inserting the project', async () => {
    const fixture = open();
    fixture.removeCreatorMembership();
    const before = await fixture.snapshot();
    expect(await fixture.store.create(draft('p'), projectCreationAct('p'))).toBe('not_a_member');
    expect(await fixture.snapshot()).toEqual(before);
  });

  for (const [kind, refusal] of [
    [null, 'unknown_role'],
    ['organization', 'role_scope_mismatch'],
  ] as const)
    it('rolls back the project when its actual creator role is ' + refusal, async () => {
      const fixture = open();
      fixture.changeCreatorRole(kind);
      const before = await fixture.snapshot();
      expect(await fixture.store.create(draft('p'), projectCreationAct('p'))).toBe(refusal);
      expect(await fixture.snapshot()).toEqual(before);
    });

  it('propagates unrelated duplicate project identity without changing any state', async () => {
    const fixture = open();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    const before = await fixture.snapshot();
    await nativeFailure(
      fixture.store.create(draft('p', 'Different'), projectCreationAct('another-act')),
    );
    expect(await fixture.snapshot()).toEqual(before);
  });

  it('requires distinct explicit project/grant/event identities and an explicit instant before writing', async () => {
    const fixture = open();
    const before = await fixture.snapshot();
    await expectWriteFailure(
      fixture.store.create(draft('p'), { ...projectCreationAct('p'), grantAuditId: 'p-created' }),
      'present and distinct',
    );
    await expectWriteFailure(
      fixture.store.create(draft('p'), { ...projectCreationAct('p'), at: Number.NaN }),
      'instant',
    );
    expect(await fixture.snapshot()).toEqual(before);
  });

  it('uses the same binary name ordering for Unicode projects on both stores', async () => {
    const fixture = open();
    for (const [id, name] of [
      ['supplementary', '\u{10000}'],
      ['private-use', '\uE000'],
      ['accented', 'é'],
    ])
      await fixture.store.create(draft(id, name), projectCreationAct(id));
    expect((await fixture.store.listIn('org-a')).map(({ id }) => id)).toEqual([
      'accented',
      'private-use',
      'supplementary',
    ]);
  });

  it('requires a real user actor and refuses absent user/organization references without partial state', async () => {
    const fixture = open(),
      before = await fixture.snapshot(),
      operator = projectCreationAct('operator');
    Object.assign(operator.actor, { kind: 'operator', login: 'host' });
    await expectWriteFailure(fixture.store.create(draft('operator'), operator), 'real user actor');
    await nativeFailure(
      fixture.store.create(draft('absent-user'), {
        ...projectCreationAct('absent-user'),
        actor: { kind: 'user', userId: 'absent' },
      }),
    );
    await nativeFailure(
      fixture.store.create(
        draft('absent-org', 'Alpha', 'absent'),
        projectCreationAct('absent-org'),
      ),
    );
    expect(await fixture.snapshot()).toEqual(before);
  });

  it('serializes simultaneous duplicate-name creates with exactly one grant and two audits', async () => {
    const fixture = open();
    const outcomes = await Promise.all([
      fixture.store.create(draft('first'), projectCreationAct('first')),
      fixture.store.create(draft('second'), projectCreationAct('second')),
    ]);
    expect(outcomes[0]).toMatchObject({ kind: 'created' });
    expect(outcomes[1]).toBe('name_taken');
    const snapshot = await fixture.snapshot();
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.grants).toHaveLength(1);
    expect(snapshot.audits).toHaveLength(2);
  });

  const editAct = (auditId: string) => ({
    actor: { kind: 'user' as const, userId: 'creator' },
    at: 75,
    auditId,
  });

  it('rolls back nonlowering project deletion when no direct current built-in user super-admin remains', async () => {
    const fixture = open();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    const before = await fixture.snapshot();
    expect(await fixture.store.delete('org-a', 'p', editAct('delete'))).toBe('last_super_admin');
    expect(await fixture.snapshot()).toEqual(before);
  });

  it('requires a current direct user holder even for a zero-grant project cascade', async () => {
    const fixture = open();
    fixture.seedMigrated({
      spaceId: null,
      spacePosition: null,
      id: 'p',
      organizationId: 'org-a',
      name: 'Empty',
      revision: 0,
      createdAt: 1,
      updatedAt: null,
      createdBy: null,
    });
    fixture.seedGrant({
      id: 'members-admin',
      organizationId: 'org-a',
      scope: { kind: 'organization' },
      subject: { kind: 'organization_members' },
      roleId: 'org-super-admin',
      origin: 'route',
      createdAt: 1,
      createdBy: 'creator',
    });
    const before = await fixture.snapshot();
    expect(await fixture.store.delete('org-a', 'p', editAct('delete'))).toBe('last_super_admin');
    expect(await fixture.snapshot()).toEqual(before);
    fixture.seedSuperAdmin();
    fixture.removeCreatorMembership();
    const former = await fixture.snapshot();
    expect(await fixture.store.delete('org-a', 'p', editAct('former-delete'))).toBe(
      'last_super_admin',
    );
    expect(await fixture.snapshot()).toEqual(former);
  });

  it('reads actual sorted child entries and counts without leaking other project or organization children', async () => {
    const fixture = open();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    await fixture.store.create(draft('other', 'Other'), projectCreationAct('other'));
    await fixture.store.create(draft('foreign', 'Foreign', 'org-b'), projectCreationAct('foreign'));
    fixture.seedPackage('z', 'p', 'Last');
    fixture.seedPackage('a', 'p', 'First');
    fixture.seedPackage('other-child', 'other', 'Other');
    fixture.seedPackage('foreign-child', 'foreign', 'Foreign');
    expect(await fixture.store.findIn('org-a', 'p')).toMatchObject({
      workPackageCount: 2,
      workPackages: [
        { id: 'a', name: 'First' },
        { id: 'z', name: 'Last' },
      ],
    });
    expect(
      (await fixture.store.listIn('org-a')).map(({ id, workPackageCount }) => ({
        id,
        workPackageCount,
      })),
    ).toEqual([
      { id: 'p', workPackageCount: 2 },
      { id: 'other', workPackageCount: 1 },
    ]);
    expect(await fixture.store.findIn('org-b', 'p')).toBeNull();
    fixture.removePackage('a');
    expect(await fixture.store.findIn('org-a', 'p')).toMatchObject({
      workPackageCount: 1,
      workPackages: [{ id: 'z', name: 'Last' }],
    });
    const detached = await fixture.store.findIn('org-a', 'p');
    if (detached === null) throw new Error('created project absent');
    Object.assign(detached.workPackages[0], { name: 'Changed' });
    expect(await fixture.store.findIn('org-a', 'p')).toMatchObject({
      workPackages: [{ name: 'Last' }],
    });
  });

  it('renames inside one owner, updates revision and stamp, audits same-name accepted writes, and preserves child counts', async () => {
    const fixture = open();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    fixture.seedPackage('child', 'p', 'Child');
    expect(await fixture.store.rename('org-a', 'p', 'Beta', editAct('rename'))).toMatchObject({
      kind: 'renamed',
      project: {
        id: 'p',
        name: 'Beta',
        revision: 1,
        createdAt: 42,
        createdBy: 'creator',
        updatedAt: 75,
        workPackageCount: 1,
      },
    });
    expect(await fixture.store.rename('org-a', 'p', 'Beta', editAct('same-name'))).toMatchObject({
      kind: 'renamed',
      project: { revision: 2 },
    });
    const snapshot = await fixture.snapshot();
    expect(snapshot.audits.filter(({ action }) => action === 'project_renamed')).toEqual([
      {
        id: 'rename',
        organizationId: 'org-a',
        actorId: 'creator',
        action: 'project_renamed',
        subjectKind: 'project',
        subjectId: 'p',
        detail: { revision: 1 },
        createdAt: 75,
      },
      {
        id: 'same-name',
        organizationId: 'org-a',
        actorId: 'creator',
        action: 'project_renamed',
        subjectKind: 'project',
        subjectId: 'p',
        detail: { revision: 2 },
        createdAt: 75,
      },
    ]);
  });

  it('refuses exact rename conflicts and makes foreign and absent mutation targets alike with no writes', async () => {
    const fixture = open();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    await fixture.store.create(draft('q', 'Taken'), projectCreationAct('q'));
    const before = await fixture.snapshot();
    expect(await fixture.store.rename('org-a', 'p', 'Taken', editAct('clash'))).toBe('name_taken');
    for (const [org, id] of [
      ['org-b', 'p'],
      ['org-a', 'missing'],
    ]) {
      expect(await fixture.store.rename(org, id, 'Renamed', editAct('missing-rename'))).toBe(
        'not_found',
      );
      expect(await fixture.store.delete(org, id, editAct('missing-delete'))).toBe('not_found');
    }
    expect(await fixture.snapshot()).toEqual(before);
  });

  it('refuses populated project deletion with exact sorted child IDs and no mutation', async () => {
    const fixture = open();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    fixture.seedPackage('z', 'p', 'Last');
    fixture.seedPackage('a', 'p', 'First');
    const before = await fixture.snapshot();
    expect(await fixture.store.delete('org-a', 'p', editAct('delete'))).toEqual({
      kind: 'not_empty',
      workPackageIds: ['a', 'z'],
    });
    expect(await fixture.snapshot()).toEqual(before);
    expect(await fixture.store.findIn('org-a', 'p')).toMatchObject({ workPackageCount: 2 });
  });

  it('deletes the only empty project and audits all its direct grants while preserving unrelated authority and preventing ID-reuse resurrection', async () => {
    const fixture = open();
    fixture.seedSuperAdmin();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    await fixture.store.create(draft('foreign', 'Foreign', 'org-b'), projectCreationAct('foreign'));
    const base: AccessGrantRecord = {
      id: 'extra',
      organizationId: 'org-a',
      scope: { kind: 'project', projectId: 'p' },
      subject: { kind: 'organization_members' },
      roleId: 'project-manager',
      origin: 'route',
      createdAt: 10,
      createdBy: 'creator',
    };
    fixture.seedGrant(base);
    fixture.seedGrant({
      ...base,
      id: 'org-grant',
      scope: { kind: 'organization' },
      roleId: 'org-admin',
    });
    expect(await fixture.store.delete('org-a', 'p', editAct('deleted'))).toEqual({
      kind: 'deleted',
    });
    expect(await fixture.store.findIn('org-a', 'p')).toBeNull();
    expect(await fixture.store.listIn('org-a')).toEqual([]);
    const snapshot = await fixture.snapshot();
    expect(snapshot.grants.map(({ id }) => id)).toEqual([
      'foreign-grant',
      'org-a-admin',
      'org-grant',
    ]);
    const revokes = snapshot.audits.filter(({ action }) => action === 'access_revoked');
    expect(revokes).toHaveLength(2);
    expect(revokes.map(({ subjectId }) => subjectId).sort()).toEqual(['extra', 'p-grant']);
    for (const audit of revokes)
      expect(audit).toMatchObject({
        organizationId: 'org-a',
        actorId: 'creator',
        createdAt: 75,
        detail: { scopeKind: 'project', scopeId: 'p', origin: 'cascade' },
      });
    expect(new Set(revokes.map(({ id }) => id)).size).toBe(2);
    expect(revokes.find(({ subjectId }) => subjectId === 'extra')?.detail).toEqual({
      roleId: 'project-manager',
      scopeKind: 'project',
      scopeId: 'p',
      subjectKind: 'organization_members',
      subjectId: 'org-a',
      origin: 'cascade',
    });
    expect(revokes.find(({ subjectId }) => subjectId === 'p-grant')?.detail).toEqual({
      roleId: 'project-manager',
      scopeKind: 'project',
      scopeId: 'p',
      subjectKind: 'user',
      subjectId: 'creator',
      origin: 'cascade',
    });
    expect(snapshot.audits.find(({ id }) => id === 'deleted')).toMatchObject({
      action: 'project_deleted',
      subjectKind: 'project',
      subjectId: 'p',
      detail: { removedGrantCount: 2, revision: 1 },
    });
    await fixture.store.create(draft('p', 'Reused'), projectCreationAct('reuse'));
    expect((await fixture.snapshot()).grants.map(({ id }) => id)).toEqual([
      'foreign-grant',
      'org-a-admin',
      'org-grant',
      'reuse-grant',
    ]);
  });

  for (const stage of [
    'rename',
    'rename_audit',
    'delete_grants',
    'revoke_audit',
    'delete_project',
    'delete_audit',
  ] as const)
    it('rolls back project administration at ' + stage, async () => {
      const fixture = open();
      fixture.seedSuperAdmin();
      await fixture.store.create(draft('p'), projectCreationAct('p'));
      fixture.failAt(stage);
      const before = await fixture.snapshot();
      const pending = stage.startsWith('rename')
        ? fixture.store.rename('org-a', 'p', 'Beta', editAct('edit'))
        : fixture.store.delete('org-a', 'p', editAct('edit'));
      await expectWriteFailure(pending, 'controlled ' + stage + ' write failure');
      expect(await fixture.snapshot()).toEqual(before);
    });

  it('retains rename/delete acts before queueing and recovers the owner after an audit collision', async () => {
    const fixture = open();
    fixture.seedSuperAdmin();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    const act = editAct('rename');
    const pending = fixture.store.rename('org-a', 'p', 'Beta', act);
    act.actor.userId = 'absent';
    act.at = 999;
    act.auditId = 'changed';
    expect(await pending).toMatchObject({ kind: 'renamed', project: { updatedAt: 75 } });
    expect((await fixture.snapshot()).audits.find(({ id }) => id === 'rename')).toMatchObject({
      actorId: 'creator',
      createdAt: 75,
    });
    fixture.seedGrant({
      id: 'extra',
      organizationId: 'org-a',
      scope: { kind: 'project', projectId: 'p' },
      subject: { kind: 'organization_members' },
      roleId: 'project-manager',
      origin: 'route',
      createdAt: 10,
      createdBy: 'creator',
    });
    const before = await fixture.snapshot();
    await nativeFailure(fixture.store.delete('org-a', 'p', editAct('p-created')));
    expect(await fixture.snapshot()).toEqual(before);
    const deletion = editAct('deleted');
    const removing = fixture.store.delete('org-a', 'p', deletion);
    deletion.actor.userId = 'absent';
    deletion.at = 999;
    deletion.auditId = 'changed-delete';
    expect(await removing).toEqual({ kind: 'deleted' });
    expect((await fixture.snapshot()).audits.find(({ id }) => id === 'deleted')).toMatchObject({
      actorId: 'creator',
      createdAt: 75,
    });
    const cascade = (await fixture.snapshot()).audits.filter(
      ({ action }) => action === 'access_revoked',
    );
    expect(cascade).toHaveLength(2);
    for (const audit of cascade)
      expect(audit).toMatchObject({
        actorId: 'creator',
        createdAt: 75,
        detail: { origin: 'cascade' },
      });
  });

  it('preserves same-organization other-project and package grants during empty-project deletion', async () => {
    const fixture = open();
    fixture.seedSuperAdmin();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    await fixture.store.create(draft('q', 'Other'), projectCreationAct('q'));
    fixture.seedPackage('child', 'q', 'Child');
    fixture.seedGrant({
      id: 'package-grant',
      organizationId: 'org-a',
      scope: { kind: 'work_package', workPackageId: 'child' },
      subject: { kind: 'user', userId: 'creator' },
      roleId: 'package-manager',
      origin: 'route',
      createdAt: 10,
      createdBy: 'creator',
    });
    const before = await fixture.snapshot();
    expect(await fixture.store.delete('org-a', 'p', editAct('deleted'))).toEqual({
      kind: 'deleted',
    });
    expect((await fixture.snapshot()).grants).toEqual(
      before.grants.filter(({ id }) => id !== 'p-grant'),
    );
    expect(await fixture.store.findIn('org-a', 'q')).toMatchObject({
      workPackageCount: 1,
      workPackages: [{ id: 'child', name: 'Child' }],
    });
  });

  it('rejects malformed administration acts and empty rename input before changing state', async () => {
    const fixture = open();
    await fixture.store.create(draft('p'), projectCreationAct('p'));
    const before = await fixture.snapshot();
    await expectWriteFailure(
      fixture.store.rename('org-a', 'p', '', editAct('empty')),
      'name must be present',
    );
    for (const operation of ['rename', 'delete'] as const) {
      const invoke = (org: string, id: string, act: ReturnType<typeof editAct>) =>
        operation === 'rename'
          ? fixture.store.rename(org, id, 'Beta', act)
          : fixture.store.delete(org, id, act);
      await expectWriteFailure(invoke('', 'p', editAct('org')), 'identity must be present');
      await expectWriteFailure(invoke('org-a', '', editAct('id')), 'identity must be present');
      await expectWriteFailure(
        invoke('org-a', 'p', { ...editAct('at'), at: Number.NaN }),
        'instant',
      );
      await expectWriteFailure(invoke('org-a', 'p', { ...editAct('audit'), auditId: '' }), 'audit');
      const operator = editAct('operator');
      Object.assign(operator.actor, { kind: 'operator', login: 'host' });
      await expectWriteFailure(invoke('org-a', 'p', operator), 'real user actor');
    }
    expect(await fixture.snapshot()).toEqual(before);
  });

  it('refuses revision overflow without deleting authority or writing an audit', async () => {
    const fixture = open();
    fixture.seedMigrated({
      spaceId: null,
      spacePosition: null,
      id: 'p',
      organizationId: 'org-a',
      name: 'Max',
      revision: Number.MAX_SAFE_INTEGER,
      createdAt: 1,
      updatedAt: null,
      createdBy: null,
    });
    const before = await fixture.snapshot();
    await expectWriteFailure(
      fixture.store.rename('org-a', 'p', 'Beta', editAct('rename')),
      'revision overflow',
    );
    await expectWriteFailure(
      fixture.store.delete('org-a', 'p', editAct('delete')),
      'revision overflow',
    );
    expect(await fixture.snapshot()).toEqual(before);
  });
  const moveAct = () => ({
    actor: { kind: 'user' as const, userId: 'creator' },
    at: 75,
    auditId: 'move-audit',
  });
  async function moveFixture() {
    const fixture = open();
    for (const id of ['move-source', 'move-target', 'move-third']) {
      expect(await fixture.store.create(draft(id, id), projectCreationAct(id))).toMatchObject({
        kind: 'created',
      });
    }
    expect(
      await fixture.store.create(
        draft('move-foreign', 'Foreign', 'org-b'),
        projectCreationAct('move-foreign'),
      ),
    ).toMatchObject({ kind: 'created' });
    fixture.seedPackage('move-w', 'move-source', 'First');
    fixture.seedPackage('move-neighbor', 'move-source', 'Neighbor');
    fixture.seedPackage('move-destination', 'move-target', 'Destination');
    fixture.seedGrant({
      id: 'move-direct',
      organizationId: 'org-a',
      scope: { kind: 'work_package', workPackageId: 'move-w' },
      subject: { kind: 'user', userId: 'creator' },
      roleId: 'package-manager',
      origin: 'creation',
      createdAt: 42,
      createdBy: 'creator',
    });
    return fixture;
  }
  const moveEdge = (id: string, predecessor: string, successor: string): StoredTypedDependency => ({
    id,
    workPackageId: successor,
    predecessor: { scope: 'whole', workPackageId: predecessor, workItemId: predecessor + '-leaf' },
    successor: { scope: 'whole', workPackageId: successor, workItemId: successor + '-leaf' },
    type: 'FS',
  });
  it('moves a real package with each actual parent revision and one exact destination audit', async () => {
    const fixture = await moveFixture(),
      before = await fixture.snapshotMove();
    expect(
      await fixture.store.moveWorkPackage('org-a', 'move-w', 'move-target', moveAct()),
    ).toEqual({
      kind: 'moved',
      workPackageId: 'move-w',
      projectId: 'move-target',
      revision: 1,
      sourceProject: { id: 'move-source', revision: 1 },
      targetProject: { id: 'move-target', revision: 1 },
    });
    const after = await fixture.snapshotMove();
    const original = before.workPackages.find((row) => row.id === 'move-w');
    if (original === undefined) throw Error('fixture package missing');
    expect(after.workPackages.find((row) => row.id === 'move-w')).toEqual({
      ...original,
      projectId: 'move-target',
      revision: 1,
    });
    expect(after.grants).toEqual(before.grants);
    expect(after.dependencies).toEqual(before.dependencies);
    expect(after.audits.filter((row) => row.id === 'move-audit')).toEqual([
      {
        id: 'move-audit',
        organizationId: 'org-a',
        actorId: 'creator',
        action: 'work_package_moved',
        subjectKind: 'project',
        subjectId: 'move-target',
        detail: {
          workPackageId: 'move-w',
          fromProjectId: 'move-source',
          toProjectId: 'move-target',
          workPackageRevision: 1,
          sourceProjectRevision: 1,
          targetProjectRevision: 1,
        },
        createdAt: 75,
      },
    ]);
    expect((await fixture.store.findIn('org-a', 'move-source'))?.workPackageCount).toBe(1);
    expect((await fixture.store.findIn('org-a', 'move-target'))?.workPackages).toEqual([
      { id: 'move-destination', name: 'Destination' },
      { id: 'move-w', name: 'First' },
    ]);
  });
  it('returns an unchanged no-op with all actual maps and audits unchanged', async () => {
    const fixture = await moveFixture(),
      before = await fixture.snapshotMove();
    expect(
      await fixture.store.moveWorkPackage('org-a', 'move-w', 'move-source', moveAct()),
    ).toEqual({
      kind: 'unchanged',
      workPackageId: 'move-w',
      projectId: 'move-source',
      revision: 0,
      sourceProject: { id: 'move-source', revision: 0 },
      targetProject: { id: 'move-source', revision: 0 },
    });
    expect(await fixture.snapshotMove()).toEqual(before);
  });
  for (const [id, target, refusal] of [
    ['missing', 'move-target', 'not_found'],
    ['move-w', 'missing', 'not_found'],
    ['move-w', 'move-foreign', 'cross_organization'],
  ] as const)
    it('keeps state after direct move ' + refusal + '/' + target, async () => {
      const fixture = await moveFixture(),
        before = await fixture.snapshotMove();
      expect(await fixture.store.moveWorkPackage('org-a', id, target, moveAct())).toBe(refusal);
      expect(await fixture.snapshotMove()).toEqual(before);
    });
  for (const direction of ['incoming', 'outgoing'] as const)
    it('refuses an actual ' + direction + ' incident dependency leaving the project', async () => {
      const fixture = await moveFixture();
      await fixture.seedDependency(
        moveEdge(
          'move-edge',
          direction === 'incoming' ? 'move-neighbor' : 'move-w',
          direction === 'incoming' ? 'move-w' : 'move-neighbor',
        ),
      );
      const before = await fixture.snapshotMove();
      expect(
        await fixture.store.moveWorkPackage('org-a', 'move-w', 'move-target', moveAct()),
      ).toEqual({ kind: 'dependency_crosses_project', dependencyIds: ['move-edge'] });
      expect(await fixture.snapshotMove()).toEqual(before);
    });
  it('allows an actual destination counterpart without changing dependency records', async () => {
    const fixture = await moveFixture();
    await fixture.seedDependency(moveEdge('move-edge', 'move-w', 'move-destination'));
    const before = await fixture.snapshotMove();
    expect(
      await fixture.store.moveWorkPackage('org-a', 'move-w', 'move-target', moveAct()),
    ).toMatchObject({ kind: 'moved' });
    expect((await fixture.snapshotMove()).dependencies).toEqual(before.dependencies);
  });
  for (const stage of ['move_package', 'move_source', 'move_target', 'move_audit'] as const)
    it('publishes no partial move after ' + stage + ' failure', async () => {
      const fixture = await moveFixture();
      fixture.failAt(stage);
      const before = await fixture.snapshotMove();
      await expectWriteFailure(
        fixture.store.moveWorkPackage('org-a', 'move-w', 'move-target', moveAct()),
        'controlled ' + stage + ' write failure',
      );
      expect(await fixture.snapshotMove()).toEqual(before);
    });
}
