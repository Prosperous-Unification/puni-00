import type { ProjectCaller } from '@wbs/core/ports/project-administration';
import type { SpaceRead, SpaceView } from '@wbs/core/ports/space-read';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { CONTRIBUTOR_CAP } from '@wbs/domain';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import type { Drizzle } from '../db';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

type Fixture = Awaited<ReturnType<typeof openSqliteStepCatalogueCase>>;

async function withinSpace(use: (fixture: Fixture) => Promise<void>, isActivated = true) {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    undefined,
    'empty-project',
    undefined,
    isActivated,
  );
  try {
    await use(fixture);
  } finally {
    await fixture.close();
  }
}

function reader(fixture: Fixture): SpaceRead {
  return fixture.source.createSpaceRead({
    activeOrganizationOf: () => () => Promise.resolve('catalogue-org'),
    now: () => 100,
  });
}

function grant(
  fixture: Fixture,
  role = 'org-viewer',
  scope: 'organization' | 'project' | 'work_package' = 'organization',
  scopeId = 'catalogue-org',
) {
  fixture.source.db
    .run(sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at)
    VALUES(${crypto.randomUUID()},'catalogue-org',${scope},${scopeId},'user','catalogue-author',${role},'route',100)`);
}

async function failureOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    await pending;
  } catch (cause) {
    return cause;
  }
  throw new Error('expected a failed observation');
}

async function read(spaces: SpaceRead, spaceId = 'catalogue-space'): Promise<SpaceView> {
  const observed = await spaces.read(caller(), spaceId);
  expect(observed).toMatchObject({ ok: true });
  if (!observed.ok) throw new Error('expected a readable space');
  return observed.value;
}

function caller(): ProjectCaller {
  return {
    kind: 'human',
    principal: {
      id: 'catalogue-author',
      username: 'catalogue-author',
      scopes: ['read', 'write'],
      authentication: { kind: 'first_party', issuedAt: 100 },
      organizationOperation: {
        kind: 'read',
        expected: { kind: 'present', organizationId: 'catalogue-org' },
      },
    },
    expectedAccess: {
      kind: 'scoped',
      principal: { id: 'catalogue-author' },
      scope: { organizationId: 'catalogue-org', userId: 'catalogue-author', cap: null },
    },
  };
}

test('actual Source groups readable children beneath their real project and includes permitted empty projects', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    undefined,
    'empty-project',
  );
  try {
    fixture.source.db
      .run(sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at)
      VALUES('space-reader','catalogue-org','organization','catalogue-org','user','catalogue-author','org-viewer','route',100)`);
    const spaces = fixture.source.createSpaceRead({
      activeOrganizationOf: () => () => Promise.resolve('catalogue-org'),
      now: () => 100,
    });
    const observed = await spaces.read(caller(), 'catalogue-space');
    expect(observed).toMatchObject({
      ok: true,
      value: {
        space: {
          id: 'catalogue-space',
          name: 'Catalogue space',
          virtual: false,
          projectCount: 2,
          workPackageCount: 1,
        },
        writable: false,
        personIds: [],
        serviceTeamIds: [],
        projects: [
          {
            project: { id: 'catalogue-project', name: 'Catalogue project' },
            position: 10,
            workPackages: [{ id: 'catalogue-empty-package', projectId: 'catalogue-project' }],
          },
          {
            project: { id: 'empty-project', name: 'empty-project' },
            position: 20,
            workPackages: [],
          },
        ],
      },
    });
  } finally {
    await fixture.close();
  }
}, 60000);

test(
  'space membership reveals no project shell, placeholder or child count without read authority',
  () =>
    withinSpace(async (fixture) => {
      fixture.source.db.run(sql`DELETE FROM access_grant`);
      const observed = await read(reader(fixture));
      expect(observed.projects).toEqual([]);
      expect(observed.space).toMatchObject({ projectCount: 0, workPackageCount: 0 });
      expect(observed.writable).toBe(false);
    }),
  60000,
);

test(
  'package-only space readers receive exact parent identity and only their readable children',
  () =>
    withinSpace(async (fixture) => {
      fixture.source.db.run(sql`DELETE FROM access_grant`);
      grant(fixture, 'package-viewer', 'work_package', 'catalogue-empty-package');
      // Full project metadata is neither needed nor decoded for a package-only shell.
      fixture.source.db.run(
        sql`UPDATE project SET created_at=x'0102' WHERE id='catalogue-project'`,
      );
      const observed = await read(reader(fixture));
      expect(observed.projects).toHaveLength(1);
      expect(observed.projects[0]?.project).toEqual({
        id: 'catalogue-project',
        name: 'Catalogue project',
      });
      expect(observed.projects[0]?.workPackages.map((child) => child.id)).toEqual([
        'catalogue-empty-package',
      ]);
      expect(observed.space).toMatchObject({ projectCount: 1, workPackageCount: 1 });
    }),
  60000,
);

test(
  'space child projection excludes restricted private state before decoding and counting it',
  () =>
    withinSpace(async (fixture) => {
      fixture.source.db.run(sql`DELETE FROM access_grant`);
      fixture.source.db.run(
        sql`UPDATE work_package SET project_id='catalogue-project' WHERE id='catalogue-sibling-package'`,
      );
      fixture.source.db.run(
        sql`UPDATE work_package SET restricted=1 WHERE id='catalogue-empty-package'`,
      );
      grant(fixture);
      const observed = await read(reader(fixture));
      expect(
        observed.projects.map((group) => ({
          project: group.project.id,
          children: group.workPackages.map((child) => child.id),
        })),
      ).toEqual([
        { project: 'catalogue-project', children: ['catalogue-sibling-package'] },
        { project: 'empty-project', children: [] },
      ]);
      expect(observed.space).toMatchObject({ projectCount: 2, workPackageCount: 1 });
      expect(observed.projects[0]?.workPackages.map((child) => child.id)).toEqual([
        'catalogue-sibling-package',
      ]);
      fixture.source.db.run(
        sql`UPDATE work_package SET name=x'0102' WHERE id='catalogue-empty-package'`,
      );
      expect((await read(reader(fixture))).space.workPackageCount).toBe(1);
    }),
  60000,
);

test(
  'named spaces order projects by position and id and children by binary name and id',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      fixture.source.db.run(
        sql`UPDATE project SET name='Z',space_id='catalogue-space',space_position=10 WHERE id='catalogue-sibling-project'`,
      );
      fixture.source.db.run(sql`UPDATE project SET name='A' WHERE id='empty-project'`);
      fixture.source.db.run(
        sql`UPDATE work_package SET project_id='catalogue-project',name='A' WHERE id='catalogue-sibling-package'`,
      );
      const observed = await read(reader(fixture));
      expect(observed.projects.map((group) => [group.project.id, group.position])).toEqual([
        ['catalogue-project', 10],
        ['catalogue-sibling-project', 10],
        ['empty-project', 20],
      ]);
      expect(observed.projects[0]?.workPackages.map((child) => child.id)).toEqual([
        'catalogue-sibling-package',
        'catalogue-empty-package',
      ]);
      fixture.source.db.run(
        sql`UPDATE work_package SET name='same' WHERE id IN ('catalogue-empty-package','catalogue-sibling-package')`,
      );
      expect(
        (await read(reader(fixture))).projects[0]?.workPackages.map((child) => child.id),
      ).toEqual(['catalogue-empty-package', 'catalogue-sibling-package']);
    }),
  60000,
);

test(
  'All projects includes empty projects and projects outside spaces but excludes foreign structure',
  () =>
    withinSpace(async (fixture) => {
      fixture.source.db.run(sql`DELETE FROM access_grant`);
      fixture.source.db.run(
        sql`UPDATE project SET name=x'0102' WHERE id='catalogue-foreign-project'`,
      );
      grant(fixture, 'org-super-admin');
      const observed = await read(reader(fixture), 'all');
      expect(observed.space).toEqual({
        id: 'all',
        name: 'All projects',
        virtual: true,
        projectCount: 3,
        workPackageCount: 2,
        revision: 0,
        createdById: null,
        createdAt: null,
      });
      expect(observed.projects.map((group) => [group.project.id, group.position])).toEqual([
        ['catalogue-project', 10],
        ['catalogue-sibling-project', 20],
        ['empty-project', 30],
      ]);
      expect(observed.personIds).toEqual([]);
      expect(observed.serviceTeamIds).toEqual([]);
      expect(observed.writable).toBe(false);
    }),
  60000,
);

test(
  'space reads conceal foreign and absent spaces alike',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      fixture.source.db
        .run(sql`INSERT INTO space(id,organization_id,name,revision,created_at,created_by)
      VALUES('foreign-space','catalogue-foreign-org','Foreign',0,100,'catalogue-author')`);
      for (const id of ['foreign-space', 'absent'])
        expect(await reader(fixture).read(caller(), id)).toEqual({
          ok: false,
          refusal: 'not_found',
        });
    }),
  60000,
);

test(
  'space reads apply current membership, selected organization and management grants',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture, 'org-super-admin');
      const spaces = reader(fixture);
      expect((await read(spaces)).writable).toBe(true);
      fixture.source.db.run(sql`DELETE FROM access_grant`);
      expect((await read(spaces)).writable).toBe(false);
      const changed = caller();
      Object.assign(changed.expectedAccess.scope, { organizationId: 'catalogue-foreign-org' });
      expect(await spaces.read(changed, 'catalogue-space')).toEqual({
        ok: false,
        refusal: 'organization_context_changed',
      });
      fixture.source.db.run(
        sql`DELETE FROM organization_membership WHERE organization_id='catalogue-org' AND user_id='catalogue-author'`,
      );
      expect(await spaces.read(caller(), 'catalogue-space')).toEqual({
        ok: false,
        refusal: 'not_a_member',
      });
    }),
  60000,
);

test(
  'space read retains the complete caller across an awaited organization selection',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      const spaces = fixture.source.createSpaceRead({
        activeOrganizationOf: () => async (principal) => {
          entered.resolve(undefined);
          await release.promise;
          return principal.id === 'catalogue-author' ? 'catalogue-org' : null;
        },
        now: () => 100,
      });
      const evidence = caller();
      const pending = spaces.read(evidence, 'catalogue-space');
      try {
        await entered.promise;
        evidence.principal.id = 'mutated-after-entry';
        Object.assign(evidence.expectedAccess.scope, { organizationId: 'mutated-after-entry' });
      } finally {
        release.resolve(undefined);
      }
      expect(await pending).toMatchObject({ ok: true, value: { space: { projectCount: 2 } } });
    }),
  60000,
);

test(
  'space authority, headers, memberships and project names share the first-SQL snapshot across a rival commit',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture, 'org-super-admin');
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      let held = true;
      const spaces = fixture.source.createSpaceRead({
        activeOrganizationOf: () => async () => {
          if (held) {
            entered.resolve(undefined);
            await release.promise;
          }
          return 'catalogue-org';
        },
        now: () => 100,
      });
      const pending = spaces.read(caller(), 'catalogue-space');
      try {
        await entered.promise;
        fixture.source.db.run(sql`DELETE FROM access_grant`);
        fixture.source.db.run(
          sql`UPDATE space SET name='Changed',revision=revision+1 WHERE id='catalogue-space'`,
        );
        fixture.source.db.run(
          sql`UPDATE project SET name='Changed project',space_id=NULL,space_position=NULL WHERE id='catalogue-project'`,
        );
      } finally {
        held = false;
        release.resolve(undefined);
      }
      expect(await pending).toMatchObject({
        ok: true,
        value: {
          writable: true,
          space: { name: 'Catalogue space', revision: 0, projectCount: 2 },
          projects: [
            { project: { id: 'catalogue-project', name: 'Catalogue project' } },
            { project: { id: 'empty-project' } },
          ],
        },
      });
      expect(await spaces.read(caller(), 'catalogue-space')).toMatchObject({
        ok: true,
        value: {
          writable: false,
          space: { name: 'Changed', revision: 1, projectCount: 0 },
          projects: [],
        },
      });
    }),
  60000,
);

test(
  'space projection is detached and a released snapshot capability cannot read again',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      const retained: Drizzle[] = [];
      const spaces = fixture.source.createSpaceRead({
        activeOrganizationOf: (snapshot) => {
          retained.push(snapshot);
          return () => Promise.resolve('catalogue-org');
        },
        now: () => 100,
      });
      const observed = await read(spaces);
      const first = observed.projects.at(0);
      if (first === undefined) throw new Error('expected a project');
      // Fault injection into caller-owned returned values, despite their readonly port type.
      Object.assign(first.project, { name: 'Mutated' });
      Object.assign(first.workPackages[0], { name: 'Mutated child' });
      Object.assign(first.workPackages[0]?.pertWeights, { optimistic: 999 });
      expect((await read(spaces)).projects[0]).toMatchObject({
        project: { name: 'Catalogue project' },
        workPackages: [{ name: 'catalogue-empty-package' }],
      });
      expect((await read(spaces)).projects[0]?.workPackages[0]?.pertWeights).toEqual({
        optimistic: 1,
        realistic: 4,
        pessimistic: 1,
      });
      const released = retained.at(-1);
      if (released === undefined) throw new Error('snapshot was not captured');
      expect(() => released.get(sql`SELECT 1`)).toThrow();
    }),
  60000,
);

for (const bound of [false, true])
  test(
    'actual Source refuses new grouped reads after close ' + String(bound),
    () =>
      withinSpace(async (fixture) => {
        const source = bound
          ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
          : fixture.source;
        const spaces = source.createSpaceRead({
          activeOrganizationOf: () => () => Promise.resolve('catalogue-org'),
          now: () => 100,
        });
        expect(await spaces.read(caller(), 'catalogue-space')).toMatchObject({ ok: true });
        await source.close();
        expect(String(await failureOf(spaces.read(caller(), 'catalogue-space')))).toContain(
          'closed',
        );
      }),
    60000,
  );

test(
  'a lent grouped observation finishes its captured snapshot after Source close',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      const entered = Promise.withResolvers<undefined>(),
        release = Promise.withResolvers<undefined>();
      const spaces = fixture.source.createSpaceRead({
        activeOrganizationOf: () => async () => {
          entered.resolve(undefined);
          await release.promise;
          return 'catalogue-org';
        },
        now: () => 100,
      });
      const pending = spaces.read(caller(), 'catalogue-space');
      try {
        await entered.promise;
        await fixture.source.close();
      } finally {
        release.resolve(undefined);
      }
      expect(await pending).toMatchObject({ ok: true, value: { space: { projectCount: 2 } } });
      expect(String(await failureOf(spaces.read(caller(), 'catalogue-space')))).toContain('closed');
    }),
  60000,
);

test(
  'a malformed admitted project name throws and does not poison the next pooled observation',
  () =>
    withinSpace(async (fixture) => {
      grant(fixture);
      fixture.source.db.run(sql`UPDATE project SET name=x'0102' WHERE id='catalogue-project'`);
      expect(String(await failureOf(reader(fixture).read(caller(), 'catalogue-space')))).toContain(
        'stored project name is malformed',
      );
      fixture.source.db.run(sql`UPDATE project SET name='Restored' WHERE id='catalogue-project'`);
      expect((await read(reader(fixture))).projects[0]?.project.name).toBe('Restored');
    }),
  60000,
);

test(
  'legacy grouped reads refuse after durable activation',
  () =>
    withinSpace(async (fixture) => {
      const spaces = reader(fixture);
      for (const id of ['all', 'catalogue-space'])
        expect(await spaces.read({ kind: 'legacy', actorId: 'catalogue-author' }, id)).toEqual({
          ok: false,
          refusal: 'no_active_organization',
        });
    }),
  60000,
);

test(
  'legacy grouped reads preserve deployment-wide visibility and named legacy ownership before activation',
  () =>
    withinSpace(async (fixture) => {
      const spaces = reader(fixture);
      const evidence = { kind: 'legacy', actorId: 'catalogue-author' } as const;
      fixture.source.db.run(sql`DELETE FROM access_grant`);
      expect(await spaces.read(evidence, 'catalogue-space')).toEqual({
        ok: false,
        refusal: 'organization_required',
      });
      const all = await spaces.read(evidence, 'all');
      expect(all).toMatchObject({
        ok: true,
        value: {
          writable: false,
          space: { name: 'All projects', projectCount: 4, workPackageCount: 3 },
        },
      });
      fixture.source.db.run(sql`UPDATE organization SET legacy=1 WHERE id='catalogue-org'`);
      expect(await spaces.read(evidence, 'catalogue-space')).toMatchObject({
        ok: true,
        value: { writable: true, space: { projectCount: 2, workPackageCount: 1 } },
      });
    }, false),
  60000,
);

test(
  'space membership identities are sorted and scoped without granting project visibility',
  () =>
    withinSpace(async (fixture) => {
      fixture.source.db.run(sql`DELETE FROM access_grant`);
      const spaces = fixture.source.stores.spaces;
      if (spaces === undefined) throw new Error('actual Source lacks spaces');
      for (const id of ['z-person', 'a-person']) {
        expect(
          await fixture.source.stores.directory.addPerson({ id, name: id }, [], fixture.seed.stamp),
        ).toMatchObject({ ok: true });
        await fixture.source.stores.directory.mapInOrganization(
          'people',
          id,
          fixture.seed.organizationId,
          id,
          fixture.seed.stamp,
        );
        expect(
          await spaces.addPerson(
            fixture.seed.organizationId,
            fixture.seed.spaceId,
            id,
            fixture.seed.stamp,
          ),
        ).toBe(true);
      }
      for (const id of ['z-team', 'a-team']) {
        await fixture.source.stores.directory.addTeam({ id, name: id }, fixture.seed.stamp);
        await fixture.source.stores.directory.mapInOrganization(
          'teams',
          id,
          fixture.seed.organizationId,
          id,
          fixture.seed.stamp,
        );
        expect(
          await spaces.addTeam(
            fixture.seed.organizationId,
            fixture.seed.spaceId,
            id,
            fixture.seed.stamp,
          ),
        ).toBe(true);
      }
      const observed = await read(reader(fixture));
      expect(observed.personIds).toEqual(['a-person', 'z-person']);
      expect(observed.serviceTeamIds).toEqual(['a-team', 'z-team']);
      expect(observed.projects).toEqual([]);
      expect(observed.space).toMatchObject({ revision: 4, projectCount: 0, workPackageCount: 0 });
    }),
  60000,
);

for (const fault of ['absent', 'unreadable'] as const)
  test(
    'grouped reads throw on ' + fault + ' trusted activation state',
    () =>
      withinSpace(async (fixture) => {
        if (fault === 'absent') fixture.source.db.run(sql`DROP TABLE organization_activation`);
        else
          fixture.source.db.run(
            sql`ALTER TABLE organization_activation RENAME COLUMN state TO unreadable_state`,
          );
        expect(await failureOf(reader(fixture).read(caller(), 'catalogue-space'))).toBeInstanceOf(
          Error,
        );
      }),
    60000,
  );

for (const kind of ['machine', 'consent'] as const)
  test(
    'grouped ' + kind + ' readers use credential grants and refuse current revocation',
    () =>
      withinSpace(async (fixture) => {
        grant(fixture, 'org-super-admin');
        fixture.source.db.run(
          sql`INSERT INTO person(id,name,kind,account_id) VALUES('space-agent','Agent','agent','catalogue-author')`,
        );
        fixture.source.db.run(
          sql`INSERT INTO person_organization(resource_id,organization_id,name) VALUES('space-agent','catalogue-org','Agent')`,
        );
        const credentialId = '00000000-0000-4000-8000-000000000001';
        fixture.source.db
          .run(sql`INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by,mcp_family_id)
        VALUES(${credentialId},'catalogue-org','space-agent','catalogue-author',${kind === 'machine' ? 'api_key' : 'mcp_consent'},'Agent',100,'catalogue-author',${kind === 'machine' ? null : 'family'})`);
        const evidence = caller();
        evidence.principal.authentication =
          kind === 'machine'
            ? { kind: 'machine', credentialId, personId: 'space-agent' }
            : {
                kind: 'consent',
                credentialId,
                personId: 'space-agent',
                issuer: 'https://issuer.test',
                subject: 'catalogue-author',
              };
        evidence.principal.delegation = {
          organizationId: 'catalogue-org',
          audience: 'wbs-be-01/via-mcp-01',
          client: 'client',
          grant: 'family',
        };
        Object.assign(evidence.expectedAccess.scope, { cap: CONTRIBUTOR_CAP, delegated: true });
        const spaces = reader(fixture);
        expect(await spaces.read(evidence, 'catalogue-space')).toMatchObject({
          ok: true,
          value: { writable: false, projects: [], space: { projectCount: 0, workPackageCount: 0 } },
        });
        fixture.source.db
          .run(sql`INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at)
        VALUES('credential-package','catalogue-org','work_package','catalogue-empty-package','machine_credential',${credentialId},'package-viewer','route',100)`);
        const observed = await spaces.read(evidence, 'catalogue-space');
        expect(observed).toMatchObject({
          ok: true,
          value: { space: { projectCount: 1, workPackageCount: 1 } },
        });
        if (!observed.ok) throw new Error('expected a credential-readable child');
        expect(observed.value.projects[0]?.project).toEqual({
          id: 'catalogue-project',
          name: 'Catalogue project',
        });
        fixture.source.db.run(
          sql`UPDATE machine_credential SET revoked_at=101 WHERE id=${credentialId}`,
        );
        expect(await spaces.read(evidence, 'catalogue-space')).toEqual({
          ok: false,
          refusal: 'organization_context_changed',
        });
      }),
    60000,
  );

for (const bound of [false, true])
  for (const commit of [false, true])
    test(
      'grouped observations exclude the active writer until settlement ' +
        [bound, commit].join(' '),
      () =>
        withinSpace(async (fixture) => {
          grant(fixture);
          const source = bound
            ? fixture.source.bindLivePlans({ schedulerOf: () => fastScheduler })
            : fixture.source;
          const spaces = source.createSpaceRead({
            activeOrganizationOf: () => () => Promise.resolve('catalogue-org'),
            now: () => 100,
          });
          const before = await read(spaces);
          await source.uow.run(async ({ stores }) => {
            if (stores.spaces === undefined) throw new Error('actual Source loan lacks spaces');
            expect(
              await stores.spaces.rename(
                'catalogue-org',
                'catalogue-space',
                'Staged',
                fixture.seed.stamp,
              ),
            ).toMatchObject({ ok: true });
            expect(
              await stores.spaces.removeProject(
                'catalogue-org',
                'catalogue-space',
                'catalogue-project',
                fixture.seed.stamp,
              ),
            ).toBe(true);
            expect(await read(spaces)).toEqual(before);
            return { commit, value: undefined };
          });
          const after = await read(spaces);
          if (!commit) expect(after).toEqual(before);
          else {
            expect(after.space).toMatchObject({
              name: 'Staged',
              projectCount: 1,
              workPackageCount: 0,
            });
            expect(after.projects.map((group) => group.project.id)).toEqual(['empty-project']);
          }
        }),
      60000,
    );

test(
  'legacy named spaces exclude foreign projects even with a broken membership trigger',
  () =>
    withinSpace(async (fixture) => {
      fixture.source.db.run(sql`UPDATE organization SET legacy=1 WHERE id='catalogue-org'`);
      // Keep the foreign package's settings chain valid, isolating the empty foreign project's membership fault.
      fixture.source.db.run(sql`INSERT INTO project(id,organization_id,name,created_at,created_by)
      VALUES('foreign-parent','catalogue-foreign-org','Foreign parent',100,'catalogue-author')`);
      fixture.source.db.run(
        sql`UPDATE work_package SET project_id='foreign-parent' WHERE id='catalogue-foreign-package'`,
      );
      // Break the fixture's physical membership constraint; the reader must still enforce its owner boundary.
      fixture.source.db.run(sql`DROP TRIGGER project_space_organization_update`);
      fixture.source.db.run(
        sql`UPDATE project SET space_id='catalogue-space',space_position=5 WHERE id='catalogue-foreign-project'`,
      );
      const observed = await reader(fixture).read(
        { kind: 'legacy', actorId: 'catalogue-author' },
        'catalogue-space',
      );
      expect(observed).toMatchObject({
        ok: true,
        value: { space: { projectCount: 2, workPackageCount: 1 } },
      });
      if (!observed.ok) throw new Error('expected a legacy-owned space');
      expect(observed.value.projects.map((group) => group.project.id)).toEqual([
        'catalogue-project',
        'empty-project',
      ]);
    }, false),
  60000,
);
