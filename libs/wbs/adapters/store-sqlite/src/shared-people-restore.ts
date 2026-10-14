import type { ProjectEvent } from '@wbs/core';
import { and, asc, eq } from 'drizzle-orm';

import { auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import { DrizzleEventLogStore } from './event-log';
import { OPEN } from './gate';
import { readOrganizationActivation } from './organization-activation';
import { restoreProjectRanks } from './project-rank-rollback';
import {
  organization,
  organizationMembership,
  projectOrganization,
  projectRank,
  sharedPeopleAudit,
  sharedPeopleRestoreApproval,
  sharedPeopleRestoreConsumption,
  sharedPeopleRestoreOperation,
  sharedPeopleRestoreReceipt,
} from './schema';
import { digestSharedPeople, readSharedPeopleBackup } from './shared-people-backup';
import { decodeSharedPeople } from './shared-people-mode';

/** Operator references name personal durable evidence, never actor/session authority. */
export interface RestoreBinding {
  operationId: string;
  approvalIds: readonly string[];
}
/** Stable committed outcome; identical cold retries return these original facts without replay. */
export interface RestoreReceipt {
  operationId: string;
  backupDigest: string;
  completedAt: number;
  organizations: number;
  ranks: number;
  modeChanges: number;
  events: number;
  approvalIds: readonly string[];
}

/**
 * Restores modes/ranks and personal approval evidence on one immediate borrowed writer.
 * Receipt validation precedes current eligibility; later edits cannot cause replay. Rank recovery
 * borrows this transaction's savepoint and event writes use recordEventIn without public gates.
 * @throws for foreign operation/digest/approval bindings, missing eligibility or current authority,
 * incomplete receipt state, and every SQLite failure. Nothing commits partially.
 */
export function restoreApprovedSharedPeople(
  db: Drizzle,
  backup: unknown,
  binding: RestoreBinding,
  at: number,
): RestoreReceipt {
  const saved = readSharedPeopleBackup(backup);
  const digest = digestSharedPeople(saved);
  // Proof: removing reference validation admitted empty/duplicate external references in the owner DB test.
  if (
    binding.operationId === '' ||
    binding.approvalIds.some((id) => id === '') ||
    new Set(binding.approvalIds).size !== binding.approvalIds.length
  )
    throw new Error('invalid restore operation/approval references');
  const approvalIds = [...binding.approvalIds].sort();
  const changed = new Set([
    ...saved.organizations
      .filter((organization) => organization.mode === 'shared')
      .map((organization) => organization.organizationId),
    ...saved.ranks.map((rank) => rank.organizationId),
  ]);
  const eventLog = new DrizzleEventLogStore(db, OPEN);
  return db.transaction(
    (tx): RestoreReceipt => {
      const operation = tx
        .select()
        .from(sharedPeopleRestoreOperation)
        .where(eq(sharedPeopleRestoreOperation.id, binding.operationId))
        .get();
      // Proof: bypassing digest equality failed the foreign-operation/canonical-backup negative.
      if (operation?.backupDigest !== digest)
        throw new Error('restore operation binding does not match canonical backup digest');
      const receipt = tx
        .select()
        .from(sharedPeopleRestoreReceipt)
        .where(eq(sharedPeopleRestoreReceipt.operationId, operation.id))
        .get();
      // Proof: bypassing this branch replayed a cold completed restore after later rank/membership edits.
      if (receipt !== undefined) {
        const consumed = tx
          .select()
          .from(sharedPeopleRestoreConsumption)
          .where(eq(sharedPeopleRestoreConsumption.operationId, operation.id))
          .orderBy(asc(sharedPeopleRestoreConsumption.approvalId))
          .all();
        // Proof: bypassing receipt binding/completeness admitted changed IDs and deleted consumption.
        if (
          receipt.backupDigest !== digest ||
          consumed.length !== changed.size ||
          consumed.some((approval) => !changed.has(approval.organizationId)) ||
          JSON.stringify(consumed.map((approval) => approval.approvalId)) !==
            JSON.stringify(approvalIds)
        )
          throw new Error('restore receipt approval set or original digest does not match');
        return { ...receipt, approvalIds };
      }
      // Proof: separate activation, saved-org, isolated-mode and empty-rank bypasses failed eligibility negatives.
      if (readOrganizationActivation(tx) !== 'activated')
        throw new Error('restore requires activated organization state');
      const current = tx
        .select({ id: organization.id, mode: organization.sharedPeople })
        .from(organization)
        .all();
      const known = new Set(current.map((organization) => organization.id));
      for (const organization of saved.organizations)
        if (!known.has(organization.organizationId))
          throw new Error(`saved organization ${organization.organizationId} is missing`);
      if (
        current.some((organization) => decodeSharedPeople(organization.mode) !== 0) ||
        tx.select({ id: projectRank.projectId }).from(projectRank).limit(1).get() !== undefined
      )
        throw new Error('restore requires isolated modes and no ranks');
      // Proof: bypassing cardinality admitted the second isolated organization's rank without its approval.
      if (approvalIds.length !== changed.size)
        throw new Error('restore requires exact personal approval set');
      const approved = new Map<string, typeof sharedPeopleRestoreApproval.$inferSelect>();
      for (const id of approvalIds) {
        const approval = tx
          .select()
          .from(sharedPeopleRestoreApproval)
          .where(eq(sharedPeopleRestoreApproval.id, id))
          .get();
        // Proof: bypassing binding admitted a foreign operation/organization approval in the exact-set negative.
        if (
          approval?.operationId !== operation.id ||
          !changed.has(approval.organizationId) ||
          approved.has(approval.organizationId)
        )
          throw new Error('restore approval binding does not match operation/organization');
        // Proof: removing either organization or actor predicate admitted revoked local authority in DB negatives.
        const membership = tx
          .select({ role: organizationMembership.role })
          .from(organizationMembership)
          .where(
            and(
              eq(organizationMembership.organizationId, approval.organizationId),
              eq(organizationMembership.userId, approval.actorId),
            ),
          )
          .get();
        // Proof: bypassing role admitted the demoted/removed personally recorded approver.
        if (membership?.role !== 'super_admin')
          throw new Error('restore approval actor is no longer a super-admin in that organization');
        approved.set(approval.organizationId, approval);
      }
      let modeChanges = 0;
      let events = 0;
      const sharedOrganizations = new Set(
        saved.organizations
          .filter((organization) => organization.mode === 'shared')
          .map((organization) => organization.organizationId),
      );
      for (const approval of approved.values()) {
        // Proof: bypassing this guard audited/emitted events for isolated rank-only recovery.
        if (!sharedOrganizations.has(approval.organizationId)) continue;
        // Proof: substituting isolated mode or an asserted audit actor failed the historical recovery golden test.
        tx.update(organization)
          .set({ sharedPeople: 1, ...auditOnUpdate({ at }) })
          .where(eq(organization.id, approval.organizationId))
          .run();
        tx.insert(sharedPeopleAudit)
          .values({
            id: 'restore:' + JSON.stringify([operation.id, approval.organizationId]),
            organizationId: approval.organizationId,
            actorId: approval.actorId,
            sharedPeople: 1,
            createdAt: at,
          })
          .run();
        modeChanges += 1;
        // Proof: selecting a foreign organization or ranked projects alone failed complete all-project fan-out.
        const projects = tx
          .select({ id: projectOrganization.resourceId })
          .from(projectOrganization)
          .where(eq(projectOrganization.organizationId, approval.organizationId))
          .orderBy(asc(projectOrganization.resourceId))
          .all();
        for (const project of projects) {
          const message: ProjectEvent = {
            type: 'elsewhere_changed',
            projectId: project.id,
            // Proof: substituting the project as cause failed the durable null-cause event assertions.
            causeProjectId: null,
          };
          // Proof: public async writing failed when that writer was broken; borrowed writes still committed.
          eventLog.recordEventIn(tx, 'project:' + project.id, message, at);
          events += 1;
        }
      }
      // Proof: passing db instead of tx opened a second native transaction; the one-writer test failed.
      const ranks = restoreProjectRanks(tx, {
        format: 'project-rank-save',
        version: 1,
        ranks: saved.ranks,
      });
      const completed = {
        operationId: operation.id,
        backupDigest: digest,
        completedAt: at,
        organizations: saved.organizations.length,
        ranks,
        modeChanges,
        events,
      };
      // Proof: omitting either receipt or consumption failed exact durable evidence assertions.
      // Removing the outer transaction left mode/rank/event writes after an injected late consumption failure.
      tx.insert(sharedPeopleRestoreReceipt).values(completed).run();
      for (const approval of approved.values())
        tx.insert(sharedPeopleRestoreConsumption)
          .values({
            approvalId: approval.id,
            operationId: operation.id,
            organizationId: approval.organizationId,
          })
          .run();
      return { ...completed, approvalIds };
    },
    // Proof: deferred allowed a rival membership writer before authorization; the immediate-writer negative failed.
    { behavior: 'immediate' },
  );
}
