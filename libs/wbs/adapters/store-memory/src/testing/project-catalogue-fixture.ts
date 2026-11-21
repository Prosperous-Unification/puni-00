import type { NewStepDefinition } from '@wbs/core';
import { expect } from 'bun:test';

import { bindStores, MemoryState } from '../memory-stores';
import type { MemoryProjectTables } from '../project-fixture';

/** Authors catalogue rows on the real Memory store over these same empty project/package maps and genuine empty fact tables. */
export async function seedProjectCatalogue(
  tables: MemoryProjectTables,
  organizationId: string,
  definition: NewStepDefinition,
  workItemTypeId: string | null = null,
): Promise<void> {
  expect(tables.projects.size).toBe(0);
  expect(tables.workPackages.size).toBe(0);
  const state = new MemoryState();
  Object.assign(state.tables, { stepCatalogue: tables.catalogue, spaces: tables.packages.spaces });
  Object.assign(state.tables.users, { byId: tables.users });
  Object.assign(state.tables.directory.measureDefinitions, { organizations: tables.organizations });
  Object.assign(state.tables.directory, {
    workItemTypes: tables.workItemTypes,
    organizationOf: tables.typeOrganizations,
  });
  Object.assign(state.tables.workPackages, tables.packages);
  Object.assign(state.tables.organizationLimits, {
    workPackageOrganization: tables.packages.owning,
  });
  expect(
    await bindStores(state).stepCatalogue.defineAndBindStep(
      organizationId,
      definition,
      {
        bindingId: definition.id + ':binding',
        scopeKind: 'organization',
        scopeId: organizationId,
        workItemTypeId,
        position: definition.position,
      },
      { at: 42, by: 'creator' },
    ),
  ).toMatchObject({ ok: true });
}
