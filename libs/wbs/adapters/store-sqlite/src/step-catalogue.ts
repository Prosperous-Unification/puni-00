import { retainStepDefinitionPatch } from '@wbs/core/module/step-catalogue/step-retirement';
import { assertStepRetirementProfileIn,captureStepRetirementsIn } from './step-retirement';
import { captureCatalogueProjectIdsIn,mergeCatalogueTargets,touchCatalogueTargetsIn,type CatalogueTargets } from './step-catalogue-touch';
import {
  type CatalogueStepBinding,
  type NewStepBinding,
  type NewStepDefinition,
  type PackageStepRecord,
  type PackageSteps,
  type PackageStepValues,
  projectCatalogueBindings,
  projectPackageSteps,
  projectStepManifest,
  projectStepNodesInUse,
  readCatalogueId,
  readPackageStepValues,
  readStepBinding,
  readStepDefinition,
  readStepIdentity,
  retainCatalogueStamp,
  retainStepBinding,
  retainStepDefinition,
  retainStepUnbind,
  retainStepReorder,
  planStepBindingOrder,
  type StepBindingsReordered,
  type StepBindingRecord,
  type StepBound,
  type StepCatalogue,
  type StepCatalogueRows,
  type StepDefinedAndBound,
  type StepDefinitionPatched,
  type StepDefinitionPatch,
  type StepDefinitionRetired,
  type StepDefinition,
  type StepDefinitionRecord,
  type StepIdentity,
  type StepScope,
  type StepUnbindOptions,
  type StepUnbindOutcome,
  type WriteStamp,
} from '@wbs/core';
import type { ProjectChain, WorkPackageChain } from '@wbs/domain';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import type { Gate } from './gate';
import { stepBinding, stepDefinition } from './schema';
import { readSettingTargetIn } from './settings';
import {
  assertSqliteWriteUsable,
  clearSqliteWriteFailure,
  recordSqliteWriteFailure,
} from './sqlite-write-state';
import { materializePackageStepsIn } from './step-materialization';
import { captureSqliteStepUsage } from './step-usage';

interface JoinedBindingRecord extends StepBindingRecord {
  readonly definitionId: unknown;
  readonly definitionOrganizationId: unknown;
  readonly definitionCode: unknown;
  readonly definitionName: unknown;
  readonly actualTypeId: unknown;
  readonly typeOrganizationId: unknown;
  readonly actualTypeOrganizationId: unknown;
  readonly actualScopeId: unknown;
  readonly scopeOrganizationId: unknown;
}

function decodeBinding(
  row: JoinedBindingRecord,
  organizationId: string,
): { binding: CatalogueStepBinding; identity: StepIdentity } {
  const binding = readStepBinding(row);
  if (binding.organizationId !== organizationId)
    throw new Error('catalogue binding organization is inconsistent');
  const identity = readStepIdentity({
    id: row.definitionId,
    organizationId: row.definitionOrganizationId,
    code: row.definitionCode,
    name: row.definitionName,
  });
  if (identity.id !== binding.stepId || identity.organizationId !== organizationId)
    throw new Error('catalogue binding definition is absent or foreign');
  if (row.actualScopeId !== binding.scopeId || row.scopeOrganizationId !== organizationId)
    throw new Error('catalogue binding scope is absent or foreign');
  if (
    binding.workItemTypeId !== null &&
    (row.actualTypeId !== binding.workItemTypeId ||
      row.typeOrganizationId !== organizationId ||
      row.actualTypeOrganizationId !== organizationId)
  )
    throw new Error('catalogue binding type is absent or foreign');
  return { binding, identity };
}

function readBindingRowsIn(
  db: Pick<Drizzle, 'all'>,
  organizationId: string,
  chain?: ProjectChain | WorkPackageChain,
): JoinedBindingRecord[] {
  const retirements=captureStepRetirementsIn(db,organizationId);
  const selection =
    chain === undefined
      ? sql`b.organization_id=${organizationId}`
      : sql`((b.scope_kind='organization' AND b.scope_id=${chain.organizationId}) OR (b.scope_kind='space' AND b.scope_id=${chain.spaceId}) OR (b.scope_kind='project' AND b.scope_id=${chain.projectId}))`;
  const rows=db.all<JoinedBindingRecord>(sql`SELECT b.id AS "bindingId", b.organization_id AS "organizationId", b.scope_kind AS "scopeKind", b.scope_id AS "scopeId", b.step_id AS "stepId", b.work_item_type_id AS "workItemTypeId", b.position, b.origin,
      d.id AS "definitionId", d.organization_id AS "definitionOrganizationId", d.code AS "definitionCode", d.name AS "definitionName",
      t.id AS "actualTypeId", tm.organization_id AS "typeOrganizationId", type_org.id AS "actualTypeOrganizationId",
      CASE b.scope_kind WHEN 'organization' THEN org.id WHEN 'space' THEN s.id WHEN 'project' THEN p.id END AS "actualScopeId",
      CASE b.scope_kind WHEN 'organization' THEN org.id WHEN 'space' THEN s.organization_id WHEN 'project' THEN p.organization_id END AS "scopeOrganizationId"
      FROM step_binding b LEFT JOIN step_definition d ON d.id=b.step_id
      LEFT JOIN work_item_type t ON t.id=b.work_item_type_id LEFT JOIN work_item_type_organization tm ON tm.resource_id=b.work_item_type_id LEFT JOIN organization type_org ON type_org.id=tm.organization_id
      LEFT JOIN organization org ON b.scope_kind='organization' AND org.id=b.scope_id LEFT JOIN space s ON b.scope_kind='space' AND s.id=b.scope_id LEFT JOIN project p ON b.scope_kind='project' AND p.id=b.scope_id
      WHERE ${selection} ORDER BY b.id COLLATE BINARY`);
  for(const row of rows)if(retirements.has(readCatalogueId(row.stepId,'binding step')))throw new Error('catalogue binding names a retired definition');
  return rows;
}

/** Strict reached binding/definition/type/scope joins on the supplied current writer. */
export function captureCatalogueBindingsIn(
  db: Pick<Drizzle, 'all'>,
  organizationId: string,
  chain: ProjectChain | WorkPackageChain,
) {
  const bindings: CatalogueStepBinding[] = [],
    identities = new Map<string, StepIdentity>();
  for (const row of readBindingRowsIn(db, organizationId, chain)) {
    const decoded = decodeBinding(row, organizationId);
    bindings.push(decoded.binding);
    identities.set(decoded.identity.id, decoded.identity);
  }
  return { bindings: projectCatalogueBindings(organizationId, bindings, identities), identities };
}

export function captureCatalogueChainsIn(
  db: Drizzle,
  organizationId: string,
  scope: StepScope,
): readonly WorkPackageChain[] {
  const packages = db.all<{
    id: unknown;
  }>(sql`SELECT wp.id FROM work_package wp LEFT JOIN work_package_organization m ON m.resource_id=wp.id LEFT JOIN project p ON p.id=wp.project_id
    WHERE (m.organization_id=${organizationId} OR p.organization_id=${organizationId})
    AND (${scope.scopeKind}='organization' OR (${scope.scopeKind}='project' AND wp.project_id=${scope.scopeId}) OR (${scope.scopeKind}='space' AND p.space_id=${scope.scopeId})) ORDER BY wp.id COLLATE BINARY`);
  const chains: WorkPackageChain[] = [];
  for (const row of packages) {
    const id = readCatalogueId(row.id, 'materialized package identity');
    const target = readSettingTargetIn(db, { level: 'work_package', id }, organizationId);
    if (target === null) throw new Error('catalogue reached package target disappeared');
    chains.push(target.chain);
  }
  return chains;
}


const definitionColumns = sql`id, organization_id AS "organizationId", code, name,
  estimate_unit AS "defaultEstimateUnit", default_allowance_bps AS "defaultAllowanceBps", position,
  defined_at_scope_kind AS "definedAtScopeKind", defined_at_scope_id AS "definedAtScopeId", origin`;

/** Only this method creates the marker; the existing executor returns it unchanged only after confirmed rollback. Cleanup aggregates must remain failures. */
class UnbindRollback extends Error {
  constructor(readonly outcome: StepUnbindOutcome) {
    super('catalogue unbind candidate rolled back');
  }
}

/**
 * Current119 persistence over the supplied connection; retained117 physical identities survive retirement. Source public methods use
 * its pool/UoW owners and pass borrowed mode; standalone catalogs use their given
 * gate/connection. Required retirement metadata is checked on that same snapshot, with no alternate source or legacy step table.
 */
export class StepCatalogueRepository implements StepCatalogue {
  private hasUncertainOwner = false;
  constructor(
    private readonly db: Drizzle,
    private readonly gate: Gate,
    private readonly writeScope: 'owned' | 'borrowed',
  ) {}

  /** Runs synchronous borrowed writes inside the supplied writer's savepoint; reads keep the owner's snapshot. */
  private executeBorrowed<T>(kind: 'read' | 'write', work: (db: Drizzle) => T): T {
    if (kind === 'read') return work(this.db);
    this.db.run(sql.raw('SAVEPOINT step_catalogue_write'));
    try {
      const value = work(this.db);
      this.db.run(sql.raw('RELEASE SAVEPOINT step_catalogue_write'));
      return value;
    } catch (primary: unknown) {
      try {
        this.db.run(sql.raw('ROLLBACK TO SAVEPOINT step_catalogue_write'));
      } catch (cleanup: unknown) {
        const failure = new AggregateError(
          [primary, cleanup],
          'catalogue method and savepoint rollback failed',
          { cause: cleanup },
        );
        recordSqliteWriteFailure(this.db, failure);
        // Releasing an unrolled-back savepoint would accept its partial writes. The actual owner must roll back fully.
        throw failure;
      }
      try {
        this.db.run(sql.raw('RELEASE SAVEPOINT step_catalogue_write'));
      } catch (cleanup: unknown) {
        const failure = new AggregateError(
          [primary, cleanup],
          'catalogue method and savepoint release failed',
          { cause: cleanup },
        );
        recordSqliteWriteFailure(this.db, failure);
        throw failure;
      }
      throw primary;
    }
  }

  /** Outer async captures unknown synchronous failures; the actual write segments contain no await. */
  private async execute<T>(kind: 'read' | 'write', work: (db: Drizzle) => T): Promise<T> {
    assertSqliteWriteUsable(this.db);
    if (this.hasUncertainOwner) throw new Error('catalogue transaction owner is uncertain');
    if (this.writeScope === 'borrowed') return this.executeBorrowed(kind, work);
    return await this.gate.enter(() => {
      assertSqliteWriteUsable(this.db);
      if (this.hasUncertainOwner) throw new Error('catalogue transaction owner is uncertain');
      let hasBegun = false;
      try {
        this.db.run(sql.raw(kind === 'write' ? 'BEGIN IMMEDIATE' : 'BEGIN DEFERRED'));
        hasBegun = true;
        const value = work(this.db);
        this.db.run(sql.raw('COMMIT'));
        return Promise.resolve(value);
      } catch (primary: unknown) {
        if (!hasBegun) throw primary;
        try {
          this.db.run(sql.raw('ROLLBACK'));
        } catch (cleanup: unknown) {
          this.hasUncertainOwner = true;
          const failure = new AggregateError(
            [primary, cleanup],
            'catalogue transaction and rollback failed',
            { cause: cleanup },
          );
          recordSqliteWriteFailure(this.db, failure);
          throw failure;
        }
        clearSqliteWriteFailure(this.db);
        throw primary;
      }
    });
  }

  private organizationExists(db: Drizzle, organizationId: string): boolean {
    assertStepRetirementProfileIn(db);
    const row = db
      .all<{ id: unknown }>(sql`SELECT id FROM organization WHERE id=${organizationId}`)
      .at(0);
    if (row !== undefined) {
      if (readCatalogueId(row.id, 'organization identity') !== organizationId)
        throw new Error('catalogue organization identity differs');
      return true;
    }
    const orphan = db
      .all<{ present: number }>(
        sql`SELECT 1 AS present FROM step_definition WHERE organization_id=${organizationId} UNION ALL SELECT 1 AS present FROM step_binding WHERE organization_id=${organizationId} UNION ALL SELECT 1 AS present FROM step_retirement WHERE organization_id=${organizationId} LIMIT 1`,
      )
      .at(0);
    if (orphan !== undefined) throw new Error('catalogue rows name an absent organization');
    return false;
  }

  private scopeExists(db: Drizzle, organizationId: string, scope: StepScope): boolean {
    switch (scope.scopeKind) {
      case 'organization':
        return (
          readSettingTargetIn(db, { level: 'organization', id: scope.scopeId }, organizationId) !==
          null
        );
      case 'space':
        return (
          readSettingTargetIn(db, { level: 'space', id: scope.scopeId }, organizationId) !== null
        );
      case 'project':
        return (
          readSettingTargetIn(db, { level: 'project', id: scope.scopeId }, organizationId) !== null
        );
    }
  }

  private typeExists(db: Drizzle, organizationId: string, typeId: string | null): boolean {
    if (typeId === null) return true;
    const mapping = db
      .all<{ organizationId: unknown; actualOrganizationId: unknown }>(
        sql`SELECT m.organization_id AS "organizationId", o.id AS "actualOrganizationId" FROM work_item_type_organization m LEFT JOIN organization o ON o.id=m.organization_id WHERE m.resource_id=${typeId}`,
      )
      .at(0);
    if (mapping !== undefined) {
      const owner = readCatalogueId(mapping.organizationId, 'type organization');
      if (mapping.actualOrganizationId !== owner)
        throw new Error('catalogue type organization is absent');
      if (owner !== organizationId) return false;
    }
    const actual = db
      .all<{ id: unknown }>(sql`SELECT id FROM work_item_type WHERE id=${typeId}`)
      .at(0);
    if (actual === undefined) {
      if (mapping !== undefined) throw new Error('catalogue owned type header is absent');
      return false;
    }
    if (mapping === undefined) throw new Error('catalogue type ownership is absent');
    if (readCatalogueId(actual.id, 'type identity') !== typeId)
      throw new Error('catalogue type identity differs');
    return true;
  }

  private ownedDefinition(
    db: Drizzle,
    organizationId: string,
    stepId: string,
  ): StepDefinition | null {
    const attribution = db
      .all<{ organizationId: unknown; actualOrganizationId: unknown }>(
        sql`SELECT d.organization_id AS "organizationId", o.id AS "actualOrganizationId" FROM step_definition d LEFT JOIN organization o ON o.id=d.organization_id WHERE d.id=${stepId}`,
      )
      .at(0);
    if (attribution === undefined) return null;
    const owner = readCatalogueId(attribution.organizationId, 'definition organization');
    if (attribution.actualOrganizationId !== owner)
      throw new Error('catalogue definition organization is absent');
    if (owner !== organizationId) return null;
    const row = db
      .all<StepDefinitionRecord>(
        sql`SELECT ${definitionColumns} FROM step_definition WHERE id=${stepId} AND organization_id=${organizationId}`,
      )
      .at(0);
    if (row === undefined) throw new Error('catalogue owned definition disappeared');
    const definition=readStepDefinition(row);
    return captureStepRetirementsIn(db,organizationId).has(stepId)?null:definition;
  }

  /** Edits only active definition metadata; existing package values and allowance revisions remain authored facts. */
  async patchStepDefinition(organizationId:string,stepId:string,patch:StepDefinitionPatch,stamp:WriteStamp):Promise<StepDefinitionPatched>{
    const owner=readCatalogueId(organizationId,'organization address'),id=readCatalogueId(stepId,'definition address'),retained=retainStepDefinitionPatch(patch),act=retainCatalogueStamp(stamp);
    return await this.execute('write',(db):StepDefinitionPatched=>{
      if(!this.organizationExists(db,owner))return{ok:false,reason:'not_found'};
      const current=this.ownedDefinition(db,owner,id);
      if(current===null)return{ok:false,reason:'not_found'};
      const changed={...current,name:retained.patch.name===undefined?current.name:retained.patch.name,defaultEstimateUnit:retained.patch.defaultEstimateUnit===undefined?current.defaultEstimateUnit:retained.patch.defaultEstimateUnit,defaultAllowancePercent:retained.defaultAllowanceBps===undefined?current.defaultAllowancePercent:retained.defaultAllowanceBps/100};
      if(changed.name===current.name&&changed.defaultEstimateUnit===current.defaultEstimateUnit&&changed.defaultAllowancePercent===current.defaultAllowancePercent)return{ok:true,definition:structuredClone(current),workPackageIds:[],projectIds:[]};
      const taken=db.all<{id:unknown}>(sql`SELECT id FROM step_definition WHERE organization_id=${owner} AND name=${changed.name} AND id<>${id}`);
      for(const row of taken)readCatalogueId(row.id,'retained name identity');
      if(taken.length>0)return{ok:false,reason:'name_taken'};
      const bindings=this.bindingRows(db,owner).map(row=>decodeBinding(row,owner).binding).filter(binding=>binding.stepId===id);
      const targets=mergeCatalogueTargets(bindings.map(binding=>this.captureTargets(db,owner,binding)));
      const rows=db.all<{id:unknown}>(sql`UPDATE step_definition SET name=${changed.name},estimate_unit=${changed.defaultEstimateUnit},default_allowance_bps=${Math.round(changed.defaultAllowancePercent*100)},updated_at=${act.at} WHERE id=${id} AND organization_id=${owner} RETURNING id`);
      if(rows.length!==1||rows.at(0)?.id!==id)throw new Error('catalogue definition patch did not update its identity');
      touchCatalogueTargetsIn(db,targets,act);
      return{ok:true,definition:structuredClone(changed),...targets};
    });
  }

  /** Retires only an unbound current identity; physical definitions, WPS, history and cache revisions are retained byte-for-byte. */
  async retireStepDefinition(organizationId:string,stepId:string,stamp:WriteStamp):Promise<StepDefinitionRetired>{
    const owner=readCatalogueId(organizationId,'organization address'),id=readCatalogueId(stepId,'definition address'),act=retainCatalogueStamp(stamp);
    return await this.execute('write',(db):StepDefinitionRetired=>{
      if(!this.organizationExists(db,owner))return{ok:false,reason:'not_found'};
      const current=this.ownedDefinition(db,owner,id);
      if(current===null)return{ok:false,reason:'not_found'};
      const bindings=this.bindingRows(db,owner).map(row=>decodeBinding(row,owner).binding);
      const foreign=db.all<{id:unknown}>(sql`SELECT id FROM step_binding WHERE step_id=${id} AND organization_id<>${owner}`);
      if(foreign.length>0)throw new Error('catalogue retirement binding organization is inconsistent');
      if(bindings.some(binding=>binding.stepId===id))return{ok:false,reason:'step_bound'};
      const actor=db.all<{id:unknown}>(sql`SELECT id FROM users WHERE id=${act.by}`);
      if(actor.length!==1||actor.at(0)?.id!==act.by)throw new Error('catalogue retirement actor is absent or inconsistent');
      const rows=db.all<{stepId:unknown}>(sql`INSERT INTO step_retirement(step_id,organization_id,retired_at,retired_by) VALUES(${id},${owner},${act.at},${act.by}) RETURNING step_id AS "stepId"`);
      if(rows.length!==1||rows.at(0)?.stepId!==id)throw new Error('catalogue retirement did not retain its identity');
      return{ok:true};
    });
  }
  private duplicateBinding(db: Drizzle, binding: NewStepBinding): boolean {
    const row = db
      .all<{ bindingId: unknown }>(
        sql`SELECT id AS "bindingId" FROM step_binding WHERE scope_kind=${binding.scopeKind} AND scope_id=${binding.scopeId} AND step_id=${binding.stepId} AND type_key=${binding.workItemTypeId ?? ''}`,
      )
      .at(0);
    if (row === undefined) return false;
    readCatalogueId(row.bindingId, 'duplicate binding identity');
    return true;
  }

  private scopeChains(db:Drizzle,organizationId:string,scope:StepScope):readonly WorkPackageChain[]{
    return captureCatalogueChainsIn(db,organizationId,scope);
  }

  private captureTargets(db:Drizzle,organizationId:string,scope:StepScope):CatalogueTargets{
    return {workPackageIds:this.scopeChains(db,organizationId,scope).map(chain=>chain.workPackageId),projectIds:captureCatalogueProjectIdsIn(db,organizationId,scope)};
  }

  private materializeScope(db: Drizzle, organizationId: string, scope: StepScope): void {
    for (const chain of this.scopeChains(db, organizationId, scope))
      materializePackageStepsIn(db, chain);
  }

  private bindingRows(
    db: Drizzle,
    organizationId: string,
    chain?: ProjectChain | WorkPackageChain,
  ): JoinedBindingRecord[] {
    return readBindingRowsIn(db, organizationId, chain);
  }

  /** Reorders one actual complete scope on the existing writer/savepoint; values and membership remain intact. */
  async reorderBindings(organizationId:string,scope:StepScope,ids:readonly string[],stamp:WriteStamp):Promise<StepBindingsReordered>{
    const kept=retainStepReorder(organizationId,scope,ids,stamp);
    return await this.execute('write',(db):StepBindingsReordered=>{
      if(!this.organizationExists(db,kept.organizationId)||!this.scopeExists(db,kept.organizationId,kept.scope))return{ok:false,reason:'not_found'};
      const bindings=this.bindingRows(db,kept.organizationId).map(row=>decodeBinding(row,kept.organizationId).binding);
      const order=planStepBindingOrder(bindings,kept.scope,kept.ids);
      if(order.kind==='stale_order')return{ok:false,reason:'stale_order'};
      if(order.kind==='unchanged')return{ok:true,workPackageIds:[],projectIds:[]};
      const targets=this.captureTargets(db,kept.organizationId,kept.scope);
      for(const next of order.positions){
        const changed=db.all<{id:unknown}>(sql`UPDATE step_binding SET position=${next.position} WHERE id=${next.bindingId} AND organization_id=${kept.organizationId} AND scope_kind=${kept.scope.scopeKind} AND scope_id=${kept.scope.scopeId} RETURNING id`);
        // Proof: an actual SQLite trigger suppressed the second UPDATE; omitting this check made the public write resolve instead of reject. Exact restore passed; only zero-row necessity is credited (verification-reorder-lifetime-20261119.json).
        if(changed.length!==1||changed.at(0)?.id!==next.bindingId)throw new Error('catalogue reorder binding disappeared');
      }
      touchCatalogueTargetsIn(db,targets,kept.stamp);
      return{ok:true,...targets};
    });
  }

  /** Proposed DELETE is rolled back locally before any preview/refusal returns, including inside a committing borrowed caller. */
  async unbindStep(
    organizationId: string,
    bindingId: string,
    options: StepUnbindOptions,
    stamp: WriteStamp,
  ): Promise<StepUnbindOutcome> {
    const kept = retainStepUnbind(organizationId, bindingId, options, stamp);
    try {
      return await this.execute('write', (db): StepUnbindOutcome => {
        if (!this.organizationExists(db, kept.organizationId))
          throw new UnbindRollback({ kind: 'not_found' });
        const attribution = db
          .all<{ organizationId: unknown; actualOrganizationId: unknown }>(
            sql`SELECT b.organization_id AS "organizationId", o.id AS "actualOrganizationId" FROM step_binding b LEFT JOIN organization o ON o.id=b.organization_id WHERE b.id=${kept.bindingId}`,
          )
          .at(0);
        if (attribution === undefined) throw new UnbindRollback({ kind: 'not_found' });
        const owner = readCatalogueId(attribution.organizationId, 'binding organization');
        if (attribution.actualOrganizationId !== owner)
          throw new Error('catalogue binding organization is absent');
        if (owner !== kept.organizationId) throw new UnbindRollback({ kind: 'not_found' });
        const beforeRows = this.bindingRows(db, owner).map(
          (row) => decodeBinding(row, owner).binding,
        );
        const bound = beforeRows.find((row) => row.bindingId === kept.bindingId);
        if (bound === undefined) throw new Error('catalogue owned binding disappeared');
        const identities = new Map<string, StepIdentity>();
        for (const row of db.all<StepDefinitionRecord>(
          sql`SELECT ${definitionColumns} FROM step_definition WHERE organization_id=${owner} ORDER BY id COLLATE BINARY`,
        )) {
          const identity = readStepIdentity(row);
          if (identities.has(identity.id))
            throw new Error('catalogue duplicate definition identity');
          identities.set(identity.id, identity);
        }
        const chains = this.scopeChains(db, owner, { scopeKind: 'organization', scopeId: owner });
        const captured = captureSqliteStepUsage(db, owner, chains, identities);
        db.run(
          sql`DELETE FROM step_binding WHERE id=${kept.bindingId} AND organization_id=${owner}`,
        );
        const afterRows = this.bindingRows(db, owner).map(
          (row) => decodeBinding(row, owner).binding,
        );
        const usage = projectStepNodesInUse(
          captured.packages,
          projectCatalogueBindings(owner, beforeRows, identities),
          projectCatalogueBindings(owner, afterRows, identities),
          captured.facts,
        );
        if (usage.count > 0)
          throw new UnbindRollback(
            kept.options.dryRun
              ? { kind: 'preview', wouldRefuse: 'step_nodes_in_use', ...usage }
              : { kind: 'step_nodes_in_use', ...usage },
          );
        if (kept.options.dryRun) throw new UnbindRollback({ kind: 'preview', wouldRefuse: null });
        const targets=this.captureTargets(db,owner,bound);
        touchCatalogueTargetsIn(db,targets,kept.stamp);
        return { kind: 'unbound', ...targets };
      });
    } catch (cause: unknown) {
      if (cause instanceof UnbindRollback) return structuredClone(cause.outcome);
      throw cause;
    }
  }

  async readManifest(organizationId: string, projectId: string) {
    const owner = readCatalogueId(organizationId, 'manifest organization'), id = readCatalogueId(projectId, 'manifest project');
    return await this.execute('read', db => {
      const target = readSettingTargetIn(db, {level: 'project', id}, owner);
      if (target === null) return null;
      const revision = db.all<{revision: unknown}>(sql`SELECT revision FROM project WHERE id=${id} AND organization_id=${owner}`).at(0)?.revision;
      const types = db.all<{id: unknown; actualId: unknown}>(sql`SELECT mapping.resource_id AS id, actual.id AS "actualId" FROM work_item_type_organization mapping LEFT JOIN work_item_type actual ON actual.id=mapping.resource_id WHERE mapping.organization_id=${owner}`);
      const typeIds = types.map(type => {
        const typeId = readCatalogueId(type.id, 'manifest work item type');
        // Proof: omission admitted an owned persisted mapping with no actual type header;
        // FK enforcement was restored before public read. Exact restore passed
        // (verification-project-manifest-20261119.json).
        if (type.actualId !== typeId) throw new Error('manifest owned type header is absent or inconsistent');
        return typeId;
      });
      const captured = captureCatalogueBindingsIn(db, owner, target.chain);
      return projectStepManifest(target.chain, revision, typeIds, captured.bindings);
    });
  }

  async readUsage(organizationId: string) {
    const owner = readCatalogueId(organizationId, 'usage organization');
    return await this.execute('read', db => {
      if (!this.organizationExists(db, owner)) return null;
      const bindings = this.bindingRows(db, owner).map(row => decodeBinding(row, owner).binding);
      const identities = new Map<string, StepIdentity>();
      for (const row of db.all<StepDefinitionRecord>(
        sql`SELECT ${definitionColumns} FROM step_definition WHERE organization_id=${owner} ORDER BY id COLLATE BINARY`,
      )) {
        const identity = readStepIdentity(row);
        // This SELECT has no joins; step_definition.id is the actual primary key.
        identities.set(identity.id, identity);
      }
      const chains = this.scopeChains(db, owner, {scopeKind: 'organization', scopeId: owner});
      const captured = captureSqliteStepUsage(db, owner, chains, identities);
      return {...captured, bindings: projectCatalogueBindings(owner, bindings, identities)};
    });
  }

  async readCatalogue(organizationId: string): Promise<StepCatalogueRows | null> {
    const kept = readCatalogueId(organizationId, 'organization address');
    return await this.execute('read', (db) => {
      if (!this.organizationExists(db, kept)) return null;
      const retirements=captureStepRetirementsIn(db,kept);
      const definitions = db
        .all<StepDefinitionRecord>(
          sql`SELECT ${definitionColumns} FROM step_definition WHERE organization_id=${kept} ORDER BY id COLLATE BINARY`,
        )
        .map(readStepDefinition).filter(definition=>!retirements.has(definition.id));
      return {
        definitions,
        bindings: this.bindingRows(db, kept).map((row) => decodeBinding(row, kept).binding),
      };
    });
  }

  async readPackage(organizationId: string, workPackageId: string): Promise<PackageSteps | null> {
    const owner = readCatalogueId(organizationId, 'organization address'),
      id = readCatalogueId(workPackageId, 'package address');
    return await this.execute('read', (db) => {
      const target = readSettingTargetIn(db, { level: 'work_package', id }, owner);
      if (target === null) return null;
      const bindings: CatalogueStepBinding[] = [],
        identities = new Map<string, StepIdentity>(),
        values = new Map<string, PackageStepValues>();
      for (const row of this.bindingRows(db, owner, target.chain)) {
        const decoded = decodeBinding(row, owner);
        bindings.push(decoded.binding);
        identities.set(decoded.identity.id, decoded.identity);
      }
      const explicit =
        db.all<PackageStepRecord>(sql`SELECT v.work_package_id AS "workPackageId", v.step_id AS "stepId", v.estimate_unit AS "estimateUnit", v.allowance_bps AS "allowanceBps", v.allowance_revision AS "allowanceRevision" FROM work_package_step v WHERE v.work_package_id=${id}
        AND EXISTS(SELECT 1 FROM step_binding b WHERE b.step_id=v.step_id AND ((b.scope_kind='organization' AND b.scope_id=${target.chain.organizationId}) OR (b.scope_kind='space' AND b.scope_id=${target.chain.spaceId}) OR (b.scope_kind='project' AND b.scope_id=${target.chain.projectId})))`);
      for (const row of explicit) {
        const stepId = readCatalogueId(row.stepId, 'explicit package step');
        values.set(stepId, readPackageStepValues(row, id, stepId));
      }
      return projectPackageSteps(target.chain, bindings, identities, values);
    });
  }

  async defineAndBindStep(
    organizationId: string,
    definition: NewStepDefinition,
    binding: Omit<NewStepBinding, 'stepId'>,
    stamp: WriteStamp,
  ): Promise<StepDefinedAndBound> {
    const owner = readCatalogueId(organizationId, 'organization address'),
      retained = retainStepDefinition(definition);
    const kept = retained.definition,
      boundDraft = retainStepBinding({ ...structuredClone(binding), stepId: kept.id }),
      act = retainCatalogueStamp(stamp);
    return await this.execute('write', (db): StepDefinedAndBound => {
      if (
        !this.organizationExists(db, owner) ||
        !this.scopeExists(db, owner, boundDraft) ||
        !this.typeExists(db, owner, boundDraft.workItemTypeId)
      )
        return { ok: false, reason: 'not_found' };
      for (const column of ['code', 'name'] as const) {
        const selected =
          column === 'code'
            ? db
                .all<{ id: unknown }>(
                  sql`SELECT id FROM step_definition WHERE organization_id=${owner} AND code=${kept.code}`,
                )
                .at(0)
            : db
                .all<{ id: unknown }>(
                  sql`SELECT id FROM step_definition WHERE organization_id=${owner} AND name=${kept.name}`,
                )
                .at(0);
        if (selected !== undefined) {
          readCatalogueId(selected.id, 'existing definition identity');
          return { ok: false, reason: column === 'code' ? 'code_taken' : 'name_taken' };
        }
      }
      const created: StepDefinition = {
        ...kept,
        organizationId: owner,
        definedAt: { scopeKind: boundDraft.scopeKind, scopeId: boundDraft.scopeId },
        origin: 'authored',
      };
      const bound: CatalogueStepBinding = {
        ...boundDraft,
        organizationId: owner,
        origin: 'authored',
      };
      db.insert(stepDefinition)
        .values({
          id: created.id,
          organizationId: owner,
          code: created.code,
          name: created.name,
          estimateUnit: created.defaultEstimateUnit,
          defaultAllowancePercent: retained.defaultAllowanceBps / 100,
          position: created.position,
          createdAt: act.at,
          createdBy: act.by,
          updatedAt: null,
          definedAtScopeKind: created.definedAt.scopeKind,
          definedAtScopeId: created.definedAt.scopeId,
          origin: 'authored',
          legacyWorkPackageId: null,
          legacyCode: null,
          legacyCodeCaptured: 0,
        })
        .run();
      db.insert(stepBinding)
        .values({
          id: bound.bindingId,
          organizationId: owner,
          scopeKind: bound.scopeKind,
          scopeId: bound.scopeId,
          stepId: bound.stepId,
          workItemTypeId: bound.workItemTypeId,
          position: bound.position,
          origin: 'authored',
        })
        .run();
      this.materializeScope(db, owner, bound);
      const targets=this.captureTargets(db,owner,bound);
      touchCatalogueTargetsIn(db,targets,act);
      return { ok: true, definition: structuredClone(created), binding: structuredClone(bound), ...targets };
    });
  }

  async bindStep(
    organizationId: string,
    binding: NewStepBinding,
    stamp: WriteStamp,
  ): Promise<StepBound> {
    const owner = readCatalogueId(organizationId, 'organization address'),
      kept = retainStepBinding(binding);
    const act=retainCatalogueStamp(stamp);
    return await this.execute('write', (db): StepBound => {
      if (
        !this.organizationExists(db, owner) ||
        !this.scopeExists(db, owner, kept) ||
        !this.typeExists(db, owner, kept.workItemTypeId)
      )
        return { ok: false, reason: 'not_found' };
      if (this.ownedDefinition(db, owner, kept.stepId) === null)
        return { ok: false, reason: 'not_found' };
      if (this.duplicateBinding(db, kept)) return { ok: false, reason: 'duplicate_binding' };
      const bound: CatalogueStepBinding = { ...kept, organizationId: owner, origin: 'authored' };
      db.insert(stepBinding)
        .values({
          id: bound.bindingId,
          organizationId: owner,
          scopeKind: bound.scopeKind,
          scopeId: bound.scopeId,
          stepId: bound.stepId,
          workItemTypeId: bound.workItemTypeId,
          position: bound.position,
          origin: 'authored',
        })
        .run();
      this.materializeScope(db, owner, bound);
      const targets=this.captureTargets(db,owner,bound);
      touchCatalogueTargetsIn(db,targets,act);
      return { ok: true, binding: structuredClone(bound), ...targets };
    });
  }
}

/** Complete current organization scope on this exact writer; no old-step capture or public-port reread. */
export function captureFirstChildCatalogueIn(db:Drizzle,organizationId:string){
  const identities=new Map<string,StepIdentity>();
  for(const row of db.all<StepDefinitionRecord>(sql`SELECT ${definitionColumns} FROM step_definition WHERE organization_id=${organizationId} ORDER BY id COLLATE BINARY`)){
    const identity=readStepIdentity(row);
    if(identities.has(identity.id))throw new Error('first child definition identity is duplicated');
    identities.set(identity.id,identity);
  }
  const bindings=projectCatalogueBindings(organizationId,readBindingRowsIn(db,organizationId).map(row=>decodeBinding(row,organizationId).binding),identities);
  const chains=captureCatalogueChainsIn(db,organizationId,{scopeKind:'organization',scopeId:organizationId});
  return {...captureSqliteStepUsage(db,organizationId,chains,identities),bindings,identities,chains};
}
