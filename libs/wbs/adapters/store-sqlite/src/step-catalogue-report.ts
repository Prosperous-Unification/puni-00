import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  classifyStepMigration,
  type StepMigrationCapture,
  type StepMigrationIssue,
} from '@wbs/domain';
import { parseOrThrow, type } from '@wbs/validation';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { captureStepMigration } from './step-catalogue-report-capture';

/** Complete seven-kind report; rules validation and the guarded catalogue apply are separate. */
export interface StepMigrationReport {
  readonly fingerprint: string;
  readonly rows: readonly StepMigrationIssue[];
}

function readReportSubject(issue: StepMigrationIssue): string {
  switch (issue.kind) {
    case 'shared_code_identical':
    case 'shared_code':
      return issue.code;
    case 'uncoded':
      return issue.stepId;
    case 'name_clash':
      return issue.name;
    case 'divergent_project_set':
      return issue.projectId;
    case 'type_conflict_leaf':
      return issue.workItemId;
    case 'foreign_package_fact':
      return JSON.stringify([issue.table, issue.column, issue.workItemId, issue.stepId]);
  }
}

/**
 * Captures, classifies and refreshes all seven owned report kinds on one supplied connection
 * and IMMEDIATE writer transaction. Its fingerprint covers every captured source cell that
 * informs package/code sets, the current tree/type memberships and protected fact references,
 * including claim lease/revocation/delegation fields. The returned report is detached.
 * Only step_migration_report is written. Historical bytes/hashes/IDs, facts and live steps are
 * untouched; no rule file is inferred, catalogue migration applied, or source constructed.
 * Unknown future report kinds are not deleted by this writer's finite owned-kind set.
 * The synchronous caller retains and closes its actual owner after return/throw.
 * @throws on malformed captured trusted state or any transactional storage failure.
 */
export function reportStepCatalogue(db: Drizzle, at: number): StepMigrationReport {
  return db.transaction(
    (tx) => {
      const capture = captureStepMigration(tx);
      const rows = classifyStepMigration(capture);
      const fingerprint = fingerprintStepMigration(capture);
      tx.run(
        sql`DELETE FROM step_migration_report WHERE kind IN ('shared_code_identical','shared_code','uncoded','name_clash','divergent_project_set','type_conflict_leaf','foreign_package_fact')`,
      );
      for (const issue of rows)
        tx.run(sql`INSERT INTO step_migration_report(fingerprint,organization_id,kind,subject_id,detail,reported_at)
        VALUES(${fingerprint},${issue.organizationId},${issue.kind},${readReportSubject(issue)},${JSON.stringify(issue)},${at})`);
      return { fingerprint, rows };
    },
    { behavior: 'immediate' },
  );
}

/** Hashes the canonical captured cells shared by reporting and rule validation. */
function fingerprintStepMigration(capture: StepMigrationCapture): string {
  return createHash('sha256')
    .update(JSON.stringify({ version: 2, storage: capture.storage }))
    .digest('hex');
}

// Proof: P03, changing only this survivor object's undeclared-key rule to ignore in the private replica
// made `refuses malformed merge rules with unknown survivor field without writing the store` in
// step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. Only survivor-object
// unknown-key admission is observed.
const SurvivorRule = type({ survivorStepId: 'string > 0' }).onUndeclaredKey('reject');
// Proof: P04, changing only this confirmation object's undeclared-key rule to ignore in the private
// replica made `refuses malformed merge rules with unknown confirmation field without writing the store`
// in step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. The real uncoded step
// and matching suggestion were seeded first.
const UncodedRule = type({ code: 'string > 0' }).onUndeclaredKey('reject');
// Proof: P02, changing only this organization's undeclared-key rule to ignore in the private replica
// made `refuses malformed merge rules with unknown organization projects without writing the store` in
// step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. Only organization-object
// unknown-key admission is observed.
const OrganizationRules = type({
  codes: type({ '[string]': SurvivorRule }),
  uncoded: type({ '[string]': UncodedRule }),
}).onUndeclaredKey('reject');
// Proof: P01, changing only this root's undeclared-key rule to ignore in the private replica made
// `refuses malformed merge rules with unknown root projects without writing the store` in
// step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. Only root unknown-key
// admission is observed.
const MergeRules = type({
  // Proof: P05, replacing literal version 1 with number in the private replica made `refuses malformed
  // merge rules with unsupported version without writing the store` in step-catalogue-report.db.test.ts
  // fail at outcome.rejected: false versus true. The otherwise valid version-2 file was accepted.
  version: '1',
  fingerprint: /^[0-9a-f]{64}$/,
  organizations: type({ '[string]': OrganizationRules }),
}).onUndeclaredKey('reject');

/** The SC23 file authorizes only named divergent survivors and exact uncoded suggestions. */
export type StepMergeRules = typeof MergeRules.infer;

/** Parses retained SC23 file bytes with the same closed schema used by public preflight. */
export function parseStepMergeRules(json: string): StepMergeRules {
  const candidate: unknown = JSON.parse(json);
  return parseOrThrow(MergeRules, candidate);
}

/** Pure writer-snapshot validation; the caller supplies its fresh capture and already parsed rules. */
export function validateStepMergeRules(
  capture: StepMigrationCapture,
  rules: StepMergeRules,
): StepMergeRules {
  const fingerprint = fingerprintStepMigration(capture);
  // Proof: P06, omitting this fresh-fingerprint comparison in the private replica made `refuses a
  // stale merge-rules fingerprint after an actual step write without refreshing report rows` in
  // step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. The owner changes
  // actual persisted allowance after writing the rules; other fields are not independently proved.
  if (rules.fingerprint !== fingerprint)
    throw new Error('step merge-rules fingerprint does not match current source');
  const issues = classifyStepMigration(capture);
  const organizations = new Set(capture.packages.map((workPackage) => workPackage.organizationId));
  const divergent = issues.filter((issue) => issue.kind === 'shared_code');
  const uncoded = issues.filter((issue) => issue.kind === 'uncoded');
  for (const [organizationId, selected] of Object.entries(rules.organizations)) {
    // Proof: P07, omitting this selected-organization check in the private replica made `refuses merge
    // rules selecting unknown organization without writing the store` in
    // step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. The additional
    // unknown organization has empty selection maps.
    if (!organizations.has(organizationId))
      throw new Error('step merge-rules unknown organization ' + organizationId);
    for (const [code, rule] of Object.entries(selected.codes)) {
      const issue = divergent.find(
        (issue) => issue.organizationId === organizationId && issue.code === code,
      );
      // Proof: P08, replacing this unknown-code throw with continue in the private replica made
      // `refuses merge rules selecting unknown code without writing the store` in
      // step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. This is
      // refusal-to-ignore, not plain deletion followed by an undefined issue dereference.
      if (issue === undefined) throw new Error('step merge-rules unknown divergent code ' + code);
      // Proof: P09, omitting this whole survivor-membership check in the private replica made `refuses
      // merge rules selecting survivor from another code without writing the store` in
      // step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. The selected
      // survivor belongs to another code in the same organization; no independent organization check
      // is proved.
      if (!issue.steps.some((step) => step.id === rule.survivorStepId))
        throw new Error(
          'step merge-rules survivor does not belong to organization and code ' + code,
        );
    }
    for (const [stepId, rule] of Object.entries(selected.uncoded)) {
      const issue = uncoded.find(
        (issue) => issue.organizationId === organizationId && issue.stepId === stepId,
      );
      // Proof: P10, omitting this whole unknown-or-different confirmation check in the private replica
      // made `refuses an uncoded different confirmation before changing any stored state` in
      // step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. Only the actual
      // different-suggestion owner ran; neither disjunct is independently proved.
      if (rule.code !== issue?.suggestedCode)
        throw new Error('step merge-rules unknown or different uncoded confirmation ' + stepId);
    }
  }
  for (const issue of divergent) {
    const selected = Object.hasOwn(rules.organizations, issue.organizationId)
      ? rules.organizations[issue.organizationId]
      : undefined;
    // Proof: P11, omitting this whole required-survivor check in the private replica made `refuses
    // merge rules selecting missing divergent survivor without writing the store` in
    // step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. The actual
    // divergent group has no selection; no independent own-key or absent-organization claim.
    if (selected === undefined || !Object.hasOwn(selected.codes, issue.code))
      throw new Error('step merge-rules missing shared_code survivor ' + issue.code);
  }
  for (const issue of uncoded) {
    const selected = Object.hasOwn(rules.organizations, issue.organizationId)
      ? rules.organizations[issue.organizationId]
      : undefined;
    // Proof: P12, omitting this whole required-confirmation check in the private replica made `refuses
    // an uncoded missing confirmation before changing any stored state` in
    // step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true. The actual uncoded
    // step has no confirmation; no independent own-key or absent-organization claim.
    if (selected === undefined || !Object.hasOwn(selected.uncoded, issue.stepId))
      throw new Error('step merge-rules missing uncoded confirmation ' + issue.stepId);
  }
  return rules;
}

/**
 * Reads and validates a strict SC23 operator file against a fresh capture on the supplied
 * connection's read transaction. No report row, source row or file is written. Identical
 * groups retain their deterministic automatic survivor and cannot be overridden here.
 * The returned rules are detached values, not activation authority: apply must validate
 * them again on its admitted writer snapshot and refuse unresolved structural issues.
 * @throws for missing/unreadable/malformed files, stale captures, unknown selections,
 * missing divergent survivors or missing/different uncoded confirmations.
 */
export function readStepMergeRules(db: Drizzle, path: string): StepMergeRules {
  const rules = parseStepMergeRules(readFileSync(path, 'utf8'));
  return db.transaction((transaction) =>
    validateStepMergeRules(captureStepMigration(transaction), rules),
  );
}
