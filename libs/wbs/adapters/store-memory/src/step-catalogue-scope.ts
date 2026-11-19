import { captureMemoryStepRetirementsIn } from './step-retirement';
import {
  type CatalogueStepBinding,
  type Project,
  readCatalogueId,
  readStepBinding,
  readStepIdentity,
  type StepIdentity,
  type StepScope,
} from '@wbs/core';
import type { ProjectChain, WorkPackageChain } from '@wbs/domain';

import type { MemoryStepCatalogueContext, MemoryStepCatalogueTables } from './step-catalogue';

/** Actual current scope and binding capture shared by catalogue operations and leaf fact writes. */
export function captureMemoryCatalogueScope(
  tables: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueContext,
) {
  const organizationExists = (organizationId: string): boolean => {
    readCatalogueId(organizationId, 'organization identity');
    if (context.organizations.has(organizationId)) return true;
    if (
      [...tables.definitions.values()].some((row) => row.organizationId === organizationId) ||
      [...tables.bindings.values()].some((row) => row.organizationId === organizationId) ||
      [...tables.retirements.values()].some((row) => row.organizationId === organizationId)
    )
      throw new Error('catalogue rows name an absent organization');
    return false;
  };
  const projectSpace = (project: Project, organizationId: string): string | null => {
    if (project.organizationId !== organizationId || !context.organizations.has(organizationId))
      throw new Error('catalogue project organization is inconsistent');
    readCatalogueId(project.id, 'project identity');
    if (project.spaceId === null) return null;
    const spaceId = readCatalogueId(project.spaceId, 'space identity');
    const space = context.spaces.get(spaceId);
    if (space?.id !== spaceId || space.organizationId !== organizationId)
      throw new Error('catalogue project space is absent or foreign');
    return spaceId;
  };
  const readProjectChain = (organizationId: string, projectId: string): ProjectChain | null => {
    const project = context.projects.get(projectId);
    if (project?.organizationId !== organizationId) return null;
    if (project.id !== projectId) throw new Error('catalogue project identity is inconsistent');
    return {level: 'project', organizationId, projectId, spaceId: projectSpace(project, organizationId)};
  };
  const scopeExists = (organizationId: string, scope: StepScope): boolean => {
    if (scope.scopeKind === 'organization')
      return scope.scopeId === organizationId && organizationExists(organizationId);
    if (scope.scopeKind === 'space') {
      const space = context.spaces.get(scope.scopeId);
      if (space?.organizationId !== organizationId) return false;
      if (space.id !== scope.scopeId || !context.organizations.has(organizationId))
        throw new Error('catalogue space identity is inconsistent');
      return true;
    }
    return readProjectChain(organizationId, scope.scopeId) !== null;
  };
  const typeExists = (organizationId: string, typeId: string | null): boolean => {
    if (typeId === null) return true;
    const owner = context.typeOrganization.get(typeId);
    if (owner !== undefined) {
      readCatalogueId(owner, 'type organization');
      if (!context.organizations.has(owner))
        throw new Error('catalogue type organization is absent');
      if (owner !== organizationId) return false;
    }
    const type = context.types.get(typeId);
    if (type === undefined) {
      if (owner !== undefined) throw new Error('catalogue owned type header is absent');
      return false;
    }
    if (owner === undefined) throw new Error('catalogue type ownership is absent');
    if (type.id !== typeId) throw new Error('catalogue type identity differs');
    return true;
  };
  const packageChain = (organizationId: string, workPackageId: string): WorkPackageChain | null => {
    const owner = context.packageOrganization.get(workPackageId);
    if (owner !== undefined) {
      readCatalogueId(owner, 'package organization');
      if (!context.organizations.has(owner))
        throw new Error('catalogue package organization is absent');
      if (owner !== organizationId) return null;
    }
    const workPackage = context.packages.get(workPackageId);
    if (workPackage === undefined) {
      if (owner !== undefined || tables.packageValues.has(workPackageId))
        throw new Error('catalogue owned package header is absent');
      return null;
    }
    if (owner === undefined || context.packageOwnership.get(workPackageId) !== owner)
      throw new Error('catalogue package ownership is absent or inconsistent');
    if (workPackage.id !== workPackageId) throw new Error('catalogue package identity differs');
    const projectId = readCatalogueId(workPackage.projectId, 'package project');
    const project = context.projects.get(projectId);
    if (project?.id !== projectId) throw new Error('catalogue package project is absent');
    return {
      level: 'work_package',
      organizationId,
      spaceId: projectSpace(project, organizationId),
      projectId,
      workPackageId,
    };
  };
  const reaches = (chain: ProjectChain | WorkPackageChain, scope: StepScope): boolean =>
    scope.scopeKind === 'organization'
      ? scope.scopeId === chain.organizationId
      : scope.scopeKind === 'space'
        ? scope.scopeId === chain.spaceId
        : scope.scopeId === chain.projectId;
  const bindingRows = (
    captured: MemoryStepCatalogueTables,
    organizationId: string,
    chain?: ProjectChain | WorkPackageChain,
  ) => {
    const retirements=captureMemoryStepRetirementsIn(captured,context,organizationId);
    const bindings: CatalogueStepBinding[] = [];
    const identities = new Map<string, StepIdentity>();
    for (const [bindingId, raw] of captured.bindings) {
      if (chain === undefined ? raw.organizationId !== organizationId : !reaches(chain, raw))
        continue;
      const binding = readStepBinding(raw);
      if (binding.bindingId !== bindingId || binding.organizationId !== organizationId)
        throw new Error('catalogue binding organization or identity is inconsistent');
      if (!scopeExists(organizationId, binding))
        throw new Error('catalogue binding scope is absent or foreign');
      if (!typeExists(organizationId, binding.workItemTypeId))
        throw new Error('catalogue binding type is absent or foreign');
      const definition = captured.definitions.get(binding.stepId);
      if (definition === undefined) throw new Error('catalogue binding definition is absent');
      const identity = readStepIdentity(definition);
      if (identity.id !== binding.stepId || identity.organizationId !== organizationId)
        throw new Error('catalogue binding definition is inconsistent');
      if(retirements.has(identity.id))throw new Error('catalogue binding names a retired definition');
      identities.set(identity.id, identity);
      bindings.push(binding);
    }
    return { bindings, identities };
  };
  return { organizationExists, scopeExists, typeExists, packageChain, bindingRows, reaches, readProjectChain };
}
