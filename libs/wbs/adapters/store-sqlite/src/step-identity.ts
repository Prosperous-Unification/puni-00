import type { StepIdentityRead } from '@wbs/domain';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';

const CATALOGUE_MIGRATION = '20261115130000_add_step_catalogue';
const CATALOGUE_TABLES = [
  'step_definition',
  'step_binding',
  'work_package_step',
  'step_identity_history',
];

/** Resolves the actual catalogue epoch only when its ledger and required table inventory agree. */
export function readStepStorageEpoch(snapshot: Drizzle): 'pre_catalogue' | 'catalogue' {
  const tables = new Set(
    snapshot
      .all<{ name: string }>(
        sql`
    SELECT name FROM sqlite_master WHERE type='table'
      AND name IN ('__drizzle_migrations','step','step_definition','step_binding','work_package_step','step_identity_history')
  `,
      )
      .map((row) => row.name),
  );
  if (!tables.has('__drizzle_migrations'))
    throw new Error('saved step identity epoch has no migration ledger');
  const applied = snapshot.all<{ name: unknown; hash: unknown; created_at: unknown }>(sql`
    SELECT name,hash,created_at FROM __drizzle_migrations WHERE name=${CATALOGUE_MIGRATION}
  `);
  if (applied.length === 0) {
    if (!tables.has('step') || CATALOGUE_TABLES.some((name) => tables.has(name)))
      throw new Error('saved step identity schema disagrees with its pre-catalogue ledger');
    return 'pre_catalogue';
  }
  const migration = applied.at(0);
  // Proof: H01 replaced this whole epoch condition with false. The timestamp-only
  // "refuses an admitted saved read when only the applied catalogue117 timestamp
  // differs from its folder identity" test received rejected=false; restored passed.
  // This does not independently prove the other coherence conjuncts.
  if (
    applied.length !== 1 ||
    migration?.name !== CATALOGUE_MIGRATION ||
    typeof migration.hash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(migration.hash) ||
    migration.created_at !== Date.UTC(2026, 10, 15, 13) ||
    tables.has('step') ||
    CATALOGUE_TABLES.some((name) => !tables.has(name))
  )
    throw new Error('saved step identity schema disagrees with its catalogue ledger');
  return 'catalogue';
}

/**
 * Capture organization-local historical aliases on the caller's existing saved-read loan.
 * Schema and the actual117 ledger must agree; absence of expected state never means no aliases.
 * Coherent foreign definitions are excluded before history metadata decoding. A missing survivor
 * has no reliable organization attribution and refuses generically rather than disappearing.
 * @throws on missing/malformed epoch, package attribution or selected history state.
 */
export function readStepIdentityIn(snapshot: Drizzle, workPackageId: string): StepIdentityRead {
  if (readStepStorageEpoch(snapshot) === 'pre_catalogue') return { kind: 'pre_catalogue' };
  const ownership = snapshot.all<{ organization_id: unknown; actual_organization_id: unknown }>(sql`
    SELECT mapping.organization_id,organization.id AS actual_organization_id
    FROM work_package package
    LEFT JOIN work_package_organization mapping ON mapping.resource_id=package.id
    LEFT JOIN organization ON organization.id=mapping.organization_id
    WHERE package.id=${workPackageId}
  `);
  const selected = ownership.at(0);
  if (
    ownership.length !== 1 ||
    typeof selected?.organization_id !== 'string' ||
    selected.organization_id === '' ||
    selected.actual_organization_id !== selected.organization_id
  )
    throw new Error('saved step identity package attribution is inconsistent');
  const organizationId = selected.organization_id;
  // Proof: H02 removed only OR survivor.id IS NULL. "refuses an admitted saved read
  // for a wholly unattributable orphan alias after foreign keys are restored" received
  // rejected=false; restored passed. This owns orphan candidate retention only.
  const aliases = snapshot.all<{
    old_step_id: unknown;
    step_id: unknown;
    merged_at: unknown;
    survivor_id: unknown;
    organization_id: unknown;
    actual_organization_id: unknown;
    old_definition_id: unknown;
    next_alias: unknown;
  }>(sql`
    SELECT history.old_step_id,history.step_id,history.merged_at,
           survivor.id AS survivor_id,survivor.organization_id,
           organization.id AS actual_organization_id,
           old_definition.id AS old_definition_id,next.old_step_id AS next_alias
    FROM step_identity_history history
    LEFT JOIN step_definition survivor ON survivor.id=history.step_id
    LEFT JOIN organization ON organization.id=survivor.organization_id
    LEFT JOIN step_definition old_definition ON old_definition.id=history.old_step_id
    LEFT JOIN step_identity_history next ON next.old_step_id=history.step_id
    WHERE survivor.organization_id=${organizationId} OR survivor.id IS NULL
      OR EXISTS(SELECT 1 FROM work_package_step included
                WHERE included.work_package_id=${workPackageId} AND included.step_id=history.step_id)
    ORDER BY history.old_step_id COLLATE BINARY
  `);
  return {
    kind: 'catalogue',
    aliases: aliases.map((alias) => {
      // Proof: H03 replaced this whole row condition with false. "refuses an admitted
      // saved read for a wholly unattributable orphan alias after foreign keys are restored"
      // received rejected=false; restored passed. Only that orphan premise owns this
      // whole refusal; individual decoder conjuncts and mutant typechecking are unproved.
      if (
        typeof alias.survivor_id !== 'string' ||
        alias.organization_id !== organizationId ||
        alias.actual_organization_id !== organizationId ||
        typeof alias.old_step_id !== 'string' ||
        typeof alias.step_id !== 'string' ||
        alias.step_id !== alias.survivor_id ||
        alias.old_step_id === alias.step_id ||
        typeof alias.merged_at !== 'number' ||
        !Number.isSafeInteger(alias.merged_at) ||
        alias.old_definition_id !== null ||
        alias.next_alias !== null
      )
        throw new Error('saved step identity history is inconsistent');
      return { oldStepId: alias.old_step_id, stepId: alias.step_id };
    }),
  };
}
