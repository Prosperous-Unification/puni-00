import type { CommandCaller } from '@wbs/core/ports/command-access';
import type {
  RefusedOrganizationAccess,
  ResourceAccess,
} from '@wbs/core/ports/organization-access';
import type { PlanEvent, PlanEventFilter } from '@wbs/core/ports/plan-event-values';
import type { SavedPlanRow } from '@wbs/core/ports/saved-plan-values';
import type {
  SavedCurrentCapture,
  SavedPlanReadAddress,
  SavedPlanReadValue,
  WorkPackageObservation,
} from '@wbs/core/ports/work-package-observation';
import type {
  WorkPackageWithSteps,
  ZonedWorkPackageWithSteps,
} from '@wbs/core/ports/work-package-read';
import { authorizePackageAt } from '@wbs/core/service/authorize';
import { sql } from 'drizzle-orm';

import {
  AccessDecisionRepository,
  type PackageTargetRecord,
  readPackageOrganization,
  readPackageTargetRow,
} from './access-decisions';
import { SqliteCommandAccess } from './command-access';
import { type Connection, type Drizzle, observeCommitted } from './db';
import { OPEN } from './gate';
import { MachineCredentialRepository } from './machine-credential';
import { type ActiveOrganizationOf, SqliteOrganizationAccess } from './organization-access';
import { PlanEventRepository } from './plan-event';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import type { SavedCurrentReader } from './saved-current-capture';
import { listSavedPlansIn, readSavedPlanIn } from './saved-plan';
import { WorkPackageRepository } from './work-package';

export interface SqliteWorkPackageObservationOptions {
  readonly openConnection: () => Connection;
  readonly activeOrganizationOf: (snapshot: Drizzle) => ActiveOrganizationOf;
  readonly now: () => number;
  readonly currentCapture: SavedCurrentReader;
}

/**
 * Lazy, pooled committed ordinary reads. Authority and private projection borrow the same
 * connection; no reader capability or mutable database row escapes its observation.
 * Unlike the raw resource helper this owner enforces package.read after current admission.
 */
/** Existing purpose proofs retain historical helper names; current grants use the already-retained full target. */
export class SqliteWorkPackageObservation implements WorkPackageObservation {
  constructor(private readonly options: SqliteWorkPackageObservationOptions) {}

  /**
   * Checks addressed visibility on the existing committed authority observation.
   * Legacy selects only existence; scoped reads validate mapping and parent before admission.
   * Private names, settings, timezone, steps and events are never decoded by this purpose.
   * @throws on malformed owned target state or unexpected acquisition/authority failures.
   */
  async checkRead(caller: CommandCaller, id: string) {
    const actorId = caller.kind === 'human' ? caller.principal.id : caller.actorId;
    return await this.observe(caller, async (snapshot, access): Promise<boolean> => {
      if (access.kind === 'legacy') {
        // Proof: C1: replacing legacy existence with true returned true for the missing ID instead of false.
        // Test: keeps legacy read admission to narrow existence and refuses it after actual activation.
        // Presence result only; later activation checks were unreached.
        // Proof: C2: omitting the legacy addressed WHERE returned true for the missing ID instead of false.
        // Test: keeps legacy read admission to narrow existence and refuses it after actual activation.
        // Addressed legacy predicate only; later activation checks were unreached.
        return (
          snapshot
            .all<{ readonly present: number }>(
              sql`SELECT 1 AS present FROM work_package WHERE id = ${id} LIMIT 1`,
            )
            .at(0) !== undefined
        );
      }
      // Proof: C3: omitting the scoped addressed WHERE returned true for the missing ID instead of false.
      // Test: checks current addressed readability without projecting private package fields.
      // Scoped ID predicate only; later foreign/restricted/private controls were unreached.
      // Proof: C6: changing only mapping LEFT JOIN to JOIN resolved the owned missing-map read instead of
      // rejecting.
      // Test: rejects missing owned read-admission mapping before a lack of grants can hide it.
      // Candidate preservation, distinct from C5; no payload or shared-decoder proof.
      // Proof: C7: changing only parent LEFT JOIN to JOIN resolved the owned missing-parent read instead of
      // rejecting.
      // Test: rejects owned read admission with a missing parent after restoring foreign keys.
      // Candidate preservation only; FK ON is not global integrity and payload was unobserved.
      // Proof: C11: moving target and grants to a fresh loan returned false instead of the held snapshot's
      // true.
      // Test: keeps read-admission target and parent grants on one held snapshot across a rival commit.
      // One combined target/grant loan boundary only; later parent/denial/repair checks were unreached.
      const row = snapshot
        .all<PackageTargetRecord>(
          sql`
          SELECT wp.id AS package_id, mapping.organization_id, wp.project_id,
                 parent.id AS parent_id, parent.organization_id AS parent_organization_id,
               (SELECT actual_owner.id FROM organization actual_owner WHERE actual_owner.id =
                 (SELECT organization_id FROM work_package_organization WHERE resource_id = wp.id)) AS actual_organization_id,
               parent.space_id AS space_id,
               (SELECT selected_space.id FROM space selected_space WHERE selected_space.id = parent.space_id) AS actual_space_id,
               (SELECT selected_space.organization_id FROM space selected_space WHERE selected_space.id = parent.space_id) AS space_organization_id,
               wp.restricted
          FROM work_package wp
          LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
          LEFT JOIN project parent ON parent.id = wp.project_id
          WHERE wp.id = ${id}`,
        )
        .at(0);
      // Proof: C4: omitting the missing-row return threw at row.organization_id before the expected-false
      // assertion.
      // Test: checks current addressed readability without projecting private package fields.
      // The sole fault expect was the earlier open positive; local absence handling only.
      if (row === undefined) return false;
      // Proof: C5: bypassing the strict mapping reader resolved the joined-missing read instead of rejecting.
      // Test: rejects missing owned read-admission mapping before a lack of grants can hide it.
      // Joined SQL NULL forwarding only; resolved payload and shared decoder were unobserved.
      const organizationId = readPackageOrganization(id, row.organization_id);
      // Proof: C8: omitting foreign-map concealment reached malformed parent validation before expected false.
      // Test: keeps a valid foreign read-admission mapping opaque before malformed parent validation.
      // Seven fixture expects ran; false-result and private-decoding assertions were unreached.
      if (organizationId !== access.scope.organizationId) return false;
      // Proof: C9: bypassing the whole strict target reader resolved the owned missing-parent read instead of
      // rejecting.
      // Test: rejects owned read admission with a missing parent after restoring foreign keys.
      // Whole local dependency only; no individual decoder clause or concrete payload proof.
      const target = readPackageTargetRow(row);
      const permission = await authorizePackageAt(
        new AccessDecisionRepository(snapshot),
        access,
        target,
        actorId,
        'package.read',
      );
      // Proof: C10: ignoring the actual permission result returned true for the denied restricted package
      // instead of false.
      // Test: checks current addressed readability without projecting private package fields.
      // Final result enforcement only; authorizePackage still ran and later private/grant controls were
      // unreached.
      return permission.ok;
    });
  }

  /**
   * Current caller authority, narrow target admission and saved header selection share one loan.
   * Legacy checks addressed existence only; no private package fields or saved bodies are read.
   * Detached headers are projected by the caller after the observation has settled.
   */
  async listSaved(caller: CommandCaller, id: string) {
    const actorId = caller.kind === 'human' ? caller.principal.id : caller.actorId;
    return await this.observe(
      caller,
      async (snapshot, access): Promise<readonly SavedPlanRow[] | null> => {
        // Proof: S1 Forced legacy admission exposed revoked-grant headers instead of null.
        // SQL owner:1904; canonical/fault/restored exits 0/1/0.
        if (access.kind === 'legacy') {
          // Proof: S9 Removing the legacy address predicate returned empty instead of absent.
          // SQL owner:1943; canonical/fault/restored exits 0/1/0.
          const present = snapshot
            .all<{ readonly present: number }>(
              sql`SELECT 1 AS present FROM work_package WHERE id = ${id} LIMIT 1`,
            )
            .at(0);
          // Proof: S2 Removing legacy absence handling returned an empty shelf instead of null.
          // SQL owner:1943; canonical/fault/restored exits 0/1/0.
          if (present === undefined) return null;
        } else {
          // Proof: S10 Removing the scoped address predicate returned empty for a missing ID.
          // SQL owner:2088; all stored candidates were owned and readable; canonical/fault/restored exits 0/1/0.
          // Proof: S11 An INNER mapping join hid owned missing-map corruption from rejection.
          // SQL owner:1912, helper:292; payload unobserved; canonical/fault/restored exits 0/1/0.
          // Proof: S12 An INNER parent join hid owned missing-parent corruption from rejection.
          // SQL owner:1917, helper:292; payload unobserved; canonical/fault/restored exits 0/1/0.
          const row = snapshot
            .all<PackageTargetRecord>(
              sql`
          SELECT wp.id AS package_id, mapping.organization_id, wp.project_id,
                 parent.id AS parent_id, parent.organization_id AS parent_organization_id,
               (SELECT actual_owner.id FROM organization actual_owner WHERE actual_owner.id =
                 (SELECT organization_id FROM work_package_organization WHERE resource_id = wp.id)) AS actual_organization_id,
               parent.space_id AS space_id,
               (SELECT selected_space.id FROM space selected_space WHERE selected_space.id = parent.space_id) AS actual_space_id,
               (SELECT selected_space.organization_id FROM space selected_space WHERE selected_space.id = parent.space_id) AS space_organization_id,
               wp.restricted
          FROM work_package wp
          LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
          LEFT JOIN project parent ON parent.id = wp.project_id
          WHERE wp.id = ${id}`,
            )
            .at(0);
          // Proof: S3 Removing scoped absence handling threw on row.organization_id before null equality.
          // SQL owner:1900; canonical/fault/restored exits 0/1/0.
          if (row === undefined) return null;
          // Proof: S4 Bypassing mapping extraction resolved an owned missing-map read instead of rejecting.
          // SQL owner:1912, helper:292; payload unobserved; canonical/fault/restored exits 0/1/0.
          const organizationId = readPackageOrganization(id, row.organization_id);
          // Proof: S5 Removing foreign opacity reached own-parent validation and threw.
          // SQL owner:2017; null equality unreached; canonical/fault/restored exits 0/1/0.
          if (organizationId !== access.scope.organizationId) return null;
          // Proof: S13 Bypassing the local target reader let a missing-parent read resolve.
          // SQL owner:1917, helper:292; payload unobserved; canonical/fault/restored exits 0/1/0.
          const target = readPackageTargetRow(row);
          const permission = await authorizePackageAt(
            new AccessDecisionRepository(snapshot),
            access,
            target,
            actorId,
            'package.read',
          );
          // Proof: S6 Ignoring package.read refusal exposed revoked-grant headers instead of null.
          // SQL owner:1904; canonical/fault/restored exits 0/1/0.
          if (!permission.ok) return null;
        }
        // Proof: S8 A fresh header connection returned Changed instead of held Captured.
        // SQL owner:1984; header snapshot forwarding only; canonical/fault/restored exits 0/1/0.
        return await listSavedPlansIn(snapshot, id);
      },
    );
  }

  /**
   * Saved ownership, current package admission and raw bytes share this observation.
   * Scoped detail checks the independent saved mapping even when its header is missing;
   * comparison preserves addressed-package and wrong-side precedence before that lookup.
   * Legacy retains narrow package absence; integrity, body versions and historical projection
   * run only after this loan settles.
   */
  async readSaved(caller: CommandCaller, address: SavedPlanReadAddress) {
    const retained = { ...address };
    const actorId = caller.kind === 'human' ? caller.principal.id : caller.actorId;
    return await this.observe(caller, async (snapshot, access): Promise<SavedPlanReadValue> => {
      const savedPlanId = retained.savedPlanId;
      const readSavedPackage = () =>
        snapshot
          .all<{ readonly work_package_id: unknown }>(
            sql`
        SELECT work_package_id FROM saved_plan WHERE id = ${savedPlanId}`,
          )
          .at(0);
      const readOrganization = () =>
        snapshot
          .all<{ readonly organization_id: unknown }>(
            sql`
        SELECT organization_id FROM saved_plan_organization WHERE resource_id = ${savedPlanId}`,
          )
          .at(0);
      const readSavedOrganization = (organizationId: unknown) => {
        if (typeof organizationId !== 'string' || organizationId === '')
          throw new Error(
            'saved plan ' + savedPlanId + ' has an absent or malformed organization mapping',
          );
        return organizationId;
      };
      const admitPackage = async (
        id: string,
      ): Promise<'readable' | 'absent' | 'foreign' | 'denied'> => {
        if (access.kind === 'legacy') {
          return snapshot
            .all<{ readonly present: number }>(
              sql`SELECT 1 AS present FROM work_package WHERE id = ${id} LIMIT 1`,
            )
            .at(0) === undefined
            ? 'absent'
            : 'readable';
        }
        const row = snapshot
          .all<PackageTargetRecord>(
            sql`
          SELECT wp.id AS package_id, mapping.organization_id, wp.project_id,
                 parent.id AS parent_id, parent.organization_id AS parent_organization_id,
               (SELECT actual_owner.id FROM organization actual_owner WHERE actual_owner.id =
                 (SELECT organization_id FROM work_package_organization WHERE resource_id = wp.id)) AS actual_organization_id,
               parent.space_id AS space_id,
               (SELECT selected_space.id FROM space selected_space WHERE selected_space.id = parent.space_id) AS actual_space_id,
               (SELECT selected_space.organization_id FROM space selected_space WHERE selected_space.id = parent.space_id) AS space_organization_id,
               wp.restricted
          FROM work_package wp
          LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
          LEFT JOIN project parent ON parent.id = wp.project_id
          WHERE wp.id = ${id}`,
          )
          .at(0);
        if (row === undefined) return 'absent';
        const organizationId = readPackageOrganization(id, row.organization_id);
        if (organizationId !== access.scope.organizationId) return 'foreign';
        const target = readPackageTargetRow(row);
        const permission = await authorizePackageAt(
          new AccessDecisionRepository(snapshot),
          access,
          target,
          actorId,
          'package.read',
        );
        return permission.ok ? 'readable' : 'denied';
      };
      if (retained.kind === 'comparison') {
        if ((await admitPackage(retained.workPackageId)) !== 'readable')
          return { kind: 'package_not_found' };
        const savedPackage = readSavedPackage();
        if (savedPackage?.work_package_id !== retained.workPackageId)
          return { kind: 'saved_plan_not_found' };
        if (access.kind === 'scoped') {
          const mapping = readOrganization();
          const organizationId = readSavedOrganization(mapping?.organization_id);
          if (organizationId !== access.scope.organizationId)
            return { kind: 'saved_plan_not_found' };
        }
      } else {
        let hasOwnedMapping = false;
        if (access.kind === 'scoped') {
          const mapping = readOrganization();
          if (mapping !== undefined) {
            const organizationId = readSavedOrganization(mapping.organization_id);
            if (organizationId !== access.scope.organizationId)
              return { kind: 'saved_plan_not_found' };
            hasOwnedMapping = true;
          }
        }
        const savedPackage = readSavedPackage();
        if (savedPackage === undefined) {
          if (hasOwnedMapping)
            throw new Error('saved plan ' + savedPlanId + ' has an orphan organization mapping');
          return { kind: 'saved_plan_not_found' };
        }
        if (access.kind === 'scoped' && !hasOwnedMapping)
          throw new Error('saved plan ' + savedPlanId + ' has an absent organization mapping');
        if (typeof savedPackage.work_package_id !== 'string' || savedPackage.work_package_id === '')
          throw new Error(
            'saved plan ' + savedPlanId + ' has an absent or malformed package identity',
          );
        const admission = await admitPackage(savedPackage.work_package_id);
        if (admission === 'absent') {
          if (access.kind === 'legacy') return { kind: 'package_not_found' };
          throw new Error('saved plan ' + savedPlanId + ' has an orphan package');
        }
        if (admission === 'foreign')
          throw new Error(
            'saved plan ' + savedPlanId + ' has a foreign package ownership conflict',
          );
        if (admission === 'denied') return { kind: 'package_not_found' };
      }
      // Identity was selected on this same loan; disappearance here is a broken borrowed reader.
      const stored = await readSavedPlanIn(snapshot, savedPlanId);
      // Proof: omitting this guard failed `enforces the borrowed saved reader non-null contract
      // in an isolated real observation`: a controlled helper null return missed rejection,
      // so the parent observed child exit1 instead of0; baseline/fault/restored exits0/1/0.
      if (stored === null)
        throw new Error('saved plan ' + savedPlanId + ' disappeared inside its observation');
      return { kind: 'stored', stored };
    });
  }

  /**
   * Current admission and graph/cache capture borrow the existing observation.
   * Expiry precedes loan settlement; only detached local Fast/final processing follows closure.
   */
  async captureSavedCurrent(
    caller: CommandCaller,
    id: string,
  ): Promise<
    { readonly ok: true; readonly value: SavedCurrentCapture | null } | RefusedOrganizationAccess
  > {
    const actorId = caller.kind === 'human' ? caller.principal.id : caller.actorId;
    const observed = await this.observe(caller, async (snapshot, access) => {
      const lifetime = createReadSnapshotLifetime();
      try {
        if (access.kind === 'legacy') {
          // Proof: C19-legacy — Omitting the legacy WHERE made a missing requested ID reach the
          // admitted-local-disappeared invariant after the present positive. The activation tail was
          // unreached; addressed absence only. Observed in work-package-observation.db.test.ts,
          // "preserves explicit legacy local current capture and refuses it after actual activation"
          // (2026-11-15).
          if (
            snapshot
              .all<{ present: number }>(
                sql`SELECT 1 AS present FROM work_package WHERE id = ${id} LIMIT 1`,
              )
              .at(0) === undefined
          )
            return null;
        } else {
          // Proof: C19-parent-left — Changing this parent LEFT join to INNER made the missing-parent
          // rejection flag false after the missing-map control passed. Resolved payload was unobserved.
          // Observed in work-package-observation.db.test.ts, "keeps current target mapping and parent
          // corruption strict before a denial can hide it" (2026-11-15).
          // Proof: C19-map-left — Changing this map LEFT join to INNER made the missing-map rejection
          // flag false. Resolved payload and the later parent case were unobserved. Observed in
          // work-package-observation.db.test.ts, "keeps current target mapping and parent corruption
          // strict before a denial can hide it" (2026-11-15).
          // Proof: C19-bind — Binding this query to granted secret instead of the requested ID made an
          // actually missing ID reach the admitted-local-disappeared invariant. Addressed absence only,
          // not private payload leakage. Observed in work-package-observation.db.test.ts, "requires
          // configured saved-current capture while preserving ordinary unbound reads and narrow target
          // opacity" (2026-11-15).
          const row = snapshot
            .all<PackageTargetRecord>(
              sql`
            SELECT wp.id AS package_id, mapping.organization_id, wp.project_id,
                   parent.id AS parent_id, parent.organization_id AS parent_organization_id,
               (SELECT actual_owner.id FROM organization actual_owner WHERE actual_owner.id =
                 (SELECT organization_id FROM work_package_organization WHERE resource_id = wp.id)) AS actual_organization_id,
               parent.space_id AS space_id,
               (SELECT selected_space.id FROM space selected_space WHERE selected_space.id = parent.space_id) AS actual_space_id,
               (SELECT selected_space.organization_id FROM space selected_space WHERE selected_space.id = parent.space_id) AS space_organization_id,
               wp.restricted
            FROM work_package wp
            LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
            LEFT JOIN project parent ON parent.id = wp.project_id
            WHERE wp.id = ${id}`,
            )
            .at(0);
          if (row === undefined) return null;
          // Proof: C19-map-forward — Replacing readPackageOrganization with the raw mapping made the
          // missing-map rejection flag false. Local reader forwarding only; resolved payload and the
          // parent tail were unobserved. Observed in work-package-observation.db.test.ts, "keeps
          // current target mapping and parent corruption strict before a denial can hide it"
          // (2026-11-15).
          const organizationId = readPackageOrganization(id, row.organization_id);
          // Proof: C02 — Omitting this foreign-mapping return reached the parent validator before the
          // opaque-null assertion. Foreign-before-parent ordering only; private decoding was not
          // reached. Observed in work-package-observation.db.test.ts, "conceals a current target with a
          // valid foreign mapping before its granted own-parent conflict" (2026-11-15).
          if (organizationId !== access.scope.organizationId) return null;
          // Proof: C19-parent-forward — Passing requested/raw parent facts instead of joined parent
          // evidence made the parent rejection flag false after the missing-map control. Whole local
          // forwarding only; payload and individual decoder clauses were unobserved. Observed in
          // work-package-observation.db.test.ts, "keeps current target mapping and parent corruption
          // strict before a denial can hide it" (2026-11-15).
          const target = readPackageTargetRow(row);
          const permission = await authorizePackageAt(
            new AccessDecisionRepository(snapshot),
            access,
            target,
            actorId,
            'package.read',
          );
          // Proof: C01 — Omitting this package.read refusal made the revoked-reader current/current
          // reply 200 instead of the independently observed 404. Current-target admission only.
          // Observed in visibility.controller.db.test.ts, "conceals a real current/current comparison
          // as absent after its selected reader loses the actual parent grant" (2026-11-15).
          if (!permission.ok) return null;
        }
        lifetime.assertOpen();
        // Proof: C08 — Moving only captureIn to a fresh managed loan returned committed parent beta
        // instead of retained alpha at the first assertion. Later assignment/cache/grant controls were
        // unreached; whole-owner coherence only. Observed in work-package-observation.db.test.ts,
        // "retains current parent grants assignments and both cache objectives across a rival commit
        // without admission" (2026-11-15).
        return await this.options.currentCapture.captureIn(snapshot, access, actorId, id, lifetime);
      } finally {
        // Proof: C10 — Omitting this expiry changed the retained callback's closed-purpose error to the
        // pooled-release error. Diagnostic ordering only: SQL still failed after release. Observed in
        // work-package-observation.db.test.ts, "expires the real current connected scheduler callback
        // when its observation loan settles" (2026-11-15).
        lifetime.expire();
      }
    });
    // Proof: C17a — Omitting this refusal forwarding dereferenced undefined captured.kind after actual
    // activation, before the typed refusal assertion. Earlier legacy present/missing controls passed.
    // Observed in work-package-observation.db.test.ts, "preserves explicit legacy local current capture
    // and refuses it after actual activation" (2026-11-15).
    if (!observed.ok) return observed;
    // Proof: C17b — Omitting this null forwarding dereferenced null captured.kind for the missing
    // package before its equality. Later foreign-target controls were unreached. Observed in
    // work-package-observation.db.test.ts, "requires configured saved-current capture while preserving
    // ordinary unbound reads and narrow target opacity" (2026-11-15).
    if (observed.value === null) return { ok: true, value: null };
    const captured = observed.value;
    // Proof: C09 — Moving finishLocal inside the original loan let its SELECT1 probe succeed instead of
    // throwing after release. Local finish timing only, not generic cleanup. Observed in
    // work-package-observation.db.test.ts, "finishes local saved-current Fast only after the actual
    // borrowed loan is released" (2026-11-15).
    const value: SavedCurrentCapture =
      captured.kind === 'local' ? this.options.currentCapture.finishLocal(captured) : captured;
    return { ok: true as const, value };
  }

  async list(caller: CommandCaller) {
    const actorId = caller.kind === 'human' ? caller.principal.id : caller.actorId;
    return await this.observe(caller, async (snapshot, access) => {
      const packages = new WorkPackageRepository(snapshot, OPEN, 'borrowed');
      if (access.kind === 'legacy') return await packages.listFor(actorId);
      const readable = await new AccessDecisionRepository(snapshot).readablePackageIds(
        access.principal,
        access.scope.organizationId,
      );
      return await packages.listReadableForInOrganization(actorId, access.scope.organizationId, [
        ...readable,
      ]);
    });
  }

  async read(caller: CommandCaller, id: string) {
    const actorId = caller.kind === 'human' ? caller.principal.id : caller.actorId;
    return await this.observe(
      caller,
      async (snapshot, access): Promise<ZonedWorkPackageWithSteps | null> => {
        const packages = new WorkPackageRepository(snapshot, OPEN, 'borrowed');
        if (access.kind === 'scoped') {
          // Proof: changing only the mapping LEFT JOIN below to INNER JOIN made
          // `throws for an owned package with missing mapping even without a readable grant`
          // resolve instead of reject; addressed missing-row preservation only.
          // Proof: changing only the parent LEFT JOIN below to INNER JOIN made
          // `throws for an owned package with a missing parent after restoring foreign keys`
          // resolve instead of reject; foreign_keys ON is not global fixture consistency.
          const row = snapshot
            .all<PackageTargetRecord>(
              sql`
          SELECT wp.id AS package_id, mapping.organization_id, wp.project_id,
                 parent.id AS parent_id, parent.organization_id AS parent_organization_id,
               (SELECT actual_owner.id FROM organization actual_owner WHERE actual_owner.id =
                 (SELECT organization_id FROM work_package_organization WHERE resource_id = wp.id)) AS actual_organization_id,
               parent.space_id AS space_id,
               (SELECT selected_space.id FROM space selected_space WHERE selected_space.id = parent.space_id) AS actual_space_id,
               (SELECT selected_space.organization_id FROM space selected_space WHERE selected_space.id = parent.space_id) AS space_organization_id,
               wp.restricted
          FROM work_package wp
          LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
          LEFT JOIN project parent ON parent.id = wp.project_id
          WHERE wp.id = ${id}`,
            )
            .at(0);
          // Proof: omitting addressed absence handling made
          // `conceals an unreadable restricted package as absent and returns an empty list after real grant removal`
          // receive 500 instead of the earlier absent-ID 404; later restricted checks were unreached.
          if (row === undefined) return null;
          // Proof: bypassing this mapping reader made
          // `throws for an owned package with missing mapping even without a readable grant`
          // resolve instead of reject for joined SQL NULL; local forwarding only.
          const organizationId = readPackageOrganization(id, row.organization_id);
          // Proof: omitting this foreign-map return made
          // `does not parse a valid foreign mapped package parent or private settings through own detail`
          // throw at parent validation before expected null; no private-decoder proof.
          if (organizationId !== access.scope.organizationId) return null;
          const target = readPackageTargetRow(row);
          const permission = await authorizePackageAt(
            new AccessDecisionRepository(snapshot),
            access,
            target,
            actorId,
            'package.read',
          );
          // Proof: omitting denial concealment made
          // `conceals an unreadable restricted package as absent and returns an empty list after real grant removal`
          // receive restricted 200 instead of absent 404; later grant/LIST checks were unreached.
          if (!permission.ok) return null;
        }
        const workPackage = await packages.findById(id);
        if (workPackage === null) return null;
        const timezone = await packages.timezoneOf(id);
        if (timezone === null) throw new Error('work package ' + id + ' has no timezone');
        return { workPackage: { ...workPackage, timezone }, steps: await packages.stepsOf(id) };
      },
    );
  }

  /**
   * Resolves current authority and the addressed package before decoding any history JSON.
   * Scoped reads select only mapping, parent and restriction; package settings, timezone and
   * steps do not participate. Legacy preserves its raw existence check on the same snapshot.
   * Filter arrays are detached before the first awaited acquisition.
   */
  async readHistory(caller: CommandCaller, id: string, filter: PlanEventFilter) {
    const actorId = caller.kind === 'human' ? caller.principal.id : caller.actorId;
    // Proof: H1, aliasing the mutable history filter made the held read return [] instead of [batch] (4/3/4).
    // `retains the complete history caller and mutable filter arrays before awaited current selection`.
    // Composite filter retention only; shared caller capture was unchanged, and later return/per-field checks are uncredited. Watched 2026-11-14.
    const retainedFilter = structuredClone(filter);
    return await this.observe(caller, async (snapshot, access): Promise<PlanEvent[] | null> => {
      if (access.kind === 'legacy') {
        const packages = new WorkPackageRepository(snapshot, OPEN, 'borrowed');
        // Proof: H2, omitting the legacy existence check made a missing package return [] instead of null (6/4/6).
        // `keeps legacy history existence and filtering explicit and refuses it after actual activation`.
        // Recorded-event and empty controls passed; later activation refusal and shared repository internals are uncredited. Watched 2026-11-14.
        if ((await packages.findById(id)) === null) return null;
      } else {
        // Proof: H6, changing only the history parent LEFT JOIN to JOIN made an owned missing-parent read resolve instead of reject (6/5/6).
        // `rejects owned history with a missing parent after restoring foreign key enforcement`.
        // Missing-parent candidate retention only; payload unobserved, and restored FK enforcement is not global fixture integrity. Watched 2026-11-14.
        // Proof: H5, changing only the history mapping LEFT JOIN to JOIN made the missing-mapping read resolve instead of reject (5/4/5).
        // `rejects an owned history target with missing mapping before hiding it for lack of grants`.
        // Local candidate retention, distinct from H4 forwarding; no concrete resolved payload or shared decoder proof. Watched 2026-11-14.
        const row = snapshot
          .all<PackageTargetRecord>(
            sql`
          SELECT wp.id AS package_id, mapping.organization_id, wp.project_id,
                 parent.id AS parent_id, parent.organization_id AS parent_organization_id,
               (SELECT actual_owner.id FROM organization actual_owner WHERE actual_owner.id =
                 (SELECT organization_id FROM work_package_organization WHERE resource_id = wp.id)) AS actual_organization_id,
               parent.space_id AS space_id,
               (SELECT selected_space.id FROM space selected_space WHERE selected_space.id = parent.space_id) AS actual_space_id,
               (SELECT selected_space.organization_id FROM space selected_space WHERE selected_space.id = parent.space_id) AS space_organization_id,
               wp.restricted
          FROM work_package wp
          LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
          LEFT JOIN project parent ON parent.id = wp.project_id
          WHERE wp.id = ${id}`,
          )
          .at(0);
        // Proof: H3, omitting the addressed-absence return made the missing read throw at row.organization_id (4/1/4).
        // `distinguishes readable empty history from absent foreign and unreadable addressed packages`.
        // The fault count is an earlier empty positive; the missing-read expect never ran, and later foreign/restricted checks are uncredited. Watched 2026-11-14.
        if (row === undefined) return null;
        // Proof: H4, bypassing the strict mapping reader made the owned missing-mapping read resolve instead of reject (5/4/5).
        // `rejects an owned history target with missing mapping before hiding it for lack of grants`.
        // Joined-NULL forwarding only; the resolved payload, other mapping forms and shared decoder implementation are uncredited. Watched 2026-11-14.
        const organizationId = readPackageOrganization(id, row.organization_id);
        // Proof: H7, omitting the valid-foreign return made the addressed read throw the parent invariant before expected null (7/6/7).
        // `keeps valid foreign history mapping opaque before own-parent and malformed event decoding`.
        // Six earlier premise expects ran; the null expect and malformed-event decoding were unreached. No shared-decoder proof. Watched 2026-11-14.
        if (organizationId !== access.scope.organizationId) return null;
        const target = readPackageTargetRow(row);
        const permission = await authorizePackageAt(
          new AccessDecisionRepository(snapshot),
          access,
          target,
          actorId,
          'package.read',
        );
        // Proof: H8, omitting the denied-history return made the unreadable read throw while parsing event JSON (5/1/5).
        // `conceals malformed unreadable event JSON then throws when granted without projecting package settings`.
        // The sole expect was the seeded event-row check; the null expect and later granted/repair/settings controls were unreached. Watched 2026-11-14.
        if (!permission.ok) return null;
      }
      // Proof: H9, moving only event projection to a fresh observation returned the new event under the earlier target/authority snapshot (5/2/5).
      // `keeps history parent grant and event bytes on one held snapshot across a rival commit`.
      // Captured epoch/label mismatch only; later parent/denial/grant checks and shared helper/individual-field necessity are uncredited. Watched 2026-11-14.
      return await new PlanEventRepository(snapshot, OPEN).listFor(id, retainedFilter);
    });
  }

  /**
   * Resolves either scoped slug representation before authorizing the selected current target.
   * Valid foreign mappings are excluded before LIMIT2; an owned parent only attributes missing
   * or malformed mapping state for validation. Duplicate candidates throw before permission or
   * private decoding. Legacy keeps its legacy-column-only lookup; neither branch reads timezone.
   * Caller admission, selection, permission and detached projection borrow one committed snapshot.
   */
  async readSolution(caller: CommandCaller, slug: string) {
    const actorId = caller.kind === 'human' ? caller.principal.id : caller.actorId;
    return await this.observe(
      caller,
      async (snapshot, access): Promise<WorkPackageWithSteps | null> => {
        const packages = new WorkPackageRepository(snapshot, OPEN, 'borrowed');
        if (access.kind === 'legacy') {
          const workPackage = await packages.findBySolutionSlug(slug);
          return workPackage === null
            ? null
            : { workPackage, steps: await packages.stepsOf(workPackage.id) };
        }
        const organizationId = access.scope.organizationId;
        // Proof: Q1, whole pre-LIMIT ownership filter omitted; the first foreign-only read threw the duplicate invariant (11/4/11).
        // `excludes two valid foreign same-slug candidates before the scoped limit and still detects two owned matches`.
        // Later owned/private assertions were unreached; no per-term proof. Watched 2026-11-14.
        //
        // Proof: Q2, the malformed-map restriction on parent attribution omitted; the expected-null foreign-map read reached parent validation (4/3/4).
        // `keeps a valid foreign solution mapping under an own parent opaque before malformed private projection`.
        // Local candidate exclusion only; no private estimate or shared-decoder proof. Watched 2026-11-14.
        //
        // Proof: Q3, the whole owned-parent attribution arm omitted; missing-map validation resolved instead of rejecting (6/5/6).
        // `retains an owned-parent solution with an absent mapping for strict validation even without grants`.
        // Missing mapping only, not separate empty/BLOB/BINARY terms or shared-decoder proof. Watched 2026-11-14.
        //
        // Proof: Q4, the owned-map arm omitted; the absent-parent case resolved instead of rejecting (7/6/7).
        // `retains an owned-mapped solution with an absent parent after restoring foreign keys`.
        // Candidate retention only; restored FK ON is not global integrity or decoder necessity. Watched 2026-11-14.
        const candidates = snapshot.all<PackageTargetRecord>(sql`
          SELECT wp.id AS package_id, mapping.organization_id, wp.project_id,
                 parent.id AS parent_id, parent.organization_id AS parent_organization_id,
               (SELECT actual_owner.id FROM organization actual_owner WHERE actual_owner.id =
                 (SELECT organization_id FROM work_package_organization WHERE resource_id = wp.id)) AS actual_organization_id,
               parent.space_id AS space_id,
               (SELECT selected_space.id FROM space selected_space WHERE selected_space.id = parent.space_id) AS actual_space_id,
               (SELECT selected_space.organization_id FROM space selected_space WHERE selected_space.id = parent.space_id) AS space_organization_id,
               wp.restricted
          FROM work_package wp
          LEFT JOIN work_package_organization mapping ON mapping.resource_id = wp.id
          LEFT JOIN project parent ON parent.id = wp.project_id
          LEFT JOIN work_package_solution solution ON solution.work_package_id = wp.id
          WHERE (solution.slug = ${slug} OR wp.solution_slug = ${slug})
            AND (
              (typeof(mapping.organization_id) = 'text'
                AND mapping.organization_id = ${organizationId} COLLATE BINARY)
              OR
              (typeof(parent.organization_id) = 'text'
                AND parent.organization_id = ${organizationId} COLLATE BINARY
                AND (typeof(mapping.organization_id) <> 'text'
                  OR mapping.organization_id = '' COLLATE BINARY))
            )
          LIMIT 2`);
        // Proof: Q5, duplicate rejection omitted; the readable/hidden two-match case resolved instead of rejecting (6/5/6).
        // `rejects an owned solution duplicate across both representations before hiding one unreadable match`.
        // Chosen unordered row and DTO-versus-null were not observed. Watched 2026-11-14.
        if (candidates.length > 1)
          throw new Error(
            'two work packages of organization ' + organizationId + ' hold one solution slug',
          );
        const row = candidates.at(0);
        // Proof: Q6, the missing-slug return omitted; the final absent read reached undefined row.package_id in target decoding (7/6/7).
        // `reads scoped solution-table and retained legacy slugs with the non-zoned detached projection`.
        // Local absence forwarding only; shared decoder necessity is separate. Watched 2026-11-14.
        if (row === undefined) return null;
        const target = readPackageTargetRow(row);
        const id = target.chain.workPackageId;
        const permission = await authorizePackageAt(
          new AccessDecisionRepository(snapshot),
          access,
          target,
          actorId,
          'package.read',
        );
        // Proof: Q7, the denied-target return omitted; the first unreadable read threw invalid-private-setting before expected null (4/1/4).
        // `authorizes the solution target before private decoding and throws once that same target becomes readable`.
        // Local denial before projection only; later granted-corruption and authorization internals unproved. Watched 2026-11-14.
        if (!permission.ok) return null;
        // Proof: Q8, only package projection moved to a fresh observation; captured name/parent became Changed old package/beta with old Dev (4/2/4).
        // `keeps solution slug, current parent, grant and private steps on the same held snapshot`.
        // One package-projection loan only; later fresh read, individual fields and shared lifetime unproved. Watched 2026-11-14.
        const workPackage = await packages.findById(id);
        return workPackage === null ? null : { workPackage, steps: await packages.stepsOf(id) };
      },
    );
  }

  private async observe<T>(
    caller: CommandCaller,
    read: (snapshot: Drizzle, access: ResourceAccess) => Promise<T>,
  ): Promise<{ readonly ok: true; readonly value: T } | RefusedOrganizationAccess> {
    // Proof: bypassing this complete-caller clone made
    // `retains complete principal and expected access before an awaited snapshot selection`
    // receive organization_context_changed instead of the captured package.
    const retained = structuredClone(caller);
    return await observeCommitted(this.options.openConnection, async (snapshot) => {
      const organizations = new SqliteOrganizationAccess(
        snapshot,
        this.options.activeOrganizationOf(snapshot),
        this.options.now,
      );
      const resolved = await new SqliteCommandAccess(
        snapshot,
        organizations,
        new MachineCredentialRepository(snapshot, OPEN),
      ).resolve(retained);
      // Proof: omitting this resolver-refusal return made
      // `refuses current membership and selection changes through the actual observation resolver`
      // throw access.kind TypeError instead of typed refusal; fault expect count was unreported.
      if (!resolved.ok) return resolved;
      // Proof: using a fresh projection observation made
      // `keeps authority, parent and private projection on the first-SQL snapshot across a rival commit`
      // receive null instead of captured SECRET/alpha/Dev; no per-column/helper-lifetime proof.
      return { ok: true, value: await read(snapshot, resolved.access) };
    });
  }
}
