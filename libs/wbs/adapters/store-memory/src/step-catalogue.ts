import { retainStepDefinitionPatch,type StepRetirementRecord } from '@wbs/core/module/step-catalogue/step-retirement';
import { captureMemoryStepRetirementsIn } from './step-retirement';
import { captureMemoryCatalogueTargets,mergeMemoryCatalogueTargets,prepareMemoryCatalogueTouches } from './step-catalogue-touch';
import {
  type CatalogueStepBinding,
  compareStepUsageIds,
  type NewStepBinding,
  type PackageStepRecord,
  type PackageSteps,
  type PackageStepValues,
  type Project,
  projectCatalogueBindings,
  projectPackageSteps,
  projectStepManifest,
  projectStepNodesInUse,
  readCatalogueId,
  readPackageStepValues,
  readStepDefinition,
  readStepIdentity,
  retainCatalogueStamp,
  retainStepBinding,
  retainStepDefinition,
  retainStepUnbind,
  retainStepReorder,
  planStepBindingOrder,
  type StepBindingsReordered,
  type Space,
  type StepBound,
  type StepCatalogue,
  type StepCatalogueRows,
  type StepUsageSnapshot,
  type StepDefinedAndBound,
  type StepDefinitionPatched,
  type StepDefinitionRetired,
  type StepDefinition,
  type StepDefinitionRecord,
  type StepIdentity,
  type StepScope,
  type StepUnbindOutcome,
  type WorkPackage,
} from '@wbs/core';
import type { WorkPackageChain } from '@wbs/domain';

import { captureMemoryCatalogueScope } from './step-catalogue-scope';
import { captureMemoryStepUsage, type MemoryStepUsageTables } from './step-usage';

/** Authoritative memory catalogue rows; package values never derive from old Step DTO arrays. */
export interface MemoryStepDefinition extends StepDefinitionRecord {
  readonly createdAt: number;
  readonly createdBy: string;
  readonly updatedAt: number | null;
}
export type MemoryStepRetirement=Pick<StepRetirementRecord,'stepId'|'organizationId'|'retiredAt'|'retiredBy'>;
export interface MemoryStepCatalogueTables {
  readonly retirements: Map<string,MemoryStepRetirement>;
  readonly definitions: Map<string, MemoryStepDefinition>;
  readonly bindings: Map<string, CatalogueStepBinding>;
  readonly packageValues: Map<string, Map<string, PackageStepRecord>>;
}
export function memoryStepCatalogueTables(): MemoryStepCatalogueTables {
  return { definitions: new Map(), bindings: new Map(), packageValues: new Map(), retirements: new Map() };
}
/** The actual source graph's organization, parent, type and package maps. */
export interface MemoryStepCatalogueContext {
  readonly usage: MemoryStepUsageTables;
  readonly organizations: ReadonlyMap<string, unknown>;
  readonly spaces: ReadonlyMap<string, Space>;
  readonly projects: Map<string, Project>;
  readonly packages: Map<string, WorkPackage>;
  readonly packageOrganization: ReadonlyMap<string, string>;
  readonly packageOwnership: ReadonlyMap<string, string>;
  readonly types: ReadonlyMap<string, { readonly id: string }>;
  readonly typeOrganization: ReadonlyMap<string, string>;
}
function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
async function settleCatalogue<T>(work: () => T): Promise<T> {
  return Promise.resolve(work());
}

/** Borrowed synchronous row operations: Source owns serialization/staging and the loan guard. */
function catalogueOperations(
  tables: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueContext,
): {
  readonly port: StepCatalogue;
  materializePackage(organizationId: string, workPackageId: string): WorkPackageChain;
} {
  const { organizationExists, scopeExists, typeExists, packageChain, bindingRows, readProjectChain } =
    captureMemoryCatalogueScope(tables, context);
  const readPackage = (
    captured: MemoryStepCatalogueTables,
    chain: WorkPackageChain,
  ): PackageSteps => {
    const { bindings, identities } = bindingRows(captured, chain.organizationId, chain);
    const values = new Map<string, PackageStepValues>();
    for (const stepId of identities.keys()) {
      const row = captured.packageValues.get(chain.workPackageId)?.get(stepId);
      if (row !== undefined)
        values.set(stepId, readPackageStepValues(row, chain.workPackageId, stepId));
    }
    return projectPackageSteps(chain, bindings, identities, values);
  };
  const duplicateBinding = (
    captured: MemoryStepCatalogueTables,
    binding: NewStepBinding,
  ): boolean =>
    [...captured.bindings.values()].some(
      (row) =>
        row.scopeKind === binding.scopeKind &&
        row.scopeId === binding.scopeId &&
        row.stepId === binding.stepId &&
        row.workItemTypeId === binding.workItemTypeId,
    );
  /** One package's reached union, independent of leaves; only missing explicit values are inserted. */
  const materializePackage = (
    captured: MemoryStepCatalogueTables,
    chain: WorkPackageChain,
  ): void => {
    const { identities } = bindingRows(captured, chain.organizationId, chain);
    let values = captured.packageValues.get(chain.workPackageId);
    if (values === undefined) {
      values = new Map();
      captured.packageValues.set(chain.workPackageId, values);
    }
    for (const stepId of identities.keys()) {
      if (values.has(stepId)) continue;
      const definition = captured.definitions.get(stepId);
      if (definition === undefined) throw new Error('catalogue reached definition disappeared');
      const decoded = readStepDefinition(definition);
      values.set(stepId, {
        workPackageId: chain.workPackageId,
        stepId,
        estimateUnit: decoded.defaultEstimateUnit,
        allowanceBps: definition.defaultAllowanceBps,
        allowanceRevision: 0,
      });
    }
    readPackage(captured, chain);
  };
  /** Validates every affected value before publishing the prepared maps, including empty packages. */
  const materialize = (
    captured: MemoryStepCatalogueTables,
    organizationId: string,
    scope: StepScope,
  ): void => {
    for (const [id, workPackage] of context.packages) {
      const owner = context.packageOrganization.get(id);
      const parent = context.projects.get(workPackage.projectId);
      if (
        owner !== undefined &&
        owner !== organizationId &&
        parent?.organizationId !== organizationId
      )
        continue;
      if (owner === undefined && parent?.organizationId !== organizationId) continue;
      if (scope.scopeKind === 'project' && workPackage.projectId !== scope.scopeId) continue;
      if (scope.scopeKind === 'space' && parent?.spaceId !== scope.scopeId) continue;
      const chain = packageChain(organizationId, id);
      if (chain === null) throw new Error('catalogue reached package disappeared');
      materializePackage(captured, chain);
    }
  };
  const publish = (prepared: MemoryStepCatalogueTables): void => {
    tables.retirements.clear();
    for(const[id,row]of prepared.retirements)tables.retirements.set(id,row);
    tables.definitions.clear();
    for (const [id, row] of prepared.definitions) tables.definitions.set(id, row);
    tables.bindings.clear();
    for (const [id, row] of prepared.bindings) tables.bindings.set(id, row);
    tables.packageValues.clear();
    for (const [id, rows] of prepared.packageValues) tables.packageValues.set(id, rows);
  };
  const ownChains = (organizationId: string): readonly WorkPackageChain[] => {
    const chains: WorkPackageChain[] = [];
    for (const [id, workPackage] of context.packages) {
      if (
        context.packageOrganization.get(id) !== organizationId &&
        context.projects.get(workPackage.projectId)?.organizationId !== organizationId
      )
        continue;
      const chain = packageChain(organizationId, id);
      if (chain === null) throw new Error('catalogue usage package disappeared');
      chains.push(chain);
    }
    return chains.sort((left, right) =>
      compareStepUsageIds(left.workPackageId, right.workPackageId),
    );
  };
  const port: StepCatalogue = {
    async patchStepDefinition(organizationId,stepId,patch,stamp):Promise<StepDefinitionPatched>{
      const owner=readCatalogueId(organizationId,'organization identity'),id=readCatalogueId(stepId,'definition address'),retained=retainStepDefinitionPatch(patch),act=retainCatalogueStamp(stamp);
      return await settleCatalogue<StepDefinitionPatched>(()=>{
        if(!organizationExists(owner))return{ok:false,reason:'not_found'};
        const raw=tables.definitions.get(id);
        if(raw===undefined)return{ok:false,reason:'not_found'};
        const actualOwner=readCatalogueId(raw.organizationId,'definition organization');
        if(!context.organizations.has(actualOwner))throw new Error('catalogue definition organization is absent');
        if(actualOwner!==owner)return{ok:false,reason:'not_found'};
        const current=readStepDefinition(raw);
        if(current.id!==id)throw new Error('catalogue definition identity differs');
        if(captureMemoryStepRetirementsIn(tables,context,owner).has(id))return{ok:false,reason:'not_found'};
        const changed={...current,name:retained.patch.name===undefined?current.name:retained.patch.name,defaultEstimateUnit:retained.patch.defaultEstimateUnit===undefined?current.defaultEstimateUnit:retained.patch.defaultEstimateUnit,defaultAllowancePercent:retained.defaultAllowanceBps===undefined?current.defaultAllowancePercent:retained.defaultAllowanceBps/100};
        if(changed.name===current.name&&changed.defaultEstimateUnit===current.defaultEstimateUnit&&changed.defaultAllowancePercent===current.defaultAllowancePercent)return{ok:true,definition:structuredClone(current),workPackageIds:[],projectIds:[]};
        for(const[candidateId,row]of tables.definitions){if(candidateId===id||row.organizationId!==owner)continue;const existing=readStepDefinition(row);if(existing.name===changed.name)return{ok:false,reason:'name_taken'};}
        const bindings=bindingRows(tables,owner).bindings.filter(binding=>binding.stepId===id);
        const scopes=new Map(bindings.map(binding=>[binding.scopeKind+'\u0000'+binding.scopeId,binding]));
        const targets=mergeMemoryCatalogueTargets([...scopes.values()].map(scope=>captureMemoryCatalogueTargets(tables,context,owner,scope)));
        const touch=prepareMemoryCatalogueTouches(context,targets,act),prepared=structuredClone(tables);
        prepared.definitions.set(id,{...raw,name:changed.name,defaultEstimateUnit:changed.defaultEstimateUnit,defaultAllowanceBps:retained.defaultAllowanceBps===undefined?raw.defaultAllowanceBps:retained.defaultAllowanceBps,updatedAt:act.at});
        publish(prepared);touch();
        return{ok:true,definition:structuredClone(changed),...targets};
      });
    },
    async retireStepDefinition(organizationId,stepId,stamp):Promise<StepDefinitionRetired>{
      const owner=readCatalogueId(organizationId,'organization identity'),id=readCatalogueId(stepId,'definition address'),act=retainCatalogueStamp(stamp);
      return await settleCatalogue<StepDefinitionRetired>(()=>{
        if(!organizationExists(owner))return{ok:false,reason:'not_found'};
        const raw=tables.definitions.get(id);
        if(raw===undefined)return{ok:false,reason:'not_found'};
        const actualOwner=readCatalogueId(raw.organizationId,'definition organization');
        if(!context.organizations.has(actualOwner))throw new Error('catalogue definition organization is absent');
        if(actualOwner!==owner)return{ok:false,reason:'not_found'};
        const definition=readStepDefinition(raw);
        if(definition.id!==id)throw new Error('catalogue definition identity differs');
        if(captureMemoryStepRetirementsIn(tables,context,owner).has(id))return{ok:false,reason:'not_found'};
        const bound=bindingRows(tables,owner).bindings;
        for(const row of tables.bindings.values())if(row.stepId===id&&row.organizationId!==owner)throw new Error('catalogue retirement binding organization is inconsistent');
        if(bound.some(binding=>binding.stepId===id))return{ok:false,reason:'step_bound'};
        const actor=context.usage.users.get(act.by);
        if(actor?.id!==act.by)throw new Error('catalogue retirement actor is absent or inconsistent');
        const prepared=structuredClone(tables);
        prepared.retirements.set(id,{stepId:id,organizationId:owner,retiredAt:act.at,retiredBy:act.by});
        publish(prepared);
        return{ok:true};
      });
    },
    reorderBindings(organizationId,scope,ids,stamp):Promise<StepBindingsReordered>{
      const kept=retainStepReorder(organizationId,scope,ids,stamp);
      return settleCatalogue<StepBindingsReordered>(()=>{
        if(!organizationExists(kept.organizationId)||!scopeExists(kept.organizationId,kept.scope))return{ok:false,reason:'not_found'};
        const captured=bindingRows(tables,kept.organizationId);
        const order=planStepBindingOrder(captured.bindings,kept.scope,kept.ids);
        if(order.kind==='stale_order')return{ok:false,reason:'stale_order'};
        if(order.kind==='unchanged')return{ok:true,workPackageIds:[],projectIds:[]};
        const prepared=structuredClone(tables);
        for(const next of order.positions){
          const binding=prepared.bindings.get(next.bindingId);
          if(binding===undefined)throw new Error('catalogue reorder binding disappeared');
          prepared.bindings.set(next.bindingId,{...binding,position:next.position});
        }
        const targets=captureMemoryCatalogueTargets(tables,context,kept.organizationId,kept.scope);
        const touch=prepareMemoryCatalogueTouches(context,targets,kept.stamp);
        publish(prepared);touch();
        return{ok:true,...targets};
      });
    },
    unbindStep(organizationId, bindingId, options, stamp): Promise<StepUnbindOutcome> {
      return settleCatalogue<StepUnbindOutcome>(() => {
        const kept = retainStepUnbind(organizationId, bindingId, options, stamp);
        if (!organizationExists(kept.organizationId)) return { kind: 'not_found' };
        const raw = tables.bindings.get(kept.bindingId);
        if (raw === undefined) return { kind: 'not_found' };
        const owner = readCatalogueId(raw.organizationId, 'binding organization');
        if (!context.organizations.has(owner))
          throw new Error('catalogue binding organization is absent');
        if (owner !== kept.organizationId) return { kind: 'not_found' };
        const beforeRows = bindingRows(tables, kept.organizationId);
        const bound = beforeRows.bindings.find((binding) => binding.bindingId === kept.bindingId);
        if (bound === undefined) throw new Error('catalogue owned binding disappeared');
        const identities = new Map<string, StepIdentity>();
        for (const [id, row] of tables.definitions) {
          if (row.organizationId !== kept.organizationId) continue;
          const identity = readStepIdentity(row);
          if (identity.id !== id) throw new Error('catalogue definition identity is inconsistent');
          identities.set(id, identity);
        }
        const chains = ownChains(kept.organizationId);
        const captured = captureMemoryStepUsage(tables, context, chains, identities);
        const prepared = structuredClone(tables);
        if (!prepared.bindings.delete(kept.bindingId))
          throw new Error('catalogue candidate binding disappeared');
        const afterRows = bindingRows(prepared, kept.organizationId);
        const usage = projectStepNodesInUse(
          captured.packages,
          projectCatalogueBindings(kept.organizationId, beforeRows.bindings, identities),
          projectCatalogueBindings(kept.organizationId, afterRows.bindings, identities),
          captured.facts,
        );
        if (usage.count > 0)
          return kept.options.dryRun
            ? { kind: 'preview', wouldRefuse: 'step_nodes_in_use', ...usage }
            : { kind: 'step_nodes_in_use', ...usage };
        if (kept.options.dryRun) return { kind: 'preview', wouldRefuse: null };
        const targets=captureMemoryCatalogueTargets(tables,context,kept.organizationId,bound);
        const touch=prepareMemoryCatalogueTouches(context,targets,kept.stamp);
        publish(prepared);
        touch();
        return {
          ...targets,
          kind: 'unbound',

        };
      });
    },
    readManifest(organizationId, projectId) {
      return settleCatalogue(() => {
        const owner = readCatalogueId(organizationId, 'manifest organization'), id = readCatalogueId(projectId, 'manifest project');
        const chain = readProjectChain(owner, id);
        if (chain === null) return null;
        const typeIds: string[] = [];
        for (const [typeId, type] of context.types) {
          if (context.typeOrganization.get(typeId) !== owner) continue;
          // Proof: omission admitted a corrupted type root in the production factory
          // rebound from complete genuine Source evidence; restored green
          // (verification-project-manifest-20261119.json).
          if (type.id !== typeId) throw new Error('manifest owned type identity is inconsistent');
          typeIds.push(typeId);
        }
        const captured = bindingRows(tables, owner, chain);
        return projectStepManifest(chain, context.projects.get(id)?.revision, typeIds, projectCatalogueBindings(owner, captured.bindings, captured.identities));
      });
    },
    readUsage(organizationId): Promise<StepUsageSnapshot | null> {
      const owner = readCatalogueId(organizationId, 'usage organization');
      return settleCatalogue(() => {
        if (!organizationExists(owner)) return null;
        const {bindings} = bindingRows(tables, owner);
        const identities = new Map<string, StepIdentity>();
        for (const [id, row] of tables.definitions) {
          if (row.organizationId !== owner) continue;
          const identity = readStepIdentity(row);
          if (identity.id !== id) throw new Error('catalogue definition identity is inconsistent');
          identities.set(id, identity);
        }
        const captured = captureMemoryStepUsage(tables, context, ownChains(owner), identities);
        return structuredClone({...captured, bindings: projectCatalogueBindings(owner, bindings, identities)});
      });
    },
    readCatalogue(organizationId): Promise<StepCatalogueRows | null> {
      return settleCatalogue<StepCatalogueRows | null>(() => {
        if (!organizationExists(organizationId)) return null;
        const retirements=captureMemoryStepRetirementsIn(tables,context,organizationId);
        const definitions = [...tables.definitions.entries()]
          .filter(([, row]) => row.organizationId === organizationId)
          .sort(([left], [right]) => compareIds(left, right))
          .map(([id, row]) => {
            const definition = readStepDefinition(row);
            if (definition.id !== id) throw new Error('catalogue definition identity differs');
            return definition;
          }).filter(definition=>!retirements.has(definition.id));
        const { bindings } = bindingRows(tables, organizationId);
        bindings.sort((left, right) => compareIds(left.bindingId, right.bindingId));
        return structuredClone({ definitions, bindings });
      });
    },
    readPackage(organizationId, workPackageId): Promise<PackageSteps | null> {
      return settleCatalogue<PackageSteps | null>(() => {
        readCatalogueId(organizationId, 'organization identity');
        readCatalogueId(workPackageId, 'package identity');
        const chain = packageChain(organizationId, workPackageId);
        return chain === null ? null : structuredClone(readPackage(tables, chain));
      });
    },
    defineAndBindStep(organizationId, definition, binding, stamp): Promise<StepDefinedAndBound> {
      return settleCatalogue<StepDefinedAndBound>(() => {
        const retained = retainStepDefinition(definition),
          kept = retained.definition;
        const first = retainStepBinding({ ...binding, stepId: kept.id }),
          act = retainCatalogueStamp(stamp);
        readCatalogueId(organizationId, 'organization identity');
        if (
          !organizationExists(organizationId) ||
          !scopeExists(organizationId, first) ||
          !typeExists(organizationId, first.workItemTypeId)
        )
          return { ok: false, reason: 'not_found' };
        captureMemoryStepRetirementsIn(tables,context,organizationId);
        for (const raw of tables.definitions.values()) {
          if (raw.organizationId !== organizationId) continue;
          const existing = readStepDefinition(raw);
          if (existing.code === kept.code) return { ok: false, reason: 'code_taken' };
        }
        for (const raw of tables.definitions.values()) {
          if (raw.organizationId === organizationId && readStepDefinition(raw).name === kept.name)
            return { ok: false, reason: 'name_taken' };
        }
        if (tables.definitions.has(kept.id) || tables.bindings.has(first.bindingId))
          throw new Error('catalogue new identity is already occupied');
        if (duplicateBinding(tables, first)) return { ok: false, reason: 'duplicate_binding' };
        const prepared = structuredClone(tables);
        const defined: StepDefinition = {
          ...kept,
          organizationId,
          definedAt: { scopeKind: first.scopeKind, scopeId: first.scopeId },
          origin: 'authored',
        };
        const bound: CatalogueStepBinding = { ...first, organizationId, origin: 'authored' };
        prepared.definitions.set(kept.id, {
          id: kept.id,
          organizationId,
          code: kept.code,
          name: kept.name,
          defaultEstimateUnit: kept.defaultEstimateUnit,
          defaultAllowanceBps: retained.defaultAllowanceBps,
          position: kept.position,
          definedAtScopeKind: first.scopeKind,
          definedAtScopeId: first.scopeId,
          origin: 'authored',
          createdAt: act.at,
          createdBy: act.by,
          updatedAt: null,
        });
        prepared.bindings.set(first.bindingId, bound);
        materialize(prepared, organizationId, first);
        const targets=captureMemoryCatalogueTargets(prepared,context,organizationId,first);
        const touch=prepareMemoryCatalogueTouches(context,targets,act);
        publish(prepared);touch();
        return structuredClone({ ok: true, definition: defined, binding: bound, ...targets });
      });
    },
    bindStep(organizationId, binding, stamp): Promise<StepBound> {
      return settleCatalogue<StepBound>(() => {
        const kept = retainStepBinding(binding);
        const act=retainCatalogueStamp(stamp);
        readCatalogueId(organizationId, 'organization identity');
        if (
          !organizationExists(organizationId) ||
          !scopeExists(organizationId, kept) ||
          !typeExists(organizationId, kept.workItemTypeId)
        )
          return { ok: false, reason: 'not_found' };
        const raw = tables.definitions.get(kept.stepId);
        if (raw === undefined) return { ok: false, reason: 'not_found' };
        const owner = readCatalogueId(raw.organizationId, 'definition organization');
        if (!context.organizations.has(owner))
          throw new Error('catalogue definition organization is absent');
        if (owner !== organizationId) return { ok: false, reason: 'not_found' };
        if(captureMemoryStepRetirementsIn(tables,context,organizationId).has(kept.stepId))return {ok:false,reason:'not_found'};
        const definition = readStepDefinition(raw);
        if (definition.id !== kept.stepId) throw new Error('catalogue definition identity differs');
        if (duplicateBinding(tables, kept)) return { ok: false, reason: 'duplicate_binding' };
        if (tables.bindings.has(kept.bindingId))
          throw new Error('catalogue new binding identity is already occupied');
        const prepared = structuredClone(tables);
        const bound: CatalogueStepBinding = { ...kept, organizationId, origin: 'authored' };
        prepared.bindings.set(kept.bindingId, bound);
        materialize(prepared, organizationId, kept);
        const targets=captureMemoryCatalogueTargets(prepared,context,organizationId,kept);
        const touch=prepareMemoryCatalogueTouches(context,targets,act);
        publish(prepared);touch();
        return structuredClone({ ok: true, binding: bound, ...targets });
      });
    },
  };
  return {
    port,
    materializePackage(organizationId, workPackageId) {
      const chain = packageChain(organizationId, workPackageId);
      if (chain === null) throw new Error('catalogue birth package is absent or foreign');
      const prepared: MemoryStepCatalogueTables = {
        definitions: tables.definitions,
        retirements: tables.retirements,
        bindings: tables.bindings,
        packageValues: structuredClone(tables.packageValues),
      };
      materializePackage(prepared, chain);
      const values = prepared.packageValues.get(workPackageId);
      if (values === undefined) throw new Error('catalogue birth values were not prepared');
      tables.packageValues.set(workPackageId, values);
      return { ...chain };
    },
  };
}

/** Real catalogue port over the supplied source/staged maps; no owner is acquired here. */
export function inMemoryStepCatalogue(
  tables: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueContext,
): StepCatalogue {
  return catalogueOperations(tables, context).port;
}

/** Borrows the caller's prepared birth stage and validates all current reached defaults before publishing that package's values. */
export function materializeMemoryPackageStepsIn(
  tables: MemoryStepCatalogueTables,
  context: MemoryStepCatalogueContext,
  organizationId: string,
  workPackageId: string,
): WorkPackageChain {
  return catalogueOperations(tables, context).materializePackage(organizationId, workPackageId);
}
