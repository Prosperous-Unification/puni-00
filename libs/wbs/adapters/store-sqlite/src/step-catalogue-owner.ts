import type { StepCatalogue, TransactionalStores, UnitOfWork } from '@wbs/core';

import { type Connection, observeCommitted } from './db';
import { OPEN } from './gate';
import { StepCatalogueRepository } from './step-catalogue';

/** Public reads own one actual pooled snapshot; public writes enter Source's existing UoW. Active read loans finish after Source close. */
export function ownStepCatalogue(
  openConnection: () => Connection,
  getUow: () => UnitOfWork<TransactionalStores>,
): StepCatalogue {
  return {
    async reorderBindings(organizationId, scope, ids, stamp, beforeWrite) {
      // Proof: REORDER_SQLITE_RETAIN omitted this clone; actual queued scope/IDs/audit owners all failed, then exact restore passed (verification-reorder-lifetime-20261119.json).
      const kept = structuredClone({ organizationId, scope, ids, stamp });
      return await getUow().run(async ({ stores }) => {
        const written = await stores.stepCatalogue.reorderBindings(
          kept.organizationId,
          kept.scope,
          kept.ids,
          kept.stamp,
          beforeWrite,
        );
        return { commit: written.ok, value: written };
      });
    },
    async patchStepDefinition(organizationId, stepId, patch, stamp, beforeWrite) {
      const kept = structuredClone({ organizationId, stepId, patch, stamp });
      return await getUow().run(async ({ stores }) => {
        const written = await stores.stepCatalogue.patchStepDefinition(
          kept.organizationId,
          kept.stepId,
          kept.patch,
          kept.stamp,
          beforeWrite,
        );
        return { commit: written.ok, value: written };
      });
    },
    async retireStepDefinition(organizationId, stepId, stamp) {
      const kept = structuredClone({ organizationId, stepId, stamp });
      return await getUow().run(async ({ stores }) => {
        const written = await stores.stepCatalogue.retireStepDefinition(
          kept.organizationId,
          kept.stepId,
          kept.stamp,
        );
        return { commit: written.ok, value: written };
      });
    },
    async readUsage(organizationId) {
      const retained = organizationId;
      return await observeCommitted(openConnection, (db) =>
        new StepCatalogueRepository(db, OPEN, 'borrowed').readUsage(retained),
      );
    },
    async readManifest(organizationId, projectId) {
      const retained = { organizationId, projectId };
      return await observeCommitted(openConnection, (db) =>
        new StepCatalogueRepository(db, OPEN, 'borrowed').readManifest(
          retained.organizationId,
          retained.projectId,
        ),
      );
    },
    async readRetiredCodes(organizationId) {
      const retained = organizationId;
      return await observeCommitted(openConnection, (db) =>
        new StepCatalogueRepository(db, OPEN, 'borrowed').readRetiredCodes(retained),
      );
    },
    async readCatalogue(organizationId) {
      const retained = organizationId;
      return await observeCommitted(openConnection, (db) =>
        new StepCatalogueRepository(db, OPEN, 'borrowed').readCatalogue(retained),
      );
    },
    async readPackage(organizationId, workPackageId) {
      const retained = { organizationId, workPackageId };
      return await observeCommitted(openConnection, (db) =>
        new StepCatalogueRepository(db, OPEN, 'borrowed').readPackage(
          retained.organizationId,
          retained.workPackageId,
        ),
      );
    },
    async defineAndBindStep(organizationId, definition, binding, stamp, beforeWrite) {
      const retained = structuredClone({ organizationId, definition, binding, stamp });
      return await getUow().run(async ({ stores }) => {
        const written = await stores.stepCatalogue.defineAndBindStep(
          retained.organizationId,
          retained.definition,
          retained.binding,
          retained.stamp,
          beforeWrite,
        );
        return { commit: written.ok, value: written };
      });
    },
    async bindStep(organizationId, binding, stamp, beforeWrite) {
      const retained = structuredClone({ organizationId, binding, stamp });
      return await getUow().run(async ({ stores }) => {
        const written = await stores.stepCatalogue.bindStep(
          retained.organizationId,
          retained.binding,
          retained.stamp,
          beforeWrite,
        );
        return { commit: written.ok, value: written };
      });
    },
    async unbindStep(organizationId, bindingId, options, stamp, beforeWrite) {
      const retained = structuredClone({ organizationId, bindingId, options, stamp });
      return await getUow().run(async ({ stores }) => {
        const written = await stores.stepCatalogue.unbindStep(
          retained.organizationId,
          retained.bindingId,
          retained.options,
          retained.stamp,
          beforeWrite,
        );
        return { commit: written.kind === 'unbound', value: written };
      });
    },
  };
}
