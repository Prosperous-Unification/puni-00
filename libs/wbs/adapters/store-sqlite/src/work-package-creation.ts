import type {
  NewWorkPackage,
  Step,
  WorkPackage,
  WorkPackageCreationRefusal,
  WorkPackageCreatorGrant,
  WriteStamp,
} from '@wbs/core';
import { suggestWorkPackageAbbreviationCandidates } from '@wbs/domain';
import { and, eq, ne } from 'drizzle-orm';

import { appendGrantAudit } from './access-audit';
import { writeGrantIn } from './access-grant';
import { auditOnCreate, auditOnCreateBesidesCreatedAt } from './audit';
import { isUniqueViolation, messagesOf, UNIQUE_INDEXES } from './constraint';
import type { Drizzle } from './db';
import { readOrganizationActivation } from './organization-activation';
import {
  organization,
  project,
  step,
  workPackage,
  workPackageAbbreviation,
  workPackageOrganization,
  workPackageSolution,
} from './schema';
import { readSettingTargetIn, resolvePackageSettingsIn, writeSettingIn } from './settings';
import { materializePackageStepsIn } from './step-materialization';
import {
  readWorkPackageAbbreviation,
  writeWorkPackageAbbreviation,
} from './work-package-abbreviation';
import { DEFAULT_WORK_PACKAGE_SETTINGS, fromJoined, WITH_SOLUTION } from './work-package-row';
export interface WorkPackageCreationScope {
  readonly organizationId: string;
  readonly creatorGrant: WorkPackageCreatorGrant;
}
/** Borrows the caller's same-connection write owner; every late failure escapes for its rollback. */
export function createWorkPackageIn(
  tx: Drizzle,
  toCreate: NewWorkPackage,
  startingSteps: readonly Step[],
  stamp: WriteStamp,
  scope: WorkPackageCreationScope | null,
): WorkPackage | 'not_found' {
  const organizationId = scope === null ? null : scope.organizationId;
  // Stated here rather than left to the column defaults, because this method
  // answers with the work package it wrote and a caller comparing that answer to a
  // later read must see the same three values. Leaving them out of the INSERT
  // and guessing them in the return would be two sources for one row.
  const settings = {
    optimizationEnabled: toCreate.optimizationEnabled ?? DEFAULT_WORK_PACKAGE_SETTINGS.enabled,
    scheduleEngine: toCreate.scheduleEngine ?? DEFAULT_WORK_PACKAGE_SETTINGS.engine,
    scheduleObjective: toCreate.scheduleObjective ?? DEFAULT_WORK_PACKAGE_SETTINGS.objective,
    // The column's default (`wbs-measure-budgets` D38), stated for the
    // same reason as the three above.
    // Historical factor default above is now resolved from the supplied actual project.
  };
  const written = { ...toCreate, ...settings };

  let parentOrganizationId: string;
  if (scope === null) {
    if (readOrganizationActivation(tx) !== 'pre_activation')
      throw new Error('legacy package creation is inactive');
    const legacy = tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.legacy, true))
      .all();
    const legacyOrganization = legacy.at(0);
    if (legacy.length !== 1 || legacyOrganization === undefined)
      throw new Error('legacy package creation organization is absent or malformed');
    parentOrganizationId = legacyOrganization.id;
  } else parentOrganizationId = scope.organizationId;
  const parent = tx
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, written.projectId), eq(project.organizationId, parentOrganizationId)))
    .get();
  if (parent === undefined) return 'not_found' as const;
  const { abbreviation, solutionRef, pertWeights, ...fields } = written;
  tx.insert(workPackage)
    .values({
      ...fields,
      // PERT is written as a legal own-scope override below.
      // A scoped work package's link lives in `work_package_solution`, unique
      // within its organization. Only a legacy one uses these columns.
      solutionSlug: organizationId === null ? (solutionRef?.slug ?? null) : null,
      solutionUrl: organizationId === null ? (solutionRef?.url ?? null) : null,
      ...auditOnCreateBesidesCreatedAt(stamp),
    })
    .run();
  if (organizationId !== null) {
    tx.insert(workPackageOrganization).values({ resourceId: written.id, organizationId }).run();
    if (solutionRef !== null)
      tx.insert(workPackageSolution)
        .values({ workPackageId: written.id, organizationId, ...solutionRef })
        .run();
  }
  const address = readWorkPackageAbbreviation(tx, written.id);
  if (address === undefined) throw new Error(`created work package ${written.id} vanished`);
  const occupied = new Set(
    tx
      .select({ abbreviation: workPackageAbbreviation.abbreviation })
      .from(workPackageAbbreviation)
      .where(
        and(
          eq(workPackageAbbreviation.namespace, address.namespace),
          ne(workPackageAbbreviation.workPackageId, written.id),
        ),
      )
      .all()
      .map((row) => row.abbreviation),
  );
  const selected =
    abbreviation ??
    suggestWorkPackageAbbreviationCandidates(written.name).find(
      (candidate) => !occupied.has(candidate),
    );
  if (selected === undefined) throw new AbbreviationExhausted();
  writeWorkPackageAbbreviation(tx, written.id, selected);
  if (startingSteps.length > 0)
    tx.insert(step)
      .values(startingSteps.map((starting) => ({ ...starting, ...auditOnCreate(stamp) })))
      .run();
  if (scope !== null) {
    const granted = writeGrantIn(
      tx,
      scope.organizationId,
      {
        id: scope.creatorGrant.id,
        scope: { kind: 'work_package', workPackageId: written.id },
        subject: { kind: 'user', userId: stamp.by },
        roleId: 'package-manager',
        origin: 'creation',
      },
      {
        actor: { kind: 'user', userId: stamp.by },
        at: stamp.at,
        auditId: scope.creatorGrant.auditId,
      },
    );
    if (typeof granted === 'string') throw new Error('package creator grant refused: ' + granted);
    appendGrantAudit(tx, {
      grant: granted.grant,
      action: 'access_granted',
      auditId: scope.creatorGrant.auditId,
      actorId: stamp.by,
      at: stamp.at,
      origin: 'creation',
    });
  }
  const reread = tx
    .select(WITH_SOLUTION)
    .from(workPackage)
    .leftJoin(workPackageAbbreviation, eq(workPackageAbbreviation.workPackageId, workPackage.id))
    .leftJoin(workPackageOrganization, eq(workPackageOrganization.resourceId, workPackage.id))
    .leftJoin(workPackageSolution, eq(workPackageSolution.workPackageId, workPackage.id))
    .where(eq(workPackage.id, written.id))
    .get();
  if (reread === undefined) throw new Error(`created work package ${written.id} vanished`);
  const settingsTarget = readSettingTargetIn(
    tx,
    { level: 'work_package', id: written.id },
    organizationId,
  );
  if (settingsTarget === null) throw new Error('created package settings target vanished');
  // Proof: C0 omitted this call; "materializes the complete catalogue union for an
  // empty package at actual scoped birth using current definition defaults" first
  // observed [] instead of four explicit rows (43 expects). Individual before/after
  // controls passed (51 each); later preservation assertions were unreached in the fault.
  materializePackageStepsIn(tx, settingsTarget.chain);
  if (pertWeights !== undefined) {
    const weightsWritten = writeSettingIn(
      tx,
      settingsTarget,
      { key: 'pertWeights', value: pertWeights },
      stamp,
    );
    if (!weightsWritten.ok)
      throw new Error('validated creation weights refused: ' + weightsWritten.reason);
  }
  return fromJoined(reread, resolvePackageSettingsIn(tx, written.id));
}

/** Rolls back creation when its bounded name family has no available address. */
export class AbbreviationExhausted extends Error {}
/** Existing standalone creation classification; combined callers invoke only after a successful outer rollback. */
export function readWorkPackageCreationRefusal(
  failure: unknown,
): Exclude<WorkPackageCreationRefusal, 'not_found'> | null {
  if (
    failure instanceof AbbreviationExhausted ||
    // Proof: matching the space-separated spelling of the actual trigger message
    // returned 500 instead of 409 in
    // work-package-address.controller.db.test.ts's counter-exhaustion create case.
    messagesOf(failure).some((message) => message === 'work_package abbreviation exhausted')
  )
    return 'abbreviation_exhausted';
  if (isUniqueViolation(failure, UNIQUE_INDEXES.workPackageAbbreviation))
    return 'abbreviation_taken';

  return null;
}
