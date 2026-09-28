import type { WritingServices } from '../compose';
import { type EditAdmission, grantAdmission } from '../ports/edit-admission';
import type { ResourceAccess } from '../ports/organization-access';
import type { Broadcaster, ProjectEvent } from '../ports/project-event';
import type { RecoveryAuditDetail } from '../ports/project-store';
import type { Scope, UnitOfWork } from '../ports/unit-of-work';

/** The source capabilities a scoped route needs for one audited dependent write. */
export interface RecoveryWriteBoundary {
  readonly uow: UnitOfWork;
  readonly batch: (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
  ) => WritingServices;
  readonly announcements: Broadcaster;
}

/**
 * Classifies one scoped project write inside its own unit of work. A refusal
 * rolls its audit obligation back; events leave only after a committed write.
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
  if (access.kind !== 'scoped') throw new Error('recovery boundary requires scoped access');
  const pending: { projectId: string; event: ProjectEvent }[] = [];
  const outcome = await boundary.uow.run(async (scope) => {
    // Proof: forcing `ordinary` here skipped transactional classification;
    // `audits each super-admin step and marker recovery while keeping the creator`
    // found no audit record (0 pass, 1 fail); watched 2026-09-28.
    const admitted = await scope.stores.projects.admitEditInOrganization(
      projectId,
      access.scope.organizationId,
      actorId,
      detail,
    );
    // Proof: skipping this refusal let a non-creator member add a step to a
    // restricted project (200 instead of 403) in the mounted refusal case;
    // watched 2026-09-28.
    if (admitted === null || admitted === 'forbidden')
      return { commit: false, value: refuse(admitted === null ? 'not_found' : 'forbidden') };
    // Proof: granting `wrong-project` made the mounted step recovery answer
    // 403 instead of 200 (0 pass, 1 fail); watched 2026-09-28.
    const grant = grantAdmission(projectId, actorId);
    try {
      const services = boundary.batch(
        scope,
        {
          publish: (subscription, event) => {
            pending.push({ projectId: subscription, event });
            return Promise.resolve();
          },
          latestSeq: (subscription) => boundary.announcements.latestSeq(subscription),
        },
        grant.admission,
      );
      const written = await perform(services);
      return { commit: written.ok, value: written };
    } finally {
      grant.expire();
    }
  });
  if (outcome.ok) {
    // Proof: publishing inside the unit of work made `publishes a dependent
    // recovery only after its unit of work commits` observe publish before
    // commit (0 pass, 1 fail); watched 2026-09-28.
    for (const notice of pending)
      await boundary.announcements.publish(notice.projectId, notice.event);
  }
  return outcome;
}
