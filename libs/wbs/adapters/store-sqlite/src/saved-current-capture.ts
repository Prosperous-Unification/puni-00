import { scheduleInputOfCaptured } from '@wbs/core/module/saved-plans/saved-plan-schedule';
import type { ResourceAccess } from '@wbs/core/ports/organization-access';
import type { PlanInputReads } from '@wbs/core/ports/saved-plan-capture-values';
import type {
  CapturedScheduleAsk,
  OptimizedScheduleAsk,
  OptimizedScheduleRead,
} from '@wbs/core/ports/scheduler';
import type { SavedCurrentCapture } from '@wbs/core/ports/work-package-observation';
import type { WorkPackage } from '@wbs/core/ports/work-package-values';
import { authorizePackageAt } from '@wbs/core/service/authorize';
import { readSharedPeople, selectInfluencers } from '@wbs/core/service/shared-people';
import { ScheduleCycleError } from '@wbs/domain';
import { sql } from 'drizzle-orm';

import {
  AccessDecisionRepository,
  type PackageTargetRecord,
  readPackageOrganization,
  readPackageTargetRow,
} from './access-decisions';
import { capturedOptimizationReaderOf } from './captured-optimization-reader';
import { capturedSchedulerIn } from './captured-scheduler';
import { type LiveCaptureOptions, projectConnectedPlanIn } from './chain-snapshot';
import { captureConnectedComponentIn } from './connected-plan-capture';
import type { Drizzle } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { readPlanInputIn } from './saved-plan-capture';
import { readCapacityMode } from './shared-people-mode';
import { WorkPackageRepository } from './work-package';
import { WorkPackageRankRepository } from './work-package-rank';

/** Local input/cache evidence only; its installed Fast reader is invoked after the loan closes. */
export interface PreparedSavedLocal {
  readonly kind: 'local';
  readonly reads: PlanInputReads;
  readonly ask: CapturedScheduleAsk;
  /** Null means no configured adapter. Configured idle/pending states remain complete values. */
  readonly optimization: OptimizedScheduleRead | null;
}

type PreparedSavedCurrent =
  PreparedSavedLocal | Exclude<SavedCurrentCapture, { readonly kind: 'local' }>;

/** One immutable configuration owns both on-loan capture and post-loan local finishing. Neither method owns a connection. */
export interface SavedCurrentReader {
  captureIn(
    db: Drizzle,
    access: ResourceAccess,
    actorId: string,
    id: string,
    lifetime: ReadSnapshotLifetime,
  ): Promise<PreparedSavedCurrent | null>;
  finishLocal(
    captured: PreparedSavedLocal,
  ): Extract<SavedCurrentCapture, { readonly kind: 'local' }>;
}

/** Explicit unused/unconfigured purpose; ordinary non-current observation methods remain usable. */
export const refusingSavedCurrentCapture: SavedCurrentReader = {
  captureIn: () => Promise.reject(new Error('saved current capture is not configured')),
  finishLocal: () => {
    throw new Error('saved current capture is not configured');
  },
};

/**
 * Binds one saved-current purpose to exact read-only scheduling configuration.
 * Target admission belongs to the calling observation; graph admission and every cache lookup
 * borrow its same snapshot. Only local installed Fast/final selection follows loan settlement.
 * @throws on malformed selected trusted state, unavailable required evidence or unknown dependencies.
 */
export function createSavedCurrentCapture(options: LiveCaptureOptions): SavedCurrentReader {
  const schedulerOf = options.schedulerOf;
  // Proof: K01 — Aliasing the optimization configuration selected changed contract/budget and idle
  // metadata instead of the installed ready cache. Composite configuration retention only; later
  // detached/no-admission assertions were unreached. Observed in work-package-observation.db.test.ts,
  // "retains installed current cache configuration after its original contract and budget object
  // changes" (2026-11-15).
  const optimization = options.optimization === undefined ? undefined : { ...options.optimization };
  const connected = options.connected === undefined ? undefined : { ...options.connected };
  const captureRead = options.captureRead;
  const configured: LiveCaptureOptions = {
    schedulerOf,
    ...(optimization === undefined ? {} : { optimization }),
    ...(connected === undefined ? {} : { connected }),
    ...(captureRead === undefined ? {} : { captureRead }),
  };
  return {
    async captureIn(db, access, actorId, id, lifetime) {
      lifetime.assertOpen();
      if (access.kind === 'legacy') return await prepareLocal(db, access, id, lifetime);
      const decisions = new AccessDecisionRepository(db);
      const readable = await decisions.readablePackageIds(
        access.principal,
        access.scope.organizationId,
      );
      lifetime.assertOpen();
      const mode = readCapacityMode(db, access.scope.organizationId);
      const readableJson = JSON.stringify([...readable]);
      const selected = new Set([id]);
      let hasExternal = false;
      for (const memberId of selected) {
        lifetime.assertOpen();
        // Proof: C07 — Suppressing incident-edge discovery made the local input reader throw that
        // incoming-after-person requires connected capture. Capture never returned; the predicted
        // connected-kind and later component/scout assertions were unreached. Observed in
        // work-package-observation.db.test.ts, "captures alternating readable person and incoming
        // dependency closure without a rank cutoff" (2026-11-15).
        const edges = db.all<{
          predecessor: unknown;
          successor: unknown;
          organization_id: unknown;
        }>(sql`
          SELECT predecessor_work_package_id AS predecessor, successor_work_package_id AS successor, organization_id
          FROM external_dependency
          WHERE predecessor_work_package_id = ${memberId} OR successor_work_package_id = ${memberId}`);
        if (edges.length > 0) hasExternal = true;
        for (const edge of edges) {
          // Proof: E01 — Omitting selected-edge organization validation made the corrupt edge resolve
          // before the denied endpoint could reach downstream validation. The rejection flag failed;
          // its resolved payload was unobserved. Observed in work-package-observation.db.test.ts,
          // "rejects a selected current dependency whose organization alone contradicts both owned
          // endpoints" (2026-11-15).
          if (edge.organization_id !== access.scope.organizationId)
            throw new Error('selected saved-current dependency organization is inconsistent');
          for (const endpoint of [edge.predecessor, edge.successor]) {
            if (typeof endpoint !== 'string' || endpoint === '')
              throw new Error('selected saved-current dependency endpoint identity is malformed');
            if (selected.has(endpoint)) continue;
            const row = db
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
              LEFT JOIN work_package_organization mapping ON mapping.resource_id=wp.id
              LEFT JOIN project parent ON parent.id=wp.project_id
              WHERE wp.id=${endpoint}`,
              )
              .at(0);
            if (row === undefined)
              throw new Error('required saved-current dependency endpoint is absent');
            const organizationId = readPackageOrganization(endpoint, row.organization_id);
            // Proof: C04 — Omitting the required-endpoint foreign return reached its parent validator
            // before the opaque-null assertion. No private-settings or shared-decoder clause credit.
            // Observed in work-package-observation.db.test.ts, "conceals a valid foreign required
            // current endpoint before its own-parent conflict or private settings" (2026-11-15).
            if (organizationId !== access.scope.organizationId) return null;
            const target = readPackageTargetRow(row);
            const permission = await authorizePackageAt(
              decisions,
              access,
              target,
              actorId,
              'package.read',
            );
            lifetime.assertOpen();
            // Proof: C03 — Omitting required-endpoint package.read refusal decoded the hidden incoming
            // endpoint's private-invalid estimate method before the null assertion. Only the selected
            // incoming, non-held owner was observed. Observed in work-package-observation.db.test.ts,
            // "conceals a required hidden incoming current dependency before private capture"
            // (2026-11-15).
            if (!permission.ok) return null;
            selected.add(endpoint);
          }
        }
        if (mode === 'shared') {
          // Proof: C05 — Removing the readable-neighbor join condition admitted the hidden person
          // bridge and decoded private-invalid estimate method before the shared-result assertion.
          // Person-neighbor filtering only. Observed in work-package-observation.db.test.ts, "does not
          // traverse a hidden person-only bridge or let its external edge choose connected current
          // mode" (2026-11-15).
          const neighbors = db.all<{ workPackageId: string }>(sql`
            SELECT DISTINCT neighbor.work_package_id AS workPackageId
            FROM work_item member
            JOIN assignment held ON held.work_item_id=member.id
            JOIN assignment peer ON peer.person_id=held.person_id
            JOIN work_item neighbor ON neighbor.id=peer.work_item_id
            JOIN json_each(${readableJson}) readable ON readable.value=neighbor.work_package_id
            WHERE member.work_package_id=${memberId}`);
          for (const neighbor of neighbors) selected.add(neighbor.workPackageId);
        }
      }
      lifetime.assertOpen();
      if (hasExternal) {
        const captured = await captureConnectedComponentIn(
          db,
          access,
          id,
          selected,
          lifetime,
          captureRead,
        );
        lifetime.assertOpen();
        return await projectConnectedPlanIn(db, access, captured, configured, lifetime);
      }
      if (mode === 'isolated') return await prepareLocal(db, access, id, lifetime);
      const ranks = await new WorkPackageRankRepository(db, OPEN).orderIn(
        access.scope.organizationId,
      );
      lifetime.assertOpen();
      const packages = new WorkPackageRepository(db, OPEN, 'borrowed');
      const directory = new DirectoryRepository(db, OPEN);
      const candidates: { workPackage: WorkPackage; assignments: PlanInputReads['assignments'] }[] =
        [];
      for (const rank of ranks) {
        // Proof: C06 — Omitting the ranked-readable skip decoded private-invalid estimate method before
        // the shared-result assertion. The fault printed no expect count; rank/date policy was not
        // independently tested. Observed in work-package-observation.db.test.ts, "keeps hidden
        // unrelated ranked private settings outside current shared capture" (2026-11-15).
        if (!readable.has(rank.workPackageId)) continue;
        const workPackage = await packages.findInOrganization(
          rank.workPackageId,
          access.scope.organizationId,
        );
        lifetime.assertOpen();
        if (workPackage === null)
          throw new Error('saved-current rank names an absent owned package');
        const assignments = (await directory.assignmentsInWorkPackage(rank.workPackageId))
          .assignments;
        lifetime.assertOpen();
        candidates.push({ workPackage, assignments });
      }
      const members = selectInfluencers(candidates, id);
      if (members.length === 0) throw new Error('saved-current target rank is absent');
      const reads: PlanInputReads[] = [];
      for (const member of members) {
        const captured = await readPlanInputIn(
          db,
          member.workPackage.id,
          lifetime,
          captureRead,
          access,
        );
        lifetime.assertOpen();
        if (captured === null)
          throw new Error('saved-current influencer disappeared inside its snapshot');
        reads.push(captured);
      }
      const captured = readSharedPeople(
        reads,
        id,
        capturedSchedulerIn(db, configured, lifetime).scheduler,
      );
      lifetime.assertOpen();
      if (captured.kind === 'not_found')
        throw new Error('saved-current target disappeared from its shared capture');
      return captured;
    },
    finishLocal(captured) {
      const selected = captured.optimization;
      const reader =
        selected === null
          ? undefined
          : (ask: OptimizedScheduleAsk) => {
              // Proof: C11 — Omitting this whole cache-question guard let the wrong-package scheduler
              // ask resolve, failing the rejection flag. Only package identity was mutated; other
              // conjuncts have no independent credit. Observed in work-package-observation.db.test.ts,
              // "rejects an installed local scheduler that asks the detached cache about another
              // current package" (2026-11-15).
              if (
                ask.workPackageId !== captured.ask.workPackageId ||
                ask.input !== captured.ask.input ||
                ask.objective !== captured.ask.objective ||
                ask.enabled !== captured.ask.enabled
              )
                throw new Error('detached saved-current cache question changed');
              return selected;
            };
      try {
        return {
          kind: 'local',
          reads: captured.reads,
          scheduled: schedulerOf(reader).read(captured.ask),
        };
      } catch (cause: unknown) {
        // Proof: C18 — Omitting the non-cycle rethrow made the first thrown undefined resolve, failing
        // its rejection flag after unavailable/cycle positives. Later Error/CalendarRange controls were
        // unreached; resolved payload was unobserved. Observed in work-package-observation.db.test.ts,
        // "preserves local unavailable-before-Fast and models only cycle while retaining calendar and
        // unknown failures" (2026-11-15).
        if (!(cause instanceof ScheduleCycleError)) throw cause;
        return { kind: 'local', reads: captured.reads, scheduled: { kind: 'cycle' } };
      }
    },
  };

  async function prepareLocal(
    db: Drizzle,
    access: ResourceAccess,
    id: string,
    lifetime: ReadSnapshotLifetime,
  ): Promise<PreparedSavedLocal> {
    const reads = await readPlanInputIn(db, id, lifetime, captureRead, access);
    lifetime.assertOpen();
    if (reads === null)
      throw new Error('saved-current admitted local package disappeared inside its snapshot');
    const ask: CapturedScheduleAsk = {
      mode: 'capture',
      workPackageId: id,
      input: scheduleInputOfCaptured(reads),
      engine: reads.workPackage.scheduleEngine,
      objective: reads.workPackage.scheduleObjective,
      enabled: reads.workPackage.optimizationEnabled,
    };
    const selected =
      optimization === undefined ? null : capturedOptimizationReaderOf(db, optimization)(ask);
    lifetime.assertOpen();
    return { kind: 'local', reads, ask, optimization: selected };
  }
}
