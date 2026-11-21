import type { AuthenticatedUser } from '@wbs/contracts';
import type { RecoveryWriteBoundary } from '@wbs/core/http/recovery-write';
import { spaceRoutes } from '@wbs/core/http/space.routes';
import type { SpaceResource } from '@wbs/core/service/space.resource';
import { expect, test } from 'bun:test';

import { SqliteOrganizationAccess } from '../organization-access';
import { openSqliteStepCatalogueCase } from './step-catalogue-fixture';

test('space HTTP handler retains caller evidence before the initial organization await and reaches the real Source reader', async () => {
  const fixture = await openSqliteStepCatalogueCase(
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
  );
  try {
    fixture.source.db.run(
      "INSERT INTO person(id,name,kind,account_id) VALUES('space-http-agent','Agent','agent','catalogue-author')",
    );
    fixture.source.db.run(
      "INSERT INTO person_organization(resource_id,organization_id,name) VALUES('space-http-agent','catalogue-org','Agent')",
    );
    fixture.source.db.run(
      "INSERT INTO machine_credential(id,organization_id,person_id,issued_by,source,name,created_at,created_by) VALUES('00000000-0000-4000-8000-000000000001','catalogue-org','space-http-agent','catalogue-author','api_key','Agent',100,'catalogue-author')",
    );
    fixture.source.db.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('space-http-reader','catalogue-org','work_package','catalogue-empty-package','machine_credential','00000000-0000-4000-8000-000000000001','package-viewer','route',100)",
    );
    const entered = Promise.withResolvers<undefined>(),
      release = Promise.withResolvers<undefined>();
    const actual = new SqliteOrganizationAccess(
      fixture.source.db,
      () => Promise.resolve('catalogue-org'),
      () => 100,
    );
    const spaces = fixture.source.createSpaceRead({
      activeOrganizationOf: () => () => Promise.resolve('catalogue-org'),
      now: () => 100,
    });
    // This test reaches only readSpace. Deliberately absent obsolete-read/write collaborators make accidental fallback fail.
    const [, , read] = spaceRoutes(
      {} as SpaceResource,
      {
        async resolve(principal) {
          entered.resolve(undefined);
          await release.promise;
          return await actual.resolve(principal);
        },
      },
      {} as Pick<RecoveryWriteBoundary, 'uow' | 'commandAccess' | 'announcements'>,
      spaces,
    );
    const authentication = {
      kind: 'machine' as const,
      credentialId: '00000000-0000-4000-8000-000000000001',
      personId: 'space-http-agent',
    };
    const delegation = {
      organizationId: 'catalogue-org',
      audience: 'wbs-be-01/via-mcp-01' as const,
      client: 'client',
      grant: 'family',
    };
    const principal: AuthenticatedUser = {
      id: 'catalogue-author',
      username: 'catalogue-author',
      scopes: ['read', 'write'],
      authentication,
      delegation,
      organizationOperation: {
        kind: 'read',
        expected: { kind: 'present', organizationId: 'catalogue-org' },
      },
    };
    const pending = read.handle({
      params: { id: 'catalogue-space' },
      body: undefined,
      query: undefined,
      principal,
      request: {
        method: 'GET',
        url: new URL('http://localhost/api/spaces/catalogue-space'),
        headers: new Headers(),
        signal: new AbortController().signal,
      },
    });
    try {
      await entered.promise;
      principal.id = 'mutated-after-entry';
      authentication.credentialId = '00000000-0000-4000-8000-000000000099';
      delegation.organizationId = 'catalogue-foreign-org';
    } finally {
      release.resolve(undefined);
    }
    expect(await pending).toMatchObject({
      ok: true,
      status: 200,
      body: {
        projects: [
          {
            project: { id: 'catalogue-project', name: 'Catalogue project' },
            workPackages: [{ id: 'catalogue-empty-package' }],
          },
        ],
      },
    });
  } finally {
    await fixture.close();
  }
}, 60000);
