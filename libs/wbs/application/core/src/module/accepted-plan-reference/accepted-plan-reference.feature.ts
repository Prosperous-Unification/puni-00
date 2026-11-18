import { canonicalJson } from '@shared/plan-reference';
import {
  type ActivePlanReference,
  type AuthenticatedUser,
  compileOrdinaryPlanReference,
  decodePlanReferenceBytes,
  type HistoricalPlanReference,
  PlanReferenceInputError,
  type RegisterPlanReference,
} from '@wbs/contracts';

import type { WritingServices } from '../../compose';
import type {
  AcceptedPlanReferenceStore,
  AcceptedReferenceScope,
  AcceptedReferenceSelector,
  PlanReferenceSubject,
} from '../../ports/accepted-plan-reference-store';
import type { Clock } from '../../ports/clock';
import type { CommandAccess } from '../../ports/command-access';
import type { DependencyContext } from '../../ports/dependency-context';
import { type EditAdmission, NO_ADMISSION } from '../../ports/edit-admission';
import {
  mayEditProjectWithin,
  type RefusedOrganizationAccess,
  type ResourceAccess,
} from '../../ports/organization-access';
import { type Broadcaster, subscriptionFor } from '../../ports/project-event';
import type { Project } from '../../ports/project-store';
import type { Decision, Scope, UnitOfWork } from '../../ports/unit-of-work';
import { createDependencyContext } from '../../service/dependency-context';
import { installPlanDocument } from '../plan-document/check';

type ScopedAccess = Extract<ResourceAccess, { kind: 'scoped' }>;
type ReferenceAddress = Pick<AcceptedReferenceScope, 'repository' | 'change'>;
interface Failure<Code extends string> {
  ok: false;
  error: Code;
}
type Denied = RefusedOrganizationAccess | Failure<'forbidden' | 'insufficient_scope' | 'not_found'>;
interface Success<Value> {
  ok: true;
  value: Value;
}
type Registered =
  | Success<ActivePlanReference>
  | Failure<
      | 'invalid_plan_artifacts'
      | 'unsupported_plan_version'
      | 'reference_changed'
      | 'live_plan_changed'
      | 'connected_plan'
      | 'live_plan_unavailable'
      | 'forbidden'
    >
  | RefusedOrganizationAccess;
type ReadReference = Success<ActivePlanReference | HistoricalPlanReference> | Failure<'not_found'>;

interface ReferenceComposition {
  uow: UnitOfWork;
  commandAccess: CommandAccess;
  batch: (
    scope: Scope,
    broadcast: Broadcaster,
    admission: EditAdmission,
    dependencies: DependencyContext,
  ) => Pick<WritingServices, 'workItems' | 'projects' | 'directory' | 'calendarMarkers'>;
}

interface ReferenceAccess {
  principal: AuthenticatedUser;
  expectedAccess: ResourceAccess;
}

function verifiedHuman(principal: AuthenticatedUser): PlanReferenceSubject | null {
  // Proof: Removing the delegation refusal made "admits the verified upstream human and refuses a
  // delegation carrying that same granted subject" fail. The faulted fixture received 201 and a
  // version-two lock instead of 403 `forbidden`.
  // Proof: Promoting machine or consent evidence to a first-party subject made "refuses a real
  // machine grant for an agent bound to the granted human account" and one other named case fail.
  // The faulted fixtures received 201 and a version-one lock instead of 403 `forbidden` in each
  // case.
  if (principal.delegation !== undefined) return null;
  const verifier = principal.authentication;
  switch (verifier?.kind) {
    case 'first_party':
      return { kind: verifier.kind, accountId: principal.id };
    case 'upstream':
      return { ...verifier, accountId: principal.id };
    // Proof: Accepting an unverified account as first-party made "refuses a scoped local identity
    // without direct sign-in verifier evidence" fail. The faulted fixture received 201 instead of
    // 403.
    default:
      return null;
  }
}

function rollback<Value>(value: Value): Decision<Value> {
  return { commit: false, value };
}

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

interface AdmittedReference {
  scope: Scope;
  access: ScopedAccess;
  project: Project;
  address: AcceptedReferenceScope;
  store: AcceptedPlanReferenceStore;
}

/** Registration and reads share WBS's writer and its current credential/project authority. */
export class AcceptedPlanReferences {
  constructor(
    private readonly source: ReferenceComposition,
    private readonly clock: Clock,
  ) {}

  /** Retains verified request evidence and the entire offer before borrowing a writer turn. */
  register(projectId: string, caller: ReferenceAccess, offered: RegisterPlanReference) {
    // Proof: Keeping the original caller alias made "retains direct register caller evidence after
    // alias replacement and revocation" fail. The faulted fixture received a successful
    // registration after alias replacement and revocation where the fixture expected
    // `no_active_organization`.
    // Proof: Keeping the original offer alias made "archives the original offer when the in-process
    // caller replaces its input while queued" fail. The faulted fixture received a different
    // version-one digest after replacing the queued offer.
    const retained = structuredClone({ caller, offered });
    return this.withScope<Registered>(
      projectId,
      retained.caller,
      retained.offered,
      'write',
      async ({ scope, access, project, address, store }) => {
        const subject = verifiedHuman(retained.caller.principal);
        // Proof: Skipping the current project edit check made "rechecks queued project access changes
        // inside the writer" fail. The faulted fixture received 201 for the queued viewer instead of
        // 403.
        if (subject === null || !mayEditProjectWithin(project, subject.accountId, access))
          return rollback({ ok: false, error: 'forbidden' });
        const policy = store.readPolicy();
        const scopeKey = canonicalJson(address);
        const subjectKey = canonicalJson(subject);
        if (
          !policy.grants.some(
            (grant) =>
              // Proof: Ignoring the grant operation made "refuses an operator when the readable policy
              // has wrong operation" fail. The faulted fixture received 201 instead of 403 with a
              // submit-only grant.
              grant.operation === 'accept_reference' &&
              // Proof: Ignoring the grant scope made "refuses an operator when the readable policy has
              // wrong organization" and 3 other named cases fail. The faulted fixtures received 201
              // instead of 403 for each different organization, project, repository and change.
              canonicalJson(grant.scope) === scopeKey &&
              // Proof: Ignoring the grant subject made "refuses an operator when the readable policy has
              // wrong subject" fail. The faulted fixture received 201 instead of 403 for a grant naming
              // someone else.
              canonicalJson(grant.subject) === subjectKey,
            // Proof: Continuing without a matching protected grant made "refuses an operator when the
            // readable policy has no grant" and one other named case fail. The faulted fixtures received
            // 201 instead of 403 for both empty and revoked policy grants.
          )
        )
          return rollback({ ok: false, error: 'forbidden' });
        const active = store.readActive(address);
        const expected = retained.offered.expected;
        // Proof: Allowing a version expectation without a current row made "requires both the exact
        // prior version and the complete reference digest" fail. The faulted fixture received 201
        // instead of 409 at the first versioned POST.
        const matches =
          active === null
            ? expected.kind === 'absent'
            : // Proof: Ignoring expected absence made "serializes competing writes expecting absent"
              // fail. The faulted fixture received two 201 statuses instead of 201 and 409.
              expected.kind === 'version' &&
              // Proof: Skipping the predecessor version check made "requires both the exact prior version
              // and the complete reference digest" fail. The faulted fixture received 201 with version
              // two instead of 409 in the first mismatch iteration.
              active.lock.version === expected.version &&
              // Proof: Skipping the predecessor digest check made "requires both the exact prior version
              // and the complete reference digest" fail. The faulted fixture received 201 with version
              // two instead of 409 in the second mismatch iteration.
              active.lock.referenceDigest === expected.referenceDigest;
        if (!matches) return rollback({ ok: false, error: 'reference_changed' });

        const { repository, change, planningCommit, sourceBaseCommit } = retained.offered;
        const { exportBytes, requirementsBytes, reference, tasks } = retained.offered;
        let compiled: ReturnType<typeof compileOrdinaryPlanReference>;
        try {
          compiled = compileOrdinaryPlanReference({
            exportBytes: decodePlanReferenceBytes(exportBytes),
            requirementsBytes: decodePlanReferenceBytes(requirementsBytes),
            repository,
            change,
            planningCommit,
            sourceBaseCommit,
          });
        } catch (cause) {
          if (cause instanceof PlanReferenceInputError)
            return rollback({ ok: false, error: cause.reason });
          throw cause;
        }
        // Proof: Skipping this check made the direct call in "refuses a non-finite submitted
        // task estimate at registration" throw instead of returning invalid_plan_artifacts.
        if (
          tasks.tasks.some(({ estimates }) =>
            estimates.some(
              ({ optimistic, realistic, pessimistic }) =>
                ![optimistic, realistic, pessimistic].every(Number.isFinite),
            ),
          )
        )
          return rollback({ ok: false, error: 'invalid_plan_artifacts' });
        if (
          // Proof: Ignoring the compiled project mismatch made "refuses a complete reference from a
          // different WBS project" fail. The faulted fixture received 409 `live_plan_changed` instead
          // of 400.
          compiled.document.project.id !== projectId ||
          // Proof: Removing the count comparison made "refuses a non-finite direct reference task
          // count at registration" throw instead of returning invalid_plan_artifacts.
          compiled.reference.taskCount !== reference.taskCount ||
          // Proof: Ignoring the recompiled reference mismatch made "refuses independently substituted
          // requirements under the offered v11 reference" and 4 other named cases fail. The faulted
          // fixtures received 201 instead of 400 in each of the five substitution cases.
          canonicalJson(compiled.reference) !== canonicalJson(reference) ||
          // Proof: Ignoring the recompiled tasks mismatch made "refuses independently substituted
          // tasks under the offered v11 reference" fail. The faulted fixture received 201 with
          // version one instead of 400.
          canonicalJson(compiled.tasks) !== canonicalJson(tasks)
        )
          return rollback({ ok: false, error: 'invalid_plan_artifacts' });
        const current = await captureOrdinary(
          this.source,
          scope,
          projectId,
          access,
          Date.parse(compiled.document.document.exportedAt),
        );
        if (!current.ok) return rollback(current);
        // Proof: Skipping comparison with the captured live document made "refuses a stale live
        // ordinary export after a work item edit" fail. The faulted fixture received 201 after a work
        // item edit instead of 409.
        // Proof: Comparing the original directory in place of the live one made "compares a
        // referenced directory rename outside the project revision" fail. The faulted fixture
        // received 201 after the referenced tag was renamed instead of 409.
        if (canonicalJson(current.document) !== canonicalJson(compiled.document))
          return rollback({ ok: false, error: 'live_plan_changed' });

        const lock = {
          ...address,
          version: (active?.lock.version ?? 0) + 1,
          referenceDigest: compiled.reference.referenceDigest,
        };
        const writeBasis = this.clock.newId();
        store.insert({
          lock,
          writeBasis,
          artifacts: {
            exportBytes,
            requirementsBytes,
            // Proof: Storing compared caller objects instead of compiler output made "archives the
            // artifact intent even when the caller mutates compared nested objects during capture"
            // fail. The faulted fixture received 500 instead of 200 on historical GET, with the
            // retained-artifact integrity report.
            reference: compiled.reference,
            tasks: compiled.tasks,
          },
          subject,
          acceptedAt: this.clock.now(),
          policyRevision: policy.revision,
        });
        return { commit: true, value: { ok: true, value: { lock, writeBasis } } };
      },
    );
  }

  /** Retains the requested lock selector and credential through the current read admission. */
  read(
    projectId: string,
    caller: ReferenceAccess,
    address: ReferenceAddress,
    selector?: AcceptedReferenceSelector,
  ) {
    // Proof: Keeping the original read address alias made "retains the original direct historical
    // address after a queued input alias changes" fail. The faulted fixture received `not_found`
    // after replacing the queued address where the fixture expected the original lock.
    // Proof: Keeping the original read caller alias made "retains direct read caller evidence after
    // alias replacement and revocation" fail. The faulted fixture received a successful historical
    // read after alias replacement and revocation where the fixture expected
    // `no_active_organization`.
    // Proof: Keeping the original read selector alias made "retains the original direct historical
    // selector after a queued input alias changes" fail. The faulted fixture received the
    // version-two lock and digest where the fixture expected version one.
    const retained = structuredClone({ caller, address, selector });
    return this.withScope<ReadReference>(
      projectId,
      retained.caller,
      retained.address,
      'read',
      ({ address: scope, store }) => {
        const reference =
          retained.selector === undefined
            ? store.readActive(scope)
            : store.readHistorical(scope, retained.selector);
        return Promise.resolve(
          rollback<ReadReference>(
            reference === null ? { ok: false, error: 'not_found' } : { ok: true, value: reference },
          ),
        );
      },
    );
  }

  private withScope<Value>(
    projectId: string,
    caller: ReferenceAccess,
    address: ReferenceAddress,
    permission: 'read' | 'write',
    act: (admitted: AdmittedReference) => Promise<Decision<Value>>,
  ): Promise<Value | Denied> {
    return this.source.uow.run<Value | Denied>(async (scope) => {
      // Proof: Reusing prequeue access made "rechecks queued browser credential changes inside the
      // writer" and one other named case fail. The faulted fixtures received 201 after browser
      // revocation and 200 with history after membership removal, both instead of 403.
      const current = await this.source.commandAccess.resolve({ kind: 'human', ...caller });
      if (!current.ok) return rollback(current);
      const { access } = current;
      // Proof: Omitting the writer scope check made "admits the verified upstream human and refuses
      // a delegation carrying that same granted subject" fail. The faulted fixture received 201
      // with a version-two registration for read-only POST instead of 403.
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
      return act({
        scope,
        access,
        project,
        store,
        address: {
          organizationId,
          projectId,
          repository: address.repository,
          change: address.change,
        },
      });
    });
  }
}
