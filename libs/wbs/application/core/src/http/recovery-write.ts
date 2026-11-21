import type { AuthenticatedUser } from '@wbs/contracts';
import type { Permission } from '@wbs/domain';

import type { WritingServices } from '../compose';
import type { AuthorityRefusal } from '../module/plan-commands/plan-commands.feature';
import type { CommandAccess } from '../ports/command-access';
import type { DependencyContext } from '../ports/dependency-context';
import { type EditAdmission, grantAdmission, LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import type {
  BeforeStepRemoval,
  BeforeStepWrite,
  BeforeWorkPackageUpdate,
  CapturedFanout,
} from '../ports/fanout-capture-store';
import type { ResourceAccess } from '../ports/organization-access';
import type { Scope, UnitOfWork } from '../ports/unit-of-work';
import type { Broadcaster, WorkPackageEvent } from '../ports/work-package-event';
import type { RecoveryAuditDetail } from '../ports/work-package-store';
import { authorizePackage } from '../service/authorize';
import {
  type CommittedFanoutDelivery,
  type CommittedWorkPackageEvent,
  recordCommittedFanout,
} from '../service/committed-fanout';
import { createDependencyContext } from '../service/dependency-context';

/** The source capabilities a scoped route needs for one audited dependent write. */
export interface RecoveryWriteBoundary {
  readonly commandAccess: CommandAccess;
  readonly uow: UnitOfWork;
  readonly batch: (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
    dependencies: DependencyContext,
    beforeWorkPackageUpdate?: BeforeWorkPackageUpdate,
    beforeStepRemoval?: BeforeStepRemoval,
    beforeStepWrite?: BeforeStepWrite,
  ) => WritingServices;
  readonly announcements: Broadcaster;
  readonly committedFanout?: CommittedFanoutDelivery;
}

/**
 * Classifies a scoped work package write inside its own unit of work, or runs a
 * legacy combined write under creator admission. A refusal rolls its audit
 * obligation back; events leave only after a committed write. Principals without
 * write scope are refused before opening the unit of work. Current package step
 * values require package.manage_settings; legacy dependent writes keep package.write.
 */
export async function runRecoveryWrite<T extends { readonly ok: boolean }>(
  boundary: RecoveryWriteBoundary,
  expectedAccess: ResourceAccess,
  workPackageId: string,
  actor: AuthenticatedUser,
  detail: RecoveryAuditDetail,
  perform: (services: WritingServices, access: ResourceAccess, actorId: string) => Promise<T>,
  refuse: (reason: 'not_found' | 'forbidden', permission?: Permission) => T,
): Promise<T | AuthorityRefusal> {
  // Proof: removing this snapshot admitted owning-account grants after queued machine evidence removal; queued step admission fault/restored pass, 2026-11-09.
  actor = structuredClone(actor);
  expectedAccess = structuredClone(expectedAccess);
  // Proof: removing this guard committed a direct read-only recovery removal and its audit (command-current-authority.controller.db.test.ts).
  if (!actor.scopes.includes('write')) return { ok: false, error: 'insufficient_scope' };
  const actorId = actor.id;
  const pending: { workPackageId: string; event: WorkPackageEvent }[] = [];
  let committed: readonly CommittedWorkPackageEvent[] = [];
  const outcome = await boundary.uow.run<T | AuthorityRefusal>(async (scope) => {
    // Proof: using request access instead returned 200 for queued step revocation in the mounted current-authority matrix.
    const resolved = await boundary.commandAccess.resolve({
      kind: 'human',
      principal: actor,
      expectedAccess,
    });
    if (!resolved.ok) return { commit: false, value: resolved };
    const access = resolved.access;
    // Proof (2026-09-28): forcing `ordinary` here made `refuses a super-admin
    // revoked after access resolution before step admission` return 200 instead
    // of 403 (1 fail). The earlier force-ordinary mutation made the mounted
    // recovery matrix find no audit, which proved audit presence only.
    if (access.kind === 'scoped') {
      const workPackage = await scope.stores.workPackages.findInOrganization(
        workPackageId,
        access.scope.organizationId,
      );
      if (workPackage === null) return { commit: false, value: refuse('not_found') };
      const decision = await authorizePackage(
        scope.stores.accessDecisions,
        access,
        workPackage,
        actorId,
        'step' in detail && detail.step === 'values' ? 'package.manage_settings' : 'package.write',
      );
      if (!decision.ok)
        return {
          commit: false,
          value: refuse(
            decision.reason,
            decision.reason === 'forbidden' ? decision.permission : undefined,
          ),
        };
    }
    // Proof (2026-09-28): granting `wrong-work-package` made mounted step recovery
    // answer 403 instead of 200; that established correct grant plumbing.
    // Removing work package equality, actor equality and expiry separately made
    // `scoped step service cannot borrow a recovery grant for another workPackage,
    // actor, or settled unit` fail through the real StepService (one fail each).
    const grant = access.kind === 'scoped' ? grantAdmission(workPackageId, actorId) : null;
    try {
      const captureState: { before: CapturedFanout | null; organizationId: string | null } = {
        before: null,
        organizationId: null,
      };
      const observesStepRemoval =
        access.kind === 'scoped' && 'step' in detail && detail.step === 'remove';
      const captureBeforeStepWrite: BeforeStepWrite | undefined =
        access.kind === 'scoped'
          ? async (addressed, currentActorId, currentAccess) => {
              if (
                addressed !== workPackageId ||
                currentActorId !== actorId ||
                currentAccess.kind !== 'scoped' ||
                currentAccess.scope.organizationId !== access.scope.organizationId
              )
                throw new Error('scoped recovery observation changed work package or authority');
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
                (captureState.before.observation.mode === 'shared' ||
                  captureState.before.dependency !== null) &&
                boundary.committedFanout === undefined
              )
                throw new Error('scoped step fan-out delivery is missing');
              return { ok: true };
            }
          : undefined;
      const beforeStepRemoval = observesStepRemoval ? captureBeforeStepWrite : undefined;
      const beforeStepWrite =
        'step' in detail &&
        (detail.step === 'add' || detail.step === 'rename' || detail.step === 'values')
          ? captureBeforeStepWrite
          : undefined;
      const dependencies = createDependencyContext(
        scope.stores,
        { workPackageId, actorId, access, admission: grant?.admission ?? LEGACY_EDIT_ADMISSION },
        () => undefined,
        { kind: 'raw' },
      );
      try {
        const services = boundary.batch(
          scope,
          {
            publish: (subscription, event) => {
              pending.push({ workPackageId: subscription, event });
              return Promise.resolve();
            },
            latestSeq: (subscription) => boundary.announcements.latestSeq(subscription),
          },
          grant?.admission ?? LEGACY_EDIT_ADMISSION,
          dependencies.context,
          undefined,
          // Proof: omitting this recovery-specific binding made injected second
          // event failure disappear: DELETE returned 204 instead of 500.
          beforeStepRemoval,
          beforeStepWrite,
        );
        // Proof: dropping the retained actor argument failed 'passes the retained actor into a queued step writer'; fault/restored pass, 2026-11-09.
        const written = await perform(services, access, actorId);
        if (written.ok && captureState.before !== null && captureState.organizationId !== null) {
          const capture = scope.fanoutCapture;
          if (capture === undefined) throw new Error('scoped step fan-out capture disappeared');
          const after = await capture.capture(captureState.organizationId);
          if (
            captureState.before.observation.mode === 'shared' ||
            captureState.before.dependency !== null
          ) {
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
        dependencies.close();
      }
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
      await boundary.announcements.publish(notice.workPackageId, notice.event);
  }
  return outcome;
}
