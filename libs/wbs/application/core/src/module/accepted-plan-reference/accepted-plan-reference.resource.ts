import { NO_ADMISSION } from '../../ports/edit-admission';
import type { RefusedOrganizationAccess } from '../../ports/organization-access';
import { subscriptionFor } from '../../ports/project-event';
import type { Scope } from '../../ports/unit-of-work';
import { createDependencyContext } from '../../service/dependency-context';
import { installPlanDocument } from '../plan-document/check';
import type {
  AdmittedReference,
  Denied,
  ReferenceAccess,
  ReferenceAddress,
  ReferenceComposition,
  ReferenceDecision,
  ReferenceTransaction,
  ScopedAccess,
} from './contract';

/** Uses the already admitted source to read the complete current document at the original clock instant. */
async function captureOrdinary(
  source: ReferenceComposition,
  scope: Scope,
  projectId: string,
  access: ScopedAccess,
  exportedAt: number,
) {
  const granted = { projectId, access, actorId: access.scope.userId, admission: NO_ADMISSION };
  const dependencies = createDependencyContext(scope.stores, granted, () => undefined, {
    kind: 'raw',
  });
  try {
    const services = source.batch(
      scope,
      {
        latestSeq: (project) => scope.stores.eventLog.latestSeq(subscriptionFor(project)),
        publish: () => Promise.reject(new Error('reference capture cannot publish a plan event')),
      },
      NO_ADMISSION,
      dependencies.context,
    );
    const { workItems, directory, calendarMarkers, projects } = services;
    const { planDocuments } = installPlanDocument({
      directory,
      markers: calendarMarkers,
      // Proof: Reading the wall clock during capture made "registers a scoped ordinary reference
      // and retrieves the immutable artifacts" fail. The faulted fixture received 409
      // `live_plan_changed` instead of 201 after the fixture advanced the clock.
      clock: { now: () => exportedAt },
      stepParallels: scope.stores.stepParallels,
      resourceFacts: workItems,
      measureFacts: workItems,
    });
    const captured = await workItems.exportWithin(projectId, access);
    switch (captured.kind) {
      // Proof: Serializing a connected capture as ordinary made "refuses valid v11 input after
      // connection" fail. The faulted fixture received 409 with `live_plan_changed` where the
      // fixture expected `connected_plan`.
      case 'connected':
        return { ok: false, error: 'connected_plan' } as const;
      case 'engine_unavailable':
        return { ok: false, error: 'live_plan_unavailable' } as const;
      case 'access_refused':
        return { ok: false, refusal: captured.refusal } satisfies RefusedOrganizationAccess;
      case 'not_found':
        throw new Error('authorized project disappeared inside reference capture');
      case 'shared':
        return acceptedDocument(
          planDocuments.exportCaptured(captured.project, captured.tree, captured.document),
        );
      case 'isolated': {
        const selected = await projects.readWithin(projectId, access);
        const tree = await workItems.treeWithin(projectId, access);
        if (selected === null || tree === null)
          throw new Error('authorized ordinary project disappeared inside reference capture');
        if ('kind' in tree) {
          if (tree.kind === 'access_refused')
            return { ok: false, refusal: tree.refusal } satisfies RefusedOrganizationAccess;
          return { ok: false, error: 'live_plan_unavailable' } as const;
        }
        return acceptedDocument(await planDocuments.export(selected.project, tree, access));
      }
    }
  } finally {
    dependencies.close();
  }
}

function acceptedDocument(
  exported: ReturnType<ReturnType<typeof installPlanDocument>['planDocuments']['exportCaptured']>,
) {
  // Proof: Ignoring the unavailable export result made "refuses an unavailable capture even when it
  // carries the prior valid document" fail. The faulted fixture received 201 with the expected lock
  // and one row instead of 409 after the real uncoded-step witness.
  if (!exported.ok) return { ok: false, error: 'live_plan_unavailable' } as const;
  return { ok: true, document: exported.value } as const;
}

export type OrdinaryCapture = Awaited<ReturnType<typeof captureOrdinary>>;

function rollback<Value>(value: Value): ReferenceDecision<Value> {
  return { commit: false, value };
}

/** Maps a borrowed writer turn to the admitted reference operations for one project. */
export function createReferenceTransaction(source: ReferenceComposition): ReferenceTransaction {
  return {
    run<Value>(
      projectId: string,
      caller: ReferenceAccess,
      address: ReferenceAddress,
      permission: 'read' | 'write',
      act: (admitted: AdmittedReference) => Promise<ReferenceDecision<Value>>,
    ): Promise<Value | Denied> {
      return source.uow.run<Value | Denied>(async (scope) => {
        // Proof: Reusing prequeue access made "rechecks queued browser credential changes inside the
        // writer" and one other named case fail. The faulted fixtures received 201 after browser
        // revocation and 200 with history after membership removal, both instead of 403.
        const current = await source.commandAccess.resolve({ kind: 'human', ...caller });
        if (!current.ok) return rollback(current);
        const { access } = current;
        // Proof: Omitting this check made "refuses a valid direct read-only registration inside the
        // writer" succeed and retain one row. Restoring it returned insufficient_scope and zero rows.
        if (!caller.principal.scopes.includes(permission))
          return rollback({ ok: false, error: 'insufficient_scope' });
        if (access.kind !== 'scoped') return rollback({ ok: false, error: 'forbidden' });
        const { organizationId } = access.scope;
        // Proof: Looking up the project without the organization made "conceals a foreign project on
        // both register and historical lookup" fail. The faulted fixture received 403 `forbidden` on
        // foreign POST instead of 404.
        const project = await scope.stores.projects.findInOrganization(projectId, organizationId);
        if (project === null) return rollback({ ok: false, error: 'not_found' });
        const store = scope.acceptedPlanReferences;
        if (store === undefined) throw new Error('accepted plan reference writer is missing');
        const selected = {
          organizationId,
          projectId,
          repository: address.repository,
          change: address.change,
        };
        return act({
          access,
          project,
          address: selected,
          readPolicy: () => store.readPolicy(),
          readActive: () => store.readActive(selected),
          readHistorical: (selector) => store.readHistorical(selected, selector),
          insert: (acceptance) => {
            store.insert({ ...acceptance, lock: { ...acceptance.lock, ...selected } });
          },
          captureOrdinary: (exportedAt) =>
            captureOrdinary(source, scope, projectId, access, exportedAt),
        });
      });
    },
  };
}
