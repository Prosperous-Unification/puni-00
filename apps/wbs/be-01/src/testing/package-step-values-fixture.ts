import { dirname } from 'node:path';

import type { WriteStamp } from '@wbs/core';
import { allowancePercentOf } from '@wbs/domain';
import { workPackageRow } from '@wbs/store-memory/work-package-fixture';
import { migrateEmptyCatalogueFixture } from '@wbs/store-sqlite/testing/catalogue-database';
import { expect } from 'bun:test';

import { OrganizationHarness } from './organization-harness';

export const PACKAGE_STEP_SEED = {
  workPackageId: 'current-http-a',
  siblingWorkPackageId: 'current-http-b',
  foreignWorkPackageId: 'current-http-foreign',
  stepId: 'a2000000-0000-4000-8000-000000000001',
  foreignStepId: 'b2000000-0000-4000-8000-000000000002',
} as const;
const {
  workPackageId: A,
  siblingWorkPackageId: B,
  foreignWorkPackageId: FOREIGN,
  stepId: SHARED,
  foreignStepId: FOREIGN_STEP,
} = PACKAGE_STEP_SEED;

const actors = ['manager', 'contributor', 'viewer', 'hidden', 'nonmember'] as const;
export type PackageStepActor = (typeof actors)[number];
export interface PackageStepFixture {
  readonly harness: OrganizationHarness;
  readonly stamp: WriteStamp;
  readonly pushes: unknown[];
}

/** Real composed HTTP/auth/Source ownership; no replacement router or permission decision. */
export async function withinPackageSteps(
  exercise: (fixture: PackageStepFixture) => Promise<void>,
): Promise<void> {
  const custody = { hasUnknownOwner: false };
  const pushes: unknown[] = [];
  let namespace: string | undefined;
  let harness: OrganizationHarness;
  try {
    harness = OrganizationHarness.openComposedWith({
      migrate: (path) => {
        namespace = dirname(path);
        migrateEmptyCatalogueFixture({ path, directory: namespace, reportedAt: 100 }, custody);
      },
      pushFetch: (_url, request) => {
        pushes.push(request?.body);
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
    });
  } catch (cause: unknown) {
    throw new Error('current HTTP fixture acquisition failed; retain ' + String(namespace), {
      cause,
    });
  }
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= harness.closeComposed());
  let primary: { cause: unknown } | undefined;
  try {
    for (const actor of actors) await harness.register(actor);
    harness.organization('org-a');
    harness.organization('org-b');
    for (const actor of actors) {
      if (actor !== 'nonmember') harness.member('org-a', actor, 'member');
      harness.bind(actor, 'org-a');
    }
    harness.member('org-b', 'manager', 'member');
    harness.activate();
    const stamp = { at: 100, by: harness.userId('manager') };
    for (const [id, organization] of [
      ['current-http-project-a', 'org-a'],
      ['current-http-project-b', 'org-a'],
      ['current-http-project-foreign', 'org-b'],
    ] as const)
      harness.sqlite.run(
        'INSERT INTO project(id,organization_id,name,created_by,created_at) VALUES(?,?,?,?,100)',
        [id, organization, id, stamp.by],
      );
    await harness.publicWrites().uow.run(async ({ stores }) => {
      for (const [id, projectId, organization] of [
        [A, 'current-http-project-a', 'org-a'],
        [B, 'current-http-project-b', 'org-a'],
        [FOREIGN, 'current-http-project-foreign', 'org-b'],
      ] as const) {
        const created = await stores.workPackages.createInOrganization(
          workPackageRow({ id, projectId, name: id }),
          [],
          stamp,
          organization,
          { id: id + ':grant', auditId: id + ':audit' },
        );
        expect(typeof created).toBe('object');
        if (typeof created === 'string')
          throw new Error('current package birth refused: ' + created);
      }
      for (const [id, organization] of [
        [SHARED, 'org-a'],
        [FOREIGN_STEP, 'org-b'],
      ] as const)
        expect(
          (
            await stores.stepCatalogue.defineAndBindStep(
              organization,
              {
                id,
                code:
                  organization === 'org-a' ? 'current-http-shared' : 'current-http-foreign-step',
                name: id,
                position: 1,
                defaultEstimateUnit: 'workdays',
                defaultAllowancePercent: 7,
              },
              {
                bindingId: id + ':binding',
                scopeKind: 'organization',
                scopeId: organization,
                workItemTypeId: null,
                position: 10,
              },
              stamp,
            )
          ).ok,
        ).toBe(true);
      const distinct = allowancePercentOf(56.78);
      if (distinct === null) throw new Error('literal fixture allowance is invalid');
      expect(await stores.workPackages.setStepAllowance(B, SHARED, distinct, stamp)).toMatchObject({
        ok: true,
        previousPercent: 7,
        revision: 1,
      });
      expect(
        (await stores.workPackages.stepsOf(A)).map((step) => [step.id, step.allowancePercent]),
      ).toEqual([[SHARED, 7]]);
      expect(
        (await stores.workPackages.stepsOf(B)).map((step) => [step.id, step.allowancePercent]),
      ).toEqual([[SHARED, 56.78]]);
      return { commit: true, value: undefined };
    });
    harness.grant('org-a', 'contributor', 'package-contributor', 'work_package', A);
    harness.grant('org-a', 'viewer', 'package-viewer', 'work_package', A);
    expect(harness.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(
      harness.sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='step'")
        .all(),
    ).toEqual([]);
    pushes.length = 0;
    await exercise({ harness, stamp, pushes });
  } catch (cause: unknown) {
    primary = { cause };
  }
  try {
    await close();
  } catch (cleanup: unknown) {
    if (primary !== undefined)
      throw new AggregateError(
        [primary.cause, cleanup],
        'current HTTP owner and close failed; retain ' + String(namespace),
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (primary !== undefined) throw primary.cause;
  if (custody.hasUnknownOwner)
    throw new Error('current HTTP fixture lower ownership was unresolved');
}
