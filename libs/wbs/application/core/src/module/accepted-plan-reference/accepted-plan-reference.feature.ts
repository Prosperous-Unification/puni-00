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

import type {
  AcceptedReferenceSelector,
  PlanReferenceSubject,
} from '../../ports/accepted-plan-reference-values';
import type { Clock } from '../../ports/clock';
import {
  mayEditProjectWithin,
  type RefusedOrganizationAccess,
} from '../../ports/organization-access';
import type {
  ReferenceAccess,
  ReferenceAddress,
  ReferenceDecision,
  ReferenceTransaction,
} from './contract';

interface Failure<Code extends string> {
  ok: false;
  error: Code;
}
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

function rollback<Value>(value: Value): ReferenceDecision<Value> {
  return { commit: false, value };
}

/** Registration and reads share WBS's writer and its current credential/project authority. */
export class AcceptedPlanReferences {
  constructor(
    private readonly transaction: ReferenceTransaction,
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
    return this.transaction.run<Registered>(
      projectId,
      retained.caller,
      retained.offered,
      'write',
      async (admitted) => {
        const { access, project, address } = admitted;
        const subject = verifiedHuman(retained.caller.principal);
        // Proof: Skipping the current project edit check made "rechecks queued project access changes
        // inside the writer" fail. The faulted fixture received 201 for the queued viewer instead of
        // 403.
        if (subject === null || !mayEditProjectWithin(project, subject.accountId, access))
          return rollback({ ok: false, error: 'forbidden' });
        const policy = admitted.readPolicy();
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
        const active = admitted.readActive();
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
        const current = await admitted.captureOrdinary(
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
        admitted.insert({
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
    return this.transaction.run<ReadReference>(
      projectId,
      retained.caller,
      retained.address,
      'read',
      (admitted) => {
        const reference =
          retained.selector === undefined
            ? admitted.readActive()
            : admitted.readHistorical(retained.selector);
        return Promise.resolve(
          rollback<ReadReference>(
            reference === null ? { ok: false, error: 'not_found' } : { ok: true, value: reference },
          ),
        );
      },
    );
  }
}
