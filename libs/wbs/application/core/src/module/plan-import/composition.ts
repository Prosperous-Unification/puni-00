import type { Clock } from '../../ports/clock';
import type { CommandAccess, CommandCaller } from '../../ports/command-access';
import { NO_ADMISSION } from '../../ports/edit-admission';
import {
  type ExternalDependencyAuthoring,
  type ExternalDependencyAuthoringSource,
  validateExternalDependencyAuthoring,
} from '../../ports/external-dependency-authoring';
import type { RefusedOrganizationAccess, ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Scheduler } from '../../ports/scheduler';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import {
  type CommittedFanoutDelivery,
  type CommittedProjectEvent,
  recordCommittedFanout,
} from '../../service/committed-fanout';
import {
  createDependencyContext,
  type OpenDependencyContext,
} from '../../service/dependency-context';
import {
  type ImportDecision,
  type ImportedPlan,
  ImportedPlanResource,
  type ImportGraphFactory,
  type ImportTransaction,
} from './imported-plan.resource';
import { ImportService } from './plan-import.feature';

/** Source capabilities used only while composing the import service. */
export interface PlanImportSource {
  /** Current persisted authority over this source's admitted writer, including explicit legacy callers. */
  commandAccess: CommandAccess;
  clock: Clock;
  /**
   * Explicit fixture authority or a production resolver invoked after writer admission.
   * Its reader remains bound to that scope; synthetic storage authority alone cannot
   * grant support to the dormant production binary.
   */
  externalDependencies:
    ExternalDependencyAuthoring | ((scope: Scope) => ExternalDependencyAuthoringSource);
  scheduler: Scheduler;
  uow: UnitOfWork;
  announcements: Broadcaster;
  batchServices: ImportGraphFactory;
  committedFanout?: CommittedFanoutDelivery;
}

function importTransaction(
  uow: UnitOfWork,
  commandAccess: CommandAccess,
  graphOver: ImportGraphFactory,
  externalDependencies: PlanImportSource['externalDependencies'],
  delivery?: CommittedFanoutDelivery,
): ImportTransaction {
  return {
    run: async <T>(
      caller: CommandCaller,
      forbidden: T,
      broadcast: Broadcaster,
      act: (plan: ImportedPlan, access: ResourceAccess) => Promise<ImportDecision<T>>,
    ): Promise<T | RefusedOrganizationAccess> => {
      const settled = await uow.run<{
        value: T | RefusedOrganizationAccess;
        delivery: {
          events: readonly CommittedProjectEvent[];
          transport: CommittedFanoutDelivery;
        } | null;
      }>(async (scope) => {
        // Proof: expected-access substitution and resolution before writer admission each admitted a queued revoked browser import (import-current-authority suite, 2026-10-22).
        const resolved = await commandAccess.resolve(caller);
        // Proof: collapsing this refusal into forbidden lost the exact queued removed-member body (2026-10-22).
        if (!resolved.ok) return { commit: false, value: { value: resolved, delivery: null } };
        const access = resolved.access;
        const actorId = caller.kind === 'human' ? caller.principal.id : caller.actorId;
        let observationOpen = true;
        const assertActive = () => {
          // Proof: omitting observation expiry failed retained-resource success/refusal/throw cases in scoped-import-dependencies.db.test.ts (2026-10-22).
          if (!observationOpen) throw new Error('import observation is closed');
        };
        let dependencies: OpenDependencyContext | undefined;
        const writes = new ImportedPlanResource(scope, {
          actorId,
          // Proof: independently binding expected access here, in the dependency context or callback failed the SQLite fresh-access observation (2026-10-22).
          access,
          externalDependencies:
            typeof externalDependencies === 'function'
              ? externalDependencies(scope)
              : externalDependencies,
          assertActive,
          contextFor: (projectId) => {
            assertActive();
            dependencies ??= createDependencyContext(
              scope.stores,
              {
                projectId,
                actorId,
                access,
                admission: NO_ADMISSION,
              },
              assertActive,
              { kind: 'raw' },
            );
            dependencies.context.assertUsable(projectId, actorId);
            return dependencies.context;
          },
        });
        try {
          if (access.kind === 'legacy') {
            const decision = await act(
              {
                writes,
                services: graphOver(scope, broadcast),
              },
              access,
            );
            return {
              commit: decision.commit,
              value: { value: decision.value, delivery: null },
            };
          }
          const capture = scope.fanoutCapture;
          // Proof: omitting authorizeImport from the borrowed source made
          // the mounted scoped import answer 500 before any capture/write.
          if (capture?.authorizeImport === undefined || delivery === undefined)
            throw new Error('scoped import lacks borrowed authority or fan-out delivery');
          // Proof: moving this below capture invokes the throwing capture spy after
          // a queued membership demotion instead of returning typed forbidden.
          const authority = await capture.authorizeImport(actorId, access);
          if (!authority.ok)
            return { commit: false as const, value: { value: forbidden, delivery: null } };
          const before = await capture.capture(access.scope.organizationId);
          const decision = await act(
            {
              writes,
              services: graphOver(scope, broadcast),
            },
            access,
          );
          if (!decision.commit)
            return { commit: false as const, value: { value: decision.value, delivery: null } };
          const after = await capture.capture(access.scope.organizationId);
          // Proof: reusing before as after lost the mounted (B,A) event;
          // omitting this record likewise left the durable event list empty.
          const events = await recordCommittedFanout(scope.stores.eventLog, before, after, () =>
            delivery.now(),
          );
          return {
            commit: true as const,
            value: { value: decision.value, delivery: { events, transport: delivery } },
          };
        } finally {
          // Proof: omitting close with the separate outer-observation dependency disabled failed all three retained-context cases; the dependency-only control passed (2026-10-22).
          dependencies?.close();
          observationOpen = false;
        }
      });
      if (settled.delivery !== null && settled.delivery.events.length > 0)
        await settled.delivery.transport.deliverCommitted(settled.delivery.events);
      return settled.value;
    },
  };
}

export function createImportService(source: PlanImportSource): ImportService {
  // Proof: omitting this validation failed missing/malformed required-capability construction cases (2026-10-22).
  if (typeof source.externalDependencies !== 'function')
    validateExternalDependencyAuthoring(source.externalDependencies);
  return new ImportService({
    clock: source.clock,
    scheduler: source.scheduler,
    announcements: source.announcements,
    transaction: importTransaction(
      source.uow,
      source.commandAccess,
      source.batchServices,
      source.externalDependencies,
      source.committedFanout,
    ),
  });
}
