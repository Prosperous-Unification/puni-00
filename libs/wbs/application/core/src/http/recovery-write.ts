import type { WritingServices } from '../compose';
import { CREATOR_ADMISSION, type EditAdmission, grantAdmission } from '../ports/edit-admission';
import type {
  BeforeProjectUpdate,
  BeforeStepRemoval,
  CapturedFanout,
} from '../ports/fanout-capture-store';
import type { ResourceAccess } from '../ports/organization-access';
import type { Broadcaster, ProjectEvent } from '../ports/project-event';
import type { RecoveryAuditDetail } from '../ports/project-store';
import type { Scope, UnitOfWork } from '../ports/unit-of-work';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '../service/committed-fanout';

/** The source capabilities a scoped route needs for one audited dependent write. */
export interface RecoveryWriteBoundary {
  readonly uow: UnitOfWork;
  readonly batch: (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
    beforeProjectUpdate?: BeforeProjectUpdate,
    beforeStepRemoval?: BeforeStepRemoval,
  ) => WritingServices;
  readonly announcements: Broadcaster;
  readonly committedFanout?: CommittedFanoutDelivery;
}

/**
 * Classifies a scoped project write inside its own unit of work, or runs a
 * legacy combined write under creator admission. A refusal rolls its audit
 * obligation back; events leave only after a committed write.
 */
export async function runRecoveryWrite<T extends { readonly ok: boolean }>(
  boundary: RecoveryWriteBoundary,
  access: ResourceAccess,
  projectId: string,
  actorId: string,
  detail: RecoveryAuditDetail,
  perform: (services: WritingServices) => Promise<T>,
  refuse: (reason: 'not_found' | 'forbidden') => T,
): Promise<T> {
  const pending: { projectId: string; event: ProjectEvent }[] = [];
  let committed: readonly CommittedProjectEvent[] = [];
  const outcome = await boundary.uow.run(async (scope) => {
    // Proof (2026-09-28): forcing `ordinary` here made `refuses a super-admin
    // revoked after access resolution before step admission` return 200 instead
    // of 403 (1 fail). The earlier force-ordinary mutation made the mounted
    // recovery matrix find no audit, which proved audit presence only.
    const admitted =
      access.kind === 'scoped'
        ? await scope.stores.projects.admitEditInOrganization(
            projectId,
            access.scope.organizationId,
            actorId,
            detail,
          )
        : 'ordinary';
    // Proof: skipping this refusal let a non-creator member add a step to a
    // restricted project (200 instead of 403) in the mounted refusal case;
    // watched 2026-09-28.
    if (admitted === null || admitted === 'forbidden')
      return { commit: false, value: refuse(admitted === null ? 'not_found' : 'forbidden') };
    // Proof (2026-09-28): granting `wrong-project` made mounted step recovery
    // answer 403 instead of 200; that established correct grant plumbing.
    // Removing project equality, actor equality and expiry separately made
    // `scoped step service cannot borrow a recovery grant for another project,
    // actor, or settled unit` fail through the real StepService (one fail each).
    const grant = access.kind === 'scoped' ? grantAdmission(projectId, actorId) : null;
    try {
      const captureState: { before: CapturedFanout | null; organizationId: string | null } = {
        before: null,
        organizationId: null,
      };
      const observesStepRemoval =
        access.kind === 'scoped' && 'step' in detail && detail.step === 'remove';
      const beforeStepRemoval: BeforeStepRemoval | undefined = observesStepRemoval
        ? async (addressed, currentActorId, currentAccess) => {
            if (
              addressed !== projectId ||
              currentActorId !== actorId ||
              currentAccess.kind !== 'scoped' ||
              currentAccess.scope.organizationId !== access.scope.organizationId
            )
              throw new Error('scoped recovery observation changed project or authority');
            const capture = scope.fanoutCapture;
            if (capture === undefined) {
              if (scope.stores.livePlans !== undefined)
                throw new Error('scoped step fan-out capture is missing');
              return { ok: true };
            }
            captureState.organizationId = currentAccess.scope.organizationId;
            // Proof: injecting another auditing admission here made the mounted
            // scoped removal commit two step recovery records, expected one.
            captureState.before = await capture.capture(currentAccess.scope.organizationId);
            if (
              captureState.before.observation.mode === 'shared' &&
              boundary.committedFanout === undefined
            )
              throw new Error('scoped step fan-out delivery is missing');
            return { ok: true };
          }
        : undefined;
      const services = boundary.batch(
        scope,
        {
          publish: (subscription, event) => {
            pending.push({ projectId: subscription, event });
            return Promise.resolve();
          },
          latestSeq: (subscription) => boundary.announcements.latestSeq(subscription),
        },
        grant?.admission ?? CREATOR_ADMISSION,
        undefined,
        // Proof: omitting this recovery-specific binding made injected second
        // event failure disappear: DELETE returned 204 instead of 500.
        beforeStepRemoval,
      );
      const written = await perform(services);
      if (written.ok && captureState.before !== null && captureState.organizationId !== null) {
        const capture = scope.fanoutCapture;
        if (capture === undefined) throw new Error('scoped step fan-out capture disappeared');
        const after = await capture.capture(captureState.organizationId);
        if (captureState.before.observation.mode === 'shared') {
          const delivery = boundary.committedFanout;
          if (delivery === undefined) throw new Error('scoped step fan-out delivery is missing');
          committed = await recordCommittedFanout(
            scope.stores.eventLog,
            captureState.before,
            after,
            () => delivery.now(),
          );
        }
      }
      return { commit: written.ok, value: written };
    } finally {
      grant?.expire();
    }
  });
  if (outcome.ok) {
    if (committed.length > 0) {
      const delivery = boundary.committedFanout;
      if (delivery === undefined) throw new Error('scoped step fan-out delivery is missing');
      await delivery.deliverCommitted(committed);
    }
    // Proof: publishing inside the unit of work made `publishes a dependent
    // recovery only after its unit of work commits` observe publish before
    // commit (0 pass, 1 fail); watched 2026-09-28.
    for (const notice of pending)
      await boundary.announcements.publish(notice.projectId, notice.event);
  }
  return outcome;
}
