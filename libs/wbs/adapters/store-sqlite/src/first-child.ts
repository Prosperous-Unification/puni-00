import {
  decideFirstChildWrite,
  encodeStepUsageLink,
  type FirstChildDecision,
  type FirstChildWrite,
  type FirstChildWriteOutcome,
  prepareFirstChildRelationships,
  projectStepNodesInUse,
  readCatalogueId,
  readStepUsageFacts,
  type WorkItem,
  type WriteStamp,
} from '@wbs/core';
import { assertStepParallel } from '@wbs/domain';
import { eq, sql } from 'drizzle-orm';

import { auditOnCreate, auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import { readSqliteEstimatesIn } from './estimate-reads';
import { readSqliteActualsIn, readSqliteProgressIn } from './point-reads';
import { moveResourceUseLocationsIn } from './resource-use-location';
import { bumpWorkItems } from './revision';
import { typedDependency, workItem, workItemTeam } from './schema';
import { readSettingTargetIn } from './settings';
import { captureFirstChildCatalogueIn } from './step-catalogue';
import {
  readSqliteAttemptsIn,
  readSqliteIssuedIn,
  readSqliteMeasureEstimatesIn,
  readSqliteMeasuresIn,
} from './tuple-reads';
import { readTypedDependency } from './typed-dependency';

function requireInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('first child ' + label + ' is not a safe integer');
  return value;
}

/** Remaining physical scalar/holder payloads are checked before the first mutation, not inferred from key-only usage capture. */
function validateFirstChildPayloadsIn(
  db: Drizzle,
  organizationId: string,
  workPackageId: string,
  workItemId: string,
) {
  readSqliteEstimatesIn(db, workPackageId, [workItemId]);
  readSqliteActualsIn(db, workPackageId, [workItemId]);
  readSqliteProgressIn(db, workPackageId, [workItemId]);
  readSqliteMeasuresIn(db, workPackageId, [workItemId]);
  readSqliteMeasureEstimatesIn(db, workPackageId, [workItemId]);
  const attempts = readSqliteAttemptsIn(db, workPackageId, [workItemId]);
  readSqliteIssuedIn(db, workPackageId, [workItemId]);
  for (const row of db.all<{ personId: unknown; actualPersonId: unknown; organizationId: unknown }>(
    sql`SELECT a.person_id AS "personId",p.id AS "actualPersonId",m.organization_id AS "organizationId" FROM assignment a LEFT JOIN person p ON p.id=a.person_id LEFT JOIN person_organization m ON m.resource_id=a.person_id WHERE a.work_item_id=${workItemId}`,
  )) {
    if (
      readCatalogueId(row.personId, 'first child assignee') !== row.actualPersonId ||
      row.organizationId !== organizationId
    )
      throw new Error('first child assignee is absent or foreign');
  }
  for (const row of db.all<{ blockedAt: unknown }>(
    sql`SELECT blocked_at AS "blockedAt" FROM step_blockage WHERE work_item_id=${workItemId}`,
  ))
    requireInteger(row.blockedAt, 'blocked time');
  for (const row of db.all<{ maxParallel: unknown }>(
    sql`SELECT max_parallel AS "maxParallel" FROM step_parallel WHERE work_item_id=${workItemId}`,
  )) {
    if (typeof row.maxParallel !== 'number')
      throw new Error('first child parallelism is malformed');
    assertStepParallel(row.maxParallel);
  }
  for (const row of db.all<{
    resourceId: unknown;
    actualResourceId: unknown;
    organizationId: unknown;
    units: unknown;
  }>(
    sql`SELECT d.resource_id AS "resourceId",r.id AS "actualResourceId",m.organization_id AS "organizationId",d.units FROM work_item_resource_demand d LEFT JOIN resource r ON r.id=d.resource_id LEFT JOIN resource_organization m ON m.resource_id=d.resource_id WHERE d.work_item_id=${workItemId}`,
  )) {
    if (
      readCatalogueId(row.resourceId, 'first child demand resource') !== row.actualResourceId ||
      row.organizationId !== organizationId ||
      requireInteger(row.units, 'demand units') < 1
    )
      throw new Error('first child demand resource or units are inconsistent');
  }
  for (const row of db.all<{
    resourceId: unknown;
    actualResourceId: unknown;
    organizationId: unknown;
    units: unknown;
  }>(
    sql`SELECT o.resource_id AS "resourceId",r.id AS "actualResourceId",m.organization_id AS "organizationId",o.units FROM claim_occupancy o JOIN claim c ON c.id=o.claim_id LEFT JOIN resource r ON r.id=o.resource_id LEFT JOIN resource_organization m ON m.resource_id=o.resource_id WHERE c.work_item_id=${workItemId}`,
  )) {
    if (
      readCatalogueId(row.resourceId, 'first child occupancy resource') !== row.actualResourceId ||
      row.organizationId !== organizationId ||
      requireInteger(row.units, 'occupancy units') < 1
    )
      throw new Error('first child occupancy resource or units are inconsistent');
  }
  const claimIds = db
    .all<{ id: unknown }>(
      sql`SELECT id FROM claim WHERE work_item_id=${workItemId} AND step_id IS NOT NULL ORDER BY id COLLATE BINARY`,
    )
    .map(({ id }) => readCatalogueId(id, 'moving first child claim'));
  return {
    claimIds,
    attempts: attempts.map(({ stepId, attemptNumber, executorPersonId }) => ({
      stepId,
      attemptNumber,
      executorPersonId,
    })),
  };
}

/** Move retained trios first: the existing token mirror then upserts the moved single-point row without replacing its creation or basis columns. */
function moveMeasuredFactsIn(db: Drizzle, from: string, to: string, stamp: WriteStamp): void {
  db.run(
    sql`UPDATE measure_estimate SET work_item_id=${to},updated_at=${stamp.at} WHERE work_item_id=${from}`,
  );
  db.run(
    sql`UPDATE step_measure SET work_item_id=${to},updated_at=${stamp.at} WHERE work_item_id=${from}`,
  );
}

/**
 * Same-writer first-child transition. The caller owns writeSubtreeIn and the
 * actual Source gate/loan. Every query and mutation here is synchronous; failed
 * decoding/constraint execution leaves cleanup and unknown causes with that
 * owner. No foreign incident or append-only runtime-history row is rewritten.
 */
export function writeFirstChildIn(
  db: Drizzle,
  write: FirstChildWrite,
  stamp: WriteStamp,
  actualParent: WorkItem | null,
  actualChild: WorkItem | null,
): FirstChildWriteOutcome;
export function writeFirstChildIn(
  db: Drizzle,
  write: FirstChildWrite,
  stamp: WriteStamp,
  actualParent: WorkItem | null,
  actualChild: WorkItem | null,
  purpose: 'inspect',
): FirstChildDecision;
export function writeFirstChildIn(
  db: Drizzle,
  write: FirstChildWrite,
  stamp: WriteStamp,
  actualParent: WorkItem | null,
  actualChild: WorkItem | null,
  purpose?: 'inspect',
): FirstChildWriteOutcome | FirstChildDecision {
  const child = write.kind === 'fresh' ? write.child : write.record.child;
  if (actualParent === null) return { kind: 'not_found' };
  const target = readSettingTargetIn(db, { level: 'work_package', id: child.workPackageId }, null);
  if (target === null) throw new Error('first child package is absent');
  const captured = captureFirstChildCatalogueIn(db, target.chain.organizationId);
  const local = db
    .select()
    .from(typedDependency)
    .where(eq(typedDependency.workPackageId, child.workPackageId))
    .all()
    .map(readTypedDependency);
  const relationships = prepareFirstChildRelationships(write, local);
  const links = new Set(
    db
      .all<{ workPackageId: unknown; stepId: unknown }>(
        sql`SELECT p.work_package_id AS "workPackageId",p.step_id AS "stepId" FROM work_package_step p WHERE p.work_package_id IN (SELECT value FROM json_each(${JSON.stringify(captured.chains.map(({ workPackageId }) => workPackageId))}))`,
      )
      .map((row) =>
        encodeStepUsageLink(
          readCatalogueId(row.workPackageId, 'first child linked package'),
          readCatalogueId(row.stepId, 'first child linked step'),
        ),
      ),
  );
  const detached = readStepUsageFacts(
    captured.packages,
    captured.identities,
    links,
    relationships.detachedFacts,
  );
  const decision = decideFirstChildWrite(
    captured.packages,
    captured.bindings,
    [...captured.facts, ...detached],
    write,
    actualParent,
    actualChild,
  );
  if (decision.kind !== 'ready') return decision;
  // Proof: omission made actual SQLite first-child-inspection commit changes to the complete stored row snapshot.
  if (purpose === 'inspect') return structuredClone(decision);
  if (decision.direction === 'up') {
    for (const table of [
      'work_item_budget',
      'work_item_team',
      'work_item_tag',
      'work_item_service',
      'work_item_work_item_type',
      'work_item_external_ref',
    ] as const) {
      if (
        db.all(
          sql`SELECT 1 FROM ${sql.raw('"' + table + '"')} WHERE work_item_id=${child.id} LIMIT 1`,
        ).length !== 0
      )
        return { kind: 'stale_transition' };
    }
    if (
      db.all(
        sql`SELECT 1 FROM dependency WHERE predecessor_id=${child.id} OR successor_id=${child.id} LIMIT 1`,
      ).length !== 0
    )
      return { kind: 'stale_transition' };
  }
  const moving = validateFirstChildPayloadsIn(
    db,
    target.chain.organizationId,
    child.workPackageId,
    decision.fromWorkItemId,
  );
  // The parent reservation survives down and may already exist on up. Its own stated type and explicit package values remain authoritative.
  readSqliteIssuedIn(db, child.workPackageId, [actualParent.id]);
  for (const moved of write.respaced) {
    const held = db
      .select({ workPackageId: workItem.workPackageId, parentId: workItem.parentId })
      .from(workItem)
      .where(eq(workItem.id, moved.id))
      .get();
    if (held?.workPackageId !== child.workPackageId || held.parentId !== child.parentId)
      throw new Error('first child respaced row is absent, foreign or outside its sibling group');
    db.update(workItem)
      .set({ position: moved.position, ...auditOnUpdate(stamp) })
      .where(eq(workItem.id, moved.id))
      .run();
  }
  if (decision.direction === 'down') {
    db.insert(workItem)
      .values({ ...child, ...auditOnCreate(stamp) })
      .run();
    if (child.serviceTeamId !== null)
      db.insert(workItemTeam)
        .values({ workItemId: child.id, teamId: child.serviceTeamId, ...auditOnCreate(stamp) })
        .run();
  } else {
    // Detach the sole child first so leaf-only native triggers can accept the
    // parent destination while all live facts remain present on this writer.
    db.update(workItem)
      .set({ parentId: null, ...auditOnUpdate(stamp) })
      .where(eq(workItem.id, child.id))
      .run();
  }
  const from = decision.fromWorkItemId,
    to = decision.toWorkItemId;
  moveResourceUseLocationsIn(db, {
    workPackageId: child.workPackageId,
    fromWorkItemId: from,
    toWorkItemId: to,
    ...moving,
  });
  moveMeasuredFactsIn(db, from, to, stamp);
  for (const table of [
    'estimate',
    'actual',
    'step_progress',
    'step_node_attempt',
    'assignment',
    'step_blockage',
  ] as const) {
    db.run(
      sql`UPDATE ${sql.raw('"' + table + '"')} SET work_item_id=${to},updated_at=${stamp.at} WHERE work_item_id=${from}`,
    );
  }
  db.run(
    sql`UPDATE claim SET work_item_id=${to},updated_at=${stamp.at} WHERE work_item_id=${from} AND step_id IS NOT NULL`,
  );
  db.run(
    sql`UPDATE work_item_resource_demand SET work_item_id=${to},updated_at=${stamp.at} WHERE work_item_id=${from}`,
  );
  db.run(
    sql`INSERT INTO step_node_attempt_issued(work_item_id,step_id,issued) SELECT ${to},step_id,issued FROM step_node_attempt_issued WHERE work_item_id=${from} ON CONFLICT(work_item_id,step_id) DO UPDATE SET issued=max(step_node_attempt_issued.issued,excluded.issued)`,
  );
  const changedEndpointIds = new Set<string>();
  for (const dependency of relationships.localAfter) {
    const original = local.find(({ id }) => id === dependency.id);
    if (original === undefined)
      throw new Error('first child original local dependency disappeared');
    if (
      original.predecessor.workItemId === dependency.predecessor.workItemId &&
      original.successor.workItemId === dependency.successor.workItemId
    )
      continue;
    db.update(typedDependency)
      .set({
        predecessorWorkItemId: dependency.predecessor.workItemId,
        successorWorkItemId: dependency.successor.workItemId,
        ...auditOnUpdate(stamp),
      })
      .where(eq(typedDependency.id, dependency.id))
      .run();
    for (const endpoint of [
      original.predecessor,
      original.successor,
      dependency.predecessor,
      dependency.successor,
    ])
      if (endpoint.workItemId !== from && endpoint.workItemId !== to)
        changedEndpointIds.add(endpoint.workItemId);
  }
  bumpWorkItems(db, [...changedEndpointIds], stamp);
  db.update(workItem)
    .set({
      readiness: decision.direction === 'down' ? null : decision.record.parentStatements.readiness,
      hold: decision.direction === 'down' ? null : decision.record.parentStatements.hold,
      ...auditOnUpdate(stamp),
    })
    .where(eq(workItem.id, actualParent.id))
    .run();
  if (decision.direction === 'up') db.delete(workItem).where(eq(workItem.id, child.id)).run();
  bumpWorkItems(
    db,
    decision.direction === 'down' ? [actualParent.id, child.id] : [actualParent.id],
    stamp,
  );
  validateFirstChildPayloadsIn(db, target.chain.organizationId, child.workPackageId, to);
  const after = captureFirstChildCatalogueIn(db, target.chain.organizationId);
  const afterDetached = readStepUsageFacts(
    after.packages,
    after.identities,
    links,
    relationships.detachedFactsAfter,
  );
  projectStepNodesInUse(after.packages, after.bindings, after.bindings, [
    ...after.facts,
    ...afterDetached,
  ]);
  return { kind: 'written', record: structuredClone(decision.record) };
}
